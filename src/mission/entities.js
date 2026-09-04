// ---------------------------------------------------------------------------
// MISSION ENTITIES + LOADER  (Phases 1–3)
//
// Runtime objects the mission scene simulates, plus a loader that instantiates
// them from the content data. Physics (gravity + per-axis platform collision)
// is shared by every Actor so soldiers, companions, and enemies all move the
// same way.
// ---------------------------------------------------------------------------

import { config } from "../game/config.js";
import { soldierMaxHp } from "../game/soldiers.js";
import { missionSpecById, specIsFlying, cheapestMissionSpec } from "../game/enemyspecs.js";
import { instantiate as instantiateSpec, collidables } from "./enemyspec/runtime.js";
import { weaponSound } from "../audio/cues.js";
import { makeRng } from "../game/gen/rng.js";

const MAX_FALL = 1200;

// ---- shared physics -------------------------------------------------------

export function overlaps(a, b) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// Integrate one actor against gravity + platforms for a fixed step. `world`
// supplies gravity and width for edge clamping.
// ---------------------------------------------------------------------------
// EXTERNAL VELOCITY — the knockback channel.
//
// Knockback is not locomotion, and it must not live in `vx`. A locomotor
// re-ASSIGNS vx from scratch every frame (locomotion.js `actuateHorizontal`:
// driveX → vx = v, steer/burst/holdRange all absolute) and a Soldier clamps it
// to run speed whenever a movement key is held — so an impulse written there
// survived exactly one frame and vanished. Measured before this channel
// existed, a maximum-force hit moved a chasing enemy a NEGATIVE distance and a
// running player 5px.
//
// So external velocity gets its own axis pair, added to displacement and never
// touched by a controller. The agent still resists — its own velocity is a
// second displacement pulling the other way, which is why a sprinting charger
// covers a third of what a drifting flier does from the same hit — it just
// cannot ERASE the impulse any more.
//
// The channel decays at `config.knockbackDecay` for every body, which is what
// makes a knockback number mean the same thing whatever it hits. Nothing else
// stops it: a telegraphing enemy, a flyer, a player who is not touching the
// keys and anything mid-air all have no traction of their own to spend.
// ---------------------------------------------------------------------------

// Mass scales the impulse, so a heavy body moves less (v = impulse / √mass).
// Derived from the body box against a standing soldier, which is mass 1 —
// authored per enemy would be one more field to get wrong on every spec, and
// the box is already the thing the player reads as "big". The SQUARE ROOT is
// deliberate: dividing the impulse outright makes distance scale 1/m², which
// measured as a 52:1 spread across the roster and left the boss ending up
// closer than it started. This way distance scales 1/m and the spread is 8:1.
// The impulse a `force: 1` knockback delivers to a mass-1 body. Calibrated so
// that body slides ~1000px at the default decay — but the number IS a velocity,
// not a distance: halve the force and you halve the speed, which quarters the
// distance. Changing `knockbackDecay` changes how long the slide takes, not how
// far it goes, because the distance is v²/2·decay and the velocity is fixed here.
export const KNOCKBACK_MAX_V = 2450;

// How much of the impulse goes upward. Kept at the ratio the old code used.
export const KNOCKBACK_LIFT = 0.35;

const SOLDIER_W = 30; // the reference body, with STAND_H below

export function bodyMass(a) {
  // A spec entity's authored box, never its live one: a crouching soldier must
  // not get heavier, and a child part inherits the root's mass below.
  const b = a.spec && a.spec.body;
  const w = b ? b.w : a.w;
  const h = b ? b.h : (a.crouched ? STAND_H : a.h);
  return Math.max(0.05, (w * h) / (SOLDIER_W * STAND_H));
}

/**
 * Shove a body. `vx`/`vy` are the raw impulse; mass divides it here, so callers
 * pass what the WEAPON does and never think about what it hit.
 *
 * The shove always lands on the ROOT: a spec enemy's children are re-placed
 * from the root's position every frame, so shoving a wing does nothing at all.
 */
