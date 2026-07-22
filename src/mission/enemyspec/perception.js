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
// ---------------------------------------------------------------------------

const SENSE_INTERVAL = 0.2;
const EDGE = 90;

export function updateSense(root, scene, dt) {
  const m = root.memory;
  m.timeSinceSeen += dt;
  m.senseTimer -= dt;
  if (m.senseTimer > 0) return;
  m.senseTimer = SENSE_INTERVAL;

  const t = firstLiving(scene.soldiers);
  const s = root.sense;
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

  const ex = root.x + root.w / 2;
  const ey = root.y + root.h / 2;
  const px = t.x + t.w / 2;
  const py = t.y + t.h / 2;

  s.dist = Math.hypot(px - ex, py - ey);
  s.los = !blocked(ex, ey, px, py, scene.platforms);
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
  }
  s.timeSinceSeen = m.timeSinceSeen;
  s.lastSeenX = m.lastSeenX;
  s.lastSeenY = m.lastSeenY;
}

function firstLiving(list) {
  for (const s of list) if (s.alive) return s;
  return null;
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
