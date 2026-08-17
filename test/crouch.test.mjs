// Crouch: hitbox geometry, movement lock, incoming fire, ally clearance.
// EnemySpec enemies aim at the target's live centre, so crouching lets you duck a
// shot already in flight (aimed at your standing centre) and shrinks your target,
// but is NOT permanent immunity — the gunner re-aims at your lower crouched centre.
//
// It also owns the GEOMETRY half of the duck reflex (tech/soldier-ducking.md):
// duckableShot() — would kneeling save this soldier from this round — because
// this is where a soldier is shot at. The behaviour half (who kneels, when, for
// how long) is in companion-aim.test.mjs, where the squadmate lives.
import { Soldier, Projectile, overlaps, STAND_H, CROUCH_H } from "../src/mission/entities.js";
import { instantiate, updateSpecEnemy } from "../src/mission/enemyspec/runtime.js";
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { updateProjectiles, updateStatuses, duckableShot } from "../src/mission/combat.js";
import { losBetween } from "../src/mission/enemyspec/perception.js";
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

// ---- duck predicate fixtures ---------------------------------------------
// The soldier under judgement: x 200..230, feet on the ground at G=300, so its
// standing box is y 254..300 and its crouched box y 278..300.
const STEP = 1 / 60;
const FLOOR = { x: 0, y: G, w: 1000, h: 40 };
const duckScene = (platforms = [FLOOR]) => ({ world: { gravity: 2000, width: 1000, height: 340 }, platforms });
const duckTarget = () => new Soldier(data, rifle, 200, G - STAND_H);

// A round in flight, described the way ai.js stamps one out.
function shot(x, y, vx, vy, o = {}) {
  const spec = { w: o.w ?? 12, h: o.h ?? 4, color: "#fff", life: o.life ?? 1, gravity: o.gravity ?? 0 };
  return new Projectile(x, y, vx, vy, spec, o.team || "enemy", o.effects || [], o.owner || null);
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

  // ---- the duck predicate: which rounds a knee actually answers -------------
  // The reflex is only as good as this: a squadmate kneeling at a shot that was
  // never going to land is the most visible way the feature can look broken.
  {
    const sc = duckScene();
    const head = () => shot(60, 262, 900, 0); // 262..266: over the crouched box
    t.ok("duck: a round on the standing box that misses the crouched one",
      duckableShot(sc, head(), duckTarget(), STEP, {}) === true);
    t.ok("duck: a round aimed low hits both boxes, so kneeling is no answer",
      duckableShot(sc, shot(60, 284, 900, 0), duckTarget(), STEP, {}) === false);
    t.ok("duck: a round already sailing over the head is nothing to react to",
      duckableShot(sc, shot(60, 230, 900, 0), duckTarget(), STEP, {}) === false);

    // The two ways a round stops existing before it arrives. Both are stopping
    // conditions on the same forward walk, in the runtime's own order.
    const wall = duckScene([FLOOR, { x: 140, y: 200, w: 20, h: 100 }]);
    t.ok("duck: a round the cover takes never produces a duck",
      duckableShot(wall, head(), duckTarget(), STEP, {}) === false);
    t.ok("duck: nor does one that runs out of lifetime on the way",
      duckableShot(sc, shot(60, 262, 900, 0, { life: 0.05 }), duckTarget(), STEP, {}) === false);
  }

  // ---- blasts are excluded by RULE, not by geometry ------------------------
  // A blast resolves by centre distance from the impact point, so a soldier
  // whose crouched box the round missed is still caught by a detonation on the
  // soldier behind them. Same geometry as the duckable round above.
  {
    const sc = duckScene();
    const boom = shot(60, 262, 900, 0, { effects: [{ kind: "explode", radius: 90, amount: 20 }] });
    t.ok("duck: an explosive round is never duckable, whatever the geometry says",
      duckableShot(sc, boom, duckTarget(), STEP, {}) === false);
  }

  // ---- who may hit whom is combat's rule, not geometry ---------------------
  {
    const sc = duckScene();
    const s = duckTarget();
    const mate = shot(60, 262, 900, 0, { team: "player" });
    t.ok("duck: a squadmate does not kneel at its own side's fire",
      duckableShot(sc, mate, s, STEP, { friendlyFire: false }) === false);
    t.ok("duck: ...but does once friendly fire is on",
      duckableShot(sc, mate, s, STEP, { friendlyFire: true }) === true);
    t.ok("duck: and never at a round it fired itself",
      duckableShot(sc, shot(60, 262, 900, 0, { team: "player", owner: s }), s, STEP, { friendlyFire: true }) === false);
  }

  // ---- arcs are walked, not drawn as a straight line -----------------------
  // A lobbed pod (spore_wisp's: gravity 0.4, life 3) is wrong in BOTH directions
  // under a straight sight line, so each case below pairs the verdict with what
  // losBetween — the real sight test — says about the same muzzle and target.
  {
    // (a) a low block the sight line clears and the pod drops into.
    const block = duckScene([FLOOR, { x: 150, y: 270, w: 20, h: 30 }]);
    const flat = { x: 60, y: 258, vx: 300, vy: 0 };
    t.ok("arc: the sight line from the muzzle to where the round lands is clear",
      losBetween(flat.x, flat.y + 2, 215, 262, block.platforms) === true);
    t.ok("arc: a straight round on that line is duckable",
      duckableShot(block, shot(flat.x, flat.y, flat.vx, flat.vy, { w: 8, h: 8, life: 3 }), duckTarget(), STEP, {}) === true);
    t.ok("arc: the same round WITH gravity falls into the block, so no duck",
      duckableShot(block, shot(flat.x, flat.y, flat.vx, flat.vy, { w: 8, h: 8, life: 3, gravity: 0.4 }), duckTarget(), STEP, {}) === false);
  }
  {
    // (b) a tall wall the sight line is blocked by and the pod lobs over. The
    // target is far right, where the arc comes back down onto a standing head.
    const tall = duckScene([FLOOR, { x: 150, y: 200, w: 20, h: 100 }]);
    const far = new Soldier(data, rifle, 405, G - STAND_H);
    t.ok("arc: the sight line to the far target is BLOCKED by the wall",
      losBetween(60, 292, 420, 277, tall.platforms) === false);
    const pod = shot(60, 290, 300, -500, { w: 8, h: 8, life: 3, gravity: 0.4 });
    t.ok("arc: the lobbed pod clears it and is duckable anyway",
      duckableShot(tall, pod, far, STEP, {}) === true);
    t.ok("arc: judging it did not disturb the round", pod.x === 60 && pod.y === 290 && pod.life === 3);
  }
}
