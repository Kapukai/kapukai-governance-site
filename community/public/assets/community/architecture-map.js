/* Progressive enhancement; all findings and sources remain in the HTML. */
(function () {
  'use strict';
  const root = document.getElementById('evidence-map');
  if (!root) return;

  const inspector = root.querySelector('[data-evidence-inspector]');
  const anchors = Array.from(root.querySelectorAll('a[data-evidence-cell]'));
  const records = Array.from(root.querySelectorAll('[data-evidence-record]'));
  const statusNames = {
    F: 'Failure found in reviewed period',
    P: 'Documented practice / requirement',
    V: 'Measured improvement · association',
    '?': 'Unassessed · no established gap'
  };
  const statusClasses = { F: 'f', P: 'p', V: 'v', '?': 'u' };
  const cells = [];
  if (!inspector || !anchors.length) return;

  function setText(selector, value) {
    const target = inspector.querySelector(selector);
    if (target) target.textContent = value;
  }

  function select(cell) {
    const finding = document.getElementById(cell.dataset.finding);
    const record = finding && finding.closest('[data-evidence-record]');
    if (!finding || !record) return;

    const code = finding.dataset.code;
    const read = (selector) => {
      const node = record.querySelector(selector);
      return node ? node.textContent.trim() : '';
    };
    cells.forEach((button) => button.setAttribute('aria-pressed', String(button === cell)));
    const symbol = inspector.querySelector('[data-inspector-symbol]');
    if (symbol) {
      symbol.textContent = code;
      symbol.className = 'evidence-symbol evidence-status-' + statusClasses[code];
    }
    setText('[data-inspector-heading]', read('[data-record-label]') + ' · ' + finding.dataset.column);
    setText('[data-inspector-status]', statusNames[code]);
    setText('[data-inspector-finding]', finding.querySelector('[data-finding-text]').textContent.trim());
    setText('[data-inspector-period]', read('[data-record-period]'));
    setText('[data-inspector-scope]', read('[data-record-scope]'));
    setText('[data-inspector-consequence]', read('[data-record-consequence]'));
    setText('[data-inspector-owner]', read('[data-record-owner]'));
    setText('[data-inspector-test]', read('[data-record-test]'));

    const sources = inspector.querySelector('[data-inspector-sources]');
    if (sources) {
      const findingSources = finding.querySelector('[data-finding-sources]');
      sources.replaceChildren();
      Array.from(findingSources.childNodes).forEach((node) => sources.appendChild(node.cloneNode(true)));
      const statusSource = record.querySelector('[data-record-status-source]');
      if (statusSource) {
        sources.appendChild(document.createTextNode(' · '));
        sources.appendChild(statusSource.cloneNode(true));
      }
    }
    const recordLink = inspector.querySelector('[data-inspector-record-link]');
    if (recordLink) recordLink.setAttribute('href', '#' + record.id);
  }

  anchors.forEach((anchor) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = anchor.className;
    button.textContent = anchor.textContent;
    button.dataset.finding = anchor.dataset.finding;
    button.dataset.evidenceCell = '';
    button.setAttribute('aria-label', anchor.getAttribute('aria-label'));
    button.setAttribute('aria-controls', inspector.id);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => select(button));
    anchor.replaceWith(button);
    cells.push(button);
  });

  const initial = cells.find((cell) => cell.dataset.finding === 'evidence-finding-flint-4') || cells[0];
  select(initial);
  records.forEach((record) => { record.open = false; });
  root.dataset.enhanced = 'true';

  const recordLink = inspector.querySelector('[data-inspector-record-link]');
  if (recordLink) {
    recordLink.addEventListener('click', () => {
      const target = document.getElementById(recordLink.getAttribute('href').slice(1));
      if (target) target.open = true;
    });
  }

  function revealFragmentRecord() {
    let id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch (_) { return; }
    const target = id && document.getElementById(id);
    const record = target && target.closest('[data-evidence-record]');
    if (record) record.open = true;
  }
  revealFragmentRecord();
  window.addEventListener('hashchange', revealFragmentRecord);
})();
