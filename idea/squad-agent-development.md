---
type: idea
category: artificial-intelligence
resolution: vague
related: [advanced-agent-navigation, shared-simulation, behavior-lab, soldier-behavior]
---

# Idea: squad agent development

Consolidated design direction and implementation plan for persistent agent goals,
survival, player orders, squad testing, and a shared simulation.

## How to use this document

| Material | Standing |
|---|---|
| Design direction | Records the decisions reached in the discussion, especially survival taking precedence over orders and player-selected destinations |
| Architecture | Records the shared-simulation direction and the boundaries between goals, tasks, positioning, and reactions |
| Slice sequence | Proposed development order, consolidated after the shared-simulation discussion; not a sprint commitment |
| Unsettled details | Explicitly listed below; examples and possible extensions are not silently promoted to requirements |

This is an umbrella design and implementation plan, not a complete technical
specification. Its `idea` classification reflects the remaining proposals and
unspecified pieces, not a reversal of the decisions recorded here. Detailed
specifications are written against focused design documents before implementation.

| Related document | Purpose |
|---|---|
| [Advanced agent navigation](advanced-agent-navigation.md) | Original navigation proposal, extended with survival and orders |
| [Shared simulation design](../design/shared-simulation.md) | Agreed behavioral contract for missions and the Lab |
| [Shared simulation technical spec](../tech/shared-simulation.md) | Reviewed extraction plan, slices S0–S4, boundaries and regression requirements |
| [Behavior Lab](../design/behavior-lab.md) | Existing navigation-tool design; the expanded Lab described here needs its own design update before construction |
| [Soldier behavior](../design/soldier-behavior.md) | Existing companion behavior reference |
| [Agent navigation](../design/agent-navigation.md) | Navigation baseline |

The shared-simulation technical spec takes precedence for that extraction. This
overview does not replace it or claim that any proposed feature has shipped.

## Starting point and intended change

| Existing capability discussed | What the new work adds |
|---|---|
| Agents can already move and shoot simultaneously | Preserve that behavior; it is a regression check, not a new goal-system feature |
| Mission companions escort or engage, with movement chosen inside those behaviors | An enduring goal independent of the current behavior |
| The Lab stores a clicked destination and continually requests movement toward it | Agent-owned intent that survives task changes, using the same system as missions |
| Ducking already predicts a limited set of projectile threats | Broader awareness and a choice among compatible defensive responses |
| Navigation already routes toward destinations | Choosing useful destinations and safer routes |
| Combat, physics and AI already have reusable modules | A shared simulation step, rather than separately maintained host update loops |

The objective is soldiers who remain useful while surviving better: they choose
cover, account for their wounds, react to threats, and explain when they cannot
accept the player's request.

## Goals, tasks and movement

| Layer | Meaning | Example |
|---|---|---|
| Order/request | What the player wants; subject to acceptance | Advance to the doorway |
| Goal/objective | Persistent accepted intent or default autonomous intent | Reach the doorway |
| Task | What currently needs attention; can complete or suspend another task | Travel, engage, search, hold |
| Tactical destination | Where to stand next in pursuit of the goal | Cover beside a wall |
| Route | How to reach that tactical destination | Walk, jump, walk |
| Movement and action | Immediate execution | Move right, fire, duck |

- Start with one active goal per agent. A goal queue or a competing-goal planner
  is not required for the first implementation.
- Use “goal” and “objective” for the same persistent concept here, not two new
  layers. Final code vocabulary belongs in the focused specification.
- Goals persist through temporary concerns. An advancing soldier can engage an
  enemy, seek cover, then continue toward the original destination.
- An immediate movement destination is not enough: replacing or reaching it must
  not erase or complete the enduring goal accidentally.
- Fighting is normally a task undertaken while pursuing another goal. Hunting
  can explicitly make finding and defeating enemies the enduring goal.
- Delayed goals can resume. Refused or abandoned player orders do not silently
  reactivate when danger passes.
- Destination selection and short committed combat actions remain separate.
  Moving toward a destination must not suppress firing.

### Initial goals and scenario goals

