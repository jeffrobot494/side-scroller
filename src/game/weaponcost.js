// ---------------------------------------------------------------------------
// WEAPON COST MODEL — the balance backbone (GDD §5.1).
//
// Every weapon's `budgetSpent` is derived from its effects, scaled by fire rate,
// projectile size, and spread; a weapon is legal at a tier if budgetSpent <= that
// tier's budget. This is the hard guardrail the Weapon Designer enforces and the
// Player2 generator validates against — one formula, one source of truth.
//
// Two kinds of effect:
//   VALUE effects deal something on hit and carry a per-shot cost:
//     damage {amount} · burn {dps,duration} · slow {factor,duration}
//     knockback {force} · explode {amount,radius} · chain {amount,jumps,range}
//   DELIVERY modifiers change how the shot is delivered and act as MULTIPLIERS
//   on the per-shot value (they make the same effects land more/harder):
//     pellets {count,spread} · pierce {count} · homing {turn}
//
// Constants are grouped and tunable; treat K as the dials that rebalance the
// whole arsenal at once.
// ---------------------------------------------------------------------------

const K = {
  global: 1.0, // overall price scaler
  burn: 0.75, // burn (DoT) discounted vs. instant damage
  sizeRef: 2200, // bigger projectiles are easier to land → pricier
  spreadRelief: 1.5, // more spread → less accurate → cheaper
  // value-effect weights
  slow: 26, // per (1-factor)·duration — crowd control is valuable
  knockback: 0.03, // per unit of force
  explodeBase: 0.9, // AoE multiplier on its amount
  explodeRadius: 220, // radius that doubles an explosion's value
  chain: 0.85, // per (amount·jumps) — near-guaranteed extra hits
  // delivery multipliers
  pierce: 0.4, // + per pierced target
  homing: 0.35, // + fraction for auto-steering
};

export const TIERS = [
  { id: "t1", name: "Tier I · Standard", budget: 100 },
  { id: "t2", name: "Tier II · Advanced", budget: 180 },
  { id: "t3", name: "Tier III · Prototype", budget: 280 },
];

const VALUE_KINDS = new Set(["damage", "burn", "slow", "knockback", "explode", "chain"]);
const DELIVERY_KINDS = new Set(["pellets", "pierce", "homing"]);

export function isValueEffect(fx) {
  return VALUE_KINDS.has(fx.kind);
}
export function isDeliveryEffect(fx) {
  return DELIVERY_KINDS.has(fx.kind);
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// Per-shot cost of a single VALUE effect (delivery modifiers return 0 here; they
// are priced as multipliers in weaponCost).
export function effectCost(fx) {
  switch (fx.kind) {
    case "damage":
      return Math.max(0, fx.amount || 0);
    case "burn":
      return Math.max(0, (fx.dps || 0) * (fx.duration || 0) * K.burn);
    case "slow":
      return Math.max(0, (1 - clamp(fx.factor ?? 1, 0, 1)) * (fx.duration || 0) * K.slow);
    case "knockback":
      return Math.max(0, (fx.force || 0) * K.knockback);
    case "explode":
      return Math.max(0, (fx.amount || 0) * (0.8 + (fx.radius || 0) / K.explodeRadius) * K.explodeBase);
    case "chain":
      return Math.max(0, (fx.amount || 0) * (fx.jumps || 0) * K.chain);
    default:
      return 0;
  }
}

// Delivery modifiers multiply the per-shot value (pellets N× the whole effect
// set, pierce adds value per extra target, homing for the accuracy aid).
export function deliveryMultiplier(effects) {
  let m = 1;
  for (const fx of effects || []) {
    if (fx.kind === "pellets") m *= Math.max(1, fx.count || 1);
    else if (fx.kind === "pierce") m *= 1 + K.pierce * (fx.count || 0);
    else if (fx.kind === "homing") m *= 1 + K.homing;
  }
  return m;
}

// Per-shot "damage equivalent" (instant + full burn + explode + chain totals),
// times the pellet count, for DPS math and readouts.
export function perShotDamage(weapon) {
  let d = 0;
  for (const fx of weapon.effects || []) {
    if (fx.kind === "damage") d += fx.amount || 0;
    else if (fx.kind === "burn") d += (fx.dps || 0) * (fx.duration || 0);
    else if (fx.kind === "explode") d += fx.amount || 0;
    else if (fx.kind === "chain") d += (fx.amount || 0) * (fx.jumps || 0);
  }
  const pellets = (weapon.effects || []).find((fx) => fx.kind === "pellets");
  return d * (pellets ? Math.max(1, pellets.count || 1) : 1);
}

export function dps(weapon) {
  return perShotDamage(weapon) * (weapon.fireRate || 0);
}

// The weapon's budget_spent: per-shot value × delivery multiplier × rate × size,
// minus a little for spread. This is the number compared against a tier budget.
export function weaponCost(weapon) {
  const effects = weapon.effects || [];
  const perShot = effects.reduce((s, fx) => s + effectCost(fx), 0);
  const mult = deliveryMultiplier(effects);
  const p = weapon.projectile || {};
  const sizeFactor = 1 + ((p.w || 0) * (p.h || 0)) / K.sizeRef;
  const spreadFactor = 1 / (1 + (weapon.spread || 0) * K.spreadRelief);
  return Math.round(perShot * mult * (weapon.fireRate || 0) * sizeFactor * spreadFactor * K.global);
}

export function validate(weapon, budget) {
  const spent = weaponCost(weapon);
  return { spent, budget, legal: spent <= budget, over: Math.max(0, spent - budget) };
}

// Cheapest legal tier for a weapon, or null if it exceeds every tier.
export function tierFor(weapon) {
  const spent = weaponCost(weapon);
  return TIERS.find((t) => spent <= t.budget) || null;
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
