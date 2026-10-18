create function public.kapukai_operations_create(p_request_id uuid,p_contact_id text,p_purpose text,p_owner_id text,p_next_action text,p_due_at timestamptz,p_source text default 'unknown',p_campaign text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c kapukai_operations.commitments; e kapukai_operations.events;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into c from kapukai_operations.commitments where id=p_request_id;
 if found then
 select * into e from kapukai_operations.events where request_id=p_request_id;
 if c.contact_id is distinct from p_contact_id or c.purpose is distinct from p_purpose or c.owner_id is distinct from p_owner_id or c.source is distinct from p_source or c.campaign is distinct from p_campaign or e.next_action is distinct from p_next_action or e.due_at is distinct from p_due_at then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 return jsonb_build_object('result','duplicate','id',c.id);
 end if;
 if not exists(select 1 from public.kapukai_crm_outbox where hubspot_contact_id=p_contact_id and state='synced') then raise exception 'VERIFIED_CONTACT_REQUIRED'; end if;
 insert into kapukai_operations.commitments(id,contact_id,purpose,owner_id,next_action,due_at,source,campaign)
 values(p_request_id,p_contact_id,p_purpose,p_owner_id,p_next_action,p_due_at,p_source,p_campaign);
 insert into kapukai_operations.events(commitment_id,request_id,actor_id,to_stage,revision,next_action,due_at)
 values(p_request_id,p_request_id,p_owner_id,'interest',0,p_next_action,p_due_at);
 return jsonb_build_object('result','created','id',p_request_id);
end $$;
revoke all on function public.kapukai_operations_create(uuid,text,text,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.kapukai_operations_create(uuid,text,text,text,text,timestamptz,text,text) to service_role;
