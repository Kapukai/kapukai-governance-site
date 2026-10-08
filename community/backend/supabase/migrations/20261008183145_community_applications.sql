-- Separate applications reuse the existing identity; newsletter consent stays untouched.
-- No application can grant money, a volunteer role, membership or a credential.
begin;
create table public.kapukai_application_config (
 id smallint primary key check(id=1), enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into public.kapukai_application_config(id) values(1);
alter table public.kapukai_application_config enable row level security;
revoke all on public.kapukai_application_config from public,anon,authenticated,service_role;
grant select on public.kapukai_application_config to service_role;

create table public.kapukai_applications (
 id uuid primary key default gen_random_uuid(),
 registry_id uuid not null references public.kapukai_interest_registry(id),
 request_id uuid not null,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 kind text not null check(kind in ('assistance','reviewer','witness')),
 service_interest text not null check(service_interest in ('tools','timeline','evidence_dossier','affidavit_formatting','training','independent_review')),
 requested_support text check(requested_support in ('free','discounted')),
 display_alias text check(display_alias is null or (length(display_alias) between 1 and 60 and display_alias !~ '[[:cntrl:]<>@:/\\]')),
 profession text check(profession in ('engineering','education','research','administration','community','other','prefer_not_to_say')),
 availability text check(availability in ('occasional','monthly','weekly','unsure')),
 adult boolean not null check(adult),
 privacy_acknowledged boolean not null check(privacy_acknowledged),
 human_review_acknowledged boolean not null check(human_review_acknowledged),
 consent_version text not null check(consent_version='kapukai-applications-v1-2026-10-08'),
 source_path text not null check(source_path in ('/community/assistance','/community/reviewers','/community/apply')),
 state text not null default 'awaiting_email' check(state in ('awaiting_email','awaiting_human_review','withdrawn','closed')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '48 hours',
 manage_expires_at timestamptz not null default now()+interval '180 days',
 confirmed_at timestamptz,withdrawn_at timestamptz,updated_at timestamptz not null default now(),
 delivery_state text not null default 'pending' check(delivery_state in ('pending','accepted','failed','unknown')),
 provider_message_id text,
 unique(registry_id,request_id),
 check((kind='assistance' and requested_support is not null and profession is null and availability is null)
    or (kind in ('reviewer','witness') and requested_support is null)),
 check(manage_expires_at>expires_at)
);
create index kapukai_applications_review_queue on public.kapukai_applications(created_at) where state='awaiting_human_review';
alter table public.kapukai_applications enable row level security;
revoke all on public.kapukai_applications from public,anon,authenticated,service_role;
grant select,insert,update on public.kapukai_applications to service_role;

create table public.kapukai_application_events (
 id bigint generated always as identity primary key,
 application_id uuid not null references public.kapukai_applications(id),
 event_type text not null check(event_type in ('request','confirm','withdraw')),
 consent_version text not null check(consent_version='kapukai-applications-v1-2026-10-08'),
 created_at timestamptz not null default now(),
 unique(application_id,event_type)
);
alter table public.kapukai_application_events enable row level security;
revoke all on public.kapukai_application_events from public,anon,authenticated,service_role;
grant select,insert on public.kapukai_application_events to service_role;
revoke all on sequence public.kapukai_application_events_id_seq from public,anon,authenticated,service_role;
grant usage on sequence public.kapukai_application_events_id_seq to service_role;

create function public.kapukai_application_is_open()
 returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select enabled from public.kapukai_application_config where id=1),false);
$$;

