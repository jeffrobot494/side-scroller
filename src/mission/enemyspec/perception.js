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

  s.exposure = spotExposure(root, scene, root.x + root.w / 2, box.y + box.h / 2);
  s.shot = myShot(scene, root, root, nearestHostile(root, scene));
}

// A soldier's standing box with its left edge at `x`, hung off the current feet
// line — the box exposure is measured against, whatever the stance right now.
function standingBox(root, x) {
  const h = root.soldier ? STAND_H : root.h;
  return { x, y: root.y + root.h - h, w: root.w, h };
}

// How many living hostiles of `root` can hit a body whose standing centre is at
// (x, y). The one exposure count: the own-spot sense, V2's spot scores and
// cover. Against a SOLDIER's standing box, since only squadmates ask.
export function exposureAt(root, scene, x, y) {
  const box = { x: x - root.w / 2, y: y - STAND_H / 2, w: root.w, h: STAND_H };
  let n = 0;
  for (const h of hostilesFor(root, scene)) {
    if (!h || !h.alive) continue;
    if (theyCanHit(scene, h, box)) n++;
  }
  return n;
}

// THE SHARED EXPOSURE CACHE (tech/squad-survival.md, V2). One per scene, not
// per agent: exposure depends on the point and the hostiles, never on which
// squadmate asks, and every soldier has the same standing box. Refilled by the
// first opted-in agent to ask once it is a sense interval old — measured on
// `scene.survivalClock`, which the companion bridge advances (ai.js), so a
// seeded mission refills on the same frames every run. Keyed to the terrain's
// generation and the clearance policy, the graph identity navState checks;
// per-profile edge values (V5) key themselves by graph key inside it.
//
// Every opted-in agent is on the player team, so one cache answers for all of
// them. An enemy never reads it.
export function exposureCache(scene) {
  const now = scene.survivalClock || 0;
  const gen = scene.navGen || 0;
  const clearance = !!config.navClearance;
  let c = scene.exposureCache;
  if (!c || now - c.t >= SENSE_INTERVAL || c.gen !== gen || c.clearance !== clearance) {
    c = scene.exposureCache = { t: now, gen, clearance, points: new Map(), edges: new Map() };
  }
  return c;
}

// Exposure of a standing centre, through the cache. Rounded to the pixel: two
// probes a fraction of a pixel apart are the same place to a hostile.
export function spotExposure(root, scene, x, y) {
  const c = exposureCache(scene);
  const k = `${Math.round(x)},${Math.round(y)}`;
  let n = c.points.get(k);
  if (n === undefined) {
    n = exposureAt(root, scene, x, y);
    c.points.set(k, n);
  }
  return n;
}

// DANGEROUS ROUTES (tech/squad-survival.md, V5): the extra price, in seconds,
// of taking graph edge `e` out of node `from` — `survivalRouteExposureWeight`
// per hostile able to hit it, averaged over the edge's two ends: the point on
// the source surface nearest the destination, and where that lands on the
// destination. Handed to costsFrom as its per-caller weight, and kept in the
// shared cache under the graph's key, since node ids only mean something inside
// one graph. Null when the weight is 0, which routes exactly as before.
export function edgeExposure(root, scene, graph) {
  const w = config.survivalRouteExposureWeight;
  if (!w) return null;
  const c = exposureCache(scene);
  return (from, e) => {
    const k = `${graph.key}|${from}->${e.to}`;
    let v = c.edges.get(k);
    if (v === undefined) {
      const a = graph.nodes[from];
      const b = graph.nodes[e.to];
      const ax = Math.min(Math.max((b.a + b.b) / 2, a.a), a.b);
      const bx = Math.min(Math.max(ax, b.a), b.b);
      v = (spotExposure(root, scene, ax + root.w / 2, a.y - STAND_H / 2)
        + spotExposure(root, scene, bx + root.w / 2, b.y - STAND_H / 2)) / 2;
      c.edges.set(k, v);
    }
    return w * v;
  };
}

// ---- can-hit (tech/squad-survival.md, V4) ---------------------------------
// Seeing is not hitting. The one predicate this system asks about shots, in both
// directions, and it is the round's own flight: its origin, speed, gravity and
// lifetime, stopped by terrain. New code calls these, never losBetween.
//
// Cost rules, because exposure is candidates × hostiles × emitters: a straight
// round is ONE segment test against the platforms. A gravity round is flown at a
// coarse step (`survivalFlightStep`), each step's chord tested as a segment — an
// exact sweep, so a thin platform is never skipped between samples — against
// only the platforms overlapping the whole flight's bounding box, and it stops
// once it has passed the body. `flightTests.n` counts every segment and box test
// so the cost has a ceiling a test can freeze on any machine.
export const flightTests = { n: 0 };

