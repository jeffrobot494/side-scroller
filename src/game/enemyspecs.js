// ---------------------------------------------------------------------------
// THE ENEMY LIST — every enemy this build ships, as records the generator and
// the loader both read. These replaced the legacy flat charger/shooter/turret
// archetypes (src/mission/ai.js) once EnemySpec was wired into gameplay: every
// mission enemy is a spec-driven entity with a real utility/tracks brain,
// perception, and (for fliers/bosses) composed parts.
//
// There is NO built-in/custom split (tech/enemy-designer.md, E6). This file is
// one end of one list; src/game/enemystore.js holds what a browser has changed
// about it — edits by id, tombstones, additions and the in-missions switch —
// and mergeEnemies() folds the two in one pass: file → drop tombstones →
// replace edits → append additions → overlay flags. A clean browser merges to
// exactly this file, which is what keeps the golden level file frozen.
//
// A RECORD is { spec, behavior, inMissions }. `behavior` is the generator's
// placement hint and is NOT part of the EnemySpec schema — it sits beside the
// spec so every entry can carry an authored one without the format growing a
// key. `inMissions` is whether the generator may place it.
//
// Kept DELIBERATELY separate from src/game/enemyspec/templates.js — those are
// authoring fixtures + LLM few-shots + test fixtures; these are balance-tuned
// production content. Editing one must never silently rebalance the other.
//
// The generator consumes lightweight ROSTER DESCRIPTORS (missionRoster()) that
// expose exactly the flat fields fillEnemies + enemyThreat read (id/w/h/speed/
// behavior/threat); loadMission resolves a placed `type` back to the normalized
// spec via missionSpecById and instantiate()s the real runtime tree.
//
// THE ROSTER IS NEVER EMPTY. Switching off or deleting the last placeable entry
// is refused, and a merge that resolves to nothing falls back to this file: with
// an empty roster fillEnemies computes Math.min(...[]) → Infinity, its
// guarantee-one-enemy fallback finds no descriptor, and the mission generates
// with zero enemies. No throw, no error, just an empty level.
// ---------------------------------------------------------------------------

import { normalizeSpec } from "./enemyspec/normalize.js";
import { accept } from "./enemyspec/generate.js";
import {
  mergeEnemies, saveEnemy, removeEnemy, setInMissions, makeRecord,
  revertEnemy as revert, clearEnemyDeltas,
} from "./enemystore.js";

// Authored (sparse) specs. normalizeSpec fills every default at load. `behavior`
// is NOT part of the spec schema — it's a generator placement hint (below).
const HUSK_CHARGER = {
  v: 1, id: "husk_charger", name: "Husk Charger", threat: 50, role: "charger", tier: 1, intelligence: 1,
  root: {
    id: "root", tags: ["enemy"],
    visual: { shape: "diamond", size: [30, 26], color: "#e05a5a" },
    health: { max: 24 },
    motion: { type: "chase", speed: 210 },
    contact: { damage: 10 },
  },
};

const LURK_GUNNER = {
  v: 1, id: "lurk_gunner", name: "Lurk Gunner", threat: 70, role: "artillery", tier: 1, intelligence: 2,
  root: {
    id: "root", tags: ["enemy"],
    visual: { shape: "box", size: [34, 46], color: "#c261e0" },
    health: { max: 46 },
    motion: { type: "keepDistance", min: 260, max: 420, speed: 140 },
    emitters: { gun: { at: [0, -6], projectile: { speed: 460, w: 14, h: 14, color: "#8affc1", life: 2.2, damage: 14, shape: "orb" } } },
  },
  brain: {
    start: "fight",
    states: {
      fight: {
        tracks: [{ id: "shoot", loop: true, steps: [
          { telegraph: { time: 0.5 } },
          { fire: { emitter: "gun", pattern: "aimed" } },
          { wait: 1.4 },
        ] }],
      },
    },
  },
};

