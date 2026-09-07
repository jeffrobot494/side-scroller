// ---------------------------------------------------------------------------
// NAV GRAPH (tech/agent-navigation.md, Slice N1) — where a body can stand, and
// what it costs to get from one standable place to another.
//
//   buildGraph(platforms, profile) -> { nodes, edges, profile }
//   route(graph, fromId, toId)     -> { path, cost } | null
//
// PURE DATA IN, PURE DATA OUT. No scene, no entities, no rendering, and nothing
// imported from src/mission/ — the body's dimensions and physics arrive as a
// profile argument, so this module is node-testable and generation-side. That is
// also why the graph is per-BODY: a node is a span where a specific body fits,
// so a 30x46 soldier and a 26x44 duelist do not share one.
//
// Geometry model (unchanged from the flood fill this replaces):
//   - a NODE is a standable span of one platform, in body-LEFT-EDGE space:
//     [x, x + w - bodyW], minus any span where a piece overhead leaves less
//     than the body's headroom.
//   - an EDGE is DIRECTED, because dropping off a ledge is one-way: platforms
//     are solid, so a route that plans "drop to C, climb back to A" plans a move
//     that does not exist.
//   - a COST is SECONDS. The design asks for least-time routing.
//
// The reachability test (does an edge exist at all) is deliberately identical to
// the flood fill in levelgen's auditGeometry, which now calls this module: same
// maxRise gate, same maxRunTo/flatReach budget, same gap measure. N1 is a
// behaviour-preserving refactor — test/levelgen.golden.json is what proves it.
// Costs are new; nothing reads them until N3.
//
// SINCE C2 THE TWO CALLERS NO LONGER GET THE SAME EDGE SET, and the boundary is
// explicit rather than incidental: `buildGraph(platforms, profile, { clearance:
// true })` additionally FILTERS accepted hop and jump edges through a predictor
// that flies them (tech/nav-clearance.md). Only the mission adapter asks for
// that. `auditGeometry` calls this module with no options and keeps the legacy
// edge set exactly, so what generation promises a player has not changed — an
// agent is simply no longer told about jumps its body cannot make.
// ---------------------------------------------------------------------------

import { jumpEnvelope } from "./gen/reach.js";

// Body-fit epsilons, not tuning knobs — they describe when a body physically
// fits, so they are not config SCHEMA entries. Both carried over verbatim from
// auditGeometry.
const HEADROOM_MARGIN = 4; // clearance above the body needed to stand/walk
const MIN_SEGMENT = 6; // a span narrower than this is not worth standing on

// ---- profiles -------------------------------------------------------------

// A body profile is everything the graph needs to know about who is walking:
// its box and its physics. `envelope` is the reachability math (maxRise,
// flatReach, maxRunTo) derived from the same triple generation already uses.
export function bodyProfile({ w, h, gravity, jumpSpeed, runSpeed }) {
  return { w, h, gravity, jumpSpeed, runSpeed, envelope: jumpEnvelope({ gravity, jumpSpeed, runSpeed }) };
}

// Stable identity for caching: two bodies with the same box and physics share a
// graph. The roster collapses to a handful of these.
export function profileKey(p) {
  return `${p.w}x${p.h}@${p.gravity}/${p.jumpSpeed}/${p.runSpeed}`;
}

// ---- nodes ----------------------------------------------------------------

// Remove [lo, hi] from a list of [a, b] intervals.
function cutSegs(segs, lo, hi) {
  const out = [];
  for (const [a, b] of segs) {
    if (hi <= a || lo >= b) { out.push([a, b]); continue; }
    if (lo > a) out.push([a, lo]);
    if (hi < b) out.push([hi, b]);
  }
  return out;
}

// Standable spans, one platform at a time. `plat` holds the ORIGINAL platform
// object, not a copy — callers identify offenders by object identity.
export function buildNodes(platforms, profile) {
  const { w, h } = profile;
  const headroom = h + HEADROOM_MARGIN;
  const nodes = [];
  for (const p of platforms) {
    let segs = [[p.x, p.x + p.w - w]];
    for (const q of platforms) {
      if (q === p || q.y >= p.y) continue; // only pieces strictly above can block
      if (p.y - (q.y + q.h) >= headroom) continue; // clears the body: no cut
      segs = cutSegs(segs, q.x - w, q.x + q.w);
    }
    for (const [a, b] of segs) if (b - a >= MIN_SEGMENT) nodes.push({ id: nodes.length, plat: p, a, b, y: p.y });
  }
  return nodes;
}

