import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const [fixture,migration]=await Promise.all([read('./crm-fixture.sql'),read('../supabase/migrations/20261010162458_signup_crm_outbox.sql')]);
async function setup(){const db=new PGlite();await db.exec(fixture);await db.exec(migration);return db;}
async function val(db,sql,args=[]){return (await db.query(sql,args)).rows[0]?.r;}
const snapshot=(db,email)=>val(db,'select private.kapukai_crm_snapshot($1) as r',[email]);
const claim=db=>val(db,'select kapukai_crm_claim() as r');
const ready=db=>db.exec("update kapukai_crm_config set enabled=true;select kapukai_crm_heartbeat(true)");
const registry=async(db,email='person@registrants.dev',other={})=>val(db,"insert into kapukai_interest_registry(email,full_name,organization,interests,status,email_confirmed_at) values($1,$2,$3,$4,$5,$6) returning id as r",[email,other.name??null,other.company??null,other.interests??[],other.status??'pending',other.confirmed??null]);
const ack=(db,job,overrides={})=>val(db,'select kapukai_crm_complete($1,$2,$3,$4,$5,$6,$7,$8) as r',[job.email,job.generation,job.lease_id,overrides.id??null,overrides.error??null,overrides.retry??60,overrides.outcome??'synced',overrides.optout??null]);
const current=(db,j)=>val(db,'select kapukai_crm_lease_current($1,$2,$3) as r',[j.email,j.generation,j.lease_id]);

test('deduped source projection excludes free text and never turns account verification into topic consent',async()=>{
 const db=await setup();try{
  const id=await registry(db,'Person@registrants.dev',{name:'Person',company:'Team'});
  await db.query("insert into kapukai_scoped_intents(registry_id) values($1)",[id]);
  await db.query("insert into kapukai_applications(registry_id,kind,requested_support,display_alias,profession) values($1,'witness','sensitive','PrivateAlias','private profession')",[id]);
  await db.query("insert into assurance_connections(email,message) values('person@registrants.dev','Sensitive assurance text')");
  await db.query("insert into kapukai_connections(email,message) values('person@registrants.dev','Sensitive introduction')");
  await db.query("insert into kapukai_connection_requests(email,payload) values('person@registrants.dev','{\"message\":\"PRIVATE\"}')");
  await db.exec("set role supabase_auth_admin;insert into auth.users(email,email_confirmed_at,encrypted_password) values('person@registrants.dev',now(),'secret-password');reset role");
  assert.equal(await val(db,'select count(*)::integer as r from kapukai_crm_outbox'),1);
  const p=await snapshot(db,'PERSON@registrants.dev');assert.equal(p.email_verified,true);assert.deepEqual(p.confirmed_topics,[]);
  assert.equal(p.name,'Person');assert.equal(p.company,'Team');assert.equal(p.consent_status,'pending');
  assert.deepEqual(p.signup_sources,['account','community_application','community_preferences','connection','connection_request','interest_registry','public_assurance']);
  assert.equal(/Sensitive|PrivateAlias|private profession|witness|secret-password|PRIVATE/.test(JSON.stringify(p)),false);
  assert.equal(await val(db,"select has_table_privilege('service_role','auth.users','SELECT') as r"),false);
  await db.exec('set role service_role');assert.ok(await snapshot(db,'person@registrants.dev'));await db.exec('reset role');
 }finally{await db.close();}
});

