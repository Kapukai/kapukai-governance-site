/* Enhance native disclosure navigation without taking away no-script access. */
(() => {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const menu = header.querySelector('.site-menu');
  const groups = [...header.querySelectorAll('.nav-group')];
  const desktop = window.matchMedia('(min-width: 951px)');
  const setLayout = () => {
    menu.open = desktop.matches;
    groups.forEach(group => { group.open = false; });
  };
  setLayout();
  if (desktop.addEventListener) desktop.addEventListener('change', setLayout);
  else desktop.addListener(setLayout);
  groups.forEach(group => group.addEventListener('toggle', () => {
    if (group.open) groups.forEach(other => { if (other !== group) other.open = false; });
  }));
  header.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const group = event.target.closest('.nav-group[open]');
    if (group) {
      group.open = false;
      group.querySelector('summary').focus();
      event.preventDefault();
    } else if (!desktop.matches && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
      event.preventDefault();
    }
  });
  document.addEventListener('click', event => {
    if (!header.contains(event.target)) groups.forEach(group => { group.open = false; });
  });
  header.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!header.contains(document.activeElement)) groups.forEach(group => { group.open = false; });
    }, 0);
  });
})();
