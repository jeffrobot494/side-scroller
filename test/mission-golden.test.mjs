// ---------------------------------------------------------------------------
// MISSION GOLDEN — the guard that a mission replays from its seed
// (tech/mission-determinism.md, D2).
//
// Same seed + the same input trace at a fixed step → the same mission. The
// trace is a pure function of the frame index (no wall clock, no rAF), the step
// is 1/60 and never varies, and the host is the REAL `Mission` class driven by
// update() directly: `requestAnimationFrame` is a no-op under the harness, so
// start() sets the scene up and then simply stops, and every frame after that is
// ours. That buys the real per-frame ordering — control, soldiers, enemies,
// projectiles, statuses, loot, outcome — which is where the five draw sites
// actually interact.
//
// What it guards: a NEW unseeded gameplay draw. Add one and the trace moves,
// because the mission's own draws come off scene.rng while an unseeded one comes
// off Math.random, which the second run cannot reproduce — the twice-run
// self-check below reddens before the baseline is ever consulted.
//
// What it deliberately does not guard: cosmetic draws. Motes, sparks, screen
// shake and the loot bob all still call Math.random and none of them is sampled
// here (tech/mission-determinism.md, approximation 2).
//
// Section (4) is the exception to "driven by update() directly": it drives the
// REAL rAF loop off a synthetic clock at four frame rates and asserts they all
// play the mission a bare step loop plays (tech/multiplayer-missions.md, J4).
// It shares this file because it is the same claim one argument wider — same
// seed, same trace, and now any frame rate — and because the trace, the level
// and the sampler are already here.
//
// Delete `mission.golden.json` and re-run to reseed — a deliberate act that
// shows up in a diff.
//
// Numbers compare with a tolerance, like the locomotion golden: Math.sin/cos/
// atan2 are implementation-defined, so an exact compare would be a claim about
// the JS engine rather than about this repo. A mission is chaotic enough that a
// real change moves a trace by far more than 2e-3.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Mission } from "../src/mission/mission.js";
import { generateLevel } from "../src/game/gen/levelgen.js";
import { makeEl } from "./harness.mjs";
import { resetConfig, config } from "../src/game/config.js";
import { sampleScene, firstSampleDiff } from "../src/mission/checksum.js";

const GOLDEN = fileURLToPath(new URL("./mission.golden.json", import.meta.url));
const SAMPLE_EVERY = 12; // frames between snapshots (0.2s)

// The fixed-step harness — the step, the length, the seed, the squad and the
// input trace — now lives in `test/mission-trace.mjs` and is re-exported here.
// THREE things drive this one mission and none of them may drift from the
// others: this golden, `test/mission-divergence.test.mjs` (which imports these
// names from here), and `test/float-probe.html`, which is a browser page and
// therefore cannot import anything that reaches `node:fs` — which this file
// does, on line one. That is why the trace moved out rather than growing a
// third importer. Exports only; no assertion moved.
export { STEP, SECONDS, SEED, SQUAD, scriptedInput } from "./mission-trace.mjs";
import { STEP, SECONDS, SEED, SQUAD, scriptedInput } from "./mission-trace.mjs";

// ---- one run --------------------------------------------------------------

const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0);

// Gameplay state only. Positions, velocities, stance, health, ammo and the live
// projectile front — never a particle, a mote or the shake.
function sample(m) {
  const sc = m.scene;
  return {
    soldiers: sc.soldiers.map((s) => [
      r3(s.x), r3(s.y), r3(s.vx), r3(s.vy),
      s.onGround ? 1 : 0, s.crouched ? 1 : 0, s.alive ? 1 : 0,
      r3(s.health), s.ammo === Infinity ? -1 : s.ammo, s.facing, s.kills,
    ]),
    roots: sc.specRoots.map((r) => [
      r3(r.x), r3(r.y), r3(r.vx), r3(r.vy),
      r.alive ? 1 : 0, r3(r.health || 0), r.brainState.current || "",
    ]),
    // The projectile front is where the spread draw lands first: a shot fired a
    // hair off a different angle shows here a frame after the trigger, long
    // before it shows in anyone's health.
    proj: [sc.projectiles.length, ...sc.projectiles.slice(0, 3).flatMap((p) => [r3(p.x), r3(p.y), r3(p.vx), r3(p.vy)])],
    loot: [sc.loot.length, (sc.collected || []).length],
  };
}

