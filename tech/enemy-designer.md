---
type: tech
category: development-tools
status: building
resolution: sharp
needs: [enemyspec, enemyspec-llm, level-generation, sound]
related: [weapon-designer, enemies]
tags: [enemies, editor, llm]
---

# Enemy Designer

The editor's Tools → Enemy Designer, rebuilt around a conversation. One chat
authors and revises the enemy, a tree rail is both the live definition and the
manual editor, the preview is a real fight you can lose, and a roster button
puts the result into generated missions.

## Slices

Each lands alone, green, and is committed on its own.

| # | Slice | Changes runtime behaviour |
|---|---|---|
| **E1** ✅ | **Playable preview.** The preview's dummy literal becomes a real soldier driven by the mission input layer: move, jump, crouch, aim, fire, reload. Weapon and Aim pickers. An expand control takes the preview to a 1:1 arena; Reset restarts it. **Keyboard ownership is the load-bearing part** — see below | No — editor only |
| **E2** | **Tree + inspector rail.** The root-only form is replaced by a tree of the spec (spec node, entities, defs, brain states) with a property inspector for the selected node beneath it. Add / duplicate / delete / reorder. Identity, Sound and Limits on the spec node; components on entity nodes; an emitter's own sound on the emitter node. The Body, Movement and Attack sections are deleted; **the whole-spec JSON panel stays**. Validation errors mark their nodes | No — editor only |
| **E3** | **Chat.** One transcript replaces the prompt box. First message with no enemy loaded generates; every message after revises; one acceptance gate decides whether anything lands. Turns that only answer a question change nothing. Every landing pushes a checkpoint; rewinding to one is the undo. A landed turn marks the tree nodes it touched (E2). The Player2 connect control and its `config.player2GameClientId` gate move to the composer unchanged | No — editor only |
| **E4** | **Live roster.** A roster store merged into the generator's roster and the mission loader's spec map. A per-entry enable list covering built-ins and custom enemies. Ids pinned on load and refused on collision; admission requires a declared threat and re-runs the dry run longer than the save gate does | **Yes** — generated missions place custom enemies |
| **E5** | **Manual edits in the transcript.** A tree or inspector edit appends a synthetic line, debounced and merged by path. Readability and intent only: the current spec is attached to every request regardless, so the model already sees the edit | No — editor only |

E4 is the only slice that reaches the game. E1 is first because it is the one
that can be judged by playing rather than by reading.

**E1's real problem is focus, not physics.** `MissionInput` installs its handlers
on `window` and calls `preventDefault()` on every bound key, and the default map
claims A/D/W/S/Space/J/K/Tab/R/G/H — so with a name field, a JSON panel and a
chat composer on the page, typing would drive the soldier. The Firing Room is not
a precedent here: it enables input on *mode change* and has no text field at all.
The canvas owns the keyboard only while focused, and `src/mission/input.js` is not
modified to achieve it.

**As built (E1).** Four things the slice settled that the plan left open:

| | |
|---|---|
| **Focus is DOM focus** | The canvas carries `tabindex="0"`; its `focus`/`blur` handlers are the only callers of `input.enable/disable`, so clicking any field on the page releases the keys with no bookkeeping. `Escape` blurs the canvas (it is unbound in `controlmap.js`, so `MissionInput` ignores it). While unfocused the step reads **no** input at all — gamepad included — so a held key cannot drive a soldier you are not looking at |
| **Clicking the preview no longer damages a part** | That affordance and click-to-fire are the same gesture. You break a part by shooting it now, which is the point of the slice |
| **One world, two zooms** | The arena is a fixed 960×540 (the mission's own size) drawn at 0.5× in the rail and 1:1 expanded, so ⛶ changes the view and never the fight. Expanded, the panel breaks out of the editor's 900px column; below roughly a 1000px window it scales down rather than scrolling sideways, so "1:1" is exact only where the window allows |
| **Spec edits reset the enemy, not the fight** | `resetPreview()` re-instantiates the enemy alone — a keystroke in the JSON panel must not teleport the player mid-fight. ↻ is the only thing that puts both fighters back on their marks |

## Reuses

| What | Where | Used for |
|---|---|---|
| `accept()` — validate → normalize → dry-run | `src/game/enemyspec/generate.js` | The single acceptance gate for chat, Save and roster admission. No second path |
| `buildSystemPrompt()` and its few-shot templates | `src/game/enemyspec/generate.js` | The chat's system turn. **Its reply-shape instruction changes** — see the seam |
| The repair round | `src/game/enemyspec/generate.js` | Already the exact message shape a revision needs: prior spec as the assistant turn, instruction as the next user turn |
| `chatStream()` | `src/player2/client.js` | Already implemented, with SSE parsing and queue integration. Available if the reply shape is ever split; not used while the reply is one object |
| `validateSpec` error paths | `src/game/enemyspec/validate.js` | Paths are already tree addresses (`root.children[0].emitters.missiles.ref`), so they map onto tree nodes with no new machinery |
| The closed vocabulary | `src/game/enemyspec/schema.js` | `ENTITY_KEYS`, `MOTIONS` (params and defaults), `ACTIONS`, `PATTERNS`, `AIM_STYLES`, `EVENTS`, `LINK_POLICIES`, `ROLES`, `RANGES`, `VISUAL_SHAPES` are what the inspector's controls are generated from |
| `EFFECT_SCHEMA` as a pattern | `src/game/weaponcost.js` | The proven shape for "one table entry, one generated control", including its note that slider ranges are authoring bounds rather than validity rules |
| The manual-drive branch | `src/editor/tools/firing-room.js` | A working playable soldier in an editor tool: `new Soldier(...)`, aim resolution from `config.aimMode`, respawn without permadeath, `input.disable()` on dispose. Its *enablement* model is not reused |
| `MissionInput` | `src/mission/input.js` | Remappable keys, gamepad poll, canvas-relative mouse aim. Unmodified |
| `Soldier`, `stepActor`, `startReload`, `tickReload` | `src/mission/entities.js` | The player body, unmodified |
| `fire`, `aimAccuracy` | `src/mission/ai.js` | Real shooting, including spread from the Aim stat |
| `updateProjectiles`, `updateStatuses` | `src/mission/combat.js` | Already driven by the current preview |
| `drawProjectile`, `drawSpecEnemy` | `src/mission/render.js`, `src/mission/enemyspec/render.js` | Already driven by the current preview |
| The shared cue picker | `src/editor/sound-picker.js` | Sound rows on the spec node and on emitter nodes, unchanged |
| `specSound`, `SPEC_SOUND_KINDS`, `CUE_IDS` | `src/audio/cues.js` | Slot resolution and the closed cue list |
| `resolveId(name, loadedId)` and the `load` test hook | `src/editor/tools/weapon-designer.js` | Both exported. Id pinning, and the precedent for a driveable method the headless suite can call |
| The override-store precedent | `src/game/weaponoverrides.js` | A store applied in place over shared objects, called explicitly from both pages, importing strictly one way. It re-implements its own guarded storage rather than sharing `customcontent.js`'s helpers, which are module-private — the roster does the same |
| `enemyThreat()` | `src/game/enemycost.js` | Prices a spec descriptor from its declared `threat` with no change |
| `missionRoster()`, `missionSpecById` | `src/game/enemyspecs.js` | The two exported halves of the roster seam. `descriptorFor` is private and stays there |
| `listEnemySpecs` / `saveEnemySpec` / `enemySpecMap` | `src/game/customcontent.js` | The library store, unchanged in shape |
| Panel and control CSS | `src/editor/editor.css` | `wd-*`, `cfg-*`, `lg-*`, `.toggle` |

## Where the code goes

| Path | Change |
|---|---|
| `src/editor/tools/enemy-designer.js` | Rewritten. Same registration contract, same `TOOLS` id, one synchronous draw at mount, `dispose()` cancels the rAF loop **and** disables input |
| `src/editor/tools/spec-tree.js` (new) | DOM-free operations on a sparse spec: enumerate nodes, resolve a path, add, duplicate with fresh ids, delete, reorder, promote to a def. Node-importable and tested without a DOM, like `src/game/enemyspec/` |
| `src/game/enemyspec/schema.js` | New `ENTITY_FIELDS` export — label, control type, bounds, default per component field. Introduces no vocabulary: every component it keys off is already in `ENTITY_KEYS` |
| `src/game/enemyspec/generate.js` | **One** conversation entry point. `generateEnemySpec` becomes a thin single-turn call on the same core, so its behaviour and its suite are preserved |
| `src/game/enemyspec/specdiff.js` (new) | Pure: two sparse specs in, touched paths out. Feeds the tree marks and the chat's change list |
| `src/game/rosterspecs.js` (new) | The roster store **only** — guarded storage, membership, enable flags. Imports nothing from `src/game/enemyspecs.js` |
| `src/game/enemyspecs.js` | Imports the roster store. `missionRoster()` filters the built-ins by their enable flag and appends enabled custom descriptors; the same module fills `missionSpecById`. The merge lives here, on one side of a one-way import |
| `src/game/customcontent.js` | `saveEnemySpec` gains the built-in spec ids as its reserved set. It currently passes an empty one, so a library entry named "Husk Charger" slugs to `husk_charger` and would shadow a built-in once E4 merges the maps |
| `src/game/state.js`, `src/editor/editor.js` | One call each to apply the roster, mirroring the two `applyWeaponOverrides()` calls already there |
| `src/editor/editor.css` | New classes only, `ed-*`/`es-*`. Existing `wd-*`/`cfg-*` reused |
| `test/harness.mjs` | **As built (E1):** `windowListenerCount(type)`. The window listener stubs record instead of discarding, which is what lets a suite assert the tool released the keyboard. Cleared by each `installDom()` |

Conventions from `CLAUDE.md` that bind: guarded `localStorage` everywhere;
cross-page data read at load time; fallback discipline; no dependencies added.

## The seam

**Owns:** the tool, the tree and diff modules, the roster store and its merge,
`ENTITY_FIELDS`, the conversation entry point, and the reply envelope.

**The reply envelope.** A chat reply is one JSON object carrying prose and,
optionally, a spec — so `buildSystemPrompt()`'s "output exactly one JSON object,
no prose" instruction is replaced by an envelope instruction. Everything
downstream is unchanged because the envelope is unwrapped before `accept()` ever
sees it, and **an object with no envelope key is treated as a bare spec**. That
rule is what keeps `generateEnemySpec` and its stubbed suite working, and it
doubles as tolerance for a model that ignores the envelope.

**Must not touch:**

| Boundary | Why |
|---|---|
| The EnemySpec format | No new keys, motions, actions, patterns or events. `ENTITY_FIELDS` is metadata about the existing vocabulary |
| `src/game/enemyspec/validate.js`, `src/game/enemyspec/normalize.js`, `src/game/enemyspec/dryrun.js` | The acceptance pipeline is reused, not extended. Roster admission raises `dryRunSpec`'s `seconds`; it does not change the arena the dry run builds |
| `src/mission/enemyspec/runtime.js`, `src/mission/enemyspec/brain.js`, `src/mission/enemyspec/perception.js` | The preview runs the shipped runtime. A preview-only behaviour would make the preview a lie |
| `src/mission/combat.js`, `src/mission/entities.js`, `src/mission/input.js` | The playable soldier is the mission's `Soldier`. `loadMission` resolves roster ids through the existing spec map. Focus is solved in the tool, not in the input layer |
| `src/game/gen/levelgen.js` | It already accepts an arbitrary roster. Only what `missionRoster()` returns changes |
| The `BEHAVIOR` map | It stays the authority for the seven built-ins, whose hints are **not** recoverable from `role` — two `elite` entries map to different hints. Only custom descriptors derive a hint |
| `src/game/customcontent.js`'s library semantics | It stays the scratch library. Roster membership is a separate store, so deleting a library entry cannot silently empty the roster, and the Firing Room's "Designed" list keeps its meaning |

**The roster is never empty.** Disabling the last enabled entry is refused, and a
store that resolves to nothing falls back to the built-ins. With an empty roster
`fillEnemies` computes `Math.min(...[])` → `Infinity`, its guarantee-one-enemy
fallback finds no descriptor, and the mission generates with zero enemies — no
throw, no error, just an empty level. That is the failure fallback discipline
exists to prevent.

## Must not regress

**Everything.** The whole suite is the bar: `node test/run.mjs` green, all 31
suites, before any slice commits — not a chosen subset, and not only the suites
a slice touched. The table is which suite watches which seam, so a red one says
where to look; it is not a list of the ones that matter.

| Suite | What it guards |
|---|---|
| `test/tools.test.mjs` | Headless mount of every tool, a returned `dispose()`, and `dispose()` not throwing. Extend for the rewritten designer with a driveable path the way the Weapon Designer's `load` is driven, and assert `dispose()` releases the input listeners |
| `test/enemyspec-generate.test.mjs` | Clean accept, repair round carrying the real error text, double failure rejected, a thrown parse error becoming `ok:false`, and the client's fence-stripping. Its stubs return bare specs — the envelope rule must keep every one of these green unchanged |
| `test/enemyspec.test.mjs` | Expression parse/eval, validation catching bad refs and enums and depth and empty loops and spawn bombs, normalize defaults, every template clean. Tree operations and the diff belong here: the fixtures they need are the templates this suite already imports |
| `test/levelgen-golden.test.mjs` | **The real guard on the roster merge.** It calls `generateLevel` with no roster, so it goes through `missionRoster()` and freezes the enemy `type` at every placement. An empty store must leave the golden file untouched |
| `test/gen.test.mjs` | Every placed type resolves to a spec; placements stay inside the budget; a custom roster is respected; higher difficulty spends more. Note its custom-roster case passes an explicit roster, so it does **not** exercise the merge — that case is new |
| `test/content.test.mjs` | Store CRUD, id slugging, collision suffixing, store independence, and every store returning empty rather than throwing without `localStorage`. The new reserved set must not change the existing library assertions |
| `test/mission-enemyspec.test.mjs` | `loadMission` produces one root per placement, loot on every root, kill credit and drops |
| `test/audio.test.mjs` | Every built-in spec validates and its sound slots resolve — moving the Sound rows to the spec node must not change what a slot means |
| `test/docs.test.mjs` | This document's citations |
| Serve-check | New files return 200 under `python3 -m http.server` |

## Approximations

| # | Where it is not exact | What catches the failure |
|---|---|---|
| 1 | **A chat reply carries the whole spec, not a patch.** `tech/enemyspec-llm.md` §2.2 specifies an `EnemyPatch` format that would cost far fewer tokens. Whole specs keep exactly one acceptance path | A token readout in the composer. If sessions start failing on context, the patch format is the escape hatch and is already specified |
| 2 | **History is prose-only and bounded.** Superseded specs are never re-sent; the current one always is | State can never be stale — only intent can drift. The failure is the model forgetting an instruction from ten turns back, not producing a wrong enemy |
| 3 | **No streaming, by choice.** `chatStream()` exists and works; the reply is one JSON object, which cannot be usefully rendered token by token | A spinner. Splitting the reply into prose-then-fenced-JSON would enable it and weaken the one-object discipline that keeps parse failures rare |
| 4 | **The model rewrites things you did not ask about.** Unavoidable while every reply is a whole spec | The diff and the touched-node marks, in the rail, without reading JSON |
| 5 | **Roster admission dry-runs longer, not more realistically.** `dryRunSpec` builds a single flat platform and one stationary dummy; raising `seconds` does not add terrain, a squad, or a mission's length | Engine-clamped `limits`, and `loadMission` falling back to the cheapest built-in on an unresolvable id. Making the arena realistic means editing `src/game/enemyspec/dryrun.js`, which this spec does not own |
| 6 | **A custom enemy's placement hint is derived from `role`, and the derivation is lossy.** The built-ins prove role does not determine it — `cowardly_duelist` and `sky_duelist` are both `elite` and get different hints | Eyeball in Tools → Level Generator, which previews placements. Built-ins keep their authored hints |
| 7 | **Delete does not repair dangling references.** Removing an entity leaves any emitter ref, spawn ref, `transformTo`, `telegraph.part` or action target that named it | Re-validation marks the offending nodes from paths the validator already produces. **Except references inside expression strings** — `alive('shieldPod')` parses fine and validation will not flag it. That case is silent, and is the known hole |
| 8 | **Brain editing is structural only.** Add, remove and reorder states, tracks, steps and utility actions, and pick an action kind; a step's arguments stay a raw JSON field | Nothing — a deliberate scope line. Full argument UI is per-arg metadata for all 18 actions, and the chat covers the same ground until that is worth building |
| 9 | **`ENTITY_FIELDS` invents bounds.** `RANGES` covers fifteen paths and none of the `MOTIONS` params, `contact.knockback`, or emitter offsets, so those sliders carry new numbers | They are authoring bounds, not validity rules — the same status `EFFECT_SCHEMA`'s ranges already have. A hand-authored value outside a slider's range stays legal. The test can only assert that `ENTITY_FIELDS` keys off components in `ENTITY_KEYS`; it cannot check leaf names, because `ENTITY_KEYS` names components |
| 10 | **Custom enemies append to the built-ins.** A custom enemy competes with six built-ins for each placement | The per-entry enable list: built-ins can be switched off individually. Whether appending is the right default is a design question, not an engineering one |
| 11 | **The roster is global and permanent, not per-campaign.** `design/enemies.md` wants each campaign to generate its own ecosystem and enemies to persist as campaign data. This is one browser-local list applied at `createState()`, identical in every campaign | Nothing. Explicitly deferred, not solved. It is a campaign-state feature, not a tool feature |
| 12 | **`intelligence` plays no part in placement.** The schema carries it 1–5 with a rubric, but the generator budgets on `threat` alone, so a smart enemy and a dumb one of equal threat are interchangeable to it | Nothing changes here — admission requires a declared `threat` so the budget at least means something, but the second axis `design/enemies.md` asks for stays unused |

## Background

### Why the generate / revise split disappears

Generation and revision differ only in whether a spec is attached. The repair
round in `src/game/enemyspec/generate.js` already sends a prior spec as an
assistant turn and an instruction as the next user turn — a revision is that
message shape with the instruction coming from the author instead of the
validator. Two entry points would mean two prompts to maintain and two places to
forget the acceptance gate.

### What replaced the old form sections

| Old section | What it edited | Now |
|---|---|---|
| Identity | `role`, `tier`, `threat`, `intelligence` | The spec node — one per enemy |
| Body | `root.visual` and `root.health` | The inspector, for any entity. Mis-named: it never edited `body` |
| Movement | `root.motion` | The inspector, for any entity |
| Attack | `root.contact`, `root.emitters.gun` | The inspector, for any entity. The "add basic gun" convenience becomes a preset under the tree's add menu, because it seeds a starter brain as well as an emitter |
| Sound | `spec.sounds` | The spec node |
| Full spec (authoritative) | The whole sparse spec | **Unchanged and still authoritative.** The tree and inspector are a second way in, not a replacement — approximation 8 depends on this panel existing |

The real `body` component — `gravity`, `jump`, `ghost` — had no control at all and
gets one. `body.jump` decides which ledges an enemy can chase the player onto, so
it is a live design knob that was reachable only through JSON.

### Sound is three levels, none of them per-entity

`ENTITY_KEYS` carries no `sounds`. An enemy's voice is set at the spec level
(`fire`, `hurt`, `death`, `part`), overridden per emitter, and punctuated by the
`sound` action for a specific moment. `part` is spec-wide: one part with its own
break sound is a `sound` action in that part's `on.destroy`, not a slot.

### There is no design doc for this

The Enemy Designer is a development tool, so no `design/enemy-designer.md` exists
and none should — the same as `tech/weapon-designer.md`. Where E4 does touch the
game, it is flagged rather than decided: approximations 10, 11 and 12.
