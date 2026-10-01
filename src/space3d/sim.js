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

import { CFG as CFG2, makeRng, RECRUITS, LOADOUT, WEAPONS, soldierMaxHp, aimAccuracy, addDerelict, addRuin, ENEMY_TYPES } from "../space/sim.js";
const ENEMY_COLOR = Object.fromEntries(Object.entries(ENEMY_TYPES).map(([k, T]) => [k, T.color]));
import { updateEnemies, updateSquad, spawnWave, placeEnemies, releaseMine } from "./ai.js";
import { dot, cross, norm, len, qmul, qaxis, qrot, qnorm, qlook, qconj, qslerp, qangle, qlimit, qfromTo, QI, fwdOf, upOfQ, randomDir, perp } from "./vec.js";

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
  dummyCount3: 0, // F2's target drones: a test fixture now, none in play
  gridCell: 700, // the rock grid lines of sight and rounds query
  // F4: a derelict is the 2D layout given a height, closed by a deck and a
  // ceiling. Doors and breaches keep the layout's width (CFG.breach).
  derelictH: [260, 320],
  doorH: 150, // from the deck
  breachH: 150, // centred on the wall's height
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
    // A station beside whoever leads, rolled once (F10): a world-fixed 3D
    // bearing and a distance within spread of the standoff.
    s.station = { dir: randomDir(rng), d: CFG.standoff + (rng() * 2 - 1) * CFG.standoffSpread };
    world.soldiers.push(s);
  }

  if (opts.ruins !== 0) placeRuins(world, opts.ruins);
  if (opts.objective !== false) placeObjective(world);
  placeAsteroids(world, opts.asteroids ?? CFG.asteroidCount);

  world.wave = { n: 0, t: opts.waveEvery ?? CFG.waveEvery };
  if (opts.enemies !== 0) placeEnemies(world, opts.enemies ?? CFG.enemyCount, opts.elites ?? CFG.eliteCount);

  // F2: target drones round the start, so every effect can be seen before
  // there are enemies. A test fixture once enemies exist (F5).
  const dummies = opts.dummies ?? CFG.dummyCount3;
  for (let i = 0; i < dummies; i++) {
    const d = randomDir(rng);
    const k = rand(rng, 260, 420);
    world.enemies.push(makeDummy(world.start.x + d[0] * k, world.start.y + d[1] * k, world.start.z + d[2] * k));
  }
  return world;
}

function makeDummy(x, y, z) {
  return {
    kind: "dummy",
    team: "enemy",
    x, y, z, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0,
    home: [x, y, z],
    r: CFG.dummyR,
    m: (CFG.dummyR / CFG.soldierR) ** 2,
    hp: CFG.dummyHp,
    maxHp: CFG.dummyHp,
    alive: true,
    respawn: 0,
    burn: null, slow: null, flash: 0,
  };
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
    boots: null, // null (floating), "air" or "ground"
    ground: null, // the rock or slab stood on
    gn: null, gq: null, // on a rock: where, in its frame, and its turn when last settled
    gv: [0, 0], // walk velocity in the body's frame: right, forward
    walkIn: [0, 0],
    pushed: 0,
    stride: 0,
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
  // Only the soldier you fly wears boots: swapping away switches them off.
  for (const o of world.soldiers) if (o.boots && o !== s) bootsOff(o, world);
  if (s) {
    if (input.boots) toggleBoots(world, s);
    if (s.boots === "ground" && input.upPress) jump(world, s);
    drive(world, s, input, dt);
    if (input.reload) startReload(s, world);
    // Semi-auto takes the press, auto the hold, as the mission does.
    const want = s.weapon.auto ? input.fire : input.firePress;
    if (want) fire(world, s, s.aim, aimAccuracy(s.stats.aim));
  }
  for (const o of world.soldiers) easeView(o, dt);
  if (!world.end) updateSquad(world, dt);
  updateEnemies(world, dt);
  for (const e of world.enemies) if (isBody(e)) easeView(e, dt);
  if (!world.end && (world.wave.t -= dt) <= 0) {
    world.wave.t = CFG.waveEvery;
    spawnWave(world);
  }
  tickActors(world, dt);
  integrate(world, dt);
  settleBoots(world, dt);
  updateProjectiles(world, dt);
  if (!world.end) tickObjective(world);
}

// The player's body: the mouse turns it, the jets push it. No drag, no cap.
export function drive(world, s, input, dt) {
  const [yaw, pitch] = input.look || [0, 0];
  const [jx, jy, jz] = input.jet || [0, 0, 0];
  if (s.boots === "ground") {
    // Standing: the mouse yaws about the surface's normal and pitches the
    // head; W/S/A/D walk.
    if (yaw) s.q = qnorm(qmul(s.q, qaxis([0, 1, 0], -yaw)));
    s.pitch = clamp(s.pitch + pitch, -CFG.pitchMax, CFG.pitchMax);
    s.walkIn = [jx, jz];
  } else {
    const roll = (input.roll || 0) * CFG.rollRate * dt;
    let q = s.q;
    if (yaw) q = qmul(q, qaxis([0, 1, 0], -yaw));
    if (pitch) q = qmul(q, qaxis([1, 0, 0], pitch));
    if (roll) q = qmul(q, qaxis([0, 0, 1], -roll));
    s.q = qnorm(q);
  }

  const k = CFG.jetSide;
  // The jetpack does nothing with the boots on.
  const on = !s.boots;
  s.jet = on ? [jx * k, jy * k, jz > 0 ? -jz : -jz * k] : [0, 0, 0];
  s.thrusting = on && !!(jx || jy || jz);
  if (s.thrusting) {
    const a = qrot(s.q, s.jet);
    s.vx += a[0] * CFG.thrust * dt;
    s.vy += a[1] * CFG.thrust * dt;
    s.vz += a[2] * CFG.thrust * dt;
  }
  s.aim = lookOf(s);
  bootsPull(world, s, dt);
}

// The eye catches up with the body after a snap to a new up.
function easeView(s, dt) {
  if (s.viewOff[3] > 0.999999) return;
  s.viewOff = qslerp(s.viewOff, QI(), 1 - Math.exp(-dt / CFG.viewEase));
}

