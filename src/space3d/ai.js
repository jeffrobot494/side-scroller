// ---------------------------------------------------------------------------
// SPACE FPS — enemies, waves and companions (tech/space-fps.md F5–F6).
//
// The 2D prototype's rules (src/space/sim.js) with a z. DOM-free; every draw
// goes through world.rng. Enemy types and their numbers are the 2D ones,
// imported; the weighted mixes are copied, since the 2D sim keeps them private.
// ---------------------------------------------------------------------------

import { ENEMY_TYPES } from "../space/sim.js";
import { CFG, clamp, controlled, hasLos, fire, hurt, explode, aimAccuracy, startReload, ruinSurface } from "./sim.js";
import { dot, cross, norm, len, qmul, qaxis, qrot, qnorm, qfromTo, qlimit, qangle, fwdOf, randomDir, perp } from "./vec.js";

export { ENEMY_TYPES };

const rand = (rng, lo, hi) => lo + rng() * (hi - lo);
const gap3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Weighted mix for placement and waves (a swarmer entry is a pack), copied
// from 2D. The trooper joins it in F6.
export const ENEMY_MIX = [["charger", 35], ["gunner", 25], ["swarmer", 25], ["minelayer", 15]];
// Who crews a derelict (P16): no mine-layers.
const CREW_MIX = [["gunner", 45], ["charger", 40], ["swarmer", 15]];

// ---- construction + placement ---------------------------------------------------
export function makeEnemy(world, type, x, y, z) {
  const T = ENEMY_TYPES[type];
  const rng = world.rng;
  return {
    kind: "enemy", type, team: "enemy",
    x, y, z, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0,
    r: T.r, m: (T.r / CFG.soldierR) ** 2,
    hp: T.hp, maxHp: T.hp, alive: true,
    burn: null, slow: null, flash: 0, muzzle: 0,
    weapon: T.weapon || null, fireCd: 0,
    alert: false, target: null, los: false,
    senseT: rng() * CFG.senseEvery,
    tele: 0, // > 0 while winding up a shot
    cool: rand(rng, 0.5, 1.5),
    contactCd: 0,
    heading: randomDir(rng), // a wandering direction
    orbitAxis: randomDir(rng), // F8: the plane its orbit runs on
    orbitDir: rng() < 0.5 ? -1 : 1,
    age: 0, owner: null, mines: 0, fuse: 0,
    home: null, // a crewman's room
    route: null, leg: 0, lost: 0,
    burstLeft: 0, burstT: 0,
  };
}

function pickType(rng, mix = ENEMY_MIX) {
  let total = 0;
  for (const [, w] of mix) total += w;
  let k = rng() * total;
  for (const [type, w] of mix) if ((k -= w) < 0) return type;
  return mix[0][0];
}

// A type at a point: a pack is spread round it.
export function spawnGroup(world, type, x, y, z, alert) {
  const T = ENEMY_TYPES[type];
  const n = T.pack || 1;
  const dir = world.rng() < 0.5 ? -1 : 1;
  const axis = randomDir(world.rng);
  const wing = T.soldier && n > 1 ? { members: [], peeker: null } : null; // a trooper pair
  const p1 = perp(axis), p2 = cross(axis, p1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const o = n > 1 ? 40 : 0;
    const e = makeEnemy(world, type, x + (p1[0] * Math.cos(a) + p2[0] * Math.sin(a)) * o, y + (p1[1] * Math.cos(a) + p2[1] * Math.sin(a)) * o, z + (p1[2] * Math.cos(a) + p2[2] * Math.sin(a)) * o);
    e.alert = alert;
    if (n > 1) { e.orbitDir = dir; e.orbitAxis = axis; } // a pack circles one way
    if (wing) { e.wing = wing; wing.members.push(e); }
    world.enemies.push(e);
    out.push(e);
  }
  return out;
}

