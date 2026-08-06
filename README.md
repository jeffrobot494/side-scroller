# XCOM Task Force — side-scroller

**You are not fighting an invasion. You are fighting an occupation that already
succeeded — and nobody alive remembers it happening.**

An XCOM-style squad game with a strategy hub in DOM and run-and-gun missions on
Canvas. Hire soldiers, send them into procedurally generated missions, fight
data-defined enemies alongside AI companions, lose people permanently, sell loot,
commission weapons, and beat the clock.

Plain JS + the HTML5 Canvas API. **No framework, no bundler, no build step** —
modules load in the browser as native ESM.

## The setting

Sometime in the last hundred years, the lizards reached back and changed
something. One event, or a dozen — nobody knows the shape of it. What is certain
is that the timeline we live in is not ours, and that every human being on Earth
is a willing, grateful, entirely unwitting servant of a species that rewrote them
into it.

You belong to the one organisation that noticed. Your job is to undo it, and
then to make them pay for it.

| | |
|---|---|
| **The enemy** | Lizard people. Accomplished time travellers, and far better at it than you |
| **Your ops officer** | Spends the campaign identifying *points of intervention* — moments where the lizards reached into history and bent it |
| **A mission** | Travel to that moment and interfere with it |
| **The catch** | There are many interventions, and the lizards can detect an incursion and meet you at it. You are never alone when you arrive |
| **The one fixed thing** | Humanity belongs to the lizards. You intend to end that. Everything else is negotiable |

A mission has a **when** as well as a **where**.

## History is not restored. It is rewritten.

**There is no correct timeline.** You are not repairing history back toward some
original, proper version — there isn't one, and nobody is keeping score against
it. There is exactly one thing worth holding onto: humanity is enslaved, and you
are going to undo that. Everything else about the world is in play.

Every mission changes history. Not just the ones you lose — *every* mission,
because you were there, because they were there, because someone died who
otherwise wouldn't have. When it ends, the story generator takes the outcome and
writes what follows. It is under no obligation to be tidy about it.

Kill the lizard assassin in 1939 and Hitler lives out the war you remember. Fail,
and he doesn't — and a Europe with no Second World War is a Europe where France
may look east, decide Germany is weak, and go. That world generates its own
points of intervention, which become your next missions, which diverge again. And
as you start winning, the lizards stop merely defending their original work and
begin intervening to counter *you* — which is when it gets strange.

The intended feel:

| | |
|---|---|
| **Recognisable** | Real centuries, real countries, people you have heard of |
| **Surprising** | The consequences are the LLM's to draw, and it will draw ones you didn't consider |
| **Often funny** | Alternate history is inherently absurd once it compounds a few times |
| **Occasionally shocking** | It is allowed to go somewhere you would not have chosen |

Compounding is the point. One divergence is a premise; six divergences stacked on
each other is a history nobody has read before — including the people who made
the game. Two campaigns will not produce the same world, and there is no version
of the world you are supposed to end up with.

## The time machine is a prototype

This is the part that makes it a different game, and it is the part still being
designed. Your machine works. It is not *good*.

It swallows enormous amounts of energy and it is imprecise, and the design space
that opens up is the interesting one:

| | |
|---|---|
| **You may not arrive when you meant to** | Miss by a decade and the target you came to kill is a child, or already dead. Improvise — find someone else to save, or someone else to stop |
| **You may not be able to leave** | Getting home costs energy you have to find, salvage, or steal on-site. Come up short and your soldiers stay there, in that century, forever |
| **You may be on a timer** | A warp bubble that collapses on its own schedule, yanking the squad back to the present mid-firefight — mission finished or not |

> **Undecided.** Which of these ship, and in what combination, gets settled in
> the design phases on the sprint board — not here. Treat the three rows above as
> the space being explored, not as a spec.

## What exists today

The mechanical skeleton is built and playable end to end: hub, generated
missions, permadeath, the economy, an enemy-authoring system, and a campaign you
can win. **The setting above is where it is going, not what you will see when you
run it** — missions are currently sectors rather than centuries. The story layer
that turns a lead into a point in time is this month's work; see
`sprints/2026-08.md`.

## Run it

ES modules must be served over HTTP, not opened as a `file://` path. Any static
server works:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

Four pages, all served from the repo root:

| Page | |
|---|---|
| `index.html` | The game |
| `editor.html` | Dev editor — settings, sound mixer, and the GUI tools below |
| `design.html` | The design map — browse every design and tech doc |
| `game.html` | Bare mission page, no hub |

