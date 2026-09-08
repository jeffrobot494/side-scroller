---
type: tech
category: artificial-intelligence
status: building
resolution: sharp
needs: [agent-navigation]
tags: [ai, movement, navigation]
---

# Nav clearance

Implements the "Awareness of obstructed paths" addendum in [Agent navigation](../design/agent-navigation.md#addendum-awareness-of-obstructed-paths); the baseline is recorded in [Agent navigation tech](agent-navigation.md).

C1–C2 are built and regressed in play. The evidence is in "Regressions found in play" below, and everything here follows from one fact: **`collideAxis` supports a body on any box overlap, while `buildNodes` requires it to fit wholly on the platform.** S0–S4 re-aim the existing work at the physics. They do not revert it.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| S0 | **Measure the model against the integrator.** Two guards: a characterization of the positions `stepActor` actually supports beside the span the graph builds, and reachable standable surface per seed, frozen so a later graph change that shrinks it reddens the bar | None. Pure test addition, and it lands green by *recording* today's gap, not by asserting it away |
| S1 | **Separate a platform's solid extent from a node's standable span.** The footprint and landing tests take the destination's solid x-extent from the platform it belongs to, instead of deriving it from the span | None. The two numbers coincide under today's span formula, so every request and every fixture is unchanged |
| S2 | **A node is a standable surface.** Spans cover every position the physics supports; co-planar platforms whose tops touch become one node carrying all of them | **Changed.** A column and the slab flush against it stop being two places with a gap between them, so agents walk the join instead of jumping it |
| S3 | **Clearance measured against the physics.** Landing acceptance, the takeoff set and the in-flight aim move onto supported positions; the follower commits to a takeoff from the set the predictor validated | **Changed.** Climbs a body can make stop being refused. The slice that fixes the reported "won't climb" |
| S4 | **The predictor flies the launch the body performs.** Its arcs start at the horizontal velocity a body will actually carry into the jump, across the range a follower can arrive with — not from a standstill | **Changed.** Jumps clearance accepted stop failing in the air. Running jumps are kept, which is the decision this slice implements |
| S5 | **Off the graph, never hop blind.** A body that has a graph but no route under it walks; it does not jump at terrain it cannot see | **Changed.** A small residue — 8 of the 52 failed jumps measured, against S4's 44 |

- **S4 exists because a soldier does not stop to jump.** Measured over 60 levels and 310 jumps: 44 failed on an edge clearance had accepted, launching an average of 2.7px from the validated takeoff — inside tolerance — while running at an average of 309px/s. The predictor simulated the same jump from a standstill. The position was right and the velocity was wrong, and a running jump drifts sideways during the rise into terrain a standing one clears. **Running jumps are kept** (decided 2026-09-07), so the predictor moves to the executor, never the reverse.
- **S1 exists because S2 is unsafe without it.** `footprintClear`, `clearTakeoffs`, `takeoffCandidates`, `airborneAimX` and the landing test all read `to.a`/`to.b` as a stand-in for the destination platform's solid edges. That stand-in is only correct while a span is `[p.x, p.x + p.w - w]`. Widening the span first moves every footprint by a body width and **refuses more climbs than it fixes** — measured on ground+perch, the up-edge that today offers takeoffs `[670, 1000]` becomes null.
- **As built, S1 — "the two numbers coincide" was not quite true, and it did not matter.** They coincide only on an UNCUT span: a headroom cut moves `b` without moving the platform, so on the 23% of generated nodes that carry one (496 of 2180 over 60 levels) the old arithmetic put the destination's right-hand footprint edge *inside* the platform, and offered a takeoff from which a body rises into the underside. The built graph is byte-identical either way over those same 60 levels, clearance on and off, because the predictor rejected that takeoff on the arc — so this corrects the UNFILTERED follower, where `takeoffX` had no predictor behind it, and changes nothing that was already filtered. The landing test needed no change: `landsOn` already reads `to.plat` by identity rather than deriving a platform from a span.
- **As built, S2 — the merge rule is physical, not "tops touch".** Two co-planar platforms are one surface when a body can be supported continuously across them, which is `gap < body width`, not `gap === 0`: a 30px body bridges a 10px gap without ever losing the ground, and at exactly 30 there is one position — the far edge of the left platform — that nothing holds up. The span rule forces this; "tops touch" was the example, not the limit.
- **As built, S2 — a span endpoint is not a place a body can be SENT.** It is a place a body can BE, which is the design's decision and is kept. But it is a target a fraction of a pixel wide, `driveV` halts below one frame's travel, and a soldier reads the sign of a request and crosses its target — so aiming at one either never moves the body or walks it off the ledge. Two callers were aiming there: the airborne landing aim, which held beside a perch and fell past it, and the in-node destination, where an agent that had arrived walked off, fell, rerouted and climbed back, forever. `settleX` answers "where does a body come to REST on this surface" — the nearest position that puts the whole body on it, the middle of what there is when the surface is narrower than the body — and on anything at least a body wide it is exactly where the aim pointed before spans widened. **This is part of S3's "the in-flight aim moves onto supported positions", pulled forward, because S2 does not stand up without it.**
- **As built, S2 — `node.plat` became `node.plats`.** A surface is a list of platforms, and every reader takes the list: `solidLeft`/`solidRight` are its min and max, the predictor's landing test asks whether the body touched ANY of them, and the audit's reached-set is a flatMap. The audit verdict is unchanged on all 19 golden cases and `test/levelgen.golden.json` did not move.
- **As built, S2 — `MIN_SEGMENT` only bites on slivers now.** A platform narrower than the body is standable (a body with one foot on a 34px ledge is on it), so nothing whole is rejected any more; only a stretch left between two headroom cuts can be. Three fixtures used a 34px slab as "a roof nothing can stand on" and had to be rebuilt, which is worth knowing before writing another one.
- **As built, S2 — a span reaches a body width past each END of the level.** The ground slab spans the world, so its supported extent runs from `-w` to `width`, and `stepActor` clamps a body to `[0, width - w]`. `settleX` keeps every drive target inside without being asked, because the ground's solid extent IS the world's; what was exposed was the Behavior Lab, which samples a raw span to place its agent and put it off-world and off-camera. Clamped there. Recorded in Approximations rather than given to the graph, which is terrain-only and has no world.
- **S0 is not optional and it is first.** C1–C2 shipped green on metrics that could not see the regression they caused, and every follow-up measurement was taken through the graph's own model.
- Land each slice after its own bar. The spec commits on its own, before any implementation commit.
- **C1's shared manoeuvre calculations and C2's predictor both stay.** The swept sampling, the integration order and the top-contact landing rule are correct and measured; the positions they start and end at are not.

## Reuses

| Existing capability | Source | Use |
|---|---|---|
| The authority on where a body is supported | `src/mission/entities.js` | `overlaps`, `collideAxis` and `stepActor` decide what standing means. S0's guard and S3's predictor measure against them, never against the graph |
| Node construction, directed edges, second-costs, Dijkstra, partial routes, `nodeUnder` | `src/game/nav.js` | Kept. Only span arithmetic, the grouping of platforms into surfaces, and which positions the predictor uses change |
| C1's shared manoeuvre calculations | `src/game/nav.js` | The lip, landing clamp, footprint test, airborne aim and drive clamp keep the follower and the predictor on one set of rules. Extend them; never fork a second copy |
| C2's arc predictor | `src/game/nav.js` | Per-frame swept sampling, x-before-y ordering and the downward-top-contact rule are kept exactly. Its landing *acceptance* is not — that is a span test and S3 moves it |
| Route following, the scene graph cache, the per-agent ban ledger, route-state validity | `src/mission/navigation.js` | `navState` is already the one validity check every consumer calls. A wider span changes what a node is, not when state goes stale |
| Legged and soldier actuation | `src/mission/locomotion.js` | The adapters keep their arithmetic — including the soldier's acceleration and its sign-of-drive reading, which is the behaviour S4 makes the predictor match rather than change. S5 touches only whether a *routed* body's fallback may carry a jump |
| The band resolver for `keepDistance` | `src/mission/navigation.js` | `holdPoint` needs no terrain logic of its own. `standPoint` clips candidates to the span and simply inherits the wider one, which is the intended outcome — an agent may hold a firing position on a ledge edge |
| The generation audit and its frozen output | `src/game/gen/levelgen.js`, `test/levelgen-golden.test.mjs` | `auditGeometry` keeps the legacy edge set and its verdict, **provided a merged node carries every platform it covers** — see "Where the code goes" |
| Schema-driven knobs and the live comparison surface | `src/game/config.js`, `src/editor/tools/behavior-lab.js` | `navClearance` and the Lab's toggle exist and work; no new knob is required |
| Shared graph and path overlays | `src/mission/render.js` | Both drawers read only `n.a`/`n.b`/`n.y`, so they follow the model with no edit |

## Where the code goes

| Existing module | Responsibility in this change |
|---|---|
| `src/game/nav.js` | A platform's solid extent as a first-class input to the footprint and landing tests; surfaces built from touching co-planar platforms; the supported-extent span rule; the predictor's takeoff, aim and landing positions. Still imports nothing from `src/mission/` |
| `src/mission/navigation.js` | The follower's committed takeoff drawn from the set the predictor validated; drop and walk lip arithmetic re-derived against wider spans; the launch velocity a takeoff is committed at, which S4 must be able to state in the same terms the predictor tests |
| `src/mission/enemyspec/runtime.js` | The `chase` fallback must not carry `hopToward` for a body that has a graph |
| `src/mission/locomotion.js` | **S5 lands here too.** The `moveTo` and `moveOrder` fallbacks are `steer`, and a soldier body's blind hop comes from the locomotor's own steer branch, not from the request. The Behavior Lab agent and every escorted squadmate arrive through exactly that path |
| `src/game/gen/levelgen.js` | The audit's verdict and its `{ traversable, unreachable, offenders }` shape are unchanged. Its three reads of a node's platform must become reads of the platform *set* a merged node covers, or culls rise and every golden case moves |
| `src/game/config.js` | No new knob is expected. If the launch-velocity range needs a bound, it is a `SCHEMA` entry, not a constant in the predictor |
| `test/nav.test.mjs` | The span-versus-integrator characterization, surfaces from touching platforms, clearance accept/reject stated in supported positions. Its five existing assertions on a node's single platform are part of the change |
| `test/navigation.test.mjs` | The reachable-surface guard, real execution on both body types, recovery with clearance on |
| `test/reposition.test.mjs`, `test/behavior-lab.test.mjs`, `test/companion-aim.test.mjs` | Standing-point queries, the live comparison, and the companion cover case that a span change breaks |
| `test/levelgen-golden.test.mjs`, `test/gen.test.mjs` | Generated levels and audit reports identical; do not regenerate `test/levelgen.golden.json` |

No new module, dependency, test suite or movement ability. A second definition of "where a body can stand" anywhere in the repo is the failure this spec removes, not one to add.

## The seam

| Owns | Preserves or excludes |
|---|---|
| Where a body can be supported, and which manoeuvres it can fly | Edge kinds, edge costs, Dijkstra, partial routing and the arrival rule |
| Grouping touching co-planar platforms into one walkable surface | Platform data. Nothing mutates a scene's platforms |
| The takeoff a follower commits to, drawn from the set the predictor accepted | Both locomotors' actuation arithmetic |
| Clearance-aware graphs for grounded navigation | Flyers and direct player control |
| Whether a *routed* body may jump with no route in hand | The reflex itself, which stays for bodies that have no graph at all |
| Runtime filtering, enabled only by the mission adapter | Generation. The audit calls the builder with no options and its verdict does not move |

### What "standable" has to mean

Two questions the model has collapsed into one number. Separating them is the substance of S1–S3:

| Question | Answer it needs | Read by |
|---|---|---|
| Where is this platform solid? | Its own `x` and `w`. Independent of any body | The footprint tests, and the landing test's "did I land on the right thing" |
| Can a body be supported here? | Any overlap, because that is what `collideAxis` does | Takeoffs, landings, whether a route connects, where a follower settles, and what `standPoint` offers |

**There is exactly one notion of standable, and it is the physical one** (decided 2026-09-07). An agent may stand anywhere a body can be supported, including with one foot on a ledge. No settle margin, no second narrower span, and `standPoint` is free to offer an edge position.

**The supported extent is an open interval.** `overlaps` is strict, so a body whose right edge is exactly the platform's left edge is not supported. A span that includes its own endpoints hands the predictor a takeoff the physics does not hold up.

## Must not regress

| Guard | Required evidence |
|---|---|
| `test/nav.test.mjs` | The positions `stepActor` supports, measured by dropping a real body, characterized beside the span the graph builds — the guard that would have caught C2. Touching co-planar platforms yield ONE node, so the join is ordinary walking and produces no edge at all. Clearance still rejects a tall column, a low ceiling and an intervening overhang, and still accepts a low column, unobstructed hops and jumps, both takeoff sides, body-size differences and thin obstacles |
| `test/navigation.test.mjs` | Reachable standable surface from spawn does not fall across any slice, over a spread of generated seeds. The PILLAR scene is traversed without attempting its blocked shortcut; the tall-wall scene stops at the closest point. Two-step climbs, clear jumps, overlapping drops, step-off and cut-span cases survive wider spans. Real soldier movement as well as legged |
| `test/navigation.test.mjs` failure cases | The wall, PILLAR, impossible-takeoff, ban-persistence and invalidation cases keep working with clearance explicitly off and config restored. Recovery with clearance ON stays covered by an interrupted valid jump |
| `test/navigation.test.mjs` launch cases | A real `Soldier` arriving at a validated takeoff **at full run speed** completes the climb, on the geometry that fails today. Both body types, and frame steps other than 1/60. A jump clearance accepted and the body then failed is the defect this slice exists to remove, so the measurement is jumps-attempted versus jumps-arrived, not a single scripted case |
| `test/navigation.test.mjs` cache cases | Graph identity still covers policy, body profile and terrain; no stale manoeuvre, no spurious failure, private ledgers |
| `test/reposition.test.mjs` | Existing ranged and companion outcomes hold. A candidate reachable only through a rejected jump is not offered; a stale ledger cannot remove a valid one |
| `test/companion-aim.test.mjs` | The cover case — a companion that climbs a 200×80 block and gets shots off — survives the span change. Verified to break under a naive widening |
| `test/enemyspec-brain.test.mjs` | Navigation senses stay ahead of the perception cadence; unrelated senses keep their values and their timing |
| `test/behavior-lab.test.mjs` | The clearance comparison works live, overlays describe current navigation, dragging rebuilds graph and path without moving the agent |
| `test/levelgen-golden.test.mjs`, `test/gen.test.mjs` | Byte-identical levels and audit reports with clearance on and off, and across S2. Measured before writing this: the audit verdict is identical on all 19 golden cases **when a merged node carries every platform it covers**; with a merged node naively keeping one, culls rise and all 19 move |
| `test/locomotion-intents.test.mjs`, `test/locomotion-characterization.test.mjs` | Escort, expressive jumps and body actuation preserved. S0 and S1 leave `test/locomotion.golden.json` alone. Later slices may move routed trajectories only, and each changed case is inspected and explained before any fixture is regenerated |
| `test/mission-golden.test.mjs` | Determinism holds. The trace may move where routing legitimately changes; the twice-run self-check is what proves the change is not a new unseeded draw |
| `test/docs.test.mjs` and the full suite | Real citations, seven parts, no unrelated regression. `node test/run.mjs` green per slice |

- **Every claim about what a body can do is measured against the integrator, never against the graph.** A measurement taken through the model cannot detect the model being wrong; that is the whole reason S0 is first.
- Route legibility, whether a widened span makes an agent perch badly, and the cost of Lab rebuilds during a drag all need a served play check. Headless assertions prove none of them.

## Approximations

| Limit | Effect and guard |
|---|---|
| Ordinary takeoff styles, not every physically possible jump | The predictor tests takeoffs a follower will actually use. A human's earlier jump or unusual steering may cross terrain the agent declines. Widening the set costs graph-build time, so it stays bounded, and the reachable-surface guard is what prices the bound |
| The airborne aim, not the graph's budget | `maxRunTo(dh)` prices horizontal travel from the takeoff instant, but the follower pins the body at the destination's footprint edge for the whole rise and only closes on the landing span once the feet clear it. The graph and the executor therefore disagree about the same jump, and the disagreement is in the aim rule, not in the one frame of `vx: 0` at takeoff. S3 narrows it; it does not claim to remove it |
| Nominal body profile | Standing dimensions and base physics. Slow, crouch, reload and knockback create no new graphs. Crouching is not an escape hatch — a kneeling body cannot travel at all |
| The launch velocity is a range, not a number | S4 makes the predictor fly the launch a body performs, but a follower can arrive at a takeoff at any speed up to its run. A takeoff is only kept if it works across that range, so a jump that is legal at one approach speed and not another is refused rather than gambled on. Conservative, and the reachable-surface guard is what prices it |
| Soldier actuation is matched, not modelled exactly | Soldiers accelerate at a fixed rate, brake on friction and read the sign of a drive request. S4 removes the standstill assumption, not every difference: a slow field, a knockback or a reload still change the arc, and nothing static predicts those. Real-soldier acceptance cases at full run speed are required evidence |
| Numerical stepping | Swept sampling prevents thin-terrain tunnelling; it does not make a bounded simulation continuous. The graph's `maxRise` is the continuous 122.5px where a 1/60 integration reaches 116.67px, so edges in that band are offered and flyable by nothing. Clearance removes them at runtime; the audit keeps them deliberately, so generation does not move |
| Off the graph, an agent steers rather than routes | `buildNodes` deletes floor wherever something overhead leaves less than body height + 4px, so floor with 46–49px of clearance is walkable and invisible. A body standing there gets no route and drives straight at its destination. S5 removes the jump and leaves the walk, so "get as close as you can along a **clear route**" is not delivered in that pocket. Measured at 8 of 310 jumps over 60 levels, which is why it is an approximation rather than a slice of its own |
| The graph knows terrain, not the world | A span covers every position the terrain supports, which at the two ends of a level is a body width past the ground slab. `stepActor` clamps a body to the world and no drive target lands out there — `settleX` aims at the solid extent, and the ground's solid extent is the world's — but a caller that samples a raw span directly has to clamp for itself, as the Behavior Lab's spawn now does |
| Existing route costs | Least time is still estimated edge seconds. This filters manoeuvres; it does not replace the cost model |
| Walks and drops are unchanged | The addendum adds hop and upward-jump clearance. Drop approximation and recovery remain, and no falling trajectory is validated |
| Static terrain only | Solid level rectangles. No other body, projectile or moving obstacle, and no guarantee once something interrupts a jump — which is why the attempt cap and the ban ledger stay |
| Generation keeps envelope reachability | A level accepted for the player can still contain a destination an agent's ordinary manoeuvres decline. The design excludes changing generated layouts, and generation must not silently become an AI-route guarantee |

## Design coverage

| Addendum outcome | Delivery |
|---|---|
| Clear route around a column without failed probes | S3's filtering over S2's surfaces, and S4 so an accepted route is not then failed in the air |
| Ceiling excludes an otherwise reachable jump | Whole-body flight checks, source and destination undersides included |
| Body-dependent routes | Per-body profiles and the full collision box |
| Least-time alternative over the graph | Existing routing, unchanged |
| The closest reachable stop | Delivered **on** the graph by existing partial routing. Not delivered off it — see the off-graph row in Approximations |
| Failure excludes a connection before giving up | Existing per-agent recovery, covered with clearance enabled |
| A low column can still be crossed; clear routes and drops remain usable | S0's reachable-surface guard is what holds this, and it is the outcome C2 broke |

## Regressions found in play — 2026-09-07

C1–C2 shipped green and made the game worse. Bo found three faults in the Behavior Lab; screenshots in `screen-shots/`. This section is the evidence, so the rewrite is aimed at causes rather than symptoms.

**Revised 2026-09-07, second pass.** The first version of this section claimed 87% of the rejected climbs were unflyable and that 9 of 40 generated levels could not be completed. Both were wrong, and wrong for one reason given under "How this was measured wrong" below. Nothing in that first version was measured against the game's physics; all of it was measured through the nav graph's own model of where a body can stand.

| # | Symptom | Screenshot | Root cause | Introduced by C1/C2? |
|---|---|---|---|---|
| 1 | An agent under a platform will not attempt the climb at all | `no-vertical-path.png` | The predictor rejects arcs a body can fly, because it takes off from and lands on `nav.js` node spans, which are far narrower than the surface the physics supports | **Yes.** 70% of the rejected climbs are flyable |
| 2 | A column and the slab flush against its top are separate surfaces, and the agent jumps between them | `separated-surfaces.png` | One node per PLATFORM, not per walkable surface. Two flush platforms leave a gap in span space that `kindOf` calls a `hop` | **No — pre-existing since N1** |
| 3 | Approaching a sideways L, the agent jumps once into the overhang, fails, then routes around | `one-incorrect-jump.png` | Ground beneath an overhang is cut from the graph for headroom, so `routeRequest` returns null and the caller falls back to the pre-N3 reflex, which hops at anything 40–60px above it with no terrain knowledge | **No — pre-existing since N3.** C2 makes it fire more often, because routes now go *around* obstacles and spend longer underneath them |

### The root cause of #1 and #2: a node span is not the standable surface

`collideAxis` in `src/mission/entities.js` places a body on top of a platform on **any** box overlap — one pixel of foot is enough, and `onGround` is set. `buildNodes` defines a span as `[p.x, p.x + p.w - bodyW]`: where the body fits **wholly** on the platform. The two do not agree, and the gap is a body width at each end.

Measured against the real integrator — drop a `Soldier` at each x and see where it rests — on a 100px perch with a 30px body:

| | Standing positions |
|---|---|
| `buildNodes` span | 500..570 (70px) |
| What `stepActor` actually supports | 471..599 (128px) |
| | **the graph models 55% of it** |

The shortfall is a body width at each end, so it is worst on small platforms and negligible on the ground slab — 55% is this perch, not a constant. Perches are where climbing happens, which is why it matters.

Everything downstream inherits it. The predictor starts its arcs from span positions, aims at span positions, and accepts a landing only inside a span, so it rejects real jumps at both ends. Before C2 the graph was merely *narrow*; C2 turned narrow into a hard filter.

The same fact produces #2 directly: a 110px column yields the span `[x, x+80]` and a slab butted against it at `x+110` yields `[x+110, …]`, so `gapBetween` reports 30px of "gap" across what is one continuous floor, and `kindOf` calls it a `hop`. Across 30 generated levels there are **81 touching co-planar platform pairs** and **586 hop edges**; under a surface node model the touching pairs stop being two nodes at all, and hop edges fall to **426**.

**Two numbers in the first version of this section were wrong and are corrected above.** It claimed 1,004 touching pairs, from a count that paired NODES and never excluded two nodes of the same platform — the ground slab is cut into many, so it was mostly counting ground-segment pairs against each other. And it claimed merging took hop edges to 11, which came from merging platform *rectangles* and rebuilding the graph on them: that changes the collision geometry, not just the node model, and deleted edges for a reason that has nothing to do with merging surfaces. Found by the review subagent, not by me.

### What the rejections actually are

Replaying every up-edge that clearance removed, from every position the **physics** supports on the source platform, at five launch velocities:

| | Share of 235 rejected up-edges |
|---|---|
| Flyable — the rejection is wrong | **164 (70%)** |
| Not flyable from anywhere — the rejection is right | 71 (30%) |

The three known contributors to the 70%, in the order they are worth fixing:

| Contributor | Note |
|---|---|
| Landing is only accepted inside the destination's node span | The largest one. A body that lands with 20px of foot on a ledge is standing on it; the predictor calls that a miss |
| Takeoff is only attempted from two positions — the ones flanking the destination footprint | A body has the whole platform, including the ~30px at each end the span does not model |
| An upward jump takes off at `vx: 0` | `linkBetween`'s budget is `maxRunTo(dh)`, which already *assumes* the running start the executor throws away. The graph and the follower disagree about the same jump |

One mismatch that costs everybody, independent of the above: the graph's `maxRise` is the **continuous** 122.5px, while a 1/60 semi-implicit integration reaches **116.67px**. Every edge in that 5.8px band is offered and flyable by nothing.

### What it cost

| Measure | Legacy graph | As shipped | Change |
|---|---|---|---|
| Reachable node span from spawn | 237,180 px | 184,492 px | **−22%** |
| Standable spots above the ground | 813 | 557 | **−256** |

Both sides of that comparison use the same node model, so the delta is a fair measure of what clearance removed — but both understate the real surface by about 45%, so neither number is an absolute.

**As built, S2 — measured after.** Over the same 12 seeds the reachable-surface guard rises from 82,357px to 103,937px (**+26%**), and from 72% to **77%** of the unfiltered graph; seed 99 goes from losing three quarters of the level to losing nothing, and no seed falls. Over 30 generated levels nodes go 1,058 → 977 — exactly the 81 touching co-planar pairs, now one node each — and hop edges 594 → **434**, against the 586 → 426 this spec predicted from the same measurement. `walk` edges were 0 before and after: the fake gap the join produced was always a `hop`. A graph build is unchanged at 0.78ms average and 2.97ms worst with clearance on.

**As built, S0 — the average hides the failures.** The frozen guard measures reachable span from the player's spawn over 12 generated levels (high, long). Clearance holds **72%** of the unfiltered surface across all twelve, close to the −22% above, but the per-seed spread is what the aggregate was concealing: five seeds lose more than 30%, and three lose about three quarters — seed 55 keeps 6 of 41 nodes, seed 22 keeps 11 of 42, seed 99 keeps 9 of 36. Two seeds lose nothing at all. The unfiltered graph reaches every node it builds on all twelve, so the loss is entirely the filter and not the terrain.

### There is no crouch escape hatch

`Soldier.applyMovement` returns early while crouched: `move` only sets facing, and `vx` decays at friction. A kneeling body cannot travel, so crouching cannot reach a space a standing body cannot. Worth stating because the headroom cut in `buildNodes` looks like it might have one.

### How this was measured wrong

The C2 sweep measured failed jumps (207 → 0) and agents making progress (169 → 170). Both improved, and both were blind: the sweep sent agents at a target at the far end of a level, where ground travel dominates, so reachability could fall 22% without moving either number.

The first pass at this section then made a worse error. Every follow-up measurement — "is this edge flyable", "can a player reach this spot", "is this level completable" — used node spans for takeoff positions, for steering targets and for landing acceptance. **A model cannot detect its own definition being wrong.** Compounded over a multi-step route those 45% errors produced "9 of 40 levels unwinnable", which Bo refuted from having played dozens of missions without ever meeting one. The one measurement that found the real defect is the only one taken against `stepActor` directly.

The rule the rewrite needs: **a claim about what a body can do is measured against the integrator, never against the graph.** A guard belongs in `test/nav.test.mjs` pinning node spans against `stepActor`'s actual support, and one in `test/navigation.test.mjs` pinning that a graph change does not shrink reachable surface.


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
