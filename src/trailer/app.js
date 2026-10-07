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
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { startTake, FRAMES_PER_BEAT } from "./runner.js";
import { TAKES, SHOTS, CARDS, FPS } from "./takes.js";
import { createStage } from "./stage.js";
import { HUB_TAKES } from "./hubtakes.js";

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

// ---- the text cards (T6) ---------------------------------------------------
// A toned-down relative of the splash title (graphics-tester/splash.js), so
// the splash reads as familiar and still lands as the payoff: the same face
// from the same URL, the same gold family — but flat where the title is
// extruded, smaller, lighter, with less glow, wider tracking and a short fade.
// One set of values, to tune against the splash by eye.
const CARD = {
  fontUrl: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/russoone/RussoOne-Regular.ttf",
  size: 54,          // px at 1080 (the splash's first line is ~9vw ≈ 170px)
  nameSize: 42,      // the roster names in shot 6
  tracking: "0.32em",
  top: "74%",        // where the line sits, from the top
  gold: "linear-gradient(#fff6e2 0%, #f5d796 46%, #d39b4b 54%, #fbe6b4 100%)",
  glow: "drop-shadow(0 0 9px rgba(255, 154, 42, 0.30))",
  shade: "drop-shadow(0 2px 5px rgba(0, 0, 0, 0.65))", // reads over bright frames
  fade: 0.35,        // s in and out
};

// The card layer alone, on a transparent page, frame by global frame. A frame
// with no card answers "blank" and the capture reuses one empty frame.
async function buildCards() {
  document.body.classList.add("cards-take");
  const face = new FontFace("Trailer Russo", `url(${CARD.fontUrl})`);
  document.fonts.add(await face.load());
  const el = document.createElement("div");
  el.id = "card";
  Object.assign(el.style, {
    position: "absolute", left: "0", right: "0", top: CARD.top, transform: "translateY(-50%)",
    textAlign: "center", fontFamily: "'Trailer Russo', sans-serif", letterSpacing: CARD.tracking,
    paddingLeft: CARD.tracking, // tracking adds space after the last letter; this re-centres it
    background: CARD.gold, webkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
    filter: `${CARD.shade} ${CARD.glow}`, whiteSpace: "nowrap",
  });
  document.body.appendChild(el);
  const total = SHOTS[SHOTS.length - 1].to * FRAMES_PER_BEAT;
  window.trailer.frames = total;
  window.trailer.frame = (f) => {
    const t = f / FPS;
    const card = CARDS.find((c) => t >= c.from / 2 && t < c.to / 2);
    if (!card) { el.style.opacity = "0"; return "blank"; }
    const a = Math.min(1, (t - card.from / 2) / CARD.fade, (card.to / 2 - t) / CARD.fade);
    el.textContent = card.text;
    el.style.fontSize = `${card.kind === "name" ? CARD.nameSize : CARD.size}px`;
    el.style.opacity = String(Math.max(0, a));
    return null;
  };
}

// A hub take (T4): the real hub, staged; frame() returns the page rectangle
// the capture scales to the frame.
function buildHub(n) {
  document.body.classList.add("hub-take");
  const take = HUB_TAKES[n](document.getElementById("hub-root"), { W: innerWidth, H: innerHeight, aspect: W / H });
  let f = 0;
  window.trailer.frames = take.frames;
  window.trailer.frame = () => {
    window.__clock.tick(1000 / FPS);
    return take.frame(f++);
  };
}

async function build() {
  const id = q.get("take") || "proof";
  if (id === "cards") return buildCards();
  const hubShot = /^shot(\d+)$/.exec(id);
  if (hubShot && HUB_TAKES[hubShot[1]]) return buildHub(hubShot[1]);
  const view = createView3D(canvas3d);
  // The long-lens blur (T2), injected so the game's view never imports it.
  view.setPass(({ scene, camera }) => {
    const pass = new BokehPass(scene, camera, { focus: 500, aperture: 0, maxblur: 0 });
    return {
      pass,
      update(blur, cam) {
        pass.uniforms.focus.value = blur.focus ?? cam.dist;
        pass.uniforms.aperture.value = blur.aperture;
        pass.uniforms.maxblur.value = blur.maxblur;
      },
    };
  });
  // Frame one has the rigs and the armour, never the fallback blocks.
  await Promise.all([loadEnemyRigs(), loadArmour()]);
  const stage = createStage(view);

  // A take is one segment (T0/T1's) or a shot: its segments in order, each a
  // fresh mission on the same view, the last one stopped as the next starts.
  const shot = /^shot(\d+)$/.exec(id);
  const segs = shot
    ? (SHOTS.find((s) => s.n === Number(shot[1]))?.segments || []).map((g) => ({ make: g.make, frames: (g.to - g.from) * FRAMES_PER_BEAT }))
    : TAKES[id] ? [{ make: TAKES[id], frames: null }] : null;
  if (!segs || !segs.length) throw new Error(`no mission take "${id}"`);

  let i = -1, take = null, left = 0;
  function next() {
    if (take) { take.mission.stop(); stage.end(); }
    i++;
    const seg = segs[i].make();
    take = startTake(seg, { canvas, view, size: { w: W, h: H } });
    stage.begin(take.mission, seg);
    left = segs[i].frames ?? seg.frames;
  }
  next();
  window.trailer.frames = segs.reduce((n, g, k) => n + (g.frames ?? (k === 0 ? left : 0)), 0);
  window.trailer.frame = () => {
    if (left <= 0 && i < segs.length - 1) next();
    window.__clock.tick(1000 / FPS);
    take.frame();
    left--;
  };
}
window.trailer = { renderer: rendererString(), frames: 0, frame: null };
window.trailer.ready = build();
