import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createHandler as createMemberHandler, createSignupSender } from '../supabase/functions/kapukai-members/handler.mjs';
import { createAuthenticator, PROJECT_URL } from '../supabase/functions/kapukai-members/auth.mjs';
import { createHandler as createAccessHandler, createInvitationSender } from '../supabase/functions/kapukai-member-access/handler.mjs';
import { setup, enable, O, A } from './member-db-harness.mjs';

const ORIGIN = 'https://kapukai-community.vercel.app';
const MEMBER_PAGE = ORIGIN + '/community/members/';
const MEMBERS = PROJECT_URL + '/functions/v1/kapukai-members';
const ACCESS = PROJECT_URL + '/functions/v1/kapukai-member-access';
const NEW_USER = '55555555-5555-4555-8555-555555555555';
const EMAIL = 'invited-participant@example.test';
const OTP = '123456';
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
async function until(check, detail) {
  for (let i = 0; i < 500; i++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Did not reach ' + detail);
}
function invitationSendReady(page) {
  const area = page.d.querySelector('section[aria-label="Invitation email"]');
  const preview = area?.querySelector('.member-preview');
  const send = [...(area?.querySelectorAll('button') || [])].find(button => button.textContent === 'Send invitation email');
  return Boolean(preview && !preview.closest('[hidden]') && send && !send.disabled && !send.closest('[hidden]'));
}

// Auth and Postmark transports are controlled local substitutes. Application
// HTML/JS, Edge request validation, role checks, SQL state and joins are real.
test('operator explicitly emails a created invitation; the emailed link completes verified signup and retries cannot send duplicate mail', async () => {
  const db = await setup(), pages = [], invitations = [], signupMails = [];
  const clock = Date.now();
  let serial = Promise.resolve();
  const sql = (query, parameters = [], asService = false) => {
    const pending = serial.then(async () => {
      if (asService) await db.exec('set role service_role');
      try { return await db.query(query, parameters); }
      finally { if (asService) await db.exec('reset role'); }
    });
    serial = pending.catch(() => {});
    return pending;
  };
  const scalar = async (query, parameters = []) => (await sql(query, parameters)).rows[0].value;
  const tokenFor = user => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    return encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: user, session_id: user, role: 'authenticated', aud: 'authenticated', iss: PROJECT_URL + '/auth/v1', iat: Math.floor(clock / 1000), exp: Math.floor(clock / 1000) + 1800 }) + '.synthetic_signature';
  };
  const argsByRpc = {
    kapukai_member_command: ['p_user_id', 'p_session_id', 'p_action', 'p_payload'],
    kapukai_member_public: [],
    kapukai_member_signup_check: ['p_email', 'p_invite_token'],
    kapukai_member_access_operator: ['p_user_id', 'p_session_id', 'p_action', 'p_payload'],
    kapukai_member_invitation_delivery: ['p_user_id', 'p_session_id', 'p_action', 'p_payload'],
    kapukai_member_invitation_mail_result: ['p_delivery_id', 'p_state', 'p_provider_message_id'],
  };
  const rpc = async (name, args) => {
    assert.ok(Object.hasOwn(argsByRpc, name), 'RPC is explicitly allowed: ' + name);
    const values = argsByRpc[name].map(key => args[key] && typeof args[key] === 'object' ? JSON.stringify(args[key]) : args[key]);
    return (await sql('select public.' + name + '(' + values.map((_, i) => '$' + (i + 1)).join(',') + ') value', values, true)).rows[0].value;
  };
  const authTransport = async (url, options = {}) => {
    const path = String(url), body = options.body ? JSON.parse(options.body) : {};
    if (path.endsWith('/auth/v1/admin/generate_link')) {
      assert.equal(body.type, 'signup'); assert.equal(body.email, EMAIL);
      await sql('insert into auth.users(id,email) values($1,$2)', [NEW_USER, EMAIL]);
      return response({ email: EMAIL, email_otp: OTP, verification_type: 'signup' });
    }
    if (path === 'https://api.postmarkapp.com/email') {
      signupMails.push(body); assert.equal(body.To, EMAIL);
      return response({ ErrorCode: 0, MessageID: '99999999-9999-4999-8999-999999999999' });
    }
    if (path.endsWith('/auth/v1/user')) {
      const identity = JSON.parse(Buffer.from(options.headers.authorization.split('.')[1], 'base64url').toString()).sub;
      const rows = (await sql('select * from auth.users where id=$1', [identity])).rows;
      return rows.length ? response(rows[0]) : response({}, 401);
    }
    if (path.includes('/auth/v1/token?grant_type=password')) {
      assert.equal(body.email, 'owner@example.test');
      return response({ access_token: tokenFor(O), expires_in: 1800 });
    }
    if (path.endsWith('/auth/v1/verify')) {
      assert.deepEqual(body, { email: EMAIL, token: OTP, type: 'signup' });
      await sql('update auth.users set email_confirmed_at=now() where id=$1', [NEW_USER]);
      await sql("insert into auth.sessions(id,user_id,not_after) values($1,$1,now()+interval '1 day')", [NEW_USER]);
      return response({ access_token: tokenFor(NEW_USER), expires_in: 1800 });
    }
    throw new Error('Unexpected Auth transport: ' + path);
  };
  try {
    await db.exec(await readFile(new URL('../sql/member_access_requests.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../sql/member_invitation_delivery.sql', import.meta.url), 'utf8'));
    assert.equal((await enable(db)).result, 'ok');
    const getConfig = () => ({ baseUrl: PROJECT_URL, publishableKey: 'sb_publishable_test' });
    const authenticate = createAuthenticator({ ...getConfig(), fetchImpl: authTransport, clock: () => clock });
    const memberHandler = createMemberHandler({ authenticate, rpc, getConfig, sendSignup: createSignupSender({ baseUrl: PROJECT_URL, serviceKey: 'sb_secret_test', providerToken: 'synthetic-postmark', from: 'test@example.test', fetchImpl: authTransport }) });
    const accessHandler = createAccessHandler({ authenticate, rpc, clock: () => clock, sendInvitation: createInvitationSender({ providerToken: 'synthetic-postmark', from: 'test@example.test', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.postmarkapp.com/email');
      const message = JSON.parse(options.body); invitations.push(message);
      assert.equal(message.TrackOpens, false); assert.equal(message.TrackLinks, 'None');
      return response({ ErrorCode: 0, MessageID: '88888888-8888-4888-8888-' + String(invitations.length).padStart(12, '0') });
    } }) });
    const pageBodies = JSON.parse(execFileSync('python', ['-c', "import runpy,json; p={}; runpy.run_path('community/member_pages.py')['build_members'](lambda path,title,description,body,script:p.update({path:body})); print(json.dumps(p))"], { cwd: new URL('../../../', import.meta.url), encoding: 'utf8' }));
    const html = '<!doctype html><html><body>' + pageBodies['community/members'] + '</body></html>';
    const script = await readFile(new URL('../../assets/members.js', import.meta.url), 'utf8');
    const visit = url => {
      const errors = [], calls = [];
      const dom = new JSDOM(html, { url, runScripts: 'outside-only', virtualConsole: new VirtualConsole().on('jsdomError', e => errors.push(e.message)) });
      const w = dom.window, d = w.document;
      w.AbortSignal = AbortSignal; w.Date.now = () => clock;
      Object.defineProperty(w, 'crypto', { value: webcrypto });
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async () => {} } });
      for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(w, key, { get() { throw Error('No private token storage permitted'); } });
      w.fetch = async (target, options = {}) => {
        assert.ok(!/invite=|access_token=/.test(w.location.hash), 'Private fragment removed before network request');
        const body = options.body ? JSON.parse(options.body) : {}; calls.push({ target: String(target), body });
        if (String(target).startsWith(PROJECT_URL + '/auth/v1/')) return authTransport(target, options);
        assert.ok([ACCESS, MEMBERS].includes(String(target)));
        return (String(target) === ACCESS ? accessHandler : memberHandler)(new Request(target, { ...options, headers: { ...options.headers, Origin: ORIGIN } }));
      };
      w.eval(script);
      const page = { dom, w, d, calls, errors, submit: form => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })), button: label => { const button = [...d.querySelectorAll('button')].find(b => b.textContent === label); assert.ok(button, 'Button exists: ' + label); return button; } };
      pages.push(page); return page;
    };
    const callAccess = async (action, payload, actor = O) => accessHandler(new Request(ACCESS, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + tokenFor(actor) } : {}) }, body: JSON.stringify({ action, payload }) }));
    const operator = visit(MEMBER_PAGE), login = operator.d.getElementById('member-login');
    login.elements.email.value = 'owner@example.test'; login.elements.password.value = 'synthetic-operator-password'; operator.submit(login);
    await until(() => operator.d.getElementById('operator-invitation'), 'operator invitation form');
    const inviteForm = operator.d.getElementById('operator-invitation');
    inviteForm.elements.email.value = EMAIL; inviteForm.elements.expires_days.value = '7'; operator.submit(inviteForm);
    await until(() => operator.d.querySelector('#operator-invite-result textarea')?.value.includes('#invite='), 'created invitation');
    const invitationURL = operator.d.querySelector('#operator-invite-result textarea').value;
    const inviteToken = invitationURL.split('#invite=')[1];
    assert.equal(invitations.length, 0, 'Creating a link never implicitly sends mail');
    assert.equal(await scalar('select count(*)::integer value from kapukai_members.members'), 0);
    const sendPayload = { email: EMAIL, invite_token: inviteToken, delivery_id: '77777777-7777-4777-8777-777777777777' };
    assert.equal((await callAccess('operator_invitation_send', sendPayload, null)).status, 401);
    assert.equal((await callAccess('operator_invitation_send', sendPayload, A)).status, 403);
    assert.equal((await callAccess('operator_invitation_send', { ...sendPayload, email: 'other@example.test' })).ok, false);
    assert.equal(invitations.length, 0, 'Unauthenticated, ordinary, or mismatched-recipient requests never send');
    operator.button('Preview invitation email').click();
    await until(() => invitationSendReady(operator), 'checked visible preview with enabled send action');
    assert.ok(operator.calls.some(c => c.body.action === 'operator_invitation_status'), 'Fresh invitation preview checks current status before allowing send');
    assert.equal(invitations.length, 0, 'Opening the preview never sends');
    operator.button('Send invitation email').click();
    await until(() => invitations.length === 1, 'one invitation provider handoff');
    await until(() => /accepted/i.test(operator.d.getElementById('operator-invite-result').textContent), 'visible accepted status');
    assert.equal(invitations[0].To, EMAIL);
    assert.equal(invitations[0].Subject, 'Your Kapukai member invitation');
    const emailedURL = invitations[0].TextBody.match(/https:\/\/kapukai-community\.vercel\.app\/community\/members\/#invite=[a-f0-9]{64}/)?.[0];
    assert.equal(emailedURL, invitationURL, 'The email carries the exact active invitation');
    const sentCall = operator.calls.find(c => c.body.action === 'operator_invitation_send');
    assert.ok(sentCall);
    const replay = await callAccess('operator_invitation_send', sentCall.body.payload);
    assert.equal(replay.status, 200); assert.equal((await replay.json()).delivery_state, 'accepted');
    const duplicate = await callAccess('operator_invitation_send', { ...sentCall.body.payload, delivery_id: '66666666-6666-4666-8666-666666666666' });
    assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).delivery_state, 'accepted');
    assert.equal(invitations.length, 1, 'Same or fresh request IDs cannot resend an accepted invitation');
    const status = await callAccess('operator_invitation_status', { email: EMAIL, invite_token: inviteToken });
    assert.equal((await status.json()).delivery_state, 'accepted');
    assert.equal(invitations.length, 1, 'Checking status is read-only');

    // Reproduce the reported situation: a code was created, the operator left
    // the page, and the recipient never received mail. The saved code can be
    // checked and emailed explicitly without creating a replacement invitation.
    const secondEmail = 'second-participant@example.test';
    inviteForm.elements.email.value = secondEmail; inviteForm.elements.expires_days.value = '7'; operator.submit(inviteForm);
    await until(() => operator.d.querySelector('#operator-invite-result textarea')?.value !== invitationURL, 'second invitation');
    const savedInvitationURL = operator.d.querySelector('#operator-invite-result textarea').value;
    assert.equal(invitations.length, 1, 'Creating another code does not send');
    operator.dom.window.close();
    const returning = visit(MEMBER_PAGE), returnLogin = returning.d.getElementById('member-login');
    returnLogin.elements.email.value = 'owner@example.test'; returnLogin.elements.password.value = 'synthetic-operator-password'; returning.submit(returnLogin);
    await until(() => returning.d.getElementById('operator-existing-invitation'), 'existing invitation recovery form');
    const recover = returning.d.getElementById('operator-existing-invitation');
    recover.elements.email.value = secondEmail; recover.elements.invitation.value = savedInvitationURL; returning.submit(recover);
    await until(() => returning.d.querySelector('#operator-invite-result textarea')?.value === savedInvitationURL, 'existing invitation preview');
    assert.ok(returning.calls.some(c => c.body.action === 'operator_invitation_status'));
    assert.equal(returning.calls.some(c => c.body.action === 'operator_invitation_send'), false);
    assert.equal(invitations.length, 1, 'Checking a saved code only opens the preview');
    assert.equal(recover.elements.invitation.value, '', 'The recovery field is cleared after checking');
    await until(() => invitationSendReady(returning), 'checked existing invitation preview with enabled send action');
    returning.button('Send invitation email').click();
    await until(() => invitations.length === 2, 'saved-code invitation handoff');
    await until(() => /accepted/i.test(returning.d.querySelector('section[aria-label="Invitation email"] .form-status').textContent), 'saved-code accepted status');
    assert.equal(invitations[1].To, secondEmail);
    assert.ok(invitations[1].TextBody.includes(savedInvitationURL));
    assert.equal(await scalar('select count(*)::integer value from kapukai_members.invitations'), 2, 'Recovery does not mint a replacement');

    const invited = visit(emailedURL), create = invited.d.getElementById('member-create');
    assert.equal(invited.w.location.hash, ''); assert.equal(create.elements.invite_token.value, inviteToken);
    assert.equal(invited.calls.length, 0, 'Opening the email does not create an account or join');
    create.elements.email.value = EMAIL; create.elements.display_name.value = 'Invited participant'; create.elements.password.value = 'synthetic-member-password';
    create.elements.adult.checked = true; create.elements.privacy_acknowledged.checked = true; invited.submit(create);
    await until(() => invited.d.getElementById('member-verify'), 'recipient verification form');
    assert.equal(signupMails.length, 1); assert.match(signupMails[0].TextBody, new RegExp(OTP));
    assert.equal(await scalar('select count(*)::integer value from kapukai_members.members'), 0, 'Email handoff and account creation alone do not join');
    const verify = invited.d.getElementById('member-verify'); verify.elements.code.value = OTP; invited.submit(verify);
    await until(() => invited.d.getElementById('profile-form'), 'verified member workspace');
    const profile = (await rpc('kapukai_member_command', { p_user_id: NEW_USER, p_session_id: NEW_USER, p_action: 'state', p_payload: {} })).profile;
    assert.equal(profile.discoverable, false); assert.equal(profile.reviewer_opt_in, false);
    assert.equal(await scalar('select count(*)::integer value from kapukai_members.members'), 1);
    assert.equal(invitations.length, 2);
    for (const page of pages) assert.deepEqual(page.errors, []);
  } finally {
    for (const page of pages) page.dom.window.close();
    await serial; await db.close();
  }
});
