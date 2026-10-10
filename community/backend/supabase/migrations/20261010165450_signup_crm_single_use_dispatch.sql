-- Supabase owns pg_net objects as supabase_admin. postgres REVOKE cannot change
-- their PUBLIC grants; never claim queue headers are private. See:
-- https://supabase.com/docs/guides/troubleshooting/revoking-access-to-pg_net-objects-has-no-effect-0bbc16
-- Each dispatch now carries a 120-second, single-use capability for one fixed worker.
-- No reusable Vault credential is placed in net.http_request_queue.
-- Release preflight must verify Accept-Profile: net returns PGRST106 (net unexposed).

create table public.kapukai_crm_worker_tickets (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 check(expires_at>created_at and expires_at<=created_at+interval '120 seconds')
);
alter table public.kapukai_crm_worker_tickets enable row level security;
revoke all on public.kapukai_crm_worker_tickets from public,anon,authenticated,service_role;
grant select,delete on public.kapukai_crm_worker_tickets to service_role;

-- Invalidate the previously reusable database authorization immediately.
-- The old Vault secret remains unused; no unrelated customer credential is touched.
update public.kapukai_crm_config set worker_token_hash=null,updated_at=now() where id=1;

create or replace function public.kapukai_crm_authorize_worker(p_token text) returns boolean
language plpgsql volatile set search_path='' as $$
begin
 if p_token is null or p_token !~ '^[0-9a-f]{96}$' then return false;end if;
 -- DELETE is atomic: concurrent consumers cannot both authorize the same dispatch.
 delete from public.kapukai_crm_worker_tickets
 where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now();
 return found;
end $$;
revoke all on function public.kapukai_crm_authorize_worker(text) from public,anon,authenticated;
grant execute on function public.kapukai_crm_authorize_worker(text) to service_role;

-- ADMIN ONLY. p_probe permits an owner to verify credential-missing/paused health;
-- it cannot enable the integration or make disabled claims runnable.
create function private.kapukai_crm_send_worker(p_probe boolean default false) returns bigint
language plpgsql set search_path='' as $$
declare v_token text;v_request bigint;
begin
 delete from public.kapukai_crm_worker_tickets where expires_at<=now();
 if not p_probe and not exists(select 1 from public.kapukai_crm_config where id=1 and enabled) then return null;end if;
 v_token:=encode(extensions.gen_random_bytes(48),'hex');
 insert into public.kapukai_crm_worker_tickets(token_hash,expires_at)
 values(encode(sha256(convert_to(v_token,'UTF8')),'hex'),now()+interval '120 seconds');
 select net.http_post(
  url:='https://tbxfsjipkrdwyctepesf.supabase.co/functions/v1/kapukai-hubspot-sync',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_token),
  body:='{}'::jsonb,timeout_milliseconds:=100000
 ) into v_request;
 return v_request;
end $$;
revoke all on function private.kapukai_crm_send_worker(boolean) from public,anon,authenticated,service_role;

-- Preserve the already scheduled zero-argument function without overload ambiguity.
create or replace function private.kapukai_crm_dispatch() returns bigint
language sql volatile set search_path='' as $$ select private.kapukai_crm_send_worker(false) $$;
revoke all on function private.kapukai_crm_dispatch() from public,anon,authenticated,service_role;

comment on table public.kapukai_crm_worker_tickets is 'One-way hashes of single-use 120-second worker dispatch capabilities. Service role can consume but cannot mint; browser roles have no access. pg_net headers remain readable to trusted database-login roles.';
