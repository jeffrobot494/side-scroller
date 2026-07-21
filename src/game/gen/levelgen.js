// ---------------------------------------------------------------------------
// LEVEL GENERATOR (Slice 1) — deterministic, procedural, no LLM.
//
// generateLevel(params) → { level, mission, report }
//   - level:   LEVELS-shaped, drop-in for loadMission()
//   - mission: MISSIONS-shaped meta (name/brief/difficulty/threatReward/…)
//   - report:  facts for the editor's Level Generator playground (budget spent,
//              enemy count, dropped perches, traversability)
//
// Geometry model (Slice 1): a CONTINUOUS GROUND SLAB spanning the world, so the
// level is always completable — the player can walk end to end. Floating perches
// are additive (loot/vantage), placed only within the jump envelope so they're
// reachable straight up from the ground beneath. Enemies are drawn from the
// legal roster onto ground/perch anchors until their summed threat fills the
// difficulty budget. Everything derives from `seed`, so the same params always
// produce the same level (cacheable, reproducible, previewable).
//
// This is the permanent fallback + validation baseline: once the LLM authors
// flavor (Slice 2), a failed/invalid response falls back to exactly this.
// ---------------------------------------------------------------------------

import { config } from "../config.js";
import { ENEMIES } from "../content.js";
import { makeRng, int, range, snap, pick, shuffle } from "./rng.js";
import { jumpEnvelope } from "./reach.js";
import { enemyThreat, budgetFor, validatePlacement, DIFFICULTY } from "../enemycost.js";

// Fixed world dimensions (match the hand-authored levels).
const WORLD_H = 540;
const GROUND_TOP = 500; // top surface of the ground slab
const GROUND_H = 40;
const PERCH_H = 20;
const SPAWN_X = 120;
const SPAWN_SAFE = 380; // no enemies within this x of the spawn
const EXIT_W = 60;
const EXIT_H = 120;
const MIN_ENEMY_GAP = 130; // min horizontal spacing between enemies

const LENGTHS = {
  short: [2400, 2800],
  medium: [3000, 3400],
  long: [3700, 4100],
};

// Theming table (data — extend or move to its own module later). Each biome
// supplies a site name pool, a mission verb, and an artifact pool.
export const BIOMES = [
  { id: "ridge", verb: "Recon", sites: ["Perimeter Ridge", "Ashfall Cliffs", "Grey Spur"], artifacts: ["Signal Relay", "Recon Cache", "Marker Beacon"] },
  { id: "depot", verb: "Raid", sites: ["Supply Depot", "Fuel Yard", "Munitions Stack"], artifacts: ["Fusion Cell", "Munitions Crate", "Fuel Core"] },
  { id: "hive", verb: "Assault", sites: ["Hive Approach", "Brood Tunnels", "The Spire"], artifacts: ["Hive Node", "Brood Sample", "Command Shard"] },
  { id: "ruins", verb: "Sweep", sites: ["Old Township", "Collapsed Overpass", "Transit Station"], artifacts: ["Black Box", "Civilian Manifest", "Data Core"] },
];

const THREAT_REWARD = { low: 16, medium: 24, high: 32, extreme: 40 };
const DIFF_LABEL = { low: "Low", medium: "Medium", high: "High", extreme: "Extreme" };

