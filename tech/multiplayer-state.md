---
type: tech
category: gameplay-systems
status: building
resolution: sharp
needs: []
related: [multiplayer, campaign-pacing, game-balance]
---

# Multiplayer state

How `design/multiplayer.md`'s campaign layer is built: one authoritative session
owns the campaign, each player receives a filtered view of it, and the hub stops
mutating state. No networking and no joint missions — both are later specs. The
end of this one is two players sharing a campaign in one browser.

## Slices

| # | Slice | Changes runtime behaviour |
|---|---|---|
| S1 | **The session seam.** A session owns the state and exposes a command entry point and a per-player view. The four write cases in `src/hub/hub.js` `_onClick` send commands; `_launch`'s direct write to `s.record.missions` becomes one too; `src/main.js` constructs the session and routes `applyMissionResult` through it. Single-player becomes a session with one player | No — the game plays identically |
| S2 | **Two players in one session.** Every field in `createState()` is assigned to the world or to a player (table below), and a player's campaign stays one flat state-shaped object so `src/game/state.js`'s actions keep both their signatures and their bodies. `advanceDay` splits, because it ticks the world and the acting player in one pass and only the world half may run once. The page renders one view at a time with a control to swap. **Three bindings are captured at construction and all three must move together** — `Hub`'s view, `createHubAmbient`'s, and the command closure in `src/main.js` that S1 pre-bound to one player id. Re-pointing the two views and not the closure sends one commander's clicks to the other's campaign, and no suite imports `src/main.js`. Hot-seat playable | Yes |
| S3 | **Recruit pools.** `RECRUIT_POOL` is dealt at campaign start — each authored recruit goes to exactly one player. Dealing is a SESSION concern, not a player one: it is the only thing that knows how many bases there are, so a share is handed to each base at construction rather than each base helping itself to the whole pool. A one-player deal is the **whole pool in authored order** — nothing to divide is nothing to shuffle — which is what keeps `createState()` and the plain URL identical. Shares are **deep clones**: `hire` writes `status`, `weaponId` and `wounds` into the recruit object in place, so dealing the authored objects would corrupt the module-level pool for the life of the page and for every suite in one `node test/run.mjs`. The slice also has to correct the two places that say ids are duplicated — the header comment in `src/hub/hub.js` and the swap row in `## Approximations` — which stop being true here | Yes |
| S4 | **The ready gate.** Readiness is a per-player toggle the SESSION holds, not the hub: the day advances exactly once, the moment the last commander readies, and every flag clears on the turn. The top bar's `Advance the day ▸` becomes **Ready** at two or more commanders and stays lit while you are one; clicking it again stands you down. A task-force strip under the bar names every commander, says who has readied and how many are outstanding, and is the only thing `design/multiplayer.md` lets a player know about another before a mission resolves — which is why the session learns commander NAMES in this slice. A strip that says "the other player" is the thing mockup §1 exists to rule out. **The day charge leaves `applyMissionResult`** and the gate becomes the only thing in the game that spends a day, so one round costs one day whether nobody, one or every commander deployed. `config.dayPerDeploy` cannot survive that unchanged — see the seam — and becomes the cap on how many times a commander may deploy between two day turns | Yes |
| S5 | **The deploy commit.** Launch stops starting a mission and starts holding one. A pending choice — `deployCommand`'s `{ mission, level, squad }` **plus the `weapons` map that command consumes and discards**, because the deploy screen re-renders its selects off exactly that map and a commander who comes back must see what they picked — is held on the player record beside the ready flag, and appears in nobody else's view. Standing down releases it, which is the clause S4 could not build because there was nothing pending to release. When the last commander readies the choices LOCK and the round's missions run; there is no window to withdraw, and **the day turns when the last of those missions has reported**, not on the locking click. Afterwards each commander learns which lead the others took and nothing else. The deploy screen gains mockup §3's "locked on ready" notice | Yes |
| S6 | **Lead visibility and disclosure.** The world lead set gains per-player visibility, plus a command to disclose a lead | Yes |
| S7 | **The finale.** `highWins` and the boss placement become per-player; the boss lead is disclosable through S6; `outcome` forks so victory is individual while defeat stays collective | Yes |

S1 lands alone as a refactor with no visible change. S2 is the first slice a
player can see, and everything after it depends on it. Beyond that only two
orderings are forced: S5 depends on S4, and S7 depends on S6. S3, S4 and S6 are
independent of each other and can land in any order.

**As built, S1: `deploy` is a whole command, not just the `record.missions`
write.** The plan above says `_launch`'s direct write "becomes one too", which
reads as a narrow "charge these soldiers a mission". What shipped is
`{leadId, soldierIds, weapons}` → `{ok, mission, level, squad}`, with the squad
assembly and the weapon fallback chain moved out of the hub as well. Two
reasons: the session owns the roster, the armory and the board, so it is the
only thing that can validate a deploy at all; and this payload is exactly the
pending choice S5 has to hold, so the narrow version would have been rewritten
one slice later. The hub keeps the three-soldier cap, which is UI state and was
never a campaign rule — the session validates only that the lead is on the
board and the soldiers are alive and distinct. A rejected deploy charges
nobody: the old hub loop incremented as it walked the squad, so validation now
completes before any write.

**As built, S3: the deal is round-robin, and it takes an rng.** The slice row
says the pool is dealt without saying how, and at uneven counts that matters:
six recruits over four bases is **2/2/1/1**, not 2/2/2/0, because the deal walks
a shuffled pool handing one card at a time. Nobody is left empty-handed while
somebody else holds a spare. More bases than recruits is legal and the surplus
seats open on an empty Barracks — six is the ceiling `src/main.js` clamps to,
and `createSession` does not clamp at all (see Approximations).
`dealRecruits(shares, rng = Math.random)` takes the generator as an argument so
a test can reproduce a hand; nothing in `src/` passes one, and the transport
spec is what will.

**S5 falsifies mockup §1, deliberately.** §1's note reads "There is no window
to stand down once you are the last to ready: **the day turns on that click**."
After S5 that click locks the choices and starts the missions; the day turns
when the last of them reports. What the note is really promising — that the
last readier gets no second thoughts — is unchanged and is the part that
matters. Recorded because this spec holds `tech/campaign-pacing.md` to the same
standard, and because `tech/multiplayer.md` pairs each slice to a mockup
section.

**As built, S4: readiness rides the VIEW, and the session's method list did
not grow.** The plan expected a readiness accessor on the session. It did not
need one — `taskForce` is a field on the per-player view like every other, so
the hub reads it the way it reads `day`, the session still exposes exactly five
methods, and the exact-list assertion that pins them is unchanged. It is a
getter, not a value: views are built once and cached, so a plain array would
have been correct exactly until somebody readied.

**As built, S4: `playerIds` became `players`, and `advanceDay` stopped being a
command.** A seat is now an id or an `{ id, name }`, because the strip has to
print who by name and the session was the only thing that could not see one.
The day command was not kept beside the readiness one — a second way to spend a
day is the thing this slice exists to remove — so `{ type: "advanceDay" }` is
gone and `{ type: "ready" }` is what the top bar sends at every player count.

**As built, S4: single-player is byte-identical, and that was measured.** The
rendered hub at `index.html` with no query string was diffed against the same
render at the previous commit: zero bytes different. The claim in
`Must not regress` is not an argument, it is a diff.

