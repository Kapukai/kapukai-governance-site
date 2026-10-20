import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {JSDOM, VirtualConsole} from 'jsdom';

const js = readFileSync(new URL('../../assets/members.js', import.meta.url), 'utf8');
const pages = JSON.parse(execFileSync('python', ['-c', "import runpy,json; p={}; runpy.run_path('community/member_pages.py')['build_members'](lambda path,title,description,body,script:p.update({path:body})); print(json.dumps(p))"], {cwd: new URL('../../../', import.meta.url), encoding: 'utf8'}));
const ORIGIN = 'https://kapukai-community.vercel.app';
const ACCESS_ENDPOINT = 'https://tbxfsjipkrdwyctepesf.supabase.co/functions/v1/kapukai-member-access';
const INVITATION = 'a'.repeat(64);
const ACCESS_TOKEN = 'b'.repeat(42) + 'A';
const REQUEST_ID = '10000000-0000-4000-8000-000000000001';
const MEMBER_ID = '20000000-0000-4000-8000-000000000002';
const CONSENT_VERSION = 'kapukai-member-access-v1-2026-10-20';

function snapshot(extra = {}) {
  return {ok: true, result: 'ok', enabled: true, max_members: 25, is_operator: false,
    profile: {id: MEMBER_ID, display_name: 'A member', status: 'active', bio: '', interests: [], discoverable: false, reviewer_opt_in: false, reviewer_scopes: []},
    rooms: [], discovery: [], introductions: [], requests: [], assignments: [], events: [], feedback: [], credentials: [], blocks: [], ...extra};
}
function operatorState() {
  return snapshot({profile: null, is_operator: true, operator_queue: {invitations: [], members: [], reports: [], feedback: [], credentials: []}});
}
function response(data, status = 200) {
  return {ok: status >= 200 && status < 300, status, json: async () => structuredClone(data)};
}
async function waitFor(check) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('UI did not reach expected state: ' + String(check));
}
function action(h, name) { return h.calls.filter(call => call.body.action === name).at(-1); }
function actions(h, name) { return h.calls.filter(call => call.body.action === name); }
function send(h, form) { form.dispatchEvent(new h.w.Event('submit', {bubbles: true, cancelable: true})); }
function clickText(h, text) {
  const button = [...h.d.querySelectorAll('button')].find(item => item.textContent === text);
  assert.ok(button, 'Button exists: ' + text);
  button.click();
  return button;
}
function submitReady(form) { return !form.querySelector('button[type="submit"]')?.disabled; }
function fillRequest(h) {
  const form = h.d.getElementById('member-access-request');
  assert.ok(form, 'Public access request form exists');
  form.elements.email.value = 'reader@example.test';
  form.elements.display_name.value = 'A reader';
  for (const name of ['adult', 'privacy_acknowledged', 'human_review_acknowledged']) form.elements[name].checked = true;
  return form;
}
function harness({fragment = '', state = snapshot(), handle, clipboardWrite} = {}) {
  let currentState = structuredClone(state);
  const calls = [], errors = [], copied = [];
  const dom = new JSDOM('<!doctype html><html><body>' + pages['community/members'] + '</body></html>', {
    url: ORIGIN + '/community/members/' + fragment, runScripts: 'outside-only',
    virtualConsole: new VirtualConsole().on('jsdomError', error => errors.push(error.message)),
  });
  const w = dom.window;
  w.AbortSignal.timeout = () => undefined;
  for (const storage of ['localStorage', 'sessionStorage']) Object.defineProperty(w, storage, {get() { throw new Error('Private token persistence forbidden'); }});
  Object.defineProperty(w.navigator, 'clipboard', {value: {writeText: clipboardWrite || (async value => copied.push(value))}});
  w.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : {};
    const call = {url: String(url), body, headers: init.headers || {}, credentials: init.credentials, fragmentAtFetch: w.location.hash};
    calls.push(call);
    if (handle) {
      const handled = await handle(body.action, body.payload, {call, setState(value) { currentState = value; }});
      if (handled) return handled;
    }
    if (String(url).includes('/auth/v1/')) return response({access_token: 'test-private-token', expires_in: 1800});
    if (body.action === 'config') return response({ok: true, supabase_url: 'https://tbxfsjipkrdwyctepesf.supabase.co', publishable_key: 'test-public-key', session_seconds: 1800});
    if (body.action === 'state') return response(currentState);
    if (body.action === 'operator_invitation_status') return delivery('none');
    if (body.action === 'operator_access_queue') return response({ok: true, result: 'ok', requests: []});
    if (body.action === 'access_request') return response({ok: true, result: 'request_received'}, 202);
    if (body.action === 'access_inspect') return response({ok: true, result: 'ok', state: 'awaiting_email', revision: 1, can_confirm: true, can_withdraw: true, consent_version: CONSENT_VERSION});
    return response({ok: true, result: 'ok'});
  };
  w.eval(js);
  return {w, d: w.document, calls, errors, copied,
    async login() {
      const form = w.document.getElementById('member-login');
      form.elements.email.value = 'existing@example.test';
      form.elements.password.value = 'a-test-password';
      send(this, form);
      await waitFor(() => action(this, 'state') && submitReady(form));
    },
    close() { dom.window.close(); },
  };
}


