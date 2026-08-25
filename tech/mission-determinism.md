---
type: tech
category: gameplay-systems
status: built
resolution: sharp
needs: []
related: [multiplayer, multiplayer-state, level-generation]
tags: [mission, rng, testing]
---

# Mission determinism

Given the same seed and the same input trace **at a fixed step**, a mission
replays exactly. Level generation has been reproducible since it shipped; the
mission that runs on top of it is not, and five draw sites are the reason. This
is M1 in `tech/multiplayer.md`'s Phase 3 table, pulled out because it depends on
nothing and is worth having whether or not multiplayer ships — a reproducible
mission makes a combat bug reproducible.

The fixed-step qualifier is load-bearing and is not a hedge: see approximation 1.

## Slices

| # | Slice | Changes runtime behaviour |
|---|---|---|
| **D1** | **The seam, in two halves.** Tick-time draws take a stream from the scene, the way every module already takes `scene.sound`. Construction-time draws take one through a defaulted parameter on `instantiate`, which has no scene and never will. Sites: weapon spread and the duck roll in `src/mission/ai.js`; `root.rng` and the per-entity phase seeds in `src/mission/enemyspec/runtime.js`; and the companion agent `src/mission/ai.js` builds lazily on a squadmate's first tick. Every fallback stays `Math.random`, read at the moment of the draw | No — nothing installs a stream yet, so every caller takes the fallback |
| **D2** | **The mission seeds it, and a golden freezes the result.** The mission scene installs a stream and passes one down the instantiate path. A golden file captures a fixed-step trace and reddens when a new unseeded draw appears | Yes — the numbers come from a different stream. Nothing observable changes in kind |
| **D3** | **One PRNG.** `test/locomotion-characterization.test.mjs` carries a private copy of mulberry32 identical to the one in `src/game/gen/rng.js`. The copy goes | No |

**D3 is the PRNG swap and nothing else.** Its `determinize()` helper looks like
duplicated work and is not: it *zeroes* `hoverPhase` and `orbitAngle`, where D1
and D2 make production *draw* them. Replacing it re-bases `locomotion.golden.json`
— on `ctl:orbit` at that suite's own seed it moves frame 1 from `[1053.892, 360]`
to `[1013.792, 271.374]`, roughly 40px and 89px against a 2e-3 tolerance, and six
hover fixtures move with it. The golden is the strictest guard in the repo for
this work and must not be re-baselined by the work it guards. The swap is safe
on its own: the two generators differ only in that `makeRng` maps a seed of 0 to
1, and that suite's seeds are `0x1234 + i * 7919`.

D3 depends on neither D1 nor D2 and can land first, last, or never.

## Reuses

