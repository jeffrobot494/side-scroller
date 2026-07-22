// Crouch: hitbox geometry, movement lock, dodging enemy fire, ally clearance.
import { Soldier, Enemy, overlaps, STAND_H, CROUCH_H } from "../src/mission/entities.js";
import { updateEnemy } from "../src/mission/ai.js";
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

// Total damage a stationary turret lands on the soldier over a fixed run. Seeds
// Math.random so the shot-spread stream is identical between calls — the only
// difference is the soldier's stance, which isolates the crouch effect.
function turretDamage(soldier, seed) {
  const real = Math.random;
  Math.random = makeRng(seed);
  try {
    const def = { id: "t", name: "Turret", color: "#f00", w: 38, h: 38, health: 40, behavior: "turret", speed: 0, contactDamage: 0, detectRange: 900, weapon: "plasma", windup: 0.4, loot: { name: "L", value: 1 } };
    const turret = new Enemy(def, 600, G - 38);
    const scene = { world: { gravity: 1600, width: 1000, height: 340 }, platforms: [{ x: 0, y: G, w: 1000, h: 40 }], soldiers: [soldier], enemies: [turret], projectiles: [] };
    let dealt = 0;
    const ctx = { friendlyFire: false, damageMult: 1, damage(t, a) { t.health -= a; dealt += a; }, kill() {}, spark() {}, burst() {} };
    for (let i = 0; i < 300; i++) {
      updateEnemy(turret, 0.03, scene);
      if (turret.fireCooldown > 0) turret.fireCooldown -= 0.03;
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

  // ---- the dodge: crouching sharply reduces incoming fire (same shot stream) ----
  {
    const SEED = 20260721;
    const standDmg = turretDamage(makeTarget(false), SEED);
    const crouchDmg = turretDamage(makeTarget(true), SEED);
    t.ok(`standing takes heavy fire (${standDmg})`, standDmg > 0);
    t.ok(`crouch dodges some of it (${crouchDmg} < ${standDmg})`, crouchDmg < standDmg);
    t.ok(`crouch cuts incoming fire by ≥50% (${crouchDmg} vs ${standDmg})`, crouchDmg <= standDmg * 0.5);
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
