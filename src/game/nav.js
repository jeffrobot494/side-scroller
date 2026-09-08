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
// Geometry model:
//   - a NODE is a standable span of one SURFACE, in body-LEFT-EDGE space: every
//     position `collideAxis` supports, minus any span where a piece overhead
//     leaves less than the body's headroom.
//   - a SURFACE is every platform a body can walk across without leaving the
//     ground — co-planar tops whose supported extents meet. A column and the
//     slab butted against it are one place, not two with a gap in between.
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
// The supported extent is an OPEN interval: `overlaps` is strict, so a body
// whose right edge is exactly the platform's left edge is not supported. Spans
// are closed [a, b], so the endpoints come in by the smallest amount that keeps
// them inside it. NOT a settle margin — a body with a fraction of a pixel of
// foot on a ledge IS standing on it, and the design says it may (see "What
// standable has to mean" in tech/nav-clearance.md). Far below `driveV`'s own
// deadband of one frame's travel, so no follower can tell it is there.
const SUPPORT_EPS = 1e-6;

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

// The walkable surfaces in a platform list, for a body of width `w`.
//
// Two co-planar platforms are one surface when a body can be supported
// continuously across them — which is not "their edges touch" but "their
// supported extents overlap", i.e. the gap between them is narrower than the
// body. A 30px body bridges a 10px gap without ever losing the ground; at
// exactly 30 there is one position, the far edge of the left platform, that
// nothing holds up, and that is a real gap.
function surfaces(platforms, w) {
  const byTop = new Map(); // insertion order, so the ground stays first
  for (const p of platforms) {
    if (!byTop.has(p.y)) byTop.set(p.y, []);
    byTop.get(p.y).push(p);
  }
  const out = [];
  for (const [y, list] of byTop) {
    let cur = null;
    for (const p of [...list].sort((a, b) => a.x - b.x)) {
      if (cur && p.x - w < cur.hi) { // supported extents overlap: the same floor
        cur.plats.push(p);
        cur.hi = Math.max(cur.hi, p.x + p.w);
      } else {
        cur = { y, lo: p.x, hi: p.x + p.w, plats: [p] }; // sorted, so this is the leftmost
        out.push(cur);
      }
    }
  }
  return out;
}

// Standable spans, one surface at a time. `plats` holds the ORIGINAL platform
// objects, not copies — callers identify offenders by object identity.
//
// The span is every position `collideAxis` supports, which is any box overlap
// at all: a body with one foot on a ledge is standing on it. Requiring the body
// to fit WHOLLY on the platform is what this replaces, and it cost a body width
// at each end of every node (tech/nav-clearance.md, S2).
export function buildNodes(platforms, profile) {
  const { w, h } = profile;
  const headroom = h + HEADROOM_MARGIN;
  const nodes = [];
  for (const surf of surfaces(platforms, w)) {
    let segs = [[surf.lo - w + SUPPORT_EPS, surf.hi - SUPPORT_EPS]];
    for (const q of platforms) {
      if (q.y >= surf.y) continue; // only pieces strictly above can block, and co-planar ones are the surface
      if (surf.y - (q.y + q.h) >= headroom) continue; // clears the body: no cut
      segs = cutSegs(segs, q.x - w, q.x + q.w);
    }
    for (const [a, b] of segs) if (b - a >= MIN_SEGMENT) nodes.push({ id: nodes.length, plats: surf.plats, a, b, y: surf.y });
  }
  return nodes;
}

// ---- edges ----------------------------------------------------------------

// Minimum horizontal separation between two spans (0 when they overlap).
function gapBetween(na, nb) {
  return Math.max(nb.a - na.b, na.a - nb.b, 0);
}

