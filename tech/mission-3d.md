---
type: tech
category: scenes
status: built
resolution: sharp
needs: []
related: [art-direction]
---

# Mission 3D

How the mission gets a Three.js view that draws the same simulation in 3D, switchable against the 2D canvas. Implements `design/mission-3d.md`.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| R1 | **The switch and the split.** A `missionRenderer` knob (`2d` / `3d`, default `2d` at R1; `3d` since R6) in the config Viewport group, plus a rebindable `toggleRenderer` action in the control map that flips it live during a mission. The flat "tells" that must stay on top in 3D (soldier and enemy health bars, the controlled-soldier ring and caret, the EXTRACT label) become separately drawable. **In 2D mode `render()` still draws them in place, in today's order.** The mission gets an optional external-view hook with a per-deploy lifecycle (begin on `start()`, draw per frame, end on `stop()`) | **Unchanged in 2D.** Draw order is identical. `3d` and the toggle do nothing yet |
| R2 | **The 3D view, blocked out.** Three.js loads through an import map on `index.html` (same CDN and version as the visual-design study). A WebGL canvas sits under `#game` in the same box. When 3D is on, `src/main.js` dynamic-imports the view and installs it. `render()` then skips the world pass, clears `#game` to transparent, and draws the tells, nav debug, vignette and HUD on top. The view draws terrain as depth-extruded slabs, and every soldier, enemy part, projectile, loot crate and the exit as a box at its exact collision box, in its colour. **Every gameplay cue is carried from day one:** hit flash (white), telegraph pulse (red emissive on the same clock), muzzle flash, burn, crouch (the box height already changes), and sparks and bursts as points. The perspective camera comes from a pure solve in `src/mission/camera.js`, so the z=0 plane lands on the 2D camera's pixels, shake included | **Changed when 3D is on: first playable.** Everything readable and the switch works both ways; models are placeholders |
| R3 | **Background.** The mission's own backdrop rebuilt in depth: sky gradient, two skyline layers of ruined buildings at real depth, the green hive glow on the horizon, drifting spores, fog, lighting, bloom | Changed (3D only) |
| R4 | **Soldiers.** A procedural model per soldier made of primitives, taken from the 2D figure: helmet, visor, torso with a chest stripe, backpack, legs and gun, in the soldier's colour. It adds form the sprite cannot have: bevels, armour plates, an emissive visor, and a rim light. Poses: standing, crouched (folded shin, knee up, hunched), turned by `facing`, gun rotated by `aimVec` / `aimUp` | Changed (3D only) |
| R5 | **Enemies.** An EnemySpec tree drawn part by part at each part's own box. The base form comes from the shape vocabulary (`box`, `circle`, `ellipse`, `diamond`) in `spec.visual.color`, then gets detail the 2D shape cannot carry: plating and seams, emissive cores, a glowing facing eye, and a subtle idle motion. Telegraph, hit flash, muzzle flash, burn and spawned children follow 2D's visibility rules exactly | Changed (3D only) |
| R6 | **Shots and effects.** All six `PROJECTILE_SHAPES`, oriented along velocity, emissive with glow halos. Also the bobbing diamond loot crate, and the exit beam with its posts and rising chevrons | Changed (3D only). **After this slice, every element the design names has a finished 3D model** |

R1 is a pure refactor with a green suite. R2 is where it becomes playable, and where switching back must already work. R3–R6 are independent of each other after R2.

**Acceptance for R3–R6 is Bo's eye.** Play the same seed with the view toggled back and forth. The design's two bars are that each model is an upgrade on its sprite, and that a soldier, an enemy and a shot are as easy to tell apart as in 2D. No test can judge either.

## Reuses

