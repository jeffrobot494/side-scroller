// ---------------------------------------------------------------------------
// LEVEL GENERATOR (Slice 1) — deterministic, procedural, no LLM.
//
// generateLevel(params) → { level, mission, report }
//   - level:   LEVELS-shaped, drop-in for loadMission()
//   - mission: MISSIONS-shaped meta (name/brief/difficulty/threatReward/…)
//   - report:  facts for the editor's Level Generator playground (budget spent,
//              enemy count, dropped perches, traversability)
//
// Geometry model: a CONTINUOUS GROUND SLAB spanning the world, so the level is
// always completable — the player can walk (or hop) end to end. On top of it,
// `layTerrain` drops varied structures (lone perches, solid boxes, staircases,
// zigzag towers, L-shapes) built so every piece is jump-reachable by
// construction: the first piece sits within a single jump of the ground and
// each chained piece within a single jump of the previous one. Enemies are
// drawn from the legal roster onto ground/platform anchors until their summed
// threat fills the difficulty budget. Everything derives from `seed`, so the
// same params always produce the same level (cacheable, reproducible,
// previewable).
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
  short: [4800, 5600],
  medium: [6000, 6800],
  long: [7400, 8200],
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

  const { perches, droppedPerches } = layTerrain(rng, env, width, exit.x);
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
    unreachable: countUnreachable(platforms, env),
    traversable: true, // continuous ground → always
  };

  return { level, mission, report };
}

// ---- geometry helpers -----------------------------------------------------

// Terrain structures. The playable span is cut into slots
// (config.genStructureSpacing px each); most slots (config.genPlatformDensity)
// get one structure of five kinds: a lone perch, a solid ground box, a
// staircase, a zigzag tower, or an L-shape (box + arm + optional floater).
//
// Reachability is guaranteed by construction against the jump envelope:
//  - the first piece of every structure tops out within `hop` (one jump from
//    the ground);
//  - each chained piece rises at most `step` above the piece below it, where
//    step < maxRise leaves horizontal reach to spare (see env.maxRunTo);
//  - config.genMaxTiers caps how many chained jumps a structure may climb.
// Ground traversal also survives every structure: solid boxes are at most
// `hop` tall (hop over them), and thin pieces either top out within `hop`
// (hop over) or sit high enough to walk under.
const MAX_STACK_RISE = 380; // absolute height cap — keeps headroom in the 540px world

function layTerrain(rng, env, width, exitX) {
  const perches = [];
  let dropped = 0;
  const start = SPAWN_SAFE;
  const end = exitX - 160;
  const span = end - start;
  const hop = Math.min(env.maxRise - 8, 122); // single jump up from the ground
  const step = Math.min(env.maxRise - 40, 92); // chained jump, piece to piece
  if (span < 260 || hop < 60) return { perches, droppedPerches: 0 };

  const tiers = Math.max(1, Math.round(config.genMaxTiers ?? 3));
  const density = config.genPlatformDensity ?? 0.8;
  const spacing = config.genStructureSpacing ?? 460;
  const chains = tiers >= 2 && step >= 50; // is there envelope room to stack at all?

  const slots = Math.max(2, Math.min(14, Math.floor(span / spacing)));
  const slotW = span / slots;

  for (let i = 0; i < slots; i++) {
    if (rng() >= density) continue; // open ground for rhythm
    const x0 = snap(start + i * slotW + 10, 10);
    const x1 = snap(start + (i + 1) * slotW - 10, 10);

    const roll = rng();
    let plats;
    if (chains && roll < 0.22) plats = stair(rng, x0, x1, hop, step, tiers);
    else if (chains && roll < 0.42) plats = tower(rng, x0, x1, hop, step, tiers);
    else if (roll < 0.62) plats = lShape(rng, x0, x1, hop, step, chains);
    else if (roll < 0.8) plats = groundBox(rng, x0, x1, hop);
    else plats = perch(rng, x0, x1, hop);

    if (!plats || !plats.length) { dropped++; continue; }
    for (const p of plats) perches.push(p);
  }
  return { perches, droppedPerches: dropped };
}

// One floating platform within a single jump of the ground.
function perch(rng, x0, x1, hop) {
  const w = Math.min(snap(int(rng, 120, 240), 10), x1 - x0);
  if (w < 80) return null;
  const x = snap(range(rng, x0, x1 - w), 10);
  return [{ x, y: GROUND_TOP - int(rng, 60, hop), w, h: PERCH_H }];
}

// A solid block sitting on the ground — cover you hop onto or over.
function groundBox(rng, x0, x1, hop) {
  const w = Math.min(snap(int(rng, 80, 170), 10), x1 - x0);
  if (w < 60) return null;
  const x = snap(range(rng, x0, x1 - w), 10);
  const h = int(rng, 40, Math.max(40, hop - 10));
  return [{ x, y: GROUND_TOP - h, w, h }];
}

