---
type: tech
category: development-tools
status: unbuilt
resolution: sharp
needs: [squad-survival, pause-menu]
related: [soldier-ducking, mission-determinism]
---

# Squad debug view

How the mission draws what each squadmate perceives and decides — threats, spot choice, dodge tags — from a Debug screen in the pause menu, with slow motion and a freeze on squadmate death. Implements `design/squad-debug.md` and the Debug additions to `design/pause-menu.md`.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| D0 | **Records.** Three facts the squad already computes and throws away are kept. (a) **Dodge verdicts**: `tickDuck` in `src/mission/ai.js` appends one entry per judged threatening round to a short bounded log on the soldier's existing `duck` state — round, time on `scene.survivalClock` (the one clock ai.js can reach; it runs whenever a squadmate ticks, which is the only time a verdict is written), and the verdict: `duck`, `jump`, `cant` (a threat nothing clears) or `missed` (a dodge existed, the roll failed). That needs `dodgeFor` to tell "no threat" from "no dodge", which today both return null. A round judged no threat, and an `explode` round (skipped before prediction), write nothing. When `act()` abandons a planned jump with no fallback (no launch clears any more and the knee does not either), the entry is marked abandoned. (b) **Hits**: `resolveHit` in `src/mission/combat.js` calls an OPTIONAL `ctx.hit(p, target)` before applying effects; the Mission's `_ctx` implements it by marking the verdict entry for that round as hit, upgrading it to `late` when the soldier's `duck.pending` is still waiting on that round or the entry was abandoned. The Firing Room's ctx does not implement it. (c) **Spot choice**: `spotScorer` in `src/mission/enemyspec/runtime.js` collects, per probe `of()` is called on, the position and each term it actually computed (travel, crowding, shot, exposure), the total, and whether it was cut off by the bound; its three callers (the first fight pick, the repath-tick recheck, the cover pick) store the pass on the agent with the kind (fight/cover), the stay entry, the chosen point (or "stayed") and the time — but only a pass that scored at least the stay entry. `holdPoint` and `coverPoint` return null without calling `of()` when there is no graph or no node underfoot, and such a non-pick must not replace the last real one. Nothing in `update()` reads any record | **Unchanged.** Same rolls, same flights, same decisions — the golden is the guard |
| D1 | **The Debug screen, holding what exists.** `debugGraph` and `debugPath` leave `ACTIONS` in `src/game/controlmap.js` and `LOCAL_ONLY` in `src/net/mission-wire.js`; one action, `debugMenu`, default key Backquote, labelled, local-only, joins them. A saved key map holding G/H loses them on load (`load()` already drops codes whose action no longer exists) and gains Backquote where free. `debugMenu` is read once per rendered frame in `Mission._frame`, where `pause` is and with the same optional call (`takePress?.`), because the golden's `scriptedInput` (`test/mission-trace.mjs`) has no `takePress` — and only while `config.debugOverlays` is on and the mission is not remote: closed, it pauses with the Debug screen requested; open, it closes the menu as `pause` does. `MissionInput`'s suspended mode lets `debugMenu` through beside `pause`. `setPaused` carries the requested screen to `onPauseChange`, and `src/main.js` passes it to `createPauseMenu` with a `debug` handle onto the mission's per-deploy `debug` state — null in a room. The Debug item's visibility is decided at every draw from `config.debugOverlays`, not at open: the knob is live and on the Options screen of the same menu, so turning it off there and pressing Back must hide Debug, and turning it on must show it. `src/hub/pause.js` gains the Debug item and screen (Back to the menu) with Nav graph and Squad routes toggles writing `mission.debug.graph`/`.path`. `_handleOverlays` is deleted; the draw path reads the same flags it does now. Not a pure relocation: the G/H toggles ran above the remote early return on purpose, so a room viewer could draw the two overlays, and the Debug screen does not exist in a room (Approximations) | **Changed.** G and H stop doing anything; `` ` `` opens a Debug screen that toggles the same two overlays; a room viewer loses them |
| D2 | **The three layers.** Threats, Spot choice and Dodges toggles on the Debug screen, `debug` flags reset each deploy, drawn only on a non-remote mission. Drawn by a new DOM-free module in the world transform where the nav overlays are, for every squadmate that is not a leader, has a spec agent (`s.agent`), and is either alive or the subject of the death card up now (D4) — the one soldier a card is about must be inspectable on its own frozen frame — a `companionBrain: "legacy"` squadmate has no agent, sense, duck state or spot pass and is not annotated. **Threats**: a line from each hostile root for which `theyCanHit` (`src/mission/enemyspec/perception.js`) is true against the squadmate's standing box — recomputed by the overlay at most once per `SENSE_INTERVAL` of mission time and held between, never through the exposure cache. **Spots**: the latest D0 pass — every recorded probe coloured by rank of its total, the chosen one ringed, the stay entry marked distinctly, each labelled with its computed terms (a skipped term prints as `–`, a cut-off probe is faded). **Dodges**: the D0 verdicts newer than one second, as tags over the squadmate | **Changed: first playable of the new view.** The three layers |
| D3 | **Slow motion.** A Speed control on the Debug screen (full, ½, ¼) writing `mission.debug.speed`, reset to 1 each deploy. It scales the frame time `Mission._frame` adds to the accumulator, after the 0.25s clamp; `STEP` and `update()` never see it, so the same steps run in the same order, only further apart. Ignored on a remote mission. Printed in the flat layer while below 1 | **Changed.** A single-player or hot-seat mission can be slowed |
| D4 | **Pause on squadmate death.** A `debugPauseOnDeath` bool in the config's Viewport group, after `debugOverlays` — `live: true`, local scope, default on. It shows in the Options screen by `pauseSchema`'s existing rule, and the Debug screen renders the same item through the same `setConfig` path. `Mission._kill` on an AI-driven soldier (not a leader) of a hosted, non-remote mission, with both knobs on, writes a death record: who, the killer (the owner passed to `_kill` — for an enemy that is its ROOT, since emitter rounds and contact damage both carry the root as owner — named off its spec, or a soldier's name under friendly fire), the round from the D0 hit mark if one landed this step, health at the start of the step it died in (snapshotted per AI squadmate at the top of `_updateSoldiers`, because a burn tick lowers health and calls `ctx.kill` without passing through `_damage`), `brainState.current` and `stateTime`, `sense.exposure`, and the D0 verdict for that round. A `companionBrain: "legacy"` squadmate is AI-driven too and gets a card, but has no agent, so its state, time, exposure and tag print as `–`. The record lives on the Mission beside `debug`, and `start()` and `stop()` clear it, so a freeze cannot carry into the next deploy. `_frame` stops stepping for the rest of that frame. The card is a second reason to freeze beside `paused`: `_frozen()` holds while either is set, with the pause freeze's shape (no samples, no steps, render and camera continue), and the menu and the card are independent — `debugMenu` opens the Debug screen over a frozen card, and closing the menu returns to it. With the menu closed, a `pause` press dismisses the card instead of opening the menu; dismissing drops the accumulated time and pending presses, as resuming from the menu does. The card is drawn on the mission canvas's flat layer, so it shows in 3D too. Several deaths in one step share one card. Two suites drive the real `_frame` on a hosted canvas — `test/pause-menu.test.mjs` and the frame-rate block of `test/mission-golden.test.mjs`, whose `atRate` loops until a step count is reached and would never exit behind a freeze. Both pin `debugPauseOnDeath` off; no soldier dies in the golden trace today, so this is a guard, not a fix | **Changed.** A squadmate death freezes the mission under a card |

D0 is a pure record with an unchanged golden. D1 is a relocation of existing overlays, playable on its own. D2 is the new view; D3 and D4 each land alone after D1 (D4 reads D0's verdicts, not D2's drawing).

## Reuses

| What | Where | Why |
|---|---|---|
| The pause menu: its screens, Back, focus, the freeze, input suspension, the one close path through `onPauseChange` | `src/hub/pause.js`, `src/mission/mission.js` (`setPaused`, `_frozen`, `_frame`), `src/mission/input.js` (`suspend`, `takePress`, `dropPresses`), `src/main.js` | The Debug screen is a third screen of the same menu; the death freeze is the same freeze with a second reason |
| Schema → controls renderer and `setConfig` | `src/hub/controls.js`, `src/game/config.js` | The Pause on death toggle on the Debug screen is the same control and write the Options screen already makes |
| The overlay gate and per-deploy `debug` flags | `src/mission/mission.js` (`this.debug`, `config.debugOverlays`) | The screen writes the flags the draw path already reads |
| The squad label and path drawing, and where overlays sit in the draw order | `src/mission/mission.js` (`_drawSquadPaths`, `render`) | The new layers draw beside them: under bodies and shots in 2D; in 3D the world is on the Three.js canvas below, so every overlay sits on top of it |
| Local-only actions | `src/net/mission-wire.js` (`LOCAL_ONLY`, `WIRE_ACTIONS`) | Two names out, one in; the wire's bit order does not move |
| Rebindable actions, and a saved map dropping unknown actions and gaining new defaults | `src/game/controlmap.js` (`ACTIONS`, `DEFAULT_KEYS`, `load()`) | Retiring G/H and adding `` ` `` needs no migration code |
| Can a hostile hit this box | `src/mission/enemyspec/perception.js` (`theyCanHit`; `SENSE_INTERVAL`, module-private today, exported in D2) | The threat line is exactly the exposure rule, per hostile instead of summed |
| The dodge reflex's own state and verdict point | `src/mission/ai.js` (`tickDuck`, `dodgeFor`, `act`, `soldier.duck`, `duck.pending`) | The verdict is already decided there once per round per soldier; D0 writes it down |
| The spot scorer and its three call sites | `src/mission/enemyspec/runtime.js` (`spotScorer`, `repositionRequest`, `coverRequest`) | Its terms are computed there; the record is those terms |
| The hit callback contract | `src/mission/combat.js` (`resolveHit`, the `ctx` header) | Optional hooks (`spark`, `burst`) are precedent for an optional `hit` |
| Brain state and its timer | `src/mission/enemyspec/brain.js` (`brainState.current`, `stateTime`) | "What it was doing and for how long" |
| Driving the real `_frame` off a synthetic clock, and mounting the menu headlessly | `test/pause-menu.test.mjs`, `test/harness.mjs` | How D1, D3 and D4 are tested |

