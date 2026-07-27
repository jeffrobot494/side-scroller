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
      { id: "weapon.fire", label: "Shot (squad)", bus: "sfx", help: "One trigger pull by a soldier. Shotgun pellets are one shell, so this fires once per pull." },
      { id: "weapon.fire.enemy", label: "Shot (enemy)", bus: "sfx", help: "An enemy-team weapon firing. Falls back to the squad shot if unset." },
      { id: "weapon.reload.start", label: "Reload start", bus: "sfx", help: "The magazine drops — plays when R is pressed with rounds to spare." },
      { id: "weapon.reload.done", label: "Reload done", bus: "sfx", help: "The fresh magazine seats and firing is available again." },
      { id: "weapon.empty", label: "Dry click", bus: "sfx", help: "Trigger pulled with an empty magazine (or no spare mags left)." },
    ],
  },
  {
    title: "Impacts",
    items: [
      { id: "impact.hit", label: "Hit an actor", bus: "sfx", help: "A projectile connects with a soldier or an enemy part." },
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
