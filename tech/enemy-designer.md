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
| **E2** ✅ | **Tree + inspector rail.** The root-only form is replaced by a tree of the spec (spec node, entities, defs, brain states) with a property inspector for the selected node beneath it. Add / duplicate / delete / reorder. Identity, Sound and Limits on the spec node; components on entity nodes; an emitter's own sound on the emitter node. The Body, Movement and Attack sections are deleted; **the whole-spec JSON panel stays**. Validation errors mark their nodes | No — editor only |
| **E3** ✅ | **Chat.** One transcript replaces the prompt box. First message with no enemy loaded generates; every message after revises; one acceptance gate decides whether anything lands. Turns that only answer a question change nothing. Every landing pushes a checkpoint; rewinding to one is the undo. A landed turn marks the tree nodes it touched (E2). The Player2 connect control and its `config.player2GameClientId` gate move to the composer unchanged | No — editor only |
| **E4** ✅ | **Live roster.** A roster store merged into the generator's roster and the mission loader's spec map. A per-entry enable list covering built-ins and custom enemies. Ids pinned on load and refused on collision; admission requires a declared threat and re-runs the dry run longer than the save gate does | **Yes** — generated missions place custom enemies |
| **E6** ✅ | **One list.** `enemyspecs.js` stops being "the built-ins" and becomes the enemy list, each entry carrying its own placement hint. A delta store holds edits by id, tombstones, additions and the in-missions flag; the merge is *file → drop tombstones → replace edits → append additions*. the roster store folds in, `customcontent.js` loses its EnemySpec half and its import of `enemyspecs.js`, and the built-in/custom split is deleted from the data model. **No UI redesign** — the existing panels repoint | **Yes, in principle** — a shipped enemy can now be edited or taken out of missions. With an untouched store nothing moves, which is exactly what `test/levelgen-golden.test.mjs` freezes |
| **E6a** ✅ | **What happens to E4's admission gate**, because there is no longer an admission event to hang it on. The **12-second dry run survives and moves to the in-missions switch** — a mission is a harsher place than the editor, and Save's 4-second gate is not the same promise. The **declared-threat requirement is deleted**: `normalizeSpec` already defaults `threat` to 50, the spec node has a slider for it and the list shows it in a column, so refusing an enemy for a field that has a default was friction with no reader. Flipping the switch on therefore has three refusals — it does not validate, it would empty the roster, or it is the last boss | Folded into E6, not a separate commit |
| **E7** ✅ | **The Enemies screen.** The tool becomes two screens: a list it opens on, and the workspace. The list is one flat table — name, role · threat, placement, an in-missions switch, and Open / Duplicate / Delete on every row — plus **＋ New** (blank / template / duplicate / describe) and an Export / Import / Reset section over one shared textarea. The workspace loses its roster button, its prose header and "Save to library"; it gains `← Enemies`, `Save`, and **a Placement control on the spec node** — tool-local, beside Identity, exactly where E2 put the other one-per-enemy rows. The Enemy-library and Mission-roster panels are deleted | No — editor only |
| **E5** | **Manual edits in the transcript.** A tree or inspector edit appends a synthetic line, debounced and merged by path. Readability and intent only: the current spec is attached to every request regardless, so the model already sees the edit | No — editor only |

E4 and E6 are the slices that reach the game. E1 is first because it is the one
that can be judged by playing rather than by reading. **E6 comes before E7**
because E7's screen is organised around a list that E6 is what creates — built
the other way round, the browser's main column would be a category the next
slice deletes. Splitting them also keeps the proof clean: E6 is a refactor the
existing suite already tests, so a moved golden file has exactly one suspect.
E5 depends on neither and can land whenever.

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

**As built (E2).** What the slice settled:

