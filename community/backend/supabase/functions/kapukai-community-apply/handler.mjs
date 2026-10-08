export const CONSENT_VERSION = "kapukai-applications-v1-2026-10-08";
// Keep confirmation usable at the verified release host until the apex route is installed.
export const APPLICATION_PAGE = "https://kapukai-community.vercel.app/community/apply/";
export const ALLOWED_ORIGINS = new Set(["https://kapukai.org","https://www.kapukai.org","https://kapukai-community.vercel.app"]);
export const KINDS = Object.freeze(["assistance","reviewer","witness"]);
export const SERVICES = Object.freeze(["tools","timeline","evidence_dossier","affidavit_formatting","training","independent_review"]);
export const PROFESSIONS = Object.freeze(["engineering","education","research","administration","community","other","prefer_not_to_say"]);
export const AVAILABILITY = Object.freeze(["occasional","monthly","weekly","unsure"]);
const KEYS=new Set(["action","email","display_alias","kind","service_interest","requested_support","profession","availability","request_id","consent_version","source_path","started_at","privacy_acknowledged","adult","human_review_acknowledged","website"]);
const TOKEN_RE=/^[A-Za-z0-9_-]{43}$/;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERIC=Object.freeze({ok:true,code:"REQUEST_RECEIVED",message:"Request received. If this address can receive application mail, we will attempt to send a confirmation link. Confirming requests human review; it does not guarantee assistance or a volunteer role."});
export async function hashToken(token) {
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
}
export function randomToken(){return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");}
function json(status,body,origin){
 const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Vary":"Origin"};
 if(ALLOWED_ORIGINS.has(origin))headers["Access-Control-Allow-Origin"]=origin;
 return new Response(JSON.stringify(body),{status,headers});
}
export function validateRequest(body,now=Date.now()){
 if(!body || Array.isArray(body) || typeof body!=="object" || Object.keys(body).some(k=>!KEYS.has(k)))return {error:"Unsupported request fields. Do not submit documents or a case narrative."};
 if(body.action!=="request")return {error:"Invalid action."};
 if(typeof body.website==="string" && body.website.trim())return {bot:true};
 if(body.website!==undefined && typeof body.website!=="string")return {error:"Invalid form."};
 const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
 if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return {error:"Enter a valid email address."};
 const alias=body.display_alias==null?null:typeof body.display_alias==="string"?body.display_alias.trim():false;
 if(alias===false || (alias && (alias.length>60 || /[\u0000-\u001f\u007f<>@:/\\]/.test(alias))))return {error:"Use an optional short display alias, without contact details or links."};
 if(!KINDS.includes(body.kind) || !SERVICES.includes(body.service_interest))return {error:"Choose an available application and service."};
 const support=body.requested_support??null,profession=body.profession??null,availability=body.availability??null;
 if(body.kind==="assistance" ? !["free","discounted"].includes(support) || profession!==null || availability!==null : support!==null || (profession!==null && !PROFESSIONS.includes(profession)) || (availability!==null && !AVAILABILITY.includes(availability)))return {error:"Check the support or volunteer preferences."};
 const source=typeof body.source_path==="string"?body.source_path.replace(/\/$/,""):"";
 if(!UUID_RE.test(body.request_id||"") || body.consent_version!==CONSENT_VERSION || !["/community/assistance","/community/reviewers","/community/apply"].includes(source) || body.adult!==true || body.privacy_acknowledged!==true || body.human_review_acknowledged!==true)return {error:"Review the privacy, adult participation, and human review notices."};
 if(!Number.isFinite(body.started_at) || now-body.started_at<1200 || now-body.started_at>86400000)return {error:"Please reload the form and try again."};
 return {value:{email,request_id:body.request_id,consent_version:body.consent_version,source_path:source,application:{kind:body.kind,service_interest:body.service_interest,requested_support:support,display_alias:alias||null,profession,availability,adult:true,privacy_acknowledged:true,human_review_acknowledged:true}}};
}
async function readBody(req){
 if(!(req.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))throw new Error("INVALID_BODY");
 if(Number(req.headers.get("content-length")||0)>4096)throw new Error("TOO_LARGE");
 const reader=req.body?.getReader();if(!reader)throw new Error("INVALID_BODY");
 let length=0;const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>4096){await reader.cancel();throw new Error("TOO_LARGE");}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export function confirmationMessage(token){return {subject:"Confirm your Kapukai application request",text:
 "You requested a private Kapukai application. Review and confirm your selected application here:\n\n"+APPLICATION_PAGE+"#app_token="+token+
 "\n\nOpening the link does not confirm anything. Select Confirm on the page to request human review. Confirmation expires in 48 hours; the same link can withdraw this application for 180 days. Keep the link private.\n\n"+
 "A reviewer will consider capacity and suitability. No assistance, volunteer role, professional credential, or community membership is guaranteed. This does not subscribe you to a newsletter. Engineering and document formatting are not legal advice.\n\n"+
 "Do not reply with case records, financial records, identification, or other sensitive documents. If you did not request this, ignore the email; no application enters the review queue without confirmation.\n\nKapukai Governance Lab\narchitect@kapukai.org"};}
export function createHandler({rpc,sendConfirmation,rateFingerprint,enabled=false,isOpen=async()=>enabled,clock=()=>Date.now(),newToken=randomToken}){
 return async function handler(req){
  const origin=req.headers.get("origin");
  if(req.method==="GET")return new Response(null,{status:303,headers:{Location:APPLICATION_PAGE,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
  if(!ALLOWED_ORIGINS.has(origin))return json(403,{ok:false,code:"ORIGIN_DENIED"},origin);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"content-type","Vary":"Origin","Cache-Control":"no-store"}});
  if(req.method!=="POST")return json(405,{ok:false,code:"METHOD_NOT_ALLOWED"},origin);
  let body;try{body=await readBody(req);}catch(error){return json(error.message==="TOO_LARGE"?413:400,{ok:false,code:"INVALID_BODY"},origin);}
  try{
   if(["request","confirm"].includes(body?.action) && !(await isOpen()))return json(503,{ok:false,code:"NOT_OPEN",message:"New applications and confirmations are paused. Existing links can still review or withdraw an application."},origin);
   if(body?.action==="request"){
    const parsed=validateRequest(body,clock());if(parsed.bot)return json(202,GENERIC,origin);
    if(parsed.error)return json(400,{ok:false,code:"INVALID_REQUEST",message:parsed.error},origin);
    const value=parsed.value,date=new Date(clock()).toISOString().slice(0,10);
    const ip=(req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown").slice(0,200);
    const fingerprints=await Promise.all([rateFingerprint("application-network|"+date+"|"+ip),rateFingerprint("application-address|"+date+"|"+value.email)]);
    const network=await rpc("kapukai_claim_signup_attempt",{p_fingerprint:fingerprints[0],p_limit:40});
    const address=await rpc("kapukai_claim_signup_attempt",{p_fingerprint:fingerprints[1],p_limit:3});
    if(network!==true || address!==true)return json(202,GENERIC,origin);
    const token=newToken();
    const result=await rpc("kapukai_application_request",{p_email:value.email,p_token_hash:await hashToken(token),p_request_id:value.request_id,p_application:value.application,p_consent_version:value.consent_version,p_source_path:value.source_path});
    if(result?.result==="created"){
     let delivery={state:"unknown",providerMessageId:null};
     try{delivery=await sendConfirmation({email:value.email,applicationId:result.application_id,...confirmationMessage(token)});}catch{/* Never resend automatically after uncertain provider handoff. */}
     try{await rpc("kapukai_application_mail_result",{p_application_id:result.application_id,p_state:delivery.state,p_provider_message_id:delivery.providerMessageId||null});}catch{/* Operator reconciles; no second send. */}
    }else if(!["duplicate","suppressed","paused"].includes(result?.result))throw new Error("REQUEST_RESULT");
    if(result?.result==="paused")return json(503,{ok:false,code:"NOT_OPEN"},origin);
    return json(202,GENERIC,origin);
   }
   if(!body || typeof body!=="object" || Array.isArray(body) || Object.keys(body).some(k=>!["action","token"].includes(k)) || !["inspect","confirm","withdraw"].includes(body.action) || !TOKEN_RE.test(body.token||""))return json(400,{ok:false,code:"INVALID_REQUEST"},origin);
   const result=await rpc("kapukai_application_token",{p_token_hash:await hashToken(body.token),p_action:body.action});
   const ok=["valid","confirmed","already_confirmed","withdrawn"].includes(result?.result);
   return json(ok?200:result?.result==="expired"?410:result?.result==="paused"?503:400,{ok,...result},origin);
  }catch{return json(503,{ok:false,code:"TEMPORARILY_UNAVAILABLE",message:"We could not complete this request. Please try again later."},origin);}
 };
}
