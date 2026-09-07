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

export function buildEdges(nodes, profile) {
  const edges = nodes.map(() => []);
  for (const na of nodes) {
    for (const nb of nodes) {
      if (na === nb) continue;
      const link = linkBetween(na, nb, profile);
      if (link) edges[na.id].push(link);
    }
  }
  return edges;
}

export function buildGraph(platforms, profile) {
  const nodes = buildNodes(platforms, profile);
  return { nodes, edges: buildEdges(nodes, profile), profile };
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
