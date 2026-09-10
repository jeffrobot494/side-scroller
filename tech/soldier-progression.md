---
type: tech
category: game-data
status: unbuilt
resolution: sharp
needs: []
related: [soldier-progression, server-settings]
---

# Soldier progression

Store progression as versioned, serializable data and derive soldier growth from original stats and lifetime XP.

## Slices

| Slice | Deliverable | Runtime behavior |
|---|---|---|
| 1 | Validated progression definition, profile assignments, pure level/bonus calculation, representative checks | None until integrated |
| 2 | Campaign rules snapshot, soldier progression state, explicit legacy migration | Existing soldiers remain unchanged at migration |
| 3 | Award XP during result settlement; use effective stats and maximum HP throughout hub and combat | Enables progression |
| 4 | Editor tables, preview/rebase, briefing and results feedback | Makes progression editable and visible |

## Reuses

| Existing component | Reuse |
|---|---|
| `src/game/soldiers.js` | Soldier attributes and shared maximum-HP calculation |
| `src/game/state.js` | Authoritative roster changes and mission-result settlement |
| `src/game/config.js` | Settings schema, persistence, import/export conventions; existing HP knobs |
| `src/editor/` | Existing editor surface; add structured progression editing |
| `test/soldier-health.test.mjs` | Persistent-wound and shared-health behavior checks |

The current settings schema supports scalar controls. A nested progression table needs structured editing and validation; it must not become a second independent set of numeric defaults.

## Where the code goes

| Location | Responsibility |
|---|---|
| `src/game/progression.js` (new) | Definition defaults, validation, level thresholds, growth calculation |
| `src/game/soldiers.js` | Starting stats, growth-profile assignments, effective-stat and HP integration |
| `src/game/state.js` | Snapshot selection, migration, XP settlement and duplicate protection |
| `src/game/config.js` | Register progression settings with existing import/export and editor conventions |
| `src/editor/` | Table/rule editing, curve preview, campaign rebase preview |
| `src/hub/` | Barracks, briefing, and result readouts |
| `test/progression.test.mjs` (new) | Calculation, settlement, validation and migration coverage |

## The seam

- Progression owns XP, level calculation, and progression bonuses. It does not overwrite original attributes or absorb equipment, wounds, bonds, or other modifiers.
- Mission settlement selects eligible soldiers and awards the mission's snapshotted reward. Combat does not award XP directly.
- In multiplayer the authority selects the rules and persists rewards. Clients display the same resolved data; local editor values cannot change earned XP.
- Effective stats are calculated centrally so combat and hub readouts agree.
- This document supports [the gameplay design](../design/soldier-progression.md); this task adds documentation only.

## Must not regress

- Preserve wounds, permadeath, shared maximum-HP calculations, ownership of rosters, and independent extraction results.
- Run `test/soldier-health.test.mjs` and the relevant mission-result and multiplayer suites when implementing.
- Add cases for exact XP boundaries, surplus XP, multiple levels, level cap, all difficulty rewards, ineligible soldiers, and replayed settlement.
- Check level 6 stacks each attribute exactly once; level 10 totals are +90 flat HP, +9 primary, +5 secondary, +3 per other attribute.
- Check unchanged base stats after recalculation, JSON round trips, invalid imports, saved revision isolation, legacy migration, and rebasing in both directions.

## Approximations

| Choice | Limit / safeguard |
|---|---|
| Small declarative rule vocabulary | Supports numeric grants and schedules; adding a new effect type requires code, changing any supplied value does not |
| Derived progression | Rebase can lower levels and stats; explicit before/after preview prevents silent changes |
| Legacy soldiers | No historical XP is inferred from missions or kills; preserve current stats as starting stats |
| Attribute effects | Audit consumers for assumptions that stats cannot exceed 10 before enabling growth |

## Recommended data model

Use one JSON-compatible progression definition containing these fields. Ship default data with the game and include it in settings import/export.

| Field | Default / meaning |
|---|---|
| `schemaVersion` | 1; changes when the data format changes |
| `revision` | Stable content revision; changes when tuning changes |
| `startLevel`, `startXp`, `maxLevel` | 1, 0, 10 |
| `xpCostByLevel` | Destination keys 2–10 → 10, 20, 40, 80, 160, 320, 640, 1280, 2560 |
| `missionXpByDifficulty` | low: 5, medium: 10, high: 20, extreme: 50 |
| `eligibility` | Outcome allowlist plus require-survival and require-extraction flags |
| `retainXpAtCap` | true |
| `attributes` | Stable IDs aim, health, speed, nerve; optional per-attribute caps |
| `profiles` | Authored primary/secondary pairs referenced by soldiers |
| `growthRules` | Ordered rows shown below |
| `levelOverrides` | Empty by default; complete replacement grant lists for particular destination levels |
| `levelUpHealthPolicy` | preserveWounds; alternatives preserveCurrentHp and fullHeal |

