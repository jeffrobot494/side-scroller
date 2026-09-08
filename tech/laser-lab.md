---
type: tech
category: development-tools
status: proposed
resolution: sharp
tags: [weapons, simulation, editor]
---

# Laser Lab

## Current revision: behavioral tradeoffs (catalog 4)

Implemented according to [the tradeoff plan](laser-lab-tradeoffs-plan.md). Three discharge mechanisms (pulse, release-to-fire charge, continuous beam), three physical beam widths, and separate battery/capacitor/charged-shot energy stores are now live. Catalog 4 exports mechanism and beamWidth in addition to size and component references. Capacitor capacity is 10 times the earlier pulse-energy figure; capacitor mass is now 1.5 kg × size scale × tier mass factor. These supersede earlier capacitor energy/mass rules.

Immediate pulse energy = min(40 × assembly scale, emitter maximum energy). Peak throughput = pulse energy × min(controller cadence, emitter cadence). Charged discharge reserves that throughput until release, up to min(4 × emitter maximum energy, capacitor capacity); continuous discharge consumes throughput per second. All convert energy using emitter efficiency and create waste heat. Battery transfer is constrained by power and free capacitor space including reserved charge. Capacitor begins empty. Canceling charge refunds reserved energy, while reset restores the battery.

Beam widths are 4/18/60 world units. Collision uses projected target diameter overlapping the beam cross-section; delivered damage is scaled by the intercepted fraction. This is a deliberately simplified geometry model, not optical physics. The nearest intercepted target blocks further targets, including when shielded. Optics retain angular error.

Scenarios: fast 7-unit-radius drones with 45 HP; targets shielded except for 0.65 seconds every 3 seconds, staggered by target; moving 26-unit-radius targets with 2,500 HP. Existing calibration patterns remain. Presets choose pulse pistol/drones, charge rifle/windows, and tracking beam/durable. DPS includes time from charging or firing activation; continuous accuracy counts hit simulation samples. Thermal endurance remains an average estimate, not an exact prediction for charged discharges.

Regression checks: `node test/laser-lab-prototype.mjs`. Mechanical checks pass; player testing is still needed to establish balanced niches.

## Previous revision: sizes and pulse controller (catalog 3)

This revision supersedes capacitor cycling limits and the catalog-2 values below. Blueprints now export `size` (small, medium, heavy, extra-heavy), six component references including `controller`, and catalogVersion `laser-catalog-3`. No authored damage or firing-rate fields.

Assembly sizes: Small/pistol scales emitter energy limit, battery capacity/output, cooling capacity/dissipation, and their masses by 0.5; Medium/rifle by 1; Heavy/support weapon by 2; Extra-heavy/vehicle or robot by 5. Frames weigh 0.6/1.2/2.4/6 kg with assembly limits 5/10/20/50 kg. Emitter efficiency and cycling rate do not scale with size. The room still uses the soldier as a load demonstrator, including extra-heavy loads; no drivable vehicle is implemented.

Capacitor size is selected independently: Small 40 EU, Medium 100 EU, Heavy 200 EU, Extra-heavy 500 EU. Every size exists at every tier. Mass is 0.3 kg × size scale × tier factor (1, 0.8, 0.6). Tier improves mass only, not energy or rate. Controllers are Standard/T1 6 shots/s at 0.08 kg, Rapid/T2 12 shots/s at 0.12 kg, and High-frequency/T3 20 shots/s at 0.16 kg.

Shot energy = min(capacitor pulse, scaled emitter energy limit). Actual cadence = min(controller rate, emitter rate, scaled battery output / shot energy). A larger capacitor never raises the controller limit and may reduce achievable cadence. Controller upgrades never change damage per shot. All component masses affect movement and jumping. Presets choose Medium frames/capacitors and matching-tier components; component edits keep size and tier independent.

Verified in browser: changing the Burst controller from Rapid to Standard reduces cadence 12 to 6 shots/s while keeping 55 damage; a Small T2 capacitor gives 22 damage and retains the 6/s controller limit even with an Extra-heavy power supply.

## Previous revision: component-derived performance

The capacitor revision supersedes the adjustable energy/cadence controls and v1 blueprint settings described in the original plan below. The working prototype now uses catalog `laser-catalog-2`, adds a fifth component reference `capacitor`, and exports no `settings` block.

| Capacitor | Tier | Pulse energy | Cycling limit | Mass |
|---|---|---|---|---|
| Compact | I | 60 EU | 4/s | 0.05 kg |
| Pulse | II | 100 EU | 10/s | 0.08 kg |
| High-output | III | 160 EU | 14/s | 0.10 kg |

