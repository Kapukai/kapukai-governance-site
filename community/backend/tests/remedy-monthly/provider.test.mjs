import assert from 'node:assert/strict';
import {monthlyTick} from '../../supabase/functions/kapukai-interest-lifecycle-worker/monthly.mjs';
async function run({mode='live',allowed=true,verified=true,ambiguous=false}) {
 const events=[],sent=[];const result=await monthlyTick({config:{mode,postmark_ready_at:'ready',broadcast_stream:'broadcasts'},sender:'sender@example.invalid',replyTo:'reply@example.invalid',postalAddress:'test postal',rpc:async(n,b)=>{events.push([n,b]);return n==='next'?[{job_id:'job',recipient:'person@example.invalid',subject:'Edition',body:'Body',edition_month:'2026-11-01'}]:n==='may_send'?allowed:[]},provider:async(p,i)=>{if(p!=='/email')return {ok:true,json:async()=>({ID:'broadcasts',MessageStreamType:'Broadcasts',SubscriptionManagementConfiguration:{UnsubscribeHandlingType:verified?'Postmark':'Custom'}})};sent.push(JSON.parse(i.body));if(ambiguous)throw Error('timeout');return{ok:true,status:200,json:async()=>({ErrorCode:0,MessageID:'id'})}}});
 return {events,sent,result};
}
const ok=await run({});assert.equal(ok.sent.length,1);assert.equal(ok.result,'accepted');
assert.match(ok.sent[0].TextBody,/\{\{\{ pm:unsubscribe \}\}\}/);assert.match(ok.sent[0].HtmlBody,/href="\{\{\{ pm:unsubscribe \}\}\}"/);assert.equal(ok.sent[0].TrackOpens,false);
assert.equal((await run({mode:'hold'})).events.length,0);assert.equal((await run({verified:false})).sent.length,0);
assert.equal((await run({allowed:false})).sent.length,0);assert.equal((await run({ambiguous:true})).result,'unknown');console.log('PASS monthly worker eligibility, stream guard, rendered unsubscribe and ambiguous outcome');
