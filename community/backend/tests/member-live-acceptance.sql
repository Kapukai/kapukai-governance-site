-- Run this entire file as ONE administrative database call after reviewing auth triggers.
-- No Auth API, password, external provider, email, existing account, or durable test data.
-- Synthetic auth rows and all member changes are contained in BEGIN ... ROLLBACK.
-- Preconditions inspected 2026-10-19: auth.sessions has no noninternal triggers;
-- auth.users trigger writes only transactional CRM tables and rejects synthetic email.
-- This tests live PostgreSQL authorization and transitions, not browser/email delivery.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

do $acceptance$
declare
  owner_id uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
  owner_session uuid:=gen_random_uuid(); a_session uuid:=gen_random_uuid(); b_session uuid:=gen_random_uuid(); outsider_session uuid:=gen_random_uuid();
  address_a text; address_b text; address_outsider text; invitation text; result jsonb; state jsonb; feed jsonb;
  post_id uuid; request_id uuid; assignment_id uuid; credential_id uuid; feedback_id uuid; introduction_id uuid; event_id uuid;
  start_at text; end_at text; role_name text; item record; checks integer:=0;
begin
  -- Catalog evidence checks the entire private schema, not just an example table.
  for role_name in select unnest(array['anon','authenticated','service_role']) loop
    if has_schema_privilege(role_name,'kapukai_members','USAGE') then
      raise exception 'FAIL: private schema usage granted to %',role_name;
    end if;
    for item in select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kapukai_members' and c.relkind='r' loop
      if not item.relrowsecurity or has_table_privilege(role_name,item.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'FAIL: table boundary for %',role_name;
      end if;
    end loop;
    for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kapukai_members' loop
      if has_function_privilege(role_name,item.oid,'EXECUTE') then raise exception 'FAIL: private helper executable';end if;
    end loop;
  end loop;
  for role_name in select unnest(array['anon','authenticated']) loop
    if has_function_privilege(role_name,'public.kapukai_member_command(uuid,uuid,text,jsonb)','EXECUTE')
       or has_function_privilege(role_name,'public.kapukai_member_public()','EXECUTE')
       or has_function_privilege(role_name,'public.kapukai_member_signup_check(text,text)','EXECUTE') then
      raise exception 'FAIL: browser role has direct RPC privilege';
    end if;
    execute format('set local role %I',role_name);
    begin
      perform public.kapukai_member_command(a,a_session,'state','{}');
      raise exception 'FAIL: browser role executed private RPC';
    exception when insufficient_privilege then null;end;
    begin
      perform id from kapukai_members.members limit 1;
      raise exception 'FAIL: browser role read private table';
    exception when insufficient_privilege then null;end;
    execute 'reset role';
  end loop;
  checks:=checks+1;

  execute 'set local role service_role';
  result:=public.kapukai_member_command(a,a_session,'state','{}');
  if result->>'result'<>'forbidden' then raise exception 'FAIL: missing session allowed';end if;
  execute 'reset role';
  checks:=checks+1;

  if (select count(*) from kapukai_members.members where status='active')>27 then
    raise exception 'FAIL: safe synthetic acceptance requires three unused pilot seats';
  end if;
  address_a:='security-'||a::text||'@example.invalid';
  address_b:='security-'||b::text||'@example.invalid';
  address_outsider:='security-'||outsider::text||'@example.invalid';
  insert into auth.users(id,email,email_confirmed_at,role,is_anonymous,created_at,updated_at) values
    (owner_id,'security-'||owner_id::text||'@example.invalid',now(),'authenticated',false,now(),now()),
    (a,address_a,now(),'authenticated',false,now(),now()),
    (b,address_b,now(),'authenticated',false,now(),now()),
    (outsider,address_outsider,now(),'authenticated',false,now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values
    (owner_session,owner_id,now(),now(),now()+interval '1 hour'),
    (a_session,a,now(),now(),now()+interval '1 hour'),
    (b_session,b,now(),now(),now()+interval '1 hour'),
    (outsider_session,outsider,now(),now(),now()+interval '1 hour');
  insert into kapukai_members.operators(user_id) values(owner_id);
  execute 'set local role service_role';
  result:=public.kapukai_member_command(owner_id,owner_session,'operator_config','{"enabled":true,"max_members":30}');
  if result->>'result'<>'ok' then raise exception 'FAIL: synthetic operator setup';end if;
  result:=public.kapukai_member_command(a,b_session,'state','{}');
  if result->>'result'<>'forbidden' then raise exception 'FAIL: foreign session accepted';end if;
  result:=public.kapukai_member_command(a,a_session,'operator_config','{"enabled":true,"max_members":30}');
  if result->>'result'<>'forbidden' then raise exception 'FAIL: member escalated operator';end if;

  for item in select * from (values(a,a_session,address_a,'Synthetic A'),(b,b_session,address_b,'Synthetic B'),(outsider,outsider_session,address_outsider,'Synthetic outsider')) t(member_id,session_id,email,display_name) loop
    result:=public.kapukai_member_command(owner_id,owner_session,'operator_invite',jsonb_build_object('email',item.email,'expires_days',1));
    if result->>'result'<>'ok' then raise exception 'FAIL: synthetic invite generation';end if;
    invitation:=result->>'invite_token';
    result:=public.kapukai_member_signup_check('wrong-'||item.email,invitation);
    if result->>'result'<>'forbidden' then raise exception 'FAIL: invite email mismatch accepted';end if;
    result:=public.kapukai_member_signup_check(item.email,invitation);
    if result->>'result'<>'ok' then raise exception 'FAIL: bound invitation rejected';end if;
    result:=public.kapukai_member_command(item.member_id,item.session_id,'join',jsonb_build_object('invite_token',invitation,'display_name',item.display_name,'adult',true,'privacy_acknowledged',true));
    if result->>'result'<>'ok' then raise exception 'FAIL: invited verified account could not join';end if;
    result:=public.kapukai_member_signup_check(item.email,invitation);
    if result->>'result'<>'forbidden' then raise exception 'FAIL: claimed invitation remained reusable';end if;
  end loop;
  checks:=checks+1;

  execute 'reset role';
  update auth.sessions set not_after=now()-interval '1 second' where id=a_session;
  execute 'set local role service_role';
  result:=public.kapukai_member_command(a,a_session,'state','{}');
  if result->>'result'<>'forbidden' then raise exception 'FAIL: expired session accepted';end if;
  execute 'reset role';
  update auth.sessions set not_after=now()+interval '1 hour',created_at=now()-interval '31 minutes' where id=a_session;
  execute 'set local role service_role';
  result:=public.kapukai_member_command(a,a_session,'state','{}');
  if result->>'result'<>'forbidden' then raise exception 'FAIL: old session accepted';end if;
  execute 'reset role';
  update auth.sessions set created_at=now() where id=a_session;
  update auth.users set email_confirmed_at=null where id=a;
  execute 'set local role service_role';
  result:=public.kapukai_member_command(a,a_session,'state','{}');
  if result->>'result'<>'forbidden' then raise exception 'FAIL: unverified email accepted';end if;
  execute 'reset role';
  update auth.users set email_confirmed_at=now() where id=a;
  execute 'set local role service_role';
  checks:=checks+1;

  result:=public.kapukai_member_command(a,a_session,'profile_save','{"display_name":"Synthetic A","bio":"Fictional test only","interests":["tools"],"discoverable":true,"reviewer_opt_in":false,"reviewer_scopes":[]}');
  if result->>'result'<>'ok' then raise exception 'FAIL: profile setup';end if;
  state:=public.kapukai_member_command(a,a_session,'state','{}');
  if exists(select 1 from jsonb_array_elements(state->'discovery') x where x->>'id'=b::text) then raise exception 'FAIL: discovery without mutual opt in';end if;
  result:=public.kapukai_member_command(b,b_session,'profile_save','{"display_name":"Synthetic B","bio":"Fictional test only","interests":["tools"],"discoverable":true,"reviewer_opt_in":true,"reviewer_scopes":["tools"]}');
  if result->>'result'<>'ok' then raise exception 'FAIL: reviewer profile setup';end if;
  state:=public.kapukai_member_command(a,a_session,'state','{}');
  if not exists(select 1 from jsonb_array_elements(state->'discovery') x where x->>'id'=b::text) then raise exception 'FAIL: mutual discovery absent';end if;
  if exists(select 1 from jsonb_array_elements(state->'discovery') x where x->>'id'=outsider::text) then raise exception 'FAIL: private profile disclosed';end if;
  checks:=checks+1;

  perform public.kapukai_member_command(a,a_session,'room_join','{"room_id":"commons"}');
  perform public.kapukai_member_command(b,b_session,'room_join','{"room_id":"commons"}');
  result:=public.kapukai_member_command(a,a_session,'post_create','{"room_id":"commons","body":"Synthetic acceptance post; rollback only."}');
  if result->>'result'<>'ok' then raise exception 'FAIL: room post';end if;post_id:=(result->>'id')::uuid;
  result:=public.kapukai_member_command(outsider,outsider_session,'room_posts','{"room_id":"commons"}');
  if result->>'result'<>'forbidden' then raise exception 'FAIL: nonmember read room';end if;
  result:=public.kapukai_member_command(b,b_session,'post_delete',jsonb_build_object('post_id',post_id));
  if result->>'result'<>'not_found' then raise exception 'FAIL: foreign post deletion';end if;
  checks:=checks+1;

  result:=public.kapukai_member_command(a,a_session,'request_create','{"title":"Synthetic test","summary":"Fictional minimal description","scope":"tools"}');
  if result->>'result'<>'ok' then raise exception 'FAIL: review request';end if;request_id:=(result->>'id')::uuid;
  state:=public.kapukai_member_command(b,b_session,'state','{}');
  if exists(select 1 from jsonb_array_elements(state->'requests') x where x->>'id'=request_id::text) then raise exception 'FAIL: unassigned request disclosure';end if;
  result:=public.kapukai_member_command(a,a_session,'assignment_propose',jsonb_build_object('request_id',request_id,'reviewer_id',b));
  if result->>'result'<>'forbidden' then raise exception 'FAIL: unverified reviewer assignment';end if;
  result:=public.kapukai_member_command(b,b_session,'credential_submit','{"title":"Synthetic credential","issuer":"Synthetic issuer","source_url":"https://example.invalid/credential"}');
  if result->>'result'<>'ok' then raise exception 'FAIL: credential submission';end if;credential_id:=(result->>'id')::uuid;
  result:=public.kapukai_member_command(owner_id,owner_session,'operator_credential_review',jsonb_build_object('credential_id',credential_id,'verified',true,'scopes',jsonb_build_array('tools'),'source_url','https://example.invalid/verified'));
  if result->>'result'<>'ok' then raise exception 'FAIL: credential review';end if;
  result:=public.kapukai_member_command(a,a_session,'assignment_propose',jsonb_build_object('request_id',request_id,'reviewer_id',b));
  if result->>'result'<>'ok' then raise exception 'FAIL: eligible assignment proposal';end if;assignment_id:=(result->>'id')::uuid;
  result:=public.kapukai_member_command(b,b_session,'assignment_respond',jsonb_build_object('assignment_id',assignment_id,'accept',true,'conflict_free',false));
  if result->>'result'<>'invalid' then raise exception 'FAIL: conflict declaration bypass';end if;
  result:=public.kapukai_member_command(b,b_session,'assignment_respond',jsonb_build_object('assignment_id',assignment_id,'accept',true,'conflict_free',true));
  if result->>'result'<>'ok' then raise exception 'FAIL: deliberate assignment acceptance';end if;
  state:=public.kapukai_member_command(outsider,outsider_session,'state','{}');
  if exists(select 1 from jsonb_array_elements(state->'requests') x where x->>'id'=request_id::text) then raise exception 'FAIL: outsider request disclosure';end if;
  result:=public.kapukai_member_command(outsider,outsider_session,'request_close',jsonb_build_object('request_id',request_id));
  if result->>'result'<>'not_found' then raise exception 'FAIL: foreign request close';end if;
  checks:=checks+1;

  result:=public.kapukai_member_command(a,a_session,'introduction_request',jsonb_build_object('member_id',b));
  if result->>'result'<>'ok' then raise exception 'FAIL: introduction request';end if;introduction_id:=(result->>'id')::uuid;
  result:=public.kapukai_member_command(outsider,outsider_session,'introduction_respond',jsonb_build_object('introduction_id',introduction_id,'accept',true));
  if result->>'result'<>'not_found' then raise exception 'FAIL: foreign introduction response';end if;
  result:=public.kapukai_member_command(b,b_session,'introduction_respond',jsonb_build_object('introduction_id',introduction_id,'accept',true));
  if result->>'result'<>'ok' then raise exception 'FAIL: introduction acceptance';end if;
  start_at:=to_char((now()+interval '1 day') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end_at:=to_char((now()+interval '1 day 1 hour') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
  result:=public.kapukai_member_command(a,a_session,'event_offer',jsonb_build_object('invitee_id',b,'title','Synthetic meeting','starts_at',start_at,'ends_at',end_at));
  if result->>'result'<>'ok' then raise exception 'FAIL: event offer';end if;event_id:=(result->>'id')::uuid;
  result:=public.kapukai_member_command(b,b_session,'event_respond',jsonb_build_object('event_id',event_id,'accept',true));
  if result->>'result'<>'ok' then raise exception 'FAIL: event acceptance';end if;
  result:=public.kapukai_member_command(a,a_session,'event_offer',jsonb_build_object('invitee_id',b,'title','Synthetic overlap','starts_at',start_at,'ends_at',end_at));
  if result->>'result'<>'conflict' then raise exception 'FAIL: accepted event overlap';end if;
  state:=public.kapukai_member_command(outsider,outsider_session,'state','{}');
  if exists(select 1 from jsonb_array_elements(state->'events') x where x->>'id'=event_id::text) then raise exception 'FAIL: foreign calendar disclosure';end if;
  checks:=checks+1;

  result:=public.kapukai_member_command(a,a_session,'feedback_save','{"body":"Synthetic private feedback; rollback only."}');
  if result->>'result'<>'ok' then raise exception 'FAIL: feedback save';end if;feedback_id:=(result->>'id')::uuid;
  result:=public.kapukai_member_command(owner_id,owner_session,'operator_feedback_propose',jsonb_build_object('feedback_id',feedback_id,'excerpt','Synthetic approved excerpt.'));
  if result->>'result'<>'ok' then raise exception 'FAIL: excerpt proposal';end if;
  result:=public.kapukai_member_command(a,a_session,'feedback_consent',jsonb_build_object('feedback_id',feedback_id,'version',1,'consent',true));
  if result->>'result'<>'conflict' then raise exception 'FAIL: stale release consent accepted';end if;
  result:=public.kapukai_member_command(b,b_session,'feedback_consent',jsonb_build_object('feedback_id',feedback_id,'version',2,'consent',true));
  if result->>'result'<>'not_found' then raise exception 'FAIL: foreign publication consent';end if;
  result:=public.kapukai_member_command(owner_id,owner_session,'operator_feedback_publish',jsonb_build_object('feedback_id',feedback_id,'version',2));
  if result->>'result'<>'conflict' then raise exception 'FAIL: publication without author consent';end if;
  perform public.kapukai_member_command(a,a_session,'feedback_consent',jsonb_build_object('feedback_id',feedback_id,'version',2,'consent',true));
  feed:=public.kapukai_member_public();
  if exists(select 1 from jsonb_array_elements(feed->'feedback') x where x->>'id'=feedback_id::text) then raise exception 'FAIL: author consent auto-published';end if;
  result:=public.kapukai_member_command(owner_id,owner_session,'operator_feedback_publish',jsonb_build_object('feedback_id',feedback_id,'version',2));
  if result->>'result'<>'ok' then raise exception 'FAIL: deliberate publication';end if;
  feed:=public.kapukai_member_public();
  if not exists(select 1 from jsonb_array_elements(feed->'feedback') x where x->>'id'=feedback_id::text and x->>'excerpt'='Synthetic approved excerpt.') then raise exception 'FAIL: approved excerpt missing';end if;
  if exists(select 1 from jsonb_array_elements(feed->'feedback') x where x?'body' or x?'member_id' or x?'email') then raise exception 'FAIL: private feedback field in public projection';end if;
  checks:=checks+1;

  perform public.kapukai_member_command(b,b_session,'credential_consent',jsonb_build_object('credential_id',credential_id,'consent',true));
  feed:=public.kapukai_member_public();
  if not exists(select 1 from jsonb_array_elements(feed->'credentials') x where x->>'id'=credential_id::text) then raise exception 'FAIL: approved credential publication';end if;
  result:=public.kapukai_member_command(owner_id,owner_session,'operator_credential_review',jsonb_build_object('credential_id',credential_id,'verified',false,'scopes',jsonb_build_array('tools'),'source_url','https://example.invalid/revoked'));
  if result->>'result'<>'ok' then raise exception 'FAIL: credential downgrade';end if;
  feed:=public.kapukai_member_public();
  if exists(select 1 from jsonb_array_elements(feed->'credentials') x where x->>'id'=credential_id::text) then raise exception 'FAIL: revoked credential stayed public';end if;
  state:=public.kapukai_member_command(b,b_session,'state','{}');
  if exists(select 1 from jsonb_array_elements(state->'requests') x where x->>'id'=request_id::text) then raise exception 'FAIL: downgraded reviewer retained request';end if;
  checks:=checks+1;

  result:=public.kapukai_member_command(a,a_session,'close','{}');
  if result->>'result'<>'ok' then raise exception 'FAIL: account closure';end if;
  result:=public.kapukai_member_command(a,a_session,'post_create','{"room_id":"commons","body":"Should never be saved"}');
  if result->>'result'<>'forbidden' then raise exception 'FAIL: closed member wrote content';end if;
  feed:=public.kapukai_member_public();
  if exists(select 1 from jsonb_array_elements(feed->'feedback') x where x->>'id'=feedback_id::text) then raise exception 'FAIL: closure retained public feedback';end if;
  state:=public.kapukai_member_command(b,b_session,'state','{}');
  if exists(select 1 from jsonb_array_elements(state->'discovery') x where x->>'id'=a::text)
     or exists(select 1 from jsonb_array_elements(state->'events') x where x->>'id'=event_id::text) then raise exception 'FAIL: closure retained member visibility';end if;
  result:=public.kapukai_member_command(b,b_session,'room_posts','{"room_id":"commons"}');
  if exists(select 1 from jsonb_array_elements(result->'posts') x where x->>'id'=post_id::text) then raise exception 'FAIL: closure retained room content';end if;
  result:=public.kapukai_member_command(a,a_session,'export','{}');
  if result->>'result'<>'ok' then raise exception 'FAIL: closure removed export access';end if;
  checks:=checks+1;

  execute 'reset role';
  raise notice 'PASS: % live acceptance groups; all synthetic changes will roll back.',checks;
end
$acceptance$;

rollback;
