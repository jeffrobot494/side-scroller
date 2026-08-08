---
type: tech
category: artificial-intelligence
status: unbuilt
resolution: sharp
needs: []
tags: [ai, movement, navigation]
---

# Agent navigation

How the baseline agent gets somewhere. What it does: `design/agent-navigation.md`.
Everything beyond a given destination: `idea/advanced-agent-navigation.md`.

`needs: []` — every piece this builds on already exists in the repo.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| N0 | **Freeze generation.** Capture `generateLevel({seed}).level` for a spread of seeds into a golden fixture, before touching anything | None. Pure test addition |
| N1 | **The graph.** `src/game/nav.js` — nodes per body profile, directed edge kinds with second-costs, least-time routes, its own fixture. Then refactor `auditGeometry` onto it | **Unchanged, and now provable** — N0's fixture is what proves it |
| N2 | **One jump per body.** `body.jump` on the EnemySpec schema, read by `LEGGED.jump` and the instructed hop; `enemyHopImpulse` and `enemyJumpImpulse` retire into its default of **665**. Coyote time in `stepActor` | **Changed.** Every grounded enemy jumps higher: traversal hop 560→665, and `cowardly_duelist`'s `backHop` 520→665 — the only `{ jump: {} }` in the roster. Regenerate `test/locomotion.golden.json` deliberately. Generated levels do **not** move |
| N3 | **Route following.** Body→envelope mapping **including the soldier-locomotor branch**, graph cache, routing in the `moveOrder` branch and the **point-resolving** controllers (`chase`, `moveTo`), explicit `driveX { hop }` in both locomotors, partial-path fallback, stuck detector, 3-attempt cap, navigation senses | **Changed.** Grounded agents on a resolved destination traverse terrain — companions included, on the player's envelope. `keepDistance` agents and all combat behaviour untouched |

N0 exists because the suite cannot currently detect the refactor changing
generated output: `test/gen.test.mjs` compares two `generateLevel` calls inside
the same run and otherwise asserts only that a level is traversable. A refactor
that culls a different structure produces a different level for the same seed and
passes every existing assertion. Without N0, "behaviour-preserving" is a claim
with nothing behind it.

The Behavior Lab (`design/behavior-lab.md`) is how N3 is evaluated by eye, and is
scheduled alongside it in `sprints/2026-08.md`.

## Reuses

Most of this exists as generation code and needs generalising, not writing.

| What | Where | How it is used |
|---|---|---|
| Standable-segment extraction | `auditGeometry` in `src/game/gen/levelgen.js` | Builds nodes as the design describes — per-platform spans with overhead pieces cut for headroom. This is the node builder, parameterised by body size |
| Jump-link test | the flood-fill in the same function | Decides "can I get from segment A to segment B" from `dh`, `maxRunTo(dh)` and the horizontal gap. This is the edge test, minus direction and cost |
| The reachability envelope | `jumpEnvelope()` in `src/game/gen/reach.js` | `maxRise`, `flatReach`, `maxRunTo(dh)` from a `{gravity, jumpSpeed, runSpeed}` triple |
| Destination plumbing | `motionRequest` in `src/mission/enemyspec/runtime.js` | The `moveOrder` branch and the *point-resolving* controllers (`chase`, `moveTo`) already resolve a world point each frame. Routing replaces the straight line to that point, not the mechanism that produces it. `keepDistance` resolves a band, not a point — out of scope, see "The seam" |
| The actuation seam | `src/mission/locomotion.js` | `driveX { v, hopToward }` on the `LEGGED` and `SOLDIER` bodies. Routes emit requests that already exist |
| Sense publishing | `updateSense()` in `src/mission/enemyspec/perception.js` | Writes `root.sense.*` on a throttled cadence. Navigation senses attach here, not in a new system |
| The evaluation surface | `src/editor/tools/behavior-lab.js` | Rebuilt as Lab v2 against this graph. Its overlays are how N3 is judged by eye |

**The envelope triple does not exist per body today.** Only the player `Soldier`
reads `config.jumpSpeed` / `runSpeed`. A legged spec body currently has two
competing impulses (`config.enemyHopImpulse` 560 for the reflex hop,
`config.enemyJumpImpulse` 520 for the brain's `jump` action — the reflex out-jumps
the decision), a `body.gravity` *multiplier* rather than a gravity value, and a
horizontal speed that comes from the motion controller's own `speed` field.

