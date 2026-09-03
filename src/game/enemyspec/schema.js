// ---------------------------------------------------------------------------
// ENEMYSPEC SCHEMA — the closed vocabulary, as data.
//
// One source of truth for what an EnemySpec may contain: component keys, motion
// controllers, actions, fire patterns, events, link policies, roles. The
// validator, the normalizer, the Designer's form UI, and the LLM prompt all
// read THIS module, so the vocabulary can grow in exactly one place. Anything
// not named here does not exist — the LLM composes these primitives freely but
// can never invent new engine behavior (tech/enemyspec-llm.md §1).
//
// Shape summary (sparse-authored; normalize.js fills defaults):
//   EnemySpec: { v, id, name, threat, role, tier, limits, vars, defs, root, brain }
//   Entity:    { id, tags, at, visual, body, health, motion, contact, emitters,
//                children, on, vars, life, link }
//   Brain:     { mode: "tracks"|"utility", start, states: { <id>: State } }
//   State:     { enter, tracks, transitions }            (tracks mode)
//              { enter, actions, decisionInterval, transitions } (utility mode)
// ---------------------------------------------------------------------------

import { CUE_IDS } from "../../audio/cues.js";

export const SPEC_VERSION = 1;

// Top-level EnemySpec keys. threat/role/tier are the explicit placement metadata
// (enemycost.js reads `threat` directly when present). `intelligence` (1–5)
// rates HOW SMART the behavior is — separate from threat, which prices how
// DANGEROUS it is (see the rubric in vocabularyDoc; smarter ≠ harder).
export const SPEC_KEYS = ["v", "id", "name", "threat", "role", "tier", "intelligence", "limits", "vars", "defs", "root", "brain", "sounds"];

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
// "anchor" = a companion's leader (or, lacking one, the spawn point) — see the
// soldier locomotor / companion brain (tech/locomotion.md, Slice L3).
export const MOTION_TARGETS = ["player", "parent", "spawn", "anchor"];

// Discrete step/actions. Blocking actions occupy their track for a duration;
// instant ones complete in the same tick. `if.then/else` may contain only
// instant actions (validated) so control flow can't stall a track invisibly.
export const ACTIONS = {
  wait:      { blocking: true },  // { wait: 1.5 } or { wait: { range: [a, b] } }
  telegraph: { blocking: true },  // { telegraph: { part?, time, color? } }
  moveTo:    { blocking: true },  // { moveTo: { target|at:[x,y], speed, timeout? } }
  dash:      { blocking: true },  // { dash: { target?, speed, duration, away? } } — a committed burst; each body actuates its own axes
  jump:      { blocking: false }, // { jump: {} } — hop if on the ground; the body owns the impulse
  fire:      { blocking: false }, // { fire: { emitter, count?, pattern?, spreadDeg?, aim?, speed? } }
  spawn:     { blocking: false }, // { spawn: { ref, count?, pattern?, speed?, at? } }
  setMotion: { blocking: false }, // { setMotion: { target?, type, ...params } }
  set:       { blocking: false }, // { set: { target: "root.vars.x", value } }
  add:       { blocking: false }, // { add: { target, value } }
  mul:       { blocking: false }, // { mul: { target, value } }
  signal:    { blocking: false }, // { signal: "name" } or { signal: { name } }
  sound:     { blocking: false }, // { sound: "cue.id" } or { sound: { id, gain?, pitch? } }
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
  "body.jump": [0, 1100],
  "contact.damage": [0, 200],
  "life.ttl": [0.05, 120],
  "projectile.speed": [20, 2000],
  "projectile.life": [0.05, 12],
  windup: [0, 5],
  recovery: [0, 5],
  cooldown: [0, 30],
  decisionInterval: [0.1, 2],
};