const SPORE_WISP = {
  v: 1, id: "spore_wisp", name: "Spore Wisp", threat: 65, role: "skirmisher", tier: 1, intelligence: 2,
  // A drifting sac lobbing spores — lighter than the ground troops, and a soft
  // hiss rather than the generic enemy report.
  sounds: { fire: { cue: "weapon.fire.wave", gain: 0.8 }, hurt: { gain: 0.75 }, death: { gain: 0.8 } },
  root: {
    id: "root", tags: ["enemy", "flying"],
    visual: { shape: "ellipse", size: [36, 24], color: "#5ac8e0" },
    health: { max: 30 },
    motion: { type: "hover", amplitude: 16, rate: 2.2, driftSpeed: 60 },
    emitters: { pods: { at: [0, 10], projectile: { speed: 300, w: 8, h: 8, color: "#bff29a", life: 3, damage: 8, gravity: 0.4, shape: "pellet" } } },
  },
  brain: {
    start: "drift",
    states: {
      drift: {
        tracks: [{ id: "rain", loop: true, steps: [
          { telegraph: { time: 0.4 } },
          { fire: { emitter: "pods", pattern: "fan", count: 3, spreadDeg: 50, aim: "current" } },
          { wait: { range: [1.6, 2.4] } },
        ] }],
      },
    },
  },
};

const STRAFE_RAIDER = {
  v: 1, id: "strafe_raider", name: "Strafe Raider", threat: 85, role: "skirmisher", tier: 2, intelligence: 2,
  sounds: { hurt: { gain: 0.8 }, death: { gain: 0.85 } },
  root: {
    id: "root", tags: ["enemy", "flying"],
    visual: { shape: "diamond", size: [34, 20], color: "#e0975a" },
    body: { gravity: 0 },
    health: { max: 36 },
    motion: { type: "static" },
    emitters: { gun: { at: [0, 8], projectile: { speed: 540, w: 10, h: 5, color: "#ffcf5c", life: 1.6, damage: 8, shape: "bullet" } } },
  },
  brain: {
    start: "racetrack",
    states: {
      racetrack: {
        tracks: [{ id: "pass", loop: true, steps: [
          { moveTo: { target: "player", offset: [-240, -150], speed: 300, timeout: 2.5 } },
          { telegraph: { time: 0.45 } },
          { fire: { emitter: "gun", pattern: "aimed" } },
          { dash: { target: "player", offset: [260, -10], speed: 480, duration: 0.55 } },
          { fire: { emitter: "gun", pattern: "aimed" } },
          { wait: { range: [0.6, 1.1] } },
        ] }],
      },
    },
  },
};

const COWARD_DUELIST = {
  v: 1, id: "cowardly_duelist", name: "Cowardly Duelist", threat: 110, role: "elite", tier: 2, intelligence: 4,
  sounds: { hurt: { gain: 1.1 }, death: { gain: 1.25 } },
  root: {
    id: "root", tags: ["enemy"],
    visual: { shape: "box", size: [26, 44], color: "#e0b95a" },
    health: { max: 70 },
    motion: { type: "keepDistance", min: 220, max: 380, speed: 190 },
    contact: { damage: 6 },
    emitters: { pistol: { at: [0, -8], projectile: { speed: 640, w: 10, h: 4, color: "#ffe08a", life: 1.4, damage: 9, shape: "bullet" } } },
  },
  brain: {
    mode: "utility", start: "duel",
    states: {
      duel: {
        decisionInterval: 0.3,
        actions: [
          { id: "snipe", when: "sense.los && sense.dist < 560", score: "1.2 + 1.5 * (sense.dist > 260)", windup: 0.35, steps: [{ fire: { emitter: "pistol", pattern: "aimed", aim: "lead" } }], recovery: 0.25, cooldown: 1.1 },
          { id: "backHop", when: "sense.dist < 150", score: "2.5 + 2 * sense.playerApproaching", steps: [{ dash: { away: true, speed: 340, duration: 0.3 } }, { jump: {} }], recovery: 0.3, cooldown: 1.6 },
          { id: "lunge", when: "sense.dist < 240 && self.hpPct > 0.35", score: "0.8 + 1.4 * (sense.timeSinceSeen < 0.2)", windup: 0.55, steps: [{ dash: { target: "player", speed: 520, duration: 0.45 } }], recovery: 0.8, cooldown: 4 },
          { id: "hold", score: 0.5, steps: [{ wait: 0.3 }] },
        ],
      },
    },
  },
};

