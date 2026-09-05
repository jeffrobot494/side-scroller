---
type: tech
category: gameplay-systems
status: building
resolution: sharp
needs: [multiplayer-state, multiplayer-session, multiplayer-service, mission-determinism]
related: [multiplayer, multiplayer-state, multiplayer-session, multiplayer-service, mission-determinism, campaign-pacing]
tags: [multiplayer, mission, server-authoritative]
---

# Multiplayer missions

Two squads on one level. The campaign has been shared since Phase 1 and the
transport since Phase 2; this is the phase that changes `src/mission/`, and the
only one where two people are in the same place at the same time.

## Slices

| # | Slice | Changes runtime behaviour |
|---|---|---|
| **J0** | **The divergence probe, and it answers a cheaper question than the plan asked.** Two clients running one lockstep mission must consume the mission's single seeded stream in the same order — and they cannot today, for a reason that is nothing to do with floating point: `scene.rng` is drawn by weapon spread and the duck roll in `src/mission/ai.js` and by every lazily-built companion agent, the controlled soldier takes none of those paths, and **which soldier is controlled differs per client by construction**. That is testable **headlessly, in one process**: run one scene twice with a different soldier controlled and compare. Only if that passes is the cross-machine floating-point question worth asking. A rolling checksum is the instrument for both | No — it observes |
| **J1** | **A soldier has an owner, and "the squad" stops meaning `scene.soldiers`.** One field, from the dispatch that put it there, and then eleven sites partition by it — listed in Background, because the list IS the slice. The one that is not obvious: `_updateSoldiers` picks `leader = this.currentSoldier()` and hands it to every companion, so ownership decides who is player-driven and who each AI squadmate escorts. At one owner every partition is the whole array | No. One owner is today's game, and `test/mission-golden.test.mjs` is what says so |
| **J2** | **Ends are independent, and an extracted squad LEAVES the scene.** Reaching the exit resolves **that owner's** mission and their soldiers are spliced out of `scene.soldiers`; the scene keeps running for everyone still on it. Removal is the mechanism, not a flag: "the squad leaves" means it does not fire, does not collide, does not win `_updateLoot`'s race, is not drawn and is not a target, and taking it out of the array is all five at once rather than five guards to write and one to forget. **The blocker is `this.control`, which maps owner → INDEX** (`src/mission/mission.js`), so a splice shifts every other commander's control onto the wrong soldier — it keys by soldier id instead, which is what an index into a mutable array should have been anyway. `_swapControl` already rescans for its owner each call and needs only the same change. **It also fixes the losing branch J1 narrowed** — see below — and a resolved owner must be skipped by `_checkOutcome`, whose `livingSoldiers(owner)` would otherwise read an empty squad as wiped. **A commander who finishes returns to base** (Bo): their `onComplete` fires, they get their results screen, and they wait for nobody. `src/main.js` fires `onComplete` per owner; who keeps stepping the scene afterwards is J8's, because before J8 there is no simulation anywhere but this page | Yes, visibly: a mission no longer ends when the first soldier reaches the exit while somebody else is still fighting |
| **J3** | **The campaign accepts two results for one lead, under one rule: the MISSION decides world consequences, not the commander, and there is only one mission.** (Bo, transcribed.) So a joint clear pays `threatReward` once, a joint failure charges doom once, and `cleared` increments once — while everything a commander earns stays per-commander. The table under "What is per mission and what is per commander" is that rule applied field by field. Today the code gets it wrong in both directions at once, which is why neither current behaviour is evidence of intent. The mechanics are unambiguous even where the rule is not, and this is not a joint-mission nicety — it is a live corruption. Two dispatches on one lead carry the same `missionId`; `applyMissionResult` removes the lead from the shared board on the first report, so the second finds no `mission` and silently gets no `threatReward`, no log line, no `highWins`, no `winsCampaign`, and on a failure neither the health penalty nor `outcome = "lost"` — while `state.cleared` increments **twice**, because that line is not guarded by the lookup | Yes, and it fixes a bug that already exists whenever two commanders pick the same lead |
| **J4** | **Input sampling leaves the frame rate.** `_frame` polls input once per *rendered* frame then steps the sim a variable number of times, so the same physical inputs at a different frame rate are a different mission. `tech/mission-determinism.md` approximation 1, named there as "its own change and is not in this spec" | Yes, and it is the one slice that could change how the game feels to a solo player. See Approximations |
| **J5** | **A dispatch knows it is joint, and carries an owner.** Two commanders on one lead produce two dispatches that never learn of each other: `closeRound` emits them independently and `src/net/rooms.js` pushes each only to its own seat. The pairing crosses the seam — and so does the **owner**, which `projectDispatch` does not emit today, so a joint dispatch's soldiers would arrive owner-less and every J1 partition would collapse back to one squad. Turn-boundary only; no mission code | Yes — a room can pair two dispatches. Nothing plays jointly |
| **J6** | **The mission runs without a browser.** `Mission.start()` calls `this.input.enable(canvas)` and `requestAnimationFrame`, both unguarded, so in bare node it throws `window is not defined` — the golden only works because `test/run.mjs` calls `installDom()` globally before any suite. A host-free construction path: no DOM globals, no rAF loop, input injected rather than device-bound. Verified by a suite that constructs a Mission **with the harness deliberately not installed** | No. The browser path is unchanged; this is the door the server needs |
| **J7** | **Input goes per owner.** One `Mission` today has one input and one piloted soldier: `_updateSoldiers` pilots `leaders.get(this.owner)` alone, `_handleControl` reads `justPressed("swap")` for `this.owner` alone, and `_applyAim` resolves a mouse position against `this.camera` and `this._zoom()` — one viewer's frame. Stepping a scene off two seats needs an input per owner, a swap per owner, and aim that arrives already in world coordinates. **The largest mission-side change in the phase, and the previous draft assigned it to nobody** | No at one owner. It is what makes two possible |
| **J8** | **The room holds the mission and broadcasts it.** `server.mjs` steps a headless `Mission` at a fixed 60Hz off each seat's latest input and sends each seat **its own** snapshot; the page sends input at a fixed rate and draws what comes back. No prediction, no interpolation, no local simulation. Both `missionResult` commands are sent by the room, one per dispatch id, because the room is what holds the results. **A seat that resolves goes back to base and stops receiving snapshots; the room keeps stepping for whoever is left**, which is the design's rule and is only possible once the simulation is not the leaving player's page | Yes. The design's decision 5, and the first time anybody plays *with* somebody |

