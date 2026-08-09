---
type: tech
category: artificial-intelligence
status: built
resolution: sharp
sprint: 2026-08
needs: [agent-navigation]
related: [behavior-lab, locomotion]
---

# Ranged repositioning

How a `keepDistance` agent gets navigation without getting destination scoring.
The full version is `idea/advanced-agent-navigation.md` and is September's.

`needs: agent-navigation` — the graph, the follower, and the soldier profile
branch all shipped with `tech/agent-navigation.md` N1–N3.

**Why this exists.** N3 routes any controller that resolves a world point.
`keepDistance` resolves a *band* — `holdRange { point, min, max }` — so every
grounded ranged agent in the game is still terrain-blind: `lurk_gunner`,
`cowardly_duelist`, and the **companion's `combat` state**, which sets
`keepDistance` on a soldier body.

**This is a partial fix, and the size of the part is measured.** Across 40
generated levels, every perch, with the player on it and a gunner parked at its
band's outer edge: line of sight is **already clear in 61%** of placements. A
gunner that can see you is working as intended — it shoots. This spec addresses
the other 39%, plus agents wedged where they cannot hold their band at all. The
remaining cases — bad angle, no elevation, clumped fire — are weights, and weights
are `idea/advanced-agent-navigation.md`'s destination scoring, cut to September by
`sprints/2026-08.md`. **Anyone reading this expecting ranged enemies to start
using terrain intelligently will be disappointed; it stops them standing in
places from which they can do nothing.**

**As built (R1) — the size of the part, measured end to end.** The 61% above is
a placement statistic: a gunner *parked at its band's outer edge* under a perch.
It is not the fraction that ends up able to shoot, which is what matters. Over
120 generated levels, every grounded `lurk_gunner`/`cowardly_duelist` at its own
spawn, player pinned on a perch for 40 simulated seconds:

| Player stands on | Can shoot, R1 off | Can shoot, R1 on |
|---|---|---|
| a mid-height perch | 49/185 (26%) | **169/185 (91%)** |
| the level's highest perch | 5/185 (3%) | **42/185 (23%)** |

The gap between the two rows is the honest limit, and it is not a bug in the
follower: on the highest perch **139 of 185 agents (75%) have no reachable
position anywhere on the level that is both inside the band and has line of
sight.** There is nothing to filter down to. Only 4 agents (2%) had a spot and
failed to be standing on it after 40s — no systematic stalling. So R1 is close to
a complete fix wherever a firing position exists, and does nothing at all when
the player takes the roof, which is a band problem rather than a routing one and
neither this slice nor September's scoring addresses it.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| R1 ✅ | **Enemies reposition.** A grounded enemy-team `keepDistance` agent that either has no line of sight to its target, or is outside its band and not closing, resolves the least-time reachable node that is inside the band and has line of sight, and routes there. It holds that choice until it arrives, regains sight, or the follower gives up, then hands back to `holdRange` | **Changed, enemy team only.** `lurk_gunner` and `cowardly_duelist` leave dead positions. With sight and a holdable band — the common case — nothing changes |
| R2 ✅ | **Companions too.** The same path for the player team, whose `combat` state runs `keepDistance` on a soldier body | **Changed for allies.** A squadmate in combat repositions instead of holding a line it cannot shoot along. This is the slice that touches how the game plays *with* you, which is why it is separate |

R1 lands alone and is the whole enemy-facing fix. R2 is split off because it
changes ally behaviour in every mission and deserves to be accepted or rejected
on its own — not because it is technically harder. Both are watched in the Lab.

**As built (R2) — it is very nearly a no-op, and that is the finding.** R2 was
one deleted guard, as planned. What it buys in the game as it stands is almost
nothing. Over 60 generated levels, a real companion on `updateCompanionSpec` with
the leader pinned, 30 simulated seconds each:

| | R2 off | R2 on |
|---|---|---|
| had sight while in its `combat` state | 97% of frames | **99%** |
| `escort`↔`combat` transitions | 7.3 per level | **7.1** |

A companion escorts the player, and the player is usually in the open, so it
almost never lacks a sight line to begin with — there is no 39% here to fix. The
value of the slice is therefore **one code path instead of two**, not better ally
behaviour: every later improvement to repositioning now lands on both teams at
once. Take it on that basis or not at all; nothing measurable is lost by
reverting it.

