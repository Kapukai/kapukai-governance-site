-- Service-only operational records. No permission, qualification or messaging grant.
create schema if not exists kapukai_operations;
revoke all on schema kapukai_operations from public,anon,authenticated;
grant usage on schema kapukai_operations to service_role;
create table kapukai_operations.commitments (
 id uuid primary key default gen_random_uuid(),
 contact_id text not null check(contact_id ~ '^[0-9]+$'),
 purpose text not null check(purpose in ('engineer','technician','tester','evaluation','research','supporter')),
 stage text not null default 'interest' check(stage in ('interest','conversation','agreed','in_progress','completed','paused','withdrawn')),
 owner_id text not null check(owner_id ~ '^[0-9]+$'),
 next_action text not null check(length(next_action) between 1 and 300),
 due_at timestamptz not null,
 source text not null default 'unknown' check(length(source)<=100),
 campaign text check(length(campaign)<=150),
 evidence_ref text check(length(evidence_ref)<=300),
 revision integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(stage <> 'completed' or nullif(trim(evidence_ref),'') is not null)
);
create table kapukai_operations.events (
 id bigint generated always as identity primary key,
 commitment_id uuid not null references kapukai_operations.commitments(id),
 request_id uuid not null unique,
 actor_id text not null,
 from_stage text, to_stage text not null,
 revision integer not null, evidence_ref text, next_action text not null, due_at timestamptz not null,
 created_at timestamptz not null default now()
);
create table kapukai_operations.incidents (
 incident_key text primary key, kind text not null, state text not null check(state in ('open','resolved')),
 owner_id text not null default '90662861',
 next_action text not null, due_at timestamptz not null,
 first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 resolved_at timestamptz, evidence jsonb not null default '{}'
);
create table kapukai_operations.incident_events (
 id bigint generated always as identity primary key,
 incident_key text not null references kapukai_operations.incidents(incident_key),
 state text not null, evidence jsonb not null, created_at timestamptz not null default now()
);
alter table kapukai_operations.commitments enable row level security;
alter table kapukai_operations.events enable row level security;
alter table kapukai_operations.incidents enable row level security;
alter table kapukai_operations.incident_events enable row level security;
grant select,insert,update on kapukai_operations.commitments,kapukai_operations.incidents to service_role;
grant select,insert on kapukai_operations.events,kapukai_operations.incident_events to service_role;
grant usage on all sequences in schema kapukai_operations to service_role;

create function kapukai_operations.record_incident(p_key text,p_kind text,p_active boolean,p_action text,p_evidence jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare old_state text; new_state text := case when p_active then 'open' else 'resolved' end;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_key,0));
 select state into old_state from kapukai_operations.incidents where incident_key=p_key for update;
 if old_state is null and not p_active then return; end if;
 insert into kapukai_operations.incidents(incident_key,kind,state,next_action,due_at,resolved_at,evidence)
 values(p_key,p_kind,new_state,p_action,now()+interval '1 day',case when not p_active then now() end,p_evidence)
 on conflict(incident_key) do update set state=new_state,last_seen_at=now(),evidence=p_evidence,
 next_action=p_action,resolved_at=case when p_active then null else coalesce(kapukai_operations.incidents.resolved_at,now()) end,
 due_at=case when old_state='resolved' and p_active then now()+interval '1 day' else kapukai_operations.incidents.due_at end;
 if old_state is distinct from new_state then
 insert into kapukai_operations.incident_events(incident_key,state,evidence) values(p_key,new_state,p_evidence);
 end if;
end $$;

create function public.kapukai_operations_monitor()
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

create function public.kapukai_operations_transition(p_id uuid,p_expected_revision integer,p_request_id uuid,p_actor_id text,p_stage text,p_next_action text,p_due_at timestamptz,p_evidence_ref text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c kapukai_operations.commitments; e kapukai_operations.events;
begin
 select * into c from kapukai_operations.commitments where id=p_id for update;
 if not found then raise exception 'NOT_FOUND';end if;
 select * into e from kapukai_operations.events where request_id=p_request_id;
 if found then
 if e.commitment_id<>p_id or e.to_stage<>p_stage or e.actor_id<>p_actor_id or e.revision<>p_expected_revision+1 or e.evidence_ref is distinct from p_evidence_ref or e.next_action is distinct from p_next_action or e.due_at is distinct from p_due_at then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 return jsonb_build_object('result','duplicate','revision',e.revision);
 end if;
 if c.revision<>p_expected_revision then raise exception 'STALE_REVISION';end if;
 if p_actor_id is null or p_actor_id<>c.owner_id then raise exception 'OWNER_REQUIRED';end if;
 if p_stage is null or p_stage not in ('interest','conversation','agreed','in_progress','completed','paused','withdrawn') then raise exception 'INVALID_STAGE';end if;
 if p_stage='completed' and (c.stage<>'in_progress' or nullif(trim(p_evidence_ref),'') is null) then raise exception 'COMPLETION_EVIDENCE_REQUIRED';end if;
 if c.stage='withdrawn' then raise exception 'NEW_CONSENT_REQUIRED';end if;
 if p_stage='in_progress' and c.stage not in ('agreed','paused') then raise exception 'AGREEMENT_REQUIRED';end if;
 update kapukai_operations.commitments set stage=p_stage,next_action=p_next_action,due_at=p_due_at,evidence_ref=p_evidence_ref,revision=revision+1,updated_at=now() where id=p_id;
 insert into kapukai_operations.events(commitment_id,request_id,actor_id,from_stage,to_stage,revision,evidence_ref,next_action,due_at)
 values(p_id,p_request_id,p_actor_id,c.stage,p_stage,c.revision+1,p_evidence_ref,p_next_action,p_due_at);
 return jsonb_build_object('result','updated','revision',c.revision+1);
end $$;
revoke all on all functions in schema kapukai_operations from public,anon,authenticated;
grant execute on all functions in schema kapukai_operations to service_role;
revoke all on function public.kapukai_operations_monitor(),public.kapukai_operations_transition(uuid,integer,uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.kapukai_operations_monitor(),public.kapukai_operations_transition(uuid,integer,uuid,text,text,text,timestamptz,text) to service_role;
