---
type: tech
category: gameplay-systems
status: building
resolution: sharp
needs: [multiplayer-state]
related: [multiplayer, multiplayer-state, mission-determinism, campaign-pacing]
tags: [multiplayer, transport, session]
---

# Multiplayer session

The transport seam: the page stops holding the session and holds a **client**,
and everything between them is data. Implemented in-process first, so the
interface is proven before a socket exists.

## Slices

| # | Slice | Changes runtime behaviour |
|---|---|---|
| **W1** | **The client seam, and the loopback behind it.** The page connects to a session and gets one client per seat instead of the session object. Commands go out through the client and answers come back through a callback rather than a return value — **eight sites**: the seven `api.command` calls in `src/hub/hub.js` and `onMissionComplete` in `src/main.js`, whose answer is the round's day summary and can only land on the results screen. The loopback delivers on a microtask and **checks that every payload survives a JSON round-trip**, which is what makes "the interface is proven" a fact rather than a hope. Each of those eight sites also **commits its own control on send and reconciles on the answer** — the button reads as pressed immediately and snaps back with the refusal if the session says no. That is done here rather than at T2 because these are the same eight edits, and doing them twice is the only alternative. Views and dispatches are untouched: the client hands over the same live view object the page reads today | No — but the page's existing microtask deferral stops protecting what it was written to protect. See Approximations |
| **W2** | **Dispatches are pushed, and projected on the way out.** The round stops being pulled and is **announced by the session** — whole, in order, once, to the HOST, because the page is what sequences a round and follows the seat through it. The announcement is handed in at construction; `session.takeRound()` stays, because the session's suite drives the session directly and its public surface is six names either way. A dispatch also stops carrying the raw lead and carries a projection, the way a view already carries a projection rather than the lead. That is not tidying: **today's dispatch cannot cross the wire at all** — `mission.seenBy` is a `Map`, which `src/net/wire.js` refuses — and it carries the generated level twice, once as `level` and again inside `mission.level` | Yes, once invisibly and once not. Invisible: the payload halves, and stops naming which other commanders have seen the lead. Visible: with `dayPerDeploy` off, a soldier on two of one commander's pending choices starts the second mission at the wounds they had when the round **locked**, not the wounds the first mission gave them |
| **W3** | **The view crosses the seam.** The client stops handing over the session's live projection and holds a snapshot, refreshed by a push. **The push is a broadcast**: one seat's command routinely moves shared world state and other seats' campaigns, so every client is refreshed, each with its own projection and nothing else. The hub and the ambient layer keep reading through a stable handle rather than through the snapshot object itself. `session.view()` is unchanged — the server half still projects live, which is what keeps its suite meaningful | Yes — the hub renders a copy, so identity between what is drawn and what the campaign holds is gone |

**W1–W3 are what `tech/multiplayer.md`'s Phase 2 table calls T1.** That row is
superseded by this document, the way M1's was by `tech/mission-determinism.md`.
Two corrections to it: T1 is three landable slices, not one, and **the read half
of the seam is inside it** — the row implies only `connect` / `send` /
`onCommand`.

**Why the view moves now and not at T3.** The plan gives per-client views to T3.
The write half of the protocol is already data — the hub sends ids and the
session resolves them — so a seam that leaves the read path as a direct
in-process reference proves close to nothing. Every real cost is on the read
side: live getters, aliased arrays, object identity the mission and the results
screen sit on, and a hub whose only refresh path today is a seat swap that
deliberately destroys the screen it is on. Discovering that at T3 means
discovering it after a node process exists and while hot-seat is being deleted.
W3 pays it here, in one page, with the whole suite still watching.

**What a dispatch carries after W2.** The rule is what the mission and the
results screen READ, and it was derived by reading them, not by narrowing what
looked unnecessary.