const SKY_DUELIST = {
  v: 1, id: "sky_duelist", name: "Sky Duelist", threat: 120, role: "elite", tier: 2, intelligence: 4,
  sounds: { hurt: { gain: 1.1 }, death: { gain: 1.25 } },
  root: {
    id: "root", tags: ["enemy", "flying"],
    visual: { shape: "ellipse", size: [40, 26], color: "#5ad0b8" },
    health: { max: 60 },
    motion: { type: "hover", amplitude: 10, rate: 2, driftSpeed: 30, altitude: 170 },
    emitters: { gun: { at: [0, 6], projectile: { speed: 600, w: 10, h: 5, color: "#8affc1", life: 1.6, damage: 9, shape: "bolt" } } },
  },
  brain: {
    mode: "utility", start: "sky",
    states: {
      sky: {
        decisionInterval: 0.25,
        actions: [
          { id: "strafeRun", when: "sense.los && sense.dist > 180 && sense.dist < 520", score: "1.5 + 1.2 * (sense.dist < 380)", windup: 0.4, steps: [{ dash: { target: "player", offset: [240, 0], speed: 500, duration: 0.55 } }, { fire: { emitter: "gun", pattern: "aimed", aim: "lead" } }], recovery: 0.5, cooldown: 2.2 },
          { id: "hoverSnipe", when: "sense.los && sense.dist >= 520", score: 1.2, windup: 0.3, steps: [{ fire: { emitter: "gun", pattern: "aimed", aim: "lead" } }], recovery: 0.2, cooldown: 1 },
          { id: "peelOff", when: "sense.los && sense.dist <= 180", score: 1.6, steps: [{ moveTo: { target: "player", offset: [-300, -170], speed: 420, timeout: 1.4 } }], recovery: 0.2, cooldown: 1 },
          { id: "climbAway", when: "self.hpPct < 0.45 || (sense.playerApproaching && sense.dist < 220)", score: "2.2 + 2 * sense.playerApproaching", steps: [{ moveTo: { target: "player", offset: [-320, -190], speed: 380, timeout: 1.6 } }], recovery: 0.2, cooldown: 1.8 },
          { id: "hunt", when: "!sense.los && sense.timeSinceSeen > 1", score: 1.8, steps: [{ moveTo: { target: "lastSeen", speed: 300, timeout: 2 } }], cooldown: 1.5 },
          { id: "drift", score: 0.4, steps: [{ wait: 0.35 }] },
        ],
      },
    },
  },
};

