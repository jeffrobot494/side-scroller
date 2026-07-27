---
status: plan
tags: [ai, enemies, companions, editor]
---

# Behavior Lab — a sandbox for agent intelligence

A plan for (a) an editor tool to develop, test, and iterate on the behavior of
intelligent agents — companions AND enemies — and (b) the road from where the
AI is today to enemies/companions that navigate complex levels, coordinate as a
group, and read the player. Companions are the entry point because they are
currently the *least* intelligent thing in the game and the fix is shared with
enemies.

Reference: `docs/smarter_enemy_ai_2d_action_shooter_platformer.md` (the eight-item
ladder this plan tracks against) and `docs/llm_adaptive_enemy_system_plan_v2.md`
(the EnemySpec format the enemies already run on).

## Audit — what the implemented AI actually supports

The enemy runtime (`src/mission/enemyspec/` = brain / perception / runtime) is
real and proven, not a stub. Mapping it against the smarter-AI doc's ladder:

| # | Ladder item | Status | Where |
|---|---|---|---|
| 1 | Preferred combat ranges | **Done** | `keepDistance` motion; `moveTo` offsets (standoff/perch) |
| 2 | Gap / wall awareness | **Partial** | `sense.groundAhead` (single front probe), `sense.los` (segment-vs-AABB). No gap-width, no reachability. |
| 3 | Platform navigation links | **Missing** | only `chase`'s crude auto-hop (`vy=-560` when target is 40px up or vx stalls) |
| 4 | Predictive, imperfect aim | **Done** | `patternAngles` current/lead/landing + randomized prediction time + jitter |
| 5 | Last-known-position memory | **Done** | `sense.timeSinceSeen` / `lastSeenX/Y` / `seenOnce`; `moveTo target:"lastSeen"` |
| 6 | Utility action selection | **Done** | `tickUtility`: `when` gates, numeric `score`+noise, cooldowns, decisionInterval, windup→steps→recovery, no mid-commit cancel |
| 7 | Player-habit tracking | **Missing** | no habit counters, no events for "player jumped/dodged" |
| 8 | Group coordination / roles / tokens | **Missing** | each spec root is an island; `role` is metadata; `signal` is intra-tree only |

Cross-cutting themes from the doc: **reaction delay + commitment** is done
(0.2s perception cadence, decisionInterval, windup/recovery, telegraph);
**intelligence-vs-difficulty separation** is done and formalized (`intelligence`
1–5 rubric in `schema.js`, priced separately from `threat`).

**Is it "really working"?** Yes, for *single-enemy 1v1 tactics on flat/lightly
platformed arenas.* The built-in mission roster (`src/game/enemyspecs.js`) proves
it: `cowardly_duelist` and `sky_duelist` are genuine level-4 utility brains —
they lead their aim, back-hop when the player closes, climb away when hurt, and
hunt the last-seen position when line of sight breaks. The rest are deliberately
simple fodder (scripted tracks, `aim:"current"`). So the ceiling is consistent:
**every** built-in enemy is a lone actor on essentially flat ground.

### Concrete gaps and one real bug

- **Squad fixation (bug).** Perception and movement both target
  `firstLiving(scene.soldiers)` / `player(scene)` — the *first* living soldier in
  the list, not the *nearest* or most threatening. With a 3-soldier squad, every
  enemy fixates on soldier[0] regardless of who is closer or shooting them. Fix
  belongs in Slice 0.
- **Navigation is the dominant gap.** Enemies steer toward a point and hop
  crudely; they cannot decide *which platform to jump to* or path across a
  multi-elevation level. This is exactly the capability that matters as levels
  grow the "multiple elevations, passages" the project is heading toward.
- **No group intelligence.** Three enemies vs the player is three independent
  brains spamming in parallel — no turns, no flanking, no suppression.
- **No player-reading.** Nothing tracks player habits, so no enemy can punish a
  repeated jump/dodge/camp.
