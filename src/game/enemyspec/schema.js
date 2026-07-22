// ---------------------------------------------------------------------------
// ENEMYSPEC SCHEMA — the closed vocabulary, as data.
//
// One source of truth for what an EnemySpec may contain: component keys, motion
// controllers, actions, fire patterns, events, link policies, roles. The
// validator, the normalizer, the Designer's form UI, and the LLM prompt all
// read THIS module, so the vocabulary can grow in exactly one place. Anything
// not named here does not exist — the LLM composes these primitives freely but
// can never invent new engine behavior (docs/llm_adaptive_enemy_system_plan_v2.md §1).
//
// Shape summary (sparse-authored; normalize.js fills defaults):
//   EnemySpec: { v, id, name, threat, role, tier, limits, vars, defs, root, brain }
//   Entity:    { id, tags, at, visual, body, health, motion, contact, emitters,
//                children, on, vars, life, link }
//   Brain:     { mode: "tracks"|"utility", start, states: { <id>: State } }
//   State:     { enter, tracks, transitions }            (tracks mode)
//              { enter, actions, decisionInterval, transitions } (utility mode)
// ---------------------------------------------------------------------------

export const SPEC_VERSION = 1;

// Top-level EnemySpec keys. threat/role/tier are the explicit placement metadata
// (enemycost.js reads `threat` directly when present). `intelligence` (1–5)
// rates HOW SMART the behavior is — separate from threat, which prices how
// DANGEROUS it is (see the rubric in vocabularyDoc; smarter ≠ harder).
export const SPEC_KEYS = ["v", "id", "name", "threat", "role", "tier", "intelligence", "limits", "vars", "defs", "root", "brain"];

// Tactical roles — used by the Designer, the LLM prompt, and (later) placement.
export const ROLES = ["fodder", "charger", "skirmisher", "artillery", "tank", "support", "elite", "boss"];

// Components an entity may carry. Every entity in the tree — body part,
// projectile, summon — uses this same set ("everything is an entity").
export const ENTITY_KEYS = [
  "id", "tags", "at", "visual", "body", "health", "motion", "contact",
  "emitters", "children", "on", "vars", "life", "link",
];

export const VISUAL_SHAPES = ["box", "circle", "ellipse", "diamond"];

// Continuous movement controllers (the §14 set + keepDistance). `home` steers
// like the homing weapon effect; `orbit` circles a center; flying controllers
// ignore gravity (see normalize.js gravity defaulting).
export const MOTIONS = {
  static:       { params: {} },
  velocity:     { params: { vx: 0, vy: 0 } },
  gravity:      { params: {} }, // fall + rest on platforms; no self-movement
  moveTo:       { params: { target: "player", speed: 120 } },
  patrol:       { params: { range: 160, speed: 80 } }, // back and forth around spawn x
  chase:        { params: { speed: 160 } },
  keepDistance: { params: { min: 240, max: 420, speed: 140 } },
  home:         { params: { speed: 180, turnRate: 3 } }, // rad/s steering toward player
  orbit:        { params: { around: "parent", radius: 90, degPerSec: 90 } },
  // bob + slow drift toward the player's x, holding `altitude` px between the
  // entity's underside and the ground directly below (climbs over perches,
  // descends past them); altitude: null = anchor at the spawn height instead.
  hover:        { params: { amplitude: 14, rate: 2.4, driftSpeed: 40, altitude: 150, climbSpeed: 90 } },
};
export const FLYING_MOTIONS = ["velocity", "moveTo", "home", "orbit", "hover"];
export const MOTION_TARGETS = ["player", "parent", "spawn"];

