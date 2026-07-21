# Level Generation — system design & slice plan

Status: design agreed, unbuilt. This doc is the target system and the incremental
path to it. Build in slices; each slice is independently playable. Refine as we go.

Today the game plays a fixed list of 3 hand-authored `LEVELS`/`MISSIONS`
(`src/game/content.js`) selected from a linearly-gated Operations list. The target
replaces the *source* of that content with a generation pipeline fronted by an Ops
officer, while leaving `loadMission`, the deploy screen, and results untouched.

## The target system

An **Ops officer** (Lt. Sable, callsign "Watchtower") surfaces **leads** — cheap
stubs describing a possible mission. You choose one; only then is the full level
generated. What he can find, and how much of a lead you see before committing, is
what you invest in.

Generation is **two tiers**:

- **Tier A — Campaign Director** (campaign-level, occasional, cheap). Owns story
  continuity. Given campaign state + last result, advances the arc and emits N lead
  stubs. This is what Watchtower shows you.
- **Tier B — Level Generator** (per-mission, on commit). Takes one chosen lead +
  hard engine constraints and emits full `LEVEL` + `MISSION` JSON. Heavily
  validated, then cached to disk (generation-time caching, per locked decisions).

Geometry is a **hybrid**: the engine generates a guaranteed-traversable platform
skeleton from a reachability envelope; the LLM only *themes* (names the site, writes
the brief, sets biome, picks enemy composition intent) and places enemies onto
engine-provided **anchors** — it never emits raw coordinates. This keeps "no safety
nets" where it belongs (combat/permadeath) without shipping unplayable geometry.

A **story Director state** persists in game state and makes levels a campaign
instead of a shuffle: act/beat, sector map, enemy agenda, named cast, player lore
(casualties, famous soldiers, tech built), open threads. Each mission result folds a
`storyDelta` back in; the next batch of leads reflects it.

### Locked decisions
- **Leads can lie.** Advertised threat may diverge from reality (ambushes); a
  telegraphed **intel accuracy** stat bounds the lie so it reads as drama, not
  unfairness. Investment shrinks the gap.
- **Hybrid geometry** (engine owns traversability; LLM owns expression).
- **Two-tier generation** (Director + Level Generator).
- **Ops investment is the endgame.** The Ops upgrade track is how the finale lead
  gets found; under-invest and doom runs you out first.
- **Everything is editor-tweakable** (see below).

### Key data shapes (condensed)

Lead stub (Tier A output; fields render `unknown` under fog):
```json
{ "id": "lead_0142", "codename": "Broken Antenna",
  "location": { "site": "comms_array", "region": "eastern_ridge" },
  "beat": "escalation", "hook": "A defector is transmitting before they silence her.",
  "targetTier": 2, "advertisedThreat": "moderate", "trueThreatHidden": true,
  "rewardHint": "intel_cache", "special": [{ "role": "rescue", "name": "Dr. Aya Ferro" }],
  "expiresInDays": 4, "seed": 84213 }
```

Tier B response (engine JSON + a story delta the Director absorbs):
```json
{ "level": { "...": "LEVELS-shaped" },
  "mission": { "...": "MISSIONS-shaped, brief in Voss's voice" },
  "storyDelta": { "introduced": [{ "name": "Dr. Aya Ferro", "status": "rescued_if_survived" }],
                  "worldChanges": ["eastern_relay_destroyed"],
                  "threadsOpened": ["ferro_knows_hive_location"] } }
```

Director state (persists in game state):
```json
{ "act": "escalation", "doomPressure": 0.55,
  "sectorMap": { "eastern_ridge": { "status": "contested", "visited": true } },
  "enemyState": { "unlocked": ["drone","sentinel","turret"], "agenda": "fortifying_the_hive",
                  "namedThreats": [{ "name": "The Warden", "alive": true }] },
  "cast": [{ "name": "Dr. Aya Ferro", "role": "defector", "status": "at_large" }],
  "playerLore": { "famousSoldiers": ["Vex — 14 kills"], "traumas": ["Bishop KIA at the depot"] },
  "openThreads": ["ferro_knows_hive_location"] }
```

## Principles that make the slicing safe

- **Fake the generator first.** Build the whole selection→generate→validate→play→
  result loop with a *deterministic procedural generator* and no LLM. The loop is
  playable and testable immediately; the LLM is a later swap-in, not a foundation.
- **Always keep a fallback.** Once the LLM is involved, a failed or invalid response
  silently falls back to the procedural generator. That keeps every LLM-era slice
  playable despite model flakiness. The procedural generator is never discarded — it
  becomes the fallback *and* the permanent reachability/validation baseline.
- **Introduce the room early, deepen it later.** Watchtower's board exists from
  Slice 1 as thin flavor, so no slice feels like scaffolding.

## The editor principle (applies to every slice)

Every system we add is authored as **data**, not baked into code, and is
**tweakable in the editor** — same pattern already in the codebase:

- **Constants/curves → the config SCHEMA** (`src/game/config.js`), so the Settings
  tab auto-generates controls (one schema entry per knob, no UI wiring). Threat-cost
  constants, generation ranges, LLM params, fog/lie/intel curves, Ops costs all land
  here or in a parallel schema-driven module.
- **Bespoke systems → a Tools-tab panel** (`src/editor/tools/*`, `createX(container,
  onBack) → { dispose() }`), like the Weapon/Enemy Designers. The big one is a
  **Level Generator playground**: set a seed + params, generate, preview the level on
  a canvas, regenerate, inspect the validation report. This is the primary tuning
  surface for the whole feature.
