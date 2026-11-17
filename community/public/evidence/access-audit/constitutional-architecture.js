(() => {
  const root = document.getElementById('constitutional-architecture-visual');
  if (!root) return;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));
  const render = (data) => {
    root.innerHTML =
      '<div class="constitutional-visual-intro"><div><span class="constitutional-kicker">SOURCE TEXT / DIRECT EVIDENCE</span><h3>What the founding texts explicitly establish</h3><p>People and rights are the source; government is instituted to secure those ends; powers are assigned to defined offices; officers remain bound by the Constitution.</p></div><div class="constitutional-inference-note"><span class="constitutional-kicker">SYSTEMS INFERENCE / TESTABLE RISK</span><h3>What architectural inversion would look like</h3><p>This is an inference to test against records and operations. The sources do not, by themselves, prove that every modern institution has inverted the relationship.</p></div></div>' +
      '<div class="constitutional-lanes" aria-label="Source architecture and inversion test">' +
        '<section class="constitutional-lane constitutional-source-lane"><div class="constitutional-lane-title"><span>01</span><div><span class="constitutional-kicker">SOURCE ARCHITECTURE</span><h3>Power flows outward from the people</h3></div></div>' +
          '<ol>' + data.sourceLane.map((item) => '<li><span class="constitutional-step">' + esc(item.step) + '</span><div><span class="constitutional-card-label">' + esc(item.label) + '</span><h4>' + esc(item.title) + '</h4><blockquote>“' + esc(item.quote) + '”</blockquote><p>' + esc(item.establishes) + '</p><a href="' + esc(item.sourceUrl) + '" target="_blank" rel="noopener">' + esc(item.sourceName) + ' ↗</a></div></li>').join('') + '</ol>' +
        '</section>' +
        '<section class="constitutional-lane constitutional-inversion-lane"><div class="constitutional-lane-title"><span>02</span><div><span class="constitutional-kicker">INVERSION TEST</span><h3>Representation starts acting like the source</h3></div></div>' +
          '<ol>' + data.inversionLane.map((item) => '<li><span class="constitutional-step">' + esc(item.step) + '</span><div><span class="constitutional-card-label">RISK SIGNAL</span><h4>' + esc(item.title) + '</h4><p>' + esc(item.body) + '</p><p class="constitutional-test"><strong>Test:</strong> ' + esc(item.test) + '</p></div></li>').join('') + '</ol>' +
        '</section>' +
      '</div>' +
      '<div class="constitutional-bridge"><strong>ARCHITECTURAL INVERSION</strong><span>Delegated representation becomes a substitute for the person, the evidence, and the constitutional limit.</span></div>' +
      '<div class="constitutional-priority"><div class="constitutional-subhead"><span class="constitutional-kicker">HIGHEST-SIGNAL ORDER</span><h3>Six checks that expose the difference</h3><p>Run these checks in order before calling a defect systemic. A missing answer is an evidence gap, not proof of intent.</p></div><ol>' +
        data.priorityTests.map((item) => '<li><span>' + esc(item.priority) + '</span><div><h4>' + esc(item.name) + '</h4><p>' + esc(item.question) + '</p></div></li>').join('') + '</ol></div>' +
      '<div class="constitutional-quote-strip"><strong>One-line public label:</strong> “The institution may represent the people; it may not become the unverified source of the people’s identity, rights, or facts.”</div>' +
      '<div class="constitutional-sources"><span class="constitutional-kicker">PRIMARY SOURCES</span>' + data.sourceLinks.map((item) => '<a href="' + esc(item.url) + '" target="_blank" rel="noopener">' + esc(item.label) + ' ↗</a>').join('') + '</div>';
  };
  fetch('constitutional-architecture.json', {cache:'no-store'}).then((response) => {
    if (!response.ok) throw new Error('Constitutional architecture module unavailable');
    return response.json();
  }).then(render).catch((error) => {
    root.innerHTML = '<p class="audit-caveat">The constitutional architecture visual could not load. Restore the source module before relying on this comparison.</p>';
    console.error(error);
  });
})();