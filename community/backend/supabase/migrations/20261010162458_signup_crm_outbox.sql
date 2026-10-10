-- CRM is an operational contact mirror, never a marketing-consent authority.
-- All source reads and queue RPCs are service-role only. No network call occurs in a source transaction.
create schema if not exists private;

-- The service role must not gain SELECT on auth.users (passwords/tokens live there).
-- auth's trigger projects only these four contact/account facts.
create table private.kapukai_crm_accounts (
 id uuid primary key,email text,created_at timestamptz,email_confirmed_at timestamptz,deleted_at timestamptz
);
alter table private.kapukai_crm_accounts enable row level security;
revoke all on private.kapukai_crm_accounts from public,anon,authenticated;
grant select on private.kapukai_crm_accounts to service_role;
insert into private.kapukai_crm_accounts(id,email,created_at,email_confirmed_at,deleted_at)
select id,email,created_at,email_confirmed_at,deleted_at from auth.users;

create table public.kapukai_crm_config (
 id smallint primary key default 1 check(id=1),
 enabled boolean not null default false,
 credential_ready boolean not null default false,
 worker_last_seen timestamptz,
 worker_retry_after_at timestamptz,
 worker_error_code text,
 worker_token_hash text,
 updated_at timestamptz not null default now()
);
insert into public.kapukai_crm_config(id) values(1);

create table public.kapukai_crm_exclusions (
 email_hash text primary key,
 reason text not null check(reason in ('privacy_erasure','operator_exclusion')),
 hubspot_contact_id text,
 created_at timestamptz not null default now()
);