**As built, S5, amended after the fact: the §3 disclosure checkbox is gone.**
S5 shipped it — rendered on the deploy screen, stored on the pending choice,
read by nothing — on the reasoning that S6 would consume it. Reading the design
for S6 showed it would not: `design/multiplayer.md` describes sharing only as
"making it visible and deployable for them", which is a property of a LEAD, and
a claim about where you are going is a different mechanism that the design gives
no surface. **Bo cut it rather than settle what it meant.** Removed from
`src/hub/hub.js`, `src/game/session.js`, `src/hub/hub.css`, the suite, and
mockup §3. What this leaves open is design, not engineering: decision 4 ("a
player's mission choice is private unless they disclose it") and the Deploying
table's "Disclosure" row now name a thing the game does not do.

**As built, S5: `player.deploys` was DELETED, not kept beside the list.** The
seam says the count and the list length "are the same fact and must not become
two", and the way to guarantee that turned out to be to remove the number.
`deployCommand` reads `player.pending.length`, so releasing a choice lifts the
cap by construction and there is no second thing to forget to refund. What
`releaseChoice` refunds is therefore only `record.missions`, per soldier.

**As built, S5: `deploy` REPLACES a choice on the same lead, in one command.**
The plan had the deploy screen release and then re-commit. That leaves a window
where a rejected second half loses a commitment that was valid, so the
replacement happens inside `deployCommand`: it refunds and drops the old choice
after validation passes and before the new one is written. The cap is computed
against the list minus the choice being replaced, which is what lets a commander
reopen a committed lead and change their squad at the default setting.

**As built, S5: the round's clear is UNCONDITIONAL, which fixes S4's stranding
in passing.** `endRound` runs `advanceDay`, rests everyone else only if it
succeeded, and then clears every ready flag and drops the flight **whether or
not the clock moved**. S4 returned the refusal before clearing anything — the
bug this document already recorded as ordinary rather than exotic. The refusal
itself still reaches the caller in `advanceDay`'s own words, now as
`{ ok: true, dayTurned: false, dayHeld: "The campaign is over." }` on a mission
report, because a mission report is not a failed command.

**As built, S5: nothing is committed, released or readied while a round is in
flight.** `ready`, `deploy` and `release` all refuse with "The round is under
way." Unreachable through the UI — the day control is disabled outside the room
screens and the hub is showing a results screen or nothing at all — but it is
what makes "pending choices are empty whenever `endRound` runs" true by
construction rather than by inspection.

**As built, S5: "Elsewhere today" is published when the round LOCKS, not when it
ends.** It is the only moment every choice exists, and it is the moment before
they are released into dispatches. The cost is that every results screen in the
round shows it, so every commander but the last learns it one mission early. In
hot-seat that is not a leak — the same person picked all the choices — and a
transport publishes the same list at the round's end. Named rather than fixed
because fixing it means holding the list back through a queue the session
deliberately cannot see.

**As built, S5: single-player commits too, and the day button is what runs the
mission.** There is no second path — a solo commander picks a squad, presses
Commit, and the mission starts when they advance the day, because a one-player
gate closes on their own click. The day control keeps the name it has always
had; only its tooltip changes when something is held. This is the second visible
single-player change in the spec, after S4's "time stops being automatic", and
the same reasoning covers both: the alternative is a solo path through the seam,
which is the thing S1 existed to remove.

**As built, S5: the round stalls at an end screen, and that is correct.** If a
mission ends the campaign, `Hub.render` promotes every screen to the end screen
and the results screen's button becomes "View final report", which does not
resume the queue. The round's remaining missions never run. Nothing crashes, no
day turns (none can), and the round's state is fully cleared — which is what
"a coherent end state" means here.

**There is no reward split.** The first draft carried a slice for one, because
an earlier design divided "the mission's credit reward". No such reward exists —
`state.money` moves only in `hire`, `commission` and `sellAllLoot`, a mission
pays loot into `stores` plus `threatReward` into `campaignHealth`, and generated
missions carry no credit field (`src/game/gen/levelgen.js`). The design now says
each player keeps what their squad carried out, so nothing here divides
anything and `sellAllLoot` stays a private, per-player action.

## Reuses

| What | Why it matters |
|---|---|
| `src/game/state.js` action functions — `hire`, `commission`, `sellAllLoot`, `advanceDay`, `applyMissionResult` | Almost every mutation already goes through one of the five, so S1 is mostly redirection. They already return `{ ok, reason }` or a summary, which is the shape a command result wants |
| `src/hub/hub.js` `_onClick` | A single `switch` over `data-action`. Since S1 every case that changes anything sends a command through `this.api` and does nothing else, so a slice that changes what a command means costs the hub nothing. S5 is the proof: `launch` went from starting a mission to committing one without the case around it changing shape |
| `src/main.js` | The only module wiring hub, mission and session together. Since S1 it imports no action function at all — the only call site of `applyMissionResult` in `src/` is `src/game/session.js`. It is where the session is constructed, where the player count is decided, and where the seat swap re-binds. Since S5 it is also the round's DISPATCHER: it takes the locked choices, decides which mission plays first, follows the seat to whoever owns it, and reports each result back against its dispatch id. All of that dies with hot-seat, which is why none of it is in the session |
| `src/game/state.js` `createState()` | Builds a whole campaign from `src/game/soldiers.js` and `src/game/content.js` in one place, so the world/player split is a partition of existing construction |
| `src/game/state.js` `livingRoster()` | The accessor the hub and `src/hub/ambient.js` mostly use, and the model a view-side accessor should follow |
| The DOM-free import chain under `src/game/state.js` | Every `localStorage` access in `src/game/config.js`, `src/game/customcontent.js` and `src/game/weaponoverrides.js` is guarded, which is why six suites import state headless. The session must preserve this, because it is the property that lets a later spec move it to a server |
| `src/game/config.js` `SCHEMA` | New tuning knobs are one entry each and the editor generates their controls |
| `src/game/gen/rng.js` | A seeded generator already exists. Not needed here, but it is what a later spec reaches for rather than writing a second one |
| `src/game/state.js` `restDay` + `advanceDay` (split in S2) | The gate is not new machinery. "One world half, every player's half" is exactly what the session already does for `advanceDay` — S4 changes *what triggers it*, not what it does |
| `src/game/session.js` `restEveryoneElse` | Already written, already tested. The gate calls the same helper, and the day-observation hack around `missionResult` is DELETED rather than extended, because the charge it was watching for is gone |
| `src/hub/hub.js` `_onClick`'s `advance` case | Composes the `Finished:` / `Lead lost:` / `new lead(s)` flash out of the three arrays `advanceDay` returns. Reused for the turn, but **it does not survive as-is** and a builder who assumes it does ships a crash: the branch reads `res.finished.length` under nothing but `if (res.ok)`, and a ready that is not the last one is an `ok` result that turned no day and carries no arrays. That is most Ready clicks in a two-commander campaign. The branch needs a third arm for readied/stood-down before it needs anything else |
| `src/hub/hotseat.js` | The precedent for a strip that is mounted once, hidden entirely at one player, and deleted when a network arrives. The task-force strip is the same shape, except that it lives INSIDE the hub's render because mockup §1 draws it as hub chrome |

## Where the code goes

| Path | |
|---|---|
| `src/game/session.js` | Owns the campaign, holds the players, validates and dispatches commands, projects per-player views, and holds the ready gate and pending deploy choices. Must stay DOM-free and `localStorage`-guarded like the rest of `src/game/`. S1 built it around **one** campaign shared by every player — `makeView` hands them all the same object, and the `opts.state` escape hatch four blocks of `test/session.test.mjs` use takes a whole campaign. S2 replaces both: one world, one campaign per player, and an escape hatch shaped to match. S4 added three things to the player record beside the campaign — a ready flag, a deploy count for the round, and the commander's name — and one thing to the session: the gate that reads every flag and turns the day when the last one is set. S5 replaced the count with the list of held choices it was counting, and added the round itself: the dispatches, the outstanding set they are keyed by, and what every commander learns afterwards |
| `src/game/soldiers.js` | Owns `RECRUIT_POOL` and, since S3, the deal: `dealRecruits(shares, rng = Math.random)`, a pure split of the pool into one share per base that knows nothing about a session, a world or a player id. Two readers, not one — `createSession` calls the deal, and `createPlayerState` clones the whole pool when it is handed no share |
| `src/game/state.js` | The world/player field split, and the two constructors it implies — one for the shared world, one for a player's campaign over it. `createState()` stays exactly what it is today and becomes the one-player case of the second. `advanceDay`'s player half separates in S2; `applyMissionResult` loses the day charge in S4 |
| `src/hub/hub.js` (S5) | Three shipped strings stop being true and are listed here so they are not discovered in play: the day button's tooltip and the strip's note both say the day turns when every commander is ready, and `deployCommand`'s refusal in `src/game/session.js` says "this squad has already deployed today" when nothing has deployed and a choice is merely held. `_launch` stops calling `api.startMission` and sends a commit instead; `_deployScreen` gains the notice; the `predeploy` case has to open onto an EXISTING pending choice rather than always a blank one, because a commander who committed and came back must see what they committed to. `this.deploy` stays UI state — the committed thing lives in the session, and the two must not be confused |
| `src/main.js` (S5) | Where the round's missions are walked. It already holds the one piece of this that exists: `deployedBy`, captured at deploy so a result routes to the commander who chose it rather than the seat on screen. S5 turns that one variable into a queue. **This is the module the transport deletes**, so anything hot-seat-shaped belongs here and not in the session |
| `src/hub/hub.js` | S1 turned every write case into a command and S2 made `this.game` re-pointable. S4 touches `_topbar`, where the day button changes label and gains a lit state and the strip is drawn beneath it, and the `advance` case in `_onClick`, which sends readiness instead of a day. Three other strings in the file name the control by its old label and go stale at two commanders — the Engineering hint, the empty-Ops hint, and the commission flash — so "the button" is referred to by name in more places than the button. The `canAdvance` rule it already has — the control is live only on a room screen — carries over, but **it stops being sufficient and the spec should not pretend otherwise.** It was written when only you could turn the day, so disabling your own button was enough to protect your own deploy screen, which finds its lead by id and dereferences `mission.name` with no guard. Under the gate somebody else's click rots leads while your deploy screen is open. Nothing crashes at S4 only because `setView` drops `this.deploy` on every swap — an unrelated rule that S5 deliberately reverses |
| `src/hub/ambient.js` | `createHubAmbient(game)` closes over the state object and reads `livingRoster(game)` every frame; its returned API has no way to re-point it. S2 needs one |
| `src/hub/hotseat.js` (new) | The seat switcher of mockup §7. Mounted as a SIBLING of `#hub-root`, the way `src/hub/fpsmeter.js` already is and for the same reason — `Hub.render()` replaces that element's `innerHTML` on every navigation. Hidden during a mission. It is the one module this whole spec expects to be deleted rather than extended, when the session moves off the page |
| `src/hub/hub.css` | The switcher's styling, and in S4 the task-force strip and the lit state of the Ready button (mockup §1 draws both: `.tfstrip`, `.pchip`, `.btn-ready-on`) |
| `src/main.js` | Constructs the session, holds which view is rendered, routes `onMissionComplete` through a command. It **already holds the commander names** the strip needs (`COMMANDERS`, and a seat roster of `{id, name}`) and today throws them away, passing only ids. S4 is where the name travels with the seat, which means either widening the existing player-id option or adding one beside it — ten call sites in `test/session.test.mjs` pass ids today, and `playerIds()` is a public accessor |
| `src/game/config.js` | Any tuning knob this introduces, and in S4 one existing entry whose meaning changes: `dayPerDeploy` is labelled "Deploying costs a day" with help text describing a charge S4 deletes. Both strings are what the editor renders, so both are wrong the moment the charge moves — the label as much as the help. Note that a per-campaign player decision does **not** belong here — `config` is a global, cross-page, localStorage-persisted developer setting |
| `test/session.test.mjs` | Commands, the ready gate, the field split, and what a view does and does not contain |
| `tech/campaign-pacing.md` | S4 falsifies this doc in **two** places, not one, and owes both an "As built" note in S4's own commit. **C3** ("Deploying costs a day") describes a charge S4 deletes. **C1** ("Time is a global control … passing a day is one click from any room") stops being true at two or more commanders, where a day is never one click away — and C1's own constraint table explains that the control is gated to room screens because *a day advanced while a squad is staged expires the lead the deploy screen holds without a guard*, which S4 makes reachable from another seat. `design/campaign-pacing.md` is Bo's and is not touched by this spec: its decision 1 and its "Time is a global control" row are both falsified, and putting that to him is ask 1 below |

Conventions from `CLAUDE.md` that bind here: one commit per slice; every
`localStorage` access guarded; constants and curves go in the config `SCHEMA`;
no build step.

## The seam

| | |
|---|---|
| The session owns | The campaign state, which player may see what, command validation, the ready gate, and pending deploy choices |
| The session must not touch | The mission simulation, rendering, audio, the editor, level generation, or anything under `src/mission/` |
| The hub must not | Mutate campaign state. Since S1 it does not: `_launch` sends a `deploy` command and the `record.missions` write lives in `src/game/session.js`. It keeps only its own UI state — `mode`, `location`, `flash`, `deploy`, `result`, `sold`, and `_lastSquad` |
| `_lastSquad` stays in the hub | It deliberately holds references to soldiers `applyMissionResult` has already dropped from the roster, so the results screen can still name the dead. A view cannot supply that and must not be made to |
| The view must not carry | Anything `design/multiplayer.md` says a player cannot see: the other player's base, board, pending choice, mission outcome, casualties or loot |
| The view must carry | The two things the design says a player *can* see — the other player's readiness, and after resolution, which lead they took |
| The strip is hidden at one commander | Same rule as `src/hub/hotseat.js`, for the same reason: `index.html` with no query string is the single-player game and must not grow a permanent bar naming its only commander. It rides the top bar, so it appears on the deploy and results screens as well as the rooms — readiness is readable there even though standing down is not, which is the existing `canAdvance` rule and is right. The end screen emits no top bar at all and needs none |
| Readiness is session state, not UI state | It is the one thing about a commander that another commander is allowed to see, so it cannot live in `Hub` beside `mode` and `flash` — those are dropped on a seat swap, and a readiness that evaporated when you looked at someone else's base would be a different game. It goes on the player record the session already holds, next to the campaign, which is where S5's pending choice goes too |
| The session learns commander names in S4 | Today names live in `src/main.js` and the session knows only ids. The strip has to print who, by name, so the name travels with the seat. Names stay cosmetic — `design/multiplayer.md` rules out any mechanical difference between nations — and when a lobby exists it is the same place names come from |
| A view has to reach the player collection in S4 | `makeView` is module-scope and projects `VIEW_FIELDS` off ONE campaign. Readiness lives on the player record, not the campaign, and the strip needs every commander's — so the projection either moves inside `createSession` or is handed the collection. Two properties of the existing view make this sharper than it looks: views are built once and **cached**, and they are **frozen**, so readiness has to arrive as a getter like every other field. A plain value would be correct exactly until somebody readied |
| A pending choice is the deploy result, held instead of returned | `deployCommand` already validates the lead, charges `record.missions`, resolves the weapon fallback chain and assembles `{ mission, level, squad }`. S5 holds that object on the player record rather than handing it straight back. Two things fall out for free: it captures the LEAD OBJECT, so a board filter cannot strip it out from under the mission, and it is the payload `api.startMission` already takes |
| A commander holds a LIST of pending choices, capped at one by `config.dayPerDeploy` | Not a single slot. A slot makes the knob inert at S5 — launch stops running a mission, so "deploy as often as you like" and "deploy once" both yield a one-mission round, and the assertion guarding the difference keeps passing over behaviour that has gone. A list keeps both settings meaning what they always meant: on, one mission per commander per day; off, several missions and still one day. The cap stays where it already is (`deployCommand`), and `player.deploys` and the list length are the same fact and must not become two |
| Releasing a choice refunds everything committing it charged | `record.missions` on each soldier, **and `player.deploys`**. Missing the second is a live lockout at the default: `deployCommand` refuses at `deploys >= 1`, so a commander who stood down to change their mind could never commit again that round — which is exactly what mockup §1 promises standing down is for |
| Standing down releases the choice, and only standing down does | Not opening the deploy screen, not swapping seats, not navigating away. `Hub` drops `this.deploy` on a seat swap and that must keep being harmless: it is UI state for a screen, and the commitment is the session's |
| The turn's summary needs a screen, and the route it used is gone | `finished` / `expired` / `arrived` reach the player through the `advance` case's flash. Under the new ordering the turn happens inside the LAST `missionResult`, whose return the page discards and which the suite pins as exactly `{ ok: true }`. In every round where anybody deployed, "Lead lost: X" and "Ops has N new lead(s)" have nowhere to go unless S5 gives them one |
| `ready` gains a FOURTH answer | Today: refused, readied-not-last, turned-the-day. S5 adds locked-the-round-but-missions-are-running, which is `ok`, turns no day, and would otherwise fall into the readied-not-last arm and print "Waiting on 0 more." |
| The day is owed by the round, not by the click | The gate closes the round and dispatches; the day turns when the last of that round's missions has reported. With nobody deployed the count is zero and it turns on the click, which is the whole of S4's behaviour and is why S4 needed no separate case. A round that closes with missions outstanding is a real state the session holds, and it is the one thing here that a disconnect can strand — `tech/multiplayer.md` T4 |
| The round's dispatch goes to `src/main.js` DIRECTLY, never through a hub or a view | This is the seam S5 turns on, and the obvious route is the wrong one. The only value that escapes a Ready click today is `api.command`'s return, read inside `Hub._onClick` — and routing a round that way would put every commander's locked lead and squad inside one commander's hub, which is the exact thing "the view must not carry … the other player's pending choice" forbids. So the session grows a way for the PAGE to take the round, and the page is not a player: in the online build the server dispatches to each client separately, and `src/main.js` is that dispatcher's stand-in. Consequences to plan for, not discover: the session's method list grows, and `test/session.test.mjs` pins it by exact equality |
| The results screen is the queue's pacing, so the queue needs a signal from it | `onMissionComplete` sends the result, shows the hub and shows results, and stops. Nothing tells the page a commander has finished reading. Starting mission *k+1* from `onMissionComplete` destroys the results screen before it is read — and that screen is where the slice says a commander learns which lead the others took. The hub's existing `return` case is the signal; it re-renders and nothing else today |
| Missions are dispatched, not run, by the session | The session must not know what a canvas is. It hands out the round's locked choices and is told results; WHICH one plays first, whether anything is drawn between them, and whose base the hub shows afterwards are all `src/main.js`'s, and all of it dies with hot-seat |
| The day has exactly one spender | After S4 nothing but the gate advances the clock. That is the property the whole slice buys, and the thing to check when something later wants to "just advance a day" |
| The session holds players as a collection | Never a pair. No command, view, field split or screen may assume exactly two — the design is written for two, but nothing built here may make a third impossible. Every "the other player" is "the other players" |
| Dealing happens once, above the players | A base cannot deal itself a share, because the size of a share depends on how many other bases exist. `createPlayerState` therefore RECEIVES its recruits, and defaults to a fresh clone of the whole pool when handed nothing — which is single-player and what every suite calling `createState()` gets |
| "No id exists twice" holds for a session that dealt | It cannot hold for `createSession({ state })`, whose first seat is a whole `createState()` campaign holding the entire pool while later seats are dealt out of that same pool. The escape hatch exists for tests and the game passes it never, so the answer is to say what it does rather than defend it: **`opts.state` seats a campaign that was already built, and a session built that way is not dealt.** A test that wants dealing builds the session without it |
| A player's campaign is one object | Not a world object plus a player object handed around in pairs. Each player holds a flat, state-shaped thing whose world fields read through to a single shared world and whose player fields are its own, so every action in `src/game/state.js` is handed something that behaves exactly like today's state. That is what buys the field split without rewriting the five action functions, and it is why `createState()` — imported by six suites — can stay untouched as the one-player case |
| Views project a player's campaign, not the world | S1's view already reads through getters, so the world fields arrive on it for free. Nothing in the hub learns that `day` and `money` come from different places |
| The session must not import | Anything requiring a DOM |
| `state.js` keeps its action signatures — **with two exceptions**, both deliberate | **S2 splits `advanceDay`.** It does two jobs in one pass: the world's (the date, the doom clock, lead rot, arrivals) and the acting player's (fabrication timers, wound healing). With more than one player the world half must run once and the player half must run for everyone, or the player who did not press the button never finishes a weapon and never heals. The decomposition is additive — `advanceDay` keeps its name, signature and returned summary and delegates its player half to a new export — so nothing that calls it today changes. **The split alone is not enough**, because one caller of `advanceDay` is `applyMissionResult` itself, and it passes the deploying player's campaign: that path charges a day to everybody while running only one player's half. The session cannot interpose, since the call is internal and does not leave until S4, so between S2 and S4 it has to detect after the fact whether a day was actually charged — `config.dayPerDeploy` is on **and** `advanceDay` did not refuse because the same result had just set `outcome` — and run the other halves itself. **S4 lifts the day charge.** `applyMissionResult` must stop calling `advanceDay` at its end, because two results resolving against one day cannot work while each result buys its own. The charge moves to the session and is spent **once the round is finished — the gate closes the round, and the day turns when the last of that round's missions has reported.** With nobody deployed there is nothing to wait for and it turns on the gate click itself, which is every case S4 can produce. **An earlier draft put the day at the gate, before any mission ran, and Bo changed it.** Turning it first inverts an ordering the game has always had — a win's `threatReward` was banked before the same call's doom tick, so a win could outrun the clock on the last day — and it creates a problem that then needs its own rule: the day rots leads, so a lead a commander had just locked could expire in the gap before its own mission ran, and `applyMissionResult` re-finds that lead by id and would silently drop the threat reward and the High-win credit. Turning it last deletes that case rather than special-casing it. What it costs is a new piece of round state (how many of this round's missions are still outstanding) and one failure mode — a mission that never reports leaves the day unturned — which cannot occur in one process and belongs to `tech/multiplayer.md` T4, where presence and disconnection are already a slice. **`config.dayPerDeploy` cannot survive the move unchanged, and an earlier draft of this row said it could.** Its two settings are "a deploy costs a day" and "only idling costs time". Once the gate is the only day-spender, both settings spend exactly one day per round and the knob stops distinguishing anything; and making *off* mean the gate spends no day is worse, because nothing else advances the clock and the campaign would freeze at day one. What the two settings actually disagree about is whether a mission is a free action, so that is what the knob has to gate: **on (default), a commander may deploy once between two day turns; off, as often as they like.** Note where that can and cannot be enforced — **not at the gate, which never sees a deploy.** It is a per-player count of deploys taken this round, incremented where the deploy is already validated and written (`deployCommand` in `src/game/session.js`) and cleared when the gate turns the day, on the same pass that clears the ready flags. Without that counter the knob's two settings are behaviourally identical — deploy, resolve, deploy, resolve, ready is one day and any number of missions — which is the exact collapse this reinterpretation exists to avoid. What that preserves is the *arithmetic* of `design/campaign-pacing.md` — one mission costs one day, because a round holds at most one mission per commander — and what it does NOT preserve is that document's decision 1 as written, which is "Deploying on a mission advances the day". After S4 deploying advances nothing and readying does. Off restores "time is free unless you idle", which is what it restored before. This changes what a shipped knob does and is listed in Approximations rather than left here. These are the two places the split cuts across an existing function, and neither is a sign the seam is wrong |

