// ---------------------------------------------------------------------------
// CUES — the closed sound vocabulary, as data.
//
// One source of truth for every sound the game can ask for. The bank keys off
// these ids, the editor's Sound page generates its table from them, and (later)
// the Weapon/Enemy designers offer them in a picker. Anything not named here
// does not exist — the same discipline as enemyspec/schema.js.
//
// Ids are DOTTED and resolve up the dots (see bank.js resolveCue):
//   "weapon.fire.pellet" -> "weapon.fire" -> silence
// so a specific cue can be added later without touching any calling code.
//
// `bus` picks the mixer channel: sfx (world), ui (menus), music (loops).
// ---------------------------------------------------------------------------

export const BUSES = ["sfx", "ui", "music"];

export const CUES = [
  {
    title: "Weapons",
    items: [
      { id: "weapon.fire", label: "Shot (squad)", bus: "sfx", help: "One trigger pull by a soldier. Shotgun pellets are one shell, so this fires once per pull. The generic fallback for any shape below that has no entry." },
      { id: "weapon.fire.enemy", label: "Shot (enemy)", bus: "sfx", help: "An enemy-team weapon firing. Falls back to the squad shot if unset." },
      { id: "weapon.reload.start", label: "Reload start", bus: "sfx", help: "The magazine drops — plays when R is pressed with rounds to spare." },
      { id: "weapon.reload.done", label: "Reload done", bus: "sfx", help: "The fresh magazine seats and firing is available again." },
      { id: "weapon.empty", label: "Dry click", bus: "sfx", help: "Trigger pulled with an empty magazine (or no spare mags left)." },
    ],
  },
  {
    title: "Weapon timbres (by projectile shape)",
    items: [
      { id: "weapon.fire.bullet", label: "Bullet", bus: "sfx", help: "Kinetic slug throwers — the rifles, carbines and sidearms." },
      { id: "weapon.fire.pellet", label: "Pellet", bus: "sfx", help: "Shotguns. One boom per shell, however many pellets it throws." },
      { id: "weapon.fire.bolt", label: "Bolt", bus: "sfx", help: "Directed-energy weapons — lances, rippers, arc guns." },
      { id: "weapon.fire.missile", label: "Missile", bus: "sfx", help: "Launchers. Lobbed and arcing, so the report has a tail." },
      { id: "weapon.fire.wave", label: "Wave", bus: "sfx", help: "Streams and sprays — incinerators, ember jets." },
      { id: "weapon.fire.orb", label: "Orb", bus: "sfx", help: "Slow plasma globs." },
    ],
  },
  {
    title: "Impacts",
    items: [
      { id: "impact.hit", label: "Hit an actor", bus: "sfx", help: "A projectile connects with a soldier or an enemy part. The fallback for the shape-specific impacts below." },
      { id: "impact.hit.bolt", label: "Hit — bolt", bus: "sfx", help: "An energy bolt connecting." },
      { id: "impact.hit.pellet", label: "Hit — pellet", bus: "sfx", help: "Buckshot connecting." },
      { id: "impact.hit.wave", label: "Hit — wave", bus: "sfx", help: "A stream weapon connecting." },
      { id: "impact.wall", label: "Hit terrain", bus: "sfx", help: "A projectile stops on a platform." },
      { id: "impact.explode", label: "Explosion", bus: "sfx", help: "An `explode` effect resolving — rockets, grenades, sappers." },
      { id: "impact.chain", label: "Chain arc", bus: "sfx", help: "A `chain` effect jumping to its next target." },
    ],
  },
  {
    title: "Soldier",
    items: [
      { id: "soldier.jump", label: "Jump", bus: "sfx", help: "The controlled soldier leaves the ground." },
      { id: "soldier.land", label: "Land", bus: "sfx", help: "A soldier touches down after a meaningful fall." },
      { id: "soldier.hurt", label: "Hurt", bus: "sfx", help: "A soldier takes damage." },
      { id: "soldier.death", label: "Down", bus: "sfx", help: "A soldier is killed." },
    ],
  },
  {
    title: "Enemy",
    items: [
      { id: "enemy.hurt", label: "Hurt", bus: "sfx", help: "An enemy part takes damage (throttled hard — hits are frequent)." },
      { id: "enemy.death", label: "Destroyed", bus: "sfx", help: "An enemy root dies. Parts breaking off use the part cue below." },
      { id: "enemy.part", label: "Part destroyed", bus: "sfx", help: "A destructible child part of an enemy is broken off." },
    ],
  },
  {
    title: "Pickups & mission",
    items: [
      { id: "loot.pickup", label: "Loot pickup", bus: "sfx", help: "A soldier walks over dropped loot." },
      { id: "mission.start", label: "Deploy", bus: "ui", help: "The mission intro banner appears." },
      { id: "mission.win", label: "Extraction", bus: "ui", help: "A soldier reaches the exit." },
      { id: "mission.lose", label: "Squad wiped", bus: "ui", help: "The last soldier goes down." },
    ],
  },
  {
    title: "Interface",
    items: [
      { id: "ui.click", label: "Click", bus: "ui", help: "A button or card in the hub / editor." },
      { id: "ui.back", label: "Back / cancel", bus: "ui", help: "Backing out of a screen." },
    ],
  },
];

