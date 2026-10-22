-- Additive Lab booking candidate. Requires installed kapukai_members.live_session.
-- Empty grants and operating windows; no production availability invented.
begin;
create schema kapukai_lab;
revoke all on schema kapukai_lab from public,anon,authenticated,service_role;
create table kapukai_lab.config(id boolean primary key default true check(id),enabled boolean not null default false,timezone text not null default 'America/New_York' check(timezone='America/New_York'),policy_version integer not null default 3);
insert into kapukai_lab.config default values;
create table kapukai_lab.operators(user_id uuid primary key references auth.users,granted_at timestamptz not null default now());
create table kapukai_lab.members(user_id uuid primary key references auth.users,active boolean not null,updated_at timestamptz not null default now(),granted_by uuid not null references auth.users);
create table kapukai_lab.rooms(id text primary key,name text not null,capacity integer not null check(capacity between 1 and 6));
insert into kapukai_lab.rooms values('lounge','Meeting lounge',6),('conference','Conference room',6),('classroom','Classroom',6);
create table kapukai_lab.windows(id uuid primary key default gen_random_uuid(),room_id text not null references kapukai_lab.rooms,starts_at timestamptz not null,ends_at timestamptz not null,created_by uuid not null references auth.users,check(ends_at>starts_at),unique(room_id,starts_at,ends_at));
create table kapukai_lab.bookings(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users,room_id text not null references kapukai_lab.rooms,starts_at timestamptz not null,ends_at timestamptz not null,kind text not null check(kind in('room','organize','class','class_seat')),class_id uuid references kapukai_lab.bookings,title text,participants integer not null check(participants between 1 and 6),status text not null default 'confirmed' check(status in('confirmed','cancelled')),version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(ends_at>starts_at),check((kind='class_seat')=(class_id is not null)));
create index lab_inventory on kapukai_lab.bookings(room_id,starts_at,ends_at) where status='confirmed' and kind<>'class_seat';
create unique index lab_class_member on kapukai_lab.bookings(class_id,user_id) where status='confirmed' and kind='class_seat';
create table kapukai_lab.requests(user_id uuid not null references auth.users,request_id uuid not null,action text not null,payload jsonb not null,response jsonb not null,created_at timestamptz not null default now(),primary key(user_id,request_id));
create table kapukai_lab.audit(id bigint generated always as identity primary key,actor_id uuid references auth.users,session_id uuid,action text not null,outcome text not null,request_id uuid,booking_id uuid,detail jsonb not null default '{}',policy_version integer not null,created_at timestamptz not null default now());
create table kapukai_lab.outbox(id uuid primary key default gen_random_uuid(),request_id uuid not null,booking_id uuid not null references kapukai_lab.bookings,version integer not null,audience text not null check(audience in('member','operator')),recipient text not null,subject text not null,body text not null,status text not null default 'pending' check(status in('pending','sending','accepted','failed','unknown')),provider_id text,created_at timestamptz not null default now(),claimed_at timestamptz,finished_at timestamptz,unique(booking_id,version,audience));

create table kapukai_lab.mail_audit(id bigint generated always as identity primary key,outbox_id uuid not null references kapukai_lab.outbox,status text not null,provider_id text,created_at timestamptz not null default now());

