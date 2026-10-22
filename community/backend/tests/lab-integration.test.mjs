import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createHandler,createDispatcher} from '../supabase/functions/kapukai-lab/handler.mjs';
import {setup,cmd,mail,O,A,B} from './lab-db-harness.mjs';
const request=body=>new Request('https://tbxfsjipkrdwyctepesf.supabase.co/functions/v1/kapukai-lab',{method:'POST',headers:{origin:'https://kapukai-community.vercel.app','content-type':'application/json'},body:JSON.stringify(body)});

test('actual SQL through Edge commits schedule and both emails once, then cancels without duplicate replay',async()=>{
  const {setup,cmd,mail,O,A,B}=await import('./lab-db-harness.mjs');
  const {randomUUID}=await import('node:crypto');
  const db=await setup();
  try {
    await db.query('insert into kapukai_lab.operators(user_id) values($1)',[O]);
    const rpc=async(name,p)=>name==='kapukai_lab_command'?cmd(db,p.p_user,p.p_action,p.p_payload,p.p_session):mail(db,p.p_action,p.p_payload);
    const sent=[];
    const sendMail=Object.assign(async m=>{sent.push(m);return {status:'accepted',provider_id:randomUUID()};},{configured:()=>{}});
    const handler=user=>createHandler({authenticate:async()=>({user_id:user,session_id:user}),rpc,dispatch:createDispatcher({rpc,sendMail})});
    const call=async(user,action,payload)=>{const r=await handler(user)(request({action,payload}));return {status:r.status,...await r.json()};};
    for(const email of ['alice@example.test','bob@example.test']) assert.equal((await call(O,'operator_member',{email,active:true})).ok,true);
    assert.equal((await call(O,'operator_window',{room_id:'conference',starts_at:'2030-01-07T13:00:00.000Z',ends_at:'2030-01-07T23:00:00.000Z'})).ok,true);
    assert.equal((await call(O,'operator_config',{enabled:true})).ok,true);
    const payload={request_id:randomUUID(),room_id:'conference',starts_at:'2030-01-07T14:00:00.000Z',ends_at:'2030-01-07T14:47:00.000Z',participants:6,mode:'room'};
    const booked=await call(A,'book',payload);assert.equal(booked.status,200,JSON.stringify(booked));assert.equal(booked.booking.status,'confirmed');assert.equal(booked.notifications.accepted,2);assert.equal(sent.length,2);
    assert.deepEqual(new Set(sent.map(m=>m.to)),new Set(['alice@example.test','architect@kapukai.org']));
    const again=await call(A,'book',payload);assert.equal(again.booking.id,booked.booking.id);assert.equal(sent.length,2);
    const conflict=await call(B,'book',{...payload,request_id:randomUUID()});assert.equal(conflict.status,409);assert.equal(conflict.code,'CONFLICT');assert.equal(sent.length,2);
    const state=await call(B,'state',{week_start:'2030-01-07'});assert.equal(state.reservations.length,1);assert.equal(state.reservations[0].title,'Reserved');assert.equal(state.reservations[0].user_id,undefined);
    const cancel={request_id:randomUUID(),booking_id:booked.booking.id};assert.equal((await call(A,'cancel',cancel)).notifications.accepted,2);assert.equal(sent.length,4);
    assert.equal((await call(A,'cancel',cancel)).ok,true);assert.equal(sent.length,4);
    const next=await call(B,'book',{...payload,request_id:randomUUID()});assert.equal(next.ok,true);assert.equal(sent.length,6);
    assert.equal((await call(O,'operator_member',{user_id:B,active:false})).ok,true);
    assert.equal((await call(B,'cancel',{request_id:randomUUID(),booking_id:next.booking.id})).ok,true);assert.equal(sent.length,8);
  } finally {await db.close();}
});

async function integrationFixture(sendMail) {
  const db=await setup();
  await db.query('insert into kapukai_lab.operators(user_id) values($1)',[O]);
  const rpc=async(name,p)=>name==='kapukai_lab_command'?cmd(db,p.p_user,p.p_action,p.p_payload,p.p_session):mail(db,p.p_action,p.p_payload);
  const call=async(user,action,payload)=>{const h=createHandler({authenticate:async()=>({user_id:user,session_id:user}),rpc,dispatch:createDispatcher({rpc,sendMail})});const r=await h(request({action,payload}));return {http:r.status,...await r.json()};};
  const check=r=>assert.equal(r.ok,true,JSON.stringify(r));
  check(await call(O,'operator_member',{user_id:A,active:true}));
  check(await call(O,'operator_window',{room_id:'classroom',starts_at:'2030-01-07T13:00:00.000Z',ends_at:'2030-01-07T23:00:00.000Z'}));
  check(await call(O,'operator_config',{enabled:true}));
  return {db,call,check};
}
test('unavailable mail configuration keeps committed booking200 and two durable pending notices',async()=>{
  const sendMail=Object.assign(async()=>{throw new Error('must not attempt');},{configured:()=>{throw new Error('provider unavailable');}});
  const {db,call}=await integrationFixture(sendMail);
  try {
    const p={request_id:randomUUID(),room_id:'classroom',starts_at:'2030-01-07T14:00:00.000Z',ends_at:'2030-01-07T14:47:00.000Z',participants:1,mode:'room'};
    const booked=await call(A,'book',p);assert.equal(booked.http,200);assert.equal(booked.booking.status,'confirmed');assert.deepEqual(booked.notifications,{state:'pending'});
    const state=await call(O,'state',{week_start:'2030-01-07'});assert.equal(state.reservations.length,1);assert.equal(state.mail_status.pending,2);
    assert.equal((await call(A,'book',p)).ok,true);assert.equal((await call(O,'state',{week_start:'2030-01-07'})).mail_status.pending,2);
  } finally {await db.close();}
});
test('full six-seat class cancellation automatically dispatches all12 notices once and frees inventory',async()=>{
  const sent=[];const sendMail=Object.assign(async m=>{sent.push(m);return {status:'accepted',provider_id:randomUUID()};},{configured:()=>{}});
  const {db,call,check}=await integrationFixture(sendMail);
  try {
    const users=[A];
    for(let i=1;i<6;i++) {
      const id=randomUUID();users.push(id);
      await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`seat${i}@example.invalid`]);
      await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$1,now()+interval '1 day')",[id]);
      check(await call(O,'operator_member',{user_id:id,active:true}));
    }
    const c=await call(O,'operator_class',{request_id:randomUUID(),room_id:'classroom',starts_at:'2030-01-07T14:00:00.000Z',ends_at:'2030-01-07T15:00:00.000Z',title:'Evidence workshop',capacity:6});check(c);
    for(const user of users)check(await call(user,'join_class',{request_id:randomUUID(),class_id:c.booking.id}));
    assert.equal(sent.length,12);
    const p={request_id:randomUUID(),class_id:c.booking.id};const cancelled=await call(O,'operator_class_cancel',p);check(cancelled);assert.equal(cancelled.notifications.accepted,12);assert.equal(sent.length,24);
    check(await call(O,'operator_class_cancel',p));assert.equal(sent.length,24);
    const state=await call(A,'state',{week_start:'2030-01-07'});assert.equal(state.reservations.length,0);assert.equal(state.mine[0].status,'cancelled');
    check(await call(A,'book',{request_id:randomUUID(),room_id:'classroom',starts_at:'2030-01-07T14:00:00.000Z',ends_at:'2030-01-07T14:47:00.000Z',participants:1,mode:'room'}));
  } finally {await db.close();}
});
