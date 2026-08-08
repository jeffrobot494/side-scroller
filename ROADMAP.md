---
status: living
tags: [index, planning]
---

# Roadmap

The entry point to the docs, and the index of build state. Design and tech docs
never track their own progress, so when one of them implies something about what is
built and this file disagrees, this file wins. For a *detailed* account of what the
game does today, `CLAUDE.md` is the authority; this file is the one-line index and
the ordering of what comes next.

Sections are sorted by *what would unblock the next action*, not by percentage
complete. "60% done" tells you nothing you can act on; "needs a design" and
"needs a decision" do.

**Work-in-progress cap: 2.** If something needs to start, something in Now has to
leave. Everything else waits in Next. A roadmap where ten things are in progress
is a roadmap where nothing is.

## Now

**A submitted game-jam build — `sprints/2026-08.md`.** An external deadline, so the
scope moves and the date does not.

In scope: agent navigation and the Behavior Lab, AI companions, an intelligent
enemy on the companion brain, campaign structure, the story generator, cutscenes,
enemy dialogue. Each is a design task and an implement task.

Dates, the task list, and what was cut live in the sprint doc. They are not
repeated here.

Nothing outside the sprint starts until it closes.

## Next

Ordered. Waiting on capacity, not on thinking — including anything a sprint cut,
since that is what being cut means. Why something was cut is the sprint's record,
not this file's.

| # | Item | Design |
|---|---|---|
| 1 | Combat destination scoring — where to stand under fire, line of shot | `idea/advanced-agent-navigation.md` |
| 2 | Sound Slice 4 — real clips into the existing cue slots | `tech/sound.md` |
| 3 | Level generation Slice 2 — LLM flavour over the procedural baseline | `tech/level-generation.md` |
| 4 | Runtime asset generation — images through Player2 | `tech/asset-generation.md` |

## Needs design

Wanted, but starting would mean thinking first. Sketches exist; none is a design.

| Item | Sketch |
|---|---|
| Group coordination — team blackboard, attack tokens, roles that mean something | none — parked |
| Player-habit tracking — counters for jump/camp/dodge patterns, counter-actions | none — parked |
| LLM tuning in the loop — adjust intelligence weights, never difficulty | none — parked |
| Improved enemy generation | none |
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
| LLM enemy authoring — Enemy Designer Generate via Player2 chat completions | `tech/enemyspec-llm.md` |
| Locomotor refactor L1–L3 — brain/body split, soldier locomotor, companions on the shared brain | `tech/locomotion.md` |
| Level generation Slice 1 — seeded procedural levels, leads, difficulty budgets | `tech/level-generation.md` |
| Sound Slices 1–3 — cue catalog, synth, bank, engine, per-weapon and per-enemy layers | `tech/sound.md` |
| Weapon designer rework — effect schema, all 9 kinds authorable, built-in overrides | `tech/weapon-designer.md` |
| Behavior Lab Slice 1 — two teams, overlays, utility scoreboard, time control | v1, being replaced |
| Design map + doc schema — the viewer, the seven-part spec gate, the `/spec` procedure | `design/design-map.md` · `DOC-SCHEMA.md` |
| Editor tools — settings, firing room, level generator, controls, sound mixer | — |

## Known issues

| Issue | Where |
|---|---|
| `on.spawn` handlers run without a scene, so `fire`/`spawn`/`sound` are silently skipped | `tech/sound.md` "Known issues" |
| Flyers can grind against terrain — steering pushes in while resolution pushes out | out of scope in `sprints/2026-08.md` |
| Grounded bodies guess when a steering intent implies a jump, from a 40px heuristic with no terrain knowledge | fixed by `tech/agent-navigation.md` N3 |
| Two enemy jump impulses disagree, and the reflex hop out-jumps the deliberate jump | fixed by `tech/agent-navigation.md` N2 |
| No coyote time — a jump one frame after leaving a ledge is silently dropped | fixed by `tech/agent-navigation.md` N2 |

Missing and incomplete tech specs are **not** listed here — the design map's Gaps
tab and `test/docs.test.mjs` own that, and duplicating it is how this file rots.

## Conventions

Document types, folders, naming, and the seven-part tech-spec rule live in
`DOC-SCHEMA.md` — that file is the contract and this one does not restate it.

What belongs here specifically:

- **This file holds status.** Design and tech docs hold still: no DONE
  annotations, no progress notes, no percentages.
- An item reaches **Shipped** only when its tests are green and `CLAUDE.md`
  describes it.
- **This file must not restate anything with a home elsewhere.** No dates, no
  slice numbers, no doc taxonomy, no row-position cross-references — point at the
  source instead. That duplication is the only reason this file has ever gone
  stale, and `test/docs.test.mjs` now fails the build when what it *does* restate
  stops being true.
