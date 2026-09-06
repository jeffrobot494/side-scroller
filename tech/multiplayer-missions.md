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
| **J2** | **Built. Ends are independent, and an extracted squad LEAVES the scene.** Reaching the exit resolves **that owner's** mission and their soldiers are spliced out of `scene.soldiers`; the scene keeps running for everyone still on it. **Ending is scene-wide today in five places, and the splice is the smallest of them** — the list is under "What ends a mission" and it IS the slice. Removal is the mechanism for departure, not a flag: "the squad leaves" means it does not fire, does not collide, does not win `_updateLoot`'s race, is not drawn and is not a target, and taking it out of the array is all five at once rather than five guards to write and one to forget. **A commander who finishes returns to base** (Bo): their `onComplete` fires, they get their results screen, and they wait for nobody | Yes, visibly: a mission no longer ends when the first soldier reaches the exit while somebody else is still fighting |
| **J3** | **Built. The campaign accepts two results for one lead, under two rules from Bo: the MISSION decides world consequences, not the commander, and there is only one mission; and if anyone extracts, the mission is a success.** The second makes the reward and the penalty branches of one decision applied on the last report, and it is why the outcome cannot be settled by whoever reports first. So a joint clear pays `threatReward` once, a joint failure charges doom once, and `cleared` increments once — while everything a commander earns stays per-commander. The table under "What is per mission and what is per commander" is that rule applied field by field. Today the code gets it wrong in both directions at once, which is why neither current behaviour is evidence of intent. The mechanics are unambiguous even where the rule is not, and this is not a joint-mission nicety — it is a live corruption. Two dispatches on one lead carry the same `missionId`; `applyMissionResult` removes the lead from the shared board on the first report, so the second finds no `mission` and silently gets no `threatReward`, no log line, no `highWins`, no `winsCampaign`, and on a failure neither the health penalty nor `outcome = "lost"` — while `state.cleared` increments **twice**, because that line is not guarded by the lookup | Yes, and it fixes a bug that already exists whenever two commanders pick the same lead |
| **J4** | **Built. Input sampling leaves the frame rate.** `_frame` polls input once per *rendered* frame then steps the sim a variable number of times, so the same physical inputs at a different frame rate are a different mission. `tech/mission-determinism.md` approximation 1, named there as "its own change and is not in this spec". **As built: `MissionInput` split in two at `sample()`** — the device half above it (window handlers and the pad poll, written at a rate nothing in the game controls) and one latched input frame below it, which is what `isDown`/`justPressed`/`aimSource` answer from. `_frame` takes exactly one sample per step, inside the accumulator loop. **And it turned out to be guardable**: see the correction under "Where the bar cannot see this" | Yes, and it is the one slice that could change how the game feels to a solo player. See Approximations |
| **J5** | **Built. A dispatch knows it is joint, and carries an owner.** Two commanders on one lead produce two dispatches that never learn of each other: `closeRound` emits them independently and `src/net/rooms.js` pushes each only to its own seat. The pairing crosses the seam — and so does the **owner**, which `projectDispatch` does not emit today, so a joint dispatch's soldiers would arrive owner-less and every J1 partition would collapse back to one squad. Turn-boundary only; no mission code. **As built: two keys and no new channel.** `squad[].owner` is written on EVERY dispatch rather than only joint ones (a soldier is owned whether or not anybody else is on the level, and at one owner every partition is still the whole array, so hot-seat and single-player are unchanged); `joint` is an array of `{ playerId, name }`, self included, **absent** on a solo dispatch so its shape does not change. `closeRound` is the only place that can work the pairing out — it holds every dispatch of the round at once while each seat is about to be handed exactly one | Yes — a room can pair two dispatches. Nothing plays jointly |
| **J6** | **The mission runs without a browser.** `Mission.start()` calls `this.input.enable(canvas)` and `requestAnimationFrame`, both unguarded, so in bare node it throws `window is not defined` — the golden only works because `test/run.mjs` calls `installDom()` globally before any suite. A host-free construction path: no DOM globals, no rAF loop, input injected rather than device-bound. Verified by a suite that constructs a Mission **with the harness deliberately not installed** | No. The browser path is unchanged; this is the door the server needs |
| **J7** | **Input goes per owner.** One `Mission` today has one input and one piloted soldier: `_updateSoldiers` pilots `leaders.get(this.owner)` alone, `_handleControl` reads `justPressed("swap")` for `this.owner` alone, and `_applyAim` resolves a mouse position against `this.camera` and `this._zoom()` — one viewer's frame. Stepping a scene off two seats needs an input per owner, a swap per owner, and aim that arrives already in world coordinates. **The largest mission-side change in the phase, and the previous draft assigned it to nobody** | No at one owner. It is what makes two possible |
| **J8** | **The room holds the mission and broadcasts it.** `server.mjs` steps a headless `Mission` at a fixed 60Hz off each seat's latest input and sends each seat **its own** snapshot; the page sends input at a fixed rate and draws what comes back. No prediction, no interpolation, no local simulation. Both `missionResult` commands are sent by the room, one per dispatch id, because the room is what holds the results. **A seat that resolves goes back to base and stops receiving snapshots; the room keeps stepping for whoever is left**, which is the design's rule and is only possible once the simulation is not the leaving player's page | Yes. The design's decision 5, and the first time anybody plays *with* somebody |

