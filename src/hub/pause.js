// ---------------------------------------------------------------------------
// PAUSE MENU — the overlay over a mission (design/pause-menu.md,
// tech/pause-menu.md). Two screens: the menu (Options, Resume) and Options,
// which is the editor's settings renderer fed `pauseSchema` — the live
// settings, minus the room's own in a room mission.
//
// Owns no rules. A change goes through `setConfig`, exactly as the editor's
// Settings tab does, and then to `onChange(key, value)` for anything the page
// must do about it (the 2D/3D view). Resume calls `resume()`. It never closes
// itself: the mission's `pause` key and `resume()` both end in the host's
// `onPauseChange(false)`, which disposes it — one path for every way out.
// ---------------------------------------------------------------------------

import { controlsTabsHTML, bindControls, showControlsTab } from "./controls.js";
import { config, setConfig, isDefault, pauseSchema } from "../game/config.js";

export function createPauseMenu(container, { room = false, resume, onChange } = {}) {
  const el = document.createElement("div");
  el.className = "pm";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Pause menu");

  let screen = "menu";
  let tab = 0;

  function draw() {
    el.innerHTML = screen === "menu"
      ? `<div class="pm-panel pm-menu">
           <button type="button" class="btn" data-pm="options">Options</button>
           <button type="button" class="btn btn-go" data-pm="resume">Resume</button>
         </div>`
      : `<div class="pm-panel pm-options">
           <div class="pm-head">
             <button type="button" class="btn btn-ghost btn-sm" data-pm="back">← Back</button>
             <h2>Options</h2>
           </div>
           <div class="pm-cfg">${controlsTabsHTML(pauseSchema({ room }), config, isDefault, tab)}</div>
         </div>`;
    // Keyboard reaches the menu (the mission's input leaves every key but
    // pause alone while it is open), so start it somewhere.
    const first = el.querySelector("[data-pm]");
    if (first && first.focus) first.focus();
  }

  function show(name) {
    screen = name;
    draw();
  }

  // Delegated, so a redraw keeps every listener.
  bindControls(el, (key, value) => {
    const v = setConfig(key, value);
    if (onChange) onChange(key, v);
  });
  el.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-pm],[data-cfg-tab]");
    if (!t) return;
    if (t.dataset.cfgTab !== undefined) tab = showControlsTab(el, t.dataset.cfgTab);
    else if (t.dataset.pm === "options") show("options");
    else if (t.dataset.pm === "back") show("menu");
    else if (t.dataset.pm === "resume" && resume) resume();
  });

  draw();
  container.appendChild(el);

  return {
    el,
    screen: () => screen,
    dispose() {
      if (el.remove) el.remove();
      else if (container.removeChild) container.removeChild(el);
    },
  };
}