// ---- authoring metadata: one control per component field -------------------
// ENTITY_FIELDS is what the Enemy Designer's inspector generates its controls
// from — the same "one table entry, one control" trade EFFECT_SCHEMA makes for
// weapons (tech/enemy-designer.md, E2). It introduces NO vocabulary: every key
// here is already a component in ENTITY_KEYS, and every leaf is already
// accepted by validate.js. What it adds is a label, a control type, a bound and
// a default per field.
//
// Bounds are AUTHORING bounds, not validity rules — the same status
// EFFECT_SCHEMA's ranges have. RANGES covers fifteen paths and none of the
// MOTIONS params, contact.knockback or emitter offsets, so those sliders carry
// numbers invented here; a hand-authored value outside one stays legal.
//
// Field shape: { key, label, type, default, min?, max?, step?, unit?, options?,
// help? }. `key` may be dotted or indexed INSIDE the component ("size.0").
// Types: number | enum | color | bool | text | tags | json.

const F = (key, label, type, def, extra = {}) => ({ key, label, type, default: def, ...extra });

export const ENTITY_FIELDS = {
  id: [F("", "Id", "text", "", { help: "Referenced by fire/spawn/telegraph and by link.transformTo." })],
  tags: [F("", "Tags", "tags", [], { help: "Free labels. countAlive('tag:wing') and hasTag() read these." })],
  at: [
    F("0", "Offset x", "number", 0, { min: -200, max: 200, step: 1, unit: "px" }),
    F("1", "Offset y", "number", 0, { min: -200, max: 200, step: 1, unit: "px" }),
  ],
  visual: [
    F("shape", "Shape", "enum", "box", { options: VISUAL_SHAPES }),
    F("color", "Colour", "color", "#e05a5a"),
    F("size.0", "Width", "number", 24, { min: RANGES["visual.size"][0], max: RANGES["visual.size"][1], step: 2, unit: "px" }),
    F("size.1", "Height", "number", 24, { min: RANGES["visual.size"][0], max: RANGES["visual.size"][1], step: 2, unit: "px" }),
  ],
  body: [
    F("gravity", "Gravity", "number", 1, { min: RANGES["body.gravity"][0], max: RANGES["body.gravity"][1], step: 0.05, help: "0 = flies and ignores platforms." }),
    F("jump", "Jump", "number", 665, { min: RANGES["body.jump"][0], max: RANGES["body.jump"][1], step: 5, unit: "px/s", help: "How high it can get, so which ledges it can chase you onto. 665 clears a ~110px perch." }),
    F("ghost", "Ghost", "bool", false, { help: "Passes through platforms." }),
  ],
  health: [F("max", "Health", "number", 30, { min: RANGES["health.max"][0], max: RANGES["health.max"][1], step: 1 })],
  motion: [F("type", "Motion", "enum", "static", { options: Object.keys(MOTIONS) })], // params appended by motionFields()
  contact: [
    F("damage", "Touch damage", "number", 8, { min: RANGES["contact.damage"][0], max: RANGES["contact.damage"][1], step: 1 }),
    F("knockback", "Knockback", "number", 0, { min: 0, max: 1, step: 0.05 }),
    F("destroySelf", "Dies on contact", "bool", false, { help: "Missiles and other one-shot bodies." }),
  ],
  life: [F("ttl", "Lifetime", "number", 3, { min: RANGES["life.ttl"][0], max: RANGES["life.ttl"][1], step: 0.05, unit: "s" })],
  link: [
    F("onParentDeath", "On parent death", "enum", "destroy", { options: LINK_POLICIES }),
    F("onOwnDeath", "On own death", "enum", "destroy", { options: LINK_POLICIES }),
    F("transformTo", "Transform to", "text", "", { help: "A defs id. Only used by the 'transform' policy." }),
  ],
  vars: [F("", "Vars", "json", {}, { help: "Numbers this entity keeps. Read as self.vars.* in expressions." })],
  on: [F("", "Event handlers", "json", {}, { help: `Steps per event: ${EVENTS.join(", ")}, or signal:<name>.` })],
  // One EMITTER, not the emitters map: the tree gives each emitter its own node.
  emitters: [
    F("at.0", "Muzzle x", "number", 0, { min: -200, max: 200, step: 1, unit: "px" }),
    F("at.1", "Muzzle y", "number", 0, { min: -200, max: 200, step: 1, unit: "px" }),
    F("ref", "Fires def", "text", "", { help: "A defs id — fires that entity instead of a plain projectile." }),
    F("projectile.speed", "Speed", "number", 420, { min: RANGES["projectile.speed"][0], max: RANGES["projectile.speed"][1], step: 10, unit: "px/s" }),
    F("projectile.damage", "Damage", "number", 8, { min: 0, max: 200, step: 1 }),
    F("projectile.life", "Lifetime", "number", 2.2, { min: RANGES["projectile.life"][0], max: RANGES["projectile.life"][1], step: 0.05, unit: "s" }),
    F("projectile.w", "Width", "number", 10, { min: 2, max: 64, step: 1, unit: "px" }),
    F("projectile.h", "Height", "number", 10, { min: 2, max: 64, step: 1, unit: "px" }),
    F("projectile.gravity", "Arc", "number", 0, { min: 0, max: 2, step: 0.05, help: "Fraction of world gravity. 0 = flat." }),
    F("projectile.color", "Colour", "color", "#8affc1"),
    F("projectile.shape", "Shape", "enum", "orb", { options: ["bullet", "orb", "bolt", "pellet", "wave", "missile"] /* drawProjectile's six looks */ }),
    F("projectile.effects", "Effects", "json", [], { help: "Weapon effects (burn, slow, explode, …) — same shapes the arsenal uses." }),
  ],
};

