// ---------------------------------------------------------------------------
// EDITOR APP — a dev-only entry (editor.html) for tweaking settings and running
// GUI tools. The Settings tab is auto-generated from the config SCHEMA; the
// Tools tab hosts bespoke GUI editors (the Weapon Designer today; enemy and
// level editors to come); the Sound tab owns the mixer + the cue bank.
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
import { controlsTabsHTML, bindControls, showControlsTab } from "./controls.js";
import { serverTarget, createRemoteConfig } from "./remote-config.js";
import { createWeaponDesigner } from "./tools/weapon-designer.js";
import { createEnemyDesigner } from "./tools/enemy-designer.js";
import { createLevelGenerator } from "./tools/level-generator.js";
import { createFiringRoom } from "./tools/firing-room.js";
import { createBehaviorLab } from "./tools/behavior-lab.js";
import { createControlsMapper } from "./tools/controls-mapper.js";
import { createSoundPage } from "./sound-page.js";
import { applyWeaponOverrides } from "../game/weaponoverrides.js";
import { applyEnemyRoster } from "../game/enemyspecs.js";
import { audio } from "../audio/engine.js";

// Built-in weapons the Weapon Designer has overridden. The editor page needs
// its own call because it never builds a game state: the Firing Room reads
// ARSENAL straight from arsenal.js, so without this the tool that authored an
// override would sit on a page that doesn't show it.
applyWeaponOverrides();

// And the enemy roster, for the same reason: the Level Generator previews
// placements without ever building a game state, so without this the tool that
// admitted an enemy would sit on a page that never places it.
applyEnemyRoster();

const root = document.getElementById("editor");
let tab = "settings";
let toolId = null; // which Tools-tab tool is open (null = the tool grid)
let settingsTab = 0; // which SCHEMA group the Settings tab is showing
let activeTool = null; // the mounted tool instance ({ dispose })

// SERVER MODE  (tech/server-settings.md, C3). `editor.html?server=1` tunes the
// ROOM's settings — the process holding the campaign and stepping the mission —
// instead of this browser's localStorage. No query string is unchanged
// single-player behaviour, which is the case with no test and the one to check
// by opening the page.
const remote = (() => {
  const target = serverTarget(location.href);
  return target ? createRemoteConfig(target, { onError: (key, why) => msg(`${key} — ${why}`, false) }) : null;
})();
let serverCfg = null;   // the last { groups, values } from GET /api/config
let serverErr = null;   // why the fetch failed, shown instead of the controls
let loading = false;    // a load is in flight; render() must not start a second

// `render()` is synchronous and runs at module load, so a fetch is a second
// pass. The first pass draws a placeholder with NO tabs rather than the local
// nine — `settingsTab` is a positional index into whatever was rendered and
// `showControlsTab` only clamps, so drawing nine groups and replacing them with
// six would move the tab under a click (approximation 10).
function loadServerConfig() {
  if (!remote || loading) return;
  loading = true;
  serverErr = null;
  remote
    .load()
    .then((payload) => { serverCfg = payload; })
    .catch((e) => { serverErr = e && e.message; })
    .then(() => { loading = false; if (tab === "settings") render(); });
}

// The default-comparison over a wire. `item.default`, NOT `isDefault` — that
// one reads the module-local `config`, and of a key this browser does not have
// it answers `true`, so a server knob would read as unchanged rather than as
// an error.
function serverIsDefault(items) {
  const byKey = Object.fromEntries(items.map((it) => [it.key, it]));
  return (key) => {
    const it = byKey[key];
    return !it || serverCfg.values[key] === it.default;
  };
}

// Auditioning a cue needs a live AudioContext, which browsers only grant inside
// a user gesture — same arming as the game page.
audio.armUnlock();

// The Sound tab owns these knobs, so the Settings tab doesn't show them twice.
const SETTINGS_SCHEMA = SCHEMA.filter((g) => g.title !== "Sound");

