// ---------------------------------------------------------------------------
// ENEMY DESIGNER — author EnemySpec enemies: prompt an LLM or build by hand.
//
// TWO SCREENS (tech/enemy-designer.md, E7). The tool OPENS on the ENEMIES list
// — one flat table of every enemy this browser has, shipped and local alike,
// with an in-missions switch and Open / ⧉ / ✕ on every row, ＋New, and an
// Export / Import / Reset section. Open takes you to the WORKSPACE (everything
// below); `← Enemies` comes back. Both are mounted at once and toggled by a
// class on the root: the workspace owns a rAF loop, a focusable canvas and a
// whole conversation, none of which survives being rebuilt. The preview does
// not step while the list is showing.
//
// The working object is a sparse EnemySpec (tech/enemyspec.md).
// Three ways in: a starter template, the TREE + INSPECTOR rail (E2), or the JSON
// panel (still authoritative for everything). Every change re-validates; a valid spec re-instantiates the
// live preview, which runs the REAL runtime (instantiate/updateSpecEnemy —
// same code a mission host would run).
//
// The preview is a FIGHT (tech/enemy-designer.md, E1): the target is the
// mission's own Soldier driven by MissionInput — move, jump, crouch, aim, fire,
// reload — so a spec is judged by playing it rather than by reading it. Weapon
// and Aim pickers sit under the stage; ⛶ expands it to a 1:1 arena and ↻ puts
// both fighters back on their marks.
//
// KEYBOARD OWNERSHIP: MissionInput binds window keydown and preventDefaults
// every bound key (A/D/W/S/Space/J/R/…), and this page is full of text fields.
// So the soldier is driven ONLY while the canvas itself holds DOM focus — click
// the stage to take the keyboard, Esc or clicking any field to give it back.
// src/mission/input.js is unmodified; the tabindex and the focus/blur handlers
// below are the whole mechanism.
//
// THE RAIL (tech/enemy-designer.md, E2): the left column is the spec as a tree
// — the spec node, the entity tree under root, the defs, and the brain's states
// → tracks/actions → steps — with a property inspector for whatever is selected
// underneath it. Structure (add / duplicate / delete / reorder / promote to a
// def) lives in spec-tree.js, which has no DOM; the controls are generated from
// ENTITY_FIELDS in the schema, so a component field gains a control by being
// described there rather than by editing this file. Validation errors count
// themselves onto the node they name — the validator's paths ARE tree paths.
// Brain editing is structural only: a step picks its action kind and keeps its
// arguments as raw JSON (approximation 8).
//
// THE CONVERSATION (tech/enemy-designer.md, E3): the right column is one
// transcript. The first message with no enemy in hand generates; every message
// after it revises; a message that only asks a question is answered and the
// enemy is untouched. There is no accept/discard — a turn either LANDS (the
// spec swaps, a checkpoint is pushed, the diff marks the tree nodes it moved,
// the preview re-instantiates) or it does not, and a failure stays in the
// transcript because it is the model's best context for the next turn.
// Rewinding to a checkpoint is the undo, and the only version UI. All of it
// goes through chatEnemySpec() — one prompt, one envelope, one acceptance gate
// — which needs the Player2 app running (Connect) + a game client id
// (config.player2GameClientId, Settings tab). Without it, manual authoring
// through the rail and the JSON panel is fully functional.
//
// Save: gated on accept() (validate → normalize → dry-run) into THE enemy list
// (src/game/enemyspecs.js + enemystore.js). It writes an edit if the file ships
// that id and an addition if it does not, and it leaves a new enemy OUT of
// missions — the list's in-missions switch is the mission gate, and it re-runs
// the pipeline for longer. Placement (the generator's hint) is the one control
// on the spec node that is not part of the spec: it rides beside it on the
// record, so it is tool state until Save.
//
// createEnemyDesigner(container, onBack) → { dispose() }
// ---------------------------------------------------------------------------

import {
  ROLES, ACTIONS, MOTIONS, ENTITY_FIELDS, motionFields,
  DEFAULT_LIMITS, LIMIT_CAPS, UTILITY_ACTION_KEYS,
} from "../../game/enemyspec/schema.js";
import {
  treeNodes, nodeAt, valueAt, setAt, availableAdds, errorCounts,
  addNode, duplicateNode, deleteNode, moveNode, promoteToDef,
} from "./spec-tree.js";

// The spec-level sound slots. Every one has an engine default, so this section
// is entirely optional — an enemy with no `sounds` block still sounds right.
const SOUND_ROWS = [
  { kind: "fire", label: "Shot", help: "Default for every emitter. A single emitter can still override it in the JSON below." },
  { kind: "hurt", label: "Hurt", help: "Damaged but not killed. Throttled hard — hits are frequent." },
  { kind: "death", label: "Destroyed", help: "The enemy (the root) dies." },
  { kind: "part", label: "Part destroyed", help: "A destructible child part breaks off." },
];
import { validateSpec } from "../../game/enemyspec/validate.js";
import { normalizeSpec } from "../../game/enemyspec/normalize.js";
import { TEMPLATES, TEMPLATE_BY_ID } from "../../game/enemyspec/templates.js";
import { chatEnemySpec, composeChat, accept } from "../../game/enemyspec/generate.js";
import { diffSpecs, summarize } from "../../game/enemyspec/specdiff.js";
import { listCustomWeapons } from "../../game/customcontent.js";
import {
  enemyList, enemyEntries, enemyRecord, saveEnemyToList, deleteEnemy, revertEnemy,
  setEnemyEnabled, applyEnemyRoster, resetEnemyList, seedBehavior,
  PLACEMENTS, MISSION_DRYRUN_SECONDS,
} from "../../game/enemyspecs.js";
import { resolveId } from "./weapon-designer.js";
import { ARSENAL } from "../../game/arsenal.js";
import { Soldier, stepActor, startReload, tickReload } from "../../mission/entities.js";
import { fire, aimAccuracy } from "../../mission/ai.js";
import { MissionInput } from "../../mission/input.js";
import { instantiate, updateSpecEnemy, applyDamage, collidables } from "../../mission/enemyspec/runtime.js";
import { drawSpecEnemy } from "../../mission/enemyspec/render.js";
import { cuePickerRowHTML, auditionCue, fmtGain } from "../sound-picker.js";
import { audio } from "../../audio/engine.js";
import { specSound, emitterSound, SPEC_SOUND_KINDS } from "../../audio/cues.js";
import { updateProjectiles, updateStatuses } from "../../mission/combat.js";
import { drawProjectile } from "../../mission/render.js";
import { Player2Client } from "../../player2/client.js";
import { config } from "../../game/config.js";