**J0 lands first and depends on nothing** — it is a suite and a pure function,
and it decided the architecture: see "Why the network half is not lockstep".
J1→J2→J3 is the mission and campaign half and is worth having under any
architecture; J1, J2 and J3 are built. J4→J8 is the network half, and J4 is now
shared ground rather than a lockstep prerequisite — a server stepping a mission needs
input decoupled from a frame rate for the same reason a peer did. **J4 and J5
are built too**, which leaves J6, J7 and J8: a host-free construction path, input
per owner, and the room that holds the mission. **Nothing plays jointly until
J8**, and every slice before it lands with no transport at all.

**The slice numbers in the prose below are the CURRENT ones.** Inserting J6
and J7 pushed the room's mission loop from J6 to J8, and eleven passages written
against the old cut were renumbered rather than left to be re-derived: the
architecture is J5–J8, the simulation slice — the room holding the mission and
broadcasting it — is **J8**, and the slice that gives another commander's leader
an input of its own is **J7**.

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
needed under the architecture that replaced it too. J8 cannot be "hand both clients the seed and let them run" until
every player-driven soldier takes the player path on BOTH clients, which is
exactly what the owner axis buys. The probe stays green after J1 — it drives one
input source, so the two runs still put different bodies under it; what J1 earns
is a second probe driving two owners with two traces, and *that* one going quiet
is the precondition for J8.

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

## What ends a mission (J2 — built)

Every one of these was scene-wide, and each was verified by driving a two-owner
`Mission` rather than by reading it. The splice is the last row, not the first.

| Site | Today | What J2 needs |
|---|---|---|
| `update()`'s early return | `if (this.endBanner) { … return; }` — one owner resolving **freezes the level for everybody**. Measured: the other commander's soldiers do not move for 30 steps | The banner is per owner and the step is not gated on it |
| `_resolve`'s guard | `if (this.endBanner) return` — the second owner's resolve is **silently dropped** | Per owner. `this.endBanner` and `this.result` both become per-owner. **As built:** they became ONE map, `this.ends`, of owner → `{ owner, success, timer, result, squad, done }`. Two parallel maps can disagree about whether a commander has ended, and every site below asks exactly that question; one record cannot. `endFor()` and `resultFor()` read it |
| `_finish` | Calls `this.stop()`, which ends the mission for everybody, and fires `onComplete` once | Fires per owner, and does not stop the scene. **It also needs an idempotence guard**: `stop()` killing the rAF loop is its only protection today, and with the loop alive it fired `onComplete` **104 times**. **As built:** the guard is the record's `done` flag, and it does stop the scene — but only once EVERY owner is done. "Does not stop the scene" is true of a commander leaving and false of the last one out, and at one owner the last one out is the only one, which is how single-player still ends |
| `_checkOutcome` | Calls `this.livingSoldiers()` with **no argument**, so since J1 it sees only the local owner — it never loops. Both branches narrowed, not just the losing one | Loops every unresolved owner, and skips resolved ones (an empty squad would otherwise read as wiped) |
| `this.control` | Maps owner → **index** into `scene.soldiers`, so the splice invalidates it. At two owners the departing owner's own entry is the dangerous one: after the splice it resolves to the *other* commander's live soldier, and nothing heals it — the local keyboard ends up driving somebody else's squad | Keys by soldier **id**. `_swapControl` already rescans per call and needs only the same change |

Two more the splice touches that no other row covers: `mission.js`'s own header
states "nothing joins or leaves `scene.soldiers` once it is built", which J2
falsifies; and `this._owners` is built once at start, so a resolved commander
keeps getting a no-op `_swapControl` every frame. **As built:** the comment now
says the opposite — `_owners` outlives the bodies in it — and `_handleControl`
skips resolved owners rather than letting the no-op run.

**Four things J2 shipped that the table did not ask for**, all found by
running it rather than by reading it:

| | |
|---|---|
| The splice takes the **living** half of a squad, not the squad | The slice row says "an extracted squad LEAVES the scene", and only ever describes extraction — so applying it to the whole squad removes the casualties too, and a commander still fighting watches the other one's corpses blink off the ground under them. In single-player it is worse: the "SQUAD WIPED" banner comes up over a level with no bodies on it. Whoever walked out is gone; whoever did not stays where they fell. It is not a second branch — on a wipe nothing is alive, so nothing is spliced |
| The end record carries **the squad as it left** | The HUD's squad cards read `soldiersOf()`, and the splice empties it — so a commander who extracts watches their own cards blank out under their own banner, for the 1.6s the banner is up. The cards come off `end.squad` instead, frozen at extraction. Which is also the only honest thing to draw: those soldiers are not on the level any more |
| The win/lose cue is gated on the **local** owner | `audio.play(success ? "mission.win" : "mission.lose")` fires inside `_resolve`, so an unguarded one plays another commander's extraction fanfare on this page. Their extraction is their news, on their machine |
| A page whose commander has gone home **keeps stepping the scene** | `_finish` only stops it when nobody is left, so the rAF loop runs on behind a hidden canvas while the other commander plays. It is unreachable today — one page holds one dispatch and one owner — and it is exactly the job J8 moves off the page and into the room. Named here so it is not discovered there as a surprise |

