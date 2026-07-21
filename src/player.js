import { WORLD } from "./world.js";

// Tuning knobs — tweak these to change how the character feels.
const RUN_SPEED = 320;      // max horizontal speed (px/s)
const ACCEL = 2600;         // how fast we reach run speed (px/s^2)
const FRICTION = 3000;      // how fast we stop when no input (px/s^2)
const JUMP_SPEED = 720;     // initial upward velocity on jump (px/s)
const MAX_FALL = 1200;      // terminal velocity (px/s)

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 32;
    this.h = 48;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
  }

  update(dt, input, platforms) {
    // --- Horizontal movement ---
    const dir = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
    if (dir !== 0) {
      this.vx += dir * ACCEL * dt;
      this.vx = clamp(this.vx, -RUN_SPEED, RUN_SPEED);
    } else {
      // Apply friction toward zero.
      const drop = FRICTION * dt;
      if (Math.abs(this.vx) <= drop) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * drop;
    }

    // --- Jump ---
    if (input.isDown("jump") && this.onGround) {
      this.vy = -JUMP_SPEED;
      this.onGround = false;
    }

    // --- Gravity ---
    this.vy += WORLD.gravity * dt;
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;

    // --- Move + collide on each axis separately (avoids corner glitches) ---
    this.x += this.vx * dt;
    this._collideAxis(platforms, "x");

    this.y += this.vy * dt;
    this.onGround = false;
    this._collideAxis(platforms, "y");

    // Keep the player inside the world horizontally.
    this.x = clamp(this.x, 0, WORLD.width - this.w);
  }

  _collideAxis(platforms, axis) {
    for (const p of platforms) {
      if (!overlaps(this, p)) continue;

      if (axis === "x") {
        if (this.vx > 0) this.x = p.x - this.w;       // hit left side of platform
        else if (this.vx < 0) this.x = p.x + p.w;     // hit right side
        this.vx = 0;
      } else {
        if (this.vy > 0) {                            // falling: land on top
          this.y = p.y - this.h;
          this.onGround = true;
        } else if (this.vy < 0) {                     // rising: bonk head
          this.y = p.y + p.h;
        }
        this.vy = 0;
      }
    }
  }

  draw(ctx) {
    ctx.fillStyle = "#e94560";
    ctx.fillRect(Math.round(this.x), Math.round(this.y), this.w, this.h);
  }
}

function overlaps(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
