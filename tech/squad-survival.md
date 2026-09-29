---
type: tech
category: artificial-intelligence
status: unbuilt
resolution: sharp
needs: [agent-navigation, ranged-repositioning, soldier-ducking, soldier-behavior, enemyspec]
related: [squad-survival, locomotion, mission-determinism, nav-audit]
---

# Squad survival

How squadmates come to weigh danger, choose safer spots and routes, take cover,
fire only with a usable shot, and dodge by ducking or jumping. Implements
`design/squad-survival.md`.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| V1 | **Senses and the two predicates.** The companion bridge opts its agent into survival and mirrors the Soldier's real health onto it, so `self.hpPct` stops being a constant 1. Perception publishes, for opted-in agents only: `sense.underFire`, `sense.wounded`, `sense.calm`, `sense.exposure`, `sense.needReload` (magazine empty and a spare left), `sense.shot` (equal to `sense.los` in this slice). Every threshold is a config knob, and the published value is a boolean, because expressions cannot read config. Two predicates become the only way this system asks about danger. **Hit prediction** is the forward walk inside `duckableShot`, lifted out to take a body box that can move over time. **Can-hit** is "can this shooter's round reach this body", and is line of sight in this slice. The duck is re-expressed on hit prediction. The Path overlay prints each squadmate's brain state, HP% and exposure | **None.** The duck behaves identically, and no brain reads the new senses. Seam and instrumentation only |
| V2 | **Scored spots.** For an opted-in agent, `standPoint` stops requiring sight. It returns the in-band point, preferring a sighted probe, and `holdPoint` ranks every candidate with a scorer: travel time, exposure, a usable-shot bonus, and an ally-occupancy penalty. Staying put is a candidate. Repositioning gains a third trigger beside the two it has: exposure at the current spot above a knob. A new spot must beat staying put by a margin. A committed survival reposition releases on arrival or failure, not when sight returns. Enemies keep today's filter, triggers and release exactly | **Changed.** Squadmates in a fight stop standing in the open and stop stacking |
| V3 | **Cover.** A new motion controller, `cover`, takes nodes reachable within a time horizon, probed at three points per node (the standable point nearest the body and both span ends, the same probes `standPoint` uses), and goes to the one V2's scorer ranks best under cover weights. Exposure dominates, and there is no band. It keeps its own commitment, held on the entity and keyed to its motion object the way `followStation` keys a station. Entering it releases any reposition commitment. The default companion gains a `cover` state, entered from **escort or combat** on `underFire && wounded`, or on `needReload`. It fires when `sense.shot` holds. It leaves on `calm` to combat or escort by range, and `calm` needs a longer quiet than `underFire` needs to clear. Reloading is unchanged: `autoReload` still starts the moment the magazine runs dry | **Changed.** A wounded or empty squadmate breaks contact, reloads behind something, and goes back to fighting or escorting |
| V4 | **Seeing is not hitting.** Can-hit is upgraded in both directions. **Mine:** the squadmate's own round, from `fire()`'s muzzle origin, stepped with its weapon's gravity. For a gravity weapon the aim becomes the launch angle that lands on the target when one exists, and the barrel follows it. It stops at terrain, at the end of its lifetime, and at an ally's box when friendly fire is on (the same rule that decides whether it would hit that ally). **Theirs:** each projectile emitter of the hostile, from its origin, with its speed, gravity and life. A straight emitter is aimed at the body. A gravity emitter is tried across a fan of launch angles, so a lobber reaches over cover. A hostile with contact damage and no emitter exposes spots within a knob radius of itself. The companion fire gate moves from `sense.los` to `sense.shot` | **Changed.** Squadmates hold fire into walls, lob accurately with arcing weapons, and treat lobbers as reaching over cover |
| V5 | **Dangerous routes.** `costsFrom` gains an optional per-caller edge weight, the same way it takes a per-caller ban set. An opted-in agent's routes and spot choice pay for an edge's exposure as well as its time. Edge exposure is computed once per sense tick per agent and cached against the graph's identity (generation, profile key and clearance, the three things `navState` checks), and Dijkstra reads the cache. For an opted-in agent, a destination that moves but still resolves to the same goal node keeps the held path instead of discarding it (today any move past `navArriveRadius` discards it). On the repath tick, a recomputed route to that node replaces the held one only if it is cheaper by a margin. A new goal node always routes fresh | **Changed.** Squadmates take a longer covered way over a short exposed one |
| V6 | **Dodging.** `tickDuck` becomes one dodge reflex with three candidates per threatening round: keep going (the box extrapolated at current velocity), duck (the crouched box), jump (a copy of the body flown on `stepActor` under the soldier's zero-input actuation, which is friction braking as in `applyMovement` and mirrored by `actuate` in `src/game/nav.js`). It takes the first that hit prediction says clears the round. A jump also needs a standable landing (`nodeUnder` on the squadmate's graph) and no other predicted round on its path. Speed's chance and latency gate the reflex as they gate the duck today, and one verdict per round stays. When a jump's latency expires, the jump is re-flown from the live state. If it no longer clears, the reflex falls back to duck, then to nothing. A dodge jump drops the current nav leg first, and holds a zero-input locomotor intent from the launch frame until it lands, so it flies the arc that was predicted | **Changed.** Squadmates jump rounds that a knee cannot avoid |