## Must not regress

| Guard | What it protects |
|---|---|
| `test/soldier-health.test.mjs` | Wounds, healing and permadeath across `applyMissionResult` and `advanceDay` |
| `test/wiring.test.mjs` | Lead generation, `loadMission`, result consumption, boss placement, win/lose, lead expiry. It imports `src/game/state.js` directly, so it guards the field split — **not** the redirect |
| `test/content.test.mjs` | The armory merge inside `createState()` |
| `test/weapondesign.test.mjs` | Editor-authored weapons reaching a new campaign |
| `test/hubambient.test.mjs` | `createHubAmbient` against a state object, which S2 re-points |
| `test/session.test.mjs` recruit assertions | The three-player block hires off `recruits[0].id` and compares two bases' recruit-list lengths. Note what that does NOT guard: it compares the two players who did not hire, so a lopsided deal passes it. **S3 added the assertion that carries the weight** — every authored recruit dealt to somebody, exactly once, no id in two Barracks — plus the authored-order solo deal and the deep-clone check, in their own block |
| `test/session.test.mjs` | The suite S2 is most likely to break, because it asserts against S1's one-campaign construction: the exact key list on a view, the exact method list on a session, and four blocks that hand `createSession` a whole campaign through `opts.state`. Each of those is a decision S2 revisits, so a change there must be argued rather than absorbed |
| `test/docs.test.mjs` | This document's citations |
| `test/wiring.test.mjs` C3 block — **S4 rewrites four assertions, and each must be argued** | "resolving a mission advances the day", "the mission's reward is applied before its day is charged", "dayPerDeploy off restores the free deploy" and "...and is not charged its day" all assert against a charge S4 deletes. They are not stale: each names a real rule from `tech/campaign-pacing.md` C3, so S4 owes each one a replacement that says where that rule went, not a deletion. **Three of the four cannot be replaced in this suite**: it imports `src/game/state.js`, `config.js` and `entities.js` and never the session, and after S4 `dayPerDeploy` is not read in `state.js` at all. Their replacements belong in `test/session.test.mjs`, and what stays here is only what a bare campaign can still express. The fourth does not move, it **dissolves**: "the mission that ends the campaign is never charged a day" is a fact about a charge that will not exist, since the round's day is spent by whoever readies, before or after the mission. The rule that replaces it is a different one — *a finished campaign cannot turn another day* — and writing the old sentence against the new code produces an assertion that tests nothing |
| `test/soldier-health.test.mjs` — the wounds write-back | "survivor's wounds updated from result" expects `7 - config.healPerDay`, because today the deploy's own day heals the wounds the same call just wrote. With the charge gone the write-back is a plain 7 and the healing happens at the gate. The assertion has to move, and its comment — which explains the subtraction — is the thing that tells the next reader why |
| `test/session.test.mjs` — **two multi-player blocks that drive the day with one command** | The suite turns the day in three-player sessions with a single `advanceDay` from one seat and then asserts the consequences: that one command moves the day once for everyone and the board survives reassignment, and the whole "a day is spent by everybody" block — every base's fabrication ticked, the wounded mended, the asking player's summary naming only their own jobs. After S4 none of those days turn, because one of three readied. That is roughly eight assertions in the suite this document already calls the one S2 was most likely to break, and the same standard applies: argued, not absorbed. A third trap sits at the campaign-over case, which asserts the refusal reaches the hub **verbatim** — the gate has to pass `advanceDay`'s result through unreshaped |
| `test/session.test.mjs` — **the exact-list assertions on the public surface** | The suite pins the session's method list and the view's field list by exact equality. S4 grew only the view's, by `taskForce`; the session's method list came through S4 unchanged at five. **S5 grows both** — the view gains this commander's own pending choice and what everyone learns afterwards, and the session gains the round dispatch the page takes. Exact lists are the right shape and stay exact; they are updated deliberately, never discovered by a red bar |
| `test/session.test.mjs` — the day-observation block | S2's `missionResult` case watches `world.day` across `applyMissionResult` to work out whether a day was charged. S4 deletes both the charge and the watcher, so that block stops testing anything real. It is replaced by the gate's own assertions, not dropped |
| **A round must not be able to strand itself** (S5) | The failure the ordering change buys: the round closes, and the day never turns. **An earlier draft of this row said it could not happen in one process. That is false, and the case is ordinary rather than exotic:** `turnTheDay` returns `advanceDay`'s refusal *before* the loop that clears the flags, and `advanceDay` refuses whenever `outcome` is set — so the first result of a round that ends the campaign (a boss clear, or a failure reaching `loseAt`) leaves every ready flag set, every deploy count at 1 and every pending choice unreleased. It is harmless only because the campaign really is over and `Hub.render` promotes every screen to the end screen; it is still not what the row claimed. What S5 owes is a case pinning that the count reaches zero exactly once per round, and one pinning that a round ending the campaign mid-flight leaves a coherent end state rather than a half-cleared one |
| **A campaign that ends mid-round does not stop the round** (S5) | The design forbids withdrawal, so the remaining locked missions still run. They bank loot, `cleared` and `highWins` into a campaign that is already over, and because `outcome` is shared until S7 one commander's win ends it for commanders whose missions have not been played yet. Accepted, not fixed — S7 is what forks `outcome`, and building a guard here would be building it twice. The regression to hold is that nothing CRASHES on that path |
| **`_lastSquad` loses its writer, and needs a new one** (S5) | It is assigned in `_launch` from the deploy result — the exact call S5 converts from "start a mission" to "hold a choice" — and `_nameFor` needs it because `applyMissionResult` drops the dead from the roster before the results screen renders. It must now be written when a mission is DISPATCHED, not when a choice is made. Two things make this sharper: `setView` nulls it on every seat swap, and the seat follows the mission between each of the round's missions, so a naive port names the dead of the round's first mission and nobody after. The pending squad is NOT the substitute — it holds the living, and the results screen exists to name the dead |
| **The gate must not deadlock** | A campaign whose `outcome` is set, a seat that readied and then swapped away, a flag that survives the turn — any of these leaves a task force that can never turn another day, and no assertion in the suite would notice. The gate needs a case that says every flag clears on the turn, and one that says a finished campaign refuses without stranding anyone |
| `node test/run.mjs` | 31 suites, 1336 assertions green before S1 begins; 32 suites, 1379 after it; 32 suites, 1405 after S2 and its fix; 32 suites, 1419 after S3; 32 suites, 1448 after S4; 32 suites, 1505 after S5. **Run it more than once** — the ambient suite is randomised, and the case S2 first shipped failed about two runs in five while reporting green on the others |
| **`index.html` with no query string is unchanged** | Every visible thing S2 adds is behind `?players=2`. The single-player game is what ships, and six suites construct a `createState()`, so a regression in it is not a multiplayer bug — it is the game |
| **A single-player campaign played end to end, every slice** | No suite imports `src/hub/hub.js` or `src/main.js` — the only `src/hub/` imports in `test/` are `ambient.js` and `fpsmeter.js`. S1's entire diff lands in files the bar cannot see, so this manual check is the primary guard for that slice, not a supplement |
| **A DOM check in `test/session.test.mjs`** (new) | `test/run.mjs` calls `installDom()` once for the whole run and `test/harness.mjs` puts `document`, `window` and `requestAnimationFrame` on `globalThis`, so a DOM reference inside the session would pass every suite silently. The seam rule above needs its own assertion or it is unenforced |