// What is left of an edge's horizontal budget once the gap is paid for: how much
// further from the destination a body may start and still be inside the reach
// `linkBetween` priced the edge on. S3's run-up is bounded by it.
function reachSlack(na, nb, profile) {
  const dh = na.y - nb.y;
  const reach = dh > 0 ? profile.envelope.maxRunTo(dh) : profile.envelope.flatReach;
  return reach - gapBetween(na, nb);
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
        const takeoffs = validTakeoffs(na, nb, profile, platforms, link.kind === "jump", reachSlack(na, nb, profile));
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

// A node's SOLID x-extent — where its platform stops a body — as against `a`/`b`,
// which say where a body can STAND on it (tech/nav-clearance.md, S1). Two
// different questions, and today's span formula answers both with the same
// numbers: `a === p.x` and `b + w === p.x + p.w`, so every footprint test below
// could read the span, scaled by a body width, and be right.
//
// That coincidence holds only while a span is "where the body fits WHOLLY on the
// platform", which is the definition S2 replaces. Reading the platform makes the
// footprint tests independent of the span before it moves, and independent of
// the body: a platform's edge is where it is whoever is jumping at it.
export function solidLeft(node) {
  let lo = Infinity;
  for (const p of node.plats) if (p.x < lo) lo = p.x;
  return lo;
}

export function solidRight(node) {
  let hi = -Infinity;
  for (const p of node.plats) if (p.x + p.w > hi) hi = p.x + p.w;
  return hi;
}

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

// Where a body in the air aims to come DOWN on `node`, which is not the same
// question (tech/nav-clearance.md, S2). A body may STAND with a fraction of a
// pixel of foot on a ledge — the design says it may — but steering at the last
// supported position is steering at a target that narrow, and `driveV`'s
// deadband means it never arrives: it holds beside the surface and falls past.
//
// So aim at the nearest position that puts the whole body on the surface, and
// at the middle of what there is when the surface is narrower than the body.
// On anything at least a body wide this is exactly where the aim pointed before
// spans widened, which is why no landing moved.
export function settleX(node, x, w) {
  const lo = solidLeft(node);
  const hi = solidRight(node) - w;
  return landingX(node, lo <= hi ? clamp(x, lo, hi) : (lo + hi) / 2);
}

// Is a body at left-edge `x` clear of `to`'s footprint? Platforms are solid from
// below, so a body standing anywhere under the destination that jumps drives its
// head into the underside and never rises. Clear means wholly to one side of it:
// right edge at or before its left, or left edge at or after its right.
export function footprintClear(x, to, w) {
  return x <= solidLeft(to) - w || x >= solidRight(to);
}

// The standable positions on `from` that clear `to`'s footprint, left then
// right. Both when both are available: an up-edge is not one-sided, and
// rejecting a usable far side because the near one is roofed is a route lost.
export function clearTakeoffs(from, to, w) {
  const out = [];
  const left = solidLeft(to) - w;
  const right = solidRight(to);
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
    const lo = solidLeft(to) - w;
    const hi = solidRight(to);
    return x < (lo + hi) / 2 ? lo : hi;
  }
  return settleX(to, x, w);
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

// Which of this edge's takeoffs a body can actually fly from. [] means the edge
// does not survive clearance.
//
// Two sets, tried in order, because a body should not walk backwards to make a
// jump it can make from where the route already takes it. The ordinary takeoffs
// are the ones beside the destination; only when NONE of them flies does the
// run-up come into it (tech/nav-clearance.md, S3).
function validTakeoffs(from, to, profile, platforms, up, slack) {
  const ok = (x) => takeoffBand(from, to, profile, x, up).every((s) => flies(from, to, profile, platforms, s, up));
  const out = takeoffCandidates(from, to, profile.w, up).filter(ok);
  if (out.length) return out;
  return runUpTakeoffs(from, to, profile, up, slack).filter(ok);
}

// How far back along its own surface a body may walk to find a takeoff, and how
// finely that run-up is sampled: two body widths, in thirds of one.
//
// Not tuning — a measured bound. Over 60 generated levels, 138 hop/jump edges
// that no ordinary takeoff can fly are flyable from somewhere else on the source
// surface, EVERY one of them further from the destination than the ordinary
// takeoff and none of them nearer. Two body widths back recovers 134 of the 138
// and 90px recovers one more; a third-of-a-body-width sample is what fits inside
// the narrowest window that works (28px in the case that motivated it).
const RUNUP_BACK = 2;
const RUNUP_STEPS = 6;

// Standable positions further from the destination than the ordinary takeoffs.
//
// What this buys is rise before arrival. A body flush against a block on its own
// floor jumps and drives at its landing point on the same frame, which walks it
// into the block's SIDE; from a run-up it is above the block by the time it gets
// there. The graph never charged for that distance — `slack` is what the edge's
// reach budget has left after the gap, and stepping back further than that is
// asking for ground the envelope does not grant.
//
// Stepping AWAY from a footprint-clear takeoff stays footprint-clear, so there
// is no clearance test here; running out of surface ends the ladder.
function runUpTakeoffs(from, to, profile, up, slack) {
  const w = profile.w;
  const mid = (to.a + to.b) / 2;
  const limit = Math.min(RUNUP_BACK * w, slack);
  const out = [];
  for (const c of takeoffCandidates(from, to, w, up)) {
    const dir = c <= mid ? -1 : 1;
    for (let k = 1; k <= RUNUP_STEPS; k++) {
      const d = ((k * RUNUP_BACK) / RUNUP_STEPS) * w;
      if (d > limit) break;
      const x = clamp(c + dir * d, from.a, from.b);
      if (x === c) break; // ran out of surface
      if (!out.includes(x)) out.push(x);
    }
  }
  return out;
}

// The positions the follower may actually commit from, for a takeoff at `x`.
//
// A body walks TOWARD its takeoff and commits on the first frame inside the
// window, so what has to be tested is the takeoff and one frame of travel to
// either side of it — whichever side the body came from. Both sides, because
// since S3 a takeoff need not be at the end of the span: a run-up takeoff is
// approached from the destination side by a body already standing at the lip,
// and from the far side by one walking in.
//
// For every ORDINARY takeoff exactly one side survives the two filters below and
// the band is what it was before S3: the far side of a hop's lip is off the span
// and clamps back onto it, and the near side of an upward jump's flanking
// takeoff is inside the destination's footprint, which the follower's own
// takeoff guard refuses to launch from.
function takeoffBand(from, to, profile, x, up) {
  const tol = takeoffTolerance(profile);
  const out = [x];
  for (const dir of [-1, 1]) {
    const s = clamp(x + dir * tol, from.a, from.b);
    if (s === x) continue; // off the span: the body cannot stand there
    if (up && !footprintClear(s, to, profile.w)) continue;
    out.push(s);
  }
  return out;
}

// Everything solid that the flight could possibly touch. A spatial pre-filter,
// not the clearance test: the body box is still checked against each of these
// individually at every step. Without it a 20-platform level costs 20 overlap
// tests per sample, and the Lab rebuilds the whole graph on every pointer move.
function nearbyPlatforms(from, to, profile, platforms, x) {
  const env = profile.envelope;
  const lo = Math.min(x, solidLeft(to)) - env.flatReach - profile.w;
  const hi = Math.max(x + profile.w, solidRight(to)) + env.flatReach;
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
  let vx = up ? 0 : driveV(settleX(to, x, w) - x, runSpeed, dt);

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
  if (!to.plats.some((p) => hit.includes(p))) return false; // ...or another surface entirely
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
