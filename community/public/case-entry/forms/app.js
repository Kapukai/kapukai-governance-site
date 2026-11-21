import { checkAffordability, observedDuration, inspectCatalog } from './rules.mjs';

const $ = id => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
let catalog;
let sourceById = new Map();
let formById = new Map();
let statePaths = new Map();
let states = [];

function el(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = String(text);
  if (className) element.className = className;
  return element;
}

function link(text, url, external = true) {
  const anchor = el('a', text);
  try {
    const parsed = new URL(url, window.location.href);
    if (!['http:', 'https:'].includes(parsed.protocol)) return el('span', text);
    anchor.href = parsed.href;
    if (external) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
  } catch {
    return el('span', text);
  }
  return anchor;
}

function money(minor, currency = 'USD') {
  if (!Number.isSafeInteger(minor) || minor < 0) return 'Unknown';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100); }
  catch { return 'Unknown currency'; }
}

function humanize(value) {
  return typeof value === 'string' ? value.replaceAll('_', ' ').replaceAll('-', ' ') : 'Not established';
}

function citations(ids = []) {
  const root = el('div', undefined, 'source-citations');
  const sources = [...new Set(ids)].map(id => sourceById.get(id)).filter(Boolean);
  if (!sources.length) {
    root.append(el('span', 'Research gap / proposed measurement'));
    return root;
  }
  root.append(el('span', 'Sources:'));
  for (const source of sources) {
    const index = catalog.sources.findIndex(item => item.id === source.id) + 1;
    const anchor = el('a', String(index));
    anchor.href = '#source-' + encodeURIComponent(source.id);
    anchor.title = source.title;
    anchor.setAttribute('aria-label', 'Source ' + index + ': ' + source.title);
    root.append(anchor);
  }
  return root;
}

function collectSourceIds(route) {
  const ids = new Set(route.source_ids || []);
  for (const formId of route.form_ids || []) for (const id of formById.get(formId)?.source_ids || []) ids.add(id);
  for (const collection of ['steps', 'channels', 'review_clocks', 'cost_items']) {
    for (const item of route[collection] || []) for (const id of item.source_ids || []) ids.add(id);
  }
  return ids;
}

function renderSources(route) {
  const root = $('source-list');
  root.replaceChildren();
  if (!route) {
    root.append(el('li', 'Choose a cataloged route to see its official sources.'));
    return;
  }
  const selected = collectSourceIds(route);
  for (const source of catalog.sources.filter(item => selected.has(item.id))) {
    const item = el('li');
    item.id = 'source-' + source.id;
    item.value = catalog.sources.findIndex(record => record.id === source.id) + 1;
    item.append(link(source.title, source.url));
    item.append(el('p', source.pinpoint || 'Pinpoint not established'));
    item.append(el('small', [source.scope, 'Checked ' + source.last_checked, source.effective_date ? 'Effective ' + source.effective_date : null].filter(Boolean).join(' · ')));
    if (source.access_note) item.append(el('small', source.access_note));
    root.append(item);
  }
}

function renderMap() {
  const root = $('state-map');
  const map = window.ATLAS_MAP;
  if (!map?.states?.length) {
    root.append(el('p', 'Map unavailable. The jurisdiction selector remains available.', 'small muted'));
    return;
  }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', map.viewBox);
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'National forms catalog coverage. California has draft records. Select a state to explore its coverage.');
  const title = document.createElementNS(SVG_NS, 'title');
  title.textContent = 'Select a jurisdiction';
  svg.append(title);
  for (const state of states) {
    if (!state.path) continue;
    const hasCatalog = catalog.routes.some(route => route.jurisdiction.state === state.abbr);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', state.path);
    path.setAttribute('class', 'state-path' + (hasCatalog ? ' has-catalog' : ''));
    path.setAttribute('role', 'button');
    path.setAttribute('tabindex', '0');
    path.setAttribute('aria-label', state.name + ': ' + (hasCatalog ? 'draft source catalog; independent review not recorded' : 'not yet cataloged'));
    path.setAttribute('aria-pressed', 'false');
    path.dataset.state = state.abbr;
    path.addEventListener('click', () => selectState(state.abbr));
    path.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectState(state.abbr);
      }
    });
    svg.append(path);
    statePaths.set(state.abbr, path);
  }
  root.replaceChildren(svg);
}

function updateAddress(state, routeId) {
  const url = new URL(window.location.href);
  url.searchParams.set('state', state);
  if (routeId) url.searchParams.set('route', routeId);
  else url.searchParams.delete('route');
  history.replaceState(null, '', url);
}

