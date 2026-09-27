// Public submission only. Gateway validates the project anon JWT. No private read API.
const BASE = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORIGINS = new Set(['https://kapukai.org','https://www.kapukai.org','https://assurance.kapukai.org','https://kapukai-public-assurance.vercel.app','http://localhost:4173']);
const TOPICS = ['assurance','books','tools','services','events','research','pilots','expert_review','funding'];
const VERSION = 'kapukai-assurance-consent-2026-09-27-v1';
const CONSENT = 'Store my contact information and selected interests so Kapukai can respond to this request. Send optional updates only for the topics I selected after I confirm my email. I can unsubscribe or request deletion.';
const headers = {apikey:KEY, Authorization:`Bearer ${KEY}`, 'Content-Type':'application/json'};
async function db(path:string, method='GET', data?:unknown) {
 const r=await fetch(`${BASE}/rest/v1/${path}`, {method,headers:{...headers,Prefer:'return=representation'},body:data===undefined?undefined:JSON.stringify(data)});
 if(!r.ok) throw new Error(`database_${r.status}`);
 return r.status===204?null:r.json();
}
async function digest(s:string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join(''); }
function token() {return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');}
function str(v:unknown,max:number) {if(v==null)return '';if(typeof v!=='string'||v.length>max)throw new Error('validation');return v.trim();}
async function mail(to:string,subject:string,text:string) {
 if(to.endsWith('.invalid')) return 'test_skipped';
 const key=Deno.env.get('POSTMARK_SERVER_TOKEN'),from=Deno.env.get('POSTMARK_FROM_EMAIL');
 if(!key||!from)return 'not_configured';
 try {
  const r=await fetch('https://api.postmarkapp.com/email',{method:'POST',headers:{'Content-Type':'application/json','X-Postmark-Server-Token':key},body:JSON.stringify({From:from,To:to,Subject:subject,TextBody:text,MessageStream:Deno.env.get('POSTMARK_MESSAGE_STREAM')||'outbound',TrackOpens:false,TrackLinks:'None'})});
  const j=await r.json(); return r.ok&&j.ErrorCode===0?'accepted':'failed';
 }catch{return 'failed';}
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin');
 const cors={'Access-Control-Allow-Origin':origin&&ORIGINS.has(origin)?origin:'https://kapukai.org','Access-Control-Allow-Headers':'content-type, authorization, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'};
 const out=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:cors});
 if(origin&&!ORIGINS.has(origin))return out(403,{error:'Origin not allowed.'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return out(405,{error:'Use POST.'});
 try {
  const raw=await req.text(); if(raw.length>10000)return out(413,{error:'Request too large.'});
  const b=JSON.parse(raw);
  if(b.action==='confirm'||b.action==='unsubscribe') {
   if(typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token))return out(400,{error:'Invalid link.'});
   const rows=await db(`assurance_connections?token_hash=eq.${await digest(b.token)}&select=*`);
   const row=rows[0];if(!row)return out(400,{error:'This link is invalid.'});
   if(b.action==='confirm') {
    if(row.status==='unsubscribed')return out(400,{error:'This request was withdrawn. Please submit a new request.'});
    if(row.status==='confirmed')return out(200,{message:'This request is already confirmed.'});
    if(Date.parse(row.expires_at)<Date.now())return out(400,{error:'This link expired. Please submit the form again.'});
    await db(`assurance_consent_events`,'POST',{connection_id:row.id,event_type:'confirmed',consent_version:VERSION,topics:row.topics});
    await db(`assurance_connections?id=eq.${row.id}`,'PATCH',{status:'confirmed',confirmed_at:new Date().toISOString()});
    const ownerStatus=row.email.endsWith('.invalid')?'test_skipped':await mail(Deno.env.get('SIGNUP_NOTIFY_TO')||'architect@kapukai.org','Confirmed Public Systems Assurance inquiry',`A confirmed request is available in Supabase → assurance_connections.\nReference: ${row.id}\nTopics: ${row.topics.join(', ')||'Contact only'}\nMessage included: ${Boolean(row.message)}\nContact details are stored in the protected table.`);
    await db(`assurance_connections?id=eq.${row.id}`,'PATCH',{owner_delivery_status:ownerStatus});
    return out(200,{message:'Your email is confirmed. Your request and selected preferences are recorded.'});
   }
   // A bearer link withdraws all subscriptions for this address in THIS registry.
   await db('assurance_consent_events','POST',{connection_id:row.id,event_type:'unsubscribed',consent_version:VERSION,topics:row.topics});
   await db(`assurance_connections?email=eq.${encodeURIComponent(row.email)}`,'PATCH',{status:'unsubscribed'});
   return out(200,{message:'All subscriptions for this address in the assurance registry have been withdrawn. Other Kapukai lists are separate; contact architect@kapukai.org to request removal from all lists or deletion.'});
  }
  if(b.action!=='submit')return out(400,{error:'Unknown action.'});
  if(b.website)return out(200,{message:'Request received.'});
  const elapsed=Date.now()-Number(b.started_at);
  if(!Number.isFinite(elapsed)||elapsed<1200||elapsed>86400000)return out(400,{error:'Please reload the form and try again.'});
  if(b.consent!==true||b.adult!==true)return out(400,{error:'Please confirm the required consent and age fields.'});
  const email=str(b.email,254).toLowerCase(),name=str(b.display_name,100),message=str(b.message,2000);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return out(400,{error:'Enter a valid email.'});
  if(!Array.isArray(b.topics)||b.topics.some((t:unknown)=>!TOPICS.includes(t as string)))return out(400,{error:'Invalid topic selection.'});
  const topics=[...new Set(b.topics)];
  if(!topics.length&&!message)return out(400,{error:'Choose an update topic or write a short general inquiry.'});
  const day=new Date().toISOString().slice(0,10),ip=req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
  for(const [kind,value,limit] of [['network',ip,40],['email',email,5]] as const){
   const hash=await digest(`assurance|${day}|${kind}|${value}|${KEY.slice(-18)}`);
   const allowed=await db('rpc/kapukai_claim_signup_attempt','POST',{p_fingerprint:hash,p_limit:limit});
   if(allowed!==true)return out(429,{error:'Too many requests. Please try again tomorrow.'});
  }
  const t=token();
  const rows=await db('assurance_connections','POST',{email,display_name:name||null,message:message||null,topics,consent_version:VERSION,consent_text:CONSENT,source_path:'/public-assurance',token_hash:await digest(t),expires_at:new Date(Date.now()+48*3600000).toISOString()});
  const row=rows[0];
  await db('assurance_consent_events','POST',{connection_id:row.id,event_type:'requested',consent_version:VERSION,topics});
  // A fixed origin prevents user-supplied redirect/confirmation phishing.
  const site='https://kapukai.org/public-assurance/';
  const status=await mail(email,'Confirm your Kapukai request',`Confirm your request within 48 hours:\n${site}#confirm=${t}\n\nSelected update topics: ${topics.join(', ')||'None (contact only)'}\n\nIf you did not submit this request, ignore this message.\nWithdraw assurance subscriptions: ${site}#unsubscribe=${t}\n\nDo not email sensitive case records. Contact: architect@kapukai.org`);
  await db(`assurance_connections?id=eq.${row.id}`,'PATCH',{delivery_status:status});
  return out(200,{message:status==='accepted'?'Request saved. Check your email to confirm before it becomes an active inquiry or subscription.':'Request saved, but confirmation email is unavailable. It is not an active subscription. Contact architect@kapukai.org for assistance.',delivery:status});
 }catch(e){
  if(e instanceof SyntaxError||(e instanceof Error&&e.message==='validation'))return out(400,{error:'Please check the form fields.'});
  console.error('assurance_connect_failed');
  return out(503,{error:'We could not complete this request. Please try again or email architect@kapukai.org.'});
 }
});