| Goal | Meaning and completion | Introduction |
|---|---|---|
| Advance to a point | Reach a known point, then complete | First goal capability |
| Reach the right side | Convenient preset for advance to a known endpoint | Alongside advance |
| Escort the leader | Stay with the current squad leader; ongoing | After advance |
| Hold a position | Maintain a designated position while threats change; ongoing | After combat interruption |
| Hunt / kill all enemies | Find and engage enemies; search when none are perceived | After combat and basic tasks |
| Survive as long as possible | Prioritize survival without an obligation to advance or attack | A later survival test scenario |
| Reach a known exit | Advance to an exit at a seeded, reachable location | Possible navigation scenario |
| Find an unknown exit | Explore, remember searched areas, discover the exit, then reach it | Deferred exploration work |

- No visible enemy is not the same as all enemies dead. The Lab can know that a
  scenario is complete without giving agents knowledge of unseen enemies.
- Survival remains a consideration for every goal. A dedicated survival goal is
  useful under sustained pressure; an empty scene is not a meaningful test.
- Random exit placement does not itself require exploration if its location is
  known. Random unknown exits need discovery and exploration rules not yet defined.

## Survival and tactical positioning

| Decision input | Intended effect |
|---|---|
| Current and maximum health | Consider both fraction remaining and whether another hit could be lethal |
| Recent damage and reloading | Increase the value of protection when vulnerable |
| Known hostile firing positions | Evaluate exposure to more than the nearest enemy |
| Protection by position and stance | Prefer terrain that actually interrupts the relevant attack |
| Shot opportunity, range and elevation | Preserve combat usefulness |
| Route danger and travel time | A protected endpoint may not justify a lethal approach |
| Time until protection | Prefer safety reachable soon |
| Escape options and crowding | Avoid traps and excessive congregation |
| Goal progress | Continue useful work rather than hiding indefinitely |

- Sample specific positions within standable navigation spans; cover and exposure
  can differ across the same span. Include staying put as a candidate.
- “Nearby” means reachable soon, not close in straight-line distance.
- Evaluate useful stances. A crouch is not universal cover, and cover against
  direct fire does not imply protection from blasts or arcing attacks.
- Distinguish seeing a target from a usable shot originating at the muzzle,
  including trajectory, terrain and allies in the firing corridor.
- Score tactical desirability rather than requiring every candidate to provide
  a shot. Physical feasibility is a filter; risk acceptance is a separate decision.
- Commit to destinations through small score changes. Reconsider on arrival,
  routing failure, or materially changed danger.
- Low health may persist for the entire mission. Resume useful behavior when
  pressure drops; do not require healing before acting again.
- Nerve might influence acceptable perceived risk, and traits might modify it.
  Those mappings and numerical curves remain proposals.

### Immediate defense

- Extend the existing projectile prediction instead of creating an unrelated
  second predictor. Account for the soldier's movement as well as the projectile.
- Compare continuing, ducking, and eventually jumping over a short time horizon,
  including reaction delay and simultaneous threats.
- Jump only when the trajectory reduces danger and has a viable landing; check
  overhead obstacles and other firing lanes.
- Preserve imperfect reactions, including the existing Speed-based chance and
  latency approach. Awareness must not imply perfect evasion.
- Ducking prevents running and jumping. One arbitration point must resolve
  competing requests rather than allowing independent reflexes to fight.
- Immediate defense runs faster than destination selection. Preserve committed
  combat actions initially; any interruptible phases must be explicit later.

## Player orders and risk acceptance

The player normally specifies destinations, not routes. Soldiers prioritize their
own survival by default and may refuse risky orders, even without certain death.

1. Consider plausible routes to the requested destination.
2. Assess travel danger and danger at arrival. Holding requires a rolling
   assessment of continued occupation, not merely reaching the point alive.
3. Choose an acceptable approach, wait for an opening, or refuse if no acceptable
   way to fulfill the request is available.

| Outcome | Behavior | Example feedback |
|---|---|---|
| Active | Execute via an acceptable route | “Moving!” |
| Delayed | Seek protection, retain the pending request, reassess | “Waiting for that gunner to stop firing!” |
| Refused | Decline and take defensive action | “Are you crazy?! That's suicide!” |
| Abandoned | Stop an accepted order when circumstances become unacceptable | “I can't hold this position! Falling back!” |

- Risk acceptance stays separate from destination utility. A large progress or
  firing bonus cannot outweigh danger the soldier is unwilling to accept.
