// ---------------------------------------------------------------------------
// AIM LAB — a feel test for candidate Aim mechanics, in the editor's Tools tab.
//
// Drive one soldier across a long range of moving targets and try Aim as a
// base-spread curve, as recoil control, and against weak points — each one
// switchable, so any combination can be felt in isolation or together. A camera
// switch (1/2/3) shows the range at the game's framing, ×3 and ×5 the view
// distance.
//
// Nothing here changes the game. The shot still goes through the real fire()
// (cooldown, magazine, pellets, sound) and the real updateProjectiles(); the lab
// only chooses the direction: it samples the whole cone itself and hands fire()
// a clone of the weapon with its own spread zeroed. Weak points are resolved
// from the projectile's path at impact (see flushPending), so combat.js is
// untouched too.
//
// createAimLab(container, onBack) → { dispose() }
// ---------------------------------------------------------------------------

import { ARSENAL } from "../../game/arsenal.js";
import { listCustomWeapons } from "../../game/customcontent.js";
import { Soldier, stepActor, startReload, tickReload } from "../../mission/entities.js";
import { fire } from "../../mission/ai.js";
import { updateProjectiles, updateStatuses } from "../../mission/combat.js";
import { drawProjectile } from "../../mission/render.js";
import { MissionInput } from "../../mission/input.js";
import { solveCamera, parseCanvasSize, DESIGN_W } from "../../mission/camera.js";
import { audio } from "../../audio/engine.js";
import { config } from "../../game/config.js";

// ---- the candidate models (pure, exported for the tests) -------------------

/** The camera presets: view distance × the game's framing. */
export const VIEW_MULTS = [1, 3, 5];

/**
 * Aim's share of the cone, in radians.
 *   game  — today's aimAccuracy: linear, clamped, zero from Aim 10 up
 *   curve — base × falloff^(aim−1): every point shrinks it, never reaches zero
 *   off   — Aim has no say; the weapon's own spread only
 */
export function aimSpreadTerm(aim, model, base, falloff) {
  if (model === "off") return 0;
  if (model === "curve") return base * Math.pow(falloff, Math.max(0, aim - 1));
  const a = (aim - 1) / 9;
  return (1 - (a < 0 ? 0 : a > 1 ? 1 : a)) * base;
}

/** The cone half-width. Uniform adds its terms (as fire() does); Gaussian adds them in quadrature. */
export function coneOf(weaponSpread, aimTerm, bloom, shape) {
  return shape === "gaussian" ? Math.hypot(weaponSpread, aimTerm, bloom) : weaponSpread + aimTerm + bloom;
}

/**
 * One shot's angular offset for a cone. Uniform: anywhere in ±cone.
 * Gaussian: σ = cone/2, so ~95% of shots land inside the same cone; tails cut at 3σ.
 */
export function sampleOffset(cone, shape, rng = Math.random) {
  if (!(cone > 0)) return 0;
  if (shape === "gaussian") {
    let g;
    do {
      let u = 0;
      while (u === 0) u = rng();
      g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
    } while (Math.abs(g) > 3);
    return (g * cone) / 2;
  }
  return (rng() * 2 - 1) * cone;
}

/**
 * One step of recoil recovery. `hold` is the time left before recovery starts;
 * a shot resets it to the full delay. Only the part of `dt` past the hold decays
 * the recoil, so recovery starts on time whatever the frame rate.
 * Returns { recoil, hold }.
 */
export function recoverStep(recoil, hold, dt, rate) {
  const active = Math.max(0, dt - Math.max(0, hold));
  return { recoil: recoil * Math.exp(-rate * active), hold: Math.max(0, hold - dt) };
}

/** Aim's multiplier on recoil kick: falloff^(aim−1). No clamp. */
export function kickScale(aim, falloff) {
  return Math.pow(falloff, Math.max(0, aim - 1));
}

/**
 * Does projectile `p`, moving along its velocity, pass through `box`? A swept
 * slab test of p's centre over [back px behind, ahead px past], against `box`
 * grown by p's half-size — the same box-vs-box rule overlaps() uses, extended
 * along the path so a shot that enters a body's edge still finds the vital
 * point it was heading for.
 */
