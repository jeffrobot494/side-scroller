// ---------------------------------------------------------------------------
// LOCOMOTION — one brain, many bodies (tech/locomotion.md, Slice L1).
//
// The brain layer decides WHAT an agent wants each frame and hands a locomotor
// exactly ONE MotionRequest; the locomotor — chosen by the body — decides HOW
// that body satisfies it, then integrates physics and sets facing. The locomotor
// is the single actuation point: it owns vy semantics (a legged body leaves vy
// to gravity except when it jumps/hops; a flyer steers vy directly), the jump
// impulse, and the traversal hop. It is STATELESS — dash/moveOrder/patrol state
// lives on the entity and the brain layer reads it to choose the request.
//
// MotionRequest kinds (all carry `target` for facing):
//   coast                          — leave velocity; physics carries it
//   stop                           — full halt (legged: vx=0; flyer: vx=vy=0)
//   stopX                          — zero horizontal only, keep vy (a hovering halt)
//   brakeX {factor}                — decay vx toward 0, keep vy
//   driveX {v, hopToward?}         — set vx=v; legged hops if hopToward is above
//   steer {point, speed}           — head to a world point (legged: x only; flyer: x+y)
//   holdRange {point, min, max, speed} — close/open to hold a distance band
//   burst {ux, uy, speed, expire}  — a committed dash in a UNIT direction; each
//                                    body picks its axes (legged: x only). On the
//                                    expiring frame the horizontal decays to 0.4×.
//   kinematic {style, ...resolved} — flyer-only body motion, applied verbatim
//                                     (home | orbit | hover; brain pre-resolves points)
//
// This is a behavior-preserving extraction: every branch reproduces the exact
// arithmetic the fused moveEntity/applyMotion used before. The locomotion
// characterization suite (test/locomotion.golden.json) is the guard.
// ---------------------------------------------------------------------------

import { stepActor, canJump, consumeJump } from "./entities.js";
import { config } from "../game/config.js";

const cx = (e) => e.x + e.w / 2;
const cy = (e) => e.y + e.h / 2;

// How hard THIS body jumps (tech/agent-navigation.md, N2). One number per body,
// authored as `body.jump` and falling back to `config.enemyJump` — not baked in
// by normalize, so moving the config knob moves every spec that did not author
// one. Exported because N3's profile builder must derive an envelope from the
// same number the locomotor actually applies; two readers of one field is fine,
// two definitions of the impulse is what this slice removed.
//
// Before N2 a legged body had TWO impulses that disagreed: the reflex hop
// (`enemyHopImpulse` 560) out-jumped the brain's own scored `jump` action
// (`enemyJumpImpulse` 520), so deciding to jump got you less height than not
// deciding to. A jump envelope cannot be defined against that.
export function bodyJump(ent) {
  const j = ent.spec && ent.spec.body ? ent.spec.body.jump : undefined;
  return j === undefined ? config.enemyJump : j;
}

export function locomotorFor(ent) {
  const b = ent.spec.body;
  if (b.locomotor === "soldier") return SOLDIER; // a companion driving a Soldier body
  return b.gravity === 0 ? FLYING : LEGGED;
}

// A grounded body: shared platform integrator, jumps and hops to traverse.
const LEGGED = {
  apply(ent, req, dt, scene) {
    actuateHorizontal(ent, req);
    if (req.kind === "driveX" && req.hopToward && canJump(ent) && req.hopToward.y < cy(ent) - 40) {
      ent.vy = -bodyJump(ent);
      consumeJump(ent);
    }
    // physics: shared grounded integrator, gravity scaled for fractional/2x bodies
    const g = ent.spec.body.gravity;
    const world = g === 1 ? scene.world : { ...scene.world, gravity: scene.world.gravity * g };
    stepActor(ent, dt, world, scene.platforms);
    face(ent, req.target);
  },
  jump(ent, vy) {
    if (!canJump(ent)) return;
    ent.vy = -(vy || bodyJump(ent));
    consumeJump(ent);
  },
};

