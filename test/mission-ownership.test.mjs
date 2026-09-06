// ---------------------------------------------------------------------------
// MISSION OWNERSHIP — two commanders on one level
// (tech/multiplayer-missions.md, J1 and J2).
//
// A soldier has an OWNER: the commander who inputs for it and the one credited
// for it. It is a second axis over `scene.soldiers`, and the whole slice is that
// eleven sites which used to mean "the squad = the array" now partition by it.
//
// What owner is NOT is authority (this client simulates every soldier, whoever
// owns them) and it is NOT team (two commanders' squads are mutually
// non-hostile, which is decided by `opponents()` and `hostilesFor` reading the
// team axis and the soldier array whole). Both of those are asserted here, so a
// later slice that wires owner into either one fails in the file that says why.
//
// At one owner every partition is the whole array, which is why
// test/mission-golden.test.mjs does not move: it is the guard that single-player
// is untouched, and this suite is the guard that two owners are actually two.
//
// J2 added the second half: an END is per commander too. Reaching the exit
// resolves that commander alone, their squad is SPLICED OUT of scene.soldiers,
// and the level keeps running for whoever is left. The golden cannot see any of
// it — its 41 samples never resolve — so every assertion under "ends are
// independent" below is the only thing standing between this and a mission that
// stops when the first person walks out of it.
// ---------------------------------------------------------------------------

import { Mission } from "../src/mission/mission.js";
import { generateLevel } from "../src/game/gen/levelgen.js";
import { Loot } from "../src/mission/entities.js";
import { hostilesFor } from "../src/mission/enemyspec/perception.js";
import { makeEl } from "./harness.mjs";
import { resetConfig, config } from "../src/game/config.js";

const SEED = 20260901;
const STEP = 1 / 60;

const RIFLE = {
  id: "own_rifle", name: "Owner Rifle", fireRate: 6, auto: true, spread: 0.03,
  magazine: 24, reloadTime: 1.6,
  projectile: { speed: 900, w: 12, h: 4, color: "#ffd8a0", life: 1.4, shape: "bolt" },
  effects: [{ kind: "damage", amount: 6 }],
};

const member = (id, owner) => ({
  data: { id, name: id.toUpperCase(), callsign: id.slice(0, 2).toUpperCase(), stats: { health: 7, aim: 6, speed: 6 } },
  weapon: RIFLE,
  owner,
});

// Two commanders, two soldiers each, dispatched as ONE flat list — the shape a
// joint dispatch will hand both clients (J5).
const JOINT = [member("ana1", "ana"), member("ana2", "ana"), member("bo1", "bo"), member("bo2", "bo")];
const SOLO = [member("solo1", null), member("solo2", null), member("solo3", null)];
// The pre-J5 dispatch shape: no `owner` KEY at all. A room's campaign lives in
// the server process and a page is static files, so a page of this version can
// legitimately be handed a squad built by an older one for as long as that
// process runs — which is how this shape reaches a live mission.
const UNDECLARED = SOLO.map(({ owner, ...rest }) => rest);

// A MissionInput stand-in that presses nothing until told to. `aim` is whatever
// `aimSource()` should report — null, a `stick` direction, a `mouse` point in
// canvas pixels, or a `world` point (J7). `samples` counts sample() calls, so a
// driver that forgets one commander's input is visible rather than merely quiet.
function stubInput() {
  const held = new Set();
  const edges = new Set();
  return {
    aim: null,
    samples: 0,
    hold: (a) => held.add(a),
    release: (a) => held.delete(a),
    press: (a) => edges.add(a),
    isDown: (a) => held.has(a),
    justPressed(a) {
      if (!edges.has(a)) return false;
      edges.delete(a);
      return true;
    },
    aimSource() { return this.aim; },
    sample() { this.samples++; },
    reset() { this.samples = 0; },
    pollGamepad() {}, enable() {}, disable() {},
  };
}

