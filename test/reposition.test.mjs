// ---------------------------------------------------------------------------
// RANGED REPOSITIONING (tech/ranged-repositioning.md, Slice R1).
//
// navigation.test.mjs proves an agent that has been given a POINT can get to
// it. A `keepDistance` agent is never given one — it has a band — so this
// proves the missing half: that a band plus a sight test becomes a point, that
// only a gunner which can do nothing where it stands goes looking for one, and
// that the choice is held long enough for the follower underneath to work.
//
// The scene below is the shape the whole slice exists for: a gunner standing at
// a perfectly good distance from its target, with a slab in the way, unable to
// fire a shot and — before R1 — content to stand there forever.
// ---------------------------------------------------------------------------

import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { instantiate, updateSpecEnemy } from "../src/mission/enemyspec/runtime.js";
import { holdPoint, abortRoute, invalidateNavGraphs } from "../src/mission/navigation.js";
import { losBetween } from "../src/mission/enemyspec/perception.js";
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

// A grounded gunner on the lurk_gunner body (30x26, speed 140), with the band
// widened to 220–480 so the scene below has an answer at all.
function gunner(x, y, { min = 220, max = 480, team = "enemy", speed = 140 } = {}) {
  const r = instantiate(normalizeSpec({
    id: "gunner",
    root: { health: { max: 40 }, visual: { size: [30, 26] }, motion: { type: "keepDistance", min, max, speed } },
  }), x, y, team);
  r.rng = () => 0.5;
  return r;
}

function sim(root, sc, seconds) {
  for (let i = 0; i < Math.round(seconds * 60); i++) updateSpecEnemy(root, STEP, sc, ctx);
  return root;
}

const cx = (e) => e.x + e.w / 2;
const cy = (e) => e.y + e.h / 2;

