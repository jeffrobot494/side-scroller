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

// Least-time route. Dijkstra with a linear scan: graphs are tens of nodes, so a
// heap would be more code for no measurable gain.
// Returns { path: [nodeId], cost } or null when `toId` is not reachable.
export function route(graph, fromId, toId) {
  const { dist, prev } = costsFrom(graph, fromId);
  if (!Number.isFinite(dist[toId])) return null;
  const path = [];
  for (let at = toId; at !== -1; at = prev[at]) path.push(at);
  path.reverse();
  return { path, cost: dist[toId] };
}

// Shortest-time distance to every node, plus the tree that produced it. N3's
// partial-path fallback ("get as close as you can") reads these directly.
export function costsFrom(graph, fromId) {
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
      const alt = dist[cur] + e.cost;
      if (alt < dist[e.to]) { dist[e.to] = alt; prev[e.to] = cur; }
    }
  }
  return { dist, prev };
}
