---
type: tech
category: development-tools
status: built
resolution: sharp
sprint: 2026-08
needs: [agent-navigation]
related: [locomotion, level-generation]
---

# Behavior Lab

How the navigation observatory is built. What it should feel like to use:
`design/behavior-lab.md`.

`needs: agent-navigation` — the graph and the route follower are the thing this
watches, and both shipped with `tech/agent-navigation.md` N1–N3.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| B1 ✅ | **The observatory, and the end of v1.** Delete `src/editor/tools/behavior-lab.js` and its test outright, then build v2 in their place: a generated level drawn at 1:1, one soldier-bodied agent standing on a random node, click anywhere to make that point its goal, wheel to pan (**up pans left, down pans right**). It routes there and stops. Reload for a new level. Tuning renders from the config `SCHEMA` | **None in code.** Editor-only. But the tuning knobs are the shipped game's — see the warning below. The Tools tab loses the two-team combat observatory and gains a navigation one |
| B2 ✅ | **Overlays.** Graph and Path toggles, off by default: every node and directed edge of the agent's own profile, and the route it currently holds | **None.** Editor-only, and read-only against state the follower already keeps |
| B3 ✅ | **Platform dragging.** Drag any platform in x and y; the graph is invalidated and rebuilt, and the agent's route state is cleared so it repaths from where it stands | **None.** Editor-only |

Each lands alone: B1 is a usable tool on its own, B2 makes what it is doing
legible, B3 makes it interactive. B1 is also the slice that answers whether the
routing built in N3 is any good, which is the reason the Lab is in this sprint.

**As built (B3) — dragging is what finally exercises giving up.** "Makes it
interactive" undersells it. The generator guarantees traversability, so on a level
it built every node is reachable from every other, and `nearestNode` turns even a
click into empty sky into a reachable surface: B1 and B2 **could not produce an
unreachable goal at all**. "Get as close as you can, then stop" — the partial
path, `sense.routeReachable`, `navBlocked`, the whole give-up branch of N3 — was
written, drawn and never once run end to end in this tool. Dragging a platform out
of reach is the first thing that runs it, and the regression test does exactly
that: platform hauled to (6010, 55), agent walks 3,300px, stops at the closest
reachable node, reports `reachable=false` and `blocked=true`, and still has a
partial route for the Path overlay to draw.

**As built (B3) — the canvas has two gestures now, so a click is a gesture that
did not move.** Press on a platform and move: drag. Press anywhere and release
without moving: set the goal. That keeps a platform clickable as a destination,
which the design's "click anywhere in the level" requires. The 4px threshold is a
pointer epsilon — how far a hand shakes while clicking — and is **not** a config
`SCHEMA` entry, on the same reasoning `src/game/nav.js` gives for its body-fit
constants: it describes the input device, not how the game plays.

**Combat has to be removed, not merely omitted.** `loadMission` instantiates every
`level.enemies` placement unconditionally and flattens the parts into
`scene.enemies` (`src/mission/entities.js`), and `generateLevel` always produces
placements — so a scene built the normal way arrives full of live hostiles. The
tool must clear them after building. v1 already does this dance when it swaps in a
single-spec red team.

**As built (B1):** confirmed and pinned — the generated levels the Lab builds
arrive with up to five live spec agents. `createLabModel` clears `specRoots`,
`enemies`, `projectiles` and `loot` after `loadMission`, and the test asserts all
four are empty *and still empty after five seconds*, since "nothing spawned yet"
and "nothing spawns" are different claims.

**B1's tuning knobs are the real game's.** `runSpeed` and `jumpSpeed` are read
live by `Soldier.applyMovement`, and the schema renderer persists every change to
localStorage through `setConfig`. Unlike v1's `lab*` levers — which are no-ops by
default and asserted as such — moving these changes how the game plays until they
are reset. That is inherent to the design naming them as the tuning surface, and
worth knowing before the first slice ships.

## Reuses

Almost all of this exists. The tool is a window, and writing anything the window
looks at would be the failure mode.

