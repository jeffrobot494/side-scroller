---
type: tech
category: scenes
status: unbuilt
resolution: sharp
needs: []
related: [mission-3d, server-settings]
---

# Pause menu

How Escape stops a mission and opens a menu whose Options screen is the editor's settings renderer fed a filtered schema. Implements `design/pause-menu.md`.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| P0 | **Live is data.** Every `SCHEMA` item in `src/game/config.js` carries `live: true` or `live: false`, where live means *a change takes effect in the running mission*. The trailing "Live." is struck from every `help` string and the renderer appends it from the field, so the two cannot disagree. Two corrections fall out: `enemyJump` becomes `live: true` and its help loses "Applies on next deploy", because `bodyJump()` in `src/mission/locomotion.js` reads it per jump; `hubAmbience` and `hubAmbienceDensity` become `live: false`, because nothing in a mission reads them, and their help says in words that they change the base at once. A pure `pauseSchema({ room })` beside `SCHEMA` returns the groups the pause menu shows: live items only, `scope: "server"` items dropped when `room`, empty groups dropped | **Unchanged**, except the two Hub ambience help lines, whose wording changes and whose meaning does not |
| P1 | **One renderer, reachable from the game page.** `src/editor/controls.js` moves to `src/hub/controls.js`; its four importers follow (three modules and `test/tools.test.mjs`). The rules its markup needs move from `src/editor/editor.css` to `src/hub/hub.css`, which both pages already load: every `cfg-*` rule and the `.toggle` switch that a bool row renders | **Unchanged.** Pure move |
| P2 | **Pause, single-player.** A `pause` action, appended to `ACTIONS`, default key Escape, rebindable, and local-only on the wire. A saved key map that binds no key to an action gains that action's default keys where they are free, so a player who ever rebound a key still gets Escape. Read once per rendered FRAME in `Mission._frame`, not per step, so it can be read while no steps run. While paused a hosted, non-remote mission takes no samples and runs no steps; it keeps rendering, re-solves the camera each frame so a zoom change stays centred, and draws with no shake offset so a frozen frame does not jitter. Unpausing discards the accumulated time and every press made while paused, so no catch-up burst runs and no buffered jump fires. `stop()` and `start()` leave the mission unpaused. A hook, `onPauseChange(paused)`, tells the host. A remote mission ignores the action in this slice | **Changed:** Escape freezes and unfreezes a single-player mission. Nothing is drawn over it yet |
| P3 | **The menu.** A DOM overlay built by `src/hub/` and mounted by `src/main.js` over both mission canvases. Menu: Options, Resume. Options: `controlsTabsHTML(pauseSchema({ room: mission.remote }), config, isDefault)` bound with `bindControls`, persisted with `setConfig`, and a Back button. Escape closes the whole menu from either screen. A change to `missionRenderer` goes through `syncRenderer()`, the path the toggle key already uses. While the menu is open, in either mode, the device half of `MissionInput` releases every held action and ignores every key but `pause`, without `preventDefault`, so arrow keys, Space and Tab reach the menu. In a room mission the menu opens and the mission keeps running. The overlay is disposed whenever the mission scene is left, including a room mission that ends under it | **Changed: first playable.** The design, whole |

P0 and P1 are refactors with a green suite. P2 is playable on its own (a freeze key). P3 is the feature.

## Reuses

