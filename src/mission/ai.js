// ---------------------------------------------------------------------------
// BEHAVIOR + COMBAT HELPERS  (Phases 2–4)
//
// Companion AI (follow the controlled soldier, shoot what they can see) and the
// enemy archetypes (charger, repositioning shooter, turret). Behaviors are
// driven entirely by parameters on the entity's def — no live LLM control.
// Also home to `fire()`, the one place a weapon turns into projectiles, shared
// by the player, companions, and enemies.
// ---------------------------------------------------------------------------

import { Projectile } from "./entities.js";

function center(e) {
  return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
}
function dist(a, b) {
  const c = center(a);
  const d = center(b);
  return Math.hypot(c.x - d.x, c.y - d.y);
}

// Spawn projectiles for `shooter` in unit direction `dir`. Respects fire rate
// via the shooter's fireCooldown (ticked centrally by the scene each frame).
// `accuracy` (0..1) widens spread as it drops — the player passes 1 (precise);
// AI passes a value derived from the aim stat.
export function fire(scene, shooter, dir, team, dt, accuracy = 1) {
  if (shooter.fireCooldown > 0) return false;

  const w = shooter.weapon;
  shooter.fireCooldown = 1 / w.fireRate;

  let dx = dir.x;
  let dy = dir.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  // spread: the weapon's own spread plus an accuracy penalty
  const spread = (w.spread || 0) + (1 - accuracy) * 0.12;
  if (spread) {
    const a = (Math.random() * 2 - 1) * spread;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const nx = dx * cos - dy * sin;
    const ny = dx * sin + dy * cos;
    dx = nx;
    dy = ny;
  }

  const spec = w.projectile;
  const ox = shooter.x + shooter.w / 2 + dx * (shooter.w / 2 + 6);
  const oy = shooter.y + shooter.h * 0.42 + dy * (shooter.h / 2 + 6);
  scene.projectiles.push(
    new Projectile(ox, oy, dx * spec.speed, dy * spec.speed, spec, team, w.effects, shooter)
  );
  return true;
}

// nearest living member of a list to `from`
function nearest(from, list) {
  let best = null;
  let bestD = Infinity;
  for (const e of list) {
    if (!e.alive) continue;
    const d = dist(from, e);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best ? { target: best, d: bestD } : null;
}

// A rough "can shoot it" test: within range and roughly level (so shots fired
// horizontally connect). Kept generous — run-and-gun wants aggression.
function canEngage(shooter, target, range) {
  const c = center(shooter);
  const t = center(target);
  if (Math.abs(c.x - t.x) > range) return false;
  if (Math.abs(c.y - t.y) > 70) return false;
  return true;
}

// ---- Companion AI ---------------------------------------------------------
// leader is the currently-controlled soldier. Companions keep loose formation
// and open fire on any enemy they can line up.
export function updateCompanion(soldier, dt, scene, leader) {
  if (!soldier.alive) return;

  const c = center(soldier);
  const target = nearest(soldier, scene.enemies);

  let move = 0;
  let jump = false;

  // Engage an enemy that's already lined up; otherwise stick with the leader.
  if (target && target.d < 520 && Math.abs(center(target.target).y - c.y) < 70) {
    const tx = center(target.target).x;
    soldier.facing = tx >= c.x ? 1 : -1;
    // keep a little standoff distance so companions don't body-block
    if (target.d > 240) move = soldier.facing;
    soldier.aimUp = false;
    const accuracy = 0.5 + soldier.data.stats.aim * 0.05;
    fire(scene, soldier, { x: soldier.facing, y: 0 }, "player", dt, accuracy);
  } else if (leader && leader !== soldier) {
    const lc = center(leader);
    const gap = lc.x - c.x;
    if (Math.abs(gap) > 90) move = Math.sign(gap);
    // hop if the leader is meaningfully above and we're stuck on the ground
    if (soldier.onGround && lc.y < c.y - 60 && Math.abs(gap) < 140) jump = true;
  }

  soldier.applyMovement(dt, move, jump);
}

// ---- Enemy AI -------------------------------------------------------------
export function updateEnemy(enemy, dt, scene) {
  if (!enemy.alive) return;
  const found = nearest(enemy, scene.soldiers);

  if (!found || found.d > enemy.def.detectRange) {
    // idle: bleed off horizontal speed (gravity/collision still runs in the
    // scene's stepActor pass afterward)
    enemy.vx *= 0.8;
    return;
  }

  const target = found.target;
  const c = center(enemy);
  const t = center(target);
  enemy.facing = t.x >= c.x ? 1 : -1;

  switch (enemy.def.behavior) {
    case "charger":
      // barrel straight at the target; damage is dealt on contact by the scene
      enemy.vx = enemy.facing * enemy.def.speed;
      // hop over low obstacles / up to the target
      if (enemy.onGround && (t.y < c.y - 40 || Math.abs(enemy.vx) < 5)) enemy.vy = -560;
      break;

    case "shooter": {
      // hold preferred range: advance if far, retreat if crowded
      const range = enemy.def.preferredRange;
      if (found.d > range + 60) enemy.vx = enemy.facing * enemy.def.speed;
      else if (found.d < range - 90) enemy.vx = -enemy.facing * enemy.def.speed;
      else enemy.vx *= 0.7;
      tryTelegraphedShot(enemy, target, dt, scene);
      break;
    }

    case "turret":
      enemy.vx = 0;
      tryTelegraphedShot(enemy, target, dt, scene);
      break;
  }
}

// A ranged enemy winds up (a visible telegraph) before each shot, then fires
// toward the target if still lined up.
function tryTelegraphedShot(enemy, target, dt, scene) {
  const c = center(enemy);
  const t = center(target);
  const inRange = canEngage(enemy, target, enemy.def.detectRange);

  if (enemy.windup > 0) {
    enemy.windup -= dt;
    if (enemy.windup <= 0 && inRange) {
      const dir = { x: t.x - c.x, y: t.y - c.y };
      // force cooldown ready so the shot fires now
      enemy.fireCooldown = 0;
      fire(scene, enemy, dir, "enemy", dt, 0.85);
      enemy.fireCooldown = 1 / enemy.weapon.fireRate;
    }
    return;
  }

  if (inRange && enemy.fireCooldown <= 0) {
    enemy.windup = enemy.def.windup; // begin telegraph
  }
}