- A dangerous direct route does not justify refusal if a reasonable safer route
  exists. Taking that route is ordinary execution and usually needs no dialogue.
- The ordered destination persists separately from tactical destinations.
  Intermediate cover is compatible with the order; substituting a different
  endpoint or leaving the assigned hold position requires refusal/abandonment feedback.
- Physical impossibility and unacceptable risk are different explanations.
- Reassess when circumstances materially change. Different leaving/resuming
  thresholds prevent rapid reversals and repeated indecision.
- Waiting is an explicit state, not indefinite apparent obedience. Reassessment
  finds a way forward or reports refusal.
- Spoken feedback explains the reason. Visible status distinguishes active,
  delayed, refused and abandoned, and shows the defensive behavior taken instead.
- Mandatory obedience was considered and superseded by the survival-first rule.
  A force-obey override is not part of the agreed scope.

## Behavior Lab: squads and inspection

The Lab is the primary controlled development environment. Missions remain the
integration check for real squad play, control switching and normal encounters.

| Capability | Intended behavior |
|---|---|
| Add agent | Choose team and click a valid spawn position with a placement preview; begin with a standard soldier configuration |
| Remove agent | Remove the selected agent and clean up references without disturbing others |
| Selection | Choose whose properties and decisions to inspect; selection is separate from leadership |
| Leadership | Designate a leader within the squad; escort refers to the current leader rather than a permanently remembered body |
| Goal assignment | Set a selected agent's goal; click-to-advance for the leader provides an initial way to move the squad |
| Leader replacement | Escorting agents redirect to the new leader; unrelated goals remain intact |
| Combat setup | Opposing agents run real weapons, projectiles, damage, death and defensive behavior |
| Time controls | Pause, step and reproduce a scenario without changing simulation rules |

- Add and remove belong in one initial Lab-management slice so mistakes can be
  corrected immediately. Basic selection precedes detailed inspection.
- Proposed initial placement behavior is idle until assigned intent; placement
  should not unexpectedly start a chase.
- Leadership can be assigned before escort behavior is implemented. A missing
  leader or self-escort needs an explicit visible waiting condition.
- The initial Lab model can use one squad per team. Multiplayer missions already
  distinguish allied commanders' squads: allegiance must not collapse those squads
  into one leader. Leadership remains a squad relationship.
- Removing a leader was proposed to leave leadership vacant rather than silently
  electing a successor. Former/new leader goal reassignment still needs a focused
  design decision; do not invent it inside the promotion button.

### Explain behavior at three levels

| View | Information |
|---|---|
| Selected-agent inspector | Order/status, goal, task, tactical destination, route, current action, health, threats, reload state, cooldowns and blocking commitments |
| World overlays | Ordered and tactical destinations, held route, candidates and scores, sight/shot lines, exposure and predicted projectile threats |
| Decision timeline | Transitions and decisions with causes, including rejected choices and reasons for retaining the current destination |

Example log entries:

- “Leader changed: escort target updated.”
- “Selected west ledge: less exposure; arrival 1.2 seconds later.”
- “Kept destination: improvement below switching threshold.”
- “Jump rejected: unsafe landing.”
- “Advance delayed: no acceptable route under current fire.”

Log meaningful changes rather than every frame. Pause/step should expose the exact
state being inspected. Exportable logs and slower playback are useful proposed
extensions; the minimum is reproducible scenarios and readable decision history.
Diagnostics grow with each AI feature rather than being built in full upfront.

## One shared simulation

| Shared simulation | Mission host | Lab host |
|---|---|---|
| Actor updates, perception, AI, movement, combat, timers and gameplay consequences | Input translation, camera/UI, mission objectives, extraction and campaign results | Scenario editing, commands, time controls, inspection and logs |

- Equivalent scene contents, commands, configuration, randomness and time steps
  produce equivalent gameplay outcomes through either host.
- Gameplay does not branch on “is Behavior Lab.” Scenario differences are explicit
  inputs. Pausing means not advancing the simulation.
- Use existing weapons, effects, physics, runtime and companion behavior. Extract
  remaining Mission-bound rules instead of copying them into the Lab.
- The Lab's current minimal navigation agent is an explicit scenario choice.
  Mission-equivalent combat tests must use mission-equivalent agent configuration.
