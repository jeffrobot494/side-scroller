// ---------------------------------------------------------------------------
// ROUTE FOLLOWING (tech/agent-navigation.md, Slice N3) — the mission-side half
// of navigation. `src/game/nav.js` is the graph MATH and stays pure; this is the
// adapter that knows about entities, scenes, config and locomotors:
//
//   profileFor(ent, scene, speed)  which body is walking, in nav.js's terms
//   graphFor(scene, profile)       one graph per profile, cached on the scene
//   routeRequest(ent, dest, ...)   the MotionRequest for this frame, or null
//
// `routeRequest` returns **null** to mean "I have nothing useful — do what you
// did before N3". Off the graph, mid-fall, no platforms, flying, disabled: the
// caller falls back to straight-line steering rather than freezing. That is the
// fallback discipline in CLAUDE.md, and it is why routing could be switched on
// for the whole roster at once.
//
// The jump comes from HERE, not from the brain and not from the locomotor: the
// router knows the next edge is a jump edge and that the body is standing at its
// takeoff, which is exactly the knowledge required and is knowledge no other
// layer has. See "Who decides to jump" in the spec.
// ---------------------------------------------------------------------------

import { bodyProfile, profileKey, buildGraph, nodeUnder, nearestNode, route, bestPartial } from "../game/nav.js";
import { bodyJump } from "./locomotion.js";
import { config } from "../game/config.js";

// ---- profiles + graph cache ----------------------------------------------

// The envelope triple for THIS body. The soldier branch is not a special case
// so much as an honest one: a companion's `body.*` fields are decoration,
// because SOLDIER never integrates the body — `Soldier.applyMovement` jumps with
// config.jumpSpeed and the mission steps it under unscaled world gravity. Build
// a legged profile for it and you get maxRise 110.6 where the truth is 129.6:
// climbs it can make, refused. (validate.js rejects the fields outright so an
// author never believes otherwise; this is the same fact on the reading side.)
export function profileFor(ent, scene, speed) {
  const b = ent.spec.body;
  const world = scene.world.gravity;
  if (b.locomotor === "soldier") {
    return bodyProfile({ w: b.w, h: b.h, gravity: world, jumpSpeed: config.jumpSpeed, runSpeed: config.runSpeed });
  }
  return bodyProfile({ w: b.w, h: b.h, gravity: world * b.gravity, jumpSpeed: bodyJump(ent), runSpeed: speed });
}

// One graph per distinct profile, built lazily and held on the scene. There is
// no per-mission hook to build them from — `scene.platforms` is assembled at
// four unrelated sites — so first use is the trigger. Terrain does not move
// during a mission; the Behavior Lab's platform dragging is what invalidate()
// is for.
export function graphFor(scene, profile) {
  if (!scene.navGraphs) scene.navGraphs = new Map();
  const key = profileKey(profile);
  let g = scene.navGraphs.get(key);
  if (!g) {
    g = buildGraph(scene.platforms, profile);
    scene.navGraphs.set(key, g);
  }
  return g;
}

export function invalidateNavGraphs(scene) {
  scene.navGraphs = null;
}

// ---- per-agent route state -----------------------------------------------

function newNav() {
  return {
    dest: null, // the point the current path was built FOR
    path: null, // [nodeId] remaining, path[0] = the node we are standing on
    reachable: true, // false = this is the best partial path, so stop at its end
    repathIn: 0,
    leg: null, // { from, to } — a jump in progress, resolved on landing
    attempts: {}, // "from->to" → failed jumps on that edge
    blocked: false, // the cap fired: destination declared unreachable
  };
}

const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

// Where on `from`'s span a body should stand to attempt the edge to `to`.
//
// For a jump UP this is not simply "the closest point": platforms are solid from
// below (`collideAxis` blocks upward passage), so taking off from under the
// destination drives the body's head into its underside and it never rises. The
// takeoff must clear the destination platform's footprint entirely — stand just
// beside it and use air control to drift on. `w` is the body width, which is
// exactly how far outside the footprint "beside it" is.
//
// The graph does not model this: `gapBetween` reports 0 for overlapping spans,
// so an edge can exist whose real takeoff needs `w` px of horizontal budget the
// link test never charged for. Where that budget is not there the jump fails,
// and the attempt cap is what notices. Recorded in the spec's Approximations.
function takeoffX(from, to, x, w, up) {
  // The ordinary answer: the closest point on this node to the destination.
  let lip;
  if (to.a > from.b) lip = from.b; // destination is to the right — right lip
  else if (to.b < from.a) lip = from.a; // to the left — left lip
  else lip = clamp(x, Math.max(from.a, to.a), Math.min(from.b, to.b));
  if (!up) return lip;

  // Jumping up, the lip is only usable if the body is clear of the destination
  // platform's footprint, which in left-edge space runs (to.a - w, to.b + w).
  // A takeoff inside it is a takeoff underneath, and the body rises into solid
  // platform. When the destination is off to one side the lip is already clear
  // and this changes nothing.
  const left = to.a - w;
  const right = to.b + w;
  if (lip <= left || lip >= right) return lip;
  const okLeft = left >= from.a && left <= from.b;
  const okRight = right >= from.a && right <= from.b;
  if (okLeft && okRight) return Math.abs(left - x) <= Math.abs(right - x) ? left : right;
  if (okLeft) return left;
  if (okRight) return right;
  // Neither side is standable on this node — there is no takeoff here that
  // works. Try the lip anyway; the bonk is a failed attempt and the cap retires
  // the edge, which is the designed response to a jump that cannot be made.
  return lip;
}

