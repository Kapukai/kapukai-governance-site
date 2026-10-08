import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {setup,create,snap,owner,handler,OWNER} from './lifecycle-harness.mjs';
import {createHandler as createOpsHandler,NOTICE_MESSAGE,NOTICE_VERSION} from '../supabase/functions/kapukai-workshop-ops/handler.mjs';
const root=new URL('../../public/',import.meta.url),origin='https://kapukai-community.vercel.app';
const tick=()=>new Promise(r=>setTimeout(r,30));
async function until(check){for(let n=0;n<60;n++){if(check())return;await tick();}assert.ok(check(),'UI did not settle');}
async function browser(route,script,fetcher){const html=await readFile(new URL(route.split('#')[0]+'index.html',root),'utf8'),source=await readFile(new URL('assets/community/'+script,root),'utf8');const dom=new JSDOM(html,{url:origin+'/'+route,runScripts:'outside-only'});dom.window.fetch=fetcher;dom.window.AbortSignal=AbortSignal;dom.window.eval(source);return dom;}
function submit(w,selector){const form=w.document.querySelector(selector);assert.ok(form,selector);form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
function http(url,init){return new Request(url,{...init,headers:{...init.headers,Origin:origin}});}

test('generated applicant page completes free offer, receipt, feedback, correction and withdrawal through real handler and SQL',async()=>{
 const db=await setup();let dom;const calls=[];
 try{const a=await create(db);await owner(db,a.id,'review');await owner(db,a.id,'offer',{resource_id:'practice',expires_days:7,minutes:15});const endpoint=handler(db);
 dom=await browser('community/apply/#app_token='+a.token,'applications.js',async(url,init)=>{calls.push(JSON.parse(init.body));return endpoint(http(url,init));});const w=dom.window,d=w.document;
 await until(()=>d.querySelector('[data-lifecycle-command="accept_offer"]'));
 assert.equal(w.location.hash,'');assert.deepEqual(calls.map(x=>x.action),['inspect']);assert.match(d.querySelector('#application-lifecycle').textContent,/free, nonbinding/i);assert.equal(w.localStorage.length,0);
 submit(w,'[data-lifecycle-command="accept_offer"]');await until(()=>d.querySelector('#application-lifecycle h2')?.textContent.includes('Interest accepted'));assert.equal((await snap(db,a.id)).stage,'accepted');
 await owner(db,a.id,'start');await owner(db,a.id,'deliver',{resource_id:'practice'});w.close();
 dom=await browser('community/apply/#app_token='+a.token,'applications.js',async(url,init)=>{calls.push(JSON.parse(init.body));return endpoint(http(url,init));});const w2=dom.window,d2=w2.document;
 await until(()=>d2.querySelector('[data-lifecycle-command="delivery_received"]'));
 assert.equal(d2.querySelector('.delivery-resource a').getAttribute('href'),'/community/practice/');submit(w2,'[data-lifecycle-command="delivery_received"]');await until(()=>d2.querySelector('#application-manage-status').textContent.startsWith('Your choice'));
 submit(w2,'[data-lifecycle-command="feedback"]');await until(()=>d2.querySelector('#application-lifecycle').textContent.includes('feedback is saved privately'));assert.equal((await snap(db,a.id)).feedback.working,'yes');
 const correction=d2.querySelector('[data-lifecycle-command="correction"]');correction.querySelector('select').value='incorrect_information';submit(w2,'[data-lifecycle-command="correction"]');await until(()=>d2.querySelector('#application-lifecycle h2').textContent==='Correction requested');assert.equal((await snap(db,a.id)).stage,'correction_requested');
 d2.querySelector('#application-withdraw').click();await until(()=>d2.querySelector('#application-manage-status').textContent.includes('has been withdrawn'));assert.equal((await snap(db,a.id)).stage,'withdrawn');assert.equal(d2.querySelectorAll('[data-lifecycle-command]').length,0);
 for(const c of calls.filter(x=>x.action==='lifecycle')){assert.ok(c.request_id);assert.equal(c.token,a.token);assert.equal(typeof c.expected_revision,'number');assert.ok(!JSON.stringify(c).includes('case narrative'));}
 }finally{dom?.window.close();await db.close();}
});

test('generated applicant clarification and reconsideration are structured through real handler and SQL',async()=>{
 const db=await setup();let dom;try{const a=await create(db,{kind:'reviewer',requested_support:null,profession:'engineering',availability:'monthly'});await owner(db,a.id,'review');await owner(db,a.id,'clarify',{field:'availability'});const endpoint=handler(db);let lifecycleCalls=0;dom=await browser('community/apply/#app_token='+a.token,'applications.js',async(url,init)=>{const body=JSON.parse(init.body);if(body.action==='lifecycle')lifecycleCalls++;return endpoint(http(url,init));});const w=dom.window,d=w.document;
 await until(()=>d.querySelector('[data-lifecycle-command="clarify"]'));assert.equal(d.querySelector('select[name=value]').value,'unsure');d.querySelector('select[name=value]').value='weekly';submit(w,'[data-lifecycle-command="clarify"]');await until(()=>d.querySelector('#application-manage-status').textContent.startsWith('Your choice'));assert.equal((await snap(db,a.id)).clarification_value,'weekly');
 await owner(db,a.id,'decline',{reason:'scope'});w.close();dom=await browser('community/apply/#app_token='+a.token,'applications.js',async(url,init)=>endpoint(http(url,init)));await until(()=>dom.window.document.querySelector('[data-lifecycle-command="reconsider"]'));submit(dom.window,'[data-lifecycle-command="reconsider"]');await until(()=>dom.window.document.querySelector('#application-manage-status').textContent.startsWith('Your choice'));assert.equal((await snap(db,a.id)).stage,'queue');
 assert.equal(lifecycleCalls,1);
 }finally{dom?.window.close();await db.close();}
});

test('owner generated controls require preview then confirmation, use real endpoint validators and SQL, and send notices only explicitly',async()=>{
 const db=await setup();let dom;try{const a=await create(db,{display_alias:'Test alias'}),calls=[];let sent=0,firstCommand=true;
 const rpc=async(name,args)=>{const entries=Object.entries(args);return(await db.query('select '+name+'('+entries.map((_,i)=>'$'+(i+1)).join(',')+') r',entries.map(([key,value])=>key==='p_payload'?JSON.stringify(value):value))).rows[0].r;};
 const ops=createOpsHandler({authenticate:async req=>{assert.equal(req.headers.get('authorization'),'Bearer test-access-token');return{user_id:OWNER[0],session_id:OWNER[1],tenant_id:OWNER[2],subject_id:OWNER[3]};},rpc,getConfig:()=>({baseUrl:'https://tbxfsjipkrdwyctepesf.supabase.co',publishableKey:'sb_publishable_test'}),canSendNotice:()=>true,sendNotice:async()=>{sent++;return{state:'accepted',providerMessageId:crypto.randomUUID()};}});
 dom=await browser('community/operate/','operations.js',async(url,init)=>{
 if(url.includes('/auth/v1/token')){assert.equal(JSON.parse(init.body).password,'only-in-fixture');return new Response(JSON.stringify({access_token:'test-access-token',refresh_token:'discard-this',expires_in:1800}),{status:200});}
 if(url.includes('/auth/v1/logout'))return new Response(null,{status:204});
 const body=JSON.parse(init.body);calls.push(body);if(body.action==='command'&&firstCommand){firstCommand=false;throw new Error('uncertain network');}return ops(http(url,init));});const w=dom.window,d=w.document;
 d.querySelector('#operator-email').value='operator@example.test';d.querySelector('#operator-password').value='only-in-fixture';submit(w,'#operator-login');await until(()=>d.querySelector('.queue-item'));assert.equal(d.querySelector('#operator-password').value,'');assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);assert.equal(w.location.hash,'');assert.deepEqual(calls.find(x=>x.action==='queue'),{action:'queue',limit:30,offset:0,view:'active'});
 d.querySelector('.queue-item').click();d.querySelector('#op-command').value='review';d.querySelector('#op-command').dispatchEvent(new w.Event('change'));submit(w,'#operator-decision');assert.equal(calls.filter(x=>x.action==='command').length,0);assert.match(d.querySelector('#operator-preview').textContent,/sends no email/);
 d.querySelector('#operator-commit').click();await until(()=>d.querySelector('#operator-status').textContent.includes('could not be confirmed'));assert.equal((await snap(db,a.id)).stage,'queue');d.querySelector('#operator-commit').click();await until(()=>d.querySelector('#operator-status').textContent.startsWith('Decision recorded'));assert.equal((await snap(db,a.id)).stage,'reviewing');const commandCalls=calls.filter(x=>x.action==='command');assert.equal(commandCalls[0].request_id,commandCalls[1].request_id);assert.equal(sent,0);
 const textarea=d.querySelector('.communication-draft textarea');assert.equal(textarea.value,'Subject: '+NOTICE_MESSAGE.subject+'\n\n'+NOTICE_MESSAGE.text);const send=[...d.querySelectorAll('button')].find(x=>x.textContent==='Send this update notice');assert.ok(send);send.click();await until(()=>d.querySelector('.communication-draft .status').textContent.includes('Accepted by the email provider'));assert.equal(sent,1);assert.match(d.querySelector('.communication-draft .status').textContent,/Inbox delivery is not confirmed/);assert.equal(send.disabled,true);assert.equal(calls.find(x=>x.action==='send_notice').template_version,NOTICE_VERSION);
 d.querySelector('#operator-signout').click();await tick();assert.equal(d.querySelector('#operator-workspace').hidden,true);assert.equal(d.querySelectorAll('.queue-item').length,0);assert.equal(w.localStorage.length,0);
 }finally{dom?.window.close();await db.close();}
});

