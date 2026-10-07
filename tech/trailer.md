---
type: tech
category: scenes
status: unbuilt
resolution: sharp
needs: [mission-3d, mission-3d-looks, mission-3d-enemies, mission-determinism]
related: [mission-3d, mission-determinism, campaign-pacing]
---

# Trailer

How the 60-second trailer in `design/trailer.md` is rendered by the game itself: staged takes run at a fixed step under a virtual clock, captured frame by frame on the GPU, and cut to a 120 BPM placeholder beat.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| T0 | **One mission take, captured.** A page, `trailer.html` (repo root, linked from nothing, like `space.html`), and a zero-dependency node script, `trailer.mjs` (repo root, like `server.mjs`). **The virtual clock:** before any module loads, the page replaces `requestAnimationFrame` and `performance.now` with a clock that advances only when the script asks for the next frame, and replaces `Math.random` with a seeded stream. Every wall-clock reader is then frame-exact with no edit to it: the hub ambient's own loop, the laser flicker, the mission's loop and the splash. **The take runner:** the view is installed with `setView` **before** `start()`, and the runner waits until the enemy rigs and armour have loaded (`loadEnemyRigs`, `loadArmour`). Then it sets the mission's loop aside, as `test/mission-golden.test.mjs` does. For each output frame it samples the take's trace, runs `update(STEP)`, `updateMotion()` and `render()`. The trace stand-in is the trailer's own: the shape of `scriptedInput`, fed from the take's trace rather than the golden's. After `start()` the page sets both canvases to the capture size. Only `#game3d` is captured, so the HUD, bars, rings and carets on `#game` are never in the picture. **The script** starts `server.mjs`, launches Playwright's headless Chromium on the GPU (D3D12 through Mesa), steps the page over CDP with Node's built-in `WebSocket`, saves one PNG per frame and pipes them to `ffmpeg`. It prints the WebGL renderer string it got. Output goes to `output/trailer/`, which is added to `.gitignore`. The take is a plain generated level under the game's own camera | **None in the game.** New page and script only |
| T1 | **The cinematic camera, and the risk check.** The 3D view gets an optional camera override. Set, `draw` uses a pose from the override instead of `solveCamera3D`. Everything downstream that reads the solved camera must read something sensible from it: `near`/`far`, the background's `view.width` and target (the hive glow is placed from them, assuming a target on z=0), and the fog, which today is anchored to `position.z`. Under the override the fog is anchored to the distance from the camera to its target. Unset, the view is unchanged. Camera **tracks** (push in, track, locked, orbit, crane, whip-pan, each with keyframes in beats) are a pure module that turns a beat time into a pose. **Then the risk check:** stills over a generated level at the framing of every shot that leaves the straight-ahead axis: 4 (low, level with the mist), 5 (locked low, in front), 6 (orbit), 7 (shoulder height), 9 (crane from behind the squad), 10 (long lens) and 11 (wide pan). These go to Bo. Whatever looks wrong (thin terrain, flat mist bands, the skyline seen edge-on, the screen-space sky, the hive glow) is listed under Approximations, with its fix as its own row, before T3 stages anything on it | **None in the game.** `src/main.js` never sets the override |
| T2 | **Long-lens blur.** The view accepts an optional extra pass, inserted before `OutputPass` only while the override asks for it. The trailer page imports three's `BokehPass` and hands it to the view, so `src/mission/view3d/index.js` never imports it and `dist/` does not grow (`build.mjs` follows imports from `index.html`). `BokehPass.js` and its shader are vendored into `vendor/three/` beside the existing passes. Checked with a still at shot 10's framing | **None in the game** |
| T3 | **The mission takes: shots 1 and 4–12.** A shot is a row in a takes table (data, no code per shot), made of one or more **segments**. Shot 6 has four (one enemy alone each, its own angle) and shot 8 has three (one weapon per beat). A segment holds a hand-authored level (platforms, spawn, placements in the generator's own shape), the squad (Tex and named recruits with their weapons), a seed, an input trace, a pre-roll, a camera track, cues and a speed. **Cues** are staged events on a beat, and they go through the mission's own damage path, so deaths, signals, bursts and explosions are the game's own. The cue kinds are: kill a part, kill a body, set a position or velocity, and hold a brain still. A kill cue must look earned (Bo, 2026-10-06): the segment's trace has the squad firing at the target, and a round is timed to reach it on the cue's frame. **Pre-roll** puts the enemies' own actions on the beat (the Husk Charger's lunge, the Strafe Raider's shot, the Siege volley). The segment is stepped uncaptured for a number of frames chosen so the named action commits on its beat. The commit is read off the motion record (`src/mission/enemyspec/motion.js`), and the test asserts it. Shot 7's ¼ slow motion runs `update(STEP / 4)` per output frame. **Shot 9's camera tilts up from the squad to reveal the Siege Automaton**, which is already standing. **Two trailer-only falls:** in shot 11 the shot-off wing falls to the ground and the whip-pan follows it, and in shot 10 Tex's body falls when he is hit. In play a dead wing or soldier still vanishes as today. The view gets one more optional hook under the override: each frame it hands the trailer its scene and the drawn object for a named entity (a wing's hinge, a soldier's model). At the death, the trailer clones that object and animates the clone itself: the wing tumbles and lands on the terrain below it, and Tex's body topples and lies on the ground. Neither fall touches the simulation | **None in the game** |
| T4 | **The hub takes: shots 2, 3 and 13.** The page builds its own one-seat session through `createLoopback` and `createSession`, and mounts a real `Hub` on it. Its command handler does **not** run rounds: `src/main.js`'s handler calls `runRound()` on `roundClosed` and would start a real mission inside a hub take. Staging uses the session's commands where one exists: `hire` for Tex, `deploy`, and a scripted `missionResult` that kills Tex and pays the survivors their XP. **Where no command exists, staging writes the campaign state directly:** leads placed one per beat (arrivals are random and private, `arriveLeads` in `src/game/state.js`), one lead's `daysLeft` run out, and `outcome` set to `won` and then `lost` for the two end screens (one campaign cannot reach both). The page is captured with `Page.captureScreenshot` at 2× the output size. The camera moves on these shots (slow zoom on Tex's card, slow move on the screen) are a crop and scale applied to the captured frames | **None in the game** |
| T5 | **The title take: shot 14.** The capture script loads `graphics-tester/splash.html` with the same virtual clock injected before load (CDP `Page.addScriptToEvaluateOnNewDocument`), hides its fps readout, and captures `#view`. No edit to `graphics-tester/splash.js`: its clock adds a `dt` taken from `performance.now`, which the virtual clock makes exactly one frame. `?t=` still sets the start time. The splash loads three and its font from CDNs, so this take needs the network | **None** |
| T6 | **Cards and the cut.** Text cards are drawn by the trailer page **over the picture, never on black**, on the beats the takes table names. Their type is a toned-down relative of the splash title, so that the splash reads as familiar and still lands as the payoff. It is the same face (Russo One, loaded from the URL `graphics-tester/splash.js` uses) in the same gold family, but flat (no extrusion), smaller, lighter, with less glow, wider tracking, and a short fade in and out. The style lives in the trailer page as one set of values, so it can be tuned against the splash by eye. The 14 shots are joined in order at their design times. A placeholder 120 BPM click track is muxed in. The output is a 60-second 1920×1080 60 fps MP4 in `output/trailer/` | **None in the game** |