// ---- main -----------------------------------------------------------------
// params: { seed, difficulty="medium", length="medium", biome?, roster?,
//           scale=1, boss=false }
export function generateLevel(params = {}) {
  const seed = (params.seed ?? Math.floor(Math.random() * 1e9)) | 0;
  const rng = makeRng(seed);

  const difficulty = params.boss ? "extreme" : (params.difficulty || "medium");
  const length = params.length || "medium";
  const roster = (params.roster && params.roster.length ? params.roster : Object.values(ENEMIES));
  const scale = params.scale || 1;

  const physics = params.physics || {
    gravity: config.gravity,
    jumpSpeed: config.jumpSpeed,
    runSpeed: config.runSpeed,
  };
  const env = jumpEnvelope(physics);

  const biome = params.biome
    ? BIOMES.find((b) => b.id === params.biome) || pickBiome(rng, difficulty)
    : pickBiome(rng, difficulty);

  // ---- geometry ----------------------------------------------------------
  const [wMin, wMax] = LENGTHS[length] || LENGTHS.medium;
  const width = snap(int(rng, wMin, wMax), 20);

  const platforms = [{ x: 0, y: GROUND_TOP, w: width, h: GROUND_H }]; // continuous ground
  const exit = { x: width - EXIT_W - 80, y: GROUND_TOP - EXIT_H, w: EXIT_W, h: EXIT_H };

  const { perches, droppedPerches } = layPerches(rng, env, width, exit.x);
  for (const p of perches) platforms.push(p);

  // ---- enemies -----------------------------------------------------------
  const budget = params.boss ? Math.round(budgetFor("extreme", scale) * 1.4) : budgetFor(difficulty, scale);
  const anchors = buildAnchors(rng, perches, width, exit.x);
  const placed = fillEnemies(rng, roster, anchors, budget, params.boss);

  const enemies = placed.map((pl) => ({ type: pl.def.id, x: Math.round(pl.x), y: Math.round(pl.surfaceY - pl.def.h) }));
  const verdict = validatePlacement(placed.map((pl) => pl.def), budget);

  // ---- meta --------------------------------------------------------------
  const site = pick(rng, biome.sites);
  const artifactName = pick(rng, biome.artifacts);
  const artifactValue = Math.round((60 + budget * 0.35) * (params.boss ? 2.2 : 1));
  const id = `gen_${seed}`;

  const level = {
    id,
    name: `${biome.verb}: ${site}`,
    world: { width, height: WORLD_H, gravity: physics.gravity },
    platforms,
    playerSpawn: { x: SPAWN_X, y: GROUND_TOP - 80 },
    enemies,
    exit,
    artifact: { name: artifactName, value: artifactValue },
  };

  const mission = {
    id,
    name: level.name,
    difficulty: params.boss ? "Extreme" : DIFF_LABEL[difficulty],
    brief: writeBrief(biome, site, difficulty, params.boss),
    threatReward: params.boss ? 0 : (THREAT_REWARD[difficulty] || 20),
    winsCampaign: !!params.boss,
    seed,
  };

  const report = {
    seed,
    difficulty,
    boss: !!params.boss,
    width,
    budget,
    spent: verdict.spent,
    legal: verdict.legal,
    enemyCount: enemies.length,
    perchCount: perches.length,
    droppedPerches,
    maxRise: Math.round(env.maxRise),
    traversable: true, // continuous ground → always
  };

  return { level, mission, report };
}

// ---- geometry helpers -----------------------------------------------------

// Place additive perches on a spaced grid, each within the jump envelope so it's
// reachable straight up from the ground. Returns kept perches + a dropped count
// (perches whose drawn height exceeded maxRise and couldn't be lowered enough).
function layPerches(rng, env, width, exitX) {
  const perches = [];
  let dropped = 0;
  const start = SPAWN_SAFE;
  const end = exitX - 160;
  const span = end - start;
  if (span < 260) return { perches, droppedPerches: 0 };

  const slots = Math.max(2, Math.min(9, Math.floor(span / 380)));
  const slotW = span / slots;
  const ceil = Math.min(env.maxRise - 8, 122); // keep a buffer under absolute max

  for (let i = 0; i < slots; i++) {
    if (rng() < 0.25) continue; // some slots stay empty for rhythm
    const w = snap(int(rng, 120, 240), 10);
    const slotStart = start + i * slotW;
    const x = snap(range(rng, slotStart + 10, slotStart + Math.max(12, slotW - w - 10)), 10);
    let rise = int(rng, 60, ceil); // px above the ground top
    if (rise > env.maxRise) { rise = Math.floor(env.maxRise - 8); dropped++; }
    if (!env.perchReachable(rise)) { dropped++; continue; }
    perches.push({ x, y: GROUND_TOP - rise, w, h: PERCH_H });
  }
  return { perches, droppedPerches: dropped };
}