## Approximations

| Approximation | What catches the failure |
|---|---|
| **The campaign log is universal.** `state.log` stays shared and unfiltered. That is a wider breach than mission privacy: `note()` also records enlistments, commissions with their build times, weapons rolling off the line, and sales with the exact credit figure — so "their base: nothing, credits, roster, armoury and fabrication are invisible" does not hold either. Every line renders in every commander's War Room. Accepted deliberately as a debugging aid | Nothing. A known and intended contradiction of the design, to be revisited after playtesting. The cheap partial fix — tag each note with the player who caused it and filter the world's notes through — is available whenever it stops being useful to see everything |
| **Missions run in sequence, not simultaneously.** The design says both missions begin at the same moment. Hot-seat has one `Mission` instance, one completion callback and one scene toggle in `src/main.js`, so two deploys resolve one after the other | Only a real transport can make starts simultaneous. Until then the player sees turns where the design promises simultaneity |
| **The client waits.** Commands are not applied optimistically. In-process this is imperceptible | Becomes visible only once the session is remote, which is the transport spec's problem |
| **Hot-seat cannot desync.** Both players share one browser and one module instance, so agreement is free and untested | Deliberate. Determinism is out of scope until joint missions need it. Note that campaign-layer lead generation is still unseeded `Math.random()` in `src/game/state.js`, which a transport spec has to deal with and this one does not |
| **Lead visibility is assigned, not modelled.** Which player sees which lead is a property set at generation; nothing represents why | Matches the design, which specifies partial visibility and no mechanism for it |
| **The deal is random, not balanced.** At two players the cheapest three of `RECRUIT_POOL` cost **620** and the dearest three **1100**, against `TUNING.startMoney` of **750** — so one commander can hire their whole hand on day one and the other can afford two of three. A shuffle gives each a different hand per campaign; it does not give them an equal one | Nothing. Whether an opening should be that swingy is a design question about how much of a campaign is luck, and it is not answered here. What the build owes is that the hand differs per campaign rather than being fixed by seat order |
| **Recruits are never replenished, and the Barracks says they are.** Nothing adds to `recruits` after construction, so a campaign has exactly six hires in it, ever. Dealing does not change that total — it changes how fast one commander reaches the end of their own list, which at two players is twice as fast. `src/hub/hub.js` already prints "No recruits left. Word travels — more will come looking for work" at that point, and nothing is coming | Pre-existing and not S3's to fix, but S3 is what makes a player read that line early enough to believe it |
| **The deal inherits the campaign layer's unseeded randomness.** Like lead generation, it defaults to `Math.random()`, so two clients could not deal the same hands. `dealRecruits` takes an rng as its second argument and nothing in `src/` passes one | The transport spec, which has to seed or centralise campaign randomness anyway, and which already has the argument it needs. Hot-seat has one deal in one process and cannot disagree with itself. `test/session.test.mjs` passes `makeRng` where a deal has to be reproducible |
| **Six recruits is the ceiling on players, and nothing enforces it.** `src/main.js` clamps the URL to six seats, which is exactly the pool size, so the worst a player can reach is one recruit each. `createSession` has no such clamp, and a seventh seat gets an empty Barracks — where `recruits[0]` is `undefined`. The seam rule says nothing may assume exactly two players; this is the one place the CONTENT, not the code, runs out | Nothing today, because the URL cannot ask for a seventh. It is named so the next person to raise the clamp knows what raising it costs |
| **Dealing the recruit pool does not scale.** Dealing is the rule — each authored recruit goes to exactly one player, so hiring is scarce without being contested and no soldier id exists twice. It is the one piece of this spec that does not stretch to more players: `RECRUIT_POOL` holds six authored soldiers, so dealing gives three each at two players, two each at three, and one each at six | Known and accepted at two. Revisit when a third player is real — a larger authored pool, recruits arriving over time, per-player copies with namespaced ids, or a generator |
| **`outcome` is one shared field until S7.** A win ends the campaign for every player, not only the one who earned it — "victory is individual" is not expressed yet | S7, which forks the field. Until then the third end state of mockup §6 cannot occur |
| **An earned boss lead lands on the shared board.** `placeBossIfEarned` writes into the world's lead set, so a finale one player earned is on the board everyone reads. The design says the finale appears for the player who earns it and spreads only by disclosure | S6 gives leads per-player visibility and S7 makes the gate per-player. Between S2 and S6 the finale is public |
| **Swapping seats discards half-finished UI.** An open deploy screen, a results screen, a pending flash **and `_lastSquad`** are dropped on a swap rather than parked per seat; only the room you were standing in survives. `_lastSquad` is on that list for a reason: `_nameFor` falls back to it, so a surviving one would print the other commander's dead under the results screen's heading | Deliberate, and it is also the guard: it is what stops a squad picked by one commander from being launched by the next. Before S3 dealt the pool this was worse than a stale name — the same soldier id existed in every roster, so the fallback resolved to the *other* commander's soldier under a name that looked correct. S5 is where a pending deployment becomes state the session holds, at which point it survives a swap because it is no longer UI |
| **Player count comes from the URL and defaults to one.** `?players=2` opens a hot-seat campaign; `index.html` on its own is the single-player game, unchanged. A per-campaign player count is not a `config.js` knob — that is a global, cross-page, localStorage-persisted developer setting, and the wrong lifetime for a decision made once per campaign | Nothing, and nothing needs to: a real lobby is phase 2's problem. The default is what keeps the single-player build the one anybody who opens the page gets |
| **Interruption is not built and not scheduled.** The design hands a departing player's squad to the AI, to fight on as companions of whoever is still on the level, still subject to permadeath. Hot-seat has nobody to depart and one `Mission` instance, so the case cannot arise here — but it is named nowhere else either, and it needs both a transport and joint missions before it means anything | `tech/multiplayer.md` phase 3. Listed so it reads as deferred rather than forgotten |
| **The board ceiling is shared, and was tuned for one player.** `config.leadCount` is a ceiling and `leadArrivalRate` an arrival rate for a board two commanders now draw from, so each sees roughly half the work a solo campaign offers, before S6 narrows visibility further. `tech/campaign-pacing.md`'s ceiling and thin-board rule are unchanged in code and changed in effect. Fewer missions each is accepted for now | Nothing here, deliberately. Both are config knobs, so this is playtesting rather than a slice, and `config.leadCount` is the number to move when it stops feeling right |
| **`dayPerDeploy` changes meaning, and one shipped setting changes behaviour.** On (the default) it becomes "one deploy per commander between two day turns"; off becomes "deploy as often as you like", which is what it meant before. The count of days a campaign spends per mission is unchanged at the default; what changes is that a single-player who deploys and then also presses the day button spends ONE day where today they spend two | Named because it is a pacing change to a built system, not a multiplayer-only one. `tech/campaign-pacing.md` C1 and C3 both get "As built" notes in the same commit. **Two rows of `design/campaign-pacing.md` stop being true and this spec does not get to decide that** — decision 1 ("Deploying on a mission advances the day") and "Time is a global control … one click away, from anywhere in the base". Both go to Bo as ask 1 |
| **Time stops being automatic in single-player.** Today a mission resolves and the day turns itself. After S4 the player presses the day button afterwards, because the gate is the only spender and a one-commander gate turns on the press. The campaign spends the same number of days; it just asks | The manual end-to-end pass. This is the one visible single-player change in the whole spec, and "index.html with no query string is unchanged" stops being literally true at S4 — it stays true in day count and in every number, and stops being true in one click |
| **Where the day sits relative to a mission is the player's choice at S4.** The gate spends the day whenever it is pressed, so a commander may deploy before or after turning it. `design/multiplayer.md` fixes the order — ready, then the missions begin — but there is nothing to lock until S5 holds a pending choice, so S4 cannot enforce it | S5, which locks the choices and holds the day until the last of them has reported. The ordering S4 shipped is not wrong, only unenforced: at S4 a round can hold at most one mission per commander and the day is one click either side of it |
| **Readiness has no timeout, no persistence and no way to nudge.** A commander who never readies stalls the task force forever | Deliberate at hot-seat: one browser, one person, and the strip already says who is outstanding. A real transport needs an answer and this spec does not give it one |
| ~~**Readying commits nothing yet.**~~ **Built in S5.** Standing down releases every pending deployment and refunds the `record.missions` each charged; a deployment is final once every commander has readied | `test/session.test.mjs`, the stand-down block. The refund is the half that would fail silently: without it the cap — which counts the held choices — locks a commander out of the round they just changed their mind about |
| **The task-force strip shows readiness and nothing else.** No count of anyone's leads, credits, roster or fabrication, and no hint of what a ready commander readied FOR | Matches `design/multiplayer.md` exactly — readiness is the one thing visible before a mission resolves. Listed so the strip is not later grown into a scoreboard by accident |
| **You cannot stand down from the deploy or results screen** — but since S5 the deploy screen has its own control. The strip rides the top bar so readiness is *readable* on both, and the ready toggle is still disabled there by the rule that disables the day button. What S5 added instead is a **Release this deployment** button on the deploy screen and a `release` command behind it, which drops ONE held choice rather than all of them — standing down is the all-of-them version. Opening a deploy screen does not stand you down; nothing implicit destroys a commitment | Deliberate. A commander holding several choices with `dayPerDeploy` off should not lose all of them because they changed their mind about one, and navigation that silently withdraws a commitment is the opposite of what "locked on ready" promises |
| **Two commanders can take the same lead, and phase 1 cannot honour what that means.** Decision 5 says they play it together on one level; joint missions are `tech/multiplayer.md` phase 3. So at S5 they play it separately, and the second one to resolve finds the lead already filtered off the shared board by the first: they keep their loot and their clear credit, and lose the threat reward, the High-threat credit toward the finale, and their log line | **Accepted as-is — Bo's call, 2026-08-20: "it doesn't matter, this is a temporary problem that will be resolved in phase 3, we shouldn't write any code to handle this situation."** So S5 writes NO code for it: no refusal, no warning, no reconciliation. The degraded outcome above is the specified behaviour, not a bug to be found later, and phase 3 is what removes the case by putting both squads on one level. Recorded here so the next reader knows it was decided rather than missed |
| **A commander who stayed at base is told nothing about the round.** "Which lead the others took" is delivered on the results screen, and that screen only exists for a commander whose mission ran — mockup §4 draws a row for a commander who "held at base", and there is no surface to draw it on. So the design's "After a mission | Which lead they took" reaches deployers only | Named rather than solved. The cheap fix is available whenever it is wanted — the campaign log is already shared and universal, so a line per lead taken would reach everybody — and it is not taken here because the log's universality is itself an approximation this spec is carrying, not a foundation to build on |
| **There is only ONE disclosure, and it is S6's.** Mockup §3 used to carry a second — an unverified "tell the task force I'm taking this lead" checkbox, which S5 shipped with nothing reading it. **Bo cut it**, and the mockup was edited to match. The two mechanisms shared a word and nothing else: a claim about where you are going, versus making a lead visible and deployable for someone else. Only the second survives, and it lives on the lead in §2, not on the deploy screen | Nothing to catch — the input is gone rather than inert. `test/session.test.mjs` pins the held choice's field list by exact equality, so a flag nobody reads cannot be parked there again unnoticed |
| **Disclosure is a claim, not a fact.** The deploy screen's "tell the task force I'm taking this lead" is optional and unverified — a commander may tick it and go elsewhere, and nothing reconciles the claim against what they did | Exactly what `design/multiplayer.md` asks for. Listed so it reads as intended rather than unfinished |
| **The round's missions are played by one person, in seat order, back to back.** Hot-seat has one canvas and one `Mission` instance, so three locked choices are three levels in a row for whoever is sitting there. Seat order is chosen because online has no order at all and a random one would imply the order carries meaning; the hub seat follows the mission being played, because online "the seat" is just who you are | Deliberate and disposable. All of it lives in `src/main.js` and is deleted at `tech/multiplayer.md` T3. Hot-seat is a test rig for the campaign layer, not a game mode, so its ergonomics are not a design question |
| **No transport, no server, no lobby** | The next spec |

