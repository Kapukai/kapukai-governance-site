import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,normalizeRequest,hashToken} from '../supabase/functions/kapukai-member-access/handler.mjs';
import {createUnifiedSignupSender} from '../supabase/functions/kapukai-members/auth-code-delivery.mjs';
import {PROJECT_URL} from '../supabase/functions/kapukai-members/auth.mjs';
const id='11111111-1111-4111-8111-111111111111',mid='22222222-2222-4222-8222-222222222222',email='fixture@example.invalid',password='Synthetic-test-password';
const body={action:'auth_signup_request',payload:{email,password,request_id:id}};
const request=(data=body,origin='https://www.humanlibertyledger.org')=>new Request('https://example.invalid/',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
test('Unified signup validates password without accepting invitation or authority fields',()=>{
 assert.deepEqual(normalizeRequest(body),body);
 for(const payload of [{...body.payload,password:'short'},{...body.payload,user_id:id},{...body.payload,role:'reviewer'},{...body.payload,email:'a@example.invalid,b@example.invalid'}])assert.throws(()=>normalizeRequest({...body,payload}));
});
test('signup has one durable handoff; private password never enters SQL or response',async()=>{
 const calls=[],pending=[],sent=[];let claimed=false;
 const handler=createHandler({rateFingerprint:hashToken,defer:p=>pending.push(p),rpc:async(name,params)=>{calls.push({name,params});if(name==='kapukai_claim_signup_attempt')return true;if(name.endsWith('_claim')){if(claimed)return {result:'duplicate'};claimed=true;return {result:'claimed'}}return {result:'ok'}},sendSignup:Object.assign(async p=>{sent.push(p);return {state:'accepted',providerMessageId:mid}},{configured(){}})});
 for(let i=0;i<2;i++){const response=await handler(request());assert.equal(response.status,202);assert.deepEqual(await response.json(),{ok:true,result:'request_received'});await Promise.all(pending);}
 assert.equal(sent.length,1);assert.deepEqual(sent[0],{email,password});assert.equal(JSON.stringify(calls).includes(password),false);assert.equal(JSON.stringify(calls).includes(email),false);
 assert.equal((await handler(request(body,'https://kapukai.org'))).status,403);
});
test('signup mail uses the existing provider and has Unified-specific instructions',async()=>{
 const calls=[];const sender=createUnifiedSignupSender({baseUrl:PROJECT_URL,serviceKey:'sb_secret_fixture',providerToken:'fixture',from:'fixture@example.invalid',fetchImpl:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify(calls.length===1?{email_otp:'123456',verification_type:'signup',email}:{ErrorCode:0,MessageID:mid,To:email}),{status:200})}});
 assert.equal((await sender({email,password})).state,'accepted');assert.equal(calls[0].body.type,'signup');assert.equal(calls[0].body.password,password);
 assert.match(calls[1].body.TextBody,/Unified/);assert.equal(calls[1].body.TextBody.includes(password),false);assert.equal(calls[1].body.TrackLinks,'None');assert.equal(calls[1].body.TrackOpens,false);
});
