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
| S3 | **Recruit pools.** `RECRUIT_POOL` is dealt at campaign start — each authored recruit goes to exactly one player. No soldier id exists twice, and hiring is scarce without being contested | Yes |
| S4 | **The ready gate.** Readiness is a toggle each player sets and can clear again; the day advances exactly once, the moment the last player readies. Requires lifting the `config.dayPerDeploy` charge out of `applyMissionResult` so several results cannot buy several days — see the seam note below | Yes |
| S5 | **The deploy commit.** A pending choice is held per player and appears in nobody else's view. Standing down releases it, since the design only locks choices once everyone is ready — that clause belongs here and not to S4, because until this slice there is no pending choice to release. Choices lock when the last player readies and resolve against S4's single day; there is no window to withdraw after that, because the same click that locks them turns the day. Afterwards each player learns which lead the others took, and nothing else | Yes |
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
| `src/hub/hub.js` `_onClick` | A single `switch` over `data-action`. Since S1 every case that changes anything sends a command through `this.api` and does nothing else, so a slice that changes what a command means costs the hub nothing |
| `src/main.js` | The only module wiring hub, mission and session together. Since S1 it imports no action function at all — the only call site of `applyMissionResult` in `src/` is `src/game/session.js`. It is where the session is constructed, where the player count is decided, and where the seat swap re-binds |
| `src/game/state.js` `createState()` | Builds a whole campaign from `src/game/soldiers.js` and `src/game/content.js` in one place, so the world/player split is a partition of existing construction |
| `src/game/state.js` `livingRoster()` | The accessor the hub and `src/hub/ambient.js` mostly use, and the model a view-side accessor should follow |
| The DOM-free import chain under `src/game/state.js` | Every `localStorage` access in `src/game/config.js`, `src/game/customcontent.js` and `src/game/weaponoverrides.js` is guarded, which is why five suites import state headless. The session must preserve this, because it is the property that lets a later spec move it to a server |
| `src/game/config.js` `SCHEMA` | New tuning knobs are one entry each and the editor generates their controls |
| `src/game/gen/rng.js` | A seeded generator already exists. Not needed here, but it is what a later spec reaches for rather than writing a second one |

## Where the code goes

| Path | |
|---|---|
| `src/game/session.js` | Owns the campaign, holds the players, validates and dispatches commands, projects per-player views, and holds the ready gate and pending deploy choices. Must stay DOM-free and `localStorage`-guarded like the rest of `src/game/`. S1 built it around **one** campaign shared by every player — `makeView` hands them all the same object, and the `opts.state` escape hatch four blocks of `test/session.test.mjs` use takes a whole campaign. S2 replaces both: one world, one campaign per player, and an escape hatch shaped to match |
| `src/game/state.js` | The world/player field split, and the two constructors it implies — one for the shared world, one for a player's campaign over it. `createState()` stays exactly what it is today and becomes the one-player case of the second. `advanceDay`'s player half separates in S2; `applyMissionResult` loses the day charge in S4 |
| `src/hub/hub.js` | S1 turned every write case into a command and left one thing for S2: `this.game` is captured in the constructor and must become re-pointable. Nothing else moves — every screen builder opens with `const g = this.game`, including `_nameFor` and `_endScreen`, so re-pointing that one field reaches all of them |
| `src/hub/ambient.js` | `createHubAmbient(game)` closes over the state object and reads `livingRoster(game)` every frame; its returned API has no way to re-point it. S2 needs one |
| `src/hub/hotseat.js` (new) | The seat switcher of mockup §7. Mounted as a SIBLING of `#hub-root`, the way `src/hub/fpsmeter.js` already is and for the same reason — `Hub.render()` replaces that element's `innerHTML` on every navigation. Hidden during a mission. It is the one module this whole spec expects to be deleted rather than extended, when the session moves off the page |
| `src/hub/hub.css` | The switcher's styling, and in S4 the task-force strip |
| `src/main.js` | Constructs the session, holds which view is rendered, routes `onMissionComplete` through a command |
| `src/game/config.js` | Any tuning knob this introduces. Note that a per-campaign player decision does **not** belong here — `config` is a global, cross-page, localStorage-persisted developer setting |
| `test/session.test.mjs` | Commands, the ready gate, the field split, and what a view does and does not contain |

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
| The session holds players as a collection | Never a pair. No command, view, field split or screen may assume exactly two — the design is written for two, but nothing built here may make a third impossible. Every "the other player" is "the other players" |
| A player's campaign is one object | Not a world object plus a player object handed around in pairs. Each player holds a flat, state-shaped thing whose world fields read through to a single shared world and whose player fields are its own, so every action in `src/game/state.js` is handed something that behaves exactly like today's state. That is what buys the field split without rewriting the five action functions, and it is why `createState()` — imported by five suites — can stay untouched as the one-player case |
| Views project a player's campaign, not the world | S1's view already reads through getters, so the world fields arrive on it for free. Nothing in the hub learns that `day` and `money` come from different places |
| The session must not import | Anything requiring a DOM |
| `state.js` keeps its action signatures — **with two exceptions**, both deliberate | **S2 splits `advanceDay`.** It does two jobs in one pass: the world's (the date, the doom clock, lead rot, arrivals) and the acting player's (fabrication timers, wound healing). With more than one player the world half must run once and the player half must run for everyone, or the player who did not press the button never finishes a weapon and never heals. The decomposition is additive — `advanceDay` keeps its name, signature and returned summary and delegates its player half to a new export — so nothing that calls it today changes. **The split alone is not enough**, because one caller of `advanceDay` is `applyMissionResult` itself, and it passes the deploying player's campaign: that path charges a day to everybody while running only one player's half. The session cannot interpose, since the call is internal and does not leave until S4, so between S2 and S4 it has to detect after the fact whether a day was actually charged — `config.dayPerDeploy` is on **and** `advanceDay` did not refuse because the same result had just set `outcome` — and run the other halves itself. **S4 lifts the day charge.** `applyMissionResult` must stop calling `advanceDay` at its end, because two results resolving against one day cannot work while each result buys its own. The charge moves to the session and is spent **at the ready gate, before any mission runs** — not after the last result lands. That is the moment the design names ("Both players declare ready. The day advances once"), it is the only moment that costs one day whether nobody, one or every commander deployed, and it is what lets S5 lock choices and turn the day on the same click. `config.dayPerDeploy` survives the move as what it is today, the A/B toggle from `tech/campaign-pacing.md`: on, the ready gate spends a day; off, it does not. These are the two places the split cuts across an existing function, and neither is a sign the seam is wrong |