## The field split

Every field `createState()` builds, and which side it lands on.

| Field | Side | |
|---|---|---|
| `day` | World | One clock, per decision 3 |
| `campaignHealth` | World | One doom clock, per decision 2 |
| `leads` | World, per-player visibility | S6 |
| `money`, `roster`, `armory`, `stores`, `building` | Player | Each base is its own |
| `log` | World | Shared and unfiltered — see Approximations |
| `outcome` | **Both** | Forks for a win, shared for a loss: "victory is individual and defeat is collective". A single field cannot express this |
| `highWins` | Player | The finale gate is earned by a player, per decision in `design/multiplayer.md`. S7 |
| `completedMissions` | Player | Read by the end screen as that player's record, and the source of `highWins` |
| `recruits` | Player | Dealt from `RECRUIT_POOL` in `src/game/soldiers.js` at campaign start, each recruit to exactly one player. **Not because uniqueness requires it**: `applyMissionResult` matches soldiers only within one player's roster, `uid()` is exported and never called, and nothing in the repo looks a soldier up across players — so per-player copies with namespaced ids would satisfy every call site. Dealing is chosen because it makes hiring scarce and uncontested, which is a campaign rule rather than a consequence. The cost is half the pool each. S3 |
| `cleared` (new) | World | Board difficulty scales with how much of the war has been fought, by anyone. `pressureScale` in `src/game/state.js` reads `completedMissions.length` today, which is a player field and so has no single answer once there are two of them; a task-force total is the answer, and it is identical to today's number in single-player. It is **written** in the same branch of `applyMissionResult` that pushes to `completedMissions` — a reader with no writer freezes the board at day-one pressure and nothing fails loudly |

