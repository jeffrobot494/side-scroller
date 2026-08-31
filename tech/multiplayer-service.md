---
type: tech
category: gameplay-systems
status: unbuilt
resolution: sharp
needs: [multiplayer-session]
related: [multiplayer, multiplayer-state, multiplayer-session, campaign-pacing]
tags: [multiplayer, transport, service]
---

# Multiplayer service

The session stops living in the page and lives in a node process. A room is a
URL, a seat is a link, and the loopback stays exactly where it is for
single-player.

## Slices

| # | Slice | Changes runtime behaviour |
|---|---|---|
| **V1** | **The room, and nothing that talks to it yet.** A room is one `createSession` plus its seats, held in a registry the process owns. It speaks three things over HTTP: create a room, send a command and get its answer, and open a stream that carries this seat's snapshot and this seat's dispatches. `server.mjs` gains the endpoints; the registry itself is a module, so the round-closing and broadcast wiring is drivable without booting a listener. The whole slice's client is a node suite | No — `index.html` is byte-identical and no page reaches any of it |
| **V2** | **The browser connects, at one seat.** A remote transport implementing the surface the page already consumes, chosen by the URL: a room means remote, no room means the loopback exactly as today. Two things break here and both are this slice's: the page **cannot construct the hub synchronously** any more, because a snapshot arrives over a network rather than existing before `createLoopback` returns; and the round arrives **pushed at the seat** rather than drained whole by a host, so the page's round dispatcher forks | Yes, and only for somebody who builds the URL by hand — nothing puts a room link in front of a person until V3. The plain URL is untouched |
| **V3** | **The second browser.** Room creation hands back one link per seat, the page shows them, and a seat opened elsewhere is a real commander: two people, two machines, one campaign. Hot-seat is **hidden in a room** and left alive outside one | Yes — and this is the first internet playtest, the milestone `tech/multiplayer.md` puts at the end of T3 |
| **V4** | **Presence.** A seat with no open stream is shown as gone on every other seat's task-force strip. **The producer is the registry, not the session** — whether a stream is open is a fact about the transport and the session must never learn it, so `src/net/rooms.js` decorates each seat's snapshot with a per-seat connected flag on the way out and `session.view` is untouched. Display only: the design says an absent commander stalls the campaign until they return, so there is no timeout, no forfeit and no way to spend a day without them | Yes, and only visually |

**V1–V4 own the T2, T3 and T4 rows of `tech/multiplayer.md`**, the way W1–W3
own T1. Those rows now cite this document rather than describing the work, and
were rewritten in this spec's own commit for the three reasons below. The
wording being corrected is `tech/multiplayer-session.md`'s "What T2–T4 inherit"
table, which is where the T-row detail actually lived.

| | |
|---|---|
| **T2 and T3 were not separable as written** | T2 held the authoritative session in a node process; T3's inherit-row said "swap the loopback for a socket". There is no order in which the first is true and the second is not — a session in another process is unreachable without a wire. What is actually separable is *the service existing and being driven by a suite* (V1) from *a browser talking to it* (V2), and that is the cut above |
| **The read half is already done** | T3's "real per-client views over the wire" was paid for by W3. A snapshot per seat, refreshed by broadcast, is what the transport already produces; V2 changes its carrier and nothing else |
| **Hot-seat is not deleted here** | T3's inherit-row deletes `src/hub/hotseat.js` and mockup §7. V3 hides it in a room and keeps it outside one, because it is the only way to drive two seats on one machine and its deletion buys nothing this spec needs. The condition for deleting it is a room that is easier to open than `?players=2`, which is V3's own outcome — so the deletion is the first thing the next spec should look at, not the last thing this one does |

They land in order, and any prefix is shippable.

## Reuses