## Must not regress

| Guard | What it protects |
|---|---|
| `test/soldier-health.test.mjs` | Wounds, healing and permadeath across `applyMissionResult` and `advanceDay` |
| `test/wiring.test.mjs` | Lead generation, `loadMission`, result consumption, boss placement, win/lose, lead expiry. It imports `src/game/state.js` directly, so it guards the field split — **not** the redirect |
| `test/content.test.mjs` | The armory merge inside `createState()` |
| `test/weapondesign.test.mjs` | Editor-authored weapons reaching a new campaign |
| `test/hubambient.test.mjs` | `createHubAmbient` against a state object, which S2 re-points |
| `test/session.test.mjs` | The suite S2 is most likely to break, because it asserts against S1's one-campaign construction: the exact key list on a view, the exact method list on a session, and four blocks that hand `createSession` a whole campaign through `opts.state`. Each of those is a decision S2 revisits, so a change there must be argued rather than absorbed |
| `test/docs.test.mjs` | This document's citations |
| `node test/run.mjs` | 31 suites, 1336 assertions green before S1 begins; 32 suites, 1379 after it; 32 suites, 1404 after S2 |
| **`index.html` with no query string is unchanged** | Every visible thing S2 adds is behind `?players=2`. The single-player game is what ships, and six suites construct a `createState()`, so a regression in it is not a multiplayer bug — it is the game |
| **A single-player campaign played end to end, every slice** | No suite imports `src/hub/hub.js` or `src/main.js` — the only `src/hub/` imports in `test/` are `ambient.js` and `fpsmeter.js`. S1's entire diff lands in files the bar cannot see, so this manual check is the primary guard for that slice, not a supplement |
| **A DOM check in `test/session.test.mjs`** (new) | `test/run.mjs` calls `installDom()` once for the whole run and `test/harness.mjs` puts `document`, `window` and `requestAnimationFrame` on `globalThis`, so a DOM reference inside the session would pass every suite silently. The seam rule above needs its own assertion or it is unenforced |

## Approximations

