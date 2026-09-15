---
type: tech
category: game-data
status: unbuilt
resolution: sharp
needs: []
related: [soldier-progression, server-settings, multiplayer-session, multiplayer-missions]
---

# Soldier progression

How soldiers earn XP on a successful extraction and grow from it, built as a pure derivation from authored stats and lifetime XP over the campaign's rules.

## Slices

| Slice | Deliverable | Runtime behaviour |
|---|---|---|
| P1 | `src/game/progression.js`: the shipped definition, its validator, and the pure derivation (lifetime XP → level, XP into level, next cost or MAX; level → grants; cumulative bonuses; effective stats). Every recruit in `RECRUIT_POOL` carries a primary and secondary, rolled once (uniform, repeats allowed) and committed as authored data. `test/progression.test.mjs` | **None.** Nothing reads it yet |
| P2 | The campaign earns. The world holds a copy of the definition taken when it is created. Each lead gets its XP reward stamped on it when generated (four new server-scoped `SCHEMA` knobs). `applyMissionResult` pays each eligible survivor, once, and applies the level-up health policy. `soldierMaxHp` adds the flat HP bonus. `projectDispatch` sends effective stats and the resolved HP bonus. The hub's stat bars and HP lines (Barracks and Deploy cards) read effective stats. Every `missionResult` answer carries the award report. The view carries the campaign's definition, and each projected lead carries `xpReward` | **Yes.** Soldiers level up and get stronger in missions. The hub's existing numbers change; nothing new is printed |
| P3 | The player sees it. Barracks cards show level, XP into this level, XP to next or MAX, and primary/secondary labels. Recruit and Deploy cards show the labels. Soldier details are a small addition to the roster card itself, not a separate screen: starting → final value where a bonus applies, and the next level's gains. The Ops lead row, Deploy header and Results screen print the mission's XP reward. Results also print XP earned, old → new level and combined gains per survivor | **Yes, visible** |
| P4 | Editor Tools → **Progression**: edit the curve (per-transition costs, start level and XP, max level), growth rules (add/remove/edit rows), per-level overrides, attribute caps, recruit assignments, eligibility, keep-XP-at-cap, health policy. Base HP and HP per Health shown and edited through `config.js`'s own override path (not a second copy of either default). Live preview of the full level table, cumulative bonuses and an example soldier. Field-level errors, and invalid data never replaces working data. A guarded localStorage override store applied before the world's snapshot is taken, Revert, and Copy JSON to make it permanent | **Yes**, for campaigns started after a save |

Each slice lands alone. P1 is pure and imported by nothing else. P2 is complete without any new UI because the existing HP and stat readouts already show the growth. P3 reads only what P2 produces. P4 edits a definition that P1–P3 already read from one place.

## Reuses

