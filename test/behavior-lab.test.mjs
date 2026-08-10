// ---------------------------------------------------------------------------
// BEHAVIOR LAB v2 (tech/behavior-lab.md, Slice B1).
//
// Written from nothing. The file this replaces asserted v1's scoreboard, its
// two-team arena and its four `lab*` levers, none of which exist any more —
// keeping any of it would have been keeping v1.
//
// What can be asserted headlessly is narrow, and worth being honest about:
// whether a route reads as deliberate, whether a takeoff looks intentional,
// whether giving up looks like giving up — none of that is here, and none of it
// can be. That is the reason the tool exists rather than a gap in this file.
//
// What IS here is everything that would silently stop the tool being a window
// onto the shipped router: that it mounts and disposes, that it REMOVED combat
// rather than merely omitting it, that its agent stands on a real graph node
// under the SOLDIER profile, that a click becomes a destination the shipped
// follower acts on, and that the camera obeys the design.
// ---------------------------------------------------------------------------

import { installDom, makeEl } from "./harness.mjs";
import { createBehaviorLab, createLabModel, labStep, labGoal, labPan, VIEW_W, VIEW_H } from "../src/editor/tools/behavior-lab.js";
import { profileKey } from "../src/game/nav.js";
import { config, resetConfig, SCHEMA } from "../src/game/config.js";

const STEP = 1 / 60;
const run = (lab, seconds) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) labStep(lab, STEP);
  return lab;
};
const feet = (s) => s.y + s.h;

// A fixed seed and a fixed rng: the same level and the same starting node every
// run, because a tool test that picks its own scene at random reports a
// different thing each time it is run.
const SEED = 4242;
const model = () => createLabModel(SEED, () => 0.5);

