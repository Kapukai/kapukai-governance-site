-- Current-week reservation policy; no membership or availability changes.
begin;
select 1 from kapukai_lab.config where id for update;
create or replace function kapukai_lab.validate_booking_week(s timestamptz,e timestamptz,reference_time timestamptz default clock_timestamp()) returns void language plpgsql immutable set search_path='' as $$
declare week_start timestamp:=date_trunc('week',reference_time at time zone 'America/New_York');
begin
 if s is null or e is null or reference_time is null or not isfinite(s) or not isfinite(e) or not isfinite(reference_time) or e<=s or s<(week_start at time zone 'America/New_York') or s>=((week_start+interval '7 days') at time zone 'America/New_York') or e>((week_start+interval '7 days') at time zone 'America/New_York') then raise exception 'OUTSIDE_CURRENT_WEEK';end if;
end $$;

create or replace function kapukai_lab.change_booking(u uuid,a text,p jsonb,req uuid) returns kapukai_lab.bookings language plpgsql set search_path='' as $$
declare b kapukai_lab.bookings;c kapukai_lab.bookings;r text;s timestamptz;e timestamptz;n integer;
begin
 if a='operator_class_cancel' then
  if not kapukai_lab.keys(p,array['request_id','class_id']) then raise exception 'INVALID_REQUEST';end if;
  select * into c from kapukai_lab.bookings where id=(p->>'class_id')::uuid and kind='class' and status='confirmed';if not found then raise exception 'NOT_FOUND';end if;
  for b in update kapukai_lab.bookings set status='cancelled',version=version+1,updated_at=now() where class_id=c.id and status='confirmed' returning * loop perform kapukai_lab.notice(b,req,'cancelled');end loop;
  update kapukai_lab.bookings set status='cancelled',version=version+1,updated_at=now() where id=c.id returning * into b;
 elsif a in('book','operator_class') then
  if a='book' then
   if not kapukai_lab.keys(p,array['request_id','room_id','starts_at','ends_at','participants','mode']) or jsonb_typeof(p->'participants') is distinct from 'number' or (p->>'participants')!~'^[1-6]$' or p->>'mode' not in('room','organize') then raise exception 'INVALID_REQUEST';end if;n:=(p->>'participants')::integer;
  else
   if not kapukai_lab.keys(p,array['request_id','room_id','starts_at','ends_at','title','capacity']) or jsonb_typeof(p->'capacity') is distinct from 'number' or (p->>'capacity')!~'^[1-6]$' or jsonb_typeof(p->'title') is distinct from 'string' or length(btrim(p->>'title')) not between 1 and 100 or (p->>'title')~'[[:cntrl:]]' then raise exception 'INVALID_REQUEST';end if;n:=(p->>'capacity')::integer;
  end if;
  r:=p->>'room_id';s:=kapukai_lab.time_value(p->'starts_at');e:=kapukai_lab.time_value(p->'ends_at');perform kapukai_lab.validate_time(r,s,e);
  if a='book' then perform kapukai_lab.validate_booking_week(s,e);end if;
  if kapukai_lab.conflict(u,r,s,e) then raise exception 'CONFLICT';end if;
  insert into kapukai_lab.bookings(user_id,room_id,starts_at,ends_at,kind,title,participants) values(u,r,s,e,case when a='operator_class' then 'class' else p->>'mode' end,case when a='operator_class' then p->>'title' end,n) returning * into b;
 elsif a='join_class' then
  if not kapukai_lab.keys(p,array['request_id','class_id']) then raise exception 'INVALID_REQUEST';end if;
  select * into c from kapukai_lab.bookings where id=(p->>'class_id')::uuid and kind='class' and status='confirmed';if not found then raise exception 'NOT_FOUND';end if;
  if c.starts_at<=now() then raise exception 'INVALID_REQUEST';end if;
  perform kapukai_lab.validate_booking_week(c.starts_at,c.ends_at);
  if exists(select 1 from kapukai_lab.bookings where class_id=c.id and user_id=u and status='confirmed') then raise exception 'CONFLICT';end if;
  if (select count(*) from kapukai_lab.bookings where class_id=c.id and status='confirmed')>=c.participants then raise exception 'CAPACITY_FULL';end if;
  if kapukai_lab.conflict(u,c.room_id,c.starts_at,c.ends_at,null,true) then raise exception 'CONFLICT';end if;
  insert into kapukai_lab.bookings(user_id,room_id,starts_at,ends_at,kind,class_id,participants) values(u,c.room_id,c.starts_at,c.ends_at,'class_seat',c.id,1) returning * into b;
 else
  if not kapukai_lab.keys(p,case when a='cancel' then array['request_id','booking_id'] else array['request_id','booking_id','starts_at','ends_at'] end) then raise exception 'INVALID_REQUEST';end if;
  select * into b from kapukai_lab.bookings where id=(p->>'booking_id')::uuid and user_id=u and kind<>'class';if not found then raise exception 'NOT_FOUND';end if;
  if b.status<>'confirmed' then raise exception 'CONFLICT';end if;
  if a='cancel' then update kapukai_lab.bookings set status='cancelled',version=version+1,updated_at=now() where id=b.id returning * into b;
  else
   if b.kind='class_seat' then raise exception 'INVALID_REQUEST';end if;
   s:=kapukai_lab.time_value(p->'starts_at');e:=kapukai_lab.time_value(p->'ends_at');perform kapukai_lab.validate_time(b.room_id,s,e);perform kapukai_lab.validate_booking_week(s,e);
   if kapukai_lab.conflict(u,b.room_id,s,e,b.id) then raise exception 'CONFLICT';end if;
   update kapukai_lab.bookings set starts_at=s,ends_at=e,version=version+1,updated_at=now() where id=b.id returning * into b;
  end if;
 end if;
 return b;