// The nearest standable x on a node, in body-left-edge space.
function landingX(node, x) {
  return clamp(x, node.a, node.b);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---- the frame --------------------------------------------------------------

// `dest` is a world point in CENTER space (that is what every caller resolves).
// Everything below works in body-LEFT-EDGE space, matching node spans, so the
// destination is converted once, here, and never again.
export function routeRequest(ent, dest, speed, scene, dt) {
  if (!config.navEnabled || !dest) return null;
  const b = ent.spec.body;
  if (b.gravity === 0) return null; // flyers move in two dimensions already
  if (!scene.platforms || !scene.platforms.length) return null;

  const nav = ent.nav || (ent.nav = newNav());
  const graph = graphFor(scene, profileFor(ent, scene, speed));
  if (!graph.nodes.length) return null;

  const destX = dest.x - ent.w / 2;
  const destY = dest.y;

  // A destination that MOVED invalidates everything, including a give-up: the
  // agent gave up on a point, not on the world. Chasers repath constantly
  // through this branch, which is what "recompute immediately" means.
  if (!nav.dest || dist2(destX, destY, nav.dest.x, nav.dest.y) > config.navArriveRadius ** 2) {
    nav.dest = { x: destX, y: destY };
    nav.path = null;
    nav.blocked = false;
    nav.attempts = {};
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
    // Climbing: while the feet are still below the destination surface, close on
    // it but stop at the edge of its footprint. Entering early means hitting the
    // platform's SIDE, which is solid, and the jump reads as a failed attempt.
    // Holding position instead would be simpler and worse — it spends the whole
    // rise standing still, and the graph's horizontal budget is priced from
    // takeoff, not from the apex. Approaching the edge keeps that budget.
    if (to.y < ent.y + ent.h) {
      const lo = to.a - ent.w;
      const hi = to.b + ent.w;
      return drive(ent, ent.x < (lo + hi) / 2 ? lo : hi, speed);
    }
    return drive(ent, landingX(to, ent.x), speed);
  }

  // ---- grounded: resolve where we are -------------------------------------
  const here = nodeUnder(graph, ent.x, ent.y + ent.h);
  if (!here) {
    // Standing somewhere the graph does not model (a span too narrow to be a
    // node, a moving host, mid-slope). Hand back to straight-line steering.
    nav.leg = null;
    return null;
  }

  // ---- resolve a jump that was in flight ----------------------------------
  // "The agent was traversing A→B and is now grounded somewhere that is not B."
  if (nav.leg) {
    const key = `${nav.leg.from}->${nav.leg.to}`;
    if (here.id === nav.leg.to) {
      delete nav.attempts[key]; // it worked; forget the near-misses
    } else {
      nav.attempts[key] = (nav.attempts[key] || 0) + 1;
      if (nav.attempts[key] >= config.navJumpAttempts) nav.blocked = true;
    }
    nav.leg = null;
    nav.path = null; // repath from wherever we actually landed
  }

  // ---- repath if the path is stale ----------------------------------------
  // A blocked agent stops routing but does not freeze on the spot: it holds a
  // one-node path, so the branch below still walks it to the closest point on
  // the node it is standing on. Giving up on a jump is not a reason to give up
  // on the ground.
  nav.repathIn -= dt;
  if (nav.blocked) {
    nav.path = [here.id];
  } else if (!nav.path || nav.path[0] !== here.id || nav.repathIn <= 0) {
    nav.repathIn = config.navRepathInterval;
    const goal = nearestNode(graph, destX, destY);
    let r = goal ? route(graph, here.id, goal.id) : null;
    if (!r) {
      // Unreachable: go as close as the graph allows and stop there.
      const partial = bestPartial(graph, here.id, destX, destY);
      r = partial ? route(graph, here.id, partial.id) : null;
      nav.reachable = false;
    } else {
      nav.reachable = true;
    }
    nav.path = r ? r.path : null;
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
    const want = clamp(destX, here.a, here.b);
    if (Math.abs(want - ent.x) <= config.navArriveRadius) return { kind: "stop" };
    return drive(ent, want, speed);
  }

  // ---- otherwise: travel the next edge ------------------------------------
  const next = graph.nodes[nav.path[1]];
  const edge = graph.edges[here.id].find((e) => e.to === next.id);
  if (!edge) {
    nav.path = null; // the graph changed under us
    return null;
  }

  // A walk or a drop needs no decision: head for the destination span and let
  // the ledge do the rest. Only a jump has a moment that must be timed.
  if (edge.kind === "walk" || edge.kind === "drop") return drive(ent, landingX(next, ent.x), speed);

  const lip = takeoffX(here, next, ent.x, ent.w, edge.kind === "jump");
  if (Math.abs(lip - ent.x) > config.navTakeoffWindow) return drive(ent, lip, speed);

  // At the takeoff. Commit: the hop flag is the whole point of the slice.
  nav.leg = { from: here.id, to: next.id };
  const req = drive(ent, landingX(next, ent.x), speed);
  req.hop = true;
  return req;
}

// Full-speed horizontal toward a left-edge x, or a halt once inside the arrival
// radius — driveX rather than steer, because a legged `steer` scales horizontal
// speed by the normalized direction and crawls when its point is far above.
function drive(ent, toX, speed) {
  const dx = toX - ent.x;
  if (Math.abs(dx) <= 1) return { kind: "driveX", v: 0 };
  return { kind: "driveX", v: (dx > 0 ? 1 : -1) * speed };
}

// ---- observability ---------------------------------------------------------

// What perception publishes as sense.*. Read by the Behavior Lab's overlays and
// available to authored `when` expressions — an enemy can legitimately want to
// know that it cannot get to you.
export function navSense(ent) {
  const nav = ent.nav;
  return {
    routeSteps: nav && nav.path ? nav.path.length - 1 : 0,
    routeReachable: nav ? nav.reachable && !nav.blocked : true,
    navBlocked: !!(nav && nav.blocked),
  };
}