**J0 lands first and depends on nothing** — it is a suite and a pure function,
and it decided the architecture: see "Why the network half is not lockstep".
J1→J2→J3 is the mission and campaign half and is worth having under any
architecture; J1 is built. J4→J8 is the network half, and J4 is now shared
ground rather than a lockstep prerequisite — a server stepping a mission needs
input decoupled from a frame rate for the same reason a peer did.

**J6 and J7 were not in the previous draft at all.** It claimed the server-side
simulation was free because `test/mission-golden.test.mjs` already drives a real
`Mission` headlessly. It does — but only under `installDom()`, which
`test/run.mjs` applies to every suite before any of them run. In a bare node
process `Mission.start()` throws on `window`, then on `requestAnimationFrame`.
And `test/session.test.mjs` source-scans `src/net/rooms.js` for exactly those
globals, so the room may not be handed stubs to get around it. Two slices, found
by running it rather than by reading the golden.

**J0 is built, and it failed — which is the answer it existed to get.**
`test/mission-divergence.test.mjs` runs one mission twice, changing nothing but
which soldier is controlled (`m.control`, a Map of owner → index since J1), and
reports:

| | |
|---|---|
| First diverging step | **Frame 1**, at `soldiers[0].x` (120.722 → 119.278) |
| First diverging draw count | **Frame 1**, 7 draws against 12 |

The second row is the fatal one. The two runs are not merely moving different
bodies — they have consumed the one mulberry32 a different number of times
before the first step is over, so from frame 1 every subsequent draw on one
client is a different number than on the other, and no amount of exchanging
inputs repairs it. The gap is 5, which is one scattergun trigger pull: the
player path draws spread per pellet and the soldier under the trace is a
different soldier with a different weapon.

**Consequence for the phase order, as recorded when lockstep was still the
plan: J1 is a prerequisite for it, not only for credit.** Kept because it is why
J1 shipped when it did, and because the owner axis it argued for turned out to be
needed under the architecture that replaced it too. J6 cannot be "hand both clients the seed and let them run" until
every player-driven soldier takes the player path on BOTH clients, which is
exactly what the owner axis buys. The probe stays green after J1 — it drives one
input source, so the two runs still put different bodies under it; what J1 earns
is a second probe driving two owners with two traces, and *that* one going quiet
is the precondition for J6.

**The second half is built as a pair of pages, and its result is what ended
lockstep.** `test/float-probe.html` runs the real mission off the extracted
trace (`test/mission-trace.mjs`) and prints one fingerprint;
`test/float-probe-standalone.html` drives six functions — `sin`, `cos`,
`atan2`, `hypot`, `tan`, and `sqrt` and plain arithmetic as controls — from
`file://`, with no imports. Neither is in `node test/run.mjs` —
they are browsers, and the bar is node.

| Engine | Standalone fingerprint | |
|---|---|---|
| Chrome 151, Win64 | `550A0098` | |
| Chrome 152, Win64 | `550A0098` | agrees |
| node 22 / V8 12.4 | differs on `sin`, `cos`, `atan2` and `tan`; `hypot` matched | **disagrees** |

The `sqrt` and arithmetic controls matched everywhere, so the comparison is
sound and the disagreement is the math library rather than the harness. **The
browser figures were read off two screens and are not reproducible from this
tree** — only node's are recorded, in commit `272a400`. That is inherent to
measuring a browser, and it is why the pages stay in the repo. Two
adjacent Chrome versions agreeing is the good news; **V8 disagreeing with an
older V8 is the finding**, because it means the transcendentals change across
releases. A lockstep game is then correct until a Chrome update nobody in this
repo controls, on a schedule nobody here sets, with no way to test the version
that has not shipped. That is not a bug to fix — it is a dependency on a third
party's release notes.

## Why the network half is not lockstep

