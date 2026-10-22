import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, normalizeRequest, createRpc, createMailSender, createDispatcher, projectResult } from '../supabase/functions/kapukai-lab/handler.mjs';
import { MemberError, PROJECT_URL } from '../supabase/functions/kapukai-lab/auth.mjs';
const USER='b8bbc25e-c196-4cbb-8eb9-ff38863df2d8', SESSION='b9ef7317-7514-4aac-8221-9a19f42c34b6', ID='c46ef1e0-836c-4e8c-b6a2-b8c9c40ecc54';
const ORIGIN='https://kapukai-community.vercel.app';
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const request=(body={action:'state',payload:{week_start:'2026-10-19'}},options={})=>new Request(`${PROJECT_URL}/functions/v1/kapukai-lab${options.search||''}`,{method:options.method||'POST',headers:{origin:ORIGIN,'content-type':'application/json',...options.headers},...(['GET','OPTIONS'].includes(options.method)?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
const book=(extra={})=>({action:'book',payload:{request_id:ID,room_id:'lounge',starts_at:'2026-10-23T13:00:00Z',ends_at:'2026-10-23T13:47:00Z',participants:6,mode:'room',...extra}});
const fixture=(options={})=>{ const calls=[],dispatches=[]; return {calls,dispatches,handler:createHandler({authenticate:async()=>({user_id:USER,session_id:SESSION}),rpc:async(name,args)=>{calls.push({name,args}); return {ok:true,booking:{id:ID}};},dispatch:async id=>{dispatches.push(id);return {state:'attempted',accepted:2,failed:0,unknown:0};},getConfig:()=>({baseUrl:PROJECT_URL,publishableKey:'sb_publishable_fixture'}),...options})}; };
const message={id:ID,to:'fixture@example.invalid',subject:'Kapukai booking confirmed',text:'Confirmed reservation fixture.'};

test('only quarter-hour starts accepted; independent minute ends preserved',()=>{
  assert.equal(normalizeRequest(book()).payload.ends_at,'2026-10-23T13:47:00Z');
  for(const starts_at of ['2026-10-23T13:15:00Z','2026-10-23T13:30:00.000Z','2026-10-23T13:45:00Z']) assert.doesNotThrow(()=>normalizeRequest(book({starts_at})));
  for(const starts_at of ['2026-10-23T13:01:00Z','2026-10-23T13:15:01Z','2026-02-30T13:00:00Z','2026-10-23T13:00:00-04:00']) assert.throws(()=>normalizeRequest(book({starts_at})));
});
test('exact request schemas reject forged actors, emails, capacities, and unexpected fields',()=>{
  for(const extra of [{user_id:USER},{email:'target@example.invalid'},{participants:7},{mode:'admin'},{request_id:'not-id'},{ends_at:'2026-10-23T13:47:20Z'}]) assert.throws(()=>normalizeRequest(book(extra)));
  for(const body of [{action:'constructor',payload:{}},{action:'book',payload:null},{action:'operator_dispatch',payload:{limit:100}},{action:'operator_member',payload:{email:'a@example.invalid',user_id:USER,active:true}}]) assert.throws(()=>normalizeRequest(body));
  assert.doesNotThrow(()=>normalizeRequest({action:'operator_member',payload:{email:'a@example.invalid',active:true}}));
});
test('origin, method, query, body and preflight boundaries are private and no-store',async()=>{
  const f=fixture();
  for(const [req,status] of [[request({}, {headers:{origin:'https://evil.invalid'}}),403],[request({}, {method:'GET'}),405],[request({}, {search:'?token=secret'}),400],[request('{bad'),400],[request('x'.repeat(17000)),413]]) {const r=await f.handler(req);assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');}
  const preflight=await f.handler(request({}, {method:'OPTIONS'}));assert.equal(preflight.status,204);assert.equal(f.calls.length,0);
});
test('identity is verified before RPC and client identities never become authority',async()=>{
  const f=fixture(); const r=await f.handler(request(book()));assert.equal(r.status,200);
  assert.deepEqual(f.calls[0],{name:'kapukai_lab_command',args:{p_user:USER,p_session:SESSION,p_action:'book',p_payload:book().payload}});
  assert.deepEqual(f.dispatches,[ID]);
  const denied=fixture({authenticate:async()=>{throw new MemberError('AUTHENTICATION_REQUIRED',401);}});assert.equal((await denied.handler(request(book()))).status,401);assert.equal(denied.calls.length,0);
});
test('public config cannot expose secret keys; private calls always require identity',async()=>{
  const good=fixture();assert.equal((await good.handler(request({action:'config'}))).status,200);assert.equal(good.calls.length,0);
  const bad=fixture({getConfig:()=>({baseUrl:PROJECT_URL,publishableKey:'sb_secret_private'})});const result=await bad.handler(request({action:'config'}));assert.equal(result.status,503);assert.doesNotMatch(await result.text(),/sb_secret/);
});
test('committed bookings remain confirmed when notification dispatch fails',async()=>{
  const f=fixture({dispatch:async()=>{throw new Error('provider unavailable');}});const r=await f.handler(request(book()));assert.equal(r.status,200);const body=await r.json();assert.equal(body.booking.id,ID);assert.deepEqual(body.notifications,{state:'pending'});
});
test('denied commands never dispatch; operator dispatch is checked in database first',async()=>{
  const denied=fixture({rpc:async()=>({ok:false,error:'FORBIDDEN'})});assert.equal((await denied.handler(request({action:'operator_dispatch'}))).status,403);assert.equal(denied.dispatches.length,0);
  const good=fixture();assert.equal((await good.handler(request({action:'operator_dispatch'}))).status,200);assert.deepEqual(good.dispatches,[undefined]);
});
test('state projection hides identities and subjects, preserves own history after revocation',()=>{
  const raw={ok:true,access:true,operator:false,timezone:'America/New_York',rooms:[],windows:[],mine:[{id:ID,user_id:USER,private_note:'secret'}],reservations:[{id:ID,kind:'room',title:'private case',user_id:USER,email:'private@example.invalid'}],members:[{user_id:USER,active:true}],secret:'x'};
  const result=projectResult(raw,'state');assert.equal(result.reservations[0].title,'Reserved');assert.equal(result.reservations[0].user_id,undefined);assert.equal(result.members,undefined);assert.equal(result.mine[0].private_note,undefined);assert.equal(result.secret,undefined);
  const revoked=projectResult({...raw,access:false},'state');assert.equal(revoked.reservations,undefined);assert.equal(revoked.mine[0].id,ID);
});
test('RPC names and project credentials are bounded; transport failures hide details',async()=>{
  let call;const rpc=createRpc({baseUrl:PROJECT_URL,serviceKey:'sb_secret_fixture',fetchImpl:async(...args)=>{call=args;return response({ok:true});}});
  await rpc('kapukai_lab_command',{p_user:USER});assert.equal(call[1].headers.apikey,'sb_secret_fixture');assert.equal(call[1].redirect,'error');assert.ok(call[1].signal);assert.equal(call[1].headers.Authorization,undefined);
  await assert.rejects(rpc('arbitrary_rpc',{}));
  const failed=createRpc({baseUrl:PROJECT_URL,serviceKey:'sb_secret_fixture',fetchImpl:async()=>response({secret:'internal'},500)});await assert.rejects(failed('kapukai_lab_command',{}),e=>e.code==='TEMPORARILY_UNAVAILABLE');
});
test('Postmark sender disables tracking and records acceptance, never delivery',async()=>{
  let call;const send=createMailSender({providerToken:'private',from:'Lab <architect@kapukai.org>',fetchImpl:async(...args)=>{call=args;return response({ErrorCode:0,MessageID:ID});}});
  assert.deepEqual(await send(message),{status:'accepted',provider_id:ID});const body=JSON.parse(call[1].body);assert.equal(body.TrackOpens,false);assert.equal(body.TrackLinks,'None');assert.equal(body.Metadata.outbox_id,ID);assert.equal(body.To,message.to);assert.ok(call[1].signal);
});
test('Postmark failures distinguish known rejection and ambiguous handoff; no retry',async()=>{
  for(const [fetchImpl,status] of [[async()=>response({ErrorCode:300},422),'failed'],[async()=>response({ErrorCode:0},200),'unknown'],[async()=>response({ErrorCode:500},500),'unknown'],[async()=>{throw new Error('timeout');},'unknown']]) {
    let count=0;const send=createMailSender({providerToken:'private',from:'architect@kapukai.org',fetchImpl:async(...args)=>{count++;return fetchImpl(...args);}});assert.equal((await send(message)).status,status);assert.equal(count,1);
  }
});
test('invalid recipient cannot turn one notification into multi-recipient send',async()=>{
  let count=0;const send=createMailSender({providerToken:'private',from:'architect@kapukai.org',fetchImpl:async()=>{count++;return response({ErrorCode:0,MessageID:ID});}});for(const to of ['a@example.invalid,b@example.invalid','a@example.invalid\nBcc: b@example.invalid']) assert.equal((await send({...message,to})).status,'failed');assert.equal(count,0);
});
test('dispatcher checks configuration before claim and only claims current booking request',async()=>{
  const calls=[];const rpc=async(name,args)=>{calls.push({name,args});return args.p_action==='claim'?{ok:true,messages:[message]}:{ok:true};};
  const send=Object.assign(async()=>({status:'accepted',provider_id:ID}),{configured:()=>{throw new Error('missing');}});
  assert.deepEqual(await createDispatcher({rpc,sendMail:send})(ID),{state:'pending'});assert.equal(calls.length,0);
  send.configured=()=>{};assert.deepEqual(await createDispatcher({rpc,sendMail:send})(ID),{state:'attempted',accepted:1,failed:0,unknown:0});assert.deepEqual(calls[0].args.p_payload,{limit:20,request_id:ID});assert.equal(calls[1].args.p_payload.status,'accepted');
});
test('uncertain sends are finalized unknown once; finish outages do not re-send',async()=>{
  for(const failsFinish of [false,true]) {
    let sent=0;const calls=[];const rpc=async(name,args)=>{calls.push(args);if(args.p_action==='claim')return {ok:true,messages:[message]};if(failsFinish)throw new Error('database unavailable');return {ok:true};};
    const report=await createDispatcher({rpc,sendMail:async()=>{sent++;throw new Error('timeout');}})(ID);assert.equal(report.unknown,1);assert.equal(sent,1);assert.equal(calls.length,2);assert.equal(calls[1].p_payload.status,'unknown');
  }
});
