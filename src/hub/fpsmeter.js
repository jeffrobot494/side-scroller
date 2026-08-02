// ---------------------------------------------------------------------------
// HUB FPS CHIP — the base UI's frame-rate readout.
//
// Mounted as a SIBLING of #hub-root (see main.js), not inside it: Hub.render()
// replaces #hub-root.innerHTML wholesale on every navigation, so anything
// parked in there is wiped the first time you click a room.
//
// It owns its own rAF loop. The hub has no app-level loop, and borrowing
// ambient.js's would tie the meter to whether crew animation is switched on.
// The loop is cancelled while a mission is up — the mission draws its own
// readout into the canvas HUD, and ambient.js already reschedules forever.
//
// `update(now)` is exposed for the same reason ambient.js exposes `step`: the
// test harness's requestAnimationFrame never fires its callback, so a
// synchronous seam is the only way to exercise this headlessly.
// ---------------------------------------------------------------------------

import { createFpsSampler } from "../game/fps.js";
import { config } from "../game/config.js";

// Colours match the mission HUD's readout palette.
const OK = "#808b99";    // --muted
const WARN = "#ffb15a";
const BAD = "#ff6a6a";

export function createFpsMeter() {
  const sampler = createFpsSampler();
  const el = document.createElement("div");
  el.className = "fps-meter";
  // NOT a button/.card/[data-action]: main.js voices a UI click on any of those.
  el.textContent = "-- FPS";
  el.style.display = "none";

  let sceneVisible = false;
  let raf = 0;
  let shown = null; // last rendered integer, so we write textContent ~2x/sec

  function paint() {
    const on = sceneVisible && !!config.showFps;
    el.style.display = on ? "block" : "none";
    if (!on) return;
    const fps = sampler.fps();
    const n = fps > 0 ? Math.round(fps) : null;
    if (n === shown) return;
    shown = n;
    el.textContent = n === null ? "-- FPS" : `${n} FPS`;
    el.style.color = n === null || n >= 50 ? OK : n >= 30 ? WARN : BAD;
  }

  // One frame. Split out from the loop so tests can drive it directly.
  function update(now) {
    sampler.sample(now);
    paint();
  }

  function frame(ts) {
    update(ts);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf) return;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  return {
    el,
    update,
    setSceneVisible(v) {
      sceneVisible = !!v;
      if (sceneVisible) {
        // Drop the old window so returning from a mission doesn't flash a
        // stale number from before the deploy.
        sampler.reset();
        shown = null;
        el.textContent = "-- FPS";
        start();
      } else {
        stop();
      }
      paint();
    },
    dispose() {
      stop();
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}
