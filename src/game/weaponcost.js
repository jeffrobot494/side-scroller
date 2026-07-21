// ---------------------------------------------------------------------------
// WEAPON COST MODEL — the balance backbone (GDD §5.1).
//
// Every effect has a cost; a weapon's `budgetSpent` is derived from its effects
// scaled by fire rate, projectile size, and spread. A weapon is legal at a tech
// tier if budgetSpent <= that tier's budget. This is the hard guardrail the
// Weapon Designer enforces now and the Player2 generator will validate against
// later — one formula, one source of truth.
//
// Constants are deliberately grouped and tunable; treat them as the dials you
// turn to balance the whole game.
// ---------------------------------------------------------------------------

const K = {
  global: 1.0, // overall price scaler
  burn: 0.75, // burn (damage-over-time) is discounted vs. instant damage
  sizeRef: 2200, // bigger projectiles are easier to land → pricier
  spreadRelief: 1.5, // more spread → less accurate → cheaper
};

export const TIERS = [
  { id: "t1", name: "Tier I · Standard", budget: 100 },
  { id: "t2", name: "Tier II · Advanced", budget: 180 },
  { id: "t3", name: "Tier III · Prototype", budget: 280 },
];

// Per-shot cost of a single effect.
export function effectCost(fx) {
  if (fx.kind === "damage") return Math.max(0, fx.amount || 0);
  if (fx.kind === "burn") return Math.max(0, (fx.dps || 0) * (fx.duration || 0) * K.burn);
  return 0;
}

// Per-shot "damage equivalent" (instant damage + full burn total) for DPS math.
export function perShotDamage(weapon) {
  let d = 0;
  for (const fx of weapon.effects || []) {
    if (fx.kind === "damage") d += fx.amount || 0;
    else if (fx.kind === "burn") d += (fx.dps || 0) * (fx.duration || 0);
  }
  return d;
}

export function dps(weapon) {
  return perShotDamage(weapon) * (weapon.fireRate || 0);
}

// The weapon's budget_spent: composition cost × rate × size, minus a little for
// spread. This is the number compared against a tier budget.
export function weaponCost(weapon) {
  const perShot = (weapon.effects || []).reduce((s, fx) => s + effectCost(fx), 0);
  const p = weapon.projectile || {};
  const sizeFactor = 1 + ((p.w || 0) * (p.h || 0)) / K.sizeRef;
  const spreadFactor = 1 / (1 + (weapon.spread || 0) * K.spreadRelief);
  return Math.round(perShot * (weapon.fireRate || 0) * sizeFactor * spreadFactor * K.global);
}

export function validate(weapon, budget) {
  const spent = weaponCost(weapon);
  return { spent, budget, legal: spent <= budget, over: Math.max(0, spent - budget) };
}

// Produce a content.js-shaped weapon: per-effect `cost` filled in and
// `budgetSpent` computed, so the result is drop-in for WEAPONS / the armory.
export function finalizeWeapon(weapon) {
  return {
    ...weapon,
    effects: (weapon.effects || []).map((fx) => ({ ...fx, cost: Math.round(effectCost(fx)) })),
    budgetSpent: weaponCost(weapon),
  };
}
