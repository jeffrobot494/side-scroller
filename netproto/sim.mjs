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

export function createWorld() {
  return { players: new Map(), bullets: [], nextBullet: 1, spawnAt: 0, events: [] };
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
        x: cx + dx * 18,
        y: cy + dy * 18,
        vx: dx * BULLET_SPEED,
        vy: dy * BULLET_SPEED,
        life: BULLET_LIFE,
      });
      world.events.push({ e: "shot", x: cx + dx * 18, y: cy + dy * 18 });
    }
  }

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

    if (!gone) {
      for (const p of world.players.values()) {
        if (p.dead || p.id === b.owner) continue;
        if (!overlaps(b.x - BULLET_R, b.y - BULLET_R, BULLET_R * 2, BULLET_R * 2,
                      { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H })) continue;
        p.hp -= DAMAGE;
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
      k: p.dead ? 1 : 0,
      n: p.name,
    });
  }
  const bullets = world.bullets.map((b) => ({
    x: Math.round(b.x * 10) / 10,
    y: Math.round(b.y * 10) / 10,
    o: b.owner,
  }));
  return { players, bullets };
}
