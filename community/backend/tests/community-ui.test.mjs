import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const root=new URL('../../public/',import.meta.url);
const app=await readFile(new URL('assets/community/app.js',root),'utf8');
async function ui(route,fetcher){
 const html=await readFile(new URL(route+'index.html',root),'utf8');
 const dom=new JSDOM(html,{url:'https://kapukai.org/'+route,runScripts:'outside-only'});
 dom.window.fetch=fetcher;dom.window.AbortSignal=AbortSignal;
 dom.window.eval(app);return dom;
}
const tick=()=>new Promise(r=>setTimeout(r,15));
test('community form sends only explicit choices, keeps a stable retry ID and shows actual failures',async()=>{
 const calls=[];let fail=true;
 const dom=await ui('join/',async(url,init)=>{calls.push(JSON.parse(init.body));if(fail)throw new Error('Temporarily unavailable');return {ok:true,json:async()=>({ok:true})};});
 try {
  const w=dom.window,d=w.document,form=d.querySelector('form');
  d.querySelector('#email').value='ui@example.invalid';d.querySelector('#adult').checked=true;
  const submit=()=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  submit();await tick();assert.equal(calls.length,0);assert.match(d.querySelector('#status').textContent,/Choose at least/);
  for(const topic of ['free_classes','volunteer','connect'])d.querySelector('[value="'+topic+'"]').checked=true;
  submit();await tick();assert.match(d.querySelector('#status').textContent,/Temporarily unavailable/);
  assert.equal(d.querySelector('button').disabled,false);fail=false;submit();await tick();
  assert.deepEqual(calls[1].topics,['free_classes','volunteer','connect']);
  assert.equal(calls[1].request_id,calls[0].request_id);
  assert.equal(calls[1].source_path,'/community');
  assert.equal(calls[1].consent_version,'kapukai-scoped-v2-2026-10-08');
  assert.deepEqual(calls[1].tool_interests,[]);
  assert.match(d.querySelector('#status').textContent,/only after you confirm/);
 } finally {dom.window.close();}
});
test('confirmation page requires a click, displays new purposes and can withdraw them',async()=>{
 const calls=[];let active=false;
 const html=await readFile(new URL('confirm/index.html',root),'utf8');
 const dom=new JSDOM(html,{url:'https://kapukai.org/confirm/#token='+('a'.repeat(43)),runScripts:'outside-only'});
 const w=dom.window,d=w.document;w.AbortSignal=AbortSignal;
 w.fetch=async(url,init)=>{const b=JSON.parse(init.body);calls.push(b);if(b.action==='confirm')active=true;if(b.action==='revoke')active=false;return {ok:true,json:async()=>b.action==='inspect'?{ok:true,topics:['free_classes','volunteer','connect'],active_topics:active?['free_classes','volunteer','connect']:[],can_confirm:!active}:{ok:true,result:b.action==='confirm'?'confirmed':'unsubscribed'}};};
 try {
  w.eval(app);await tick();assert.deepEqual(calls.map(c=>c.action),['inspect']);assert.equal(w.location.hash,'');
  assert.match(d.querySelector('#scope-list').textContent,/Free classes and webinars/);
  d.querySelector('#confirm').click();await tick();assert.equal(active,true);assert.match(d.querySelector('#manage-status').textContent,/Confirmed/);
  d.querySelector('#revoke').click();await tick();assert.equal(active,false);assert.match(d.querySelector('#manage-status').textContent,/withdrawn/);
  assert.deepEqual(calls.find(c=>c.action==='revoke').topics,['free_classes','volunteer','connect']);
 } finally {w.close();}
});
