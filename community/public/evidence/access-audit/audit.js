(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const svgNS = 'http://www.w3.org/2000/svg';
  const labels = {
    A: 'Documented failure in stated scope',
    B: 'Safeguard documented in operation',
    C: 'Mixed findings',
    D: 'Insufficient evidence',
    E: 'Not yet assessed'
  };
  const colors = { A:'#b42318', B:'#08766e', C:'#b54708', D:'#76684e', E:'#7c898d' };
  let data;
  let selected = 'FL';
  let currentTopic = 'institutional-roles';
  let currentMode = 'assessment';

  function makeSvg(tag, attrs, content) {
    const node = document.createElementNS(svgNS, tag);
    Object.entries(attrs || {}).forEach(([key,value]) => node.setAttribute(key, String(value)));
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function appendText(parent, tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  }
  function sourceLink(source) {
    const link = document.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = source.title + ' ↗';
    return link;
  }
  function pilotForState(code) {
    return data.pilots[code] || null;
  }
  function topicPilot(code) {
    const pilot = pilotForState(code);
    return pilot && Array.isArray(pilot.topics) && pilot.topics.includes(currentTopic) ? pilot : null;
  }
  function currentTopicLabel() {
    const topic = data.topics.find(item => item.id === currentTopic);
    return topic ? topic.label : 'selected audit dimension';
  }
  function topicFinding(code) {
    return data.ratings && data.ratings[code] && data.ratings[code][currentTopic]
      ? data.ratings[code][currentTopic]
      : null;
  }
  function currentClassification(code) {
    const finding = topicFinding(code);
    return finding && labels[finding.classification] ? finding.classification : 'E';
  }
  function publicScopeLabel(finding) {
    if (!finding) return 'Not assessed';
    if (finding.extent === 'systemic') {
      if (finding.classification === 'A') return 'Verified systemic failure';
      if (finding.classification === 'B') return 'System-level safeguard documented';
      if (finding.classification === 'C') return 'Mixed system-level findings';
      return 'System-level finding';
    }
    if (finding.extent === 'recurring') return 'Recurring pattern — not a statewide finding';
    if (finding.extent === 'case') return 'Single documented case — not a statewide finding';
    if (finding.extent === 'rule') return 'Law or official guidance only';
    return 'Not assessed';
  }
  function buildMap() {
    const map = window.ATLAS_MAP;
    if (!map || !Array.isArray(map.states)) throw new Error('The shared state map did not load.');
    const shapes = byId('state-shapes');
    const stateLabels = byId('state-labels');
    shapes.replaceChildren();
    stateLabels.replaceChildren();
    map.states.forEach(state => {
      const group = makeSvg('g', {
        class: 'audit-state-group',
        tabindex: '0',
        role: 'button',
        'aria-pressed': 'false',
        'aria-label': state.name + ', E — Not yet assessed',
        'data-code': state.abbr
      });
      const path = makeSvg('path', {
        class: 'audit-state-shape',
        d: state.path,
        fill: colors.E
      });
      group.appendChild(path);
      group.addEventListener('click', () => chooseState(state.abbr));
      group.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          chooseState(state.abbr);
        }
      });
      shapes.appendChild(group);
      if (Number.isFinite(state.labelX) && Number.isFinite(state.labelY)) {
        const label = makeSvg('text', {
          class: 'audit-state-label',
          x: state.labelX,
          y: state.labelY
        }, state.abbr);
        stateLabels.appendChild(label);
      }
    });
    byId('map-summary').textContent = '51 jurisdictions · Federal baseline separate · All state-topic ratings currently E';
    const selector = byId('jurisdiction-select');
    map.states.slice().sort((a,b) => a.name.localeCompare(b.name)).forEach(state => {
      const option = document.createElement('option');
      option.value = state.abbr;
      option.textContent = state.name;
      selector.appendChild(option);
    });
    data.topics.forEach(topic => {
      const option = document.createElement('option');
      option.value = topic.id;
      option.textContent = topic.label;
      byId('topic').appendChild(option);
    });
  }
  function drawLegend() {
    const legend = byId('map-legend');
    legend.replaceChildren();
    const map = window.ATLAS_MAP;
    const topicSourceCount = map.states.filter(state => topicPilot(state.abbr)).length;
    const items = currentMode === 'assessment'
      ? Object.entries(labels).map(([code,label]) => ({color:colors[code], text:code + ' — ' + label}))
      : [
          {color:'#08766e', text:topicSourceCount + ' jurisdictions with first-pass sources for this topic'},
          {color:'#7c898d', text:'Research not yet started'}
        ];
    items.forEach(item => {
      const entry = document.createElement('span');
      entry.className = 'audit-legend-item';
      const swatch = document.createElement('i');
      swatch.className = 'audit-swatch';
      swatch.style.backgroundColor = item.color;
      swatch.setAttribute('aria-hidden','true');
      entry.appendChild(swatch);
      entry.appendChild(document.createTextNode(item.text));
      legend.appendChild(entry);
    });
  }
  function updateMapStyles() {
    const map = window.ATLAS_MAP;
    map.states.forEach(state => {
      const group = document.querySelector('.audit-state-group[data-code="' + state.abbr + '"]');
      if (!group) return;
      const path = group.querySelector('path');
      const pilot = topicPilot(state.abbr);
      const finding = topicFinding(state.abbr);
      const code = currentClassification(state.abbr);
      const mapScoped = !finding || finding.extent === 'systemic';
      group.classList.toggle('audit-selected', state.abbr === selected);
      group.classList.toggle('audit-progress', currentMode === 'research' && Boolean(pilot));
      path.setAttribute('fill', currentMode === 'research'
        ? (pilot ? '#08766e' : '#7c898d')
        : (mapScoped ? colors[code] : colors.E));
      group.setAttribute('aria-label', state.name + ', ' +
        (currentMode === 'research'
          ? (pilot ? 'first-pass official-source research started' : 'research not yet started')
          : (mapScoped ? code + ' — ' + labels[code] : publicScopeLabel(finding) + '; not state-shaded')));
      group.setAttribute('aria-pressed', state.abbr === selected ? 'true' : 'false');
    });
    byId('map-mode-title').textContent = currentMode === 'assessment' ? 'Assessment result' : 'Research progress';
    const topicSourceCount = map.states.filter(state => topicPilot(state.abbr)).length;
    byId('map-mode-caption').textContent = currentMode === 'assessment'
      ? 'E — Not yet assessed'
      : topicSourceCount + ' jurisdiction' + (topicSourceCount === 1 ? '' : 's') + ' with sources for this topic';
    byId('map-summary').textContent = '51 jurisdictions · Federal baseline separate · Topic: ' + currentTopicLabel();
    byId('map-svg-desc').textContent = currentMode === 'assessment'
      ? 'Map of the fifty states and the District of Columbia. Every state-topic rating is E, not yet assessed. Select a jurisdiction to inspect its source record.'
      : 'Map of the fifty states and the District of Columbia. Highlighted states have first-pass official sources for ' + currentTopicLabel() + '. This indicates research progress, not a finding about performance.';
    drawLegend();
  }
  function appendSources(parent, sources) {
    if (!sources || !sources.length) return;
    const heading = appendText(parent, 'h4', 'Official sources');
    heading.className = 'audit-small-heading';
    const list = document.createElement('ul');
    sources.forEach(source => {
      const li = document.createElement('li');
      li.appendChild(sourceLink(source));
      const note = document.createElement('p');
      note.textContent = source.supports;
      li.appendChild(note);
      list.appendChild(li);
    });
    parent.appendChild(list);
  }
  function renderAuthorityProfile(root, profile) {
    const section = document.createElement('section');
    section.className = 'audit-authority-profile';
    appendText(section, 'h4', 'Authority on the books / operations documented separately');
    appendText(section, 'p', profile.summary);
    const fields = [
      ['constitutionalStructure', 'Constitutional structure'],
      ['selectionAndSupervision', 'Selection and supervision'],
      ['recordDuties', 'Record duties'],
      ['correctionRoute', 'Correction route'],
      ['technologyAndOperations', 'Technology and actual operation'],
      ['limitations', 'What remains unverified']
    ];
    const grid = document.createElement('dl');
    grid.className = 'authority-profile-grid';
    fields.forEach(([key, label]) => {
      const value = profile[key];
      if (!value) return;
      const term = document.createElement('dt');
      term.textContent = label;
      const description = document.createElement('dd');
      description.textContent = value;
      grid.append(term, description);
    });
    section.appendChild(grid);
    appendSources(section, profile.sources);
    root.appendChild(section);
  }
  function showState(code) {
    const state = window.ATLAS_MAP.states.find(item => item.abbr === code);
    if (!state) return;
    selected = code;
    byId('jurisdiction-select').value = code;
    updateMapStyles();
    const root = byId('detail-content');
    root.replaceChildren();
    const pilot = topicPilot(code);
    const anyPilot = pilotForState(code);
    const finding = topicFinding(code);
    const ratingCode = currentClassification(code);
    const rating = document.createElement('div');
    rating.className = 'audit-rating audit-' + ratingCode;
    rating.textContent = ratingCode + ' — ' + labels[ratingCode];
    root.appendChild(rating);
    const scope = document.createElement('span');
    scope.className = 'audit-progress-tag';
    scope.textContent = publicScopeLabel(finding);
    root.appendChild(scope);
    const topic = data.topics.find(item => item.id === currentTopic);
    appendText(root, 'p', 'Topic: ' + (topic ? topic.label : 'Selected audit dimension'));
    const authorityProfile = data.authorityProfiles && data.authorityProfiles[code];
    if (authorityProfile) renderAuthorityProfile(root, authorityProfile);
    if (finding) {
      appendText(root, 'p', finding.summary);
      if (finding.period) appendText(root, 'p', 'Time period: ' + finding.period);
      if (finding.courtType) appendText(root, 'p', 'Court or agency scope: ' + finding.courtType);
      if (finding.limitations) appendText(root, 'p', 'Limitations: ' + finding.limitations);
      appendSources(root, finding.sources);
    } else {
      appendText(root, 'p', 'No jurisdiction-specific operational finding for this topic has been assessed. This is a research-status label, not a conclusion that the safeguard works or that a defect exists.');
    }
    const progress = document.createElement('span');
    progress.className = 'audit-progress-tag';
    progress.textContent = pilot ? pilot.reviewStatus : 'No source review recorded for this topic';
    root.appendChild(progress);
    if (!finding && pilot) {
      appendText(root, 'p', pilot.summary);
      appendSources(root, pilot.sources);
    } else if (!finding && anyPilot) {
      appendText(root, 'p', 'This jurisdiction has first-pass sources in other audit dimensions. No source review is recorded for the selected topic yet.');
    } else if (!finding) {
      appendText(root, 'p', 'This jurisdiction remains in the national completion register. No state-specific rating or conclusion is published.');
    }
    appendText(root, 'p', 'Map shading is reserved for jurisdiction-wide system-level findings. A single case or localized pattern is shown in the detail record and is not used to color an entire state.');
    byId('detail-title').textContent = state.name;
    byId('federal-detail').classList.remove('audit-federal-selected');
  }
  function chooseState(code) {
    showState(code);
    byId('jurisdiction-detail').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function showFederal() {
    const panel = byId('federal-detail');
    panel.classList.add('audit-federal-selected');
    panel.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function renderPilotCards() {
    const root = byId('pilot-source-cards');
    root.replaceChildren();
    ['OK','CA','NY','FL'].forEach(code => {
      const state = window.ATLAS_MAP.states.find(item => item.abbr === code);
      const pilot = pilotForState(code);
      if (!state || !pilot) return;
      const card = document.createElement('article');
      card.className = 'audit-source-card';
      appendText(card,'span',code + ' / ' + state.name,'audit-source-id');
      appendText(card,'h3',pilot.reviewStatus);
      appendText(card,'p',pilot.summary);
      const list = document.createElement('ul');
      pilot.sources.forEach(source => {
        const li = document.createElement('li');
        li.appendChild(sourceLink(source));
        list.appendChild(li);
      });
      card.appendChild(list);
      root.appendChild(card);
    });
  }
  async function init() {
    try {
      const response = await fetch('pilot.json');
      if (!response.ok) throw new Error('Pilot source data could not be loaded.');
      data = await response.json();
      buildMap();
      byId('topic').addEventListener('change', event => {
        currentTopic = event.target.value;
        showState(selected);
      });
      byId('map-mode').addEventListener('change', event => {
        currentMode = event.target.value;
        updateMapStyles();
      });
      byId('jurisdiction-select').addEventListener('change', event => chooseState(event.target.value));
      byId('federal-button').addEventListener('click', showFederal);
      renderPilotCards();
      showState(selected);
    } catch (error) {
      byId('map-summary').textContent = 'The jurisdiction map could not load its source data.';
      appendText(byId('detail-content'),'p',error.message);
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