export function shoveActor(a, vx, vy = 0) {
  const t = a.root || a;
  const m = Math.sqrt(bodyMass(t));
  t.shoveX = (t.shoveX || 0) + vx / m;
  t.shoveY = (t.shoveY || 0) + vy / m;
}

/** Bleed the channel toward rest. One rate for every body, on purpose. */
export function decayShove(a, dt) {
  const drop = config.knockbackDecay * dt;
  if (a.shoveX) a.shoveX = Math.abs(a.shoveX) <= drop ? 0 : a.shoveX - Math.sign(a.shoveX) * drop;
  if (a.shoveY) a.shoveY = Math.abs(a.shoveY) <= drop ? 0 : a.shoveY - Math.sign(a.shoveY) * drop;
}

export function stepActor(a, dt, world, platforms) {
  a.vy += world.gravity * dt;
  if (a.vy > MAX_FALL) a.vy = MAX_FALL;

  // A `slow` status scales horizontal displacement only (one choke point so the
  // slow effect works for every actor without the AI needing to know about it).
  const slowMult = a.slow && a.slow.time > 0 ? a.slow.factor : 1;
  a.x += (a.vx * slowMult + (a.shoveX || 0)) * dt;
  collideAxis(a, platforms, "x");

  a.y += (a.vy + (a.shoveY || 0)) * dt;
  a.onGround = false;
  collideAxis(a, platforms, "y");
  decayShove(a, dt);

  // Coyote time: keep a small window open after the ground disappears in which
  // a jump still fires (tech/agent-navigation.md, N2). Routing plans a takeoff
  // from a node's edge, and a body that arrives a frame late otherwise walks
  // off and falls — silently, since the request looked satisfied. Held here
  // because this is where `onGround` is decided; every caller reads it through
  // canJump(). It only ever ALLOWS a jump, so no reachability claim gets looser
  // than the envelope the graph is built from.
  if (a.onGround) a.coyote = config.coyoteTime;
  else if (a.coyote > 0) a.coyote = Math.max(0, a.coyote - dt);

  a.x = clamp(a.x, 0, world.width - a.w);
}

// May this actor jump right now — planted, or inside the grace window? The one
// place that question is answered, so the window cannot be honoured by one body
// and ignored by another.
export function canJump(a) {
  return a.onGround || a.coyote > 0;
}

// Spend the jump. Closing the window matters as much as opening it: without
// this, a body that jumps on frame 1 is airborne with `coyote` still counting
// down on frame 2 and can jump AGAIN — a double jump, which the whole envelope
// model rules out (see "Jump is a single fixed impulse" in the spec).
export function consumeJump(a) {
  a.onGround = false;
  a.coyote = 0;
}

function collideAxis(a, platforms, axis) {
  for (const p of platforms) {
    if (!overlaps(a, p)) continue;
    // Which way the body was actually travelling — its own velocity PLUS any
    // shove. Reading vx/vy alone resolves a shoved body to the wrong side.
    if (axis === "x") {
      const push = a.vx + (a.shoveX || 0);
      if (push > 0) a.x = p.x - a.w;
      else if (push < 0) a.x = p.x + p.w;
      a.vx = 0;
      a.shoveX = 0; // a wall stops a shove too
    } else {
      const push = a.vy + (a.shoveY || 0);
      if (push > 0) {
        a.y = p.y - a.h;
        a.onGround = true;
      } else if (push < 0) {
        a.y = p.y + p.h;
      }
      a.vy = 0;
      a.shoveY = 0;
    }
  }
}

// ---- Soldier (player-controlled or AI companion) --------------------------

// runSpeed and jumpSpeed are read live from config (tweakable in the editor);
// accel/friction stay fixed for now.
const SOLDIER_TUNING = {
  accel: 2600,
  friction: 3000,
};

