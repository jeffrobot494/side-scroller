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

**August 2026 sprint — `sprints/2026-08.md`.** Agents that know where they are.

Floor: click a point in the Behavior Lab and one agent walks, climbs, and drops
its way there. Full delivery: one enemy spec navigates in a real mission, and
companions escort by navigating.

State pages: `systems/agent-navigation.state.md`, `systems/behavior-lab.state.md`.

Nothing outside the sprint starts until it closes on Aug 31.

## Next

Ordered. Designed and ready to build; waiting on capacity, not on thinking.

| # | Item | Design |
|---|---|---|
| 1 | Spatial senses — my node, target node, hops/seconds, gap ahead | `agent-navigation.md` §N2 |
| 2 | Travel — `objective`/`task` fields, destination, route following, explicit jump instruction | `agent-navigation.md` §N3 |
| 3 | Engage — destination scoring under combat weights, line of shot | `agent-navigation.md` §N4 |
| 4 | Roster content — objectives + nav-aware behavior on built-in enemies | `agent-navigation.md` §N5 |
| 5 | Sound Slice 4 — real clips into the existing cue slots | `sound.md` |

## Needs design

Wanted, but starting would mean thinking first. Sketches exist; none is a design.

| Item | Sketch |
|---|---|
| Group coordination — team blackboard, attack tokens, roles that mean something | `behavior-lab.md` Slice 3 |
| Player-habit tracking — counters for jump/camp/dodge patterns, counter-actions | `behavior-lab.md` Slice 4 |
| LLM tuning in the loop — adjust intelligence weights, never difficulty | `behavior-lab.md` Slice 5 |
| Level generation Slice 2 — LLM flavor over the procedural baseline | `level-generation.md` |
| Asset generation — images through Player2 | `asset-generation.md` |
| Bond system · city traversal · design app · animation factory · parallax biomes | respective docs |

## Stalled — needs a decision, not more work

The dangerous category. Each of these is partially built and not progressing;
leaving them in "Next" hides the fact that the blocker is a choice, not effort.

| Item | Situation | Decision needed |
|---|---|---|
| Player2 integration | Chat completions wired (Enemy Designer Generate only). Image gen and the rest unused. Needs the app running + a client id in config. | Finish it, or scope it to text-only and stop listing image gen as pending |
| Behavior Lab v1 | Built and working, but too complex to reason about. Being replaced. | Delete on v2 landing, or keep as a second tool |
| Locomotor L4+ | L1–L3 built; `wheeled`/`limbed`/`crawler` deliberately deferred. | None for now — deferred on purpose, listed so it is not mistaken for an oversight |

## Shipped

One line each. Detail lives in `CLAUDE.md`'s current-status section, which is the
description of what the game does today; this is only the index.

| System | Where |
|---|---|
| EnemySpec — format, runtime, designer, wired into all mission enemies | `enemy_creation_system_plan.md` |
| Locomotor refactor L1–L3 — brain/body split, soldier locomotor, companions on the shared brain | `LOCOMOTOR-REFACTOR.md` |
| Level generation Slice 1 — seeded procedural levels, leads, difficulty budgets | `level-generation.md` |
| Sound Slices 1–3 — cue catalog, synth, bank, engine, per-weapon and per-enemy layers | `sound.md` |
| Weapon designer rework — effect schema, all 9 kinds authorable, built-in overrides | `weapon-designer.md` |
| Behavior Lab Slice 1 — two teams, overlays, utility scoreboard, time control | `behavior-lab.md` |
| Editor tools — settings, firing room, level generator, controls, sound mixer | — |

## Known issues

| Issue | Where |
|---|---|
| `on.spawn` handlers run without a scene, so `fire`/`spawn`/`sound` are silently skipped | `sound.md` "Known issues" |
| Flyers can grind against terrain — steering pushes in while resolution pushes out | `agent-navigation.md` non-goals |
| Grounded bodies disagree on when a steering intent implies a jump; one ignores it entirely | fixed by Next #2 |

## Conventions

- A document is exactly one of: **design** (what it should be), **roadmap**
  (this file), **status** (`CLAUDE.md`, what exists now), **decision log** (why
  we rejected things). Never two at once — that is what made `behavior-lab.md`
  unreadable.
- Design docs hold still. They do not track their own progress and carry no DONE
  annotations.
- An item reaches Shipped only when its tests are green and `CLAUDE.md` describes
  it.
