# Weapon Designer — rework plan

Status: designed, unbuilt. **Parked until the sound system (`SOUND.md` Slices 3–4)
is finished.** Not a rewrite — the cost model, live preview, budget meter, JSON
export and the sound section all stay exactly as they are.

## Context

Two gaps surfaced while wiring per-weapon sound gain (`SOUND.md` Slice 2):

1. **The designer can express 2 of the 9 effect kinds.** `weaponcost.js` prices
   `damage · burn · slow · knockback · explode · chain` (value) and
   `pellets · pierce · homing` (delivery). The effect UI offers damage and burn.
   Measured against the real arsenal: **18 of 24 weapons cannot be expressed.**
   You cannot design a shotgun, a launcher, an arc gun, or anything that slows.
   (Flagged in `CLAUDE.md` as a known gap; the 18/24 figure is what it costs.)
2. **Nothing can be loaded — including your own saved weapons.** The working
   weapon is a hardcoded literal at `weapon-designer.js:43`; `ARSENAL` is never
   imported and the saved list offers only delete. Every session starts from the
   same default and "Save to armory" is one-way.

(1) is where the value is and is worth doing even if (2) is never built.

## Decisions taken

- **The tier budget stays advisory.** Save continues to work regardless of
  legality; the verdict stays a visible readout. Adding `explode`/`chain` makes
  it easy to blow a budget — that stays the author's call, not a block.
- **Load-then-save edits the original, not a copy.** See Part 3 for what that
  can and cannot mean for a built-in.

## Part 1 — Effect vocabulary (2 → 9 kinds)

The only bespoke part of an effect row is its parameters, so make those data.

Export an `EFFECT_SCHEMA` from **`src/game/weaponcost.js`** — it already owns the
vocabulary (`VALUE_KINDS` / `DELIVERY_KINDS`), so one module stays the source of
truth for the designer, the validator and the Player2 generator, exactly as
`enemyspec/schema.js` does for enemies:

```js
export const EFFECT_SCHEMA = {
  damage:    { label: "Damage",    value: true,  defaults: { amount: 10 },
               params: [{ key: "amount", min: 1, max: 60, step: 1 }] },
  slow:      { label: "Slow",      value: true,  defaults: { factor: 0.5, duration: 1.5 },
               params: [{ key: "factor", min: 0.1, max: 0.95, step: 0.05 },
                        { key: "duration", min: 0.5, max: 8, step: 0.5, unit: "s" }] },
  pellets:   { label: "Pellets",   value: false, defaults: { count: 5, spread: 0.13 },
               params: [{ key: "count", min: 2, max: 12, step: 1 },
                        { key: "spread", min: 0.02, max: 0.3, step: 0.01, unit: "rad" }] },
  // … burn, knockback, explode, chain, pierce, homing
};
```

Then in **`weapon-designer.js`**:

- `effectRow()` renders `EFFECT_SCHEMA[fx.kind].params` through the existing
  `sliderMini()` instead of the hardcoded damage/burn branch.
