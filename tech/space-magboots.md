---
type: tech
category: gameplay-systems
status: unbuilt
resolution: sharp
needs: [space-prototype]
related: [space-prototype]
---

# Space prototype — magnetic boots

Magnetic boots let a soldier in the space prototype (`tech/space-prototype.md`) stand on a rock or a derelict and walk, jump and fall with gravity pulling toward its own feet.

**Where the requirements come from.** Bo's brief of 2026-09-30 and four answers he gave to questions. There is no design doc. Rows marked **B#** under "Placeholders" were invented so the mechanic can be built and played; Bo replaces them.

| Requirement | Source |
|---|---|
| Shift switches the boots on when the feet are within ⅓ of a body length of a surface, and that surface is inside a 90° arc at the feet | brief |
| With the boots on, the soldier is pulled toward the surface as if by gravity, and walks and jumps as under normal gravity | brief |
| A round asteroid can be walked all the way around | brief |
| A derelict hull can be walked all the way around as one continuous surface, including inside it and on every interior wall | brief |
| In the air, gravity pulls toward where the feet point, while a surface is near. Spinning the feet away from every surface, or leaving the boots' range, switches them off | brief |
| Once on, the boots hold within a larger range than the activation range, so a normal jump comes back down | answer 1 |
| Shift at any time while the boots are on switches them off, and the soldier floats again | brief |
| The jetpack does nothing while the boots are on | brief |
| While on a surface, the camera turns so the surface is down on screen | answer 2 |
| Boots on: A/D walk and Space jumps; fire is the mouse only. In the air A/D spin the body | answer 3 |
| Standing on a rock carries you with its drift and spin. Your weight, walking and landing do not push it | answer 4 |
| A running jump coming back down only on big surfaces is fine | Bo, on B1 |
| No mirroring: a floating soldier is a rigid body that can be upside down | Bo, on B8 |
| Two-breach hulls stay, joined by a jump | Bo, on B7 |

## Slices

Each slice is one commit on branch `space-prototype`. The prototype is its own page, so no slice changes the game. `test/space.test.mjs` plus playing it guard every slice.

| # | Slice | Runtime change | Playable result |
|---|---|---|---|
| M0 | **The sim owns which way is up.** Today the figure's mirror (`dir`) and its flip band live in the view: `figurePose` in `src/space/view.js`, remembered per model in `src/space/view3d.js`. The sim has only `angle`, so it cannot say where the feet are. Move `dir` onto the soldier in `src/space/sim.js`, with **up = dir × (facing turned 90°)** as the one definition every later slice reads. **Who may change `dir`** is the rule that matters, because gravity follows it. **The band rule is deleted (Bo: no mirroring)**: a floating soldier is a rigid body, and turning a full circle takes it upside down and back. **The one thing that flips `dir` is turning round to walk the other way on a surface** (M1), which reverses facing and keeps up, so you walk off the other way rather than backwards. A spin, floating or in the air with the boots on, turns facing and up rigidly together. The feet point is at the collision radius `r` (18) along down, not at half the figure (21): contact, snap and the ⅓ rule all measure from there, and the view shifts the figure 3px up while the boots are on so the drawn feet meet the surface. The figure's length (42) moves into the sim's `CFG`, because "⅓ of a body length" (14px) is a rule now | Yes, visually: a floating soldier facing left is now upside down instead of mirrored. Nothing in the sim's motion changes | Spin freely |
| M1 | **Boots on asteroids.** A state on the soldier: floating, boots-airborne, or boots-grounded (on one named rock). **The feet wedge**: the ±45° wedge about down, from the body's centre. It is tested **exactly**, not with rays: for a circle, the nearest point of the circle inside the wedge (the centre direction if it is inside, else a wedge edge ray). **Activation**: Shift while floating, if a rock's nearest in-wedge point lies within 14px of the feet. **In M1 only rocks count**, so no one can switch the boots on against a wall they cannot yet land on. **Airborne**: gravity 2000px/s² along down (**B1**), A/D spin at the float turn rate, W does nothing. Every step a surface must lie within the hold range in the wedge (**B2**), or the boots switch off and the soldier floats on with its velocity. **Contacts with the boots on are the boots' own, never `collide`**: a booted soldier is one-sided against rocks. It is pushed out and loses its into-surface velocity (no bounce), and the rock gets **no impulse**. That is answer 4 applied to landing and bumping, not just to standing. A contact whose normal is within ±45° of up **lands**: grounded on that rock, velocity = the rock's surface velocity there. **Grounded**: kept in the collision list, so other rocks can still hit it, but **not displaced by `integrate`**, and not counted in its substep speed. After `integrate` has moved its rock this step, it is carried by the rock's displacement and rotation, walks (A/D toward 320px/s at 2600px/s², stopping at 3000px/s²), and is snapped to feet-on-surface. Up = the surface normal; facing = the walk direction, and turning round mirrors `dir`. **`vx/vy` hold its true world velocity** (surface velocity + walk), because companions match the leader's velocity and the jump inherits it. **Detach**: a knockback, or a push from another rock that leaves it beyond the snap tolerance, makes it airborne with the boots on. **Jump**: Space, from the world velocity + 700px/s along up. **Off**: Shift, from either boots state. **Swap**: swapping away from a booted soldier switches its boots off (companion AI only floats); uncontrolled soldiers never use boots. **Input**: Space arrives in the input separately from the mouse, and the sim decides: fire while floating, jump with the boots on, never fire with the boots on. The mouse always fires. HUD readout (**B6**) | Yes, for the soldier you fly. A soldier that never presses Shift is unchanged | Walk around rocks, jump, fall back, spin off into space |
| M2 | **Derelicts as one surface.** Ruin walls join the feet wedge (a segment is clipped to the wedge, exactly), activation, landing and grounding. A ruin's walkable surface is the edge of the union of its wall capsules. Walking follows it round a plate's rounded end, and so through a breach or the bulkhead door onto the other face; at an inside corner, up turns from one wall to the next. The snap projects onto the nearest wall and then resolves the others, so an inside corner cannot push the feet into the second wall. Contacts with walls follow M1's rule (walls do not move, so there is no impulse question) | Yes, for boots on ruins | Walk the hull outside, in through a breach, round every inside wall |
| M3 | **The camera turns to your feet.** While grounded, the view's roll eases toward the soldier's up (**B3**). Airborne with the boots on, it holds the roll of the surface you left and does not follow a spin. When the boots switch off, it eases back to world-up. It is view-only state, like zoom. Everything that maps between screen and world takes the roll: the 3D camera's up vector, the 2D overlay transform, the edge arrows, mouse aim in `src/space/main.js`, and sound pan in `src/space/audio.js`. The HUD stays screen-fixed. While floating the roll is back at world-up, so the M0 band rule matches what the player sees | View only | Walking round a rock turns the world, not you |
| M4 | **How it looks and sounds.** On a surface the figure stands (no trailing-leg kick) and strides while walking, a copy of the game's stride. Up changes instantly at an inside corner in the sim, but the figure's turn is eased in the view. Boot soles glow while the boots are on. Sim events for boots on/off, jump, land and footsteps, played by `audio.js` | View and audio only | Readable and audible |

