---
type: design
category: artificial-intelligence
status: unbuilt
resolution: vague
---

# Enemies

What the opposition should feel like to fight. Built in `tech/enemyspec.md`,
`tech/enemyspec-llm.md`, `tech/agent-navigation.md`.

## Principles

| | |
|---|---|
| Fewer, smarter, deadlier | One enemy that repositions and zones is worth ten that walk forward |
| Readability is the contract | Damage you could not have seen coming reads as unfair, not hard |
| Smart ≠ hard | Intelligence and difficulty are separate axes, tuned separately |
| Every enemy is a role | Coherent function, recognizable strengths and weaknesses, its own identity |
| The opposition is alive | Enemies persist across a campaign and develop — not difficulty scaling |

## What makes an enemy readable

| Mechanic | Effect on the player |
|---|---|
| Telegraph before committing | A wind-up you can see and react to |
| Commit to the attack | Once started it finishes, even if you move — so it can be baited and punished |
| Imperfect aim, on purpose | A sniper that telegraphs loudly beats one that never misses |
| Reaction delay | Enemies notice you on a beat, not on the frame |

Perfect reactions read as cheating. Commitment is what turns an attack into
something the player can learn.

## Intelligence vs difficulty

Tune these independently. A player saying "this boss is boring" should get more
behavioural variety, not more damage — and when generation starts tuning enemies
on its own, damage is the easy lever and the wrong one.

| Intelligence | Difficulty |
|---|---|
| Where it chooses to stand | Damage |
| Whether it predicts your movement | Health |
| How long it remembers you | Projectile speed |
| How many different things it can do | Attack frequency |
| Whether it reads your habits | Aim error, reaction time |

## The living ecosystem (long ambition)

- Each campaign generates its own enemy ecosystem
- Enemies persist as campaign data, not discarded after a battle
- They adapt to how the player actually fights — preferred weapons, working tactics
- Produces counters, specialists, descendants, rivalries belonging to that run
- A generated enemy must read as a role, not a bag of attributes, or its
  descendants will not read as relatives
