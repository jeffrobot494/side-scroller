// ---------------------------------------------------------------------------
// LOCOMOTION CHARACTERIZATION — the behavior-preserving guard for the locomotor
// refactor (docs/LOCOMOTOR-REFACTOR.md, Slice L1, Step 0).
//
// Instantiate the built-in mission roster + the motion templates + a synthetic
// fixture per motion controller, sim each for 4s against ONE fixed scene, and
// snapshot every root's (x, y, vx, vy, onGround, brainState.current) on a fixed
// cadence. The snapshots are stored in a golden file (locomotion.golden.json);
// the refactor must reproduce them bit-for-(rounded)-bit.
//
// Determinism is engineered, not assumed: root.rng defaults to Math.random and
// makeInstance seeds hoverPhase/orbitAngle from Math.random, so right after
// instantiate we (1) seed root.rng with a fixed PRNG and (2) zero every entity's
// hoverPhase/orbitAngle. A twice-run self-check catches any missed source before
// the golden is trusted. Roots only are snapshotted (spawned projectiles pick
// their own random phases, but those never feed back into a root's position).
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { TEMPLATE_BY_ID } from "../src/game/enemyspec/templates.js";
import { MISSION_ENEMY_SPECS, MISSION_BOSS_SPEC } from "../src/game/enemyspecs.js";
import { instantiate, updateSpecEnemy, applyDamage } from "../src/mission/enemyspec/runtime.js";

const STEP = 1 / 60;
const SECONDS = 4;
const SAMPLE_EVERY = 6; // frames between snapshots (0.1s)
const GOLDEN = fileURLToPath(new URL("./locomotion.golden.json", import.meta.url));

// ---- determinism helpers --------------------------------------------------

// mulberry32 — a tiny, fast, fully-deterministic PRNG so a seeded root produces
// the identical decision/aim/jitter stream on every run and every code version.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function determinize(root, seed) {
  root.rng = mulberry32(seed);
  const walk = (e) => {
    e.hoverPhase = 0;
    e.orbitAngle = 0;
    for (const c of e.children) walk(c);
  };
  walk(root);
  return root;
}

// ---- fixed host -----------------------------------------------------------

function makeScene() {
  return {
    world: { width: 1400, height: 540, gravity: 2000 },
    platforms: [
      { x: 0, y: 500, w: 1400, h: 40 }, // ground
      { x: 820, y: 380, w: 280, h: 20 }, // a ledge the player stands on (chase hop / hover climb)
      { x: 560, y: 300, w: 40, h: 200 }, // a mid wall (flyer terrain resolution)
    ],
    // a STATIC soldier on the ledge — no player motion keeps the sim deterministic
    soldiers: [{ kind: "soldier", x: 960, y: 334, w: 30, h: 46, vx: 0, vy: 0, onGround: true, alive: true, health: 1e9, maxHealth: 1e9 }],
    enemies: [],
    projectiles: [],
  };
}

function makeCtx() {
  // enemies take no damage in this harness; soldier isn't a spec target, so the
  // damage/kill sinks just need to exist. spark/burst are no-ops (no deaths).
  return {
    friendlyFire: false,
    damageMult: 1,
    damage() {},
    kill() {},
    spark() {},
    burst() {},
  };
}

// ---- fixtures -------------------------------------------------------------

const isFlying = (n) => n.root && n.root.body && n.root.body.gravity === 0;

// A minimal normalized spec exercising one motion controller as the root.
function synthetic(id, motion, { size = [28, 28], gravity } = {}) {
  const body = gravity === undefined ? {} : { gravity };
  return normalizeSpec({
    id,
    root: { health: { max: 50 }, visual: { size }, body, motion },
  });
}