// Basic enemies are placed at basicShare of the rate they are rolled (2D P19):
// an accumulator, starting half full, so of any two in a row one is kept.
function keepBasic(world, type) {
  const T = ENEMY_TYPES[type];
  if (T.soldier || T.elite) return true;
  world.basicAcc = (world.basicAcc ?? 0.5) + CFG.basicShare;
  if (world.basicAcc < 1) return false;
  world.basicAcc -= 1;
  return true;
}

function freeSpot(world, x, y, z, r) {
  const S = world.size;
  if (x < r || y < r || z < r || x > S - r || y > S - r || z > S - r) return false;
  if (world.asteroids.some((a) => Math.hypot(a.x - x, a.y - y, a.z - z) < a.r + r + 10)) return false;
  if (world.ruins.some((o) => Math.hypot(o.x - x, o.y - y, o.z - z) < o.R + r)) return false;
  return true;
}

export function placeEnemies(world, count, elites) {
  const { rng, size } = world;
  // One gunner guards the hull that holds the artifact, just outside it.
  const host = world.artifact && world.artifact.ruin;
  if (host) {
    const d = randomDir(rng);
    const k = host.R + 60;
    spawnGroup(world, "gunner", host.x + d[0] * k, host.y + d[1] * k, host.z + d[2] * k, false);
  }
  let tries = 0, placed = 0;
  const st = world.start;
  while (placed < count && tries++ < count * 50) {
    const x = rand(rng, 80, size - 80), y = rand(rng, 80, size - 80), z = rand(rng, 80, size - 80);
    if (Math.hypot(x - st.x, y - st.y, z - st.z) < CFG.enemyStartGap) continue;
    if (!freeSpot(world, x, y, z, 60)) continue;
    const type = pickType(rng, world.mix || ENEMY_MIX);
    if (keepBasic(world, type)) spawnGroup(world, type, x, y, z, false);
    placed++;
  }
  placeCrews(world);
  for (let i = 0; i < elites; i++) placeWarden(world);
}

// Each derelict's crew: a group in each of a few rooms, held there while idle.
function placeCrews(world) {
  const { rng } = world;
  for (const r of world.ruins) {
    const rooms = r.rooms.slice();
    const n = Math.min(rooms.length, CFG.crewMin + Math.floor(rng() * (CFG.crewMax - CFG.crewMin + 1)));
    for (let i = 0; i < n; i++) {
      const [x, y, z] = rooms.splice(Math.floor(rng() * rooms.length), 1)[0];
      const type = pickType(rng, CREW_MIX);
      if (!keepBasic(world, type)) continue;
      for (const e of spawnGroup(world, type, x, y, z, false)) e.home = { x, y, z };
    }
  }
}

// A warden and its loop: waypoints in open space away from the start, visited
// in order round the cube's centre so the loop does not cross itself.
export function placeWarden(world) {
  const { rng, size } = world;
  const pts = [];
  const st = world.start;
  for (let tries = 0; pts.length < CFG.patrolPoints && tries < 400; tries++) {
    const x = rand(rng, 300, size - 300), y = rand(rng, 300, size - 300), z = rand(rng, 300, size - 300);
    if (Math.hypot(x - st.x, y - st.y, z - st.z) < CFG.patrolStartGap) continue;
    if (!freeSpot(world, x, y, z, 80)) continue;
    pts.push({ x, y, z });
  }
  if (pts.length < 2) return null;
  const c = size / 2;
  pts.sort((a, b) => Math.atan2(a.y - c, a.x - c) - Math.atan2(b.y - c, b.x - c));
  const leg = Math.floor(rng() * pts.length);
  const e = makeEnemy(world, "warden", pts[leg].x, pts[leg].y, pts[leg].z);
  e.route = pts;
  e.leg = (leg + 1) % pts.length;
  world.enemies.push(e);
  return e;
}

