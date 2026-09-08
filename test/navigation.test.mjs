// ---------------------------------------------------------------------------
// ROUTE FOLLOWING (tech/agent-navigation.md, Slice N3).
//
// nav.test.mjs proves the GRAPH; this proves an agent moving on it. The split
// matters: the graph is pure and testable by construction, while route
// following is a state machine over frames, and every interesting property
// (climbs a ledge, gives up on the third try, falls back rather than freezing)
// only exists across time.
//
// The motivating case from design/agent-navigation.md is the first block below:
// a grounded chaser whose target stands on a ledge. Before N3 it walked to the
// spot underneath and hopped against nothing forever.
// ---------------------------------------------------------------------------

import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { instantiate, updateSpecEnemy } from "../src/mission/enemyspec/runtime.js";
import { Soldier, stepActor } from "../src/mission/entities.js";
import { WEAPONS } from "../src/game/content.js";
import { profileFor, graphFor, routeRequest, invalidateNavGraphs, navState, abortRoute } from "../src/mission/navigation.js";
import { buildGraph, graphKey, bodyProfile, reachableFrom, nodeUnder, footprintClear, solidLeft } from "../src/game/nav.js";
import { generateLevel } from "../src/game/gen/levelgen.js";
import { config, resetConfig } from "../src/game/config.js";

const STEP = 1 / 60;
const ctx = { friendlyFire: false, damageMult: 1, damage() {}, kill() {}, spark() {}, burst() {} };

function scene(platforms, soldiers = []) {
  return {
    world: { width: 1400, height: 540, gravity: 2000 },
    platforms,
    soldiers,
    enemies: [],
    projectiles: [],
    specRoots: [],
  };
}

const soldierAt = (x, y) => ({ kind: "soldier", x, y, w: 30, h: 46, vx: 0, vy: 0, onGround: true, alive: true, health: 1e9, maxHealth: 1e9 });

// a grounded chaser, 30x26, speed 210 — the husk_charger body
function chaser(x, y, speed = 210) {
  const r = instantiate(normalizeSpec({
    id: "chaser",
    root: { health: { max: 50 }, visual: { size: [30, 26] }, motion: { type: "chase", speed } },
  }), x, y);
  r.rng = () => 0.5;
  return r;
}

// The same body under a looping moveTo ORDER instead of a motion controller —
// the escort shape (companionspecs.js), and the only path in the runtime that
// ends a route on a schedule rather than on arrival.
function orderer(x, y, tx, ty, timeout = 0.6, speed = 210) {
  const r = instantiate(normalizeSpec({
    id: "orderer",
    root: { health: { max: 50 }, visual: { size: [30, 26] }, motion: { type: "static" } },
    brain: { start: "go", states: { go: { tracks: [{ id: "t", loop: true, steps: [
      { moveTo: { at: [tx, ty], speed, timeout } },
      { wait: 0.12 },
    ] }] } } },
  }), x, y);
  r.rng = () => 0.5;
  return r;
}

function sim(root, sc, seconds) {
  for (let i = 0; i < Math.round(seconds * 60); i++) updateSpecEnemy(root, STEP, sc, ctx);
  return root;
}

const feet = (e) => e.y + e.h;

// A body on the SOLDIER locomotor — a companion, and the one adapter that does
// not obey a drive request's magnitude. It accelerates at 2600px/s\u00b2 toward
// config.runSpeed off `Math.sign(v)`, so it crosses its takeoff rather than
// settling on it and arrives carrying real horizontal velocity. The clearance
// predictor is nominal (instantaneous drive, no residual), so this is the body
// its approximation is stated against and the one worth flying for real.
//
// Nothing integrates a Soldier for us — SOLDIER.apply calls applyMovement and
// steps nothing — so the mirror-then-step loop below is the one src/mission/ai.js
// does for companions and the Behavior Lab does for its agent.
const AGENT_DATA = {
  id: "sa", name: "SA", callsign: "", traits: [], cost: 0, status: "roster",
  stats: { aim: 5, health: 5, speed: 5, nerve: 5 }, record: { missions: 0, kills: 0 }, wounds: 0,
};

function soldierAgent(x, feetY) {
  const agent = instantiate(normalizeSpec({
    id: "sagent",
    root: { health: { max: 1 }, visual: { size: [30, 46] }, body: { locomotor: "soldier", gravity: 1 }, motion: { type: "static" } },
  }), x, feetY - 46, "player");
  const s = new Soldier(AGENT_DATA, WEAPONS.carbine, x, feetY - 46);
  s.onGround = true;
  agent.soldier = s;
  agent.rng = () => 0.5;
  return agent;
}

// Send it somewhere and run, at whatever step the caller wants to prove.
function simSoldier(agent, sc, seconds, goal, dt = STEP) {
  const s = agent.soldier;
  agent.motion = { type: "moveTo", target: [goal.x, goal.y], speed: config.runSpeed };
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    agent.x = s.x; agent.y = s.y; agent.w = s.w; agent.h = s.h;
    agent.vx = s.vx; agent.vy = s.vy; agent.onGround = s.onGround; agent.facing = s.facing;
    updateSpecEnemy(agent, dt, sc, ctx);
    stepActor(s, dt, sc.world, sc.platforms);
  }
  return s;
}

// Run a block against the PRE-C2 graph, where a jump's arc is not checked.
//
// Several cases below need an edge the body cannot fly, because what they prove
// is the recovery that happens when it finds out: the attempt cap, the ban, the
// reroute. Clearance removes those edges — that is the whole point of it — so
// with it on the geometry no longer poses the question. Turned off explicitly
// and restored explicitly, rather than disabling it for the file: the same
// geometry with clearance ON is a case too, and it is the one below each of them.
function noClearance(fn) {
  const was = config.navClearance;
  config.navClearance = false;
  try { fn(); } finally { config.navClearance = was; }
}

