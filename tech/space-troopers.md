---
type: tech
category: gameplay-systems
status: built
resolution: sharp
needs: [space-prototype, space-magboots]
related: [space-prototype, space-magboots]
---

# Space prototype — enemy troopers

The trooper is a hostile soldier in the space prototype (`tech/space-prototype.md`). It flies the same rotate-and-thrust jetpack body as the squad, wears the same magnetic boots (`tech/space-magboots.md`) and carries one of the squad's three guns. It fights from surfaces: it clamps onto a rock or a hull, walks round it into cover, and walks back out to shoot.

**Where the requirements come from.** Bo's message of 2026-10-01, which also asked for extra thought on the AI and said to answer open questions with a best guess. There is no design doc. Bo said to answer open questions with a best guess, so every **K#** row under "Placeholders" is a guess for him to replace.

| Requirement | Source |
|---|---|
| A new enemy that is a soldier, with the same capabilities as the friendly soldiers | brief |
| They jet around in pairs | brief |
| They have magnetic boots and like to clamp onto surfaces with them | brief |
| They move around a surface to get cover from your shots, and move back to shoot at you | brief |
| If you run away, they follow | brief |
| Each carries one of the three soldier weapons (`LOADOUT`), picked at random | brief |
| Spend extra thought on the AI | Bo's message; "The AI" section below |

## Slices

Each slice is one commit on branch `space-prototype`. The prototype is its own page, so no slice changes the game. `test/space.test.mjs` plus playing it guard every slice.

| # | Slice | Runtime change | Playable result |
|---|---|---|---|
| T0 | **Boots for any soldier body.** Today the boots machinery runs on `world.soldiers` only. `settleBoots` loops over that list. `crash`, `kill` and `collideAll`'s unbooted rock hit test `kind === "soldier"`. The airborne boots pull and the walk-direction flip sit inside `drive`, the player's input path. Make all of it run on any **soldier body**, meaning a squad soldier or a trooper, through one predicate: the settle loop, crash damage (in `crash` and in `collideAll`), the death switch-off, and two helpers moved out of `drive` that both callers use. The helpers are the airborne pull and **walk** (set `walkIn`, flipping `dir` and facing when the direction changes). A trooper is `kind: "enemy"`, `type: "trooper"`, so it stays an enemy everywhere else: it is in `updateEnemies`, `hurt` alerts it, it is hit by the player's rounds, and the player's damage multiplier never applies to it. It also has an `ENEMY_TYPES.trooper` entry for colour, `tele` and size, which the views' enemy paths read. Its constructor adds the soldier body fields, with `magsLeft: Infinity`, rolled stats (K2), and a **per-trooper copy** of a random `LOADOUT` weapon whose effect amounts are scaled by K3 (`fire` hands rounds the weapon's own `effects`, so the scale must live in the copy). Nothing places one yet | None. No trooper exists in play, and a player soldier runs the same code it did | Nothing new |
| T1 | **Troopers in the field.** Placed in pairs by the normal mix and by waves. They fly by `pilot`, the squad's own rotate-and-thrust controller, under a speed cap, and never with the boots on. **Perch choice**, the **landing approach** (fly in, turn feet-first, switch the boots on inside the 40px activation range, the same `toggleBoots` rule the player has), **leaving** a surface (boots off, then fly), **floating combat** when no perch fits, **chasing** a target that runs (a grounded trooper relocates when the target is beyond its range band, K6), telegraphed **bursts**, and **reload**. Grounded, it only stands and fires when it can see you: there is no cover walk yet. Drawn: the soldier figure in hostile colours, as a trooper branch in each view's enemy path (the 3D loop, `drawEnemy`/`drawAlien` in 2D); the health bar at the figure's height. Edge arrows and tells read `ENEMY_TYPES.trooper` and need nothing more | Yes: a new enemy in every field and in waves | Pairs fly to rocks, clamp on, shoot and follow you |
| T2 | **The cover dance.** Grounded and alert, a trooper **probes** its surface: positions every 24px along it, both ways, each tested for a line of sight to the target. It walks to the nearest hidden spot (cover), waits, walks to the nearest spot with a line of sight (peek), fires a burst, and goes back. The two troopers of a pair **take turns**: only one peeks at a time. **Being hit while peeking** sends it straight back to cover. **Relocating** (added to T1's out-of-range rule): if no peek spot is reachable, or it has peeked enough times from this surface, it picks a new perch and leaves | Yes, the grounded behaviour | They duck behind rocks and pop out to shoot |

**As built, T1.**
- **The landing profile** is `vLand + √(2 · brake · (look − coastGap))`, capped at 380, where `look` is the gap less 0.8s of closing (`lookAhead`): the look-ahead is what pays for turning round to brake. The numbers are coast gap 150, vLand 120 and brake 200. Measured over 96 starts (300–1400px out, four facings, rocks of r 60–450 drifting and spinning, still or crossing at 300px/s): worst closing at the coast gap 132px/s, every one landed unhurt, median 3.9s. The test pins 24 of them.
- **A running target is chased, not perched ahead of** (new, `chaseV`). When the target moves faster than 150px/s, a flying trooper drops its perch and flies the float rule, which runs at full speed past twice the keep range. Without it, a pair following a soldier at 250px/s kept landing on rocks the soldier had already passed. Measured: at 250px/s it holds 300–630px behind for a minute and fires on the way.
- **Firing while flying** is allowed in every mode. The cover dance (T2) is what restricts a grounded trooper to its peeks.
- **Troopers die fast to companions.** At 23–29 HP against a carbine's 17.5, two companions kill a pair in about 2s once they have a line. That is K2's numbers working as written, so it is not adjusted here.

**As built, T2.**
- **"Out of range" is measured from the perch, not the trooper.** The plan measured the trooper's own distance to the target (T1's rule). Behind an r 250 rock that distance passes the relocation limit, so a trooper that had just walked into cover left, landed on the same rock, and looped, never firing. Now it is the perch's near side to the target, the measure perch choice uses.
- **No cover anywhere on this surface** (the plan did not say): fly to another perch if one fits, else hold the spot and shoot.
- **The peek quota moves it only if another perch fits.** Otherwise the count resets and it keeps dancing. Leaving anyway put a trooper in open space with nowhere to go.
- **Cover is judged against soldiers within 1100px** (planned 900). 1100 is past the squad's longest reach (the grenade launcher, 1050), so a trooper further than that really is safe.
- **On a derelict the cover probe reaches 1200px** (planned 600 everywhere). The far face of a 1300px hull is usually further than 600px of walk, round the end.
- **Measured.** A pair on a rock 450px from a still soldier, over 20s: each trooper out of sight 54–69% of the time, about 33–42 rounds a minute between them, and the two never peek at once. On eight derelicts, a trooper starting outside never went in (0 of 14,400 steps) and was out of sight 40–74% of the time, except where the hull had nowhere hidden within 1200px of walk. Cost: 0.74ms a step with four alert troopers dancing, against 0.53 without.

