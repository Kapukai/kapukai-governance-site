import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
const html=readFileSync(new URL('../../public/lab/index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../../assets/lab.js',import.meta.url),'utf8');
const day='2030-01-07',start=day+'T13:00:00Z',end=day+'T21:00:00Z';
const ID='10000000-0000-4000-8000-000000000001';
const snapshot=(extra={})=>({ok:true,access:true,operator:false,enabled:true,timezone:'America/New_York',rooms:[{id:'lounge',name:'Meeting lounge',capacity:6},{id:'conference',name:'Conference room',capacity:6},{id:'classroom',name:'Classroom',capacity:6}],windows:[{id:ID,room_id:'lounge',starts_at:start,ends_at:end}],reservations:[],mine:[],...extra});
function response(value,status=200){return {ok:status<400,status,json:async()=>structuredClone(value)};}
async function wait(check){for(let i=0;i<150;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI condition not met: '+check);}
function harness(initial=snapshot(),handle){let state=initial;const calls=[],errors=[];const dom=new JSDOM(html,{url:'https://kapukai-community.vercel.app/lab/',runScripts:'outside-only',virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(e.message))});const w=dom.window,d=w.document;let now=Date.parse('2030-01-07T12:00:00Z');const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};w.AbortSignal.timeout=()=>undefined;w.confirm=()=>true;Object.defineProperty(w,'localStorage',{get(){throw Error('No token storage');}});Object.defineProperty(w,'sessionStorage',{get(){throw Error('No token storage');}});w.fetch=async(url,init={})=>{const body=init.body?JSON.parse(init.body):{};calls.push({url,body,headers:init.headers});if(url.includes('/auth/v1/'))return response({access_token:'verified-test-token',expires_in:1800});if(body.action==='config')return response({ok:true,supabase_url:'https://tbxfsjipkrdwyctepesf.supabase.co',publishable_key:'public-test-key'});if(handle){const result=await handle(body.action,body.payload,{set:s=>state=s,get:()=>state});if(result)return result;}if(body.action==='state')return response(state);return response({ok:true,notifications:{state:'pending'}});};w.eval(script);const send=f=>f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));return {w,d,calls,errors,send,setNow:value=>now=Date.parse(value),close:()=>w.close(),async login(){d.getElementById('lab-email').value='member@example.test';d.getElementById('lab-password').value='private-password';send(d.getElementById('lab-login'));await wait(()=>!d.getElementById('lab-signout').hidden);await wait(()=>!d.getElementById('lab-login').querySelector('button').disabled);},set:s=>state=s};}
const action=(h,a)=>h.calls.filter(c=>c.body.action===a).at(-1);
async function nextWeek(h){h.d.getElementById('lab-next').click();await wait(()=>!h.d.getElementById('lab-next').disabled);}
const at=(h,time,date=day)=>h.d.querySelector(`.lab-slot[data-day="${date}"][data-time="${time}"]`);
function choose(h,duration=60,time='08:00',date=day){
 const slot=at(h,time,date);assert.ok(slot&&!slot.disabled,'Available future start');slot.click();
 assert.equal(h.d.getElementById('lab-book-submit').disabled,true,'Start alone is not a complete reservation');
 const [hour,minute]=time.split(':').map(Number),endMinute=hour*60+minute+duration;
 const finish=at(h,String(Math.floor(endMinute/60)).padStart(2,'0')+':'+String(endMinute%60).padStart(2,'0'),date);
 assert.ok(finish&&!finish.disabled,'Available finish');finish.click();
 assert.equal(h.d.getElementById('lab-book-submit').disabled,false,'Explicit finish completes selection');
 return slot;
}
function pointer(h,target,type,props={}){
 const event=new h.w.Event(type,{bubbles:true,cancelable:true});
 for(const [key,value] of Object.entries({pointerId:1,pointerType:'mouse',button:0,clientX:50,clientY:160,...props}))Object.defineProperty(event,key,{value});
 target.dispatchEvent(event);
}
function drag(h,endMinutesFromEight){
 const slot=at(h,'08:00'),col=slot.closest('.lab-day'),root=h.d.getElementById('lab-calendar');
 col.getBoundingClientRect=()=>({top:100,left:0,right:100,bottom:820,width:100,height:720});
 pointer(h,slot,'pointerdown');
 pointer(h,root,'pointermove',{clientY:160+endMinutesFromEight});
 assert.equal(h.d.getElementById('lab-book-submit').disabled,true,'Dragging requires release to finalize');
 pointer(h,root,'pointerup',{clientY:160+endMinutesFromEight});
 root.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,cancelable:true}));
}


