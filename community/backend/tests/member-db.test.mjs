import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,cmd,enable,join,profile,pub,O,A,B,E} from './member-db-harness.mjs';
const ok=r=>assert.equal(r.result,'ok',JSON.stringify(r));
async function members(db){ok(await enable(db));ok(await join(db,A));ok(await join(db,B));}
async function connect(db){await profile(db,A);await profile(db,B);const i=await cmd(db,A,'introduction_request',{member_id:B});ok(i);ok(await cmd(db,B,'introduction_respond',{introduction_id:i.id,accept:true}));}
async function reviewer(db){await profile(db,B,{reviewer_opt_in:true,reviewer_scopes:['independent_review']});const c=await cmd(db,B,'credential_submit',{title:'Engineering credential',issuer:'Test regulator',source_url:'https://example.test/register'});ok(c);ok(await cmd(db,O,'operator_credential_review',{credential_id:c.id,verified:true,scopes:['independent_review'],source_url:'https://example.test/register'}));return c.id;}
async function released(db){const f=await cmd(db,A,'feedback_save',{body:'A private detailed account.'});ok(f);ok(await cmd(db,O,'operator_feedback_propose',{feedback_id:f.id,excerpt:'A helpful experience.'}));let s=await cmd(db,A,'state');let version=s.feedback[0].version;ok(await cmd(db,A,'feedback_consent',{feedback_id:f.id,version,consent:true}));ok(await cmd(db,O,'operator_feedback_publish',{feedback_id:f.id,version}));return {id:f.id,version};}

test('invitation binding, explicit operator, live identity, capacity and outbound signup quota',async()=>{const db=await setup();try{
 assert.equal((await cmd(db,E,'operator_config',{enabled:true,max_members:30})).result,'forbidden');
 ok(await enable(db,1));const i=await cmd(db,O,'operator_invite',{email:'alice@example.test',expires_days:7});ok(i);
 const payload={invite_token:i.invite_token,display_name:'Alice',adult:true,privacy_acknowledged:true};
 assert.equal((await cmd(db,B,'join',payload)).result,'forbidden');
 for(const value of [null,false,'true'])assert.equal((await cmd(db,A,'join',{...payload,adult:value})).result,'invalid');
 const check=(email,token)=>db.query('select kapukai_member_signup_check($1,$2) r',[email,token]).then(x=>x.rows[0].r);
 assert.equal((await check('bob@example.test',i.invite_token)).result,'forbidden');
 for(let n=0;n<3;n++)ok(await check('alice@example.test',i.invite_token));
 assert.equal((await check('alice@example.test',i.invite_token)).result,'rate_limited');
 ok(await cmd(db,A,'join',payload));assert.equal((await join(db,B)).result,'capacity_full');
 assert.equal((await cmd(db,A,'state',{},B)).result,'forbidden');
 await db.query('update auth.users set email_confirmed_at=null where id=$1',[A]);assert.equal((await cmd(db,A,'state')).result,'forbidden');
 await db.query('update auth.users set email_confirmed_at=now(),banned_until=now()+interval \'1 day\' where id=$1',[A]);assert.equal((await cmd(db,A,'state')).result,'forbidden');
 await db.query('update auth.users set banned_until=null where id=$1',[A]);await db.query('update auth.sessions set created_at=now()-interval \'31 minutes\' where user_id=$1',[A]);assert.equal((await cmd(db,A,'state')).result,'forbidden');
 await db.query('update auth.sessions set created_at=now(),not_after=now()-interval \'1 minute\' where user_id=$1',[A]);assert.equal((await cmd(db,A,'state')).result,'forbidden');
 await db.query('delete from auth.sessions where user_id=$1',[A]);assert.equal((await cmd(db,A,'close')).result,'forbidden');
 }finally{await db.close();}});

test('all raw tables/helpers deny ordinary roles and only service can call RPC',async()=>{const db=await setup();try{
 for(const role of ['anon','authenticated','service_role']){await db.exec('set role '+role);
 for(const sql of ['select * from kapukai_members.members','select kapukai_members.snapshot(null,false)','insert into kapukai_members.operators values(gen_random_uuid(),now())']) await assert.rejects(db.query(sql),/permission denied/);
 if(role!=='service_role')for(const sql of ['select kapukai_member_public()',"select kapukai_member_command(null,null,'state','{}')","select kapukai_member_signup_check('a@b.test','x')"])await assert.rejects(db.query(sql),/permission denied/);
 else assert.equal((await cmd(db,O,'state')).result,'ok');await db.exec('reset role');}
 const tables=(await db.query("select count(*)::int n from pg_tables where schemaname='kapukai_members' and not rowsecurity")).rows[0];assert.equal(tables.n,0);
 }finally{await db.close();}});

