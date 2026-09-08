// ---------------------------------------------------------------------------
// ROUTE FOLLOWING (tech/agent-navigation.md, Slice N3) — the mission-side half
// of navigation. `src/game/nav.js` is the graph MATH and stays pure; this is the
// adapter that knows about entities, scenes, config and locomotors:
//
//   profileFor(ent, scene, speed)  which body is walking, in nav.js's terms
//   graphFor(scene, profile)       one graph per profile, cached on the scene
//   routeRequest(ent, dest, ...)   the MotionRequest for this frame, or null
//   navGraph(ent, scene, speed)    the graph this body routes on, or null
//
// `routeRequest` returns **null** to mean "I have nothing useful — do what you
// did before N3". Off the graph, mid-fall, no platforms, flying, disabled: the
// caller falls back to straight-line steering rather than freezing. That is the
// fallback discipline in CLAUDE.md, and it is why routing could be switched on
// for the whole roster at once. What the fallback may NOT carry is a jump —
// `navGraph` is how a caller tells "no graph" from "no route", and only the
// first still hops (S5).
//
// The jump comes from HERE, not from the brain and not from the locomotor: the
// router knows the next edge is a jump edge and that the body is standing at its
// takeoff, which is exactly the knowledge required and is knowledge no other
// layer has. See "Who decides to jump" in the spec.
// ---------------------------------------------------------------------------

import {
  bodyProfile, buildGraph, graphKey, nodeUnder, nearestNode, route, bestPartial, costsFrom, edgeKey,
  takeoffX, landingX, footprintClear, airborneAimX, driveV, takeoffTolerance,
  settleX,
} from "../game/nav.js";
import { bodyJump } from "./locomotion.js";
import { SOLDIER_TUNING } from "./entities.js";
import { config } from "../game/config.js";

// ---- profiles + graph cache ----------------------------------------------

// The envelope triple for THIS body. The soldier branch is not a special case
// so much as an honest one: a companion's `body.*` fields are decoration,
// because SOLDIER never integrates the body — `Soldier.applyMovement` jumps with
// config.jumpSpeed and the mission steps it under unscaled world gravity. Build
// a legged profile for it and you get maxRise 110.6 where the truth is 129.6:
// climbs it can make, refused. (validate.js rejects the fields outright so an
// author never believes otherwise; this is the same fact on the reading side.)
//
// The same branch is where the body's horizontal ACTUATION comes from (S4). A
// soldier accelerates and brakes; a legged body's velocity is whatever the
// request says. That is the difference between a jump the clearance predictor
// accepts and one the body then fails in the air, so it belongs in the profile
// — and, through `profileKey`, in the identity of the graph built from it.
export function profileFor(ent, scene, speed) {
  const b = ent.spec.body;
  const world = scene.world.gravity;
  if (b.locomotor === "soldier") return soldierProfile(b.w, b.h, world);
  return bodyProfile({ w: b.w, h: b.h, gravity: world * b.gravity, jumpSpeed: bodyJump(ent), runSpeed: speed });
}

// The one description of a soldier-locomotor body, because there are two callers
// and a graph they disagree about is two graphs. `mission.js` draws the squad's
// routes off this; every companion routes on it. Leave a field out at one of
// them — the actuation is the easy one to forget — and the overlay quietly
// describes a different body from the one walking.
export function soldierProfile(w, h, gravity) {
  return bodyProfile({
    w, h, gravity,
    jumpSpeed: config.jumpSpeed,
    runSpeed: config.runSpeed,
    accel: SOLDIER_TUNING.accel,
    friction: SOLDIER_TUNING.friction,
  });
}

// THE ONE PLACE the runtime opts into clearance (tech/nav-clearance.md, C2).
// `src/game/nav.js` offers the filter; this is the mission adapter that asks
// for it, which is why generation's audit keeps the legacy builder without
// having to know the option exists.
function navOpts() {
  return { clearance: !!config.navClearance };
}

