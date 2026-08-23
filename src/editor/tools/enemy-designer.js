// ---------------------------------------------------------------------------
// ENEMY DESIGNER — author EnemySpec enemies: prompt an LLM or build by hand.
//
// The working object is a sparse EnemySpec (tech/enemyspec.md).
// Three ways in: a starter template, the form (common fields), or the JSON
// panel (full power — the JSON is authoritative; the form maps only what it
// understands). Every change re-validates; a valid spec re-instantiates the
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
// Generate: player2 chat completions via generateEnemySpec() — needs the
// Player2 app running (Connect) + a game client id (config.player2GameClientId,
// Settings tab). Without it, manual authoring is fully functional.
//
// Save: gated on accept() (validate → normalize → dry-run) into the EnemySpec
// library (localStorage) — the Firing Room can spawn saved specs.
//
// createEnemyDesigner(container, onBack) → { dispose() }
// ---------------------------------------------------------------------------

import { ROLES, VISUAL_SHAPES, MOTIONS } from "../../game/enemyspec/schema.js";

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
import { generateEnemySpec, accept } from "../../game/enemyspec/generate.js";
import { listEnemySpecs, saveEnemySpec, deleteEnemySpec, listCustomWeapons } from "../../game/customcontent.js";
import { ARSENAL } from "../../game/arsenal.js";
import { Soldier, stepActor, startReload, tickReload } from "../../mission/entities.js";
import { fire, aimAccuracy } from "../../mission/ai.js";
import { MissionInput } from "../../mission/input.js";
import { instantiate, updateSpecEnemy, applyDamage, collidables } from "../../mission/enemyspec/runtime.js";
import { drawSpecEnemy } from "../../mission/enemyspec/render.js";
import { cuePickerRowHTML, auditionCue, fmtGain } from "../sound-picker.js";
import { audio } from "../../audio/engine.js";
import { specSound, SPEC_SOUND_KINDS } from "../../audio/cues.js";
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
    <div class="wd">
      <div class="wd-head">
        <button class="btn btn-ghost" data-es="back">← Tools</button>
        <input class="wd-name" data-es="name" value="${escapeHtml(spec.name)}" spellcheck="false" />
        <span class="wd-id" id="es-id"></span>
      </div>

      <div class="es-createbar">
        <textarea id="es-prompt" class="es-prompt" rows="2" spellcheck="false"
          placeholder="Describe an enemy for the LLM — e.g. “a floating mine-layer with a shielded core and two destructible cannon pods”"></textarea>
        <div class="es-createbtns">
          <button class="btn" data-es="generate" id="es-generate" disabled title="Connect to Player2 first">✦ Generate</button>
          <button class="btn btn-alt" data-es="connect" id="es-connect">Connect Player2</button>
          <span class="ed-msg" id="es-p2status"></span>
          <label class="lg-field es-tpl">Template
            <select data-es="template">
              <option value="">— load —</option>
              ${TEMPLATES.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>

      <div class="wd-grid">
        <div class="wd-form" id="es-form"></div>

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
              <button class="btn" data-es="save">Save to library</button>
              <button class="btn btn-alt" data-es="copy">Copy JSON</button>
            </div>
            <span class="ed-msg" id="es-msg"></span>
          </div>
          <div class="wd-saved">
            <h3 class="wd-h">Enemy library</h3>
            <p class="wd-saved-note">Saved to this browser. The Firing Room lists these under “Enemy” — fight them there. Export JSON to make one permanent.</p>
            <div class="wd-saved-list" id="es-saved"></div>
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
  function refresh({ rebuildForm = false, rewriteJson = true } = {}) {
    spec.id = slug(spec.name, "custom_spec");
    validation = validateSpec(spec);
    normalized = validation.ok ? normalizeSpec(spec) : null;

    $("#es-id").textContent = spec.id;
    if (rebuildForm) renderForm();
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

  // ---- form (common fields; the JSON is authoritative for the rest) -------
  function renderForm() {
    const root = spec.root || {};
    const vis = root.visual || {};
    const size = vis.size || [24, 24];
    const motion = root.motion || { type: "static" };
    const hasGun = !!(root.emitters && root.emitters.gun && root.emitters.gun.projectile);
    const speedKey = motion.type === "hover" ? "driftSpeed" : "speed";
    const speedable = MOTIONS[motion.type] && MOTIONS[motion.type].params[speedKey] !== undefined;

    $("#es-form").innerHTML = `
      <h3 class="wd-h">Identity</h3>
      ${selectRow("role", "Role", ROLES, spec.role || "skirmisher")}
      ${sliderRow("tier", "Tier", spec.tier ?? 1, 1, 5, 1)}
      ${sliderRow("threat", "Threat cost", spec.threat ?? 50, 10, 600, 10)}
      ${sliderRow("intelligence", "Intelligence", spec.intelligence ?? 2, 1, 5, 1)}

      <h3 class="wd-h">Body</h3>
      ${selectRow("shape", "Shape", VISUAL_SHAPES, vis.shape || "box")}
      <div class="cfg-row wd-row">
        <div class="cfg-meta"><span class="cfg-label">Colour</span></div>
        <div class="cfg-control"><input type="color" data-esf="color" value="${vis.color || "#e05a5a"}" /></div>
      </div>
      ${sliderRow("w", "Width", size[0], 8, 160, 2, "px")}
      ${sliderRow("h", "Height", size[1], 8, 160, 2, "px")}
      ${sliderRow("health", "Health", root.health ? root.health.max : 30, 1, 800, 1)}

      <h3 class="wd-h">Movement</h3>
      ${selectRow("motion", "Motion", Object.keys(MOTIONS), motion.type)}
      ${speedable ? sliderRow("speed", "Speed", motion[speedKey] ?? 150, 0, 500, 10, "px/s") : ""}

      <h3 class="wd-h">Attack</h3>
      ${sliderRow("contact", "Contact damage", root.contact ? root.contact.damage : 0, 0, 60, 1)}
      ${hasGun
        ? `${sliderRow("gundmg", "Gun damage", gunOf().damage ?? 8, 1, 60, 1)}
           ${sliderRow("gunspeed", "Gun shot speed", gunOf().speed ?? 420, 60, 1200, 20, "px/s")}`
        : `<div class="cfg-row wd-row">
             <div class="cfg-meta"><span class="cfg-label">Gun</span><span class="cfg-help">Adds a “gun” emitter${spec.brain ? " (wire it into your brain via JSON)" : " + a basic telegraph-and-fire loop"}.</span></div>
             <div class="cfg-control"><button class="btn btn-alt" data-es="addgun">+ Add basic gun</button></div>
           </div>`}

      <h3 class="wd-h">Sound</h3>
      <p class="wd-saved-note">
        Every slot has an engine default, so leaving these on <strong>Auto</strong> is fine — this is for
        giving one enemy its own voice. The <strong>×</strong> slider sets this enemy's level for that cue.
        For sounds at a specific moment (a telegraph, a phase change) use the <code>sound</code> action in
        the JSON below instead.
      </p>
      <div id="es-sounds"></div>

      <h3 class="wd-h">Full spec (authoritative)</h3>
      <p class="wd-saved-note">Parts, brains, emitters, events, utility actions — everything lives here. Edits apply once they parse; errors list below.</p>
      <textarea id="es-json" class="ed-json wd-json es-json" spellcheck="false"></textarea>
      <ul class="es-errors" id="es-errors"></ul>`;

    const host = $("#es-sounds");
    if (host) {
      host.innerHTML = SOUND_ROWS.map((r) =>
        cuePickerRowHTML({
          ...r,
          value: slotCue(r.kind),
          gain: specSound(spec, r.kind).gain,
          resolved: specSound({}, r.kind).cue,
        })
      ).join("");
    }

    const ta = $("#es-json");
    if (ta) ta.value = JSON.stringify(spec, null, 2);
    renderErrors();
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

  function gunOf() {
    return ((spec.root || {}).emitters || {}).gun ? spec.root.emitters.gun.projectile : {};
  }

  // Apply a form field to the spec (creating minimal structure when needed).
  function applyFormField(key, value) {
    spec.root = spec.root || {};
    const root = spec.root;
    switch (key) {
      case "role": spec.role = value; break;
      case "tier": spec.tier = +value; break;
      case "threat": spec.threat = +value; break;
      case "intelligence": spec.intelligence = +value; break;
      case "shape": root.visual = { ...(root.visual || {}), shape: value }; break;
      case "color": root.visual = { ...(root.visual || {}), color: value }; break;
      case "w": case "h": {
        const size = (root.visual && root.visual.size) || [24, 24];
        const next = key === "w" ? [+value, size[1]] : [size[0], +value];
        root.visual = { ...(root.visual || {}), size: next };
        break;
      }
      case "health": root.health = { max: +value }; break;
      case "motion": {
        root.motion = { type: value };
        break;
      }
      case "speed": {
        if (!root.motion) break;
        const speedKey = root.motion.type === "hover" ? "driftSpeed" : "speed";
        root.motion[speedKey] = +value;
        break;
      }
      case "contact":
        if (+value > 0) root.contact = { ...(root.contact || {}), damage: +value };
        else delete root.contact;
        break;
      case "gundmg":
        if (root.emitters && root.emitters.gun) root.emitters.gun.projectile.damage = +value;
        break;
      case "gunspeed":
        if (root.emitters && root.emitters.gun) root.emitters.gun.projectile.speed = +value;
        break;
    }
  }

  function addBasicGun() {
    spec.root = spec.root || {};
    spec.root.emitters = spec.root.emitters || {};
    spec.root.emitters.gun = {
      at: [0, -4],
      projectile: { speed: 420, w: 10, h: 10, color: "#8affc1", life: 2.2, damage: 8, shape: "orb" },
    };
    if (!spec.brain) {
      spec.brain = {
        start: "fight",
        states: {
          fight: {
            tracks: [{ id: "shoot", loop: true, steps: [
              { telegraph: { time: 0.5 } },
              { fire: { emitter: "gun", pattern: "aimed" } },
              { wait: 1.4 },
            ] }],
          },
        },
      };
    }
    refresh({ rebuildForm: true });
  }

  // ---- library ------------------------------------------------------------
  function renderSaved() {
    const saved = listEnemySpecs();
    $("#es-saved").innerHTML = saved.length
      ? saved.map((s) => `
          <div class="wd-saved-row" data-id="${s.id}">
            <span class="wd-saved-name">${escapeHtml(s.name || s.id)}</span>
            <span class="wd-saved-budget">${escapeHtml(s.role || "?")} · t${s.tier ?? 1} · int ${s.intelligence ?? "—"} · ${s.threat ?? "—"}</span>
            <button class="btn btn-ghost" data-es="load-saved" data-id="${s.id}">Load</button>
            <button class="wd-fx-x" data-es="del-saved" data-id="${s.id}" title="Delete">×</button>
          </div>`).join("")
      : `<p class="wd-empty">No saved enemies yet — build one and Save.</p>`;
  }

  function saveCurrent() {
    const res = accept(spec, { seconds: 4 });
    const msg = $("#es-msg");
    if (!res.ok) {
      msg.textContent = `Not saved — ${res.errors[0]}`;
      msg.className = "ed-msg bad";
      return;
    }
    const saved = saveEnemySpec(spec);
    msg.textContent = saved.ok ? `Saved as "${saved.id}" — spawn it in the Firing Room.` : "Save failed.";
    msg.className = "ed-msg " + (saved.ok ? "ok" : "bad");
    renderSaved();
  }

  // ---- Player2 / generation ----------------------------------------------
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
      const btn = $("#es-generate");
      if (btn) { btn.disabled = false; btn.title = ""; }
    } catch (e) {
      p2 = null;
      status.textContent = `Connect failed — is the Player2 app running? (${e.message})`;
      status.className = "ed-msg bad";
    }
  }

  async function generate() {
    if (!p2 || generating) return;
    const promptText = ($("#es-prompt").value || "").trim();
    const status = $("#es-p2status");
    if (!promptText) {
      status.textContent = "Describe the enemy first.";
      status.className = "ed-msg bad";
      return;
    }
    generating = true;
    const btn = $("#es-generate");
    if (btn) btn.disabled = true;
    status.textContent = "Generating… (validates + dry-runs before it lands)";
    status.className = "ed-msg";
    try {
      const res = await generateEnemySpec(p2, promptText);
      if (res.ok) {
        spec = res.spec;
        status.textContent = "Generated → loaded into the editor.";
        status.className = "ed-msg ok";
        const nameEl = container.querySelector("[data-es='name']");
        if (nameEl) nameEl.value = spec.name || spec.id;
        refresh({ rebuildForm: true });
      } else {
        status.textContent = `Rejected: ${res.errors.slice(0, 3).join(" · ")}`;
        status.className = "ed-msg bad";
      }
    } catch (e) {
      status.textContent = `Generation error: ${e.message}`;
      status.className = "ed-msg bad";
    } finally {
      generating = false;
      if (btn) btn.disabled = !p2;
    }
  }

  // ---- events -------------------------------------------------------------
  container.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.es === "name") {
      spec.name = t.value;
      refresh({ rebuildForm: false });
      return;
    }
    if (t.id === "es-json") {
      if (jsonTimer) clearTimeout(jsonTimer);
      jsonTimer = setTimeout(() => applyJson(t.value), 400);
      return;
    }
    if (t.dataset.cueGain !== undefined) {
      const kind = t.dataset.cueGain;
      const g = Number(t.value);
      writeSlot(kind, slotCue(kind), g);
      const out = container.querySelector(`[data-cue-gain-out="${kind}"]`);
      if (out) out.textContent = fmtGain(g);
      refresh({ rebuildForm: false, rewriteJson: true });
      return;
    }
    if (t.dataset.es === "aim") {
      play.aim = +t.value;
      shooter.data.stats.aim = play.aim; // spread comes off the stat, as in a mission
      const out = $("#es-aimval");
      if (out) out.textContent = t.value;
      return;
    }
    if (t.dataset.esf) {
      applyFormField(t.dataset.esf, t.value);
      const out = container.querySelector(`[data-val-for="${t.dataset.esf}"]`);
      if (out) out.textContent = t.value;
      refresh({ rebuildForm: false });
    }
  });

  container.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.cue !== undefined) {
      writeSlot(t.dataset.cue, t.value, specSound(spec, t.dataset.cue).gain);
      refresh({ rebuildForm: true, rewriteJson: true });
      return;
    }
    if (t.dataset.esf) {
      applyFormField(t.dataset.esf, t.value);
      refresh({ rebuildForm: true, rewriteJson: true });
    } else if (t.dataset.es === "weapon") {
      setWeapon(t.value);
    } else if (t.dataset.es === "template" && t.value) {
      loadSpec(clone(TEMPLATE_BY_ID[t.value]));
      t.value = "";
    }
  });

  container.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-cue-play]");
    if (pick) {
      const slot = specSound(spec, pick.dataset.cuePlay);
      auditionCue(slot.cue, slot.gain);
      return;
    }
    const el = e.target.closest("[data-es]");
    if (!el) return;
    switch (el.dataset.es) {
      case "back": onBack(); break;
      case "save": saveCurrent(); break;
      case "copy": copyJSON(); break;
      case "reset": resetFight(); break;
      case "expand": setExpanded(!play.expanded); break;
      case "addgun": addBasicGun(); break;
      case "connect": connectP2(); break;
      case "generate": generate(); break;
      case "load-saved": {
        const s = listEnemySpecs().find((x) => x.id === el.dataset.id);
        if (s) loadSpec(clone(s));
        break;
      }
      case "del-saved":
        deleteEnemySpec(el.dataset.id);
        renderSaved();
        break;
    }
  });

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
    refresh({ rebuildForm: false, rewriteJson: false });
    renderFormValuesOnly();
  }

  // After a JSON edit, refresh form control values without rebuilding HTML
  // (rebuilding would eat focus); a full rebuild happens on template/LLM loads.
  function renderFormValuesOnly() {
    renderErrors();
  }

  function loadSpec(next) {
    spec = next;
    const nameEl = container.querySelector("[data-es='name']");
    if (nameEl) nameEl.value = spec.name || spec.id;
    refresh({ rebuildForm: true });
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
    step(dt);
    draw();
    raf = req(loop);
  }

  renderForm();
  renderSaved();
  renderKeys();
  refresh({ rebuildForm: false });
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

function sliderRow(key, label, value, min, max, step, unit = "") {
  return `
    <div class="cfg-row wd-row">
      <div class="cfg-meta"><span class="cfg-label">${label}</span></div>
      <div class="cfg-control">
        <input type="range" data-esf="${key}" min="${min}" max="${max}" step="${step}" value="${value}" />
        <output class="cfg-val" data-val-for="${key}">${value}${unit ? " " + unit : ""}</output>
      </div>
    </div>`;
}

function selectRow(key, label, options, value) {
  return `
    <div class="cfg-row wd-row">
      <div class="cfg-meta"><span class="cfg-label">${label}</span></div>
      <div class="cfg-control">
        <select data-esf="${key}">${options.map((o) => `<option value="${o}"${o === value ? " selected" : ""}>${o}</option>`).join("")}</select>
      </div>
    </div>`;
}

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