create table public.kapukai_crm_outbox (
 email text primary key check(email=lower(btrim(email))),
 generation bigint not null default 1,
 desired_hash text not null,
 state text not null default 'pending' check(state in ('pending','processing','synced','retry','blocked','failed')),
 hubspot_contact_id text,
 hubspot_email_optout boolean,
 hubspot_optout_observed_at timestamptz,
 synced_generation bigint not null default 0,
 attempt_count integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 lease_id uuid,
 claimed_generation bigint,
 lease_until timestamptz,
 last_error_code text,
 last_synced_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index kapukai_crm_due on public.kapukai_crm_outbox(next_attempt_at) where state in ('pending','retry','processing');
create unique index kapukai_crm_contact_identity on public.kapukai_crm_outbox(hubspot_contact_id) where hubspot_contact_id is not null;
alter table public.kapukai_crm_config enable row level security;
alter table public.kapukai_crm_exclusions enable row level security;
alter table public.kapukai_crm_outbox enable row level security;
revoke all on public.kapukai_crm_config,public.kapukai_crm_exclusions,public.kapukai_crm_outbox from public,anon,authenticated;
grant select,insert,update,delete on public.kapukai_crm_config,public.kapukai_crm_exclusions,public.kapukai_crm_outbox to service_role;
grant usage on schema private to service_role;

create function private.kapukai_crm_normalize(p_email text) returns text
language sql immutable set search_path='' as $$
 select case when length(btrim(p_email)) between 3 and 254
  and btrim(p_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then lower(btrim(p_email)) else null end
$$;
create function private.kapukai_crm_email_hash(p_email text) returns text
language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(private.kapukai_crm_normalize(p_email),'UTF8')),'hex')
$$;
create function private.kapukai_crm_synthetic(p_email text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(split_part(private.kapukai_crm_normalize(p_email),'@',2)
  ~ '(^|\.)(example\.(com|org|net)|invalid|test|localhost)$',true)
$$;

-- Fixed allowlist projection: no free text, application kind, case notes, tokens or IDs.
create function private.kapukai_crm_snapshot(p_email text) returns jsonb
language sql stable set search_path='' as $$
 with target as (select private.kapukai_crm_normalize(p_email) as email),
 identities as (
  select r.* from public.kapukai_interest_registry r,target t where lower(btrim(r.email))=t.email
 ), sources as (
  select 'interest_registry'::text as source,r.full_name::text as name,r.organization::text as company,
   r.created_at as signup_at,r.email_confirmed_at is not null as verified,
   (r.status='pending' and cardinality(r.interests)>0 and not exists(select 1 from public.kapukai_interest_confirmations c where c.registry_id=r.id and c.confirmed_at is null and c.expires_at<=now())) as pending,
   (r.status='pending' and cardinality(r.interests)>0 and exists(select 1 from public.kapukai_interest_confirmations c where c.registry_id=r.id and c.confirmed_at is null and c.expires_at<=now())) as expired,
   r.status='unsubscribed' as withdrawn,r.status in ('suppressed','unsubscribed') as suppressed,
   null::timestamptz as withdrawal_at
  from identities r
  union all
  select 'community_preferences',null,null,i.requested_at,i.state='confirmed',
   i.state='pending' and i.expires_at>now(),i.state='pending' and i.expires_at<=now(),
   i.state='unsubscribed',false,null
  from public.kapukai_scoped_intents i join identities r on r.id=i.registry_id
  union all
  select 'community_application',null,null,a.created_at,a.confirmed_at is not null,
   a.state='awaiting_email' and a.expires_at>now(),a.state='awaiting_email' and a.expires_at<=now(),
   a.state='withdrawn',false,a.withdrawn_at
  from public.kapukai_applications a join identities r on r.id=a.registry_id
  union all
  select 'public_assurance',a.display_name,null,a.created_at,a.confirmed_at is not null,
   a.status='pending' and a.expires_at>now(),a.status='pending' and a.expires_at<=now(),
   a.status='unsubscribed',false,null
  from public.assurance_connections a,target t where lower(btrim(a.email))=t.email
  union all
  select 'connection',c.display_name,c.organization,c.created_at,c.confirmed_at is not null,
   false,false,false,false,null
  from public.kapukai_connections c,target t where lower(btrim(c.email))=t.email
  union all
  select 'connection_request',null,null,c.created_at,false,
   c.used_at is null and c.expires_at>now(),c.used_at is null and c.expires_at<=now(),false,false,null
  from public.kapukai_connection_requests c,target t where lower(btrim(c.email))=t.email
  union all
  select 'account',null,null,u.created_at,u.email_confirmed_at is not null,
   u.email_confirmed_at is null,false,false,false,null
  from private.kapukai_crm_accounts u,target t where lower(btrim(u.email))=t.email and u.deleted_at is null
 ), topic_rows as (
  select 'scoped:'||s.topic as topic
  from public.kapukai_scoped_subscriptions s join identities r on r.id=s.registry_id
  where s.state='confirmed' and r.status not in ('suppressed','unsubscribed')
  union
  select 'legacy:'||x.topic from identities r cross join lateral unnest(r.interests) as x(topic)
  where r.status='subscribed' and r.email_confirmed_at is not null
  union
  select 'assurance:'||x.topic from public.assurance_connections a
   cross join lateral unnest(a.topics) as x(topic),target t
  where lower(btrim(a.email))=t.email and a.status='confirmed'
  union
  select 'connection:'||x.topic from public.kapukai_connections c
   cross join lateral unnest(c.subscriptions) as x(topic),target t
  where lower(btrim(c.email))=t.email and c.confirmed_at is not null
 ), source_state_rows as (
  select case when cardinality(r.interests)=0 then 'identity:recorded'
   else 'legacy:'||case when r.status='pending' and exists(select 1 from public.kapukai_interest_confirmations c where c.registry_id=r.id and c.confirmed_at is null and c.expires_at<=now()) then 'expired'
    when r.status in ('pending','subscribed','unsubscribed','suppressed') then r.status else 'unknown' end end as tag
  from identities r
  union
  select 'preferences:'||case when i.state='pending' and i.expires_at<=now() then 'expired'
   when i.state in ('pending','confirmed','unsubscribed','canceled') then i.state else 'unknown' end
  from (select distinct on (i.registry_id) i.* from public.kapukai_scoped_intents i
   join identities r on r.id=i.registry_id order by i.registry_id,i.requested_at desc,i.id desc)i
  union
  select 'application:'||case when a.state='awaiting_email' and a.expires_at<=now() then 'expired'
   when a.state='withdrawn' then 'withdrawn'
   when coalesce(w.stage,a.state) in ('awaiting_email','awaiting_human_review','queue','reviewing','clarification','waitlisted','declined','offered','accepted','in_progress','delivered','correction_requested','closed','withdrawn') then coalesce(w.stage,a.state) else 'unknown' end
  from public.kapukai_applications a join identities r on r.id=a.registry_id
   left join public.kapukai_workshop_workflows w on w.application_id=a.id
  union
  select 'assurance:'||case when a.status='pending' and a.expires_at<=now() then 'expired'
   when a.status in ('pending','confirmed','unsubscribed','suppressed') then a.status else 'unknown' end
  from public.assurance_connections a,target t where lower(btrim(a.email))=t.email
  union
  select 'connection:'||case when c.confirmed_at is not null then 'confirmed' else 'pending' end
  from public.kapukai_connections c,target t where lower(btrim(c.email))=t.email
  union
  select 'connection_request:'||case when c.used_at is not null then 'completed' when c.expires_at<=now() then 'expired' else 'pending' end
  from public.kapukai_connection_requests c,target t where lower(btrim(c.email))=t.email
  union
  select 'account:'||case when u.email_confirmed_at is not null then 'verified' else 'unverified' end
  from private.kapukai_crm_accounts u,target t where lower(btrim(u.email))=t.email and u.deleted_at is null
 ), source_states as (
  select coalesce(jsonb_agg(tag order by tag),'[]'::jsonb) as values from source_state_rows
 ), facts as (
  select count(*)>0 as present,coalesce(bool_or(verified),false) as verified,
   coalesce(bool_or(suppressed),false) as suppressed,
   coalesce(bool_or(pending),false) as pending,coalesce(bool_or(expired),false) as expired,
   coalesce(bool_or(withdrawn),false) as withdrawn,max(signup_at) as latest_signup,
   max(withdrawal_at) as latest_withdrawal,
   coalesce(jsonb_agg(distinct source order by source),'[]'::jsonb) as sources,
   (array_agg(nullif(btrim(name),'') order by signup_at desc) filter(where nullif(btrim(name),'') is not null))[1] as name,
   (array_agg(nullif(btrim(company),'') order by signup_at desc) filter(where nullif(btrim(company),'') is not null))[1] as company
  from sources
 ), exclusion as (
  select exists(select 1 from public.kapukai_crm_exclusions e where e.email_hash=private.kapukai_crm_email_hash(p_email)) as excluded
 ), topics as (
  select coalesce(jsonb_agg(topic order by topic),'[]'::jsonb) as values from topic_rows
 ), withdrawal as (
  select max(s.revoked_at) as at from public.kapukai_scoped_subscriptions s join identities r on r.id=s.registry_id
 )
 select jsonb_build_object(
  'email',t.email,'name',case when e.excluded then null else left(f.name,200) end,
  'company',case when e.excluded then null else left(f.company,200) end,
  'signup_sources',case when e.excluded then '[]'::jsonb else f.sources end,
  'source_states',case when e.excluded then '[]'::jsonb else source_states.values end,
  'source_present',f.present and not e.excluded,
  'suppressed',f.suppressed or e.excluded or not f.present,
  'email_verified',f.verified and not e.excluded,
  'confirmed_topics',case when e.excluded then '[]'::jsonb else topics.values end,
  'consent_status',case when e.excluded or f.suppressed then 'suppressed'
    when not f.present then 'removed' when jsonb_array_length(topics.values)>0 then 'confirmed_topics'
    when f.withdrawn then 'withdrawn' when f.pending then 'pending'
    when f.expired then 'expired' else 'contact_only' end,
  'latest_signup_at',case when e.excluded then null else f.latest_signup end,
  'latest_withdrawal_at',case when e.excluded then null else greatest(f.latest_withdrawal,w.at) end
 ) from target t cross join facts f cross join exclusion e cross join topics cross join withdrawal w cross join source_states
$$;

create function private.kapukai_crm_enqueue(p_email text,p_force boolean default false) returns boolean
language plpgsql set search_path='' as $$
declare v_email text:=private.kapukai_crm_normalize(p_email);v_hash text;v_excluded boolean;
begin
 if v_email is null or private.kapukai_crm_synthetic(v_email) then return false;end if;
 select exists(select 1 from public.kapukai_crm_exclusions where email_hash=private.kapukai_crm_email_hash(v_email)) into v_excluded;
 if v_excluded and not p_force and not exists(select 1 from public.kapukai_crm_outbox where email=v_email) then return false;end if;
 v_hash:=encode(sha256(convert_to(private.kapukai_crm_snapshot(v_email)::text,'UTF8')),'hex');
 insert into public.kapukai_crm_outbox(email,desired_hash) values(v_email,v_hash)
 on conflict(email) do update set desired_hash=excluded.desired_hash,
  generation=public.kapukai_crm_outbox.generation+1,
  state=case when public.kapukai_crm_outbox.lease_id is not null and public.kapukai_crm_outbox.lease_until>now() then 'processing' else 'pending' end,
  next_attempt_at=now(),updated_at=now()
 where p_force or public.kapukai_crm_outbox.desired_hash<>excluded.desired_hash;
 return found;
end $$;

-- Narrow SECURITY DEFINER is required for auth's supabase_auth_admin writer.
-- This fixed-table trigger cannot be called as an RPC; no public or client role can execute it.
create function private.kapukai_crm_source_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_old jsonb;v_new jsonb;v_email text;
begin
 if not ((tg_table_schema='public' and tg_table_name in ('kapukai_interest_registry','kapukai_interest_confirmations','kapukai_scoped_intents','kapukai_scoped_subscriptions','kapukai_applications','kapukai_workshop_workflows','assurance_connections','kapukai_connections','kapukai_connection_requests'))
  or (tg_table_schema='auth' and tg_table_name='users')) then raise exception 'UNSUPPORTED_CRM_SOURCE';end if;
 if tg_op<>'INSERT' then v_old:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then v_new:=to_jsonb(new);end if;
 if tg_table_schema='auth' then
  if tg_op='DELETE' then
   delete from private.kapukai_crm_accounts where id=(v_old->>'id')::uuid;
  else
   insert into private.kapukai_crm_accounts(id,email,created_at,email_confirmed_at,deleted_at)
   values((v_new->>'id')::uuid,v_new->>'email',(v_new->>'created_at')::timestamptz,
    (v_new->>'email_confirmed_at')::timestamptz,(v_new->>'deleted_at')::timestamptz)
   on conflict(id) do update set email=excluded.email,created_at=excluded.created_at,
    email_confirmed_at=excluded.email_confirmed_at,deleted_at=excluded.deleted_at;
  end if;
 end if;
 for v_email in
  select distinct private.kapukai_crm_normalize(email) as email from (
   select v_old->>'email' as email union all select v_new->>'email'
   union all select r.email from public.kapukai_interest_registry r
    where r.id::text in (v_old->>'registry_id',v_new->>'registry_id')
   union all select r.email from public.kapukai_applications a join public.kapukai_interest_registry r on r.id=a.registry_id
    where a.id::text in(v_old->>'application_id',v_new->>'application_id')
  ) emails where private.kapukai_crm_normalize(email) is not null order by email
 loop perform private.kapukai_crm_enqueue(v_email);end loop;
 return coalesce(new,old);
end $$;

create trigger kapukai_crm_registry after insert or update or delete on public.kapukai_interest_registry for each row execute function private.kapukai_crm_source_changed();
create trigger kapukai_crm_legacy_confirmations after insert or update or delete on public.kapukai_interest_confirmations for each row execute function private.kapukai_crm_source_changed();
create trigger kapukai_crm_intents after insert or update or delete on public.kapukai_scoped_intents for each row execute function private.kapukai_crm_source_changed();
create trigger kapukai_crm_subscriptions after insert or update or delete on public.kapukai_scoped_subscriptions for each row execute function private.kapukai_crm_source_changed();
create trigger kapukai_crm_applications after insert or update or delete on public.kapukai_applications for each row execute function private.kapukai_crm_source_changed();
create trigger kapukai_crm_workshop after insert or update or delete on public.kapukai_workshop_workflows for each row execute function private.kapukai_crm_source_changed();
create trigger kapukai_crm_assurance after insert or update or delete on public.assurance_connections for each row execute function private.kapukai_crm_source_changed();
create trigger kapukai_crm_connections after insert or update or delete on public.kapukai_connections for each row execute function private.kapukai_crm_source_changed();
create trigger kapukai_crm_connection_requests after insert or update or delete on public.kapukai_connection_requests for each row execute function private.kapukai_crm_source_changed();
create trigger kapukai_crm_accounts after insert or update or delete on auth.users for each row execute function private.kapukai_crm_source_changed();

create function public.kapukai_crm_health() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'enabled',c.enabled,'credential_ready',c.credential_ready,'worker_last_seen',c.worker_last_seen,
  'worker_error_code',c.worker_error_code,
  'worker_retry_after_at',c.worker_retry_after_at,
  'counts',coalesce((select jsonb_object_agg(x.state,x.n) from(select state,count(*) as n from public.kapukai_crm_outbox group by state)x),'{}'::jsonb),
  'oldest_unsynced_at',(select min(created_at) from public.kapukai_crm_outbox where state<>'synced'),
  'oldest_due_at',(select min(next_attempt_at) from public.kapukai_crm_outbox where state<>'synced'),
  'last_success_at',(select max(last_synced_at) from public.kapukai_crm_outbox),
  'expired_leases',(select count(*) from public.kapukai_crm_outbox where state='processing' and lease_until<=now()),
  'suppression_observed',(select count(*) from public.kapukai_crm_outbox where hubspot_email_optout=true),
  'errors',coalesce((select jsonb_object_agg(x.last_error_code,x.n) from(select last_error_code,count(*) as n from public.kapukai_crm_outbox where last_error_code is not null group by last_error_code)x),'{}'::jsonb)
 ) from public.kapukai_crm_config c where id=1
