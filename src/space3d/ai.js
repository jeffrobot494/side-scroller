// ---------------------------------------------------------------------------
// SPACE FPS — enemies, waves and companions (tech/space-fps.md F5–F6).
//
// The 2D prototype's rules (src/space/sim.js) with a z. DOM-free; every draw
// goes through world.rng. Enemy types and their numbers are the 2D ones,
// imported; the weighted mixes are copied, since the 2D sim keeps them private.
// ---------------------------------------------------------------------------

import { ENEMY_TYPES, LOADOUT, WEAPONS, soldierMaxHp } from "../space/sim.js";
import { CFG, clamp, controlled, hasLos, fire, hurt, explode, aimAccuracy, startReload, ruinSurface, ruinToLocal, inPoly, rocksNear, toggleBoots, bootsOff, bootsPull, turnUp, walkSolids, upOf } from "./sim.js";
import { dot, cross, norm, len, qmul, qaxis, qrot, qnorm, qfromTo, qlimit, qangle, fwdOf, randomDir, perp, QI } from "./vec.js";

export { ENEMY_TYPES };

const rand = (rng, lo, hi) => lo + rng() * (hi - lo);
const gap3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Weighted mix for placement and waves (a swarmer entry is a pack), copied
// from 2D. K1: trooper 19.5.
export const ENEMY_MIX = [["charger", 35], ["gunner", 25], ["swarmer", 25], ["minelayer", 15], ["trooper", 19.5]];
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
    ...(T.soldier ? trooperBody(world) : null),
  };
}