// Discrete step/actions. Blocking actions occupy their track for a duration;
// instant ones complete in the same tick. `if.then/else` may contain only
// instant actions (validated) so control flow can't stall a track invisibly.
export const ACTIONS = {
  wait:      { blocking: true },  // { wait: 1.5 } or { wait: { range: [a, b] } }
  telegraph: { blocking: true },  // { telegraph: { part?, time, color? } }
  moveTo:    { blocking: true },  // { moveTo: { target|at:[x,y], speed, timeout? } }
  dash:      { blocking: true },  // { dash: { target?, speed, duration, away? } }
  jump:      { blocking: false }, // { jump: { vy? } } — hop if on the ground
  fire:      { blocking: false }, // { fire: { emitter, count?, pattern?, spreadDeg?, aim?, speed? } }
  spawn:     { blocking: false }, // { spawn: { ref, count?, pattern?, speed?, at? } }
  setMotion: { blocking: false }, // { setMotion: { target?, type, ...params } }
  set:       { blocking: false }, // { set: { target: "root.vars.x", value } }
  add:       { blocking: false }, // { add: { target, value } }
  mul:       { blocking: false }, // { mul: { target, value } }
  signal:    { blocking: false }, // { signal: "name" } or { signal: { name } }
  destroy:   { blocking: false }, // { destroy: { target?: "self"|<entityId> } }
  detach:    { blocking: false }, // { detach: { target?: "self"|<entityId> } }
  enable:    { blocking: false }, // { enable: { target } }  (un-disable an entity)
  disable:   { blocking: false }, // { disable: { target } } (inactive, invisible to combat)
  if:        { blocking: false }, // { if: { when: "expr", then: [..], else?: [..] } }
};

// Fire/spawn geometry patterns (initial position/angle/timing only — the spawned
// entity's own components take over after launch, doc §6.4).
export const PATTERNS = ["single", "aimed", "burst", "fan", "ring"];

// Aim styles for `aimed` fire (smarter-AI doc §3): current position, lead the
// player's velocity, or target the predicted landing point.
export const AIM_STYLES = ["current", "lead", "landing"];

// Events an entity's `on` table may listen for. `signal:<name>` keys listen for
// custom signals raised anywhere in the same enemy tree.
export const EVENTS = ["spawn", "destroy", "damage", "childDestroyed"];
export const SIGNAL_PREFIX = "signal:";

// Lifecycle policies for `link` (what happens to a child when its parent dies /
// when it dies itself). `transform` requires link.transformTo naming a def.
export const LINK_POLICIES = ["destroy", "detach", "disable", "ignore", "transform"];

// Utility-brain action shape (brain.mode === "utility"):
//   { id, when?, score, windup?, steps, recovery?, cooldown? }
// `when` is a boolean expression gate; `score` is a numeric expression (or
// constant) re-evaluated each decision tick; winner runs windup → steps →
// recovery and cannot be canceled mid-commitment.
export const UTILITY_ACTION_KEYS = ["id", "when", "score", "windup", "steps", "recovery", "cooldown"];

// Whitelisted expression functions (expr.js implements; anything else = parse
// error). `sense.*` identifiers come from perception (see perception.js).
export const EXPR_FUNCTIONS = ["alive", "exists", "distance", "countAlive", "hasTag", "randomChance", "min", "max", "abs", "clamp"];

// Engine-enforced safety limits (validated AND clamped live at runtime).
export const DEFAULT_LIMITS = { maxAlive: 40, maxSpawnsPerSecond: 20, maxSpawnDepth: 4 };
export const LIMIT_CAPS = { maxAlive: 120, maxSpawnsPerSecond: 40, maxSpawnDepth: 6 };

export const MAX_TREE_DEPTH = 5; // nesting depth of children under root
export const MAX_ENTITIES = 24; // authored entities per spec (root + children + defs)

// Numeric sanity ranges for validation (min, max). Sizes/speeds are px / px/s to
// match the mission engine.
export const RANGES = {
  threat: [1, 2000],
  tier: [1, 5],
  intelligence: [1, 5],
  "health.max": [1, 5000],
  "visual.size": [4, 400],
  "body.gravity": [0, 2],
  "contact.damage": [0, 200],
  "life.ttl": [0.05, 120],
  "projectile.speed": [20, 2000],
  "projectile.life": [0.05, 12],
  windup: [0, 5],
  recovery: [0, 5],
  cooldown: [0, 30],
  decisionInterval: [0.1, 2],
};

// Plain (non-entity) projectile spec an emitter may carry — resolved by the
// shared combat pipeline (mission/combat.js effects, mission/render.js shapes).
export const PROJECTILE_KEYS = ["speed", "w", "h", "color", "life", "shape", "gravity", "damage", "effects"];

// ---- vocabulary reference (for the LLM prompt + Designer help) -------------
// A compact plain-text description of the format, generated FROM the tables
// above so prompt and engine can't drift apart.