**As built (T0):** the clock is its own file, `src/trailer/clock.js`, so the splash take injects the same source rather than a copy. The capture runs at about 3.7 frames a second on the RTX 3050 (a screenshot per frame dominates), so the full minute is about a quarter of an hour.

T0 is the foundation. T1, T2, T4 and T5 each land alone on top of it. T3 needs T1, and needs T2 only for shot 10. T6 needs all of them.

Bo's answers on cards, the title, the falls and the Automaton are at the end of this doc and are written into T3, T5 and T6 above.

## Reuses

| What | Where | Why |
|---|---|---|
| The real mission, driven at a fixed step: `start()`, set the loop aside, `update(STEP)` per frame | `src/mission/mission.js`, `test/mission-golden.test.mjs` | A take is the same loop plus `updateMotion()` and `render()` per frame, a staged level and a camera |
| The scripted-input shape: every read the mission makes, with the step count | `test/mission-trace.mjs` (`scriptedInput`) | The trailer's stand-in copies the shape. The original is hard-wired to the golden's `scriptAt` and stays that way |
| Seeded draws: `loadMission(level, squad, seed)` installs `scene.rng`, and suites seed cosmetics by assigning the global `Math.random` | `src/mission/entities.js`, `src/game/gen/rng.js` (`makeRng`) | A take replays to the same frames |
| The 3D view, with its camera solved in one place | `src/mission/view3d/index.js` (`draw`), `src/mission/view3d/background.js` (`update`) | The override replaces that solve. Soldiers, capes, lasers, mist, rigs and death explosions are drawn as in play |
| The world split from the HUD: the world on `#game3d`, every tell and overlay on `#game` | `src/mission/mission.js` (`render`), `index.html` | "No HUD" is capturing one canvas. Nothing in `render` changes |
| The asset loaders the view already starts | `src/mission/view3d/enemyrig.js` (`loadEnemyRigs`, `rigLoaded`), `src/mission/view3d/armour.js` (`loadArmour`) | The runner waits on them, so frame one has the rigs and not fallback blocks |
| The composer and the vendored three | `src/mission/view3d/index.js`, `vendor/three/` | The blur is one more pass in the same chain |
| The behaviours the shots name: the Husk Charger's crouch and lunge, the Iron Moth's wing parts and `grounded` state, the Siege Automaton's overload death, squadmates' duck reflex and station-keeping | `src/game/enemyspecs.js`, `src/mission/view3d/enemyanim.js`, `src/mission/ai.js` (`tickDuck`), `src/mission/navigation.js` (`stationPoint`) | Shots 4, 5, 7, 9, 11 and 12 are these behaviours playing. Cues and pre-roll only set them up |
| The committed-action record | `src/mission/enemyspec/motion.js` | How pre-roll knows an action landed on its beat |
| The arsenal's grenade arc, chain and homing weapons | `src/game/arsenal.js` (`grenade_launcher`, `arc_tazer`, `seeker`) | Shot 8 |
| Tex, a recruit in the pool | `src/game/soldiers.js` | Mission takes pass his record directly. Hub takes hire him |
| The hub screens: Ops board, deploy, barracks, results, `SECTOR SECURED` / `SECTOR LOST` | `src/hub/hub.js` | Shots 2, 3 and 13 are the real screens |
| The session, its commands and the one-seat loopback | `src/game/session.js`, `src/net/loopback.js` | Hub takes run on a real campaign. Only the round runner is left out |
| The hub's ambient crew | `src/hub/ambient.js` | Runs on its own loop, which the virtual clock makes frame-exact |
| The title sequence and its start time | `graphics-tester/splash.js` (`?t=`), `graphics-tester/splash.html` | Shot 14, unedited |
| Headless Chromium with the `libnspr4` workaround | `graphics-tester/README.md` ("Verifying") | The same browser. That README uses SwiftShader. On this machine, with `GALLIUM_DRIVER=d3d12` and `--use-angle=gl`, the same browser reports the RTX 3050 (checked while writing this spec) |

