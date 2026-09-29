---
type: tech
category: development-tools
status: unbuilt
resolution: sharp
needs: [squad-survival, pause-menu]
related: [soldier-ducking, mission-determinism]
---

# Squad debug view

How the mission draws what each squadmate perceives and decides — threats, spot choice, dodge tags — and adds slow motion and a freeze on squadmate death. Implements `design/squad-debug.md`.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| D0 | **Records.** Three facts the squad already computes and throws away are kept. (a) **Dodge verdicts**: `tickDuck` in `src/mission/ai.js` appends one entry per judged threatening round to a short bounded log on the soldier's existing `duck` state — round, time on `scene.survivalClock` (the one clock ai.js can reach; it runs whenever a squadmate ticks, which is the only time a verdict is written), and the verdict: `duck`, `jump`, `cant` (a threat nothing clears) or `missed` (a dodge existed, the roll failed). That needs `dodgeFor` to tell "no threat" from "no dodge", which today both return null. A round judged no threat, and an `explode` round (skipped before prediction), write nothing. When `act()` abandons a planned jump with no fallback (no launch clears any more and the knee does not either), the entry is marked abandoned. (b) **Hits**: `resolveHit` in `src/mission/combat.js` calls an OPTIONAL `ctx.hit(p, target)` before applying effects; the Mission's `_ctx` implements it by marking the verdict entry for that round as hit, upgrading it to `late` when the soldier's `duck.pending` is still waiting on that round or the entry was abandoned. The Firing Room's ctx does not implement it. (c) **Spot choice**: `spotScorer` in `src/mission/enemyspec/runtime.js` collects, per probe `of()` is called on, the position and each term it actually computed (travel, crowding, shot, exposure), the total, and whether it was cut off by the bound; its three callers (the first fight pick, the repath-tick recheck, the cover pick) store the pass on the agent with the kind (fight/cover), the stay entry, the chosen point (or "stayed") and the time — but only a pass that scored at least the stay entry. `holdPoint` and `coverPoint` return null without calling `of()` when there is no graph or no node underfoot, and such a non-pick must not replace the last real one. Nothing in `update()` reads any record | **Unchanged.** Same rolls, same flights, same decisions — the golden is the guard |
| D1 | **The three layers.** Actions `debugThreats`, `debugSpots`, `debugDodges` appended to `ACTIONS` in `src/game/controlmap.js`, default keys T, Y, U, labelled, and added to `LOCAL_ONLY` in `src/net/mission-wire.js`. Toggled in `Mission._handleOverlays` beside Graph/Path, gated on `config.debugOverlays`, reset each deploy. `_handleOverlays` deliberately runs for a room viewer too, and a viewer holds real `specRoots` the wire overwrites in place — so the new toggles, and the draw, are also gated on `!this.remote`; Graph/Path keep their current behaviour. Drawn by a new DOM-free module in the world transform where the nav overlays are, for every living squadmate that is not a leader and has a spec agent (`s.agent`) — a `companionBrain: "legacy"` squadmate has no agent, sense, duck state or spot pass and is not annotated. **Threats**: a line from each hostile root for which `theyCanHit` (`src/mission/enemyspec/perception.js`) is true against the squadmate's standing box — recomputed by the overlay at most once per `SENSE_INTERVAL` of mission time and held between, never through the exposure cache. **Spots**: the latest D0 pass — every recorded probe coloured by rank of its total, the chosen one ringed, the stay entry marked distinctly, each labelled with its computed terms (a skipped term prints as `–`, a cut-off probe is faded). **Dodges**: the D0 verdicts newer than one second, as tags over the squadmate | **Changed: first playable.** Three keys draw the three layers |
| D2 | **Slow motion.** Action `debugSlow`, default key B, local-only, cycles 1 → ½ → ¼ → 1. It scales the frame time `Mission._frame` adds to the accumulator, after the 0.25s clamp; `STEP` and `update()` never see it, so the same steps run in the same order, only further apart. Gated on `config.debugOverlays` like every other debug key, and ignored on a remote mission. Printed in the flat layer while below 1. Reset to 1 each deploy | **Changed.** B slows a single-player or hot-seat mission |
| D3 | **Pause on death.** A `debugPauseOnDeath` bool in the config's Viewport group, after `debugOverlays` — `live: true`, local scope, default on — and its row in `design/pause-menu.md`'s options table. `Mission._kill` on an AI-driven soldier (not a leader) of a hosted, non-remote mission, with both knobs on, writes a death record: who, the killer (the owner passed to `_kill` — for an enemy that is its ROOT, since emitter rounds and contact damage both carry the root as owner — named off its spec, or a soldier's name under friendly fire), the round from the D0 hit mark if one landed this step, health at the start of the step it died in (snapshotted per AI squadmate at the top of `_updateSoldiers`, because a burn tick lowers health and calls `ctx.kill` without passing through `_damage`), `brainState.current` and `stateTime`, `sense.exposure`, and the D0 verdict for that round. `_frame` stops stepping for the rest of that frame, and `_frozen()` holds while a card is up — the pause freeze's shape: no samples, no steps, render and camera continue. The card is drawn on the mission canvas's flat layer, so it shows in 3D too. Several deaths in one step share one card. The `pause` press, read once per frame where it already is, dismisses the card instead of opening the menu; dismissing drops the accumulated time and pending presses, as resuming from the menu does. Two suites drive the real `_frame` on a hosted canvas — `test/pause-menu.test.mjs` and the frame-rate block of `test/mission-golden.test.mjs`, whose `atRate` loops until a step count is reached and would never exit behind a freeze. Both pin `debugPauseOnDeath` off; no soldier dies in the golden trace today, so this is a guard, not a fix | **Changed.** A squadmate death freezes the mission under a card |

D0 is a pure record with an unchanged golden. D1 is the feature; D2 and D3 each land alone after it (D3 reads D0's verdicts, not D1's drawing).

## Reuses

| What | Where | Why |
|---|---|---|
| The overlay gate, the per-deploy `debug` toggles, their key handling above the viewer's early return | `src/mission/mission.js` (`this.debug`, `_handleOverlays`, `config.debugOverlays`) | Three more toggles in the same place, on the same gate |
| The squad label and path drawing, and where overlays sit in the draw order | `src/mission/mission.js` (`_drawSquadPaths`, `render`) | The new layers draw beside them: under bodies and shots in 2D; in 3D the world is on the Three.js canvas below, so every overlay sits on top of it |
| Local-only actions | `src/net/mission-wire.js` (`LOCAL_ONLY`, `WIRE_ACTIONS`) | Four more names; the wire's bit order does not move |
| Rebindable actions, labels, default keys, and the fill-in of unbound defaults for saved maps | `src/game/controlmap.js` | The Controls tool lists them with no UI work, and an old saved map still gets T/Y/U/B |
| Can a hostile hit this box | `src/mission/enemyspec/perception.js` (`theyCanHit`; `SENSE_INTERVAL`, module-private today, exported in D1) | The threat line is exactly the exposure rule, per hostile instead of summed |
| The dodge reflex's own state and verdict point | `src/mission/ai.js` (`tickDuck`, `dodgeFor`, `soldier.duck`, `duck.pending`) | The verdict is already decided there once per round per soldier; D0 writes it down |
| The spot scorer and its three call sites | `src/mission/enemyspec/runtime.js` (`spotScorer`, `repositionRequest`, `coverRequest`) | Its terms are computed there; the record is those terms |
| The hit callback contract | `src/mission/combat.js` (`resolveHit`, the `ctx` header) | Optional hooks (`spark`, `burst`) are precedent for an optional `hit` |
| Brain state and its timer | `src/mission/enemyspec/brain.js` (`brainState.current`, `stateTime`) | "What it was doing and for how long" |
| The pause freeze: frame-read key, `_frozen`, accumulator and press drop on resume | `src/mission/mission.js` (`_frame`, `_frozen`, `setPaused`), `src/mission/input.js` (`takePress`, `dropPresses`) | The death freeze is the same freeze with a different reason |
| Driving the real `_frame` off a synthetic clock | `test/pause-menu.test.mjs` | How D2 and D3 are tested headlessly |

## Where the code goes

| Path | What |
|---|---|
| `src/mission/ai.js` | D0 dodge verdict log; `dodgeFor` distinguishes no-threat from no-dodge |
| `src/mission/combat.js` | D0 optional `ctx.hit(p, target)` in `resolveHit`; header gains the line |
| `src/mission/enemyspec/runtime.js` | D0 spot-pass record in `spotScorer` and its callers |
| `src/mission/debugview.js` (new) | D1 drawing of the three layers and D3's card. DOM-free, takes a 2D context and plain data, no imports from `src/hub/` — `mission.js` must stay bare-node importable |
| `src/mission/mission.js` | D0 `_ctx.hit`; D1 toggles and draw call; D2 time scale in `_frame` and its label; D3 death record, freeze, dismissal |
| `src/game/controlmap.js` | D1/D2 four actions, labels, default keys |
| `src/net/mission-wire.js` | D1/D2 the four names in `LOCAL_ONLY` |
| `src/game/config.js` | D3 `debugPauseOnDeath`; the `debugOverlays` help names the new keys (D1) |
| `design/pause-menu.md` | D3 the Viewport row gains the new setting |
| `test/companion-aim.test.mjs` | D0 verdict cases (duck, jump, cant, missed, late) beside the existing dodge cases |
| `test/reposition.test.mjs` | D0 spot record: the chosen probe is in the pass with the lowest total, the stay entry is present |
| `test/pause-menu.test.mjs` | D2 half speed runs half the steps and the same state per step; D3 freeze, dismissal, no menu; pins `debugPauseOnDeath` off for its other cases |
| `test/mission-golden.test.mjs` | D3 its frame-rate block pins `debugPauseOnDeath` off. The golden file itself is not re-frozen |
| `test/mission-net.test.mjs`, `test/controls.test.mjs` | D1/D2 `LOCAL` list and default keys |

## The seam

| Owns | Must not touch |
|---|---|
| Recording what the dodge, the scorer and the hit path already decided | Any decision, roll, flight or cache. A record is written, never read by `update()` |
| The overlay's own threat recompute, on its own clock | `exposureCache` — a display fill would change which frame the cache refills on, and so the mission |
| When real time turns into steps (`_frame`) | `STEP` and `update(dt)`. A driver of `update()` never slows or freezes; the two suites that drive `_frame` pin the death freeze off (D3) |
| Freezing a page's own mission on a squadmate death | A room's mission, the server's canvas-less `Mission`, and the pause menu's own state (`paused`, `onPauseChange`) |
| Local actions | The wire format: nothing new is sent, and nothing new is added to `mission-wire.js`'s snapshot |

## Must not regress

| Guard | Why |
|---|---|
| `test/mission-golden.test.mjs` and `test/mission.golden.json`, NOT re-frozen | Records are unconditional from D0 on; an unchanged golden is what proves they change nothing |
| `test/companion-aim.test.mjs` dodge and timed-jump cases | `dodgeFor`'s return changes shape |
| `test/reposition.test.mjs`, `test/navigation.test.mjs` cost ceilings | The scorer gains a record; its bound and segment-test count must not move |
| `test/crouch.test.mjs` | `resolveHit` gains a call |
| `test/pause-menu.test.mjs` | The freeze and the pause key gain a second meaning |
| `test/mission-net.test.mjs` (`WIRE_ACTIONS` order, action classification, knob counts) and `test/tools.test.mjs` knob counts | Four actions and one local knob |
| `test/controls.test.mjs` | Default keys and the saved-map fill |

## Approximations

| Where | Not exact | Caught by |
|---|---|---|
| Threat lines | Recomputed from the live scene at most once per sense interval, so they show who can hit it now, which can differ by up to one interval from the cached count its decisions used | Nothing; the label's exposure number is still the sense value |
| Spot layer | Nodes the scorer skipped whole (travel alone could not beat the best) have no probes and are not drawn; a probe cut off by the bound shows only the terms computed before the cut. "Every spot it weighed" means every spot it scored at all | The faded draw and `–` terms say so in the view |
| `late` | Detected for a hit by the round a pending dodge was waiting on, or whose planned jump was abandoned; a different round landing during the wait carries its own verdict | Test cases in `companion-aim` |
| Death card exposure | The squadmate's `sense.exposure` — what it believed, read through the shared cache, up to one sense interval old — not a fresh count of where it fell | — |
| Health on the card | Health at the start of the step it died in, so two hits landing in one step read as one | — |
| Blasts | `explode` rounds are never judged (tech/soldier-ducking.md), so they carry no tag and a blast death's card says "no tag" | By design (`design/squad-survival.md`, Does not cover) |
| Killer on the card | The owner passed to `_kill`, which for an enemy is its root, never the part that fired; burn deaths have an owner and no round | — |
| Tag lifetime | One second, a constant in the view rather than a `SCHEMA` knob, against the repo's "every number in a schema" convention; the design fixes it at about a second and it tunes nothing | — |
| Headless | Nothing asserts on pixels; `render()` with layers on is exercised on the harness's `ctx2d` stub so a throw is caught | Eyeball in a browser |
