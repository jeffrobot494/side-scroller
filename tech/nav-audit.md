---
type: tech
category: artificial-intelligence
status: reference
resolution: sharp
related: [agent-navigation, nav-clearance, locomotion, ranged-repositioning, soldier-ducking]
---

# Nav audit (2026-09-12)

An audit of companion/agent navigation: why companions follow in bursts, loop on simple terrain, and fail stacked climbs the player can make, plus other bug sources and simplifications. Line numbers are against commit `e68037a`.

Two audits are merged here. Findings marked **†** come from a second audit (ChatGPT, same date) and were verified by reading the code; everything unmarked was checked with a headless sim driving real `Soldier` physics unless it says otherwise.

**The central defect, stated once:** destination selection, route planning and movement execution each assume something different about the body, and the failure ledger reads "the controller did not perform this move" as "this terrain is impossible".

## Summary

| # | Symptom | Root cause | Where |
|---|---|---|---|
| 1 | Follows in bursts | Escort is a scripted `moveTo` (0.6s timeout) + `wait 0.12` loop toward a snapshot of the leader | `companionspecs.js:48-51`, `runtime.js:333-343` |
| 2a | Loops on a one-ledge terrain | The escort point depends on the companion's own position, and `nearestNode` has no hysteresis | `runtime.js:566-571`, `nav.js:722-733` |
| 2b | Stuck pushing into a wall | Drop edges leave through headroom-cut span ends (a wall, not a lip) and are never clearance-checked or counted as failures | `nav.js:139-143`, `nav.js:227`, `navigation.js:332-354` |
| 3 | Can't climb stacks the player climbs | Clearance requires every takeoff to fly from a standstill AND to be clear of the destination footprint; the working launch is running, from under the footprint | `nav.js:496-498`, `nav.js:376-382`, `nav.js:579`, `navigation.js:387` |
| 3b | Over-pruning generally | The predictor treats any side contact as failure; the integrator does not | `nav.js:643` |
| 2c † | Stuck at the world edge | Spans and takeoffs extend a body width past a platform (the ground's node starts at x=−30), but `stepActor` clamps x ≥ 0; an unreachable takeoff books no failure | `nav.js:138`, `entities.js:130`, `navigation.js:418-433` |
| 4a | Valid climbs permanently lost | Failures are booked for jumps that were requested but never performed (crouch, interruption, control swap), and bans never expire | `navigation.js:249-271`, `navigation.js:397` |

## 1. Bursts

The escort state in `src/game/companionspecs.js` is a track: `moveTo { target: "anchor", offset: [-90, 0], speed: 320, timeout: 0.6 }` then `wait 0.12`, looped.

| Mechanism | Effect | Where |
|---|---|---|
| `moveTo` resolves the leader's position once, when the step runs | Companion chases a stale point, not the leader | `runtime.js:758-764` |
| Order ends on timeout → `{ kind: "stop" }` | Soldier friction (3000px/s²) takes 320→0 in 7 frames | `runtime.js:334-343`, `entities.js:290-293` |
| During `wait`, the standing controller is `static` | More `stop` frames | `runtime.js:376` |
| Next order re-accelerates at 2600px/s² | 7 frames to full speed | `entities.js:284-289` |
| Router stops inside `navArriveRadius` (14px); the order only completes inside a hard-coded 12px | A companion 12–14px from its point stands idle for the whole 0.6s timeout | `navigation.js:306` vs `runtime.js:335` |
| SOLDIER locomotor reads only `Math.sign(req.v)` | `driveV`'s magnitude is discarded; always full speed then brake, overshoot | `locomotion.js:141` |

**Measured** (flat ground, leader runs right from frame 30): companion idle for the first 35 frames (the arrival mismatch), then a repeating cycle of 36 frames at 320px/s, 7 braking, 2 stopped, 7 accelerating. Gap after 4s: 471px and growing.

## 2. Loops and stuck states

### 2a. Oscillating goal

`resolveTargetPoint` applies `offset[0]` along the companion→leader line, normalised in 2D. The point therefore moves when the companion moves. `nearestNode` then picks a surface by `dx² + dy²` (×4 when the node is above the point), with no memory of the previous choice.

**Repro:** ground `{0,500,1600,40}`, ledge `{885,445,178,20}`, leader standing on the ground at x=829.

| Companion on | Escort point (left edge) | Scores | Picks |
|---|---|---|---|
| Ground (x=855) | 919 | ledge 4096, ground 4625 | ledge → climbs |
| Ledge (x=911) | 904 | ground 2930, ledge 4096 | ground → drops |

Period ~121 frames, indefinitely. Found in 3 of 400 random one-to-three-platform terrains with a static leader; a moving leader was not measured. Every jump in the cycle succeeds, so the failure ledger never sees it — the destination is what oscillates.

### 2b. Drops through walls

`buildNodes` cuts floor where overhead clearance is under `h + 4`. The span then ends at the obstruction. The drop branch of `routeRequest` picks a lip from the two spans alone and drives `here.a - w` / `here.b + w`, straight into the obstruction. Drop edges get no clearance test, set no `leg`, and so book no attempts — nothing ever gives up.

- In all 4 traced cases where the clearance graph had a route but the companion never arrived, it was standing flush against a wall on a drop edge.
- Drop edges that can only be left through a cut end: 125 of 1,767 across 400 random terrains (99 terrains affected); 19 of 3,708 across 60 generated levels (`difficulty: "high", length: "long"`). A few may be 46–49px pockets a body can pass under.

### 2c. Takeoffs outside the world †

Neither `buildGraph` nor `flies()` receives the world width. A node's span starts at `p.x - w`, so a platform at x=10 offers a takeoff at x=−20, while `stepActor` clamps the body to x ≥ 0 and the follower's takeoff window (one frame, 5.33px) is never entered.

- The second audit's repro: platform at x=10, companion starting at x=0, a valid alternative takeoff at x=400. The companion held the world edge for the full 10s run.
- No jump is launched, so no attempt is booked and the commitment (`nav.commit`) is never replaced.
- Same class as 2b: **a target the body cannot physically reach, and nothing that notices lack of progress.** There is no traversal watchdog; recovery only starts after a launched jump lands elsewhere.

### Why follower failures happened, 400 random terrains

47 runs ended with the companion >250px from a static leader after 30s:

| Class | Count |
|---|---|
| Unreachable even in the unfiltered graph | 23 |
| Reachable unfiltered, pruned by clearance | 16 |
| Reachable on the clearance graph, follower failed | 7 (4 traced: all 2b) |
| Start or leader not on a node | 1 |

## 3. Stacked platforms

**Repro:** ground plus three 100×20 platforms at x=500, y=400/300/200.

| Variant | Unfiltered graph | Clearance graph |
|---|---|---|
| Aligned stack | all reachable | only the first platform |
| Each level offset +20px | all | all |
| Zigzag ±40px | all | all |
| Each upper level wider | all | only the first |
| Aligned, 60px wide | all | only the first |

**Why there is nothing to test.** For a 100px platform at x=500 and a 30px body, supported left-edge positions are 470.000001–599.999999 (`SUPPORT_EPS`), and the footprint-clear takeoffs beside an identical platform above are exactly 470 and 600 — both just outside the span. `clearTakeoffs` returns nothing, so the predictor has no candidate to fly. †

**The player can do it.** An input search found 149 scripts that climb the aligned stack. A typical one: run left, jump at x=489 (19px under the upper platform's footprint) at 320px/s, keep drifting out while rising, steer back over the top at the apex. The player clears the edge *during* the ascent; the graph requires clearance *before* it. Coyote-time launches off the lip are a second player capability the grounded-only router never plans. †

**The predictor agrees the manoeuvre flies** — probing `flies()` directly, launches at x=470–489 succeed with a −320px/s arrival and fail at 0. Two rules remove them:

| Rule | Where |
|---|---|
| A takeoff must fly at BOTH arrival speeds (full run and standstill) | `nav.js:496-498` |
| Takeoff candidates and the takeoff band must clear the destination footprint; the follower refuses to launch otherwise | `nav.js:376-382`, `nav.js:579`, `navigation.js:387` |

### 3b. Side contacts

`flies()` returns false on any horizontal contact. `collideAxis` zeroes `vx`, pushes the box out, and the arc continues — the same situation the 2026-09-09 head-contact fix addressed vertically.

Experimental variants of `nav.js` (scratch copies, not committed):

| Variant | Reachable node pairs, 300 random terrains | Hop+jump edges | Reachable pairs, 60 generated levels |
|---|---|---|---|
| Unfiltered | 5,831 | 1,284 | 69,529 |
| Current clearance | 4,703 | 662 | 69,347 |
| A: side contact resolved like `collideAxis` | 5,072 | 792 | 69,529 |
| B: A + running-only takeoffs + footprint rule relaxed | 5,157 | 824 | 69,529 |

- Every takeoff variant A produced (3,278 flights at both arrival speeds) landed when flown by a real `Soldier` through the follower's airborne policy (`airborneAimX` → sign → `applyMovement` → `stepActor`).
- Variant A does not fix stacks. Variant B makes the aligned and narrow stacks fully reachable; the upper-wider stack still fails.
- Caveat: these flights model the predictor's two arrival speeds, not a full follower run.

## 4. Other bugs

| # | Bug | Effect | Where |
|---|---|---|---|
| a | **Kneeling at a takeoff books a failed jump.** The router sets `nav.leg` when it *requests* a hop and never confirms the body jumped; `applyMovement` returns early when crouched; the next grounded frame is on the source node | Measured: a companion ducking every 0.5s at an 80px step banned the edge after 3 ducks and never climbed it. Held crouched continuously, the ban lands within 4 frames † | `navigation.js:397`, `entities.js:277-283`, `navigation.js:262-266` |
| b | **Bans never expire** for the life of the agent | Spurious failures (a, knockback) accumulate into permanently lost climbs | `navigation.js:264` |
| c | **Drop edges priced at full jump reach.** `linkBetween` uses `flatReach` for any drop; a walk-off covers `runSpeed · √(2dh/g)` | 476 of 3,708 drop edges on 60 generated levels (13%) are longer than a full-speed walk-off reaches; companion lands short and repaths | `nav.js:201` |
| d | **A drop sets no leg.** Mid-fall `routeRequest` returns null; the caller steers straight at the final destination, not the landing node | Drifts back toward the ledge's side | `navigation.js:212-213` |
| e | **Wrong-direction fallback, and direction never re-checked.** When no takeoff's `dirs` match the approach side, the follower uses `takeoffs[0]` anyway. `nav.commit` stores only `x`; the launch direction is inferred from position at commit time and never verified against actual velocity after an overshoot or reversal † | A jump known not to fly, then a ban | `navigation.js:418-433` |
| f | **Order timeout on the takeoff frame replaces the hop with `stop`** | Jump lost, re-decided next order | `runtime.js:333-343` |
| g | **`abortRoute` is incomplete.** It leaves `stepOff` (also never in `newNav`), `blocked` and `reachable` † | A later off-graph grounded frame can drive at a stale lip; `repositionRequest` can release on a stale `blocked` | `navigation.js:128-151`, `454-460` |
| j † | **`setMotion` clears `moveOrder` and `dash` but not route state** | A brain state change mid-jump leaves `nav.leg` for whichever controller next calls `routeRequest`, which books the landing against a manoeuvre it did not fly | `runtime.js:833-843` |
| k † | **Player-control swap preserves the companion's route.** A piloted soldier skips `updateCompanionSpec`, so its agent's `nav` freezes; the player moves the body; swapping back resolves the stale leg | A failed attempt booked for the player's movement | `mission.js:620-656`, `navigation.js:249-271` |
| l † | **Route costs omit travel across a node to its takeoff.** `costsFrom` sums edge costs, which price only the gap and airtime | "Least-time" routes can prefer a distant launch or a detour; `holdPoint` inherits the same costs | `nav.js:173-190`, `nav.js:792-812` |
| m † | **The graph excludes some physically usable space.** 4px headroom margin and `MIN_SEGMENT` 6px drop 46–49px pockets and narrow supports, and S5's fallback suppresses the reflex hop whenever a graph exists | An agent in such a pocket walks but has no route out until it reaches a node | `nav.js:48-49`, `runtime.js:366-368` |
| n † | **Predictor and gameplay collision are different implementations.** `flies()` sweeps in ≤4px samples with its own `actuate`; `collideAxis` tests end-of-frame overlap | They can disagree on thin platforms or fast falls despite comments calling them equivalent. Not measured | `nav.js:622-697`, `entities.js:149-172` |
| h | **Order arrival is 2D, centre-to-centre.** A kneeling companion's centre is 12px lower | Order can never complete by arrival; waits out the timeout | `runtime.js:335` |
| i | **Air control is capped at reload speed**, and `slow` scales displacement; the predictor assumes neither | Latent for reload: `reloadSpeedMult` defaults to 1 (`CLAUDE.md` still says 20%). A `slow` status is live and, like a crouch, turns a temporary condition into bans | `entities.js:286`, `entities.js:111` |

### Policy, not navigation

| Finding | Note |
|---|---|
| Companion `combat` exits on enemy distance only (`sense.dist > 640`), never on distance from the leader † | Can look like broken following while the leader walks away. Whether a companion should break off is Bo's call, not an engineering fix |

### Test coverage gaps

| Gap | Consequence |
|---|---|
| The Behavior Lab drives a continuous point-target controller, not the escort `moveTo`/`wait` loop † | Lab success does not validate companion following; findings 1 and 2a are invisible there |
| Graph reachability comparisons (including this audit's variant table) only see manoeuvres some graph models † | The player's outward-and-return and coyote climbs cannot show up as "lost" pairs |
| No test sustains following distance or detects repeated climb/drop cycles | Fixes should be judged on arrival, sustained gap and cycle count, not only failed-jump rate † |

## 5. Simplifications

| Change | Removes |
|---|---|
| Replace the escort `moveTo`/`wait` track with a continuous follow controller: goal = the leader's own node (`nodeUnder` the leader, or its last grounded node) plus a standoff clamped to that span on a stable formation side, with a distance band for stop/resume, re-resolved every frame. Timed `moveTo` stays for scripted actions † | Findings 1 and 2a, order timeouts, the two arrival radii |
| **One traversal lifecycle** for jumps AND drops: approach → launch/step-off → airborne → landed / failed / interrupted. A failure is booked only after a *confirmed* launch; permanent geometry rejection is kept separate from temporary execution failure (crouch, slow, knockback, interruption, bad approach) † | Findings 4a, 4b, 4d, j, k, and the separate `leg`/`stepOff`/`commit` fields |
| **Explicit navigation results** — moving, arrived, unreachable, temporarily unable, off graph — instead of `null` meaning several things † | The `null` fallbacks, `navGraph`'s "which null is it" test, duplicated arrival checks |
| **One handover function** that every controller change calls (`setMotion`, order end, reposition release, control swap), clearing transient traversal state and keeping learned bans † | `abortRoute`/`release` call-site discipline; findings g, j, k |
| **A progress watchdog** on approach and walk-off: no ground covered toward the current target for N seconds is a failure of that edge | Findings 2b and 2c as a class |
| **Pass world bounds to the graph**; clamp spans and takeoffs to `[0, width - w]` † | Finding 2c |
| Give `applyMovement` an analog `move` for companions so the drive magnitude is honoured | Overshoot, the one-frame takeoff window, most of the soldier-specific actuation in the predictor |
| If clearance stays default-on, delete the non-clearance follower path (`takeoffX`, `clearTakeoffs`, `lipToward` use in the follower, the footprint guard, `navTakeoffWindow`, `nav.clearance`); keep the unfiltered graph for `auditGeometry` | One of two parallel follower paths |
| Delete the `walk` edge kind — merged surfaces make it unreachable (0 walk edges across 300 terrains) | `navigation.js:358-361`, `kindOf` branch |
| Retire legacy `updateCompanion` | A second follow implementation |
| Drop the redundant `maxRise` gate in `linkBetween` | `nav.js:200` |
| One arrival radius for orders and routes | Finding 1's idle frames, finding h |
| Move history out of comments ("since S4", "until C2", measured numbers) into the specs, and correct the stale ones — several still describe the pre-S2 span definition (e.g. `navigation.js:226-231` "a span is where a body fits WHOLLY"), and `tech/agent-navigation.md` ("Approximations", drop budget row) calls the drop budget conservative — "it under-promises how far a fall carries" — when for a walk-off it over-promises on every drop shallower than an airtime's fall (4c) † | Well over half of `nav.js` and `navigation.js` is comment, much of it provenance |

## 6. Would passing run-up (running-only) jumps introduce bugs?

Yes, on its own. The predictor would certify a jump conditional on arrival speed, and the follower guarantees no arrival speed.

| Risk | Why | Severity |
|---|---|---|
| Launching slow | Arrival speed is whatever it is: repath while standing, landing near the lip, escort stops, ducks, shoves. Validation above covered only the running case for these takeoffs | High — today the edge is absent and the route goes elsewhere; after, the agent fails, lands on the source, repaths onto the same edge |
| Failures become bans | Finding 4b | Climb lost anyway, after three visible failures |
| No room to accelerate | 0→320px/s needs ~20px; on a 100px platform the body must walk to the far end and turn. The follower cannot walk past a takeoff and come back (noted unbuilt in S4) | High on exactly the stacks this targets |
| Middle speeds untested | Only 0 and full run are sampled | Medium |
| Three footprint checks must agree | Candidates, band, follower guard. Relax two and not the guard → agent parked at the lip refusing to launch | Certain if done partially |

**What makes it safe:**

1. Takeoffs carry `minSpeed` — the slowest arrival that flies, found by sampling a range.
2. The follower enforces it: approach from at least `minSpeed² / (2·accel)` away; if inside the window below `minSpeed`, turn round and retry rather than launch.
3. A launch below `minSpeed` books no attempt; bans decay. (Falls out of the traversal lifecycle in §5.)
4. All three footprint checks change in one slice.
5. The bar is the failed-leg-rate ceiling in `test/navigation.test.mjs` (a real `Soldier` on every route leg). Frozen reachable-surface numbers will move, by design.

Variant A (side contacts) carries no speed precondition, was validated at both arrival speeds, and stays within today's follower. It is a separate, lower-risk slice and should land first.

## Suggested order

| # | Work | Fixes |
|---|---|---|
| 1 | Continuous follow controller | 1, 2a |
| 2 | Traversal lifecycle with confirmed launches, one handover function, ban decay | 4a, 4b, 4d, g, j, k |
| 3 | Progress watchdog + world bounds in the graph | 2b, 2c |
| 4 | Side contacts in the predictor | 3b |
| 5 | Validated drops: clearance-check the lip, price by walk-off reach | 2b, 4c |
| 6 | Run-up (and coyote) takeoffs with `minSpeed` + follower enforcement | 3 |

Each is a `/spec` before it is built. Judge each against actual arrival, sustained following distance and repeated cycles, not only fewer failed jumps.

## Method

Experiment scripts (not in the repo) drove `updateCompanionSpec` + `stepActor` at 1/60s over hand-built and seeded random terrains (`makeRng`), and `generateLevel` seeds 1–60. Variants A/B were patched copies of `src/game/nav.js`.

The second audit (`companion-navigation-audit.md`, repo root) reproduced the crouch ban and the world-bounds stall itself; its loop and burst repros use this audit's exact coordinates and numbers, so they are not independent confirmation. Its test-runner note (dynamic import fails on Windows paths) does not apply under WSL.
