---
type: tech
category: gameplay-systems
status: unbuilt
resolution: sharp
needs: []
related: [multiplayer, multiplayer-state]
---

# Multiplayer

The order the multiplayer specs land in, and which mockup panel each piece puts
on screen. A map, not a spec — the seven parts live in each phase's own file, and
all three phases now have one.

`design/multiplayer.mockup.html` is the mockup this references by section
number. It opens at the top of `design/multiplayer.md` in the design map.

## Phases

| Phase | Spec | Ends with |
|---|---|---|
| 1 | `tech/multiplayer-state.md` | Two people playing a full campaign together in one browser |
| 2 | `tech/multiplayer-session.md` (the seam) · `tech/multiplayer-service.md` (the process) | Two people playing that campaign from different houses |
| 3 | `tech/multiplayer-missions.md` | Two squads on the same level at the same time |

Nothing in phase 2 can start before phase 1 lands, and phase 3 needs both. The
one exception is M1, which depends on nothing and can land whenever.

## Phase 1 — the shared campaign

Seven slices, S1 to S7, specified in `tech/multiplayer-state.md`. That document
is the source of truth for what each contains; this table exists only to pair
them with the mockup.

| Slice | | Mockup |
|---|---|---|
| S1 | The session seam | — invisible by nature |
| S2 | Two players in one session | §7 hot-seat switcher |
| S3 | Recruit pools | — Barracks looks the same with a shorter list |
| S4 | The ready gate | §1 top bar and task force strip |
| S5 | The deploy commit | §3 commitment notice · §4 "Elsewhere today" |
| S6 | Lead visibility and disclosure | §2 Operations |
| S7 | The finale | §6 the three end states |

Everything here runs in one page. No transport exists, and the campaign is
playable and tunable throughout.

## Phase 2 — the transport

Every row below is superseded by a spec. `tech/multiplayer-session.md` owns T1
(as W1–W3, built); `tech/multiplayer-service.md` owns T2–T4 (as V1–V4). Those
documents are the source of truth for what each contains, and both re-cut the
rows they replaced.

| Slice | | Spec | Mockup |
|---|---|---|---|
| T1 | The transport seam — the page holds a client per seat, commands answer through a callback, the round is pushed and projected, and a view is a per-seat snapshot | `tech/multiplayer-session.md` W1–W3 | — invisible |
| T2 | The service — a node process holding the authoritative session, with the room in the URL | `tech/multiplayer-service.md` V1–V2 | — |
| T3 | Two browsers, one campaign | `tech/multiplayer-service.md` V3 | §7 is hidden in a room, not yet deleted |
| T4 | Presence and disconnection | `tech/multiplayer-service.md` V4 | §1 the dimmed chip |

**T2 and T3 were not separable as written** — a session in another process is
unreachable without a wire, so there is no order in which the first is true and
the second is not. What is separable is the service existing and being driven by
a suite from a browser talking to it, which is the V1/V2 cut.

T2 is where the repo's "static, no build step" property stops applying to the
multiplayer path. Single-player keeps it.

The first internet playtest is the end of T3. Everything to that point is
turn-boundary JSON, so latency does not matter yet.

## Phase 3 — joint missions

Superseded by `tech/multiplayer-missions.md`, which owns these rows as J0–J6 and
re-cut them four ways: **M4 was not a slice** (contested pickups already work by
first touch; independent exits is the only weight in it), **the checksum moved to
the front and asks a different question** (stream-consumption order, answerable
in one process, not floating point), **the campaign side was missing entirely**
(two results for one lead is a corruption that already exists), and **the
dispatch has to change** — a client cannot simulate a squad it was never sent.

| Slice | | Mockup |
|---|---|---|
| M1 | Determinism — **built**. Specified and recorded in `tech/mission-determinism.md`, which supersedes this row: a mission replays from its seed given the same input trace at a fixed step | — |
| M2 | Squad ownership in the mission — an owner per soldier, and the methods in `src/mission/mission.js` that assume `scene.soldiers` is one squad partitioned by it | §5 the other squads' HUD |
| M3 | Lockstep input — two input streams through `src/mission/input.js`, input delay, and a rolling checksum so divergence is caught rather than mysterious | — |
| M4 | Joint mission resolution — independent squad exits, contested pickups, casualties attributed per owner | **none — see below** |

M1 is independently valuable: a deterministic mission makes every combat bug
reproducible, which is worth having whether or not multiplayer ships. It was the
one slice on this page that could be built without the other two phases, and it
was — M3 inherits a seeded mission and a golden, and owes the two things
determinism alone does not buy: input sampling decoupled from frame rate, and a
rolling checksum for cross-machine divergence.

## Where this plan is weakest

| | |
|---|---|
| The payoff is last | The thing that makes this feel like a game played *with* someone is phase 3, sitting behind a state refactor and a transport. Nothing can reorder that — ownership needs the session and lockstep needs determinism — but M1 was pulled forward for a small win, and has landed |
| M4 has no mockup | The moment another player takes a pickup you were running for is the entire competitive texture of this design, and nothing visualises it. Partly because it is feel rather than UI, which is also why it is the most likely thing to be wrong the first time it is played |
| Lockstep is assumed, not established | Phase 3's last slice needs two browsers to agree bit-for-bit, and `tech/mission-determinism.md` compares its own golden with a tolerance because floating-point results are implementation-defined. `tech/multiplayer-missions.md` J3 is the probe that answers it, and it is deliberately early — but until it runs, the end of this plan rests on an untested assumption |
| The alternative is no longer hypothetical | A **server-authoritative** prototype — client sends inputs, server owns the world, client draws snapshots and predicts nothing — was built standalone in `netproto/` and deployed. Measured: the architecture's own cost is ~33ms at 20Hz snapshots and ~16ms at 60Hz (a round trip, plus a step wait, plus half a send interval); it plays well at ~35ms RTT and is unplayable at 210ms; and one process owns a match, so it cannot scale horizontally without sticky routing. Findings and the trade table are in `netproto/README.md`. **Nothing on this page is superseded** — the two have never been compared under one workload, and which ships is undecided |
