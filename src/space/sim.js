// ---------------------------------------------------------------------------
// SPACE PROTOTYPE — the simulation (tech/space-prototype.md).
//
// DOM-free: main.js feeds it one input object per fixed step, view.js reads the
// world it returns, test/space.test.mjs drives it with scripted input. It
// imports nothing — values the game has are COPIED (see the spec's Reuses) so
// neither side can break the other.
//
// Every gameplay draw goes through `world.rng`; cosmetic randomness lives in
// view.js. Same seed + same input trace = same world.
// ---------------------------------------------------------------------------

export const CFG = {
  step: 1 / 60, // fixed step, as Mission._frame
  maxFrame: 0.25, // frame clamp, as Mission._frame

  mapSize: 4000,
  restitution: 0.6,

  asteroidCount: 70,
  asteroidMinR: 30,
  asteroidMaxR: 160,
  asteroidMaxSpeed: 40,
  asteroidGap: 30,
  asteroidDensity: 2, // mass = (r / soldierR)² × density; a soldier is mass 1
  startClear: 420,

  soldierR: 18, // ≈ the game's 30×46 soldier
  turnRate: 4, // rad/s
  thrust: 500, // px/s²
  thrustCap: 420, // thrust cannot push speed past this; a bounce can

  // Copied from src/game/config.js defaults.
  aimSpread: 0.12,
  playerDamageMult: 1.25,
  knockbackDecay: 3000,
  soldierMagazines: 4,
  knockbackMaxV: 2450, // KNOCKBACK_MAX_V, src/mission/entities.js

  bulletPush: 60, // a round's impulse on a rock: Δv = bulletPush / mass (slight, P8)
  blastPush: 1500, // an explosion's peak impulse on a rock, falling off to its edge

  dummyCount: 5, // S2 target dummies; S4 replaces them with enemies
  dummyHp: 60,
  dummyR: 20,
  dummyRespawn: 2,
};

// ---- rng (mulberry32, the game's makeRng) ---------------------------------
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = (rng, lo, hi) => lo + rng() * (hi - lo);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---- weapons (copied from src/game/arsenal.js; `gravity` dropped) ----------
export const WEAPONS = {
  carbine: { id: "carbine", name: "Field Carbine", fireRate: 6, auto: true, spread: 0.02, magazine: 24, reloadTime: 1.8,
    projectile: { speed: 950, w: 12, h: 4, color: "#ffd36a", life: 1.0, shape: "bullet" },
    effects: [{ kind: "damage", amount: 14 }] },
  scattergun: { id: "scattergun", name: "Scattergun", fireRate: 1.6, auto: false, spread: 0.05, magazine: 6, reloadTime: 2.2,
    projectile: { speed: 820, w: 8, h: 4, color: "#ffbf6a", life: 0.5, shape: "pellet" },
    effects: [{ kind: "damage", amount: 9 }, { kind: "pellets", count: 5, spread: 0.13 }] },
  ember_jet: { id: "ember_jet", name: "Ember Jet", fireRate: 10, auto: true, spread: 0.06, magazine: 45, reloadTime: 2.0,
    projectile: { speed: 620, w: 10, h: 6, color: "#ff8a3a", life: 0.35, shape: "wave" },
    effects: [{ kind: "burn", dps: 8, duration: 1.2 }] },
  stun_pistol: { id: "stun_pistol", name: "Stun Pistol", fireRate: 3, auto: false, spread: 0.03, magazine: 10, reloadTime: 1.3,
    projectile: { speed: 780, w: 10, h: 4, color: "#8fd0ff", life: 0.9, shape: "bolt" },
    effects: [{ kind: "damage", amount: 6 }, { kind: "slow", factor: 0.5, duration: 1.5 }] },
  ripper: { id: "ripper", name: "Ripper", fireRate: 5, auto: true, spread: 0.02, magazine: 20, reloadTime: 1.7,
    projectile: { speed: 1050, w: 14, h: 4, color: "#c0f0ff", life: 1.1, shape: "bolt" },
    effects: [{ kind: "damage", amount: 10 }, { kind: "pierce", count: 1 }] },
  bulldog: { id: "bulldog", name: "Bulldog", fireRate: 2, auto: false, spread: 0.01, magazine: 8, reloadTime: 1.8,
    projectile: { speed: 880, w: 16, h: 6, color: "#ffd36a", life: 0.9, shape: "bullet" },
    effects: [{ kind: "damage", amount: 26 }, { kind: "knockback", force: 0.3 }] },
  grenade_launcher: { id: "grenade_launcher", name: "Grenade Launcher", fireRate: 1.6, auto: false, spread: 0.01, magazine: 4, reloadTime: 2.6,
    projectile: { speed: 700, w: 16, h: 12, color: "#c8d24a", life: 1.5, shape: "orb" },
    effects: [{ kind: "damage", amount: 10 }, { kind: "explode", amount: 40, radius: 150 }] },
  arc_tazer: { id: "arc_tazer", name: "Arc Tazer", fireRate: 6, auto: true, spread: 0.03, magazine: 24, reloadTime: 1.8,
    projectile: { speed: 940, w: 9, h: 4, color: "#8fd0ff", life: 0.8, shape: "bolt" },
    effects: [{ kind: "damage", amount: 9 }, { kind: "chain", amount: 8, jumps: 2, range: 240 }] },
  seeker: { id: "seeker", name: "Seeker", fireRate: 1.6, auto: true, spread: 0.02, magazine: 5, reloadTime: 2.8,
    projectile: { speed: 520, w: 12, h: 12, color: "#ff9be0", life: 2.2, shape: "missile" },
    effects: [{ kind: "damage", amount: 12 }, { kind: "explode", amount: 55, radius: 170 }, { kind: "homing", turn: 3 }] },
};

