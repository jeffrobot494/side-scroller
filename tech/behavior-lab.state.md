---
type: state
category: development-tools
status: building
resolution: sharp
sprint: 2026-08
tags: [editor, ai, tools]
---

# Behavior Lab

The agent observatory — an editor tool for watching agents decide. This page is
state, not design.

## Now

Version 1 exists (`src/editor/tools/behavior-lab.js`) and works, but is too
complex to reason about, which is the whole failure: a tool for understanding
agents that is itself hard to understand.

What it has: two authorable teams on a generated level, blue driven by
`updateCompanionSpec` and red by `updateSpecEnemy`; pause / step-frame /
step-decision / 0.25× / 1× / 3×; follow and fit cameras; overlays for line of
sight, preferred-range rings, move orders, dash vectors, last-seen markers and
the ground probe; an inspector rail with the live `sense.*` grid, the utility
scoreboard, and the commitment strip; four config levers in an "Agent brain"
group.

It was built before anyone had watched a single agent navigate anywhere — the
features were designed against imagined use. Covered by
`test/behavior-lab.test.mjs`.

## This sprint (2026-08)

**Replaced, not extended.** Version 2 is built from scratch at a much smaller
scope:

- a randomly generated level (reuse `generateLevel` + `loadMission`)
- one agent
- click anywhere to set that point as its goal
- watch it get there
- the nav graph and the agent's current route drawn as overlays

Nothing else. No combat, no teams, no rosters, no scoreboards, no config levers.
Every v1 feature returns one at a time, later, each earning its place against a
real question it answers.

Model it on `src/editor/tools/firing-room.js`, which already sets up a canvas
arena and a mission-style loop. Register as usual: `TOOLS` entry, `MOUNTABLE`,
factory map, one synchronous `draw()` at mount, `dispose()` cancels the rAF loop.

Open decision at review: delete v1, or keep it as a second tool.

## Log

*One entry per sprint, written at review. Append-only.*
