---
status: living
tags: [index, planning]
---

# Roadmap

The entry point to the docs. **Status lives here and nowhere else** — when a design
doc and this file disagree about what is built, this file wins.

Sections are sorted by *what would unblock the next action*, not by percentage
complete. "60% done" tells you nothing you can act on; "needs a design" and
"needs a decision" do.

**Work-in-progress cap: 2.** If something needs to start, something in Now has to
leave. Everything else waits in Next. A roadmap where ten things are in progress
is a roadmap where nothing is.

## Now

**August 2026 sprint — `sprints/2026-08.md`.** A submitted game-jam build.

| | |
|---|---|
| Deadline | **Aug 30, 10:00.** External, no slip |
| Build window | Aug 6–26, minus Aug 15. Aug 27–29 is polish and submission |
| Must be | Playable **and completable** by a judge in 15–20 minutes |
| Succeeds if | A stranger finishes a campaign and can describe the premise |

Nineteen tasks, paired design/implement per feature: agent navigation and the
Behavior Lab, AI companions, an intelligent enemy on the companion brain, campaign
structure, the story generator, cutscenes, and enemy dialogue. Calendar is written
after the Aug 8–9 velocity probe.

Nothing outside the sprint starts until it closes.

## Next

Ordered. Waiting on capacity, not on thinking.

| # | Item | Design |
|---|---|---|
| 1 | Combat destination scoring — where to stand under fire, line of shot | `idea/advanced-agent-navigation.md` |
| 2 | Sound Slice 4 — real clips into the existing cue slots | `tech/sound.md` |
| 3 | Level generation Slice 2 — LLM flavour over the procedural baseline | `tech/level-generation.md` |
| 4 | Runtime asset generation — images through Player2 | `tech/asset-generation.md` |

Items 3 and 4 were cut from August on Aug 6; the cut is recorded with its reason
in the sprint's Out of scope table.

## Needs design

Wanted, but starting would mean thinking first. Sketches exist; none is a design.

| Item | Sketch |
|---|---|
| Group coordination — team blackboard, attack tokens, roles that mean something | none — parked |
| Player-habit tracking — counters for jump/camp/dodge patterns, counter-actions | none — parked |
| LLM tuning in the loop — adjust intelligence weights, never difficulty | none — parked |
| Improved enemy generation | none — cut from August |
| Bond system · city traversal · animation factory · parallax biomes | respective `idea/` docs |

## Stalled — needs a decision, not more work

The dangerous category. Each of these is partially built and not progressing;
leaving them in "Next" hides the fact that the blocker is a choice, not effort.

| Item | Situation | Decision needed |
|---|---|---|
| Behavior Lab v1 | Built and working, but too complex to reason about. Being replaced by v2 this sprint. | Delete on v2 landing, or keep as a second tool |
| Locomotor L4+ | L1–L3 built; `wheeled`/`limbed`/`crawler` deliberately deferred. | None for now — deferred on purpose, listed so it is not mistaken for an oversight |

## Shipped

One line each. Detail lives in `CLAUDE.md`'s current-status section, which is the
description of what the game does today; this is only the index.

| System | Where |
|---|---|
| EnemySpec — format, runtime, designer, wired into all mission enemies | `tech/enemyspec.md` |
| Locomotor refactor L1–L3 — brain/body split, soldier locomotor, companions on the shared brain | `tech/locomotion.md` |
| Level generation Slice 1 — seeded procedural levels, leads, difficulty budgets | `tech/level-generation.md` |
| Sound Slices 1–3 — cue catalog, synth, bank, engine, per-weapon and per-enemy layers | `tech/sound.md` |
| Weapon designer rework — effect schema, all 9 kinds authorable, built-in overrides | `tech/weapon-designer.md` |
| Behavior Lab Slice 1 — two teams, overlays, utility scoreboard, time control | v1, being replaced |
| Design map + doc schema — the viewer, the seven-part spec gate, the `/spec` procedure | `DOC-SCHEMA.md` |
| Editor tools — settings, firing room, level generator, controls, sound mixer | — |

## Known issues

| Issue | Where |
|---|---|
| `on.spawn` handlers run without a scene, so `fire`/`spawn`/`sound` are silently skipped | `tech/sound.md` "Known issues" |
| Flyers can grind against terrain — steering pushes in while resolution pushes out | out of scope in `sprints/2026-08.md` |
| Grounded bodies guess when a steering intent implies a jump, from a 40px heuristic with no terrain knowledge | fixed by `tech/agent-navigation.md` N3 |
| Two enemy jump impulses disagree, and the reflex hop out-jumps the deliberate jump | fixed by `tech/agent-navigation.md` N2 |
| No coyote time — a jump one frame after leaving a ledge is silently dropped | fixed by `tech/agent-navigation.md` N2 |
| `tech/behavior-lab.md` does not exist, blocking sprint task 4 | write it via `/spec` |

## Conventions

Document types, folders, naming, and the seven-part tech-spec rule live in
`DOC-SCHEMA.md` — that file is the contract and this one does not restate it.

What belongs here specifically:

- **This file holds status.** Design and tech docs hold still: no DONE
  annotations, no progress notes, no percentages.
- **`CLAUDE.md` describes what exists**; this file describes what is next. When
  they disagree about the present, `CLAUDE.md` wins; about the future, this does.
- An item reaches **Shipped** only when its tests are green and `CLAUDE.md`
  describes it.
