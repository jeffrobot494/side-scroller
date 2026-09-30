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

  ruinsMin: 3, // P3
  ruinsMax: 5,
  ruinGap: 900, // centre to centre
  ruinStartGap: 700,
  wallHalf: 6, // half a hull plate's thickness
  breach: 90, // an opening in a hull; a soldier is 36 across
  artifactR: 14,
  extractR: 120,
  extractMinDist: 2000, // half the map from the start (P10)

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
    ruins: [],
    walls: [],
    keepClear: [],
    artifact: null,
    extract: null,
    end: null, // { success } once the mission resolves
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

  if (opts.ruins !== 0) placeRuins(world, opts.ruins);
  if (opts.objective !== false) placeObjective(world);
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

// ---- ruins, artifact, extraction --------------------------------------------
// A ruin is a derelict hull: a pointed ship outline of wall segments, one or
// two breaches cut in it, and a bulkhead with a door splitting the hold. The
// artifact sits in the aft compartment of one of them.
function placeRuins(world, want) {
  const { rng, size } = world;
  const count = want ?? CFG.ruinsMin + Math.floor(rng() * (CFG.ruinsMax - CFG.ruinsMin + 1));
  let tries = 0;
  while (world.ruins.length < count && tries++ < 400) {
    const L = rand(rng, 340, 460);
    const W = rand(rng, 170, 220);
    const R = Math.hypot(L / 2, W / 2);
    const x = rand(rng, R + 60, size - R - 60);
    const y = rand(rng, R + 60, size - R - 60);
    if (Math.hypot(x - world.start.x, y - world.start.y) < CFG.ruinStartGap + R) continue;
    if (world.ruins.some((o) => Math.hypot(o.x - x, o.y - y) < CFG.ruinGap)) continue;
    addRuin(world, x, y, rand(rng, 0, Math.PI * 2), L, W);
  }
}

export function addRuin(world, x, y, angle, L, W) {
  const { rng } = world;
  const c = Math.cos(angle), sn = Math.sin(angle);
  const toWorld = ([lx, ly]) => [x + lx * c - ly * sn, y + lx * sn + ly * c];
  const hull = [[-L / 2, -W / 2], [L / 4, -W / 2], [L / 2, 0], [L / 4, W / 2], [-L / 2, W / 2]];
  // Where along each edge a breach is centred. The long sides breach forward
  // of the bulkhead, which meets them at x = -L/8 and would split a centred one.
  const breachAt = [0.8, 0.5, 0.5, 0.2, 0.5];
  // Which hull edges get a breach: one always, a second half the time.
  const breached = new Set([Math.floor(rng() * hull.length)]);
  if (rng() < 0.5) breached.add(Math.floor(rng() * hull.length));
  const segs = [];
  const openings = []; // centre of every breach and door, local
  const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    if (breached.has(i)) {
      segs.push(...cut(a, b, CFG.breach, breachAt[i]));
      openings.push(lerp(a, b, breachAt[i]));
    } else segs.push([a, b]);
  }
  // Bulkhead across the hold with a door in it.
  segs.push(...cut([-L / 8, -W / 2], [-L / 8, W / 2], CFG.breach));
  openings.push([-L / 8, 0]);
  const ruin = {
    x, y, angle, L, W,
    R: Math.hypot(L / 2, W / 2) + CFG.wallHalf,
    hull: hull.map(toWorld),
    walls: [],
    aft: toWorld([-L * 0.31, 0]), // mid aft compartment: the artifact's place
    openings: openings.map(toWorld),
  };
  for (const [a, b] of segs) {
    const [x0, y0] = toWorld(a);
    const [x1, y1] = toWorld(b);
    const w = { kind: "wall", x0, y0, x1, y1, t: CFG.wallHalf, ruin };
    ruin.walls.push(w);
    world.walls.push(w);
  }
  world.ruins.push(ruin);
  world.keepClear.push({ x, y, r: ruin.R + 20 });
  return ruin;
}

// Segment a→b with a gap of `gap` centred at fraction k removed: two segments.
function cut(a, b, gap, k = 0.5) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const k0 = k - gap / 2 / L, k1 = k + gap / 2 / L;
  const at = (k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  return [[a, at(k0)], [at(k1), b]];
}

