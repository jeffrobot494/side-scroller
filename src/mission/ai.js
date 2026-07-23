// ---------------------------------------------------------------------------
// BEHAVIOR + COMBAT HELPERS  (Phases 2–4)
//
// Companion AI (follow the controlled soldier, shoot what they can see) plus
// `fire()`, the one place a weapon turns into projectiles, shared by the player,
// companions, and EnemySpec enemies. Enemy behavior itself lives in the
// EnemySpec runtime (src/mission/enemyspec/) — the legacy charger/shooter/turret
// archetypes were retired when EnemySpec was wired into missions.
// ---------------------------------------------------------------------------

import { Projectile, startReload } from "./entities.js";
import { config } from "../game/config.js";

// Map a 1..10 Aim stat to a 0..1 accuracy (10 = perfectly tight, 1 = loosest).
// Feeds the spread penalty in fire() so higher-Aim shooters group tighter.
export function aimAccuracy(aim) {
  const a = (((aim ?? 5) - 1) / 9);
  return a < 0 ? 0 : a > 1 ? 1 : a;
}

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
  // Empty magazine or mid-reload → nothing happens (you must reload).
  if (shooter.reloading > 0) return false;
  if (shooter.ammo !== undefined && shooter.ammo <= 0) return false;

  const w = shooter.weapon;
  shooter.fireCooldown = 1 / w.fireRate;
  // One trigger pull spends one round (a shotgun's pellets are still one shell).
  if (w.magazine && shooter.ammo !== undefined && shooter.ammo !== Infinity) shooter.ammo -= 1;

  let dx = dir.x;
  let dy = dir.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  // A `pellets` delivery effect fires `count` projectiles across an extra arc
  // (shotgun). Without it this loops once and behaves exactly as a single shot.
  const pellets = (w.effects || []).find((e) => e.kind === "pellets");
  const count = pellets ? Math.max(1, pellets.count || 1) : 1;
  const arc = pellets ? (pellets.spread ?? 0.12) : 0;

  // spread: the weapon's own spread plus an Aim-driven accuracy penalty (scaled
  // by config.aimSpread) plus the pellet arc.
  const spread = (w.spread || 0) + (1 - accuracy) * config.aimSpread + arc;
  const spec = w.projectile;

  for (let i = 0; i < count; i++) {
    let ax = dx;
    let ay = dy;
    if (spread) {
      const a = (Math.random() * 2 - 1) * spread;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      ax = dx * cos - dy * sin;
      ay = dx * sin + dy * cos;
    }
    const ox = shooter.x + shooter.w / 2 + ax * (shooter.w / 2 + 6);
    const oy = shooter.y + shooter.h * 0.42 + ay * (shooter.h / 2 + 6);
    scene.projectiles.push(
      new Projectile(ox, oy, ax * spec.speed, ay * spec.speed, spec, team, w.effects, shooter)
    );
  }
  // cosmetic: a brief muzzle flash the renderer draws at the barrel tip
  shooter.muzzleFlash = 0.055;
  shooter.muzzleDir = { x: dx, y: dy };
  shooter.muzzleColor = spec.color;
  return true;
}

// AI can't press a reload key, so it reloads itself the instant it runs dry.
// (Built-in enemies use magazine-less weapons, so this is a no-op for them.)
function autoReload(actor) {
  if (actor.weapon && actor.weapon.magazine && actor.ammo <= 0 && actor.reloading <= 0) startReload(actor);
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

// ---- Companion AI ---------------------------------------------------------
// leader is the currently-controlled soldier. Companions keep loose formation
// and open fire on any enemy they can line up.
export function updateCompanion(soldier, dt, scene, leader) {
  if (!soldier.alive) return;
  autoReload(soldier); // companions reload themselves when they run dry

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
    fire(scene, soldier, { x: soldier.facing, y: 0 }, "player", dt, aimAccuracy(soldier.data.stats.aim));
  } else if (leader && leader !== soldier) {
    const lc = center(leader);
    const gap = lc.x - c.x;
    if (Math.abs(gap) > 90) move = Math.sign(gap);
    // hop if the leader is meaningfully above and we're stuck on the ground
    if (soldier.onGround && lc.y < c.y - 60 && Math.abs(gap) < 140) jump = true;
  }

  soldier.applyMovement(dt, move, jump);
}