N2 resolves this by finishing something the runtime already claims: the `jump`
action in `src/mission/enemyspec/runtime.js` is commented "the body decides now",
but no `body.jump` field exists and `LEGGED.jump` falls through to a global. Add
the field, **default 665** (decided 2026-08-07 — see "Reach" below; it is not the
old 560), and the envelope triple becomes **authored** rather than
reverse-engineered from which code path happened to fire. Because node extraction
already depends on body width and height, graphs are per-body regardless — so
per-body jump strength costs no extra graphs.

The default is config-backed, not a literal: `enemyJumpImpulse` and
`enemyHopImpulse` collapse into one `SCHEMA` entry at 665 that `body.jump` falls
back to. Raising it does **not** move generated geometry — `levelgen` builds its
envelope from the player's `gravity`/`jumpSpeed`/`runSpeed` (`levelgen.js:74–79`),
never the enemy's, so N2 leaves the N0 fixture untouched.

### Where a profile's numbers come from

**`body.*` is the source for a legged body and a lie for a soldier body.** A
companion runs `body.locomotor: "soldier"` (`companionspecs.js:28`), and that
locomotor is a translation layer onto the player's own movement code — so the
spec's physical fields never reach it:

| Triple | Legged body | Soldier body (companion) |
|---|---|---|
| `jumpSpeed` | `body.jump` (665) | **`config.jumpSpeed` (720).** `SOLDIER.jump` sets `pendingJump` and discards any `vy`; the impulse is `Soldier.applyMovement` (`entities.js:174`) |
| `gravity` | world × `body.gravity` | **world, unscaled.** `SOLDIER` never calls `stepActor` — the mission does (`mission.js:210`) |
| `runSpeed` | the motion controller's `speed` | **`config.runSpeed` (320)**, reached by accelerating at 2600 px/s², not instantly |

Reading `body.*` for a companion gets it wrong in both directions at once:
`maxRise` 110.6 instead of 129.6 (edges it can make, denied — the escort refuses
climbs and falls behind) and `flatReach` 230px instead of ~211px from a standstill
(gaps it cannot make, believed — the attempt cap burns). So the profile builder
branches on the locomotor, and this costs nothing: a soldier body is 30×46 with the
player's envelope, which is **the profile `auditGeometry` already builds**. The
companion's graph is the audit graph. No extra graph, no extra cache entry.

`levelgen` and the runtime must compute the same thing from the same numbers,
which is why `auditGeometry` is refactored onto the shared builder rather than
left as a second implementation.

## Where the code goes

| Module | Holds |
|---|---|
| `src/game/nav.js` (new) | Graph construction from a platform list + a body profile, and the route query. Pure data in, pure data out — no scene, no entities, no rendering |
| `src/game/gen/levelgen.js` | `auditGeometry` becomes a caller of the shared builder. Its spawn-node lookup and exit test stay here — they are level facts, not graph facts |
| `src/mission/enemyspec/runtime.js` | Graph cache keyed off the scene, and route following inside `motionRequest` |
| `src/mission/enemyspec/perception.js` | The new navigation senses |
| `src/game/enemyspec/schema.js` | The same sense names added to `vocabularyDoc()`, or authored specs cannot reference them |
| `src/game/enemyspec/validate.js` | Rejects `body.jump` (and `body.gravity ≠ 1`) on a `locomotor: "soldier"` body — see below |
| `src/mission/locomotion.js` | An explicit `hop` on `driveX`, handled in **both** `LEGGED` and `SOLDIER` |

**N2 adds a field that does nothing on one of the three bodies, so N2 also makes
that loud.** `body.jump` is honoured by `LEGGED`, ignored by `SOLDIER` (which
discards the impulse), and meaningless on `FLYING`. Setting it on a companion spec
is always a mistake, and today the failure mode is silence — the author gets a
number that reads as authoritative and changes nothing. `validate.js` rejects the
combination outright; the same rule covers `body.gravity ≠ 1`, which a soldier
body also silently ignores.

This is the cheap half of a decision taken on 2026-08-07: **companions keep the
`soldier` locomotor.** They already run the same perception, brain, scoring,
arbitration and MotionRequest vocabulary as enemies — `companionspecs.js` is an
EnemySpec — and the only divergence is the 43-line actuation adapter
(`locomotion.js:93–135`). It exists because a companion's body is a `Soldier`: a
persistent roster character with a weapon, magazines, manual aim, a crouch hitbox,
a kill record, carried wounds, permadeath, and a control-swap that hands *the same
object* to player input (`mission.js:189–207`). Moving companions onto `LEGGED`
would mean rebuilding all of that inside the EnemySpec runtime to save one branch
in the profile builder. Validation, not migration.

