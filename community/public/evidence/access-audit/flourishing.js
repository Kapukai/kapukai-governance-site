(() => {
  const root = document.getElementById('flourishing-function-grid');
  if (!root) return;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));
  const list = (items, className) => '<ul class="' + (className || '') + '">' +
    items.map((item) => '<li>' + esc(item) + '</li>').join('') + '</ul>';
  const linkList = (items) => '<ul class="flourishing-source-list">' +
    items.map((item) => '<li><a href="' + esc(item.url) + '" target="_blank" rel="noopener">' + esc(item.title) + ' ↗</a></li>').join('') + '</ul>';

  const render = (data) => {
    const scopeRoot = document.getElementById('flourishing-relationship-scopes');
    const techRoot = document.getElementById('flourishing-technology-layers');
    const auditRoot = document.getElementById('flourishing-audit-states');
    const fundingRoot = document.getElementById('flourishing-funding-lens');
    const protocolRoot = document.getElementById('flourishing-evidence-protocol');
    if (scopeRoot) {
      scopeRoot.innerHTML = '<div class="flourishing-subhead"><p class="eyebrow">RELATIONSHIP ADAPTERS</p><h3>One function register, many relationships.</h3><p>Each function is tested against the relevant relationship rather than assuming that a person, family, agency, or institution has the same needs. A relationship adapter changes the evidence and safety questions; it does not erase the person’s rights.</p></div><div class="flourishing-scope-grid">' +
        data.relationshipScopes.map((scope) => '<article class="flourishing-scope-card"><span class="flourishing-card-kicker">' + esc(scope.id) + '</span><h4>' + esc(scope.label) + '</h4><p>' + esc(scope.purpose) + '</p><p class="flourishing-test"><strong>Test:</strong> ' + esc(scope.test) + '</p></article>').join('') + '</div>';
    }
    if (techRoot) {
      techRoot.innerHTML = '<div class="flourishing-subhead"><p class="eyebrow">TECHNOLOGY LAYERS</p><h3>Technology is a behavioral environment.</h3><p>These layers shape what people can see, submit, receive, contest, and afford. The audit asks what the system does in practice, not merely what the vendor or policy says it should do.</p></div><div class="flourishing-tech-grid">' +
        data.technologyLayers.map((layer) => '<article class="flourishing-tech-card"><h4>' + esc(layer.name) + '</h4><p><strong>Examples:</strong> ' + esc(layer.examples) + '</p><p><strong>Behavior shaped:</strong> ' + esc(layer.behavior) + '</p><p class="flourishing-test"><strong>Test:</strong> ' + esc(layer.test) + '</p></article>').join('') + '</div>';
    }
    root.innerHTML = data.functions.map((fn) => '<article class="flourishing-function-card" id="' + esc(fn.id.toLowerCase()) + '">' +
      '<div class="flourishing-function-head"><span class="flourishing-priority">' + esc(fn.priority) + '</span><div><span class="flourishing-card-kicker">' + esc(fn.tier) + '</span><h3>' + esc(fn.name) + '</h3></div></div>' +
      '<p class="flourishing-purpose">' + esc(fn.purpose) + '</p>' +
      '<div class="flourishing-test-box"><strong>Minimum test</strong><span>' + esc(fn.minimumTest) + '</span></div>' +
      '<dl class="flourishing-fields"><dt>Relationship test</dt><dd>' + esc(fn.relationshipTest) + '</dd><dt>Law lens</dt><dd>' + esc(fn.lawLens) + '</dd><dt>Technology lens</dt><dd>' + esc(fn.technologyLens) + '</dd><dt>Funding lens</dt><dd>' + esc(fn.fundingLens) + '</dd><dt>Minimum evidence</dt><dd>' + esc(fn.evidence) + '</dd></dl>' +
      '<div class="flourishing-failure"><strong>Failure signals to investigate</strong>' + list(fn.failureModes) + '</div></article>').join('');
    if (auditRoot) {
      auditRoot.innerHTML = '<p class="flourishing-audit-intro">Use these labels before any numeric score. “Unknown” is a research state, not a conclusion that the function was preserved or harmed.</p><div class="flourishing-audit-state-grid">' +
        data.auditStates.map((state) => '<article><span class="flourishing-state-chip state-' + esc(state.id) + '">' + esc(state.label) + '</span><p>' + esc(state.meaning) + '</p></article>').join('') + '</div>';
    }
    if (fundingRoot) {
      fundingRoot.innerHTML = '<div class="flourishing-subhead"><p class="eyebrow">FUNDING LENS</p><h3>Follow what gets paid, measured, and made visible.</h3><p>Funding is not proof of public value. It is a trace of institutional priority. Compare appropriations and awards to the human outcome and to the repair capacity available when the system is wrong.</p></div><div class="flourishing-funding-grid"><div class="flourishing-funding-questions">' + list(data.fundingQuestions) + '</div><div class="flourishing-source-box"><h4>Public evidence sources</h4>' + linkList(data.sourceLinks) + '</div></div>';
    }
    if (protocolRoot) {
      protocolRoot.innerHTML = '<div class="flourishing-subhead"><p class="eyebrow">COMPARISON PROTOCOL</p><h3>Compare law, norms, technology, funding, and lived outcome without collapsing them.</h3><p>For each function, create one row for the jurisdiction, relationship, procedure, time period, and source scope. A gap is a finding only when the evidence supports that scope.</p></div><div class="flourishing-protocol-grid">' +
        data.evidenceProtocol.map((item) => '<article><span class="flourishing-card-kicker">' + esc(item.label) + '</span><p>' + esc(item.text) + '</p></article>').join('') + '</div>';
    }
  };

  fetch('flourishing.json', {cache:'no-store'}).then((response) => {
    if (!response.ok) throw new Error('Flourishing register unavailable');
    return response.json();
  }).then(render).catch((error) => {
    root.innerHTML = '<p class="audit-caveat">The flourishing-function register could not load. The page remains usable, but this module must be restored before its findings are used.</p>';
    console.error(error);
  });
})();