export const LOADOUT = ["carbine", "grenade_launcher", "arc_tazer"]; // P12

// ---- recruits (copied from src/game/soldiers.js) ---------------------------
export const RECRUITS = [
  { name: "Mara Vance", stats: { aim: 8, health: 6, speed: 5, nerve: 6 }, color: "#6fc3ff" },
  { name: "Kwame Osei", stats: { aim: 5, health: 7, speed: 4, nerve: 10 }, color: "#ffb45a" },
  { name: "Yuki Tanaka", stats: { aim: 7, health: 4, speed: 9, nerve: 4 }, color: "#b98cff" },
];

// soldierMaxHp: soldierBaseHp 15 + health × soldierHpPerHealth 2
export const soldierMaxHp = (stats) => 15 + stats.health * 2;

// aimAccuracy, src/mission/ai.js: Aim 1..10 → 0..1
export function aimAccuracy(aim) {
  const a = ((aim ?? 5) - 1) / 9;
  return a < 0 ? 0 : a > 1 ? 1 : a;
}

// ---- world ----------------------------------------------------------------
export function createWorld(seed = 1, opts = {}) {
  const rng = makeRng(seed);
  const S = CFG.mapSize;
  const world = {
    seed,
    rng,
    t: 0,
    size: S,
    asteroids: [],
    soldiers: [],
    enemies: [],
    projectiles: [],
    ctrl: 0,
    events: [], // one-shot happenings for the view (flashes); the view drains it
  };

  // Start near a random corner.
  const cx = rng() < 0.5 ? 0 : 1;
  const cy = rng() < 0.5 ? 0 : 1;
  world.start = {
    x: cx ? S - rand(rng, 400, 700) : rand(rng, 400, 700),
    y: cy ? S - rand(rng, 400, 700) : rand(rng, 400, 700),
  };

  const squad = opts.squad ?? 1;
  for (let i = 0; i < squad; i++) {
    const r = RECRUITS[i % RECRUITS.length];
    const weapon = (opts.weapons && opts.weapons[i]) || LOADOUT[i % LOADOUT.length];
    world.soldiers.push(makeSoldier(r, world.start.x + (i - (squad - 1) / 2) * 50, world.start.y, weapon));
  }

  placeAsteroids(world, opts.asteroids ?? CFG.asteroidCount);

  const dummies = opts.dummies ?? CFG.dummyCount;
  for (let i = 0; i < dummies; i++) {
    const a = (i / dummies) * Math.PI * 2 + rng() * 0.4;
    const d = rand(rng, 220, 340);
    world.enemies.push(makeDummy(world.start.x + Math.cos(a) * d, world.start.y + Math.sin(a) * d));
  }
  return world;
}

