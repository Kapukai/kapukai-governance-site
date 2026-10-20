-- Explicit operator invitation email. Creating an invitation still does not send it.
-- Tokens and plaintext recipient addresses are never persisted in this delivery ledger.
begin;

create table kapukai_members.invitation_deliveries (
 id uuid primary key,
 invitation_id uuid not null references kapukai_members.invitations(id),
 actor_id uuid not null references auth.users(id),
 recipient_hash text not null check(recipient_hash ~ '^[0-9a-f]{64}$'),
 state text not null default 'pending' check(state in ('pending','accepted','failed','unknown')),
 provider_message_id text check(provider_message_id is null or length(provider_message_id) between 1 and 200),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 check((state='pending' and completed_at is null) or (state<>'pending' and completed_at is not null)),
 check((state='accepted' and provider_message_id is not null) or (state<>'accepted' and provider_message_id is null))
);
create unique index kapukai_member_invitation_one_handoff
 on kapukai_members.invitation_deliveries(invitation_id)
 where state in ('pending','accepted','unknown');
create index kapukai_member_invitation_delivery_recipient_rate
 on kapukai_members.invitation_deliveries(recipient_hash,created_at);
create index kapukai_member_invitation_delivery_actor_rate
 on kapukai_members.invitation_deliveries(actor_id,created_at);
alter table kapukai_members.invitation_deliveries enable row level security;
revoke all on kapukai_members.invitation_deliveries from public,anon,authenticated,service_role;

create function public.kapukai_member_invitation_delivery(
 p_user_id uuid,p_session_id uuid,p_action text,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 inv kapukai_members.invitations%rowtype;
 delivery kapukai_members.invitation_deliveries%rowtype;
 address text; target uuid; allowed text[]; send_now boolean:=false;
begin
 -- This is also the lock used for revocation, joining, access approval and pilot settings.
 perform pg_advisory_xact_lock(1792367556);
 if not kapukai_members.live_session(p_user_id,p_session_id)
 or not exists(select 1 from kapukai_members.operators where user_id=p_user_id)
 then return jsonb_build_object('result','forbidden');end if;
 if p_action is null or p_action not in ('prepare','status')
 or p_payload is null or jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>2048
 then return jsonb_build_object('result','invalid');end if;
 allowed:=case when p_action='prepare' then array['email','invite_token','delivery_id'] else array['email','invite_token'] end;
 if not p_payload ?& allowed or exists(select 1 from jsonb_object_keys(p_payload) k where k<>all(allowed))
 or exists(select 1 from jsonb_each(p_payload) e where jsonb_typeof(e.value)<>'string')
 then return jsonb_build_object('result','invalid');end if;
 address:=lower(btrim(p_payload->>'email'));
 if address is null or length(address)>254
 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or address<>translate(address,'<>,;:"()[]'||chr(92),'') or address ~ '[[:cntrl:]]'
 or p_payload->>'invite_token' !~ '^[0-9a-f]{64}$'
 then return jsonb_build_object('result','invalid');end if;
 if p_action='prepare' then
 if p_payload->>'delivery_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 then return jsonb_build_object('result','invalid');end if;
 target:=(p_payload->>'delivery_id')::uuid;
 end if;
 if not coalesce((select enabled from kapukai_members.config),false)
 then return jsonb_build_object('result','paused');end if;
 select * into inv from kapukai_members.invitations
 where token_hash=kapukai_members.hash(p_payload->>'invite_token')
 and email_hash=kapukai_members.hash(address) for update;
 if inv.id is null or inv.revoked or inv.claimed_by is not null
 then return jsonb_build_object('result','forbidden');end if;
 if inv.expires_at<=now() then return jsonb_build_object('result','expired');end if;

 if p_action='prepare' then
 select * into delivery from kapukai_members.invitation_deliveries where id=target for update;
 if delivery.id is not null then
 if delivery.invitation_id<>inv.id or delivery.actor_id<>p_user_id or delivery.recipient_hash<>inv.email_hash
 then return jsonb_build_object('result','idempotency_conflict');end if;
 -- A retried HTTP request can observe an earlier handoff, but never initiate it again.
 return jsonb_build_object('result','ok','should_send',false,'delivery_id',delivery.id,
 'invitation_id',inv.id,'expires_at',inv.expires_at,'state',delivery.state,'recipient',address);
 end if;
 end if;
 -- Prefer a blocking attempt even if historical rows have identical timestamps.
 select * into delivery from kapukai_members.invitation_deliveries where invitation_id=inv.id
 order by (state in ('pending','accepted','unknown')) desc,created_at desc,id desc limit 1 for update;
 if p_action='prepare' and (delivery.id is null or delivery.state='failed') then
 if (select count(*) from kapukai_members.invitation_deliveries where recipient_hash=inv.email_hash and created_at>now()-interval '1 day')>=3
 or (select count(*) from kapukai_members.invitation_deliveries where actor_id=p_user_id and created_at>now()-interval '1 day')>=30
 or (select count(*) from kapukai_members.invitation_deliveries where created_at>now()-interval '1 day')>=100
 then return jsonb_build_object('result','rate_limited');end if;
 insert into kapukai_members.invitation_deliveries(id,invitation_id,actor_id,recipient_hash)
 values(target,inv.id,p_user_id,inv.email_hash) returning * into delivery;
 insert into kapukai_members.audit(actor_id,action,target_id)
 values(p_user_id,'operator_invitation_email_prepare',inv.id);
 send_now:=true;
 end if;
 return jsonb_build_object('result','ok','should_send',send_now,'delivery_id',delivery.id,
 'invitation_id',inv.id,'expires_at',inv.expires_at,'state',coalesce(delivery.state,'none'),'recipient',address);
exception when invalid_text_representation or invalid_parameter_value or numeric_value_out_of_range or check_violation or not_null_violation
 then return jsonb_build_object('result','invalid');
end $$;

create function public.kapukai_member_invitation_mail_result(
 p_delivery_id uuid,p_state text,p_provider_message_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare delivery kapukai_members.invitation_deliveries%rowtype;
begin
 perform pg_advisory_xact_lock(1792367556);
 if p_delivery_id is null or p_state is null or p_state not in ('accepted','failed','unknown')
 or (p_state='accepted' and (p_provider_message_id is null or length(p_provider_message_id) not between 1 and 200 or p_provider_message_id ~ '[[:cntrl:]]'))
 or (p_state<>'accepted' and p_provider_message_id is not null)
 then return jsonb_build_object('result','invalid');end if;
 select * into delivery from kapukai_members.invitation_deliveries where id=p_delivery_id for update;
 if delivery.id is null then return jsonb_build_object('result','not_found');end if;
 -- The first terminal receipt is authoritative. In particular an uncertain handoff
 -- must never become a retryable failure after a later or replayed write.
 if delivery.state='pending' then
 update kapukai_members.invitation_deliveries
 set state=p_state,provider_message_id=p_provider_message_id,completed_at=now()
 where id=delivery.id returning * into delivery;
 insert into kapukai_members.audit(actor_id,action,target_id,reason_code)
 values(delivery.actor_id,'operator_invitation_email_result',delivery.invitation_id,delivery.state);
 end if;
 return jsonb_build_object('result','ok','state',delivery.state);
end $$;

revoke all on function public.kapukai_member_invitation_delivery(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.kapukai_member_invitation_mail_result(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.kapukai_member_invitation_delivery(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.kapukai_member_invitation_mail_result(uuid,text,text) to service_role;
commit;