// Motion params are per controller, so the inspector asks for them by type.
// Bounds invented here (MOTIONS carries defaults, not ranges).
const MOTION_PARAM = {
  vx: { label: "Velocity x", min: -600, max: 600, step: 10, unit: "px/s" },
  vy: { label: "Velocity y", min: -600, max: 600, step: 10, unit: "px/s" },
  target: { label: "Target", type: "enum", options: MOTION_TARGETS },
  speed: { label: "Speed", min: 0, max: 600, step: 10, unit: "px/s" },
  range: { label: "Patrol range", min: 20, max: 600, step: 10, unit: "px" },
  min: { label: "Hold at least", min: 0, max: 900, step: 10, unit: "px" },
  max: { label: "Hold at most", min: 0, max: 1200, step: 10, unit: "px" },
  turnRate: { label: "Turn rate", min: 0, max: 12, step: 0.1, unit: "rad/s" },
  around: { label: "Orbit around", type: "enum", options: MOTION_TARGETS },
  radius: { label: "Orbit radius", min: 10, max: 400, step: 5, unit: "px" },
  degPerSec: { label: "Orbit speed", min: -720, max: 720, step: 10, unit: "°/s" },
  amplitude: { label: "Bob height", min: 0, max: 120, step: 1, unit: "px" },
  rate: { label: "Bob rate", min: 0, max: 10, step: 0.1, unit: "/s" },
  driftSpeed: { label: "Drift speed", min: 0, max: 400, step: 5, unit: "px/s" },
  altitude: { label: "Altitude", min: 0, max: 400, step: 5, unit: "px" },
  climbSpeed: { label: "Climb speed", min: 0, max: 400, step: 5, unit: "px/s" },
};

