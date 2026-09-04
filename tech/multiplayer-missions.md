---
type: tech
category: gameplay-systems
status: building
resolution: sharp
needs: [multiplayer-state, multiplayer-session, multiplayer-service, mission-determinism]
related: [multiplayer, multiplayer-state, multiplayer-session, multiplayer-service, mission-determinism, campaign-pacing]
tags: [multiplayer, mission, lockstep]
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
| **J2** | **Ends are independent, and a mission resolves per owner.** Reaching the exit ends **that owner's** mission; the scene keeps running for everyone still on it. A resolved owner's soldiers are marked departed and **stay in `scene.soldiers`** — splicing them breaks `controlled` (an index), `_swapControl`'s modulus, and enemy perception, which reads that array whole. `src/main.js` learns to fire `onComplete` per owner and keep the canvas up until the last one | Yes, visibly: a mission no longer ends when the first soldier reaches the exit while somebody else is still fighting |
| **J3** | **The campaign accepts two results for one lead.** Today it cannot, and this is not a joint-mission nicety — it is a live corruption. Two dispatches on one lead carry the same `missionId`; `applyMissionResult` removes the lead from the shared board on the first report, so the second finds no `mission` and silently gets no `threatReward`, no log line, no `highWins`, no `winsCampaign`, and on a failure neither the health penalty nor `outcome = "lost"` — while `state.cleared` increments **twice**, because that line is not guarded by the lookup | Yes, and it fixes a bug that already exists whenever two commanders pick the same lead |
| **J4** | **Input sampling leaves the frame rate.** `_frame` polls input once per *rendered* frame then steps the sim a variable number of times, so the same physical inputs at a different frame rate are a different mission. `tech/mission-determinism.md` approximation 1, named there as "its own change and is not in this spec" | Yes, and it is the one slice that could change how the game feels to a solo player. See Approximations |
| **J5** | **A dispatch knows it is joint, and carries the other squad.** Two commanders on one lead currently produce two dispatches that never learn of each other: `closeRound` emits them independently and `src/net/rooms.js` pushes each only to its own seat. Lockstep needs both clients to build the same scene, so the pairing and the other squad's soldiers and weapons have to cross the seam. Turn-boundary work, in `src/game/session.js` and `src/net/rooms.js`, with no mission code in it | Yes — both clients can build one scene. Nothing plays jointly yet |
| **J6** | **Two input streams, one level.** Per-step inputs exchanged through the transport with an input delay and the J0 checksum riding along. Both joint missions begin at the same moment, so the page stops playing a round's missions strictly one after another | Yes. The design's decision 5, and the first time anybody plays *with* somebody |

**J0 lands first and depends on nothing** — it is a suite and a pure function,
and it decides whether J6 is lockstep at all. J1→J2→J3 is the mission and
campaign half and is worth having on its own merits. J4, J5 and J6 are the
network half.

**J0 is built, and it failed — which is the answer it existed to get.**
`test/mission-divergence.test.mjs` runs one mission twice, changing nothing but
`m.controlled`, and reports:

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

**Consequence for the phase order: J1 is a prerequisite for lockstep, not only
for credit.** J6 cannot be "hand both clients the seed and let them run" until
every player-driven soldier takes the player path on BOTH clients, which is
exactly what the owner axis buys. The probe stays green after J1 — it drives one
input source, so the two runs still put different bodies under it; what J1 earns
is a second probe driving two owners with two traces, and *that* one going quiet
is the precondition for J6.

**The second half is not built**, on the row's own terms: the cross-machine
floating-point question is only worth asking once the first half passes.

**J1–J6 supersede the M2, M3 and M4 rows of `tech/multiplayer.md`.** Four
corrections, all found by reading the code rather than the plan:

| | |
|---|---|
| **M4 is not a slice, and half of it is already built** | Contested pickups need no work: `_updateLoot` walks soldiers and `break`s on the first overlap, so the race exists the moment a collected item knows whose it is. Attribution is `_resolve` partitioned. Independent exits is the one with weight, and it is J2 |
| **The checksum moves to the front, and asks a different question** | M3 lists it last, as what catches divergence once lockstep exists. The blocking question is not floating point — it is stream-consumption order, which differs per client by construction and is answerable in one process without a second machine |
| **A joint mission's campaign side is missing from the plan entirely** | Two results for one lead is J3, and it is a bug today rather than new work |
| **The dispatch has to change, and the map does not say so** | M2–M4 are all mission-side. A client cannot simulate a squad whose soldiers it was never sent, and board privacy is exactly why it was never sent them |

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
| The dispatch, its `playerId`, and `projectDispatch` | `src/game/session.js` | A soldier's owner already reaches the client that plays it, and the projection is the one decision point for what a commander may hold. J5 widens that decision deliberately rather than inventing a channel |
| The seat-addressed round push | `src/net/rooms.js` | Each dispatch already goes to its own seat and no other. J5 changes what a seat is sent, not how |
| `installDom`, `makeEl`, `ctx2d` | `test/harness.mjs` | The mission mounts headlessly already, which is what makes J0, J1 and J2 testable at all |

## Where the code goes

