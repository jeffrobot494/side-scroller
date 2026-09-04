// ---------------------------------------------------------------------------
// THE WORLD, AND THE ONLY PLACE IT IS SIMULATED.
//
// This module runs on the server and nowhere else. That is the architecture
// under test: the client is a terminal, not a peer. Nothing here reads a clock,
// a socket or a random seed — one call to `step` with a fixed dt and a map of
// player intents produces the next world, which is what makes the server's loop
// the only thing that has to be right.
//
// Deliberately NOT deterministic-by-seed, unlike src/mission. A server that is
// the single authority never needs two machines to agree, and pretending
// otherwise here would be importing lockstep's cost into the design that exists
// to avoid it.
//
// Units are pixels and seconds. The canvas IS the world, 1:1, no camera — a
// prototype about latency should have nothing else moving on screen.
// ---------------------------------------------------------------------------

export const W = 960;
export const H = 540;

export const PLAYER_W = 22;
export const PLAYER_H = 34;

const GRAVITY = 2000;
const RUN_SPEED = 260;
const JUMP_VEL = 620;
const MAX_FALL = 1200;

const BULLET_SPEED = 620;
const BULLET_R = 3;
const BULLET_LIFE = 2.0;
const FIRE_COOLDOWN = 0.16;
const DAMAGE = 10;

const MAX_HP = 100;
const RESPAWN_DELAY = 2.0;

// --- flying enemies ---------------------------------------------------------
//
// They exist to put INCOMING fire in the arena, which is the half of the real
// game a duel between two rectangles never tests. Dodging a shot you can see
// coming is where a client that predicts nothing hurts most: the dodge does not
// begin until the server has heard about it.
//
// Small, and never still on either axis, so they are awkward to hit on purpose.
export const ENEMY_W = 18;
export const ENEMY_H = 14;
const ENEMY_HP = 30;
const ENEMY_SPEED = 95; // horizontal patrol
const BOB_AMP = 24; // vertical, peak from the lane centre
const BOB_HZ = 0.55;
const ENEMY_RANGE = 460;
const ENEMY_FIRE_MIN = 1.1; // seconds between shots, randomised per shot so a
const ENEMY_FIRE_MAX = 2.0; // group never falls into a volley
const ENEMY_SPREAD = 0.09; // radians; they miss, which is what makes them fair
const ENEMY_BULLET_SPEED = 330;
const ENEMY_DAMAGE = 10;
const ENEMY_RESPAWN = 3.5;

// Open-air patrol lanes, chosen so nothing ever flies through a platform —
// a flier clipping through solid geometry reads as a bug and distracts from
// the thing being measured.
const LANES = [
  { y: 120, x0: 90, x1: 700 },
  { y: 330, x0: 350, x1: 610 },
  { y: 240, x0: 110, x1: 350 },
  { y: 240, x0: 620, x1: 850 },
  { y: 450, x0: 380, x1: 580 },
  { y: 120, x0: 260, x1: 870 },
  { y: 330, x0: 355, x1: 605 },
  { y: 240, x0: 130, x1: 340 },
];

// Solid rectangles, all of them. One-way platforms would need a second
// collision rule and teach nothing about latency.
export const PLATFORMS = [
  { x: 0, y: 500, w: 960, h: 40 }, // floor
  { x: 120, y: 380, w: 200, h: 16 },
  { x: 640, y: 380, w: 200, h: 16 },
  { x: 380, y: 280, w: 200, h: 16 },
  { x: 60, y: 190, w: 150, h: 16 },
  { x: 750, y: 190, w: 150, h: 16 },
];

const SPAWNS = [
  { x: 80, y: 440 },
  { x: 860, y: 440 },
  { x: 460, y: 220 },
  { x: 180, y: 130 },
  { x: 800, y: 320 },
];

export const COLORS = ["#ffb454", "#6fcf97", "#56ccf2", "#eb5757", "#bb6bd9", "#f2c94c"];