function makeSoldier(recruit, x, y, weaponId) {
  const maxHp = soldierMaxHp(recruit.stats);
  const weapon = WEAPONS[weaponId];
  return {
    kind: "soldier",
    team: "player",
    name: recruit.name,
    color: recruit.color,
    stats: { ...recruit.stats },
    x, y, vx: 0, vy: 0,
    sx: 0, sy: 0, // knockback shove channel
    r: CFG.soldierR,
    m: 1,
    angle: -Math.PI / 2, // facing: where the jetpack pushes
    aim: -Math.PI / 2, // where the gun points
    thrusting: false,
    hp: maxHp,
    maxHp,
    alive: true,
    weapon,
    ammo: weapon.magazine || Infinity,
    magsLeft: Math.max(0, CFG.soldierMagazines - 1), // one of the four starts loaded
    reloading: 0,
    fireCd: 0,
    burn: null,
    slow: null,
    flash: 0,
    muzzle: 0,
  };
}

function makeDummy(x, y) {
  return {
    kind: "dummy",
    team: "enemy",
    x, y, vx: 0, vy: 0, sx: 0, sy: 0,
    homeX: x, homeY: y,
    r: CFG.dummyR,
    m: (CFG.dummyR / CFG.soldierR) ** 2,
    hp: CFG.dummyHp,
    maxHp: CFG.dummyHp,
    alive: true,
    respawn: 0,
    burn: null, slow: null, flash: 0,
  };
}

export function makeAsteroid(rng, x, y, r) {
  const n = 9 + Math.floor(rng() * 6);
  const verts = [];
  for (let i = 0; i < n; i++) verts.push(0.9 + rng() * 0.15);
  const a = rng() * Math.PI * 2;
  const sp = rng() * CFG.asteroidMaxSpeed;
  return {
    kind: "asteroid",
    x, y, r,
    vx: Math.cos(a) * sp,
    vy: Math.sin(a) * sp,
    m: (r / CFG.soldierR) ** 2 * CFG.asteroidDensity,
    rot: rng() * Math.PI * 2,
    spin: (rng() - 0.5) * 0.6,
    verts,
  };
}

// Rejection sampling: a gap between rocks, the start kept clear, and anything
// in `world.keepClear` (ruins, later) respected.
function placeAsteroids(world, count) {
  const { rng, size } = world;
  let tries = 0;
  while (world.asteroids.length < count && tries++ < count * 60) {
    // Skew toward small rocks: many pebbles, few boulders.
    const r = CFG.asteroidMinR + (CFG.asteroidMaxR - CFG.asteroidMinR) * rng() ** 2;
    const x = rand(rng, r, size - r);
    const y = rand(rng, r, size - r);
    if (Math.hypot(x - world.start.x, y - world.start.y) < CFG.startClear + r) continue;
    if (world.asteroids.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + CFG.asteroidGap)) continue;
    if (blockedByClearZones(world, x, y, r)) continue;
    world.asteroids.push(makeAsteroid(rng, x, y, r));
  }
}

function blockedByClearZones(world, x, y, r) {
  for (const z of world.keepClear || []) {
    if (Math.hypot(z.x - x, z.y - y) < z.r + r + CFG.asteroidGap) return true;
  }
  return false;
}

export const controlled = (world) => {
  const s = world.soldiers[world.ctrl];
  return s && s.alive ? s : null;
};

// ---- step ------------------------------------------------------------------
// `input`: { turn: -1..1, thrust: bool, aimX, aimY, fire, firePress, reload,
// swap } — presses already latched by the caller, so an edge never falls
// between two steps.
export function step(world, input = {}) {
  const dt = CFG.step;
  world.t += dt;
  if (world.events.length > 256) world.events.splice(0, world.events.length - 256);

  const s = controlled(world);
  if (s) {
    drive(s, input, dt);
    if (input.reload) startReload(s);
    // Semi-auto takes the press, auto the hold — as the mission does.
    const want = s.weapon.auto ? input.fire : input.firePress;
    if (want) fire(world, s, s.aim, aimAccuracy(s.stats.aim));
  }
  tickActors(world, dt);
  integrate(world, dt);
  updateProjectiles(world, dt);
}