Conventions this must follow, from `CLAUDE.md`:

- **No new tunable constants in code.** Arrival radius, repath interval, attempt
  cap → the `SCHEMA` in `src/game/config.js`.
- **`src/game/nav.js` imports nothing from `src/mission/`.** It is generation-side
  and node-testable. Body dimensions arrive as arguments, so this holds without a
  third copy of the hitbox — `levelgen.js` already duplicates `30`/`46` once
  against `entities.js`, and that duplication should collapse into the profile
  rather than grow.
- **Fallback discipline.** Off-graph or unreachable degrades to today's steering
  rather than freezing.

**There is no per-mission hook to hang the graph on.** `runtime.js` exports only
per-entity functions, and `scene.platforms` is assembled at four unrelated sites —
`loadMission` in `src/mission/entities.js`, `src/editor/tools/firing-room.js`,
`src/editor/tools/enemy-designer.js`, and the Behavior Lab. Build lazily on first
use, keyed off the scene object, with an explicit invalidation the Lab can call
when it drags a platform.

## The seam

| Owns | Must not touch |
|---|---|
| Graph construction and route queries | The locomotor's arithmetic — pinned by `test/locomotion.golden.json` |
| How a resolved destination becomes per-frame requests | The `dash > moveOrder > controller` precedence in `motionRequest` |
| The new `sense.*` navigation fields | Existing `sense.*` names, values, or the throttle cadence |
| The explicit `hop` flag on `driveX` | `hopToward`, which stays for bodies with no route |
| Grounded bodies | Flyers. `FLYING` gets no graph and no route |
| Controllers that resolve a point (`chase`, `moveTo`) | `holdRange` — `keepDistance` steering is untouched until destination scoring exists |
| Which numbers a body profile is built from | The locomotors themselves. `SOLDIER` keeps translating onto `Soldier.applyMovement`; companions are not migrated to `LEGGED` |
| `auditGeometry`'s implementation | Its `{ traversable, unreachable, offenders }` return shape, and the **object identity** of `offenders` — `generateLevel` culls via `groups.findIndex(g => g.includes(offenders[0]))` |

**Routing attaches to the controllers, not only to `moveOrder`.** `ent.moveOrder`
is written in exactly one place, the brain's `moveTo` action (`runtime.js:578`),
and of the built-in roster only flyers and the default companion use it. Routing
only `moveOrder` would ship a feature that reaches one agent and leaves the
design's motivating case, the chaser stuck under a ledge, exactly as it is —
`husk_charger` resolves its destination in the `ent.motion` branch.

**But a controller only routes if it resolves a point, and `keepDistance` does
not.** This is a scope line, not an oversight:

| Controller | Resolves | N3 |
|---|---|---|
| `moveTo` (via `moveOrder`), `chase` | One world point | **Routed** |
| `keepDistance` | `holdRange { point, min, max }` — a *band* around the target, where retreating is as valid as closing (`runtime.js:337`) | **Not routed.** Keeps today's steering |
| Flyer kinematics (`hover`, `home`, `orbit`, `static`) | No graph at all | Not routed |

Choosing which node satisfies "220–380px from the player" is **destination
scoring under combat weights**, which `sprints/2026-08.md` cuts to September.
Pulling it into N3 would import the whole of that item through the back door.

The cost is stated plainly: of the three grounded roster enemies, N3 reaches
`husk_charger` and the companions; `lurk_gunner` and `cowardly_duelist` navigate
no better than today. That is the honest scope of this sprint, and the graph they
will eventually query is built and proven by N1 regardless.

Navigation decides **where to step next on the way to a point somebody else
chose**. It does not decide whether to move, whom to shoot, or what to do on
arrival — those stay in `src/mission/enemyspec/brain.js` and the utility scoring.

## Must not regress