| What | Where | Why |
|---|---|---|
| Schema → controls renderer: `controlsTabsHTML`, `bindControls`, `showControlsTab` | `src/editor/controls.js` (moves in P1) | Already renders the editor's Settings tab, the Sound page and the Behavior Lab's tuning panel from `SCHEMA`. Its header says it was kept free of editor chrome for an in-game overlay. The pause menu adds no control code |
| `setConfig`, `isDefault`, persistence to localStorage | `src/game/config.js` | "Changes are kept the way editor changes are" is literally the same call |
| `scope: "server"` | `src/game/config.js`, `server.mjs` (`SERVER_ITEMS`, `serverConfig()`) | Already the one fact that says the room owns a knob. The room filter is that field, not a new list |
| `serverConfig()`'s filter-and-drop-empty-groups shape | `server.mjs` | `pauseSchema` is the same shape on a different predicate, and its output goes to the same renderer |
| Local-only actions | `src/net/mission-wire.js` (`LOCAL_ONLY`, `WIRE_ACTIONS`) | `pause` joins `debugGraph`/`debugPath`/`toggleRenderer`, so the wire's bit order does not move |
| Rebindable actions with labels and default keys | `src/game/controlmap.js` (`ACTIONS`, `ACTION_LABELS`, `DEFAULT_KEYS`) | The Controls tool lists and rebinds it with no UI work |
| The frame loop and its accumulator | `src/mission/mission.js` (`_frame`, `STEP`) | Pausing is the loop not stepping. `update()` never learns about it |
| `mission.remote` | `src/mission/mission.js` | Already the one fact that says this page is a viewer of a room's mission. It decides both "does not pause" and "room filter" |
| `syncRenderer()` and `onRendererToggle` | `src/main.js` | Switching the view from a menu is the same act as switching it from the key |
| The DOM notice over the mission | `src/main.js` (`viewNotice`) | Precedent for main.js owning a DOM element over the mission canvases |
| Headless DOM stubs | `test/harness.mjs` (`installDom`, `makeEl`) | The menu is mountable and clickable in node, as the editor tools are in `test/tools.test.mjs` |

## Where the code goes

