// ---------------------------------------------------------------------------
// THE TRAILER PAGE (tech/trailer.md). The only trailer module touching the DOM.
//
// trailer.html?take=<id> builds that take, waits for every asset the first
// frame needs, and publishes `window.trailer` for trailer.mjs to step:
//   ready     resolves once the take is built (rejects with the reason)
//   frames    how many output frames the take is
//   renderer  the WebGL renderer string this page got
//   frame()   advance the virtual clock one frame and draw one frame
// ---------------------------------------------------------------------------

import { createView3D } from "../mission/view3d/index.js";
import { loadEnemyRigs } from "../mission/view3d/enemyrig.js";
import { loadArmour } from "../mission/view3d/armour.js";
import { startTake } from "./runner.js";
import { TAKES, FPS } from "./takes.js";

const q = new URLSearchParams(location.search);
const W = Number(q.get("w")) || 1920;
const H = Number(q.get("h")) || 1080;

const canvas = document.getElementById("game");
const canvas3d = document.getElementById("game3d");
canvas3d.width = W;
canvas3d.height = H;
canvas3d.style.width = `${W}px`;
canvas3d.style.height = `${H}px`;

function rendererString() {
  const gl = document.createElement("canvas").getContext("webgl");
  if (!gl) return "(no WebGL)";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
}

async function build() {
  const id = q.get("take") || "proof";
  const make = TAKES[id];
  if (!make) throw new Error(`no take "${id}"`);
  const view = createView3D(canvas3d);
  // Frame one has the rigs and the armour, never the fallback blocks.
  await Promise.all([loadEnemyRigs(), loadArmour()]);
  const seg = make();
  const take = startTake(seg, { canvas, view, size: { w: W, h: H } });
  window.trailer.frames = seg.frames;
  window.trailer.frame = () => {
    window.__clock.tick(1000 / FPS);
    take.frame();
  };
}

window.trailer = { renderer: rendererString(), frames: 0, frame: null };
window.trailer.ready = build();