// The squad's body for a trooper (2D trooperBody): rolled Aim and Health
// (K2), HP by the squad's formula, unlimited spare magazines, and its own
// copy of a random squad gun with every effect amount scaled (K3).
function trooperBody(world) {
  const { rng } = world;
  const roll = ([lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));
  const stats = { aim: roll(CFG.trooperAim), health: roll(CFG.trooperHealth), speed: 5, nerve: 5 };
  const base = WEAPONS[LOADOUT[Math.floor(rng() * LOADOUT.length)]];
  const k = CFG.trooperDamage;
  const weapon = { ...base, effects: base.effects.map((fx) => ({ ...fx, ...(fx.amount != null && { amount: fx.amount * k }), ...(fx.dps != null && { dps: fx.dps * k }) })) };
  const hp = soldierMaxHp(stats);
  const q = qnorm(qaxis(randomDir(rng), rng() * Math.PI * 2));
  return {
    stats, hp, maxHp: hp, weapon,
    ammo: weapon.magazine, magsLeft: Infinity, reloading: 0,
    q, pitch: 0, viewOff: QI(), jet: [0, 0, 0], aim: fwdOf(q), thrusting: false,
    boots: null, ground: null, gn: null, gq: null, gv: [0, 0], walkIn: [0, 0], pushed: 0, stride: 0,
    color: ENEMY_TYPES.trooper.color, foe: null,
    perch: null, lastPerch: null, left: null, skip: null,
    approachT: 0, repickT: 0, strollT: 0, think: false, wing: null,
    restOn: null, restT: 0, legSeen: 0, leg: null, legId: 0, stuckT: 0,
    dance: null, danceOn: null, danceT: 0, walkGoal: 0, peeks: 0, peekMax: 0, peekT: 0, noPeekT: 0,
    burstDone: false, hpAtPeek: 0, lingerT: null, mayShoot: true,
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
  // Only rocks the grid puts near the look-ahead can bend it.
  const end = [b.x + u[0] * reach, b.y + u[1] * reach, b.z + u[2] * reach];
  const pad = CFG.asteroidMaxR + b.r + 16;
  for (const a of rocksNear(world, Math.min(b.x, end[0]), Math.min(b.y, end[1]), Math.min(b.z, end[2]), Math.max(b.x, end[0]), Math.max(b.y, end[1]), Math.max(b.z, end[2]), pad)) {
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
    if (T.soldier) { updateTrooper(world, e, T, dt); continue; }

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

// ---- troopers (tech/space-troopers.md, in 3D) ------------------------------------------
// A soldier body's brain: decides on the sensing cadence, acts every step,
// and only through what a player has — the pilot, a turn, walking, the boots,
// reload and the trigger. It never sets its own position or velocity.
function updateTrooper(world, e, T, dt) {
  e.think = false;
  if ((e.senseT -= dt) <= 0) {
    e.senseT = CFG.senseEvery;
    e.think = true;
    e.target = nearestSoldier(world, e);
    e.los = !!e.target && hasLos(world, e, e.target);
    if (!e.alert && e.target && e.los && gap3(e.target, e) < CFG.alertRange) e.alert = true;
  }
  const mate = partnerOf(e);
  if (e.alert && mate && !mate.alert) mate.alert = true; // a pair alerts together
  const t = e.alert && e.target && e.target.alive ? e.target : null;
  e.foe = t;
  e.mayShoot = true;

  if (e.boots === "ground") trooperGrounded(world, e, T, t, dt);
  else if (e.boots === "air") { e.thrusting = false; e.jet = [0, 0, 0]; } // the boots have it: they pull and turn the feet
  else trooperFlying(world, e, T, t, dt);

  if (t) trooperTrigger(world, e, T, t, dt);
  else { e.tele = 0; e.burstLeft = 0; }
  bootsPull(world, e, dt);
}

const partnerOf = (e) => (e.wing ? e.wing.members.find((o) => o !== e && o.alive) || null : null);
const perchOf = (g) => (g.kind === "asteroid" ? g : g.ruin);
const reachOf = (e) => e.weapon.projectile.speed * e.weapon.projectile.life;
const bandMax = (e) => Math.min(ENEMY_TYPES.trooper.band[1], reachOf(e) * 0.85);

// Where a perch (a rock, or a ruin) is from a body: the gap from its surface
// to the body's skin, the outward normal there, and the surface's velocity.
function perchInfo(e, p) {
  if (p.kind === "asteroid") {
    const d = [e.x - p.x, e.y - p.y, e.z - p.z];
    const l = len(d) || 1;
    return { gap: l - p.r - e.r, n: [d[0] / l, d[1] / l, d[2] / l], v: [p.vx, p.vy, p.vz] };
  }
  const hit = ruinSurface(p, [e.x, e.y, e.z], 1e9);
  return { gap: hit.d - e.r, n: hit.n, v: [0, 0, 0] };
}

// How far a target is from the nearest place on a perch (its near side).
function peekDist(p, t) {
  if (p.kind === "asteroid") return gap3(t, p) - p.r;
  return ruinSurface(p, [t.x, t.y, t.z], 1e9).d;
}

// A perch to fly to, or null — the 2D scoring with a z.
function pickPerch(world, e, t, exclude = null) {
  const T = ENEMY_TYPES.trooper;
  const mate = partnerOf(e);
  const mp = mate && (mate.perch || (mate.boots === "ground" ? perchOf(mate.ground) : null));
  const hi = bandMax(e);
  const mid = (T.band[0] + hi) / 2;
  // Idle, a wingman perches by its leader, wherever it is itself.
  const lead = leaderOf(e);
  const anchor = !t && lead !== e ? lead : e;
  let best = null, bs = Infinity;
  const consider = (p) => {
    if (p === exclude || (e.skip && e.skip.p === p && world.t < e.skip.until)) return;
    if (mp === p && p.kind === "asteroid" && p.r < T.shareR) return; // the partner's alone
    const s = perchInfo(e, p);
    const flight = Math.max(0, s.gap);
    const land = [e.x - s.n[0] * flight, e.y - s.n[1] * flight, e.z - s.n[2] * flight];
    const fromMate = mate ? Math.hypot(land[0] - mate.x, land[1] - mate.y, land[2] - mate.z) : 0;
    let score;
    if (!t && anchor !== e) {
      const g = Math.max(0, perchInfo(anchor, p).gap);
      if (g > T.partnerGap) return;
      score = g + 0.3 * flight;
    } else if (!t) {
      if (flight > T.idleSearch) return;
      score = flight + 0.5 * fromMate;
    } else {
      if (flight > T.perchSearch) return;
      const pd = peekDist(p, t);
      if (pd > hi) return;
      score = flight + 1.5 * Math.abs(pd - mid) + (fromMate > T.partnerGap ? 400 : 0) + (p === e.left ? 600 : 0);
    }
    if (score < bs) { bs = score; best = p; }
  };
  const reach = t ? T.perchSearch : T.idleSearch;
  for (const a of world.asteroids) {
    if (a.r >= T.perchMinR && gap3(a, anchor) - a.r <= reach + e.r) consider(a);
  }
  for (const r of world.ruins) if (gap3(r, anchor) - r.R <= reach) consider(r);
  return best;
}

// Turn without thrust, feet toward the surface whose normal is n.
function feetTo(e, n, dt) {
  e.thrusting = false;
  e.jet = [0, 0, 0];
  turnUp(e, n, CFG.turnRate * dt);
}

// pilot, with the wanted velocity capped at vMax (K5).
function pilotTo(e, dv, dt) {
  const sp = len(dv);
  const cap = ENEMY_TYPES.trooper.vMax;
  if (sp > cap) dv = [dv[0] * cap / sp, dv[1] * cap / sp, dv[2] * cap / sp];
  pilot(e, dv, dt);
}

// Walking, the AI's way: face a heading (a turn about up, `yaw` from the
// current forward) and walk along it, or stop.
function walkYaw(e, yaw) {
  if (yaw) e.q = qnorm(qmul(e.q, qaxis([0, 1, 0], yaw)));
  e.walkIn = [0, 1];
}
const stop = (e) => { e.walkIn = [0, 0]; };

function trooperGrounded(world, e, T, t, dt) {
  const here = perchOf(e.ground);
  e.perch = null;
  e.approachT = 0;
  e.lastPerch = here;
  if (!t) {
    // Idle: rest a while, then the pair moves on (patrol).
    const W = e.wing || e;
    if (e.restOn !== here) { e.restOn = here; e.restT = rand(world.rng, T.rest[0], T.rest[1]); e.legSeen = W.legId; }
    const lead = leaderOf(e);
    if (lead === e ? (e.restT -= dt) <= 0 : W.legId !== e.legSeen) {
      if (lead === e) newLeg(world, e, T);
      e.restOn = null;
      e.left = here;
      e.perch = null;
      stop(e);
      bootsOff(e, world);
      return;
    }
    // Resting: stand, and now and then stroll a little.
    if ((e.strollT -= dt) <= 0) {
      const moving = e.walkIn[1] !== 0;
      e.strollT = moving ? rand(world.rng, 3, 6) : rand(world.rng, 0.5, 1.5);
      if (moving) stop(e);
      else walkYaw(e, rand(world.rng, -Math.PI, Math.PI));
    }
    return;
  }
  // The target is out of range of this perch's near side: go after it (K6).
  if (e.think && peekDist(here, t) > bandMax(e) * T.relocate) return leavePerch(world, e, t, here);
  coverDance(world, e, T, t, here, dt);
}

// ---- the cover dance (T2) ----
// Cover → wait its turn → peek and fire a burst → back to cover; relocate
// when this surface has no peek, or after peekMax peeks. A goal is a heading
// and a distance along the surface, found by probing it in 8 directions.
function coverDance(world, e, T, t, here, dt) {
  if (e.danceOn !== here) {
    e.danceOn = here;
    e.dance = "cover";
    e.peeks = 0;
    e.peekMax = T.peekMax[0] + Math.floor(world.rng() * (T.peekMax[1] - T.peekMax[0] + 1));
    e.noPeekT = 0;
    e.walkGoal = 0;
  }
  const wing = e.wing;
  // Walking to a probe point: the distance left, run down by the walk.
  if (e.walkGoal) {
    e.walkGoal -= Math.max(0, e.gv[1]) * dt;
    if (e.walkGoal < 6) e.walkGoal = 0;
  }
  e.mayShoot = false;
  const goTo = (goal) => {
    if (!goal) { e.walkGoal = 0; return; }
    walkYaw(e, goal.yaw);
    e.walkGoal = goal.d;
  };

  if (e.dance === "cover") {
    e.mayShoot = !e.walkGoal; // only while holding a spot with no cover
    if (e.think) {
      if (!exposed(world, e, T)) {
        if (!e.walkGoal) {
          e.dance = "wait";
          e.danceT = rand(world.rng, T.wait[0], T.wait[1]);
          if (e.ammo < e.weapon.magazine / 2) startReload(e, world);
        }
      } else if (!e.walkGoal) {
        const goal = coverPoint(world, e, T);
        if (goal) goTo(goal);
        else {
          // Nowhere to hide here: somewhere else, or stand and fight.
          const next = pickPerch(world, e, t, here);
          if (next) return leavePerch(world, e, t, here, next);
        }
      }
    }
  } else if (e.dance === "wait") {
    e.walkGoal = 0;
    if (e.think && exposed(world, e, T)) e.dance = "cover"; // the target moved round
    else if ((e.danceT -= dt) <= 0 && !(e.reloading > 0) && turnFree(world, e, wing)) {
      e.dance = "peek";
      e.peekT = 0;
      e.burstDone = false;
      e.hpAtPeek = e.hp;
      e.cool = 0; // the wait was the pause between bursts
      if (wing) { wing.peeker = e; wing.since = world.t; }
    }
  } else if (e.dance === "peek") {
    e.peekT += dt;
    const reach = gap3(t, e) <= reachOf(e) * 0.95;
    e.los = hasLos(world, e, t);
    const firing = e.tele > 0 || e.burstLeft > 0;
    if (e.los && reach) {
      e.walkGoal = 0;
      e.mayShoot = true;
      e.noPeekT = 0;
    } else if (e.think && !firing && !e.walkGoal) {
      const goal = peekPoint(world, e, T, t);
      if (!goal) {
        if ((e.noPeekT += CFG.senseEvery) > T.noPeek) { endPeek(e, wing); return leavePerch(world, e, t, here); }
      } else goTo(goal);
    }
    // Shot at before it could fire: straight back.
    const flinch = e.hp < e.hpAtPeek && !e.burstDone && e.burstLeft === 0;
    if (flinch) e.tele = 0;
    if (e.burstDone) e.lingerT = (e.lingerT ?? T.linger) - dt;
    if (flinch || (e.burstDone && e.lingerT <= 0) || e.peekT > T.peekGiveUp) {
      e.lingerT = null;
      endPeek(e, wing);
      e.dance = "cover";
      e.mayShoot = false;
      // Enough from here: move, if anywhere else fits — else keep at it.
      if (++e.peeks >= e.peekMax) {
        const next = pickPerch(world, e, t, here);
        if (next) return leavePerch(world, e, t, here, next);
        e.peeks = 0;
      }
    }
  }
  if (!e.walkGoal) stop(e);
}

function endPeek(e, wing) {
  if (wing && wing.peeker === e) wing.peeker = null;
  e.walkGoal = 0;
}

// A pair takes turns: one peeks at a time, and a turn frees itself after
// peekGiveUp seconds whatever happens.
function turnFree(world, e, wing) {
  const p = wing && wing.peeker;
  return !p || p === e || !p.alive || p.boots !== "ground" || world.t - wing.since > ENEMY_TYPES.trooper.peekGiveUp;
}

// In a line from any living soldier within coverFrom: what cover hides from.
function exposed(world, p, T) {
  for (const s of world.soldiers) {
    if (s.alive && gap3(s, p) < T.coverFrom && hasLos(world, s, p)) return true;
  }
  return false;
}

// The nearest hidden probe point, walked coverMargin points further while
// those are hidden too: { yaw, d } or null.
function coverPoint(world, e, T) {
  const runs = probeSurface(e, T.probeStep, T.probeDist * (e.ground.kind === "asteroid" ? 1 : 2));
  let best = null;
  for (const run of runs) {
    for (let i = 0; i < run.pts.length; i++) {
      if (exposed(world, run.pts[i], T)) continue;
      let j = i;
      while (j < i + T.coverMargin && j + 1 < run.pts.length && !exposed(world, run.pts[j + 1], T)) j++;
      if (!best || run.pts[j].d < best.d) best = { yaw: run.yaw, d: run.pts[j].d };
      break;
    }
  }
  return best;
}

// The nearest probe point with a line to the target, in reach, or null.
function peekPoint(world, e, T, t) {
  const runs = probeSurface(e, T.probeStep, T.probeDist);
  const reach = reachOf(e) * 0.95;
  let best = null;
  for (const run of runs) {
    for (const p of run.pts) {
      if (gap3(t, p) > reach || !hasLos(world, p, t)) continue;
      if (!best || p.d < best.d) best = { yaw: run.yaw, d: p.d };
      break;
    }
  }
  return best;
}

// Points along the surface a standing body is on, `step` apart, out to `max`,
// in 8 headings round its up: runs of { x, y, z, d }. On a rock, its great
// circles (half way round at most). On a derelict, a copy of the body walked
// by walkSolids — exactly where walking would put it — stopping where it
// would go inside the hull, for a trooper standing outside it.
export function probeSurface(e, step, max, dirs = 8) {
  const g = e.ground;
  const runs = [];
  const up = upOf(e);
  for (let k = 0; k < dirs; k++) {
    const yaw = (k / dirs) * Math.PI * 2;
    const q = qnorm(qmul(e.q, qaxis([0, 1, 0], yaw)));
    const f = fwdOf(q);
    const pts = [];
    if (g.kind === "asteroid") {
      const R = g.r + e.r;
      const lim = Math.min(max, Math.PI * R);
      const axis = norm(cross(up, f));
      for (let d = step; d <= lim; d += step) {
        const n = qrot(qaxis(axis, d / R), up);
        pts.push({ x: g.x + n[0] * R, y: g.y + n[1] * R, z: g.z + n[2] * R, d });
      }
    } else {
      const r = g.ruin;
      const outside = !insideHull(r, e);
      const c = { x: e.x, y: e.y, z: e.z, r: e.r, q, ground: g };
      for (let d = step; d <= max; d += step) {
        const fw = fwdOf(c.q);
        walkSolids(c, [fw[0] * step, fw[1] * step, fw[2] * step], 12);
        if (outside && insideHull(r, c)) break;
        pts.push({ x: c.x, y: c.y, z: c.z, d });
      }
    }
    runs.push({ yaw, pts });
  }
  return runs;
}

export function insideHull(r, p) {
  const l = ruinToLocal(r, [p.x, p.y, p.z]);
  return Math.abs(l[2]) < r.H / 2 && inPoly(r.hull, l[0], l[1]);
}

// Boots off and away, to a new perch if one fits — else it floats and chases.
function leavePerch(world, e, t, here, next = undefined) {
  endPeek(e, e.wing);
  e.danceOn = null;
  e.left = here;
  e.perch = next === undefined ? pickPerch(world, e, t) : next;
  e.approachT = 0;
  e.repickT = ENEMY_TYPES.trooper.repick;
  e.tele = 0;
  e.burstLeft = 0;
  stop(e);
  bootsOff(e, world);
}

// The pair's leader: its first living member (or itself, alone).
const leaderOf = (e) => (e.wing ? e.wing.members.find((o) => o.alive) || e : e);

// A new patrol point for the pair: a random bearing, patrolLeg away, inside
// the cube. Shared on the wing so the wingman follows the same leg.
function newLeg(world, e, T) {
  const W = e.wing || e;
  const d = randomDir(world.rng);
  const k = rand(world.rng, T.patrolLeg[0], T.patrolLeg[1]);
  const S = world.size;
  W.leg = { x: clamp(e.x + d[0] * k, 300, S - 300), y: clamp(e.y + d[1] * k, 300, S - 300), z: clamp(e.z + d[2] * k, 300, S - 300) };
  W.legId = (W.legId || 0) + 1;
}

// Idle and flying: the leader flies the leg and perches near its end; the
// wingman keeps station off the leader's side, and perches beside it.
function trooperPatrol(world, e, T, dt) {
  const W = e.wing || e;
  const lead = leaderOf(e);
  if (e.perch) {
    if (lead !== e && W.legId !== e.legSeen && lead.boots !== "ground") e.perch = null; // the leader moved on
    else {
      trooperApproach(world, e, T, dt);
      if ((e.approachT += dt) > T.approachMax) { e.skip = { p: e.perch, until: world.t + T.skipFor }; e.perch = null; }
      return;
    }
  }
  let dv;
  if (lead === e) {
    if (!W.leg) newLeg(world, e, T);
    const d0 = [W.leg.x - e.x, W.leg.y - e.y, W.leg.z - e.z];
    const d = len(d0) || 1;
    if (d < T.patrolArrive && e.think) {
      e.perch = pickPerch(world, e, null);
      e.approachT = 0;
      if (!e.perch) newLeg(world, e, T); // nothing to rest on here: go on
      return;
    }
    dv = [d0[0] / d * T.patrolV, d0[1] / d * T.patrolV, d0[2] / d * T.patrolV];
    // Pinned against something steering cannot bend round: try another way.
    e.stuckT = Math.hypot(e.vx, e.vy, e.vz) < 40 ? (e.stuckT || 0) + dt : 0;
    if (e.stuckT > 2) { e.stuckT = 0; newLeg(world, e, T); }
  } else {
    if ((lead.boots === "ground" || lead.perch) && e.think) {
      e.perch = pickPerch(world, e, null);
      e.approachT = 0;
      e.legSeen = W.legId;
      if (e.perch) return;
    }
    // Station off the leader's side, across its heading.
    const lv = [lead.vx, lead.vy, lead.vz];
    const sp = len(lv);
    let side = sp > 1 ? cross(lv, e.orbitAxis) : perp(e.orbitAxis);
    side = len(side) > 1e-6 ? norm(side) : perp(e.orbitAxis);
    const k = T.wingOff * e.orbitDir;
    const p = [lead.x + side[0] * k, lead.y + side[1] * k, lead.z + side[2] * k];
    const ex = [p[0] - e.x, p[1] - e.y, p[2] - e.z];
    const d = len(ex) || 1;
    const close = Math.min(CFG.stationClose, d * CFG.stationGain);
    dv = [lv[0] + ex[0] / d * close, lv[1] + ex[1] / d * close, lv[2] + ex[2] / d * close];
    e.legSeen = W.legId;
  }
  pilotTo(e, avoid(world, e, dv), dt);
}

function trooperFlying(world, e, T, t, dt) {
  if (!t) return trooperPatrol(world, e, T, dt);
  // A target on the run is chased: a perch ahead of it is gone by the time
  // the trooper lands.
  const running = Math.hypot(t.vx, t.vy, t.vz) > T.chaseV;
  if (e.think) {
    if (e.perch && (running || peekDist(e.perch, t) > bandMax(e) * T.relocate)) e.perch = null;
    if (!e.perch && !running && (e.repickT -= CFG.senseEvery) <= 0) {
      e.repickT = T.repick;
      e.perch = pickPerch(world, e, t);
      e.approachT = 0;
    }
  }
  if (e.perch) {
    trooperApproach(world, e, T, dt);
    if ((e.approachT += dt) > T.approachMax) {
      e.skip = { p: e.perch, until: world.t + T.skipFor };
      e.perch = null;
    }
    return;
  }
  // No perch: hold the band round the target as a gunner does.
  const d0 = [t.x - e.x, t.y - e.y, t.z - e.z];
  const d = len(d0) || 1;
  const u = [d0[0] / d, d0[1] / d, d0[2] / d];
  let side = cross(e.orbitAxis, u);
  side = len(side) > 1e-3 ? norm(side) : perp(u);
  const radial = d < T.keep[0] ? -1 : d > T.keep[1] ? 1 : 0;
  let dv = [0, 1, 2].map((i) => (u[i] * radial + side[i] * e.orbitDir * 0.4) * T.floatSpeed);
  if (d > T.keep[1] * 2) dv = [u[0] * T.vMax, u[1] * T.vMax, u[2] * T.vMax]; // run after it
  dv = [dv[0] + t.vx, dv[1] + t.vy, dv[2] + t.vz];
  pilotTo(e, avoid(world, e, dv), dt);
}

// Fly in, turn feet-first, coast, clamp on: the 2D landing profile.
function trooperApproach(world, e, T, dt) {
  const s = perchInfo(e, e.perch);
  const closing = -((e.vx - s.v[0]) * s.n[0] + (e.vy - s.v[1]) * s.n[1] + (e.vz - s.v[2]) * s.n[2]);
  if (s.gap <= T.coastGap && (closing >= T.stall || s.gap <= CFG.bootsReach)) {
    feetTo(e, s.n, dt);
    if (s.gap <= CFG.bootsReach && dot(upOf(e), s.n) > Math.cos(CFG.bootsWedge)) toggleBoots(world, e);
    return;
  }
  const look = s.gap - Math.max(0, closing) * T.lookAhead;
  const vc = clamp(T.vLand + Math.sqrt(2 * T.brake * Math.max(0, look - T.coastGap)), T.vLand, T.vMax);
  const dv = [s.v[0] - s.n[0] * vc, s.v[1] - s.n[1] * vc, s.v[2] - s.n[2] * vc];
  pilotTo(e, avoid(world, e, dv, 0.7, e.perch), dt);
}

// Telegraph, then a burst at the gun's own fire rate, led, with the trooper's
// Aim. Only with a line of sight and in reach.
function trooperTrigger(world, e, T, t, dt) {
  e.aim = aimAt(e, null, t, e.weapon.projectile.speed, true);
  if (e.reloading > 0) return;
  if (e.ammo <= 0) { startReload(e, world); e.tele = 0; e.burstLeft = 0; return; }
  const wait = () => rand(world.rng, T.wait[0], T.wait[1]);
  if (e.burstLeft > 0) {
    if (e.fireCd > 0) return;
    if (!hasLos(world, e, t)) { e.burstLeft = 0; e.cool = wait(); e.burstDone = true; return; }
    if (fire(world, e, e.aim, aimAccuracy(e.stats.aim)) && --e.burstLeft === 0) { e.cool = wait(); e.burstDone = true; }
    return;
  }
  if (e.tele > 0) {
    if ((e.tele -= dt) <= 0) {
      e.tele = 0;
      const [lo, hi] = T.burstAuto;
      e.burstLeft = e.weapon.auto ? lo + Math.floor(world.rng() * (hi - lo + 1)) : 1;
    }
    return;
  }
  if (e.cool <= 0 && e.mayShoot && e.los && gap3(t, e) <= reachOf(e) * 0.95) e.tele = T.tele;
}