// Standing vs kneeling height. Crouching drops the hitbox low enough that shots
// aimed at standing height (see ai.js AIM_HEIGHT) sail over, and an ally firing
// from behind clears the crouched soldier's head.
export const STAND_H = 46;
export const CROUCH_H = 22;

// Empty 44px slots left between one commander's squad and the next at the
// spawn line (J1). Two, so the gap reads as a gap rather than as a wide squad.
const SQUAD_GAP = 2;

export class Soldier {
  // `data` is a roster soldier (id, name, stats, ...); `weapon` is a WEAPONS entry.
  // `owner` is the commander who INPUTS for this soldier and is credited for it
  // (tech/multiplayer-missions.md, J1) — a second axis over the squad, and
  // deliberately not the team axis: two commanders' squads are mutually
  // non-hostile and stay that way, because `opponents()` switches on a
  // projectile's team and `hostilesFor` returns `scene.soldiers` whole. Owner is
  // never authority: every client simulates every soldier. One commander (every
  // single-player mission) leaves it null on all of them, and every partition
  // by it is then the whole array.
  constructor(data, weapon, x, y, owner = null) {
    this.kind = "soldier";
    this.data = data;
    this.id = data.id;
    this.name = data.name;
    this.callsign = data.callsign;
    this.weapon = weapon;
    this.owner = owner;

    this.x = x;
    this.y = y;
    this.w = 30;
    this.h = STAND_H;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.facing = 1; // 1 right, -1 left
    this.crouched = false;

    // Health scales off the soldier's health stat via config knobs
    // (defaults: 10 + 2×stat → 12–30 hp for a 1–10 stat). Persistent wounds
    // carried from prior missions/days deduct from the starting HP (clamped ≥1
    // so a badly hurt soldier still deploys alive).
    this.maxHealth = soldierMaxHp(data);
    this.health = Math.max(1, this.maxHealth - (data.wounds || 0));
    this.alive = true;

    this.fireCooldown = 0;
    this.aimUp = false;
    this.aimVec = null; // set by manual aim; overrides fireDir when present
    // Magazine + reload. weapon.magazine (shots per mag) enables it; a weapon
    // without one has effectively unlimited ammo and never reloads.
    this.ammo = weapon && weapon.magazine ? weapon.magazine : Infinity;
    this.reloading = 0; // seconds left in an active reload
    // Spare mags brought into the level (config.soldierMagazines total, one of
    // which starts loaded). Each completed reload consumes one; at 0 the
    // soldier can no longer reload.
    this.magsLeft = Math.max(0, config.soldierMagazines - 1);
    this.burn = null; // active { dps, time } status
    this.hitFlash = 0;
    this.kills = 0;
  }

  // Colour keyed to the soldier so the squad reads apart on screen.
  get color() {
    let h = 0;
    for (let i = 0; i < this.name.length; i++)
      h = (h * 31 + this.name.charCodeAt(i)) % 360;
    return `hsl(${h} 65% 58%)`;
  }

  // Drop to / rise from one knee. Adjusts height and shifts y so the feet stay
  // planted on the ground (feet = y + h is preserved across the change).
  setCrouch(want) {
    want = !!want && this.alive;
    if (want === this.crouched) return;
    const dh = STAND_H - CROUCH_H;
    if (want) {
      this.crouched = true;
      this.h = CROUCH_H;
      this.y += dh;
    } else {
      this.crouched = false;
      this.h = STAND_H;
      this.y -= dh;
    }
  }