| What | Where | Used for |
|---|---|---|
| `makeRng(seed)` | `src/game/gen/rng.js` | The generator. mulberry32, already the stream every generated level runs on. No new PRNG |
| `range` / `int` / `pick` | `src/game/gen/rng.js` | Draw helpers that already take an injected stream |
| **`root.rng`** | `src/mission/enemyspec/runtime.js` | The injection point exists — assigned `Math.random` at instantiate, read in six places: the lead/landing prediction time, `burst` jitter, `aimed` jitter, `randomChance`, `wait: { range }`, and the utility-score noise in `src/mission/enemyspec/brain.js`. (`ring` and `fan` compute their angles with no rng at all.) D1 changes where it comes from, not what reads it |
| **The three suites that already patch the global** | `test/crouch.test.mjs`, `test/companion-aim.test.mjs`, `test/reposition.test.mjs` | Each does `Math.random = makeRng(seed)` around a block, because no injection point exists. They are the existing statement of what this seam is for — and the constraint that the fallback must be read at the draw, not captured at module load, or all three stop seeding anything |
| `determinize()` and its header | `test/locomotion-characterization.test.mjs` | The existing inventory of what makes a spec entity non-deterministic — `root.rng`, `hoverPhase`, `orbitAngle` — and the note that it does not cover entities spawned during a tick |
| The twice-run self-check | `test/locomotion-characterization.test.mjs` | Trace twice and compare before trusting a baseline. It is what catches a missed source |
| The golden-file flow, including `resetConfig()` | `test/levelgen-golden.test.mjs` | Write a baseline when absent, compare and name the first differing path when present — and pin the knobs first, because `test/run.mjs` never resets `config` between suites |
| `scene.sound` | `src/mission/ai.js`, `src/mission/combat.js` | The tick-time half of the seam: an optional capability the host installs, `&&`-guarded at every read in the modules being converted, absent in tests and in `src/game/enemyspec/dryrun.js` without anything breaking |
| The `team` parameter on `instantiate` | `src/mission/enemyspec/runtime.js` | The construction-time half already has its shape — a defaulted trailing argument that ~60 existing call sites ignore |
| `loadMission` | `src/mission/entities.js` | The one place a mission scene is built from a level |
| The mission seed | `src/game/gen/levelgen.js`, `src/game/state.js` | Carried on the mission object and through the lead, and recoverable from the level id. **Not on the level** |
| `installDom` / `makeEl` / `ctx2d` | `test/harness.mjs` | Canvas-bound code already mounts headlessly |
| The headless mission driver | `test/mission-enemyspec.test.mjs` | `loadMission` plus the update functions called directly, if the golden takes the narrower path |
| Injected-rng precedents | `src/game/soldiers.js`, `src/editor/tools/behavior-lab.js` | `dealRecruits(shares, rng)` and `createLabModel(seed, rng)` |

## Where the code goes

| Path | Change |
|---|---|
| `src/mission/enemyspec/runtime.js` | `instantiate` grows a defaulted stream parameter; `root.rng` and the per-entity `hoverPhase` / `orbitAngle` seeds come from it. The internal spawn path passes the root's stream down, so an entity born mid-tick draws from the same one |
| `src/mission/ai.js` | Weapon spread and the duck roll draw from the scene's stream when it has one; the lazily-built companion agent is constructed with it |
| `src/mission/entities.js` | `loadMission` installs the stream and threads it into the roots it instantiates |
| `src/mission/mission.js` | Supplies the seed it was started with |
| `test/mission-golden.test.mjs` (new) | Fixed inputs, fixed step, `resetConfig()` first, snapshot gameplay state on a cadence, twice-run self-check before trusting the baseline |
| `test/mission.golden.json` (new) | The frozen baseline |
| `test/locomotion-characterization.test.mjs` | Drops its private PRNG. Keeps `determinize` |

Conventions from `CLAUDE.md` that bind: fallback discipline — a host with no
stream keeps working, it is simply not reproducible; no dependencies added; the
static, no-build-step property is untouched.

**As built (D2), added to the table above.** `loadMission` stamps `scene.seed`
next to `scene.rng` (null when unseeded). Nothing reads it — it is there so a
scene in a debugger, a crash report or a future checksum can say *which* mission
this is without anyone having to reach back through the level id. `src/mission/ai.js`
resolves the stream through one local helper, `sceneRng(scene)`, rather than
inlining `scene.rng || Math.random` at each of its sites; that is what keeps the
"read at the draw" rule in one place instead of two.

## The seam

**Owns:** the scene's stream, the stream parameter on the instantiate path, and
the five gameplay draw sites that read them.

**The seam is two-part because one of them cannot be a scene.** `instantiate`
and the internal `makeInstance` take no scene and are called before any host
exists — `loadMission` builds its roots while assembling the object it returns,
and `Mission.start` installs `scene.sound` only after that returns. The same
constructor also runs *during* ticks, from the spawn path, so an entity
projectile or a summon draws its phase seeds mid-mission. A scene-only seam
silently misses all of it.

**Must not touch:**

