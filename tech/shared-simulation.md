---
type: tech
category: gameplay-systems
status: unbuilt
resolution: sharp
needs: [locomotion, mission-determinism, multiplayer-missions, behavior-lab]
related: [soldier-ducking, agent-navigation]
---

# Shared simulation

Extract the existing gameplay step for use by Mission and the Behavior Lab;
implements `design/shared-simulation.md` without adding new combat or AI rules.

## Slices

| Slice | Scope and acceptance | Runtime behavior |
|---|---|---|
| S0 — Characterize the boundaries | Extend existing mission/combat suites with focused encounters covering contact, projectile and burn deaths, root credit timing, reload and control switching, owner-specific feedback, and post-combat loot. Record expected ordering before extraction; retain existing goldens. Establish the current Lab navigation baseline. | Unchanged; tests only |
| S1 — Share damage and death | Extract the Mission damage/kill dispatch into host-independent gameplay handling. Retain EnemySpec damage/destroy cascades, immediate soldier death, attacker attribution, and distinct root settlement timing. Observe actual health/death transitions, including direct burn damage and runtime-internal deaths, without rerouting them through different damage semantics. Mission delegates to it; gameplay observations and cosmetic hooks are optional and cannot supply damage rules. | Unchanged; real missions exercise the extraction immediately |
| S2 — Share the authoritative step | Extract cooldown/reload advancement, control resolution, soldier updates, EnemySpec updates and root settlement, collision-list refresh, projectiles, statuses, and physical loot updates into one reusable ordered step. Mission supplies world-space commands and control state, then performs mission outcome checks afterward. Preserve all existing public Mission behavior for the server and tests. | Unchanged; no protocol, balance, navigation, or timing changes |
| S3 — Move the Lab onto that step | Replace the Lab's direct body mirroring/runtime/physics loop with the shared step. Preserve its explicit minimal navigation agent and click destination; use the shared soldier bridge with that configured spec, not a second Lab AI. Install real damage handling even though the default scenario has no enemies. Add headless matched encounters through both adapters, including combat, without adding combat UI. | Navigation scenario remains usable; scene setup and agent configuration explain differences from missions |
| S4 — Time, repeatability, and observation | Add minimal Lab pause/resume, single-step and repeat-scenario reset. Use fixed simulation steps for normal Lab playback, with no paused catch-up. Seed setup and gameplay explicitly; preserve edited terrain, chosen start, config and commands when repeating a scenario. Verify observation does not change results. | Lab time controls and reproducible reset become available; mission behavior remains unchanged |

- Each slice commits alone after the full bar passes. Do not bundle team
  generalization, goals, survival changes, or combat scenario editing into it.
- S2 is complete only when Mission delegates gameplay orchestration; a helper
  that calls back into Mission for actor updates is not a shared simulation.
- S3 is complete only when a Lab-model encounter can run real combat through the
  shared step without constructing a Mission. Default Lab UI remains navigation.
- The game and existing Lab are playable throughout. The first new user-facing
  capability in this refactor is S4's time/reset controls.

## Reuses

| Existing source | Reuse |
|---|---|
| `src/mission/mission.js` | Authoritative ordering, manual control, owner-to-leader mapping, damage dispatch, root settlement and loot updates; extract these rules rather than approximate them |
| `src/mission/combat.js` | Projectile stepping/collision, effects, homing, duck prediction and status updates; keep their existing semantics |
| `src/mission/ai.js` | Equipped-weapon firing, aim accuracy, companion reload/duck/aim bridge and legacy fallback |
| `src/mission/entities.js` | Soldier, loader, reload timers, actor physics, stance and loot bodies |
| `src/mission/enemyspec/runtime.js` | Spec updates, contact attacks, damage/death cascades and flattened collidables; no replacement brain |
| `src/mission/locomotion.js`, `src/mission/navigation.js` | Existing body actuation and navigation; no algorithm changes |
| `src/editor/tools/behavior-lab.js` | DOM-free model, destination command, navigation-only agent definition, graph/path overlays and terrain editing |
| `src/game/gen/rng.js`, `src/game/config.js` | Seeded randomness and shared live configuration; no Lab-only gameplay multipliers |
| `src/net/mission-wire.js` | Existing input, snapshot and feedback contracts; retain compatibility |
| `test/mission-trace.mjs`, `src/mission/checksum.js` | Scripted inputs and named gameplay sampling for equivalence checks |
| `test/mission-golden.test.mjs`, `test/mission-divergence.test.mjs` | Mission baseline, host-free equivalence, frame-rate and random-draw checks |
| `test/harness.mjs` | Existing DOM/canvas/storage stubs for adapter tests |