## Where the code goes

| Path | What |
|---|---|
| `trailer.html` (new, repo root) | The capture page: the virtual clock as the first script, `#game3d`, a hidden `#game`, a hub root, the card layer, and `index.html`'s import map. Linked from nothing |
| `trailer.mjs` (new, repo root) | The capture driver: server, browser, CDP, clock stepping, PNGs, `ffmpeg`. Zero dependencies |
| `src/trailer/` (new) | The page's modules. They import the game; nothing in the game imports them |
| `src/trailer/clock.js` (new) | The virtual clock, a classic script. `trailer.html` loads it first, and `trailer.mjs` injects the same file into the splash page (T5). One source for both |
| `src/trailer/takes.js` (new) | The takes table as data: shots, segments, time spans in beats, staging, cues, pre-rolls, tracks, cards. DOM-free |
| `src/trailer/tracks.js` (new) | Camera tracks: beat time → pose. Pure, DOM-free, no `three` |
| `src/trailer/runner.js` (new) | Runs one mission segment: the trace stand-in, staging, pre-roll, cues, speed. DOM-free apart from the canvases it is handed |
| `src/trailer/app.js` (new) | Page glue, hub takes, cards. The only trailer module touching the DOM |
| `src/mission/view3d/index.js` | T1: the optional camera override, and what reads the solved camera under it (fog, near/far, the background). T2: the optional injected pass. T3: the optional hook that hands the trailer the scene and an entity's drawn object |
| `src/mission/view3d/background.js` | T1: only if the hive glow cannot be placed from the override's pose as it is |
| `vendor/three/` | T2: `BokehPass.js` and `BokehShader.js` |
| `.gitignore` | T0: `output/trailer/` |
| `test/trailer.test.mjs` (new) | The takes table, the tracks and the runner, headlessly. No suite covers this subsystem yet |

Conventions that apply: `mission.js` still never imports `three`, and the view stays the only game module that does. A take is data, so the "everything tweakable" rule is met by the takes table, not by schema knobs. The trailer adds no gameplay state, so nothing goes on the wire.

## The seam

| Owns | Must not touch |
|---|---|
| Staging a mission: level, squad, pre-roll, cues on beats, speed | Gameplay rules. A cue goes through the mission's damage path. It never adds a rule, and it never edits `src/game/enemyspecs.js` |
| Staging a hub take: commands where they exist, direct state writes where they do not | `src/game/state.js`'s rules and `src/hub/` screens. A screen that is wrong in the trailer is wrong in the game, and is fixed there or not at all |
| The camera during a take, through the view's optional override | `solveCamera3D` and the play camera. Unset, the view draws exactly what it draws today |
| The falling wing and Tex's fall: clones the trailer owns and animates | The view's own models and the game's death behaviour. In play a dead wing or soldier still vanishes |
| The blur pass, injected by the trailer page | The game's composer chain and `dist/` when nothing is injected |
| The page's virtual clock | Any wall-clock reader in the game. They are steered from outside, never edited |
| Frames, cards, the click track, the MP4 | `build.mjs`. The trailer never ships with the game |

