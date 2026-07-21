// Arsenal: all 24 weapons are legal, non-degenerate, and sit in their tier.
import { ARSENAL } from "../src/game/arsenal.js";
import { weaponCost, tierFor, isValueEffect, TIERS } from "../src/game/weaponcost.js";

const TIER_BUDGET = { 1: 100, 2: 180, 3: 280 };

export default async function run(t) {
  t.ok("arsenal has 24 weapons", ARSENAL.length === 24);
  t.ok("ids unique", new Set(ARSENAL.map((w) => w.id)).size === ARSENAL.length);

  const byTier = { 1: 0, 2: 0, 3: 0 };
  for (const w of ARSENAL) {
    const cost = weaponCost(w);
    byTier[w.tier] = (byTier[w.tier] || 0) + 1;
    t.ok(`${w.id}: budgetSpent > 0`, w.budgetSpent > 0 && cost === w.budgetSpent);
    t.ok(`${w.id}: has a value effect`, (w.effects || []).some(isValueEffect));
    t.ok(`${w.id}: legal at its tier (${cost} ≤ ${TIER_BUDGET[w.tier]})`, cost <= TIER_BUDGET[w.tier]);
    t.ok(`${w.id}: legal at some tier`, tierFor(w) !== null);
    t.ok(`${w.id}: per-effect costs filled`, (w.effects || []).every((fx) => typeof fx.cost === "number"));
  }
  t.ok("all three tiers populated", byTier[1] > 0 && byTier[2] > 0 && byTier[3] > 0);

  // Print the cost table for eyeballing balance.
  const rows = ARSENAL.map((w) => `T${w.tier} ${String(weaponCost(w)).padStart(3)}  ${w.id}`).sort();
  console.log("    " + rows.join("\n    "));
}
