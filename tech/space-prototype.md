---
type: tech
category: development-tools
status: designed
resolution: vague
needs: []
related: [player2-lab]
---

# Space prototype

This is the plan for a standalone page, `space.html`. It plays one mission in a zero-gravity asteroid field so we can test whether a space level works, and it shares no code with the game.

**Where the requirements come from.** Bo's brief of 2026-09-30, plus four answers he gave to questions. There is no design doc. Every row under "Placeholders" was invented so the prototype can be built and played. Bo replaces them.

| Requirement | Source |
|---|---|
| Asteroid field with spaceship debris, no planet surface | brief |
| No gravity | brief |
| The map is roughly a big square, not a long strip | brief |
| Rotate-and-thrust jetpack (Asteroids): A/D turn, W thrusts forward, no friction | brief + answer 1 |
| The player aims with the mouse, independent of facing | Bo, 2026-09-30 (overrides answer 1's aim) |
| Asteroids drift. Bodies bounce off them without taking damage. Shots and blasts push them, and a bullet pushes only slightly | brief + answer 4 + Bo, 2026-09-30 |
| Small spaceship ruins you can fly inside | brief |
| Enemies can come from any direction | brief |
| Win: find the artifact, then reach extraction. Lose: the whole squad is dead | answer 2 |
| A squad of soldiers. You swap which one you control, and the others run on AI | answer 3 |
| Mission gameplay "a copy / very close" to the real game | brief |
| No hub, settings or pause menu. The page loads straight into the level | brief |

## Slices

Each slice is one commit on branch `space-prototype`. The prototype is its own page, so no slice changes the game's runtime behaviour. The only guard on every slice is `test/space.test.mjs` plus playing it.

| # | Slice | Playable result |
|---|---|---|
| S1 | **Flight.** Adds `space.html` and a fixed 60Hz step with a 0.25s frame clamp, the same accumulator as `Mission._frame` (`src/mission/mission.js`). Input is **sampled once per sim step**, and a press is latched until a step consumes it, so edges survive a variable step count. The world is a square with a camera that follows the controlled soldier. The soldier turns at a fixed rate and thrusts along its facing, with no drag and a thrust-speed cap. Asteroids are circles drifting at random velocities, with mass proportional to area. They are placed by rejection sampling with a minimum gap, and the start area is kept clear. Circle-vs-circle collisions resolve with restitution (**P7**), and soldiers are circles for this. The map edge is a bouncing wall (**P1**). The one soldier here already carries S5's recruit stats, so S2 has an Aim value | Fly around and bounce off rocks |
| S2 | **Guns.** Fire at the mouse cursor, independent of facing (**P2**). Weapon values are copied from `src/game/arsenal.js`. Magazines and reload follow `src/mission/entities.js`: `soldierMagazines` 4 means one loaded plus three spares, and with no spares left R does nothing. Spread uses `aimAccuracy` and `fire()` in `src/mission/ai.js` with `aimSpread` 0.12. Soldier damage and burn are × `playerDamageMult` 1.25. Effects resolve **in the order the weapon authors them**, as `applyEffects` in `src/mission/combat.js` does: `damage`, `burn`, `slow`, `knockback`, `explode` (damages opponents in its radius), `chain` (`jumps` × `range`), `pierce`, `pellets`, `homing` (turns at `homing.turn`). All are copies. **Knockback** is the real shove channel: it is added on top of thrust velocity, divided by √mass, and decays at `knockbackDecay` 3000px/s², so it does not become permanent drift. The upward lift is dropped. **Slow** scales the body's whole displacement per step while it lasts, the 2D form of the real horizontal-only scale. A round stops at an asteroid and gives it a slight push (**P8**). An explosion also pushes asteroids in its radius, which is new and comes from answer 4. Stationary **target dummies** with HP are placed here so every effect is visible before enemies exist. S4 deletes them. *As built:* an **explosive round detonates when it hits a rock or wall**. The game's just dies there, and copying that would mean blasts almost never push rocks. A rock-stopped round pushes the rock `bulletPush / mass`: about 3px/s on a mid-sized rock. The shove decays by magnitude rather than per axis, so a diagonal shove keeps its direction | Shoot rocks and dummies |
| S3 | **Ruins, artifact, extraction.** A ruin is a static hull of wall segments with one or two openings (**P3**). Soldiers, enemies and asteroids all collide with walls, as circle vs segment, swept. Rounds stop on walls. Ruins are placed before asteroids, which reject any spot overlapping a hull. One ruin holds the artifact, which any soldier picks up by touching it (**P9**). The extraction zone sits at least half the map away from the start (**P10**). A living soldier inside the zone while the squad holds the artifact ends the mission in success, the same one-soldier rule as `mission.js`. Every soldier dead ends it in failure. A banner then appears, and a restart key rebuilds from a new seed. *As built:* a hull is a blunt-nosed five-sided outline, 340–460 × 170–220. Breaches are 90px wide (a soldier is 36). The long sides breach forward of centre, because the bulkhead meets them at −L/8 and would split a centred breach into two gaps a soldier barely fits. The test checks every opening for clearance. Enter restarts. `window.space.world()` exposes the world in the console | Full objective loop with no enemies |
| S4 | **Enemies.** Four new zero-g types (**P4**), each seeded from one roster entry in `src/game/enemyspecs.js` for HP and damage: Charger ← `husk_charger` (contact 10), Gunner ← `lurk_gunner` (orb 14), Swarmer ← `strafe_raider` (bullet 8, HP lowered for packs), Mine-layer ← `spore_wisp` (pods 8, released as drifting proximity mines). Contact damage has the real 0.6s cooldown (`src/game/enemyspec/normalize.js`, `src/mission/enemyspec/runtime.js`). Enemies fire through S2's path on the enemy team. Asteroids and walls block line of sight. Some enemies are placed in the field, and **waves spawn offscreen at a random bearing from the squad**, so they arrive from any angle, not only from the map edge (**P5**). Enemies move with direct thrust in any direction; only soldiers use rotate-and-thrust. *As built:* the contact cooldown is **per enemy** (`ent.contactCooldown` in `runtime.js`), not per target as first written. There are 12 placed groups plus one Gunner beside the artifact's hull. A placed enemy idles until a soldier comes within 650px with line of sight, or until it is hit. Enemies fire only with line of sight. A Swarmer group is a pack of 3 (HP 14). A Mine is shootable (HP 4), arms after 0.8s, fuses within 70px, and blasts 12 in an 80px radius; a layer keeps at most 6 alive. The S2 dummies are kept as a test fixture with a count of 0 in play. Obstacle avoidance (`avoid`) is shared with S5 | Can be lost |
| S5 | **Squad.** Three soldiers with copied recruit stats and `soldierMaxHp` (`src/game/soldiers.js`: `15 + health × 2`). Tab/K swaps control to the next living soldier, as `src/game/controlmap.js` binds it. When the controlled soldier dies, control passes to the next one automatically, as `mission.js` does. Uncontrolled soldiers run companion AI on the **same rotate-and-thrust body**. To steer, a desired velocity (station offset beside the leader, plus avoidance of any asteroid or wall inside a look-ahead) becomes a Δv. The soldier turns toward Δv and thrusts only when roughly aligned, and braking means turning around. Companions aim independently of facing, as the player does and as the real ones do (`ai.js`), firing at the nearest hostile in line of sight within ammo and reload rules. Death is permanent. `friendlyFire` false. *As built:* each soldier's station is a **world-fixed bearing** (spread around the squad) at 90 ± 40px from whoever leads, rolled once at the start. The game's "one side of the leader" has no 2D meaning. A bearing relative to facing would swing the whole squad around every time the leader turned. Closing speed is 1.2px/s per px off station, on top of the leader's velocity, capped at the thrust cap, so a companion trails a leader cruising at the cap. It thrusts only within 0.35 rad of the heading it wants. Measured: within 60px of station behind a leader drifting at 216px/s. Engage range is min(700, 0.9 × the weapon's reach) | The mission as asked |
| S6 | **HUD and tells.** Per-soldier HP bars, ammo and spare magazines, weapon name, reload state, objective line, squad list. Offscreen hostiles, the artifact and extraction appear as edge arrows (**P11**). Hit and muzzle flashes | Readable in play |

