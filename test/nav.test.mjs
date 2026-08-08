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
} from "../src/game/nav.js";

const SOLDIER = bodyProfile({ w: 30, h: 46, gravity: 2000, jumpSpeed: 720, runSpeed: 320 });
// a smaller body: 44 tall needs 48 of headroom where the soldier needs 50
const DUELIST = bodyProfile({ w: 26, h: 44, gravity: 2000, jumpSpeed: 720, runSpeed: 320 });

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const ground = (w = 1200) => ({ x: 0, y: 500, w, h: 40 });
const edgeTo = (graph, from, to) => graph.edges[from].find((e) => e.to === to) || null;

export default async function run(t) {
  // ---- envelope sanity: the numbers this file is authored against ---------
  const env = SOLDIER.envelope;
  t.ok(`envelope: maxRise 129.6 (got ${env.maxRise})`, near(env.maxRise, 129.6, 1e-9));
  t.ok(`envelope: flatReach 230.4 (got ${env.flatReach.toFixed(3)})`, near(env.flatReach, 230.4, 1e-9));

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
}
