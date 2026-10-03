# Graphics Tester

A browser viewer for the mission's 3D models, where Bo and an agent iterate on
how the game looks. Bo asks for a change in the terminal ("add fog", "give him a
laser sight"); the agent edits files here or in `src/mission/view3d/`; Bo reloads
and judges. There is no chat in the app.

## Run it

| Step | Command / URL |
|---|---|
| Serve | `npm start` from the repo root (or `python3 -m http.server 8000`) |
| Open | `http://localhost:8000/graphics-tester/` |

`index.html` redirects `/graphics-tester` → `/graphics-tester/`: `server.mjs`
serves a folder's `index.html` without the slash, and `./app.js` would then
resolve to `/app.js` (404).

## Files

| File | What it is |
|---|---|
| `models/` | Blender sources: `kit.py` (shared helpers; exports the game's `.glb` files into `src/mission/view3d/models/`, tester-only ones here), `helmet.py`, `chest.py`, `worm.py`, `trooper.py`, and their `.blend` files |
| `worm.js` | The sand worm subject: a tester-only look, not a game enemy. Follow-the-leader body on `models/worm.glb`, clipped at the ground, with its own animations (attack cycle, swim, burrow, maw open) and effects; it throws the fake soldier |
| `trooper.js` | The XCOM trooper subject: a tester-only look, not the game's soldier. An adult, realistically proportioned soldier on `models/trooper.glb` (built by `models/trooper.py`: one skinned mesh, 30-bone rig, IK baked into three clips — Idle, Run, Shoot; the face is one sculpted surface — a dense head mesh pushed by named bumps and dents in `FEATURES`/`NOSE`/`LIPS` — with lips, brows, nostrils, lash line and beard shadow painted as vertex colour by `paint()`; the earlier primitive-built face is kept in `models/trooper-shapes-face/`), played by an `AnimationMixer`; muzzle flash on the Shoot clip's shot frames |
| `index.html` | Layout: sidebar (left) + viewport. Import map for `three` (same CDN + version as the game's `index.html`). |
| `app.js` | Renderer, lights, bloom, camera, the fake mission, the sidebar menus, the frame loop. |
| `experiments.js` | `EXPERIMENTS` — the toggleable layers. Where most requested changes go first. |
| `README.md` | This file. |

## The one rule: it renders the game's own code

`app.js` imports the real model builders from `src/mission/view3d/`
(`createSoldiers`, `buildTerrain`, `buildBackground`, `buildMist`,
`createLasers`, `haloPool`) and feeds them a **fake mission** —
`{ time, scene: { soldiers: [soldier], world, platforms, specRoots }, _gunTip }`
with one soldier entity on a treadmill. The treadmill is why `createSoldiers`
gets a `wind` (the cape needs the air the body is not really running through),
and crouching switches the box to the game's 22px, as `entities.js` does. Lights and bloom are copied from
`createView3D` (`src/mission/view3d/index.js`).

- Never fork a model into this folder. A change to `src/mission/view3d/*` is a
  change to the game, and that is the point.
- If the game's lights/bloom/fog change in `index.js`, mirror it in `app.js`.
- The fake soldier carries only the fields `soldier.js`'s `pose()` reads
  (`x y w h color facing vx onGround crouched aimVec hitFlash muzzleFlash burn`).
  A new model field read by the game must be added to the fake entity too.

## Making a change

| Request is… | Where it goes |
|---|---|
| A new look to try (laser sight, cape, fog colour) | An entry in `experiments.js`, toggled from the sidebar |
| A fix to an existing model (z-fighting, proportions) | Directly in `src/mission/view3d/` — then `node test/run.mjs` |
| A new animation / scene / camera / slider | The tables in `app.js` (`ANIMS`, `SCENES`, `CAMS`) or a control in `index.html` |
| A new subject (enemy) | `SUBJECTS` in `app.js` — the game's enemies are listed as `later` and not wired; wiring one means building a fake `scene.specRoots` for `createEnemies` (`src/mission/view3d/enemy.js`). A look the game has no enemy for (the sand worm) is its own module here with its own animation table; `animsOf` in `app.js` picks the list per subject |

**Experiments explore looks, not ports.** Build the best version of the idea;
don't limit it by whether or how the game could ship it. Reusing game code is
fine. Porting is a separate problem, taken up only when Bo asks to promote it.

**Experiment contract** (`experiments.js`):

```js
{ id, label, attach(ctx) → { update(ctx), dispose() } }
// ctx = { THREE, scene, soldier, time, camera }
```

`attach` runs when the box is ticked, `update` every frame, `dispose` on untick
(remove what you added, dispose geometry/materials).

**Promotion:** when Bo approves an experiment, move it into
`src/mission/view3d/` so the game ships it, run the test suite, and delete it
from `experiments.js`. The tester holds trials; the game holds results.

## Verifying (no GPU here — screenshot headlessly)

Playwright's headless Chromium is installed but lacks `libnspr4.so`; Firefox's
copy satisfies it. Screenshot after every change instead of asking Bo to look:

```bash
PORT=8767 timeout 40 node server.mjs >/dev/null 2>&1 &
sleep 3
C=$(ls ~/.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell | tail -1)
LD_LIBRARY_PATH=$HOME/.cache/ms-playwright/firefox-1488/firefox \
  timeout 30 $C --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1280,720 --virtual-time-budget=8000 \
  --screenshot=<scratchpad>/gt.png http://localhost:8767/graphics-tester/
```

Then read the PNG. It shows one still frame of the default state (Soldier, Run,
Mission backdrop, Free orbit) — or pick one with `?subject=trooper&anim=shoot&cam=side`; motion and feel are Bo's to judge. Runtime errors
appear in the viewport's top-left in red; a failed module load (404, bad
import) only reaches the browser console, so a blank viewport means ask Bo for
the console.

## Scope

A viewer, not a product. Resist growing it (asset pipelines, saved presets, an
in-app chat) unless Bo asks — see `WORKING-NOTES.md` on tooling.
