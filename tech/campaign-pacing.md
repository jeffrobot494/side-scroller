---
type: tech
category: gameplay-systems
status: unbuilt
resolution: sharp
needs: []
related: [campaign-pacing, game-balance, missions, level-generation]
---

# Campaign pacing

How `design/campaign-pacing.md` is built: the day becomes the only currency, the
lead board becomes weather, and the finale is gated on High wins.

`needs:` is empty because nothing has to be built first. Leads already come from
`src/game/gen/levelgen.js`, which shipped — the dependency is on code, not on
pending work, so it is carried by `related:` instead. (Naming `level-generation`
in `needs:` would redden the bar the moment this spec's status flips to
`building`: its spec predates the seven-part rule and is missing all of them,
which the prerequisite check treats as blocking.)

## Slices

Five, ordered. Each lands alone and is committed alone.

| # | Slice | Runtime change | Ordering |
|---|---|---|---|
| C1 | Time is a global control | Yes — the button moves | Free |
| C2 | Leads expire | Yes | Free |
| C3 | Deploying costs a day | Yes | Free |
| C4 | The finale gate is two High wins | Yes | **Before C5** |
| C5 | Arrivals replace the top-up | Yes | **After C4** |

**C1 — Time is a global control.** The "Advance the day ▸" control moves from the
War Room into the persistent top bar, so passing a day is one click from any
room. The War Room keeps the campaign-health meter and the log.

Two constraints the move carries:

| | |
|---|---|
| Gate it to the hub | `render()` emits the top bar in `deploy` and `results` mode too. A day advanced while a squad is staged on a lead would, after C2, expire the lead the deploy screen is holding — and that screen dereferences it without a guard. The control is disabled outside the room screens |
| Fix the rate it reports | The War Room prints `TUNING.doomPerDay` while the rule reads `config.doomPerDay`. They already disagree the moment the knob is touched, and C3 makes the lie bigger |

**C2 — Leads expire.** Each lead gets a lifespan rolled inside `leadLifeMin` …
`leadLifeMax` when it is generated, counted in whole days, ticked by every day
advance whatever caused it. A lead at zero leaves the board and is logged. Ops
shows each lead's remaining days. The board still tops up after a mission — that
is C5's job — so on its own this slice makes leads churn rather than thin.

Same commit: `design/missions.md` still lists "Expires in: 4 days" as a lead
field, which `design/campaign-pacing.md` explicitly supersedes with the 1–3
window. Applying a supersede the design already declared, not authoring design.

**C3 — Deploying costs a day.** Behind `dayPerDeploy`, resolving a mission
advances the day — the same day advance the time control uses, so expiry,
fabrication, healing and doom all tick once per deploy. Off restores today's
behaviour exactly, which is what makes the decision A/B-able in play.

**C4 — The finale gate is two High wins.** A cleared mission whose lead
advertised High is counted; at `bossHighWins` the boss lead is placed
immediately, bypassing the board ceiling — "immediate and guaranteed" outranks
the cap, and a full board must not be able to defer the finale. `bossAfter` and
the flat total-win gate are deleted, not kept as a floor.

**This slice also moves where the boss is placed** — out of the board top-up and
into mission resolution. That is why it precedes C5: the top-up is the only site
that places a boss lead today, and C5 deletes it.

**C5 — Arrivals replace the top-up.** A new campaign opens with `seedLeads` leads
instead of a full board. Each day advance rolls `leadArrivalRate` new leads.
`leadCount` stops being a target and becomes a ceiling arrivals never cross.
Finishing a mission no longer refills. A board below the ceiling, or empty, is a
legal state and not an error. This is the slice that makes a thin board possible,
and with it the empty board the design names as legal.

## Reuses

