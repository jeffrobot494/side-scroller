---
type: design
category: scenes
status: unbuilt
resolution: sharp
related: [art-direction, missions]
---

# Mission 3D

A 3D version of the mission view: same game, drawn in 3D, switchable against the 2D view.

## What changes

| Element | In 3D |
|---|---|
| Background | A 3D scene behind the play space |
| Terrain | 3D geometry in the same places the platforms are |
| Soldiers | 3D models |
| Enemies | 3D models |
| Projectiles | 3D projectiles |

## What does not change

| | |
|---|---|
| Mechanics | Everything the player does and everything that happens to them is identical in both views |
| Mission content | Same generated levels, enemies, weapons and squad |
| Hub and editor tools | Unchanged — this is the mission view only |

## How the models look

| | |
|---|---|
| Source | Each entity's current 2D look — its shape, colours and parts — is the reference for its model |
| Bar | They look cool: a model is an upgrade on its sprite, not a literal extrusion of it |
| Readability | A soldier, an enemy and a projectile stay as easy to tell apart as they are in 2D |

## Switching

| | |
|---|---|
| Choice | The player picks 2D or 3D |
| Back out | Switching back to 2D is always available and loses nothing |