export default async function run(t) {
  resetConfig(); // routing knobs must be the shipping ones, whatever ran before

  // ---- the motivating case: chase a target onto a ledge ---------------------
  // A two-step climb. Each step is 100px, inside a 665-jump body's 110.6px
  // maxRise, but the target's platform is 200px up and cannot be reached in one
  // go — so arriving requires understanding that the lower step is on the way.
  // That is the whole difference between a route and a reflex.
  const CLIMB = [
    { x: 0, y: 500, w: 1400, h: 40 },
    { x: 600, y: 400, w: 200, h: 20 },
    { x: 820, y: 300, w: 380, h: 20 },
  ];
  {
    const sc = scene(CLIMB, [soldierAt(1000, 300 - 46)]);
    const c = chaser(150, 474);
    sim(c, sc, 10);
    t.ok(`chase: the chaser climbs two steps to the target's platform (feet ${feet(c)})`, feet(c) === 300);
    t.ok(`chase: and closes on the target (x ${c.x.toFixed(0)} vs 1000)`, Math.abs(c.x - 985) < 60);
    t.ok("chase: without needing a single failed attempt", Object.keys(c.nav.attempts).length === 0);
  }
  {
    // the same scene with routing OFF: the pre-N3 reflex, which hops at the
    // target whenever it is above and so never leaves the ground
    const sc = scene(CLIMB, [soldierAt(1000, 300 - 46)]);
    config.navEnabled = false;
    const c = chaser(150, 474);
    sim(c, sc, 10);
    config.navEnabled = true;
    t.ok(`chase: with routing off it never gets up there (feet ${feet(c).toFixed(0)}) — the bug N3 fixes`, feet(c) !== 300);
  }

  // ---- unreachable: get as close as you can, then stop ----------------------
  {
    // 200px up: way past maxRise. The ground is the best partial path, and the
    // honest reading of "as close as it can" is a POSITION on it, not the spawn.
    const sc = scene(
      [{ x: 0, y: 500, w: 1400, h: 40 }, { x: 700, y: 300, w: 300, h: 20 }],
      [soldierAt(820, 300 - 46)],
    );
    const c = chaser(200, 474);
    sim(c, sc, 6);
    t.ok("unreachable: walks toward the target rather than parking at spawn", c.x > 700);
    t.ok("unreachable: ends up beneath it", Math.abs(c.x + 15 - 835) < 40);
    t.ok("unreachable: and stops there", Math.abs(c.vx) < 1);
    t.eq("unreachable: the sense says so", c.sense.routeReachable, false);
  }

  // ---- the attempt cap ------------------------------------------------------
  // A 40x200 wall standing on the ground. WITHOUT clearance the graph believes
  // the 70px gap across it is hoppable (edges test the landing, not the arc), so
  // the agent tries, is clipped, and lands back where it started. That is
  // precisely what the cap exists for, and it stays the recovery path for every
  // jump that fails for a reason static terrain cannot predict.
  const WALL = [{ x: 0, y: 500, w: 1400, h: 40 }, { x: 560, y: 300, w: 40, h: 200 }];
  noClearance(() => {
    const sc = scene(WALL, [soldierAt(900, 500 - 46)]);
    const c = chaser(200, 474);
    sim(c, sc, 8);
    t.eq(`attempts: exactly one edge is banned, after config.navJumpAttempts (${config.navJumpAttempts}) tries`, c.nav.banned.size, 1);
    t.eq("attempts: the spent count is folded into the ban, not left dangling", Object.keys(c.nav.attempts).length, 0);
    t.ok("attempts: with no way round, the agent is still blocked", c.nav.blocked === true);
    t.eq("attempts: the sense reports it", c.sense.navBlocked, true);
    t.ok("attempts: a blocked agent still holds its best position, not its panic spot", Math.abs(c.x - 530) < 2);
    t.ok("attempts: and stays stopped", Math.abs(c.vx) < 1);
  });
  noClearance(() => {
    // the cap is a knob, and it is honoured
    const sc = scene(WALL, [soldierAt(900, 500 - 46)]);
    config.navJumpAttempts = 1;
    const c = chaser(200, 474);
    sim(c, sc, 8);
    config.navJumpAttempts = 3;
    t.eq("attempts: one try is enough to ban when the knob says so", c.nav.banned.size, 1);
  });
  {
    // THE SAME WALL WITH CLEARANCE ON (tech/nav-clearance.md, C2). The hop is
    // never offered, so the doomed takeoff never happens: the agent walks to the
    // closest point it can reach and stops, first time, with an empty ledger.
    const sc = scene(WALL, [soldierAt(900, 500 - 46)]);
    const c = chaser(200, 474);
    let airborne = 0;
    for (let i = 0; i < 60 * 8; i++) {
      updateSpecEnemy(c, STEP, sc, ctx);
      if (!c.onGround) airborne++;
    }
    t.eq("clearance: the wall hop is never attempted", airborne, 0);
    t.eq("clearance: so nothing is ever banned", c.nav.banned.size, 0);
    t.ok(`clearance: it still walks as close as it can get (x ${c.x.toFixed(0)}, lip 530)`, c.x > 500 && c.x <= 530);
    t.ok("clearance: and stops there", Math.abs(c.vx) < 1);
    t.eq("clearance: knowing it cannot get there", c.sense.routeReachable, false);
  }

  // ---- N4: retire the failed EDGE, not the destination ----------------------
  // The husk_charger bug, lifted from generated seed 2026. A 91px pillar splits
  // the ground slab in two, and a ledge continues at the same height to its
  // right. The graph links the ground halves with a flat hop — 100px gap against
  // a 139.65px flatReach — but the takeoff lip sits UNDER that ledge, so the
  // body rises 45px into its underside and drops straight back. The hop cannot
  // be flown, and the graph has no way to know: edges test the landing, not the
  // arc.
  //
  // A legal route exists the whole time — right to the ledge's far end, up onto
  // it, across to the pillar top, down the far side — and Dijkstra never picks
  // it, because the impossible hop is cheaper. Before N4 the agent tried three
  // times and gave up on the destination instead of on the edge.
  const PILLAR = [
    { x: 0, y: 500, w: 1400, h: 40 }, // ground
    { x: 470, y: 409, w: 70, h: 91 }, // the pillar, floor to y=409
    { x: 540, y: 409, w: 110, h: 20 }, // the ledge that roofs the takeoff
  ];
  noClearance(() => {
    const sc = scene(PILLAR, [soldierAt(100, 500 - 46)]);
    const c = chaser(600, 474); // right of the pillar; the target is left of it
    sim(c, sc, 12);
    t.ok(`N4: the chaser gets past the pillar (x ${c.x.toFixed(0)}, needs < 440)`, c.x < 440);
    t.ok("N4: it banned the hop it could not fly", c.nav.banned.size >= 1);
    t.ok("N4: and did NOT give up on the destination", c.nav.blocked === false);
    t.eq("N4: the sense agrees it is still going somewhere", c.sense.navBlocked, false);
  });
  noClearance(() => {
    // the same scene with the cap set absurdly high never bans, so it never
    // reroutes — which is precisely the pre-N4 behaviour, and shows the fix is
    // the ban rather than anything else that changed
    const sc = scene(PILLAR, [soldierAt(100, 500 - 46)]);
    config.navJumpAttempts = 999;
    const c = chaser(600, 474);
    sim(c, sc, 12);
    config.navJumpAttempts = 3;
    t.ok(`N4: without banning it never gets past (x ${c.x.toFixed(0)})`, c.x > 440);
  });
  {
    // THE PILLAR WITH CLEARANCE ON, and the whole point of C2: the same route,
    // arrived at without ever attempting the hop the graph used to offer. The
    // agent does not learn this the expensive way; it is never told the lie.
    const sc = scene(PILLAR, [soldierAt(100, 500 - 46)]);
    const c = chaser(600, 474);
    let bonked = 0;
    let prevLeg = null;
    for (let i = 0; i < 60 * 12; i++) {
      updateSpecEnemy(c, STEP, sc, ctx);
      const leg = c.nav && c.nav.leg;
      // The blocked shortcut is the flat hop ACROSS the pillar: same height,
      // and the takeoff is roofed by the ledge. Count any leg that starts one.
      if (leg && !prevLeg) {
        const g = [...sc.navGraphs.values()][0];
        if (g.nodes[leg.from].y === 500 && g.nodes[leg.to].y === 500) bonked++;
      }
      prevLeg = leg;
    }
    t.eq("clearance: the blocked ground-to-ground hop is never attempted", bonked, 0);
    t.eq("clearance: and nothing has to be banned to discover that", c.nav.banned.size, 0);
    t.ok(`clearance: it still gets past the pillar the long way (x ${c.x.toFixed(0)})`, c.x < 440);
    t.eq("clearance: never blocked", c.sense.navBlocked, false);
  }
  noClearance(() => {
    // a ban is a fact about geometry, so it must survive the destination moving.
    // Without this a chaser resets its count every tick and never reaches three.
    const sc = scene(PILLAR, [soldierAt(100, 500 - 46)]);
    const c = chaser(600, 474);
    for (let i = 0; i < 60 * 12; i++) {
      sc.soldiers[0].x = 100 + Math.sin(i / 30) * 60; // a target that keeps moving
      updateSpecEnemy(c, STEP, sc, ctx);
    }
    t.ok("N4: a moving destination does not wipe the ban ledger", c.nav.banned.size >= 1);
    t.ok(`N4: so the chaser still gets round (x ${c.x.toFixed(0)})`, c.x < 440);
  });
  noClearance(() => {
    // ...and it must survive the ORDER that was carrying it ending. Every N4
    // case above drives the `chase` motion CONTROLLER, which never touches
    // ent.nav — so none of them could see that the moveOrder branch used to
    // clear it outright on completion. That is the escort loop's only shape
    // (companionspecs.js: moveTo timeout 0.6, wait 0.12), and re-ordering twice
    // a second means the three strikes that retire an edge are never reached.
    // Same pillar, same impossible hop, driven the way a squadmate is.
    const sc = scene(PILLAR, [soldierAt(100, 500 - 46)]);
    const o = orderer(600, 474, 100, 474);
    sim(o, sc, 12);
    t.ok("N4: a completed moveOrder keeps the ban ledger", o.nav.banned.size >= 1);
    t.ok(`N4: so an ordered agent gets past the pillar too (x ${o.x.toFixed(0)})`, o.x < 440);
  });
  {
    // The other half: an order must not END mid-jump. `stop` runs the soldier's
    // 3000px/s² friction with no grounded gate, so a handover in the air brakes
    // the body to nothing and it lands back on its takeoff — turning legal edges
    // into failures the cap would eventually ban. A 0.05s timeout guarantees
    // expiry lands inside every jump this agent makes.
    const sc = scene(CLIMB, [soldierAt(1000, 300 - 46)]);
    const o = orderer(150, 474, 1000, 300, 0.05);
    sim(o, sc, 12);
    t.ok(`N4: an order expiring mid-jump does not strand the climb (feet ${feet(o)})`, feet(o) < 500);
    t.eq("N4: and no legal edge was banned for it", o.nav.banned.size, 0);
  }
  noClearance(() => {
    // bans belong to the agent, not the shared graph — two bodies with the same
    // profile share one graph object, and one's failure must not blind the other
    const sc = scene(PILLAR, [soldierAt(100, 500 - 46)]);
    const a = chaser(600, 474);
    const b = chaser(700, 474);
    sim(a, sc, 12);
    t.ok("N4: the first agent learned the edge is unflyable", a.nav.banned.size >= 1);
    t.ok("N4: the second starts with a clean ledger", !b.nav || b.nav.banned.size === 0);
    const g = [...sc.navGraphs.values()][0];
    t.ok("N4: and the shared graph still has every edge it built",
      g.edges.some((list) => list.length > 0));
  });
  {
    // A body must never commit to a climb from UNDER its destination: platforms
    // are solid from below, so that jump can only bonk. The takeoff window used
    // to allow it — 12px of tolerance is more than enough to still be
    // overlapping — which spent the attempt budget on jumps that were doomed
    // before they started.
    // Scoped to the DESTINATION's platform. A flat hop blocked by some third
    // piece of terrain is the "edges ignore ceilings" approximation, which the
    // attempt cap owns and which this guard is not about.
    const sc = scene(PILLAR, [soldierAt(100, 500 - 46)]);
    const c = chaser(600, 474);
    let badTakeoff = null;
    let prevLeg = null;
    for (let i = 0; i < 60 * 12; i++) {
      const wasX = c.x; // where we stood when the decision was made, not after it
      const wasFeet = c.y + c.h;
      updateSpecEnemy(c, STEP, sc, ctx);
      const leg = c.nav && c.nav.leg;
      if (leg && !prevLeg) {
        const g = [...sc.navGraphs.values()][0];
        const to = g.nodes[leg.to];
        // "Under it" is a fact about the destination's PLATFORM, not its span —
        // a span reaches a body width past the platform at each end since S2, so
        // reading one here would call a clear takeoff a bad one.
        const under = wasFeet > to.y && !footprintClear(wasX, to, c.w);
        if (under) badTakeoff = badTakeoff || { x: +wasX.toFixed(1), leg: `${leg.from}->${leg.to}` };
      }
      prevLeg = leg;
    }
    t.ok(`takeoff: never climbs from under its destination${badTakeoff ? ` (${JSON.stringify(badTakeoff)})` : ""}`, !badTakeoff);
  }
  // Ground [0, 170]; the perch's clear positions are -30 and 230, neither of
  // which is on it, so there is no good takeoff anywhere.
  const ROOFED = [{ x: 0, y: 500, w: 200, h: 40 }, { x: 0, y: 420, w: 200, h: 20 }];
  noClearance(() => {
    // ...but insisting on clearance must never become a freeze. A perch with no
    // standable takeoff on either side has to be ATTEMPTED and then retired,
    // because an agent that refuses to try never learns the edge is a lie.
    const sc = scene(ROOFED, [soldierAt(100, 420 - 46)]);
    const c = chaser(20, 474);
    sim(c, sc, 10);
    t.ok("takeoff: an unreachable perch is attempted, not refused", c.nav.banned.size >= 1 || c.y + c.h === 420);
    t.ok("takeoff: and the agent does not freeze mid-approach undecided", c.nav.path !== null);
  });
  {
    // The same perch with clearance ON: there is no takeoff, so there is no
    // edge, so there is nothing to attempt and nothing to learn. The freeze the
    // case above guards against cannot happen either — with no route to offer,
    // the agent stands where it is rather than leaning at a lip forever.
    const sc = scene(ROOFED, [soldierAt(100, 420 - 46)]);
    const c = chaser(20, 474);
    let airborne = 0;
    for (let i = 0; i < 60 * 10; i++) {
      updateSpecEnemy(c, STEP, sc, ctx);
      if (!c.onGround) airborne++;
    }
    t.eq("clearance: a perch with no standable takeoff is never jumped at", airborne, 0);
    t.eq("clearance: and never banned, because it was never offered", c.nav.banned.size, 0);
    t.ok("clearance: the agent still holds a route (to where it stands)", c.nav.path !== null);
  }
  noClearance(() => {
    // moving the terrain invalidates what an agent learned about it
    const sc = scene(PILLAR, [soldierAt(100, 500 - 46)]);
    const c = chaser(600, 474);
    sim(c, sc, 12);
    t.ok("N4: a ban exists before the terrain moves", c.nav.banned.size >= 1);
    invalidateNavGraphs(sc);
    updateSpecEnemy(c, STEP, sc, ctx);
    t.eq("N4: invalidating the graph clears the ledger", c.nav.banned.size, 0);
  });

  // ---- dropping off a ledge -------------------------------------------------
  // Leaving a ledge is not the same as lining up with the node below it. The
  // ground slab spans most of a level, so the nearest point on it is directly
  // underfoot — and an agent told to "go there" stands on the lip forever,
  // fully supported, waiting for a fall that needs a step nobody asked for.
  // This froze chasers on high platforms whenever the player dropped away.
  {
    const sc = scene(
      [{ x: 0, y: 500, w: 1400, h: 40 }, { x: 600, y: 350, w: 200, h: 20 }],
      [soldierAt(200, 500 - 46)], // the target is on the ground, far to the left
    );
    const c = chaser(700, 350 - 26); // standing on the perch, directly above the ground node
    c.onGround = true;
    sim(c, sc, 8);
    t.ok(`drop: the chaser leaves the ledge (feet ${feet(c)})`, feet(c) === 500);
    t.ok(`drop: and goes on to reach the target (x ${c.x.toFixed(0)})`, Math.abs(c.x - 185) < 60);
  }
  {
    // the same, dropping the other way — the side is chosen by where the
    // destination is, not by a fixed preference
    const sc = scene(
      [{ x: 0, y: 500, w: 1400, h: 40 }, { x: 600, y: 350, w: 200, h: 20 }],
      [soldierAt(1200, 500 - 46)],
    );
    const c = chaser(650, 350 - 26);
    c.onGround = true;
    sim(c, sc, 8);
    t.ok("drop: it leaves by the side its destination is on", feet(c) === 500 && c.x > 800);
  }
  {
    // TWO LEDGES THAT OVERLAP IN X, the lower one reaching further left. Found
    // by eye in the Behavior Lab: the agent paced a few pixels back and forth on
    // the upper ledge forever, holding a correct path it never walked.
    //
    // The old tie-break for which lip to leave by was `destX >= ent.x` — a
    // decision that reads the agent's OWN position. Walk toward the lip it
    // picks, cross the destination's x, and the answer flips; walk back, and it
    // flips again. Nothing an agent does may change the input to the decision
    // that told it to do it. Which lip a drop uses is now a fact about the two
    // spans, which do not move.
    const sc = scene(
      [{ x: 0, y: 700, w: 1400, h: 40 }, { x: 365, y: 240, w: 165, h: 20 }, { x: 217, y: 365, w: 195, h: 20 }],
      [soldierAt(375, 365 - 46)], // on the lower ledge, under the overlap
    );
    const c = chaser(400, 240 - 26);
    c.onGround = true;
    sim(c, sc, 4);
    t.ok(`overlap: the chaser gets off the upper ledge (feet ${feet(c)})`, feet(c) === 365);
    t.ok(`overlap: onto the ledge below, not the ground (x ${c.x.toFixed(0)})`, c.x >= 217 && c.x <= 382);
    t.ok("overlap: and does not pace the lip", Math.abs(c.vx) < 1);
  }
  {
    // The second half of the same bug, and the reason the first fix was not
    // enough. A node's span is where the body fits WHOLLY on the platform, so
    // walking off means leaving the span — and `nodeUnder` stops recognising the
    // body a body-width before it stops being supported. In that gap the router
    // used to hand back to straight-line steering, which walked it right back on.
    const sc = scene(
      [{ x: 0, y: 700, w: 1400, h: 40 }, { x: 365, y: 240, w: 165, h: 20 }, { x: 217, y: 365, w: 195, h: 20 }],
      [soldierAt(375, 365 - 46)],
    );
    const c = chaser(400, 240 - 26);
    c.onGround = true;
    let offNodeGrounded = 0;
    for (let i = 0; i < 60 * 4; i++) {
      updateSpecEnemy(c, STEP, sc, ctx);
      if (c.onGround && feet(c) === 240 && (c.x < 365 || c.x > 500)) offNodeGrounded++;
    }
    t.ok(`step-off: it spends frames grounded but off-span, and keeps going (${offNodeGrounded})`, offNodeGrounded > 0);
    t.ok("step-off: ending up below, not back on the ledge", feet(c) === 365);
  }
  {
    // The guard that keeps the above from becoming a NEW freeze, and the reason
    // it is not obvious: a span can end before its PLATFORM does. `buildNodes`
    // cuts a span where headroom runs out, so an agent told to walk a body width
    // past the span's end can arrive there and still be standing on solid floor.
    // A step-off that presses on regardless leans against nothing forever.
    // (The freeze hunter caught this on generated seed 40. Reasoning did not.)
    const sc = scene(
      [
        { x: 0, y: 700, w: 1400, h: 40 },
        { x: 300, y: 400, w: 400, h: 20 }, // the ledge: platform runs 300–700
        // A low roof over the ledge's right end. 27px of headroom: under the
        // 30px `buildNodes` demands, so the span is cut to [300,570] — but over
        // the 26px body, so the floor there is still walkable. That gap is the
        // whole point; a roof sitting flush would be a wall and prove nothing.
        { x: 600, y: 353, w: 300, h: 20 },
        { x: 650, y: 520, w: 300, h: 20 }, // below and right: the drop destination
      ],
      [soldierAt(800, 520 - 46)],
    );
    const c = chaser(400, 400 - 26);
    c.onGround = true;
    sim(c, sc, 8);
    // The step-off aims at 600 — past the node's end at 570, but still on the
    // platform, which runs to 700. Reaching it and stopping is the freeze.
    t.ok(`cut span: it does not stall at the node's end (x ${c.x.toFixed(0)}, feet ${feet(c)})`, feet(c) !== 400);
    t.ok(`cut span: it gets down to the target's ledge`, feet(c) === 520);
  }

  // ---- profiles: the soldier-locomotor branch -------------------------------
  {
    const sc = scene([{ x: 0, y: 500, w: 1400, h: 40 }]);
    const legged = chaser(200, 474);
    const p = profileFor(legged, sc, 210);
    t.eq("profile: a legged body jumps with body.jump/config.enemyJump", p.jumpSpeed, config.enemyJump);
    t.eq("profile: ...at the controller's speed", p.runSpeed, 210);
    t.eq("profile: ...under world gravity x body.gravity", p.gravity, 2000);

    // a companion: body.* is decoration, the Soldier's own numbers are the truth
    const comp = instantiate(normalizeSpec({
      id: "comp",
      root: { health: { max: 1 }, visual: { size: [30, 46] }, body: { locomotor: "soldier", gravity: 1 }, motion: { type: "static" } },
    }), 200, 454);
    const s = profileFor(comp, sc, 210);
    t.eq("profile: a soldier body jumps with config.jumpSpeed, not enemyJump", s.jumpSpeed, config.jumpSpeed);
    t.eq("profile: ...runs at config.runSpeed, not the controller's", s.runSpeed, config.runSpeed);
    t.eq("profile: ...and falls under unscaled world gravity", s.gravity, 2000);
    // Derived, not frozen: the rise is v²/2g off whichever jump speed was
    // used, so this says "the SOLDIER's number, not the enemy's" at any tuning.
    const riseFrom = (v) => (v * v) / (2 * 2000);
    t.ok(`profile: so its maxRise is the player's ${riseFrom(config.jumpSpeed)}, not ${riseFrom(config.enemyJump)} (got ${s.envelope.maxRise})`,
      Math.abs(s.envelope.maxRise - riseFrom(config.jumpSpeed)) < 1e-9);

    // and the difference is not cosmetic: a 120px ledge sits BETWEEN the two
    // envelopes, so reading body.* for a companion would deny it a climb it can
    // actually make — the escort falling behind at exactly the interesting spot
    //
    // Asked of the LEGACY builder deliberately. What is on trial here is the
    // envelope a profile produces, and this ledge is 2.5px inside a soldier's
    // maxRise: clearance rejects it (the body is above the surface for six
    // frames and needs seven to cross the footprint), which is a true statement
    // about the manoeuvre and no statement at all about the profile.
    const ledgePlats = [{ x: 0, y: 500, w: 1400, h: 40 }, { x: 700, y: 380, w: 300, h: 20 }];
    const ledged = scene(ledgePlats);
    const up = (prof) => {
      const g = buildGraph(ledgePlats, prof);
      const ground = g.nodes.find((n) => n.y === 500);
      const ledge = g.nodes.find((n) => n.y === 380);
      return g.edges[ground.id].some((e) => e.to === ledge.id);
    };
    t.ok("profile: a companion's envelope REACHES a 120px ledge", up(profileFor(comp, ledged, 210)));
    t.ok("profile: a legged body's does not — 120 is past its 110.6 maxRise",
      !up(profileFor(legged, ledged, 210)));
  }

  // ---- the graph cache ------------------------------------------------------
  {
    const sc = scene([{ x: 0, y: 500, w: 1400, h: 40 }, { x: 700, y: 400, w: 300, h: 20 }]);
    const a = chaser(200, 474);
    const b = chaser(300, 474);
    const g1 = graphFor(sc, profileFor(a, sc, 210));
    const g2 = graphFor(sc, profileFor(b, sc, 210));
    t.ok("cache: two identical bodies share ONE graph", g1 === g2);

    const g3 = graphFor(sc, profileFor(a, sc, 400)); // a different run speed
    t.ok("cache: a different envelope gets its own graph", g3 !== g1);
    t.eq("cache: both are held on the scene", sc.navGraphs.size, 2);

    invalidateNavGraphs(sc);
    t.ok("cache: invalidation drops them (the Lab drags platforms)", !sc.navGraphs);
    t.ok("cache: and the next build is a fresh object", graphFor(sc, profileFor(a, sc, 210)) !== g1);
  }

  // ---- the hop flag is the router's, and only the router's ------------------
  {
    // ground plus one 100px ledge at x 700..1000. The ledge node is [700, 970];
    // a 30-wide body must take off CLEAR of the platform, i.e. at x = 670.
    const sc = scene([{ x: 0, y: 500, w: 1400, h: 40 }, { x: 700, y: 400, w: 300, h: 20 }]);
    const c = chaser(200, 474);
    c.onGround = true;
    const dest = { x: 850, y: 400 - 13 };

    // far from the takeoff: drive, do not jump
    let req = routeRequest(c, dest, 210, sc, STEP);
    t.ok("hop: away from the takeoff it is a plain drive", req && req.kind === "driveX" && !req.hop);
    t.ok("hop: heading toward the takeoff", req.v > 0);

    c.x = 670;
    req = routeRequest(c, dest, 210, sc, STEP);
    t.ok("hop: at the takeoff it commits", req && req.kind === "driveX" && req.hop === true);
    t.ok("hop: and records the leg so a failure can be detected", c.nav.leg && c.nav.leg.to !== undefined);
    t.ok("hop: the router never emits the old hopToward reflex", req.hopToward === undefined);
  }
  {
    // the takeoff must be OUTSIDE the destination's footprint: platforms are
    // solid from below, so jumping from under one only bonks. Standing directly
    // beneath the ledge, the router walks back out rather than jumping.
    const sc = scene([{ x: 0, y: 500, w: 1400, h: 40 }, { x: 700, y: 400, w: 300, h: 20 }]);
    const c = chaser(800, 474); // squarely under the ledge
    c.onGround = true;
    const req = routeRequest(c, { x: 850, y: 400 - 13 }, 210, sc, STEP);
    t.ok("hop: standing underneath, it does not jump into the underside", req && !req.hop);
    t.ok("hop: it walks back out from under the platform first", req.kind === "driveX" && req.v < 0);
  }

  // ---- fallback discipline: null means 'do what you did before' -------------
  {
    const sc = scene([{ x: 0, y: 500, w: 1400, h: 40 }]);
    const c = chaser(200, 474);
    c.onGround = true;
    const dest = { x: 900, y: 474 };

    t.ok("fallback: a live route is not null", routeRequest(c, dest, 210, sc, STEP) !== null);

    config.navEnabled = false;
    t.eq("fallback: the config switch turns routing off entirely", routeRequest(c, dest, 210, sc, STEP), null);
    config.navEnabled = true;

    t.eq("fallback: no destination, no route", routeRequest(c, null, 210, sc, STEP), null);
    t.eq("fallback: a scene with no platforms", routeRequest(c, dest, 210, scene([]), STEP), null);

    // standing where the graph has no node (above the world's only slab)
    const flying = chaser(200, 100);
    flying.onGround = true;
    t.eq("fallback: off the graph hands back to straight-line steering",
      routeRequest(flying, dest, 210, sc, STEP), null);

    // a flyer never routes
    const flyer = instantiate(normalizeSpec({
      id: "flyer",
      root: { health: { max: 10 }, visual: { size: [24, 24] }, body: { gravity: 0 }, motion: { type: "chase", speed: 120 } },
    }), 200, 300);
    t.eq("fallback: a flying body gets no graph and no route", routeRequest(flyer, dest, 120, sc, STEP), null);
  }

  // ---- a moving destination repaths immediately -----------------------------
  {
    const sc = scene([{ x: 0, y: 500, w: 1400, h: 40 }]);
    const c = chaser(600, 474);
    c.onGround = true;
    const right = routeRequest(c, { x: 1000, y: 474 }, 210, sc, STEP);
    const left = routeRequest(c, { x: 200, y: 474 }, 210, sc, STEP);
    t.ok("repath: a destination behind me reverses the drive on the SAME frame",
      right.v > 0 && left.v < 0);
  }

  // ---- C2: the validated takeoff, flown for real ----------------------------
  // The predictor's whole claim is that the manoeuvre it simulated is the
  // manoeuvre the follower performs. These fly it with the real integrator and
  // the real locomotors, which is the only way that claim can be checked.
  //
  // Ground plus a 100px perch at [700,970], with a small slab roofing the LEFT
  // takeoff (670) and nothing over the right one (1000). The graph therefore
  // offers exactly one way up, and it is the one on the far side of the perch:
  // an agent approaching from the left has to walk past its destination.
  //
  // The overhang is standable in its own right since S2 — every platform is,
  // however narrow — but nothing can get ONTO it: at 120px up it is inside
  // maxRise and the horizontal budget that high is a few pixels, so clearance
  // refuses both of its takeoffs. It roofs 670 without opening a second way up,
  // which is what this scene needs; it just does it by being unflyable rather
  // than by being too small to stand on.
  const ONE_WAY_UP = [
    { x: 0, y: 500, w: 1400, h: 40 },
    { x: 700, y: 400, w: 300, h: 20 },
    { x: 640, y: 380, w: 34, h: 20 }, // over the 670 takeoff, and only that one
  ];
  {
    const sc = scene(ONE_WAY_UP, [soldierAt(850, 400 - 46)]);
    const c = chaser(200, 474);
    const g = graphFor(sc, profileFor(c, sc, 210));
    const ground = g.nodes.find((n) => n.y === 500);
    const perch = g.nodes.find((n) => n.y === 400 && solidLeft(n) === 700);
    const edge = g.edges[ground.id].find((e) => e.to === perch.id);
    t.ok("takeoff: the climb survives with one validated takeoff", !!edge);
    t.eq("takeoff: and it is the far side, not the roofed near one", edge.takeoffs, [1000]);

    sim(c, sc, 14);
    t.ok(`takeoff: the agent gets up there (feet ${feet(c)})`, feet(c) === 400);
    t.ok(`takeoff: having walked PAST the perch to the clear side (x ${c.x.toFixed(0)})`, c.x > 700);
    t.eq("takeoff: with no failed attempt on the way", Object.keys(c.nav.attempts).length, 0);
    t.eq("takeoff: and nothing banned", c.nav.banned.size, 0);
  }
  {
    // The commitment is held. Recomputing the side every frame from the entity's
    // position is the defect this exists to prevent: an agent walking right to
    // reach 1000 crosses the midpoint between 670 and 1000 and would flip to the
    // side it is now nearer — which is the side nothing tested.
    const sc = scene([{ x: 0, y: 500, w: 1400, h: 40 }, { x: 700, y: 400, w: 300, h: 20 }],
      [soldierAt(850, 400 - 46)]);
    const c = chaser(900, 474); // under the perch, nearer the RIGHT takeoff
    c.onGround = true;
    routeRequest(c, { x: 850, y: 400 - 13 }, 210, sc, STEP);
    const chosen = c.nav.commit && c.nav.commit.x;
    t.ok(`takeoff: a takeoff is committed as soon as the edge is chosen (${chosen})`, chosen === 670 || chosen === 1000);
    // Walk it to the far side of the midpoint and ask again.
    c.x = 700;
    routeRequest(c, { x: 850, y: 400 - 13 }, 210, sc, STEP);
    t.eq("takeoff: and it does not change under the body's own movement", c.nav.commit.x, chosen);
  }
  {
    // ...but it IS dropped when the manoeuvre is. A caller that abandons the
    // route must not leave a takeoff pinned for an edge nobody is travelling.
    const sc = scene([{ x: 0, y: 500, w: 1400, h: 40 }, { x: 700, y: 400, w: 300, h: 20 }],
      [soldierAt(850, 400 - 46)]);
    const c = chaser(900, 474);
    c.onGround = true;
    routeRequest(c, { x: 850, y: 400 - 13 }, 210, sc, STEP);
    t.ok("takeoff: committed", !!c.nav.commit);
    abortRoute(c);
    t.eq("takeoff: and released with the manoeuvre", c.nav.commit, null);
  }

  // ---- C2: an actual soldier, with actual momentum --------------------------
  {
    // The soldier adapter acts on the SIGN of a drive request, so it arrives at
    // its takeoff carrying up to a full runSpeed the predictor never modelled.
    // If the prediction and the execution disagree anywhere, they disagree here.
    const sc = scene(ONE_WAY_UP);
    const a = soldierAgent(200, 500);
    const s = simSoldier(a, sc, 16, { x: 850, y: 400 - 23 });
    t.ok(`soldier: a real Soldier body makes the validated climb (feet ${s.y + s.h})`, s.y + s.h === 400);
    t.ok(`soldier: from the far takeoff, having walked past the perch (x ${s.x.toFixed(0)})`, s.x > 700);
    t.eq("soldier: without spending an attempt on the roofed side", Object.keys(a.nav.attempts).length, 0);
  }
  {
    // ...and at frame steps that are not 1/60. The predictor samples at a fixed
    // step; a host running at 50 or 120 must still fly what it validated.
    for (const dt of [1 / 50, 1 / 120]) {
      const sc = scene(ONE_WAY_UP);
      const a = soldierAgent(200, 500);
      const s = simSoldier(a, sc, 16, { x: 850, y: 400 - 23 }, dt);
      t.ok(`soldier: the same climb at dt=1/${Math.round(1 / dt)} (feet ${s.y + s.h}, x ${s.x.toFixed(0)})`,
        s.y + s.h === 400 && s.x > 700);
    }
  }
  {
    // The negative half of the same claim, and the one that fails silently if it
    // is wrong: a route that clearance rejected must be a route the real body
    // genuinely cannot fly. Turn clearance off so the edge exists to attempt,
    // and watch the soldier fail at it exactly as predicted.
    const ROOFED_BOTH = [
      { x: 0, y: 500, w: 1400, h: 40 },
      { x: 700, y: 400, w: 300, h: 20 },
      { x: 640, y: 380, w: 34, h: 20 }, // over 670
      { x: 1000, y: 380, w: 34, h: 20 }, // ...and over 1000
    ];
    {
      // Asked of the GROUND node, not of the whole graph: since S2 the two lids
      // are standable surfaces in their own right, and there is a jump between
      // them and the perch. Neither is reachable from the floor, which is the
      // claim — "is there a way up from here", not "is there a jump anywhere".
      const sc = scene(ROOFED_BOTH);
      const probe = soldierAgent(200, 500);
      const g = graphFor(sc, profileFor(probe, sc, config.runSpeed));
      const floor = g.nodes.find((n) => n.y === 500);
      t.eq("soldier: clearance rejects this climb — both takeoffs are roofed",
        g.edges[floor.id].some((e) => e.kind === "jump"), false);
    }
    noClearance(() => {
      const sc = scene(ROOFED_BOTH);
      const a = soldierAgent(200, 500);
      const s = simSoldier(a, sc, 16, { x: 850, y: 400 - 23 });
      t.ok(`soldier: and with clearance off the real body cannot fly it either (feet ${s.y + s.h})`, s.y + s.h !== 400);
      t.ok("soldier: it discovers that the expensive way, by failing at it", a.nav.banned.size >= 1);
    });
  }

  // ---- S3: a real soldier taking the run-up ---------------------------------
  {
    // The graph guard for this shape is in nav.test.mjs; this is the body flying
    // it. A 90x62 block standing on the floor cuts the floor in two, and the
    // only takeoff that crosses it is a run-up 50-60px back from the lip.
    const FLOOR = { x: 0, y: 500, w: 1400, h: 40 };
    const BLOCK = { x: 600, y: 438, w: 90, h: 62 };
    // Approaching from the left, the run-up is on the way: the body launches
    // where it was already walking, and OVER the block rather than onto it.
    for (const dt of [STEP, 1 / 50]) {
      const sc = scene([FLOOR, BLOCK]);
      const a = soldierAgent(200, 500);
      let stood = false;
      const s = a.soldier;
      a.motion = { type: "moveTo", target: [900, 500], speed: config.runSpeed };
      for (let i = 0; i < Math.round(6 / dt); i++) {
        a.x = s.x; a.y = s.y; a.w = s.w; a.h = s.h;
        a.vx = s.vx; a.vy = s.vy; a.onGround = s.onGround; a.facing = s.facing;
        updateSpecEnemy(a, dt, sc, ctx);
        stepActor(s, dt, sc.world, sc.platforms);
        if (s.onGround && Math.abs(s.y + s.h - 438) < 1) stood = true;
      }
      t.ok(`S3: a real Soldier crosses the block at dt=1/${Math.round(1 / dt)} (x ${s.x.toFixed(0)})`, s.x > 690);
      t.ok("S3: ...over it, not up onto it", !stood);
      t.eq("S3: ...and spends no attempt finding that out", Object.keys(a.nav.attempts).length, 0);
    }
    {
      // Starting AT the lip, the same takeoff is behind the body: it walks back
      // to it and launches while still carrying leftward speed, which is not the
      // launch the predictor flew. It gets across, one failed jump later. That
      // one attempt is S4's — the predictor launches from a standstill, and the
      // range a follower can arrive with is what S4 makes it fly.
      const sc = scene([FLOOR, BLOCK]);
      const a = soldierAgent(560, 500);
      const s = simSoldier(a, sc, 6, { x: 900, y: 500 });
      const spent = Object.values(a.nav.attempts).reduce((n, v) => n + v, 0);
      t.ok(`S3: and crosses it from the lip too, walking back to the run-up (x ${s.x.toFixed(0)})`, s.x > 690);
      t.ok(`S3: ...at the cost of one reversed launch, which is S4's (attempts ${spent})`, spent <= 1 && a.nav.banned.size === 0);
    }
  }

  // ---- C2: failure recovery still works with clearance ON -------------------
  {
    // Static clearance reduces failures; it does not remove the recovery path.
    // Nothing static predicts a jump that is interrupted, so the cap has to keep
    // counting on edges the predictor accepted. Interrupt every jump this agent
    // makes by braking it in the air, and it should ban the edge and reroute.
    const sc = scene([{ x: 0, y: 500, w: 1400, h: 40 }, { x: 700, y: 400, w: 300, h: 20 }],
      [soldierAt(850, 400 - 46)]);
    const c = chaser(200, 474);
    for (let i = 0; i < 60 * 14; i++) {
      updateSpecEnemy(c, STEP, sc, ctx);
      // A knockback mid-flight: the one channel the locomotor does not overwrite
      // each frame, and exactly the class of interruption no static predictor can
      // see coming.
      if (!c.onGround) c.shoveX = -700;
    }
    t.ok("recovery: a jump the predictor accepted can still fail in play", c.nav.banned.size >= 1);
    t.ok("recovery: and the cap still retires it", feet(c) === 500);
    t.ok("recovery: leaving the agent stopped, not pogoing", Math.abs(c.vx) < 1);
  }

  // ---- C2: graph identity, and every consumer that reads route state --------
  {
    // Toggling clearance builds a DIFFERENT graph of the same terrain, and its
    // node ids mean different places. A path, a committed takeoff or a ban
    // carried across that is nonsense the agent would then act on.
    const sc = scene(PILLAR, [soldierAt(100, 500 - 46)]);
    const c = chaser(600, 474);
    sim(c, sc, 2);
    t.ok("identity: a live route before the toggle", !!c.nav.path);
    const key = c.nav.key;
    config.navClearance = false;
    t.eq("identity: the held state is not valid against the new policy", navState(c, sc), null);
    updateSpecEnemy(c, STEP, sc, ctx);
    config.navClearance = true;
    t.ok(`identity: so the agent rebuilt onto the other graph (${key} → ${c.nav.key})`, c.nav.key !== key);
    t.ok("identity: with a fresh path, not the old ids", !!c.nav.path);
  }
  {
    // The same toggle with a jump IN FLIGHT. The leg names an edge on a graph
    // that no longer applies, and resolving it on landing would book a failed
    // attempt against an edge that was never attempted there.
    const sc = scene([{ x: 0, y: 500, w: 1400, h: 40 }, { x: 700, y: 400, w: 300, h: 20 }],
      [soldierAt(850, 400 - 46)]);
    const c = chaser(200, 474);
    let flipped = false;
    for (let i = 0; i < 60 * 10; i++) {
      updateSpecEnemy(c, STEP, sc, ctx);
      if (!flipped && !c.onGround && c.nav && c.nav.leg) {
        config.navClearance = false; // mid-jump, mid-air
        flipped = true;
      }
    }
    config.navClearance = true;
    t.ok("identity: a toggle mid-jump does not book a failed attempt", flipped);
    t.eq("identity: nothing was banned for an abandoned airborne leg", c.nav.banned.size, 0);
  }
  {
    // The body's own profile is part of the identity too, and it was NOT checked
    // before C2: a retune sends the agent to another cached graph whose ids mean
    // other places, and `navGen` never moves. Same terrain, same generation.
    const sc = scene([{ x: 0, y: 500, w: 1400, h: 40 }, { x: 700, y: 400, w: 300, h: 20 }],
      [soldierAt(850, 400 - 46)]);
    const c = chaser(200, 474);
    sim(c, sc, 2);
    const before = c.nav.key;
    const g2 = graphFor(sc, profileFor(c, sc, 400)); // a different run speed
    t.ok("identity: a different body gets a different graph", g2.key !== before);
    t.eq("identity: and state learned on the first is not valid against it", navState(c, sc, g2), null);
    t.ok("identity: while it stays valid against its own", !!navState(c, sc, graphFor(sc, profileFor(c, sc, 210))));
  }
  {
    // Ledgers stay private, with clearance on as without it. Two bodies of one
    // profile share one graph object; one's experience must not be the other's.
    const sc = scene([{ x: 0, y: 500, w: 1400, h: 40 }, { x: 700, y: 400, w: 300, h: 20 }],
      [soldierAt(850, 400 - 46)]);
    const a = chaser(200, 474);
    const b = chaser(300, 474);
    sim(a, sc, 2);
    sim(b, sc, 2);
    a.nav.banned.add("0->1");
    t.ok("identity: one agent's ban is its own", !b.nav.banned.has("0->1"));
    t.ok("identity: and both are still routing on the one shared graph", sc.navGraphs.size === 1);
  }

  // ---- S0: reachable standable surface, frozen (tech/nav-clearance.md) ------
  //
  // The second of S0's two guards. nav.test.mjs pins the MODEL against the
  // integrator; this pins that a change to the model does not quietly cost the
  // agent places it could reach. C2 shipped on "failed jumps 207 -> 0" and
  // "agents making progress 169 -> 170", and both moved the right way while
  // this fell 22%, because both sweeps sent agents the length of a level where
  // ground travel dominates.
  //
  // Measured through the graph, and therefore blind in the way the whole
  // rewrite is about — but blind on BOTH sides of every comparison, so it is
  // honest as a floor even though no number here is an absolute.
  //
  // The floors are today's values. A slice that raises one raises the frozen
  // number in the same commit; a slice that lowers one has to say why.
  {
    const SURFACE = { // seed: reachable px with clearance ON. Raised by S2.
      11: 10660, 22: 2790, 33: 11480, 44: 10290, 55: 1770, 66: 6179,
      77: 10530, 88: 10510, 99: 11070, 110: 10400, 121: 7578, 132: 10680,
    };
    const body = bodyProfile({
      w: 30, h: 46, gravity: config.gravity, jumpSpeed: config.jumpSpeed, runSpeed: config.runSpeed,
    });
    // Reachable span, in px, from the node the player spawns on.
    const surface = (level, opts) => {
      const g = buildGraph(level.platforms, body, opts);
      const at = nodeUnder(g, level.playerSpawn.x, level.platforms[0].y);
      const seen = reachableFrom(g, at ? at.id : null);
      let px = 0;
      for (const id of seen) px += g.nodes[id].b - g.nodes[id].a;
      return { px: Math.round(px), reached: seen.size, nodes: g.nodes.length };
    };

    let legacyTotal = 0;
    let clearTotal = 0;
    let stranded = 0;
    let short = [];
    for (const seed of Object.keys(SURFACE).map(Number)) {
      const { level } = generateLevel({ seed, difficulty: "high", length: "long" });
      const legacy = surface(level, undefined);
      const clear = surface(level, { clearance: true });
      legacyTotal += legacy.px;
      clearTotal += clear.px;
      if (legacy.reached !== legacy.nodes) stranded++;
      if (clear.px < SURFACE[seed]) short.push(`${seed}: ${clear.px} < ${SURFACE[seed]}`);
    }
    t.ok(`surface: no seed reaches less than it does today (${clearTotal}px over 12)${short.length ? ` — ${short.join(", ")}` : ""}`, short.length === 0);
    t.ok("surface: the unfiltered graph still reaches every node it builds", stranded === 0);
    // Not a floor — the gap S3 and S4 exist to close, recorded so it moves in
    // view. Two of the twelve seeds lose over three quarters of the level.
    t.ok(`surface: clearance holds ${(100 * clearTotal / legacyTotal).toFixed(0)}% of the unfiltered surface`, clearTotal <= legacyTotal);
  }

  // ---- senses ---------------------------------------------------------------
  {
    const sc = scene(CLIMB, [soldierAt(1000, 300 - 46)]);
    const c = chaser(150, 474);
    sim(c, sc, 0.5);
    t.ok(`sense: routeSteps counts the edges left (${c.sense.routeSteps})`, c.sense.routeSteps === 2);
    t.eq("sense: a reachable destination reads reachable", c.sense.routeReachable, true);
    t.eq("sense: and is not blocked", c.sense.navBlocked, false);
  }
}
