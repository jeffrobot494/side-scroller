// ---------------------------------------------------------------------------
// CONTENT LIBRARY  (Phase 1 — data-driven entities)
//
// Everything the engine plays is data composed from a small primitive library:
//   - WEAPONS   id-keyed weapon map (data lives in arsenal.js; re-exported here)
//   - ENEMIES   stat blocks + a named behavior + the loot they drop
//   - LEVELS    world size, platforms, spawns, enemy placements, the exit
//   - MISSIONS  meta wrapper around a level: rewards, unlocks, threat impact
//   - BLUEPRINTS things Engineering can commission (proves the authoring path)
//
// These are plain JS-module objects rather than fetched .json files so the game
// opens with no server round-trip, but they are pure data: a human (or later an
// LLM) authors the exact same shape, and loader.js instantiates live objects
// from them. The `cost` / `budgetSpent` fields are the balance backbone the
// generated-content path will validate against (GDD §5.1).
// ---------------------------------------------------------------------------

import { ARSENAL, ENEMY_WEAPONS } from "./arsenal.js";

// ---- WEAPONS --------------------------------------------------------------
// The single weapon library lives in arsenal.js (24 player weapons + enemy
// weapons, all priced by weaponcost.js). Re-exported here as the id-keyed map
// the rest of the game looks weapons up in (enemy defs, custom-id collision
// checks, armory seeding).

export const WEAPONS = Object.fromEntries([...ARSENAL, ...ENEMY_WEAPONS].map((w) => [w.id, w]));

// ---- ENEMIES --------------------------------------------------------------
// behavior names map to functions in ai.js. contactDamage applies on touch.
// `weapon` (id into WEAPONS) is only used by ranged behaviors.

export const ENEMIES = {
  drone: {
    id: "drone",
    name: "Skitter Drone",
    color: "#e05a5a",
    w: 30,
    h: 26,
    health: 22,
    behavior: "charger",
    speed: 210,
    contactDamage: 10,
    detectRange: 640,
    loot: { name: "Drone Core", value: 35 },
  },
  sentinel: {
    id: "sentinel",
    name: "Sentinel",
    color: "#c261e0",
    w: 34,
    h: 46,
    health: 46,
    behavior: "shooter",
    speed: 140,
    preferredRange: 340, // holds this distance, backs off if crowded
    contactDamage: 8,
    detectRange: 760,
    weapon: "plasma",
    windup: 0.5, // telegraph time before each shot
    loot: { name: "Sentinel Alloy", value: 70 },
  },
  turret: {
    id: "turret",
    name: "Wall Turret",
    color: "#d98a3a",
    w: 38,
    h: 38,
    health: 34,
    behavior: "turret",
    speed: 0,
    contactDamage: 0,
    detectRange: 620,
    weapon: "plasma",
    windup: 0.7,
    loot: { name: "Targeting Optics", value: 55 },
  },
};

// ---- LEVELS ---------------------------------------------------------------
// world coordinates in pixels. The exit is a zone any living soldier reaches to
// win. `artifact` is guaranteed loot placed at the exit (the mission payoff).