function trace() {
  const { level, mission } = generateLevel({ seed: SEED, difficulty: "high" });
  const m = new Mission(makeEl("canvas"), () => {});
  m.start(mission, level, SQUAD);
  // start() armed the real loop against a no-op rAF; from here the frames are
  // ours, at a fixed step, and the input comes off the trace instead of a device.
  m.running = false;
  m.input = scriptedInput();

  const rows = [];
  const frames = Math.round(SECONDS / STEP);
  for (let f = 0; f <= frames; f++) {
    if (f % SAMPLE_EVERY === 0) rows.push(sample(m));
    m.input.advance(f);
    m.update(STEP);
  }
  return rows;
}

// First differing path, so a failure says WHERE rather than "not equal".
const TOL = 2e-3;

function firstDiff(a, b, path = "") {
  if (typeof a === "number" && typeof b === "number")
    return Math.abs(a - b) <= TOL ? null : `${path}: ${a} → ${b}`;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}.length: ${a.length} → ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join(",") !== kb.join(",")) return `${path || "<root>"}: keys [${ka}] → [${kb}]`;
    for (const k of ka) {
      const d = firstDiff(a[k], b[k], path ? `${path}.${k}` : k);
      if (d) return d;
    }
    return null;
  }
  return a === b ? null : `${path || "<root>"}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`;
}

// ---- assertions -----------------------------------------------------------