export function createWorld(enemyCount = 3) {
  const world = {
    players: new Map(),
    enemies: [],
    bullets: [],
    nextBullet: 1,
    nextEnemy: 1,
    spawnAt: 0,
    enemyCount: 0,
    events: [],
  };
  setEnemyCount(world, enemyCount);
  return world;
}

function spawnEnemy(world) {
  const lane = LANES[world.nextEnemy % LANES.length];
  return {
    id: world.nextEnemy++,
    lane,
    x: lane.x0 + Math.random() * (lane.x1 - lane.x0),
    // A random starting phase, so a row of fliers never bobs in unison.
    phase: Math.random() * Math.PI * 2,
    dir: Math.random() < 0.5 ? -1 : 1,
    hp: ENEMY_HP,
    dead: false,
    respawn: 0,
    cooldown: ENEMY_FIRE_MIN + Math.random() * (ENEMY_FIRE_MAX - ENEMY_FIRE_MIN),
    y: lane.y,
  };
}

// The count is a live knob: it is the cheapest way to watch snapshot size and
// bandwidth grow with entity count, which is the other thing this prototype is
// meant to find out.
export function setEnemyCount(world, n) {
  world.enemyCount = Math.max(0, Math.min(12, Math.round(n)));
  while (world.enemies.length > world.enemyCount) world.enemies.pop();
  while (world.enemies.length < world.enemyCount) world.enemies.push(spawnEnemy(world));
}

export function addPlayer(world, id, name) {
  const s = SPAWNS[world.spawnAt++ % SPAWNS.length];
  const p = {
    id,
    name,
    x: s.x,
    y: s.y,
    vx: 0,
    vy: 0,
    hp: MAX_HP,
    score: 0,
    deaths: 0,
    fliers: 0,
    facing: 1,
    ax: s.x + 40, // aim point, in world coordinates
    ay: s.y,
    onGround: false,
    cooldown: 0,
    dead: false,
    respawn: 0,
    color: COLORS[(id - 1) % COLORS.length],
    // Edge-detected so holding the key does not fire the jump every step.
    jumpHeld: false,
  };
  world.players.set(id, p);
  return p;
}

export function removePlayer(world, id) {
  world.players.delete(id);
}

function overlaps(ax, ay, aw, ah, b) {
  return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y;
}

// Axis-separated AABB against the static platforms. X first, then Y, so a
// player pressed into a wall while falling slides instead of sticking.
function moveAndCollide(p, dt) {
  p.x += p.vx * dt;
  for (const pl of PLATFORMS) {
    if (!overlaps(p.x, p.y, PLAYER_W, PLAYER_H, pl)) continue;
    p.x = p.vx > 0 ? pl.x - PLAYER_W : pl.x + pl.w;
    p.vx = 0;
  }

  p.y += p.vy * dt;
  p.onGround = false;
  for (const pl of PLATFORMS) {
    if (!overlaps(p.x, p.y, PLAYER_W, PLAYER_H, pl)) continue;
    if (p.vy > 0) {
      p.y = pl.y - PLAYER_H;
      p.onGround = true;
    } else {
      p.y = pl.y + pl.h;
    }
    p.vy = 0;
  }

  // The arena is closed on the sides and the top; the floor platform closes the
  // bottom. Nobody should ever leave the screen.
  if (p.x < 0) { p.x = 0; p.vx = 0; }
  if (p.x + PLAYER_W > W) { p.x = W - PLAYER_W; p.vx = 0; }
  if (p.y < 0) { p.y = 0; p.vy = 0; }
}

function respawn(world, p) {
  const s = SPAWNS[world.spawnAt++ % SPAWNS.length];
  p.x = s.x;
  p.y = s.y;
  p.vx = 0;
  p.vy = 0;
  p.hp = MAX_HP;
  p.dead = false;
}