export const CUE_LIST = CUES.flatMap((g) => g.items);
export const CUE_BY_ID = Object.fromEntries(CUE_LIST.map((c) => [c.id, c]));
export const CUE_IDS = CUE_LIST.map((c) => c.id);

// The mixer channel a cue plays on, defaulting to sfx for ids not in the
// catalog (a per-entity override can name one that was never catalogued).
export function busFor(id) {
  const cue = CUE_BY_ID[id];
  return cue && BUSES.includes(cue.bus) ? cue.bus : "sfx";
}

// ---- per-weapon resolution -------------------------------------------------
// A weapon may carry `sounds: { fire, impact, reload, empty }`. Each slot is
// EITHER a bare cue id or `{ cue?, gain? }`:
//
//   fire:   "weapon.fire.bolt"                 // that cue, at its own level
//   impact: { cue: "impact.hit.pellet", gain: 1.1 }
//   reload: { gain: 0.6 }                      // cue still derives from shape
//
// The gain-only form is the important one: it turns a weapon down WITHOUT
// giving up its shape-derived timbre, so two weapons sharing a cue can sit at
// different levels. Gain is a multiplier the engine folds into the cue's own
// level (engine.play → entry.gain * opts.gain), not a replacement for it.
//
// With nothing authored, `fire` and `impact` derive a cue from the projectile's
// SHAPE, so all 24 arsenal entries get a timbre matching what they look like
// without anyone assigning one. The derived id is only a guess at a more
// specific cue: bank.js walks up the dots, so "weapon.fire.bullet" quietly
// becomes "weapon.fire" if that timbre is unset.
//
// Shape is meaningless for reload/dry-click, so those never get a suffix.
export const WEAPON_SOUND_KINDS = ["fire", "impact", "reload", "empty"];

const KIND_BASE = {
  fire: "weapon.fire",
  impact: "impact.hit",
  reload: "weapon.reload.start",
  empty: "weapon.empty",
};
const SHAPED_KINDS = ["fire", "impact"];

// Matches ENTRY_DEFAULTS.gain in bank.js — a slot trims the cue, it doesn't get
// its own scale.
const GAIN_RANGE = [0, 2];

function coerceGain(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return n < GAIN_RANGE[0] ? GAIN_RANGE[0] : n > GAIN_RANGE[1] ? GAIN_RANGE[1] : n;
}

// The cue a slot falls back to when nothing names one explicitly.
function derivedCue(weapon, kind, team) {
  let base = KIND_BASE[kind];
  if (!base) return null;
  // Enemy-team fire gets its own branch, which itself falls back to the squad
  // shot: weapon.fire.enemy.bolt -> weapon.fire.enemy -> weapon.fire.
  if (kind === "fire" && team !== "player") base = "weapon.fire.enemy";

  if (!SHAPED_KINDS.includes(kind)) return base;
  const shape = weapon && weapon.projectile && weapon.projectile.shape;
  return shape ? `${base}.${shape}` : base;
}

/**
 * Resolve one of a weapon's sound slots.
 * @returns {{ cue: string|null, gain: number }} — cue is null only for an
 *   unknown `kind`; gain is always a usable multiplier (defaults to 1).
 */
export function weaponSound(weapon, kind, team = "player") {
  const slot = weapon && weapon.sounds && weapon.sounds[kind];
  const derived = derivedCue(weapon, kind, team);
  if (!derived) return { cue: null, gain: 1 };

  if (typeof slot === "string" && slot) return { cue: slot, gain: 1 };
  if (slot && typeof slot === "object")
    return { cue: slot.cue || derived, gain: coerceGain(slot.gain ?? 1) };
  return { cue: derived, gain: 1 };
}

/** Just the cue id — the common case, and what the designer's hint shows. */
export function weaponCue(weapon, kind, team = "player") {
  return weaponSound(weapon, kind, team).cue;
}