| Rule ID | Target | Amount | First level | Every N levels | Last level |
|---|---|---:|---:|---:|---|
| hp | flatMaxHp | 10 | 2 | 1 | cap |
| primary | primary | 1 | 2 | 1 | cap |
| secondary | secondary | 1 | 2 | 2 | cap |
| others | otherAttributes | 1 | 3 | 3 | cap |

A rule matches when the destination is within its bounds and its distance from the first level is divisible by the interval. All matching grants add together. An override replaces the entire generated grant list for that level; an empty list deliberately grants nothing. The editor shows the resolved table so replacement cannot silently hide an expected bonus.

Profiles contain explicit distinct primary and secondary IDs. A soldier may have an explicit authored pair instead of a profile reference. Resolve and save the pair at recruitment; profile edits affect new recruits unless existing soldiers are explicitly reassigned through a rebase. Remaining registered attributes form the other group.

## Soldier and campaign storage

| Saved data | Purpose |
|---|---|
| Soldier `baseStats` | Original attributes, separate from calculated bonuses |
| Soldier `xpTotal` | Nonnegative lifetime XP; never repeatedly subtract thresholds from this value |
| Soldier resolved primary/secondary IDs | Stable growth identity |
| Campaign progression snapshot and revision | Reproduce the same levels and growth after reload, even if shipped defaults change |
| Settled mission-attempt receipts | Unique attempt ID, soldier IDs, reward amounts and reward revision; prevent duplicate awards |
| Mission reward snapshot | Advertised difficulty, XP amount, revision, and eligibility policy saved when offered |

Level, XP within the current level, and total progression bonuses are derived. Optional caches must identify their source revision and be discardable. Do not store only repeatedly mutated final stats: that loses the distinction between recruitment stats and growth, making safe rebalancing difficult.

Compute cumulative thresholds by adding transition costs above the configured starting level. Starting XP is lifetime XP and must remain below the first transition threshold so recruits actually start at the configured level. Levels at or below the starting level grant nothing. The starting level and cap may be equal, in which case there is no next threshold.

Persist the XP update and settlement receipt together as one authoritative state change. A replayed mission attempt cannot grant XP again, even after a reload. Multiplayer receipt keys include the soldier identity, so one commander's extraction cannot suppress another's award.

## Revision changes and migration

| Action | Behavior |
|---|---|
| Edit defaults | Validate and save a new revision; existing campaigns retain their snapshots |
| Load existing campaign | Use its snapshot, without consulting newer balance defaults |
| Rebase campaign | Preview recalculation from unchanged XP and base stats; explicitly adopt new snapshot |
| Change mission rewards | Affects newly offered missions; no retroactive XP changes |
| Increase cap | Retained XP can immediately unlock levels on rebase |
| Rebase health | Preserve wound damage; clamp a living soldier's current HP to at least 1 and at most the new maximum; dead status stays dead |
| Migrate legacy soldier | Copy current attributes to base stats, initialize configured starting XP, assign an explicit authored growth pair, preserve wounds and status |

Migration is versioned and runs once. Missing growth assignments require an authoring fix or a deliberately configured fallback profile; never choose attributes by current ranking. The default level-1 migration grants no bonuses and preserves existing health.

## Validation and editor requirements

- Levels and intervals are positive integers; start level cannot exceed cap. Transition costs are positive integers and cover every reachable transition exactly once.
- XP rewards and starting XP are nonnegative integers. Growth amounts are finite nonnegative numbers; attribute increments are integers. HP settings must yield positive maximum HP.
- Reject unknown difficulties, attribute IDs, targets, policies, duplicate rule IDs, invalid profile pairs, and out-of-range overrides. Zero rewards or grants are valid tuning choices.
- Optional caps must be valid for their attribute. Reject non-finite values and values exceeding safe numeric arithmetic, including cumulative XP totals.
- The editor provides add/remove/edit controls for rules and levels, not merely fixed controls for today's nine transitions. It shows threshold totals and per-level and cumulative grants.
- Validate imports atomically; on failure retain the previous working definition and report exact fields. Reset and export operate on the full definition.
- Existing base-HP and HP-per-Health settings remain the sole defaults for those values. Campaign progression evaluation must use a consistent saved or authoritative set of these HP settings as well.
