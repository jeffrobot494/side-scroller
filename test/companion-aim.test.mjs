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
//
// The suite now also guards what a companion does when the level is CLEARED —
// see the "cleared" cases at the bottom.
//
// It also owns the BEHAVIOUR half of the duck reflex (tech/soldier-ducking.md):
// who kneels, when, and for how long — the geometry half (which rounds a knee
// answers) is duckableShot's, in crouch.test.mjs. See the "ducking" cases at the
// bottom; they are what brought a firing enemy and a projectile step into this
// suite, which had a squadmate and no incoming fire.
import { instantiate, updateSpecEnemy } from "../src/mission/enemyspec/runtime.js";
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { updateCompanionSpec } from "../src/mission/ai.js";
import { nearestHostile, exposureAt } from "../src/mission/enemyspec/perception.js";
import { updateProjectiles } from "../src/mission/combat.js";
import { Soldier, Projectile, STAND_H, stepActor, tickReload } from "../src/mission/entities.js";
import { config } from "../src/game/config.js";
import { makeRng } from "../src/game/gen/rng.js";

const STEP = 1 / 60;
// aim 10 → accuracy 1 → zero spread, so a shot's velocity IS the aim vector.
const rifle = { id: "rifle", name: "R", fireRate: 7, projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 1 }, effects: [] };
const roster = (id, speed = 5) => ({ id, name: id, callsign: "", stats: { aim: 10, health: 5, speed, nerve: 5 }, traits: [], cost: 0, status: "roster", record: { missions: 1, kills: 0 }, wounds: 0 });
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
// so its own motion controller never runs. It carries a straight gun it never
// fires, because exposure is "which hostile weapons can reach me"
// (tech/squad-survival.md, V4) and an unarmed dummy reaches nobody.
const GUN = { gun: { at: [0, 0], projectile: { speed: 700, life: 2, damage: 1 } } };
function foeAt(x, y) {
  const r = instantiate(normalizeSpec({ id: "dummy", root: { health: { max: 50 }, visual: { size: [30, 40] }, motion: { type: "static" }, emitters: GUN } }), x, y);
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

// ---- incoming fire (the ducking cases) ------------------------------------

// A stationary gunner streaming AIMED rounds at the nearest soldier. Its shots
// jitter up to ±2° off the target's centre (patternAngles' default), which is
// what puts rounds in the upper half of a standing box: a perfectly centred
// round grazes the crouched box top and is correctly NOT duckable.
const GUNNER = normalizeSpec({
  v: 1, id: "test_gunner", name: "Test Gunner", threat: 50,
  root: {
    id: "root", tags: ["enemy"],
    visual: { shape: "box", size: [38, 38], color: "#f00" },
    health: { max: 1e9 }, // indestructible: the companion shoots back
    motion: { type: "static" },
    emitters: { gun: { at: [0, 0], projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 2, damage: 4 } } },
  },
  brain: { start: "fire", states: { fire: { tracks: [{ id: "g", loop: true, steps: [
    { fire: { emitter: "gun", pattern: "aimed" } },
    { wait: 0.12 },
  ] }] } } },
});

// ctx that keeps score for ONE soldier (the leader is in the scene too).
function tally(who) {
  const c = {
    dealt: 0, friendlyFire: false, damageMult: 1,
    damage(target, amount) { target.health -= amount; if (target === who) c.dealt += amount; },
    kill() {}, spark() {}, burst() {},
  };
  return c;
}

// The mission's own frame order (mission.js _update): soldiers, THEN enemies,
// THEN projectiles — so a round is never in scene.projectiles on the frame it
// was fired, and the reflex first sees it a frame late. Returns the stance log.
function underFire(comp, sc, leader, gunner, frames, ctx) {
  const stance = [];
  for (let i = 0; i < frames; i++) {
    if (comp.fireCooldown > 0) comp.fireCooldown -= STEP;
    updateCompanionSpec(comp, STEP, sc, leader, ctx);
    stepActor(comp, STEP, sc.world, sc.platforms);
    if (gunner) updateSpecEnemy(gunner, STEP, sc, ctx);
    updateProjectiles(sc, STEP, ctx);
    stance.push(comp.crouched);
  }
  return stance;
}