Energy per shot = min(capacitor pulse energy, emitter maximum energy). Firing rate = min(capacitor cycling limit, emitter cycling limit, battery output / energy per shot). Recharge time = energy per shot / battery output. Show both values as readouts and explain the limiting component. Capacitor mass participates in carry limits and movement; required tier participates in build availability. Apex weighs 8 kg including its capacitor.

This version models recharge as the interval between shots, with battery energy deducted on firing. It does not model a separately charged burst reservoir. Thermal lockout remains independent of the derived cold firing cadence. Verify Apex yields 160 EU and 11.25/s with its T3 battery, and 3.75/s with T1; swapping to a Field emitter caps energy at 100 EU.

## Purpose and deliverables

A standalone browser experiment for designing a pulsed laser rifle and testing it against moving targets. The central question: do power, heat, and mass create interesting weapon choices without arbitrary stat penalties?

The accompanying `../design/laser-lab.mockup.html` is an interactive UI prototype, opens without a build or account, and demonstrates derived statistics, tier restrictions, movement, aiming, hits, battery depletion, and thermal lockout. This document specifies the full test app. Features beyond the mockup are explicitly listed below; the prototype is not integration with the game's combat runtime.

## Experience

One screen contains a weapon workbench, a large firing room, and an engineering readout. The user selects a technology tier and starting build, chooses components, adjusts shot energy and requested firing rate, then aims and holds the trigger in the room. Every successful shot drains the battery and generates heat. Heat continues to dissipate between shots. Targets move, take damage, disappear on destruction, and respawn.

The first build is usable immediately. A powerful starter configuration heats faster than it cools, making its burst advantage apparent. A conservative build can fire continuously until its battery is exhausted. Later technology improves the tradeoff but does not give unlimited energy or cooling.

## Scope

Include one weapon family (pulsed, hitscan laser rifles), three technology tiers, component selection, derived performance, equipment mass limit, JSON blueprints, repeatable test sessions, and local persistence. Use abstract gameplay units: EU for energy, PU for EU/second, HU for waste heat, and kg for carry mass. No claims of real-world laser performance.

Exclude campaign progression, crafting inventories, multiplayer, procedural generation, external AI services, physical optics, atmosphere, continuous beam weapons, ballistics, armor penetration, and game integration. Technology tier is a manual laboratory selector representing future progression gates. No arbitrary free-entry damage, efficiency, mass, or cooling fields in blueprints.

## Component catalog, initial tuning

These are starting gameplay constants, versioned as `laser-catalog-1`.

| Component | Tier | Properties | Mass |
|---|---|---|---|
| Field emitter | I | 40% efficiency; max 100 EU/shot; max 12 shots/s | 1.4 kg |
| Refined emitter | II | 55%; max 140 EU/shot; max 14 shots/s | 1.6 kg |
| Precision emitter | III | 70%; max 180 EU/shot; max 18 shots/s | 1.8 kg |
| Light battery | I | 12,000 EU capacity; 600 PU output | 1.0 kg |
| Assault battery | II | 24,000 EU; 1,200 PU | 2.0 kg |
| Dense battery | III | 36,000 EU; 1,800 PU | 2.2 kg |
| Passive cooling | I | 100 HU/s dissipation; 1,200 HU headroom | 0.8 kg |
| Forced cooling | II | 200 HU/s; 2,000 HU | 1.6 kg |
| Advanced cooling | III | 320 HU/s; 2,800 HU | 1.8 kg |
| Field optics | I | 6 mrad maximum angular error | 0.3 kg |
| Precision optics | II | 2 mrad maximum angular error | 0.7 kg |
| Adaptive optics | III | 0.5 mrad maximum angular error | 0.9 kg |

The frame weighs 1.2 kg. Rifle carry allowance is 8.0 kg. Mass beyond the allowance makes a design unbuildable; valid assemblies also reduce avatar movement speed and jump height according to the mobility model below. A future actor system can supply a different mounting allowance. High-tier components remain selectable for inspection at lower tiers, but are visibly locked and prevent firing. Build validity, resource bottlenecks, and thermal status are separate messages.

## Model and derived statistics

Let E be energy per shot, R requested shots per second, efficiency η, battery output P, cooling C, thermal headroom H, and battery capacity B.