- The `fx-kind` `<select>` lists every schema key; switching kind seeds
  `defaults` (replacing today's damage/burn ternary).
- Replace the two `+ Damage` / `+ Burn` buttons with one `+ Effect` control that
  offers every kind, grouped **Value** vs **Delivery** (`value: true/false`) —
  the distinction is real: delivery kinds multiply the others rather than adding
  their own per-shot cost, and mixing them in one flat list misleads.
- Ranges come from the schema, so a new effect kind is one entry here and needs
  no UI work — the same "add a knob, get a control" contract as `config.js`.

Reuse `effectCost()` for the per-row cost chip; it already prices all nine (a
delivery kind returns 0 there and is priced as a multiplier in `weaponCost`).
Worth surfacing that in the row so a `0` reads as intentional, not broken.

## Part 2 — Make the shell re-renderable

The blocker for Part 3, and small on its own.

The name input, colour, shape select and the nine `FIELDS` sliders are baked into
the one-shot `container.innerHTML` at mount; only derived readouts refresh.

- Extract that markup into `renderShell()` and call it at mount and on load.
  Safe: all three listeners are delegated on `container` itself, which is never
  replaced.
- **`canvas` and `ctx` must become `let` and be re-queried after each shell
  render.** They are captured as `const` today; re-rendering detaches that canvas
  node and the live preview silently stops drawing — no error, just a dead panel.
- Keep the existing render/refresh split (`refresh()` never rebuilds inputs, so
  slider focus survives a drag). Only *load* re-renders the shell.

## Part 3 — Load, and save in place

Add a **Load** `<select>` to the header, grouped `Arsenal` / `Custom`, listing
`ARSENAL` and `listCustomWeapons()`. On change: `Object.assign(weapon,
structuredClone(chosen))` then `renderShell()` + `renderEffects()` +
`renderSounds()` + `refresh()`.

**Clone on load, always.** `ARSENAL` entries are the same objects the running
game reads (`content.js` builds `WEAPONS` from them and `BLUEPRINTS` hold direct
references), so editing without cloning would mutate live game content as you
drag a slider.

### What "edit the original" means

- **A custom weapon: literally.** `saveInto()` in `customcontent.js` already
  upserts when the id matches an existing custom entry, so loading `my_gun` and
  saving overwrites it. **No change needed** — loading is the only missing piece.
- **A built-in: an override, because the original is source.** A browser cannot
  write `arsenal.js`. Two honest options:

  **(a) Override layer (recommended, matches the repo's config/bank pattern).**
  Save a built-in id into the custom store and apply it over the built-in at
  startup. Requires three specific changes, each with a trap:

  - `uniqueId()` currently guarantees a custom entry can **never** shadow a
    built-in (`taken = reserved ∪ custom ids` → `scattergun_2`). Saving a loaded
    built-in must bypass that and keep the id. Keep the anti-shadow rule for
    genuinely *new* weapons so an accidental name clash still can't hijack a
    built-in; only an explicit load-then-save may claim the id.
  - **Apply by mutating in place** — `Object.assign(WEAPONS[id], override)` —
    not by rebuilding the map. `BLUEPRINTS` capture `WEAPONS.incinerator` and
    friends by reference at module-eval time, so a replaced map would leave them
    pointing at the pre-override object. In-place mutation is also exactly what
    `config.js` already does ("mutated in place so importers see changes").
  - **Watch the import cycle.** `customcontent.js` imports `WEAPONS` from
    `content.js`; having `content.js` apply overrides would close a loop. Fix by
    importing `ARSENAL` from `arsenal.js` directly (it depends only on
    `weaponcost.js`), or by applying overrides from `state.js` at `createState()`.

  Needs a visible **"overrides built-in"** badge on the row and a **Revert**
  that deletes the override — a silently modified built-in is a bad failure mode.

  **(b) Copy JSON → paste into `arsenal.js`.** Truly edits the original, no
  runtime machinery, manual. Remains the way to make any change permanent, per
  the standing convention in `CLAUDE.md`.

Ship (a) *and* keep (b) documented: (a) for iterating by ear, (b) for committing.

## Verification

- `node test/run.mjs` green (656 today).
- New assertions: every `EFFECT_SCHEMA` kind is priced by `effectCost` and every
  kind in `VALUE_KINDS ∪ DELIVERY_KINDS` has a schema entry (the same
  both-directions integrity check `audio.test.mjs` runs over cues vs bank); each
  kind's `defaults` validate; **all 24 arsenal weapons round-trip** through the
  schema — the direct measure of the 18/24 gap closing.
- Load path: loading a built-in and mutating the working copy leaves the
  `ARSENAL` entry untouched (the clone-on-load guarantee); saving a loaded custom
  weapon upserts rather than minting `_2`; an override applies over the built-in
  and Revert removes it.
- `test/tools.test.mjs` mount/dispose still passes; add a headless load to prove
  `renderShell()` re-render leaves a live canvas (guards the `let ctx` trap).
- Serve-check changed files return 200.
- **By eye:** load a built-in, drag a slider, confirm the preview still animates
  (the canvas-reference trap is invisible to headless tests).
