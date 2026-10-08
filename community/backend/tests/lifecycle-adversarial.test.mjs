import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHandler as createApplicantHandler, validateRequest, CONSENT_VERSION, hashToken, randomToken} from '../supabase/functions/kapukai-community-apply/handler.mjs';
import {createHandler as createOwnerHandler} from '../supabase/functions/kapukai-workshop-ops/handler.mjs';
const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const [legacy, scoped, expansion, applications, lifecycle] = await Promise.all([
  read('./legacy_fixture.sql'), read('../sql/proposed_schema.sql'),
  read('../supabase/migrations/20261008150526_community_signup_interests.sql'),
  read('../supabase/migrations/20261008183145_community_applications.sql'),
  read('../supabase/migrations/20261008191433_workshop_lifecycle.sql')
]);
// Synthetic provider tables reproduce the columns read by the actual authorization
// helper. This deliberately does not model provider token verification or HMAC secrecy.
const identityFixture = `
create schema auth; create schema kapukai;
create table auth.users(id uuid primary key,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create table kapukai.tenants(id text primary key,state text);
create table kapukai.subjects(id text primary key,tenant_id text,state text,deleted_at timestamptz);
create table kapukai.external_identities(provider text,provider_subject_digest text,tenant_id text,subject_id text,state text);
create table kapukai.role_grants(id text primary key,tenant_id text,subject_id text,role text,capabilities text[],scope text[],effective_at timestamptz,expires_at timestamptz,revoked_at timestamptz);
create function kapukai.identity_digest_for_auth_user(id uuid) returns text language sql as $$ select id::text $$;
`;
const principal = Object.freeze({user_id:'11111111-1111-4111-8111-111111111111',session_id:'22222222-2222-4222-8222-222222222222',tenant_id:'synthetic-workshop',subject_id:'synthetic-owner'});
const ownerArgs = p => [p.user_id,p.session_id,p.tenant_id,p.subject_id];
async function setup(enabled=true) {
  const db=new PGlite();
  for (const sql of [legacy,scoped,expansion,applications,identityFixture,lifecycle]) await db.exec(sql);
  await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[principal.user_id]);
  await db.query('insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval \'1 hour\')',[principal.session_id,principal.user_id]);
  await db.query("insert into kapukai.tenants values($1,'active')",[principal.tenant_id]);
  await db.query("insert into kapukai.subjects values($1,$2,'active',null)",[principal.subject_id,principal.tenant_id]);
  await db.query("insert into kapukai.external_identities values('supabase',$1,$2,$3,'active')",[principal.user_id,principal.tenant_id,principal.subject_id]);
  await db.query("insert into kapukai.role_grants values('synthetic-grant',$1,$2,'steward',array['community:applications:review'],array['community:workshop'],now()-interval '1 hour',null,null)",[principal.tenant_id,principal.subject_id]);
  await db.exec('update kapukai_application_config set enabled=true');
  if(enabled)await db.exec('update kapukai_workshop_config set enabled=true');
  return db;
}
async function rpc(db,name,args) {
  const keys={kapukai_workshop_applicant:['p_token_hash','p_action','p_expected_revision','p_request_id','p_payload'],kapukai_workshop_owner_queue:['p_user_id','p_session_id','p_tenant_id','p_subject_id','p_limit','p_offset','p_view'],kapukai_workshop_notice_claim:['p_user_id','p_session_id','p_tenant_id','p_subject_id','p_application_id','p_expected_revision','p_request_id','p_template_version'],kapukai_workshop_notice_finish:['p_user_id','p_session_id','p_tenant_id','p_subject_id','p_notice_id','p_state','p_provider_message_id'],kapukai_workshop_owner_action:['p_user_id','p_session_id','p_tenant_id','p_subject_id','p_application_id','p_action','p_expected_revision','p_request_id','p_payload']}[name];
  assert.ok(keys,'allowlisted real RPC');
  return (await db.query('select public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') as result',keys.map(k=>k==='p_payload'?JSON.stringify(args[k]):args[k]))).rows[0].result;
}
async function queue(db,p=principal,limit=50,offset=0,view='active') {return (await db.query('select public.kapukai_workshop_owner_queue($1,$2,$3,$4,$5,$6,$7) as result',[...ownerArgs(p),limit,offset,view])).rows[0].result;}
async function snapshot(db,id) {return (await db.query('select public.kapukai_workshop_snapshot($1) as result',[id])).rows[0].result;}
async function owner(db,a,action,payload={},options={}) {
  const revision=options.revision??(await snapshot(db,a.application_id)).revision;
  return (await db.query('select public.kapukai_workshop_owner_action($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',[...ownerArgs(options.principal??principal),a.application_id,action,revision,options.id??crypto.randomUUID(),JSON.stringify(payload)])).rows[0].result;
}
async function applicant(db,a,action,payload={},options={}) {
  const revision=options.revision??(await snapshot(db,a.application_id)).revision;
  return (await db.query('select public.kapukai_workshop_applicant($1,$2,$3,$4,$5) as result',[await hashToken(options.token??a.token),action,revision,options.id??crypto.randomUUID(),JSON.stringify(payload)])).rows[0].result;
}
async function tokenOperation(db,a,action) {return (await db.query('select public.kapukai_application_token($1,$2) as result',[await hashToken(a.token),action])).rows[0].result;}
async function application(db,{confirmed=true,email=crypto.randomUUID()+'@example.test',...extra}={}) {
  const token=randomToken();
  const body={action:'request',email,display_alias:'Synthetic alias',kind:'assistance',service_interest:'tools',requested_support:'free',request_id:crypto.randomUUID(),consent_version:CONSENT_VERSION,source_path:'/community/assistance',started_at:Date.now()-2000,adult:true,privacy_acknowledged:true,human_review_acknowledged:true,website:'',...extra};
  const value=validateRequest(body).value;assert.ok(value,'valid fixture request');
  const r=(await db.query('select kapukai_application_request($1,$2,$3,$4,$5,$6) as result',[value.email,await hashToken(token),value.request_id,JSON.stringify(value.application),value.consent_version,value.source_path])).rows[0].result;
  assert.equal(r.result,'created');const a={...r,token,email};
  if(confirmed)assert.equal((await tokenOperation(db,a,'confirm')).result,'confirmed');
  return a;
}
const offerPayload={resource_id:'practice',expires_days:7,minutes:30};
async function delivered(db) {
  const a=await application(db);
  for(const [who,action,payload] of [['owner','offer',offerPayload],['applicant','accept_offer',{}],['owner','start',{}],['owner','deliver',{resource_id:'practice'}]])assert.equal((await (who==='owner'?owner:applicant)(db,a,action,payload)).result,'updated');
  return a;
}
const count=async(db,table)=>(await db.query('select count(*)::integer as n from '+table)).rows[0].n;

test('ADVERSARIAL: owner permission is re-resolved for current session, grant, mapping, subject and tenant on every request',async()=>{
  const db=await setup();try{
    const a=await application(db);assert.equal((await queue(db)).result,'ok');
    const attacks=[
      "update kapukai.role_grants set revoked_at=now()",
      "update kapukai.role_grants set expires_at=now()-interval '1 second'",
      "update kapukai.role_grants set effective_at=now()+interval '1 hour'",
      "update kapukai.role_grants set capabilities=array['engineering:read']",
      "update kapukai.role_grants set scope=array['another:community']",
      "update kapukai.role_grants set role='reviewer'",
      "delete from auth.sessions",
      "update auth.sessions set not_after=now()-interval '1 second'",
      "update auth.sessions set created_at=now()-interval '31 minutes'",
      "update auth.sessions set user_id='33333333-3333-4333-8333-333333333333'",
      "update auth.users set banned_until=now()+interval '1 hour'",
      "update auth.users set email_confirmed_at=null",
      "update kapukai.external_identities set state='revoked'",
      "update kapukai.subjects set state='deleted',deleted_at=now()",
      "update kapukai.tenants set state='suspended'"
    ];
    for(const attack of attacks){
      await db.exec('begin');await db.exec(attack);
      assert.equal((await queue(db)).result,'forbidden',attack);
      assert.equal((await owner(db,a,'review')).result,'forbidden',attack);
      await db.exec('rollback');
    }
    assert.equal((await queue(db,{...principal,subject_id:'someone-else'})).result,'forbidden');
    assert.equal((await queue(db,{...principal,tenant_id:'someone-else'})).result,'forbidden');
    assert.equal((await snapshot(db,a.application_id)).revision,0);
    assert.equal(await count(db,'kapukai_workshop_events'),0);
  }finally{await db.close();}
});

test('ADVERSARIAL: real HTTP owner handler cannot act with stale session authority or client-supplied actor fields',async()=>{
  const db=await setup();try{
    const a=await application(db);let calls=0;
    const handler=createOwnerHandler({authenticate:async()=>principal,rpc:async(name,args)=>{calls++;return rpc(db,name,args);},getConfig:async()=>{throw Error('unused');}});
    const http=body=>new Request('https://example.test/ops',{method:'POST',headers:{Origin:'https://kapukai.org','Content-Type':'application/json'},body:JSON.stringify(body)});
    const body={action:'command',application_id:a.application_id,command:'review',expected_revision:0,request_id:crypto.randomUUID(),payload:{}};
    assert.equal((await handler(http({...body,user_id:principal.user_id}))).status,400);assert.equal(calls,0);
    await db.exec('delete from auth.sessions');
    assert.equal((await handler(http(body))).status,403);assert.equal(calls,1);
    assert.equal((await snapshot(db,a.application_id)).revision,0);
  }finally{await db.close();}
});

test('ADVERSARIAL: stale revisions and changed retries cannot overwrite a deliberate owner decision',async()=>{
  const db=await setup();try{
    const a=await application(db),id=crypto.randomUUID();
    const first=await owner(db,a,'waitlist',{reason:'capacity'},{revision:0,id});assert.equal(first.result,'updated');
    assert.equal((await owner(db,a,'waitlist',{reason:'capacity'},{revision:0,id})).result,'duplicate');
    assert.equal((await owner(db,a,'waitlist',{reason:'scope'},{revision:0,id})).result,'idempotency_conflict');
    assert.equal((await owner(db,a,'decline',{reason:'capacity'},{revision:0,id})).result,'idempotency_conflict');
    assert.equal((await owner(db,a,'review',{}, {revision:0})).result,'stale_revision');
    assert.equal((await snapshot(db,a.application_id)).stage,'waitlisted');
    assert.equal(await count(db,'kapukai_workshop_events'),1);
  }finally{await db.close();}
});

test('ADVERSARIAL: applicant capabilities never cross to another application, newsletter, owner action or unpublished record',async()=>{
  const db=await setup();try{
    const first=await application(db),second=await application(db);
    assert.equal((await owner(db,first,'offer',offerPayload)).result,'updated');
    assert.equal((await owner(db,second,'offer',offerPayload)).result,'updated');
    assert.equal((await applicant(db,first,'review')).result,'transition_denied');
    assert.equal((await applicant(db,first,'publish')).result,'transition_denied');
    assert.equal((await applicant(db,first,'accept_offer',{application_id:second.application_id})).result,'invalid');
    assert.equal((await applicant(db,first,'accept_offer')).result,'updated');
    assert.equal((await snapshot(db,second.application_id)).stage,'offered');
    const scope=(await db.query("select kapukai_scoped_token($1,'confirm',null) as result",[await hashToken(first.token)])).rows[0].result;assert.equal(scope.result,'invalid');
    const seen=await tokenOperation(db,first,'inspect');
    for(const secret of ['email','token_hash','registry_id','profession','display_alias'])assert.equal(Object.hasOwn(seen,secret),false,secret);
    assert.equal(await count(db,'kapukai_scoped_subscriptions'),0);
    assert.equal(await count(db,'legacy_jobs'),0);
    assert.equal((await snapshot(db,first.application_id)).offer.nonbinding,true);
    assert.equal((await snapshot(db,first.application_id)).offer.price_cents,0);
  }finally{await db.close();}
});

test('ADVERSARIAL: old application confirmation and withdrawal links still work and withdrawal cancels reserved work',async()=>{
  const db=await setup();try{
    const a=await application(db,{confirmed:false});assert.equal((await tokenOperation(db,a,'inspect')).state,'awaiting_email');
    assert.equal((await tokenOperation(db,a,'confirm')).result,'confirmed');
    assert.equal((await owner(db,a,'offer',offerPayload)).result,'updated');
    assert.equal((await applicant(db,a,'accept_offer')).result,'updated');
    const prior=(await snapshot(db,a.application_id)).revision;
    assert.deepEqual(await tokenOperation(db,a,'withdraw'),{result:'withdrawn',state:'withdrawn'});
    assert.equal((await snapshot(db,a.application_id)).stage,'withdrawn');
    assert.equal((await queue(db)).capacity.active_commitments,0);
    assert.equal((await owner(db,a,'start',{}, {revision:prior})).result,'transition_denied');
    assert.equal((await tokenOperation(db,a,'confirm')).result,'used');
    const n=await count(db,'kapukai_workshop_events');await tokenOperation(db,a,'withdraw');assert.equal(await count(db,'kapukai_workshop_events'),n);
  }finally{await db.close();}
});

test('ADVERSARIAL: suppression after queue inspection blocks both owner progress and applicant acceptance',async()=>{
  const db=await setup();try{
    const a=await application(db);await owner(db,a,'offer',offerPayload);const before=await queue(db);assert.equal(before.result,'ok');
    await db.query("update kapukai_interest_registry set status='suppressed' where email=$1",[a.email]);
    assert.equal((await applicant(db,a,'accept_offer')).result,'suppressed');
    assert.equal((await owner(db,a,'review')).result,'suppressed');
    assert.equal((await tokenOperation(db,a,'withdraw')).result,'withdrawn');
    assert.equal((await queue(db)).capacity.active_commitments,0);
  }finally{await db.close();}
});

test('ADVERSARIAL: expired pending offers cannot be accepted and do not consume capacity before maintenance',async()=>{
  const db=await setup();try{
    await db.exec('update kapukai_workshop_config set max_open=1');const a=await application(db),b=await application(db);
    await owner(db,a,'offer',offerPayload);assert.equal((await owner(db,b,'offer',offerPayload)).result,'capacity_full');
    await db.query("update kapukai_workshop_offers set expires_at=now()-interval '1 second' where application_id=$1",[a.application_id]);
    assert.notEqual((await applicant(db,a,'accept_offer')).result,'updated');
    assert.equal((await queue(db)).capacity.active_commitments,0);
    assert.equal((await owner(db,b,'offer',offerPayload)).result,'updated');
    const r=(await db.query('select kapukai_workshop_maintenance() as result')).rows[0].result;assert.equal(r.expired_offers,1);
    assert.equal((await snapshot(db,a.application_id)).stage,'waitlisted');
    assert.equal((await applicant(db,a,'reconsider')).result,'updated');
    assert.equal((await snapshot(db,a.application_id)).stage,'queue');
  }finally{await db.close();}
});

test('ADVERSARIAL: management-expired or globally suppressed accepted commitments do not strand all capacity',async()=>{
  const db=await setup();try{
    await db.exec('update kapukai_workshop_config set max_open=1');
    for(const mode of ['suppression','management_expiry']){
      const a=await application(db);assert.equal((await owner(db,a,'offer',offerPayload)).result,'updated');assert.equal((await applicant(db,a,'accept_offer')).result,'updated');
      if(mode==='suppression')await db.query("update kapukai_interest_registry set status='suppressed' where email=$1",[a.email]);
      else await db.query("update kapukai_applications set manage_expires_at=now()-interval '1 second',expires_at=now()-interval '1 day' where id=$1",[a.application_id]);
      await db.query('select kapukai_workshop_maintenance()');
      assert.equal((await queue(db)).capacity.active_commitments,0,mode+' must release capacity');
      assert.notEqual((await owner(db,a,'start')).result,'updated');
    }
  }finally{await db.close();}
});

test('ADVERSARIAL: completion preserves correction and reconsideration without publication or credentials',async()=>{
  const db=await setup();try{
    const a=await delivered(db);
    assert.equal((await applicant(db,a,'feedback',{working:'partly',broken:'formatting',improvement:'clarity'})).result,'updated');
    assert.equal((await applicant(db,a,'correction',{category:'formatting'})).result,'updated');
    assert.equal((await owner(db,a,'resolve_correction',{resource_id:'tester_guide'})).result,'updated');
    assert.equal((await snapshot(db,a.application_id)).delivery.version,2);
    assert.equal((await owner(db,a,'close',{reason:'completed'})).result,'updated');
    assert.equal((await queue(db)).capacity.active_commitments,0);
    const closed=await snapshot(db,a.application_id);
    assert.ok(closed.actions.includes('reconsider'),'closed request has reconsideration');
    assert.ok(closed.actions.includes('correction'),'delivered work retains direct correction after closure');
    assert.equal((await applicant(db,a,'correction',{category:'missing_resource'})).result,'updated');
    assert.equal((await snapshot(db,a.application_id)).stage,'correction_requested');
    assert.equal((await applicant(db,a,'publish')).result,'transition_denied');
    assert.equal((await owner(db,a,'certify_expert')).result,'transition_denied');
    assert.equal(await count(db,'kapukai_scoped_subscriptions'),0);
    assert.equal(await count(db,'kapukai.role_grants'),1,'no applicant grant created');
  }finally{await db.close();}
});

test('ADVERSARIAL: paused workflow preserves read, closure and legacy withdrawal but forbids new commitments',async()=>{
  const db=await setup(false);try{
    const a=await application(db);
    assert.equal((await queue(db)).enabled,false);
    assert.equal((await owner(db,a,'offer',offerPayload)).result,'paused');
    assert.equal((await owner(db,a,'review')).result,'paused');
    assert.equal((await applicant(db,a,'close')).result,'updated');
    assert.equal((await applicant(db,a,'reconsider')).result,'paused');
    assert.equal((await tokenOperation(db,a,'withdraw')).result,'withdrawn');
  }finally{await db.close();}
});

test('ADVERSARIAL: resolved old requests cannot fill the fixed queue and hide actionable new work',async()=>{
  const db=await setup();try{
    for(let i=0;i<4;i++) {const a=await application(db);await owner(db,a,'close',{reason:'completed'});}
    const pending=await application(db);const q=await queue(db,principal,3);
    assert.ok(q.applications.some(a=>a.application_id===pending.application_id),'limited queue must prioritize actionable request');
    assert.equal(q.total_count,1,'active count excludes archive');
    const archive=await queue(db,principal,3,0,'archived');assert.equal(archive.total_count,4);assert.equal(archive.has_more,true);
    const next=await queue(db,principal,3,3,'archived');assert.equal(next.applications.length,1);assert.equal(next.has_more,false);
    assert.equal(new Set([...archive.applications,...next.applications].map(a=>a.application_id)).size,4);
    assert.equal((await queue(db,principal,3,0,'all')).total_count,5);
  }finally{await db.close();}
});

test('ADVERSARIAL: public roles cannot call internals, read queue tables or amend append-only audit records',async()=>{
  const db=await setup();try{
    const a=await application(db);await owner(db,a,'review');
    const tables=(await db.query("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('kapukai_workshop_config','kapukai_workshop_workflows','kapukai_workshop_offers','kapukai_workshop_deliveries','kapukai_workshop_events','kapukai_workshop_access_events','kapukai_workshop_notices')")).rows;assert.equal(tables.length,7);assert.ok(tables.every(t=>t.relrowsecurity));
    const elevated=(await db.query("select p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname like 'kapukai_workshop_%') or (n.nspname='kapukai_workshop_private' and p.proname='authorized')")).rows.filter(p=>p.prosecdef);assert.deepEqual(elevated.map(p=>p.proname),['authorized']);
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      for(const table of ['kapukai_workshop_config','kapukai_workshop_workflows','kapukai_workshop_offers','kapukai_workshop_deliveries','kapukai_workshop_events','kapukai_workshop_access_events','kapukai_workshop_notices'])await assert.rejects(db.query('select * from '+table),/permission denied/);
      await assert.rejects(queue(db),/permission denied/);await assert.rejects(snapshot(db,a.application_id),/permission denied/);
      await assert.rejects(db.query('select kapukai_workshop_maintenance()'),/permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal((await queue(db)).result,'ok');
    await assert.rejects(db.query('update kapukai_workshop_config set enabled=false'),/permission denied/);
    await assert.rejects(db.query("update kapukai_workshop_events set action='publish'"),/permission denied/);
    await assert.rejects(db.query('delete from kapukai_workshop_events'),/permission denied/);
    await assert.rejects(db.query('delete from kapukai_workshop_access_events'),/permission denied/);
    await db.exec('reset role');
  }finally{await db.close();}
});

test('ADVERSARIAL: initial delivery must match the public resource the applicant accepted',async()=>{
  const db=await setup();try{
    const a=await application(db);await owner(db,a,'offer',offerPayload);await applicant(db,a,'accept_offer');await owner(db,a,'start');
    assert.notEqual((await owner(db,a,'deliver',{resource_id:'reviewer_orientation'})).result,'updated');
    assert.equal(await count(db,'kapukai_workshop_deliveries'),0);
    assert.equal((await snapshot(db,a.application_id)).stage,'in_progress');
    assert.equal((await owner(db,a,'deliver',{resource_id:'practice'})).result,'updated');
  }finally{await db.close();}
});

test('ADVERSARIAL: transactional update claim cannot survive an expired session, stale revision or withdrawn application',async()=>{
  const db=await setup();try{
    const a=await application(db);const claim=async(rev=0)=> (await db.query('select kapukai_workshop_notice_claim($1,$2,$3,$4,$5,$6,$7,$8) as result',[...ownerArgs(principal),a.application_id,rev,crypto.randomUUID(),'kapukai-application-update-v1-2026-10-08'])).rows[0].result;
    await db.exec('begin');await db.exec("update auth.sessions set created_at=now()-interval '31 minutes'");assert.equal((await claim()).result,'forbidden');await db.exec('rollback');
    await owner(db,a,'review');assert.equal((await claim()).result,'stale_revision');
    await db.exec('begin');await db.query("update kapukai_interest_registry set status='unsubscribed' where email=$1",[a.email]);assert.equal((await claim(1)).result,'suppressed');await db.exec('rollback');
    await tokenOperation(db,a,'withdraw');assert.equal((await claim(2)).result,'transition_denied');
    assert.equal(await count(db,'kapukai_workshop_notices'),0);
  }finally{await db.close();}
});

test('ADVERSARIAL: migration preserves links issued before lifecycle code existed',async()=>{
  const db=new PGlite();try{
    for(const sql of [legacy,scoped,expansion,applications,identityFixture])await db.exec(sql);
    await db.exec('update kapukai_application_config set enabled=true');
    const old=await application(db,{confirmed:false});
    assert.equal((await tokenOperation(db,old,'inspect')).can_confirm,true);
    const newsletter=randomToken();
    await db.query('select kapukai_scoped_request($1,$2,$3,$4,$5,$6,$7,$8)',['legacy-link@example.test',['remedy_brief'],await hashToken(newsletter),crypto.randomUUID(),'kapukai-scoped-v2-2026-10-08','/community','monthly',[]]);
    await db.exec(lifecycle);
    assert.equal((await tokenOperation(db,old,'confirm')).result,'confirmed');
    assert.equal((await tokenOperation(db,old,'inspect')).lifecycle.enabled,false);
    assert.equal((await tokenOperation(db,old,'withdraw')).result,'withdrawn');
    assert.equal((await db.query("select kapukai_scoped_token($1,'confirm',null) as result",[await hashToken(newsletter)])).rows[0].result.result,'confirmed');
    assert.equal((await db.query("select kapukai_scoped_token($1,'revoke',array['remedy_brief']) as result",[await hashToken(newsletter)])).rows[0].result.result,'unsubscribed');
  }finally{await db.close();}
});

test('ADVERSARIAL: real HTTP and SQL notice flow sends only the stored recipient once, even after uncertain handoff',async()=>{
  const db=await setup();try{
    const a=await application(db),b=await application(db);await owner(db,a,'review');await owner(db,b,'review');
    const sent=[];const handler=createOwnerHandler({authenticate:async()=>principal,rpc:(name,args)=>rpc(db,name,args),getConfig:async()=>{throw Error('unused');},canSendNotice:()=>true,sendNotice:async message=>{sent.push(message);throw Error('uncertain provider handoff');}});
    const http=body=>new Request('https://example.test/ops',{method:'POST',headers:{Origin:'https://kapukai.org','Content-Type':'application/json'},body:JSON.stringify(body)});
    const body={action:'send_notice',application_id:a.application_id,expected_revision:1,request_id:crypto.randomUUID(),template_version:'kapukai-application-update-v1-2026-10-08'};
    assert.equal((await handler(http({...body,email:'attacker@example.test'}))).status,400);assert.equal(sent.length,0);
    const first=await handler(http(body));assert.equal(first.status,200);const reply=await first.json();assert.equal(reply.notice.state,'unknown');
    assert.equal(sent.length,1);assert.equal(sent[0].email,a.email);assert.ok(!JSON.stringify(reply).includes(a.email));
    assert.equal((await handler(http(body))).status,200);assert.equal(sent.length,1);
    assert.equal((await handler(http({...body,application_id:b.application_id}))).status,409);assert.equal(sent.length,1);
    await db.query("update kapukai_interest_registry set status='suppressed' where email=$1",[b.email]);
    assert.equal((await handler(http({...body,application_id:b.application_id,request_id:crypto.randomUUID()}))).status,403);assert.equal(sent.length,1);
    assert.equal(await count(db,'kapukai_workshop_notices'),1);
  }finally{await db.close();}
});

test('ADVERSARIAL: rolling applicant mutation cap blocks audit spam but preserves retry, closure and withdrawal',async()=>{
  const db=await setup();try{
    const a=await delivered(db);
    const old=(await db.query("select request_id,payload from kapukai_workshop_events where application_id=$1 and actor='applicant' and action='accept_offer'",[a.application_id])).rows[0];
    const n=(await db.query("select count(*)::integer n from kapukai_workshop_events where application_id=$1 and actor='applicant'",[a.application_id])).rows[0].n;
    await db.query("insert into kapukai_workshop_events(application_id,actor,action,request_id,payload,revision) select $1,'applicant','feedback',gen_random_uuid(),'{}',1 from generate_series(1,$2)",[a.application_id,100-n]);
    const feedback={working:'yes',broken:'none',improvement:'none'};
    assert.equal((await applicant(db,a,'feedback',feedback)).result,'rate_limited');
    assert.equal((await applicant(db,a,'accept_offer',old.payload,{id:old.request_id,revision:0})).result,'duplicate');
    const handler=createApplicantHandler({rpc:(name,args)=>rpc(db,name,args),enabled:true,rateFingerprint:hashToken,sendConfirmation:async()=>{throw Error('must not send');}});
    const response=await handler(new Request('https://example.test/apply',{method:'POST',headers:{Origin:'https://kapukai.org','Content-Type':'application/json'},body:JSON.stringify({action:'lifecycle',token:a.token,command:'feedback',expected_revision:(await snapshot(db,a.application_id)).revision,request_id:crypto.randomUUID(),payload:feedback})}));
    assert.equal(response.status,429);assert.equal((await response.json()).result,'rate_limited');
    assert.equal((await applicant(db,a,'close')).result,'updated');
    assert.equal((await applicant(db,a,'reconsider')).result,'rate_limited');
    assert.equal((await tokenOperation(db,a,'withdraw')).result,'withdrawn');
    const b=await delivered(db);
    await db.query("insert into kapukai_workshop_events(application_id,actor,action,request_id,payload,revision,created_at) select $1,'applicant','feedback',gen_random_uuid(),'{}',1,now()-interval '25 hours' from generate_series(1,100)",[b.application_id]);
    assert.equal((await applicant(db,b,'feedback',feedback)).result,'updated','older events fall out of rolling window; cap is scoped to own application');
  }finally{await db.close();}
});

test('ADVERSARIAL: complete workflow runs with service-role privileges while configuration and audit remain protected',async()=>{
  const db=await setup();try{
    const a=await application(db);await db.exec('set role service_role');
    assert.equal((await queue(db)).result,'ok');
    for(const [who,action,payload] of [['owner','review',{}],['owner','offer',offerPayload],['applicant','accept_offer',{}],['owner','start',{}],['owner','deliver',{resource_id:'practice'}],['applicant','feedback',{working:'partly',broken:'formatting',improvement:'clarity'}],['applicant','correction',{category:'formatting'}],['owner','resolve_correction',{resource_id:'tester_guide'}],['owner','close',{reason:'completed'}]]){
      assert.equal((await (who==='owner'?owner:applicant)(db,a,action,payload)).result,'updated',who+' '+action);
    }
    assert.equal((await queue(db)).capacity.active_commitments,0);
    const rev=(await snapshot(db,a.application_id)).revision;
    const n=(await db.query('select kapukai_workshop_notice_claim($1,$2,$3,$4,$5,$6,$7,$8) as result',[...ownerArgs(principal),a.application_id,rev,crypto.randomUUID(),'kapukai-application-update-v1-2026-10-08'])).rows[0].result;
    assert.equal(n.result,'claimed');
    assert.equal((await db.query('select kapukai_workshop_notice_finish($1,$2,$3,$4,$5,$6,$7) as result',[...ownerArgs(principal),n.notice_id,'unknown',null])).rows[0].result.result,'recorded');
    assert.equal((await applicant(db,a,'reconsider')).result,'updated');
    assert.equal((await owner(db,a,'offer',offerPayload)).result,'updated');
    assert.equal((await tokenOperation(db,a,'withdraw')).result,'withdrawn');
    assert.equal((await queue(db)).capacity.active_commitments,0);
    await db.query('select kapukai_workshop_maintenance()');
    await assert.rejects(db.query('update kapukai_workshop_config set enabled=false'),/permission denied/);
    await assert.rejects(db.query("update kapukai_workshop_events set action='publish'"),/permission denied/);
    await db.exec('reset role');
  }finally{await db.close();}
});

test('ADVERSARIAL: one delivery version can be acknowledged once and correction requires a new acknowledgement',async()=>{
  const db=await setup();try{
    const a=await delivered(db);
    assert.equal((await applicant(db,a,'delivery_received')).result,'updated');
    assert.ok(!(await snapshot(db,a.application_id)).actions.includes('delivery_received'));
    assert.equal((await applicant(db,a,'delivery_received')).result,'transition_denied');
    await applicant(db,a,'correction',{category:'formatting'});await owner(db,a,'resolve_correction',{resource_id:'tester_guide'});
    assert.ok((await snapshot(db,a.application_id)).actions.includes('delivery_received'));
    assert.equal((await applicant(db,a,'delivery_received')).result,'updated');
    const rows=(await db.query("select delivery_version from kapukai_workshop_events where application_id=$1 and action='delivery_received' order by id",[a.application_id])).rows;
    assert.deepEqual(rows.map(r=>r.delivery_version),[1,2]);
  }finally{await db.close();}
});
