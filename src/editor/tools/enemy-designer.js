// ---------------------------------------------------------------------------
// ENEMY DESIGNER — a GUI tool in the editor's Tools tab.
//
// Author an enemy stat block + archetype (charger / shooter / turret) and watch
// it behave in a live preview that runs the REAL entity + AI code: the same
// Enemy class, updateEnemy() steering, stepActor() physics, and fire() the
// mission uses. So a charger charges, a shooter holds its preferred range and
// telegraphs, a turret sits and telegraphs — exactly as it will in a mission.
//
// Export produces content.js-shaped JSON (ranged-only fields stripped for a
// charger) that drops into ENEMIES; Save writes it to the custom enemy pool
// (localStorage) so loadMission can resolve it once a level places the type.
//
// createEnemyDesigner(container, onBack) → { dispose() }
// ---------------------------------------------------------------------------

import { WEAPONS } from "../../game/content.js";
import { Enemy, Soldier, stepActor, overlaps } from "../../mission/entities.js";
import { updateEnemy } from "../../mission/ai.js";
import { listCustomEnemies, saveCustomEnemy, deleteCustomEnemy } from "../../game/customcontent.js";

const BEHAVIORS = [
  { id: "charger", label: "Charger — barrels into melee, deals contact damage" },
  { id: "shooter", label: "Shooter — holds preferred range, telegraphs, fires" },
  { id: "turret", label: "Turret — stationary, telegraphs, fires" },
];

// Numeric sliders always shown (path into the enemy object).
const CORE_FIELDS = [
  { path: "w", label: "Width", min: 16, max: 64, step: 1, unit: "px" },
  { path: "h", label: "Height", min: 16, max: 72, step: 1, unit: "px" },
  { path: "health", label: "Health", min: 5, max: 200, step: 1 },
  { path: "speed", label: "Move speed", min: 0, max: 400, step: 10, unit: "px/s" },
  { path: "contactDamage", label: "Contact damage", min: 0, max: 40, step: 1 },
  { path: "detectRange", label: "Detect range", min: 200, max: 1000, step: 20, unit: "px" },
];

// Sliders shown only for ranged behaviors (shooter / turret).
const RANGED_FIELDS = [
  { path: "preferredRange", label: "Preferred range", min: 100, max: 700, step: 20, unit: "px" },
  { path: "windup", label: "Windup (telegraph)", min: 0.1, max: 2, step: 0.1, unit: "s" },
];

