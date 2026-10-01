// ---------------------------------------------------------------------------
// SPACE FPS — the page (tech/space-fps.md). The only module that touches the
// DOM besides the views: pointer-locked mouse look, keys, the fixed-step loop
// (the 2D page's accumulator and clamp), restart.
//
// Input is sampled ONCE PER SIM STEP with presses latched until a step reads
// them. Mouse-look deltas are consumed by the first step of a frame, so a
// frame that runs two steps does not turn twice. world.events is drained
// here, after the views and sound have read it.
// ---------------------------------------------------------------------------

import { CFG, createWorld, step } from "./sim.js";
import { createHud, hudEvents, drawHud } from "./hud.js";

const SENS = 0.0022; // F2: rad per pixel of mouse
const FOV = { now: 75, min: 30, max: 90 }; // F5

const canvas = document.getElementById("hud");
const ctx = canvas.getContext("2d");

let view3d = null;
let failed = null;
import("./view3d.js")
  .then((m) => { view3d = m.createView3D(document.getElementById("space3d")); })
  .catch((e) => { failed = String(e); console.warn("space3d: no 3D view —", e); });

const KEYS = {
  KeyW: "fwd", KeyS: "back", KeyA: "left", KeyD: "right",
  Space: "up", KeyC: "down", // not Ctrl: Ctrl+W closes the tab
  KeyQ: "rollL", KeyE: "rollR",
  ShiftLeft: "boots", ShiftRight: "boots",
  KeyR: "reload",
  Tab: "swap", KeyK: "swap",
  Enter: "restart",
};

const held = new Set();
const pressed = new Set();
const mouse = { down: false };
let lookX = 0, lookY = 0;

addEventListener("keydown", (e) => {
  const a = KEYS[e.code];
  if (!a) return;
  e.preventDefault();
  if (!held.has(a)) pressed.add(a);
  held.add(a);
});
addEventListener("keyup", (e) => {
  const a = KEYS[e.code];
  if (a) held.delete(a);
});
addEventListener("blur", () => { held.clear(); mouse.down = false; });

const locked = () => document.pointerLockElement === canvas;
canvas.addEventListener("click", () => { if (!locked()) canvas.requestPointerLock(); });
addEventListener("mousemove", (e) => {
  if (!locked()) return;
  lookX += e.movementX;
  lookY += e.movementY;
});
canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0 || !locked()) return;
  if (!mouse.down) pressed.add("fire");
  mouse.down = true;
});
addEventListener("mouseup", (e) => { if (e.button === 0) mouse.down = false; });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  FOV.now = Math.max(FOV.min, Math.min(FOV.max, FOV.now * Math.exp(e.deltaY * 0.001)));
}, { passive: false });
document.addEventListener("pointerlockchange", () => { if (!locked()) { held.clear(); mouse.down = false; } });

let vw = 0, vh = 0;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  vw = innerWidth;
  vh = innerHeight;
  canvas.width = vw * dpr;
  canvas.height = vh * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resize);
resize();

const newSeed = () => (Math.random() * 2 ** 31) >>> 0;
let world = createWorld(newSeed(), { squad: 1 });
const hud = createHud();
// For poking at it from the console: space.world().soldiers[0].hp = 999.
// space.step(input, n) runs the sim without pointer lock (headless checks).
window.space = { world: () => world, step: (input = {}, n = 1) => { for (let i = 0; i < n; i++) step(world, input); } };

const axis = (p, n) => (held.has(p) ? 1 : 0) - (held.has(n) ? 1 : 0);

function sample(first) {
  // Mouse down is look down; the sim's pitch is + up. Zoomed in, the mouse
  // turns slower, so a pixel covers the same share of the view.
  const k = SENS * (FOV.now / 75);
  const look = first ? [lookX * k, -lookY * k] : [0, 0];
  if (first) lookX = lookY = 0;
  const input = {
    look,
    roll: axis("rollR", "rollL"),
    jet: [axis("right", "left"), axis("up", "down"), axis("fwd", "back")],
    fire: mouse.down,
    firePress: pressed.has("fire"),
    up: held.has("up"),
    upPress: pressed.has("up"),
    boots: pressed.has("boots"),
    reload: pressed.has("reload"),
    swap: pressed.has("swap"),
    restart: pressed.has("restart"),
  };
  pressed.clear();
  return input;
}

let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(CFG.maxFrame, (now - last) / 1000);
  last = now;
  acc += dt;
  let first = true;
  // Without the pointer the mission waits, as a pause.
  if (!locked() && !world.end) acc = 0;
  while (acc >= CFG.step) {
    const input = sample(first);
    first = false;
    if (input.restart && world.end) world = createWorld(newSeed(), { squad: 1 });
    else step(world, input);
    acc -= CFG.step;
  }
  hudEvents(hud, world);
  if (view3d) {
    try {
      view3d.draw(world, vw, vh, FOV.now);
    } catch (e) {
      console.error("space3d: 3D view failed —", e);
      failed = String(e);
      view3d = null;
    }
  }
  world.events.length = 0;
  drawHud(ctx, hud, world, vw, vh, FOV.now, dt);
  if (!locked() || failed) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, vw, vh);
    ctx.textAlign = "center";
    ctx.fillStyle = "#cfe3ff";
    ctx.font = "20px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText(failed ? "The 3D view did not load: " + failed : "Click to fly — Esc pauses", vw / 2, vh / 2);
    ctx.textAlign = "left";
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