| What | Where | How it is used |
|---|---|---|
| The nav graph | `src/game/nav.js` | Nodes and directed edges are what the Graph overlay draws. `nearestNode` turns a click into the surface the design says it should mean; the node list is what "starting on a random node" picks from |
| The route follower | `src/mission/navigation.js` | The agent moves by the SHIPPED router — profile building, the scene-keyed graph cache, and the per-frame request. `invalidateNavGraphs` drops the cache on a drag; it does **not** repath, so the agent's own route state has to be cleared alongside it (node ids are re-derived and the old path's ids no longer mean the same nodes) |
| Destination → movement | `src/mission/enemyspec/runtime.js` | The `moveTo` controller already resolves a literal `[x, y]` point and hands it to the router. A click sets that point; nothing new plumbs it |
| The soldier locomotor | `src/mission/locomotion.js` | Makes the agent run and jump on `config.runSpeed` / `config.jumpSpeed`, which is exactly what the design's Tuning table names |
| The soldier↔agent bridge | `src/mission/ai.js` | **The pattern the Lab must copy, not call.** `SOLDIER` drives `Soldier.applyMovement` and integrates nothing — the caller steps the Soldier, and mirrors its position back onto the agent each frame, or the router keeps routing from the spawn coordinates while the body walks away. `updateCompanionSpec` is where that mirror exists, but it hardcodes the companion spec, whose only movement targets a leader the Lab does not have |
| A soldier-bodied agent | `src/game/companionspecs.js` | A working EnemySpec on `body.locomotor: "soldier"` — the shape to copy. Note it authors `body.gravity` explicitly, which a grounded agent must, because `moveTo` is in `FLYING_MOTIONS` and would otherwise default the body to a flyer |
| Level + scene construction | `src/game/gen/levelgen.js`, `src/mission/entities.js` | `generateLevel` then `loadMission` gives a real world, real platforms and a real spawn — plus `stepActor`, which the Lab calls itself for its one Soldier |
| Tool shell and discipline | `src/editor/tools/level-generator.js` | The `createX(container, onBack) → { dispose() }` convention from `CLAUDE.md`: one synchronous `draw()` at mount, a cancelled rAF on dispose, `TOOLS`/`MOUNTABLE`/`factory` registration. A canvas tool that is not v1 |
| Schema-driven controls | `src/editor/controls.js`, `src/game/config.js` | The Tuning panel renders a `SCHEMA` group rather than bespoke sliders. The renderer works a whole group at a time — see Approximations |
| Headless mount test | `test/tools.test.mjs` | The shape a new tool's test copies — mount, assert a `dispose()`, dispose without throwing |

## Where the code goes

| Module | Holds |
|---|---|
| `src/editor/tools/` — one new tool module | The whole tool: shell, canvas, camera, click and wheel input, overlays, dragging |
| `src/editor/editor.js` | One `TOOLS` entry, its id in `MOUNTABLE`, and one `factory` entry — the standard three-point registration |

**As built (B1) — one module, but two exports, and the test is why.** The plan
assumed the usual shape: everything inside `createBehaviorLab`'s closure. That
shape can only ever be tested for "mounts without throwing", because
`test/harness.mjs`'s DOM is a deliberate stub — `querySelector` returns a *fresh*
mock element on every call, `addEventListener` is a no-op, and the 2D context
records nothing. There is no way in from outside. So the module now exports the
model as well as the shell:

| Export | |
|---|---|
| `createLabModel(seed, rng)` | Level, scene, agent, and the starting node. No DOM |
| `labStep` · `labGoal` · `labPan` · `labInvalidate` | The verbs. No DOM |
| `labPlatformAt` · `labDragStart` · `labDragMove` · `labDragEnd` | What B3 drags with. No DOM |
| `labGraph` · `labPath` | What the B2 overlays read. No DOM |
| `labDraw(ctx, lab)` | The whole picture, as a function of a context and a model — see the B2 note below |
| `createBehaviorLab(container, onBack)` | The editor tool. Holds one model, hands it to `labDraw`, translates clicks and wheels into the verbs |

Still one module, so "where the code goes" is unchanged. The gain is that
everything worth asserting — that combat is gone, that the agent starts on a real
node under the soldier profile, that a click produces a route the shipped follower
walks, that the camera never follows — is assertable instead of taken on trust.
Later slices should extend the model, not the closure.

**As built (B2) — drawing came out of the closure too.** B1 left `draw()` inside
the shell and said so. B2 moved it: the overlays are **off by default**, so
nothing at mount ever executes `drawGraph` or `drawPath`, and a throw inside
either would have shipped unseen behind a green suite. `labDraw(ctx, lab)` takes
the context and the model, so the test turns both overlays on and executes every
path. The stub context no-ops every call, so this proves the code runs, not what
it looks like — but "it runs" is exactly what was unguarded. It immediately paid
for itself: the only real crash the Path overlay can hit is a held path whose node
ids no longer resolve after `labInvalidate` rebuilt the graph under it, and both
guards against it are now pinned by mutation.

Conventions this must follow, from `CLAUDE.md`:

