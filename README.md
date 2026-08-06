# XCOM Task Force — side-scroller

An XCOM-style squad game with a strategy hub in DOM and run-and-gun missions on
Canvas. Hire soldiers, send them into procedurally generated missions, fight
data-defined enemies alongside AI companions, lose people permanently, sell loot,
commission weapons, and beat the clock.

Plain JS + the HTML5 Canvas API. **No framework, no bundler, no build step** —
modules load in the browser as native ESM.

## The setting

Within the last hundred years, lizard people altered Earth's timeline. How many
interventions they made is unknown. The result is that every human on Earth serves
them willingly, without knowing it.

The player runs the organisation that detected this.

| | |
|---|---|
| The enemy | Lizard people, and better time travellers than the player |
| Operations | Identifies *points of intervention* — moments the lizards reached into and altered |
| A mission | Travel to that moment and interfere |
| Opposition | The lizards detect incursions and meet them, so the squad always arrives contested |
| The fixed goal | End the lizards' hold on humanity. Nothing else about the world is stable |

A mission has a **when** as well as a **where**.

## The story engine

Each mission outcome feeds a story generator that writes the history following from
it. A win and a loss are both inputs; neither is measured against a target timeline,
because there isn't one.

That generated history supplies the next points of intervention, so divergence
compounds over a campaign. As the player succeeds, the lizards intervene to counter
them, adding divergence of their own.

*Example.* The squad arrives in 1939 to interfere with the assassination of Hitler.
Stop it and the war proceeds as recorded. Fail and it doesn't — the generator writes
a Europe with no Second World War, where France might judge Germany weak and invade.
Either outcome sets where the next missions come from.

What the generated history should be:

| | |
|---|---|
| Recognisable | Real centuries, countries, and people |
| Surprising | Consequences are the LLM's to draw, including ones nobody anticipated |
| Often funny | Compounded alternate history tends toward the absurd |
| Occasionally shocking | Permitted to go somewhere the designers would not have chosen |

Six stacked divergences produce a history nobody has read, including its authors. No
two campaigns produce the same world.

## The time machine is a prototype

It consumes large amounts of energy and lands imprecisely. Three consequences are
under consideration:

| | |
|---|---|
| Arriving off-target | Miss by a decade and the intended target is a child, or already dead. The squad improvises — someone else to save, or to stop |
| Paying for the return | Getting home costs energy found, salvaged, or stolen on site. Come up short and the soldiers stay in that century |
| A collapsing warp bubble | The bubble fails on its own schedule and pulls the squad back mid-mission, finished or not |

> **Undecided.** Which of these ship, and in what combination, is settled in the
> design phases on the sprint board. The three rows above are the space being
> explored, not a spec.

## What exists today

The mechanical skeleton is built and playable end to end: hub, generated missions,
permadeath, the economy, an enemy-authoring system, and a winnable campaign. The
setting above describes the target, not the current build — missions are sectors
rather than centuries today. The story layer is this month's work; see
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