test('applicant uncertain retry reuses its operation ID and stale revisions refresh without automatic mutation',async()=>{
 let inspections=0,failed=true;const mutations=[];const life={revision:2,stage:'offered',offer:{resource_id:'practice',minutes:15,expires_at:'2026-12-01T00:00:00Z'},actions:['accept_offer']};
 const dom=await browser('community/apply/#app_token='+('t'.repeat(43)),'applications.js',async(url,init)=>{const b=JSON.parse(init.body);if(b.action==='inspect'){inspections++;return new Response(JSON.stringify({ok:true,kind:'assistance',state:'awaiting_human_review',can_withdraw:true,lifecycle:life}));}mutations.push(b);if(failed){failed=false;throw new Error('network');}return new Response(JSON.stringify({ok:false,result:'stale_revision'}),{status:409});});
 try{const w=dom.window,d=w.document;await until(()=>d.querySelector('[data-lifecycle-command="accept_offer"]'));submit(w,'[data-lifecycle-command="accept_offer"]');await until(()=>d.querySelector('#application-manage-status').textContent.includes('could not be reached'));submit(w,'[data-lifecycle-command="accept_offer"]');await until(()=>inspections===2);assert.equal(mutations.length,2);assert.equal(mutations[0].request_id,mutations[1].request_id);assert.match(d.querySelector('#application-manage-status').textContent,/changed since/);assert.equal(d.activeElement.id,'application-manage-status');}finally{dom.window.close();}
});

