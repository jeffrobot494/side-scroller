---
type: tech
category: scenes
status: building
resolution: sharp
needs: [mission-3d]
related: [mission-3d, art-direction]
---

# Mission 3D looks

How the looks Bo approved in the graphics tester (`graphics-tester/experiments.js`) move into the game's 3D mission view. This implements `design/mission-3d.md` ("a model is an upgrade on its sprite"). Each look keeps the tester version Bo signed off on, with these exceptions:

- The laser's hit test.
- The mist's ground line and width.
- The cape's air.
- Which parts follow the hit flash.
- The crouch, which the tester never showed at the game's height.

Each is listed under Approximations.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| L0 | **The tester crouches like the game.** The tester's fake soldier goes to the game's crouch box (`CROUCH_H` 22, feet kept on the ground) instead of staying 46 tall. Every crouched look Bo approved was seen at a height the game never uses, so this lands first and the crouched looks are re-judged at real size. The graphics tester is not tracked in git, so this slice is not a commit | None in the game |
| L1 | **Laser sight.** Every living soldier's gun throws the red beam from under the barrel, with a lens at the emitter. The beam stops at the first platform or living enemy part it enters from outside, and puts a dot there; otherwise it runs 175px. A box the barrel starts inside is ignored, as the tester ignored hits under 0.5px. The flicker stays on the wall clock, as in the tester. It is read off the soldier model's own gun, so it rides bob, lean, aim and facing. A `laserSight3d` bool (Viewport group, local, live, default on) turns it off | Changed (3D only) |
| L2 | **Ground mist.** Six drifting mist bands at the ground line, three behind the play plane and three in front, as tuned in the tester. They span the whole level. The bands span the level plus the skyline's 4000px margin each side, and texture repeats scale with the span, so the blobs keep the tester's size. Drift runs on `m.time`: it holds still under the single-player pause, and keeps going in a room, where the mission never freezes. A `groundMist3d` bool (Viewport, local, live, default on) turns it off | Changed (3D only) |
| L3 | **Helmet and chest armour.** The Blender helmet and chest replace the helmet, visor, torso, stripe and pad cubes, fitted every frame the way the tester fits them (the helmet scaled uniformly; the chest stretched to the torso and clamped under the helmet). Each piece is two draw calls. The "Shell" material is per soldier, takes the part's tone and flashes white on a hit; "Detail" is shared. It joins `v.mats` with `userData.base` set to the hidden part's tone, so the hit flash reaches it through `applyFlash` on the same frame. "Detail" is shared and stays out of `v.mats`. The models load once per page. Each model attaches lazily inside `pose()` on the first frame the kit is present, because `make()` usually runs before the load finishes. Until they arrive, or if the load fails, the cubes stay | Changed (3D only) |
| L4 | **Shoulder squares.** A dark block on each shoulder, hung from min(torso top, helmet bottom), nudged back 2 and up 2. It joins the hit flash, which the tester's block did not (see Approximations) | Changed (3D only) |
| L5 | **Arms.** Two-bone IK arms per soldier. The near hand is on the grip, and the far hand supports the barrel across the chest. The torso's front is pulled in to make room, before the chest armour is fitted to it. The meshes hang under the soldier's root, positioned from the world matrices refreshed after the pose. The sleeves and gloves join the hit flash; the tester's did not (see Approximations) | Changed (3D only) |
| L6 | **Cape.** A verlet cloth per soldier, pinned to the pack's back face, with the tester's grid, solver budget (60Hz × 6 passes), ripple, keep-out box and ground clamp. It is simulated in world space on mission time. The mesh hangs under the soldier's root, which only translates, with vertices written relative to it. So it hides with a dead soldier, and `ModelMap` disposes it with an extracted soldier or at the end of the deploy. The keep-out box is re-read from the live `w`/`h` every frame, so the 22px crouch carries it. The cape is seeded on first sight, and reseeded after a jump of more than 200px in one frame (a resync or teleport) and whenever it is switched back on. A `cape3d` bool (Viewport, local, live, default on) hides it and stops stepping. The cape does not flash on a hit, as in the tester | Changed (3D only) |