function squadCentre(world) {
  const living = world.soldiers.filter((s) => s.alive);
  if (!living.length) return null;
  let x = 0, y = 0, z = 0;
  for (const s of living) { x += s.x; y += s.y; z += s.z; }
  return { x: x / living.length, y: y / living.length, z: z / living.length };
}

// A wave: at a random 3D bearing from the squad (F9). Bearings whose point the
// cube clamps back toward the squad are rerolled.
export function spawnWave(world) {
  const c = squadCentre(world);
  if (!c) return;
  const alive = world.enemies.filter((e) => e.alive && e.type !== "mine" && e.kind === "enemy").length;
  world.wave.n++;
  if (alive >= CFG.enemyCap) return;
  const { rng, size } = world;
  const count = CFG.waveBase + world.wave.n - 1;
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 16; tries++) {
      const d = randomDir(rng);
      const k = rand(rng, CFG.waveDistMin, CFG.waveDistMax);
      const x = clamp(c.x + d[0] * k, 60, size - 60), y = clamp(c.y + d[1] * k, 60, size - 60), z = clamp(c.z + d[2] * k, 60, size - 60);
      if (Math.hypot(x - c.x, y - c.y, z - c.z) < CFG.waveDistMin * 0.85) continue;
      if (!freeSpot(world, x, y, z, 40)) continue;
      const type = pickType(rng, world.mix || ENEMY_MIX);
      if (keepBasic(world, type)) spawnGroup(world, type, x, y, z, true);
      break;
    }
  }
  world.events.push({ type: "wave", n: world.wave.n });
}