| Suite | What it actually guards |
|---|---|
| `test/gen.test.mjs` | Determinism within a run, `report.traversable`, `report.unreachable === 0`. **Not** that generated levels are unchanged — that is N0's job |
| `test/locomotion-characterization.test.mjs` | Whole-`updateSpecEnemy` root trajectories against `test/locomotion.golden.json`, to a 2e-3 tolerance — and `brainState.current`. A routing change that shifts a state transition fails this even with the locomotor untouched. **N2 legitimately changes it** (`backHop` 520→665, traversal hop 560→665) — regenerate once, deliberately, and never as a reflex |
| `test/locomotion-intents.test.mjs` | Dash verticals per body, fire-team routing, and the **companion escort outcome** — 180 frames of `updateCompanionSpec`, asserting the companion advances past +300 and stays within 160 of its leader. The escort loop is pure `moveTo`, so N3 changes its code path directly. This is the assertion most likely to break |
| `test/enemyspec-brain.test.mjs` | Track and utility scoring **and** `sense.*` values — it pins the exact file N3 edits |
| `test/mission-enemyspec.test.mjs` | Mission enemies instantiate and update |
| `test/behavior-lab.test.mjs` | The Lab mounts headlessly and disposes cleanly |

The bar is `node test/run.mjs` green plus a served-page check. Route *legibility*
cannot be verified headlessly and is an eyeball check in the Lab.

## Approximations

| Approximation | Why | What catches the failure |
|---|---|---|
| Takeoff is assumed to be at full horizontal speed | `LEGGED` sets `vx = req.v` instantly, so this holds for spec enemies; the player `Soldier` accelerates at 2600 px/s² toward `config.runSpeed` and under-reaches `flatReach` from a standstill | The 3-attempt cap. `levelgen` already ships this assumption for the soldier, so the graph inherits it rather than introducing it |
| Drop edges are priced as flat hops | The existing link test gives a drop of any depth exactly `flatReach` of horizontal budget and ignores fall time. Conservative for reachability, wrong for cost: a 300px drop carries roughly twice as far and takes materially longer | Nothing in N1. If routes visibly prefer silly drops, fix the cost — it is one term, and the design's one-way rule already isolates it |
| Edges ignore ceilings | `maxRunTo(dh)` tests the landing, not the arc. A platform overhead can clip a jump the graph believes in | The stuck detector, then the attempt cap |
| Nodes are built for a standing body | Crouching drops the hitbox 46→22, changing headroom but not the envelope | None needed. A crouched agent has strictly more clearance, so the graph errs safe |
| Costs are seconds under ideal traversal | No allowance for turning, waiting, or being shot at | Nothing, deliberately. Costs order routes; they are not a schedule |
| The graph is static for a mission | Terrain does not move in a mission today | The explicit invalidation hook. Lab v2's platform dragging is the first caller, and it lands after this |

**Reach — settled 2026-08-07, and the reason `body.jump` defaults to 665.**

At the old 560 a legged enemy's `maxRise` is 78.4px, while `layTerrain` tops its
structures out at `min(maxRise − 20, 122)` = **109.6px** off the player's 720
jump. Every generated perch was outside the reach of every grounded enemy in the
roster: navigation would route them correctly *and they would still never follow
the player onto a ledge*, which is the sprint's own floor ("walks, **climbs**, and
drops"). 665 is the number that closes it.

| At `body.jump` | `maxRise` | Clears a 109.6px perch | Horizontal budget at that height (charger, 210px/s) |
|---|---|---|---|
| 520 (old `jump` action) | 67.6px | No | — |
| 560 (old traversal hop) | 78.4px | No | — |
| **665 (new default)** | **110.6px** | **Yes — by 1.0px** | ~76px |
| 720 (player parity) | 129.6px | Yes, with the player's own 20px apex margin | ~135px |

**The residual risk is the margin, and it is thin by construction.** `layTerrain`
reserves a 20px apex margin for the player deliberately, so a jump is never
frame-perfect. At 665 an enemy clears the *tallest* generated perch by 1px and has
no such margin — the 76px of horizontal budget is workable, but a tall perch is an
exact jump, and anything that shaves the arc (a slow field, a `body.gravity`
multiplier above 1) puts it out of reach again. Two consequences worth watching in
the Lab: tall perches will look like near-misses, and the 3-attempt cap will fire
on them more than on anything else. If that reads badly, 720 is the number that
gives enemies the same margin the level generator already guarantees the player.

**This is a combat-feel change as well as a traversal one.** `cowardly_duelist`'s
`backHop` — the roster's only scored jump — goes 520→665, a 28% higher retreat
hop. Signed off with the merge; flagged here because the fixture regeneration in
N2 will otherwise make it look incidental.

