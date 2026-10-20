import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {setup,enable,cmd,request,token,operator,receipt,hash,CONSENT,O,A,B,E} from './member-access-db-harness.mjs';
const ok=r=>assert.equal(r.result,'ok',JSON.stringify(r));
const created=r=>assert.equal(r.result,'created',JSON.stringify(r));
async function confirmed(db,over={}){const r=await request(db,over);created(r);ok(await token(db,r.token,'confirm'));return r;}
async function count(db,table){return(await db.query('select count(*)::int n from '+table)).rows[0].n;}

test('public access requires no account and changes no Auth/member/subscription state before human approval',async()=>{const db=await setup();try{
 ok(await enable(db));const auth=await count(db,'auth.users');const r=await request(db);created(r);
 let state=await token(db,r.token);assert.equal(state.state,'awaiting_email');assert.equal(state.can_confirm,true);assert.deepEqual((await operator(db,'queue')).requests,[]);
 assert.equal(await count(db,'auth.users'),auth);assert.equal(await count(db,'kapukai_members.members'),0);assert.equal(await count(db,'kapukai_members.invitations'),0);
 assert.equal((await operator(db,'approve',{request_id:r.access_request_id,expected_revision:0,expires_days:7})).result,'conflict');
 state=await token(db,r.token,'confirm');assert.equal(state.state,'awaiting_review');assert.equal(state.revision,1);assert.equal((await token(db,r.token,'confirm')).revision,1);
 const q=await operator(db,'queue');assert.equal(q.requests.length,1);assert.equal(q.requests[0].email,'new-person@example.test');assert.equal(q.requests[0].display_name,'New person');
 assert.equal(await count(db,'auth.users'),auth);assert.equal(await count(db,'kapukai_members.members'),0);assert.equal(await count(db,'kapukai_members.invitations'),0);
 for(const forbidden of ['email','display_name','id','request_id','token_hash','invitation_id','provider_message_id'])assert.equal(Object.hasOwn(state,forbidden),false,forbidden);
 const approved=await operator(db,'approve',{request_id:r.access_request_id,expected_revision:1,expires_days:7});ok(approved);assert.match(approved.invite_token,/^[0-9a-f]{64}$/);assert.equal((await token(db,r.token)).state,'approved');assert.equal(await count(db,'auth.users'),auth);assert.equal(await count(db,'kapukai_members.members'),0);
 }finally{await db.close();}});

test('idempotency binds normalized email and original contents; replay cannot rotate token or resend receipt',async()=>{const db=await setup();try{await enable(db);
 const r=await request(db);created(r);ok(await receipt(db,r.access_request_id,'unknown',null));
 const repeat=await request(db,{...r.p,token_hash:hash('different-secret')});assert.equal(repeat.result,'duplicate');
 for(const change of [{email:'other@example.test'},{display_name:'Changed name'}])assert.equal((await request(db,{...r.p,...change})).result,'idempotency_conflict');
 assert.equal((await token(db,r.token)).state,'awaiting_email');assert.equal((await token(db,'different-secret')).result,'invalid');assert.equal(await count(db,'kapukai_members.access_requests'),1);
 ok(await receipt(db,r.access_request_id,'accepted','later-replayed-provider-id'));const stored=(await db.query('select token_hash,delivery_state,provider_message_id from kapukai_members.access_requests')).rows[0];assert.equal(stored.token_hash,r.p.token_hash);assert.equal(stored.delivery_state,'unknown');assert.equal(stored.provider_message_id,null);
 }finally{await db.close();}});

test('all access tables/helpers and RPCs deny browser database roles; service gets only RPCs',async()=>{const db=await setup();try{
 const calls=["select kapukai_member_access_is_open()","select kapukai_member_access_request(null,null,null,null,null,null,null,null)","select kapukai_member_access_token(null,'inspect')","select kapukai_member_access_mail_result(null,'unknown',null)","select kapukai_member_access_operator(null,null,'queue','{}')"];
 for(const role of ['anon','authenticated','service_role']){await db.exec('set role '+role);
 for(const sql of ['select * from kapukai_members.access_requests','select kapukai_members.access_projection(null)'])await assert.rejects(db.query(sql),/permission denied/);
 if(role!=='service_role')for(const sql of calls)await assert.rejects(db.query(sql),/permission denied/);else assert.equal((await operator(db,'queue')).result,'ok');await db.exec('reset role');}
 assert.equal((await db.query("select rowsecurity from pg_tables where schemaname='kapukai_members' and tablename='access_requests'")).rows[0].rowsecurity,true);
 }finally{await db.close();}});

