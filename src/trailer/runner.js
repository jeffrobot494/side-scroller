// ---------------------------------------------------------------------------
// THE TAKE RUNNER (tech/trailer.md, T0).
//
// Runs one mission segment the way test/mission-golden.test.mjs runs the
// golden: the REAL Mission, started, its own loop set aside, and every frame
// after that stepped here at a fixed step off the segment's input trace.
// DOM-free apart from the canvases it is handed; the suite drives it with the
// harness canvas and no view.
// ---------------------------------------------------------------------------

import { Mission } from "../mission/mission.js";

export const STEP = 1 / 60;

// The trailer's input stand-in: the shape of test/mission-trace.mjs's
// scriptedInput, fed from a segment's trace (frame index → { held, pressed,
// aim }) instead of the golden's. `aimSource` answers a stick whatever the
// aim mode is, so a take is independent of config.aimMode and the camera.
export function traceInput(trace) {
  let held = {};
  let edges = {};
  let aim = null;
  return {
    count: 0,
    sample() {
      const s = trace(this.count) || {};
      held = s.held || {};
      edges = { ...(s.pressed || {}) };
      aim = s.aim || null;
      this.count++;
    },
    isDown: (a) => held[a] === true,
    justPressed(a) {
      if (!edges[a]) return false;
      edges[a] = false;
      return true;
    },
    aimSource: () => (aim ? { type: "stick", x: aim.x, y: aim.y } : null),
    pollGamepad() {},
    enable() {},
    disable() {},
    reset() { this.count = 0; },
  };
}

// Start a segment. `canvas` is the mission's flat canvas (the HUD layer, never
// captured); `view` is the 3D view, installed BEFORE start() so begin() builds
// this level; `size` is the capture size, set after start() because start()
// sizes the backing store from the config preset.
//
// Returns { mission, frame() } — frame() is one OUTPUT frame: one sample, one
// update of STEP × speed, the motion records, one render.
export function startTake(seg, { canvas = null, view = null, size = null } = {}) {
  const m = new Mission(canvas, () => {});
  if (view) m.setView(view);
  m.start(seg.mission, seg.level, seg.squad);
  // start() armed the real loop; from here the frames are ours.
  m.running = false;
  m.input = traceInput(seg.trace);
  if (size && canvas) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  const speed = seg.speed || 1;
  let f = 0;
  return {
    mission: m,
    get frameIndex() { return f; },
    frame() {
      m.sampleInputs();
      m.update(STEP * speed);
      m.updateMotion();
      m.render();
      f++;
    },
  };
}
