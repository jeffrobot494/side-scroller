// ---------------------------------------------------------------------------
// BEHAVIOR + COMBAT HELPERS  (Phases 2–4)
//
// Companion AI (follow the controlled soldier, shoot what they can see) plus
// `fire()`, the one place a weapon turns into projectiles, shared by the player,
// companions, and EnemySpec enemies. Enemy behavior itself lives in the
// EnemySpec runtime (src/mission/enemyspec/) — the legacy charger/shooter/turret
// archetypes were retired when EnemySpec was wired into missions.
// ---------------------------------------------------------------------------

import { Projectile, startReload, stepActor, STAND_H, CROUCH_H, SOLDIER_TUNING } from "./entities.js";
import { predictHit } from "./combat.js";
import { navGraph, abortRoute } from "./navigation.js";
import { actuate, nodeUnder } from "../game/nav.js";
import { config } from "../game/config.js";
import { weaponSound } from "../audio/cues.js";
import { instantiate, updateSpecEnemy } from "./enemyspec/runtime.js";
import { nearestHostile, aimFrom, edgeExposure } from "./enemyspec/perception.js";
import { DEFAULT_COMPANION_SPEC } from "../game/companionspecs.js";

// Map a 1..10 Aim stat to a 0..1 accuracy (10 = perfectly tight, 1 = loosest).
// Feeds the spread penalty in fire() so higher-Aim shooters group tighter.
export function aimAccuracy(aim) {
  const a = (((aim ?? 5) - 1) / 9);
  return a < 0 ? 0 : a > 1 ? 1 : a;
}

// The scene's gameplay stream (tech/mission-determinism.md, D1) — the tick-time
// half of the seam, an optional capability the host installs exactly the way it
// installs `scene.sound`. Resolved AT the draw, never captured at module load:
// three suites (crouch, companion-aim, reposition) seed themselves by assigning
// Math.random, and a captured reference would leave all three unseeded without
// failing anything.
function sceneRng(scene) {
  return (scene && scene.rng) || Math.random;
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
      const a = (sceneRng(scene)() * 2 - 1) * spread;
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
function companionAgent(soldier, scene) {
  if (soldier.agent) return soldier.agent;
  // Built lazily on this squadmate's first tick, which is mid-mission — so the
  // stream has to come from the scene rather than from loadMission.
  const a = instantiate(DEFAULT_COMPANION_SPEC, soldier.x, soldier.y, "player", scene && scene.rng);
  a.soldier = soldier;
  // Opted into the survival senses (tech/squad-survival.md) — the only agents
  // that are. The two clocks are advanced by tickSurvival below; perception
  // reads them on its own cadence.
  a.survival = { sinceHurt: 99, sinceThreat: 99, hp: soldier.health, leaderFar: false, clock: (scene && scene.survivalClock) || 0 };
  // Its routes pay for exposure (V5). Injected rather than imported by the
  // router, which must not import perception.
  a.edgeWeight = (sc, graph) => edgeExposure(a, sc, graph);
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
    // Nor on an empty magazine. The brain's gate reads sense.outOfAmmo, which
    // is up to one sense tick stale, and the frame the last round leaves is the
    // frame a stale gate would dry-click (tech/squad-survival.md, V3).
    // autoReload has already started a reload if there is a spare.
    if (soldier.ammo <= 0) return;
    fire(scene, soldier, soldier.fireDir(), "player", 0, aimAccuracy(soldier.data.stats.aim));
  };
  soldier.agent = a;
  return a;
}