// One graph per distinct profile AND policy, built lazily and held on the scene.
// There is no per-mission hook to build them from — `scene.platforms` is
// assembled at four unrelated sites — so first use is the trigger. Terrain does
// not move during a mission; the Behavior Lab's platform dragging is what
// invalidate() is for.
export function graphFor(scene, profile) {
  if (!scene.navGraphs) scene.navGraphs = new Map();
  const opts = navOpts();
  const key = graphKey(profile, opts);
  let g = scene.navGraphs.get(key);
  if (!g) {
    g = buildGraph(scene.platforms, profile, opts);
    scene.navGraphs.set(key, g);
  }
  return g;
}

// IS THIS BODY ROUTED AT ALL (tech/nav-clearance.md, S5) — the one test, because
// off the graph a caller has to tell two very different nulls apart.
// `routeRequest` returns null both for a body navigation cannot describe (turned
// off, a flyer, terrain nothing can stand on) and for one standing somewhere its
// own graph does not model. The first keeps the pre-N3 reflex that hops at
// whatever is above it; the second must not, because the graph is the only thing
// that knows whether the terrain overhead can be jumped into, and a body that has
// one and hops anyway is jumping at terrain it cannot see.
//
// Free at a fallback site: `routeRequest` has already built and cached the graph
// for this profile, provided the caller passes the SAME speed it routed with — a
// legged profile carries its run speed, so a different one is a different graph.
export function navGraph(ent, scene, speed) {
  if (!config.navEnabled) return null;
  const b = ent.spec && ent.spec.body;
  if (!b || b.gravity === 0) return null; // flyers move in two dimensions already
  if (!scene.platforms || !scene.platforms.length) return null;
  const graph = graphFor(scene, profileFor(ent, scene, speed));
  return graph.nodes.length ? graph : null;
}

// Drop every cached graph. The generation counter is how agents notice: their
// route state — including the ban ledger — is keyed to the graph it was learned
// against, and "this edge cannot be flown" stops being true the moment the
// terrain moves under it.
export function invalidateNavGraphs(scene) {
  scene.navGraphs = null;
  scene.navGen = (scene.navGen || 0) + 1;
}

// ---- per-agent route state -----------------------------------------------

function newNav(scene, graph) {
  return {
    // WHICH WORLD this state describes. `gen` is the terrain (invalidateNavGraphs
    // bumps it); `key` is the body profile AND the clearance policy the graph was
    // built under. Both matter, and until C2 only the first was checked: retuning
    // a body sends an agent to a DIFFERENT cached graph whose node ids mean other
    // places, and a path, a committed takeoff or a learned ban carried across
    // that is nonsense the agent then acts on.
    gen: scene.navGen || 0,
    key: graph.key,
    // The policy on its own as well as inside `key`, because the consumers that
    // hold no graph can still compare it.
    clearance: !!config.navClearance,
    dest: null, // the point the current path was built FOR
    path: null, // [nodeId] remaining, path[0] = the node we are standing on
    reachable: true, // false = this is the best partial path, so stop at its end
    repathIn: 0,
    leg: null, // { from, to } — a jump in progress, resolved on landing
    commit: null, // { from, to, x } — the validated takeoff chosen for this edge
    attempts: {}, // edgeKey → failed jumps on that edge, not yet a ban
    banned: new Set(), // edgeKey — proven unflyable BY THIS AGENT; routed around
    blocked: false, // nowhere left to go: no route, and already at the best spot
  };
}

// This agent's route state, or null when it belongs to a world that has moved on.
//
// ONE validity rule, shared by every consumer, rather than a different rule in
// each. `routeRequest` and `holdPoint` hold the graph and check its full
// identity; `runtime.js` and `perception.js` read a verdict (`blocked`) or a leg
// without ever building one, and check the two things that can change under a
// caller with no graph in hand. A stale ledger must not remove a valid candidate,
// a stale `blocked` must not end a reposition, and a stale leg must not book a
// failed jump against a graph the jump was never attempted on.
export function navState(ent, scene, graph) {
  const nav = ent && ent.nav;
  if (!nav) return null;
  if (nav.gen !== (scene.navGen || 0)) return null;
  if (nav.clearance !== !!config.navClearance) return null;
  if (graph && nav.key !== graph.key) return null;
  return nav;
}

