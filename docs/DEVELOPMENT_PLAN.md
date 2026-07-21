# Development Plan — Vertical Slice

> **Goal:** one complete, playable pass through the core loop that exercises every
> core system at least once. Breadth is deferred; the slice proves the game works
> end to end.
> **Companion docs:** [GDD](GDD.md).
> **Last updated:** 2026-07-21

---

## 1. What the vertical slice is

A player can play a short mini-campaign (2–3 missions) that touches the whole loop:

1. Hire a small squad in the Barracks.
2. Pick a mission from a short list (Operations).
3. Deploy 1–3 soldiers into a run-and-gun action level with AI companions.
4. Fight JSON-defined enemies — shoot, take damage, and lose soldiers permanently.
5. Collect loot and reach the exit, or fail the mission if the squad is wiped.
6. Return to base; see results (loot recovered, casualties).
7. Sell loot for credits.
8. Spend credits — hire, or commission one weapon in Engineering.
9. Advance time; commissioned work completes; new missions appear.
10. Watch campaign health move; the slice can be won or lost on it.

If a player can do all ten without leaving the app or hitting a dead end, the slice
is done.

### Success criteria

- [ ] Hub and mission share one continuous game state (money, roster, loot, campaign).
- [ ] A soldier's death in a mission permanently removes them from the roster.
- [ ] At least one enemy type fights back with authored behavior (not a stationary target).
- [ ] Loot from a mission converts to credits that can be spent.
- [ ] At least one weapon is defined entirely in JSON and usable in a mission.
- [ ] Time advances and gates at least one build/research action.
- [ ] Campaign health can reach a lose state, and the slice has a win state.
- [ ] The whole loop runs on placeholder art without crashing or soft-locking.

---

## 2. Scope

**In:** the loop above; one action level template; 2–3 enemy archetypes; one squad of
up to 3; shooting + damage + permadeath; loot → credits; a short mission list; a
minimal time model; one weapon-commission path; a single campaign-health value; one
AI-authored weapon as proof of the content pipeline.

**Out (deferred past the slice):** Robotics / exo-suits / drones / vehicles; base
upgrades; the base-defense mission; the endgame assault; full research trees; deep
enemy variety; final art and audio; multiple level biomes; balancing beyond
"playable."

---

## 3. Current state

- **Action prototype** (`game.html`, `src/main.js` + `input/player/world.js`):
  fixed-timestep loop, a controllable player, gravity, per-axis platform collision,
  scrolling camera. Level is hardcoded in `world.js`. No combat, no enemies.
- **Base hub** (`index.html`, `src/base/*`): five rooms, functional Barracks, hiring
  → roster flow, credits. State lives in `src/base/state.js`.
- **Gap:** the hub and the mission are **separate HTML pages with separate module
  state**. There is no shooting, no enemy, no loot, no mission selection, no time,
  and no bridge between the two halves.
- **Planned dependency:** AI content generation goes through the Player2 API
  (`player2-api.yaml`, client to live in `src/player2/`). Relevant only to Phase 6.

---

## 4. Phases

Each phase is independently testable and leaves the build runnable. Rough size tags:
**S** ≈ small, **M** ≈ medium, **L** ≈ large.

### Phase 0 — One app, one state  **(M)**
Make the hub and the mission a single application that shares state.
- Introduce a scene manager (Hub / Mission / Results) in one page, or a shared
  `game-state` module both pages read/write via storage.
- Move money, roster, loot, and campaign values into one authoritative state object.
- A **deploy** action carries a chosen squad from the hub into a mission; a
  **return** action carries the mission result back.
- *Done when:* you can start in the hub, enter a stub mission, and come back with the
  same money and roster intact.

### Phase 1 — Data-driven entities  **(M)**
Turn hardcoded content into JSON the engine loads at runtime. First slice of the
primitive library.
- Define JSON schemas: `level`, `entity`, `weapon`, `enemy` (subset only).
- Write a loader that instantiates game objects from JSON.
- Replace `world.js` with a hand-authored level JSON.
- Express the player as a JSON-driven soldier entity.
- *Done when:* the existing prototype runs entirely from JSON files, no behavior change.