| Existing | Reuse |
|---|---|
| `src/game/soldiers.js` | `soldierMaxHp` stays the one HP formula for the hub and `Soldier` (`src/mission/entities.js`); P2 adds the flat progression HP to it (see The seam for how it gets the bonus without a definition). `RECRUIT_POOL` holds the authored primary/secondary. `dealRecruits` deep-clones, so the new fields reach every base with no change |
| `src/game/state.js` `applyMissionResult` | Where settlement already happens, per commander. Casualties are marked dead before the survivor loop and filtered out after it, and an award keyed off `result.survivors` never touches a casualty. The `completedMissions.includes` guard is already "once per commander per mission". XP is paid inside it |
| `src/game/state.js` `missionOf` | Already copies the fields settlement reads off the lead (`difficulty`, `threatReward`) into `world.reports`, so a joint mission's second report still finds them. `xpReward` is one more copied field |
| `src/game/gen/levelgen.js` `threatRewardFor` | The precedent for "fixed when offered": a per-difficulty knob stamped onto the lead at generation. XP rewards use the same shape |
| `src/game/state.js` `createWorld` / `createPlayerState` | `createWorld` is where a copy of the definition is taken, once for all commanders. `createPlayerState` runs `applyWeaponOverrides()` and `applyEnemyRoster()`, but `createState()` calls `createWorld()` **first**, so P4's `applyProgressionOverrides()` must run in `createWorld` before the copy, not beside the other two |
| `wounds` (damage taken, not current HP) | The default `preserveWounds` policy needs no code: max HP rises and `maxHp - wounds` rises with it. `Soldier` already clamps a deploying soldier to at least 1 HP |
| `src/game/session.js` `projectDispatch` | Already the only path soldier data takes into a mission. Single-player and hot-seat get the projected dispatch from `takeRound`, and rooms get it through `toWire`. Effective stats replace authored stats here, and the mission never learns progression exists |
| `src/game/session.js` `projectLead` | The Ops row and Deploy header read projected leads. `xpReward` is added to the projection (its key list is pinned in `test/session.test.mjs`) |
| `src/game/session.js` `makeView` / `src/net/rooms.js` `toWire(session.view)` | The roster already crosses whole, so `xp`, `primary` and `secondary` reach room clients. A new `progression` view field carries the campaign's definition so the hub derives with the authority's rules |
| `src/game/config.js` `SCHEMA` (`scope: "server"`) | `xpRewardLow/Medium/High/Extreme` go beside `threatReward*`. They are tunable in a room through `editor.html?server=1` (`src/editor/remote-config.js`) |
| `src/game/weaponoverrides.js` | The shape of P4's store: defaults in source, a patch in guarded localStorage, applied at load, Revert to the pristine copy, Copy JSON to make it permanent |
| `src/editor/editor.js` `TOOLS` / `MOUNTABLE`, `src/editor/tools/weapon-designer.js` | P4 is a Tools-tab panel under the `createX(container, onBack) → { dispose() }` convention, reusing `wd-*`/`cfg-*` CSS |
| `src/hub/hub.js` `_soldierCard`, the Deploy cards, `_resultsScreen`, the Ops lead row, the Deploy header | Every P3 surface already exists and reads the view. `showResults` keeps `turn` only when `turn.dayTurned`, so P3 must keep the award report independently of the day summary |
| `src/game/enemycost.js` `labelFor` | Difficulty id → display name for the briefing line |
| `test/hub-refresh.test.mjs` | Already mounts a real `Hub` over a session headlessly, so P3's readouts can be checked without a browser |

## Where the code goes

