---
type: tech
category: scenes
status: unbuilt
resolution: sharp
needs: [mission-3d, enemyspec]
related: [mission-3d, mission-3d-looks, art-direction]
---

# Mission 3D enemies

How the Blender enemy models from the graphics tester (`graphics-tester/enemies.js`, `graphics-tester/models/enemies.py`) replace the block-built enemies in the game's 3D mission view. This implements the "Enemies: 3D models" row of `design/mission-3d.md`. Each enemy keeps the model, the colours and the motions Bo approved in the tester. The main change is timing: in the tester each motion runs on its own fixed clock, and in the game it is driven by what the enemy is actually doing. Every other difference is listed under Approximations.

The ten models are all in `enemies.glb`: Husk Charger, Lurk Gunner, Spore Wisp, Strafe Raider, Cowardly Duelist, Sky Duelist, Iron Moth, Assault Bot (`breach_hopper`), Siege Automaton and Floating Factory. Two more models are used for spawned enemies: the factory drone and the seeker missile.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| M0 | **The model file moves to the game.** `enemies.py` writes `enemies.glb` into `src/mission/view3d/models/`. It exports on its own, not through `kit.py`, so its export call changes, or `enemies` joins `kit.py`'s game stems. The tester loads the file from there. The `.blend` and `.py` stay in the tester | None |
| M1 | **What an enemy is doing, as one record, the same in a room.** A three-free module reads an EnemySpec root every frame and keeps a small record per root: speed and airborne (measured from position), a landing edge, the committed utility action with its phase and whether it is a new commitment, each part's fire edges, telegraph and alive state, each new spawn, and the root's death edge. Three facts reach a room viewer wrongly today, so the wire is fixed for them in this slice. **Fire**: a 0.055s `muzzleFlash` quantised to 0.1 and sent a few steps apart mostly never arrives, so each entity gets a fire COUNT, bumped once per `doFire` (one per fire action; a burst is one), and the wire carries the count, not the flash. **Spawns**: `applyRoot` mirrors `spawned` by position and def id, so a drone that dies and is replaced between snapshots is invisible as a new one, and the viewer's old object stands in for it. Each spawned entity gets a serial from its root, the wire carries it, and `applyRoot` rebuilds when it differs. **The committed action**: its id, phase and a commitment serial join `packRoot` next to `brainState.current`. The two counters are written by the runtime and read by nothing in the simulation. Nothing draws the record yet | Wire changes; no gameplay change; nothing visible |
| M2 | **The seven roster models.** The GLB loads once per page, as the armour does. A root is drawn as one rigged model, not as part blocks, when three things hold: its spec id has a rig, the rig has an entry in the motion table, and every child part with a box has its bone. So the three new rigs keep their blocks until M3–M5 land. Each model is a `SkeletonUtils` clone, placed at the root box's centre, scaled to the box and turned by `facing`; the Iron Moth always faces the camera, as in the tester. Each model gets its own vertex-colour attribute and shares the rest of the geometry, so a part's colour and its flash belong to that one enemy. The seven take a flat Shell tint in the spec colour, as in the tester. A dead or disabled part has its bone collapsed; a dead moth wing hides its hinge. Idle and move come from the record. The attack pose runs through the telegraph, and the kick on the fire edge. The Husk Charger has no brain and no telegraph, so it runs and never lunges. Covers the Husk Charger, Lurk Gunner, Spore Wisp, Strafe Raider, Cowardly Duelist, Sky Duelist and Iron Moth. The health bars and the tells' halos (`cues`) are unchanged | Changed (3D only). **First playable** |
| M3 | **Assault Bot.** The bot's rig and motions: run with planted feet; the rifle raised through a `rifleBurst` windup, then three kicks at the tester's spacing starting on the fire edge; the cock-back through a `punchCombo` windup, then the tester's two jabs starting on the fire edge. In a `screenLeap` windup it crouches; airborne, it tucks with its legs drawn up; on the landing edge it lands hard; then the punch or rifle follows on its own fire edge. Any other airborne time (`vaultUp`, a fall) takes the tuck. The rifle aims at the nearest living soldier, clamped as in the tester. Its bones are named after its parts, so its Shell takes the per-part vertex tint | Changed (3D only) |
| M4 | **Siege Automaton.** A stomping walk. In a `cannonBurst` windup the cannon charges with the far hand bracing it (arm IK), then four recoils at the tester's spacing from the fire edge. In a `missileVolley` the pod lid opens and the left arm points at the target, and each of the volley's two fire edges looses its pair. A jump crouches, tucks and lands. On a cannon fire edge while airborne the cannon fans, so `jumpBarrage` and `closeQuartersBurst` both get it; `clearLedge` and `emergencyLeap` are jumps with no shot. A pod or cannon shot off in play is flung, with the tester's fling for that bone, then hidden. On the root's death edge the view starts a wreck: the remaining parts fly, the hull falls back and burns, and it is gone after the tester's time. `createEnemies` keeps visiting a dead root while its wreck runs, so the model map holds it; skeletons are disposed with the model | Changed (3D only) |
| M5 | **Floating Factory, drone and missile.** Hover, drift and thruster pods. The five pistons rise toward the next launch, timed from the last spawn the record saw, and blink when full. The bay doors open and the crane lowers the drone ahead of the predicted launch. The factory's `drone` spawns draw as `factory_drone`, and the Siege Automaton's `seekerMissile` spawns draw as `seeker_missile`, each oriented along its motion. A spawn serial that changes resets the heading, so a replaced drone does not inherit the old one's | Changed (3D only) |
| M6 | **Enemy effects.** The tester's pooled effects (smoke and glow billboards, sparks, debris chunks, rings) are attached by sockets on bones. Three things are left out because the game already has them: bolts (real shots), homers (real spawned drones and missiles) and camera shake (the simulation's own). The three enemies' FX tables are triggered from M1's record, not from the tester's cycle times. They cover visor and jet glows, gun and cannon shots, punches, footfall dust, launch and landing rings, stack smoke and steam, the missile beam, factory lights, welding and launch flashes. Explosions: a `microBlast` (a missile hit, a pod or cannon destroyed) is drawn as the tester's explosion at the entity's size, in place of a glowing sphere. The Siege Automaton's death blast, flash, shrapnel and wreck fires are drawn off its death edge, not off its death entities, because those are never stepped or drawn (see Approximations). An `enemyFx3d` bool (Viewport, local, live, default on) turns the effects off | Changed (3D only) |