J0 was built to find out whether lockstep was possible. Both halves answered,
and the second one decided it.

| | |
|---|---|
| Half one | Two clients cannot consume one seeded stream in the same order. **Fixable** — that is what J1's owner axis buys, and J1 shipped |
| Half two | Two V8 versions do not agree on `sin`/`cos`/`atan2`/`tan`. **Not fixable here**, except by replacing every transcendental in the simulation path with our own |

**And the alternative stopped being hypothetical.** `netproto/` is a standalone
server-authoritative versus-shooter, built and deployed to measure how a client
that predicts *nothing* feels. `netproto/README.md` holds the instrument
readings; two of them decided this:

| | |
|---|---|
| Fly `dfw`, ~35ms RTT, 20Hz snapshots | input→pixels ~**60ms**, and it plays well |
| Railway `us-east4`, ~210ms RTT | **245ms**, not playable |

The architecture's own cost is `RTT + ~8ms step wait + half a snapshot interval`
— ~33ms at 20Hz, ~16ms at 60Hz. The rest is the path, and the path is a hosting
choice: Dallas measured 26ms against Railway's 186ms **in the same metro**.

So the trade was made on measurement rather than taste:

| | Server-authoritative (J5–J6) | Lockstep (superseded) |
|---|---|---|
| Determinism | Irrelevant | Required, and J0 measured that it does not hold across V8 versions |
| Browser and version | Do not matter | Must match, forever, unverifiably |
| Input latency | Full round trip, always | Local-immediate |
| A commander drops | The others play on | Everyone stalls |
| Ops | One process owns a match | A relay |

**Prediction is deliberately not in this plan.** netproto measured the floor —
no prediction, no interpolation — and it played well on a good path. Prediction
with reconciliation is the hardest thing in either architecture, and it is
optional here in a way determinism never was. It is a later slice if the feel
demands it, and `netproto/README.md`'s P5 is the place its findings would go.

**J1 as built, in four places the plan said something narrower.**

| What the plan said | What shipped, and why |
|---|---|
| `this.controlled` is an index, partitioned | It became `this.control`, a Map of **owner → index**, so EVERY commander has a leader rather than only the local one. The leader is what an AI squadmate escorts, so a squad whose commander has no leader is a squad the two clients step differently — the exact failure J0 measured. `_handleControl`'s auto-swap off a casualty runs for every owner for the same reason, and `Mission.start` gained a trailing `owner` naming the commander at this keyboard (default: the owner of the first soldier deployed, i.e. `null` in single-player) |
| Two squads land on top of each other until the spawn offset changes | The line-up keeps the 44px pitch and opens a **two-slot gap wherever the owner changes**, walking the flat list once. It is a function of the list as given, never of "mine versus theirs", so both clients build the identical line-up. At one owner there is no gap and the offset is exactly `i * 44`, which is what keeps the golden still |
| `loot` and `kills` are J1's actual work | They are, and the shape is `scene.collected` becoming `{ item, owner, by }` — eager on the scene now, since the HUD and `_resolve` both read it every mission. `_resolve` took an `owner` argument and builds the whole result for one commander; the payload's shape is unchanged, so `state.js` and the results screen never learn owners exist. **J2 therefore only has to decide WHEN each result fires, not what is in it** |
| A commander's leader is player-driven | Only the LOCAL one is. Another commander's leader is stepped by the companion brain anchored to itself until J6 gives it an input stream — which is also, exactly, the shape approximation 6 describes for a commander who walks away |

**`_checkOutcome` is NOT untouched, and this is a J1 behaviour change nothing
tests.** It calls `this.livingSoldiers()`, whose J1 default is *this owner's*
squad, so the losing branch narrowed from "every soldier down" to "this
commander's squad down" — verified by killing one owner's two soldiers in a
two-owner scene and watching `endBanner` and a result appear while the other
owner still had two alive. `test/mission-ownership.test.mjs`'s 44 assertions do
not cover it. **J2 owns fixing it; a case belongs in that suite either way.**
The winning branch is what the sentence below still describes:
J2 owns that. The one line J1 changed in it is the artifact grant, which now
records the soldier who tripped the exit, making approximation 4 true as written.
`this.squadIds` was deleted rather than partitioned, as the Background says.

**J1–J6 supersede the M2, M3 and M4 rows of `tech/multiplayer.md`.** Four
corrections, all found by reading the code rather than the plan:

| | |
|---|---|
| **M4 is not a slice, and half of it is already built** | Contested pickups need no work: `_updateLoot` walks soldiers and `break`s on the first overlap, so the race exists the moment a collected item knows whose it is. Attribution is `_resolve` partitioned. Independent exits is the one with weight, and it is J2 |
| **The checksum moved to the front, and asked a different question** | M3 listed it last, as what catches divergence once lockstep exists. Asked first, it ended the architecture instead — and it survives as a debugging instrument rather than a mechanism |
| **M3 is deleted, not re-cut** | "Lockstep input — two input streams through `src/mission/input.js`, input delay, and a rolling checksum" describes a design this document no longer follows. There is one simulation, so there is no second stream to reconcile and no delay window to tune |
| **A joint mission's campaign side is missing from the plan entirely** | Two results for one lead is J3, and it is a bug today rather than new work |
| **The dispatch has to change, and the map does not say so** | M2–M4 are all mission-side. A client cannot simulate a squad whose soldiers it was never sent, and board privacy is exactly why it was never sent them |

