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
function harness({fragment = '', state = snapshot(), handle} = {}) {
  let currentState = structuredClone(state);
  const calls = [], errors = [], copied = [];
  const dom = new JSDOM('<!doctype html><html><body>' + pages['community/members'] + '</body></html>', {
    url: ORIGIN + '/community/members/' + fragment, runScripts: 'outside-only',
    virtualConsole: new VirtualConsole().on('jsdomError', error => errors.push(error.message)),
  });
  const w = dom.window;
  w.AbortSignal.timeout = () => undefined;
  for (const storage of ['localStorage', 'sessionStorage']) Object.defineProperty(w, storage, {get() { throw new Error('Private token persistence forbidden'); }});
  Object.defineProperty(w.navigator, 'clipboard', {value: {writeText: async value => copied.push(value)}});
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

test('generic member visit starts with access request and no account credentials or network action', () => {
  const h = harness();
  try {
    const form = h.d.getElementById('member-access-request');
    assert.ok(form);
    assert.equal(h.d.getElementById('member-access-request-panel').hidden, false);
    assert.equal(h.d.getElementById('member-create-panel').hidden, true);
    assert.equal(h.d.getElementById('member-signin-panel').hidden, true);
    assert.equal(form.querySelector('input[type="password"]'), null);
    assert.equal(form.elements.invite_token, undefined);
    for (const name of ['adult', 'privacy_acknowledged', 'human_review_acknowledged']) {
      assert.equal(form.elements[name].checked, false);
      assert.equal(form.elements[name].required, true);
    }
    assert.equal(h.calls.length, 0);
    assert.deepEqual(h.errors, []);
  } finally { h.close(); }
});

test('invitation fragment is scrubbed and carried into explicit joining after existing account sign in', async () => {
  const h = harness({fragment: '#invite=' + INVITATION, state: snapshot({profile: null})});
  try {
    assert.equal(h.w.location.hash, '');
    assert.equal(h.calls.length, 0);
    assert.equal(h.d.getElementById('member-create-panel').hidden, false);
    for (const id of ['member-create', 'member-join']) assert.equal(h.d.getElementById(id).elements.invite_token.value, INVITATION);
    h.d.getElementById('member-choice-signin').click();
    assert.equal(h.d.getElementById('member-create-panel').hidden, true);
    assert.equal(h.d.getElementById('member-signin-panel').hidden, false);
    assert.match(h.d.getElementById('member-signin-description').textContent, /invitation is loaded/);
    await h.login();
    assert.equal(h.d.getElementById('member-join-panel').hidden, false);
    assert.equal(h.d.getElementById('member-join').elements.invite_token.value, INVITATION);
    assert.equal(action(h, 'join'), undefined);
    assert.equal(action(h, 'signup'), undefined);
    assert.ok(h.calls.every(call => call.fragmentAtFetch === ''));
    assert.ok(h.calls.every(call => !call.url.includes(INVITATION)));
    assert.deepEqual(h.errors, []);
  } finally { h.close(); }
});

test('invalid, mixed, and duplicate private fragments are scrubbed without requests or token prefilling', async t => {
  const fragments = [
    '#invite=short', '#access_token=short',
    '#invite=' + INVITATION + '&access_token=' + ACCESS_TOKEN,
    '#invite=' + INVITATION + '&invite=' + INVITATION,
    '#access_token=' + ACCESS_TOKEN + '&access_token=' + ACCESS_TOKEN,
    '#invite=' + INVITATION + '&unexpected=value',
    '#access_token=' + ACCESS_TOKEN + '&unexpected=value',
  ];
  for (const fragment of fragments) await t.test(fragment.split('=')[0] + ' with ' + fragment.length + ' characters', () => {
    const h = harness({fragment});
    try {
      assert.equal(h.w.location.hash, '');
      assert.equal(h.calls.length, 0);
      for (const id of ['member-create', 'member-join']) assert.equal(h.d.getElementById(id).elements.invite_token.value, '');
      assert.equal(h.d.getElementById('member-create-panel').hidden, true);
      assert.deepEqual(h.errors, []);
    } finally { h.close(); }
  });
});

test('request access requires explicit consents and returns generic acceptance without creating an Auth account', async () => {
  const h = harness();
  try {
    const form = fillRequest(h);
    form.elements.human_review_acknowledged.checked = false;
    send(h, form);
    assert.equal(action(h, 'access_request'), undefined);
    form.elements.human_review_acknowledged.checked = true;
    send(h, form);
    await waitFor(() => action(h, 'access_request') && (form.dataset.submitted === 'true' || submitReady(form)));
    const request = action(h, 'access_request');
    assert.equal(request.url, ACCESS_ENDPOINT);
    assert.equal(request.credentials, 'omit');
    assert.equal(request.headers.Authorization, undefined);
    assert.deepEqual(Object.keys(request.body.payload).sort(), ['email', 'display_name', 'request_id', 'consent_version', 'adult', 'privacy_acknowledged', 'human_review_acknowledged', 'started_at', 'website'].sort());
    assert.equal(request.body.payload.email, 'reader@example.test');
    assert.equal(request.body.payload.display_name, 'A reader');
    assert.equal(request.body.payload.consent_version, CONSENT_VERSION);
    assert.match(request.body.payload.request_id, /^[a-f0-9-]{36}$/i);
    assert.ok(request.body.payload.started_at);
    assert.equal(request.body.payload.website, '');
    assert.equal(request.body.payload.adult, true);
    assert.equal(request.body.payload.privacy_acknowledged, true);
    assert.equal(request.body.payload.human_review_acknowledged, true);
    assert.equal(h.calls.length, 1);
    assert.equal(h.d.getElementById('member-workspace').hidden, true);
    assert.equal(h.d.querySelector('.form-status.error'), null);
    assert.deepEqual(h.errors, []);
  } finally { h.close(); }
});

test('uncertain request handoff keeps the draft and idempotency key and never retries automatically', async () => {
  const h = harness({handle: async name => { if (name === 'access_request') throw new Error('Simulated lost provider response'); }});
  try {
    const form = fillRequest(h);
    send(h, form);
    await waitFor(() => actions(h, 'access_request').length === 1 && submitReady(form));
    const first = action(h, 'access_request').body.payload;
    assert.equal(form.elements.email.value, 'reader@example.test');
    assert.equal(form.elements.display_name.value, 'A reader');
    assert.equal(form.elements.human_review_acknowledged.checked, true);
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(actions(h, 'access_request').length, 1);
    send(h, form);
    await waitFor(() => actions(h, 'access_request').length === 2 && submitReady(form));
    assert.deepEqual(action(h, 'access_request').body.payload, first);
    form.elements.email.value = 'different@example.test';
    form.elements.email.dispatchEvent(new h.w.Event('input', {bubbles: true}));
    send(h, form);
    await waitFor(() => actions(h, 'access_request').length === 3 && submitReady(form));
    assert.notEqual(action(h, 'access_request').body.payload.request_id, first.request_id);
    assert.equal(h.calls.some(call => call.url.includes('/auth/v1/')), false);
  } finally { h.close(); }
});

test('confirmation link only inspects until separate confirmation and withdrawal clicks', async () => {
  let requestState = 'awaiting_email';
  const h = harness({fragment: '#access_token=' + ACCESS_TOKEN, handle: async name => {
    if (name === 'access_confirm') requestState = 'awaiting_review';
    if (name === 'access_withdraw') requestState = 'withdrawn';
    if (['access_inspect', 'access_confirm', 'access_withdraw'].includes(name)) return response({ok: true, result: 'ok', state: requestState, revision: requestState === 'awaiting_email' ? 1 : 2, can_confirm: requestState === 'awaiting_email', can_withdraw: requestState !== 'withdrawn', consent_version: CONSENT_VERSION});
  }});
  try {
    assert.equal(h.w.location.hash, '');
    await waitFor(() => h.d.getElementById('member-access-management')?.textContent.includes('Confirm my access request'));
    assert.deepEqual(h.calls.map(call => call.body.action), ['access_inspect']);
    assert.equal(action(h, 'access_inspect').url, ACCESS_ENDPOINT);
    assert.deepEqual(action(h, 'access_inspect').body.payload, {token: ACCESS_TOKEN});
    assert.equal(action(h, 'access_inspect').fragmentAtFetch, '');
    assert.equal(h.d.getElementById('member-access-management').hidden, false);
    clickText(h, 'Confirm my access request');
    await waitFor(() => action(h, 'access_confirm') && ![...h.d.querySelectorAll('button')].some(button => button.textContent === 'Confirm my access request'));
    assert.deepEqual(action(h, 'access_confirm').body.payload, {token: ACCESS_TOKEN});
    assert.equal(action(h, 'access_withdraw'), undefined);
    clickText(h, 'Withdraw this request');
    await waitFor(() => action(h, 'access_withdraw') && ![...h.d.querySelectorAll('button')].some(button => button.textContent === 'Withdraw this request'));
    assert.deepEqual(action(h, 'access_withdraw').body.payload, {token: ACCESS_TOKEN});
    assert.ok(h.calls.every(call => call.url === ACCESS_ENDPOINT && call.fragmentAtFetch === '' && !call.headers.Authorization));
    assert.equal(action(h, 'signup'), undefined);
    assert.equal(action(h, 'join'), undefined);
    assert.deepEqual(h.errors, []);
  } finally { h.close(); }
});

test('ordinary member sign in cannot load or display access review requests', async () => {
  const h = harness();
  try {
    await h.login();
    assert.equal(action(h, 'operator_access_queue'), undefined);
    assert.equal(h.d.getElementById('operator-access-requests'), null);
    assert.equal(h.d.getElementById('member-section-operate'), null);
    assert.deepEqual(h.errors, []);
  } finally { h.close(); }
});

test('operator approval requires review and binds the revision without accepting caller-provided email', async () => {
  const row = {id: REQUEST_ID, email: 'confirmed@example.test', display_name: '<img src=x onerror=alert(1)>', state: 'awaiting_review', revision: 4, created_at: '2026-10-20T09:00:00Z', confirmed_at: '2026-10-20T09:10:00Z'};
  let queue = [row];
  const h = harness({state: operatorState(), handle: async name => {
    if (name === 'operator_access_queue') return response({ok: true, result: 'ok', requests: queue});
    if (name === 'operator_access_approve') { queue = []; return response({ok: true, result: 'ok', invite_token: INVITATION, invitation_id: MEMBER_ID, expires_at: '2026-10-27T09:20:00Z'}); }
  }});
  try {
    await h.login();
    await waitFor(() => h.d.getElementById('operator-access-approve-' + REQUEST_ID));
    assert.equal(action(h, 'operator_access_queue').url, ACCESS_ENDPOINT);
    assert.equal(action(h, 'operator_access_queue').headers.Authorization, 'Bearer test-private-token');
    assert.match(h.d.getElementById('operator-access-requests').textContent, /confirmed@example\.test/);
    assert.equal(h.d.querySelector('img'), null);
    const form = h.d.getElementById('operator-access-approve-' + REQUEST_ID);
    assert.equal(form.elements.reviewed.checked, false);
    assert.equal(form.elements.reviewed.required, true);
    assert.equal(form.elements.email, undefined);
    send(h, form);
    assert.equal(action(h, 'operator_access_approve'), undefined);
    form.elements.reviewed.checked = true;
    form.elements.expires_days.value = '7';
    send(h, form);
    await waitFor(() => h.d.querySelector('#operator-invite-result textarea'));
    const approved = action(h, 'operator_access_approve');
    assert.equal(approved.url, ACCESS_ENDPOINT);
    assert.equal(approved.headers.Authorization, 'Bearer test-private-token');
    assert.deepEqual(approved.body.payload, {request_id: REQUEST_ID, expected_revision: 4, expires_days: 7});
    const link = ORIGIN + '/community/members/#invite=' + INVITATION;
    assert.equal(h.d.querySelector('#operator-invite-result textarea').value, link);
    assert.equal(h.d.getElementById('member-section-operate').hidden, false);
    assert.equal(h.d.activeElement.getAttribute('aria-label'), 'Invitation ready to share');
    assert.match(h.d.getElementById('operator-invite-result').textContent, /Send only to: confirmed@example\.test/);
    assert.match(h.d.getElementById('operator-invite-result').textContent, /before refreshing or leaving/);
    const copy = [...h.d.querySelectorAll('#operator-invite-result button')].find(button => /copy/i.test(button.textContent));
    assert.ok(copy);
    copy.click();
    await waitFor(() => h.copied.length === 1 && h.d.getElementById('member-status').textContent.includes('Now send it directly'));
    assert.deepEqual(h.copied, [link]);
    assert.match(h.d.getElementById('member-status').textContent, /Now send it directly to confirmed@example\.test/);
    assert.ok(h.calls.every(call => !call.url.includes(row.email) && !call.url.includes(INVITATION)));
    assert.equal(action(h, 'join'), undefined);
    assert.equal(action(h, 'signup'), undefined);
    clickText(h, 'Sign out');
    assert.equal(h.d.getElementById('operator-access-requests'), null);
    assert.equal(h.d.querySelector('#operator-invite-result textarea'), null);
    assert.deepEqual(h.errors, []);
  } finally { h.close(); }
});

test('existing operator invitation also returns a copyable private link rather than a raw code', async () => {
  const h = harness({state: operatorState(), handle: async name => name === 'operator_invite' ? response({ok: true, result: 'ok', invite_token: INVITATION, invitation_id: MEMBER_ID}) : undefined});
  try {
    await h.login();
    const form = h.d.getElementById('operator-invitation');
    form.elements.email.value = 'invited@example.test';
    send(h, form);
    await waitFor(() => h.d.querySelector('#operator-invite-result textarea'));
    assert.equal(h.d.querySelector('#operator-invite-result textarea').value, ORIGIN + '/community/members/#invite=' + INVITATION);
    assert.match(h.d.getElementById('operator-invite-result').textContent, /not been sent/i);
    assert.deepEqual(h.errors, []);
  } finally { h.close(); }
});


test('sign-in bookmark and entry choices show one account path while preserving in-tab drafts', () => {
  const direct = harness({fragment: '#member-signin-panel'});
  try {
    assert.equal(direct.d.getElementById('member-signin-panel').hidden, false);
    assert.equal(direct.d.getElementById('member-access-request-panel').hidden, true);
    assert.equal(direct.d.getElementById('member-create-panel').hidden, true);
    assert.equal(direct.calls.length, 0);
  } finally { direct.close(); }
  const h = harness();
  try {
    fillRequest(h);
    h.d.getElementById('member-choice-signin').click();
    assert.equal(h.d.getElementById('member-signin-panel').hidden, false);
    assert.equal(h.d.getElementById('member-access-request-panel').hidden, true);
    assert.equal(h.d.getElementById('member-create-panel').hidden, true);
    assert.equal(h.d.activeElement.id, 'member-signin-panel');
    h.d.getElementById('member-choice-invite').click();
    assert.equal(h.d.getElementById('member-signin-panel').hidden, true);
    assert.equal(h.d.getElementById('member-create-panel').hidden, false);
    h.d.getElementById('member-choice-request').click();
    assert.equal(h.d.getElementById('member-access-request').elements.email.value, 'reader@example.test');
    assert.equal(h.d.getElementById('member-access-request').elements.privacy_acknowledged.checked, true);
    assert.equal(h.calls.length, 0);
    assert.deepEqual(h.errors, []);
  } finally { h.close(); }
});

test('waiting applicant can refresh into approval without being asked for an account or triggering mail', async () => {
  let state = 'awaiting_review';
  const h = harness({fragment: '#access_token=' + ACCESS_TOKEN, handle: async name => name === 'access_inspect' ? response({ok: true, result: 'ok', state, revision: 2, can_confirm: false, can_withdraw: true, claimed: false, consent_version: CONSENT_VERSION}) : undefined});
  try {
    await waitFor(() => h.d.getElementById('member-access-title').textContent.includes('waiting for review'));
    assert.equal(h.d.getElementById('member-login-panel').hidden, true);
    assert.equal(h.d.getElementById('member-management-signin').hidden, true);
    assert.match(h.d.getElementById('member-access-next').textContent, /do not need a password/);
    assert.match(h.d.getElementById('member-status').textContent, /waiting for review/);
    state = 'approved';
    clickText(h, 'Refresh request status');
    await waitFor(() => h.d.getElementById('member-access-title').textContent.startsWith('Approved.'));
    assert.match(h.d.getElementById('member-access-status').textContent, /does not automatically send an email or create an account/);
    assert.match(h.d.getElementById('member-access-next').textContent, /private invitation link shared by the operator/);
    assert.match(h.d.getElementById('member-access-next').textContent, /ask the operator for a new private invitation/);
    assert.equal(h.d.getElementById('member-management-signin').hidden, true);
    assert.deepEqual(h.calls.map(call => call.body.action), ['access_inspect', 'access_inspect']);
    assert.ok(h.calls.every(call => call.fragmentAtFetch === '' && !call.headers.Authorization));
    assert.deepEqual(h.errors, []);
  } finally { h.close(); }
});

test('expired and temporarily unavailable confirmation states give truthful next steps without confirming', async t => {
  for (const expired of [true, false]) await t.test(expired ? 'expired' : 'unavailable', async () => {
    const h = harness({fragment: '#access_token=' + ACCESS_TOKEN, handle: async name => name === 'access_inspect' ? response({ok: true, result: 'ok', state: 'awaiting_email', revision: 0, can_confirm: false, can_withdraw: true, claimed: false, expires_at: new Date(Date.now() + (expired ? -60000 : 60000)).toISOString(), consent_version: CONSENT_VERSION}) : undefined});
    try {
      await waitFor(() => h.d.getElementById('member-access-title').textContent !== 'Check your request');
      assert.match(h.d.getElementById('member-access-title').textContent, expired ? /expired/ : /unavailable/);
      assert.match(h.d.getElementById('member-access-next').textContent, expired ? /request a new confirmation email/ : /Refresh the status/);
      assert.equal([...h.d.querySelectorAll('#member-access-controls button')].some(button => button.textContent === 'Confirm my access request'), false);
      assert.equal(action(h, 'access_confirm'), undefined);
      assert.equal(h.d.getElementById('member-management-signin').hidden, true);
      assert.deepEqual(h.errors, []);
    } finally { h.close(); }
  });
});

test('claimed invitation directs the existing member to sign in without another request or account creation', async () => {
  const h = harness({fragment: '#access_token=' + ACCESS_TOKEN, handle: async name => name === 'access_inspect' ? response({ok: true, result: 'ok', state: 'approved', revision: 2, can_confirm: false, can_withdraw: false, claimed: true, consent_version: CONSENT_VERSION}) : undefined});
  try {
    await waitFor(() => !h.d.getElementById('member-management-signin').hidden);
    assert.match(h.d.getElementById('member-access-title').textContent, /invitation has been used/);
    clickText(h, 'Open member sign in');
    assert.equal(h.d.getElementById('member-access-management').hidden, true);
    assert.equal(h.d.getElementById('member-signin-panel').hidden, false);
    assert.equal(h.d.getElementById('member-access-request-panel').hidden, true);
    assert.equal(h.d.getElementById('member-create-panel').hidden, true);
    assert.deepEqual(h.calls.map(call => call.body.action), ['access_inspect']);
    assert.deepEqual(h.errors, []);
  } finally { h.close(); }
});


test('request status failures retain an explicit read-only retry instead of asking the applicant to reapply', async () => {
  let unavailable = true;
  const h = harness({fragment: '#access_token=' + ACCESS_TOKEN, handle: async name => name === 'access_inspect' ? unavailable ? response({ok: false, code: 'TEMPORARILY_UNAVAILABLE'}, 503) : response({ok: true, result: 'ok', state: 'approved', revision: 2, can_confirm: false, can_withdraw: true, claimed: false, consent_version: CONSENT_VERSION}) : undefined});
  try {
    await waitFor(() => h.d.getElementById('member-access-title').textContent === 'Request status unavailable');
    assert.equal(h.d.getElementById('member-login-panel').hidden, true);
    assert.equal(h.d.getElementById('member-management-signin').hidden, true);
    unavailable = false;
    clickText(h, 'Refresh request status');
    await waitFor(() => h.d.getElementById('member-access-title').textContent.startsWith('Approved.'));
    assert.deepEqual(h.calls.map(call => call.body.action), ['access_inspect', 'access_inspect']);
    assert.deepEqual(h.errors, []);
  } finally { h.close(); }
});
