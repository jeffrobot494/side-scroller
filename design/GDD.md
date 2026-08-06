---
type: design
category: vision
status: reference
resolution: sharp
tags: [vision]
---

# Vision

> **Working title:** XCOM Task Force (side-scroller)
> **Status:** Playable end to end and built well past the original vertical
> slice. `CLAUDE.md` is the accurate account of what exists; the status notes in
> §13 and the repo layout in §12 predate most of it.
> **Setting:** rewritten 2026-08-06 — the game is now about a timeline the aliens
> already altered, not an invasion in progress. §1 is current; older sections
> written against the invasion framing have not all been revisited.
> **Last updated:** 2026-08-06

---

## 1. High Concept

**The invasion already succeeded, and nobody alive remembers it happening.**

Sometime in the last hundred years, lizard people reached back and altered Earth's
timeline. One intervention or a dozen — the shape of it is unknown. What is certain
is that the timeline we live in is not ours, and that every human being on Earth is
a willing, grateful, entirely unwitting servant of the species that rewrote them
into it.

The player runs the one secret organisation that detected it. Its purpose is to break
the lizards' hold — to free the human race from their thrall.

| | |
|---|---|
| **The enemy** | Lizard people. Powerful time travellers, and far better at it than the player |
| **Operations** | Cmdr. Voss's job becomes identifying **points of intervention** — moments where the lizards reached into history and bent it |
| **A mission** | Travel to that moment and interfere with it |
| **The opposition** | There are many interventions, and the lizards detect incursions and meet them. The squad is never unmolested when it arrives |
| **The one fixed thing** | Humanity is enslaved and the player intends to end that. Everything else about the world is in play |

A mission therefore has a **when** as well as a **where**.

The player runs a hidden underground base — hiring soldiers, commissioning weapons
and machines, and choosing which points in time to strike — and personally fights the
**2D side-scrolling run-and-gun action missions** that are the heart of play.

The game is about **drama**. Soldiers are people with names, faces, and stories, and
they die permanently. The campaign can be lost even if your people live. We
manufacture grief and tension on purpose, and we lean into the brutal, unfair chaos
of the fight.

### 1.1 There is no correct timeline

**The player is not restoring history.** There is no original, proper version being
repaired and nothing is scored against one. The single constant is that humanity
belongs to the lizards and the player means to undo it.

Every mission alters history — not only the failures. When one ends, the story
generator takes the outcome (binary success/failure to begin with; richer signals
later) and writes what follows, open-endedly. The result is not required to be tidy
or to trend back toward anything.

Worked example: kill the lizard assassin in 1939 and Hitler lives out the war we
remember. Fail, and he does not — and a Europe with no Second World War is a Europe
where France may look east, judge Germany weak, and invade. That world produces its
own points of intervention, which become the next missions, which diverge again. As
the player succeeds, the lizards shift from defending their original work to actively
countering the player, and the divergence accelerates.

| Intended feel | |
|---|---|
| **Recognisable** | Real centuries, real countries, people the player has heard of |
| **Surprising** | Consequences are the LLM's to draw, and it will draw ones nobody considered |
| **Often funny** | Compounded alternate history is inherently absurd |
| **Occasionally shocking** | It is permitted to go somewhere the designers would not have chosen |

Compounding is the point. One divergence is a premise; six stacked on each other is a
history nobody has read — including the people who made the game. No two campaigns
produce the same world.


### 1.2 The time machine is a prototype

The machine works. It is not *good*. It consumes enormous amounts of energy and it is
imprecise, and the constraints that fall out of that are where the novelty of this
game lives.

| | |
|---|---|
| **Arriving off-target** | Miss by a decade and the target the squad came to kill is a child, or already dead. Improvise — find someone else to save, or someone else to stop |
| **Paying for the return** | Getting home costs energy that must be found, salvaged, or stolen on site. Come up short and the soldiers are stranded in that century |
| **A collapsing warp bubble** | The bubble fails on its own schedule and yanks the squad back to the present mid-mission, finished or not |

> **Not settled.** Which of these ship, and in what combination, is design work still
> to be done — see §14. The three rows above are the space being explored, not a
> specification, and nothing should be built against them yet.

---

## 2. Design Pillars