- Report damage and death from their authoritative mutation sites. Mission damage
  callbacks alone miss burn ticks and some runtime-internal destruction paths.
- Observations and cosmetic feedback do not decide gameplay or consume its RNG.
- Multiplayer needs preserved per-commander input, distinct squad leadership,
  private versus shared feedback, and the remote viewer's non-simulation boundary.
  This does not require a network protocol redesign.
- The reviewed extraction spec preserves existing update ordering, death/credit
  timing, loot consequences, seeded randomness and independent mission outcomes.

The initial effort estimate for extraction alone was several focused development
days, roughly a week including verification. That was a rough discussion estimate,
not a schedule; generalized teams, Lab controls and new AI are additional work.

## Consolidated implementation sequence

This order incorporates the later decision to establish shared simulation before
Lab combat. S0–S4 below are the reviewed spec's slices. The remaining slices are
planning outlines requiring focused specifications. Adding/removing agents remains
the first slice of the squad-Lab expansion; clock controls are supplied by S4.

1. **Shared simulation S0 — Characterize boundaries.** Pin existing combat, control, death, feedback and Lab navigation behavior before extraction.
2. **Shared simulation S1 — Share damage and death.** Extract handling and observe all authoritative transitions without altering their semantics.
3. **Shared simulation S2 — Share the authoritative step.** Make missions delegate ordered gameplay stepping while retaining host responsibilities.
4. **Shared simulation S3 — Connect the Lab.** Replace its separate stepping loop; prove matched headless encounters through both hosts while retaining the navigation UI.
5. **Shared simulation S4 — Time and repeatability.** Add pause/resume, step and repeat-scenario reset; verify observation does not affect outcomes.
6. **Lab — Add and remove agents.** Team choice, valid spawn preview, stable identity, basic selection and reference cleanup.
7. **Lab — Inspect agents.** Show health, team, behavior, target and route, with a basic transition timeline; reuse S4 time controls.
8. **Lab — Designate leaders.** Promote within a squad, replace the designation and handle its removal visibly.
9. **Goals — Establish persistent intent.** One active goal, target and completion rule, with Lab assignment/clear controls.
10. **Goals — Advance.** Retain a known destination and complete on arrival; include a “reach the right side” preset.
11. **Goals — Escort.** Follow the current squad leader and redirect when leadership changes; explain missing/self targets.
12. **Goals — Replace intent cleanly.** Prevent obsolete tasks and destinations from returning after reassignment.
13. **Teams — Complete shared allegiance support where needed.** If standard soldiers can fight on either team, generalize targeting and hit eligibility in the shared rules before enabling those encounters. This is separate from simulation extraction.
14. **Lab combat — Enable opposing encounters.** Expose setup for real combat using the shared simulation, not new Lab combat rules.
15. **Goals — Interrupt and resume.** Engage without losing advance/escort intent; inspect goal versus task.
16. **Goals — Hold.** Maintain a position and return after engagement, subject to later survival assessment.
17. **Goals — Hunt and search.** Seek and engage enemies; distinguish unseen enemies from scenario completion.
18. **Mission integration — Adopt goals.** Default companions to escort; verify control switching and recovery after combat.
19. **Positioning — Generate candidates.** Reachable specific positions, including staying put; display candidates.
20. **Positioning — Separate sight and shot.** Evaluate firing trajectories, terrain and allies.
21. **Positioning — Score destinations.** Combine progress, combat value, travel, crowding and escape options; expose score contributions.
22. **Positioning — Commit and reconsider.** Resist small changes and explain switches on arrival, failure or material change.
23. **Mission integration — Adopt positioning.** Replace the appropriate movement fallback while preserving committed combat actions.
24. **Survival — Expose vulnerability and threats.** Real health, recent damage, reload state and perceived exposure, with Lab controls/inspection.
25. **Survival — Seek cover.** Evaluate protection at positions and stances, initially against ordinary direct fire.
26. **Survival — Adjust risk preference.** Wounded/reloading agents trade firing opportunity for safety.
27. **Survival — Recover useful behavior.** Continue the goal or re-engage when pressure drops without requiring healing.
28. **Safer travel — Assess route danger.** Exposure and time until protection, visible in the Lab.
29. **Safer travel — Compare routes.** Choose reasonable covered alternatives to exposed direct paths.
30. **Safer travel — Use intermediate cover.** Preserve the enduring destination while moving through tactical positions.
31. **Safer travel — Reassess.** Respond to changed danger/blockage without constant reversals.
32. **Mission integration — Validate survival and travel.** Measure survival alongside usefulness and progress.
33. **Orders — Evaluate advance requests.** Separate requests from accepted goals; accept or refuse with explanation and visible status.
34. **Orders — Evaluate hold requests.** Assess continued occupation over a rolling horizon.
35. **Orders — Delay and resume.** Pending requests await plausible openings, then resume or receive an explicit refusal.
36. **Orders — Abandon unsafe commitments.** Explain withdrawal and prevent silent reactivation.
37. **Mission orders — Expose controls and feedback.** Player-selected destinations use the acceptance rules already exercised in the Lab.
38. **Immediate defense — Generalize prediction.** Preserve existing duck behavior while adding shared threat information and overlays.
39. **Immediate defense — Compare continuing and ducking.** Include agent motion, reaction delay and imperfect reactions.
40. **Immediate defense — Add jump dodging.** Require safer trajectory and viable landing.
41. **Immediate defense — Resolve combined threats.** Arbitrate responses against each other, movement and committed actions.
42. **Mission integration — Validate the combined system.** Leadership, goals, combat, cover, orders/refusal and dodging together.

