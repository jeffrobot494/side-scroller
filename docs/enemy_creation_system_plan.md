# Enemy Creation System: EnemySpec format + new Enemy Designer (LLM + manual)

## Context

Today's enemies are flat stat blocks with three hardcoded behaviors, and the Enemy
Designer (`src/editor/tools/enemy-designer.js`) is a slider panel over that format.
Two docs define where enemy design is going:

- `docs/llm_adaptive_enemy_system_plan_v2.md` — **EnemySpec**: entity-composition
  format (nested destructible parts, projectiles-as-entities, motion controllers,
  emitters/patterns, events/signals, FSM with parallel tracks, expression language,
  validation/normalization/dry-run).
- `docs/smarter_enemy_ai_2d_action_shooter_platformer.md` — the **decision layer**:
  perception, short-term memory, predictive aiming, utility (scored-action) brains.

**This build is the enemy CREATION system only** — the format, the runtime needed to
preview it, a new Designer tool (prompt an LLM via player2 chat completions OR author
manually), and a library to save into, usable in the Designer preview and the Firing
Room.

**Explicitly OUT of scope** (deliberately untouched): missions/`loadMission`'s enemy
path, `ai.js updateEnemy`, level generation, campaign state, telemetry, player
feedback, adaptation/patching, ecosystem generation. The game pages keep running the
old enemies exactly as today. Wiring spec-enemies into real missions is a later,
separate task.

### Decisions locked (planning Q&A)
- **Vocabulary**: v2 doc §14 game-jam scope (parts, entity-projectiles, ~10 motions,
  5 patterns, tracks, events/signals, expressions, limits) **plus** utility brains
  (perception, memory, scored actions). `brain.mode: "tracks" | "utility"`.
- **Manual UX**: form builder for common fields + a JSON panel for full expressiveness.
- **Usage surface**: Designer live preview + Firing Room can spawn saved spec-enemies.
- Since we are NOT replacing the built-in three, **no legacy-parity render hook is
  needed** — the runtime renders primitive shapes only (box/circle/ellipse/diamond).

---

## 1. Spec foundation — `src/game/enemyspec/` (pure logic, node-importable)

- **`schema.js`** — the closed vocabulary as data, one source of truth for validator,
  normalizer, form UI, and the LLM prompt. Components `visual/body/health/motion/
  contact/emitters/brain/children/on/vars/life/link` + top-level `{ v, id, name,
  threat, role, tier, limits, vars, defs, root, brain }`. Motions: `static velocity
  gravity moveTo patrol chase home orbit hover dash keepDistance`. Actions: `wait
  moveTo setMotion fire spawn telegraph set add mul signal destroy detach enable
  disable`. Patterns: `single burst fan ring aimed`. Events: `spawn destroy damage
  healthBelow contact childDestroyed playerNear playerFar timer signal stateEnter
  stateExit`. Link policies: `destroy detach disable ignore transform`.
- **`expr.js`** — parse + evaluate the whitelisted expression language
  (`self.hpPct <= 0.5`, `alive('leftWing')`, `distance(self, player)`,
  `countAlive('tag:x')`, `sense.*` properties; arithmetic/comparison/boolean only —
  no scripting). Pre-parsed at validation; malformed → hard reject.
- **`validate.js`** — schema (types/enums/ranges/unique IDs/max depth), references
  (defs/emitters/states/sockets/signals resolve), behavior (no empty infinite loops,
  no zero-delay loops, reachable states, valid expressions), spawn analysis + `limits`
  (`maxAlive/maxSpawnsPerSecond/maxSpawnDepth`, recursive-spawn detection). Returns
  `{ ok, errors: [{ path, msg }] }` — error paths feed both the UI and the LLM repair
  prompt.
- **`normalize.js`** — sparse spec → fully-defaulted spec; runtime consumes only this.
- **`templates.js`** — starter specs as data: charger / shooter / flier / multi-part
  boss skeleton (wings + emitters + phases, Iron-Moth-shaped) / utility skirmisher
  (Cowardly-Duelist-shaped). Triple duty: Designer "New from template", LLM few-shot
  examples, test fixtures.