// A flying body: free integrator clamped to the world box; steers in x AND y and
// applies the kinematic styles verbatim.
const FLYING = {
  apply(ent, req, dt, scene) {
    if (req.kind === "kinematic") applyKinematic(ent, req, dt);
    else {
      actuateHorizontal(ent, req);
      // a flyer resolves vertical intent the legged body leaves to gravity
      if (req.kind === "stop") ent.vy = 0;
      else if (req.kind === "steer") ent.vy = componentToward(ent, req.point, req.speed, "y");
      else if (req.kind === "holdRange") ent.vy = 0;
      else if (req.kind === "burst") ent.vy = req.uy * req.speed; // full vertical, undamped on expiry
    }
    const slow = ent.slow && ent.slow.time > 0 ? ent.slow.factor : 1;
    ent.x += ent.vx * slow * dt;
    ent.y += ent.vy * slow * dt;
    ent.x = Math.max(0, Math.min(scene.world.width - ent.w, ent.x));
    ent.y = Math.max(-80, Math.min(scene.world.height - ent.h, ent.y));
    face(ent, req.target);
  },
  // Inert, and kept only so `locomotorFor(x).jump()` is total. A flyer never
  // calls stepActor, so nothing ever sets its `onGround` — `body.jump` is
  // meaningless here, which is why validate.js does not police it on flyers the
  // way it does on soldier bodies (where it reads as authoritative and is not).
  jump(ent, vy) {
    if (ent.onGround) ent.vy = -(vy || bodyJump(ent));
  },
};

// A player Soldier driven by the shared brain (a companion). Translates a
// steering intent into a `move` sign + `jump` bool and hands it to the Soldier's
// own movement code — the SAME path player input uses — so companions accelerate,
// crouch-lock, and reload exactly like a controlled soldier. It never integrates
// physics (the mission steps the Soldier) and never receives a kinematic request.
// The linked Soldier is `ent.soldier`; the mission skips this entirely for the
// soldier the player currently controls (input drives it), preserving swap.
const SOLDIER = {
  apply(ent, req, dt, scene) {
    const s = ent.soldier;
    if (!s) return;
    let move = 0;
    let jump = !!ent.pendingJump; // a brain `jump` step queued this (SOLDIER.jump)
    ent.pendingJump = false;
    switch (req.kind) {
      case "driveX":
        move = Math.sign(req.v);
        if (req.hopToward && wantHop(s, req.hopToward)) jump = true;
        break;
      case "burst":
        move = Math.sign(req.ux); // a soldier can't dash; commit to the run
        break;
      case "steer":
        move = Math.sign(req.point.x - cx(s));
        if (wantHop(s, req.point)) jump = true;
        break;
      case "holdRange": {
        const d = Math.hypot(req.point.x - cx(s), req.point.y - cy(s));
        const dir = req.point.x >= cx(s) ? 1 : -1;
        if (d > req.max) move = dir;
        else if (d < req.min) move = -dir;
        break;
      }
      // stop / stopX / brakeX / coast → hold still (friction decays vx)
    }
    s.applyMovement(dt, move, jump);
    // face movement, else the target — so the equipped-weapon fire aims right
    if (move !== 0) s.facing = move > 0 ? 1 : -1;
    else if (req.target) s.facing = cx(req.target) >= cx(s) ? 1 : -1;
    ent.facing = s.facing;
    // mirror the body back so perception/expressions read a live velocity
    ent.vx = s.vx;
    ent.vy = s.vy;
    ent.onGround = s.onGround;
  },
  jump(ent) {
    ent.pendingJump = true;
  },
};

// A grounded soldier hops when its goal point sits well above and it can still
// jump — planted, or inside the coyote window, same as the legged hop above.
function wantHop(s, point) {
  return canJump(s) && point.y < cy(s) - 60;
}

