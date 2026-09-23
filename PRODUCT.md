# Product

<!-- impeccable:product-schema 1 -->

Durable product truth for UI work on this repo's **DOM surfaces**. It holds no
design, no aesthetics and no status — `design/` owns what the player should
experience, `tech/` owns how it is built, `ROADMAP.md` owns what is done, and
`DOC-SCHEMA.md` is the contract for all three. This file is tool context that
keeps a design session from re-asking what is already settled. Every line below
traces to a file in this repo or to an answer Bo gave on 2026-09-23; anything
that traces to neither is marked **Undecided**.

## Platform

web

## Users

| User | Situation | Job |
|---|---|---|
| **The player** | At a desktop browser, keyboard + mouse (gamepad supported), one long campaign across many sessions | Run an organisation between missions: hire, arm, pick a point in time, deploy, read what came back. Then personally fight the mission |
| **Playtesters** | Friends, a small group, on their own machines with no one sitting beside them | Reach a first mission and understand what the campaign is asking of them, without Bo in the room to explain it |
| **Bo** (the editor's only user) | Same machine as the build, mid-session, tuning and authoring | Change a number and see it, author a weapon or an enemy, watch one agent navigate, and get back to the game |

Playtesters are the audience that changes decisions: a screen that reads
correctly only to its author is a defect on the hub and acceptable in the editor.

## Product Purpose

An XCOM-style squad game: a strategy hub in DOM, run-and-gun missions on Canvas,
permadeath, and an LLM-authored history that diverges from each mission's outcome
(`design/GDD.md` §1, `README.md`). The game is about **drama** — soldiers have
names and die permanently, and the campaign can be lost even when your people
live (`design/GDD.md` §1).

Success, for the surfaces this file covers: a playtester reaches a deploy without
being told how, and Bo can change any tunable thing without editing source
(`CLAUDE.md`, "Everything tweakable in the editor").

## Positioning

| | |
|---|---|
| The mechanism | Mission outcomes feed a story generator; the generated history supplies the next points of intervention, so divergence compounds and no two campaigns produce the same world (`README.md`, `design/GDD.md` §1.1). **Not built yet** — `ROADMAP.md` |
| The consequence | A win and a loss are both inputs. Neither is measured against a target timeline, because there isn't one |
| Structurally hard to copy | Zero dependencies, no build step, no framework: the whole game is native ESM a browser loads directly (`CLAUDE.md`) |

## Operating Context

**Two pages, one visual world, separate module state.** Cross-page data goes
through `localStorage`, read at load; after saving in the editor you reload the
game (`CLAUDE.md`, Conventions).

| Surface | Path | Mode | Contents |
|---|---|---|---|
| **Hub** — in scope | `index.html` → `src/hub/` (800 lines of `hub.css`) | Operate | Five rooms (Barracks · Engineering · Operations · Robotics · War Room), each with a named staff officer; deploy, results, win/lose, lobby; a top bar carrying the brand, the day, a Sector-health chip, credits (§), the roster count, "Advance the day ▸" and a ⚙ link to the editor |
| **Editor** — in scope | `editor.html` → `src/editor/` (668 lines of `editor.css`) | Operate | Settings (schema-generated), Sound mixer, and eight mounted tools: Weapon Designer, Enemy Designer, Level Generator, Firing Room, Aim Lab, Behavior Lab, Progression, Controls |
| Mission | `<canvas id="game">`, 960×540 | — | Canvas, not DOM. Out of scope for design work here |
| Design map | `design.html` → `src/docmap/` | Read | Out of scope by Bo's answer, 2026-09-23 |
| Landing page | — | — | Does not exist, and none is planned |

Two more contexts a hub change must survive:

- **Hot-seat and rooms.** `?players=2` splits the screen locally; `?room=2` prints one link per commander and each seat gets its own view of one shared campaign (`tech/multiplayer-service.md`, `tech/multiplayer-missions.md`).
- **`editor.html?server=1`** points the Settings tab at a running server instead of `localStorage`, and Reset deliberately does not cross the wire (`tech/server-settings.md`).

## Capabilities and Constraints

| Constraint | Consequence for any UI change |
|---|---|
| **No build step, no bundler, no dependencies** (`CLAUDE.md`) | No Tailwind, no React, no PostCSS, no icon package. Hand-written CSS and native ESM, or it does not ship |
| **`package.json` exists only so node runs the ESM tests and a host finds `npm start`** | Adding a dependency breaks a stated property of the repo |
| **Single-player must keep needing no process** | `python3 -m http.server` serves a playable game; multiplayer needs `npm start` |
| **Every number goes in the config `SCHEMA`; every process gets a preview surface** (`CLAUDE.md`) | A new tunable is one schema entry and the editor generates its control. Don't hardcode |
| **Editor tools follow `createX(container, onBack) → { dispose() }`** | One synchronous `draw()` at mount (so a headless mount is verifiable), and `dispose()` cancels any rAF loop |
| **Guard every `localStorage` access** | Node imports the same modules in tests |
| **New gameplay state goes on the wire in the same commit that invents it** | `src/net/mission-wire.js` is a whitelist; an unnamed field is silently absent to the *other* commander |
| **No browser in the test environment** | Logic is verified headlessly (`node test/run.mjs`); visuals must be eyeballed by Bo, and anything unseen is flagged |
| **Undecided: viewport floor.** `hub.css` has one `@media (max-width: 720px)`; the mission canvas is fixed at 960×540. Whether the hub is meant to work below that has never been decided | Treat desktop as the target until Bo says otherwise |

**Terminology** (use these words, they are the game's): lead · point of
intervention · deploy · the day · doom · commander · squadmate · EnemySpec ·
room · Ops.

## Brand Commitments

| | |
|---|---|
| Name | **"XCOM Task Force"** is explicitly a *working title* (`design/GDD.md`). The real name is **Undecided** — and the current one borrows a live trademark, which matters once anyone outside sees it |
| Incumbent visual world | Deliberate and documented in code: "the feeling of looking into carved-out rooms and tunnels deep under an underground command bunker. Concrete, earth, and thin strips of artificial light" (`src/hub/hub.css` header). Fourteen CSS custom properties on `:root` are the token set |
| Voice in docs and UI | Dense, plainly formatted, neutral. **No salesy language** (`CLAUDE.md`, and `MEMORY.md` records it as a standing preference) |
| Art direction | `design/art-direction.md` is authored and binding where it applies: raster where static, procedural where it moves; nothing breaks for lack of art; shipping with coloured boxes is acceptable for a long time |
| Hard rule on authorship | **Claude does not originate design for this project** (`WORKING-NOTES.md`). Claude may move design that exists, attack design Bo wrote, and do all the engineering |

## Evidence on Hand

| Real | Where |
|---|---|
| A playable game, end to end | `index.html`; `CLAUDE.md`'s current-status section is the accurate account |
| The incumbent hub design | `src/hub/hub.css`, `src/hub/hub.js`, `src/hub/ambient.js` |
| A 3D art-direction study (rainy night street, Three.js, no characters) | `visual-design/` — one dated study, not adopted |
| Three navigation screenshots | `screen-shots/` — debugging evidence, not marketing imagery |
| Design + tech docs | `design/` (19 files), `tech/` (28 files), browsable at `design.html` |
| Mockups, already built against | `design/*.mockup.html`, `tech/enemy-designer.mockup.html` |

**Absent — do not fabricate:** no players outside Bo yet, no playtest notes, no
reviews, press, metrics, logos, character art, screenshots of the hub, pricing,
licence, or release plan. The story engine is written about but **not built**.

## Product Principles

Extracted from what is already written down. Nothing here is new.

| Principle | Source |
|---|---|
| **Drama is the product.** Permadeath, no safety nets; grief and tension are manufactured on purpose | `design/GDD.md` §1 |
| **The game must stay playable at every step.** Generated or authored content always falls back to the built-in; a missing asset degrades to a coloured shape and the state keeps running | `CLAUDE.md` Fallback discipline · `design/art-direction.md` |
| **Everything tweakable lives in a surface, not in source.** A number is a schema entry; a process gets a preview/inspect panel | `CLAUDE.md` Conventions |
| **Legibility at speed is a mechanic.** Gameplay-critical things are authored, not generated, because the player has to read them instantly | `design/art-direction.md` |
| **Prefer a built thing over a designed thing.** Tooling that outruns the thing it serves is this project's named failure mode | `WORKING-NOTES.md` |

## Accessibility & Inclusion

No accessibility standard has been set for this project. Two facts, so later work
does not mistake absence for a decision:

- **Honoured today:** `prefers-reduced-motion` in `hub.css`; keyboard bindings are fully remappable (`src/game/controlmap.js` + the editor's Controls tool); input works via keyboard, mouse or gamepad.
- **Absent today:** zero `aria-*` attributes and zero explicit `role`s across `src/hub/hub.js` and `src/editor/editor.js`; no focus-visible styling audit has been done. Recorded as a gap, **not** as a requirement — setting one is Bo's call.