test('discovery is mutual, rooms explicit, report private, blocks symmetric and posts limited',async()=>{const db=await setup();try{await members(db);
 assert.deepEqual((await cmd(db,A,'state')).discovery,[]);await profile(db,A);assert.deepEqual((await cmd(db,A,'state')).discovery,[]);await profile(db,B);assert.equal((await cmd(db,A,'state')).discovery.length,1);
 assert.equal((await cmd(db,A,'post_create',{room_id:'tools',body:'Not joined'})).result,'forbidden');
 ok(await cmd(db,A,'room_join',{room_id:'tools'}));ok(await cmd(db,B,'room_join',{room_id:'tools'}));const p=await cmd(db,A,'post_create',{room_id:'tools',body:'Synthetic discussion'});ok(p);
 assert.equal((await cmd(db,B,'post_delete',{post_id:p.id})).result,'not_found');ok(await cmd(db,B,'post_report',{post_id:p.id,reason:'Please review this.'}));
 assert.equal((await cmd(db,A,'state')).operator_queue,undefined);assert.equal((await cmd(db,O,'state')).operator_queue.reports.length,1);
 ok(await cmd(db,O,'operator_post_moderate',{post_id:p.id,hide:true,reason:'conduct'}));assert.equal((await cmd(db,B,'room_posts',{room_id:'tools'})).posts.length,0);
 ok(await cmd(db,O,'operator_post_moderate',{post_id:p.id,hide:false,reason:'restored'}));assert.equal((await cmd(db,B,'room_posts',{room_id:'tools'})).posts.length,1);
 ok(await cmd(db,B,'member_block',{member_id:A,blocked:true}));assert.equal((await cmd(db,A,'state')).discovery.length,0);assert.equal((await cmd(db,B,'room_posts',{room_id:'tools'})).posts.length,0);assert.equal((await cmd(db,A,'introduction_request',{member_id:B})).result,'forbidden');
 ok(await cmd(db,B,'member_block',{member_id:A,blocked:false}));assert.equal((await cmd(db,A,'state')).discovery.length,1);
 for(let n=0;n<9;n++)ok(await cmd(db,A,'post_create',{room_id:'tools',body:'Bounded message '+n}));assert.equal((await cmd(db,A,'post_create',{room_id:'tools',body:'Too many'})).result,'rate_limited');
 }finally{await db.close();}});

test('review requires verified scope, request owner choice and independent reviewer acceptance',async()=>{const db=await setup();try{await members(db);await profile(db,A);await profile(db,B,{reviewer_opt_in:true,reviewer_scopes:['independent_review']});
 const r=await cmd(db,A,'request_create',{title:'Review a process',summary:'Synthetic procedural question only.',scope:'independent_review'});ok(r);
 assert.equal((await cmd(db,A,'assignment_propose',{request_id:r.id,reviewer_id:B})).result,'forbidden');const c=await reviewer(db);
 assert.equal((await cmd(db,B,'assignment_propose',{request_id:r.id,reviewer_id:B})).result,'not_found');const a=await cmd(db,A,'assignment_propose',{request_id:r.id,reviewer_id:B});ok(a);
 assert.equal((await cmd(db,A,'assignment_respond',{assignment_id:a.id,accept:true,conflict_free:true})).result,'not_found');
 assert.equal((await cmd(db,B,'assignment_respond',{assignment_id:a.id,accept:true,conflict_free:null})).result,'invalid');assert.equal((await cmd(db,B,'assignment_respond',{assignment_id:a.id,accept:true,conflict_free:false})).result,'invalid');
 ok(await cmd(db,B,'assignment_respond',{assignment_id:a.id,accept:true,conflict_free:true}));assert.equal((await cmd(db,B,'state')).requests.length,1);
 assert.deepEqual((await cmd(db,E,'state')).requests,[]);
 ok(await cmd(db,O,'operator_credential_review',{credential_id:c,verified:false,scopes:[],source_url:'https://example.test/register'}));assert.equal((await cmd(db,B,'state')).requests.length,0);assert.equal((await cmd(db,A,'state')).assignments[0].status,'cancelled');
 }finally{await db.close();}});