## Where the code goes

| Path | What |
|---|---|
| `src/mission/ai.js` | D0 dodge verdict log; `dodgeFor` distinguishes no-threat from no-dodge |
| `src/mission/combat.js` | D0 optional `ctx.hit(p, target)` in `resolveHit`; header gains the line |
| `src/mission/enemyspec/runtime.js` | D0 spot-pass record in `spotScorer` and its callers |
| `src/mission/enemyspec/perception.js` | D2 exports `SENSE_INTERVAL` |
| `src/mission/debugview.js` (new) | D2 drawing of the three layers, D3's speed label and D4's card. DOM-free, takes a 2D context and plain data, no imports from `src/hub/` — `mission.js` must stay bare-node importable |
| `src/mission/mission.js` | D0 `_ctx.hit`; D1 frame-read `debugMenu`, screen request through `setPaused`, `_handleOverlays` deleted; D2 flags and draw call; D3 time scale in `_frame`; D4 death record, second freeze reason, dismissal |
| `src/mission/input.js` | D1 suspended mode passes `debugMenu` |
| `src/hub/pause.js` | D1 Debug item and screen; D2/D3/D4 its controls |
| `src/main.js` | D1 passes the requested screen and the `debug` handle to `createPauseMenu` |
| `src/hub/hub.css` | D1 any Debug-screen rules, beside the existing `pm-*` ones |
| `src/game/controlmap.js` | D1 `debugGraph`/`debugPath` out, `debugMenu` in, label, Backquote default |
| `src/net/mission-wire.js` | D1 `LOCAL_ONLY` follows |
| `src/game/config.js` | D1 `debugOverlays` help names the Debug screen and key instead of Graph/Path keys; D4 `debugPauseOnDeath` |
| `test/companion-aim.test.mjs` | D0 verdict cases (duck, jump, cant, missed, late) beside the existing dodge cases |
| `test/reposition.test.mjs` | D0 spot record: the chosen probe is in the pass with the lowest total, the stay entry is present, a null-graph call leaves the last pass |
| `test/pause-menu.test.mjs` | D1 `` ` `` opens on Debug, closes from any screen, Debug item absent with overlays off and in a room, toggles write the mission's flags; D3 half speed runs half the steps and the same state per step; D4 freeze, dismissal, no menu, menu over the card returns to it; pins `debugPauseOnDeath` off for its other cases |
| `test/tools.test.mjs` | D4 its pins on the Viewport group's keys by name and on the pause menu's size ("39 + survival") gain `debugPauseOnDeath` |
| `test/mission-golden.test.mjs` | D4 its frame-rate block pins `debugPauseOnDeath` off. The golden file itself is not re-frozen |
| `test/mission-net.test.mjs`, `test/controls.test.mjs` | D1 `LOCAL` list; the G/H default-key and rebind cases move to `debugMenu` |

## The seam

| Owns | Must not touch |
|---|---|
| Recording what the dodge, the scorer and the hit path already decided | Any decision, roll, flight or cache. A record is written, never read by `update()` |
| The overlay's own threat recompute, on its own clock | `exposureCache` — a display fill would change which frame the cache refills on, and so the mission |
| When real time turns into steps (`_frame`) | `STEP` and `update(dt)`. A driver of `update()` never slows or freezes; the two suites that drive `_frame` pin the death freeze off (D4) |
| Which screen the pause menu opens on, and the Debug screen's controls | The menu's close path: every way out still ends in `onPauseChange(false)` |
| Freezing a page's own mission on a squadmate death | A room's mission and the server's canvas-less `Mission` |
| Local actions | The wire format: nothing new is sent, and nothing new is added to `mission-wire.js`'s snapshot |

## Must not regress

| Guard | Why |
|---|---|
| `test/mission-golden.test.mjs` and `test/mission.golden.json`, NOT re-frozen | Records are unconditional from D0 on; an unchanged golden is what proves they change nothing |
| `test/companion-aim.test.mjs` dodge and timed-jump cases | `dodgeFor`'s return changes shape |
| `test/reposition.test.mjs`, `test/navigation.test.mjs` cost ceilings | The scorer gains a record; its bound and segment-test count must not move |
| `test/crouch.test.mjs` | `resolveHit` gains a call |
| `test/pause-menu.test.mjs` | The menu gains a screen, the freeze gains a reason, the pause key gains a meaning over a card |
| `test/mission-net.test.mjs` (`WIRE_ACTIONS` order, action classification, knob counts) and `test/tools.test.mjs` (Viewport keys by name, pause menu size) | Actions change and one local knob is added |
| `test/controls.test.mjs` | Default keys and the saved-map load |

## Approximations

| Where | Not exact | Caught by |
|---|---|---|
| Threat lines | Recomputed from the live scene at most once per sense interval, so they show who can hit it now, which can differ by up to one interval from the cached count its decisions used | Nothing; the label's exposure number is still the sense value |
| Spot layer | Nodes the scorer skipped whole (travel alone could not beat the best) have no probes and are not drawn; a probe cut off by the bound shows only the terms computed before the cut. "Every spot it weighed" means every spot it scored at all | The faded draw and `–` terms say so in the view |
| `late` | Detected for a hit by the round a pending dodge was waiting on, or whose planned jump was abandoned; a different round landing during the wait carries its own verdict | Test cases in `companion-aim` |
| Death card exposure | The squadmate's `sense.exposure` — what it believed, read through the shared cache, up to one sense interval old — not a fresh count of where it fell | — |
| Health on the card | Health at the start of the step it died in, so two hits landing in one step read as one | — |
| Blasts | `explode` rounds are never judged (`tech/soldier-ducking.md`), so they carry no tag and a blast death's card says "no tag" | By design (`design/squad-survival.md`, Does not cover) |
| Killer on the card | The owner passed to `_kill`, which for an enemy is its root, never the part that fired; burn deaths have an owner and no round | — |
| Tag lifetime | One second, a constant in the view rather than a `SCHEMA` knob, against the repo's "every number in a schema" convention; the design fixes it at about a second and it tunes nothing | — |
| Room missions | Nav graph and Squad routes were visible to a room viewer through G/H; with the Debug screen hidden in a room, they no longer are, and `` ` `` neither opens nor closes a room mission's menu | `design/squad-debug.md` and `design/pause-menu.md` exclude rooms |
| Headless | Nothing asserts on pixels; `render()` with layers on is exercised on the harness's `ctx2d` stub so a throw is caught | Eyeball in a browser |
