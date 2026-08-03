---
type: design
category: gameplay-systems
status: unbuilt
resolution: vague
---

# Audio

What the game should sound like, and what sound is *for*. Built in
`tech/sound.md`.

## Principles

| | |
|---|---|
| Sound is information first | Atmosphere is the second job |
| The test for any cue | Can the player identify what happened without looking? |
| Weapons must differ by ear | Two guns that sound alike are two guns you cannot tell apart mid-fight |
| One action, one sound | A six-pellet shotgun blast is one report, never six |
| Placeholder sound is real sound | Procedural beeps are a legitimate shipping state |

## What sound has to carry

At run-and-gun speed the player cannot look everywhere. Audio is the off-screen
channel.

| The player needs to know | Carried by |
|---|---|
| Something is charging a shot | Telegraph cue, distinct from the fire cue |
| Something landed behind me | Positional pan + distance falloff |
| That was an enemy, not me | Timbre separation between teams |
| I am out of ammo | Dry-click, squad only |
| What kind of threat that is | Per-weapon and per-enemy timbre |

## The mix hazards

| Hazard | Consequence |
|---|---|
| Stacked duplicates | Six pellet impacts on one frame phase into mush |
| Rapid fire | 12 rounds/sec without voice limits becomes noise |
| No headroom | Loud does not equal important; reaction-critical cues get buried |

Readability depends on all three being solved before anything is tuned for
flavour.
