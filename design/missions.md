---
type: design
category: scenes
status: idea
resolution: vague
---

# Missions

How the player chooses and experiences a mission. How it is built:
`tech/level-generation.md`.

## You choose from leads, not from a list

An Ops officer — Lt. Sable, callsign "Watchtower" — surfaces **leads**: cheap
stubs describing a possible mission. A codename, a location, a hook, an
advertised threat level, a reward hint, and a deadline. You pick one. Only then
does the actual level exist.

That ordering is the point. Choosing feels like commanding an operation rather
than picking a level from a menu.

## Leads can lie

The advertised threat may not match what you find. Ambushes are real, and a
mission can be worse than it looked.

What keeps that fair is **intel accuracy** — a telegraphed stat bounding how far
the lie can stretch. The player always knows how much they can trust what they
are being told. Investment in Ops shrinks the gap.

Without the bound this is just the game cheating. With it, the uncertainty
becomes the drama: do you take the promising lead you can't verify?

## Investment in intelligence is the endgame

The Ops upgrade track is how the final lead gets found. Under-invest and the doom
clock runs out before you locate anything worth attacking. So "should I spend on
better intel or better guns" is a real strategic question with a real failure
state attached.

## A campaign, not a shuffle

A persistent story state — act and beat, sector map, enemy agenda, named cast,
your own casualties and famous soldiers and tech built — feeds each new batch of
leads. Mission results fold back into it. The intent is that the sequence of
missions reads as a war with a direction, not a randomiser.

## The engine guarantees you can finish

Geometry is never generated freely. The engine builds a platform skeleton that is
provably traversable, and generation only *themes* it — names the site, writes the
brief, sets the biome, decides enemy composition, places enemies onto anchors the
engine offers.

The rule: no safety nets in combat and permadeath, absolute safety nets in
geometry. A mission can kill you; it can never be unplayable.

## Set pieces

- **Base defense.** At least one mission where the aliens attack you. Trigger
  undecided, possibly avoidable.
- **Endgame assault.** Do well enough to find the alien base, then attack it to
  end the invasion.
- **Recovery missions.** The best gear needs parts that only exist in the field,
  so some missions are the only route to a piece of technology.

## Open questions

- How much of a lead should be visible before committing, and what does
  investment actually reveal?
- What does a mission feel like *ending* — is extraction a moment, or does the
  level simply stop?
- Do leads expiring create useful pressure, or just anxiety about missing out?
- How does the player read a biome as a threat signal rather than only as scenery?