// ---- per-actor ticks ---------------------------------------------------------
function tickActors(world, dt) {
  for (const a of [...world.soldiers, ...world.enemies]) {
    if (!a.alive) {
      if (a.kind === "dummy" && (a.respawn -= dt) <= 0) Object.assign(a, makeDummy(...a.home));
      continue;
    }
    if (a.fireCd > 0) a.fireCd -= dt;
    if (a.flash > 0) a.flash -= dt;
    if (a.muzzle > 0) a.muzzle -= dt;
    tickReload(a, dt, world);
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
export function startReload(a, world) {
  const w = a.weapon;
  if (!w || !w.magazine) return false;
  if (a.reloading > 0 || a.ammo >= w.magazine) return false;
  if (a.magsLeft !== undefined && a.magsLeft <= 0) return false;
  a.reloading = w.reloadTime || 1.5;
  if (world) world.events.push({ type: "reload", x: a.x, y: a.y, z: a.z });
  return true;
}

function tickReload(a, dt, world) {
  if (!(a.reloading > 0)) return;
  a.reloading -= dt;
  if (a.reloading <= 0) {
    a.reloading = 0;
    world.events.push({ type: "reloaded", x: a.x, y: a.y, z: a.z });
    a.ammo = a.weapon.magazine;
    if (a.magsLeft !== undefined && a.magsLeft !== Infinity) a.magsLeft -= 1;
  }
}

// Knockback: shoveActor, src/mission/entities.js, with the lift dropped.
export function shove(t, vx, vy, vz) {
  const m = Math.sqrt(Math.max(0.05, t.m));
  t.sx = (t.sx || 0) + vx / m;
  t.sy = (t.sy || 0) + vy / m;
  t.sz = (t.sz || 0) + vz / m;
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
  if (t.kind === "dummy") t.respawn = CFG.dummyRespawn;
  if (isBody(t)) bootsOff(t);
  const color = t.color || (t.type && ENEMY_COLOR[t.type]);
  world.events.push({ type: "death", x: t.x, y: t.y, z: t.z, r: t.r, kind: t.kind, enemy: t.type, color });
  // The controlled soldier died: control passes on, as mission.js does.
  if (t.kind === "soldier" && world.soldiers[world.ctrl] === t) swapControl(world);
  if (t.type === "mine") releaseMine(t);
  // Prune long-dead enemies so the list does not grow for the whole mission.
  if (t.kind === "enemy" && world.enemies.length > 80) world.enemies = world.enemies.filter((e) => e.alive || e === t);
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

// The 2D rules: any soldier picks the artifact up by touching it, it drops
// where its carrier dies (P9), and a living soldier in the extraction zone
// while the squad holds it wins. Every soldier dead loses.
function tickObjective(world) {
  const art = world.artifact;
  if (art) {
    if (art.carrier && !art.carrier.alive) art.carrier = null;
    if (art.carrier) {
      art.x = art.carrier.x; art.y = art.carrier.y; art.z = art.carrier.z;
    } else {
      for (const s of world.soldiers) {
        if (s.alive && Math.hypot(s.x - art.x, s.y - art.y, s.z - art.z) < s.r + art.r) {
          art.carrier = s;
          world.events.push({ type: "pickup", x: art.x, y: art.y, z: art.z });
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
  if (held && ex && living.some((s) => Math.hypot(s.x - ex.x, s.y - ex.y, s.z - ex.z) < ex.r)) world.end = { success: true };
}

// ---- derelicts (F3) ------------------------------------------------------------
// The 2D layout (addDerelict, run on a scratch world at the origin) given a
// height H: every wall a slab from deck to ceiling, a deck and a ceiling plate
// over the hull outline, and every gap in a wall turned into a hole — a door
// from the deck up, a breach centred on the wall — by the slabs above and
// below it. All of a ruin's solids are in its own frame: x along its length,
// y across, z up; `q` turns that frame into the world's.
function placeRuins(world, want) {
  const { rng, size } = world;
  const count = want ?? CFG.ruinsMin + Math.floor(rng() * (CFG.ruinsMax - CFG.ruinsMin + 1));
  let tries = 0;
  while (world.ruins.length < count && tries++ < 400) {
    const L = rand(rng, CFG.derelictL[0], CFG.derelictL[1]);
    const W = rand(rng, CFG.derelictW[0], CFG.derelictW[1]);
    const H = rand(rng, CFG.derelictH[0], CFG.derelictH[1]);
    const R = Math.hypot(L / 2, W / 2, H / 2) + CFG.wallHalf;
    const x = rand(rng, R + 60, size - R - 60), y = rand(rng, R + 60, size - R - 60), z = rand(rng, R + 60, size - R - 60);
    const st = world.start;
    if (Math.hypot(x - st.x, y - st.y, z - st.z) < CFG.ruinStartGap + R) continue;
    if (world.ruins.some((o) => Math.hypot(o.x - x, o.y - y, o.z - z) < CFG.ruinGap)) continue;
    const q = qaxis(randomDir(rng), rng() * Math.PI * 2);
    const scratch = { rng, walls: [], ruins: [], keepClear: [] };
    addRuin3(world, addDerelict(scratch, 0, 0, 0, L, W), x, y, z, q, H);
  }
}

// A 2D layout (from addDerelict or addRuin at the origin) → a ruin in 3D.
export function addRuin3(world, lay, x, y, z, q, H) {
  const t = CFG.wallHalf;
  const solids = [];
  const wall = (a, b, z0, z1) => solids.push({ kind: "wall", a, b, z0, z1, t });
  for (const w of lay.walls) {
    wall([w.x0, w.y0], [w.x1, w.y1], -H / 2, H / 2);
    solids[solids.length - 1].hull = onHull(lay.hull, (w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2);
  }
  // Each opening: the gap it sits in runs along the wall that ends beside it.
  const holes = [];
  for (const [ox, oy] of lay.openings) {
    let dir = null;
    for (const w of lay.walls) {
      for (const [ex, ey] of [[w.x0, w.y0], [w.x1, w.y1]]) {
        if (Math.abs(Math.hypot(ex - ox, ey - oy) - CFG.breach / 2) < 0.5) {
          const l = Math.hypot(w.x1 - w.x0, w.y1 - w.y0);
          dir = [(w.x1 - w.x0) / l, (w.y1 - w.y0) / l];
        }
      }
    }
    if (!dir) continue;
    const h = CFG.breach / 2;
    const a = [ox - dir[0] * h, oy - dir[1] * h], b = [ox + dir[0] * h, oy + dir[1] * h];
    const breach = onHull(lay.hull, ox, oy);
    if (breach) {
      wall(a, b, CFG.breachH / 2, H / 2);
      wall(a, b, -H / 2, -CFG.breachH / 2);
    } else wall(a, b, -H / 2 + CFG.doorH, H / 2);
    holes.push({ at: [ox, oy, breach ? 0 : -H / 2 + CFG.doorH / 2], breach });
  }
  solids.push({ kind: "plate", poly: lay.hull, zc: -H / 2, t });
  solids.push({ kind: "plate", poly: lay.hull, zc: H / 2, t });
  let reach = 0;
  for (const [hx, hy] of lay.hull) reach = Math.max(reach, Math.hypot(hx, hy));
  for (const sd of solids) {
    if (sd.kind === "wall") {
      const l = Math.hypot(sd.b[0] - sd.a[0], sd.b[1] - sd.a[1]);
      sd.c = [(sd.a[0] + sd.b[0]) / 2, (sd.a[1] + sd.b[1]) / 2, (sd.z0 + sd.z1) / 2];
      sd.R = Math.hypot(l / 2, (sd.z1 - sd.z0) / 2) + t;
    } else {
      sd.c = [0, 0, sd.zc];
      sd.R = reach + t;
    }
  }
  const ruin = {
    kind: "ruin",
    x, y, z, q, H,
    L: lay.L, W: lay.W,
    R: Math.hypot(reach, H / 2) + t,
    hull: lay.hull,
    solids,
    holes,
    aft: ruinToWorld({ x, y, z, q }, [lay.aft[0], lay.aft[1], 0]),
    rooms: lay.rooms.map(([rx, ry]) => ruinToWorld({ x, y, z, q }, [rx, ry, 0])),
  };
  for (const sd of solids) sd.ruin = ruin;
  world.ruins.push(ruin);
  world.keepClear.push({ x, y, z, r: ruin.R + 20 });
  return ruin;
}

function onHull(hull, x, y) {
  for (let i = 0; i < hull.length; i++) {
    const [ax, ay] = hull[i], [bx, by] = hull[(i + 1) % hull.length];
    const ex = bx - ax, ey = by - ay;
    const k = clamp(((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey), 0, 1);
    if (Math.hypot(ax + ex * k - x, ay + ey * k - y) < 1) return true;
  }
  return false;
}

export const ruinToLocal = (r, p) => qrot(qconj(r.q), [p[0] - r.x, p[1] - r.y, p[2] - r.z]);
export const ruinToWorld = (r, l) => { const p = qrot(r.q, l); return [p[0] + r.x, p[1] + r.y, p[2] + r.z]; };

export function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The nearest point of a solid's core to a local point: a wall's core is its
// segment swept over its height, a plate's its outline at its height. The
// solid is the core grown by t, so its edges are rounded.
export function coreClosest(sd, l) {
  if (sd.kind === "wall") {
    const ex = sd.b[0] - sd.a[0], ey = sd.b[1] - sd.a[1];
    const k = clamp(((l[0] - sd.a[0]) * ex + (l[1] - sd.a[1]) * ey) / (ex * ex + ey * ey || 1), 0, 1);
    return [sd.a[0] + ex * k, sd.a[1] + ey * k, clamp(l[2], sd.z0, sd.z1)];
  }
  if (inPoly(sd.poly, l[0], l[1])) return [l[0], l[1], sd.zc];
  let best = null, bd = Infinity;
  const P = sd.poly;
  for (let i = 0; i < P.length; i++) {
    const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
    const ex = bx - ax, ey = by - ay;
    const k = clamp(((l[0] - ax) * ex + (l[1] - ay) * ey) / (ex * ex + ey * ey), 0, 1);
    const cx = ax + ex * k, cy = ay + ey * k;
    const d = (cx - l[0]) ** 2 + (cy - l[1]) ** 2;
    if (d < bd) { bd = d; best = [cx, cy, sd.zc]; }
  }
  return best;
}

// The solids of a ruin within `pad` of a local point, by bounding sphere.
function solidsNear(r, l, pad) {
  const out = [];
  for (const sd of r.solids) {
    const dx = l[0] - sd.c[0], dy = l[1] - sd.c[1], dz = l[2] - sd.c[2];
    const m = sd.R + pad;
    if (dx * dx + dy * dy + dz * dz <= m * m) out.push(sd);
  }
  return out;
}

// The nearest solid surface of a ruin to a world point within `range`:
// { sd, d (from the surface), n (world normal, outward), p (local) } or null.
export function ruinSurface(r, p, range, l = ruinToLocal(r, p)) {
  let best = null;
  for (const sd of solidsNear(r, l, range)) {
    const c = coreClosest(sd, l);
    const dx = l[0] - c[0], dy = l[1] - c[1], dz = l[2] - c[2];
    const dc = Math.hypot(dx, dy, dz);
    const d = dc - sd.t;
    if (d > range || (best && d >= best.d)) continue;
    const nl = dc > 1e-9 ? [dx / dc, dy / dc, dz / dc] : [0, 0, 1];
    best = { sd, d, nl };
  }
  if (best) best.n = qrot(r.q, best.nl);
  return best;
}

// First t in [0,1] where a round of radius pr on local p0→p1 meets a solid,
// tested as a box (a wall) or a band through the outline (a plate).
function segSolid(sd, p0, p1, pr) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  if (sd.kind === "wall") {
    const ex = sd.b[0] - sd.a[0], ey = sd.b[1] - sd.a[1];
    const L = Math.hypot(ex, ey) || 1;
    const axes = [[ex / L, ey / L, 0], [-ey / L, ex / L, 0], [0, 0, 1]];
    const half = [L / 2 + sd.t + pr, sd.t + pr, (sd.z1 - sd.z0) / 2 + sd.t + pr];
    let t0 = 0, t1 = 1;
    for (let i = 0; i < 3; i++) {
      const a = axes[i];
      const o = (p0[0] - sd.c[0]) * a[0] + (p0[1] - sd.c[1]) * a[1] + (p0[2] - sd.c[2]) * a[2];
      const v = d[0] * a[0] + d[1] * a[1] + d[2] * a[2];
      if (Math.abs(v) < 1e-12) {
        if (Math.abs(o) > half[i]) return null;
        continue;
      }
      let ta = (-half[i] - o) / v, tb = (half[i] - o) / v;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    return t0;
  }
  const band = sd.t + pr;
  const o = p0[2] - sd.zc;
  let ta, tb;
  if (Math.abs(d[2]) < 1e-12) {
    if (Math.abs(o) > band) return null;
    ta = 0; tb = 1;
  } else {
    ta = (-band - o) / d[2]; tb = (band - o) / d[2];
    if (ta > tb) [ta, tb] = [tb, ta];
    ta = Math.max(0, ta); tb = Math.min(1, tb);
    if (ta > tb) return null;
  }
  for (const k of [ta, tb]) {
    if (inPoly(sd.poly, p0[0] + d[0] * k, p0[1] + d[1] * k)) return ta;
  }
  return null;
}

// First t along world segment a→b (radius pr) that meets any ruin, or null.
export function segRuins(world, x0, y0, z0, x1, y1, z1, pr) {
  let bt = null;
  for (const r of world.ruins) {
    if (segSphere(x0, y0, z0, x1, y1, z1, r.x, r.y, r.z, r.R + pr) === null) continue;
    const p0 = ruinToLocal(r, [x0, y0, z0]), p1 = ruinToLocal(r, [x1, y1, z1]);
    for (const sd of r.solids) {
      const t = segSolid(sd, p0, p1, pr);
      if (t !== null && (bt === null || t < bt)) bt = t;
    }
  }
  return bt;
}

// A body (or a rock) against a ruin: pushed out of each solid it overlaps
// along that solid's normal, and what was moving into it reflected. The
// closing speed, for crash.
function collideRuin(b, r, e) {
  let worst = 0;
  for (let it = 0; it < 4; it++) {
    const hit = ruinSurface(r, [b.x, b.y, b.z], b.r);
    if (!hit || hit.d >= b.r) break;
    const [nx, ny, nz] = hit.n;
    const push = b.r - hit.d;
    b.x += nx * push; b.y += ny * push; b.z += nz * push;
    foldShove(b);
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    if (vn < 0) {
      b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; b.vz -= (1 + e) * vn * nz;
      worst = Math.max(worst, -vn);
    }
  }
  return worst;
}

// ---- artifact and extraction --------------------------------------------------
function placeObjective(world) {
  const { rng, size } = world;
  if (world.ruins.length) {
    const host = world.ruins[Math.floor(rng() * world.ruins.length)];
    world.artifact = { x: host.aft[0], y: host.aft[1], z: host.aft[2], r: CFG.artifactR, carrier: null, ruin: host };
  } else {
    world.artifact = { x: size / 2, y: size / 2, z: size / 2, r: CFG.artifactR, carrier: null, ruin: null };
  }
  const r = CFG.extractR;
  const st = world.start;
  for (let tries = 0; tries < 400; tries++) {
    const x = rand(rng, r + 40, size - r - 40), y = rand(rng, r + 40, size - r - 40), z = rand(rng, r + 40, size - r - 40);
    if (Math.hypot(x - st.x, y - st.y, z - st.z) < CFG.extractMinDist) continue;
    if (world.ruins.some((o) => Math.hypot(o.x - x, o.y - y, o.z - z) < o.R + r + 40)) continue;
    world.extract = { x, y, z, r };
    break;
  }
  // Fallback: the far corner, which always clears the distance.
  if (!world.extract) world.extract = { x: size - st.x, y: size - st.y, z: size - st.z, r };
  world.keepClear.push({ x: world.extract.x, y: world.extract.y, z: world.extract.z, r });
}

// ---- motion + collision ----------------------------------------------------
// Rocks are slow: they move once a step and meet each other once a step.
// Bodies are fast and few: they move in substeps, so none travels more than
// half the smallest body radius per substep (the 2D rule: discrete sphere
// tests cannot tunnel), each meeting only the rocks the grid puts near it.
function integrate(world, dt) {
  for (const a of world.asteroids) {
    const f = a.slow && a.slow.time > 0 ? a.slow.factor : 1;
    a.x += a.vx * dt * f; a.y += a.vy * dt * f; a.z += a.vz * dt * f;
    spinBy(a, dt);
  }
  world.grid = null;
  collideRocks(world);

  const list = [];
  for (const s of world.soldiers) if (s.alive) list.push(s);
  for (const e of world.enemies) if (e.alive) list.push(e);
  let maxV = 0;
  let minR = Infinity;
  for (const b of list) {
    minR = Math.min(minR, b.r);
    if (b.boots === "ground") continue;
    maxV = Math.max(maxV, Math.hypot(b.vx + (b.sx || 0), b.vy + (b.sy || 0), b.vz + (b.sz || 0)));
  }
  const n = Math.max(1, Math.ceil((maxV * dt) / (minR * 0.5)));
  const h = dt / n;
  const e = CFG.restitution;
  for (let k = 0; k < n; k++) {
    for (const b of list) {
      if (b.boots === "ground") continue;
      // Slow scales the body's whole displacement (the game scales horizontal).
      const f = b.slow && b.slow.time > 0 ? b.slow.factor : 1;
      b.x += (b.vx + (b.sx || 0)) * h * f;
      b.y += (b.vy + (b.sy || 0)) * h * f;
      b.z += (b.vz + (b.sz || 0)) * h * f;
    }
    for (const b of list) {
      if (!b.alive) continue;
      // Bodies pass through each other; only rocks and hulls bounce things (P7).
      const pad = b.r;
      for (const a of rocksNear(world, b.x - pad, b.y - pad, b.z - pad, b.x + pad, b.y + pad, b.z + pad)) {
        if (b.boots) { bootContact(world, b, a); continue; }
        const body = isBody(b);
        const v = body ? closing(a, b) : 0;
        if (collide(a, b, e) && body) crash(world, b, v);
      }
      for (const r of world.ruins) {
        if (Math.hypot(b.x - r.x, b.y - r.y, b.z - r.z) > r.R + b.r) continue;
        if (b.boots) { bootRuin(world, b, r); continue; }
        const v = collideRuin(b, r, e);
        if (v && isBody(b)) crash(world, b, v);
      }
      edge(b, world.size, e);
    }
  }
}

// A rock turns by its angular velocity.
function spinBy(a, h) {
  const om = len(a.w);
  if (!om) return;
  a.q = qnorm(qmul(qaxis([a.w[0] / om, a.w[1] / om, a.w[2] / om], om * h), a.q));
}

// Rock against rock (sweep and prune along x), against hulls, and the cube.
function collideRocks(world) {
  const e = CFG.restitution;
  const list = world.asteroids.slice().sort((a, b) => a.x - a.r - (b.x - b.r));
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const hi = a.x + a.r;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.x - b.r > hi) break;
      collide(a, b, e);
    }
  }
  for (const a of list) {
    for (const r of world.ruins) {
      if (Math.hypot(a.x - r.x, a.y - r.y, a.z - r.z) > r.R + a.r) continue;
      collideRuin(a, r, e);
    }
    edge(a, world.size, e);
  }
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

// ---- the rock grid --------------------------------------------------------------
// Rocks bucketed by cell, rebuilt each step, so a round or a line of sight
// tests only the rocks near it. A rock is in every cell its sphere touches.
function rockGrid(world) {
  if (world.grid && world.grid.t === world.t) return world.grid;
  const C = CFG.gridCell;
  const n = Math.ceil(world.size / C);
  const cells = new Map();
  const cl = (v) => clamp(Math.floor(v / C), 0, n - 1);
  for (const a of world.asteroids) {
    const pad = a.r + 60; // drift between rebuilds, and the widest round
    for (let i = cl(a.x - pad); i <= cl(a.x + pad); i++)
      for (let j = cl(a.y - pad); j <= cl(a.y + pad); j++)
        for (let k = cl(a.z - pad); k <= cl(a.z + pad); k++) {
          const key = (i * n + j) * n + k;
          let c = cells.get(key);
          if (!c) cells.set(key, (c = []));
          c.push(a);
        }
  }
  world.grid = { t: world.t, cells, n, C };
  return world.grid;
}

// Rocks whose cells a segment's box touches, each once. The once is a stamp
// on the rock, from one counter for the whole module: a per-grid counter
// restarts and meets stamps an older grid left behind.
let stamp = 0;
export function rocksNear(world, x0, y0, z0, x1, y1, z1, pad = 0) {
  const g = rockGrid(world);
  const cl = (v) => clamp(Math.floor(v / g.C), 0, g.n - 1);
  const out = [];
  const st = ++stamp;
  for (let i = cl(Math.min(x0, x1) - pad); i <= cl(Math.max(x0, x1) + pad); i++)
    for (let j = cl(Math.min(y0, y1) - pad); j <= cl(Math.max(y0, y1) + pad); j++)
      for (let k = cl(Math.min(z0, z1) - pad); k <= cl(Math.max(z0, z1) + pad); k++) {
        const c = g.cells.get((i * g.n + j) * g.n + k);
        if (!c) continue;
        for (const a of c) if (a._st !== st) { a._st = st; out.push(a); }
      }
  return out;
}

// First t in [0,1] where segment p0→p1 comes within R of c, or null.
export function segSphere(x0, y0, z0, x1, y1, z1, cx, cy, cz, R) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const fx = x0 - cx, fy = y0 - cy, fz = z0 - cz;
  const c = fx * fx + fy * fy + fz * fz - R * R;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy + dz * dz;
  if (a === 0) return null;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export function hasLos(world, a, b) {
  for (const r of rocksNear(world, a.x, a.y, a.z, b.x, b.y, b.z)) {
    if (segSphere(a.x, a.y, a.z, b.x, b.y, b.z, r.x, r.y, r.z, r.r) !== null) return false;
  }
  return segRuins(world, a.x, a.y, a.z, b.x, b.y, b.z, 0) === null;
}

// ---- firing (fire(), src/mission/ai.js) ------------------------------------
const opponentsOf = (world, team) => (team === "player" ? world.enemies : world.soldiers);

// A direction within `spread` of d (unit), evenly over the cone's disc (F7).
function inCone(rng, d, spread) {
  if (!spread) return d;
  const a = spread * Math.sqrt(rng());
  const ph = rng() * Math.PI * 2;
  const p1 = perp(d), p2 = cross(d, p1);
  const s = Math.sin(a), c = Math.cos(a);
  return norm([
    d[0] * c + (p1[0] * Math.cos(ph) + p2[0] * Math.sin(ph)) * s,
    d[1] * c + (p1[1] * Math.cos(ph) + p2[1] * Math.sin(ph)) * s,
    d[2] * c + (p1[2] * Math.cos(ph) + p2[2] * Math.sin(ph)) * s,
  ]);
}

export function fire(world, shooter, dir, accuracy = 1) {
  if (shooter.fireCd > 0) return false;
  if (shooter.reloading > 0) return false;
  if (shooter.ammo !== undefined && shooter.ammo <= 0) {
    world.events.push({ type: "dry", x: shooter.x, y: shooter.y, z: shooter.z });
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
  const pierce = w.effects.find((e) => e.kind === "pierce");
  const own = shooter === controlled(world);
  for (let i = 0; i < count; i++) {
    const d = inCone(world.rng, dir, spread);
    world.projectiles.push({
      x: shooter.x + d[0] * (shooter.r + 6),
      y: shooter.y + d[1] * (shooter.r + 6),
      z: shooter.z + d[2] * (shooter.r + 6),
      vx: d[0] * spec.speed, vy: d[1] * spec.speed, vz: d[2] * spec.speed,
      r: Math.max(2, Math.min(spec.w, spec.h) / 2),
      w: spec.w, h: spec.h,
      color: spec.color,
      shape: spec.shape,
      life: spec.life,
      age: 0,
      team: shooter.team,
      owner: shooter,
      own,
      effects: w.effects,
      pierceLeft: pierce ? pierce.count || 0 : 0,
      hit: null,
      dead: false,
    });
  }
  shooter.muzzle = 0.055;
  const k = shooter.r + 14;
  world.events.push({ type: "muzzle", x: shooter.x + dir[0] * k, y: shooter.y + dir[1] * k, z: shooter.z + dir[2] * k, color: spec.color, shape: spec.shape, team: shooter.team, pellets: count > 1, own });
  return true;
}

// ---- projectiles (updateProjectiles, src/mission/combat.js) ----------------
const WALL = { kind: "wall" }; // what a round stopped on, when it was a ruin
// Swept: each step a round is a segment, and the EARLIEST thing along it wins.
function updateProjectiles(world, dt) {
  for (const p of world.projectiles) {
    if (p.dead) continue;
    steerHoming(world, p, dt);
    const x0 = p.x, y0 = p.y, z0 = p.z;
    const x1 = x0 + p.vx * dt, y1 = y0 + p.vy * dt, z1 = z0 + p.vz * dt;
    p.life -= dt;
    p.age += dt;
    if (p.life <= 0) { p.dead = true; continue; }

    let best = null;
    let bt = Infinity;
    for (const a of rocksNear(world, x0, y0, z0, x1, y1, z1, p.r)) {
      const t = segSphere(x0, y0, z0, x1, y1, z1, a.x, a.y, a.z, a.r + p.r);
      if (t !== null && t < bt) { bt = t; best = a; }
    }
    const tw = segRuins(world, x0, y0, z0, x1, y1, z1, p.r);
    if (tw !== null && tw < bt) { bt = tw; best = WALL; }
    for (const o of opponentsOf(world, p.team)) {
      if (!o.alive || o === p.owner || (p.hit && p.hit.has(o))) continue;
      const t = segSphere(x0, y0, z0, x1, y1, z1, o.x, o.y, o.z, o.r + p.r);
      if (t !== null && t < bt) { bt = t; best = o; }
    }

    if (!best) { p.x = x1; p.y = y1; p.z = z1; continue; }
    const hx = x0 + (x1 - x0) * bt, hy = y0 + (y1 - y0) * bt, hz = z0 + (z1 - z0) * bt;
    if (best.kind === "asteroid" || best === WALL) {
      p.dead = true;
      p.x = hx; p.y = hy; p.z = hz;
      if (best.kind === "asteroid") {
        const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
        const k = CFG.bulletPush / best.m / sp;
        best.vx += p.vx * k; best.vy += p.vy * k; best.vz += p.vz * k;
      }
      world.events.push({ type: "spark", x: hx, y: hy, z: hz, color: p.color });
      // The 2D deviation: an explosive round detonates on terrain.
      for (const fx of p.effects) if (fx.kind === "explode") explode(world, fx, hx, hy, hz, p.team, p.owner);
      continue;
    }
    applyEffects(world, best, p.effects, p.owner, { x: hx, y: hy, z: hz, vx: p.vx, vy: p.vy, vz: p.vz, team: p.team });
    world.events.push({ type: "hit", x: hx, y: hy, z: hz, color: p.color, own: p.own, kill: !best.alive });
    if (p.pierceLeft > 0) {
      p.pierceLeft--;
      (p.hit || (p.hit = new Set())).add(best);
      p.x = x1; p.y = y1; p.z = z1;
    } else {
      p.dead = true;
      p.x = hx; p.y = hy; p.z = hz;
    }
  }
  world.projectiles = world.projectiles.filter((p) => !p.dead);
}

function nearestOpponent(world, p) {
  let best = null, bd = Infinity;
  for (const o of opponentsOf(world, p.team)) {
    if (!o.alive || o === p.owner) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// Homing turns the round's velocity toward the nearest opponent, at most
// homing.turn rad/s.
function steerHoming(world, p, dt) {
  const homing = p.effects.find((e) => e.kind === "homing");
  if (!homing) return;
  const target = nearestOpponent(world, p);
  if (!target) return;
  const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
  const cur = [p.vx / sp, p.vy / sp, p.vz / sp];
  const want = norm([target.x - p.x, target.y - p.y, target.z - p.z]);
  const ang = Math.acos(clamp(dot(cur, want), -1, 1));
  if (!ang) return;
  const turn = Math.min(ang, (homing.turn || 3) * dt);
  const axis = norm(cross(cur, want));
  const d = len(axis) ? qrot(qaxis(axis, turn), cur) : cur;
  p.vx = d[0] * sp; p.vy = d[1] * sp; p.vz = d[2] * sp;
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
        const sp = Math.hypot(at.vx, at.vy, at.vz) || 1;
        shove(target, (at.vx / sp) * v, (at.vy / sp) * v, (at.vz / sp) * v);
        break;
      }
      case "explode":
        explode(world, fx, at.x, at.y, at.z, at.team, owner);
        break;
      case "chain": {
        const pool = opponentsOf(world, at.team).filter((o) => o.alive && o !== target);
        const done = new Set([target]);
        let from = target;
        for (let j = 0; j < (fx.jumps || 0); j++) {
          let next = null, bd = Infinity;
          for (const o of pool) {
            if (done.has(o)) continue;
            const d = Math.hypot(o.x - from.x, o.y - from.y, o.z - from.z);
            if (d <= (fx.range || 0) && d < bd) { bd = d; next = o; }
          }
          if (!next) break;
          world.events.push({ type: "chain", x: next.x, y: next.y, z: next.z, from: [from.x, from.y, from.z], to: [next.x, next.y, next.z] });
          hurt(world, next, (fx.amount || 0) * mult, owner);
          done.add(next);
          from = next;
        }
        break;
      }
    }
  }
}

// Damages opponents in the radius (the direct target again, as the game does)
// and pushes rocks (answer 4). Bodies are not pushed (P8).
export function explode(world, fx, x, y, z, team, owner) {
  const mult = owner && owner.kind === "soldier" ? CFG.playerDamageMult : 1;
  const R = fx.radius || 0;
  world.events.push({ type: "explode", x, y, z, r: R });
  for (const o of opponentsOf(world, team)) {
    if (o.alive && Math.hypot(o.x - x, o.y - y, o.z - z) <= R) hurt(world, o, (fx.amount || 0) * mult, owner);
  }
  for (const a of world.asteroids) {
    const dx = a.x - x, dy = a.y - y, dz = a.z - z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const reach = R + a.r;
    if (d >= reach) continue;
    const k = (CFG.blastPush * (1 - d / reach)) / a.m / d;
    a.vx += dx * k; a.vy += dy * k; a.vz += dz * k;
  }
}

// ---- magnetic boots (F4; tech/space-magboots.md in 3D) ----------------------------
// Shift clamps on within bootsReach of any surface (F12: in first person you
// cannot see your feet). In the air with the boots on, gravity pulls toward
// the nearest surface and the body turns its feet to it; with nothing within
// bootsHold, they let go. Standing, up is the surface's normal: a rock carries
// you as it drifts and spins, and on a derelict you walk over edges and up
// inside corners onto the next slab.

// The nearest surface to a body within `range` of its own skin:
// { g (a rock or a slab), d, n (world, from the surface to the body) } or null.
export function nearestSurface(world, s, range) {
  let best = null;
  const pad = range + s.r;
  for (const a of rocksNear(world, s.x - pad, s.y - pad, s.z - pad, s.x + pad, s.y + pad, s.z + pad)) {
    const dx = s.x - a.x, dy = s.y - a.y, dz = s.z - a.z;
    const dc = Math.hypot(dx, dy, dz) || 1e-9;
    const d = dc - a.r - s.r;
    if (d <= range && (!best || d < best.d)) best = { g: a, d, n: [dx / dc, dy / dc, dz / dc] };
  }
  for (const r of world.ruins) {
    if (Math.hypot(s.x - r.x, s.y - r.y, s.z - r.z) > r.R + pad) continue;
    const hit = ruinSurface(r, [s.x, s.y, s.z], pad);
    if (hit && hit.d - s.r <= range && (!best || hit.d - s.r < best.d)) best = { g: hit.sd, d: hit.d - s.r, n: hit.n };
  }
  return best;
}

// For the HUD: "on", "ready" (Shift would clamp) or null.
export function bootsState(world, s) {
  if (!s || !s.alive) return null;
  if (s.boots) return s.boots === "ground" ? "on" : "pull";
  return nearestSurface(world, s, CFG.bootsReach) ? "ready" : null;
}

export function toggleBoots(world, s) {
  if (s.boots) bootsOff(s, world);
  else if (nearestSurface(world, s, CFG.bootsReach)) {
    s.boots = "air";
    world.events.push({ type: "boots", on: true, x: s.x, y: s.y, z: s.z });
  }
}

// The head's pitch goes back into the body as it leaves a surface, so the
// look does not move.
function takeOff(s) {
  if (s.pitch) s.q = qnorm(qmul(s.q, qaxis([1, 0, 0], s.pitch)));
  s.pitch = 0;
  s.ground = null;
  s.gv = [0, 0];
  s.walkIn = [0, 0];
}

export function bootsOff(s, world = null) {
  if (world && s.boots) world.events.push({ type: "boots", on: false, x: s.x, y: s.y, z: s.z });
  s.boots = null;
  takeOff(s);
}

export function jump(world, s) {
  const u = upOf(s);
  takeOff(s);
  s.boots = "air";
  s.vx += u[0] * CFG.jumpSpeed; s.vy += u[1] * CFG.jumpSpeed; s.vz += u[2] * CFG.jumpSpeed;
  world.events.push({ type: "jump", x: s.x, y: s.y, z: s.z });
}

// In the air with the boots on: pulled toward the nearest surface, and the
// feet turned to it at the body's turn rate.
function bootsPull(world, s, dt) {
  if (s.boots !== "air") return;
  const hit = nearestSurface(world, s, CFG.bootsHold);
  if (!hit) return;
  const [nx, ny, nz] = hit.n;
  s.vx -= nx * CFG.gravity * dt; s.vy -= ny * CFG.gravity * dt; s.vz -= nz * CFG.gravity * dt;
  turnUp(s, hit.n, CFG.turnRate * dt);
}

// Turn a body so its up heads for n, at most `max` radians; the eye keeps
// what it saw and eases after.
export function turnUp(s, n, max = Math.PI) {
  const r = qlimit(qfromTo(upOf(s), n), max);
  if (qangle(r) < 1e-9) return;
  const cam = qmul(lookQ(s), s.viewOff);
  s.q = qnorm(qmul(r, s.q));
  s.viewOff = qnorm(qmul(qconj(lookQ(s)), cam));
}

// Landing or standing: up becomes n exactly, the body faces the look's
// direction along the surface, and the rest of the look becomes the head's
// pitch — the look itself does not move; the eye rolls to the new up.
function standAlign(s, n) {
  const cam = qmul(lookQ(s), s.viewOff);
  const look = lookOf(s);
  let f = [look[0] - n[0] * dot(look, n), look[1] - n[1] * dot(look, n), look[2] - n[2] * dot(look, n)];
  if (len(f) < 0.05) f = fwdOf(qmul(qfromTo(upOf(s), n), s.q));
  f = norm([f[0] - n[0] * dot(f, n), f[1] - n[1] * dot(f, n), f[2] - n[2] * dot(f, n)]);
  s.pitch = clamp(Math.asin(clamp(dot(look, n), -1, 1)), -CFG.pitchMax, CFG.pitchMax);
  s.q = qlook(f, n);
  s.viewOff = qnorm(qmul(qconj(lookQ(s)), cam));
}

function landOn(world, s, g, n, speed) {
  s.boots = "ground";
  s.ground = g;
  s.gv = [0, 0];
  s.walkIn = [0, 0];
  s.pushed = 0;
  s.stride = 0;
  standAlign(s, n);
  if (g.kind === "asteroid") {
    s.gn = qrot(qconj(g.q), n); // where on the rock, in its own frame
    s.gq = g.q.slice(); // the rock's turn when last settled
    [s.vx, s.vy, s.vz] = surfaceVel(g, s);
  } else s.vx = s.vy = s.vz = 0;
  world.events.push({ type: "land", x: s.x, y: s.y, z: s.z, speed, ctrl: s === controlled(world) });
}

// A rock's surface velocity (drift + spin) at a body.
function surfaceVel(a, p) {
  const r = [p.x - a.x, p.y - a.y, p.z - a.z];
  const w = cross(a.w, r);
  return [a.vx + w[0], a.vy + w[1], a.vz + w[2]];
}

// A booted body against a rock: one-sided, never `collide`. It is pushed out
// and loses what it had into the surface, no bounce, and the rock gets no
// impulse (answer 4). Feet-first, within the wedge, it lands.
function bootContact(world, s, a) {
  if (s.ground === a || a.kind !== "asteroid") return;
  const dx = s.x - a.x, dy = s.y - a.y, dz = s.z - a.z;
  const min = s.r + a.r;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2) || 1e-4;
  const n = [dx / d, dy / d, dz / d];
  s.x += n[0] * (min - d); s.y += n[1] * (min - d); s.z += n[2] * (min - d);
  boot(world, s, a, n, surfaceVel(a, s), min - d);
}

// The same against a derelict's slabs; a body standing on this ruin is
// placed by walkSolids instead.
function bootRuin(world, s, r) {
  if (s.ground && s.ground.ruin === r) return;
  for (let it = 0; it < 4; it++) {
    const hit = ruinSurface(r, [s.x, s.y, s.z], s.r);
    if (!hit || hit.d >= s.r) return;
    const pen = s.r - hit.d;
    s.x += hit.n[0] * pen; s.y += hit.n[1] * pen; s.z += hit.n[2] * pen;
    boot(world, s, hit.sd, hit.n, [0, 0, 0], pen);
    if (s.boots === "ground") return;
  }
}

function boot(world, s, g, n, sv, pen) {
  const vn = (s.vx - sv[0]) * n[0] + (s.vy - sv[1]) * n[1] + (s.vz - sv[2]) * n[2];
  if (s.boots === "ground") {
    // Standing, a rock that runs into you still hits you.
    s.pushed += pen;
    crash(world, s, -vn);
    return;
  }
  foldShove(s);
  const vn2 = (s.vx - sv[0]) * n[0] + (s.vy - sv[1]) * n[1] + (s.vz - sv[2]) * n[2];
  const lands = dot(n, upOf(s)) >= Math.cos(CFG.bootsWedge);
  crash(world, s, -vn2, lands ? CFG.landSafe : CFG.crashSafe);
  if (vn2 < 0) { s.vx -= vn2 * n[0]; s.vy -= vn2 * n[1]; s.vz -= vn2 * n[2]; }
  if (lands && s.alive) landOn(world, s, g, n, Math.max(0, -vn2));
}

// Walk a body standing on a derelict along world tangent d: in steps of at
// most `stepLen`, each snapped onto the nearest slab, then out of any other it
// lies in. The ground is then, of the slabs it touches, the one most against
// the move — at an inside corner that is the next slab, which is how up turns
// from one to the other. The body (and the walk direction) turn with the
// normal, so a heading carries over an edge. Returns the final normal.
export function walkSolids(b, d, stepLen = 2) {
  const r = b.ground.ruin;
  const R = b.r;
  const dist = len(d);
  const n = Math.max(1, Math.ceil(dist / stepLen));
  let dir = dist ? [d[0] / dist, d[1] / dist, d[2] / dist] : null;
  let l = ruinToLocal(r, [b.x, b.y, b.z]);
  let nl = solidNormal(b.ground, l);
  const iq = qconj(r.q);
  let dirL = dir ? qrot(iq, dir) : null;
  for (let k = 0; k <= n; k++) {
    if (k > 0 && dirL) {
      // Along the surface: the part of the heading in the tangent plane.
      const dn = dot(dirL, nl);
      const tl = norm([dirL[0] - nl[0] * dn, dirL[1] - nl[1] * dn, dirL[2] - nl[2] * dn]);
      const step = dist / n;
      l = [l[0] + tl[0] * step, l[1] + tl[1] * step, l[2] + tl[2] * step];
    }
    const near = solidsNear(r, l, R + stepLen + 4);
    let g = b.ground, gd = surfDist(g, l);
    for (const o of near) {
      const od = surfDist(o, l);
      if (od < gd - 1e-6) { gd = od; g = o; }
    }
    l = placeOff(g, l, R);
    for (let it = 0; it < 16; it++) {
      let hit = null;
      for (const o of near) if (surfDist(o, l) < R - 1e-6) { hit = o; break; }
      if (!hit) break;
      l = placeOff(hit, l, R);
    }
    let pick = null, against = Infinity;
    for (const o of near) {
      if (surfDist(o, l) > R + 1e-3) continue;
      const on = solidNormal(o, l);
      const a = dirL ? dot(on, dirL) : 0;
      if (a < against - 1e-9 || (a < against + 1e-9 && o === b.ground)) { against = a; pick = o; }
    }
    b.ground = pick || g;
    const nn = solidNormal(b.ground, l);
    const turn = qfromTo(nl, nn);
    if (dirL) dirL = qrot(turn, dirL);
    // The same turn, in the world, for the body.
    const tw = qmul(qmul(r.q, turn), iq);
    b.q = qnorm(qmul(tw, b.q));
    nl = nn;
  }
  const p = ruinToWorld(r, l);
  b.x = p[0]; b.y = p[1]; b.z = p[2];
  return qrot(r.q, nl);
}

const surfDist = (sd, l) => {
  const c = coreClosest(sd, l);
  return Math.hypot(l[0] - c[0], l[1] - c[1], l[2] - c[2]) - sd.t;
};
function solidNormal(sd, l) {
  const c = coreClosest(sd, l);
  const v = [l[0] - c[0], l[1] - c[1], l[2] - c[2]];
  const m = len(v);
  return m > 1e-9 ? [v[0] / m, v[1] / m, v[2] / m] : [0, 0, 1];
}
// A local point put R off a slab's surface, straight out from where it is.
function placeOff(sd, l, R) {
  const c = coreClosest(sd, l);
  const nl = solidNormal(sd, l);
  const k = sd.t + R;
  return [c[0] + nl[0] * k, c[1] + nl[1] * k, c[2] + nl[2] * k];
}

// After integrate: a standing body is carried by its rock, walks, and is
// snapped onto the surface; one in the air must still have a surface within
// the hold range.
function settleBoots(world, dt) {
  for (const s of [...world.soldiers, ...world.enemies]) {
    if (!s.alive || !s.boots) continue;
    if (s.boots === "air") {
      if (!nearestSurface(world, s, CFG.bootsHold)) bootsOff(s, world);
      continue;
    }
    // Knocked off: a shove, or a push past the snap tolerance. It keeps its
    // world velocity and falls back under its own boots.
    if (s.pushed > CFG.snapTol || s.sx || s.sy || s.sz) {
      takeOff(s);
      s.boots = "air";
      s.pushed = 0;
      continue;
    }
    s.pushed = 0;
    // Walk: toward walkIn × walkSpeed in the body's own frame (right, forward).
    const wi = s.walkIn || [0, 0];
    const wl = Math.hypot(wi[0], wi[1]);
    const target = wl ? [(wi[0] / Math.max(1, wl)) * CFG.walkSpeed, (wi[1] / Math.max(1, wl)) * CFG.walkSpeed] : [0, 0];
    const ex = target[0] - s.gv[0], ey = target[1] - s.gv[1];
    const e = Math.hypot(ex, ey);
    const rate = (wl ? CFG.walkAccel : CFG.walkFriction) * dt;
    if (e > 0) {
      const k = Math.min(1, rate / e);
      s.gv = [s.gv[0] + ex * k, s.gv[1] + ey * k];
    }
    const speed = Math.hypot(s.gv[0], s.gv[1]);
    const before = Math.floor(s.stride / CFG.footstep);
    s.stride += speed * dt;
    if (Math.floor(s.stride / CFG.footstep) > before) world.events.push({ type: "step", x: s.x, y: s.y, z: s.z });
    const rt = qrot(s.q, [1, 0, 0]), fw = qrot(s.q, [0, 0, -1]);
    const d = [(rt[0] * s.gv[0] + fw[0] * s.gv[1]) * dt, (rt[1] * s.gv[0] + fw[1] * s.gv[1]) * dt, (rt[2] * s.gv[0] + fw[2] * s.gv[1]) * dt];
    const cam = qmul(lookQ(s), s.viewOff);
    const g = s.ground;
    if (g.kind !== "asteroid") {
      walkSolids(s, d);
      s.vx = d[0] / dt; s.vy = d[1] / dt; s.vz = d[2] / dt;
    } else {
      // Carried: the rock's turn since last step turns the body with it.
      const dq = qmul(g.q, qconj(s.gq));
      s.gq = g.q.slice();
      s.q = qnorm(qmul(dq, s.q));
      let n = qrot(g.q, s.gn);
      // Walking on a sphere is turning about its centre.
      const R = g.r + s.r;
      const m = len(d);
      if (m > 1e-9) {
        const turn = qaxis(norm(cross(n, d)), m / R);
        n = norm(qrot(turn, n));
        s.q = qnorm(qmul(turn, s.q));
        s.gn = qrot(qconj(g.q), n);
      }
      s.x = g.x + n[0] * R; s.y = g.y + n[1] * R; s.z = g.z + n[2] * R;
      const sv = surfaceVel(g, s);
      s.vx = sv[0] + d[0] / dt; s.vy = sv[1] + d[1] / dt; s.vz = sv[2] + d[2] / dt;
    }
    // Up is the normal, exactly; the eye keeps what it saw and eases.
    const n = g.kind === "asteroid" ? norm([s.x - g.x, s.y - g.y, s.z - g.z]) : null;
    if (n) {
      const r = qfromTo(upOf(s), n);
      if (qangle(r) > 1e-9) s.q = qnorm(qmul(r, s.q));
    }
    s.viewOff = qnorm(qmul(qconj(lookQ(s)), cam));
  }
}