// One firefight, from a fixed seed so the gunner's jitter stream is identical
// between runs and the stance is the only variable.
function firefight(seed, speed = 5, frames = 600) {
  const real = Math.random;
  Math.random = makeRng(seed);
  try {
    const leader = new Soldier(roster("L"), rifle, 250, 500 - STAND_H);
    const comp = new Soldier(roster("C", speed), rifle, 300, 500 - STAND_H);
    comp.health = comp.maxHealth = 1e6; // survives the whole stream
    const gunner = instantiate(GUNNER, 760, 500 - 38);
    const sc = scene({ soldiers: [leader, comp], specRoots: [gunner] });
    const ctx = tally(comp);
    const stance = underFire(comp, sc, leader, gunner, frames, ctx);
    return { comp, stance, dealt: ctx.dealt, kneeled: stance.filter(Boolean).length, first: stance.indexOf(true) };
  } finally {
    Math.random = real;
  }
}

// Three seeds summed, so a claim about the dice is not a claim about one lucky
// stream. Every field of firefight() adds.
function firefights(speed, opts = {}) {
  const runs = [20260816, 1, 2].map((seed) => firefight(seed, speed, opts.frames));
  return {
    kneeled: runs.reduce((a, r) => a + r.kneeled, 0),
    dealt: runs.reduce((a, r) => a + r.dealt, 0),
    first: runs.map((r) => r.first),
  };
}


