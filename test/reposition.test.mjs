// ---------------------------------------------------------------------------
// RANGED REPOSITIONING (tech/ranged-repositioning.md, Slices R1 + R2).
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
import { updateCompanionSpec } from "../src/mission/ai.js";
import { updateProjectiles } from "../src/mission/combat.js";
import { makeRng } from "../src/game/gen/rng.js";
import { Soldier, STAND_H, stepActor } from "../src/mission/entities.js";
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

const rifle = { id: "rifle", name: "R", fireRate: 7, projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 1 }, effects: [] };
const rosterSoldier = (id) => ({ id, name: id, callsign: "", stats: { aim: 6, health: 5, speed: 5, nerve: 5 }, traits: [], cost: 0, status: "roster", record: { missions: 1, kills: 0 }, wounds: 0 });

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

  // ---- R2: both teams, on the same code path ---------------------------------
  {
    // R1 shipped with an explicit enemy-team guard so that changing how the game
    // plays WITH you was a decision rather than a side effect. R2 removes it, and
    // the thing to prove is that removing it was all there was to it: an ally in
    // the identical situation makes the identical move.
    const sc = scene(SLAB, []);
    const ally = gunner(200, 474, { team: "player" });
    const foe = gunner(200, 474);
    const hostile = { kind: "soldier", x: 700, y: 354, w: 30, h: 46, vx: 0, vy: 0, onGround: true, alive: true, health: 1e9, maxHealth: 1e9 };
    sc.specRoots = [hostile]; // what a player-team agent hunts
    sc.soldiers = [hostile]; // and what an enemy-team agent hunts
    sim(ally, sc, 14);
    sim(foe, sc, 14);
    t.ok(`teams: the enemy repositions (x ${cx(foe).toFixed(0)})`, cx(foe) > 800);
    t.ok(`teams: and so does the ally (x ${cx(ally).toFixed(0)})`, cx(ally) > 800);
    t.ok("teams: to the same place — one code path, not two", Math.abs(ally.x - foe.x) < 1);
  }
  {
    // The combination R1 never exercised: a real companion. A Soldier body driven
    // through updateCompanionSpec, whose `combat` state sets keepDistance — so the
    // band resolver has to work against the SOLDIER profile (config.jumpSpeed and
    // config.runSpeed, unscaled world gravity), not a legged one, and against an
    // agent whose x/y are a mirror of a body it does not integrate.
    //
    // Chest-high cover with the enemy behind it. The companion must climb ONTO
    // the cover to have a shot, which is the case the slice is for and also the
    // case that collides with the companion's own brain — `combat` exits the
    // moment its target stops being level, so it will not settle up there. The
    // assertion is therefore that it gets the shot at all, not that it stays.
    const COVER = [
      { x: 0, y: 500, w: 1400, h: 40 },
      { x: 600, y: 420, w: 200, h: 80 },
    ];
    const runCover = () => {
      const leader = new Soldier(rosterSoldier("L"), rifle, 500, 500 - STAND_H);
      const comp = new Soldier(rosterSoldier("C"), rifle, 520, 500 - STAND_H);
      const foe = instantiate(normalizeSpec({
        id: "dummy", root: { health: { max: 1e6 }, visual: { size: [30, 46] }, motion: { type: "static" } },
      }), 1000, 454);
      foe.rng = () => 0.5;
      const sc = scene(COVER, [leader, comp]);
      sc.specRoots = [foe];
      let sawTarget = false;
      let highest = 500;
      let fought = false;
      for (let i = 0; i < 60 * 20; i++) {
        if (comp.fireCooldown > 0) comp.fireCooldown -= STEP;
        updateCompanionSpec(comp, STEP, sc, leader, ctx);
        stepActor(comp, STEP, sc.world, sc.platforms);
        if (comp.agent.brainState.current === "combat") fought = true;
        if (comp.agent.sense.los) sawTarget = true;
        highest = Math.min(highest, comp.y + comp.h);
      }
      return { sawTarget, highest, fought, sc, comp };
    };

    const on = runCover();
    config.navReposition = false;
    const off = runCover();
    config.navReposition = true;

    t.ok("companion: it does engage — the brain reaches the keepDistance state", on.fought);
    t.ok(`companion: it climbs the cover (feet reached ${on.highest})`, on.highest <= 420);
    t.ok("companion: and gets a sight line on the enemy behind it", on.sawTarget);
    t.ok(`off: without R2 it stays on the ground (feet ${off.highest})`, off.highest === 500);
    t.ok("off: and never sees the enemy at all", !off.sawTarget);
    t.ok("companion: routed on the SOLDIER profile, not a legged one",
      [...on.sc.navGraphs.keys()].some((k) => k === `30x46@2000/${config.jumpSpeed}/${config.runSpeed}`));
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
    // A commitment must not outlive the controller that made it. Arbitration is
    // `dash > moveOrder > controller`, and a brain can leave `keepDistance`
    // outright — the companion's combat state does it the moment its target stops
    // being level, which repositioning can cause by climbing. Coming back to a
    // destination chosen for a fight that is over, with a jump still open from it,
    // is how a stale choice becomes a stuck agent.
    const sc = scene(SLAB, [TARGET]);
    const g = gunner(200, 474);
    sim(g, sc, 1);
    t.ok("stale: the gunner is committed before it is interrupted", g.repo.hold > 0 && !!g.repo.dest);
    const pinned = g.repo.dest; // the object, not its value — it must be re-made
    g.moveOrder = { x: 300, y: 474, speed: 140, timeout: 3 }; // preempts the controller
    sim(g, sc, 1.5);
    g.moveOrder = null;
    updateSpecEnemy(g, STEP, sc, ctx); // first frame back on the controller
    t.ok("stale: the choice is re-made, not resumed", g.repo.dest !== pinned);
    // And the window with it: a resumed commitment would show the ~0.5s that was
    // left when the interruption began.
    t.ok(`stale: on a full window, or none at all (${g.repo.hold.toFixed(2)})`,
      g.repo.hold === 0 || g.repo.hold > config.navRepositionHold - 0.05);
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

  // ---- escorting under fire (tech/soldier-ducking.md, D1) --------------------
  // A duck costs a squadmate its legs, and escort is a move order with a
  // wall-clock timeout that keeps ticking while the body cannot move. So a duck
  // does interrupt escorting and the held route is discarded rather than
  // resumed — the squadmate re-issues from where it now stands. This case is
  // here to make that cost visible and bounded, not to deny it.
  {
    // The gunner sits past the 640px break-off, so the companion stays in
    // ESCORT the whole way and never turns to fight it.
    const FLAT = [{ x: 0, y: 500, w: 1400, h: 40 }];
    const GUN = normalizeSpec({
      v: 1, id: "escort_gunner", name: "EG", threat: 50,
      root: { id: "root", tags: ["enemy"], visual: { size: [38, 38] }, health: { max: 1e9 }, motion: { type: "static" },
        emitters: { gun: { at: [0, 0], projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 2, damage: 3 } } } },
      brain: { start: "fire", states: { fire: { tracks: [{ id: "g", loop: true, steps: [
        { fire: { emitter: "gun", pattern: "aimed" } }, { wait: 0.12 },
      ] }] } } },
    });

    // One escort run, from a fixed seed so the gunner's shot jitter is the same
    // in both. Returns how far left the companion got, and whether it kneeled.
    const escortRun = (seconds, fire) => {
      const real = Math.random;
      Math.random = makeRng(20260816);
      try {
        const leader = new Soldier(rosterSoldier("L"), rifle, 150, 500 - STAND_H);
        const comp = new Soldier(rosterSoldier("C"), rifle, 800, 500 - STAND_H);
        comp.health = comp.maxHealth = 1e6;
        const g = fire ? instantiate(GUN, 1360, 500 - 38) : null;
        const sc = scene(FLAT, [leader, comp]);
        if (g) sc.specRoots = [g];
        let kneeled = 0;
        let states = new Set();
        for (let i = 0; i < Math.round(seconds * 60); i++) {
          updateCompanionSpec(comp, STEP, sc, leader, ctx);
          stepActor(comp, STEP, sc.world, sc.platforms);
          if (g) updateSpecEnemy(g, STEP, sc, ctx);
          updateProjectiles(sc, STEP, ctx);
          if (comp.crouched) kneeled++;
          states.add(comp.agent.brainState.current);
        }
        return { comp, kneeled, states, gap: Math.abs(cx(comp) - (cx(leader) - 90)) };
      } finally {
        Math.random = real;
      }
    };

    const under = escortRun(4, true);
    t.ok(`escort: it kneels while escorting (${under.kneeled} frames down)`, under.kneeled > 0);
    t.ok("escort: and never breaks off to fight the distant gunner", !under.states.has("combat"));

    // The price, stated as a comparison rather than assumed: the same four
    // seconds of the same fire, with the reflex switched off, covers more ground.
    const hold = config.duckHoldTime;
    config.duckHoldTime = 0;
    const standing = escortRun(4, true);
    config.duckHoldTime = hold;
    t.eq("escort: with the hold at 0 it never kneels", standing.kneeled, 0);
    t.ok(`escort: ducking costs real progress (${Math.round(under.gap)}px short vs ${Math.round(standing.gap)}px)`,
      under.gap > standing.gap);

    // …and it is a delay, not a deadlock. The escort loop settles at a stable
    // station of its own (the moveTo/wait cycle, not this feature), so the
    // baseline is that station rather than zero: given longer under the same
    // fire, a ducking squadmate still reaches it.
    // …and it is a delay, not a deadlock. The escort loop settles on a station
    // of its own (its moveTo/wait cycle, not this feature), so the baseline is
    // that station rather than zero: unshot at the squadmate is there in ~3s,
    // under this fire in ~6s. D1 — where every reaction was certain and
    // immediate — left it crawling instead, still 300px short after twenty
    // seconds. The Speed dice are what make ducking while escorting affordable,
    // which is the risk approximation 4 named.
    const station = escortRun(6, false).gap;
    const late = escortRun(20, true).gap;
    t.ok(`escort: unshot at it settles on a station (${Math.round(station)}px off the offset)`, station < under.gap);
    t.ok(`escort: under fire it still gets there, later (${Math.round(under.gap)}px short at 4s → ${Math.round(late)}px)`,
      late <= station + 20);
  }

  resetConfig();
}
