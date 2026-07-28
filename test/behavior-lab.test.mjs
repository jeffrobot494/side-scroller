// Behavior Lab (docs/BEHAVIOR-LAB.md Slice 1): the tool mounts headlessly, and
// the runtime hooks it draws — the utility scoreboard breakdown and the four
// no-op-by-default agent levers — behave. Visuals stay an eyeball check.
import { installDom, makeEl } from "./harness.mjs";
import { createBehaviorLab } from "../src/editor/tools/behavior-lab.js";
import { instantiate, updateSpecEnemy } from "../src/mission/enemyspec/runtime.js";
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { Soldier } from "../src/mission/entities.js";
import { config, SCHEMA } from "../src/game/config.js";

// A minimal utility brain with one action per outcome we want on the board:
// one that scores, one gated by `when`, one parked on a cooldown.
const SPEC = {
  v: 1, id: "lab_probe", name: "Lab Probe", threat: 10, tier: 1, intelligence: 4,
  root: {
    id: "root", visual: { shape: "box", size: [30, 40], color: "#e05a5a" },
    body: { gravity: 1 }, health: { max: 40 }, motion: { type: "static" },
    emitters: { gun: { at: [0, 0], projectile: { speed: 400, damage: 1, life: 1 } } },
  },
  brain: {
    mode: "utility", start: "fight",
    states: {
      fight: {
        decisionInterval: 0.3,
        actions: [
          { id: "shoot", score: "1", cooldown: 0, steps: [{ fire: { emitter: "gun" } }, { wait: 0.05 }] },
          { id: "flee", when: "sense.dist < 5", score: "9", steps: [{ wait: 0.05 }] },
          // wins the opening pass, then sits on a long cooldown so later passes
          // have something to report as cooling rather than simply absent
          { id: "rest", score: "2", cooldown: 5, steps: [{ wait: 0.05 }] },
        ],
      },
    },
  },
};

function makeScene(soldier) {
  return {
    world: { width: 1200, height: 540, gravity: 1600 },
    platforms: [{ x: 0, y: 500, w: 1200, h: 40 }],
    soldiers: [soldier], specRoots: [], enemies: [], projectiles: [], loot: [],
  };
}
const CTX = { friendlyFire: false, damageMult: 1, damage() {}, kill() {}, spark() {}, burst() {} };