function placeObjective(world) {
  const { rng, size } = world;
  if (world.ruins.length) {
    const host = world.ruins[Math.floor(rng() * world.ruins.length)];
    world.artifact = { x: host.aft[0], y: host.aft[1], r: CFG.artifactR, carrier: null, ruin: host };
  } else {
    world.artifact = { x: size / 2, y: size / 2, r: CFG.artifactR, carrier: null, ruin: null };
  }
  const r = CFG.extractR;
  for (let tries = 0; tries < 400; tries++) {
    const x = rand(rng, r + 40, size - r - 40);
    const y = rand(rng, r + 40, size - r - 40);
    if (Math.hypot(x - world.start.x, y - world.start.y) < CFG.extractMinDist) continue;
    if (world.ruins.some((o) => Math.hypot(o.x - x, o.y - y) < o.R + r + 40)) continue;
    world.extract = { x, y, r };
    break;
  }
  // Fallback: the far corner, which always clears the distance on a 4000 map.
  if (!world.extract) world.extract = { x: size - world.start.x, y: size - world.start.y, r };
  world.keepClear.push({ x: world.extract.x, y: world.extract.y, r });
}

function tickObjective(world) {
  const art = world.artifact;
  if (art) {
    if (art.carrier && !art.carrier.alive) art.carrier = null; // dropped where they died (P9)
    if (art.carrier) {
      art.x = art.carrier.x;
      art.y = art.carrier.y;
    } else {
      for (const s of world.soldiers) {
        if (s.alive && Math.hypot(s.x - art.x, s.y - art.y) < s.r + art.r) {
          art.carrier = s;
          world.events.push({ type: "pickup", x: art.x, y: art.y });
          break;
        }
      }
    }
  }
  const living = world.soldiers.filter((s) => s.alive);
  if (!living.length) {
    world.end = { success: false };
    return;
  }
  const held = !art || (art.carrier && art.carrier.alive);
  const ex = world.extract;
  if (held && ex && living.some((s) => Math.hypot(s.x - ex.x, s.y - ex.y) < ex.r)) world.end = { success: true };
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

  const s = world.end ? null : controlled(world);
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
  if (!world.end) tickObjective(world);
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

// Closest point on wall segment w to (px, py).
export function closestOnWall(w, px, py) {
  const ex = w.x1 - w.x0, ey = w.y1 - w.y0;
  const L2 = ex * ex + ey * ey || 1;
  const k = clamp(((px - w.x0) * ex + (py - w.y0) * ey) / L2, 0, 1);
  return [w.x0 + ex * k, w.y0 + ey * k];
}

// First t in [0,1] where a round of radius pr on p0→p1 touches the wall — the
// wall as a capsule of half-thickness w.t: its two long faces, then its ends.
export function segWall(x0, y0, x1, y1, w, pr) {
  const R = w.t + pr;
  const [cx, cy] = closestOnWall(w, x0, y0);
  if (Math.hypot(x0 - cx, y0 - cy) <= R) return 0;
  const ex = w.x1 - w.x0, ey = w.y1 - w.y0;
  const L = Math.hypot(ex, ey) || 1;
  const ux = ex / L, uy = ey / L, nx = -uy, ny = ux;
  const dx = x1 - x0, dy = y1 - y0;
  const dn = dx * nx + dy * ny;
  const off = (x0 - w.x0) * nx + (y0 - w.y0) * ny;
  let best = null;
  if (dn !== 0) {
    for (const side of [R, -R]) {
      const t = (side - off) / dn;
      if (t < 0 || t > 1) continue;
      const along = (x0 + dx * t - w.x0) * ux + (y0 + dy * t - w.y0) * uy;
      if (along >= 0 && along <= L && (best === null || t < best)) best = t;
    }
  }
  for (const [px, py] of [[w.x0, w.y0], [w.x1, w.y1]]) {
    const t = segCircle(x0, y0, x1, y1, px, py, R);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

// A body against a wall: push out along the contact normal, reflect what was
// moving into it. Walls do not move.
function collideWall(b, w, e) {
  const [cx, cy] = closestOnWall(w, b.x, b.y);
  const dx = b.x - cx, dy = b.y - cy;
  const min = b.r + w.t;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2) || 0.0001;
  const nx = dx / d, ny = dy / d;
  b.x += nx * (min - d);
  b.y += ny * (min - d);
  foldShove(b);
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
  }
  return true;
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
    for (const r of world.ruins) {
      if (Math.hypot(a.x - r.x, a.y - r.y) > r.R + a.r) continue;
      for (const w of r.walls) collideWall(a, w, e);
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
