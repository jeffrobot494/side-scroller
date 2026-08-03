---
type: idea
category: artificial-intelligence
resolution: vague
---

# Idea: advanced agent navigation

Agents that choose their own destination and keep fighting while they travel.
Nothing here is agreed or scheduled. The built baseline is
`design/agent-navigation.md`.

## Objective and task

| Field | Changes | Values |
|---|---|---|
| `objective` | Authored at spawn, rarely after | `hunt` · `advance` · `guard` |
| `task` | At runtime, and *completes* | `travel` · `engage` · `search` · `hold` |

Meeting an enemy would not change the objective. It suspends the current task,
starts an `engage` task, and resumes when that completes.

The two fields would earn their keep at exactly one point — the exit from combat
reads both:

| Objective | `engage` completes → |
|---|---|
| `guard` | Return to post |
| `advance` | Resume the route |
| `hunt` | Search for the next target |

Collapsing to one field means encoding the objective into the task name
(`guard_engaging`, …), multiplying states instead of adding them. At 3 × 4 that
is still hand-authorable, so it is a small bet — but the requirement it protects
is not: when a fight ends, the agent must still know what it was doing before it
started.

Objective would also be what distinguishes a companion from an enemy running the
identical brain. A spawn parameter, not a state.

## Destination scoring

A second scoring pass, over the nav graph's nodes, independent of the action
brain.

They would not compete. Movement arbitration is already dash > move order >
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

### Three rules that would matter more than the weights

| Rule | Why |
|---|---|
| Score, do not filter | Filtering for "has a shot" piles every enemy onto the same ledge |
| "Nearby" means time, not radius | Across a chasm, nothing better is reachable soon enough — so shoot from here |
| Commit to the destination | Re-scoring every 0.25s makes an agent oscillate between two ledges forever |

Destinations would change on the order of seconds; actions on the order of a
quarter second. Shot line evaluated *from each candidate node*, last, and only on
candidates that survived the cheap filters.

## Line of shot ≠ line of sight

| | |
|---|---|
| Sight | A clear line from my eyes to yours |
| Shot | From a muzzle at an offset, possibly arcing, with no ally in the corridor |

Cheap to split, and friendly fire is a supported config — conflate them and
enemies shoot their own front rank in the back.

## What would not change

The combat brain: scored actions with gates, cooldowns, windup, execute,
recovery, no mid-commitment cancelling.

A consequence — the action layer already runs independently of movement, so an
agent would fire while travelling with no special case. A task switch governs
only where it wants to *stand*. Meeting an enemy mid-route changes the
destination only when standing somewhere better outscores continuing.

## The layer stack it implies

| Layer | Changes | Example |
|---|---|---|
| Objective | Authored, ~never | `advance` |
| Task | On events, completes | `travel` → `engage` → `travel` |
| Destination | On arrival or material change | That ledge with a shot line |
| Route | When the destination changes | Walk, jump, walk |
| Step | Per frame | Drive left, jump now |

Each layer changes roughly ten times less often than the one below.

## Sketch of how it would play

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

## Other things parked here

| | |
|---|---|
| Cover, hiding, dodging | Would be scoring terms and actions |
| Explored-territory memory | The cheap fix for idle ping-ponging is momentum, not memory |
| Flyers | Different problem: terrain resolution pushes out while steering pushes in |
| Group coordination | Needs shared team state |
| `withdraw` | Probably weights rather than a new objective — retreating is a question of where to stand |
| Crouch-height nodes | Soldiers crouch to 22px, so some spans are crouch-only. Needs a second envelope per body |