## Reuses

The prototype **copies** code and values from the game and imports none of them. Nothing in the game can break it, and it cannot constrain the game.

| Copied from | What |
|---|---|
| `src/game/arsenal.js` | Weapon values for the loadout (**P12**) plus every value an S2 test weapon needs |
| `src/mission/ai.js` | `aimAccuracy`, the spread formula in `fire()`, pellet fan |
| `src/mission/combat.js` | `applyEffects` (authored order, explode, chain), `advance` (homing), pierce |
| `src/mission/entities.js` | `shoveActor`/`decayShove`/`bodyMass` (knockback channel), magazine and reload rules |
| `src/game/config.js` | `aimSpread` 0.12, `playerDamageMult` 1.25, `knockbackDecay` 3000, `soldierBaseHp` 15, `soldierHpPerHealth` 2, `soldierMagazines` 4, `reloadSpeedMult` 1, `friendlyFire` false |
| `src/game/soldiers.js` | Three recruits' names and stats, `soldierMaxHp` |
| `src/game/enemyspecs.js` | HP and damage seeds for the four new enemies |
| `src/mission/enemyspec/runtime.js` | Contact damage with a 0.6s per-target cooldown |
| `src/mission/mission.js` | Fixed step and clamp, one-soldier extraction, auto-swap on death |
| `src/mission/render.js` | Look of the six projectile shapes |

