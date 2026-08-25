// ---------------------------------------------------------------------------
// BUILT-IN MISSION ENEMIES (EnemySpec) — the production enemy roster that the
// level generator places into missions. These replaced the legacy flat
// charger/shooter/turret archetypes (src/mission/ai.js) once EnemySpec was wired
// into gameplay: every mission enemy is now a spec-driven entity with a real
// utility/tracks brain, perception, and (for fliers/bosses) composed parts.
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
// THE MERGE (tech/enemy-designer.md, E4) lives here, and only here. This module
// imports rosterspecs.js — the store of enemies admitted from the Enemy
// Designer — and nothing imports back, so the store stays ignorant of what a
// built-in is. missionRoster() filters the built-ins by their enable flag and
// appends the enabled custom descriptors; applyEnemyRoster() installs their
// normalized specs into missionSpecById so loadMission can resolve a placement.
//
// THE ROSTER IS NEVER EMPTY. Disabling the last enabled entry is refused, and a
// store that somehow resolves to nothing falls back to the built-ins: with an
// empty roster fillEnemies computes Math.min(...[]) → Infinity, its
// guarantee-one-enemy fallback finds no descriptor, and the mission generates
// with zero enemies. No throw, no error, just an empty level.
// ---------------------------------------------------------------------------

import { normalizeSpec } from "./enemyspec/normalize.js";
import { listRosterSpecs, disabledIds, isRosterEnabled, setRosterEnabled } from "./rosterspecs.js";

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

// Placement hint per spec: "shooter" prefers perches + (if flying) spawns
// airborne; "charger" prefers the ground and pressures with contact.
const BEHAVIOR = {
  husk_charger: "charger",
  lurk_gunner: "shooter",
  spore_wisp: "shooter",
  strafe_raider: "shooter",
  cowardly_duelist: "charger",
  sky_duelist: "shooter",
  iron_moth: "shooter",
};

// The normal (non-boss) generation roster and the boss, as raw authored specs.
export const MISSION_ENEMY_SPECS = [
  HUSK_CHARGER, LURK_GUNNER, SPORE_WISP, STRAFE_RAIDER, COWARD_DUELIST, SKY_DUELIST,
];
export const MISSION_BOSS_SPEC = IRON_MOTH;

// The ids nothing else may claim. customcontent.js takes this as the library's
// reserved set so a saved "Husk Charger" cannot slug to `husk_charger` and
// shadow the built-in once the maps merge.
export const BUILTIN_SPEC_IDS = [...MISSION_ENEMY_SPECS, MISSION_BOSS_SPEC].map((s) => s.id);

// Normalized-by-id, for the loader (loadMission) — includes the boss, and
// (after applyEnemyRoster) every enabled custom enemy. Mutated in place, never
// replaced: entities.js holds this exact reference.
export const missionSpecById = Object.fromEntries(
  [...MISSION_ENEMY_SPECS, MISSION_BOSS_SPEC].map((s) => [s.id, normalizeSpec(s)])
);

// True when a normalized spec's body floats (spawned airborne, not feet-down).
export function specIsFlying(nspec) {
  return nspec && nspec.root && nspec.root.body && nspec.root.body.gravity === 0;
}

// A custom enemy's placement hint, derived from its role (approximation 6 —
// the derivation is lossy, and the built-ins prove role does not determine it:
// cowardly_duelist and sky_duelist are both `elite` and get different hints).
// BEHAVIOR stays the authority for the seven built-ins.
const ROLE_BEHAVIOR = {
  fodder: "charger", charger: "charger", tank: "charger", elite: "charger",
  skirmisher: "shooter", artillery: "shooter", support: "shooter", boss: "shooter",
};

// A generator roster descriptor: the flat fields fillEnemies + enemyThreat read.
function descriptorFor(spec) {
  const n = missionSpecById[spec.id] || installSpec(spec);
  const motion = (n.root && n.root.motion) || {};
  const speed = motion.speed ?? motion.driftSpeed ?? 100;
  return {
    id: spec.id,
    name: spec.name || spec.id,
    w: n.root.body.w,
    h: n.root.body.h,
    speed,
    behavior: BEHAVIOR[spec.id] || ROLE_BEHAVIOR[spec.role] || "shooter",
    threat: spec.threat ?? 50,
    isSpec: true,
  };
}

