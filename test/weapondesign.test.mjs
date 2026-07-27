// ---------------------------------------------------------------------------
// WEAPON DESIGNER REWORK — the effect vocabulary, the load path, and the
// built-in override layer (docs/WEAPON-DESIGNER.md).
//
// The three things this guards that headless tests CAN see:
//   1. EFFECT_SCHEMA covers the whole priced vocabulary and every shipped
//      weapon round-trips through it — the direct measure of the old 2-of-9 gap.
//   2. Loading fills the keys a built-in omits and drops the ones it shouldn't
//      carry, and a loaded weapon's id stays pinned so Save overwrites.
//   3. An override patches the shared arsenal object in place (so BLUEPRINTS
//      and the armory see it), Revert puts the original back, and the custom
//      store's anti-shadow rule is untouched by any of it.
//
// The canvas-liveness trap after a shell re-render is NOT observable here (the
// harness's querySelector hands back a fresh mock every call) — that one stays
// an eyeball check, per the doc.
// ---------------------------------------------------------------------------

import { installDom, makeEl } from "./harness.mjs";
import {
  EFFECT_SCHEMA,
  EFFECT_KINDS,
  effectCost,
  deliveryMultiplier,
  newEffect,
  isDeliveryKind,
  finalizeWeapon,
} from "../src/game/weaponcost.js";
import { ARSENAL, ARSENAL_BY_ID, ENEMY_WEAPONS } from "../src/game/arsenal.js";
import { WEAPONS, BLUEPRINTS } from "../src/game/content.js";
import { saveCustomWeapon } from "../src/game/customcontent.js";
import {
  applyWeaponOverrides,
  saveOverride,
  deleteOverride,
  isOverridden,
  listOverrides,
} from "../src/game/weaponoverrides.js";
import { blankWeapon, adoptWeapon, resolveId, createWeaponDesigner } from "../src/editor/tools/weapon-designer.js";
import { createState } from "../src/game/state.js";