function play(squad, owner) {
  const { level, mission } = generateLevel({ seed: SEED, difficulty: "low" });
  const m = new Mission(makeEl("canvas"), () => {});
  m.start(mission, level, squad, owner);
  m.running = false; // rAF is a no-op here anyway; the frames are ours
  m.input = stubInput();
  return m;
}

const idsOf = (list) => list.map((s) => s.id);

export default async function run(t) {
  resetConfig();
  t.ok("setup: the spec brain is the path under test", config.companionBrain === "spec");

  // ---- the axis ----------------------------------------------------------
  {
    const m = play(JOINT, "ana");
    t.eq("owners: distinct commanders, in spawn order", m.owners().join(","), "ana,bo");
    t.eq("owners: this client's commander is the one it was started for", m.owner, "ana");
    t.eq("squad: ana's is hers alone", idsOf(m.soldiersOf("ana")).join(","), "ana1,ana2");
    t.eq("squad: and bo's is his", idsOf(m.soldiersOf("bo")).join(","), "bo1,bo2");
    t.eq("squad: the scene still holds one flat array of all four", m.scene.soldiers.length, 4);
    t.eq("squad: soldiersOf() defaults to this client's commander", idsOf(m.soldiersOf()).join(","), "ana1,ana2");

    // The line-up: one 44px pitch, plus a two-slot gap where the owner changes,
    // so two squads arrive as two groups on the same spawn line.
    const xs = m.scene.soldiers.map((s) => s.x);
    t.eq("line-up: a squad is spaced on the 44px pitch", xs[1] - xs[0], 44);
    t.eq("line-up: and the next squad starts a gap later", xs[2] - xs[1], 44 * 3);
    t.ok("line-up: nobody lands on top of anybody", new Set(xs).size === xs.length);
  }
  {
    // …and at one owner the line-up is exactly what it always was, which is the
    // arithmetic test/mission-golden.test.mjs depends on frame by frame.
    const m = play(SOLO, null);
    const xs = m.scene.soldiers.map((s) => s.x);
    t.ok("line-up: one commander is still spawn.x + i * 44", xs[1] - xs[0] === 44 && xs[2] - xs[1] === 44);
    t.eq("solo: every partition is the whole array", m.soldiersOf().length, 3);
    t.eq("solo: an undeclared owner is null, not a name", m.owner, null);
  }
  {
    // A NAMED COMMANDER WHO OWNS NOBODY, which is the one way this axis fails
    // catastrophically and in silence: `piloted` is `leaders.get(this.owner)`,
    // so a seat that owns nobody pilots NOBODY and every soldier — the one
    // under the keyboard included — falls to the companion brain. Reported
    // from a live room as "my soldier is AI-controlled".
    //
    // J2 guarded it in src/main.js off the squad; J5 deleted the guard when the
    // projection began emitting owners, which is a fact about the version that
    // BUILT the dispatch and not about the page playing it. Now checked in
    // start(), where the scene is.
    const m = play(UNDECLARED, "p1");
    t.eq("skew: a commander nobody on the level answers to is not this mission's", m.owner, null);
    t.ok("skew: ...so somebody is still piloted", !!m.currentSoldier());
    for (let i = 0; i < 4; i++) m.update(STEP);
    t.ok("skew: ...and it is the keyboard's soldier, not a companion", !m.currentSoldier().agent);
    // The narrow half of the same rule: a scene that DOES declare owners and
    // not this one is a routing bug, and handing this keyboard another
    // commander's squad would be a worse answer than handing it nobody.
    const wrong = play(JOINT, "carol");
    t.eq("skew: a seat missing from a scene that names owners is not reassigned", wrong.owner, "carol");
    t.ok("skew: ...and pilots nobody rather than somebody else's squad", !wrong.currentSoldier());
  }

  // ---- control cannot cross ----------------------------------------------
  {
    const m = play(JOINT, "ana");
    t.eq("control: this commander starts on her own first soldier", m.currentSoldier().id, "ana1");
    t.eq("control: and the other commander has one of his own", m.currentSoldier("bo").id, "bo1");

    m.input.press("swap");
    m.update(STEP);
    t.eq("control: swap moves to her next soldier", m.currentSoldier().id, "ana2");
    t.eq("control: and does not touch his", m.currentSoldier("bo").id, "bo1");

    m.input.press("swap");
    m.update(STEP);
    t.eq("control: swap wraps inside her squad rather than into his", m.currentSoldier().id, "ana1");

    // Four swaps, four frames: control must never once land on a soldier she
    // does not own — the ring is her indices, not the array's.
    let strayed = false;
    for (let i = 0; i < 4; i++) {
      m.input.press("swap");
      m.update(STEP);
      if (m.currentSoldier().owner !== "ana") strayed = true;
    }
    t.ok("control: never lands on somebody else's soldier", !strayed);
  }

  // ---- a dead leader is replaced, for BOTH commanders ---------------------
  {
    const m = play(JOINT, "ana");
    m.scene.soldiers[0].alive = false; // ana1, the one she is driving
    m.scene.soldiers[2].alive = false; // bo1, the one HE is driving
    m.update(STEP);
    t.eq("control: she auto-swaps off her casualty", m.currentSoldier().id, "ana2");
    t.eq("control: and his squad's leader is replaced too, with nobody inputting for it",
      m.currentSoldier("bo").id, "bo2");
  }

  // ---- who is player-driven, and who escorts whom -------------------------
  {
    const m = play(JOINT, "ana");
    const mine = m.currentSoldier();
    for (let i = 0; i < 4; i++) m.update(STEP);

    // A companion agent is built lazily on a soldier's first AI tick, so its
    // presence is the record of which path a soldier took.
    t.ok("driven: the soldier under this client's input has no companion agent", !mine.agent);
    t.ok("driven: every other soldier on the level is AI-driven, both squads",
      m.scene.soldiers.filter((s) => s !== mine).every((s) => !!s.agent));

    // Each AI squadmate is anchored to ITS OWN commander's leader. The anchor is
    // a point, so compare it against the leader's centre.
    const anchorOf = (s) => s.agent.anchor;
    const centre = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });
    const anaLead = m.currentSoldier("ana"), boLead = m.currentSoldier("bo");
    const near = (a, b) => a && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
    t.ok("escort: her squadmate follows her leader", near(anchorOf(m.scene.soldiers[1]), centre(anaLead)));
    t.ok("escort: his squadmate follows HIS leader, not hers", near(anchorOf(m.scene.soldiers[3]), centre(boLead)));
    t.ok("escort: and his leader is not anchored to her", !near(anchorOf(boLead), centre(anaLead)));
  }

  // ---- input is per commander (J7) ----------------------------------------
  //
  // Until J7 a Mission had ONE input and one piloted soldier, so the section
  // above is the whole story only while nobody is behind the other commander.
  // These are the assertions that stop being trivially true the moment a room
  // fills a second seat: two people on one scene, each moving their own leader
  // and nobody else's.
  {
    const m = play(JOINT, "ana");
    const bo = stubInput();
    t.ok("input: this commander's is the local device, by fallback rather than by entry", m.inputFor("ana") === m.input);
    t.ok("input: and nobody is inputting for the other one yet", m.inputFor("bo") === null);

    m.setInput("bo", bo);
    t.ok("input: setInput hands him one", m.inputFor("bo") === bo);

    const anaLead = m.currentSoldier("ana"), boLead = m.currentSoldier("bo");
    m.input.hold("right");
    for (let i = 0; i < 8; i++) m.update(STEP);
    t.ok("input: her key moves HER leader", anaLead.vx > 0);
    t.ok("input: and his leader, whose own input is holding nothing, stands still", boLead.vx === 0);
    t.ok("input: neither leader was handed to the companion brain", !anaLead.agent && !boLead.agent);

    m.input.release("right");
    bo.hold("left");
    for (let i = 0; i < 8; i++) m.update(STEP);
    t.ok("input: his key moves HIS leader", boLead.vx < 0);
    t.ok("input: ...and hers, now holding nothing, stops", anaLead.vx === 0);
  }

  // A swap is read off the pressing commander's own input, which is the half of
  // "control cannot cross" that the single-input version could not have been
  // wrong about — there was only one keyboard to press it on.
  {
    const m = play(JOINT, "ana");
    const bo = stubInput();
    m.setInput("bo", bo);

    bo.press("swap");
    m.update(STEP);
    t.eq("swap: his press moves his leader", m.currentSoldier("bo").id, "bo2");
    t.eq("swap: and does not touch hers", m.currentSoldier("ana").id, "ana1");

    m.input.press("swap");
    m.update(STEP);
    t.eq("swap: her press moves hers", m.currentSoldier("ana").id, "ana2");
    t.eq("swap: and leaves his where he put it", m.currentSoldier("bo").id, "bo2");
  }

  // A commander with no input is not an error state — it is a seat nobody has
  // filled, a commander who has gone home, and (before J8) every seat but this
  // one. All three look the same from in here: the companion brain.
  {
    const m = play(JOINT, "ana");
    const bo = stubInput();
    m.setInput("bo", bo);
    for (let i = 0; i < 4; i++) m.update(STEP);
    const boLead = m.currentSoldier("bo");
    t.ok("input: a piloted leader never builds a companion agent", !boLead.agent);

    m.setInput("bo", null); // he drops out
    t.ok("input: setInput(null) takes it away", m.inputFor("bo") === null);
    for (let i = 0; i < 4; i++) m.update(STEP);
    t.ok("input: and his leader falls to the companion brain", !!boLead.agent);
    t.ok("input: while hers is still hers", !m.currentSoldier("ana").agent);
  }

  // Sampling is per input and per step (J4's contract, J7's plural). A driver
  // that samples `m.input` alone leaves the other seat reading one frozen frame
  // forever, which is a bug that looks like lag rather than like a crash.
  {
    const m = play(JOINT, "ana");
    const bo = stubInput();
    m.setInput("bo", bo);
    m.input.samples = 0;
    for (let i = 0; i < 3; i++) m.sampleInputs();
    t.eq("sample: the local device is sampled once per step", m.input.samples, 3);
    t.eq("sample: and so is the other commander's input", bo.samples, 3);

    // The local device is in the map by fallback, not by entry — sampling must
    // not double it if somebody sets it explicitly anyway.
    m.setInput("ana", m.input);
    m.input.samples = 0;
    m.sampleInputs();
    t.eq("sample: an input set for two commanders is still sampled once", m.input.samples, 1);
  }

  // ---- aim arrives in WORLD coordinates (J7) ------------------------------
  //
  // `_applyAim` used to resolve every aim against `this.camera` and `this._zoom()`
  // — one viewer's frame. A room holds ONE scene for two viewers and cannot
  // resolve either camera, so the page that owns a camera owns the conversion
  // and sends a world point. `mouse` stays the local device's shape and keeps
  // the old maths; `world` is the shape that crosses a wire.
  {
    const prevMode = config.aimMode;
    config.aimMode = "mouse";
    const m = play(JOINT, "ana");
    const s = m.currentSoldier("ana");
    const mx = s.x + s.w / 2, my = s.y + s.h * 0.42;

    m.input.aim = { type: "world", x: mx + 100, y: my - 100 };
    m.camera.x = 0;
    m._applyAim(s, m.input);
    const at0 = { ...s.aimVec };
    t.ok("aim: a world point aims from the muzzle toward it", at0.x > 0 && at0.y < 0);

    m.camera.x = 4000; // the viewer scrolls a long way away
    m._applyAim(s, m.input);
    t.ok("aim: and the camera does not move it", Math.abs(s.aimVec.x - at0.x) < 1e-12 && Math.abs(s.aimVec.y - at0.y) < 1e-12);

    // The control: the local device's own shape still IS camera-relative, which
    // is exactly why it cannot be the one that crosses a wire.
    m.input.aim = { type: "mouse", x: 100, y: 100 };
    m.camera.x = 0;
    m._applyAim(s, m.input);
    const mouse0 = { ...s.aimVec };
    m.camera.x = 4000;
    m._applyAim(s, m.input);
    t.ok("aim: a mouse point DOES move with the camera", Math.abs(s.aimVec.x - mouse0.x) > 1e-6);

    // Two commanders, one scene, two aims, no camera in either.
    const bo = stubInput();
    m.setInput("bo", bo);
    const his = m.currentSoldier("bo");
    m.input.aim = { type: "world", x: s.x + 500, y: s.y };       // she aims right
    bo.aim = { type: "world", x: his.x - 500, y: his.y };        // he aims left
    m.update(STEP);
    t.ok("aim: her soldier aims right", s.aimVec.x > 0 && s.facing === 1);
    t.ok("aim: and his aims left, in the same step and the same scene", his.aimVec.x < 0 && his.facing === -1);
    config.aimMode = prevMode;
  }

  // ---- loot is credited to whoever touched it -----------------------------
  {
    const m = play(JOINT, "ana");
    const bo = m.scene.soldiers[2];
    const ana = m.scene.soldiers[0];
    m.scene.loot.push(new Loot({ name: "his core", value: 30 }, bo.x + 4, bo.y + 10));
    m.scene.loot.push(new Loot({ name: "her core", value: 20 }, ana.x + 4, ana.y + 10));
    m.update(STEP);

    t.eq("loot: the item carries the collector's commander", m.scene.collected.length, 2);
    t.eq("loot: hers is hers", m.collectedBy("ana").map((i) => i.name).join(","), "her core");
    t.eq("loot: his is his", m.collectedBy("bo").map((i) => i.name).join(","), "his core");
    // The HUD counter reads through the same partition, which is what keeps it
    // from telling one commander what the other recovered (approximation 7).
    t.eq("loot: the count this commander sees is her own", m.collectedBy().length, 1);
    t.ok("loot: and the campaign still receives plain { name, value } items",
      m.collectedBy("bo").every((i) => i.name && typeof i.value === "number"));
  }

  // ---- a result belongs to one commander ----------------------------------
  {
    const m = play(JOINT, "ana");
    const [ana1, ana2, bo1, bo2] = m.scene.soldiers;
    bo1.alive = false;
    ana2.alive = false;
    ana1.kills = 3;
    bo2.kills = 5;
    ana1.health = ana1.maxHealth - 4;
    m.scene.collected.push({ item: { name: "hers", value: 10 }, owner: "ana", by: "ana1" });
    m.scene.collected.push({ item: { name: "his", value: 90 }, owner: "bo", by: "bo2" });

    m._resolve(true);
    const hers = m.resultFor("ana");
    t.eq("result: survivors are her squad's", hers.survivors.join(","), "ana1");
    t.eq("result: casualties are her squad's", hers.casualties.join(","), "ana2");
    t.eq("result: kills total only her squad's", hers.kills, 3);
    t.eq("result: kills-by-soldier is her squad only", hers.killsBySoldier.length, 2);
    t.eq("result: wounds are her squad's", hers.woundsBySoldier.find((w) => w.id === "ana1").wounds, 4);
    t.eq("result: loot is what her squad carried out", hers.loot.map((i) => i.name).join(","), "hers");
    t.ok("result: and never leaks his haul", !hers.loot.some((i) => i.name === "his"));

    // The same scene resolved for the other commander. J1 is what makes the two
    // results exist; since J2 they exist AT ONCE, so this needs no reset — the
    // guard is per commander and hers stays exactly as it was built.
    m._resolve(false, "bo");
    const his = m.resultFor("bo");
    t.eq("result: hers survives his being built", m.resultFor("ana").kills, 3);
    t.eq("result: his survivors are his", his.survivors.join(","), "bo2");
    t.eq("result: his kills are his", his.kills, 5);
    t.eq("result: a failure carries no loot, his included", his.loot.length, 0);
  }

  // ---- ends are independent (J2) ------------------------------------------
  //
  // `play` returns a mission whose onComplete is a no-op, so these drive
  // _resolve/_finish directly and count the calls where the count is the point.

  // Standing a soldier in the exit is how a commander extracts, and it is the
  // only way out — there is no leave action.
  const toExit = (m, s) => {
    s.x = m.scene.exit.x + 2;
    s.y = m.scene.exit.y + m.scene.exit.h - s.h;
  };

  {
    // One commander walks out. The other is still fighting, and the level is
    // still hers to fight on.
    const m = play(JOINT, "ana");
    toExit(m, m.scene.soldiers[0]); // ana1
    m.update(STEP);

    t.ok("ends: the commander who reached the exit has resolved", !!m.endFor("ana"));
    t.ok("ends: and it was a success", m.endFor("ana").success);
    t.ok("ends: the other commander has not", !m.endFor("bo"));
    t.eq("ends: her squad has left the level", idsOf(m.scene.soldiers).join(","), "bo1,bo2");
    t.eq("ends: his is all that is left of it", m.scene.soldiers.length, 2);
    t.eq("ends: and her cards still have somebody on them, off the frozen roster",
      idsOf(m.endFor("ana").squad).join(","), "ana1,ana2");

    // The level is NOT frozen: the pre-J2 early return stopped the step for
    // everybody the moment anyone resolved, and it was measured at 30 steps of
    // nobody moving.
    const before = m.scene.soldiers.map((s) => `${s.x},${s.y}`);
    for (let i = 0; i < 30; i++) m.update(STEP);
    t.ok("ends: the level keeps running for the commander still on it",
      m.scene.soldiers.some((s, i) => `${s.x},${s.y}` !== before[i]));

    // A resolved commander is SKIPPED by _checkOutcome, not re-tested. Her
    // squad is off the array, so an empty slice would read as a wipe and
    // overwrite the extraction she just earned.
    t.ok("ends: her extraction is not overwritten by her empty squad reading as a wipe",
      m.endFor("ana").success);
    t.eq("ends: and her result still says so", m.resultFor("ana").success, true);
  }

  {
    // Control is keyed by soldier ID since J2. Under the old index it was the
    // DEPARTING commander's own entry that was dangerous: after the splice,
    // index 0 stops being ana1 and becomes bo1, and the local keyboard ends up
    // driving somebody else's squad.
    const m = play(JOINT, "ana");
    const boDriving = m.currentSoldier("bo").id;
    toExit(m, m.scene.soldiers[0]);
    m.update(STEP);

    t.eq("ends: soldiers[0] is now the other commander's", m.scene.soldiers[0].id, "bo1");
    t.ok("ends: and the extracted commander drives nobody, rather than his soldier",
      m.currentSoldier("ana") === undefined);
    t.eq("ends: his own control is untouched by her leaving", m.currentSoldier("bo").id, boDriving);

    // Her keyboard is dead for the rest of the level: a swap has nobody to
    // reach and must not walk into his squad.
    m.input.press("swap");
    m.update(STEP);
    t.ok("ends: a swap after extracting reaches nobody", m.currentSoldier("ana") === undefined);
  }

  {
    // The losing branch, which J1 narrowed to the local owner without a case.
    // One commander wiped is one commander's failure, not the level's.
    const m = play(JOINT, "ana");
    for (const s of m.scene.soldiers) if (s.owner === "bo") s.alive = false;
    m.update(STEP);

    t.ok("ends: a wiped squad resolves its own commander", !!m.endFor("bo"));
    t.eq("ends: as a failure", m.endFor("bo").success, false);
    t.ok("ends: and does not resolve the commander still standing", !m.endFor("ana"));
    // The splice takes whoever WALKED OUT. His squad did not — it died there —
    // so the bodies stay on the ground she is still fighting over.
    t.eq("ends: his casualties stay where they fell", idsOf(m.scene.soldiers).join(","), "ana1,ana2,bo1,bo2");
    t.ok("ends: and none of them is alive", m.scene.soldiers.filter((s) => s.owner === "bo").every((s) => !s.alive));
    t.eq("ends: a failure carries no loot out", m.resultFor("bo").loot.length, 0);
  }

  {
    // _finish is per commander and idempotent. stop() killing the rAF loop used
    // to be its only guard; with the loop alive for the other commander it fired
    // every frame — 104 times, measured.
    const fired = [];
    const { level, mission } = generateLevel({ seed: SEED, difficulty: "low" });
    const m = new Mission(makeEl("canvas"), (result, owner) => fired.push(owner));
    m.start(mission, level, JOINT, "ana");
    // `running` is left TRUE here, unlike everywhere else in this suite: the
    // harness's requestAnimationFrame is a no-op so nothing drives the loop but
    // us, and the flag is then the readout for whether stop() was called.
    m.input = stubInput();

    toExit(m, m.scene.soldiers[0]);
    for (let i = 0; i < 200; i++) m.update(STEP); // well past the 1.6s banner
    t.eq("ends: her onComplete fired exactly once", fired.filter((o) => o === "ana").length, 1);
    t.ok("ends: and the scene did NOT stop with him still on it", m.running === true);
    t.ok("ends: he has not been handed a result he did not earn", !fired.includes("bo"));

    // Now he leaves too, and with nobody on the level the scene stops.
    toExit(m, m.scene.soldiers[0]); // bo1 — hers are already gone
    for (let i = 0; i < 200; i++) m.update(STEP);
    t.eq("ends: his onComplete fired once as well", fired.filter((o) => o === "bo").length, 1);
    t.eq("ends: the mission hands back a result per commander, in extraction order",
      fired.join(","), "ana,bo");
    t.ok("ends: and the scene stops once nobody is left on it", m.running === false);
  }

  {
    // The artifact is the indivisible reward, and extraction is the race
    // (approximation 4). Whoever trips the exit first holds it; the second
    // commander out finds nothing.
    const m = play(JOINT, "ana");
    m.scene.artifact = { name: "the core", value: 200 };
    toExit(m, m.scene.soldiers[2]); // bo1 gets there first
    m.update(STEP);
    t.eq("artifact: it goes to whoever extracted first", m.resultFor("bo").loot.map((i) => i.name).join(","), "the core");
    t.ok("artifact: and is off the level", m.scene.artifact === null);

    toExit(m, m.scene.soldiers[0]); // ana1, now that his squad has gone
    m.update(STEP);
    t.eq("artifact: the second commander out extracts without it", m.resultFor("ana").loot.length, 0);
  }

  {
    // A result is frozen when its commander leaves. The bodies are still
    // reachable — a projectile in flight carries its shooter and a root carries
    // its last attacker — so a kill CAN land on an extracted soldier afterwards.
    // It goes nowhere, which is the honest half of approximation 11b: lost, not
    // misattributed.
    const m = play(JOINT, "ana");
    const ana1 = m.scene.soldiers[0];
    toExit(m, ana1);
    m.update(STEP);
    const reported = m.resultFor("ana").killsBySoldier.find((k) => k.id === "ana1").kills;
    ana1.kills += 1; // the round that was already in the air
    t.eq("ends: the result froze as the squad left", m.resultFor("ana").killsBySoldier.find((k) => k.id === "ana1").kills, reported);
  }

  // ---- owner is not team, and owner is not authority ----------------------
  {
    const m = play(JOINT, "ana");
    const root = m.scene.specRoots[0];
    t.ok("boundary: an enemy hunts BOTH squads, because hostilesFor reads the array whole",
      hostilesFor(root, m.scene).length === 4);
    t.ok("boundary: soldiers carry no team, so two commanders cannot shoot each other",
      m.scene.soldiers.every((s) => s.team === undefined));
    // Authority: this client steps every soldier on the level, not only its own.
    const before = m.scene.soldiers.map((s) => `${s.x},${s.y}`);
    for (let i = 0; i < 30; i++) m.update(STEP);
    t.ok("boundary: this client simulates the other commander's squad too",
      m.scene.soldiers.filter((s) => s.owner === "bo").some((s, i) => `${s.x},${s.y}` !== before[2 + i]));
  }
}