function fixtures() {
  const out = [];
  const add = (name, nspec) => out.push({ name, nspec });

  // built-in production roster (normalized) + the boss
  for (const s of MISSION_ENEMY_SPECS) add(`roster:${s.id}`, normalizeSpec(s));
  add(`roster:${MISSION_BOSS_SPEC.id}`, normalizeSpec(MISSION_BOSS_SPEC));

  // authoring / few-shot templates
  for (const id of Object.keys(TEMPLATE_BY_ID)) add(`tpl:${id}`, normalizeSpec(TEMPLATE_BY_ID[id]));

  // one synthetic per controller not otherwise covered by the roster, so all 10
  // are guarded (roster covers static/chase-legged/keepDistance/hover)
  add("ctl:velocity", synthetic("s_velocity", { type: "velocity", vx: 120, vy: -30 }, { size: [24, 24], gravity: 0 }));
  add("ctl:gravity", synthetic("s_gravity", { type: "gravity" }, { size: [28, 28] }));
  add("ctl:moveTo_legged", synthetic("s_moveto_g", { type: "moveTo", target: "player", speed: 120 }, { size: [28, 40] }));
  add("ctl:moveTo_flying", synthetic("s_moveto_f", { type: "moveTo", target: "player", speed: 140 }, { size: [26, 26], gravity: 0 }));
  add("ctl:patrol", synthetic("s_patrol", { type: "patrol", range: 160, speed: 80 }, { size: [30, 30] }));
  add("ctl:chase_flying", synthetic("s_chase_f", { type: "chase", speed: 200 }, { size: [24, 24], gravity: 0 }));
  add("ctl:orbit", synthetic("s_orbit", { type: "orbit", around: "player", radius: 90, degPerSec: 90 }, { size: [20, 20], gravity: 0 }));
  add("ctl:home", synthetic("s_home", { type: "home", speed: 180, turnRate: 3 }, { size: [16, 16], gravity: 0 }));

  return out;
}

// Spawn feet-on-ground for grounded bodies, airborne for flyers.
function spawnY(nspec) {
  return isFlying(nspec) ? 280 : 500 - nspec.root.body.h;
}

const r3 = (v) => Math.round(v * 1000) / 1000;

// One deterministic run → the sampled trajectory of the root.
function trace(fixture, seed) {
  const scene = makeScene();
  const ctx = makeCtx();
  const root = instantiate(fixture.nspec, 200, spawnY(fixture.nspec));
  determinize(root, seed);
  const rows = [];
  const frames = Math.round(SECONDS / STEP);
  for (let i = 0; i <= frames; i++) {
    if (i % SAMPLE_EVERY === 0) {
      rows.push([r3(root.x), r3(root.y), r3(root.vx), r3(root.vy), root.onGround ? 1 : 0, root.brainState.current || ""]);
    }
    updateSpecEnemy(root, STEP, scene, ctx);
  }
  return rows;
}

// ---- assertions -----------------------------------------------------------

export default async function run(t) {
  const fx = fixtures();
  const seedOf = (i) => 0x1234 + i * 7919;

  // (1) determinism: the same fixture traces identically twice
  let flaky = null;
  for (let i = 0; i < fx.length; i++) {
    const a = JSON.stringify(trace(fx[i], seedOf(i)));
    const b = JSON.stringify(trace(fx[i], seedOf(i)));
    if (a !== b) { flaky = fx[i].name; break; }
  }
  t.ok(`determinism: every fixture traces identically twice${flaky ? ` (flaky: ${flaky})` : ""}`, !flaky);

  // (2) build the current snapshot
  const snapshot = {};
  for (let i = 0; i < fx.length; i++) snapshot[fx[i].name] = trace(fx[i], seedOf(i));

  // (3) compare to (or seed) the golden
  if (!existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(snapshot, null, 0));
    t.ok(`golden: wrote baseline for ${fx.length} fixtures (re-run to compare)`, true);
    return;
  }

  const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
  const goldKeys = Object.keys(golden);
  t.eq("golden: same fixture set", Object.keys(snapshot).sort(), goldKeys.slice().sort());

  const TOL = 2e-3;
  for (const name of goldKeys) {
    const g = golden[name];
    const s = snapshot[name];
    if (!s) { t.ok(`golden: ${name} present`, false); continue; }
    let diff = null;
    outer: for (let f = 0; f < g.length; f++) {
      const gr = g[f];
      const sr = s[f];
      if (!sr) { diff = `frame ${f} missing`; break; }
      for (let k = 0; k < 4; k++) {
        if (Math.abs(gr[k] - sr[k]) > TOL) { diff = `frame ${f} field ${["x", "y", "vx", "vy"][k]}: ${gr[k]} → ${sr[k]}`; break outer; }
      }
      if (gr[4] !== sr[4]) { diff = `frame ${f} onGround: ${gr[4]} → ${sr[4]}`; break; }
      if (gr[5] !== sr[5]) { diff = `frame ${f} state: ${gr[5]} → ${sr[5]}`; break; }
    }
    t.ok(`golden: ${name} matches baseline${diff ? ` — ${diff}` : ""}`, !diff);
  }

  // A sanity floor independent of the golden: things actually MOVED, so the
  // harness isn't silently simulating stationary bricks.
  const charger = snapshot["roster:husk_charger"];
  t.ok("sanity: charger advanced toward the player", charger[charger.length - 1][0] > charger[0][0] + 100);
  // keep the import referenced so a future assertion can damage a part
  void applyDamage;
}