## Where the code goes

| Boundary | Location and responsibility |
|---|---|
| Shared simulation | A host-independent module under `src/mission/`; extract from `src/mission/mission.js`. Final filename is the builder's choice. Imports neither the Mission class nor editor/browser/server hosts |
| Combat dispatch | Share gameplay handling currently in `src/mission/mission.js`, reusing `src/mission/combat.js` and the spec runtime; preserve standalone effect callers |
| Transition reporting | `src/mission/combat.js` and `src/mission/enemyspec/runtime.js` also change health/alive state without Mission dispatch. Observe those transitions at their authoritative sites; do not assume Mission callbacks see every damage/death |
| Soldier bridge | Generalize the configuration seam in `src/mission/ai.js` so the existing Lab spec and default companion spec both use common body synchronization, weapon binding and stepping ownership |
| Mission adapter | `src/mission/mission.js` retains presentation, input translation, mission resolution, extraction and campaign results; delegates simulation |
| Lab adapter | `src/editor/tools/behavior-lab.js` retains setup/editing, scheduling, controls and rendering; delegates simulation |
| Regression cases | Extend `test/combat.test.mjs`, `test/mission-golden.test.mjs`, `test/mission-divergence.test.mjs`, `test/mission-ownership.test.mjs`, `test/mission-net.test.mjs`, and `test/behavior-lab.test.mjs`; reuse neighboring fixtures |

No new dependencies, storage format, scheduler inside the simulation, or generic
event framework. Preserve existing shared configuration reads; any new tunable
must use the schema. This extraction does not make simultaneous worlds with
different global config values a supported feature.

## The seam

### Inputs, state and observations

| Concern | Contract |
|---|---|
| World | Use the existing scene and entity identities, arrays, spec trees and navigation state; do not serialize/clone the world between steps |
| Commands | Hosts sample devices once per simulation step and translate camera-relative aim into world coordinates. Shared code applies movement, aiming, firing, reload and swap semantics; consuming an input edge twice is forbidden |
| Control | Preserve owner membership, stable soldier IDs and current control mappings. Owner is not team or authority. Two allied commanders retain distinct escort leaders. Manual control and AI-driven leadership remain distinct |
| Scenario configuration | Explicitly configure the Lab's minimal navigation agent versus mission companions; no `isLab` combat/physics branch or alternative damage callback. The same configured agent must behave identically through either host |
| Randomness | All gameplay draws use the scene stream, including lazy companion creation. Preserve draw order. Seed Lab loading, initial placement and spec construction; reset builds fresh runtime objects and streams, including weak sets and timers |
| Time | One positive elapsed simulation step advances all gameplay exactly once. Pause does not invoke a zero-duration step: frame-counted actions can advance even at zero elapsed time |
| Gameplay reports | Report applied damage and deaths without delegating rules to observers. Keep immediate entity death distinct from once-per-root settlement. Reports identify actor and attacker; observers cannot mutate simulation state or consume its RNG |
| Feedback | Preserve sound/spark/burst hooks and Mission's feedback funnel, including cause and private-recipient semantics. Capture cause at emission, not after the actor loop; cosmetic outbox limits must never drop gameplay credit or loot |
| Rendering | No renderer advances timers or decisions. Graph/path inspection may populate a derived cache only if its contents and creation cannot change simulation outcomes |

### Required ordering