test('scoped confirmation and revocation retain independent source topics; identity stub does not mask expiry',async()=>{
 const db=await setup();try{
  const id=await registry(db);await db.query("insert into kapukai_scoped_intents(registry_id,expires_at) values($1,now()-interval '1 minute')",[id]);
  assert.equal((await snapshot(db,'person@registrants.dev')).consent_status,'expired');
  await db.query("update kapukai_scoped_intents set state='confirmed' where registry_id=$1",[id]);
  await db.query("insert into kapukai_scoped_subscriptions(registry_id,topic) values($1,'free_classes')",[id]);
  await db.query("insert into assurance_connections(email,status,confirmed_at,topics) values('person@registrants.dev','confirmed',now(),array['research'])");
  assert.deepEqual((await snapshot(db,'person@registrants.dev')).confirmed_topics,['assurance:research','scoped:free_classes']);
  await db.query("update kapukai_scoped_subscriptions set state='unsubscribed',revoked_at=now() where registry_id=$1",[id]);
  let p=await snapshot(db,'person@registrants.dev');assert.deepEqual(p.confirmed_topics,['assurance:research']);assert.ok(p.latest_withdrawal_at);
  await db.query("update kapukai_interest_registry set status='suppressed' where id=$1",[id]);
  p=await snapshot(db,'person@registrants.dev');assert.equal(p.suppressed,true);assert.deepEqual(p.confirmed_topics,['assurance:research']);
 }finally{await db.close();}
});

test('confirmed application without newsletter choices is contact-only, then withdrawn',async()=>{
 const db=await setup();try{
  const id=await registry(db);await db.query("insert into kapukai_applications(registry_id,state,confirmed_at) values($1,'awaiting_human_review',now())",[id]);
  let p=await snapshot(db,'person@registrants.dev');assert.equal(p.consent_status,'contact_only');assert.equal(p.email_verified,true);assert.deepEqual(p.confirmed_topics,[]);
  await db.query("update kapukai_applications set state='withdrawn',withdrawn_at=now() where registry_id=$1",[id]);
  p=await snapshot(db,'person@registrants.dev');assert.equal(p.consent_status,'withdrawn');assert.ok(p.latest_withdrawal_at);
 }finally{await db.close();}
});

test('workshop lifecycle updates mirror fixed state only, without granting new consent',async()=>{
 const db=await setup();try{
  const id=await registry(db);const app=await val(db,"insert into kapukai_applications(registry_id,state,confirmed_at,kind) values($1,'awaiting_human_review',now(),'witness') returning id as r",[id]);
  await db.query("insert into kapukai_workshop_workflows(application_id,stage,reason,feedback) values($1,'delivered','PRIVATE REASON','{\"private\":\"details\"}')",[app]);
  await ready(db);const [j]=await claim(db);assert.ok(j.payload.source_states.includes('application:delivered'));await ack(db,j,{id:'1060'});
  await db.query("update kapukai_workshop_workflows set stage='closed' where application_id=$1",[app]);const [closed]=await claim(db);
  assert.ok(closed.payload.source_states.includes('application:closed'));assert.equal(closed.payload.source_states.includes('application:delivered'),false);
  assert.equal(closed.payload.source_states.includes('application:awaiting_human_review'),false);
  assert.deepEqual(closed.payload.confirmed_topics,[]);assert.equal(closed.payload.consent_status,'contact_only');
  assert.equal(/PRIVATE|witness|details/.test(JSON.stringify(closed.payload)),false);
 }finally{await db.close();}
});

test('claims fail closed; pause and new source generation invalidate writes; late completion preserves ID and requeues',async()=>{
 const db=await setup();try{
  const id=await registry(db);assert.deepEqual(await claim(db),[]);await ready(db);const [j]=await claim(db);assert.equal(await current(db,j),true);
  await db.exec('update kapukai_crm_config set enabled=false');assert.equal(await current(db,j),false);await db.exec('update kapukai_crm_config set enabled=true');
  await db.query("insert into kapukai_scoped_subscriptions(registry_id,topic) values($1,'free_classes')",[id]);assert.equal(await current(db,j),false);
  assert.equal(await val(db,'select kapukai_crm_checkpoint($1,$2,$3,$4) as r',[j.email,j.generation,j.lease_id,'1001']),true);
  assert.equal(await ack(db,j,{id:'1001',optout:true}),true);
  const row=await val(db,"select to_jsonb(o) as r from kapukai_crm_outbox o where email=$1",[j.email]);
  assert.equal(row.state,'pending');assert.equal(row.hubspot_contact_id,'1001');assert.equal(row.hubspot_email_optout,true);
  const [next]=await claim(db);assert.deepEqual(next.payload.confirmed_topics,['scoped:free_classes']);assert.equal(next.hubspot_contact_id,'1001');
  assert.equal(await ack(db,j,{id:'1001'}),false);assert.equal(await ack(db,next,{id:'1001'}),true);
 }finally{await db.close();}
});

