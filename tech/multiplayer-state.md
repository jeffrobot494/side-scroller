---
type: tech
category: gameplay-systems
status: unbuilt
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
| S2 | **Two players in one session.** Every field in `createState()` is assigned to the world or to a player (table below). The page renders one view at a time with a control to swap, which means `Hub` and `createHubAmbient` must both accept a new view rather than capturing one at construction. Hot-seat playable | Yes |
| S3 | **The ready gate.** Each player declares ready; the day advances exactly once when both have. Requires lifting the `config.dayPerDeploy` charge out of `applyMissionResult` so two results cannot buy two days — see the seam note below | Yes |
| S4 | **The deploy commit.** A pending choice is held per player and is not in the other player's view. Both choices lock when both are ready and resolve against S3's single day. Afterwards each player learns which lead the other took, and nothing else | Yes |
| S5 | **Lead visibility and disclosure.** The world lead set gains per-player visibility, plus a command to disclose a lead | Yes |
| S6 | **The finale.** `highWins` and the boss placement become per-player; the boss lead is disclosable through S5; `outcome` forks so victory is individual while defeat stays collective | Yes |

S1 lands alone as a refactor with no visible change. S2 is the first slice a
player can see. S4 depends on S3, and S6 depends on S5; S3 and S5 are independent
of each other.

**The credit split is not in this spec.** `design/multiplayer.md` splits "the
mission's credit reward", and no such reward exists — `state.money` moves only in
`hire`, `commission` and `sellAllLoot`, a mission pays in loot into `stores` plus
`threatReward` into `campaignHealth`, and generated missions carry no credit
field (`src/game/gen/levelgen.js`). The design also excludes the one payout that
does exist. Splitting requires inventing the thing being split, which is a design
question, not a build one.

## Reuses

| What | Why it matters |
|---|---|
| `src/game/state.js` action functions — `hire`, `commission`, `sellAllLoot`, `advanceDay`, `applyMissionResult` | Almost every mutation already goes through one of the five, so S1 is mostly redirection. They already return `{ ok, reason }` or a summary, which is the shape a command result wants |
| `src/hub/hub.js` `_onClick` | A single `switch` over `data-action`. Four cases call action functions — `hire`, `commission`, `sell`, `advance` — and each is self-contained |
| `src/main.js` | The only module wiring hub, mission and state together, and the only call site of `applyMissionResult` in `src/`. It is where the session is constructed |
| `src/game/state.js` `createState()` | Builds a whole campaign from `src/game/soldiers.js` and `src/game/content.js` in one place, so the world/player split is a partition of existing construction |
| `src/game/state.js` `livingRoster()` | The accessor the hub and `src/hub/ambient.js` mostly use, and the model a view-side accessor should follow |
| The DOM-free import chain under `src/game/state.js` | Every `localStorage` access in `src/game/config.js`, `src/game/customcontent.js` and `src/game/weaponoverrides.js` is guarded, which is why five suites import state headless. The session must preserve this, because it is the property that lets a later spec move it to a server |
| `src/game/config.js` `SCHEMA` | New tuning knobs are one entry each and the editor generates their controls |
| `src/game/gen/rng.js` | A seeded generator already exists. Not needed here, but it is what a later spec reaches for rather than writing a second one |

## Where the code goes

| Path | |
|---|---|
| `src/game/session.js` (new) | Owns the campaign, holds the players, validates and dispatches commands, projects per-player views, and holds the ready gate and pending deploy choices. Must stay DOM-free and `localStorage`-guarded like the rest of `src/game/` |
| `src/game/state.js` | The world/player field split. `applyMissionResult` loses the day charge in S3 |
| `src/hub/hub.js` | The four write cases and `_launch`'s `s.record.missions` write send commands. `this.game` is captured in the constructor and must become re-pointable for S2. `_nameFor` and `_endScreen` read `roster` directly and read a view instead |
| `src/hub/ambient.js` | `createHubAmbient(game)` closes over the state object and reads `livingRoster(game)` every frame; its returned API has no way to re-point it. S2 needs one |
| `src/main.js` | Constructs the session, holds which view is rendered, routes `onMissionComplete` through a command |
| `src/game/config.js` | Any tuning knob this introduces. Note that a per-campaign player decision does **not** belong here — `config` is a global, cross-page, localStorage-persisted developer setting |
| `test/session.test.mjs` (new) | Commands, the ready gate, the field split, and what a view does and does not contain |

Conventions from `CLAUDE.md` that bind here: one commit per slice; every
`localStorage` access guarded; constants and curves go in the config `SCHEMA`;
no build step.

## The seam

