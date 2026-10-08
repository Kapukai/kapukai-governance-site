import {createHandler} from "./handler.mjs";
const env=(key:string)=>Deno.env.get(key)||"";
function serviceKey(){try{return JSON.parse(env("SUPABASE_SECRET_KEYS")||"{}").default||env("SUPABASE_SERVICE_ROLE_KEY");}catch{return env("SUPABASE_SERVICE_ROLE_KEY");}}
const key=serviceKey(),base=env("SUPABASE_URL"),providerToken=env("POSTMARK_SERVER_TOKEN"),from=env("POSTMARK_FROM_EMAIL");
async function rpc(name:string,parameters:unknown){
 const res=await fetch(base+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify(parameters),signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw new Error("RPC_FAILED");const value=await res.text();return value?JSON.parse(value):null;
}
async function rateFingerprint(value:string){
 const hmac=await crypto.subtle.importKey("raw",new TextEncoder().encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const bytes=await crypto.subtle.sign("HMAC",hmac,new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");
}
async function sendConfirmation(message:{email:string,applicationId:string,subject:string,text:string}){
 const res=await fetch("https://api.postmarkapp.com/email",{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json","X-Postmark-Server-Token":providerToken},
 body:JSON.stringify({From:from,To:message.email,ReplyTo:"architect@kapukai.org",Subject:message.subject,TextBody:message.text,MessageStream:"outbound",Tag:"kapukai-application-confirmation",TrackOpens:false,TrackLinks:"None",Metadata:{application_id:message.applicationId,message_type:"application_confirmation"}}),signal:AbortSignal.timeout(10000)});
 let payload;try{payload=await res.json();}catch{return {state:"unknown",providerMessageId:null};}
 if(res.ok && payload.ErrorCode===0 && typeof payload.MessageID==="string")return {state:"accepted",providerMessageId:payload.MessageID};
 return {state:typeof payload.ErrorCode==="number" && payload.ErrorCode!==0?"failed":"unknown",providerMessageId:null};
}
Deno.serve(createHandler({rpc,rateFingerprint,sendConfirmation,isOpen:async()=>Boolean(key&&base&&providerToken&&from)&&await rpc("kapukai_application_is_open",{})===true}));
