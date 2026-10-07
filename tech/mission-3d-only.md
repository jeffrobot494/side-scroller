---
type: tech
category: scenes
status: unbuilt
resolution: sharp
needs: [mission-3d]
related: [mission-3d, mission-3d-looks, mission-3d-enemies, enemy-death-explosion]
---

# Mission 3D only

How the mission loses its 2D world renderer, leaving the Three.js view as the only way a mission is drawn. Implements the "no 2D mission view" line of `design/mission-3d.md`.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| O1 | **Three.js ships with the game.** Vendor three 0.180.0 into `vendor/three/`: the core module and the addons the game reaches, nothing else. Point `index.html`'s import map at it instead of jsDelivr. `build.mjs` learns to resolve a bare specifier through `index.html`'s import map and follow it like a relative one, so `dist/` picks up exactly the vendored files the game reaches, including the `GLTFLoader` that `src/mission/view3d/armour.js` imports dynamically. A vendored file the game reaches but that does not exist fails `node build.mjs`, which CI runs on every push | **Unchanged** apart from where three comes from. The 2D fallback still exists. This is what makes O2 safe: losing the fallback no longer means a CDN outage leaves you with no game |
| O2 | **The mission draws no world itself.** Delete the `missionRenderer` setting, the `toggleRenderer` action and its V binding, and `_use3d()`. Delete `render()`'s 2D world pass and every helper only that pass calls. **A helper is deleted only if nothing outside `mission.js` calls it.** `_gunTip` stays: `src/mission/view3d/soldier.js` places every muzzle flash with it, and `graphics-tester/` stubs it. No test imports either, so the suite will not catch a wrong delete. Grep `src/mission/view3d/` and `graphics-tester/` for `m._` before deleting anything. `src/main.js` always loads the view at page load and shows `#game3d` whenever the mission scene is up. **While the view is not live** (still loading, or it failed): `render()` fills the canvas dark, prints one status line ("Loading 3D view…", or the failure reason), and still draws the HUD over it. A hosted, non-remote mission whose host has said it is waiting for a view is held still. That is a third reason in `_frozen()`, beside `paused` and `deathCard`, so nothing happens that nobody can see. The flag is set by `src/main.js`, never defaulted on, so a headless or test host that installs no view still steps. **A failed load is final for the page.** The rejection is kept, the notice says to reload, and nothing retries: a failure that recurs (no WebGL) would otherwise re-import and re-throw in a loop | **Changed.** There is no 2D mission. A room viewer draws the waiting screen while the room runs on, since it cannot stop the room. Editor tools are unchanged |

O1 lands first, and it is a pure move with a green suite plus a clean `node build.mjs`. O2 is the behaviour change.

**Acceptance for O2 is partly Bo's eye.** Play a mission and toggle nothing. V does nothing. The pause menu's Options has no "Mission view" row. To check the waiting screen, rename `vendor/three/three.module.js` and reload: the deploy holds on the message and does not run blind.

## Reuses

| What | Where | Why |
|---|---|---|
| The external-view contract: `setView`, `begin`/`draw`/`end`, `_viewLive` | `src/mission/mission.js` | Already the only path to the 3D view. O2 removes the alternative, not the contract |
| The freeze machinery: `_frozen()`, the camera re-solve and no-shake on a frozen frame, dropped time and presses on release | `src/mission/mission.js` (`_frozen`, `setPaused`, `dismissDeathCard`) | "Waiting for the view" is a third reason to hold still, with the same release rules as the death card |
| The lazy loader and on-screen notice | `src/main.js` (`loadView3d`, `syncRenderer`, `viewNotice`) | O2 shrinks them. Nothing new gets written |
| The flat layer over 3D: tells, nav overlays, squad debug, vignette, HUD, death card, intro, end banner | `src/mission/mission.js` (`_drawTells`, `_drawVignette`, `_drawHUD`, …) | Stays as it is. It is already drawn in 3D mode |
| Particles drawn as points by the view | `src/mission/view3d/effects.js` | `mission.particles` stays. The 3D view is its only reader after O2 |
| Shared 2D drawing for the editor tools | `src/mission/render.js`, `src/mission/enemyspec/render.js` | **Kept.** The Firing Room, Aim Lab, Behavior Lab, Weapon Designer, Enemy Designer and `src/space/view.js` draw with them. `_drawTells` still calls `drawSpecEnemy` with `{ body: false }` |
| Vendored third-party code, copied into `dist/` by the build | `vendor/rundot-sdk/`, `build.mjs` (`want`) | Precedent: the RUN SDK is vendored and copied the same way |
| Saved bindings and saved settings drop unknown names | `src/game/controlmap.js` (`load`), `src/game/config.js` (`load`, `BY_KEY`) | A browser with `missionRenderer: "2d"` or a KeyV binding stored loads clean without migration code |

## Where the code goes

