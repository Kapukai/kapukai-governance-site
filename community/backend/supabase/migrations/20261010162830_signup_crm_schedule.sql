-- Hosted Supabase only: these extensions already exist on the target project.
-- A dedicated random token is generated/stored entirely inside Vault, never emitted.
-- pg_net queues contain authentication headers. Browser roles must never read them.
revoke all on net.http_request_queue,net._http_response from public,anon,authenticated;
do $$
declare v_token text;
begin
 if not exists(select 1 from vault.secrets where name='kapukai_crm_worker_token') then
  v_token:=encode(extensions.gen_random_bytes(48),'hex');
  perform vault.create_secret(v_token,'kapukai_crm_worker_token','Dedicated internal CRM outbox dispatch token');
 end if;
 select decrypted_secret into strict v_token from vault.decrypted_secrets where name='kapukai_crm_worker_token';
 update public.kapukai_crm_config set worker_token_hash=encode(sha256(convert_to(v_token,'UTF8')),'hex'),updated_at=now() where id=1;
end $$;

create function private.kapukai_crm_dispatch() returns bigint language plpgsql set search_path='' as $$
declare v_token text;v_request bigint;
begin
 if not exists(select 1 from public.kapukai_crm_config where id=1 and enabled) then return null;end if;
 select decrypted_secret into strict v_token from vault.decrypted_secrets where name='kapukai_crm_worker_token';
 select net.http_post(
  url:='https://tbxfsjipkrdwyctepesf.supabase.co/functions/v1/kapukai-hubspot-sync',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_token),
  body:='{}'::jsonb,timeout_milliseconds:=100000
 ) into v_request;
 return v_request;
end $$;
revoke all on function private.kapukai_crm_dispatch() from public,anon,authenticated,service_role;

-- Config defaults to disabled; worker credentials are checked at runtime, before claiming.
select cron.schedule('kapukai-crm-worker-every-minute','* * * * *','select private.kapukai_crm_dispatch();');
-- Recomputes expired confirmations and source tombstones; unchanged CRM records refresh daily.
select cron.schedule('kapukai-crm-reconcile-every-15-minutes','*/15 * * * *','select public.kapukai_crm_reconcile();');