test('operator authorization is live, not inferred from request ownership, missing session or account metadata',async()=>{const db=await setup();try{await enable(db);const r=await confirmed(db,{email:'alice@example.test'});
 assert.equal((await operator(db,'queue',{},A)).result,'forbidden');assert.equal((await operator(db,'queue',{},O,A)).result,'forbidden');
 await db.query("update auth.sessions set created_at=now()-interval '31 minutes' where user_id=$1",[O]);assert.equal((await operator(db,'queue')).result,'forbidden');
 await db.query('update auth.sessions set created_at=now() where user_id=$1',[O]);await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[O]);assert.equal((await operator(db,'approve',{request_id:r.access_request_id,expected_revision:1,expires_days:7})).result,'forbidden');
 await db.query('update auth.users set banned_until=null where id=$1',[O]);await db.query('delete from kapukai_members.operators where user_id=$1',[O]);assert.equal((await operator(db,'queue')).result,'forbidden');
 assert.equal(await count(db,'kapukai_members.invitations'),0);
 }finally{await db.close();}});

test('pause and expiration prevent new confirmation and approval while withdrawal remains available',async()=>{const db=await setup();try{
 assert.equal((await request(db)).result,'paused');await enable(db);const pending=await request(db),ready=await confirmed(db,{email:'ready@example.test'});await cmd(db,O,'operator_config',{enabled:false,max_members:25});
 assert.equal((await token(db,pending.token,'confirm')).result,'paused');assert.equal((await operator(db,'approve',{request_id:ready.access_request_id,expected_revision:1,expires_days:7})).result,'paused');ok(await token(db,ready.token,'withdraw'));
 await enable(db);await db.query("update kapukai_members.access_requests set expires_at=now()-interval '1 second' where id=$1",[pending.access_request_id]);assert.equal((await token(db,pending.token,'confirm')).result,'expired');assert.equal((await token(db,pending.token)).can_confirm,false);
 const old=await confirmed(db,{email:'old@example.test'});await db.query("update kapukai_members.access_requests set expires_at=now()-interval '2 days',manage_expires_at=now()-interval '1 day' where id=$1",[old.access_request_id]);assert.equal((await operator(db,'approve',{request_id:old.access_request_id,expected_revision:1,expires_days:7})).result,'expired');assert.equal((await token(db,old.token)).result,'expired');assert.equal((await operator(db,'queue')).requests.length,0);
 }finally{await db.close();}});

test('approval and withdrawal serialize without orphan invitations; stale/replayed approval creates no duplicate',async()=>{const db=await setup();try{await enable(db);const r=await confirmed(db,{email:'alice@example.test'});
 const payload={request_id:r.access_request_id,expected_revision:1,expires_days:7};const outcomes=await Promise.all([operator(db,'approve',payload),operator(db,'approve',payload)]);assert.equal(outcomes.filter(x=>x.result==='ok').length,1);assert.equal(outcomes.filter(x=>x.result==='conflict').length,1);assert.equal(await count(db,'kapukai_members.invitations'),1);
 ok(await token(db,r.token,'withdraw'));assert.equal((await cmd(db,A,'join',{invite_token:outcomes.find(x=>x.result==='ok').invite_token,display_name:'Alice',adult:true,privacy_acknowledged:true})).result,'forbidden');const invite=(await db.query('select revoked,claimed_by from kapukai_members.invitations')).rows[0];assert.equal(invite.revoked,true);assert.equal(invite.claimed_by,null);assert.equal((await operator(db,'approve',payload)).result,'conflict');
 const reverse=await confirmed(db,{email:'reverse@example.test'});await token(db,reverse.token,'withdraw');assert.equal((await operator(db,'approve',{request_id:reverse.access_request_id,expected_revision:1,expires_days:7})).result,'conflict');assert.equal(await count(db,'kapukai_members.invitations'),1);
 }finally{await db.close();}});

