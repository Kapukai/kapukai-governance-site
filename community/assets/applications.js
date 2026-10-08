'use strict';
(() => {
  const ENDPOINT = 'https://tbxfsjipkrdwyctepesf.supabase.co/functions/v1/kapukai-community-apply';
  const VERSION = 'kapukai-applications-v1-2026-10-08';
  const labels = {
    assistance: 'Assistance application', reviewer: 'Independent reviewer application', witness: 'Observation volunteer application',
    tools: 'Using the tools', timeline: 'Timeline organization', evidence_dossier: 'Evidence organization', affidavit_formatting: 'Affidavit formatting', training: 'Learning and training', independent_review: 'Independent review interest',
    free: 'Free help', discounted: 'Discounted help', awaiting_email: 'Awaiting email confirmation', awaiting_human_review: 'Awaiting human review', withdrawn: 'Withdrawn', closed: 'Closed'
  };
  async function call(body) {
    let response;
    try {
      response = await fetch(ENDPOINT, {method: 'POST', credentials: 'omit', signal: AbortSignal.timeout(20000), headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    } catch (_) { throw new Error('The application service could not be reached. Your entries are still here. Please try again.'); }
    let data;
    try { data = await response.json(); } catch (_) { throw new Error('The application service did not return a completed response. Please try again later.'); }
    if (!response.ok || !data.ok) {
      if (response.status === 503) throw new Error('Applications are temporarily paused. Please try again later, or contact architect@kapukai.org with a general question.');
      if (response.status === 409) { const error = new Error('This application changed since you opened it. The latest step has been loaded; review it before trying again.'); error.stale=true; throw error; }
      if (response.status === 403) throw new Error('This action is not available for this application. You can still use the withdrawal option if it is shown.');
      if (response.status === 429) throw new Error('The daily update limit has been reached. Please wait before trying again. You can still close or withdraw this application.');
      if (body.action !== 'request' && [400, 404, 410].includes(response.status)) throw new Error('This private link cannot be used now. It may have expired or been withdrawn. Contact architect@kapukai.org if you need help.');
      throw new Error('The request was not completed. Check your entries and try again. If this continues, contact architect@kapukai.org.');
    }
    if (body.action === 'request' && response.status !== 202) throw new Error('The service did not confirm receipt. Please try again later.');
    return data;
  }
  const form = document.querySelector('form[data-application]');
  if (form) {
    const mounted = Date.now();
    const status = document.getElementById('application-status');
    const submit = form.querySelector('button[type="submit"]');
    const value = name => form.elements.namedItem(name)?.value || '';
    const checked = name => Boolean(form.elements.namedItem(name)?.checked);
    const alias = form.elements.namedItem('display_alias');
    alias.addEventListener('input', () => alias.setCustomValidity(/[\u0000-\u001f\u007f<>@:/\\]/.test(alias.value) ? 'Use a short name or alias without links, contact details or special markup.' : ''));
    let lastFingerprint = '', requestId = '';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity() || submit.disabled) return;
      const kind = form.dataset.application === 'assistance' ? 'assistance' : value('kind');
      const selection = {email: value('email').trim(), display_alias: value('display_alias').trim(), kind, service_interest: value('service_interest'), requested_support: kind === 'assistance' ? value('requested_support') : null, profession: kind === 'assistance' ? null : value('profession') || 'prefer_not_to_say', availability: kind === 'assistance' ? null : value('availability') || 'unsure'};
      const fingerprint = JSON.stringify(selection);
      if (fingerprint !== lastFingerprint) { lastFingerprint = fingerprint; requestId = crypto.randomUUID(); }
      submit.disabled = true;
      status.className = 'status';
      status.textContent = 'Sending your request…';
      try {
        await call({...selection, action: 'request', request_id: requestId, consent_version: VERSION, source_path: form.dataset.applicationSource, started_at: mounted, adult: checked('adult'), privacy_acknowledged: checked('privacy_acknowledged'), human_review_acknowledged: checked('human_review_acknowledged'), website: value('website')});
        status.className = 'status success';
        status.textContent = 'Request received. Check your email for a private confirmation link. Review the application and choose Confirm. Only then does it enter human review. Receipt here does not guarantee email delivery, assistance or an assignment.';
        submit.textContent = 'Request received';
      } catch (error) {
        status.className = 'status error';
        status.textContent = error.message;
        submit.disabled = false;
      }
    });
  }
  const manageStatus = document.getElementById('application-manage-status');
  if (manageStatus) {
    const token = new URLSearchParams(location.hash.slice(1)).get('app_token');
    if (token) history.replaceState(null, '', location.pathname);
    const details = document.getElementById('application-details');
    const summary = document.getElementById('application-summary');
    const confirm = document.getElementById('application-confirm');
    const withdraw = document.getElementById('application-withdraw');
    const lifecycle = document.getElementById('application-lifecycle');
    manageStatus.setAttribute('tabindex','-1');
    let latest=null,busy=false,lastRequestKey='',lastRequestId='';
    const resources={practice:['Fictional practice cases','/community/practice/'],tester_guide:['Fictional testing guide','/community/files/synthetic_tester_guide.md'],learning:['Learning resources and notices','/community/learn/'],reviewer_orientation:['Reviewer and observation orientation','/community/reviewers/']};
    const stages={queue:'Awaiting human review',reviewing:'Under human review',clarification:'A preference needs clarification',waitlisted:'Waiting for capacity',declined:'Closed by the reviewer',offered:'A free next step is available',accepted:'Interest accepted; waiting for the next step',in_progress:'Support in progress',delivered:'A resource has been provided',correction_requested:'Correction requested',closed:'Closed',withdrawn:'Withdrawn'};
    const reasonLabels={capacity:'Available capacity',scope:'Fit with the available scope',no_response:'No response received',completed:'The scoped step is complete',applicant_request:'The applicant requested closure',offer_expired:'The offer expired'};
    const actionNames={clarify:'Send my preference',accept_offer:'Accept this nonbinding offer',decline_offer:'Decline this offer',delivery_received:'Acknowledge receipt',feedback:'Save private feedback',correction:'Request a correction',reconsider:'Request reconsideration',close:'Close this application'};
    function el(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
    function field(form,name,title,choices){const wrap=el('div',null,'field');const label=el('label',title);const input=el('select');input.id='app-'+name;input.name=name;label.htmlFor=input.id;for(const [value,label] of choices){const option=el('option',label);option.value=value;input.append(option);}wrap.append(label,input);form.append(wrap);return input;}
    function addDetail(target,title,value){if(value==null)return;target.append(el('dt',title),el('dd',value));}
    function dateLabel(value){const d=new Date(value);return Number.isNaN(d.getTime())?'Not stated':d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});}
    function renderLifecycle(data){
      if(!lifecycle)return;
      lifecycle.replaceChildren();lifecycle.hidden=!data;
      if(!data)return;
      lifecycle.append(el('p','Private progress · Human decisions','eyebrow'),el('h2',data.stage==='offered'&&data.offer?.state==='expired'?'This offer has expired':stages[data.stage]||'Application progress'));
      const dl=el('dl');addDetail(dl,'Current step',stages[data.stage]||'Contact us for details');
      if(data.reason)addDetail(dl,'Reason',reasonLabels[data.reason]||'Contact us for details');
      lifecycle.append(dl);
      if(data.offer){
        const offer=el('div',null,'notice');offer.append(el('strong','Free, nonbinding resource offer'));offer.append(el('p','Offer status: '+String(data.offer.state||'pending').replaceAll('_',' ')+'.','small'));
        const resource=resources[data.offer.resource_id];
        offer.append(el('p',(resource?.[0]||'Scoped public resource')+' · Proposed scope: '+data.offer.minutes+' minutes. Offer expires '+dateLabel(data.offer.expires_at)+'.'));
        offer.append(el('p','This is an invitation to use a public resource or practice step. It does not book an appointment, charge money, sign a contract, certify expertise or authorize private record sharing. You can decline.'));
        lifecycle.append(offer);
      }
      if(data.delivery){const resource=resources[data.delivery.resource_id];const delivery=el('div',null,'delivery-resource');delivery.append(el('h3','Your provided resource'));if(resource){const link=el('a',resource[0]);link.href=resource[1];delivery.append(link);}else delivery.append(el('p','Contact us to check this resource.'));delivery.append(el('p','Delivery version '+data.delivery.version+'. Acknowledging receipt does not mean the result is accurate or waive a correction request.','small'));lifecycle.append(delivery);}
      if(data.feedback){lifecycle.append(el('p','Your structured feedback is saved privately. It is not a public testimonial.','small'));}
      const allowed=Array.isArray(data.actions)?data.actions:[];
      if(!allowed.length)lifecycle.append(el('p',data.stage==='withdrawn'?'No further action is required.':data.stage==='waitlisted'?'Your request remains on the waitlist. Capacity is reviewed by a person; there is no promised date.':'No action is required from you right now. Keep your original private email link to check progress.'));
      for(const command of ['clarify','accept_offer','decline_offer','delivery_received','feedback','correction','reconsider','close'].filter(action=>allowed.includes(action))){
        if(!actionNames[command])continue;
        const form=el('form',null,'lifecycle-action');form.dataset.lifecycleCommand=command;
        if(command==='clarify'){
          form.append(el('h3','Clarify one broad preference'));
          if(data.clarification_field==='availability')field(form,'value','Broad availability',[['unsure','Not sure yet'],['occasional','Occasional'],['monthly','About once a month'],['weekly','About once a week']]);
          else field(form,'value','Area of interest',[['tools','Using the tools'],['timeline','Timeline organization'],['evidence_dossier','Evidence organization'],['affidavit_formatting','Affidavit formatting'],['training','Learning and training'],['independent_review','Independent review interest']]);
          form.append(el('p','No personal history, exact schedule or location is needed.','small'));
        }
        if(command==='feedback'){
          form.append(el('h3','What factually worked?'));
          field(form,'working','Did the provided step work?',[['yes','Yes'],['partly','Partly'],['no','No']]);
          field(form,'broken','What was broken?',[['none','Nothing observed'],['access','Access to the resource'],['navigation','Navigation'],['formatting','Formatting'],['incorrect_information','Incorrect information']]);
          field(form,'improvement','Most useful improvement',[['none','None selected'],['clarity','Clarity'],['accessibility','Accessibility'],['speed','Speed'],['features','Features']]);
          form.append(el('p','Optional, private feedback. Assistance does not depend on a favorable response. Do not add case information.','small'));
        }
        if(command==='correction')field(form,'category','What needs correction?',[['access','Cannot access the resource'],['formatting','Formatting problem'],['incorrect_information','Incorrect information'],['missing_resource','Missing resource']]);
        if(command==='reconsider')form.append(el('p','A person will review the closed decision again. This does not guarantee an offer or a response date.','small'));
        if(command==='close')form.append(el('p','Close the active application. Separate email preferences and your right to request a correction remain separate.','small'));
        const button=el('button',actionNames[command],['decline_offer','close'].includes(command)?'button secondary':null);button.type='submit';form.append(button);
        form.addEventListener('submit',event=>{event.preventDefault();const payload={};for(const item of form.querySelectorAll('select'))payload[item.name]=item.value;actLifecycle(command,payload);});
        lifecycle.append(form);
      }
      if(data.history?.length){const history=el('details');history.append(el('summary','Application history'));const list=el('ol',null,'history-list');const historyNames={confirm:'Email confirmed',review:'Human review started',clarify:'Preference clarification requested',clarification_received:'Preference received',waitlist:'Added to the waitlist',decline:'Review closed',offer:'Free offer proposed',accept_offer:'Offer interest accepted',decline_offer:'Offer declined',start:'Scoped support started',deliver:'Resource provided',delivery_received:'Receipt acknowledged',feedback:'Private feedback recorded',correction:'Correction requested',resolve_correction:'Corrected resource provided',reconsider:'Reconsideration requested',close:'Application closed',withdraw:'Application withdrawn',pause:'Work paused'};for(const item of data.history){const label=item.action==='clarify'&&item.actor==='applicant'?'Your preference was recorded':historyNames[item.action]||'Application updated';list.append(el('li',label+(item.delivery_version?' · delivery version '+item.delivery_version:'')+' · '+dateLabel(item.at)));}history.append(list);lifecycle.append(history);}
    }
    function showSummary(data) {
      latest=data;summary.replaceChildren();
      for (const [title, value] of [['Application',data.kind],['Area of interest',data.service_interest],['Support requested',data.requested_support],['Current state',data.state]]) {
        if (!value) continue;
        addDetail(summary,title,labels[value] || 'Contact us for details');
      }
      details.hidden = false;
      confirm.hidden = !data.can_confirm || Boolean(data.blocked);
      withdraw.hidden = !data.can_withdraw;
      if (data.state === 'withdrawn') manageStatus.textContent = 'This application has been withdrawn. Separate email subscriptions are unchanged.';
      else if (data.blocked) manageStatus.textContent = data.can_withdraw ? 'This application cannot be confirmed. You can still withdraw it below. Separate email preferences remain unchanged.' : 'This application cannot be confirmed or changed through this link. Contact architect@kapukai.org for help.';
      else if (data.can_confirm) manageStatus.textContent = 'Review the request below. Opening this page has not confirmed it. Choose Confirm to request human review, or Withdraw to cancel this application.';
      else if (data.state === 'awaiting_human_review') manageStatus.textContent = !data.lifecycle || data.lifecycle.stage==='queue' ? 'This application is confirmed and awaiting human review. Capacity and your choices determine the next step.' : 'This application is confirmed. Human review, capacity and your choices determine the next step.';
      else manageStatus.textContent = 'Review the current step below, or contact us for help.';
      renderLifecycle(data.lifecycle);
    }
    async function refresh() { showSummary(await call({action: 'inspect', token})); }
    function lock(value){busy=value;for(const button of details.querySelectorAll('button'))button.disabled=value;}
    if (!token) manageStatus.textContent = 'Open the private application link in your confirmation email. If you need a new link, return to the application form or contact us.';
    else refresh().catch(error => {manageStatus.textContent = error.message; details.hidden = true;});
    async function act(action) {
      if (busy) return;lock(true);
      manageStatus.textContent = action === 'confirm' ? 'Confirming your application…' : 'Withdrawing this application…';
      try {
        const data = await call({action, token});
        const accepted = action === 'confirm' ? data.state === 'awaiting_human_review' : data.state === 'withdrawn';
        if (!accepted) throw new Error('The service did not confirm that change. Contact us before assuming the application status changed.');
        await refresh();
      } catch (error) { manageStatus.textContent = error.message; }
      finally {lock(false);manageStatus.focus();}
    }
    async function actLifecycle(command,payload){
      if(busy||!latest?.lifecycle?.actions?.includes(command))return;
      const expected_revision=latest.lifecycle.revision;
      const key=JSON.stringify({command,payload,expected_revision});
      if(lastRequestKey!==key){lastRequestKey=key;lastRequestId=crypto.randomUUID();}
      lock(true);manageStatus.textContent='Saving your choice…';
      try{
        const result=await call({action:'lifecycle',token,command,expected_revision,request_id:lastRequestId,payload});
        if(!result.lifecycle)throw new Error('The service did not confirm the updated step. Refresh your original private email link before assuming it changed.');
        showSummary({...latest,lifecycle:result.lifecycle});manageStatus.textContent='Your choice was saved. Review the current step below.';
      }catch(error){
        if(error.stale){try{await refresh();}catch{/* Original stale error remains actionable. */}}
        manageStatus.textContent=error.message;
      }finally{lock(false);manageStatus.focus();}
    }
    confirm.addEventListener('click', () => act('confirm'));
    withdraw.addEventListener('click', () => act('withdraw'));
  }
})();
