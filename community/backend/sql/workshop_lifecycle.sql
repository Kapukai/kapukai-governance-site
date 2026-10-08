-- Additive private workflow. Existing contact, consent and application states are unchanged.
begin;
create schema if not exists kapukai_workshop_private;
revoke all on schema kapukai_workshop_private from public,anon,authenticated;
grant usage on schema kapukai_workshop_private to service_role;

create table public.kapukai_workshop_config (
 id smallint primary key check(id=1),enabled boolean not null default false,
 max_open integer not null default 12 check(max_open between 1 and 100),updated_at timestamptz not null default now()
);
insert into public.kapukai_workshop_config(id) values(1);
create table public.kapukai_workshop_workflows (
 application_id uuid primary key references public.kapukai_applications(id),
 revision integer not null default 0 check(revision>=0),
 stage text not null default 'queue' check(stage in ('queue','reviewing','clarification','waitlisted','declined','offered','accepted','in_progress','delivered','correction_requested','closed','withdrawn')),
 clarification_field text check(clarification_field in ('service_interest','availability')),
 clarification_value text,reason text check(reason in ('capacity','scope','no_response','completed','applicant_request','offer_expired')),
 feedback jsonb,correction_category text check(correction_category in ('access','formatting','incorrect_information','missing_resource')),
 updated_at timestamptz not null default now()
);
create table public.kapukai_workshop_offers (
 id uuid primary key default gen_random_uuid(),application_id uuid not null references public.kapukai_applications(id),
 version integer not null check(version>0),resource_id text not null check(resource_id in ('practice','tester_guide','learning','reviewer_orientation')),
 minutes integer not null check(minutes between 15 and 120),price_cents integer not null default 0 check(price_cents=0),
 state text not null default 'pending' check(state in ('pending','accepted','declined','expired','canceled','completed')),
 expires_at timestamptz not null,created_at timestamptz not null default now(),unique(application_id,version)
);
create unique index kapukai_workshop_one_commitment on public.kapukai_workshop_offers(application_id) where state in ('pending','accepted');
create table public.kapukai_workshop_deliveries (
 application_id uuid not null references public.kapukai_applications(id),version integer not null check(version>0),
 resource_id text not null check(resource_id in ('practice','tester_guide','learning','reviewer_orientation')),
 created_at timestamptz not null default now(),primary key(application_id,version)
);
create table public.kapukai_workshop_events (
 id bigint generated always as identity primary key,application_id uuid not null references public.kapukai_applications(id),
 actor text not null check(actor in ('applicant','owner','system')),actor_id uuid,
 action text not null,request_id uuid not null,payload jsonb not null default '{}',
 revision integer not null,delivery_version integer,created_at timestamptz not null default now(),unique(application_id,actor,request_id)
);
create table public.kapukai_workshop_access_events (
 id bigint generated always as identity primary key,user_id uuid not null,session_id uuid not null,
 action text not null check(action in ('queue','command')),created_at timestamptz not null default now()
);
create table public.kapukai_workshop_notices (
 id uuid primary key default gen_random_uuid(),application_id uuid not null references public.kapukai_applications(id),
 revision integer not null,user_id uuid not null,session_id uuid not null,tenant_id text not null,subject_id text not null,
 request_id uuid not null,template_version text not null check(template_version='kapukai-application-update-v1-2026-10-08'),
 state text not null default 'claimed' check(state in ('claimed','accepted','failed','unknown')),
 provider_message_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(application_id,revision),unique(user_id,request_id)
);
alter table public.kapukai_workshop_config enable row level security;
alter table public.kapukai_workshop_workflows enable row level security;
alter table public.kapukai_workshop_offers enable row level security;
alter table public.kapukai_workshop_deliveries enable row level security;
alter table public.kapukai_workshop_events enable row level security;
alter table public.kapukai_workshop_access_events enable row level security;
alter table public.kapukai_workshop_notices enable row level security;
revoke all on public.kapukai_workshop_notices from public,anon,authenticated,service_role;
grant select,insert,update on public.kapukai_workshop_notices to service_role;
revoke all on public.kapukai_workshop_config,public.kapukai_workshop_workflows,public.kapukai_workshop_offers,public.kapukai_workshop_deliveries,public.kapukai_workshop_events,public.kapukai_workshop_access_events from public,anon,authenticated,service_role;
grant select on public.kapukai_workshop_config to service_role;
grant select,insert,update on public.kapukai_workshop_workflows,public.kapukai_workshop_offers to service_role;
grant select,insert on public.kapukai_workshop_deliveries,public.kapukai_workshop_events,public.kapukai_workshop_access_events to service_role;
revoke all on sequence public.kapukai_workshop_events_id_seq,public.kapukai_workshop_access_events_id_seq from public,anon,authenticated,service_role;
grant usage on sequence public.kapukai_workshop_events_id_seq,public.kapukai_workshop_access_events_id_seq to service_role;

