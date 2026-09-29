---
type: tech
category: artificial-intelligence
status: building
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
| V1 | **Senses and the two predicates.** The companion bridge opts its agent into survival and mirrors the Soldier's real health onto it, so `self.hpPct` stops being a constant 1. Perception publishes, for opted-in agents only: `sense.underFire`, `sense.wounded`, `sense.calm`, `sense.exposure`, `sense.needReload` (magazine empty, reloading, a spare left), `sense.outOfAmmo` (magazine empty, not reloading, no spare left), `sense.leaderFar` (see Cover's leash below), `sense.shot` (equal to `sense.los` in this slice). They are written by one `publishSurvival(root, scene)` that runs on the sense tick **before** the no-hostile early return in `updateSense`, the way `publishNav` runs before it. With no living hostile, `exposure` is 0 and `shot` is false, while `underFire` and `calm` still come from the clocks, and a round still in flight still counts. Without this, a squadmate in cover when the last hostile dies never sees `calm` and stays there. Every threshold is a config knob, and the published value is a boolean, because expressions cannot read config. Two predicates become the only way this system asks about danger. **Hit prediction** is `predictHit(scene, p, boxAt, dt, steps)` in `src/mission/combat.js`: the forward walk lifted out of `duckableShot`, taking a body box that can move over time and returning the frame it hits or −1. It applies the dead, owner, team/friendly-fire, lifetime and terrain rules. It does **not** apply the explode rule: that stays in `duckableShot` (and later the V6 dodge), the callers that must ignore blasts, so an incoming rocket does count toward `underFire`. `duckableShot` becomes "`predictHit` on the standing box, and not on the crouched box". **Can-hit** is "can this shooter's round reach this body", and is line of sight in this slice. The Path overlay prints each squadmate's brain state, HP% and exposure | **None.** The duck behaves identically, and no brain reads the new senses. Seam and instrumentation only |
| V2 | **Scored spots.** For an opted-in agent, `standPoint` stops requiring sight. It returns the in-band point, preferring a sighted probe, and `holdPoint` ranks every candidate with a scorer: travel time, exposure, a usable-shot bonus, and an ally-claim penalty. **Claims:** each other living squadmate claims its committed spot (`repo.dest`, else its cover spot once V3 lands, else where it stands). The leader claims where it stands. The penalty applies within a knob multiple of body width. Squadmates update in order, so a later one sees what an earlier one claimed the same frame, deterministically and with no draw. Staying put is a candidate. Repositioning gains a third trigger beside the two it has: exposure at the current spot at or above a knob (default 2, see Approximations). A new spot must beat staying put by a margin. **A held spot is re-checked**: on the repath tick (`navRepathInterval`), whether travelling or arrived, the held spot's exposure is read, and if it is at or above the exposure knob and a fresh pick beats it by the margin, the commitment is released and re-picked. Otherwise a committed survival reposition releases on arrival or failure, not when sight returns. Spot exposure is read from the **shared exposure cache** (Where the code goes), so squadmates do not pay for it separately. Enemies keep today's filter, triggers and release exactly | **Changed.** Squadmates in a fight stop standing in the open and stop stacking |
| V3 | **Cover.** A new motion controller, `cover`, takes nodes reachable within a time horizon and within the leash of the leader (below), probed at three points per node: the standable point nearest the body and both ends of the node's span (there is no band to clip them to). It goes to the one V2's scorer ranks best under cover weights. Exposure dominates. When the entry was `needReload`, the horizon is `min(cover horizon, soldier.reloading)`, so it only goes somewhere it reaches while still reloading. If nowhere beats staying put, it reloads where it stands. It keeps its own commitment, held on the entity and keyed to its motion object the way `followStation` keys a station, and re-checks it on the repath tick by V2's rule. Being hit while holding the spot also forces a re-pick. Entering it releases any reposition commitment. The default companion gains a `cover` state wired by the transition table below. Its fight track fires when `sense.shot && !sense.outOfAmmo`, so an empty squadmate does not dry-click. `calm` needs a longer quiet than `underFire` needs to clear. Reloading is unchanged: `autoReload` still starts the moment the magazine runs dry | **Changed.** A wounded, reloading or empty squadmate breaks contact and goes back to fighting or escorting when the fire stops. An empty one stays in cover while the fight lasts, and follows you if you walk away |
| V4 | **Seeing is not hitting.** Can-hit is upgraded in both directions. **Mine:** the squadmate's own round, from `fire()`'s muzzle origin, stepped with its weapon's gravity. For a gravity weapon the aim becomes the launch angle that lands on the target when one exists, and the barrel follows it. It stops at terrain, at the end of its lifetime, and at an ally's box when friendly fire is on (the same rule that decides whether it would hit that ally). **Theirs:** each projectile emitter of the hostile, from its origin, with its speed, gravity and life. A straight emitter is aimed at the body. A gravity emitter is tried across a fan of launch angles, so a lobber reaches over cover. A hostile with contact damage and no emitter exposes spots within a knob radius of itself. **Cost rules:** a straight round is one segment test against the platforms, not a stepped flight. A gravity round steps at a fixed coarse rate (a knob) with swept samples inside each step, the method the nav clearance predictor uses. It tests only platforms overlapping the flight's bounding box, and stops once it has passed the body. A candidate stops being scored once its partial score cannot beat the best so far, as `holdPoint` already stops on cost. The companion fire gate moves from `sense.los` to `sense.shot` | **Changed.** Squadmates hold fire into walls, lob accurately with arcing weapons, and treat lobbers as reaching over cover |
| V5 | **Dangerous routes.** `costsFrom` gains an optional per-caller edge weight, the same way it takes a per-caller ban set. An opted-in agent's routes and spot choice pay for an edge's exposure as well as its time. This includes escort's `follow` routes: the design's Travel rules are not limited to fights, and only where escort *stands* ignores exposure. Edge exposure is sampled at the edge's two ends and read from the shared exposure cache, which is keyed to the graph's identity (generation, profile key and clearance, the three things `navState` checks). Dijkstra reads the cache. For an opted-in agent, a destination that moves but still resolves to the same goal node keeps the held path instead of discarding it (today any move past `navArriveRadius` discards it). On the repath tick, a recomputed route to that node replaces the held one only if it is cheaper by a margin. A new goal node always routes fresh. The E1/E2 frozen numbers in `test/navigation.test.mjs` run opted-in escorts and may move here, so this commit re-freezes them and says so | **Changed.** Squadmates take a longer covered way over a short exposed one |
| V6 | **Dodging.** `tickDuck` becomes one dodge reflex with three candidates per threatening round: keep going (the box extrapolated at current velocity), duck (the crouched box), jump (a copy of the body flown on `stepActor` under the soldier's zero-input actuation, which is friction braking as in `applyMovement` and mirrored by `actuate` in `src/game/nav.js`). It takes the first that `predictHit` says clears the round. Exploding rounds are skipped here, as in `duckableShot`. A jump also needs a standable landing (`nodeUnder` on the squadmate's graph) and no other predicted round on its path. Speed's chance and latency gate the reflex as they gate the duck today, and one verdict per round stays. When a jump's latency expires, the jump is re-flown from the live state. If it no longer clears, the reflex falls back to duck, then to nothing. A dodge jump drops the current nav leg first, and holds a zero-input locomotor intent from the launch frame until it lands, so it flies the arc that was predicted | **Changed.** Squadmates jump rounds that a knee cannot avoid |

