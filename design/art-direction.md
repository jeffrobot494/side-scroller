---
type: design
category: content-generation
status: unbuilt
resolution: vague
---

# Art direction

What the game should look like, and which parts may be generated. Built in
`tech/asset-generation.md`, `tech/animation-factory.md`, `tech/parallax-biomes.md`.

## Principles

| | |
|---|---|
| Hybrid on purpose | Raster where it is static, procedural where it moves |
| Nothing breaks for lack of art | Procedural shapes are a permanent fallback, not a stand-in |
| Generated then frozen | Assets are made at authoring time, approved by a human, committed as bytes |
| Coherence is enforced upfront | A shared style fragment in every prompt, not a fix applied afterwards |
| Biomes read at a glance | Distinguishable beats detailed |

## The split

| Register | Used for | Why |
|---|---|---|
| Raster, generated | Backgrounds, scenery, portraits, icons, title art | Static and atmospheric — where generated imagery is strongest |
| Procedural / sprite | Soldiers, enemies, projectiles | They flip, tint, hit-flash, and animate; legibility at speed is a mechanic |

Not a compromise pending better tools. Gameplay-critical things are authored
because the player has to read them instantly.

## Fallback discipline

| | |
|---|---|
| Missing asset | Degrades to a colored shape |
| Game state | Keeps running |
| Shipping with boxes | Acceptable, for a long time |
| Art arrival | Gradual, never blocking |

## Generation rules

| Rule | |
|---|---|
| Never at runtime | Latency, credits, content filtering, non-determinism |
| Human approves before commit | Once approved, irreproducibility stops mattering |
| Style bible in every prompt | A set of enemies must look like one world |
