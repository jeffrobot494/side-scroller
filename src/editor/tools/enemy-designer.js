// ---------------------------------------------------------------------------
// ENEMY DESIGNER — author EnemySpec enemies: prompt an LLM or build by hand.
//
// The working object is a sparse EnemySpec (tech/enemyspec.md).
// Three ways in: a starter template, the form (common fields), or the JSON
// panel (full power — the JSON is authoritative; the form maps only what it
// understands). Every change re-validates; a valid spec re-instantiates the
// live preview, which runs the REAL runtime (instantiate/updateSpecEnemy —
// same code a mission host would run). Click a part in the preview to damage
// it and watch links/signals/phases fire.
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
import { listEnemySpecs, saveEnemySpec, deleteEnemySpec } from "../../game/customcontent.js";
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
          <canvas class="wd-canvas" id="es-canvas" width="380" height="240"></canvas>
          <p class="wd-saved-note">Live preview — the real runtime. Click a part to damage it.</p>
          <div class="wd-readout">
            <div class="wd-stat"><span>State</span><b id="es-state">—</b></div>
            <div class="wd-stat"><span>HP</span><b id="es-hp">—</b></div>
            <div class="wd-stat"><span>Parts</span><b id="es-parts">—</b></div>
          </div>
          <div class="wd-verdict" id="es-verdict"></div>
          <div class="wd-export">
            <div class="wd-export-btns">
              <button class="btn" data-es="save">Save to library</button>
              <button class="btn btn-alt" data-es="copy">Copy JSON</button>
              <button class="btn btn-alt" data-es="reset">↻ Preview</button>
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

  // ---- preview arena (world drawn at 0.5× onto the canvas) ---------------
  const SCALE = 0.5;
  const WORLD_W = canvas.width / SCALE;
  const WORLD_H = canvas.height / SCALE;
  const GROUND_Y = WORLD_H - 60;
  const preview = { root: null, respawn: 0 };

  const dummy = {
    kind: "soldier", x: 600, y: GROUND_Y - 46, w: 30, h: 46, vx: 0, vy: 0,
    onGround: true, alive: true, health: 1e9, maxHealth: 1e9, hitFlash: 0, facing: -1,
    burn: null, slow: null, crouched: false,
  };
  const scene = {
    // Same hook the mission and Firing Room install (tech/sound.md), so the
    // preview plays the enemy's authored voice as it moves and fires.
    sound: (cue, opts) => audio.play(cue, opts),
    world: { width: WORLD_W, height: WORLD_H, gravity: 2000 },
    platforms: [
      { x: 0, y: GROUND_Y, w: WORLD_W, h: 60 },
      { x: WORLD_W * 0.42, y: GROUND_Y - 120, w: 150, h: 16 }, // a perch for LOS/elevation
    ],
    soldiers: [dummy],
    enemies: [],
    projectiles: [],
  };

  const previewCtx = {
    friendlyFire: false,
    damageMult: 1,
    damage(t, amount, owner) {
      if (t.kind === "spec") {
        if (preview.root) applyDamage(preview.root, t, amount, owner, scene, previewCtx);
      } else {
        t.hitFlash = 0.12; // the dummy soaks everything
      }
    },
    kill(t, owner) {
      if (t.kind === "spec" && preview.root) applyDamage(preview.root, t, 1e9, owner, scene, previewCtx);
    },
    spark() {},
    burst() {},
  };

  function resetPreview() {
    scene.projectiles = [];
    preview.respawn = 0;
    if (!validation.ok || !normalized) {
      preview.root = null;
      return;
    }
    const h = normalized.root.body.h;
    const flying = normalized.root.body.gravity === 0;
    preview.root = instantiate(normalized, 130, flying ? GROUND_Y - h - 130 : GROUND_Y - h);
    scene.enemies = collidables(preview.root);
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
      case "reset": resetPreview(); break;
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

  // click a preview part to damage it (guarded: headless canvas has no rects)
  if (canvas.addEventListener && typeof canvas.getBoundingClientRect === "function") {
    canvas.addEventListener("mousedown", (e) => {
      if (!preview.root) return;
      const r = canvas.getBoundingClientRect();
      const wx = ((e.clientX - r.left) * (canvas.width / r.width)) / SCALE;
      const wy = ((e.clientY - r.top) * (canvas.height / r.height)) / SCALE;
      for (const part of collidables(preview.root)) {
        if (wx >= part.x && wx <= part.x + part.w && wy >= part.y && wy <= part.y + part.h) {
          applyDamage(preview.root, part, 15, null, scene, previewCtx);
          break;
        }
      }
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
    if (!preview.root) return;
    if (!preview.root.alive) {
      preview.respawn += dt;
      if (preview.respawn > 1.2) resetPreview();
    } else {
      updateSpecEnemy(preview.root, dt, scene, previewCtx);
      scene.enemies = collidables(preview.root);
      updateProjectiles(scene, dt, previewCtx);
      updateStatuses(scene, dt, previewCtx);
      if (scene.projectiles.length > 80) scene.projectiles.splice(0, scene.projectiles.length - 80);
    }
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c1424");
    g.addColorStop(1, "#16232a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.scale(SCALE, SCALE);

    // platforms
    for (const p of scene.platforms) {
      ctx.fillStyle = "#22303f";
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = "#6fd3ff";
      ctx.fillRect(p.x, p.y, p.w, 2);
    }

    // dummy target
    ctx.fillStyle = dummy.hitFlash > 0 ? "#8aa0bc" : "#3a4657";
    ctx.fillRect(dummy.x, dummy.y, dummy.w, dummy.h);
    ctx.fillStyle = "#26303d";
    ctx.fillRect(dummy.x + 3, dummy.y + 6, dummy.w - 6, 4);
    if (dummy.hitFlash > 0) dummy.hitFlash -= 1 / 60;

    for (const p of scene.projectiles) drawProjectile(ctx, p);
    if (preview.root) drawSpecEnemy(ctx, preview.root, perfNow() / 1000);

    ctx.restore();

    ctx.fillStyle = "rgba(190,200,215,0.55)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("live preview — real runtime", 8, 14);

    // readouts
    const st = $("#es-state");
    if (st && preview.root) st.textContent = preview.root.brainState.current;
    const hp = $("#es-hp");
    if (hp && preview.root) hp.textContent = `${Math.max(0, Math.round(preview.root.health))}/${preview.root.maxHealth}`;
    const parts = $("#es-parts");
    if (parts && preview.root) parts.textContent = String(collidables(preview.root).length);
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
  refresh({ rebuildForm: false });
  draw(); // one synchronous frame (headless-mount verifiable)
  raf = req(loop);

  return {
    dispose() {
      running = false;
      if (dryTimer) clearTimeout(dryTimer);
      if (jsonTimer) clearTimeout(jsonTimer);
      if (raf != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
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

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function slug(s, fallback) { return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || fallback; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function perfNow() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
function req(fn) { return typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : null; }
