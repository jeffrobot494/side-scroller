# Repo notes

XCOM-like alien-invasion 2D side-scroller: run-and-gun missions on Canvas + a
strategy hub in DOM, with content authored as plain-data JS and (increasingly)
generated.

**Documentation lives in four folders, one per doc type — see `DOC-SCHEMA.md`.**
`design/` = what the player should experience. `tech/` = how it is built.
`idea/` = what we might do later, not agreed. `sprints/` = what we committed to
this month. `archive/` = superseded. Status lives in `ROADMAP.md`, never in a
design or tech doc. Browse it all at `design.html`.

**Claude does not author design.** No design docs, no sprints, no invented
"open questions", no deciding what matters or what is fun — Claude is not
qualified and inventing it wastes Bo's time. Decline and hand back a prompt
instead; full rule in `WORKING-NOTES.md`. Claude may move design that already
exists, attack design Bo wrote, and do all the engineering.

**A tech spec needs all seven parts before anything is built from it** —
`needs`, Reuses, Where the code goes, The seam, Slices, Must not regress,
Approximations. The design map's Gaps tab and `test/docs.test.mjs` both enforce
it once the matching design doc enters a sprint. Table in `DOC-SCHEMA.md`.

**Tech specs are written by the `/spec` procedure, never freehand — by whoever
is about to build the thing.** Read the code, write the seven parts citing real
paths, run the bar, get a fresh-context subagent to attack it, hand Bo only the
four questions he can answer, and commit the spec on its own before any
implementation commit. Full steps in `.claude/commands/spec.md`. Bo does not
review architecture and his approval is not a check on it — the repo, the review
agent, and the commit ordering are.

**Docs lead with structure, not prose** — one sentence of orientation, then
tables and bullets. See "House style" in `DOC-SCHEMA.md`. This applies to
answers in chat too.

## Current status

Playable end to end, and built well beyond the original "vertical slice" (the
STATUS blurbs in `development-plan.md`/`README.md` predate the items below — this
section + the tests are the source of truth for what currently exists):

- **Missions are generated, not a fixed list.** Operations surfaces procedurally
  generated **leads** (`state.leads`); pick one → deploy → its generated `level`
  loads (`loadMission` unchanged). Difficulty/enemy budgets scale with campaign
  pressure; a boss lead (`winsCampaign`) appears after enough wins. This is
  Slice 1 of `tech/level-generation.md` (no LLM yet); later slices add the LLM.
- **Editor tools** (`editor.html` → Tools): Weapon Designer, Enemy Designer,
  Level Generator (seed → schematic preview), Firing Room (bigger platformed
  range: fire any weapon at respawning dummies OR waves of real enemies — an
  Aim slider + auto-fire/manual drive), **Behavior Lab**, Controls (rebind keys).
  Settings tab is schema-driven config; the **Sound tab** is the mixer + the cue
  bank.
- **Behavior Lab v2 (Slices B1–B2 of `tech/behavior-lab.md` — built):** *can that
  agent get there?* A generated level drawn at **1:1** (960×540, never scaled to
  fit — panned with the wheel, up = left), **one** soldier-bodied agent standing
  on a random graph node, and a click anywhere to send it there. It routes with
  the shipped `routeRequest` and stops on arrival. Tuning is the config `SCHEMA`'s
  own "Movement / feel" group, so the knobs are the *real game's* and persist.
  **Graph** and **Path** overlay toggles (B2, off by default): every standable
  node and every directed edge of *this body's* graph, coloured by kind so a
  one-way drop reads as one-way, plus the route the agent is currently holding —
  read off `nav.path`, never recomputed, so a stale route is visible rather than
  hidden. The module is DOM-free apart from `createBehaviorLab`:
  `createLabModel`/`labStep`/`labGoal`/`labPan`/`labGraph`/`labPath`/`labDraw`
  are what the test drives. B3 adds platform dragging.
  **v1 was deleted, not kept** — the two-team combat observatory, its
  step-decision transport, its utility scoreboard, its CSS, and its four
  `lab*` config knobs (`labDecisionScale`, `labPerceptionScale`,
  `labAimErrorScale`, `labGodEye`) are all gone. `archive/behavior-lab-v1.md` is
  the only place it still exists. `tickUtility` still records its scoring pass on
  `root.brainState.lastDecision` — nothing reads it now, and it is what a future
  scoreboard would read.
