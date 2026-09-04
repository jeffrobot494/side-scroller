// ---------------------------------------------------------------------------
// MISSION OWNERSHIP — two commanders on one level
// (tech/multiplayer-missions.md, J1).
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

// A MissionInput stand-in that presses nothing until told to.
function stubInput() {
  const held = new Set();
  const edges = new Set();
  return {
    hold: (a) => held.add(a),
    release: (a) => held.delete(a),
    press: (a) => edges.add(a),
    isDown: (a) => held.has(a),
    justPressed(a) {
      if (!edges.has(a)) return false;
      edges.delete(a);
      return true;
    },
    aimSource: () => null,
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
    const hers = m.result;
    t.eq("result: survivors are her squad's", hers.survivors.join(","), "ana1");
    t.eq("result: casualties are her squad's", hers.casualties.join(","), "ana2");
    t.eq("result: kills total only her squad's", hers.kills, 3);
    t.eq("result: kills-by-soldier is her squad only", hers.killsBySoldier.length, 2);
    t.eq("result: wounds are her squad's", hers.woundsBySoldier.find((w) => w.id === "ana1").wounds, 4);
    t.eq("result: loot is what her squad carried out", hers.loot.map((i) => i.name).join(","), "hers");
    t.ok("result: and never leaks his haul", !hers.loot.some((i) => i.name === "his"));

    // The same scene resolved for the other commander. J2 is what makes the two
    // ENDS independent; J1 is what makes the two results exist.
    m.endBanner = null;
    m._resolve(false, "bo");
    const his = m.result;
    t.eq("result: his survivors are his", his.survivors.join(","), "bo2");
    t.eq("result: his kills are his", his.kills, 5);
    t.eq("result: a failure carries no loot, his included", his.loot.length, 0);
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