const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---- the frame --------------------------------------------------------------

// `dest` is a world point in CENTER space (that is what every caller resolves).
// Everything below works in body-LEFT-EDGE space, matching node spans, so the
// destination is converted once, here, and never again.
export function routeRequest(ent, dest, speed, scene, dt) {
  if (!dest) return null;
  // The graph FIRST, because its identity is what decides whether the route
  // state on the agent still describes the world it is standing in.
  const graph = navGraph(ent, scene, speed);
  if (!graph) return null;
  let nav = navState(ent, scene, graph);
  if (!nav) nav = ent.nav = newNav(scene, graph);

  const destX = dest.x - ent.w / 2;
  const destY = dest.y;

  // A destination that MOVED forces a fresh route — "recompute immediately",
  // which is the branch every chaser lives in.
  //
  // What does NOT reset here is the attempt count and the ban ledger. An edge
  // that cannot be flown is a fact about geometry and this body, not about where
  // the agent happens to be going; clearing it on every destination change means
  // a chaser following a moving target never accumulates three strikes and
  // throws itself at the same pillar forever (tech/agent-navigation.md N4).
  if (!nav.dest || dist2(destX, destY, nav.dest.x, nav.dest.y) > config.navArriveRadius ** 2) {
    nav.dest = { x: destX, y: destY };
    nav.path = null;
  }

  // ---- airborne: no repathing, only air control ---------------------------
  // Mid-jump the graph has nothing to say — the body is not on a node and the
  // arc is already committed. Steer toward where we mean to land; both grounded
  // bodies have full air control, which is the only reason a takeoff can be
  // approximate.
  if (!ent.onGround) {
    if (!nav.leg) return null;
    const to = graph.nodes[nav.leg.to];
    if (!to) return null;
    // `airborneAimX` is the shared rule (nav.js): close on the footprint edge
    // while still rising past it, then on the landing span. C2's predictor flies
    // the same rule, which is the only reason a predicted arc and a real one can
    // be compared at all.
    return drive(ent, airborneAimX(to, ent.x, ent.w, ent.y + ent.h), speed, dt);
  }

  // ---- grounded: resolve where we are -------------------------------------
  const here = nodeUnder(graph, ent.x, ent.y + ent.h);
  if (!here) {
    // MID STEP-OFF, and this is not an error state. Walking off a ledge means
    // deliberately leaving the node's span — and a span is where a body fits
    // WHOLLY on the platform, so `nodeUnder` stops recognising the body a body
    // width before it stops being supported. Handing back to straight-line
    // steering in that gap walks it right back on, and the agent paces the lip
    // forever. Keep driving at the lip we committed to.
    if (ent.onGround && nav.stepOff !== undefined) {
      if (Math.abs(nav.stepOff - ent.x) > 1) return drive(ent, nav.stepOff, speed, dt);
      // Arrived at the lip and STILL standing. The walk-off did not work,
      // because a node's span can end before its platform does: `buildNodes`
      // cuts a span where headroom runs out, so there is standable ground past
      // the node that is not a node. Pressing on would be leaning against thin
      // air forever. Give the agent back to straight-line steering.
      nav.stepOff = undefined;
    }
    // Otherwise: somewhere the graph genuinely does not model (a span too narrow
    // to be a node, a moving host, mid-slope). Straight-line steering.
    nav.leg = null;
    return null;
  }
  nav.stepOff = undefined; // back on a node: no walk-off is in progress

  // ---- resolve a jump that was in flight ----------------------------------
  // "The agent was traversing A→B and is now grounded somewhere that is not B."
  if (nav.leg) {
    const key = edgeKey(nav.leg.from, nav.leg.to);
    if (here.id === nav.leg.to) {
      delete nav.attempts[key]; // it worked; forget the near-misses
    } else {
      // Landed somewhere that is not where this edge goes. After enough of
      // those, retire the EDGE — not the destination. The graph tests a jump's
      // landing, not its arc, so it can offer an edge through a pillar or under
      // an overhang; the agent is the only thing that ever finds out. Banning
      // and rerouting is what lets it take the long way round, which is usually
      // there: the failing hop is often cheaper than a legal two-step, which is
      // exactly why Dijkstra picked it.
      nav.attempts[key] = (nav.attempts[key] || 0) + 1;
      if (nav.attempts[key] >= config.navJumpAttempts) {
        nav.banned.add(key);
        delete nav.attempts[key];
      }
    }
    nav.leg = null;
    nav.commit = null; // the takeoff was for that manoeuvre and it is over
    nav.path = null; // repath from wherever we actually landed
  }

  // ---- repath if the path is stale ----------------------------------------
  nav.repathIn -= dt;
  if (!nav.path || nav.path[0] !== here.id || nav.repathIn <= 0) {
    nav.repathIn = config.navRepathInterval;
    const goal = nearestNode(graph, destX, destY);
    let r = goal ? route(graph, here.id, goal.id, nav.banned) : null;
    nav.reachable = !!r;
    if (!r) {
      // Unreachable — or reachable only over an edge this body has proven it
      // cannot fly. Either way: go as close as the graph allows and stop.
      const partial = bestPartial(graph, here.id, destX, destY, nav.banned);
      r = partial ? route(graph, here.id, partial.id, nav.banned) : null;
    }
    nav.path = r ? r.path : null;
    // "Nowhere left to go": no route, and the best we can do is where we are.
    nav.blocked = !nav.reachable && (!nav.path || nav.path.length === 1);
  }
  if (!nav.path) return null; // no route at all — fall back to steering

  // ---- on the final node: approach the destination itself ------------------
  // Reachable or not, the move is the same: the closest standable point on this
  // node to where we were sent, then stop. "The far end of the best partial
  // path" is a POSITION, not a node — reading it as a node would park an agent
  // at its spawn whenever the destination is a ledge it cannot climb, since the
  // ground slab it is already standing on is the best partial path. Walking
  // underneath and stopping is the behaviour the design asks for.
  if (nav.path.length === 1) {
    // `settleX`, not a clamp into the span: the span's far end is the last
    // position the physics supports, and a body cannot HOLD it. A soldier reads
    // the sign of a drive request and crosses its target, so parking it on the
    // last supported pixel walks it off the ledge, and the reroute walks it
    // back — an agent orbiting a spot it had already arrived at (S2).
    const want = settleX(here, destX, ent.w);
    if (Math.abs(want - ent.x) <= config.navArriveRadius) return { kind: "stop" };
    return drive(ent, want, speed, dt);
  }

  // ---- otherwise: travel the next edge ------------------------------------
  const next = graph.nodes[nav.path[1]];
  const edge = graph.edges[here.id].find((e) => e.to === next.id);
  if (!edge) {
    nav.path = null; // the graph changed under us
    return null;
  }

  // A DROP means leaving this ledge, and that is not the same as lining up with
  // the node below. The node below is usually directly underneath and much wider
  // — the ground slab spans most of a level — so "head for its x" resolves to
  // the x the body is already standing on, and the agent waits on the lip
  // forever, fully supported, for a fall that needs a step it was never told to
  // take. Aim a body width PAST the lip instead; support ends partway there and
  // gravity finishes it.
  //
  // WHICH lip is decided by the two spans, never by where the body currently is.
  // A tie-break on `ent.x` looks reasonable and oscillates: the agent walks
  // toward the lip that answer picks, crosses the comparison point, the answer
  // flips, and it walks back — forever, on a correct path, a few pixels either
  // side of the pivot. Any input a movement decision reads must not be something
  // that movement changes.
  if (edge.kind === "drop") {
    const overL = next.a < here.a; // the destination reaches past our left end
    const overR = next.b > here.b; // ...and/or past our right end
    let right;
    if (overL && overR) right = destX >= (here.a + here.b) / 2; // either lip lands: go the way we are headed
    else if (overL) right = false; // only the left lip drops onto it
    else if (overR) right = true;
    // Neither: the destination sits entirely under this ledge and NO lip reaches
    // it — the graph offered an edge whose fall it does not model. Take the
    // nearer lip; landing elsewhere repaths, which is the honest response.
    else right = Math.abs(here.b - ent.x) < Math.abs(here.a - ent.x);
    // Remember the lip we committed to, so the frames after `nodeUnder` stops
    // recognising us keep heading for it. NOT a `leg`: a leg is resolved on the
    // next grounded frame, and a walk-off takes many grounded frames, so every
    // one of them would be booked as a failed attempt and three would ban a
    // perfectly good edge.
    // A body width past the span's end. Since S2 the span already reaches the
    // platform's edge, so anything past it does; a body width is simply far
    // enough that the request is at full speed rather than a crawl.
    const toX = right ? here.b + ent.w : here.a - ent.w;
    nav.stepOff = toX;
    return drive(ent, toX, speed, dt);
  }
  // A walk is a step onto a touching span at the same height. Same trap in
  // miniature: if the spans overlap, the nearest point on the destination can be
  // where we already are. Aim at its far end so the request always moves us.
  if (edge.kind === "walk") {
    const toX = landingX(next, ent.x);
    return drive(ent, Math.abs(toX - ent.x) < 1 ? (next.a >= here.a ? next.b : next.a) : toX, speed, dt);
  }

  const up = edge.kind === "jump";
  const lip = takeoffFor(nav, here, next, edge, ent, up);
  // How close counts as "at the takeoff". With clearance the lip is a takeoff
  // the predictor FLEW, and the window has to align to it or it authorizes a
  // launch from an x nothing tested — 12px of tolerance is 12px of untested arc
  // past a column. One frame of travel is the honest number: a legged body
  // arrives exactly, and a soldier body (which acts on the sign of the request,
  // not its magnitude) crosses its target in steps no larger than that, so one
  // straddling frame is always inside it. The predictor validates the same band.
  const window = edge.takeoffs
    ? Math.min(config.navTakeoffWindow, takeoffTolerance(graph.profile))
    : config.navTakeoffWindow;
  if (Math.abs(lip - ent.x) > window) return drive(ent, lip, speed, dt);
  // The takeoff window is a tolerance on ARRIVING at the lip, and for an up-edge
  // it must not become a licence to jump from under the destination: at the
  // default 12px a body can commit while still overlapping the platform it means
  // to land on, rise into its underside, and book a failure it was never given a
  // chance to avoid.
  //
  // Only insist when a clear takeoff actually exists. Where `takeoffX` found no
  // standable side it returns an unclear lip deliberately, so that the attempt
  // happens and the cap retires the edge — refusing to jump there would drive
  // the body at a lip it is already standing on, forever, and it would never
  // learn the edge is a lie.
  if (up && footprintClear(lip, next, ent.w) && !footprintClear(ent.x, next, ent.w)) {
    return drive(ent, lip, speed, dt);
  }

  // At the takeoff. Commit: the hop flag is the whole point of the slice.
  //
  // Climbing, hold the takeoff column on this frame rather than heading for the
  // landing point. We are standing clear of the destination precisely because
  // the guard above insisted; steering at the landing point would walk straight
  // back under it for the one frame before the airborne branch takes over.
  nav.leg = { from: here.id, to: next.id };
  const req = up ? { kind: "driveX", v: 0 } : drive(ent, landingX(next, ent.x), speed, dt);
  req.hop = true;
  return req;
}