- **`dryrun.js`** — headless acceptance gate: instantiate in a hidden arena with a
  dummy player, simulate N seconds at fixed step, assert it moves / attacks / can be
  damaged / dies / respects limits, catch runtime throws. Returns a report
  `{ ok, facts, errors }` surfaced in the Designer and used by tests + LLM pipeline.
- **`generate.js`** — the LLM path (client injected, never constructed here):
  `generateEnemySpec(client, userPrompt, opts)` → prompt = vocabulary reference from
  `schema.js` + 2 few-shot templates + the user's description →
  `client.chatJSON` (`src/player2/client.js`) → parse → validate → normalize → dryrun
  → accept; on failure, ONE repair round (errors fed back) → accept or return
  `{ ok:false, errors }`. Never throws raw; caller shows errors.

## 2. Runtime — `src/mission/enemyspec/` (node-importable, like existing mission code)

- **`runtime.js`** — `instantiate(normalizedSpec, x, y)` → live entity tree;
  `updateSpecEnemy(root, dt, scene, ctx)` per frame: motion controllers → brain tick →
  emitters (spawn plain `Projectile`s for simple guns, OR instantiate entity
  projectiles/summons from `defs`) → event/signal dispatch → `link` lifecycle
  (parent/child death policies) → `life` ttl → limit enforcement (engine-enforced even
  if validation passed). Reuses `stepActor`/`overlaps` (`src/mission/entities.js`) for
  physics and `applyEffects` (`src/mission/combat.js`) for damage via the caller's ctx.
  Exposes `collidables(root)` — a flat list of damageable entities (each with
  `x/y/w/h/health/alive/...`) so host scenes (preview, Firing Room) register parts and
  entity-projectiles as hittable targets without changing `combat.js`.
- **`brain.js`** — `tracks` mode: parallel step sequences with waits/loops/`if`,
  transitions on expressions/events, state `enter` actions. `utility` mode: every
  `decisionInterval` (0.2–0.5s), filter candidate actions by `conditions`, score via
  expression-driven `scoring` factors + small noise, execute winner with
  **windup → commit → recovery** (no cancel mid-commitment), cooldowns. Ambient tracks
  may run alongside.
- **`perception.js`** — sensor pass on the decision interval, exposed to expressions
  as `sense.*`: line-of-sight (segment vs `scene.platforms`), player above/below/
  distance/approach-speed, ground-ahead, cornered. Writes short-term memory into
  `vars`: last-known position/velocity, `timeSinceSeen`, with decay. Aim styles for
  `fire`/`aimed`: `current | lead | landing` (+ `predictionTime` range + aim error).
- **`render.js`** — `drawSpecEnemy(ctx, root)`: walk the tree, draw each `visual`
  primitive (shape/size/tint/rotation), telegraph flash, per-part health bars, reuse
  `drawProjectile` (`src/mission/render.js`) for plain projectiles. Eyeball-only.

## 3. New Enemy Designer — replace `src/editor/tools/enemy-designer.js`

Same registration contract (`createEnemyDesigner(container, onBack) → { dispose() }`,
TOOLS id `enemy-designer` kept; update label/desc in `src/editor/editor.js`). One
synchronous `draw()` at mount; `dispose()` cancels the rAF loop. Reuse `wd-*`/`cfg-*`
CSS, add `ed-*` as needed. Layout:

- **Create bar**: prompt textarea + "Generate" (LLM) · "New from template" picker ·
  Player2 connect button + status chip (client auth via the local Player2 app;
  `authenticate()` in `src/player2/client.js`). Without auth, generation is disabled
  with a hint — manual authoring fully works.
- **Form panel** (common fields, schema-driven): name/id, threat/role/tier, root
  visual (shape/size/color), body, health, contact damage, motion type + its params,
  one emitter (projectile ref + pattern + count/spread), brain mode picker. Edits
  rebuild the spec → JSON panel + preview refresh.
- **JSON panel** (full power): the whole spec, editable; validate-on-input (debounced)
  with the `{ path, msg }` error list rendered beside it; valid JSON → re-instantiate
  preview + sync form fields it can represent. Form and JSON edit the same underlying
  spec object; JSON is authoritative for structures the form can't express.
