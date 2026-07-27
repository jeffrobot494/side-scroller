---
status: plan
tags: [weapons, editor]
---

# Weapon Designer — *built*

The editor's Tools → Weapon Designer. Compose a weapon from primitives, watch it
fire in a live preview, price it against a tech-tier budget, and save it — as a
new armory weapon, or back over the built-in you loaded.

This document describes shipped behaviour. The cost model, budget meter and JSON
export are unchanged from the original tool; what follows is the rework that
gave it the full effect vocabulary and a load path.

## What the rework fixed

1. **The designer could express 2 of the 9 effect kinds.** `weaponcost.js`
   prices `damage · burn · slow · knockback · explode · chain` (value) and
   `pellets · pierce · homing` (delivery); the UI offered damage and burn.
   Measured against the arsenal, **18 of 24 weapons could not be expressed** —
   no shotgun, no launcher, no arc gun, nothing that slows.
2. **Nothing could be loaded, including your own saved weapons.** The working
   weapon was a hardcoded literal, `ARSENAL` was never imported, and the saved
   list offered only delete. Every session started from the same default and
   "Save to armory" was one-way.

## Design decisions

- **The tier budget is advisory.** Save works regardless of legality; the
  verdict is a visible readout, not a block. `explode`/`chain` make it easy to
  blow a budget — that stays the author's call.
- **`EFFECT_SCHEMA` is the single vocabulary.** Not a third list beside
  `VALUE_KINDS`/`DELIVERY_KINDS` — those are derived from it.
- **Load-then-save edits the original.** A custom weapon literally; a built-in
  as an override, because `arsenal.js` is source a browser cannot write.

## Part 1 — The effect vocabulary

`EFFECT_SCHEMA` in **`src/game/weaponcost.js`** is the effect vocabulary as
data — one entry per kind, carrying its label, whether it's a value or delivery
effect, its params (each with a label and slider range) and the defaults a fresh
row starts at:

```js
slow: {
  label: "Slow", value: true, defaults: { factor: 0.5, duration: 1.5 },
  params: [
    { key: "factor", label: "Speed ×", min: 0.1, max: 0.95, step: 0.05 },
    { key: "duration", label: "Duration", min: 0.5, max: 8, step: 0.5, unit: "s" },
  ],
},
```

One module stays the source of truth for the designer, the validator and the
Player2 generator, exactly as `enemyspec/schema.js` does for enemies.
`VALUE_KINDS` and `DELIVERY_KINDS` are derived from the `value` flag, so they
cannot drift from the schema, and `newEffect(kind)` is the one place a row is
seeded from.

**Every param carries its own `label`.** Without it the seven added kinds render
raw keys (`factor`, `turn`, `jumps`) and `count` is ambiguous between `pellets`
and `pierce`. The label living in the schema is what makes "a new effect kind is
one entry here and no UI work" true — the same contract as `config.js`.

In `weapon-designer.js`: `effectRow()` renders `EFFECT_SCHEMA[fx.kind].params`
through `sliderMini()`, the `fx-kind` select lists every kind grouped **Value** /
**Delivery**, and a single `+ Effect` menu replaces the old two buttons with the
same grouping. The distinction is real — delivery kinds multiply the others
rather than adding their own per-shot cost — and a flat list would mislead.

### Delivery kinds are at most one each

`deliveryMultiplier()` loops and multiplies **every** matching entry, but the
runtime reads only the first: `.find()` in `ai.js` (pellets) and `combat.js`
(pierce, homing). Two `pellets` rows would triple the priced budget and change
nothing in game. The `+ Effect` menu and the per-row kind select both omit a
delivery kind already present. Value kinds stack legitimately and are
unrestricted.

### Delivery rows show a multiplier, not a cost

`effectCost()` returns 0 for delivery kinds by design. A row reading `cost 0`
beside a budget that just tripled reads as broken, so delivery rows show
`deliveryMultiplier([fx])` — `×5`, `×1.4` — and are drawn with a dashed border.

### Preview