| Order | Existing semantics to preserve |
|---|---|
| 1 | Advance soldier fire cooldowns, muzzle timers and reloads before control switching, including current dead-body timer behavior |
| 2 | Resolve manual and dead-leader swaps per unresolved commander; preserve stable IDs and existing swap stance behavior |
| 3 | Iterate soldiers in current array order. Apply manual input or the selected shared AI bridge, then integrate each living Soldier once. Preserve per-actor feedback cause and jump/landing detection |
| 4 | Update living enemy roots using the existing runtime. Do not independently integrate bodies already integrated by their locomotor or update companion mirror agents again as enemy roots |
| 5 | Settle uncounted dead roots, award current kill credit/drop behavior, then rebuild the flattened damageable enemy list before projectile collisions |
| 6 | Advance projectiles, resolve effects and remove dead rounds |
| 7 | Advance statuses using the existing damageable lists and burn-kill behavior |
| 8 | Advance loot physics and contested pickup; collection remains attributed to owner and soldier |
| After step | Mission checks extraction/wipe and applies results/removes extracted squads; camera and presentation remain host work |

- A projectile or status death after root settlement is settled on the next
  update, as today. Do not move loot/kill credit to the immediate death callback.
- Preserve spec cascades and the current host's handling of dead roots and spawned
  children; this refactor is not a fix to their lifetime policies.
- Keep burn's current direct health decrement and kill dispatch; routing it
  through ordinary hit damage would introduce different damage events/feedback.
- Reports cover burn health changes and runtime-internal death paths (TTL,
  terrain collision, contact self-destruction, destroy actions and child cascades)
  as well as Mission dispatch. Emit once per actual alive-to-dead transition;
  an already-dead entity is not a new death. Keep cause/attacker absent when the
  existing path has none, and preserve destroy-event/cascade ordering. Observation
  must not introduce spec damage events for burn or destruction callbacks for a
  child whose existing cascade simply marks it dead.
- Sound is optional in a bare simulation. Missing cosmetic hooks cannot prevent
  damage, death, movement or loot settlement.

### Host boundaries

| Host | Preserved boundary |
|---|---|
| Mission | Banner timing, completion callbacks, camera and audio playback stay outside the shared step. Extraction mutates the scene only at its existing post-step boundary |
| Server | `server.mjs` continues sampling and updating a canvas-less Mission at its current cadence. No server-loop or protocol redesign is required |
| Network viewer | The existing remote early return remains ahead of all gameplay stepping. Receiving a snapshot must not trigger a second simulation, reload tick or damage event |
| Lab | Current click destination stays a navigation controller command, not the future goal/order system. Default scene remains one agent with no enemies; shared combat is exercised through model fixtures |
| Lab clock | Normal playback uses the same fixed-step size as missions; pause discards pending wall-time catch-up, single-step performs exactly one tick, resume resets its wall-clock reference |
| Lab reset | Retain a scenario descriptor, including current terrain edits, initial agent setup, explicit config and seed. Runtime instances are reconstructed; the New Level control still creates a different scenario |

The Firing Room already reuses combat/effect functions. Migrating its separate
editor workflow onto the full simulation is outside this contract; preserve its
existing combat exports and behavior.

## Must not regress

The full `node test/run.mjs` bar must pass before every slice commit. Existing
goldens must not be regenerated to approve the extraction. Compare the working
tree baseline before editing; unrelated changes and failures stay explicitly
identified rather than being silently blessed or reverted.

| Guard | Coverage and required additions |
|---|---|
| `test/mission-golden.test.mjs`, `test/mission.golden.json` | Existing trace, frame rates and headless Mission. Add Mission-versus-shared-step comparisons before mission completion |
| `test/mission-divergence.test.mjs` | Random-draw order and same-runtime determinism. Compare with observers enabled/disabled |
| `test/mission-ownership.test.mjs` | Per-owner input, leadership, independent extraction/wipe and contested loot. Add extraction followed by further shared stepping for remaining owners |
| `test/mission-net.test.mjs` | Wire inputs, snapshots, remote non-simulation, cause/private feedback and real server/two-seat flow. No weakened assertions if a wrapper moves |
| `test/combat.test.mjs`, `test/mission-enemyspec.test.mjs` | Effects and enemy integration. Add shared-dispatch soldier death, burn death, part/root cascades and exactly-once root settlement/credit cases |
| `test/companion-aim.test.mjs`, `test/crouch.test.mjs` | Actual weapon/aim behavior, duck chance/latency, stance and swap-away handling |
| `test/behavior-lab.test.mjs` | Existing navigation, overlays and terrain editing. Add matched Lab-model/Mission combat, reset/replay and pause/one-step checks |
| `test/locomotion-characterization.test.mjs`, `test/locomotion-intents.test.mjs` | Integration/actuation stability; no double body step or changed movement priority |
| `test/docs.test.mjs` | Documentation structure and citations; not proof of gameplay equivalence |