- **Companions are worse than enemies.** `updateCompanion` (`src/mission/ai.js`,
  ~28 lines) ignores the entire perception+utility stack: follow the leader,
  shoot the nearest enemy within 520px and a 70px vertical band, keep 240px
  standoff, hop if the leader is above. No preferred range, no memory, no
  navigation, no utility scoring.
- **Known, already-documented:** `on.spawn` handlers run with no scene
  (`fire`/`spawn`/`sound` skipped) — see SOUND.md "Known issues".

**Takeaway:** the hard part (a data-driven utility brain + perception + imperfect
aim) is built and shipping. The missing pieces are the three that scale with level
complexity — **navigation, coordination, habit-reading** — plus lifting companions
onto the same brain the enemies already use.

## The unifying idea: one agent brain, two allegiances

The brain/perception/utility machinery is not enemy-specific — it is an *agent*
brain that happens to always target "the player." Make the target and the
allegiance parameters and the same code drives a companion. That single change
is what makes a *companion* sandbox worthwhile: improving intelligence improves
both sides at once, and the ideal iteration loop becomes "author a brain, put it
on a companion and watch it fight, then put it on an enemy and fight it
yourself."

So the sandbox is not a companion-only tool — it is a **two-team agent
observatory**, and companions are simply the team we most want to level up first.

## The Behavior Lab (editor Tools tab)

`createBehaviorLab(container, onBack) → { dispose() }`, registered like every
other tool (TOOLS entry + MOUNTABLE + factory; one synchronous `draw()` at mount;
`dispose()` cancels the rAF loop). It is the Firing Room's cousin, but oriented
around *seeing and comparing decisions* rather than testing weapons — it reuses
the mission runtime, the spec runtime, `combat.js`, and the level generator.

What it adds over the Firing Room:

1. **Two authorable teams.** A blue roster (companions) and a red roster
   (enemies), each populated from the spec library + built-in roster. Drop N of
   each onto the level. Either team can be frozen into dummies so you study the
   other.
2. **A real level, not a flat range.** Load a generated level by seed (reuse the
   Level Generator) or hand-place platforms — navigation is the thing we most
   need to see, so multi-elevation geometry is the default.
3. **Observability overlays (the whole point).** Per selected agent, draw the
   invisible decision process:
   - LOS line to target; perception rays.
   - Live `sense.*` readout (dist, los, above/below, approaching, cornered,
     timeSinceSeen) as a floating label.
   - **Utility scoreboard** — every action's current score, the gate result, and
     the winner. This is the single most valuable view; `tickUtility` already
     computes it, it just needs to be exposed.
   - Current commitment: action + phase (windup/steps/recovery) + telegraph.
   - Move-order target, dash vector, last-seen marker, preferred-range ring.
4. **Time control.** Pause, step-one-frame, slow-mo (0.25×), fast-forward.
   Decisions happen every 0.2–0.5s and are invisible at real speed — frame-step
   is essential.
5. **Levers (live, no reload; numeric ones go in the config SCHEMA).**
   - Global: decisionInterval scale, perception-interval scale, reaction-delay
     scale, aim-error scale, and a **"god eye"** toggle that disables LOS
     occlusion — to isolate a navigation bug from a perception bug.
   - Per-agent: choose the spec, freeze the team, override intelligence knobs.
   - **Scenario presets:** 1v1 duel; 2 companions escort vs 3 enemies; "agent
     must cross 3 gaps to reach the fight"; elevation standoff.
6. **Scripted player stand-in.** A "ghost player" running a fixed pattern (always
   jumps when fired on, camps a platform, dodges one direction) so enemy
   habit-reading and companion target-priority can be tested deterministically.
7. **Metrics panel.** Per run: time-to-engage, hit/miss, deaths, distance
   travelled, % time at preferred range, decisions/sec, and a **stuck detector**
   (oscillating / not progressing toward target). Turns "feels dumb" into a
   number to iterate against — and later becomes the LLM's feedback signal.
8. **Record / replay + A/B.** Save scenario+seed; run brain A vs brain B on
   identical inputs; diff the metrics. This is the iteration engine.

## Roadmap to highly-intelligent agents