- **`createX(container, onBack) → { dispose() }`**, one synchronous `draw()` at
  mount, and `dispose()` cancels the rAF loop. The synchronous first draw is what
  makes a headless mount test possible at all.
- **Reuse the `wd-*` / `cfg-*` / `lg-*` / `ed-*` CSS** or add one new prefix.
- **No new tunable constants in code** — anything with a number goes in the
  config `SCHEMA`, which is also where the design's two Tuning knobs already are.
- **Nothing under `src/game/` or `src/mission/` is edited by any slice.** The one
  thing the tool legitimately owns itself is the Soldier-stepping and
  position-mirroring loop, because `src/mission/ai.js` only offers it welded to
  the companion spec. Anything beyond that is the tool growing its own copy of
  something.

**As built (after playtest) — the camera OPENS on the agent.** Bo reported the
agent "spawning all the way to the right". It is not: measured over 300 generated
levels the spawn is uniform (mean 0.49 of level width, flat decile histogram).
The camera was the defect — it started at the level's left edge regardless, and
with a 960px view onto a 4,800–8,200px level **the agent was in shot 12% of the
time**. Panning rightwards to hunt for it is what made a uniform spawn read as
right-biased.

`createLabModel` now clamps the opening `panX` so the agent is centred. This is
**not** following: the camera still never moves on its own after that, which is
the design's actual rule — "never follows" and "always starts at x=0" are
different statements and only the first is in `design/behavior-lab.md`, which is
silent on the opening position. Bo chose this over narrowing the spawn to a
visible node, because that would have traded away "a random node" to fix a
problem the spawn did not cause. Guarded by a 60-level sweep that requires **all**
of them on screen; reverting it puts 52 of 60 off.

**The canvas must be 540px tall and must not be CSS-downscaled.** The design says
vertical panning is not needed because the level fits — true only at the full
world height, and v1's canvas backing store is 420. The `.lg-canvas` rule the
editor already ships is `width: 100%; height: auto`, which stretches a canvas to
its column and breaks 1:1 on screen even when the backing store is right. 1:1 is
the design's whole argument for panning instead of fitting, so the on-screen size
is the thing that has to hold, and pointer coordinates need the backing-store
correction either way.

## The seam

| Owns | Must not touch |
|---|---|
| Its own tool module and its registration | `src/editor/tools/behavior-lab.js`. **v1 is deleted in B1, not kept beside it** — Bo's call, and the reason is that v2 is deliberately smaller. Nothing carries over: not the scoreboard, not step-decision, not the two-team view, not its CSS, not the four `lab*` config knobs |
| Removing v1's four `lab*` knobs from the config `SCHEMA` and from the three runtime files that read them | Everything else those files do. The edit is a multiplier deleted per site, restoring the line to what it said before Slice 1 — not a rewrite of the decision timer, the sense cadence, or aim |
| Where a destination comes from — a click, resolved to a surface | How a destination becomes movement. That is the shipped follower, and substituting anything else would make this a simulator of navigation rather than a window onto it |
| Stepping its one Soldier and mirroring its position onto the agent | The locomotor and the router themselves. The Lab supplies the loop `src/mission/ai.js` supplies for companions; it does not supply a second way to move |
| Drawing the graph and the held route | The graph's contents and the router's decisions. The Lab is read-only against both |
| Platform positions in the loaded scene, while dragging | The generator. A drag edits the scene in memory; it never reaches a seed, a fixture, or `auditGeometry` |
| One agent | Hostiles, projectiles, damage, loot, sound. None are constructed |
| The camera: 1:1, wheel-panned, never following | The mission's own camera. This is a tool with its own rule — never scale to fit, because at a tenth scale the agent is unreadable, which is the whole reason the design specifies panning |

**The agent is a soldier body on purpose, and that decides its envelope.** A
`locomotor: "soldier"` body routes on `config.jumpSpeed` / `config.runSpeed` under
unscaled world gravity, not on `body.jump` — `tech/agent-navigation.md` covers why
under "Where a profile's numbers come from". This is what makes the design's
Tuning table the *actual* two knobs rather than two knobs that look relevant.

## Must not regress

