-- Additive access requests. No Auth account, membership or subscription is created.
-- This source leaves the installed member functions and their grants unchanged.
begin;
create table kapukai_members.access_requests (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 email text not null check(email=lower(btrim(email)) and length(email)<=254 and email=translate(email,'<>,;:"()[]'||chr(92),'')),
 email_hash text not null check(email_hash ~ '^[0-9a-f]{64}$'),
 display_name text not null check(length(display_name) between 1 and 60),
 payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 consent_version text not null check(consent_version='kapukai-member-access-v1-2026-10-20'),
 adult boolean not null check(adult),privacy_acknowledged boolean not null check(privacy_acknowledged),human_review_acknowledged boolean not null check(human_review_acknowledged),
 state text not null default 'awaiting_email' check(state in ('awaiting_email','awaiting_review','approved','declined','withdrawn')),
 revision integer not null default 0 check(revision>=0),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '48 hours',
 manage_expires_at timestamptz not null default now()+interval '180 days',
 confirmed_at timestamptz,decided_at timestamptz,withdrawn_at timestamptz,
 decided_by uuid references auth.users(id),
 invitation_id uuid unique references kapukai_members.invitations(id),
 delivery_state text not null default 'pending' check(delivery_state in ('pending','accepted','failed','unknown')),
 provider_message_id text check(provider_message_id is null or length(provider_message_id)<=200),
 check(manage_expires_at>expires_at),
 check((state in ('awaiting_review','approved','declined') and confirmed_at is not null) or state in ('awaiting_email','withdrawn')),
 check(state<>'approved' or invitation_id is not null)
);
create index kapukai_member_access_rate on kapukai_members.access_requests(email_hash,created_at);
create index kapukai_member_access_queue on kapukai_members.access_requests(created_at) where state='awaiting_review';
alter table kapukai_members.access_requests enable row level security;
revoke all on kapukai_members.access_requests from public,anon,authenticated,service_role;

create function kapukai_members.access_projection(p_request uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('result','ok','state',r.state,'revision',r.revision,
 'can_confirm',r.state='awaiting_email' and r.expires_at>now() and r.manage_expires_at>now() and (select enabled from kapukai_members.config),
 'can_withdraw',r.state<>'withdrawn' and r.manage_expires_at>now() and i.claimed_by is null,
 'consent_version',r.consent_version,'expires_at',r.expires_at,'manage_expires_at',r.manage_expires_at,'claimed',i.claimed_by is not null)
 from kapukai_members.access_requests r left join kapukai_members.invitations i on i.id=r.invitation_id where r.id=p_request;
$$;
revoke all on function kapukai_members.access_projection(uuid) from public,anon,authenticated,service_role;

create function public.kapukai_member_access_is_open() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select enabled from kapukai_members.config),false);
$$;