| Boundary | Why |
|---|---|
| Cosmetic randomness | Sixteen draws across eleven lines in `src/mission/mission.js` (ambient motes, spark and burst particles, screen shake, flame drawing), the trail jitter in `src/mission/render.js`, two in `src/mission/enemyspec/render.js`, and the loot bob phase in `src/mission/entities.js`. None feeds anything a rule reads — the bob offsets only the drawn `y`, and the shake offset lives inside the render transform, which the mouse-to-world conversion does not use |
| `src/audio/engine.js` | Pitch jitter is cosmetic and per-listener |
| `src/game/state.js` | Campaign draws — lead rolls, lifespans, arrivals, visibility. A different clock, and `tech/multiplayer-state.md`'s territory |
| `src/game/gen/levelgen.js` | Already seeded |
| Editor tools | The Firing Room, Enemy Designer and Behavior Lab install no stream and take the fallback. Their previews stay non-deterministic on purpose |
| `src/game/enemyspec/dryrun.js` | Builds its own arena, installs no stream, keeps drawing from `Math.random`, and its acceptance verdicts do not change |
| `locomotion.golden.json` | Its values must not move in any slice |

**Every fallback is read at the draw, never captured at module load.** Three
suites seed themselves by assigning `Math.random`, and a captured reference would
turn all three non-deterministic without failing anything.

## Must not regress

**Everything.** The whole suite is the bar: `node test/run.mjs` green, every
suite, before any slice commits. The table is which suite watches which seam.

| Suite | What it guards |
|---|---|
| `test/locomotion-characterization.test.mjs` | A frozen per-frame trace of position, velocity, grounding and brain state for the whole roster plus every motion template. **Its values must not be re-baselined.** Note what it does *not* cover: it overwrites `root.rng` after `instantiate`, so re-sourcing that assignment cannot redden it, and it drives `updateSpecEnemy` against an inert soldier literal, so neither `src/mission/ai.js` site executes in it at all |
| `test/companion-aim.test.mjs` | **The duck roll's actual coverage**, and one of the three suites that seeds by patching the global |
| `test/crouch.test.mjs`, `test/reposition.test.mjs` | The other two global-patching suites. All three redden if the fallback stops reading `Math.random` live |
| `test/levelgen-golden.test.mjs` | Level generation stays byte-identical. Nothing here should reach it; if it does, the seam leaked |
| `test/mission-enemyspec.test.mjs` | A generated level loads, roots act, a shot kills one, loot and kill credit are bookkept — and it calls `loadMission` with no seed, so it proves the fallback |
| `test/enemyspec-runtime.test.mjs`, `test/enemyspec-brain.test.mjs` | Emitters fire, patterns spread, utility picks and commits, cooldowns gate — the consumers of `root.rng` |
| `test/enemyspec-generate.test.mjs` | `dryRunSpec` accepts and rejects the same specs with no stream installed |
| `test/weapons.test.mjs`, `test/combat.test.mjs` | Spread, pellets, projectile resolution |
| `test/content.test.mjs`, `test/wiring.test.mjs` | Two more direct `loadMission` callers that pass no seed |
| `test/tools.test.mjs` | Every editor tool still mounts and disposes with no stream |
| `test/docs.test.mjs` | This document's citations |

## Approximations

