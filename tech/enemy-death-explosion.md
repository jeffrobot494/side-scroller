---
type: tech
category: scenes
status: unbuilt
resolution: sharp
needs: [mission-3d, mission-3d-enemies, mission-3d-only]
related: [mission-3d, mission-3d-only, multiplayer-missions]
---

# Enemy death explosion

How every enemy death gets a default explosion in the 3D mission view, and gets it on both commanders' screens. Implements the "Enemy deaths" row of `design/mission-3d.md`.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| E1 | **Death bursts cross the wire.** The root-death block in `_updateEnemies` and the soldier death in `_kill` call `this._burst` directly. Every other cosmetic goes through `_feedback`. Route both through `_feedback("bst", …)`, the same as combat's bursts | **Changed in a room only.** A soldier's death burst reaches the other commander for the first time. An enemy's death already sent one burst, the runtime's (`src/mission/enemyspec/runtime.js`, through `ctx.burst`), and now it sends the second, mission-side burst a single-player mission has always drawn. Single-player is identical, because `applyFeedback("bst")` is the same `_burst` call |
| E2 | **The explosion.** A sixth feedback kind, `xpl`, carrying the root's centre, its larger box dimension (raw, never scaled), the y of the ground under it, and the root's spec id. It is emitted once per root death, in the same block and with the same `cause` (`null`, so everybody perceives it) as the death's shake. `applyFeedback("xpl")` hands it to the external view through a new optional view method, `explosion`, when the view is live, and does nothing otherwise. That gate is only right because O2 has landed: before O2 the view is installed and live even while 2D is drawing, and its effect pools are not stepped then. The 3D view converts the point into its space (`viewY`) and calls the existing `explosion` composite in `src/mission/view3d/enemyfx.js`. It skips the call when `enemyFx3d` is off, and when the spec id has a bespoke rig death (`DEATH` in `src/mission/view3d/enemyanim.js`) **and** the rig file has loaded (`rigLoaded()`). If the rig never loaded, the enemy is drawn as blocks with no death sequence, so it gets the default. Which enemies those are is a view fact, so the id crosses and the view decides. **The view** multiplies the raw size by a new live, local config knob (min above 0). The knob is applied on the viewing page, never at the emitter: in a room the emitter is the server, which refuses local keys | **Changed: playable.** Every enemy that dies explodes, in single-player and on both screens in a room |

E1 is independent and lands first. E2 is built after `tech/mission-3d-only.md` O2. See the gate note in E2.

**Acceptance for E2 is Bo's eye**, on the gaps below.

## Reuses

| What | Where | Why |
|---|---|---|
| The one feedback funnel: `_feedback` logs in a room and plays locally, `applyFeedback` is the only player, and an unknown kind is ignored | `src/mission/mission.js` | `xpl` crosses the wire with no wire change: `feedbackFor` in `src/net/mission-wire.js` forwards any kind, and an older page ignores it |
| Root-death bookkeeping, run once per root (`_counted`), that already places the burst, the death cue and the shake | `src/mission/mission.js` (`_updateEnemies`) | The explosion is one more line in that block. A part or child dying never reaches it |
| The tester's explosion: flash, fireball glows, smoke, sparks that bounce on a floor, shock ring, all pooled | `src/mission/view3d/enemyfx.js` (`explosion`) | Already used at a spawned entity's own size for the Siege Automaton's blasts (`src/mission/view3d/enemy.js`, `EXPLOSIONS`). Nothing new to draw |
| The effects knob and its "hide" path | `src/game/config.js` (`enemyFx3d`), `src/mission/view3d/index.js` (`draw`) | Off already means no fireballs. The explosion obeys it |
| The external-view contract | `src/mission/mission.js` (`setView`, `_viewLive`), `src/mission/view3d/index.js` (the returned object) | One more optional method. `mission.js` still never imports `three` |
| Feedback tests: a room logs and doesn't play, a viewer builds what the room described, the cap | `test/mission-net.test.mjs` ("feedback:" block) | Where E1's and E2's cases go |

## Where the code goes

