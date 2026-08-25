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
// Delete `mission.golden.json` and re-run to reseed — a deliberate act that
// shows up in a diff.
//
// Numbers compare with a tolerance, like the locomotion golden: Math.sin/cos/
// atan2 are implementation-defined, so an exact compare would be a claim about
// the JS engine rather than about this repo. A mission is chaotic enough that a
// real change moves a trace by far more than 2e-3.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Mission } from "../src/mission/mission.js";
import { generateLevel } from "../src/game/gen/levelgen.js";
import { makeEl } from "./harness.mjs";
import { resetConfig, config } from "../src/game/config.js";

const GOLDEN = fileURLToPath(new URL("./mission.golden.json", import.meta.url));
const STEP = 1 / 60;
const SECONDS = 8;
const SAMPLE_EVERY = 12; // frames between snapshots (0.2s)
const SEED = 20260824;

// ---- the squad ------------------------------------------------------------
// Weapon literals, not ARSENAL entries: `applyWeaponOverrides` mutates the
// shipped weapon objects in place from localStorage, so a golden built on them
// would depend on which suite ran before this one. Between them they cover the
// spread draw twice over — one shot per pull, and one pull that draws per pellet.

const AUTO_RIFLE = {
  id: "gold_rifle", name: "Trace Rifle", fireRate: 6, auto: true, spread: 0.03,
  magazine: 24, reloadTime: 1.6,
  projectile: { speed: 900, w: 12, h: 4, color: "#ffd8a0", life: 1.4, shape: "bolt" },
  effects: [{ kind: "damage", amount: 6 }],
};
const SCATTER = {
  id: "gold_scatter", name: "Trace Scattergun", fireRate: 1.8, auto: false, spread: 0.05,
  magazine: 6, reloadTime: 2.2,
  projectile: { speed: 720, w: 8, h: 8, color: "#ffe0b0", life: 0.6, shape: "pellet" },
  effects: [{ kind: "damage", amount: 4 }, { kind: "pellets", count: 5, spread: 0.16 }],
};

// Stats spread across Aim (spread width) and Speed (the duck roll's chance and
// latency), so both stat-driven draws vary between squadmates.
const SQUAD = [
  { data: { id: "s1", name: "Rook", callsign: "RK", stats: { health: 7, aim: 8, speed: 4 } }, weapon: AUTO_RIFLE },
  { data: { id: "s2", name: "Vale", callsign: "VL", stats: { health: 6, aim: 4, speed: 9 } }, weapon: SCATTER },
  { data: { id: "s3", name: "Pike", callsign: "PK", stats: { health: 8, aim: 6, speed: 6 } }, weapon: AUTO_RIFLE },
];

// ---- the input trace ------------------------------------------------------
// A recorded trace, expressed as a pure function of the frame index. This is the
// "fixed input at a fixed step" the whole spec is qualified on: no wall clock,
// no polling, and identical on every run and every machine.

function scriptAt(f) {
  const held = {};
  // advance right, except for two stretches where the player holds position
  if (!(f >= 220 && f < 280) && !(f >= 400 && f < 430)) held.right = true;
  if (f >= 250 && f < 268) held.left = true; // back up under fire
  if (f % 90 < 6) held.jump = true;
  if (f >= 300 && f < 360) held.crouch = true; // kneel, then stand back up
  if (f > 40) held.fire = true; // auto weapons fire on hold
  const pressed = {};
  if (f % 11 === 0) pressed.fire = true; // and semi-autos on the edge
  if (f === 420) pressed.reload = true;
  if (f === 480) pressed.swap = true; // hand control to a squadmate mid-fight
  // A stick aim that sweeps, so the spread draw is not always about the same
  // axis and the muzzle direction changes every frame.
  const a = Math.sin(f / 37) * 0.7;
  return { held, pressed, aim: { x: Math.cos(a), y: Math.sin(a) } };
}

// A MissionInput stand-in. `aimSource` answers a stick whatever the aim mode is,
// so the trace is independent of config.aimMode, the camera and the zoom.
function scriptedInput() {
  let held = {};
  let edges = {};
  let aim = null;
  return {
    advance(f) {
      const s = scriptAt(f);
      held = s.held;
      edges = { ...s.pressed };
      aim = s.aim;
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
  };
}

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
}