**As built, M1.**
- **Walk speed is measured at the body's centre**, not the feet. On a rock of r 120 the centre circles at r + 18, so the soles move about 13% slower than 320px/s. At a wall end in M2 the feet barely move while the body swings round, which is why the centre is the one to measure.
- **The standing jump's apex is 117px**, not 122. The fixed step applies gravity before motion, which loses about v·dt/2 ≈ 6px. The takeoff spot is hit exactly.
- **A booted soldier against a ruin wall** uses `collideWall` with restitution 0. Walls do not move, so that is the one-sided contact already. A standing soldier pushed by a wall counts the push towards the snap tolerance.
- **The HUD line** sits above the weapon panel, and the key hint at the bottom right changes while the boots are on.

M1 is the first playable slice. Every slice lands alone: M0 changes only how a floating figure is turned, M1 needs only rocks and cannot reach walls, M2 adds walls to a working mechanic, and M3 and M4 touch only the page side.

## Reuses

| From | What |
|---|---|
| `src/game/config.js` | Copied values: `gravity` 2000, `runSpeed` 320, `jumpSpeed` 700 |
| `src/mission/entities.js` | `SOLDIER_TUNING`: ground accel 2600 and friction 3000, copied, so walking has the game's ramp and stop |
| `src/mission/view3d/soldier.js` | The stride (`sin(t·16) · w · 0.12` on the near and far legs), copied for M4 |
| `src/mission/camera.js` | `solveCamera3D`'s invariant (the z=0 slice is the 2D view), already copied in `src/space/view3d.js`; M3 adds a roll to it |
| `src/space/sim.js` | `closestOnWall` for the ruin surface and its normals, `segCircle` for the wedge's edge rays against a circle, `shove` for detach, the event list for M4's sounds. `collide` is deliberately **not** reused for booted contacts |
| `src/space/view.js` | `cameraFor`/`zoomBy`, which M3 extends with roll; `figurePose`, whose band rule M0 deletes |
| `src/space/audio.js` | Event → procedural sound, with spacing, for M4's new events |

## Where the code goes

| Path | Holds |
|---|---|
| `src/space/sim.js` | The boot states, the wedge test, airborne gravity, booted contacts, grounded carry-walk-snap (run after `integrate` in `step`), and `dir`. DOM-free and seeded, like the rest of the sim. If it splits (it is past 1,300 lines), the boots module takes geometry from a leaf module and never imports `sim.js` back |
| `src/space/view.js` | Camera roll (easing, the overlay transform, screen ↔ world with roll), the edge arrows under roll, the HUD boot readout. `figurePose` becomes a read of the sim's `dir` |
| `src/space/view3d.js` | Roll on the 3D camera; the figure from the sim's `dir`/up with no pose state of its own (M0); the 3px feet shift; standing and striding pose, eased turn and boot glow (M4) |
| `src/space/main.js` | Shift as a press. Space sent as its own held and press flags, apart from the mouse's `fire`/`firePress`. Aim through the rolled camera |
| `src/space/audio.js` | Sounds for the M4 events, and pan under roll |
| `test/space.test.mjs` | Every slice's cases, in the existing suite |