$$;
create function public.kapukai_crm_heartbeat(p_credential_ready boolean,p_error_code text default null,p_retry_after_seconds integer default null) returns jsonb language plpgsql set search_path='' as $$
begin
 if p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{1,80}$' then raise exception 'INVALID_ERROR_CODE';end if;
 update public.kapukai_crm_config set credential_ready=coalesce(p_credential_ready,false),worker_last_seen=now(),
  worker_retry_after_at=case when p_retry_after_seconds is not null then greatest(worker_retry_after_at,now()+make_interval(secs=>greatest(0,least(p_retry_after_seconds,86400)))) else worker_retry_after_at end,
  worker_error_code=case when p_credential_ready then p_error_code else coalesce(p_error_code,'CRM_CREDENTIAL_MISSING') end,updated_at=now() where id=1;
 return public.kapukai_crm_health();
end $$;
create function public.kapukai_crm_authorize_worker(p_token text) returns boolean language sql stable set search_path='' as $$
 select coalesce(length(p_token) between 32 and 256 and
  (select worker_token_hash from public.kapukai_crm_config where id=1)=encode(sha256(convert_to(p_token,'UTF8')),'hex'),false)
$$;

create function public.kapukai_crm_claim(p_limit integer default 10,p_lease_seconds integer default 120) returns jsonb
language plpgsql set search_path='' as $$
declare r public.kapukai_crm_outbox%rowtype;v_result jsonb:='[]'::jsonb;v_lease uuid;v_payload jsonb;v_hash text;
begin
 if not exists(select 1 from public.kapukai_crm_config where id=1 and enabled and credential_ready and (worker_retry_after_at is null or worker_retry_after_at<=now())) then return v_result;end if;
 for r in select * from public.kapukai_crm_outbox
  where (state in ('pending','retry') and next_attempt_at<=now()) or (state='processing' and lease_until<=now())
  order by next_attempt_at,email for update skip locked limit greatest(1,least(coalesce(p_limit,10),50))
 loop
  v_payload:=private.kapukai_crm_snapshot(r.email);
  v_hash:=encode(sha256(convert_to(v_payload::text,'UTF8')),'hex');
  if v_hash<>r.desired_hash then r.generation:=r.generation+1;end if;
  v_lease:=gen_random_uuid();
  update public.kapukai_crm_outbox set state='processing',desired_hash=v_hash,generation=r.generation,
   lease_id=v_lease,claimed_generation=r.generation,lease_until=now()+make_interval(secs=>greatest(30,least(coalesce(p_lease_seconds,120),600))),
   attempt_count=attempt_count+1,updated_at=now() where email=r.email;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('email',r.email,'generation',r.generation,
   'lease_id',v_lease,'hubspot_contact_id',r.hubspot_contact_id,'attempt_count',r.attempt_count+1,'payload',v_payload));
 end loop;
 return v_result;
