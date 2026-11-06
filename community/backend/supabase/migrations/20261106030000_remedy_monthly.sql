-- A separate, default-empty release queue for scoped Remedy Brief subscriptions.
-- No grants, recipients, campaigns, templates, or approved editions are seeded.
create schema remedy_news;
revoke all on schema remedy_news from public, anon, authenticated;
create table remedy_news.editions (
  month date primary key check (extract(day from month)=1),
  send_at timestamptz not null,
  subject text not null check (length(subject) between 1 and 180 and subject !~ '[[:cntrl:]]'),
  body text not null check (length(trim(body)) between 1 and 40000),
  approved_by text not null check (length(trim(approved_by)) between 1 and 200),
  released_at timestamptz not null default now(),
  paused boolean not null default false,
  check (month=date_trunc('month',send_at at time zone 'America/New_York')::date)
);
create table remedy_news.jobs (
  id uuid primary key default gen_random_uuid(),
  month date references remedy_news.editions(month),
  registry_id uuid not null references public.kapukai_interest_registry(id),
  grant_id uuid not null,
  recipient text not null,
  state text not null default 'queued' check(state in ('queued','dispatching','accepted','failed','unknown','skipped')),
  started_at timestamptz,
  provider_id text,
  unique(month,recipient)
);
alter table remedy_news.editions enable row level security;
alter table remedy_news.jobs enable row level security;
revoke all on all tables in schema remedy_news from public,anon,authenticated;
create view remedy_news.eligible as
 select distinct on (lower(trim(r.email))) r.id, lower(trim(r.email)) email, s.last_intent_id grant_id
 from public.kapukai_interest_registry r join public.kapukai_scoped_subscriptions s on r.id=s.registry_id
 where s.topic='remedy_brief' and s.cadence='monthly' and s.state='confirmed' and s.confirmed_at is not null
 and s.revoked_at is null and s.last_intent_id is not null
 and r.status not in ('suppressed','unsubscribed') and not exists(
 select from public.kapukai_crm_outbox o where lower(trim(o.email))=lower(trim(r.email)) and o.hubspot_email_optout)
 order by lower(trim(r.email)),s.confirmed_at desc,r.id;

-- Operator-only, transactionally freeze the approved edition and exact audience.
create function remedy_news.release(p_month date,p_send_at timestamptz,p_subject text,p_body text,p_approved_by text)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_month<date_trunc('month',now() at time zone 'America/New_York')::date then raise exception 'Edition month has passed';end if;
 insert into remedy_news.editions(month,send_at,subject,body,approved_by) values(p_month,p_send_at,p_subject,p_body,p_approved_by);
 insert into remedy_news.jobs(month,registry_id,grant_id,recipient) select p_month,id,grant_id,email from remedy_news.eligible;
 get diagnostics n=row_count;return n;
end $$;
revoke all on function remedy_news.release(date,timestamptz,text,text,text) from public,anon,authenticated,service_role;

-- Claim a single row immediately before sending. A new grant will not revive an old edition.
create function public.kapukai_monthly_next() returns table(job_id uuid, recipient text, edition_month date, subject text, body text)
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select from public.kapukai_interest_lifecycle_config where id=1 and mode='live' and postmark_ready_at is not null) then return;end if;
 update remedy_news.jobs j set state='skipped' from remedy_news.editions e where j.month=e.month and j.state='queued'
  and (j.month<date_trunc('month',now() at time zone 'America/New_York')::date or not exists(select from remedy_news.eligible a where a.id=j.registry_id and a.email=j.recipient and a.grant_id=j.grant_id));
 return query with candidate as (
   select j.id from remedy_news.jobs j join remedy_news.editions e using(month) join remedy_news.eligible a on a.id=j.registry_id and a.grant_id=j.grant_id and a.email=j.recipient
   where j.state='queued' and not e.paused and e.send_at<=now()
     and j.month=date_trunc('month',now() at time zone 'America/New_York')::date order by j.id for update of j skip locked limit 1),
 claimed as (update remedy_news.jobs j set state='dispatching',started_at=now() from candidate c where c.id=j.id returning j.*)
 select c.id,c.recipient,c.month,e.subject,e.body from claimed c join remedy_news.editions e using(month);
end $$;
create function public.kapukai_monthly_finish(p_job uuid,p_result text,p_provider text) returns void
language plpgsql security definer set search_path='' as $$
declare r_id uuid;
begin
 if p_result not in ('failed','unknown','accepted') or (p_result='accepted' and nullif(trim(p_provider),'') is null) then raise exception 'Invalid outcome';end if;
 update remedy_news.jobs set state=p_result,provider_id=p_provider where id=p_job and state='dispatching' returning registry_id into r_id;
 if not found then return;end if;
 if p_result='accepted' then
 insert into public.kapukai_interest_delivery_events(registry_id,channel,provider,message_type,delivery_status,provider_message_id)
 values(r_id,'email','postmark','lifecycle_broadcast','accepted',p_provider);
 end if;
end $$;
revoke all on function public.kapukai_monthly_next(),public.kapukai_monthly_finish(uuid,text,text) from public,anon,authenticated;
grant execute on function public.kapukai_monthly_next(),public.kapukai_monthly_finish(uuid,text,text) to service_role;
create function public.kapukai_monthly_may_send(p_job uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if exists(select from remedy_news.jobs j join remedy_news.editions e using(month)
   join remedy_news.eligible a on a.id=j.registry_id and a.email=j.recipient and a.grant_id=j.grant_id
   where j.id=p_job and j.state='dispatching' and e.send_at<=now() and not e.paused
   and j.month=date_trunc('month',now() at time zone 'America/New_York')::date
   and exists(select from public.kapukai_interest_lifecycle_config where id=1 and mode='live' and postmark_ready_at is not null)) then return true;end if;
 update remedy_news.jobs set state='skipped' where id=p_job and state='dispatching';return false;
end $$;
revoke all on function public.kapukai_monthly_may_send(uuid) from public,anon,authenticated;
grant execute on function public.kapukai_monthly_may_send(uuid) to service_role;
