// ---------------------------------------------------------------------------
// PERCEPTION — the sensor pass that makes spec enemies feel like they *see*.
//
// Writes root.sense (exposed to expressions as `sense.*`) and short-term
// memory (last-known position, time since seen) on a fixed cadence — NOT every
// frame — per the smarter-AI doc: sensing on the decision interval keeps cost
// bounded and adds a natural, fair reaction delay.
//
//   sense.los               line of sight to the player (platforms block)
//   sense.dist              center distance to the player (px)
//   sense.playerAbove/Below vertical relation (beyond a 40px band)
//   sense.playerApproaching player moving toward me faster than a walk
//   sense.cornered          near a world edge with the player closing
//   sense.groundAhead       (grounded only) floor under my front edge probe
//   sense.timeSinceSeen     seconds since LOS was last true
//   sense.lastSeenX/Y       last position I actually saw the player at
//   sense.routeSteps        graph edges left on the current route (0 = none)
//   sense.routeReachable    the destination is on the graph and gettable
//   sense.navBlocked        gave up: the same jump failed too many times
// ---------------------------------------------------------------------------

import { config } from "../../game/config.js";
import { navSense } from "../navigation.js";

const SENSE_INTERVAL = 0.2;
const EDGE = 90;

export function updateSense(root, scene, dt) {
  const m = root.memory;
  m.timeSinceSeen += dt;
  m.senseTimer -= dt;
  if (m.senseTimer > 0) return;
  // config.labPerceptionScale is 1 in a normal mission; the Behavior Lab turns
  // it up to watch stale sense data drive a bad decision (tech/behavior-lab.md).
  m.senseTimer = SENSE_INTERVAL * config.labPerceptionScale;

  const ex = root.x + root.w / 2;
  const ey = root.y + root.h / 2;

  // anchor sense: distance to a companion's LEADER (root.anchor, set live by the
  // companion bridge) or, lacking one, the spawn point — lets a brain express
  // "stay near the leader / hold near home" without knowing the body.
  const s = root.sense;
  const ax = root.anchor ? root.anchor.x : root.anchorX + root.w / 2;
  const ay = root.anchor ? root.anchor.y : root.anchorY + root.h / 2;
  s.anchorX = ax;
  s.anchorY = ay;
  s.anchorDist = Math.hypot(ax - ex, ay - ey);

  const t = nearestHostile(root, scene);
  if (!t) {
    s.los = false;
    s.dist = 99999;
    s.playerAbove = false;
    s.playerBelow = false;
    s.playerApproaching = false;
    s.cornered = false;
    s.groundAhead = true;
    s.timeSinceSeen = m.timeSinceSeen;
    publishNav(root); // a moveOrder still routes with nobody to fight
    return;
  }

  const px = t.x + t.w / 2;
  const py = t.y + t.h / 2;

  s.dist = Math.hypot(px - ex, py - ey);
  // God eye (Lab lever, off by default): skip occlusion so a navigation fault
  // can be told apart from "it simply never saw you".
  s.los = losBetween(ex, ey, px, py, scene.platforms);
  s.playerAbove = py < ey - 40;
  s.playerBelow = py > ey + 40;
  s.playerApproaching = Math.abs(t.vx || 0) > 60 && Math.sign(t.vx) === Math.sign(ex - px);
  s.cornered =
    (root.x < EDGE && px > ex) || (root.x + root.w > scene.world.width - EDGE && px < ex);
  s.groundAhead = root.spec.body.gravity === 0 || groundAhead(root, scene.platforms);

  if (s.los) {
    m.timeSinceSeen = 0;
    m.lastSeenX = px;
    m.lastSeenY = py;
    m.seenOnce = true; // gates the "lastSeen" move target — no memory, no hunt
  }
  s.timeSinceSeen = m.timeSinceSeen;
  s.lastSeenX = m.lastSeenX;
  s.lastSeenY = m.lastSeenY;
  publishNav(root);
}

// Navigation senses (tech/agent-navigation.md, N3). Published on the same
// throttled cadence as everything else, and set even when there is no hostile —
// an agent moving under a moveOrder still has a route. The router owns the
// values; this only exposes them, so a brain can ask "can I actually get there"
// without knowing what a node is.
function publishNav(root) {
  const n = navSense(root);
  root.sense.routeSteps = n.routeSteps;
  root.sense.routeReachable = n.routeReachable;
  root.sense.navBlocked = n.navBlocked;
}

// Who this agent fights. An enemy (the default team) hunts the squad; a
// player-team agent (a companion) hunts the enemy roots. The scene exposes both
// lists; hosts without a specRoots view (a bare test scene) fall back to enemies.
export function hostilesFor(root, scene) {
  if (root && root.team === "player") return scene.specRoots || scene.enemies || [];
  return scene.soldiers || [];
}

// The nearest LIVING hostile to the agent's center — the primary target for
// perception, movement, and aim. Replaces the old "first living soldier", which
// made an entire wave of enemies fixate on soldiers[0] regardless of who was
// actually closest. Degrades to the first entry (possibly dead) when nothing is
// alive, matching the old null-tolerant callers.
export function nearestHostile(root, scene) {
  const list = hostilesFor(root, scene);
  const ex = root.x + root.w / 2;
  const ey = root.y + root.h / 2;
  let best = null;
  let bestD = Infinity;
  for (const e of list) {
    if (!e || !e.alive) continue;
    const d = Math.hypot(e.x + e.w / 2 - ex, e.y + e.h / 2 - ey);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best || list[0] || null;
}

// Is there floor under a probe point just past my leading edge?
function groundAhead(root, platforms) {
  const px = root.facing > 0 ? root.x + root.w + 8 : root.x - 8;
  const py = root.y + root.h + 6;
  for (const p of platforms) {
    if (px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h) return true;
  }
  return false;
}

// Can a body standing at (x0, y0) see (x1, y1)? The exact test behind sense.los,
// god eye included, exported so a caller can ask it about a place the agent is
// NOT standing — which is what choosing somewhere to move to requires
// (tech/ranged-repositioning.md). Exported rather than imported the other way
// round on purpose: this module already imports navigation.js for navSense, so
// the resolver takes this as an injected predicate instead of importing back.
export function losBetween(x0, y0, x1, y1, platforms) {
  return config.labGodEye || !blocked(x0, y0, x1, y1, platforms);
}

// Segment vs AABB occlusion — slab method per platform.
function blocked(x0, y0, x1, y1, platforms) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (const p of platforms) {
    let tmin = 0;
    let tmax = 1;
    let miss = false;
    for (const [d, o, lo, hi] of [
      [dx, x0, p.x, p.x + p.w],
      [dy, y0, p.y, p.y + p.h],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { miss = true; break; }
      } else {
        let t0 = (lo - o) / d;
        let t1 = (hi - o) / d;
        if (t0 > t1) [t0, t1] = [t1, t0];
        tmin = Math.max(tmin, t0);
        tmax = Math.min(tmax, t1);
        if (tmin > tmax) { miss = true; break; }
      }
    }
    if (!miss) return true;
  }
  return false;
}