**The tester follows each slice.** From M2 on, a slice deletes its enemies' entries from the tester's `ANIM`, `FX` and `SOCKETS` and moves them into the game, as the README's promotion rule asks. The tester then draws those enemies through the game's `createEnemies`. To do that, each of its modes plays a scripted fake entity: box position, `facing`, `telegraph`, the fire counts, the committed action, `spawned`. So Bo still compares Idle, Move, Punch combo and the rest side by side. `graphics-tester/splash.js` stages raw per-id groups, which stop existing at M2. So M2 gives the tester module a staging list of game-rig models posed by the game's motions, and splash keeps its `ENEMY_STAGE` table on top of that.

The order is the landing order. M3–M5 are independent of each other, and M6 needs M3–M5. **Acceptance is Bo's eye**, in the tester and in a mission with V toggled.

## Reuses

| What | Where | Why |
|---|---|---|
| The approved models, motions, IK, sockets and effects | `graphics-tester/enemies.js`, `graphics-tester/enemy-fx.js`, `graphics-tester/models/enemies.py` | What is being promoted. Numbers carry over unchanged where the motion is not re-timed |
| The enemy walk (alive, not disabled, children, `spawned`), the tells' halos, the block fallback | `src/mission/view3d/enemy.js` (`createEnemies`, `cues`) | A rigged model is drawn where the blocks are, for the same entities. Enemies with no rig keep the block path untouched |
| Identity map, hit flash and telegraph colours | `src/mission/view3d/actors.js` (`ModelMap`, `applyFlash`) | One model per root, created on first sight. The map disposes whatever a frame does not visit and `keep()` refuses; `createEnemies` passes `e.alive` and skips dead roots, so M4 visits a dead root while its wreck runs |
| Load-once GLB, shared geometry, cubes until it arrives | `src/mission/view3d/armour.js` | The same pattern and failure rule: if the load fails, the blocks stay |
| `viewY`, `setColor`, `disposeTree` with `userData.shared`, halo pool | `src/mission/view3d/util.js` | The y-flip, spec colours, and keeping the shared GLB alive across deploys. `disposeTree` frees geometry and materials but not a skeleton's bone texture, so a rig's skeleton is disposed by the rig |
| Per-deploy build, per-frame sync, dispose | `src/mission/view3d/index.js` | The effects pool is owned by `level` like `effects` and `lasers` |
| The committed action and its phases | `src/mission/enemyspec/brain.js` (`bs.commit`: `action`, `phase`) | What M1 reads locally and what the wire carries |
| Fire, spawn and the per-entity fields | `src/mission/enemyspec/runtime.js` (`doFire`, `spawnFromDef`) | Where the fire count and the spawn serial are bumped. `doFire` sets `muzzleFlash` once per fire action, whatever the count |
| Per-root snapshot packing | `src/net/mission-wire.js` (`packRoot`, `applyRoot`) | Where the fire count, the spawn serial and the committed action join the wire. `packEntity` is the per-entity whitelist, `packRoot` the per-root one |
| GLTFLoader and `SkeletonUtils` from the import map (`three/addons/`) | `index.html` | Skinned models need `SkeletonUtils.clone` to get one skeleton per enemy; plain `clone()` shares the bones |
| A model folder copied whole when the URL is templated, followed when literal | `build.mjs` | `enemies.glb` ships in `dist/` with no build change |
| Viewport config group, `live` + local | `src/game/config.js` (`laserSight3d`, `cape3d`) | Precedent for M6's knob |
| Scene and ctx scaffolding for a headless enemy run | `test/enemyspec-runtime.test.mjs` | M1's suite drives real roots the same way |