## Play it

1. **Barracks** — hire a few soldiers (you start with §750).
2. **Operations** — pick a **lead** and deploy up to 3 soldiers, each with a
   weapon from the armory. Leads are generated, so the mission list is different
   every campaign; difficulty scales with campaign pressure.
3. **Mission** — reach the **EXTRACT** gate on the right. Kill enemies for loot.
   Anyone who dies is gone for good.
4. **Results** — sell recovered loot.
5. **Engineering** — commission a better weapon (finishes after a few days).
6. **War Room** — advance the day to progress fabrication and the doom clock.
7. Clear enough leads and a **boss lead** appears. Win it to win the campaign —
   before the doom clock drains the sector to 0.

### Mission controls

| Action | Key |
|---|---|
| Move | `A` `D` / `←` `→` |
| Jump | `Space` or `Left Shift` |
| Crouch | `S` / `↓` — smaller hitbox, lets allies shoot over you |
| Fire | `J` |
| Reload | `R` — weapons have magazines; you move slower while reloading |
| Aim up | `W` / `↑` (keyboard aim mode only) |
| Swap soldier | `Tab` or `K` — also auto-swaps on death |

A gamepad works too (standard mapping). Aim mode is configurable in the editor:
mouse, gamepad stick, auto, or the legacy keyboard scheme. Every key is
rebindable in **editor.html → Tools → Controls**.

## Poke at it

`editor.html` is where most of the game is authorable without touching code.

| Tool | |
|---|---|
| **Weapon Designer** | Build a weapon from the 9-effect vocabulary against a cost model. Load and rebalance a built-in, or author a new one |
| **Enemy Designer** | Author an EnemySpec — nested destructible parts, motion controllers, fire patterns, utility brains — with a live preview on the real runtime |
| **Level Generator** | Seed → schematic preview of a generated level |
| **Firing Room** | A test range. Fire any weapon at dummies or waves of real enemies |
| **Behavior Lab** | Watch agents think — line of sight, senses, preferred ranges, and a scoreboard of every action the brain scored and why |
| **Controls** | Rebind keys and inspect the gamepad map |

The **Settings** tab is schema-driven: every tuning constant in the game has a
control there. The **Sound** tab is the mixer plus the cue bank.

Editor changes persist to `localStorage`, which is per-browser and separate from
the game page — **reload the game after saving in the editor.** To make something
permanent, export the JSON and paste it into the matching data module.

## Test it

```bash
node test/run.mjs           # every suite — the regression bar
node test/run.mjs gen       # only suites whose filename contains "gen"
```

No browser, no dependencies. `package.json` exists only so node parses the `.js`
source as ESM; there is nothing to install.

> One suite is expected to fail right now: `docs.test.mjs` reports tech specs
> that are incomplete for the current sprint. It is a documentation gate, not a
> broken build.

## Layout

| Path | |
|---|---|
| `src/main.js` | Bootstrap + scene manager (hub ↔ mission) |
| `src/game/state.js` | The single authoritative game state and every meta action |
| `src/game/config.js` | Schema-driven settings — add a knob, the editor grows a control |
| `src/game/content.js` | The data library: weapons, enemies, blueprints, tuning |
| `src/game/arsenal.js` + `weaponcost.js` | The 24-weapon arsenal and the effect cost model it is priced against |
| `src/game/enemyspec/` | The enemy format: schema, expressions, validation, generation |
| `src/game/gen/` | Procedural level generation — seeded, deterministic, reachability-proven |
| `src/mission/` | The Canvas run-and-gun: physics, AI, combat, rendering, input |
| `src/mission/enemyspec/` | The EnemySpec runtime — brain, perception, render |
| `src/audio/` | Cue catalog, procedural synth, bank, WebAudio engine |
| `src/hub/` | Every DOM screen + CSS. Owns no rules; calls state actions |
| `src/player2/` | LLM + image-generation gateway. Partially wired |
| `src/docmap/` | The design map viewer |

## Documentation

Docs are split by **type**, one folder each — `design/` (what the player should
experience), `tech/` (how it is built), `idea/` (what we might do, not agreed),
`sprints/` (what we committed to this month), `archive/`. `DOC-SCHEMA.md` is the
contract; `ROADMAP.md` holds status.

Read it in the browser at `design.html` rather than in the folders — it renders
the graph, the current sprint, and a **Gaps** tab listing what is incomplete.

`CLAUDE.md` is the orientation doc for both humans and AI agents, and is the most
accurate description of what currently exists.
