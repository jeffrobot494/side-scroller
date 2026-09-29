---
type: design
category: artificial-intelligence
status: unbuilt
resolution: sharp
related: [soldier-behavior, agent-navigation, squad-agent-development, advanced-agent-navigation]
---

# Squadmate survival

How a squadmate stays alive while staying useful.

## The rule everything follows

| | |
|---|---|
| **Survival first** | A squadmate protects itself by default |
| **Useful, not hiding** | Safety is traded for usefulness only as far as the danger demands. When the pressure drops, it goes back to work |
| **One idea of danger** | Where to stand, when to take cover and which way to walk all ask the same two questions: *what can hit me there* and *what can I hit from there* |
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
| **Afterwards** | It goes back to fighting, or to escorting you if the fight is over |

## Travel

| | |
|---|---|
| **Safer routes** | A route is judged by its danger as well as its length. A longer covered route beats a short exposed one when the difference is worth it |
| **Cover partway is a reaction** | It stops in cover when fire arrives, not at planned waypoints, then carries on to where it was going |
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

## What a squadmate is doing at any moment

| Layer | Changes | Example |
|---|---|---|
| **Its goal** | Never — it escorts you | Stay with you |
| **Its current concern** | As fights start and end | Travelling · fighting · in cover |
| **Where it is standing next** | On arrival or a real change in danger | The crate top with a shot line |

Fighting and cover are concerns, never goals. Both end and hand back to escorting you.

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
| **Orders** | You cannot direct a squadmate. It escorts you and fights on its own |
| **Blasts** | Dodging and cover consider direct and arcing rounds only |
| **Kneeling for cover** | A squadmate kneels only to duck |
| **Planned cover stops** | Cover partway through a trip is a reaction to fire, never a waypoint |
| **Hunting and searching** | A squadmate does not go looking for enemies it cannot perceive |
| **Squad tactics** | No roles, flanking or coordinated attacks. Spreading out is the only thing squadmates do in relation to each other |