| Suite | What it actually guards |
|---|---|
| `test/behavior-lab.test.mjs` | **Deleted with v1 in B1 and written again from nothing.** It asserted v1's scoreboard and two-team arena, none of which v2 has, so keeping it would be keeping v1. The path is reused so `tech/agent-navigation.md`'s citation stays true; the contents are not |
| `test/tools.test.mjs` | Every other editor tool still mounts. This is the suite that catches shared editor plumbing moving — the job v1's test used to do incidentally |
| `test/reposition.test.mjs` | Ranged repositioning, R1+R2. **One assertion in it is expected to go:** the god-eye block, which pins that `labGodEye` suppresses repositioning. It is deleted with the knob, and `tech/ranged-repositioning.md`'s note about it with them. Nothing else in that suite may move — repositioning does not otherwise read a `lab*` knob |
| `test/enemyspec-brain.test.mjs`, `test/locomotion-characterization.test.mjs` | The decision cadence and whole-trajectory fixtures. Removing a `× 1` multiplier must be arithmetically invisible; a diff in either means a site was changed rather than simplified |
| `test/navigation.test.mjs` | The follower the tool exists to watch — profiles, the graph cache, takeoffs, the partial-path fallback and the attempt cap. **Note what it does not cover:** every route-following case there drives a *legged* body. Only `profileFor`'s numbers are asserted for a soldier body, so the Lab is the first end-to-end consumer of router + `SOLDIER`, and is as likely to find bugs there as to display them |
| | **As built:** it found none. On seed 4242 the agent crosses 2,800px of a 6,220px level and climbs four surfaces (feet 447 → 500 → 470 → 395 → 263) onto the level's highest perch, six route steps down to zero, and stops. R2 had already put a soldier body through the router end to end, so the Lab is no longer the first — but it is the first with a route long enough to be worth watching |
| `test/nav.test.mjs` | The graph the overlay draws, including the reject boundaries a dragged platform will start hitting |
| `test/levelgen-golden.test.mjs` | Generated levels are unchanged. Dragging edits a loaded scene and must never reach generation |

The bar is `node test/run.mjs` green plus a served-page check on `editor.html`.
The new tool needs its own headless mount/dispose test in the same shape as v1's.
**As built (B1):** it got considerably more than that — see the two-exports note
above. Every claim in the new suite was mutation-tested; eight mutations, eight
caught, including the one that matters most, replacing `moveTo` with a controller
that steers in a straight line rather than routing.
**Everything the Lab is for — whether a route reads as deliberate, whether a
takeoff looks intentional, whether giving up looks like giving up — is an eyeball
check and cannot be asserted here.** That is not a gap in the testing; it is the
reason the tool is being built.

## Approximations

| Approximation | Why | What catches the failure |
|---|---|---|
| Dragging voids the generator's traversability guarantee | The design says so outright — a platform can be dragged out of reach | Nothing new. An unreachable goal is already shipped behaviour: the best partial path, then the attempt cap. The design asks for exactly that, so the tool inherits it rather than special-casing |
| A drag rebuilds the graph but does not re-place the agent | The agent can be left standing on a platform that moved out from under it, or inside one | The router already hands back to straight-line steering when it cannot find the node under a body, so the failure is visible and recoverable rather than a freeze. **As built:** kept deliberately — dropping the platform back under the agent fixes it, and moving the agent with the platform would hide the one case worth watching |
| **As built (B3):** the graph rebuilds on every pointer move, not on release | Watching the graph change under a platform as it moves is the reason to be able to move it, and a graph is tens of nodes — the rebuild costs nothing | Nothing needed. If a level ever got big enough for this to matter, it would be visible as drag lag |
| **As built (B3):** a drag also wipes the agent's ban ledger, not just its route | `labInvalidate` clears `agent.nav` outright. A ban records "this body cannot fly that edge", which is a fact about geometry — and the geometry just moved | Nothing. Relearning a still-bad edge costs `config.navJumpAttempts` tries; keeping a stale ban would refuse an edge that dragging just made flyable |
| The Graph overlay draws one profile | Graphs are per body profile, and the Lab has one agent | None needed. With a single agent there is no second graph to be wrong about — but the overlay is the agent's graph, not "the level's", and mislabelling it would be the bug. **As built:** guarded by identity — the test asserts `labGraph()` returns the very object the router is routing on, not an equal one built alongside it |
| **As built (B2):** the overlays draw node spans in CENTRE space, not the router's left-edge space | A span drawn raw sits half a body left of where the agent visibly stands, and the box on screen is drawn from its centre. Three separate router bugs came from confusing these two spaces; an overlay that quietly picked the wrong one would teach the confusion rather than expose it | Nothing automatic. Stated here and in the code, and the legend says the bars are where the body can stand |
| **As built (B2):** an unreachable goal cannot be produced yet, so the partial-path case is undrawn and untested | The generator guarantees traversability, so every node on a level it built is reachable from every other, and `nearestNode` turns even a click into empty sky into a reachable surface | **B3.** Dragging a platform out of reach is the first thing that can make a partial route, which makes B3 the slice that exercises the "get as close as you can" overlay rather than merely the graph rebuild |
| The level's generation `report` goes stale after a drag | `auditGeometry` ran once, at generation | Nothing. The report is not displayed; the graph is, and that is rebuilt on every drag |
| The route is recomputed on the shipped repath cadence, not every frame | `config.navRepathInterval` governs it, and matching mission behaviour is the point | The Path overlay draws the route actually held, so a stale path is visible rather than hidden. A tool that repathed faster than the game would lie about the game |
| Panning is horizontal only | The world is 540 tall and the canvas will be too | None needed while `WORLD_H` is 540. A taller world would silently clip, so the canvas height and the world height should not drift apart |
| The Tuning panel shows six knobs, not the design's two | The schema renderer works a group at a time, and `runSpeed`/`jumpSpeed` sit in "Movement / feel" alongside `gravity`, `enemyJump`, `coyoteTime` and `companionBrain`. Rendering exactly two would mean a synthetic group that exists only for this tool | Nothing, deliberately. The four extras are not noise: `gravity` and `coyoteTime` move the same jump envelope the design's two do, and seeing them beside each other is truer than hiding them |
| The agent takes off below `config.runSpeed` | A `Soldier` accelerates at 2600 px/s² where a legged body assigns velocity instantly, but the graph prices every edge at constant `runSpeed`. From a standstill that is ~20px of missing horizontal budget, ~40px after a reversal — against a 12px default takeoff window | The attempt cap, then giving up. This is inherited, not introduced: `tech/agent-navigation.md` records it under "Takeoff is assumed to be at full horizontal speed". **The Lab is the first place it will be visible**, so jump edges that look legal and are missed from a standing start are an expected sight, not a new bug |