// Nearest living player to a point, or null. Enemies pick a target every shot
// rather than holding one, so a player who dies mid-burst does not keep drawing
// fire at the place they used to be.
function nearestPlayer(world, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const p of world.players.values()) {
    if (p.dead) continue;
    const d = Math.hypot(p.x + PLAYER_W / 2 - x, p.y + PLAYER_H / 2 - y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return bestD <= ENEMY_RANGE ? best : null;
}

function updateEnemies(world, dt) {
  for (const e of world.enemies) {
    if (e.dead) {
      e.respawn -= dt;
      if (e.respawn <= 0) {
        const fresh = spawnEnemy(world);
        // Reuse the slot rather than splicing: the array length IS the enemy
        // count knob, and a respawn must not quietly change it.
        Object.assign(e, fresh, { id: e.id, lane: e.lane });
      }
      continue;
    }

    // Patrol, turning at the ends of the lane.
    e.x += e.dir * ENEMY_SPEED * dt;
    if (e.x <= e.lane.x0) {
      e.x = e.lane.x0;
      e.dir = 1;
    } else if (e.x >= e.lane.x1) {
      e.x = e.lane.x1;
      e.dir = -1;
    }

    // Bob. Two axes moving at once is what makes them awkward to lead, and it
    // costs one sine per enemy per step.
    e.phase += Math.PI * 2 * BOB_HZ * dt;
    e.y = e.lane.y + Math.sin(e.phase) * BOB_AMP;

    e.cooldown -= dt;
    if (e.cooldown > 0) continue;

    const cx = e.x + ENEMY_W / 2;
    const cy = e.y + ENEMY_H / 2;
    const target = nearestPlayer(world, cx, cy);
    if (!target) continue;

    e.cooldown = ENEMY_FIRE_MIN + Math.random() * (ENEMY_FIRE_MAX - ENEMY_FIRE_MIN);

    // Aimed at where the target IS, not where it is going. Leading would make
    // them harder in a way that says nothing about latency, and being able to
    // outrun a shot is the behaviour worth feeling here.
    let ang = Math.atan2(target.y + PLAYER_H / 2 - cy, target.x + PLAYER_W / 2 - cx);
    ang += (Math.random() * 2 - 1) * ENEMY_SPREAD;

    world.bullets.push({
      id: world.nextBullet++,
      owner: -e.id, // negative, so an enemy id can never collide with a player id
      team: "e",
      x: cx + Math.cos(ang) * 12,
      y: cy + Math.sin(ang) * 12,
      vx: Math.cos(ang) * ENEMY_BULLET_SPEED,
      vy: Math.sin(ang) * ENEMY_BULLET_SPEED,
      life: BULLET_LIFE,
    });
    world.events.push({ e: "eshot", x: cx, y: cy });
  }
}

// One fixed step. `inputs` is id -> the last input packet that client sent.
export function step(world, inputs, dt) {
  world.events.length = 0;

  for (const p of world.players.values()) {
    if (p.dead) {
      p.respawn -= dt;
      if (p.respawn <= 0) respawn(world, p);
      continue;
    }

    const inp = inputs.get(p.id);
    const l = inp?.l ? 1 : 0;
    const r = inp?.r ? 1 : 0;
    p.vx = (r - l) * RUN_SPEED;

    // Aim is a point, not an angle: the client sends where its mouse is and the
    // server derives direction. Sending the angle instead would let a client
    // choose one the world cannot produce.
    if (inp) {
      p.ax = inp.ax;
      p.ay = inp.ay;
    }
    const cx = p.x + PLAYER_W / 2;
    const cy = p.y + PLAYER_H / 2;
    if (p.ax !== undefined) p.facing = p.ax >= cx ? 1 : -1;

    const wantJump = !!inp?.jump;
    if (wantJump && !p.jumpHeld && p.onGround) p.vy = -JUMP_VEL;
    p.jumpHeld = wantJump;

    p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
    moveAndCollide(p, dt);

    p.cooldown -= dt;
    if (inp?.fire && p.cooldown <= 0) {
      p.cooldown = FIRE_COOLDOWN;
      let dx = p.ax - cx;
      let dy = p.ay - cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      world.bullets.push({
        id: world.nextBullet++,
        owner: p.id,
        team: "p",
        x: cx + dx * 18,
        y: cy + dy * 18,
        vx: dx * BULLET_SPEED,
        vy: dy * BULLET_SPEED,
        life: BULLET_LIFE,
      });
      world.events.push({ e: "shot", x: cx + dx * 18, y: cy + dy * 18 });
    }
  }

  updateEnemies(world, dt);

  // Bullets. Walked backwards so a splice never skips the next one.
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const b = world.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    let gone = b.life <= 0 || b.x < 0 || b.x > W || b.y < 0 || b.y > H;

    if (!gone) {
      for (const pl of PLATFORMS) {
        if (overlaps(b.x - BULLET_R, b.y - BULLET_R, BULLET_R * 2, BULLET_R * 2, pl)) {
          world.events.push({ e: "spark", x: b.x, y: b.y });
          gone = true;
          break;
        }
      }
    }

    // A player's round hits fliers; both teams' rounds hit players. An enemy
    // round passes through other enemies, so a flier can never kill its
    // neighbour and the count knob keeps meaning what it says.
    if (!gone && b.team === "p") {
      for (const e of world.enemies) {
        if (e.dead) continue;
        if (!overlaps(b.x - BULLET_R, b.y - BULLET_R, BULLET_R * 2, BULLET_R * 2,
                      { x: e.x, y: e.y, w: ENEMY_W, h: ENEMY_H })) continue;
        e.hp -= DAMAGE;
        world.events.push({ e: "ehit", x: b.x, y: b.y });
        if (e.hp <= 0) {
          e.hp = 0;
          e.dead = true;
          e.respawn = ENEMY_RESPAWN;
          const killer = world.players.get(b.owner);
          if (killer) killer.fliers++;
          world.events.push({ e: "edie", x: e.x + ENEMY_W / 2, y: e.y + ENEMY_H / 2 });
        }
        gone = true;
        break;
      }
    }

    if (!gone) {
      for (const p of world.players.values()) {
        if (p.dead || p.id === b.owner) continue;
        if (!overlaps(b.x - BULLET_R, b.y - BULLET_R, BULLET_R * 2, BULLET_R * 2,
                      { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H })) continue;
        p.hp -= b.team === "e" ? ENEMY_DAMAGE : DAMAGE;
        world.events.push({ e: "hit", x: b.x, y: b.y, id: p.id });
        if (p.hp <= 0) {
          p.hp = 0;
          p.dead = true;
          p.deaths++;
          p.respawn = RESPAWN_DELAY;
          const killer = world.players.get(b.owner);
          if (killer) killer.score++;
          world.events.push({ e: "die", id: p.id, by: b.owner });
        }
        gone = true;
        break;
      }
    }

    if (gone) world.bullets.splice(i, 1);
  }
}