| | |
|---|---|
| **A component is present or it is not** | Each component on an entity node is a card with an on/off switch: on writes the defaults `ENTITY_FIELDS` declares, off deletes the key. That switch IS sparse authoring — an entity carries only what was turned on, and an untouched component writes nothing. `health` cannot be switched off on the root |
| **`ENTITY_FIELDS.emitters` describes ONE emitter** | Not the emitters map — the tree gives every emitter its own node, so the inspector renders a single emitter against that entry (offsets, `ref`, the projectile leaves, and the emitter's own sound row). `id`, `tags`, `vars` and `on` carry an empty `key`, meaning the field IS the component |
| **The spec node's rows stayed in the tool** | Identity, Sound and Limits are one-per-enemy, not components, so putting them in a schema table keyed by `ENTITY_KEYS` would have been a lie about what that table is. They are a local list in `enemy-designer.js`, exactly where the old Identity form lived |
| **Transitions and `enter` are JSON, like step arguments** | Approximation 8 said a step's arguments stay raw JSON; the state node extends that to `transitions` and `enter` for the same reason — they are expressions and signal names, not controls. Everything else on a state (tracks, actions, steps) is a tree node with add / duplicate / delete / reorder |
| **Refusals are reported, not swallowed** | Every op returns `{ ok, path, error }` and the toolbar prints the error ("the root is the enemy — it cannot be deleted"). A structural op that cannot apply must say why, because the toolbar acts on whatever is selected |
| **The "add basic gun" convenience became the `gun` preset** | As predicted: it seeds an emitter AND a starter brain, because an emitter nothing fires is not a gun |

**Superseded by E6.** Three of E4's decisions below are reversed, and the reason
is one thing: **"built-in" was the wrong idea.** It was never the file that made
the seven enemies special — it was that the tool could not reach them and their
ids were reserved. Delete those two facts and the file is just data, so the
snapshot store, the reserved set and the collision rules all stop having a job.
E4's *behaviour* survives whole: the enable flags, never-empty, the merge, id
keeping and the Mission-roster switch. What changes is where the bytes live.

**As built (E3).** What the slice settled:

| | |
|---|---|
| **A turn has three outcomes, not two** | `chatEnemySpec` returns `kind` — `edit` (landed), `answer` (prose only, the enemy untouched), `failed` (a spec the engine refused, after its repair round), plus `error` for a client that threw. The transcript labels them *edited* / *answered* / *no change*, and only `edit` pushes a checkpoint |
| **`generateEnemySpec` kept its signature by losing its body** | It is now four lines over `chatEnemySpec` with no history and no attached spec. Its suite passes unchanged, which is the evidence that the two entry points really did collapse into one |
| **A repair reply that comes back as prose is a failure** | The repair round is unwrapped through the same envelope, so a model that apologises instead of fixing produces `failed` with "the repair reply carried no spec" — not a silent pass and not a crash |
| **The composer is the third column, and the tool got wider** | Rail, fight and conversation do not fit in the editor's 900px body, so `.wd.es-wide` breaks the Designer out permanently — the same trick `.es-expanded` already used for the 1:1 arena. Under 1240px the chat drops beneath the other two; expanded still hides both side columns |
| **Rewind does not truncate the transcript** | Later checkpoints survive a rewind, so a rewind can itself be rewound, and the failures stay on screen because they are the model's best context for the next turn. Loading a template or a library entry is the one thing that resets the stack to v0, and it says so in the transcript |
| **The marks needed no new machinery** | `errorCounts(nodes, changes)` — a change list and an error list are both lists of tree paths, so the diff rolls onto nodes through the function E2 already wrote for the validator. The rail draws marks quieter than errors on purpose |
| **`summarize` counts containers by their members** | `root.children` deleted as a unit is one diff entry and six parts gone, so the checkpoint line says `−6 parts`. A first generation is not special-cased into the word "rebuilt" — it reports the real counts, which is what the marks show anyway |
| **The token readout prices the REAL message list** | Approximation 1's catch is `composeChat()` called with the composer's current text, not an estimate of it, so what the readout says is what would be sent |

**As built (E4).** What the slice settled:

| | |
|---|---|
| **The admission gate lives in the store, not the merge** | The plan put the roster store down as "the roster store **only**". `admitSpec()` — declared threat, pinned id, `accept()` at `ROSTER_DRYRUN_SECONDS` (12) — went there anyway, next to the thing it guards, which keeps `enemyspecs.js` (production content) free of the acceptance pipeline. What did NOT go there is the never-empty policy, because that spans built-ins the store cannot see |
| **Membership is a SNAPSHOT, not a pointer** | An admitted enemy is stored whole. Deleting the library entry it came from cannot change what missions generate, which is what the seam's "the library stays a scratchpad" line requires. The cost is that editing the library copy does not update the roster copy — re-admit is how you push a change |
| **The enable policy needed two new exports on `enemyspecs.js`** | `rosterEntries()` (built-ins + customs, one row each, for the Designer's list) and `setEnemyEnabled()` (the refusal). Neither could live in the store: emptiness is a property of the merged list |
| **The boss slot is a role, not a list** | A custom enemy whose `role` is `boss` is appended only when `missionRoster({ boss: true })` asks, exactly like `iron_moth` — otherwise a 320-threat monster would wander into a recon mission. Boss entries are also excluded when counting "would this empty the roster?" |
| **Ids are pinned by reusing `resolveId`** | E2 re-slugged `spec.id` from the name on every refresh, so "load, rename, save" minted a duplicate. Loading from the library or the roster now pins the id; a template or a chat landing does not, so a fresh design's id still follows its name |
| **The library suffixes, the roster refuses** | Both now reserve `BUILTIN_SPEC_IDS`, but differently: a library save of "Husk Charger" becomes `husk_charger_2` (it is a scratchpad), while roster admission of that id is refused outright — a mission enemy has to carry the name its author saw |
| **`installSpec` is lazy as well as eager** | `applyEnemyRoster()` is the explicit call from both pages, but `descriptorFor()` installs on demand too, so a roster read can never outrun the map `loadMission` resolves through. A stored spec that will not normalize drops out of the roster instead of taking the generator down |

**As built (E6 + E6a).** What the slice settled, and where it left the plan:

| | |
|---|---|
| **The merge came out one function shorter than planned** | There are not three delta kinds in storage, there are two maps and a tombstone set: `records[id]` is an edit when the file has that id and an addition when it does not, so the code never asks which it is. `flags[id]` is the in-missions switch, stored SEPARATELY from the record on purpose — flipping the switch must not make an untouched entry read as `edited` |
| **A delta that no longer differs is dropped on read** | `diffSpecs(over.spec, file.spec).length === 0` and the same `behavior` → the entry reads as the file's again. `inMissions` is excluded from that comparison, per the row above |
| **`missionSpecById` now LOSES keys, which it never did before** | `prune()` deletes every id the merge no longer offers, so a tombstoned or switched-off enemy stops resolving. That is what makes the deletion real, and it is why `src/mission/entities.js`'s fallback had to stop naming `husk_charger`. `installSpec` caches by spec object reference, so a clean store re-normalizes nothing per `generateLevel` call |
| **The two panels became one, because the two lists did** | The plan said "the existing panels repoint". The Enemy-library panel and the Mission-roster panel were two views of what is now one list, so they collapsed into a single **Enemies** panel — switch, name, `role · threat · placement`, an `edited` / `new` mark, Load, `↺` on an edited row, `×`. Not the E7 screen; E7 still replaces it |
| **"＋ Put this enemy in missions" had no verb left, so it went** | E6a moved the 12-second dry run onto the switch, which left the button doing nothing Save does not. `Save to library` became `Save` in the same edit, because "library" is a concept E6 deletes. Both changes were listed under E7; they became unavoidable here |
| **Save pins the id** | Saving an enemy pins its id the way loading one does, so "save, rename, save" updates the entry instead of minting a second (approximation 17). E4 pinned on load only, because admission was a separate act |
| **A new enemy arrives OUT of missions** | Save's gate is still `accept()` at 4 seconds; the switch's is 12. So saving cannot put anything in a mission, and the mission gate is passed exactly once per enemy, at the moment it is asked for |
| **The never-empty refusal makes its own fallback unreachable from the UI** | `setEnemyEnabled` refuses the last placeable entry and the last boss, so the "everything off" path can only be produced by a hand-edited store. `test/gen.test.mjs` therefore writes the flags through `setInMissions` (the raw store write, no policy) to prove the fallback still holds |
| **Renames on the two E4 exports** | `rosterEntries()` → `enemyEntries()` and its `source: "built-in" \| "custom"` → `origin: "file" \| "edited" \| "added"` — how an entry got here, not a category it belongs to. `ROSTER_DRYRUN_SECONDS` → `MISSION_DRYRUN_SECONDS`, on `src/game/enemyspecs.js`, next to the gate that reads it |
| **Deleting an addition tombstones it too** | The tombstone means "this browser does not have this id", not "the file has it and I do not" — so a later commit that ships the id does not undo the deletion. `revertEnemy(id)` is how you take it back |
| **Migration writes even when it finds nothing** | An empty delta store is written on the first read, so the one-shot conversion of E4's two keys runs exactly once. Without that, deleting a migrated enemy would resurrect it on the next load |

**As built (E7).** What the slice settled, and where it left the plan:

| | |
|---|---|
| **Both screens are mounted at once and toggled by a class** | Not two mounts. The workspace owns a rAF loop, a `tabindex` canvas that holds the keyboard, a transcript and a checkpoint stack — none of that survives being torn down and rebuilt, and the tool contract is one `dispose()`. `es-on-list` / `es-on-work` on the root is the whole switch. The preview does not `step()` or `draw()` while the list is showing, and leaving the workspace blurs the stage, or typing into the filter box would drive a soldier nobody can see |
| **Placement went on the spec node, not the header** | `tech/enemy-designer.mockup.html` draws it in the head bar beside the name. The slice row said "on the spec node, beside Identity, exactly where E2 put the other one-per-enemy rows", and that is where it went — Role / Tier / Threat / Intelligence / **Placement** read as one block. It is the ONE control on that node that does not write to the spec: it writes tool state and lands with Save, because `behavior` lives on the record |
| **"Duplicate the selected row" is not in the ＋New menu** | The mockup lists it there, but the list has no row-selection model and `⧉` on every row already is that verb. ＋New is Blank / From a template / Describe it… — the last one opens the workspace with the composer focused |
| **Everything ＋New and Duplicate produce is UNPINNED** | So the id follows the name you give it, which is what makes Duplicate the only route to a new id (approximation 17). A duplicate is named `<name> copy` and its `id` is deleted before it loads |
| **Import does not take `inMissions` from the payload** | It was going to write `false` — an import must not walk past the mission gate. But that turns re-importing your own export into "switch every shipped enemy off". Omitting the field instead keeps whatever the entry already had and leaves a NEW one out of missions, which satisfies both. Caught by the round-trip test, not by reading |
| **Import is tolerant about shape, strict about content** | The `{ v, enemies: [record] }` payload, a bare array of records or specs, or one spec. Every spec still goes through `accept()`, and a failure is skipped and named with its first error (approximation 15) |
| **The workspace lost its list panel entirely** | E6 had collapsed the library and roster panels into one; E7 deletes it, because the list screen IS it. Save now refreshes the list screen behind you |

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
| ~~`listEnemySpecs` / `saveEnemySpec` / `enemySpecMap`~~ | `src/game/customcontent.js` | **E4 only.** E6 deletes all four exports and moves what they did into the delta store; `saveInto`'s reserved-id machinery stays for weapons and legacy enemies |
| Panel and control CSS | `src/editor/editor.css` | `wd-*`, `cfg-*`, `lg-*`, `.toggle`. E7 adds the list rows and the IO section on top of `wd-saved-row` and `ed-json` |
| **The config override layer** | `src/game/config.js` | Defaults live in source and are read on EVERY load; localStorage carries only what differs, and `resetConfig()` drops the lot. E6's store is that shape with three delta kinds instead of one — and the reason there is no "import the list" step, because there is no copy of it |
| **The settings tab's Export / Import** | `src/editor/editor.js` | Three buttons over one shared textarea with a message slot, and the "Export and paste the values into the source" contract in its own note. E7's IO section is that markup with an enemy payload |
| **`normalizeSpec`'s defaults** | `src/game/enemyspec/normalize.js` | `threat` already defaults to 50 and `body.w/h` fall out of the visual, so a list row needs to carry neither and "an enemy with no threat" is not a state the UI has to show |
| **`diffSpecs`** | `src/game/enemyspec/specdiff.js` | Written for E3's tree marks. E6 uses it for one more thing: a delta that equals its file entry is dropped on load, so the `edited` mark clears itself once the file catches up |
| **`fillEnemies`'s hint vocabulary** | `src/game/gen/levelgen.js` | `shooter`/`turret` prefer a perch, `charger` (or anything with speed) leans to the ground. Three values, already read — the per-enemy `behavior` field is authored against them and introduces nothing |

## Where the code goes

| Path | Change |
|---|---|
| `src/editor/tools/enemy-designer.js` | Rewritten. Same registration contract, same `TOOLS` id, one synchronous draw at mount, `dispose()` cancels the rAF loop **and** disables input |
| `src/editor/tools/spec-tree.js` (new) | DOM-free operations on a sparse spec: enumerate nodes, resolve a path, add, duplicate with fresh ids, delete, reorder, promote to a def. Node-importable and tested without a DOM, like `src/game/enemyspec/` |
| `src/game/enemyspec/schema.js` | New `ENTITY_FIELDS` export — label, control type, bounds, default per component field. Introduces no vocabulary: every component it keys off is already in `ENTITY_KEYS`. **As built (E2):** a second export, `motionFields(type)`, comes with it — motion params are per controller, so the type picker plus that controller's own params can only be assembled once the type is known, and `MOTIONS` is still the source of both the param list and its defaults |
| `src/game/enemyspec/generate.js` | **One** conversation entry point. `generateEnemySpec` becomes a thin single-turn call on the same core, so its behaviour and its suite are preserved. **As built (E3):** `chatEnemySpec` is that point; `composeChat` (exported, so the composer can price a turn), `unwrapReply` and `HISTORY_TURNS` come with it |
| `src/game/enemyspec/specdiff.js` (new) | Pure: two sparse specs in, touched paths out. Feeds the tree marks and the chat's change list. **As built (E3):** a primitive is a leaf and so is an array of primitives (`at`, `tags` read as one field), while an array holding objects is walked by index — because those indices ARE tree nodes. `summarize()` ships with it, for the checkpoint line |
| `src/game/enemystore.js` | **E6.** The delta store: edits by id, tombstones, additions, in-missions flags, guarded storage, and a one-shot read of E4's two keys so nothing already authored is lost. Imports nothing from `enemyspecs.js` — the reserved-ids argument goes away with the reserved ids, which is what makes the import one-way without a snapshot |
| ~~src/game/rosterspecs.js~~ | **Deleted in E6**, so it is no longer cited as a path. E4 put the roster store there — guarded storage, membership, enable flags, and (as built) the admission gate beside them. E6 moved the storage into `src/game/enemystore.js` and every policy (the mission dry run, never-empty, the last boss) into `src/game/enemyspecs.js`, where the merged list is |
| `src/game/enemyspecs.js` | **E6.** Becomes the enemy list, each entry carrying its own `behavior`; the `BEHAVIOR` map keyed by seven ids folds into the records and `BUILTIN_SPEC_IDS` is deleted. It imports the delta store and does the merge. `missionRoster()`, `missionSpecById`, `specIsFlying()` and `applyEnemyRoster()` keep their signatures, so `loadMission` and `generateLevel` are not touched at all. **E4:** Imports the roster store. `missionRoster()` filters the built-ins by their enable flag and appends enabled custom descriptors; the same module fills `missionSpecById`. The merge lives here, on one side of a one-way import. **As built (E4):** it also exports `BUILTIN_SPEC_IDS` (the reserved set both stores take), `applyEnemyRoster()`, `rosterEntries()` and `setEnemyEnabled()` |
| `src/editor/tools/firing-room.js` | **E6.** Reads the merged list instead of `MISSION_ENEMY_SPECS` plus `enemySpecMap()`, so its "Designed" optgroup and its built-in group collapse into one. **Not through `missionRoster()`** — that returns generator descriptors, and the Firing Room needs raw specs to `normalizeSpec`. It also needs entries whose in-missions switch is OFF, which are exactly the ones a test range exists to try. `enemyspecs.js` therefore exports the merged **records**, unfiltered, alongside the descriptor view |
| `src/game/customcontent.js` | **E6:** loses `listEnemySpecs` / `saveEnemySpec` / `deleteEnemySpec` / `enemySpecMap` and its import of `enemyspecs.js`. The weapon and legacy-enemy halves are untouched. **E4:** `saveEnemySpec` gains the built-in spec ids as its reserved set. It currently passes an empty one, so a library entry named "Husk Charger" slugs to `husk_charger` and would shadow a built-in once E4 merges the maps |
| `src/game/state.js`, `src/editor/editor.js` | One call each to apply the roster, mirroring the two `applyWeaponOverrides()` calls already there |
| `src/editor/editor.css` | New classes only, `ed-*`/`es-*`. Existing `wd-*`/`cfg-*` reused |
| `test/harness.mjs` | **As built (E1):** `windowListenerCount(type)`. The window listener stubs record instead of discarding, which is what lets a suite assert the tool released the keyboard. Cleared by each `installDom()` |

Conventions from `CLAUDE.md` that bind: guarded `localStorage` everywhere;
cross-page data read at load time; fallback discipline; no dependencies added.

## The seam

**Owns:** the tool, the tree and diff modules, **the enemy list's storage shape
and its merge**, `ENTITY_FIELDS`, the conversation entry point, and the reply
envelope.

**One list, and the file is one end of it (E6).** `src/game/enemyspecs.js` is the
enemies in the game — in git, reviewed, and read on every load. localStorage
holds only what differs from it. There is no "built-in" category on either side
of that line: every entry takes every verb, and an entry the file has never heard
of differs from one it ships only in whether anyone else has it.

| | |
|---|---|
| **The merge is one pass** | file → drop tombstoned ids → replace edited ids → append additions. A clean browser merges to exactly the file, which is why `levelgen-golden` cannot move under E6 and why a green golden file is the whole proof that it is a refactor |
| **The app never writes the file** | Export dumps the merged list into a textarea to paste and commit. Nothing about that round trip is automatic, and nothing needs to be: the file is already read every load, so committing it IS the import |
| **A delta is a whole record** | Not a field-level patch — see approximation 13 |
| **`behavior` sits beside the spec, not in it** | A record is `{ spec, behavior, inMissions }`. The EnemySpec format gains no key, so the boundary below still holds while every enemy gets an authored placement hint |
| **The merge is live, not module-eval** | `missionRoster()` merges on every call and `missionSpecById` is mutated in place — by `applyEnemyRoster()` eagerly and by the merge lazily, exactly as E4 already does. A merge computed once at import passes the golden and fails every live case, and module state survives between suites (only `localStorage` is refreshed per suite), so nothing in the bar would name the cause |
| **The file list stays exported as raw specs** | `test/audio.test.mjs` and `test/locomotion-characterization.test.mjs` read `MISSION_ENEMY_SPECS` / `MISSION_BOSS_SPEC` as fixtures — every shipped spec validates, its sound slots resolve, its locomotion is characterised. Those exports survive E6 as the file's specs unwrapped from their records. A fixture that changes when the browser does is not a fixture |
| **Nothing may delete the fallback out from under `loadMission`** | `src/mission/entities.js` resolves an unknown placement to a hardcoded `missionSpecById.husk_charger`. Under E6 that id is tombstonable, and a missing entry throws on the next line. E6 changes that one line to ask `enemyspecs.js` for the cheapest surviving entry — which is what approximation 5 already claimed was happening |
| **The boss slot needs its own floor** | `role: "boss"` is what keeps an entry out of ordinary missions, and E4 only applied that filter to custom entries because the file's boss was in a separate array. E6 applies it to every entry, or a 320-threat monster lands in a recon mission and the golden file explodes. Deleting or switching off the LAST boss is refused for the same reason the roster cannot be emptied: `fillEnemies(…, boss=true)` would silently promote the toughest ordinary enemy and the finale would just be a fight |

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
| `src/mission/combat.js`, `src/mission/input.js` | The playable soldier is the mission's `Soldier`. Focus is solved in the tool, not in the input layer |
| `src/mission/entities.js` | **One line, in E6, and no more:** the hardcoded `husk_charger` fallback becomes a call for the cheapest surviving entry. `loadMission` otherwise keeps resolving placements through `missionSpecById` exactly as it does now |
| `src/game/gen/levelgen.js` | It already accepts an arbitrary roster. Only what `missionRoster()` returns changes |
| ~~The `BEHAVIOR` map~~ | **E6 deletes it.** It was the authority for the seven built-ins because only they could have an authored hint. Once every entry is a record, every entry carries its own `behavior` and nothing derives one — which is what resolves approximation 6. The vocabulary it is authored against (`charger`/`shooter`/`turret`) is `fillEnemies`'s, unchanged |
| ~~`src/game/customcontent.js`'s library semantics~~ | **E6 deletes them.** The scratch library existed as a second-class holding pen for enemies the game could not place. Once there is one list, an enemy not in the roster IS the holding pen, so `listEnemySpecs` / `saveEnemySpec` / `deleteEnemySpec` / `enemySpecMap` go and the Firing Room's "Designed" optgroup merges into one. The weapon and legacy-enemy halves of that module are untouched |

**The roster is never empty.** Disabling the last enabled entry is refused, and a
merge that resolves to nothing falls back to the file as shipped. With an empty roster
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
| `test/levelgen-golden.test.mjs` | **The real guard on the roster merge, and E6's entire proof.** It calls `generateLevel` with no roster, so it goes through `missionRoster()` and freezes the enemy `type` at every placement. A clean store must leave the golden file untouched — byte-for-bit, not "close enough". If E6 moves it, E6 is wrong; reseeding the golden to make E6 pass would destroy the only evidence that a storage rewrite changed no gameplay |
| `test/content.test.mjs`, `test/tools.test.mjs`, `test/gen.test.mjs` | The three suites that imported the roster store directly. E6 deleted that module, so their roster sections moved onto `src/game/enemystore.js` rather than being dropped — the assertions about the gate, never-empty and the merge reaching generation all still hold |
| `test/audio.test.mjs`, `test/locomotion-characterization.test.mjs` | Both import `MISSION_ENEMY_SPECS` as a **fixture** — every built-in spec validates, its sound slots resolve, and its locomotion is characterised. They must keep reading the file, never the merged list: a fixture that changes when the browser does is not a fixture |
| `test/gen.test.mjs` | Every placed type resolves to a spec; placements stay inside the budget; a custom roster is respected; higher difficulty spends more. **As built (E4) it also carries the merge block** — empty-store baseline, admission refusals, `applyEnemyRoster` installing for the loader, generation actually placing a custom enemy, never-empty, and the all-disabled fallback. E6 **ports** that block onto the new store; it does not write it fresh, and it does not get to drop the cases whose gate moves |
| `test/content.test.mjs` | Store CRUD, id slugging, collision suffixing, store independence, and every store returning empty rather than throwing without `localStorage`. **The weapon and legacy-enemy assertions must not move.** Its EnemySpec-library assertions cannot be preserved — they call four exports E6 deletes, including "a library entry cannot shadow a built-in id", which is the rule E6 removes. They are replaced by the delta store's own, not kept |
| `test/mission-enemyspec.test.mjs` | `loadMission` produces one root per placement, loot on every root, kill credit and drops |
| `test/audio.test.mjs` | Every built-in spec validates and its sound slots resolve — moving the Sound rows to the spec node must not change what a slot means |
| `test/docs.test.mjs` | This document's citations. **The hazard E6 had to handle in its own commit:** deleting the roster store while this document still backtick-cited it failed the suite — a cited `src/` path must exist unless it is marked `(new)`. Its rows are struck through and name the module in prose instead |
| Serve-check | New files return 200 under `python3 -m http.server` |

## Approximations

| # | Where it is not exact | What catches the failure |
|---|---|---|
| 1 | **A chat reply carries the whole spec, not a patch.** `tech/enemyspec-llm.md` §2.2 specifies an `EnemyPatch` format that would cost far fewer tokens. Whole specs keep exactly one acceptance path | A token readout in the composer. If sessions start failing on context, the patch format is the escape hatch and is already specified |
| 2 | **History is prose-only and bounded.** Superseded specs are never re-sent; the current one always is | State can never be stale — only intent can drift. The failure is the model forgetting an instruction from ten turns back, not producing a wrong enemy |
| 3 | **No streaming, by choice.** `chatStream()` exists and works; the reply is one JSON object, which cannot be usefully rendered token by token | A spinner. Splitting the reply into prose-then-fenced-JSON would enable it and weaken the one-object discipline that keeps parse failures rare |
| 4 | **The model rewrites things you did not ask about.** Unavoidable while every reply is a whole spec | The diff and the touched-node marks, in the rail, without reading JSON |
| 5 | **Roster admission dry-runs longer, not more realistically.** `dryRunSpec` builds a single flat platform and one stationary dummy; raising `seconds` does not add terrain, a squad, or a mission's length | Engine-clamped `limits`, and `loadMission` falling back on an unresolvable id — **as built under E4 that fallback was the hardcoded `missionSpecById.husk_charger` (`src/mission/entities.js`), not "the cheapest"; E6 made the claim true — `cheapestMissionSpec()` — because `husk_charger` became deletable (see the seam).** Making the arena realistic means editing `src/game/enemyspec/dryrun.js`, which this spec does not own |
| 6 | ~~**A custom enemy's placement hint is derived from `role`, and the derivation is lossy.**~~ **Resolved by E6/E7, not mitigated.** It existed only because a hint could not be attached to an enemy the file did not ship. Once every entry is a record, `behavior` is an authored field on all of them, and `BEHAVIOR` / `ROLE_BEHAVIOR` are both deleted. **The derivation survives in exactly one place: as the SEED value when a record is first created** — ＋New, template, Duplicate, a chat landing and the migration all produce a spec rather than a record, and `undefined` is not a safe default (`fillEnemies` reads the field directly, so it would mean "never preferred on a perch" and quietly under-place the enemy). Seeded once from `role`, then authored | The Placement column in the list and the Placement control in the workspace — a wrong seed is visible and one click from fixed, which is what "derived" never was |
| 7 | **As built (E2): confirmed and pinned by a test.** **Delete does not repair dangling references.** Removing an entity leaves any emitter ref, spawn ref, `transformTo`, `telegraph.part` or action target that named it | Re-validation marks the offending nodes from paths the validator already produces. **Except references inside expression strings** — `alive('shieldPod')` parses fine and validation will not flag it. That case is silent, and is the known hole |
| 8 | **Brain editing is structural only.** Add, remove and reorder states, tracks, steps and utility actions, and pick an action kind; a step's arguments stay a raw JSON field | Nothing — a deliberate scope line. Full argument UI is per-arg metadata for all 18 actions, and the chat covers the same ground until that is worth building |
| 9 | **`ENTITY_FIELDS` invents bounds.** `RANGES` covers fifteen paths and none of the `MOTIONS` params, `contact.knockback`, or emitter offsets, so those sliders carry new numbers | They are authoring bounds, not validity rules — the same status `EFFECT_SCHEMA`'s ranges already have. A hand-authored value outside a slider's range stays legal. The test can only assert that `ENTITY_FIELDS` keys off components in `ENTITY_KEYS`; it cannot check leaf names, because `ENTITY_KEYS` names components |
| 10 | **Custom enemies append to the built-ins.** A custom enemy competes with six built-ins for each placement | The per-entry enable list: built-ins can be switched off individually. Whether appending is the right default is a design question, not an engineering one |
| 11 | **The roster is global and permanent, not per-campaign.** `design/enemies.md` wants each campaign to generate its own ecosystem and enemies to persist as campaign data. This is one browser-local list applied at `createState()`, identical in every campaign | Nothing. Explicitly deferred, not solved. It is a campaign-state feature, not a tool feature |
| 13 | **A delta is a whole record, not a field-level patch.** Edit one enemy's health and your copy wins that id entirely — so a later commit that rebalances a *different* field on the same enemy will not reach you, even though it would reach an enemy you never touched | The `edited` mark, and `↺` to drop the delta and take the file's version. Field-level merging would need a three-way diff against the version you branched from, which is a version-control feature, not a tool feature |
| 14 | **This browser is the authority on what enemies exist.** Clear site data and unexported work is gone; a deploy serves the file, so nothing you have not committed reaches anyone else | Export, and the fact that it is the same contract weapons, config, controls and sound already have. Import covers browser-to-browser transfer, by paste — there is no file picker, and no attempt at sync |
| 15 | **Import merges by id with no per-row choices.** An incoming id that the file has becomes an edit, one it does not becomes an addition, and each spec must pass `accept()` or is skipped and named. There is no skip/overwrite/keep-both prompt | The skip list in the message slot, and `↺` / Delete afterwards. Per-row collision UI is more machinery than the transfer case has earned; the settings tab's Import has none either |
| 16 | **E4's stores are migrated once, then the code is disposable.** The first read converts `sidescroller.enemyroster.v1` and the EnemySpec half of `sidescroller.enemyspecs.v1` into records. **What each field becomes:** `inMissions` from the roster store's enable flag, or **false** for a library entry (it was never placeable, so migration must not put it in a mission); `behavior` seeded from `role` like any other new record; `threat` left alone, because `normalizeSpec` defaults it. It exists so that a day-old feature does not silently eat work already done in it | Nothing automated. Delete the migration once it has run — no test can tell you it is still needed |
| 17 | **An id is the one thing Rename does not change.** The delta store keys by id and E4's id keeping survives, so renaming an entry that already exists relabels it without re-slugging. "Full CRUD on every row" does not include changing a row's identity — Duplicate is how you get a new id, and it is the only way | Nothing. The id is shown next to the name everywhere and is visibly not an input |
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