V1 lands alone and changes nothing. That proves the lifted walk is the same walk
before anything reads it. **V2 is the first slice a player can see.** V3–V6 each
land alone on V2. V4 and V5 do not depend on each other.

## Reuses

| What | Where | Why |
|---|---|---|
| The companion per-frame bridge — body→agent mirror, aim, duck, brain tick | `src/mission/ai.js` (`updateCompanionSpec`, `companionAgent`, `tickDuck`, `aimAt`, `autoReload`) | The one place a companion's body is synced and stepped. The opt-in flag, HP mirror, ballistic aim and dodge belong here |
| The duck predicate and its non-mutating step | `src/mission/combat.js` (`duckableShot`, `stepProjectile`) | Hit prediction is this walk with a moving box. A second predictor would drift from the one already agreeing with the physics |
| The mission's integrator, stances, overlap | `src/mission/entities.js` (`stepActor`, `applyMovement`, `STAND_H`, `CROUCH_H`, `overlaps`) | The jump candidate is flown on the integrator the mission steps, with the actuation `applyMovement` applies, so the prediction and the flight agree |
| Soldier actuation as a pure function | `src/game/nav.js` (`actuate`) | Already mirrors `applyMovement` for the clearance predictor. Exported for the jump candidate rather than written again |
| Magazines and spares | `src/mission/entities.js` (`startReload`, `magsLeft`) | `needReload` reads them. With no spare left, the cover trigger does not fire |
| Perception cadence and the sense record | `src/mission/enemyspec/perception.js` (`updateSense`, `losBetween`, `hostilesFor`) | 0.2s sensing is the reaction delay the brain already runs on. `losBetween` is V1's can-hit |
| Spot choice and the injected sight predicate | `src/mission/navigation.js` (`holdPoint`, `standPoint`) | Reachability, the band solve and the three probes stay. V2 changes what `standPoint` rejects and how `holdPoint` compares |
| Reposition commitment | `src/mission/enemyspec/runtime.js` (`repositionRequest`, `release`) and `navRepositionHold` | V2 extends its triggers and release for opted-in agents. The grounded-only window and release-drops-the-route rules carry over unchanged |
| Entity-held controller state keyed to its motion object | `src/mission/enemyspec/runtime.js` (`followStation`) | The precedent for `cover`'s own commitment, and for noticing a new controller period |
| Escort station | `src/mission/navigation.js` (`stationPoint`), `src/mission/enemyspec/runtime.js` (`follow`) | Escort is unchanged. Cover hands back to it, and E2's re-roll on re-entry is the existing rule |
| Routing with a per-caller view of a shared graph | `src/game/nav.js` (`costsFrom`, `route`, `bestPartial`, `nearestNode`, `nodeUnder`), `src/mission/navigation.js` (`navState`) | `skip` already shows how a caller-owned view of a cached graph works. The edge weight follows the same rule |
| Route follower and dropping a leg safely | `src/mission/navigation.js` (`routeRequest`, `abortRoute`) | V5's hysteresis sits on its existing repath tick. V6's jump uses `abortRoute`, so a dodge is never booked as a failed nav jump |
| The deferred jump and crouch channels | `src/mission/locomotion.js` (the `SOLDIER` locomotor, `pendingJump`, `crouchIntent`) | The dodge writes intents, and V6's zero-input intent is a third of the same shape |
| Brain states, transitions, expressions | `src/mission/enemyspec/brain.js`, `src/mission/enemyspec/runtime.js` (`exprCtx`, `controllerRequest`) | Cover is one more state and one more controller. No brain change |
| The companion as data | `src/game/companionspecs.js` (`DEFAULT_COMPANION`) | The `cover` state, its transitions and the fire gate are spec edits |
| Motion vocabulary | `src/game/enemyspec/schema.js` (`MOTIONS`, `vocabularyDoc`) | A controller is one entry, and this file also decides what the LLM is shown |
| How an enemy fires | `src/mission/enemyspec/runtime.js` (`doFire`, `patternAngles`), `contact` in the spec format | Emitter origin, speed and gravity, and straight aim at the target. Contact damage is how a charger hurts |
| How a squadmate fires | `src/mission/ai.js` (`fire`) | Muzzle origin and aim. V4's shot starts where the round starts |
| Soldier health with wounds already applied | `src/mission/entities.js` (`Soldier`), `src/game/soldiers.js` (`soldierMaxHp`) | Carried-in wounds are subtracted at spawn, so the mirror counts them |
| Debug overlays and their gate | `src/mission/mission.js` (`_handleOverlays`, `_drawSquadPaths`), `src/mission/render.js` | V1's readout rides the Path overlay. No new binding |
| Config schema | `src/game/config.js` (`SCHEMA`) | Every number is a knob, in a new "Squad survival" group |