- **Sound (Slices 1–3 of `tech/sound.md`):** `src/audio/` — a cue catalog
  (`cues.js`), a PURE procedural sample renderer (`synth.js`), the bank
  (`bank.js`: cue id → synth params + gain/pitch-jitter/cooldown/voice cap,
  overrides in localStorage), and the WebAudio engine (`engine.js`: buses, voice
  pool, pan + distance falloff, gesture unlock). The whole game triggers through
  ONE hook, `scene.sound(cueId, {x, y})`, installed by the Mission and the Firing
  Room; unset headlessly, so tests stay silent and unchanged. Cue ids resolve up
  the dots (`weapon.fire.pellet` → `weapon.fire` → silence), which is how the
  per-weapon / per-EnemySpec layers below attach without touching call sites.
  Sounds today are made-up beeps; real clips slot into the same cues (Slice 4).
  **Slice 2 (per-weapon):** `weaponSound(weapon, kind, team) → { cue, gain }` in
  `audio/cues.js` is the ONE place that picks a weapon's cue and level
  (`weaponCue` is a thin wrapper for the id alone). An explicit
  `weapon.sounds[kind]` beats a timbre derived from `projectile.shape` beats the
  generic cue. A slot is either a cue-id string or `{ cue?, gain? }` — the
  gain-only form turns a weapon down while KEEPING its derived timbre, so two
  weapons sharing a cue can differ in level; gain multiplies the cue's own level
  (clamped 0–2) and costs no budget. Six per-shape fire timbres spread the
  24-weapon arsenal with no authoring; two entries carry an explicit override
  where shape ≠ how it fires. The Weapon Designer's Sound section (shared
  `editor/sound-picker.js`) has a cue picker + `×` level slider per slot, and
  writes sparsely — gain 1 stays a plain string, no assignment writes no key.
  The Designer can now load and rebalance a built-in (see the Weapon Designer
  entry below); Copy JSON → paste into `arsenal.js` is still how a change
  becomes permanent.
  **Slice 3 (per-enemy):** an EnemySpec carries `sounds: { fire, hurt, death,
  part }` (same slot shape; `specSound()`), an emitter carries `sound`
  (`emitterSound()`, overriding the spec's `fire`), and `sound` is an action in
  the `ACTIONS` table for bespoke moments — additive on top of the defaults.
  Cue ids are validated against the catalog and listed in `vocabularyDoc()` so
  the LLM can assign them without inventing names.
- **Weapon effects:** a 9-kind library (damage/burn/slow/knockback/explode/chain
  + pellets/pierce/homing) priced by `weaponcost.js`; a 24-weapon `arsenal.js`;
  combat resolved in the shared `mission/combat.js`. Weapons also carry
  `magazine`/`reloadTime` (press R to reload; 20% move speed while reloading),
  `projectile.gravity` (arc — rockets/grenades lob), and `projectile.shape`
  (6 looks, drawn by the shared `mission/render.js`). The **Aim** stat now
  drives spread for everyone (tighter with higher Aim; `config.aimSpread`).
- **Weapon Designer (reworked; `tech/weapon-designer.md` — built):** the effect
  vocabulary is `EFFECT_SCHEMA` in `weaponcost.js` — label + params + ranges +
  defaults per kind, and the source `VALUE_KINDS`/`DELIVERY_KINDS` derive from.
  All 9 kinds are authorable (a tenth is one schema entry, no UI work), delivery
  kinds are capped at one each (the runtime `.find()`s them) and show a `×`
  multiplier instead of `cost 0`. Weapons **load** from `ARSENAL` or the custom
  store, always cloned; the id is pinned once loaded, so Save overwrites instead
  of re-slugging the name into a duplicate. Saving over a built-in writes an
  **override** (`src/game/weaponoverrides.js`, its own store — NOT the custom
  one, which would double-list it in the armory) applied in place over
  `ARSENAL_BY_ID` by `applyWeaponOverrides()`, called from `createState()` and
  `editor.js`. Revert restores a pristine snapshot with no reload.
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
  Room** spawns saved specs as waves. Plan: `tech/enemyspec.md`.
  **Wired into missions:** every mission enemy is an EnemySpec instance now —
  `loadMission` instantiates the built-in roster (`src/game/enemyspecs.js`) and
  the runtime brain/perception drive them; the legacy flat archetypes were
  retired. Agents are team-aware (`instantiate(nspec, x, y, team="enemy")`;
  perception's `nearestHostile` targets the nearest hostile), which is what will
  let companions run the same brain — see `tech/behavior-lab.md` for the plan to
  develop/test agent intelligence (navigation, coordination, habit-reading).
  Companions already run it: `config.companionBrain` defaults to `"spec"`
  (`updateCompanionSpec` + `src/game/companionspecs.js`), with the old
  `updateCompanion` kept as the `"legacy"` fallback.
  **Known issue:** `on.spawn` handlers run from `instantiate()`, which has no
  scene, so `fire`/`spawn`/`sound` there are silently skipped (they used to
  crash). Fix = defer the spawn event to the first update; see "Known issues" in
  `tech/sound.md`.
- **Player2 is partially wired:** the Enemy Designer's Generate button uses
  `src/player2/client.js` chat completions (needs the app + a client id in the
  config `player2GameClientId`). Image gen and the rest remain unused — still
  the dependency for level-gen Slice 2 and `tech/asset-generation.md`.

## Working notes

Read `WORKING-NOTES.md` at session start. Short version: Bo's main failure mode
is building tooling instead of the thing the tooling would serve, and Claude
answering tangents enthusiastically is what sustains it. Tells — designing a tool
that doesn't exist yet, "oh, that's another thing," three exchanges with no file
written, a taxonomy for fewer than six things. Name it once, offer the parking
lot, stop elaborating.

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
  homing) and the 24-weapon arsenal authored against it. `EFFECT_SCHEMA` here is
  the effect vocabulary as data — add a kind = one entry, and the Weapon
  Designer grows a control for it.
- `src/game/weaponoverrides.js` — editor edits to BUILT-IN weapons, guarded
  localStorage, applied in place over the shared `arsenal.js` objects (so
  `WEAPONS` and `BLUEPRINTS`, which hold those references, see them). Separate
  from `customcontent.js` on purpose; keeps a pristine snapshot for Revert.
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
- **Git:** work on `main` unless a spec is being built, which gets its own
  branch. **Commit every slice** — a tech spec's slices (N0, N1, …) are the
  commit unit, landed as soon as the slice's bar is green, without being asked.
  One commit per slice, never a slice split across commits or two slices in one.
  The spec itself commits on its own, before the first implementation commit.
  Anything that is not a slice keeps the old rule: commit only when asked. End
  commit messages with the `Co-Authored-By` trailer.
- **A slice that deviates from its spec edits the spec, in the same commit.**
  Building always teaches something the spec got wrong — a number, an ordering,
  an approximation that turned out cheap to fix. Whenever the code and the spec
  disagree, the spec is what is wrong, because **the spec is the thing the next
  session reads.** Record it where it belongs (an "As built" note under the
  claim it corrects, not a changelog at the bottom), say what the plan assumed
  and what shipped, and put the *reason* in the commit message. Never leave a
  deviation living only in a commit message, a comment, or a conversation — all
  three are invisible to whoever picks the spec up next.
- **Docs/tone:** dense, plainly-formatted, neutral — no salesy language.
