-- Curated public-source research; no private case data. Published via reviewed snapshots.
create schema if not exists kapukai_case_atlas;
revoke all on schema kapukai_case_atlas from public, anon, authenticated;
create table if not exists kapukai_case_atlas.cases (
 id text primary key,
 title text not null,
 state text not null check (state ~ '^[A-Z]{2}$'),
 government_level text not null,
 pattern text not null,
 evidence_status text not null,
 source_review_date date not null,
 engineering_causation_status text not null default 'not_established' check (engineering_causation_status in ('not_established','source_supported','contradicted')),
 record jsonb not null check (jsonb_typeof(record) = 'object' and record->>'id'=id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists kapukai_case_atlas.sources (
 case_id text not null references kapukai_case_atlas.cases(id),
 url text not null check (url like 'https://%'),
 title text not null,
 pinpoint text not null,
 primary key(case_id,url)
);
create table if not exists kapukai_case_atlas.people (
 case_id text not null references kapukai_case_atlas.cases(id),
 name text not null,
 documented_role text not null,
 primary key(case_id,name,documented_role)
);
create table if not exists kapukai_case_atlas.editions (
 edition text primary key,
 published_snapshot jsonb not null,
 checksum_sha256 text not null,
 source_review_date date not null,
 created_at timestamptz not null default now()
);
create index if not exists cases_state_pattern on kapukai_case_atlas.cases(state,pattern);
alter table kapukai_case_atlas.cases enable row level security;
alter table kapukai_case_atlas.sources enable row level security;
alter table kapukai_case_atlas.people enable row level security;
alter table kapukai_case_atlas.editions enable row level security;
revoke all on all tables in schema kapukai_case_atlas from public, anon, authenticated;
comment on schema kapukai_case_atlas is 'Public-source case research. Denied direct client access; reviewed static editions published separately. Names identify documented roles, not guilt.';