| What | Where | Used for |
|---|---|---|
| `toWire` and `assertData` | `src/net/wire.js` | The data rule, unchanged and now load-bearing rather than didactic. Everything crossing a real socket goes through the same walk that has been rejecting Maps in-process since W1 |
| The transport surface | `src/net/loopback.js` | `send` / `view` / `watch` / `takeRound` / `playerIds` is the shape V2 reimplements. It was written against a socket it did not have; this is the slice that finds out |
| `connect` | `src/net/client.js` | **Untouched.** Three names, no session, no other seat — a client is already correct for a remote transport, which was the point of pinning it that small |
| The stable handle | `src/net/loopback.js` | `makeHandle` — one object per seat whose fields read through to the current snapshot. The remote transport needs exactly this, for exactly the reason W3 found: `advanceDay` and `applyMissionResult` replace `leads` and `roster` rather than mutating them. **It is module-private today, so V2 moves it** — see Where the code goes. Duplicating it is the wrong answer: two handles that drift is two transports that behave differently, which is the failure this whole seam exists to prevent |
| The session's six names, and its two announcements | `src/game/session.js` | The authority moves house without changing. `announce` (the round) and `changed` (the broadcast) are already the two outbound channels a server needs, and the module is already DOM-free and storage-free — the property `tech/multiplayer-state.md` S1 built it for |
| The dispatch projection | `src/game/session.js` | What a dispatch is allowed to carry was decided at W2 by reading the mission. V1 sends that object over a socket and adds nothing to it |
| `session.takeRound()` | `src/game/session.js` | Kept at W2 because the session's own suite drives it with no transport in front. V1's registry is a second such driver, and the comment beside it already names this case: *"online, the server dispatches to each client, and `src/main.js` is that dispatcher's stand-in"* |
| The zero-dependency static server | `server.mjs` | `ROOT` resolution, the MIME table, the directory listing the design map scrapes, and the `$PORT` bind. V1 adds routes above it and changes none of them |
| `Hub.refresh()` | `src/hub/hub.js` | The repaint door, and the nine fields it must not touch. A broadcast arriving over a socket is the same event it already handles |
| The seat-swap bindings | `src/main.js` | `swapTo` re-points five things. In a room there is one seat and no swap, which is a subtraction from a shape that exists rather than a new one |
| The DOM-free source scan | `test/session.test.mjs` | The mechanism that pins the property, extended to cover the registry. **Not** the service suite's imports: `test/run.mjs` installs a DOM globally before any suite runs, so "the service suite needs no DOM" would assert nothing at all |

## Where the code goes

| Path | Change |
|---|---|
| `src/net/rooms.js` (new) | The room registry: create a room, hold its session, route a command by token, hold each seat's snapshot and each seat's undelivered dispatches. **No HTTP** — it takes and returns values, so the round-closing and broadcast wiring is testable without a listener. DOM-free and storage-free, inherited from `src/game/session.js` |
| `server.mjs` | Three routes and the process's room registry. Zero dependencies still — node's own `http`, and SSE is text on an open response. **The routes go above the method guard**, not above the static server: lines 81–83 answer 405 to anything that is not GET or HEAD, as the handler's first statement, so a command route added below it is unreachable |
| `src/net/handle.js` (new) | `makeHandle`, extracted from `src/net/loopback.js` where it is a module-private function. A mechanical move at V2: both transports import the one implementation, because a copy that drifts is two transports that behave differently |
| `src/net/remote.js` (new) | The browser half of the transport: commands out over `fetch`, snapshots and dispatches in over `EventSource`, the shared stable handle. **Browser-only by design** — see The seam |
| `src/main.js` | Picks its transport from the URL, and stops constructing the hub at module top level. In a room it plays its own dispatch and never swaps seats; outside one it is what it is today |
| `src/hub/hub.js` | `_taskforce` learns a seat can be absent (V4). Nothing else — `refresh()` already does the work, and the strip is drivable headlessly, which is what `test/hub-refresh.test.mjs` does |
| `test/service.test.mjs` (new) | V1's only client, and V1's whole guard: a room, two seats, a command routed by token, a snapshot per seat carrying only its own projection, a round announced to the seat that owns it and to nobody else, and a payload that would not survive the wire refused |
| `test/hub-refresh.test.mjs` | Gains V4's strip: a seat shown absent, and a repaint that still spends none of the nine transient fields. The suite already builds a `makeEl` root, a real transport and two seats, so this is an assertion rather than a new harness |
| `test/transport.test.mjs` | The loopback's suite. **Unchanged by V1 and V2** — if a slice edits it, the remote transport has been built by loosening the shape rather than by matching it |
| `test/session.test.mjs` | The `src/main.js` source scan follows the bindings it pins. V2 edits it in the same commit, and **the fragile half is `swapTo`, not `createLoopback`**: the capture is `/function swapTo\(id\) \{[\s\S]*?\n\}/`, which ends at a brace in column 0, so moving `swapTo` inside an async boot silently widens it to a whole-file scan that passes while guarding nothing. It also gains the source scan below |
| `test/session.test.mjs` — the DOM-free scan | Extended from `src/game/session.js` to `src/net/rooms.js` at V1. **This is the only real guard**: `test/run.mjs` calls `installDom()` once before any suite runs, so a room that named `document` would keep a green service suite forever |