| Field | Read by |
|---|---|
| `dispatchId`, `playerId` | `src/main.js` — the seat swap and the report routing; `src/game/session.js` closes the flight on the id |
| `mission.seed` | `src/mission/mission.js` → `loadMission` → `makeRng`. **The whole of `tech/mission-determinism.md` hangs off this one number** |
| `mission.id` | `result.missionId`, which `applyMissionResult` matches the lead on |
| `mission.name` | The intro banner, and `result.missionName` |
| `level` | `loadMission` — whole, and once. Approximation 7 |
| `squad[].weapon` | `Soldier`, the reload path, `weaponSound`, every effect in `combat.js`. Whole |
| `squad[].data` | `id`, `name`, `callsign`, `wounds`, and `stats.health` / `stats.aim` / `stats.speed` — the seven fields `src/mission/entities.js`, `src/mission/ai.js` and `src/hub/hub.js`'s `_nameFor` read between them. Nothing in `src/mission/` reads `record` |

Everything else on a lead — `difficulty`, `threatReward`, `winsCampaign`,
`brief`, `daysLeft`, `report`, `seenBy` — is read by `applyMissionResult` off
the **live campaign lead**, never off the dispatch, so dropping it costs
nothing.

They land in order, and any prefix is shippable.

## Reuses

| What | Where | Used for |
|---|---|---|
| `createSession`, its command switch, `view`, `takeRound` | `src/game/session.js` | The authority. This spec wraps it. Refusal wording, the round's bookkeeping, the day charge and the gate are not touched by any slice |
| **Commands are already data** | `src/hub/hub.js`, `src/main.js` | Seven of the eight carry ids and nothing else (`{ type, leadId, soldierIds, weapons }` at its widest), with the session resolving them against its own campaign. The eighth, `missionResult`, carries the mission's own report object — itself id-keyed and already JSON-shaped. The write half of the protocol needs no redesign, which is why W1 is small |
| **A mission result is already id-keyed** | `src/game/state.js` | `applyMissionResult` matches survivors, casualties, wounds and kills by id and reads nothing by reference, so a squad's report crosses a wire exactly as it stands |
| `dispatchId` | `src/game/session.js`, `src/main.js` | A round's missions are already routed by id rather than by which seat is on screen — the identity a push needs, built at S5 for a different reason |
| `projectLead` and the view's field list | `src/game/session.js` | What a commander may hold is already decided, already narrow, and already pinned by a suite. W2's dispatch projection and W3's snapshot copy **the decision** — a projection beside `projectLead`, pinned the same way. **Not the field list:** `projectLead` has no `seed`, and `loadMission` treats a missing seed as "install no stream" and plays on, so reusing it would un-seed every mission with nothing going red |
| The DOM-free, storage-free rule **and its assertion** | `src/game/session.js`, `test/session.test.mjs` | The property that lets the session run somewhere else. Asserted rather than trusted, and the new modules inherit the same rule |
| The five bindings a seat swap moves | `src/main.js`, `src/hub/hub.js`, `src/hub/ambient.js`, `src/hub/hotseat.js` | A client per seat re-points the same four things `swapTo` already re-points. The shape is built; what hangs off it changes |
| The source-scan guard | `test/session.test.mjs` | No suite imports `src/main.js`, so its bindings are pinned by reading the file. It matches the seat assignment literally, so the slice that changes that binding's shape edits the assertion in the same commit |
| The hot-seat switcher | `src/hub/hotseat.js` | Written to be deleted at T3. Untouched here — one page holding several clients is exactly what it already expresses |

## Where the code goes

