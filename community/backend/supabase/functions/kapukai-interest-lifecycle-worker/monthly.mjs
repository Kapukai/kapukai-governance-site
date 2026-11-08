import {brandMessage} from './kapukai-email.mjs';

const unsubscribe='{{{ pm:unsubscribe }}}';
export function renderMonthly(job, postalAddress) {
  const text=job.body+'\n\nKapukai Governance Lab\n'+postalAddress;
  const branded=brandMessage({Subject:job.subject,TextBody:text});
  const footer='<p style="font:13px/20px Arial,sans-serif;text-align:center"><a href="'+unsubscribe+'">Unsubscribe from Kapukai broadcast emails</a></p>';
  return {TextBody:text+'\nUnsubscribe from Kapukai broadcast emails: '+unsubscribe,
    HtmlBody:branded.HtmlBody.replace('</body>',footer+'</body>')};
}

export async function monthlyTick({config,rpc,provider,sender,replyTo,postalAddress}) {
  if(config.mode!=='live'||!config.postmark_ready_at||!sender||!postalAddress||!config.broadcast_stream)return 'held';
  const rows=await rpc('next',{});
  const job=rows[0];
  if(!job)return 'empty';
  const complete=(result,id=null)=>rpc('finish',{p_job:job.job_id,p_result:result,p_provider:id});
  // A provider-managed link must be substituted in both MIME parts on the designated broadcast stream.
  // Never fall back to a transactional stream or send without a working suppression mechanism.
  let stream;
  try {const r=await provider('/message-streams/'+encodeURIComponent(config.broadcast_stream)); if(r.ok)stream=await r.json();}catch{}
  if(!stream||stream.ID!==config.broadcast_stream||stream.MessageStreamType!=='Broadcasts'||stream.SubscriptionManagementConfiguration?.UnsubscribeHandlingType!=='Postmark'||stream.ArchivedAt) {
    await complete('failed');return 'stream-check-failed';
  }
  // Re-read consent and release after external preflight, immediately before the network call.
  if(!await rpc('may_send',{p_job:job.job_id}))return 'held';
  let outcome='unknown',messageId=null;
  try {
    const r=await provider('/email',{method:'POST',body:JSON.stringify({From:sender,To:job.recipient,ReplyTo:replyTo,
      Subject:job.subject,...renderMonthly(job,postalAddress),MessageStream:config.broadcast_stream,
      Tag:'remedy-brief-monthly',TrackOpens:false,TrackLinks:'None',Metadata:{message_type:'lifecycle_broadcast',edition_month:job.edition_month,remedy_job:job.job_id}})});
    const p=await r.json();
    if(r.ok&&p.ErrorCode===0&&typeof p.MessageID==='string'&&p.MessageID){outcome='accepted';messageId=p.MessageID;}
    else if(r.status>=400&&r.status<500&&p.ErrorCode)outcome='failed';
  }catch{} // timeout or malformed response is ambiguous; require reconciliation, never auto-resend
  await complete(outcome,messageId);
  return outcome;
}
