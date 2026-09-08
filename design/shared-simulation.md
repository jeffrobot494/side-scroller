---
type: design
category: gameplay-systems
status: designed
resolution: sharp
related: [behavior-lab, missions, soldier-behavior]
---

# Shared simulation

Missions and the Behavior Lab run the same gameplay rules, so behavior observed
in a controlled Lab encounter is representative of the same encounter in a mission.

## Same world, same behavior

| Contract | Requirement |
|---|---|
| Equivalent encounters | The same initial world, gameplay configuration, commands, randomness, and simulation time steps produce the same gameplay outcome |
| Agent behavior | Perception, decisions, navigation, movement, and defensive reactions follow the same rules in both environments |
| Combat | Weapons, projectiles, collisions, damage, status effects, and death follow the same rules in both environments |
| Control | Equivalent gameplay commands have equivalent effects regardless of which environment supplies them |
| Explicit differences | Differences in gameplay come from the configured scenario or commands, never hidden rules specific to the Lab |
| Observation | Inspectors, overlays, and logging do not change gameplay decisions or outcomes |

## Responsibilities of each environment

| Environment | Responsibilities |
|---|---|
| Shared simulation | Advance the world and its agents under the gameplay rules; report gameplay events such as damage and death |
| Mission | Translate player input, present the encounter, apply mission objectives and extraction rules, and handle campaign results |
| Behavior Lab | Configure controlled encounters, supply commands, control simulation time, and expose behavior for inspection |

## Time and repeatability

- Pausing the Lab stops simulation time, including movement, projectiles,
  cooldowns, and status effects.
- Stepping advances the same simulation used during normal play.
- Repeating the same encounter with the same commands and simulation time steps
  reproduces its gameplay outcome. Presentation need not be identical.

## Preservation and scope

| Boundary | Requirement |
|---|---|
| Existing missions | Sharing the simulation preserves current single-player and multiplayer gameplay, including control switching, combat timing, and mission outcomes |
| Existing Lab | Its navigation scenario remains usable without requiring combat or additional agents |
| New AI behavior | Persistent goals, tactical positioning, survival decisions, and order refusal are separate features; they use the shared rules when introduced |
| Team expansion | Allowing additional agent types to fight on either team is separate work |
| Lab expansion | Agent-management controls, combat scenarios, and detailed diagnostics are separate features; this contract defines their simulation consistency |
| Implementation | Module boundaries, update orchestration, and event mechanisms belong in the technical specification |