// ---- edges ----------------------------------------------------------------

// Minimum horizontal separation between two spans (0 when they overlap).
function gapBetween(na, nb) {
  return Math.max(nb.a - na.b, na.a - nb.b, 0);
}

function kindOf(dh, gap) {
  if (dh > 0) return "jump"; // up onto something
  if (dh < 0) return "drop"; // off a ledge — one-way
  return gap > 0 ? "hop" : "walk";
}

// Seconds for the manoeuvre. Horizontal travel and airtime overlap (both bodies
// have full air control), so the cost is whichever binds, not their sum.
function costOf(dh, gap, profile) {
  const env = profile.envelope;
  const ground = gap / (profile.runSpeed || 1);
  if (dh > 0) {
    // Landing ON TOP happens at the LATER crossing of height dh — the same
    // instant maxRunTo() prices its horizontal budget against.
    const v = profile.jumpSpeed;
    const g = profile.gravity;
    const disc = v * v - 2 * g * dh;
    const tUp = disc <= 0 ? env.apexTime : (v - Math.sqrt(disc)) / g;
    return Math.max(env.airtime - tUp, ground);
  }
  // A drop is a walk-off, not a jump: fall time from rest, not airtime. The
  // REACHABILITY budget still treats it as a flat hop (see linkBetween) — that
  // approximation is documented in the spec; this is only the cost term.
  if (dh < 0) return Math.max(Math.sqrt((2 * -dh) / profile.gravity), ground);
  return gap > 0 ? Math.max(env.airtime, ground) : ground;
}

// One directed edge na -> nb, or null when the body cannot make that move.
// This test is the behaviour-preserving core: identical gates, identical order.
export function linkBetween(na, nb, profile) {
  const env = profile.envelope;
  const dh = na.y - nb.y; // > 0 = nb sits HIGHER (y grows downward)
  // Belt and braces, carried over verbatim: maxRunTo() returns -1 above maxRise
  // on its own, so this gate is redundant for dh > 0 and never true for dh <= 0.
  // Kept because N1 is behaviour-preserving, not a tidy-up.
  if (dh > env.maxRise) return null;
  const reach = dh > 0 ? env.maxRunTo(dh) : env.flatReach;
  if (reach < 0) return null;
  const gap = gapBetween(na, nb);
  if (gap > reach) return null;
  return { to: nb.id, kind: kindOf(dh, gap), cost: costOf(dh, gap, profile) };
}

export function buildEdges(nodes, profile, platforms, opts) {
  const clearance = !!(opts && opts.clearance);
  // The seam, stated loudly rather than silently approximated. `auditGeometry`
  // builds a profile of `{ w, h, envelope }` — a box and a reachability
  // envelope, and no physics at all — because reachability is all it needs. The
  // predictor integrates gravity and impulses, so that profile must never reach
  // it; a level's audit is not the place to discover the difference.
  if (clearance && !(profile.gravity > 0 && profile.jumpSpeed > 0 && profile.runSpeed > 0)) {
    throw new Error("nav: clearance needs a full body profile (gravity, jumpSpeed, runSpeed)");
  }
  const edges = nodes.map(() => []);
  for (const na of nodes) {
    for (const nb of nodes) {
      if (na === nb) continue;
      const link = linkBetween(na, nb, profile);
      if (!link) continue;
      // Clearance is a FILTER over accepted edges, never a second reachability
      // test: the cheap gates above decide what exists, and only then does the
      // predictor ask whether the body can actually fly it.
      if (clearance && (link.kind === "hop" || link.kind === "jump")) {
        const takeoffs = validTakeoffs(na, nb, profile, platforms, link.kind === "jump");
        if (!takeoffs.length) continue; // no clear manoeuvre: this edge is a lie
        link.takeoffs = takeoffs;
      }
      edges[na.id].push(link);
    }
  }
  return edges;
}

// `opts.clearance` turns on the C2 predictor. It is OPT-IN, and the caller that
// opts in is the mission adapter (src/mission/navigation.js); generation's audit
// calls this with no options and keeps the legacy builder exactly.
export function buildGraph(platforms, profile, opts) {
  const nodes = buildNodes(platforms, profile);
  return {
    nodes,
    edges: buildEdges(nodes, profile, platforms, opts),
    profile,
    key: graphKey(profile, opts),
  };
}

