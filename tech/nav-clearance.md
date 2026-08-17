---
type: tech
category: artificial-intelligence
status: unbuilt
resolution: sharp
needs: [agent-navigation]
tags: [ai, movement, navigation]
---

# Nav clearance

Stop the graph offering jumps the body cannot fly. What the agent should do:
`design/agent-navigation.md`. How it gets there today, and why this is owed:
`tech/agent-navigation.md` ("Edges ignore ceilings" in its Approximations).

`needs: [agent-navigation]` — this changes `src/game/nav.js`, which N1 built.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| C1 | **Lift the manoeuvre geometry.** The takeoff point, the landing point, the drop-lip choice, the airborne aim rule, the takeoff-window test and `drive`'s distance clamp move from `src/mission/navigation.js` into `src/game/nav.js` as pure functions; the follower imports them back | **None.** Pure refactor. `test/navigation.test.mjs` is what proves it |
| C2 | **The sweep.** `linkBetween` gains a clearance gate for `hop` and `jump` edges only: fly the C1 rules against the platform list and reject an edge whose arc clips terrain. Router-side; generation's audit keeps the old test. New config knob `navClearance`, and a clearance term in the graph cache key | **Changed.** Agents stop attempting blocked climbs and hops instead of discovering them by failing three times. Generated levels do **not** move |

Two slices, not three. Making generation's audit clearance-aware was the obvious
third and it is **deliberately not here** — see "Why generation keeps the old
test".

C1 is not tidying. The sweep has to fly **the arc the follower actually flies**,
and those rules are neither obvious nor uniform:

| Edge kind | The arc the follower commits to |
|---|---|
| `jump` (up) | Takeoff stands clear of the destination's footprint, then `{ driveX: v: 0 }` + impulse — the body leaves the ground with **zero** horizontal speed, rises holding that column, and translates only once its feet clear the destination surface |
| `hop` (flat, over a gap) | Full-speed ballistic from the lip toward the landing point |
| `drop` | A grounded walk-off a body width past the lip; gravity finishes it |

A sweep that re-derives these drifts from the follower, and a graph that
disagrees with the body is the bug this spec exists to remove. Duplicating them
in `nav.js` is the cheaper-looking half of that mistake.

**Measured before writing this**, with a throwaway reimplementation of the sweep
over the 19 cases in `test/levelgen-golden.test.mjs` (scratch only — nothing in
`src/` was patched):

| | |
|---|---|
| Edges pruned | **292 of 1332 (21.9%)** — 178 `hop`, 114 `jump`, 0 `drop` |
| Golden cases where the spawn can no longer reach the exit *through swept edges* | **5 of 19** |
| What that means | The generator routinely builds ground slabs split by pillars that also roof their own takeoff. The router is currently walking agents into all of them |

Treat these as an order of magnitude, not a measurement of the real
implementation. The first pass of that harness reported 39.2% and 6 of 19,
and **the difference was two modelling errors this spec now encodes as rules**:
it swept `drop` edges (230 false prunes — see below), and three of its four
iterations were bugs where it failed to reproduce something `navigation.js`
already does. That experience is the argument for C1, and the reason C2 must not
begin before it.

## Reuses

| What | Where | How it is used |
|---|---|---|
| The link test and graph build | `linkBetween`, `buildEdges`, `buildGraph` in `src/game/nav.js` | The clearance gate is a new test at the END of `linkBetween`, after the three cheap ones, so it only runs on edges already accepted |
| The reachability envelope | `jumpEnvelope` in `src/game/gen/reach.js` | The mission-side profile already carries `gravity`, `jumpSpeed` and `runSpeed` (`bodyProfile` in `src/game/nav.js`), so the sweep needs no new physics constants |
| The follower's manoeuvre geometry | `takeoffX`, `landingX`, the `drop` lip choice, the airborne branch, the takeoff window and `drive` in `src/mission/navigation.js` | Moved by C1, then shared. One definition of where a body takes off, what it aims at, and how fast |
| The integrator's step order | `stepActor` in `src/mission/entities.js` | `vy += g·dt`, then x, then y. The sweep matches it so a predicted clip and a real clip agree — the same discipline `duckableShot` uses against `stepProjectile` |
| Strict box overlap | `overlaps` in `src/mission/entities.js` | The collision predicate the real body is resolved against. `nav.js` may not import from `src/mission/`, so C1 is also where a pure copy of this belongs |
| The graph cache and its invalidation | `graphFor` / `invalidateNavGraphs` in `src/mission/navigation.js` | Clearance is baked into the cached graph, so it costs nothing per frame and the Lab's platform drag already drops it |
| Config as the A/B | the `SCHEMA` group "Agent navigation" in `src/game/config.js` | `navClearance` sits beside `navEnabled`, so the old behaviour stays playable and comparable |

## Where the code goes

