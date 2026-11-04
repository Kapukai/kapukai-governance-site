begin;
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
  if kapukai_lab.conflict(u,r,s,e) then raise exception 'CONFLICT';end if;
  insert into kapukai_lab.bookings(user_id,room_id,starts_at,ends_at,kind,title,participants) values(u,r,s,e,case when a='operator_class' then 'class' else p->>'mode' end,case when a='operator_class' then p->>'title' end,n) returning * into b;
 elsif a='join_class' then
  if not kapukai_lab.keys(p,array['request_id','class_id']) then raise exception 'INVALID_REQUEST';end if;
  select * into c from kapukai_lab.bookings where id=(p->>'class_id')::uuid and kind='class' and status='confirmed';if not found then raise exception 'NOT_FOUND';end if;
  if c.starts_at<=now() then raise exception 'INVALID_REQUEST';end if;
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
   s:=kapukai_lab.time_value(p->'starts_at');e:=kapukai_lab.time_value(p->'ends_at');perform kapukai_lab.validate_time(b.room_id,s,e);
   if kapukai_lab.conflict(u,b.room_id,s,e,b.id) then raise exception 'CONFLICT';end if;
   update kapukai_lab.bookings set starts_at=s,ends_at=e,version=version+1,updated_at=now() where id=b.id returning * into b;
  end if;
 end if;
 return b;
end $$;
revoke all on all functions in schema kapukai_lab from public,anon,authenticated,service_role;
commit;