**As built (R2) — it collides with the companion's own brain, and the collision
is design, not code.** `combat` exits on `sense.playerAbove || sense.playerBelow`
(`src/game/companionspecs.js`). Repositioning's job is to change elevation, so a
companion that climbs onto cover to get a shot immediately stops considering
itself in combat, escorts back down, re-engages, and climbs again. It is visible
in `test/reposition.test.mjs`'s cover scene, which is why that test asserts the
companion *gets* the shot rather than *keeps* it. The measurement above says this
does not bite on today's generated levels — the companion rarely needs to climb —
but the exit condition was written when a companion could not change its own
elevation, and it will bite the moment ally behaviour gets more ambitious.
**Bo's call; not changed here.**

**Commitment is part of R1, not deferred.** The follower resets its give-up
accounting whenever the destination moves more than `navArriveRadius`, so a
destination recomputed every sense tick would rebuild the route continuously and
the attempt cap would never accumulate. Repositioning must pin its point or it
defeats the mechanism it depends on.

**As built (R1) — the window counts grounded time only.** Pinning the point was
necessary and not sufficient. A window that expires mid-jump asks an agent to
re-decide from the air, where there is no node under it to decide from: it hands
back to `holdRange` with a leg still open, and the follower — which resolves a
jump on the first *grounded* frame after takeoff — later books that leg as a
failed attempt on an edge it was in the middle of clearing. Three of those retire
a good edge permanently. The clock now stops while airborne, so every window ends
somewhere a decision can actually be made. Two knobs, not one, in the SCHEMA:
`navRepositionHold` (1.5s) and `navStallTime` (0.6s), plus `navReposition` to
switch the whole feature off.

**As built (R1) — "not closing" is measured as ground covered.** The obvious
reading, "the distance to the target is not shrinking", tracks the *target's*
movement and resets the moment it walks. `holdRange` drives at full speed
whenever it is outside the band, so an agent that is trying and failing has a
commanded velocity and a position that does not change: the trigger is therefore
"outside the band and less than `navArriveRadius` from where the stall began".

**This is a filter, not scoring.** Three hard filters — inside the band, has line
of sight, reachable — and one tiebreak, least time. No weights, no elevation
term, no ally spacing, no line-of-shot. When September's scoring lands it replaces
this outright.

## Reuses

Everything here exists; the slice is a resolver and a call site.

| What | Where | How it is used |
|---|---|---|
| The route follower | `src/mission/navigation.js` | Once a band becomes a point, this is untouched — same profiles, same graph cache, same takeoffs, same partial-path fallback and attempt cap |
| The node graph | `src/game/nav.js` | The candidate set is the graph's own nodes for the agent's profile |
| Least-time ranking | `src/game/nav.js` | `costsFrom` already returns seconds to every node from one source, in one pass. It is both the reachability filter and the tiebreak, so "nearest" means time — which `idea/advanced-agent-navigation.md` names as one of the three rules that matter more than the weights |
| The band | `src/mission/enemyspec/runtime.js` | The `keepDistance` branch of `controllerRequest` already holds `min`, `max`, the resolved target point and the speed. `holdRange` stays the fallback and the arrival state |
| Line of sight | `src/mission/enemyspec/perception.js` | The segment-vs-platform test behind `sense.los`, which already takes an arbitrary pair of points. It is module-private and needs exporting — not writing |
| Whether to reposition | `src/mission/enemyspec/perception.js` | `sense.los` is published on the throttled cadence; the trigger is a sense read, not a new probe |
| Giving up | `src/mission/navigation.js` | Best partial path, then the attempt cap. Inherited, provided the destination is pinned |
| The soldier profile branch | `src/mission/navigation.js` | R2 needs no new profile work — `profileFor` already returns the player's envelope for a soldier-locomotor body |
| The evaluation surface | `design/behavior-lab.md` | Whether repositioning reads as competent is an eyeball check |

## Where the code goes

| Module | Holds |
|---|---|
| `src/mission/navigation.js` | The band resolver: given a graph, a target point, a band, a reachability/cost source and a sight predicate, the node to stand on. Pure selection — it decides *where*, never *how to get there* |
| `src/mission/enemyspec/runtime.js` | The `keepDistance` branch calls it, injects the sight predicate, owns the pinned choice, and falls back to `holdRange` unchanged |
| `src/mission/enemyspec/perception.js` | Exports the existing line-of-sight test |

**As built:** `perception.js` exports `losBetween(x0, y0, x1, y1, platforms)` —
the whole of what `sense.los` computes, `config.labGodEye` included, so the
resolver's filter and the trigger that consults it can never disagree. The
resolver probes **three** positions per candidate interval, not one: the point
reached with the least walking, and each end of the band. They see past different
corners, and in the regression scene only the far end has a sight line, so a
single probe would have reported no candidate where one plainly exists.