export function vocabularyDoc() {
  return [
    `EnemySpec JSON format (sparse — omit anything default):`,
    `Top level: { v:${SPEC_VERSION}, id, name, threat (1-2000), role (${ROLES.join("|")}), tier (1-5), intelligence (1-5), limits, vars, defs, root, brain }`,
    `Every entity (root, children, defs entries) may have: ${ENTITY_KEYS.join(", ")}.`,
    `  visual: { shape: ${VISUAL_SHAPES.join("|")}, size: [w,h] px, color: "#hex" }`,
    `  body: { w, h, gravity (0=flies, 1=falls), ghost (true = passes through platforms; default false) } — size defaults to visual size. Platforms block everyone else; flying entities with contact.destroySelf (missiles) are destroyed on terrain.`,
    `  health: { max } — omit for indestructible decoration; root MUST have health`,
    `  motion: one of ${Object.keys(MOTIONS).join(", ")} with params, e.g. ${JSON.stringify({ type: "keepDistance", ...MOTIONS.keepDistance.params })}`,
    `  contact: { damage, destroySelf?, knockback? } — touch damage to the player`,
    `  emitters: { <name>: { at:[dx,dy], ref:"<defId>" | projectile:{ speed,w,h,color,life,damage,effects? } } }`,
    `  children: [entities], at: [dx,dy] offset from parent`,
    `  on: { ${EVENTS.join("|")}|${SIGNAL_PREFIX}<name>: [actions] }`,
    `  life: { ttl: seconds }, vars: {}, link: { onParentDeath|onOwnDeath: ${LINK_POLICIES.join("|")}, transformTo? }`,
    `Brain: { mode: "tracks"|"utility", start: "<stateId>", states: { <id>: state } }`,
    `  tracks state: { enter:[actions], tracks:[{ id, loop, steps:[actions] }], transitions:[{ when:"expr"|event:"<signal>", to:"<stateId>" }] }`,
    `  utility state: { actions:[{ id, when?:"expr", score:"expr"|number, windup?, steps:[actions], recovery?, cooldown? }], decisionInterval? }`,
    `Actions (one key per step, named args): ${Object.keys(ACTIONS).join(", ")}.`,
    `  Blocking (occupy the track for a duration): wait, telegraph, moveTo, dash. Every looping track needs at least one.`,
    `  moveTo/dash targets: "player", "parent", "spawn", "lastSeen" (where the player was last visible), or at:[x,y]. Optional offset:[along,up] — along is on the line toward the target (positive = a point PAST it → fly-through strafing passes; negative = standoff short of it), up is vertical (negative = above). e.g. { moveTo: { target:"player", offset:[-260,-140], speed:260 } } = a firing perch above and short of the player; { moveTo: { target:"player", offset:[240,0], speed:420 } } = a strafing pass through them.`,
    `  fire: { emitter: "<name>" or "<childId>.<name>", count, pattern: ${PATTERNS.join("|")}, spreadDeg, aim: ${AIM_STYLES.join("|")} }`,
    `  spawn: { ref: "<defId>", count, pattern, speed }`,
    `Expressions (strings): arithmetic/comparison/boolean over self.hpPct, self.x/y, self.vars.*, root.vars.*, player.x/y/vx/vy/isGrounded, arena.time/width, sense.los/dist/playerAbove/playerBelow/playerApproaching/cornered/timeSinceSeen, and functions ${EXPR_FUNCTIONS.join(", ")}. No scripting.`,
    `limits: { maxAlive<=${LIMIT_CAPS.maxAlive}, maxSpawnsPerSecond<=${LIMIT_CAPS.maxSpawnsPerSecond}, maxSpawnDepth<=${LIMIT_CAPS.maxSpawnDepth} } — engine-enforced.`,
    `intelligence rubric — HOW SMART the behavior reads, NOT how hard it hits (damage/hp/attack rate belong in threat):`,
    `  1: scripted tracks, aim "current", no sense.* usage — pure pattern.`,
    `  2: tracks with multiple states/telegraph variety, position changes (patrol/standoffs).`,
    `  3: utility brain, aim "lead", actions gated on sense.dist/sense.los.`,
    `  4: + sense.playerApproaching/cornered, "lastSeen" repositioning, retreat-when-hurt actions, decisionInterval <= 0.3.`,
    `  5: + aim "landing", hunts via sense.timeSinceSeen, varies range/altitude per action, punishable committed attacks.`,
    `Match the brain to the declared intelligence.`,
  ].join("\n");
}
