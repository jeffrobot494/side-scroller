// The shared FPS sampler (src/game/fps.js) and the hub's meter chip. The
// sampler takes `now` as an argument precisely so it can be driven with a
// synthetic clock here — the harness's requestAnimationFrame never fires.
//
// Frame counts below deliberately overshoot the 0.5s window rather than landing
// on it: 30 frames at 1/60 is 0.5s to within a float rounding error, so an
// exact-boundary test would be asserting IEEE754, not behaviour.
import { createFpsSampler } from "../src/game/fps.js";
import { createFpsMeter } from "../src/hub/fpsmeter.js";
import { SCHEMA, config, setConfig, resetConfig } from "../src/game/config.js";

const F60 = 1000 / 60;
const F30 = 1000 / 30;

// Feed `n` frames spaced `ms` apart, starting after `t0`. Returns the last time.
function feed(s, t0, ms, n) {
  let t = t0;
  for (let i = 0; i < n; i++) {
    t += ms;
    s.sample(t);
  }
  return t;
}

const near = (a, b) => Math.abs(a - b) < 1;

export default async function run(t) {
  // ---- publishes on a window, not per frame -----------------------------
  {
    const s = createFpsSampler(); // 0.5s window
    s.sample(1000);
    t.eq("a single sample publishes nothing", s.fps(), 0);

    const t1 = feed(s, 1000, F60, 20); // 20 deltas = 0.33s, inside the window
    t.eq("nothing published before the window closes", s.fps(), 0);

    feed(s, t1, F60, 20); // now well past 0.5s
    t.ok("publishes ~60 once the window closes", near(s.fps(), 60));
  }

  // ---- republishes, and tracks a change ---------------------------------
  {
    const s = createFpsSampler();
    const t1 = feed(s, 0, F60, 41);
    t.ok("first window ~60", near(s.fps(), 60));

    feed(s, t1, F30, 30); // long enough to flush the mixed window and a clean one
    t.ok("tracks down to ~30", near(s.fps(), 30));
  }

  // ---- a backgrounded tab must not poison the average -------------------
  {
    const s = createFpsSampler();
    const t1 = feed(s, 0, F60, 41);
    t.ok("baseline ~60", near(s.fps(), 60));

    s.sample(t1 + 5000); // 5s gap: tab was hidden
    feed(s, t1 + 5000, F60, 41);
    t.ok("gap discarded, still ~60", near(s.fps(), 60));
  }

  // ---- degenerate inputs ------------------------------------------------
  {
    const s = createFpsSampler();
    s.sample(500);
    s.sample(500); // zero dt must not divide by zero
    feed(s, 500, F60, 41);
    t.ok("zero dt ignored, value stays finite", Number.isFinite(s.fps()) && near(s.fps(), 60));

    const s2 = createFpsSampler();
    s2.sample(NaN);
    s2.sample(undefined);
    s2.sample("nonsense");
    t.eq("non-numeric samples ignored", s2.fps(), 0);

    const s3 = createFpsSampler();
    const t3 = feed(s3, 0, F60, 41);
    s3.sample(t3 - 100); // clock went backwards
    t.ok("backwards clock does not corrupt the value", near(s3.fps(), 60));
  }

  // ---- reset ------------------------------------------------------------
  {
    const s = createFpsSampler();
    feed(s, 0, F60, 41);
    t.ok("has a value before reset", s.fps() > 0);
    s.reset();
    t.eq("reset clears the value", s.fps(), 0);
    s.sample(9000);
    t.eq("reset drops the partial window too", s.fps(), 0);
  }

  // ---- schema -----------------------------------------------------------
  {
    const group = SCHEMA.find((g) => g.title === "Viewport");
    const item = group.items.find((i) => i.key === "showFps");
    t.ok("showFps lives in the Viewport group", !!item);
    t.eq("showFps is a bool", item.type, "bool");
    t.eq("showFps defaults on", item.default, true);
    t.eq("live config reflects the default", config.showFps, true);
  }

  // ---- the hub meter mounts and is drivable synchronously ---------------
  {
    resetConfig();
    const m = createFpsMeter();
    t.ok("meter exposes an element", !!m.el);
    t.eq("element is a div", m.el.tagName, "div");
    t.eq("element carries the style hook", m.el.className, "fps-meter");
    t.eq("starts hidden until a scene claims it", m.el.style.display, "none");

    // The hub becomes visible, then a full window of frames goes through.
    m.setSceneVisible(true);
    t.eq("placeholder before any sample", m.el.textContent, "-- FPS");

    let now = 0;
    for (let i = 0; i < 41; i++) { now += F60; m.update(now); }
    t.eq("visible in the hub", m.el.style.display, "block");
    t.ok("shows a number once sampled", /\d/.test(m.el.textContent));
    t.ok("labelled FPS", m.el.textContent.includes("FPS"));
    t.eq("reads ~60", m.el.textContent, "60 FPS");
    t.eq("healthy rate is muted, not alarming", m.el.style.color, "#808b99");

    // a bad frame rate colours the chip
    for (let i = 0; i < 60; i++) { now += 100; m.update(now); } // 10fps
    t.eq("slow rate reads low", m.el.textContent, "10 FPS");
    t.eq("slow rate goes red", m.el.style.color, "#ff6a6a");

    // hidden during a mission (the mission draws its own into the canvas)
    m.setSceneVisible(false);
    t.eq("hidden during a mission", m.el.style.display, "none");

    // returning to the hub drops the stale pre-deploy number
    m.setSceneVisible(true);
    t.eq("stale value cleared on return", m.el.textContent, "-- FPS");

    // and the config toggle hides it even while the hub is up
    setConfig("showFps", false);
    for (let i = 0; i < 41; i++) { now += F60; m.update(now); }
    t.eq("config toggle hides it", m.el.style.display, "none");

    setConfig("showFps", true);
    for (let i = 0; i < 41; i++) { now += F60; m.update(now); }
    t.eq("config toggle brings it back", m.el.style.display, "block");

    let threw = false;
    try { m.dispose(); } catch { threw = true; }
    t.ok("dispose is clean", !threw);
    resetConfig();
  }
}
