-- Live verification, one transaction: synthetic identities and all state roll back.
-- No credentials or provider calls. Requires disabled Lab with no reservations.
begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
do $acceptance$
declare
 o uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); os uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid();
 s timestamptz:=date_trunc('hour',clock_timestamp())+(ceil(extract(minute from clock_timestamp())/15)+1)*interval '15 minutes';
 w timestamp:=date_trunc('week',clock_timestamp() at time zone 'America/New_York');
 ns timestamptz; ne timestamptz; r jsonb; p jsonb; booking uuid; cls uuid; n integer;
begin
 perform 1 from kapukai_lab.config where id for update;
 if not exists(select 1 from kapukai_lab.config where not enabled) or exists(select 1 from kapukai_lab.bookings) then raise exception 'LIVE_CHECK_REQUIRES_DISABLED_EMPTY_BOOKINGS';end if;
 if s+interval '15 minutes'>((w+interval '7 days') at time zone 'America/New_York') then raise exception 'RETRY_AFTER_WEEK_ROLLOVER';end if;
 if pg_get_expr((select proargdefaults from pg_proc where oid='kapukai_lab.validate_booking_week(timestamptz,timestamptz,timestamptz)'::regprocedure),0) is distinct from 'clock_timestamp()' then raise exception 'FAIL production clock';end if;
 if has_function_privilege('anon','kapukai_lab.validate_booking_week(timestamptz,timestamptz,timestamptz)','EXECUTE') or has_function_privilege('authenticated','kapukai_lab.validate_booking_week(timestamptz,timestamptz,timestamptz)','EXECUTE') or has_function_privilege('service_role','kapukai_lab.validate_booking_week(timestamptz,timestamptz,timestamptz)','EXECUTE') then raise exception 'FAIL helper permissions';end if;
 ns:=(w+interval '7 days 9 hours') at time zone 'America/New_York';ne:=ns+interval '45 minutes';
 insert into auth.users(id,email,email_confirmed_at,role,is_anonymous,created_at,updated_at) values
 (o,'lab-weekcheck-'||o||'@example.invalid',now(),'authenticated',false,now(),now()),
 (a,'lab-weekcheck-'||a||'@example.invalid',now(),'authenticated',false,now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values(os,o,now(),now(),now()+interval '1 hour'),(sa,a,now(),now(),now()+interval '1 hour');
 insert into kapukai_lab.operators(user_id) values(o);
 r:=public.kapukai_lab_command(o,os,'operator_member',jsonb_build_object('user_id',a,'active',true));
 if r->>'ok' is distinct from 'true' then raise exception 'FAIL grant: %',r;end if;
 perform public.kapukai_lab_command(o,os,'operator_config','{"enabled":true}');
 perform public.kapukai_lab_command(o,os,'operator_window',jsonb_build_object('room_id','conference','starts_at',to_char(s at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'ends_at',to_char(ne at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')));
 p:=jsonb_build_object('request_id',gen_random_uuid(),'room_id','conference','starts_at',to_char(s at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'ends_at',to_char((s+interval '15 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'participants',2,'mode','room');
 for n in select unnest(array[1,14,47]) loop
  r:=public.kapukai_lab_command(a,sa,'book',p||jsonb_build_object('request_id',gen_random_uuid(),'ends_at',to_char((s+make_interval(mins=>n)) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')));
  if r->>'error' is distinct from 'INVALID_REQUEST' then raise exception 'FAIL short/off-grid end: %',r;end if;
 end loop;
 r:=public.kapukai_lab_command(a,sa,'book',p);
 if r->>'ok' is distinct from 'true' or r->'booking'->>'status' is distinct from 'confirmed' then raise exception 'FAIL automatic confirmation: %',r;end if;
 booking:=(r->'booking'->>'id')::uuid;
 if (r->'booking'->>'participants')::integer is distinct from 2 or (r->'booking'->>'ends_at')::timestamptz-(r->'booking'->>'starts_at')::timestamptz is distinct from interval '15 minutes' then raise exception 'FAIL 15-minute smaller group';end if;
 select count(*) into n from kapukai_lab.outbox where booking_id=booking;
 if n is distinct from 2 then raise exception 'FAIL both notices';end if;
 if public.kapukai_lab_command(a,sa,'book',p) is distinct from r then raise exception 'FAIL replay';end if;
 p:=p||jsonb_build_object('request_id',gen_random_uuid(),'starts_at',to_char(ns at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'ends_at',to_char(ne at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
 r:=public.kapukai_lab_command(a,sa,'book',p);
 if r->>'error' is distinct from 'OUTSIDE_CURRENT_WEEK' then raise exception 'FAIL future book: %',r;end if;
 r:=public.kapukai_lab_command(a,sa,'reschedule',(p-'room_id'-'participants'-'mode')||jsonb_build_object('request_id',gen_random_uuid(),'booking_id',booking));
 if r->>'error' is distinct from 'OUTSIDE_CURRENT_WEEK' then raise exception 'FAIL future reschedule: %',r;end if;
 if not exists(select 1 from kapukai_lab.bookings where id=booking and starts_at=s and version=1) then raise exception 'FAIL preserved original';end if;
 r:=public.kapukai_lab_command(o,os,'operator_class',(p-'participants'-'mode')||jsonb_build_object('request_id',gen_random_uuid(),'title','Synthetic week-policy check','capacity',6));
 if r->>'ok' is distinct from 'true' then raise exception 'FAIL operator planning: %',r;end if;cls:=(r->'booking'->>'id')::uuid;
 r:=public.kapukai_lab_command(a,sa,'join_class',jsonb_build_object('request_id',gen_random_uuid(),'class_id',cls));
 if r->>'error' is distinct from 'OUTSIDE_CURRENT_WEEK' then raise exception 'FAIL future class seat: %',r;end if;
 select count(*) into n from kapukai_lab.outbox where booking_id=booking;
 if n is distinct from 2 then raise exception 'FAIL extra notice';end if;
 r:=public.kapukai_lab_command(a,sa,'cancel',jsonb_build_object('request_id',gen_random_uuid(),'booking_id',booking));
 if r->'booking'->>'status' is distinct from 'cancelled' then raise exception 'FAIL cancellation';end if;
end $acceptance$;
select 'PASSED: live 15-minute auto-confirmation, quarter-hour validation, next-week denials, planning, replay, cancellation, notices, clock and ACL' as result;
rollback;
