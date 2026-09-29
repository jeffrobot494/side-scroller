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
//
// Survival senses, for agents the companion bridge opts in (root.survival) and
// no one else (tech/squad-survival.md, V1) — published by publishSurvival:
//
//   sense.underFire   hurt within the hurt window, or a round inbound now
//   sense.wounded     health below the wounded fraction
//   sense.calm        no hurt and no inbound round for the calm time
//   sense.exposure    how many living hostiles can hit where I stand
//   sense.shot        I can hit my target from here
//   sense.needReload  magazine empty, reloading, a spare left
//   sense.outOfAmmo   magazine empty, not reloading, no spare left
//   sense.leaderFar   past the leash from the leader (with hysteresis)
// ---------------------------------------------------------------------------

import { navSense } from "../navigation.js";
import { predictHit } from "../combat.js";
import { STAND_H } from "../entities.js";
import { config } from "../../game/config.js";

const SENSE_INTERVAL = 0.2;
const EDGE = 90;

export function updateSense(root, scene, dt) {
  const m = root.memory;
  // Navigation senses are published EVERY frame; everything below stays on the
  // 0.2s cadence. They are not a sensor reading with a fair reaction delay —
  // they are the router's own verdict about the frame that is about to run, and
  // the frame the terrain moves is the frame a brain must stop believing "I gave
  // up". Between sense ticks a stale navBlocked would otherwise stand for up to
  // SENSE_INTERVAL after the graph it was learned on stopped existing
  // (tech/nav-clearance.md, "Cache lifecycle").
  publishNav(root, scene);
  m.timeSinceSeen += dt;
  m.senseTimer -= dt;
  if (m.senseTimer > 0) return;
  m.senseTimer = SENSE_INTERVAL;

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

  // Ahead of the no-hostile return, like publishNav: the fight ending is exactly
  // when `calm` has to keep ticking, or a squadmate in cover when the last
  // hostile dies never sees it and stays there.
  publishSurvival(root, scene, dt);

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
    return;
  }

  const px = t.x + t.w / 2;
  const py = t.y + t.h / 2;

  s.dist = Math.hypot(px - ex, py - ey);
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
}

// Navigation senses (tech/agent-navigation.md, N3). Set even when there is no
// hostile — an agent moving under a moveOrder still has a route. The router owns
// the values; this only exposes them, so a brain can ask "can I actually get
// there" without knowing what a node is. Published every frame, ahead of the
// cadence, for the reason given at the top of updateSense.
function publishNav(root, scene) {
  const n = navSense(root, scene);
  root.sense.routeSteps = n.routeSteps;
  root.sense.routeReachable = n.routeReachable;
  root.sense.navBlocked = n.navBlocked;
}

// The survival senses (tech/squad-survival.md, V1). Opted-in agents only; the
// flag is `root.survival`, which the companion bridge (ai.js) creates and whose
// two clocks it advances every frame — `sinceHurt` from the health drops it sees
// between ticks, `sinceThreat` since this last found a round inbound. Every
// threshold is a config knob and every published value a plain boolean or
// count, because an expression cannot read config.
function publishSurvival(root, scene, dt) {
  const sv = root.survival;
  if (!sv) return;
  const s = root.sense;
  const body = root.soldier || root;

  s.wounded = (root.maxHealth ? Math.max(0, root.health) / root.maxHealth : 1) < config.survivalWounded;

  // A round inbound on the STANDING box, whatever the stance: kneeling under a
  // round is being shot at. Blasts count here (predictHit leaves the explode rule
  // to the callers that must ignore them).
  const step = dt > 0 ? dt : 1 / 60;
  const box = standingBox(root, root.x);
  const steps = Math.ceil(config.survivalLookahead / step);
  let inbound = false;
  for (const p of scene.projectiles) {
    if (predictHit(scene, p, body, () => box, step, steps, root._ctx || {}) >= 0) { inbound = true; break; }
  }
  if (inbound) sv.sinceThreat = 0;
  s.underFire = inbound || sv.sinceHurt < config.survivalHurtWindow;
  s.calm = sv.sinceHurt >= config.survivalCalmTime && sv.sinceThreat >= config.survivalCalmTime;

  // `magsLeft` drops at the END of a reload, so a reload in progress still
  // counts its own magazine as a spare, and the empty-and-reloading case is
  // needReload rather than outOfAmmo. A body with no magazine never runs dry.
  const w = body.weapon;
  const empty = !!(w && w.magazine) && body.ammo <= 0;
  const reloading = body.reloading > 0;
  const spare = body.magsLeft === undefined || body.magsLeft > 0;
  s.needReload = empty && reloading;
  s.outOfAmmo = empty && !reloading && !spare;

  // Hysteresis: past the leash sets it, back inside the leash minus the margin
  // clears it. Only a live leader can be far; the spawn-point anchor cannot.
  if (!root.anchor) sv.leaderFar = false;
  else if (s.anchorDist > config.survivalLeash) sv.leaderFar = true;
  else if (s.anchorDist < config.survivalLeash - config.survivalLeashMargin) sv.leaderFar = false;
  s.leaderFar = !!sv.leaderFar;

  s.exposure = exposureAt(root, scene, root.x + root.w / 2, box.y + box.h / 2);
  const t = nearestHostile(root, scene);
  s.shot = !!t && canHit(scene, root, root.x + root.w / 2, root.y + root.h / 2, t.x + t.w / 2, t.y + t.h / 2);
}

// A soldier's standing box with its left edge at `x`, hung off the current feet
// line — the box exposure is measured against, whatever the stance right now.
function standingBox(root, x) {
  const h = root.soldier ? STAND_H : root.h;
  return { x, y: root.y + root.h - h, w: root.w, h };
}

// How many living hostiles of `root` can hit a body whose standing centre is at
// (x, y). The one exposure count: V1's own-spot sense and V2's spot scores.
export function exposureAt(root, scene, x, y) {
  let n = 0;
  for (const h of hostilesFor(root, scene)) {
    if (!h || !h.alive) continue;
    if (canHit(scene, h, h.x + h.w / 2, h.y + h.h / 2, x, y)) n++;
  }
  return n;
}

// CAN-HIT: can a round from `shooter`, leaving (x0, y0), reach (x1, y1)? The
// one predicate this system asks about shots, in both directions — theirs at
// me, mine at them. In V1 it is line of sight; V4 makes it the round's own
// flight. New code calls this, never losBetween.
export function canHit(scene, shooter, x0, y0, x1, y1) {
  return losBetween(x0, y0, x1, y1, scene.platforms);
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
// actually closest.
//
// NULL when nothing in the list is alive, which is the honest answer and what
// every caller here already handles. It used to degrade to `list[0]` — but a
// mission never empties scene.specRoots (a dead root stays for the kill/loot
// pass), so a cleared level handed companions a CORPSE as their target: they
// held keepDistance off the death spot and kept firing forever, never dropping
// back to escort. test/companion-idle.test.mjs is the guard.
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
  return best;
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
// exported so a caller can ask it about a place the agent is NOT standing —
// which is what choosing somewhere to move to requires
// (tech/ranged-repositioning.md). Exported rather than imported the other way
// round on purpose: this module already imports navigation.js for navSense, so
// the resolver takes this as an injected predicate instead of importing back.
export function losBetween(x0, y0, x1, y1, platforms) {
  return !blocked(x0, y0, x1, y1, platforms);
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