const INVITATION_ID='30000000-0000-4000-8000-000000000003';
const expiry='2026-12-01T00:00:00.000Z';
function delivery(state){return response({ok:true,result:'ok',delivery_state:state,invitation_id:INVITATION_ID,expires_at:expiry});}
async function createInvitation(h){await h.login();const f=h.d.getElementById('operator-invitation');f.elements.email.value='invite@example.test';send(h,f);await waitFor(()=>h.d.querySelector('#operator-invite-result textarea')&&!h.d.querySelector('#operator-invite-result button').disabled);}
function mailButton(h,text){return [...h.d.querySelectorAll('[aria-label="Invitation email"] button')].find(b=>b.textContent===text);}
function mailText(h){return h.d.querySelector('[aria-label="Invitation email"] .form-status')?.textContent||'';}
const created=()=>response({ok:true,result:'ok',invitation_id:INVITATION_ID,invite_token:INVITATION});
async function previewInvitation(h){clickText(h,'Preview invitation email');await waitFor(()=>!mailButton(h,'Send invitation email').parentElement.parentElement.hidden&&!mailButton(h,'Send invitation email').disabled);}

test('created invitation requires a visible preview and a separate authenticated send; accepted does not claim inbox delivery',async()=>{
 const h=harness({state:operatorState(),handle:async name=>name==='operator_invite'?created():name==='operator_invitation_send'?delivery('accepted'):undefined});
 try{await createInvitation(h);assert.equal(actions(h,'operator_invitation_send').length,0);assert.equal(mailButton(h,'Send invitation email').parentElement.parentElement.hidden,true);mailButton(h,'Send invitation email').click();assert.equal(actions(h,'operator_invitation_send').length,0);await previewInvitation(h);assert.equal(actions(h,'operator_invitation_send').length,0);assert.equal(actions(h,'operator_invitation_status').length,1);assert.match(h.d.querySelector('[aria-label="Invitation email"] .member-preview').textContent,/2026-12-01T00:00:00.000Z/);assert.match(h.d.querySelector('[aria-label="Invitation email"]').textContent,/To: invite@example.test/);clickText(h,'Send invitation email');clickText(h,'Send invitation email');await waitFor(()=>mailText(h).includes('Email provider accepted'));assert.equal(actions(h,'operator_invitation_send').length,1);const sent=action(h,'operator_invitation_send');assert.equal(sent.url,ACCESS_ENDPOINT);assert.equal(sent.headers.Authorization,'Bearer test-private-token');assert.equal(sent.body.payload.email,'invite@example.test');assert.equal(sent.body.payload.invite_token,INVITATION);assert.match(sent.body.payload.delivery_id,/^[0-9a-f-]{36}$/);assert.match(mailText(h),/Inbox delivery is not confirmed/);assert.equal(mailButton(h,'Send invitation email').hidden,true);assert.equal(mailButton(h,'Retry invitation email').hidden,true);assert.deepEqual(h.errors,[]);}finally{h.close();}
});