export default async function run(t) {
  // A mission trace reads far more knobs than a level does — gravity, run/jump
  // speed, aim spread, the duck chances, the companion brain — and ten suites
  // assign to config. Pin the shipping values first, whatever ran before us.
  resetConfig();

  // (0) the seam is actually installed: without this the two runs below could
  // agree for the wrong reason (e.g. a mission that resolves on frame 1).
  const { level, mission } = generateLevel({ seed: SEED, difficulty: "high" });
  t.ok("seed: the generated mission carries one", mission.seed === SEED);
  const probe = new Mission(makeEl("canvas"), () => {});
  probe.start(mission, level, SQUAD);
  probe.running = false;
  t.ok("seam: the scene carries the mission's stream", typeof probe.scene.rng === "function" && probe.scene.seed === SEED);
  t.ok("seam: every root draws off it", probe.scene.specRoots.every((r) => r.rng === probe.scene.rng));
  t.ok("companions: the spec brain is the path under test", config.companionBrain === "spec");

  // (1) determinism — two runs of the same seed and the same trace agree. This
  // is asserted BEFORE the golden, because a flaky trace makes the baseline
  // worthless: a new unseeded draw fails here first.
  const a = trace();
  const b = trace();
  const flaky = firstDiff(a, b, "frame");
  t.ok(`determinism: the same seed + trace replays identically${flaky ? ` — ${flaky}` : ""}`, !flaky);

  // (2) compare to — or seed — the golden
  if (!existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(a, null, 0));
    t.ok(`golden: wrote baseline for ${a.length} samples (re-run to compare)`, true);
  } else {
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
    t.eq("golden: same sample count", a.length, golden.length);
    const d = firstDiff(golden, a, "frame");
    t.ok(`golden: the mission trace is unchanged${d ? ` — ${d}` : ""}`, !d);
  }

  // (3) floors that hold independently of the golden, so a carelessly reseeded
  // fixture still cannot bless a mission that never happened.
  const last = a[a.length - 1];
  const first = a[0];
  t.ok("floor: the squad deployed", first.soldiers.length === SQUAD.length);
  t.ok("floor: the level placed enemies", first.roots.length > 0);
  t.ok("floor: the controlled soldier covered ground", Math.abs(last.soldiers[0][0] - first.soldiers[0][0]) > 60);
  t.ok("floor: shots were in flight", a.some((s) => s.proj[0] > 0));
  t.ok("floor: somebody took damage", a.some((s) => s.roots.some((r, i) => r[5] < first.roots[i][5] || r[4] === 0)));

  // (4) frame-rate independence (tech/multiplayer-missions.md, J4)
  //
  // Everything above drives `m.update(STEP)` directly and never runs the rAF
  // loop, which is why the spec recorded J4 as unguardable — the golden already
  // lives in the world J4 creates. It is guardable through `_frame`: the loop
  // is a pure function of a clock, the clock is an argument, and rAF is a no-op
  // under the harness, so four frame rates can be driven in one process off one
  // trace. What fails here before J4 is the slice's whole claim: input sampled
  // per rendered frame gives the first step of a frame the presses and the rest
  // of them silence, so 20fps and 144fps play different missions.
  //
  // `direct()` is also the shape a server steps a mission in (J6/J8) — no
  // frames at all — so the same block says the loop adds nothing.
  {
    const build = () => {
      const g = generateLevel({ seed: SEED, difficulty: "high" });
      const m = new Mission(makeEl("canvas"), () => {});
      m.start(g.mission, g.level, SQUAD);
      m.input = scriptedInput(); // its sample() walks the trace one step at a time
      m.render = () => {}; // what a frame DRAWS is not what this asks about
      m.running = true;
      m.accumulator = 0;
      m.lastTime = 0;
      return m;
    };

    // No loop: one sample, one step, the contract stated bare.
    const direct = (steps) => {
      const m = build();
      while (m.input.count < steps) { m.input.sample(); m.update(STEP); }
      return sample(m);
    };

    // The REAL loop, off a synthetic clock. The last frame is trimmed rather
    // than overshot, because two rates compared after a different number of
    // steps say nothing — and a 20fps frame carries three steps, so overshoot
    // is the normal case, not an edge one.
    const atRate = (fps, steps) => {
      const m = build();
      const frameMs = 1000 / fps;
      let now = 0;
      while (m.input.count < steps) {
        const fits = Math.floor((m.accumulator + frameMs / 1000) / STEP);
        if (m.input.count + fits > steps) {
          while (m.input.count < steps) { m.input.sample(); m.update(STEP); }
          break;
        }
        now += frameMs;
        m._frame(now);
      }
      return sample(m);
    };

    const STEPS = 240; // 4s of mission: past the first contact, well into the fight
    const base = direct(STEPS);
    t.ok("frame rate: the bare step loop reached the fight", base.proj[0] > 0 || base.roots.some((r) => r[4] === 0));
    for (const fps of [20, 30, 60, 144]) {
      const run = atRate(fps, STEPS);
      const d = firstDiff(base, run, "frame");
      const exact = JSON.stringify(base) === JSON.stringify(run);
      t.ok(`frame rate: ${fps}fps plays the same mission as a bare step loop${d ? ` — ${d}` : ""}`, exact && !d);
    }
  }

  // (5) the mission runs without a browser (tech/multiplayer-missions.md, J6)
  //
  // The half that can be asserted in here: a Mission built with no canvas is
  // the SAME mission as one built with a canvas. Host-free is a claim about
  // the door, not about the simulation, and a door that quietly changed the
  // physics would be worse than one that threw.
  const HOSTFREE_STEPS = 240;
  const hostFree = (canvas) => {
    const g = generateLevel({ seed: SEED, difficulty: "high" });
    const m = new Mission(canvas, () => {});
    m.input = scriptedInput(); // before start(): the host-free path resets it
    m.start(g.mission, g.level, SQUAD);
    m.running = false; // the frames are ours in both cases
    const rows = [];
    while (m.input.count < HOSTFREE_STEPS) {
      if (m.input.count % 40 === 0) rows.push(sampleScene(m.scene));
      m.input.sample();
      m.update(STEP);
    }
    rows.push(sampleScene(m.scene));
    return { m, rows };
  };
  {
    const hosted = hostFree(makeEl("canvas"));
    // Reported, not thrown: before the slice this is where it dies, and a suite
    // that dies here says nothing about the child-process block below it.
    let bare = null, buildErr = "";
    try { bare = hostFree(null); } catch (e) { buildErr = String(e && e.message); }
    t.ok(`host-free: a Mission with no canvas constructs and starts${buildErr ? ` — ${buildErr}` : ""}`,
      bare !== null && bare.m.hosted === false && bare.m.scene.soldiers.length === 3);
    if (bare) {
    t.ok("host-free: it is the mission a hosted one plays", firstSampleDiff(hosted.rows.at(-1), bare.rows.at(-1)) === null);
    t.ok("host-free: ...at every sampled step", hosted.rows.every((r, i) => firstSampleDiff(r, bare.rows[i]) === null));
    // The viewport is the config preset, not the canvas that was not passed —
    // `_updateCamera` runs every step and a server has to solve the same camera.
    t.eq("host-free: the viewport comes off the config preset", `${bare.m.canvas.width}x${bare.m.canvas.height}`, config.missionCanvas);
    t.ok("host-free: it has no drawing context", bare.m.ctx === null);
    t.ok("host-free: and render() is a no-op rather than a crash", (() => { bare.m.render(); return true; })());
    t.ok("host-free: stop() releases an input that never bound a device", (() => { bare.m.stop(); return bare.m.running === false; })());
    }
  }

  // The half that CANNOT be asserted in here: test/run.mjs installs the DOM
  // before any suite, so every global J6 is about is present in this process.
  // Deleting them would only prove this process can be made to look bare — not
  // that the module graph never reached a host on the way in, which is an
  // import-time question and the one that actually bit. So the claim is put to
  // a child node process with no harness at all, which is also exactly the
  // process the room will be (J8). It reports rather than throws, so a failure
  // arrives as a message instead of as a dead runner.
  {
    const url = (rel) => JSON.stringify(new URL(rel, import.meta.url).href);
    const src = [
      'const out = { steps: ' + HOSTFREE_STEPS + ' };',
      'out.globals = ["window", "document", "requestAnimationFrame", "localStorage"]',
      '  .filter((g) => typeof globalThis[g] !== "undefined");',
      'try {',
      '  const { Mission } = await import(' + url("../src/mission/mission.js") + ');',
      '  const { generateLevel } = await import(' + url("../src/game/gen/levelgen.js") + ');',
      '  const { sampleScene } = await import(' + url("../src/mission/checksum.js") + ');',
      '  const T = await import(' + url("./mission-trace.mjs") + ');',
      '  const g = generateLevel({ seed: T.SEED, difficulty: "high" });',
      '  const m = new Mission(null, () => {});',
      '  m.input = T.scriptedInput();',
      '  m.start(g.mission, g.level, T.SQUAD);',
      '  m.running = false;',
      '  out.rows = [];',
      '  while (m.input.count < out.steps) {',
      '    if (m.input.count % 40 === 0) out.rows.push(sampleScene(m.scene));',
      '    m.input.sample(); m.update(1 / 60);',
      '  }',
      '  out.rows.push(sampleScene(m.scene));',
      '  m.stop();',
      '  out.ok = true;',
      '} catch (e) { out.ok = false; out.error = (e && e.stack) || String(e); }',
      'console.log(JSON.stringify(out));',
    ].join("\n");

    let bare = null, spawnErr = "";
    try {
      bare = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", src], { encoding: "utf8" }));
    } catch (e) {
      spawnErr = String((e && e.stderr) || e);
    }
    t.ok(`bare node: the child ran${spawnErr ? ` — ${spawnErr.slice(0, 300)}` : ""}`, bare !== null);
    if (bare) {
      // If node ever ships one of these, the child stops being the test it
      // claims to be — say so here rather than passing for the wrong reason.
      t.eq("bare node: no host globals were defined", bare.globals.join(","), "");
      t.ok(`bare node: a Mission started and stepped with no browser at all${bare.error ? ` — ${bare.error.split("\n")[0]}` : ""}`, bare.ok === true);
      if (bare.ok) {
        const mine = hostFree(makeEl("canvas")).rows;
        const d = firstSampleDiff(mine.at(-1), bare.rows.at(-1));
        t.ok(`bare node: and it is the mission this process plays${d ? ` — ${d}` : ""}`, d === null);
      }
    }
  }
}