// The horizontal write shared by both bodies (a flyer layers vy on top).
function actuateHorizontal(ent, req) {
  switch (req.kind) {
    case "coast":
      return;
    case "stop":
    case "stopX":
      ent.vx = 0;
      return;
    case "brakeX":
      ent.vx *= req.factor;
      return;
    case "driveX":
      ent.vx = req.v;
      return;
    case "burst":
      // horizontal component of the unit burst; the expiring frame decays to 0.4×
      ent.vx = req.ux * req.speed * (req.expire ? 0.4 : 1);
      return;
    case "steer":
      ent.vx = componentToward(ent, req.point, req.speed, "x");
      return;
    case "holdRange": {
      const d = Math.hypot(req.point.x - cx(ent), req.point.y - cy(ent));
      const dir = req.point.x >= cx(ent) ? 1 : -1;
      if (d > req.max) ent.vx = dir * req.speed;
      else if (d < req.min) ent.vx = -dir * req.speed;
      else ent.vx *= 0.7;
      return;
    }
  }
}

// One axis of a normalized velocity toward a point at `speed` (steerToward split
// so a legged body can take just x while a flyer takes both).
function componentToward(ent, point, speed, axis) {
  const dx = point.x - cx(ent);
  const dy = point.y - cy(ent);
  const len = Math.hypot(dx, dy) || 1;
  return ((axis === "x" ? dx : dy) / len) * speed;
}

// Flyer-only body motions. The brain pre-resolves every world point (center /
// drift target / ground surface) so this stays purely mechanical.
function applyKinematic(ent, req, dt) {
  switch (req.style) {
    case "home": {
      const want = Math.atan2(req.point.y - cy(ent), req.point.x - cx(ent));
      const cur = Math.atan2(ent.vy, ent.vx);
      let d = want - cur;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const maxTurn = req.turnRate * dt;
      const ang = Math.hypot(ent.vx, ent.vy) < 1 ? want : cur + Math.max(-maxTurn, Math.min(maxTurn, d));
      ent.vx = Math.cos(ang) * req.speed;
      ent.vy = Math.sin(ang) * req.speed;
      return;
    }
    case "orbit": {
      ent.orbitAngle += req.degPerSec * dt;
      const rad = (ent.orbitAngle * Math.PI) / 180;
      ent.x = req.center.x + Math.cos(rad) * req.radius - ent.w / 2;
      ent.y = req.center.y + Math.sin(rad) * req.radius - ent.h / 2;
      ent.vx = 0;
      ent.vy = 0; // position is authoritative; don't double-integrate
      return;
    }
    case "hover": {
      ent.hoverPhase += req.rate * dt;
      // altitude-hold: ease the bob anchor toward `altitude` px above the ground
      // beneath (climbs over perches, descends past them). groundTop is null when
      // the design keeps the legacy spawn-anchored bob.
      if (req.groundTop !== null) {
        const desired = req.groundTop - req.altitude - ent.h;
        const climb = req.climbSpeed * dt;
        const dy = desired - ent.anchorY;
        ent.anchorY += Math.max(-climb, Math.min(climb, dy));
      }
      ent.y = ent.anchorY + Math.sin(ent.hoverPhase) * req.amplitude;
      if (req.driftTargetX !== null) {
        const dx = req.driftTargetX - cx(ent);
        ent.vx = Math.abs(dx) > 30 ? Math.sign(dx) * req.driftSpeed : 0;
      }
      ent.vy = 0;
      return;
    }
  }
}

// Face movement, or the target when standing still — the last word each frame,
// so a wall-stopped body (stepActor zeroed vx) still turns to face.
function face(ent, target) {
  if (Math.abs(ent.vx) > 8) ent.facing = ent.vx > 0 ? 1 : -1;
  else if (target) ent.facing = cx(target) >= cx(ent) ? 1 : -1;
}
