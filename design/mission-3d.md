---
type: design
category: scenes
status: built
resolution: sharp
related: [art-direction, missions]
---

# Mission 3D

The mission view is drawn in 3D. There is no 2D mission view.

## What changes

| Element | In 3D |
|---|---|
| Background | A 3D scene behind the play space |
| Terrain | 3D geometry in the same places the platforms are |
| Soldiers | 3D models |
| Enemies | 3D models |
| Projectiles | 3D projectiles |
| Enemy deaths | Every enemy death has a default explosion |

## What does not change

| | |
|---|---|
| Mechanics | Drawing in 3D changes nothing the player does and nothing that happens to them |
| Mission content | Same generated levels, enemies, weapons and squad |
| Hub and editor tools | Unchanged — this is the mission view only |

## How the models look

| | |
|---|---|
| Source | Each entity's current 2D look — its shape, colours and parts — is the reference for its model |
| Bar | They look cool: a model is an upgrade on its sprite, not a literal extrusion of it |
| Readability | A soldier, an enemy and a projectile stay as easy to tell apart as they are in 2D |
