// ---------------------------------------------------------------------------
// SPACE FPS — the simulation (tech/space-fps.md).
//
// The 2D prototype's mission (src/space/sim.js) in a cube, every body a
// sphere. DOM-free: main.js feeds one input object per fixed step, the views
// read the world, test/space3d.test.mjs drives it with scripted input. Its
// tuning, weapons, recruits and enemy types are IMPORTED from the 2D sim, so
// a retune there reaches here; the rules are copied with a z.
//
// Every gameplay draw goes through `world.rng`: same seed + same input trace
// = same world.
// ---------------------------------------------------------------------------

import { CFG as CFG2, makeRng, RECRUITS, LOADOUT, WEAPONS, soldierMaxHp, aimAccuracy } from "../space/sim.js";
import { dot, cross, norm, len, qmul, qaxis, qrot, qnorm, qlook, qconj, qslerp, qangle, QI, fwdOf, upOfQ, randomDir, perp } from "./vec.js";

export { RECRUITS, LOADOUT, WEAPONS, soldierMaxHp, aimAccuracy };

export const CFG = {
  ...CFG2,
  // F1: the cube and how full it is.
  mapSize: 6000,
  asteroidCount: 300,
  asteroidMaxSpin: 0.15, // rad/s (2D: 0.3): standing on a spinning rock turns the sky
  // F2/F3: look, roll and the jets.
  rollRate: 2, // rad/s, Q/E
  jetSide: 0.6, // S, A, D, Space and C push at this share of W's thrust
  pitchMax: 1.45, // standing, the head pitches this far from level
  viewEase: 0.07, // s: the eye's roll to a new up, the 2D ROLL_TAU
};

const rand = (rng, lo, hi) => lo + rng() * (hi - lo);
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

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
    keepClear: [],
    artifact: null,
    extract: null,
    end: null,
    ctrl: 0,
    events: [], // one-shot happenings; the page drains it after the views read it
  };

  // Start near a random corner of the cube, facing its centre.
  const near = () => (rng() < 0.5 ? rand(rng, 400, 700) : S - rand(rng, 400, 700));
  world.start = { x: near(), y: near(), z: near() };
  const toCentre = norm([S / 2 - world.start.x, S / 2 - world.start.y, S / 2 - world.start.z]);
  const q = qlook(toCentre, perp(toCentre));
  const side = qrot(q, [1, 0, 0]);

  const squad = opts.squad ?? 1;
  for (let i = 0; i < squad; i++) {
    const r = RECRUITS[i % RECRUITS.length];
    const weapon = (opts.weapons && opts.weapons[i]) || LOADOUT[i % LOADOUT.length];
    const k = (i - (squad - 1) / 2) * 50;
    const s = makeSoldier(r, world.start.x + side[0] * k, world.start.y + side[1] * k, world.start.z + side[2] * k, weapon, q);
    world.soldiers.push(s);
  }

  placeAsteroids(world, opts.asteroids ?? CFG.asteroidCount);
  return world;
}

export function makeSoldier(recruit, x, y, z, weaponId, q = QI()) {
  const maxHp = soldierMaxHp(recruit.stats);
  const weapon = WEAPONS[weaponId];
  return {
    kind: "soldier",
    team: "player",
    name: recruit.name,
    color: recruit.color,
    stats: { ...recruit.stats },
    x, y, z, vx: 0, vy: 0, vz: 0,
    sx: 0, sy: 0, sz: 0, // knockback shove channel
    r: CFG.soldierR,
    m: 1,
    q: q.slice(), // orientation: local -Z is the look, +Y up
    pitch: 0, // the head's pitch, standing; floating it is folded into q
    viewOff: QI(), // the eye's lag behind q after a snap to a new up (view only)
    jet: [0, 0, 0], // the jets firing this step, local, for the flames
    thrusting: false,
    aim: fwdOf(q), // where the gun points
    boots: null,
    ground: null,
    hp: maxHp,
    maxHp,
    alive: true,
    weapon,
    ammo: weapon.magazine || Infinity,
    magsLeft: Math.max(0, CFG.soldierMagazines - 1),
    reloading: 0,
    fireCd: 0,
    burn: null,
    slow: null,
    flash: 0,
    muzzle: 0,
  };
}