// THEIRS: can any weapon of hostile `h` hit a body standing in `box`? Each
// projectile emitter in its tree, from its origin, with its speed, gravity and
// life. A straight one is tested aimed at the body; a gravity one across a fan
// of launch angles rising from the aim, so a lobber reaches over cover. A
// hostile with contact damage and no projectile emitter reaches a radius around
// itself. Spawned-entity emitters (`ref`) are not rounds and are not seen.
export function theyCanHit(scene, h, box) {
  const tx = box.x + box.w / 2;
  const ty = box.y + box.h / 2;
  let armed = false;
  let contact = false;
  const stack = [h];
  while (stack.length) {
    const e = stack.pop();
    if (!e.alive || e.disabled) continue;
    for (const c of e.children || []) stack.push(c);
    if (e.spec.contact && e.spec.contact.damage > 0) contact = true;
    const ems = e.spec.emitters;
    if (!ems) continue;
    for (const k in ems) {
      const p = ems[k].projectile;
      if (!p) continue;
      armed = true;
      const ox = e.x + e.w / 2 + ems[k].at[0];
      const oy = e.y + e.h / 2 + ems[k].at[1];
      const g = (p.gravity || 0) * scene.world.gravity;
      if (!g) {
        if (straightReaches(scene, ox, oy, tx, ty, p.speed, p.life, null)) return true;
        continue;
      }
      // No launch angle carries a round further across than speed × life, so a
      // body beyond that is out of reach before a single step is flown.
      if (Math.abs(tx - ox) - box.w / 2 > p.speed * p.life) continue;
      const b = Math.atan2(ty - oy, tx - ox);
      const up = Math.cos(b) >= 0 ? -1 : 1; // rotating toward straight up
      const n = Math.max(1, config.survivalLobCount);
      const fan = (config.survivalLobFan * Math.PI) / 180;
      for (let i = 0; i < n; i++) {
        const a = b + up * (n === 1 ? 0 : (fan * i) / (n - 1));
        if (arcReaches(scene, ox, oy, Math.cos(a) * p.speed, Math.sin(a) * p.speed, g, p.life, box, null)) return true;
      }
    }
  }
  if (armed || !contact) return false;
  return Math.hypot(h.x + h.w / 2 - tx, h.y + h.h / 2 - ty) <= config.survivalContactReach;
}

// MINE: can this squadmate's own round reach `t` from a body at `from` (a box)?
// From fire()'s muzzle origin, down the barrel updateCompanionSpec would point
// — the low arc for a gravity weapon, and no shot at all when no arc lands. It
// stops at an ally's box when friendly fire is on, the rule that decides whether
// it would hit that ally. Spread is ignored.
export function myShot(scene, root, from, t) {
  const body = root.soldier;
  const w = body && body.weapon;
  if (!w || !w.projectile || !t) return false;
  const p = w.projectile;
  const g = (p.gravity || 0) * scene.world.gravity;
  const dir = aimFrom(from, t.x + t.w / 2, t.y + t.h / 2, p.speed, g);
  if (!dir) return false;
  const o = muzzle(from, dir);
  const ctx = root._ctx || {};
  const allies = ctx.friendlyFire
    ? (scene.soldiers || []).filter((s) => s.alive && s !== body)
    : null;
  if (!g) return straightReaches(scene, o.x, o.y, t.x + t.w / 2, t.y + t.h / 2, p.speed, p.life, allies);
  return arcReaches(scene, o.x, o.y, dir.x * p.speed, dir.y * p.speed, g, p.life, t, allies);
}

// Where fire() launches a round from a body box along unit `dir` (ai.js).
export function muzzle(b, dir) {
  return { x: b.x + b.w / 2 + dir.x * (b.w / 2 + 6), y: b.y + b.h * 0.42 + dir.y * (b.h / 2 + 6) };
}