| Path | Change |
|---|---|
| `src/net/` (new) | The transport interface, the loopback implementation, and the client the page holds. DOM-free and storage-free, the same rule `src/game/session.js` keeps, because T2 runs half of this in node |
| `src/game/session.js` | Learns to announce — a round's dispatches (W2) and a state change (W3). **Taken in at construction, not exposed as a method**: the suite asserts the session's public surface is exactly six names, and that assertion is a statement about the seam rather than an accident. `takeRound` is one of those six and **stays** — the session's own suite drives the session with no transport in front of it, and removing it would redden that assertion for nothing. Also gains the dispatch projection, beside `projectLead`. The announcement fires from `closeRound`, **after `round.flight` is set** (a report arriving first must find a flight) and **only on the branch that has dispatches** — the nobody-deployed branch returns early and there is no round to announce |
| `src/main.js` | Connects instead of constructing, holds a client per seat, and receives the round it used to pull. Two answer sites move, not one — the ready click and the mission report. **The construction order is the constraint at W2**: the session needs its announcement channel before the loopback that carries it exists, and today the page builds the session first. The transport is what closes that loop, so the dispatch crosses `toWire` like everything else rather than being handed over in-process behind the seam's back |
| `src/net/loopback.js` | Stops forwarding `takeRound` to the session and starts receiving the announcement, putting it through `toWire` and holding it. `transport.takeRound()` survives as the HOST's drain of what was announced — the page still decides *when*, which is what keeps W1's ordering (below) |
| `src/hub/hub.js` | Its `api` object stops answering synchronously (seven sites), and it gains a refresh path **distinct from `setView`**, which is a seat swap that clears the screen's transient state on purpose |
| `src/hub/ambient.js` | Reads its roster every frame, so it takes the same stable handle the hub does rather than a snapshot object captured once |
| `test/transport.test.mjs` | The loopback: delivery order, a payload that does not survive a round-trip refused, one client per seat, a snapshot carrying only its own seat's projection, and a broadcast reaching every client. W2 edits its two `takeRound` assertions and adds the announcement, the projection's field list, and the buffer |
| `test/session.test.mjs` | The `src/main.js` source scan follows the bindings it pins. **W2 also rewrites the identity assertions it cannot keep** — `mission === leadOf(...)` and `squad[0].data === roster[0]` become assertions about the projection, in the same commit, and the comment beside the live-soldier one explains what changed rather than being deleted. **As built:** two, not six. The level and both weapon identities survive untouched — see As built (W2) |

Conventions from `CLAUDE.md` that bind: no dependencies; **no build step and no
process** — `server.mjs` stays a static file server until T2, and single-player
keeps the plain URL; every `localStorage` access guarded, which the new modules
satisfy by touching none; single-player goes through the transport too, for the
same reason S1 put it through the session.

## The seam

**Owns:** the transport interface and its loopback, the client handle the page
and the hub read, the session's outbound announcements, and the projection a
dispatch crosses the seam as.

**The seam is a wrapper, not a rewrite.** Everything it carries already exists in
a form that can cross it — commands are ids, results are id-keyed, dispatches are
routed by `dispatchId`, a view is a fixed field list. What this spec adds is the
boundary those things pass through, and the discipline that they pass through it
as data.

**There are two outbound channels, not one.** The view is the one S6 hardened;
the dispatch is the other, and until W2 it carries the raw lead — `level`,
`report`, and `seenBy`, which states exactly who else is looking at that lead.
Board privacy is a property of what leaves the session, so both channels are
projected or neither is.

**Must not touch:**

| Boundary | Why |
|---|---|
| Command semantics | Refusals and their exact wording, the round's ordering, the day charge, the deploy cap. All `src/game/session.js`'s, all pinned by `test/session.test.mjs`. This changes how a command ARRIVES, never what it does |
| The session's public surface | Six names, asserted. An announcement is handed in, not hung off the object |
| Game rules | `src/game/state.js`. A transport that starts adjudicating anything has become a second authority |
| **The round starts off the answer, never off the push** | `closeRound` runs inside `session.command`, so the announcement reaches the host **before** the loopback delivers the answer that the hub renders on. Starting the round from the announcement handler therefore puts the canvas on screen mid-render — exactly the hazard W1's ordering was written to avoid (Approximation 4). The push fills a buffer; `roundClosed` is still what starts the round |
| **The optimism stops at the control** | A pressed button may look pressed before the answer lands. Nothing derived from campaign state — money, the roster, the board, the day — may be predicted, because predicting it means implementing the rules a second time on the client, which is the previous row by another route |
| The mission scene | `src/mission/`. Not one line of it changes. W2 changes what is INSIDE the three arguments `Mission.start` already takes, never the call — which is why the fields above were read off the mission rather than chosen |
| What a commander may see | The view's field list, `projectLead`, and now the dispatch projection. Anything that copies more than those leaks another commander's board — decision 4 of `design/multiplayer.md`, and the thing S6 spent a slice on |
| The page's ordering | `src/main.js` decides which of a round's missions plays first, what is drawn between them, and whose base is on screen meanwhile. W2 changes how the round arrives, not who sequences it |
| `src/hub/hotseat.js` | Deleted at T3, not here. Hot-seat is how this gets played before a server exists |
| `src/player2/` | Its `TaskQueue` is bounded concurrency with retry against an HTTP API, not a message channel. The transport does not go through it and does not grow retries at T1 |
| The single-player URL | One seat, one client, one loopback, no query string, nothing added to the page |

