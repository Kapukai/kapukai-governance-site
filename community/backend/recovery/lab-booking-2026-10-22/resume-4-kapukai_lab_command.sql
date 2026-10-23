begin;
create function public.kapukai_lab_command(p_user uuid,p_session uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; op boolean; access boolean; pv integer; req uuid;bid uuid; code text; detail jsonb; before_config jsonb; before_member jsonb;
begin
 select policy_version into pv from kapukai_lab.config where id for update;
 if not kapukai_members.live_session(p_user,p_session) then
  insert into kapukai_lab.audit(actor_id,session_id,action,outcome,policy_version) values((select id from auth.users where id=p_user),p_session,left(coalesce(p_action,''),40),'FORBIDDEN',pv);
  return jsonb_build_object('ok',false,'error','FORBIDDEN');end if;
 op:=exists(select 1 from kapukai_lab.operators where user_id=p_user);access:=exists(select 1 from kapukai_lab.members where user_id=p_user and active);
 begin
  if p_action is null or length(p_action)>40 or p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16384 then raise exception 'INVALID_REQUEST';end if;
  if p_action='operator_member' and op then select jsonb_build_object('active',m.active,'user_id',m.user_id) into before_member from kapukai_lab.members m join auth.users au on au.id=m.user_id where m.user_id::text=p_payload->>'user_id' or lower(au.email)=lower(p_payload->>'email');end if;
  if p_action='operator_config' and op then select to_jsonb(x) into before_config from kapukai_lab.config x;end if;
  result:=kapukai_lab.run(p_user,op,access,p_action,p_payload);
 exception when others then
  code:=sqlerrm;if code not in('INVALID_REQUEST','FORBIDDEN','DISABLED','CONFLICT','OUTSIDE_HOURS','NOT_FOUND','CAPACITY_FULL','IDEMPOTENCY_CONFLICT') then code:='INVALID_REQUEST';end if;
  result:=jsonb_build_object('ok',false,'error',code);
 end;
 begin req:=(p_payload->>'request_id')::uuid;exception when others then req:=null;end;
 bid:=(result->'booking'->>'id')::uuid;
 detail:=case when p_action='operator_member' then jsonb_build_object('target_user',coalesce(p_payload->>'user_id',(select id::text from auth.users where lower(email)=lower(p_payload->>'email') order by id limit 1)),'active',p_payload->'active','before',before_member) when p_action='operator_window' then p_payload when p_action='operator_window_remove' then jsonb_build_object('window_id',p_payload->'window_id') when p_action='operator_config' then jsonb_build_object('before',before_config,'after',p_payload) when p_action='operator_class_cancel' then jsonb_build_object('class_id',p_payload->'class_id') else jsonb_strip_nulls(jsonb_build_object('room_id',p_payload->'room_id','starts_at',p_payload->'starts_at','ends_at',p_payload->'ends_at','booking_id',p_payload->'booking_id','class_id',p_payload->'class_id')) end;
 if p_action<>'state' or not coalesce((result->>'ok')::boolean,false) then insert into kapukai_lab.audit(actor_id,session_id,action,outcome,request_id,booking_id,detail,policy_version) values(p_user,p_session,left(coalesce(p_action,''),40),case when (result->>'ok')::boolean then 'allowed' else result->>'error' end,req,bid,detail,pv);end if;
 return result;
end $$;
revoke all on function public.kapukai_lab_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.kapukai_lab_command(uuid,uuid,text,jsonb) to service_role;
commit;
