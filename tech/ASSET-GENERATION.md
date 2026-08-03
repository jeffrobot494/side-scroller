---
type: tech
category: content-generation
status: designed
resolution: vague
tags: [assets, player2, art]
---

# Asset generation

Status: design agreed, unbuilt. Target system + incremental path. Build in slices;
each is independently usable and leaves the game shippable. Refine as we go.

Today the whole game is procedural vector (rounded rects, gradients, sparks); boxes
and colored shapes stand in for art. The target adds a **build-time Asset Studio**
that uses the Player2 image API to produce good-looking, committed assets, with the
procedural shapes as a permanent fallback so nothing ever breaks for lack of art.

## The target system

A **dev tool** (in the editor, like the Weapon/Enemy/Level tools) that generates
asset candidates, lets you curate one, and **freezes the approved bytes into the
repo**. It is never called at runtime — latency, credits, the NSFW filter, and
non-determinism all forbid generating during play. Same philosophy already locked
for content: *generate at authoring time → cache the artifact → ship the cache.*
Non-determinism stops mattering the moment a human approves and commits.

**Player2 surface** (from `player2-api.yaml`): `/image/generate` (text→PNG, 128–1024,
sync), `/image/edit` (image(s)+prompt→PNG; multi-image models — Nano Banana,
Seedream V4, Flux Kontext — hold a consistent look), `_job` async variants for
batches, `/assets` server store (categories `img/sprite/map/npc/…`). Hard
constraints: raster PNG with **no guaranteed transparency**, and **no seed** (an
asset can't be regenerated identically). Errors to handle: 402 (credits), 403
(NSFW), 500.

**Hybrid art direction.** Raster where it's static and atmospheric (backgrounds,
scenery, portraits, icons, title art) — where AI shines and cutouts/tiling matter
least. Procedural/sprite where it's dynamic and gameplay-critical (enemies,
soldiers, projectiles) — things that flip, tint, hit-flash, and animate stay crisp
and controllable.