export const LEVELS = {
  recon_ridge: {
    id: "recon_ridge",
    name: "Recon: Perimeter Ridge",
    world: { width: 3200, height: 540, gravity: 2000 },
    platforms: [
      { x: 0, y: 500, w: 3200, h: 40 },
      { x: 460, y: 400, w: 180, h: 20 },
      { x: 760, y: 320, w: 160, h: 20 },
      { x: 1120, y: 380, w: 220, h: 20 },
      { x: 1620, y: 340, w: 200, h: 20 },
      { x: 2080, y: 400, w: 200, h: 20 },
      { x: 2500, y: 330, w: 220, h: 20 },
    ],
    playerSpawn: { x: 120, y: 420 },
    enemies: [
      { type: "drone", x: 640, y: 460 },
      { type: "drone", x: 1180, y: 340 },
      { type: "turret", x: 1700, y: 302 },
      { type: "drone", x: 2160, y: 460 },
      { type: "sentinel", x: 2600, y: 454 },
    ],
    exit: { x: 3060, y: 380, w: 60, h: 120 },
    artifact: { name: "Alien Signal Relay", value: 90 },
  },

  raid_depot: {
    id: "raid_depot",
    name: "Raid: Supply Depot",
    world: { width: 3600, height: 540, gravity: 2000 },
    platforms: [
      { x: 0, y: 500, w: 3600, h: 40 },
      { x: 380, y: 380, w: 160, h: 20 },
      { x: 620, y: 300, w: 140, h: 20 },
      { x: 980, y: 360, w: 200, h: 20 },
      { x: 1360, y: 300, w: 160, h: 20 },
      { x: 1360, y: 460, w: 40, h: 40 }, // low cover
      { x: 1720, y: 380, w: 220, h: 20 },
      { x: 2180, y: 320, w: 180, h: 20 },
      { x: 2540, y: 400, w: 200, h: 20 },
      { x: 2960, y: 340, w: 220, h: 20 },
    ],
    playerSpawn: { x: 120, y: 420 },
    enemies: [
      { type: "drone", x: 560, y: 460 },
      { type: "sentinel", x: 1040, y: 454 },
      { type: "drone", x: 1420, y: 260 },
      { type: "turret", x: 1780, y: 342 },
      { type: "drone", x: 2240, y: 280 },
      { type: "sentinel", x: 2620, y: 454 },
      { type: "sentinel", x: 3040, y: 454 },
    ],
    exit: { x: 3480, y: 380, w: 60, h: 120 },
    artifact: { name: "Fusion Cell", value: 140 },
  },

  hive_core: {
    id: "hive_core",
    name: "Assault: The Hive Core",
    world: { width: 3800, height: 540, gravity: 2000 },
    platforms: [
      { x: 0, y: 500, w: 3800, h: 40 },
      { x: 420, y: 360, w: 180, h: 20 },
      { x: 780, y: 300, w: 160, h: 20 },
      { x: 1140, y: 380, w: 200, h: 20 },
      { x: 1520, y: 320, w: 180, h: 20 },
      { x: 1900, y: 360, w: 200, h: 20 },
      { x: 2300, y: 300, w: 180, h: 20 },
      { x: 2680, y: 380, w: 200, h: 20 },
      { x: 3080, y: 320, w: 220, h: 20 },
    ],
    playerSpawn: { x: 120, y: 420 },
    enemies: [
      { type: "sentinel", x: 520, y: 454 },
      { type: "drone", x: 860, y: 260 },
      { type: "turret", x: 1200, y: 342 },
      { type: "drone", x: 1560, y: 280 },
      { type: "sentinel", x: 1960, y: 454 },
      { type: "drone", x: 2340, y: 260 },
      { type: "turret", x: 2740, y: 342 },
      { type: "sentinel", x: 3140, y: 454 },
      { type: "sentinel", x: 3320, y: 454 },
    ],
    exit: { x: 3680, y: 380, w: 60, h: 120 },
    artifact: { name: "Hive Command Node", value: 260 },
  },
};

// ---- MISSIONS -------------------------------------------------------------
// The Operations list. `unlockAfter` gates a mission on prior completions.
// `threatReward` is how much campaign health a success restores; the final
// mission carries `winsCampaign`.

export const MISSIONS = [
  {
    id: "m_recon",
    level: "recon_ridge",
    name: "Recon: Perimeter Ridge",
    brief:
      "Cmdr. Voss: light contact on the ridge. Confirm the aliens are digging in and pull whatever tech you can off the relay.",
    difficulty: "Low",
    threatReward: 18,
    unlockAfter: [],
  },
  {
    id: "m_raid",
    level: "raid_depot",
    name: "Raid: Supply Depot",
    brief:
      "Voss: they're stockpiling. Hit the depot hard, grab a fusion cell, and get your people back out. Expect real resistance.",
    difficulty: "Medium",
    threatReward: 26,
    unlockAfter: ["m_recon"],
  },
  {
    id: "m_hive",
    level: "hive_core",
    name: "Assault: The Hive Core",
    brief:
      "Voss: this is it. We found the local hive. Punch through to the command node and tear it out — end the invasion in this sector.",
    difficulty: "Extreme",
    threatReward: 0,
    unlockAfter: ["m_recon", "m_raid"],
    winsCampaign: true,
  },
];

// ---- BLUEPRINTS -----------------------------------------------------------
// What Dr. Halden can commission in Engineering. Each references a weapon from
// the arsenal by id (single source — no drifting inline copies), with a credit
// cost and a build time in days. Commission clones the weapon into the armory.

export const BLUEPRINTS = [
  {
    id: "bp_incinerator",
    name: "Incinerator",
    prompt: '"A rifle that sets them on fire."',
    cost: 220,
    buildDays: 2,
    weapon: WEAPONS.incinerator,
  },
  {
    id: "bp_railgun",
    name: "Railgun",
    prompt: '"One shot, one kill. Make it hit like a truck."',
    cost: 300,
    buildDays: 3,
    weapon: WEAPONS.railgun,
  },
];

// Tuning constants for the meta layer, kept in one place.
export const TUNING = {
  startMoney: 750,
  startCampaignHealth: 60,
  loseAt: 0,
};