create function public.kapukai_member_access_request(
 p_email text,p_display_name text,p_request_id uuid,p_token_hash text,p_consent_version text,
 p_adult boolean,p_privacy_acknowledged boolean,p_human_review_acknowledged boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r kapukai_members.access_requests%rowtype; digest text; new_id uuid; day_start timestamptz;
begin
 perform pg_advisory_xact_lock(1792367556);
 if not public.kapukai_member_access_is_open() then return jsonb_build_object('result','paused');end if;
 if p_email is null or p_email<>lower(btrim(p_email)) or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or p_email<>translate(p_email,'<>,;:"()[]'||chr(92),'') or p_email ~ '[[:cntrl:]]'
 or not kapukai_members.text_ok(p_display_name,60) or p_request_id is null
 or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
 or p_consent_version is distinct from 'kapukai-member-access-v1-2026-10-20'
 or p_adult is distinct from true or p_privacy_acknowledged is distinct from true or p_human_review_acknowledged is distinct from true
 then return jsonb_build_object('result','invalid');end if;
 digest:=kapukai_members.hash(jsonb_build_object('email',p_email,'display_name',btrim(p_display_name),'consent_version',p_consent_version,'adult',p_adult,'privacy_acknowledged',p_privacy_acknowledged,'human_review_acknowledged',p_human_review_acknowledged)::text);
 select * into r from kapukai_members.access_requests where request_id=p_request_id for update;
 if r.id is not null then
 if r.payload_hash=digest and r.email=p_email then return jsonb_build_object('result','duplicate');end if;
 return jsonb_build_object('result','idempotency_conflict');end if;
 day_start:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 -- Independent durable bounds; Edge also claims isolated address/network/global quotas.
 if (select count(*) from kapukai_members.access_requests where created_at>=day_start)>=100
 or (select count(*) from kapukai_members.access_requests where email_hash=kapukai_members.hash(p_email) and created_at>=day_start)>=3
 then return jsonb_build_object('result','rate_limited');end if;
 insert into kapukai_members.access_requests(request_id,email,email_hash,display_name,payload_hash,token_hash,consent_version,adult,privacy_acknowledged,human_review_acknowledged)
 values(p_request_id,p_email,kapukai_members.hash(p_email),btrim(p_display_name),digest,p_token_hash,p_consent_version,true,true,true) returning id into new_id;
 return jsonb_build_object('result','created','access_request_id',new_id);
 exception when check_violation or not_null_violation or invalid_parameter_value or invalid_text_representation then return jsonb_build_object('result','invalid');when unique_violation then return jsonb_build_object('result','idempotency_conflict');
end $$;

create function public.kapukai_member_access_token(p_token_hash text,p_action text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare r kapukai_members.access_requests%rowtype; claimed boolean;
begin
 perform pg_advisory_xact_lock(1792367556);
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_action is null or p_action not in ('inspect','confirm','withdraw') then return jsonb_build_object('result','invalid');end if;
 select * into r from kapukai_members.access_requests where token_hash=p_token_hash for update;
 if r.id is null then return jsonb_build_object('result','invalid');end if;
 if r.manage_expires_at<=now() then return jsonb_build_object('result','expired');end if;
 if p_action='inspect' then return kapukai_members.access_projection(r.id);end if;
 if p_action='confirm' then
 if not public.kapukai_member_access_is_open() then return jsonb_build_object('result','paused');end if;
 if r.state='awaiting_review' then return kapukai_members.access_projection(r.id);end if;
 if r.state<>'awaiting_email' then return jsonb_build_object('result','conflict');end if;
 if r.expires_at<=now() then return jsonb_build_object('result','expired');end if;
 update kapukai_members.access_requests set state='awaiting_review',revision=revision+1,confirmed_at=now() where id=r.id;
 return kapukai_members.access_projection(r.id);
 end if;
 -- Withdrawal can revoke only an unused invitation. A claimed member must use
 -- their authenticated membership controls; this token never changes an account.
 if r.invitation_id is not null then
 select i.claimed_by is not null into claimed from kapukai_members.invitations i where i.id=r.invitation_id for update;
 if claimed then return kapukai_members.access_projection(r.id);end if;
 update kapukai_members.invitations set revoked=true where id=r.invitation_id and claimed_by is null;
 end if;
 if r.state<>'withdrawn' then update kapukai_members.access_requests set state='withdrawn',revision=revision+1,withdrawn_at=now() where id=r.id;end if;
 return kapukai_members.access_projection(r.id);
end $$;

create function public.kapukai_member_access_mail_result(p_access_request_id uuid,p_state text,p_provider_message_id text default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_access_request_id is null or p_state is null or p_state not in ('accepted','failed','unknown') or length(coalesce(p_provider_message_id,''))>200 then return jsonb_build_object('result','invalid');end if;
 -- A provider handoff is never retried by this receipt. Replayed receipts cannot
 -- change a completed outcome, nor mutate request/verification/approval state.
 update kapukai_members.access_requests set delivery_state=p_state,provider_message_id=p_provider_message_id where id=p_access_request_id and delivery_state='pending';
 if not found and not exists(select 1 from kapukai_members.access_requests where id=p_access_request_id) then return jsonb_build_object('result','not_found');end if;
 return jsonb_build_object('result','ok');
end $$;

create function public.kapukai_member_access_operator(p_user_id uuid,p_session_id uuid,p_action text,p_payload jsonb default '{}'::jsonb)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare r kapukai_members.access_requests%rowtype; allowed text[]; invitation jsonb; expiry timestamptz; target uuid;
begin
 perform pg_advisory_xact_lock(1792367556);
 if not kapukai_members.live_session(p_user_id,p_session_id) or not exists(select 1 from kapukai_members.operators where user_id=p_user_id) then return jsonb_build_object('result','forbidden');end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>2048 then return jsonb_build_object('result','invalid');end if;
 allowed:=case p_action when 'queue' then array[]::text[] when 'approve' then array['request_id','expected_revision','expires_days'] when 'decline' then array['request_id','expected_revision'] else null end;
 if allowed is null or exists(select 1 from jsonb_object_keys(p_payload) k where not(k=any(allowed))) or exists(select 1 from unnest(allowed) k where not(p_payload?k) or p_payload->k='null'::jsonb) then return jsonb_build_object('result','invalid');end if;
 if p_action='queue' then
 return jsonb_build_object('result','ok','requests',coalesce((select jsonb_agg(x.j order by x.created_at) from (select jsonb_build_object('id',a.id,'email',a.email,'display_name',a.display_name,'state',a.state,'revision',a.revision,'created_at',a.created_at,'confirmed_at',a.confirmed_at,'manage_expires_at',a.manage_expires_at,'consent_version',a.consent_version) j,a.created_at from kapukai_members.access_requests a where a.state='awaiting_review' and a.confirmed_at is not null and a.manage_expires_at>now() order by a.created_at,a.id limit 100) x),'[]'::jsonb));end if;
 if jsonb_typeof(p_payload->'request_id')<>'string' or jsonb_typeof(p_payload->'expected_revision')<>'number' or p_payload->>'expected_revision' !~ '^[0-9]+$' then return jsonb_build_object('result','invalid');end if;
 if p_action='approve' and (jsonb_typeof(p_payload->'expires_days')<>'number' or p_payload->>'expires_days' !~ '^[0-9]+$' or (p_payload->>'expires_days')::integer not between 1 and 14) then return jsonb_build_object('result','invalid');end if;
 target:=(p_payload->>'request_id')::uuid;
 select * into r from kapukai_members.access_requests where id=target for update;
 if r.id is null then return jsonb_build_object('result','not_found');end if;
 if r.manage_expires_at<=now() then return jsonb_build_object('result','expired');end if;
 if r.revision<>(p_payload->>'expected_revision')::integer or r.state<>'awaiting_review' or r.confirmed_at is null then return jsonb_build_object('result','conflict');end if;
 if p_action='approve' then
 if not public.kapukai_member_access_is_open() then return jsonb_build_object('result','paused');end if;
 invitation:=public.kapukai_member_command(p_user_id,p_session_id,'operator_invite',jsonb_build_object('email',r.email,'expires_days',(p_payload->>'expires_days')::integer));
 if invitation->>'result'<>'ok' then return invitation;end if;
 select expires_at into expiry from kapukai_members.invitations where id=(invitation->>'invitation_id')::uuid;
 update kapukai_members.access_requests set state='approved',revision=revision+1,decided_at=now(),decided_by=p_user_id,invitation_id=(invitation->>'invitation_id')::uuid where id=r.id;
 insert into kapukai_members.audit(actor_id,action,target_id) values(p_user_id,'operator_access_approve',r.id);
 return jsonb_build_object('result','ok','invite_token',invitation->>'invite_token','invitation_id',invitation->>'invitation_id','expires_at',expiry);
 end if;
 update kapukai_members.access_requests set state='declined',revision=revision+1,decided_at=now(),decided_by=p_user_id where id=r.id;
 insert into kapukai_members.audit(actor_id,action,target_id) values(p_user_id,'operator_access_decline',r.id);
 return jsonb_build_object('result','ok');
 exception when invalid_text_representation or invalid_parameter_value or numeric_value_out_of_range or check_violation or not_null_violation then return jsonb_build_object('result','invalid');
end $$;

revoke all on function public.kapukai_member_access_is_open() from public,anon,authenticated,service_role;
revoke all on function public.kapukai_member_access_request(text,text,uuid,text,text,boolean,boolean,boolean) from public,anon,authenticated,service_role;
revoke all on function public.kapukai_member_access_token(text,text) from public,anon,authenticated,service_role;
revoke all on function public.kapukai_member_access_mail_result(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.kapukai_member_access_operator(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kapukai_member_access_is_open() to service_role;
grant execute on function public.kapukai_member_access_request(text,text,uuid,text,text,boolean,boolean,boolean) to service_role;
grant execute on function public.kapukai_member_access_token(text,text) to service_role;
grant execute on function public.kapukai_member_access_mail_result(uuid,text,text) to service_role;
grant execute on function public.kapukai_member_access_operator(uuid,uuid,text,jsonb) to service_role;
commit;
