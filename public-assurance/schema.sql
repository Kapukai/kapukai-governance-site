-- Additive, isolated from existing Kapukai registries. No public reads or writes.
create table if not exists public.assurance_connections (
 id uuid primary key default gen_random_uuid(),
 email text not null check (length(email) <= 254),
 display_name text check (length(display_name) <= 100),
 message text check (length(message) <= 2000),
 topics text[] not null default '{}',
 status text not null default 'pending' check (status in ('pending','confirmed','unsubscribed')),
 consent_version text not null,
 consent_text text not null,
 source_path text not null,
 token_hash text not null unique,
 expires_at timestamptz not null,
 confirmed_at timestamptz,
 created_at timestamptz not null default now(),
 delivery_status text not null default 'not_attempted',
 owner_delivery_status text not null default 'not_attempted'
);
alter table public.assurance_connections enable row level security;
revoke all on public.assurance_connections from anon, authenticated;
grant select, insert, update, delete on public.assurance_connections to service_role;
create index if not exists assurance_connections_email_idx on public.assurance_connections(email);
create table if not exists public.assurance_consent_events (
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public.assurance_connections(id) on delete cascade,
 event_type text not null check (event_type in ('requested','confirmed','unsubscribed')),
 consent_version text not null,
 topics text[] not null default '{}',
 created_at timestamptz not null default now()
);
alter table public.assurance_consent_events enable row level security;
revoke all on public.assurance_consent_events from anon, authenticated;
grant select, insert, delete on public.assurance_consent_events to service_role;
