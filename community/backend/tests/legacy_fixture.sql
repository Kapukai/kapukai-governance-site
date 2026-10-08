create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.kapukai_interest_registry(
 id uuid primary key default gen_random_uuid(),email text not null unique,
 interests text[] not null default array['updates']::text[],
 status text not null default 'subscribed',
 consent_version text not null,source_path text not null default '/',
 email_confirmed_at timestamptz,created_at timestamptz not null default now(),
 consented_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 full_name text,
 constraint kapukai_interest_values check (
  interests <@ array['updates','research_participant','institutional_pilot','expert_contributor','funder_partner']::text[]
  and cardinality(interests) between 1 and 5),
 constraint kapukai_interest_status check(status in ('subscribed','pending','unsubscribed','suppressed'))
);
alter table public.kapukai_interest_registry enable row level security;
grant select,insert,update on public.kapukai_interest_registry to service_role;
create table public.legacy_jobs(registry_id uuid);
create function public.legacy_trigger() returns trigger language plpgsql as $$
begin
 if new.status='subscribed' and new.email_confirmed_at is not null then
  insert into public.legacy_jobs values(new.id);
 end if;
 return new;
end $$;
create trigger legacy_onboarding after insert or update of status,email_confirmed_at
 on public.kapukai_interest_registry for each row execute function public.legacy_trigger();
create table public.rate_fixture(fingerprint text primary key,hits integer default 1);
create function public.kapukai_claim_signup_attempt(p_fingerprint text,p_limit integer) returns boolean
 language plpgsql as $$declare n integer;begin
 insert into public.rate_fixture values(p_fingerprint,1)
 on conflict(fingerprint) do update set hits=rate_fixture.hits+1 returning hits into n;
 return n<=p_limit;end $$;