## Where the code goes

| Piece | Module | Notes |
|---|---|---|
| Hit prediction (V1), moving boxes (V6) | `src/mission/combat.js` | Lifted out of `duckableShot`, which becomes a caller. Same terrain, lifetime, team and explode rules |
| Can-hit (V1, V4) | `src/mission/enemyspec/perception.js` | Beside `losBetween`. Exported, because `navigation.js` takes sight as an injected predicate rather than importing back, and that direction stays |
| Survival senses | `src/mission/enemyspec/perception.js` | Only for agents carrying the opt-in flag, on the existing cadence. The flag is set by `companionAgent` in `src/mission/ai.js`. The Behavior Lab's agent is also on the player team (`src/editor/tools/behavior-lab.js`), and does not get it |
| HP mirror, the hurt/quiet clocks, ballistic aim, dodge | `src/mission/ai.js` | "Hurt" is a health drop the bridge sees between ticks, so burn counts. Burn skips `ctx.damage` (the status tick in `src/mission/combat.js`). The clocks are handed to perception for `underFire` and `calm` |
| Spot scorer and cover weights | `src/mission/navigation.js` | Passed into `holdPoint`. Absent means today's cheapest-in-band-with-sight rule, exactly |
| Trigger, release and scorer selection | `src/mission/enemyspec/runtime.js` (`repositionRequest`) | Opted-in agents only |
| `cover` controller and its commitment | `src/mission/enemyspec/runtime.js` (`controllerRequest`), `src/game/enemyspec/schema.js` (`MOTIONS`) | Valid for any agent, but left out of the LLM vocabulary line, because no enemy publishes the senses that would make it sensible |
| Edge weight, `actuate` export | `src/game/nav.js` (`costsFrom`, `route`, `bestPartial`, `actuate`) | An optional argument. Absent reproduces today's numbers exactly |
| Edge-exposure cache, route hysteresis | `src/mission/navigation.js` (`routeRequest`) | The cache is per agent, keyed to graph identity as `navState` keys route state, and filled on the sense tick. The keep-the-held-path rule is behind the opt-in flag |
| Zero-input intent | `src/mission/locomotion.js` | Honoured by the `SOLDIER` locomotor from the frame the dodge jump is issued. Cleared on landing |
| Companion spec | `src/game/companionspecs.js` | `cover` state (V3), fire gate (V4) |
| Knobs | `src/game/config.js` | Wounded fraction, hurt window, under-fire lookahead, calm quiet time, exposure trigger, cover horizon, spot and route margins, exposure and crowding weights, lobber fan width and count, contact reach |
| Overlay readout | `src/mission/mission.js` (`_drawSquadPaths`) | Text above each squadmate while the Path overlay is on |
| Tests | `test/companion-aim.test.mjs` (behaviour, all slices), `test/crouch.test.mjs` (hit prediction), `test/reposition.test.mjs` (scorer, enemy path unchanged), `test/navigation.test.mjs` and `test/nav.test.mjs` (edge weight, absent-weight identity, route hysteresis), `test/locomotion-intents.test.mjs` (spec validation, zero-input intent) | New cases go in the suite that already covers the subsystem |

## The seam

| This owns | This must not touch |
|---|---|
| What an opted-in agent senses about danger | Enemy perception, spot choice and routes. Every change is behind the opt-in flag or an optional argument enemies never pass |
| How a squadmate scores a spot and a route | The nav graph. It is shared and cached per body profile, so weights are applied per query and never stored on it |
| Whether a squadmate is in cover | Brain arbitration in `src/mission/enemyspec/brain.js`. Cover is data plus one controller. No utility-mode migration |
| The dodge decision and its intents | Body motion. Only the `SOLDIER` locomotor actuates |
| Where a squadmate's barrel points for a gravity weapon | Reload mechanics and timing (`autoReload`, `startReload`, `tickReload`), the controlled soldier, and `fire()` itself |
| Hit prediction and can-hit | Any other visibility or hit test in this system. New code does not call `losBetween` or `duckableShot` directly |
| — | The escort station (E1/E2) and the Behavior Lab's agent |
| — | The legacy companion (`updateCompanion`) |
| — | Randomness. The only draw is the dodge's existing-shaped reaction roll, off `scene.rng` |