// The takeoff this body is walking to for the edge here→next.
//
// Without clearance the edge has no validated takeoffs and this is `takeoffX`
// fresh every frame, exactly as before C2. With clearance the edge carries the
// takeoffs the predictor accepted, and the choice among them is made ONCE and
// held: recomputing from the current position would let an approach that crossed
// the midpoint between two clear sides switch to the side it is now nearer,
// which is a side the body has been walking away from and — more to the point —
// a different arc from the one that was tested. The commitment is keyed by the
// edge, so a repath onto a different edge simply replaces it.
//
// Since S4 a takeoff also carries WHICH WAY the body has to be travelling when
// it launches, and heading for one it will reach from the wrong side is heading
// for an arc nothing tested. Walking to a takeoff is what decides the direction,
// so the direction is simply which side of us it is on.
function takeoffFor(nav, here, next, edge, ent, up) {
  if (!edge.takeoffs) return takeoffX(here, next, ent.x, ent.w, up);
  const c = nav.commit;
  if (c && c.from === here.id && c.to === next.id) return c.x;
  let best = null;
  for (const t of edge.takeoffs) {
    if (!t.dirs.includes(t.x >= ent.x ? 1 : -1)) continue;
    if (best === null || Math.abs(t.x - ent.x) < Math.abs(best - ent.x)) best = t.x;
  }
  // Nothing on this edge is flyable from the side we are on. The same answer
  // `takeoffX` gives when no clear side exists: go anyway, so the attempt
  // happens and the cap retires the edge, rather than leaning on a lip forever.
  if (best === null) best = edge.takeoffs[0].x;
  nav.commit = { from: here.id, to: next.id, x: best };
  return best;
}

