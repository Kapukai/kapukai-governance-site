create function public.kapukai_operations_contact_summary(p_email text)
returns jsonb language sql stable security invoker set search_path='' as $$
 with c as (
 select c.* from kapukai_operations.commitments c join public.kapukai_crm_outbox o on o.hubspot_contact_id=c.contact_id
 where o.email=p_email
 ), active as (select * from c where stage not in ('completed','withdrawn','paused') order by due_at,id)
 select jsonb_build_object(
 'kapukai_participation_purposes',coalesce((select string_agg(distinct purpose,';' order by purpose) from c where stage<>'withdrawn'),''),
 'kapukai_participation_progress',coalesce((select string_agg(purpose||':'||stage,'; ' order by purpose,id) from c),''),
 'kapukai_next_action',coalesce((select next_action from active limit 1),''),
 'kapukai_next_action_due',coalesce((select to_char(due_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') from active limit 1),''),
 'kapukai_action_owner',coalesce((select owner_id from active limit 1),''),
 'kapukai_overdue_actions',(select count(*)::text from active where due_at<now()),
 'kapukai_completed_commitments',(select count(*)::text from c where stage='completed')
 );
$$;
revoke all on function public.kapukai_operations_contact_summary(text) from public,anon,authenticated;
grant execute on function public.kapukai_operations_contact_summary(text) to service_role;
create function kapukai_operations.commitment_changed()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_email text;
begin
 for v_email in select email from public.kapukai_crm_outbox where hubspot_contact_id=new.contact_id loop
 perform private.kapukai_crm_enqueue(v_email,true);
 end loop;
 return new;
end $$;
revoke all on function kapukai_operations.commitment_changed() from public,anon,authenticated;
grant execute on function kapukai_operations.commitment_changed() to service_role;
create trigger kapukai_operations_commitment_changed after insert or update on kapukai_operations.commitments for each row execute function kapukai_operations.commitment_changed();
