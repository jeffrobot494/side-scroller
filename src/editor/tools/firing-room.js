// ---------------------------------------------------------------------------
// FIRING ROOM — a weapons test range in the editor's Tools tab.
//
// Pick any arsenal or custom weapon and fire it — at infinitely-respawning
// dummies, or at a wave of REAL EnemySpec enemies (the built-in mission roster
// or the Enemy Designer's saved library), driven by the real spec runtime.
// Driven by the same combat code the live mission runs: fire() (pellets, spread,
// magazine), updateProjectiles (gravity, pierce, homing, walls), updateSpecEnemy
// (AI), and shared effect resolution. So what you see here is exactly what the
// weapon does in a mission. Platforms let you test arc and elevation; an Aim
// slider shows how the Aim stat tightens spread.
//
// createFiringRoom(container, onBack) → { dispose() }
// ---------------------------------------------------------------------------

import { ARSENAL } from "../../game/arsenal.js";
import { listCustomWeapons, enemySpecMap } from "../../game/customcontent.js";
import { MISSION_ENEMY_SPECS } from "../../game/enemyspecs.js";
import { dps, weaponCost, tierFor } from "../../game/weaponcost.js";
import { Soldier, stepActor, startReload, tickReload } from "../../mission/entities.js";
import { fire, aimAccuracy } from "../../mission/ai.js";
import { updateProjectiles, updateStatuses } from "../../mission/combat.js";
import { drawProjectile } from "../../mission/render.js";
import { normalizeSpec } from "../../game/enemyspec/normalize.js";
import {
  instantiate as instantiateSpec, updateSpecEnemy,
  applyDamage as specDamage, killEntity as specKill, collidables,
} from "../../mission/enemyspec/runtime.js";
import { drawSpecEnemy } from "../../mission/enemyspec/render.js";
import { MissionInput } from "../../mission/input.js";
import { config } from "../../game/config.js";