// The identity of a built graph: the body it was built for AND the policy it was
// built under. Held on the graph so a route, a committed takeoff or a ban ledger
// can be checked against the graph it was learned on, rather than only against
// the terrain generation (tech/nav-clearance.md, "Cache lifecycle").
export function graphKey(profile, opts) {
  return profileKey(profile) + (opts && opts.clearance ? "+clear" : "");
}

// ---- the manoeuvre (tech/nav-clearance.md, C1) -----------------------------
//
// How a body actually TRAVELS an edge: where it stands to take off, where it
// steers while airborne, and how fast it walks at a target. These were four
// private functions in src/mission/navigation.js, because until C1 only the
// follower needed them. C2's clearance predictor needs the same answers — it
// simulates the manoeuvre the follower will perform — and two implementations
// of "where does this body take off" is exactly how a predicted jump and a real
// jump come to disagree.
//
// They live HERE rather than there because this module is the pure one: no
// scene, no entity, no config. Spans, a body width and a speed go in; a number
// comes out. `navigation.js` supplies the entity's fields at the call site.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// The ordinary directed lip: the closest point on `from`'s span to `to`. `x` is
// only consulted when the two spans OVERLAP, where "closest" is underfoot.
export function lipToward(from, to, x) {
  if (to.a > from.b) return from.b; // destination is to the right — right lip
  if (to.b < from.a) return from.a; // to the left — left lip
  return clamp(x, Math.max(from.a, to.a), Math.min(from.b, to.b));
}

// The nearest standable x on a node, in body-left-edge space.
export function landingX(node, x) {
  return clamp(x, node.a, node.b);
}

// Is a body at left-edge `x` clear of `to`'s footprint? Platforms are solid from
// below, so a body standing anywhere in (to.a - w, to.b + w) that jumps drives
// its head into the underside and never rises.
export function footprintClear(x, to, w) {
  return x <= to.a - w || x >= to.b + w;
}

// The standable positions on `from` that clear `to`'s footprint, left then
// right. Both when both are available: an up-edge is not one-sided, and
// rejecting a usable far side because the near one is roofed is a route lost.
export function clearTakeoffs(from, to, w) {
  const out = [];
  const left = to.a - w;
  const right = to.b + w;
  if (left >= from.a && left <= from.b) out.push(left);
  if (right >= from.a && right <= from.b) out.push(right);
  return out;
}

// Where on `from`'s span a body should stand to attempt the edge to `to`.
//
// For a jump UP this is not simply "the closest point", for the reason
// footprintClear states: the takeoff must clear the destination platform
// entirely, and `w` is exactly how far outside "beside it" is.
//
// The graph does not model this: `gapBetween` reports 0 for overlapping spans,
// so an edge can exist whose real takeoff needs `w` px of horizontal budget the
// link test never charged for. Where that budget is not there the jump fails,
// and (without clearance) the attempt cap is what notices.
export function takeoffX(from, to, x, w, up) {
  const lip = lipToward(from, to, x);
  if (!up || footprintClear(lip, to, w)) return lip;
  const sides = clearTakeoffs(from, to, w);
  // Neither side is standable on this node — there is no takeoff here that
  // works. Return the lip anyway; without clearance the bonk is a failed attempt
  // and the cap retires the edge, which is the designed response to a jump that
  // cannot be made.
  if (!sides.length) return lip;
  if (sides.length === 1) return sides[0];
  return Math.abs(sides[0] - x) <= Math.abs(sides[1] - x) ? sides[0] : sides[1];
}

// Every takeoff worth TESTING for this edge, in a fixed order and with no
// reference to where any body currently is. `takeoffX` picks one of these for a
// body that is already standing somewhere; C2's predictor validates all of them.
//
// A hop's spans never overlap (gap > 0 is what makes it a hop), so its answer is
// the single directed lip. An up-edge offers the lip when the lip already clears
// the footprint, plus each standable clear side.
export function takeoffCandidates(from, to, w, up) {
  const lip = to.a > from.b ? from.b : to.b < from.a ? from.a : null;
  if (!up) return lip === null ? [] : [lip];
  const out = lip !== null && footprintClear(lip, to, w) ? [lip] : [];
  for (const s of clearTakeoffs(from, to, w)) if (!out.includes(s)) out.push(s);
  return out;
}

