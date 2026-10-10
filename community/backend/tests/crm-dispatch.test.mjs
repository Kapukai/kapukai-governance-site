import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const [fixture,core,hardening]=await Promise.all([read('./crm-fixture.sql'),read('../supabase/migrations/20261010162458_signup_crm_outbox.sql'),read('../supabase/migrations/20261010165450_signup_crm_single_use_dispatch.sql')]);
async function setup(){const db=new PGlite();await db.exec(fixture);await db.exec(core);await db.exec(hardening);return db;}
const scalar=async(db,sql,args=[])=>(await db.query(sql,args)).rows[0]?.r;
const ticket=async(db,token,expired=false)=>db.query("insert into kapukai_crm_worker_tickets(token_hash,created_at,expires_at) values(encode(sha256(convert_to($1,'UTF8')),'hex'),now()-make_interval(secs=>$2),now()+make_interval(secs=>$3))",[token,expired?180:0,expired?-60:120]);

test('single-use worker authorization atomically consumes ticket and never accepts previous static hash',async()=>{
 const db=await setup();try{
  const token='a'.repeat(96);await ticket(db,token);
  await db.query("update kapukai_crm_config set worker_token_hash=encode(sha256(convert_to($1,'UTF8')),'hex')",[token]);
  await db.exec('set role service_role');
  assert.equal(await scalar(db,'select kapukai_crm_authorize_worker($1) as r',[token]),true);
  assert.equal(await scalar(db,'select kapukai_crm_authorize_worker($1) as r',[token]),false);
  assert.equal(await scalar(db,'select count(*)::integer as r from kapukai_crm_worker_tickets'),0);
  await db.exec('reset role');
  assert.equal((await scalar(db,'select kapukai_crm_health() as r')).enabled,false);
 }finally{await db.close();}
});

test('expired and malformed tickets cannot authorize; only hash is stored with bounded lifetime',async()=>{
 const db=await setup();try{
  const token='b'.repeat(96);await ticket(db,token,true);
  assert.equal(await scalar(db,'select kapukai_crm_authorize_worker($1) as r',[token]),false);
  assert.equal(await scalar(db,'select kapukai_crm_authorize_worker($1) as r',['malformed']),false);
  const rows=await scalar(db,'select jsonb_agg(to_jsonb(t)) as r from kapukai_crm_worker_tickets t');assert.equal(JSON.stringify(rows).includes(token),false);
  await assert.rejects(ticket(db,'c'.repeat(96),false).then(()=>db.exec("update kapukai_crm_worker_tickets set expires_at=created_at+interval '121 seconds'")),/check constraint/);
 }finally{await db.close();}
});

test('browser roles cannot read or consume tickets; service cannot mint tickets or call dispatcher',async()=>{
 const db=await setup();try{
  const flags=(await db.query("select r,has_table_privilege(r,'kapukai_crm_worker_tickets','SELECT') as read,has_table_privilege(r,'kapukai_crm_worker_tickets','INSERT') as mint,has_function_privilege(r,'kapukai_crm_authorize_worker(text)','EXECUTE') as consume,has_function_privilege(r,'private.kapukai_crm_send_worker(boolean)','EXECUTE') as dispatch from unnest(array['anon','authenticated','service_role'])r")).rows;
  for(const r of flags.filter(x=>x.r!=='service_role')){assert.equal(r.read,false);assert.equal(r.mint,false);assert.equal(r.consume,false);assert.equal(r.dispatch,false);}
  const service=flags.find(x=>x.r==='service_role');assert.equal(service.read,true);assert.equal(service.mint,false);assert.equal(service.consume,true);assert.equal(service.dispatch,false);
  assert.equal(await scalar(db,'select worker_token_hash as r from kapukai_crm_config'),null);
 }finally{await db.close();}
});
