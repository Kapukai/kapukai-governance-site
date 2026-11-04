-- Owner-authorized additive Lab operator grant. No participants, openings or mail.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table kapukai.tenants,kapukai.subjects,kapukai.external_identities,kapukai.role_grants,kapukai_members.operators in share mode;
do $bootstrap$
declare candidate uuid; candidates uuid[];
begin
 perform 1 from kapukai_lab.config where id and not enabled for update;
 if not found or exists(select 1 from kapukai_lab.operators) or exists(select 1 from kapukai_lab.members) or exists(select 1 from kapukai_lab.windows) or exists(select 1 from kapukai_lab.bookings) or exists(select 1 from kapukai_lab.outbox) then raise exception 'REQUIRES_PRISTINE_DISABLED_LAB';end if;
 select array_agg(distinct u.id) into candidates
 from auth.users u
 join kapukai_members.operators o on o.user_id=u.id
 join kapukai.external_identities e on e.provider='supabase' and e.provider_subject_digest=kapukai.identity_digest_for_auth_user(u.id)
 join kapukai.subjects s on s.tenant_id=e.tenant_id and s.id=e.subject_id
 join kapukai.tenants t on t.id=e.tenant_id
 join kapukai.role_grants g on g.tenant_id=e.tenant_id and g.subject_id=e.subject_id
 where u.email_confirmed_at is not null and u.deleted_at is null and u.role='authenticated'
 and coalesce(u.is_anonymous,false)=false and (u.banned_until is null or u.banned_until<=now())
 and e.state='active' and s.state='active' and s.deleted_at is null and t.state='active'
 and g.role='steward' and 'community:applications:review'=any(g.capabilities) and 'community:workshop'=any(g.scope)
 and g.effective_at<=now() and (g.expires_at is null or g.expires_at>now()) and g.revoked_at is null;
 if coalesce(cardinality(candidates),0)<>1 then raise exception 'OWNER_IDENTITY_ABSENT_OR_AMBIGUOUS';end if;
 candidate:=candidates[1];
 perform 1 from auth.users u where u.id=candidate and u.email_confirmed_at is not null and u.deleted_at is null and u.role='authenticated' and coalesce(u.is_anonymous,false)=false and (u.banned_until is null or u.banned_until<=now()) for update;
 if not found then raise exception 'OWNER_IDENTITY_NO_LONGER_VALID';end if;
 insert into kapukai_lab.operators(user_id) values(candidate);
 insert into kapukai_lab.audit(actor_id,action,outcome,policy_version) select candidate,'operator_bootstrap','allowed',policy_version from kapukai_lab.config;
end $bootstrap$;
select jsonb_build_object('operator_count',(select count(*) from kapukai_lab.operators),'member_count',(select count(*) from kapukai_lab.members),'booking_enabled',(select enabled from kapukai_lab.config)) as receipt;
commit;
