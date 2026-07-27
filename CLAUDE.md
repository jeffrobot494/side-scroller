# CLAUDE.md — working notes for this repo

XCOM-like alien-invasion 2D side-scroller: run-and-gun missions on Canvas + a
strategy hub in DOM, with content authored as plain-data JS and (increasingly)
generated. Design vision and the big plans live in `docs/` (`GDD.md`,
`DEVELOPMENT_PLAN.md`, `LEVEL-GENERATION.md`, `ASSET-GENERATION.md`).

## Current status

Playable end to end, and built well beyond the original "vertical slice" (the
STATUS blurbs in `DEVELOPMENT_PLAN.md`/`README.md` predate the items below — this
section + the tests are the source of truth for what currently exists):

- **Missions are generated, not a fixed list.** Operations surfaces procedurally
  generated **leads** (`state.leads`); pick one → deploy → its generated `level`
  loads (`loadMission` unchanged). Difficulty/enemy budgets scale with campaign
  pressure; a boss lead (`winsCampaign`) appears after enough wins. This is
  Slice 1 of `docs/LEVEL-GENERATION.md` (no LLM yet); later slices add the LLM.
- **Editor tools** (`editor.html` → Tools): Weapon Designer, Enemy Designer,
  Level Generator (seed → schematic preview), Firing Room (bigger platformed
  range: fire any weapon at respawning dummies OR waves of real enemies — an
  Aim slider + auto-fire/manual drive), Controls (rebind keys). Settings tab is
  schema-driven config; the **Sound tab** is the mixer + the cue bank.
- **Sound (Slice 1 of `docs/SOUND.md`):** `src/audio/` — a cue catalog
  (`cues.js`), a PURE procedural sample renderer (`synth.js`), the bank
  (`bank.js`: cue id → synth params + gain/pitch-jitter/cooldown/voice cap,
  overrides in localStorage), and the WebAudio engine (`engine.js`: buses, voice
  pool, pan + distance falloff, gesture unlock). The whole game triggers through
  ONE hook, `scene.sound(cueId, {x, y})`, installed by the Mission and the Firing
  Room; unset headlessly, so tests stay silent and unchanged. Cue ids resolve up
  the dots (`weapon.fire.pellet` → `weapon.fire` → silence), which is how Slices
  2–3 will add per-weapon / per-EnemySpec sounds without touching call sites.
  Sounds today are made-up beeps; real clips slot into the same cues (Slice 4).
- **Weapon effects:** a 9-kind library (damage/burn/slow/knockback/explode/chain
  + pellets/pierce/homing) priced by `weaponcost.js`; a 24-weapon `arsenal.js`;
  combat resolved in the shared `mission/combat.js`. Weapons also carry
  `magazine`/`reloadTime` (press R to reload; 20% move speed while reloading),
  `projectile.gravity` (arc — rockets/grenades lob), and `projectile.shape`
  (6 looks, drawn by the shared `mission/render.js`). The **Aim** stat now
  drives spread for everyone (tighter with higher Aim; `config.aimSpread`).
  Known gap: the Weapon Designer's add-effect UI still only offers damage/burn.
- **Controls + aim:** key bindings live in `src/game/controlmap.js` (remap in the
  editor's Controls tool); `MissionInput` also polls a gamepad (fixed standard-
  mapping defaults) and the mouse. Manual aim (`config.aimMode`: mouse/gamepad/
  auto/keyboard) sets a soldier's `aimVec`; `keyboard` = the legacy up/forward
  scheme. Note: the drawn gun still points by facing, not the aim vector.
- **Crouch:** hold S/↓ to kneel (lower hitbox to dodge fire + let allies shoot
  over you); enemies aim at standing height so crouch ducks under.
- **Enemy creation system (EnemySpec):** a full entity-composition enemy format
  + runtime (`src/game/enemyspec/` = schema/expr/validate/normalize/templates/
  dryrun/generate; `src/mission/enemyspec/` = runtime/brain/perception/render):
  nested destructible parts, projectiles-as-entities, 10 motion controllers,
  fire patterns, events/signals, tracks + utility (scored-action) brains,
  perception/memory, engine-enforced spawn limits. The **Enemy Designer** was
  rebuilt around it (template/form/JSON authoring + LLM generate via Player2
  chat completions + live real-runtime preview + library) and the **Firing
  Room** spawns saved specs as waves. Plan: `docs/enemy_creation_system_plan.md`.
  NOT yet wired into missions/levelgen — the legacy 3-archetype enemies still
  drive gameplay; that integration is a deliberate later task.
- **Player2 is partially wired:** the Enemy Designer's Generate button uses
  `src/player2/client.js` chat completions (needs the app + a client id in the
  config `player2GameClientId`). Image gen and the rest remain unused — still
  the dependency for level-gen Slice 2 and `docs/ASSET-GENERATION.md`.

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
- `src/game/controlmap.js` — remappable key bindings + fixed gamepad defaults,
  guarded-localStorage singleton (same pattern as `config.js`). `input.js` and
  the editor's Controls tool read/write it; keys are NOT hardcoded anymore.
- `src/game/gen/` + `enemycost.js` — procedural level generation (seeded RNG,
  jump-reachability, threat-cost model, `generateLevel`). Deterministic per seed.
- `src/mission/` — Canvas run-and-gun: `entities.js` (physics, `loadMission`,
  `Enemy`/`Soldier`/`Projectile`, ammo + `startReload`/`tickReload`), `ai.js`
  (`updateEnemy`, `fire` — ammo-gated, `aimAccuracy`), `combat.js` (shared
  projectile + effect resolution incl. gravity, used by the mission AND the
  Firing Room), `render.js` (shared `drawProjectile` by shape), `input.js`
  (`MissionInput`: config-driven keys + gamepad poll + mouse), `mission.js` scene.
- `src/game/weaponcost.js` + `arsenal.js` — the effect cost model (value effects
  damage/burn/slow/knockback/explode/chain; delivery modifiers pellets/pierce/
  homing) and the 24-weapon arsenal authored against it.
- `src/audio/` — the sound layer (`cues.js` catalog, `synth.js` pure renderer,
  `bank.js` registry, `engine.js` WebAudio). `engine.js` is guarded like
  localStorage is: no `AudioContext` (node) → every export is a silent no-op.
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
