---
type: design
category: content-generation
status: idea
resolution: vague
---

# Art direction

What the game should look like, and which parts are allowed to be generated. How
it is built: `tech/asset-generation.md`, `tech/animation-factory.md`,
`tech/parallax-biomes.md`.

## Hybrid on purpose

Two visual registers, split by whether a thing *moves and matters*:

**Raster, generated** — backgrounds, scenery, portraits, icons, title art.
Static, atmospheric, and exactly where generated imagery is strongest.

**Procedural and sprite** — soldiers, enemies, projectiles. These flip, tint,
flash on hit, and animate. They have to stay crisp, controllable, and readable at
speed, which generated raster is bad at.

The split is not a compromise while waiting for better tools. Gameplay-critical
things need to be authored because their *legibility is a mechanic*.

## Nothing ever breaks for lack of art

Procedural vector shapes are the permanent fallback, not a temporary stand-in. A
missing asset degrades to a colored shape and the game keeps running. This is the
same rule the whole project uses — the game must stay playable at every step —
and it means art can arrive gradually without ever blocking anything.

Boxes and colored shapes are an acceptable shipping state for a long time.

## Generated, then frozen

Assets are generated at authoring time, curated by a human, and committed to the
repo as bytes. Never generated during play. Once a person has approved and
committed an image, the fact that it could not be reproduced identically stops
mattering.

## Coherence comes from a style bible

Generated assets drift apart unless every prompt shares a canonical style
fragment. A set of enemies should look like they come from the same world, and
that has to be enforced at generation time rather than fixed afterwards.

## Environments should read as biomes

A background's job is to tell the player where they are within a second, and
ideally to hint at what lives there. Multi-layer parallax gives depth cheaply;
the design question is whether each biome is *distinguishable at a glance*, not
whether it is detailed.

## Open questions

- **Animation approach is undecided.** Baked sprite sheets are universal but
  rigid; cutout puppets respond better and support procedural aiming but need a
  known body plan. Currently documented as two routes with no choice made — and
  it is a large decision, because it constrains what enemy bodies can exist.
- How much visual identity can a generated enemy have before it stops reading as
  part of the same world?
- Does the strategy layer share the action layer's look, or is the base
  deliberately a different register?
- What does the player read as "dangerous" purely from silhouette?