// Full-speed horizontal toward a left-edge x, or a halt once there — driveX
// rather than steer, because a legged `steer` scales horizontal speed by the
// normalized direction and crawls when its point is far above. The magnitude is
// `driveV` in nav.js, shared with the clearance predictor.
function drive(ent, toX, speed, dt) {
  return { kind: "driveX", v: driveV(toX - ent.x, speed, dt) };
}

// ---- band resolver (tech/ranged-repositioning.md, R1) -----------------------

// Abandon the route WITHOUT forgetting what the body has learned.
//
// A caller that stops driving an agent mid-manoeuvre must say so. The follower
// resolves a jump on the first GROUNDED frame after takeoff, so a leg left
// pending while some other controller flies the landing gets booked as a failed
// attempt on an edge that was never attempted — three of those and a perfectly
// good edge is banned. Clearing `leg`/`path` drops the manoeuvre; `attempts` and
// `banned` survive, because an unflyable edge is a fact about geometry and this
// body and does not stop being true because the agent changed its mind.
export function abortRoute(ent) {
  if (!ent.nav) return;
  ent.nav.leg = null;
  ent.nav.commit = null; // the takeoff belonged to the manoeuvre being dropped
  ent.nav.path = null;
  ent.nav.dest = null;
}

// Turn a distance BAND into a place to stand.
//
// `routeRequest` moves a body to a point; a `keepDistance` agent has no point,
// only `holdRange { point, min, max }`. This is the missing half: among the nodes
// this body can actually reach, the cheapest one offering a standing position
// that is inside the band AND has line of sight to the target.
//
// Three hard filters — reachable, in band, can see — and one tiebreak, least
// time. No weights: no elevation term, no ally spacing, no line of shot. That is
// idea/advanced-agent-navigation.md's destination scoring and it replaces this
// outright when it lands.
//
// `see(x, y)` is INJECTED, not imported: perception.js already imports this
// module for navSense, so the sight test arrives from the call site that owns
// both. Returns a world point in CENTRE space — what routeRequest consumes —
// or null, which means "nothing better exists; hold distance where you are".
export function holdPoint(ent, scene, speed, tp, min, max, see) {
  if (!config.navReposition) return null;
  if (!ent.onGround) return null; // "where I could stand" needs a node to stand on
  const graph = navGraph(ent, scene, speed);
  if (!graph) return null;
  const here = nodeUnder(graph, ent.x, ent.y + ent.h);
  if (!here) return null;

  // Route around edges this body has already proven it cannot fly, so a spot is
  // only offered if the follower can honestly be expected to deliver it. The
  // ledger is only valid against the graph it was learned on — a ban carried
  // over from another graph names an edge id that now means something else, and
  // would silently remove a perfectly good candidate.
  const nav = navState(ent, scene, graph);
  const { dist } = costsFrom(graph, here.id, nav ? nav.banned : null);

  let best = null;
  let bestCost = Infinity;
  for (const n of graph.nodes) {
    const c = dist[n.id];
    // Unreachable, or already beaten — checked BEFORE the sight test, which is
    // the expensive one (a segment against every platform, per candidate).
    if (!Number.isFinite(c) || c >= bestCost) continue;
    const p = standPoint(n, ent, tp, min, max, see);
    if (!p) continue;
    best = p;
    bestCost = c;
  }
  return best;
}