export function createFiringRoom(container, onBack) {
  const customs = listCustomWeapons();
  const byId = {};
  for (const w of [...ARSENAL, ...customs]) byId[w.id] = w;
  // Wave enemies are all EnemySpec now: the built-in mission roster plus the
  // Enemy Designer's saved library. Every option is a "spec:<id>" value driven
  // by the spec runtime. `specSource` resolves an id back to its raw spec.
  const builtinSpecs = MISSION_ENEMY_SPECS;
  const savedSpecs = Object.values(enemySpecMap());
  const specSource = {};
  for (const s of [...builtinSpecs, ...savedSpecs]) specSource[s.id] = s;

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
        <label class="lg-field">Targets
          <select data-fr="targets">
            <option value="dummies">Dummies (respawn)</option>
            <option value="enemies">Enemies (waves)</option>
          </select>
        </label>
        <label class="lg-field" id="fr-enemyfield" style="display:none">Enemy
          <select data-fr="enemytype">
            <optgroup label="Mission enemies">${builtinSpecs.map((s) => `<option value="spec:${s.id}">${escapeHtml(s.name || s.id)}</option>`).join("")}</optgroup>
            ${savedSpecs.length ? `<optgroup label="Designed (EnemySpec)">${savedSpecs.map((s) => `<option value="spec:${s.id}">${escapeHtml(s.name || s.id)}</option>`).join("")}</optgroup>` : ""}
          </select>
        </label>
        <label class="lg-field">Count <output id="fr-countval">4</output>
          <input type="range" data-fr="count" min="1" max="8" step="1" value="4" />
        </label>
        <label class="lg-field">Aim <output id="fr-aimval">8</output>
          <input type="range" data-fr="aim" min="1" max="10" step="1" value="8" />
        </label>
        <label class="lg-field">Mode
          <select data-fr="mode">
            <option value="auto">Auto-fire range</option>
            <option value="manual">Manual — drive it</option>
          </select>
        </label>
        <label class="lg-field lg-boss">Moving dummies
          <button type="button" role="switch" class="toggle" data-fr="moving"><span class="knob"></span></button>
        </label>
        <button class="btn" data-fr="wave" id="fr-wave" style="display:none">Respawn wave</button>
        <button class="btn btn-alt" data-fr="reset">Reset</button>
      </div>

      <canvas class="lg-canvas fr-canvas" id="fr-canvas" width="960" height="420"></canvas>

      <div class="lg-out">
        <div class="lg-report" id="fr-stats"></div>
        <div class="fr-effects" id="fr-effects"></div>
      </div>
    </div>`;

  const $ = (s) => container.querySelector(s);
  const canvas = $("#fr-canvas");
  const ctx = canvas.getContext("2d");

  const state = { weapon: ARSENAL[0], count: 4, aim: 8, mode: "auto", moving: false, targets: "dummies", enemyType: builtinSpecs[0] && `spec:${builtinSpecs[0].id}` };
  const input = new MissionInput();
  const particles = [];
  const stats = { dealt: 0, elapsed: 0 };

  // ---- scene (1:1 with the canvas) ---------------------------------------
  const W = canvas.width, H = canvas.height;
  const GROUND = H - 40;
  const world = { gravity: 1600, width: W, height: H };

  // Ground + back wall + a few perches to test elevation and arc.
  const PERCHES = [
    { x: 470, y: 300, w: 150, h: 16 },
    { x: 700, y: 220, w: 150, h: 16 },
    { x: 330, y: 190, w: 130, h: 16 },
  ];
  // Stand-points across the ground and on top of each perch. Enemies/dummies
  // spawn here (feet on the surface, y = surfaceY - height — the levelgen rule).
  const ANCHORS = [
    { x: 430, y: GROUND }, { x: 610, y: GROUND }, { x: 790, y: GROUND }, { x: 900, y: GROUND },
    { x: 545, y: 300 }, { x: 775, y: 220 }, { x: 395, y: 190 },
  ];

  let scene, shooter;
  let specRoots = []; // live EnemySpec trees when a designed enemy is the target

  function buildScene() {
    shooter = new Soldier({ id: "you", name: "Range", callsign: "RNG", stats: { health: 8, aim: state.aim, speed: 6 } }, state.weapon, 46, GROUND - 46);
    shooter.magsLeft = Infinity; // weapon-test sandbox: never run dry
    scene = {
      world,
      platforms: [{ x: 0, y: GROUND, w: W, h: 40 }, { x: W - 6, y: 0, w: 8, h: H }, ...PERCHES],
      soldiers: [shooter],
      enemies: [],
      projectiles: [],
    };
    spawnTargets();
    stats.dealt = 0;
    stats.elapsed = 0;
  }

  // (Re)populate scene.enemies with the current target set.
  function spawnTargets() {
    scene.enemies = [];
    specRoots = [];

    // Enemy waves are EnemySpec trees driven by the real runtime; their
    // damageable parts land in scene.enemies each frame via collidables().
    if (state.targets === "enemies") {
      const sp = specSource[String(state.enemyType).replace(/^spec:/, "")];
      if (sp) {
        const n = normalizeSpec(sp);
        // Flyers (gravity 0) anchor their motion at the spawn point — put them
        // up in the air, not feet-on-the-floor like grounded enemies.
        const flying = n.root.body.gravity === 0;
        for (let i = 0; i < state.count; i++) {
          const a = ANCHORS[i % ANCHORS.length];
          const y = flying ? Math.max(24, a.y - n.root.body.h - 140) : a.y - n.root.body.h;
          specRoots.push(instantiateSpec(n, a.x, y));
        }
        scene.enemies = specRoots.flatMap((r) => collidables(r));
      }
      return;
    }

    for (let i = 0; i < state.count; i++) {
      const a = ANCHORS[i % ANCHORS.length];
      scene.enemies.push(makeDummy(a.x, a.y));
    }
  }

  function makeDummy(x, surfaceY) {
    const h = 46;
    return { kind: "enemy", x, y: surfaceY - h, w: 32, h, vx: 0, vy: 0, onGround: false, alive: true,
      health: 70, maxHealth: 70, hitFlash: 0, facing: -1, color: "#c98a5a", slow: null, burn: null,
      _home: x, _surfaceY: surfaceY, _respawn: 0, _dir: 1 };
  }
  function resetDummy(d) {
    d.health = d.maxHealth; d.alive = true; d.x = d._home; d.y = d._surfaceY - d.h;
    d.vx = 0; d.vy = 0; d.slow = null; d.burn = null; d.hitFlash = 0; d._respawn = 0;
  }

  function respawnShooter() {
    shooter.health = shooter.maxHealth; shooter.alive = true;
    shooter.x = 46; shooter.y = GROUND - shooter.h; shooter.vx = 0; shooter.vy = 0;
    shooter.burn = null; shooter.slow = null; shooter.reloading = 0;
    shooter.ammo = shooter.weapon && shooter.weapon.magazine ? shooter.weapon.magazine : Infinity;
    shooter.magsLeft = Infinity; // weapon-test sandbox: never run dry
  }

  const cctx = {
    friendlyFire: false,
    damageMult: 1,
    damage(t, a, o) {
      // EnemySpec parts route through the spec runtime so links/signals/phases fire.
      if (t.kind === "spec") {
        if (a > 0 && o && o.kind === "soldier") stats.dealt += a;
        specDamage(t.root, t, a, o, scene, cctx);
        return;
      }
      t.health -= a; t.hitFlash = 0.12;
      // Only credit the player's on-target damage (enemy shots hitting the shooter don't count).
      if (a > 0 && t.kind === "enemy") stats.dealt += a;
      if (t.health <= 0 && t.alive) cctx.kill(t, o);
    },
    kill(t, o) {
      if (!t.alive) return;
      if (t.kind === "spec") { specKill(t.root, t, o, scene, cctx); return; }
      t.alive = false;
      burst(t.x + t.w / 2, t.y + t.h / 2, t.color || "#c9d4e6", 16, 240);
      if (t.kind === "soldier") { respawnShooter(); return; } // test bed: no permadeath
      if (t._respawn !== undefined) t._respawn = 0.7; // dummies respawn; wave enemies stay down
    },
    spark(x, y, c, n, s) { burst(x, y, c, n, s); },
    burst(x, y, c, n, s) { burst(x, y, c, n, s); },
  };

  function burst(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = spd * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.3 + Math.random() * 0.3, max: 0.6, color });
    }
  }

  // Resolve manual aim for the shooter from config.aimMode (mouse/gamepad/auto);
  // "keyboard" keeps the old aim-up scheme. Sets aimVec/aimUp/facing.
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
    else { dx = src.x - (shooter.x + shooter.w / 2); dy = src.y - (shooter.y + shooter.h * 0.42); }
    const len = Math.hypot(dx, dy);
    if (len < 0.001) { shooter.aimVec = null; return; }
    shooter.aimVec = { x: dx / len, y: dy / len };
    shooter.facing = shooter.aimVec.x >= 0 ? 1 : -1;
  }

  // ---- simulation --------------------------------------------------------
  function step(dt) {
    stats.elapsed += dt;
    input.pollGamepad();
    if (shooter.fireCooldown > 0) shooter.fireCooldown -= dt;
    if (shooter.muzzleFlash > 0) shooter.muzzleFlash -= dt;
    tickReload(shooter, dt);

    const acc = aimAccuracy(state.aim);

    if (state.mode === "manual") {
      // Player-driven, reusing the real mission controls.
      shooter.setCrouch(input.isDown("crouch"));
      const move = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
      resolveAim();
      shooter.applyMovement(dt, move, input.isDown("jump"));
      if (input.justPressed("reload")) startReload(shooter);
      const wantFire = shooter.weapon.auto ? input.isDown("fire") : input.justPressed("fire");
      if (wantFire) fire(scene, shooter, shooter.fireDir(), "player", dt, acc);
      stepActor(shooter, dt, world, scene.platforms);
    } else {
      // Stationary auto-fire range: auto-reload so the DPS readout keeps flowing.
      if (shooter.crouched) shooter.setCrouch(false);
      shooter.aimVec = null; shooter.aimUp = false;
      if (shooter.ammo <= 0 && shooter.reloading <= 0) startReload(shooter);
      fire(scene, shooter, { x: 1, y: 0 }, "player", dt, acc);
    }

    // Designed EnemySpec waves: the runtime drives them; refresh the target list
    // (parts die, seekers spawn) every frame.
    for (const r of specRoots) if (r.alive) updateSpecEnemy(r, dt, scene, cctx);
    if (specRoots.length) scene.enemies = specRoots.flatMap((r) => (r.alive ? collidables(r) : []));

    // Non-spec targets are the respawning dummies (spec parts are updated above).
    for (const d of scene.enemies) {
      if (d.kind === "spec") continue;
      if (!d.alive) {
        if (d._respawn !== undefined) { d._respawn -= dt; if (d._respawn <= 0) resetDummy(d); }
        continue;
      }
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

    // Wave cleared? enable the Respawn button.
    if (state.targets === "enemies") {
      const anyAlive = specRoots.length ? specRoots.some((r) => r.alive) : scene.enemies.some((e) => e.alive);
      const btn = $("#fr-wave");
      if (btn) btn.disabled = anyAlive;
    }

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
    // perches
    for (const p of PERCHES) {
      ctx.fillStyle = "#26384a"; ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = "#6fd3ff"; ctx.fillRect(p.x, p.y, p.w, 2);
      ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(p.x, p.y + p.h - 2, p.w, 2);
    }

    // shooter
    if (shooter.alive) {
      ctx.fillStyle = shooter.hitFlash > 0 ? "#fff" : "#7ad7ff"; roundRect(ctx, shooter.x, shooter.y, shooter.w, shooter.h, 5); ctx.fill();
      // barrel points along aim
      const gd = shooter.fireDir(); const gl = Math.hypot(gd.x, gd.y) || 1;
      const bx = shooter.x + shooter.w / 2, by = shooter.y + shooter.h * 0.42;
      ctx.strokeStyle = "#0b0f18"; ctx.lineWidth = 5; ctx.beginPath();
      ctx.moveTo(bx, by); ctx.lineTo(bx + (gd.x / gl) * 18, by + (gd.y / gl) * 18); ctx.stroke();
      if (shooter.muzzleFlash > 0) { ctx.fillStyle = shooter.muzzleColor || "#ffd36a"; ctx.beginPath(); ctx.arc(bx + (gd.x / gl) * 20, by + (gd.y / gl) * 20, 4, 0, Math.PI * 2); ctx.fill(); }
      const hf = Math.max(0, shooter.health / shooter.maxHealth);
      if (hf < 1) { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(shooter.x, shooter.y - 7, shooter.w, 4); ctx.fillStyle = "#7ad7ff"; ctx.fillRect(shooter.x, shooter.y - 7, shooter.w * hf, 4); }
    }

    // designed EnemySpec targets (parts, telegraphs, spawned entities)
    for (const r of specRoots) if (r.alive) drawSpecEnemy(ctx, r, stats.elapsed);

    // targets
    for (const d of scene.enemies) {
      if (d.kind === "spec") continue; // drawn above
      if (!d.alive) continue;
      const slowed = d.slow && d.slow.time > 0;
      ctx.fillStyle = d.hitFlash > 0 ? "#fff" : slowed ? "#7fb8dc" : (d.color || "#c98a5a");
      roundRect(ctx, d.x, d.y, d.w, d.h, 5); ctx.fill();
      // winding-up telegraph for real shooters
      if (d.windup > 0) { ctx.strokeStyle = "rgba(255,90,90,0.7)"; ctx.lineWidth = 2; roundRect(ctx, d.x - 3, d.y - 3, d.w + 6, d.h + 6, 5); ctx.stroke(); }
      ctx.fillStyle = "#0b0f18"; ctx.fillRect(d.x + 6, d.y + 12, d.w - 12, 3);
      if (d.burn) drawFlames(ctx, d.x, d.y, d.w);
      const frac = Math.max(0, d.health / d.maxHealth);
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(d.x, d.y - 7, d.w, 4);
      ctx.fillStyle = frac > 0.5 ? "#57c98a" : frac > 0.25 ? "#e0a24e" : "#e05a5a";
      ctx.fillRect(d.x, d.y - 7, d.w * frac, 4);
    }

    // projectiles (shared renderer — shape + gravity aware)
    for (const p of scene.projectiles) drawProjectile(ctx, p);

    // particles
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const p of particles) { ctx.fillStyle = alpha(p.color, Math.max(0, p.life / p.max)); ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
    ctx.restore();

    ctx.fillStyle = "rgba(190,200,215,0.5)"; ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("real combat — fire() + combat.js", 8, 14);

    if (state.mode === "manual") {
      ctx.fillStyle = "rgba(7,11,19,0.72)"; ctx.fillRect(0, H - 18, W, 18);
      ctx.fillStyle = "rgba(200,210,224,0.85)"; ctx.font = "10px system-ui, sans-serif"; ctx.textAlign = "center";
      const aimHint = config.aimMode === "keyboard" ? "W aim up" : "MOUSE aim";
      ctx.fillText(`A / D move   ${aimHint}   S crouch   SPACE jump   J / CLICK fire   R reload`, W / 2, H - 5);
      ctx.textAlign = "left";
    }
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
    const ammo = shooter.reloading > 0 ? "reloading…" : (w.magazine ? `${Math.max(0, shooter.ammo)}/${w.magazine}` : "∞");
    $("#fr-stats").innerHTML =
      tile("Budget", weaponCost(w)) +
      tile("Theory DPS", Math.round(dps(w))) +
      tile("On-target DPS", obs) +
      tile("Ammo", ammo) +
      tile("Fire rate", w.fireRate + "/s") +
      tile("Auto", w.auto ? "yes" : "semi");
  }

  function refreshEffects() {
    $("#fr-effects").innerHTML = (state.weapon.effects || []).map((fx) => `<span class="fr-chip">${fxLabel(fx)}</span>`).join("");
  }

  // ---- events ------------------------------------------------------------
  function setMode(mode) {
    state.mode = mode;
    if (mode === "manual") input.enable(canvas); // canvas → mouse aim + click fire
    else input.disable();
    buildScene(); // fresh shooter: standing, facing right, at the start mark
  }

  function setTargets(kind) {
    state.targets = kind;
    $("#fr-enemyfield").style.display = kind === "enemies" ? "" : "none";
    $("#fr-wave").style.display = kind === "enemies" ? "" : "none";
    buildScene();
  }

  container.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.fr === "weapon") { state.weapon = byId[t.value] || ARSENAL[0]; buildScene(); refreshEffects(); }
    else if (t.dataset.fr === "mode") setMode(t.value);
    else if (t.dataset.fr === "targets") setTargets(t.value);
    else if (t.dataset.fr === "enemytype") { state.enemyType = t.value; buildScene(); }
  });
  container.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.fr === "count") { state.count = +t.value; $("#fr-countval").textContent = t.value; buildScene(); }
    else if (t.dataset.fr === "aim") { state.aim = +t.value; $("#fr-aimval").textContent = t.value; if (shooter) shooter.data.stats.aim = state.aim; }
  });
  container.addEventListener("click", (e) => {
    const el = e.target.closest("[data-fr]");
    if (!el) return;
    switch (el.dataset.fr) {
      case "back": onBack(); break;
      case "moving": state.moving = el.classList.toggle("on"); break;
      case "wave": spawnTargets(); break;
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
      input.disable(); // remove key handlers so they don't leak into the editor
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
