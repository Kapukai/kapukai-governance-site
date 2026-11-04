begin;
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
   if not exists(select 1 from kapukai_lab.rooms where id=r) or e<=s or date_trunc('minute',s)<>s or date_trunc('minute',e)<>e then raise exception 'INVALID_REQUEST';end if;
   insert into kapukai_lab.windows(room_id,starts_at,ends_at,created_by) values(r,s,e,u) on conflict do nothing;return jsonb_build_object('ok',true);
  elsif a not in('operator_class','operator_class_cancel') then raise exception 'INVALID_REQUEST';end if;
 return null;
end $$;
revoke all on all functions in schema kapukai_lab from public,anon,authenticated,service_role;
commit;
