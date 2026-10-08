import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,create,snap,owner,applicant,OWNER,handler,http} from './lifecycle-harness.mjs';
const offer={resource_id:'practice',minutes:30,expires_days:7};
async function delivered(db,a){assert.equal((await owner(db,a.id,'offer',offer)).result,'updated');assert.equal((await applicant(db,a,'accept_offer')).result,'updated');assert.equal((await owner(db,a.id,'start')).result,'updated');assert.equal((await owner(db,a.id,'deliver',{resource_id:'practice'})).result,'updated');}

test('human review, structured clarification, offer response, delivery, feedback, correction and reconsideration close the loop',async()=>{
 const db=await setup();try{const a=await create(db);
  assert.equal((await owner(db,a.id,'review')).lifecycle.stage,'reviewing');
  assert.equal((await owner(db,a.id,'clarify',{field:'service_interest'})).lifecycle.stage,'clarification');
  assert.equal((await applicant(db,a,'clarify',{value:'training'})).lifecycle.clarification_value,'training');
  await delivered(db,a);assert.equal((await applicant(db,a,'delivery_received')).result,'updated');
  assert.equal((await applicant(db,a,'feedback',{working:'partly',broken:'access',improvement:'accessibility'})).lifecycle.feedback.broken,'access');
  assert.equal((await applicant(db,a,'correction',{category:'access'})).lifecycle.stage,'correction_requested');
  assert.equal((await owner(db,a.id,'resolve_correction',{resource_id:'tester_guide'})).lifecycle.delivery.version,2);
  assert.equal((await applicant(db,a,'close')).lifecycle.stage,'closed');
  assert.equal((await applicant(db,a,'correction',{category:'formatting'})).lifecycle.stage,'correction_requested');
  await owner(db,a.id,'resolve_correction',{resource_id:'practice'});await applicant(db,a,'close');
  assert.equal((await applicant(db,a,'reconsider')).lifecycle.stage,'queue');
  assert.equal((await db.query('select count(*)::int n from kapukai_scoped_subscriptions')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from legacy_jobs')).rows[0].n,0);
  assert.deepEqual((await db.query('select interests,status from kapukai_interest_registry')).rows[0],{interests:[],status:'pending'});
 }finally{await db.close();}
});

test('the real applicant HTTP handler enforces shape, token scope and stale revisions',async()=>{
 const db=await setup();try{const a=await create(db),b=await create(db),run=handler(db);await owner(db,a.id,'offer',offer);
  const base={action:'lifecycle',token:a.token,command:'accept_offer',expected_revision:1,request_id:crypto.randomUUID(),payload:{}};
  assert.equal((await run(http({...base,email:'other@example.test'}))).status,400);
  assert.equal((await run(http({...base,expected_revision:0}))).status,409);
  assert.equal((await run(http({...base,token:b.token}))).status,409);
  const res=await run(http(base));assert.equal(res.status,200);assert.equal((await res.json()).lifecycle.stage,'accepted');
  assert.equal((await (await run(http(base))).json()).result,'duplicate');
  const inspected=await(await run(http({action:'inspect',token:a.token}))).json();assert.equal(inspected.lifecycle.stage,'accepted');assert.equal(Object.hasOwn(inspected,'email'),false);
 }finally{await db.close();}
});

test('explicit owner notices claim exactly once and provider receipt does not require a renewed session',async()=>{
 const db=await setup();try{const a=await create(db);await owner(db,a.id,'review');const id=crypto.randomUUID();
  const claim=async(request=id,rev=1)=> (await db.query('select kapukai_workshop_notice_claim($1,$2,$3,$4,$5,$6,$7,$8) r',[...OWNER,a.id,rev,request,'kapukai-application-update-v1-2026-10-08'])).rows[0].r;
  const n=await claim();assert.equal(n.result,'claimed');assert.equal(n.email,a.body.email);
  const repeat=await claim();assert.equal(repeat.result,'duplicate');assert.equal(Object.hasOwn(repeat,'email'),false);
  assert.equal((await claim(crypto.randomUUID())).result,'duplicate');
  assert.equal((await claim(id,2)).result,'idempotency_conflict');
  await db.exec("delete from auth.sessions");
  assert.equal((await claim()).result,'forbidden');
  const finished=(await db.query('select kapukai_workshop_notice_finish($1,$2,$3,$4,$5,$6,$7) r',[...OWNER,n.notice_id,'unknown',null])).rows[0].r;
  assert.deepEqual(finished,{result:'recorded',state:'unknown'});
  assert.equal((await snap(db,a.id)).can_send_notice,false);
 }finally{await db.close();}
});

test('public and ordinary authenticated roles cannot read tables, invoke workflows, or invoke the private authority helper',async()=>{
 const db=await setup();try{for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  for(const sql of ['select * from kapukai_workshop_workflows',"select kapukai_workshop_snapshot(gen_random_uuid())","select kapukai_workshop_maintenance()","select kapukai_workshop_owner_queue(null,null,null,null)","select kapukai_workshop_private.authorized(null,null,null,null)"]){await assert.rejects(db.query(sql),/permission denied/);}
  await db.exec('reset role');
 }
  const a=await create(db);await db.exec('set role service_role');
  assert.equal((await db.query('select kapukai_workshop_owner_queue($1,$2,$3,$4) r',OWNER)).rows[0].r.result,'ok');
  assert.equal((await owner(db,a.id,'offer',offer)).result,'updated');
  await assert.rejects(db.exec('update kapukai_workshop_config set enabled=true'),/permission denied/);
 }finally{await db.close();}
});

test('bounded capacity prevents a second reservation and withdrawal releases the first',async()=>{
 const db=await setup();try{await db.exec('update kapukai_workshop_config set max_open=1');const a=await create(db),b=await create(db);
  assert.equal((await owner(db,a.id,'offer',offer)).result,'updated');assert.equal((await owner(db,b.id,'offer',offer)).result,'capacity_full');
  const res=await handler(db)(http({action:'withdraw',token:a.token}));assert.equal(res.status,200);
  assert.equal((await snap(db,a.id)).stage,'withdrawn');assert.equal((await owner(db,b.id,'offer',offer)).result,'updated');
  assert.equal((await applicant(db,a,'accept_offer')).result,'transition_denied');
 }finally{await db.close();}
});

test('no arbitrary sensitive payload, private links, payment or qualification is accepted',async()=>{
 const db=await setup();try{const a=await create(db);
  for(const payload of [{...offer,case_story:'sensitive'}, {...offer,price_cents:10000},{...offer,resource_id:'https://private.example/doc'},{...offer,minutes:10000}])assert.equal((await owner(db,a.id,'offer',payload)).result,'invalid');
  assert.equal((await owner(db,a.id,'appoint_expert',{})).result,'transition_denied');assert.equal((await snap(db,a.id)).revision,0);
 }finally{await db.close();}
});
