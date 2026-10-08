import { createHandler } from "./handler.mjs";

// Existing project-wide secrets are reused only inside this server function.
const env = (key: string) => Deno.env.get(key) || "";
function serviceKey(): string {
  try { return JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}").default || env("SUPABASE_SERVICE_ROLE_KEY"); }
  catch { return env("SUPABASE_SERVICE_ROLE_KEY"); }
}
const key=serviceKey();
const base=env("SUPABASE_URL");
const providerToken=env("POSTMARK_SERVER_TOKEN");
const from=env("POSTMARK_FROM_EMAIL");
const configured=Boolean(key && base && providerToken && from);
async function rpc(name: string,parameters: unknown) {
  const res=await fetch(base+"/rest/v1/rpc/"+name,{
    method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify(parameters),signal:AbortSignal.timeout(10000)
  });
  if(!res.ok)throw new Error("RPC_FAILED");
  const text=await res.text();return text?JSON.parse(text):null;
}
async function rateFingerprint(value: string) {
  const hmac=await crypto.subtle.importKey("raw",new TextEncoder().encode(key),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=await crypto.subtle.sign("HMAC",hmac,new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
}
async function sendConfirmation(message: {email:string,intentId:string,subject:string,text:string}) {
  // Necessary double-opt-in mail only. No newsletter, invitation, campaign or owner notification.
  const res=await fetch("https://api.postmarkapp.com/email",{
    method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json",
      "X-Postmark-Server-Token":providerToken},
    body:JSON.stringify({From:from,To:message.email,ReplyTo:"architect@kapukai.org",
      Subject:message.subject,TextBody:message.text,MessageStream:"outbound",
      Tag:"kapukai-scoped-confirmation",TrackOpens:false,TrackLinks:"None",
      Metadata:{scoped_intent_id:message.intentId,message_type:"scoped_confirmation"}}),
    signal:AbortSignal.timeout(10000)
  });
  let payload;try{payload=await res.json();}catch{return {state:"unknown",providerMessageId:null};}
  if(res.ok && payload.ErrorCode===0 && typeof payload.MessageID==="string")
    return {state:"accepted",providerMessageId:payload.MessageID};
  // A documented provider error response is definite failure, not proof of delivery.
  return {state:typeof payload.ErrorCode==="number" && payload.ErrorCode!==0?"failed":"unknown",providerMessageId:null};
}
Deno.serve(createHandler({rpc,sendConfirmation,rateFingerprint,
  isOpen:async()=>configured && await rpc("kapukai_scoped_is_open",{})===true}));

