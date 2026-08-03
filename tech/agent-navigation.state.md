---
type: state
category: artificial-intelligence
status: building
resolution: sharp
sprint: 2026-08
tags: [ai, movement, navigation]
---

# Agent navigation

Design: `tech/agent-navigation.md`. This page is state, not design — what the
system does today, what changes this sprint, and what each past sprint taught.

## Now

Nothing in the game reasons about space.

An agent's entire model of the level is three facts: whether a wall blocks line
of sight to its target, whether there is floor under an 8px probe past its front
foot, and whether its target is more than 40px above or below. Every movement
behavior is expressed relative to the target — close the distance, hold a range,
go where I last saw you.

Movement arbitration is: an active dash wins, else an active move order, else a
standing motion controller (one of ten: chase, keepDistance, patrol, hover, …).
The standing controller is always target-relative, so agents are permanently in
engage mode; when nothing is visible they idle in place.

Vertical movement is guessed, inconsistently. The `chase` controller hops when
its target is >40px above. The soldier locomotor hops when a steering point is
>60px above. A legged body given a steering intent ignores vertical entirely —
so a ground enemy told to move to a point on a ledge walks underneath it and
stays there. Nothing can instruct a body to jump.

Flying bodies steer in both axes and so do not suffer any of this.

## This sprint (2026-08)

Target by Aug 31:

- `src/game/nav.js` — standable-segment nodes, directed edges (jump / hop / drop)
  with second-costs, per-body envelopes, precomputed all-pairs routes. Built once
  at level load. Pure and headless-testable.
- Spatial `sense.*` keys on the existing perception cadence: my node, target
  node, same-surface, hops and seconds to reach, next edge kind, gap ahead,
  unreachable.
- `objective` (authored spawn field: `hunt` / `advance` / `guard`) and `task`
  (runtime, completes: `travel` / `engage` / `search` / `hold`).
- Destination selection for `travel`, route following, and an explicit "jump now"
  instruction replacing both locomotor guesses.
- Fallback: no graph, off-graph, or no path degrades to today's steering. Plus a
  stuck detector that trips to direct steering after ~1.5s of no progress.
- All six built-in enemy specs navigating in real missions.
- Companion escort by navigation instead of pressing toward the leader.
- `levelgen`'s `auditGeometry` refactored onto the shared graph, guarded by
  `test/gen.test.mjs`.

Not this sprint: destination scoring under combat weights (`engage`). Out because
it is a second large design surface with its own tuning loop, not because of
effort — see the sprint page.

## Log

*One entry per sprint, written at review. Append-only.*
