// ---------------------------------------------------------------------------
// WEAPON DESIGNER — a GUI tool in the editor's Tools tab.
//
// Compose a weapon from primitives (fire params + a projectile + damage/burn
// effects), watch it fire against a dummy in a live preview, and see its cost
// checked against a tech-tier budget in real time. Export produces content.js-
// shaped JSON (per-effect cost + budgetSpent filled in) that drops straight
// into WEAPONS or the armory — the same shape the Player2 generator will emit.
//
// createWeaponDesigner(container, onBack) → { dispose() }
// ---------------------------------------------------------------------------

import { effectCost, dps, validate, finalizeWeapon, TIERS } from "../../game/weaponcost.js";

// Numeric fields rendered as sliders (path into the weapon object).
const FIELDS = [
  { path: "fireRate", label: "Fire rate", min: 0.5, max: 15, step: 0.5, unit: "/s" },
  { path: "spread", label: "Spread", min: 0, max: 0.15, step: 0.005, unit: "rad" },
  { path: "projectile.speed", label: "Projectile speed", min: 200, max: 1600, step: 20, unit: "px/s" },
  { path: "projectile.w", label: "Projectile width", min: 4, max: 28, step: 1, unit: "px" },
  { path: "projectile.h", label: "Projectile height", min: 2, max: 20, step: 1, unit: "px" },
  { path: "projectile.life", label: "Projectile life", min: 0.3, max: 2.5, step: 0.1, unit: "s" },
];

