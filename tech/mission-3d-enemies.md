---
type: tech
category: scenes
status: unbuilt
resolution: sharp
needs: [mission-3d, enemyspec]
related: [mission-3d, mission-3d-looks, art-direction]
---

# Mission 3D enemies

This spec covers how the Blender enemy models from the graphics tester (`graphics-tester/enemies.js`, `graphics-tester/models/enemies.py`) replace the block-built enemies in the game's 3D mission view. It implements the "Enemies: 3D models" row of `design/mission-3d.md`.

Each enemy keeps the model, colours and motions Bo approved in the tester. In the tester each motion runs on its own fixed clock; in the game, motions are driven by what the enemy is actually doing.

Four things the tester shows did not exist in the game. Bo asked for all four, so the game gains them first, in 2D as well as 3D:

| Tester look | Game change | Slice |
|---|---|---|
| Rounds leaving one by one | A bug fix: `burst` fires its rounds in sequence, always | M1 |
| The Siege Automaton's overload, with its pod and cannon blowing first | Enemy data only: the Automaton's death spawns a timed overload that blows on schedule | M3 |
| The Husk Charger's crouch and lunge | Enemy data only: a real stop, telegraph and lunge | M4 |
| Camera shake | Shake raised from what enemies do, through the mission's own shake | M5 |

Every other difference is listed under Approximations.

The ten models in `enemies.glb` are:

- Husk Charger
- Lurk Gunner
- Spore Wisp
- Strafe Raider
- Cowardly Duelist
- Sky Duelist
- Iron Moth
- Assault Bot (`breach_hopper`)
- Siege Automaton
- Floating Factory