test('calendar is private, consent required and overlap checked at acceptance for both people',async()=>{const db=await setup();try{await members(db);await connect(db);
 const start=new Date(Date.now()+86400000), end=new Date(+start+3600000),payload={invitee_id:B,title:'Private review',starts_at:start.toISOString(),ends_at:end.toISOString()};
 const e1=await cmd(db,A,'event_offer',payload),e2=await cmd(db,A,'event_offer',{...payload,title:'Second offer'});ok(e1);ok(e2);
 assert.equal((await cmd(db,A,'event_respond',{event_id:e1.id,accept:true})).result,'not_found');ok(await cmd(db,B,'event_respond',{event_id:e1.id,accept:true}));
 assert.equal((await cmd(db,B,'event_respond',{event_id:e2.id,accept:true})).result,'conflict');assert.deepEqual((await cmd(db,E,'state')).events,[]);
 ok(await cmd(db,A,'event_cancel',{event_id:e1.id}));ok(await cmd(db,B,'event_respond',{event_id:e2.id,accept:true}));
 ok(await cmd(db,B,'member_block',{member_id:A,blocked:true}));assert.deepEqual((await cmd(db,A,'state')).events,[]);
 }finally{await db.close();}});

test('feedback publication binds exact version, human publish, attribution and author withdrawal',async()=>{const db=await setup();try{await members(db);const f=await released(db);assert.equal((await pub(db)).feedback.length,1);
 assert.equal((await cmd(db,B,'feedback_withdraw',{feedback_id:f.id})).result,'not_found');
 ok(await cmd(db,O,'operator_feedback_propose',{feedback_id:f.id,excerpt:'Changed exact excerpt'}));assert.equal((await pub(db)).feedback.length,0);
 assert.equal((await cmd(db,O,'operator_feedback_publish',{feedback_id:f.id,version:f.version+1})).result,'conflict');assert.equal((await cmd(db,A,'feedback_consent',{feedback_id:f.id,version:f.version,consent:true})).result,'conflict');
 ok(await cmd(db,A,'feedback_consent',{feedback_id:f.id,version:f.version+1,consent:true}));ok(await cmd(db,O,'operator_feedback_publish',{feedback_id:f.id,version:f.version+1}));assert.equal((await pub(db)).feedback.length,1);
 ok(await profile(db,A,{display_name:'Changed author name'}));assert.equal((await pub(db)).feedback.length,0);
 const f2=await released(db);ok(await cmd(db,A,'feedback_save',{feedback_id:f2.id,body:'New private corrected wording'}));assert.equal((await pub(db)).feedback.length,0);
 const f3=await released(db);ok(await cmd(db,A,'feedback_withdraw',{feedback_id:f3.id}));assert.equal((await pub(db)).feedback.length,0);
 }finally{await db.close();}});

test('credential claims never publish without verification and separate consent; changes reset consent',async()=>{const db=await setup();try{await members(db);const c=await reviewer(db);
 assert.deepEqual((await pub(db)).credentials,[]);assert.equal((await cmd(db,A,'credential_consent',{credential_id:c,consent:true})).result,'not_found');ok(await cmd(db,B,'credential_consent',{credential_id:c,consent:true}));assert.equal((await pub(db)).credentials.length,1);
 ok(await cmd(db,O,'operator_credential_review',{credential_id:c,verified:true,scopes:['tools'],source_url:'https://example.test/new-source'}));assert.equal((await pub(db)).credentials.length,0);
 ok(await cmd(db,B,'credential_consent',{credential_id:c,consent:true}));ok(await profile(db,B,{display_name:'New name'}));assert.equal((await pub(db)).credentials.length,0);
 }finally{await db.close();}});

test('closing removes visible contributions and relationships; export remains; unrelated auth survives',async()=>{const db=await setup();try{await members(db);await connect(db);const c=await reviewer(db);ok(await cmd(db,B,'credential_consent',{credential_id:c,consent:true}));await released(db);
 ok(await cmd(db,A,'room_join',{room_id:'commons'}));ok(await cmd(db,B,'room_join',{room_id:'commons'}));ok(await cmd(db,A,'post_create',{room_id:'commons',body:'Authored prior to closure'}));
 ok(await cmd(db,A,'close'));assert.equal((await pub(db)).feedback.length,0);assert.equal((await cmd(db,B,'room_posts',{room_id:'commons'})).posts.length,0);assert.equal((await cmd(db,B,'state')).discovery.length,0);
 assert.equal((await profile(db,A)).result,'forbidden');ok(await cmd(db,A,'export'));assert.equal((await db.query('select count(*)::int n from auth.sessions where user_id=$1',[A])).rows[0].n,1);
 ok(await cmd(db,O,'operator_member_suspend',{member_id:B,suspended:true}));assert.equal((await pub(db)).credentials.length,0);assert.equal((await cmd(db,B,'room_posts',{room_id:'commons'})).result,'forbidden');
 }finally{await db.close();}});

