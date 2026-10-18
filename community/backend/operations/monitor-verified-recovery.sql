create or replace function public.kapukai_operations_monitor()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare h jsonb; r record;
begin
 h:=public.kapukai_crm_health();
 perform kapukai_operations.record_incident('crm:worker','worker',
 coalesce((h->>'enabled')::boolean,false) and (h->>'worker_last_seen' is null or (h->>'worker_last_seen')::timestamptz<now()-interval '5 minutes'),
 'Inspect worker schedule and logs; restore heartbeat and verify a new run.',jsonb_build_object('worker_last_seen',h->'worker_last_seen'));
 perform kapukai_operations.record_incident('crm:credential','credential',
 coalesce((h->>'enabled')::boolean,false) and (not coalesce((h->>'credential_ready')::boolean,false) or h->>'worker_error_code' is not null),
 'Review the CRM error; repair authorized configuration and verify readback.',jsonb_build_object('error',h->'worker_error_code','credential_ready',h->'credential_ready'));
 for r in select email,state,last_error_code,synced_generation,generation,last_synced_at,next_attempt_at from public.kapukai_crm_outbox loop
 perform kapukai_operations.record_incident('crm:contact:'||md5(r.email),'contact_sync',
 r.state in ('blocked','failed') or (r.state<>'synced' and r.next_attempt_at<now()-interval '30 minutes')
 or (exists(select 1 from kapukai_operations.incidents i where i.incident_key='crm:contact:'||md5(r.email) and i.state='open') and not (r.state='synced' and r.synced_generation=r.generation and r.last_synced_at is not null)),
 'Inspect the protected CRM outbox. Resolve identity conflicts manually; verify the current generation by readback.',
 jsonb_build_object('state',r.state,'error',r.last_error_code,'generation',r.generation,'synced_generation',r.synced_generation,'verified_at',r.last_synced_at));
 end loop;
 -- Removed records are not automatically treated as repaired.
 for r in select * from kapukai_operations.commitments loop
 perform kapukai_operations.record_incident('commitment:'||r.id,'overdue_commitment',
 r.stage not in ('completed','withdrawn','paused') and r.due_at<now(),
 'Review the commitment with its owner; record an evidenced outcome or an explicit revised plan.',
 jsonb_build_object('commitment_id',r.id,'stage',r.stage,'due_at',r.due_at,'revision',r.revision));
 end loop;
 return jsonb_build_object('checked_at',now(),'open_incidents',(select count(*) from kapukai_operations.incidents where state='open'));
end $$;

