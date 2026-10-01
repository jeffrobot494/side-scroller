---
type: tech
category: development-tools
status: building
resolution: vague
needs: [space-prototype, space-magboots, space-troopers]
related: [space-prototype, space-magboots, space-troopers]
---

# Space prototype in first person

This is the plan for a second standalone page, `space3d.html`. It plays the space prototype's mission (`tech/space-prototype.md`) in full 3D, seen in first person, inside a cube of space instead of a square.

**Where the requirements come from.** Bo's message of 2026-10-01. There is no design doc. Bo said to fill gaps with best guesses, so every **F#** row under "Placeholders" is a guess for him to replace.

| Requirement | Source |
|---|---|
| A new version of the space prototype, in full 3D | brief |
| The same simple graphics | brief |
| First person | brief |
| The level is a cube instead of a square | brief |
| All the same mechanics: jetpack flight, crashes, the guns and their effects, derelicts, artifact and extraction, the squad and swapping, every enemy type including wardens and trooper pairs, waves, magnetic boots | brief |
| What matters most is the look and feel of jetpacking around and shooting over asteroids | brief |

## Slices

Each slice is one commit on branch `space-fps`. The page is its own, linked from nothing, so no slice changes the game or the 2D prototype. `test/space3d.test.mjs` plus playing it guard every slice.

