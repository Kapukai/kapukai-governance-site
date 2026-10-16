/* Progressive enhancement: every pattern and download is present without JS. */
(function () {
  'use strict';
  const root = document.querySelector('.pattern-library');
  if (!root) return;
  const group = root.querySelector('#pattern-group');
  const cards = Array.from(root.querySelectorAll('[data-pattern]'));
  const links = Array.from(root.querySelectorAll('[data-pattern-link]'));
  const showAll = root.querySelector('#pattern-show-all');
  const count = root.querySelector('#pattern-count');
  if (!group || !showAll || !count || !cards.length) return;
  group.disabled = false;
  showAll.hidden = false;
  let selected = null;

  function render() {
    const eligible = cards.filter(card => group.value === 'all' || card.dataset.group === group.value);
    cards.forEach(card => { card.hidden = !eligible.includes(card) || (selected !== null && card.dataset.pattern !== selected); });
    links.forEach(link => {
      const card = cards.find(item => item.dataset.pattern === link.dataset.patternLink);
      link.hidden = !eligible.includes(card);
      if (link.dataset.patternLink === selected) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    count.textContent = eligible.length + ' patterns' + (selected ? ' · viewing ' + selected.toUpperCase() : ' · showing all');
    showAll.textContent = selected ? 'Show all in this focus' : 'Showing all in this focus';
    showAll.disabled = !selected;
  }

  function choose(id, updateHash) {
    const card = cards.find(item => item.dataset.pattern === id);
    if (!card) return;
    if (group.value !== 'all' && group.value !== card.dataset.group) group.value = 'all';
    selected = id;
    render();
    if (updateHash) history.replaceState(null, '', '#' + id);
  }
  links.forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    choose(link.dataset.patternLink, true);
    const heading = document.getElementById(link.dataset.patternLink + '-title');
    heading.setAttribute('tabindex', '-1');
    heading.focus({preventScroll: true});
    if (typeof heading.scrollIntoView === 'function') heading.scrollIntoView({block: 'start'});
  }));
  group.addEventListener('change', () => {
    selected = null;
    history.replaceState(null, '', '#patterns');
    render();
  });
  showAll.addEventListener('click', () => {
    selected = null;
    history.replaceState(null, '', '#patterns');
    render();
  });
  function readHash() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)).toLowerCase(); } catch (_) { return; }
    if (id === 'patterns') { selected = null; render(); return; }
    if (cards.some(card => card.dataset.pattern === id)) choose(id, false);
  }
  window.addEventListener('hashchange', readHash);
  selected = 'p01';
  render();
  readHash();
})();
