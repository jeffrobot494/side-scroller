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

## Addendum: awareness of obstructed paths

Agents account for solid level geometry along their movement, including the space their whole body needs during a jump.

| Situation | Behaviour |
|---|---|
| A column or wall blocks a direct hop | The agent chooses a clear route over or around it without first attempting to jump through it |
| A ceiling or overhang blocks a jump | The agent excludes that jump even when the landing surface is within reach |
| A gap admits one body but not another | Each agent uses routes that accommodate its own body size and movement capability |
| Several clear routes reach the target | Choose the route with the least travel time, even when the direct route is obstructed |
| All routes to the target are obstructed | Get as close as possible along a clear route, then stop |
| An attempted jump still fails | Repath from the landing position; after 3 failures on the same connection, avoid that connection and try another route. Stop at the closest reachable position only when no route to the target remains |

The failed-jump rule above supersedes the earlier rule that repeated failure on one edge makes the whole target unreachable.

### Scope

| Included | Outside this addendum |
|---|---|
| Awareness of static solid terrain, including columns, walls, ceilings and overhangs | Avoiding other agents, the player, corpses or moving obstacles |
| Clearance for hops and upward jumps along the movement the agent performs | New movement abilities or a search for every jump a human player could perform |
| Navigation by grounded agents toward an assigned destination | Flying navigation, destination selection and changes to generated level layouts |

### Observable outcomes

- An agent sent across a column takes an available clear route without repeatedly jumping into the column.
- A reachable landing surface beneath a low ceiling is approached by another clear route, or treated as unreachable if none exists.
- A jump that clears a column with the agent's whole body remains usable; the presence of a column alone does not forbid crossing it.
- Existing clear routes remain usable, and dropping off ledges remains allowed.