// Where on one node a body could stand to hold the band, or null.
//
// `holdRange` measures centre-to-centre in TWO dimensions, so a node's height
// spends part of the band budget before any horizontal distance is covered: a
// perch 300px above a target with max 340 has only 160px of horizontal room, and
// a node further above than `max` cannot hold the band at any x. Solving for the
// horizontal half of that gives two intervals — one either side of the target —
// which are then clipped to the span the body actually fits on.
function standPoint(n, ent, tp, min, max, see) {
  const cyN = n.y - ent.h / 2; // a body standing here has its CENTRE at this y
  const dy = cyN - tp.y;
  const far = max * max - dy * dy;
  if (far <= 0) return null; // too far above/below to be in band at any x
  const hi = Math.sqrt(far);
  const lo = Math.sqrt(Math.max(0, min * min - dy * dy));
  // node spans are body-LEFT-EDGE; the band and the sight test are both centre
  const spanLo = n.a + ent.w / 2;
  const spanHi = n.b + ent.w / 2;
  const cxE = ent.x + ent.w / 2;

  const sides = [[tp.x - hi, tp.x - lo], [tp.x + lo, tp.x + hi]];
  // Prefer the side of the target the agent is already on — with nothing to
  // choose between two equally cheap spots, not crossing the target is the less
  // surprising answer, and it keeps the choice deterministic.
  if (Math.abs(cxE - (tp.x + lo)) < Math.abs(cxE - (tp.x - lo))) sides.reverse();

  for (const [s, e] of sides) {
    const a = Math.max(s, spanLo);
    const b = Math.min(e, spanHi);
    if (a > b) continue;
    // Sight varies along the interval, so test more than one point: where the
    // agent would arrive with the least walking, then each end of the band —
    // hugging `min` and hugging `max` see past different corners. Three probes,
    // not a tunable sample count: they are the positions that mean something.
    for (const x of [clamp(cxE, a, b), a, b]) {
      if (see(x, cyN)) return { x, y: cyN };
    }
  }
  return null;
}

// ---- observability ---------------------------------------------------------

// What perception publishes as sense.*. Read by the Behavior Lab's overlays and
// available to authored `when` expressions — an enemy can legitimately want to
// know that it cannot get to you.
//
// Route state from a graph that no longer applies reads as NO route rather than
// as the old one. "I gave up" is a verdict about terrain, and terrain that has
// moved has not been given up on yet.
export function navSense(ent, scene) {
  const nav = navState(ent, scene);
  return {
    routeSteps: nav && nav.path ? nav.path.length - 1 : 0,
    routeReachable: nav ? nav.reachable && !nav.blocked : true,
    navBlocked: !!(nav && nav.blocked),
  };
}
