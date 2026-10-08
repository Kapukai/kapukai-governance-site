import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {createHandler,CONSENT_VERSION,hashToken,randomToken,SIGNUP_PAGE} from "../supabase/functions/kapukai-scoped-signup/handler.mjs";
import {validateRequest,confirmationMessage} from "../supabase/functions/kapukai-scoped-signup/handler.mjs";
const fixture=await readFile(new URL("./legacy_fixture.sql",import.meta.url),"utf8");
const sql=await readFile(new URL("../sql/proposed_schema.sql",import.meta.url),"utf8");
const expansion=await readFile(new URL("../supabase/migrations/20261008150526_community_signup_interests.sql",import.meta.url),"utf8");
async function setup() {const db=new PGlite();await db.exec(fixture);await db.exec(sql);await db.exec(expansion);return db;}
async function request(db,email,topics,token=randomToken(),id=crypto.randomUUID(),tools=[]) {
 const res=await db.query("select public.kapukai_scoped_request($1,$2,$3,$4,$5,$6,$7,$8) as r",
  [email,topics,await hashToken(token),id,CONSENT_VERSION,"/testers","monthly",tools]);
 return {...res.rows[0].r,token};
}
async function operation(db,token,action,topics=null) {
 return (await db.query("select public.kapukai_scoped_token($1,$2,$3) as r",[await hashToken(token),action,topics])).rows[0].r;
}
const count=async(db,table)=>(await db.query("select count(*)::integer as n from "+table)).rows[0].n;

