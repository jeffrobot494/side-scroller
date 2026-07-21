// Side Scroller — built from scratch on the HTML5 Canvas API.
// No dependencies, no build step. Open index.html in a browser (via a local
// server) and it runs.

import { Input } from "./input.js";
import { Player } from "./player.js";
import { WORLD, PLATFORMS } from "./world.js";

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
const ctx = canvas.getContext("2d");

const input = new Input();
const player = new Player(100, 100);

// Camera: world-space top-left corner of what we're viewing.
const camera = { x: 0, y: 0 };

// ---- Fixed-timestep loop --------------------------------------------------
// Physics updates at a constant rate (STEP seconds) regardless of the display
// refresh rate, so jump height and run speed feel identical on every machine.
// Rendering happens as often as the browser allows.
const STEP = 1 / 60; // 60 physics updates per second
let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  let frameTime = (now - lastTime) / 1000;
  lastTime = now;

  // Guard against huge jumps (e.g. tabbing away and back).
  if (frameTime > 0.25) frameTime = 0.25;

  accumulator += frameTime;
  while (accumulator >= STEP) {
    update(STEP);
    accumulator -= STEP;
  }

  render();
  requestAnimationFrame(frame);
}

function update(dt) {
  player.update(dt, input, PLATFORMS);

  // Camera follows the player, keeping them a bit left of center so you can
  // see what's coming. Clamp so we never scroll past the world edges.
  const targetX = player.x + player.w / 2 - canvas.width * 0.4;
  camera.x = clamp(targetX, 0, WORLD.width - canvas.width);
  camera.y = 0;
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

  // Platforms
  ctx.fillStyle = "#0f3460";
  for (const p of PLATFORMS) {
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }

  // Player
  player.draw(ctx);

  ctx.restore();

  // HUD (drawn in screen space, not affected by the camera)
  ctx.fillStyle = "#e0e0e0";
  ctx.font = "14px monospace";
  ctx.fillText("Arrow keys / A,D to move  •  Space / W / Up to jump", 12, 24);
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

requestAnimationFrame(frame);