## Must not regress

**`node test/run.mjs` fully green on every slice.**

| Suite | What it pins | New |
|---|---|---|
| `test/mission-golden.test.mjs` | A mission replays from its seed. Nothing here touches the simulation | — |
| `test/camera.test.mjs` | `solveCamera3D` and the play camera, unchanged | — |
| `test/hubambient.test.mjs` | The ambient layer | — |
| `test/tools.test.mjs` | Config groups and live counts. The trailer adds no knobs, so these must not move | — |
| `test/docs.test.mjs` | This spec's citations and seven parts | — |
| `test/trailer.test.mjs` | — | T0: a mission segment run twice gives the same `sampleScene` (`src/mission/checksum.js`) on every frame. T1: every track hits its keyframes on their beats, and is continuous between them except at a whip-pan. T3: the shots cover 1–14 once each, in order, with no gap or overlap, totalling 60 s, and each shot's segments tile it. Every boundary, cue and pre-rolled action is on the 0.5 s grid. Every enemy id, weapon id and recruit a segment names exists in the merged roster, the arsenal and the recruit pool. Each cue has happened by its beat. Each pre-rolled action commits on its beat. Shot 7 steps a quarter of the time per frame |

**Where the bar cannot see the work.** Everything the view draws (T1's camera, fog and background under the override, and T2's blur): no test imports `src/mission/view3d/`. Also T4's hub capture, T5's splash, T6's cards and encode, the virtual clock, and `trailer.mjs`. The guard for all of these is watching the frames.

## Approximations

| Where | What the build does | What catches it |
|---|---|---|
| Music | A 120 BPM click, one per 0.5 s. Every beat named in the design is a beat of that grid | Re-time when music is chosen. The table is in beats, so a new tempo moves the cut. Pre-rolls are found again by the test's search |
| Off-axis shots (4, 5, 6, 7, 9, 10, 11) | The world is built to be seen from straight ahead. Terrain is 36 px deep, mist is flat bands, the skyline is one row of boxes per layer, the sky is screen-space, and the hive glow is placed for a straight-ahead camera. T1's stills decide which of these show, and each one that does gets a fix row here before T3 | Bo's eye on T1's stills |
| Fog under a moving camera | Anchored to the camera-to-target distance, not the play plane | By eye |
| Trailer-only falls | The wing and Tex fall as cosmetic clones. They do not collide with anything but the terrain below their drop point, and the game never shows them | By eye |
| Staged kills | A wing dies on its beat because a cue kills it, not because a round reached it in time. **It must look earned:** the squad is firing at that wing in the beats before, and a round reaches it on the frame it dies. The take times the shot so the round arrives on the beat | By eye. The death itself is the game's |
| Staged hub state | Lead arrivals, the expiry and both end screens are written into state, not reached by play. The screens drawing them are the real ones | By eye |
| Enemy timing | Pre-roll lands an action's *commit* on the beat. The visible moment (the lunge's contact, the round crossing frame) follows by the action's own windup, which pre-roll can offset for but does not measure | By eye |
| Hub camera moves | Flat captures at 2×, cropped and scaled after capture | By eye |
| Mission framing in T0 | The canvases are resized after `start()`, so the game's own camera sees more world than in play. Only T0 uses the game's camera | — |
| Level-up in shot 13 | The survivors' cards show their new level after the result. The hub has no level-up animation, so the trailer shows none | By eye; see the asks |
| Splash | Needs the network for three and its font, unlike every other take | The capture fails loudly if they do not load |
| GPU capture | Measured once while writing this spec. If a driver update breaks it, the script falls back to SwiftShader: slower, same frames | The script prints the renderer string |

## Bo's answers

**2026-10-06:**

| Ask | Answer |
|---|---|
| Shot 14's title sequence | `graphics-tester/splash.js` |
| Card style | A toned-down version of the splash title's type that complements it, so the splash is familiar yet dramatic when it arrives. Over the shots, not on black |
| The shot-off wing (shot 11) | Falls, in the trailer only |
| Tex (shot 10) | Falls, in the trailer only |
| Staged board and end screens, the hub zoom as a crop, levels shown without an animation, the splash needing the network | Accepted |
| Wings killed on cue | Accepted, as long as it looks earned: a round reaches the wing on the beat it breaks |
| The Siege Automaton (shot 9) | The camera pans up on it. It does not rise. This replaces the design's "crane up from behind the squad" and "rises behind cover" |
