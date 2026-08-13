// Companions aim in 2D (bug fix, Aug 2026). Two defects, one symptom: a
// companion only shot at enemies within a ~40px vertical band of itself.
//
//   1. the `combat` state was entered only when !sense.playerAbove &&
//      !sense.playerBelow  (src/game/companionspecs.js)
//   2. the shot direction was hardcoded { x: facing, y: 0 }  (src/mission/ai.js)
//
// Fixing either alone changes nothing visible, so these assert the pair: the
// companion ENGAGES a target it cannot reach horizontally, and the round it
// fires actually travels toward it. Spec enemies (patternAngles) and the player
// (aimVec) already aimed in 2D; the companion bridge was the last flat shooter.
import { instantiate } from "../src/mission/enemyspec/runtime.js";
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { updateCompanionSpec } from "../src/mission/ai.js";
import { Soldier, STAND_H, stepActor } from "../src/mission/entities.js";

const STEP = 1 / 60;
// aim 10 → accuracy 1 → zero spread, so a shot's velocity IS the aim vector.
const rifle = { id: "rifle", name: "R", fireRate: 7, projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 1 }, effects: [] };
const roster = (id) => ({ id, name: id, callsign: "", stats: { aim: 10, health: 5, speed: 5, nerve: 5 }, traits: [], cost: 0, status: "roster", record: { missions: 1, kills: 0 }, wounds: 0 });
const noopCtx = { friendlyFire: false, damageMult: 1, damage() {}, kill() {}, spark() {}, burst() {} };

function scene(extra = {}) {
  return {
    world: { width: 1600, height: 540, gravity: 2000 },
    platforms: [{ x: 0, y: 500, w: 1600, h: 40 }],
    soldiers: [], enemies: [], projectiles: [], specRoots: [],
    sound: null,
    ...extra,
  };
}

// A target that stays exactly where it is put: nothing in these tests ticks it,
// so its own motion controller never runs.
function foeAt(x, y) {
  const r = instantiate(normalizeSpec({ id: "dummy", root: { health: { max: 50 }, visual: { size: [30, 40] }, motion: { type: "static" } } }), x, y);
  r.rng = () => 0.5;
  return r;
}

// Run the companion for `frames`, recording every shot AND whether the agent
// could see its target on the frame that shot was fired. `move` false freezes
// the body (no stepActor), which is how a blocked-sight scene is kept from
// being solved by repositioning mid-test.
function play(comp, sc, leader, frames, move = true) {
  const shots = [];
  for (let i = 0; i < frames; i++) {
    if (comp.fireCooldown > 0) comp.fireCooldown -= STEP; // the mission ticks this centrally
    const before = sc.projectiles.length;
    updateCompanionSpec(comp, STEP, sc, leader, noopCtx);
    if (move) stepActor(comp, STEP, sc.world, sc.platforms);
    for (let j = before; j < sc.projectiles.length; j++) {
      // the bearing is captured AT FIRE TIME — the companion is walking, so
      // comparing a shot against where it ended up would prove nothing
      shots.push({ p: sc.projectiles[j], los: comp.agent.sense.los, want: bearing(comp, sc.specRoots[0]) });
    }
  }
  return shots;
}

// unit bearing from the muzzle to a target's centre
function bearing(comp, foe) {
  const dx = foe.x + foe.w / 2 - (comp.x + comp.w / 2);
  const dy = foe.y + foe.h / 2 - (comp.y + comp.h * 0.42);
  const len = Math.hypot(dx, dy);
  return { x: dx / len, y: dy / len };
}

// cosine between a fired round and where the target actually was
function onTarget(s) {
  const len = Math.hypot(s.p.vx, s.p.vy);
  return (s.p.vx / len) * s.want.x + (s.p.vy / len) * s.want.y;
}

