/* Progressive enhancement: every pathway remains readable without this script. */
(() => {
  "use strict";

  const controls = document.getElementById("pathway-controls");
  const status = document.getElementById("pathway-status");
  if (!controls || !status) return;

  const buttons = [...controls.querySelectorAll("button[data-pathway]")];
  const paths = buttons.map((button) => ({
    button,
    panel: document.getElementById(button.getAttribute("aria-controls")),
  }));

  // Keep the complete HTML fallback if markup is ever incomplete.
  if (paths.length !== 5 || paths.some(({ panel }) => !panel)) return;

  function showPathway(selected, announce = true) {
    for (const { button, panel } of paths) {
      const active = button === selected;
      button.setAttribute("aria-pressed", String(active));
      panel.hidden = !active;
    }
    if (announce) {
      const { panel } = paths.find(({ button }) => button === selected);
      status.textContent = `Showing pathway: ${panel.querySelector("h3").textContent}`;
    }
  }

  for (const { button } of paths) {
    button.addEventListener("click", () => showPathway(button));
  }

  showPathway(buttons[0], false);
  controls.hidden = false;
})();
