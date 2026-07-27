# Sound — system design & slice plan

Status: Slice 1 built. Slices 2–4 designed, unbuilt. Build in slices; each is
independently usable and leaves the game shippable. Refine as we go.

Today the game is silent. The target is a small, data-driven audio layer that
works with made-up procedural beeps *now* and swaps in real recorded clips
*later* without any gameplay code changing — the same cache-and-commit,
always-playable discipline `ASSET-GENERATION.md` locks in for art.

## The shape of the problem

Two different things get confused when people say "sound system":

- A **clip** is a global, reusable resource. One "energy zap" serves six weapons.
- An **assignment** — which clip a rocket launcher makes when it fires — is local
  to the rocket launcher.

So the editor gets two surfaces over one data model:

- **Sound page** (a third top-level editor tab) owns the **bank**: the clip/synth
  library, auditioning, per-cue tuning, the mixer, and the global cues that
  belong to no entity (jump, land, hit, death, loot, mission win/lose, UI).
- **Weapon Designer / Enemy Designer** own **assignment**: a Sound row that picks
  from the bank with a ▶ audition, sitting next to the thing it describes.

Same split `CLAUDE.md` already draws — numbers go in the config `SCHEMA`, bespoke
processes get their own panel.

## Modules

    src/audio/
      cues.js      the closed cue vocabulary (the analogue of enemyspec/schema.js)
      synth.js     PURE procedural sample rendering: params -> Float32Array
      bank.js      cueId -> { synth?, src?, gain, pitch, cooldown, maxVoices }
      engine.js    WebAudio context, buses, voice pool, pan/falloff, unlock
      manifest.js  generated: committed clip files                    (Slice 4)

Two properties make this fit the house style.

**Synth params are data, not code.** A "beep" is a JSON object in the bank, so
the editor auto-generates controls for it and a laser pew can be dialled in
without touching a source file. That is the audio analogue of the procedural
shape that permanently backstops missing art.

**Sample rendering is a pure function.** `renderSynth(params, sampleRate)`
returns a `Float32Array` and touches no browser API, so the interesting half of
the audio system is testable headlessly under node — no WebAudio mock. The engine
only wraps that array in an `AudioBuffer`.

## Resolution is a fallback chain, never a hard binding

A cue id is dotted, and lookup walks up the dots:

    weapon.fire.pellet  ->  weapon.fire  ->  (silence)

Layered with per-entity overrides, the full chain is:

    per-entity override -> category default (weapon shape / enemy role)
                        -> generic cue -> synth -> silence

A missing clip falls back to synth; a missing synth is silent, never a crash.
Same fallback discipline as custom content and generated levels: the game must
stay playable, and audio is additive per-cue.

## Triggering — one hook on the scene

`mission/combat.js` already isolates the sim from presentation by calling back
through `ctx.spark` / `ctx.burst`. Sound follows that principle but hangs off the
**scene** instead:

```js
scene.sound(cueId, { x, y, gain, pitch })
```

Why the scene and not the ctx: `ai.js fire()` — the one place a weapon becomes
projectiles, and the single most important sound in the game — takes a `scene`
and no `ctx`. Every other sound-emitting site (`combat.js`, `enemyspec/runtime.js`)
already has the scene in hand too, so one hook covers all of them without
threading a new parameter through four call sites.

The scene *owner* installs it: `Mission.start` and the Firing Room set
`scene.sound`. Headless tests never set it, so `scene.sound && scene.sound(...)`
is silent and every existing suite passes untouched. Mission-owned events (jump,
land, reload, empty click, squad death, extraction, win/lose) call the engine
directly from `mission.js` — those are already presentation-layer there.

## Enemy sounds belong in EnemySpec

The strongest case for authoring sound inside a section rather than on the Sound
page. `enemyspec/schema.js` already has an event table —
`on: { spawn, destroy, damage, childDestroyed, signal:<name> }`. Sound is
naturally a new **action** in that same closed vocabulary:

```js
{ sound: { id: "alien.shriek", gain: 0.8, pitch: [0.9, 1.1] } }
```