- Effective cadence F = min(R, P / E). Catalog maxima constrain R and E separately.
- Beam energy = E × η. Damage per hit = beam energy × 1 damage/EU, without random damage rolls or range falloff in this experiment.
- Heat per shot = E × (1 − η). One wasted EU maps to one HU by convention.
- Burst DPS = damage × F, assuming every shot hits.
- Sustained thermal cadence = min(F, C / heatPerShot). This is an engineering ceiling, not measured session DPS; lockout cycles can perform below it.
- Net heat/s = F × heatPerShot − C.
- Continuous approximation for cold-to-limit time = H / netHeat when netHeat > 0, otherwise “thermally sustainable.” Label this an estimate; discrete shots differ.
- Full-battery shots = floor(B / E). Ideal trigger time ≈ B / (E × F); heat may extend elapsed runtime.
- Mass = frame + all selected component masses.

No generator and no capacitor are modeled in v1. Battery capacity and output are distinct, but power limits cadence rather than enabling a hidden burst reservoir. Cooling is an effective component rating; its auxiliary draw is folded into catalog tuning for this experiment.

### Runtime order and boundaries

Use a fixed 1/120 second simulation step with a capped accumulator and a seeded random source. Pause on hidden tab or focus loss; do not simulate a backlog on return. Each step moves targets, dissipates heat, advances cooldown, checks release from lockout, then handles a requested shot. Cooling clamps at zero. A shot is allowed only when the build is valid, ammunition energy is sufficient, cooldown is ready, and the weapon is not thermally locked.

On firing, subtract E, add waste heat, create a brief beam, raycast targets, record damage, and set cooldown to 1/F. If the shot reaches or exceeds H, allow that shot and enter lockout. Prevent further shots until heat falls to 35% of H. Show “Cooling — trigger locked” and the recovery progress. Insufficient energy shows “Battery depleted”; cooling continues. Trigger release never replenishes energy. Reset range refills the battery, clears heat and metrics, restores targets and the deterministic seed.

## Weapon workbench

Show editable name, three starting presets (Field / Burst / Apex), technology tier, four component selectors, energy slider and cadence slider. Display selected component properties and required tier, not just names. Sliders have labels, units, keyboard support, and numeric readouts. Catalog-controlled limits update on emitter changes, clamping settings with a visible notification.

Always show damage/hit, effective cadence, burst DPS, estimated thermal endurance, mass/allowance, and power demand/output. When requested cadence exceeds output, state the actual cadence and that battery output is limiting it. Explain heat accumulation in one line. Invalid builds remain inspectable but cannot fire. Upgrade tier never automatically replaces components.

Changes stop the trigger and reset the test with a visible “Build changed — range reset” notice. The full app first captures the prior run for comparison if it has fired shots. Blueprint edits cannot mutate an active test halfway through.

## Firing room

A side-on test lane with a controllable soldier avatar, a carried rifle and moving muzzle, a reticle, range markings, and three unarmored targets. Pointer movement aims; hold primary pointer to fire. Capture the pointer during firing and release on pointerup, pointercancel, blur, or visibility loss. Touch uses the same interaction. Provide an accessible hold-to-fire button using the current aim and a keyboard-friendly “Track nearest target” assist toggle in the full app. Use A/D or left/right arrows to move and Space to jump. Do not intercept movement or jumping while editing workbench inputs. Provide touch buttons for left, right, and jump.

Target patterns: horizontal strafe, vertical hover, and static calibration. Targets start with 500 HP, radius 18 world units, respawn after 1.5 seconds, and do not attack. Full app offers speed and HP settings. The mockup offers the three patterns with fixed speed and HP. Use a 900 × 440 world independent of display size. Hitscan uses the nearest positive ray/circle intersection within the lane; no piercing. Angular error is uniformly sampled within the optics bound using a seeded RNG. The beam stops at the nearest hit, or the room boundary. Apply min(damage, remaining HP) to measured damage to exclude overkill.

The range shows heat, battery, weapon state, hits/shots, accuracy, total damage, measured DPS, and destroyed targets. Full app additionally graphs the last 20 seconds of heat and battery and measures per-target time to kill. Measured DPS uses simulation time since the first shot, including idle and cooling time until reset; label that definition. A zero-shot run shows zero rather than NaN. Pause freezes targets, heat, cooldown, and the measurement clock.

## Blueprint contract

```json
{
  "v": 1,
  "kind": "weapon",
  "family": "pulsedLaser",
  "catalogVersion": "laser-catalog-1",
  "id": "apex-rifle",
  "name": "Apex rifle",
  "components": {
    "emitter": "precision",
    "battery": "dense",
    "cooler": "advanced",
    "optics": "adaptive"
  },
  "settings": { "energyPerShot": 160, "requestedRate": 14 }
}
```