test("new tester uses same identity, confirms only requested topic, never triggers old onboarding",async()=>{
 const db=await setup();
 try {
  const r=await request(db,"tester@example.test",["tester_invites"],undefined,undefined,["affidavit"]);
  assert.equal(r.result,"created");
  assert.equal(await count(db,"kapukai_scoped_subscriptions"),0);
  assert.equal((await operation(db,r.token,"inspect")).can_confirm,true);
  assert.equal((await operation(db,r.token,"confirm")).result,"confirmed");
  const registry=(await db.query("select status,interests,email_confirmed_at from kapukai_interest_registry")).rows[0];
  assert.deepEqual(registry,{status:"pending",interests:[],email_confirmed_at:null});
  assert.equal(await count(db,"legacy_jobs"),0);
  const sub=(await db.query("select topic,state,cadence,tool_interests from kapukai_scoped_subscriptions")).rows[0];
  assert.deepEqual(sub,{topic:"tester_invites",state:"confirmed",cadence:"event_based",tool_interests:["affidavit"]});
  assert.equal((await operation(db,r.token,"confirm")).result,"already_confirmed");
  assert.equal(await count(db,"kapukai_scoped_subscriptions"),1);
  assert.equal(await count(db,"kapukai_scoped_consent_events"),2);
 } finally {await db.close();}
});
test("request against confirmed legacy identity cannot alter identity or grant topics before token proof",async()=>{
 const db=await setup();
 try {
  await db.query("insert into kapukai_interest_registry(email,interests,status,email_confirmed_at,consent_version,full_name) values('legacy@example.test',array['updates'],'subscribed','2026-08-26','legacy','Existing')");
  const before=(await db.query("select * from kapukai_interest_registry")).rows[0];
  const r=await request(db,"legacy@example.test",["remedy_brief"]);
  assert.equal(await count(db,"kapukai_scoped_subscriptions"),0);
  await operation(db,r.token,"confirm");
  await operation(db,r.token,"revoke",["remedy_brief"]);
  assert.deepEqual((await db.query("select * from kapukai_interest_registry")).rows[0],before);
  assert.equal(await count(db,"legacy_jobs"),1);
 } finally {await db.close();}
});
test("token scope prevents permission escalation, and revocation cancels older pending requests",async()=>{
 const db=await setup();
 try {
  const first=await request(db,"revoke@example.test",["tester_invites"]);
  const pending=await request(db,"revoke@example.test",["tester_invites","remedy_brief"]);
  await operation(db,first.token,"confirm");
  assert.equal((await operation(db,first.token,"revoke",["remedy_brief"])).result,"invalid");
  assert.equal((await operation(db,first.token,"revoke",["tester_invites"])).result,"unsubscribed");
  assert.equal((await operation(db,pending.token,"confirm")).result,"used");
  assert.equal((await operation(db,first.token,"confirm")).result,"used");
  assert.equal((await operation(db,first.token,"inspect")).active_topics.length,0);
  const n=await count(db,"kapukai_scoped_consent_events");
  await operation(db,first.token,"revoke",["tester_invites"]);
  assert.equal(await count(db,"kapukai_scoped_consent_events"),n);
 } finally {await db.close();}
});
test("global unsubscribe/suppression blocks requests and later confirmation without being reversed",async()=>{
 const db=await setup();
 try {
  for(const state of ["unsubscribed","suppressed"]) {
   const email=state+"@example.test";
   await db.query("insert into kapukai_interest_registry(email,status,interests,consent_version) values($1,$2,array['updates'],'legacy')",[email,state]);
   assert.equal((await request(db,email,["remedy_brief"])).result,"suppressed");
  }
  const r=await request(db,"later@example.test",["remedy_brief"]);
  await db.query("update kapukai_interest_registry set status='suppressed' where email='later@example.test'");
  assert.equal((await operation(db,r.token,"confirm")).result,"suppressed");
  assert.equal(await count(db,"kapukai_scoped_subscriptions"),0);
 } finally {await db.close();}
});
test("expired confirmation cannot activate; valid longer management token can revoke; duplicate request remains single",async()=>{
 const db=await setup();
 try {
  const id=crypto.randomUUID();const r=await request(db,"expiry@example.test",["remedy_brief"],undefined,id);
  assert.equal((await request(db,"expiry@example.test",["remedy_brief"],undefined,id)).result,"duplicate");
  await db.query("update kapukai_scoped_intents set expires_at=now()-interval '1 minute'");
  assert.equal((await operation(db,r.token,"confirm")).result,"expired");
  const second=await request(db,"manage@example.test",["remedy_brief"]);
  await operation(db,second.token,"confirm");
  await db.query("update kapukai_scoped_intents set expires_at=now()-interval '1 minute' where id=$1",[second.intent_id]);
  assert.equal((await operation(db,second.token,"revoke",["remedy_brief"])).result,"unsubscribed");
  await db.query("update kapukai_scoped_intents set manage_expires_at=now()-interval '1 minute'");
  assert.equal((await operation(db,second.token,"inspect")).result,"expired");
 } finally {await db.close();}
});
test("new tables inaccessible to public roles; scoped RPCs only service role",async()=>{
 const db=await setup();
 try {
  await db.exec("set role anon");
  await assert.rejects(db.query("select * from public.kapukai_scoped_subscriptions"),/permission denied/);
  await assert.rejects(db.query("select public.kapukai_scoped_token($1,'inspect',null)",["a".repeat(64)]),/permission denied/);
  await db.exec("reset role; set role service_role");
  const r=await request(db,"role@example.test",["tester_invites"]);
  assert.equal(r.result,"created");
  assert.equal((await operation(db,r.token,"confirm")).result,"confirmed");
 } finally {await db.close();}
});
test("SQL rejects unknown/null topics and does not create registry entries",async()=>{
 const db=await setup();
 try {
  for(const topics of [["all"],[null],[],["tester_invites","remedy_brief","tester_invites"]])
   await assert.rejects(request(db,"invalid@example.test",topics),/INVALID_REQUEST/);
  assert.equal(await count(db,"kapukai_interest_registry"),0);
 } finally {await db.close();}
});
function validBody(overrides={}) {
 return {action:"request",email:"person@example.test",topics:["tester_invites"],newsletter_cadence:"monthly",
  tool_interests:["affidavit"],request_id:crypto.randomUUID(),consent_version:CONSENT_VERSION,
  source_path:"/testers",started_at:Date.now()-2000,privacy_acknowledged:true,adult:true,website:"",...overrides};
}
function http(body,origin="https://kapukai-join.christinehillier.chatgpt.site") {
 return new Request("https://example.test/kapukai-scoped-signup",{method:"POST",headers:{"Content-Type":"application/json",...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
}
test("HTTP request to confirm to revoke integration uses mocked SMTP only, with generic response and hashed stored token",async()=>{
 const db=await setup();const mails=[];
 const rpc=async(name,args)=>{
  const keys={kapukai_claim_signup_attempt:["p_fingerprint","p_limit"],
   kapukai_scoped_request:["p_email","p_topics","p_token_hash","p_request_id","p_consent_version","p_source_path","p_newsletter_cadence","p_tool_interests"],
   kapukai_scoped_mail_result:["p_intent_id","p_state","p_provider_message_id"],
   kapukai_scoped_token:["p_token_hash","p_action","p_topics"]}[name];
  const out=await db.query("select public."+name+"("+keys.map((_,i)=>"$"+(i+1)).join(",")+") as r",keys.map(k=>args[k]));
  return out.rows[0].r;
 };
 const handler=createHandler({rpc,rateFingerprint:hashToken,enabled:true,
  sendConfirmation:async(message)=>{mails.push(message);return {state:"accepted",providerMessageId:"synthetic-provider-id"};}});
 try {
  const body=validBody();const r=await handler(http(body));
  assert.equal(r.status,202);assert.equal(mails.length,1);
  assert.ok(!JSON.stringify(await r.json()).includes(body.email));
  assert.equal((await handler(http(body))).status,202);assert.equal(mails.length,1);
  const token=mails[0].text.match(/#token=([A-Za-z0-9_-]{43})/)[1];
  const row=(await db.query("select token_hash,delivery_state from kapukai_scoped_intents")).rows[0];
  assert.equal(row.token_hash,await hashToken(token));assert.equal(row.delivery_state,"accepted");
  const inspect=await (await handler(http({action:"inspect",token}))).json();
  assert.equal(inspect.can_confirm,true);assert.ok(!Object.hasOwn(inspect,"email"));
  assert.equal((await (await handler(http({action:"confirm",token}))).json()).result,"confirmed");
  assert.equal((await (await handler(http({action:"revoke",token,topics:["tester_invites"]}))).json()).result,"unsubscribed");
  assert.equal(mails.length,1);assert.equal(await count(db,"legacy_jobs"),0);
 } finally {await db.close();}
});
test("GET redirects to static fragment without activating or calling RPC",async()=>{
 let calls=0;const handler=createHandler({rpc:async()=>{calls++;},rateFingerprint:hashToken,sendConfirmation:async()=>{},enabled:true});
 const token=randomToken();const res=await handler(new Request("https://example.test/?token="+token));
 assert.equal(res.status,303);assert.equal(res.headers.get("location"),SIGNUP_PAGE+"#token="+token);assert.equal(calls,0);
});
test("untrusted origins, story fields, invalid tool choices and oversized bodies cannot create requests",async()=>{
 let calls=0;const handler=createHandler({rpc:async()=>{calls++;},rateFingerprint:hashToken,sendConfirmation:async()=>{},enabled:true});
 for(const origin of ["https://evil.example",null])assert.equal((await handler(http(validBody(),origin))).status,403);
 for(const body of [validBody({story:"sensitive raw story"}),validBody({tool_interests:["unknown"]}),validBody({privacy_acknowledged:false})])
  assert.equal((await handler(http(body))).status,400);
 assert.equal((await handler(http(validBody({website:"x".repeat(5000)})))).status,413);
 assert.equal(calls,0);
});
test("closed launch gate blocks writes; SMTP uncertainty is recorded and never retried",async()=>{
 const attempts=[];let sends=0;
 const rpc=async(name,args)=>{attempts.push({name,args});if(name==="kapukai_claim_signup_attempt")return true;
  if(name==="kapukai_scoped_request")return {result:"created",intent_id:crypto.randomUUID()};return null;};
 const disabled=createHandler({rpc,rateFingerprint:hashToken,sendConfirmation:async()=>{},enabled:false});
 assert.equal((await disabled(http(validBody()))).status,503);assert.equal(attempts.length,0);
 const enabled=createHandler({rpc,rateFingerprint:hashToken,enabled:true,sendConfirmation:async()=>{sends++;throw new Error("network uncertainty");}});
 assert.equal((await enabled(http(validBody()))).status,202);assert.equal(sends,1);
 assert.equal(attempts.at(-1).args.p_state,"unknown");
});


test("older confirmation cannot overwrite newer cadence, while old scoped opt-out revokes newer grant with audit version",async()=>{
 const db=await setup();
 try {
  const a=await request(db,"ordering@example.test",["remedy_brief"]);
  const b=await request(db,"ordering@example.test",["remedy_brief"]);
  await db.query("update kapukai_scoped_intents set newsletter_cadence='every_other_week' where id=$1",[b.intent_id]);
  await operation(db,b.token,"confirm");
  assert.equal((await operation(db,a.token,"confirm")).result,"superseded");
  assert.equal((await db.query("select cadence from kapukai_scoped_subscriptions")).rows[0].cadence,"every_other_week");
  assert.equal((await operation(db,a.token,"revoke",["remedy_brief"])).result,"unsubscribed");
  const event=(await db.query("select intent_id,affected_grants from kapukai_scoped_consent_events where event_type='revoke'")).rows[0];
  assert.equal(event.intent_id,a.intent_id);
  assert.deepEqual(event.affected_grants,[{topic:"remedy_brief",last_intent_id:b.intent_id}]);
 } finally {await db.close();}
});
test("capture gate defaults closed and cannot be read or changed by anonymous roles",async()=>{
 const db=await setup();
 try {
  assert.equal((await db.query("select public.kapukai_scoped_is_open() as open")).rows[0].open,false);
  await db.exec("set role anon");
  await assert.rejects(db.query("select public.kapukai_scoped_is_open()"),/permission denied/);
  await assert.rejects(db.query("select nextval('public.kapukai_scoped_consent_events_id_seq')"),/permission denied/);
  await db.exec("reset role; set role service_role");
  assert.equal((await db.query("select public.kapukai_scoped_is_open() as open")).rows[0].open,false);
  await assert.rejects(db.query("update public.kapukai_scoped_config set enabled=true"),/permission denied/);
 } finally {await db.close();}
});
test("paused new signup gate still permits token inspect and scoped unsubscribe",async()=>{
 const called=[];const handler=createHandler({isOpen:async()=>false,rateFingerprint:hashToken,
  sendConfirmation:async()=>{throw new Error("must not send");},
  rpc:async(name,args)=>{called.push(args.p_action);return {result:args.p_action==="inspect"?"valid":"unsubscribed"};}});
 const token=randomToken();
 assert.equal((await handler(http({action:"confirm",token}))).status,503);
 assert.equal((await handler(http({action:"inspect",token}))).status,200);
 assert.equal((await handler(http({action:"revoke",token,topics:["tester_invites"]}))).status,200);
 assert.deepEqual(called,["inspect","revoke"]);
});

test("community topics require confirmation, use event cadence and revoke without affecting the newsletter",async()=>{
 const db=await setup();
 try {
  const existing=await request(db,"community@example.test",["remedy_brief"]);
  await operation(db,existing.token,"confirm");
  const r=await request(db,"community@example.test",["free_classes","volunteer","connect"]);
  assert.equal((await operation(db,r.token,"inspect")).active_topics.length,0);
  assert.equal((await operation(db,r.token,"confirm")).result,"confirmed");
  const choices=(await db.query("select topic,cadence,state from kapukai_scoped_subscriptions where topic<>'remedy_brief' order by topic")).rows;
  assert.equal(choices.length,3);
  assert(choices.every(x=>x.cadence==='event_based' && x.state==='confirmed'));
  assert.equal((await operation(db,r.token,"revoke",["remedy_brief"])).result,"invalid");
  await operation(db,r.token,"revoke",["free_classes","volunteer","connect"]);
  assert.deepEqual((await operation(db,existing.token,"inspect")).active_topics,["remedy_brief"]);
  assert.equal(await count(db,"legacy_jobs"),0);
 } finally {await db.close();}
});

test("v1 pending confirmation survives expansion and cannot authorize new purposes",async()=>{
 const db=new PGlite();
 try {
  await db.exec(fixture);await db.exec(sql);
  const token=randomToken();
  await db.query("select public.kapukai_scoped_request($1,$2,$3,$4,$5,$6,$7,$8)",['legacy-pending@example.test',['tester_invites'],await hashToken(token),crypto.randomUUID(),'kapukai-scoped-v1-2026-10-05','/testers','monthly',[]]);
  await db.exec(expansion);
  assert.equal((await operation(db,token,"confirm")).result,"confirmed");
  assert.equal(validateRequest(validBody({consent_version:'kapukai-scoped-v1-2026-10-05'})).error,undefined);
  assert.ok(validateRequest(validBody({consent_version:'kapukai-scoped-v1-2026-10-05',topics:['free_classes'],tool_interests:[]})).error);
 } finally {await db.close();}
});

test("all five independently chosen topics pass validation and the email names the requested purposes",()=>{
 const topics=['free_classes','volunteer','connect','tester_invites','remedy_brief'];
 assert.ok(validateRequest(validBody({topics,source_path:'/community'})).value);
 const message=confirmationMessage(topics,'monthly',randomToken());
 assert.match(message.text,/Free classes and webinars/);
 assert.match(message.text,/Volunteer opportunities/);
 assert.match(message.text,/Collaboration and connection/);
 assert.match(message.text,/dates have not yet been announced/);
 assert.ok(validateRequest(validBody({topics:[]})).error);
});