export function createEnemyDesigner(container, onBack) {
  const enemy = {
    id: "custom_enemy",
    name: "Custom Enemy",
    color: "#e0725a",
    w: 32,
    h: 40,
    health: 40,
    behavior: "charger",
    speed: 200,
    contactDamage: 10,
    detectRange: 640,
    preferredRange: 340,
    weapon: "plasma",
    windup: 0.5,
    loot: { name: "Salvage", value: 40 },
  };

  const ranged = () => enemy.behavior !== "charger";

  container.innerHTML = `
    <div class="wd">
      <div class="wd-head">
        <button class="btn btn-ghost" data-ed="back">← Tools</button>
        <input class="wd-name" data-ed="name" value="${escapeHtml(enemy.name)}" spellcheck="false" />
        <span class="wd-id" id="ed-id"></span>
      </div>
      <div class="wd-grid">
        <div class="wd-form">
          <h3 class="wd-h">Archetype</h3>
          <div class="cfg-row wd-row">
            <div class="cfg-meta"><span class="cfg-label">Behavior</span></div>
            <div class="cfg-control">
              <select data-ed="behavior">${BEHAVIORS.map((b) => `<option value="${b.id}"${b.id === enemy.behavior ? " selected" : ""}>${b.id}</option>`).join("")}</select>
            </div>
          </div>
          <p class="wd-saved-note" id="ed-behavior-note"></p>

          <h3 class="wd-h">Body</h3>
          <div class="cfg-row wd-row">
            <div class="cfg-meta"><span class="cfg-label">Colour</span></div>
            <div class="cfg-control"><input type="color" data-ed="color" value="${enemy.color}" /></div>
          </div>
          ${CORE_FIELDS.map((f) => fieldRow(f, get(enemy, f.path))).join("")}

          <div id="ed-ranged"></div>

          <h3 class="wd-h">Loot drop</h3>
          <div class="cfg-row wd-row">
            <div class="cfg-meta"><span class="cfg-label">Loot name</span></div>
            <div class="cfg-control"><input type="text" data-ed="loot-name" value="${escapeHtml(enemy.loot.name)}" spellcheck="false" /></div>
          </div>
          ${fieldRow({ path: "loot.value", label: "Loot value", min: 0, max: 400, step: 5, unit: "§" }, enemy.loot.value)}
        </div>

        <div class="wd-side">
          <canvas class="wd-canvas" id="ed-canvas" width="380" height="180"></canvas>
          <div class="wd-readout">
            <div class="wd-stat"><span>Behavior</span><b id="ed-bhv">—</b></div>
            <div class="wd-stat"><span>Health</span><b id="ed-hp">—</b></div>
          </div>
          <div class="wd-export">
            <div class="wd-export-btns">
              <button class="btn" data-ed="save">Save to enemy pool</button>
              <button class="btn btn-alt" data-ed="copy">Copy JSON</button>
            </div>
            <span class="ed-msg" id="ed-msg"></span>
            <textarea class="ed-json wd-json" id="ed-json" spellcheck="false" readonly></textarea>
          </div>
          <div class="wd-saved">
            <h3 class="wd-h">Saved enemies</h3>
            <p class="wd-saved-note">Saved to this browser. A mission can spawn a saved enemy once the Level Editor (not built yet) or a hand edit to <code>content.js</code> places its type — reload the game after saving.</p>
            <div class="wd-saved-list" id="ed-saved"></div>
          </div>
        </div>
      </div>
    </div>`;

  const $ = (sel) => container.querySelector(sel);
  const canvas = $("#ed-canvas");
  const ctx = canvas.getContext("2d");

  // ---- content-shaped def (ranged-only fields stripped for a charger) ------
  function liveDef() {
    const d = {
      id: slug(enemy.name, "custom_enemy"),
      name: enemy.name,
      color: enemy.color,
      w: enemy.w,
      h: enemy.h,
      health: enemy.health,
      behavior: enemy.behavior,
      speed: enemy.speed,
      contactDamage: enemy.contactDamage,
      detectRange: enemy.detectRange,
      loot: { name: enemy.loot.name, value: enemy.loot.value },
    };
    if (ranged()) {
      d.preferredRange = enemy.preferredRange;
      d.weapon = enemy.weapon;
      d.windup = enemy.windup;
    }
    return d;
  }

  // ---- ranged fields block (rebuilt on behavior change) -------------------
  function renderRanged() {
    if (!ranged()) { $("#ed-ranged").innerHTML = ""; return; }
    $("#ed-ranged").innerHTML = `
      <h3 class="wd-h">Ranged</h3>
      <div class="cfg-row wd-row">
        <div class="cfg-meta"><span class="cfg-label">Weapon</span></div>
        <div class="cfg-control">
          <select data-ed="weapon">${Object.keys(WEAPONS).map((k) => `<option value="${k}"${k === enemy.weapon ? " selected" : ""}>${escapeHtml(WEAPONS[k].name)}</option>`).join("")}</select>
        </div>
      </div>
      ${RANGED_FIELDS.map((f) => fieldRow(f, get(enemy, f.path))).join("")}`;
  }

  // ---- saved-enemies list -------------------------------------------------
  function renderSaved() {
    const saved = listCustomEnemies();
    $("#ed-saved").innerHTML = saved.length
      ? saved
          .map(
            (e) => `
        <div class="wd-saved-row" data-id="${e.id}">
          <span class="wd-saved-name">${escapeHtml(e.name || e.id)}</span>
          <span class="wd-saved-budget">${escapeHtml(e.behavior || "?")} · ${e.health ?? "—"} hp</span>
          <button class="wd-fx-x" data-ed="del-saved" data-id="${e.id}" title="Delete">×</button>
        </div>`
          )
          .join("")
      : `<p class="wd-empty">No saved enemies yet.</p>`;
  }

  // ---- refresh readouts + export text -------------------------------------
  function refresh() {
    enemy.id = slug(enemy.name, "custom_enemy");
    $("#ed-id").textContent = enemy.id;
    $("#ed-bhv").textContent = enemy.behavior;
    $("#ed-hp").textContent = enemy.health;
    $("#ed-behavior-note").textContent = (BEHAVIORS.find((b) => b.id === enemy.behavior) || {}).label || "";
    $("#ed-json").value = JSON.stringify(liveDef(), null, 2);
  }

  // ---- events -------------------------------------------------------------
  container.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.ed === "name") { enemy.name = t.value; refresh(); return; }
    if (t.dataset.ed === "color") { enemy.color = t.value; rebuildEnemy(); refresh(); return; }
    if (t.dataset.ed === "loot-name") { enemy.loot.name = t.value; refresh(); return; }
    if (t.dataset.field) {
      set(enemy, t.dataset.field, Number(t.value));
      const out = container.querySelector(`[data-val-for="${t.dataset.field}"]`);
      if (out) out.textContent = fmt(Number(t.value)) + unitFor(t.dataset.field);
      rebuildEnemy();
      refresh();
    }
  });

  container.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.ed === "behavior") {
      enemy.behavior = t.value;
      renderRanged();
      rebuildEnemy();
      refresh();
    } else if (t.dataset.ed === "weapon") {
      enemy.weapon = t.value;
      rebuildEnemy();
      refresh();
    }
  });

  container.addEventListener("click", (e) => {
    const el = e.target.closest("[data-ed]");
    if (!el) return;
    switch (el.dataset.ed) {
      case "back": onBack(); break;
      case "copy": copyJSON(); break;
      case "save": saveEnemy(); break;
      case "del-saved": deleteCustomEnemy(el.dataset.id); renderSaved(); break;
    }
  });

  function saveEnemy() {
    const res = saveCustomEnemy(liveDef());
    const msg = $("#ed-msg");
    msg.textContent = res.ok ? `Saved as "${res.id}" — place it in a level, then reload the game.` : "Save failed.";
    msg.className = "ed-msg " + (res.ok ? "ok" : "bad");
    renderSaved();
  }

  function copyJSON() {
    const text = $("#ed-json").value;
    const msg = $("#ed-msg");
    const done = (ok) => { msg.textContent = ok ? "Copied to clipboard." : "Copy failed — select the text below."; msg.className = "ed-msg " + (ok ? "ok" : "bad"); };
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
      else done(false);
    } catch { done(false); }
  }

  // ---- live preview: the REAL entity + AI code in a mini scene ------------
  // Simulated in a fixed world (WORLD_W × WORLD_H) drawn scaled to the canvas,
  // so real detect/preferred ranges (hundreds of px) fit and read correctly.
  const WORLD_W = 760, WORLD_H = 360, SCALE = canvas.width / WORLD_W;
  const GROUND_Y = 300;
  const SPAWN_X = 80;
  const DUMMY_X = 620;

  const dummyData = { id: "dummy", name: "Target", callsign: "TGT", stats: { health: 6, aim: 5, speed: 5 } };
  const dummy = new Soldier(dummyData, WEAPONS.rifle, DUMMY_X, GROUND_Y - 46);
  dummy.vx = 0; dummy.vy = 0; // stands still; we never step it

  const scene = {
    world: { gravity: 2000, width: WORLD_W, height: WORLD_H },
    platforms: [{ x: 0, y: GROUND_Y, w: WORLD_W, h: 60 }],
    soldiers: [dummy],
    enemies: [],
    projectiles: [],
  };
  const sparks = [];

  function rebuildEnemy() {
    // The Enemy constructor snapshots stats/weapon, so any change means a fresh
    // instance. Spawn it on the ground at the left, facing the dummy.
    const e = new Enemy(liveDef(), SPAWN_X, GROUND_Y - enemy.h);
    scene.enemies = [e];
    scene.projectiles = [];
  }

  function resetEnemyPos() {
    const e = scene.enemies[0];
    if (!e) return;
    e.x = SPAWN_X;
    e.y = GROUND_Y - e.h;
    e.vx = 0; e.vy = 0;
    e.windup = 0; e.fireCooldown = 0;
  }

  function step(dt) {
    const e = scene.enemies[0];
    if (!e) return;
    dummy.fireCooldown = 999; // ensure the dummy never fires even if AI touched it

    updateEnemy(e, dt, scene);
    if (e.fireCooldown > 0) e.fireCooldown -= dt;
    stepActor(e, dt, scene.world, scene.platforms);

    // A charger that reaches the target loops back to the spawn so the run repeats.
    if (overlaps(e, dummy)) resetEnemyPos();

    // Advance projectiles; spark + despawn on the dummy (no damage) or expiry.
    for (const p of scene.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (!p.dead && overlaps(p, dummy)) { p.dead = true; burst(p.x, p.y, p.color, 7); }
      if (p.x < -20 || p.x > WORLD_W + 20 || p.life <= 0) p.dead = true;
    }
    scene.projectiles = scene.projectiles.filter((p) => !p.dead);
    if (scene.projectiles.length > 60) scene.projectiles.splice(0, scene.projectiles.length - 60);

    for (const s of sparks) { s.vy += 400 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 120;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + Math.random() * 0.2, max: 0.45, color });
    }
  }

  const X = (x) => x * SCALE, Y = (y) => y * SCALE, S = (v) => v * SCALE;

  function draw() {
    const W = canvas.width, H = canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c1424"); g.addColorStop(1, "#16232a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // ground
    ctx.fillStyle = "rgba(120,160,210,0.14)"; ctx.fillRect(0, Y(GROUND_Y), W, 2);
    ctx.fillStyle = "rgba(20,28,38,0.7)"; ctx.fillRect(0, Y(GROUND_Y) + 2, W, H - Y(GROUND_Y));

    // dummy target
    ctx.fillStyle = "#3a4657"; roundRect(ctx, X(dummy.x), Y(dummy.y), S(dummy.w), S(dummy.h), 4); ctx.fill();
    ctx.fillStyle = "#26303d"; ctx.fillRect(X(dummy.x) + 3, Y(dummy.y) + 6, S(dummy.w) - 6, 3);

    // projectiles
    ctx.save(); ctx.shadowBlur = 8;
    for (const p of scene.projectiles) {
      ctx.shadowColor = p.color; ctx.fillStyle = p.color;
      const pw = Math.max(3, S(p.w)), ph = Math.max(3, S(p.h));
      if (p.w >= 12 && p.h >= 12) { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), Math.max(pw, ph) / 2, 0, Math.PI * 2); ctx.fill(); }
      else { roundRect(ctx, X(p.x), Y(p.y) - ph / 2, pw, ph, ph / 2); ctx.fill(); }
    }
    ctx.restore();

    // enemy
    const e = scene.enemies[0];
    if (e) {
      const ex = X(e.x), ey = Y(e.y), ew = S(e.w), eh = S(e.h);
      // telegraph pulse while winding up a shot
      if (e.windup > 0) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const pulse = 0.4 + 0.4 * Math.abs(Math.sin(perfNow() / 90));
        ctx.fillStyle = `rgba(255,120,80,${pulse})`;
        ctx.beginPath(); ctx.arc(ex + ew / 2, ey - 8, 6 + pulse * 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = e.hitFlash > 0 ? "#fff" : (e.color || "#e0725a");
      roundRect(ctx, ex, ey, ew, eh, 5); ctx.fill();
      // eye marks facing
      ctx.fillStyle = "#0b0f18";
      const eyeX = e.facing >= 0 ? ex + ew - 8 : ex + 4;
      ctx.fillRect(eyeX, ey + eh * 0.28, 4, 4);
      // health bar
      const hpFrac = Math.max(0, e.health / e.maxHealth);
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(ex, ey - 7, ew, 4);
      ctx.fillStyle = hpFrac > 0.5 ? "#57c98a" : hpFrac > 0.25 ? "#e0a24e" : "#e05a5a";
      ctx.fillRect(ex, ey - 7, ew * hpFrac, 4);
    }

    // sparks
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const s of sparks) { ctx.fillStyle = alpha(s.color, Math.max(0, s.life / s.max)); ctx.fillRect(X(s.x) - 1.5, Y(s.y) - 1.5, 3, 3); }
    ctx.restore();

    ctx.fillStyle = "rgba(190,200,215,0.55)"; ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("live preview — real AI", 8, 14);
  }

  // ---- loop ---------------------------------------------------------------
  let running = true, raf = null, last = perfNow();
  function loop() {
    if (!running) return;
    const now = perfNow();
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05; // clamp so a paused tab doesn't teleport the sim
    step(dt); draw();
    raf = req(loop);
  }

  renderRanged();
  renderSaved();
  rebuildEnemy();
  refresh();
  draw(); // one synchronous frame (also makes headless mount verifiable)
  raf = req(loop);

  return {
    dispose() {
      running = false;
      if (raf != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    },
  };
}

