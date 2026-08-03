---
type: design
category: vision
status: reference
resolution: sharp
tags: [vision]
---

# Vision

> **Working title:** XCOM Task Force (side-scroller)
> **Status:** Playable vertical slice. The full core loop runs end to end as a
> single-page app (hire → deploy → run-and-gun mission with companions +
> permadeath → results → sell → commission → advance day → win/lose). LLM
> authoring (Player2) is the remaining bolt-on; hand-authored blueprint JSON
> stands in for it. See [DEVELOPMENT_PLAN](development-plan.md).
> **Last updated:** 2026-07-21

---

## 1. High Concept

Aliens are secretly invading Earth. An XCOM-style task force must stop them before
the globe descends into chaos. The player runs a hidden underground base — hiring
soldiers, commissioning weapons and machines, and choosing which missions to take —
and personally fights the **2D side-scrolling run-and-gun action missions** that are
the heart of play.

The game is about **drama**. Soldiers are people with names, faces, and stories, and
they die permanently. The campaign can be lost even if your people live. We
manufacture grief and tension on purpose, and we lean into the brutal, unfair chaos
of the fight.

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

- **AI-generated levels**, seeded by the current story, a location, and the strength
  of the aliens.
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
```