function selectState(code, routeId, updateUrl = true) {
  const state = states.find(item => item.abbr === code);
  if (!state) return;
  $('state-select').value = code;
  $('state-title').textContent = state.name;
  for (const [abbr, path] of statePaths) {
    const selected = abbr === code;
    path.classList.toggle('selected', selected);
    path.setAttribute('aria-pressed', String(selected));
  }
  const routes = catalog.routes.filter(route => route.jurisdiction.state === code);
  $('route-select').replaceChildren();
  $('route-picker').hidden = !routes.length;
  $('route-content').hidden = !routes.length;
  $('coverage-gap').hidden = Boolean(routes.length);
  $('coverage-summary').textContent = routes.length
    ? routes.length + ' selected process routes. Statewide forms and local procedure are identified separately.'
    : 'This jurisdiction has no form records in this edition.';
  if (!routes.length) {
    $('coverage-gap').textContent = state.name + ' has not been cataloged here. This is a research gap, not a finding about its evidence channels, cost, timing or safeguards.';
    renderSources(null);
    if (updateUrl) updateAddress(code, null);
    return;
  }
  for (const route of routes) {
    const option = el('option', route.title);
    option.value = route.id;
    $('route-select').append(option);
  }
  const selected = routes.find(route => route.id === routeId) || routes[0];
  $('route-select').value = selected.id;
  $('route-select').disabled = false;
  renderRoute(selected);
  if (updateUrl) updateAddress(code, selected.id);
}

function renderRoute(route) {
  $('route-title').textContent = route.title;
  $('route-summary').textContent = route.scope_note || route.proceeding;
  const context = $('route-context');
  context.replaceChildren();
  for (const [label, value] of [['Court or scope', route.jurisdiction.court], ['Initiating actor', route.initiating_actor], ['First consequential decision', route.first_consequential_decision]]) {
    const item = el('div', undefined, 'context-item');
    item.append(el('span', label), el('strong', value));
    context.append(item);
  }

  const forms = $('form-cards');
  forms.replaceChildren();
  for (const id of route.form_ids || []) {
    const form = formById.get(id);
    if (!form) continue;
    const card = el('article', undefined, 'form-card');
    card.append(el('span', form.form_number, 'form-number'), el('h3', form.title), el('p', humanize(form.document_role), 'form-role'));
    card.append(el('p', form.effective_date ? 'Official edition effective ' + form.effective_date : 'Edition date not established', 'form-date'));
    const links = el('div', undefined, 'form-links');
    links.append(link('Official form page ↗', form.landing_url));
    if (form.pdf_url) links.append(link('PDF ↗', form.pdf_url));
    card.append(links, citations(form.source_ids));
    forms.append(card);
  }

  const steps = $('route-steps');
  steps.replaceChildren();
  for (const step of route.steps || []) {
    const card = el('li', undefined, 'route-step');
    card.append(el('h3', step.title), el('span', step.actor, 'actor-label'), el('p', step.description), citations(step.source_ids));
    steps.append(card);
  }

  const channels = $('channel-cards');
  channels.replaceChildren();
  for (const channel of route.channels || []) {
    const card = el('article', undefined, 'channel-card');
    card.append(el('h4', channel.title), el('span', channel.participant_role, 'channel-role'), el('p', channel.description), citations(channel.source_ids));
    channels.append(card);
  }
  if (!channels.childElementCount) channels.append(el('p', 'Evidence channels have not yet been mapped for this route.', 'notice'));

  const costs = $('cost-items');
  costs.replaceChildren();
  for (const cost of route.cost_items || []) {
    const row = el('article', undefined, 'cost-row');
    const name = el('div');
    name.append(el('h3', cost.label));
    name.append(el('small', 'Payment timing: ' + humanize(cost.payment_timing)));
    const hasAmount = Number.isSafeInteger(cost.amount_minor) && cost.amount_minor >= 0;
    const amount = el('div');
    amount.append(el('strong', hasAmount ? money(cost.amount_minor, cost.currency) : cost.amount_status === 'variable' ? 'Variable / not established' : 'Not established', 'cost-amount' + (hasAmount ? '' : ' unknown')));
    amount.append(el('small', humanize(cost.amount_status) + ' amount'));
    const detail = el('div', undefined, 'cost-detail');
    detail.append(el('p', cost.notes, 'cost-description'), citations(cost.source_ids));
    row.append(name, amount, detail);
    costs.append(row);
  }

  const clocks = $('clock-cards');
  clocks.replaceChildren();
  for (const clock of route.review_clocks || []) {
    const card = el('article', undefined, 'clock-card');
    card.append(el('span', clock.effective_date ? 'Effective ' + clock.effective_date : 'Effective date not established', 'clock-effective'));
    card.append(el('h3', clock.label), el('p', clock.description));
    if (clock.conditions) card.append(el('p', clock.conditions));
    card.append(citations(clock.source_ids));
    clocks.append(card);
  }
  if (!clocks.childElementCount) clocks.append(el('p', 'No review clock has been established in this edition.', 'notice'));

  const metrics = $('metric-cards');
  metrics.replaceChildren();
  const labels = [
    ['Observed route sample', 'No operational sample collected'],
    ['Submission frequency', 'Denominator not established'],
    ['Actual review time', 'Event observations not collected'],
    ['Participant expense', 'Spending observations not collected']
  ];
  for (const [label, note] of labels) {
    const card = el('article', undefined, 'metric-card');
    card.append(el('span', label, 'metric-label'), el('strong', 'Not measured'), el('small', note));
    metrics.append(card);
  }
  renderSources(route);
}

