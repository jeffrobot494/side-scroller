---
type: design
category: gameplay-systems
status: idea
resolution: vague
---

# Audio

What the game should sound like, and what sound is *for*. How it is built:
`tech/sound.md`.

## Sound is information first

At run-and-gun speed the player cannot look everywhere. Audio is how they track
what is happening off-screen: something is charging a shot, something landed
behind me, that was my last magazine. Atmosphere matters, but it is the second
job.

Which means the test for any cue is not "does it sound good" but **can the player
identify what happened without looking.**

## Weapons must be distinguishable by ear

Two guns that sound alike are two guns the player cannot tell apart mid-fight.
Timbre carries information: a heavy launcher and a light SMG should never be
confused, and an enemy shot and a friendly shot should be separable.

Positional too — sounds pan and fall off with distance, so a report tells you
roughly *where*, not just *what*.

## One action, one sound

The hazard that ruins this: a shotgun that throws six pellets in one trigger pull
must produce **one** report, not six stacked on a single frame. Layered
duplicates phase into mush and destroy the readability everything above depends
on. Same for rapid fire — a 12-rounds-per-second weapon needs voice limits or it
becomes noise.

Loud does not equal important. The mix should reserve headroom for the sounds the
player must react to.

## Placeholder sound is real sound

Everything currently runs on made-up procedural beeps, and that is a legitimate
state to ship in. Real recordings drop into the same slots later without any
gameplay change. The system should never be waiting on audio assets to be
useful — the same discipline the art pipeline uses.

## Open questions

- Should enemies be audible before they are visible, and how far ahead?
- Does the player's own weapon sit above or below enemy fire in the mix?
- Is there music, and does it react to combat state?
- What does the base sound like — the strategy layer has had no audio design at
  all.
- How much do soldiers speak? Voice is the cheapest route to attachment and the
  fastest route to irritation.