test('saved invitation can be checked and emailed without creating another invitation or approving again',async()=>{
 const h=harness({state:operatorState(),handle:async name=>name==='operator_invitation_status'?delivery('none'):name==='operator_invitation_send'?delivery('accepted'):undefined});
 try{await h.login();const f=h.d.getElementById('operator-existing-invitation');f.elements.email.value='invite@example.test';f.elements.invitation.value=ORIGIN+'/community/members/#invite='+INVITATION;send(h,f);await waitFor(()=>h.d.querySelector('[aria-label="Invitation email"]'));assert.equal(actions(h,'operator_invite').length,0);assert.equal(actions(h,'operator_access_approve').length,0);assert.equal(actions(h,'operator_invitation_send').length,0);assert.equal(f.elements.invitation.value,'');assert.deepEqual(action(h,'operator_invitation_status').body.payload,{email:'invite@example.test',invite_token:INVITATION});assert.equal(mailButton(h,'Send invitation email').parentElement.parentElement.hidden,false);clickText(h,'Send invitation email');await waitFor(()=>mailText(h).includes('Email provider accepted'));assert.equal(actions(h,'operator_invitation_send').length,1);assert.equal(actions(h,'operator_invite').length,0);assert.ok(h.calls.every(c=>!c.url.includes(INVITATION)));}finally{h.close();}
});

test('saved code preview rejects unrelated URLs without sending or inspecting',async()=>{
 const h=harness({state:operatorState()});try{await h.login();const f=h.d.getElementById('operator-existing-invitation');f.elements.email.value='invite@example.test';f.elements.invitation.value='https://example.test/#invite='+INVITATION;send(h,f);assert.match(f.querySelector('.form-status').textContent,/complete private Kapukai/);assert.equal(actions(h,'operator_invitation_status').length,0);assert.equal(actions(h,'operator_invitation_send').length,0);}finally{h.close();}
});

test('uncertain handoff never resends automatically and status inspection can resolve it',async()=>{
 let sent=0;const h=harness({state:operatorState(),handle:async name=>{if(name==='operator_invite')return created();if(name==='operator_invitation_send'){sent++;throw new Error('Network timeout');}if(name==='operator_invitation_status')return delivery(sent?'accepted':'none');}});
 try{await createInvitation(h);await previewInvitation(h);clickText(h,'Send invitation email');await waitFor(()=>mailText(h).includes('uncertain'));assert.equal(sent,1);assert.equal(mailButton(h,'Send invitation email').hidden,true);assert.equal(mailButton(h,'Retry invitation email').hidden,true);assert.equal(mailButton(h,'Check email status').hidden,false);mailButton(h,'Send invitation email').click();assert.equal(sent,1);clickText(h,'Check email status');await waitFor(()=>mailText(h).includes('Email provider accepted'));assert.equal(sent,1);assert.equal(actions(h,'operator_invitation_status').length,2);assert.deepEqual(h.errors,[]);}finally{h.close();}
});

test('only a confirmed failure offers explicit retry with a new idempotency identifier',async()=>{
 let sends=0;const h=harness({state:operatorState(),handle:async name=>name==='operator_invite'?created():name==='operator_invitation_send'?delivery(++sends===1?'failed':'accepted'):undefined});
 try{await createInvitation(h);await previewInvitation(h);clickText(h,'Send invitation email');await waitFor(()=>mailText(h).includes('provider rejected'));assert.equal(sends,1);assert.equal(mailButton(h,'Retry invitation email').hidden,false);const first=action(h,'operator_invitation_send').body.payload.delivery_id;clickText(h,'Retry invitation email');await waitFor(()=>mailText(h).includes('Email provider accepted'));assert.equal(sends,2);assert.notEqual(action(h,'operator_invitation_send').body.payload.delivery_id,first);assert.equal(mailButton(h,'Retry invitation email').hidden,true);}finally{h.close();}
});