// A run of 2–4 thin platforms, each one chained jump above the last, with
// small gaps between them. Built ascending; half the time mirrored so the
// climb faces the other way.
function stair(rng, x0, x1, hop, step, tiers) {
  const count = int(rng, 2, Math.min(4, tiers + 1));
  const plats = [];
  let rise = int(rng, 60, Math.min(hop, 100));
  let x = x0;
  for (let i = 0; i < count; i++) {
    const w = snap(int(rng, 90, 150), 10);
    if (x + w > x1) break;
    plats.push({ x, y: GROUND_TOP - rise, w, h: PERCH_H });
    x += w + int(rng, 10, 40);
    rise = Math.min(rise + int(rng, 50, step), MAX_STACK_RISE);
  }
  if (plats.length < 2) return plats.length ? plats : null;
  if (rng() < 0.5) {
    // mirror in place: same footprint and gaps, descending left→right
    const left = plats[0].x;
    const right = plats[plats.length - 1].x + plats[plats.length - 1].w;
    for (const p of plats) p.x = left + (right - (p.x + p.w));
  }
  return plats;
}

// A zigzag stack: a base perch plus 1–3 layers, each a chained jump up and
// offset sideways so the layer below keeps an exposed ledge to stand on
// (platforms are solid — you can't jump up through them).
function tower(rng, x0, x1, hop, step, tiers) {
  const w0 = snap(int(rng, 140, 190), 10);
  if (x1 - x0 < w0 + 120) return null; // needs room to zigzag
  let x = snap(Math.min(Math.max((x0 + x1) / 2 - w0 / 2, x0), x1 - w0), 10);
  let rise = int(rng, 60, Math.min(hop, 100));
  const plats = [{ x, y: GROUND_TOP - rise, w: w0, h: PERCH_H }];
  // first offset goes toward whichever side of the slot has more room
  let dir = x - x0 > x1 - (x + w0) ? -1 : 1;
  const layers = int(rng, 1, Math.max(1, tiers - 1));
  let px = x;
  for (let i = 0; i < layers; i++) {
    rise = Math.min(rise + int(rng, 55, step), MAX_STACK_RISE);
    const w = snap(int(rng, 110, 160), 10);
    let nx = snap(px + dir * int(rng, 70, 110), 10);
    if (nx < x0) nx = x0;
    if (nx + w > x1) nx = x1 - w;
    plats.push({ x: nx, y: GROUND_TOP - rise, w, h: PERCH_H });
    px = nx;
    dir = -dir;
  }
  return plats;
}

// A solid box with a thin arm off its top — reads as an L. When stacking is
// allowed, sometimes a floater hangs one more chained jump above the arm's
// far end.
function lShape(rng, x0, x1, hop, step, chains) {
  const bw = snap(int(rng, 60, 100), 10);
  const armW = snap(int(rng, 90, 160), 10);
  if (x1 - x0 < bw + armW + 20) return groundBox(rng, x0, x1, hop); // no room for the arm
  const bh = int(rng, 60, Math.max(60, hop - 10));
  const side = rng() < 0.5 ? -1 : 1; // which way the arm points
  const bx = side === 1
    ? snap(range(rng, x0, x1 - bw - armW - 10), 10)
    : snap(range(rng, x0 + armW + 10, x1 - bw), 10);
  const by = GROUND_TOP - bh;
  const arm = side === 1
    ? { x: bx + bw, y: by, w: armW, h: PERCH_H }
    : { x: bx - armW, y: by, w: armW, h: PERCH_H };
  const plats = [{ x: bx, y: by, w: bw, h: bh }, arm];
  if (chains && rng() < 0.55) {
    const fw = snap(int(rng, 90, 130), 10);
    const rise = Math.min(bh + int(rng, 50, step), MAX_STACK_RISE);
    let fx = side === 1 ? arm.x + arm.w - fw : arm.x;
    fx = snap(Math.min(Math.max(fx, x0), x1 - fw), 10);
    plats.push({ x: fx, y: GROUND_TOP - rise, w: fw, h: PERCH_H });
  }
  return plats;
}

// Sanity net over the assembled geometry: fixpoint-walk platform tops from the
// ground slab and count elevated platforms no reachable surface can jump to.
// The builders guarantee 0 by construction; the report (and tests) surface it
// so a regression or hand-tuned physics that breaks a level is visible.
function countUnreachable(platforms, env) {
  const reached = [platforms[0]];
  const todo = platforms.slice(1);
  let grew = true;
  while (grew && todo.length) {
    grew = false;
    for (let i = todo.length - 1; i >= 0; i--) {
      const p = todo[i];
      if (reached.some((q) => canJump(q, p, env))) {
        reached.push(p);
        todo.splice(i, 1);
        grew = true;
      }
    }
  }
  return todo.length;
}

// Can an actor standing on q's top reach p's top? Vertical rise must fit the
// envelope; the horizontal gap between the two spans must fit the reach left
// at that rise (full flat reach when dropping down).
function canJump(q, p, env) {
  const dh = q.y - p.y; // how far p's top sits above q's top
  if (dh > env.maxRise) return false;
  const gap = Math.max(p.x - (q.x + q.w), q.x - (p.x + p.w), 0);
  const reach = dh > 0 ? env.maxRunTo(dh) : env.flatReach;
  return reach >= 0 && gap <= reach;
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
