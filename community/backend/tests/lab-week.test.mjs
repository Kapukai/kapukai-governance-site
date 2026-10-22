import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setup,cmd,setWeekClock,O,A,B} from './lab-db-harness.mjs';

const ok=r=>assert.equal(r.ok,true,JSON.stringify(r));
const outside=r=>assert.equal(r.error,'OUTSIDE_CURRENT_WEEK',JSON.stringify(r));
const slot=(over={})=>({request_id:randomUUID(),room_id:'conference',starts_at:'2030-01-07T14:00:00Z',ends_at:'2030-01-07T14:47:00Z',participants:1,mode:'room',...over});
const next={starts_at:'2030-01-14T14:00:00Z',ends_at:'2030-01-14T14:47:00Z'};
async function using(fn){const db=await setup();try{await fn(db);}finally{await db.close();}}
async function ready(db){
 await db.query('insert into kapukai_lab.operators(user_id) values($1)',[O]);
 for(const user_id of[O,A,B])ok(await cmd(db,O,'operator_member',{user_id,active:true}));
 ok(await cmd(db,O,'operator_config',{enabled:true}));
 for(const room_id of['conference','classroom'])ok(await cmd(db,O,'operator_window',{room_id,starts_at:'2030-01-07T05:00:00Z',ends_at:'2030-01-21T05:00:00Z'}));
}
const interval=(db,start,end,reference)=>db.query('select kapukai_lab.validate_booking_week($1,$2,$3)',[start,end,reference]);

test('Eastern week bounds use local calendar dates, including UTC Monday before Eastern Monday',()=>using(async db=>{
 const sunday='2030-01-14T04:30:00Z';
 await interval(db,'2030-01-14T04:45:00Z','2030-01-14T05:00:00Z',sunday);
 await assert.rejects(interval(db,'2030-01-14T04:45:00Z','2030-01-14T05:01:00Z',sunday),/OUTSIDE_CURRENT_WEEK/);
 await assert.rejects(interval(db,'2030-01-14T05:00:00Z','2030-01-14T05:01:00Z',sunday),/OUTSIDE_CURRENT_WEEK/);
 await interval(db,'2030-01-14T05:00:00Z','2030-01-14T05:01:00Z','2030-01-14T05:00:00Z');
 await assert.rejects(interval(db,'2030-01-07T04:45:00Z','2030-01-07T05:00:00Z','2030-01-07T13:00:00Z'),/OUTSIDE_CURRENT_WEEK/);
}));

test('DST weeks end at local Monday midnight after 167 or 169 hours',()=>using(async db=>{
 // Spring: March 4 00:00 EST through March 11 00:00 EDT.
 await interval(db,'2030-03-11T03:45:00Z','2030-03-11T04:00:00Z','2030-03-10T07:00:00Z');
 await assert.rejects(interval(db,'2030-03-11T04:00:00Z','2030-03-11T04:15:00Z','2030-03-10T07:00:00Z'),/OUTSIDE_CURRENT_WEEK/);
 // Fall: October 28 00:00 EDT through November 4 00:00 EST.
 await interval(db,'2030-11-04T04:45:00Z','2030-11-04T05:00:00Z','2030-11-03T06:00:00Z');
 await assert.rejects(interval(db,'2030-11-04T05:00:00Z','2030-11-04T05:15:00Z','2030-11-03T06:00:00Z'),/OUTSIDE_CURRENT_WEEK/);
}));

test('available current-week bookings auto-confirm; next-week member actions cannot bypass the rule',()=>using(async db=>{
 await ready(db);
 const booked=await cmd(db,A,'book',slot());ok(booked);assert.equal(booked.booking.status,'confirmed');
 for(const user of[A,B,O])outside(await cmd(db,user,'book',slot(next)));
 assert.equal((await db.query('select count(*)::int n from kapukai_lab.bookings')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from kapukai_lab.outbox')).rows[0].n,2);
 assert.equal((await db.query("select count(*)::int n from kapukai_lab.audit where outcome='OUTSIDE_CURRENT_WEEK'")).rows[0].n,3);
}));

test('next-week reschedule is rejected without changing the original reservation or queuing notices',()=>using(async db=>{
 await ready(db);const original=await cmd(db,A,'book',slot());ok(original);
 outside(await cmd(db,A,'reschedule',{request_id:randomUUID(),booking_id:original.booking.id,...next}));
 const stored=(await db.query('select starts_at,ends_at,version,status from kapukai_lab.bookings where id=$1',[original.booking.id])).rows[0];
 assert.equal(new Date(stored.starts_at).toISOString(),'2030-01-07T14:00:00.000Z');
 assert.equal(new Date(stored.ends_at).toISOString(),'2030-01-07T14:47:00.000Z');
 assert.equal(stored.version,1);assert.equal(stored.status,'confirmed');
 assert.equal((await db.query('select count(*)::int n from kapukai_lab.outbox')).rows[0].n,2);
}));

test('operator may plan future classes; seats become bookable automatically at week rollover',()=>using(async db=>{
 await ready(db);
 const c=await cmd(db,O,'operator_class',{request_id:randomUUID(),room_id:'classroom',...next,title:'Future evidence class',capacity:6});ok(c);
 outside(await cmd(db,A,'join_class',{request_id:randomUUID(),class_id:c.booking.id}));
 assert.equal((await db.query('select count(*)::int n from kapukai_lab.outbox')).rows[0].n,0);
 await setWeekClock(db,'2030-01-14T05:00:00Z');
 const joined=await cmd(db,A,'join_class',{request_id:randomUUID(),class_id:c.booking.id});ok(joined);assert.equal(joined.booking.status,'confirmed');
 const booked=await cmd(db,B,'book',slot(next));ok(booked);assert.equal(booked.booking.status,'confirmed');
 assert.equal((await db.query('select count(*)::int n from kapukai_lab.outbox')).rows[0].n,4);
}));

test('week rollover preserves exact request replay and cancellation without duplicate confirmation notices',()=>using(async db=>{
 await ready(db);const request=slot(),booked=await cmd(db,A,'book',request);ok(booked);
 await setWeekClock(db,'2030-01-14T05:00:00Z');
 assert.deepEqual(await cmd(db,A,'book',request),booked);
 assert.equal((await db.query('select count(*)::int n from kapukai_lab.outbox')).rows[0].n,2);
 const cancelled=await cmd(db,A,'cancel',{request_id:randomUUID(),booking_id:booked.booking.id});ok(cancelled);assert.equal(cancelled.booking.status,'cancelled');
 assert.equal((await db.query('select count(*)::int n from kapukai_lab.outbox')).rows[0].n,4);
}));