// Boss: multi-part Iron Moth — destructible wings launch shootable homing
// seekers; losing both wings grounds it into a new phase. Placed only on boss
// leads (state.js passes { boss:true }).
const IRON_MOTH = {
  v: 1, id: "iron_moth", name: "Iron Moth", threat: 320, role: "boss", tier: 3, intelligence: 2,
  limits: { maxAlive: 24, maxSpawnsPerSecond: 10, maxSpawnDepth: 3 },
  vars: { rage: 0 },
  defs: {
    shard: { tags: ["projectile"], visual: { shape: "diamond", size: [8, 8], color: "#ffb15a" }, body: { gravity: 0 }, life: { ttl: 1.1 }, contact: { damage: 4, destroySelf: true } },
    seeker: {
      tags: ["projectile", "shootable"], visual: { shape: "circle", size: [16, 16], color: "#ff7a5a" }, health: { max: 4 }, life: { ttl: 7 },
      motion: { type: "home", speed: 190, turnRate: 2.6 }, contact: { damage: 9, destroySelf: true },
      on: { destroy: [{ spawn: { ref: "shard", count: 5, pattern: "ring", speed: 180 } }, { signal: "seekerDown" }] },
    },
  },
  root: {
    id: "core", tags: ["enemy", "boss"],
    visual: { shape: "ellipse", size: [96, 44], color: "#8a6ae0" },
    health: { max: 320 },
    motion: { type: "hover", amplitude: 12, rate: 1.6, driftSpeed: 34 },
    emitters: { maw: { at: [0, 14], projectile: { speed: 380, w: 12, h: 12, color: "#d98cff", life: 2.5, damage: 12, shape: "orb" } } },
    children: [
      { id: "leftWing", tags: ["wing"], at: [-62, -4], visual: { shape: "diamond", size: [58, 26], color: "#b49aff" }, health: { max: 60 }, link: { onParentDeath: "destroy", onOwnDeath: "destroy" }, emitters: { missiles: { at: [-12, 0], ref: "seeker" } }, on: { destroy: [{ signal: "wingDestroyed" }, { add: { target: "root.vars.rage", value: 1 } }] } },
      { id: "rightWing", tags: ["wing"], at: [62, -4], visual: { shape: "diamond", size: [58, 26], color: "#b49aff" }, health: { max: 60 }, link: { onParentDeath: "destroy", onOwnDeath: "destroy" }, emitters: { missiles: { at: [12, 0], ref: "seeker" } }, on: { destroy: [{ signal: "wingDestroyed" }, { add: { target: "root.vars.rage", value: 1 } }] } },
    ],
  },
  brain: {
    start: "phase1",
    states: {
      phase1: {
        tracks: [
          { id: "leftVolley", loop: true, steps: [ { telegraph: { part: "leftWing", time: 0.5 } }, { if: { when: "alive('leftWing')", then: [{ fire: { emitter: "leftWing.missiles", pattern: "aimed" } }] } }, { wait: 2.2 } ] },
          { id: "rightVolley", loop: true, steps: [ { wait: 1.1 }, { telegraph: { part: "rightWing", time: 0.5 } }, { if: { when: "alive('rightWing')", then: [{ fire: { emitter: "rightWing.missiles", pattern: "aimed" } }] } }, { wait: 1.1 } ] },
        ],
        transitions: [ { when: "countAlive('tag:wing') == 0", to: "grounded" }, { when: "self.hpPct <= 0.4", to: "fury" } ],
      },
      fury: {
        enter: [{ set: { target: "root.vars.rage", value: 3 } }],
        tracks: [{ id: "spray", loop: true, steps: [ { telegraph: { time: 0.6 } }, { fire: { emitter: "maw", pattern: "ring", count: 8 } }, { wait: 1.5 } ] }],
        transitions: [{ when: "countAlive('tag:wing') == 0", to: "grounded" }],
      },
      grounded: {
        enter: [{ setMotion: { target: "root", type: "gravity" } }],
        tracks: [{ id: "groundBurst", loop: true, steps: [ { telegraph: { time: 0.8 } }, { fire: { emitter: "maw", pattern: "fan", count: 5, spreadDeg: 80 } }, { wait: 2 } ] }],
      },
    },
  },
};


// ---- the file's end of the list -------------------------------------------
// `behavior` is the generator's placement hint: "shooter" prefers perches +
// (if flying) spawns airborne; "charger" prefers the ground and pressures with
// contact; "turret" is stationary. Authored per enemy — nothing derives it.
const rec = (spec, behavior) => ({ spec, behavior, inMissions: true });

export const ENEMY_FILE = [
  rec(HUSK_CHARGER, "charger"),
  rec(LURK_GUNNER, "shooter"),
  rec(SPORE_WISP, "shooter"),
  rec(STRAFE_RAIDER, "shooter"),
  rec(COWARD_DUELIST, "charger"),
  rec(SKY_DUELIST, "shooter"),
  rec(IRON_MOTH, "shooter"),
];

const FILE_NORMAL = ENEMY_FILE.filter((r) => r.spec.role !== "boss");
const FILE_BOSSES = ENEMY_FILE.filter((r) => r.spec.role === "boss");

// The file's specs, unwrapped. These are FIXTURES as much as content —
// test/audio.test.mjs and test/locomotion-characterization.test.mjs read them
// to assert that every shipped enemy validates, sounds and moves. They read the
// FILE, never the merge: a fixture that changes when the browser does is not a
// fixture.
export const MISSION_ENEMY_SPECS = FILE_NORMAL.map((r) => r.spec);
export const MISSION_BOSS_SPEC = IRON_MOTH;

// Normalized-by-id, for the loader (loadMission). Mutated in place, never
// replaced: entities.js holds this exact reference. Kept in step with the merge
// eagerly by applyEnemyRoster() and lazily by missionRoster().
export const missionSpecById = Object.fromEntries(
  ENEMY_FILE.map((r) => [r.spec.id, normalizeSpec(r.spec)])
);

// Which spec object each entry in missionSpecById was normalized FROM, so a
// merge that returns the same objects (the common case — a clean store) does
// not re-normalize the whole list on every generateLevel call.
const installedFrom = Object.fromEntries(ENEMY_FILE.map((r) => [r.spec.id, r.spec]));