// The snapshot payload. Positions are rounded to a tenth of a pixel: below what
// anyone can see, and it halves the packet. Velocity is deliberately NOT sent —
// a client with no prediction has no use for it, and shipping it would quietly
// make prediction possible and blur what this prototype measures.
//
// Events are NOT in here. They are per-STEP and the snapshot is per-BROADCAST:
// at 20Hz two out of every three steps' hits and kills would never be sent.
// The server accumulates them across the gap and flushes them with the send.
export function snapshot(world) {
  const players = [];
  for (const p of world.players.values()) {
    players.push({
      i: p.id,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      h: p.hp,
      f: p.facing,
      ax: Math.round(p.ax),
      ay: Math.round(p.ay),
      s: p.score,
      d: p.deaths,
      fl: p.fliers,
      k: p.dead ? 1 : 0,
      n: p.name,
    });
  }
  const bullets = world.bullets.map((b) => ({
    x: Math.round(b.x * 10) / 10,
    y: Math.round(b.y * 10) / 10,
    o: b.owner,
    // Only enemy rounds carry the flag; a key that is usually absent costs
    // nothing on the wire, and every byte here is multiplied by the send rate.
    ...(b.team === "e" ? { e: 1 } : {}),
  }));
  const enemies = world.enemies.map((e) => ({
    i: e.id,
    x: Math.round(e.x * 10) / 10,
    y: Math.round(e.y * 10) / 10,
    h: e.hp,
    k: e.dead ? 1 : 0,
  }));
  return { players, enemies, bullets };
}
