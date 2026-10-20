import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {setup as memberSetup,enable,cmd,O,A,B,E} from './member-db-harness.mjs';

const ok=r=>assert.equal(r.result,'ok',JSON.stringify(r));
async function setup(){const db=await memberSetup();await db.exec(await readFile(new URL('../sql/member_invitation_delivery.sql',import.meta.url),'utf8'));return db;}
async function invite(db,email='alice@example.test'){const r=await cmd(db,O,'operator_invite',{email,expires_days:7});ok(r);return {...r,email};}
async function delivery(db,inv,action='prepare',over={},user=O,session=user){
 const payload={email:inv.email,invite_token:inv.invite_token,...(action==='prepare'?{delivery_id:randomUUID()}:{}),...over};
 return (await db.query('select public.kapukai_member_invitation_delivery($1,$2,$3,$4::jsonb) r',[user,session,action,JSON.stringify(payload)])).rows[0].r;
}
async function receipt(db,id,state,provider=state==='accepted'?'synthetic-provider-receipt':null){return(await db.query('select public.kapukai_member_invitation_mail_result($1,$2,$3) r',[id,state,provider])).rows[0].r;}
async function count(db){return(await db.query('select count(*)::int n from kapukai_members.invitation_deliveries')).rows[0].n;}

test('invitation creation and status do not send; only explicit prepare claims a bounded email handoff',async()=>{const db=await setup();try{
 await enable(db);const i=await invite(db);assert.equal(await count(db),0);
 let s=await delivery(db,i,'status');ok(s);assert.equal(s.state,'none');assert.equal(s.delivery_id,null);assert.equal(s.should_send,false);assert.equal(await count(db),0);
 const p=await delivery(db,i,'prepare',{email:'  ALICE@example.test  '});ok(p);assert.equal(p.should_send,true);assert.equal(p.state,'pending');assert.equal(p.invitation_id,i.invitation_id);assert.equal(p.recipient,'alice@example.test');assert.ok(Date.parse(p.expires_at)>Date.now());
 assert.equal(Object.hasOwn(p,'invite_token'),false);
 const stored=(await db.query('select * from kapukai_members.invitation_deliveries')).rows[0];
 assert.equal(JSON.stringify(stored).includes(i.invite_token),false);assert.equal(JSON.stringify(stored).includes(i.email),false);assert.equal(stored.provider_message_id,null);
 const completed=await receipt(db,p.delivery_id,'accepted');ok(completed);assert.equal(completed.state,'accepted');
 s=await delivery(db,i,'status');assert.equal(s.state,'accepted');assert.equal(s.should_send,false);assert.equal(Object.hasOwn(s,'provider_message_id'),false);
 assert.equal((await db.query('select count(*)::int n from kapukai_members.members')).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from kapukai_members.audit where action like 'operator_invitation_email_%'")).rows[0].n,2);
 }finally{await db.close();}});

test('delivery requires a verified live operator session, including role revocation and expired identity',async()=>{const db=await setup();try{
 await enable(db);const i=await invite(db);
 for(const [user,session] of [[A,A],[O,A],[O,randomUUID()],[O,null]])assert.equal((await delivery(db,i,'prepare',{},user,session)).result,'forbidden');
 await db.query("update auth.sessions set created_at=now()-interval '31 minutes' where user_id=$1",[O]);assert.equal((await delivery(db,i)).result,'forbidden');
 await db.query('update auth.sessions set created_at=now() where user_id=$1',[O]);await db.query('update auth.users set email_confirmed_at=null where id=$1',[O]);assert.equal((await delivery(db,i)).result,'forbidden');
 await db.query('update auth.users set email_confirmed_at=now(),banned_until=now()+interval \'1 hour\' where id=$1',[O]);assert.equal((await delivery(db,i)).result,'forbidden');
 await db.query('update auth.users set banned_until=null where id=$1',[O]);await db.query('delete from kapukai_members.operators where user_id=$1',[O]);assert.equal((await delivery(db,i,'status')).result,'forbidden');assert.equal(await count(db),0);
 }finally{await db.close();}});

test('recipient and private-token binding reject altered or inactive invitations and paused pilot',async()=>{const db=await setup();try{
 await enable(db);const i=await invite(db);
 assert.equal((await delivery(db,i,'prepare',{email:'bob@example.test'})).result,'forbidden');assert.equal((await delivery(db,i,'prepare',{invite_token:'b'.repeat(64)})).result,'forbidden');
 for(const change of [{email:'Alice <alice@example.test>'},{email:'alice@example.test,bob@example.test'},{email:'alice(comment)@example.test'},{email:'alice@example.test\nBcc:bob@example.test'},{invite_token:'wrong'},{delivery_id:'wrong'},{extra:'unexpected'},{email:null},{delivery_id:null}])assert.equal((await delivery(db,i,'prepare',change)).result,'invalid');
 await db.query('update kapukai_members.invitations set revoked=true where id=$1',[i.invitation_id]);assert.equal((await delivery(db,i)).result,'forbidden');
 await db.query('update kapukai_members.invitations set revoked=false,claimed_by=$1 where id=$2',[A,i.invitation_id]);assert.equal((await delivery(db,i)).result,'forbidden');
 await db.query("update kapukai_members.invitations set claimed_by=null,expires_at=now()-interval '1 second' where id=$1",[i.invitation_id]);assert.equal((await delivery(db,i)).result,'expired');
 await db.query("update kapukai_members.invitations set expires_at=now()+interval '1 day' where id=$1",[i.invitation_id]);await cmd(db,O,'operator_config',{enabled:false,max_members:25});assert.equal((await delivery(db,i)).result,'paused');assert.equal(await count(db),0);
 }finally{await db.close();}});

test('duplicate and competing prepares claim one send; idempotency ID cannot move to another invitation or actor',async()=>{const db=await setup();try{
 await enable(db);const i=await invite(db),id=randomUUID();
 const same=await Promise.all([delivery(db,i,'prepare',{delivery_id:id}),delivery(db,i,'prepare',{delivery_id:id})]);
 assert.equal(same.filter(r=>r.should_send).length,1);assert.equal(await count(db),1);
 const competing=await Promise.all([delivery(db,i),delivery(db,i)]);assert.ok(competing.every(r=>r.result==='ok'&&!r.should_send&&r.delivery_id===id));assert.equal(await count(db),1);
 const other=await invite(db,'bob@example.test');assert.equal((await delivery(db,other,'prepare',{delivery_id:id})).result,'idempotency_conflict');
 await db.query('insert into kapukai_members.operators(user_id) values($1)',[E]);assert.equal((await delivery(db,i,'prepare',{delivery_id:id},E)).result,'idempotency_conflict');
 assert.equal((await delivery(db,i,'status',{},E)).state,'pending');
 }finally{await db.close();}});

test('only known failure permits a fresh explicit retry; uncertain and accepted handoffs cannot be retried',async()=>{const db=await setup();try{
 await enable(db);const i=await invite(db),p=await delivery(db,i);ok(await receipt(db,p.delivery_id,'failed'));
 const replay=await delivery(db,i,'prepare',{delivery_id:p.delivery_id});assert.equal(replay.should_send,false);assert.equal(replay.state,'failed');
 const retry=await delivery(db,i);assert.equal(retry.should_send,true);assert.notEqual(retry.delivery_id,p.delivery_id);
 ok(await receipt(db,retry.delivery_id,'unknown'));assert.equal((await receipt(db,retry.delivery_id,'failed')).state,'unknown');assert.equal((await receipt(db,retry.delivery_id,'accepted')).state,'unknown');
 let blocked=await delivery(db,i);assert.equal(blocked.should_send,false);assert.equal(blocked.state,'unknown');assert.equal(await count(db),2);
 const j=await invite(db,'bob@example.test'),q=await delivery(db,j);ok(await receipt(db,q.delivery_id,'accepted'));assert.equal((await receipt(db,q.delivery_id,'failed')).state,'accepted');blocked=await delivery(db,j);assert.equal(blocked.should_send,false);assert.equal(blocked.state,'accepted');
 const stale=await invite(db,'stale@example.test'),s=await delivery(db,stale);await db.query("update kapukai_members.invitation_deliveries set created_at=now()-interval '2 days' where id=$1",[s.delivery_id]);blocked=await delivery(db,stale);assert.equal(blocked.should_send,false);assert.equal(blocked.state,'pending');
 }finally{await db.close();}});

test('recipient daily bound includes newly created invitations and terminal receipts are validated',async()=>{const db=await setup();try{
 await enable(db);const i=await invite(db);
 for(let n=0;n<3;n++){const p=await delivery(db,i);assert.equal(p.should_send,true);ok(await receipt(db,p.delivery_id,'failed'));}
 assert.equal((await delivery(db,i)).result,'rate_limited');const second=await invite(db);assert.equal((await delivery(db,second)).result,'rate_limited');
 const invalidId=randomUUID();assert.equal((await receipt(db,invalidId,'accepted')).result,'not_found');
 for(const [state,provider] of [['accepted',null],['accepted',''],['accepted','a\nb'],['failed','unexpected'],['unknown','unexpected'],['delivered',null],[null,null]])assert.equal((await receipt(db,invalidId,state,provider)).result,'invalid');
 assert.equal(await count(db),3);
 }finally{await db.close();}});

test('operator and global daily bounds cannot be bypassed with a new recipient or invitation',async()=>{const db=await setup();try{
 await enable(db);const i=await invite(db);
 // Synthetic terminal failures isolate each cap without an earlier uncertain send.
 const seed=(actor,n)=>db.query("insert into kapukai_members.invitation_deliveries(id,invitation_id,actor_id,recipient_hash,state,completed_at) select gen_random_uuid(),$1,$2,kapukai_members.hash('quota-recipient-'||n),'failed',now() from generate_series(1,$3) n",[i.invitation_id,actor,n]);
 await seed(O,30);assert.equal((await delivery(db,i)).result,'rate_limited');assert.equal(await count(db),30);
 await db.exec('delete from kapukai_members.invitation_deliveries');await seed(E,100);assert.equal((await delivery(db,i)).result,'rate_limited');assert.equal(await count(db),100);
 await db.exec("update kapukai_members.invitation_deliveries set created_at=now()-interval '25 hours'");assert.equal((await delivery(db,i)).should_send,true);
 }finally{await db.close();}});

test('database RPCs and delivery ledger reject browser roles; service receives RPC access only',async()=>{const db=await setup();try{
 await enable(db);const i=await invite(db);
 for(const role of ['anon','authenticated','service_role']){
  await db.exec('set role '+role);
  await assert.rejects(db.query('select * from kapukai_members.invitation_deliveries'),/permission denied/);
  if(role==='service_role')assert.equal((await delivery(db,i,'status')).state,'none');
  else {
   await assert.rejects(delivery(db,i),/permission denied/);
   await assert.rejects(receipt(db,randomUUID(),'failed'),/permission denied/);
  }
  await db.exec('reset role');
 }
 assert.equal((await db.query("select rowsecurity from pg_tables where schemaname='kapukai_members' and tablename='invitation_deliveries'")).rows[0].rowsecurity,true);
 }finally{await db.close();}});