## Must not regress

The whole suite, as always: `node test/run.mjs` green before any slice commits.
The table is which suite watches which part of this seam.

| Suite | What it guards |
|---|---|
| `test/session.test.mjs` | The command switch, the deal, the ready gate, the deploy commit, visibility, the finale — 232 assertions, whose SEMANTICS the transport must leave untouched. Not the file: W2 rewrites the dispatch-identity assertions listed above, because identity is the thing it deliberately removes. Two are load-bearing for this spec in particular: **the session's public surface is exactly six names**, and **the view reads through live and aliases the campaign's arrays**. W3 adds a copy on the client; it does not turn the projection into one |
| `test/wiring.test.mjs` | State wiring end to end — generated leads, `loadMission`, result application, the boss gate — through the actions a command delegates to |
| `test/hubambient.test.mjs` | The ambient layer, whose roster read is per-frame and therefore the one consumer a naive snapshot silently freezes |
| `test/mission-golden.test.mjs` | A mission replays from its seed — and that is ALL it says. It builds its own level and squad literals and never constructs a session, so **it does not see a dispatch and would stay green if the projection dropped `seed` entirely**. The guard for the projection is `test/transport.test.mjs`, which must assert the seed by name, plus playing it |
| `test/docs.test.mjs` | This document's citations, and the seven parts once its status leaves `unbuilt` |
| Everything else | Nothing in this spec should reach the generator, the editor or the audio layer. If it does, the seam leaked |

**Where the bar cannot see this at all:** `src/main.js` and `src/hub/hub.js` are
imported by no suite. Every slice touches both, and the page's scene ordering —
which W1 disturbs — is guarded by playing it and by nothing else.

## Approximations