test('owner access denial clears session and an unavailable service never displays fixture activity',async()=>{
 const calls=[];const dom=await browser('community/operate/','operations.js',async(url,init)=>{if(url.includes('/auth/'))return new Response(JSON.stringify({access_token:'denied-token',expires_in:1800}));const body=JSON.parse(init.body);calls.push(body);return body.action==='config'?new Response(JSON.stringify({ok:true,supabase_url:'https://tbxfsjipkrdwyctepesf.supabase.co',publishable_key:'sb_publishable_test',session_seconds:1800})):new Response(JSON.stringify({ok:false,code:'FORBIDDEN'}),{status:403});});
 try{const w=dom.window,d=w.document;assert.equal(d.querySelectorAll('.queue-item').length,0);d.querySelector('#operator-email').value='unauthorized@example.test';d.querySelector('#operator-password').value='fake';submit(w,'#operator-login');await until(()=>d.querySelector('#operator-status').textContent.includes('not authorized'));assert.equal(d.querySelector('#operator-workspace').hidden,true);assert.equal(d.querySelector('#operator-login-panel').hidden,false);assert.equal(d.querySelector('#operator-password').value,'');assert.equal(w.localStorage.length,0);assert.deepEqual(calls.map(c=>c.action),['config','queue']);}finally{dom.window.close();}
});