Conventions and constraints this must follow:

- **The sight test is injected by the call site, not imported by the resolver.**
  `perception.js` already imports `navigation.js` for `navSense`; importing back
  the other way makes the pair mutually dependent. `runtime.js` imports both and
  is the natural place to hand one to the other.
- **Coordinate spaces do not match and must be converted deliberately.** Node
  spans are body-left-edge; `routeRequest` takes a destination in centre space;
  `holdRange` measures its band centre-to-centre in **two dimensions, including
  `dy`**. A node picked in one space and used in another is wrong by half a body
  width — larger than the default arrival radius — and a band tested without `dy`
  puts the agent somewhere `holdRange` immediately rejects.
- **The follower assumes continuous ownership of an agent.** It resolves a jump
  on the first grounded frame after takeoff. If repositioning ends mid-air and
  `holdRange` takes the next frames, a completed jump can later be booked as a
  failure. Ending a reposition must clear the agent's route state, not just stop
  consulting it.

  **As built:** "clear the route state" turned out to be too broad. `abortRoute`
  in `src/mission/navigation.js` drops the leg, the path and the pinned
  destination and **keeps `attempts` and `banned`** — an edge this body cannot
  fly is a fact about geometry, and wiping the ledger every time an agent changes
  its mind means it relearns the same dead jump for the whole mission. Same
  reasoning as N4's decision not to reset the ledger when a destination moves.
- **No new tunable constants in code.** Any commitment window or re-evaluation
  cadence goes in the config `SCHEMA`, beside the `Agent navigation` group.
- **`src/game/nav.js` stays pure** and gains nothing. The resolver needs a scene
  to test sight, so it is mission-side.
- **Fallback discipline.** No candidate, no graph, not grounded, or a flyer →
  today's `holdRange`, unchanged.

## The seam

| Owns | Must not touch |
|---|---|
| Turning a band into a destination point | How a destination becomes movement — the follower, untouched |
| The `keepDistance` branch of `controllerRequest` | `chase` and `moveTo`, which already route, and every flyer controller |
| When a ranged agent decides to move | What it shoots, when, or at whom. The utility brain and its scoring are neither read nor written |
| Which node it stands on | The band arithmetic in `holdRange`. On arrival the agent holds distance exactly as today |
| Grounded bodies | Flyers, which already move in two dimensions and get no graph |
| The enemy team (R1); the player team (R2) | R1 must leave ally behaviour byte-identical, which is what makes R2 a real decision rather than a formality |

**As built (R2) — a commitment must not outlive the controller that made it.**
The spec assumed the only way to lose an agent mid-reposition was a jump. It is
not: a dash or a `moveOrder` preempts the standing controller outright, and a
brain can leave `keepDistance` altogether — the companion's `combat` state does
exactly that, sometimes *because* the reposition worked. Control then returns
seconds later to a destination pinned for a fight that is over, with a leg still
open from it. The reposition state now stamps `root.age` on every call and
releases when it finds a gap, so control returning always starts a fresh
decision. Found in R2; it was latent in R1 for every dashing enemy, and the
`cowardly_duelist` dashes constantly.

**A committed *dash* outranks this; a fire action does not.** Arbitration is
`dash > moveOrder > controller`, and only a `dash` or `moveTo` step preempts the
standing controller. `cowardly_duelist`'s `backHop` and `lunge` carry dashes and
interrupt repositioning; `snipe` is a bare `fire` and does not — the duelist will
shoot while walking, which is correct and is how every other controller already
behaves.

**Line of sight, not line of shot.** `idea/advanced-agent-navigation.md` is right
that they differ — muzzle offset, arc, an ally in the corridor. Splitting them is
September's, so an agent can arrive somewhere it can see but not cleanly shoot.

## Must not regress