**Jump is a single fixed impulse and stays that way.** No variable height, no
hold-to-jump, no double jump (decided 2026-08-06). This is what makes
`jumpEnvelope` an exact bound rather than a family of arcs, and it is why route
following can treat an edge as a yes/no. Both grounded bodies have full air
control — neither `actuateHorizontal` nor `Soldier.applyMovement` gates the
horizontal on `onGround` — so horizontal error at takeoff is correctable in
flight, which is the only reason drive-to-waypoint-then-hop is viable.
---

*Background — how the subsystem behaves today. Not needed to start
building; the six sections above are.*

## Background: what agents perceive today

| Fact | Source |
|---|---|
| Is a wall between me and my target | Line-of-sight segment test |
| Is there floor under my front foot | A single 8px probe (`groundAhead`) |
| Is my target >40px above or below | Vertical band check |

That is the whole picture. Every behaviour is expressed relative to the target,
so a grounded enemy chasing someone on a ledge walks to the spot underneath and
stays there. Not stuck: doing exactly what it was told.

## The nav graph

| | |
|---|---|
| Nodes | Standable surface segments, not platforms. A crate splits a ground slab into two |
| Edges | Directed moves: jump up, hop across, walk off and fall |
| Cost | Seconds — the design asks for least-time routing |
| Built | Once per mission per **body profile**. Nothing in the terrain moves during a mission |
| Flyers | No graph. They already move in two dimensions |

Edges are directed because dropping off a ledge is one-way — platforms are solid
(`collideAxis` in `src/mission/entities.js` blocks upward passage), so a route
that plans "drop to C, climb back to A" plans a move that does not exist.

**Nodes are body-dependent, not shared.** `auditGeometry` derives a segment as
`[x, x + w − SOLDIER_W]` and cuts spans where clearance is under `SOLDIER_H + 4`.
Both constants are body dimensions, and the roster varies (30×46, 34×46, 26×44,
30×26). A single node set with per-body edges does not work. The graph is keyed by
a **body profile** — `{ w, h, envelope }` — and cached per mission; the roster
collapses to a handful of distinct profiles.

## Route following

| | |
|---|---|
| Input | A destination point |
| Resolve | Nearest node to the point |
| Route | Least-time path through the graph |
| Unreachable | Route to the far end of the best partial path, then stop |
| Output per frame | The existing requests — `driveX` toward the next waypoint, `driveX { hop }` at a takeoff |
| New destination | Recompute immediately |
| Failed jump | Repath from where it landed; after 3 attempts on one edge, treat the destination as unreachable and stop |

Detecting a failed jump is cheap: the agent was traversing A→B and is now grounded
somewhere that is not B.

### Who decides to jump

Three layers, and the jump comes from the middle one.

| Layer | Decides | Knows about jumping |
|---|---|---|
| Brain (`src/mission/enemyspec/brain.js`) | Where to go — chase, keep distance, escort | No |
| Router (`src/game/nav.js` (new), consumed in `motionRequest`) | The route, and that the next edge is a jump edge | Yes — sets `hop: true` at the takeoff node |
| Locomotor (`src/mission/locomotion.js`) | Applies the body's impulse | Obeys only |

A traversal jump is **automatic, and derived from the graph** — not scored, not
authored, not guessed. Today's hop is automatic too; the change is
guessed→derived. `LEGGED.apply` currently hops because the target sits 40px above
with no knowledge of terrain, which is why a chaser under a ledge hops against a
wall forever. After N3 it hops because the route says this edge is a jump and the
agent is at its takeoff.

**The brain's `{ jump: {} }` action is untouched.** It is a different thing:

| | Navigation jump | Expressive jump |
|---|---|---|
| Source | The route | A scored action (`cowardly_duelist`'s `backHop`) |
| Why | The only way to travel this edge | It beat the other actions |
| Alternative | None — not jumping means not arriving | Whatever scored second |

Traversal is not scored because there is nothing to weigh, and because scoring it
would drag terrain reasoning into the EnemySpec authoring surface — an authored or
generated enemy must never have to reason about ledge heights.

The brain still controls **whether to travel**: pick an action other than a
travelling one and no destination resolves, so nothing routes. And a committed
dash already outranks routing via the existing `dash > moveOrder > controller`
precedence, so an action in windup/steps/recovery cannot be interrupted by a
path.

