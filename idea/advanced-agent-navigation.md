---
type: idea
category: artificial-intelligence
resolution: vague
---

# Idea: advanced agent navigation

Agents that choose where to stand and how to get there, keep fighting while
travelling, and prioritize their own survival when responding to player orders.
This proposal records the navigation, survival, and order-handling direction;
it is not an implementation specification or schedule. The built baseline is
`design/agent-navigation.md`.

## Objective and task

| Field | Changes | Values |
|---|---|---|
| `objective` | Authored at spawn or set by an accepted order | `hunt` · `advance` · `guard` |
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

Objective would also distinguish a companion from an enemy running the identical
brain. A spawn parameter or accepted intent, not a combat state. Resuming a task
after combat remains subject to survival assessment; an unsafe return is delayed
or abandoned with feedback.

## Player orders and survival

The player normally prescribes a destination, not a route. Soldiers choose how
to reach it and prioritize their own survival by default.

| Concept | Meaning |
|---|---|
| Order | What the player requests: advance to a destination or hold a position |
| Ordered destination | The requested endpoint or holding position; retained while the soldier considers routes and intermediate cover |
| Tactical destination | Where the soldier currently wants to stand on the way to fulfilling the order |
| Route | Chosen by the soldier; a safer detour is ordinary execution and normally needs no special dialogue |
| Risk acceptance | Whether the best available way to fulfill the order is still more dangerous than the soldier will accept |

### Evaluate the order, not just the direct path

1. Find plausible routes to the ordered destination.
2. Assess danger during travel and while occupying the destination. Holding uses
   a short, rolling horizon rather than treating arrival as success.
3. Choose an acceptable route, wait for an opening, or refuse when no acceptable
   way to fulfill the order exists.

| Outcome | Behavior | Example feedback |
|---|---|---|
| Active | Execute using an acceptable route and useful intermediate cover | "Moving!" |
| Delayed | Seek protection, retain the pending order, and reassess for an opening | "Waiting for that gunner to stop firing!" |
| Refused | Decline the order and choose a defensive position | "Are you crazy?! That's suicide!" |
| Abandoned | Stop executing an accepted order after conditions become too dangerous; take defensive action | "I can't hold this position! Falling back!" |

- Risky orders can be refused; certainty of death is not required. Risk is judged
  from perceived threats, incoming fire, recent damage, health, and protection.
- A dangerous direct route alone does not justify refusal if a reasonable safer
  route exists. Physical unreachability and unacceptable danger are different
  reasons for being unable to comply.
- Choosing intermediate cover preserves the ordered destination. Replacing the
  requested endpoint or leaving an assigned holding position for safety is a
  refusal or abandonment and must be communicated.
- Reassess accepted orders when circumstances materially worsen. Use different
  thresholds for abandoning and resuming movement to avoid repeated reversals.
- A delayed order may resume when an opening appears. A refused or abandoned
  order does not silently reactivate later.
- Spoken feedback explains the reason; the order indicator shows active,
  delayed, refused, or abandoned, and the current defensive behavior is visible.
- Waiting must remain explicit: a soldier cannot appear to obey while hiding
  indefinitely. Reassessment either finds a way forward or communicates refusal.

Risk acceptance is separate from destination utility. A large progress or firing
bonus must not mathematically outweigh danger the soldier considers unacceptable.

## Destination scoring

A second scoring pass, over positions within the nav graph's nodes, independent
of the action brain. Nodes represent standable spans: sample positions within
them, especially near terrain edges, because one span can contain both exposed
ground and cover. Include the current position and evaluate useful stances.

They would not compete. Movement arbitration is already dash > move order >
standing controller. Dashes and move orders are issued *by actions*; the standing
controller is the fallback. Destination scoring replaces that fallback slot.
Player orders are persistent intent above this arbitration, not the short-lived
`moveOrder` commands issued by actions; an order must not bypass safety evaluation
by occupying a higher-priority movement slot.

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
| Exposure to known hostile firing positions | penalty | penalty |
| Protection when standing or crouching | reward | reward |
| Danger along the route | penalty | penalty |
| Time until protected | penalty | penalty |

