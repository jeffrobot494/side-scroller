# CLAUDE.md — working notes for this repo

XCOM-like alien-invasion 2D side-scroller: run-and-gun missions on Canvas + a
strategy hub in DOM, with content authored as plain-data JS and (increasingly)
generated. Design vision and the big plans live in `docs/` (`GDD.md`,
`DEVELOPMENT_PLAN.md`, `LEVEL-GENERATION.md`, `ASSET-GENERATION.md`).

## Running it (no build step)

Static site — serve the folder and open a page. No bundler, no transpile.

    python3 -m http.server 8000        # then open http://localhost:8000/

- `index.html` → `src/main.js` — the game (single page + scene manager).
- `editor.html` → `src/editor/editor.js` — the dev editor (settings + GUI tools).
- Modules load in the browser as native ESM (`<script type="module">`); the
  browser ignores `package.json`.

## Testing (headless node, no browser)

    node test/run.mjs            # all suites — the regression bar
    node test/run.mjs gen        # only suites whose filename contains "gen"
    npm test                     # same as run.mjs

- **`package.json` exists only so node runs the ESM tests** (it sets
  `"type":"module"` so the `.js` source parses as ESM under node). It introduces
  no build step and the browser ignores it. Don't add dependencies.
- Write suites as `test/<name>.test.mjs` exporting `export default async
  function run(t) { … }` and assert with `t.ok(name, cond)` / `t.eq(name,
  actual, expected)`. Import the game via `../src/...`.
- **`test/harness.mjs`** provides the shared stubs — `installDom()`, `makeEl()`,
  `ctx2d()`, `stubLocalStorage()` — so tests never re-derive DOM/canvas/storage
  mocks. The runner gives each suite a fresh `localStorage` and installs the DOM.
- **Regression bar before committing:** `node test/run.mjs` green, plus a
  serve-check that new files return 200 (`python3 -m http.server`). There is no
  browser here — verify logic headlessly and tell the user to eyeball visuals;
  flag anything you couldn't see.

## Architecture map

- `src/game/state.js` — single authoritative game state + all meta actions
  (hire, commission, sell, advance day, apply mission result). Mutations go
  through the exported actions so rules live in one place.
- `src/game/content.js` — the data library: `WEAPONS`, `ENEMIES`, `BLUEPRINTS`,
  `TUNING` (hand-authored levels/missions were replaced by generation).
- `src/game/config.js` — schema-driven settings/tuning. Add a knob = one `SCHEMA`
  entry; the editor auto-generates its control. The live `config` object is read
  by the game; overrides persist to localStorage.
- `src/game/customcontent.js` — editor-authored weapons/enemies, guarded
  localStorage; merged into the armory (`createState`) and `loadMission`.
- `src/game/gen/` + `enemycost.js` — procedural level generation (seeded RNG,
  jump-reachability, threat-cost model, `generateLevel`). Deterministic per seed.
- `src/mission/` — Canvas run-and-gun: `entities.js` (physics, `loadMission`,
  `Enemy`/`Soldier`/`Projectile`), `ai.js` (`updateEnemy`, `fire`), scene/input.
- `src/hub/` — every DOM screen (rooms, deploy, results, win/lose) + CSS. Owns no
  rules; calls state actions.
- `src/player2/` — Player2 API client (`client.js`, `queue.js`). LLM + image
  generation gateway. **Exists but not yet wired** (see the two docs above).

## Conventions

- **Editor GUI tools** follow `createX(container, onBack) → { dispose() }`.
  Register in `editor.js`: add a `TOOLS` entry (`{ id, label, desc }`), add the
  id to `MOUNTABLE`, and to the `factory` map. Do **one synchronous `draw()` at
  mount** (also makes a headless mount verifiable), and `dispose()` must cancel
  any rAF loop. Reuse the `wd-*` / `cfg-*` / `.toggle` CSS or add `ed-*`/`lg-*`.
- **Everything tweakable in the editor** (a standing requirement): constants and
  curves → the config `SCHEMA`; bespoke processes → a Tools-tab panel; tables /
  rosters → JSON data modules. If it introduces a number, it goes in a schema;
  if it introduces a process, it gets a preview/inspect surface.
- **Cross-page data goes through localStorage**, read at load time. The editor and
  game are separate pages with separate module state — after saving in the
  editor, reload the game to see it. localStorage is per-browser; "make it
  permanent" = export JSON and paste into the source data module.
- **Fallback discipline:** generated/authored content always falls back to the
  built-in (a missing custom enemy → built-ins; a bad generation → the procedural
  baseline). The game must stay playable at every step.
- **Guard every `localStorage` access** (`try/catch` + `typeof localStorage`) so
  node imports don't throw.
- **Git:** work on `main`; commit only when asked; one commit per task; end
  commit messages with the `Co-Authored-By` trailer.
- **Docs/tone:** dense, plainly-formatted, neutral — no salesy language.
