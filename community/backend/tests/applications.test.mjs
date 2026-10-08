import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';
import {createHandler,validateRequest,CONSENT_VERSION,hashToken,randomToken,APPLICATION_PAGE} from '../supabase/functions/kapukai-community-apply/handler.mjs';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const [fixture,scoped,expansion,applications]=await Promise.all([
 read('./legacy_fixture.sql'),read('../sql/proposed_schema.sql'),read('../supabase/migrations/20261008150526_community_signup_interests.sql'),read('../supabase/migrations/20261008183145_community_applications.sql')]);
async function setup(open=true){const db=new PGlite();await db.exec(fixture);await db.exec(scoped);await db.exec(expansion);await db.exec(applications);if(open)await db.exec('update public.kapukai_application_config set enabled=true');return db;}
function body(overrides={}){return {action:'request',email:'applicant@example.test',display_alias:'River',kind:'assistance',service_interest:'tools',requested_support:'free',request_id:crypto.randomUUID(),consent_version:CONSENT_VERSION,source_path:'/community/assistance',started_at:Date.now()-2000,adult:true,privacy_acknowledged:true,human_review_acknowledged:true,website:'',...overrides};}
const requestSQL='select public.kapukai_application_request($1,$2,$3,$4,$5,$6) as r';
async function request(db,b=body(),token=randomToken()){
 const v=validateRequest(b).value;assert.ok(v,'test body valid');
 const r=(await db.query(requestSQL,[v.email,await hashToken(token),v.request_id,JSON.stringify(v.application),v.consent_version,v.source_path])).rows[0].r;
 return {...r,token};
}
async function operation(db,token,action){return (await db.query('select public.kapukai_application_token($1,$2) as r',[await hashToken(token),action])).rows[0].r;}
const count=async(db,table)=>(await db.query('select count(*)::integer as n from '+table)).rows[0].n;
const http=(b,origin='https://kapukai.org')=>new Request('https://example.test/kapukai-community-apply',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(b)});
function adapter(db){return async(name,args)=>{
 const keys={kapukai_claim_signup_attempt:['p_fingerprint','p_limit'],kapukai_application_request:['p_email','p_token_hash','p_request_id','p_application','p_consent_version','p_source_path'],kapukai_application_token:['p_token_hash','p_action'],kapukai_application_mail_result:['p_application_id','p_state','p_provider_message_id'],kapukai_application_is_open:[]}[name];
 if(!keys)throw new Error('Unexpected RPC');
 const values=keys.map(k=>k==='p_application'?JSON.stringify(args[k]):args[k]);
 return (await db.query('select public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') as r',values)).rows[0].r;
};}

test('application requires email confirmation and enters only a private human review queue',async()=>{
 const db=await setup();try{
  const r=await request(db);assert.equal(r.result,'created');
  const inspect=await operation(db,r.token,'inspect');assert.equal(inspect.state,'awaiting_email');assert.equal(inspect.can_confirm,true);
  assert.equal(Object.hasOwn(inspect,'email'),false);assert.equal(Object.hasOwn(inspect,'display_alias'),false);
  assert.deepEqual(await operation(db,r.token,'confirm'),{result:'confirmed',state:'awaiting_human_review'});
  assert.equal((await operation(db,r.token,'confirm')).result,'already_confirmed');
  assert.equal(await count(db,'kapukai_application_events'),2);
  assert.equal(await count(db,'kapukai_scoped_subscriptions'),0);assert.equal(await count(db,'legacy_jobs'),0);
  assert.deepEqual((await db.query('select status,interests,email_confirmed_at from kapukai_interest_registry')).rows[0],{status:'pending',interests:[],email_confirmed_at:null});
 }finally{await db.close();}
});
test('existing registry and scoped subscriptions remain byte-for-byte unchanged through application and withdrawal',async()=>{
 const db=await setup();try{
  await db.query("insert into kapukai_interest_registry(email,status,interests,email_confirmed_at,consent_version,full_name) values('applicant@example.test','subscribed',array['updates'],'2026-09-01','legacy','Existing')");
  const token=randomToken();await db.query("select kapukai_scoped_request($1,$2,$3,$4,$5,$6,$7,$8)",['applicant@example.test',['remedy_brief'],await hashToken(token),crypto.randomUUID(),'kapukai-scoped-v2-2026-10-08','/community','monthly',[]]);
  await db.query("select kapukai_scoped_token($1,'confirm',null)",[await hashToken(token)]);
  const identity=(await db.query('select * from kapukai_interest_registry')).rows,subscriptions=(await db.query('select * from kapukai_scoped_subscriptions')).rows;
  const r=await request(db);await operation(db,r.token,'confirm');await operation(db,r.token,'withdraw');
  assert.deepEqual((await db.query('select * from kapukai_interest_registry')).rows,identity);
  assert.deepEqual((await db.query('select * from kapukai_scoped_subscriptions')).rows,subscriptions);
  assert.equal(await count(db,'legacy_jobs'),1);
  assert.equal((await operation(db,token,'confirm')).result,'invalid');
  assert.equal((await db.query("select kapukai_scoped_token($1,'confirm',null) as r",[await hashToken(r.token)])).rows[0].r.result,'invalid');
 }finally{await db.close();}
});
test('idempotent requests cannot overwrite application details; withdrawal binds only its own application',async()=>{
 const db=await setup();try{
  const b=body();const r=await request(db,b);
  assert.equal((await request(db,{...b,requested_support:'discounted'})).result,'duplicate');
  assert.equal((await operation(db,r.token,'inspect')).requested_support,'free');
  const v=await request(db,body({kind:'reviewer',requested_support:null,profession:'engineering',availability:'monthly'}));
  await operation(db,v.token,'confirm');await operation(db,r.token,'withdraw');
  assert.equal((await operation(db,r.token,'confirm')).result,'used');
  assert.equal((await operation(db,v.token,'inspect')).state,'awaiting_human_review');
  const n=await count(db,'kapukai_application_events');await operation(db,r.token,'withdraw');assert.equal(await count(db,'kapukai_application_events'),n);
 }finally{await db.close();}
});
test('global suppression is never cleared, even between request and confirmation',async()=>{
 const db=await setup();try{
  for(const state of ['suppressed','unsubscribed']){
   await db.query('insert into kapukai_interest_registry(email,status,consent_version) values($1,$2,$3)',[state+'@example.test',state,'legacy']);
   assert.equal((await request(db,body({email:state+'@example.test'}))).result,'suppressed');
  }
  const r=await request(db);await db.query("update kapukai_interest_registry set status='suppressed' where email='applicant@example.test'");
  assert.equal((await operation(db,r.token,'confirm')).result,'suppressed');
  assert.equal((await operation(db,r.token,'withdraw')).result,'withdrawn');
 }finally{await db.close();}
});
test('expired confirmations cannot enter queue, but withdrawal remains available until management expiry',async()=>{
 const db=await setup();try{
  const r=await request(db);await db.query("update kapukai_applications set expires_at=now()-interval '1 minute'");
  assert.equal((await operation(db,r.token,'confirm')).result,'expired');assert.equal((await operation(db,r.token,'inspect')).can_confirm,false);
  assert.equal((await operation(db,r.token,'withdraw')).result,'withdrawn');
  await db.query("update kapukai_applications set expires_at=now()-interval '2 minutes',manage_expires_at=now()-interval '1 minute'");
  assert.equal((await operation(db,r.token,'inspect')).result,'expired');
 }finally{await db.close();}
});
test('database gate defaults closed and remains authoritative if HTTP gate was open',async()=>{
 const db=await setup(false);try{
  assert.equal((await request(db)).result,'paused');assert.equal(await count(db,'kapukai_interest_registry'),0);
  await db.exec('update kapukai_application_config set enabled=true');const r=await request(db);
  await db.exec('update kapukai_application_config set enabled=false');
  assert.equal((await operation(db,r.token,'confirm')).result,'paused');
  assert.equal((await operation(db,r.token,'inspect')).can_confirm,false);
  assert.equal((await operation(db,r.token,'withdraw')).result,'withdrawn');
 }finally{await db.close();}
});
test('anon and authenticated cannot read or mutate tables, call RPCs, or consume event sequences; service cannot enable gate',async()=>{
 const db=await setup();try{
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   for(const table of ['kapukai_applications','kapukai_application_events','kapukai_application_config'])await assert.rejects(db.query('select * from '+table),/permission denied/);
   await assert.rejects(db.query("select kapukai_application_token($1,'inspect')",['a'.repeat(64)]),/permission denied/);
   await assert.rejects(db.query("select nextval('kapukai_application_events_id_seq')"),/permission denied/);
   await db.exec('reset role');
  }
  await db.exec('set role service_role');const r=await request(db);assert.equal(r.result,'created');assert.equal((await operation(db,r.token,'confirm')).result,'confirmed');
  await assert.rejects(db.query('update kapukai_application_config set enabled=false'),/permission denied/);
  await assert.rejects(db.query("update kapukai_application_events set event_type='withdraw'"),/permission denied/);
 }finally{await db.close();}
});
test('SQL rejects unknown narrative, false attestations, non-string alias and incompatible fields before identity insertion',async()=>{
 const db=await setup();try{
  const good=validateRequest(body()).value.application;
  for(const bad of [{...good,story:'private'},{...good,adult:false},{...good,human_review_acknowledged:'true'},{...good,display_alias:42},{...good,kind:'official_judge'},{...good,profession:'engineering'},{...good,requested_support:null},{...good,display_alias:'<script>'}]){
   await assert.rejects(db.query(requestSQL,['invalid@example.test','a'.repeat(64),crypto.randomUUID(),JSON.stringify(bad),CONSENT_VERSION,'/community/apply']),/INVALID_APPLICATION/);
  }
  assert.equal(await count(db,'kapukai_interest_registry'),0);
 }finally{await db.close();}
});
test('HTTP + actual SQL lifecycle hashes tokens, uses exactly one mocked confirmation, and never enrolls newsletter',async()=>{
 const db=await setup();const mail=[];const handler=createHandler({rpc:adapter(db),enabled:true,rateFingerprint:hashToken,sendConfirmation:async m=>{mail.push(m);return {state:'accepted',providerMessageId:'synthetic-id'};}});
 try{
  const b=body();const first=await handler(http(b));assert.equal(first.status,202);const ack=await first.json();
  assert.equal((await handler(http(b))).status,202);assert.equal(mail.length,1);assert.ok(!JSON.stringify(ack).includes(b.email));
  const token=mail[0].text.match(/#app_token=([A-Za-z0-9_-]{43})/)[1];
  const row=(await db.query('select token_hash,delivery_state from kapukai_applications')).rows[0];assert.equal(row.token_hash,await hashToken(token));assert.equal(row.delivery_state,'accepted');
  assert.equal((await (await handler(http({action:'inspect',token}))).json()).state,'awaiting_email');
  assert.equal((await (await handler(http({action:'confirm',token}))).json()).state,'awaiting_human_review');
  assert.equal((await (await handler(http({action:'withdraw',token}))).json()).state,'withdrawn');
  assert.equal(await count(db,'kapukai_scoped_subscriptions'),0);assert.equal(await count(db,'legacy_jobs'),0);
 }finally{await db.close();}
});
test('HTTP rejects unknown origins, oversized chunked payloads, unknown fields and typed scope escalation',async()=>{
 let calls=0;const handler=createHandler({enabled:true,rpc:async()=>{calls++;},rateFingerprint:hashToken,sendConfirmation:async()=>{}});
 for(const origin of ['https://attacker.test',null])assert.equal((await handler(http(body(),origin))).status,403);
 for(const b of [body({case_file:'secret'}),body({adult:false}),body({display_alias:'http://private'}),body({kind:'reviewer',requested_support:'free'}),{action:'inspect',token:randomToken(),email:'another@example.test'}])assert.equal((await handler(http(b))).status,400);
 assert.equal((await handler(http(body({website:'x'.repeat(5000)})))).status,413);
 assert.equal(calls,0);
});
test('HTTP GET and closed capture never cause a send; paused token inspect and withdraw remain usable',async()=>{
 let calls=0;const handler=createHandler({enabled:false,rateFingerprint:hashToken,sendConfirmation:async()=>{throw new Error('must not send');},rpc:async(_n,args)=>{calls++;return {result:args.p_action==='inspect'?'valid':'withdrawn'};}});
 const get=await handler(new Request('https://example.test/?token='+randomToken()));assert.equal(get.status,303);assert.equal(get.headers.get('location'),APPLICATION_PAGE);assert.equal(calls,0);
 assert.equal((await handler(http(body()))).status,503);assert.equal((await handler(http({action:'confirm',token:randomToken()}))).status,503);
 assert.equal((await handler(http({action:'inspect',token:randomToken()}))).status,200);assert.equal((await handler(http({action:'withdraw',token:randomToken()}))).status,200);assert.equal(calls,2);
});
test('generic responses are identical for duplicate, suppressed, rate-limited, and honeypot requests',async()=>{
 const replies=[];
 for(const mode of ['created','duplicate','suppressed','rate','bot']){
  const handler=createHandler({enabled:true,rateFingerprint:hashToken,sendConfirmation:async()=>({state:'accepted'}),rpc:async name=>name==='kapukai_claim_signup_attempt'?mode!=='rate':name==='kapukai_application_request'?{result:mode,application_id:crypto.randomUUID()}:null});
  const res=await handler(http(body(mode==='bot'?{website:'trap'}:{})));assert.equal(res.status,202);replies.push(await res.text());
 }
 assert.equal(new Set(replies).size,1);
});
test('uncertain provider handoff is recorded, with no retry or delivery promise',async()=>{
 const states=[];let sends=0;const handler=createHandler({enabled:true,rateFingerprint:hashToken,sendConfirmation:async()=>{sends++;throw new Error('uncertain');},rpc:async(name,args)=>{
  if(name==='kapukai_claim_signup_attempt')return true;if(name==='kapukai_application_request')return {result:'created',application_id:crypto.randomUUID()};states.push(args.p_state);
 }});
 const res=await handler(http(body()));assert.equal(res.status,202);assert.equal(sends,1);assert.deepEqual(states,['unknown']);assert.doesNotMatch((await res.json()).message,/delivered|accepted for assistance/i);
});

test('built assistance and witness forms pass through real HTTP handler and SQL, then explicit confirmation UI and withdrawal',async()=>{
 const db=await setup();const mail=[],captured=[],statuses=[];const windows=[];
 const handler=createHandler({rpc:adapter(db),enabled:true,clock:()=>Date.now()+2000,rateFingerprint:hashToken,sendConfirmation:async m=>{mail.push(m);return {state:'accepted',providerMessageId:'synthetic-ui-id'};}});
 const script=await read('../../public/assets/community/applications.js');
 const waitFor=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('UI did not reach expected state');};
 async function openUI(route,fragment=''){
  const html=await read('../../public/'+route+'index.html');
  const dom=new JSDOM(html,{url:'https://kapukai-community.vercel.app/'+route+fragment,runScripts:'outside-only'});windows.push(dom);
  dom.window.AbortSignal=AbortSignal;
  dom.window.fetch=async(url,options)=>{const payload=JSON.parse(options.body);captured.push(payload);const response=await handler(new Request(url,{...options,headers:{...options.headers,Origin:'https://kapukai-community.vercel.app'}}));statuses.push({action:payload.action,status:response.status});return response;};
  dom.window.eval(script);return dom.window;
 }
 try{
  for(const kind of ['assistance','witness']){
   const w=await openUI(kind==='assistance'?'community/assistance/':'community/reviewers/');const f=w.document.querySelector('form');
   f.elements.email.value=kind+'-ui@example.test';f.elements.display_alias.value='Example alias';
   for(const key of ['adult','privacy_acknowledged','human_review_acknowledged'])f.elements.namedItem(key).checked=true;
   if(kind==='witness'){f.elements.kind.value='witness';f.elements.profession.value='education';f.elements.availability.value='monthly';}
   const before=mail.length;f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
   await waitFor(()=>statuses.some(x=>x.action==='request'&&x.status===202)&&mail.length===before+1&&/Only then does it enter human review/.test(w.document.querySelector('#application-status').textContent));
   const sent=captured.filter(x=>x.action==='request').at(-1);assert.equal(sent.kind,kind);
   if(kind==='assistance'){assert.equal(sent.profession,null);assert.equal(sent.availability,null);assert.equal(sent.requested_support,'free');}
   else{assert.equal(sent.profession,'education');assert.equal(sent.availability,'monthly');assert.equal(sent.requested_support,null);}
   const url=mail.at(-1).text.match(/https:\/\/[^\s]+#app_token=[A-Za-z0-9_-]{43}/)[0];assert.ok(url.startsWith(APPLICATION_PAGE));
   const token=url.split('#app_token=')[1];const manage=await openUI('community/apply/','#app_token='+token);
   await waitFor(()=>!manage.document.querySelector('#application-confirm').hidden);
   assert.equal(manage.location.hash,'');assert.equal((await operation(db,token,'inspect')).state,'awaiting_email');
   manage.document.querySelector('#application-confirm').click();
   await waitFor(()=>/awaiting human review/.test(manage.document.querySelector('#application-manage-status').textContent));
   assert.equal((await operation(db,token,'inspect')).state,'awaiting_human_review');
   manage.document.querySelector('#application-withdraw').click();
   await waitFor(()=>/withdrawn/i.test(manage.document.querySelector('#application-manage-status').textContent));
   assert.equal((await operation(db,token,'inspect')).state,'withdrawn');
  }
  assert.equal(mail.length,2);assert.equal(await count(db,'kapukai_scoped_subscriptions'),0);assert.equal(await count(db,'legacy_jobs'),0);
  assert.ok(statuses.every(x=>x.status===200||x.status===202));
 }finally{for(const dom of windows)dom.window.close();await db.close();}
});