**`test/mission-divergence.test.mjs` is edited by J2, not left alone.** It sets
control with an index (`m.control.set(m.owner, controlled)`); id-keyed, that
call drives nobody and the suite's two probe assertions invert. It stays a
guard — it stops being one for free. **As built:** one line, resolving the
index the probe is parameterised on through the array (`m.scene.soldiers[controlled].id`),
and the suite is green and still failing its probe for the same reason.

**`src/main.js` passes the owner, but not unconditionally — and the plan was
wrong about this.** It says the missing fourth argument "is wrong for one of two
seats", which is true only once a dispatch carries owners, and `projectDispatch`
does not emit them until J5. Passing `current.playerId` today would name a
commander who owns nobody, because `loadMission` reads `s.owner ?? null` off a
squad that has none, and every partition in the mission would be empty. **As
built:** the seat is named only when the squad actually declares owners
(`current.squad.some((s) => s.owner != null)`), which is today's behaviour
exactly and J5's the day J5 lands. **J5 then deleted that guard**: a dispatch's
squad always declares owners now, so the condition was a tautology and the seat
is named unconditionally. `onMissionComplete` took the trailing
`owner` in the same commit and does not use it yet: this page holds one
dispatch, and it is the room that will have two (J8).

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

| | Server-authoritative (J5–J8) | Lockstep (superseded) |
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
| A commander's leader is player-driven | Only the LOCAL one is. Another commander's leader is stepped by the companion brain anchored to itself until J7 gives it an input of its own and J8 fills it —
which is also, exactly, the shape approximation 6 describes for a commander who walks away |

**`_checkOutcome` is NOT untouched, and this is a J1 behaviour change nothing
tests — in BOTH branches.** It calls `this.livingSoldiers()` with no argument,
whose J1 default is *this owner's* squad. So the losing branch narrowed from
"every soldier down" to "this commander's squad down", and the winning branch
narrowed the same way: measured, another commander standing in the exit produces
no banner and does not consume `scene.artifact`, and their squad being wiped
produces nothing at all. `test/mission-ownership.test.mjs`'s 44 assertions cover
neither. **J2 owns it**, and the fix is the loop in "What ends a mission".
J2 owns that. The one line J1 changed in it is the artifact grant, which now
records the soldier who tripped the exit, making approximation 4 true as written.
`this.squadIds` was deleted rather than partitioned, as the Background says.

**J1–J8 supersede the M2, M3 and M4 rows of `tech/multiplayer.md`.** Four
corrections, all found by reading the code rather than the plan:

| | |
|---|---|
| **M4 is not a slice, and half of it is already built** | Contested pickups need no work: `_updateLoot` walks soldiers and `break`s on the first overlap, so the race exists the moment a collected item knows whose it is. Attribution is `_resolve` partitioned. Independent exits is the one with weight, and it is J2 |
| **The checksum moved to the front, and asked a different question** | M3 listed it last, as what catches divergence once lockstep exists. Asked first, it ended the architecture instead — and it survives as a debugging instrument rather than a mechanism |
| **M3 is deleted, not re-cut** | "Lockstep input — two input streams through `src/mission/input.js`, input delay, and a rolling checksum" describes a design this document no longer follows. There is one simulation, so there is no second stream to reconcile and no delay window to tune |
| **A joint mission's campaign side is missing from the plan entirely** | Two results for one lead is J3, and it is a bug today rather than new work |
| **The dispatch has to change, and the map does not say so** | M2–M4 are all mission-side. A client cannot simulate a squad whose soldiers it was never sent, and board privacy is exactly why it was never sent them |

### What is per mission and what is per commander (J3 — built)

One rule, applied. **The mission decides what happens to the world; the
commander decides what happens to their base.**

| Field | Where it lives | Joint lead |
|---|---|---|
| `threatReward` → `campaignHealth` | World | **Once, if ANYONE extracted**, applied on the last report |
| The failure penalty and the doom charge | World | **Once, and only if NOBODY extracted.** The other branch of the same decision, never both |
| `cleared` (board pressure) | World | **Once.** It is the one field that does NOT hang off the lead lookup — it is guarded by the per-player `completedMissions`, so it increments for each reporter. It needs the opposite change from the rest of this table |
| `winsCampaign` → `world.wonBy` | World | **Once — and it is NOT first-writer-wins today.** **As built: first-SUCCESSFUL-reporter-wins**, guarded by `!world.wonBy`. It cannot go on the last report like the rest of the world half — the last reporter may be the commander who was wiped, and "victory is individual" (`design/multiplayer.md`) then records a winner who never got out. `state.js` assigns unguarded; it only looks safe because the second report never finds the lead, which is the bug J3 removes. Measured: with both reports finding it, `wonBy` goes A → B and A's `outcome` flips from `"won"` to `"ended"` **after A has been shown a win screen**. Guarding it is J3's work, not a freebie |
| The mission's log line | **Player** (Bo) | **Each, and it moves.** Today it is `"<mission> — success. Recovered N item(s)"` written into the world `log`, so one commander's private haul is read by both. It becomes a line in the reporting commander's own log, saying what *they* recovered. `log` is a world field, so this is the first player-scoped entry and J3 is where that shape arrives. **As built: BOTH lines moved, not just the success one.** The failure line names no count, so this row does not require it — but on a mixed outcome `"<mission> — failed. The squad was wiped"` in a shared log is read by the commander who walked out, about a squad that was not theirs and a mission that succeeded |
| `completedMissions` | Player | **Each.** It is that commander's record of what they were on |
| `highWins` → the finale gate | Player | **Each** — and it is broken today, because it DOES hang off the lead lookup (`mission && mission.difficulty === "high"`), so the second reporter gets nothing. Measured: A 1, B 0. A player field with a world-shaped bug |
| Loot, kills, wounds, casualties | Player | **Each, and already correct** — `applyMissionResult` matches them by id and J1's `_resolve` builds one result per owner |
| `record.missions` | Player | **Each, and not a result field at all** — it is incremented at deploy in `src/game/session.js` and refunded on stand-down. Listed because it looks like result bookkeeping and is not |

