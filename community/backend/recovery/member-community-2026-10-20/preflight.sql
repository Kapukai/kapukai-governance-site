-- Read-only inspection after stage 1. No identity, email, secret or token output.
select enabled,max_members from kapukai_members.config;
select
 (select count(*) from kapukai_members.members) as members,
 (select count(*) from kapukai_members.operators) as operators,
 (select count(*) from kapukai_members.invitations) as invitations,
 (select count(*) from pg_tables where schemaname='kapukai_members') as private_tables,
 (select count(*) from pg_tables where schemaname='kapukai_members' and not rowsecurity) as private_tables_without_rls,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kapukai_members') as private_functions,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('kapukai_member_command','kapukai_member_public','kapukai_member_signup_check')) as public_member_functions;
select r.role_name,
 has_schema_privilege(r.role_name,'kapukai_members','USAGE') as private_schema_usage,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kapukai_members' and c.relkind='r' and has_table_privilege(r.role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) as private_tables_accessible,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kapukai_members' and has_function_privilege(r.role_name,p.oid,'EXECUTE')) as private_functions_executable,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('kapukai_member_command','kapukai_member_public','kapukai_member_signup_check') and has_function_privilege(r.role_name,p.oid,'EXECUTE')) as public_member_functions_executable
from (values('anon'),('authenticated'),('service_role')) r(role_name);
