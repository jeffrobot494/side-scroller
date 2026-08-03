---
type: tech
category: artificial-intelligence
status: designed
resolution: sharp
sprint: 2026-08
tags: [ai, enemies, companions, movement, navigation]
---

# Agent navigation

How agents get somewhere. Player-facing intent: `design/enemies.md`.

## What agents perceive today

| Fact | Source |
|---|---|
| Is a wall between me and my target | Line-of-sight segment test |
| Is there floor under my front foot | A single 8px probe |
| Is my target >40px above or below | Vertical band check |

That is the whole picture. Every behaviour is expressed relative to the target —
close the distance, hold a range, go where I last saw you — so a grounded enemy
chasing someone on a ledge walks to the spot underneath and stays there. Not
stuck: doing exactly what it was told.

## The five pieces

| # | Piece | What it adds |
|---|---|---|
| 1 | Objective and task | A stable purpose plus a completable unit of work |
| 2 | Nav graph | Facts about where a body can stand and how it moves between |
| 3 | Destination scoring | Opinions about where to be, over the graph's nodes |
| 4 | Line of shot | Split from line of sight |
| 5 | — | The combat brain, deliberately untouched |

## 1. Objective and task

| Field | Changes | Values |
|---|---|---|
| `objective` | Authored at spawn, rarely after | `hunt` · `advance` · `guard` |
| `task` | At runtime, and *completes* | `travel` · `engage` · `search` · `hold` |

Meeting an enemy does **not** change the objective. It suspends the current task,
starts an `engage` task, and resumes when that completes.

The two fields earn their keep at exactly one point — the exit from combat reads
both:

| Objective | `engage` completes → |
|---|---|
| `guard` | Return to post |
| `advance` | Resume the route |
| `hunt` | Search for the next target |

Collapsing to one field means encoding the objective into the task name
(`guard_engaging`, …), multiplying states instead of adding them. At 3 × 4 that
is still hand-authorable, so this is a small structural bet — but the requirement
it protects is not optional: **when a fight ends, the agent must still know what
it was doing before it started.**

Objective is also what distinguishes a companion from an enemy running the
identical brain. It is a spawn parameter, not a state.

## 2. The nav graph — facts about the level

| | |
|---|---|
| Nodes | Standable surfaces, not platforms. A crate splits a ground slab into two |
| Edges | Directed moves: jump up, jump across, walk off and fall |
| Cost | Seconds, so route cost compares against everything else an agent weighs |
| Per body | Nodes come from geometry; edges come from who is asking |
| Built | Once at level load. Nothing in the terrain moves |
| Flyers | No graph. They already move in two dimensions |

Direction matters: dropping off a high ledge is always available, climbing back
may not be. Encoding that lets an agent know it would strand itself *before* it
commits.

### Three uses

| Use | |
|---|---|
| Routing | Next move from here to there. Precomputed, so queries are free |
| Candidate destinations | The node list is a list of *places* — "where should I stand" becomes a scoring problem |
| True distance | Straight-line distance lies constantly in a platformer |

The graph holds facts. It knows nothing about other agents, projectiles, or
danger. Keeping that boundary sharp is what stops it becoming a knot.

## 3. Destination scoring — opinions about where to be

A second scoring pass, over nodes, independent of the action brain.

**They do not compete.** Movement arbitration is already dash > move order >
standing controller. Dashes and move orders are issued *by actions*; the standing
controller is the fallback. Destination scoring replaces that fallback slot.

Merging them into one list would be the regression: an action is short and
committed, a destination is a multi-second pursuit. Score them together and the
agent either commits to a four-second walk it cannot shoot during, or you invent
non-blocking movement actions and lose the commitment that makes fights readable.

### Weights by task

| Term | `travel` | `engage` |
|---|---|---|
| Progress toward objective point | high | low |
| Has shot line to target | — | high |
| Within preferred range | — | high |
| Elevation over target | — | moderate |
| Time to arrive | penalty | penalty |
| Ally already there | small penalty | penalty |
| Dead end (no exit edges) | penalty | penalty |

### Three rules that matter more than the weights

