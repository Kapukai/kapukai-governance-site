(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const scenarios = {
    baseline: {
      name: 'Baseline / no injected threat',
      summary: 'A submission is received and its technical checks are logged. The claim remains an assertion until an authorized decision-maker acts.',
      control: 'Can each actor trace the same event through source, receipt, record, and later review?',
      focus: [],
      preset: {payload:'yes',hash:'pass',metadata:'pass',sequence:'pass'},
      events: [
        {stage:['person','device'],actor:'Filer / account holder',source:'2026-11-17T14:14:00Z',received:'2026-11-17T14:14:02.114Z',id:'evt-1001',title:'Claim and payload submitted',claim:'ASSERTION RECORDED',detail:'The record proves that this claim and file were submitted. It does not prove the claim.',severity:''},
        {stage:['intake'],actor:'Intake service',source:'Inherited from evt-1001',received:'2026-11-17T14:14:02.301Z',id:'evt-1002',title:'Defined technical checks complete',claim:'ASSERTION RECORDED',detail:'Hash reference, required metadata, and unique event ID pass in this illustration. These checks do not assess factual truth.',severity:''},
        {stage:['record'],actor:'Court record system',source:'evt-1002',received:'2026-11-17T14:14:04.880Z',id:'evt-1003',title:'Receipt and docket event preserved',claim:'ASSERTION RECORDED',detail:'The event log preserves who, what, when, and which rule version ran. The docket records an allegation was made.',severity:''},
        {stage:['decision'],actor:'Authorized decision-maker',source:'Hearing / later process',received:'Not simulated',id:'—',title:'Contextual review remains human',claim:'ASSERTION RECORDED',detail:'No credibility judgment, evidentiary ruling, or factual finding is simulated. Those require the applicable law and an authorized human decision.',severity:''}
      ]
    },
    'clock-replay': {
      name: 'Clock skew / replay test (hypothetical)',
      summary: 'A sending device reports an earlier time, then the same event identifier appears again. The source clock alone cannot establish receipt order.',
      control: 'Compare source time with synchronized receipt time; detect duplicate IDs; protect the sequence log; calculate no deadline until its legal trigger is verified.',
      focus: ['device','intake','record'],
      preset: {payload:'yes',hash:'pass',metadata:'pass',sequence:'fail'},
      events: [
        {stage:['device','intake'],actor:'Sending device / portal',source:'2026-11-17T14:14:00Z (unverified source clock)',received:'2026-11-17T14:46:02.114Z',id:'evt-204',title:'Payload arrives after a 32-minute clock difference',claim:'ASSERTION RECORDED',detail:'Store both timestamps with source, offset, and clock-health metadata. Do not silently replace server receipt time with a client time.',severity:'alert'},
        {stage:['intake'],actor:'Intake service',source:'2026-11-17T14:14:00Z (repeated)',received:'2026-11-17T14:46:05.902Z',id:'evt-204 (duplicate)',title:'Repeated event ID detected',claim:'ASSERTION RECORDED',detail:'Flag the replay, preserve the original, record the second receipt, and prevent duplicate processing. Do not infer who caused it.',severity:'alert'},
        {stage:['record'],actor:'Protected audit log',source:'evt-204',received:'2026-11-17T14:46:06.010Z · sequence 8028',id:'evt-205',title:'Independent receipt order recorded',claim:'ASSERTION RECORDED',detail:'A protected sequence and time-source health record let reviewers reconstruct event order even when a sender clock is wrong.',severity:''},
        {stage:['decision'],actor:'Authorized decision-maker',source:'Rule trigger must be identified',received:'Not simulated',id:'—',title:'Legal deadline remains uncomputed',claim:'ASSERTION RECORDED',detail:'The operative rule determines which event starts a deadline. This generic clock demo cannot decide that legal question.',severity:''}
      ]
    },
    'payload-tamper': {
      name: 'Content alteration in a handoff (hypothetical)',
      summary: 'A payload’s received digest differs from its previously recorded reference. That is an integrity exception—not a finding about what the content means.',
      control: 'Keep the original, compare against a trusted reference, preserve the chain and audit log, and route the exception for accountable review.',
      focus: ['intake','record'],
      preset: {payload:'yes',hash:'fail',metadata:'pass',sequence:'pass'},
      events: [
        {stage:['device','intake'],actor:'Filer / intake service',source:'2026-11-17T14:14:00Z',received:'2026-11-17T14:14:02.114Z',id:'evt-301',title:'Payload received and reference digest recorded',claim:'ASSERTION RECORDED',detail:'A hash identifies a byte sequence relative to a trusted reference; it does not establish authorship, context, or truth.',severity:''},
        {stage:['intake'],actor:'Records transfer service',source:'Prior digest: 8f2a…c71e',received:'2026-11-17T14:20:17.802Z',id:'evt-302',title:'Later digest does not match the reference',claim:'ASSERTION RECORDED',detail:'Set integrity status to EXCEPTION. Preserve both versions and the transfer events; do not overwrite the first copy.',severity:'alert'},
        {stage:['record'],actor:'Protected audit log',source:'evt-301 → evt-302',received:'2026-11-17T14:20:18.031Z',id:'evt-303',title:'Mismatch and custody path logged',claim:'ASSERTION RECORDED',detail:'Record the exact check, reference, result, time, actor, and correction path. This still does not decide whether the underlying allegation is true.',severity:''},
        {stage:['decision'],actor:'Authorized decision-maker',source:'Preserved items + applicable evidence rules',received:'Not simulated',id:'—',title:'Substantive evaluation stays human',claim:'ASSERTION RECORDED',detail:'A judge or other authorized decision-maker evaluates the material under the applicable procedure; the software reports only its integrity check.',severity:''}
      ]
    },
    'role-mismatch': {
      name: 'Authenticated account / authority mismatch (hypothetical)',
      summary: 'A credential can authenticate a session without proving the user has authority to perform every requested action.',
      control: 'Check identity, role, scope, and delegation separately; log denied and granted actions; preserve a review and correction path.',
      focus: ['intake','record'],
      preset: {payload:'yes',hash:'pass',metadata:'pass',sequence:'pass'},
      events: [
        {stage:['device','intake'],actor:'Signed-in account',source:'2026-11-17T14:14:00Z',received:'2026-11-17T14:14:01.511Z',id:'evt-401',title:'Session credential validates',claim:'ASSERTION RECORDED',detail:'Authentication answers which credential was used. It does not by itself establish court authority, legal role, or permission for each operation.',severity:''},
        {stage:['intake'],actor:'Authorization service',source:'Role grant checked',received:'2026-11-17T14:14:01.643Z',id:'evt-402',title:'Requested action falls outside assigned role',claim:'ASSERTION RECORDED',detail:'Block the unauthorized action, record the policy version and reason, and avoid silently changing the case record.',severity:'alert'},
        {stage:['record'],actor:'Protected audit log',source:'evt-402',received:'2026-11-17T14:14:01.701Z',id:'evt-403',title:'Denied action and escalation path recorded',claim:'ASSERTION RECORDED',detail:'A reviewable log can show what the system did. A system role cannot create legal authority that the law does not grant.',severity:''},
        {stage:['decision'],actor:'Authorized human / administrator',source:'Role policy and governing law',received:'Not simulated',id:'—',title:'Authority question routed for review',claim:'ASSERTION RECORDED',detail:'The system exposes the boundary; an authorized person resolves any context-sensitive legal or administrative question.',severity:''}
      ]
    },
    availability: {
      name: 'Portal outage / missing receipt (hypothetical)',
      summary: 'A person reports an attempt, but no filing receipt exists while the intake service is unavailable. Missing server data cannot describe the person’s full experience.',
      control: 'Log service health independently; provide a documented alternate path; preserve user-reported attempt time; apply the jurisdiction’s actual outage and deadline rules.',
      focus: ['person','device','intake'],
      preset: {payload:'no',hash:'unknown',metadata:'unknown',sequence:'unknown'},
      events: [
        {stage:['person','device'],actor:'Person attempting access',source:'2026-11-17T14:14:00Z (reported attempt)',received:'No filing receipt',id:'user-reported',title:'Attempt is reported; portal has no receipt',claim:'ATTEMPT REPORTED',detail:'Absence of a server receipt is not proof that a person did not try, and it says nothing by itself about evidence held elsewhere.',severity:'alert'},
        {stage:['intake'],actor:'Independent service monitor',source:'Health check',received:'2026-11-17T14:12:00Z · outage opened',id:'health-77',title:'Intake service outage recorded',claim:'ATTEMPT REPORTED',detail:'Keep system availability events on a separate clock from the user’s reported attempt and from any legal deadline.',severity:'alert'},
        {stage:['intake','record'],actor:'Service monitor',source:'Health check',received:'2026-11-17T14:48:00Z · service restored',id:'health-78',title:'Portal service restored',claim:'ATTEMPT REPORTED',detail:'No payload was received in this simulation, so file-integrity checks are NOT RUN. A documented fallback and correction process must be defined.',severity:''},
        {stage:['decision'],actor:'Authorized decision-maker / policy owner',source:'Reported attempt + outage log + applicable rule',received:'Not simulated',id:'—',title:'Human and rule-specific review needed',claim:'ATTEMPT REPORTED',detail:'No deadline or legal result is calculated here. The operative jurisdiction rule and the person’s recorded context must be reviewed.',severity:''}
      ]
    }
  };

  const grayColumns = ['00','01','11','10'];
  let currentScenario = 'baseline';
  let eventIndex = 0;
  let timer = null;

  function pauseTrace() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    const play = $('lab-play');
    if (play) {
      play.textContent = 'Play trace';
      play.setAttribute('aria-pressed','false');
    }
    updateProgress();
  }
  function updateProgress() {
    const scenario = scenarios[currentScenario];
    const state = eventIndex >= scenario.events.length ? 'complete' : (timer ? 'playing' : 'paused');
    $('lab-progress').textContent = 'Event ' + eventIndex + ' of ' + scenario.events.length + ' · ' + state;
  }
  function setFocus(stages) {
    document.querySelectorAll('.lab-pipeline li').forEach(node => {
      node.classList.toggle('lab-focus', Array.isArray(stages) && stages.includes(node.dataset.stage));
    });
  }
  function updateHumanClock() {
    const context = $('human-context').value;
    const minutes = Number($('human-minutes').value);
    $('human-minutes-value').textContent = minutes + ' minute' + (minutes === 1 ? '' : 's');
    if (context === 'not-recorded') {
      $('clock-human').textContent = 'Not recorded / unknown';
      $('human-context-note').textContent = 'Unknown means not recorded here. It does not mean no barrier occurred. These controls change only this local illustration; nothing is submitted or stored.';
      return;
    }
    const label = {
      'access-barrier':'Access interruption reported',
      accommodation:'Accommodation request reported',
      'after-hours':'After-hours attempt reported'
    }[context];
    $('clock-human').textContent = minutes ? minutes + ' min · reported' : 'Reported · duration unknown';
    $('human-context-note').textContent = label + '. This is user-supplied scenario context, not a machine-verified explanation or credibility score.';
  }
  function setClockValues(event) {
    if (!event) {
      $('clock-source').textContent = 'Not supplied';
      $('clock-receipt').textContent = 'Awaiting event';
      $('clock-rule').textContent = 'Not computed';
      return;
    }
    $('clock-source').textContent = event.source || 'Not supplied';
    $('clock-receipt').textContent = event.received || 'No receipt logged';
    $('clock-rule').textContent = 'Not computed';
  }
  function appendEvent(event) {
    const li = document.createElement('li');
    if (event.severity === 'alert') li.classList.add('lab-event-alert');
    const marker = document.createElement('span');
    marker.className = 'lab-event-meta';
    marker.textContent = event.actor + ' · ' + event.id;
    const title = document.createElement('strong');
    title.textContent = event.title;
    const time = document.createElement('time');
    if (event.received && event.received.startsWith('2026-')) time.dateTime = event.received;
    time.textContent = 'Source: ' + (event.source || 'not supplied') + ' · System: ' + (event.received || 'no receipt logged');
    const detail = document.createElement('p');
    detail.textContent = event.detail;
    li.append(marker,title,time,detail);
    $('lab-event-list').appendChild(li);
    $('lab-current-state').textContent = event.detail;
    $('current-state-title').textContent = event.title;
    $('lab-claim-status').textContent = event.claim;
    $('lab-finding-status').textContent = 'NONE SIMULATED';
    setClockValues(event);
    setFocus(event.stage);
    eventIndex += 1;
    updateProgress();
    if (eventIndex >= scenarios[currentScenario].events.length) pauseTrace();
  }
  function setKmapPreset(preset) {
    $('kmap-payload').value = preset.payload;
    $('kmap-hash').value = preset.hash;
    $('kmap-metadata').value = preset.metadata;
    $('kmap-sequence').value = preset.sequence;
    renderKmap();
  }
  function setScenarioSummary() {
    const scenario = scenarios[currentScenario];
    $('lab-threat-name').textContent = scenario.name;
    $('lab-threat-summary').textContent = scenario.summary;
    $('lab-control-question').textContent = scenario.control;
    setFocus(scenario.focus);
  }
  function resetTrace() {
    pauseTrace();
    eventIndex = 0;
    $('lab-event-list').replaceChildren();
    $('lab-current-state').textContent = 'The trace has not started.';
    $('current-state-title').textContent = 'Awaiting first event';
    $('lab-claim-status').textContent = 'NOT YET RECORDED';
    $('lab-finding-status').textContent = 'NONE SIMULATED';
    setClockValues(null);
    setScenarioSummary();
    updateProgress();
  }
  function chooseScenario() {
    pauseTrace();
    currentScenario = $('lab-scenario').value;
    setKmapPreset(scenarios[currentScenario].preset);
    if (currentScenario === 'availability') {
      $('human-context').value = 'access-barrier';
      $('human-minutes').value = '35';
    } else {
      $('human-context').value = 'not-recorded';
      $('human-minutes').value = '0';
    }
    updateHumanClock();
    resetTrace();
  }
  function stepEvent() {
    const events = scenarios[currentScenario].events;
    if (eventIndex >= events.length) return;
    appendEvent(events[eventIndex]);
  }
  function togglePlay() {
    if (timer !== null) { pauseTrace(); return; }
    if (eventIndex >= scenarios[currentScenario].events.length) resetTrace();
    $('lab-play').textContent = 'Pause trace';
    $('lab-play').setAttribute('aria-pressed','true');
    const delay = Number($('lab-speed').value);
    timer = window.setInterval(stepEvent, delay);
    updateProgress();
  }
  function renderKmap() {
    const payload = $('kmap-payload').value;
    const checks = {
      H:$('kmap-hash').value,
      M:$('kmap-metadata').value,
      Q:$('kmap-sequence').value
    };
    const result = $('kmap-result');
    let message;
    let resultClass;
    if (payload === 'no') {
      message = 'NOT RUN — no payload attached to this submission. This does not mean no evidence exists elsewhere.';
      resultClass = 'is-not-run';
    } else if (Object.values(checks).some(value => value === 'unknown')) {
      message = 'UNKNOWN — at least one check is incomplete or has no trusted reference. Do not treat unknown as pass or fail.';
      resultClass = 'is-unknown';
    } else {
      const failed = Object.entries(checks).filter(([,value]) => value === 'fail').map(([key]) => key);
      if (failed.length) {
        message = 'TECHNICAL EXCEPTION — failed predicate(s): ' + failed.join(', ') + '. Preserve the event, explain the check, and provide a correction/review path.';
        resultClass = 'is-exception';
      } else {
        message = 'PASS — these three defined technical predicates passed. The content is not thereby true, admissible, or legally sufficient.';
        resultClass = '';
      }
    }
    result.className = 'kmap-result' + (resultClass ? ' ' + resultClass : '');
    result.textContent = message;
    document.querySelectorAll('[data-kmap-cell]').forEach(cell => {
      const [hBit,column] = cell.dataset.kmapCell.split('-');
      const mBit = Number(column[0]);
      const qBit = Number(column[1]);
      const exception = Number(hBit) === 0 || mBit === 0 || qBit === 0;
      cell.textContent = exception ? '1' : '0';
      cell.classList.toggle('kmap-one',exception);
      cell.classList.toggle('kmap-zero',!exception);
      const active = payload === 'yes' && !Object.values(checks).includes('unknown') &&
        Number(hBit) === (checks.H === 'pass' ? 1 : 0) &&
        mBit === (checks.M === 'pass' ? 1 : 0) &&
        qBit === (checks.Q === 'pass' ? 1 : 0);
      cell.classList.toggle('kmap-current',active);
      if (active) cell.setAttribute('aria-current','true');
      else cell.removeAttribute('aria-current');
    });
  }
  function init() {
    if (!$('lab-scenario')) return;
    $('lab-scenario').addEventListener('change',chooseScenario);
    $('lab-step').addEventListener('click',stepEvent);
    $('lab-play').addEventListener('click',togglePlay);
    $('lab-reset').addEventListener('click',resetTrace);
    $('human-context').addEventListener('change',updateHumanClock);
    $('human-minutes').addEventListener('input',updateHumanClock);
    ['kmap-payload','kmap-hash','kmap-metadata','kmap-sequence'].forEach(id => $(id).addEventListener('change',renderKmap));
    document.addEventListener('visibilitychange',() => { if (document.hidden) pauseTrace(); });
    updateHumanClock();
    setKmapPreset(scenarios[currentScenario].preset);
    resetTrace();
  }
  document.addEventListener('DOMContentLoaded',init);
})();