test('expired lease can be reclaimed but old worker cannot checkpoint or complete; retries are observable',async()=>{
 const db=await setup();try{
  await registry(db);await ready(db);const [j]=await claim(db);await db.exec("update kapukai_crm_outbox set lease_until=now()-interval '1 second'");
  const [next]=await claim(db);assert.notEqual(next.lease_id,j.lease_id);assert.equal(await ack(db,j),false);
  assert.equal(await val(db,'select kapukai_crm_checkpoint($1,$2,$3,$4) as r',[j.email,j.generation,j.lease_id,'1002']),false);
  assert.equal(await ack(db,next,{outcome:'retry',error:'HUBSPOT_RATE_LIMIT',retry:3600}),true);assert.deepEqual(await claim(db),[]);
  let h=await val(db,'select kapukai_crm_health() as r');assert.equal(h.counts.retry,1);assert.equal(h.errors.HUBSPOT_RATE_LIMIT,1);assert.equal(JSON.stringify(h).includes('@'),false);
  assert.equal(await val(db,'select kapukai_crm_retry($1) as r',[next.email]),1);const [again]=await claim(db);assert.equal(again.attempt_count,1);
  await ack(db,again,{outcome:'blocked',error:'CONTACT_MISSING'});h=await val(db,'select kapukai_crm_health() as r');assert.equal(h.counts.blocked,1);
 }finally{await db.close();}
});

test('email changes queue old tombstone and new identity without copying mapped ID',async()=>{
 const db=await setup();try{
  const id=await registry(db);await ready(db);const [j]=await claim(db);await ack(db,j,{id:'1003'});
  await db.query("update kapukai_interest_registry set email='replacement@registrants.dev' where id=$1",[id]);
  const jobs=await claim(db);assert.equal(jobs.length,2);const old=jobs.find(x=>x.email===j.email),fresh=jobs.find(x=>x.email!==j.email);
  assert.equal(old.payload.source_present,false);assert.equal(old.payload.suppressed,true);assert.equal(old.hubspot_contact_id,'1003');assert.equal(fresh.hubspot_contact_id,null);
  assert.deepEqual(old.payload.confirmed_topics,[]);assert.equal(fresh.payload.source_present,true);
 }finally{await db.close();}
});

test('explicit erasure leaves one-way exclusion and cannot be resurrected by source changes or backfill',async()=>{
 const db=await setup();try{
  const id=await registry(db);await ready(db);const [j]=await claim(db);await ack(db,j,{id:'1004'});
  await db.query("select kapukai_crm_exclude($1,'privacy_erasure')",[j.email]);const [removed]=await claim(db);
  assert.equal(removed.payload.source_present,false);assert.equal(removed.payload.name,null);assert.deepEqual(removed.payload.signup_sources,[]);assert.equal(removed.payload.suppressed,true);
  await ack(db,removed,{id:'1004'});assert.equal(await val(db,'select count(*)::integer as r from kapukai_crm_outbox'),0);
  const exclusions=await val(db,'select jsonb_agg(to_jsonb(e)) as r from kapukai_crm_exclusions e');assert.equal(JSON.stringify(exclusions).includes(j.email),false);assert.equal(exclusions[0].hubspot_contact_id,'1004');
  await db.query("update kapukai_interest_registry set full_name='Changed' where id=$1",[id]);await db.exec('select kapukai_crm_reconcile()');
  assert.equal(await val(db,'select count(*)::integer as r from kapukai_crm_outbox'),0);
 }finally{await db.close();}
});