test('same Kapukai account auth, approved boundary, no persisted credentials',async()=>{const h=harness(snapshot({access:false,rooms:[],windows:[]}));try{await h.login();assert.equal(h.d.getElementById('lab-access').hidden,false);assert.equal(h.d.getElementById('lab-workspace').hidden,true);assert.equal(h.d.querySelectorAll('.lab-slot').length,0);assert.equal(action(h,'state').headers.Authorization,'Bearer verified-test-token');assert.equal(h.d.getElementById('lab-password').value,'');assert.deepEqual(h.errors,[]);}finally{h.close();}});

test('graphical start and finish confirm a fifteen-minute booking for two people and refresh the calendar',async()=>{
 let saved;const h=harness(snapshot(),async(a,p,{get,set})=>{if(a==='book'){saved=p;set({...get(),mine:[{id:ID,room_id:'lounge',starts_at:p.starts_at,ends_at:p.ends_at,status:'confirmed'}],reservations:[{id:ID,room_id:'lounge',starts_at:p.starts_at,ends_at:p.ends_at,kind:'room',title:'Private title must not show'}]});return response({ok:true,notifications:{state:'attempted',accepted:2,failed:0,unknown:0}});}});
 try{
  await h.login();
  assert.equal(h.d.querySelectorAll('#lab-date,#lab-start,#lab-end,#lab-book input[type="date"],#lab-book input[type="time"]').length,0);
  assert.ok([...h.d.querySelectorAll('.lab-slot')].every(o=>Number(o.dataset.time.slice(-2))%15===0));
  at(h,'08:00').click();assert.equal(h.d.getElementById('lab-book-submit').disabled,true);assert.match(h.d.getElementById('lab-range-summary').textContent,/choose a finish/);
  h.send(h.d.getElementById('lab-book'));assert.equal(action(h,'book'),undefined);
  at(h,'08:15').click();assert.equal(h.d.getElementById('lab-book-submit').disabled,false);assert.match(h.d.getElementById('lab-range-summary').textContent,/15 minutes/);assert.ok(h.d.querySelector('.lab-range'));
  h.d.getElementById('lab-participants').value='2';h.send(h.d.getElementById('lab-book'));
  await wait(()=>h.d.getElementById('lab-status').textContent.includes('Your reservation is confirmed'));
  assert.equal((Date.parse(saved.ends_at)-Date.parse(saved.starts_at))/60000,15);assert.equal(saved.participants,2);assert.equal(saved.mode,'room');
  assert.equal(h.d.querySelectorAll('#lab-mine .lab-booking-card').length,1);assert.match(h.d.querySelector('.lab-reservation').textContent,/Reserved/);assert.doesNotMatch(h.d.getElementById('lab-calendar').textContent,/Private title/);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('graphical thirty-minute selection needs no typed date or time',async()=>{
 const h=harness();try{await h.login();choose(h,30);assert.match(h.d.getElementById('lab-range-summary').textContent,/30 minutes/);h.send(h.d.getElementById('lab-book'));await wait(()=>h.d.getElementById('lab-status').textContent.includes('Your reservation is confirmed'));const p=action(h,'book').body.payload;assert.equal(p.starts_at,'2030-01-07T13:00:00.000Z');assert.equal(p.ends_at,'2030-01-07T13:30:00.000Z');assert.equal(p.participants,1);}finally{h.close();}
});

test('desktop drag snaps a forty-seven-minute pointer position to a forty-five-minute booking',async()=>{
 const h=harness();try{await h.login();drag(h,47);assert.equal(h.d.getElementById('lab-book-submit').disabled,false);assert.match(h.d.getElementById('lab-range-summary').textContent,/45 minutes/);h.send(h.d.getElementById('lab-book'));await wait(()=>h.d.getElementById('lab-status').textContent.includes('Your reservation is confirmed'));const p=action(h,'book').body.payload;assert.equal(p.starts_at,'2030-01-07T13:00:00.000Z');assert.equal(p.ends_at,'2030-01-07T13:45:00.000Z');assert.deepEqual(h.errors,[]);}finally{h.close();}
});

test('uncertain transport preserves idempotency key on identical retry',async()=>{let n=0;const h=harness(snapshot(),async a=>{if(a==='book'&&n++===0)throw Error('connection lost');});try{await h.login();choose(h);h.send(h.d.getElementById('lab-book'));await wait(()=>h.d.getElementById('lab-status').textContent.includes('interrupted'));const first=action(h,'book').body.payload;h.send(h.d.getElementById('lab-book'));await wait(()=>h.d.getElementById('lab-status').textContent.includes('Your reservation is confirmed'));assert.equal(action(h,'book').body.payload.request_id,first.request_id);}finally{h.close();}});

test('confirmed commit remains confirmed when subsequent calendar refresh fails',async()=>{let committed=false;const h=harness(snapshot(),async a=>{if(a==='book'){committed=true;return response({ok:true,notifications:{state:'pending'}});}if(a==='state'&&committed)throw Error('offline');});try{await h.login();choose(h);h.send(h.d.getElementById('lab-book'));await wait(()=>h.d.getElementById('lab-status').textContent.includes('Saved successfully'));assert.match(h.d.getElementById('lab-status').textContent,/Your reservation is confirmed/);assert.equal(h.d.getElementById('lab-selection').hidden,true);}finally{h.close();}});

test('empty disabled schedule never invents openings and shows owner controls only to operator',async()=>{const h=harness(snapshot({access:false,operator:true,enabled:false,windows:[],members:[],mail_status:{unknown:1}}));try{await h.login();assert.equal(h.d.querySelectorAll('.lab-slot:not(:disabled)').length,0);assert.equal(h.d.getElementById('lab-paused').hidden,false);assert.equal(h.d.getElementById('lab-no-hours').hidden,false);const f=h.d.getElementById('lab-approve');f.elements.email.value='approved@example.test';h.send(f);await wait(()=>action(h,'operator_member'));assert.deepEqual(action(h,'operator_member').body.payload,{email:'approved@example.test',active:true});await wait(()=>h.d.getElementById('lab-status').textContent.includes('Lab access approved'));assert.match(h.d.getElementById('lab-settings').textContent,/Uncertain sends are not automatically repeated/);}finally{h.close();}});

test('revoked member can cancel their existing booking without seeing private calendar',async()=>{const h=harness(snapshot({access:false,rooms:[],windows:[],mine:[{id:ID,room_id:'lounge',starts_at:start,ends_at:end,status:'confirmed'}]}));try{await h.login();const cancel=[...h.d.querySelectorAll('#lab-mine button')].find(b=>b.textContent==='Cancel reservation');assert.ok(cancel);assert.equal(h.d.getElementById('lab-workspace').hidden,true);cancel.click();await wait(()=>action(h,'cancel'));assert.equal(action(h,'cancel').body.payload.booking_id,ID);await wait(()=>h.d.getElementById('lab-status').textContent.includes('Reservation cancelled'));}finally{h.close();}});

test('signout while state response is pending cannot restore private calendar',async()=>{let release,block=false;const gate=new Promise(r=>release=r);const h=harness(snapshot(),async a=>{if(a==='state'&&block){await gate;return response(snapshot());}});try{await h.login();block=true;h.d.getElementById('lab-refresh').click();await wait(()=>h.d.getElementById('lab-refresh').disabled);h.d.getElementById('lab-signout').click();release();await wait(()=>h.d.getElementById('lab-status').textContent.includes('session ended'));assert.equal(h.d.getElementById('lab-workspace').hidden,true);assert.equal(h.d.getElementById('lab-calendar').children.length,0);assert.ok(h.calls.some(c=>c.url.endsWith('/logout?scope=local')));}finally{h.close();}});

test('class event reserves one seat without a room request and untrusted title remains text',async()=>{const cls={id:ID,room_id:'lounge',starts_at:start,ends_at:day+'T14:00:00Z',kind:'class',title:'<img src=x> Timeline lab',capacity:6,seats_taken:5};const h=harness(snapshot({reservations:[cls]}));try{await h.login();const c=h.d.querySelector('.lab-reservation.class');assert.ok(c);assert.equal(c.querySelector('img'),null);assert.match(c.textContent,/1 seats available/);c.click();await wait(()=>h.d.getElementById('lab-status').textContent.includes('class seat is confirmed'));assert.equal(action(h,'join_class').body.payload.class_id,ID);assert.equal(action(h,'book'),undefined);}finally{h.close();}});

test('graphical reschedule sends the new range and a conflict preserves the original reservation',async()=>{
 const booking={id:ID,room_id:'lounge',starts_at:start,ends_at:day+'T14:00:00Z',kind:'room',status:'confirmed'};
 const h=harness(snapshot({mine:[booking],reservations:[{...booking,title:'Reserved'}]}),async a=>a==='reschedule'?response({ok:false,code:'CONFLICT'},409):null);
 try{await h.login();[...h.d.querySelectorAll('#lab-mine button')].find(b=>b.textContent==='Change time').click();await wait(()=>!h.d.getElementById('lab-selection').hidden);await wait(()=>!h.d.getElementById('lab-book-submit').disabled);choose(h,30,'09:00');h.send(h.d.getElementById('lab-book'));await wait(()=>h.d.getElementById('lab-status').textContent.includes('just reserved'));await wait(()=>!h.d.getElementById('lab-refresh').disabled);const p=action(h,'reschedule').body.payload;assert.equal(p.booking_id,ID);assert.equal(p.starts_at,'2030-01-07T14:00:00.000Z');assert.equal(p.ends_at,'2030-01-07T14:30:00.000Z');assert.match(h.d.getElementById('lab-mine').textContent,/Confirmed/);assert.equal(action(h,'cancel'),undefined);}finally{h.close();}
});


test('nonproduction preview disables sign-in and makes no auth requests',()=>{const calls=[];const dom=new JSDOM(html,{url:'https://kapukai-preview.vercel.app/lab/',runScripts:'outside-only'});try{dom.window.fetch=(...args)=>{calls.push(args);throw Error('Preview must not request auth');};dom.window.eval(script);assert.equal(dom.window.document.getElementById('lab-login').hidden,true);assert.match(dom.window.document.getElementById('lab-status').textContent,/Preview only — reservations are not open here/);dom.window.document.getElementById('lab-login').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));assert.deepEqual(calls,[]);assert.equal(dom.window.document.getElementById('lab-workspace').hidden,true);}finally{dom.window.close();}});


test('members select only the current week; operators can plan but cannot book next week',async()=>{
 const h=harness();try{await h.login();assert.equal(h.d.getElementById('lab-next').hidden,true);assert.equal(h.d.getElementById('lab-previous').hidden,true);assert.equal(action(h,'state').body.payload.week_start,'2030-01-07');assert.equal(h.d.querySelectorAll('.lab-slot[data-day="2030-01-14"]').length,0);assert.equal(h.d.getElementById('lab-date'),null);h.d.getElementById('lab-next').click();await wait(()=>!h.d.getElementById('lab-next').disabled);assert.equal(action(h,'state').body.payload.week_start,'2030-01-07');}finally{h.close();}
 const op=harness(snapshot({operator:true,members:[],windows:[{id:ID,room_id:'lounge',starts_at:'2030-01-14T13:00:00Z',ends_at:'2030-01-14T21:00:00Z'}],reservations:[{id:ID,room_id:'lounge',kind:'class',title:'Next week',starts_at:'2030-01-14T14:00:00Z',ends_at:'2030-01-14T15:00:00Z',capacity:6,seats_taken:0}]}));try{await op.login();assert.equal(op.d.getElementById('lab-next').hidden,false);await nextWeek(op);assert.equal(action(op,'state').body.payload.week_start,'2030-01-14');assert.equal(op.d.querySelectorAll('.lab-slot:not(:disabled)').length,0);assert.equal(op.d.querySelector('.lab-reservation.class').disabled,true);}finally{op.close();}
});

test('open selection rejects after week rollover; refresh advances to the new current week',async()=>{
 const h=harness();try{await h.login();choose(h);h.setNow('2030-01-14T05:00:00Z');h.send(h.d.getElementById('lab-book'));assert.equal(action(h,'book'),undefined);assert.match(h.d.getElementById('lab-status').textContent,/this week only/);h.d.getElementById('lab-selection-close').click();h.d.getElementById('lab-refresh').click();await wait(()=>action(h,'state').body.payload.week_start==='2030-01-14');await wait(()=>!h.d.getElementById('lab-refresh').disabled);assert.equal(h.d.querySelector('.lab-slot').dataset.day,'2030-01-14');assert.equal(h.d.querySelector('.lab-range'),null);}finally{h.close();}
});


test('daytime week shows7am–7pm in15-minute starts and full-day toggle preserves evening visibility',async()=>{
 const early={id:ID,room_id:'lounge',starts_at:day+'T11:00:00Z',ends_at:day+'T13:00:00Z',kind:'room',title:'Reserved'};
 const h=harness(snapshot({reservations:[early]}));try{await h.login();const slots=[...h.d.querySelectorAll('.lab-slot')];assert.equal(slots.length,7*48);assert.equal(slots[0].dataset.time,'07:00');assert.equal(slots[47].dataset.time,'18:45');assert.equal(h.d.querySelector('.lab-end-label').textContent,'7 p.m.');assert.equal(h.d.querySelector('.lab-reservation').style.top,'0%');assert.equal(h.d.getElementById('lab-calendar-scroll').dataset.view,'daytime');const view=h.d.getElementById('lab-hours-view');view.value='full';view.dispatchEvent(new h.w.Event('change'));assert.equal(h.d.querySelectorAll('.lab-slot').length,7*96);assert.equal(h.d.querySelector('.lab-slot').dataset.time,'00:00');assert.equal(h.d.querySelectorAll('.lab-slot')[95].dataset.time,'23:45');assert.equal(h.d.getElementById('lab-calendar-scroll').dataset.view,'full');assert.deepEqual(h.errors,[]);}finally{h.close();}
});


test('a reservation start and the published closing time are valid finish boundaries',async()=>{
 const busy={id:ID,room_id:'lounge',starts_at:day+'T14:00:00Z',ends_at:day+'T15:00:00Z',kind:'room'};
 const h=harness(snapshot({reservations:[busy]}));
 try{await h.login();at(h,'08:00').click();assert.equal(at(h,'09:00').disabled,false);assert.equal(at(h,'09:15').disabled,true);assert.equal(at(h,'10:00').classList.contains('lab-finish-option'),false);at(h,'09:00').click();h.send(h.d.getElementById('lab-book'));await wait(()=>h.d.getElementById('lab-status').textContent.includes('Your reservation is confirmed'));assert.equal(action(h,'book').body.payload.ends_at,'2030-01-07T14:00:00.000Z');}finally{h.close();}
 const closing=harness();try{await closing.login();assert.equal(at(closing,'16:00').disabled,true);at(closing,'15:45').click();assert.equal(at(closing,'16:00').disabled,false);at(closing,'16:00').click();closing.send(closing.d.getElementById('lab-book'));await wait(()=>closing.d.getElementById('lab-status').textContent.includes('Your reservation is confirmed'));assert.equal(action(closing,'book').body.payload.ends_at,'2030-01-07T21:00:00.000Z');}finally{closing.close();}
});

test('pointer drag cannot bridge an occupied interval and room change clears the old range',async()=>{
 const busy={id:ID,room_id:'lounge',starts_at:day+'T13:30:00Z',ends_at:day+'T14:00:00Z',kind:'room'};
 const h=harness(snapshot({reservations:[busy]}));try{await h.login();drag(h,60);assert.match(h.d.getElementById('lab-range-summary').textContent,/30 minutes/);const room=h.d.getElementById('lab-room');room.value='conference';room.dispatchEvent(new h.w.Event('change'));assert.equal(h.d.getElementById('lab-selection').hidden,true);assert.equal(h.d.querySelector('.lab-range'),null);h.send(h.d.getElementById('lab-book'));assert.equal(action(h,'book'),undefined);}finally{h.close();}
});

test('the visible seven-pm boundary completes a fifteen-minute range',async()=>{
 const h=harness(snapshot({windows:[{id:ID,room_id:'lounge',starts_at:day+'T23:00:00Z',ends_at:'2030-01-08T00:00:00Z'}]}));try{await h.login();at(h,'18:45').click();const end=h.d.querySelector('.lab-finish-boundary[data-day="2030-01-07"]');assert.ok(end);assert.equal(end.dataset.time,'19:00');end.click();h.send(h.d.getElementById('lab-book'));await wait(()=>h.d.getElementById('lab-status').textContent.includes('Your reservation is confirmed'));assert.equal(action(h,'book').body.payload.starts_at,'2030-01-07T23:45:00.000Z');assert.equal(action(h,'book').body.payload.ends_at,'2030-01-08T00:00:00.000Z');}finally{h.close();}
});


test('keyboard arrows keep focus on usable quarter-hour choices while selecting a range',async()=>{
 const h=harness();try{await h.login();const start=at(h,'08:00');assert.equal(start.tabIndex,0);start.focus();start.click();const selected=h.d.activeElement;assert.equal(selected.dataset.time,'08:00');selected.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(h.d.activeElement.dataset.time,'08:15');h.d.activeElement.click();assert.equal(h.d.activeElement,h.d.getElementById('lab-book-submit'));assert.match(h.d.getElementById('lab-range-summary').textContent,/15 minutes/);}finally{h.close();}
});

test('full-day Sunday selection can finish at midnight without crossing into a next-week booking',async()=>{
 const h=harness(snapshot({windows:[{id:ID,room_id:'lounge',starts_at:'2030-01-14T03:00:00Z',ends_at:'2030-01-14T05:00:00Z'}]}));
 try{await h.login();const view=h.d.getElementById('lab-hours-view');view.value='full';view.dispatchEvent(new h.w.Event('change'));at(h,'23:45','2030-01-13').click();const finish=h.d.querySelector('.lab-finish-boundary[data-day="2030-01-13"]');assert.ok(finish);assert.equal(finish.dataset.time,'00:00');finish.click();h.send(h.d.getElementById('lab-book'));await wait(()=>h.d.getElementById('lab-status').textContent.includes('Your reservation is confirmed'));const p=action(h,'book').body.payload;assert.equal(p.starts_at,'2030-01-14T04:45:00.000Z');assert.equal(p.ends_at,'2030-01-14T05:00:00.000Z');}finally{h.close();}
});
