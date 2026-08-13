---
type: idea
category: gameplay-systems
---

# Idea: campaign walkthrough

A scaffold for writing **one concrete campaign, start to finish, in prose** — not
the system, one playthrough. Real dates, real names, real outcomes.

Feeds `design/story-generator.md`, which stays open until this is filled in.

The method: fill it in top to bottom. **Every time you cannot write the next line,
you have found a missing decision.** Write the decision in the ledger at the
bottom and keep going. The ledger is the actual output of this exercise; the
campaign is just the thing that forces it out.

Rules that make it work:

| | |
|---|---|
| Write prose, not fields | "The squad arrives to find Moglin already dead" beats a bullet |
| At least two missions must be **lost** | Losses are where the design is weakest |
| At least one mission must **diverge hard** from its hypothesis | That is the feature |
| Do not stop to design | Note the gap in the ledger, make a provisional choice, keep writing |
| Aim for one sitting | If it takes a week it stopped being a walkthrough |

---

## Part 0 — before mission 1

| | |
|---|---|
| When did the lizards arrive, and how? | |
| What did the generator produce at campaign start? | *(the ~10-point plan, a single lead, something else)* |
| What does the player see of it? | |
| What does the player know about the enemy? | |
| Why does the base survive changes to history? | |
| What is the base, and who is in it? | |
| The one starting lead — when and where? | |

---

## Part 1 — the missions

Copy the block below eight times. Keep each to a paragraph per row.

### Mission N

| | |
|---|---|
| **When / where** | |
| **Sensor reading** | What the particles indicate. This is evidence, not explanation |
| **Hypothesis** | What research concludes, and therefore the stated objective |
| **Loadout** | Who goes, what they carry, what the throw mass forced you to leave |
| **Reality** | What is actually there. How far from the hypothesis, and in what direction |
| **What happened** | Played out. Won, lost, or something stranger |
| **Outcome** | What the squad actually achieved — in words, not a boolean |
| **History after** | One paragraph: the world now |
| **What it produced** | The next lead(s), and why the player would pick one over another |
| **How the next level looks** | The visual payoff. Concretely — what does the player see when they arrive |

Suggested shape, so the walkthrough covers the hard cases:

| Mission | Should contain |
|---|---|
| 1 | The straightforward case. Hypothesis roughly correct, mission won |
| 2 | A **loss** — the first time history goes somewhere you did not choose |
| 3 | The hypothesis is **wrong**. Something else was happening |
| 4 | The consequences of 2 and 3 **compound** into something neither caused alone |
| 5 | The lizards **counter** — they intervene in response to the player |
| 6 | A **second loss**, late enough that the world is already strange |
| 7 | The player learns something that reframes the campaign |
| 8 | The ending |

---

## Part 2 — the ending

| | |
|---|---|
| What does the player have to do to win? | |
| How do they know it is available? | |
| Can they lose the campaign outright? How? | |
| What does the final state of history look like? | |
| Is humanity free, and what does that mean given there is no correct timeline? | |

---

## Decisions ledger

The point of the exercise. Every blank you could not fill, and what you chose.

| # | Decision forced | What you chose | Confidence |
|---|---|---|---|
| | | | |

### Known to be lurking

Not exhaustive — these are the ones already visible from prior discussion. Expect
the walkthrough to find more.

| Decision | Why it bites |
|---|---|
| **What "success" means when the briefing was wrong** | The mission returns one bit today. Four outcomes need naming, and the generator is fed whatever this produces |
| **When the lizards arrived** | Sets the earliest playable date and the range of history in play. The GDD says "last hundred years"; the worked example used 1831 |
| **Plan authored once, or regenerated** | Decides whether a campaign has an arc or is eight vignettes |
| **Whether the base changes** | Shielded / unexplained / defended-threads. The third is a second game |
| **How a level's look is chosen** | Fixed palette (like `BIOMES` today) or generated. Runtime asset generation is out of scope for August |
| **Whether a resolved point can reopen** | Determines if the player can lose ground they already took |
| **Throw mass vs credits** | Two economies, or one |
| **What the timeline room shows** | The plan, the player's divergences, or both |

---

## After the walkthrough

The ledger becomes the settled sections of `design/story-generator.md`. Anything the walkthrough proved
unnecessary gets cut before it is written down — that is the second reason to do
this, and possibly the more valuable one.
