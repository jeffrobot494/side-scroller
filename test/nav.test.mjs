// ---------------------------------------------------------------------------
// NAV GRAPH (tech/agent-navigation.md, Slice N1).
//
// test/levelgen.golden.json pins the generator's OUTPUT, which catches a graph
// that becomes stricter (structures start getting culled, the level changes).
// It cannot catch a graph that becomes more PERMISSIVE: the generator builds
// correct-by-construction geometry, culledStructures is 0 in every golden case,
// and a 60-config sweep produces no culls anywhere — so there is no rejection
// to lose. The audit's decision boundary is therefore untested through the
// generator, and lives here instead, on hand-built geometry that SHOULD fail.
//
// Every case is authored against the player profile (30x46, gravity 2000,
// jumpSpeed 720, runSpeed 320) so the numbers below are checkable by hand:
//   maxRise 129.6   airtime 0.72s   flatReach 230.4   maxRunTo(120) 146.55
// ---------------------------------------------------------------------------

import {
  bodyProfile, profileKey, buildGraph, buildNodes, linkBetween,
  reachableFrom, route, costsFrom, nearestNode,
  lipToward, landingX, footprintClear, clearTakeoffs, takeoffX, takeoffCandidates, airborneAimX, driveV,
  solidLeft, solidRight,
} from "../src/game/nav.js";
import { stepActor } from "../src/mission/entities.js";

const SOLDIER = bodyProfile({ w: 30, h: 46, gravity: 2000, jumpSpeed: 720, runSpeed: 320 });
// a smaller body: 44 tall needs 48 of headroom where the soldier needs 50
const DUELIST = bodyProfile({ w: 26, h: 44, gravity: 2000, jumpSpeed: 720, runSpeed: 320 });

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ---- the integrator, asked directly (tech/nav-clearance.md, S0) ------------
//
// Everything else in this file asks nav.js what it believes. These two ask the
// PHYSICS. C1-C2 shipped green because every measurement behind them was taken
// through the graph's own model of where a body can stand, and a model cannot
// detect its own definition being wrong.

// Drop a real body at `x` and report where its feet come to rest, or null if it
// never lands. Straight down, so nothing but support is being measured.
function dropFeet(platforms, profile, x, fromY) {
  const a = { x, y: fromY, w: profile.w, h: profile.h, vx: 0, vy: 0, onGround: false };
  const world = { width: 1e6, gravity: profile.gravity };
  for (let i = 0; i < 240 && !a.onGround; i++) stepActor(a, 1 / 60, world, platforms);
  return a.onGround ? a.y + a.h : null;
}

// The integer positions stepActor actually supports at height `y`, over [from,
// to]. Whole pixels: `overlaps` is strict, so the real set is an open interval
// and its endpoints are not standable — 471..599 below means (470, 600).
function supportedAt(platforms, profile, y, from, to) {
  let lo = null;
  let hi = null;
  for (let x = from; x <= to; x++) {
    if (dropFeet(platforms, profile, x, y - profile.h - 60) !== y) continue;
    if (lo === null) lo = x;
    hi = x;
  }
  return [lo, hi];
}
const ground = (w = 1200) => ({ x: 0, y: 500, w, h: 40 });
const edgeTo = (graph, from, to) => graph.edges[from].find((e) => e.to === to) || null;

// A destination node exactly as buildNodes would make it: the span is where a
// body of width `w` fits wholly on the platform, and `plat` is the platform.
// The manoeuvre cases below used to hand-write the span alone, which was fine
// while the footprint tests derived the platform's edges from it (S1) and is a
// span no platform could produce as soon as they stop.
const nodeOn = (plat, w) => ({ id: 0, plat, a: plat.x, b: plat.x + plat.w - w, y: plat.y });