// Rotate-and-thrust: turn at a fixed rate, push along facing. Aim is the
// mouse, independent of facing.
export function drive(s, input, dt) {
  s.angle += (input.turn || 0) * CFG.turnRate * dt;
  s.thrusting = !!input.thrust;
  if (input.aimX != null) s.aim = Math.atan2(input.aimY - s.y, input.aimX - s.x);
  if (s.thrusting) thrust(s, CFG.thrust, dt);
}

// Thrust adds along facing, but may not raise speed past the cap. A body
// already faster (a bounce, a blast) keeps its speed: no drag, ever.
export function thrust(b, accel, dt, angle = b.angle) {
  const before = Math.hypot(b.vx, b.vy);
  b.vx += Math.cos(angle) * accel * dt;
  b.vy += Math.sin(angle) * accel * dt;
  const after = Math.hypot(b.vx, b.vy);
  const limit = Math.max(before, CFG.thrustCap);
  if (after > limit) {
    b.vx *= limit / after;
    b.vy *= limit / after;
  }
}

// ---- per-actor ticks: cooldowns, reload, status, shove, respawn ------------
function tickActors(world, dt) {
  for (const a of [...world.soldiers, ...world.enemies]) {
    if (!a.alive) {
      if (a.kind === "dummy" && (a.respawn -= dt) <= 0) {
        Object.assign(a, makeDummy(a.homeX, a.homeY));
      }
      continue;
    }
    if (a.fireCd > 0) a.fireCd -= dt;
    if (a.flash > 0) a.flash -= dt;
    if (a.muzzle > 0) a.muzzle -= dt;
    tickReload(a, dt);
    // Status ticks, src/mission/combat.js: burn damages, slow expires.
    if (a.burn) {
      const burn = a.burn;
      hurt(world, a, burn.dps * dt, a.burnOwner, true);
      burn.time -= dt;
      if (burn.time <= 0 && a.burn === burn) a.burn = null;
    }
    if (a.slow) {
      a.slow.time -= dt;
      if (a.slow.time <= 0) a.slow = null;
    }
    decayShove(a, dt);
  }
}

// startReload / tickReload, src/mission/entities.js.
export function startReload(a) {
  const w = a.weapon;
  if (!w || !w.magazine) return false;
  if (a.reloading > 0 || a.ammo >= w.magazine) return false;
  if (a.magsLeft !== undefined && a.magsLeft <= 0) return false;
  a.reloading = w.reloadTime || 1.5;
  return true;
}

function tickReload(a, dt) {
  if (!(a.reloading > 0)) return;
  a.reloading -= dt;
  if (a.reloading <= 0) {
    a.reloading = 0;
    a.ammo = a.weapon.magazine;
    if (a.magsLeft !== undefined && a.magsLeft !== Infinity) a.magsLeft -= 1;
  }
}

// Knockback: shoveActor/decayShove, src/mission/entities.js. The upward lift is
// dropped (no "up"), and the decay is on the shove's magnitude so a diagonal
// shove keeps its direction as it bleeds.
export function shove(t, vx, vy) {
  const m = Math.sqrt(Math.max(0.05, t.m));
  t.sx = (t.sx || 0) + vx / m;
  t.sy = (t.sy || 0) + vy / m;
}

function decayShove(a, dt) {
  const mag = Math.hypot(a.sx || 0, a.sy || 0);
  if (!mag) return;
  const drop = CFG.knockbackDecay * dt;
  if (mag <= drop) a.sx = a.sy = 0;
  else {
    a.sx *= (mag - drop) / mag;
    a.sy *= (mag - drop) / mag;
  }
}

// ---- damage ----------------------------------------------------------------
export function hurt(world, t, amount, owner, quiet = false) {
  if (!t.alive || !(amount > 0)) return;
  t.hp -= amount;
  if (!quiet) t.flash = 0.12;
  if (t.hp <= 0) kill(world, t, owner);
}

