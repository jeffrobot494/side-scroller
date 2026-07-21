# XCOM Task Force — side-scroller

An XCOM-style alien-invasion game with a 2D run-and-gun action layer, built from
scratch on plain JS + the HTML5 Canvas API — no framework, no build step. Hire a
squad, deploy into missions, fight JSON-defined enemies with AI companions, lose
soldiers permanently, sell loot, commission weapons, and beat the doom clock.

This repo currently holds a **playable vertical slice** of the full core loop.
See `docs/DEVELOPMENT_PLAN.md` and `docs/GDD.md`.

## Run it

The code uses ES modules, so it must be served over HTTP (not opened as a
`file://` path). Any static server works:

```bash
# Python (already on most machines)
python3 -m http.server 8000
# then open http://localhost:8000
```

or, if you have Node:

```bash
npx serve .
```

## How to play

1. **Barracks** — hire a few soldiers (you start with §750).
2. **Operations** — pick a mission and **Deploy squad** (up to 3). Assign each
   soldier a weapon from the armory.
3. **Mission** — reach the **EXTRACT** gate on the right. Kill enemies for loot.
   Anyone who dies is gone for good.
4. **Results** — sell recovered loot for credits.
5. **Engineering** — commission a better weapon (finishes after a few days).
6. **War Room** — **Advance the day** to progress fabrication and the doom clock.
7. Complete **Recon → Raid → The Hive Core** to win, before the doom clock
   drains the sector to 0.

### Mission controls

- **Move:** `A` / `D` or Arrow keys
- **Aim up:** `W` / Up
- **Jump:** Space
- **Fire:** `J`
- **Swap controlled soldier:** `Tab` (control also auto-swaps on death)

## Structure

| Path                    | Responsibility                                             |
| ----------------------- | ---------------------------------------------------------- |
| `index.html`            | Single entry; scene manager mounts the hub or the mission  |
| `src/main.js`           | App bootstrap + scene manager (hub ↔ mission)              |
| `src/game/content.js`   | The JSON content library: weapons, enemies, levels, etc.   |
| `src/game/state.js`     | Unified game state + all meta actions                      |
| `src/game/soldiers.js`  | Soldier schema + starting recruit pool                     |
| `src/hub/`              | All DOM screens (rooms, deploy, results, win/lose) + CSS   |
| `src/mission/`          | Canvas run-and-gun: scene, entities, AI, input            |
| `src/game/config.js`    | Tweakable settings + tuning constants (single source)      |
| `editor.html` `src/editor/` | Dev editor for settings/tuning; GUI tools to come      |
| `src/player2/`          | Player2 API client (LLM authoring — not yet wired)         |

## Editor

Open `editor.html` (or the ⚙ in the hub top bar) to tweak settings and tuning
constants — friendly fire, squad damage, gravity, run/jump speed, the doom-clock
rate. Controls are auto-generated from a schema in `src/game/config.js`; adding a
knob is one entry there. Changes save to your browser instantly (live values
apply mid-mission; load-time values on the next deploy). **Export JSON** to copy
values into `config.js` defaults and make them permanent. GUI tools (weapon,
enemy, and level editors) will live under the editor's Tools tab.