// Candidate stand points: the top of each perch, plus a spaced set of ground
// points across the playable span (outside the spawn safe zone, up to the exit).
function buildAnchors(rng, perches, width, exitX) {
  const anchors = [];
  for (const p of perches) anchors.push({ x: p.x + p.w / 2, surfaceY: p.y, kind: "perch" });

  const start = SPAWN_SAFE;
  const end = exitX - 40;
  for (let x = start; x <= end; x += int(rng, 200, 300)) {
    anchors.push({ x: snap(x, 10), surfaceY: GROUND_TOP, kind: "ground" });
  }
  return shuffle(rng, anchors);
}

// Greedy budget fill. Walk shuffled anchors; at each, place a roster enemy that
// fits the remaining budget and suits the anchor (ranged enemies prefer perches).
// Enforce a minimum horizontal gap so enemies don't stack. Guarantees >= 1 enemy.
function fillEnemies(rng, roster, anchors, budget, boss) {
  const placed = [];
  let remaining = budget;
  const usedX = [];

  const cheapest = Math.min(...roster.map((d) => enemyThreat(d))) || 1;

  // Boss framing: force the single toughest roster enemy near the exit end first.
  if (boss && roster.length) {
    const tough = roster.slice().sort((a, b) => enemyThreat(b) - enemyThreat(a))[0];
    const groundAnchors = anchors.filter((a) => a.kind === "ground").sort((a, b) => b.x - a.x);
    const spot = groundAnchors[0];
    if (spot) {
      placed.push({ def: tough, x: spot.x, surfaceY: spot.surfaceY });
      usedX.push(spot.x);
      remaining -= enemyThreat(tough);
    }
  }

  for (const a of anchors) {
    if (remaining < cheapest) break;
    if (usedX.some((x) => Math.abs(x - a.x) < MIN_ENEMY_GAP)) continue;

    const ranged = a.kind === "perch";
    const affordable = roster.filter((d) => enemyThreat(d) <= remaining);
    if (!affordable.length) continue;

    // On a perch, prefer a ranged enemy (shooter/turret) if any fit; else any.
    let pool = affordable;
    if (ranged) {
      const r = affordable.filter((d) => d.behavior === "shooter" || d.behavior === "turret");
      if (r.length) pool = r;
    } else {
      // On the ground, lean toward mobile threats but don't require it.
      const m = affordable.filter((d) => d.behavior === "charger" || (d.speed || 0) > 0);
      if (m.length && rng() < 0.7) pool = m;
    }

    const def = pick(rng, pool);
    placed.push({ def, x: a.x, surfaceY: a.surfaceY });
    usedX.push(a.x);
    remaining -= enemyThreat(def);
  }

  // Guarantee at least one enemy (the cheapest that fits the full budget).
  if (!placed.length) {
    const def = roster.slice().sort((a, b) => enemyThreat(a) - enemyThreat(b))[0];
    const a = anchors.find((an) => an.kind === "ground") || anchors[0];
    if (def && a) placed.push({ def, x: a.x, surfaceY: a.surfaceY });
  }
  return placed;
}

// ---- theming --------------------------------------------------------------

function pickBiome(rng, difficulty) {
  // Bias hive/ruins toward higher difficulty, ridge/depot toward lower — soft.
  const hard = difficulty === "high" || difficulty === "extreme";
  const pref = hard ? ["hive", "ruins", "depot"] : ["ridge", "depot", "ruins"];
  const id = pick(rng, pref);
  return BIOMES.find((b) => b.id === id) || BIOMES[0];
}

function writeBrief(biome, site, difficulty, boss) {
  if (boss)
    return `Voss: "This is the one, Commander. ${site} — the signal traces back here. Punch through and end it. Everything we have, on this."`;
  const lines = {
    Recon: `Voss: "Eyes on ${site}. Confirm what they're building and pull what tech you can. Watch your spacing."`,
    Raid: `Voss: "Hit ${site} fast, grab the payload, get your people out. Expect resistance."`,
    Assault: `Voss: "${site} is dug in hard. Break their line and take the objective. No half measures."`,
    Sweep: `Voss: "Sweep ${site}. Someone left something behind worth dying over — find it first."`,
  };
  return lines[biome.verb] || `Voss: "Move on ${site}, Commander. Bring them home."`;
}

// Re-export for callers/editor.
export { DIFFICULTY };