export function makeAsteroid(rng, x, y, z, r) {
  const v = randomDir(rng);
  const sp = rng() * CFG.asteroidMaxSpeed;
  const axis = randomDir(rng);
  const spin = (rng() * 2 - 1) * CFG.asteroidMaxSpin;
  return {
    kind: "asteroid",
    x, y, z, r,
    vx: v[0] * sp, vy: v[1] * sp, vz: v[2] * sp,
    // The 2D mass rule, an area, so every push and bounce number carries over.
    m: (r / CFG.soldierR) ** 2 * CFG.asteroidDensity,
    q: qaxis(randomDir(rng), rng() * Math.PI * 2),
    w: [axis[0] * spin, axis[1] * spin, axis[2] * spin], // angular velocity, rad/s
    look: Math.floor(rng() * 1e9), // the view's seed for its lumps
  };
}

// Rejection sampling, as 2D: a gap between rocks, the start kept clear, and
// anything in keepClear respected.
function placeAsteroids(world, count) {
  const { rng, size } = world;
  let tries = 0;
  while (world.asteroids.length < count && tries++ < count * 60) {
    const r = CFG.asteroidMinR + (CFG.asteroidMaxR - CFG.asteroidMinR) * rng() ** 2;
    const x = rand(rng, r, size - r), y = rand(rng, r, size - r), z = rand(rng, r, size - r);
    const s = world.start;
    if (Math.hypot(x - s.x, y - s.y, z - s.z) < CFG.startClear + r) continue;
    if (world.asteroids.some((o) => Math.hypot(o.x - x, o.y - y, o.z - z) < o.r + r + CFG.asteroidGap)) continue;
    if (world.keepClear.some((k) => Math.hypot(k.x - x, k.y - y, k.z - z) < k.r + r + CFG.asteroidGap)) continue;
    world.asteroids.push(makeAsteroid(rng, x, y, z, r));
  }
}

export const controlled = (world) => {
  const s = world.soldiers[world.ctrl];
  return s && s.alive ? s : null;
};

export function swapControl(world) {
  const n = world.soldiers.length;
  for (let k = 1; k <= n; k++) {
    const i = (world.ctrl + k) % n;
    if (world.soldiers[i].alive) {
      world.ctrl = i;
      return true;
    }
  }
  return false;
}

// The look: the body's forward, with the head's pitch on top while standing.
export function lookQ(s) {
  return s.pitch ? qmul(s.q, qaxis([1, 0, 0], s.pitch)) : s.q;
}
export const lookOf = (s) => fwdOf(lookQ(s));
export const upOf = (s) => upOfQ(s.q);

// ---- step ------------------------------------------------------------------
// `input`: { look: [yaw, pitch] radians this step (+ right, + up), roll -1..1,
// jet: [right, up, forward] each -1..1, fire, firePress, up, upPress, boots,
// reload, swap } — presses already latched by the caller.
export function step(world, input = {}) {
  const dt = CFG.step;
  world.t += dt;
  if (world.events.length > 512) world.events.splice(0, world.events.length - 512);

  if (input.swap && !world.end) swapControl(world);
  const s = world.end ? null : controlled(world);
  if (s) drive(s, input, dt);
  for (const o of world.soldiers) easeView(o, dt);
  tickActors(world, dt);
  integrate(world, dt);
  if (!world.end) tickObjective(world);
}

