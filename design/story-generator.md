---
type: design
category: gameplay-systems
status: unbuilt
resolution: vague
---

# Story generator

What the player does with a lead, and what the campaign's history is made of.

*Transcribed from Bo, 2026-08-07. Sections marked **open** are undecided.*

**Being written by walking one campaign end to end — see
`idea/campaign-walkthrough.md`.** That scaffold's decisions ledger is what turns
the open sections below into this document; anything the walkthrough proves
unnecessary gets cut before it is written down here.

## The loop

| Step | |
|---|---|
| 1 | Operations holds a **lead** — a time and a place. Sensors detected particles in that region of spacetime indicating the lizards were there |
| 2 | Research: in-fiction AI and analysts study the era and form a **hypothesis** about what the lizards did there — who they killed, what they changed |
| 3 | A short **base cutscene** delivers that hypothesis as the mission's objective. *"Save John Moglin."* |
| 4 | The player prepares: who goes, what they carry — bounded by throw mass, below |
| 5 | Transit. A **level-introduction cutscene**, maybe |
| 6 | The mission is played |
| 7 | The outcome feeds the story generator, which rewrites what follows |

The campaign opens with **exactly one lead**.

## The hypothesis is a guess

The situation on the ground **should differ from the briefing**, by varying
degrees. The researchers deduced what they could from 200-year-old evidence and
they are sometimes wrong.

This is where mission-to-mission surprise comes from, and it is the cheapest
interesting thing in the design: the briefing is text, the mission is already
generated, and the gap between them costs nothing to author.

**Open:** what the player does when the briefing is wrong. Discovering mid-mission
that John Moglin is already dead, or was never the target, needs a rule for what
counts as success.

## Throw mass

| | |
|---|---|
| Constraint | The power the base can supply determines how much **mass** goes through — people plus gear |
| Consequence | Upgrading the machine is a campaign-long investment, and every soldier and weapon has a mass cost |
| Tension it creates | Four light soldiers or two heavy ones. Armour or ammunition |

**Open:** how this sits alongside credits. The game already has an economy —
hire, commission, sell loot — and this is a second, independent budget.

## The machine

Needs a name. Candidates and what each implies are in the chat log; not settled.

## The campaign timeline

The generator's first act is to invent **the lizards' plan** — roughly ten points
in time and space where they intervened to bring humanity under their thrall.
That is the campaign's arc, and the leads are drawn from it.

It is not expected to survive. Divergence compounds, and by the late campaign the
original plan may describe a history that no longer exists.

**Open, and the structural question of the whole feature:**

| | |
|---|---|
| Is the plan authored once at campaign start, then edited as history diverges? | Or regenerated from the current world state after every mission? |
| What does the player see of it? | The whole plan, only the points they have visited, or only the next lead? |
| Does a point stay fixed once resolved? | Or can a later divergence reopen an era the player already fought in? |

## The lizards

**Open.** Not "aliens in spaceships came and attacked us" — the register is hard
science fiction and the game takes itself seriously. Two candidates on the table:

| Candidate | |
|---|---|
| **Innate** | Time or dimensional crossing is a biological capacity of the species, not a technology |
| **Refugees** | A powerful race that lost an existential war and was splintered across the galaxy. One fleeing vessel found Earth and used its time technology to remake the planet as a paradise for themselves, with humans as the labour |

Under either, there are **few of them** and getting here cost their civilisation
enormously. This is not an invasion; it is a small number of survivors playing a
very long game.

## A room for the timeline

The base needs a room where the current state of history can be read. It does not
exist yet, and it is the only surface where the generated timeline can be seen
outside a cutscene.

**Open:** what it shows, and whether it shows the lizards' plan, the player's own
divergences, or both.

## Questions still open

Each of these is a row in the walkthrough's ledger (`idea/campaign-walkthrough.md`).

1. What counts as success when the briefing was wrong?
2. Is the ten-point plan authored once and edited, or regenerated each mission?
3. What does the timeline room actually display?
4. How does throw mass relate to credits — one economy or two?
5. Which origin do the lizards have, and does the player ever learn it?
6. What is the smallest version of all this that still lands, in two design days
   and two implementation days?
