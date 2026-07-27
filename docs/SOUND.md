---
status: built
tags: [audio]
---

# Sound — system design & slice plan

Status: Slices 1–3 built. Slice 4 designed, unbuilt. Build in slices; each is
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

**`filterHz` is the pitch control for noise.** A `wave: "noise"` cue has no tone
term at all, so its `freq`/`freqEnd` are inert and only the lowpass shapes it.
The filter is a **two-pole cascade (12 dB/oct)**: a single pole rolls off at
6 dB/oct, which is far too gentle to darken white noise — an "800 Hz" cutoff
still measured ~3.6 kHz of brightness, so every noise cue read as hiss no matter
what its cutoff claimed. The Sound page greys out Pitch/Sweep on noise cues for
the same reason: live sliders that silently do nothing waste a tuning session.
Note that a steeper filter also removes level, so changing a cutoff on a noise
cue usually means revisiting its `gain`.

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

Weapons take a flat `sounds: { fire, impact, reload, empty }` on the weapon
object, defaulted from `projectile.shape` so all 24 entries in `arsenal.js` sound
reasonable before anyone hand-assigns anything. `weaponSound()` in `cues.js` is
the single place that decides (with `weaponCue()` a thin wrapper for callers that
only want the id), so the game, the designer and the tests cannot drift:

    explicit weapon.sounds[kind]  ->  weapon.fire.<shape>  ->  weapon.fire

Each slot is **either** a bare cue id or `{ cue?, gain? }`:

```js
sounds: {
  fire:   "weapon.fire.bolt",                    // that cue, at its own level
  impact: { cue: "impact.hit.pellet", gain: 1.1 },
  reload: { gain: 0.6 },                         // cue STILL derives from shape
}
```

The gain-only form is the one that earns the object shape: it turns a weapon
down without giving up its shape-derived timbre, so two weapons sharing a cue can
sit at different levels. Gain is a multiplier the engine folds into the cue's own
level (`entry.gain * opts.gain` in `play()`), clamped 0–2 to match the bank's own
trim — a slot adjusts a cue, it does not get its own scale. The string form stays
valid and is what the Designer writes whenever the gain is 1, so an untouched
weapon still exports no `sounds` block and a cue-only choice stays a plain string.

Only `fire` and `impact` take the shape suffix — shape is meaningless for a
reload or a dry click. Enemy fire branches to `weapon.fire.enemy.<shape>`, which
falls back through `weapon.fire.enemy` to the generic report.

The impact cue **and its gain** are stamped onto each `Projectile` at fire time
(`p.sound` / `p.soundGain`) rather than looked up on hit: a shot outlives its
shooter, so by the time it lands there may be no weapon left to ask.

Reload is the one slot that voices two cues — the mag drop and the mag seat. Both
take the `reload` slot's gain, so a weapon turned down is quiet for the whole
reload rather than half of it.

**Where you author a level.** The Weapon Designer's Sound rows, each with a `×`
slider beside the cue picker. Note the Designer can only author *new* weapons —
it cannot load one of the 24 built-ins, so rebalancing the existing arsenal means
**Copy JSON** and pasting the `sounds` block into `arsenal.js` (the repo's usual
"make it permanent" path). A *Load from arsenal* dropdown would close that gap and
is the obvious follow-up. To judge a level, save the weapon and open the **Firing
Room** — it lists custom weapons and runs the real `fire()`, so you hear the
weapon at its true cadence, which a single ▶ audition cannot tell you.

**Where the shape heuristic fails.** It reads how a projectile *looks*, which is
not always how the weapon *fires*. Two arsenal entries needed an explicit
override: the Concussion Gun (shaped `wave` for the visual, but a 380-knockback
slug should thump, not hiss) and the Hornet SMG (shaped `missile` because it
homes, but at 9 rounds/s the 0.36s launcher whoosh overlaps itself into mush).
That pair is the argument for keeping per-weapon assignment at all — a purely
derived system gets both wrong and gives you no way to say so.

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

## Gotchas found the hard way

Each of these cost a debugging session. They are not obvious from the code.

- **A `wave: "noise"` cue ignores `freq`/`freqEnd`.** `filterHz` is its only
  pitch control (see above). The Sound page greys the dead sliders out.
- **`play()` must stand the context up itself.** Relying on `armUnlock`'s
  listener was a real bug: the editor's `audition()` always called `unlock()`
  directly, so the Sound tab worked while the whole game stayed silent. Any new
  entry point that makes noise needs the same self-unlock.
- **Changing a cue's `filterHz` changes its level too.** A steeper filter removes
  energy; revisit `gain` after any cutoff move on a noise cue.
- **EnemySpec `on.spawn` handlers have no host.** `instantiate()` fires them
  before a scene exists, so `sound` (and `fire`, and `spawn`) are skipped there.
  This is an OPEN limitation, not a fix — see "Known issues" below.
