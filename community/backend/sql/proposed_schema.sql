-- Reviewed candidate, NOT APPLIED. Create a normal migration with the current
-- Supabase CLI before adoption. Tested against an isolated Postgres-compatible
-- database fixture; never run tests against production.
begin;

create table public.kapukai_scoped_config (
 id smallint primary key check(id=1), enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into public.kapukai_scoped_config(id,enabled) values(1,false);
alter table public.kapukai_scoped_config enable row level security;
revoke all on public.kapukai_scoped_config from public,anon,authenticated;
grant select on public.kapukai_scoped_config to service_role;
create function public.kapukai_scoped_is_open() returns boolean language sql stable
 security invoker set search_path='' as $$
 select coalesce((select enabled from public.kapukai_scoped_config where id=1),false)
$$;
revoke all on function public.kapukai_scoped_is_open() from public,anon,authenticated;
grant execute on function public.kapukai_scoped_is_open() to service_role;

-- New scoped-only identities must not acquire a fictitious legacy interest.
alter table public.kapukai_interest_registry
  drop constraint kapukai_interest_values;
alter table public.kapukai_interest_registry
  add constraint kapukai_interest_values check (
    interests <@ array['updates','research_participant','institutional_pilot',
      'expert_contributor','funder_partner']::text[]
    and cardinality(interests) between 0 and 5
    and array_position(interests,null) is null
  );

create table public.kapukai_scoped_intents (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.kapukai_interest_registry(id) on delete cascade,
  request_id uuid not null,
  request_seq bigint generated always as identity,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  topics text[] not null check (
    cardinality(topics) between 1 and 2 and
    topics <@ array['tester_invites','remedy_brief']::text[] and
    array_position(topics,null) is null
  ),
  tool_interests text[] not null default array[]::text[] check (cardinality(tool_interests) between 0 and 3 and tool_interests <@ array['affidavit','timeline','evidence_dossier']::text[] and array_position(tool_interests,null) is null),
  newsletter_cadence text not null default 'monthly' check (newsletter_cadence in ('monthly','every_other_week')),
  consent_version text not null check (consent_version = 'kapukai-scoped-v1-2026-10-05'),
  source_path text not null check (source_path in ('/join','/testers','/newsletter')),
  state text not null default 'pending' check (state in ('pending','confirmed','unsubscribed','canceled')),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  manage_expires_at timestamptz not null default now() + interval '180 days',
  confirmed_at timestamptz,
  delivery_state text not null default 'pending' check (delivery_state in ('pending','accepted','failed','unknown')),
  provider_message_id text,
  unique(registry_id, request_id)
);
create index kapukai_scoped_intents_registry on public.kapukai_scoped_intents(registry_id);

create table public.kapukai_scoped_subscriptions (
  registry_id uuid not null references public.kapukai_interest_registry(id) on delete cascade,
  topic text not null check (topic in ('tester_invites','remedy_brief')),
  state text not null check (state in ('confirmed','unsubscribed')),
  tool_interests text[] not null default array[]::text[],
  cadence text not null check (cadence in ('event_based','monthly','every_other_week')),
  consent_version text not null,
  confirmed_at timestamptz not null,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  last_intent_id uuid not null references public.kapukai_scoped_intents(id),
  primary key(registry_id,topic)
);
create table public.kapukai_scoped_consent_events (
  id bigint generated always as identity primary key,
  registry_id uuid not null references public.kapukai_interest_registry(id) on delete cascade,
  intent_id uuid not null references public.kapukai_scoped_intents(id),
  event_type text not null check (event_type in ('request','confirm','revoke')),
  affected_grants jsonb not null default '[]'::jsonb check(jsonb_typeof(affected_grants)='array'),
  topics text[] not null,
  consent_version text not null,
  occurred_at timestamptz not null default now()
);
create unique index kapukai_scoped_once_per_activation
 on public.kapukai_scoped_consent_events(intent_id,event_type)
 where event_type in ('request','confirm');

alter table public.kapukai_scoped_intents enable row level security;
alter table public.kapukai_scoped_subscriptions enable row level security;
alter table public.kapukai_scoped_consent_events enable row level security;
revoke all on public.kapukai_scoped_intents,
 public.kapukai_scoped_subscriptions,public.kapukai_scoped_consent_events
 from public,anon,authenticated;
grant select,insert,update,delete on public.kapukai_scoped_intents,
 public.kapukai_scoped_subscriptions,public.kapukai_scoped_consent_events to service_role;
revoke all on sequence public.kapukai_scoped_consent_events_id_seq,public.kapukai_scoped_intents_request_seq_seq from public,anon,authenticated;
grant usage,select on sequence public.kapukai_scoped_consent_events_id_seq,public.kapukai_scoped_intents_request_seq_seq to service_role;

create function public.kapukai_scoped_request(
 p_email text,p_topics text[],p_token_hash text,p_request_id uuid,
 p_consent_version text,p_source_path text,p_newsletter_cadence text,p_tool_interests text[]
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_registry public.kapukai_interest_registry%rowtype;
 v_intent uuid;
 v_topics text[];
begin
 if p_email is null or p_email <> lower(btrim(p_email))
    or length(p_email) > 254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_token_hash !~ '^[0-9a-f]{64}$' or p_token_hash is null
    or p_tool_interests is null or cardinality(p_tool_interests) not between 0 and 3
    or not p_tool_interests <@ array['affidavit','timeline','evidence_dossier']::text[]
    or array_position(p_tool_interests,null) is not null
    or (cardinality(p_tool_interests)>0 and not 'tester_invites'=any(p_topics))
    or p_newsletter_cadence is null or p_newsletter_cadence not in ('monthly','every_other_week')
    or p_request_id is null
    or p_topics is null or cardinality(p_topics) not between 1 and 2
    or not p_topics <@ array['tester_invites','remedy_brief']::text[]
    or array_position(p_topics,null) is not null
    or p_consent_version is distinct from 'kapukai-scoped-v1-2026-10-05'
    or p_source_path is null or p_source_path not in ('/join','/testers','/newsletter') then
   raise exception 'INVALID_REQUEST';
 end if;
 select array_agg(distinct t order by t) into v_topics from unnest(p_topics) t;
 -- Explicit pending + no global confirmed_at: existing onboarding trigger is inert.
 insert into public.kapukai_interest_registry
 (email,interests,status,consent_version,source_path)
 values (p_email,array[]::text[],'pending',p_consent_version,p_source_path)
 on conflict (email) do nothing;
 select * into v_registry from public.kapukai_interest_registry where email=p_email for update;
 if v_registry.status in ('suppressed','unsubscribed') then
   return jsonb_build_object('result','suppressed');
 end if;
 insert into public.kapukai_scoped_intents
 (registry_id,request_id,token_hash,topics,consent_version,source_path,newsletter_cadence,tool_interests)
 values (v_registry.id,p_request_id,p_token_hash,v_topics,p_consent_version,p_source_path,p_newsletter_cadence,p_tool_interests)
 on conflict (registry_id,request_id) do nothing returning id into v_intent;
 if v_intent is null then return jsonb_build_object('result','duplicate'); end if;
 insert into public.kapukai_scoped_consent_events
 (registry_id,intent_id,event_type,topics,consent_version)
 values (v_registry.id,v_intent,'request',v_topics,p_consent_version);
 return jsonb_build_object('result','created','intent_id',v_intent);
end $$;

create function public.kapukai_scoped_token(
 p_token_hash text,p_action text,p_topics text[] default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_intent public.kapukai_scoped_intents%rowtype;
 v_registry public.kapukai_interest_registry%rowtype;
 v_topics text[];
 v_changed text[];
 v_active text[];
 v_affected jsonb;
begin
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_action is null or p_action not in ('inspect','confirm','revoke') then
   return jsonb_build_object('result','invalid');
 end if;
 select * into v_intent from public.kapukai_scoped_intents where token_hash=p_token_hash;
 if not found then return jsonb_build_object('result','invalid'); end if;
 -- Every mutation locks identity before intent: request/confirm/revoke share ordering.
 select * into v_registry from public.kapukai_interest_registry
 where id=v_intent.registry_id for update;
 select * into v_intent from public.kapukai_scoped_intents where id=v_intent.id for update;
 if v_intent.manage_expires_at <= now() then
   return jsonb_build_object('result','expired');
 end if;
 if p_action='inspect' then
   select coalesce(array_agg(topic order by topic),array[]::text[]) into v_active
   from public.kapukai_scoped_subscriptions where registry_id=v_registry.id
     and state='confirmed' and topic=any(v_intent.topics);
   return jsonb_build_object('result','valid','state',v_intent.state,
    'topics',v_intent.topics,'active_topics',v_active,'newsletter_cadence',v_intent.newsletter_cadence,'tool_interests',v_intent.tool_interests,
    'can_confirm',v_intent.state='pending' and v_intent.expires_at>now()
       and v_registry.status not in ('suppressed','unsubscribed'),
    'blocked',v_registry.status in ('suppressed','unsubscribed'));
 end if;
 if p_action='confirm' then
   if v_registry.status in ('suppressed','unsubscribed') then
     return jsonb_build_object('result','suppressed');
   end if;
   if v_intent.state <> 'pending' then
     return jsonb_build_object('result',case when v_intent.state='confirmed'
       then 'already_confirmed' else 'used' end);
   end if;
   if v_intent.expires_at <= now() then return jsonb_build_object('result','expired'); end if;
   -- Newer confirmed choices dominate an older still-pending confirmation link.
   if exists (
     select 1 from public.kapukai_scoped_subscriptions s
     join public.kapukai_scoped_intents newer on newer.id=s.last_intent_id
     where s.registry_id=v_registry.id and s.topic=any(v_intent.topics)
       and newer.request_seq>v_intent.request_seq
   ) then
     update public.kapukai_scoped_intents set state='canceled' where id=v_intent.id;
     return jsonb_build_object('result','superseded');
   end if;
   insert into public.kapukai_scoped_subscriptions
    (registry_id,topic,state,cadence,tool_interests,consent_version,confirmed_at,last_intent_id)
   select v_registry.id,t,'confirmed',case when t='tester_invites' then 'event_based' else v_intent.newsletter_cadence end,case when t='tester_invites' then v_intent.tool_interests else array[]::text[] end,v_intent.consent_version,now(),v_intent.id
    from unnest(v_intent.topics) t
   on conflict (registry_id,topic) do update set
    state='confirmed',cadence=excluded.cadence,tool_interests=excluded.tool_interests,consent_version=excluded.consent_version,
    confirmed_at=excluded.confirmed_at,revoked_at=null,
    updated_at=now(),last_intent_id=excluded.last_intent_id;
   update public.kapukai_scoped_intents set state='confirmed',confirmed_at=now()
    where id=v_intent.id;
   insert into public.kapukai_scoped_consent_events
    (registry_id,intent_id,event_type,topics,consent_version)
   values (v_registry.id,v_intent.id,'confirm',v_intent.topics,v_intent.consent_version);
   return jsonb_build_object('result','confirmed','topics',v_intent.topics);
 end if;
 -- A bearer can only revoke topics actually bound to this link.
 if p_topics is null or cardinality(p_topics) not between 1 and 2
   or not p_topics <@ v_intent.topics or array_position(p_topics,null) is not null then
   return jsonb_build_object('result','invalid');
 end if;
 select array_agg(distinct t order by t) into v_topics from unnest(p_topics)t;
 with changed as (
   update public.kapukai_scoped_subscriptions set state='unsubscribed',revoked_at=now(),updated_at=now()
   where registry_id=v_registry.id and topic=any(v_topics) and state='confirmed'
   returning topic,last_intent_id
 ) select coalesce(array_agg(topic order by topic),array[]::text[]),
   coalesce(jsonb_agg(jsonb_build_object('topic',topic,'last_intent_id',last_intent_id)),'[]'::jsonb)
   into v_changed,v_affected from changed;
 -- A withdrawn request cannot later be activated from another previously issued link.
 update public.kapukai_scoped_intents set state='canceled'
  where registry_id=v_registry.id and state='pending' and topics && v_topics;
 update public.kapukai_scoped_intents set state='unsubscribed'
  where id=v_intent.id and not exists (
   select 1 from public.kapukai_scoped_subscriptions
   where registry_id=v_registry.id and topic=any(v_intent.topics) and state='confirmed'
  );
 if cardinality(v_changed)>0 then
   insert into public.kapukai_scoped_consent_events
   (registry_id,intent_id,event_type,topics,consent_version,affected_grants)
   values(v_registry.id,v_intent.id,'revoke',v_changed,v_intent.consent_version,v_affected);
 end if;
 return jsonb_build_object('result','unsubscribed','topics',v_topics);
end $$;

create function public.kapukai_scoped_mail_result(
 p_intent_id uuid,p_state text,p_provider_message_id text default null
) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_state is null or p_state not in ('accepted','failed','unknown') then
   raise exception 'INVALID_DELIVERY_STATE';
 end if;
 update public.kapukai_scoped_intents
 set delivery_state=p_state,provider_message_id=left(p_provider_message_id,200)
 where id=p_intent_id and delivery_state='pending';
end $$;

revoke all on function public.kapukai_scoped_request(text,text[],text,uuid,text,text,text,text[]) from public,anon,authenticated;
revoke all on function public.kapukai_scoped_token(text,text,text[]) from public,anon,authenticated;
revoke all on function public.kapukai_scoped_mail_result(uuid,text,text) from public,anon,authenticated;
grant execute on function public.kapukai_scoped_request(text,text[],text,uuid,text,text,text,text[]) to service_role;
grant execute on function public.kapukai_scoped_token(text,text,text[]) to service_role;
grant execute on function public.kapukai_scoped_mail_result(uuid,text,text) to service_role;
commit;

