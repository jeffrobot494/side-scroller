---
type: design
category: gameplay-systems
status: designed
resolution: sharp
related: [soldier-behavior, game-balance, missions]
---

# Soldier progression

Soldiers earn mission XP and automatically gain permanent health and attributes as they level up.

## Defaults and interpretation

| Rule | Default |
|---|---|
| Starting level / XP | Level 1 / 0 lifetime XP |
| Maximum level | 10 |
| XP costs | Each listed cost is additional XP needed from the preceding level, not a lifetime threshold |
| Every other level | Destination levels 2, 4, 6, 8, 10 |
| Every third level | Destination levels 3, 6, 9 |
| Level 1 | Starting stats only; no level-up grants |

The cadence, completion eligibility, level cap, and health behavior below are explicit draft defaults alongside the supplied XP and growth values. All are configurable.

## XP requirements

| Destination level | XP from previous level | Lifetime XP required |
|---|---:|---:|
| 1 | — | 0 |
| 2 | 10 | 10 |
| 3 | 20 | 30 |
| 4 | 40 | 70 |
| 5 | 80 | 150 |
| 6 | 160 | 310 |
| 7 | 320 | 630 |
| 8 | 640 | 1,270 |
| 9 | 1,280 | 2,550 |
| 10 | 2,560 | 5,110 |

Costs are individually editable. Doubling is the initial curve, not a required formula.

## Mission rewards

| Difficulty | XP per eligible soldier |
|---|---:|
| Low | 5 |
| Medium | 10 |
| High | 20 |
| Extreme | 50 |

| Situation | Default behavior |
|---|---|
| Successfully completes and survives extraction | Every deployed, extracted survivor receives the full reward |
| Benched, dead, or not extracted | No XP |
| Failed or aborted mission | No XP; reward eligibility by outcome is configurable |
| Kills, damage, control time, squad size | Do not affect or divide XP |
| Shared mission | Each commander's eligible soldiers earn XP from their own extraction result |
| Reward timing | After mission results are finalized, before showing the results screen |
| Multiple levels earned | Grant every crossed level in order, keeping surplus XP |
| Maximum level reached | Keep earning lifetime XP; show MAX instead of a next-level requirement |
| Repeated delivery of one result | Award only once per soldier per mission attempt |

The mission briefing displays its XP reward. Difficulty and reward are fixed when the mission is offered; later tuning changes do not alter that advertised reward.

## Attribute growth

Each soldier has one explicitly assigned primary attribute and one distinct secondary attribute. The remaining attributes are their other attributes. Assignments are authored per soldier or through an editable profile, never inferred from whichever stat is currently highest.

| Grant | Amount | Destination levels |
|---|---:|---|
| Flat maximum HP | +10 | Every level from 2 onward |
| Primary attribute | +1 | Every level from 2 onward |
| Secondary attribute | +1 | 2, 4, 6, 8, 10 |
| Each other attribute | +1 | 3, 6, 9 |

Rules stack when their schedules coincide. At level 6, a soldier gets +10 maximum HP and +1 to every attribute. The other-attribute rule excludes primary and secondary, so neither gains twice.

| Reached level | Total flat HP bonus | Primary bonus | Secondary bonus | Bonus to each other attribute |
|---|---:|---:|---:|---:|
| 2 | 10 | 1 | 1 | 0 |
| 3 | 20 | 2 | 1 | 1 |
| 4 | 30 | 3 | 2 | 1 |
| 5 | 40 | 4 | 2 | 1 |
| 6 | 50 | 5 | 3 | 2 |
| 7 | 60 | 6 | 3 | 2 |
| 8 | 70 | 7 | 4 | 2 |
| 9 | 80 | 8 | 4 | 3 |
| 10 | 90 | 9 | 5 | 3 |

Current attributes are Aim, Health, Speed, and Nerve. Attribute caps are individually configurable and default to no progression cap; the recruit range of 1–10 does not stop growth.

## Health and wounds

| Rule | Default |
|---|---|
| Maximum HP | Base HP + effective Health attribute × HP per Health + flat progression HP |
| Health attribute growth | Adds its normal derived HP in addition to the flat level-up bonus |
| Existing wounds | Unchanged by leveling |
| Current HP | New maximum HP minus existing wounds, bounded to the valid living range |
| Dead soldiers | Never revived by progression or rebalancing |

Preserving wound damage raises current HP by the increase in maximum HP without removing wounds. Alternative configurable level-up policies are preserving current HP or fully healing; the default is preserving wounds.

## Configuration and development tuning

| Editable data | Required controls |
|---|---|
| Level curve | Starting level, starting XP, maximum level, cost of every transition |
| Mission XP | Reward for every difficulty, eligible outcomes, survivor/extraction requirements, XP retention at cap |
| Growth | Enabled rules, amounts, target attribute group, first destination level, interval, optional final level |
| Exceptions | Per-level replacement grants for milestones or irregular growth |
| Soldier profiles | Primary and secondary assignment; attribute registry and optional caps |
| Health | Base HP, HP per Health, flat growth, level-up health policy |
| Rebalancing | Explicit choice to keep the campaign's rules or preview and adopt a new revision |

Changing values needs no gameplay code edits. The editor previews the complete level table, cumulative bonuses, and the effect on an example soldier before saving. Invalid settings produce field-specific errors and cannot replace working settings.

An existing campaign keeps its saved progression rules until the designer explicitly rebases it. Rebasing recalculates level and bonuses from lifetime XP and original stats; it does not re-price past mission rewards. Preview any level loss, attribute changes, and health changes before applying.

## Player feedback

| Surface | Information |
|---|---|
| Barracks | Level, XP progress within this level, XP needed for next level, primary and secondary labels |
| Soldier details | Starting stats, progression bonuses, final stats, next level's gains |
| Mission briefing | Flat XP reward per eligible soldier |
| Results | XP earned, old and new levels, combined gains across all crossed levels |

Example: a new soldier completes one Extreme mission and earns 50 XP. They reach level 3, with 20 of the 40 XP needed toward level 4. Total gains are +20 flat HP, +2 primary, +1 secondary, and +1 to each other attribute.

## Balance implications

| Observation | Consequence |
|---|---|
| Level 10 requires 5,110 XP | From zero: 1,022 Low, 511 Medium, 256 High, or 103 Extreme completions |
| Flat HP growth totals +90 | Substantial durability growth before any Health-attribute increases |
| XP costs double while rewards stay flat | Early levels arrive quickly; later levels require much longer service |

Storage, validation, and integration are specified in [the progression technical design](../tech/soldier-progression.md).
