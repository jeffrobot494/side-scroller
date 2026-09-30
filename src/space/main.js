// ---------------------------------------------------------------------------
// SPACE PROTOTYPE — the page (tech/space-prototype.md). The only module that
// touches the DOM: samples input ONCE PER SIM STEP, latching presses until a
// step consumes them, runs the fixed-step loop, and hands frames to view.js.
// ---------------------------------------------------------------------------

import { CFG, createWorld, step } from "./sim.js";
import { createView, draw, cameraFor, zoomBy, toWorld, updateRoll } from "./view.js";
import { createAudio } from "./audio.js";

const canvas = document.getElementById("space");
const ctx = canvas.getContext("2d");

// The world in 3D, underneath; the flat view draws everything until (unless)
// Three arrives from the CDN.
let view3d = null;
import("./view3d.js")
  .then((m) => { view3d = m.createView3D(document.getElementById("space3d")); })
  .catch((e) => console.warn("space: no 3D view, staying flat —", e));

const KEYS = {
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  KeyW: "thrust", ArrowUp: "thrust",
  Space: "space", // fire while floating, jump with the boots on: the sim decides
  ShiftLeft: "boots", ShiftRight: "boots",
  KeyR: "reload",
  Tab: "swap", KeyK: "swap",
  Enter: "restart",
};

const audio = createAudio();
addEventListener("keydown", audio.unlock);
addEventListener("mousedown", audio.unlock);

const held = new Set();
const pressed = new Set(); // latched until a step reads it
const mouse = { x: 0, y: 0, down: false };

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
addEventListener("blur", () => held.clear());
canvas.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (!mouse.down) pressed.add("fire");
  mouse.down = true;
});
addEventListener("mouseup", (e) => { if (e.button === 0) mouse.down = false; });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoomBy(view, e.deltaY);
}, { passive: false });

let vw = 0;
let vh = 0;
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

const view = createView();
let world = createWorld(newSeed(), { squad: 3 });

// For poking at it from the console: space.world().soldiers[0].hp = 999
window.space = { world: () => world };

function newSeed() {
  return (Math.random() * 2 ** 31) >>> 0;
}

function sample() {
  const [aimX, aimY] = toWorld(cameraFor(world, vw, vh, view.zoom, view.roll), mouse.x, mouse.y);
  const input = {
    turn: (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0),
    thrust: held.has("thrust"),
    aimX,
    aimY,
    fire: mouse.down,
    firePress: pressed.has("fire"),
    space: held.has("space"),
    spacePress: pressed.has("space"),
    boots: pressed.has("boots"),
    reload: pressed.has("reload"),
    swap: pressed.has("swap"),
    restart: pressed.has("restart"),
  };
  pressed.clear();
  return input;
}

let ended = false;
let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(CFG.maxFrame, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= CFG.step) {
    const input = sample();
    if (input.restart && world.end) world = createWorld(newSeed(), { squad: 3 });
    else step(world, input);
    acc -= CFG.step;
  }
  updateRoll(view, world, dt);
  // Sound and the 3D view read the events before view.js drains them.
  const cam = cameraFor(world, vw, vh, view.zoom, view.roll);
  // Sound is decoration: a failure in it must never stop the loop.
  try {
    audio.handle(world.events, cam.cx, cam.cy, cam.roll);
    const lead = world.soldiers[world.ctrl];
    audio.setThrust(!!(lead && lead.alive && lead.thrusting && !world.end));
    if (world.end && !ended) audio.end(world.end.success);
  } catch (e) {
    console.error(e);
  }
  ended = !!world.end;
  let three = false;
  if (view3d) {
    try {
      view3d.draw(world, vw, vh, view.zoom, dt, view.roll);
      three = true;
    } catch (e) {
      console.error("space: 3D view failed, staying flat —", e);
      view3d = null;
    }
  }
  draw(ctx, view, world, vw, vh, dt, three);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
