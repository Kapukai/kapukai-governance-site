-- FUTURE, SEPARATELY REVIEWED ADMINISTRATIVE OPERATION; NOT PART OF THE MIGRATION.
-- Run only after all seven stages and rollback-only production acceptance pass.
-- The release owner's existing authorization permits the owner bootstrap; this
-- query still re-resolves current authoritative identity and refuses ambiguity.
-- No email/name/UUID literal, metadata-derived role, membership, activation or mail.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(1792367556);
lock table kapukai.tenants,kapukai.subjects,kapukai.external_identities,kapukai.role_grants in share mode;
do $bootstrap$
declare candidates uuid[]; candidate uuid; role_name text; item record;
begin
 if not exists(select 1 from kapukai_members.config where id and not enabled and max_members=25)
 or exists(select 1 from kapukai_members.operators)
 or exists(select 1 from kapukai_members.members)
 or exists(select 1 from kapukai_members.invitations) then
 raise exception 'BOOTSTRAP_REQUIRES_PRISTINE_DISABLED_PILOT';
 end if;
 if (select count(*) from pg_tables where schemaname='kapukai_members')<>17
 or exists(select 1 from pg_tables where schemaname='kapukai_members' and not rowsecurity)
 or to_regprocedure('public.kapukai_member_command(uuid,uuid,text,jsonb)') is null
 or to_regprocedure('public.kapukai_member_public()') is null
 or to_regprocedure('public.kapukai_member_signup_check(text,text)') is null
 or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kapukai_members')<>11 then
 raise exception 'BOOTSTRAP_REQUIRES_COMPLETE_REVIEWED_SCHEMA';
 end if;
 for role_name in select unnest(array['anon','authenticated','service_role']) loop
 if has_schema_privilege(role_name,'kapukai_members','USAGE') then raise exception 'BOOTSTRAP_PRIVATE_SCHEMA_EXPOSED';end if;
 for item in select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kapukai_members' and c.relkind='r' loop
 if has_table_privilege(role_name,item.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'BOOTSTRAP_PRIVATE_TABLE_EXPOSED';end if;
 end loop;
 for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kapukai_members' loop
 if has_function_privilege(role_name,item.oid,'EXECUTE') then raise exception 'BOOTSTRAP_PRIVATE_FUNCTION_EXPOSED';end if;
 end loop;
 for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('kapukai_member_command','kapukai_member_public','kapukai_member_signup_check') loop
 if has_function_privilege(role_name,item.oid,'EXECUTE') is distinct from (role_name='service_role') then raise exception 'BOOTSTRAP_RPC_PRIVILEGES_INCORRECT';end if;
 end loop;
 end loop;
 select array_agg(distinct u.id) into candidates
 from auth.users u
 join kapukai.external_identities e on e.provider='supabase' and e.provider_subject_digest=kapukai.identity_digest_for_auth_user(u.id)
 join kapukai.subjects s on s.tenant_id=e.tenant_id and s.id=e.subject_id
 join kapukai.tenants t on t.id=e.tenant_id
 join kapukai.role_grants g on g.tenant_id=e.tenant_id and g.subject_id=e.subject_id
 where u.email_confirmed_at is not null and u.deleted_at is null and u.role='authenticated'
 and coalesce(u.is_anonymous,false)=false and (u.banned_until is null or u.banned_until<=now())
 and e.state='active' and s.state='active' and s.deleted_at is null and t.state='active'
 and g.role='steward' and 'community:applications:review'=any(g.capabilities) and 'community:workshop'=any(g.scope)
 and g.effective_at<=now() and (g.expires_at is null or g.expires_at>now()) and g.revoked_at is null;
 if coalesce(cardinality(candidates),0)<>1 then raise exception 'BOOTSTRAP_STEWARD_IDENTITY_ABSENT_OR_AMBIGUOUS';end if;
 candidate:=candidates[1];
 perform 1 from auth.users u where u.id=candidate and u.email_confirmed_at is not null and u.deleted_at is null and u.role='authenticated' and coalesce(u.is_anonymous,false)=false and (u.banned_until is null or u.banned_until<=now()) for update;
 if not found then raise exception 'BOOTSTRAP_AUTH_IDENTITY_NO_LONGER_VALID';end if;
 insert into kapukai_members.operators(user_id) values(candidate);
end $bootstrap$;
-- Count-only receipt; do not publish the resolved account identifier.
select count(*) as operator_count from kapukai_members.operators;
commit;