export default async function run(t) {
  // ---- a target ABOVE: the case the ±40px band made unplayable --------------
  {
    const leader = new Soldier(roster("L"), rifle, 250, 500 - STAND_H);
    const comp = new Soldier(roster("C"), rifle, 300, 500 - STAND_H);
    // 220 right, ~280 up. No platform on the sight line but the floor.
    const foe = foeAt(520, 180);
    const sc = scene({ soldiers: [leader, comp], specRoots: [foe] });
    const shots = play(comp, sc, leader, 240);

    t.ok(`above: engages and fires (${shots.length} shots)`, shots.length > 3);
    t.eq("above: brain reached the combat state", comp.agent.brainState.current, "combat");
    const up = shots.filter((s) => s.p.vy < -200).length;
    t.ok(`above: the rounds travel UPWARD (${up}/${shots.length} with vy < -200)`, up === shots.length);
    // the strong claim: the shot is on the true bearing, not merely non-flat
    const worst = shots.reduce((acc, s) => Math.min(acc, onTarget(s)), 1);
    t.ok(`above: every round is aimed at the target (worst cos ${worst.toFixed(5)})`, worst > 0.9999);
  }

  // ---- a target BELOW -------------------------------------------------------
  {
    const leader = new Soldier(roster("L"), rifle, 250, 300 - STAND_H);
    const comp = new Soldier(roster("C"), rifle, 300, 300 - STAND_H);
    const sc = scene({
      soldiers: [leader, comp],
      // a ledge for the companion; the sight line down to the floor is clear
      platforms: [{ x: 0, y: 500, w: 1600, h: 40 }, { x: 240, y: 300, w: 220, h: 20 }],
      specRoots: [foeAt(700, 460)],
    });
    const shots = play(comp, sc, leader, 240);
    t.ok(`below: engages and fires (${shots.length} shots)`, shots.length > 3);
    const down = shots.filter((s) => s.p.vy > 100).length;
    t.ok(`below: the rounds travel DOWNWARD (${down}/${shots.length} with vy > 100)`, down === shots.length);
  }

  // ---- the trigger is gated on sight, the ENGAGEMENT is not -----------------
  // A companion that cannot see its target must not fire — with a 2D aim vector
  // it would otherwise put rounds into the wall in front of it. It must still
  // ENTER combat, because combat is what puts it in keepDistance, and
  // keepDistance is what lets it reposition for a sight line
  // (tech/ranged-repositioning.md). The body is frozen so the blocked state is
  // the whole test.
  {
    const leader = new Soldier(roster("L"), rifle, 250, 500 - STAND_H);
    const comp = new Soldier(roster("C"), rifle, 300, 500 - STAND_H);
    const sc = scene({
      soldiers: [leader, comp],
      platforms: [{ x: 0, y: 500, w: 1600, h: 40 }, { x: 420, y: 180, w: 40, h: 320 }],
      specRoots: [foeAt(560, 460)],
    });
    const shots = play(comp, sc, leader, 120, false);
    t.eq("blocked: no sight line", comp.agent.sense.los, false);
    t.eq("blocked: fires nothing through the wall", shots.length, 0);
    t.eq("blocked: but still engages, so it can reposition", comp.agent.brainState.current, "combat");
  }

  // ---- every shot in every scene was fired with a sight line ----------------
  {
    const leader = new Soldier(roster("L"), rifle, 500, 500 - STAND_H);
    const comp = new Soldier(roster("C"), rifle, 520, 500 - STAND_H);
    const sc = scene({
      soldiers: [leader, comp],
      // the reposition suite's cover: too tall to see over, low enough to climb
      platforms: [{ x: 0, y: 500, w: 1600, h: 40 }, { x: 600, y: 420, w: 200, h: 80 }],
      specRoots: [foeAt(1000, 454)],
    });
    const shots = play(comp, sc, leader, 60 * 20);
    t.ok(`cover: it works the problem and gets shots off (${shots.length})`, shots.length > 0);
    t.ok("cover: no shot was ever fired blind", shots.every((s) => s.los));
  }

  // ---- aim is a channel of its own, not a function of facing ----------------
  // The defect was that the shot WAS facing, which is horizontal by
  // construction. Target dead overhead and inside the keepDistance band, so the
  // body has no reason to move: facing stays ±1 (the locomotor is its only
  // writer, locomotion.js) while the barrel points near-vertically.
  {
    const leader = new Soldier(roster("L"), rifle, 300, 500 - STAND_H);
    const comp = new Soldier(roster("C"), rifle, 300, 500 - STAND_H);
    const sc = scene({ soldiers: [leader, comp], specRoots: [foeAt(comp.x - 8, 200)] });
    play(comp, sc, leader, 60);
    t.ok(`aim: the barrel is near-vertical (aimVec.y ${comp.aimVec.y.toFixed(3)})`, comp.aimVec.y < -0.98);
    t.ok("aim: facing is still a horizontal ±1 the ground probe can use", Math.abs(comp.facing) === 1);
    t.ok("aim: and the shot does NOT follow facing", Math.abs(comp.fireDir().y) > 0.98);
  }

  // ---- housekeeping: the barrel drops when there is nothing to shoot --------
  {
    const leader = new Soldier(roster("L"), rifle, 250, 500 - STAND_H);
    const comp = new Soldier(roster("C"), rifle, 300, 500 - STAND_H);
    const sc = scene({ soldiers: [leader, comp], specRoots: [foeAt(520, 180)] });
    updateCompanionSpec(comp, STEP, sc, leader, noopCtx);
    t.ok("aimVec: set while a hostile exists", !!comp.aimVec);
    t.ok("aimVec: fireDir() is the aim vector, same as the player's path", comp.fireDir() === comp.aimVec);
    sc.specRoots.length = 0;
    updateCompanionSpec(comp, STEP, sc, leader, noopCtx);
    t.eq("aimVec: cleared with no hostile, so the sprite returns to the forward pose", comp.aimVec, null);
  }

  // ---- the common case did not regress --------------------------------------
  {
    const leader = new Soldier(roster("L"), rifle, 250, 500 - STAND_H);
    const comp = new Soldier(roster("C"), rifle, 300, 500 - STAND_H);
    const sc = scene({ soldiers: [leader, comp], specRoots: [foeAt(650, 500 - 40)] });
    const shots = play(comp, sc, leader, 240);
    t.ok(`level: still fires on a level enemy (${shots.length} shots)`, shots.length > 3);
    t.ok("level: and those rounds are still ~flat", shots.every((s) => Math.abs(s.p.vy) < 120));
  }
}