test('synthetic domains excluded; service RPCs private to clients; worker token uses hash only',async()=>{
 const db=await setup();try{
  for(const email of ['a@example.com','b@sub.example.org','c@demo.invalid','d@unit.test'])await registry(db,email);
  assert.equal(await val(db,'select count(*)::integer as r from kapukai_crm_outbox'),0);
  const funcs=(await db.query("select p.oid::regprocedure::text as fn,has_function_privilege('anon',p.oid,'EXECUTE') as a,has_function_privilege('authenticated',p.oid,'EXECUTE') as u from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'kapukai_crm_%'")).rows;
  assert.ok(funcs.length>=15);assert.ok(funcs.every(x=>!x.a&&!x.u));
  const token='a'.repeat(96);await db.query("update kapukai_crm_config set worker_token_hash=encode(sha256(convert_to($1,'UTF8')),'hex')",[token]);
  assert.equal(await val(db,'select kapukai_crm_authorize_worker($1) as r',[token]),true);assert.equal(await val(db,'select kapukai_crm_authorize_worker($1) as r',['wrong-token']),false);
  await db.exec('set role anon');await assert.rejects(db.query('select kapukai_crm_claim()'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});

test('reconciliation backfills every source, refreshes unchanged mappings daily and detects clock-only expiry',async()=>{
 const db=await setup();try{
  const id=await registry(db);await db.query("insert into kapukai_scoped_intents(registry_id) values($1)",[id]);
  await ready(db);let [j]=await claim(db);await ack(db,j,{id:'1005'});
  // Disable only the fixture trigger to represent clock passage with no write-trigger notification.
  await db.exec("alter table kapukai_scoped_intents disable trigger kapukai_crm_intents;update kapukai_scoped_intents set expires_at=now()-interval '1 second';alter table kapukai_scoped_intents enable trigger kapukai_crm_intents");
  await db.exec('select kapukai_crm_reconcile()');[j]=await claim(db);assert.equal(j.payload.consent_status,'expired');await ack(db,j,{id:'1005'});
  await db.exec("update kapukai_crm_outbox set last_synced_at=now()-interval '25 hours';select kapukai_crm_reconcile()");assert.equal((await claim(db)).length,1);
  await db.exec('delete from kapukai_crm_outbox;select kapukai_crm_reconcile()');assert.equal(await val(db,'select count(*)::integer as r from kapukai_crm_outbox'),1);
 }finally{await db.close();}
});

test('legacy expiry is projected without changing consent and global provider cooldown gates other contacts',async()=>{
 const db=await setup();try{
  const id=await registry(db,'legacy@registrants.dev',{interests:['updates']});
  await db.query("insert into kapukai_interest_confirmations(registry_id,expires_at) values($1,now()-interval '1 minute')",[id]);
  const p=await snapshot(db,'legacy@registrants.dev');assert.equal(p.consent_status,'expired');assert.ok(p.source_states.includes('legacy:expired'));
  await db.query("insert into kapukai_interest_confirmations(registry_id,expires_at) values($1,now()+interval '2 days') on conflict(registry_id) do update set expires_at=excluded.expires_at,confirmed_at=null",[id]);
  const resend=await snapshot(db,'legacy@registrants.dev');assert.equal(resend.consent_status,'pending');assert.ok(resend.source_states.includes('legacy:pending'));assert.deepEqual(resend.confirmed_topics,[]);
  await registry(db,'another@registrants.dev');await ready(db);
  await db.query("select kapukai_crm_heartbeat(true,'HUBSPOT_RATE_LIMIT',600)");assert.deepEqual(await claim(db),[]);
  await db.exec('select kapukai_crm_heartbeat(true)');assert.deepEqual(await claim(db),[]);
  await db.exec("update kapukai_crm_config set worker_retry_after_at=now()-interval '1 second'");assert.equal((await claim(db)).length,2);
  assert.equal(await val(db,'select status as r from kapukai_interest_registry where id=$1',[id]),'pending');
 }finally{await db.close();}
});
