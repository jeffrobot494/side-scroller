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
import { profileFor, graphFor, routeRequest, invalidateNavGraphs } from "../src/mission/navigation.js";
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

function sim(root, sc, seconds) {
  for (let i = 0; i < Math.round(seconds * 60); i++) updateSpecEnemy(root, STEP, sc, ctx);
  return root;
}

const feet = (e) => e.y + e.h;

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
  {
    // A 40x200 wall standing on the ground. The graph believes the 70px gap
    // across it is hoppable (edges test the landing, not the arc — a documented
    // approximation), so the agent tries, is clipped, and lands back where it
    // started. That is precisely what the cap exists for.
    const sc = scene(
      [{ x: 0, y: 500, w: 1400, h: 40 }, { x: 560, y: 300, w: 40, h: 200 }],
      [soldierAt(900, 500 - 46)],
    );
    const c = chaser(200, 474);
    sim(c, sc, 8);
    const tries = Object.values(c.nav.attempts).reduce((a, b) => a + b, 0);
    t.eq(`attempts: gives up after exactly config.navJumpAttempts (${config.navJumpAttempts})`, tries, config.navJumpAttempts);
    t.ok("attempts: and is marked blocked", c.nav.blocked === true);
    t.eq("attempts: the sense reports it", c.sense.navBlocked, true);
    t.ok("attempts: a blocked agent still holds its best position, not its panic spot", Math.abs(c.x - 530) < 2);
    t.ok("attempts: and stays stopped", Math.abs(c.vx) < 1);
  }
  {
    // the cap is a knob, and it is honoured
    const sc = scene(
      [{ x: 0, y: 500, w: 1400, h: 40 }, { x: 560, y: 300, w: 40, h: 200 }],
      [soldierAt(900, 500 - 46)],
    );
    config.navJumpAttempts = 1;
    const c = chaser(200, 474);
    sim(c, sc, 8);
    config.navJumpAttempts = 3;
    t.eq("attempts: one attempt is enough when the knob says so",
      Object.values(c.nav.attempts).reduce((a, b) => a + b, 0), 1);
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
    t.ok(`profile: so its maxRise is the player's 129.6, not 110.6 (got ${s.envelope.maxRise})`,
      Math.abs(s.envelope.maxRise - 129.6) < 1e-9);

    // and the difference is not cosmetic: a 120px ledge sits BETWEEN the two
    // envelopes, so reading body.* for a companion would deny it a climb it can
    // actually make — the escort falling behind at exactly the interesting spot
    const ledged = scene([{ x: 0, y: 500, w: 1400, h: 40 }, { x: 700, y: 380, w: 300, h: 20 }]);
    const up = (prof) => {
      const g = graphFor(ledged, prof);
      const ground = g.nodes.find((n) => n.y === 500);
      const ledge = g.nodes.find((n) => n.y === 380);
      return g.edges[ground.id].some((e) => e.to === ledge.id);
    };
    t.ok("profile: a companion's graph HAS the edge onto a 120px ledge", up(profileFor(comp, ledged, 210)));
    t.ok("profile: a legged body's graph does not — 120 is past its 110.6 maxRise",
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