export function createWeaponDesigner(container, onBack) {
  const weapon = {
    id: "custom_weapon",
    name: "Custom Weapon",
    fireMode: "projectile",
    fireRate: 6,
    auto: true,
    spread: 0.02,
    projectile: { speed: 850, w: 12, h: 5, color: "#ffd36a", life: 1 },
    effects: [{ kind: "damage", amount: 10 }],
  };
  let tierId = TIERS[1].id;

  // ---- render static shell -----------------------------------------------
  container.innerHTML = `
    <div class="wd">
      <div class="wd-head">
        <button class="btn btn-ghost" data-wd="back">← Tools</button>
        <input class="wd-name" data-wd="name" value="${weapon.name}" spellcheck="false" />
        <span class="wd-id" id="wd-id"></span>
      </div>
      <div class="wd-grid">
        <div class="wd-form">
          <h3 class="wd-h">Fire</h3>
          <div class="cfg-row wd-row">
            <div class="cfg-meta"><span class="cfg-label">Automatic</span><span class="cfg-help">Hold to fire vs. one shot per press.</span></div>
            <div class="cfg-control"><button type="button" role="switch" class="toggle${weapon.auto ? " on" : ""}" data-wd="auto"><span class="knob"></span></button></div>
          </div>
          ${FIELDS.slice(0, 2).map((f) => fieldRow(f, get(weapon, f.path))).join("")}

          <h3 class="wd-h">Projectile</h3>
          <div class="cfg-row wd-row">
            <div class="cfg-meta"><span class="cfg-label">Colour</span></div>
            <div class="cfg-control"><input type="color" data-wd="color" value="${weapon.projectile.color}" /></div>
          </div>
          ${FIELDS.slice(2).map((f) => fieldRow(f, get(weapon, f.path))).join("")}

          <h3 class="wd-h">Effects</h3>
          <div class="wd-effects" id="wd-effects"></div>
          <div class="wd-addfx">
            <button class="btn btn-alt" data-wd="add-damage">+ Damage</button>
            <button class="btn btn-alt" data-wd="add-burn">+ Burn</button>
          </div>
        </div>

        <div class="wd-side">
          <canvas class="wd-canvas" id="wd-canvas" width="380" height="170"></canvas>
          <div class="wd-readout">
            <div class="wd-stat"><span>DPS</span><b id="wd-dps">0</b></div>
            <div class="wd-stat"><span>Budget</span><b id="wd-spent">0</b></div>
          </div>
          <div class="wd-budget">
            <label class="wd-tier">Tier
              <select data-wd="tier">${TIERS.map((t) => `<option value="${t.id}"${t.id === tierId ? " selected" : ""}>${t.name} (${t.budget})</option>`).join("")}</select>
            </label>
            <div class="wd-meter"><span class="wd-meter-fill" id="wd-meter"></span></div>
            <div class="wd-verdict" id="wd-verdict"></div>
          </div>
          <div class="wd-export">
            <button class="btn" data-wd="copy">Copy JSON</button>
            <span class="ed-msg" id="wd-msg"></span>
            <textarea class="ed-json wd-json" id="wd-json" spellcheck="false" readonly></textarea>
          </div>
        </div>
      </div>
    </div>`;

  const $ = (sel) => container.querySelector(sel);
  const canvas = $("#wd-canvas");
  const ctx = canvas.getContext("2d");

  // ---- effects list (rebuilt when effects are added/removed) --------------
  function renderEffects() {
    $("#wd-effects").innerHTML = weapon.effects.length
      ? weapon.effects.map((fx, i) => effectRow(fx, i)).join("")
      : `<p class="wd-empty">No effects — this weapon does nothing yet.</p>`;
  }

  function effectRow(fx, i) {
    const cost = Math.round(effectCost(fx));
    const params =
      fx.kind === "damage"
        ? sliderMini("amount", fx.amount, 1, 60, 1, i)
        : sliderMini("dps", fx.dps, 1, 30, 1, i) + sliderMini("duration", fx.duration, 0.5, 8, 0.5, i);
    return `
      <div class="wd-effect" data-idx="${i}">
        <div class="wd-effect-top">
          <select data-wd="fx-kind" data-idx="${i}">
            <option value="damage"${fx.kind === "damage" ? " selected" : ""}>Damage</option>
            <option value="burn"${fx.kind === "burn" ? " selected" : ""}>Burn (DoT)</option>
          </select>
          <span class="wd-fx-cost" data-fx-cost="${i}">cost ${cost}</span>
          <button class="wd-fx-x" data-wd="fx-remove" data-idx="${i}" title="Remove">×</button>
        </div>
        <div class="wd-effect-params">${params}</div>
      </div>`;
  }

  // ---- refresh derived readouts (no input rebuild, keeps slider focus) ----
  function refresh() {
    weapon.id = slug(weapon.name);
    $("#wd-id").textContent = weapon.id;
    const tier = TIERS.find((t) => t.id === tierId);
    const v = validate(weapon, tier.budget);
    $("#wd-dps").textContent = Math.round(dps(weapon));
    $("#wd-spent").textContent = `${v.spent} / ${tier.budget}`;
    const pct = Math.min(100, (v.spent / tier.budget) * 100);
    const meter = $("#wd-meter");
    meter.style.width = pct + "%";
    meter.style.background = v.legal ? "linear-gradient(90deg,#57c98a,#7ad7ff)" : "linear-gradient(90deg,#e0a24e,#e05a5a)";
    const verdict = $("#wd-verdict");
    verdict.textContent = v.legal ? `✓ Legal at ${tier.name}` : `✕ Over budget by ${v.over}`;
    verdict.className = "wd-verdict " + (v.legal ? "ok" : "bad");
    for (const el of container.querySelectorAll("[data-fx-cost]"))
      el.textContent = "cost " + Math.round(effectCost(weapon.effects[+el.dataset.fxCost]));
    $("#wd-json").value = JSON.stringify(finalizeWeapon(weapon), null, 2);
  }

  // ---- events -------------------------------------------------------------
  container.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.wd === "name") { weapon.name = t.value; refresh(); return; }
    if (t.dataset.wd === "color") { weapon.projectile.color = t.value; refresh(); return; }
    if (t.dataset.field) {
      set(weapon, t.dataset.field, Number(t.value));
      const out = container.querySelector(`[data-val-for="${t.dataset.field}"]`);
      if (out) out.textContent = fmt(Number(t.value));
      refresh();
      return;
    }
    if (t.dataset.fxField) {
      weapon.effects[+t.dataset.idx][t.dataset.fxField] = Number(t.value);
      const out = container.querySelector(`[data-val-for="fx-${t.dataset.idx}-${t.dataset.fxField}"]`);
      if (out) out.textContent = fmt(Number(t.value));
      refresh();
    }
  });

  container.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.wd === "tier") { tierId = t.value; refresh(); }
    else if (t.dataset.wd === "fx-kind") {
      const i = +t.dataset.idx;
      weapon.effects[i] = t.value === "burn" ? { kind: "burn", dps: 6, duration: 3 } : { kind: "damage", amount: 10 };
      renderEffects();
      refresh();
    }
  });

  container.addEventListener("click", (e) => {
    const el = e.target.closest("[data-wd]");
    if (!el) return;
    switch (el.dataset.wd) {
      case "back": onBack(); break;
      case "auto": {
        weapon.auto = el.classList.toggle("on");
        refresh();
        break;
      }
      case "add-damage": weapon.effects.push({ kind: "damage", amount: 10 }); renderEffects(); refresh(); break;
      case "add-burn": weapon.effects.push({ kind: "burn", dps: 6, duration: 3 }); renderEffects(); refresh(); break;
      case "fx-remove": weapon.effects.splice(+el.dataset.idx, 1); renderEffects(); refresh(); break;
      case "copy": copyJSON(); break;
    }
  });

  function copyJSON() {
    const text = $("#wd-json").value;
    const msg = $("#wd-msg");
    const done = (ok) => { msg.textContent = ok ? "Copied to clipboard." : "Copy failed — select the text below."; msg.className = "ed-msg " + (ok ? "ok" : "bad"); };
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
      else done(false);
    } catch { done(false); }
  }

  // ---- live preview -------------------------------------------------------
  const pv = { proj: [], sparks: [], nums: [], flame: 0, spawn: 0 };
  const shooterX = 46, dummyX = canvas.width - 60;

  function step(dt) {
    // spawn on the weapon's cadence
    pv.spawn -= dt;
    if (pv.spawn <= 0) {
      pv.spawn = 1 / Math.max(0.5, weapon.fireRate);
      const p = weapon.projectile;
      pv.proj.push({ x: shooterX + 18, y: canvas.height / 2, vx: p.speed, w: p.w, h: p.h, color: p.color });
      if (pv.proj.length > 40) pv.proj.shift();
    }
    for (const p of pv.proj) p.x += p.vx * dt;
    // hits
    for (const p of pv.proj) {
      if (!p.hit && p.x + p.w >= dummyX) {
        p.hit = true;
        burst(dummyX, canvas.height / 2, p.color, 8);
        const dmg = weapon.effects.filter((f) => f.kind === "damage").reduce((s, f) => s + f.amount, 0);
        if (dmg) pv.nums.push({ x: dummyX, y: canvas.height / 2 - 10, vy: -34, life: 0.8, txt: "-" + dmg, color: "#fff" });
        const burn = weapon.effects.find((f) => f.kind === "burn");
        if (burn) { pv.flame = burn.duration; pv.nums.push({ x: dummyX + 14, y: canvas.height / 2, vy: -26, life: 0.9, txt: "🔥" + burn.dps, color: "#ff9b4a" }); }
      }
    }
    pv.proj = pv.proj.filter((p) => p.x < dummyX + 8 && !p.hit);
    for (const s of pv.sparks) { s.vy += 400 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    pv.sparks = pv.sparks.filter((s) => s.life > 0);
    for (const n of pv.nums) { n.y += n.vy * dt; n.life -= dt; }
    pv.nums = pv.nums.filter((n) => n.life > 0);
    if (pv.flame > 0) pv.flame -= dt;
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 120;
      pv.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + Math.random() * 0.2, max: 0.45, color });
    }
  }

  function draw() {
    const W = canvas.width, H = canvas.height, cy = H / 2;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c1424"); g.addColorStop(1, "#16232a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(120,160,210,0.12)"; ctx.fillRect(0, cy + 34, W, 2); // floor line

    // shooter
    ctx.fillStyle = "#7ad7ff"; roundRect(ctx, shooterX - 10, cy - 22, 22, 44, 4); ctx.fill();
    ctx.fillStyle = "#0b0f18"; ctx.fillRect(shooterX + 8, cy - 3, 16, 5); // barrel

    // dummy target (+ flame if burning)
    ctx.fillStyle = "#3a4657"; roundRect(ctx, dummyX, cy - 26, 26, 52, 5); ctx.fill();
    ctx.fillStyle = "#26303d"; ctx.fillRect(dummyX + 6, cy - 14, 14, 4);
    if (pv.flame > 0) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) {
        const fx = dummyX + 4 + i * 8 + Math.sin(perfNow() / 60 + i) * 2, fh = 8 + Math.random() * 10;
        ctx.fillStyle = `rgba(255,${(120 + Math.random() * 80) | 0},40,0.6)`;
        ctx.beginPath(); ctx.moveTo(fx - 3, cy - 22); ctx.lineTo(fx, cy - 22 - fh); ctx.lineTo(fx + 3, cy - 22); ctx.fill();
      }
      ctx.restore();
    }

    // projectiles
    ctx.save(); ctx.shadowBlur = 10;
    for (const p of pv.proj) {
      ctx.shadowColor = p.color; ctx.fillStyle = p.color;
      if (p.w >= 12 && p.h >= 12) { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(p.w, p.h) / 2, 0, Math.PI * 2); ctx.fill(); }
      else { roundRect(ctx, p.x, p.y - p.h / 2, p.w, p.h, p.h / 2); ctx.fill(); }
    }
    ctx.restore();

    // sparks
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const s of pv.sparks) { ctx.fillStyle = alpha(s.color, Math.max(0, s.life / s.max)); ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3); }
    ctx.restore();

    // floating damage numbers
    ctx.textAlign = "center"; ctx.font = "bold 13px system-ui, sans-serif";
    for (const n of pv.nums) { ctx.globalAlpha = Math.max(0, n.life / 0.9); ctx.fillStyle = n.color; ctx.fillText(n.txt, n.x, n.y); }
    ctx.globalAlpha = 1; ctx.textAlign = "left";

    ctx.fillStyle = "rgba(190,200,215,0.55)"; ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("live preview", 8, 14);
  }

  // ---- loop ---------------------------------------------------------------
  let running = true, raf = null, last = perfNow();
  function loop() {
    if (!running) return;
    const now = perfNow();
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    step(dt); draw();
    raf = req(loop);
  }

  renderEffects();
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

function sliderMini(field, value, min, max, step, idx) {
  const labels = { amount: "Amount", dps: "DPS", duration: "Duration" };
  return `
    <label class="wd-mini">${labels[field] || field}
      <span class="wd-mini-ctl">
        <input type="range" data-fx-field="${field}" data-idx="${idx}" min="${min}" max="${max}" step="${step}" value="${value}" />
        <output class="cfg-val" data-val-for="fx-${idx}-${field}">${fmt(value)}</output>
      </span>
    </label>`;
}

function get(o, p) { return p.split(".").reduce((a, k) => (a == null ? a : a[k]), o); }
function set(o, p, v) { const ks = p.split("."); const last = ks.pop(); let t = o; for (const k of ks) t = t[k]; t[last] = v; }
function slug(s) { return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "custom_weapon"; }
function fmt(n) { return Number.isInteger(n) ? String(n) : Number(n).toFixed(2); }
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