export function sweptHits(p, box, back, ahead) {
  const sp = Math.hypot(p.vx, p.vy) || 1;
  const ux = p.vx / sp, uy = p.vy / sp;
  const ox = p.x + p.w / 2 - ux * back, oy = p.y + p.h / 2 - uy * back;
  const len = back + ahead;
  const axes = [
    [ux * len, ox, box.x - p.w / 2, box.x + box.w + p.w / 2],
    [uy * len, oy, box.y - p.h / 2, box.y + box.h + p.h / 2],
  ];
  let t0 = 0, t1 = 1;
  for (const [d, o, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let a = (lo - o) / d, b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  return true;
}

// ---- targets ---------------------------------------------------------------
// Sizes follow the roster the Aim analysis measured against (husk ~26 tall,
// drone ~24, humanoid 44–46). `weak` is local to a target facing RIGHT and is
// mirrored when it faces left, so a bruiser's pack is always on its back.

const TYPES = {
  walker:  { label: "Walker",  w: 32, h: 46, hp: 60,  color: "#c98a5a", speed: 70,  range: 170, pause: [0.2, 1.0], weak: { dx: 8,  dy: 0, w: 16, h: 12 } },
  runner:  { label: "Runner",  w: 30, h: 26, hp: 40,  color: "#d86a6a", speed: 210, range: 280, pause: [0.1, 0.4], weak: { dx: 20, dy: 3, w: 10, h: 10 } },
  drone:   { label: "Drone",   w: 26, h: 22, hp: 30,  color: "#9a8ad8", speed: 90,  range: 200, dash: 420, flying: true, weak: { dx: 9, dy: 7, w: 8, h: 8 } },
  bruiser: { label: "Bruiser", w: 46, h: 48, hp: 160, color: "#8fa46a", speed: 45,  range: 130, pause: [0.8, 1.6], weak: { dx: 0, dy: 8, w: 12, h: 24 } },
};
const MIXES = {
  mixed: ["walker", "runner", "drone", "walker", "bruiser", "drone"],
  walker: ["walker"], runner: ["runner"], drone: ["drone"], bruiser: ["bruiser"],
};

const WORLD_W = 8000;
const GROUND = 500; // the world is 540 tall, as in missions (camera.js)
const START_X = 200;
const PERCHES = [
  { x: 520, y: GROUND - 90, w: 140, h: 16 },
  { x: 760, y: GROUND - 170, w: 140, h: 16 },
  { x: 1000, y: GROUND - 250, w: 160, h: 16 },
];

export function createAimLab(container, onBack) {
  const customs = listCustomWeapons();
  const byId = {};
  for (const w of [...ARSENAL, ...customs]) byId[w.id] = w;

  const state = {
    weapon: byId.carbine || ARSENAL[0], // standard issue on enlistment (state.js)
    view: 0, aim: 5,
    // Aim → spread
    spreadModel: "game", shape: "uniform", aimBase: Number(config.aimSpread) || 0.12, falloff: 0.8,
    // Recoil
    recoil: "off", kick: 0.05, maxRecoil: 0.2, recover: 4, recoverDelay: 0, aimKick: true, kickFalloff: 0.85, aimRecover: true, recoverPerAim: 0.1,
    // Weak points
    weakOn: false, weakMult: 2.5, weakSize: 1,
    // Targets + range
    mix: "mixed", count: 16, speedMult: 1, far: 7200, rangeMult: 1, seed: 1,
    showCone: true, markers: true,
  };

  const f2 = (v) => Number(v).toFixed(2);
  const FMT = {
    aim: String, aimBase: (v) => `${f2(v)} rad`, falloff: f2, kick: (v) => Number(v).toFixed(3), maxRecoil: f2,
    recover: (v) => `${v}/s`, recoverDelay: (v) => `${Number(v).toFixed(2)}s`, kickFalloff: f2, recoverPerAim: (v) => `+${Math.round(v * 100)}%`,
    weakMult: (v) => `×${v}`, weakSize: (v) => `×${v}`, count: String, speedMult: (v) => `×${v}`,
    far: (v) => `${v}px`, rangeMult: (v) => `×${v}`,
  };
  const range = (key, label, min, max, step) =>
    `<label class="lg-field">${label} <output data-out="${key}">${FMT[key](state[key])}</output>
      <input type="range" data-al="${key}" min="${min}" max="${max}" step="${step}" value="${state[key]}" /></label>`;
  const select = (key, label, opts) =>
    `<label class="lg-field">${label}<select data-al="${key}">${opts.map(([v, t]) => `<option value="${v}"${state[key] === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>`;
  const toggle = (key, label) =>
    `<label class="lg-field lg-boss">${label}<button type="button" role="switch" class="toggle${state[key] ? " on" : ""}" data-al="${key}" data-toggle="1"><span class="knob"></span></button></label>`;
  const wopt = (w) => `<option value="${w.id}"${w === state.weapon ? " selected" : ""}>${escapeHtml(w.name)}</option>`;

  const { w: CW, h: CH } = parseCanvasSize(config.missionCanvas);

  container.innerHTML = `
    <div class="wd al">
      <div class="wd-head">
        <button class="btn btn-ghost" data-al="back">← Tools</button>
        <span class="wd-name" style="min-width:auto">Aim Lab</span>
        <span class="wd-id">feel test · nothing here changes the game</span>
      </div>

      <div class="al-bar">
        <label class="lg-field">Weapon
          <select data-al="weapon">
            ${[1, 2, 3].map((n) => `<optgroup label="Tier ${["I", "II", "III"][n - 1]}">${ARSENAL.filter((w) => w.tier === n).map(wopt).join("")}</optgroup>`).join("")}
            ${customs.length ? `<optgroup label="Custom">${customs.map(wopt).join("")}</optgroup>` : ""}
          </select>
        </label>
        ${range("aim", "Aim", 1, 20, 1)}
        <div class="lg-field">View <span class="al-views">${VIEW_MULTS.map((m, i) => `<button class="btn${i === state.view ? "" : " btn-ghost"}" data-al="view" data-view="${i}">${i + 1} · ×${m}</button>`).join("")}</span></div>
        <button class="btn btn-alt" data-al="resetStats">Reset stats</button>
        <button class="btn btn-alt" data-al="shuffle">Shuffle targets</button>
      </div>

      <canvas class="lg-canvas al-canvas" id="al-canvas" width="${CW}" height="${CH}" tabindex="0"></canvas>
      <div class="lg-report al-report" id="al-stats"></div>

      <div class="al-panels">
        <section class="al-panel">
          <h4>Aim → base spread</h4>
          ${select("spreadModel", "Aim model", [["game", "Game — linear, dead at 10"], ["curve", "Curve — ×falloff per point, no cap"], ["off", "Off — weapon spread only"]])}
          ${select("shape", "Distribution", [["uniform", "Uniform (today)"], ["gaussian", "Gaussian (σ = cone/2)"]])}
          ${range("aimBase", "Aim spread at Aim 1", 0, 0.4, 0.01)}
          ${range("falloff", "Curve falloff per Aim", 0.6, 0.98, 0.01)}
        </section>
        <section class="al-panel">
          <h4>Recoil</h4>
          ${select("recoil", "Style", [["off", "Off"], ["bloom", "Bloom — cone widens"], ["climb", "Climb — muzzle rises"], ["both", "Bloom + climb"]])}
          ${range("kick", "Kick per shot (rad)", 0, 0.4, 0.005)}
          ${range("maxRecoil", "Max (rad)", 0, 1.5, 0.01)}
          ${range("recoverDelay", "Recovery delay", 0, 2, 0.05)}
          ${range("recover", "Recovery rate", 0.5, 20, 0.5)}
          ${toggle("aimKick", "Aim shrinks kick")}
          ${range("kickFalloff", "Kick falloff per Aim", 0.6, 1, 0.01)}
          ${toggle("aimRecover", "Aim speeds recovery")}
          ${range("recoverPerAim", "Recovery per Aim", 0, 0.4, 0.02)}
        </section>
        <section class="al-panel">
          <h4>Weak points</h4>
          ${toggle("weakOn", "Weak points on")}
          ${range("weakMult", "Weak damage", 1, 5, 0.25)}
          ${range("weakSize", "Weak size", 0.5, 2, 0.1)}
          <p class="al-note">Walker: head · Runner: front eye · Drone: core · Bruiser: pack on its back.</p>
        </section>
        <section class="al-panel">
          <h4>Targets &amp; range</h4>
          ${select("mix", "Targets", Object.keys(MIXES).map((k) => [k, k === "mixed" ? "Mixed" : TYPES[k].label + "s"]))}
          ${range("count", "Count", 1, 40, 1)}
          ${range("speedMult", "Speed", 0, 2, 0.1)}
          ${range("far", "Farthest target", 1000, 7800, 100)}
          ${range("rangeMult", "Projectile range", 1, 8, 0.5)}
          ${toggle("showCone", "Show cone")}
          ${toggle("markers", "Target markers when zoomed out")}
        </section>
      </div>
    </div>`;

  const $ = (s) => container.querySelector(s);
  const canvas = $("#al-canvas");
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d");
  const input = new MissionInput();
  input.enable(canvas);

  const world = { gravity: 1600, width: WORLD_W, height: 540 };
  const platforms = [{ x: 0, y: GROUND, w: WORLD_W, h: 40 }, ...PERCHES];
  const particles = [];
  const popups = [];
  const pending = []; // damage waiting for its impact point (flushPending)
  let flying = []; // this shooter's projectiles still in the air
  const rec = { bloom: 0, climb: 0, hold: 0 }; // hold: seconds before recovery starts
  const stats = { shots: 0, hits: 0, weak: 0, recent: [], farthest: 0, last: 0 };
  let scene, shooter, cam = { x: 0, y: 0 }, time = 0;

  // ---- setup --------------------------------------------------------------
  function labWeapon() {
    const w = state.weapon;
    // The lab owns the cone, so fire() gets the weapon with spread zeroed. The
    // pellet arc stays with fire(): it is the pattern, not inaccuracy.
    return { ...w, spread: 0, projectile: { ...w.projectile, life: (w.projectile.life || 1) * state.rangeMult } };
  }

  function buildScene() {
    shooter = new Soldier({ id: "you", name: "Lab", callsign: "LAB", stats: { health: 8, aim: state.aim, speed: 6 } }, labWeapon(), START_X, GROUND - 46);
    shooter.magsLeft = Infinity;
    scene = {
      world, platforms, soldiers: [shooter], enemies: [], projectiles: [],
      sound: (cue, opts) => audio.play(cue, opts),
    };
    flying = [];
    rec.bloom = rec.climb = rec.hold = 0;
    spawnTargets();
  }

  function setWeapon() {
    const w = labWeapon();
    shooter.weapon = w;
    shooter.reloading = 0;
    shooter.ammo = w.magazine ? w.magazine : Infinity;
  }

  function spawnTargets() {
    const rnd = mulberry32(state.seed);
    const types = MIXES[state.mix] || MIXES.mixed;
    const near = START_X + 450;
    scene.enemies = [];
    for (let i = 0; i < state.count; i++) {
      const T = TYPES[types[i % types.length]];
      // Denser near the shooter, thinning out toward the far end.
      const f = Math.pow((i + 0.5) / state.count, 1.5);
      const home = Math.min(WORLD_W - 300, near + (state.far - near) * f + (rnd() - 0.5) * 120);
      const baseY = T.flying ? GROUND - T.h - 110 - rnd() * 380 : GROUND - T.h;
      scene.enemies.push({
        kind: "enemy", type: types[i % types.length], x: home, y: baseY, w: T.w, h: T.h, vx: 0, vy: 0,
        alive: true, health: T.hp, maxHealth: T.hp, hitFlash: 0, weakFlash: 0, facing: rnd() < 0.5 ? -1 : 1,
        slow: null, burn: null, onGround: false,
        home, baseY, phase: rnd() * 10, _dir: rnd() < 0.5 ? -1 : 1, _pause: 0, _dashT: 1 + rnd() * 3, _dashLeft: 0, _dashV: 0, _respawn: 0,
      });
    }
  }

  function revive(d) {
    d.alive = true; d.health = d.maxHealth; d.x = d.home; d.y = d.baseY; d.vx = d.vy = 0;
    d.burn = null; d.slow = null; d.hitFlash = 0; d.weakFlash = 0; d.shoveX = d.shoveY = 0;
  }

  // ---- damage + weak points ------------------------------------------------
  // combat.js calls ctx.damage() for every effect of a hit and then ctx.spark()
  // at the projectile's position. Damage to targets is held until that spark,
  // which carries the impact point: the projectile sitting exactly there is the
  // one that hit, and its path decides whether it went through the weak point.
  // Chain jumps spark at the jumped target's centre — no projectile there, so
  // they never count as weak hits.
  const cctx = {
    friendlyFire: false,
    damageMult: 1,
    damage(t, a, o) {
      if (t.kind === "enemy") pending.push({ t, a, o });
    },
    kill(t) {
      if (!t.alive || t.kind !== "enemy") return;
      t.alive = false;
      t._respawn = 1.2;
      burst(t.x + t.w / 2, t.y + t.h / 2, TYPES[t.type].color, 16, 240);
    },
    spark(x, y, c, n, s) {
      flushPending(x, y);
      burst(x, y, c, n, s);
    },
    burst(x, y, c, n, s) {
      burst(x, y, c, n, s);
    },
  };

  function flushPending(x, y) {
    if (!pending.length) return;
    const p = scene.projectiles.find((q) => !q.dead && q.x === x && q.y === y);
    for (const { t, a } of pending.splice(0)) {
      if (!t.alive) continue;
      let weak = false;
      if (p && state.weakOn) {
        const box = weakBox(t);
        const sp = Math.hypot(p.vx, p.vy);
        weak = box.w > 0 && box.h > 0 && sweptHits(p, box, sp * 0.05, t.w + t.h);
      }
      const amount = a * (weak ? state.weakMult : 1);
      t.health -= amount;
      t.hitFlash = 0.12;
      if (weak) t.weakFlash = 0.25;
      if (p) {
        popups.push({ x: p.x, y: p.y - 6, text: String(Math.round(amount)), color: weak ? "#ffe066" : "#e6edf6", big: weak, life: 0.7 });
        if (!p._labHit) {
          p._labHit = true;
          const d = Math.hypot(t.x + t.w / 2 - p._ox, t.y + t.h / 2 - p._oy);
          stats.last = Math.round(d);
          if (d > stats.farthest) stats.farthest = Math.round(d);
        }
        if (weak) p._labWeak = true;
      }
      if (t.health <= 0) cctx.kill(t);
    }
  }

  function weakBox(t) {
    const k = TYPES[t.type].weak, s = state.weakSize;
    const dx = t.facing >= 0 ? k.dx : t.w - k.dx - k.w;
    const cx = t.x + dx + k.w / 2, cy = t.y + k.dy + k.h / 2;
    const x0 = Math.max(t.x, cx - (k.w * s) / 2), x1 = Math.min(t.x + t.w, cx + (k.w * s) / 2);
    const y0 = Math.max(t.y, cy - (k.h * s) / 2), y1 = Math.min(t.y + t.h, cy + (k.h * s) / 2);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function burst(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = spd * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.3 + Math.random() * 0.3, max: 0.6, color });
    }
  }

  // ---- the shot -------------------------------------------------------------
  const bloomOn = () => state.recoil === "bloom" || state.recoil === "both";
  const climbOn = () => state.recoil === "climb" || state.recoil === "both";

  function cone() {
    const aimTerm = aimSpreadTerm(state.aim, state.spreadModel, state.aimBase, state.falloff);
    return coneOf(state.weapon.spread || 0, aimTerm, bloomOn() ? rec.bloom : 0, state.shape);
  }

  // Muzzle climb turns the barrel toward "up" for whichever way it points.
  function barrelDir() {
    const d = shooter.fireDir();
    const len = Math.hypot(d.x, d.y) || 1;
    const b = { x: d.x / len, y: d.y / len };
    return climbOn() && rec.climb ? rotate(b, (b.x >= 0 ? -1 : 1) * rec.climb) : b;
  }

  function tryFire(dt) {
    const dir = rotate(barrelDir(), sampleOffset(cone(), state.shape));
    const before = scene.projectiles.length;
    if (!fire(scene, shooter, dir, "player", dt, 1)) return;
    const ox = shooter.x + shooter.w / 2, oy = shooter.y + shooter.h * 0.42;
    for (const p of scene.projectiles.slice(before)) {
      p._ox = ox; p._oy = oy;
      flying.push(p);
      stats.shots++;
    }
    const s = state.aimKick ? kickScale(state.aim, state.kickFalloff) : 1;
    if (bloomOn()) rec.bloom = Math.min(state.maxRecoil, rec.bloom + state.kick * s);
    if (climbOn()) rec.climb = Math.min(state.maxRecoil, rec.climb + state.kick * s);
    rec.hold = state.recoverDelay; // every shot restarts the wait
  }

  function resolveAim() {
    if (config.aimMode === "keyboard") {
      shooter.aimVec = null;
      shooter.aimUp = input.isDown("aimUp") && !shooter.crouched;
      return;
    }
    shooter.aimUp = false;
    const src = input.aimSource("auto");
    if (!src) return; // hold the last aim
    const z = zoom();
    const mx = shooter.x + shooter.w / 2, my = shooter.y + shooter.h * 0.42;
    const dx = src.type === "stick" ? src.x : src.x / z + cam.x - mx;
    const dy = src.type === "stick" ? src.y : src.y / z + cam.y - my;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;
    shooter.aimVec = { x: dx / len, y: dy / len };
    shooter.facing = shooter.aimVec.x >= 0 ? 1 : -1;
  }

  // ---- simulation -----------------------------------------------------------
  function zoom() {
    const z = Number(config.missionZoom);
    return (Number.isFinite(z) && z > 0 ? z : 1) / VIEW_MULTS[state.view];
  }

  function step(dt) {
    time += dt;
    input.sample();
    if (shooter.fireCooldown > 0) shooter.fireCooldown -= dt;
    if (shooter.muzzleFlash > 0) shooter.muzzleFlash -= dt;
    tickReload(shooter, dt, scene);

    shooter.setCrouch(input.isDown("crouch"));
    const move = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
    resolveAim();
    shooter.applyMovement(dt, move, input.isDown("jump"));
    if (input.justPressed("reload")) startReload(shooter, scene);
    const wantFire = shooter.weapon.auto ? input.isDown("fire") : input.justPressed("fire");
    if (wantFire) tryFire(dt);
    stepActor(shooter, dt, world, platforms);

    const rate = state.recover * (state.aimRecover ? 1 + state.recoverPerAim * (state.aim - 1) : 1);
    const bloom = recoverStep(rec.bloom, rec.hold, dt, rate);
    rec.climb = recoverStep(rec.climb, rec.hold, dt, rate).recoil;
    rec.bloom = bloom.recoil;
    rec.hold = bloom.hold;

    for (const d of scene.enemies) updateTarget(d, dt);

    updateProjectiles(scene, dt, cctx);
    flushPending(NaN, NaN); // anything that never sparked (none expected) lands unmultiplied
    updateStatuses(scene, dt, cctx);

    // Score shots once they are finished: hit, weak hit, or gone.
    const live = new Set(scene.projectiles);
    flying = flying.filter((p) => {
      if (live.has(p) && !p.dead) return true;
      const outcome = p._labWeak ? 2 : p._labHit ? 1 : 0;
      if (outcome) stats.hits++;
      if (outcome === 2) stats.weak++;
      stats.recent.push(outcome);
      if (stats.recent.length > 40) stats.recent.shift();
      return false;
    });

    for (const p of particles) { p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
    for (const u of popups) { u.y -= 40 * dt; u.life -= dt; }
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i].life <= 0) popups.splice(i, 1);

    placeCamera();
  }

  // The mission's camera (camera.js) pins the 540px world to the canvas bottom.
  // Zoomed out that leaves the whole fight in a strip along the bottom edge, so
  // at ×3 and ×5 the lab lifts it by a fixed screen margin. ×1 is left exactly
  // as the game frames it.
  const ZOOMED_MARGIN = 70;
  function placeCamera() {
    const z = zoom();
    const viewW = CW / z, viewH = CH / z;
    cam = solveCamera(shooter, viewW, viewH, world);
    if (state.view > 0) cam.y += (ZOOMED_MARGIN * (CW / DESIGN_W)) / z;
    audio.setListener(cam.x + viewW / 2, viewW / DESIGN_W);
  }

  function updateTarget(d, dt) {
    const T = TYPES[d.type];
    if (!d.alive) {
      d._respawn -= dt;
      if (d._respawn <= 0) revive(d);
      return;
    }
    if (d.weakFlash > 0) d.weakFlash -= dt;
    d.phase += dt;
    const k = state.speedMult * (d.slow && d.slow.time > 0 ? d.slow.factor : 1);
    if (T.flying) {
      d.shoveX = d.shoveY = 0; // hovering: knockback does not apply
      let v = 0;
      if (k > 0) {
        if (d._dashLeft > 0) {
          d._dashLeft -= dt;
          v = d._dashV;
        } else {
          d._dashT -= dt;
          if (d._dashT <= 0) { d._dashV = (Math.random() < 0.5 ? -1 : 1) * T.dash; d._dashLeft = 0.45; d._dashT = 2.5 + Math.random() * 3; }
          v = d._dir * T.speed;
        }
        if (d.x < d.home - T.range) { d._dir = 1; if (v < 0) { d._dashLeft = 0; v = T.speed; } }
        else if (d.x > d.home + T.range) { d._dir = -1; if (v > 0) { d._dashLeft = 0; v = -T.speed; } }
      }
      d.vx = v * k;
      d.x += d.vx * dt;
      d.y = d.baseY + Math.sin(d.phase * 2.2) * 18 * Math.min(1, state.speedMult);
      if (d.vx) d.facing = d.vx > 0 ? 1 : -1;
      return;
    }
    if (k <= 0) d.vx = 0;
    else if (d._pause > 0) { d._pause -= dt; d.vx = 0; }
    else {
      d.vx = d._dir * T.speed * state.speedMult;
      if ((d._dir > 0 && d.x > d.home + T.range) || (d._dir < 0 && d.x < d.home - T.range)) {
        d._dir *= -1;
        d._pause = T.pause[0] + Math.random() * (T.pause[1] - T.pause[0]);
      }
    }
    if (d.vx) d.facing = d.vx > 0 ? 1 : -1;
    stepActor(d, dt, world, platforms);
  }

  // ---- rendering ------------------------------------------------------------
  function draw() {
    const z = zoom();
    const viewW = CW / z, viewH = CH / z;
    const px = 1 / z; // one screen pixel, in world units
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, "#0a1120"); g.addColorStop(1, "#16232a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);

    ctx.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z);

    // distance marks from the shooter: a faint line every 250px, labelled every 500
    const sx = shooter.x + shooter.w / 2;
    ctx.font = `${11 * px}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    for (let d = 250; sx + d < cam.x + viewW; d += 250) {
      const x = sx + d;
      if (x < cam.x) continue;
      ctx.fillStyle = d % 500 === 0 ? "rgba(120,160,210,0.12)" : "rgba(120,160,210,0.06)";
      ctx.fillRect(x, cam.y, px, GROUND - cam.y);
      if (d % 500 === 0) { ctx.fillStyle = "rgba(160,190,225,0.55)"; ctx.fillText(`${d}`, x, GROUND + 16 * px); }
    }
    ctx.textAlign = "left";

    ctx.fillStyle = "#22303f"; ctx.fillRect(0, GROUND, WORLD_W, Math.max(540, cam.y + viewH) - GROUND);
    ctx.fillStyle = "#6fd3ff"; ctx.fillRect(0, GROUND, WORLD_W, Math.max(2, px));
    for (const p of PERCHES) {
      ctx.fillStyle = "#26384a"; ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = "#6fd3ff"; ctx.fillRect(p.x, p.y, p.w, Math.max(2, px));
    }

    // cone
    const bd = barrelDir();
    const mx = shooter.x + shooter.w / 2, my = shooter.y + shooter.h * 0.42;
    if (state.showCone) {
      const c = cone();
      const reach = (shooter.weapon.projectile.speed || 800) * (shooter.weapon.projectile.life || 1);
      const l = rotate(bd, -c), r = rotate(bd, c);
      ctx.fillStyle = "rgba(122,215,255,0.06)";
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + l.x * reach, my + l.y * reach); ctx.lineTo(mx + r.x * reach, my + r.y * reach); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(122,215,255,0.28)"; ctx.lineWidth = px;
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + l.x * reach, my + l.y * reach); ctx.moveTo(mx, my); ctx.lineTo(mx + r.x * reach, my + r.y * reach); ctx.stroke();
    }

    // targets
    for (const d of scene.enemies) {
      if (!d.alive) continue;
      const T = TYPES[d.type];
      ctx.fillStyle = d.hitFlash > 0 ? "#fff" : T.color;
      roundRect(ctx, d.x, d.y, d.w, d.h, 4); ctx.fill();
      if (T.flying) { ctx.fillStyle = "#0b0f18"; ctx.fillRect(d.x - 4, d.y - 3, d.w + 8, 2); }
      if (state.weakOn) {
        const b = weakBox(d);
        ctx.fillStyle = d.weakFlash > 0 ? "#fff6c0" : "rgba(255,224,102,0.85)";
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
      const frac = Math.max(0, d.health / d.maxHealth);
      if (frac < 1) {
        const bh = Math.max(3, 3 * px);
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(d.x, d.y - bh - 3 * px, d.w, bh);
        ctx.fillStyle = frac > 0.5 ? "#57c98a" : frac > 0.25 ? "#e0a24e" : "#e05a5a";
        ctx.fillRect(d.x, d.y - bh - 3 * px, d.w * frac, bh);
      }
      if (state.markers && state.view > 0) {
        const cx = d.x + d.w / 2, top = d.y - 10 * px;
        ctx.fillStyle = "rgba(255,140,120,0.8)";
        ctx.beginPath(); ctx.moveTo(cx - 5 * px, top - 8 * px); ctx.lineTo(cx + 5 * px, top - 8 * px); ctx.lineTo(cx, top); ctx.closePath(); ctx.fill();
      }
    }

    // shooter
    ctx.fillStyle = "#7ad7ff";
    roundRect(ctx, shooter.x, shooter.y, shooter.w, shooter.h, 5); ctx.fill();
    ctx.strokeStyle = "#0b0f18"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + bd.x * 18, my + bd.y * 18); ctx.stroke();
    if (shooter.muzzleFlash > 0) { ctx.fillStyle = shooter.muzzleColor || "#ffd36a"; ctx.beginPath(); ctx.arc(mx + bd.x * 20, my + bd.y * 20, 4, 0, Math.PI * 2); ctx.fill(); }
    if (state.markers && state.view > 0) {
      ctx.strokeStyle = "rgba(122,215,255,0.9)"; ctx.lineWidth = 2 * px;
      ctx.beginPath(); ctx.arc(mx, shooter.y + shooter.h / 2, 16 * px, 0, Math.PI * 2); ctx.stroke();
    }

    // projectiles — `z` scales the glow, which canvas draws in screen pixels
    // and would otherwise stay full size at every zoom (as mission.js does)
    for (const p of scene.projectiles) drawProjectile(ctx, p, z);

    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const p of particles) { ctx.fillStyle = alpha(p.color, Math.max(0, p.life / p.max)); ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
    ctx.restore();
    for (const u of popups) {
      ctx.font = `${u.big ? "bold " : ""}${(u.big ? 13 : 10) * px}px system-ui, sans-serif`;
      ctx.fillStyle = alpha(u.color, Math.min(1, u.life / 0.3));
      ctx.fillText(u.text, u.x, u.y);
    }

    // HUD, in screen space at the HUD's authored scale
    const s = CW / DESIGN_W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const c = cone();
    ctx.fillStyle = "rgba(7,11,19,0.7)"; ctx.fillRect(8, 8, 360, 38);
    ctx.fillStyle = "#e6edf6"; ctx.font = "bold 12px system-ui, sans-serif";
    ctx.fillText(`VIEW ×${VIEW_MULTS[state.view]}   ·   AIM ${state.aim}   ·   cone ±${deg(c)}°  (±${Math.round(400 * Math.tan(c))}px @400)`, 16, 24);
    ctx.font = "10px system-ui, sans-serif"; ctx.fillStyle = "rgba(200,210,224,0.8)";
    ctx.fillText(`${label(state)}`, 16, 39);
    const aimHint = config.aimMode === "keyboard" ? "W aim up" : "MOUSE / STICK aim";
    ctx.fillStyle = "rgba(7,11,19,0.7)"; ctx.fillRect(DESIGN_W - 8 - 290, 8, 290, 38);
    ctx.fillStyle = "rgba(200,210,224,0.85)"; ctx.textAlign = "right";
    ctx.fillText(`A / D move   ${aimHint}   S crouch   SPACE jump`, DESIGN_W - 16, 23);
    ctx.fillText("J / CLICK fire   R reload   1 · 2 · 3 view   − / + Aim", DESIGN_W - 16, 38);
    ctx.textAlign = "left";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function label(st) {
    const parts = [st.spreadModel === "off" ? "aim spread off" : `${st.spreadModel} · ${st.shape}`];
    if (st.recoil !== "off") parts.push(`recoil ${st.recoil}`);
    if (st.weakOn) parts.push(`weak ×${st.weakMult}`);
    return parts.join("   ·   ");
  }

  // ---- readouts ---------------------------------------------------------------
  let statsT = 0;
  function refreshStats() {
    const tile = (l, v) => `<div class="lg-tile"><span>${l}</span><b>${v}</b></div>`;
    const r = stats.recent;
    const hits = r.filter((o) => o > 0).length, weak = r.filter((o) => o === 2).length;
    const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "—");
    const w = shooter.weapon;
    const aimTerm = aimSpreadTerm(state.aim, state.spreadModel, state.aimBase, state.falloff);
    $("#al-stats").innerHTML =
      tile("Hit % (last 40)", pct(hits, r.length)) +
      tile("Weak % of hits", state.weakOn ? pct(weak, hits) : "off") +
      tile("Cone", `±${deg(cone())}°`) +
      tile("Aim part", `±${deg(aimTerm)}°`) +
      tile("Weapon part", `±${deg(state.weapon.spread || 0)}°`) +
      tile("Bloom / climb", `${deg(rec.bloom)}° / ${deg(rec.climb)}°`) +
      tile("Recovers in", rec.hold > 0 ? `${rec.hold.toFixed(2)}s` : "now") +
      tile("Shots · hits · weak", `${stats.shots} · ${stats.hits} · ${stats.weak}`) +
      tile("Last / farthest hit", `${stats.last} / ${stats.farthest}px`) +
      tile("Reach", `${Math.round((w.projectile.speed || 0) * (w.projectile.life || 0))}px`) +
      tile("Ammo", shooter.reloading > 0 ? "reloading…" : w.magazine ? `${Math.max(0, shooter.ammo)}/${w.magazine}` : "∞");
  }

  function resetStats() {
    stats.shots = stats.hits = stats.weak = stats.farthest = stats.last = 0;
    stats.recent = [];
  }

  // ---- events -------------------------------------------------------------------
  function setView(i) {
    state.view = i;
    container.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("btn-ghost", Number(b.dataset.view) !== i));
  }

  // Aim from the keyboard (− / + or [ / ]) so it can change mid-burst.
  function setAim(v) {
    v = Math.max(1, Math.min(20, v));
    const el = container.querySelector('input[data-al="aim"]');
    if (el) el.value = v;
    setKnob("aim", v);
  }

  const RESPAWN_KEYS = new Set(["mix", "count", "far"]);
  function setKnob(key, raw) {
    const cur = state[key];
    state[key] = typeof cur === "number" ? Number(raw) : raw;
    const out = container.querySelector(`[data-out="${key}"]`);
    if (out && FMT[key]) out.textContent = FMT[key](state[key]);
    if (key === "aim" && shooter) shooter.data.stats.aim = state.aim;
    if (key === "rangeMult") setWeapon();
    if (RESPAWN_KEYS.has(key)) spawnTargets();
    if (key === "recoil") rec.bloom = rec.climb = 0;
  }

  container.addEventListener("input", (e) => {
    const k = e.target.dataset && e.target.dataset.al;
    if (k && k !== "weapon" && e.target.type === "range") setKnob(k, e.target.value);
  });
  container.addEventListener("change", (e) => {
    const k = e.target.dataset && e.target.dataset.al;
    if (!k) return;
    if (k === "weapon") { state.weapon = byId[e.target.value] || state.weapon; setWeapon(); resetStats(); }
    else if (e.target.tagName === "SELECT") setKnob(k, e.target.value);
  });
  container.addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest("[data-al]");
    if (!el) return;
    const k = el.dataset.al;
    if (el.dataset.toggle) { state[k] = el.classList.toggle("on"); if (k === "weakOn") resetStats(); return; }
    if (k === "back") onBack();
    else if (k === "view") setView(Number(el.dataset.view));
    else if (k === "resetStats") resetStats();
    else if (k === "shuffle") { state.seed = (state.seed * 7919 + 13) % 100003; spawnTargets(); }
  });
  // Clicking the range takes focus off the panel, so SPACE jumps instead of
  // pressing whichever button was last clicked.
  canvas.addEventListener("mousedown", () => canvas.focus && canvas.focus());

  const onKey = (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" && t.type !== "range")) return;
    const m = /^(?:Digit|Numpad)([123])$/.exec(e.code || "");
    if (m) setView(Number(m[1]) - 1);
    const da = { Minus: -1, NumpadSubtract: -1, BracketLeft: -1, Equal: 1, NumpadAdd: 1, BracketRight: 1 }[e.code];
    if (da) setAim(state.aim + da);
  };
  if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("keydown", onKey);

  // ---- loop ----------------------------------------------------------------------
  let running = true, raf = null, last = perfNow();
  function loop() {
    if (!running) return;
    const now = perfNow();
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    step(dt);
    draw();
    statsT -= dt;
    if (statsT <= 0) { statsT = 0.1; refreshStats(); }
    raf = req(loop);
  }

  buildScene();
  placeCamera();
  refreshStats();
  draw(); // one synchronous frame (also makes headless mount verifiable)
  raf = req(loop);

  return {
    dispose() {
      running = false;
      input.disable();
      audio.stopAll();
      if (typeof window !== "undefined" && window.removeEventListener) window.removeEventListener("keydown", onKey);
      if (raf != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    },
  };
}

// ---- helpers ---------------------------------------------------------------------
function rotate(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}
function deg(r) { return ((r * 180) / Math.PI).toFixed(1); }
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
    let c = color.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`;
  }
  return color;
}