The lead leaves the board once, which is what it does today — `state.leads` is a
world field and the first report filters it. Everything else splits three ways
rather than one: **`threatReward`, the failure penalty and doom, the log line and
`winsCampaign` stop hanging off `state.leads.find(...)` succeeding** (the second
report will not find it); **`highWins` does too, and it is a player field**; and
**`cleared` needs the opposite fix**, because it is guarded by `completedMissions`
and so fires per reporter.

**The mixed outcome, settled (Bo): if anyone extracts, the mission is a
success.** One squad out and one wiped is a success — the same rule the mission
already applies inside a squad, where a partial wipe still succeeds, raised one
level. Failure is nobody extracting.

That makes the reward and the penalty two branches of one decision rather than
two independent rows, and it fixes **when** they are applied:

| | |
|---|---|
| The outcome is the union of the reports | Success if any report says success; failure only if none does |
| A solo failure is **unchanged** and still costs both players | `campaignHealth` is a `WORLD_FIELD`, so one commander's wipe on a lead they took alone charges the shared clock exactly as `design/multiplayer.md` says. The rule below narrows one case and one case only: a JOINT mission somebody extracted from |
| It is applied when the **last** report lands, not the first | Otherwise order decides it. A extracts at 30s and B is wiped at 90s pays then charges; B wiped at 30s and A out at 90s charges then pays. Both are wrong, and neither is what "there is only one mission" means |
| The session already knows when that is | `round.flight.outstanding` is a Set of dispatch ids and empties on the last report — the hook exists and J3 does not need a new one. **As built: it is read PER LEAD, not by waiting for that Set to empty.** `outstanding` emptying is the ROUND's signal and is already spent on the day; using it here as well holds a commander's solo reward behind an unrelated mission that happened to be flying beside it. What ships is one predicate over `round.flight.dispatches` — is any OTHER still-outstanding dispatch naming this `missionId` — passed to `applyMissionResult` as `{ last }`, defaulting true so single-player and every direct caller are unchanged |
| A commander's own consequences still land on their own report | Loot, wounds, casualties, kills, `completedMissions` and `highWins` are theirs and are applied when they report, not held for anyone |

**And the log line is per commander, not per world (Bo): it reports what THAT
player recovered.** Which is a real change of shape, because `log` is a world
field (`WORLD_FIELDS` in `src/game/state.js`) and `note()` writes there. So J3
carries the first player-scoped log entry in the game: the mission's own line —
outcome and that commander's haul — lands in the reporting commander's log, and
the world log gets nothing that names a count. This is what makes the privacy
rule ("never disclosed: what they recovered") true of the log as well as the
HUD, and it is a slice-sized addition rather than a wording change.

**Three things J3 shipped that the table did not name**, all found by writing
it rather than by reading it:

| | |
|---|---|
| A **ledger on the world**, because "the second report will not find it" describes the problem and not the fix | Every world consequence used to be `state.leads.find(...)`, and the lead is off the board by the time the second report arrives. `world.reports` is a Map of lead id → `{ name, difficulty, threatReward, winsCampaign, success }`: the first report copies the four fields resolution reads, `success` accumulates the union of the outcomes, and the last report spends the entry and deletes it. Empty except between the two reports of one joint mission. It is also what makes a **stray repeat report a no-op** — no entry and no lead means no second payout, which is precisely the shape `cleared` was missing |
| The **log is a merge, not a move** | `log` stays a `WORLD_FIELD` and gains a non-enumerable private half (`ownLog`) beside it; the campaign's `log` accessor merges the two newest-first on read, so the hub, the view and the wire keep reading one list and none of them learns there are two. `note()` writes the world's half through `worldOf` (it can no longer unshift into `state.log`, which is now a computed array); `noteOwn()` writes the private half **and falls back to the world log when the campaign has no owner** — which is every single-player campaign, so a solo log is unchanged line for line and the golden path never sees the merge |
| **`cleared` moved out from under `completedMissions`** | The table says it "needs the opposite change from the rest", and the opposite change is not a guard — it is a move. It now sits in the world half beside `threatReward`, incremented once on the last report if the mission succeeded, which makes it a property of the LEAD rather than of a reporter. Its old guard stays where it is and keeps doing its own job: stopping one commander banking one lead twice in `completedMissions` |

