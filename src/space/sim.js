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

// ---- recruits (copied from src/game/soldiers.js) ---------------------------
export const RECRUITS = [
  { name: "Mara Vance", stats: { aim: 8, health: 6, speed: 5, nerve: 6 }, color: "#6fc3ff" },
  { name: "Kwame Osei", stats: { aim: 5, health: 7, speed: 4, nerve: 10 }, color: "#ffb45a" },
  { name: "Yuki Tanaka", stats: { aim: 7, health: 4, speed: 9, nerve: 4 }, color: "#b98cff" },
];

// soldierMaxHp: soldierBaseHp 15 + health × soldierHpPerHealth 2
export const soldierMaxHp = (stats) => 15 + stats.health * 2;

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
    world.soldiers.push(makeSoldier(r, world.start.x + (i - (squad - 1) / 2) * 50, world.start.y));
  }

  placeAsteroids(world, opts.asteroids ?? CFG.asteroidCount);
  return world;
}

function makeSoldier(recruit, x, y) {
  const maxHp = soldierMaxHp(recruit.stats);
  return {
    kind: "soldier",
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
  };
}

export function makeAsteroid(rng, x, y, r) {
  const n = 9 + Math.floor(rng() * 6);
  const verts = [];
  for (let i = 0; i < n; i++) verts.push(0.8 + rng() * 0.28);
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
  const s = controlled(world);
  if (s) drive(s, input, dt);
  integrate(world, dt);
}

// Rotate-and-thrust: turn at a fixed rate, push along facing.
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

// ---- motion + collision ----------------------------------------------------
function movers(world) {
  const list = world.asteroids.slice();
  for (const s of world.soldiers) if (s.alive) list.push(s);
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
      b.x += (b.vx + (b.sx || 0)) * h;
      b.y += (b.vy + (b.sy || 0)) * h;
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