`placeBossIfEarned` reads `highWins` and refuses to place a second boss lead if
one is already on the board — with a per-player gate that check becomes
per-player too.

## What a round is

After S4 the campaign has a unit above the day, and it is worth naming because
nothing in the code called it anything before.

| | |
|---|---|
| A round | Everything that happens between two day turns |
| It ends | When the last commander readies — never on a timer, never on a mission resolving |
| It costs | One day. Not one per commander, not one per mission, not one per result |
| It holds | At most one deploy per commander at the default `dayPerDeploy`, any number with it off |
| It leaves behind | Cleared ready flags **and cleared deploy counts**, both wiped on the same pass that turns the day. A flag or a count that survives the turn is the bug that strands a task force, and neither has a natural writer anywhere else |

Single-player is a round of one. The button turns the day on the press because
the presser is always the last to ready, which is why the label can stay
`Advance the day ▸` at one commander and why nothing about the single-player
day count moves.

## What a round is, once choices lock (S5)

The round S4 named, with the commit in it. Read alongside "What a round is".

| Step | Who | What holds the state |
|---|---|---|
| Pick a lead, pick a squad, Launch | One commander | The session. `Hub.deploy` is the screen; the commitment is a pending choice on the player record |
| Change your mind | The same commander | Standing down releases the choice and refunds the `record.missions` it charged. Nothing else releases it |
| The last commander readies | — | Choices LOCK. The round closes. No withdrawal |
| The round's missions run | `src/main.js` | The session hands out locked choices and counts what is outstanding. It never learns what a canvas is |
| The last mission reports | — | **The day turns.** Ready flags, deploy counts, pending choices and the outstanding count all clear together |
| Everyone learns which lead the others took | — | Something that OUTLIVES the clear above. The pending choices are gone by then, so the round's leads-taken are copied somewhere before they are released — and it is per-round, not per-player, because it is the same short list for everybody |

