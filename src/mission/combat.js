// ---------------------------------------------------------------------------
// COMBAT — shared projectile + effect resolution.
//
// Extracted from the Mission scene so the SAME rules run in the real mission and
// in the editor's Firing Room (the tool tests real behavior, not a mock). Pure
// simulation: it mutates the scene and calls back through `ctx` for the things
// that differ between callers — presentation and bookkeeping:
//
//   ctx.friendlyFire   bool — player shots can hit soldiers too
//   ctx.damageMult     number — multiplier on soldier-dealt damage
//   ctx.damage(t,a,o)  apply `a` damage to `t` from owner `o` (does hit flash + kill)
//   ctx.kill(t,o)      kill `t` crediting `o` (used by burn ticks)
//   ctx.spark(x,y,color,n,spd) / ctx.burst(x,y,color,n,spd)   cosmetics (optional)
//
// Sound is the one presentation hook that hangs off the SCENE rather than ctx
// (`scene.sound(cueId, { x, y })`), because ai.js `fire()` — the most important
// sound in the game — takes a scene and no ctx. The scene's owner installs it;
// headless tests leave it unset, so every call here is guarded and silent.
//
// Effect kinds (see weaponcost.js): damage, burn, slow, knockback, explode,
// chain are resolved here on hit; pellets is a fire-time modifier (ai.js fire),
// pierce + homing are read off the projectile here.
// ---------------------------------------------------------------------------

import { overlaps, STAND_H, CROUCH_H } from "./entities.js";
import { config } from "../game/config.js";