Technology unlocks belong to the lab/session context, not authoritative weapon data. Runtime battery charge, heat, and cooldown are instance state. Derived values are never trusted from imported JSON. Reject unknown keys, component IDs, non-finite or out-of-range numbers, unsupported versions, and wrong family with field-specific errors. Limit imports to 64 KB. A valid schema can still be unavailable at the selected tier or exceed carry mass.

Full app supports save/load/duplicate/delete in guarded local storage and import/export JSON. Failure to persist does not block testing; display “Could not save on this device.” Mockup exports the current blueprint only; it has no import or library. No external calls are required.

## Architecture

Keep catalog, blueprint validation, derived-stat calculation, and fixed-step simulation as pure independent modules. The browser UI renders those results. The room and workbench must call the same calculations. Provide injectable RNG and clock for repeatable tests. Use a small standalone entry point; do not change existing EnemySpec or weapon combat behavior.

The eventual shared content framework can reuse resource consumers, thermal stores, catalogs, validation, and blueprint references. This prototype should establish useful resource contracts before introducing a universal entity schema.

## Visual design and accessibility

Industrial instrument feel: graphite surfaces, pale text, mint laser accents, amber thermal warnings. Compact workbench at left; generous room at right; engineering calculations beneath the room. Text labels accompany every color-coded state. Thermal lockout is readable without flashing. Draw lasers as short, steady strokes; avoid screen shake. Respect reduced motion by starting the range paused. Responsive layout stacks the workbench above the range below 850 px; controls remain usable at 390 px. Native focus outlines, labeled inputs, semantic buttons, descriptive canvas fallback, and a restrained live status region are required. Announce state transitions, not per-frame meter changes.

## Acceptance checks

1. Changing E, R, or any component recomputes every displayed statistic from the shared model.
2. At E=100, η=.4, F=10, C=200, H=2000, estimated thermal endurance is 5 seconds. Discrete simulation reaches lockout within one shot interval plus one simulation step of that estimate under this starting convention.
3. A 600 PU battery and 100 EU shot limit effective cadence to 6/s even if 12/s is requested.
4. Battery loses exactly E per successful shot, never on blocked attempts, and never becomes negative.
5. Thermal lockout blocks shots and releases only at ≤35% headroom. Cooling and battery never fall below zero.
6. Tier I cannot fire an Apex build; Tier III can if it fits the carry limit. Locked components explain the required tier.
7. A ray cannot hit a target behind the muzzle or behind a nearer target. Misses still consume resources.
8. Target death excludes overkill from metrics and respawns after 1.5 simulation seconds.
9. Identical blueprints, seed, and trigger/aim timeline produce the same results independent of render rate.
10. Reset and build changes clear heat, charge deficit, target damage, seed, and session measurements. Pausing/blur cannot leave the trigger held.
11. JSON round-trip preserves the authored build; imported damage or invalid component data is rejected.
12. The standalone page works offline at desktop and narrow mobile widths without clipping controls or requiring game assets.

## Suggested implementation sequence

1. Review the interactive mockup and choose the feel of the defaults.
2. Extract and test the pure model, catalog, validation, and deterministic simulation.
3. Add session history, telemetry graph, accessible assisted aiming, and persistence/import.
4. Compare three presets in identical 30-second scenarios: damage, accuracy, cooling downtime, energy consumed, and mass. Tune constants until distinct builds have understandable advantages.
5. Only after that experiment, decide which resource components should move into the game's shared creation framework.

## Avatar mobility (implemented in mockup)

Total assembly mass M includes frame and all four components. Run speed = 300 / (1 + 0.12M) world units/s. Jump launch speed = 520 / (1 + 0.08M), with gravity 1,000 world units/s². Ideal jump height = launch speed² / 2,000. These deliberately exaggerated gameplay relationships make equipment tradeoffs noticeable. Display mass, run speed, and ideal jump height beside engineering results.

The avatar starts at x=120 with feet at floor y=380; horizontal bounds are 35–865. Integrate vertical velocity at the existing fixed step, clamp to the floor on landing, and allow one jump per press only when grounded. Rifle rotation follows pointer aim. Raycasts and beam visuals originate at the carried muzzle; each beam retains its shot origin as the player moves. Clear movement, jump requests, and firing on reset, pause, focus loss, and tab hiding. Blueprint/component changes reset the avatar along with the range.

Verify a half-second run covers more distance with Field than Apex, Field reaches a higher jump apex, both land exactly on the floor, reset restores position and clears held movement, and a moving player fires from their current muzzle.
