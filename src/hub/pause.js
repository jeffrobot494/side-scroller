// ---------------------------------------------------------------------------
// PAUSE MENU — the overlay over a mission (design/pause-menu.md,
// tech/pause-menu.md). Three screens: the menu (Options, Debug, Resume);
// Options, which is the editor's settings renderer fed `pauseSchema` — the live
// settings, minus the room's own in a room mission; and Debug
// (tech/squad-debug.md), the same renderer fed the mission's debug layers.
//
// Debug exists only with a `debug` handle (the mission's per-deploy flags;
// null in a room) and while config.debugOverlays is on — decided at every
// draw, because that knob is live on the Options screen of this same menu.
//
// Owns no rules. A change goes through `setConfig`, exactly as the editor's
// Settings tab does, and then to `onChange(key, value)` for anything the page
// must do about it (the 2D/3D view). Resume calls `resume()`. It never closes
// itself: the mission's `pause` key and `resume()` both end in the host's
// `onPauseChange(false)`, which disposes it — one path for every way out.
// ---------------------------------------------------------------------------

import { controlsHTML, controlsTabsHTML, bindControls, showControlsTab } from "./controls.js";
import { config, setConfig, isDefault, pauseSchema, SCHEMA } from "../game/config.js";

// The Debug screen's controls, as schema items the controls renderer draws.
// A `debug.` key writes the mission's debug handle, never the config.
const DEBUG_PREFIX = "debug.";
const DEBUG_LAYERS = [
  { key: "debug.graph", label: "Nav graph", type: "bool", help: "Every place the squad's body can stand and every connection between them." },
  { key: "debug.path", label: "Squad routes", type: "bool", help: "The route each squadmate is walking, with its concern, health and exposure." },
  { key: "debug.threats", label: "Threats", type: "bool", help: "A line from every hostile that can hit a squadmate where it stands." },
  { key: "debug.spots", label: "Spot choice", type: "bool", help: "Every spot a squadmate weighed at its last pick, best green to worst red, the chosen one ringed and staying put a square. Labels: total, then travel, danger, shot, crowding; – is a term it never computed." },
  { key: "debug.dodges", label: "Dodges", type: "bool", help: "A tag over a squadmate for each round it judged a threat: DUCK, JUMP, CAN'T, MISSED, LATE." },
  { key: "debug.speed", label: "Speed", type: "enum", options: ["full", "half", "quarter"], help: "Slow motion. The mission plays out exactly as it would at full speed." },
];
const SPEEDS = { full: 1, half: 0.5, quarter: 0.25 };
const speedName = (v) => Object.keys(SPEEDS).find((k) => SPEEDS[k] === v) || "full";

// Settings the Debug screen shows beside the layers: real config items, drawn
// and written exactly as the Options screen draws and writes them.
const DEBUG_SETTINGS = ["debugPauseOnDeath"];

function debugHTML(debug) {
  const values = {};
  for (const it of DEBUG_LAYERS) values[it.key] = debug[it.key.slice(DEBUG_PREFIX.length)];
  values["debug.speed"] = speedName(debug.speed);
  const settings = SCHEMA.flatMap((g) => g.items).filter((it) => DEBUG_SETTINGS.includes(it.key));
  return controlsHTML([{ title: "Layers", items: DEBUG_LAYERS }], values, null)
    + controlsHTML([{ title: "Settings", items: settings }], config, isDefault);
}

export function createPauseMenu(container, { room = false, resume, onChange, screen: first = "menu", debug = null } = {}) {
  const el = document.createElement("div");
  el.className = "pm";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Pause menu");

  let screen = first;
  let tab = 0;
  const hasDebug = () => !!debug && !!config.debugOverlays;

  function draw() {
    if (screen === "debug" && !hasDebug()) screen = "menu";
    el.innerHTML = screen === "menu"
      ? `<div class="pm-panel pm-menu">
           <button type="button" class="btn" data-pm="options">Options</button>
           ${hasDebug() ? `<button type="button" class="btn" data-pm="debug">Debug</button>` : ""}
           <button type="button" class="btn btn-go" data-pm="resume">Resume</button>
         </div>`
      : screen === "debug"
      ? `<div class="pm-panel pm-options pm-debug">
           <div class="pm-head">
             <button type="button" class="btn btn-ghost btn-sm" data-pm="back">← Back</button>
             <h2>Debug</h2>
           </div>
           <div class="pm-cfg">${debugHTML(debug)}</div>
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
    if (key.startsWith(DEBUG_PREFIX)) {
      const k = key.slice(DEBUG_PREFIX.length);
      if (debug) debug[k] = k === "speed" ? SPEEDS[value] ?? 1 : value;
      return;
    }
    const v = setConfig(key, value);
    if (onChange) onChange(key, v);
  });
  el.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-pm],[data-cfg-tab]");
    if (!t) return;
    if (t.dataset.cfgTab !== undefined) tab = showControlsTab(el, t.dataset.cfgTab);
    else if (t.dataset.pm === "options") show("options");
    else if (t.dataset.pm === "debug") show("debug");
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