V1 lands alone and changes nothing. That proves the lifted walk is the same walk
before anything reads it. **V2 is the first slice a player can see.** V3–V6 each
land alone on V2. V4 and V5 do not depend on each other.

### As built

| Slice | The spec said | What shipped, and why |
|---|---|---|
| V1 | `predictHit(scene, p, boxAt, dt, steps)` | `predictHit(scene, p, s, boxAt, dt, steps, ctx)`. The owner and friendly-fire rules need the body's identity and `ctx.friendlyFire`, which a box function cannot carry |
| V1 | `duckableShot` is "`predictHit` on the standing box, and not on the crouched box" | Not on the crouched box **by the frame the round reaches the standing one**. Over the whole flight, a descending lobbed pod that clears a knee on arrival and would drop onto it a frame later stopped being duckable, which failed `test/crouch.test.mjs` ("the lobbed pod clears it and is duckable anyway"). The by-that-frame form is the old answer exactly |
| V1 | The knobs are one group | "Squad survival" in `src/game/config.js`, grown a slice at a time. V1 has the wounded fraction (0.5), hurt window (1.5s), under-fire lookahead (1s), calm time (2.5s), leash (420px) and leash margin (80px). All are live and server-scoped, so they are on the pause menu (`design/pause-menu.md`'s rule) and in the room's config route; `test/tools.test.mjs` and `test/mission-net.test.mjs` count them off the group rather than restating a number |
| V1 | Exposure is measured where the agent stands | Against the **standing** box's centre, hung off the feet line, whatever the stance, so a duck does not flip it. `sense.shot` uses the current centre, as `sense.los` does, so the two are equal in V1 |
| V1 | The Path overlay prints state, HP% and exposure | Drawn in `_drawSquadPaths`. Like the paths it rides with, it is absent from a room mission's client, because `src/net/mission-wire.js` carries no agent state. Nothing drawn for play reads the new senses, so the wire gains nothing |

### Cover transitions (V3)

Transitions are checked every frame (`src/mission/enemyspec/brain.js`), so every
exit is guarded by the negation of the entry it could bounce off, and range uses
the existing 520 engage / 640 disengage split as hysteresis. Within a state the
rows are in priority order. `dist` is `sense.dist`. **Leash:** `sense.leaderFar`
is true when `sense.anchorDist` exceeds a leash knob, and clears only below the
leash minus a margin knob. Cover candidates are limited to within the leash minus
that margin of the leader, so reaching cover never sets `leaderFar` by itself.

| From | To | When |
|---|---|---|
| escort | cover | `!leaderFar && ((underFire && wounded) \|\| ((needReload \|\| outOfAmmo) && dist < 520))` |
| escort | combat | `dist < 520 && !outOfAmmo` |
| combat | cover | `!leaderFar && ((underFire && wounded) \|\| needReload \|\| outOfAmmo)` |
| combat | escort | `dist > 640 \|\| outOfAmmo` (out of ammo reaches this row only while `leaderFar`) |
| cover | escort | `leaderFar` |
| cover | escort | `calm && dist > 640` |
| cover | combat | `calm && !needReload && !outOfAmmo && dist <= 640` |

What this yields:

| Situation | State |
|---|---|
| Reloading, nobody shooting | Cover (the horizon is capped to reach it inside the reload) until the reload ends, then combat once. One switch each way, never one per frame |
| Out of ammo, fight in range, leader near | Cover, held for as long as the fight lasts |
| Out of ammo, leader walks away | Escort, following the leader. It re-enters cover only when the leader is back within the leash and a hostile is within 520 |
| Out of ammo, fight over | Escort once `calm` and past 640. It does not re-enter, because entry needs a hostile within 520 |
| Wounded and hit, beyond engage range | Cover from escort, back to escort on `calm` |

## Reuses

| What | Where | Why |
|---|---|---|
| The companion per-frame bridge — body→agent mirror, aim, duck, brain tick | `src/mission/ai.js` (`updateCompanionSpec`, `companionAgent`, `tickDuck`, `aimAt`, `autoReload`) | The one place a companion's body is synced and stepped. The opt-in flag, HP mirror, ballistic aim and dodge belong here |
| The duck predicate and its non-mutating step | `src/mission/combat.js` (`duckableShot`, `stepProjectile`) | Hit prediction is this walk with a moving box. A second predictor would drift from the one already agreeing with the physics |
| The mission's integrator, stances, overlap | `src/mission/entities.js` (`stepActor`, `applyMovement`, `STAND_H`, `CROUCH_H`, `overlaps`) | The jump candidate is flown on the integrator the mission steps, with the actuation `applyMovement` applies, so the prediction and the flight agree |
| Soldier actuation as a pure function | `src/game/nav.js` (`actuate`) | Already mirrors `applyMovement` for the clearance predictor. Exported for the jump candidate rather than written again |
| Swept samples inside a coarse step | `src/game/nav.js` (the clearance predictor) | V4's gravity flights use the same method so a thin platform is not skipped at a coarse step |
| Magazines and spares | `src/mission/entities.js` (`startReload`, `tickReload`, `magsLeft`) | `needReload` and `outOfAmmo` read them. `magsLeft` drops at the END of a reload, so a reload in progress still counts its own magazine as a spare |
| Perception cadence and the sense record | `src/mission/enemyspec/perception.js` (`updateSense`, `publishNav`, `losBetween`, `hostilesFor`) | 0.2s sensing is the reaction delay the brain already runs on. `losBetween` is V1's can-hit. `publishNav` is the precedent for publishing ahead of the no-hostile return |
| Leader distance | `src/mission/enemyspec/perception.js` (`sense.anchorDist`, from `root.anchor` set by the bridge) | `leaderFar` is this, past a knob |
| Spot choice and the injected sight predicate | `src/mission/navigation.js` (`holdPoint`, `standPoint`) | Reachability, the band solve and the three probes stay. V2 changes what `standPoint` rejects and how `holdPoint` compares |
| Reposition commitment | `src/mission/enemyspec/runtime.js` (`repositionRequest`, `release`) and `navRepositionHold` | V2 extends its triggers and release for opted-in agents. The grounded-only window and release-drops-the-route rules carry over unchanged |
| Entity-held controller state keyed to its motion object | `src/mission/enemyspec/runtime.js` (`followStation`) | The precedent for `cover`'s own commitment, and for noticing a new controller period |
| Escort station | `src/mission/navigation.js` (`stationPoint`), `src/mission/enemyspec/runtime.js` (`follow`) | Escort's station is unchanged. Cover hands back to it, and E2's re-roll on re-entry is the existing rule |
| Routing with a per-caller view of a shared graph | `src/game/nav.js` (`costsFrom`, `route`, `bestPartial`, `nearestNode`, `nodeUnder`), `src/mission/navigation.js` (`navState`) | `skip` already shows how a caller-owned view of a cached graph works. The edge weight follows the same rule |
| Route follower and dropping a leg safely | `src/mission/navigation.js` (`routeRequest`, `abortRoute`) | V5's hysteresis sits on its existing repath tick. V6's jump uses `abortRoute`, so a dodge is never booked as a failed nav jump |
| The deferred jump and crouch channels | `src/mission/locomotion.js` (the `SOLDIER` locomotor, `pendingJump`, `crouchIntent`) | The dodge writes intents, and V6's zero-input intent is a third of the same shape |
| Brain states, transitions, expressions | `src/mission/enemyspec/brain.js`, `src/mission/enemyspec/runtime.js` (`exprCtx`, `controllerRequest`) | Cover is one more state and one more controller. No brain change |
| The companion as data | `src/game/companionspecs.js` (`DEFAULT_COMPANION`) | The `cover` state, the transition table and the fire gates are spec edits |
| Motion vocabulary | `src/game/enemyspec/schema.js` (`MOTIONS`, `vocabularyDoc`) | A controller is one entry, and this file also decides what the LLM is shown |
| How an enemy fires | `src/mission/enemyspec/runtime.js` (`doFire`, `patternAngles`), `contact` in the spec format | Emitter origin, speed and gravity, and straight aim at the target. Contact damage is how a charger hurts |
| How a squadmate fires | `src/mission/ai.js` (`fire`) | Muzzle origin and aim. V4's shot starts where the round starts |
| Soldier health with wounds already applied | `src/mission/entities.js` (`Soldier`), `src/game/soldiers.js` (`soldierMaxHp`) | Carried-in wounds are subtracted at spawn, so the mirror counts them |
| Debug overlays and their gate | `src/mission/mission.js` (`_handleOverlays`, `_drawSquadPaths`), `src/mission/render.js` | V1's readout rides the Path overlay. No new binding |
| Config schema | `src/game/config.js` (`SCHEMA`) | Every number is a knob, in a new "Squad survival" group |

## Where the code goes

| Piece | Module | Notes |
|---|---|---|
| Hit prediction (V1), moving boxes (V6) | `src/mission/combat.js` | `predictHit` is lifted out of `duckableShot`, which becomes a caller. Terrain, lifetime and team rules move with it. The explode rule stays in `duckableShot` and goes into the V6 dodge, not into `predictHit` |
| Can-hit (V1, V4) | `src/mission/enemyspec/perception.js` | Beside `losBetween`. Exported, because `navigation.js` takes sight as an injected predicate rather than importing back, and that direction stays |
| Survival senses | `src/mission/enemyspec/perception.js` (`publishSurvival`) | Only for agents carrying the opt-in flag, on the existing cadence, called before the no-hostile return. The flag is set by `companionAgent` in `src/mission/ai.js`. The Behavior Lab's agent is also on the player team (`src/editor/tools/behavior-lab.js`), and does not get it |
| Shared exposure cache (V2 spots, V5 edges) | `src/mission/enemyspec/perception.js`, stored on the scene | One per scene, not per agent: exposure depends on the point and the hostiles, never on which squadmate asks, and every soldier has the same standing box. Keyed to graph identity (generation, profile key, clearance). Refilled by the first opted-in agent to ask once the entry is older than the sense interval, off scene time, so it stays deterministic. Only "can I hit my target from here" is per squadmate, one test per candidate. Handed to `holdPoint` inside the scorer and to `costsFrom` as the edge weight, so `navigation.js` and `nav.js` still import nothing from perception |
| HP mirror, the hurt/quiet clocks, ballistic aim, dodge | `src/mission/ai.js` | "Hurt" is a health drop the bridge sees between ticks, so burn counts. Burn skips `ctx.damage` (the status tick in `src/mission/combat.js`). The clocks are handed to perception for `underFire` and `calm` |
| Spot scorer, ally claims and cover weights | `src/mission/navigation.js` | Passed into `holdPoint`. Absent means today's cheapest-in-band-with-sight rule, exactly. Claims are read from the other squadmates' agents (`repo.dest`, the cover commitment) and positions, and passed in by the caller |
| Trigger, held-spot re-check, release and scorer selection | `src/mission/enemyspec/runtime.js` (`repositionRequest`) | Opted-in agents only |
| `cover` controller, its commitment and its re-check | `src/mission/enemyspec/runtime.js` (`controllerRequest`), `src/game/enemyspec/schema.js` (`MOTIONS`) | Valid for any agent, but left out of the LLM vocabulary line, because no enemy publishes the senses that would make it sensible. The reload-capped horizon reads `ent.soldier.reloading` when present |
| Edge weight, `actuate` export | `src/game/nav.js` (`costsFrom`, `route`, `bestPartial`, `actuate`) | An optional argument. Absent reproduces today's numbers exactly |
| Route hysteresis | `src/mission/navigation.js` (`routeRequest`) | The keep-the-held-path rule is behind the opt-in flag |
| Zero-input intent | `src/mission/locomotion.js` | Honoured by the `SOLDIER` locomotor from the frame the dodge jump is issued. Cleared on landing |
| Companion spec | `src/game/companionspecs.js` | `cover` state and the transition table (V3), fire gates (V3, V4) |
| Knobs | `src/game/config.js` | Wounded fraction, hurt window, under-fire lookahead, calm quiet time, exposure trigger (default 2), cover horizon, leash and leash margin, ally claim radius (× body width), spot and route margins, exposure and crowding weights, lobber fan width and count, contact reach, gravity-flight step |
| Overlay readout | `src/mission/mission.js` (`_drawSquadPaths`) | Text above each squadmate while the Path overlay is on |
| Tests | `test/companion-aim.test.mjs` (behaviour, all slices, cover transitions), `test/crouch.test.mjs` (hit prediction), `test/reposition.test.mjs` (scorer, claims, held-spot re-check, enemy path unchanged), `test/navigation.test.mjs` and `test/nav.test.mjs` (edge weight, absent-weight identity, route hysteresis, cost ceiling), `test/locomotion-intents.test.mjs` (spec validation, zero-input intent) | New cases go in the suite that already covers the subsystem |

## The seam

| This owns | This must not touch |
|---|---|
| What an opted-in agent senses about danger | Enemy perception, spot choice and routes. Every change is behind the opt-in flag or an optional argument enemies never pass |
| How a squadmate scores a spot and a route | The nav graph. It is shared and cached per body profile, so weights are applied per query and never stored on it. The exposure cache lives on the scene beside it, not in it |
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
| `test/crouch.test.mjs` | `duckableShot` on `predictHit` answers what it answered before. V1 leaves every case green without edits. A new case: an incoming explode round sets `underFire` and is still not ducked |
| `test/companion-aim.test.mjs` | 2D aim, corpse targeting, the escort return, and the duck cases (hold, stand-up, off switch). From V3: every row of the cover transitions' outcome table, including one state change per reload (not per frame), and a squadmate in cover when the last hostile dies back in escort within `calm` time plus one sense tick |
| `test/locomotion-intents.test.mjs` | `DEFAULT_COMPANION_SPEC` still validates, and its combat standoff and crouch-channel cases hold |
| `test/reposition.test.mjs` | Enemy repositioning is unchanged. No scorer means today's rule. From V2: two squadmates and one good spot end on two spots, and a held spot that becomes exposed is released |
| `test/navigation.test.mjs`, `test/nav.test.mjs` | Routing, bans, attempts and partial paths with no weight, and the E1/E2 escort station cases, which run `DEFAULT_COMPANION_SPEC` through `updateCompanionSpec` and so run opted in from V1. V5 re-freezes their numbers deliberately if they move |
| Exposure cost ceiling (V4, V5) | Over the 60-level sweep with a full roster, the count of box and segment tests per scan is frozen as a ceiling, like S4's failed-leg rate. It is a count, not milliseconds, so it holds on any machine. The measured milliseconds go in this spec as an "As built" note when V4 lands |
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
| **An emitter's own speed is used.** A fire action's `speed` override (`args.speed \|\| p.speed` in `doFire`) is ignored | No shipped enemy uses the override. Reading it would mean reading brain steps | A generated enemy whose override changes a lobber's reach |
| **Contact hostiles expose a radius around themselves**, ignoring whether they can path there | A charger's threat is closing, and a radius is the cheap form of that | A squadmate choosing a spot a charger reaches through a gap |
| **Spawned-entity emitters** (`def.ref`, e.g. homing drones) are invisible to exposure and the dodge | They are not rounds in `scene.projectiles` | In play |
| **Three probes per candidate node**, the point nearest the body and the ends (band-clipped in V2, span ends in cover) | Enough to find the hidden end of a span, but not the hidden middle | A squadmate missing cover in the middle of a long span |
| **Edge exposure is sampled at the edge's two ends** | Arcs are short relative to how fast exposure changes | A route that is covered at both ends and crosses a sightline mid-air |
| **Exposure is shared across squadmates and up to one sense interval old** | It depends on the point and the hostiles, not on who asks, and 0.2s is the reaction delay everything else already runs on | A squadmate picking a spot a hostile stepped into view of within the last 0.2s |
| **Until V4, a shot means exposure.** Can-hit is sight both ways, so any spot with a shot on the target counts the target. The exposure trigger defaults to 2 so a squadmate engaging one hostile is not always moving, and a squadmate firing from cover is rare | V4's asymmetric can-hit is what separates them | A squadmate that never fires from cover in V2–V3 |
| **The usable shot ignores spread** | Gating on a random draw would stop firing at range | A low-Aim squadmate firing at a target it then misses |
| **Keep-going extrapolates current velocity. Duck is a static crouched box** | Both are a body not told to do anything else | A squadmate that keeps going into a round because the brain turned it |
| **The ballistic aim takes the low arc, and skips the solve when none exists** | The low arc is the fast one, and with no solution the round can't land anyway | A squadmate lobbing into a ceiling the high arc would clear |
| **Reload cover only reaches as far as the reload lasts.** `autoReload` is unchanged, so a squadmate reloads on the way and in cover, and stays put if no better spot is in reach before the magazine is back | Delaying the reload until cover is reached would make every reload slower, and the seam leaves reload timing alone | A squadmate reloading in the open because every better spot was too far |
| **Escort does not weigh exposure where it stands.** An escorting squadmate stands where its station puts it, and meets fire only through cover (when wounded) and dodging. Its routes do weigh exposure from V5 | The design's "where it stands" is about a squadmate with a target. The escort station is E1/E2's, and scoring it would fight the leader-only rule that stops escorts oscillating | A healthy squadmate standing exposed to a sniper beyond engagement range |
| **An empty squadmate follows a leader who leaves.** Out of ammo, it holds cover only while the leader is within the leash, and escorts otherwise, exposed | Staying with the player outranks hiding | An empty squadmate walking through fire behind a leader who walked through it |
| **After cover, a fight re-picks its spot.** Entering cover releases the combat reposition commitment, so the squadmate re-scores rather than resuming the spot it was heading for | The old spot was chosen for conditions that sent it into cover | A squadmate returning from cover to somewhere different |
| **Station re-roll after cover.** Coming back from cover is a new escort period, so E2 rolls a new side and distance | That is E2's rule for coming back from combat, applied unchanged | A squadmate swapping sides after cover |
| **Cost.** Exposure is candidates × hostiles, plus coarse-stepped flights for gravity emitters and V4's shots, shared per scene and refreshed at most once per sense interval. Straight rounds are one segment test | The cost rules in V4 and the shared cache bound it. A rough upper bound before them was tens of millions of box tests per scan per squadmate (about 33 nodes per level, 28 platforms, 180-step pod flights) | The counted ceiling in Must not regress, and the room server's resync when it falls behind |
| **Blast radius is ignored.** An exploding round counts as a direct round for exposure and `underFire`, and is never dodged | The design excludes blasts | — |