// ---- steering ---------------------------------------------------------------------
export function nearestSoldier(world, e) {
  let best = null, bd = Infinity;
  for (const s of world.soldiers) {
    if (!s.alive) continue;
    const d = gap3(s, e);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// Obstacle avoidance: bend a desired velocity away from the rock or slab the
// body would reach within `look` seconds. Shared by enemies and the squad.
export function avoid(world, b, dv, look = 0.7, ignore = null) {
  const sp = len(dv);
  if (!sp) return dv;
  const u = [dv[0] / sp, dv[1] / sp, dv[2] / sp];
  const reach = sp * look + b.r;
  let p = [0, 0, 0];
  for (const a of world.asteroids) {
    if (a === ignore) continue;
    const r = [a.x - b.x, a.y - b.y, a.z - b.z];
    const ahead = dot(r, u);
    if (ahead <= 0 || ahead > reach + a.r) continue;
    const lat = [r[0] - u[0] * ahead, r[1] - u[1] * ahead, r[2] - u[2] * ahead];
    const ll = len(lat);
    const clear = a.r + b.r + 16;
    if (ll >= clear) continue;
    const k = (1 - ll / clear) * (1 - ahead / (reach + a.r));
    // Steer to the side it is not on (dead ahead: any side, the same one each time).
    const away = ll > 1e-6 ? [-lat[0] / ll, -lat[1] / ll, -lat[2] / ll] : perp(u);
    p = [p[0] + away[0] * k, p[1] + away[1] * k, p[2] + away[2] * k];
  }
  for (const r of world.ruins) {
    if (r === ignore || Math.hypot(r.x - b.x, r.y - b.y, r.z - b.z) > r.R + reach) continue;
    const f = Math.min(reach, sp * look * 0.5 + b.r);
    const fp = [b.x + u[0] * f, b.y + u[1] * f, b.z + u[2] * f];
    const hit = ruinSurface(r, fp, b.r + 16);
    if (!hit) continue;
    const k = 1 - Math.max(0, hit.d) / (b.r + 16);
    p = [p[0] + hit.n[0] * k, p[1] + hit.n[1] * k, p[2] + hit.n[2] * k];
  }
  if (!p[0] && !p[1] && !p[2]) return dv;
  const nv = norm([u[0] + p[0] * 2, u[1] + p[1] * 2, u[2] + p[2] * 2]);
  return [nv[0] * sp, nv[1] * sp, nv[2] * sp];
}

// Direct thrust: accelerate toward a desired velocity (brakes too).
function steerTo(b, dv, accel, dt) {
  const ex = dv[0] - b.vx, ey = dv[1] - b.vy, ez = dv[2] - b.vz;
  const e = Math.hypot(ex, ey, ez);
  if (!e) return;
  const k = Math.min(1, (accel * dt) / e);
  b.vx += ex * k; b.vy += ey * k; b.vz += ez * k;
}

// Rotate-and-thrust toward a velocity change, as the 2D pilot: turn the look
// toward it at the body's rate, and fire the main jet only when roughly
// pointed the right way. Braking is turning around. The AI body never uses
// the side jets, so every tuned AI number holds.
export function pilot(s, dv, dt) {
  const e = [dv[0] - s.vx, dv[1] - s.vy, dv[2] - s.vz];
  const m = len(e);
  s.thrusting = false;
  s.jet = [0, 0, 0];
  if (m < 12) return;
  const want = [e[0] / m, e[1] / m, e[2] / m];
  turnFwd(s, want, CFG.turnRate * dt);
  if (dot(fwdOf(s.q), want) > Math.cos(0.35)) {
    s.thrusting = true;
    s.jet = [0, 0, -1];
    const a = Math.min(CFG.thrust, m / dt) * dt;
    const f = fwdOf(s.q);
    s.vx += f[0] * a; s.vy += f[1] * a; s.vz += f[2] * a;
  }
}

// Turn a body's forward toward unit `want`, at most `max` radians.
export function turnFwd(s, want, max) {
  const r = qlimit(qfromTo(fwdOf(s.q), want), max);
  if (qangle(r) > 1e-9) s.q = qnorm(qmul(r, s.q));
}

// ---- enemy behaviour --------------------------------------------------------------------
export function updateEnemies(world, dt) {
  for (const e of world.enemies) {
    if (!e.alive || e.kind !== "enemy") continue;
    const T = ENEMY_TYPES[e.type];
    e.age += dt;
    if (e.contactCd > 0) e.contactCd -= dt;
    if (e.cool > 0) e.cool -= dt;

    if (e.type === "mine") { updateMine(world, e, T, dt); continue; }

    if ((e.senseT -= dt) <= 0) {
      e.senseT = CFG.senseEvery;
      e.target = nearestSoldier(world, e);
      e.los = !!e.target && hasLos(world, e, e.target);
      if (!e.alert && e.target && e.los && gap3(e.target, e) < (T.sight || CFG.alertRange)) e.alert = true;
    }
    // A warden that has lost sight of everyone long enough goes back on patrol.
    if (e.route && e.alert) {
      e.lost = e.los ? 0 : e.lost + dt;
      if (e.lost > T.giveUp) { e.alert = false; e.lost = 0; e.tele = 0; e.burstLeft = 0; }
    }
    const t = e.target && e.target.alive ? e.target : null;
    let dv = [0, 0, 0];
    if ((!e.alert || !t) && e.route) {
      // Patrol: fly the loop, waypoint to waypoint.
      const p = e.route[e.leg];
      const d = [p.x - e.x, p.y - e.y, p.z - e.z];
      const l = len(d) || 1;
      if (l < CFG.patrolReach) e.leg = (e.leg + 1) % e.route.length;
      dv = [(d[0] / l) * T.patrol, (d[1] / l) * T.patrol, (d[2] / l) * T.patrol];
    } else if (!e.alert || !t) {
      // Idle: a slow drift on a wandering heading — back toward its room, for a crewman.
      wander(world, e, dt);
      dv = [e.heading[0] * 25, e.heading[1] * 25, e.heading[2] * 25];
      if (e.home) {
        const h = [e.home.x - e.x, e.home.y - e.y, e.home.z - e.z];
        const hd = len(h);
        if (hd > CFG.crewLeash) dv = [(h[0] / hd) * 40, (h[1] / hd) * 40, (h[2] / hd) * 40];
      }
    } else {
      const d0 = [t.x - e.x, t.y - e.y, t.z - e.z];
      const d = len(d0) || 1;
      const u = [d0[0] / d, d0[1] / d, d0[2] / d];
      // Across the line to the target, on the enemy's own orbit plane (F8).
      let side = cross(e.orbitAxis, u);
      side = len(side) > 1e-3 ? norm(side) : perp(u);
      const o = e.orbitDir;
      if (e.type === "charger") {
        dv = [u[0] * T.speed, u[1] * T.speed, u[2] * T.speed];
      } else if (e.type === "gunner" || e.type === "warden") {
        const radial = d < T.keepMin ? -1 : d > T.keepMax ? 1 : 0;
        dv = [0, 1, 2].map((i) => (u[i] * radial + side[i] * o * 0.4) * T.speed);
      } else if (e.type === "swarmer") {
        const pull = clamp((d - T.orbit) / 120, -1, 1);
        dv = [0, 1, 2].map((i) => (side[i] * o + u[i] * pull) * T.speed);
      } else if (e.type === "minelayer") {
        wander(world, e, dt * 2);
        const away = d < T.keep ? -1 : 0;
        dv = [0, 1, 2].map((i) => (e.heading[i] + u[i] * away * 2) * T.speed);
      }
      shoot(world, e, T, t, dt);
    }
    dv = avoid(world, e, dv);
    steerTo(e, dv, T.accel, dt);

    // Contact damage, runtime.js: once per contact cooldown (0.6s), per enemy.
    if (T.contact && e.contactCd <= 0) {
      for (const s of world.soldiers) {
        if (!s.alive || gap3(s, e) >= s.r + e.r) continue;
        hurt(world, s, T.contact, e);
        e.contactCd = 0.6;
        break;
      }
    }
  }
}

// The 2D heading's random walk, as a direction: nudged by up to ±0.5 rad/s.
function wander(world, e, dt) {
  const k = (world.rng() - 0.5) * dt;
  const turn = qaxis(perpTo(e.heading, world.rng), k);
  e.heading = norm(qrot(turn, e.heading));
}
function perpTo(v, rng) {
  const p1 = perp(v), p2 = cross(v, p1);
  const a = rng() * Math.PI * 2;
  return norm([p1[0] * Math.cos(a) + p2[0] * Math.sin(a), p1[1] * Math.cos(a) + p2[1] * Math.sin(a), p1[2] * Math.cos(a) + p2[2] * Math.sin(a)]);
}

// Telegraph, then fire aimed; only with line of sight. Mine-layers drop mines.
function shoot(world, e, T, t, dt) {
  if (e.type === "minelayer") {
    if (e.cool <= 0 && e.mines < T.maxMines) {
      const m = makeEnemy(world, "mine", e.x, e.y, e.z);
      m.vx = e.vx * 0.2; m.vy = e.vy * 0.2; m.vz = e.vz * 0.2;
      m.owner = e;
      m.alert = true;
      e.mines++;
      world.enemies.push(m);
      e.cool = rand(world.rng, T.drop[0], T.drop[1]);
    }
    return;
  }
  if (!T.weapon) return;
  if (e.burstLeft > 0) {
    if ((e.burstT -= dt) <= 0) {
      e.fireCd = 0;
      fire(world, e, aimAt(e, T, t), 1);
      e.burstT = T.burstGap;
      if (--e.burstLeft === 0) e.cool = rand(world.rng, T.wait[0], T.wait[1]);
    }
    return;
  }
  if (e.tele > 0) {
    e.tele -= dt;
    if (e.tele <= 0) {
      e.fireCd = 0;
      fire(world, e, aimAt(e, T, t), 1);
      e.cool = rand(world.rng, T.wait[0], T.wait[1]);
      if (T.burst > 1) { e.burstLeft = T.burst - 1; e.burstT = T.burstGap; }
    }
    return;
  }
  if (e.cool <= 0 && e.los) e.tele = T.tele;
}

// Straight at the target, or — a type with `lead` — where it will be when the
// round gets there (one refinement of the flight time).
export function aimAt(e, T, t, speed = T.weapon.projectile.speed, lead = T.lead) {
  if (!lead) return norm([t.x - e.x, t.y - e.y, t.z - e.z]);
  let tt = gap3(t, e) / speed;
  tt = Math.hypot(t.x + t.vx * tt - e.x, t.y + t.vy * tt - e.y, t.z + t.vz * tt - e.z) / speed;
  return norm([t.x + t.vx * tt - e.x, t.y + t.vy * tt - e.y, t.z + t.vz * tt - e.z]);
}

function updateMine(world, m, T, dt) {
  if (m.age > T.life) { m.alive = false; releaseMine(m); return; }
  if (m.fuse > 0) {
    m.fuse -= dt;
    if (m.fuse <= 0) {
      m.alive = false;
      releaseMine(m);
      explode(world, T.blast, m.x, m.y, m.z, "enemy", m);
    }
    return;
  }
  if (m.age < T.arm) return;
  for (const s of world.soldiers) {
    if (s.alive && gap3(s, m) < T.trigger) { m.fuse = T.fuse; world.events.push({ type: "fuse", x: m.x, y: m.y, z: m.z }); break; }
  }
}

export function releaseMine(m) {
  if (m.owner) m.owner.mines = Math.max(0, m.owner.mines - 1);
  m.owner = null;
}

// ---- squad ---------------------------------------------------------------------------
export function updateSquad(world, dt) {
  const lead = controlled(world);
  for (const s of world.soldiers) {
    if (s.alive && s !== lead) companion(world, s, lead, dt);
  }
}

// A companion on the same rotate-and-thrust body: it wants a velocity (match
// the leader, close on its station, bend round obstacles) and gets it only by
// turning and firing the pack. Its station is a world-fixed 3D bearing (F10).
function companion(world, s, lead, dt) {
  let dv = [0, 0, 0];
  if (lead) {
    const k = s.station.d;
    const p = [lead.x + s.station.dir[0] * k, lead.y + s.station.dir[1] * k, lead.z + s.station.dir[2] * k];
    const e = [p[0] - s.x, p[1] - s.y, p[2] - s.z];
    const d = len(e) || 1;
    const close = Math.min(CFG.stationClose, d * CFG.stationGain);
    dv = [lead.vx + (e[0] / d) * close, lead.vy + (e[1] / d) * close, lead.vz + (e[2] / d) * close];
  }
  dv = avoid(world, s, dv);
  pilot(s, dv, dt);

  // Guns: aim is independent of facing, as the game's companions do.
  if (s.weapon.magazine && s.ammo <= 0 && !(s.reloading > 0)) startReload(s, world);
  if ((s.senseT = (s.senseT || 0) - dt) <= 0) {
    s.senseT = CFG.senseEvery;
    s.foe = pickFoe(world, s);
  }
  const f = s.foe && s.foe.alive ? s.foe : null;
  if (f) {
    s.aim = norm([f.x - s.x, f.y - s.y, f.z - s.z]);
    fire(world, s, s.aim, aimAccuracy(s.stats.aim));
  }
}

// Nearest living enemy in reach with a clear line.
function pickFoe(world, s) {
  const p = s.weapon.projectile;
  const reach = Math.min(CFG.companionRange, p.speed * p.life * 0.9);
  let best = null, bd = Infinity;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const d = gap3(e, s);
    if (d > reach || d >= bd) continue;
    if (!hasLos(world, s, e)) continue;
    bd = d;
    best = e;
  }
  return best;
}