| Path | What |
|---|---|
| `vendor/three/` (new) | three 0.180.0's `build/` core, plus the `examples/jsm/` addons the game imports, together with their own imports: postprocessing (EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, and their passes and shaders), `geometries/RoundedBoxGeometry.js`, `utils/BufferGeometryUtils.js`, `loaders/GLTFLoader.js` (dynamic, `src/mission/view3d/armour.js`), `utils/SkeletonUtils.js` (dynamic, `src/mission/view3d/enemyrig.js`). This list is a starting point. `node build.mjs` is the authority on what is reached. Licence file alongside. Upstream files are copied unchanged |
| `index.html` | Import map points at `./vendor/three/…` |
| `build.mjs` | Bare specifiers resolve through `index.html`'s import map and get followed. A specifier the map does not name stays an error, never a skip |
| `src/mission/mission.js` | O2: the world pass and its helpers go, along with `_handleViewToggle` and its call in `update()`. The rest of `render()` stays: the shake roll, the world transform for the flat layer, overlays, tells, vignette, HUD. Add the waiting fill and status line, and the third `_frozen()` reason. The view-hook comment block is rewritten |
| `src/main.js` | O2: always load the view. Delete the 2D fallback in the load's `catch`, keep the rejection and a reload notice. `syncRenderer` reduces to installing the view and showing its canvas with the mission scene. Delete `mission.onRendererToggle`. Set the mission's wait-for-view flag. The pause menu's `onChange` no longer special-cases `missionRenderer` |
| `src/game/config.js` | O2: delete the `missionRenderer` entry. Strip "The 2D view has none" from the help of `scanlines`, `laserSight3d`, `groundMist3d`, `cape3d` and `enemyFx3d` |
| `src/game/controlmap.js` | O2: drop `toggleRenderer` from `ACTIONS`, `ACTION_LABELS` and the default bindings |
| `src/net/mission-wire.js` | O2: drop `toggleRenderer` from `LOCAL_ONLY`. `WIRE_ACTIONS` does not change, because it was never on the wire |
| `CLAUDE.md`, `tech/mission-3d.md` | O2: the 3D entry and the R1/R2 "switchable / falls back to 2D" claims get an "As built" note pointing here |

| Convention | Applies as |
|---|---|
| `mission.js` never imports `three` | Unchanged. It stays bare-node importable, and the room server and every test still run it with no view |
| No dependencies | `package.json` stays empty. Vendoring is copying files, the same as the RUN SDK |

## The seam

| Owns | Must not touch |
|---|---|
| Whether and where the mission draws a world | `update()`, anything `sampleScene` reads, `scene.rng`. The golden must not move |
| The "view not live" state and its freeze | A room mission's stepping: `_frozen()` already exempts `remote` and host-free missions, and the new reason has to as well. Any host that never set the wait flag: it keeps stepping as today |
| | The view's reads of mission internals: `_gunTip`, `particles`, `camera`, `motion`, `time`, `scene` |
| How three reaches the page and `dist/` | Other pages' import maps (`space.html`, `space3d.html`, `graphics-tester/`, `visual-design/`, `player2-lab.html`) stay on the CDN. Out of scope |
| | `src/mission/render.js` and `src/mission/enemyspec/render.js`. The tools still draw 2D |

## Must not regress

**`node test/run.mjs` fully green, and `node build.mjs` clean, on both slices.**

| Suite | What it pins | Change in O2 |
|---|---|---|
| `test/mission-golden.test.mjs` | Simulation trace; bare-node import; `render()` without a context; the view-hook lifecycle | The view-hook block is rewritten: begin per deploy, draw every frame, end at stop. Without a live view, no world is drawn. A hosted mission is frozen only when the wait flag is set. Drawing still changes nothing sampled |
| `test/pause-menu.test.mjs` | Frozen frame has no shake, the view is handed the offset, the overlay's change hook | Drop the `missionRenderer` writes. The overlay change test switches to another enum key. Its missions install no view and never set the wait flag, so their `_frame` step counts must not move. A case is added: with the flag set and no view, `_frame` takes no step |
| `test/controls.test.mjs` | Action list and default bindings | The `toggleRenderer` assertions become "it is gone, KeyV is unbound, `pause` is last" |
| `test/mission-net.test.mjs` | Wire action order (`LOCAL`, `WIRE_ACTIONS`); exported-config apply counts | `LOCAL` loses `toggleRenderer` and `WIRE_ACTIONS` is byte-identical. The local-knob count goes 32 → 31. **Check** what the route answers for an unknown key in an old export, and pin it |
| `test/tools.test.mjs` | Viewport group membership; tools drawing enemies through the default path | `missionRenderer` leaves the `VIEWPORT` list, and the live-item count goes `44` → `43`. The tool-drawing assertions must not move |
| `test/docs.test.mjs` | This spec's citations | — |

**Where the bar cannot see the work:** `src/main.js` and everything under `src/mission/view3d/`. No test imports them. The view load, the retry, the canvas show/hide and the vendored three are guarded only by `node build.mjs` and by playing.

## Approximations

| Where | What the build does | What catches it |
|---|---|---|
| No WebGL / the view throws | The mission holds on the failure message for good. The pause menu has no abort, so the deploy is stranded and a reload is the only way out. The day it cost is spent. What a reload does to an in-flight deploy is not checked here. **This contradicts the design's "changes nothing that happens to them"** until Bo answers | Nothing automated. **Open for Bo, see below** |
| Room viewer while waiting | The room keeps simulating. This seat sees the waiting screen and the HUD and can still send input blind | Same as today's 3D-not-yet-loaded case, minus the 2D fallback |
| Hub before deploy | The view loads at page load, and nothing in the hub says whether it succeeded | The notice shows on failure |
| Vendored file set | Hand-picked from what the game imports. A new `three/addons/…` import without vendoring it first | `node build.mjs` fails, in CI |

**Open for Bo (design):** what a player whose machine cannot run the 3D view gets. Today: a 2D game. After O2: a held mission and a message. The builder's default is above. The alternative is checking at page load and refusing to deploy, which is hub UI.