**What J3 deliberately did not move: the casualty lines.** `"<name> was killed
in action."` is still written to the world log, so a commander reads the names
of the other base's dead. It is a real disclosure and it is not in the table
above — the rule Bo settled is about the mission's own report line, and every
other line in `applyMissionResult` was left where it was rather than have this
slice decide a privacy question nobody asked it. `noteOwn` is the one-line
change the day it is wanted.

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
| **The whole prototype** | `netproto/` | Not imported — measured, then read. The loop shape (deadline-corrected fixed step, catch up at most 5, resync rather than teleport), the wire format (`{seq, l, r, jump, fire, ax, ay}` in, snapshot plus per-recipient `ack` out), the dependency-free RFC 6455 server, `setNoDelay`, and the two bugs its smoke test caught — events cleared per step but sent per broadcast, and a closed socket leaking a player — are the design J8 copies. It stays standalone: **nothing in `src/` imports it and it imports nothing from `src/`** |
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
| `src/game/state.js` | J3, built. `applyMissionResult` stops assuming it is the only report for its lead: a third argument `{ last }` (default true), a `world.reports` ledger the lead's facts outlive the board in, the world half moved behind `last`, `cleared` moved out from under `completedMissions`, a guard on `wonBy`, and `noteOwn` beside `note` for the private half of the log |
| `src/game/session.js` | J3 and J5, both built. The round learns that two dispatches can name one lead, and says so in the pair it emits. **J3's half is one predicate in the `missionResult` case**: is any other still-outstanding dispatch naming this lead. J5's is the pairing on the projection — dispatches grouped by `mission.id` in `closeRound`, and `projectDispatch` taking a second argument it writes as `joint` only when there is one. Deploying twice to one lead replaces the choice (S5), so a lead's group is already one dispatch per commander and needs no dedupe |
| `src/net/rooms.js` | J5 and J8. **As built: J5 changed no line of this file**, which the Reuses table predicted in as many words — "J5 changes what a seat is sent, not how". The pairing rides on the dispatch, `routeRound` still keys on `playerId`, and each seat still gets its own dispatch and no other's; `test/service.test.mjs` drives two seats onto one lead to say so. A room holding the pairing itself has no reader until J8, which can group `room.announced` by `mission.id` when it needs to. J8 is still all of the row below. A room gains a mission in flight beside its campaign: which seats are in it, and the per-seat snapshot it hands out. **It does not hold the loop and does not construct the `Mission`** — `test/session.test.mjs` source-scans this file for DOM globals and `localStorage`, and that assertion stays true |
| `server.mjs` | J8. The socket, the room's `Mission`, and the deadline-corrected fixed-step loop that drives it. No suite imports this file — `netproto/ws.mjs` is the dependency-free WebSocket to copy, and `netproto/server.mjs`'s loop (catch up at most 5 steps, then resync rather than teleport) is the shape |
| `src/mission/mission.js`, `src/mission/input.js` | J6 and J7. A host-free construction path (no `input.enable`, no rAF), and input that arrives per owner rather than from one device. `_applyAim` takes aim already in **world** coordinates, because a server holding one scene cannot resolve two viewers' cameras |
| `src/net/mission-socket.js` (new) | J8, browser half. Opens the socket, sends input at a fixed rate, drops a snapshot older than the one on screen. Beside `src/net/remote.js` rather than inside it: that file is the turn-boundary client and its three names are pinned |
| `src/mission/input.js` | J4, built. Sampling per step and a frame index. The read API is `isDown` / `justPressed` / `aimSource` and should not move — **and it did not: the three names stayed, and what moved underneath them is which state they read.** `sample()` latches keyboard, pad and mouse into one frozen frame, stamps it with `frame` (the step index, reset by `enable()`, i.e. numbered per mission), and CONSUMES the device's pending edges: a press that arrived while no step ran is latched by the next sample, and one that no site read is dropped rather than re-offered every step. **`pollGamepad()` moved inside `sample()`** so all three sources speak for one instant — which is also what changes the pad's poll rate, see approximation 3. `src/editor/tools/firing-room.js` and `src/editor/tools/enemy-designer.js` are the two other callers and now take a sample at the top of their own `step(dt)`; they are variable-step previews, so their step is their frame and nothing about them changes |
| `src/main.js` | J2, J5 and J8. **J5's share is one line**: J2 named the seat only when the squad actually declared owners, which was a guard against a projection that did not emit them; now that it does, the guard is a tautology and `mission.start` takes `current.playerId` unconditionally. Per-owner `onComplete`, and **the `owner` argument `mission.start` is never passed** — `start(current.mission, current.level, current.squad)` has no fourth argument, so J1's default makes the local commander whoever spawned first, which is wrong for one of two seats (J2). Joint missions starting together rather than in a queue (J8) |
| `src/net/mission-wire.js` (new) | J8. The input packet and the snapshot — the one place a scene is narrowed for the wire, **per recipient**. **What a snapshot MUST carry is the other commander's squad**: `design/multiplayer.md` says their squad is "visible only on a level you are both standing on", and a joint level is that place. Position, facing, stance, health and aim — what a soldier is drawn from. Not their loot, not their result. Stated because every other rule here is subtractive, and "per recipient" read as "your own squad only" would pass all of them while deleting the feature. `netproto` sends everyone the same snapshot because a one-screen arena has nothing to hide; this game does: `design/multiplayer.md` never discloses what another commander recovered, and `sampleScene` in `src/mission/checksum.js` — the honest starting list — carries exactly that |
| `src/mission/render.js`, `src/mission/mission.js` | J8, browser half. A page in a joint mission draws a snapshot. **"Keep rendering, stop updating" does not work as stated**: `_updateCamera` is the last call in `update()`, and `this.time`, the particles, the shake, the damage flash and the intro timer all advance there while `render()` reads them. So a viewing page still steps its cosmetic and camera state; what it stops doing is simulating gameplay, and the snapshot replaces the fields `sampleScene` names rather than the whole scene |
| `test/mission-ownership.test.mjs` | **Exists, committed with J1**, 44 assertions covering the axis, the line-up, control that cannot cross, the dead-leader swap, escort anchoring, loot credit, per-owner `_resolve`, and the team/owner boundary. **As built (J2): 72**, and the 28 it gained are the whole of the second half — an exit that ends one mission and not the other, a level that keeps moving for whoever is left, an extracted squad that leaves the array while nobody else's control shifts, a keyboard whose commander has gone home reaching nobody, a resolved owner `_checkOutcome` skips rather than reading as wiped, the losing branch J1 narrowed, `onComplete` firing once per commander over 200 frames rather than 104 times, the artifact going to whoever extracted first, and a result frozen against the round still in the air |

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
| `test/mission-golden.test.mjs` | **The load-bearing one.** A mission replays from its seed at a fixed step, at one owner. A re-baselined golden here is the bug, not the fix. Two things it did NOT guard, which is why it is not sufficient: it drives `m.update(STEP)` directly and never runs `_frame`, so **J4 is invisible to it**; and its 41 samples never resolve, so it says nothing about `_checkOutcome` or `_resolve`. **As built (J4): the first of those is no longer true.** Section (4) drives the real `_frame` off a synthetic clock at 20, 30, 60 and 144fps and asserts all four play the mission a bare `sample()`/`update(STEP)` loop plays. The golden's own 41 samples and its baseline did not move — the new block builds its own missions and shares the file for the trace, the level and the sampler. It also asserts what J6 and J8 will stand on: **a mission stepped with no frames at all is the same mission** |
| `test/session.test.mjs` | The round, the gate, the visibility rules — and it pins the dispatch's key sets (`mission` is exactly `id`, `name`, `seed`) and reads `src/main.js` as text, matching `runRound` and the round-drain ordering. **J5 and J8 edit those assertions in their own commits**; the spec that says a suite changes nothing here would be wrong. **As built, J5 edited none of them and added 10**, because the two things it adds are new keys — one on the squad entry and one on the dispatch — and neither is inside a pinned set. The `owner` cases went beside the projection block that would have missed them; the pairing went into J3's two-commanders-on-one-lead block, whose setup is already one solo mission flying beside one joint one, and whose header now names both slices. **J3 added 9 and edited none**: three dispatches, two of them on one lead, driven through the real command path — the solo one paid on its own report while the joint one is still flying, which is the assertion that says `last` is per lead rather than per round |
| `test/transport.test.mjs` | The wire and the client's three names, and it pins the dispatch projection too. J5 adds the pairing to that projection and edits it deliberately. **What it must keep pinning is that a dispatch carries only its own seat's squad** — the server-authoritative design means that never has to widen, and a slice that widens it has leaked another commander's board for no reason. **As built: nothing was edited here either, and J5 added the pin that was missing.** `squad[0].data` was pinned as a key set and `squad[0]` itself was not — so the object that carries everything a commander brought could have grown a field silently. It is now pinned to exactly `data`, `owner`, `weapon` |
| `test/service.test.mjs` | The room and its per-seat push; J5's pairing lands here — **as built, 10 assertions driving two seats onto one lead through the real registry**: both dispatches name one lead, each is routed to its own commander, both carry the same commanders in the same order, and neither seat is sent the other's squad or anything about it. `config.leadVisibility` is pinned to 1 for the room's construction, because which seats see a lead is otherwise a coin flip and a joint deploy needs one lead two commanders can both see. **It cannot see `server.mjs`** — its own header says so, because that file binds a port on load — so J8's loop is guarded by a headless two-seat drive instead, not by this suite |
| `test/controls.test.mjs` | The control map and `MissionInput`'s three sources — **and, since J4, the latch itself**: a read before any sample is silent rather than a crash, a sample is frozen against the device moving under it, a press that arrives while no step ran survives to the next sample, an unread edge does NOT survive its step, a pad hold outranks a key reported up, and the frame index counts samples and restarts with `enable()`. Six cases here and the mission-side proof in the golden, because the latch and the loop fail differently |
| `test/mission-divergence.test.mjs` | J0's probe. **It stays green and stops being load-bearing**: it now guards that one process replays itself, which is `tech/mission-determinism.md`'s original claim, rather than gating an architecture |
| `test/wiring.test.mjs` | `applyMissionResult` end to end — and it applies exactly one result per lead and asserts the lead is removed, which is the assumption J3 breaks. J3's new cases go beside it. **As built: 53 → 89**, and not one existing assertion moved, because `last` defaults true and every case above the new block files one result per lead. The 36 are eight blocks — a joint clear paying once, the mixed outcome in BOTH report orders, a joint wipe charging once, the finale gate reaching both reporters, the two report lines contradicting each other in two private logs, `wonBy` surviving the second report, a repeat report on a spent lead paying nothing, and a solo wipe still costing everybody |
| `test/mission-enemyspec.test.mjs`, `test/enemyspec-targeting.test.mjs` | Enemies hunt the squad — `hostilesFor` returning `scene.soldiers` is an identity assertion. J1 must not narrow what an enemy sees to one owner |
| `test/combat.test.mjs`, `test/crouch.test.mjs`, `test/companion-aim.test.mjs` | Damage, friendly fire, ducking, companion targeting |
| `test/locomotion-characterization.test.mjs` | The strictest fixture in the repo. Nothing here should reach the locomotor |
| `test/docs.test.mjs` | Citations and the seven parts |

