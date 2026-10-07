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
| E1 | **A soldier's death burst crosses the wire.** `_kill` in `src/mission/mission.js` calls `this._burst` directly. Every other cosmetic goes through `_feedback`. Route it through `_feedback("bst", …)`, the same as combat's bursts | **Changed in a room only:** the other commander sees a soldier's death burst for the first time. Single-player is identical, because `applyFeedback("bst")` is the same `_burst` call |
| E2 | **The explosion replaces the burst on every enemy body.** An *enemy body* is an entity with no parent and with health: a root, or a spawned entity with health. In today's roster the spawned ones are the Floating Factory's `drone`, the Iron Moth's `seeker` and the Siege Automaton's `seekerMissile`. Parts are not enemy bodies, and neither are spawned things without health (blasts, flashes, shards). Any cause of death counts: shot down, contact self-destruct, or lifetime running out. **Where:** `killEntity` in `src/mission/enemyspec/runtime.js` already makes every death's burst. For an enemy body, it now offers the death to an optional host hook on `ctx`. A host with the hook gets the death **instead of** the burst. A host without it bursts exactly as today, so the Firing Room, Enemy Designer and the other tools that run the runtime do not change. The mission's `_ctx` provides the hook, which logs a sixth feedback kind, `xpl`. It carries the body's centre, its larger box dimension (raw, never scaled), the y of its bottom edge, the root's spec id, and whether the body is the root. `cause` is `null`, so everybody perceives it. The mission-side burst in `_updateEnemies`' root-death block is deleted. `applyFeedback("xpl")` hands the event to the external view through a new optional view method, `explosion`, when the view is live, and does nothing otherwise. That gate is only right because O2 has landed: before O2 the view is installed and live even while 2D is drawing, and its effect pools are not stepped then. The 3D view converts the point into its space (`viewY`) and calls the existing `explosion` composite in `src/mission/view3d/enemyfx.js` in its own orange, scaled by the body's size times a new live, local config knob (min above 0). It applies the knob on the viewing page, never at the emitter, because in a room the emitter is the server, which refuses local keys. **It skips the call** when `enemyFx3d` is off, and when the event is a root whose spec id has a bespoke rig death (`DEATH` in `src/mission/view3d/enemyanim.js`) **and** the rig file has loaded (`rigLoaded()`). That root is the Siege Automaton, whose own overload and wreck are its death. If the rig never loaded, it is drawn as blocks with no death sequence, so it gets the default. Its seeker missiles are not roots and always explode | **Changed: playable.** Every enemy body that dies explodes, in single-player and on both screens in a room, and no longer makes a coloured burst. A destroyed part still bursts |

E1 is independent and lands first. E2 is built after `tech/mission-3d-only.md` O2. See the gate note in E2.

**Acceptance for E2 is Bo's eye.** Kill a Husk Charger, a Floating Factory and its drones, the Iron Moth's seekers, and a Siege Automaton. Then do it again in a room with two seats.

**Bo's answers (2026-10-06):** no burst under the explosion. The Siege Automaton gets no default explosion. The explosion scales with the body, in the tester's orange. Drones and seeker missiles count as enemies. With `enemyFx3d` off there is no explosion, and that is accepted. A machine that cannot run the 3D view (`tech/mission-3d-only.md`) holding the deploy on an error is accepted.

## Reuses

| What | Where | Why |
|---|---|---|
| The one feedback funnel: `_feedback` logs in a room and plays locally, `applyFeedback` is the only player, and an unknown kind is ignored | `src/mission/mission.js` | `xpl` crosses the wire with no wire change: `feedbackFor` in `src/net/mission-wire.js` forwards any kind, and an older page ignores it |
| The one place every entity death runs once (`killEntity`, guarded by `alive`) and already makes the burst | `src/mission/enemyspec/runtime.js` | Roots and spawned bodies die through it, so one hook covers both. Root-death polling in `_updateEnemies` only sees roots |
| The runtime's host bridge: a host passes `ctx` with optional hooks, and the runtime checks for each one before calling it (`ctx.burst &&`) | `src/mission/enemyspec/runtime.js`, `src/mission/mission.js` (`_ctx`) | The explosion hook is one more optional hook. Tools that pass no hook keep the burst |
| "A spawn with health is an enemy" | `src/mission/enemyspec/perception.js` (`hostilesFor`), per `CLAUDE.md` | The same rule a companion already uses to decide what to shoot |
| The tester's explosion: flash, fireball glows, smoke, sparks that bounce on a floor, shock ring, all pooled | `src/mission/view3d/enemyfx.js` (`explosion`) | Already used at a spawned entity's own size for the Siege Automaton's blasts (`src/mission/view3d/enemy.js`, `EXPLOSIONS`). Nothing new to draw |
| The effects knob and its "hide" path | `src/game/config.js` (`enemyFx3d`), `src/mission/view3d/index.js` (`draw`) | Off already means no fireballs. The explosion obeys it |
| The external-view contract | `src/mission/mission.js` (`setView`, `_viewLive`), `src/mission/view3d/index.js` (the returned object) | One more optional method. `mission.js` still never imports `three` |
| Feedback tests: a room logs and doesn't play, a viewer builds what the room described, the cap | `test/mission-net.test.mjs` ("feedback:" block) | Where E1's and E2's cases go |

