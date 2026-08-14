---
type: tech
category: gameplay-systems
status: reference
resolution: sharp
needs: []
related: [game-balance, level-generation, enemyspec]
---

# Game balance and difficulty

Where every difficulty and balance number in the shipped build lives, and how
they combine. Player-facing behaviour is `design/game-balance.md`.

**This is a reference doc, not a build spec** — nothing is being built from it,
so it does not carry the seven parts. If a balance change turns into a project,
that project gets its own spec.

## The three cost/budget systems

| System | Cost side | Budget side | Module |
|---|---|---|---|
| Weapons | `weaponCost(weapon)` — per-shot value × delivery multiplier × rate × size, minus spread | `TIERS`: t1 100 · t2 180 · t3 280 | `src/game/weaponcost.js` |
| Enemies | `enemyThreat(def)` | — | `src/game/enemycost.js` |
| Missions | Summed `enemyThreat` of placed enemies | `budgetFor(difficulty, scale)` | `src/game/enemycost.js` · `src/game/gen/levelgen.js` |

### Enemy threat is authored, not computed

`enemyThreat(def)` in `src/game/enemycost.js` returns early for any descriptor
carrying `isSpec`, handing back the spec's own `threat` field × `K.global`. Every
mission enemy is an EnemySpec (`src/game/enemyspecs.js`), so the stat-block
formula below it — the `K` table weighting health, contact damage, ranged DPS,
windup, detect range, and speed — **no longer runs on any mission enemy.** It
remains live for legacy flat defs, of which none are placed.

Authored threats, from `src/game/enemyspecs.js`:

| Enemy | Threat | Role |
|---|---|---|
| Husk Charger | 50 | charger |
| Spore Wisp | 65 | skirmisher |
| Lurk Gunner | 70 | artillery |
| Strafe Raider | 85 | skirmisher |
| Cowardly Duelist | 110 | elite |
| Sky Duelist | 120 | elite |
| Iron Moth | 320 | boss — boss leads only |

## Difficulty bands

`DIFFICULTY` in `src/game/enemycost.js`:

| Band | Budget |
|---|---|
| low | 250 |
| medium | 420 |
| high | 600 |
| extreme | 820 |

`budgetFor(id, scale)` returns `band.budget × scale`, rounded. A boss lead uses
`extreme × scale × 1.4` (`src/game/gen/levelgen.js`).

## Campaign pressure

`src/game/state.js`:

```
pressureScale = min(config.threatScaleCap, 1 + (day - 1) × 0.06 + wins × 0.05)
```

`DIFF_BY_PRESSURE` selects the band per lead, by weighted random:

| Applies when | low : medium : high |
|---|---|
| scale ≤ 1.2 | 3 : 2 : 0 |
| scale ≤ 1.6 | 2 : 3 : 1 |
| above | 1 : 3 : 3 |

Three properties of this as built:

- **`extreme` is unreachable from `DIFF_BY_PRESSURE`.** Only `{ boss: true }`
  produces it. `DIFF_LABEL` and the `tag-diff-extreme` style in
  `src/hub/hub.js` exist for a band leads never generate.
- **`state.day` increments only in `advanceDay()`.** `applyMissionResult()` does
  not touch it, so deploying is free in clock terms and pressure reduces to
  `1 + wins × 0.05` for a player who never idles.
- **The default `bossAfter` is 4.** At 4 wins and no day advances the scale is
  exactly 1.20, which is still inside the first band — where `high` has weight
  0. `config.threatScaleCap` (default 2.2) would require `(day-1)×0.06 +
  wins×0.05 = 1.2`, roughly twenty idle days on top of the wins, so it is not
  reached in a normal campaign.

## What the budget buys

`generateLevel` in `src/game/gen/levelgen.js`. Difficulty feeds exactly four
things:

| Output | Derivation |
|---|---|
| Enemy budget | `budgetFor(difficulty, scale)`, ×1.4 on top of `extreme` for a boss |
| Biome | Soft bias — hard prefers hive/ruins, else ridge/depot |
| `threatReward` | low 16 · medium 24 · high 32 · extreme 40 · boss 0 |
| Artifact value | `60 + budget × 0.35`, ×2.2 for a boss |

Geometry is **not** among them. Width comes from `length` (`short` 4800–5600 ·
`medium` 6000–6800 · `long` 7400–8200), which `src/game/state.js` picks uniformly
from `["short","medium","medium","long"]` independently of difficulty. Shape
comes from the config knobs below.

### Placement, and the real enemy ceiling