| What | Where | Why |
|---|---|---|
| Three.js 0.180.0 via the jsDelivr import map; bloom through `EffectComposer` + `UnrealBloomPass`; `FogExp2`; batched static geometry; canvas-texture skyline planes; frustum culling | `visual-design/index.html`, `visual-design/street.js` | Already proven in this repo with no build step and no npm dependency. Same version, same loading method |
| Viewport maths: `solveCamera`, `DESIGN_W`, `DESIGN_H`, `parseCanvasSize` | `src/mission/camera.js` | The 3D camera is *derived* from the solved 2D camera, never solved separately |
| Camera, zoom, shake, time, particles | `src/mission/mission.js` (`this.camera`, `_zoom()`, `this.shake`, `this.time`, `this.particles`) | `_updateCamera` runs inside `update()`; the view reads the result |
| Screen → world, both paths | `src/mission/mission.js` (`_applyAim` for the local mouse, `toWorld()` for a room seat) | Both stay correct unchanged *because* the z=0 plane projects exactly like the 2D transform |
| Every 2D look: soldier parts and crouch pose, `_drawGun` / `_gunTip`, muzzle, burn, loot, exit, skyline, hive glow, spores, the platform's lit edge | `src/mission/mission.js` (`_drawSoldier`, `_drawBackground`, `_skyline`, `_drawPlatforms`, `_drawExit`, `_drawLoot`) | The reference each model is built from: proportions, colours and which cue means what |
| Projectile looks and the no-shape fallback | `src/mission/render.js` (`PROJECTILE_SHAPES`, `defaultShape`) | Pure. A shot gets the same shape in both views, including legacy weapons |
| EnemySpec traversal and cue rules | `src/mission/enemyspec/render.js` (`drawSpecEnemy`) | Same walk (alive, not disabled, children, `spawned`), so a part is visible in 3D exactly when it is in 2D |
| Nav debug overlays | `src/mission/render.js` (`drawNavGraph`, `drawNavPath`) | Stay 2D over the 3D view, aligned by the z=0 invariant |
| Control actions and rebinding | `src/game/controlmap.js` (`ACTIONS`, the `debugGraph` / `debugPath` precedent) | A mission-time toggle is an action like the debug overlays, rebindable in the Controls tool for free |
| Config schema, Viewport group | `src/game/config.js` (`SCHEMA`) | Where the knob goes: local scope, never `server` |
| Scene show/hide | `src/main.js` (`showScene`) | Already the one place that decides which surface is visible |

**As built (R3):** fog is linear `THREE.Fog`, not `FogExp2`. Its near and far are re-anchored every frame to the play plane (`camera distance + 50` … `+ 2000`), because the camera's distance changes with zoom and exponential fog measured from the camera put a zoom-dependent haze on the play plane itself. Linear fog anchored at z=0 leaves everything on the plane untouched at any zoom and fades only what is behind it.

## Where the code goes

| Path | What |
|---|---|
| `src/mission/view3d/` (new) | The whole 3D view: renderer, scene graph, model builders, per-frame sync. The only code that imports `three` |
| `src/mission/camera.js` | A pure solve from the 2D viewport plus this frame's screen offset (rounded scroll and shake) to a straight-on perspective camera: position, target, field of view. Numbers only |
| `src/mission/mission.js` | Tells made separately drawable; the view hook and its lifecycle; the frame's shake offset rolled once and shared by the 2D transform, the tells and the view; the toggle action. No `three` import, ever |
| `src/mission/enemyspec/render.js` | An option to draw an enemy's body without its health bars, and the bars alone. The default call stays byte-for-byte what the Firing Room and the Enemy Designer get today |
| `src/game/config.js` | The `missionRenderer` enum |
| `src/game/controlmap.js` | The `toggleRenderer` action and its default key |
| `src/main.js` | Lazy `import()` of the view on the first switch to 3D; mounting and toggling its canvas. If the import fails (offline), it stays in 2D and says so on screen |
| `index.html` | Import map, and the WebGL canvas placed *before* `#game` |
| `src/hub/hub.css` | The WebGL canvas: same fixed, max-size letterbox rule as `#game`, same z-index (101, above the page vignette at 100), stacked by page order. `#game`'s opaque background is dropped while 3D is on |
| `test/camera.test.mjs` | The new solve's guard |

| Convention | Applies as |
|---|---|
| One unit = one world px | y flips (down → up) in exactly one place |
| The canvas box belongs to CSS | The renderer sets its drawing-buffer size without writing style dimensions, so the letterbox rule applies unchanged |
| No build step, no dependencies | The import map is the only way `three` arrives; `package.json` stays empty |
| Cosmetics may use `Math.random` | As the 2D renderer does. Never the scene's seeded stream |

## The seam

