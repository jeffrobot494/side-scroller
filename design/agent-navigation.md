---
type: design
category: artificial-intelligence
status: unbuilt
resolution: sharp
sprint: 2026-08
---

# Agent navigation

The baseline agent that can navigate terrain.

## Behaviour

| | |
|---|---|
| Body | A soldier |
| Input | A target position |
| Does | Moves and jumps along the shortest path, using a node graph of the level geometry |
| Unreachable target | Gets as close as it can, then stops |

## Rules

| Question | Answer |
|---|---|
| The target is a pixel; nodes are surfaces | Use the nearest surface/node to the click |
| Shortest by what measure | Least time |
| How close is "as close as it can" | The far end of the best partial path |
| Dropping off a ledge | Allowed. Recorded as one-way in the graph, so a route never plans a climb that does not exist |
| A new target arrives mid-route | Recompute immediately |
| A jump fails | Repath from wherever it landed |
| The same jump keeps failing | After 3 attempts on one edge, treat the target as unreachable and stop |

## Not in this

| | |
|---|---|
| Combat | Anything to do with fighting |
| Choosing its own destination | The destination is given, not decided |
| Objectives, tasks, states | Not needed — one target at a time |
