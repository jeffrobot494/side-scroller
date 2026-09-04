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

**Getting around.** A jump rises 136px, which clears the floor-to-shelf step
(120px) and the shelf-to-middle step (100px). The two `y=190` shelves sit 190px
above anything below them and **cannot be reached** — they are flier territory,
not a route. Platforms are solid rather than one-way, so a jump taken too close
to a shelf bonks its underside: the landing window on the lowest shelf is a
running jump started 88–140px before the edge.

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

## Deploying it (P4)

The point of a deploy is to replace the simulated path with a real one. Three
things make that measurement honest, and they are already in:

| | |
|---|---|
| The lag sliders start at **zero** off localhost | Simulated lag on top of real lag is a number that means nothing. They also persist under a separate key per path kind, so yesterday's 60ms on localhost cannot poison a run against Frankfurt |
| Every snapshot carries **host health** | `hz`, `late` and `sat` — the server's own loop, not the network. Shared-CPU hosts deschedule processes, and a hitch from that looks exactly like a network problem. **If `late` is large, nothing else in the readout means anything yet.** The HUD turns it red |
| `?server=wss://host` | Points one page at another deployment, so regions can be compared without redeploying the client |

`GET /health` returns one JSON line — clients, tick, `hz`/`late`/`sat`, uptime,
and the host's own `RAILWAY_*` / `FLY_*` / `RENDER_*` environment (names only,
credentials filtered) — so several deployments can be compared with curl instead
of a tab each.

**`host.RAILWAY_REPLICA_REGION` is the one to read first**, because distance is
the dominant term in every other number on the page.

It is also a standing correction. A first run from Austin against
`us-east4-eqdc4a` (Ashburn) measured a **203ms RTT floor** where the physical
path is ~2,000km and should floor near 40ms. The obvious inference — that the
container was not really in Virginia — was **wrong**, and the endpoint above is
what disproved it. The inference assumed packets travel from the player to the
container, and on a PaaS they do not: traffic enters the provider's edge and is
backhauled. A correct region and a 200ms RTT are not in conflict, so a region
check confirms one variable rather than explaining a number.

### Railway

`netproto/` carries its own `package.json` and no dependencies, so:

1. **New service** in the Railway project, from this repo, on the `netproto`
   branch.
2. **Root Directory** → `netproto`. That is the whole configuration — nixpacks
   finds `package.json`, `npm start` runs `node server.mjs`, and `$PORT` is
   already honoured.
3. Pick a **region** deliberately, and note which one. It is the dominant term
   in every number you are about to read.

It must be its **own service**: the repo root's `npm start` is the game's room
service (`tech/multiplayer-service.md`), and only one process can hold `$PORT`.

`wss://` needs no work — the client derives the scheme from `location.protocol`,
and Railway terminates TLS and proxies the upgrade.

### Fly

`fly.toml` and `Dockerfile` are in this folder; the same image runs on both
hosts so a build difference cannot get inside the comparison.

    cd netproto
    fly apps create <name> --org personal
    fly deploy --remote-only
    fly scale count 1          # SEE BELOW

**One machine, always.** The world lives in the process's memory, so a second
machine is a second arena — two players get balanced onto different hosts, each
sees an empty room, and they never meet. Fly's first deploy creates an HA pair
by default and it has to be scaled back down. `min_machines_running = 0` in
`fly.toml` stops it recurring, and `auto_stop_machines = "off"` is what keeps
the single machine alive.

This is worth reading as a finding rather than a config note: **a
server-authoritative game cannot be scaled horizontally without sticky routing
or shared state.** One process owns a match. Adding capacity means routing
players to the right process, not adding processes.

**Shutting it down: `fly scale count 0`, not `fly machine stop`.**
`auto_stop_machines = "off"` means the machine never sleeps, so it bills until
something destroys it — and `auto_start_machines = true` means a stopped machine
is restarted by the *next request*, including a scanner hitting the public
hostname. A `machine stop` reports success and the app is up again seconds
later; it was a curl checking the stop had worked that restarted it here.
Scaling to zero leaves the app, the hostname and this config in place, and
`fly scale count 1` brings it back.

### Measured, Austin to each host

Same command, same minute, `curl -w %{time_connect}`:

| Host | Region | connect |
|---|---|---|
| Fly | `dfw` Dallas | **26ms** |
| AWS (control) | `us-east-1` Ashburn | 56ms |
| Railway | `us-east4` Ashburn | **186ms** |

Railway and AWS are in the same metro and differ by 130ms, so that gap is the
provider's edge rather than distance. The container's region was confirmed
correct via `/health` before this was concluded.

### Reading a cross-region run

| Watch for | Because |
|---|---|
| `host late` first, always | Rule the host out before believing anything about the path |
| `rtt min` vs `rtt max` | The min is the physical floor; the spread is the proxy, the wifi and the queue |
| `input→pixels` against `rtt` | The difference is the snapshot wait. At 20Hz it is up to 50ms of pure architecture, and it is the part a faster network cannot fix |
| `snap gap max` | A proxy that buffers shows up here and nowhere else |

The one comparison worth making deliberately: **the same region at 20Hz and at
60Hz**. Latency you cannot change; the snapshot wait you can, and it is the
cheapest lever in the whole design.

## Status

| | |
|---|---|
| P0 | The wire — zero-dep WebSocket, fixed-step loop, lag/jitter/loss lab, latency readouts. **Built.** Measured 20.0Hz and 60.0Hz snapshot cadence against a 59.6Hz sim |
| P1 | Server-authoritative movement — run, jump, gravity, platforms. **Built** |
| P2 | Mouse aim, bullets, damage, death, respawn. **Built** |
| P3 | Multiple players, join/leave, scoreboard. **Built** |
| P3.5 | Flying enemies — patrol, bob, shoot back; a live count knob that doubles as a bandwidth-vs-entity-count dial. **Built** |
| P4 | **Real deployment.** Honest defaults off localhost, host-health instrumentation, `?server=` override, `/health`, own `package.json`. **Built — the deploy itself is Bo's to run** |
| P5 | Optional remote interpolation toggle, and the written findings against the lockstep plan. Deliberately after a real run: what the numbers show should decide what P5 measures |