function renderChecks() {
  const root = $('catalog-checks');
  root.replaceChildren();
  for (const result of inspectCatalog(catalog)) {
    const item = el('li');
    item.append(el('span', humanize(result.status), 'check-status'), el('span', result.reason || result.id));
    root.append(item);
  }
}

function minorUnits(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{1,13}(?:\.\d{0,2})?$/.test(trimmed)) return NaN;
  const [whole, fraction = ''] = trimmed.split('.');
  const number = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(number) ? number : NaN;
}

const presets = {
  gap: ['80.00', '50.00', '0.00', '0'],
  support: ['80.00', '50.00', '30.00', '0'],
  unknown: ['', '50.00', '0.00', '0'],
  zero: ['0.00', '', '', '0']
};
const inputIds = ['required-amount', 'available-amount', 'support-amount', 'elapsed-minutes'];

function updateLab() {
  const result = checkAffordability({
    requiredUpfrontMinor: minorUnits($('required-amount').value),
    availableMinor: minorUnits($('available-amount').value),
    confirmedSupportMinor: minorUnits($('support-amount').value),
    currency: 'USD'
  });
  const timeValue = $('elapsed-minutes').value.trim();
  const minutes = timeValue === '' ? null : Number(timeValue);
  let duration = { status: 'unknown', elapsedMinutes: null };
  if (Number.isSafeInteger(minutes) && minutes >= 0 && minutes <= 525600) {
    const start = '2026-11-21T12:00:00.000Z';
    const end = new Date(Date.parse(start) + minutes * 60000).toISOString();
    duration = observedDuration({ start, end });
  }
  $('time-result').textContent = duration.elapsedMinutes === null || duration.elapsedMinutes === undefined ? 'Unknown' : duration.elapsedMinutes + ' min';
  $('time-result-note').textContent = 'Illustrative interval only';
  $('funding-result').textContent = result.shortfallMinor === null || result.shortfallMinor === undefined ? 'Unknown' : money(result.shortfallMinor);
  $('funding-result-note').textContent = result.status === 'unmet' ? 'Known funding shortfall' : result.status === 'met' ? 'Listed payment covered' : 'Funding position unresolved';
  $('lab-results').dataset.status = result.status;
  $('lab-reason').textContent = result.status === 'unknown'
    ? 'A needed amount is unknown or cannot be used. Enter fictional amounts of zero or more, with no more than two decimal places, or leave a field blank to keep it unknown.'
    : result.reason;
}

function setupLab() {
  $('cost-form').addEventListener('submit', event => event.preventDefault());
  $('lab-preset').addEventListener('change', () => {
    const values = presets[$('lab-preset').value];
    if (!values) return;
    inputIds.forEach((id, index) => { $(id).value = values[index]; });
    updateLab();
  });
  for (const id of inputIds) $(id).addEventListener('input', () => {
    $('lab-preset').value = '';
    updateLab();
  });
  updateLab();
}

function readLocation() {
  const params = new URLSearchParams(window.location.search);
  const route = catalog.routes.find(item => item.id === params.get('route'));
  const requestedState = params.get('state');
  const state = states.some(item => item.abbr === requestedState) ? requestedState : route?.jurisdiction.state || 'CA';
  selectState(state, route?.id, false);
}

async function start() {
  setupLab();
  try {
    const response = await fetch('catalog.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Catalog could not be loaded (' + response.status + ').');
    catalog = await response.json();
    if (!Array.isArray(catalog.routes) || !Array.isArray(catalog.forms) || !Array.isArray(catalog.sources)) throw new Error('Catalog structure is unavailable.');
    sourceById = new Map(catalog.sources.map(source => [source.id, source]));
    formById = new Map(catalog.forms.map(form => [form.id, form]));
    states = [...(window.ATLAS_MAP?.states || [{ abbr: 'CA', name: 'California' }])].sort((a, b) => a.name.localeCompare(b.name));
    if (!states.some(state => state.abbr === 'DC')) states.push({ abbr: 'DC', name: 'District of Columbia' });
    $('state-select').replaceChildren();
    for (const state of states) {
      const count = catalog.routes.filter(route => route.jurisdiction.state === state.abbr).length;
      const option = el('option', state.name + (count ? ' — draft source catalog' : ' — not yet cataloged'));
      option.value = state.abbr;
      $('state-select').append(option);
    }
    $('state-select').disabled = false;
    $('state-select').addEventListener('change', () => selectState($('state-select').value));
    $('route-select').addEventListener('change', () => selectState($('state-select').value, $('route-select').value));
    $('catalog-edition').textContent = 'Catalog ' + catalog.catalog_version + ' · Sources checked ' + catalog.checked_on;
    $('footer-edition').textContent = 'Catalog ' + catalog.catalog_version + ' · Independent review not recorded';
    renderMap();
    renderChecks();
    readLocation();
    window.addEventListener('popstate', readLocation);
  } catch (error) {
    $('load-error').hidden = false;
    $('load-error').textContent = error.message + ' Use the Case Entry Map link above to return to the existing research.';
    $('state-title').textContent = 'Catalog unavailable';
    $('coverage-summary').textContent = 'No findings can be displayed until the catalog loads.';
    $('route-content').hidden = true;
  }
}

start();
