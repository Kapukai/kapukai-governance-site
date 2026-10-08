-- Add opt-in community purposes. Preserve legacy records, pending links,
-- permissions, suppression and confirmation requirements. No campaign is sent.
begin;
alter table public.kapukai_scoped_intents
 drop constraint kapukai_scoped_intents_topics_check,
 add constraint kapukai_scoped_intents_topics_check check (cardinality(topics) between 1 and 5 and topics <@ array['tester_invites','remedy_brief','volunteer','free_classes','connect']::text[] and array_position(topics,null) is null),
 drop constraint kapukai_scoped_intents_consent_version_check,
 add constraint kapukai_scoped_intents_consent_version_check check (consent_version in ('kapukai-scoped-v1-2026-10-05','kapukai-scoped-v2-2026-10-08')),
 drop constraint kapukai_scoped_intents_source_path_check,
 add constraint kapukai_scoped_intents_source_path_check check (source_path in ('/join','/testers','/newsletter','/community'));
alter table public.kapukai_scoped_subscriptions
 drop constraint kapukai_scoped_subscriptions_topic_check,
 add constraint kapukai_scoped_subscriptions_topic_check check (topic in ('tester_invites','remedy_brief','volunteer','free_classes','connect'));

create or replace function public.kapukai_scoped_request(
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
    or p_topics is null or cardinality(p_topics) not between 1 and 5
    or not p_topics <@ array['tester_invites','remedy_brief','volunteer','free_classes','connect']::text[]
    or array_position(p_topics,null) is not null
    or p_consent_version is null or p_consent_version not in ('kapukai-scoped-v1-2026-10-05','kapukai-scoped-v2-2026-10-08')
    or (p_consent_version='kapukai-scoped-v1-2026-10-05' and not p_topics <@ array['tester_invites','remedy_brief']::text[])
    or cardinality(p_topics) <> (select count(distinct t) from unnest(p_topics) t)
    or p_source_path is null or p_source_path not in ('/join','/testers','/newsletter','/community') then
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

create or replace function public.kapukai_scoped_token(
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
   select v_registry.id,t,'confirmed',case when t='remedy_brief' then v_intent.newsletter_cadence else 'event_based' end,case when t='tester_invites' then v_intent.tool_interests else array[]::text[] end,v_intent.consent_version,now(),v_intent.id
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
 if p_topics is null or cardinality(p_topics) not between 1 and 5
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
commit;