// The player's body: the mouse turns it, the jets push it. No drag, no cap.
export function drive(s, input, dt) {
  const [yaw, pitch] = input.look || [0, 0];
  const roll = (input.roll || 0) * CFG.rollRate * dt;
  let q = s.q;
  if (yaw) q = qmul(q, qaxis([0, 1, 0], -yaw));
  if (pitch) q = qmul(q, qaxis([1, 0, 0], pitch));
  if (roll) q = qmul(q, qaxis([0, 0, 1], -roll));
  s.q = qnorm(q);

  const [jx, jy, jz] = input.jet || [0, 0, 0];
  const k = CFG.jetSide;
  s.jet = [jx * k, jy * k, jz > 0 ? -jz : -jz * k];
  s.thrusting = !!(jx || jy || jz);
  if (s.thrusting) {
    const a = qrot(s.q, s.jet);
    s.vx += a[0] * CFG.thrust * dt;
    s.vy += a[1] * CFG.thrust * dt;
    s.vz += a[2] * CFG.thrust * dt;
  }
  s.aim = lookOf(s);
}

// The eye catches up with the body after a snap to a new up.
function easeView(s, dt) {
  if (s.viewOff[3] > 0.999999) return;
  s.viewOff = qslerp(s.viewOff, QI(), 1 - Math.exp(-dt / CFG.viewEase));
}

// ---- per-actor ticks ---------------------------------------------------------
function tickActors(world, dt) {
  for (const a of [...world.soldiers, ...world.enemies]) {
    if (!a.alive) continue;
    if (a.fireCd > 0) a.fireCd -= dt;
    if (a.flash > 0) a.flash -= dt;
    if (a.muzzle > 0) a.muzzle -= dt;
    decayShove(a, dt);
  }
}

function decayShove(a, dt) {
  const mag = Math.hypot(a.sx || 0, a.sy || 0, a.sz || 0);
  if (!mag) return;
  const drop = CFG.knockbackDecay * dt;
  if (mag <= drop) a.sx = a.sy = a.sz = 0;
  else {
    const k = (mag - drop) / mag;
    a.sx *= k; a.sy *= k; a.sz *= k;
  }
}

// ---- damage ----------------------------------------------------------------
export const isBody = (a) => a.kind === "soldier" || a.type === "trooper";

export function hurt(world, t, amount, owner, quiet = false) {
  if (!t.alive || !(amount > 0)) return;
  t.hp -= amount;
  if (t.kind === "enemy") t.alert = true;
  if (t.kind === "soldier" && !quiet) world.events.push({ type: "hurt", x: t.x, y: t.y, z: t.z, ctrl: t === controlled(world) });
  if (!quiet) t.flash = 0.12;
  if (t.hp <= 0) kill(world, t, owner);
}

function kill(world, t) {
  t.alive = false;
  t.hp = 0;
  t.burn = t.slow = null;
  world.events.push({ type: "death", x: t.x, y: t.y, z: t.z, r: t.r, kind: t.kind, enemy: t.type, color: t.color });
  if (t.kind === "soldier" && world.soldiers[world.ctrl] === t) swapControl(world);
}

// A body hitting something at `v` px/s, the 2D curve: nothing to crashSafe,
// all its HP at crashLethal, in proportion between; companions take a share.
export function crash(world, s, v, safe = CFG.crashSafe) {
  if (!isBody(s) || !s.alive || !(v > safe)) return;
  const k = (v - safe) / (CFG.crashLethal - safe);
  const share = s === controlled(world) ? 1 : CFG.companionCrash;
  world.events.push({ type: "crash", x: s.x, y: s.y, z: s.z, speed: v, ctrl: s === controlled(world) });
  hurt(world, s, k * share * s.maxHp, null);
}

function tickObjective(world) {
  if (!world.soldiers.some((s) => s.alive)) world.end = { success: false };
}

// ---- motion + collision ----------------------------------------------------
function movers(world) {
  const list = world.asteroids.slice();
  for (const s of world.soldiers) if (s.alive) list.push(s);
  for (const e of world.enemies) if (e.alive) list.push(e);
  return list;
}

