-- REVIEW CANDIDATE ONLY. Not applied to a database or deployed service.
-- Reuses public.kapukai_claim_signup_attempt; no client grants are added there.
-- Receipt rows are tombstones: do not delete/reopen them or retry a pending send.
-- No email, raw network address, OTP, password or session token is persisted.
begin;

create schema if not exists private;

create table private.kapukai_auth_recovery_requests (
  request_id uuid primary key,
  address_fingerprint text not null check (address_fingerprint ~ '^[0-9a-f]{64}$'),
  state text not null default 'pending' check (state in ('pending', 'accepted', 'failed', 'unknown')),
  provider_message_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint recovery_receipt_shape check (
    (state = 'pending' and provider_message_id is null and resolved_at is null)
    or (state = 'accepted' and provider_message_id is not null and resolved_at is not null)
    or (state in ('failed', 'unknown') and provider_message_id is null and resolved_at is not null)
  )
);
alter table private.kapukai_auth_recovery_requests enable row level security;
revoke all on private.kapukai_auth_recovery_requests from public, anon, authenticated, service_role;

create function public.kapukai_auth_recovery_claim(p_request_id uuid, p_address_fingerprint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_id uuid;
  existing_fingerprint text;
begin
  if p_request_id is null or p_address_fingerprint is null or p_address_fingerprint !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('result', 'invalid');
  end if;
  -- The unique request key arbitrates concurrent claims before either caller can
  -- generate a new Auth token or hand a message to the provider.
  insert into private.kapukai_auth_recovery_requests(request_id, address_fingerprint)
  values (p_request_id, p_address_fingerprint)
  on conflict (request_id) do nothing
  returning request_id into inserted_id;
  if inserted_id is not null then
    return jsonb_build_object('result', 'claimed');
  end if;
  select address_fingerprint into existing_fingerprint
  from private.kapukai_auth_recovery_requests where request_id = p_request_id;
  if existing_fingerprint = p_address_fingerprint then
    return jsonb_build_object('result', 'duplicate');
  end if;
  return jsonb_build_object('result', 'idempotency_conflict');
end;
$$;

create function public.kapukai_auth_recovery_mail_result(p_request_id uuid, p_state text, p_provider_message_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_state text;
  previous_provider_id uuid;
begin
  if p_request_id is null or p_state is null or p_state not in ('accepted', 'failed', 'unknown')
    or (p_state = 'accepted' and p_provider_message_id is null)
    or (p_state <> 'accepted' and p_provider_message_id is not null) then
    return jsonb_build_object('result', 'invalid');
  end if;
  select state, provider_message_id into previous_state, previous_provider_id
  from private.kapukai_auth_recovery_requests where request_id = p_request_id for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if previous_state <> 'pending' then
    if previous_state = p_state and previous_provider_id is not distinct from p_provider_message_id then
      return jsonb_build_object('result', 'ok', 'state', previous_state);
    end if;
    return jsonb_build_object('result', 'conflict');
  end if;
  update private.kapukai_auth_recovery_requests
  set state = p_state, provider_message_id = p_provider_message_id, resolved_at = now()
  where request_id = p_request_id;
  return jsonb_build_object('result', 'ok', 'state', p_state);
end;
$$;

revoke all on function public.kapukai_auth_recovery_claim(uuid, text) from public, anon, authenticated;
revoke all on function public.kapukai_auth_recovery_mail_result(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.kapukai_auth_recovery_claim(uuid, text) to service_role;
grant execute on function public.kapukai_auth_recovery_mail_result(uuid, text, uuid) to service_role;

comment on table private.kapukai_auth_recovery_requests is 'Private recovery send claims and terminal receipts. Pending and unknown never authorize retries. No account address, OTP or password.';
commit;