Two more models draw spawned enemies: the factory drone and the seeker missile.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| M0 | **The model file moves to the game.** `enemies.py` writes `enemies.glb` into `src/mission/view3d/models/`. It exports with its own `export_scene.gltf` call, not through `kit.py`'s export, so that call's path is what changes. The tester loads the file from there. The `.blend` and `.py` stay in the tester | None |
| M1 | **`burst` fires its rounds in sequence (a bug fix).** Today `patternAngles` returns every burst angle at once and `doFire` spawns them on one frame. That makes `burst` the same as `aimed` with a wider jitter. Nothing documents a burst as simultaneous: the name means a sequence, and so does every authored use. From this slice every burst fires in sequence, and there is no simultaneous mode to choose: <ul><li>A burst step may name `interval`, the seconds between rounds. One that does not uses the default spacing (P1). An `interval` must be above 0.</li><li>The first round leaves when the step runs. The rest are kept as pending rounds on the emitting entity and leave one interval apart, each a full fire (projectile, `muzzleFlash`, sound, and a bump of the entity's new fire count, which M5 puts on the wire). Each pending round carries what it fires, because one entity can own several emitters. A new burst from an entity that still has rounds pending replaces them.</li><li>The same applies to a `spawn` step with `pattern: "burst"`, which today also creates every entity on one frame: the pending-round mechanism is shared by `fire` and `spawn`, and `interval` joins both steps.</li><li>`fire` stays non-blocking. Pending rounds live on the entity, not the track, so a burst inside an `if` branch or an event handler, which run instantly, behaves the same.</li><li>The direction is resolved once, at the first round, and each round adds the existing jitter.</li><li>Pending rounds are dropped if the emitting part dies or is disabled, or if its root dies.</li></ul> `interval` joins both steps' schema entries, validation and `vocabularyDoc()`. The Designer edits step arguments as raw JSON and needs nothing new. The roster's five burst steps get the tester's spacing: the Assault Bot's punches 0.31s (`punchCombo`, `screenLeap`), its rifle 0.08s (`rifleBurst`, `screenLeap`), and the Siege Automaton's cannon 0.11s (`cannonBurst`). Each action's recovery is longer than its burst, so a burst finishes inside its own commitment. An enemy made in the Designer or by the LLM that uses `burst` is fixed the same way | **Changed, 2D and 3D**: bursts are spaced |
| M2 | **A dead root's spawns live on.** `updateSpecEnemy` returns early for a dead root, the mission builds `scene.enemies` from live roots only, and both 2D draw loops in `mission.js` and `createEnemies` skip dead roots. So anything a root spawned is frozen, invisible and unhittable the moment the root dies. The runtime's own comment says spawned entities should outlive their root ("a dying boss's missiles don't vanish mid-air"). From this slice, a dead root's `spawned` list keeps being stepped: `updateSpecEnemy` steps it for a dead root, keeping the dead root's clock running so its spawn-rate window ages out, while its brain, motion and contact stay off. Every host gates that call on `r.alive` today, so each host drops its gate: `_updateEnemies` in the mission, and the Firing Room's step, damageable set and draw. The list is in `scene.enemies` and drawn by both views until each entity dies or expires. The Enemy Designer's preview gates it too: for a dead root it only counts toward its reset. It now steps the dead root, and resets 1.2s after the dead root's `spawned` list empties rather than 1.2s after the death, so a death's spawns play out in the preview. The dry run calls the runtime without a gate and gets it for free. In the shipped roster this affects: <ul><li>the Siege Automaton's death flash, `deathBlast` (60 damage across 180px) and 20 shrapnel, which now land (and M3's overload, which is built on it)</li><li>its missiles in flight</li><li>the Iron Moth's seekers and their shards</li><li>the Floating Factory's drones, which have no lifetime and keep hunting until shot</li></ul> | **Changed, 2D and 3D**: a dead enemy's blast, missiles and drones carry on |
| M3 | **The overload, as enemy data.** No engine code: the Automaton still dies at 0 health like every enemy, so kill credit, loot, burn and the Designer's save check are untouched. What its death spawns changes, using two things the format already has, `on.destroy` spawns and `link.onParentDeath: "transform"`: <ul><li>The root's `on.destroy` spawns one `overload` entity in place of today's flash, blast and shrapnel. Its body is authored like the existing `deathFlash`: `gravity: 0`, `ghost: true`, `motion: static` (normalize gives any non-flying motion gravity 1, so all three must be stated). It has no health, no contact, a 2.4s `life.ttl` and a 2D look (P2). Its own `on.destroy` spawns the existing `deathFlash`, `deathBlast` and 20 `deathShrapnel`, and plays `impact.explode` at gain 1.5. The Automaton's `sounds.death` becomes the ordinary `enemy.death`, because the mission plays it at the moment of death, which is now the overload's start.</li><li>`missilePack` and `cannonArm` change `onParentDeath` from `destroy` to `transform`. When the root dies, each part still alive is replaced, at its own position, by a charge: `podCharge` (0.4s ttl) and `cannonCharge` (1.0s ttl). Each charge has the same `gravity: 0`, ghost, static body and the visual of the part it replaces (the pod's 54x34 `#7d3f34`, the cannon's 62x28 `#8b98a8`), so in 2D the part stays where it was until it blows. Their `on.destroy` spawns what the part's own death spawns: a `microBlast` plus 8 shrapnel for the pod, a `microBlast` for the cannon. A part already shot off has no charge, so it cannot blow twice.</li></ul> All of these are spawned under the dead root, so M3 needs M2. Worst case is 22 spawns in one second, inside the Automaton's limits (40 per second, depth 4). To confirm at build: a spawned entity's ttl ticks inside `updateTree`, so the charges and the overload expire on time | **Changed, 2D and 3D**: the Automaton's death leaves a 2.4s overload; its pod and cannon blow at 0.4s and 1.0s, then the blast |
| M4 | **The Husk Charger stops, crouches and lunges.** It has no brain today and only chases. It gets a utility brain with one attack, used when it is within a trigger distance (P3) of a soldier: <ol><li>it stops (`setMotion` to `static`)</li><li>it holds a 0.6s telegraph: the tester's crouch</li><li>it dashes at the target for 0.5s at a set speed (P4): the tester's lunge</li><li>it waits, standing, for a recovery (P5)</li><li>it goes back to chasing</li></ol> The stop and the recovery are steps, not the action's `windup`/`recovery`, because a utility windup only counts down and the root's standing `chase` would keep running through it. A cooldown (P6) follows. Otherwise it chases as now | **Changed, 2D and 3D**: the Husk Charger stops, telegraphs and lunges |
| M5 | **What an enemy is doing, as one record, and the shake it raises.** A three-free module reads an EnemySpec root and keeps a small record per root: <ul><li>speed, airborne, a landing edge, and distance walked</li><li>the committed utility action, its phase, and whether it is new</li><li>each part's fire edges, telegraph and alive state</li><li>each new spawn and each spawned entity's death, by def id (so the overload's start, its two charges and its blast)</li><li>the root's death edge</li></ul> The mission runs it once per rendered frame over `scene.specRoots`, both on a host and on a room viewer, where it reads applied snapshots. The 3D view reads the same records from the mission and keeps none of its own. **Shake**: the same module holds the tester's shake table as data, per spec id and event. That covers every `kick` in the tester's FX tables (footfalls by distance walked, punches, cannon rounds, leaps and landings) and every explosion's shake, which the tester computes as `(shake ?? 2) × size / 52`. So the death blast (size 110, shake 14) is 29.6, the pod and cannon blasts (size 52, shake 3) are 3, and a seeker missile's impact (size 52, shake 2.5) is 2.5. All three of those spawn the same `microBlast`, so the table keys each explosion on the death of the entity that spawns it (`overload`, `podCharge`, `cannonCharge`, `seekerMissile`), not on the blast's def. The wreck's last blast 3.8s after the overload ends (size 40, shake 3) is 2.3; the motion table carries that wreck time, so the record raises it as an event. **Shake operations**: the mission's shake gains "raise to at least k", and kicks use it locally. The tester combines kicks by taking the larger, and this operation does exactly that, so repeated footfalls and cannon rounds do not stack. 2D and 3D shake together from one value, and the camera solve is untouched. The existing `shk` is fixed in the same slice: its `min(cap, shake + amount)` clamps the whole value down to the cap, so the player's own shot would cut a death blast's shake to 0.5. `shk` now only ever raises the shake: an event whose cap is below the current shake leaves it alone. The feedback wire format is unchanged. Amounts are converted to the mission's units (the tester jolts ±k/2 world px, the mission ±7 × shake px, so k/14) so peaks match the tester's at zoom 1. Kicks are cosmetic and local, never sent: a room viewer raises its own from its own records, and the headless room raises none. **Wire**: three facts reach a viewer wrongly today. <ul><li>**Fire**: a 0.055s `muzzleFlash`, quantised to 0.1 and sent a few steps apart, mostly never arrives. Each entity gets a fire COUNT, bumped once per round, and the wire carries it beside the flash. A viewer that sees the count rise sets its own `muzzleFlash`, so its muzzle glow shows on every round.</li><li>**Spawns**: `applyRoot` mirrors `spawned` by position and def id, so a drone replaced between snapshots never shows up as new. Each spawned entity gets a serial from its root, the wire carries it, and `applyRoot` rebuilds an entry whose serial differs. A viewer's rebuilt entry adopts the wire's serial, overwriting the local one `spawnFromDef` gave it, or every later snapshot would rebuild it again and re-fire its `on.spawn`.</li><li>**The committed action**: its id, phase and a commitment serial join `packRoot` next to `brainState.current`. The serial is bumped where the brain makes a commitment.</li></ul> The two counters are written by the runtime and read by nothing in the simulation | **Changed, 2D and 3D**: enemies shake the camera. A viewer's muzzle glow shows more often |
| M6 | **The seven roster models.** The GLB loads once per page, as the armour does. A root is drawn as one rigged model instead of part blocks when: <ul><li>its spec id has a rig</li><li>the rig has an entry in the motion table</li><li>every child part with a box has a bone, or a hinge the rig declares (the Iron Moth's two wings)</li></ul> So the three new rigs keep their blocks until M7–M9. Each model is a `SkeletonUtils` clone, placed at the root box's centre, scaled to the box and turned by `facing`. The Iron Moth always faces the camera, as in the tester. **Colour and flash per part**: each root's Shell material is its own and carries a small per-bone table (tint, flash) that its shader reads through the vertex's bone index. So each part takes its spec colour and flashes alone, and all geometry stays shared and is never disposed with a root. The seven take a flat tint in the spec colour, as in the tester. A dead or disabled part has its bone collapsed. The Iron Moth's wings are separate unskinned meshes with no bone index, so each wing has its own Shell material per root, tinted and flashed directly like a block part, and a dead wing hides its hinge. Idle and move come from the record. The attack pose runs through the telegraph, with a kick on each fire edge. The Husk Charger crouches through its telegraph and lunges while it dashes. Covers the Husk Charger, Lurk Gunner, Spore Wisp, Strafe Raider, Cowardly Duelist, Sky Duelist and Iron Moth. Health bars and the tells' halos (`cues`) are unchanged | Changed (3D only). **First playable** |
| M7 | **Assault Bot.** <ul><li>Runs with planted feet.</li><li>`rifleBurst`: the rifle comes up through the windup and kicks on each round's fire edge.</li><li>`punchCombo`: the fist cocks back through the windup and jabs on each round's fire edge.</li><li>`screenLeap`: it crouches through the windup and tucks with its legs drawn up while airborne. It lands hard on the landing edge, then the punch or rifle follows on its own fire edges.</li><li>Any other airborne time (`vaultUp`, a fall) gets the tuck.</li><li>The rifle aims at the nearest living soldier, clamped as in the tester.</li></ul> Its bones are named after its parts, so each part takes its own colour | Changed (3D only) |
| M8 | **Siege Automaton.** <ul><li>A stomping walk.</li><li>`cannonBurst`: the cannon charges through the windup, the far hand braces it (arm IK), and it recoils on each round's fire edge.</li><li>`missileVolley`: the pod lid opens, the left arm points at the target, and each fire edge looses its pair.</li><li>A jump crouches, tucks and lands. A cannon fire edge while airborne fans the cannon, which covers `jumpBarrage` and `closeQuartersBurst`. `clearLedge` and `emergencyLeap` are jumps with no shot.</li><li>A pod or cannon shot off in a fight is flung with the tester's fling for that bone, then hidden.</li></ul> **The overload** is drawn on the `overload` entity: the Automaton's rig stands where it is, the core swells and the hull shudders. The pod and cannon fly when their charges die. At the overload's death the remaining parts fly and the hull falls back and burns until the record's wreck-end event. The view keeps the wreck in its own map after the overload entity is gone, and disposes its skeleton with it | Changed (3D only) |
| M9 | **Floating Factory, drone and missile.** Hover, drift and thruster pods. The five pistons rise toward the next launch, timed from the last spawn the record saw, and blink when full. The bay doors open and the crane lowers the drone ahead of the predicted launch. The factory's `drone` spawns draw as `factory_drone` and the Siege Automaton's `seekerMissile` spawns as `seeker_missile`, each facing its direction of travel. When a spawn serial changes the heading resets, so a replacement drone does not inherit its predecessor's | Changed (3D only) |
| M10 | **Enemy effects.** The tester's pooled effects (smoke and glow billboards, sparks, debris chunks, rings), attached by sockets on bones. Bolts and homers stay out, because the game already has real shots and real spawned drones and missiles. The three enemies' FX tables are triggered from the records, not from the tester's cycle times. They cover: <ul><li>visor and jet glows, gun and cannon shots, punches</li><li>footfall dust, launch and landing rings</li><li>stack smoke and steam, the missile beam</li><li>factory lights, welding and launch flashes</li><li>the Siege Automaton's overload strobe, steam and sparks</li></ul> `microBlast`, `deathFlash` and `deathBlast` are drawn as the tester's explosion at the entity's own size, in place of a glowing sphere. An `enemyFx3d` bool (Viewport, local, live, default on) turns the effects off. Shake is M5's and is not affected by it | Changed (3D only) |

**The tester follows each model slice.** From M6 on, a slice deletes its enemies' entries from the tester's `ANIM`, `FX` and `SOCKETS` and moves them into the game, as the README's promotion rule asks. The tester then draws those enemies through the game's `createEnemies`. Each of its modes plays a scripted fake entity, with:

- box position and `facing`
- `telegraph`
- the fire counts
- the committed action
- `spawned`, including the overload and its charges

It runs M5's module over those entities, so Bo still compares Idle, Move, Punch combo and the rest side by side, with their shake. `graphics-tester/splash.js` stages raw per-id groups, which stop existing at M6. M6 therefore gives the tester module a staging list of game-rig models posed by the game's motions, and splash keeps its `ENEMY_STAGE` table on top.

**Order.** The landing order is the table's order:

- M1, M2 and M4 change gameplay and are independent of each other.
- M3 needs M2.
- M5 needs M1 and M3, whose rounds and overload it records.
- M7–M9 are independent of each other.
- M10 needs M7–M9.

**Acceptance.** M1–M5 by playing them, in either view. M6–M10 by Bo's eye, in the tester and in a mission with V toggled.

## Reuses

| What | Where | Why |
|---|---|---|
| The approved models, motions, IK, sockets, effects, overload sequence, kicks and explosion shakes | `graphics-tester/enemies.js`, `graphics-tester/enemy-fx.js`, `graphics-tester/models/enemies.py` | What is being promoted. Numbers carry over unchanged unless a motion is re-timed to an event |
| Fire, spawn, damage and death | `src/mission/enemyspec/runtime.js` (`doFire`, `patternAngles`, `spawnFromDef`, `applyDamage`, `killEntity`, `updateSpecEnemy`) | `doFire` sets `muzzleFlash` once per call and `patternAngles` returns every burst angle at once, which M1 changes. `updateSpecEnemy`'s early return for a dead root is what M2 narrows. `killEntity` already fires `on.destroy` before it applies each child's `onParentDeath`, and `transform` already spawns the `transformTo` def at the child's position, which is all M3 uses |
| Instant step contexts | `src/mission/enemyspec/runtime.js` (`execStepsInstant`), `src/game/enemyspec/validate.js` (`instantOnly`) | Why M1's pending rounds live on the entity rather than block a track |
| The committed action and its phases | `src/mission/enemyspec/brain.js` (`bs.commit`: `action`, `phase`) | What M5 reads locally and what the wire carries |
| The step and entity vocabularies as data | `src/game/enemyspec/schema.js` (`ACTIONS`, `PATTERNS`), `src/game/enemyspec/validate.js`, `src/game/enemyspec/normalize.js` | M1's `interval` is a step argument. The validator already checks that a `transformTo` names a def, which covers M3 |
| The mission gate | `src/game/enemyspec/dryrun.js` (`killable`), `src/game/enemyspec/generate.js` (`accept`) | Unchanged: the Automaton still dies on lethal damage |
| A dash with a telegraph | `src/game/enemyspecs.js` (the Cowardly Duelist's `lunge`) | M4's attack has the same dash, with a stop and a standing recovery added as steps |
| Root stepping, the damageable set, kill credit, the draw gates | `src/mission/mission.js` (`_updateEnemies`, `scene.enemies`, `_damage` / `_kill` / `_lastAttacker`, `_counted`, the two `if (r.alive) drawSpecEnemy` loops), `src/editor/tools/firing-room.js` (the same three gates) | M2 drops the gates for a dead root's spawned list |
| Shake, one value for both layers | `src/mission/mission.js` (`shake`, the `shk` case of `applyFeedback`, the once-per-frame roll) | M5's new operation writes the same value, so the invariant in `src/mission/camera.js` holds and 2D shakes too |
| The enemy walk, the tells' halos, the block fallback | `src/mission/view3d/enemy.js` (`createEnemies`, `cues`), `src/mission/enemyspec/render.js` (`drawSpecEnemy`, which already walks `spawned`) | A rigged model is drawn where the blocks are, for the same entities. Enemies with no rig keep the block path |
| Identity map, hit flash and telegraph colours | `src/mission/view3d/actors.js` (`ModelMap`, `applyFlash`) | One model per root, made on first sight. The map disposes anything a frame does not visit and `keep()` refuses, so M8's wreck, which outlives its entity, lives in the view's own map |
| Load-once GLB, shared geometry, cubes until it arrives | `src/mission/view3d/armour.js` | Same pattern and failure rule: if the load fails, the blocks stay |
| `viewY`, `setColor`, `disposeTree` with `userData.shared`, halo pool | `src/mission/view3d/util.js` | The y-flip and spec colours. Rig geometry is marked shared so `disposeTree` never frees it. It frees materials but not a skeleton's bone texture, so the rig disposes each skeleton itself |
| Per-deploy build, per-frame sync, dispose | `src/mission/view3d/index.js` | `level` owns the effects pool, as it owns `effects` and `lasers` |
| Snapshot packing | `src/net/mission-wire.js` (`packEntity`, `packRoot`, `applyRoot`) | Where the fire count, spawn serial and committed action join the wire |
| GLTFLoader and `SkeletonUtils` from the import map (`three/addons/`) | `index.html` | Each skinned enemy needs `SkeletonUtils.clone` for its own skeleton; plain `clone()` shares the bones |
| A model folder copied whole when the URL is templated, followed when literal | `build.mjs` | `enemies.glb` ships in `dist/` with no build change |
| Viewport config group, `live` + local | `src/game/config.js` (`laserSight3d`, `cape3d`) | Precedent for M10's knob |
| Scene and ctx scaffolding for a headless enemy run | `test/enemyspec-runtime.test.mjs` | The cases for M1–M5 drive real roots the same way |

## Where the code goes

| Path | What |
|---|---|
| `src/mission/enemyspec/runtime.js` | M1: pending burst rounds on the emitting entity, for `fire` and `spawn`, and the fire count bumped per round. M2: stepping a dead root's `spawned` list and its clock. M5: the spawn serial in `spawnFromDef` |
| `src/mission/enemyspec/brain.js` | The commitment serial, bumped where a commitment is made (M5) |
| `src/editor/tools/firing-room.js` | Steps, hits and draws a dead root's spawned list (M2) |
| `src/editor/tools/enemy-designer.js` | The preview steps a dead root and resets after its spawned list empties (M2) |
| `src/mission/enemyspec/motion.js` (new) | M5's record and shake table. Three-free and DOM-free, so the mission, the view, the tester and a suite can all import it. Records live in a map the mission owns, never on an entity |
| `src/game/enemyspec/schema.js`, `src/game/enemyspec/validate.js` | `interval` on `fire` and `spawn` bursts, in `vocabularyDoc()` (M1). Normalize passes step arguments through untouched |
| `src/game/enemyspecs.js` | M1: intervals on all five burst steps. M3: the Automaton's `overload`, `podCharge` and `cannonCharge` defs, its new `on.destroy` and `sounds.death`, and `transform` on the pod and cannon. M4: the Husk Charger's brain |
| `src/mission/mission.js` | M2: `_updateEnemies` steps dead roots too, and `scene.enemies` and both draw loops include a dead root's spawned list. M5: the "at least" shake operation, `shk` that only raises, running the records once per rendered frame, applying kicks, and exposes the records to the view |
| `src/mission/view3d/enemyrig.js` (new) | The GLB load (once per page); the per-root clone, Shell material and per-bone tint/flash table; bone collapse; sockets; skeleton disposal; and the bone poser with the leg and arm IK |
| `src/mission/view3d/enemyanim.js` (new) | The per-spec motion table, keyed by spec id. It reads the mission's records and poses through the rig. The Siege Automaton's overload and wreck live here |
| `src/mission/view3d/enemyfx.js` (new) | The effects pool and the per-spec FX table (M10) |
| `src/mission/view3d/models/enemies.glb` (new) | Exported by `graphics-tester/models/enemies.py` |
| `src/mission/view3d/enemy.js` | Picks a rig or the blocks for each root. Draws a dead root's wreck and spawned list, and draws the mapped spawned defs (`drone`, `seekerMissile`) as their models. Runs the effects after the pose |
| `src/mission/view3d/index.js` | Builds and disposes the effects pool per deploy; reads `enemyFx3d` |
| `src/net/mission-wire.js` | M5: the fire count on `packEntity` and a viewer-side flash from it; spawn serials and the committed action on `packRoot`/`applyRoot`, which rebuilds a spawned entry whose serial differs |
| `src/game/config.js` | `enemyFx3d` in Viewport, local, live (M10) |
| `test/enemy-motion.test.mjs` (new) | M5's suite |
| `test/mission-enemyspec.test.mjs` | M3's kill-credit case, since kill credit is the mission's bookkeeping |
| `graphics-tester/models/enemies.py`, `graphics-tester/enemies.js`, `graphics-tester/enemy-fx.js`, `graphics-tester/splash.js`, `graphics-tester/README.md` | M0: export into the game. From M6: the tester drives the game's enemies with scripted fake entities and loses each promoted entry, and its staging list keeps splash working. The README's enemies row records this |

| Convention | Applies as |
|---|---|
| The view reads and never writes | The view keeps wrecks, effect state and the predicted launch in its own maps. It caches nothing on an entity and never reads `scene.rng` |
| Cosmetics may use `Math.random` | The effects, the wreck's fling, the overload's shudder. Records and kicks use no randomness |
| Gameplay draws use `root.rng` | M1's per-round jitter and M4's utility noise, so a mission still replays from its seed |
| New gameplay state on the wire in the same commit | M3 adds none: its entities are ordinary spawns, which the wire already carries. M1's pending rounds produce projectiles, which are already on the wire. Their next-round timer is the room's alone |
| One path for local and room | Poses and kicks come from records built only from wire fields, so a room viewer sees and feels what the host does |
| Shared GPU resources | All rig geometry and the Detail material are marked `userData.shared`. Per-root state is the Shell material, its small per-bone table, and the skeleton |
| Budget | Measured from the current `enemies.glb`: the Siege Automaton has 3,492 triangles, the Assault Bot and the Factory about 1,940 each, and the rest 262–1,208. Every model is two draw calls except the Iron Moth, whose separate wing meshes make it six. The file is 1.4MB |

## The seam

| Owns | Must not touch |
|---|---|
| The burst's spacing, a dead root's spawned list, the Siege Automaton's death spawns, the Husk Charger's brain | Every other enemy's behaviour, the brain's arbitration, `scene.rng` |
| The records and the shake they raise, through one new operation on the mission's shake | The camera solve and the feedback wire format. Shake reaches the camera only through the mission's existing `shake` value |
| Everything drawn for an EnemySpec root that has a rig: its spawned drone and missile models, its overload and wreck, its effects | The block path for roots without a rig |
| The fire count, spawn serial and committed action, on the entity and on the wire | Any other wire field. `WIRE_ACTIONS` and its order are unaffected |
| The tester's enemy subjects, which become a harness for the game's modules | `src/mission/mission.js` still never imports `three` or `src/mission/view3d/` |

## Must not regress

`node test/run.mjs` fully green on every slice.

**M1–M4 change gameplay on purpose, so goldens may change.** Each golden is re-recorded only in the slice that changes it, and the commit message names each fixture or snapshot that moved and why.

| Golden | May move |
|---|---|
| `test/levelgen.golden.json` | Never. Placement does not read behaviour |
| `test/locomotion.golden.json` | Only on `roster:breach_hopper` and `roster:siege_automaton` (M1) and on the Husk Charger's fixture (M4). The harness never damages anything, so M2 and M3 cannot move it |

| Suite | What it pins |
|---|---|
| `test/enemyspec-runtime.test.mjs` | **M1**: a three-round burst at 0.08s leaves three projectiles, each within one frame of 0.08s after the last, and bumps the fire count three times. Rounds inside an `if` branch are spaced too, a `spawn` burst is spaced, pending rounds are dropped if the part dies, and a second burst replaces the first's pending rounds. **M2**: the Automaton's `deathBlast` damages a soldier beside it and expires. A dead Factory's drone is still stepped, hittable and killable. **M3**: a killed Automaton spawns the overload, which takes no hits, does not move and expires at 2.4s. The pod's and cannon's charges stay at their parts' positions and blow at 0.4s and 1.0s with their blasts, and the death blast follows the overload. An Automaton whose pod was shot off first gets no pod charge |
| `test/mission-enemyspec.test.mjs` | **M3**: in a real `Mission`, kill credit for the Automaton goes to the soldier who killed it, at the moment of death |
| `test/enemyspec.test.mjs` | The validator accepts `interval` and rejects 0 and below. The vocabulary lists it. New cases, since nothing tests the Siege Automaton by name today: it passes `accept()`, with its new defs |
| `test/gen.test.mjs` | A new case switches the Siege Automaton out of missions and back in. Placement, threat and budgets are unchanged |
| `test/enemy-motion.test.mjs` (new) | <ul><li>A real Assault Bot leaping records `screenLeap`, then airborne, then a landing. Its `punchCombo` records two `fistArm` fire edges.</li><li>A Siege Automaton `missileVolley` records two `missilePack` fire edges.</li><li>A Floating Factory records a new spawn about every 7s.</li><li>A killed Automaton records the death edge, the overload's spawn, the pod charge at 0.4s, the cannon charge at 1.0s, the overload's end at 2.4s and the wreck end 3.8s after that. Its kicks are 29.6 at the blast and 2.3 at the wreck end, before conversion.</li><li>Two kicks in a row leave the mission's shake at the larger of the two, not their sum, and a `shk` event with a lower cap does not cut a larger shake down.</li><li>The pod charge, cannon charge and a seeker impact raise 3, 3 and 2.5 before conversion.</li><li>A Husk Charger records a stop, its telegraph and its dash.</li><li>The same run, packed and applied through `src/net/mission-wire.js` only every few steps, gives the viewer's copy the same events, including a drone replaced between two snapshots.</li></ul> |
| `test/mission-net.test.mjs` | The snapshot still round-trips: the brain state, the action order, and the count of local knobs a room refuses (M10 adds one) |
| `test/mission-golden.test.mjs`, `test/mission-divergence.test.mjs` | The twice-run self-check still passes, because M1's jitter and M4's noise are seeded. M5's counters and kicks change no gameplay. Drawing stays invisible to the simulation |
| `test/tools.test.mjs` | The Firing Room and the Designer preview still draw. The pause menu's settings are pinned by name, and M10's knob is added here, to `test/mission-net.test.mjs`, and to the Viewport row of `design/pause-menu.md` |
| `test/docs.test.mjs` | This spec's citations |
| CI `node build.mjs` | `enemies.glb` is reached and copied |

From M6 on, the check is by eye. Each slice gets two headless screenshots: the tester, for each enemy and mode the slice touched, and a 3D mission frame from a generated level that contains those enemies.

## Placeholders

The tester never had these values, so no number for them was ever approved. Bo replaces them. Until then, each takes the value below, chosen to match what the roster already does.

| # | What | Placeholder | Why this value |
|---|---|---|---|
| P1 | Spacing for a burst that names no `interval` | 0.1s | The middle of the authored spacings |
| P2 | The overload's look in 2D | The Automaton's 78x164 body box in the death flash's orange (`#ff7a1a`) | In 2D the robot's parts vanish at death, so the box keeps a warning standing where it was, sized like the body the player was fighting |
| P3 | Husk Charger lunge trigger distance | 150px | Inside the Cowardly Duelist's 240px, because the Husk is faster on foot |
| P4 | Husk Charger lunge speed | 520px/s | The Cowardly Duelist's lunge |
| P5 | Husk Charger standing recovery after a lunge | 0.6s | Long enough to punish, like the Duelist's 0.8s, for a weaker enemy |
| P6 | Husk Charger lunge cooldown | 2.5s | Shorter than the Duelist's 4s, because the lunge is its only attack |

## Approximations

| Where | What the build does | What catches it |
|---|---|---|
| Timing | Motions are driven by the fight, not the tester's clock. A leap lasts as long as the real jump, a windup as long as the action's real `windup`, and a jab or kick lands on the real round. The overload runs on the tester's times, because its ttls are the tester's schedule. **As built (M6):** the tester's attack clock `a` runs 0 to 0.6s across the real telegraph, however long it is, then on from 0.6 for 1s after it ends; `kick` decays over 0.25s from each fire edge. Move is a record speed above 20px/s. The Lurk Gunner's planted walk advances with distance walked (21.7px a cycle), so at its 140px/s it steps much faster than the tester's 0.7s cycle, which implied about 31px/s. **As built (M7):** the Assault Bot's poses come from events, not a timeline: crouch, tuck and the raised rifle ease toward targets set by the committed action, its phase and airborne; each jab starts on its round and reaches full reach 0.06s later (it cannot wind up ahead of a round it cannot see coming); the landing crouch is a 0.42s bump from the landing edge; after a screenLeap lands the rifle comes up unless the fist has just fired. Its walk advances 35.6px a cycle | Bo, comparing tester and mission |
| Burst inside recovery | `fire` stays non-blocking, so an action's steps finish when its burst starts and the later rounds leave during its recovery. Every roster recovery is longer than its burst | `test/enemyspec-runtime.test.mjs` pins the spacing; playing it |
| Dead root's drones | A dead Floating Factory's drones keep hunting until shot; today they freeze and vanish with it | Playing it |
| The overload in play | The Automaton is dead at 0 health: kill credit and loot come then, and shots pass through the overload. In 2D its parts vanish at death and the overload shows as a box (P2); in 3D the rig stays standing on it. If the mission ends during the 2.4s, the blast never comes. The mission's death cue, spark burst and small shake play at the death, which is now the overload's start; the explosion's sound is on the overload's own `on.destroy` | Playing it |
| Motion from position | Speed is measured from position over a 0.2s window. A room viewer moves enemies at snapshot rate, and a host renders frames with no step in them, so a per-frame speed would flicker between idle and move. **As built (M5):** airborne is not smoothed. A root stands when its feet are within 0.6px of a platform top it overlaps, which both ends hold exactly, so the landing edge is on the frame of landing rather than a hold later. Distance walked counts only while standing. A takeoff kicks only when the root leaves the ground moving up (a jump, not a walk off a ledge), and a landing only after 0.2s in the air (not a step down). These apply to every jump, not only the leap actions the tester shows. The Siege Automaton's footfall lands every 27.4px walked: the tester's 34px stride over 62% of a cycle, two feet per cycle. The Assault Bot's footfalls raise no kick, as in the tester | By eye in a room |
| Aim | The rifle, cannon and pointing arm aim at the nearest living soldier, clamped to ±0.6 rad as in the tester. The real shot leads its target, so the barrel can be a few degrees off the bolt | By eye |
| Telegraph and flash | Each part flashes alone, through the per-bone table. The red telegraph pulse lights the whole model, and the per-part red halo from `cues` still marks which part. The tester replaced the halo on the Bot, the Automaton and the Factory with its own tells. The game keeps the halo, because it is how a player reads an attack | Bo's eye |
| Edited enemies | The rig is used only when the spec id matches a rig and every child part with a box has a bone or a declared hinge. A part renamed, added or removed in the Designer sends the whole enemy back to blocks. A box resized in the Designer scales the model to the new box; a part moved in the Designer does not move its bone | By eye; the Designer preview is 2D |
| Shake | Peaks and the max-combine match the tester's at zoom 1; the mission's shake is in screen pixels, so at another zoom a kick is that much larger or smaller relative to the world. The mission's shake decays linearly at 3/s and the tester's exponentially, so a big kick lasts longer in the game: the death blast's converted 2.1 takes about 0.7s to settle. Every viewer feels every enemy kick at any distance, as in the tester and as with the mission's existing enemy-death shake | Bo's eye |
| Explosions | `microBlast`, `deathFlash` and `deathBlast` are drawn as the tester's explosion at the entity's own size, so the damage area still reads. Other `explosion`-tagged entities keep the sphere | By eye |
| Iron Moth's seekers | Its `seeker` def keeps the block look. Only the Siege Automaton's `seekerMissile` takes the missile model, the pairing the tester showed | By eye |
| Facing | A model facing left is the model turned 180°, as in the tester, so its far side shows | By eye |
| Performance | No device measurement. Skinning a dozen rigs plus the effects pool has no number yet. `enemyFx3d` switches the effects off | The mission's FPS meter on a device |
| Load | The 1.4MB GLB loads on the first 3D mission, with blocks until it arrives | By eye |
