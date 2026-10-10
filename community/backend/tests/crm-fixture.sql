create role anon;
create role authenticated;
create role service_role bypassrls;
create role supabase_auth_admin;
create schema auth;
grant usage on schema auth to service_role,supabase_auth_admin;
create table auth.users(id uuid primary key default gen_random_uuid(),email text,created_at timestamptz default now(),email_confirmed_at timestamptz,deleted_at timestamptz,encrypted_password text);
grant select,insert,update,delete on auth.users to supabase_auth_admin;
create table public.kapukai_interest_registry(id uuid primary key default gen_random_uuid(),email text unique not null,
 full_name text,organization text,interests text[] default '{}',status text default 'pending',email_confirmed_at timestamptz,created_at timestamptz default now());
create table public.kapukai_interest_confirmations(id uuid primary key default gen_random_uuid(),registry_id uuid unique references public.kapukai_interest_registry on delete cascade,
 expires_at timestamptz default now()+interval '2 days',confirmed_at timestamptz);
create table public.kapukai_scoped_intents(id uuid primary key default gen_random_uuid(),registry_id uuid references public.kapukai_interest_registry on delete cascade,
 requested_at timestamptz default now(),state text default 'pending',expires_at timestamptz default now()+interval '2 days');
create table public.kapukai_scoped_subscriptions(registry_id uuid references public.kapukai_interest_registry on delete cascade,
 topic text,state text default 'confirmed',revoked_at timestamptz,primary key(registry_id,topic));
create table public.kapukai_applications(id uuid primary key default gen_random_uuid(),registry_id uuid references public.kapukai_interest_registry on delete cascade,
 created_at timestamptz default now(),confirmed_at timestamptz,state text default 'awaiting_email',expires_at timestamptz default now()+interval '2 days',withdrawn_at timestamptz,
 kind text,requested_support text,display_alias text,profession text);
create table public.kapukai_workshop_workflows(application_id uuid primary key references public.kapukai_applications on delete cascade,
 stage text default 'queue',reason text,feedback jsonb,updated_at timestamptz default now());
create table public.assurance_connections(id uuid primary key default gen_random_uuid(),email text,display_name text,message text,topics text[] default '{}',
 created_at timestamptz default now(),confirmed_at timestamptz,status text default 'pending',expires_at timestamptz default now()+interval '2 days');
create table public.kapukai_connections(id uuid primary key default gen_random_uuid(),email text,display_name text,organization text,message text,
 subscriptions text[] default '{}',created_at timestamptz default now(),confirmed_at timestamptz);
create table public.kapukai_connection_requests(id uuid primary key default gen_random_uuid(),email text,payload jsonb,
 created_at timestamptz default now(),used_at timestamptz,expires_at timestamptz default now()+interval '2 days');
grant select,insert,update,delete on all tables in schema public to service_role;
