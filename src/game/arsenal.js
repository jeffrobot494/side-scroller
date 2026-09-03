// ---------------------------------------------------------------------------
// ARSENAL — THE weapon library: 24 hand-authored player weapons spanning the
// effect library and the three tech tiers, plus the enemy weapons. Composed
// from the same primitives the Weapon Designer exposes and priced by
// weaponcost.js, so every entry is a legal, drop-in armory weapon. content.js
// re-exports the whole set as the id-keyed `WEAPONS` map the game looks up.
//
// Effect kinds in play: damage, burn, slow, knockback, explode, chain (value)
// and pellets, pierce, homing (delivery). `tier` (1..3) is metadata for grouping
// in the editor's Firing Room; the game ignores it.
//
// Also per weapon: `magazine`/`reloadTime` (0/absent = unlimited, never reloads);
// `projectile.gravity` (0 = laser-straight, >0 = fraction of world gravity, for
// arcing lobs); `projectile.shape` (render look). None of these affect cost.
//
// Exported finalized (per-effect cost + budgetSpent filled) via finalizeWeapon.
// ---------------------------------------------------------------------------

import { finalizeWeapon } from "./weaponcost.js";

const RAW = [
  // ---- Tier I · Standard (≤100) -----------------------------------------
  { id: "sidearm", name: "Sidearm Mk.II", tier: 1, fireRate: 4.5, auto: false, spread: 0.01, magazine: 14, reloadTime: 1.2,
    projectile: { speed: 840, w: 10, h: 4, color: "#ffe08a", life: 0.9, shape: "bullet" },
    effects: [{ kind: "damage", amount: 14 }] },
  { id: "scout_smg", name: "Scout SMG", tier: 1, fireRate: 12, auto: true, spread: 0.05, magazine: 30, reloadTime: 1.6,
    projectile: { speed: 900, w: 9, h: 4, color: "#ffcf5c", life: 0.7, shape: "bullet" },
    effects: [{ kind: "damage", amount: 6 }] },
  { id: "carbine", name: "Field Carbine", tier: 1, fireRate: 6, auto: true, spread: 0.02, magazine: 24, reloadTime: 1.8,
    projectile: { speed: 950, w: 12, h: 4, color: "#ffd36a", life: 1.0, shape: "bullet" },
    effects: [{ kind: "damage", amount: 14 }] },
  { id: "scattergun", name: "Scattergun", tier: 1, fireRate: 1.6, auto: false, spread: 0.05, magazine: 6, reloadTime: 2.2,
    projectile: { speed: 820, w: 8, h: 4, color: "#ffbf6a", life: 0.5, shape: "pellet" },
    effects: [{ kind: "damage", amount: 9 }, { kind: "pellets", count: 5, spread: 0.13 }] },
  { id: "ember_jet", name: "Ember Jet", tier: 1, fireRate: 10, auto: true, spread: 0.06, magazine: 45, reloadTime: 2.0,
    projectile: { speed: 620, w: 10, h: 6, color: "#ff8a3a", life: 0.35, gravity: 0.25, shape: "wave" },
    effects: [{ kind: "burn", dps: 8, duration: 1.2 }] },
  { id: "stun_pistol", name: "Stun Pistol", tier: 1, fireRate: 3, auto: false, spread: 0.03, magazine: 10, reloadTime: 1.3,
    projectile: { speed: 780, w: 10, h: 4, color: "#8fd0ff", life: 0.9, shape: "bolt" },
    effects: [{ kind: "damage", amount: 6 }, { kind: "slow", factor: 0.5, duration: 1.5 }] },
  { id: "ripper", name: "Ripper", tier: 1, fireRate: 5, auto: true, spread: 0.02, magazine: 20, reloadTime: 1.7,
    projectile: { speed: 1050, w: 14, h: 4, color: "#c0f0ff", life: 1.1, shape: "bolt" },
    effects: [{ kind: "damage", amount: 10 }, { kind: "pierce", count: 1 }] },
  { id: "bulldog", name: "Bulldog", tier: 1, fireRate: 2, auto: false, spread: 0.01, magazine: 8, reloadTime: 1.8,
    projectile: { speed: 880, w: 16, h: 6, color: "#ffd36a", life: 0.9, shape: "bullet" },
    effects: [{ kind: "damage", amount: 26 }, { kind: "knockback", force: 0.3 }] },

  // ---- Tier II · Advanced (≤180) ----------------------------------------
  { id: "burst_rifle", name: "Burst Rifle", tier: 2, fireRate: 8, auto: true, spread: 0.03, magazine: 30, reloadTime: 1.9,
    projectile: { speed: 1000, w: 12, h: 4, color: "#ffe36a", life: 1.0, shape: "bullet" },
    effects: [{ kind: "damage", amount: 16 }] },
  { id: "combat_shotgun", name: "Combat Shotgun", tier: 2, fireRate: 1.5, auto: false, spread: 0.06, magazine: 8, reloadTime: 2.4,
    projectile: { speed: 860, w: 8, h: 5, color: "#ffc060", life: 0.55, shape: "pellet" },
    effects: [{ kind: "damage", amount: 9 }, { kind: "knockback", force: 0.2 }, { kind: "pellets", count: 6, spread: 0.14 }] },
  { id: "incinerator", name: "Incinerator", tier: 2, fireRate: 5, auto: true, spread: 0.02, magazine: 50, reloadTime: 2.2,
    projectile: { speed: 820, w: 14, h: 6, color: "#ff8a3a", life: 0.9, gravity: 0.2, shape: "wave" },
    effects: [{ kind: "damage", amount: 8 }, { kind: "burn", dps: 6, duration: 3 }] },
  { id: "frost_lance", name: "Frost Lance", tier: 2, fireRate: 3, auto: false, spread: 0.01, magazine: 10, reloadTime: 2.0,
    projectile: { speed: 1150, w: 16, h: 4, color: "#9fe6ff", life: 1.2, shape: "bolt" },
    effects: [{ kind: "damage", amount: 12 }, { kind: "slow", factor: 0.5, duration: 1.2 }, { kind: "pierce", count: 1 }] },
  { id: "grenade_launcher", name: "Grenade Launcher", tier: 2, fireRate: 1.6, auto: false, spread: 0.01, magazine: 4, reloadTime: 2.6,
    projectile: { speed: 700, w: 16, h: 12, color: "#c8d24a", life: 1.5, gravity: 0.7, shape: "orb" },
    effects: [{ kind: "damage", amount: 10 }, { kind: "explode", amount: 40, radius: 150 }] },
  { id: "arc_tazer", name: "Arc Tazer", tier: 2, fireRate: 6, auto: true, spread: 0.03, magazine: 24, reloadTime: 1.8,
    projectile: { speed: 940, w: 9, h: 4, color: "#8fd0ff", life: 0.8, shape: "bolt" },
    effects: [{ kind: "damage", amount: 9 }, { kind: "chain", amount: 8, jumps: 2, range: 240 }] },
  // `sounds.fire` overrides the shape-derived timbre. Only two weapons need it:
  // both picked a shape for how the projectile LOOKS, and the matching sound is
  // wrong for how the weapon FIRES.
  { id: "concussion_gun", name: "Concussion Gun", tier: 2, fireRate: 2.5, auto: false, spread: 0.02, magazine: 6, reloadTime: 2.2,
    projectile: { speed: 820, w: 18, h: 8, color: "#ffd0a0", life: 0.9, gravity: 0.2, shape: "wave" },
    // "wave" is a light stream hiss; the heaviest slug in the arsenal needs to thump.
    sounds: { fire: "weapon.fire.pellet" },
    effects: [{ kind: "damage", amount: 30 }, { kind: "knockback", force: 0.5 }] },
  { id: "hornet_smg", name: "Hornet SMG", tier: 2, fireRate: 9, auto: true, spread: 0.05, magazine: 28, reloadTime: 1.9,
    projectile: { speed: 760, w: 9, h: 5, color: "#d0ff8a", life: 1.4, shape: "missile" },
    // Shaped "missile" because it homes, but it empties 9 rounds a second — the
    // 0.36s launcher whoosh would overlap itself into mush.
    sounds: { fire: "weapon.fire.bolt" },
    effects: [{ kind: "damage", amount: 11 }, { kind: "homing", turn: 4 }] },

  // ---- Tier III · Prototype (≤280) --------------------------------------
  { id: "railgun", name: "Railgun", tier: 3, fireRate: 1.5, auto: false, spread: 0, magazine: 4, reloadTime: 2.6,
    projectile: { speed: 1400, w: 22, h: 5, color: "#7ad7ff", life: 1.2, shape: "bolt" },
    effects: [{ kind: "damage", amount: 60 }, { kind: "pierce", count: 3 }] },
  { id: "rocket_launcher", name: "Rocket Launcher", tier: 3, fireRate: 1.4, auto: false, spread: 0.01, magazine: 3, reloadTime: 3.0,
    projectile: { speed: 720, w: 18, h: 14, color: "#ff7a3a", life: 2.0, gravity: 0.4, shape: "missile" },
    effects: [{ kind: "damage", amount: 25 }, { kind: "explode", amount: 70, radius: 170 }] },
  { id: "plasma_flak", name: "Plasma Flak", tier: 3, fireRate: 2.4, auto: true, spread: 0.12, magazine: 16, reloadTime: 2.0,
    projectile: { speed: 780, w: 10, h: 8, color: "#8affc1", life: 0.9, gravity: 0.15, shape: "orb" },
    effects: [{ kind: "damage", amount: 9 }, { kind: "burn", dps: 6, duration: 2.5 }, { kind: "pellets", count: 5, spread: 0.12 }] },
  { id: "tesla_arc", name: "Tesla Arc", tier: 3, fireRate: 3.5, auto: true, spread: 0.02, magazine: 18, reloadTime: 2.0,
    projectile: { speed: 900, w: 12, h: 8, color: "#b0e0ff", life: 0.8, shape: "bolt" },
    effects: [{ kind: "damage", amount: 16 }, { kind: "chain", amount: 18, jumps: 3, range: 300 }] },
  { id: "cryo_cannon", name: "Cryo Cannon", tier: 3, fireRate: 2, auto: true, spread: 0.02, magazine: 20, reloadTime: 2.4,
    projectile: { speed: 620, w: 16, h: 14, color: "#a0e8ff", life: 1.6, gravity: 0.4, shape: "orb" },
    effects: [{ kind: "slow", factor: 0.3, duration: 3 }, { kind: "explode", amount: 24, radius: 150 }] },
  { id: "inferno_cannon", name: "Inferno Cannon", tier: 3, fireRate: 3, auto: true, spread: 0.13, magazine: 40, reloadTime: 2.2,
    projectile: { speed: 700, w: 10, h: 6, color: "#ff7020", life: 0.4, gravity: 0.2, shape: "wave" },
    effects: [{ kind: "damage", amount: 5 }, { kind: "burn", dps: 10, duration: 3 }, { kind: "pellets", count: 3, spread: 0.13 }] },
  { id: "seeker", name: "Seeker", tier: 3, fireRate: 1.6, auto: true, spread: 0.02, magazine: 5, reloadTime: 2.8,
    projectile: { speed: 520, w: 12, h: 12, color: "#ff9be0", life: 2.2, shape: "missile" },
    effects: [{ kind: "damage", amount: 12 }, { kind: "explode", amount: 55, radius: 170 }, { kind: "homing", turn: 3 }] },
  { id: "devastator", name: "Devastator", tier: 3, fireRate: 1.5, auto: false, spread: 0.01, magazine: 5, reloadTime: 2.6,
    projectile: { speed: 1200, w: 20, h: 8, color: "#ffbf3a", life: 1.1, shape: "bolt" },
    effects: [{ kind: "damage", amount: 70 }, { kind: "knockback", force: 0.4 }, { kind: "pierce", count: 2 }] },
];

// ---- Enemy weapons ---------------------------------------------------------
// Slower, telegraphed projectiles the player can dodge. Kept out of ARSENAL so
// the Firing Room / shop never list them; enemy defs reference them by id
// (`weapon: "plasma"`) through the WEAPONS map. No magazine = never reloads.
const ENEMY_RAW = [
  { id: "plasma", name: "Plasma Caster", enemy: true, fireRate: 1.1, auto: true, spread: 0.04,
    projectile: { speed: 460, w: 14, h: 14, color: "#8affc1", life: 2.2, shape: "orb" },
    effects: [{ kind: "damage", amount: 14 }] },
];

export const ARSENAL = RAW.map((w) => finalizeWeapon({ ...w, fireMode: "projectile" }));
export const ENEMY_WEAPONS = ENEMY_RAW.map((w) => finalizeWeapon({ ...w, fireMode: "projectile" }));

export const ARSENAL_BY_ID = Object.fromEntries(ARSENAL.map((w) => [w.id, w]));