### Equivalence must be exercised, not inferred

- Build independent scenes with identical config, contents, command sequence,
  step durations and seeded initialization order. Step through the actual Mission
  and Lab-model adapters; comparing two calls to one helper alone misses adapter
  omissions.
- Use `src/mission/checksum.js` for diagnostics, supplemented with assertions for
  omitted state: reload timers/spares, cooldowns, burn/slow, shove, duck scheduling,
  control/leader IDs, navigation/brain commitments, and ordered gameplay reports.
  A matching checksum alone is not complete equivalence.
- Require non-vacuous encounters: firing, hits, death and subsequent steps, plus
  movement and reload. Separately pin root settlement and loot timing.
- Compare complete damage/death reports for burn ticks, TTL, contact/terrain
  destruction and child cascades; verify exactly-once reporting without adding
  spec callbacks or changing downstream gameplay.
- Assert no state or RNG progress during pause, exactly one tick on Step, and no
  backlog burst on resume. Compare a reset replay after terrain edits and identical
  tick-indexed commands. Recording/editing a general replay UI is not required.
- Compare gameplay and RNG draws with graph/path drawing and report collection
  enabled versus disabled; presentation randomness is excluded.
- Existing hosts are imported by tests. No planned slice is entirely beyond the
  automated bar, but rendered appearance, audible timing, pointer usability and
  perceived multiplayer responsiveness still require browser play checks.
- Serve-check new modules and changed host pages; manually verify mission control
  switching and Lab click/drag/pause/step/reset with overlays visible.

## Approximations

| Limit | Consequence and guard |
|---|---|
| Existing numeric physics | Equivalence is tested in the same JS runtime with identical steps; cross-engine bitwise lockstep is not introduced. Preserve the existing golden tolerance |
| Existing two-side combat | Player soldiers versus EnemySpec opponents remains the supported combat model. Arbitrary soldier teams are explicitly separate in the design |
| Config is currently shared mutable state | Equivalent runs pin the same effective configuration and changes at the same ticks. Snapshot scenario config for repeatable Lab reset; do not redesign every config consumer |
| Loader/setup consumes randomness | Matching only a seed after different construction sequences is insufficient. Reuse the same construction order and fresh streams in paired fixtures |
| Minimal Lab agent | Navigation-only behavior is authored scenario data and remains the default. Combat equivalence fixtures explicitly use mission-equivalent companions and enemies; no combat UI is claimed |
| Lab render cadence changes | S4 replaces its variable clamped elapsed step with fixed steps. Exact old frame-dependent trajectories are not promised; navigation capabilities remain guarded, and mission timing is unchanged |
| Finite tests and samples | Existing traces cannot cover every encounter or latent timer. Focused boundary cases supplement the golden and visual checks; no claim of formal equivalence |

No gameplay-design deviations are proposed. New Lab combat controls, generalized
teams, persistent goals and new survival decisions remain separate as the design
contract specifies.

## Spec validation

- On 2026-09-08, the standard runner stopped before loading suites on Windows:
  its absolute-path dynamic import is not a file URL. An uncommitted temporary
  copy changed only that import to a file URL and ran all 39 suites.
- First run: 2,677 assertions passed; `test/mission-net.test.mjs` failed
  "drive: and not the one who did not". Full rerun: 2,678 passed, none failed.
  This records an intermittent baseline failure, not a fix or a waiver for future
  slices. The temporary runner was removed; no tests or goldens were changed.
- Both documentation files returned HTTP 200 in a local serve check.