const TOOLS = [
  { id: "weapon", label: "Weapon Designer", desc: "Compose weapons from primitives, watch them fire, and check them against the cost budget." },
  { id: "enemy", label: "Enemy Designer", desc: "Compose EnemySpec enemies — prompt the LLM or build by hand (parts, brains, emitters) — validate, preview, and save to the library." },
  { id: "levelgen", label: "Level Generator", desc: "Generate procedural missions from a seed; preview the layout and check the threat budget." },
  { id: "firing", label: "Firing Room", desc: "Fire any weapon at respawning dummies or waves of real enemies on a platformed range." },
  { id: "behaviorlab", label: "Behavior Lab", desc: "Watch one agent navigate: click anywhere on a generated level to send it there and see whether it can get there." },
  { id: "controls", label: "Controls", desc: "Rebind keyboard controls (move, jump, fire, reload, …); gamepad uses built-in defaults." },
  { label: "Level Editor", desc: "Place platforms, spawns, loot, and the exit on a canvas." },
];

function disposeTool() {
  if (activeTool) {
    activeTool.dispose();
    activeTool = null;
  }
}

function render() {
  disposeTool();

  const MOUNTABLE = ["weapon", "enemy", "levelgen", "firing", "behaviorlab", "controls"];
  let body;
  if (tab === "settings") body = settingsView();
  else if (tab === "sound") body = `<div id="tool-host" class="tool-host"></div>`;
  else if (MOUNTABLE.includes(toolId)) body = `<div id="tool-host" class="tool-host"></div>`;
  else body = toolsView();

  root.innerHTML = `
    <header class="ed-top">
      <div class="ed-brand">⚙ XCOM&nbsp;TASK&nbsp;FORCE <span>· EDITOR</span></div>
      <nav class="ed-tabs">
        <button data-tab="settings" class="${tab === "settings" ? "active" : ""}">Settings &amp; Tuning</button>
        <button data-tab="sound" class="${tab === "sound" ? "active" : ""}">Sound</button>
        <button data-tab="tools" class="${tab === "tools" ? "active" : ""}">Tools</button>
      </nav>
      <a class="ed-play" href="./index.html">▸ Play</a>
    </header>
    <main class="ed-body">${body}</main>`;

  if (tab === "settings" && document.getElementById("cfg"))
    bindControls(document.getElementById("cfg"), (key, val) => {
      // In server mode a change goes over the wire, debounced — `bindControls`
      // fires on every `input` event of a range, which is one POST per pixel of
      // a drag otherwise. `setConfig` is not called: this browser is a keyboard
      // here, not a store.
      if (remote) remote.set(key, val);
      else setConfig(key, val);
    });
  // Server mode's first pass has no controls to bind and a fetch to start.
  if (tab === "settings" && remote && !serverCfg && !serverErr) loadServerConfig();
  // The Sound page follows the same createX(container) → { dispose() } contract
  // the Tools-tab panels use, so the shell tears it down the same way.
  if (tab === "sound") activeTool = createSoundPage(document.getElementById("tool-host"));
  if (tab === "tools" && MOUNTABLE.includes(toolId)) {
    const host = document.getElementById("tool-host");
    const back = () => { toolId = null; render(); };
    const factory = { weapon: createWeaponDesigner, enemy: createEnemyDesigner, levelgen: createLevelGenerator, firing: createFiringRoom, behaviorlab: createBehaviorLab, controls: createControlsMapper }[toolId];
    activeTool = factory(host, back);
  }
}

function settingsView() {
  if (remote) return serverSettingsView();
  return `
    <p class="ed-note">
      Changes save to this browser instantly. <strong>Live</strong> values (friendly fire, squad damage,
      run/jump speed) take effect immediately, even mid-mission. Load-time values (gravity) apply on your
      next deploy — reload the game after big changes. To make a tweak permanent, Export and paste the
      values into <code>src/game/config.js</code> defaults. Volumes live on the <strong>Sound</strong> tab.
      A dot on a group means something in it differs from the default.
    </p>
    <div id="cfg" class="cfg">${controlsTabsHTML(SETTINGS_SCHEMA, config, isDefault, settingsTab)}</div>
    ${ioHTML()}`;
}