## Must not regress

| Guard | What it proves |
|---|---|
| `test/crouch.test.mjs` | The hit predictor answers what `duckableShot` answered. V1 leaves every case green without edits |
| `test/companion-aim.test.mjs` | 2D aim, corpse targeting, the escort return, and the duck cases (hold, stand-up, off switch) |
| `test/locomotion-intents.test.mjs` | `DEFAULT_COMPANION_SPEC` still validates, and its combat standoff and crouch-channel cases hold |
| `test/reposition.test.mjs` | Enemy repositioning is unchanged. No scorer means today's rule |
| `test/navigation.test.mjs`, `test/nav.test.mjs` | Routing, bans, attempts and partial paths with no weight, and the E1/E2 escort station cases, which run `DEFAULT_COMPANION_SPEC` and so also guard V3's edit of it |
| `test/behavior-lab.test.mjs` | The Lab's agent, which is not opted in, routes as today |
| `test/locomotion-characterization.test.mjs` | Locomotion under the extended locomotor |
| `test/enemyspec*.test.mjs`, `test/mission-enemyspec.test.mjs` | The shared runtime, the expression context and the new motion entry under validation |
| `test/mission-golden.test.mjs` | Unchanged through V1. V2–V6 each change companion behaviour, so the golden is re-frozen in each of those slices' commits, deliberately, with the commit saying so. The twice-run self-check still has to pass — that is what catches an unseeded draw |

**Baseline when this spec was written:** `node test/run.mjs` gave 42 suites and
3,137 passed. An earlier run the same session had 1 intermittent failure in
`test/mission-net.test.mjs` ("drive: and not the one who did not"). It passed on
three reruns in a row, and it predates this work.

## Approximations

| Approximation | Why it is acceptable | What catches it |
|---|---|---|
| **A straight emitter is tested aimed at the body.** Its ring, fan and burst patterns and the lead jitter are ignored | Aimed fire is what an enemy points at one soldier | A squadmate taking hits from a fan while the overlay shows exposure 0 |
| **A gravity emitter is tried across a fixed fan of angles**, not the pattern its brain actually fires | It captures "reaches over a wall" without reading brain steps | A lobber reaching or missing a spot the test called the other way |
| **Contact hostiles expose a radius around themselves**, ignoring whether they can path there | A charger's threat is closing, and a radius is the cheap form of that | A squadmate choosing a spot a charger reaches through a gap |
| **Spawned-entity emitters** (`def.ref`, e.g. homing drones) are invisible to exposure and the dodge | They are not rounds in `scene.projectiles` | In play |
| **Three probes per candidate node**, the ones `standPoint` already uses | Enough to find the hidden end of a span, but not the hidden middle | A squadmate missing cover in the middle of a long span |
| **Edge exposure is sampled at the edge's two ends** | Arcs are short relative to how fast exposure changes | A route that is covered at both ends and crosses a sightline mid-air |
| **The usable shot ignores spread** | Gating on a random draw would stop firing at range | A low-Aim squadmate firing at a target it then misses |
| **Keep-going extrapolates current velocity. Duck is a static crouched box** | Both are a body not told to do anything else | A squadmate that keeps going into a round because the brain turned it |
| **The ballistic aim takes the low arc, and skips the solve when none exists** | The low arc is the fast one, and with no solution the round can't land anyway | A squadmate lobbing into a ceiling the high arc would clear |
| **Escort does not weigh exposure.** An escorting squadmate stands where its station puts it. It meets fire only through cover (when wounded) and dodging. Scored spots apply in a fight | The design's "where it stands" is about a squadmate with a target. The escort station is E1/E2's, and scoring it would fight the leader-only rule that stops escorts oscillating | A healthy squadmate standing exposed to a sniper beyond engagement range |
| **After cover, a fight re-picks its spot.** Entering cover releases the combat reposition commitment, so the squadmate re-scores rather than resuming the spot it was heading for | The old spot was chosen for conditions that sent it into cover | A squadmate returning from cover to somewhere different |
| **Station re-roll after cover.** Coming back from cover is a new escort period, so E2 rolls a new side and distance | That is E2's rule for coming back from combat, applied unchanged | A squadmate swapping sides after cover |
| **Cost.** Exposure is candidates × hostiles, plus flights for gravity emitters and V4's shots. It runs on the sense tick and the reposition cadence, and edges read a cache | Graphs are tens of nodes and hostiles tens at most | The FPS readout on the largest generated level with a full roster |
| **Blast radius is ignored.** An exploding round counts as a direct round for exposure, and is never dodged | The design excludes blasts | — |