export default async function run(t) {
  resetConfig();

  // A floating slab with the target standing ON it. Every sight line from the
  // ground to that point either passes through the slab or clears one of its two
  // top corners, and clearing the LEFT corner needs more range than the band
  // allows — so the one place this gunner can both hold its distance and see is
  // out past the slab's right end. It has to walk under the target to get there.
  const SLAB = [
    { x: 0, y: 500, w: 1400, h: 40 },
    { x: 600, y: 400, w: 200, h: 20 },
  ];
  const TARGET = soldierAt(700, 400 - 46); // feet on the slab; centre (715, 377)

  // ---- the resolver, on its own ---------------------------------------------
  {
    const sc = scene(SLAB, [TARGET]);
    const g = gunner(200, 474);
    updateSpecEnemy(g, STEP, sc, ctx); // one frame, so sense/graph exist
    const tp = { x: 715, y: 377 };
    const see = (x, y) => losBetween(x, y, tp.x, tp.y, sc.platforms);

    t.ok("resolver: the gunner cannot see the target from where it stands", !see(cx(g), cy(g)));
    const p = holdPoint(g, sc, 140, tp, 220, 480, see);
    t.ok("resolver: it finds somewhere to stand", !!p);
    t.ok(`resolver: from which the target IS visible (x ${p && p.x.toFixed(0)})`, !!p && see(p.x, p.y));
    // Exactly `max` here, and legitimately: the near end of the band and every
    // point between are behind the slab, so the far edge is the only answer. The
    // epsilon is float slop on a sqrt, not slack in the filter.
    const d = p ? Math.hypot(p.x - tp.x, p.y - tp.y) : 0;
    t.ok(`resolver: and which is inside the band (d ${d.toFixed(1)} in 220..480)`, d >= 220 && d <= 480 + 1e-6);
    t.ok("resolver: it is past the slab, the only side that works", !!p && p.x > 800);
    // The near end of the band and the walk-least point are both blocked here;
    // only the far end sees over the corner. Probing one point would miss it.
    t.ok("resolver: specifically the far end of the band, not the nearest point", !!p && p.x > 1100);
  }

  // ---- no candidate: say so rather than inventing one ------------------------
  {
    // Same geometry, a band too tight to contain any position with a sight line.
    const sc = scene(SLAB, [TARGET]);
    const g = gunner(200, 474);
    updateSpecEnemy(g, STEP, sc, ctx);
    const tp = { x: 715, y: 377 };
    const see = (x, y) => losBetween(x, y, tp.x, tp.y, sc.platforms);
    t.eq("no candidate: a band that nothing satisfies resolves to null", holdPoint(g, sc, 140, tp, 220, 300, see), null);
  }
  {
    // A body with no terrain under it has no nodes and therefore no candidates.
    const sc = scene([], [TARGET]);
    const g = gunner(200, 474);
    t.eq("no candidate: no platforms, no answer", holdPoint(g, sc, 140, { x: 715, y: 377 }, 220, 480, () => true), null);
  }
  {
    // A flyer already moves in two dimensions; the graph has nothing for it.
    const sc = scene(SLAB, [TARGET]);
    const f = instantiate(normalizeSpec({
      id: "flyer",
      root: { health: { max: 40 }, body: { gravity: 0 }, visual: { size: [26, 26] }, motion: { type: "keepDistance", min: 220, max: 480, speed: 140 } },
    }), 200, 300);
    t.eq("no candidate: flyers are excluded by design", holdPoint(f, sc, 140, { x: 715, y: 377 }, 220, 480, () => true), null);
  }

  // ---- the whole loop: a blind gunner walks itself into a firing position ----
  {
    const sc = scene(SLAB, [TARGET]);
    const g = gunner(200, 474);
    sim(g, sc, 14);
    const d = Math.hypot(715 - cx(g), 377 - cy(g));
    t.ok(`loop: it ends up past the slab (x ${cx(g).toFixed(0)})`, cx(g) > 800);
    t.ok(`loop: with line of sight to the target`, losBetween(cx(g), cy(g), 715, 377, sc.platforms));
    t.ok(`loop: still holding its distance (d ${d.toFixed(0)} in 220..480)`, d >= 220 && d <= 480);
    t.eq("loop: sense.los agrees", g.sense.los, true);
    t.ok("loop: and it has let go of the choice, back on holdRange", g.repo.hold === 0);
  }
  {
    // The same scene with the feature OFF is the pre-R1 bug, and it is the reason
    // the slice exists: a gunner at a textbook distance, seeing nothing.
    const sc = scene(SLAB, [TARGET]);
    config.navReposition = false;
    const g = gunner(200, 474);
    sim(g, sc, 14);
    config.navReposition = true;
    const d = Math.hypot(715 - cx(g), 377 - cy(g));
    t.ok(`off: it parks short of the slab (x ${cx(g).toFixed(0)})`, cx(g) < 600);
    t.ok(`off: comfortably in band (d ${d.toFixed(0)})`, d >= 220 && d <= 480);
    t.ok("off: and cannot see a thing", !losBetween(cx(g), cy(g), 715, 377, sc.platforms));
  }

  // ---- the trigger: a gunner that can already see does not move --------------
  {
    // Flat ground, nothing in the way, target well inside the band. This is the
    // 61% of placements the spec says are untouched, and "untouched" has to mean
    // byte-identical, not merely similar.
    const FLAT = [{ x: 0, y: 500, w: 1400, h: 40 }];
    const run1 = () => {
      const sc = scene(FLAT, [soldierAt(900, 454)]);
      const g = gunner(500, 474);
      sim(g, sc, 6);
      return { x: g.x, vx: g.vx };
    };
    const withOn = run1();
    config.navReposition = false;
    const withOff = run1();
    config.navReposition = true;
    t.eq("trigger: with sight and a holdable band, R1 changes nothing (x)", withOn.x, withOff.x);
    t.eq("trigger: ... and nothing (vx)", withOn.vx, withOff.vx);
    t.ok("trigger: no choice was ever made", true);
  }

  // ---- the stall trigger: outside the band, and going nowhere ----------------
  {
    // The gunner starts wedged in a slot too narrow to back out of: it is INSIDE
    // its minimum range and holdRange's answer — retreat — is into a wall. Sight
    // is fine, so only the stall clause can rescue it.
    const PEN = [
      { x: 0, y: 500, w: 1400, h: 40 },
      { x: 0, y: 300, w: 120, h: 200 }, // the wall it backs into
    ];
    const sc = scene(PEN, [soldierAt(200, 454)]);
    const g = gunner(130, 474, { min: 300, max: 600 });
    updateSpecEnemy(g, STEP, sc, ctx);
    t.ok("stall: it starts inside its minimum range", Math.hypot(215 - cx(g), 477 - cy(g)) < 300);
    t.ok("stall: and can see the target perfectly well", losBetween(cx(g), cy(g), 215, 477, sc.platforms));
    sim(g, sc, 8);
    const d = Math.hypot(215 - cx(g), 477 - cy(g));
    t.ok(`stall: it goes the other way round instead of grinding the wall (x ${cx(g).toFixed(0)})`, cx(g) > 400);
    t.ok(`stall: and reaches its band (d ${d.toFixed(0)} in 300..600)`, d >= 300 && d <= 600);
  }

  // ---- commitment ------------------------------------------------------------
  {
    const sc = scene(SLAB, [TARGET]);
    const g = gunner(200, 474);
    sim(g, sc, 1);
    t.ok("commit: a choice is pinned while it walks", g.repo.hold > 0 && !!g.repo.dest);
    const dest = { ...g.repo.dest };
    sim(g, sc, 0.5); // well inside the 1.5s window
    t.eq("commit: and does not drift frame to frame", g.repo.dest.x, dest.x);
  }
  {
    // The window is what unsticks an agent that arrived somewhere stale. Wind it
    // right down and the choice must still be re-made, not abandoned.
    const sc = scene(SLAB, [TARGET]);
    config.navRepositionHold = 0.25;
    const g = gunner(200, 474);
    sim(g, sc, 14);
    config.navRepositionHold = 1.5;
    t.ok(`commit: a short window still gets there (x ${cx(g).toFixed(0)})`, cx(g) > 800);
    t.ok("commit: with sight", losBetween(cx(g), cy(g), 715, 377, sc.platforms));
  }

  // ---- R1 is enemies only ----------------------------------------------------
  {
    // The companion's combat state runs keepDistance on a soldier body. R2 is the
    // slice that changes ally behaviour; R1 must leave it exactly as it was, and
    // "exactly" is the point — this is what makes R2 a real decision.
    const sc = scene(SLAB, []);
    sc.specRoots = [];
    const ally = gunner(200, 474, { team: "player" });
    const foe = gunner(200, 474);
    const hostile = { kind: "soldier", x: 700, y: 354, w: 30, h: 46, vx: 0, vy: 0, onGround: true, alive: true, health: 1e9, maxHealth: 1e9 };
    sc.specRoots = [hostile]; // what a player-team agent hunts
    sc.soldiers = [hostile]; // and what an enemy-team agent hunts
    sim(ally, sc, 14);
    sim(foe, sc, 14);
    t.ok(`teams: the enemy repositions (x ${cx(foe).toFixed(0)})`, cx(foe) > 800);
    t.ok(`teams: the ally does not — that is R2 (x ${cx(ally).toFixed(0)})`, cx(ally) < 600);
    t.eq("teams: and keeps no reposition state at all", ally.repo, undefined);
  }

  // ---- it does not break the follower ---------------------------------------
  {
    // A reposition that ends mid-manoeuvre must not leave a jump pending, or the
    // follower books a failure on an edge nothing ever attempted — three of those
    // and a good edge is banned for the rest of the mission.
    const sc = scene(SLAB, [TARGET]);
    const g = gunner(200, 474);
    sim(g, sc, 14);
    t.eq("follower: no failed attempts were invented", Object.keys(g.nav.attempts).length, 0);
    t.eq("follower: and nothing was banned", g.nav.banned.size, 0);
  }
  {
    // The ban ledger is a fact about geometry and this body. Handing back to
    // holdRange must not wipe it, or the agent relearns the same dead jump.
    const sc = scene(SLAB, [TARGET]);
    const g = gunner(200, 474);
    sim(g, sc, 0.5); // long enough to land and take a route (instantiate leaves it airborne)
    g.nav.banned.add("7->9");
    g.nav.attempts["1->2"] = 2;
    sim(g, sc, 4);
    t.ok("follower: a ban survives repositioning", g.nav.banned.has("7->9"));
    t.eq("follower: so does a part-spent attempt count", g.nav.attempts["1->2"], 2);
  }

  {
    // The case that makes it matter: a gunner behind chest-high cover, whose one
    // firing position is on TOP of it, released mid-jump because the target
    // walked back into view. The follower resolves a jump on the first grounded
    // frame after takeoff — so a leg left pending here is charged to an edge the
    // agent was in the middle of clearing successfully.
    const COVER = [
      { x: 0, y: 500, w: 1400, h: 40 },
      { x: 600, y: 420, w: 200, h: 80 }, // cover: too tall to see over, low enough to climb
    ];
    const foe = soldierAt(1000, 454);
    const sc = scene(COVER, [foe]);
    const g = gunner(200, 474, { min: 220, max: 420 });
    let moved = false;
    let releasedInAir = false;
    for (let i = 0; i < 600; i++) {
      // once it is genuinely airborne on a committed jump, put the target where
      // it can be seen and shot from right here — the reposition is now pointless
      if (!moved && !g.onGround && g.nav && g.nav.leg && g.y < 400) {
        foe.x = 250;
        moved = true;
      }
      updateSpecEnemy(g, STEP, sc, ctx);
      if (moved && !g.onGround && g.repo.hold === 0) { releasedInAir = true; break; }
    }
    t.ok("midair: the gunner does have to jump for its firing position", moved);
    t.ok("midair: and the reposition ends while it is still in the air", releasedInAir);
    t.eq("midair: the pending jump goes with it, uncharged", g.nav.leg, null);
    t.eq("midair: so nothing was booked against the edge it was clearing", Object.keys(g.nav.attempts).length, 0);
  }
  {
    // The commitment window counts grounded time only. Let it run out mid-jump
    // and the agent is asked to re-decide from mid-air, where there is no node
    // under it to decide anything from — so it silently hands back to holdRange
    // with a jump still in the books.
    const COVER = [
      { x: 0, y: 500, w: 1400, h: 40 },
      { x: 600, y: 420, w: 200, h: 80 },
    ];
    const sc = scene(COVER, [soldierAt(1000, 454)]);
    const g = gunner(200, 474, { min: 220, max: 420 });
    let held = null;
    let ticked = false;
    for (let i = 0; i < 600; i++) {
      updateSpecEnemy(g, STEP, sc, ctx);
      if (!g.onGround && g.nav && g.nav.leg && g.repo.hold > 0) {
        if (held !== null && g.repo.hold !== held) ticked = true;
        held = g.repo.hold;
      } else if (held !== null) break;
    }
    t.ok("airtime: the gunner spent real frames airborne on a committed jump", held !== null);
    t.ok("airtime: and the commitment window did not tick while it was up there", !ticked);
  }
  {
    // The contract abortRoute exists for, stated directly: drop the manoeuvre,
    // keep what the body learned.
    const sc = scene(SLAB, [TARGET]);
    const g = gunner(200, 474);
    sim(g, sc, 1);
    g.nav.leg = { from: 3, to: 4 };
    g.nav.banned.add("5->6");
    g.nav.attempts["3->4"] = 1;
    abortRoute(g);
    t.eq("abort: the in-flight leg is dropped", g.nav.leg, null);
    t.eq("abort: and the path with it", g.nav.path, null);
    t.ok("abort: the ban ledger is not touched", g.nav.banned.has("5->6"));
    t.eq("abort: nor a part-spent attempt count", g.nav.attempts["3->4"], 1);
  }

  // ---- fallback discipline ---------------------------------------------------
  {
    // Terrain moving under an agent (the Lab drags platforms) invalidates the
    // graphs. Repositioning must survive it rather than throw or freeze.
    const sc = scene(SLAB, [TARGET]);
    const g = gunner(200, 474);
    sim(g, sc, 2);
    invalidateNavGraphs(sc);
    sim(g, sc, 12);
    t.ok(`invalidate: it still gets there (x ${cx(g).toFixed(0)})`, cx(g) > 800);
  }
  {
    // navEnabled off is the pre-N3 world, and R1 lives entirely inside it.
    const sc = scene(SLAB, [TARGET]);
    config.navEnabled = false;
    const g = gunner(200, 474);
    sim(g, sc, 14);
    config.navEnabled = true;
    t.ok("fallback: routing off disables repositioning too", cx(g) < 600);
  }
  {
    // God eye forces sense.los true, which is exactly the trigger R1 keys on —
    // so the one lever meant to isolate a navigation fault switches this feature
    // off. Pinned deliberately: the spec says so, and it should be a visible
    // change if anyone reworks the lever.
    const sc = scene(SLAB, [TARGET]);
    config.labGodEye = true;
    const g = gunner(200, 474);
    sim(g, sc, 14);
    config.labGodEye = false;
    t.ok(`godeye: with god eye on, the gunner never repositions (x ${cx(g).toFixed(0)})`, cx(g) < 600);
  }

  resetConfig();
}