- **Live preview**: mini arena (ground + one perch + dummy soldier target, reusing the
  current designer's scaled-world approach) running `updateSpecEnemy` + `drawSpecEnemy`
  — real runtime, real physics. Reset button; dry-run report line (from `dryrun.js`).
- **Library**: saved spec list (load / duplicate / delete / export JSON), Save button
  (validation-gated). Storage: **new guarded-localStorage store in
  `src/game/customcontent.js`** — key `sidescroller.enemyspecs.v1`, functions
  `listEnemySpecs / saveEnemySpec / deleteEnemySpec / enemySpecMap` following the
  existing `saveInto/deleteFrom` pattern (id slugging + collision suffixing). Kept
  SEPARATE from the legacy custom-enemy store so `loadMission` and the game pages are
  untouched.
- **Config**: add `player2GameClientId` (string) to the config `SCHEMA`
  (`src/game/config.js`) so the client id is editor-tweakable, per convention.

## 4. Firing Room hookup — `src/editor/tools/firing-room.js`

Minimal branch: the enemy-wave selector also lists saved spec-enemies
(`enemySpecMap()`). A spec entry instantiates via `runtime.instantiate`, updates via
`updateSpecEnemy`, draws via `drawSpecEnemy`, and registers its `collidables()` in the
scene's target list so player weapons damage parts and shootable projectiles. Built-in
enemy waves unchanged.

## 5. Tests (`node test/run.mjs` bar)

- `test/enemyspec.test.mjs` — expr parse/eval + rejects; validate catches bad
  ref/enum/depth/empty loop/spawn bomb/malformed expression; normalize defaults;
  every template validates + normalizes clean.
- `test/enemyspec-runtime.test.mjs` — templates instantiate; motion moves; emitter
  fires (plain + entity projectile); part destruction fires `on.destroy` signal +
  link policy; phase transition on `hpPct`; limits clamp a spawn flood; dry-run passes
  templates and fails a sabotaged spec.
- `test/enemyspec-brain.test.mjs` — perception facts on a fixture scene; memory decay;
  utility picks the dominant action; commitment holds through windup; cooldown gates.
- `test/enemyspec-generate.test.mjs` — pipeline with a **stubbed client** (good JSON
  accepted; fenced JSON cleaned; invalid spec → repair round → accept; still-invalid →
  `{ ok:false }`). No live API in tests.
- Update `test/content.test.mjs` (spec store CRUD + guard without localStorage) and
  `test/tools.test.mjs` (new designer mounts headless with one sync draw; firing room
  still mounts; dispose cancels rAF).

## Order of work

1. Foundation: `schema/expr/validate/normalize/templates` + tests (pure node — fastest
   feedback).
2. Runtime core: tracks brain, motions, emitters, parts/links, entity projectiles,
   signals, limits + `render.js` + `dryrun.js` + tests.
3. Intelligence: `perception.js` + utility mode + tests.
4. Designer tool (manual path complete: form + JSON + preview + library).
5. LLM path: config knob, Player2 connect UI, `generate.js` + prompt box + repair loop.
6. Firing Room hookup.

Each step leaves everything green and the game pages untouched.

## Verification

- `node test/run.mjs` fully green; serve-check new files return 200
  (`python3 -m http.server 8000`).
- Eyeball (no browser in harness — user verifies): open `editor.html` → Enemy
  Designer: build an enemy from the form, break it in JSON (errors listed), fix it,
  watch the preview; load the boss template — wings fire, a destroyed wing signals a
  phase change; save to library; Firing Room → spawn it and shoot its parts. With the
  Player2 app running: connect, prompt "a floating mine-layer with a shielded core",
  get a validated enemy in the preview; with the app absent, generation disabled
  gracefully.

## Key risks

- **Runtime is the bulk of the effort** — entity trees, links, signals, and utility
  brains are a real engine. The closed §14+utility vocabulary and validation-first
  order keep it bounded; anything not in `schema.js` doesn't exist.
- **Hittable parts without touching combat.js**: solved via `collidables()` — host
  scenes register parts as targets; `combat.js` iterates what it's given, unchanged.
- **LLM output quality**: closed vocabulary + few-shot templates + validate/dryrun/
  one-repair pipeline; failure is a shown error, never a broken tool.
- **Form/JSON sync**: JSON is authoritative; the form only maps what it understands —
  avoid trying to round-trip arbitrary nesting through form controls.