1. **The action layer** — 2D side-scrolling platforming combat. Fast, arcade
   run-and-gun (Metal Slug / Contra / Cuphead lineage). This is the main gameplay.
2. **The strategy layer** — the underground base: staff, research & development,
   time passing, mission selection, campaign health, and permadeath roster
   management (XCOM-style meta).
3. **The economy glue** — the loop that ties them together: fight → loot → sell →
   invest → time passes → new missions → fight again, under a doom clock.

Everything else serves these three and the drama they generate.

---

## 3. The Core Loop

1. Play an action mission; recover **alien corpses and artifacts** as loot.
2. Sell corpses and artifacts for **credits**.
3. Spend credits — invest in staff (better weapons, better robots, better missions),
   hire soldiers, or **upgrade the base**.
4. **Let time pass** (XCOM-style). Research and fabrication take in-game time.
5. New **missions appear**. The player chooses which to take on. Operations can
   surface especially deadly missions offering the best/most exotic rewards.
6. Deploy a squad and fight. **Permadeath**: any soldier who dies is gone forever.
   If the whole deployed squad is wiped, the mission fails.
7. Return to base, take stock, repeat.

Over the campaign, doing well enough opens the endgame; doing poorly loses it.

---

## 4. Locked Design Decisions

These are settled and drive everything downstream.

| Decision | Choice | Notes |
|---|---|---|
| **Combat feel** | Run-and-gun | Fast, arcade, movement + shooting heavy. Enemies must telegraph hard. |
| **Squad in a mission** | AI companions on-map | The whole deployed squad is on the level at once; player controls one soldier, AI controls the rest, and control swaps on death. Mission fails only when the squad is wiped. |
| **Permadeath / fairness** | No safety nets | Allied soldiers die permanently and often unfairly. No durability buffs, no downed-and-revive. Permadeath **is** the drama engine — the job is to make death meaningful, not to soften it. |
| **AI content timing** | Generation-time, cached to JSON | The LLM runs when content is commissioned (weapon / research / mission), emits validated JSON, and the engine then runs that JSON deterministically. **No LLM in the game loop** — the game stays fast, offline-capable, and cheap. |
| **Tech / architecture** | From scratch, plain JS, no framework | HTML5 Canvas for action missions; HTML/CSS/DOM for base/meta UI. No build step for now. Portable to Phaser later if needed — game logic transfers, only rendering calls change. |

---

## 5. The Core Architectural Bet: A Primitive Library + AI Authoring

The engine implements a **fixed library of primitives** — properties, effects,
behaviors, and level pieces — each expressible as **JSON**. All game content
(weapons, enemies, levels, robots, drones) is data composed from these primitives.

- **The LLM is an author, not a source of new capability.** "A drone that shoots
  fire" only works because `projectile`, `emit`, `damage`, and `burn` are already
  real, tested engine primitives. The LLM composes existing primitives into valid
  JSON; it never invents new engine features.
- **The game is fully buildable and testable with hand-written JSON and no AI.**
  A human can author the same JSON the LLM will later produce. The LLM is therefore
  **bolted on last** and is not on the critical path.
- **All AI-created content is editable JSON**, read at runtime. New content drops
  into the game as data.

### 5.1 Balance: the cost / budget system

For AI (and human) creations to be **fair**, every primitive/effect carries a
**cost**, and each item has a **budget** (set by tech tier / how much the player
invested). A weapon is legal only if its effects fit its budget. This cost table is
the **balance backbone of the whole game** and the LLM's hard guardrail. It must
exist before the first generated weapon.

Illustrative weapon JSON:

```jsonc
{
  "id": "drone_fire_01",
  "type": "companion_drone",
  "budget_spent": 40,            // must be <= tech-tier budget
  "body": "small_hover",
  "behavior": "orbit_owner",
  "weapon": {
    "fire_mode": "projectile",
    "projectile": "fireball",
    "fire_rate": 2.0,
    "effects": [
      { "kind": "damage", "amount": 8, "cost": 8 },
      { "kind": "burn", "dps": 4, "duration": 3, "cost": 12 }
    ]
  }
}
```

---

## 6. The Base and Its Staff

