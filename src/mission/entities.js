// ---------------------------------------------------------------------------
// MISSION ENTITIES + LOADER  (Phases 1–3)
//
// Runtime objects the mission scene simulates, plus a loader that instantiates
// them from the content data. Physics (gravity + per-axis platform collision)
// is shared by every Actor so soldiers, companions, and enemies all move the
// same way.
// ---------------------------------------------------------------------------

import { WEAPONS, ENEMIES } from "../game/content.js";
import { config } from "../game/config.js";

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
export function stepActor(a, dt, world, platforms) {
  a.vy += world.gravity * dt;
  if (a.vy > MAX_FALL) a.vy = MAX_FALL;

  a.x += a.vx * dt;
  collideAxis(a, platforms, "x");

  a.y += a.vy * dt;
  a.onGround = false;
  collideAxis(a, platforms, "y");

  a.x = clamp(a.x, 0, world.width - a.w);
}

function collideAxis(a, platforms, axis) {
  for (const p of platforms) {
    if (!overlaps(a, p)) continue;
    if (axis === "x") {
      if (a.vx > 0) a.x = p.x - a.w;
      else if (a.vx < 0) a.x = p.x + p.w;
      a.vx = 0;
    } else {
      if (a.vy > 0) {
        a.y = p.y - a.h;
        a.onGround = true;
      } else if (a.vy < 0) {
        a.y = p.y + p.h;
      }
      a.vy = 0;
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

export class Soldier {
  // `data` is a roster soldier (id, name, stats, ...); `weapon` is a WEAPONS entry.
  constructor(data, weapon, x, y) {
    this.kind = "soldier";
    this.data = data;
    this.id = data.id;
    this.name = data.name;
    this.callsign = data.callsign;
    this.weapon = weapon;

    this.x = x;
    this.y = y;
    this.w = 30;
    this.h = 46;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.facing = 1; // 1 right, -1 left

    // Health scales off the soldier's health stat (1–10 → 60–150 hp).
    this.maxHealth = 50 + data.stats.health * 10;
    this.health = this.maxHealth;
    this.alive = true;

    this.fireCooldown = 0;
    this.aimUp = false;
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

  applyMovement(dt, move, jump) {
    if (!this.alive) return;
    if (move !== 0) {
      this.vx += move * SOLDIER_TUNING.accel * dt;
      this.vx = clamp(this.vx, -config.runSpeed, config.runSpeed);
      this.facing = move > 0 ? 1 : -1;
    } else {
      const drop = SOLDIER_TUNING.friction * dt;
      if (Math.abs(this.vx) <= drop) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * drop;
    }
    if (jump && this.onGround) {
      this.vy = -config.jumpSpeed;
      this.onGround = false;
    }
  }

  // Direction this soldier is currently aiming (unit-ish vector).
  fireDir() {
    return this.aimUp ? { x: 0, y: -1 } : { x: this.facing, y: 0 };
  }
}

// ---- Enemy ----------------------------------------------------------------

export class Enemy {
  constructor(def, x, y) {
    this.kind = "enemy";
    this.def = def;
    this.name = def.name;
    this.color = def.color;

    this.x = x;
    this.y = y;
    this.w = def.w;
    this.h = def.h;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.facing = -1;

    this.maxHealth = def.health;
    this.health = def.health;
    this.alive = true;

    this.weapon = def.weapon ? WEAPONS[def.weapon] : null;
    this.fireCooldown = 0;
    this.windup = 0; // >0 while telegraphing a shot
    this.burn = null;
    this.hitFlash = 0;
  }
}

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

export function loadMission(level, squad) {
  const soldiers = squad.map((s, i) =>
    new Soldier(s.data, s.weapon, level.playerSpawn.x + i * 44, level.playerSpawn.y)
  );

  const enemies = level.enemies.map((e) => new Enemy(ENEMIES[e.type], e.x, e.y));

  return {
    // gravity comes from config (editable) rather than the level's own value
    world: { ...level.world, gravity: config.gravity },
    platforms: level.platforms.map((p) => ({ ...p })),
    exit: { ...level.exit },
    artifact: level.artifact ? { ...level.artifact } : null,
    soldiers,
    enemies,
    projectiles: [],
    loot: [],
  };
}