export default async function run(t) {
  // ---- headless mount ------------------------------------------------------
  installDom();
  let threw = null, tool = null;
  try {
    tool = createBehaviorLab(makeEl(), () => {});
  } catch (e) {
    threw = e;
  }
  t.ok("behavior-lab: mount does not throw", !threw);
  if (threw) console.log("   ", threw && threw.stack);
  t.ok("behavior-lab: returns dispose()", tool && typeof tool.dispose === "function");
  try {
    tool && tool.dispose();
    t.ok("behavior-lab: dispose does not throw", true);
  } catch {
    t.ok("behavior-lab: dispose does not throw", false);
  }

  // ---- the levers exist as config knobs, and default to no-ops -------------
  const group = SCHEMA.find((g) => g.title === "Agent brain");
  t.ok("levers: an 'Agent brain' schema group exists", !!group);
  t.eq("levers: decision scale defaults to 1", config.labDecisionScale, 1);
  t.eq("levers: perception scale defaults to 1", config.labPerceptionScale, 1);
  t.eq("levers: aim error scale defaults to 1", config.labAimErrorScale, 1);
  t.eq("levers: god eye defaults off", config.labGodEye, false);

  // ---- the utility scoreboard the Lab draws --------------------------------
  const data = { id: "s1", name: "Rook", callsign: "RK", stats: { health: 5, aim: 5, speed: 5 } };
  const weapon = { id: "rifle", name: "R", fireMode: "projectile", fireRate: 7, spread: 0, projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 1 }, effects: [] };
  const soldier = new Soldier(data, weapon, 600, 460);
  const scene = makeScene(soldier);
  const agent = instantiate(normalizeSpec(SPEC), 300, 460);
  scene.specRoots = [agent];

  t.ok("scoreboard: no decision recorded before the first tick", agent.brainState.lastDecision === null);

  for (let i = 0; i < 6; i++) updateSpecEnemy(agent, 1 / 60, scene, CTX);
  const d = agent.brainState.lastDecision;
  t.ok("scoreboard: a decision is recorded", !!d);
  t.eq("scoreboard: it names the state it scored in", d && d.state, "fight");
  t.eq("scoreboard: every action appears, win or lose", d && d.actions.length, 3);
  t.eq("scoreboard: the winner is flagged", d && d.chosen, "rest");

  const by = Object.fromEntries((d ? d.actions : []).map((a) => [a.id, a]));
  t.eq("scoreboard: an ungated action is scored", by.shoot && by.shoot.status, "scored");
  t.ok("scoreboard: its score is the real number (1 ± noise)", by.shoot && Math.abs(by.shoot.score - 1) <= 0.1);
  t.eq("scoreboard: a failing `when` reads as gated", by.flee && by.flee.status, "gated");
  t.eq("scoreboard: the gate reason is the expression itself", by.flee && by.flee.detail, "sense.dist < 5");
  t.ok("scoreboard: a gated action is not the winner", d && d.chosen !== "flee");

  // `rest` won the opening pass and took its cooldown; the next decision must
  // show it as cooling, not silently missing (a blank row is the bug this
  // panel exists to catch).
  for (let i = 0; i < 120; i++) updateSpecEnemy(agent, 1 / 60, scene, CTX);
  const d2 = agent.brainState.lastDecision;
  const rest = d2 && d2.actions.find((a) => a.id === "rest");
  t.ok("scoreboard: a later decision replaces the earlier one", d2 && d2.at > d.at);
  t.eq("scoreboard: a cooling action is listed as such", rest && rest.status, "cooldown");
  t.ok("scoreboard: cooldown detail reports the time left", !!(rest && /s left$/.test(rest.detail)));
  t.eq("scoreboard: the cooled-out favourite yields to the runner-up", d2 && d2.chosen, "shoot");

  // ---- the levers actually reach the runtime -------------------------------
  // The timer is only observable between decisions, so watch its peak: at ×1 it
  // can never exceed the state's own 0.3s interval.
  const peak = (frames) => {
    let max = 0;
    for (let i = 0; i < frames; i++) {
      updateSpecEnemy(agent, 1 / 60, scene, CTX);
      max = Math.max(max, agent.brainState.decisionTimer);
    }
    return max;
  };
  t.ok("lever: at ×1 the decision timer never exceeds the state's interval", peak(240) <= 0.3 + 1e-9);
  config.labDecisionScale = 3;
  const stretched = peak(240);
  t.ok("lever: decision scale stretches the decision timer", stretched > 0.3 && stretched <= 0.9 + 1e-9);
  config.labDecisionScale = 1;

  // God eye: a wall between the two makes los false; the lever forces it true.
  const walled = {
    ...makeScene(soldier),
    platforms: [{ x: 0, y: 500, w: 1200, h: 40 }, { x: 450, y: 300, w: 40, h: 200 }],
  };
  const blind = instantiate(normalizeSpec(SPEC), 300, 460);
  walled.specRoots = [blind];
  updateSpecEnemy(blind, 1 / 60, walled, CTX);
  t.eq("god eye off: a wall blocks line of sight", blind.sense.los, false);

  config.labGodEye = true;
  const seer = instantiate(normalizeSpec(SPEC), 300, 460);
  walled.specRoots = [seer];
  updateSpecEnemy(seer, 1 / 60, walled, CTX);
  t.eq("god eye on: the same wall is ignored", seer.sense.los, true);
  config.labGodEye = false;

  // Perception scale stretches the sensor cadence (the timer reset after a pass).
  config.labPerceptionScale = 2;
  const slow = instantiate(normalizeSpec(SPEC), 300, 460);
  const s2 = makeScene(soldier);
  s2.specRoots = [slow];
  updateSpecEnemy(slow, 1 / 60, s2, CTX);
  t.ok("lever: perception scale stretches the sensor cadence", slow.memory.senseTimer > 0.3);
  config.labPerceptionScale = 1;
}
