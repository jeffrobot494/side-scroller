// Crouch: hitbox geometry, movement lock, incoming fire, ally clearance.
// EnemySpec enemies aim at the target's live centre, so crouching lets you duck a
// shot already in flight (aimed at your standing centre) and shrinks your target,
// but is NOT permanent immunity — the gunner re-aims at your lower crouched centre.
import { Soldier, overlaps, STAND_H, CROUCH_H } from "../src/mission/entities.js";
import { instantiate, updateSpecEnemy } from "../src/mission/enemyspec/runtime.js";
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { updateProjectiles, updateStatuses } from "../src/mission/combat.js";
import { makeRng } from "../src/game/gen/rng.js";

const G = 300; // ground top
const data = { id: "s1", name: "Rook", callsign: "RK", stats: { health: 8, aim: 6, speed: 6 } };
const rifle = { id: "rifle", name: "R", fireMode: "projectile", fireRate: 7, spread: 0, projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 1 }, effects: [] };

function makeTarget(crouch) {
  const s = new Soldier(data, rifle, 200, G - STAND_H);
  s.health = s.maxHealth = 1e6; // never dies, so both runs see the full shot stream
  if (crouch) s.setCrouch(true);
  return s;
}

// A stationary EnemySpec gunner that streams aimed shots at the player.
const GUNNER = normalizeSpec({
  v: 1, id: "test_gunner", name: "Test Gunner", threat: 50,
  root: {
    id: "root", tags: ["enemy"],
    visual: { shape: "box", size: [38, 38], color: "#f00" },
    health: { max: 1e9 },
    motion: { type: "static" },
    emitters: { gun: { at: [0, 0], projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 1, damage: 5, gravity: 0 } } },
  },
  brain: { start: "fire", states: { fire: { tracks: [{ id: "g", loop: true, steps: [
    { fire: { emitter: "gun", pattern: "aimed" } },
    { wait: 0.05 },
  ] }] } } },
});

// Total damage the gunner lands on the soldier over a fixed run. Seeds
// Math.random so the shot-spread stream is identical between calls — the only
// difference is the soldier's stance, which isolates the crouch effect.
function turretDamage(soldier, seed) {
  const real = Math.random;
  Math.random = makeRng(seed);
  try {
    const gunner = instantiate(GUNNER, 600, G - 38);
    const scene = { world: { gravity: 1600, width: 1000, height: 340 }, platforms: [{ x: 0, y: G, w: 1000, h: 40 }], soldiers: [soldier], enemies: [], projectiles: [] };
    let dealt = 0;
    const ctx = { friendlyFire: false, damageMult: 1, damage(t, a) { t.health -= a; dealt += a; }, kill() {}, spark() {}, burst() {} };
    for (let i = 0; i < 300; i++) {
      updateSpecEnemy(gunner, 0.03, scene, ctx);
      updateProjectiles(scene, 0.03, ctx);
      updateStatuses(scene, 0.03, ctx);
    }
    return dealt;
  } finally {
    Math.random = real;
  }
}

export default async function run(t) {
  // ---- geometry: feet stay planted across the height change ----
  {
    const s = new Soldier(data, rifle, 100, G - STAND_H);
    const feet = s.y + s.h;
    t.ok("stands at full height", s.h === STAND_H);
    s.setCrouch(true);
    t.ok("crouch lowers the hitbox", s.h === CROUCH_H && CROUCH_H < STAND_H);
    t.ok("crouch keeps feet planted", s.y + s.h === feet);
    s.setCrouch(true); // idempotent
    t.ok("re-crouch is a no-op", s.y + s.h === feet && s.h === CROUCH_H);
    s.setCrouch(false);
    t.ok("standing restores height + feet", s.h === STAND_H && s.y + s.h === feet);
  }

  // ---- movement lock while kneeling ----
  {
    const s = new Soldier(data, rifle, 100, G - STAND_H);
    s.setCrouch(true);
    s.vx = 0; s.vy = 0;
    s.applyMovement(0.1, 1, true); // hold right + jump
    t.ok("crouched can't build run speed", s.vx === 0);
    t.ok("crouched can't jump", s.vy === 0);
    t.ok("crouched can still pivot to face", s.facing === 1);
    s.applyMovement(0.1, -1, false);
    t.ok("crouched pivots the other way", s.facing === -1);
  }

  // ---- crouch shrinks the target but is NOT permanent immunity ----
  // The gunner aims at the soldier's live centre, so a crouched soldier is a
  // smaller target (takes less over a run) yet still gets hit — kneeling never
  // grants permanent cover, it just re-aims at the lower centre next shot.
  {
    const SEED = 20260721;
    const standDmg = turretDamage(makeTarget(false), SEED);
    const crouchDmg = turretDamage(makeTarget(true), SEED);
    t.ok(`standing takes heavy fire (${standDmg})`, standDmg > 0);
    t.ok(`crouch still gets hit — not permanent immunity (${crouchDmg})`, crouchDmg > 0);
    t.ok(`crouch is a smaller target, takes less (${crouchDmg} < ${standDmg})`, crouchDmg < standDmg);
  }

  // ---- ally clearance: a shot at standing torso height clears a crouched head ----
  {
    const s = new Soldier(data, rifle, 200, G - STAND_H);
    s.setCrouch(true);
    // an ally's shot originates around upper-torso height (h*0.42 of a stander)
    const allyShot = { x: 205, y: G - 27, w: 12, h: 4 };
    t.ok("ally shot passes over the crouched soldier", overlaps(allyShot, s) === false);
    s.setCrouch(false);
    t.ok("...but would hit them standing", overlaps(allyShot, s) === true);
  }
}
