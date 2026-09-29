---
type: design
category: artificial-intelligence
status: unbuilt
resolution: sharp
related: [soldier-behavior, agent-navigation, squad-agent-development, advanced-agent-navigation]
---

# Squadmate survival and orders

How a squadmate stays alive while staying useful, and how it answers an order it
judges too dangerous.

## The rule everything follows

| | |
|---|---|
| **Survival first** | A squadmate protects itself by default and may refuse an order even when death is not certain |
| **Useful, not hiding** | Safety is traded for usefulness only as far as the danger demands. When the pressure drops, it goes back to work |
| **One idea of danger** | Where to stand, when to take cover, which way to walk and whether to obey all ask the same two questions: *what can hit me there* and *what can I hit from there* |
| **Fallible** | Awareness never becomes perfect evasion. A slow soldier still reacts late, and some shots still land |

## What a squadmate weighs

| Input | |
|---|---|
| **Its wounds** | Health remaining, and whether another hit could kill it. Wounds carried in from earlier missions count |
| **Being under fire** | Having been hit recently, or a round being on its way |
| **Exposure** | How many hostiles could hit a spot — every hostile, not only the nearest |
| **A usable shot** | Whether it could hit its target from a spot |
| **Time to get there** | "Nearby" means reachable soon, not close in a straight line |
| **Danger on the way** | How exposed the route is, not only the destination |
| **Crowding** | Whether an ally already holds that spot |

## Seeing is not hitting

| | |
|---|---|
| **A shot** | Leaves from the muzzle, may arc, and is stopped by terrain or an ally in its path. Seeing a target does not mean it can be hit |
| **A squadmate fires** | Only when it has a usable shot |
| **Exposure uses the same rule reversed** | A spot is exposed to a hostile only if that hostile's own fire can reach it. An arcing attacker can reach over a wall a straight shooter cannot |

## Where it stands

| | |
|---|---|
| **Prefers** | A usable shot on its target, low exposure, reachable soon, not already occupied |
| **Scores, does not require** | A spot with no shot can still win when everything else about it is better |
| **Staying put is an option** | It moves only when somewhere else is meaningfully better |
| **Commits** | Once it picks a spot it goes there. It reconsiders when it arrives, when it cannot get there, or when the danger changes materially, not because a slightly better spot appeared |
| **Spreads out** | Two squadmates do not pick the same spot |

## Taking cover

| | |
|---|---|
| **When** | It is under fire and wounded, or its magazine is empty |
| **Where** | The least exposed spot it can reach soon |
| **While there** | Reloads, and fires if it has a usable shot |
| **Leaves** | When the fire has stopped for a while. Leaving takes calmer conditions than entering, so it never flickers in and out |
| **Wounds do not pin it** | Low health may last the whole mission. It does not wait to heal before going back to work, but a wounded squadmate reaches for cover sooner than a healthy one |
| **Afterwards** | It resumes what it was doing before: escorting you, or the order it was carrying out |

## Travel

| | |
|---|---|
| **Safer routes** | A route is judged by its danger as well as its length. A longer covered route beats a short exposed one when the difference is worth it |
| **The destination does not change** | Taking cover partway keeps the destination. It carries on afterwards |
| **Cover partway is a reaction** | It stops in cover when fire arrives, not at planned waypoints |
| **Routes do not flip** | Small changes in danger do not reverse a route it has committed to |

## Dodging

| | |
|---|---|
| **Three responses** | Keep going, duck, or jump. It picks the one that avoids the round |
| **Duck** | Only against a round that kneeling makes miss |
| **Jump** | Only when the arc clears the round, lands somewhere it can stand, hits nothing overhead, and does not jump into other fire |
| **One choice per threat** | Ducking stops running and jumping. Responses never fight each other |
| **One verdict per round** | A soldier who misses a round coming does not get a second look at it |
| **Speed decides** | Whether it reacts at all is a chance, and how long it takes is a latency, both from Speed. Jumping follows the same rule as ducking |

## Orders

| Order | |
|---|---|
| **Move there** | You name a destination, not a route. Once there, it holds that position |
| **Regroup** | It goes back to escorting you |

**Accepting.** A squadmate weighs the danger of getting there and of staying
there. A dangerous direct route with a reasonable safer way around is an ordinary
order, and it takes the safer way without comment. A wounded squadmate accepts
less danger than a healthy one.

| Outcome | What it does | It says |
|---|---|---|
| **Active** | Carries out the order | "Moving!" |
| **Delayed** | Takes cover, keeps the order, and goes once there is an opening | "Waiting for that gunner to stop firing!" |
| **Refused** | Declines and stays with what it was doing, taking defensive action | "Are you crazy?! That's suicide!" |
| **Abandoned** | Gives up a position it can no longer hold and falls back to escorting you | "I can't hold this position! Falling back!" |

| | |
|---|---|
| **Impossible ≠ too dangerous** | A place it cannot reach and a place it will not go get different explanations |
| **No silent return** | A refused or abandoned order does not come back when the danger passes. A delayed one does |
| **You can see the state** | Active, delayed, refused and abandoned are visible on the squadmate, not only spoken |
| **No force-obey** | There is no way to make a squadmate accept an order it has refused |

## What a squadmate is doing at any moment

| Layer | Changes | Example |
|---|---|---|
| **Its goal** | When you order it, or when it gives up | Escort you · hold that doorway |
| **Its current concern** | As fights start and end | Travelling · fighting · in cover |
| **Where it is standing next** | On arrival or a real change in danger | The crate top with a shot line |

Fighting and cover are concerns, never goals. Both end and hand back to the goal.

## How stats change it

| Stat | |
|---|---|
| **Health** | Sets how much it can take, and so how soon it counts as wounded |
| **Speed** | Dodge chance and latency, for ducking and jumping alike |
| **Aim** | Unchanged — shot grouping |
| **Nerve, traits** | Play no part |

## Does not cover

| | |
|---|---|
| **Blasts** | Dodging and cover consider direct and arcing rounds only |
| **Kneeling for cover** | A squadmate kneels only to duck |
| **Planned cover stops** | Cover partway through a trip is a reaction to fire, never a waypoint |
| **Hunting and searching** | A squadmate does not go looking for enemies it cannot perceive |
| **Squad tactics** | No roles, flanking or coordinated attacks. Spreading out is the only thing squadmates do in relation to each other |
| **Forcing an order** | See Orders |