The live preview draws a `pellets` fan: `count` projectiles across the effect's
arc, the same spread `ai.js` produces, with pellets that miss the dummy
vertically flying on past. Damage numbers and the burn flame work as before.

Not visualized: slow, knockback, chain, pierce, homing, and explode radius. The
preview is a feel check for cadence and projectile look, not a combat sim.

## Part 2 — The re-renderable shell

The name input, colour, shape select and the nine `FIELDS` sliders live in
`renderShell()`, called at mount and on load. All three listeners are delegated
on `container` itself, which is never replaced, so nothing needs rebinding.

Two things this makes load-bearing:

- **`canvas` and `ctx` are `let`, re-queried by `syncCanvas()` after every shell
  render.** As `const`, a re-render detaches the canvas node and the preview
  silently stops drawing — no error, just a dead panel.
- **A load is four calls, not three:** `renderEffects()` + `renderSounds()` +
  `renderSaved()` + `refresh()`. `renderShell()` wipes every panel, and dropping
  `renderSaved()` leaves the saved list blank until the next save or delete.

The render/refresh split is unchanged: `refresh()` never rebuilds inputs, so
slider focus survives a drag. Only *load* re-renders the shell.

`resetPreview()` clears `pv` on load — otherwise the previous weapon's rounds
finish their flight and its burn keeps the dummy alight.

## Part 3 — Load, and save in place

A **Load** select in the header lists `ARSENAL` and `listCustomWeapons()`,
grouped, with a `●` on any built-in that carries an override.

**Clone on load, always.** `content.js` builds `WEAPONS` from the same objects
`ARSENAL` holds (`WEAPONS.carbine === ARSENAL_BY_ID.carbine`) and `BLUEPRINTS`
hold direct references, so editing an uncloned entry would mutate live game
content as you drag a slider.

### `adoptWeapon()`

Every handler closes over the working weapon, so it is filled **in place**.
`Object.assign` alone fails three ways, each visible on the first real load:

- it never removes keys — `sounds` from `concussion_gun` would stick to the next
  weapon loaded, as would `tier`;
- it replaces `projectile` wholesale, and 14 of the 24 arsenal weapons omit
  `projectile.gravity`, so the slider would read `undefined` → `NaN`;
- arsenal entries are finalized, carrying derived `cost` / `budgetSpent` the
  working copy must not hold stale.

So `adoptWeapon()` clears the target, fills from `blankWeapon()`, overlays the
source, merges `projectile` rather than replacing it, and strips the derived
values.

### The id lifecycle

`resolveId(name, loadedId)`: a **new** weapon's id tracks its name, as it always
has; a **loaded** one keeps the id it was loaded under.

Pinning is what makes save-in-place work. Two arsenal names don't slug back to
their own id — "Field Carbine" → `field_carbine` (not `carbine`, the starting
weapon) and "Sidearm Mk.II" → `sidearm_mk_ii` (not `sidearm`) — and any custom
weapon minted `<base>_2` by `uniqueId()` re-slugs to `<base>`. Unpinned, each of
those silently saves a duplicate instead of overwriting what you loaded.

A first save of a new weapon pins the id it was minted under, so the second save
overwrites rather than minting `_2`. **Save as new** clears the pin and forks
whatever is loaded into a new custom weapon named by the name field.

### Saving over a custom weapon

Literally. `saveInto()` in `customcontent.js` already upserts when the id matches
an existing custom entry; loading plus the pinned id was the whole fix, with no
storage change.

### Saving over a built-in: the override layer

`src/game/weaponoverrides.js`, key `sidescroller.weaponoverrides.v1`.

**A separate store from the custom weapons, deliberately.** The obvious approach
— save the built-in id into the custom store and bypass the anti-shadow rule —
breaks the armory: `createState()` builds
`[structuredClone(WEAPONS.carbine), ...listCustomWeapons()]`, so an override
with id `carbine` produces **two** `carbine` entries and `hub.js`'s `.find()`
hits the built-in clone, ignoring the override. A separate store avoids that
entirely and leaves `uniqueId()`'s anti-shadow rule intact for every genuinely
new weapon — no bypass anywhere.