| # | Where it is not exact | What catches the failure |
|---|---|---|
| 1 | **The loopback is not a wire.** A round-trip check catches a payload that is not data. It cannot catch ordering, loss, latency, or two clients racing on one command | Nothing here — those are T2's, and they are the reason the seam is built before the socket rather than with it |
| 2 | **A round-trip check is not a schema, and a comparison is not a check.** `JSON.stringify` refuses almost nothing: it drops functions and `undefined` silently and renders a `Map` as `{}`. **As built (W1), correcting this row:** a comparison does not catch that either — `stringify(new Map())` and `stringify({})` are both `"{}"`, so round-tripping and comparing PASSES for exactly the payload that matters. The check is therefore a WALK that rejects anything which is not a plain JSON value, and the round-trip is what gets delivered. Not hypothetical: `seenBy` is a `Map` on every lead in a multi-commander world, and it is on the raw lead a dispatch carries until W2 projects it | `src/net/wire.js` and `test/transport.test.mjs`, which asserts the Map case specifically because it is the one a comparison would have blessed |
| 3 | **The optimistic control cannot be observed at T1.** A microtask-fast answer means the committed state is repainted before a frame is drawn, so W1 ships the reconciliation path with nothing able to exercise the interesting half of it — the refusal that arrives after the button already moved | `test/transport.test.mjs` can hold an answer back deliberately, which is the only way to see it before T2. That the *game* looks right under real latency is unproven until there is real latency |
| 4 | **W1 disturbs an ordering the page relies on.** `src/main.js` defers a round by a microtask so the hub finishes the render it is in the middle of before the canvas takes the screen. Once the answer that triggers the round is itself delivered on a microtask, both land in the same drain and that protection stops meaning what it meant. The same applies to the mission report, whose results screen currently paints synchronously after the command returns | No suite imports either file. The guard is deploying a mission and watching the hand-off, both directions, in a two-commander campaign |
| 5 | **The snapshot is whole, and taken per command.** No diffing, no dirty tracking, and a broadcast refreshes every seat's copy whether or not that seat's campaign moved | None needed at this size — a roster, a board, an armoury and a log. Recorded so a later profile knows it was a choice |
| 6 | **Identity is lost at W3.** The hub renders a copy, not the campaign's own arrays. Verified safe as the code stands: the mission only READS soldier data, `applyMissionResult` matches by id, and `_nameFor` reads names off `_lastSquad` | No suite sees it — `test/session.test.mjs` does not import the hub. The guard is playing it, which is why W2 and W3 are separate commits |
| 7 | **A dispatch still carries a generated level.** The seed alone will NOT do, even after `tech/mission-determinism.md`: regenerating a level also needs the difficulty, the length band and the pressure scale, and `makeLead` draws the last two at generation time and stores neither. `lead.report` records what those draws PRODUCED (`seed`, `difficulty`, `width`, `budget`), but `generateLevel` takes the bands, not the products, so nothing on a lead can reproduce it through the door that exists. Making a level reproducible from a lead is its own change and is not in this spec | Nothing. Recorded so T2 sizes its payload from a known cost rather than discovering the level in it |
| 8 | **The page is still trusted.** In hot-seat one page holds every seat's client, so nothing stops it reading another commander's snapshot. Privacy is enforced by the shape of what leaves the session, not by the transport | Nothing, and it cannot be otherwise until there are two processes. Named because "a mission choice is private" reads like a transport guarantee and is not one until T2 |
| 9 | **The stale-wounds divergence is real and nearly unreachable.** A live-soldier dispatch means a soldier on two of one commander's choices carries mission one's wounds into mission two; a projected one means they carry the wounds they had at lock. Reaching it needs `dayPerDeploy` off and the same soldier committed twice — `deployCommand` forbids a duplicate within one squad, not across two held choices | A `test/session.test.mjs` assertion added by W2. It is the one behaviour change of this slice a player could see, and it was invisible in the spec until a review found it |
| 10 | **Two design lines W2 does not serve, and neither is this spec's.** `design/multiplayer.md` says both missions begin at the same moment, and that a squad is visible to a commander standing on the same level. W2 hardens one seat's squad per dispatch and leaves sequencing with the page. Both are deferred by name to Phase 3 in `tech/multiplayer.md` (M2–M4); recorded here because a builder reading only this document would write a projection rule believing it was permanent | Nothing, deliberately. Phase 3 will widen the payload, and this row is what tells it that it may |

**As built (W1).** Three things the plan did not have right.

| | As built | Why |
|---|---|---|
| Three modules, not "the transport and the client" | `src/net/wire.js` holds the data rule, `loopback.js` the in-process transport, `client.js` the seat handle | The rule is the part W2 and W3 reuse — a dispatch and a snapshot cross the same wire — and it is the only piece with real logic in it. Folding it into the loopback would have hidden it behind the thing it constrains |
| A bad payload **throws**, and outbound throws synchronously | The send checks before it queues, so the stack still names whoever built the command; an answer that is not data throws inside the delivery microtask, which under node takes the process | Loud is the point: this is a dev-time assertion about a bug that must never ship. The cost is that the inbound failure cannot be caught around a `send`, which is why the suite checks that direction directly |
| The in-flight control is marked **after** the screen is built, and the class is `in-flight` | `src/hub/hub.js` marks the control post-render rather than every template knowing about it | `committed` was the obvious name and is already taken: `hub.css` gives it to a lead row you have deployed to, so reusing it would have dimmed every committed mission on the board |