| Suite | What it actually guards |
|---|---|
| `test/locomotion-intents.test.mjs` | Two companion outcomes: the escort loop, and — **the one that matters for R2** — the combat block that drives the companion into `keepDistance` and asserts it holds a standoff without overrunning the enemy. R1 must leave both untouched; R2 is expected to move the second and must be re-justified, not re-baselined |
| | **As built:** it did not move, and the reason is the point of the slice. That scene is flat ground with a clear sight line and a band the companion can hold, so the trigger never fires — the 91% case where R1/R2 do nothing by design. No re-justification was needed and none was invented |
| `test/enemyspec-brain.test.mjs` | Track and utility scoring, and `sense.*` values. Note the honest version: moving an agent **does** change `sense.dist`/`los`/`playerApproaching`, which the duelist's gates read. The guarantee is that no scoring *rule* changes, not that no score does |
| `test/locomotion-characterization.test.mjs` | Whole-trajectory fixtures. Both `keepDistance` enemies are in it, and on that scene neither has any band+sight candidate — the duelist has none anywhere, the gunner's only one is an unreachable wall top. **The fixture is expected to stay green.** A diff here means the resolver is choosing something it should have filtered out, and regenerating would bless a bug |
| `test/navigation.test.mjs` | The follower, unchanged by both slices |
| `test/nav.test.mjs` | The graph the candidates come from |
| `test/mission-enemyspec.test.mjs` | Mission enemies still instantiate and update |
| **As built:** `test/reposition.test.mjs` | R1+R2's own suite (57). The resolver alone, the whole loop against a feature-off control, both triggers, commitment, the enemy/ally split, and the two route-state invariants — a reposition ending mid-jump must take the pending leg with it, the window must not tick while airborne, and a commitment must not span an interruption. R2 adds the real companion on `updateCompanionSpec`, climbing cover to get a shot, against a feature-off control. Every route-state invariant in it was written after a mutation survived without it |

The bar is `node test/run.mjs` green plus a served-page check. **Whether a
repositioning gunner reads as smart or as twitchy cannot be asserted headlessly.**

**The Lab's god-eye lever hides this feature.** `labGodEye` forces `sense.los`
true whenever a hostile exists, which is exactly the trigger R1 keys on — so the
one lever intended to isolate a navigation fault switches repositioning off.
Evaluate with it off, and expect the lever to need rethinking once behaviour
depends on sight.

## Approximations

| Approximation | Why | What catches the failure |
|---|---|---|
| Sight is the trigger, so 61% of perch placements are untouched | A gunner that can see you is not broken; it is shooting. Fixing the rest means weighting angle, elevation and spacing, which is September's | Nothing, deliberately. Stated in the opening so it is not mistaken for a general fix |
| Filters, so several gunners can pick the same node | Scoring is what spreads them. Generated levels place up to **five** grounded ranged enemies (42 of 300 seeds place three or more), so the pile is real, not hypothetical | The Lab, by eye. `idea/advanced-agent-navigation.md` names this exactly: "Score, do not filter" |
| Sight is tested from the node's standing position, not the muzzle | Line of shot needs an emitter offset and an ally check | Nothing. The agent may arrive somewhere it can see but not cleanly shoot |
| The band is measured to where the target is now | The target moves; the walk takes seconds | The commitment window bounds staleness; the choice is re-made when it expires or sight returns |
| An agent that arrives and still cannot see stops | On the final node the follower returns a halt | The commitment window expiring is what unsticks it. Without one, an agent that arrives to a stale choice freezes — this is the specific failure that makes commitment part of R1 rather than a later polish |
| **As built:** the chosen position can sit exactly on `max` | The band's far edge is often the only place that sees past a corner, and the filter has no margin term | Nothing. `holdRange` does nothing at exactly `max`, and closing from just outside it walks *into* better sight rather than out of it, so the failure mode is a step of dithering, not a lost target |
| **As built:** a scan that finds nothing is not repeated for `navRepathInterval` | Sight is a segment test per candidate, and a blind agent would otherwise re-scan the whole graph every frame forever | Nothing. The delay is half a second and the geometry it is scanning did not change |

---

*Background — the state this starts from. Not needed to start building; the six
sections above are.*

## Background: which agents navigate today

Measured against the shipping roster after `tech/agent-navigation.md` N3.

| Agent | Body | Controller | Routes today |
|---|---|---|---|
| `husk_charger` | grounded | `chase` | Yes |
| Companion — `escort` | grounded (soldier) | `moveTo` via move order | Yes |
| `lurk_gunner` | grounded | `keepDistance` | ~~No — R1~~ **Yes, since R1** |
| `cowardly_duelist` | grounded | `keepDistance` | ~~No — R1~~ **Yes, since R1** |
| Companion — `combat` | grounded (soldier) | `keepDistance` | ~~No — R2~~ **Yes, since R2** |
| `spore_wisp`, `strafe_raider`, `sky_duelist`, `iron_moth` | flying | `hover` / `static` | No, by design |

So every grounded agent in the game either routes already or is covered by one of
these two slices. Flyers are excluded permanently, not deferred.

Editor-authored and LLM-generated enemies follow the same rule: their controller
decides whether they route. This widens that from "resolves a point" to "resolves
a point or a band".