// The same screen, pointed at a room. Three differences and they are all in
// here: where the groups and values come from, what the note says, and that
// Reset is dead.
function serverSettingsView() {
  if (serverErr)
    return `
      <p class="ed-note bad">
        <strong>No settings from ${remote.label}.</strong> ${serverErr}<br>
        This page is in server mode because its URL says <code>?server=1</code>, which means the origin
        that served it. <code>python3 -m http.server</code> serves these files but has no
        <code>/api</code> — run <code>npm start</code> and open the editor from that port, point this one
        somewhere else with <code>?server=http://host:port</code>, or drop the query string to tune this
        browser instead.
      </p>
      <div class="ed-io-btns"><button class="btn" data-action="retry">Retry</button></div>`;

  if (!serverCfg) return `<p class="ed-note">Reading settings from ${remote.label}…</p>`;

  // THE GROUPS ARE THE SERVER'S, already rebuilt with a filtered `items` and
  // with empty ones dropped (`serverConfig()` in server.mjs). Filtering the
  // group ARRAY instead would keep a group whole for one server knob and leak
  // the nine viewer knobs sitting beside them — `soldierBaseHp`, the doom
  // family, `aimMode` — drawn as live sliders posting at a server that refuses
  // them (approximation 7).
  const items = serverCfg.groups.flatMap((g) => g.items);
  return `
    <p class="ed-note">
      <strong>Tuning ${remote.label}</strong> — the room holding the campaign, not this browser.
      A change here is <strong>live on that server the moment you make it</strong>, mid-mission included,
      for every commander in every room it is running.
      <strong>It is lost when that server restarts</strong> — <strong>⤓ Make permanent</strong> writes what
      it is running into <code>src/game/config.js</code>, and committing that is what carries it to every
      server from then on. A server with no checkout under it (a deployed one) cannot do that and says so;
      there, Export below and paste the values in by hand. Only the knobs the room reads are shown;
      everything else (view, sound, your own aim mode) stays on the
      <a href="./editor.html">plain editor</a> and in this browser.
    </p>
    <div id="cfg" class="cfg">${controlsTabsHTML(serverCfg.groups, serverCfg.values, serverIsDefault(items), settingsTab)}</div>
    ${ioHTML()}`;
}

function ioHTML() {
  const noReset = remote
    ? ` disabled title="Reset writes to this browser. Over a wire it would refresh these sliders and look like it had worked while the server kept every value."`
    : "";
  return `
    <section class="ed-io">
      <div class="ed-io-btns">
        <button class="btn" data-action="reset"${noReset}>Reset all to defaults</button>
        <button class="btn" data-action="export">Export JSON ▾</button>
        <button class="btn" data-action="import">▴ Import JSON</button>
        ${remote ? `<button class="btn" data-action="permanent" title="Write the values this server is running into src/game/config.js, so a restart comes up on them.">⤓ Make permanent</button>` : ""}
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
        (t) => `<article class="tool-card${t.id ? " available" : ""}"${t.id ? ` data-tool="${t.id}"` : ""}>
          <h3>${t.label}</h3><p>${t.desc}</p>
          <span class="soon">${t.id ? "Open ▸" : "Planned"}</span>
        </article>`
      ).join("")}
    </div>`;
}