| # | Slice | Playable result |
|---|---|---|
| F1 | **Flight.** The page, a fixed 60Hz step (the 2D page's accumulator and clamp), input sampled once per step with presses latched. Mouse-look deltas are consumed by the first step of a frame and are zero for the rest, so a frame that runs two steps does not turn twice. `world.events` is drained by the page after the views and sound have read it, as the 2D page's `view.js` does. Mouse look under pointer lock: yaw, pitch and a Q/E roll, all in the body's own frame, so there is no world "up" (**F2**). The jetpack: W pushes along the look at the 2D thrust, and S, A, D, Space and Ctrl push back, sideways, up and down at a fraction of it (**F3**). No drag, no cap. Asteroids are spheres, with the 2D mass rule (an area, `(r / soldierR)² × density`) so every push and bounce number carries over, drifting and spinning in a cube (**F1**), bouncing off each other with the 2D restitution, the cube's faces a bouncing wall. Bodies are spheres. Crash damage on the 2D rule: closing speed along the contact normal, nothing to 500, all HP at 1125. One soldier. The view: a camera at the soldier's eye, flat-shaded lumpy rocks, a star sphere, fog for depth, bloom. A HUD with HP, speed and a crosshair | Fly round rocks in 3D, crash into them |
| F2 | **Guns.** The squad's weapons and every effect in authored order (damage, burn, slow, knockback, explode, chain, pierce, pellets, homing), firing along the look with Aim spread as a cone (**F7**), magazines and reload. Rounds are swept segments, stopped by rocks, which they push; an explosive round detonates on a rock or a slab, as the 2D deviation does; explosions push rocks in a sphere. The 2D target dummies (`makeDummy`) come back as respawning drones near the start, so every effect can be seen before enemies exist; F5 sets their count to 0 in play and keeps them as a test fixture. A gun model in the corner of the view with a muzzle flash and kick, glowing shots, sparks and blast flashes. Sound: the 2D page's procedural sound, fed each event's position in the listener's frame | Shoot rocks, watch them drift |
| F3 | **Derelicts, artifact, extraction.** A derelict is the 2D layout extruded — `addDerelict` itself, run on a scratch 2D world at the origin, gives the hull, segments, openings, aft and rooms: the eight-sided hull, three bulkheads and the keel wall become walls of a height (**F4**), with a deck and a ceiling plate over the outline. Doors and breaches are holes in walls (**F4**). Each derelict has its own random 3D orientation. Every wall, deck and ceiling is a slab whose corners are rounded by its half-thickness, so a sphere's contact is one closest-point test. Rounds and lines of sight stop on them. The artifact sits in the aft room of one derelict, extraction is a sphere at least half the cube away from the start, and win and lose are the 2D rules. Enter restarts once the mission has ended | The whole objective loop with no enemies |
| F4 | **Magnetic boots.** Shift clamps on when a surface is within 40px (**F12**). With the boots on in the air, gravity pulls toward the nearest surface and the body turns its feet to it at the 2D turn rate; with no surface within 200px (`bootsHold`) the boots let go. The jetpack does nothing with the boots on. A booted contact is one-sided: no bounce and no impulse to the rock. A shove, or a push past `snapTol`, knocks a standing body off, and a rock that runs into a standing body crashes into it. Landing feet-first is safe up to 750. Standing: up is the surface normal, the mouse yaws about it and pitches the head (clamped short of straight up and down), WASD walks on the surface, Space jumps. A rock carries you as it drifts and spins. On a derelict you walk over edges and up inside corners, onto the next slab. The camera rolls to the new up over a moment rather than snapping | Land on a rock, walk round it, jump off |
| F5 | **Enemies, waves and squad.** Charger, gunner, swarmer, mine-layer, mine and warden, with the 2D numbers and behaviour turned into 3D. A gunner's and a swarmer's orbit runs on a plane of its own (**F8**). Placement, derelict crews, the warden loop, basic halving and waves from a random 3D bearing all follow the 2D rules. Three soldiers with the 2D recruits and loadout. Only the soldier you fly wears boots: swapping away turns them off. Companions keep a station at a random 3D bearing from the leader (**F10**), steering by the 2D rules, and pick and shoot foes. Tab swaps; when the soldier you fly dies, control passes on | The mission as in 2D, without troopers |
| F6 | **Troopers.** Pairs with the soldier body and the boots, with the 2D trooper body: Aim and Health rolled (K2), a copy of a random squad gun with its effect amounts halved (K3), unlimited magazines. They patrol at random until they find you, perch on rocks and hulls with the landing approach, dance between cover and peeks on the surface (probe walks in 8 directions instead of 2), take turns, flinch, relocate and follow, all on the 2D rules (`tech/space-troopers.md`). Drawn as the squad figure in hostile colours | The full enemy roster |
| F7 | **Readability.** Health bars over enemies in view and over every squad soldier, the telegraph tell (a ring that closes on a shooter winding up), the wave banner, a marker for each hostile off the view at the screen edge (unalerted ones dimmed, as the 2D arrows), an extraction marker with distance once the artifact is carried (the artifact itself is never marked), the squad list, boots state, the objective line, a red edge flash when you are hit, hit markers | Readable in play |

## Reuses

| What | Where | Used for |
|---|---|---|
| Every number in the 2D tuning | `CFG` in `src/space/sim.js` | Imported and overridden only where 3D needs another value (cube size, rock count, spin). A 2D retune reaches 3D, which is what "the same mechanics" asks |
| Weapons and the loadout | `WEAPONS`, `LOADOUT` in `src/space/sim.js` | Imported as they are |
| Recruits, HP and accuracy | `RECRUITS`, `soldierMaxHp`, `aimAccuracy` in `src/space/sim.js` | Imported |
| Enemy types | `ENEMY_TYPES` in `src/space/sim.js` | Imported, numbers and all, including the trooper's AI tuning |
| The RNG | `makeRng` in `src/space/sim.js` | Same seed + same input = same world |
| Rules | `applyEffects`, `hurt`, `fire`, `startReload`, reload ticks, shove decay, `crash`, `keepBasic`, the trooper's trigger and dance states in `src/space/sim.js` | Copied into 3D. Most read `x, y` or 2D angles; `keepBasic`, `crash`, `tickReload` and `decayShove` are simply not exported, and a copy keeps the 2D module unedited |
| The derelict layout | `addDerelict` in `src/space/sim.js` | Imported and run on a scratch 2D world at the origin; its local hull, walls, openings, aft and rooms are extruded and placed in 3D |
| Sound | `createAudio` in `src/space/audio.js` | Imported unchanged. Each event is handed over at its distance and its left–right offset in the listener's frame, which is all its panning reads |
| The look | `src/space/view3d.js` | Copied: the soldier figure's layout and palette, the enemy models, the shot shapes, the glow sprite, bloom, lights, deck texture. It does not export them and draws in a side view, so they cannot be imported |
| The fixed step | `main.js` in `src/space/` | Copied: the accumulator, the latch, restart |

## Where the code goes

| Path | Holds |
|---|---|
| `space3d.html` | The page, linked from nothing. The three.js import map the 2D page uses |
| `src/space3d/` (new) | The prototype's modules. They import each other and `src/space/sim.js` and `src/space/audio.js`, nothing else. Nothing outside imports them |
| `src/space3d/vec.js` (new) | Vectors and quaternions |
| `src/space3d/sim.js` (new) | World, bodies, flight, collisions, crashes, weapons, derelicts, boots, objective, step. **DOM-free** |
| `src/space3d/ai.js` (new) | Enemies, waves, companions, troopers. DOM-free |
| `src/space3d/view3d.js` (new) | The first-person view in three.js. The only module that imports `three` |
| `src/space3d/camera.js` (new) | The eye's pose and the projection to the screen, shared by both views |
| `src/space3d/hud.js` (new) | The 2D overlay canvas: crosshair, bars, markers, HUD |
| `src/space3d/main.js` (new) | Input with pointer lock, the loop, restart. The only module that touches the DOM besides the two views |
| `test/space3d.test.mjs` (new) | Headless suite that steps the sim |

## The seam

None into the game. Inside the page, the seam is the sim's step: one input object per fixed step (look deltas in radians, jet axes, fire, boots, jump, reload, swap, restart, presses latched) in, a world the views read out. The views write nothing back. The test drives it with scripted input and no canvas.

## Must not regress

| Guard | How |
|---|---|
| The game | Nothing imports `src/space3d/`; it imports nothing outside itself except `src/space/sim.js` and `src/space/audio.js`, which the test asserts by scanning import lines |
| The 2D prototype | Untouched. `test/space.test.mjs` unchanged and green |
| The bar | `node test/run.mjs` green |
| 3D basics, per slice | Drift keeps speed. Each jet pushes along its own body axis. Momentum is conserved in rock collisions. No body or round passes a rock or a slab. A crash hurts on the 2D curve. Each effect lands as in 2D. Reload with no spare magazines does nothing. Walking round a rock comes back to the start; walking a derelict never ends up inside a slab. A trooper lands unhurt. Artifact + extraction wins, a dead squad loses. Same seed + same input = same world |

## Approximations

| 2D prototype | First person |
|---|---|
| The jetpack pushes only along facing; aim is the mouse, independent of facing | Aim is the look. W pushes along it at full thrust, and the other five directions push at a fraction (**F3**). With aim and facing one thing, a forward-only pack could never back off while shooting, so the side jets stand in for the 2D page's free aim |
| A/D turn at 4 rad/s | The mouse turns the player at any rate. AI bodies still turn at 4 rad/s and thrust only along facing, so every tuned AI number (landing, stations) holds |
| Up is one of two sides of facing (`dir`) | Up is a full orientation. Floating, it is wherever the mouse and roll left it |
| The camera rolls to the feet (B3) | The first-person camera is the head. Standing, its up is the surface's; it eases there on landing and over edges |
| Mouse-wheel zoom | The wheel narrows and widens the field of view (**F5**) |
| Derelict walls are segments in a plane | Slabs with a height; deck and ceiling plates close the hull. Doors and breaches are holes, not full-height gaps (**F4**) |
| Rounds against a slab | A slab is tested as a box for rounds and lines of sight, and as a rounded slab for bodies. At a corner the two differ by up to the half-thickness (6px) |
| A trooper's probe walks its surface 2 ways | 8 ways, at 45° steps round the normal |
| Edge arrows | Screen-edge markers for what is off the view, behind included |
| Space fires while floating | Space is the up jet while floating and jump on the boots; only the mouse fires |
| Boots need a surface in the feet wedge | Any direction within 40px (**F12**): in first person you cannot see your feet. The boots then turn you feet-first as they pull |
| Side-view soldier figure | The same boxes, seen from any angle. The player's own body is not drawn; the gun is |

## Placeholders — invented for a playable build, for Bo to replace

| # | Question | Stand-in |
|---|---|---|
| F1 | How big is the cube, and how full? | 6000 a side, 300 rocks (r 30–480, skewed small as in 2D). On average a straight line runs about 4500px before it meets a rock. Rock spin up to 0.15 rad/s (2D: 0.3), because standing on a spinning rock turns the whole sky |
| F2 | Look and roll | Mouse at 0.0022 rad per pixel, Q/E roll at 2 rad/s. No world up and no auto-level |
| F3 | Jets | W along the look at 500px/s². S, A, D, Space (up) and C (down) at 60% of it. Space is jump with the boots on. Not Ctrl: Ctrl+W closes the browser tab |
| F4 | Derelict height, doors, breaches | Height 260–320. Doors and breaches keep the layout's 90px width (`CFG.breach`, which the layout clears for). Doors are 150 tall from the deck; breaches are 150 tall, centred on the wall's height |
| F5 | Field of view | 75°, the wheel moves it between 30° and 90° |
| F6 | Fire key | Left mouse. Holding fires an automatic weapon, as in 2D |
| F7 | Spread in 3D | The 2D spread angle is the cone's half-angle, sampled evenly over the cone's disc |
| F8 | Orbits | A gunner, warden or swarmer orbits its target on a plane picked at random when it is made |
| F9 | Waves | 900–1100px from the squad at a random 3D bearing, as in 2D |
| F10 | Companion stations | A random 3D bearing, at 90 ± 40px, fixed for the mission |
| F11 | What the HUD marks | Hostiles within 1600px, unalerted ones dimmed (mines within 500), wardens from 2600px, extraction once the artifact is carried |
| F12 | Boots activation | Within 40px of any surface, in any direction; the pull turns you feet-first |