end $$;
create function public.kapukai_crm_lease_current(p_email text,p_generation bigint,p_lease_id uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.kapukai_crm_outbox o where o.email=private.kapukai_crm_normalize(p_email)
  and exists(select 1 from public.kapukai_crm_config where id=1 and enabled and credential_ready)
  and o.state='processing' and o.lease_id=p_lease_id and o.claimed_generation=p_generation
  and o.generation=p_generation and o.lease_until>now()
  and o.desired_hash=encode(sha256(convert_to(private.kapukai_crm_snapshot(o.email)::text,'UTF8')),'hex'))
$$;
create function public.kapukai_crm_checkpoint(p_email text,p_generation bigint,p_lease_id uuid,p_contact_id text) returns boolean
language plpgsql set search_path='' as $$
begin
 if p_contact_id is null or p_contact_id !~ '^[0-9]{1,40}$' then raise exception 'INVALID_CONTACT_ID';end if;
 update public.kapukai_crm_outbox set hubspot_contact_id=p_contact_id,updated_at=now()
 where email=private.kapukai_crm_normalize(p_email) and state='processing' and lease_id=p_lease_id
  and claimed_generation=p_generation and (hubspot_contact_id is null or hubspot_contact_id=p_contact_id);
 return found;
end $$;
create function public.kapukai_crm_complete(p_email text,p_generation bigint,p_lease_id uuid,
 p_contact_id text default null,p_error_code text default null,p_retry_after_seconds integer default 60,
 p_outcome text default 'synced',p_hubspot_email_optout boolean default null) returns boolean
