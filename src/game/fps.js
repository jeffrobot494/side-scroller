// ---------------------------------------------------------------------------
// FPS SAMPLER — shared by the hub chip and the mission HUD.
//
// Pure: no DOM, no requestAnimationFrame, no config. The caller feeds it the
// timestamp its own loop already receives, which is what makes it testable
// headlessly (the test harness's rAF never fires a callback).
//
// The published value is refreshed on a WINDOW, not per frame: a number that
// changes 60 times a second is unreadable, and on the hub it would also mean 60
// DOM writes a second.
// ---------------------------------------------------------------------------

export function createFpsSampler({ window = 0.5 } = {}) {
  const win = window > 0 ? window : 0.5;
  let last = 0;   // previous timestamp, 0 = no sample yet
  let frames = 0; // frames counted in the current window
  let elapsed = 0;
  let value = 0;  // last published fps; 0 until the first window completes

  return {
    /** Feed one frame. `now` is a monotonic ms timestamp (rAF's argument). */
    sample(now) {
      const t = Number(now);
      if (!Number.isFinite(t)) return;
      if (last) {
        const dt = (t - last) / 1000;
        // A dt outside this range means a backgrounded tab, a debugger pause,
        // or a clock that went backwards — counting it would poison the average
        // with one enormous gap, so drop the frame and keep the window going.
        if (dt > 0 && dt < 1) {
          frames++;
          elapsed += dt;
          if (elapsed >= win) {
            value = frames / elapsed;
            frames = 0;
            elapsed = 0;
          }
        }
      }
      last = t;
    },

    /** Last published frames-per-second. 0 before the first window completes. */
    fps() {
      return value;
    },

    reset() {
      last = 0;
      frames = 0;
      elapsed = 0;
      value = 0;
    },
  };
}