| Location | Change | Slice |
|---|---|---|
| `src/game/progression.js` (new) | Shipped definition, validation with field paths, derivation. DOM-free and storage-free (P4's guarded store lives in the same module or beside it, like `weaponoverrides.js`) | P1, P4 |
| `src/game/soldiers.js` | `primary`/`secondary` on each recruit. `soldierMaxHp` includes the flat bonus. Schema comment updated | P1, P2 |
| `src/game/gen/levelgen.js` | Stamp `xpReward` beside `threatReward`. The boss lead is `difficulty: "extreme"` and is paid the Extreme reward (unlike `threatReward`, which is zeroed for it) | P2 |
| `src/game/config.js` | Four `xpReward*` range knobs, `scope: "server"` | P2 |
| `src/game/state.js` | Definition snapshot on the world, `xpReward` in `missionOf`, the award inside the success guard, health policy, award report handed to the caller | P2 |
| `src/game/session.js` | Effective stats and HP bonus in `projectDispatch`; `xpReward` in `projectLead`; `progression` on the view; the award report on **all three** `missionResult` returns (not last report, last report with day turned, last report with `dayHeld`) | P2 |
| `src/hub/hub.js`, `src/hub/hub.css` | P2: stat bars and HP read effective values. P3: the readouts in the table above and `showResults` holding the award report whether or not the day turned | P2, P3 |
| `src/editor/tools/progression.js` (new), `src/editor/editor.js` | The P4 panel, registered in `TOOLS`, `MOUNTABLE` and the factory map; `applyProgressionOverrides()` called at editor load, like `applyWeaponOverrides()` | P4 |
| `test/progression.test.mjs` (new) | Derivation and validation. A new file because nothing tests this subsystem | P1 |
| `test/soldier-health.test.mjs` | Award and health-policy cases next to the existing write-back cases | P2 |
| `test/session.test.mjs` | Update the pinned dispatch, view and projected-lead key lists; joint and replay awards; award report on a non-last report | P2 |
| `test/hub-refresh.test.mjs` | Readout presence (level, MAX, labels, reward, results gains) | P3 |
| `test/tools.test.mjs` | `mountable(t, "progression", …)` | P4 |

Conventions that apply: guard every `localStorage` access; one synchronous `draw()` at mount; new gameplay state crosses the wire in the same commit (`xp`, `primary`, `secondary` go on the roster, `progression` on the view, and the award report in the command answer, which `src/net/rooms.js` already forwards as `missionEnd.turn`).

## The seam

| Owns | Does not touch |
|---|---|
| `progression.js`: what a level is, what it grants, and what a soldier's effective stats are, given (authored stats, lifetime XP, primary, secondary, definition) | Authored `stats` are **never written**. Effective stats are derived on every read and stored nowhere |
| `applyMissionResult`: who is eligible and how much they get. XP is the mission's stamped `xpReward`, never the live knob | Combat, kills, damage, squad size: the mission computes nothing about XP |
| The world's definition snapshot: every level and bonus in a campaign is computed from it | Nothing reads the live definition after `createWorld`. The editor store changes the next campaign, never the running one |
| `projectDispatch`: the only place effective stats are resolved for a mission | `src/mission/` reads `data.stats` and `soldierMaxHp(data)` exactly as it does today |
| `soldierMaxHp`: a formula over a soldier's **already-resolved** Health and flat HP bonus, looking up no definition, so `soldiers.js` (imported by `entities.js`) never imports `progression.js` | Callers holding a raw roster soldier resolve first with the campaign's definition: the hub from `view.progression`, `state.js` from the world snapshot. The dispatch carries both resolved. A soldier with no bonus field has 0 |
| The view's `progression` field: the one set of rules the hub derives with | The hub never imports the shipped definition for a campaign readout. P4's editor preview is the only place that reads it directly |

Settlement rules the builder must keep:

- **Idempotence is the existing guard.** XP is paid inside `if (!state.completedMissions.includes(result.missionId))`. That list is per commander, so on a joint lead each commander's survivors are paid from their own report and neither report blocks the other. A repeated report for the same mission pays nothing.
- **Order inside settlement:** casualties marked dead → survivors' wounds written back → XP added → levels crossed → health policy applied on the level-up delta. The policy works on max HP before and after the award, so wounds that were just written back are what `preserveWounds` keeps.
- **Level, XP into level and bonuses are always recomputed from `xp`.** A soldier stores lifetime `xp` and nothing derived from it.
- **As built (P2): the award report leaves `applyMissionResult` through an `onAward` option, not its return value.** The plan was to change the return; it stays the campaign, because a return-shape change is invisible to every caller that ignores it and the one caller that wants the report (`session.js`) can ask for it explicitly.
- **A soldier with no `xp` field is at the definition's starting XP.** That covers every test fixture and the Behavior Lab's stub soldier.

## Must not regress

| Guard | What it pins |
|---|---|
| `test/soldier-health.test.mjs` | `soldierMaxHp` formula (a level-1 soldier gets no bonus, so the existing equality still holds), wounds seeding `Soldier`, write-back, healing |
| `test/session.test.mjs` | The dispatch's `data` key list, the view's key list and the projected lead's key list. **All three change in P2 on purpose.** Update them in that commit and say why next to them |
| `test/mission-golden.test.mjs` | A level-1 squad plays byte-identically, since a zero bonus changes nothing the mission reads |
| `test/levelgen-golden.test.mjs` | A generated level does not move when `xpReward` is added to the mission metadata |
| `test/mission-net.test.mjs` | Room missions still start, step and report. Its hand-built squads have no `xp` and must still deploy |
| `test/wiring.test.mjs`, `test/service.test.mjs`, `test/transport.test.mjs` | Command answers and views still cross `toWire`: the award report and definition are plain data |
| `test/tools.test.mjs` | Every existing tool still mounts after P4 registers one |
| `test/docs.test.mjs` | This spec's citations |

New cases, in their slice:

| Slice | Cases |
|---|---|
| P1 | Every row of the design's XP table (lifetime thresholds 0…5,110) at exact boundary and one below; surplus kept; two levels crossed at once (the Extreme example: 50 XP → level 3, 20/40); MAX at 5,110 and beyond; the design's cumulative table at levels 2–10; level 6 grants each attribute once, and twice where primary = secondary; primary = secondary reaches +14 at level 10; an override replaces a level's grants and an empty override grants nothing; validation rejects every class in "Validation" below with the field path, and accepts zero rewards and zero grants |
| P2 | Each difficulty's reward; the reward is the stamped value after the knob changes; casualties get nothing; a failed report pays nothing; replaying a success pays nothing; two commanders on one lead both get paid; a boss clear pays the Extreme reward; all three health policies; a dead soldier stays dead; authored `stats` unchanged after awards; dispatch carries effective stats |
| P3 | Rendered strings contain level, MAX at cap, labels on a recruit, the reward on a lead and on results, and results gains |
| P4 | Mount; an invalid edit leaves the stored definition untouched; Revert restores the shipped one |

## Approximations

| Where it is not exact | What catches it |
|---|---|
| **No rebase, and no campaign-rules migration.** No campaign save exists: a single-player or hot-seat campaign ends with the page, and editor changes are read at load, which starts a new campaign. A room's server has no localStorage and always runs the shipped definition. So no campaign can outlive a change to its rules, and rebase has nothing to act on. The snapshot on the world is still taken, so rebase can be added when campaigns start to persist | A campaign save spec has to take this up. It is not in the bar |
| **Editor edits don't reach rooms.** P4 stores to browser localStorage, which a room never reads. The four reward knobs are the exception because they are `SCHEMA` server knobs. Copy JSON into `progression.js` is how a curve change reaches a room | Nothing in the bar; a room playtest shows the shipped curve |
| **Eligibility settings can't change anything yet.** A failed mission has no survivors, since a squad fails only when wiped. When one soldier reaches the exit, the whole living squad extracts. So "survived" and "extracted" are the same set, and a failure has nobody to pay. The flags are stored and validated but no value moves an award | A test pins "failed report pays nothing" so a later partial-extraction change turns red here |
| **Aim and Speed stop mattering above 10.** `aimAccuracy` and `speedT` (`src/mission/ai.js`) clamp to the 1–10 range, so +1 Aim at 10 shows on the card and does nothing in a mission. Health has no clamp. Nerve has no consumer at all. `statBar` draws `value × 10%`, which overflows the track above 10. P2 clamps the bar's fill and prints the real number | Nothing in the bar; visible on a card above 10 |
| **Base HP and HP per Health stay live `SCHEMA` knobs**, not part of the campaign snapshot. The Progression tool edits them through `config.js`, but a running campaign sees a change on its next load, as it does today | None; same as every other HP change today |
| **Attribute registry is fixed at four.** Caps are per attribute and editable; adding a fifth attribute is code, because every stat consumer names its attribute | Validation rejects an unknown attribute id |

## Background: definition data

One JSON-compatible object. Shipped in `progression.js`, copied onto the world at `createWorld`, carried on the view, and edited as a whole by P4.

| Field | Default |
|---|---|
| `startLevel`, `startXp`, `maxLevel` | 1, 0, 10 |
| `xpCost` | Destination level → XP from the previous level: 2→10, 3→20, 4→40, 5→80, 6→160, 7→320, 8→640, 9→1,280, 10→2,560 |
| `eligibility` | `{ outcomes: ["success"], requireSurvival: true, requireExtraction: true }` |
| `retainXpAtCap` | `true` |
| `attributes` | `aim`, `health`, `speed`, `nerve`, each with optional `cap` (none) |
| `growthRules` | Rows below |
| `levelOverrides` | `{}`. Destination level → complete replacement grant list |
| `levelUpHealthPolicy` | `preserveWounds` · `preserveCurrentHp` · `fullHeal` |

| Rule | Target | Amount | First | Every | Last |
|---|---|---:|---:|---:|---|
| hp | flat max HP | 10 | 2 | 1 | cap |
| primary | primary | 1 | 2 | 1 | cap |
| secondary | secondary | 1 | 2 | 2 | cap |
| others | every attribute that is neither | 1 | 3 | 3 | cap |

A rule matches a destination level when it falls within [first, last] and (level − first) is divisible by the interval. Matching grants add. Primary = secondary gets both rows. XP rewards are not in this object: they are `SCHEMA` knobs stamped per lead.

Soldier fields added: `xp` (lifetime, non-negative integer), `primary`, `secondary` (attribute ids). `stats` keeps its meaning: the authored starting attributes.

## Background: validation

| Class | Rule |
|---|---|
| Curve | Integer levels; `1 ≤ startLevel ≤ maxLevel`; exactly one positive-integer cost per transition above `startLevel` up to `maxLevel`; `startXp` a non-negative integer below the first threshold; cumulative total a safe integer |
| Rules | Unique ids; known target; amount finite and ≥ 0, integer for attribute targets; positive-integer first/interval; last ≥ first when present |
| Overrides | Keys within `(startLevel, maxLevel]`; grants valid as rule targets and amounts |
| Attributes | Known ids only; cap a positive integer when present |
| Assignments | Both ids registered |
| Policy / eligibility | Known values only |
| HP | The resulting max HP of every recruit is positive |

A failed validation returns every error with its field path, and the caller keeps its previous definition.