// Where an AIRBORNE body on a jump leg steers, in body-left-edge space.
//
// Climbing: while the feet are still below the destination surface, close on it
// but stop at the edge of its footprint. Entering early means hitting the
// platform's SIDE, which is solid. Holding position instead would be simpler and
// worse — it spends the whole rise standing still, and the graph's horizontal
// budget is priced from takeoff, not from the apex.
export function airborneAimX(to, x, w, feetY) {
  if (to.y < feetY) {
    const lo = to.a - w;
    const hi = to.b + w;
    return x < (lo + hi) / 2 ? lo : hi;
  }
  return landingX(to, x);
}

// Full-speed horizontal toward a left-edge target, signed, or 0 once there.
//
// Full speed while there is ground to cover, but never more than the distance
// that remains. A fixed deadband cannot work here: one frame at 210px/s is
// 3.5px, so anything smaller than a frame's travel makes the body oscillate
// around its target forever instead of settling on it. That jitter is ordinarily
// invisible and once was not — a body holding station at the edge of a
// platform's footprint kept stepping back UNDER it and rising into the underside,
// which the router then scored as a failed jump.
export function driveV(dx, speed, dt) {
  const step = dt > 0 ? Math.abs(dx) / dt : speed;
  const v = Math.min(speed, step);
  if (v < 1) return 0;
  return (dx > 0 ? 1 : -1) * v;
}

// ---- clearance (tech/nav-clearance.md, C2) ---------------------------------
//
// `linkBetween` tests where a jump LANDS, never where it goes. A column between
// two halves of a slab, a slab roofing a takeoff, an overhang over a perch: all
// of them leave an edge the graph believes in and no body can fly, and until C2
// the only thing that ever found out was the agent, three failed attempts later.
//
// The predictor closes that by FLYING the manoeuvre. It starts from a standable
// takeoff, applies the same hop/upward-jump rules the follower applies, steps
// the same physics the mission steps, and asks whether the body arrives on the
// destination span without touching anything else on the way. It is deliberately
// nominal — instantaneous horizontal drive, no residual velocity, no slow or
// knockback — which is the approximation the spec records and the attempt cap
// still backs.

// Numerical resolution, not tuning. PREDICT_STEP is the mission's own fixed
// step; SWEEP_MAX is how far the body may move between collision samples, and
// exists so a platform thinner than a frame's travel cannot be skipped between
// them. LAND_TOL is `nodeUnder`'s own tolerance — the runtime's answer to "am I
// standing on this node" — so the predictor accepts a landing on exactly the
// terms the follower will later recognise it on.
const PREDICT_STEP = 1 / 60;
const SWEEP_MAX = 4;
const LAND_TOL = 2;
const MAX_FALL = 1200; // terminal velocity, from src/mission/entities.js

// How far off its validated takeoff a body may commit and still be flying a
// tested arc: one frame of travel. A legged body arrives exactly (driveV caps at
// the distance remaining) but a SOLDIER body acts on the sign of the request and
// accelerates, so it crosses its target rather than settling on it — and
// consecutive positions differ by at most this, so one of the two straddling
// frames is always inside it. The follower uses it as its takeoff window and the
// predictor validates the whole band, so the window cannot authorize a launch
// from an x nothing tested.
export function takeoffTolerance(profile) {
  return profile.runSpeed * PREDICT_STEP;
}

// Which of this edge's candidate takeoffs a body can actually fly from. [] means
// the edge does not survive clearance.
function validTakeoffs(from, to, profile, platforms, up) {
  const out = [];
  for (const x of takeoffCandidates(from, to, profile.w, up)) {
    if (takeoffBand(from, to, profile, x, up).every((s) => flies(from, to, profile, platforms, s, up))) out.push(x);
  }
  return out;
}

// The positions the follower may actually commit from, for a takeoff at `x`.
//
// Not a symmetric band around the point: a body walks TOWARD its takeoff and
// commits on the first frame inside the window, so the only place it can be that
// is not the takeoff itself is short of it, on the side it came from. Testing
// the other side would reject good edges — for an upward jump the other side is
// inside the destination's footprint, which the follower's own takeoff guard
// refuses to launch from in the first place.
function takeoffBand(from, to, profile, x, up) {
  const away = (to.a + to.b) / 2 >= x ? -1 : 1;
  const early = clamp(x + away * takeoffTolerance(profile), from.a, from.b);
  if (early === x) return [x];
  if (up && !footprintClear(early, to, profile.w)) return [x];
  return [x, early];
}