### What is per mission and what is per commander (J3)

One rule, applied. **The mission decides what happens to the world; the
commander decides what happens to their base.**

| Field | Where it lives | Joint lead |
|---|---|---|
| `threatReward` → `campaignHealth` | World | **Once.** One mission was cleared |
| The failure penalty and the doom charge | World | **Once.** One mission was failed |
| `cleared` (board pressure) | World | **Once.** Today it increments per report, which is the double-count |
| `winsCampaign` → `world.wonBy` | World | **Once**, and it is already first-writer-wins |
| The mission's log line | World | **Once** |
| `completedMissions` | Player | **Each.** It is that commander's record of what they were on |
| `highWins` → the finale gate | Player | **Each.** `design/multiplayer.md`: the finale appears for the player who earns it, and both earned it |
| Loot, kills, wounds, casualties, `record.missions` | Player | **Each, and already correct** — `applyMissionResult` matches them by id and J1's `_resolve` builds one result per owner |

The lead leaves the board once, which is what it does today — `state.leads` is a
world field and the first report filters it. What has to change is that the five
world consequences stop hanging off `state.leads.find(...)` succeeding, since the
second report will not find it.

## Reuses

| What | Where | Used for |
|---|---|---|
| Team, and the fact that it is **not** on a soldier | `src/mission/combat.js`, `src/mission/enemyspec/perception.js` | Two player squads are already mutually non-hostile, and not because soldiers carry a team — they carry none. `opponents()` switches on the *projectile's* team and `hostilesFor` returns `scene.soldiers` whole, so an enemy hunts both squads and a player round cannot hit a soldier unless `friendlyFire` is on. Owner is a SECOND axis over the same array and must not be wired into either of those |
| First-to-touch loot | `src/mission/mission.js` | `_updateLoot` breaks on the first overlapping soldier. The design's "every pickup is a race" is that `break` |
| The id-keyed halves of a result | `src/mission/mission.js` | `survivors`, `casualties`, `killsBySoldier` and `woundsBySoldier` are built by walking `scene.soldiers`, so partitioning the walk yields a per-owner result with no new shape. **`loot` and `kills` are not** — `loot` is a flat `scene.collected` with no soldier reference and `kills` is a scalar total. Those two are J1's actual work |
| `applyMissionResult`'s id matching | `src/game/state.js` | Survivors, casualties, wounds and kills match by id and cross a wire unchanged. The **lead** lookup is what does not survive two results, and that is J3 |
| The whole of `tech/mission-determinism.md` | `src/mission/entities.js`, `src/mission/ai.js` | One seeded stream per mission and a golden that reddens on a new unseeded gameplay draw. **Including its approximation 5**, which says in as many words that seeding at `loadMission` is a single-client shape and "this is the part M2 or M3 will have to relocate" — J0 is that relocation being measured before it is attempted |
| The golden's driver | `test/mission-golden.test.mjs` | `m.running = false`, a scripted input that is a pure function of the frame index, then `m.update(STEP)` in a loop. A fixed-step mission harness that already exists, and what J0 runs twice |
| The twice-run self-check | `test/mission-golden.test.mjs` | Trace twice and compare before trusting a baseline. J0 is the same idea with the controlled soldier changed instead of nothing |
| `updateCompanionSpec` | `src/mission/ai.js` | Every unpiloted soldier is already AI-driven, anchored to a leader. Two owners need a leader each, not a new brain — and this is also why a departed commander's squad fighting on as AI is nearly free, not a Phase-3-sized problem |
| The dispatch, its `playerId`, and `projectDispatch` | `src/game/session.js` | A soldier's owner already reaches the client that plays it, and the projection is the one decision point for what a commander may hold. J5 pairs two dispatches there rather than inventing a channel. **It no longer has to carry the other squad**: the server builds the scene, so a browser never needs another commander's soldiers — which returns board privacy to exactly where S6 left it |
| The seat-addressed round push | `src/net/rooms.js` | Each dispatch already goes to its own seat and no other. J5 changes what a seat is sent, not how |
| **The whole prototype** | `netproto/` | Not imported — measured, then read. The loop shape (deadline-corrected fixed step, catch up at most 5, resync rather than teleport), the wire format (`{seq, l, r, jump, fire, ax, ay}` in, snapshot plus per-recipient `ack` out), the dependency-free RFC 6455 server, `setNoDelay`, and the two bugs its smoke test caught — events cleared per step but sent per broadcast, and a closed socket leaking a player — are the design J6 copies. It stays standalone: **nothing in `src/` imports it and it imports nothing from `src/`** |
| The headless mission | `test/mission-golden.test.mjs` | `new Mission(makeEl("canvas"), …)`, `m.running = false`, `m.update(STEP)` in a loop, `render()` never called. **The server-side simulation is not a refactor — it is what the bar already does on every run** |
| `sampleScene` | `src/mission/checksum.js` | J0's named field list is the honest starting point for what a snapshot carries: it is already the set of gameplay state this repo decided is real, and already excludes the cosmetic |
| `installDom`, `makeEl`, `ctx2d` | `test/harness.mjs` | The mission mounts headlessly already, which is what makes J0, J1 and J2 testable at all |