## Reuses

| What | Where | Used for |
|---|---|---|
| The soldier body and its fields | `makeSoldier` in `src/space/sim.js` | The trooper's body: `angle`, `dir`, `boots`, `ground`, `gphi`, `gv`, `walkIn`, `stats`, `weapon`, `ammo`, `reloading` |
| Rotate-and-thrust piloting | `pilot` in `src/space/sim.js`, which the companions use | All trooper flight. A trooper can only thrust along its facing, like a player |
| Obstacle steering | `avoid` in `src/space/sim.js` | Flight between rocks. It gains an optional surface to ignore, so a landing approach is not steered off the rock it is landing on |
| Magnetic boots | `toggleBoots`, `bootsOff`, `surfaceInWedge`, `bootContact`, `bootWall`, `walkWalls`, `settleBoots` in `src/space/sim.js` | Clamp on, land, walk, leave. These are the player's own rules, including the 40px activation range and the safe-landing speed |
| Weapons, firing, reload | `WEAPONS`, `LOADOUT`, `fire`, `startReload`, `aimAccuracy` in `src/space/sim.js` | The gun, its spread from the trooper's Aim stat, and its magazine |
| Telegraph | the `tele` field `shoot` sets in `src/space/sim.js` | The wind-up tell the views already draw. The trooper's trigger is its own: `shoot` reads the type's weapon and resets `fireCd`, while a trooper's gun is per body and keeps its fire rate. Its lead uses `aimAt`'s one-refinement rule with its own round speed |
| Sensing | `nearestSoldier`, `hasLos`, `senseEvery` in `src/space/sim.js` | Target choice and line of sight, on the enemy cadence |
| Placement and waves | `ENEMY_MIX`, `spawnGroup`, `spawnWave` in `src/space/sim.js` | A pair is a pack of 2 |
| Crash damage | `crash` in `src/space/sim.js` | Troopers take the companions' share of it |
| The soldier figure | `makeSoldier`, `poseSoldier` in `src/space/view3d.js`; `drawSoldier` in `src/space/view.js` | The trooper's look: the same figure in another palette |
| Tells, bars, arrows | `drawTells`, `drawBars`, `drawArrows` in `src/space/view.js` | A trooper is `kind: "enemy"` with an `ENEMY_TYPES` entry, so these draw it. The bar's lift is the one change |

