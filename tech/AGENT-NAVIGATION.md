---
type: tech
category: artificial-intelligence
status: unbuilt
resolution: sharp
tags: [ai, movement, navigation]
---

# Agent navigation

How the baseline agent gets somewhere. What it does: `design/agent-navigation.md`.
Everything beyond a given destination: `idea/advanced-agent-navigation.md`.

## What agents perceive today

| Fact | Source |
|---|---|
| Is a wall between me and my target | Line-of-sight segment test |
| Is there floor under my front foot | A single 8px probe |
| Is my target >40px above or below | Vertical band check |

That is the whole picture. Every behaviour is expressed relative to the target,
so a grounded enemy chasing someone on a ledge walks to the spot underneath and
stays there. Not stuck: doing exactly what it was told.

## The nav graph

| | |
|---|---|
| Nodes | Standable surfaces, not platforms. A crate splits a ground slab into two |
| Edges | Directed moves: jump up, jump across, walk off and fall |
| Cost | Seconds — the design asks for least-time routing |
| Per body | Nodes come from geometry; edges come from who is asking |
| Built | Once at level load. Nothing in the terrain moves |
| Flyers | No graph. They already move in two dimensions |

Edges are directed because dropping off a ledge is often one-way. Without that,
a route can plan "drop to C, climb back to A" — a move that does not exist.

## The soldier envelope already exists

The baseline agent is a soldier, and `src/game/gen/reach.js` `jumpEnvelope()` is
already built from `config.gravity` / `jumpSpeed` / `runSpeed` — a soldier's
values. `levelgen` uses the same envelope and the same body size (30×46) to prove
every generated level is traversable.

So the graph and the level generator compute the same thing from the same
numbers. If they disagree, one is wrong and it is detectable — which is why
`auditGeometry` should be refactored onto the shared graph rather than kept as a
second implementation.

## The one locomotor change

Both grounded bodies currently *guess* when a steering intent implies a jump:

| Body | Guess |
|---|---|
| Legged | Hops when a `driveX` request carries `hopToward` >40px above. Only `chase` emits those |
| Soldier | Hops when a steer point is >60px above (`wantHop`) |
| Legged, given `steer` | Ignores vertical entirely |

With a graph the brain knows the takeoff point, so the guess is replaced by an
instruction: `driveX` gains an explicit `hop: true`. `hopToward` stays for
`chase`.

The soldier is the least broken body today — it does jump on steering intents —
but it still will not jump for a horizontal gap, because 60px-above is the only
trigger.

## Route following

| | |
|---|---|
| Input | A destination point |
| Resolve | Nearest node to the point |
| Route | Least-time path through the graph |
| Unreachable | Route to the far end of the best partial path, then stop |
| Output per frame | The existing requests — `driveX` to the next waypoint, `driveX { hop }` at a takeoff |
| New destination | Recompute immediately |
| Failed jump | Repath from where it landed; after 3 attempts on one edge, stop |

Detection of a failed jump is cheap: the agent was traversing A→B and is now
grounded somewhere that is not B.

## Slices

| # | Slice | |
|---|---|---|
| N1 | The graph | Nodes, edge kinds, the soldier envelope, precomputed least-time routes, golden fixture. Then refactor `levelgen`'s `auditGeometry` onto it. *No runtime change* |
| N2 | Route following | Destination → nearest node → route → per-frame requests, plus the `driveX { hop }` instruction, the partial-path fallback, and the 3-attempt cap |

The Behavior Lab is how N2 is evaluated — see `sprints/2026-08.md`.