| What | Where | Used for |
|---|---|---|
| `advanceDay()` | `src/game/state.js` | Already the single place a day costs something. Expiry and arrivals tick here; nothing gets a second day-loop |
| `applyMissionResult()` | `src/game/state.js` | Owns lead consumption and win recording. C3's day, C4's High-win count and boss placement land here |
| `refillLeads()` and its `addUniqueLead()` / `makeLead()` helpers | `src/game/state.js` | Lead generation with id-collision retry. C5 splits *when* it runs from *how* it builds a lead; the generation half is untouched |
| Config `SCHEMA` | `src/game/config.js` | One entry per knob buys the editor control and localStorage persistence. `leadCount`, `bossAfter`, `doomPerDay`, `healPerDay`, `threatScaleCap` are already there |
| `_topbar()` | `src/hub/hub.js` | Renders above every screen already — C1 is a move into it, not a new surface |
| The `advance` action handler and `setFlash` | `src/hub/hub.js` | The day-advance click path and its flash survive C1 unchanged |
| `.topbar` / `.resources` / `.btn` | `src/hub/hub.css` | Existing bar styling; no new CSS system |
| Generated mission shape — `difficulty` label, `winsCampaign`, `threatReward` | `src/game/gen/levelgen.js` | C4 reads the `"High"` label the generator already writes. No new difficulty concept |
| `note()` / `state.log` | `src/game/state.js` | Expiry and arrival announcements need no new plumbing |
| `TUNING` | `src/game/content.js` | Campaign start values and `loseAt` stay where they are |

## Where the code goes

| Path | What changes |
|---|---|
| `src/game/state.js` | All five slices' rules. Lifespan on a lead, expiry and arrival inside `advanceDay`, seeding in `createState`, the deploy day and the High-win count in `applyMissionResult`, the gate that places the boss |
| `src/game/config.js` | New knobs as `SCHEMA` entries: `leadArrivalRate`, `leadLifeMin`, `leadLifeMax`, `seedLeads`, `bossHighWins` in the existing **Generation** group beside `leadCount`; `dayPerDeploy` in **Campaign**. `bossAfter` is removed in C4 |
| `src/hub/hub.js` | C1's button move and the War Room's doom-rate text; the Ops lead row gains a remaining-days readout in C2 |
| `src/hub/hub.css` | Only if the top-bar control needs a rule the existing `.topbar` / `.btn` classes do not give |
| `design/missions.md` | The superseded "Expires in: 4 days" field, in C2's commit |
| `test/wiring.test.mjs` | The campaign guard grows the cases for each slice, in that slice's commit |

Conventions this must follow: every number is a `SCHEMA` entry, never a constant
(`CLAUDE.md`, "Everything tweakable in the editor"); the hub owns no rules, so
each new behaviour is an exported state action the hub calls; a regression case
goes in the suite that already covers the subsystem rather than a new file.

No new modules. If a slice seems to want one, that is a signal the rule landed in
the wrong layer.

## The seam

| | |
|---|---|
| **Owns** | The lead board's lifecycle — seeding, arrival, expiry, consumption — the day counter and what a day costs, the finale gate, and the seven knobs above |
| **Owns** | The single answer to "what does a day do", which stays inside `advanceDay` no matter who asked for the day |
| **Must not touch** | Level generation. `generateLevel`, the threat-cost model, difficulty bands and `pressureScale` belong to `tech/game-balance.md` and `tech/level-generation.md`. This spec changes *when* a lead is made, never *what* is in it |
| **Must not touch** | The mission scene and the `result` contract it hands back (`src/main.js` → `applyMissionResult`). A deploy costing a day is settled on the way back, not inside the mission |
| **Must not touch** | Permadeath, wounds, the economy, fabrication rules. These tick per day and that is the only relationship |
| **Must not touch** | The board floor. An empty board with no exit but passing days is what the design asks for; adding a pity lead is a design change, not an implementation detail |

The hub is a renderer here. Deploying advancing a day is a rule, so it lives in
`src/game/state.js` and never in the hub's launch path — which today still
increments `record.missions` directly and should not gain company.

## Must not regress

