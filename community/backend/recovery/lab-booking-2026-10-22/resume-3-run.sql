begin;
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
revoke all on all functions in schema kapukai_lab from public,anon,authenticated,service_role;
commit;
