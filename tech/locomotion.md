---
type: tech
category: artificial-intelligence
status: built
resolution: sharp
tags: [ai, enemies, companions, refactor, movement]
---

# Locomotion

*One brain, many bodies*

Split agent movement into two layers so a single decision layer can drive any
body: the **brain** emits body-agnostic *intents* ("close the distance", "hold
range", "get up there"), and a **locomotor** — chosen by the body — decides how
that body actually moves (a legged body jumps, a flyer ascends, a Soldier
translates it into movement input, a future wheeled body finds a ramp).

This is the enabler for companions running the same intelligence as enemies (see
`tech/behavior-lab.md`) and the seam navigation (Behavior-Lab Slice 2) will sit
on: the brain picks *where* to go, the locomotor knows *how* its body gets there.
It is a behavior-preserving refactor first — enemies must move exactly as they do
today — then an extension.

## Where we are now

Movement lives entirely in `src/mission/enemyspec/runtime.js`, fused with
decision-making:

- `moveEntity(root, ent, dt, scene)` — resolves followers, then a `dash`
  override, then a `moveOrder`, then the standing `motion` controller
  (`applyMotion`), then integrates physics: `body.gravity > 0` → shared grounded
  integrator `stepActor`; `gravity === 0` → free integrate + clamp to the world
  box; then sets `facing`.
- `applyMotion` switches over the **10 controllers** (`MOTIONS` in
  `enemyspec/schema.js`): `static, velocity, gravity, moveTo, patrol, chase,
  keepDistance, home, orbit, hover`. Each writes `vx/vy` (or, for `orbit`/`hover`,
  sets position) directly.
- Discrete brain steps write the body too: `jump` sets `self.vy = -520`; `dash`
  branches on `flying` and sets a velocity burst; `moveTo` sets a `moveOrder`
  target point.

The body is decided by exactly one hardwired rule (`gravity` → grounded vs
flying), and body knowledge is smeared across the brain: `jump`'s impulse
magnitude, `dash`'s flying branch, and `chase`'s hardcoded obstacle hop
(`vy = -560` when the target is above or the entity stalls). Companions are a
different system entirely — `Soldier` objects moved by `updateCompanion` →
`Soldier.applyMovement(dt, move, jump)` in `src/mission/ai.js`.

## Target shape

Each frame the brain layer hands the locomotor exactly ONE **MotionRequest**, in
one of two families. The locomotor is chosen from the body and does NOT arbitrate
— it actuates whatever single request it is given.

**1. Steering intents** — body-agnostic goals; the locomotor decides *how* its
body satisfies them:

```
Intent = {
  kind:  "idle" | "seek" | "arrive" | "hold-range" | "retreat",
  point: {x, y} | null,       // resolved world target (the BRAIN resolves it, not the locomotor)
  speed: number,
  band:  {min, max} | null,   // hold-range only
  vertical: "none" | "gain",  // a HINT, not a command — replaces jump.vy and the chase hop
}
```

**2. Kinematic styles** — motion that IS a body behavior rather than a goal, so
the producing controller specifies it directly and the locomotor applies it
verbatim. These are flying-only (validation already gates them to
`gravity === 0`), so a legged or soldier body never receives one:

```
Kinematic = { style: "velocity" | "home" | "orbit" | "hover", ...params }
```

`orbit`/`hover` are position-authoritative (they compute an absolute position);
`velocity` is a set-once launch; `home` is turn-rate steering.

Target resolution (`resolveTargetPoint`, `nearestHostile`, offsets) stays in the
brain layer, so `point` is always concrete world coordinates and the locomotor is
purely mechanical.

```
Locomotor.apply(ent, request, dt, scene)   // turns one MotionRequest → actual motion
```

Locomotors (each owns its body's physics AND its traversal reflexes):

- **`legged`** — today's grounded path (`stepActor` gravity). `seek`/`arrive` set
  `vx` toward `point.x`; `hold-range` drives toward/away to hold the band;
  `vertical:"gain"` OR a stalled/blocked seek → a jump impulse (the `chase` hop
  lives here now — deciding *when* to hop to traverse is body knowledge). Ignores
  `point.y` except to decide jumps.
- **`flying`** — today's free integrator (no gravity). `seek`/`arrive`/
  `hold-range` steer `vx` AND `vy`; applies the kinematic styles verbatim.
- **`soldier`** — the companion body. Translates a steering intent into a `move`
  sign + `jump` bool and calls `Soldier.applyMovement(dt, move, jump)`; a brain
  `fire` step routes to the Soldier's *equipped-weapon* `fire(scene, s, dir,
  "player", …)`, NOT the emitter path (see L3). Never receives a kinematic
  request and never sets position. When the player controls this soldier the
  locomotor is skipped entirely and input drives it, preserving control-swap.

Full controller → request mapping (all 10 — this is the contract L1 must
reproduce):

| controller   | request                                                                   | body   |
| ------------ | ------------------------------------------------------------------------- | ------ |
| static       | idle (hard stop: `vx=0, vy=0`)                                            | any    |
| gravity      | idle (soft: `vx *= 0.8`/frame, gravity falls)                            | legged |
| moveTo       | seek → `resolveTargetPoint(target, offset)` at speed                     | any    |
| patrol       | seek → alternating point at `anchorX ± range/2`; wall-bump flips `patrolDir` | legged |
| chase        | seek → target; `vertical:"gain"` when target >40px above or horizontally stalled | any |
| keepDistance | hold-range(target, min, max, speed)                                      | any    |
| velocity     | kinematic `velocity` (launch set at instantiate)                         | flying |
| home         | kinematic `home` (turn-rate steering toward target)                      | flying |
| orbit        | kinematic `orbit` (position-authoritative)                               | flying |
| hover        | kinematic `hover` (bob + altitude-hold + drift)                          | flying |

Per-frame **arbitration stays exactly as `moveEntity` does it today**: an active
`dash` wins, else an active `moveOrder` (→ `arrive(point)` with timeout), else the
standing `motion` controller. dash / moveOrder / patrolDir / timeout state lives
on the entity as it does now; the brain layer reads it to pick the ONE request,
the locomotor stays stateless.

Likely home: `src/mission/locomotion.js` (a body-level module, not
enemyspec-specific, since Soldiers use it too), imported by the enemyspec runtime
and by the companion path. Tunable numbers (jump impulse, walk accel, dash speed
defaults) go in the config `SCHEMA` per the editor convention.

## Slices

Each is independently testable. L1 and L2 change no observable behavior and are
guarded by the characterization test L1 adds, plus the existing
`enemyspec-runtime` / `mission-enemyspec` suites.

**Slice L1 — Extract the Locomotor seam (behavior-preserving, enemies only).**
*Built.* `src/mission/locomotion.js` holds the `legged`/`flying` locomotors and
the MotionRequest vocabulary; `enemyspec/runtime.js` `moveEntity` now picks the
ONE request (`motionRequest` + `controllerRequest`) and delegates actuation +
physics + facing + jump/hop to the locomotor. Jump/hop impulses are config knobs
(`enemyJumpImpulse` 520, `enemyHopImpulse` 560) — **superseded 2026-08-08:**
`tech/agent-navigation.md` N2 collapsed both into one per-body number,
`body.jump` falling back to `config.enemyJump` (665), because two impulses that
disagreed made a jump envelope undefinable. Guarded by
`test/locomotion-characterization.test.mjs` (golden: `test/locomotion.golden.json`).
- **Step 0 — lock current behavior in a characterization test.** Add
  `test/locomotion-characterization.test.mjs`: instantiate the built-in roster
  (`enemyspecs.js`) + the motion templates (charger / shooter / flier / boss),
  sim each ~4s against a fixed scene, and snapshot every root's per-frame
  `(x, y, vx, vy, onGround, brainState.current)`. Land it GREEN on today's code,
  then refactor until the same snapshots still pass. **Seed `root.rng`
  deterministically right after `instantiate`** (it defaults to `Math.random`) or
  the snapshot is flaky — the utility brain and aim add `rng()` noise, though the
  motion controllers themselves do not.
- Add the `MotionRequest` types (Intent + Kinematic) and a `Locomotor` interface
  with `legged` and `flying` implementations that reproduce
  `moveEntity`/`applyMotion`/physics *exactly*, per the mapping table above.
- Refactor the 10 controllers to emit a `MotionRequest` instead of writing
  `vx/vy`; move physics integration, the jump impulse, and the `chase`
  obstacle-hop into the locomotors. Body → locomotor: `gravity > 0` = `legged`,
  `0` = `flying`. Keep arbitration (dash > moveOrder > controller) where
  `moveEntity` has it.
- Bar: the characterization snapshots and the full suite stay green — the roster
  (`cowardly_duelist`, `sky_duelist`, `iron_moth`) fights identically.

**Slice L2 — Body-agnostic brain intents (purge the body leaks).**
*Built.* The `dash` action stores a UNIT direction (`{ux, uy, speed}`) — no flying
branch — and the `burst` request lets each locomotor pick its axes (legged takes
the horizontal only). `jump` no longer carries `vy` (the body owns the impulse;
legacy `jump:{vy}` loads but is inert). `schema.js` docs/comments updated. The L1
golden still matches (both refactors are velocity-identical).
- Audit first: `grep` the built-in specs/templates for the leaked forms
  (`jump: { vy`, `dash` with explicit speeds) to size the migration.
- Remove hardcoded body knowledge from the brain: `jump.vy` → `vertical:"gain"`;
  `dash`'s flying branch → a body-agnostic "committed burst toward a point" each
  locomotor actuates its own way (the chase-hop already moved in L1).
- Update `enemyspec/schema.js` `vocabularyDoc()` + validation so authored specs
  express intents, not velocities. Migrate the built-in specs; `normalize.js`
  back-fills any old `jump:{vy}` / dash shape so existing custom/LLM specs still
  load.
- Bar: a brain spec makes no assumption about how the body moves; suite green.

**Slice L3 — The `soldier` locomotor (companions join the brain).**
*Built.* `doFire` now fires `root.team` (not hardcoded `"enemy"`). locomotion.js
gains a `SOLDIER` locomotor (steering intent → `move`/`jump` → `Soldier.
applyMovement`; brain `fire` → `self.fireWeapon`, the equipped-weapon `fire()`),
picked via `body.locomotor:"soldier"`. Perception adds `sense.anchorDist/anchorX/
anchorY` (leader) + an `"anchor"` move target. `src/game/companionspecs.js` holds
a default companion spec reproducing `updateCompanion`; `updateCompanionSpec`
(ai.js) bridges a Soldier to a `"player"`-team agent. Gated by
`config.companionBrain` (default `"spec"`; `"legacy"` restores `updateCompanion`
as a fallback). Guard: `test/locomotion-intents.test.mjs`.
- **Prerequisite fix:** `doFire` in `runtime.js` hardcodes projectile team
  `"enemy"` — change it to `root.team` so a spec-driven shooter respects
  allegiance (a latent bug now that Slice 0 added `team`; can land on its own).
  The `soldier` locomotor itself does not use emitters — it fires the Soldier's
  equipped weapon via `fire(scene, s, dir, "player", dt, aimAccuracy(...))`.
- Implement the `soldier` locomotor (steering intent → `move`/`jump` →
  `Soldier.applyMovement`; brain `fire` → the weapon `fire()` above), skipping the
  locomotor entirely when the player controls that soldier so control-swap is
  preserved.
- Run the agent brain (perception + decision, team `"player"` from Behavior-Lab
  Slice 0) over a `soldier` locomotor for companions. Add anchor-sense
  (`sense.anchorX/Y/Dist` = the leader) so a brain can express "stay near the
  leader".
- Author a **default companion spec** (JSON, same `EnemySpec` format) that
  reproduces today's `updateCompanion` (follow the leader, engage the nearest
  enemy in range, keep standoff), in a new `src/game/companionspecs.js` mirroring
  `enemyspecs.js`. Keep `updateCompanion` as the fallback until the spec is
  validated in the Behavior Lab, then retire it.
- Bar: companions behave at least as well as today, now on the shared brain; a
  smarter companion is then a data change, not code.

## Out of scope (later, pure additions)

`wheeled`, `limbed`, `crawler`, etc. are new locomotors added *after* the seam is
proven by its three real consumers (`legged`, `flying`, `soldier`). Each is one
module and zero brain changes — that payoff is the reason for the refactor, but
building an exotic body now would be designing for a hypothetical instead of
validating the seam against what we actually need.