function kill(world, t) {
  t.alive = false;
  t.hp = 0;
  t.burn = t.slow = null;
  world.events.push({ type: "death", x: t.x, y: t.y, r: t.r, kind: t.kind, color: t.color });
  if (t.kind === "dummy") t.respawn = CFG.dummyRespawn;
}

const opponentsOf = (world, team) => (team === "player" ? world.enemies : world.soldiers);

// ---- firing (fire(), src/mission/ai.js) ------------------------------------
export function fire(world, shooter, angle, accuracy = 1) {
  if (shooter.fireCd > 0) return false;
  if (shooter.reloading > 0) return false;
  if (shooter.ammo !== undefined && shooter.ammo <= 0) {
    world.events.push({ type: "dry", x: shooter.x, y: shooter.y });
    return false;
  }
  const w = shooter.weapon;
  shooter.fireCd = 1 / w.fireRate;
  if (w.magazine && shooter.ammo !== Infinity) shooter.ammo -= 1;

  const pellets = w.effects.find((e) => e.kind === "pellets");
  const count = pellets ? Math.max(1, pellets.count || 1) : 1;
  const arc = pellets ? pellets.spread ?? 0.12 : 0;
  const spread = (w.spread || 0) + (1 - accuracy) * CFG.aimSpread + arc;
  const spec = w.projectile;
  for (let i = 0; i < count; i++) {
    const a = spread ? angle + (world.rng() * 2 - 1) * spread : angle;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const pierce = w.effects.find((e) => e.kind === "pierce");
    world.projectiles.push({
      x: shooter.x + dx * (shooter.r + 6),
      y: shooter.y + dy * (shooter.r + 6),
      vx: dx * spec.speed,
      vy: dy * spec.speed,
      r: Math.max(2, Math.min(spec.w, spec.h) / 2),
      w: spec.w, h: spec.h,
      color: spec.color,
      shape: spec.shape,
      life: spec.life,
      team: shooter.team,
      owner: shooter,
      effects: w.effects,
      pierceLeft: pierce ? pierce.count || 0 : 0,
      hit: null,
      dead: false,
    });
  }
  shooter.muzzle = 0.055;
  world.events.push({ type: "muzzle", x: shooter.x + Math.cos(angle) * (shooter.r + 14), y: shooter.y + Math.sin(angle) * (shooter.r + 14), color: spec.color });
  return true;
}

// ---- projectiles (updateProjectiles, src/mission/combat.js) ----------------
// Swept: each step a round is a segment, and the EARLIEST thing along it wins.
function updateProjectiles(world, dt) {
  for (const p of world.projectiles) {
    if (p.dead) continue;
    steerHoming(world, p, dt);
    const x0 = p.x, y0 = p.y;
    const x1 = x0 + p.vx * dt, y1 = y0 + p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }

    let best = null;
    let bt = Infinity;
    for (const a of world.asteroids) {
      const t = segCircle(x0, y0, x1, y1, a.x, a.y, a.r + p.r);
      if (t !== null && t < bt) { bt = t; best = a; }
    }
    for (const w of world.walls || []) {
      const t = segWall(x0, y0, x1, y1, w, p.r);
      if (t !== null && t < bt) { bt = t; best = w; }
    }
    for (const o of opponentsOf(world, p.team)) {
      if (!o.alive || o === p.owner || (p.hit && p.hit.has(o))) continue;
      const t = segCircle(x0, y0, x1, y1, o.x, o.y, o.r + p.r);
      if (t !== null && t < bt) { bt = t; best = o; }
    }

    if (!best) { p.x = x1; p.y = y1; continue; }
    const hx = x0 + (x1 - x0) * bt;
    const hy = y0 + (y1 - y0) * bt;
    if (best.kind === "asteroid" || best.kind === "wall") {
      p.dead = true;
      p.x = hx; p.y = hy;
      if (best.kind === "asteroid") {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        best.vx += (p.vx / sp) * CFG.bulletPush / best.m;
        best.vy += (p.vy / sp) * CFG.bulletPush / best.m;
      }
      world.events.push({ type: "spark", x: hx, y: hy, color: p.color });
      // Deviation: an explosive round detonates on terrain (the game's dies
      // silently) — otherwise "blasts push asteroids" almost never happens.
      for (const fx of p.effects) if (fx.kind === "explode") explode(world, fx, hx, hy, p.team, p.owner);
      continue;
    }
    // A body.
    applyEffects(world, best, p.effects, p.owner, { x: hx, y: hy, vx: p.vx, vy: p.vy, team: p.team });
    world.events.push({ type: "hit", x: hx, y: hy, color: p.color });
    const pierce = p.effects.find((e) => e.kind === "pierce");
    if (pierce && p.pierceLeft > 0) {
      p.pierceLeft--;
      (p.hit || (p.hit = new Set())).add(best);
      p.x = x1; p.y = y1;
    } else {
      p.dead = true;
      p.x = hx; p.y = hy;
    }
  }
  world.projectiles = world.projectiles.filter((p) => !p.dead);
}