  applyMovement(dt, move, jump) {
    if (!this.alive) return;
    // Kneeling: you can pivot to face either way, but not run or jump.
    if (this.crouched) {
      if (move !== 0) this.facing = move > 0 ? 1 : -1;
      const drop = SOLDIER_TUNING.friction * dt;
      if (Math.abs(this.vx) <= drop) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * drop;
      return;
    }
    if (move !== 0) {
      // Reloading slows you to a fraction of run speed (config.reloadSpeedMult).
      const top = config.runSpeed * (this.reloading > 0 ? config.reloadSpeedMult : 1);
      this.vx += move * SOLDIER_TUNING.accel * dt;
      this.vx = clamp(this.vx, -top, top);
      this.facing = move > 0 ? 1 : -1;
    } else {
      const drop = SOLDIER_TUNING.friction * dt;
      if (Math.abs(this.vx) <= drop) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * drop;
    }
    if (jump && canJump(this)) {
      this.vy = -config.jumpSpeed;
      consumeJump(this);
    }
  }

  // Direction this soldier is currently aiming (unit-ish vector). Manual aim
  // (mouse / stick) sets aimVec and takes priority; otherwise fall back to the
  // keyboard up/forward scheme.
  fireDir() {
    if (this.aimVec) return this.aimVec;
    return this.aimUp ? { x: 0, y: -1 } : { x: this.facing, y: 0 };
  }
}

// ---- magazine / reload helpers (shared by mission + Firing Room) ----------

// Begin a reload if the actor has a magazine, a spare mag to load, isn't
// already reloading, and the mag isn't already full. Returns true if a reload
// actually started. Actors without a magsLeft field (e.g. spec enemies) have
// unlimited spares.
//
// `scene` is optional and only used to play the mag-drop / mag-seat cues —
// callers without a scene (tests, the AI's autoReload) just reload silently.
export function startReload(actor, scene) {
  const w = actor.weapon;
  if (!w || !w.magazine) return false;
  if (actor.reloading > 0 || actor.ammo >= w.magazine) return false;
  if (actor.magsLeft !== undefined && actor.magsLeft <= 0) return false;
  actor.reloading = w.reloadTime || 1.5;
  if (scene && scene.sound) {
    const s = weaponSound(w, "reload");
    scene.sound(s.cue, { x: actor.x + actor.w / 2, y: actor.y, gain: s.gain });
  }
  return true;
}

// Tick an in-progress reload; refills the magazine (consuming a spare) when it
// completes.
export function tickReload(actor, dt, scene) {
  if (actor.reloading > 0) {
    actor.reloading -= dt;
    if (actor.reloading <= 0) {
      actor.reloading = 0;
      actor.ammo = actor.weapon.magazine;
      if (actor.magsLeft !== undefined && actor.magsLeft !== Infinity)
        actor.magsLeft -= 1;
      // The mag-seat cue is global, but it takes the weapon's `reload` slot
      // gain so a weapon turned down stays quiet through the WHOLE reload
      // rather than only the half of it that has a per-weapon cue.
      if (scene && scene.sound)
        scene.sound("weapon.reload.done", {
          x: actor.x + actor.w / 2, y: actor.y,
          gain: weaponSound(actor.weapon, "reload").gain,
        });
    }
  }
}

// (The legacy flat Enemy class was retired when missions moved to EnemySpec:
// mission enemies are spec entity trees — see src/mission/enemyspec/runtime.js
// and loadMission above. The Firing Room's dummy targets are plain literals.)

// ---- Projectile -----------------------------------------------------------

export class Projectile {
  // team: "player" | "enemy". effects: the weapon's effect list. owner: the
  // Soldier/Enemy that fired it (for kill attribution).
  constructor(x, y, vx, vy, spec, team, effects, owner) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.w = spec.w;
    this.h = spec.h;
    this.color = spec.color;
    this.life = spec.life;
    this.gravity = spec.gravity || 0; // fraction of world gravity (0 = straight)
    this.shape = spec.shape || null; // render look; null → derived from size
    this.team = team;
    this.effects = effects;
    this.owner = owner;
    this.dead = false;
  }
}

// ---- Loot pickup ----------------------------------------------------------

export class Loot {
  constructor(item, x, y) {
    this.item = item; // { name, value }
    this.x = x;
    this.y = y;
    this.w = 20;
    this.h = 20;
    this.vy = -220; // small pop when it drops
    this.onGround = false;
    this.collected = false;
    this.bob = Math.random() * Math.PI * 2;
  }
}