test('approved invitation is bound to stored verified email; claimed membership cannot be closed by access token',async()=>{const db=await setup();try{await enable(db);const r=await confirmed(db,{email:'alice@example.test'});const p={request_id:r.access_request_id,expected_revision:1,expires_days:7};
 assert.equal((await operator(db,'approve',{...p,email:'bob@example.test'})).result,'invalid');const i=await operator(db,'approve',p);ok(i);
 const joinPayload={invite_token:i.invite_token,display_name:'Alice',adult:true,privacy_acknowledged:true};assert.equal((await cmd(db,B,'join',joinPayload)).result,'forbidden');ok(await cmd(db,A,'join',joinPayload));
 const state=await token(db,r.token,'withdraw');assert.equal(state.claimed,true);assert.equal(state.can_withdraw,false);assert.equal(state.state,'approved');assert.equal((await cmd(db,A,'state')).profile.status,'active');assert.equal((await db.query('select revoked from kapukai_members.invitations where id=$1',[i.invitation_id])).rows[0].revoked,false);
 }finally{await db.close();}});

test('explicit decline, required consent, numeric shapes and separate token domains cannot bypass review',async()=>{const db=await setup();try{await enable(db);
 for(const over of [{adult:null},{privacy_acknowledged:false},{human_review_acknowledged:null},{consent_version:'old'},{email:'UPPER@example.test'},{display_name:'<script>'},{email:'one<target@example.test>'},{email:'target@example.test,second@example.test'},{email:'target(comment)@example.test'},{email:'target@example.test;'}])assert.equal((await request(db,over)).result,'invalid');
 const r=await confirmed(db);for(const p of [{expected_revision:null},{expected_revision:'1'},{expected_revision:1.5},{expires_days:0},{expires_days:null}])assert.equal((await operator(db,'approve',{request_id:r.access_request_id,expected_revision:1,expires_days:7,...p})).result,'invalid');
 ok(await operator(db,'decline',{request_id:r.access_request_id,expected_revision:1}));assert.equal((await token(db,r.token)).state,'declined');assert.equal((await token(db,r.token,'confirm')).result,'conflict');assert.equal((await operator(db,'queue')).requests.length,0);
 assert.equal((await cmd(db,A,'join',{invite_token:r.token,display_name:'Alias',adult:true,privacy_acknowledged:true})).result,'invalid');assert.equal(await count(db,'kapukai_members.invitations'),0);
 }finally{await db.close();}});

test('database independently enforces daily address/global bounds and queue exposes only confirmed bounded rows',async()=>{const db=await setup();try{await enable(db);
 for(let n=0;n<3;n++)created(await request(db));assert.equal((await request(db)).result,'rate_limited');
 await db.exec("insert into kapukai_members.access_requests(request_id,email,email_hash,display_name,payload_hash,token_hash,consent_version,adult,privacy_acknowledged,human_review_acknowledged) select gen_random_uuid(),'test-'||n||'@example.test',kapukai_members.hash('test-'||n||'@example.test'),'Synthetic',kapukai_members.hash('payload-'||n),kapukai_members.hash('token-'||n),'kapukai-member-access-v1-2026-10-20',true,true,true from generate_series(1,97) n");
 assert.equal((await request(db,{email:'one-more@example.test'})).result,'rate_limited');assert.equal(await count(db,'kapukai_members.access_requests'),100);assert.equal((await operator(db,'queue')).requests.length,0);
 }finally{await db.close();}});


test('production acceptance script runs locally and rolls back every synthetic row and config change',async()=>{const db=await setup();try{
 await db.exec('alter table auth.users add column created_at timestamptz,add column updated_at timestamptz;alter table auth.sessions add column updated_at timestamptz');
 const before={users:await count(db,'auth.users'),sessions:await count(db,'auth.sessions'),operators:await count(db,'kapukai_members.operators')};
 await db.exec(await readFile(new URL('./member-access-live-acceptance.sql',import.meta.url),'utf8'));
 assert.equal(await count(db,'auth.users'),before.users);assert.equal(await count(db,'auth.sessions'),before.sessions);assert.equal(await count(db,'kapukai_members.operators'),before.operators);
 for(const table of ['kapukai_members.access_requests','kapukai_members.invitations','kapukai_members.members','kapukai_members.audit'])assert.equal(await count(db,table),0,table);
 assert.equal((await db.query('select enabled from kapukai_members.config')).rows[0].enabled,false);
 }finally{await db.close();}});
