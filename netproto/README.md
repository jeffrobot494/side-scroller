# netproto — does server-authoritative feel good enough?

A standalone 2D versus-shooter built to answer one question: **how does a
client/server game feel when the client predicts nothing?** Every rectangle on
screen, including the one you are driving, is drawn exactly where the last
snapshot from the server put it. Press D and nothing moves until a round trip
completes.

This folder imports nothing from `../src` and nothing imports it. The repo's
committed multiplayer plan (`tech/multiplayer-missions.md`) is deterministic
**lockstep between peers**; this is the competing architecture, built separately
so that comparing the two is comparing two things rather than one thing with a
flag. Deleting the folder leaves no trace.

## Running it

```
node netproto/server.mjs            # http://localhost:8100
PORT=9000 node netproto/server.mjs
```

Open the page in two browser windows. `python3 -m http.server` will **not** work
here — unlike the game, this needs the process.

```
node netproto/smoke.mjs             # starts its own server, drives two clients
```

The smoke test is deliberately **not** in `node test/run.mjs`. This is a probe,
not a subsystem, and the repo's bar should not grow a dependency on a folder
meant to be thrown away. It found both real bugs in the first build.

It starts its **own** server on its own port. An earlier version reused
whatever was on 8100 and collided with a live session — a human in the arena
shooting things is indistinguishable from a broken assertion, so a test that
can be joined is a test that lies.

## Controls

`A`/`D` or arrows run · `Space`/`W` jumps · mouse aims · hold click fires.
100 HP, 10 damage a bullet, 2s respawn. Kills / deaths · fliers downed in the
side panel.

**Fliers** are the red diamonds: 30 HP, patrolling one lane and bobbing on a
sine, shooting the nearest player in range with a little spread so they miss.
Their rounds are red and larger than yours. Platforms stop them, so cover
works. The count is a live server-wide knob, 0 to 12.

They are in here because a duel between two rectangles never tests the half of
the real game that matters most to this question: **dodging fire you can see
coming is where predicting nothing costs the most**, since the dodge does not
begin until the server has heard about it. Two axes of motion at once also
makes them awkward to lead, which is the other thing latency ruins.

## The loop

| | |
|---|---|
| Client | Samples keys and mouse at a fixed 60Hz — **not** per rendered frame — and sends `{seq, l, r, jump, fire, ax, ay}`. Never its position |
| Server | Holds the latest input per player, steps the world at a fixed 60Hz, resolves movement, fliers, bullets, damage, respawn |
| Server | Broadcasts a snapshot every N steps (5–60Hz, live knob), carrying every player, every flier, every bullet, and each client's own `ack` |
| Client | Draws that snapshot verbatim and nothing else |

Aim crosses the wire as a **point**, not an angle, so the server derives a
direction the world can actually produce. Velocity is deliberately never sent —
a client with no prediction has no use for it, and shipping it would quietly
make prediction possible and blur what is being measured.

## Reading the instruments

The number the folder exists to produce is **input → pixels**: the time from
sending an input packet to seeing a snapshot that acknowledges it. That is the
real cost of the architecture, and it is what the sparkline along the bottom of
the arena plots.

| Readout | Means |
|---|---|
| `rtt` | Round trip, from ping/pong. The floor |
| `input→pixels` | Press to visible result. **The one that matters** — round trip plus the wait for the next snapshot |
| `snap gap avg / max` | Actual delivery cadence. The gap between avg and max is jitter you can feel |
| `snap size`, `down`, `up` | Bandwidth. The flier knob is the fastest way to move it: roughly 260B empty, 520B at 3 fliers, 775B at 12 |
| `dropped` | Packets the loss knob threw away |

**Lag is one way.** 60ms on the slider is a 120ms round trip. Jitter reorders
packets on purpose — real networks do, and a snapshot older than the one on
screen is discarded rather than drawn.

Rough calibration: same-city ≈ 20–40ms one way, cross-country ≈ 50–80ms,
transatlantic ≈ 80–120ms. Try each with snapshots at 20Hz and again at 60Hz.

## What it does not do, and why

| | |
|---|---|
| No prediction | The point. Adding it would answer a different question |
| No interpolation | Raw snapshots first, so the architecture's cost is visible before a technique hides it. A toggle comes later, to A/B in one session |
| No determinism | A single authority never needs two machines to agree. Importing lockstep's cost into the design that exists to avoid it would be self-defeating |
| One room, no matchmaking | One process, one arena |
| Fliers do not lead their shots | They aim where you are, not where you are going. Leading would make them harder in a way that says nothing about latency, and being able to outrun a round is the behaviour worth feeling |
| Latency simulated client-side | Each browser has its own knobs, which is also how you test an unfair match |

## Two bugs the smoke test found immediately

Both would have been invisible on localhost with no instrumentation, and both
are the kind that get blamed on "the network" later.

| | |
|---|---|
| **Events died between broadcasts** | `world.events` is cleared every 60Hz step, but snapshots go out at 20Hz — two of every three hits and kills were dropped before anyone saw them. The server now accumulates events across the gap and flushes them with the send |
| **Disconnects leaked players** | `Conn.close()` set `open = false`, and the socket's own `close` handler then returned early without firing `onclose`. Every closed tab left a ghost rectangle standing in the arena forever. `open` (may write) and `notified` (owner told) are now two flags |

## Status

| | |
|---|---|
| P0 | The wire — zero-dep WebSocket, fixed-step loop, lag/jitter/loss lab, latency readouts. **Built.** Measured 20.0Hz and 60.0Hz snapshot cadence against a 59.6Hz sim |
| P1 | Server-authoritative movement — run, jump, gravity, platforms. **Built** |
| P2 | Mouse aim, bullets, damage, death, respawn. **Built** |
| P3 | Multiple players, join/leave, scoreboard. **Built** |
| P3.5 | Flying enemies — patrol, bob, shoot back; a live count knob that doubles as a bandwidth-vs-entity-count dial. **Built** |
| P4 | Snapshot-rate sweep, optional remote interpolation toggle, written findings against the lockstep plan. **Not started** |