- **Event handlers read the host cached on the root**, refreshed by `cacheHost()`
  in `updateSpecEnemy`/`applyDamage`/`killEntity`. Before Slice 3 only `execStep`
  cached it, so `on: { damage: [...] }` silently no-opped on any enemy whose
  brain had not yet run a step — a motion-only enemy never fired one at all.

## Known issues (open)

- **`on.spawn` cannot run scene-touching actions.** `instantiate(nspec, x, y)`
  takes no scene, so `fire`/`spawn`/`sound` in an `on.spawn` handler are skipped.
  Before Slice 3 they *crashed* (`Cannot read properties of undefined (reading
  'soldiers')`); they now fail safe. An LLM-generated enemy could plausibly emit
  one. The real fix is to defer the spawn event to the first `updateSpecEnemy`,
  which has a host — deliberately not done yet because it shifts when `on.spawn`
  side effects land, which could change existing enemy behaviour.

## Testing audio headlessly

`renderSynth` is pure, so waveform/envelope/filter behaviour is tested directly.
For the engine, `test/audio.test.mjs` installs a **mock `AudioContext`** on
`window` and drives the real playback path — self-unlock, suspended-context
resume, cue cooldowns, distance falloff, voice caps. That works only because
`engine.js` looks the constructor up **lazily** instead of capturing it at module
load; keep it that way. The mock block runs last in the suite because the context
it installs stays live for the rest of the run.

To check what the game actually emits, drive the real `Mission`/spec runtime with
a `scene.sound` spy that records `[cue, opts]` — that is how both Slice 3 runtime
bugs were caught, and it is far more reliable than reasoning about call sites.

## Adding a new cue

1. Add it to `CUES` in `src/audio/cues.js` (id, label, bus, help).
2. Add a matching entry to `DEFAULT_BANK` in `bank.js` — the test suite asserts
   both directions, so a catalogued cue with no entry (or vice versa) fails.
3. Trigger it via `scene.sound(id, { x, y, gain })`, guarded with
   `scene.sound && …` so headless callers stay silent.
4. Dotted ids resolve upward, so `foo.bar.baz` needs no entry of its own if
   `foo.bar` exists — that is how per-shape and per-team variants attach.

## Slices

**Slice 1 — engine, bank, and the core cues.** *(built)*
`cues.js` / `synth.js` / `bank.js` / `engine.js`; a Sound group in the config
`SCHEMA` (master/sfx/music/ui volume, mute-on-blur, pan, falloff, voice cap); the
`scene.sound` hook wired through `combat.js`, `ai.js`, `enemyspec/runtime.js`,
`mission.js`, and the Firing Room; ~20 cues with hand-tuned synth defaults; the
editor's Sound tab = mixer + cue table + audition + per-cue synth controls +
export/import.

**Slice 2 — weapons.** *(built)*
`weaponCue()` + `weapon.sounds`; six per-shape fire timbres and three per-shape
impacts in the bank; the impact cue stamped onto each projectile at fire time; a
**Sound** section in the Weapon Designer built on `editor/sound-picker.js` (a
grouped cue `<select>` + ▶ audition, with the resolved cue shown when the row is
left on Auto). The picker is deliberately its own module because Slice 3 needs
the identical control and the identical vocabulary. Assignments are stored
sparsely — an untouched weapon exports no `sounds` block at all — and cost no
budget, like `magazine` and `shape`.

**Slice 3 — enemies.** *(built)*
Top-level `sounds: { fire, hurt, death, part }` on an EnemySpec (same slot shape
as a weapon, resolved by `specSound()`), per-emitter `sound` overriding the spec's
`fire` slot (`emitterSound()`), and a `sound` action in `ACTIONS` for moments the
slots do not cover. The validator checks every cue id against the catalog — an
invented id resolves to silence, the one failure an author or the LLM would never
notice. `vocabularyDoc()` now lists the closed cue set and the action, so a
generated enemy can assign sounds without inventing names. The Enemy Designer
gets the same picker + `×` level rows as the Weapon Designer, and its live
preview installs `scene.sound`, so an enemy can be auditioned in motion. Four of
the six built-in specs carry gain-only overrides so a wisp does not land as hard
as an elite duelist.

**Slice 4 — real clips.** `manifest.js` + a loader that prefers `src` over
`synth`; an in-editor drop zone with IndexedDB candidates and an audition-in-
context review; a commit flow writing files to `assets/audio/`. Music and
ambience buses; hub loops; Player2 `/music/generate_job` for background tracks.

## The editor principle (every slice)

Everything authored as data and tweakable in the editor: **volumes and the voice
cap** in the config schema; **synth parameters** per cue on the Sound page;
**assignments** in the tool that owns the entity; the **bank** exportable as JSON
to paste into `bank.js` defaults, exactly like `config.js` and custom content.