## Where the code goes

| Path | What |
|---|---|
| `src/mission/view3d/enemymotion.js` (new) | M1's record. It does not import `three`, so a suite can import it. One tracker per root, kept by the view's model map, never on the entity |
| `src/mission/view3d/enemyrig.js` (new) | The GLB load (once per page), per-root clone, per-part tint, per-part flash, bone collapse for dead parts, sockets, and the bone poser with the leg and arm IK |
| `src/mission/view3d/enemyanim.js` (new) | The per-spec motion table, keyed by spec id, reading M1's record and posing through the rig. The Siege Automaton's wreck lives here |
| `src/mission/view3d/enemyfx.js` (new) | The effects pool and the per-spec FX table (M6) |
| `src/mission/view3d/models/enemies.glb` (new) | Exported by `graphics-tester/models/enemies.py` |
| `src/mission/view3d/enemy.js` | Picks a rig or the blocks per root; draws mapped spawned defs (`drone`, `seekerMissile`) as their models; runs the effects after the pose |
| `src/mission/view3d/index.js` | Builds and disposes the effects pool per deploy, and reads `enemyFx3d` |
| `src/mission/enemyspec/runtime.js` | The fire count in `doFire` and the spawn serial in `spawnFromDef` (M1). Read by nothing in the simulation |
| `src/net/mission-wire.js` | `packEntity` carries the fire count; `packRoot`/`applyRoot` carry the spawn serials and the committed action, and rebuild a spawned entry whose serial differs (M1) |
| `src/game/config.js` | `enemyFx3d` in Viewport, local, live (M6) |
| `test/enemy-motion.test.mjs` (new) | M1's suite |
| `graphics-tester/models/enemies.py`, `graphics-tester/enemies.js`, `graphics-tester/enemy-fx.js`, `graphics-tester/splash.js`, `graphics-tester/README.md` | Export into the game (M0). The tester drives the game's enemies with scripted fake entities and loses each promoted entry; its staging list keeps splash working (M2); the README's enemies row says so |

| Convention | Applies as |
|---|---|
| The view reads and never writes | Trackers, wrecks, effect state and the predicted launch live in the view's maps. Nothing is cached on an entity, and nothing reads `scene.rng` |
| Cosmetics may use `Math.random` | The effects and the wreck's fling |
| One path for local and room | Everything a pose reads comes through M1's record, built from wire fields, so a room viewer sees the same motion as the host |
| Shared GPU resources | Rig geometry attributes and the Detail material are marked `userData.shared`. Each root owns its colour attribute (vertex colours are geometry, not material, and `SkeletonUtils.clone` shares geometry) and its Shell material |
| Budget | Measured from the current `enemies.glb`: the Siege Automaton has 3,492 triangles, the Assault Bot and the Factory about 1,940 each, and the rest 262–1,208. Every model is two draw calls, except the Iron Moth: its two wings are separate meshes, so it is six. The file is 1.4MB |

## The seam

| Owns | Must not touch |
|---|---|
| Everything drawn for an EnemySpec root that has a rig, its spawned drone and missile models, its wreck, and its effects | Any entity field beyond M1's two counters, `scene.rng`, `update()`, the brain, and the camera solve. The camera shake stays the simulation's |
| The fire count, the spawn serial and the committed action, on the entity and on the wire | Any other gameplay field, and anything the simulation reads. `WIRE_ACTIONS` and its order are unaffected |
| The tester's enemy subjects, which become a harness for the game's module | `src/mission/mission.js`, which still never imports `three` or `src/mission/view3d/` |

## Must not regress

`node test/run.mjs` fully green on every slice. Apart from M1's new suite, no suite imports `src/mission/view3d/`, so the guards are:

| Suite | What it pins |
|---|---|
| `test/enemy-motion.test.mjs` (new) | A real Assault Bot leaping records `screenLeap`, then airborne, then a landing. Its `punchCombo` records one `fistArm` fire edge. A Siege Automaton `missileVolley` records two `missilePack` fire edges. A Floating Factory records a new spawn about every 7s. The same run, packed and applied through `src/net/mission-wire.js` only every few steps, yields the same fire edges and spawns on the viewer's copy. That includes a drone replaced between two snapshots |
| `test/mission-net.test.mjs` | The snapshot still round-trips: the brain state the room is in, the action order, and the count of local knobs a room refuses (M6 adds one) |
| `test/mission-golden.test.mjs`, `test/mission-divergence.test.mjs` | Identical simulation: M1's counters change no gameplay, and the golden is not re-recorded for them. Drawing stays invisible to it |
| `test/tools.test.mjs` | The pause menu's settings, pinned by name: M6's knob is added here, to `test/mission-net.test.mjs`, and to the Viewport row of `design/pause-menu.md` |
| `test/docs.test.mjs` | This spec's citations |
| CI `node build.mjs` | `enemies.glb` is reached and copied |

Everything else is checked by eye. Each slice gets two headless screenshots: the tester, for each enemy and mode the slice touched, and a 3D mission frame from a generated level containing those enemies.

## Approximations

| Where | What the build does | What catches it |
|---|---|---|
| Timing | Motions are driven by the fight, not the tester's clock. A leap lasts as long as the real jump, and a windup lasts the action's real `windup`. A burst fires all its rounds on one frame, so the tester's two jabs, three rifle kicks and four cannon recoils start on that frame and play out at the tester's spacing; the jabs and kicks after the first come after the rounds have already left | Bo, comparing tester and mission |
| Motion from position | Speed and airborne are measured from position changes and smoothed over a short hold. A room viewer moves enemies at snapshot rate, so without the hold its walk would flicker between idle and move | By eye in a room |
| Aim | The rifle, cannon and pointing arm aim at the nearest living soldier, clamped to ±0.6 rad as in the tester. The real shot leads its target, so the barrel can be a few degrees off the bolt | By eye |
| Telegraph and flash | The flash is per part: that part's vertex colours go white in that enemy's own colour attribute, because one skinned mesh cannot give each part its own material. On the seven flat-tinted models every vertex is one colour, so the flash still marks only the part that was hit. The red telegraph pulse lights the whole model, and the per-part red halo from `cues` still marks which part. The tester replaced the halo on the Bot, the Automaton and the Factory with its own tells; the game keeps it, because it is how a player reads an attack | Bo's eye |
| Edited enemies | The rig is used only when the spec id matches a rig and every child part with a box has its bone (the moth's wings are hinges, not bones). If a part has been renamed, added or removed in the Designer, the whole enemy falls back to blocks. A box resized in the Designer scales the model to the new box; moving a part does not move its bone | By eye; the Designer preview is 2D |
| Siege Automaton death | The root dies on one frame, so the tester's 2.4s overload before the blast cannot play, and the wreck starts at the blast. The blast itself is a view effect on the death edge, because the root's `deathFlash`, `deathBlast` and `deathShrapnel` go into a dead root's `spawned`, which the simulation never steps (`_updateEnemies` steps live roots only) and neither view draws. In play today the blast does no damage and shows nothing in 2D. That is a gameplay bug outside this seam; fixing it would put a real blast under the drawn one | Bo's eye; the bug is reported separately |
| Factory build | A launch is an instant spawn after the spec's 7s wait, so the doors and crane run ahead of a predicted launch: the last one seen plus 7s. If `maxAlive` refuses a launch, the doors close with no drone. A Designer edit to the wait leaves the pistons out of step, but they reset on every real launch | By eye |
| Explosions | `microBlast` is drawn as the tester's explosion at the entity's own size, so the damage area still reads. Other `explosion`-tagged entities keep the sphere | By eye |
| Husk Charger attack | It has no brain, so there is no telegraph or fire to drive the tester's crouch and lunge. It runs, and hits by contact as now | By eye |
| No camera shake | The tester's `kick` is dropped. A view-side shake would move the 3D camera off the 2D camera's pixels, which breaks the invariant that aim and tells rely on | — |
| Iron Moth's seekers | Its `seeker` def keeps the block look. Only the Siege Automaton's `seekerMissile` takes the missile model, which is the pairing the tester showed | By eye |
| Facing | A model facing left is the model turned 180°, as in the tester, so its far side shows | By eye |
| Performance | No device measurement. Skinning a dozen rigs plus the effects pool has no number yet. `enemyFx3d` switches off the effects | The mission's FPS meter on a device |
| Load | The 1.4MB GLB loads on the first 3D mission, with blocks until it arrives | By eye |
