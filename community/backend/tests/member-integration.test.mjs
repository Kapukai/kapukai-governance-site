import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createHandler } from '../supabase/functions/kapukai-members/handler.mjs';
import { setup, enable, cmd, O, A, B } from './member-db-harness.mjs';

const ORIGIN = 'https://kapukai-community.vercel.app';
const ENDPOINT = 'https://tbxfsjipkrdwyctepesf.supabase.co/functions/v1/kapukai-members';
const pause = () => new Promise(resolve => setTimeout(resolve, 10));
async function until(check) { for (let i=0;i<250;i++) { if (check()) return; await pause(); } throw Error('Expected UI state was not reached'); }

test('built member page, real Edge validator and SQL complete invitation, room and exact public-feedback loop', async () => {
  const db = await setup(); let dom;
  try {
    assert.equal((await enable(db)).result, 'ok');
    const invitation = await cmd(db,O,'operator_invite',{email:'alice@example.test',expires_days:7});
    await db.exec('set role service_role');
    const handler = createHandler({
      getConfig: () => ({baseUrl:'https://tbxfsjipkrdwyctepesf.supabase.co',publishableKey:'sb_publishable_test'}),
      authenticate: async request => {
        const user = request.headers.get('authorization')?.slice(7);
        if (![O,A,B].includes(user)) throw Error('No synthetic principal');
        return {user_id:user,session_id:user};
      },
      rpc: async (name,p) => {
        if(name==='kapukai_member_public') return (await db.query('select kapukai_member_public() r')).rows[0].r;
        assert.equal(name,'kapukai_member_command');
        return (await db.query('select kapukai_member_command($1,$2,$3,$4::jsonb) r',[p.p_user_id,p.p_session_id,p.p_action,JSON.stringify(p.p_payload)])).rows[0].r;
      }
    });
    async function api(user,action,payload={}) {
      const response=await handler(new Request(ENDPOINT,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json',...(user?{Authorization:'Bearer '+user}:{})},body:JSON.stringify({action,payload})}));
      return {status:response.status,...await response.json()};
    }
    const html=await readFile(new URL('../../public/community/members/index.html',import.meta.url),'utf8');
    const script=await readFile(new URL('../../public/assets/community/members.js',import.meta.url),'utf8');
    dom=new JSDOM(html,{url:ORIGIN+'/community/members/',runScripts:'outside-only'});
    const w=dom.window,d=w.document;
    w.AbortSignal=AbortSignal;
    w.fetch=async (url,options)=>{
      if(String(url).includes('/auth/v1/token')) return new Response(JSON.stringify({access_token:A,expires_in:1800}));
      return handler(new Request(url,{...options,headers:{...options.headers,Origin:ORIGIN}}));
    };
    const submit=f=>f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    w.eval(script);
    const login=d.getElementById('member-login');login.elements.email.value='alice@example.test';login.elements.password.value='synthetic-password';submit(login);
    await until(()=>!d.getElementById('member-join-panel').hidden);
    const join=d.getElementById('member-join');join.elements.invite_token.value=invitation.invite_token;join.elements.display_name.value='Alice';join.elements.adult.checked=true;join.elements.privacy_acknowledged.checked=true;submit(join);
    await until(()=>d.getElementById('profile-form')&&!d.getElementById('member-refresh').disabled);
    assert.equal((await api(A,'state')).profile.discoverable,false);
    const roomJoin=[...d.querySelectorAll('#member-section-rooms button')].find(b=>b.textContent==='Join room');roomJoin.click();
    await until(()=>[...d.querySelectorAll('#member-section-rooms button')].some(b=>b.textContent==='Open room')&&!d.getElementById('member-refresh').disabled);
    [...d.querySelectorAll('#member-section-rooms button')].find(b=>b.textContent==='Open room').click();
    await until(()=>d.querySelector('form[id^="post-form-"]'));
    const post=d.querySelector('form[id^="post-form-"]');post.elements.body.value='A synthetic lesson about checking sources.';submit(post);
    await until(()=>d.getElementById('member-status').textContent.includes('saved in this room'));
    assert.equal((await api(B,'room_posts',{room_id:'commons'})).status,403);
    const feedback=d.getElementById('feedback-new');feedback.elements.body.value='The source checking exercise helped.';submit(feedback);
    await until(()=>d.getElementById('member-status').textContent.includes('saved privately'));
    const entry=(await api(A,'state')).feedback[0];
    assert.equal((await api(null,'public')).feedback.length,0);
    assert.equal((await api(O,'operator_feedback_propose',{feedback_id:entry.id,excerpt:'The exercise helped.'})).status,200);
    d.getElementById('member-refresh').click();
    await until(()=>d.querySelector('form[id^="feedback-consent-"]')&&!d.getElementById('member-refresh').disabled);
    const consent=d.querySelector('form[id^="feedback-consent-"]');consent.elements.consent.checked=true;submit(consent);
    await until(()=>d.getElementById('member-status').textContent.includes('permission'));
    const approved=(await api(A,'state')).feedback[0];
    assert.equal((await api(null,'public')).feedback.length,0);
    assert.equal((await api(O,'operator_feedback_publish',{feedback_id:entry.id,version:approved.version})).status,200);
    const publicEntry=(await api(null,'public')).feedback[0];assert.equal(publicEntry.excerpt,'The exercise helped.');assert.equal(publicEntry.body,undefined);assert.equal(publicEntry.member_id,undefined);
    assert.equal((await api(A,'feedback_withdraw',{feedback_id:entry.id})).status,200);
    assert.equal((await api(null,'public')).feedback.length,0);
  } finally { dom?.window.close(); await db.close(); }
});