| Path | Change |
|---|---|
| `src/mission/checksum.js` (new) | J0. A pure function from a scene to a number over a **named** sample list, plus the list. Its own module because a suite, a lockstep loop and a bug report all read it and none should reach into the mission scene. **The list already exists in another form**: `test/mission.golden.json` is the set of gameplay fields the repo has already decided are the mission's real state, chosen for exactly this reason — everything cosmetic is excluded because it is unseeded on purpose. Start there rather than inventing a list, and where the two drift apart, that is a fact worth knowing about one of them | **As built:** the list is `sample()` from the golden with four drifts, all widening, because a fold costs no fixture bytes — EVERY projectile rather than the front three, each loot drop's own `y` and collected flag rather than the two counts, `scene.artifact` (the golden's 41 samples never resolve, so it never had a reason to look), and a root's brain state folded as a string rather than compared as one. The drift that runs the other way is not in the list: a checksum cannot carry the golden's 2e-3 tolerance, so values are quantized to 1e-3 and two runs that straddle a quantum read as divergence. Same process, that never fires; two machines, it is the thing to remember
| `test/mission-divergence.test.mjs` (new) | J0. One scene, two runs, different soldier controlled, checksums compared per step. **Per step, not at the end**: what a builder needs is the FIRST step at which the two diverge, because the frame number is what identifies which draw site did it — the same reason `test/mission-golden.test.mjs` names the first differing field rather than reporting a mismatch |
| `src/mission/entities.js` | J1. `Soldier` takes an owner; `loadMission`'s squad contract gains it. The spawn offset is `playerSpawn.x + i * 44` across one flat list, so two squads land on top of each other until this changes |
| `src/mission/mission.js` | J1 and J2. The eleven sites in Background, the departed flag, per-owner `_resolve`, and the HUD |
| `src/game/state.js` | J3. `applyMissionResult` stops assuming it is the only report for its lead |
| `src/game/session.js` | J3 and J5. The round learns that two dispatches can name one lead; `projectDispatch` learns to carry the other squad when they do |
| `src/net/rooms.js` | J5. A seat's push carries the joint pairing |
| `src/mission/input.js` | J4. Sampling per step and a frame index. The read API is `isDown` / `justPressed` / `aimSource` and should not move |
| `src/main.js` | J2 and J6. Per-owner `onComplete` and a canvas that outlives the first result (J2); joint missions starting together rather than in a queue (J6) |
| `src/net/lockstep.js` (new) | J6. Input frames, the delay window, the checksum exchange. Not in `src/mission/`, which must not learn a network exists, and not in `src/net/rooms.js`, which is turn-boundary |
| `test/mission-ownership.test.mjs` (new) | J1 and J2: two owners on one scene, control that cannot cross, an exit that ends one mission and not the other, loot credited to whoever touched it, per-owner results, and a departed squad that enemies can no longer target but `controlled` still indexes safely |

Conventions from `CLAUDE.md` that bind: no dependencies, no build step; a new
number goes in the config `SCHEMA` (the input delay is one); **a regression case
goes in the suite that already covers the subsystem** — J3's cases belong in
`test/wiring.test.mjs` and `test/session.test.mjs`, not in a new file.

## The seam

**Owns:** the owner axis inside a mission, per-owner resolution, two results for
one lead, the checksum, fixed-step input, the joint dispatch, and the lockstep
loop.

**Ownership is not authority.** Each client simulates the whole level including
the other squad; owning a soldier means being the one who *inputs* for it and
the one credited for it, never the one who computes it. That is what makes J6
lockstep rather than a server, and it is why J1 and J2 land with no transport.

**Must not touch:**

| Boundary | Why |
|---|---|
| The team axis | Team decides who may damage whom and who an agent hunts. Owner decides who commands and who is credited. Wiring owner into `opponents()` or `hostilesFor` makes two player squads hostile, which is a design change nobody asked for |
| The session's authority | Per-step input is not a command, never goes through `command`, and is never adjudicated. A session that sees sixty messages a second has become a game server |
| The turn-boundary transport | `src/net/rooms.js` carries commands, snapshots and rounds. Lockstep traffic is a different rate and a different lifetime and takes its own channel — J5 is the last thing that touches the room |
| `src/game/gen/` | The level is generated once and both clients load the same one from the same seed |
| Cosmetic randomness | Motes, sparks, shake, trail jitter and loot bob stay on `Math.random` and are never checksummed — which is why the checksum is a named list rather than a walk of the scene |
| Single-player | One owner, no checksum exchange, no delay, no lockstep. Every slice leaves it identical and the golden says so |

## Must not regress

| Suite | What it guards |
|---|---|
| `test/mission-golden.test.mjs` | **The load-bearing one.** A mission replays from its seed at a fixed step, at one owner. A re-baselined golden here is the bug, not the fix. Two things it does NOT guard, which is why it is not sufficient: it drives `m.update(STEP)` directly and never runs `_frame`, so **J4 is invisible to it**; and its 41 samples never resolve, so it says nothing about `_checkOutcome` or `_resolve` |
| `test/session.test.mjs` | The round, the gate, the visibility rules — and it pins the dispatch's key sets (`mission` is exactly `id`, `name`, `seed`) and reads `src/main.js` as text, matching `runRound` and the round-drain ordering. **J5 and J6 edit those assertions in their own commits**; the spec that says a suite changes nothing here would be wrong |
| `test/transport.test.mjs` | The wire and the client's three names, and it pins the dispatch projection too. J5 widens that projection and edits it deliberately |
| `test/service.test.mjs` | The room, its routes and its per-seat push. J5's pairing lands here |
| `test/wiring.test.mjs` | `applyMissionResult` end to end — and it applies exactly one result per lead and asserts the lead is removed, which is the assumption J3 breaks. J3's new cases go beside it |
| `test/mission-enemyspec.test.mjs`, `test/enemyspec-targeting.test.mjs` | Enemies hunt the squad — `hostilesFor` returning `scene.soldiers` is an identity assertion. J1 must not narrow what an enemy sees to one owner |
| `test/combat.test.mjs`, `test/crouch.test.mjs`, `test/companion-aim.test.mjs` | Damage, friendly fire, ducking, companion targeting |
| `test/locomotion-characterization.test.mjs` | The strictest fixture in the repo. Nothing here should reach the locomotor |
| `test/docs.test.mjs` | Citations and the seven parts |

**Where the bar cannot see this.** `src/main.js` is imported by no suite — it is
guarded by a source regex in `test/session.test.mjs` and otherwise by playing.
J2 and J6 both land in it. **J4's only guard is playing single-player at a bad
frame rate**, because the golden already lives in the world J4 creates.

## Approximations

| # | Where it is not exact | What catches the failure |
|---|---|---|
| 1 | **Two humans cannot drive two squads on one machine, so J1 and J2 are not playable before J6.** The Mission holds one `MissionInput` and one `controlled`, and `src/main.js` disables seat swapping mid-mission. Hot-seat gives one commander plus AI escorts wearing another owner's colours — useful for looking at, worthless as proof of feel. The headless suites are the real guard, and the first time a joint mission is *played* is J6 | Nothing. Stated because "we can try it in hot-seat first" is the assumption a builder would otherwise make, and it is false |
| 2 | **Lockstep needs a floating-point claim this repo has declined to make.** `tech/mission-determinism.md` compares its golden with a 2e-3 tolerance because `Math.sin`/`cos`/`atan2` are implementation-defined, and its approximation 6 says two machines agreeing needs identical results across browsers and CPUs. J0's second half is where that gets tested — after its first half, which is likely to fail sooner and cheaper | J0. If either half fails, J6 is not lockstep and is replaced rather than adjusted |
| 3 | **J4 can change how the game feels, in single-player, for nobody's benefit.** Moving input sampling from once per rendered frame to once per step changes when a press is observed relative to a step boundary. It is a fraction of a frame, it is the correct behaviour, and it is the kind of thing a player notices as "heavier" without being able to name it | Playing it. The golden cannot see it |
| 4 | **The artifact is an indivisible reward and J2 hands it to whoever extracts first, automatically.** Every generated level carries one (`src/game/gen/levelgen.js`), and `_checkOutcome` grants it to whoever trips the exit and nulls it. `design/multiplayer.md` explicitly wants the case where two players who cooperated end with something only one can hold — so the outcome is right and the *mechanism* is an extraction race rather than a pickup race, which is not what "first to reach it" describes | Nothing here. Named because it is a design-visible rule being set by an implementation detail, and Bo should know it is being set |
| 5 | **Friendly fire is a per-browser setting and both clients read their own.** `config.friendlyFire` is localStorage, read per shot through the mission's `_ctx` getter and again in `duckableShot`. `tech/multiplayer-service.md` approximation 11 already records that a room runs on per-browser config; in a joint mission that stops being a tuning inconvenience and becomes two clients simulating different rules — a guaranteed lockstep break that has nothing to do with input | J0's checksum would catch it as divergence without explaining it. Whether mission rules should come from the room rather than the browser is the question this raises and does not answer |
| 6 | **A commander who leaves mid-mission is still unhandled, and the reason is smaller than it looks.** `updateCompanionSpec` already drives every unpiloted soldier, so the design's "handed to the AI and fights on as companions" needs a *signal that an owner has gone*, not a second simulator. It is not built here, and `tech/multiplayer-service.md` approximation 10's deadlock survives this spec | Nothing. Recorded with the correct blocker, because filing it as "needs Phase 3" is what has kept it unbuilt |
| 7 | **The HUD's loot counter is scene-wide and would leak what the other commander recovered.** `design/multiplayer.md` never discloses what somebody else carried out. The count is fed by one shared `scene.collected`, so J1's partition has to reach the HUD or it becomes the one field that tells you | `test/mission-ownership.test.mjs` (new) can assert the count, but the leak is a rendering fact and the real guard is looking at it |
| 8 | **The checksum samples, it does not hash the scene.** A named list, for the same reason the golden samples: cosmetic state is unseeded on purpose and would fail every comparison | The list is the thing to extend when a divergence slips past. A checksum that never fires is not proof of agreement |
| 9 | **"Both missions begin at the same moment" is narrowed to joint ones.** Two commanders on two different leads still play whenever each gets there | Deliberate. Synchronising unrelated missions makes one commander wait on another's reflexes for nothing the design asks for |
| 10 | **What the session should DO about a detected divergence is unspecified.** Two clients that disagree produce two contradictory results for one lead, and J3 makes both land | Nothing, deliberately: the right answer depends on whether J0 shows divergence to be rare or routine, and that is not known yet |

## Background

### The eleven sites that assume one squad

Read off `src/mission/mission.js`, because the list is the size of J1.

| Site | What it assumes |
|---|---|
| `this.controlled` | An index into `scene.soldiers`. The one that lets a commander drive somebody else's soldier |
| `_swapControl` | Cycles the whole array, wrapping into the other squad |
| `_handleControl` | Auto-swaps off a dead soldier into anyone |
| `currentSoldier` / `livingSoldiers` | "The squad" is the array |
| **`_updateSoldiers`'s `leader`** | `leader = this.currentSoldier()`, handed to every companion. Decides who is player-driven AND who each AI squadmate escorts. **The biggest one, and it is not in the phase map** |
| `_checkOutcome` | Any living soldier at the exit wins for everybody; all dead loses for everybody |
| `_checkOutcome`'s artifact grant | One `scene.artifact`, taken by whoever extracts first |
| `_resolve` | Survivors, casualties, kills and wounds over the whole array, into one result, with a flat `scene.collected` and a scalar kill total |
| `_updateLoot` | Any soldier collects into one `scene.collected` |
| `_updateCamera`, the damage flash, `_drawSoldier` | All keyed to `currentSoldier()` |
| `_squadGraph` / `_drawSquadPaths` / `_drawHUD` | Draws the array as one force, including a scene-wide loot count |

`this.squadIds` is assigned in `start()` and read nowhere in `src/` or `test/`.
It is a twelfth assumption and it is dead; J1 should delete it rather than
partition it.

### Why the probe comes first

J0 is a suite and a pure function. It asks the only question that can invalidate
the shape of J6, it needs neither of the two halves that follow it, and its first
half needs no second machine. Everything else in this document is worth building
whether or not J0 passes — which is exactly why it should not wait behind them.