// ---- Loader ---------------------------------------------------------------
// Instantiate a live mission world from a level definition + the deployed squad.
// `squad` is an array of { data, weapon } chosen in the deploy screen.

// Airborne spawn lift for flying enemies: their motion anchors at the spawn
// point, so lift them off the placement surface into the air (mirrors the
// Firing Room). Grounded enemies spawn feet-on-surface at the placed y.
const FLY_ALTITUDE = 140;

// `seed` is the mission's own seed (mission.seed, stamped by generateLevel).
// Given one, this is where the mission's gameplay stream is born: ONE mulberry32
// off that seed, installed on the scene for the tick-time draws and handed to
// every root instantiated here (tech/mission-determinism.md, D2). Given none —
// three suites, the editor tools, dryRunSpec — nothing is installed and every
// draw site falls back to Math.random: playable, simply not reproducible.
//
// The stream is deliberately NOT derived from the level: the same level replayed
// is the same mission, and the seed is recoverable from the level id (gen_<seed>)
// if a bug report only carries that.
export function loadMission(level, squad, seed) {
  const rng = seed === undefined || seed === null ? null : makeRng(seed);

  // A squad entry is { data, weapon, owner? } — the owner is what a joint
  // dispatch will carry (J5) and is null for every single-player deploy.
  //
  // The line-up walks the flat list on the SAME 44px pitch it always did, and
  // opens a two-slot gap wherever the owner changes, so two squads arrive as two
  // groups instead of interleaved on one spot. It is a pure function of the list
  // as given, not of "mine versus theirs": both clients build the identical
  // line-up from the identical list, which is the only property lockstep needs
  // from it. At one owner there is no gap and the offset is exactly `i * 44`.
  let slot = 0;
  let prevOwner;
  const soldiers = squad.map((s, i) => {
    const owner = s.owner ?? null;
    if (i > 0 && owner !== prevOwner) slot += SQUAD_GAP;
    prevOwner = owner;
    const sol = new Soldier(s.data, s.weapon, level.playerSpawn.x + slot * 44, level.playerSpawn.y, owner);
    slot += 1;
    return sol;
  });

  // Every mission enemy is an EnemySpec instance. A placement { type, x, y }
  // resolves through missionSpecById; a type this browser no longer has (an
  // enemy deleted or switched out of missions since the level was generated)
  // falls back to the cheapest placeable one so a bad level still spawns
  // something (fallback discipline). Each root carries `loot` (value derived from its threat) for
  // the drop on death; the flat damageable parts feed scene.enemies.
  const specRoots = level.enemies.map((e) => {
    const nspec = missionSpecById[e.type] || cheapestMissionSpec();
    const y = specIsFlying(nspec) ? Math.max(24, e.y - FLY_ALTITUDE) : e.y;
    const root = instantiateSpec(nspec, e.x, y, "enemy", rng);
    root.loot = {
      name: `${nspec.name} core`,
      value: Math.round((nspec.threat ?? 50) * config.lootPerThreat),
    };
    return root;
  });

  return {
    // gravity comes from config (editable) rather than the level's own value
    world: { ...level.world, gravity: config.gravity },
    // The gameplay stream, read by every `scene.rng` site (ai.js) and by the
    // companion agents built lazily during the mission. null when unseeded.
    rng,
    seed: seed ?? null,
    platforms: level.platforms.map((p) => ({ ...p })),
    exit: { ...level.exit },
    artifact: level.artifact ? { ...level.artifact } : null,
    soldiers,
    // What the squad has picked up, as { item, owner, by } — the item is the
    // payload the campaign gets, the other two are who gets credited for it
    // (J1). Eager, because both the HUD and _resolve read it every mission.
    collected: [],
    specRoots,
    enemies: specRoots.flatMap((r) => collidables(r)),
    projectiles: [],
    loot: [],
  };
}
