---
type: tech
category: artificial-intelligence
status: designed
resolution: sharp
sprint: 2026-08
tags: [ai, enemies, companions, movement, navigation]
---

# Agent navigation

Agents in this game have no spatial reasoning. Every behavior is expressed
relative to whatever they are fighting — close the distance, hold a range, go
where I last saw you — so the level itself is nearly invisible to them. Out of
all the terrain, an agent perceives three things: whether a wall blocks its view
of the target, whether there is floor under an 8px probe past its front foot, and
whether the target is more than 40px above or below it.

That is why a grounded enemy chasing a target on a ledge walks to the spot
underneath and stays there. It is not stuck; it is doing exactly what it was
told, which was "reduce the horizontal distance."

This document is the design for giving agents somewhere to *be* and a way to get
there. It replaces an earlier draft that led with an implementation audit.

## The shape of the design

Five pieces. The first two are new concepts, the third is new machinery, and the
last two are about what stays untouched.

### 1. Objective and task

**Objective** is an authored field set when an agent spawns. It answers "what am
I here for" and changes rarely, through explicit transitions — a guard whose post
is overrun, an agent dropping below a health threshold.

    hunt      find and kill hostiles
    advance   get somewhere; fight what is in the way
    guard     hold a region, engage intruders, return when done

**Task** is the runtime unit of work. It answers "what am I doing right now."
Tasks *complete*, which is the property that makes them useful — travel finishes
on arrival, engage finishes when the target is dead or lost, return finishes when
you are back at your post.

    travel    get to a destination
    engage    fight a specific target
    search    look for a target I lost
    hold      stand here

Encountering an enemy does **not** change the objective. It suspends the current
task and starts an `engage` task. When that completes, the suspended task
resumes. The objective is what tells you what to do after every interruption, so
it cannot be the thing an interruption overwrites.

The two fields earn their keep at exactly one point — the transition out of
combat reads *both*:

| Objective | Task ends | Next |
|---|---|---|
| `guard` | `engage` completes | return to post |
| `advance` | `engage` completes | resume the route |
| `hunt` | `engage` completes | search for the next target |

Collapsing them to one field means encoding the objective into the task name
(`guard_engaging`, `advance_engaging`, …), which multiplies states instead of
adding them. At three objectives and four tasks that is still hand-authorable, so
this is a small structural bet rather than an urgent one — but the requirement it
protects is not optional: **when a fight ends, the agent must still know what it
was doing before the fight started.**

Objective is also what distinguishes a companion from an enemy running the
identical brain. It is a per-instance spawn parameter, not a state.

### 2. The node graph — facts about the level

A level is continuous space, but the places you can *stand* are a small discrete
set. Collapsing to those turns navigation from a search over pixels into a search
over roughly 15–60 options.

**Nodes are standable surfaces, not platforms.** A crate sitting on the ground
slab splits it into two nodes, because you cannot walk through the crate. A node
is a maximal stretch of surface where a given body can stand and walk
uninterrupted, which makes node extraction partly body-dependent (headroom).

**Edges are directed moves.** Platforms here are solid from every side, so there
are three kinds: jump up, jump across a gap, walk off and fall. Direction
matters — dropping off a high ledge is always available, climbing back may not
be. Encoding that lets an agent know it would strand itself *before* it commits.

