---
type: tech
category: artificial-intelligence
status: unbuilt
resolution: sharp
needs: [agent-navigation, locomotion]
related: [nav-audit, behavior-lab, ranged-repositioning]
---

# Soldier behavior

How a squadmate escorts you: one continuous route to a station that tracks you, instead of a scripted walk to a snapshot. Implements the Escorting rows of [Soldier behavior](../design/soldier-behavior.md#what-a-squadmate-does-on-its-own). Nothing else in that design doc changes, with one exception it contradicts: its Undecided row "The escort position is fixed, and always to your left" is what **E2** deletes. **As built:** E1 does not. The offset it replaces was measured along the follower→leader line, so it sat on whichever side the squadmate happened to be; a fixed side is what E1 introduces, and that row describes E1 exactly.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| E0 | **Record what escorting does today.** A real `Soldier` on `DEFAULT_COMPANION_SPEC` behind a scripted leader, over flat ground, a step, and the one-ledge scene from `tech/nav-audit.md` §2a. Three numbers per scene: the settled gap to the leader, how many times the squadmate falls from full speed to a standstill while the leader keeps moving, and how many times it crosses between two surfaces while the leader stands still. Frozen as they are, not as they should be | None. Test only, and it lands green by recording the defect |
| E1 | **A `follow` controller.** One motion controller, re-asked every frame, routing at a station that is a function of the LEADER alone — never of the follower's own position, which is what makes today's goal oscillate. On one fixed side, at an authored distance. Where the leader is grounded, the station is resolved onto the surface the leader is standing on, so a leader near a ledge does not send its escort to the floor below. `companionspecs.js`'s escort state sets the controller and drops its track. All three of E0's numbers become ceilings | Yes. Squadmates close in one run, settle, and stop crossing surfaces under a standing leader |
| E2 | **A station per squadmate.** Each rolls its own side and its own distance within the controller's bounds when it enters the controller, off its own seeded stream, and holds them until it leaves | Yes. A squad spreads around you instead of stacking |

**As built (E0).** The nine numbers live in `test/navigation.test.mjs`, pinned exactly rather than bounded, so any movement in them is visible. Two are not the quantity the slice assumed:

| | |
|---|---|
| The §2a scene has no settled gap | It never rests. Its gap is one sample of a ~120-frame cycle, recorded as that — the finding is that a 90px standoff can be sampled at 26px |
| The step scene books one surface crossing | That crossing is the climb the squadmate makes to arrive, not oscillation. One is the ceiling, not zero |

**As built (E1).** Four things the slice had to decide differently:

| | |
|---|---|
| The thing followed is a `leader` param, not `target` | `setMotion` reserves `target` for the entity it acts on and strips it from the params (`runtime.js`), so a controller with a `target` param cannot be set from a brain state at all |
| The controller is authored twice — on the spec root AND in the escort state's `enter` | A brain state's `enter` steps run from `switchState` only (`src/mission/enemyspec/brain.js`), so the START state's never fire. Nothing had noticed, because escort's old `enter` set the motion the root already carried. The `enter` is what restores escort on the way back from combat; the root is what the first escort runs on |
| The station's surface is the standable surface directly below the leader, airborne or not | This replaces the approximation below it. "No surface while the leader is in the air" would hand the station back to `nearestNode`'s floating-point scoring for the length of every jump the leader makes — reintroducing, once per jump, the half of §2a that E1 exists to remove |
| One of the nine numbers did not go to zero | The step scene keeps one standstill. It is the frame the climb's air control reverses through zero, sampled as the body lands; a horizontal turnaround in the air is momentarily at rest. It is a ceiling, not a target |

Measured on E0's three scenes: standstills while the leader walked 6 → 0 (flat) and 6 → 1 (step); surface crossings under a motionless leader 19 → 0 on the audit's §2a geometry. All three scenes now settle within 6px of the authored 90px station, where E0's gaps were not stations at all.

E1 owns both halves of the audit's §2a oscillation — the follower-dependent offset and the surface flip — because E0 makes the crossing count a ceiling at E1. E2 changes where squadmates stand, not whether they oscillate.

## Reuses

| What | Where | For |
|---|---|---|
| `moveTo` controller branch | `src/mission/enemyspec/runtime.js` | The shape `follow` copies: resolve a point, route to it, fall back to straight-line steering when the router has nothing |
| `routeRequest` | `src/mission/navigation.js` | Continuous routing, a repath whenever the destination moves more than `config.navArriveRadius`, and a halt inside that radius of the final point |
| `resolveTargetPoint`, `MOTION_TARGETS` | `src/mission/enemyspec/runtime.js`, `src/game/enemyspec/schema.js` | `"anchor"` already resolves a companion's leader. Its `offset` is measured along the follower→target line and is therefore NOT what a station uses |
| `root.anchor` | `src/mission/ai.js` (`updateCompanionSpec`) | The leader's live position, written every frame |
| `nodeUnder`, `graphFor`, `navGraph` | `src/game/nav.js`, `src/mission/navigation.js` | Which surface the leader is standing on, and its span — E1 clamps the station to it |
| `root.rng` | `src/mission/enemyspec/runtime.js` (`instantiate`) | E2's roll, so a seeded mission still replays |
| `MOTIONS`, `MOTION_PARAM`, `motionFields`, `vocabularyDoc` | `src/game/enemyspec/schema.js` | One table entry grows validation, the Enemy Designer's controls and the LLM vocabulary |
| Entity-held controller state (`patrolDir`, `repo`, `dash`) | `src/mission/enemyspec/runtime.js` | The precedent for where a station lives, and for owning its own lifetime |
| `reflexHop` / `navGraph` | `src/mission/enemyspec/runtime.js`, `src/mission/navigation.js` | The off-graph fallback rule, unchanged — a routed body never hops blind |

## Where the code goes

| Path | Change |
|---|---|
| `src/game/enemyspec/schema.js` | One `MOTIONS` entry, plus `MOTION_PARAM` bounds for each of its params. `FLYING_MOTIONS` does not gain it: this is a grounded controller |
| `src/mission/enemyspec/runtime.js` | The controller branch in `controllerRequest`, and the station on the entity beside `dash`/`moveOrder`/`patrolDir` |
| `src/mission/navigation.js` | A station resolver: leader point plus offset, clamped to the leader's own node span when the leader is on one. This module already owns every graph lookup; `src/game/nav.js` stays untouched |
| `src/game/companionspecs.js` | The escort state sets the controller on enter and carries no track |
| `test/navigation.test.mjs` | E0's scenes and numbers. It already owns the escort shape (`orderer`, the N4 cases) and terrain scaffolding; the companion body and leader come from the pattern in `test/companion-aim.test.mjs` |

**The numbers are controller params, not config knobs.** `companionspecs.js` authors them, exactly as it authors today's `-90` offset and `320` speed, and the Enemy Designer edits them per enemy through `motionFields`. A global escort range in the config SCHEMA would also govern every authored and generated enemy that uses the controller, which is not what a knob called "escort range" would mean to whoever turns it.

**`MOTION_PARAM` is keyed by param name across all controllers.** `range`, `min`, `max` and `speed` are taken and carry other controllers' labels and bounds, so this controller's params need names of their own.

**`setMotion` clears `moveOrder` and `dash` only** (`runtime.js`), not per-controller state: `patrolDir` and `repo` both persist across a controller change, and `repositionRequest` carries its own staleness check because of it. The station's lifetime is therefore this controller's own business — it rolls on entry and must decide what entry means.

## The seam

| This owns | This must not touch |
|---|---|
| What point a squadmate walks to while escorting, and when it stops | How it gets there. `routeRequest`'s internals, `nav.js`, the graph, takeoffs and the ban ledger are `tech/agent-navigation.md` and `tech/nav-clearance.md` |
| The station: its roll, its lifetime, its bounds, and its clamp onto the leader's surface | The duck reflex (`tech/soldier-ducking.md`), which owns the stance and is a layer below |
| The escort state in `companionspecs.js` | The combat state, `keepDistance`, and repositioning (`tech/ranged-repositioning.md`) |
| One new entry in the motion vocabulary | Every other controller, and the `moveTo` **action**, which scripted enemies use and which keeps its timeout |
| — | `updateCompanion`, the legacy non-spec companion (`config.companionBrain: "legacy"`) |
| — | `SOLDIER.apply`'s sign-only drive (`src/mission/locomotion.js`). Making a soldier honour a drive request's magnitude is `tech/nav-audit.md` finding 1, and it belongs with the navigation work |

**Nothing new crosses the wire.** A room simulates the squad and sends positions; the station is an input to that simulation, not a drawn field (`src/net/mission-wire.js`). `WIRE_ACTIONS` does not move.

**The rest of `tech/nav-audit.md` is not here.** The traversal lifecycle, the progress watchdog, world bounds, side contacts and validated drops are separate specs against the navigation docs. E1 is expected to leave those symptoms visible.

## Must not regress

| Suite | What it pins |
|---|---|
| `test/navigation.test.mjs` | Routing, the ban ledger across a completed order, reachable surface per seed and body, the failed-leg rate ceiling. **Its helpers pin `rng` to `() => 0.5`**, so every agent rolls the same station: E2's spread scene has to hand its two squadmates distinct streams or it proves nothing |
| `test/companion-aim.test.mjs` | A companion engages, aims in 2D, ducks, and returns to escort on a cleared field. **Its cleared-field case asserts the gap to the leader is under 200px**, which caps the escort distance this spec may author |
| `test/reposition.test.mjs` | A `keepDistance` gunner still chooses and holds a firing spot |
| `test/enemyspec.test.mjs` | Every `MOTIONS` entry offers its type and all its params. It does NOT check bounds for motion params — `motionFields` falls back to a generic 0–600 range — so a controller added without `MOTION_PARAM` entries passes green and ships bad Designer sliders |
| `test/enemyspec-runtime.test.mjs`, `test/enemyspec-brain.test.mjs`, `test/mission-enemyspec.test.mjs` | Controllers, brains and mission enemies are unchanged by a vocabulary addition |
| `test/locomotion-characterization.test.mjs` | The locomotors themselves do not move |
| `test/mission-net.test.mjs` | Two seats through the real server; the action order that IS the wire format |
| `test/docs.test.mjs` | This spec's citations and its seven parts |
| `test/mission-golden.test.mjs` | **Reseeded, deliberately, in E1 and E2.** It freezes gameplay state, squad positions included. What it guards is determinism — an unseeded draw cannot survive its twice-run self-check — and that claim must still hold after the reseed, E2's station roll included |
| `test/mission-divergence.test.mjs` | Imports the seed, squad, step and trace from `mission-golden.test.mjs`, so the reseed reaches it, and it is the only suite that counts `root.rng` draws — where E2's new draw is observable as a stream-order fact |

## Approximations

| Approximation | What catches it |
|---|---|
| **Two squadmates can roll the same side and a similar distance.** The design row is titled "No two squadmates share a station"; independent rolls make collision unlikely, not impossible, and nothing enforces exclusivity | E0's scenes with a two-soldier squad. Nothing automated proves separation |
| **A squadmate overshoots its station by about 3px and rests there.** `SOLDIER.apply` reduces the drive request to its sign, so a body arriving at a run needs ~17px to stop against a 14px arrival radius. It comes to rest just past the station rather than chattering, because the halt holds until the station moves | E0's settled-gap number, and the standstill count would catch it if it chattered |
| **Smoothness is measured, not seen:** a settled gap, a count of standstills, a count of surface crossings. A jerk shorter than a full stop is invisible to the bar | Playing it. `tech/nav-audit.md` §4, "Test coverage gaps" |
| Arrival keeps `config.navArriveRadius`, the same tolerance every routed agent stops on. No separate escort tolerance is introduced | E0's settled-gap number |
| The legacy companion (`config.companionBrain: "legacy"`) keeps the old walk-and-wait follow. It is a fallback nothing defaults to | `test/companion-aim.test.mjs` drives the spec path only |
| Where a squadmate ends up when the station is unreachable is unchanged: the closest reachable point, then stop (`design/agent-navigation.md`) | `test/navigation.test.mjs`'s partial-path cases |
| A station is rolled on entering the controller, so a squadmate that leaves escort to fight and comes back takes a new one. "Keeps them for as long as it is escorting" is read as one escort period | E0's scenes hold one behaviour at a time; nothing pins re-entry |
| ~~A leader in mid-air has no surface to clamp to, so the station is the raw offset until it lands~~ **As built:** the station clamps to the surface below the leader whether it is grounded or not, so it does not move during a jump | E0's scenes keep the leader grounded; the step scene's leader jumps |

## Why a controller and not a longer order

The escort loop today is a brain track: `moveTo` (the **action**) captures the leader's position, opens a `moveOrder` with a 0.6s timeout, and a `wait` follows it. Three properties of that shape are the defect, and all three belong to orders rather than to escorting:

| Property | Consequence |
|---|---|
| The point is captured when the step runs | The squadmate walks to where you were |
| The order ends on a timeout | `stop` runs the soldier's friction, and the track's `wait` holds it there |
| A track needs a blocking step to loop | The wait cannot simply be deleted |

A motion controller has none of them: it is re-asked every frame, resolves its point every frame, and never ends. The Behavior Lab already drives a companion body this way (`src/editor/tools/behavior-lab.js` sets a `moveTo` controller at the clicked point), which is why its agent walks smoothly and a squadmate does not.

`moveTo` with an `offset` param would have been the smaller change. It is rejected twice over: `resolveTargetPoint`'s offset is measured along the follower→target line, which is the input a movement decision must never read because movement changes it (`tech/nav-audit.md` §2a); and a station is per-agent, rolled, and held, while `moveTo` means "go to this point" for every scripted enemy that uses it.