test('an uncertain request with no recorded send can reuse its identifier only after explicit status check',async()=>{
 let sends=0;const h=harness({state:operatorState(),handle:async name=>{if(name==='operator_invite')return created();if(name==='operator_invitation_send'){sends++;if(sends===1)throw new Error('Request lost');return delivery('accepted');}if(name==='operator_invitation_status')return delivery('none');}});
 try{await createInvitation(h);await previewInvitation(h);clickText(h,'Send invitation email');await waitFor(()=>mailText(h).includes('uncertain'));const first=action(h,'operator_invitation_send').body.payload.delivery_id;clickText(h,'Check email status');await waitFor(()=>mailText(h).includes('No email send'));assert.equal(sends,1);clickText(h,'Send invitation email');await waitFor(()=>mailText(h).includes('Email provider accepted'));assert.equal(action(h,'operator_invitation_send').body.payload.delivery_id,first);}finally{h.close();}
});

test('ordinary members never get invitation email controls and page exit clears operator secrets',async()=>{
 const ordinary=harness();try{await ordinary.login();assert.equal(ordinary.d.getElementById('operator-existing-invitation'),null);assert.equal(ordinary.d.querySelector('[aria-label="Invitation email"]'),null);}finally{ordinary.close();}
 const h=harness({state:operatorState(),handle:async name=>name==='operator_invite'?created():undefined});try{await createInvitation(h);await previewInvitation(h);h.w.dispatchEvent(new h.w.Event('pagehide'));assert.equal(h.d.getElementById('operator-invite-result'),null);assert.equal(h.d.getElementById('operator-existing-invitation'),null);assert.ok(!h.d.body.textContent.includes('invite@example.test'));assert.equal(actions(h,'operator_invitation_send').length,0);}finally{h.close();}
});

test('late send response after signout cannot restore a private invitation card',async()=>{
 let finish;const pending=new Promise(resolve=>finish=resolve);const h=harness({state:operatorState(),handle:async name=>name==='operator_invite'?created():name==='operator_invitation_send'?pending:undefined});try{await createInvitation(h);await previewInvitation(h);clickText(h,'Send invitation email');await waitFor(()=>action(h,'operator_invitation_send'));clickText(h,'Sign out');finish(delivery('accepted'));await new Promise(resolve=>setTimeout(resolve,20));assert.equal(h.d.getElementById('operator-invite-result'),null);assert.equal(h.d.getElementById('operator-existing-invitation'),null);assert.ok(!h.d.body.textContent.includes('invite@example.test'));assert.equal(h.d.getElementById('member-workspace').hidden,true);}finally{h.close();}
});


test('an expired or revoked invitation cannot reveal send controls when preview verification fails',async()=>{
 const h=harness({state:operatorState(),handle:async name=>name==='operator_invite'?created():name==='operator_invitation_status'?response({ok:false,error:'Invitation unavailable.'},409):undefined});try{await createInvitation(h);clickText(h,'Preview invitation email');await waitFor(()=>h.d.querySelector('[aria-label="Invitation email"]').textContent.includes('could not be verified'));assert.equal(mailButton(h,'Send invitation email').parentElement.parentElement.hidden,true);mailButton(h,'Send invitation email').click();assert.equal(actions(h,'operator_invitation_send').length,0);assert.equal(actions(h,'operator_invitation_status').length,1);}finally{h.close();}
});

test('late preview and clipboard completion cannot restore private details after signout',async()=>{
 let resolvePreview,resolveClipboard;const previewPending=new Promise(resolve=>resolvePreview=resolve),clipboardPending=new Promise(resolve=>resolveClipboard=resolve);const h=harness({state:operatorState(),clipboardWrite:async()=>clipboardPending,handle:async name=>name==='operator_invite'?created():name==='operator_invitation_status'?previewPending:undefined});try{await createInvitation(h);clickText(h,'Copy invitation link');clickText(h,'Preview invitation email');await waitFor(()=>action(h,'operator_invitation_status'));clickText(h,'Sign out');resolvePreview(delivery('none'));resolveClipboard();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(h.d.getElementById('operator-invite-result'),null);assert.ok(!h.d.body.textContent.includes('invite@example.test'));assert.equal(actions(h,'operator_invitation_send').length,0);assert.deepEqual(h.errors,[]);}finally{h.close();}
});