- **Tables/rosters → JSON modules** (like `WEAPONS`/`ENEMIES`/`BLUEPRINTS`), editable
  by hand or by a tool: biome tables, Ops upgrades, arc/beat definitions.

Rule of thumb for each slice: if it introduces a number, it goes in a schema; if it
introduces a process, it gets a preview/inspect surface in Tools.

## The slices

Each: **Build / Playable / De-risks / Editor / Done when.**

### Slice 1 — Procedural missions + a leads board (no LLM)
- **Build:** reachability-envelope math (max jump height/reach from jump/gravity/run)
  → a procedural platform-skeleton generator that's guaranteed traversable. An enemy
  threat-cost model (modeled on `weaponcost.js`). `generateLevel(seed, params)`: lay
  the skeleton, place enemies from the legal roster onto ground anchors within a
  threat budget, add exit + artifact. Replace the fixed mission list: the Ops room
  shows N procedurally-generated lead stubs; pick one → generate the full LEVEL →
  deploy. Deterministic from `seed`; validate + cache.
- **Playable:** infinite, replayable missions with a difficulty dial and real
  geometric variety, chosen from a board.
- **De-risks:** the hardest engine problems (traversable geometry, threat budget) and
  the entire generate→validate→cache→play→result loop — with zero LLM dependency.
- **Editor:** threat-cost constants + generation ranges (platform count, budget
  scaling, biome) into the config schema; a **Level Generator playground** tool
  (seed + params → canvas preview + validation report + regenerate).
- **Done when:** you pick a lead, play a never-seen but always-completable level, and
  get a result that feeds the economy — and can tune difficulty/geometry live in the
  editor.
- **Note:** biggest slice; the threat-cost model and geometry generator are each a
  clean, separately-testable sub-step.

### Slice 2 — LLM authors the flavor (first Player2 wiring)
- **Build:** wire Player2. Keep engine-owned geometry; the LLM themes only — names
  the site, writes the brief in Voss's voice, sets biome, chooses enemy composition
  intent within budget by picking from the engine's anchor list (never raw
  coordinates). Schema-validate → repair/re-prompt on violations → cache. On failure
  or invalid output, fall back to Slice 1's generator.
- **Playable:** same loop, now with authored places/briefs and smarter composition —
  and it never breaks, because the procedural path is the net.
- **De-risks:** Player2 integration, prompt→JSON→validate→repair, the anchor-placement
  contract, caching keyed by seed.
- **Editor:** prompt templates stored as editable data; LLM params (model,
  temperature) + an **LLM on/off** toggle in the config schema; the Level Generator
  playground gains a "use LLM" switch and shows the raw prompt/response.

### Slice 3 — Story Director + continuity
- **Build:** Director state in game state. Between missions it advances the arc and
  emits lead stubs; briefs reference prior events (who died, sites hit, tech built).
  Mission result folds a `storyDelta` back into the Director.
- **Playable:** the infinite loop gains a spine — a campaign that remembers your run
  and escalates.
- **De-risks:** the two-tier prompt separation and the storyDelta feedback loop.
- **Editor:** a **Director inspector** tool (view/hand-edit story state, force a
  beat, replay the advance); arc/beat definitions as a JSON table.

### Slice 4 — Watchtower + intel fog
- **Build:** Lt. Sable as a real character/room. Leads carry hidden fields; at a
  fixed intel depth some render `unknown`. Leads expire (window tied to the doom
  clock). Selection becomes a decision under uncertainty.
- **Playable:** mission choice becomes a genuine strategic call, not a menu.
- **De-risks:** the reveal/fog machinery everything after depends on.
- **Editor:** intel-depth default, which fields are foggable, and lead-expiry curve
  in the config schema; the leads board is inspectable in Tools (hidden vs revealed).

### Slice 5 — Leads that lie
- **Build:** `advertisedThreat` vs `trueThreat` divergence; ambush composition that
  materializes on deploy. A telegraphed **intel accuracy** stat bounding the lie.
- **Playable:** high-stakes gambling on intel — betrayals made fair by a visible
  accuracy stat, not pure randomness.
- **De-risks:** tuning the lie so it reads as drama, not unfairness.
- **Editor:** lie-magnitude and accuracy curves in the config schema; the leads-board
  inspector shows advertised vs true side by side for tuning.
- **Note:** can merge with Slice 4 to feel the lies sooner; kept separate only because
  fog must exist before it can deceive.

### Slice 6 — Ops Center economy + endgame
- **Build:** the Ops Center upgrade tree (Network → lead count, Signal Analysis →
  depth/accuracy, Recon Range → target tier, Fast-Track → fewer days), mirroring
  Engineering's build queue. Intel as a recovered resource spent to develop or reroll
  leads. Gate the finale lead behind Ops investment.
- **Playable:** the full strategic economy — information vs time vs doom, with the win
  condition on the far end of your investment.
- **De-risks:** nothing new technically; balance and economy tuning on finished
  machinery.
- **Editor:** Ops upgrades as a JSON table (cost/days/effect, like `BLUEPRINTS`);
  Intel-economy constants in the config schema.

## Notes
- The existing vertical slice keeps working throughout. Slice 1 swaps the *source* of
  `LEVELS`/`MISSIONS` from hand-authored to generated; `loadMission`, deploy, and
  results are untouched.
- **Reuse:** the generator's enemy roster can include the Enemy Designer's
  `customEnemyMap()`; the threat-cost model is the enemy-side twin of `weaponcost.js`.
- Slices 4–5 may merge; Slice 1 may split into its two sub-steps.
