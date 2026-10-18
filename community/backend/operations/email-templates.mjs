import {renderKapukaiEmail,escapeHtml} from '../supabase/functions/kapukai-scoped-signup/kapukai-email.mjs';
export const TEMPLATES=Object.freeze({
 engineer:{subject:'Your engineering interest in Kapukai',paragraphs:['Thank you for your interest in bringing engineering into public service.','The next step is a conversation about your discipline, experience, availability, and a bounded piece of work. Any credential verification and assignment happen separately.']},
 technician:{subject:'Your technician interest in Kapukai',paragraphs:['Thank you for your interest in helping test public decision systems.','We will discuss a suitable procedure, its instructions, supervision, and the evidence needed to record a result. Expressing interest does not assign you to a project.']},
 tester:{subject:'Your interest in testing Kapukai tools',paragraphs:['Thank you for offering to help improve the tools.','A suitable test invitation will describe the task, expected result, and how to share feedback. Please use fictional practice material unless a separately protected workflow has been agreed.']},
 evaluation:{subject:'Your Kapukai evaluation inquiry',paragraphs:['Thank you for asking about an evaluation.','Our next step is to identify the decision process, the question to examine, and a useful deliverable. Scope, price, and timing must be agreed before work begins. Please do not send private case records by email.']},
 follow_up:{subject:'The next step with Kapukai',paragraphs:['Here is the next step we have recorded together.','If it no longer fits your needs or availability, please reply so we can update the plan.']},
 correction:{subject:'An update on your correction request',paragraphs:['Your correction request needs a clear outcome and a way to verify it.','Please review the agreed next step below. A repair attempt or a sent email does not, by itself, mean the issue is resolved.']},
});
export function participationEmail(kind,{nextAction='',dueDate=''}={}){
 const t=TEMPLATES[kind];if(!t)throw Error('Unknown template');
 if([nextAction,dueDate].some(v=>typeof v!=='string'||v.length>300))throw Error('Invalid template input');
 const paragraphs=[...t.paragraphs,...(nextAction?['Next step: '+nextAction]:[]),...(dueDate?['Target date: '+dueDate]:[])];
 const text=paragraphs.join('\n\n')+'\n\nKapukai Governance Lab\narchitect@kapukai.org';
 return {Subject:t.subject,TextBody:text,HtmlBody:renderKapukaiEmail({title:t.subject,preheader:t.paragraphs[0],bodyHtml:paragraphs.map(p=>'<p style="margin:0 0 20px">'+escapeHtml(p)+'</p>').join(''),signatureName:'Kapukai',footer:'This message concerns your requested participation. Reply to change or close this conversation.'})};
}
// Deliberately no send function. Use a current purpose/consent check and an
// explicitly reviewed action before dispatch. Unknown delivery must be reconciled.