**Where the bar cannot see this.** `src/main.js` and `server.mjs` are imported
by no suite; J2 and J8 both land in them, and `src/main.js` is guarded only by a
source regex in `test/session.test.mjs` and by playing. **J4's only guard is
playing single-player at a bad frame rate**, because the golden already lives in
the world J4 creates. **As built: wrong, and J4 shipped the guard.** The rAF
loop is a pure function of a clock and the clock is an argument, and rAF is a
no-op under the harness — so four frame rates run in one process off one trace,
and the comparison is exact rather than tolerant because it is the same
arithmetic in the same order. Verified by reverting the slice: sampling once per
rendered frame reddens all four rates, 60fps included, because a float clock
makes even a nominal 60fps frame carry two steps or none. What stays true is the
narrower claim underneath it: **how the change FEELS is still only measurable by
playing** (approximation 3). **J8's loop is guarded by a headless two-seat drive** —
`netproto/smoke.mjs` is the shape: start a server on its own port, connect two
clients, drive them, assert. It found both real bugs in that prototype's first
build, and it is deliberately not in `node test/run.mjs` there. J8's equivalent
**should** be, because by then it is a subsystem rather than a probe.

## Approximations

| # | Where it is not exact | What catches the failure |
|---|---|---|
| 1 | **Two humans cannot drive two squads on one machine, so J1 and J2 are not playable before J8.** The Mission holds one `MissionInput` and one `controlled`, and `src/main.js` disables seat swapping mid-mission. Hot-seat gives one commander plus AI escorts wearing another owner's colours — useful for looking at, worthless as proof of feel. The headless suites are the real guard, and the first time a joint mission is *played* is J8 | Nothing. Stated because "we can try it in hot-seat first" is the assumption a builder would otherwise make, and it is false |
| 2 | **Floating point stopped being a risk by being designed around.** J0's second half measured Chrome 151 and 152 agreeing and node's older V8 disagreeing on four transcendentals, which is what moved the network half to one authoritative simulation. Under J5–J8 nothing about the client's engine, version or CPU can affect gameplay state, because the client computes none of it | Nothing needed, and that is the point. The probe pages stay in the tree as the record of why, and as the instrument if the question ever returns |
| 2b | **Full round-trip input latency is the price, and it is not hidden.** No prediction, no interpolation. `netproto/` measured the floor: ~60ms input→pixels at ~35ms RTT and 20Hz snapshots, which plays well, and 245ms at 210ms RTT, which does not. A distant player has a worse game than a near one, permanently | Nothing in the bar can see this. It is measured by playing, and the numbers to beat are in `netproto/README.md`. Prediction is the known remedy and is deliberately not in this plan |
| 3 | **J4 can change how the game feels, in single-player, for nobody's benefit.** Moving input sampling from once per rendered frame to once per step changes when a press is observed relative to a step boundary. It is a fraction of a frame, it is the correct behaviour, and it is the kind of thing a player notices as "heavier" without being able to name it. **As built, one thing to eyeball beyond that: the GAMEPAD is now polled per step rather than per rendered frame**, because `sample()` reads all three sources at one instant. Above 60Hz that lowers its poll rate to 60Hz, so a pad button held for less than one step can be missed where before it had to be shorter than one frame. A press is tens of milliseconds and a step is 16.7, so this is a theoretical loss rather than an observed one — but it is the only thing J4 made strictly worse | Playing it, with a pad. The golden sees the mission, not the feel |
| 4 | **The artifact is an indivisible reward and J2 hands it to whoever extracts first, automatically.** Every generated level carries one (`src/game/gen/levelgen.js`), and `_checkOutcome` grants it to whoever trips the exit and nulls it. `design/multiplayer.md` explicitly wants the case where two players who cooperated end with something only one can hold — so the outcome is right and the *mechanism* is an extraction race rather than a pickup race, which is not what "first to reach it" describes | Nothing here. Named because it is a design-visible rule being set by an implementation detail, and Bo should know it is being set |
| 5 | **A joint mission runs on the SERVER's config, and nobody's browser settings apply — the knobs stay knobs, but nothing can turn them.** Friendly fire is still the toggle `design/multiplayer.md` specifies and still defaults off; what a room lacks is any path to SET it, because the server has no `localStorage` and so reads built-in defaults. `config.friendlyFire`, `gravity`, `aimSpread` and fourteen other knobs are localStorage, read live through the mission's `_ctx` getters. In the room they resolve to built-in defaults — `tech/multiplayer-service.md` approximation 11 by another route, and now it reaches gameplay feel rather than just the campaign. It is no longer a divergence risk, because there is one reader; it is a **surprise**: a solo mission and a joint mission on the same machine obey different numbers | Nothing. **Deferred by Bo, deliberately, after J8.** Shipping config to the room is its own slice and is the most visible thing this architecture does not do |
| 6 | **A commander who leaves mid-mission is nearly free now, and is still not built.** The server holds the only simulation and `updateCompanionSpec` already drives every unpiloted soldier, so the design's "handed to the AI and fights on as companions" is a socket close feeding one flag. `tech/multiplayer-service.md` approximation 10's deadlock does NOT survive this architecture — the mission runs on regardless of who is watching — but the flag and the result routing are unwritten | Nothing. Recorded because the blocker shrank twice: first from "needs a second simulator" to "needs a signal", now to "needs a signal we are already given by the socket" |
| 7 | **The HUD's loot counter is scene-wide and would leak what the other commander recovered.** `design/multiplayer.md` never discloses what somebody else carried out. The count is fed by one shared `scene.collected`, so J1's partition has to reach the HUD or it becomes the one field that tells you | `test/mission-ownership.test.mjs` (new) can assert the count, but the leak is a rendering fact and the real guard is looking at it |
| 8 | **The checksum samples, it does not hash the scene.** A named list, for the same reason the golden samples: cosmetic state is unseeded on purpose and would fail every comparison | The list is the thing to extend when a divergence slips past. A checksum that never fires is not proof of agreement |
| 9 | **"Both missions begin at the same moment" is narrowed to joint ones.** Two commanders on two different leads still play whenever each gets there | Deliberate. Synchronising unrelated missions makes one commander wait on another's reflexes for nothing the design asks for |
| 10 | **One process owns a match, and that cannot be scaled away.** `netproto/README.md` measured the escape hatch and closed it: a shared store is fast enough (p50 0.02ms on 1KB) and still wrong, because a tick is read-world / compute / write-world and two processes doing that need a lock that serialises them back into one. Sticky routing to the room's process is the only answer, and there is no matchmaker | Nothing at two players in one room. It is the first thing to hit if this ever has more than a handful of simultaneous missions |
| 11a | **A snapshot must be filtered per recipient, and the model it is copied from is not.** `netproto` broadcasts one payload to everybody because a single-screen arena has nothing to hide. Here `design/multiplayer.md` says what another commander recovered is never disclosed, and the honest starting list (`sampleScene`) carries the collected count and each drop's collected flag. The per-recipient shape exists in `netproto` for one field only — `ack` | `test/service.test.mjs` can assert a seat's snapshot carries no other seat's loot, the same way it already asserts a seat's campaign snapshot carries only its own projection |
| 11b | **The splice does NOT remove the stale-scene hazard, and this row said it did.** An extracted `Soldier` is out of `scene.soldiers` and still reachable from two places that keep mutating it: a projectile in flight (`p.owner`) and a root's `_lastAttacker`. Measured: a round fired before extraction kills a root afterwards and increments `ana1.kills` to 1, while the result already reported says `kills: 0`. So the kill is **lost, not misattributed** — `_resolve` froze `killsBySoldier` at extraction and nothing reads the object again | `test/mission-ownership.test.mjs`. Letting the round land is still the answer that needs no special case; what needs stating is that its kill goes nowhere, and that anything J8 adds which re-reads a soldier object after extraction is reading a squad that went home |
| 11c | **`sampleScene` identifies soldiers by POSITION, so an extraction renumbers them.** `src/mission/checksum.js` emits `soldiers[i].*` by index; measured, splicing the first owner makes slot `soldiers[0]` stop being `ana1` and start being `bo1`. That is harmless for J0, which compares two runs of one scene — and wrong as the starting shape for J8's snapshot, which this document twice says it is. A wire that identifies a soldier by array position teleports every other soldier the moment somebody extracts | Naming it here. J8 keys by soldier id, and J0's suite is unaffected either way |
| 11 | **The mission's live scene is bigger than a snapshot, and what gets sent is a judgement call.** `netproto` sends positions rounded to a tenth of a pixel and never sends velocity, deliberately, so a client cannot half-predict. This mission has spec roots with nested parts, brains, statuses and effects — `sampleScene` in `src/mission/checksum.js` is the starting list, but rendering needs fields a checksum does not | The bandwidth readout `netproto` already carries. J8 should print snapshot size from its first day, because the first version that sends the whole scene will work on a LAN and fail on a wire |

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
| `_checkOutcome` | Read pre-J1. **Since J1 it calls `livingSoldiers()` with no argument, so BOTH branches see only the local owner and it never loops** — another commander's extraction or wipe is not detected at all. Measured. J2 makes it loop |
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
answers arrived before any of J5–J8 existed: the stream-order failure named work
(J1, which shipped and is useful regardless), and the V8-version disagreement
named a dependency that could not be worked around. Had the probe run last, as
the phase map had it, the finding would have arrived with two input streams, a
delay window and a reconciliation loop already written against it.

The generalisation worth keeping: **a slice whose only output is an answer is
worth scheduling first when a later slice is built on an assumption nobody has
tested.** Everything else in this document was worth building whether or not J0
passed, which is exactly why it should not have waited behind them.
