-- HISTORICAL first-install acceptance (before current-week policy); do not rerun.
-- Use lab-current-week-live.sql for current-week verification.
-- Run as ONE administrative call, only on the initial disabled, empty Lab.
-- Reviewed auth triggers are transactional CRM writes only; no network side effects.
-- This creates no credentials, calls no Auth API or email provider, and rolls back ALL data.
-- This validates real PostgreSQL rules, not browser login or provider delivery/concurrency.
begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
do $acceptance$
declare
 o uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 os uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); sx uuid:=gen_random_uuid();
 req uuid:=gen_random_uuid(); booking uuid; klass uuid; seat uuid; other_booking uuid; mail uuid;
 r jsonb; replay jsonb; p jsonb; st jsonb; claimed jsonb;
 day date:=((now() at time zone 'America/New_York')::date+7);
 start_at text; end_at text; later_at text; close_at text;
 role_name text; item record; checks integer:=0;
begin
 -- Lock initial rollout state for this short rollback-only acceptance transaction.
 perform 1 from kapukai_lab.config where id for update;
 if not exists(select 1 from kapukai_lab.config where id and not enabled)
 or exists(select 1 from kapukai_lab.bookings) or exists(select 1 from kapukai_lab.outbox)
 or exists(select 1 from kapukai_lab.members) or exists(select 1 from kapukai_lab.windows)
 then raise exception 'ACCEPTANCE_REQUIRES_DISABLED_EMPTY_LAB';end if;
 for role_name in select unnest(array['anon','authenticated','service_role']) loop
  if has_schema_privilege(role_name,'kapukai_lab','USAGE') then raise exception 'FAIL private schema usage';end if;
  for item in select c.oid,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kapukai_lab' and c.relkind='r' loop
   if not item.relrowsecurity or has_table_privilege(role_name,item.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'FAIL table boundary';end if;
  end loop;
  for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kapukai_lab' loop
   if has_function_privilege(role_name,item.oid,'EXECUTE') then raise exception 'FAIL private helper executable';end if;
  end loop;
  if has_function_privilege(role_name,'public.kapukai_lab_command(uuid,uuid,text,jsonb)','EXECUTE') is distinct from (role_name='service_role')
  or has_function_privilege(role_name,'public.kapukai_lab_mail(text,jsonb)','EXECUTE') is distinct from (role_name='service_role') then raise exception 'FAIL RPC grants';end if;
 end loop;
 for role_name in select unnest(array['anon','authenticated']) loop
  execute format('set local role %I',role_name);
  begin perform public.kapukai_lab_command(a,sa,'state',jsonb_build_object('week_start',day));raise exception 'FAIL browser command';exception when insufficient_privilege then null;end;
  begin perform public.kapukai_lab_mail('claim','{"limit":10}');raise exception 'FAIL browser mail';exception when insufficient_privilege then null;end;
  execute 'reset role';
 end loop;
 checks:=checks+1;
 insert into auth.users(id,email,email_confirmed_at,role,is_anonymous,created_at,updated_at) values
 (o,'lab-security-'||o||'@example.invalid',now(),'authenticated',false,now(),now()),
 (a,'lab-security-'||a||'@example.invalid',now(),'authenticated',false,now(),now()),
 (b,'lab-security-'||b||'@example.invalid',now(),'authenticated',false,now(),now()),
 (outsider,'lab-security-'||outsider||'@example.invalid',now(),'authenticated',false,now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values
 (os,o,now(),now(),now()+interval '1 hour'),(sa,a,now(),now(),now()+interval '1 hour'),(sb,b,now(),now(),now()+interval '1 hour'),(sx,outsider,now(),now(),now()+interval '1 hour');
 insert into kapukai_lab.operators(user_id) values(o);
 -- Ordinary community membership does not confer Lab access.
 insert into kapukai_members.members(id,display_name) values(outsider,'Synthetic outsider');
 execute 'set local role service_role';
 r:=public.kapukai_lab_command(outsider,sx,'state',jsonb_build_object('week_start',day));
 if r->>'ok' is distinct from 'true' or r->>'access' is distinct from 'false' or r->>'operator' is distinct from 'false' or jsonb_array_length(r->'reservations')<>0 or r?'members' then raise exception 'FAIL separate Lab grant: %',r;end if;
 r:=public.kapukai_lab_command(a,sb,'state',jsonb_build_object('week_start',day));
 if r->>'ok' is distinct from 'false' then raise exception 'FAIL foreign session';end if;
 r:=public.kapukai_lab_command(outsider,sx,'operator_config','{"enabled":true}');
 if r->>'ok' is distinct from 'false' then raise exception 'FAIL operator escalation';end if;
 r:=public.kapukai_lab_command(o,os,'operator_member',jsonb_build_object('user_id',a,'active',true));
 if r->>'ok' is distinct from 'true' then raise exception 'FAIL grant A: %',r;end if;
 r:=public.kapukai_lab_command(o,os,'operator_member',jsonb_build_object('user_id',b,'active',true));
 if r->>'ok' is distinct from 'true' then raise exception 'FAIL grant B';end if;
 checks:=checks+1;
 start_at:=to_char((day+time '09:00') at time zone 'America/New_York' at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
 end_at:=to_char((day+time '09:47') at time zone 'America/New_York' at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
 later_at:=to_char((day+time '11:00') at time zone 'America/New_York' at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
 close_at:=to_char((day+time '17:00') at time zone 'America/New_York' at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
 p:=jsonb_build_object('request_id',req,'room_id','lounge','starts_at',start_at,'ends_at',end_at,'participants',6,'mode','room');
 r:=public.kapukai_lab_command(a,sa,'book',p);
 if r->>'error' is distinct from 'DISABLED' then raise exception 'FAIL disabled booking';end if;
 perform public.kapukai_lab_command(o,os,'operator_config','{"enabled":true}');
 r:=public.kapukai_lab_command(a,sa,'book',p);
 if r->>'error' is distinct from 'OUTSIDE_HOURS' then raise exception 'FAIL unspecified availability';end if;
 -- Service role cannot read private tables; configure known room IDs through API only.
 perform public.kapukai_lab_command(o,os,'operator_window',jsonb_build_object('room_id','lounge','starts_at',start_at,'ends_at',close_at));
 perform public.kapukai_lab_command(o,os,'operator_window',jsonb_build_object('room_id','conference','starts_at',start_at,'ends_at',close_at));
 perform public.kapukai_lab_command(o,os,'operator_window',jsonb_build_object('room_id','classroom','starts_at',start_at,'ends_at',close_at));
 r:=public.kapukai_lab_command(a,sa,'book',p||jsonb_build_object('starts_at',to_char(start_at::timestamptz+interval '1 minute','YYYY-MM-DD"T"HH24:MI:SS"Z"')));
 if r->>'error' is distinct from 'INVALID_REQUEST' then raise exception 'FAIL non-quarter start';end if;
 r:=public.kapukai_lab_command(a,sa,'book',p);
 if r->>'ok' is distinct from 'true' then raise exception 'FAIL book independent 47-minute end: %',r;end if;booking:=(r->'booking'->>'id')::uuid;
 replay:=public.kapukai_lab_command(a,sa,'book',p);
 if replay is distinct from r then raise exception 'FAIL stable idempotent response';end if;
 replay:=public.kapukai_lab_command(a,sa,'book',p||'{"participants":5}');
 if replay->>'error' is distinct from 'IDEMPOTENCY_CONFLICT' then raise exception 'FAIL key reuse mismatch';end if;
 r:=public.kapukai_lab_command(b,sb,'book',p||jsonb_build_object('request_id',gen_random_uuid()));
 if r->>'error' is distinct from 'CONFLICT' then raise exception 'FAIL room collision';end if;
 r:=public.kapukai_lab_command(a,sa,'book',p||jsonb_build_object('request_id',gen_random_uuid(),'room_id','conference'));
 if r->>'error' is distinct from 'CONFLICT' then raise exception 'FAIL person collision';end if;
 checks:=checks+1;
 st:=public.kapukai_lab_command(b,sb,'state',jsonb_build_object('week_start',day));
 if not exists(select 1 from jsonb_array_elements(st->'reservations') x where x->>'id'=booking::text and x->>'title'='Reserved')
 or exists(select 1 from jsonb_array_elements(st->'reservations') x where x?'user_id' or x?'email')
 or exists(select 1 from jsonb_array_elements(st->'mine') x where x->>'id'=booking::text) or st?'members' then raise exception 'FAIL schedule privacy';end if;
 r:=public.kapukai_lab_command(b,sb,'cancel',jsonb_build_object('request_id',gen_random_uuid(),'booking_id',booking));
 if r->>'error' is distinct from 'NOT_FOUND' then raise exception 'FAIL foreign cancellation';end if;
 r:=public.kapukai_lab_command(b,sb,'book',p||jsonb_build_object('request_id',gen_random_uuid(),'starts_at',later_at,'ends_at',close_at));
 if r->>'ok' is distinct from 'true' then raise exception 'FAIL second room booking';end if;other_booking:=(r->'booking'->>'id')::uuid;
 r:=public.kapukai_lab_command(a,sa,'reschedule',jsonb_build_object('request_id',gen_random_uuid(),'booking_id',booking,'starts_at',later_at,'ends_at',close_at));
 if r->>'error' is distinct from 'CONFLICT' then raise exception 'FAIL conflicting reschedule';end if;
 st:=public.kapukai_lab_command(a,sa,'state',jsonb_build_object('week_start',day));
 if not exists(select 1 from jsonb_array_elements(st->'mine') x where x->>'id'=booking::text and (x->>'starts_at')::timestamptz=start_at::timestamptz and x->>'version'='1') then raise exception 'FAIL old booking lost on reschedule';end if;
 checks:=checks+1;
 r:=public.kapukai_lab_command(o,os,'operator_class',jsonb_build_object('request_id',gen_random_uuid(),'room_id','classroom','starts_at',later_at,'ends_at',close_at,'title','Synthetic class','capacity',1));
 if r->>'ok' is distinct from 'true' then raise exception 'FAIL class setup: %',r;end if;klass:=(r->'booking'->>'id')::uuid;
 r:=public.kapukai_lab_command(a,sa,'join_class',jsonb_build_object('request_id',gen_random_uuid(),'class_id',klass));
 if r->>'ok' is distinct from 'true' then raise exception 'FAIL class seat';end if;seat:=(r->'booking'->>'id')::uuid;
 r:=public.kapukai_lab_command(b,sb,'join_class',jsonb_build_object('request_id',gen_random_uuid(),'class_id',klass));
 if r->>'error' is distinct from 'CAPACITY_FULL' then raise exception 'FAIL class capacity';end if;
 perform public.kapukai_lab_command(a,sa,'cancel',jsonb_build_object('request_id',gen_random_uuid(),'booking_id',seat));
 perform public.kapukai_lab_command(b,sb,'cancel',jsonb_build_object('request_id',gen_random_uuid(),'booking_id',other_booking));
 r:=public.kapukai_lab_command(b,sb,'join_class',jsonb_build_object('request_id',gen_random_uuid(),'class_id',klass));
 if r->>'ok' is distinct from 'true' then raise exception 'FAIL released seat unavailable';end if;
 r:=public.kapukai_lab_command(o,os,'operator_class_cancel',jsonb_build_object('request_id',gen_random_uuid(),'class_id',klass));
 if r->>'ok' is distinct from 'true' then raise exception 'FAIL class cancellation';end if;
 st:=public.kapukai_lab_command(b,sb,'state',jsonb_build_object('week_start',day));
 if exists(select 1 from jsonb_array_elements(st->'reservations') x where x->>'id'=klass::text) or exists(select 1 from jsonb_array_elements(st->'mine') x where x->>'class_id'=klass::text and x->>'status'='confirmed') then raise exception 'FAIL class cancellation left room or seat occupied';end if;
 checks:=checks+1;
 claimed:=public.kapukai_lab_mail('claim',jsonb_build_object('limit',10,'request_id',req));
 if claimed->>'ok' is distinct from 'true' or jsonb_array_length(claimed->'messages')<>2 then raise exception 'FAIL atomic member/operator outbox';end if;
 r:=public.kapukai_lab_mail('claim',jsonb_build_object('limit',10,'request_id',req));
 if jsonb_array_length(r->'messages')<>0 then raise exception 'FAIL double mail claim';end if;
 mail:=(claimed->'messages'->0->>'id')::uuid;
 r:=public.kapukai_lab_mail('finish',jsonb_build_object('id',mail,'status','unknown'));
 if r->>'ok' is distinct from 'true' then raise exception 'FAIL unknown receipt';end if;
 r:=public.kapukai_lab_mail('claim',jsonb_build_object('limit',10,'request_id',req));
 if jsonb_array_length(r->'messages')<>0 then raise exception 'FAIL uncertain mail blindly retried';end if;
 r:=public.kapukai_lab_mail('finish',jsonb_build_object('id',mail,'status','accepted','provider_id',gen_random_uuid()));
 if r->>'ok' is distinct from 'false' then raise exception 'FAIL uncertain receipt overwritten';end if;
 checks:=checks+1;
 perform public.kapukai_lab_command(o,os,'operator_member',jsonb_build_object('user_id',a,'active',false));
 r:=public.kapukai_lab_command(a,sa,'book',p||jsonb_build_object('request_id',gen_random_uuid()));
 if r->>'error' is distinct from 'FORBIDDEN' then raise exception 'FAIL revoked member booked';end if;
 st:=public.kapukai_lab_command(a,sa,'state',jsonb_build_object('week_start',day));
 if jsonb_array_length(st->'reservations')<>0 then raise exception 'FAIL revoked member sees calendar';end if;
 r:=public.kapukai_lab_command(a,sa,'cancel',jsonb_build_object('request_id',gen_random_uuid(),'booking_id',booking));
 if r->>'ok' is distinct from 'true' then raise exception 'FAIL revoked member cannot release own reservation';end if;
 execute 'reset role';
 update auth.sessions set not_after=now()-interval '1 second' where id=sb;
 execute 'set local role service_role';
 r:=public.kapukai_lab_command(b,sb,'state',jsonb_build_object('week_start',day));
 if r->>'ok' is distinct from 'false' then raise exception 'FAIL revoked session';end if;
 execute 'reset role';
 if not exists(select 1 from kapukai_lab.audit where actor_id=b and outcome='CONFLICT') then raise exception 'FAIL denied decision trace';end if;
 checks:=checks+1;
 raise notice 'PASS: % live Lab acceptance groups; all synthetic changes roll back.',checks;
end $acceptance$;
select 'PASS: all Lab live acceptance assertions completed; synthetic changes rolled back by this transaction' as acceptance;
rollback;
