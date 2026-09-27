/* Optional contact and topic selection. Never puts email or message into URLs. */
(() => {
  const config = window.ASSURANCE_CONFIG;
  const form = document.querySelector('#connect-form');
  const status = document.querySelector('#form-status');
  const submit = document.querySelector('#submit-button');
  let startedAt = Date.now();
  async function request(body) {
    const response = await fetch(config.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json',
        apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(25000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request unavailable. Please try again.');
    return data;
  }
  document.querySelector('#select-topics').addEventListener('click', event => {
    const boxes = [...form.querySelectorAll('[name=topics]')];
    const select = !boxes.every(box => box.checked);
    boxes.forEach(box => { box.checked = select; });
    event.target.textContent = select ? 'Clear all topics' : 'Select all current topics';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const topics = data.getAll('topics');
    if (!topics.length && !String(data.get('message')).trim()) {
      status.textContent = 'Choose an update topic or write a short general inquiry.';
      return;
    }
    submit.disabled = true; status.textContent = 'Saving your request…';
    try {
      const result = await request({ action: 'submit', email: data.get('email'),
        display_name: data.get('display_name'), message: data.get('message'), topics,
        adult: data.get('adult') === 'on', consent: data.get('consent') === 'on',
        website: data.get('website'), started_at: startedAt });
      status.textContent = result.message;
      form.reset(); startedAt = Date.now();
      document.querySelector('#select-topics').textContent = 'Select all current topics';
    } catch (error) {
      status.textContent = error.name === 'TimeoutError' ? 'The request timed out. It may have been saved; check your email before retrying.' : (error.message || 'Unable to connect. Please try again.');
    } finally { submit.disabled = false; }
  });
  // Tokens stay in URL fragments (not request paths), then are removed from history.
  const match = location.hash.match(/^#(confirm|unsubscribe)=([a-f0-9]{64})$/);
  if (match) {
    history.replaceState(null, '', location.pathname + location.search + '#connect');
    const panel = document.querySelector('#link-action'); panel.hidden = false;
    const withdrawing = match[1] === 'unsubscribe';
    document.querySelector('#link-title').textContent = withdrawing ? 'Withdraw assurance subscriptions' : 'Confirm your email';
    document.querySelector('#link-description').textContent = withdrawing ? 'This stops all updates for this email in the assurance registry. Other Kapukai lists remain separate.' : 'Activate the inquiry and topic selections associated with this link.';
    const button = document.querySelector('#link-button');
    button.textContent = withdrawing ? 'Withdraw subscriptions' : 'Confirm my request';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const result = await request({ action: match[1], token: match[2] });
        document.querySelector('#link-status').textContent = result.message;
      } catch (error) { document.querySelector('#link-status').textContent = error.message; button.disabled = false; }
    });
    panel.scrollIntoView();
  }
})();