`fillEnemies` walks shuffled anchors, placing a roster enemy that fits the
remaining budget, and stops when `remaining` falls below the cheapest roster
threat (50). Anchors are one per perch plus a ground point every 200–300px across
the playable span; `MIN_ENEMY_GAP` is 130px. So a medium level offers roughly
25–30 legal spots, which caps enemy count well below what a scaled `high` budget
(600 × 1.6 ≈ 960, ~12 average enemies) could buy — but the two are close enough
that budget, not anchors, is the binding constraint in practice.

Placement preference: perch anchors prefer `shooter`/`turret`; ground anchors
take a mobile enemy 70% of the time. Boss leads place the highest-threat roster
enemy at the ground anchor nearest the exit first.

There is no minimum-quality floor — a 250-budget Low lead can roll two elites
(110 + 120), and a 960-budget High lead can roll nineteen Husk Chargers.

## Player-side numbers

| Quantity | Value | Where |
|---|---|---|
| Soldier max HP | `soldierBaseHp + health × soldierHpPerHealth` — defaults 10 + 2×stat, so 12–30 for a 1–10 stat | `src/game/soldiers.js` |
| Current HP | max HP − persistent `wounds`, carried between missions | `src/mission/entities.js` |
| Aim → spread | `config.aimSpread` (0.12) scaled by the shooter's Aim stat; applies to the player, companions, and enemies alike | `src/game/config.js` |
| Recruit stats | aim/health/speed/nerve, 3–10, hand-authored per recruit | `src/game/soldiers.js` |
| Recruit cost | 120–480 credits, hand-set, not derived from stats | `src/game/soldiers.js` |
| Starting kit | 750 credits, one carbine, empty roster | `src/game/content.js` |

Nothing on this side is scaled by, or read by, the difficulty model.

## Economy and the doom clock

`TUNING` in `src/game/content.js`: `startMoney` 750 · `startCampaignHealth` 60 ·
`doomPerDay` 6 · `loseAt` 0.

| Event | Campaign health | Where |
|---|---|---|
| Day advanced | −6 | `advanceDay()` in `src/game/state.js` |
| Mission success | + the lead's `threatReward` (16–40), capped at 100 | `applyMissionResult()` |
| Squad wiped | −10, flat, regardless of difficulty | `applyMissionResult()` |
| Boss lead cleared | Campaign won outright | `applyMissionResult()` |

Enemy loot is `threat × config.lootPerThreat` (default 0.5) per kill
(`src/mission/entities.js`), so a mission's loot income scales linearly with its
enemy budget — the one place where a harder mission pays proportionally more.

## Config knobs with no stated design intent

Every value below currently exists as a `SCHEMA` default in
`src/game/config.js`, and no design doc states what it should be or why. Listed
as fact, not as a request.

| Key | Default | Governs |
|---|---|---|
| `leadCount` | 3 | Leads on the board at once |
| `bossAfter` | 4 | Wins before the finale can appear |
| `threatScaleCap` | 2.2 | Ceiling on the pressure multiplier |
| `genPlatformDensity` | 0.8 | Fraction of terrain slots that get a structure |
| `genMaxTiers` | 3 | Max chained jumps a structure climbs |
| `genStructureSpacing` | 460 | Px of level per terrain slot |
| `aimSpread` | 0.12 | Spread constant scaled by the Aim stat |
| `lootPerThreat` | 0.5 | Credits per point of enemy threat |
| `soldierBaseHp` / `soldierHpPerHealth` | 10 / 2 | Soldier HP curve |

## Known issues

**`doomPerDay` is duplicated, and the War Room prints the wrong copy.** The value
exists twice: as a config knob in `src/game/config.js` (default 6) and as a field
on `TUNING` in `src/game/content.js` (also 6). `advanceDay()` in
`src/game/state.js` reads the config one, so that is the value the campaign
actually loses each day. The War Room blurb in `src/hub/hub.js` prints the
`TUNING` one. They agree only because both defaults are 6 — edit the knob in the
editor and the War Room text states a rate the game is not using.

`startMoney`, `startCampaignHealth`, and `loseAt` live only on `TUNING` and have
no config knob, so they do not have this problem.

## Not editable from the editor

The band budgets in `src/game/enemycost.js`, the per-band `threatReward` table
in `src/game/gen/levelgen.js`, the `DIFF_BY_PRESSURE` weights and the two
pressure coefficients in `src/game/state.js`, and the authored `threat` on each
spec in `src/game/enemyspecs.js` are constants in source rather than config
entries, so they are not editable from the editor.