| Path | What |
|---|---|
| `src/mission/mission.js` | E1: the two direct `_burst` calls become feedback. E2: emit `xpl` at root death, add the `applyFeedback` case, and update the feedback-kinds comment table |
| `src/mission/view3d/index.js` | E2: `explosion(x, y, size, floor, specId)` on the view object. It applies the size knob. A no-op with no level, with `enemyFx3d` off, or for a spec id whose bespoke rig death will play. It needs `rigLoaded` (`src/mission/view3d/enemyrig.js`) and `DEATH` (`src/mission/view3d/enemyanim.js`) |
| `src/game/config.js` | E2: the size knob in the Viewport group beside `enemyFx3d`. `live: true`, local scope (only a page's view reads it), so a room's exported-config counts gain one local key, and `test/tools.test.mjs`'s `VIEWPORT` list and live-item count gain one |
| `test/mission-net.test.mjs` | E1 and E2 cases in the feedback block |

## The seam

| Owns | Must not touch |
|---|---|
| A cosmetic event per root death | Anything the simulation reads. No damage, no `scene.rng`, no field `sampleScene` reads. The golden must not move |
| The view's `explosion` method | `enemyfx.js`'s composite. It is reused as is, so the tester's explosion and the death explosion stay one look |
| | Per-enemy bespoke deaths (`DEATH`, `FX`, `EXPLOSIONS` in `src/mission/view3d/`). Whether they also get the default is a gap below, not a change to them |

## Must not regress

**`node test/run.mjs` fully green on both slices.**

| Suite | What it pins | New |
|---|---|---|
| `test/mission-golden.test.mjs` | Gameplay trace unchanged. Feedback is not sampled | — |
| `test/mission-net.test.mjs` | Feedback logging, per-seat filtering, the 64-event cap, the local-knob count | E1: a root killed on a room mission logs one `bst` and builds no particles there. A seat applying that snapshot builds the burst. E2: one `xpl` per root death and none for a part's death. A local mission with a stub view hands `explosion` the root's centre, size and spec id. With no view, nothing throws. The knob count moves by one |
| `test/tools.test.mjs` | Viewport group membership and live-item count | One more item |
| `test/docs.test.mjs` | This spec's citations | — |

**Where the bar cannot see the work:** the 3D half of E2 (`src/mission/view3d/index.js`). No test imports it. How it looks, and whether it lands at the right spot, is checked only by playing.

## Approximations

| Where | What the build does | What catches it |
|---|---|---|
| Busy snapshots | The 64-event cap is per **snapshot**, not per step: `server.mjs` clears the log once per broadcast, so at the default `missionSnapshotHz` of 20, three steps share it. A death late in a busy window loses its `xpl`, and E1's extra bursts spend the same budget. Single-player has no cap | Same loss every spark and sound already takes. Not measured |
| Pool overwrite | The enemy-effect pools are fixed rings (glows, smokes, sparks), written round-robin. Several large deaths at once overwrite live smoke, including a Siege Automaton's | By eye |
| `enemyFx3d` off | No explosion at all. **A deviation from "every enemy death"**, so it is asked below | Bo |
| Rig loaded but not fitting | A Siege Automaton whose rig loaded but does not fit its box is drawn as blocks with no death, and also gets no default | Rare. By eye |
| Floor | The ground y is the root's bottom edge. A flyer killed in the air gets sparks that bounce on its own feet's level | By eye |
| Timing on a host | Emitted during `update()`, so on a frame that runs several steps it is drawn starting from the frame's end, not mid-frame | Under one frame. Invisible |

**Open for Bo (design).** Each needs an answer before E2's acceptance. The builder's default is in brackets.

1. Does the coloured burst every death already makes stay, under the explosion? [stays]
2. The Siege Automaton already has its own overload-and-wreck death. Does it also get the default explosion when it dies? [no]
3. Does the explosion scale with the enemy's size, and what colour is it? [scales with the body; the tester's orange, not the enemy's colour]
4. Do the Floating Factory's drones and the Siege's seeker missiles count as "enemies" for this? They are spawned entities, not roots, so the root-death block never sees them. [no]
5. With enemy effects switched off in settings, there is no explosion at all. Every other explosion becomes a glowing sphere in that setting. Do you mind? [no explosion]
