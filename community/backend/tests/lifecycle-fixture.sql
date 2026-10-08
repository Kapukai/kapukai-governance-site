-- Synthetic authority only; no production user or grant identifiers.
create schema auth;
create schema kapukai;
create table auth.users(id uuid primary key,email_confirmed_at timestamptz,banned_until timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz,created_at timestamptz not null default now());
create table kapukai.tenants(id text primary key,state text);
create table kapukai.subjects(id text,tenant_id text,state text,deleted_at timestamptz,primary key(tenant_id,id));
create table kapukai.external_identities(provider text,provider_subject_digest text,tenant_id text,subject_id text,state text);
create table kapukai.role_grants(id text primary key,tenant_id text,subject_id text,role text,capabilities text[],scope text[],effective_at timestamptz,expires_at timestamptz,revoked_at timestamptz);
create function kapukai.identity_digest_for_auth_user(p_user_id uuid) returns text language sql as $$select 'synthetic:'||p_user_id::text$$;
revoke all on schema auth,kapukai from public,anon,authenticated,service_role;
revoke all on all tables in schema auth,kapukai from public,anon,authenticated,service_role;
revoke all on function kapukai.identity_digest_for_auth_user(uuid) from public,anon,authenticated,service_role;
insert into auth.users values('11111111-1111-4111-8111-111111111111',now(),null);
insert into auth.sessions(id,user_id,not_after) values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',now()+interval '1 day');
insert into kapukai.tenants values('test-tenant','active');
insert into kapukai.subjects values('test-subject','test-tenant','active',null);
insert into kapukai.external_identities values('supabase','synthetic:11111111-1111-4111-8111-111111111111','test-tenant','test-subject','active');
insert into kapukai.role_grants values('workshop-test','test-tenant','test-subject','steward',array['community:applications:review'],array['community:workshop'],now(),null,null);