## The seam

Same as the prototype's: the sim ↔ page split. The per-step input gains `boots` (Shift press) and `space`/`spacePress` (Space held and pressed). `fire`/`firePress` become the mouse alone. Every existing test fixture sends `fire`/`firePress`, and those keep their meaning. Roll is page state and never enters the sim; aim reaches the sim as world coordinates, as today. Nothing here touches the game, and `src/space/` still imports nothing outside itself except `three` in `view3d.js`.

## Must not regress

| Guard | How |
|---|---|
| The game | The isolation scan in `test/space.test.mjs` |
| The bar | `node test/run.mjs` green |
| Floating | Every existing S1–S6 case passes unchanged. A soldier that never presses Shift steps identically, bit for bit, to before (determinism case with the same seed and trace) |
| M0 | Read from the sim: the figure faces where the jetpack pushes, and a full 360° spin, floating or booted, never flips `dir` (the head goes round with the body) |
| M1 | Activation only within 14px and only inside the wedge, rocks only. Grounded on a still rock, walking keeps the feet on it (centre distance = rock r + 18, within 1px) at the walk speed. On a drifting, spinning rock, a still soldier keeps its spot relative to the rock, and its `vx/vy` equal the rock's surface velocity there. A standing jump returns to its takeoff spot with an apex of 700² / (2·2000) ≈ 122px, within a few px. Landing on a small rock (r 30) at jump speed leaves the rock's velocity unchanged. Spinning the feet away mid-jump switches the boots off and keeps the velocity. W with the boots on adds nothing. Space with the boots on never fires, and the mouse always does. Shift switches off. Swapping away switches off. Determinism with a boots trace |
| M2 | On a one-breach ruin, walking one way passes both faces of every wall and returns to its start, never entering a wall, never beyond the snap tolerance. On a two-breach ruin, each piece is covered the same way |
| M3 | Screen → world → screen round-trips under any roll and zoom. The screen centre maps to the camera centre. Roll 0 is today's mapping exactly |

## Approximations

| Real or asked | Built |
|---|---|
| Gravity "as if gravity were acting" while standing | Gravity is simulated only in the air. On a surface the soldier is carried and snapped (kinematic), which is what lets it round a wall end, a curve of radius 6 + 18 = 24px, at walk speed. Holding a 320px/s body on that curve would need 320²/24 ≈ 4,300px/s², over twice gravity. Caught by the M2 walk-round test |
| A running jump comes back down (answer 1) | Only for a **standing** jump, or on a big surface (Bo: fine). Airborne gravity points along the feet, a fixed direction, not toward the rock. A running jump carries you about 450px sideways (320px/s over a 1.4s flight), past the edge of any rock under about r 150, and the wedge then loses it and the boots switch off |
| A derelict walked "as one flat plane", all the way round | The surface is the union of the ruin's walls. A hull with **one** breach is one connected piece: a single walk covers every face, inside and out. A hull with **two** breaches (40% of them: the second is rolled half the time and misses the first edge 4 times in 5) is two pieces with a 78px gap, face to face. Each piece is walked all the way round; crossing the gap takes a jump (Bo: fine, B7) |
| The rock you stand on | Its collision circle, not the bumpy 3D mesh (`verts` 0.9–1.05 × r). The feet can float up to 10% of r above the drawn surface, or sink up to 5% of r into it |
| An inside corner | Up changes instantly in the sim, and the view eases the turn (M4) |
| Companions | Never use boots. Swapping away from a booted soldier switches its boots off |
| Surfaces | Rocks and ruin walls only. Not the map edge, enemies or mines |
| Knockback on a grounded soldier | Throws it airborne with the boots on, and gravity brings it back |
| Camera roll and the map edge | The view is clamped to the map by its unrolled rectangle, so a rolled view near the edge can show a little past it |

## Placeholders — invented for a playable build, for Bo to replace

| # | Question | Stand-in |
|---|---|---|
| ~~B1~~ | ~~In the air, along the feet or toward the surface?~~ | Decided: along the feet |
| B2 | Hold range once the boots are on | 200px from the feet, inside the wedge (a full jump rises about 122px) |
| B3 | Camera roll speed; what it does in the air and when the boots switch off | Eases over about 0.2s. Holds in the air; eases back to world-up when the boots switch off |
| B4 | Aim on a surface | Unchanged: 90° about facing, and facing is the walk direction, so you cannot aim straight up off a rock without jumping and spinning |
| B5 | W with the boots on | Does nothing |
| B6 | Telling the player the boots can switch on | A HUD line: "BOOTS: in range" / "ON" / nothing |
| ~~B7~~ | ~~Two-breach hulls~~ | Decided: kept, two pieces joined by a jump |
| ~~B8~~ | ~~Can a floating soldier turn upside down?~~ | Decided: yes, no mirroring. Turning round on a surface is the one flip |
| — | Numbers | Activation 14px (⅓ × 42) from the feet at r 18; gravity 2000; walk 320 (accel 2600, friction 3000); jump 700; snap tolerance 12px; wedge ±45° |