language plpgsql set search_path='' as $$
declare r public.kapukai_crm_outbox%rowtype;v_hash text;v_outcome text:=p_outcome;
begin
 if p_outcome not in ('synced','retry','blocked','failed') or p_outcome is null then raise exception 'INVALID_OUTCOME';end if;
 if p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{1,80}$' then raise exception 'INVALID_ERROR_CODE';end if;
 if p_contact_id is not null and p_contact_id !~ '^[0-9]{1,40}$' then raise exception 'INVALID_CONTACT_ID';end if;
 select * into r from public.kapukai_crm_outbox where email=private.kapukai_crm_normalize(p_email) for update;
 if not found or r.state<>'processing' or r.lease_id is distinct from p_lease_id or r.claimed_generation is distinct from p_generation then return false;end if;
 if p_contact_id is not null and r.hubspot_contact_id is not null and r.hubspot_contact_id<>p_contact_id then raise exception 'CONTACT_IDENTITY_CONFLICT';end if;
 v_hash:=encode(sha256(convert_to(private.kapukai_crm_snapshot(r.email)::text,'UTF8')),'hex');
 if v_hash<>r.desired_hash then r.generation:=r.generation+1;end if;
 if r.generation<>p_generation then v_outcome:='pending';end if;
 update public.kapukai_crm_outbox set
  hubspot_contact_id=coalesce(p_contact_id,hubspot_contact_id),
  hubspot_email_optout=coalesce(p_hubspot_email_optout,hubspot_email_optout),
  hubspot_optout_observed_at=case when p_hubspot_email_optout is not null then now() else hubspot_optout_observed_at end,
  state=v_outcome,generation=r.generation,desired_hash=v_hash,
  synced_generation=case when p_outcome='synced' then greatest(synced_generation,p_generation) else synced_generation end,
  last_synced_at=case when p_outcome='synced' then now() else last_synced_at end,
  attempt_count=case when p_outcome='synced' or v_outcome='pending' then 0 else attempt_count end,
  next_attempt_at=case when v_outcome='pending' then now() else now()+make_interval(secs=>greatest(0,least(coalesce(p_retry_after_seconds,60),86400))) end,
  last_error_code=case when p_outcome='synced' then null else coalesce(p_error_code,'CRM_UNSPECIFIED_ERROR') end,
  lease_id=null,lease_until=null,claimed_generation=null,updated_at=now()
 where email=r.email;
 -- Completed erasures retain only a one-way email hash and shared CRM identifier.
 if v_outcome='synced' and exists(select 1 from public.kapukai_crm_exclusions where email_hash=private.kapukai_crm_email_hash(r.email)) then
  update public.kapukai_crm_exclusions set hubspot_contact_id=coalesce(p_contact_id,r.hubspot_contact_id)
   where email_hash=private.kapukai_crm_email_hash(r.email);
  delete from public.kapukai_crm_outbox where email=r.email;
 end if;
 return true;