// The unit launch direction from a body box at a point (tx, ty): straight at it
// for a round with no gravity, else the LOW arc that lands on it, solved once
// from the gun height and once more from the muzzle that aim implies. Null when
// no arc reaches.
export function aimFrom(b, tx, ty, speed, g) {
  let o = { x: b.x + b.w / 2, y: b.y + b.h * 0.42 };
  let dir = null;
  for (let i = 0; i < 2; i++) {
    const d = g ? lowArc(tx - o.x, ty - o.y, speed, g) : unit(tx - o.x, ty - o.y);
    if (!d) return dir;
    dir = d;
    o = muzzle(b, dir);
  }
  return dir;
}

// The low-arc launch direction for a round at `v` under gravity `g` (px/s², y
// down) to cover (dx, dy), or null when it is out of reach.
export function lowArc(dx, dy, v, g) {
  const X = Math.abs(dx);
  if (X < 1e-6) return unit(0, dy);
  const up = -dy;
  const disc = v * v * v * v - g * (g * X * X + 2 * up * v * v);
  if (disc < 0) return null;
  const th = Math.atan((v * v - Math.sqrt(disc)) / (g * X)); // elevation, up positive
  return { x: Math.sign(dx) * Math.cos(th), y: -Math.sin(th) };
}

function unit(x, y) {
  const l = Math.hypot(x, y);
  return l < 1e-9 ? null : { x: x / l, y: y / l };
}

// A straight round from (x0, y0) aimed at (x1, y1): in range, and one segment
// clear of the platforms and of any `boxes` in the way.
function straightReaches(scene, x0, y0, x1, y1, speed, life, boxes) {
  if (Math.hypot(x1 - x0, y1 - y0) > speed * life) return false;
  flightTests.n += scene.platforms.length + (boxes ? boxes.length : 0);
  if (blocked(x0, y0, x1, y1, scene.platforms)) return false;
  return !boxes || !blocked(x0, y0, x1, y1, boxes);
}

// A gravity round launched at (vx, vy): does it reach `target` (a box) before
// terrain, one of `boxes`, the end of its life, or passing the target?
function arcReaches(scene, x0, y0, vx, vy, g, life, target, boxes) {
  let tEnd = life;
  if (Math.abs(vx) > 1e-6) {
    const far = vx > 0 ? target.x + target.w : target.x;
    const tPass = (far - x0) / vx;
    if (tPass < 0) return false;
    tEnd = Math.min(tEnd, tPass);
  }
  const at = (t) => ({ x: x0 + vx * t, y: y0 + vy * t + 0.5 * g * t * t });
  // The whole flight's bounding box, apex included, so every step below tests
  // only the platforms it could possibly meet.
  const e = at(tEnd);
  const tApex = -vy / g;
  const yTop = Math.min(y0, e.y, tApex > 0 && tApex < tEnd ? at(tApex).y : Infinity);
  const bb = { x: Math.min(x0, e.x), y: yTop, w: Math.abs(e.x - x0), h: Math.max(y0, e.y) - yTop };
  flightTests.n += scene.platforms.length;
  const near = scene.platforms.filter((p) => p.x <= bb.x + bb.w && p.x + p.w >= bb.x && p.y <= bb.y + bb.h && p.y + p.h >= bb.y);

  const step = config.survivalFlightStep;
  let a = at(0);
  for (let t = 0; t < tEnd; t += step) {
    const b = at(Math.min(tEnd, t + step));
    flightTests.n += 1 + near.length + (boxes ? boxes.length : 0);
    const hit = entry(a.x, a.y, b.x, b.y, target);
    let wall = Infinity;
    for (const p of near) wall = Math.min(wall, entry(a.x, a.y, b.x, b.y, p));
    if (boxes) for (const q of boxes) wall = Math.min(wall, entry(a.x, a.y, b.x, b.y, q));
    if (hit <= wall && hit < Infinity) return true;
    if (wall < Infinity) return false;
    a = b;
  }
  return false;
}

// Where along (x0, y0)→(x1, y1) the segment first enters box `p`, as 0..1, or
// Infinity for a miss. The slab method `blocked` uses, returning the entry.
function entry(x0, y0, x1, y1, p) {
  let tmin = 0;
  let tmax = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (const [d, o, lo, hi] of [[dx, x0, p.x, p.x + p.w], [dy, y0, p.y, p.y + p.h]]) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t0 = (lo - o) / d;
      let t1 = (hi - o) / d;
      if (t0 > t1) [t0, t1] = [t1, t0];
      tmin = Math.max(tmin, t0);
      tmax = Math.min(tmax, t1);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
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