// Everything solid that the flight could possibly touch. A spatial pre-filter,
// not the clearance test: the body box is still checked against each of these
// individually at every step. Without it a 20-platform level costs 20 overlap
// tests per sample, and the Lab rebuilds the whole graph on every pointer move.
function nearbyPlatforms(from, to, profile, platforms, x) {
  const env = profile.envelope;
  const lo = Math.min(x, to.a) - env.flatReach - profile.w;
  const hi = Math.max(x + profile.w, to.b + profile.w) + env.flatReach;
  const top = Math.min(from.y, to.y) - env.maxRise - profile.h;
  // `<=` on the bottom, not `<`: the destination's own surface sits exactly at
  // this line, and dropping the platform the body is trying to land on out of
  // its own flight check rejects every clear jump there is.
  const bottom = Math.max(from.y, to.y);
  return platforms.filter((p) => p.x < hi && p.x + p.w > lo && p.y <= bottom && p.y + p.h > top);
}

// Can this body leave `from` at left-edge `x` and arrive standing on `to`?
//
// The integration mirrors `stepActor` in src/mission/entities.js: gravity before
// motion, x resolved before y, strict overlap, and a landing only on a DOWNWARD
// contact with a platform top. Anything else the body touches — a column's side,
// a slab's underside, a platform that is not the destination — rejects this
// candidate, because that is a jump the follower would fly and fail.
function flies(from, to, profile, platforms, x, up) {
  const { w, h, gravity: g, runSpeed } = profile;
  const dt = PREDICT_STEP;
  const near = nearbyPlatforms(from, to, profile, platforms, x);
  const box = { x, y: from.y - h, w, h };
  let vy = -profile.jumpSpeed;
  // The takeoff frame is the follower's own: an upward jump requests zero
  // horizontal drive (it is standing clear of the destination precisely because
  // the takeoff guard insisted, and steering at the landing point would walk it
  // straight back under), a hop drives at its landing point.
  let vx = up ? 0 : driveV(landingX(to, x) - x, runSpeed, dt);

  // A hop returns to takeoff height at exactly `airtime` and an upward jump
  // lands sooner, so a flight still going after that has missed. Four frames of
  // slack for the landing sample itself.
  const maxFrames = Math.ceil(profile.envelope.airtime / dt) + 4;
  for (let f = 0; f < maxFrames; f++) {
    vy += g * dt;
    if (vy > MAX_FALL) vy = MAX_FALL;
    if (sweep(box, "x", vx * dt, near)) return false; // a side: solid either way
    const hit = sweep(box, "y", vy * dt, near);
    if (hit) return vy > 0 && landsOn(box, hit, to, h);
    vx = driveV(airborneAimX(to, box.x, w, box.y + h) - box.x, runSpeed, dt);
  }
  return false; // never came down anywhere: not a manoeuvre this body performs
}

// Advance one axis by `d` in samples no larger than SWEEP_MAX, stopping at the
// first that overlaps anything. Returns `{ hit, prev }` — the platforms
// overlapped and the axis position just before them — or null when the whole
// move is clear. Sampling rather than testing only the end point is what stops a
// thin platform being skipped between one frame and the next.
function sweep(box, axis, d, platforms) {
  const start = box[axis];
  const steps = Math.max(1, Math.ceil(Math.abs(d) / SWEEP_MAX));
  let prev = start;
  for (let i = 1; i <= steps; i++) {
    box[axis] = start + (d * i) / steps;
    const hit = platforms.filter((p) => boxHits(box, p));
    if (hit.length) return { hit, prev };
    prev = box[axis];
  }
  return null;
}

// Strict overlap, exactly as `overlaps` in entities.js: a body resting with its
// feet on a surface is touching it, not inside it.
function boxHits(b, p) {
  return b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y;
}

// A downward contact that leaves the body standing on the destination span.
//
// Every platform in contact must be met from ABOVE. That is what keeps a seam
// between two flush platforms from reading as an obstruction: landing across the
// join touches both, and both are tops. One of them touched from the side or
// below is a real obstruction and rejects.
function landsOn(box, { hit, prev }, to, h) {
  let top = Infinity;
  for (const p of hit) {
    if (prev + h > p.y) return false; // the body was already past this surface
    if (p.y < top) top = p.y;
  }
  if (Math.abs(top - to.y) > LAND_TOL) return false; // came down on another level
  if (!hit.includes(to.plat)) return false; // ...or another platform entirely
  return box.x >= to.a - LAND_TOL && box.x <= to.b + LAND_TOL;
}