| Guard | What it protects |
|---|---|
| `test/wiring.test.mjs` | The campaign spine: a cleared lead is consumed, a win is recorded, threat reward restores health, a failure costs health, the boss lead ends the campaign, nothing refills after game over |
| `test/soldier-health.test.mjs` | **C3's trap.** It resolves a mission with `missionId: "no-such-lead"` and asserts a survivor comes home with 7 wounds. An unconditional day advance heals 1 and makes it 6. Whether the fix is the test or the rule is C3's call to make deliberately — silently gating the day on "a lead was found" would contradict the slice |
| `test/docs.test.mjs` | This spec's citations. **Not** its completeness: the seven-part gate only fires for design docs carrying `sprint:`, and `design/campaign-pacing.md` has none, so nothing in the bar checks the parts here |
| `node test/run.mjs` | Green before every slice commit, per the standing bar |

**C5 rewrites four assertions in `test/wiring.test.mjs`, and only these four.**
They are the behaviour the slice deletes, not collateral:

| Line | Assertion | Why C5 changes it |
|---|---|---|
| 11 | "board filled to 3 leads" | A new campaign opens on `seedLeads` |
| 27 | "board refilled to 3" | Nothing refills after a mission |
| 50 | "failed lead consumed + refilled" | Same `=== 3` check, folded into a consumption assertion. The consumption half must survive |
| 33–36 | The four-win loop | It picks a non-boss lead each pass and would find none on an unrefilled board — a crash, not a failed assertion, taking the boss cases at 37–44 with it |

Anything else in that file that needs editing to make a slice pass means the
slice is wrong.

**Nothing in the suite mounts `Hub`.** C1 and C2's hub changes have no automated
guard — verify the button placement, the deploy-screen gate, and the Ops
remaining-days readout by hand in the browser, and say so when handing them over.

Bo's answer to "what would you be upset to see break?" is added here before C1
starts.

## Approximations

| # | Where it is not exact | What catches it |
|---|---|---|
| 1 | **Arrivals are a floor plus one coin flip**, not a Poisson draw: a rate of 1.25 is one guaranteed lead plus a 25% chance of a second. Cheap, matches "expected new leads per day", and can never produce more than `ceil(rate)` in a day | A day can never produce the burst a true Poisson tail would. Visible only as a board that varies slightly less than it might; the design states its tuning target as an average, which this hits |
| 2 | **A won mission's reward is applied before the day it cost.** The order matters only when the doom tick would take health to zero and the reward would have saved it; this spec chooses that the mission you just won counts first | A campaign lost on the results screen of a victory would be the visible failure. The wiring test pins the order |
| 3 | **A campaign-ending mission is not charged its day.** `advanceDay` refuses to run once `state.outcome` is set, and both the boss win and a fatal failure set it inside mission resolution. So "every mission costs a day" has one exception, at the exact moment the day can no longer matter | Nothing — deliberate. It would only become visible if a post-campaign screen ever counted days |
| 4 | **The boss lead does not expire.** The design says the finale arrives immediately and guaranteed once earned; a finale that rots would make an earned campaign unwinnable, since arrivals only produce ordinary leads | If it did expire, the gate would need a re-arrival rule. Not built, because nothing asks for one |
| 5 | **`doomPerDay`, `healPerDay` and `threatScaleCap` keep today's defaults.** The design says all three now mean something different and are worth retuning; the values are settled in play, not here | Sprint task 11 (playtest + tune). Shipping a guessed number would look like a decision |
| 6 | **Lifespans tick in whole days.** No partial-day expiry, so a lead rolled at 1 day survives exactly one day advance | Matches the design's 1–3 day window; a finer clock has nothing to read it |

## How the board works today

Background, for anyone reading this before the code.

| | |
|---|---|
| Board | `createState()` calls `refillLeads()`, which tops up to `config.leadCount` (3) and adds the boss when `completedMissions.length >= config.bossAfter` (4) |
| Refill | `applyMissionResult()` removes the deployed lead and immediately tops the board back up. The board is therefore always full |
| Days | `advanceDay()` is reachable only from the War Room. It ticks fabrication, heals wounds, subtracts `doomPerDay`, and checks the loss condition |
| Time cost | Nothing but idling advances a day. Deploying is free |
| Leads | Have no lifespan. A lead sits on the board until it is deployed on |
| Gate | A flat count of cleared missions, difficulty-blind |