Slices are independently playable/testable and ordered by leverage. Items 1, 4,
5, 6 of the ladder are already done, so this starts at the enablers and then
attacks the three real gaps.

**Slice 0 — Generalize the brain to an agent (refactor + bug fix). — DONE (core)**
- **Done:** every spec instance carries a `team` (default `"enemy"`, set at
  `instantiate`). Perception + movement + aim resolve their target through
  `nearestHostile(root, scene)` (`perception.js`), which is team-aware (enemies
  hunt the squad; a `"player"`-team agent hunts the enemy roots) and
  nearest-first. This retires `firstLiving`/`player(scene)` and **fixes the
  squad-fixation bug** — enemies now target the nearest soldier, not
  `soldiers[0]`. Covered by `test/enemyspec-targeting.test.mjs`.
- **Deferred (tracked separately):** actually routing companions through the
  agent brain. Companions are `Soldier` objects, not spec entity-trees, and the
  clean way to unify them with enemies is a brain/body split — the brain emits
  body-agnostic intents, a per-body locomotor actuates them. That refactor has
  its own plan in **`docs/LOCOMOTOR-REFACTOR.md`** (its Slice L3 is where
  companions join the shared brain). Until then `updateCompanion` stays the
  companion behavior — nothing regresses.
- Net: the *targeting* half of the brain is now allegiance-agnostic and the real
  bug is fixed; the *companion-as-agent* half is gated on the locomotor refactor.

**Slice 1 — Build the Behavior Lab** (observability + time control + levers +
metrics). Ships the scoreboard/LOS/sense overlays and frame-step. Everything
after this is iterated *inside* the Lab; without it the work is blind.

**Slice 2 — Navigation on complex geometry (the top gap).**
- At level load, build a **reachability graph**: nodes = platform surfaces +
  ground; edges = walk / jump-across / drop-through, with jump edges validated by
  the existing jump-reachability model in `src/game/gen/` (reuse it — it already
  knows what is jumpable).
- New vocabulary: a `navigateTo` motion/step that walks the graph (choose next
  node → moveTo its edge → jump/drop), superseding the crude auto-hop; falls back
  to direct steering when off-graph.
- New sense: `sense.reachable(platform)`, `sense.onSamePlatformAsTarget`,
  `sense.pathBlocked`.
- Lab test: the "cross 3 gaps to reach the fight" preset with the path overlay on.

**Slice 3 — Group coordination (roles + attack tokens).**
- A per-team **blackboard** on the scene: agreed target last-known-position, who
  is engaging, occupied approach lanes, and an **attack-token pool** (only *k*
  agents may commit a major attack at once; others score it low and reposition).
- Extend `signal` to a team scope (currently intra-tree only).
- Utility scores can read `team.tokensAvailable`, `team.alliesEngaging`,
  `team.roleFilled("flanker")`; `role` metadata starts to *mean* something.
- Lab test: 3 enemies vs the player take turns instead of spamming.

**Slice 4 — Player-habit tracking.**
- Perception grows a **habit tracker**: rolling counters for player behaviors
  (jumps-when-fired-on, camps-a-platform, dodge-direction bias, stays-below), fed
  automatically from player state transitions, exposed as `sense.habit.*`.
- Enemies gain counter-actions gated on habits
  (`when:"sense.habit.jumpsOnFire > 0.6"` → aim high / fire at landing), rate-
  capped per the doc's "use sparingly" warning.
- Lab test: the scripted ghost-player.

**Slice 5 — LLM in the loop for tuning, not authoring.**
- Ties into Player2 (already the plan). "This companion is too passive" / "this
  boss is boring" → the LLM adjusts *intelligence-axis* weights (variety, ranges,
  roles), never *difficulty* (damage/hp). The Lab's metrics + record/replay are
  the feedback signal. This is where the intelligence-vs-difficulty rubric pays
  off.

Rationale: 0 and 1 are enablers (shared brain + a way to see); 2 (navigation) is
the highest-leverage gameplay gap and the one that scales with level complexity;
3 and 4 are the "feels smart" layer; 5 closes the loop with the game's existing
generation-time-AI vision.
