# Development Plan — Vertical Slice

> **Goal:** one complete, playable pass through the core loop that exercises every
> core system at least once. Breadth is deferred; the slice proves the game works
> end to end.
> **Companion docs:** [GDD](GDD.md).
> **Last updated:** 2026-07-21
>
> **NOTE (later than this doc):** the game has moved past this vertical-slice
> plan — missions are now procedurally generated (leads board), the editor has
> GUI tools (Weapon/Enemy Designers, Level Generator, Firing Room), the weapon
> effect library + a 24-weapon arsenal, and a crouch mechanic. For the current
> state see `CLAUDE.md` (“Current status”) and `docs/LEVEL-GENERATION.md` +
> `docs/ASSET-GENERATION.md` for the active roadmap. The status below describes
> the original slice only.
>
> **STATUS: vertical slice built (Phases 0–5 + 7).** The whole loop runs as a
> single-page app: hire → deploy → run-and-gun mission with companions and
> permadeath → results → sell loot → commission a weapon in Engineering →
> advance the day → next mission → win on the Hive Core or lose to the doom
> clock. Phase 6 (live LLM authoring via Player2) is deferred as planned; the
> Engineering commission path runs on hand-authored blueprint JSON in its place,
> which is the exact shape the LLM will later emit. Open `index.html` from a
> local server to play.

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

- [x] Hub and mission share one continuous game state (money, roster, loot, campaign).
- [x] A soldier's death in a mission permanently removes them from the roster.
- [x] At least one enemy type fights back with authored behavior (not a stationary target).
      *(Three: `charger`, repositioning `shooter`, telegraphing `turret`.)*
- [x] Loot from a mission converts to credits that can be spent.
- [x] At least one weapon is defined entirely in JSON and usable in a mission.
      *(All weapons are JSON in `src/game/content.js`; commissioned ones too.)*
- [x] Time advances and gates at least one build/research action.
      *(Advance the day in the War Room; Engineering builds finish on a timer.)*
- [x] Campaign health can reach a lose state, and the slice has a win state.
      *(Doom clock loses at 0; completing the Hive Core wins.)*
- [x] The whole loop runs on placeholder art without crashing or soft-locking.

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

The slice is built. `index.html` is now the single entry for the whole game; a
scene manager in `src/main.js` toggles between the DOM hub and the canvas
mission, both reading/writing one state object (`src/game/state.js`). `game.html`
redirects to it.

- **One app, one state** (`src/main.js`, `src/game/state.js`): money, roster,
  armory, stores (loot), engineering queue, day, campaign health, and mission
  progress all live in one object. Deploy carries a squad in; the result comes
  back and is applied in one place.
- **Content is data** (`src/game/content.js`): weapons, enemies, levels,
  missions, and engineering blueprints are all JSON-shaped data with `cost` /
  `budgetSpent` fields; `src/mission/entities.js` instantiates live objects from
  it. A human authors the same shape the LLM will later emit.
- **Combat** (`src/mission/*`): run-and-gun on the canvas — projectiles, damage
  and burn effect primitives, health/death, three enemy archetypes with
  telegraphs, minimal HUD.
- **Squad + companions**: deploy up to 3; player controls one, the rest are AI
  (follow + shoot); control swaps on death; permadeath removes the fallen from
  the roster; reach-the-exit success, squad-wipe failure.
- **Meta loop** (`src/hub/hub.js`): Operations mission list with unlocks, results
  screen, sell loot → credits, Engineering commission gated by a build timer,
  War Room advance-day + doom clock, and a campaign win/lose end screen.
- **Deferred:** Phase 6 live LLM authoring through the Player2 API
  (`player2-api.yaml`, `src/player2/`). The Engineering commission path stands in
  with hand-authored blueprint JSON until then. Robotics remains a placeholder.

---

## 4. Phases

Each phase is independently testable and leaves the build runnable. Rough size tags:
**S** ≈ small, **M** ≈ medium, **L** ≈ large.

### Phase 0 — One app, one state  **(M)** — ✅ done
Make the hub and the mission a single application that shares state.
- Introduce a scene manager (Hub / Mission / Results) in one page, or a shared
  `game-state` module both pages read/write via storage.
- Move money, roster, loot, and campaign values into one authoritative state object.
- A **deploy** action carries a chosen squad from the hub into a mission; a
  **return** action carries the mission result back.
- *Done when:* you can start in the hub, enter a stub mission, and come back with the
  same money and roster intact.

### Phase 1 — Data-driven entities  **(M)** — ✅ done
Turn hardcoded content into JSON the engine loads at runtime. First slice of the
primitive library.
- Define JSON schemas: `level`, `entity`, `weapon`, `enemy` (subset only).
- Write a loader that instantiates game objects from JSON.
- Replace `world.js` with a hand-authored level JSON.
- Express the player as a JSON-driven soldier entity.
- *Done when:* the existing prototype runs entirely from JSON files, no behavior change.

### Phase 2 — Combat  **(L)** — ✅ done
Add the verbs of a run-and-gun.
- Weapon firing: fire mode, fire rate, projectiles.
- Effect primitives, starting with `damage` (each carries a cost field for later).
- Health, hit detection, and death for both soldiers and enemies.
- One enemy that can be shot, takes damage, dies, and drops loot.
- Minimal HUD: health, current weapon/ammo.
- *Done when:* you can shoot an enemy, it dies and drops loot, and it can kill you.

### Phase 3 — Squad, companions, and mission outcome  **(L)** — ✅ done
- Deploy up to 3 soldiers; player controls one, AI controls the rest.
- Companion behavior: follow, keep up, shoot enemies in line of sight.
- Control swaps to a living soldier on death; death removes the soldier from the roster.
- Mission **success** (reach the exit / clear the level) and **failure** (squad wiped).
- Collect loot into a mission-result payload.
- *Done when:* a 3-soldier deployment can partially wipe, still succeed, and return a
  result that reflects who died and what was recovered.

### Phase 4 — Enemy behavior  **(M)** — ✅ done
- Behavior/steering parameters in enemy JSON (not live LLM control).
- 2–3 archetypes with distinct behavior (e.g. a charger, a repositioning shooter).
- Clear attack telegraphs.
- *Done when:* enemies move and attack with intent, and their threat reads fairly.

### Phase 5 — Meta loop  **(M)** — ✅ done
Close the loop around the mission.
- Mission list + selection screen (minimal Operations).
- Results screen: loot recovered, casualties.
- Sell loot → credits.
- Time model: advancing time completes timers and refreshes the mission list.
- Campaign-health value with a lose threshold and a slice win condition.
- *Done when:* you can run mission → results → sell → advance time → next mission, and
  win or lose the slice on campaign health.

### Phase 6 — AI authoring proof (Player2)  **(L)** — ⏳ deferred (blueprint JSON stands in)
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

### Phase 7 — Integration and polish  **(M)** — ✅ playable end to end
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