## Where the code goes

| Path | Holds |
|---|---|
| `space.html` | The page. It is linked from nothing, like `player2-lab.html` |
| `src/space/` (new) | Prototype modules, importing only each other |
| `src/space/sim.js` (new) | World, bodies, collisions, weapons, enemies, squad AI. **DOM-free** |
| `src/space/view.js` (new) | Canvas drawing and HUD |
| `src/space/main.js` (new) | Input sampling, loop, restart. The only module that touches the DOM |
| `test/space.test.mjs` (new) | Headless suite that steps `sim.js` |

`sim.js` may split into several files past about 1,000 lines. What matters is the DOM-free boundary.

## The seam

There is none into the game. Internally the seam is `sim.js` ↔ page. The sim takes a per-step input object (`turn`, `thrust`, `fire`, `reload`, `swap`, with presses already latched) and a seeded RNG, and exposes read-only state for drawing. `test/space.test.mjs` drives it with scripted input and no canvas.

## Must not regress

| Guard | How |
|---|---|
| The game | Nothing imports `src/space/`. It imports nothing outside itself, which `test/space.test.mjs` asserts by scanning import lines |
| The bar | `node test/run.mjs` green |
| Prototype basics, per slice | Drift keeps speed constant. Thrust accelerates along facing. Momentum is conserved in asteroid collisions (within tolerance). A shove decays to zero. A round pushes an asteroid. No body passes a wall, and no body passes an asteroid at max thrust speed plus max shove plus a collision rebound. Each effect matches its copied source on a dummy. With no spare magazines, reload does nothing. Contact damage lands at most once per 0.6s. Artifact + extraction wins, and a dead squad loses. Swap and auto-swap skip the dead. The same seed + the same input trace gives the same end state |

## Approximations

| Real game | Prototype |
|---|---|
| EnemySpec runtime: parts, weak points, tracks, utility brains | Hand-coded behaviour per enemy type, with no parts or weak points |
| Nav graph, stations, survival (cover, spot choice, dodge, duck) | Steering only. The real AI assumes gravity and platforms, and none of survival is copied |
| Crouch | Dropped, since there is no floor |
| Gamepad and keyboard aim | Mouse aim only |
| Artifact granted on reaching the exit | A physical pickup (answer 2) |
| Knockback lift of 0.35 upward | Dropped, since there is no "up" |
| Slow scales horizontal displacement | Scales all displacement |
| Explosions push nothing | They push asteroids (answer 4). Whether they push bodies is P8 |
| Loot, XP, haul | Dropped, since there is no meta layer |
| Sound | None |
| Continuous collision | Walls and rounds are swept. Circle-circle is discrete, with substeps whenever a body's per-step travel exceeds half the smallest radius |

## Placeholders — invented for a playable build, for Bo to replace

| # | Question | Stand-in |
|---|---|---|
| P1 | What is at the map edge? | A bouncing wall for everything |
| P2 | Fire key | Left mouse button, with Space as an alternate |
| P3 | Ruins: how many, do they drift? | 3–5, static |
| P4 | Enemy set | Charger, Gunner, Swarmer, Mine-layer (S4) |
| P5 | Waves: cadence, cap, escalation | One every ~30s, 3–5 enemies, +1 per wave, never ends |
| P6 | ~~Aim~~ | Decided: everyone aims independently of facing, the player with the mouse |
| P7 | Restitution. Do soldiers and enemies bump each other? | 0.6. Bodies pass through each other and bounce only off rocks and walls |
| P8 | Do explosions push soldiers and enemies too? | Rocks only. (Decided: rounds stop at asteroids and push them slightly) |
| P9 | The artifact carrier dies | The artifact drops where they died, and anyone can pick it up |
| P10 | Extraction distance | At least half the map from the start |
| P11 | Offscreen awareness | Edge arrows, no minimap |
| P12 | Loadout | Carbine, Grenade Launcher, Arc Tazer, one per soldier (3 soldiers) |
| P13 | Does reloading slow turning or thrust? | No, matching `reloadSpeedMult` 1 |
| — | Numbers | Map 4000×4000, ~40 asteroids r 30–160, turn 4 rad/s, thrust 500px/s², thrust cap 420px/s |

*As built (S1):* 40 asteroids read as empty space at 1280×720, so it is 70; soldier radius is 18 (≈ the game's 30×46 body), not 14. Bodies are not swept: every body substeps together so none travels more than half the smallest radius per substep.