It imports `ARSENAL_BY_ID` from `arsenal.js`, which depends only on
`weaponcost.js`, so there is **no import cycle** and `content.js` is untouched.

- **An override is the weapon's whole shape, not a patch.** The designer only
  ever saves a complete working copy, and Copy JSON → paste into `arsenal.js`
  means that JSON has to stand on its own. `applyOne()` clears the live object
  and assigns; a bare `Object.assign` could never remove a key the built-in had
  (drop `sounds` from `concussion_gun` and it would come straight back) and
  would make re-applying cumulative.
- **Applied by mutating in place**, never by rebuilding the map. `BLUEPRINTS`
  capture `WEAPONS.incinerator` and friends by reference at module-eval time, so
  a replaced map would leave them pointing at the pre-override object. In-place
  mutation is what `config.js` already does, and because `WEAPONS` values *are*
  the `ARSENAL` objects, one mutation covers both maps.
- **A pristine snapshot is taken before the first mutation.** Applying destroys
  the original in memory, so a module-level `Map` holds a `structuredClone` of
  each entry as first seen. Revert restores it — no reload needed.
- **`applyWeaponOverrides()` is called from both pages**, explicitly rather than
  as an import side effect: `createState()` for the game (before the armory
  line, so the clone picks it up) and `editor.js` at boot. The editor needs its
  own call because the Firing Room reads `ARSENAL` straight from `arsenal.js`
  and never builds a state — without it, the tool that authored an override
  would sit on a page that doesn't show it. It is idempotent.

An **"overrides built-in"** badge appears in the header readout, on the
Overridden-built-ins list, and as a `●` in the Load select; **Revert** is
available from the header and from that list. A silently modified built-in is a
bad failure mode. Once overrides are applied on the editor page, loading that
built-in loads the *overridden* version — that is the intent, and the badge is
what makes it legible.

**Copy JSON → paste into `arsenal.js` remains the way to make any change
permanent**, per the standing convention in `CLAUDE.md`: the override layer is
for iterating by ear, the paste is for committing.

## Verification

`test/weapondesign.test.mjs` (57 assertions) plus a headless load in
`test/tools.test.mjs`. Suite total: **750**.

- Schema: nine kinds; each priced on exactly one side (value through
  `effectCost`, delivery through `deliveryMultiplier`, never both); every kind
  and param labelled; every range usable; defaults matching their params and
  sitting inside their own ranges.
- **All 25 shipped weapons round-trip** through the schema — 24 player weapons
  plus the enemy `plasma`, since the schema is the cost vocabulary they are all
  priced by, even though the Load list only offers `ARSENAL`. No unknown kinds,
  no undeclared params, no authored value outside its slider range. This is the
  direct measure of the 18/24 gap closing.
- Adopt: a missing `projectile.gravity` is filled; stale `sounds`/`tier` do not
  survive the next load; derived `cost`/`budgetSpent` are stripped; the object
  identity handlers close over is preserved; edits to the copy leave the
  `ARSENAL` entry untouched.
- Id lifecycle: `carbine` and `sidearm` stay pinned under a rename, a minted
  `_2` id is not re-slugged, a new weapon still tracks its name.
- Overrides: patching a built-in is visible through `WEAPONS` and `BLUEPRINTS`
  (same object); a dropped key is actually dropped; applying twice is
  idempotent; a fresh `createState()` armory carries the override and holds
  exactly one entry per id; a new custom weapon named after a built-in still
  gets `_2`.
- Revert: restores the built-in in the same session, including a dropped key,
  and is a no-op the second time.
- Serve-check: changed files return 200.

**Not covered headlessly, verify by eye:** that the re-rendered canvas is the
one being drawn into. The harness's `querySelector` hands back a fresh mock
every call, so a stale `ctx` is invisible to it — load a built-in, drag a
slider, and confirm the preview still animates.