// The dry run an enemy must survive to be placed in missions (E6a). Longer than
// the Designer's 4-second Save gate: a mission is a harsher place than the
// editor, and a spec that only misbehaves after its first cooldown cycle should
// not reach one. Longer, not more realistic — approximation 5.
export const MISSION_DRYRUN_SECONDS = 12;

// True when a normalized spec's body floats (spawned airborne, not feet-down).
export function specIsFlying(nspec) {
  return nspec && nspec.root && nspec.root.body && nspec.root.body.gravity === 0;
}

// ---- the merged list ------------------------------------------------------

/**
 * Every enemy this browser has, file and local alike, in list order.
 * @returns {Array<{spec, behavior, inMissions, origin:"file"|"edited"|"added"}>}
 */
export function enemyList() {
  return mergeEnemies(ENEMY_FILE);
}

/** One row per enemy, flat, for the editor's lists. */
export function enemyEntries() {
  return enemyList().map((r) => ({
    id: r.spec.id,
    name: r.spec.name || r.spec.id,
    role: r.spec.role || "?",
    threat: r.spec.threat ?? 50,
    behavior: r.behavior,
    inMissions: r.inMissions,
    origin: r.origin,
    boss: r.spec.role === "boss",
  }));
}

export function enemyRecord(id) {
  return enemyList().find((r) => r.spec.id === id) || null;
}

// Normalize a spec into missionSpecById, reusing the last result when the spec
// object has not changed. A spec that will NOT normalize (an older schema, a
// hand-edited store) drops out of the roster instead of taking the generator
// down with it — fallback discipline.
function installSpec(spec) {
  if (installedFrom[spec.id] === spec && missionSpecById[spec.id]) return missionSpecById[spec.id];
  try {
    missionSpecById[spec.id] = normalizeSpec(spec);
    installedFrom[spec.id] = spec;
  } catch {
    return null;
  }
  return missionSpecById[spec.id];
}

// Drop anything the loader can no longer be asked for — a tombstoned file
// entry, an enemy switched out of missions.
function prune(records) {
  const keep = new Set(records.map((r) => r.spec.id));
  for (const id of Object.keys(missionSpecById)) {
    if (keep.has(id)) continue;
    delete missionSpecById[id];
    delete installedFrom[id];
  }
  return keep;
}

// What the generator may place, split by slot, with both never-empty floors
// applied. Installing here is what keeps missionSpecById in step with the merge
// without a second pass over the list.
function placeableRecords() {
  const live = enemyList().filter((r) => r.inMissions && installSpec(r.spec));
  let normal = live.filter((r) => r.spec.role !== "boss");
  let bosses = live.filter((r) => r.spec.role === "boss");
  if (!normal.length) normal = FILE_NORMAL.filter((r) => installSpec(r.spec));
  if (!bosses.length) bosses = FILE_BOSSES.filter((r) => installSpec(r.spec));
  prune([...normal, ...bosses]);
  return { normal, bosses };
}

// A generator roster descriptor: the flat fields fillEnemies + enemyThreat read.
function descriptorFor(r) {
  const n = missionSpecById[r.spec.id];
  const motion = (n.root && n.root.motion) || {};
  return {
    id: r.spec.id,
    name: r.spec.name || r.spec.id,
    w: n.root.body.w,
    h: n.root.body.h,
    speed: motion.speed ?? motion.driftSpeed ?? 100,
    behavior: r.behavior,
    threat: r.spec.threat ?? 50,
    isSpec: true,
  };
}

/**
 * The roster the generator places against. `{ boss:true }` appends the boss
 * slot so a boss lead's "toughest roster enemy" framing selects it — and
 * `role:"boss"` is what keeps an entry OUT of an ordinary mission, whether the
 * file ships it or this browser wrote it.
 */
export function missionRoster({ boss = false } = {}) {
  const { normal, bosses } = placeableRecords();
  return (boss ? [...normal, ...bosses] : normal).map(descriptorFor);
}

/**
 * Bring missionSpecById in line with the merge.
 *
 * Called explicitly (not as an import side effect) from BOTH pages, mirroring
 * applyWeaponOverrides(): the game's createState() and the editor's boot. The
 * editor needs its own call because the Level Generator previews placements
 * without ever building a state. Idempotent.
 *
 * @returns {string[]} the ids the loader can now resolve
 */