The base is presented as **rooms and tunnels in an underground bunker**. Each room is
run by a key NPC the player interacts with.

| Room | NPC | Role |
|---|---|---|
| **Barracks** | Sgt. Bishop | Hire, view, and manage soldiers. |
| **Engineering** | Dr. Halden | Builds weapons and equipment (AI-authored under the player's direction — e.g. "I need a drone that shoots fire"). |
| **Robotics** | Icarus | Builds robots, exo-suits, drones, and vehicles. |
| **Operations** | Cmdr. Voss | Researches and surfaces better / more important / more dangerous / more lucrative missions. |
| **War Room** | The Council | Monitors overall campaign health and the doom clock. |

**Tone:** at the start of the campaign the task force is **optimistic and elite** —
the best of the best, excited to save the world. The darkness is earned over time
through loss, not front-loaded.

**Base upgrades:** credits can also be spent improving the base itself (scope TBD).

---

## 7. Soldiers — the Heart of the Game

Soldiers are the emotional core. They are individuals with names, callsigns, origins,
portraits, and dramatic backstories, and their permanent deaths are the point.

### 7.1 Soldier data model (current)

```
id, name, callsign, age, origin,
bio,                                  // dramatic backstory — why you care when they die
stats: { aim, health, speed, nerve }, // each 1–10
traits: [ "Reckless", "Loyal", ... ], // flavor behavior + story
cost,                                 // credits to hire
status: "recruit" | "roster" | "deployed" | "dead",
record: { missions, kills }
```

- **Aim** — accuracy / hit chance.
- **Health** — how much punishment they take.
- **Speed** — movement + reaction speed.
- **Nerve** — composure under fire. Low nerve → panics, freezes, breaks. *(Exact
  mechanic TBD — a candidate morale/panic system.)*
- **Traits** — short tags that flavor behavior and generate story.

Later, the LLM generates recruits (backstories, traits, stat spreads) as this same
JSON shape.

### 7.2 Permadeath rules

- A soldier who dies on a mission is **gone permanently**.
- On death mid-mission, control passes to another living squad member.
- If everyone deployed dies, the **mission fails**.
- Back at base, the player can take control of / build up other soldiers.

---

## 8. Enemies

- A set of **hand-authored base enemy types**, then **frequent LLM
  modification and invention** of new enemies (same primitive/JSON approach as
  weapons; intelligence expressed as behavior-tree / steering parameters authored at
  generation time — **not** live LLM control).
- Design goal: **fewer enemies than a normal action game, but smarter** — more
  mobile, more tactical, frequently deadly. In run-and-gun, one enemy that
  repositions and zones the player is worth ten dumb ones.
- Enemies must **telegraph** clearly, since at run-and-gun speed unreadable damage
  reads as unfair.

---

## 9. Missions

- **AI-generated levels**, seeded by the current story, a point in time, a location,
  and the strength of the aliens.
- Delivered as editable JSON the engine reads at runtime.
- Operations can surface **high-risk / high-reward** missions. Some research or the
  most powerful gear may **require special parts recoverable only on missions** —
  e.g. the top-tier gear runs on **nuclear-fusion / alien tech** that must be
  recovered or stolen in the field.

### 9.1 Special mission types

- **Base defense** — at least one mission where the aliens attack the base and the
  player must defend it. Triggered by some factor (TBD); possibly avoidable.
- **Endgame assault** — do well enough in the campaign to discover an alien base or
  homeworld, then launch an attack to end the invasion for good.

---

## 10. Campaign Health / Failure

- A **War Room** tracks the overall health of the campaign.
- If the aliens are too successful — if the player doesn't do enough to stop them —
  the **campaign can be lost even if every soldier is still alive** (XCOM-style doom
  clock).

---

## 11. Build Sequencing (Vertical Slice First)

Each of the three pillars is a full project on its own. We ship a vertical slice, not
breadth, in roughly this order — while the current work builds the roster first
because it depends on none of the combat vocabulary and plants the emotional core.

0. **[In progress] Base hub + soldier hiring screen** — the emotional anchor.
1. **Data-driven action core (no AI, no meta)** — engine loads a JSON level + JSON
   enemies + a JSON weapon and plays one hand-authored run-and-gun mission.
2. **Primitive libraries + cost/budget system** — effects, enemy behaviors, level
   pieces, each with a balance cost.
3. **Minimal meta loop** — loot → sell → one investment (weapons) → time passes →
   next mission; a full campaign playable end-to-end with placeholder art.
4. **LLM authoring bolted on** — the LLM emits the same JSON a human was writing.
5. **Depth** — Robotics / Operations / War Room / base defense / endgame.

---

## 12. Technical Architecture

- **From scratch, plain JavaScript, ES modules, no build step.** Runs from a static
  server.
- **Base / meta UI:** HTML/CSS/DOM (`index.html` = base hub, styled as underground
  rooms and tunnels).
- **Action missions:** HTML5 Canvas with a **fixed-timestep** game loop
  (`game.html`), so physics feel identical regardless of refresh rate.
- **Content:** editable JSON, read at runtime, composed from the primitive library.
- **Repo layout (current):**

```
index.html            single entry — scene manager mounts hub (DOM) or mission (canvas)
game.html             legacy entry; redirects to index.html
src/
  main.js             app bootstrap + scene manager (hub ↔ mission)
  game/
    content.js        WEAPONS / ENEMIES / LEVELS / MISSIONS / BLUEPRINTS + tuning (the JSON library)
    soldiers.js       soldier schema + starting recruit pool
    state.js          unified game state + actions (hire, commission, sell, advanceDay, mission result)
  hub/
    hub.js            all DOM screens: rooms, deploy, results, win/lose
    hub.css           underground-bunker styling
  mission/
    mission.js        canvas run-and-gun scene (fixed-timestep loop, HUD, outcome)
    entities.js       Actor/Soldier/Enemy/Projectile/Loot + physics + loader
    ai.js             companion + enemy behaviors, shared fire()
    input.js          keyboard for the action layer
  player2/            Player2 API client (Phase 6, not yet wired)
docs/
  gdd.md              this document
  development-plan.md vertical-slice plan + status
```

---

## 13. Current Implementation Status

The vertical slice is playable end to end (see DEVELOPMENT_PLAN §3):

- **One app, one state:** a scene manager unifies the DOM hub and the canvas
  mission over a single game-state object.
- **Action missions:** run-and-gun combat — projectiles, `damage` + `burn`
  effect primitives, health/death, three enemy archetypes (charger,
  repositioning shooter, telegraphing turret), a squad of up to 3 with AI
  companions, control-swap on death, and permadeath.
- **Base hub:** Barracks (hire), Engineering (commission a weapon on a build
  timer), Operations (mission list + sell loot), War Room (campaign health +
  advance the day). Robotics stays an honest placeholder.
- **Campaign:** three-mission arc with unlocks, a doom clock that loses the
  campaign at 0, and a win on destroying the Hive Core.
- **Deferred:** live LLM authoring via Player2 (hand-authored blueprint JSON
  stands in), Robotics, base defense, and the wider endgame.

---

## 14. Open Questions / To Be Designed

- **Nerve / morale:** what low nerve actually does under fire (panic, freeze, flee,
  friendly fire?).
- **Squad AI:** companion behavior, target selection, pathing across platforms, and
  whether friendly fire exists.
- **Time model:** how time passes, how long R&D takes, how missions expire.
- **Economy tuning:** loot values, hire/upkeep costs, investment costs, doom-clock
  rate.
- **Base-defense trigger** and whether/how it can be avoided.
- **Primitive & cost library contents** — the first concrete vocabulary (weapons and
  damage first).
- **Mission JSON spec** — arenas, spawns, loot, exit.
- **Art direction** beyond placeholders.
- **Time-machine constraints (§1.2)** — which of arriving off-target, paying for the
  return trip, and the collapsing warp bubble actually ship, and how they combine.
- **Improvisation** — what the squad does when it lands in the wrong decade, and how
  a mission states an objective loose enough to survive that.
- **Points of intervention** — how Operations surfaces them out of the current
  timeline, and how any mission outcome propagates into the missions that follow.
- **Mission outcome signal** — success/failure is the starting point; what richer
  signal the story generator should receive is undecided.
- **Winning** — what "humanity is free" looks like as a state the campaign can reach,
  given that there is no target timeline to arrive at.
```