end $$;

create function public.kapukai_crm_reconcile() returns jsonb language plpgsql set search_path='' as $$
declare v_email text;v_changed integer:=0;
begin
 for v_email in select distinct private.kapukai_crm_normalize(email) as email from (
  select email from public.kapukai_interest_registry union all select email from public.assurance_connections
  union all select email from public.kapukai_connections union all select email from public.kapukai_connection_requests
  union all select email from private.kapukai_crm_accounts where deleted_at is null
  union all select email from public.kapukai_crm_outbox
 ) all_sources where private.kapukai_crm_normalize(email) is not null order by email
 loop
  if private.kapukai_crm_enqueue(v_email) then v_changed:=v_changed+1;end if;
 end loop;
 -- Refresh unchanged existing contacts daily to observe CRM-side global opt-outs/deletion.
 update public.kapukai_crm_outbox set state='pending',generation=generation+1,next_attempt_at=now(),updated_at=now()
 where state='synced' and last_synced_at<=now()-interval '24 hours';
 return jsonb_build_object('changed_sources',v_changed,'health',public.kapukai_crm_health());
end $$;
create function public.kapukai_crm_retry(p_email text default null) returns integer language plpgsql set search_path='' as $$
declare v_count integer;
begin
 update public.kapukai_crm_outbox set state='pending',attempt_count=0,next_attempt_at=now(),last_error_code=null,updated_at=now()
 where state in ('blocked','failed','retry') and (p_email is null or email=private.kapukai_crm_normalize(p_email));
 get diagnostics v_count=row_count;return v_count;
end $$;
create function public.kapukai_crm_exclude(p_email text,p_reason text default 'privacy_erasure') returns boolean language plpgsql set search_path='' as $$
declare v_email text:=private.kapukai_crm_normalize(p_email);
begin
 if v_email is null or p_reason not in ('privacy_erasure','operator_exclusion') or p_reason is null then raise exception 'INVALID_EXCLUSION';end if;
 insert into public.kapukai_crm_exclusions(email_hash,reason)
 values(private.kapukai_crm_email_hash(v_email),p_reason) on conflict(email_hash) do update set reason=excluded.reason;
 return private.kapukai_crm_enqueue(v_email,true);
end $$;

-- PostgreSQL grants new functions to PUBLIC by default. Explicitly close every new entry point.
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.proname like 'kapukai_crm_%'
 loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname<>'kapukai_crm_source_changed' then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;

comment on table public.kapukai_crm_outbox is 'Service-only email-deduplicated CRM mirror queue. This does not grant marketing consent or send email.';
comment on table public.kapukai_crm_exclusions is 'One-way email hashes prevent explicit erasure/exclusion from being resurrected by reconciliation. No source consent is modified.';
-- Initial backfill only queues work; the default-disabled config prevents external delivery.
select public.kapukai_crm_reconcile();