Step 13 explicitly captures the team dependency discovered after the earlier
37-slice list. It must not become a Lab-specific exception. Its exact supported
agent/team combinations need specification before the relevant controls are enabled.

## Milestones and evaluation

| Milestone | Demonstration |
|---|---|
| Shared foundation | The same configured encounter produces matching gameplay through Mission and Lab adapters |
| Squad navigation | Add agents, promote a leader, assign advance, watch escorts follow, change leaders and inspect redirection |
| Persistent intent | Send a soldier past an enemy; after fighting, it continues to its destination instead of defaulting to escort |
| Useful survival | A wounded soldier seeks nearby cover, fights when practical and resumes its goal when pressure eases |
| Credible refusal | A dangerous direct route with a safe detour is accepted; a request with no acceptable approach is explained and refused |
| Readable defense | A soldier ducks or jumps only when useful, with visible reasons and fallible reactions |

- Measure damage taken, deaths, damage dealt, goal progress, escort time, time
  hiding/stuck and refusal/delay frequency. Survival gained through silent task
  abandonment is not success.
- Use seeded scenarios, fixed command sequences and focused regression cases.
  Compare real adapters, not merely repeated calls to the same helper.
- Perform mission integration checks throughout. Automated checks cannot establish
  whether behavior, feedback and controls are readable in play.
- Preserve existing goldens during pure extraction. Behavior-changing slices need
  explicit expectations and relevant regression coverage.

## Remaining decisions and deferred work

| Topic | Boundary |
|---|---|
| Numerical tuning | Risk thresholds, lookahead horizons, wait limits and commitment margins need measurement; no values were agreed |
| Leadership transitions | Goal policy for the former/new leader and removal/death succession needs definition; inspection selection stays independent |
| Hold precision | Exact point versus allowed local area needs definition before the hold interface is finalized |
| Team scope | Standard soldiers on either side and squad identity within a team require explicit shared allegiance rules |
| Personality | Nerve/traits are potential inputs, not agreed formulas or a morale/panic system |
| Exploration | Unknown-exit discovery and territory memory are later work |
| Additional navigation | Flyers and crouch-only traversal are outside the initial implementation |
| Squad tactics | Shared tactical roles, attack coordination and broader team planning are deferred |
| Diagnostic extensions | Exportable logs, a full replay editor and additional playback speeds are not prerequisites for initial agent management |

## Recorded specification review

- The shared-simulation contract and technical spec were written separately.
- A fresh-context adversarial review found incomplete damage/death reporting:
  some authoritative transitions bypass Mission callbacks. The spec was corrected
  and the reviewer confirmed the finding resolved.
- At that review, the full suite passed 39 suites / 2,678 assertions using a
  temporary Windows-compatible runner. An earlier intermittent multiplayer
  feedback failure and the runner limitation are recorded in the technical spec.
- Those are historical validation results for the spec session, not a claim about
  the current implementation or current test results.