// ---- the dodge reflex (tech/soldier-ducking.md D1, tech/squad-survival.md V6)
// A reflex BELOW the brain, not a brain state: a state would be entered and left
// on perception's 0.2s cadence — far too slow for a round in flight — and would
// fight escort/combat the way the old vertical band did.
//
// Three candidates per threatening round, taken in order, the first that
// predictHit says clears it: KEEP GOING (the standing box carried on at its
// current velocity — if that clears, the round is no threat), DUCK (the
// crouched box), JUMP (a copy of the body flown on stepActor under zero input).
// Exploding rounds are skipped: getting smaller does not help against a blast,
// and neither does getting higher.
//
// It owns whether this squadmate is kneeling and for how long, a jump it has
// decided on and not launched yet, and the verdict attached to one round for
// one soldier. It writes the stance and the jump nowhere itself — `crouchIntent`,
// `pendingJump` and `dodgeHold` are deferred channels the soldier locomotor
// actuates (locomotion.js).
//
// Relaxing mission.js's unconditional stand-up means this function also OWNS
// standing a swapped-away soldier back up: with no hold running it asks for a
// stand every frame, and the locomotor delivers it on the same tick.
function tickDuck(soldier, agent, dt, scene, ctx) {
  const d = soldier.duck || (soldier.duck = { hold: 0, wait: 0, pending: null, judged: new WeakSet() });
  if (d.hold > 0) d.hold = Math.max(0, d.hold - dt);
  else if (d.wait > 0) {
    // A dodge that has been decided but has not landed yet. The soldier carries
    // on through it — the stance is a two-state height swap with no in-between
    // pose, so latency shows as a delayed snap, and a slow soldier gets clipped
    // in the gap. That is the half of Speed the player can actually watch.
    d.wait = Math.max(0, d.wait - dt);
    if (d.wait === 0) act(d, soldier, agent, dt, scene, ctx);
  }

  // Grounded only: kneeling mid-jump changes the box without changing the
  // trajectory, which reads as a glitch rather than a dodge, and a jump needs
  // ground to leave from.
  if (d.hold <= 0 && d.wait <= 0 && soldier.onGround && !agent.dodgeHold && config.duckHoldTime > 0) {
    for (const p of scene.projectiles) {
      // ONE verdict per round per soldier — a soldier who misses a round coming
      // does not get a second look at it. Re-judging across a round's flight
      // would turn the chance below into a certainty. The verdict cannot live on
      // the round: one round can threaten more than one squadmate.
      if (d.judged.has(p)) continue;
      d.judged.add(p);
      const kind = dodgeFor(soldier, agent, p, dt, scene, ctx);
      if (!kind) continue;
      // Whether they react at all is the roll; a failed one is spent, not
      // retried, which is what makes a soldier who was not paying attention
      // indistinguishable from one who was too slow.
      const t = speedT(soldier);
      if (sceneRng(scene)() >= lerp(config.duckChanceSlow, config.duckChanceFast, t)) continue;
      d.pending = { kind, round: p };
      const latency = lerp(config.duckLatencySlow, config.duckLatencyFast, t);
      if (latency > 0) d.wait = latency;
      else act(d, soldier, agent, dt, scene, ctx);
      break;
    }
  }
  agent.crouchIntent = d.hold > 0;
}

// Carry out the dodge decided on. A duck is a duck. A jump is re-flown from the
// body as it is NOW, because the latency has moved it; if it no longer clears,
// the reflex falls back to the knee, then to nothing.
function act(d, soldier, agent, dt, scene, ctx) {
  const pend = d.pending;
  d.pending = null;
  if (!pend) return;
  if (pend.kind === "duck") { d.hold = config.duckHoldTime; return; }
  if (!soldier.onGround) return;
  const steps = Math.ceil(config.duckLookahead / dt);
  if (jumpClears(soldier, agent, pend.round, dt, steps, scene, ctx)) {
    // Drop the route leg first, so a dodge is never booked as a failed nav jump,
    // then hold zero input from launch to landing so it flies the predicted arc.
    abortRoute(agent);
    agent.pendingJump = true;
    agent.dodgeHold = { airborne: false };
  } else if (crouchClears(soldier, pend.round, dt, steps, scene, ctx)) {
    d.hold = config.duckHoldTime;
  }
}

// Which dodge answers round `p`, if any: "duck", "jump", or null — null both
// for a round that is no threat and for one nothing here can avoid.
function dodgeFor(s, agent, p, dt, scene, ctx) {
  if ((p.effects || []).some((e) => e.kind === "explode")) return null;
  const steps = Math.ceil(config.duckLookahead / dt);
  const feet = s.y + s.h;
  const stand = { x: s.x, y: feet - STAND_H, w: s.w, h: STAND_H };
  const moving = Math.abs(s.vx) > 1e-6;
  const go = moving ? (i) => ({ x: s.x + s.vx * dt * (i + 1), y: stand.y, w: s.w, h: STAND_H }) : () => stand;
  const k = predictHit(scene, p, s, go, dt, steps, ctx);
  if (k < 0) return null;
  // A body standing still is judged on the frame the round reaches it, exactly
  // as duckableShot judges it; one that was moving stops to kneel, so the
  // crouched box must clear the whole flight.
  if (crouchClears(s, p, dt, moving ? steps : k + 1, scene, ctx)) return "duck";
  if (jumpClears(s, agent, p, dt, steps, scene, ctx)) return "jump";
  return null;
}

function crouchClears(s, p, dt, steps, scene, ctx) {
  const crouch = { x: s.x, y: s.y + s.h - CROUCH_H, w: s.w, h: CROUCH_H };
  return predictHit(scene, p, s, () => crouch, dt, steps, ctx) < 0;
}

// Does a jump from here clear `p`? The body is flown on the mission's own
// integrator under zero input — friction braking, as applyMovement applies it,
// mirrored by `actuate` — until it lands. The landing must be somewhere the
// squadmate's graph says is standable, and NO predicted round, `p` or any other,
// may meet the arc.
function jumpClears(s, agent, p, dt, steps, scene, ctx) {
  const f = jumpFlight(s, dt, scene, Math.max(steps, Math.ceil(2 / dt)));
  if (!f) return false;
  const graph = navGraph(agent, scene, config.runSpeed);
  if (!graph || !nodeUnder(graph, f.x, f.feet)) return false;
  const at = (i) => f.boxes[Math.min(i, f.boxes.length - 1)];
  for (const q of scene.projectiles) {
    if (predictHit(scene, q, s, at, dt, steps, ctx) >= 0) return false;
  }
  return true;
}

