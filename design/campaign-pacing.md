---
type: design
category: gameplay-systems
status: built
resolution: sharp
related: [missions, game-balance, level-generation]
---

# Campaign pacing

How time, leads, and the finale are gated. What the campaign should feel like —
current behaviour is `design/game-balance.md`, which this replaces on landing.

## The five decisions

| | Decision |
|---|---|
| 1 | Deploying on a mission advances the day |
| 2 | A lead expires after 1–3 days and leaves the board |
| 3 | Time is passed from the persistent top bar, not from inside the War Room |
| 4 | The finale appears once the player has won two High-threat missions |
| 5 | Leads arrive on a daily chance, not as a top-up after each mission |

## Why

Time was previously free. A player who never idled paid nothing to the doom
clock, so the invasion only advanced when invited to, and the escalation curve
only moved on wins. Making the deploy cost a day means every mission is also a
day of the invasion getting stronger, and the two halves of the loop — fight and
clock — stop being independent.

Leads arriving on the clock rather than on demand is the same idea applied to
opportunity: the board becomes weather, not a menu.

## What the player experiences

| | |
|---|---|
| Every mission costs a day | There is no free action. Deploying and idling both advance the invasion |
| Leads rot | The board is a set of opportunities with a shelf life, not a menu that waits |
| Leads arrive on their own schedule | Passing time is how you fish for work, and fishing costs campaign health |
| Time is a global control | Passing a day is always one click away, from anywhere in the base |
| The finale is earned, not counted | Reaching the end means proving you can take the hardest work available, not grinding easy wins |

## The board

| | |
|---|---|
| Seeded at day 1 | A new campaign opens with exactly one lead. The campaign begins on a single piece of work, not on a choice |
| Arrivals | Each day that passes has a configurable chance of producing a new lead |
| Typical size | Two to three leads — close to today, with thin patches |
| Ceiling | Arrivals stop at the existing leads-on-the-board knob, whose meaning changes from a target the game tops up to a ceiling it never exceeds |
| No top-up after a mission | Finishing a mission no longer refills the board. The only source of leads is the daily roll |
| Thin is legal | Fewer leads than the ceiling, or none at all, is a normal state rather than an error |

A thin board is the point. It means passing time to fish for a better lead has a
real cost, and that a good lead you cannot yet crew is a loss you can watch
happen.

### Tuning target

Board size settles at roughly **arrival rate × average lifespan**, reduced by
missions consuming leads. Hitting a typical two-to-three therefore needs those
two knobs to multiply to about 2.5 — which a single daily coin flip cannot reach,
since a 1–3 day lifespan averages 2. Arrivals must be able to exceed one per day
on average. Both numbers are config knobs; the target is the design commitment,
the values are settled in play.

## Leads and expiry

| | |
|---|---|
| Lifespan | Rolled per lead when it is generated, within a tunable window — 1 to 3 days |
| Ticks | On any day advance, whether that day came from a deploy or the time control |
| On expiry | The lead leaves the board and is not replaced except by the daily roll |
| Deploying spends the lead | Unchanged — win or wipe, that lead is gone |

**Supersedes:** `design/missions.md` lists "Expires in: 4 days" as a lead field.
That number becomes the 1–3 window here.

## The finale gate

| | |
|---|---|
| Condition | Two won missions that were High threat |
| Replaces | The old flat count of total wins. It is removed, not kept as a floor |
| Difficulty is the lead's own | A mission counts if the lead advertised High, regardless of what it turned out to be |
| Losses do not count | Only a cleared High mission counts toward the gate |
| Arrival | Immediate and guaranteed the moment the gate is met — the finale is never something the player has to wait out on a roll |

High-threat leads cannot be rolled at the very start of a campaign — they become
possible only once campaign pressure has risen. So the gate has a natural floor:
the player must survive long enough for High work to appear, then clear two of
it. The finale is no longer reachable by clearing the easiest thing on the board
repeatedly.

## What must be tunable

Every number this design introduces is adjustable from the settings editor
without a code change, and persists like the rest of the config. Nothing below is
a magic constant. Names are indicative — the spec settles the exact keys.

| Knob | Default | Range | Governs |
|---|---|---|---|
| `leadArrivalRate` | 1.25 | 0 – 3 | Expected new leads per day. Must permit values above 1; a plain probability cannot reach the board target |
| `leadLifeMin` | 1 | 1 – 10 | Shortest lead lifespan, in days |
| `leadLifeMax` | 3 | 1 – 10 | Longest lead lifespan, in days |
| `leadCount` | 3 | 1 – 5 | Ceiling on the board. Existing knob; its meaning changes from a target to a cap |
| `seedLeads` | 1 | 0 – 5 | Leads present on day 1 |
| `bossHighWins` | 2 | 1 – 6 | High-threat wins required before the finale appears |
| `dayPerDeploy` | on | on / off | Whether deploying advances the day. A switch on decision 1 itself, kept so the change can be A/B'd in play rather than reverted |

Removed: the flat total-win count that previously gated the finale. It is
replaced by `bossHighWins`, not kept alongside it.

### Already tunable, and worth retuning

These knobs are not introduced here, but this design changes what they do:

| Knob | Default | Why it moves |
|---|---|---|
| `doomPerDay` | 6 | Days now arrive from deploys as well as idling, so the effective loss rate roughly doubles |
| `healPerDay` | 1 | Becomes recovery per mission rather than per idle day |
| `threatScaleCap` | 2.2 | Previously never reached; with days ticking per deploy it starts to bind |

## Interactions worth watching in play

Consequences of the decisions together. Named so they are recognised in playtest
rather than discovered as bugs.

| Interaction | |
|---|---|
| One deploy can clear the board | A deploy spends its lead and advances a day, which can expire the others. Arriving back at an empty board is reachable in a single mission |
| The doom clock roughly doubles in speed | Days now come from deploys as well as idling |
| Fabrication and healing are now paced in missions | Build times and wound recovery tick per deploy, so both effectively became "per mission" |
| Fishing for a High lead costs health | If High is not on the board, passing time to find one runs the clock — the intended tension, and also how a campaign can stall |
| An empty board has one exit | With no leads and no top-up, the only action is to pass days, which costs health and cannot be refused. Nothing currently floors this |
| The opening lead can rot | The campaign starts with one lead on a 1–3 day fuse and an empty roster. A player who hires slowly, or cannot afford a squad worth deploying, can watch the only mission expire and start the campaign on an empty board |