-- Deliberately narrow definer: service role cannot read auth.sessions or the identity digest secret.
-- This private boolean helper reveals neither. No browser role can call it.
create function kapukai_workshop_private.authorized(p_user_id uuid,p_session_id uuid,p_tenant_id text,p_subject_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_user_id is not null and p_session_id is not null and exists(
 select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.id=p_session_id and s.user_id=p_user_id and s.created_at>now()-interval '30 minutes' and (s.not_after is null or s.not_after>now())
 and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
 ) and exists(
 select 1 from kapukai.external_identities e
 join kapukai.subjects s on s.tenant_id=e.tenant_id and s.id=e.subject_id
 join kapukai.tenants t on t.id=e.tenant_id
 join kapukai.role_grants g on g.tenant_id=e.tenant_id and g.subject_id=e.subject_id
 where e.provider='supabase' and e.provider_subject_digest=kapukai.identity_digest_for_auth_user(p_user_id)
 and e.tenant_id=p_tenant_id and e.subject_id=p_subject_id and e.state='active'
 and s.state='active' and s.deleted_at is null and t.state='active'
 and g.role='steward' and 'community:applications:review'=any(g.capabilities) and 'community:workshop'=any(g.scope)
 and g.effective_at<=now() and (g.expires_at is null or g.expires_at>now()) and g.revoked_at is null);
$$;
revoke all on function kapukai_workshop_private.authorized(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function kapukai_workshop_private.authorized(uuid,uuid,text,text) to service_role;

create function public.kapukai_workshop_snapshot(p_application_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare a public.kapukai_applications%rowtype; w public.kapukai_workshop_workflows%rowtype;
 o jsonb; d jsonb; h jsonb; receipt integer; actions text[]:=array[]::text[]; owners text[]:=array[]::text[]; open boolean; blocked boolean;
begin
 select * into a from public.kapukai_applications where id=p_application_id;
 if not found then return null; end if;
 select * into w from public.kapukai_workshop_workflows where application_id=a.id;
 if not found then w.revision:=0;w.stage:='queue';end if;
 if a.state='withdrawn' then w.stage:='withdrawn';end if;
 select enabled into open from public.kapukai_workshop_config where id=1;
 select status in ('suppressed','unsubscribed') into blocked from public.kapukai_interest_registry where id=a.registry_id;
 select jsonb_build_object('id',id,'resource_id',resource_id,'minutes',minutes,'expires_at',expires_at,'state',case when state='pending' and expires_at<=now() then 'expired' else state end,'nonbinding',true,'price_cents',price_cents,'version',version) into o
 from public.kapukai_workshop_offers where application_id=a.id order by version desc limit 1;
 select jsonb_build_object('version',version,'resource_id',resource_id,'created_at',created_at) into d from public.kapukai_workshop_deliveries where application_id=a.id order by version desc limit 1;
 select max(delivery_version) into receipt from public.kapukai_workshop_events where application_id=a.id and action='delivery_received';
 select coalesce(jsonb_agg(jsonb_build_object('action',action,'actor',actor,'at',created_at,'revision',revision,'delivery_version',delivery_version) order by id),'[]'::jsonb) into h from (select * from public.kapukai_workshop_events where application_id=a.id order by id desc limit 30) e;
 if a.state='awaiting_human_review' and a.manage_expires_at>now() and not blocked then
  if w.stage not in ('closed','withdrawn') then actions:=array['close'];owners:=array['close','pause'];end if;
  if open then
   if w.stage='clarification' then actions:=actions||'clarify'::text;end if;
   if w.stage='offered' and o->>'state'='pending' then actions:=actions||array['accept_offer','decline_offer'];end if;
   if w.stage in ('declined','waitlisted','closed') or (w.stage='offered' and o->>'state'='expired') then actions:=actions||'reconsider'::text;end if;
   if w.stage='delivered' then
    actions:=actions||array['feedback','correction'];
    if receipt is distinct from (d->>'version')::integer then actions:=actions||'delivery_received'::text;end if;
   end if;
   if w.stage='closed' and d is not null then actions:=actions||array['feedback','correction'];end if;
   if w.stage in ('queue','reviewing','waitlisted','declined','clarification') then owners:=owners||array['review','clarify','waitlist','decline','offer'];end if;
   if w.stage='accepted' then owners:=owners||'start'::text;end if;
   if w.stage='in_progress' then owners:=owners||'deliver'::text;end if;
   if w.stage='correction_requested' then owners:=owners||'resolve_correction'::text;end if;
  end if;
 end if;
 return jsonb_build_object('revision',w.revision,'stage',w.stage,'clarification_field',w.clarification_field,'clarification_value',w.clarification_value,'reason',w.reason,'offer',o,'delivery',d,'received_delivery_version',receipt,'feedback',w.feedback,'correction_category',w.correction_category,'history',h,'actions',actions,'owner_actions',owners,'enabled',coalesce(open,false),'can_send_notice',coalesce(open,false) and not blocked and a.state='awaiting_human_review' and a.manage_expires_at>now() and not exists(select 1 from public.kapukai_workshop_notices where application_id=a.id and revision=w.revision),'notice',(select jsonb_build_object('revision',revision,'state',state,'created_at',created_at) from public.kapukai_workshop_notices where application_id=a.id order by created_at desc limit 1));
end $$;

create function public.kapukai_workshop_transition(p_application_id uuid,p_actor text,p_actor_id uuid,p_action text,p_expected_revision integer,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.kapukai_applications%rowtype;w public.kapukai_workshop_workflows%rowtype;r public.kapukai_interest_registry%rowtype;e public.kapukai_workshop_events%rowtype;
 snap jsonb; cfg public.kapukai_workshop_config%rowtype;newstage text;v_reason text;field text;resource text;ver integer;n integer;
begin
 if p_actor not in ('owner','applicant') or p_actor is null or p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_payload is null or jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>2048 then return jsonb_build_object('result','invalid');end if;
 select * into a from public.kapukai_applications where id=p_application_id;
 if not found then return jsonb_build_object('result','not_found');end if;
 select * into r from public.kapukai_interest_registry where id=a.registry_id for update;
 select * into a from public.kapukai_applications where id=a.id for update;
 insert into public.kapukai_workshop_workflows(application_id) values(a.id) on conflict do nothing;
 select * into w from public.kapukai_workshop_workflows where application_id=a.id for update;
 select * into e from public.kapukai_workshop_events where application_id=a.id and actor=p_actor and request_id=p_request_id;
 if found then
  if e.action<>p_action or e.payload<>p_payload or e.actor_id is distinct from p_actor_id then return jsonb_build_object('result','idempotency_conflict');end if;
  return jsonb_build_object('result','duplicate','lifecycle',public.kapukai_workshop_snapshot(a.id));
 end if;
 if a.state<>'awaiting_human_review' then return jsonb_build_object('result','transition_denied');end if;
 if a.manage_expires_at<=now() then return jsonb_build_object('result','expired');end if;
 if r.status in ('suppressed','unsubscribed') then return jsonb_build_object('result','suppressed');end if;
 if w.revision<>p_expected_revision then return jsonb_build_object('result','stale_revision');end if;
 if p_actor='applicant' and p_action<>'close' and (select count(*) from public.kapukai_workshop_events where application_id=a.id and actor='applicant' and created_at>now()-interval '24 hours')>=100 then return jsonb_build_object('result','rate_limited');end if;
 -- A transaction advisory lock serializes explicit capacity reservations without
 -- granting service_role UPDATE on the launch/capacity configuration.
 perform pg_advisory_xact_lock(76210408191433::bigint);
 select * into cfg from public.kapukai_workshop_config where id=1;
 if not cfg.enabled and p_action not in ('close','pause') then return jsonb_build_object('result','paused');end if;
 snap:=public.kapukai_workshop_snapshot(a.id);
 if not (snap->case when p_actor='owner' then 'owner_actions' else 'actions' end ? p_action) then return jsonb_build_object('result','transition_denied');end if;
 newstage:=w.stage;v_reason:=null;
 if p_action in ('review','start','accept_offer','decline_offer','delivery_received','reconsider','close') and p_payload<>'{}'::jsonb and not (p_actor='owner' and p_action='close') then return jsonb_build_object('result','invalid');end if;
 if p_actor='owner' and p_action in ('waitlist','decline','close','pause') then
  if (p_payload-'reason')<>'{}'::jsonb or coalesce(p_payload->>'reason','') not in ('capacity','scope','no_response','completed','applicant_request') then return jsonb_build_object('result','invalid');end if;
  v_reason:=p_payload->>'reason';
  newstage:=case p_action when 'waitlist' then 'waitlisted' when 'decline' then 'declined' when 'pause' then 'waitlisted' else 'closed' end;
 elsif p_action='review' then newstage:='reviewing';
 elsif p_action='clarify' and p_actor='owner' then
  field:=p_payload->>'field';if (p_payload-'field')<>'{}'::jsonb or coalesce(field,'') not in ('service_interest','availability') or (field='availability' and a.kind='assistance') then return jsonb_build_object('result','invalid');end if;
  update public.kapukai_workshop_workflows set clarification_field=field,clarification_value=null where application_id=a.id;newstage:='clarification';
 elsif p_action='clarify' and p_actor='applicant' then
  if (p_payload-'value')<>'{}'::jsonb or (w.clarification_field='service_interest' and coalesce(p_payload->>'value','') not in ('tools','timeline','evidence_dossier','affidavit_formatting','training','independent_review')) or (w.clarification_field='availability' and coalesce(p_payload->>'value','') not in ('occasional','monthly','weekly','unsure')) then return jsonb_build_object('result','invalid');end if;
  update public.kapukai_workshop_workflows set clarification_value=p_payload->>'value' where application_id=a.id;newstage:='reviewing';
 elsif p_action='offer' then
  resource:=p_payload->>'resource_id';if (p_payload-array['resource_id','minutes','expires_days'])<>'{}'::jsonb or coalesce(resource,'') not in ('practice','tester_guide','learning','reviewer_orientation') or coalesce(p_payload->>'minutes','')!~'^[0-9]{1,3}$' or coalesce(p_payload->>'expires_days','')!~'^[0-9]{1,2}$' then return jsonb_build_object('result','invalid');end if;
  if (p_payload->>'minutes')::integer not between 15 and 120 or (p_payload->>'expires_days')::integer not between 1 and 30 then return jsonb_build_object('result','invalid');end if;
  select count(*) into n from public.kapukai_workshop_offers where state='accepted' or (state='pending' and expires_at>now());
  if n>=cfg.max_open then return jsonb_build_object('result','capacity_full');end if;
  update public.kapukai_workshop_offers set state='expired' where application_id=a.id and state='pending' and expires_at<=now();
  select coalesce(max(version),0)+1 into ver from public.kapukai_workshop_offers where application_id=a.id;
  insert into public.kapukai_workshop_offers(application_id,version,resource_id,minutes,expires_at) values(a.id,ver,resource,(p_payload->>'minutes')::integer,least(a.manage_expires_at,now()+make_interval(days=>(p_payload->>'expires_days')::integer)));newstage:='offered';
 elsif p_action='accept_offer' then
  update public.kapukai_workshop_offers set state='accepted' where application_id=a.id and state='pending' and expires_at>now();if not found then return jsonb_build_object('result','expired');end if;newstage:='accepted';
 elsif p_action='decline_offer' then update public.kapukai_workshop_offers set state='declined' where application_id=a.id and state='pending';newstage:='declined';v_reason:='applicant_request';
 elsif p_action='start' then newstage:='in_progress';
 elsif p_action in ('deliver','resolve_correction') then
  resource:=p_payload->>'resource_id';if (p_payload-'resource_id')<>'{}'::jsonb or coalesce(resource,'') not in ('practice','tester_guide','learning','reviewer_orientation') then return jsonb_build_object('result','invalid');end if;
  if p_action='deliver' and not exists(select 1 from public.kapukai_workshop_offers where application_id=a.id and state='accepted' and resource_id=resource) then return jsonb_build_object('result','transition_denied');end if;
  select coalesce(max(version),0)+1 into ver from public.kapukai_workshop_deliveries where application_id=a.id;
  insert into public.kapukai_workshop_deliveries(application_id,version,resource_id) values(a.id,ver,resource);newstage:='delivered';
 elsif p_action='delivery_received' then newstage:='delivered';
 elsif p_action='feedback' then
  if (p_payload-array['working','broken','improvement'])<>'{}'::jsonb or coalesce(p_payload->>'working','') not in ('yes','partly','no') or coalesce(p_payload->>'broken','') not in ('none','access','navigation','formatting','incorrect_information') or coalesce(p_payload->>'improvement','') not in ('clarity','accessibility','speed','features','none') then return jsonb_build_object('result','invalid');end if;
  update public.kapukai_workshop_workflows set feedback=p_payload where application_id=a.id;
 elsif p_action='correction' then
  if (p_payload-'category')<>'{}'::jsonb or coalesce(p_payload->>'category','') not in ('access','formatting','incorrect_information','missing_resource') then return jsonb_build_object('result','invalid');end if;
  update public.kapukai_workshop_workflows set correction_category=p_payload->>'category' where application_id=a.id;newstage:='correction_requested';
 elsif p_action='reconsider' then newstage:='queue';
 elsif p_action='close' then newstage:='closed';v_reason:='applicant_request';
 else return jsonb_build_object('result','invalid');end if;
 if newstage in ('closed','waitlisted','declined','queue') then update public.kapukai_workshop_offers set state=case when newstage='closed' and w.stage='delivered' then 'completed' else 'canceled' end where application_id=a.id and state in ('pending','accepted');end if;
 update public.kapukai_workshop_workflows set stage=newstage,reason=v_reason,revision=revision+1,updated_at=now() where application_id=a.id;
 insert into public.kapukai_workshop_events(application_id,actor,actor_id,action,request_id,payload,revision,delivery_version) values(a.id,p_actor,p_actor_id,p_action,p_request_id,p_payload,w.revision+1,case when p_action in ('delivery_received','feedback','correction','deliver','resolve_correction') then (select max(version) from public.kapukai_workshop_deliveries where application_id=a.id) else null end);
 return jsonb_build_object('result','updated','lifecycle',public.kapukai_workshop_snapshot(a.id));
end $$;

create function public.kapukai_workshop_owner_queue(p_user_id uuid,p_session_id uuid,p_tenant_id text,p_subject_id text,p_limit integer default 30,p_offset integer default 0,p_view text default 'active')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare items jsonb;cfg public.kapukai_workshop_config%rowtype;n integer;total integer;
begin
 if not kapukai_workshop_private.authorized(p_user_id,p_session_id,p_tenant_id,p_subject_id) then return jsonb_build_object('result','forbidden');end if;
 if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 10000 or p_view is null or p_view not in ('active','archived','all') then return jsonb_build_object('result','invalid');end if;
 insert into public.kapukai_workshop_access_events(user_id,session_id,action) values(p_user_id,p_session_id,'queue');
 select * into cfg from public.kapukai_workshop_config where id=1;
 select count(*) into n from public.kapukai_workshop_offers where state='accepted' or (state='pending' and expires_at>now());
 select count(*) into total from public.kapukai_applications a left join public.kapukai_workshop_workflows w on w.application_id=a.id
 where a.state in ('awaiting_human_review','withdrawn') and a.confirmed_at is not null and (p_view='all' or (p_view='archived')=(a.state='withdrawn' or coalesce(w.stage,'queue') in ('closed','declined')));
 select coalesce(jsonb_agg(jsonb_build_object('application_id',a.id,'display_alias',a.display_alias,'kind',a.kind,'service_interest',a.service_interest,'requested_support',a.requested_support,'profession',a.profession,'availability',a.availability,'confirmed_at',a.confirmed_at,'blocked',r.status in ('suppressed','unsubscribed'),'lifecycle',public.kapukai_workshop_snapshot(a.id)) order by a.confirmed_at,a.id),'[]'::jsonb) into items
 from (select a.* from public.kapukai_applications a left join public.kapukai_workshop_workflows w on w.application_id=a.id
 where a.state in ('awaiting_human_review','withdrawn') and a.confirmed_at is not null and (p_view='all' or (p_view='archived')=(a.state='withdrawn' or coalesce(w.stage,'queue') in ('closed','declined')))
 order by a.confirmed_at,a.id limit p_limit offset p_offset) a join public.kapukai_interest_registry r on r.id=a.registry_id;
 return jsonb_build_object('result','ok','enabled',cfg.enabled,'capacity',jsonb_build_object('max_open',cfg.max_open,'active_commitments',n),'total_count',total,'has_more',p_offset+p_limit<total,'applications',items);
end $$;
create function public.kapukai_workshop_owner_action(p_user_id uuid,p_session_id uuid,p_tenant_id text,p_subject_id text,p_application_id uuid,p_action text,p_expected_revision integer,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not kapukai_workshop_private.authorized(p_user_id,p_session_id,p_tenant_id,p_subject_id) then return jsonb_build_object('result','forbidden');end if;
 insert into public.kapukai_workshop_access_events(user_id,session_id,action) values(p_user_id,p_session_id,'command');
 return public.kapukai_workshop_transition(p_application_id,'owner',p_user_id,p_action,p_expected_revision,p_request_id,p_payload);
end $$;
create function public.kapukai_workshop_applicant(p_token_hash text,p_action text,p_expected_revision integer,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.kapukai_applications%rowtype;
begin
 if p_token_hash is null or p_token_hash!~'^[0-9a-f]{64}$' then return jsonb_build_object('result','invalid');end if;
 select * into a from public.kapukai_applications where token_hash=p_token_hash;
 if not found then return jsonb_build_object('result','invalid');end if;
 if a.manage_expires_at<=now() then return jsonb_build_object('result','expired');end if;
 return public.kapukai_workshop_transition(a.id,'applicant',null,p_action,p_expected_revision,p_request_id,p_payload);
end $$;

create function public.kapukai_workshop_notice_claim(p_user_id uuid,p_session_id uuid,p_tenant_id text,p_subject_id text,p_application_id uuid,p_expected_revision integer,p_request_id uuid,p_template_version text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.kapukai_applications%rowtype;r public.kapukai_interest_registry%rowtype;n public.kapukai_workshop_notices%rowtype;rev integer;
begin
 if not kapukai_workshop_private.authorized(p_user_id,p_session_id,p_tenant_id,p_subject_id) then return jsonb_build_object('result','forbidden');end if;
 if p_request_id is null or p_template_version is distinct from 'kapukai-application-update-v1-2026-10-08' then return jsonb_build_object('result','invalid');end if;
 select * into a from public.kapukai_applications where id=p_application_id;
 if not found then return jsonb_build_object('result','not_found');end if;
 select * into r from public.kapukai_interest_registry where id=a.registry_id for update;
 select * into a from public.kapukai_applications where id=a.id for update;
 select coalesce((select revision from public.kapukai_workshop_workflows where application_id=a.id),0) into rev;
 select * into n from public.kapukai_workshop_notices where user_id=p_user_id and request_id=p_request_id;
 if found then
  if n.application_id<>a.id or n.revision<>p_expected_revision or n.template_version<>p_template_version then return jsonb_build_object('result','idempotency_conflict');end if;
  return jsonb_build_object('result','duplicate','notice_id',n.id,'state',n.state);
 end if;
 if a.state<>'awaiting_human_review' then return jsonb_build_object('result','transition_denied');end if;
 if r.status in ('suppressed','unsubscribed') then return jsonb_build_object('result','suppressed');end if;
 if a.manage_expires_at<=now() then return jsonb_build_object('result','expired');end if;
 if p_expected_revision is distinct from rev then return jsonb_build_object('result','stale_revision');end if;
 if not (select enabled from public.kapukai_workshop_config where id=1) then return jsonb_build_object('result','paused');end if;
 select * into n from public.kapukai_workshop_notices where application_id=a.id and revision=rev;
 if found then return jsonb_build_object('result','duplicate','notice_id',n.id,'state',n.state);end if;
 insert into public.kapukai_workshop_notices(application_id,revision,user_id,session_id,tenant_id,subject_id,request_id,template_version)
 values(a.id,rev,p_user_id,p_session_id,p_tenant_id,p_subject_id,p_request_id,p_template_version) returning * into n;
 return jsonb_build_object('result','claimed','notice_id',n.id,'email',r.email,'template_version',n.template_version);
end $$;
create function public.kapukai_workshop_notice_finish(p_user_id uuid,p_session_id uuid,p_tenant_id text,p_subject_id text,p_notice_id uuid,p_state text,p_provider_message_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare n public.kapukai_workshop_notices%rowtype;
begin
 -- Receipt-only operation: binding to the already authorized claim lets the provider
 -- result be recorded even when the owner's session expires during network handoff.
 select * into n from public.kapukai_workshop_notices where id=p_notice_id for update;
 if not found or n.user_id is distinct from p_user_id or n.session_id is distinct from p_session_id or n.tenant_id is distinct from p_tenant_id or n.subject_id is distinct from p_subject_id then return jsonb_build_object('result','forbidden');end if;
 if p_state is null or p_state not in ('accepted','failed','unknown') or length(coalesce(p_provider_message_id,''))>200 then return jsonb_build_object('result','invalid');end if;
 if n.state<>'claimed' then return jsonb_build_object('result','recorded','state',n.state);end if;
 update public.kapukai_workshop_notices set state=p_state,provider_message_id=p_provider_message_id,updated_at=now() where id=n.id;
 return jsonb_build_object('result','recorded','state',p_state);
end $$;

create function public.kapukai_workshop_withdraw_sync() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.state='withdrawn' and old.state is distinct from new.state then
  update public.kapukai_workshop_offers set state='canceled' where application_id=new.id and state in ('pending','accepted');
  update public.kapukai_workshop_workflows set stage='withdrawn',revision=revision+1,updated_at=now() where application_id=new.id;
  if found then insert into public.kapukai_workshop_events(application_id,actor,action,request_id,revision) select new.id,'applicant','withdraw',gen_random_uuid(),revision from public.kapukai_workshop_workflows where application_id=new.id;end if;
 end if;return new;
end $$;
create trigger kapukai_workshop_withdraw after update of state on public.kapukai_applications for each row execute function public.kapukai_workshop_withdraw_sync();

-- Preserve the older action/result semantics while adding lifecycle to inspect only.
alter function public.kapukai_application_token(text,text) rename to kapukai_application_token_v1;
create function public.kapukai_application_token(p_token_hash text,p_action text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;aid uuid;
begin
 result:=public.kapukai_application_token_v1(p_token_hash,p_action);
 if p_action='inspect' and result->>'result'='valid' then
  select id into aid from public.kapukai_applications where token_hash=p_token_hash;
  result:=result||jsonb_build_object('lifecycle',public.kapukai_workshop_snapshot(aid));
 end if;return result;
end $$;

create function public.kapukai_workshop_maintenance() returns jsonb language plpgsql security invoker set search_path='' as $$
declare row record;n integer:=0;
begin
 -- No mail, deletion, publication or automatic approval. Bound one pass to 100 rows.
 update public.kapukai_workshop_notices set state='unknown',updated_at=now() where id in (select id from public.kapukai_workshop_notices where state='claimed' and created_at<now()-interval '10 minutes' order by created_at limit 100);
 for row in select a.id,a.registry_id from public.kapukai_applications a join public.kapukai_workshop_workflows w on w.application_id=a.id
 join public.kapukai_interest_registry r on r.id=a.registry_id
 where exists(select 1 from public.kapukai_workshop_offers o where o.application_id=a.id and ((o.state='pending' and o.expires_at<=now()) or (o.state in ('pending','accepted') and (a.manage_expires_at<=now() or a.state='withdrawn' or r.status in ('suppressed','unsubscribed'))))) order by a.id limit 100 loop
  perform 1 from public.kapukai_interest_registry where id=row.registry_id for update;
  perform 1 from public.kapukai_applications where id=row.id for update;
  update public.kapukai_workshop_offers o set state='expired' from public.kapukai_applications a join public.kapukai_interest_registry r on r.id=a.registry_id where o.application_id=row.id and a.id=o.application_id and ((o.state='pending' and o.expires_at<=now()) or (o.state in ('pending','accepted') and (a.manage_expires_at<=now() or a.state='withdrawn' or r.status in ('suppressed','unsubscribed'))));
  if found then
   update public.kapukai_workshop_workflows set stage='waitlisted',reason='offer_expired',revision=revision+1,updated_at=now() where application_id=row.id and stage in ('offered','accepted','in_progress','delivered','correction_requested');
   insert into public.kapukai_workshop_events(application_id,actor,action,request_id,revision) select row.id,'system','offer_expired',gen_random_uuid(),revision from public.kapukai_workshop_workflows where application_id=row.id;n:=n+1;
  end if;
 end loop;return jsonb_build_object('expired_offers',n);
end $$;

revoke all on function public.kapukai_workshop_snapshot(uuid),public.kapukai_workshop_transition(uuid,text,uuid,text,integer,uuid,jsonb),public.kapukai_workshop_owner_queue(uuid,uuid,text,text,integer,integer,text),public.kapukai_workshop_owner_action(uuid,uuid,text,text,uuid,text,integer,uuid,jsonb),public.kapukai_workshop_applicant(text,text,integer,uuid,jsonb),public.kapukai_workshop_withdraw_sync(),public.kapukai_application_token(text,text),public.kapukai_workshop_maintenance() from public,anon,authenticated;
grant execute on function public.kapukai_workshop_snapshot(uuid),public.kapukai_workshop_transition(uuid,text,uuid,text,integer,uuid,jsonb),public.kapukai_workshop_owner_queue(uuid,uuid,text,text,integer,integer,text),public.kapukai_workshop_owner_action(uuid,uuid,text,text,uuid,text,integer,uuid,jsonb),public.kapukai_workshop_applicant(text,text,integer,uuid,jsonb),public.kapukai_workshop_withdraw_sync(),public.kapukai_application_token(text,text),public.kapukai_workshop_maintenance() to service_role;
revoke all on function public.kapukai_workshop_notice_claim(uuid,uuid,text,text,uuid,integer,uuid,text),public.kapukai_workshop_notice_finish(uuid,uuid,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.kapukai_workshop_notice_claim(uuid,uuid,text,text,uuid,integer,uuid,text),public.kapukai_workshop_notice_finish(uuid,uuid,text,text,uuid,text,text) to service_role;
commit;