Health and recent damage increase the importance of safety; reloading also makes
exposure less desirable. Consider absolute health as well as health percentage:
the relevant question includes whether another hit could kill the soldier.
Protection is relative to threats, including multiple enemies and blast danger,
not a universal property of a location. A safe endpoint does not make its route
safe; compare plausible alternatives rather than only the fastest route.

### Three rules that would matter more than the weights

| Rule | Why |
|---|---|
| Score tactical desirability | Do not require a shot line; filter physical impossibilities, and evaluate risk acceptance separately |
| "Nearby" means time, not radius | Across a chasm, nothing better is reachable soon enough — so shoot from here |
| Commit until material change | Small score changes do not justify switching; significantly changed danger can justify reconsideration |

Destinations would change on the order of seconds; actions on the order of a
quarter second. Shot line evaluated *from each candidate node*, last, and only on
candidates that survived the cheap filters. Order fulfillment remains explicit:
if no acceptable candidate can fulfill the order, report delay or refusal instead
of quietly substituting another endpoint.

## Immediate defense and recovery

Destination selection handles exposure over seconds; immediate defense handles
threats arriving before repositioning can help.

| Decision | Behavior |
|---|---|
| Continue, duck, or jump | Compare short-term danger after reaction delay; choose one compatible response |
| Jump to dodge | Only when the trajectory reduces danger and offers a viable landing; include overhead obstacles and other incoming rounds |
| React imperfectly | Preserve Speed-based reaction chance and latency; projectile awareness does not imply perfect evasion |
| Keep moving coherently | Ducking prevents running and jumping, so defensive choices must share arbitration rather than issue conflicting requests |
| Resume useful activity | Reassess when pressure drops, enemies die, the leader moves, or another firing position opens |

- Generalize the projectile prediction behind the existing duck reflex; assess
  the soldier's possible motion as well as the projectile's motion.
- Keep immediate defense faster than destination selection. It runs alongside
  task and route decisions, through the same body actuation point.
- Preserve action commitment initially: start defensive actions only when
  compatible with the current action. Any future cancellable phases must be
  explicit; a danger update does not automatically cancel every attack.
- Low health can persist for the rest of the mission. Do not wait for healing
  before becoming useful again; cautiously re-engage when exposure permits.
- Nerve could affect willingness to accept perceived risk, and traits could
  modify it. These are possible tuning inputs, not settled stat curves.

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
| Order and acceptance | On player input or material risk change | Advance there; active, delayed, refused, or abandoned |
| Objective | At spawn or on accepted intent | `advance` |
| Task | On events, completes | `travel` → `engage` → `travel` |
| Tactical destination | On arrival or material change | Intermediate cover toward the ordered destination |
| Route | When destination or route safety changes | Walk, jump, walk |
| Step | Per frame | Drive left, jump now |

Lower layers generally change more often. Material danger can trigger an early
reassessment; immediate defensive reactions run alongside this stack.

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
| Explored-territory memory | The cheap fix for idle ping-ponging is momentum, not memory |
| Flyers | Different problem: terrain resolution pushes out while steering pushes in |
| Group coordination | Needs shared team state |
| `withdraw` | Probably weights rather than a new objective — retreating is a question of where to stand |
| Crouch-height nodes | Soldiers crouch to 22px, so some spans are crouch-only. Needs a second envelope per body |

## Suggested first survival use case

| Step | Scope |
|---|---|
| 1 | Health-aware destination scoring, cover seeking, and explicit order evaluation and feedback; retain the existing duck reflex |
| 2 | Improve route exposure assessment and comparison of safer alternatives |
| 3 | Add jump dodging using the same threat information and movement arbitration |

Evaluate damage taken and deaths alongside damage dealt, progress toward accepted
orders, time following the leader, and time stuck or hiding. Survival gained by
silently abandoning the task is not successful order execution.