function centerOf(a) {
  return { x: a.x + a.w / 2, y: a.y + a.h / 2 };
}
function distC(a, b) {
  const c = centerOf(a), d = centerOf(b);
  return Math.hypot(c.x - d.x, c.y - d.y);
}
function clampNum(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Living actors a projectile of `team` may damage with AoE/chain (opposing side).
function opponents(scene, team) {
  return team === "player" ? scene.enemies : scene.soldiers;
}
function nearestOpponent(scene, p) {
  let best = null, bd = Infinity;
  for (const o of opponents(scene, p.team)) {
    if (!o.alive || o === p.owner) continue;
    const d = distC(p, o);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// ---- per-frame projectile update -----------------------------------------

export function updateProjectiles(scene, dt, ctx) {
  for (const p of scene.projectiles) {
    if (p.dead) continue;

    advance(p, dt, scene);
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }

    // Walls stop shots.
    let hitWall = false;
    for (const plat of scene.platforms) {
      if (overlaps(p, plat)) { hitWall = true; break; }
    }
    if (hitWall) {
      p.dead = true;
      ctx.spark && ctx.spark(p.x, p.y, p.color, 4, 90);
      scene.sound && scene.sound("impact.wall", { x: p.x, y: p.y });
      continue;
    }

    // Target set (squad-only friendly fire; a shot never hits its own owner).
    const targets =
      p.team === "player"
        ? (ctx.friendlyFire ? [...scene.enemies, ...scene.soldiers] : scene.enemies)
        : scene.soldiers;

    for (const t of targets) {
      if (t === p.owner || !t.alive || !overlaps(p, t)) continue;
      if (p._hit && p._hit.has(t)) continue; // already pierced this one
      resolveHit(scene, p, t, ctx);
      ctx.spark && ctx.spark(p.x, p.y, p.color, 7, 150);
      // A shotgun lands 6 pellets in the same millisecond; the cue's cooldown
      // (bank.js) collapses those into one impact rather than six stacked ones.
      // `p.sound`/`p.soundGain` are the firing weapon's impact cue and level,
      // stamped on at fire time (ai.js). EnemySpec emitter projectiles carry
      // neither, so they fall back to their shape's timbre at unit gain.
      scene.sound &&
        scene.sound(p.sound || (p.shape ? `impact.hit.${p.shape}` : "impact.hit"),
          { x: p.x, y: p.y, gain: p.soundGain ?? 1 });

      const pierce = (p.effects || []).find((e) => e.kind === "pierce");
      if (pierce) {
        if (p._pierceLeft === undefined) p._pierceLeft = pierce.count || 0;
        (p._hit || (p._hit = new Set())).add(t);
        if (p._pierceLeft > 0) p._pierceLeft--;
        else p.dead = true;
      } else {
        p.dead = true;
      }
      break;
    }
  }
  scene.projectiles = scene.projectiles.filter((p) => !p.dead);
}

// Move a projectile, steering toward the nearest opponent if it homes.
function advance(p, dt, scene) {
  const homing = (p.effects || []).find((e) => e.kind === "homing");
  if (homing) {
    const target = nearestOpponent(scene, p);
    if (target) {
      const tc = centerOf(target);
      const want = Math.atan2(tc.y - (p.y + p.h / 2), tc.x - (p.x + p.w / 2));
      const cur = Math.atan2(p.vy, p.vx);
      const speed = Math.hypot(p.vx, p.vy) || 1;
      let d = want - cur;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const na = cur + clampNum(d, -(homing.turn || 3) * dt, (homing.turn || 3) * dt);
      p.vx = Math.cos(na) * speed;
      p.vy = Math.sin(na) * speed;
    }
  }
  const n = stepProjectile(p, p, dt, scene.world);
  p.x = n.x;
  p.y = n.y;
  p.vy = n.vy;
}

// ONE frame of a round's motion as a NEW state — the gravity fraction, then the
// integration. `advance` applies it in place; the duck predicate below walks a
// round forward with it WITHOUT touching the round it is judging, which is why
// this is non-mutating rather than the in-place step it replaced.
//
// Arc: a projectile with gravity>0 falls under a fraction of world gravity, so
// lobbed weapons (rockets, grenades) drop. gravity===0 (the default) leaves
// every existing weapon on a straight line, unchanged.
//
// Homing steering stays in `advance` alone: a predicted round flies straight,
// which is exactly why a duck against a homing round sometimes fails
// (tech/soldier-ducking.md, approximation 2).
export function stepProjectile(p, from, dt, world) {
  const vy = p.gravity > 0 ? from.vy + p.gravity * world.gravity * dt : from.vy;
  return { x: from.x + from.vx * dt, y: from.y + vy * dt, vx: from.vx, vy };
}

// ---- duck prediction (tech/soldier-ducking.md, D1) ------------------------

// Would kneeling save THIS soldier from THIS round? Read-only: neither the
// round nor the soldier is touched.
//
// The walk reproduces updateProjectiles' own order — advance, expire, terrain —
// so a predicted hit and an actual hit cannot disagree on the last frame of a
// round's life, which is the frame that matters most. It answers on the first
// frame the round reaches the soldier: true when the round lands on the standing
// box and misses the crouched one.
//
// Bodies are NOT blockers, friendly or hostile: anything in the line of fire can
// move, duck, or die before the round arrives, so a soldier behind one stays
// ready. It will sometimes kneel for a round something else absorbs; being
// caught standing because someone else was expected to take it is worse.
export function duckableShot(scene, p, s, dt, ctx = {}) {
  if (p.dead || !s.alive || p.owner === s) return false;
  // Who a round may hit is updateProjectiles' rule, not geometry — without it a
  // squadmate ducks its own side's fire and the leader's.
  if (p.team === "player" && !ctx.friendlyFire) return false;
  // "Anything where getting smaller does not help" (design/soldier-behavior.md).
  // A blast resolves by CENTRE DISTANCE from the impact point across every
  // opposing actor, so a crouched box the round missed is caught anyway by a
  // detonation on the soldier behind. A purely geometric predicate gets this
  // wrong, so it is a rule rather than an approximation.
  if ((p.effects || []).some((e) => e.kind === "explode")) return false;

  // Both boxes hang off the feet line, the way setCrouch preserves it — so this
  // answers the same question whichever stance the soldier is in right now.
  const feet = s.y + s.h;
  const stand = { x: s.x, y: feet - STAND_H, w: s.w, h: STAND_H };
  const crouch = { x: s.x, y: feet - CROUCH_H, w: s.w, h: CROUCH_H };

  const box = { x: p.x, y: p.y, w: p.w, h: p.h };
  let at = { x: p.x, y: p.y, vx: p.vx, vy: p.vy };
  let life = p.life;
  const steps = Math.ceil(config.duckLookahead / dt);
  for (let i = 0; i < steps; i++) {
    at = stepProjectile(p, at, dt, scene.world);
    life -= dt;
    if (life <= 0) return false; // died of old age before it arrived
    box.x = at.x;
    box.y = at.y;
    // Terrain is a stopping condition on the same walk, not a separate pass: a
    // straight line-of-sight test would report an arcing pod blocked when it
    // clears the wall, and clear when it arcs into it.
    for (const plat of scene.platforms) if (overlaps(box, plat)) return false;
    if (overlaps(box, stand)) return !overlaps(box, crouch);
  }
  return false;
}

// ---- effect resolution ----------------------------------------------------

export function resolveHit(scene, p, target, ctx) {
  applyEffects(scene, target, p.effects, p.owner, ctx, { x: p.x + p.w / 2, y: p.y + p.h / 2, vx: p.vx, team: p.team });
}

// Apply an effect list to `target`. `at` gives the impact point/direction/team
// for AoE, knockback, and chain. Delivery modifiers (pellets/pierce/homing) are
// ignored here — they act at fire time / on the projectile.
export function applyEffects(scene, target, effects, owner, ctx, at = {}) {
  const mult = owner && owner.kind === "soldier" ? (ctx.damageMult ?? 1) : 1;
  const dir = Math.sign(at.vx || 0) || (owner ? owner.facing || 1 : 1);
  const team = at.team || (owner && owner.kind === "soldier" ? "player" : "enemy");
  const cx = at.x ?? target.x + target.w / 2;
  const cy = at.y ?? target.y + target.h / 2;

  for (const fx of effects || []) {
    switch (fx.kind) {
      case "damage":
        ctx.damage(target, (fx.amount || 0) * mult, owner);
        break;
      case "burn":
        target.burn = { dps: (fx.dps || 0) * mult, time: fx.duration }; // refreshes on re-hit
        target._burnOwner = owner;
        break;
      case "slow":
        target.slow = { factor: clampNum(fx.factor ?? 1, 0, 1), time: fx.duration };
        break;
      case "knockback":
        target.vx += dir * (fx.force || 0);
        target.vy -= (fx.force || 0) * 0.35;
        break;
      case "explode": {
        ctx.burst && ctx.burst(cx, cy, "#ff9b4a", 14, 220);
        scene.sound && scene.sound("impact.explode", { x: cx, y: cy });
        for (const o of opponents(scene, team)) {
          if (!o.alive) continue;
          const oc = centerOf(o);
          if (Math.hypot(oc.x - cx, oc.y - cy) <= (fx.radius || 0)) ctx.damage(o, (fx.amount || 0) * mult, owner);
        }
        break;
      }
      case "chain": {
        const pool = opponents(scene, team).filter((o) => o.alive && o !== target);
        const hit = new Set([target]);
        let from = target;
        for (let j = 0; j < (fx.jumps || 0); j++) {
          let best = null, bd = Infinity;
          for (const o of pool) {
            if (hit.has(o)) continue;
            const d = distC(from, o);
            if (d <= (fx.range || 0) && d < bd) { bd = d; best = o; }
          }
          if (!best) break;
          ctx.damage(best, (fx.amount || 0) * mult, owner);
          ctx.spark && ctx.spark(best.x + best.w / 2, best.y + best.h / 2, "#8fd0ff", 6, 120);
          scene.sound && scene.sound("impact.chain", { x: best.x + best.w / 2, y: best.y + best.h / 2 });
          hit.add(best);
          from = best;
        }
        break;
      }
    }
  }
}

// ---- status ticks (burn DoT, slow expiry, hit-flash decay) ----------------

export function updateStatuses(scene, dt, ctx) {
  const all = [...scene.soldiers, ...scene.enemies];
  for (const a of all) {
    if (a.hitFlash > 0) a.hitFlash -= dt;
    if (a.burn) {
      a.health -= a.burn.dps * dt;
      a.burn.time -= dt;
      if (a.burn.time <= 0) a.burn = null;
      if (a.alive && a.health <= 0) ctx.kill(a, a._burnOwner);
    }
    if (a.slow) {
      a.slow.time -= dt;
      if (a.slow.time <= 0) a.slow = null;
    }
  }
}