test('paused pilot permits targeted withdrawals but no new disclosure or grants',async()=>{const db=await setup();try{await members(db);await connect(db);const c=await reviewer(db);ok(await cmd(db,B,'credential_consent',{credential_id:c,consent:true}));
 ok(await cmd(db,A,'room_join',{room_id:'commons'}));const p=await cmd(db,A,'post_create',{room_id:'commons',body:'Withdraw this while paused'});const r=await cmd(db,A,'request_create',{title:'A review',summary:'Synthetic scope',scope:'independent_review'});const a=await cmd(db,A,'assignment_propose',{request_id:r.id,reviewer_id:B});ok(a);
 const start=new Date(Date.now()+86400000);const e=await cmd(db,A,'event_offer',{invitee_id:B,title:'Coordination',starts_at:start.toISOString(),ends_at:new Date(+start+3600000).toISOString()});ok(e);
 ok(await cmd(db,O,'operator_config',{enabled:false,max_members:25}));
 assert.equal((await cmd(db,B,'credential_consent',{credential_id:c,consent:true})).result,'paused');assert.equal((await profile(db,A)).result,'paused');
 ok(await cmd(db,B,'credential_consent',{credential_id:c,consent:false}));ok(await cmd(db,B,'assignment_respond',{assignment_id:a.id,accept:false,conflict_free:false}));ok(await cmd(db,A,'request_close',{request_id:r.id}));ok(await cmd(db,A,'event_cancel',{event_id:e.id}));ok(await cmd(db,A,'post_delete',{post_id:p.id}));ok(await cmd(db,A,'room_leave',{room_id:'commons'}));ok(await cmd(db,B,'member_block',{member_id:A,blocked:true}));
 assert.equal((await cmd(db,B,'member_block',{member_id:A,blocked:false})).result,'paused');
 }finally{await db.close();}});

test('bounded snapshot and full paginated self export exclude another member records',async()=>{const db=await setup();try{await members(db);ok(await cmd(db,A,'room_join',{room_id:'tools'}));
 await db.query("insert into kapukai_members.posts(room_id,author_id,body) select 'tools',$1,'Own item '||n from generate_series(1,105) n",[A]);await db.query("insert into kapukai_members.posts(room_id,author_id,body) values('tools',$1,'Other member secret')",[B]);
 const page0=await cmd(db,A,'export'),page1=await cmd(db,A,'export',{page:1});ok(page0);ok(page1);assert.equal(page0.data.posts.length,100);assert.equal(page1.data.posts.length,5);assert.equal(page0.next_page,1);assert.equal(page1.next_page,null);assert.equal(JSON.stringify(page0).includes('Other member secret'),false);assert.equal(JSON.stringify(page1).includes('Other member secret'),false);
 for(const key of ['assignments','blocks','reports','audit','invitations'])assert.ok(Array.isArray(page0.data[key]),key);
 assert.equal((await cmd(db,A,'room_posts',{room_id:'tools'})).posts.length,100);
 for(const payload of [{page:-1},{page:'1'},{page:1.5},{page:100001}])assert.equal((await cmd(db,A,'export',payload)).result,'invalid');
 }finally{await db.close();}});

test('discovery labels only verified scopes; assignment cancellation removes case access',async()=>{const db=await setup();try{await members(db);await profile(db,A);await profile(db,B,{reviewer_opt_in:true,reviewer_scopes:['tools','independent_review']});
 const c=await cmd(db,B,'credential_submit',{title:'Tool reviewer',issuer:'Independent body',source_url:'https://example.test/tools'});ok(c);ok(await cmd(db,O,'operator_credential_review',{credential_id:c.id,verified:true,scopes:['tools'],source_url:'https://example.test/tools'}));
 assert.deepEqual((await cmd(db,A,'state')).discovery[0].reviewer_scopes,['tools']);assert.equal((await cmd(db,A,'state')).discovery[0].reviewer_eligible,true);
 const r=await cmd(db,A,'request_create',{title:'Tools process',summary:'Line one\nLine two',scope:'tools'});ok(r);const a=await cmd(db,A,'assignment_propose',{request_id:r.id,reviewer_id:B});ok(a);ok(await cmd(db,B,'assignment_respond',{assignment_id:a.id,accept:true,conflict_free:true}));assert.equal((await cmd(db,B,'state')).requests.length,1);
 ok(await cmd(db,B,'assignment_cancel',{assignment_id:a.id}));assert.equal((await cmd(db,B,'state')).requests.length,0);assert.equal((await cmd(db,A,'state')).assignments[0].status,'cancelled');
 }finally{await db.close();}});