create function kapukai_lab.keys(p jsonb,k text[]) returns boolean language sql immutable set search_path='' as $$ select coalesce(jsonb_typeof(p)='object' and p ?& k and not exists(select 1 from jsonb_object_keys(p) x where not x=any(k)),false) $$;
create function kapukai_lab.time_value(v jsonb) returns timestamptz language plpgsql immutable set search_path='' as $$ begin
 if jsonb_typeof(v) is distinct from 'string' or (v#>>'{}') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$' then raise exception 'INVALID_REQUEST';end if;
 return (v#>>'{}')::timestamptz;
end $$;
create function kapukai_lab.validate_time(r text,s timestamptz,e timestamptz) returns void language plpgsql set search_path='' as $$ begin
 if s is null or e is null or not isfinite(s) or not isfinite(e) or e<s+interval '15 minutes' or s<=now() or date_trunc('minute',s)<>s or date_trunc('minute',e)<>e or mod(extract(minute from s at time zone 'America/New_York')::integer,15)<>0 or mod(extract(minute from e at time zone 'America/New_York')::integer,15)<>0 or not exists(select 1 from kapukai_lab.rooms where id=r) then raise exception 'INVALID_REQUEST';end if;
 if not exists(select 1 from kapukai_lab.windows where room_id=r and starts_at<=s and ends_at>=e) then raise exception 'OUTSIDE_HOURS';end if;
end $$;
-- Member reservations are bounded by the Lab's local calendar week.
-- Explicit reference_time supports pure arithmetic verification; callers use the server clock.
create function kapukai_lab.validate_booking_week(s timestamptz,e timestamptz,reference_time timestamptz default clock_timestamp()) returns void language plpgsql immutable set search_path='' as $$
declare week_start timestamp:=date_trunc('week',reference_time at time zone 'America/New_York');
begin
 if s is null or e is null or reference_time is null or not isfinite(s) or not isfinite(e) or not isfinite(reference_time) or e<=s or s<(week_start at time zone 'America/New_York') or s>=((week_start+interval '7 days') at time zone 'America/New_York') or e>((week_start+interval '7 days') at time zone 'America/New_York') then raise exception 'OUTSIDE_CURRENT_WEEK';end if;
end $$;
create function kapukai_lab.conflict(u uuid,r text,s timestamptz,e timestamptz,exclude_id uuid default null,seat boolean default false) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from kapukai_lab.bookings b where b.status='confirmed' and (exclude_id is null or b.id<>exclude_id) and b.starts_at<e and b.ends_at>s and ((not seat and b.room_id=r and b.kind<>'class_seat') or (b.user_id=u and b.kind<>'class')));
$$;
create function kapukai_lab.booking_json(b kapukai_lab.bookings) returns jsonb language sql immutable set search_path='' as $$ select jsonb_build_object('id',b.id,'room_id',b.room_id,'starts_at',b.starts_at,'ends_at',b.ends_at,'kind',b.kind,'class_id',b.class_id,'status',b.status,'version',b.version,'participants',b.participants) $$;
create function kapukai_lab.notice(b kapukai_lab.bookings,request uuid,verb text) returns void language plpgsql set search_path='' as $$ declare email text; body text;begin
 select u.email into email from auth.users u where u.id=b.user_id;
 body:='Kapukai Governance Lab booking '||verb||E'\nReference: '||b.id||E'\nRoom: '||(select name from kapukai_lab.rooms where id=b.room_id)||E'\nStart: '||to_char(b.starts_at at time zone 'America/New_York','YYYY-MM-DD HH24:MI')||E' America/New_York\nEnd: '||to_char(b.ends_at at time zone 'America/New_York','YYYY-MM-DD HH24:MI')||E' America/New_York\nStatus: '||b.status||E'\nManage your bookings: https://kapukai-community.vercel.app/lab/';
 insert into kapukai_lab.outbox(request_id,booking_id,version,audience,recipient,subject,body) values(request,b.id,b.version,'member',email,'Kapukai Lab — booking '||verb,body),(request,b.id,b.version,'operator','architect@kapukai.org','Kapukai Lab — booking '||verb,body);
end $$;
create function kapukai_lab.state(u uuid,op boolean,access boolean,p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare cfg kapukai_lab.config;w date;
begin
 select * into cfg from kapukai_lab.config;
  if not kapukai_lab.keys(p,array['week_start']) or jsonb_typeof(p->'week_start') is distinct from 'string' or (p->>'week_start') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_REQUEST';end if; w:=(p->>'week_start')::date;
  return jsonb_build_object('ok',true,'access',access,'operator',op,'enabled',cfg.enabled,'timezone',cfg.timezone,'rooms',case when access or op then (select jsonb_agg(to_jsonb(x) order by x.id) from kapukai_lab.rooms x) else '[]'::jsonb end,
  'windows',case when access or op then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'room_id',x.room_id,'starts_at',x.starts_at,'ends_at',x.ends_at) order by starts_at) from kapukai_lab.windows x where x.starts_at<((w+7)::timestamp at time zone cfg.timezone) and x.ends_at>(w::timestamp at time zone cfg.timezone)),'[]'::jsonb) else '[]'::jsonb end,
  'reservations',case when access or op then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'room_id',x.room_id,'starts_at',x.starts_at,'ends_at',x.ends_at,'kind',x.kind,'title',case when x.kind='class' then x.title else 'Reserved' end,'capacity',x.participants,'seats_taken',(select count(*) from kapukai_lab.bookings z where z.class_id=x.id and z.status='confirmed')) order by x.starts_at) from kapukai_lab.bookings x where x.status='confirmed' and x.kind<>'class_seat' and x.starts_at<((w+7)::timestamp at time zone cfg.timezone) and x.ends_at>(w::timestamp at time zone cfg.timezone)),'[]'::jsonb) else '[]'::jsonb end,
  'mine',coalesce((select jsonb_agg(kapukai_lab.booking_json(x) order by x.starts_at) from kapukai_lab.bookings x where x.user_id=u and x.kind<>'class' and x.ends_at>now()-interval '30 days'),'[]'::jsonb)) || case when op then jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'active',m.active,'email',(select email from auth.users where id=m.user_id)) order by m.user_id) from kapukai_lab.members m),'[]'::jsonb),'mail_status',coalesce((select jsonb_object_agg(x.status,x.n) from(select status,count(*) n from kapukai_lab.outbox group by status)x),'{}'::jsonb)) else '{}'::jsonb end;