---

*Background — what exists today. Not needed to start building; the six sections
above are.*

## Background: v1, and why it is deleted rather than kept

`src/editor/tools/behavior-lab.js` was a two-team combat observatory: both teams
as spec agents on a generated level, pause / step-frame / step-decision, LOS and
`sense.*` overlays, and the utility scoreboard. It answered *why did that agent
choose that action*.

The design in `design/behavior-lab.md` asks a different question — *can that agent
get there* — and answers it with one agent, no combat, and two overlays.

| | v1 | v2 |
|---|---|---|
| Agents | Both teams, several each | One |
| Question | Why that decision | Can it get there |
| Camera | Fit-to-level, or follow at 1:1 | 1:1, wheel-panned, never follows |
| Level | Fixed once built | Platforms draggable |
| Combat | Full — projectiles, damage, sound | None |

**Both tools were going to keep their slots. Bo's decision is that v1 goes, and
that nothing from it is carried across.** v2 is smaller on purpose, and treating
v1's feature list as a floor is the specific way that intent gets lost. So this
is a deletion, not a migration: no scoreboard, no step-decision, no two-team
arena, no reuse of its CSS block in `src/editor/editor.css`. Anyone reading this
later and reaching for a v1 feature should treat the absence as deliberate.

**The four `lab*` knobs go too.** `labDecisionScale`, `labPerceptionScale`,
`labAimErrorScale` and `labGodEye` look like runtime levers rather than tool UI —
they live in the config `SCHEMA` and are read by `src/mission/enemyspec/brain.js`,
`src/mission/enemyspec/perception.js` and `src/mission/enemyspec/runtime.js`, not
by the tool. That is a distinction without a difference: they were built as part
of Behavior Lab Slice 1 to serve v1's investigation, and being implemented as
runtime hooks instead of buttons does not make them something else. v2 uses none
of them — one agent, no hostiles, and an agent on `moveTo` rather than a utility
brain, so aim error, god eye and decision scale all act on nothing.

`labGodEye` is the only one that looks load-bearing and is not.
`tech/ranged-repositioning.md` records that god eye suppresses repositioning and
`test/reposition.test.mjs` pins it — but that note and that assertion exist only
because the knob does. Both are removed with it.

What is left behind is a plain constant where each multiplier was: `brain.js`
uses `state.decisionInterval` directly, `perception.js` uses `SENSE_INTERVAL`
directly, `runtime.js` uses its own spread values. That is what those lines said
before Slice 1.

`archive/behavior-lab-v1.md` is the superseded spec for v1 and records what was
deferred out of it: metrics, a scripted ghost player, record/replay + A/B, and
scenario presets. None of those return here. The archive is the only place v1
continues to exist.
