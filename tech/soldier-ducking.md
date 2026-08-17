---
type: tech
category: artificial-intelligence
status: building
resolution: sharp
sprint: 2026-08
needs: [locomotion]
related: [soldier-behavior, ranged-repositioning, behavior-lab]
---

# Soldier ducking

How a squadmate gets the knee the player already has, and how the Speed stat
decides whether it lands. Implements the "Ducking" section of
`design/soldier-behavior.md`.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| D1 | **Squadmates duck.** A grounded squadmate whose standing box is about to be hit by a round its crouched box would miss drops to a knee, holds for a fixed time, and stands back up. Reaction is immediate and certain | **Changed.** Squadmates visibly kneel under aimed fire and take less of it. Deliberately superhuman here — the whole mechanism minus the stat, so the geometry can be judged before the dice are added |
| D2 | **Speed decides.** Whether a soldier reacts becomes a chance, and how long before they move becomes a latency; both from `stats.speed`, both knobs | **Changed.** Ducking becomes per-soldier and fallible, and `stats.speed` stops being decoration |

D1 lands alone and is the whole visible feature. D2 is separate because it is the
slice that can make ducking feel unfair or useless depending on the curve, and it
needs a D1 baseline where the geometry is known to work to be judged against.

## Reuses

| What | Where | Why |
|---|---|---|
| Crouch geometry — the feet-preserving height swap | `src/mission/entities.js` (`setCrouch`, `STAND_H`, `CROUCH_H`) | The stance exists and is correct. This adds a *caller*, not a stance |
| The movement lock while kneeling | `src/mission/entities.js` (`applyMovement`) | Kneeling already blocks running and jumping and permits pivoting and firing, so the cost of a duck is already modelled |
| Box overlap | `src/mission/entities.js` (`overlaps`) | The same test the real collision uses, so a predicted hit and an actual hit agree |
| Projectile motion and death — the gravity fraction, the lifetime, the wall kill | `src/mission/combat.js` (`updateProjectiles`) | The authority on how a round travels and when it stops existing. Its stepping is private and mutates the round in place, which the predicate has to deal with rather than duplicate — see *Where the code goes* |
| Effect resolution | `src/mission/combat.js` (`resolveHit`) | Defines what a hit actually does, which is how the blast exclusion below is decided |
| Deferred-action channel | `src/mission/locomotion.js` (the `SOLDIER` locomotor's pending-jump handling) | A decision taken outside the locomotor and applied on its tick. Ducking is the same shape and should follow it rather than invent one |
| The companion per-frame bridge | `src/mission/ai.js` (`updateCompanionSpec`) | Already the one place a companion's body is synced, aimed and stepped |
| The stance reset for non-controlled soldiers | `src/mission/mission.js` (`_updateSoldiers`) | Forces every squadmate to stand every frame today. The line the feature relaxes, and the only thing currently delivering the design's swap-away stand-up |
| The Speed stat | `src/game/soldiers.js` (`stats.speed`), displayed at `src/hub/hub.js` | Displayed on the roster line; read by nothing behavioural. D2 is its first consumer that changes play |
| Config schema | `src/game/config.js` (`SCHEMA`, "Movement / feel") | Repo convention: a new number is a schema entry, and the Behavior Lab surfaces this group |
| Aimed-fire scene — a gunner spec, a stepped `updateProjectiles` loop, standing-vs-kneeling damage | `test/crouch.test.mjs` | The only place in the suite where a soldier is shot at. Its fixtures are module-private today |
| Companion scene — agent, leader, hostile, `ctx`, stepped world | `test/companion-aim.test.mjs` | The only place a squadmate exists. It has **no incoming fire** — its hostiles are inert dummies and it never steps projectiles |

## Where the code goes

| Piece | Module | Notes |
|---|---|---|
| The duck predicate | `src/mission/combat.js` | It already owns how a round moves; a prediction living anywhere else becomes a second model that drifts from the first. The stepping inside `updateProjectiles` is private and mutates the round in place, so this slice has to lift a non-mutating step out of it and have both callers use it. That refactor is part of D1, not a follow-up |
| The reflex — scan, roll, hold | `src/mission/ai.js` | Beside `updateCompanionSpec`, the companion-only per-frame seam. Not in the spec runtime: spec bodies have no knee |
| The actuator — a crouch channel | `src/mission/locomotion.js` | The `SOLDIER` locomotor is the single actuation point for a companion body and stays so. It gains a third channel beside the move and jump it already translates |
| The knobs — hold duration (D1); chance curve and latency curve (D2) | `src/game/config.js` | "Movement / feel" |

**As built (D1): two knobs, not one.** `duckHoldTime` is the hold duration above,
and doubles as the off switch (0 = the reflex never fires, which is what the A/B
cases drive). `duckLookahead` (default 1.5s) bounds the forward walk: without a
cap the walk runs a round's whole remaining lifetime — up to 3s for a spore pod,
per soldier, per round, every frame — for a verdict that is nearly always decided
in the first fraction of a second. A round that needs longer than the lookahead
to arrive is never ducked.
| Tests | `test/crouch.test.mjs` for the predicate's geometry; `test/companion-aim.test.mjs` for both slices' behaviour | See *The test scaffolding does not exist yet*, below — this is not a free reuse |

### What the predicate must be told

The round's **team and owner**. `scene.projectiles` carries player rounds too, and
`updateProjectiles` decides who a round may hit from `p.team`, `p.owner` and the
friendly-fire config. Without that a squadmate ducks its own fire and the leader's.

### A round that never arrives must never produce a duck

A requirement of D1, not a refinement — a squadmate kneeling behind cover at a
shot that struck the cover is the most visible way this feature can look broken.

| Un-duckable when, before reaching the soldier, the round | Because |
|---|---|
| overlaps any platform | That is what kills it, so predicting with the same rule cannot disagree with what happens |
| runs out of lifetime | Same |

Both are stopping conditions on the forward walk the predicate already performs,
not separate passes. Terrain qualifies because it does not move: what blocks a
round at prediction time still blocks it on arrival.

**The walk has to reproduce the runtime's order** — advance, then expire, then
test terrain — or the two disagree on the final frame of a round's life, which is
the frame that matters most.

**Bodies are not blockers, neither friendly nor hostile.** A round without a
`pierce` effect does die on the first actor it hits, and with friendly fire on
that set includes enemies as well as soldiers. But any body in the line of fire
can step aside, duck, or be killed before the round arrives — so a soldier behind
one must stay ready rather than trust it. The cost is accepted and deliberate: a
soldier will sometimes kneel for a round something else absorbs. Being caught
standing because someone else was expected to take it is the worse failure.

**A straight line-of-sight test is not a substitute for the walk.**
`spore_wisp` lobs its pods under gravity, and a straight line is wrong in both
directions for an arc — it reports blocked for a round that clears the wall, and
clear for one that arcs into it. It is also unstable frame to frame as a round
rises past cover, which interacts badly with the one-verdict rule.

### Blasts are excluded, and the exclusion is a rule

`design/soldier-behavior.md` excludes "anything where getting smaller does not
help". A round carrying an `explode` effect is exactly that: the blast resolves by
centre distance from the impact point across every opposing actor, so a soldier
whose crouched box the round missed is still caught by a detonation on the soldier
behind them. **A round with an `explode` effect is never duckable**, whatever the
geometry says. This is a rule in the predicate, not an approximation — a purely
geometric predicate gets it wrong, and enemy emitter projectiles may carry effects
as authored data.

### The test scaffolding does not exist yet

Neither named suite can currently produce the situation this feature reacts to,
and the spec does not pretend otherwise:

| | |
|---|---|
| `test/companion-aim.test.mjs` | Has the squadmate, has no incoming fire. Its hostiles are inert dummies with no emitters, and it never imports or steps `updateProjectiles` |
| `test/reposition.test.mjs` | Same — no `combat.js`, no enemy rounds, and its only companion case is a `combat`-state climb, not escort |
| `test/crouch.test.mjs` | Has the firing gunner and the projectile step, has no companion. Its fixtures are module-private |

So D1 carries a real cost the Reuses table must not disguise: a firing enemy and a
projectile step have to be brought into the companion suite. Per `CLAUDE.md` that
still beats a new suite — the assertions belong next to the companion cases they
extend — but it is work, not reuse.

Conventions: no new dependencies, no `localStorage`, no rAF, every introduced
number in the schema.

## The seam

**This owns:** whether a squadmate is kneeling and for how long, and the verdict
attached to one round for one soldier.

**This must not touch:**

| | Why |
|---|---|
| `facing` | The locomotor is its single writer, and `sense.groundAhead` probes off it |
| `aimVec` | Owned by the bridge's aim pass, set every frame. A kneeling soldier keeps aiming |
| The controlled soldier's stance | Input owns it. The player is never ducked for |
| `Soldier.h` / `Soldier.y` directly | Only through `setCrouch`, which preserves the feet line |
| The companion brain's states | `src/game/companionspecs.js` stays untouched. Ducking is a reflex *below* the brain — a brain state would be entered and exited on the perception cadence, far too slow, and would fight `escort`/`combat` the way the old vertical band did (`tech/ranged-repositioning.md`) |
| Projectile state | Read-only. The predicate must not mutate a round it is judging — which is why the shared step has to be non-mutating rather than reusing the in-place one |
| Enemy bodies | Spec bodies have a fixed height. Giving them a knee is a separate spec |

**Three orderings this has to sit inside:**

| | |
|---|---|
| Soldiers update **before** enemies and projectiles (`src/mission/mission.js`) | A round is not in `scene.projectiles` on the frame it is fired, so the reflex never sees it that frame. D2's latency budget is measured on top of that lost frame, not from the muzzle |
| The companion bridge mirrors the body onto its agent at the **top** of the frame; the locomotor actuates later | If the crouch actuates in the locomotor, the agent's box is a frame behind the real one, so perception reasons about a standing box for a kneeling soldier. Either the mirror re-syncs after actuation or the stance applies before it — the builder picks, but it cannot be left unhandled |
| The unconditional per-frame stand-up is what makes swap-away work | `design/soldier-behavior.md` requires that a soldier the player leaves behind stands back up on the same tick, and `_swapControl` does nothing to stance — the forced stand in `_updateSoldiers` is the only thing delivering it. Relaxing that line means **this feature now owns swap-away stand-up** and must guarantee it. It is not a net that keeps working by itself |

## Must not regress

**Everything.** `node test/run.mjs` fully green is the bar for every slice — all
31 suites, no exceptions, no suite excused as unrelated. Bo's answer, verbatim.

Two consequences worth stating, because they are where "everything" usually gets
quietly downgraded:

| | |
|---|---|
| A changed golden is a regression | `test/locomotion.golden.json` and `test/levelgen.golden.json` are not files to regenerate when they disagree. A diff is a behaviour change to be explained and accepted before it lands, or reverted |
| A suite that looks unrelated still has to pass | Including the ones this spec touches nothing in. If ducking moves a number in campaign pacing or level generation, that is the finding, not the noise |

The suites below will bite first. They are the targeted guards, not the definition
of the bar.

| Suite | What it pins |
|---|---|
| `test/crouch.test.mjs` | Stance geometry, feet planted, the movement lock, crouch-is-not-immunity, an ally's shot clearing a kneeling head |
| `test/companion-aim.test.mjs` | A companion engages and shoots in 2D, and stops shooting on a cleared level |
| `test/locomotion-intents.test.mjs` | The intent seam — the targeted guard for the third channel |
| `test/reposition.test.mjs` | A repositioning companion still arrives |
| `test/behavior-lab.test.mjs` | The "Movement / feel" schema group, and a Lab agent on the soldier locomotor |
| `test/mission-enemyspec.test.mjs` | Missions run with the spec roster |
| `test/soldier-health.test.mjs` | Wounds and hit points |

`test/locomotion-characterization.test.mjs` and its golden are absent from that
table because they snapshot spec bodies and synthetic fixtures and will not
*catch* a fault in this feature. They still have to pass, like everything else.

## Approximations

| # | Where it is not exact | What catches the failure |
|---|---|---|
| 1 | **Arcs are sampled, not solved.** A round with gravity is stepped forward, so a coarse step can miss a graze at the edge of the box | Predicate cases at known trajectories in `test/crouch.test.mjs`, including the arcing pod `spore_wisp` fires |
| 2 | **Homing rounds are predicted as flying straight**, so a duck against one sometimes fails — as the design intends. This is reachable today: `hornet_smg` and `seeker` carry homing (`src/game/arsenal.js`) and become a threat to soldiers when friendly fire is on, and an enemy emitter projectile may be authored with a homing effect as data | Nothing asserts a homing round is dodged. Named so the failure reads as intended rather than as a bug |
| 3 | **Only rounds in `scene.projectiles` are scanned.** Entity-projectiles are not: the boss's wing seekers, and the five shards each seeker spawns when destroyed. Of the six ordinary roster enemies, five fire plain projectiles and `husk_charger` has no emitter at all — it is contact-only and nothing about ducking applies to it | Named here rather than fixed. Widening the scan is additive and needs no seam change |
| 4 | **A duck does interrupt escorting, and the route is discarded rather than resumed.** The escort track issues a move order with a wall-clock timeout that keeps ticking while the body cannot move, so a duck lasting a fraction of a second can expire the order and clear both it and the held route. The squadmate re-issues on the next loop, from where it now stands | **Nothing today.** `test/reposition.test.mjs` has no escort case and no incoming fire. D1 must add one. The accepted risk: a squadmate under sustained fire ducks repeatedly and makes little progress. Whether that reads as pinned down or as broken is a play question, and the hold-duration knob is the dial |
| 5 | **Grounded only.** A soldier in the air does not duck | Kneeling mid-jump changes the box without changing the trajectory, which reads as a glitch rather than a dodge |
| 6 | **One verdict per round *per soldier*.** A single round can threaten more than one squadmate, so the verdict cannot live on the round alone | Deliberate — re-judging across a round's flight turns a chance into a certainty |
| 7 | **Latency shows as a delayed snap, not as a soldier starting to move.** The stance is a two-state height swap with no transition, so a slow soldier stands through the delay and then drops, arriving late and getting hit. The design's reading — a slow soldier visibly caught out — survives; the in-between pose does not exist | Named. If the delayed snap does not read on screen, the fix is a stance transition, not a different latency curve |
| 8 | **Only companions on the spec brain duck.** `config.companionBrain` still has a `legacy` path with its own hand-written squad update that never touches stance, so a legacy squadmate simply never ducks — it cannot be left stuck kneeling. The obligation is the other way round: whatever replaces the unconditional stand-up must still stand a legacy squadmate up on swap-away | `test/companion-aim.test.mjs` exercises the spec path only. Legacy is a documented fallback, not a supported second implementation |

## How the stance already behaves

Background, not instructions.

Kneeling halves a soldier's height and shifts them down so the feet stay planted,
so a round aimed at standing centre passes over the crouched box. Enemies aim at
their target's *live* centre, which is why this works and also why it is not
permanent cover: a shot already in flight misses, the next is aimed lower.
`test/crouch.test.mjs` measures both halves today.

**As built (D1): a centre-aimed round does NOT pass over the crouched box.**
`STAND_H` 46 and `CROUCH_H` 22 put the standing centre 23px above the feet and
the crouched box's top edge 22px above them — one pixel apart — and a round's
box hangs *below* its aim point (`Projectile` takes a top-left). So a round
placed exactly on the standing centre lands on the crouched box too, and the
predicate correctly refuses it. What a knee actually answers is a round arriving
in the **top half** of the standing box, above the crouched head: the ±2° jitter
`patternAngles` puts on every `aimed` shot, fans, arcs, and any round whose aim
point went stale because the soldier moved. Under a stationary gunner's aimed
stream that is roughly half the rounds — enough that a squadmate spends most of a
sustained firefight kneeling, and takes ~20% less damage for it
(`test/companion-aim.test.mjs`). **Whether a knee should clear a centre-aimed
round is a design question, not a bug in this feature** — it is a `CROUCH_H`
question, and moving that number changes the player's crouch too.

The cost is modelled already — a kneeling soldier cannot run or jump, but can
pivot and fire. Nothing here adjusts that balance; it adds a second thing that
can decide to pay it.