Three payoffs: it is authored inline with the behaviour it accompanies; it works
anywhere in the action vocabulary (windup telegraph, phase change, part
destroyed); and because `vocabularyDoc()` is generated *from* the schema, the LLM
can assign sounds when it generates an enemy, picking from the cue catalog with
no prompt drift.

Weapons take a flat `sounds: { fire, reload, empty, impact }` on the weapon
object, defaulted from `projectile.shape` so all 24 entries in `arsenal.js` sound
reasonable before anyone hand-assigns anything.

## Three hazards worth designing around up front

**Voice spam is the real one.** The Scout SMG fires 12 rounds/s; the Combat
Shotgun throws 6 pellets per trigger pull and `combat.js` resolves a hit per
pellet. Naive wiring stacks six impact sounds on one frame and phases into mush.
Two guards, both in from day one: the **shot** cue is raised outside the pellet
loop in `fire()`, so one trigger pull is one report no matter how many pellets
leave the barrel; and every bank entry carries a `cooldown` (~30–50 ms) plus a
`maxVoices` cap, which collapses the six near-simultaneous *impacts* into one.
`config.audioMaxVoices` is the global backstop above both.

**Autoplay policy.** An `AudioContext` must be created or resumed inside a user
gesture, so `armUnlock()` (called from `main.js` and `editor.js`) brings it up on
the first click/keydown. That is an *optimisation*, not the guarantee: `play()`
also calls `unlock()` itself every time. Relying on the armed listener alone was
a real bug — the editor's `audition()` always unlocked directly, so the Sound tab
worked while the whole game stayed silent, and nothing ever asked Chrome to
resume the context it auto-suspends when a tab is backgrounded. Any entry point
that can make noise must be able to stand the context up on its own.

Related: the engine looks the `AudioContext` constructor up **lazily** rather
than capturing it at module load. That removes an import-order dependency and is
what lets the test suite install a mock context and exercise the real playback
path headlessly — cooldowns, falloff, and voice caps included.

**Storage.** Audio bytes blow the ~5 MB localStorage cap the same way PNGs do.
localStorage holds only synth params and cue mappings (small JSON); real clips
become committed files plus a generated manifest module, with IndexedDB for
in-editor candidates. Note that Player2 offers `/music/generate_job` for music but
**no sound-effect endpoint** — procedural synth is not a placeholder for SFX, it
is the plan until clips are sourced by hand.

## Slices

**Slice 1 — engine, bank, and the core cues.** *(built)*
`cues.js` / `synth.js` / `bank.js` / `engine.js`; a Sound group in the config
`SCHEMA` (master/sfx/music/ui volume, mute-on-blur, pan, falloff, voice cap); the
`scene.sound` hook wired through `combat.js`, `ai.js`, `enemyspec/runtime.js`,
`mission.js`, and the Firing Room; ~20 cues with hand-tuned synth defaults; the
editor's Sound tab = mixer + cue table + audition + per-cue synth controls +
export/import.

**Slice 2 — weapons.** `weapon.sounds` on the weapon object, shape-derived
defaults for the arsenal, a Sound row in the Weapon Designer, per-shape impact
cues.

**Slice 3 — enemies.** A `sound` action in the EnemySpec `ACTIONS` table plus
`emitters[].sound`; validator and normalizer support; a picker in the Enemy
Designer; the cue catalog exposed through `vocabularyDoc()` for the LLM.

**Slice 4 — real clips.** `manifest.js` + a loader that prefers `src` over
`synth`; an in-editor drop zone with IndexedDB candidates and an audition-in-
context review; a commit flow writing files to `assets/audio/`. Music and
ambience buses; hub loops; Player2 `/music/generate_job` for background tracks.

## The editor principle (every slice)

Everything authored as data and tweakable in the editor: **volumes and the voice
cap** in the config schema; **synth parameters** per cue on the Sound page;
**assignments** in the tool that owns the entity; the **bank** exportable as JSON
to paste into `bank.js` defaults, exactly like `config.js` and custom content.