| Rule | Why |
|---|---|
| Score, do not filter | Filtering for "has a shot" piles every enemy onto the same ledge |
| "Nearby" means time, not radius | Across a chasm, nothing better is reachable soon enough — so shoot from here |
| Commit to the destination | Re-scoring every 0.25s makes an agent oscillate between two ledges forever |

Destinations change on the order of seconds; actions on the order of a quarter
second. Shot line is evaluated *from each candidate node*, runs last, and only on
candidates that survived the cheap filters.

## 4. Line of shot ≠ line of sight

| | |
|---|---|
| Sight | A clear line from my eyes to yours |
| Shot | From a muzzle at an offset, possibly arcing, with no ally in the corridor |

Cheap to split, and friendly fire is a supported config — conflate them and
enemies shoot their own front rank in the back.

## 5. What does not change

The combat brain is the good part: scored actions with gates, cooldowns, windup,
execute, recovery, no mid-commitment cancelling. None of it is touched.

A useful consequence — the action layer already runs independently of movement,
so an agent fires while travelling with no special case. A task switch governs
only where it wants to *stand*. Meeting an enemy mid-route changes the
destination only when standing somewhere better outscores continuing.

## The layer stack

| Layer | Changes | Example |
|---|---|---|
| Objective | Authored, ~never | `advance` |
| Task | On events, completes | `travel` → `engage` → `travel` |
| Destination | On arrival or material change | That ledge with a shot line |
| Route | When the destination changes | Walk, jump, walk |
| Step | Per frame | Drive left, jump now |

Each layer changes roughly ten times less often than the one below — which is
what makes it cheap to run and easy to inspect.

## Worked example

An `advance` trooper travelling toward the far end. A soldier appears on a ledge
above and ahead.

| Step | |
|---|---|
| 1 | Perception sees a hostile on the next sense tick (0.2s — natural reaction delay) |
| 2 | `travel` suspends, `engage` starts. Objective is still `advance` |
| 3 | Destination weights switch to `engage`. Candidates = nodes reachable in a few seconds |
| 4 | The ledge scores poorly (too close, no elevation); a crate top with a shot line scores well |
| 5 | Route is walk, then jump. It fires en route — travelling does not suppress combat |
| 6 | Soldier dies. `engage` completes, `travel` resumes with its old destination |
| — | Had the objective been `guard`, step 6 routes back to the post instead |

## Slices

| # | Slice | |
|---|---|---|
| N1 | The graph | Nodes, four edge kinds, per-body envelopes, precomputed routes, golden fixture. Then refactor `levelgen`'s `auditGeometry` onto it — one flood-fill, not two. *No runtime change* |
| — | Lab v2 | Slots in here. N3 cannot be evaluated without watching one agent reach one point. See `sprints/2026-08.md` |
| N2 | Senses | New spatial facts on the existing perception cadence. Read-only, safe to land alone |
| N3 | Travel | `objective`/`task`, destination selection, route following, explicit "jump now". *No combat change* |
| N4 | Engage | Combat weights, stickiness margin, shot line from candidate nodes |
| N5 | Content | Roster objectives, nav-aware behaviour, updated authoring vocabulary |

Ordering: N1 is pure and testable; the Lab is how N3 is evaluated at all; N2 is
read-only; N3 is the first slice that can regress anything, and by then the graph
is trusted. N5 is last because authoring against a vocabulary nobody has watched
produces specs that look smart in JSON and dumb on screen.

## Deliberate non-goals

| Item | Why |
|---|---|
| Cover, hiding, dodging | Not blocked by this; later as scoring terms and actions |
| Explored-territory memory | The fix for idle ping-ponging is momentum, not memory |
| Flyers | Different problem: terrain resolution pushes out while steering pushes in |
| Dynamic geometry | Nothing moves or breaks. The hook is "rebuild on change" |
| Group coordination | Needs shared team state; own piece of work |

## Open questions

| Question | Leaning |
|---|---|
| Is `withdraw` an objective, a task, or just weights? | Weights — retreating is a question of where to stand |
| Crouch-height nodes (soldiers crouch to 22px) | Real, but needs a second envelope per body. Deferred |
| How does `advance` pick its destination point? | "Far end" is the default; should probably be authorable so a mission can direct a wave |
