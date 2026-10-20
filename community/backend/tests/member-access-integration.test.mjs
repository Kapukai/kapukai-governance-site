import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac, webcrypto } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createHandler as createMemberHandler, createSignupSender } from '../supabase/functions/kapukai-members/handler.mjs';
import { createAuthenticator, PROJECT_URL } from '../supabase/functions/kapukai-members/auth.mjs';
import { createHandler as createAccessHandler, createConfirmationSender } from '../supabase/functions/kapukai-member-access/handler.mjs';
import { setup, enable, O } from './member-db-harness.mjs';

const ORIGIN = 'https://kapukai-community.vercel.app';
const MEMBERS = PROJECT_URL + '/functions/v1/kapukai-members';
const ACCESS = PROJECT_URL + '/functions/v1/kapukai-member-access';
const NEW_USER = '55555555-5555-4555-8555-555555555555';
const EMAIL = 'new-requester@example.test';
const OTP = '123456';
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(check, detail = 'expected state') {
  for (let i = 0; i < 400; i++) { if (await check()) return; await pause(); }
  throw new Error('Did not reach ' + detail);
}

test('shared member link completes request, explicit email confirmation, operator approval and invited account creation using real Edge and SQL', async () => {
  const db = await setup();
  const pages = [], mails = [], signupMails = [], transportCalls = [];
  let clock = Date.now(), serial = Promise.resolve();
  const sql = (query, parameters = [], role = null) => {
    const work = serial.then(async () => {
      if (role) await db.exec('set role service_role');
      try { return await db.query(query, parameters); }
      finally { if (role) await db.exec('reset role'); }
    });
    serial = work.catch(() => {});
    return work;
  };
  const scalar = async (query, parameters = []) => (await sql(query, parameters)).rows[0].value;
  const tokenFor = user => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    return encode({alg:'HS256',typ:'JWT'}) + '.' + encode({sub:user,session_id:user,role:'authenticated',aud:'authenticated',iss:PROJECT_URL+'/auth/v1',iat:Math.floor(clock/1000),exp:Math.floor(clock/1000)+1800}) + '.synthetic_signature';
  };
  const response = (value, status = 200) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json'}});
  const authTransport = async (url, options = {}) => {
    const path = String(url), body = options.body ? JSON.parse(options.body) : {};
    transportCalls.push(path);
    if (path.endsWith('/auth/v1/admin/generate_link')) {
      assert.equal(body.type, 'signup');
      assert.equal(body.email, EMAIL);
      assert.equal(body.password, 'synthetic-member-password');
      assert.equal(await scalar('select count(*)::integer value from kapukai_members.invitations'), 1);
      await sql('insert into auth.users(id,email) values($1,$2)', [NEW_USER, EMAIL]);
      return response({email:EMAIL,email_otp:OTP,verification_type:'signup'});
    }
    if (path === 'https://api.postmarkapp.com/email') {
      signupMails.push(body);
      assert.equal(body.To, EMAIL);
      assert.equal(body.TrackOpens, false);
      assert.equal(body.TrackLinks, 'None');
      return response({ErrorCode:0,MessageID:'99999999-9999-4999-8999-999999999999'});
    }
    if (path.endsWith('/auth/v1/user')) {
      const bearer = options.headers?.authorization;
      const identity = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()).sub;
      const users = (await sql('select * from auth.users where id=$1', [identity])).rows;
      return users.length ? response(users[0]) : response({}, 401);
    }
    if (path.includes('/auth/v1/token?grant_type=password')) {
      assert.equal(body.email, 'owner@example.test');
      return response({access_token:tokenFor(O),expires_in:1800});
    }
    if (path.endsWith('/auth/v1/verify')) {
      assert.deepEqual(body, {email:EMAIL,token:OTP,type:'signup'});
      await sql('update auth.users set email_confirmed_at=now() where id=$1', [NEW_USER]);
      await sql('insert into auth.sessions(id,user_id,not_after) values($1,$1,now()+interval \'1 day\')', [NEW_USER]);
      return response({access_token:tokenFor(NEW_USER),expires_in:1800});
    }
    throw new Error('Unexpected synthetic Auth transport: ' + path);
  };
  const rpcArguments = {
    kapukai_member_command:['p_user_id','p_session_id','p_action','p_payload'],
    kapukai_member_public:[],
    kapukai_member_signup_check:['p_email','p_invite_token'],
    kapukai_claim_signup_attempt:['p_fingerprint','p_limit'],
    kapukai_member_access_is_open:[],
    kapukai_member_access_request:['p_email','p_display_name','p_request_id','p_token_hash','p_consent_version','p_adult','p_privacy_acknowledged','p_human_review_acknowledged'],
    kapukai_member_access_token:['p_token_hash','p_action'],
    kapukai_member_access_mail_result:['p_access_request_id','p_state','p_provider_message_id'],
    kapukai_member_access_operator:['p_user_id','p_session_id','p_action','p_payload'],
  };
  const rpc = async (name, args) => {
    assert.ok(Object.hasOwn(rpcArguments, name), 'RPC is explicitly allowed');
    const values = rpcArguments[name].map(key => typeof args[key] === 'object' && args[key] !== null ? JSON.stringify(args[key]) : args[key]);
    return (await sql('select public.'+name+'('+values.map((_,i)=>'$'+(i+1)).join(',')+') value', values, 'service_role')).rows[0].value;
  };
  try {
    await db.exec(await readFile(new URL('../sql/member_access_requests.sql', import.meta.url), 'utf8'));
    // Local fixture for the pre-existing service-only durable rate RPC. The new
    // access migration also enforces its own address/global limits independently.
    await db.exec(`create table public.access_rate_fixture(fingerprint text primary key,hits integer not null);
      create function public.kapukai_claim_signup_attempt(p_fingerprint text,p_limit integer) returns boolean
      language plpgsql security definer set search_path='' as $$declare n integer;begin
      insert into public.access_rate_fixture values(p_fingerprint,1) on conflict(fingerprint)
      do update set hits=access_rate_fixture.hits+1 returning hits into n;return n<=p_limit;end $$;
      revoke all on function public.kapukai_claim_signup_attempt(text,integer) from public,anon,authenticated;
      grant execute on function public.kapukai_claim_signup_attempt(text,integer) to service_role;`);
    assert.equal((await enable(db)).result, 'ok');
    const getConfig = () => ({baseUrl:PROJECT_URL,publishableKey:'sb_publishable_test'});
    const authenticate = createAuthenticator({...getConfig(),fetchImpl:authTransport,clock:()=>clock});
    const memberHandler = createMemberHandler({authenticate,rpc,getConfig,sendSignup:createSignupSender({baseUrl:PROJECT_URL,serviceKey:'sb_secret_test',providerToken:'synthetic-postmark',from:'test@example.test',fetchImpl:authTransport})});
    const accessHandler = createAccessHandler({authenticate,rpc,clock:()=>clock,rateFingerprint:async value=>createHmac('sha256','synthetic-rate-key').update(value).digest('hex'),sendConfirmation:createConfirmationSender({providerToken:'synthetic-postmark',from:'test@example.test',fetchImpl:async (url,options)=>{assert.equal(url,'https://api.postmarkapp.com/email');const message=JSON.parse(options.body);mails.push(message);assert.equal(message.To,EMAIL);assert.equal(message.TrackOpens,false);assert.equal(message.TrackLinks,'None');return response({ErrorCode:0,MessageID:'88888888-8888-4888-8888-888888888888'});}})});
    const html = await readFile(new URL('../../public/community/members/index.html', import.meta.url), 'utf8');
    const script = await readFile(new URL('../../public/assets/community/members.js', import.meta.url), 'utf8');
    const visit = url => {
      const errors=[], calls=[];
      const dom = new JSDOM(html,{url,runScripts:'outside-only',virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(e.message))});
      const w=dom.window,d=w.document;
      w.AbortSignal=AbortSignal;w.Date.now=()=>clock;
      Object.defineProperty(w,'crypto',{value:webcrypto});
      for (const key of ['localStorage','sessionStorage']) Object.defineProperty(w,key,{get(){throw Error('No token storage permitted');}});
      w.fetch=async (target, options={})=>{
        assert.equal(w.location.hash,'','Private fragment removed before network request');
        const body=options.body?JSON.parse(options.body):{};
        calls.push({url:String(target),body});
        if(String(target).startsWith(PROJECT_URL+'/auth/v1/'))return authTransport(target,options);
        const handler=String(target)===ACCESS?accessHandler:memberHandler;
        assert.ok([ACCESS,MEMBERS].includes(String(target)));
        return handler(new Request(target,{...options,headers:{...options.headers,Origin:ORIGIN,'X-Forwarded-For':'192.0.2.1'}}));
      };
      w.eval(script);
      const page={dom,w,d,calls,errors,submit:f=>f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),button:text=>{const b=[...d.querySelectorAll('button')].find(x=>x.textContent===text);assert.ok(b,'Button exists: '+text);return b;}};
      pages.push(page);return page;
    };

    const initialAuthCount = await scalar('select count(*)::integer value from auth.users');
    const first = visit(ORIGIN+'/community/members/');
    const request = first.d.getElementById('member-access-request');
    assert.ok(request, 'Shared link has a request form without account or code');
    assert.equal(request.elements.password, undefined);
    assert.equal(request.elements.invite_token, undefined);
    for (const key of ['adult','privacy_acknowledged','human_review_acknowledged']) assert.equal(request.elements[key].checked,false);
    request.elements.email.value=EMAIL;request.elements.display_name.value='New participant';
    for (const key of ['adult','privacy_acknowledged','human_review_acknowledged']) request.elements[key].checked=true;
    clock+=2000;first.submit(request);
    await until(()=>mails.length===1,'requested confirmation message');
    await until(()=>scalar('select count(*)::integer value from kapukai_members.access_requests').then(n=>n===1),'private request record');
    assert.equal(await scalar('select count(*)::integer value from auth.users'),initialAuthCount);
    assert.equal(await scalar('select count(*)::integer value from kapukai_members.members'),0);
    assert.equal(await scalar('select count(*)::integer value from kapukai_members.invitations'),0);
    assert.equal(transportCalls.length,0,'Requesting access does not call Auth');
    const confirmationURL=String(mails[0].TextBody).match(/https:\/\/kapukai-community\.vercel\.app\/community\/members\/#access_token=[A-Za-z0-9_-]{43}/)?.[0];
    assert.ok(confirmationURL,'Requested email contains private management fragment');
    const confirmation=visit(confirmationURL);
    await until(()=>confirmation.calls.some(c=>c.body.action==='access_inspect'),'inspect on opening');
    await until(()=>confirmation.d.getElementById('member-access-controls')?.textContent.includes('Confirm my access request'),'explicit confirmation control');
    assert.equal(await scalar('select state value from kapukai_members.access_requests'),'awaiting_email');
    assert.equal(confirmation.calls.some(c=>c.body.action==='access_confirm'),false);
    confirmation.button('Confirm my access request').click();
    await until(()=>scalar('select state value from kapukai_members.access_requests').then(s=>s==='awaiting_review'),'confirmed review request');
    assert.equal(await scalar('select count(*)::integer value from auth.users'),initialAuthCount);

    const operator=visit(ORIGIN+'/community/members/');
    const login=operator.d.getElementById('member-login');login.elements.email.value='owner@example.test';login.elements.password.value='synthetic-operator-password';operator.submit(login);
    await until(()=>operator.d.querySelector('form[id^="operator-access-approve-"]'),'operator request review');
    assert.equal(operator.d.getElementById('member-join-panel').hidden,true,'Operator need not become a member');
    const approve=operator.d.querySelector('form[id^="operator-access-approve-"]');
    assert.equal(approve.elements.reviewed.checked,false);
    approve.elements.reviewed.checked=true;operator.submit(approve);
    await until(()=>operator.d.querySelector('#operator-invite-result textarea')?.value.includes('#invite='),'private invitation link');
    const invitationURL=operator.d.querySelector('#operator-invite-result textarea').value;
    assert.match(invitationURL,/^https:\/\/kapukai-community\.vercel\.app\/community\/members\/#invite=[a-f0-9]{64}$/);
    assert.equal(mails.length,1,'Approval does not send another message');
    assert.equal(await scalar('select count(*)::integer value from auth.users'),initialAuthCount);
    assert.equal(await scalar('select count(*)::integer value from kapukai_members.members'),0);
    const publicFeed=await rpc('kapukai_member_public',{});
    assert.deepEqual(publicFeed.feedback,[]);assert.deepEqual(publicFeed.credentials,[]);
    assert.equal(JSON.stringify(publicFeed).includes(EMAIL),false);

    const invited=visit(invitationURL), create=invited.d.getElementById('member-create');
    assert.equal(invited.w.location.hash,'');
    assert.equal(create.elements.invite_token.value,invitationURL.split('#invite=')[1]);
    assert.equal(invited.d.getElementById('member-join').elements.invite_token.value,create.elements.invite_token.value);
    assert.equal(invited.calls.some(c=>['signup','join'].includes(c.body.action)),false);
    assert.equal(create.elements.adult.checked,false);assert.equal(create.elements.privacy_acknowledged.checked,false);
    create.elements.email.value=EMAIL;create.elements.display_name.value='New participant';create.elements.password.value='synthetic-member-password';
    create.elements.adult.checked=true;create.elements.privacy_acknowledged.checked=true;invited.submit(create);
    await until(()=>invited.d.getElementById('member-verify'),'account email verification');
    assert.equal(signupMails.length,1);assert.match(signupMails[0].TextBody,new RegExp(OTP));
    assert.equal(await scalar('select count(*)::integer value from kapukai_members.members'),0);
    assert.equal(await scalar('select email_confirmed_at is null value from auth.users where id=$1',[NEW_USER]),true);
    const verify=invited.d.getElementById('member-verify');verify.elements.code.value=OTP;invited.submit(verify);
    await until(()=>invited.d.getElementById('profile-form'),'verified member workspace');
    assert.equal(await scalar('select count(*)::integer value from kapukai_members.members'),1);
    const profile=(await rpc('kapukai_member_command',{p_user_id:NEW_USER,p_session_id:NEW_USER,p_action:'state',p_payload:{}})).profile;
    assert.equal(profile.discoverable,false);assert.equal(profile.reviewer_opt_in,false);
    assert.equal((await rpc('kapukai_member_public',{})).feedback.length,0);
    for(const p of pages) assert.deepEqual(p.errors,[]);
  } finally {
    for(const page of pages)page.dom.window.close();
    await serial;
    await db.close();
  }
});