// ---- cover (tech/squad-survival.md, V3) -----------------------------------
// A floor, a low wall a squadmate can hop and hide behind (it blocks a level
// sight line), a target dummy on the far side, and the leader behind the wall.
// `drive` is the mission's own per-soldier order for what the tests need:
// the central fire-cooldown and reload ticks, the bridge, the integrator.
const magRifle = { ...rifle, magazine: 3, reloadTime: 1.2 };
function coverScene(foeX = 800) {
  const cues = [];
  const sc = scene({
    platforms: [{ x: 0, y: 500, w: 2400, h: 40 }, { x: 330, y: 440, w: 24, h: 60 }],
    specRoots: [foeAt(foeX, 460)],
    sound: (cue) => cues.push(cue),
  });
  sc.world.width = 2400;
  const leader = new Soldier(roster("L"), rifle, 150, 500 - STAND_H);
  const comp = new Soldier(roster("C"), magRifle, 420, 500 - STAND_H);
  sc.soldiers.push(leader, comp);
  return { sc, leader, comp, cues };
}
function drive(comp, sc, leader, seconds, log = []) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    if (comp.fireCooldown > 0) comp.fireCooldown -= STEP;
    tickReload(comp, STEP, sc);
    updateCompanionSpec(comp, STEP, sc, leader, noopCtx);
    stepActor(comp, STEP, sc.world, sc.platforms);
    const a = comp.agent;
    const st = a.brainState.current;
    const prev = log.length ? log[log.length - 1].state : null;
    if (st !== prev) log.push({ state: st, x: comp.x + comp.w / 2, reloading: comp.reloading, far: a.sense.leaderFar, dist: a.sense.dist });
  }
  return log;
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

  // ---- the level is CLEARED (bug fix, Aug 2026) -----------------------------
  // Emptying specRoots, as the case above does, is the ONE thing a real mission
  // never does: a dead root stays in scene.specRoots for the kill-credit/loot
  // pass (mission.js). nearestHostile used to degrade to `list[0]` when nothing
  // in the list was alive, so the last enemy's corpse stayed a valid target —
  // sense.dist never crossed the 640 break-off (so the brain never left combat
  // and never re-formed on the leader), keepDistance held the standoff band
  // around the death spot, and sense.los kept the fight track pulling the
  // trigger. These kill the root IN PLACE instead.
  {
    const sc = scene({ specRoots: [foeAt(500, 300)] });
    sc.specRoots[0].alive = false;
    const seen = nearestHostile({ x: 300, y: 300, w: 20, h: 24, team: "player" }, sc);
    t.ok("cleared: a list of corpses is no target at all", seen === null);
  }
  {
    const leader = new Soldier(roster("L"), rifle, 250, 500 - STAND_H);
    const comp = new Soldier(roster("C"), rifle, 300, 500 - STAND_H);
    const foe = foeAt(650, 500 - 40);
    const sc = scene({ soldiers: [leader, comp], specRoots: [foe] });
    play(comp, sc, leader, 240);
    t.eq("cleared: engaged while the enemy lived", comp.agent.brainState.current, "combat");

    foe.alive = false; // the corpse STAYS in specRoots, exactly as in a mission
    sc.projectiles.length = 0;
    const after = play(comp, sc, leader, 240);

    t.eq(`cleared: fires nothing at the corpse (${after.length} shots)`, after.length, 0);
    t.eq("cleared: aim drops to the forward pose", comp.aimVec, null);
    t.eq("cleared: and the brain goes back to escorting", comp.agent.brainState.current, "escort");
    const gap = Math.abs((comp.x + comp.w / 2) - (leader.x + leader.w / 2));
    t.ok(`cleared: so it re-forms on the leader instead of holding the death spot (gap ${Math.round(gap)}px)`, gap < 200);
  }
  {
    // the fix must not read "one dead root in the list" as "nothing to fight"
    const leader = new Soldier(roster("L"), rifle, 250, 500 - STAND_H);
    const comp = new Soldier(roster("C"), rifle, 300, 500 - STAND_H);
    const dead = foeAt(400, 500 - 40);
    dead.alive = false;
    const sc = scene({ soldiers: [leader, comp], specRoots: [dead, foeAt(650, 500 - 40)] });
    const shots = play(comp, sc, leader, 240);
    t.ok(`survivor: still engages the living enemy past the corpse (${shots.length} shots)`, shots.length > 3);
    t.ok("survivor: and the barrel is on the live one", comp.aimVec !== null);
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

  // ---- ducking: a squadmate gets the knee (D1) ------------------------------
  // Reaction is deliberately certain and immediate in D1 — the whole mechanism
  // minus the Speed dice, so the geometry can be judged before they are added.
  {
    const on = firefight(20260816);
    t.ok(`duck: a squadmate under aimed fire kneels (${on.kneeled}/${on.stance.length} frames down)`, on.kneeled > 0);
    t.ok("duck: and is standing again by the end — it holds briefly, it does not stay down",
      on.stance[on.stance.length - 1] === false);
    // it never stays down: every kneel ends within the hold, plus the frame the
    // reflex needs to notice the next round
    const longest = on.stance.reduce((acc, c) => (c ? { run: acc.run + 1, max: Math.max(acc.max, acc.run + 1) } : { run: 0, max: acc.max }), { run: 0, max: 0 }).max;
    t.ok(`duck: no kneel outlasts the hold knob (longest ${longest} frames, hold ${config.duckHoldTime}s)`,
      longest <= Math.ceil(config.duckHoldTime / STEP) + 2);

    // The A/B the feature exists for. Same seed, same gunner, same shot stream;
    // duckHoldTime 0 is the switch that turns the reflex off entirely.
    const hold = config.duckHoldTime;
    config.duckHoldTime = 0;
    const off = firefight(20260816);
    config.duckHoldTime = hold;
    t.eq("duck: with the hold at 0 nobody kneels at all", off.kneeled, 0);
    t.ok(`duck: and ducking is what makes the difference in damage taken (${Math.round(on.dealt)} vs ${Math.round(off.dealt)})`,
      on.dealt < off.dealt);
  }

  // ---- ducking: friendly rounds are not something to kneel at ---------------
  {
    const leader = new Soldier(roster("L"), rifle, 250, 500 - STAND_H);
    const comp = new Soldier(roster("C"), rifle, 300, 500 - STAND_H);
    const sc = scene({ soldiers: [leader, comp], specRoots: [foeAt(900, 500 - 40)] });
    const ctx = tally(comp);
    // the leader's round, on the line through the companion's standing head
    const spec = { w: 12, h: 4, color: "#fff", life: 2, gravity: 0 };
    sc.projectiles.push(new Projectile(120, 500 - 40, 900, 0, spec, "player", [], leader));
    const stance = underFire(comp, sc, leader, null, 90, ctx);
    t.ok("duck: a squadmate does not kneel at its own side's fire", stance.every((c) => c === false));
  }

  // ---- ducking: the swap-away stand-up this feature took over ---------------
  // mission.js used to force every non-controlled soldier to stand every frame,
  // which is what stood a swapped-away soldier up. The reflex owns that now.
  {
    const leader = new Soldier(roster("L"), rifle, 250, 500 - STAND_H);
    const comp = new Soldier(roster("C"), rifle, 300, 500 - STAND_H);
    const sc = scene({ soldiers: [leader, comp] });
    comp.setCrouch(true); // the player was kneeling in this body, then hit Tab
    t.ok("swap: kneeling at the moment control leaves", comp.crouched === true);
    updateCompanionSpec(comp, STEP, sc, leader, noopCtx);
    t.ok("swap: stands back up on the same tick it becomes a squadmate", comp.crouched === false);
  }

  // ---- ducking: Speed decides (D2) -----------------------------------------
  // The stat does two different jobs, so they are measured apart. CHANCE decides
  // whether a soldier is the kind of person who saw it coming — invisible on
  // screen, so it is measured in outcomes. LATENCY decides how good they look
  // doing it, and IS visible, so it is measured in frames.
  {
    const slow = firefights(1);
    const fast = firefights(10);
    t.ok(`speed: a fast squadmate reacts far more often (${fast.kneeled} frames down vs ${slow.kneeled}, 3 seeds)`,
      fast.kneeled > slow.kneeled * 1.5);
    t.ok(`speed: and takes less fire for it (${Math.round(fast.dealt)} vs ${Math.round(slow.dealt)})`,
      fast.dealt < slow.dealt);
  }
  {
    // Latency alone: with the roll forced to succeed, both soldiers commit to
    // the same duck on the same frame and then STAND through their delay — the
    // bodies are identical until the drop, which is what makes the frame counts
    // comparable at all.
    const chance = [config.duckChanceSlow, config.duckChanceFast];
    config.duckChanceSlow = 1;
    config.duckChanceFast = 1;
    const slow = firefights(1);
    const fast = firefights(10);
    [config.duckChanceSlow, config.duckChanceFast] = chance;

    t.ok(`speed: the fast soldier is down within a few frames every time (${fast.first.join(", ")})`,
      fast.first.every((f) => f >= 0 && f <= Math.ceil(config.duckLatencyFast / STEP) + 2));
    t.ok(`speed: the slow one stands through its delay first (${slow.first.join(", ")})`,
      slow.first.every((f, i) => f > fast.first[i]));
    // the gap between them IS the difference between the two latency knobs
    const want = Math.round((config.duckLatencySlow - config.duckLatencyFast) / STEP);
    const got = slow.first[0] - fast.first[0];
    t.ok(`speed: and the gap is the latency curve, not noise (${got} frames, want ~${want})`, Math.abs(got - want) <= 2);
    t.ok(`speed: being late costs hit points even when the reaction lands (${Math.round(slow.dealt)} vs ${Math.round(fast.dealt)})`,
      slow.dealt > fast.dealt);
  }

  // ---- survival senses (tech/squad-survival.md, V1) -------------------------
  // Seam only: nothing reads them yet. What is pinned is that they are TRUE to
  // the body, and that the fight ending does not freeze them.
  {
    const magRifle = { ...rifle, magazine: 10, reloadTime: 1.5 };
    const leader = new Soldier(roster("L"), rifle, 250, 500 - STAND_H);
    const comp = new Soldier(roster("C"), magRifle, 300, 500 - STAND_H);
    const sc = scene({ soldiers: [leader, comp], specRoots: [foeAt(650, 500 - 40)] });
    play(comp, sc, leader, 2, false);
    const a = comp.agent;
    t.ok("survival: the companion is opted in", !!a.survival);
    t.eq("survival: its HP is the soldier's, not the agent's constant 1", a.maxHealth, comp.maxHealth);
    t.ok("survival: healthy and unhurt is neither wounded nor under fire", a.sense.wounded === false && a.sense.underFire === false);
    t.eq("survival: one hostile in sight is exposure 1", a.sense.exposure, 1);
    t.eq("survival: and until V4 a shot is exactly line of sight", a.sense.shot, a.sense.los);

    comp.health = comp.maxHealth * 0.3;
    play(comp, sc, leader, 13, false);
    t.ok("survival: a health drop is being under fire", a.sense.underFire === true);
    t.ok("survival: and below the knob is wounded", a.sense.wounded === true);
    t.ok("survival: which is not calm", a.sense.calm === false);

    comp.ammo = 0;
    play(comp, sc, leader, 13, false);
    t.ok("survival: an empty magazine with a spare reloads, which is needReload",
      comp.reloading > 0 && a.sense.needReload === true && a.sense.outOfAmmo === false);
    comp.reloading = 0;
    comp.magsLeft = 0;
    comp.ammo = 0;
    play(comp, sc, leader, 13, false);
    t.ok("survival: empty with no spare is outOfAmmo", a.sense.outOfAmmo === true && a.sense.needReload === false);

    // The last hostile dies: calm has to arrive anyway, or cover never ends.
    sc.specRoots[0].alive = false;
    play(comp, sc, leader, Math.ceil((config.survivalCalmTime + 0.3) / STEP), false);
    t.ok("survival: with nothing left alive, calm still arrives", a.sense.calm === true && a.sense.underFire === false);
    t.ok("survival: and there is nothing to be exposed to or to shoot", a.sense.exposure === 0 && a.sense.shot === false);
  }
  {
    // A wall between them: seen by nobody, a shot at nobody.
    const leader = new Soldier(roster("L"), rifle, 250, 500 - STAND_H);
    const comp = new Soldier(roster("C"), rifle, 300, 500 - STAND_H);
    const sc = scene({ soldiers: [leader, comp], specRoots: [foeAt(650, 500 - 40)] });
    sc.platforms.push({ x: 480, y: 300, w: 30, h: 200 });
    play(comp, sc, leader, 2, false);
    t.ok("survival: behind a wall, exposure 0 and no shot", comp.agent.sense.exposure === 0 && comp.agent.sense.shot === false);
  }
  {
    // An inbound rocket is fire. The explode rule belongs to the duck alone.
    const leader = new Soldier(roster("L"), rifle, 250, 500 - STAND_H);
    const comp = new Soldier(roster("C"), rifle, 300, 500 - STAND_H);
    const sc = scene({ soldiers: [leader, comp], specRoots: [foeAt(900, 500 - 40)] });
    const spec = { w: 8, h: 8, color: "#f80", life: 3, gravity: 0 };
    sc.projectiles.push(new Projectile(520, 500 - 30, -300, 0, spec, "enemy", [{ kind: "explode", radius: 60, amount: 10 }], null));
    play(comp, sc, leader, 1, false);
    t.ok("survival: an inbound explosive round sets underFire", comp.agent.sense.underFire === true);
    t.ok("survival: and it is still not ducked", comp.crouched === false);
  }
  {
    // The leash, with its hysteresis: out past it sets, back inside the margin
    // clears, and in between keeps what it was.
    const leader = new Soldier(roster("L"), rifle, 250, 500 - STAND_H);
    const comp = new Soldier(roster("C"), rifle, 300, 500 - STAND_H);
    const sc = scene({ soldiers: [leader, comp] });
    const at = (d) => { leader.x = comp.x - d; play(comp, sc, leader, 13, false); return comp.agent.sense.leaderFar; };
    t.ok("leash: near is not far", at(100) === false);
    t.ok("leash: past the leash is far", at(config.survivalLeash + 20) === true);
    t.ok("leash: just inside it is STILL far", at(config.survivalLeash - config.survivalLeashMargin / 2) === true);
    t.ok("leash: inside the margin clears it", at(config.survivalLeash - config.survivalLeashMargin - 20) === false);
  }
  {
    // Not opted in: an ordinary player-team agent (the Behavior Lab's) never
    // publishes any of it.
    const plain = instantiate(normalizeSpec({ id: "plain", root: { visual: { size: [30, 46] }, motion: { type: "static" } } }), 300, 454, "player");
    const sc = scene({ specRoots: [foeAt(650, 500 - 40)] });
    updateSpecEnemy(plain, STEP, sc, noopCtx);
    t.ok("survival: an agent nobody opted in publishes none of it", !("underFire" in plain.sense) && !("exposure" in plain.sense));
  }

  // ---- cover transitions: the outcome table (V3) ----------------------------
  {
    // Reloading, nobody shooting: cover inside the reload, then combat ONCE.
    // Then out of ammo with the fight in range and the leader near: cover, held.
    const { sc, leader, comp, cues } = coverScene();
    comp.magsLeft = 1;
    const log = drive(comp, sc, leader, 6);
    const states = log.map((e) => e.state);
    t.eq("cover: combat, cover for the reload, combat, cover when empty", states, ["combat", "cover", "combat", "cover"]);
    t.ok(`cover: the reload's cover is behind the wall (${Math.round(log[2].x)}px, wall at 330)`, log[2].x < 330);
    t.ok("cover: one switch each way per reload — it came out only once the reload was done", log[2].reloading === 0);
    t.ok("cover: empty, it stays in cover while the fight lasts", comp.agent.brainState.current === "cover" && comp.ammo === 0);
    t.eq("cover: and never dry-clicks", cues.filter((c) => c === "weapon.empty").length, 0);

    // Out of ammo, leader walks away: it follows, exposed.
    // (Away from the fight: walking past the hostile would bring the leader
    // back inside the leash with a fight in range, which is cover again.)
    leader.x = 2300;
    const away = drive(comp, sc, leader, 7);
    t.eq("cover: the leader walks off — the empty squadmate escorts", away.map((e) => e.state), ["cover", "escort"]);
    t.ok(`cover: and follows (${Math.round(comp.x)} toward ${leader.x})`, comp.x > 1800);
    // ...and re-enters cover only when the leader is back inside the leash and
    // a hostile is within engage range.
    leader.x = 150;
    const back = drive(comp, sc, leader, 8);
    const entry = back.find((e) => e.state === "cover");
    t.ok("cover: it comes back and takes cover again", !!entry);
    t.ok(`cover: only once the leader is near and the fight in range (far ${entry && entry.far}, ${Math.round(entry ? entry.dist : 0)}px)`,
      !!entry && entry.far === false && entry.dist < 520);
    t.ok("cover: never combat while empty", ![...away, ...back].some((e) => e.state === "combat"));

    // Out of ammo, fight over: escort, and it does not re-enter.
    sc.specRoots[0].alive = false;
    const over = drive(comp, sc, leader, 3);
    t.eq("cover: the fight over, the empty squadmate escorts and stays escorting", over.map((e) => e.state), ["cover", "escort"]);
  }
  {
    // Wounded and hit beyond engage range: cover from escort, back on calm.
    const { sc, leader, comp } = coverScene(1300);
    drive(comp, sc, leader, 0.5);
    t.eq("cover: out of range it escorts", comp.agent.brainState.current, "escort");
    comp.health = comp.maxHealth * 0.3;
    const log = drive(comp, sc, leader, 0.5);
    t.eq("cover: wounded and hit, it takes cover", log.map((e) => e.state), ["escort", "cover"]);
    const calm = drive(comp, sc, leader, config.survivalCalmTime + 0.5);
    t.eq("cover: and escorts again once it is calm", calm.map((e) => e.state), ["cover", "escort"]);
  }
  {
    // In cover when the last hostile dies: escort within calm time plus a tick.
    const { sc, leader, comp } = coverScene();
    drive(comp, sc, leader, 0.5);
    comp.health = comp.maxHealth * 0.3;
    drive(comp, sc, leader, 0.3);
    t.eq("cover: wounded and hit in a fight, it takes cover", comp.agent.brainState.current, "cover");
    sc.specRoots[0].alive = false;
    let frames = 0;
    while (comp.agent.brainState.current === "cover" && frames < 600) { drive(comp, sc, leader, STEP); frames++; }
    const limit = config.survivalCalmTime + 0.2;
    t.ok(`cover: the last hostile dead, it escorts within calm time plus a sense tick (${(frames * STEP).toFixed(2)}s ≤ ${limit}s)`,
      comp.agent.brainState.current === "escort" && frames * STEP <= limit + STEP);
  }

  // ---- seeing is not hitting (V4) -------------------------------------------
  {
    // In sight, out of range: a round that dies at 270px is no shot at 400.
    const short = { ...rifle, projectile: { ...rifle.projectile, life: 0.3 } };
    const leader = new Soldier(roster("L"), rifle, 100, 500 - STAND_H);
    const comp = new Soldier(roster("C"), short, 300, 500 - STAND_H);
    const sc = scene({ soldiers: [leader, comp], specRoots: [foeAt(700, 500 - 40)] });
    const shots = play(comp, sc, leader, 120, false);
    t.ok("reach: the target is in plain sight", comp.agent.sense.los === true);
    t.ok("reach: but the round cannot get there, so there is no shot", comp.agent.sense.shot === false);
    t.eq("reach: and the squadmate holds its fire", shots.length, 0);
  }
  {
    // Over a low wall: a straight gun cannot reach, a lobber can.
    const wall = { x: 520, y: 440, w: 24, h: 60 };
    const lobber = (x) => {
      const r = instantiate(normalizeSpec({ id: "lob", root: { health: { max: 50 }, visual: { size: [30, 40] }, motion: { type: "static" },
        emitters: { pod: { at: [0, -10], projectile: { speed: 520, life: 3, gravity: 0.4, damage: 1 } } } } }), x, 500 - 40);
      r.rng = () => 0.5;
      return r;
    };
    const sc = scene({ specRoots: [foeAt(700, 460)] });
    sc.platforms.push(wall);
    const me = { team: "player", w: 30, h: 46 };
    const at = [400, 500 - STAND_H / 2];
    t.eq("lob: behind the wall, a straight gun cannot reach", exposureAt(me, sc, ...at), 0);
    sc.specRoots = [lobber(700)];
    t.eq("lob: a lobber in the same place can", exposureAt(me, sc, ...at), 1);
    t.eq("lob: but not past its range", exposureAt(me, sc, 1900, at[1]), 0);
  }
  {
    // A charger has no gun: it reaches a radius around itself.
    const sc = scene({ specRoots: [instantiate(normalizeSpec({ id: "charger", root: { health: { max: 50 }, visual: { size: [30, 40] },
      motion: { type: "static" }, contact: { damage: 5 } } }), 700, 460)] });
    const me = { team: "player", w: 30, h: 46 };
    t.eq("melee: inside its reach is exposed", exposureAt(me, sc, 715 - config.survivalContactReach + 10, 477), 1);
    t.eq("melee: outside it is not", exposureAt(me, sc, 715 - config.survivalContactReach - 40, 477), 0);
  }
  {
    // A gravity weapon's barrel takes the arc that lands, and the rounds do land.
    const lobGun = { id: "lob", name: "Lob", fireRate: 3, projectile: { speed: 750, w: 8, h: 8, color: "#fff", life: 3, gravity: 0.5 }, effects: [{ kind: "damage", amount: 1 }] };
    const leader = new Soldier(roster("L"), rifle, 100, 500 - STAND_H);
    const comp = new Soldier(roster("C"), lobGun, 300, 500 - STAND_H);
    const foe = foeAt(700, 500 - 40);
    const sc = scene({ soldiers: [leader, comp], specRoots: [foe], enemies: [foe] });
    let hits = 0;
    const hitCtx = { ...noopCtx, damage(tg) { if (tg === foe) hits++; } };
    for (let i = 0; i < 180; i++) {
      if (comp.fireCooldown > 0) comp.fireCooldown -= STEP;
      updateCompanionSpec(comp, STEP, sc, leader, hitCtx);
      updateProjectiles(sc, STEP, hitCtx);
    }
    const flat = bearing(comp, foe);
    t.ok(`arc: the barrel is raised above the straight bearing (${comp.aimVec.y.toFixed(2)} vs ${flat.y.toFixed(2)})`, comp.aimVec.y < flat.y - 0.05);
    t.ok(`arc: and the lobbed rounds land on the target (${hits} hits)`, hits > 0);
  }
}