function jumpFlight(s, dt, scene, frames) {
  const prof = { accel: SOLDIER_TUNING.accel, friction: SOLDIER_TUNING.friction, runSpeed: config.runSpeed };
  const b = {
    x: s.x, y: s.y + s.h - STAND_H, w: s.w, h: STAND_H, vx: s.vx, vy: 0,
    onGround: true, coyote: 0, slow: s.slow, shoveX: 0, shoveY: 0,
  };
  const boxes = [];
  for (let i = 0; i < frames; i++) {
    b.vx = actuate(prof, b.vx, 0, dt);
    if (i === 0) b.vy = -config.jumpSpeed;
    stepActor(b, dt, scene.world, scene.platforms);
    boxes.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    if (i > 0 && b.onGround) return { boxes, x: b.x, feet: b.y + b.h };
  }
  return null; // never came down inside the window
}

// Where a soldier sits on the 1..10 Speed stat, as 0..1 — the same shape
// aimAccuracy gives the Aim stat. Speed's first consumer that changes play.
function speedT(soldier) {
  const s = soldier.data && soldier.data.stats ? soldier.data.stats.speed : 5;
  const v = ((s ?? 5) - 1) / 9;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function updateCompanionSpec(soldier, dt, scene, leader, ctx) {
  if (!soldier.alive) return;
  autoReload(soldier); // companions reload themselves when they run dry
  const a = companionAgent(soldier, scene);
  // Stance is decided BEFORE the body is mirrored onto the agent below, and
  // actuated later by the locomotor, which mirrors the changed box back — so
  // perception never reasons about a standing box for a kneeling soldier.
  tickDuck(soldier, a, dt, scene, ctx || {});
  // sync the real body → agent so perception/aim reason about where we ACTUALLY
  // are (the locomotor drives the Soldier; the agent's own x/y is just a mirror).
  a.x = soldier.x; a.y = soldier.y; a.w = soldier.w; a.h = soldier.h;
  a.vx = soldier.vx; a.vy = soldier.vy; a.onGround = soldier.onGround; a.facing = soldier.facing;
  a.leader = leader && leader !== soldier ? leader : null;
  tickSurvival(soldier, a, dt, scene);
  a.anchor = leader ? { x: leader.x + leader.w / 2, y: leader.y + leader.h / 2 } : null;
  aimAt(soldier, nearestHostile(a, scene), scene);
  // perception + brain + soldier locomotor (→ soldier.applyMovement / fire())
  updateSpecEnemy(a, dt, scene, ctx);
}

// The real health, mirrored so `self.hpPct` stops being the agent's constant 1,
// and the two clocks perception's underFire/calm read. "Hurt" is a health drop
// seen between ticks rather than a hook on ctx.damage, because burn skips
// ctx.damage (combat.js updateStatuses) and burning is being hurt.
//
// It also advances `scene.survivalClock`, the time the shared exposure cache is
// aged on. Every squadmate moves it to the last value IT saw plus its step, and
// never backwards — so squadmates ticking in the same frame advance it once, one
// that sat out a while as the leader cannot drag it back, and any one of them
// alone keeps it running.
function tickSurvival(soldier, a, dt, scene) {
  const sv = a.survival;
  scene.survivalClock = Math.max(scene.survivalClock || 0, sv.clock + dt);
  sv.clock = scene.survivalClock;
  a.health = soldier.health;
  a.maxHealth = soldier.maxHealth;
  sv.sinceHurt += dt;
  sv.sinceThreat += dt;
  if (soldier.health < sv.hp) sv.sinceHurt = 0;
  sv.hp = soldier.health;
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
//
// A gravity weapon's barrel follows the LOW arc that lands on the target
// (tech/squad-survival.md, V4) — the same solve can-hit flies — and falls back to
// pointing straight at it when no arc reaches, since that round lands nowhere.
function aimAt(soldier, foe, scene) {
  if (!foe || !foe.alive) { soldier.aimVec = null; return; }
  const p = soldier.weapon && soldier.weapon.projectile;
  const g = p && p.gravity > 0 && scene ? p.gravity * scene.world.gravity : 0;
  if (g) {
    const arc = aimFrom(soldier, foe.x + foe.w / 2, foe.y + foe.h / 2, p.speed, g);
    if (arc) { soldier.aimVec = arc; return; }
  }
  const dx = foe.x + foe.w / 2 - (soldier.x + soldier.w / 2);
  const dy = foe.y + foe.h / 2 - (soldier.y + soldier.h * 0.42);
  const len = Math.hypot(dx, dy);
  soldier.aimVec = len < 0.001 ? null : { x: dx / len, y: dy / len };
}