// Substep so nothing moves more than half the smallest radius per substep,
// as 2D: the discrete sphere tests then cannot tunnel.
function integrate(world, dt) {
  const list = movers(world);
  let maxV = 0;
  let minR = Infinity;
  for (const b of list) {
    minR = Math.min(minR, b.r);
    if (b.boots === "ground") continue;
    maxV = Math.max(maxV, Math.hypot(b.vx + (b.sx || 0), b.vy + (b.sy || 0), b.vz + (b.sz || 0)));
  }
  const n = Math.max(1, Math.ceil((maxV * dt) / (minR * 0.5)));
  const h = dt / n;
  for (let k = 0; k < n; k++) {
    for (const b of list) {
      if (b.boots === "ground") continue;
      const f = b.slow && b.slow.time > 0 ? b.slow.factor : 1;
      b.x += (b.vx + (b.sx || 0)) * h * f;
      b.y += (b.vy + (b.sy || 0)) * h * f;
      b.z += (b.vz + (b.sz || 0)) * h * f;
      if (b.w) spinBy(b, h);
    }
    collideAll(world, list);
  }
}

// A rock turns by its angular velocity.
function spinBy(a, h) {
  const om = len(a.w);
  if (!om) return;
  a.q = qnorm(qmul(qaxis([a.w[0] / om, a.w[1] / om, a.w[2] / om], om * h), a.q));
}

// Sweep and prune along x: only pairs whose x extents overlap are tested.
// Bodies pass through each other; only rocks bounce things (P7).
function collideAll(world, list) {
  const e = CFG.restitution;
  list.sort((a, b) => a.x - a.r - (b.x - b.r));
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const hi = a.x + a.r;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.x - b.r > hi) break;
      if (a.kind !== "asteroid" && b.kind !== "asteroid") continue;
      const s = isBody(a) ? a : isBody(b) ? b : null;
      const v = s ? closing(a, b) : 0;
      if (collide(a, b, e) && s) crash(world, s, v);
    }
  }
  for (const a of list) edge(a, world.size, e);
}

function foldShove(b) {
  if (b.sx || b.sy || b.sz) {
    b.vx += b.sx || 0; b.vy += b.sy || 0; b.vz += b.sz || 0;
    b.sx = b.sy = b.sz = 0;
  }
}

// How fast two overlapping bodies close along their centre line, shoves included.
function closing(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const d = Math.hypot(dx, dy, dz);
  if (!d || d >= a.r + b.r) return 0;
  const rv = ((b.vx + (b.sx || 0)) - (a.vx + (a.sx || 0))) * dx / d
    + ((b.vy + (b.sy || 0)) - (a.vy + (a.sy || 0))) * dy / d
    + ((b.vz + (b.sz || 0)) - (a.vz + (a.sz || 0))) * dz / d;
  return Math.max(0, -rv);
}

export function collide(a, b, e = CFG.restitution) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const min = a.r + b.r;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2) || 0.0001;
  const nx = dx / d, ny = dy / d, nz = dz / d;
  const ia = 1 / a.m, ib = 1 / b.m;
  const pen = min - d;
  const ka = pen * (ia / (ia + ib)), kb = pen * (ib / (ia + ib));
  a.x -= nx * ka; a.y -= ny * ka; a.z -= nz * ka;
  b.x += nx * kb; b.y += ny * kb; b.z += nz * kb;
  foldShove(a);
  foldShove(b);
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
  if (rv < 0) {
    const j = (-(1 + e) * rv) / (ia + ib);
    a.vx -= j * nx * ia; a.vy -= j * ny * ia; a.vz -= j * nz * ia;
    b.vx += j * nx * ib; b.vy += j * ny * ib; b.vz += j * nz * ib;
  }
  return true;
}

// The cube's faces are a bouncing wall (P1).
function edge(b, size, e) {
  for (const [p, v] of [["x", "vx"], ["y", "vy"], ["z", "vz"]]) {
    if (b[p] < b.r) { foldShove(b); b[p] = b.r; b[v] = Math.abs(b[v]) * e; }
    else if (b[p] > size - b.r) { foldShove(b); b[p] = size - b.r; b[v] = -Math.abs(b[v]) * e; }
  }
}
