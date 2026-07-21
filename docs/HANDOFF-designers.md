# Handoff: wire the Weapon Designer + build the Enemy Designer

> For the next agent, cold. Two tasks in one session. Do Task A first (small,
> unblocks testing the loop), then Task B. Commit each task separately.
> Delete this file when both are done.

## 0. Orientation (read these first)

Single-page game (`index.html` + scene manager `src/main.js`) with a separate
dev editor (`editor.html` → `src/editor/`). Content is plain-data JS modules;
the game instantiates live objects from it. Key files for this work:

- `src/game/content.js` — `WEAPONS`, `ENEMIES`, `LEVELS`, `MISSIONS`, `BLUEPRINTS`. Read the ENEMIES and WEAPONS shapes.
- `src/game/state.js` — `createState()`; `state.armory` starts `[structuredClone(WEAPONS.rifle)]`.
- `src/game/config.js` — the persistence pattern to copy (SCHEMA → localStorage, overrides-only, guarded `localStorage` access so node imports don't throw).
- `src/game/weaponcost.js` — cost model: `weaponCost`, `validate`, `finalizeWeapon`, `TIERS`.
- `src/editor/tools/weapon-designer.js` — the existing tool to extend; mirror its structure for the enemy tool. Signature: `createX(container, onBack) → { dispose() }`.
- `src/editor/editor.js` — Tools tab; `TOOLS` array + the `toolId === "weapon"` mount branch to copy for `"enemy"`.
- `src/mission/entities.js` — `loadMission` resolves enemies via `ENEMIES[e.type]`; exports `Enemy`, `Soldier`, `Projectile`, `stepActor`, `overlaps`, `clamp`. `Enemy` constructor reads `WEAPONS[def.weapon]`.
- `src/mission/ai.js` — exports `updateEnemy(enemy, dt, scene)`, `fire(...)`. Reuse for the enemy preview.
- `src/hub/hub.js` — deploy screen `_deployScreen()` lists `g.armory` in the weapon `<select>`; `_launch()` resolves `g.armory.find(w => w.id === wId) || WEAPONS.rifle`.

**Verify exact signatures by reading the files — do not trust this doc's memory of them.**

### The load-bearing constraint
The editor and the game are **separate pages with separate module state**. The
editor cannot push into the running game's in-memory `state`. Cross-page data
must go through **localStorage**, and the game reads it at **`createState()`**
(load time). So: after saving in the editor, you **reload the game** to see it.
Same live/load-time caveat as config. State it in any UI copy.

---

## Task A — wire the Weapon Designer output into the game

### Goal
A "Save to armory" button in the Weapon Designer so a designed weapon becomes
selectable in the deploy screen (no hand-editing `content.js`). Plus a saved-
weapons list with delete.

### Approach
Mirror the config persistence pattern. New module
`src/game/customcontent.js` (holds both custom weapons and, for Task B, custom
enemies — one concern: user-authored JSON persisted to localStorage). Guard all
`localStorage` access exactly like `config.js`.

Proposed API:
```
// weapons
listCustomWeapons(): Weapon[]
saveCustomWeapon(weapon): { ok, id }   // upsert by id; ensure unique slug id
deleteCustomWeapon(id)
customWeaponMap(): { [id]: Weapon }
// (enemies — added in Task B)
listCustomEnemies(): Enemy[]
saveCustomEnemy(enemy): { ok, id }
deleteCustomEnemy(id)
customEnemyMap(): { [id]: Enemy }
```
Storage keys: `sidescroller.weapons.v1`, `sidescroller.enemies.v1`.

### Wiring into the game
- `state.js` `createState()`: `armory: [structuredClone(WEAPONS.rifle), ...listCustomWeapons()]`.
  Custom weapons then appear in the deploy `<select>` automatically (it lists `g.armory`) and resolve in `_launch()` by id.
- Nothing else needed for weapons to be deployable end-to-end (loadMission passes the full weapon object into the squad; custom weapons need not live in the `WEAPONS` map).

### Weapon Designer UI additions (`weapon-designer.js`)
- A **Save to armory** button beside Copy JSON. On click: `saveCustomWeapon(finalizeWeapon(weapon))`, flash "Saved — reload the game to deploy it."
- Ensure a **unique id**: if the slug collides with an existing custom weapon (or a `WEAPONS` key), suffix `_2`, `_3`, … Put this in `saveCustomWeapon`.
- A small **Saved weapons** list (name + budget + delete ×). Rebuild it on save/delete.
- Allow saving regardless of budget legality (dev tool), but keep the legality verdict visible.

### Decisions (already made — don't re-litigate)
- Custom weapons go **straight into the armory** (dev shortcut), **not** through an Engineering build timer. (If you later want them gated, feed them into `BLUEPRINTS` instead — out of scope now.)
- Custom weapons do **not** need registering in the `WEAPONS` map for the player to use them; armory carries full objects.

### Done when
Design a weapon → Save → reload `index.html` → it's in the deploy weapon dropdown → deploy → it fires in a mission with its authored stats/effects.

---

## Task B — build the Enemy Designer

### Enemy schema (from `content.js` ENEMIES — confirm by reading)
```
{ id, name, color, w, h, health,
  behavior: "charger" | "shooter" | "turret",
  speed, contactDamage, detectRange,
  preferredRange,      // shooter only (holds this distance)
  weapon,              // ranged only: a key into WEAPONS (e.g. "plasma")
  windup,              // ranged only: telegraph seconds before a shot
  loot: { name, value } }
```

### Tool structure (`src/editor/tools/enemy-designer.js`)
Copy `weapon-designer.js`'s shape: `createEnemyDesigner(container, onBack) → { dispose() }`, form on the left, canvas preview + export/save on the right. Register in `editor.js`: add `{ id: "enemy", label: "Enemy Designer", desc: … }` to `TOOLS` and a `toolId === "enemy"` mount branch (mirror the weapon branch). Reuse the `.cfg-row`, `.toggle`, `.wd-*` CSS or add `.ed-*` equivalents.

Form fields: name, colour, w, h, health, behavior (select), speed, contactDamage, detectRange; show `preferredRange` + `weapon` (select over `Object.keys(WEAPONS)`) + `windup` **only when behavior is shooter/turret**; loot name + value.

### Live preview — reuse the REAL AI (high value)
Build a minimal scene and run the actual entity + AI code so the preview shows
true behavior (charger charges, shooter repositions + telegraphs + fires,
turret holds + telegraphs):
```
import { Enemy, Soldier, stepActor, overlaps } from "../../mission/entities.js";
import { updateEnemy } from "../../mission/ai.js";
// scene = { world:{gravity,width,height}, platforms:[ground slab],
//           soldiers:[dummy Soldier standing still], enemies:[new Enemy(def, x, y)],
//           projectiles:[] }
// loop: updateEnemy(e, dt, scene); stepActor(e, dt, scene.world, scene.platforms);
//       move scene.projectiles, spark + despawn on hitting the dummy (no damage);
//       respawn/reset the enemy when it walks off or reaches the dummy.
```
`new Enemy(liveDef, x, y)` works because the constructor reads `def.behavior`,
`def.speed`, `def.preferredRange`, `def.detectRange`, `def.windup`,
`def.contactDamage`, and `WEAPONS[def.weapon]`. Rebuild the Enemy when behavior/
stats change (constructor snapshots some fields). Draw compactly in the tool
(a simple sprite + telegraph is fine); reusing the mission's exact `_drawEnemy`
would require extracting it to a shared module — nice-to-have, not required.

### Save / export / wiring
- Export enemy JSON (content-shaped) + **Save to enemy pool** via `saveCustomEnemy`.
- Wire `entities.js` `loadMission` to resolve from a merged map:
  `const defs = { ...ENEMIES, ...customEnemyMap() }; new Enemy(defs[e.type], …)`.
  (Optional: also merge custom weapons into the `WEAPONS` lookup so custom enemies can carry custom weapons: `{ ...WEAPONS, ...customWeaponMap() }[def.weapon]`.)

### Known asymmetry (call it out to the user, don't try to solve it)
Custom **weapons** are immediately usable (armory → deploy). Custom **enemies**
can be authored, previewed, saved, and exported, but **placing them in a mission
needs the Level Editor** (not built) or hand-editing `LEVELS[...].enemies`. Doing
the `loadMission` merge now means placement "just works" once the Level Editor
lands. That's the right scope for this task.

### Decisions
- **No enemy budget/cost meter for v1** (the cost model is weapon-specific; a
  threat score is undefined). Skip it; note as future.
- Weapon field options = `Object.keys(WEAPONS)` for now.

### Done when
Author an enemy of each archetype, watch it behave correctly in the preview,
Save + Export valid content-shaped JSON, and confirm `loadMission` resolves a
custom enemy type (unit test it, since there's no in-game placement yet).

---

## Shared conventions

### Testing (no browser available — headless node)
There is no package.json; add a temp one to run ESM tests, then remove it:
```
printf '{ "type": "module", "private": true }' > package.json
node <test>.mjs   # import modules by absolute path; stub globals
rm -f package.json
```
Stubs used this session (see scratchpad harnesses from prior work, or rebuild):
`globalThis.window/document/requestAnimationFrame/performance/localStorage`, and
a 2D-context mock (`createLinearGradient/createRadialGradient → { addColorStop }`,
all draw methods noop) so `draw()` runs. The DOM tools each do one synchronous
`draw()` at mount, so a headless mount catches render throws.

Regression bar before committing:
- Existing gameplay logic harness (hire/economy/permadeath/win/lose + a live
  combat sim) — must stay green.
- The config + friendly-fire tests — must stay green.
- New: unit-test `customcontent.js` (save/list/delete/unique-id, guarded when
  localStorage absent), the state armory merge, and (Task B) the `loadMission`
  enemy-map merge. Boot each new tool headlessly (mount → no throw → dispose).
- Serve-check new files return 200 (`python3 -m http.server`).

### Workflow / preferences
- **Commit as you go**, one commit per task, on `main` (user works on main; no
  branch needed). End commit messages with the Co-Authored-By trailer.
- User has **not** visually verified pixel output — verify logic headlessly and
  tell them to eyeball the visuals; flag anything you couldn't see.
- Docs/tone: dense, plainly-formatted, neutral (no salesy language).
- `localStorage` is per-browser; "make it permanent" = Export JSON → paste into
  `content.js`. Custom stores are dev/browser-local, same as config.

### Gotchas
- Guard every `localStorage` access (try/catch + `typeof localStorage`) or node
  imports throw.
- Editor/game are separate pages → reload the game after editor saves.
- Tool `dispose()` must cancel its rAF loop; `editor.js` calls `disposeTool()`
  at the top of every render, so navigation already cleans up — just implement
  `dispose` correctly.
- Deploy weapon resolution falls back to rifle if a `weaponId` no longer exists
  (fine when a custom weapon is deleted).

### Suggested order
1. `customcontent.js` (weapons half) + state armory merge + tests.
2. Weapon Designer save UI + saved list. Commit Task A.
3. `customcontent.js` (enemies half) + `loadMission` merge + tests.
4. Enemy Designer tool + editor registration + preview. Commit Task B.
5. Update README (editor section) + this doc's deletion.