## Where the code goes

| Path | What |
|---|---|
| `src/mission/mission.js` | E1: `_kill`'s direct `_burst` becomes feedback. E2: the `_ctx` hook that logs `xpl`, the `applyFeedback` case, deleting the root-death block's burst, and updating the feedback-kinds comment table |
| `src/mission/enemyspec/runtime.js` | E2: in `killEntity`, an enemy body offers its death to the host hook if there is one, else bursts as before |
| `src/mission/view3d/index.js` | E2: `explosion(x, y, size, floor, specId, isRoot)` on the view object. It applies the size knob. A no-op with no level, with `enemyFx3d` off, or for a root whose bespoke rig death will play. It needs `rigLoaded` (`src/mission/view3d/enemyrig.js`) and `DEATH` (`src/mission/view3d/enemyanim.js`) |
| `src/game/config.js` | E2: the size knob in the Viewport group beside `enemyFx3d`. `live: true`, local scope (only a page's view reads it), so a room's exported-config counts gain one local key, and `test/tools.test.mjs`'s `VIEWPORT` list and live-item count gain one |
| `test/mission-net.test.mjs` | E1 and E2 cases in the feedback block |
| `test/enemyspec-runtime.test.mjs` | E2: the hook-or-burst split in `killEntity` |

## The seam

| Owns | Must not touch |
|---|---|
| A cosmetic event per enemy-body death | Anything the simulation reads. No damage, no `scene.rng`, no field `sampleScene` reads. The golden must not move |
| The view's `explosion` method | `enemyfx.js`'s composite. It is reused as is, so the tester's explosion and the death explosion stay one look |
| | Per-enemy bespoke deaths (`DEATH`, `FX`, `EXPLOSIONS` in `src/mission/view3d/`). They are untouched. The Siege's root skips the default; its missiles do not |

## Must not regress

**`node test/run.mjs` fully green on both slices.**

| Suite | What it pins | New |
|---|---|---|
| `test/mission-golden.test.mjs` | Gameplay trace unchanged. Feedback is not sampled | — |
| `test/mission-net.test.mjs` | Feedback logging, per-seat filtering, the 64-event cap, the local-knob count | E1: a soldier killed on a room mission logs one `bst` and builds no particles there. A seat applying that snapshot builds the burst. E2: a root's death logs one `xpl` and no `bst`. A spawned drone shot down logs one `xpl`. A part's death logs a `bst` and no `xpl`. A local mission with a stub view hands `explosion` the centre, size, spec id and the root flag. With no view, nothing throws. The knob count moves by one |
| `test/enemyspec-runtime.test.mjs` | Death cascades, spawn lifecycle | With a hook: an enemy body's death calls it once and does not burst, and a part bursts. Without a hook: every death bursts as today. A spawned entity without health never reaches the hook |
| `test/tools.test.mjs` | Viewport group membership and live-item count | One more item |
| `test/docs.test.mjs` | This spec's citations | — |

**Where the bar cannot see the work:** the 3D half of E2 (`src/mission/view3d/index.js`). No test imports it. How it looks, and whether it lands at the right spot, is checked only by playing.

## Approximations

| Where | What the build does | What catches it |
|---|---|---|
| Busy snapshots | The 64-event cap is per **snapshot**, not per step: `server.mjs` clears the log once per broadcast, so at the default `missionSnapshotHz` of 20, three steps share it. A death late in a busy window loses its `xpl`, and E1's soldier bursts spend the same budget. Single-player has no cap | Same loss every spark and sound already takes. Not measured |
| Pool overwrite | The enemy-effect pools are fixed rings (glows, smokes, sparks), written round-robin. Several large deaths at once overwrite live smoke, including a Siege Automaton's | By eye |
| `enemyFx3d` off | No explosion and no burst: an enemy dies with no effect at all. Bo accepted this | — |
| Rig loaded but not fitting | A Siege Automaton whose rig loaded but does not fit its box is drawn as blocks with no death, and also gets no default | Rare. By eye |
| Floor | The ground y is the body's bottom edge. A flyer or missile killed in the air gets sparks that bounce on its own feet's level | By eye |
| A missile's lifetime | A seeker that times out explodes the same as one shot down or one that hits. All three count as a death | By eye |
| Timing on a host | Emitted during `update()`, so on a frame that runs several steps it is drawn starting from the frame's end, not mid-frame | Under one frame. Invisible |
