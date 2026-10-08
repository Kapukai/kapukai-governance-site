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
      if (response.status === 429) throw new Error('Too many requests were received. Please wait before trying again.');
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
    function showSummary(data) {
      summary.replaceChildren();
      for (const [title, value] of [['Application',data.kind],['Area of interest',data.service_interest],['Support requested',data.requested_support],['Current state',data.state]]) {
        if (!value) continue;
        const term = document.createElement('dt'); const description = document.createElement('dd');
        term.textContent = title; description.textContent = labels[value] || 'Contact us for details';
        summary.append(term,description);
      }
      details.hidden = false;
      confirm.hidden = !data.can_confirm || Boolean(data.blocked);
      withdraw.hidden = !data.can_withdraw;
      if (data.state === 'withdrawn') manageStatus.textContent = 'This application has been withdrawn. Separate email subscriptions are unchanged.';
      else if (data.blocked) manageStatus.textContent = data.can_withdraw ? 'This application cannot be confirmed. You can still withdraw it below. Separate email preferences remain unchanged.' : 'This application cannot be confirmed or changed through this link. Contact architect@kapukai.org for help.';
      else if (data.can_confirm) manageStatus.textContent = 'Review the request below. Opening this page has not confirmed it. Choose Confirm to request human review, or Withdraw to cancel this application.';
      else if (data.state === 'awaiting_human_review') manageStatus.textContent = 'This application is confirmed and awaiting human review. Availability and next steps are decided separately.';
      else manageStatus.textContent = 'This application cannot be confirmed now. Contact us if you need help with the next step.';
    }
    async function refresh() { showSummary(await call({action: 'inspect', token})); }
    if (!token) manageStatus.textContent = 'Open the private application link in your confirmation email. If you need a new link, return to the application form or contact us.';
    else refresh().catch(error => {manageStatus.textContent = error.message; details.hidden = true;});
    async function act(action) {
      if (confirm.disabled || withdraw.disabled) return;
      confirm.disabled = true; withdraw.disabled = true;
      manageStatus.textContent = action === 'confirm' ? 'Confirming your application…' : 'Withdrawing this application…';
      try {
        const data = await call({action, token});
        const accepted = action === 'confirm' ? data.state === 'awaiting_human_review' : data.state === 'withdrawn';
        if (!accepted) throw new Error('The service did not confirm that change. Contact us before assuming the application status changed.');
        await refresh();
      } catch (error) { manageStatus.textContent = error.message; }
      finally {confirm.disabled = false; withdraw.disabled = false;}
    }
    confirm.addEventListener('click', () => act('confirm'));
    withdraw.addEventListener('click', () => act('withdraw'));
  }
})();
