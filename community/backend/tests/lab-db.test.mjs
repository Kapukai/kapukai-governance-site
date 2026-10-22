import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setup,cmd,mail,O,A,B,E} from './lab-db-harness.mjs';
const ok=r=>assert.equal(r.ok,true,JSON.stringify(r));
const err=(r,c)=>assert.equal(r.error,c,JSON.stringify(r));
const request=()=>randomUUID();
const week={week_start:'2030-01-07'};
const slot=(over={})=>({request_id:request(),room_id:'conference',starts_at:'2030-01-07T14:00:00Z',ends_at:'2030-01-07T14:47:00Z',participants:6,mode:'room',...over});
async function ready(db){await db.query('insert into kapukai_lab.operators(user_id) values($1)',[O]);for(const user_id of[A,B])ok(await cmd(db,O,'operator_member',{user_id,active:true}));ok(await cmd(db,O,'operator_config',{enabled:true}));for(const room_id of ['lounge','conference','classroom'])ok(await cmd(db,O,'operator_window',{room_id,starts_at:'2030-01-07T13:00:00Z',ends_at:'2030-01-07T23:00:00Z'}));}
async function using(fn){const db=await setup();try{await fn(db)}finally{await db.close()}}
test('Lab begins closed and requires separate current grants + session',()=>using(async db=>{
 const initial=await cmd(db,A,'state',week);ok(initial);assert.equal(initial.enabled,false);assert.equal(initial.access,false);assert.deepEqual(initial.rooms,[]);
 err(await cmd(db,A,'book',slot()),'FORBIDDEN');err(await cmd(db,A,'operator_member',{user_id:A,active:true}),'FORBIDDEN');await ready(db);
 err(await cmd(db,E,'state',week,A),'FORBIDDEN');const s=await cmd(db,A,'state',week);ok(s);assert.equal(s.access,true);assert.equal(s.operator,false);assert.equal(s.members,undefined);
 await db.query('delete from auth.sessions where user_id=$1',[A]);err(await cmd(db,A,'book',slot()),'FORBIDDEN');
}));
test('atomic booking, independent end, safe half-open boundaries, replay and conflict audit',()=>using(async db=>{
 await ready(db);const p=slot();const a=await cmd(db,A,'book',p);ok(a);assert.equal(a.booking.status,'confirmed');assert.equal(new Date(a.booking.ends_at).getUTCMinutes(),47);
 assert.deepEqual(await cmd(db,A,'book',p),a);err(await cmd(db,A,'book',{...p,participants:2}),'IDEMPOTENCY_CONFLICT');
 err(await cmd(db,B,'book',slot()),'CONFLICT');err(await cmd(db,A,'book',slot({room_id:'lounge'})),'CONFLICT');
 err(await cmd(db,B,'book',slot({starts_at:'2030-01-07T14:47:00Z',ends_at:'2030-01-07T15:00:00Z'})),'INVALID_REQUEST');
 ok(await cmd(db,B,'book',slot({starts_at:'2030-01-07T15:00:00Z',ends_at:'2030-01-07T16:00:00Z'})));
 assert.equal((await db.query('select count(*)::int n from kapukai_lab.bookings')).rows[0].n,2);
 assert.equal((await db.query('select count(*)::int n from kapukai_lab.outbox')).rows[0].n,4);
 assert.equal((await db.query("select count(*)::int n from kapukai_lab.audit where outcome='CONFLICT'")).rows[0].n,2);
 const state=await cmd(db,B,'state',week);assert.equal(state.reservations[0].title,'Reserved');assert.equal(state.reservations[0].user_id,undefined);assert.equal(state.mine.length,1);assert.equal(JSON.stringify(state).includes('alice@'),false);
}));
test('failed reschedule preserves original; revocation blocks booking but preserves own cancellation',()=>using(async db=>{
 await ready(db);const a=await cmd(db,A,'book',slot());const b=await cmd(db,B,'book',slot({starts_at:'2030-01-07T15:00:00Z',ends_at:'2030-01-07T16:00:00Z'}));ok(a);ok(b);
 err(await cmd(db,A,'reschedule',{request_id:request(),booking_id:a.booking.id,starts_at:'2030-01-07T15:00:00Z',ends_at:'2030-01-07T16:00:00Z'}),'CONFLICT');
 assert.equal((await cmd(db,A,'state',week)).mine[0].version,1);
 const move=await cmd(db,A,'reschedule',{request_id:request(),booking_id:a.booking.id,starts_at:'2030-01-07T16:00:00Z',ends_at:'2030-01-07T16:31:00Z'});ok(move);assert.equal(move.booking.version,2);
 ok(await cmd(db,O,'operator_member',{user_id:A,active:false}));err(await cmd(db,A,'book',slot()),'FORBIDDEN');const revoked=await cmd(db,A,'state',week);assert.deepEqual(revoked.reservations,[]);assert.equal(revoked.mine.length,1);
 err(await cmd(db,B,'cancel',{request_id:request(),booking_id:a.booking.id}),'NOT_FOUND');ok(await cmd(db,A,'cancel',{request_id:request(),booking_id:a.booking.id}));
}));
test('classes occupy inventory; seat counts enforce capacity and cancellation releases seat',()=>using(async db=>{
 await ready(db);const c=await cmd(db,O,'operator_class',{request_id:request(),room_id:'classroom',starts_at:'2030-01-07T14:00:00Z',ends_at:'2030-01-07T15:00:00Z',title:'Evidence workshop',capacity:1});ok(c);
 err(await cmd(db,A,'book',slot({room_id:'classroom'})),'CONFLICT');const seat=await cmd(db,A,'join_class',{request_id:request(),class_id:c.booking.id});ok(seat);
 err(await cmd(db,B,'join_class',{request_id:request(),class_id:c.booking.id}),'CAPACITY_FULL');err(await cmd(db,A,'book',slot()),'CONFLICT');
 const before=await cmd(db,B,'state',week);assert.equal(before.reservations[0].seats_taken,1);assert.equal(before.reservations[0].title,'Evidence workshop');ok(await cmd(db,A,'cancel',{request_id:request(),booking_id:seat.booking.id}));ok(await cmd(db,B,'join_class',{request_id:request(),class_id:c.booking.id}));
}));
test('outbox is transactional, request scoped and never reclaims accepted/uncertain handoffs',()=>using(async db=>{
 await ready(db);const p=slot();ok(await cmd(db,A,'book',p));const claim=await mail(db,'claim',{limit:10,request_id:p.request_id});ok(claim);assert.equal(claim.messages.length,2);assert.deepEqual(new Set(claim.messages.map(x=>x.to)),new Set(['alice@example.test','architect@kapukai.org']));
 assert.equal((await mail(db,'claim',{limit:10})).messages.length,0);ok(await mail(db,'finish',{id:claim.messages[0].id,status:'accepted',provider_id:'test-message-id'}));ok(await mail(db,'finish',{id:claim.messages[1].id,status:'unknown'}));assert.equal((await mail(db,'claim',{limit:10})).messages.length,0);
 err(await mail(db,'finish',{id:claim.messages[0].id,status:'failed'}),'CONFLICT');const s=await cmd(db,O,'state',week);assert.deepEqual(s.mail_status,{accepted:1,unknown:1});err(await cmd(db,A,'operator_dispatch',{}),'FORBIDDEN');ok(await cmd(db,O,'operator_dispatch',{}));
}));
test('validation covers closed hours, quarter starts, seconds, malformed payloads and verified-email grants',()=>using(async db=>{
 await ready(db);for(const over of [{starts_at:'2030-01-07T14:01:00Z'},{starts_at:'2030-01-07T14:00:01Z'},{ends_at:'2030-01-07T14:47:01Z'},{ends_at:'2030-01-07T14:00:00Z'},{participants:7},{participants:null},{mode:null},{extra:'ignored'}])err(await cmd(db,A,'book',slot(over)),'INVALID_REQUEST');
 err(await cmd(db,A,'book',slot({starts_at:'2030-01-08T14:00:00Z',ends_at:'2030-01-08T15:00:00Z'})),'OUTSIDE_HOURS');ok(await cmd(db,O,'operator_member',{email:'EVE@example.test',active:true}));assert.equal((await cmd(db,E,'state',week)).access,true);err(await cmd(db,O,'operator_member',{email:'missing@example.test',active:true}),'NOT_FOUND');
 ok(await cmd(db,O,'operator_config',{enabled:false}));err(await cmd(db,A,'book',slot()),'DISABLED');
}));
test('tables helpers and privileged RPCs deny direct browser roles',()=>using(async db=>{
 for(const role of ['anon','authenticated','service_role']){await db.exec('set role '+role);for(const q of['select * from kapukai_lab.members','select kapukai_lab.run(null,false,false,\'state\',\'{}\')'])await assert.rejects(db.query(q),/permission denied/);if(role!=='service_role')for(const q of["select public.kapukai_lab_command(null,null,'state','{}')","select public.kapukai_lab_mail('claim','{}')"])await assert.rejects(db.query(q),/permission denied/);await db.exec('reset role')}
 assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='kapukai_lab' and not rowsecurity")).rows[0].n,0);
}));
test('operator corrections refuse orphaned room bookings and cancel class seats atomically',()=>using(async db=>{
 await ready(db);const booking=await cmd(db,A,'book',slot());ok(booking);const windows=(await cmd(db,O,'state',week)).windows;const win=windows.find(w=>w.room_id==='conference');
 err(await cmd(db,O,'operator_window_remove',{window_id:win.id}),'CONFLICT');err(await cmd(db,A,'operator_window_remove',{window_id:win.id}),'FORBIDDEN');
 ok(await cmd(db,A,'cancel',{request_id:request(),booking_id:booking.booking.id}));ok(await cmd(db,O,'operator_window_remove',{window_id:win.id}));err(await cmd(db,A,'book',slot()),'OUTSIDE_HOURS');
 const c=await cmd(db,O,'operator_class',{request_id:request(),room_id:'classroom',starts_at:'2030-01-07T14:00:00Z',ends_at:'2030-01-07T15:00:00Z',title:'Evidence workshop',capacity:6});ok(c);for(const user of[A,B])ok(await cmd(db,user,'join_class',{request_id:request(),class_id:c.booking.id}));
 const p={request_id:request(),class_id:c.booking.id};err(await cmd(db,A,'operator_class_cancel',p),'FORBIDDEN');ok(await cmd(db,O,'operator_config',{enabled:false}));const result=await cmd(db,O,'operator_class_cancel',p);ok(result);assert.deepEqual(await cmd(db,O,'operator_class_cancel',p),result);
 const messages=await mail(db,'claim',{limit:20,request_id:p.request_id});assert.equal(messages.messages.length,4);for(const user of[A,B])assert.equal((await cmd(db,user,'state',week)).mine.find(x=>x.class_id===c.booking.id).status,'cancelled');assert.equal((await cmd(db,O,'state',week)).reservations.length,0);
 const audit=(await db.query("select detail from kapukai_lab.audit where action='operator_class_cancel' and outcome='allowed'")).rows;assert.equal(audit[0].detail.class_id,c.booking.id);
}));
test('provider results require evidence and handoff history remains append only',()=>using(async db=>{
 await ready(db);ok(await cmd(db,A,'book',slot()));const claimed=await mail(db,'claim',{limit:20});const id=claimed.messages[0].id;
 for(const p of [{id,status:'accepted'},{id,status:null},{id,status:'accepted',provider_id:''},{id,status:'failed',provider_id:'notaccepted'}])err(await mail(db,'finish',p),'INVALID_REQUEST');
 ok(await mail(db,'finish',{id,status:'accepted',provider_id:'provider-proof'}));const log=(await db.query('select status,provider_id from kapukai_lab.mail_audit where outbox_id=$1 order by id',[id])).rows;assert.deepEqual(log,[{status:'sending',provider_id:null},{status:'accepted',provider_id:'provider-proof'}]);
}));