export default async function run(t) {
  // ---- envelope sanity: the numbers this file is authored against ---------
  const env = SOLDIER.envelope;
  t.ok(`envelope: maxRise 129.6 (got ${env.maxRise})`, near(env.maxRise, 129.6, 1e-9));
  t.ok(`envelope: flatReach 230.4 (got ${env.flatReach.toFixed(3)})`, near(env.flatReach, 230.4, 1e-9));

  // ---- S0: the span the graph builds, beside the surface the body has -----
  //
  // A CHARACTERIZATION, not a target. It records the gap as it is today so the
  // slices that close it are visible as this block changing; it does not assert
  // the gap away. `collideAxis` stands a body on a platform on ANY box overlap,
  // while `buildNodes` requires it to fit WHOLLY on one, so the model is short
  // by a body width at each end.
  {
    const g = ground(1200);
    const perch = { x: 500, y: 400, w: 100, h: 20 };
    const plats = [g, perch];

    const [plo, phi] = supportedAt(plats, SOLDIER, perch.y, 400, 700);
    t.ok(`S0: the physics supports 471..599 on a 100px perch (got ${plo}..${phi})`, plo === 471 && phi === 599);

    const span = buildNodes(plats, SOLDIER).find((n) => n.plat === perch);
    t.ok(`S0: the graph's span is 500..570 (got ${span.a}..${span.b})`, span.a === 500 && span.b === 570);
    t.ok("S0: the shortfall is exactly a body width at each end", span.a - (plo - 1) === SOLDIER.w && (phi + 1) - span.b === SOLDIER.w);

    const modelled = (span.b - span.a) / (phi - plo);
    t.ok(`S0: so the graph models 55% of the perch (${(modelled * 100).toFixed(0)}%)`, Math.round(modelled * 100) === 55);
  }
  {
    // Not a constant: the shortfall is a body width at each end whatever the
    // platform is, so it is ruinous on a perch and nearly free on a 1000px
    // slab. Perches are where climbing happens, which is why 55% is the number
    // that matters. (Held off the left wall — `stepActor` clamps x to the world,
    // so a slab at x 0 cannot show its left-hand loss.)
    const wide = { x: 100, y: 500, w: 1000, h: 40 };
    const [glo, ghi] = supportedAt([wide], SOLDIER, wide.y, 0, 1150);
    const span = buildNodes([wide], SOLDIER)[0];
    t.ok(`S0: the same body width at each end (${glo}..${ghi} vs ${span.a}..${span.b})`, span.a - (glo - 1) === SOLDIER.w && (ghi + 1) - span.b === SOLDIER.w);
    t.ok("S0: which on a 1000px slab is 94%, not 55%", Math.round(100 * (span.b - span.a) / (ghi - glo)) === 94);
  }
  {
    // The same fact, seen from the other side: a 40px column with a slab butted
    // against its top is ONE continuous floor at y 390. The body can stand
    // anywhere across the join. The graph sees two spans with 30px of nothing
    // between them, and `kindOf` calls that a hop — regression #2, and what S2
    // removes by making a node a surface rather than a rectangle.
    const g = ground(1200);
    g.y = 540;
    const col = { x: 300, y: 390, w: 40, h: 150 };
    const slab = { x: 340, y: 390, w: 200, h: 20 };
    const plats = [g, col, slab];

    const [lo, hi] = supportedAt(plats, SOLDIER, 390, 250, 600);
    t.ok(`S0: the physics supports one unbroken 271..539 across the join (got ${lo}..${hi})`, lo === 271 && hi === 539);

    const nodes = buildNodes(plats, SOLDIER).filter((n) => n.y === 390);
    t.eq("S0: the graph makes it two nodes", nodes.length, 2);
    t.ok(`S0: with a fake 30px gap over solid floor (${nodes[0].b} -> ${nodes[1].a})`, nodes[1].a - nodes[0].b === 30);
  }

  // ---- nodes -------------------------------------------------------------
  {
    const g = ground(1200);
    const nodes = buildNodes([g], SOLDIER);
    t.eq("node: a bare platform yields one span", nodes.length, 1);
    t.ok("node: span is in body-LEFT-EDGE space ([0, w - bodyW])", nodes[0].a === 0 && nodes[0].b === 1170);
    t.ok("node: carries the ORIGINAL platform object, not a copy", nodes[0].plat === g);
  }
  {
    // a ceiling 20px above the floor: nowhere near enough to stand under
    const g = ground(1200);
    const lid = { x: 300, y: 460, w: 100, h: 20 }; // clearance 500 - 480 = 20
    const nodes = buildNodes([g, lid], SOLDIER).filter((n) => n.plat === g);
    t.eq("node: a low ceiling splits the floor in two", nodes.length, 2);
    t.ok("node: the cut is [q.x - bodyW, q.x + q.w]", nodes[0].b === 270 && nodes[1].a === 400);
  }
  {
    // the same ceiling raised until it clears the body: no cut at all
    const g = ground(1200);
    const lid = { x: 300, y: 430, w: 100, h: 20 }; // clearance 500 - 450 = 50 = 46 + 4
    const nodes = buildNodes([g, lid], SOLDIER).filter((n) => n.plat === g);
    t.eq("node: clearance exactly at the margin does NOT cut", nodes.length, 1);
  }
  {
    // 49px of clearance: the soldier (needs 50) is blocked, a 44-tall body is not
    const g = ground(1200);
    const lid = { x: 300, y: 431, w: 100, h: 20 }; // clearance 49
    const forSoldier = buildNodes([g, lid], SOLDIER).filter((n) => n.plat === g);
    const forDuelist = buildNodes([g, lid], DUELIST).filter((n) => n.plat === g);
    t.eq("node: 49px clearance blocks a 46-tall body", forSoldier.length, 2);
    t.eq("node: the same gap passes a 44-tall body", forDuelist.length, 1);
    t.ok("profile: distinct bodies get distinct cache keys", profileKey(SOLDIER) !== profileKey(DUELIST));
  }
  {
    // narrower than the body plus the minimum span: not standable at all
    const tiny = { x: 0, y: 500, w: 34, h: 20 }; // span = 34 - 30 = 4 < MIN_SEGMENT 6
    t.eq("node: a span narrower than the body yields nothing", buildNodes([tiny], SOLDIER).length, 0);
  }

  // ---- the reject boundary: gaps ----------------------------------------
  // Two 200-wide slabs at the same height. Node spans are [x, x+170], so the
  // measured gap is (second.x - 170).
  {
    const pair = (x2) => buildGraph([{ x: 0, y: 500, w: 200, h: 40 }, { x: x2, y: 500, w: 200, h: 40 }], SOLDIER);
    const within = pair(370); // gap 200 <= flatReach 230.4
    const beyond = pair(430); // gap 260 >  flatReach 230.4
    t.ok("edge: a gap inside flatReach links", !!edgeTo(within, 0, 1));
    t.ok("edge: a gap beyond flatReach does NOT link", edgeTo(beyond, 0, 1) === null);
    t.eq("edge: a level gap is a hop", edgeTo(within, 0, 1).kind, "hop");
    // and the boundary itself, to the pixel
    const exact = pair(170 + 230); // gap 230 <= 230.4
    const over = pair(170 + 231); // gap 231 >  230.4
    t.ok("edge: gap 230 links, gap 231 does not", !!edgeTo(exact, 0, 1) && edgeTo(over, 0, 1) === null);
  }

  // ---- the reject boundary: height --------------------------------------
  {
    // a perch directly above the ground, so the horizontal budget is not what
    // decides it — only maxRise is.
    const perch = (dh) => buildGraph([ground(1200), { x: 200, y: 500 - dh, w: 200, h: 20 }], SOLDIER);
    const low = perch(120); // <= maxRise 129.6
    const high = perch(140); // >  maxRise 129.6
    t.ok("edge: a perch inside maxRise links upward", !!edgeTo(low, 0, 1));
    t.eq("edge: upward is a jump", edgeTo(low, 0, 1).kind, "jump");
    t.ok("edge: a perch above maxRise does NOT link upward", edgeTo(high, 0, 1) === null);

    // ...and the one-way rule: you can always come back down
    t.ok("edge: dropping off the too-high perch IS allowed", !!edgeTo(high, 1, 0));
    t.eq("edge: downward is a drop", edgeTo(high, 1, 0).kind, "drop");
    t.ok("edge: the pair is asymmetric — that is the point of a directed graph",
      edgeTo(high, 0, 1) === null && edgeTo(high, 1, 0) !== null);
  }
  {
    // horizontal budget SHRINKS with height: maxRunTo(120) is 146.55, well under
    // flatReach, so a gap legal on the flat is illegal onto a perch.
    const g = buildGraph([{ x: 0, y: 500, w: 200, h: 40 }, { x: 370, y: 380, w: 200, h: 20 }], SOLDIER);
    t.ok("edge: a 200px gap that is fine on the flat fails onto a 120px perch", edgeTo(g, 0, 1) === null);
  }

  // ---- costs are seconds, and monotonic ---------------------------------
  {
    const flat = (gap) => {
      const g = buildGraph([{ x: 0, y: 500, w: 200, h: 40 }, { x: 170 + gap, y: 500, w: 200, h: 40 }], SOLDIER);
      return edgeTo(g, 0, 1).cost;
    };
    // flatReach is DEFINED as runSpeed x airtime, so for any hop the graph
    // accepts, horizontal travel can never be the binding term — every legal
    // flat hop costs exactly one airtime, narrow or wide.
    t.ok("cost: a hop costs the airtime it spends", near(flat(10), 0.72, 1e-9));
    t.ok("cost: airtime binds at every legal width, so hops cost the same", near(flat(220), flat(10), 1e-9));

    const drop = (dh) => {
      const g = buildGraph([ground(1200), { x: 200, y: 500 - dh, w: 200, h: 20 }], SOLDIER);
      return edgeTo(g, 1, 0).cost;
    };
    t.ok("cost: a deeper drop takes longer to fall", drop(300) > drop(100));
    t.ok("cost: a 100px drop is ~0.316s of fall", near(drop(100), Math.sqrt(200 / 2000), 1e-9));
  }

  // ---- routing -----------------------------------------------------------
  {
    // three slabs in a line, each hop legal: 0 -> 1 -> 2
    const g = buildGraph([
      { x: 0, y: 500, w: 200, h: 40 },
      { x: 370, y: 500, w: 200, h: 40 },
      { x: 740, y: 500, w: 200, h: 40 },
    ], SOLDIER);
    const r = route(g, 0, 2);
    t.ok("route: finds a path across two hops", !!r);
    t.eq("route: the path is the chain", r.path, [0, 1, 2]);
    t.ok("route: starts at from and ends at to", r.path[0] === 0 && r.path[r.path.length - 1] === 2);
    t.ok(`route: costs two hops of airtime (${r.cost.toFixed(3)}s)`, near(r.cost, 1.44, 1e-9));
    t.ok("route: a node routes to itself at zero cost", route(g, 1, 1).cost === 0);
  }
  {
    // an island past flatReach in both directions
    const g = buildGraph([
      { x: 0, y: 500, w: 200, h: 40 },
      { x: 900, y: 500, w: 200, h: 40 },
    ], SOLDIER);
    t.ok("route: unreachable returns null, not a lie", route(g, 0, 1) === null);
    const { dist } = costsFrom(g, 0);
    t.ok("route: costsFrom marks it Infinity (N3's partial-path input)", !Number.isFinite(dist[1]));
    t.eq("reach: the flood fill agrees", reachableFrom(g, 0).size, 1);
  }
  {
    // a one-way pocket: drop in, cannot climb out
    const g = buildGraph([ground(1200), { x: 200, y: 500 - 140, w: 200, h: 20 }], SOLDIER);
    t.eq("reach: from the ground, the too-high perch is not reachable", reachableFrom(g, 0).has(1), false);
    t.eq("reach: from the perch, the ground is", reachableFrom(g, 1).has(0), true);
  }

  // ---- nearestNode -------------------------------------------------------
  {
    const g = buildGraph([ground(1200), { x: 400, y: 380, w: 200, h: 20 }], SOLDIER);
    const above = nearestNode(g, 500, 300); // in the air over the perch
    t.ok("nearest: a point in mid-air resolves to the surface beneath it", above.y === 380);
    const far = nearestNode(g, 50, 480); // just over the floor, left of the perch
    t.ok("nearest: a point over the floor resolves to the floor", far.y === 500);
  }

  // ---- the seam the generator depends on --------------------------------
  {
    // linkBetween is the single reachability test; the audit and the router MUST
    // share it, or generation can promise a level the runtime cannot walk.
    const nodes = buildNodes([{ x: 0, y: 500, w: 200, h: 40 }, { x: 370, y: 500, w: 200, h: 40 }], SOLDIER);
    t.ok("seam: linkBetween is directly callable on two nodes", !!linkBetween(nodes[0], nodes[1], SOLDIER));
  }

  // ---- clearance (tech/nav-clearance.md, C2) -----------------------------
  //
  // `linkBetween` tests where a jump LANDS. Clearance asks the other question —
  // whether the body's whole box can get there — by flying the manoeuvre against
  // the static terrain. Every case below is a pair: what the legacy builder says
  // and what the filtered builder says, so a case that stops meaning anything
  // (because the geometry no longer poses the question) fails rather than passes.
  //
  // The pair is `[0, 500, 200, 40]` and `[370, 500, 200, 40]`: spans [0,170] and
  // [370,540], a 200px gap against a 230.4 flatReach. Every obstacle goes in that
  // gap, and the soldier's arc through it peaks at box-top 324.4 (500 − 129.6 − 46).
  const HOP_A = { x: 0, y: 500, w: 200, h: 40 };
  const HOP_B = { x: 370, y: 500, w: 200, h: 40 };
  // The other shape: continuous ground and a 100px perch. Its span is [700,970],
  // so a 30-wide body's clear takeoffs are 670 and 1000.
  const GROUND = { x: 0, y: 500, w: 1400, h: 40 };
  const PERCH = { x: 700, y: 400, w: 300, h: 20 };

  // The edge from the node at (y, a) to the node at (y, a), or false. Null when
  // the geometry did not produce the nodes the case is about, which is a broken
  // case rather than a passing one.
  function edgeUnder(plats, profile, from, to, clearance) {
    const g = buildGraph(plats, profile, clearance ? { clearance: true } : undefined);
    const at = ([y, a]) => g.nodes.find((n) => n.y === y && Math.abs(n.a - a) < 0.5);
    const na = at(from);
    const nb = at(to);
    if (!na || !nb) return null;
    return g.edges[na.id].find((e) => e.to === nb.id) || false;
  }
  // "The legacy graph offers this edge, and the filtered one does not" — the
  // shape of every rejection case, stated once.
  const rejects = (name, plats, from, to, profile = SOLDIER) => {
    const legacy = edgeUnder(plats, profile, from, to, false);
    const filtered = edgeUnder(plats, profile, from, to, true);
    t.ok(`clearance: ${name} — offered without clearance`, !!legacy);
    t.eq(`clearance: ${name} — rejected with it`, filtered, false);
  };
  const accepts = (name, plats, from, to, profile = SOLDIER) => {
    const filtered = edgeUnder(plats, profile, from, to, true);
    t.ok(`clearance: ${name} — still offered`, !!filtered);
    return filtered;
  };

  {
    // Positives first, because over-pruning is the failure that would not
    // announce itself: an agent simply stops going places, and nothing errors.
    const flat = accepts("an unobstructed flat hop", [HOP_A, HOP_B], [500, 0], [500, 370]);
    t.eq("clearance: ...taking off from the directed lip", flat.takeoffs, [170]);
    const up = accepts("an unobstructed jump onto a perch", [GROUND, PERCH], [500, 0], [400, 700]);
    t.eq("clearance: ...from either clear side of its footprint", up.takeoffs, [670, 1000]);

    // A column in the gap is not on its own a reason to refuse the crossing —
    // the design says so in as many words. 40px tall, and the arc is 130 up.
    accepts("a hop over a low column", [HOP_A, HOP_B, { x: 270, y: 460, w: 20, h: 40 }], [500, 0], [500, 370]);
  }
  {
    // A 200px column: the body's whole box is inside it at the apex.
    rejects("a hop into a tall column", [HOP_A, HOP_B, { x: 270, y: 300, w: 20, h: 200 }], [500, 0], [500, 370]);
    // The same column 2px wide. A frame at 320px/s covers 5.33px, so an
    // end-of-frame test would step straight over this one; the swept sampling
    // inside each frame is what catches it. If this ever goes green-by-accident
    // the tall column above will not notice.
    rejects("a hop into a 2px column", [HOP_A, HOP_B, { x: 279, y: 300, w: 2, h: 200 }], [500, 0], [500, 370]);
    // A ceiling across the gap, which the arc rises into.
    rejects("a hop under a low ceiling", [HOP_A, HOP_B, { x: 150, y: 330, w: 300, h: 20 }], [500, 0], [500, 370]);
    // An overhang over the perch: the landing surface is well inside maxRise and
    // the body still cannot get to it, which is the addendum's second outcome.
    rejects("a jump under an overhang", [GROUND, PERCH, { x: 600, y: 320, w: 400, h: 20 }], [500, 0], [400, 700]);
  }
  {
    // DIRECTION. Clearance filters directed edges, so an up-edge it rejects
    // leaves the drop back down untouched — you can always come down the way you
    // could not go up. (A flat hop is near enough symmetric by construction: both
    // arcs cover the same span at the same heights, so an obstacle that blocks
    // one blocks the other. The asymmetry lives on up-edges, where the takeoff
    // must clear a footprint and the return is a fall.)
    const roofed = [GROUND, PERCH, { x: 600, y: 320, w: 400, h: 20 }];
    t.eq("clearance: the blocked climb is gone", edgeUnder(roofed, SOLDIER, [500, 0], [400, 700], true), false);
    const down = edgeUnder(roofed, SOLDIER, [400, 700], [500, 0], true);
    t.ok("clearance: and the drop off the same perch survives it", !!down && down.kind === "drop");
  }
  {
    // A blocked NEAR takeoff must not condemn a clear far one. The overhang sits
    // over 670 only; 1000 is in open air, and the edge keeps exactly that.
    const one = accepts("a jump whose near takeoff is roofed",
      [GROUND, PERCH, { x: 640, y: 320, w: 80, h: 20 }], [500, 0], [400, 700]);
    t.eq("clearance: ...and only the far takeoff is kept", one.takeoffs, [1000]);
  }
  {
    // BODY SIZE. Same envelope, different box: the arc's apex puts a 46-tall
    // body's head at 324.4 and a 20-tall body's at 350.4, and the lid's underside
    // is at 340. "A gap admits one body but not another", from the design table.
    const LID = { x: 200, y: 320, w: 140, h: 20 };
    const SHORT = bodyProfile({ w: 30, h: 20, gravity: 2000, jumpSpeed: 720, runSpeed: 320 });
    rejects("a 46-tall body under a lid", [HOP_A, HOP_B, LID], [500, 0], [500, 370]);
    accepts("a 20-tall body under the same lid", [HOP_A, HOP_B, LID], [500, 0], [500, 370], SHORT);
  }
  {
    // WALKS AND DROPS ARE UNTOUCHED. The addendum adds hop and upward-jump
    // clearance and nothing else; a drop is a fall this predictor does not model
    // and does not claim to. Compared as sets rather than by count, so a drop
    // quietly turning into a different drop would show.
    const MIX = [
      { x: 0, y: 500, w: 200, h: 40 }, // ground left  — span [0,170]
      { x: 160, y: 500, w: 200, h: 40 }, // ...touching it: a WALK, gap 0
      { x: 500, y: 500, w: 400, h: 40 },
      { x: 200, y: 380, w: 300, h: 20 }, // a ledge to drop off
      { x: 270, y: 300, w: 20, h: 200 }, // and a column that breaks hops
    ];
    const kinds = (clearance) => {
      const g = buildGraph(MIX, SOLDIER, clearance ? { clearance: true } : undefined);
      const out = [];
      g.edges.forEach((list, i) => list.forEach((e) => { if (e.kind === "walk" || e.kind === "drop") out.push(`${i}->${e.to}:${e.kind}`); }));
      return out.sort().join(" ");
    };
    t.ok(`clearance: the scene has walks and drops to lose (${kinds(false)})`,
      kinds(false).includes("walk") && kinds(false).includes("drop"));
    t.eq("clearance: and it loses none of them", kinds(true), kinds(false));
  }
  {
    // THE SEAM, and it throws rather than approximating. `auditGeometry` builds
    // its profile as a box plus a reachability envelope — no gravity, no impulse,
    // no run speed — because reachability is all generation needs. The predictor
    // integrates all three. A level's audit is not the place to find that out.
    const auditProfile = { w: 30, h: 46, envelope: SOLDIER.envelope };
    let threw = null;
    try { buildGraph([HOP_A, HOP_B], auditProfile, { clearance: true }); } catch (e) { threw = e; }
    t.ok(`seam: the audit's envelope-only profile cannot enter the predictor (${threw && threw.message})`, !!threw);
    let ok = null;
    try { buildGraph([HOP_A, HOP_B], auditProfile); ok = true; } catch { ok = false; }
    t.ok("seam: and the same profile still builds the legacy graph it is for", ok);
    // Identity carries the policy, or the two graphs would share a cache entry.
    t.ok(`graph: a filtered graph has its own key (${buildGraph([HOP_A], SOLDIER, { clearance: true }).key})`,
      buildGraph([HOP_A], SOLDIER, { clearance: true }).key !== buildGraph([HOP_A], SOLDIER).key);
  }

  // ---- the manoeuvre (tech/nav-clearance.md, C1) -------------------------
  // These four were private to the follower until C1. They are here because C2's
  // predictor simulates the manoeuvre the follower performs, and two answers to
  // "where does this body take off" is how a predicted jump and a real one come
  // to disagree.
  {
    const from = { a: 0, b: 200, y: 500 };
    const right = { a: 400, b: 600, y: 500 };
    const left = { a: -400, b: -200, y: 500 };
    t.eq("lip: a destination to the right leaves by the right lip", lipToward(from, right, 50), 200);
    t.eq("lip: ...and one to the left by the left lip", lipToward(from, left, 150), 0);
    // Overlapping spans have no lip: "closest" is wherever the body stands.
    const over = { a: 100, b: 300, y: 400 };
    t.eq("lip: overlapping spans resolve to the body's own x, clamped", lipToward(from, over, 150), 150);
    t.eq("lip: ...clamped to the shared stretch", lipToward(from, over, 20), 100);

    t.eq("landing: the nearest standable x on the destination", landingX(right, 50), 400);
    t.eq("landing: and no move at all when already on it", landingX(right, 500), 500);
  }
  {
    // Footprint clearance in body-LEFT-EDGE space: (400 - w, 630) is the band
    // from which a rising body hits this destination's underside — the platform's
    // own edges, one taken back by a body width because `x` is a left edge.
    const to = nodeOn({ x: 400, y: 400, w: 230, h: 20 }, 30);
    t.ok("footprint: a body a full width left of the span is clear", footprintClear(370, to, 30));
    t.ok("footprint: exactly a width out is clear — the boundary is inclusive", footprintClear(370, to, 30) && footprintClear(630, to, 30));
    t.ok("footprint: one pixel inside is not", !footprintClear(371, to, 30));
    t.ok("footprint: and directly underneath certainly is not", !footprintClear(500, to, 30));
  }
  {
    // A ledge whose clear sides are 370 and 630. Which of them a node offers is
    // a fact about the SOURCE node's span; where they are is a fact about the
    // destination's platform. BOTH count when both are standable.
    const to = nodeOn({ x: 400, y: 400, w: 230, h: 20 }, 30);
    const far = nodeOn({ x: 1200, y: 500, w: 230, h: 20 }, 30);
    t.eq("takeoff: both sides on a wide node", clearTakeoffs({ a: 0, b: 900, y: 500 }, to, 30), [370, 630]);
    t.eq("takeoff: only the near one when the node stops short", clearTakeoffs({ a: 0, b: 500, y: 500 }, to, 30), [370]);
    t.eq("takeoff: only the far one when the node starts late", clearTakeoffs({ a: 500, b: 900, y: 500 }, to, 30), [630]);
    t.eq("takeoff: neither, when the node lies wholly under the ledge", clearTakeoffs({ a: 420, b: 580, y: 500 }, to, 30), []);

    // takeoffX picks ONE for a body already standing somewhere; the nearer side.
    const wide = { a: 0, b: 900, y: 500 };
    t.eq("takeoff: a body left of the ledge uses the left side", takeoffX(wide, to, 200, 30, true), 370);
    t.eq("takeoff: a body right of it uses the right side", takeoffX(wide, to, 800, 30, true), 630);
    // Where neither side is standable it returns the lip anyway: without
    // clearance the bonk is the failed attempt the cap retires the edge on, and
    // an agent that refuses to try never learns the edge is a lie.
    const under = { a: 420, b: 580, y: 500 };
    t.eq("takeoff: no clear side falls back to the lip, so the attempt happens", takeoffX(under, to, 500, 30, true), 500);
    // A hop never consults the footprint — it is not rising into anything.
    t.eq("takeoff: a hop uses the plain directed lip", takeoffX(wide, far, 100, 30, false), 900);

    // The candidate list is position-free: it is what C2 VALIDATES, and a
    // candidate set that moved with the body could not be stored on an edge.
    t.eq("candidates: an up-edge offers every clear standable side", takeoffCandidates(wide, to, 30, true), [370, 630]);
    t.eq("candidates: none when the ledge roofs the whole node", takeoffCandidates(under, to, 30, true), []);
    t.eq("candidates: a hop offers its one directed lip", takeoffCandidates(wide, far, 30, false), [900]);
    // A lip that is ALREADY clear is the candidate; the sides are off-span here.
    t.eq("candidates: a far lip that already clears the footprint counts",
      takeoffCandidates({ a: 0, b: 200, y: 500 }, to, 30, true), [200]);
  }
  {
    const to = nodeOn({ x: 400, y: 400, w: 230, h: 20 }, 30);
    // Rising: aim at the nearer edge of the footprint, never into it.
    t.eq("airborne: below the surface, close on the near footprint edge", airborneAimX(to, 300, 30, 470), 370);
    t.eq("airborne: from the far side, the far edge", airborneAimX(to, 700, 30, 470), 630);
    // Feet at or above the surface: the landing span, clamped.
    t.eq("airborne: once the feet clear it, head for the landing point", airborneAimX(to, 300, 30, 400), 400);
    t.eq("airborne: and stay put when already over it", airborneAimX(to, 500, 30, 380), 500);
  }
  // ---- S1: the platform is solid where the platform is ---------------------
  // The footprint tests used to read the span, scaled by a body width, and that
  // is right only while a span is exactly "where the body fits WHOLLY on the
  // platform" — the definition S2 replaces. Two places it is already not right.
  {
    const plat = { x: 400, y: 400, w: 230, h: 20 };
    const wide = nodeOn(plat, 30);
    const narrow = nodeOn(plat, 10);
    t.ok("S1: a platform's solid extent is its own x and w", solidLeft(wide) === 400 && solidRight(wide) === 630);
    t.ok("S1: the same for any body on it", solidLeft(narrow) === solidLeft(wide) && solidRight(narrow) === solidRight(wide));
    // The right-hand footprint edge is the platform's right edge whoever is
    // jumping. The left one moves with the body only because `x` is a LEFT edge.
    t.ok("S1: a wide body and a narrow one share a right-hand footprint edge",
      footprintClear(630, wide, 30) && !footprintClear(629, wide, 30) && footprintClear(630, narrow, 10) && !footprintClear(629, narrow, 10));
  }
  {
    // A destination whose span is CUT by something overhead. Its left piece ends
    // at 470, so the old arithmetic put the destination's right-hand footprint
    // edge at 500 — 130px inside a platform that is solid out to 630, and a body
    // told to take off at 520 rises straight into its underside.
    const g = ground(1200);
    const plat = { x: 400, y: 400, w: 230, h: 20 };
    const lid = { x: 500, y: 360, w: 50, h: 20 }; // 20px of headroom over `plat`
    const cut = buildNodes([g, plat, lid], SOLDIER).filter((n) => n.plat === plat);
    t.eq("S1: the overhang cuts the destination's own span", cut.map((n) => [n.a, n.b]), [[400, 470], [550, 600]]);
    t.ok("S1: whose left piece ends 130px short of the platform", cut[0].b + SOLDIER.w === 500 && solidRight(cut[0]) === 630);
    t.ok("S1: a takeoff at 520 is under the platform, not clear of it", !footprintClear(520, cut[0], SOLDIER.w));
    t.ok("S1: and 630 still is", footprintClear(630, cut[0], SOLDIER.w));
  }

  {
    // The distance clamp: full speed while there is ground to cover, never more
    // than what remains, and a halt inside a pixel-per-second of arriving.
    const dt = 1 / 60;
    t.eq("drive: full speed toward a distant target", driveV(500, 320, dt), 320);
    t.eq("drive: reversed for a target behind", driveV(-500, 320, dt), -320);
    t.ok("drive: capped at the distance remaining, so a body lands exactly on it",
      near(driveV(2, 320, dt), 120, 1e-9));
    t.eq("drive: and stops rather than oscillating around it", driveV(0.01, 320, dt), 0);
  }
}