| # | Where it is not exact | What catches the failure |
|---|---|---|
| 1 | **The game page is not reproducible even after this lands, and cannot be made so here.** `Mission` accumulates real elapsed time and runs a variable number of fixed steps per rendered frame, polling input once per *rendered* frame. Same seed and the same physical inputs at a different frame rate is a different mission | Nothing. What D2 delivers is a mission reproducible **from a recorded input trace at a fixed step**, which is what a golden needs and what a bug report needs. Decoupling input sampling from frame rate is its own change and is not in this spec |
| 2 | **Cosmetic draws stay unseeded** | The golden samples gameplay state only. A cosmetic draw cannot redden it — and cannot silently become load-bearing, because anything a rule reads would move the trace |
| 3 | **The golden's scope is the builder's call.** Driving `Mission` through `test/harness.mjs` covers the real per-frame order; driving the update functions the way `test/mission-enemyspec.test.mjs` does is simpler and skips input, camera and HUD | The twice-run self-check proves the trace is stable before the baseline is trusted. Whichever is chosen, `resetConfig()` comes first — a mission trace reads far more knobs than a level does, and ten suites assign to `config` |
| 4 | **A host that installs no stream is silently non-deterministic.** No error, by design — that is what keeps the editor tools and `dryRunSpec` working | Only the golden's own host is proven. The game page is unproven by the bar; see the report |
| 5 | **Seeding at `loadMission` is a single-client shape.** Each client calls it and would derive its own stream from the same seed, but consume it in an order that depends on how many soldiers, companions and spawns that client has | Nothing here. M1 exists to serve M3, and this is the part M2 or M3 will have to relocate — recorded so that relocation is expected rather than discovered |
| 6 | **This does not make two machines agree.** Seeding fixes one client replaying itself. Two clients agreeing also needs identical floating-point results across browsers and CPUs, plus identical input ordering | Out of scope, and M3's. A rolling checksum is how that divergence gets caught and it is specified nowhere yet. Nothing here should be read as lockstep being closer than it is |

**As built (D2), settling approximation 3.** The golden drives the **real
`Mission`**, not the update functions: `test/harness.mjs` makes
`requestAnimationFrame` a no-op, so `start()` builds the scene, arms a loop that
never fires, and hands the test every frame after it — `m.running = false`, swap
`m.input` for a scripted stand-in, then call `m.update(1/60)` in a loop. That
buys the real per-frame ordering (control → soldiers → enemies → projectiles →
statuses → loot → outcome), which is the only place the five draw sites interact,
for about fifteen lines more than the narrow path would have cost. Three details
that are not obvious and are load-bearing:

| | As built | Why |
|---|---|---|
| The input trace is a **pure function of the frame index** | `scriptAt(f)` returns held actions, pressed edges and a stick aim | This is the "fixed input at a fixed step" the whole spec is qualified on. Nothing reads a clock, and the fake `aimSource` answers a stick whatever `config.aimMode` says, so the trace does not depend on the camera, the zoom or the aim mode |
| The squad carries **weapon literals**, not `ARSENAL` entries | Two weapons defined in the suite — one shot per pull, one that draws per pellet | `applyWeaponOverrides()` mutates the shipped weapon objects in place from localStorage. A golden built on them would depend on which suite ran before it — module state outlives the runner's per-suite `localStorage` reset |
| Numbers compare with a **tolerance** (2e-3), like `locomotion.golden.json`, not exact-after-rounding like `levelgen.golden.json` | `firstDiff` walks the samples and names the first field that moved | `Math.sin`/`cos`/`atan2` are implementation-defined; an exact compare would be a claim about the JS engine. A real change moves a mission trace by orders of magnitude more than the tolerance |

## Background

### The five draw sites

| Site | What it decides |
|---|---|
| `src/mission/ai.js` weapon spread | Where every shot from every soldier and every enemy actually goes |
| `src/mission/ai.js` duck roll | Whether a squadmate reacts to a duckable round |
| `src/mission/ai.js` companion agent | The construction of the spec instance each squadmate's brain runs on, built lazily on its first tick |
| `src/mission/enemyspec/runtime.js` `root.rng` | Six downstream draws, listed in Reuses |
| `src/mission/enemyspec/runtime.js` entity seeds | `hoverPhase` and `orbitAngle`, drawn at construction — at load for the roots, and mid-tick for every spawned projectile, summon and transform |

The companion agent's draws are consumed and unread today, because the default
companion spec has no utility actions and only literal waits. `tech/behavior-lab.md`
is the plan to grow exactly that brain, so the site is latent rather than
harmless.

### Where the M1 row was wrong

`tech/multiplayer.md` named two files and said "No behaviour change". Both were
off: `src/mission/entities.js` and `src/mission/mission.js` are also touched, and
D2 changes the stream the game draws from. **Corrected when this spec landed** —
that row now points here and claims neither.