function nearestOpponent(world, p) {
  let best = null, bd = Infinity;
  for (const o of opponentsOf(world, p.team)) {
    if (!o.alive || o === p.owner) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function steerHoming(world, p, dt) {
  const homing = p.effects.find((e) => e.kind === "homing");
  if (!homing) return;
  const target = nearestOpponent(world, p);
  if (!target) return;
  const want = Math.atan2(target.y - p.y, target.x - p.x);
  const cur = Math.atan2(p.vy, p.vx);
  const speed = Math.hypot(p.vx, p.vy) || 1;
  let d = want - cur;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const turn = (homing.turn || 3) * dt;
  const na = cur + clamp(d, -turn, turn);
  p.vx = Math.cos(na) * speed;
  p.vy = Math.sin(na) * speed;
}

// applyEffects, src/mission/combat.js: in the order the weapon authors them.
export function applyEffects(world, target, effects, owner, at) {
  const mult = owner && owner.kind === "soldier" ? CFG.playerDamageMult : 1;
  for (const fx of effects) {
    switch (fx.kind) {
      case "damage":
        hurt(world, target, (fx.amount || 0) * mult, owner);
        break;
      case "burn":
        target.burn = { dps: (fx.dps || 0) * mult, time: fx.duration };
        target.burnOwner = owner;
        break;
      case "slow":
        target.slow = { factor: clamp(fx.factor ?? 1, 0, 1), time: fx.duration };
        break;
      case "knockback": {
        const v = clamp(fx.force || 0, 0, 1) * CFG.knockbackMaxV;
        const sp = Math.hypot(at.vx, at.vy) || 1;
        shove(target, (at.vx / sp) * v, (at.vy / sp) * v);
        break;
      }
      case "explode":
        explode(world, fx, at.x, at.y, at.team, owner);
        break;
      case "chain": {
        const pool = opponentsOf(world, at.team).filter((o) => o.alive && o !== target);
        const done = new Set([target]);
        let from = target;
        for (let j = 0; j < (fx.jumps || 0); j++) {
          let next = null, bd = Infinity;
          for (const o of pool) {
            if (done.has(o)) continue;
            const d = Math.hypot(o.x - from.x, o.y - from.y);
            if (d <= (fx.range || 0) && d < bd) { bd = d; next = o; }
          }
          if (!next) break;
          world.events.push({ type: "chain", x0: from.x, y0: from.y, x1: next.x, y1: next.y });
          hurt(world, next, (fx.amount || 0) * mult, owner);
          done.add(next);
          from = next;
        }
        break;
      }
    }
  }
}

// Damages opponents in the radius (the direct target again, as the game does),
// and pushes rocks (answer 4). Bodies are not pushed (P8).
export function explode(world, fx, x, y, team, owner) {
  const mult = owner && owner.kind === "soldier" ? CFG.playerDamageMult : 1;
  const R = fx.radius || 0;
  world.events.push({ type: "explode", x, y, r: R });
  for (const o of opponentsOf(world, team)) {
    if (o.alive && Math.hypot(o.x - x, o.y - y) <= R) hurt(world, o, (fx.amount || 0) * mult, owner);
  }
  for (const a of world.asteroids) {
    const dx = a.x - x, dy = a.y - y;
    const d = Math.hypot(dx, dy) || 1;
    const reach = R + a.r;
    if (d >= reach) continue;
    const k = (CFG.blastPush * (1 - d / reach)) / a.m;
    a.vx += (dx / d) * k;
    a.vy += (dy / d) * k;
  }
}

// ---- geometry ----------------------------------------------------------------
// First t in [0,1] where segment p0→p1 comes within R of c, or null.
export function segCircle(x0, y0, x1, y1, cx, cy, R) {
  const dx = x1 - x0, dy = y1 - y0;
  const fx = x0 - cx, fy = y0 - cy;
  const c = fx * fx + fy * fy - R * R;
  if (c <= 0) return 0; // starts inside
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

// A round (radius r) against a wall segment: sampled against the thickened
// segment. Filled in by S3; here so projectiles already test walls.
function segWall() {
  return null;
}

// ---- motion + collision ----------------------------------------------------
function movers(world) {
  const list = world.asteroids.slice();
  for (const s of world.soldiers) if (s.alive) list.push(s);
  for (const e of world.enemies) if (e.alive) list.push(e);
  return list;
}

function integrate(world, dt) {
  const list = movers(world);
  // Substep so nothing moves more than half the smallest radius per substep:
  // discrete circle tests then cannot tunnel.
  let maxV = 0;
  let minR = Infinity;
  for (const b of list) {
    maxV = Math.max(maxV, Math.hypot(b.vx + (b.sx || 0), b.vy + (b.sy || 0)));
    minR = Math.min(minR, b.r);
  }
  const n = Math.max(1, Math.ceil((maxV * dt) / (minR * 0.5)));
  const h = dt / n;
  for (let k = 0; k < n; k++) {
    for (const b of list) {
      // Slow scales the body's whole displacement (the game scales horizontal).
      const f = b.slow && b.slow.time > 0 ? b.slow.factor : 1;
      b.x += (b.vx + (b.sx || 0)) * h * f;
      b.y += (b.vy + (b.sy || 0)) * h * f;
      if (b.spin) b.rot += b.spin * h;
    }
    collideAll(world, list);
  }
}

function collideAll(world, list) {
  const e = CFG.restitution;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      // Bodies pass through each other; only rocks bounce things (P7).
      if (a.kind !== "asteroid" && b.kind !== "asteroid") continue;
      collide(a, b, e);
    }
    edge(a, world.size, e);
  }
}

// A body with a shove folds it into its velocity at a contact: the rebound is
// computed on how it was actually moving, and what is left keeps drifting.
function foldShove(b) {
  if (b.sx || b.sy) {
    b.vx += b.sx;
    b.vy += b.sy;
    b.sx = b.sy = 0;
  }
}

export function collide(a, b, e = CFG.restitution) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const min = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2) || 0.0001;
  const nx = dx / d;
  const ny = dy / d;
  const ia = 1 / a.m;
  const ib = 1 / b.m;
  const pen = min - d;
  a.x -= nx * pen * (ia / (ia + ib));
  a.y -= ny * pen * (ia / (ia + ib));
  b.x += nx * pen * (ib / (ia + ib));
  b.y += ny * pen * (ib / (ia + ib));
  foldShove(a);
  foldShove(b);
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const j = (-(1 + e) * rv) / (ia + ib);
    a.vx -= j * nx * ia;
    a.vy -= j * ny * ia;
    b.vx += j * nx * ib;
    b.vy += j * ny * ib;
  }
  return true;
}

function edge(b, size, e) {
  if (b.x < b.r) { foldShove(b); b.x = b.r; b.vx = Math.abs(b.vx) * e; }
  else if (b.x > size - b.r) { foldShove(b); b.x = size - b.r; b.vx = -Math.abs(b.vx) * e; }
  if (b.y < b.r) { foldShove(b); b.y = b.r; b.vy = Math.abs(b.vy) * e; }
  else if (b.y > size - b.r) { foldShove(b); b.y = size - b.r; b.vy = -Math.abs(b.vy) * e; }
}