// ---- small helpers --------------------------------------------------------

const UNIT_BY_PATH = {};
for (const f of [...CORE_FIELDS, ...RANGED_FIELDS]) UNIT_BY_PATH[f.path] = f.unit ? " " + f.unit : "";
UNIT_BY_PATH["loot.value"] = " §";
function unitFor(path) { return UNIT_BY_PATH[path] || ""; }

function fieldRow(f, value) {
  return `
    <div class="cfg-row wd-row">
      <div class="cfg-meta"><span class="cfg-label">${f.label}</span></div>
      <div class="cfg-control">
        <input type="range" data-field="${f.path}" min="${f.min}" max="${f.max}" step="${f.step}" value="${value}" />
        <output class="cfg-val" data-val-for="${f.path}">${fmt(value)}${f.unit ? " " + f.unit : ""}</output>
      </div>
    </div>`;
}

function get(o, p) { return p.split(".").reduce((a, k) => (a == null ? a : a[k]), o); }
function set(o, p, v) { const ks = p.split("."); const last = ks.pop(); let t = o; for (const k of ks) t = t[k]; t[last] = v; }
function slug(s, fallback) { return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || fallback; }
function fmt(n) { return Number.isInteger(n) ? String(n) : Number(n).toFixed(2); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function perfNow() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
function req(fn) { return typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : null; }
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function alpha(color, a) {
  if (typeof color === "string" && color.startsWith("#")) {
    let c = color.replace("#", ""); if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`;
  }
  return color;
}
