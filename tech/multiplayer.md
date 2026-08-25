---
type: tech
category: gameplay-systems
status: unbuilt
resolution: sharp
needs: []
related: [multiplayer, multiplayer-state]
---

# Multiplayer

The order the three multiplayer specs land in, and which mockup panel each piece
puts on screen. A map, not a spec — the seven parts for each phase live in that
phase's own file, and only the first of the three is written.

`design/multiplayer.mockup.html` is the mockup this references by section
number. It opens at the top of `design/multiplayer.md` in the design map.

## Phases

| Phase | Spec | Ends with |
|---|---|---|
| 1 | `tech/multiplayer-state.md` | Two people playing a full campaign together in one browser |
| 2 | `tech/multiplayer-session.md` (new) | Two people playing that campaign from different houses |
| 3 | `tech/multiplayer-missions.md` (new) | Two squads on the same level at the same time |

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

Provisional. These slices have no spec yet and will move when one is written.

| Slice | | Mockup |
|---|---|---|
| T1 | The transport seam — `connect` / `send` / `onCommand`, implemented in-process first so the interface is proven before any networking exists | — invisible |
| T2 | The service — a node process serving the static files and holding the authoritative session, with the room in the URL | — |
| T3 | Two browsers, one campaign — real per-client views over the wire | §7 is **deleted** here |
| T4 | Presence and disconnection | §1 the dimmed chip |

T2 is where the repo's "static, no build step" property stops applying to the
multiplayer path. Single-player keeps it.

The first internet playtest is the end of T3. Everything to that point is
turn-boundary JSON, so latency does not matter yet.

## Phase 3 — joint missions

Provisional, as above.

| Slice | | Mockup |
|---|---|---|
| M1 | Determinism — specified on its own in `tech/mission-determinism.md`, which supersedes this row: five draw sites across three modules, and the seeding slice does change the stream the game draws from | — |
| M2 | Squad ownership in the mission — an owner per soldier, and the methods in `src/mission/mission.js` that assume `scene.soldiers` is one squad partitioned by it | §5 the other squads' HUD |
| M3 | Lockstep input — two input streams through `src/mission/input.js`, input delay, and a rolling checksum so divergence is caught rather than mysterious | — |
| M4 | Joint mission resolution — independent squad exits, contested pickups, casualties attributed per owner | **none — see below** |

M1 is independently valuable: a deterministic mission makes every combat bug
reproducible, which is worth having whether or not multiplayer ships. It is the
one slice on this page that can be built today.

## Where this plan is weakest

| | |
|---|---|
| The payoff is last | The thing that makes this feel like a game played *with* someone is phase 3, sitting behind a state refactor and a transport. Nothing can reorder that — ownership needs the session and lockstep needs determinism — but M1 can be pulled forward for a small win |
| M4 has no mockup | The moment another player takes a pickup you were running for is the entire competitive texture of this design, and nothing visualises it. Partly because it is feel rather than UI, which is also why it is the most likely thing to be wrong the first time it is played |
| Two of three specs do not exist | Phases 2 and 3 are named here, not specified. Each needs `/spec` run by whoever is about to build it, and their slice tables above will move when that happens |
