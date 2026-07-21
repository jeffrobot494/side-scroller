// ---------------------------------------------------------------------------
// EDITOR APP — a dev-only entry (editor.html) for tweaking settings and, later,
// GUI tools. The Settings tab is auto-generated from the config SCHEMA; the
// Tools tab is where bespoke GUI editors (weapons, enemies, levels) will live.
// ---------------------------------------------------------------------------

import {
  SCHEMA,
  config,
  setConfig,
  resetConfig,
  isDefault,
  exportConfig,
  importConfig,
} from "../game/config.js";
import { controlsHTML, bindControls } from "./controls.js";

const root = document.getElementById("editor");
let tab = "settings";

// Placeholders that establish the panel pattern for future bespoke tools.
const TOOLS = [
  { label: "Weapon Designer", desc: "Compose weapons from primitives and validate them against the cost budget." },
  { label: "Enemy Designer", desc: "Tune archetype stats and behavior/steering parameters." },
  { label: "Level Editor", desc: "Place platforms, spawns, loot, and the exit on a canvas." },
];

function render() {
  root.innerHTML = `
    <header class="ed-top">
      <div class="ed-brand">⚙ XCOM&nbsp;TASK&nbsp;FORCE <span>· EDITOR</span></div>
      <nav class="ed-tabs">
        <button data-tab="settings" class="${tab === "settings" ? "active" : ""}">Settings &amp; Tuning</button>
        <button data-tab="tools" class="${tab === "tools" ? "active" : ""}">Tools</button>
      </nav>
      <a class="ed-play" href="./index.html">▸ Play</a>
    </header>
    <main class="ed-body">${tab === "settings" ? settingsView() : toolsView()}</main>`;

  if (tab === "settings") bindControls(document.getElementById("cfg"), (key, val) => setConfig(key, val));
}

function settingsView() {
  return `
    <p class="ed-note">
      Changes save to this browser instantly. <strong>Live</strong> values (friendly fire, squad damage,
      run/jump speed) take effect immediately, even mid-mission. Load-time values (gravity) apply on your
      next deploy — reload the game after big changes. To make a tweak permanent, Export and paste the
      values into <code>src/game/config.js</code> defaults.
    </p>
    <div id="cfg" class="cfg">${controlsHTML(SCHEMA, config, isDefault)}</div>
    <section class="ed-io">
      <div class="ed-io-btns">
        <button class="btn" data-action="reset">Reset all to defaults</button>
        <button class="btn" data-action="export">Export JSON ▾</button>
        <button class="btn" data-action="import">▴ Import JSON</button>
        <span id="io-msg" class="ed-msg"></span>
      </div>
      <textarea id="io" class="ed-json" spellcheck="false"
        placeholder="Export writes the current settings here. Paste settings JSON and hit Import to apply."></textarea>
    </section>`;
}

function toolsView() {
  return `
    <p class="ed-note">
      GUI tools land here as we build them. The settings tab is auto-generated from a schema; each tool
      below is its own bespoke panel that plugs into this same shell.
    </p>
    <div class="tool-grid">
      ${TOOLS.map(
        (t) => `<article class="tool-card"><h3>${t.label}</h3><p>${t.desc}</p><span class="soon">Planned</span></article>`
      ).join("")}
    </div>`;
}

root.addEventListener("click", (e) => {
  const tb = e.target.closest("[data-tab]");
  if (tb) {
    tab = tb.dataset.tab;
    render();
    return;
  }
  const act = e.target.closest("[data-action]");
  if (!act) return;

  switch (act.dataset.action) {
    case "reset":
      resetConfig();
      render();
      msg("Reset all settings to defaults.");
      break;
    case "export":
      document.getElementById("io").value = exportConfig();
      msg("Exported current settings below. Copy into config.js to make permanent.");
      break;
    case "import": {
      const res = importConfig(document.getElementById("io").value);
      render();
      msg(res.ok ? `Imported ${res.applied} setting(s).` : res.reason, res.ok);
      break;
    }
  }
});

function msg(text, ok = true) {
  const m = document.getElementById("io-msg");
  if (m) {
    m.textContent = text;
    m.className = "ed-msg " + (ok ? "ok" : "bad");
  }
}

render();