test('operator session expires, clears private DOM and never uses refresh-token storage',async()=>{
 const dom=await browser('community/operate/','operations.js',async(url,init)=>{
  if(url.includes('/auth/'))return new Response(JSON.stringify({access_token:'short-test-token',refresh_token:'never-store',expires_in:1}));
  const body=JSON.parse(init.body);return new Response(JSON.stringify(body.action==='config'?{ok:true,supabase_url:'https://tbxfsjipkrdwyctepesf.supabase.co',publishable_key:'sb_publishable_test',session_seconds:1800}:{ok:true,applications:[],enabled:true,has_more:false,capacity:{max_open:12,active_commitments:0}}));
 });try{const w=dom.window,d=w.document;d.querySelector('#operator-email').value='operator@example.test';d.querySelector('#operator-password').value='fake';submit(w,'#operator-login');await until(()=>!d.querySelector('#operator-workspace').hidden);await until(()=>d.querySelector('#operator-status').textContent.includes('session expired'));assert.equal(d.querySelector('#operator-workspace').hidden,true);assert.equal(d.querySelector('#operator-capacity').textContent,'');assert.equal(d.querySelector('#operator-password').value,'');assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);}finally{dom.window.close();}
});

test('owner pagination requests real active and archived pages and unknown notification results cannot be resent',async()=>{
 const requests=[];let notices=0;const row={application_id:'33333333-3333-4333-8333-333333333333',display_alias:'Synthetic alias',kind:'assistance',service_interest:'tools',confirmed_at:'2026-10-01T00:00:00Z',lifecycle:{revision:1,stage:'queue',owner_actions:['review'],can_send_notice:true}};
 const dom=await browser('community/operate/','operations.js',async(url,init)=>{
  if(url.includes('/auth/'))return new Response(JSON.stringify({access_token:'fixture-access',expires_in:1800}));
  const body=JSON.parse(init.body);requests.push(body);
  if(body.action==='config')return new Response(JSON.stringify({ok:true,supabase_url:'https://tbxfsjipkrdwyctepesf.supabase.co',publishable_key:'sb_publishable_test',session_seconds:1800}));
  if(body.action==='send_notice'){notices++;return new Response(JSON.stringify({ok:true,result:'notice_unreconciled',notice:{state:'unknown'}}));}
  return new Response(JSON.stringify({ok:true,applications:[row],has_more:body.offset===0,enabled:true,capacity:{max_open:12,active_commitments:0},notice_template:{version:NOTICE_VERSION,...NOTICE_MESSAGE},notice_available:true}));
 });try{const w=dom.window,d=w.document;d.querySelector('#operator-email').value='operator@example.test';d.querySelector('#operator-password').value='fake';submit(w,'#operator-login');await until(()=>d.querySelector('.queue-item'));[...d.querySelectorAll('#operator-queue button')].find(x=>x.textContent==='Next').click();await until(()=>requests.some(x=>x.action==='queue'&&x.offset===30)&&!d.querySelector('#operator-refresh').disabled);d.querySelector('#operator-filter').value='archived';d.querySelector('#operator-filter').dispatchEvent(new w.Event('change'));await until(()=>requests.some(x=>x.view==='archived'&&x.offset===0)&&!d.querySelector('#operator-refresh').disabled);d.querySelector('.queue-item').click();const send=[...d.querySelectorAll('button')].find(x=>x.textContent==='Send this update notice');send.click();await until(()=>d.querySelector('.communication-draft .status').textContent.includes('outcome is unknown'));assert.equal(send.disabled,true);send.click();await tick();assert.equal(notices,1);assert.equal(requests.filter(x=>x.action==='send_notice').length,1);}finally{dom.window.close();}
});
