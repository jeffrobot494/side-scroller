---
type: tech
category: development-tools
status: unbuilt
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
| B1 | **The observatory.** Its own Tools entry: a generated level drawn at 1:1, one soldier-bodied agent standing on a random node, click anywhere to make that point its goal, wheel to pan (**up pans left, down pans right**). It routes there and stops. Reload for a new level. Tuning renders from the config `SCHEMA` | **None in code.** Editor-only. But the tuning knobs are the shipped game's — see the warning below |
| B2 | **Overlays.** Graph and Path toggles, off by default: every node and directed edge of the agent's own profile, and the route it currently holds | **None.** Editor-only, and read-only against state the follower already keeps |
| B3 | **Platform dragging.** Drag any platform in x and y; the graph is invalidated and rebuilt, and the agent's route state is cleared so it repaths from where it stands | **None.** Editor-only |

Each lands alone: B1 is a usable tool on its own, B2 makes what it is doing
legible, B3 makes it interactive. B1 is also the slice that answers whether the
routing built in N3 is any good, which is the reason the Lab is in this sprint.

**Combat has to be removed, not merely omitted.** `loadMission` instantiates every
`level.enemies` placement unconditionally and flattens the parts into
`scene.enemies` (`src/mission/entities.js`), and `generateLevel` always produces
placements — so a scene built the normal way arrives full of live hostiles. The
tool must clear them after building. v1 already does this dance when it swaps in a
single-spec red team.

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
| Tool shell and discipline | `src/editor/tools/behavior-lab.js` | v1's canvas host, rAF loop, dispose pattern, and its pointer→world conversion, which corrects for the canvas being CSS-scaled |
| Schema-driven controls | `src/editor/controls.js`, `src/game/config.js` | The Tuning panel renders a `SCHEMA` group rather than bespoke sliders. The renderer works a whole group at a time — see Approximations |
| Headless mount test | `test/behavior-lab.test.mjs` | The shape a new tool's test copies |

## Where the code goes

| Module | Holds |
|---|---|
| `src/editor/tools/` — one new tool module | The whole tool: shell, canvas, camera, click and wheel input, overlays, dragging |
| `src/editor/editor.js` | One `TOOLS` entry, its id in `MOUNTABLE`, and one `factory` entry — the standard three-point registration |

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
| Its own tool module and its registration | `src/editor/tools/behavior-lab.js`. v1 keeps its slot; retiring it is a separate decision, not a side effect of this |
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
| `test/behavior-lab.test.mjs` | v1 still mounts headlessly and disposes cleanly. Every slice here leaves it untouched, so a failure means the shared editor plumbing moved |
| `test/navigation.test.mjs` | The follower the tool exists to watch — profiles, the graph cache, takeoffs, the partial-path fallback and the attempt cap. **Note what it does not cover:** every route-following case there drives a *legged* body. Only `profileFor`'s numbers are asserted for a soldier body, so the Lab is the first end-to-end consumer of router + `SOLDIER`, and is as likely to find bugs there as to display them |
| `test/nav.test.mjs` | The graph the overlay draws, including the reject boundaries a dragged platform will start hitting |
| `test/levelgen-golden.test.mjs` | Generated levels are unchanged. Dragging edits a loaded scene and must never reach generation |
| `test/tools.test.mjs` | The other editor tools still mount |

The bar is `node test/run.mjs` green plus a served-page check on `editor.html`.
The new tool needs its own headless mount/dispose test in the same shape as v1's.
**Everything the Lab is for — whether a route reads as deliberate, whether a
takeoff looks intentional, whether giving up looks like giving up — is an eyeball
check and cannot be asserted here.** That is not a gap in the testing; it is the
reason the tool is being built.

## Approximations

| Approximation | Why | What catches the failure |
|---|---|---|
| Dragging voids the generator's traversability guarantee | The design says so outright — a platform can be dragged out of reach | Nothing new. An unreachable goal is already shipped behaviour: the best partial path, then the attempt cap. The design asks for exactly that, so the tool inherits it rather than special-casing |
| A drag rebuilds the graph but does not re-place the agent | The agent can be left standing on a platform that moved out from under it, or inside one | The router already hands back to straight-line steering when it cannot find the node under a body, so the failure is visible and recoverable rather than a freeze |
| The Graph overlay draws one profile | Graphs are per body profile, and the Lab has one agent | None needed. With a single agent there is no second graph to be wrong about — but the overlay is the agent's graph, not "the level's", and mislabelling it would be the bug |
| The level's generation `report` goes stale after a drag | `auditGeometry` ran once, at generation | Nothing. The report is not displayed; the graph is, and that is rebuilt on every drag |
| The route is recomputed on the shipped repath cadence, not every frame | `config.navRepathInterval` governs it, and matching mission behaviour is the point | The Path overlay draws the route actually held, so a stale path is visible rather than hidden. A tool that repathed faster than the game would lie about the game |
| Panning is horizontal only | The world is 540 tall and the canvas will be too | None needed while `WORLD_H` is 540. A taller world would silently clip, so the canvas height and the world height should not drift apart |
| The Tuning panel shows six knobs, not the design's two | The schema renderer works a group at a time, and `runSpeed`/`jumpSpeed` sit in "Movement / feel" alongside `gravity`, `enemyJump`, `coyoteTime` and `companionBrain`. Rendering exactly two would mean a synthetic group that exists only for this tool | Nothing, deliberately. The four extras are not noise: `gravity` and `coyoteTime` move the same jump envelope the design's two do, and seeing them beside each other is truer than hiding them |
| The agent takes off below `config.runSpeed` | A `Soldier` accelerates at 2600 px/s² where a legged body assigns velocity instantly, but the graph prices every edge at constant `runSpeed`. From a standstill that is ~20px of missing horizontal budget, ~40px after a reversal — against a 12px default takeoff window | The attempt cap, then giving up. This is inherited, not introduced: `tech/agent-navigation.md` records it under "Takeoff is assumed to be at full horizontal speed". **The Lab is the first place it will be visible**, so jump edges that look legal and are missed from a standing start are an expected sight, not a new bug |

---

*Background — what exists today. Not needed to start building; the six sections
above are.*

## Background: v1, and what changes

`src/editor/tools/behavior-lab.js` is a two-team combat observatory: both teams as
spec agents on a generated level, pause / step-frame / step-decision, LOS and
`sense.*` overlays, and the utility scoreboard. It answers *why did that agent
choose that action*.

The design in `design/behavior-lab.md` asks a different question — *can that agent
get there* — and answers it with one agent, no combat, and two overlays. The two
tools overlap only in that both draw a generated level and both drive real agents.

| | v1 | v2 |
|---|---|---|
| Agents | Both teams, several each | One |
| Question | Why that decision | Can it get there |
| Camera | Fit-to-level, or follow at 1:1 | 1:1, wheel-panned, never follows |
| Level | Fixed once built | Platforms draggable |
| Combat | Full — projectiles, damage, sound | None |

`archive/behavior-lab-v1.md` is the superseded spec for v1 and records what was
deferred out of it: metrics, a scripted ghost player, record/replay + A/B, and
scenario presets. None of those return here.