| Owns | Must not touch |
|---|---|
| Everything under the tells while 3D is on | `update()`, the camera solve's output, any field `sampleScene` reads, `scene.rng` |
| Its canvas, renderer, meshes and materials. Terrain is built at each deploy's begin. Soldiers and enemy roots are mapped to meshes by identity (both stable for a mission, including in a room); spawned children are swept when they leave | Entity objects: read only, nothing cached on them |
| Projectiles and particles drawn from **per-frame pools**, never mapped to a specific shot | Assuming a shot object survives a frame: a room viewer rebuilds `scene.projectiles` on every snapshot (`src/net/mission-wire.js`) |
| The perspective camera, as a function of the 2D camera and this frame's offset | Aim: `_applyAim` and `toWorld()` stay 2D maths |

**The one invariant:** the camera looks straight down −z, never tilts or yaws, and its frustum at z=0 is exactly the 2D view rectangle for this frame, rounded scroll and shake offset included. Shake moves the camera sideways, never rotates it. Depth effects come from geometry off the z=0 plane, never from camera motion.

**Import boundary:** `src/mission/mission.js` must stay importable in bare node (the child-process block in `test/mission-golden.test.mjs`). The view is installed by `src/main.js`, never imported by the mission.

## Must not regress

**`node test/run.mjs` fully green on every slice.** Targeted guards:

| Suite | What it pins |
|---|---|
| `test/mission-golden.test.mjs` | Identical simulation trace; host-free and bare-node import; `render()` is a no-op without a context. A `three` import leaking into `mission.js` fails here |
| `test/mission-divergence.test.mjs` | Rendering stays invisible to the simulation |
| `test/mission-ownership.test.mjs` | Local mouse aim through `_applyAim` |
| `test/mission-net.test.mjs` | Room aim through `toWorld()`, and the snapshot path a room viewer draws from |
| `test/camera.test.mjs` | The 2D golden cases, plus (new) the 3D solve: the z=0 frustum equals the 2D view rectangle across zoom, canvas preset, camera position and shake offset, and the camera never tilts |
| `test/controls.test.mjs` | The action list and default bindings with the new toggle added |
| `test/tools.test.mjs` | The Firing Room and Enemy Designer still draw enemies through the unchanged default path |
| `test/docs.test.mjs` | This spec's citations |

## Approximations

| Where | What the build does | What catches it |
|---|---|---|
| Extruded depth | Terrain and bodies have depth centred on z=0. A face at z>0 projects slightly larger than the collision box, so a platform's front lip sits a few px off at the screen's edges | Kept shallow; feet meet the top surface exactly at z=0. By eye |
| Silhouette vs hitbox | Models sit inside each collision box, but a rounded model can read a few px smaller than what it is hit with | R2's exact boxes are the reference |
| Enemy models are procedural | EnemySpec carries a shape and a colour, not art. "Cool" comes from generic detailing of the four base shapes, not a bespoke model per enemy | Bo's eye; see the asks |
| Tells stay flat | Health bars, ring and caret, EXTRACT label and nav debug are 2D over the 3D view | The z=0 invariant keeps them aligned |
| Parallax | 2D scrolls the skyline at fixed rates (0.18, 0.36); 3D parallax comes from real depth | By eye |
| Performance | No budget set. The street study's batching and culling are the tools; a long generated level is the stress case | The mission's own FPS meter |
| Needs the network on first 3D use | `three` loads from jsDelivr, as in the visual-design study | A failed load leaves the mission in 2D with a message, never blank |
| Editor tools stay 2D | Firing Room, Weapon Designer, Behavior Lab, Aim Lab | The design says mission view only |

## How the mission draws today

`Mission.render()` makes one pass on one 2D context. `_drawBackground` runs in screen space. Then comes a world transform, `(world − camera) × zoom` with the screen offset rounded to a device pixel plus a random shake offset rolled in `render()`. In that transform it draws terrain, nav overlays (under the bodies), exit with its label, loot, EnemySpec trees with their bars, projectiles, soldiers (ring, body, bar), then particles. Then it restores, and draws vignette and HUD in 960×540 design space scaled by `_uiScale()`. The world is 540px tall everywhere, and a taller viewport pins the ground to the canvas bottom.
