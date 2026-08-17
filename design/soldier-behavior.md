---
type: design
category: artificial-intelligence
status: reference
resolution: vague
related: [agent-navigation, behavior-lab, enemies, bonds]
---

# Soldier behavior

## The two modes a soldier is in

A soldier is always exactly one of these, and swapping (Tab) moves control from
one body to another instantly.

| | Driven by | |
|---|---|---|
| **Controlled** | You | Full manual: move, jump, kneel, aim, fire, reload, swap away |
| **Squadmate** | Itself | Follows you, picks its own targets, fires, reloads. Kneels only to duck a shot |

Control moves automatically to the next living soldier when the one you are
driving dies. The soldier you leave behind stands back up if it was kneeling and
becomes a squadmate on the same tick.

## What every soldier can do, either mode

| Capability | |
|---|---|
| **Run** | Accelerates to a top speed, decelerates by friction. Same for you and for a squadmate |
| **Jump** | A fixed impulse from the ground, with a short grace window after walking off a ledge |
| **Aim in any direction** | A free 2D aim vector. The drawn gun and the muzzle flash follow it. Facing and aim are separate — a soldier can shoot straight up without turning to face up |
| **Fire** | The equipped weapon, at its own rate. One trigger pull spends one round, whatever the weapon scatters |
| **Reload** | Costs time and one spare magazine, and slows movement to a fraction of run speed while it runs. A soldier carries a fixed number of spares; at zero, no more reloading |
| **Take wounds that persist** | Damage not healed by the end of a mission follows the soldier home and reduces the health they deploy with next time |

## What only the controlled soldier can do

| | |
|---|---|
| **Kneel** | Drops to about half height. Shots aimed at standing height sail over, and a squadmate behind you can shoot over your head |
| **The cost of kneeling** | You cannot run and cannot jump while down. You can still pivot to face either way, and you can still fire |
| **Kneeling is not cover** | A shot already in the air aimed at your standing centre misses. The *next* shot re-aims at where you actually are |
| **Choose a target** | Squadmates pick the nearest hostile they can find; you pick anything |

## What a squadmate does on its own

Two behaviours, and it is always in one of them.

| | What it does | Leaves when |
|---|---|---|
| **Escorting** | Walks, over and over, to a fixed spot a short way to your left. Keeps a loose standoff so it does not body-block you | A hostile comes within engagement range |
| **Fighting** | Holds a firing standoff from the nearest hostile — closes if too far, backs off if too close — and fires on a loop whenever it can see the target | The nearest hostile is far enough away again |

Details that matter to how it reads on screen:

| | |
|---|---|
| **It breaks off to fight on distance alone** | A hostile close enough is engaged whether or not there is a clear shot at it. Cover cannot pin a squadmate in escort |
| **It only pulls the trigger on something it can see** | A squadmate under a ledge holds fire rather than shooting into it |
| **It repositions when it cannot shoot** | With no sight line, or stuck outside its standoff, it walks to somewhere it can shoot from and commits to going there. If the ground defeats it, it gives up and fights from where it stands |
| **It reloads itself** | The moment the magazine runs dry |
| **Its gun tracks its target smoothly** | The barrel follows continuously rather than snapping between poses |
| **It lowers its weapon when the field is clear** | With nothing alive to shoot, it stops firing and goes back to escorting |

**A squadmate kneels only as a reflex.** It never chooses to kneel the way you
can — see *Ducking* below, and the standing gap in *Undecided*.

## How a soldier's stats change what they do

Four stats. Two of them currently do something.

| Stat | What it does today |
|---|---|
| **Aim** | Tightens shot grouping. A high-Aim soldier's rounds land where the barrel points; a low-Aim soldier's scatter. Applies to you and to squadmates equally — your own aim stat widens your shots too |
| **Health** | Sets maximum hit points. Persistent wounds are deducted from it |
| **Speed** | Decides a squadmate's duck: whether they react to a shot at all, and how long they take to get down once they do. A slow soldier misses more of them, and is visibly late on the ones it catches. No soldier moves faster because of it |
| **Nerve** | **Nothing.** Described as composure under fire — panics, freezes, breaks. None of that exists |

Traits ("Reckless", "Fearless", "Green") are displayed in the barracks and affect
nothing.

## Ducking

**The capability.** A squadmate notices a shot coming that kneeling would avoid,
and sometimes gets down in time.

### How it works

| Step | |
|---|---|
| 1 | A shot is in the air that will hit this soldier standing and would miss them kneeling — this shot, this soldier, not a general sense of danger |
| 2 | Whether they react at all is a **chance**, from their Speed |
| 3 | If they react, how long before they move is a **latency**, also from their Speed |
| 4 | They drop, hold briefly, and stand back up |

**Both knobs, and they do different jobs.** Chance decides *whether* a soldier is
the kind of person who saw it coming. Latency decides *how good they look doing
it*. Chance alone is invisible — the player cannot tell a failed roll from a
soldier who was not paying attention. Latency is what shows on screen: a fast
soldier goes down at the last moment and it reads as reflex; a slow one starts to
move and gets clipped anyway, and that reads as slow. The stat has to be
*watchable*, not just statistical.

**One verdict per shot.** A soldier who misses a round coming does not get a
second look at it.

### What it costs the squadmate

Kneeling stops a soldier running and jumping, so a duck is a real price: a
squadmate under sustained fire that keeps ducking stops escorting and stops
closing. They stand back up rather than staying down.

### What it does not cover

| | |
|---|---|
| **Only soldiers** | Aliens have no knee. Nothing about this makes enemies smarter |
| **Only shots that a knee actually avoids** | Not shots aimed low, not blasts, not anything where getting smaller does not help |
| **Not cover** | Choosing *where to stand* is a separate and much larger problem — `idea/advanced-agent-navigation.md`. This is a reflex, not a plan |
| **Homing shots** | A round that steers cannot be anticipated, so ducking it sometimes fails |

## Undecided

Capabilities the squad does not have, and effects the game advertises but does
not deliver.

| | |
|---|---|
| **A squadmate never kneels except to dodge** | Ducking covers reacting to incoming fire. Kneeling to clear your line of fire, or to make itself small on approach, does not exist |
| **Nerve does nothing** | Described as composure under fire — panic, freezing, breaking — and none of it exists. Speed reaches exactly one behaviour, the duck |
| **Traits do nothing** | "Reckless", "Fearless", "Green" and the rest are printed beside soldiers who behave identically |
| **The escort position is fixed, and always to your left** | Not behind you — a literal fixed offset, so walking left puts your squad in front of you. It does not vary by facing, weapon, soldier, or situation |
| **Squadmates take no account of each other** | Two will hold the same standoff from the same hostile in the same place. No spreading out, no roles, no flanking |
| **Your own Aim stat widens your shots** | Manual aim is precise, then the stat scatters it — the player aims by hand and is corrected by a number |
| **Wounds are invisible in the mission** | A soldier deploys with reduced health and nothing on screen says why |
| **Nothing reacts to a squadmate dying** | No morale, no reaction, no acknowledgement — see `design/bonds.md` |
