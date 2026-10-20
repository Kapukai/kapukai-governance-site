// Read-only production boundary checks. The honeypot branch must return before
// rate claims, request persistence or email transport; unit tests enforce that.
import assert from 'node:assert/strict';

const endpoint='https://tbxfsjipkrdwyctepesf.supabase.co/functions/v1/kapukai-member-access';
const origin='https://kapukai-community.vercel.app';
const request=(action,payload={})=>JSON.stringify({action,payload});
const cases=[
  {name:'request_service_ready',status:200,body:request('access_status'),check:b=>b.ok===true&&b.enabled===true},
  {name:'unrecognized_confirmation',status:400,body:request('access_inspect',{token:'x'.repeat(43)})},
  {name:'private_queue_requires_auth',status:401,body:request('operator_access_queue')},
  {name:'forged_auth_rejected',status:401,body:request('operator_access_queue'),authorization:'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.invalid'},
  {name:'malformed_request_rejected',status:400,body:request('access_request',{email:'probe@example.invalid'})},
  {name:'unapproved_origin_denied',status:403,body:request('access_status'),origin:'https://unapproved.example.invalid'},
  {name:'get_does_not_change_state',status:405,method:'GET'},
  {name:'query_tokens_rejected',status:400,url:endpoint+'?token=not-a-secret',body:request('access_status')},
  {name:'honeypot_does_not_send_or_store',status:202,body:request('access_request',{email:'probe@example.invalid',display_name:'Synthetic boundary probe',request_id:crypto.randomUUID(),consent_version:'kapukai-member-access-v1-2026-10-20',adult:true,privacy_acknowledged:true,human_review_acknowledged:true,started_at:Date.now()-5000,website:'automated-probe'}),check:b=>b.ok===true&&b.result==='request_received'},
];
const checks=await Promise.all(cases.map(async c=>{
  const response=await fetch(c.url||endpoint,{method:c.method||'POST',headers:{Origin:c.origin||origin,'Content-Type':'application/json',...(c.authorization?{Authorization:c.authorization}:{})},body:c.body,signal:AbortSignal.timeout(20000)});
  const body=await response.json();
  const headers={cache_control:response.headers.get('cache-control'),cors:response.headers.get('access-control-allow-origin')};
  const passed=response.status===c.status&&headers.cache_control==='no-store'&&(c.origin?headers.cors===null:headers.cors===origin)&&(!c.check||c.check(body));
  return {name:c.name,status:response.status,expected_status:c.status,...headers,passed};
}));
console.log(JSON.stringify({checked_at_utc:new Date().toISOString(),endpoint,checks},null,2));
assert.ok(checks.every(c=>c.passed),'A live access boundary check failed');
