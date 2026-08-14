---
type: design
category: gameplay-systems
status: reference
resolution: vague
related: [missions, enemies, level-generation]
---

# Game balance and difficulty

What the game currently does to the player, difficulty-wise. Descriptive only —
every row is read out of the shipped build, nothing here is a proposal. The
numbers and formulas behind it live in `tech/game-balance.md`.

## Difficulty as the player meets it

| | |
|---|---|
| Difficulty is a quantity of enemies | A harder mission has more bodies drawn from the same roster, never tougher versions of them |
| Enemy stats never scale | No enemy's health, damage, speed, or accuracy changes with campaign progress |
| The whole roster ships on day one | Every enemy type except the boss can appear in the first mission the player takes |
| Level geometry is difficulty-blind | Length, verticality, density, and spacing are rolled independently of the threat level |
| The player is unbounded | Squad size, weapons, and soldier quality grow with credits; nothing in the difficulty model reads them |
| The advertised threat is honest | The label on a lead is the band that generated it. Nothing lies yet |

## The escalation curve

Pressure rises with elapsed days and cleared operations, and raises one number:
the enemy budget a mission is allowed to spend.

| Stage | What the player sees |
|---|---|
| Opening | Low and Medium leads only. High cannot be rolled |
| Middle | Medium becomes the common case, High becomes possible |
| Late | Medium and High equally likely, Low rare |
| Finale | A single Extreme boss lead appears once two High leads have been cleared, and ends the campaign when won |

Two properties of this curve as built. Both are what `design/campaign-pacing.md`
changed, and they are the pacing half of this doc it supersedes:

- **Every mission advances a day, and so does idling.** Deploying moves the
  clock, so pressure rises on both terms even for a player who never waits.
- **The finale cannot arrive before the middle stage does.** It is gated on two
  cleared High leads, and High cannot be rolled inside the opening band — so the
  player has to survive long enough for High work to appear, then take it twice.
  Clearing the easiest thing on the board repeatedly no longer reaches the end.

`Extreme` exists as a band and as a UI colour, but nothing except the boss lead
ever generates at it.

## Where the difficulty ceiling comes from

| Cap | Effect |
|---|---|
| Pressure ceiling | A configured maximum multiplier on the enemy budget. Far above what a normal campaign reaches |
| Anchor supply | Enemies stand on generator-offered spots with an enforced minimum spacing, so a level has a hard limit on how many it can hold regardless of budget |
| Roster ceiling | The most expensive non-boss enemy is fixed, so a large budget buys quantity, not a harder unit |

The last two are the real ceiling; the configured one is not reached in practice.

## Cost and budget, the balance backbone

The same idea appears three times, in the form the GDD calls the balance
backbone (`design/gdd.md` §5.1) — a thing is legal if its parts fit a budget.

| Where | The budget is | The parts are |
|---|---|---|
| Weapons | A tech tier | Effects, scaled by fire rate, size, and spread |
| Enemies | Authored per enemy | A single threat score, hand-set on each enemy |
| Missions | A difficulty band × campaign pressure | The threat scores of the placed enemies |

One consequence worth naming: **enemy threat is authored, not derived.** The
scoring formula that would compute it from a stat block still exists but no
longer runs on any mission enemy, so an enemy's cost to the generator is whatever
number was typed next to it — it does not follow if the enemy is edited.

## What difficulty does not currently touch

Read against the axes `design/enemies.md` already separates. Only the left column
moves today, and only by count:

| Moves with difficulty | Does not move |
|---|---|
| How many enemies | Damage · Health · Projectile speed · Attack frequency |
| Which biome (soft bias) | Aim error · Reaction time · Behavioural variety |
| Reward and artifact value | Level length · Terrain shape · Enemy intelligence |

`design/enemies.md` states intelligence and difficulty are separate axes tuned
separately. As built, neither axis is tuned by the campaign: intelligence is
fixed per enemy, and difficulty is a count.

## Failure and the doom clock

| | |
|---|---|
| The campaign is lost | When campaign health reaches zero |
| Health falls | A fixed amount per day advanced |
| Health rises | By a per-band reward on a successful mission — larger for harder bands |
| A wipe costs | A flat penalty, independent of the mission's difficulty |
| The campaign is won | By clearing the single boss lead |

Because health falls per day and rises per win, and because missions do not
advance days, the doom clock currently only runs when the player lets it.

## Sources

Every claim above was read from the shipped build in Aug 2026. Design intent
that predates it, where it exists, is in `design/gdd.md` (§5.1 cost/budget,
§8 enemies, §10 campaign health), `design/enemies.md` (intelligence vs
difficulty), and `design/missions.md` (leads, advertised threat, safety nets).
Where this document and those disagree, this one describes what is, and they
describe what was intended.