end $$;

create function kapukai_lab.operator_action(u uuid,op boolean,a text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare target uuid; wi kapukai_lab.windows; r text;s timestamptz;e timestamptz;
begin
  if not op then raise exception 'FORBIDDEN';end if;
  if a='operator_dispatch' then if not kapukai_lab.keys(p,array[]::text[]) then raise exception 'INVALID_REQUEST';end if; return jsonb_build_object('ok',true);end if;
  if a='operator_member' then
   if not (kapukai_lab.keys(p,array['user_id','active']) or kapukai_lab.keys(p,array['email','active'])) or jsonb_typeof(p->'active') is distinct from 'boolean' then raise exception 'INVALID_REQUEST';end if;
   if p ? 'email' then
    if jsonb_typeof(p->'email') is distinct from 'string' or length(p->>'email')>254 or (p->>'email')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_REQUEST';end if;
    if (select count(*) from auth.users where lower(email)=lower(btrim(p->>'email')) and email_confirmed_at is not null and deleted_at is null)<>1 then raise exception 'NOT_FOUND';end if;
    select id into target from auth.users where lower(email)=lower(btrim(p->>'email')) and email_confirmed_at is not null and deleted_at is null;
   else target:=(p->>'user_id')::uuid;end if;
   if not exists(select 1 from auth.users where id=target and email_confirmed_at is not null and deleted_at is null and not coalesce(is_anonymous,false) and role='authenticated' and (banned_until is null or banned_until<=now())) then raise exception 'NOT_FOUND';end if;
   insert into kapukai_lab.members(user_id,active,granted_by) values(target,(p->>'active')::boolean,u) on conflict(user_id) do update set active=excluded.active,updated_at=now(),granted_by=u;
   return jsonb_build_object('ok',true);
  elsif a='operator_window_remove' then
   if not kapukai_lab.keys(p,array['window_id']) then raise exception 'INVALID_REQUEST';end if;
   select * into wi from kapukai_lab.windows where id=(p->>'window_id')::uuid;if not found then raise exception 'NOT_FOUND';end if;
   if exists(select 1 from kapukai_lab.bookings x where x.status='confirmed' and x.kind<>'class_seat' and x.room_id=wi.room_id and wi.starts_at<=x.starts_at and wi.ends_at>=x.ends_at and not exists(select 1 from kapukai_lab.windows z where z.id<>wi.id and z.room_id=x.room_id and z.starts_at<=x.starts_at and z.ends_at>=x.ends_at)) then raise exception 'CONFLICT';end if;
   delete from kapukai_lab.windows where id=wi.id;return jsonb_build_object('ok',true);
  elsif a='operator_config' then
   if not kapukai_lab.keys(p,array['enabled']) or jsonb_typeof(p->'enabled') is distinct from 'boolean' then raise exception 'INVALID_REQUEST';end if;
   update kapukai_lab.config set enabled=(p->>'enabled')::boolean,policy_version=policy_version+1;return jsonb_build_object('ok',true);
  elsif a='operator_window' then
   if not kapukai_lab.keys(p,array['room_id','starts_at','ends_at']) then raise exception 'INVALID_REQUEST';end if;
   r:=p->>'room_id';s:=kapukai_lab.time_value(p->'starts_at');e:=kapukai_lab.time_value(p->'ends_at');
   if not exists(select 1 from kapukai_lab.rooms where id=r) or e<s+interval '15 minutes' or date_trunc('minute',s)<>s or date_trunc('minute',e)<>e or mod(extract(minute from s at time zone 'America/New_York')::integer,15)<>0 or mod(extract(minute from e at time zone 'America/New_York')::integer,15)<>0 then raise exception 'INVALID_REQUEST';end if;
   insert into kapukai_lab.windows(room_id,starts_at,ends_at,created_by) values(r,s,e,u) on conflict do nothing;return jsonb_build_object('ok',true);
  elsif a not in('operator_class','operator_class_cancel') then raise exception 'INVALID_REQUEST';end if;
 return null;
end $$;

create function kapukai_lab.change_booking(u uuid,a text,p jsonb,req uuid) returns kapukai_lab.bookings language plpgsql set search_path='' as $$
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

create function kapukai_lab.run(u uuid,op boolean,access boolean,a text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare cfg kapukai_lab.config; w date; s timestamptz;e timestamptz;r text;n integer; req uuid; bid uuid; b kapukai_lab.bookings; c kapukai_lab.bookings; old kapukai_lab.requests; result jsonb; target uuid; wi kapukai_lab.windows;
begin
 select * into cfg from kapukai_lab.config;
 if a='state' then return kapukai_lab.state(u,op,access,p);end if;
 if a like 'operator_%' then
  result:=kapukai_lab.operator_action(u,op,a,p);if result is not null then return result;end if;
 elsif a not in('book','join_class','cancel','reschedule') then raise exception 'INVALID_REQUEST';end if;
 if a<>'cancel' and not op and not access then raise exception 'FORBIDDEN';end if;
 if a in('book','join_class','reschedule') and not access then raise exception 'FORBIDDEN';end if;
 if a not in('cancel','operator_class_cancel') and not cfg.enabled then raise exception 'DISABLED';end if;
 if not (p ? 'request_id') or jsonb_typeof(p->'request_id') is distinct from 'string' then raise exception 'INVALID_REQUEST';end if;req:=(p->>'request_id')::uuid;
 select * into old from kapukai_lab.requests where user_id=u and request_id=req;
 if found then if old.action<>a or old.payload<>p then raise exception 'IDEMPOTENCY_CONFLICT';end if;return old.response;end if;
 b:=kapukai_lab.change_booking(u,a,p,req);
 if a not in('operator_class','operator_class_cancel') then perform kapukai_lab.notice(b,req,case when a='cancel' then 'cancelled' when a='reschedule' then 'rescheduled' else 'confirmed' end);end if;
 result:=jsonb_build_object('ok',true,'booking',kapukai_lab.booking_json(b));
 insert into kapukai_lab.requests values(u,req,a,p,result,now());return result;
end $$;

-- One low-volume Lab lock makes decisions serial, including grant revocation,
-- inventory, seat counts and idempotency. All writes enter through this boundary.
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
  code:=sqlerrm;if code not in('INVALID_REQUEST','FORBIDDEN','DISABLED','CONFLICT','OUTSIDE_HOURS','OUTSIDE_CURRENT_WEEK','NOT_FOUND','CAPACITY_FULL','IDEMPOTENCY_CONFLICT') then code:='INVALID_REQUEST';end if;
  result:=jsonb_build_object('ok',false,'error',code);
 end;
 begin req:=(p_payload->>'request_id')::uuid;exception when others then req:=null;end;
 bid:=(result->'booking'->>'id')::uuid;
 detail:=case when p_action='operator_member' then jsonb_build_object('target_user',coalesce(p_payload->>'user_id',(select id::text from auth.users where lower(email)=lower(p_payload->>'email') order by id limit 1)),'active',p_payload->'active','before',before_member) when p_action='operator_window' then p_payload when p_action='operator_window_remove' then jsonb_build_object('window_id',p_payload->'window_id') when p_action='operator_config' then jsonb_build_object('before',before_config,'after',p_payload) when p_action='operator_class_cancel' then jsonb_build_object('class_id',p_payload->'class_id') else jsonb_strip_nulls(jsonb_build_object('room_id',p_payload->'room_id','starts_at',p_payload->'starts_at','ends_at',p_payload->'ends_at','booking_id',p_payload->'booking_id','class_id',p_payload->'class_id')) end;
 if p_action<>'state' or not coalesce((result->>'ok')::boolean,false) then insert into kapukai_lab.audit(actor_id,session_id,action,outcome,request_id,booking_id,detail,policy_version) values(p_user,p_session,left(coalesce(p_action,''),40),case when (result->>'ok')::boolean then 'allowed' else result->>'error' end,req,bid,detail,pv);end if;
 return result;
end $$;
create function public.kapukai_lab_mail(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer; rid uuid; mid uuid; messages jsonb; st text;
begin
 if p_action='claim' then
  if jsonb_typeof(p_payload) is distinct from 'object' or not p_payload ? 'limit' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in('limit','request_id')) or jsonb_typeof(p_payload->'limit') is distinct from 'number' or (p_payload->>'limit')!~'^(20|1[0-9]|[1-9])$' then return jsonb_build_object('ok',false,'error','INVALID_REQUEST');end if;
  n:=(p_payload->>'limit')::integer;rid:=(p_payload->>'request_id')::uuid;
  with claim as (select id from kapukai_lab.outbox where status='pending' and (rid is null or request_id=rid) order by created_at,id for update skip locked limit n), changed as(update kapukai_lab.outbox o set status='sending',claimed_at=now() from claim where o.id=claim.id returning o.id,o.recipient,o.subject,o.body)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'to',recipient,'subject',subject,'text',body)),'[]'::jsonb) into messages from changed;
  insert into kapukai_lab.mail_audit(outbox_id,status) select (x->>'id')::uuid,'sending' from jsonb_array_elements(messages) x;
  return jsonb_build_object('ok',true,'messages',messages);
 elsif p_action='finish' then
  if jsonb_typeof(p_payload) is distinct from 'object' or not p_payload ?& array['id','status'] or exists(select 1 from jsonb_object_keys(p_payload) k where k not in('id','status','provider_id')) or jsonb_typeof(p_payload->'status') is distinct from 'string' or p_payload->>'status' not in('accepted','failed','unknown') or length(coalesce(p_payload->>'provider_id',''))>200 or (p_payload->>'status'='accepted' and (jsonb_typeof(p_payload->'provider_id') is distinct from 'string' or length(btrim(p_payload->>'provider_id'))=0)) or (p_payload->>'status'<>'accepted' and p_payload ? 'provider_id') then return jsonb_build_object('ok',false,'error','INVALID_REQUEST');end if;
  mid:=(p_payload->>'id')::uuid;st:=p_payload->>'status';
  update kapukai_lab.outbox set status=st,provider_id=p_payload->>'provider_id',finished_at=now() where id=mid and status='sending';
  if not found then return jsonb_build_object('ok',false,'error','CONFLICT');end if;insert into kapukai_lab.mail_audit(outbox_id,status,provider_id) values(mid,st,p_payload->>'provider_id');return jsonb_build_object('ok',true);
 end if;return jsonb_build_object('ok',false,'error','INVALID_REQUEST');
exception when invalid_text_representation then return jsonb_build_object('ok',false,'error','INVALID_REQUEST');
end $$;

do $$ declare t record;begin for t in select tablename from pg_tables where schemaname='kapukai_lab' loop execute format('alter table kapukai_lab.%I enable row level security',t.tablename);end loop;end $$;
revoke all on all tables in schema kapukai_lab from public,anon,authenticated,service_role;
revoke all on all sequences in schema kapukai_lab from public,anon,authenticated,service_role;
revoke all on all functions in schema kapukai_lab from public,anon,authenticated,service_role;
revoke all on function public.kapukai_lab_command(uuid,uuid,text,jsonb),public.kapukai_lab_mail(text,jsonb) from public,anon,authenticated;
grant execute on function public.kapukai_lab_command(uuid,uuid,text,jsonb),public.kapukai_lab_mail(text,jsonb) to service_role;
commit;