Conventions from `CLAUDE.md` that bind: **no dependencies**; every
`localStorage` access guarded, which these modules satisfy by touching none; the
single-player URL keeps the static, no-build-step property, and a room is the
only path that requires a process.

**One repo claim stops being true, and the slice that breaks it edits it.**
`CLAUDE.md` says `server.mjs` "is not part of the game." After V1 it holds the
authoritative campaign for every room. The static-hosting sentence beside it
survives; the disclaimer does not.

## The seam

**Owns:** the room registry and its token routing, the three HTTP routes, the
browser half of the transport, and the page's choice between the two transports.

**The seam is a carrier swap, not a protocol.** Commands were data at W1,
dispatches were projected at W2, views became per-seat snapshots at W3. Nothing
about *what* crosses is decided here — only that it now crosses between two
processes.

**Must not touch:**

| Boundary | Why |
|---|---|
| Command semantics | `src/game/session.js` and its 251 assertions. A room changes how a command arrives and never what it does |
| The session's public surface | Six names. A registry is another caller, not a new method |
| Game rules | `src/game/state.js`. A server that starts adjudicating has become a second authority, which is the whole failure the session exists to prevent |
| `src/net/client.js` | Three names, no argument on `view`. A remote transport that needs a fourth has put something on a client that belongs on the transport — the mistake W3 already refused once |
| `src/net/loopback.js` | Single-player and hot-seat run on it unchanged. It is not adapted, wrapped, or taught about rooms. The one edit it takes is V2's extraction of `makeHandle` into `src/net/handle.js` — an import in place of a definition, and no behaviour |
| The mission scene | `src/mission/`. Not one line. A dispatch already carries what `Mission.start` takes |
| What a commander may see | The view's field list, `projectLead`, the dispatch projection. A room adds a real boundary underneath them and must not widen them. V4's connected flag is the one thing added on top, and it is added by `src/net/rooms.js` to the snapshot rather than by `makeView` to the view — the session has no way to know a socket is open and must not be given one |
| Lockstep, joint missions, mission-time traffic | Phase 3. Everything here is turn-boundary JSON and latency does not matter yet |
| The single-player URL | No room, no token, no query string, no process. `python3 -m http.server` still serves a playable game |

**The DOM-free rule splits, and the split is stated rather than assumed.**
`src/net/loopback.js`, `src/net/wire.js`, `src/net/client.js` and
`src/net/rooms.js` run in both places and name no browser global.
`src/net/remote.js` runs only in a browser and may name `fetch` and
`EventSource`. The existing rule was written as "`src/net/` is DOM-free because
T2 runs half of it in node"; this is the slice that says which half.

## Must not regress

The whole suite green before any slice commits.

| Suite | What it guards |
|---|---|
| `test/transport.test.mjs` | The loopback, whole. Single-player and hot-seat both run on it after V4 exactly as they run on it today |
| `test/session.test.mjs` | The command switch, the round, the gate, the visibility rules, and the DOM-free source scan. Only the `src/main.js` binding literals move, and only at V2 |
| `test/hub-refresh.test.mjs` | The repaint door: a broadcast repaints without spending the flash or clearing the nine transient fields. V4 adds a field to the strip and must not reach through this door to do it |
| `test/hubambient.test.mjs` | The ambient layer mounting and animating. V2 changes **when** it is constructed, not what it is handed |
| `test/wiring.test.mjs` | State end to end — leads, `loadMission`, result application, the boss gate. Untouched by every slice here, which is the assertion |
| `test/mission-golden.test.mjs` | A mission replays from its seed. The seed reaches the mission through one more hop after V2 |
| `test/docs.test.mjs` | This document's citations and its seven parts |

