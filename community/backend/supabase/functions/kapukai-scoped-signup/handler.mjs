export const CONSENT_VERSION = "kapukai-scoped-v2-2026-10-08";
const LEGACY_CONSENT = "kapukai-scoped-v1-2026-10-05";
export const SIGNUP_PAGE = "https://kapukai-join.christinehillier.chatgpt.site/join/";
export const ALLOWED_ORIGINS = new Set([
  "https://kapukai.org", "https://www.kapukai.org",
  "https://kapukai-join.christinehillier.chatgpt.site"
]);
export const TOPICS = Object.freeze({
  tester_invites: "Tester invitations",
  remedy_brief: "Remedy Brief",
  volunteer: "Volunteer opportunities",
  free_classes: "Free classes and webinars",
  connect: "Collaboration and connection"
});
const REQUEST_KEYS = new Set(["action","email","topics","newsletter_cadence","request_id",
  "consent_version","source_path","started_at","privacy_acknowledged","adult","website","tool_interests"]);
const TOKEN_KEYS = new Set(["action","token","topics"]);
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERIC = Object.freeze({ok:true,code:"REQUEST_RECEIVED",
  message:"Request received. If this address is eligible, a confirmation link will arrive. Your choices are not active until you confirm."});
function json(status,body,origin) {
  const headers = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
    "Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Vary":"Origin"};
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"]=origin;
  return new Response(JSON.stringify(body),{status,headers});
}
export async function hashToken(token) {
  const buffer=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,"0")).join("");
}
export function randomToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}
export function validateRequest(body,now=Date.now()) {
  if (!body || Array.isArray(body) || typeof body!=="object"
    || Object.keys(body).some(k=>!REQUEST_KEYS.has(k))) return {error:"Unsupported request fields."};
  if (body.action!=="request") return {error:"Invalid action."};
  if (typeof body.website==="string" && body.website.trim()) return {bot:true};
  if (body.website!==undefined && typeof body.website!=="string") return {error:"Invalid form."};
  const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
  if (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return {error:"Enter a valid email address."};
  if (!Array.isArray(body.topics) || body.topics.length<1 || body.topics.length>5
    || body.topics.some(t=>!Object.hasOwn(TOPICS,t)) || new Set(body.topics).size!==body.topics.length)
    return {error:"Choose at least one available topic."};
  const selectedTools=body.tool_interests??[];
  if (!Array.isArray(selectedTools) || selectedTools.length>3 || new Set(selectedTools).size!==selectedTools.length || selectedTools.some(t=>!["affidavit","timeline","evidence_dossier"].includes(t)) || (selectedTools.length>0 && !body.topics.includes("tester_invites"))) return {error:"Choose available tool interests."};
  if (!["monthly","every_other_week"].includes(body.newsletter_cadence)) return {error:"Choose a newsletter frequency."};
  if (!UUID_RE.test(body.request_id || "") || ![CONSENT_VERSION,LEGACY_CONSENT].includes(body.consent_version)
    || (body.consent_version===LEGACY_CONSENT && body.topics.some(t=>!["tester_invites","remedy_brief"].includes(t)))
    || !["/join","/testers","/newsletter","/community"].includes(body.source_path)
    || body.privacy_acknowledged!==true || body.adult!==true)
    return {error:"Review the choices and privacy notice, then try again."};
  if (!Number.isFinite(body.started_at) || now-body.started_at<1200 || now-body.started_at>86400000)
    return {error:"Please reload the form and try again."};
  return {value:{...body,email,topics:[...body.topics].sort(),tool_interests:[...selectedTools].sort()}};
}
async function readBoundedJson(req) {
  if (!(req.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
    throw new Error("CONTENT_TYPE");
  if (Number(req.headers.get("content-length")||0)>4096) throw new Error("TOO_LARGE");
  const reader=req.body?.getReader();
  if (!reader) throw new Error("INVALID_JSON");
  let length=0;const parts=[];
  while (true) { const {done,value}=await reader.read(); if(done)break;
    length+=value.byteLength; if(length>4096){await reader.cancel();throw new Error("TOO_LARGE");}
    parts.push(value);
  }
  const bytes=new Uint8Array(length);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function confirmationMessage(topics,cadence,token) {
  const labels=topics.map(t=>TOPICS[t]).join(" and ");
  const link=SIGNUP_PAGE+"#token="+token;
  const frequency=topics.includes("remedy_brief")
    ? (cadence==="monthly"?"Monthly":"Every other week")+" for Remedy Brief. " : "";
  return {
    subject:"Confirm your Kapukai choices",
    text:"You requested "+labels+". "+frequency+
      "Invitations and connection follow-ups are sent when relevant opportunities are available. Free class and webinar dates have not yet been announced.\n\n"+
      "Review and confirm these choices: "+link+"\n\n"+
      "The confirmation expires in 48 hours. Opening the link does not subscribe you; select Confirm on the page. "+
      "The same page lets you stop these selected topics without logging in for 180 days.\n\n"+
      "If you did not request this, ignore this email. No new subscription will be activated.\n"+
      "Kapukai Governance Lab\narchitect@kapukai.org"
  };
}
/** Inject RPC/mail adapters. No campaign sender is included in this add-on. */
export function createHandler({rpc,sendConfirmation,rateFingerprint,enabled=false,isOpen=async()=>enabled,clock=()=>Date.now(),newToken=randomToken}) {
  return async function handler(req) {
    const origin=req.headers.get("origin");
    if(req.method==="GET") {
      const token=new URL(req.url).searchParams.get("token");
      const target=TOKEN_RE.test(token||"") ? SIGNUP_PAGE+"#token="+token : SIGNUP_PAGE;
      return new Response(null,{status:303,headers:{"Location":target,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
    }
    if(!origin || !ALLOWED_ORIGINS.has(origin)) return json(403,{ok:false,code:"ORIGIN_DENIED"},origin);
    if(req.method==="OPTIONS") return new Response(null,{status:204,headers:{
      "Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS",
      "Access-Control-Allow-Headers":"content-type","Vary":"Origin","Cache-Control":"no-store"}});
    if(req.method!=="POST") return json(405,{ok:false,code:"METHOD_NOT_ALLOWED"},origin);
    let body;
    try {body=await readBoundedJson(req);}
    catch(error){return json(error.message==="TOO_LARGE"?413:400,{ok:false,code:"INVALID_BODY"},origin);}
    try {
      if(["request","confirm"].includes(body?.action) && !(await isOpen())) return json(503,{ok:false,code:"NOT_OPEN",message:"New confirmations are paused. You can still review or unsubscribe with a valid link."},origin);
      if(body?.action==="request") {
        const validation=validateRequest(body,clock());
        if(validation.bot) return json(202,GENERIC,origin);
        if(validation.error) return json(400,{ok:false,code:"INVALID_REQUEST",message:validation.error},origin);
        const value=validation.value;
        const date=new Date(clock()).toISOString().slice(0,10);
        const ip=req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        // Supplemental network control; per-address limit remains authoritative if forwarding headers vary.
        const [network,address]=await Promise.all([
          rateFingerprint("scoped-network|"+date+"|"+ip),
          rateFingerprint("scoped-address|"+date+"|"+value.email)
        ]);
        const networkAllowed=await rpc("kapukai_claim_signup_attempt",{p_fingerprint:network,p_limit:40});
        const addressAllowed=await rpc("kapukai_claim_signup_attempt",{p_fingerprint:address,p_limit:3});
        if(networkAllowed!==true || addressAllowed!==true) return json(202,GENERIC,origin);
        const token=newToken();
        const result=await rpc("kapukai_scoped_request",{
          p_email:value.email,p_topics:value.topics,p_token_hash:await hashToken(token),
          p_request_id:value.request_id,p_consent_version:value.consent_version,p_source_path:value.source_path,
          p_newsletter_cadence:value.newsletter_cadence,p_tool_interests:value.tool_interests
        });
        if(result?.result==="created") {
          let delivery={state:"unknown",providerMessageId:null};
          try { delivery=await sendConfirmation({email:value.email,intentId:result.intent_id,
            ...confirmationMessage(value.topics,value.newsletter_cadence,token)}); }
          catch { /* An ambiguous provider result must not trigger an automatic resend. */ }
          try { await rpc("kapukai_scoped_mail_result",{p_intent_id:result.intent_id,
            p_state:delivery.state,p_provider_message_id:delivery.providerMessageId||null}); }
          catch { /* Do not resend: operator reconciles pending/unknown receipts. */ }
        } else if(!["duplicate","suppressed"].includes(result?.result)) throw new Error("REQUEST_RESULT");
        return json(202,GENERIC,origin);
      }
      if(!body || Array.isArray(body) || typeof body!=="object"
        || Object.keys(body).some(k=>!TOKEN_KEYS.has(k))
        || !["inspect","confirm","revoke"].includes(body.action)
        || !TOKEN_RE.test(body.token||"")
        || (body.action!=="revoke" && body.topics!==undefined)
        || (body.action==="revoke" && (!Array.isArray(body.topics) || body.topics.length<1
            || body.topics.length>5 || body.topics.some(t=>!Object.hasOwn(TOPICS,t)))))
        return json(400,{ok:false,code:"INVALID_REQUEST"},origin);
      const result=await rpc("kapukai_scoped_token",{p_token_hash:await hashToken(body.token),
        p_action:body.action,p_topics:body.action==="revoke"?body.topics:null});
      const successful=["valid","confirmed","already_confirmed","unsubscribed","revoked"].includes(result?.result);
      return json(successful?200:result?.result==="expired"?410:400,
        {ok:successful,...result},origin);
    } catch {
      return json(503,{ok:false,code:"TEMPORARILY_UNAVAILABLE",message:"We could not complete this request. Please try again later."},origin);
    }
  };
}

