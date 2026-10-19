'use strict';
(() => {
  const demo = document.querySelector('[data-gate-demo]');
  if (!demo) return;
  const checks = [...demo.querySelectorAll('input[type="checkbox"]')];
  const screen = demo.querySelector('.decision-screen');
  function update() {
    const count = checks.filter(input => input.checked).length;
    demo.querySelector('[data-count]').textContent = `${count}/3`;
    screen.classList.toggle('ready', count === 3);
    demo.querySelector('[data-status]').textContent = count === 3 ? 'Ready for human review' : 'Record incomplete';
    const missing = checks.filter(input => !input.checked).map(input => ({authority:'identify the authority',evidence:'link the evidence',review:'make review reachable'}[input.name]));
    demo.querySelector('[data-explanation]').textContent = count === 3
      ? 'The proposed record is complete. A reviewer must still assess the facts, reasons, notice, and applicable requirements.'
      : `Still needed: ${missing.join('; ')}.`;
  }
  checks.forEach(input => input.addEventListener('change', update));
  demo.querySelector('[data-reset]').addEventListener('click', () => {
    checks.forEach(input => { input.checked = false; });
    update();
  });
  document.querySelectorAll('a[href="#source-biology"]').forEach(link => link.addEventListener('click', () => {
    document.querySelector('#sources details').open = true;
  }));
  update();
})();
