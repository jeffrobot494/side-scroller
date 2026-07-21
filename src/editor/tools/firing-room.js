// ---------------------------------------------------------------------------
// FIRING ROOM — a weapons test range in the editor's Tools tab.
//
// Pick any arsenal or custom weapon and watch a shooter auto-fire it at a row of
// respawning dummies, driven by the REAL combat code: the same fire() (pellets,
// spread), updateProjectiles (pierce, homing, walls), and effect resolution
// (damage, burn, slow, knockback, explode, chain) the live mission runs. So what
// you see here is exactly what the weapon does in a mission. Live readout of the
// weapon's tier, budget, theoretical DPS, and observed DPS on target.
//
// createFiringRoom(container, onBack) → { dispose() }
// ---------------------------------------------------------------------------

import { ARSENAL } from "../../game/arsenal.js";
import { listCustomWeapons } from "../../game/customcontent.js";
import { dps, weaponCost, tierFor } from "../../game/weaponcost.js";
import { Soldier } from "../../mission/entities.js";
import { stepActor } from "../../mission/entities.js";
import { fire } from "../../mission/ai.js";
import { updateProjectiles, updateStatuses } from "../../mission/combat.js";

export function createFiringRoom(container, onBack) {
  const customs = listCustomWeapons();
  const byId = {};
  for (const w of [...ARSENAL, ...customs]) byId[w.id] = w;

  const opt = (w) => `<option value="${w.id}">${escapeHtml(w.name)} — ${weaponCost(w)}</option>`;
  const tierGroup = (n) => `<optgroup label="Tier ${["I", "II", "III"][n - 1]}">${ARSENAL.filter((w) => w.tier === n).map(opt).join("")}</optgroup>`;

  container.innerHTML = `
    <div class="wd fr">
      <div class="wd-head">
        <button class="btn btn-ghost" data-fr="back">← Tools</button>
        <span class="wd-name" style="min-width:auto">Firing Room</span>
        <span class="wd-id" id="fr-tier"></span>
      </div>

      <div class="fr-params">
        <label class="lg-field">Weapon
          <select data-fr="weapon">
            ${tierGroup(1)}${tierGroup(2)}${tierGroup(3)}
            ${customs.length ? `<optgroup label="Custom">${customs.map(opt).join("")}</optgroup>` : ""}
          </select>
        </label>
        <label class="lg-field">Dummies <output id="fr-countval">4</output>
          <input type="range" data-fr="count" min="1" max="6" step="1" value="4" />
        </label>
        <label class="lg-field lg-boss">Auto-fire
          <button type="button" role="switch" class="toggle on" data-fr="auto"><span class="knob"></span></button>
        </label>
        <label class="lg-field lg-boss">Moving
          <button type="button" role="switch" class="toggle" data-fr="moving"><span class="knob"></span></button>
        </label>
        <button class="btn btn-alt" data-fr="reset">Reset</button>
      </div>

      <canvas class="lg-canvas fr-canvas" id="fr-canvas" width="840" height="240"></canvas>

      <div class="lg-out">
        <div class="lg-report" id="fr-stats"></div>
        <div class="fr-effects" id="fr-effects"></div>
      </div>
    </div>`;

  const $ = (s) => container.querySelector(s);
  const canvas = $("#fr-canvas");
  const ctx = canvas.getContext("2d");

  const state = { weapon: ARSENAL[0], count: 4, auto: true, moving: false };
  const particles = [];
  const stats = { dealt: 0, elapsed: 0 };

  // ---- scene (1:1 with the canvas) ---------------------------------------
  const W = canvas.width, H = canvas.height;
  const GROUND = H - 40;
  const world = { gravity: 1600, width: W, height: H };
  let scene, shooter;

  function buildScene() {
    shooter = new Soldier({ id: "you", name: "Range", callsign: "RNG", stats: { health: 8, aim: 8, speed: 6 } }, state.weapon, 46, GROUND - 46);
    const dummies = [];
    const gap = Math.min(96, (W - 120 - 360) / Math.max(1, state.count - 1 || 1));
    for (let i = 0; i < state.count; i++) dummies.push(makeDummy(360 + i * (state.count > 1 ? gap : 0)));
    scene = {
      world,
      platforms: [{ x: 0, y: GROUND, w: W, h: 40 }, { x: W - 6, y: 0, w: 8, h: H }], // ground + back wall
      soldiers: [shooter],
      enemies: dummies,
      projectiles: [],
    };
    stats.dealt = 0;
    stats.elapsed = 0;
  }

  function makeDummy(x) {
    return { kind: "enemy", x, y: GROUND - 46, w: 32, h: 46, vx: 0, vy: 0, onGround: false, alive: true,
      health: 70, maxHealth: 70, hitFlash: 0, facing: -1, color: "#c98a5a", slow: null, burn: null, _home: x, _respawn: 0, _dir: 1 };
  }
  function resetDummy(d) {
    d.health = d.maxHealth; d.alive = true; d.x = d._home; d.y = GROUND - 46;
    d.vx = 0; d.vy = 0; d.slow = null; d.burn = null; d.hitFlash = 0; d._respawn = 0;
  }

  const cctx = {
    friendlyFire: false,
    damageMult: 1,
    damage(t, a) {
      t.health -= a; t.hitFlash = 0.12; if (a > 0) stats.dealt += a;
      if (t.health <= 0 && t.alive) cctx.kill(t);
    },
    kill(t) { if (!t.alive) return; t.alive = false; burst(t.x + t.w / 2, t.y + t.h / 2, t.color, 16, 240); t._respawn = 0.7; },
    spark(x, y, c, n, s) { burst(x, y, c, n, s); },
    burst(x, y, c, n, s) { burst(x, y, c, n, s); },
  };

  function burst(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = spd * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.3 + Math.random() * 0.3, max: 0.6, color });
    }
  }

  // ---- simulation --------------------------------------------------------
  function step(dt) {
    stats.elapsed += dt;
    if (shooter.fireCooldown > 0) shooter.fireCooldown -= dt;
    if (shooter.muzzleFlash > 0) shooter.muzzleFlash -= dt;
    if (state.auto) fire(scene, shooter, { x: 1, y: 0 }, "player", dt, 1);

    for (const d of scene.enemies) {
      if (!d.alive) { d._respawn -= dt; if (d._respawn <= 0) resetDummy(d); continue; }
      if (state.moving) {
        if (d.x < d._home - 60) d._dir = 1; else if (d.x > d._home + 60) d._dir = -1;
        d.vx = 70 * d._dir;
      } else {
        d.vx *= 0.85; // ease knockback back to rest
      }
      stepActor(d, dt, world, scene.platforms);
    }

    updateProjectiles(scene, dt, cctx);
    updateStatuses(scene, dt, cctx);

    for (const p of particles) { p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);

    refreshStats();
  }

  // ---- rendering ---------------------------------------------------------
  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c1424"); g.addColorStop(1, "#16232a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // range markings
    ctx.strokeStyle = "rgba(120,160,210,0.08)"; ctx.lineWidth = 1;
    for (let x = 120; x < W; x += 120) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GROUND); ctx.stroke(); }
    // ground + wall
    ctx.fillStyle = "#22303f"; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = "#6fd3ff"; ctx.fillRect(0, GROUND, W, 2);
    ctx.fillStyle = "#1a2735"; ctx.fillRect(W - 6, 0, 6, GROUND);

    // shooter
    ctx.fillStyle = "#7ad7ff"; roundRect(ctx, shooter.x, shooter.y, shooter.w, shooter.h, 5); ctx.fill();
    ctx.fillStyle = "#0b0f18"; ctx.fillRect(shooter.x + shooter.w - 2, shooter.y + shooter.h * 0.42, 18, 5);
    if (shooter.muzzleFlash > 0) { ctx.fillStyle = shooter.muzzleColor || "#ffd36a"; ctx.beginPath(); ctx.arc(shooter.x + shooter.w + 16, shooter.y + shooter.h * 0.42 + 2, 4, 0, Math.PI * 2); ctx.fill(); }

    // dummies
    for (const d of scene.enemies) {
      if (!d.alive) continue;
      const slowed = d.slow && d.slow.time > 0;
      ctx.fillStyle = d.hitFlash > 0 ? "#fff" : slowed ? "#7fb8dc" : d.color;
      roundRect(ctx, d.x, d.y, d.w, d.h, 5); ctx.fill();
      ctx.fillStyle = "#0b0f18"; ctx.fillRect(d.x + 6, d.y + 12, d.w - 12, 3);
      if (d.burn) drawFlames(ctx, d.x, d.y, d.w);
      // health bar
      const frac = Math.max(0, d.health / d.maxHealth);
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(d.x, d.y - 7, d.w, 4);
      ctx.fillStyle = frac > 0.5 ? "#57c98a" : frac > 0.25 ? "#e0a24e" : "#e05a5a";
      ctx.fillRect(d.x, d.y - 7, d.w * frac, 4);
    }

    // projectiles
    ctx.save(); ctx.shadowBlur = 8;
    for (const p of scene.projectiles) {
      ctx.shadowColor = p.color; ctx.fillStyle = p.color;
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      if (p.w >= 12 && p.h >= 12) { ctx.beginPath(); ctx.arc(cx, cy, Math.max(p.w, p.h) / 2, 0, Math.PI * 2); ctx.fill(); }
      else { roundRect(ctx, p.x, cy - p.h / 2, p.w, p.h, p.h / 2); ctx.fill(); }
    }
    ctx.restore();

    // particles
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const p of particles) { ctx.fillStyle = alpha(p.color, Math.max(0, p.life / p.max)); ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
    ctx.restore();

    ctx.fillStyle = "rgba(190,200,215,0.5)"; ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("real combat — fire() + combat.js", 8, 14);
  }

  function drawFlames(ctx, x, y, w) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const fx = x + (i + 0.5) * (w / 3) + Math.sin(perfNow() / 60 + i) * 2, fh = 6 + Math.random() * 8;
      ctx.fillStyle = `rgba(255,${(120 + Math.random() * 80) | 0},40,0.55)`;
      ctx.beginPath(); ctx.moveTo(fx - 3, y + 2); ctx.lineTo(fx, y - fh); ctx.lineTo(fx + 3, y + 2); ctx.fill();
    }
    ctx.restore();
  }

  // ---- readouts ----------------------------------------------------------
  function refreshStats() {
    const w = state.weapon;
    const tier = tierFor(w);
    $("#fr-tier").textContent = `${w.name} · ${tier ? tier.name : "over budget"}`;
    const obs = stats.elapsed > 0.4 ? Math.round(stats.dealt / stats.elapsed) : 0;
    const tile = (label, val) => `<div class="lg-tile"><span>${label}</span><b>${val}</b></div>`;
    $("#fr-stats").innerHTML =
      tile("Budget", weaponCost(w)) +
      tile("Theory DPS", Math.round(dps(w))) +
      tile("On-target DPS", obs) +
      tile("Fire rate", w.fireRate + "/s") +
      tile("Auto", w.auto ? "yes" : "semi");
  }

  function refreshEffects() {
    $("#fr-effects").innerHTML = (state.weapon.effects || []).map((fx) => `<span class="fr-chip">${fxLabel(fx)}</span>`).join("");
  }

  // ---- events ------------------------------------------------------------
  container.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.fr === "weapon") { state.weapon = byId[t.value] || ARSENAL[0]; buildScene(); refreshEffects(); }
  });
  container.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.fr === "count") { state.count = +t.value; $("#fr-countval").textContent = t.value; buildScene(); }
  });
  container.addEventListener("click", (e) => {
    const el = e.target.closest("[data-fr]");
    if (!el) return;
    switch (el.dataset.fr) {
      case "back": onBack(); break;
      case "auto": state.auto = el.classList.toggle("on"); break;
      case "moving": state.moving = el.classList.toggle("on"); break;
      case "reset": buildScene(); break;
    }
  });

  // ---- loop --------------------------------------------------------------
  let running = true, raf = null, last = perfNow();
  function loop() {
    if (!running) return;
    const now = perfNow();
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    step(dt); draw();
    raf = req(loop);
  }

  buildScene();
  refreshEffects();
  refreshStats();
  draw(); // one synchronous frame (also makes headless mount verifiable)
  raf = req(loop);

  return {
    dispose() {
      running = false;
      if (raf != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    },
  };
}

// ---- helpers --------------------------------------------------------------
function fxLabel(fx) {
  switch (fx.kind) {
    case "damage": return `dmg ${fx.amount}`;
    case "burn": return `burn ${fx.dps}/${fx.duration}s`;
    case "slow": return `slow ×${fx.factor} ${fx.duration}s`;
    case "knockback": return `knock ${fx.force}`;
    case "explode": return `explode ${fx.amount} r${fx.radius}`;
    case "chain": return `chain ${fx.amount}×${fx.jumps}`;
    case "pierce": return `pierce ${fx.count}`;
    case "pellets": return `pellets ${fx.count}`;
    case "homing": return "homing";
    default: return fx.kind;
  }
}
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