export function applyEnemyRoster() {
  const { normal, bosses } = placeableRecords();
  return [...normal, ...bosses].map((r) => r.spec.id);
}

/**
 * The spec loadMission falls back to when a placement names something this
 * browser no longer has. The cheapest placeable enemy, because a level that
 * lost an enemy should not gain a harder one (approximation 5).
 */
export function cheapestMissionSpec() {
  const { normal } = placeableRecords();
  let best = null;
  for (const r of normal) {
    const n = missionSpecById[r.spec.id];
    if (n && (!best || (n.threat ?? 50) < (best.threat ?? 50))) best = n;
  }
  return best || normalizeSpec(ENEMY_FILE[0].spec);
}

// ---- writes ---------------------------------------------------------------
// The list's rules live here, on the file's side of the one-way import: the
// store takes raw writes and knows nothing about bosses or emptiness.

// Why an entry cannot leave the mission roster, or "" if it can.
function wouldStrand(list, rec) {
  const others = list.filter((r) => r.inMissions && r.spec.id !== rec.spec.id);
  if (rec.spec.role === "boss") {
    if (!others.some((r) => r.spec.role === "boss")) {
      return "this is the last boss — the finale needs one";
    }
    return "";
  }
  if (!others.some((r) => r.spec.role !== "boss")) {
    return "the roster cannot be empty — put another enemy in missions first";
  }
  return "";
}

/**
 * Write an enemy into this browser's list — an edit if the file ships that id,
 * an addition if it does not. A NEW enemy arrives out of missions: the switch,
 * not Save, is the mission gate.
 * @returns {{ok:true, id, added:boolean} | {ok:false, error:string}}
 */
export function saveEnemyToList(spec, { behavior, inMissions } = {}) {
  if (!spec || typeof spec.id !== "string" || !spec.id) return { ok: false, error: "an enemy needs an id" };
  const existing = enemyRecord(spec.id);
  const res = saveEnemy(makeRecord(spec, {
    behavior: behavior ?? (existing ? existing.behavior : undefined),
    inMissions: inMissions ?? (existing ? existing.inMissions : false),
  }));
  if (!res.ok) return res;
  applyEnemyRoster();
  return { ok: true, id: res.id, added: !existing };
}

/** Drop an enemy from this browser's list. Refused if it would strand a slot. */
export function deleteEnemy(id) {
  const list = enemyList();
  const rec = list.find((r) => r.spec.id === id);
  if (!rec) return { ok: false, error: `no enemy called '${id}'` };
  if (rec.inMissions) {
    const err = wouldStrand(list, rec);
    if (err) return { ok: false, error: err };
  } else if (rec.spec.role === "boss" && !list.some((r) => r.spec.role === "boss" && r.spec.id !== id)) {
    return { ok: false, error: "this is the last boss — the finale needs one" };
  }
  removeEnemy(id);
  applyEnemyRoster();
  return { ok: true, id };
}

/**
 * Flip one enemy in or out of generated missions.
 *
 * Turning it ON re-runs the acceptance pipeline at mission length (E6a) — this
 * is the only gate between an enemy and a real mission. Turning it OFF is
 * refused when it would leave the generator nothing to place, or the finale no
 * boss.
 * @returns {{ok:true, id, enabled} | {ok:false, error:string, errors?:string[]}}
 */
export function setEnemyEnabled(id, on, { seconds = MISSION_DRYRUN_SECONDS } = {}) {
  const list = enemyList();
  const rec = list.find((r) => r.spec.id === id);
  if (!rec) return { ok: false, error: `no enemy called '${id}'` };
  if (on) {
    const res = accept(rec.spec, { seconds });
    if (!res.ok) return { ok: false, error: res.errors[0], errors: res.errors };
  } else {
    const err = wouldStrand(list, rec);
    if (err) return { ok: false, error: err };
  }
  setInMissions(id, !!on);
  applyEnemyRoster();
  return { ok: true, id, enabled: !!on };
}

/** Drop this browser's edit or tombstone for one id — the file's version wins. */
export function revertEnemy(id) {
  const res = revert(id);
  applyEnemyRoster();
  return res;
}

/** Undo everything this browser did to the list. */
export function resetEnemyList() {
  clearEnemyDeltas();
  applyEnemyRoster();
}

export { PLACEMENTS, seedBehavior } from "./enemystore.js";