// The controls for one motion type: the type picker plus its own params.
export function motionFields(type) {
  const motion = MOTIONS[type] || MOTIONS.static;
  const params = Object.entries(motion.params).map(([key, def]) => {
    const meta = MOTION_PARAM[key] || { label: key, min: 0, max: 600, step: 1 };
    return { key, label: meta.label, type: meta.type || "number", default: def, ...meta };
  });
  return [...ENTITY_FIELDS.motion, ...params];
}

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
    `  body: { w, h, gravity (0=flies, 1=falls), jump (upward px/s when it jumps; default 665), ghost (true = passes through platforms; default false) } — size defaults to visual size. Platforms block everyone else; flying entities with contact.destroySelf (missiles) are destroyed on terrain.`,
    `  body.jump is how HIGH this body can get, so it decides which ledges it can traverse: 665 clears a ~110px perch, 520 only ~68px. Raise it for something that should chase onto rooftops, lower it for something heavy. Omit it unless the design calls for it. Meaningless on a flying body (gravity 0).`,
    `  health: { max } — omit for indestructible decoration; root MUST have health`,
    `  motion: one of ${Object.keys(MOTIONS).join(", ")} with params, e.g. ${JSON.stringify({ type: "keepDistance", ...MOTIONS.keepDistance.params })}`,
    `  contact: { damage, destroySelf?, knockback? } — touch damage to the player; knockback is 0-1 (0 = none, 1 = hurled a screen), NOT a velocity in pixels`,
    `  emitters: { <name>: { at:[dx,dy], ref:"<defId>" | projectile:{ speed,w,h,color,life,damage,effects? }, sound?: "<cueId>"|{cue,gain} } }`,
    `  children: [entities], at: [dx,dy] offset from parent`,
    `  on: { ${EVENTS.join("|")}|${SIGNAL_PREFIX}<name>: [actions] }`,
    `  life: { ttl: seconds }, vars: {}, link: { onParentDeath|onOwnDeath: ${LINK_POLICIES.join("|")}, transformTo? }`,
    `Brain: { mode: "tracks"|"utility", start: "<stateId>", states: { <id>: state } }`,
    `  tracks state: { enter:[actions], tracks:[{ id, loop, steps:[actions] }], transitions:[{ when:"expr"|event:"<signal>", to:"<stateId>" }] }`,
    `  utility state: { actions:[{ id, when?:"expr", score:"expr"|number, windup?, steps:[actions], recovery?, cooldown? }], decisionInterval? }`,
    `Top-level sounds (all optional; every one has an engine default so an enemy with no sounds block still sounds right): { fire, hurt, death, part } — each "<cueId>" or { cue?, gain? } where gain is 0-2. \`fire\` is the default for every emitter; an emitter's own \`sound\` beats it.`,
    `Actions (one key per step, named args): ${Object.keys(ACTIONS).join(", ")}.`,
    `  sound: { id: "<cueId>", gain?: 0-2, pitch?: >0 } (or just { sound: "<cueId>" }) — plays a cue at the entity. Use it for moments the defaults do not cover: a telegraph, a phase change, a signal handler. Do NOT use it for plain hurt/death; those already sound via the top-level slots and would double up.`,
    `Sound cue ids (the closed set — never invent one): ${CUE_IDS.join(", ")}.`,
    `  Blocking (occupy the track for a duration): wait, telegraph, moveTo, dash. Every looping track needs at least one.`,
    `  moveTo/dash targets: "player", "parent", "spawn", "lastSeen" (where the player was last visible), "anchor" (a companion's leader), or at:[x,y]. Optional offset:[along,up] — along is on the line toward the target (positive = a point PAST it → fly-through strafing passes; negative = standoff short of it), up is vertical (negative = above). e.g. { moveTo: { target:"player", offset:[-260,-140], speed:260 } } = a firing perch above and short of the player; { moveTo: { target:"player", offset:[240,0], speed:420 } } = a strafing pass through them.`,
    `  fire: { emitter: "<name>" or "<childId>.<name>", count, pattern: ${PATTERNS.join("|")}, spreadDeg, aim: ${AIM_STYLES.join("|")} }`,
    `  spawn: { ref: "<defId>", count, pattern, speed }`,
    `Expressions (strings): arithmetic/comparison/boolean over self.hpPct, self.x/y, self.vars.*, root.vars.*, player.x/y/vx/vy/isGrounded, arena.time/width, sense.los/dist/playerAbove/playerBelow/playerApproaching/cornered/timeSinceSeen/anchorDist (anchorX/anchorY = a companion's leader, or the spawn point), sense.routeSteps/routeReachable/navBlocked (navigation: edges left on the route, whether the destination is gettable at all, and whether this agent gave up trying to jump to it), and functions ${EXPR_FUNCTIONS.join(", ")}. No scripting.`,
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
