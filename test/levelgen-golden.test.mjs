// ---------------------------------------------------------------------------
// LEVEL-GEN GOLDEN — the behaviour-preserving guard for the nav refactor
// (tech/agent-navigation.md, Slice N0).
//
// N1 refactors `auditGeometry` onto the shared nav graph builder and claims to
// change nothing. Nothing in the suite could check that: gen.test.mjs compares
// two generateLevel calls INSIDE one run (real determinism, but a tautology
// across code versions) and otherwise asserts only that a level is traversable.
// A refactor that culls a different structure produces a different level for the
// same seed and passes every existing assertion.
//
// So: freeze the generator's actual output for a spread of seeds/difficulties/
// lengths/biomes BEFORE touching it, and compare byte-for-(rounded)-bit after.
// The golden is `levelgen.golden.json`; delete it and re-run to reseed, which is
// a deliberate act that shows up in a diff.
//
// Determinism is a property of the generator (seeded rng) plus the config knobs
// generation reads (gravity/jumpSpeed/runSpeed → the jump envelope; genMaxTiers/
// genPlatformDensity/genStructureSpacing → the terrain layout). Suites that ran
// earlier may have left config dirty, so we resetConfig() first: the golden
// captures the SHIPPING configuration, not whatever the previous suite left.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateLevel, BIOMES } from "../src/game/gen/levelgen.js";
import { resetConfig } from "../src/game/config.js";

const GOLDEN = fileURLToPath(new URL("./levelgen.golden.json", import.meta.url));

// ---- cases ----------------------------------------------------------------

// A spread wide enough that a geometry change has to show up somewhere: several
// seeds on the shipping defaults, then one axis at a time held against a fixed
// seed so a failure names which input the drift depends on.
function cases() {
  const out = [];
  const add = (name, params) => out.push({ name, params });

  // the shipping path — default difficulty/length, varied seed
  for (const seed of [1, 7, 42, 1337, 90210, 2026]) add(`default:${seed}`, { seed });
  // difficulty drives the enemy budget and the legal roster
  for (const difficulty of ["low", "medium", "high", "extreme"]) add(`diff:${difficulty}`, { seed: 31337, difficulty });
  // length drives world width, which is the main source of cull pressure
  for (const length of ["short", "medium", "long"]) add(`len:${length}`, { seed: 5150, length });
  // biome is theming only — pinned so it can never silently reshape geometry
  for (const b of BIOMES) add(`biome:${b.id}`, { seed: 8675309, biome: b.id });
  // a boss lead: forces the toughest roster enemy near the exit, 1.4x budget
  add("boss", { seed: 24601, boss: true });
  // campaign pressure multiplies the budget without touching terrain
  add("scale:2", { seed: 11235, scale: 2 });

  return out;
}

// ---- capture --------------------------------------------------------------

// Round every number so a harmless float rewrite (a*2 vs a+a) can't fail the
// golden while a real geometry change still does.
function canon(v) {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : String(v);
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canon(v[k]);
    return out;
  }
  return v;
}

// `level` is what loadMission consumes; `report` is where the audit's own
// verdict lives (traversable / unreachable / culledStructures), which is the
// number most likely to move if the refactored graph disagrees with the old
// flood fill. Both, or the guard has a hole exactly where N1 works.
function capture(params) {
  const { level, report } = generateLevel(params);
  return canon({ level, report });
}

// First differing path, so a failure says WHERE rather than "not equal".
function firstDiff(a, b, path = "") {
  if (a === b) return null;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object")
    return `${path || "<root>"}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array/object mismatch`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${path}.length: ${a.length} → ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.join(",") !== kb.join(",")) return `${path || "<root>"}: keys [${ka}] → [${kb}]`;
  for (const k of ka) {
    const d = firstDiff(a[k], b[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return null;
}

// ---- assertions -----------------------------------------------------------

export default async function run(t) {
  resetConfig(); // pin the knobs generation reads, whatever ran before us
  const cs = cases();

  // (1) determinism — the same params capture identically twice. If this fails
  // the golden is worthless, so it is asserted before the comparison.
  let flaky = null;
  for (const c of cs) {
    const d = firstDiff(capture(c.params), capture(c.params));
    if (d) { flaky = `${c.name} — ${d}`; break; }
  }
  t.ok(`determinism: every case captures identically twice${flaky ? ` (${flaky})` : ""}`, !flaky);

  // (2) the current snapshot
  const snapshot = {};
  for (const c of cs) snapshot[c.name] = capture(c.params);

  // (3) compare to — or seed — the golden
  if (!existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(snapshot, null, 0));
    t.ok(`golden: wrote baseline for ${cs.length} cases (re-run to compare)`, true);
  } else {
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
    t.eq("golden: same case set", Object.keys(snapshot).sort(), Object.keys(golden).sort());
    for (const name of Object.keys(golden)) {
      const d = snapshot[name] ? firstDiff(golden[name], snapshot[name]) : "case missing";
      t.ok(`golden: ${name} unchanged${d ? ` — ${d}` : ""}`, !d);
    }
  }

  // (4) floors that hold independently of the golden, so a carelessly reseeded
  // fixture still cannot bless a broken generator.
  let notTraversable = null;
  let reachBroken = null;
  let noGround = null;
  let empty = null;
  for (const c of cs) {
    const { level, report } = generateLevel(c.params);
    if (!report.traversable) { notTraversable = c.name; break; }
    if (report.unreachable !== 0) { reachBroken = `${c.name} (${report.unreachable})`; break; }
    const g = level.platforms[0];
    if (!g || g.x !== 0 || g.w !== report.width) { noGround = c.name; break; }
    if (!level.enemies.length) { empty = c.name; break; }
  }
  t.ok(`floor: every case is traversable${notTraversable ? ` (${notTraversable})` : ""}`, !notTraversable);
  t.ok(`floor: no unreachable perches${reachBroken ? ` (${reachBroken})` : ""}`, !reachBroken);
  t.ok(`floor: ground slab spans the world${noGround ? ` (${noGround})` : ""}`, !noGround);
  t.ok(`floor: every case places enemies${empty ? ` (${empty})` : ""}`, !empty);
}