**Edge cost is measured in seconds**, not pixels, so route cost is directly
comparable to everything else an agent weighs ("better position, but four seconds
away").

**Edges are per-body.** Nodes come from geometry; edges come from who is asking.
A heavy body with a weak jump has fewer arrows on identical terrain, so "the
small ones can follow you up there, the big one has to go around" is a
consequence rather than an authored behavior. Flying bodies get no graph — for
them everything already connects to everything, which is why they do not feel
dumb today.

Built once at level load and never modified; nothing in the terrain moves.
Node counts are small enough to precompute every route at build time and make
each query a table lookup.

Three uses:

1. **Routing** — next move from here to there.
2. **Supplying candidate destinations** — the node list is a list of *places*, so
   "where should I stand" becomes a scoring problem. Today an agent has no
   vocabulary for "somewhere"; it can only name positions relative to its target,
   which is why every behavior reduces to closing distance.
3. **True distance** — most dumb platformer AI comes from trusting straight-line
   distance. Something 100px above you may be two seconds away, twelve seconds
   away, or unreachable, and the straight line cannot tell those apart.

The graph holds facts. It knows nothing about other agents, projectiles, danger,
or what anyone is doing. Keeping that boundary sharp is what stops it becoming a
knot.

### 3. Destination scoring — opinions about where to be

The existing utility brain scores *actions*. This adds a second, independent pass
that scores *places*, over the node list, using the same style of weighted
expression.

The two do not compete, because they occupy different slots that already exist.
Movement arbitration today is: an active dash wins, else an active move order,
else the standing motion controller. Dashes and move orders are issued *by
actions*; the standing controller is the fallback that runs when no action is
driving. Destination scoring replaces that fallback slot. The action layer keeps
overriding it exactly as it does now.

Merging them into one list would be the real regression. An action is short and
committed (windup → execute → recovery, no cancelling); a destination is a
multi-second background pursuit. Score them together and either the agent commits
to a four-second walk it cannot shoot during, or you invent non-blocking movement
actions and lose the commitment that makes fights readable.

The task supplies the weight profile:

| Term | `travel` | `engage` |
|---|---|---|
| progress toward objective point | high | low |
| has shot line to target | — | high |
| within my preferred range | — | high |
| elevation over target | — | moderate |
| time to arrive | penalty | penalty |
| ally already there | small penalty | penalty |
| dead end (no exit edges) | penalty | penalty |

Same engine, same node list, different weights — so tasks are authorable data.

Three rules that matter more than the weights:

- **Score, do not filter.** Filtering for "nodes with a shot" piles every enemy
  onto the same obvious ledge. Scoring spreads them.
- **"Nearby" means time, not radius.** Candidates are nodes reachable within N
  seconds. This gives the correct behavior across a chasm for free: nothing
  better is reachable soon enough, so the agent shoots from where it stands
  instead of embarking on a hopeless journey.
- **Commit to the destination.** Re-scoring every quarter-second makes an agent
  oscillate between two similar ledges and never arrive — the classic failure of
  scored movement, and it reads far worse than standing still. Give the current
  destination a stickiness margin a rival must beat, and re-evaluate on arrival
  or material change (target moved far, shot line lost, took damage, ally
  crowded in), not on a fast timer. Destinations change on the order of seconds;
  actions on the order of a quarter-second.

Shot line is evaluated *from each candidate node*, not from where the agent
stands. It is the one expensive term, so it runs last, only on candidates that
survived the cheap filters.

### 4. Line of shot is not line of sight

Worth splitting from the start because it is cheap and the failure is ugly.
Sight is a clear line from my eyes to yours. A shot leaves a muzzle at an offset,
some projectiles arc under gravity, and an ally may be standing in the corridor —
and friendly fire is a supported config. Line of shot is line of sight from the
muzzle, plus nobody friendly in the way.

### 5. What does not change

**The combat brain is the good part.** Scored actions with gates, cooldowns,
windup, execute, recovery, and no mid-commitment cancelling is what makes a
duelist readable and punishable. None of it is touched. This work replaces the
movement layer only.

A useful consequence: because the action layer runs independently of the movement
layer, an agent already fires while travelling with no special case. A task switch
governs only where the agent wants to *stand*. So meeting an enemy mid-route does
not necessarily change the destination at all — it changes it only when standing
somewhere better outscores continuing, and the scoring answers that on its own.
"Advance while firing" and "break off to climb a ledge" are the same system with
different weights.

## The layer stack

| Layer | Changes | Example |
|---|---|---|
| Objective | authored, ~never | `advance` |
| Task | on events, completes | `travel` → `engage` → `travel` |
| Destination | on arrival or material change | that ledge with a shot line |
| Route | when the destination changes | walk, jump, walk |
| Step | per frame | drive left, jump now |

Each layer changes roughly ten times less often than the one below it, which is
what makes the whole thing cheap to run and easy to inspect — any single layer can
be frozen in the Lab while the others keep moving.

## Worked example

An `advance` trooper is travelling toward the far end of the level. A soldier
appears on a ledge above and ahead.

1. Perception sees a hostile on the next sense tick (0.2s cadence, so there is a
   natural reaction delay).
2. The `travel` task is suspended; an `engage` task starts. The objective is
   still `advance`.
3. Destination scoring switches to the `engage` weights. Candidate nodes are
   those reachable in under a few seconds. The ledge the soldier is on scores
   poorly (inside preferred range, no elevation advantage); a crate top with a
   shot line at mid-range scores well.
4. The route to the crate top is two edges: walk, then jump. The agent follows
   it, firing whenever the action brain says to — travelling does not suppress
   combat.
5. The soldier dies. The `engage` task completes; `travel` resumes with its old
   destination intact.
6. Had the objective been `guard`, step 5 would instead route back to the post.

## Slices

Each lands independently and keeps the test suite green.

**N1 — the graph.** Node extraction, the four edge kinds, per-body envelopes,
precomputed routes, a golden fixture for a fixed platform set, degenerate cases.
The level generator already builds and flood-fills this graph privately at build
time to validate its own geometry; that should become the same code, so the
generator's guarantee and the AI's beliefs cannot disagree. *No runtime change.*

**Lab v2 — see `ROADMAP.md`.** Slots in here, not later: N3 cannot be
evaluated without a way to watch one agent try to reach one point. The current
Behavior Lab is being rebuilt from scratch at a much smaller scope.

**N2 — senses.** New spatial facts on the existing perception cadence: my node,
the target's node, same-surface, hops and seconds to reach, the kind of the next
move, gap width ahead, unreachable. Read-only — specs can gate on them while
still moving the old way, which makes this safe to land alone.

**N3 — travel.** `objective` and `task` fields, destination selection for
`travel`, route following, and the one locomotor change this needs: an explicit
"jump now" instruction. Both grounded bodies currently *guess* when a steering
intent implies a jump (two different thresholds, and one of them ignores the case
entirely), because nothing can tell them. With a graph the brain knows the takeoff
point, so the guess is replaced by an instruction. *No combat change.*

**N4 — engage.** Destination scoring under combat weights, the stickiness margin,
shot-line evaluation from candidate nodes, line of shot split from line of sight.

**N5 — content.** Give the built-in roster objectives and nav-aware behavior;
update the authoring vocabulary and the intelligence rubric.

Ordering rationale: N1 is pure and testable with no risk; the Lab is how N3 gets
evaluated at all; N2 is read-only and immediately improves the Lab; N3 is the
first slice that can regress anything, and by then the graph is trusted. N5 is
last because authoring against a vocabulary nobody has watched in the Lab
produces specs that look smart in JSON and dumb on screen.

## Deliberate non-goals

- **Cover, hiding, and dodging.** Not blocked by any of this; add later as
  destination-scoring terms and actions.
- **Explored-territory memory.** Agents assume hostiles always exist and wander
  when idle. The cheap fix for the ping-ponging that causes is momentum — keep
  going the way you are going until something stops you — not territory memory.
  When memory is wanted, the graph makes it a data addition (mark nodes visited,
  decay) rather than a rewrite.
- **Flyers.** They already move in two dimensions. Their real problem is
  different: terrain resolution pushes them out of a platform while steering
  pushes them back in, so they can grind against geometry. Separate fix.
- **Dynamic geometry.** Nothing moves or breaks. The graph is a pure function of
  the platform list, so the hook is "rebuild on change" — do not build
  invalidation machinery for a case that does not exist.
- **Group coordination.** Lane reservation and turn-taking need shared team
  state; that is its own piece of work and this one should not anticipate it
  beyond the "ally already there" scoring term.

## Open questions

- Does `withdraw` want to be an objective, a task, or just a set of scoring
  weights? Leaning on weights, since retreating is a question of where to stand.
- Crouch-height nodes: a soldier can crouch to 22px, so some spans are
  crouch-only. Real, but needs a second envelope per body and a crouch-while-
  moving intent. Deferred.
- How does an `advance` objective pick its destination point? "Far end of the
  level" is the obvious default and is usually right, but it should probably be
  an authored point so a mission can direct a wave.