export function createEnemyDesigner(container, onBack) {
  // ---- working state ------------------------------------------------------
  let spec = clone(TEMPLATE_BY_ID.tpl_charger); // the sparse spec being edited
  let validation = { ok: true, errors: [] };
  let normalized = null;
  let dryReport = null;
  let dryTimer = null;
  let jsonTimer = null;
  let p2 = null; // Player2Client once connected
  let generating = false;
  let selected = ""; // the selected tree node's path ("" = the spec node)
  // Pinned once a SAVED entry is loaded, so re-saving overwrites it instead of
  // re-slugging the name into a duplicate. A template or a chat landing leaves
  // it null, where the id follows the name (weapon-designer.js resolveId).
  let loadedId = null;
  // The record's placement hint. NOT part of the spec — it rides beside it
  // (tech/enemy-designer.md, E6), so it is tool state until Save.
  let behavior = seedBehavior(spec.role);

  // ---- the two screens (E7) -----------------------------------------------
  // The tool opens on the LIST and the workspace is what you open from it.
  // Both are mounted at once and toggled by a class: the workspace owns a rAF
  // loop, a focusable canvas and a whole conversation, none of which survives
  // being torn down and rebuilt.
  let screen = "list";
  let listFilter = "";
  let listTab = "all";   // all | missions | changed
  let newOpen = false;

  // ---- the conversation ---------------------------------------------------
  // The transcript is the tool's history AND the model's context: `turns` is
  // prose only (approximation 2 — superseded specs are never re-sent), while
  // `checkpoints` holds one whole spec per landing. Rewinding to a checkpoint
  // is the undo; there is no other version UI.
  let turns = [];         // { role: "you"|"model"|"sys", text, kind?, version?, what? }
  let checkpoints = [];   // { version, spec, label }
  let version = 0;
  let touched = [];       // paths the LAST landed turn changed — the tree marks

  // ---- the fight ----------------------------------------------------------
  const customWeapons = listCustomWeapons();
  const weaponById = {};
  for (const w of [...ARSENAL, ...customWeapons]) weaponById[w.id] = w;
  const play = { weapon: weaponById.carbine || ARSENAL[0], aim: 8, expanded: false };
  const input = new MissionInput();
  let focused = false; // does the stage own the keyboard?

  // Tier-grouped, exactly as the Firing Room lists them.
  function weaponOptionsHTML() {
    const opt = (w) => `<option value="${w.id}"${w.id === play.weapon.id ? " selected" : ""}>${escapeHtml(w.name)}</option>`;
    const tier = (n) => `<optgroup label="Tier ${["I", "II", "III"][n - 1]}">${ARSENAL.filter((w) => w.tier === n).map(opt).join("")}</optgroup>`;
    return tier(1) + tier(2) + tier(3) +
      (customWeapons.length ? `<optgroup label="Custom">${customWeapons.map(opt).join("")}</optgroup>` : "");
  }

  container.innerHTML = `
    <div class="wd es-wide es-on-list" id="es-root">

      <div class="es-list">
        <div class="wd-head">
          <button class="btn btn-ghost" data-es="back">← Tools</button>
          <span class="wd-name es-listtitle">Enemies</span>
          <span class="wd-id" id="es-listcount"></span>
          <span class="es-headgap"></span>
          <button class="btn" data-es="new">＋ New</button>
        </div>

        <div class="es-listgrid" id="es-listgrid">
          <div class="es-browse">
            <div class="es-filterbar">
              <input class="wd-name es-filter" data-es="filter" placeholder="filter…" spellcheck="false" />
              <button class="btn btn-alt es-sm es-tab on" data-es="tab" data-tab="all">All</button>
              <button class="btn btn-alt es-sm es-tab" data-es="tab" data-tab="missions">In missions</button>
              <button class="btn btn-alt es-sm es-tab" data-es="tab" data-tab="changed">Changed</button>
            </div>
            <div class="es-bhead">
              <span>Enemy</span><span>Role · threat</span><span>Placement</span><span>In missions</span><span></span>
            </div>
            <div id="es-rows"></div>
          </div>

          <div class="wd-saved es-newpanel" id="es-newpanel">
            <h3 class="wd-h">＋ New enemy</h3>
            <div class="es-newmenu">
              <button type="button" data-es="new-blank">Blank<small>A minimal enemy you build up yourself.</small></button>
              <div class="es-newtpl">
                <label class="lg-field">From a template
                  <select data-es="new-tplsel">${TEMPLATES.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("")}</select>
                </label>
                <button class="btn btn-alt es-sm" data-es="new-tpl">Create</button>
              </div>
              <button type="button" data-es="new-describe">Describe it…<small>Opens the workspace with the conversation ready.</small></button>
            </div>
            <p class="wd-saved-note">Duplicating an enemy is <b>⧉</b> on its row. A new enemy arrives OUT of missions — the switch is the mission gate, and it re-runs the pipeline for ${MISSION_DRYRUN_SECONDS} seconds.</p>
          </div>
        </div>

        <section class="ed-io es-io">
          <div class="ed-io-btns">
            <button class="btn" data-es="io-reset">Reset my changes</button>
            <button class="btn" data-es="io-export">Export JSON ▾</button>
            <button class="btn" data-es="io-import">▴ Import JSON</button>
            <span class="ed-msg" id="es-iomsg"></span>
          </div>
          <textarea id="es-io" class="ed-json" spellcheck="false"
            placeholder="Export writes the whole list here — paste it into src/game/enemyspecs.js to make it permanent. Paste enemy JSON and hit Import to add it to this browser."></textarea>
        </section>
      </div>

      <div class="es-work">
      <div class="wd-head">
        <button class="btn btn-ghost" data-es="tolist">← Enemies</button>
        <input class="wd-name" data-es="name" value="${escapeHtml(spec.name)}" spellcheck="false" />
        <span class="wd-id" id="es-id"></span>
      </div>

      <div class="wd-grid">
        <div class="wd-form" id="es-form">
          <h3 class="wd-h">Enemy tree</h3>
          <div class="es-treebar">
            <select data-es="addkind" id="es-addkind"></select>
            <button class="btn btn-alt es-sm" data-es="add" title="Add to the selected node">+ Add</button>
            <span class="es-treebar-gap"></span>
            <button class="btn btn-ghost es-sm" data-es="dup" title="Duplicate">⧉</button>
            <button class="btn btn-ghost es-sm" data-es="up" title="Move up">↑</button>
            <button class="btn btn-ghost es-sm" data-es="down" title="Move down">↓</button>
            <button class="btn btn-ghost es-sm" data-es="todef" title="Promote this part to a reusable def">↥ def</button>
            <button class="btn btn-ghost es-sm es-del" data-es="del" title="Delete">✕</button>
          </div>
          <div class="es-tree" id="es-tree"></div>
          <span class="ed-msg" id="es-treemsg"></span>

          <h3 class="wd-h" id="es-insph">Inspector</h3>
          <div class="es-insp" id="es-insp"></div>

          <h3 class="wd-h">Full spec (authoritative)</h3>
          <p class="wd-saved-note">Everything the tree and inspector reach, and everything they do not — transitions, expressions, step arguments. Edits apply once they parse; errors list below.</p>
          <textarea id="es-json" class="ed-json wd-json es-json" spellcheck="false"></textarea>
          <ul class="es-errors" id="es-errors"></ul>
        </div>

        <div class="wd-side">
          <div class="es-stage" id="es-stage">
            <canvas class="wd-canvas es-canvas" id="es-canvas" width="480" height="270" tabindex="0"></canvas>
            <div class="es-stagectl">
              <button class="btn btn-ghost es-sm" data-es="expand" id="es-expand" title="Expand to a 1:1 arena">⛶</button>
              <button class="btn btn-ghost es-sm" data-es="reset" title="Both fighters back on their marks">↻</button>
            </div>
            <div class="es-keys" id="es-keys"></div>
          </div>
          <div class="es-playbar">
            <label class="lg-field">Weapon
              <select data-es="weapon">${weaponOptionsHTML()}</select>
            </label>
            <label class="lg-field">Aim <output id="es-aimval">${play.aim}</output>
              <input type="range" data-es="aim" min="1" max="10" step="1" value="${play.aim}" />
            </label>
          </div>
          <div class="wd-readout es-readout">
            <div class="wd-stat"><span>State</span><b id="es-state">—</b></div>
            <div class="wd-stat"><span>Enemy</span><b id="es-hp">—</b></div>
            <div class="wd-stat"><span>Parts</span><b id="es-parts">—</b></div>
            <div class="wd-stat"><span>You</span><b id="es-you">—</b></div>
            <div class="wd-stat"><span>Ammo</span><b id="es-ammo">—</b></div>
          </div>
          <div class="wd-verdict" id="es-verdict"></div>
          <div class="wd-export">
            <div class="wd-export-btns">
              <button class="btn" data-es="save">Save</button>
              <button class="btn btn-alt" data-es="copy">Copy JSON</button>
            </div>
            <span class="ed-msg" id="es-msg"></span>
          </div>
        </div>

        <div class="es-chat" id="es-chat">
          <h3 class="wd-h">Conversation <span class="es-ver" id="es-ver">v0</span></h3>
          <div class="es-stream" id="es-stream"></div>
          <div class="es-composer">
            <textarea id="es-say" class="es-prompt" rows="2" spellcheck="false"
              placeholder="Describe an enemy, ask why it does that, or say what to change…  ⏎ send · ⇧⏎ newline"></textarea>
            <div class="es-createbtns">
              <button class="btn" data-es="send" id="es-send" disabled title="Connect to Player2 first">✦ Send</button>
              <button class="btn btn-alt" data-es="connect" id="es-connect">Connect</button>
              <label class="lg-field es-tpl">Template
                <select data-es="template">
                  <option value="">— load —</option>
                  ${TEMPLATES.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("")}
                </select>
              </label>
            </div>
            <div class="es-createbtns">
              <span class="ed-msg" id="es-p2status"></span>
              <span class="es-tok" id="es-tok"></span>
            </div>
          </div>
        </div>
      </div>
      </div>

    </div>`;

  const $ = (sel) => container.querySelector(sel);
  const canvas = $("#es-canvas");
  const ctx = canvas.getContext("2d");
  const stage = $("#es-stage"); // carries the focus ring
  const shell = container.querySelector(".wd"); // carries the expanded layout

  // ---- preview arena ------------------------------------------------------
  // ONE fixed world — the mission's own 960×540 — drawn at 0.5× in the rail and
  // 1:1 when expanded, so expanding changes the view and never the fight.
  const WORLD_W = 960, WORLD_H = 540;
  const GROUND_Y = WORLD_H - 60;
  const SPAWN_X = 60;   // the player's start mark
  const ENEMY_X = 640;  // the enemy's, far enough away to watch it approach
  let scale = 0.5;
  const preview = { root: null, respawn: 0 };

  const world = { width: WORLD_W, height: WORLD_H, gravity: 2000 };

  // The player body is the mission's Soldier, not a stand-in: same physics,
  // same crouch box, same magazine, so what the enemy does to you here is what
  // it does to a squad in a level.
  const shooter = new Soldier(
    { id: "you", name: "Test Pilot", callsign: "TST", stats: { health: 8, aim: play.aim, speed: 6 } },
    play.weapon, SPAWN_X, GROUND_Y - 46
  );
  shooter.magsLeft = Infinity; // an authoring sandbox never runs out of spares
  shooter.deadFor = 0;

  const scene = {
    // Same hook the mission and Firing Room install (tech/sound.md), so the
    // preview plays the enemy's authored voice as it moves and fires.
    sound: (cue, opts) => audio.play(cue, opts),
    world,
    platforms: [
      { x: 0, y: GROUND_Y, w: WORLD_W, h: 60 },
      { x: WORLD_W - 6, y: 0, w: 8, h: GROUND_Y },     // back wall — something to be cornered against
      { x: 300, y: GROUND_Y - 120, w: 150, h: 16 },    // perches: LOS, elevation, a ledge to be chased onto
      { x: 560, y: GROUND_Y - 190, w: 150, h: 16 },
    ],
    soldiers: [shooter],
    enemies: [],
    projectiles: [],
  };

  const previewCtx = {
    friendlyFire: false,
    damageMult: 1,
    damage(t, amount, owner) {
      if (t.kind === "spec") {
        if (preview.root) applyDamage(preview.root, t, amount, owner, scene, previewCtx);
        return;
      }
      // The player. A fight you can lose — but an authoring tool, so losing
      // costs a respawn, not a soldier.
      t.health -= amount;
      t.hitFlash = 0.12;
      if (t.health <= 0 && t.alive) previewCtx.kill(t, owner);
    },
    kill(t, owner) {
      if (t.kind === "spec") {
        if (preview.root) applyDamage(preview.root, t, 1e9, owner, scene, previewCtx);
        return;
      }
      if (!t.alive) return;
      t.alive = false;
      t.deadFor = 0;
    },
    spark() {},
    burst() {},
  };

  // Re-instantiate the ENEMY only: every spec edit lands here, and a keystroke
  // in the JSON panel must not teleport the player mid-fight.
  function resetPreview() {
    scene.projectiles = [];
    preview.respawn = 0;
    if (!validation.ok || !normalized) {
      preview.root = null;
      scene.enemies = [];
      return;
    }
    const h = normalized.root.body.h;
    const flying = normalized.root.body.gravity === 0;
    preview.root = instantiate(normalized, ENEMY_X, flying ? GROUND_Y - h - 140 : GROUND_Y - h);
    scene.enemies = collidables(preview.root);
  }

  function respawnShooter() {
    shooter.setCrouch(false);
    shooter.alive = true;
    shooter.health = shooter.maxHealth;
    shooter.x = SPAWN_X;
    shooter.y = GROUND_Y - shooter.h;
    shooter.vx = 0;
    shooter.vy = 0;
    shooter.burn = null;
    shooter.slow = null;
    shooter.hitFlash = 0;
    shooter.reloading = 0;
    shooter.deadFor = 0;
    shooter.ammo = shooter.weapon && shooter.weapon.magazine ? shooter.weapon.magazine : Infinity;
    shooter.magsLeft = Infinity;
  }

  // ↻ — both fighters back on their marks.
  function resetFight() {
    resetPreview();
    respawnShooter();
  }

  function setWeapon(id) {
    play.weapon = weaponById[id] || play.weapon;
    shooter.weapon = play.weapon;
    shooter.ammo = play.weapon.magazine ? play.weapon.magazine : Infinity;
    shooter.reloading = 0;
  }

  // ---- keyboard ownership -------------------------------------------------
  // The whole mechanism, and the reason input.js needs no change: the canvas is
  // tabbable, and it drives the soldier only while it holds DOM focus. Clicking
  // the name field, the JSON panel or (E3) the composer blurs it, which hands
  // the keys straight back.
  function takeKeys(on) {
    on = !!on;
    if (on !== focused) {
      focused = on;
      if (on) input.enable(canvas); // canvas → mouse aim + click to fire
      else input.disable();
      if (stage && stage.classList) stage.classList.toggle("focused", on);
      renderKeys();
    }
    return focused;
  }

  function renderKeys() {
    const el = $("#es-keys");
    if (!el) return;
    const aimHint = config.aimMode === "keyboard" ? "W aim up" : "MOUSE aim";
    el.textContent = focused
      ? `A / D move   ${aimHint}   S crouch   SPACE jump   J / CLICK fire   R reload   ·   ESC releases the keyboard`
      : "Click the preview to take the keyboard";
  }

  // ⛶ — same world, twice the pixels: 1:1 where the window is wide enough.
  function setExpanded(on) {
    play.expanded = !!on;
    scale = play.expanded ? 1 : 0.5;
    canvas.width = Math.round(WORLD_W * scale);
    canvas.height = Math.round(WORLD_H * scale);
    if (shell && shell.classList) shell.classList.toggle("es-expanded", play.expanded);
    const btn = $("#es-expand");
    if (btn) btn.title = play.expanded ? "Back to the rail" : "Expand to a 1:1 arena";
    draw();
  }

  // Resolve manual aim from config.aimMode (mouse/gamepad/auto); "keyboard"
  // keeps the legacy aim-up scheme. Identical to the Firing Room's — the point
  // is that the preview aims the way the game does.
  function resolveAim() {
    const mode = config.aimMode;
    if (mode === "keyboard") {
      shooter.aimVec = null;
      shooter.aimUp = input.isDown("aimUp") && !shooter.crouched;
      return;
    }
    shooter.aimUp = false;
    const src = input.aimSource(mode);
    if (!src) { shooter.aimVec = null; return; }
    let dx, dy;
    if (src.type === "stick") { dx = src.x; dy = src.y; }
    else { dx = src.x / scale - (shooter.x + shooter.w / 2); dy = src.y / scale - (shooter.y + shooter.h * 0.42); }
    const len = Math.hypot(dx, dy);
    if (len < 0.001) { shooter.aimVec = null; return; }
    shooter.aimVec = { x: dx / len, y: dy / len };
    shooter.facing = shooter.aimVec.x >= 0 ? 1 : -1;
  }

  // ---- validation / refresh pipeline -------------------------------------
  // The spec object is the single source: any change funnels through here.
  function refresh({ rebuildRail = false, rewriteJson = true } = {}) {
    spec.id = resolveId(spec.name, loadedId) || slug(spec.name, "custom_spec");
    validation = validateSpec(spec);
    normalized = validation.ok ? normalizeSpec(spec) : null;

    $("#es-id").textContent = spec.id;
    if (rebuildRail) renderRail();
    else renderTree(); // marks and labels follow every edit; the inspector keeps focus
    if (rewriteJson) {
      const ta = $("#es-json");
      if (ta) ta.value = JSON.stringify(spec, null, 2);
    }
    renderErrors();
    resetPreview();
    scheduleDryRun();
  }

  function renderErrors() {
    const list = $("#es-errors");
    if (!list) return;
    list.innerHTML = validation.ok
      ? `<li class="ok">✓ spec is valid</li>`
      : validation.errors.map((e) => `<li>${escapeHtml(e.path)} — ${escapeHtml(e.msg)}</li>`).join("");
  }

  function scheduleDryRun() {
    if (dryTimer) clearTimeout(dryTimer);
    dryReport = null;
    renderVerdict();
    if (!validation.ok || !normalized) return;
    dryTimer = setTimeout(async () => {
      const { dryRunSpec } = await import("../../game/enemyspec/dryrun.js");
      dryReport = dryRunSpec(normalized, { seconds: 4 });
      renderVerdict();
    }, 250);
  }

  function renderVerdict() {
    const el = $("#es-verdict");
    if (!el) return;
    if (!validation.ok) {
      el.className = "wd-verdict bad";
      el.textContent = `✗ ${validation.errors.length} validation error(s) — see the list under the JSON`;
    } else if (!dryReport) {
      el.className = "wd-verdict";
      el.textContent = "… dry-running";
    } else if (dryReport.ok) {
      const f = dryReport.facts;
      el.className = "wd-verdict ok";
      el.textContent = `✓ dry-run ok — ${[f.moved && "moves", f.attacked && "attacks", `${f.partsAtStart} part(s)`].filter(Boolean).join(", ")}`;
    } else {
      el.className = "wd-verdict bad";
      el.textContent = `✗ dry-run: ${dryReport.errors.join("; ")}`;
    }
  }

  // ---- the rail: tree + inspector ----------------------------------------
  // Everything structural is spec-tree.js; everything renderable is generated
  // from ENTITY_FIELDS. This file holds markup and events, nothing else.

  const KIND_GLYPH = {
    spec: "◆", entity: "▣", def: "⌗", defs: "▤", emitter: "➤",
    brain: "⚙", state: "◇", track: "≡", uaction: "⚖", step: "·",
  };

  // Spec-node rows. Not in ENTITY_FIELDS: these are one-per-enemy, not
  // per-entity, and the schema table is deliberately about components.
  const SPEC_IDENTITY = [
    { key: "role", label: "Role", type: "enum", options: ROLES, default: "skirmisher" },
    { key: "tier", label: "Tier", type: "number", min: 1, max: 5, step: 1, default: 1 },
    { key: "threat", label: "Threat cost", type: "number", min: 10, max: 600, step: 10, default: 50,
      help: "What the generator pays to place it." },
    { key: "intelligence", label: "Intelligence", type: "number", min: 1, max: 5, step: 1, default: 2,
      help: "How smart the behaviour READS — not how hard it hits." },
  ];
  const SPEC_LIMITS = [
    { key: "limits.maxAlive", label: "Max alive", type: "number", min: 1, max: LIMIT_CAPS.maxAlive, step: 1, default: DEFAULT_LIMITS.maxAlive },
    { key: "limits.maxSpawnsPerSecond", label: "Spawns / sec", type: "number", min: 1, max: LIMIT_CAPS.maxSpawnsPerSecond, step: 1, default: DEFAULT_LIMITS.maxSpawnsPerSecond },
    { key: "limits.maxSpawnDepth", label: "Spawn depth", type: "number", min: 1, max: LIMIT_CAPS.maxSpawnDepth, step: 1, default: DEFAULT_LIMITS.maxSpawnDepth },
  ];
  // Entity components, in the order they read: identity, then shape, then what
  // it does. `required` = the root cannot be without it.
  const ENTITY_COMPONENTS = [
    { comp: "at", label: "at (offset from parent)", childOnly: true },
    { comp: "visual" }, { comp: "body" }, { comp: "health", requiredOnRoot: true },
    { comp: "motion" }, { comp: "contact" }, { comp: "life" }, { comp: "link", childOnly: true },
    { comp: "vars" }, { comp: "on" },
  ];
  const UACTION_FIELDS = [
    { key: "id", label: "Id", type: "text", default: "" },
    { key: "when", label: "When", type: "text", default: "", help: "Boolean expression gating the action. Empty = always eligible." },
    { key: "score", label: "Score", type: "text", default: "1", help: "Number or expression. Highest scorer wins the tick." },
    { key: "windup", label: "Windup", type: "number", min: 0, max: 5, step: 0.05, unit: "s", default: 0 },
    { key: "recovery", label: "Recovery", type: "number", min: 0, max: 5, step: 0.05, unit: "s", default: 0 },
    { key: "cooldown", label: "Cooldown", type: "number", min: 0, max: 30, step: 0.1, unit: "s", default: 0 },
  ];
  // A step's arguments stay raw JSON (tech/enemy-designer.md approximation 8):
  // per-argument metadata for all 18 actions is a bigger table than the chat is
  // worth waiting for. These are only what a NEW step of each kind starts as.
  const STEP_DEFAULTS = {
    wait: 1, telegraph: { time: 0.5 }, moveTo: { target: "player", speed: 160 },
    dash: { target: "player", speed: 420, duration: 0.35 }, jump: {},
    fire: { emitter: "gun", pattern: "aimed" }, spawn: { ref: "" },
    setMotion: { type: "chase", speed: 160 }, set: { target: "root.vars.rage", value: 1 },
    add: { target: "root.vars.rage", value: 1 }, mul: { target: "root.vars.rage", value: 2 },
    signal: "event", sound: { id: "enemy.telegraph" }, destroy: { target: "self" },
    detach: { target: "self" }, enable: { target: "" }, disable: { target: "" },
    if: { when: "self.hpPct < 0.5", then: [] },
  };

  function renderRail() {
    renderTree();
    renderInspector();
  }

  function renderTree() {
    const nodes = treeNodes(spec);
    if (!nodes.some((n) => n.path === selected)) selected = "";
    const counts = errorCounts(nodes, validation.errors);
    // The last landed turn's diff, rolled onto nodes the same way errors are —
    // a change list and an error list are both just lists of tree paths, so
    // "what did that turn touch?" is answered without reading JSON.
    const marks = errorCounts(nodes, touched);
    const el = $("#es-tree");
    if (el) {
      el.innerHTML = nodes.map((n) => `
        <div class="es-node${n.path === selected ? " sel" : ""}" data-esnode="${escapeHtml(n.path)}" style="padding-left:${6 + n.depth * 14}px">
          <span class="es-glyph es-k-${n.kind}">${KIND_GLYPH[n.kind] || "•"}</span>
          <span class="es-nlabel">${escapeHtml(n.label)}</span>
          ${n.note ? `<span class="es-note">${escapeHtml(n.note)}</span>` : ""}
          ${marks[n.path] ? `<span class="es-nmark" title="${marks[n.path]} change(s) from the last landed turn">●</span>` : ""}
          ${counts[n.path] ? `<span class="es-nbad" title="${counts[n.path]} validation error(s) here or below">${counts[n.path]}</span>` : ""}
        </div>`).join("");
    }
    const add = $("#es-addkind");
    if (add) {
      const opts = availableAdds(spec, selected);
      add.innerHTML = opts.length
        ? opts.map((o) => `<option value="${o.kind}">${escapeHtml(o.label)}</option>`).join("")
        : `<option value="">— nothing to add here —</option>`;
    }
  }

  function renderInspector() {
    const node = nodeAt(spec, selected) || { kind: "spec", path: "", label: spec.name || spec.id };
    const h = $("#es-insph");
    if (h) h.textContent = `Inspector — ${node.kind} · ${node.label}`;
    const el = $("#es-insp");
    if (el) el.innerHTML = inspectorHTML(node);
  }

  function inspectorHTML(node) {
    switch (node.kind) {
      case "spec": return specInspector();
      case "entity": case "def": return entityInspector(node);
      case "emitter": return emitterInspector(node.path);
      case "brain": return brainInspector();
      case "state": return stateInspector(node.path);
      case "track": return rows(node.path, [
        { key: "id", label: "Id", type: "text", default: "" },
        { key: "loop", label: "Loop", type: "bool", default: true, help: "A looping track needs one blocking step (wait / telegraph / moveTo / dash)." },
      ]);
      case "uaction": return rows(node.path, UACTION_FIELDS);
      case "step": return stepInspector(node.path);
      case "defs": return `<p class="wd-saved-note">Reusable entities. An emitter's <code>ref</code> and the <code>spawn</code> action fire these — projectiles, seekers, summons. Add one here, or promote a part with <b>↥ def</b>.</p>`;
      default: return "";
    }
  }

  function specInspector() {
    return `
      <h4 class="es-h4">Identity</h4>
      ${rows("", SPEC_IDENTITY)}
      ${placementRow()}
      <h4 class="es-h4">Sound</h4>
      <p class="wd-saved-note">Every slot has an engine default, so <strong>Auto</strong> is fine — this is for giving one enemy its own voice. <code>fire</code> is the default for every emitter; an emitter overrides it on its own node. For a specific moment (a telegraph, a phase change) use a <code>sound</code> step.</p>
      ${SOUND_ROWS.map((r) => cuePickerRowHTML({
        ...r,
        value: slotCue(r.kind),
        gain: specSound(spec, r.kind).gain,
        resolved: specSound({}, r.kind).cue,
      })).join("")}
      <h4 class="es-h4">Limits</h4>
      <p class="wd-saved-note">Engine-enforced, and clamped at runtime whatever is written here.</p>
      ${rows("", SPEC_LIMITS)}`;
  }

  // Placement is the ONE field on this node that is not part of the spec — it
  // rides beside it on the record (tech/enemy-designer.md, E6), so it writes to
  // tool state and lands with Save rather than through setAt().
  function placementRow() {
    const help = "Where the generator prefers to put it — <b>shooter</b>/<b>turret</b> want a perch, <b>charger</b> wants the ground. Not part of the enemy's JSON.";
    return `<div class="cfg-row wd-row">
      <div class="cfg-meta"><span class="cfg-label">Placement</span><span class="cfg-help">${help}</span></div>
      <div class="cfg-control"><select data-esplace>${PLACEMENTS.map((b) => `<option value="${b}"${b === behavior ? " selected" : ""}>${b}</option>`).join("")}</select></div>
    </div>`;
  }

  function entityInspector(node) {
    const isRoot = node.path === "root";
    const isDef = node.kind === "def";
    const out = [`<h4 class="es-h4">Identity</h4>`];
    if (isDef) out.push(`<p class="wd-saved-note">A def is a template, positioned by whatever fires or spawns it — its key in <code>defs</code> is its id.</p>`);
    else out.push(rows(node.path, ENTITY_FIELDS.id.map((f) => ({ ...f, key: "id" }))));
    out.push(rows(node.path, ENTITY_FIELDS.tags.map((f) => ({ ...f, key: "tags" }))));
    out.push(`<h4 class="es-h4">Components</h4>`);
    for (const c of ENTITY_COMPONENTS) {
      if (c.childOnly && (isRoot || isDef)) continue;
      out.push(componentCard(node.path, c.comp, { required: isRoot && c.requiredOnRoot, label: c.label }));
    }
    return out.join("");
  }

  // A component is present or it is not — that is the whole of sparse
  // authoring, so the switch IS the edit: on writes the defaults, off deletes
  // the key. Nothing is written for a component you never touch.
  function componentCard(nodePath, comp, { required = false, label = null } = {}) {
    const path = join(nodePath, comp);
    const on = valueAt(spec, path) !== undefined;
    const fields = comp === "motion"
      ? motionFields((valueAt(spec, `${path}.type`)) || "static")
      : ENTITY_FIELDS[comp] || [];
    return `
      <div class="es-comp${on ? "" : " off"}">
        <header>
          <button type="button" role="switch" class="toggle${on ? " on" : ""}" data-esc="${escapeHtml(nodePath)}|${comp}"${required ? " disabled title='the root must be killable'" : ""}><span class="knob"></span></button>
          <b>${escapeHtml(label || comp)}</b>
        </header>
        ${on ? `<div class="es-compbody">${fields.map((f) => fieldRow(join(path, f.key), f)).join("")}</div>` : ""}
      </div>`;
  }

  function emitterInspector(path) {
    const em = valueAt(spec, path) || {};
    const byRef = !!em.ref;
    const fields = ENTITY_FIELDS.emitters.filter((f) => (byRef ? !f.key.startsWith("projectile.") : f.key !== "ref"));
    const slot = em.sound;
    const assigned = typeof slot === "string" ? slot : (slot && slot.cue) || "";
    const gain = emitterSound(spec, em).gain;
    return `
      ${byRef ? `<p class="wd-saved-note">Fires the <code>${escapeHtml(em.ref)}</code> def as a whole entity, so the projectile fields do not apply — clear <b>Fires def</b> to go back to a plain projectile.</p>` : ""}
      ${rows(path, fields)}
      <h4 class="es-h4">Sound</h4>
      ${cuePickerRowHTML({
        kind: "emitter", label: "Shot",
        help: "This emitter's own voice. Auto uses the enemy's <code>fire</code> slot.",
        value: assigned, gain, resolved: emitterSound(spec, {}).cue,
      })}`;
  }

  function brainInspector() {
    if (!spec.brain) {
      return `<p class="wd-saved-note">No brain: the enemy moves by its <code>motion</code> component and does nothing else. Add a state to give it one.</p>`;
    }
    const states = Object.keys(spec.brain.states || {});
    return rows("brain", [
      { key: "mode", label: "Mode", type: "enum", options: ["tracks", "utility"], default: "tracks",
        help: "tracks = scripted loops. utility = scored actions, re-picked every decision tick." },
      { key: "start", label: "Start state", type: "enum", options: states.length ? states : [""], default: states[0] || "" },
    ]);
  }

  function stateInspector(path) {
    const utility = (spec.brain && spec.brain.mode) === "utility";
    return `
      <p class="wd-saved-note">Tracks, utility actions and their steps are tree nodes — add and reorder them there. Transitions and <code>enter</code> stay JSON: they are expressions, not controls.</p>
      ${utility ? rows(path, [{ key: "decisionInterval", label: "Decision interval", type: "number", min: 0.1, max: 2, step: 0.05, unit: "s", default: 0.3 }]) : ""}
      ${rows(path, [
        { key: "enter", label: "Enter steps", type: "json", default: [], help: "Instant actions run once on entering this state." },
        { key: "transitions", label: "Transitions", type: "json", default: [], help: `[{ when: "expr" | event: "signal", to: "stateId" }]` },
      ])}`;
  }

  function stepInspector(path) {
    const step = valueAt(spec, path) || {};
    const kind = Object.keys(step).filter((k) => k !== "id")[0] || "wait";
    return `
      ${fieldRow(`${path}.__kind`, { key: "__kind", label: "Action", type: "enum", options: Object.keys(ACTIONS), default: kind, help: ACTIONS[kind] && ACTIONS[kind].blocking ? "Blocking — it occupies the track for a duration." : "Instant — completes in the same tick." }, kind)}
      ${fieldRow(`${path}.${kind}`, { key: kind, label: "Arguments", type: "json", default: STEP_DEFAULTS[kind] ?? {}, help: "Raw JSON, on purpose — see approximation 8 in the spec." })}`;
  }

  // ---- generated controls -------------------------------------------------

  function rows(base, fields) {
    return fields.map((f) => fieldRow(join(base, f.key), f)).join("");
  }

  function join(...parts) {
    return parts.filter((p) => p !== "" && p !== undefined && p !== null).join(".");
  }

  function fieldRow(path, f, override) {
    const raw = override !== undefined ? override : valueAt(spec, path);
    const cur = raw === undefined ? f.default : raw;
    const id = escapeHtml(path);
    const meta = `<div class="cfg-meta"><span class="cfg-label">${escapeHtml(f.label)}</span>${f.help ? `<span class="cfg-help">${f.help}</span>` : ""}</div>`;
    let ctl;
    switch (f.type) {
      case "number": {
        const n = Number.isFinite(+cur) ? +cur : f.default;
        ctl = `<input type="range" data-esp="${id}" data-est="number" min="${f.min}" max="${f.max}" step="${f.step}" value="${n}" />
               <output class="cfg-val" data-val-for="${id}">${n}${f.unit ? " " + f.unit : ""}</output>`;
        break;
      }
      case "enum":
        ctl = `<select data-esp="${id}" data-est="text">${(f.options || []).map((o) => `<option value="${escapeHtml(o)}"${o === cur ? " selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select>`;
        break;
      case "color":
        ctl = `<input type="color" data-esp="${id}" data-est="text" value="${escapeHtml(cur || "#cccccc")}" />`;
        break;
      case "bool":
        ctl = `<button type="button" role="switch" class="toggle${cur ? " on" : ""}" data-esp="${id}" data-est="bool"><span class="knob"></span></button>`;
        break;
      case "tags":
        ctl = `<input type="text" class="es-text" data-esp="${id}" data-est="tags" value="${escapeHtml((cur || []).join(", "))}" placeholder="enemy, wing" />`;
        break;
      case "json":
        ctl = `<textarea class="ed-json es-mini" data-esp="${id}" data-est="json" rows="4" spellcheck="false">${escapeHtml(JSON.stringify(cur, null, 1))}</textarea>`;
        break;
      default:
        ctl = `<input type="text" class="es-text" data-esp="${id}" data-est="text" value="${escapeHtml(cur === undefined || cur === null ? "" : cur)}" />`;
    }
    return `<div class="cfg-row wd-row">${meta}<div class="cfg-control">${ctl}</div></div>`;
  }

  // One writer for every generated control. `type` decides the conversion, and
  // an empty text / json field DELETES the key so authoring stays sparse.
  function writeField(path, type, raw) {
    if (path.endsWith(".__kind")) return setStepKind(path.slice(0, -".__kind".length), raw);
    let value;
    switch (type) {
      case "number": value = Number(raw); if (!Number.isFinite(value)) return false; break;
      case "bool": value = !!raw; break;
      case "tags": {
        const list = String(raw).split(",").map((t) => t.trim()).filter(Boolean);
        value = list.length ? list : undefined;
        break;
      }
      case "json": {
        const text = String(raw).trim();
        if (!text) { value = undefined; break; }
        try { value = JSON.parse(text); } catch { return false; }
        break;
      }
      default: {
        const text = String(raw);
        value = text === "" ? undefined : text;
      }
    }
    setAt(spec, path, value);
    return true;
  }

  // Swapping a step's action kind rewrites the step, because a step is exactly
  // one action key. The old arguments cannot survive the swap.
  function setStepKind(path, kind) {
    if (!ACTIONS[kind]) return false;
    const step = valueAt(spec, path) || {};
    const next = { [kind]: clone(STEP_DEFAULTS[kind] ?? {}) };
    if (step.id) next.id = step.id;
    setAt(spec, path, next);
    return true;
  }

  // Component on/off: on writes the defaults ENTITY_FIELDS declares, off
  // removes the key entirely.
  function setComponent(nodePath, comp, on) {
    const path = join(nodePath, comp);
    if (!on) { setAt(spec, path, undefined); return; }
    setAt(spec, path, componentDefault(comp));
  }

  function componentDefault(comp) {
    if (comp === "at") return [0, -20];
    if (comp === "tags") return [];
    if (comp === "vars" || comp === "on") return {};
    if (comp === "motion") return { type: "chase", ...MOTIONS.chase.params };
    const out = {};
    for (const f of ENTITY_FIELDS[comp] || []) {
      if (!f.key || f.default === "" || f.default === undefined) continue;
      setAt(out, f.key, f.default);
    }
    return out;
  }

  // ---- tree operations ----------------------------------------------------

  function treeOp(op, arg) {
    const res =
      op === "add" ? addNode(spec, selected, arg)
      : op === "dup" ? duplicateNode(spec, selected)
      : op === "del" ? deleteNode(spec, selected)
      : op === "up" ? moveNode(spec, selected, -1)
      : op === "down" ? moveNode(spec, selected, 1)
      : op === "todef" ? promoteToDef(spec, selected)
      : { ok: false, error: `unknown op '${op}'` };
    const msg = $("#es-treemsg");
    if (msg) {
      msg.textContent = res.ok ? "" : res.error;
      msg.className = "ed-msg" + (res.ok ? "" : " bad");
    }
    if (res.ok) {
      selected = res.path;
      refresh({ rebuildRail: true });
    }
    return res;
  }

  function selectNode(path) {
    selected = path;
    renderRail();
  }

  // The explicitly ASSIGNED cue ("" = Auto), which is what the select shows.
  function slotCue(kind) {
    const slot = spec.sounds && spec.sounds[kind];
    if (typeof slot === "string") return slot;
    return (slot && slot.cue) || "";
  }

  // Stored sparsely so an untouched enemy exports no `sounds` block, and a
  // cue-only choice stays a plain string.
  function writeSlot(kind, cue, gain) {
    if (kind === "emitter") return writeEmitterSound(cue, gain);
    if (!SPEC_SOUND_KINDS.includes(kind)) return;
    const sounds = spec.sounds || (spec.sounds = {});
    if (gain === 1) {
      if (cue) sounds[kind] = cue;
      else delete sounds[kind];
    } else {
      sounds[kind] = cue ? { cue, gain } : { gain };
    }
    if (!Object.keys(sounds).length) delete spec.sounds;
  }

  // The selected emitter's own slot — same sparse shape, one level down.
  function writeEmitterSound(cue, gain) {
    const em = valueAt(spec, selected);
    if (!em) return;
    if (gain === 1) {
      if (cue) em.sound = cue;
      else delete em.sound;
    } else {
      em.sound = cue ? { cue, gain } : { gain };
    }
  }

  // The gain currently shown by whichever sound row this kind belongs to.
  function slotGain(kind) {
    if (kind === "emitter") return emitterSound(spec, valueAt(spec, selected) || {}).gain;
    return specSound(spec, kind).gain;
  }

  function currentCue(kind) {
    if (kind !== "emitter") return slotCue(kind);
    const em = valueAt(spec, selected) || {};
    return typeof em.sound === "string" ? em.sound : (em.sound && em.sound.cue) || "";
  }

  // ---- the Enemies screen (E7) --------------------------------------------
  // ONE flat table. `origin` is how an entry got here, not a category it
  // belongs to: every row takes the same verbs.
  const ORIGIN_PILL = {
    edited: `<span class="es-pill es-pill-edit">edited</span>`,
    added: `<span class="es-pill es-pill-new">new</span>`,
  };

  function showScreen(next) {
    screen = next === "work" ? "work" : "list";
    const root = $("#es-root");
    if (root) root.className = `wd es-wide es-on-${screen}`;
    if (screen === "list") {
      blurStage();          // the list is all text fields — never hold the keys here
      renderList();
    } else {
      refresh({ rebuildRail: true });
    }
    return screen;
  }

  function visibleRows() {
    const q = listFilter.trim().toLowerCase();
    return enemyEntries().filter((e) => {
      if (listTab === "missions" && !e.inMissions) return false;
      if (listTab === "changed" && e.origin === "file") return false;
      if (!q) return true;
      return `${e.name} ${e.id} ${e.role} ${e.behavior}`.toLowerCase().includes(q);
    });
  }

  function renderList() {
    const rows = visibleRows();
    const all = enemyEntries();
    const count = $("#es-listcount");
    if (count) count.textContent = `${all.length} · ${all.filter((e) => e.inMissions).length} in missions`;

    const grid = $("#es-listgrid");
    if (grid) grid.className = "es-listgrid" + (newOpen ? " es-newon" : "");
    for (const b of container.querySelectorAll(".es-tab")) {
      b.className = "btn btn-alt es-sm es-tab" + (b.dataset.tab === listTab ? " on" : "");
    }

    const el = $("#es-rows");
    if (!el) return;
    el.innerHTML = rows.length ? rows.map((e) => `
      <div class="es-brow${e.inMissions ? "" : " off"}${e.id === loadedId ? " open" : ""}" data-id="${escapeHtml(e.id)}">
        <span class="es-bname"><b>${escapeHtml(e.name)}</b><span class="wd-id">${escapeHtml(e.id)}</span></span>
        <span class="es-bmeta">${escapeHtml(e.role)} · ${e.threat}</span>
        <span class="es-bmeta">${escapeHtml(e.behavior)}</span>
        <span class="es-bstate">
          <button type="button" role="switch" class="toggle${e.inMissions ? " on" : ""}" data-esrost="${escapeHtml(e.id)}" title="${e.inMissions ? "Placed in generated missions" : "Never placed"}"><span class="knob"></span></button>
          ${e.boss ? `<span class="es-pill">boss</span>` : ""}
          ${ORIGIN_PILL[e.origin] || ""}
          ${e.origin !== "file" ? `<button class="btn btn-ghost es-sm" data-es="revert-enemy" data-id="${escapeHtml(e.id)}" title="Drop my changes and take the shipped version">↺</button>` : ""}
        </span>
        <span class="es-bacts">
          <button class="btn es-sm" data-es="open-enemy" data-id="${escapeHtml(e.id)}">Open</button>
          <button class="btn btn-ghost es-sm" data-es="dup-enemy" data-id="${escapeHtml(e.id)}" title="Duplicate">⧉</button>
          <button class="btn btn-ghost es-sm es-del" data-es="del-enemy" data-id="${escapeHtml(e.id)}" title="Delete">✕</button>
        </span>
      </div>`).join("")
      : `<p class="wd-empty">Nothing matches.</p>`;
  }

  function listMsg(text, cls) {
    const el = $("#es-iomsg");
    if (!el) return;
    el.innerHTML = text || "";
    el.className = "ed-msg" + (cls ? " " + cls : "");
  }

  // The mission gate (E6a). Turning an enemy ON re-runs the acceptance pipeline
  // at mission length; turning one off can be refused for stranding a slot.
  function toggleRoster(id, on, opts) {
    const res = setEnemyEnabled(id, on, opts);
    listMsg(res.ok ? "" : escapeHtml(res.error), res.ok ? "" : "bad");
    if (res.ok) applyEnemyRoster(); // this page's Level Generator resolves through the same map
    renderList();
    return res;
  }

  // ---- opening, duplicating, deleting -------------------------------------

  function openEnemy(id) {
    const r = enemyRecord(id);
    if (!r) return null;
    behavior = r.behavior;
    loadSpec(clone(r.spec), `Opened "${r.spec.name || r.spec.id}".`, { pin: true });
    showScreen("work");
    return r;
  }

  // A duplicate is a NEW enemy: its id follows its new name (approximation 17 —
  // Duplicate is the only way to get a different id), so it is not pinned.
  function duplicateEnemy(id) {
    const r = enemyRecord(id);
    if (!r) return null;
    const next = clone(r.spec);
    next.name = `${next.name || next.id} copy`;
    delete next.id;
    behavior = r.behavior;
    loadSpec(next, `Duplicated "${r.spec.name || r.spec.id}" — rename it and Save.`);
    showScreen("work");
    return next;
  }

  function removeEnemyRow(id) {
    const res = deleteEnemy(id);
    listMsg(res.ok ? `Deleted "${escapeHtml(res.id)}".` : escapeHtml(res.error), res.ok ? "" : "bad");
    if (res.ok && loadedId === id) loadedId = null;
    renderList();
    return res;
  }

  // ---- ＋ New --------------------------------------------------------------

  const BLANK_SPEC = () => ({
    v: 1, name: "New Enemy", role: "skirmisher", tier: 1, threat: 50, intelligence: 2,
    root: {
      id: "root", tags: ["enemy"],
      visual: { shape: "box", size: [30, 40], color: "#c05a5a" },
      health: { max: 30 },
      motion: { type: "chase", speed: 180 },
      contact: { damage: 8 },
    },
  });

  // Everything ＋New makes is UNPINNED, so its id follows the name you give it.
  function newEnemy(kind = "blank", arg = "") {
    const next = kind === "template"
      ? clone(TEMPLATE_BY_ID[arg] || TEMPLATE_BY_ID.tpl_charger)
      : BLANK_SPEC();
    if (kind === "template") delete next.id; // a template's id is the template's
    behavior = seedBehavior(next.role);
    loadSpec(next, kind === "describe"
      ? "New enemy. Describe it below and the conversation will build it."
      : `New enemy. Name it and Save.`);
    showScreen("work");
    if (kind === "describe") {
      const say = $("#es-say");
      if (say && say.focus) say.focus();
    }
    return next;
  }

  // ---- Export / Import / Reset --------------------------------------------
  // Same contract the settings tab has: the browser is not the authority, the
  // file is. Export dumps the merged list to paste into enemyspecs.js; Import
  // is how it crosses to another browser (approximation 14).

  function exportList() {
    const payload = {
      v: 1,
      enemies: enemyList().map((r) => ({ spec: r.spec, behavior: r.behavior, inMissions: r.inMissions })),
    };
    const text = JSON.stringify(payload, null, 2);
    const el = $("#es-io");
    if (el) el.value = text;
    listMsg(`Exported ${payload.enemies.length} enemies — paste them into <code>src/game/enemyspecs.js</code> to make them permanent.`, "ok");
    return text;
  }

  // Tolerant about shape, strict about content: the payload, a bare array of
  // records or specs, or one spec. Every spec still goes through accept().
  function incoming(obj) {
    const one = (x) => {
      if (!x || typeof x !== "object" || Array.isArray(x)) return null;
      if (x.spec && typeof x.spec === "object") return { spec: x.spec, behavior: x.behavior, inMissions: x.inMissions };
      if (x.root && typeof x.root === "object") return { spec: x, behavior: undefined, inMissions: undefined };
      return null;
    };
    if (Array.isArray(obj)) return obj.map(one).filter(Boolean);
    if (obj && Array.isArray(obj.enemies)) return obj.enemies.map(one).filter(Boolean);
    const solo = one(obj);
    return solo ? [solo] : [];
  }

  /**
   * Merge pasted JSON in by id — an id the list has becomes an edit, one it
   * does not becomes an addition. No per-row choices (approximation 15): a
   * spec that fails accept() is skipped and named.
   */
  function importList(text, opts = {}) {
    let obj;
    try {
      obj = JSON.parse(text != null ? text : (($("#es-io") || {}).value || ""));
    } catch (e) {
      listMsg(`Import failed — that is not JSON (${escapeHtml(e.message)}).`, "bad");
      return { ok: false, added: 0, skipped: [] };
    }
    const list = incoming(obj);
    if (!list.length) {
      listMsg("Import failed — no enemies in that JSON.", "bad");
      return { ok: false, added: 0, skipped: [] };
    }
    const skipped = [];
    let landed = 0;
    for (const item of list) {
      const res = accept(item.spec, { seconds: opts.seconds ?? 4 });
      if (!res.ok) {
        skipped.push({ id: item.spec.id || item.spec.name || "?", error: res.errors[0] });
        continue;
      }
      // inMissions is deliberately NOT taken from the payload: the switch is
      // the mission gate and has its own dry run, so an import cannot walk past
      // it. Omitting it keeps whatever the entry already had and leaves a NEW
      // one out of missions — re-importing your own export must not switch the
      // shipped enemies off.
      const saved = saveEnemyToList(item.spec, { behavior: item.behavior });
      if (saved.ok) landed++;
      else skipped.push({ id: item.spec.id || "?", error: saved.error });
    }
    applyEnemyRoster();
    renderList();
    listMsg(
      `Imported ${landed} enem${landed === 1 ? "y" : "ies"}` +
      (skipped.length
        ? ` · ${skipped.length} skipped: ` + skipped.map((sk) => `<code>${escapeHtml(sk.id)}</code> ${escapeHtml(sk.error)}`).join("; ")
        : " — a new one arrives out of missions; switch it on to place it."),
      skipped.length ? "bad" : "ok"
    );
    return { ok: landed > 0, added: landed, skipped };
  }

  function resetList() {
    resetEnemyList();
    loadedId = null;
    renderList();
    listMsg("Reset — the list is what this build ships.", "ok");
  }

  function saveCurrent() {
    const res = accept(spec, { seconds: 4 });
    const msg = $("#es-msg");
    if (!res.ok) {
      msg.textContent = `Not saved — ${res.errors[0]}`;
      msg.className = "ed-msg bad";
      return { ok: false, error: res.errors[0] };
    }
    const saved = saveEnemyToList(spec, { behavior });
    if (saved.ok) loadedId = saved.id; // saving pins the id, so the next Save overwrites
    msg.textContent = !saved.ok
      ? `Not saved — ${saved.error}`
      : saved.added
        ? `Saved as "${saved.id}". Switch it on to put it in missions.`
        : `Saved "${saved.id}".`;
    msg.className = "ed-msg " + (saved.ok ? "ok" : "bad");
    renderList();
    return saved;
  }

  // ---- Player2 / the conversation ----------------------------------------
  async function connectP2() {
    const status = $("#es-p2status");
    const id = config.player2GameClientId;
    if (!id) {
      status.textContent = "Set the game client id in Settings first.";
      status.className = "ed-msg bad";
      return;
    }
    status.textContent = "Connecting…";
    status.className = "ed-msg";
    try {
      p2 = new Player2Client({ gameClientId: id });
      await p2.authenticate();
      status.textContent = "Connected.";
      status.className = "ed-msg ok";
      setSendable();
    } catch (e) {
      p2 = null;
      status.textContent = `Connect failed — is the Player2 app running? (${e.message})`;
      status.className = "ed-msg bad";
      setSendable();
    }
  }

  function setSendable() {
    const btn = $("#es-send");
    if (!btn) return;
    btn.disabled = !p2 || generating;
    btn.title = p2 ? "" : "Connect to Player2 first";
  }

  // ---- transcript rendering ----------------------------------------------
  const KIND_LABEL = { edited: "edited", answered: "answered", failed: "no change" };

  function renderChat() {
    const ver = $("#es-ver");
    if (ver) ver.textContent = `v${version}`;
    const el = $("#es-stream");
    if (el) {
      el.innerHTML = turns.length
        ? turns.map(turnHTML).join("")
        : `<p class="wd-empty">Describe an enemy to create one, or load a template and tell it what to change. Questions are answered without touching the enemy.</p>`;
      if (typeof el.scrollTop === "number") el.scrollTop = 1e6;
    }
    renderTokens();
  }

  function turnHTML(t, i) {
    if (t.role === "sys") return `<div class="es-turn sys"><div class="es-bub">${escapeHtml(t.text)}</div></div>`;
    if (t.role === "you") return `<div class="es-turn you"><div class="es-who">You</div><div class="es-bub">${escapeHtml(t.text)}</div></div>`;
    const kind = t.kind || "answered";
    const ckpt = t.version !== undefined
      ? `<div class="es-ckpt"><span class="es-tag">v${t.version}</span><span class="es-what">${escapeHtml(t.what || "")}</span>
           <button class="btn btn-ghost es-sm" data-es="rewind" data-v="${t.version}">↩ rewind</button></div>`
      : "";
    return `<div class="es-turn ai">
      <div class="es-who">Model <span class="es-kind ${kind}">${KIND_LABEL[kind] || kind}</span></div>
      <div class="es-bub">${escapeHtml(t.text)}</div>
      ${t.errors ? `<ul class="es-errors">${t.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>` : ""}
      ${ckpt}
    </div>`;
  }

  // Approximation 1's catch: whole specs are expensive, so the price of the
  // NEXT turn is on screen before you send it. Priced off the real message
  // list, not an estimate of it — ~4 chars per token.
  function renderTokens() {
    const el = $("#es-tok");
    if (!el) return;
    const say = $("#es-say");
    const messages = composeChat({ history: turns, spec, message: (say && say.value) || "" });
    const chars = messages.reduce((n, m) => n + m.content.length, 0);
    el.textContent = `~${(Math.round(chars / 4 / 100) / 10).toFixed(1)}k tok`;
  }

  function pushTurn(t) {
    turns.push(t);
    renderChat();
    return t;
  }

  // A landing: the spec swaps, a checkpoint is pushed, and the diff becomes
  // the tree's marks. Nothing else in the tool knows a chat happened.
  function land(next, reply) {
    const before = spec;
    const changes = diffSpecs(before, next);
    spec = next;
    touched = changes;
    version = checkpoints.length; // checkpoints[0] is the spec as it was loaded
    checkpoints.push({ version, spec: clone(next), label: summarize(changes) });
    const nameEl = container.querySelector("[data-es='name']");
    if (nameEl) nameEl.value = spec.name || spec.id || "";
    pushTurn({ role: "model", text: reply || "Updated the enemy.", kind: "edited", version, what: summarize(changes) });
    refresh({ rebuildRail: true });
  }

  // Rewind is the undo. The transcript is NOT truncated — the failures and the
  // reasoning are the model's best context for the next turn — and later
  // checkpoints survive, so a rewind can be rewound.
  function rewind(v) {
    const cp = checkpoints.find((c) => c.version === v);
    if (!cp) return false;
    spec = clone(cp.spec);
    version = v;
    touched = [];
    const nameEl = container.querySelector("[data-es='name']");
    if (nameEl) nameEl.value = spec.name || spec.id || "";
    pushTurn({ role: "sys", text: `Rewound to v${v}. The enemy is back to what it was; the transcript is not.` });
    refresh({ rebuildRail: true });
    return true;
  }

  // One turn, end to end. The acceptance gate lives in chatEnemySpec, so this
  // only decides what the transcript says and whether anything lands.
  async function say(text) {
    text = String(text || "").trim();
    const status = $("#es-p2status");
    if (!text || generating) return null;
    if (!p2) {
      if (status) { status.textContent = "Connect to Player2 first."; status.className = "ed-msg bad"; }
      return null;
    }
    const say$ = $("#es-say");
    if (say$) say$.value = "";
    pushTurn({ role: "you", text });
    generating = true;
    setSendable();
    if (status) { status.textContent = "Thinking… (a spec lands only if it validates and dry-runs)"; status.className = "ed-msg"; }

    let turn;
    try {
      turn = await chatEnemySpec(p2, { history: turns.slice(0, -1), spec, message: text });
    } catch (e) {
      turn = { kind: "error", errors: [`turn failed: ${e.message}`] };
    }
    generating = false;
    setSendable();

    if (turn.kind === "edit") {
      land(turn.spec, turn.reply);
      if (status) { status.textContent = turn.repaired ? "Landed after one repair round." : "Landed."; status.className = "ed-msg ok"; }
    } else if (turn.kind === "answer") {
      pushTurn({ role: "model", text: turn.reply || "(no reply)", kind: "answered" });
      if (status) { status.textContent = "Answered — the enemy is unchanged."; status.className = "ed-msg"; }
    } else {
      pushTurn({
        role: "model", kind: "failed",
        text: turn.reply || "That did not produce a spec the engine would accept — the enemy is unchanged.",
        errors: (turn.errors || []).slice(0, 4),
      });
      if (status) { status.textContent = "Rejected — the enemy is unchanged."; status.className = "ed-msg bad"; }
    }
    return turn;
  }

  // ---- events -------------------------------------------------------------
  container.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.es === "name") {
      spec.name = t.value;
      refresh({ rebuildRail: false });
      return;
    }
    if (t.id === "es-say") { renderTokens(); return; }
    if (t.id === "es-json") {
      if (jsonTimer) clearTimeout(jsonTimer);
      jsonTimer = setTimeout(() => applyJson(t.value), 400);
      return;
    }
    if (t.dataset.cueGain !== undefined) {
      const kind = t.dataset.cueGain;
      const g = Number(t.value);
      writeSlot(kind, currentCue(kind), g);
      const out = container.querySelector(`[data-cue-gain-out="${kind}"]`);
      if (out) out.textContent = fmtGain(g);
      refresh({ rebuildRail: false, rewriteJson: true });
      return;
    }
    if (t.dataset.es === "aim") {
      play.aim = +t.value;
      shooter.data.stats.aim = play.aim; // spread comes off the stat, as in a mission
      const out = $("#es-aimval");
      if (out) out.textContent = t.value;
      return;
    }
    // A generated control: write by path, update its readout, do NOT rebuild
    // the inspector (a rebuild mid-drag would eat the slider).
    if (t.dataset.esp !== undefined && t.dataset.est === "number") {
      writeField(t.dataset.esp, "number", t.value);
      const out = container.querySelector(`[data-val-for="${t.dataset.esp}"]`);
      if (out) out.textContent = t.value;
      refresh({ rebuildRail: false });
    }
  });

  container.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.cue !== undefined) {
      writeSlot(t.dataset.cue, t.value, slotGain(t.dataset.cue));
      refresh({ rebuildRail: true, rewriteJson: true });
      return;
    }
    // Placement is record state, not spec state — nothing to validate, nothing
    // to rewrite in the JSON panel. It lands with Save.
    if (t.dataset.esplace !== undefined) {
      behavior = PLACEMENTS.includes(t.value) ? t.value : behavior;
      return;
    }
    if (t.dataset.esp !== undefined) {
      // enum / colour / tags / json land here; a bad JSON edit says so and is
      // dropped rather than half-applied.
      const ok = writeField(t.dataset.esp, t.dataset.est, t.value);
      const msg = $("#es-treemsg");
      if (msg) {
        msg.textContent = ok ? "" : "that field did not parse — left unchanged";
        msg.className = "ed-msg" + (ok ? "" : " bad");
      }
      if (ok) refresh({ rebuildRail: true, rewriteJson: true });
      return;
    }
    if (t.dataset.es === "weapon") {
      setWeapon(t.value);
    } else if (t.dataset.es === "template" && t.value) {
      const tpl = clone(TEMPLATE_BY_ID[t.value]);
      behavior = seedBehavior(tpl.role); // a template is a new enemy, so reseed the hint
      loadSpec(tpl, `Loaded the ${TEMPLATE_BY_ID[t.value].name} template.`);
      t.value = "";
    }
  });

  container.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-cue-play]");
    if (pick) {
      const kind = pick.dataset.cuePlay;
      const slot = kind === "emitter" ? emitterSound(spec, valueAt(spec, selected) || {}) : specSound(spec, kind);
      auditionCue(slot.cue, slot.gain);
      return;
    }
    // a tree row
    const row = e.target.closest("[data-esnode]");
    if (row) { selectNode(row.dataset.esnode); return; }
    // a boolean control (a switch, not an input — it emits no change event)
    const sw = e.target.closest("[data-esp][data-est='bool']");
    if (sw) {
      writeField(sw.dataset.esp, "bool", !sw.classList.contains("on"));
      refresh({ rebuildRail: true, rewriteJson: true });
      return;
    }
    // a roster enable switch
    const rost = e.target.closest("[data-esrost]");
    if (rost) {
      toggleRoster(rost.dataset.esrost, !rost.classList.contains("on"));
      return;
    }
    // a component on/off switch
    const comp = e.target.closest("[data-esc]");
    if (comp && !comp.disabled) {
      const [nodePath, name] = String(comp.dataset.esc).split("|");
      setComponent(nodePath, name, !comp.classList.contains("on"));
      refresh({ rebuildRail: true, rewriteJson: true });
      return;
    }
    const el = e.target.closest("[data-es]");
    if (!el) return;
    switch (el.dataset.es) {
      case "back": onBack(); break;
      case "tolist": showScreen("list"); break;
      case "open-enemy": openEnemy(el.dataset.id); break;
      case "dup-enemy": duplicateEnemy(el.dataset.id); break;
      case "del-enemy": removeEnemyRow(el.dataset.id); break;
      case "revert-enemy":
        revertEnemy(el.dataset.id);
        listMsg("Reverted to the version this build ships.", "");
        renderList();
        break;
      case "new": newOpen = !newOpen; renderList(); break;
      case "new-blank": newEnemy("blank"); break;
      case "new-tpl": newEnemy("template", (($("[data-es='new-tplsel']") || {}).value) || ""); break;
      case "new-describe": newEnemy("describe"); break;
      case "tab": listTab = el.dataset.tab || "all"; renderList(); break;
      case "io-export": exportList(); break;
      case "io-import": importList(); break;
      case "io-reset": resetList(); break;
      case "save": saveCurrent(); break;
      case "copy": copyJSON(); break;
      case "reset": resetFight(); break;
      case "expand": setExpanded(!play.expanded); break;
      case "add": {
        const sel = $("#es-addkind");
        if (sel && sel.value) treeOp("add", sel.value);
        break;
      }
      case "dup": case "del": case "up": case "down": case "todef":
        treeOp(el.dataset.es);
        break;
      case "connect": connectP2(); break;
      case "send": say(($("#es-say") || {}).value); break;
      case "rewind": rewind(Number(el.dataset.v)); break;
    }
  });

  // Give the keyboard back — leaving the workspace must never leave the stage
  // holding the keys, or typing into the filter box would drive a soldier
  // nobody can see.
  function blurStage() {
    if (canvas && typeof canvas.blur === "function") canvas.blur();
    else takeKeys(false);
  }

  const filterEl = $("[data-es='filter']");
  if (filterEl && filterEl.addEventListener) {
    filterEl.addEventListener("input", () => { listFilter = filterEl.value || ""; renderList(); });
  }

  // ⏎ sends, ⇧⏎ is a newline. The composer is a text field, so the canvas is
  // already blurred and MissionInput is already off — typing here can never
  // drive the soldier.
  const sayEl = $("#es-say");
  if (sayEl && sayEl.addEventListener) {
    sayEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        if (typeof e.preventDefault === "function") e.preventDefault();
        say(sayEl.value);
      }
    });
  }

  // Focus is the keyboard handover. Clicking the canvas focuses it (tabindex),
  // which enables MissionInput; clicking any field on the page blurs it, which
  // disables it again. Esc is the explicit way out without reaching for the
  // mouse. (Esc is unbound in controlmap, so MissionInput ignores it.)
  if (canvas.addEventListener) {
    canvas.addEventListener("focus", () => takeKeys(true));
    canvas.addEventListener("blur", () => takeKeys(false));
    canvas.addEventListener("keydown", (e) => {
      if (e.code === "Escape" && typeof canvas.blur === "function") canvas.blur();
    });
  }

  function applyJson(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      validation = { ok: false, errors: [{ path: "(json)", msg: e.message }] };
      normalized = null;
      renderErrors();
      renderVerdict();
      return;
    }
    spec = parsed;
    const nameEl = container.querySelector("[data-es='name']");
    if (nameEl && spec.name) nameEl.value = spec.name;
    // don't rewrite the textarea mid-typing; rebuild only the rest
    // Don't rebuild the inspector mid-typing (it would eat focus); the tree's
    // labels and marks still follow, which is refresh()'s default.
    refresh({ rebuildRail: false, rewriteJson: false });
  }

  // Loading is a NEW enemy: the checkpoints belonged to the old one, so the
  // stack restarts at v0. The transcript is kept and told what happened —
  // hiding the switch would make an earlier "rewind" button lie.
  function loadSpec(next, note, { pin = false } = {}) {
    spec = next;
    loadedId = pin ? next.id || null : null;
    checkpoints = [{ version: 0, spec: clone(next), label: "loaded" }];
    version = 0;
    touched = [];
    const nameEl = container.querySelector("[data-es='name']");
    if (nameEl) nameEl.value = spec.name || spec.id;
    if (note) pushTurn({ role: "sys", text: note });
    refresh({ rebuildRail: true });
  }

  function copyJSON() {
    const text = JSON.stringify(spec, null, 2);
    const msg = $("#es-msg");
    const done = (ok) => {
      msg.textContent = ok ? "Copied to clipboard." : "Copy failed — select the JSON panel text.";
      msg.className = "ed-msg " + (ok ? "ok" : "bad");
    };
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
      else done(false);
    } catch { done(false); }
  }

  // ---- preview loop -------------------------------------------------------
  function step(dt) {
    input.pollGamepad();

    // ---- the player -------------------------------------------------------
    if (shooter.fireCooldown > 0) shooter.fireCooldown -= dt;
    if (shooter.muzzleFlash > 0) shooter.muzzleFlash -= dt;
    if (shooter.hitFlash > 0) shooter.hitFlash -= dt;
    tickReload(shooter, dt, scene);

    if (!shooter.alive) {
      shooter.deadFor += dt;
      if (shooter.deadFor > 1.2) respawnShooter();
    } else {
      if (focused) {
        shooter.setCrouch(input.isDown("crouch"));
        const move = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
        resolveAim();
        shooter.applyMovement(dt, move, input.isDown("jump"));
        if (input.justPressed("reload")) startReload(shooter, scene);
        const wantFire = shooter.weapon.auto ? input.isDown("fire") : input.justPressed("fire");
        if (wantFire) fire(scene, shooter, shooter.fireDir(), "player", dt, aimAccuracy(play.aim));
      } else {
        // Keys released: no input is read at all, so a held key cannot be stuck
        // driving the soldier while you type. Friction still runs.
        shooter.applyMovement(dt, 0, false);
      }
      stepActor(shooter, dt, world, scene.platforms);
    }
    audio.setListener(shooter.x + shooter.w / 2); // pan follows the player

    // ---- the enemy --------------------------------------------------------
    if (preview.root) {
      if (!preview.root.alive) {
        preview.respawn += dt;
        if (preview.respawn > 1.2) resetPreview();
      } else {
        updateSpecEnemy(preview.root, dt, scene, previewCtx);
        scene.enemies = collidables(preview.root);
      }
    }

    updateProjectiles(scene, dt, previewCtx);
    updateStatuses(scene, dt, previewCtx);
    if (scene.projectiles.length > 80) scene.projectiles.splice(0, scene.projectiles.length - 80);
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c1424");
    g.addColorStop(1, "#16232a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.scale(scale, scale);

    // platforms
    for (const p of scene.platforms) {
      ctx.fillStyle = "#22303f";
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = "#6fd3ff";
      ctx.fillRect(p.x, p.y, p.w, 2);
    }

    drawShooter();
    for (const p of scene.projectiles) drawProjectile(ctx, p);
    if (preview.root) drawSpecEnemy(ctx, preview.root, perfNow() / 1000);

    ctx.restore();

    ctx.fillStyle = "rgba(190,200,215,0.55)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("live preview — real runtime", 8, 14);

    readouts();
  }

  // The player body, drawn the way the Firing Room draws its shooter: barrel
  // along the aim vector, muzzle flash at the tip, health bar once hurt.
  function drawShooter() {
    if (!shooter.alive) return;
    ctx.fillStyle = shooter.hitFlash > 0 ? "#fff" : "#7ad7ff";
    roundRect(ctx, shooter.x, shooter.y, shooter.w, shooter.h, 5);
    ctx.fill();
    const gd = shooter.fireDir();
    const gl = Math.hypot(gd.x, gd.y) || 1;
    const bx = shooter.x + shooter.w / 2, by = shooter.y + shooter.h * 0.42;
    ctx.strokeStyle = "#0b0f18";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + (gd.x / gl) * 18, by + (gd.y / gl) * 18);
    ctx.stroke();
    if (shooter.muzzleFlash > 0) {
      ctx.fillStyle = shooter.muzzleColor || "#ffd36a";
      ctx.beginPath();
      ctx.arc(bx + (gd.x / gl) * 20, by + (gd.y / gl) * 20, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const hf = Math.max(0, shooter.health / shooter.maxHealth);
    if (hf < 1) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(shooter.x, shooter.y - 7, shooter.w, 4);
      ctx.fillStyle = "#7ad7ff";
      ctx.fillRect(shooter.x, shooter.y - 7, shooter.w * hf, 4);
    }
  }

  function readouts() {
    const root = preview.root;
    const st = $("#es-state");
    if (st) st.textContent = root ? root.brainState.current : "—";
    const hp = $("#es-hp");
    if (hp) hp.textContent = root ? `${Math.max(0, Math.round(root.health))}/${root.maxHealth}` : "—";
    const parts = $("#es-parts");
    if (parts) parts.textContent = root ? String(collidables(root).length) : "—";
    const you = $("#es-you");
    if (you) you.textContent = shooter.alive ? `${Math.max(0, Math.round(shooter.health))}/${shooter.maxHealth}` : "down";
    const ammo = $("#es-ammo");
    if (ammo) {
      ammo.textContent = shooter.reloading > 0
        ? "reloading…"
        : shooter.weapon.magazine ? `${Math.max(0, shooter.ammo)}/${shooter.weapon.magazine}` : "∞";
    }
  }

  let running = true, raf = null, last = perfNow();
  function loop() {
    if (!running) return;
    const now = perfNow();
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    // The list screen has no stage to draw to, and a fight nobody can see must
    // not run: the preview would be mid-way through something when you open an
    // enemy. Loading one calls resetPreview anyway; this just stops the burn.
    if (screen === "work") {
      step(dt);
      draw();
    }
    raf = req(loop);
  }

  checkpoints = [{ version: 0, spec: clone(spec), label: "loaded" }];
  renderRail();
  renderList();
  renderKeys();
  renderChat();
  setSendable();
  refresh({ rebuildRail: false });
  respawnShooter();
  draw(); // one synchronous frame (headless-mount verifiable)
  raf = req(loop);

  return {
    dispose() {
      running = false;
      takeKeys(false); // the window key handlers must not outlive the tool
      audio.stopAll(); // nor the fight's gunfire
      if (dryTimer) clearTimeout(dryTimer);
      if (jsonTimer) clearTimeout(jsonTimer);
      if (raf != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    },

    // ---- driving hooks (headless tests) ----------------------------------
    // The Weapon Designer exports `load` for the same reason: a tool whose
    // interesting behaviour is behind a click is otherwise only assertable by
    // mounting it. takeKeys() is exactly what a click on the stage does.
    takeKeys,
    // E2's rail, driven the same way: select a node, run a structural op, read
    // back the tree. `tree()` is what the rows are rendered from.
    tree: () => treeNodes(spec),
    selected: () => selected,
    select: selectNode,
    op: treeOp,
    specNow: () => spec,
    // E3's conversation, driven the same way. `useClient` is how a headless
    // suite injects a stub where the browser injects a connected Player2Client
    // — the Connect button is the only other writer.
    useClient(client) { p2 = client; setSendable(); return !!p2; },
    say,
    chat: () => turns,
    versions: () => checkpoints.map((c) => c.version),
    version: () => version,
    rewind,
    touched: () => touched,
    // E6's one list, driven the same way: save whatever is loaded, flip an
    // entry in or out of missions, read the list back.
    save: saveCurrent,
    roster: enemyEntries,
    toggleRoster,
    load: (next, opts) => loadSpec(next, null, opts),
    // E7's two screens and the verbs on the list, driven the same way.
    screen: () => screen,
    show: showScreen,
    rows: () => visibleRows().map((e) => e.id),
    filter(q) { listFilter = q || ""; renderList(); return visibleRows().map((e) => e.id); },
    tab(which) { listTab = which; renderList(); return visibleRows().map((e) => e.id); },
    open: openEnemy,
    duplicate: duplicateEnemy,
    remove: removeEnemyRow,
    create: newEnemy,
    placement: () => behavior,
    setPlacement(b) { behavior = PLACEMENTS.includes(b) ? b : behavior; return behavior; },
    exportList,
    importList,
    resetList,
    // Hold a set of actions for `frames` steps, as the window key handler would
    // fill them in, and report what happened to the fight.
    drive(hold = {}, frames = 1, dt = 1 / 60) {
      for (let i = 0; i < frames; i++) {
        input.actions = { ...hold };
        input.pressed = i === 0 ? { ...hold } : {};
        step(dt);
      }
      return {
        focused,
        x: shooter.x, y: shooter.y, h: shooter.h,
        alive: shooter.alive, health: shooter.health, ammo: shooter.ammo,
        shots: scene.projectiles.length,
      };
    },
  };
}

// ---- small helpers --------------------------------------------------------

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function slug(s, fallback) { return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || fallback; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function perfNow() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
function req(fn) { return typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : null; }
