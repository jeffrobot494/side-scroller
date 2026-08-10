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

import { installDom, makeEl, ctx2d } from "./harness.mjs";
import { createBehaviorLab, createLabModel, labStep, labGoal, labPan, labGraph, labPath, labDraw, labInvalidate, labPlatformAt, labDragStart, labDragMove, labDragEnd, VIEW_W, VIEW_H } from "../src/editor/tools/behavior-lab.js";
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
    // The camera OPENS on the agent. Distinct from following it, which it never
    // does — but starting at the level's left edge meant the agent was in shot
    // 12% of the time across 300 levels, and hunting rightwards for it made a
    // uniform spawn read as "it always spawns on the right".
    const mid = lab.soldier.x + lab.soldier.w / 2;
    t.ok(`open: the agent is in the opening view (agent ${mid.toFixed(0)}, view ${lab.panX}–${lab.panX + VIEW_W})`,
      mid >= lab.panX && mid <= lab.panX + VIEW_W);
    t.ok("open: and roughly centred in it", Math.abs(mid - (lab.panX + VIEW_W / 2)) < 2 || lab.panX === 0 || lab.panX === lab.scene.world.width - VIEW_W);

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
    const { labInvalidate } = await import("../src/editor/tools/behavior-lab.js");
    labInvalidate(lab);
    t.ok("retune: the cached graphs are dropped", !lab.scene.navGraphs);
    t.ok("retune: and the generation moves, so every agent notices", (lab.scene.navGen || 0) > gen);
    run(lab, 1);
    const key = [...lab.scene.navGraphs.keys()][0];
    t.ok(`retune: the rebuilt graph is for the NEW body (${key})`, key.includes("/900/"));
    config.jumpSpeed = 720;
  }

  {
    // One seed proves the arithmetic; the defect was statistical. A level is
    // 4,800–8,200px and the view is 960, so a spawn the camera does not account
    // for is off-screen most of the time — which is how a uniform spawn came to
    // look like "it always spawns on the right". Sweep real levels and real
    // random node picks, and require ALL of them, not most.
    let off = 0;
    let worst = "";
    for (let i = 0; i < 60; i++) {
      const lab = createLabModel(9000 + i); // real Math.random for the node pick
      const mid = lab.soldier.x + lab.soldier.w / 2;
      if (mid < lab.panX || mid > lab.panX + VIEW_W) {
        off++;
        worst = `seed ${9000 + i}: agent ${mid.toFixed(0)}, view ${lab.panX}–${lab.panX + VIEW_W}`;
      }
    }
    t.eq(`open: the agent is on screen on every level built (${worst})`, off, 0);
  }

  // ---- B2: the Graph overlay -------------------------------------------------
  {
    const lab = model();
    t.eq("overlays: Graph is off by default", lab.show.graph, false);
    t.eq("overlays: Path is off by default", lab.show.path, false);

    // "THE AGENT'S graph, not the level's" — the spec names mislabelling this as
    // the bug. Proved by identity: this must be the very object the router
    // routes on, not an equivalent one built alongside it.
    labGoal(lab, lab.soldier.x + 600, feet(lab.soldier) - 10);
    run(lab, 1);
    const routed = [...lab.scene.navGraphs.values()][0];
    t.ok("graph: the overlay draws the graph the ROUTER is using, the same object", labGraph(lab) === routed);

    const g = labGraph(lab);
    t.ok(`graph: it has nodes to draw (${g.nodes.length})`, g.nodes.length > 1);
    const edges = g.edges.reduce((a, e) => a + e.length, 0);
    t.ok(`graph: and moves between them (${edges})`, edges > 1);

    // Edges are DIRECTED, and a drop is the one-way case that makes it matter:
    // platforms are solid from below, so you cannot climb back the way you fell.
    // An overlay that drew edges undirected would hide exactly that.
    const oneWay = [];
    for (let i = 0; i < g.nodes.length && oneWay.length < 1; i++) {
      for (const e of g.edges[i]) {
        if (!g.edges[e.to].some((back) => back.to === i)) oneWay.push([i, e.to, e.kind]);
      }
    }
    t.ok(`graph: at least one move is one-way, so direction is not decoration (${oneWay[0] && oneWay[0].join("→")})`, oneWay.length > 0);
    t.ok("graph: every edge carries a kind the overlay has a colour for",
      g.edges.every((list) => list.every((e) => ["walk", "hop", "jump", "drop"].includes(e.kind))));
  }

  // ---- B2: the Path overlay --------------------------------------------------
  {
    const lab = model();
    t.eq("path: nothing to draw before a goal is set", labPath(lab).length, 0);

    labGoal(lab, lab.soldier.x + 900, feet(lab.soldier) - 10);
    run(lab, 1);
    const path = labPath(lab);
    t.ok(`path: a route appears once the agent has one (${path.length} nodes)`, path.length > 1);

    // The two overlays have to agree: a path node id that is not in the graph
    // the Graph overlay draws would render as a line to nowhere.
    const g = labGraph(lab);
    t.ok("path: every node on it exists in the drawn graph", path.every((id) => !!g.nodes[id]));
    t.eq("path: it starts at the node the agent is standing on", path[0], lab.agent.nav.path[0]);

    // It is the route actually HELD, never a fresh one. The follower repaths on
    // config.navRepathInterval; a tool that recomputed to draw would show a
    // fresher route than the one being walked — which is the exact thing you
    // would open the Lab to diagnose.
    lab.agent.nav.path = [path[0]];
    t.eq("path: read off the agent's own state, not recomputed for drawing", labPath(lab).length, 1);
  }
  {
    // "Click ANYWHERE in the level" includes empty sky. `nearestNode` means the
    // surface under the click, so a goal in mid-air is a goal on the floor
    // beneath it and still draws a route — rather than the overlay going blank
    // because the click missed a platform.
    const lab = model();
    labGoal(lab, lab.soldier.x + 700, -5000);
    run(lab, 2);
    t.ok("path: a click in empty sky still routes, to the surface under it", labPath(lab).length >= 1);
    t.eq("path: and is not treated as unreachable", lab.agent.sense.routeReachable, true);
    // Worth stating plainly: an UNREACHABLE goal cannot be produced here at all.
    // The generator guarantees traversability, so every node is reachable from
    // every other on a level it built. Dragging a platform out of reach is B3,
    // and B3 is the first slice that can exercise the partial-path overlay.
  }

  // ---- B2: the overlays actually render --------------------------------------
  {
    // The overlays are OFF by default, so nothing at mount ever executes them —
    // a throw inside drawGraph or drawPath would ship unseen. Drive the draw
    // directly with both on. The stubbed 2D context no-ops every call, so this
    // asserts the code PATH runs, not what it looks like; what it looks like is
    // the one thing only Bo can check.
    const lab = model();
    const c = ctx2d();
    labGoal(lab, lab.soldier.x + 900, feet(lab.soldier) - 10);
    run(lab, 2);
    lab.show.graph = true;
    lab.show.path = true;
    let threw = null;
    try {
      labDraw(c, lab);
      labPan(lab, 3000); // a different slice of the level: culling both ways
      labDraw(c, lab);
    } catch (e) {
      threw = e;
    }
    t.ok("render: drawing with both overlays on does not throw", !threw);
    if (threw) console.log("   ", threw.stack);

    // The one crash the path overlay can actually hit: a held path whose node
    // ids no longer resolve, because retuning rebuilt the graph under it.
    const stale = labPath(lab).slice();
    config.jumpSpeed = 1100;
    labInvalidate(lab);
    lab.agent.nav = { gen: 0, dest: null, path: [...stale, 9999], reachable: true, repathIn: 0, leg: null, attempts: {}, banned: new Set(), blocked: false };
    threw = null;
    try {
      labDraw(c, lab);
    } catch (e) {
      threw = e;
    }
    config.jumpSpeed = 720;
    t.ok("render: a path holding node ids the rebuilt graph does not have is survivable", !threw);
    if (threw) console.log("   ", threw.stack);
  }

  // ---- B3: dragging platforms ------------------------------------------------
  {
    const lab = model();
    const p = lab.scene.platforms[3];
    t.ok("drag: a point inside a platform finds it", labPlatformAt(lab, p.x + 5, p.y + 5) === p);
    t.eq("drag: a point in open air finds nothing", labPlatformAt(lab, p.x + 5, p.y - 200), null);
    t.eq("drag: starting on air is not a drag — that is how a click stays a click", labDragStart(lab, p.x + 5, p.y - 200), null);
    labDragEnd(lab);

    // Grabbing keeps the offset, so the platform does not snap its corner to the
    // cursor the moment you touch it — grab it 40px in and it stays 40px in.
    const x0 = p.x;
    t.ok("drag: starting on a platform grabs it", labDragStart(lab, p.x + 40, p.y + 8) === p);
    labDragMove(lab, x0 + 40 + 120, p.y + 8);
    t.eq("drag: it follows the pointer by the delta, not by snapping to it", Math.round(p.x - x0), 120);
    labDragEnd(lab);
  }
  {
    // Dragging makes platforms overlap, which nothing else in the game does.
    // The pick has to match what is DRAWN — last drawn is on top — or you grab
    // something you cannot see and the tool feels broken.
    const lab = model();
    const under = lab.scene.platforms[1];
    const over = lab.scene.platforms[lab.scene.platforms.length - 1];
    labDragStart(lab, over.x + 5, over.y + 5);
    labDragMove(lab, under.x + 25, under.y + 5);
    labDragEnd(lab);
    const hit = labPlatformAt(lab, over.x + 5, over.y + 5);
    t.ok("drag: where two platforms overlap, the pick is the one on top", hit === over);
    t.ok("drag: and they really do overlap", over.x < under.x + under.w && over.x + over.w > under.x && over.y < under.y + under.h && over.y + over.h > under.y);
  }
  {
    const lab = model();
    const p = lab.scene.platforms[2];
    const x0 = p.x;
    const y0 = p.y;
    labDragStart(lab, p.x + 10, p.y + 5);
    labDragMove(lab, p.x + 10 + 200, p.y + 5 - 90);
    labDragEnd(lab);
    t.eq("drag: moves in x", Math.round(p.x - x0), 200);
    t.eq("drag: and in y — the design says both", Math.round(p.y - y0), -90);
  }
  {
    // Clamped to the world box, or a platform can be lost off an edge with no
    // way to get it back.
    const lab = model();
    const p = lab.scene.platforms[2];
    labDragStart(lab, p.x + 10, p.y + 5);
    labDragMove(lab, -9999, -9999);
    t.eq("drag: clamped at the top-left", `${p.x},${p.y}`, "0,0");
    labDragMove(lab, 99999, 99999);
    t.eq("drag: and at the bottom-right", `${p.x},${p.y}`, `${lab.scene.world.width - p.w},${lab.scene.world.height - p.h}`);
    labDragEnd(lab);
  }
  {
    // The graph rebuilds under the platform as it moves, and the agent's route
    // state goes with it — node ids are re-derived, so a held path's ids no
    // longer mean the same nodes.
    const lab = model();
    labGoal(lab, lab.soldier.x + 700, feet(lab.soldier) - 10);
    run(lab, 1);
    t.ok("rebuild: the agent has a route before the drag", !!lab.agent.nav && !!lab.agent.nav.path);
    const before = labGraph(lab).nodes.map((n) => `${n.a},${n.b},${n.y}`).join("|");
    const gen = lab.scene.navGen || 0;

    const p = lab.scene.platforms[2];
    labDragStart(lab, p.x + 10, p.y + 5);
    labDragMove(lab, p.x + 10 + 150, p.y + 5 - 120);
    labDragEnd(lab);

    t.ok("rebuild: the graph generation moved", (lab.scene.navGen || 0) > gen);
    t.eq("rebuild: the agent's route state was dropped, not carried over", lab.agent.nav, null);
    const after = labGraph(lab).nodes.map((n) => `${n.a},${n.b},${n.y}`).join("|");
    t.ok("rebuild: and the new graph describes the moved terrain", after !== before);
    run(lab, 1);
    t.ok("rebuild: the agent repaths from where it stands", !!lab.agent.nav && !!lab.agent.nav.path);
  }
  {
    // A drag edits THIS scene and can never reach the generator. loadMission
    // clones the level's platforms, which is the only reason dragging is safe —
    // without it a drag would corrupt the level a seed produces, and
    // levelgen.golden.json would be the thing that noticed.
    const lab = model();
    const p = lab.scene.platforms[2];
    labDragStart(lab, p.x + 10, p.y + 5);
    labDragMove(lab, p.x + 10 + 300, p.y + 5 - 200);
    labDragEnd(lab);
    const fresh = createLabModel(SEED, () => 0.5);
    t.eq("isolation: the same seed still builds the original level", fresh.scene.platforms[2].x, p.x - 300);
  }
  {
    // THE PAYOFF, and the reason B3 is worth more than "makes it interactive".
    // The generator guarantees traversability, so on a level it built every node
    // is reachable from every other — B1 and B2 could not produce an unreachable
    // goal at all, which left "get as close as you can, then stop" written but
    // never exercised end to end. Dragging a platform out of reach produces one.
    const lab = model();
    const p = lab.scene.platforms[2];
    labDragStart(lab, p.x + 10, p.y + 5);
    labDragMove(lab, lab.scene.world.width - 200, 60); // far away and high up
    labDragEnd(lab);
    labGoal(lab, p.x + p.w / 2, p.y - 10); // stand on it, if you can
    run(lab, 20);

    t.eq("unreachable: the agent knows it cannot get there", lab.agent.sense.routeReachable, false);
    t.ok(`unreachable: it still went somewhere (feet ${feet(lab.soldier)})`, lab.soldier.onGround);
    t.ok("unreachable: it is not standing on the platform it could not reach", feet(lab.soldier) !== p.y);
    t.ok("unreachable: and it stopped rather than throwing itself at the gap", Math.abs(lab.soldier.vx) < 40);
    // The Path overlay has something to draw for it: the partial route is still
    // a route, and drawing nothing here would read as "the tool broke".
    t.ok(`unreachable: the partial route is still drawable (${labPath(lab).length} nodes)`, labPath(lab).length >= 1);
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