**The pipeline (5 stages; the middle three carry the value):**
1. **Prompt** — subject + a *style bible* fragment + a *type preset* injecting
   framing rules (sprite preset: "full-body, centered, side view, flat #ff00ff
   background, no shadow").
2. **Generate** — `/image/generate` (sync) or `_job` (batch), oversized for headroom.
3. **Process** (deterministic, client-side canvas): flat-color **key-out** from the
   corners with a tolerance (you asked for magenta, so keying is reliable) → **trim**
   to alpha bounds → **normalize** to the target `w/h` + anchor → optional
   **palette-fit + outline** so raster unifies with the vector UI.
4. **Review** — raw vs processed, dropped into a **mock game context** (a mini
   mission scene / a hub card), judged in situ.
5. **Commit** — write the processed PNG to the repo + register it in the manifest.

**Consistency across a set:** a **style bible** (one canonical style-prompt fragment
+ reference thumbnails) fed through `/image/edit` on multi-image models so every
asset inherits one look; batch a "turnaround" or tile-sheet in one call and slice
it; a **palette lock** forcing raster and vector to share exact colors.

**Binding (always-playable):** an **asset registry** (`key → { src, nativeW/H,
anchor }`). Renderers check it — *if art exists for key X, draw the sprite; else
draw the current procedural shape.* Art lands incrementally per-asset; a missing one
is never a broken build. Sprites reuse the existing transform/flip; hit-flash tints
via an offscreen canvas.

**Storage:** PNGs exceed the ~5MB localStorage cap. Approved assets are **committed
files + a generated manifest module**; an in-editor **IndexedDB** working set holds
candidates, and the tool **exports** approved ones to the repo.

## Working decisions (recommended; refine before/inside each slice)

- **Build-time only, cache-and-commit** — locked.
- **Hybrid art direction** — locked.
- **Registry + per-asset procedural fallback** — locked.
- **Flat-color key-out on canvas** (deterministic) over relying on `/image/edit`
  "remove background".
- **Commit files + manifest** for shipping; IndexedDB only for the working set.
- **Open:** first target = backgrounds (rec, lowest risk); how far to unify AI
  output to the vector look (posterize/outline vs. deliberate painterly contrast);
  whether to use the Player2 `/assets` store for dev cataloguing or stay local-only.

## Principles that make the slicing safe

- **Cache-and-commit.** Generate at authoring time; freeze the approved bytes. No
  runtime generation, ever.
- **Always-playable fallback.** A missing asset falls back to today's procedural
  shape. Art is additive, per-asset — same discipline as the level-gen slices.
- **Easiest asset first.** De-risk transparency and gameplay-binding last; start
  where opaque, static images already look right.
- **Consistency by construction.** Style bible + references, not per-asset luck.

## The editor principle (every slice)

Everything authored as data and tweakable in the editor: the **style bible** +
**type presets** as editable data; **processing controls** (key color, tolerance,
trim, target size, palette-fit, outline) in the Studio; **image size/model** in the
config schema; the **asset manifest** as a JSON module; and **"Generate art" hooks**
in the Enemy/Weapon/Level tools that pre-fill prompts from entity data.

## Shared dependency

The **Player2 client wiring** — auth, error handling (402/403/500), and the
sync-queue vs async-jobs concurrency model — is shared with **level-gen Slice 2**
(also "first Player2 wiring"). Build it once; whichever slice lands first owns it.
The client already exists (`src/player2/client.js`, `queue.js`) but is unwired.

## The slices

Each: **Build / Usable / De-risks / Editor / Done when.**

### Slice 1 — Backgrounds end-to-end (no cutout)
- **Build:** wire the Player2 image client (first image call + auth + 402/403/500
  handling). Asset Studio tool skeleton + the style-bible. Generate a biome parallax
  background (opaque — **no transparency needed**), review it in a mock mission
  scene, commit to the repo + manifest, and have the mission renderer draw it behind
  the action. Fallback: today's flat/gradient background.
- **Usable:** generated scenery renders behind real missions; missing → old
  background. The single biggest "it looks like a game now" jump.
- **De-risks:** Player2 image integration, the manifest/registry + fallback, the
  commit/export flow, in-situ review — all on the asset type with **zero** cutout
  problem.
- **Editor:** Asset Studio panel + style-bible editor; image size/model in config.
- **Done when:** a generated background ships behind a mission and the game still
  runs with none.

### Slice 2 — The processing pipeline (cutout, on icons)
- **Build:** the deterministic canvas process stage — flat-color key-out with
  tolerance, auto-trim to alpha bounds, normalize/scale, optional palette-fit +
  outline. Apply it to the **easiest cutout asset: loot / artifact / weapon icons**
  (small, iconic, forgiving). Raw-vs-processed review.
- **Usable:** generated icons show in the UI (Stores/Armory); missing → current
  text/shape.
- **De-risks:** transparency — the load-bearing technical problem — isolated on a
  low-stakes asset before any sprite.
- **Editor:** processing controls in the Studio (key color, tolerance, trim, target
  size, palette toggle, outline).
- **Done when:** an icon generates clean, transparent, trimmed, palette-fit and
  appears in the UI.

### Slice 3 — Portraits + hub art (consistency across a set)
- **Build:** a portrait preset; generate soldier/staff portraits and bind them into
  hub cards (replacing the initials/hsl avatars). Consistency via the style bible +
  reference images through `/image/edit`; batch via `_job` + `queue.js`.
- **Usable:** hub soldier cards show generated portraits; missing → current avatar.
- **De-risks:** cross-asset consistency and batch generation — a whole SET sharing
  one look, not one-offs.
- **Editor:** batch-queue UI; reference-image management in the style bible.
- **Done when:** a roster of portraits reads as one art set in the hub, generated as
  a batch.

### Slice 4 — Enemy / actor sprites in gameplay (the hard one)
- **Build:** a sprite preset; generate an enemy sprite through the full process
  stage; bind it to an enemy id via a **"Generate art" button in the Enemy
  Designer**; render it in a mission with tint/hit-flash/flip via an offscreen
  canvas; animate **procedurally** (bob/squash/telegraph) rather than multi-frame.
  Per-entity fallback to the procedural box.
- **Usable:** an enemy with generated art fights in a mission and looks good;
  enemies without art still box. Art rolls out enemy-by-enemy.
- **De-risks:** sprite-in-gameplay (tint, flip, hit-flash), procedural animation of a
  static sprite, and incremental per-entity coverage — with every prior piece already
  proven.
- **Editor:** the Enemy Designer hook + a sprite preview in a mock mission scene.
- **Done when:** a generated enemy sprite fights, tints on hit, flips with facing,
  and animates, with boxes still filling in for the rest.

### Beyond
Remaining asset types — projectile/muzzle sprites, title/menu art, more biome
backgrounds, robotics/companion art — **reuse this exact pipeline**. They're coverage
and polish, not new machinery.

## Notes
- The game stays shippable at every slice; art is additive per-asset.
- Reuse: the Enemy/Weapon/Level tools gain "Generate art" hooks; `queue.js` drives
  batches; the config-schema + `createX(container,onBack)` tool patterns carry over.
- Cross-refs: [[LEVEL-GENERATION]] (shares the Player2 wiring), the editor/config
  system, the Player2 client.