### Phase 2 — Combat  **(L)**
Add the verbs of a run-and-gun.
- Weapon firing: fire mode, fire rate, projectiles.
- Effect primitives, starting with `damage` (each carries a cost field for later).
- Health, hit detection, and death for both soldiers and enemies.
- One enemy that can be shot, takes damage, dies, and drops loot.
- Minimal HUD: health, current weapon/ammo.
- *Done when:* you can shoot an enemy, it dies and drops loot, and it can kill you.

### Phase 3 — Squad, companions, and mission outcome  **(L)**
- Deploy up to 3 soldiers; player controls one, AI controls the rest.
- Companion behavior: follow, keep up, shoot enemies in line of sight.
- Control swaps to a living soldier on death; death removes the soldier from the roster.
- Mission **success** (reach the exit / clear the level) and **failure** (squad wiped).
- Collect loot into a mission-result payload.
- *Done when:* a 3-soldier deployment can partially wipe, still succeed, and return a
  result that reflects who died and what was recovered.

### Phase 4 — Enemy behavior  **(M)**
- Behavior/steering parameters in enemy JSON (not live LLM control).
- 2–3 archetypes with distinct behavior (e.g. a charger, a repositioning shooter).
- Clear attack telegraphs.
- *Done when:* enemies move and attack with intent, and their threat reads fairly.

### Phase 5 — Meta loop  **(M)**
Close the loop around the mission.
- Mission list + selection screen (minimal Operations).
- Results screen: loot recovered, casualties.
- Sell loot → credits.
- Time model: advancing time completes timers and refreshes the mission list.
- Campaign-health value with a lose threshold and a slice win condition.
- *Done when:* you can run mission → results → sell → advance time → next mission, and
  win or lose the slice on campaign health.

### Phase 6 — AI authoring proof (Player2)  **(L)**
Prove the content pipeline with one generated weapon. *Recommended in-slice; can be
deferred if it threatens the schedule — Phases 1–5 already run on hand-authored JSON.*
- Review `player2-api.yaml`; choose the concurrency model (async jobs map cleanly to
  R&D timers). Build the client in `src/player2/`.
- Engineering screen: commission a weapon from a prompt ("a drone that shoots fire").
- Generation returns JSON validated against the schema **and** the cost/budget table;
  reject or repair invalid output.
- An R&D timer gates completion; the finished weapon is usable in a mission.
- *Done when:* a commissioned weapon is generated, validated, built over time, and
  fired in a mission.

### Phase 7 — Integration and polish  **(M)**
- End-to-end playtest of the full 2–3 mission mini-campaign.
- Balance pass to "playable"; fix soft-locks and state bugs.
- Consistent placeholder art; readable HUD and transitions.
- Optional: save/load of game state.
- *Done when:* the slice plays start to finish and meets every success criterion in §1.

---

## 5. Sequencing and dependencies

- **Critical path:** 0 → 1 → 2 → 3 → 5 → 7. Phase 0 unblocks everything; Phases 2 and
  3 are the largest and highest-risk.
- **Phase 4** can start once Phase 2 has enemies, and can overlap Phase 5.
- **Phase 6** depends only on Phase 1's schema + Phase 5's Engineering/time hooks; it
  can be built late or deferred without blocking a playable slice.
- Keep the cost field on every effect from Phase 2 onward so Phase 6's budget check has
  data to validate against.

---

## 6. Key decisions to settle before or during

- **Scene model:** single-page scene manager vs. two pages sharing stored state
  (recommend single-page — simpler shared state).
- **Mission end:** reach-the-exit vs. clear-all-enemies for the slice (recommend
  reach-the-exit, so partial wipes can still succeed).
- **Nerve:** whether it does anything mechanical in the slice, or stays cosmetic for now.
- **Player2 concurrency model:** sync-queue vs. async-jobs vs. streams (async-jobs fit
  R&D timers).
- **Save/load:** in the slice or after.

---

## 7. Risks

- **Phase 0 plumbing** is unglamorous but blocks the whole slice; do it first and do
  it properly.
- **Companion AI (Phase 3)** is the biggest unknown in a fast run-and-gun; start with
  the simplest useful behavior (follow + shoot) and only add to it if it reads badly.
- **Combat feel (Phase 2)** is where the game is won or lost; budget time to tune the
  feel constants, not just make it functional.
- **AI validation (Phase 6):** generated JSON will sometimes be invalid or unbalanced;
  the validate-and-repair-or-reject step is required, not optional.
```