Two things that table did not settle, and the build did:

| | As built |
|---|---|
| **Whose campaign does the last-report turn run `advanceDay` against?** | **The commander whose mission reported last.** It decides exactly one thing — whose fabrication the summary names; everything else `advanceDay` does is the world's — and that one thing has a privacy answer. The summary has to land on a screen, the only screen rendering at that moment is the last reporter's results screen, and printing another commander's finished jobs there is precisely what "a base is invisible" forbids. Running it against the last commander to READY, which is what S4 did and what continuity would suggest, would have needed a per-player summary mailbox to deliver it anywhere legal. At the gate — a round nobody deployed in — there is no reporter and it stays the readying commander, unchanged from S4 |
| **What the round's outstanding count is keyed to** | **A Set of dispatch ids.** Each locked choice gets one at lock; `src/main.js` carries it back on the `missionResult` command. All three ways a bare integer goes wrong become a no-op rather than a miscount, and the one that is not hypothetical — a second report for the same dispatch — has its own assertion |

The day sits at the END of that table on purpose. Putting it at the lock instead
inverts the game's oldest ordering — a win's reward has always been banked
before the doom tick that followed it — and makes a locked lead rot before its
own mission runs, which then needs a rule to prevent. Turning it last removes
the case.

## How a player's campaign reaches the world