create function public.kapukai_application_request(
 p_email text,p_token_hash text,p_request_id uuid,p_application jsonb,p_consent_version text,p_source_path text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_registry public.kapukai_interest_registry%rowtype; v_id uuid;
begin
 if not public.kapukai_application_is_open() then return jsonb_build_object('result','paused'); end if;
 if p_email is null or p_email<>lower(btrim(p_email)) or length(p_email)>254
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_request_id is null
    or p_consent_version is distinct from 'kapukai-applications-v1-2026-10-08'
    or p_source_path is null or p_source_path not in ('/community/assistance','/community/reviewers','/community/apply')
    or p_application is null or jsonb_typeof(p_application)<>'object' then raise exception 'INVALID_APPLICATION'; end if;
 if exists(select 1 from jsonb_object_keys(p_application) k where k not in ('kind','service_interest','requested_support','display_alias','profession','availability','adult','privacy_acknowledged','human_review_acknowledged'))
    or coalesce(p_application->>'kind','') not in ('assistance','reviewer','witness')
    or coalesce(p_application->>'service_interest','') not in ('tools','timeline','evidence_dossier','affidavit_formatting','training','independent_review')
    or p_application->'adult' is distinct from 'true'::jsonb
    or p_application->'privacy_acknowledged' is distinct from 'true'::jsonb
    or p_application->'human_review_acknowledged' is distinct from 'true'::jsonb
    or (p_application->>'display_alias' is not null and (jsonb_typeof(p_application->'display_alias')<>'string' or length(p_application->>'display_alias') not between 1 and 60 or p_application->>'display_alias' ~ '[[:cntrl:]<>@:/\\]'))
    or (p_application->>'profession' is not null and p_application->>'profession' not in ('engineering','education','research','administration','community','other','prefer_not_to_say'))
    or (p_application->>'availability' is not null and p_application->>'availability' not in ('occasional','monthly','weekly','unsure'))
    or (p_application->>'kind'='assistance' and (coalesce(p_application->>'requested_support','') not in ('free','discounted') or p_application->>'profession' is not null or p_application->>'availability' is not null))
    or (p_application->>'kind'<>'assistance' and p_application->>'requested_support' is not null)
 then raise exception 'INVALID_APPLICATION'; end if;
 -- Explicit pending and empty legacy interests leave legacy onboarding inert.
 insert into public.kapukai_interest_registry(email,interests,status,consent_version,source_path)
 values(p_email,array[]::text[],'pending',p_consent_version,p_source_path) on conflict(email) do nothing;
 select * into v_registry from public.kapukai_interest_registry where email=p_email for update;
 if v_registry.status in ('suppressed','unsubscribed') then return jsonb_build_object('result','suppressed'); end if;
 insert into public.kapukai_applications(registry_id,request_id,token_hash,kind,service_interest,requested_support,display_alias,profession,availability,adult,privacy_acknowledged,human_review_acknowledged,consent_version,source_path)
 values(v_registry.id,p_request_id,p_token_hash,p_application->>'kind',p_application->>'service_interest',p_application->>'requested_support',p_application->>'display_alias',p_application->>'profession',p_application->>'availability',true,true,true,p_consent_version,p_source_path)
 on conflict(registry_id,request_id) do nothing returning id into v_id;
 if v_id is null then return jsonb_build_object('result','duplicate'); end if;
 insert into public.kapukai_application_events(application_id,event_type,consent_version) values(v_id,'request',p_consent_version);
 return jsonb_build_object('result','created','application_id',v_id);
end $$;

create function public.kapukai_application_token(p_token_hash text,p_action text)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_application public.kapukai_applications%rowtype; v_registry public.kapukai_interest_registry%rowtype;
begin
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_action is null or p_action not in ('inspect','confirm','withdraw') then return jsonb_build_object('result','invalid'); end if;
 select * into v_application from public.kapukai_applications where token_hash=p_token_hash;
 if not found then return jsonb_build_object('result','invalid'); end if;
 -- Follow the existing registry-first lock order on every application mutation.
 select * into v_registry from public.kapukai_interest_registry where id=v_application.registry_id for update;
 select * into v_application from public.kapukai_applications where id=v_application.id for update;
 if v_application.manage_expires_at<=now() then return jsonb_build_object('result','expired'); end if;
 if p_action='inspect' then return jsonb_build_object('result','valid','state',v_application.state,
  'kind',v_application.kind,'service_interest',v_application.service_interest,'requested_support',v_application.requested_support,
  'consent_version',v_application.consent_version,
  'can_confirm',v_application.state='awaiting_email' and v_application.expires_at>now() and v_registry.status not in ('suppressed','unsubscribed') and public.kapukai_application_is_open(),
  'can_withdraw',v_application.state in ('awaiting_email','awaiting_human_review'),
  'blocked',v_registry.status in ('suppressed','unsubscribed'));
 end if;
 if p_action='confirm' then
  if not public.kapukai_application_is_open() then return jsonb_build_object('result','paused'); end if;
  if v_registry.status in ('suppressed','unsubscribed') then return jsonb_build_object('result','suppressed'); end if;
  if v_application.state='awaiting_human_review' then return jsonb_build_object('result','already_confirmed','state',v_application.state); end if;
  if v_application.state<>'awaiting_email' then return jsonb_build_object('result','used'); end if;
  if v_application.expires_at<=now() then return jsonb_build_object('result','expired'); end if;
  update public.kapukai_applications set state='awaiting_human_review',confirmed_at=now(),updated_at=now() where id=v_application.id;
  insert into public.kapukai_application_events(application_id,event_type,consent_version) values(v_application.id,'confirm',v_application.consent_version);
  return jsonb_build_object('result','confirmed','state','awaiting_human_review');
 end if;
 if v_application.state='closed' then return jsonb_build_object('result','used'); end if;
 if v_application.state<>'withdrawn' then
  update public.kapukai_applications set state='withdrawn',withdrawn_at=now(),updated_at=now() where id=v_application.id;
  insert into public.kapukai_application_events(application_id,event_type,consent_version) values(v_application.id,'withdraw',v_application.consent_version);
 end if;
 return jsonb_build_object('result','withdrawn','state','withdrawn');
end $$;

create function public.kapukai_application_mail_result(p_application_id uuid,p_state text,p_provider_message_id text default null)
 returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_state is null or p_state not in ('accepted','failed','unknown') then raise exception 'INVALID_DELIVERY_STATE'; end if;
 update public.kapukai_applications set delivery_state=p_state,provider_message_id=left(p_provider_message_id,200)
 where id=p_application_id and delivery_state='pending';
end $$;

revoke all on function public.kapukai_application_is_open() from public,anon,authenticated;
revoke all on function public.kapukai_application_request(text,text,uuid,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.kapukai_application_token(text,text) from public,anon,authenticated;
revoke all on function public.kapukai_application_mail_result(uuid,text,text) from public,anon,authenticated;
grant execute on function public.kapukai_application_is_open() to service_role;
grant execute on function public.kapukai_application_request(text,text,uuid,jsonb,text,text) to service_role;
grant execute on function public.kapukai_application_token(text,text) to service_role;
grant execute on function public.kapukai_application_mail_result(uuid,text,text) to service_role;
commit;