// ---- the roster merge -----------------------------------------------------

// Normalize a custom spec into missionSpecById. Called eagerly by
// applyEnemyRoster() and lazily by descriptorFor(), so a roster read can never
// outrun the map the loader resolves through.
function installSpec(spec) {
  try {
    missionSpecById[spec.id] = normalizeSpec(spec);
  } catch {
    // Fallback discipline: a stored spec that will not normalize (an older
    // schema, a hand-edited store) drops out of the roster instead of taking
    // the generator down with it.
    return null;
  }
  return missionSpecById[spec.id];
}

/**
 * Install every ENABLED custom enemy into missionSpecById.
 *
 * Called explicitly (not as an import side effect) from BOTH pages, mirroring
 * applyWeaponOverrides(): the game's createState() and the editor's boot. The
 * editor needs its own call because the Level Generator previews placements
 * without ever building a state. Idempotent.
 *
 * @returns {string[]} the ids installed
 */
export function applyEnemyRoster() {
  const off = disabledIds();
  const ids = [];
  for (const spec of listRosterSpecs()) {
    if (off.has(spec.id)) continue;
    if (installSpec(spec)) ids.push(spec.id);
  }
  return ids;
}

/** Every custom enemy's spec that is currently switched on. */
function enabledCustomSpecs() {
  const off = disabledIds();
  return listRosterSpecs().filter((s) => !off.has(s.id) && installSpec(s));
}

// Roster the generator places against. { boss:true } appends the boss so a boss
// lead's "toughest roster enemy" framing selects it — and a custom enemy whose
// role is `boss` is treated the same way, so a 320-threat monster cannot wander
// into a recon mission.
export function missionRoster({ boss = false } = {}) {
  const off = disabledIds();
  const builtins = MISSION_ENEMY_SPECS.filter((s) => !off.has(s.id));
  const custom = enabledCustomSpecs();
  const normal = [...builtins, ...custom.filter((s) => s.role !== "boss")];
  const bosses = [MISSION_BOSS_SPEC, ...custom.filter((s) => s.role === "boss")]
    .filter((s) => !off.has(s.id));

  const specs = boss ? [...normal, ...(bosses.length ? bosses : [MISSION_BOSS_SPEC])] : normal;
  // Never empty: an all-disabled store would generate missions with zero
  // enemies rather than failing loudly, which is the exact failure fallback
  // discipline exists to prevent.
  if (!specs.length) return MISSION_ENEMY_SPECS.map(descriptorFor);
  return specs.map(descriptorFor);
}

/**
 * Every roster entry, built-in and custom, for the Designer's enable list.
 * @returns {Array<{id, name, role, threat, source:"built-in"|"custom", enabled, boss:boolean}>}
 */
export function rosterEntries() {
  const off = disabledIds();
  const row = (s, source) => ({
    id: s.id, name: s.name || s.id, role: s.role || "?", threat: s.threat ?? 50,
    source, enabled: !off.has(s.id), boss: s.role === "boss",
  });
  return [
    ...MISSION_ENEMY_SPECS.map((s) => row(s, "built-in")),
    row(MISSION_BOSS_SPEC, "built-in"),
    ...listRosterSpecs().map((s) => row(s, "custom")),
  ];
}

/**
 * Flip one entry on or off. Turning the LAST enabled non-boss entry off is
 * refused: the generator places against that list, and an empty one produces a
 * mission with no enemies in it.
 * @returns {{ok:true, id, enabled} | {ok:false, error:string}}
 */
export function setEnemyEnabled(id, on) {
  if (!on) {
    const left = rosterEntries().filter((e) => e.enabled && !e.boss && e.id !== id);
    if (!left.length) return { ok: false, error: "the roster cannot be empty — enable another enemy first" };
  }
  setRosterEnabled(id, !!on);
  return { ok: true, id, enabled: isRosterEnabled(id) };
}
