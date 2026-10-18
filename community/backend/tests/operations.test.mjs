import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../operations/operational-remedy.sql',import.meta.url),'utf8');
async function setup(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.kapukai_crm_outbox(email text,state text,last_error_code text,synced_generation bigint,generation bigint,last_synced_at timestamptz,next_attempt_at timestamptz);
 create table public.health(value jsonb);insert into public.health values ('{"enabled":true,"credential_ready":true}');
 create function public.kapukai_crm_health() returns jsonb language sql as $$select value from public.health$$;`);await db.exec(sql);return db;}
test('monitor deduplicates, preserves history and resolves only observed recovery',async()=>{const db=await setup();try{
 await db.query('select public.kapukai_operations_monitor()');await db.query('select public.kapukai_operations_monitor()');
 assert.equal((await db.query('select * from kapukai_operations.incidents')).rows.length,1);
 assert.equal((await db.query('select * from kapukai_operations.incident_events')).rows.length,1);
 await db.query(`update public.health set value=value||jsonb_build_object('worker_last_seen',now())`);
 await db.query('select public.kapukai_operations_monitor()');
 assert.equal((await db.query('select state from kapukai_operations.incidents')).rows[0].state,'resolved');
 assert.equal((await db.query('select * from kapukai_operations.incident_events')).rows.length,2);
 }finally{await db.close();}});
test('completion requires evidence, revisions and owner; replay cannot alter payload',async()=>{const db=await setup();try{
 const c=(await db.query(`insert into kapukai_operations.commitments(contact_id,purpose,stage,owner_id,next_action,due_at) values('123','tester','in_progress','90662861','Finish test',now()) returning id`)).rows[0];
 const request='12345678-1234-4123-8123-123456789012';
 const call=(rev,evidence,action='Record feedback')=>db.query('select public.kapukai_operations_transition($1,$2,$3,$4,$5,$6,$7,$8)',[c.id,rev,request,'90662861','completed',action,'2026-10-20T00:00:00Z',evidence]);
 await assert.rejects(call(0,null),/COMPLETION_EVIDENCE_REQUIRED/);
 await assert.rejects(call(1,'protected:feedback-1'),/STALE_REVISION/);
 await call(0,'protected:feedback-1');
 assert.equal((await call(0,'protected:feedback-1')).rows[0].kapukai_operations_transition.result,'duplicate');
 await assert.rejects(call(0,'protected:feedback-1','Different action'),/IDEMPOTENCY_CONFLICT/);
 assert.equal((await db.query('select * from kapukai_operations.events')).rows.length,1);
 }finally{await db.close();}});
test('anonymous and ordinary authenticated roles cannot read or mutate operations',async()=>{const db=await setup();try{
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from kapukai_operations.commitments'),/permission denied/);await assert.rejects(db.query('select public.kapukai_operations_monitor()'),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}});
test('creating a commitment requires a verified existing CRM contact and is idempotent',async()=>{const db=await setup();try{
 await db.exec('alter table public.kapukai_crm_outbox add column hubspot_contact_id text');
 await db.exec(await readFile(new URL('../operations/create-commitment.sql',import.meta.url),'utf8'));
 const args=['12345678-1234-4123-8123-123456789013','123','engineer','90662861','Arrange conversation','2026-10-23T00:00:00Z','linkedin','demo_01'];
 const call=()=>db.query('select public.kapukai_operations_create($1,$2,$3,$4,$5,$6,$7,$8)',args);
 await assert.rejects(call(),/VERIFIED_CONTACT_REQUIRED/);
 await db.exec("insert into public.kapukai_crm_outbox(email,state,hubspot_contact_id) values('test@example.invalid','synced','123')");
 assert.equal((await call()).rows[0].kapukai_operations_create.result,'created');
 assert.equal((await call()).rows[0].kapukai_operations_create.result,'duplicate');
 args[2]='tester';await assert.rejects(call(),/IDEMPOTENCY_CONFLICT/);
 }finally{await db.close();}});
test('failed sync stays open while retrying and resolves after current-generation readback',async()=>{const db=await setup();try{
 await db.exec("update public.health set value=value||jsonb_build_object('worker_last_seen',now());insert into public.kapukai_crm_outbox(email,state,generation,next_attempt_at) values('test@example.invalid','blocked',2,now())");
 await db.query('select public.kapukai_operations_monitor()');
 await db.exec("update public.kapukai_crm_outbox set state='pending'");await db.query('select public.kapukai_operations_monitor()');
 assert.equal((await db.query("select state from kapukai_operations.incidents where kind='contact_sync'")).rows[0].state,'open');
 await db.exec("update public.kapukai_crm_outbox set state='synced',synced_generation=2,last_synced_at=now()");await db.query('select public.kapukai_operations_monitor()');
 assert.equal((await db.query("select state from kapukai_operations.incidents where kind='contact_sync'")).rows[0].state,'resolved');
 }finally{await db.close();}});