## Where the code goes

| Path | What changes |
|---|---|
| `src/space/sim.js` | T0: the body generalisation and the type. T1–T2: the trooper brain, as its own section beside `updateEnemies`, called from it for `type === "trooper"` |
| `src/space/view3d.js` | T1: a trooper is drawn with the soldier figure, its palette passed in |
| `src/space/view.js` | T1: the flat fallback draws a trooper with `drawSoldier`; its health bar sits at the figure's height |
| `test/space.test.mjs` | Every slice, in a new "troopers" block |
| `tech/space-prototype.md` | T1: a row in the enemy placeholders that points here |

## The seam

**The body is shared and the brain is not.** A trooper is a soldier body in the enemy list. Everything that moves a soldier body (piloting, boots, walking, crash, reload) runs on it unchanged. Only the decision of what to want (velocity, facing, walk direction, boots on or off, trigger) is trooper code. The trooper never sets a position or velocity directly. Its only actuators are the ones a player has: `pilot` for a velocity (only with the boots off), a **turn without thrust** at the turn rate (A/D), the shared walk helper, `toggleBoots`, `bootsOff`, `startReload` and `fire`. That is what "same capabilities" means in code, and it keeps the trooper inside the rules the player's tests already pin.

## Must not regress

| What | Guard |
|---|---|
| The player's boots: activation, landing, walking rocks and derelicts, jump, hold, crash | The M0–M4 blocks of `test/space.test.mjs`, unchanged |
| Every other enemy's behaviour | The S4, crew and warden blocks |
| Determinism: same seed and inputs give the same world | The existing twice-run check, with troopers in the world |
| Isolation: `src/space/` imports only itself | The isolation test |
| Companions do not wear boots | The swap test. The switch-off is `step()`'s loop over `world.soldiers`, which T0 leaves alone, so troopers are outside it |

## Approximations

| Design asks | Build does |
|---|---|
| "Same capabilities as the friendly soldiers" | Same body, boots, jetpack, guns, Aim and HP formula. **Damage is scaled** (K3) because a full-damage grenade kills a soldier in one hit. Magazines are unlimited (`magsLeft: Infinity`). It never jumps: it leaves a surface by switching the boots off and flying, because a 700px/s jump is over the crash threshold. Flight is capped at 380px/s (K5) so it does not crash: the player has no cap |
| Cover "from your shots" | Cover is from **positions**: no line from any living squad soldier within 900px to the trooper's centre, so companions count as well as you. It does not read incoming rounds. A trooper hit while it peeks goes back to cover. It shoots at its target, the nearest soldier, as every enemy does, and that may be a companion rather than you |
| Pathing round obstacles | Steering only (`avoid`), as every enemy has. A trooper never perches inside a derelict on purpose, and the probe stops at the hull, so it does not walk in through a breach and get stuck. One that falls inside some other way may jam against walls |
| Knowing where you are | Like every other enemy, it always knows its target's position. It only shoots with a line of sight |
| Pairs | A pair is two troopers sharing a wing record: they perch near each other and take turns to peek. There is no formation flying beyond that |

## Placeholders — invented for a playable build, for Bo to replace

| # | Question | Stand-in |
|---|---|---|
| K1 | How many, and where? | Mix weight 15 against 35/25/25/15 (about 2 pairs at the start of a field). Waves roll them too. Not in derelict crews |
| K2 | Stats | Rolled per trooper: Aim 3–6, Health 4–7, so 23–29 HP (the recruits: Aim 5–8, 23–29 HP) |
| K3 | Damage | Each effect's amount × 0.5 (`trooperDamage`). A grenade splash does 20, not 40 |
| K4 | Trigger | 0.35s telegraph, then a burst: automatic weapons 3–5 rounds, the grenade launcher 1. Cover waits 0.8–2.0s between peeks |
| K5 | Flight | Capped at 380px/s, under the 500px/s crash threshold. Perches are rocks of r ≥ 45 or a derelict's outer hull |
| K6 | Range | Wants to peek from 220–650px, or 85% of the weapon's reach if that is less. It relocates past 110% of that, and after 2–4 peeks from one surface |

## The AI

One brain per trooper, deciding on the enemy sensing cadence (0.2s) and acting every step.

**Modes.**