root.addEventListener("click", (e) => {
  // Settings sub-tabs. Handled before the main tabs because both are buttons in
  // the same tree, and this one must not re-render.
  const cfgTab = e.target.closest("[data-cfg-tab]");
  if (cfgTab) {
    settingsTab = showControlsTab(document.getElementById("cfg"), cfgTab.dataset.cfgTab);
    return;
  }
  const tb = e.target.closest("[data-tab]");
  if (tb) {
    toolId = null;
    tab = tb.dataset.tab;
    render();
    return;
  }
  const tool = e.target.closest("[data-tool]");
  if (tool && tab === "tools") {
    toolId = tool.dataset.tool;
    render();
    return;
  }
  const act = e.target.closest("[data-action]");
  if (!act) return;

  switch (act.dataset.action) {
    case "retry":
      serverErr = null;
      render();
      loadServerConfig();
      break;
    case "permanent":
      // The whole point of the slice: no textarea, no paste. On success it
      // re-fetches AND renders — the server's `item.default` moved, so every
      // dot on a knob just made permanent should now be out, and `serverCfg`
      // is read at render time. (The Export handler next door deliberately does
      // NOT render; copying it here would leave a stale strip.)
      remote.makePermanent().then((r) => {
        if (!r.ok) {
          // A server with no checkout is not a broken server. Say which it is.
          msg(r.canPersist === false ? `Cannot make anything permanent here. ${r.reason}` : r.reason, false);
          return;
        }
        if (!r.written.length) {
          msg("Nothing to write — the server is already running its defaults.");
          return;
        }
        return remote.load().then((payload) => {
          serverCfg = payload;
          render();
          const names = r.written.map((w) => w.key).join(", ");
          msg(`Wrote ${r.written.length} default(s) into ${r.path}: ${names}. Commit it to keep them.`);
        });
      }).catch((e) => msg(String(e && e.message), false));
      break;
    case "reset":
      // Disabled in server mode, and refused here too rather than only in the
      // markup: `resetConfig` writes the browser's store and its `writeStore({})`
      // is a no-op in node, so over a wire it would refresh these sliders and
      // look like it had worked while the server kept every value.
      if (remote) {
        msg("Reset only writes to this browser — it cannot reset a server.", false);
        break;
      }
      resetConfig();
      render(); // settingsTab survives: render() reads it back out of module state
      msg("Reset all settings to defaults.");
      break;
    case "export":
      // THE VALUES ON SCREEN ARE THE SERVER'S, so the JSON must be too —
      // `exportConfig()` would print this browser's object on a page showing
      // another machine's numbers, silently. A fresh GET rather than the cached
      // payload, because a slider moved a moment ago and Export is the button
      // whose whole job is to be pasted into `config.js` defaults.
      if (remote) {
        remote.flush()
          .then(() => remote.load())
          .then((payload) => {
            serverCfg = payload;
            document.getElementById("io").value = JSON.stringify(payload.values, null, 2);
            msg(`Exported ${Object.keys(payload.values).length} server setting(s). ⤓ Make permanent writes them into config.js for you, where the server has a checkout.`);
          })
          .catch((e) => msg(String(e && e.message), false));
        break;
      }
      document.getElementById("io").value = exportConfig();
      msg("Exported current settings below. Copy into config.js to make permanent.");
      break;
    case "import": {
      if (remote) {
        // Parsed and filtered here, then posted key by key — the same write a
        // slider makes, which is why there is no second route. Anything the
        // server does not own is dropped SILENTLY: the JSON a person has is an
        // export of a whole config, and refusing it over one viewer knob would
        // make the round trip useless.
        remote.importAll(document.getElementById("io").value).then((res) => {
          if (!res.ok) return msg(res.reason, false);
          return remote.load().then((payload) => {
            serverCfg = payload;
            render();
            const parts = [`Imported ${res.applied} server setting(s)`];
            if (res.dropped) parts.push(`${res.dropped} not the server's, dropped`);
            if (res.failures.length) parts.push(`${res.failures.length} FAILED: ${res.failures[0]}`);
            msg(parts.join(" · "), res.failures.length === 0);
          });
        }).catch((e) => msg(String(e && e.message), false));
        break;
      }
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
