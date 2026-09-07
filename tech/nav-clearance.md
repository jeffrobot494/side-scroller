---
type: tech
category: artificial-intelligence
status: built
resolution: sharp
needs: [agent-navigation]
tags: [ai, movement, navigation]
---

# Nav clearance

Implements the "Awareness of obstructed paths" addendum in [Agent navigation](../design/agent-navigation.md#addendum-awareness-of-obstructed-paths); the baseline navigation implementation is recorded in [Agent navigation tech](agent-navigation.md).

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| C1 | Share the follower's existing takeoff, landing, airborne aim, takeoff eligibility and horizontal distance clamp as pure manoeuvre calculations. Keep the follower's decisions and requests identical | None. Existing navigation and locomotion fixtures pass unchanged |
| C2 | Validate hop and upward-jump manoeuvres against static terrain, retain their clear takeoffs, and make the follower use a validated takeoff. Enable clearance for runtime graphs, integrate graph identity with route-state validity, and add the editor comparison control and regression cases | Changed. Agents choose clear routes before attempting blocked jumps; no generated geometry changes. This is the first playable slice |

- Land C1 and C2 separately after their regression bars pass. Do not begin C2 with a second copy of the follower's steering rules.
- The spec is a separate commit before either implementation slice. No gameplay implementation belongs in the spec commit.

## Reuses

| Existing capability | Source | Use |
|---|---|---|
| Body-sized standing spans, directed jump envelope checks, edge costs, Dijkstra and partial routes | `src/game/nav.js`, `src/game/gen/reach.js` | Keep node construction and cheap reachability checks; add clearance only after an edge passes them. Keep routing and cost calculation |
| Takeoff selection, landing clamp, airborne steering, takeoff window and distance-limited drive | `src/mission/navigation.js` | Share these calculations with the clearance predictor; preserve their legacy behaviour when clearance is off |
| Body profiles, scene cache, terrain invalidation and per-agent failure ledger | `src/mission/navigation.js` | Build clearance graphs per profile and reuse the three-failure ban and alternate-route behaviour |
| Grounded integration and solid rectangle collision | `src/mission/entities.js` | Match gravity-before-motion and x-before-y collision ordering, strict overlap semantics and downward top landing. Use the actual integrator in comparison tests |
| Legged and soldier movement adapters | `src/mission/locomotion.js` | Keep existing actuation. Test the predictor against both body types; do not migrate companions to another locomotor |
| Repositioning's reachable-standing-point query | `src/mission/navigation.js`, `src/mission/enemyspec/runtime.js` | Let existing consumers query the same filtered graph without adding terrain logic to the brain or changing destination scoring |
| Config schema and graph/path preview | `src/game/config.js`, `src/editor/tools/behavior-lab.js` | Expose clearance through the existing settings and Lab, using the graph the agent actually follows |
| Generation audit and frozen output | `src/game/gen/levelgen.js`, `test/levelgen-golden.test.mjs` | Preserve the audit's envelope-only behaviour and its output |

## Where the code goes

| Existing module | Responsibility in this change |
|---|---|
| `src/game/nav.js` | Pure shared manoeuvre calculations and body-box terrain clearance, including validated takeoff information on accepted runtime edges. No imports from mission code or config |
| `src/mission/navigation.js` | Runtime opt-in to clearance, following the validated manoeuvre, and consistent cache/route/ban validity for every graph consumer |
| `src/mission/enemyspec/runtime.js`, `src/mission/enemyspec/perception.js` | Validate navigation state before movement-order/repositioning decisions or navigation-sense publication can consume it. Keep controller precedence, unrelated senses and ordinary perception cadence |
| `src/game/config.js` | Add `navClearance`, a boolean defaulting on in Agent navigation with server scope. Correct the existing attempt-limit label/help to describe avoiding the failed connection before giving up on the target |
| `src/editor/tools/behavior-lab.js` | Expose the clearance comparison alongside existing Lab controls, reuse schema metadata, and invalidate navigation when it changes |
| `test/nav.test.mjs` | Pure clearance acceptance/rejection cases and the explicit generation/runtime seam |
| `test/navigation.test.mjs` | Real route execution, validated takeoff selection, retained failure recovery, both body types, and graph-change lifecycle |
| `test/behavior-lab.test.mjs`, `test/reposition.test.mjs` | Live comparison/terrain edits and downstream reachable-position queries |

No new subsystem, dependency, test suite or movement ability is needed. If numerical resolution becomes a tuning parameter, expose it through the existing schema; do not hide a new gameplay knob in the predictor.

## The seam

| Owns | Preserves or excludes |
|---|---|
| Whether a runtime hop or upward jump has a clear manoeuvre, and which validated takeoff the follower uses | Standing nodes, walk/drop edges, edge costs and shortest-path algorithm |
| Static solid rectangles from the scene's platform list, including source and destination geometry | Other bodies, moving obstacles, projectiles, decorative art and combat decisions |
| Clearance-aware graphs used by existing grounded navigation callers | Flyers, direct player controls and off-graph fallback behaviour |
| Cache identity and per-agent state validity when clearance, body profile or terrain changes | Per-agent bans remain private and survive ordinary target changes and completed movement orders |
| Runtime filtering explicitly enabled by the mission adapter | Generation stays on the legacy builder behaviour; no change to culling, seeds, geometry or audit verdicts |

### Manoeuvre clearance contract

| Concern | Requirement |
|---|---|
| Candidate choice | For a hop, use the follower's existing directed lip. For an upward jump, consider each standable side that clears the destination footprint, including both sides when available. Do not reject a usable far-side takeoff because the nearer side is roofed |
| Agreement with execution | Store the accepted takeoff choices with the edge. The follower chooses from those choices and holds that choice through approach and flight; it must not recompute an untested side from the entity's current position. No search for arbitrary early or trick jumps |
| Movement being tested | Start from a standable takeoff and apply the shared hop/upward-jump rules through landing. Upward jumps request zero horizontal drive on the takeoff frame; while the feet are below the destination top, steer toward its footprint boundary, then toward the landing span. Do not replace this with a straight line or a stationary ascent |
| Whole-body clearance | Check the body rectangle over each movement step against all relevant solid platforms. Source and destination remain collision participants: neither is ignored wholesale. Prevent thin obstacles being skipped between samples; do not use one broad rectangle enclosing the entire curved jump |
| Landing | A downward top contact that leaves the body on the intended destination span is success. Side/underside collisions, premature contact with another platform, a missed destination or a bounded simulation timeout reject that candidate. Adjacent platform seams must not turn a valid landing into a false obstruction |
| Takeoff tolerance | The execution window must not authorize an untested blocked launch. Align to the validated takeoff under a justified numerical tolerance; verify realistic frame steps and the soldier adapter, which acts on the sign of drive rather than its requested magnitude |
| Generation boundary | Legacy graph construction remains the default for callers that do not explicitly request clearance. The audit supplies only dimensions and an envelope, not the full runtime physics profile; it must never enter the predictor. Keep shared node and envelope logic rather than duplicating the audit |
| Cache lifecycle | Include clearance policy and every predictor input in graph identity. A graph change invalidates saved paths, committed takeoffs, step-off state and learned bans before they are used. Check identity in route following, reachable-position queries and earlier state consumers, not only when the cache builds a replacement. Repositioning reads the blocked verdict before calling the follower, and perception publishes navigation senses before movement. Ensure those consumers cannot act on stale state or previously published navigation senses after a graph change, including frames between ordinary perception updates. Movement-order completion must also read a valid leg. Use a shared validity check rather than separate rules in each caller; preserve unrelated sense cadence and values. Do not count an abandoned airborne leg as a failed jump against the new graph |
| Unreachable destinations | Use existing best-partial routing and its final-position stop. A rejected shortcut must not trigger straight-line steering into the same obstacle when the body is on a valid node |
| Failure recovery | Preserve the configured attempt cap, edge bans and rerouting for actual failed jumps. Static clearance reduces failures; it does not remove the recovery path |

## Must not regress

| Guard | Required evidence |
|---|---|
| `test/nav.test.mjs` | Reject a tall column, a low ceiling and an intervening overhang; accept a hop that clears a low column, unobstructed flat/upward jumps and valid platform-top landings. Demonstrate body-size differences, directional differences, a blocked near takeoff with a clear far takeoff, and thin-obstacle coverage. Walk/drop edges remain unchanged |
| `test/navigation.test.mjs` | With clearance on, the existing PILLAR scene is traversed without first attempting its blocked shortcut; the tall-wall scene stops at the closest point with no doomed takeoff. Keep two-step climbs, clear jumps, overlapping drops, step-off and cut-span cases. Exercise actual soldier movement as well as legged movement |
| `test/navigation.test.mjs` failure cases | Keep the wall, PILLAR, impossible-takeoff, ban-persistence and invalidation tests that intentionally need impossible edges, explicitly with clearance off and config restored afterward. Add clearance-on recovery coverage using an interrupted or otherwise failed valid jump; do not delete the cap tests or disable clearance for the whole suite |
| `test/navigation.test.mjs` cache cases | Toggle on/off/on with a live path and with a committed jump; change body profile and terrain; verify new graph use, no stale manoeuvre, no spurious failure and private ledgers. Ordinary destination changes must still preserve bans |
| `test/reposition.test.mjs` | Preserve the existing ranged and companion outcomes; a candidate reachable only through a rejected jump is not offered. A stale ledger from a different graph cannot remove a valid candidate |
| `test/reposition.test.mjs`, `test/enemyspec-brain.test.mjs` | A graph change clears stale blocked/leg verdicts before commitment or order decisions and before a brain consumes navigation senses, including an update where the ordinary perception timer has not expired. Preserve existing unrelated perception facts and action precedence |
| `test/behavior-lab.test.mjs` | The comparison control works live; graph/path overlays describe current navigation. Dragging a blocking platform rebuilds graph and path without moving the agent artificially |
| `test/levelgen-golden.test.mjs`, `test/gen.test.mjs` | Generated levels and audit reports remain identical under clearance on and off; do not regenerate `test/levelgen.golden.json`. Revise comments claiming runtime and audit edges are always identical to state the explicit runtime-only filtering boundary |
| `test/locomotion-intents.test.mjs`, `test/locomotion-characterization.test.mjs` | Preserve escort, expressive jumps and body actuation. C1 leaves `test/locomotion.golden.json` unchanged. C2 may change routed trajectories only; inspect and explain each changed case before any deliberate fixture update |
| `test/docs.test.mjs` and full suite | Real citations, all seven spec parts and no unrelated regression. Run the full test bar for each slice |

- Compare predicted manoeuvres with actual motion at normal and varied frame steps, including an approaching soldier with residual horizontal velocity. Both a false rejection of a clear route and acceptance of a known blocked route fail the bar.
- All planned production modules are covered by existing test imports. Visual route legibility and the cost of repeated graph rebuilds during Lab dragging still require a served Behavior Lab play check; headless assertions do not prove either.
- On Windows, the current test runner imports absolute drive paths that Node rejects. Run the same discovered suites with file-URL imports in a temporary runner if necessary; do not treat a loader failure as passing tests or include an unrelated runner fix in the feature.

## Approximations

| Limit | Effect and guard |
|---|---|
| Existing takeoff styles, not all physically possible jumps | Tests cover the follower's ordinary lip/side choices. A human's earlier jump or unusual steering may cross terrain the agent declines. This is the design's explicit exclusion of exhaustive human jump search; usable ordinary alternatives must be retained |
| Nominal body profile | The profile describes standing body dimensions and base jump/run physics. Temporary slow, crouch, reload and knockback do not create new graphs. Existing movement interruption and failed-jump recovery remain; this change adds no crouch navigation |
| Soldier actuation differs from instantaneous legged drive | Soldiers accelerate, brake and act on drive direction. A nominal predictor is not proof of the exact soldier trajectory. Keep this limitation visible and require real-soldier acceptance cases; do not claim that every residual-velocity or temporary-status case is predicted. If the known column/ceiling cases fail, fix the prediction or takeoff execution before shipping |
| Numerical stepping | A bounded predictor approximates continuous motion. Swept step checks prevent thin-terrain tunnelling; boundary and varied-frame tests guard against over-pruning and known blocked launches. Numerical tolerance is not permission to ignore solid overlap |
| Existing route costs | Least time still means the current estimated edge seconds, which omit some travel within standing spans. This feature filters manoeuvres without replacing the cost model |
| Walks and drops are unchanged | The addendum specifically adds hop/upward-jump clearance. Existing drop approximation and recovery remain; this spec does not claim to validate all falling trajectories |
| Static terrain only | Dynamic obstacle avoidance is excluded by the design. Clearance operates on solid level rectangles and does not guarantee success after another action or changing motion conditions interrupt a jump |
| Generation retains envelope reachability | A level accepted for player traversal can contain destinations the agent cannot reach with its ordinary manoeuvres. The design excludes changing generated layouts; generation must not silently become an AI-route guarantee |
| Graph-build work | Clearance runs only while building a cached graph, with bounded candidate count and flight duration. Reuse bounds from the body envelope and restrict terrain checks spatially if needed. Measure Lab rebuilds before introducing broader optimisation |

## Design coverage

| Addendum outcome | Delivery |
|---|---|
| Clear route around a column without failed probes | C2 graph filtering plus validated takeoff following |
| Ceiling excludes an otherwise reachable jump | Whole-body flight checks, including source and destination undersides |
| Body-dependent routes | Existing per-body profiles and full collision box |
| Least-time alternative or closest reachable stop | Existing routing over the filtered graph |
| Failure excludes a connection before giving up | Existing per-agent recovery retained and covered with clearance enabled |
| Low column can still be crossed; clear routes and drops remain | Positive clearance fixtures and unchanged walk/drop behaviour |

This revision replaces the earlier clearance proposal in this file. Its scratch pruning counts are not implementation evidence, and its stationary-ascent description is not the current follower's airborne rule. The design addendum is the authority for this work.

## Regressions found in play — 2026-09-07

C1–C2 shipped green and made the game worse. Bo found three faults in the Behavior Lab; screenshots in `screen-shots/`. This section is the evidence, so the rewrite is aimed at causes rather than symptoms. **Every measurement below is 30 generated levels at high difficulty on the soldier profile** (30×46, gravity 2000, jump 700, run 320), unless it says otherwise.

| # | Symptom | Screenshot | Root cause | Introduced by C1/C2? |
|---|---|---|---|---|
| 1 | An agent under a platform will not attempt the climb at all | `no-vertical-path.png` | Perches whose only takeoff is under a neighbouring piece. The graph offered the climb, the body was never able to fly it, and C2 removed the edge rather than the failure | **No — revealed, not caused.** See "What the rejections actually are" |
| 2 | A column and the slab flush against its top are separate surfaces, and the agent jumps between them | `separated-surfaces.png` | One node per PLATFORM, not per walkable surface. Two flush platforms leave a 30px gap in body-left-edge span space, which `kindOf` calls a `hop` | **No — pre-existing since N1** |
| 3 | Approaching a sideways L, the agent jumps once into the overhang, fails, then routes around | `one-incorrect-jump.png` | Ground beneath an overhang is cut from the graph for headroom, so `routeRequest` returns null and the caller falls back to the pre-N3 reflex, which hops at anything 40–60px above it with no terrain knowledge | **No — pre-existing since N3.** C2 makes it fire more often, because routes now go *around* obstacles and spend longer underneath them |

**None of the three is fixed by reverting C1–C2.** #2 and #3 predate this work entirely; #1 goes back to being invisible rather than going away.

### What it cost

| Measure | Legacy graph | As shipped | Change |
|---|---|---|---|
| Reachable standable surface from spawn | 237,180 px | 184,492 px | **−22%** |
| Standable spots above the ground | 813 | 557 | **−256** |
| Up-edges in the graph | 1,333 | 1,005 | −328 |

`test/navigation.test.mjs` and the C2 sweep both stayed green through this, for the reason in "Why the bar missed it" below.

### What the rejections actually are

Of 235 rejected up-edges sampled over 20 levels, replayed from **every** x on the source span at 4px steps rather than only from the takeoffs the follower knows:

| | Count | Reading |
|---|---|---|
| Not flyable from anywhere on the source span | 204 (87%) | The edge was a lie. The graph offered it, no body could ever fly it, and pre-C2 the agent discovered that by failing three times |
| Flyable from some x, but not one the follower is offered | 21 (9%) | A real route, lost. `takeoffCandidates` proposes exactly two positions — the ones flanking the destination footprint — and where those are roofed it gives up, though a takeoff further back is clear. Seed 3: offered 1180, flies from 1124 |
| Flyable from an offered takeoff, still rejected | 10 (4%) | **A defect.** `takeoffBand` requires the nominal takeoff *and* a one-frame-early offset to both fly; an edge that works at its exact x and fails 5.33px short is dropped |

Why the 204 fail, by first contact: 147 rise into an underside, 59 hit a side, 13 land on the destination but off its span, 5 land on another platform first.

**The uncomfortable half of this is a generation finding, not a navigation one.** `auditGeometry` certifies a level traversable using `gapBetween`, which reports 0 for overlapping spans and never charges an up-edge for the body-width takeoff clearance it actually needs — the approximation recorded in `tech/agent-navigation.md` as "An up-edge is not charged for its takeoff clearance". So generated levels contain perches only the player can reach. Pre-C2 that was masked by agents flailing at them; C2 made it visible as an agent standing still. **Whether generated terrain should guarantee agent-reachable perches is Bo's call, not a bug to fix quietly.**

### The surface model is a separate lever

Merging co-planar platforms whose x ranges touch into one surface, as an estimate:

| | Hop edges | Reachable surface |
|---|---|---|
| Legacy | 594 | 237,180 px |
| Merged surfaces + clearance | 11 | 178,632 px |

1,004 flush same-height platform pairs exist across the 30 levels. Merging **fixes #2 outright** — 594 ordered jumps over solid floor become 11 — and **does not recover reachability**. The two problems are independent, and an earlier reading of this that treated the node model as the cause of #1 was wrong.

### Why the bar missed it

The C2 sweep measured failed jumps (207 → 0) and agents making progress (169 → 170). Both improved. Both were blind to this: the sweep sent agents at a target at the far end of a level, where ground travel dominates, so reachability could fall 22% without moving either number.

**The metric that catches it is reachable surface from spawn, before and after** — four lines, and it fails instantly. No suite in the repo asserts that a change to the graph does not shrink where an agent can go; that is the guard the rewrite needs first, not last.

### One thing worth keeping

The predictor itself is not what is wrong. It agrees with the real integrator, its swept sampling catches thin terrain, and 87% of what it rejected was genuinely unflyable. Its two real defects are the tolerance band above and a takeoff vocabulary of two positions — both in the *contract* it was given (see "Candidate choice" and "Takeoff tolerance" in the manoeuvre clearance contract), not in the code that implements it.

## As built

C1 landed as planned: `lipToward`, `landingX`, `footprintClear`, `airborneAimX` and `driveV` moved from `src/mission/navigation.js` into `src/game/nav.js`, the follower's decisions were byte-identical, and no fixture moved. `takeoffCandidates` was added there unused — it is `takeoffX`'s answer with the body's position taken out of it, which is what C2 stores on an edge.

Six things C2 got differently from the plan.

| | As built | Why |
|---|---|---|
| Graph identity needed more than the clearance policy | A built graph carries `key` (`graphKey(profile, opts)` — the profile key plus `+clear`), and route state carries `gen` + `key` + `clearance`. `navState(ent, scene, graph?)` is the one validity check every consumer calls | The plan said "include clearance policy and every predictor input in graph identity", which uncovered a hole that predates this work: `nav.gen` tracked only the TERRAIN. Retune a body and `graphFor` hands the agent a different cached graph whose node ids mean other places, while `navGen` never moves — so a path, a committed takeoff and a ban ledger all carried across silently. The `graph`-less form of the check exists because `runtime.js` and `perception.js` read a verdict without ever building one |
| Navigation senses publish every frame | `publishNav` moved above the 0.2s throttle in `updateSense`; every other sense keeps its cadence | The spec asked that consumers not act on "previously published navigation senses after a graph change, including frames between ordinary perception updates". A stale `navBlocked` otherwise stands for up to `SENSE_INTERVAL`. These are not sensor readings with a fair reaction delay — they are the router's verdict about the frame that is about to run |
| The takeoff tolerance is derived, not a knob, and the band is one-sided | `takeoffTolerance(profile) = runSpeed × 1/60` — one frame of travel. The follower's window becomes `min(navTakeoffWindow, tolerance)` on a validated edge, and the predictor validates the takeoff plus ONE offset, away from the destination | A legged body lands exactly on its target (`driveV` caps at the distance remaining); a SOLDIER body acts on the sign of the request and crosses it, in steps no larger than one frame's travel, so a straddling frame is always inside the tolerance. The band is one-sided because a body walks *toward* its takeoff: the only place it can commit that is not the takeoff is short of it. Testing the far side would reject good edges — on an upward jump the far side is inside the destination's footprint, which the follower's own guard refuses to launch from |
| A spatial pre-filter, taken up front rather than "if needed" | `nearbyPlatforms` clips the platform list to the flight's bounding box before the per-step checks; the body box is still tested against each survivor individually | The Lab rebuilds the whole graph on every pointer move. Measured below |
| The predictor's landing test needed `<=` on its own destination | `nearbyPlatforms` uses `p.y <= bottom` | The destination's surface sits exactly on the bottom of the flight box. With `<` it was filtered out of its own flight check and every clear jump was rejected — a false-rejection bug the positive fixtures caught immediately, which is why they are written first |
| Discretisation is part of the answer, not noise | The predictor steps at 1/60 with the mission's own semi-implicit integration | A charger's continuous apex puts its head at 363.4px and its discrete apex at 369.0px. An overhang between the two is one the body squeaks under in play, and the predictor agrees because it integrates the same way. Fixtures are written against the discrete number |

**Fixtures that moved, and why each one moved.**

| Fixture | Change |
|---|---|
| `test/locomotion.golden.json` | The same 2 of 22 cases as N2/N3 (`roster:husk_charger`, `tpl:tpl_charger`). Frames 16–34 were three doomed jumps at the scene's 200px wall; they are now a body standing still on the ground. Horizontal position moves 11.5px — the arrival radius short of the lip it used to walk to — and nothing else in the fixture moves |
| `test/mission.golden.json` | Regenerated. A duelist and both companions stop jumping at blocked edges and walk instead, and everything downstream of that (projectiles, health, loot) follows. The suite's twice-run self-check still passes, so determinism is unaffected — this golden pins reproducibility, not behaviour |
| `test/levelgen.golden.json` | Untouched, and `test/gen.test.mjs` now asserts why: a level and its audit report are byte-identical with clearance on and off, over four seeds |

**One test changed what it asks rather than what it expects.** `test/navigation.test.mjs`'s "a companion's envelope reaches a 120px ledge" now asks the legacy builder. The claim on trial is that a soldier-locomotor profile produces the player's envelope and not a legged one; that ledge is 2.5px inside a soldier's `maxRise`, and clearance rejects it truthfully (the body is above the surface for six frames and needs seven to cross the footprint). Asking the filtered builder would have made the case about the manoeuvre and not about the profile.

**Measured.** 40 generated levels at high difficulty, long, on the soldier profile: 36.5 nodes and 123.8 edges per level, of which **21.1% of hop and jump edges do not survive the predictor** (123.8 → 97.7). Build cost goes 0.09ms → 0.69ms average, 3.12ms worst — the Lab rebuilds on every pointer move, so the worst case is a fifth of a frame and no further optimisation is warranted.

60 generated levels, 174 grounded agents, 20 seconds each, chasing a target at the far end of the level:

| | Clearance off | Clearance on |
|---|---|---|
| Failed jumps (pending attempts + bans) | 207 | **0** |
| Agents left blocked | 0 | 0 |
| Agents that made progress | 169 | **170** |
| Frames spent airborne | 24,811 | 19,098 |

Not one agent had to fail at a jump to learn what the terrain was. The extra agent making progress is the check against over-pruning: nothing was filtered into paralysis.

**Still an eyeball check.** Whether a route around a column *reads* as deliberate, and whether the Lab's clearance toggle is legible as a comparison, are not assertable headlessly. Serve `editor.html`, open the Behavior Lab, turn on Graph, and flip the toggle.