// ---- queries --------------------------------------------------------------

// Every node reachable from `startId`, following edge direction. This is what
// the generator's audit consumes.
export function reachableFrom(graph, startId) {
  const seen = new Set();
  if (startId === null || startId === undefined) return seen;
  seen.add(startId);
  const queue = [startId];
  while (queue.length) {
    const cur = queue.pop();
    for (const e of graph.edges[cur]) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      queue.push(e.to);
    }
  }
  return seen;
}

// The node whose span is closest to a world point, preferring one the point sits
// on or above — a click in mid-air resolves to the surface under it, which is
// what "nearest surface to the click" means in the design.
export function nearestNode(graph, x, y) {
  let best = null;
  let bestScore = Infinity;
  for (const n of graph.nodes) {
    const dx = x < n.a ? n.a - x : x > n.b ? x - n.b : 0;
    const dy = n.y - y;
    // below the point is preferred (you land on it); above costs more to reach
    const score = dx * dx + (dy >= 0 ? dy * dy : dy * dy * 4);
    if (score < bestScore) { bestScore = score; best = n; }
  }
  return best;
}

// The node a body is actually STANDING on, or null if it is between/above them.
// Distinct from nearestNode: that answers "which surface did the player mean",
// this answers "where am I on the graph". A route is only valid from a node the
// body genuinely occupies, so an airborne body must get null rather than a
// plausible guess — routing off a guess is how an agent commits to a takeoff it
// is not standing at. `x` is the body's LEFT edge, matching node span space.
export function nodeUnder(graph, x, feetY, tol = 2) {
  for (const n of graph.nodes) {
    if (Math.abs(n.y - feetY) > tol) continue;
    if (x >= n.a - tol && x <= n.b + tol) return n;
  }
  return null;
}

// "Get as close as you can, then stop" (design/agent-navigation.md). Among the
// nodes actually reachable from `fromId`, the one whose span comes closest to
// the destination point. Distance is measured to the SPAN, not its midpoint, so
// a long ledge running toward the target scores by its near end.
//
// Closest-in-space, not cheapest: the agent is being asked to approach something
// it cannot get to, and the honest reading of that is proximity. Least-time
// would pick whatever is quick to reach, which can be behind it.
export function bestPartial(graph, fromId, x, y, skip) {
  const { dist } = costsFrom(graph, fromId, skip);
  let best = null;
  let bestD = Infinity;
  for (const n of graph.nodes) {
    if (!Number.isFinite(dist[n.id])) continue;
    const dx = x < n.a ? n.a - x : x > n.b ? x - n.b : 0;
    const dy = n.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

// Least-time route. Dijkstra with a linear scan: graphs are tens of nodes, so a
// heap would be more code for no measurable gain.
// Returns { path: [nodeId], cost } or null when `toId` is not reachable.
//
// `skip` is an optional Set of "from->to" edge keys to route AROUND (N4). It is
// a per-CALLER exclusion, never a property of the graph: the graph is shared and
// cached per body profile, so one agent's failed jump must not become another
// agent's missing edge. Nothing generation-side passes it — `auditGeometry` uses
// reachableFrom, not this — so the audit cannot be affected by an agent's
// experience.
export function route(graph, fromId, toId, skip) {
  const { dist, prev } = costsFrom(graph, fromId, skip);
  if (!Number.isFinite(dist[toId])) return null;
  const path = [];
  for (let at = toId; at !== -1; at = prev[at]) path.push(at);
  path.reverse();
  return { path, cost: dist[toId] };
}

// Shortest-time distance to every node, plus the tree that produced it. N3's
// partial-path fallback ("get as close as you can") reads these directly.
export function costsFrom(graph, fromId, skip) {
  const n = graph.nodes.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  if (fromId === null || fromId === undefined) return { dist, prev };
  dist[fromId] = 0;
  for (;;) {
    let cur = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; cur = i; }
    if (cur === -1) break;
    done[cur] = true;
    for (const e of graph.edges[cur]) {
      if (skip && skip.has(edgeKey(cur, e.to))) continue; // N4: banned for this caller
      const alt = dist[cur] + e.cost;
      if (alt < dist[e.to]) { dist[e.to] = alt; prev[e.to] = cur; }
    }
  }
  return { dist, prev };
}

// The identity of a directed edge. One function so a ban recorded on a failed
// jump and a ban tested during routing can never disagree about spelling.
export function edgeKey(from, to) {
  return `${from}->${to}`;
}