end $$;

create or replace function public.kapukai_lab_command(p_user uuid,p_session uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  code:=sqlerrm;if code not in('INVALID_REQUEST','FORBIDDEN','DISABLED','CONFLICT','OUTSIDE_HOURS','OUTSIDE_CURRENT_WEEK','NOT_FOUND','CAPACITY_FULL','IDEMPOTENCY_CONFLICT') then code:='INVALID_REQUEST';end if;
  result:=jsonb_build_object('ok',false,'error',code);
 end;
 begin req:=(p_payload->>'request_id')::uuid;exception when others then req:=null;end;
 bid:=(result->'booking'->>'id')::uuid;
 detail:=case when p_action='operator_member' then jsonb_build_object('target_user',coalesce(p_payload->>'user_id',(select id::text from auth.users where lower(email)=lower(p_payload->>'email') order by id limit 1)),'active',p_payload->'active','before',before_member) when p_action='operator_window' then p_payload when p_action='operator_window_remove' then jsonb_build_object('window_id',p_payload->'window_id') when p_action='operator_config' then jsonb_build_object('before',before_config,'after',p_payload) when p_action='operator_class_cancel' then jsonb_build_object('class_id',p_payload->'class_id') else jsonb_strip_nulls(jsonb_build_object('room_id',p_payload->'room_id','starts_at',p_payload->'starts_at','ends_at',p_payload->'ends_at','booking_id',p_payload->'booking_id','class_id',p_payload->'class_id')) end;
 if p_action<>'state' or not coalesce((result->>'ok')::boolean,false) then insert into kapukai_lab.audit(actor_id,session_id,action,outcome,request_id,booking_id,detail,policy_version) values(p_user,p_session,left(coalesce(p_action,''),40),case when (result->>'ok')::boolean then 'allowed' else result->>'error' end,req,bid,detail,pv);end if;
 return result;
end $$;
revoke all on function kapukai_lab.validate_booking_week(timestamptz,timestamptz,timestamptz) from public,anon,authenticated,service_role;
do $$ declare version integer;begin
 update kapukai_lab.config set policy_version=policy_version+1 where id returning policy_version into version;
 insert into kapukai_lab.audit(action,outcome,detail,policy_version) values('policy_current_week','allowed','{"rule":"member bookings, reschedules and class seats: current Monday-Sunday in America/New_York","source":"owner instruction 2026-10-22"}',version);
end $$;
commit;