## Where the code goes

| Path | Change |
|---|---|
| `src/mission/checksum.js` | J0, built. A pure function from a scene to a number over a **named** sample list, plus the list. Its own module because a suite, a snapshot and a bug report all read it and none should reach into the mission scene. **The list already exists in another form**: `test/mission.golden.json` is the set of gameplay fields the repo has already decided are the mission's real state, chosen for exactly this reason — everything cosmetic is excluded because it is unseeded on purpose. Start there rather than inventing a list, and where the two drift apart, that is a fact worth knowing about one of them | **As built:** the list is `sample()` from the golden with four drifts, all widening, because a fold costs no fixture bytes — EVERY projectile rather than the front three, each loot drop's own `y` and collected flag rather than the two counts, `scene.artifact` (the golden's 41 samples never resolve, so it never had a reason to look), and a root's brain state folded as a string rather than compared as one. The drift that runs the other way is not in the list: a checksum cannot carry the golden's 2e-3 tolerance, so values are quantized to 1e-3 and two runs that straddle a quantum read as divergence. Same process, that never fires; two machines, it is the thing to remember
| `test/mission-divergence.test.mjs` (new) | J0. One scene, two runs, different soldier controlled, checksums compared per step. **Per step, not at the end**: what a builder needs is the FIRST step at which the two diverge, because the frame number is what identifies which draw site did it — the same reason `test/mission-golden.test.mjs` names the first differing field rather than reporting a mismatch |
| `test/mission-trace.mjs` (new) | J0. The seed, squad, step and input trace, extracted rather than copied, because three things now drive one mission: the golden, the divergence probe, and a browser page that cannot import anything reaching `node:fs`. The golden re-exports the names it used to own |
| `test/float-probe.html`, `test/float-probe-standalone.html` (new) | J0's second half. Two pages, run by hand on two machines: the first fingerprints the real mission over 480 steps off the extracted trace, the second drives six functions (four approximated, two exactly-specified controls) from `file://` with no imports, so it can be handed to somebody with no repo. Not in the node bar — the question is about a browser engine |
| `src/mission/entities.js` | J1. `Soldier` takes an owner; `loadMission`'s squad contract gains it. The spawn offset is `playerSpawn.x + i * 44` across one flat list, so two squads land on top of each other until this changes |
| `src/mission/mission.js` | J1 and J2. The eleven sites in Background, per-owner `_resolve`, the extraction splice, `this.control` keyed by soldier id rather than array index, and the HUD |
| `src/game/state.js` | J3. `applyMissionResult` stops assuming it is the only report for its lead |
| `src/game/session.js` | J3 and J5. The round learns that two dispatches can name one lead, and says so in the pair it emits |
| `src/net/rooms.js` | J5 and J8. A room gains a mission in flight beside its campaign: which seats are in it, and the per-seat snapshot it hands out. **It does not hold the loop and does not construct the `Mission`** — `test/session.test.mjs` source-scans this file for DOM globals and `localStorage`, and that assertion stays true |
| `server.mjs` | J8. The socket, the room's `Mission`, and the deadline-corrected fixed-step loop that drives it. No suite imports this file — `netproto/ws.mjs` is the dependency-free WebSocket to copy, and `netproto/server.mjs`'s loop (catch up at most 5 steps, then resync rather than teleport) is the shape |
| `src/mission/mission.js`, `src/mission/input.js` | J6 and J7. A host-free construction path (no `input.enable`, no rAF), and input that arrives per owner rather than from one device. `_applyAim` takes aim already in **world** coordinates, because a server holding one scene cannot resolve two viewers' cameras |
| `src/net/mission-socket.js` (new) | J8, browser half. Opens the socket, sends input at a fixed rate, drops a snapshot older than the one on screen. Beside `src/net/remote.js` rather than inside it: that file is the turn-boundary client and its three names are pinned |
| `src/mission/input.js` | J4. Sampling per step and a frame index. The read API is `isDown` / `justPressed` / `aimSource` and should not move |
| `src/main.js` | J2 and J6. Per-owner `onComplete` and a canvas that outlives the first result (J2); joint missions starting together rather than in a queue (J6) |
| `src/net/mission-wire.js` (new) | J8. The input packet and the snapshot — the one place a scene is narrowed for the wire, **per recipient**. `netproto` sends everyone the same snapshot because a one-screen arena has nothing to hide; this game does: `design/multiplayer.md` never discloses what another commander recovered, and `sampleScene` in `src/mission/checksum.js` — the honest starting list — carries exactly that |
| `src/mission/render.js`, `src/mission/mission.js` | J8, browser half. A page in a joint mission draws a snapshot. **"Keep rendering, stop updating" does not work as stated**: `_updateCamera` is the last call in `update()`, and `this.time`, the particles, the shake, the damage flash and the intro timer all advance there while `render()` reads them. So a viewing page still steps its cosmetic and camera state; what it stops doing is simulating gameplay, and the snapshot replaces the fields `sampleScene` names rather than the whole scene |
| `test/mission-ownership.test.mjs` | **Exists, committed with J1**, 44 assertions covering the axis, the line-up, control that cannot cross, the dead-leader swap, escort anchoring, loot credit, per-owner `_resolve`, and the team/owner boundary. **None of the J2 content is in it yet**: an exit that ends one mission and not the other, an extracted squad that leaves the array without moving anybody else's control, a resolved owner that `_checkOutcome` skips rather than reading as wiped, and the losing branch J1 narrowed without a case |

Conventions from `CLAUDE.md` that bind: no dependencies, no build step; a new
number goes in the config `SCHEMA` (the input delay is one); **a regression case
goes in the suite that already covers the subsystem** — J3's cases belong in
`test/wiring.test.mjs` and `test/session.test.mjs`, not in a new file.

## The seam

**Owns:** the owner axis inside a mission, per-owner resolution, two results for
one lead, the checksum, fixed-step input, the joint dispatch, and the room's
mission loop.

**Ownership decides who inputs and who is credited. The server decides
everything else.** A joint mission has exactly one simulation and it runs in the
room; owning a soldier means your keys drive it and your report carries it. A
browser in a joint mission computes no gameplay state at all — which is why the
architecture is indifferent to the browser, the version, and the machine, and
why J0's finding stopped being a blocker rather than being solved.

**J1, J2, J6 and J7 land with no transport at all**, because ownership,
per-owner resolution, a host-free construction path and per-owner input are all
properties of the scene rather than of the wire. Only J5 and J8 touch a network,
which is what keeps the risky half small.

**Must not touch:**

| Boundary | Why |
|---|---|
| The team axis | Team decides who may damage whom and who an agent hunts. Owner decides who commands and who is credited. Wiring owner into `opponents()` or `hostilesFor` makes two player squads hostile, which is a design change nobody asked for |
| The session's authority over the CAMPAIGN | Per-step input is not a command, never goes through `command`, and is never adjudicated by `createSession`. The campaign's rules and the mission's loop are two authorities in one process and must not become one object |
| The turn-boundary channel | `src/net/rooms.js`'s commands, snapshots and rounds keep their rate and their shape. Mission traffic is 60Hz with a different lifetime and rides its own socket, opened in `server.mjs`. A room owns both; neither learns the other's cadence |
| **`src/net/rooms.js` stays DOM-free and storage-free** | `test/session.test.mjs` source-scans it, and V1 put it there deliberately. The `Mission` and its loop live in `server.mjs`, which no suite imports and no scan covers. A room refers to a mission; it does not build one |
| **A `missionResult` is still a command** | Per-step input never goes through `command`. The two results do: they are ordinary campaign writes, one per `dispatchId`, and `round.flight.outstanding` is what turns the day when the second lands. The room sends them because the room holds the mission |
| `src/mission/` as a simulation | The server steps the mission the browser used to. **Not one gameplay rule may move to the wire** — a snapshot is a projection of a scene, never a place where damage is decided |
| `src/game/gen/` | The level is generated once, in the room, and its state reaches the page as snapshots. The page stops needing the seed to be reproducible |
| Cosmetic randomness | Motes, sparks, shake, trail jitter and loot bob stay on `Math.random` and are never sent. The client is free to invent them: nothing reads them back |
| Single-player | One owner, no socket, no room, no snapshots. It keeps the local `Mission` and the static URL, and the golden is what says the simulation did not move under it |

## Must not regress

| Suite | What it guards |
|---|---|
| `test/mission-golden.test.mjs` | **The load-bearing one.** A mission replays from its seed at a fixed step, at one owner. A re-baselined golden here is the bug, not the fix. Two things it does NOT guard, which is why it is not sufficient: it drives `m.update(STEP)` directly and never runs `_frame`, so **J4 is invisible to it**; and its 41 samples never resolve, so it says nothing about `_checkOutcome` or `_resolve` |
| `test/session.test.mjs` | The round, the gate, the visibility rules — and it pins the dispatch's key sets (`mission` is exactly `id`, `name`, `seed`) and reads `src/main.js` as text, matching `runRound` and the round-drain ordering. **J5 and J6 edit those assertions in their own commits**; the spec that says a suite changes nothing here would be wrong |
| `test/transport.test.mjs` | The wire and the client's three names, and it pins the dispatch projection too. J5 adds the pairing to that projection and edits it deliberately. **What it must keep pinning is that a dispatch carries only its own seat's squad** — the server-authoritative design means that never has to widen, and a slice that widens it has leaked another commander's board for no reason |
| `test/service.test.mjs` | The room and its per-seat push; J5's pairing lands here. **It cannot see `server.mjs`** — its own header says so, because that file binds a port on load — so J8's loop is guarded by a headless two-seat drive instead, not by this suite |
| `test/mission-divergence.test.mjs` | J0's probe. **It stays green and stops being load-bearing**: it now guards that one process replays itself, which is `tech/mission-determinism.md`'s original claim, rather than gating an architecture |
| `test/wiring.test.mjs` | `applyMissionResult` end to end — and it applies exactly one result per lead and asserts the lead is removed, which is the assumption J3 breaks. J3's new cases go beside it |
| `test/mission-enemyspec.test.mjs`, `test/enemyspec-targeting.test.mjs` | Enemies hunt the squad — `hostilesFor` returning `scene.soldiers` is an identity assertion. J1 must not narrow what an enemy sees to one owner |
| `test/combat.test.mjs`, `test/crouch.test.mjs`, `test/companion-aim.test.mjs` | Damage, friendly fire, ducking, companion targeting |
| `test/locomotion-characterization.test.mjs` | The strictest fixture in the repo. Nothing here should reach the locomotor |
| `test/docs.test.mjs` | Citations and the seven parts |

**Where the bar cannot see this.** `src/main.js` and `server.mjs` are imported
by no suite; J2 and J6 both land in them, and `src/main.js` is guarded only by a
source regex in `test/session.test.mjs` and by playing. **J4's only guard is
playing single-player at a bad frame rate**, because the golden already lives in
the world J4 creates. **J6's loop is guarded by a headless two-seat drive** —
`netproto/smoke.mjs` is the shape: start a server on its own port, connect two
clients, drive them, assert. It found both real bugs in that prototype's first
build, and it is deliberately not in `node test/run.mjs` there. J6's equivalent
**should** be, because by then it is a subsystem rather than a probe.

## Approximations

| # | Where it is not exact | What catches the failure |
|---|---|---|
| 1 | **Two humans cannot drive two squads on one machine, so J1 and J2 are not playable before J6.** The Mission holds one `MissionInput` and one `controlled`, and `src/main.js` disables seat swapping mid-mission. Hot-seat gives one commander plus AI escorts wearing another owner's colours — useful for looking at, worthless as proof of feel. The headless suites are the real guard, and the first time a joint mission is *played* is J6 | Nothing. Stated because "we can try it in hot-seat first" is the assumption a builder would otherwise make, and it is false |
| 2 | **Floating point stopped being a risk by being designed around.** J0's second half measured Chrome 151 and 152 agreeing and node's older V8 disagreeing on four transcendentals, which is what moved the network half to one authoritative simulation. Under J5–J6 nothing about the client's engine, version or CPU can affect gameplay state, because the client computes none of it | Nothing needed, and that is the point. The probe pages stay in the tree as the record of why, and as the instrument if the question ever returns |
| 2b | **Full round-trip input latency is the price, and it is not hidden.** No prediction, no interpolation. `netproto/` measured the floor: ~60ms input→pixels at ~35ms RTT and 20Hz snapshots, which plays well, and 245ms at 210ms RTT, which does not. A distant player has a worse game than a near one, permanently | Nothing in the bar can see this. It is measured by playing, and the numbers to beat are in `netproto/README.md`. Prediction is the known remedy and is deliberately not in this plan |
| 3 | **J4 can change how the game feels, in single-player, for nobody's benefit.** Moving input sampling from once per rendered frame to once per step changes when a press is observed relative to a step boundary. It is a fraction of a frame, it is the correct behaviour, and it is the kind of thing a player notices as "heavier" without being able to name it | Playing it. The golden cannot see it |
| 4 | **The artifact is an indivisible reward and J2 hands it to whoever extracts first, automatically.** Every generated level carries one (`src/game/gen/levelgen.js`), and `_checkOutcome` grants it to whoever trips the exit and nulls it. `design/multiplayer.md` explicitly wants the case where two players who cooperated end with something only one can hold — so the outcome is right and the *mechanism* is an extraction race rather than a pickup race, which is not what "first to reach it" describes | Nothing here. Named because it is a design-visible rule being set by an implementation detail, and Bo should know it is being set |
| 5 | **A joint mission runs on the SERVER's config, and nobody's browser settings apply.** `config.friendlyFire`, `gravity`, `aimSpread` and fourteen other knobs are localStorage, read live through the mission's `_ctx` getters. In the room they resolve to built-in defaults — `tech/multiplayer-service.md` approximation 11 by another route, and now it reaches gameplay feel rather than just the campaign. It is no longer a divergence risk, because there is one reader; it is a **surprise**: a solo mission and a joint mission on the same machine obey different numbers | Nothing. **Deferred by Bo, deliberately, after J8.** Shipping config to the room is its own slice and is the most visible thing this architecture does not do |
| 6 | **A commander who leaves mid-mission is nearly free now, and is still not built.** The server holds the only simulation and `updateCompanionSpec` already drives every unpiloted soldier, so the design's "handed to the AI and fights on as companions" is a socket close feeding one flag. `tech/multiplayer-service.md` approximation 10's deadlock does NOT survive this architecture — the mission runs on regardless of who is watching — but the flag and the result routing are unwritten | Nothing. Recorded because the blocker shrank twice: first from "needs a second simulator" to "needs a signal", now to "needs a signal we are already given by the socket" |
| 7 | **The HUD's loot counter is scene-wide and would leak what the other commander recovered.** `design/multiplayer.md` never discloses what somebody else carried out. The count is fed by one shared `scene.collected`, so J1's partition has to reach the HUD or it becomes the one field that tells you | `test/mission-ownership.test.mjs` (new) can assert the count, but the leak is a rendering fact and the real guard is looking at it |
| 8 | **The checksum samples, it does not hash the scene.** A named list, for the same reason the golden samples: cosmetic state is unseeded on purpose and would fail every comparison | The list is the thing to extend when a divergence slips past. A checksum that never fires is not proof of agreement |
| 9 | **"Both missions begin at the same moment" is narrowed to joint ones.** Two commanders on two different leads still play whenever each gets there | Deliberate. Synchronising unrelated missions makes one commander wait on another's reflexes for nothing the design asks for |
| 10 | **One process owns a match, and that cannot be scaled away.** `netproto/README.md` measured the escape hatch and closed it: a shared store is fast enough (p50 0.02ms on 1KB) and still wrong, because a tick is read-world / compute / write-world and two processes doing that need a lock that serialises them back into one. Sticky routing to the room's process is the only answer, and there is no matchmaker | Nothing at two players in one room. It is the first thing to hit if this ever has more than a handful of simultaneous missions |
| 11a | **A snapshot must be filtered per recipient, and the model it is copied from is not.** `netproto` broadcasts one payload to everybody because a single-screen arena has nothing to hide. Here `design/multiplayer.md` says what another commander recovered is never disclosed, and the honest starting list (`sampleScene`) carries the collected count and each drop's collected flag. The per-recipient shape exists in `netproto` for one field only — `ack` | `test/service.test.mjs` can assert a seat's snapshot carries no other seat's loot, the same way it already asserts a seat's campaign snapshot carries only its own projection |
| 11b | **An extracted commander's soldiers are gone from the scene, so their in-flight rounds outlive their shooter.** Removal is what makes "the squad leaves" true in one move, and it removes the stale-scene hazard a departed flag would have created — there is no second version of that squad to read. What it leaves is narrower: a projectile already in the air holds a JS reference to a soldier no longer in `scene.soldiers`, so it still resolves damage and still credits a kill to somebody who has gone home | `test/mission-ownership.test.mjs`. The reference stays valid, so this is a rules question rather than a crash: a round fired before extraction is a round that was fired, and letting it land is the answer that needs no special case |
| 11 | **The mission's live scene is bigger than a snapshot, and what gets sent is a judgement call.** `netproto` sends positions rounded to a tenth of a pixel and never sends velocity, deliberately, so a client cannot half-predict. This mission has spec roots with nested parts, brains, statuses and effects — `sampleScene` in `src/mission/checksum.js` is the starting list, but rendering needs fields a checksum does not | The bandwidth readout `netproto` already carries. J6 should print snapshot size from its first day, because the first version that sends the whole scene will work on a LAN and fail on a wire |

## Background

### The eleven sites that assume one squad

Read off `src/mission/mission.js`, because the list is the size of J1.

| Site | What it assumes |
|---|---|
| `this.controlled` | An index into `scene.soldiers`. The one that lets a commander drive somebody else's soldier. **As built:** a Map of owner → index, one entry per commander |
| `_swapControl` | Cycles the whole array, wrapping into the other squad |
| `_handleControl` | Auto-swaps off a dead soldier into anyone |
| `currentSoldier` / `livingSoldiers` | "The squad" is the array |
| **`_updateSoldiers`'s `leader`** | `leader = this.currentSoldier()`, handed to every companion. Decides who is player-driven AND who each AI squadmate escorts. **The biggest one, and it is not in the phase map**. **As built:** one leader per owner, resolved before the walk; player-driven is the local owner's leader alone, escort is the soldier's own commander's |
| `_checkOutcome` | Any living soldier at the exit wins for everybody; all dead loses for everybody |
| `_checkOutcome`'s artifact grant | One `scene.artifact`, taken by whoever extracts first |
| `_resolve` | Survivors, casualties, kills and wounds over the whole array, into one result, with a flat `scene.collected` and a scalar kill total |
| `_updateLoot` | Any soldier collects into one `scene.collected` |
| `_updateCamera`, the damage flash, `_drawSoldier` | All keyed to `currentSoldier()` |
| `_squadGraph` / `_drawSquadPaths` / `_drawHUD` | Draws the array as one force, including a scene-wide loot count |

`this.squadIds` was assigned in `start()` and read nowhere in `src/` or `test/`.
It was a twelfth assumption and it was dead; J1 deleted it rather than
partitioning it.

### Why the probe came first, and what it was worth

J0 was a suite and a pure function. It asked the only question that could
invalidate the shape of the network half, it needed neither of the halves that
follow it, and its first half needed no second machine.

It cost two small modules and two pages, and it changed the architecture. Both
answers arrived before J5 or J6 existed: the stream-order failure named work
(J1, which shipped and is useful regardless), and the V8-version disagreement
named a dependency that could not be worked around. Had the probe run last, as
the phase map had it, the finding would have arrived with two input streams, a
delay window and a reconciliation loop already written against it.

The generalisation worth keeping: **a slice whose only output is an answer is
worth scheduling first when a later slice is built on an assumption nobody has
tested.** Everything else in this document was worth building whether or not J0
passed, which is exactly why it should not have waited behind them.