Each slice deletes its entry from `graphics-tester/experiments.js` (the README's promotion rule). The tester renders the game's code, so the look stays on there permanently. L1–L6 are independent of each other, except that L0 goes first and that L5's chest pull-in is visible under L3's armour; the order above is the landing order. **Acceptance is Bo's eye**, in the tester and in a mission with V toggled.

## Reuses

| What | Where | Why |
|---|---|---|
| The approved looks: constants, the fit maths, the IK, the cloth | `graphics-tester/experiments.js` | The thing being promoted. Numbers are carried over unchanged |
| The soldier model: named parts, the `upper` hip group, the `gun` group, per-model `mats` and `applyFlash` | `src/mission/view3d/soldier.js`, `src/mission/view3d/actors.js` | The armour, squares, arms and cape hang off `make()`'s model and are posed inside `pose()`, after the layout. The hit flash already walks `v.mats` |
| Per-deploy lifecycle: begin builds, draw syncs, end disposes | `src/mission/view3d/index.js` | The laser and mist are owned by `level` like terrain and effects |
| Segment-vs-box entry (slab method) | `src/mission/enemyspec/perception.js` (`entry`) | The laser's hit test. Exported rather than copied |
| The enemy walk (alive, not disabled, children, `spawned`) | `src/mission/view3d/enemy.js` (`createEnemies`) | The laser stops at exactly the parts that are drawn |
| `viewY`, `shade`, `disposeTree` with `userData.shared` | `src/mission/view3d/util.js` | The y-flip, part tones, and keeping shared GLB geometry and Detail material alive across deploys |
| GLTFLoader from the existing import map (`three/addons/`) | `index.html`, `graphics-tester/index.html` | No new dependency |
| Blender build scripts and the two-material palette convention | `graphics-tester/models/kit.py`, `helmet.py`, `chest.py` | The sources of the GLBs. They stay in the tester; `kit.py` exports into the game folder |
| Viewport config group, `live` + local scope | `src/game/config.js` (`scanlines`) | Precedent for 3D-only cosmetic knobs |

## Where the code goes

| Path | What |
|---|---|
| `src/mission/view3d/laser.js` (new) | The laser: one beam, dot and lens per living soldier from a pool. It reads each soldier model's gun, and the hit test runs in world px against `scene.platforms` and enemy parts |
| `src/mission/view3d/mist.js` (new) | The mist bands, built per deploy from `world` and `platforms`, updated from mission time |
| `src/mission/view3d/armour.js` (new) | The GLB load (once per page, shared), the per-soldier attach (a clone with its own Shell), and the helmet and chest fits |
| `src/mission/view3d/cape.js` (new) | The cloth: grid, links, step, keep-out, seeding. One instance per soldier model |
| `src/mission/view3d/models/` (new) | `helmet.glb`, `chest.glb` |
| `graphics-tester/models/kit.py` | Exports the `.glb` into `src/mission/view3d/models/`; the `.blend` and the `.py` sources stay in the tester |
| `src/mission/view3d/soldier.js` | Calls armour, shoulders, arms and cape from `make()` and `pose()`. Shoulders and arms are a few boxes each and live here. Exposes each soldier's posed gun to the laser (the model map is otherwise closed over). Takes an optional `wind(s)` from its host (default: still air) |
| `src/mission/view3d/index.js` | Builds and syncs the laser and mist inside `level`, and reads the three knobs. The laser syncs after `level.soldiers.sync`, so the guns it reads are this frame's |
| `src/mission/enemyspec/perception.js` | `entry` exported. No behaviour change |
| `src/game/config.js` | `laserSight3d`, `groundMist3d`, `cape3d` in Viewport, local, live |
| `graphics-tester/app.js`, `graphics-tester/experiments.js`, `graphics-tester/README.md` | The tester draws the laser and mist the way `index.js` does, and its fake scene gains `platforms` (its ground) and an empty `specRoots`. It passes a treadmill `wind`, crouches at the game's height (L0), and drops each promoted experiment |

| Convention | Applies as |
|---|---|
| The view reads and never writes | Nothing is cached on an entity. The cape's state lives on the soldier's model (`ModelMap` owns it) |
| Cosmetics may use `Math.random` | Never `scene.rng` |
| Shared GPU resources | Marked `userData.shared` so `disposeTree` leaves them for the next deploy |
| Mobile budget | About 1,000 triangles per GLB (the helmet is 1,080, the chest 484); 2 draw calls per armour piece; 1 per cape |

## The seam

| Owns | Must not touch |
|---|---|
| Everything drawn on and around a soldier model, the laser, and the mist | Any entity field, `scene.rng`, `update()`, and the camera solve |
| The kit's load and its shared materials | The import boundary: `src/mission/mission.js` still never imports `three` or `src/mission/view3d/` |
| The cape's simulation clock, which is `m.time` deltas, capped at 0.1s per frame | The simulation's clock or step |

Nothing new crosses the wire. Every look derives from fields a room viewer already gets (`x y h facing crouched alive aimVec aimUp hitFlash`). A remote soldier's `vx` is 0, so its legs do not run; that is already true and is unchanged here. The cape reacts to world motion, which a remote soldier has.

## Must not regress

`node test/run.mjs` fully green on every slice. No suite imports `src/mission/view3d/`. That is a limit of the bar, not a guard, so the guards that do apply are:

| Suite | What it pins |
|---|---|
| `test/mission-golden.test.mjs` | Identical simulation; `mission.js` still bare-node importable |
| `test/mission-divergence.test.mjs` | Rendering stays invisible to the simulation |
| `test/enemyspec-targeting.test.mjs`, `test/companion-aim.test.mjs`, `test/navigation.test.mjs` | `perception.js` unchanged in behaviour after the `entry` export |
| `test/docs.test.mjs` | This spec's citations |

Nothing pins the three new knobs; the pause menu renders whatever `pauseSchema()` lists. Everything else is checked by eye. Each slice gets two kinds of headless screenshot: the graphics tester (default state, plus side view standing and crouched, at the game's crouch height from L0), and a 3D mission frame from a generated level with three soldiers, crouched and standing.

## Approximations

| Where | What the build does | What catches it |
|---|---|---|
| Laser hit test | 2D slab test against platforms and enemy part boxes in world px, not a raycast against meshes. The dot sits at the gun's depth (z 9), so on an enemy whose model is thinner than its box it can float a little in front | By eye. The tester raycast everything, which in a level would include the skyline's thousands of instances |
| Laser targets | Platforms and enemies. Other soldiers and shots do not stop it | By eye |
| Mist ground line | The top of the widest platform, which in a generated level is the continuous ground slab. Mist does not follow raised terrain | By eye |
| Cape air | The game's air is still, and running is real world motion. The tester's treadmill gets the same streaming by passing `wind = -vx` | Bo compares the tester and a mission |
| Cape on a snapshot | A room viewer moves soldiers at snapshot rate, so the cloth sees steps rather than smooth motion | By eye in a room |
| Arms on a remote soldier | Posed from `aimVec`, as the gun is. Correct by construction | — |
| Silhouette vs hitbox | `tech/mission-3d.md` keeps models inside the collision box. The helmet (×1.12 the part's width), the arms, the cape and the laser all leave it | By eye; the tells and hit tests are still the box |
| Crouch | The looks were approved on a 46px crouch the game never draws. At 22px, the helmet keeps its size (uniform scale off the part's width) over a shorter torso. The 24px cape is longer than the crouched body, so its tail lies on the ground under the clamp | L0, then Bo's eye |
| Hit flash | Armour Shell, sleeves, gloves and shoulder squares flash white with the body. In the tester, only the helmet and chest Shells followed the flash; arms and squares stayed their colour. The cape and the Detail glow do not flash | Bo's eye |
| Pull-in order | The torso's front is pulled in before the chest is fitted, so the chest is narrower in front with arms on. In the tester, the order depended on which box was ticked first | Bo's eye |
| Load order | Cubes until the GLBs arrive, usually within the first frames of the first 3D mission | By eye |
| Performance | No device measurement. One cape is about 374 links × 6 passes plus 70 box tests per pass, and a normal recompute per frame. The 2–4ms for 4 capes on a phone is an estimate from a desktop node run, and the tester only ever ran one cape. The knobs are the escape hatch | The mission's FPS meter on a device |