| Mode | What it is doing | Leaves when |
|---|---|---|
| idle | Not alert. Perched on a rock near where it spawned, its partner nearby, strolling now and then | Sees a soldier within the alert range with a line of sight, is hit, or its partner alerts. A pair alerts together |
| approach | Flying to a chosen perch | Lands (→ grounded), or the perch stops fitting (the target moved), or 8s pass without landing (→ float) |
| grounded | Boots on a surface. Alert: the cover dance (T2), or stand and shoot (T1) | Relocation (→ approach), or knocked off (→ float, boots on, falls back) |
| float | Alert with no perch that fits: holds 280–520px from the target like a gunner, and shoots | A perch fits (→ approach) — re-checked every second |

**Perch choice.** Candidates are rocks of r ≥ 45 and derelicts, within 1400px of the trooper. **Idle** (no target), the pick is simply the nearest candidate within 900px, and the partner's within 600px of it. Alert, it is scored:
- A candidate's landing point is its surface point nearest the trooper: on a rock, along the line to its centre; on a derelict, the nearest point of its hull plates from outside.
- It must sit where a peek is possible: the rock's near side, or the hull, is within the range band (K6) of the target.
- Score is the flight distance, plus 1.5 × the distance from the middle of the band, plus a penalty for being more than 600px from the partner's perch, plus a penalty for the surface it just left. Lowest wins.
- A rock of r ≥ 150 can hold both of a pair. A smaller one is the partner's alone.

**The landing approach.** The hard part, because the body can only push along its facing, and its feet are a quarter turn from its facing.

| Phase | Gap (surface to body edge) | What it does |
|---|---|---|
| Close | > coast gap | `pilot` toward the landing point, at the surface's velocity plus a closing speed that falls with the gap, at most 380. **The profile must budget for turning round to brake**: `pilot` only thrusts within 0.35 rad of the wanted direction, and reversing takes about 0.7s, so a plain √(2·a·d) profile arrives far too fast (measured in review: 375px/s at the coast gap). The builder tunes the profile by running the real `pilot`. The bar is a test: from 400–1400px out, it reaches the coast gap closing at ≤ 160px/s. `avoid` ignores this surface |
| Turn and coast | ≤ coast gap (about 150px) | No thrust. Turns its feet to the surface at the turn rate. A 90° turn takes 0.4s; the worst case, about 180°, takes 0.8s. If it stalls (closing < 30px/s) it goes back to Close |
| Clamp | ≤ 40px, surface in the feet wedge | `toggleBoots`. The boots' own gravity pulls it in, and it lands well under the 750px/s safe landing (about 430px/s from 160px/s) |
| Missed | Hit side-first, or drifted past | It bounces as any body does (no damage under 500px/s) and the approach starts again. 8s without landing → float, and that perch is skipped for a while |

**Knocked off.** Boots "air" means the boots' gravity has it: it only turns its feet to the nearest surface (no jetpack with the boots on) and falls back.

**Leaving.** `bootsOff`, then `pilot` toward the next perch. It starts with its facing along the surface, so it turns away first, as a player does. The surface's velocity carries over.

**The cover dance (T2).** It needs a line-of-sight answer for places the trooper is not standing, so it **probes** its surface.
- **On a rock**, a probe point is the standing circle at an angle step of 24px of arc, both ways, up to 600px or half way round.
- **On a derelict**, a copy of the body is walked along by `walkWalls`, 24px at a time. That is the same function that moves it, so a probe point is exactly where walking would put it. Probing stops at a point inside the hull polygon when the trooper started outside it.
- Each point is tested with `hasLos`: from every living soldier within 900px (cover), and from the target (peek).
- **Cover** is the nearest point with no line, walked two points past, so a small move by the target does not expose it.
- **Peek** is the nearest point with a line, within range. While walking to a peek it checks its own line every step and stops as soon as it has one.
- It re-probes every sense tick while it walks, because the rock turns and the target moves.

| Step | Detail |
|---|---|
| 1. Cover | Walk to cover. Reload there if under half a magazine. Wait 0.8–2.0s (K4), and for the reload |
| 2. Wait its turn | Peek only when the partner is not peeking. The token frees itself after 3s, whatever happens |
| 3. Peek | Walk to the peek point. With a line: telegraph, then the burst, then 0.2s. A hit before the burst starts sends it back to cover |
| 4. Back | Peek count + 1, back to step 1. After 2–4 peeks (K6) it relocates |
| No peek point | No point with a line within reach for 1.5s → relocate |

**Firing** is the same in every mode.
- A burst needs a line of sight and the target within reach. It is telegraphed (the white ring the views already draw for `tele`), aimed with lead like the Warden, and fired by `fire` with the trooper's own Aim accuracy.
- Every round of a burst waits for the gun's own `fireCd`, so it fires at the weapon's fire rate, automatic or not. The magazine empties as the player's does, and an empty gun reloads.
- The idle gun rests along facing, and an alert one points at the target. The 3D figure reads that from `foe`.