export default async function run(t) {
  installDom();

  // ---- 1. schema integrity ------------------------------------------------

  t.eq("schema: nine kinds", EFFECT_KINDS.length, 9);

  let priced = 0, labelled = 0, ranged = 0, defaulted = 0;
  for (const kind of EFFECT_KINDS) {
    const spec = EFFECT_SCHEMA[kind];
    const fx = newEffect(kind);
    // Every kind is priced SOMEWHERE: value kinds through effectCost, delivery
    // kinds as a multiplier. A kind priced by neither is dead vocabulary.
    const byCost = effectCost(fx) > 0;
    const byMult = deliveryMultiplier([fx]) > 1;
    if (spec.value ? byCost && !byMult : byMult && effectCost(fx) === 0) priced++;
    if (spec.label && spec.params.every((p) => p.label)) labelled++;
    if (spec.params.every((p) => p.min < p.max && p.step > 0)) ranged++;
    // defaults and params describe the same set of keys, and the defaults sit
    // inside their own ranges (a row that opens out of bounds is a bad seed).
    const keys = spec.params.map((p) => p.key).sort();
    const dkeys = Object.keys(spec.defaults).sort();
    const inRange = spec.params.every((p) => {
      const v = spec.defaults[p.key];
      return typeof v === "number" && v >= p.min && v <= p.max;
    });
    if (JSON.stringify(keys) === JSON.stringify(dkeys) && inRange) defaulted++;
  }
  t.eq("schema: every kind is priced on exactly one side", priced, 9);
  t.eq("schema: every kind and param carries a label", labelled, 9);
  t.eq("schema: every param has a usable range", ranged, 9);
  t.eq("schema: defaults match params and sit in range", defaulted, 9);

  t.eq(
    "schema: value/delivery split matches isDeliveryKind",
    EFFECT_KINDS.filter((k) => isDeliveryKind(k)).sort(),
    ["homing", "pellets", "pierce"]
  );

  // ---- 2. every shipped weapon round-trips through the schema -------------
  // The direct measure of the 18-of-24 gap closing: if the designer can render
  // a row for every effect on every weapon, it can express every weapon.
  // `kind` and `cost` are structural (cost is derived by finalizeWeapon).

  const all = [...ARSENAL, ...ENEMY_WEAPONS];
  t.eq("arsenal: 24 player weapons + 1 enemy weapon", all.length, 25);

  const unknownKinds = [], unknownParams = [], outOfRange = [];
  for (const w of all) {
    for (const fx of w.effects || []) {
      const spec = EFFECT_SCHEMA[fx.kind];
      if (!spec) { unknownKinds.push(`${w.id}:${fx.kind}`); continue; }
      for (const key of Object.keys(fx)) {
        if (key === "kind" || key === "cost") continue;
        const p = spec.params.find((x) => x.key === key);
        if (!p) { unknownParams.push(`${w.id}:${fx.kind}.${key}`); continue; }
        if (fx[key] < p.min || fx[key] > p.max) outOfRange.push(`${w.id}:${fx.kind}.${key}=${fx[key]}`);
      }
    }
  }
  t.eq("round-trip: no unknown effect kinds", unknownKinds, []);
  t.eq("round-trip: no undeclared effect params", unknownParams, []);
  t.eq("round-trip: every authored value is inside its slider range", outOfRange, []);

  // ---- 3. adoptWeapon fills, clears, and strips ---------------------------

  const work = blankWeapon();

  // 14 of 24 arsenal entries omit projectile.gravity; a bare Object.assign
  // leaves the slider reading `undefined` → NaN.
  adoptWeapon(work, ARSENAL_BY_ID.sidearm);
  t.ok("adopt: missing projectile.gravity is filled from the blank", typeof work.projectile.gravity === "number");
  t.eq("adopt: source projectile values win", work.projectile.speed, 840);
  t.eq("adopt: id comes across", work.id, "sidearm");

  // concussion_gun is one of the two weapons carrying `sounds`; loading it and
  // then a weapon without one must not leave the key behind.
  adoptWeapon(work, ARSENAL_BY_ID.concussion_gun);
  t.ok("adopt: sounds arrives with the weapon that has it", !!work.sounds);
  adoptWeapon(work, ARSENAL_BY_ID.sidearm);
  t.ok("adopt: stale sounds does not survive the next load", work.sounds === undefined);

  // tier is arsenal-only metadata; it must not stick to the next weapon either
  adoptWeapon(work, blankWeapon());
  t.ok("adopt: stale tier does not survive", work.tier === undefined);

  // derived values are recomputed by finalizeWeapon, never carried
  adoptWeapon(work, ARSENAL_BY_ID.scattergun);
  t.ok("adopt: per-effect cost is stripped", work.effects.every((fx) => fx.cost === undefined));
  t.ok("adopt: budgetSpent is stripped", work.budgetSpent === undefined);
  t.eq("adopt: pellets came through", work.effects.filter((fx) => fx.kind === "pellets").length, 1);

  // identity is preserved — every event handler closes over this object
  const before = work;
  adoptWeapon(work, ARSENAL_BY_ID.railgun);
  t.ok("adopt: mutates in place (handlers keep working)", work === before);

  // loading does not touch live game content
  const railgunName = ARSENAL_BY_ID.railgun.name;
  work.name = "Scribbled Over";
  work.effects[0].amount = 1;
  t.eq("adopt: the ARSENAL entry is untouched by edits to the copy", ARSENAL_BY_ID.railgun.name, railgunName);
  t.eq("adopt: the ARSENAL entry keeps its own effect values", ARSENAL_BY_ID.railgun.effects[0].amount, 60);

  // ---- 4. the id lifecycle ------------------------------------------------
  // Two arsenal names don't slug back to their own id; both are weapons you'd
  // plausibly want to rebalance, and `carbine` is the starting weapon.

  t.eq("id: a new weapon's id follows its name", resolveId("Field Carbine", null), "field_carbine");
  t.eq("id: a loaded built-in keeps its id when renamed", resolveId("Field Carbine", "carbine"), "carbine");
  t.eq("id: Sidearm Mk.II stays sidearm", resolveId("Anything At All", "sidearm"), "sidearm");
  t.eq("id: a minted _2 custom id is not re-slugged", resolveId("Scattergun", "scattergun_2"), "scattergun_2");
  t.eq("id: a nameless new weapon still gets a fallback", resolveId("", null), "custom_weapon");

  // ---- 5. the designer's load seam ---------------------------------------

  const tool = createWeaponDesigner(makeEl(), () => {});
  t.ok("designer: exposes a load seam", typeof tool.load === "function");
  t.ok("designer: load rejects an unknown id", tool.load("builtin", "no_such_weapon") === false);

  t.ok("designer: loads a built-in", tool.load("builtin", "carbine") === true);
  let cur = tool.current();
  t.eq("designer: tracks what was loaded", [cur.loadedId, cur.loadedOrigin], ["carbine", "builtin"]);
  t.eq("designer: working copy took the built-in's id", cur.weapon.id, "carbine");
  t.eq("designer: working copy took the built-in's name", cur.weapon.name, "Field Carbine");
  t.ok("designer: working copy is not the ARSENAL object", cur.weapon !== ARSENAL_BY_ID.carbine);
  tool.dispose();

  // ---- 6. overrides -------------------------------------------------------

  t.ok("override: refuses a weapon that isn't a built-in", saveOverride({ id: "not_a_builtin" }).ok === false);
  t.eq("override: store starts empty", listOverrides(), {});

  // Patch a built-in and confirm the SHARED object changed — content.js builds
  // WEAPONS from these very objects and BLUEPRINTS hold direct references.
  const patched = finalizeWeapon({
    ...structuredClone(ARSENAL_BY_ID.incinerator),
    name: "Incinerator Mk.II",
    effects: [{ kind: "damage", amount: 12 }, { kind: "burn", dps: 9, duration: 3 }],
  });
  const saved = saveOverride(patched);
  t.ok("override: saves against a built-in id", saved.ok && saved.id === "incinerator");
  t.ok("override: isOverridden reports it", isOverridden("incinerator"));
  t.eq("override: the ARSENAL entry is patched", ARSENAL_BY_ID.incinerator.name, "Incinerator Mk.II");
  t.ok("override: WEAPONS is the same object, so it sees it", WEAPONS.incinerator === ARSENAL_BY_ID.incinerator);
  t.eq(
    "override: BLUEPRINTS hold the reference, so they see it too",
    BLUEPRINTS.find((b) => b.id === "bp_incinerator").weapon.name,
    "Incinerator Mk.II"
  );
  t.eq("override: budget is recomputed from the patched effects", ARSENAL_BY_ID.incinerator.effects[0].amount, 12);

  // An override is the weapon's WHOLE shape, not a layer on top of the
  // original: dropping a key must actually drop it. concussion_gun ships
  // `sounds.fire`; an override without one has to remove it.
  t.ok("override: concussion_gun ships a sounds block", !!ARSENAL_BY_ID.concussion_gun.sounds);
  const noSounds = structuredClone(ARSENAL_BY_ID.concussion_gun);
  delete noSounds.sounds;
  saveOverride(finalizeWeapon(noSounds));
  t.ok("override: a dropped key is actually removed", ARSENAL_BY_ID.concussion_gun.sounds === undefined);

  // Re-applying is not cumulative and does not drift.
  applyWeaponOverrides();
  applyWeaponOverrides();
  t.eq("override: applying twice is idempotent", ARSENAL_BY_ID.incinerator.name, "Incinerator Mk.II");
  t.ok("override: applying twice keeps the dropped key dropped", ARSENAL_BY_ID.concussion_gun.sounds === undefined);

  // The armory must carry the override AND contain exactly one entry per id —
  // the bug a shared store with customcontent.js would have caused.
  const s = createState();
  const carbines = s.armory.filter((w) => w.id === "carbine");
  t.eq("armory: exactly one entry per weapon id", carbines.length, 1);
  saveOverride(finalizeWeapon({ ...structuredClone(ARSENAL_BY_ID.carbine), name: "Field Carbine A2" }));
  t.eq("armory: a fresh state picks the override up", createState().armory[0].name, "Field Carbine A2");

  // The anti-shadow rule is untouched: a genuinely NEW weapon still can't claim
  // a built-in id, because overrides never went near the custom store.
  const shadow = saveCustomWeapon({ id: "carbine", name: "Field Carbine", effects: [] });
  t.eq("anti-shadow: a new custom weapon still can't claim a built-in id", shadow.id, "carbine_2");

  // ---- 7. revert ----------------------------------------------------------

  t.ok("revert: removes the override", deleteOverride("incinerator").ok);
  t.eq("revert: the built-in is back, in the same session", ARSENAL_BY_ID.incinerator.name, "Incinerator");
  t.eq("revert: its effects are the authored ones", ARSENAL_BY_ID.incinerator.effects[0].amount, 8);
  t.eq(
    "revert: BLUEPRINTS see the restoration too",
    BLUEPRINTS.find((b) => b.id === "bp_incinerator").weapon.name,
    "Incinerator"
  );
  t.ok("revert: a dropped key comes back", !!(deleteOverride("concussion_gun").ok && ARSENAL_BY_ID.concussion_gun.sounds));
  t.ok("revert: reverting twice is a no-op", deleteOverride("incinerator").ok === false);

  deleteOverride("carbine");
  t.eq("revert: the arsenal is pristine again", listOverrides(), {});
  t.eq("revert: carbine is back to its authored name", ARSENAL_BY_ID.carbine.name, "Field Carbine");
}
