---
type: design
category: scenes
status: idea
resolution: vague
---

# Missions

How the player chooses and experiences a mission. Built in
`tech/level-generation.md`.

## Principles

| | |
|---|---|
| You choose leads, not levels | The level does not exist until you commit to a lead |
| Leads can lie | Advertised threat may not match reality — bounded by a telegraphed intel stat |
| Intel investment is the endgame | The final lead is only found by an Ops track you had to pay for |
| A campaign, not a shuffle | Persistent story state feeds each new batch of leads |
| Geometry is always beatable | A mission can kill you; it can never be unplayable |

## The lead

Lt. Sable, callsign "Watchtower", surfaces cheap stubs describing a possible
mission. You pick one, then the level generates.

| Field | Example |
|---|---|
| Codename | "Broken Antenna" |
| Location | Comms array, eastern ridge |
| Hook | "A defector is transmitting before they silence her." |
| Advertised threat | Moderate — may be a lie |
| Reward hint | Intel cache |
| Expires in | 4 days |

Choosing from leads feels like commanding an operation. Choosing from a list
feels like picking a level.

## Why lying is fair

| | |
|---|---|
| The lie | Advertised threat can diverge from reality. Ambushes are real |
| The bound | A telegraphed **intel accuracy** stat caps how far it can stretch |
| The lever | Ops investment shrinks the gap |
| The result | Uncertainty becomes drama instead of the game cheating |

Without the bound this is unfairness. With it, the question becomes: do you take
the promising lead you cannot verify?

## Safety nets — where they go

| Has no safety net | Has an absolute safety net |
|---|---|
| Combat | Traversability |
| Permadeath | Spawn-to-exit route |
| Threat accuracy (within the intel bound) | Enemy placement legality |

The engine builds a provably traversable skeleton. Generation only themes it —
names the site, writes the brief, sets the biome, picks enemy composition, places
enemies onto engine-offered anchors. It never emits raw coordinates.

## Set pieces

| Type | |
|---|---|
| Base defense | The aliens attack you. Trigger undecided, possibly avoidable |
| Endgame assault | Find the alien base, attack it, end the invasion |
| Recovery | Some technology exists only in the field — these missions are the only route to it |

## Open questions

| Question | Why it matters |
|---|---|
| How much of a lead is visible before committing? | And what does investment actually reveal? |
| What does a mission feel like *ending*? | Is extraction a moment, or does the level just stop? |
| Do expiring leads create pressure or just anxiety? | Fear of missing out is not the same as tension |
| How does a biome read as a threat signal? | Currently scenery only |
