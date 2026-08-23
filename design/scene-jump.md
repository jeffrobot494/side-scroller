---
type: design
category: development-tools
status: unbuilt
resolution: vague
related: [behavior-lab]
---

# Scene jump

Reaching any point in the game without playing to it.

## What you can jump to

*State the destinations. A generated mission is the obvious one; a room in the
hub, a deploy screen with a squad already picked, a results screen, an end
screen, and "a campaign on day 30 with two High wins" are all different asks and
may not all belong.*

## What a scenario says

*State what a scenario is made of — the parameters that describe a situation
completely enough to land in it.*

## How you launch one

*State where the jump is triggered from and what the person doing it types,
clicks, or picks.*

## What is real and what is faked

*State whether a jumped-to mission plays for keeps — real permadeath writing back
to a real campaign — or whether it is a sandbox that throws its result away. This
is the decision the rest of the tool hangs on.*

## Keeping a scenario

*State whether a scenario is written once and re-run, or built fresh each time.
Whether one can be handed to someone else. Whether the tests use the same ones.*

## Not this tool

*State what stays out, so it does not accrete. The Behavior Lab, Firing Room and
Level Generator each already own a slice of "look at part of the game in
isolation" and the boundaries matter.*