**Where the bar cannot see this at all.** `src/main.js` and `server.mjs` are
imported by no suite, and V2 and V3 land almost entirely in `src/main.js`. The
hub is **not** on that list — `test/hub-refresh.test.mjs` has imported it since
W3 and drives it off a real transport with two seats, which is what V4's strip
should be pinned by rather than by playing it. The remaining guards are
`test/service.test.mjs` for the half that is a module, and **playing it — two
browsers, two machines, a campaign to the finale** — for `src/main.js`.

## Approximations

| # | Where it is not exact | What catches the failure |
|---|---|---|
| 1 | **A campaign dies with the process.** No save, no disk, no restart survival. Parity with today is the argument — a campaign already dies with the tab — and **it is the wrong argument for one case, which is why it is written down**: `design/multiplayer.md`'s Interruption rule says a player who leaves at base stalls the campaign *until they come back*, which asks a room to outlive an absence of any length. A restart, a deploy or a host's idle timeout ends a campaign two people are still playing. The row is parity plus a known collision, not parity alone | Nothing. Deliberate, and row 2 is why it is not cheap to change later |
| 2 | **A campaign is not serializable, and persistence is not a small change.** `lead.seenBy` is a `Map` (`src/game/state.js`), which `src/net/wire.js` refuses by name. The projections dodge it; the campaign itself does not. Whoever adds persistence writes a serializer, not a `writeFile` | Recorded so the size is known before it is quoted |
| 3 | **A token is a link, not an account.** Whoever holds a seat's URL is that seat. No login, no revocation, no rate limit, and the SSE token rides in the query string because `EventSource` cannot set a header. Privacy between commanders is real — the server projects per seat — but it is privacy against the *other player*, not against an attacker who has the link | Nothing. Named because Approximation 8 of `tech/multiplayer-session.md` says privacy stops being a hole once there are two processes, and this is the exact width of the remaining hole |
| 4 | **Rooms are unbounded and never collected.** A room with nobody in it stays in memory until the process restarts | Nothing at this scale. It becomes real the first time this is deployed for anyone but Bo |
| 5 | **SSE, not WebSocket.** One-way push plus `fetch` for commands, because it is plain HTTP text, needs no dependency and no hand-rolled framing, reconnects by itself in the browser, and survives proxies that would need WebSocket explicitly enabled. The cost is a second connection per seat and no client-to-server streaming — neither of which turn-boundary JSON needs | Swapping to WebSocket later changes `src/net/remote.js` and the routes, and nothing above them. That is the property that makes this the reversible choice |
| 6 | **Latency is still unproven where it matters.** W1's Approximation 3 said the optimistic control's refusal path could not be observed in-process. V2 is where it can be — and only by playing it, because the suite still drives everything at microtask speed | Playing it on a real connection, which is V3's milestone and not a test |
| 7 | **A dispatch still carries a generated level.** Unchanged from W2 and now a real payload over a real connection: the seed alone cannot reproduce a level, because `makeLead` draws the length band and the pressure scale at generation time and stores neither. Sizing it is the first thing to measure at V2 | Nothing. `tech/multiplayer-session.md` Approximation 7 is the same debt, now billed |
| 8 | **The page forks at the round, and stays forked.** A hot-seat page drains the host's whole round and swaps seats between missions; a room page plays the one dispatch that arrived for it. Two shapes in one file until hot-seat is deleted, which this spec deliberately does not do | Nothing but reading it. Recorded because a builder finding two round dispatchers should know it is a temporary state with a named exit, not an oversight |
| 9 | **The commander a seat plays is fixed by its link.** No picker, no name entry. The design rules out mechanical differences between nations, so this costs a label and not a choice | One screen, whenever it is wanted. Recorded because it is the one answer in this spec that is a default rather than a decision |
| 10 | **A commander who vanishes mid-mission deadlocks the room, and this spec does not fix it.** `round.flight` is cleared only when the last outstanding `dispatchId` reports (`src/game/session.js`), and while it is set, `ready`, `deploy`, `share` and `release` all refuse with "The round is under way." In one page this was unreachable, because the host played every mission. With two browsers a closed tab means that dispatch never reports and BOTH commanders are locked out for the life of the process. The design's answer — the squad is handed to the AI and fights on as companions of the remaining player — needs another client already simulating that level, which is Phase 3 and does not exist. So a room today has a hazard the hot-seat page did not | Nothing, and that is the point of recording it. It is the first question Phase 3 inherits, and the one thing here a player could hit on a normal evening |
| 11 | **A room runs on built-in config and built-in content.** `src/game/config.js` and the custom/override stores are localStorage, guarded to no-ops in node, and `src/game/state.js` reads `config` at seventeen sites — `leadCount`, `leadLifeMin`/`Max`, `seedLeads`, `leadArrivalRate`, `bossHighWins`, `healPerDay`, `doomPerDay`, `leadVisibility` — plus `config.dayPerDeploy` in the session. A room therefore paces itself on defaults while each browser keeps its own overrides for mission feel, and `applyWeaponOverrides()` / `listCustomWeapons()` no-op, so a room's armory is built-ins only and a dispatched squad carries built-in weapons. Two of `CLAUDE.md`'s conventions stop holding on the room path: "everything tweakable in the editor", and "cross-page data goes through localStorage" | Nothing, and it is visible: an editor rebalance that changes a solo campaign will not change a room's. Shipping config to the room is a real slice and is not in this spec |
| 12 | **What a returning seat is owed is only half-specified.** W3 paid for the snapshot half — a client that attaches is sent a fresh view. The other half is a dispatch that was already delivered to a browser that is now gone; V1's registry holds undelivered dispatches per seat and this spec does not say what happens to a delivered one. In practice it is row 10 by another route | Nothing. Named so it is not mistaken for solved by `tech/multiplayer-session.md`'s "reconnection is already paid for by W3" |
| 13 | **Nothing here is Phase 3.** Both missions do not begin at the same moment, a squad is not visible to a commander on the same level, and there is no lockstep. All three are M2–M4 in `tech/multiplayer.md` | Deliberate, and the same deferral W2 recorded. A builder reading only this document would otherwise think the transport was supposed to provide them |

