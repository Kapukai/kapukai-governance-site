begin;
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
revoke all on function public.kapukai_lab_mail(text,jsonb) from public,anon,authenticated;
grant execute on function public.kapukai_lab_mail(text,jsonb) to service_role;
commit;
