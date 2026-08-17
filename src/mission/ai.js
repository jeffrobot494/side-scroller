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
import { duckableShot } from "./combat.js";
import { config } from "../game/config.js";
import { weaponSound } from "../audio/cues.js";
import { instantiate, updateSpecEnemy } from "./enemyspec/runtime.js";
import { nearestHostile } from "./enemyspec/perception.js";
import { DEFAULT_COMPANION_SPEC } from "../game/companionspecs.js";

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
  if (shooter.ammo !== undefined && shooter.ammo <= 0) {
    // The dry click only belongs to the squad — an enemy running dry is silent.
    if (team === "player" && scene.sound) {
      const dry = weaponSound(shooter.weapon, "empty", team);
      scene.sound(dry.cue, { x: shooter.x + shooter.w / 2, y: shooter.y, gain: dry.gain });
    }
    return false;
  }

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
  // Each projectile carries the cue AND level for its OWN impact, so combat.js
  // can voice a hit without knowing which weapon fired it (a shot outlives its
  // shooter, so neither can be looked up at the moment it lands).
  const impact = weaponSound(w, "impact", team);

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
    const proj = new Projectile(ox, oy, ax * spec.speed, ay * spec.speed, spec, team, w.effects, shooter);
    proj.sound = impact.cue;
    proj.soundGain = impact.gain;
    scene.projectiles.push(proj);
  }
  // cosmetic: a brief muzzle flash the renderer draws at the barrel tip
  shooter.muzzleFlash = 0.055;
  shooter.muzzleDir = { x: dx, y: dy };
  shooter.muzzleColor = spec.color;
  // ONE shot sound per trigger pull — outside the pellet loop, so a shotgun
  // shell is a single boom. weaponSound picks the weapon's own cue and level,
  // else a timbre derived from the projectile shape, else the generic report.
  if (scene.sound) {
    const shot = weaponSound(w, "fire", team);
    scene.sound(shot.cue, { x: shooter.x + shooter.w / 2, y: shooter.y, gain: shot.gain });
  }
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

// ---- Companion AI on the shared brain (Slice L3) --------------------------
// The spec-driven path: a companion Soldier is steered by a spec agent's
// perception + brain through the `soldier` locomotor — the same intelligence
// enemies run. Gated by config.companionBrain; updateCompanion above is the
// legacy fallback until this is validated in the Behavior Lab.

// Lazily attach a shared-brain agent to a companion Soldier. The agent is a spec
// instance used ONLY for perception + decision; its soldier locomotor drives THIS
// Soldier body. It is never drawn, collidable, or in scene.specRoots.
function companionAgent(soldier) {
  if (soldier.agent) return soldier.agent;
  const a = instantiate(DEFAULT_COMPANION_SPEC, soldier.x, soldier.y, "player");
  a.soldier = soldier;
  // brain `fire` → the Soldier's EQUIPPED weapon, down the SAME barrel the
  // renderer draws: fireDir() reads the aimVec set in updateCompanionSpec below,
  // exactly as it does for the player. Through the shared fire() path, not the
  // emitter pipeline.
  a.fireWeapon = (_args, scene) => {
    // No aim vector = nothing to shoot at (aimAt cleared it). The brain decides
    // on perception's 0.2s cadence but the barrel is aimed every frame, so
    // between the last enemy dying and the next sense tick the fight track can
    // still pull the trigger — and that round would leave down `facing`, into
    // empty air. The barrel is the authority on whether there is a shot.
    if (!soldier.aimVec) return;
    fire(scene, soldier, soldier.fireDir(), "player", 0, aimAccuracy(soldier.data.stats.aim));
  };
  soldier.agent = a;
  return a;
}

// ---- the duck reflex (tech/soldier-ducking.md, D1) ------------------------
// A reflex BELOW the brain, not a brain state: a state would be entered and left
// on perception's 0.2s cadence — far too slow for a round in flight — and would
// fight escort/combat the way the old vertical band did.
//
// It owns exactly two things: whether this squadmate is kneeling and for how
// long, and the verdict attached to one round for one soldier. It writes the
// stance nowhere itself — `agent.crouchIntent` is a deferred channel the soldier
// locomotor actuates, the same shape as the pending jump beside it
// (locomotion.js).
//
// Relaxing mission.js's unconditional stand-up means this function now OWNS
// standing a swapped-away soldier back up: with no hold running it asks for a
// stand every frame, and the locomotor delivers it on the same tick.
function tickDuck(soldier, agent, dt, scene, ctx) {
  const d = soldier.duck || (soldier.duck = { hold: 0, judged: new WeakSet() });
  if (d.hold > 0) d.hold = Math.max(0, d.hold - dt);

  // Grounded only: kneeling mid-jump changes the box without changing the
  // trajectory, which reads as a glitch rather than a dodge.
  if (d.hold <= 0 && soldier.onGround && config.duckHoldTime > 0) {
    for (const p of scene.projectiles) {
      // ONE verdict per round per soldier — a soldier who misses a round coming
      // does not get a second look at it, and re-judging across a round's flight
      // would turn a chance into a certainty (D2). The verdict cannot live on
      // the round: one round can threaten more than one squadmate.
      if (d.judged.has(p)) continue;
      d.judged.add(p);
      if (duckableShot(scene, p, soldier, dt, ctx)) {
        d.hold = config.duckHoldTime;
        break;
      }
    }
  }
  agent.crouchIntent = d.hold > 0;
}

export function updateCompanionSpec(soldier, dt, scene, leader, ctx) {
  if (!soldier.alive) return;
  autoReload(soldier); // companions reload themselves when they run dry
  const a = companionAgent(soldier);
  // Stance is decided BEFORE the body is mirrored onto the agent below, and
  // actuated later by the locomotor, which mirrors the changed box back — so
  // perception never reasons about a standing box for a kneeling soldier.
  tickDuck(soldier, a, dt, scene, ctx || {});
  // sync the real body → agent so perception/aim reason about where we ACTUALLY
  // are (the locomotor drives the Soldier; the agent's own x/y is just a mirror).
  a.x = soldier.x; a.y = soldier.y; a.w = soldier.w; a.h = soldier.h;
  a.vx = soldier.vx; a.vy = soldier.vy; a.onGround = soldier.onGround; a.facing = soldier.facing;
  a.anchor = leader ? { x: leader.x + leader.w / 2, y: leader.y + leader.h / 2 } : null;
  aimAt(soldier, nearestHostile(a, scene));
  // perception + brain + soldier locomotor (→ soldier.applyMovement / fire())
  updateSpecEnemy(a, dt, scene, ctx);
}

// Point a companion's gun at its target, in 2D. Set EVERY frame, not on
// perception's 0.2s cadence — a barrel that snapped five times a second would
// read as broken — and from the same muzzle origin fire() launches from, so the
// drawn barrel and the round agree. Cleared when there is nothing to shoot, so
// the sprite falls back to the forward pose.
//
// `facing` is deliberately NOT written here. The locomotor is its single writer
// (locomotion.js — move direction, else toward the target), and sense.groundAhead
// probes off it. Aim is a separate channel: the barrel reads aimVec, so a
// companion can shoot straight up without the body claiming to face upward.
function aimAt(soldier, foe) {
  if (!foe || !foe.alive) { soldier.aimVec = null; return; }
  const dx = foe.x + foe.w / 2 - (soldier.x + soldier.w / 2);
  const dy = foe.y + foe.h / 2 - (soldier.y + soldier.h * 0.42);
  const len = Math.hypot(dx, dy);
  soldier.aimVec = len < 0.001 ? null : { x: dx / len, y: dy / len };
}