| | |
|---|---|
| The session owns | The campaign state, which player may see what, command validation, the ready gate, and pending deploy choices |
| The session must not touch | The mission simulation, rendering, audio, the editor, level generation, or anything under `src/mission/` |
| The hub must not | Mutate campaign state after S1. That includes `_launch`, which today writes to roster soldiers directly. It keeps only its own UI state — `mode`, `location`, `flash`, `deploy`, `result`, `sold`, and `_lastSquad` |
| `_lastSquad` stays in the hub | It deliberately holds references to soldiers `applyMissionResult` has already dropped from the roster, so the results screen can still name the dead. A view cannot supply that and must not be made to |
| The view must not carry | Anything `design/multiplayer.md` says a player cannot see: the other player's base, board, pending choice, mission outcome, casualties or loot |
| The view must carry | The two things the design says a player *can* see — the other player's readiness, and after resolution, which lead they took |
| The session must not import | Anything requiring a DOM |
| `state.js` keeps its action signatures — **with one exception** | S3 must remove the `config.dayPerDeploy` call to `advanceDay` from the end of `applyMissionResult`, because two results resolving against one day cannot work while each result buys its own. The day charge moves to the session, which is the only thing that knows both results have landed. This is the one place the split cuts across an existing function, and it is deliberate rather than a sign the seam is wrong |

## Must not regress

| Guard | What it protects |
|---|---|
| `test/soldier-health.test.mjs` | Wounds, healing and permadeath across `applyMissionResult` and `advanceDay` |
| `test/wiring.test.mjs` | Lead generation, `loadMission`, result consumption, boss placement, win/lose, lead expiry. It imports `src/game/state.js` directly, so it guards the field split — **not** the redirect |
| `test/content.test.mjs` | The armory merge inside `createState()` |
| `test/weapondesign.test.mjs` | Editor-authored weapons reaching a new campaign |
| `test/hubambient.test.mjs` | `createHubAmbient` against a state object, which S2 re-points |
| `test/docs.test.mjs` | This document's citations |
| `node test/run.mjs` | 31 suites, 1336 assertions green before S1 begins |
| **A single-player campaign played end to end, every slice** | No suite imports `src/hub/hub.js` or `src/main.js` — the only `src/hub/` imports in `test/` are `ambient.js` and `fpsmeter.js`. S1's entire diff lands in files the bar cannot see, so this manual check is the primary guard for that slice, not a supplement |
| **A DOM check in `test/session.test.mjs`** (new) | `test/run.mjs` calls `installDom()` once for the whole run and `test/harness.mjs` puts `document`, `window` and `requestAnimationFrame` on `globalThis`, so a DOM reference inside the session would pass every suite silently. The seam rule above needs its own assertion or it is unenforced |

## Approximations

| Approximation | What catches the failure |
|---|---|
| **The campaign log is universal.** `state.log` stays shared and unfiltered, so it discloses mission outcomes, casualties and recovered loot that `design/multiplayer.md` says stay hidden. Accepted deliberately as a debugging aid | Nothing. A known and intended contradiction of the design, to be revisited after playtesting |
| **Missions run in sequence, not simultaneously.** The design says both missions begin at the same moment. Hot-seat has one `Mission` instance, one completion callback and one scene toggle in `src/main.js`, so two deploys resolve one after the other. The single day is charged once, after both | Only a real transport can make starts simultaneous. Until then the player sees turns where the design promises simultaneity |
| **The client waits.** Commands are not applied optimistically. In-process this is imperceptible | Becomes visible only once the session is remote, which is the transport spec's problem |
| **Hot-seat cannot desync.** Both players share one browser and one module instance, so agreement is free and untested | Deliberate. Determinism is out of scope until joint missions need it. Note that campaign-layer lead generation is still unseeded `Math.random()` in `src/game/state.js`, which a transport spec has to deal with and this one does not |
| **Lead visibility is assigned, not modelled.** Which player sees which lead is a property set at generation; nothing represents why | Matches the design, which specifies partial visibility and no mechanism for it |
| **No transport, no server, no lobby** | The next spec |

## The field split

Every field `createState()` builds, and which side it lands on. The three marked
undecided are the ones a builder must not guess at.

| Field | Side | |
|---|---|---|
| `day` | World | One clock, per decision 3 |
| `campaignHealth` | World | One doom clock, per decision 2 |
| `leads` | World, per-player visibility | S5 |
| `money`, `roster`, `armory`, `stores`, `building` | Player | Each base is its own |
| `log` | World | Shared and unfiltered — see Approximations |
| `outcome` | **Both** | Forks for a win, shared for a loss: "victory is individual and defeat is collective". A single field cannot express this |
| `highWins` | Player | The finale gate is earned by a player, per decision in `design/multiplayer.md`. S6 |
| `completedMissions` | Player | Read by the end screen as that player's record, and the source of `highWins` |
| `recruits` | **Undecided** | `RECRUIT_POOL` in `src/game/soldiers.js` carries fixed string ids and `hire` splices out of it. Forked, both rosters can hold soldiers with identical ids, which `applyMissionResult` matches on. Shared, hiring becomes a contested race the design never mentions |

`placeBossIfEarned` reads `highWins` and refuses to place a second boss lead if
one is already on the board — with a per-player gate that check becomes
per-player too.

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
so `game.money` keeps meaning what it means today. What changes is writes, and the
places the hub reaches around its own accessors: `_launch`, `_nameFor` and
`_endScreen`.

## Why single-player goes through the session too

The alternative is two ways to change state — direct mutation in single-player,
commands in multiplayer — maintained in parallel forever. One path costs a
refactor of a working game once; two paths cost a decision every time an action
is added.

The consequence is that S1 rewrites how a running campaign mutates, with no
feature to show for it and no test coverage over the files it touches. That is
why the manual end-to-end check in `## Must not regress` is listed as the primary
guard for that slice rather than a formality.