| Path | What |
|---|---|
| `src/game/nav.js` | The sweep, the manoeuvre-geometry functions C1 lifts, and a pure box-overlap predicate. Stays **pure** — no import from `src/mission/` |
| `src/mission/navigation.js` | Loses its private copies of the lifted geometry and imports them instead |
| `src/game/config.js` | One `SCHEMA` entry, `navClearance`, in the existing "Agent navigation" group |
| `test/nav.test.mjs` | The sweep's cases go here, beside the existing `linkBetween` accept/reject boundary tests — not in a new file. `CLAUDE.md` reserves a new suite for a subsystem nothing tests yet, and this is the same subsystem, same fixtures shape |

Three signature facts a builder hits immediately, none of them optional:

- `linkBetween(na, nb, profile)` and `buildEdges(nodes, profile)` have **no
  platform list**; only `buildGraph` does. Both must take one, and `linkBetween`
  is exported and called directly by `test/nav.test.mjs`.
- `graphFor(scene, profile)` reads `scene.platforms` itself — nothing needs
  passing through from the callers.
- `profileKey` has no clearance term, so a live `navClearance` toggle would hand
  back a stale cached graph. The flag belongs in the key, which is what makes the
  Behavior Lab able to A/B it without a reload.

## The seam

This owns **which edges exist**. It does not own routing, following, or giving up.

| Owns | Does not touch |
|---|---|
| Whether `linkBetween` returns an edge, for `hop` and `jump` | `route`/`costsFrom` — Dijkstra is unchanged, it just gets a smaller graph |
| The canonical arc a body flies for those two kinds | The follower's frame-by-frame decisions in `routeRequest` |
| Where a takeoff and a landing are (C1, shared) | The attempt cap and the ban ledger, which stay exactly as N4 built them |
| — | `auditGeometry` and everything in `src/game/gen/` |

**The cap is not replaced.** Clearance is a static-terrain answer; the cap catches
what static terrain cannot know — another body in the way, a takeoff the follower
approximates, the Behavior Lab dragging a platform under a live graph. A spec
that deleted the cap because the graph got honest would reintroduce the freeze
N4 fixed, in a rarer and harder-to-find form.

**`drop` edges are never swept, deliberately.** A drop sets no `nav.leg`
(`src/mission/navigation.js` returns from the drop branch before the leg is
assigned), so it can never book a failed attempt and can never freeze an agent —
a drop that lands somewhere unintended simply repaths from where it landed. There
is no failure here to prevent, and `design/agent-navigation.md` grants dropping
explicitly. Sweeping them cost 230 edges of pure capability in the first
measurement and bought nothing.

**The shared reachability seam survives.** `test/nav.test.mjs` asserts the audit
and the router share one link test; after C2 they still call the same
`linkBetween`, differing only in whether the platform list is supplied. The
assertion needs its wording widened, not deleting.

## Must not regress

| Suite | What it actually guards |
|---|---|
| `test/navigation.test.mjs` | Route following end to end. **C1's whole justification** — the drop-lip, step-off and takeoff-window cases are what prove the lifted geometry still behaves. It must pass C1 untouched |
| `test/nav.test.mjs` | Node spans, link kinds, costs, and the shared-test seam above |
| `test/levelgen-golden.test.mjs` | Must stay **byte-identical** through both slices. It is the proof that C2 did not reach generation |
| `test/gen.test.mjs` | `traversable`, `unreachable === 0` — untouched, and the reason the deferred slice is safe to defer |
| `test/locomotion-characterization.test.mjs` | Root trajectories to 2e-3. C2 changes which routes exist, so this may legitimately move; regenerate once, deliberately, never as a reflex |
| `test/reposition.test.mjs` | `holdPoint` scores candidates over `costsFrom` on the same graph, so a smaller graph means fewer standing spots. Repositioning must not narrow silently |
| `test/locomotion-intents.test.mjs` | The companion escort outcome over real terrain — the case this whole line of work started from |
| `test/behavior-lab.test.mjs` | The Lab mounts, draws once, disposes. Its Graph overlay draws whatever the graph holds, so pruned edges simply stop being drawn |

**Bo, asked what he would be upset to see break (2026-08-17): companion escort,
combat movement, generated level shapes, and the Behavior Lab** — all four, not a
subset. Each maps onto a suite above: `test/locomotion-intents.test.mjs` for
escort, `test/navigation.test.mjs` + `test/reposition.test.mjs` for chase, the cap
and repositioning, `test/levelgen-golden.test.mjs` for level shapes, and
`test/behavior-lab.test.mjs` for the Lab. Level shapes are the strongest of the
four: C2 is written so that generation cannot be reached at all, and the golden
staying byte-identical is what proves it rather than promises it.

**Four blocks in `test/navigation.test.mjs` assert against edges C2 deletes, and
must be re-anchored rather than fixed.** They pin the attempt cap, which must keep
working for everything clearance cannot see, so they should run with
`navClearance` off:

| Block | What inverts |
|---|---|
| The 40×200 wall, "the attempt cap" | `banned.size === 1` and `blocked === true` — with the edge gone, nothing is ever attempted |
| The same wall, "the cap is a knob" | Same, via `navJumpAttempts = 1` |
| The `PILLAR` fixture, the four N4 cases | `banned.size >= 1` and the reroute that follows it |
| "an unreachable perch is attempted, not refused" | Asserts the deliberate no-clear-takeoff escape hatch — the one place the follower jumps *because* it cannot know better. C2 removes that edge, so the case can no longer reach the behaviour it exists to pin |

## Approximations

| Approximation | Why | What catches the failure |
|---|---|---|
| One canonical arc per edge kind | The follower flies exactly one arc per kind, so that is the honest thing to test. It is **not** the best arc available to a body: a human runs at a pillar and jumps *early*, trading distance for height, and clears hops the router's from-the-lip takeoff cannot | **Nothing automatic, and this is the risk to weigh.** A wrongly pruned edge is invisible — unlike a wrongly offered one, which the cap discovers. The knob is the only backstop, and the failure mode is an agent taking a longer route than it needed. **Accepted by Bo, 2026-08-17: `navClearance` ships ON**, on the grounds that a long way round beats flailing at a wall. Searching several takeoffs per edge was considered and declined as more work than the failure justifies |
| Soldier-locomotor bodies do not fly the modelled arc exactly | Companions accelerate at 2600px/s² (`SOLDIER_TUNING` in `src/mission/entities.js`) where `LEGGED` sets `vx` instantly, so a soldier is slightly slower off the lip than the sweep assumes | Errs **permissive** for soldiers — the sweep predicts them past a corner the real body may clip. That case falls through to the attempt cap, unchanged |
| Fixed `dt` in the sweep, variable `dt` in the mission | The graph is built once and cannot know the frame times it will be flown at. A long frame steps further and can pass through a corner the sweep clipped | The attempt cap. This direction errs strict |
| Takeoff is assumed to be at full horizontal speed for `hop` | Inherited from `tech/agent-navigation.md`, not introduced here | The attempt cap. Generation already ships this assumption |
| Clearance is static terrain only | Other agents, the player and corpses are not obstacles, and a per-agent graph would defeat the profile cache | The attempt cap — exactly the case it was built for |
| The sweep costs graph-build time, not frame time | ~500 candidate pairs on a 23-node graph, each a bounded walk against the platforms overlapping its x-range, once per body profile per mission | Nothing yet. If it shows up, the answer is a broadphase on the platform list, not a cheaper test |

## Why generation keeps the old test

Making `auditGeometry` clearance-aware is the obvious C3 and it is deferred, not
forgotten, for a reason that is not effort:

**`auditGeometry` certifies the PLAYER's route, and the follower's canonical arc
is a strict subset of what a player can fly.** A human approaches at speed, picks
their own takeoff, jumps early and steers; the follower takes off at a lip the
router chose. Handing the audit the follower's arc would cull terrain the player
traverses perfectly well — on the measurement above, roughly a quarter of levels
would start culling structures — and quietly redefine the generator's guarantee
from "the player can finish this level" to "an AI agent can". That is a
player-experience decision, not an engineering one, and it belongs to Bo.

Two facts for whoever picks it up:

- Generation's profile is `{ ...SOLDIER_PROFILE, envelope: env }` in
  `src/game/gen/levelgen.js`, and `SOLDIER_PROFILE` is `{ w, h }` only — no
  `gravity`, `jumpSpeed` or `runSpeed`. Harmless today because the audit only
  calls `reachableFrom`, never `costOf`. A sweep integrating an arc from that
  profile gets `NaN`. Fix the profile before touching the audit.
- When the audit reports no offenders but a level is still not traversable, the
  cull loop in `generateLevel` drops `groups[groups.length - 1]` — blind LIFO,
  unrelated to where the blockage is. That branch has never run: `culled` is 0 on
  every golden case today. A stricter audit is exactly what would exercise it
  first.

Between C2 and that day, the router is honest and the generator is not. That is
strictly better than today, where neither is.

## Why the graph lies today

`linkBetween` gates on three numbers: `dh` against `maxRise`, `maxRunTo(dh)`
returning a usable reach, and the horizontal gap against that reach. Nothing
looks at what is *between* the two spans. For a soldier at the shipping tuning
`flatReach` is 230.4px, so **any pillar narrower than about 200px is linked
across regardless of its height**, and `costOf` prices that hop at 0.72s —
cheaper than any route over the top, so Dijkstra takes it every time.

The failure has been found three times from three directions: the `husk_charger`
on generated seed 2026 (N4), a squadmate pinned beside an inverted L in playtest
(the escort-order note in `tech/agent-navigation.md`), and the measurement above,
which says a fifth of the edges in a shipping level are arcs no body can fly. N4
answered it in the router, on purpose, because a stricter link test moves what
generation culls and that was not that sprint's risk to take. This spec takes the
half of it that does not touch generation at all.