| Approximation | What catches the failure |
|---|---|
| **The campaign log is universal.** `state.log` stays shared and unfiltered. That is a wider breach than mission privacy: `note()` also records enlistments, commissions with their build times, weapons rolling off the line, and sales with the exact credit figure — so "their base: nothing, credits, roster, armoury and fabrication are invisible" does not hold either. Every line renders in every commander's War Room. Accepted deliberately as a debugging aid | Nothing. A known and intended contradiction of the design, to be revisited after playtesting. The cheap partial fix — tag each note with the player who caused it and filter the world's notes through — is available whenever it stops being useful to see everything |
| **Missions run in sequence, not simultaneously.** The design says both missions begin at the same moment. Hot-seat has one `Mission` instance, one completion callback and one scene toggle in `src/main.js`, so two deploys resolve one after the other | Only a real transport can make starts simultaneous. Until then the player sees turns where the design promises simultaneity |
| **Two deploys buy two days, until S4.** The design is explicit that two simultaneous deploys still cost one day. `applyMissionResult` charges its own day, so at S2 and S3 each deploy advances the world clock independently and a round in which both commanders deploy burns two days of a shared doom clock | S4, which is where the charge leaves `applyMissionResult` and becomes one day spent at the ready gate. Listed here because it is a live rule violation for two slices, not an implementation detail |
| **The client waits.** Commands are not applied optimistically. In-process this is imperceptible | Becomes visible only once the session is remote, which is the transport spec's problem |
| **Hot-seat cannot desync.** Both players share one browser and one module instance, so agreement is free and untested | Deliberate. Determinism is out of scope until joint missions need it. Note that campaign-layer lead generation is still unseeded `Math.random()` in `src/game/state.js`, which a transport spec has to deal with and this one does not |
| **Lead visibility is assigned, not modelled.** Which player sees which lead is a property set at generation; nothing represents why | Matches the design, which specifies partial visibility and no mechanism for it |
| **Dealing the recruit pool does not scale.** Dealing is the rule — each authored recruit goes to exactly one player, so hiring is scarce without being contested and no soldier id exists twice. It is the one piece of this spec that does not stretch to more players: `RECRUIT_POOL` holds six authored soldiers, so dealing gives three each at two players, two each at three, and one each at six | Known and accepted at two. Revisit when a third player is real — a larger authored pool, recruits arriving over time, per-player copies with namespaced ids, or a generator |
| **One player can still turn the day alone, until S4.** Decision 3 says the day advances only when both players declare ready. S2 ships the shared clock without the gate, so whichever seat presses the button spends everybody's day | S4, which is the gate. The ordering is deliberate: the structural split is what the gate needs, and inverting them would mean building the gate against a state that cannot hold it |
| **`outcome` is one shared field until S7.** A win ends the campaign for every player, not only the one who earned it — "victory is individual" is not expressed yet | S7, which forks the field. Until then the third end state of mockup §6 cannot occur |
| **The recruit pool is copied per player, not dealt, until S3.** Every player opens on the same six authored recruits, so the same soldier id exists in each of their lists | Latent rather than broken at S2: nothing looks a soldier up across players, and `applyMissionResult` matches ids inside one player's roster. S3 replaces the copy with a deal, and the assertion that no id exists twice belongs to that slice |
| **An earned boss lead lands on the shared board.** `placeBossIfEarned` writes into the world's lead set, so a finale one player earned is on the board everyone reads. The design says the finale appears for the player who earns it and spreads only by disclosure | S6 gives leads per-player visibility and S7 makes the gate per-player. Between S2 and S6 the finale is public |
| **Swapping seats discards half-finished UI.** An open deploy screen, a results screen, a pending flash **and `_lastSquad`** are dropped on a swap rather than parked per seat; only the room you were standing in survives. `_lastSquad` is on that list for a reason: `_nameFor` falls back to it, ids are duplicated across players until S3, and a surviving `_lastSquad` would resolve to the *other* commander's soldier — invisible, because the name printed would be identical | Deliberate, and it is also the guard: it is what stops a squad picked by one commander from being launched by the next. S5 is where a pending deployment becomes state the session holds, at which point it survives a swap because it is no longer UI |
| **Player count comes from the URL and defaults to one.** `?players=2` opens a hot-seat campaign; `index.html` on its own is the single-player game, unchanged. A per-campaign player count is not a `config.js` knob — that is a global, cross-page, localStorage-persisted developer setting, and the wrong lifetime for a decision made once per campaign | Nothing, and nothing needs to: a real lobby is phase 2's problem. The default is what keeps the single-player build the one anybody who opens the page gets |
| **Interruption is not built and not scheduled.** The design hands a departing player's squad to the AI, to fight on as companions of whoever is still on the level, still subject to permadeath. Hot-seat has nobody to depart and one `Mission` instance, so the case cannot arise here — but it is named nowhere else either, and it needs both a transport and joint missions before it means anything | `tech/multiplayer.md` phase 3. Listed so it reads as deferred rather than forgotten |
| **The board ceiling is shared, and was tuned for one player.** `config.leadCount` is a ceiling and `leadArrivalRate` an arrival rate for a board two commanders now draw from, so each sees roughly half the work a solo campaign offers, before S6 narrows visibility further. `tech/campaign-pacing.md`'s ceiling and thin-board rule are unchanged in code and changed in effect. Fewer missions each is accepted for now | Nothing here, deliberately. Both are config knobs, so this is playtesting rather than a slice, and `config.leadCount` is the number to move when it stops feeling right |
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
| `recruits` | Player | Dealt from `RECRUIT_POOL` in `src/game/soldiers.js` at campaign start, each recruit to exactly one player. The pool carries fixed string ids and `applyMissionResult` matches soldiers by id, so dealing is what keeps ids unique — cloning the pool per player would put the same id in both rosters. The cost is half the pool each. S3 |
| `cleared` (new) | World | Board difficulty scales with how much of the war has been fought, by anyone. `pressureScale` in `src/game/state.js` reads `completedMissions.length` today, which is a player field and so has no single answer once there are two of them; a task-force total is the answer, and it is identical to today's number in single-player. It is **written** in the same branch of `applyMissionResult` that pushes to `completedMissions` — a reader with no writer freezes the board at day-one pressure and nothing fails loudly |

`placeBossIfEarned` reads `highWins` and refuses to place a second boss lead if
one is already on the board — with a per-player gate that check becomes
per-player too.

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