export default async function run_(t) {
  resetConfig();

  // ---- the editor tool contract ---------------------------------------------
  {
    installDom();
    let threw = null;
    let tool = null;
    try {
      tool = createBehaviorLab(makeEl(), () => {});
    } catch (e) {
      threw = e;
    }
    t.ok("mount: does not throw", !threw);
    if (threw) console.log("   ", threw.stack);
    t.ok("mount: returns dispose()", tool && typeof tool.dispose === "function");
    try {
      tool.dispose();
      t.ok("dispose: does not throw", true);
    } catch (e) {
      t.ok("dispose: does not throw", false);
      console.log("   ", e.stack);
    }
  }

  // ---- combat is removed, not omitted ---------------------------------------
  {
    // generateLevel ALWAYS places enemies and loadMission instantiates them
    // unconditionally, so a scene built the normal way arrives full of hostiles.
    // If this goes red the Lab has quietly become a combat arena again.
    const lab = model();
    t.eq("no combat: no spec agents at all", lab.scene.specRoots.length, 0);
    t.eq("no combat: nothing damageable", lab.scene.enemies.length, 0);
    t.eq("no combat: no projectiles", lab.scene.projectiles.length, 0);
    t.eq("no combat: one body in the level", lab.scene.soldiers.length, 1);
    // And it stays that way once it is running — nothing spawns on a timer.
    run(lab, 5);
    t.eq("no combat: still nothing after five seconds", lab.scene.specRoots.length + lab.scene.projectiles.length, 0);
  }

  // ---- the agent starts where the router can route from ----------------------
  {
    const lab = model();
    const s = lab.soldier;
    // "A random NODE", not a random point: a node is the router's own idea of a
    // standable place, so the agent can always be routed from where it begins.
    const graph = [...lab.scene.navGraphs.values()][0];
    const on = graph.nodes.some((n) => Math.abs(n.y - feet(s)) < 2 && s.x >= n.a - 2 && s.x <= n.b + 2);
    t.ok(`start: standing on a graph node (x ${s.x.toFixed(0)}, feet ${feet(s)})`, on);
    t.ok("start: planted, not mid-fall", s.onGround && s.vy === 0);
    t.eq("start: and with no goal until one is set", lab.goal, null);

    // The profile is the SHIPPED soldier envelope. A legged profile here would
    // give maxRise 110.6 where the truth is 129.6 — climbs refused that the body
    // can make — and the tool would be lying about the game it exists to watch.
    const want = profileKey({ w: 30, h: 46, gravity: lab.scene.world.gravity, jumpSpeed: config.jumpSpeed, runSpeed: config.runSpeed });
    t.ok(`start: on the soldier profile (${[...lab.scene.navGraphs.keys()].join(", ")})`, lab.scene.navGraphs.has(want));
    t.eq("start: and only that one — there is only one body", lab.scene.navGraphs.size, 1);
  }
  {
    // Left alone, it stays put. A tool whose agent wanders on its own would make
    // every observation of a route ambiguous.
    const lab = model();
    const x0 = lab.soldier.x;
    run(lab, 4);
    t.ok(`idle: no goal, no movement (x ${x0.toFixed(0)} → ${lab.soldier.x.toFixed(0)})`, Math.abs(lab.soldier.x - x0) < 1);
  }

  // ---- a click is a destination, and the SHIPPED follower acts on it ---------
  {
    const lab = model();
    const s = lab.soldier;
    const before = s.x;
    const target = Math.min(lab.scene.world.width - 60, before + 900);
    labGoal(lab, target, feet(s) - 10);
    t.ok("click: sets the goal to the point clicked", Math.abs(lab.goal.x - target) < 1);

    run(lab, 8);
    t.ok(`click: the agent travels toward it (x ${before.toFixed(0)} → ${s.x.toFixed(0)})`, s.x > before + 200);
    // It moved because the ROUTER moved it. Route state on the agent is the
    // proof that navigation.js decided, not the Lab.
    t.ok("click: by routing — the agent holds real route state", !!lab.agent.nav);
    t.ok("click: on a path through the graph, not a straight line", lab.agent.nav.path !== null);
  }
  {
    // Arrival: it settles. This is the shipped follower's arrival radius, not a
    // rule the Lab adds — "watch it get there, and stop on arrival".
    const lab = model();
    const s = lab.soldier;
    labGoal(lab, s.x + s.w / 2 + 240, feet(s) - 10);
    run(lab, 10);
    const restX = s.x;
    run(lab, 3);
    t.ok(`arrive: it stops rather than orbiting (${Math.abs(s.x - restX).toFixed(1)}px over 3s)`, Math.abs(s.x - restX) < 20);
  }
  {
    // A second click retargets. Without clearing the route state the agent would
    // finish the old path first, which reads as the tool ignoring the click.
    const lab = model();
    labGoal(lab, lab.soldier.x + 600, feet(lab.soldier) - 10);
    run(lab, 2);
    t.ok("retarget: it is on a route", !!lab.agent.nav);
    labGoal(lab, lab.soldier.x - 300, feet(lab.soldier) - 10);
    t.eq("retarget: the old route is dropped, not amended", lab.agent.nav, null);
  }

  // ---- the camera -----------------------------------------------------------
  {
    const lab = model();
    t.eq("pan: starts at the left edge", lab.panX, 0);
    labPan(lab, 240);
    t.ok(`pan: wheel DOWN pans right (${lab.panX})`, lab.panX > 0);
    const right = lab.panX;
    labPan(lab, -120);
    t.ok(`pan: wheel UP pans left (${lab.panX})`, lab.panX < right);
    labPan(lab, -1e6);
    t.eq("pan: clamped at the left edge", lab.panX, 0);
    labPan(lab, 1e6);
    t.eq("pan: clamped so the view never runs past the level", lab.panX, lab.scene.world.width - VIEW_W);

    // The camera NEVER follows: the agent walks out of shot and stays there
    // until you pan. That is the design, and it is the opposite of what a
    // mission camera does, so it is worth pinning.
    const held = lab.panX;
    labGoal(lab, 100, feet(lab.soldier) - 10);
    run(lab, 5);
    t.eq("pan: the camera does not follow the agent", lab.panX, held);

    // Vertical panning is "not needed" only because the level fits. A view
    // shorter than the world would silently clip the bottom with no way to see
    // it, which is why the canvas height is the world height and not 420.
    t.eq("pan: the view is the world's full height, so there is nothing to scroll to", VIEW_H, lab.scene.world.height);
    t.ok(`pan: and narrower than the level, so panning is the only way across (${VIEW_W} of ${lab.scene.world.width})`,
      VIEW_W < lab.scene.world.width);
  }

  // ---- the tuning panel is the shipped game's knobs --------------------------
  {
    const group = SCHEMA.find((g) => g.title === "Movement / feel");
    t.ok("tuning: the group the panel renders exists", !!group);
    const keys = group.items.map((i) => i.key);
    t.ok(`tuning: the design's two knobs are both in it (${keys.join(", ")})`,
      keys.includes("jumpSpeed") && keys.includes("runSpeed"));
    // They are config.js's own entries, so a change here is a change to the game
    // until it is reset. Asserted because it is a surprise, not a detail.
    t.ok("tuning: they are live config keys, not a local copy", keys.every((k) => k in config));
  }
  {
    // Retuning invalidates the graphs. runSpeed and jumpSpeed are IN the profile
    // the graph is keyed by, so without this the agent keeps following a path
    // whose node ids describe a body that no longer exists.
    const lab = model();
    labGoal(lab, lab.soldier.x + 600, feet(lab.soldier) - 10);
    run(lab, 2);
    const gen = lab.scene.navGen || 0;
    config.jumpSpeed = 900;
    const { labRetune } = await import("../src/editor/tools/behavior-lab.js");
    labRetune(lab);
    t.ok("retune: the cached graphs are dropped", !lab.scene.navGraphs);
    t.ok("retune: and the generation moves, so every agent notices", (lab.scene.navGen || 0) > gen);
    run(lab, 1);
    const key = [...lab.scene.navGraphs.keys()][0];
    t.ok(`retune: the rebuilt graph is for the NEW body (${key})`, key.includes("/900/"));
    config.jumpSpeed = 720;
  }

  // ---- v1 is gone ------------------------------------------------------------
  {
    // Not a style check: these four were read by brain.js, perception.js and
    // runtime.js on every decision, every sense tick and every shot. A
    // resurrected knob is a multiplier back in a hot path and a v1 feature back
    // in the game.
    for (const k of ["labDecisionScale", "labPerceptionScale", "labAimErrorScale", "labGodEye"]) {
      t.eq(`v1: ${k} is gone from the config`, config[k], undefined);
    }
    t.eq("v1: and so is the schema group that held them", SCHEMA.find((g) => g.title === "Agent brain"), undefined);
  }

  resetConfig();
}
