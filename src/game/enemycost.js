// ---------------------------------------------------------------------------
// ENEMY THREAT-COST MODEL — the enemy-side twin of weaponcost.js (GDD §5.1).
//
// Generation needs difficulty to be a NUMBER: pick enemies until their summed
// threat fills a budget, and a mission's difficulty is just how big that budget
// is. `enemyThreat(def)` scores a single enemy from its stat block; a level is
// legal at a difficulty if the placed enemies' total threat <= that band's
// budget. This is the guardrail the Level Generator (and later the LLM) place
// enemies against — one formula, one source of truth.
//
// Constants are grouped and tunable; treat K as the dials that rebalance every
// generated mission at once. Reference scores (default content): drone ~51,
// sentinel ~71, turret ~42.
// ---------------------------------------------------------------------------

import { WEAPONS } from "./content.js";
import { dps as weaponDps } from "./weaponcost.js";

const K = {
  global: 1.0, // overall threat scaler
  health: 0.5, // survivability, per hp
  contact: 0.9, // melee/contact damage weight
  contactSpeed: 0.004, // fast melee is scarier: scales contact by speed
  rangedDps: 1.2, // per point of the enemy weapon's DPS
  windupRelief: 0.6, // longer telegraph → more dodgeable → cheaper
  detect: 0.02, // aggro reach, per px of detectRange
  speed: 0.05, // raw mobility/pressure
};

// Difficulty bands: a difficulty is just a threat budget. Scaled up over the
// campaign by budgetFor(). Reference: default recon ≈ 266, raid ≈ 408.
export const DIFFICULTY = [
  { id: "low", name: "Low", budget: 250 },
  { id: "medium", name: "Medium", budget: 420 },
  { id: "high", name: "High", budget: 600 },
  { id: "extreme", name: "Extreme", budget: 820 },
];

const BY_ID = Object.fromEntries(DIFFICULTY.map((d) => [d.id, d]));

// Per-enemy threat score. `weapons` lets a caller pass a merged map (built-ins +
// customWeaponMap()) so custom enemies carrying custom weapons still score;
// defaults to the built-in WEAPONS.
export function enemyThreat(def, weapons = WEAPONS) {
  if (!def) return 0;
  // EnemySpec roster descriptors carry their authored threat directly (they have
  // no flat stat block to score); trust it.
  if (def.isSpec) return Math.round((def.threat ?? 50) * K.global);
  const base = (def.health || 0) * K.health;
  const melee = (def.contactDamage || 0) * K.contact * (1 + (def.speed || 0) * K.contactSpeed);

  let ranged = 0;
  const w = def.weapon ? weapons[def.weapon] : null;
  if (w) {
    const windupFactor = 1 / (1 + (def.windup || 0) * K.windupRelief);
    ranged = weaponDps(w) * K.rangedDps * windupFactor;
  }

  const reach = (def.detectRange || 0) * K.detect;
  const mob = (def.speed || 0) * K.speed;

  return Math.round((base + melee + ranged + reach + mob) * K.global);
}

// Budget for a difficulty id, scaled by campaign pressure (day/threat). scale
// 1 = the base band; the board raises it as the invasion escalates.
export function budgetFor(difficultyId, scale = 1) {
  const band = BY_ID[difficultyId] || DIFFICULTY[0];
  return Math.round(band.budget * scale);
}

// The display name for a difficulty id, and the only place a difficulty becomes
// English. A lead carries the ID — storing the label instead is what let
// `mission.difficulty === "High"` gate the finale on a display string, and what
// made the hub lowercase it straight back to get a CSS class. Unknown ids fall
// back the same way budgetFor does.
export function labelFor(difficultyId) {
  return (BY_ID[difficultyId] || DIFFICULTY[0]).name;
}

// Check a set of placed enemy defs against a budget. Mirrors weaponcost.validate.
export function validatePlacement(defs, budget, weapons = WEAPONS) {
  const spent = defs.reduce((s, d) => s + enemyThreat(d, weapons), 0);
  return { spent, budget, legal: spent <= budget, over: Math.max(0, spent - budget) };
}
