-- Review and run this entire file as ONE authorized administrative database call.
-- No network, Auth API, mail provider, credentials or real participant data.
-- Synthetic auth/request/invitation rows remain inside BEGIN ... ROLLBACK.
-- Reconfirm current Auth triggers are transactional and synthetic example.invalid
-- addresses do not enqueue external work before executing in production.
begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
do $acceptance$
declare
 owner_id uuid:=gen_random_uuid();owner_session uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 client_request uuid:=gen_random_uuid(); second_request uuid:=gen_random_uuid(); request_row uuid; second_row uuid;
 verification_hash text; second_hash text; changed_hash text; address text;
 result jsonb; state jsonb; approved jsonb; role_name text; fn text; auth_before bigint; checks integer:=0;
begin
 verification_hash:=kapukai_members.hash(gen_random_uuid()::text||gen_random_uuid()::text);
 second_hash:=kapukai_members.hash(gen_random_uuid()::text||gen_random_uuid()::text);
 changed_hash:=kapukai_members.hash(gen_random_uuid()::text||gen_random_uuid()::text);
 address:='access-security-'||client_request::text||'@example.invalid';
 if (select count(*) from kapukai_members.access_requests where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>95 then raise exception 'FAIL: bounded acceptance requires spare daily request capacity';end if;
 for role_name in select unnest(array['anon','authenticated','service_role']) loop
 if has_schema_privilege(role_name,'kapukai_members','USAGE') or has_table_privilege(role_name,'kapukai_members.access_requests','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_function_privilege(role_name,'kapukai_members.access_projection(uuid)','EXECUTE') then raise exception 'FAIL: access request private boundary';end if;
 for fn in select unnest(array['public.kapukai_member_access_is_open()','public.kapukai_member_access_request(text,text,uuid,text,text,boolean,boolean,boolean)','public.kapukai_member_access_token(text,text)','public.kapukai_member_access_mail_result(uuid,text,text)','public.kapukai_member_access_operator(uuid,uuid,text,jsonb)']) loop
 if has_function_privilege(role_name,fn,'EXECUTE') is distinct from (role_name='service_role') then raise exception 'FAIL: access RPC grants';end if;
 end loop;
 end loop;
 if not (select rowsecurity from pg_tables where schemaname='kapukai_members' and tablename='access_requests') then raise exception 'FAIL: request table RLS missing';end if;
 checks:=checks+1;

 insert into auth.users(id,email,email_confirmed_at,role,is_anonymous,created_at,updated_at) values(owner_id,'access-security-'||owner_id::text||'@example.invalid',now(),'authenticated',false,now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values(owner_session,owner_id,now(),now(),now()+interval '1 hour');
 insert into kapukai_members.operators(user_id) values(owner_id);
 select count(*) into auth_before from auth.users;
 update kapukai_members.config set enabled=true;
 execute 'set local role service_role';
 result:=public.kapukai_member_access_operator(outsider,owner_session,'queue','{}');if result->>'result'<>'forbidden' then raise exception 'FAIL: unmatched operator identity';end if;
 result:=public.kapukai_member_access_request(address,'Synthetic visitor',client_request,verification_hash,'kapukai-member-access-v1-2026-10-20',true,true,true);
 if result->>'result'<>'created' then raise exception 'FAIL: account-free request';end if;request_row:=(result->>'access_request_id')::uuid;
 state:=public.kapukai_member_access_token(verification_hash,'inspect');if state->>'state'<>'awaiting_email' or state->'can_confirm'<>'true'::jsonb or state?'email' or state?'id' or state?'invitation_id' then raise exception 'FAIL: inspect leaked identity or changed consent';end if;
 result:=public.kapukai_member_access_operator(owner_id,owner_session,'queue','{}');if exists(select 1 from jsonb_array_elements(result->'requests') r where r->>'id'=request_row::text) then raise exception 'FAIL: unconfirmed request queued';end if;
 result:=public.kapukai_member_access_operator(owner_id,owner_session,'approve',jsonb_build_object('request_id',request_row,'expected_revision',0,'expires_days',7));if result->>'result'<>'conflict' then raise exception 'FAIL: unconfirmed request approved';end if;
 execute 'reset role';
 if (select count(*) from auth.users)<>auth_before or exists(select 1 from kapukai_members.invitations where email_hash=kapukai_members.hash(address)) then raise exception 'FAIL: request created Auth or invitation before approval';end if;
 checks:=checks+1;

 execute 'set local role service_role';
 result:=public.kapukai_member_access_mail_result(request_row,'unknown',null);if result->>'result'<>'ok' then raise exception 'FAIL: unknown mail receipt';end if;
 result:=public.kapukai_member_access_request(address,'Synthetic visitor',client_request,changed_hash,'kapukai-member-access-v1-2026-10-20',true,true,true);if result->>'result'<>'duplicate' then raise exception 'FAIL: exact retry not idempotent';end if;
 result:=public.kapukai_member_access_request(address,'Changed visitor',client_request,changed_hash,'kapukai-member-access-v1-2026-10-20',true,true,true);if result->>'result'<>'idempotency_conflict' then raise exception 'FAIL: retry changed payload';end if;
 result:=public.kapukai_member_access_mail_result(request_row,'accepted','replayed-provider-receipt');
 execute 'reset role';
 if not exists(select 1 from kapukai_members.access_requests where id=request_row and token_hash=verification_hash and delivery_state='unknown' and provider_message_id is null) then raise exception 'FAIL: replay rotated token or receipt';end if;
 checks:=checks+1;

 execute 'set local role service_role';
 state:=public.kapukai_member_access_token(verification_hash,'confirm');if state->>'state'<>'awaiting_review' or (state->>'revision')::integer<>1 then raise exception 'FAIL: explicit confirmation';end if;
 state:=public.kapukai_member_access_token(verification_hash,'confirm');if (state->>'revision')::integer<>1 then raise exception 'FAIL: repeated confirmation revised consent';end if;
 result:=public.kapukai_member_access_operator(owner_id,owner_session,'queue','{}');if not exists(select 1 from jsonb_array_elements(result->'requests') r where r->>'id'=request_row::text and r->>'email'=address) then raise exception 'FAIL: confirmed request absent from operator queue';end if;
 execute 'reset role';
 if (select count(*) from auth.users)<>auth_before then raise exception 'FAIL: email verification created account';end if;
 checks:=checks+1;

 execute 'set local role service_role';
 approved:=public.kapukai_member_access_operator(owner_id,owner_session,'approve',jsonb_build_object('request_id',request_row,'expected_revision',1,'expires_days',7));if approved->>'result'<>'ok' or approved->>'invite_token' !~ '^[0-9a-f]{64}$' then raise exception 'FAIL: human approval invitation';end if;
 result:=public.kapukai_member_access_operator(owner_id,owner_session,'approve',jsonb_build_object('request_id',request_row,'expected_revision',1,'expires_days',7));if result->>'result'<>'conflict' then raise exception 'FAIL: replayed approval';end if;
 execute 'reset role';
 if (select count(*) from kapukai_members.invitations where email_hash=kapukai_members.hash(address))<>1 or (select count(*) from auth.users)<>auth_before then raise exception 'FAIL: approval created duplicate invitation or Auth account';end if;
 checks:=checks+1;

 update kapukai_members.config set enabled=false;
 execute 'set local role service_role';
 state:=public.kapukai_member_access_token(verification_hash,'withdraw');if state->>'state'<>'withdrawn' then raise exception 'FAIL: withdrawal while paused';end if;
 execute 'reset role';
 if not exists(select 1 from kapukai_members.invitations where id=(approved->>'invitation_id')::uuid and revoked and claimed_by is null) then raise exception 'FAIL: unused invitation not revoked';end if;
 checks:=checks+1;

 update kapukai_members.config set enabled=true;
 execute 'set local role service_role';
 result:=public.kapukai_member_access_request('access-second-'||second_request::text||'@example.invalid','Synthetic second',second_request,second_hash,'kapukai-member-access-v1-2026-10-20',true,true,true);if result->>'result'<>'created' then raise exception 'FAIL: second request';end if;second_row:=(result->>'access_request_id')::uuid;
 state:=public.kapukai_member_access_token(second_hash,'confirm');state:=public.kapukai_member_access_token(second_hash,'withdraw');
 result:=public.kapukai_member_access_operator(owner_id,owner_session,'approve',jsonb_build_object('request_id',second_row,'expected_revision',1,'expires_days',7));if result->>'result'<>'conflict' then raise exception 'FAIL: withdrawn request approved';end if;
 result:=public.kapukai_member_access_request('name<recipient@example.invalid>','Synthetic bad address',gen_random_uuid(),changed_hash,'kapukai-member-access-v1-2026-10-20',true,true,true);if result->>'result'<>'invalid' then raise exception 'FAIL: provider mailbox wrapper accepted';end if;
 checks:=checks+1;
 execute 'reset role';
 raise notice 'PASS: % member access live acceptance groups; all synthetic changes will roll back.',checks;
end $acceptance$;
rollback;
