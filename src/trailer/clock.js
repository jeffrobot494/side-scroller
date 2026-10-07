// ---------------------------------------------------------------------------
// THE VIRTUAL CLOCK (tech/trailer.md, T0).
//
// A CLASSIC script, not a module: it must run before any module loads, and
// trailer.mjs injects this same file into graphics-tester/splash.html through
// CDP before that page loads (T5). One source for both.
//
// It replaces the page's three wall-clock readers — requestAnimationFrame,
// performance.now and Math.random — so time moves only when the capture
// script asks for the next frame. Everything that reads them (the mission's
// loop, the hub ambient's loop, the laser flicker, the splash's dt) is then
// frame-exact without an edit to it.
//
// `window.__clock.tick(ms)` advances time and runs the rAF callbacks that were
// queued before the tick; a callback that re-queues runs on the next tick.
// The seed is `?seed=` on the page URL (default 1).
// ---------------------------------------------------------------------------

(function () {
  var now = 0;
  var queue = [];
  var nextId = 1;

  performance.now = function () { return now; };
  window.requestAnimationFrame = function (cb) {
    var id = nextId++;
    queue.push([id, cb]);
    return id;
  };
  window.cancelAnimationFrame = function (id) {
    queue = queue.filter(function (q) { return q[0] !== id; });
  };

  // mulberry32, the stream src/game/gen/rng.js uses.
  var seed = Number(new URLSearchParams(location.search).get("seed")) || 1;
  var s = seed >>> 0;
  Math.random = function () {
    s = (s + 0x6d2b79f5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  window.__clock = {
    get now() { return now; },
    tick: function (ms) {
      now += ms;
      var q = queue;
      queue = [];
      for (var i = 0; i < q.length; i++) q[i][1](now);
    },
  };
})();