| Path | What |
|---|---|
| `src/game/config.js` | `live` on every item (P0); `pauseSchema({ room })` (P0) |
| `src/hub/controls.js` (new) | Moved from `src/editor/controls.js`. The renderer, unchanged except that a row's help gains "Live." from `item.live` (P0 lands this in the old path; P1 moves the file) |
| `src/editor/editor.js`, `src/editor/sound-page.js`, `src/editor/tools/behavior-lab.js`, `test/tools.test.mjs` | Import path only (P1) |
| `src/editor/editor.css` → `src/hub/hub.css` | The `cfg-*` rules, including the narrow-screen override, and `.toggle`. Rules scoped to a tool (`#bl-tune`, `.es-comp`, `.snd-*`) stay where they are (P1) |
| `src/game/controlmap.js` | `pause` appended to `ACTIONS`, its label, `Escape` in `DEFAULT_KEYS`; `load()` fills unbound actions from their free default keys (P2) |
| `src/net/mission-wire.js` | `pause` in `LOCAL_ONLY` (P2) |
| `src/mission/input.js` | A way to take a pending device press of one action outside a sample, and to drop pending presses (P2). A suspended mode for the device half: release held actions on entry, ignore every bound key but `pause` without `preventDefault`; cleared by `reset()`/`disable()` (P3) |
| `src/mission/mission.js` | `paused`, the frame-level read, the skipped steps, the camera re-solve and zero shake while paused, the discarded time and presses, unpaused by `start()`/`stop()`, `onPauseChange` (P2). Opening without pausing when `remote`; suspending input while the menu is open (P3) |
| `src/hub/pause.js` (new) | The overlay: menu screen, options screen, Back, Resume. `createX(container, …) → { dispose() }` like every other DOM screen. Owns no rules: calls `setConfig` and the callbacks it is handed (P3) |
| `src/hub/hub.css` | The overlay's `pm-*` rules (P3) |
| `src/main.js` | Mount and dispose the overlay off `onPauseChange`, and dispose it on every exit from the mission scene (`onMissionComplete`, a room's pushed results); hand it `mission.remote`, `resume`, and an `onChange` that calls `syncRenderer()` after a `missionRenderer` change (P3) |
| `test/tools.test.mjs` | P0's guards, beside the Settings-tab block that already renders `SCHEMA` |
| `test/controls.test.mjs` | P2's action, default key and press-outside-a-sample; P3's suspended mode |
| `test/mission-net.test.mjs` | `pause` added to the test's own local-only list (P2) |
| `test/pause-menu.test.mjs` (new) | P2's frame loop pause and P3's overlay, mounted headlessly. New file because nothing tests a pause or the overlay today |

| Convention | Applies as |
|---|---|
| Nothing hardcodes a key | Escape is `pause`'s default binding, not a literal in the overlay. The overlay closes on whatever `keyBindings` maps to `pause` |
| Mutations go through actions | The overlay calls `setConfig`, never writes `config` |
| `src/mission/` stays DOM-free and bare-node importable | The overlay lives in `src/hub/`; the mission only raises `onPauseChange` |
| Everything tweakable in the editor | No new knob. The menu's contents are the schema |

## The seam

| Owns | Must not touch |
|---|---|
| Whether this page steps its own mission this frame | `update()`, `scene`, `scene.rng`, anything `sampleScene` or the golden trace reads |
| The `pause` action and its default key | `WIRE_ACTIONS`' order, which is the wire format |
| The overlay DOM and its lifecycle | The room's simulation. A room mission is never paused; its page only stops sending held actions while the menu is open |
| Which schema items the menu shows (`pauseSchema`) | The schema's values, types and ranges. `live` is a declaration read by the menu and the renderer, nothing else |

**The one rule:** paused is not gameplay state. It never crosses the wire, `update()` never reads it, and a headless driver of `update()` cannot enter it.

## Must not regress

**`node test/run.mjs` fully green on every slice.** Targeted guards:

| Suite | What it pins |
|---|---|
| `test/tools.test.mjs` | Settings tab: one tab per group, one row per item, the changed dot. P0 adds: every item declares a boolean `live`; no `help` string contains "Live."; a live item's rendered row does; `pauseSchema({ room: false })` is exactly the 38 keys of the design's table, pinned by name; `pauseSchema({ room: true })` is exactly the Viewport, Sound, `aimMode` and `padDeadzone` keys, with no empty group |
| `test/controls.test.mjs` | Default bindings, rebind and reset, `disable()` clearing state, and "toggleRenderer is appended" (which P2 rewrites as "pause is appended", since both pin that no earlier index moved). P2 adds `pause`/Escape, a saved map gaining Escape, the press read outside a sample, and presses made while paused being dropped. P3 adds the suspended mode |
| `test/mission-net.test.mjs` | `WIRE_ACTIONS` order pinned; every action classified; the config route's 52 applied / 27 refused, which P0 must not move |
| `test/mission-golden.test.mjs` | Identical trace; `mission.js` bare-node importable |
| `test/audio.test.mjs`, `test/fps.test.mjs`, `test/camera.test.mjs`, `test/behavior-lab.test.mjs` | Read `SCHEMA` groups by title. P0 renames nothing |
| `test/docs.test.mjs` | This spec's citations |

## Approximations

| Where | What the build does | What catches it |
|---|---|---|
| `live` is declared, not proven | A setting marked live whose code reads it once at load would show in the menu and do nothing until the next deploy | P0's test catches a missing declaration, not a wrong one. Read the code when adding a knob |
| Hot-seat pauses | `?players=2` runs its mission on this page (`remote` is false), so it is treated as single-player. The design names single-player and room missions only | Bo, when he plays hot-seat |
| Held keys across a pause | Opening releases every held action. A key still held on resume must be pressed again | By hand |
| Sound during a pause | Sounds already playing ring out; nothing new plays because nothing steps. A volume change is heard from the next sound played, because `applyVolumes()` in `src/audio/engine.js` runs per play | By ear |
| The mission stays drawn behind the menu | Rendering continues while paused, so a zoom, view or scanline change shows behind the menu as it is made. Cosmetics that advance only in `update()` (particles, motes, the damage flash) hold still | Bo's eye |
| Filling unbound actions from defaults | A saved key map that deliberately left an action unbound gets its default key back if that key is free. The Controls tool offers no way to unbind, so no such map is known to exist | `test/controls.test.mjs` |
| "Room" is `mission.remote` | A room mission the server declined to host would run on this page with `remote` false, and be treated as single-player. `server.mjs` always hosts today, so this is latent | `test/mission-net.test.mjs` |
| Rebinding to Escape | The Controls tool uses Escape to cancel a capture (`src/editor/tools/controls-mapper.js`), so once `pause` is moved off Escape it can only come back by Reset | Known; rebinding pause is not a design ask |
| Editor tools | The Firing Room and the labs get no pause menu | The design says missions only |