## Background

### What crosses the seam

Four channels. Two are already data; two are the work.

| Channel | Today | After W3 |
|---|---|---|
| Command, page → session | A synchronous method call returning a rich answer | Data in, answer through a callback |
| Answer, session → page | The return value, branched on immediately — the ready click drives the round, the mission report carries the day summary to the results screen | The same object, delivered rather than returned |
| Dispatch, session → page | The page pulls the whole round with `takeRound()`, a read no client could perform, and gets the raw lead with it | Announced to the host, whole and in order, projected down to what the mission reads |
| View, session → page | A live getter object over the campaign, aliasing its arrays | A per-seat snapshot, broadcast on change, read through a stable handle |

### Why the read half is the expensive one

`makeView` is a projection *by getter*: every field reads through on access, the
roster and armoury arrays are the campaign's own, and the object is frozen at the
top level only. That is deliberate — S1 rejected a snapshot because it goes stale
on the next command, and rejected a clone because identity is what let the
mission and the results screen hold onto real soldiers. Both objections are
correct in one process and both stop applying the moment a client is somewhere
else: a remote client's copy is always a snapshot, and refreshing it is the push
this spec adds.

The consumers are not uniform, which is the part that bites. The hub captures its
view once and re-reads it on every render; the ambient layer re-reads its roster
on every frame; the results screen holds transient state that a seat swap
deliberately destroys. A stable handle serves all three. A snapshot object handed
out directly serves none of them.

### What T2–T4 inherit

| Slice | What it still has to do |
|---|---|
| T2 | A node process that holds the session and serves the files, with the room in the URL. The repo's static, no-build-step property stops applying to this path — single-player keeps it |
| T3 | Swap the loopback for a socket, and delete `src/hub/hotseat.js` and mockup §7. Per-client views need no new thinking after W3; they need a different carrier |
| T4 | Presence and disconnection, and it is **display only**: `design/multiplayer.md` now says a player who leaves at base stalls the campaign until they come back, so readiness is a promise rather than a heartbeat and the gate needs no timeout, no forfeit and no way to spend a day without them. What is left is showing that they are gone. Reconnection is already paid for by W3 — a client that attaches to a seat is sent a snapshot, so coming back is a fresh view rather than a replay of what was missed. Mid-mission departure stays what the design has always said: the squad is handed to the AI |

**As built (W2).** Three things the plan did not have right.

| | As built | Why |
|---|---|---|
| The transport BUILDS the session | `createLoopback(makeSession)` takes a factory and calls it with its own inbound round handler; `src/main.js` names `createSession` once, inside that call, and never holds the result | The spec named the construction order as the constraint and left the resolution open. This is the only shape where the announcement channel exists before the session does AND the dispatch still crosses `toWire` — hand `createLoopback` a built session and the round reaches the page without ever touching the wire, which would leave "projected on the way out" proven by nothing. The page still says who the seats are, which is the only part of it that was ever the page's |
| Two identity assertions broke, not six | `mission === leadOf(...)` and `squad[0].data === roster[0]`. `level === lead.level` and both weapon identities still hold | The projection passes the level and the weapon through **by reference**: what a dispatch carries is the session's decision, and copying is the wire's (`src/net/wire.js`). So the session hands out a narrower object made of the same parts, and only the two things W2 actually rebuilds — the lead and the soldier — stop being identical. The page gets copies of everything, because the announcement crosses `toWire` |
| A pre-existing flake in `test/transport.test.mjs`, fixed here | The nine-command block acted as `p1` unconditionally and read `p1.view().leads[0]`. `rollVisibility` stamps each lead against a random subset of commanders, so on a small seeded board p1 sees nothing about one run in six | Found by running the suite repeatedly after the W2 edits, not by the edits themselves. The block now acts as whichever seat can see a lead — at least one always can |