The split is a change of where a field lives, not of what an action is handed.

| | |
|---|---|
| A player holds a whole campaign | Flat and state-shaped, exactly what `createState()` returns today. The player fields are its own; the world fields are not values on it but read-throughs to one shared world |
| Which is why the actions survive | `hire`, `commission`, `sellAllLoot`, `advanceDay` and `applyMissionResult` are handed a thing indistinguishable from today's state, and keep their signatures, their bodies and their tests |
| `createState()` is composed, not preserved | Its **name, signature and observable result** do not change; its body becomes the one-player composition of the two constructors. That distinction is the whole point — leaving the old flat body in place for one player would ship the game on a construction path the two-player path never exercises, which is the second code path `## Why single-player goes through the session too` exists to refuse. Six suites construct one, and they are what says the composition is faithful |
| Reassignment, not just mutation | `advanceDay` and `applyMissionResult` **replace** `state.leads` rather than splicing it (`src/game/state.js`, lead rot and the spent-lead filter). A world field that is only aliased by reference would silently detach the moment either ran, leaving each player on a private copy of the board. Whatever carries a world field through has to survive being written to, not only read. Verified against the real actions before this was written |
| The board generates once | Not for cost — a whole `createState()` is under a millisecond — but because decision 1 is one world set. Seeding per player produces two boards, and the second is not a wasted board, it is a wrong one. The world is constructed and seeded first; players are built over it |
| The world is not a player | Nothing may hold the world as a player-shaped object with an empty roster. A player count of one has to produce exactly today's game |
| **As built:** a campaign knows its world | A player's campaign carries a non-enumerable `world` link back to the object its accessors read. The plan did not call for one and the accessors do not need it — the session does, to seat a second player over a campaign it was handed rather than built. Non-enumerable so it stays out of `Object.keys`, JSON, and anything walking the campaign's fields, which is what keeps `createState()`'s shape unchanged |

## Why the split falls here

The campaign layer and the mission layer want opposite things. The campaign is a
handful of discrete commands separated by minutes of thinking, so it can afford an
authority and a round trip. The mission is sixty simulation steps a second, so it
cannot. Putting the authority in the session and leaving `src/mission/mission.js`
untouched is what keeps those two facts from arguing.

The hub survives mostly unchanged because a client's view has nearly the shape of
today's state — `money`, `roster`, `recruits`, `armory`, `stores`, `building`,
`leads`, `day`, `campaignHealth`, `completedMissions`, `log`, `outcome` — filtered
rather than restructured. On a given client that view *is* that player's campaign,
so `game.money` keeps meaning what it means today. What changed is writes, and the
places the hub reached around its own accessors — S1 closed both, and left the hub
one thing to learn in S2: that the view it holds can be swapped for another.

## Why single-player goes through the session too

The alternative is two ways to change state — direct mutation in single-player,
commands in multiplayer — maintained in parallel forever. One path costs a
refactor of a working game once; two paths cost a decision every time an action
is added.

The consequence is that S1 rewrites how a running campaign mutates, with no
feature to show for it and no test coverage over the files it touches. That is
why the manual end-to-end check in `## Must not regress` is listed as the primary
guard for that slice rather than a formality.