## Background

### What moves, and what does not

| | Before | After V3 |
|---|---|---|
| Who holds the campaign | The page, inside `createLoopback` | The node process, inside a room |
| Who is the host | `src/main.js` — it drains the round and sequences every seat's mission | The server. A page is one seat and nothing else |
| A seat swap | Five bindings re-pointed in one page | Two browsers. No swap exists |
| A command | `fetch`-shaped data delivered on a microtask | The same data, over HTTP |
| A snapshot | `toWire(session.view(id))`, per seat, on every command | Identical, pushed down a stream |
| Single-player | One seat, one client, one loopback | Unchanged, byte for byte |

### Why the page cannot construct the hub the way it does today

`src/main.js` builds the ambient layer and the hub at module top level and
dereferences `money` immediately, which works because `createLoopback` fills
every seat's snapshot **synchronously, before it returns** — a comment in that
file says so, and says why. A snapshot that arrives over a network cannot be
there at construction. So V2 waits for the first one before mounting, and that
wait is a visible state (a page with nothing on it) that today has no design and
needs none: it is a fraction of a second on a working connection and the failure
case is V4's.

### What the next spec inherits

| | |
|---|---|
| Deleting `src/hub/hotseat.js` | Once a room is easier to open than `?players=2`, the local two-seat harness has no user. Mockup §7 goes with it |
| Mid-mission departure | `design/multiplayer.md` says the squad is handed to the AI and fights on as companions of the remaining player, still subject to permadeath. That needs a client already simulating the level, so it is Phase 3's and not deferrable to V4 — which is display only. Approximation 10 is what a room does instead, and it is not what the design says |
| Persistence | Rows 1 and 2 above, together |
| Phase 3 | M2 squad ownership, M3 lockstep input, M4 joint resolution. `tech/mission-determinism.md` already paid M1 |
