// AUDIO — the parts that can be verified without a browser: synth rendering is
// a pure function, the bank is plain data with a dotted fallback walk, and the
// engine must degrade to silent no-ops under node (no AudioContext) so importing
// it from game code never breaks a headless run.

import { renderSynth, normalizeSynth, SYNTH_DEFAULTS, WAVES } from "../src/audio/synth.js";
import {
  DEFAULT_BANK, getEntry, resolveCue, setEntry, setSynthParam,
  resetCue, resetBank, isCueDefault, exportBank, importBank, bankedIds,
} from "../src/audio/bank.js";
import { CUE_IDS, CUE_LIST, busFor, BUSES, weaponCue, weaponSound, WEAPON_SOUND_KINDS } from "../src/audio/cues.js";
import { startReload, tickReload } from "../src/mission/entities.js";
import { ARSENAL } from "../src/game/arsenal.js";
import { PROJECTILE_SHAPES } from "../src/mission/render.js";
import { fire } from "../src/mission/ai.js";
import { audio, isAvailable, play } from "../src/audio/engine.js";
import { config, SCHEMA } from "../src/game/config.js";

export default async function run(t) {
  // ---- synth: normalization ------------------------------------------------
  const norm = normalizeSynth({});
  t.eq("normalizeSynth fills defaults", norm.wave, SYNTH_DEFAULTS.wave);
  t.ok("normalizeSynth rejects a bad wave", normalizeSynth({ wave: "bagpipe" }).wave === SYNTH_DEFAULTS.wave);
  t.ok("normalizeSynth clamps freq high", normalizeSynth({ freq: 1e9 }).freq === 8000);
  t.ok("normalizeSynth clamps freq low", normalizeSynth({ freq: -50 }).freq === 20);
  t.ok("normalizeSynth survives NaN", Number.isFinite(normalizeSynth({ gain: "loud" }).gain));
  t.ok("normalizeSynth keeps freqEnd null when absent", normalizeSynth({}).freqEnd === null);
  t.ok("normalizeSynth keeps an explicit freqEnd", normalizeSynth({ freqEnd: 100 }).freqEnd === 100);
  t.ok("normalizeSynth keeps filterHz null when absent", normalizeSynth({}).filterHz === null);
  // An attack longer than the sound has nowhere to go.
  t.ok("normalizeSynth caps attack below dur", normalizeSynth({ dur: 0.05, attack: 0.4 }).attack <= 0.05);

  // ---- synth: rendering ----------------------------------------------------
  const buf = renderSynth({ wave: "sine", freq: 440, dur: 0.1 }, 44100);
  t.eq("renderSynth length matches dur", buf.length, 4410);
  t.ok("renderSynth returns a Float32Array", buf instanceof Float32Array);
  t.ok("renderSynth stays in range", buf.every((s) => s >= -1 && s <= 1));
  t.ok("renderSynth produces no NaN", buf.every((s) => Number.isFinite(s)));
  t.ok("renderSynth actually makes sound", buf.some((s) => Math.abs(s) > 0.05));

  // Determinism matters: buffers are rendered once and cached, so the same
  // params must not drift between renders (noise is seeded, not Math.random).
  const a = renderSynth({ wave: "noise", freq: 300, dur: 0.05 }, 44100);
  const b = renderSynth({ wave: "noise", freq: 300, dur: 0.05 }, 44100);
  t.ok("renderSynth is deterministic", a.every((s, i) => s === b[i]));

  // Every waveform must render cleanly — a bad case in waveAt would show as NaN.
  let allWavesOk = true;
  for (const w of WAVES) {
    const s = renderSynth({ wave: w, freq: 220, dur: 0.02, noiseMix: 0.3, filterHz: 2000, drive: 0.5 }, 22050);
    if (!s.every((v) => Number.isFinite(v) && v >= -1 && v <= 1)) allWavesOk = false;
  }
  t.ok("every waveform renders in range", allWavesOk);

  // The envelope has to end quiet or cues click on release.
  const tail = renderSynth({ wave: "sine", freq: 440, dur: 0.2, decay: 0.5 }, 44100);
  t.ok("renderSynth decays to silence", Math.abs(tail[tail.length - 1]) < 0.01);

  // A degenerate duration must not produce an empty or broken buffer.
  t.ok("renderSynth handles a tiny dur", renderSynth({ dur: 0.0001 }, 44100).length >= 1);

  // ---- cue catalog ---------------------------------------------------------
  t.ok("cue ids are unique", new Set(CUE_IDS).size === CUE_IDS.length);
  t.ok("every cue names a known bus", CUE_LIST.every((c) => BUSES.includes(c.bus)));
  t.ok("every cue has help text", CUE_LIST.every((c) => c.help && c.label));
  t.eq("busFor reads the catalog", busFor("ui.click"), "ui");
  t.eq("busFor defaults unknown ids to sfx", busFor("nonsense.cue"), "sfx");

  // Every catalogued cue needs a bank entry, or it is silently dead on arrival.
  const missing = CUE_IDS.filter((id) => !DEFAULT_BANK[id]);
  t.eq("every catalogued cue has a bank entry", missing, []);
  // …and nothing in the bank should be uncatalogued (an unreachable entry).
  const orphans = Object.keys(DEFAULT_BANK).filter((id) => !CUE_IDS.includes(id));
  t.eq("no orphan bank entries", orphans, []);

  // ---- bank: entries -------------------------------------------------------
  const fireEntry = getEntry("weapon.fire");
  t.ok("getEntry returns a normalized entry", fireEntry && fireEntry.synth && typeof fireEntry.gain === "number");
  t.ok("getEntry is null for an unknown id", getEntry("no.such.cue") === null);
  t.ok("entry synth is normalized", WAVES.includes(fireEntry.synth.wave));

  // ---- bank: the dotted fallback walk -------------------------------------
  // The whole point of the layered design: a specific cue that does not exist
  // yet resolves to its generic parent instead of going silent.
  const spec = resolveCue("weapon.fire.bullet.tier3.mk2");
  t.eq("resolveCue walks up the dots", spec && spec.id, "weapon.fire.bullet");
  t.eq("resolveCue keeps walking past unbanked levels", resolveCue("weapon.fire.railgun.heavy").id, "weapon.fire");
  t.eq("resolveCue matches an exact id first", resolveCue("ui.click").id, "ui.click");
  t.ok("resolveCue gives up on an unknown root", resolveCue("nonsense.cue") === null);
  t.ok("resolveCue rejects a non-string", resolveCue(null) === null);
  t.ok("resolveCue rejects an empty id", resolveCue("") === null);

  // ---- bank: editing + persistence ----------------------------------------
  t.ok("a fresh cue is default", isCueDefault("ui.click"));
  setSynthParam("ui.click", "freq", 1234);
  t.eq("setSynthParam applies", getEntry("ui.click").synth.freq, 1234);
  t.ok("an edited cue is not default", !isCueDefault("ui.click"));
  // A partial synth patch must not wipe the sibling params it didn't mention.
  t.eq("setSynthParam merges rather than replaces", getEntry("ui.click").synth.wave, DEFAULT_BANK["ui.click"].synth.wave);

  setEntry("ui.click", { cooldown: 0.25 });
  t.eq("setEntry applies", getEntry("ui.click").cooldown, 0.25);
  t.eq("setEntry preserves earlier synth edits", getEntry("ui.click").synth.freq, 1234);

  // Bad values must be clamped on read, not trusted.
  setEntry("ui.click", { gain: 99, maxVoices: 999, pitchJitter: -3 });
  const clamped = getEntry("ui.click");
  t.ok("entry gain is clamped", clamped.gain <= 2);
  t.ok("entry maxVoices is clamped", clamped.maxVoices <= 16);
  t.ok("entry pitchJitter is clamped", clamped.pitchJitter >= 0);

  resetCue("ui.click");
  t.ok("resetCue restores the default", isCueDefault("ui.click"));
  t.eq("resetCue restores the synth", getEntry("ui.click").synth.freq, DEFAULT_BANK["ui.click"].synth.freq);

  // ---- bank: export / import ----------------------------------------------
  setSynthParam("impact.hit", "dur", 0.2);
  const json = exportBank();
  t.ok("exportBank emits valid JSON", (() => { try { JSON.parse(json); return true; } catch { return false; } })());
  t.ok("exportBank includes edits", JSON.parse(json)["impact.hit"].synth.dur === 0.2);
  resetBank();
  t.ok("resetBank clears every override", isCueDefault("impact.hit"));

  t.ok("importBank rejects garbage", !importBank("{not json").ok);
  t.ok("importBank rejects a non-object", !importBank('"a string"').ok);
  const imp = importBank(JSON.stringify({ "ui.back": { synth: { freq: 555 } } }));
  t.ok("importBank reports what it applied", imp.ok && imp.applied === 1);
  t.eq("importBank applies the entry", getEntry("ui.back").synth.freq, 555);
  resetBank();

  t.ok("bankedIds lists the catalog", bankedIds().includes("weapon.fire"));

  // ---- config schema -------------------------------------------------------
  const sound = SCHEMA.find((g) => g.title === "Sound");
  t.ok("the config schema has a Sound group", !!sound);
  const keys = sound.items.map((i) => i.key);
  for (const k of ["masterVolume", "sfxVolume", "uiVolume", "musicVolume", "muteOnBlur", "audioPan", "audioFalloff", "audioMaxVoices"])
    t.ok(`config exposes ${k}`, keys.includes(k) && config[k] !== undefined);

  // ---- Slice 2: per-weapon sounds -----------------------------------------
  const bulletGun = { projectile: { shape: "bullet" } };
  const shotgun = { projectile: { shape: "pellet" } };
  const shapeless = { projectile: {} };

  // With nothing authored, fire/impact derive a timbre from the projectile shape.
  t.eq("fire derives from shape", weaponCue(bulletGun, "fire"), "weapon.fire.bullet");
  t.eq("impact derives from shape", weaponCue(shotgun, "impact"), "impact.hit.pellet");
  t.eq("a shapeless weapon falls back to the generic cue", weaponCue(shapeless, "fire"), "weapon.fire");
  t.eq("weaponCue tolerates no weapon at all", weaponCue(null, "fire"), "weapon.fire");

  // Shape is meaningless for these two, so they must NOT get a suffix.
  t.eq("reload takes no shape suffix", weaponCue(bulletGun, "reload"), "weapon.reload.start");
  t.eq("empty takes no shape suffix", weaponCue(bulletGun, "empty"), "weapon.empty");
  t.ok("an unknown kind resolves to nothing", weaponCue(bulletGun, "nonsense") === null);

  // Enemy fire branches, and that branch itself falls back to the squad shot.
  t.eq("enemy fire branches", weaponCue(bulletGun, "fire", "enemy"), "weapon.fire.enemy.bullet");
  t.eq("the enemy branch falls back to the squad shot", resolveCue("weapon.fire.enemy.bullet").id, "weapon.fire.enemy");
  t.eq("an unbanked shape falls back to the generic shot", resolveCue("weapon.fire.enemy.orb").id, "weapon.fire.enemy");

  // An explicit assignment wins outright, for every kind.
  const custom = { projectile: { shape: "bullet" }, sounds: { fire: "ui.click", impact: "ui.back", reload: "loot.pickup", empty: "enemy.hurt" } };
  for (const kind of WEAPON_SOUND_KINDS)
    t.ok(`an explicit ${kind} assignment wins`, weaponCue(custom, kind) === custom.sounds[kind]);
  t.eq("an explicit assignment beats the enemy branch too", weaponCue(custom, "fire", "enemy"), "ui.click");

  // Every projectile shape needs its own timbre, or Slice 2 bought nothing.
  const shapeless2 = PROJECTILE_SHAPES.filter((s) => !DEFAULT_BANK[`weapon.fire.${s}`]);
  t.eq("every projectile shape has a fire timbre", shapeless2, []);

  // The point of the slice: the arsenal stops sounding uniform WITHOUT anyone
  // authoring a single `sounds` block. Every weapon must reach a real entry.
  const unresolved = ARSENAL.filter((w) => !resolveCue(weaponCue(w, "fire")));
  t.eq("every arsenal weapon resolves a fire cue", unresolved.map((w) => w.id), []);
  const unresolvedImpact = ARSENAL.filter((w) => !resolveCue(weaponCue(w, "impact")));
  t.eq("every arsenal weapon resolves an impact cue", unresolvedImpact.map((w) => w.id), []);
  // …and they must not all land on the SAME cue, which is the failure this slice exists to prevent.
  const distinct = new Set(ARSENAL.map((w) => resolveCue(weaponCue(w, "fire")).id));
  t.ok(`the arsenal spans several timbres (${distinct.size})`, distinct.size >= 4);

  // ---- per-weapon gain -----------------------------------------------------
  // Default: no `sounds` block at all means unit gain on every slot.
  for (const kind of WEAPON_SOUND_KINDS)
    t.eq(`${kind} defaults to unit gain`, weaponSound(bulletGun, kind).gain, 1);
  t.eq("weaponSound returns the derived cue", weaponSound(bulletGun, "fire").cue, "weapon.fire.bullet");
  t.eq("an unknown kind yields no cue", weaponSound(bulletGun, "nope"), { cue: null, gain: 1 });

  // The string form is the Slice 2 shape and must keep working untouched.
  t.eq("a string slot is cue-only at unit gain", weaponSound({ sounds: { fire: "ui.click" } }, "fire"), { cue: "ui.click", gain: 1 });

  // The object form carries both.
  t.eq("an object slot carries cue and gain",
    weaponSound({ projectile: { shape: "bullet" }, sounds: { fire: { cue: "ui.click", gain: 0.5 } } }, "fire"),
    { cue: "ui.click", gain: 0.5 });

  // The point of the whole change: turn a weapon down WITHOUT giving up the
  // shape-derived timbre, so two weapons on one cue can sit at different levels.
  t.eq("a gain-only slot keeps the derived cue",
    weaponSound({ projectile: { shape: "pellet" }, sounds: { fire: { gain: 0.4 } } }, "fire"),
    { cue: "weapon.fire.pellet", gain: 0.4 });
  t.eq("a gain-only slot still branches for the enemy team",
    weaponSound({ projectile: { shape: "bolt" }, sounds: { fire: { gain: 0.4 } } }, "fire", "enemy").cue,
    "weapon.fire.enemy.bolt");

  // Garbage must not reach the engine as NaN and silence a cue.
  const bad = (g) => weaponSound({ sounds: { fire: { gain: g } } }, "fire").gain;
  t.eq("gain clamps high", bad(99), 2);
  t.eq("gain clamps low", bad(-5), 0);
  t.eq("a non-numeric gain falls back to 1", bad("loud"), 1);
  t.eq("NaN falls back to 1", bad(NaN), 1);
  t.eq("an explicitly zero gain is honoured", bad(0), 0);
  t.eq("an omitted gain is 1", weaponSound({ sounds: { fire: { cue: "ui.click" } } }, "fire").gain, 1);

  // weaponCue stays a pure cue lookup for the callers that only want the id.
  t.eq("weaponCue unwraps the object form", weaponCue({ sounds: { fire: { cue: "ui.back", gain: 0.2 } } }, "fire"), "ui.back");

  // fire() must tag each projectile with its own impact cue AND level — a shot
  // outlives its shooter, so neither can be looked up later from the weapon.
  {
    const scene = { projectiles: [], platforms: [], soldiers: [], enemies: [], world: { gravity: 1600 } };
    const w = { fireRate: 6, spread: 0, projectile: { speed: 800, w: 10, h: 4, color: "#fff", life: 1, shape: "pellet" }, effects: [{ kind: "pellets", count: 5, spread: 0.1 }] };
    const shooter = { x: 0, y: 0, w: 20, h: 46, facing: 1, fireCooldown: 0, reloading: 0, weapon: w, kind: "soldier" };
    let calls = [];
    scene.sound = (id, opts) => calls.push([id, opts]);
    t.ok("fire() reports a shot", fire(scene, shooter, { x: 1, y: 0 }, "player", 1 / 60) === true);
    t.eq("a 5-pellet shell makes 5 projectiles", scene.projectiles.length, 5);
    t.eq("but only ONE shot cue", calls.map((c) => c[0]), ["weapon.fire.pellet"]);
    t.eq("an unauthored weapon fires at unit gain", calls[0][1].gain, 1);
    t.ok("every pellet carries the impact cue", scene.projectiles.every((p) => p.sound === "impact.hit.pellet"));
    t.ok("every pellet carries unit impact gain", scene.projectiles.every((p) => p.soundGain === 1));

    // Now author levels and re-fire.
    w.sounds = { fire: { gain: 0.35 }, impact: { gain: 1.4 }, empty: { gain: 0.5 } };
    calls = [];
    scene.projectiles.length = 0;
    shooter.fireCooldown = 0;
    t.ok("it still fires", fire(scene, shooter, { x: 1, y: 0 }, "player", 1 / 60) === true);
    t.eq("the shot carries the authored gain", calls[0][1].gain, 0.35);
    t.eq("and still the shape-derived cue", calls[0][0], "weapon.fire.pellet");
    t.ok("pellets carry the authored impact gain", scene.projectiles.every((p) => p.soundGain === 1.4));

    // A dry magazine clicks with the weapon's own empty cue and level.
    calls = [];
    shooter.fireCooldown = 0;
    shooter.ammo = 0;
    t.ok("an empty magazine does not fire", fire(scene, shooter, { x: 1, y: 0 }, "player", 1 / 60) === false);
    t.eq("and it clicks", calls.map((c) => c[0]), ["weapon.empty"]);
    t.eq("at the authored click level", calls[0][1].gain, 0.5);
    // An enemy running dry stays silent — the click is squad-only feedback.
    calls = [];
    t.ok("an empty enemy weapon does not fire", fire(scene, shooter, { x: 1, y: 0 }, "enemy", 1 / 60) === false);
    t.eq("and stays silent", calls, []);
  }

  // Reload: BOTH halves take the weapon's `reload` slot gain, so a weapon turned
  // down is quiet for the mag drop and the mag seat alike.
  {
    const calls = [];
    const scene = { sound: (id, opts) => calls.push([id, opts.gain]) };
    const w = { magazine: 10, reloadTime: 1, sounds: { reload: { gain: 0.25 } } };
    const actor = { x: 0, y: 0, w: 20, h: 46, weapon: w, ammo: 0, reloading: 0 };
    t.ok("reload starts", startReload(actor, scene) === true);
    tickReload(actor, 2, scene);
    t.eq("both reload cues fire at the authored level", calls, [["weapon.reload.start", 0.25], ["weapon.reload.done", 0.25]]);

    // …and a weapon with nothing authored stays at unit gain.
    const plain = { x: 0, y: 0, w: 20, h: 46, weapon: { magazine: 10, reloadTime: 1 }, ammo: 0, reloading: 0 };
    calls.length = 0;
    startReload(plain, scene);
    tickReload(plain, 2, scene);
    t.eq("an unauthored reload is unit gain", calls.map((c) => c[1]), [1, 1]);
  }

  // Authored levels have to survive the route the Designer actually takes:
  // finalizeWeapon -> saveCustomWeapon -> localStorage -> back out of the store.
  {
    const { finalizeWeapon } = await import("../src/game/weaponcost.js");
    const { saveCustomWeapon, listCustomWeapons } = await import("../src/game/customcontent.js");
    const designed = {
      id: "gain_probe", name: "Gain Probe", fireRate: 5, spread: 0,
      projectile: { speed: 800, w: 10, h: 4, color: "#fff", life: 1, shape: "bolt" },
      sounds: { fire: { gain: 0.3 }, impact: { cue: "impact.hit.pellet", gain: 1.5 } },
      effects: [{ kind: "damage", amount: 10 }],
    };
    const finalized = finalizeWeapon(designed);
    t.ok("finalizeWeapon carries sounds through", !!finalized.sounds);
    t.ok("gain costs no budget", finalized.budgetSpent === finalizeWeapon({ ...designed, sounds: undefined }).budgetSpent);

    saveCustomWeapon(finalized);
    const loaded = listCustomWeapons().find((w) => w.id === "gain_probe");
    t.ok("a saved weapon keeps its sounds block", loaded && !!loaded.sounds);
    t.eq("the gain survives storage", weaponSound(loaded, "fire").gain, 0.3);
    t.eq("the derived cue survives storage", weaponSound(loaded, "fire").cue, "weapon.fire.bolt");
    t.eq("an explicit cue + gain survives storage", weaponSound(loaded, "impact"), { cue: "impact.hit.pellet", gain: 1.5 });
  }

  // ---- engine: silent under node ------------------------------------------
  // There is no AudioContext here, so every entry point must be a harmless
  // no-op rather than a throw — this is what keeps every other suite green.
  t.ok("engine reports unavailable headlessly", !isAvailable());
  t.ok("play() returns false with no context", play("weapon.fire", { x: 10 }) === false);
  t.ok("play() tolerates an unknown cue", play("no.such.cue") === false);
  let threw = false;
  try {
    audio.armUnlock();
    audio.unlock();
    audio.setListener(400);
    audio.setListener("not a number");
    audio.stopAll();
    audio.invalidateBuffers();
    audio.audition(getEntry("ui.click"));
    audio.play("ui.click");
  } catch {
    threw = true;
  }
  t.ok("no engine entry point throws headlessly", !threw);

  // ---- engine: the playback path, against a mock AudioContext --------------
  // MUST come last: it installs a context that stays live for the rest of the
  // suite. The engine looks its constructor up lazily precisely so this works.
  {
    const started = [];
    let now = 0;
    class G { constructor() { this.gain = { value: 1 }; } connect(d) { return d; } disconnect() {} }
    class S {
      constructor() { this.playbackRate = { value: 1 }; }
      connect(d) { return d; }
      disconnect() {}
      start() { started.push(this); if (this.onended) this.onended(); }
    }
    class MockCtx {
      constructor() { this.state = "suspended"; this.sampleRate = 44100; this.destination = {}; this.resumed = 0; }
      get currentTime() { return now; }
      createGain() { return new G(); }
      createBufferSource() { return new S(); }
      createStereoPanner() { const p = new G(); p.pan = { value: 0 }; return p; }
      createBuffer(ch, len) { const d = new Float32Array(len); return { length: len, getChannelData: () => d }; }
      resume() { this.resumed++; this.state = "running"; return Promise.resolve(); }
    }
    const made = [];
    window.AudioContext = function () { const c = new MockCtx(); made.push(c); return c; };

    // The regression this suite exists for: play() must stand the context up on
    // its own. Nothing has armed or unlocked the engine at this point.
    t.ok("play() starts a voice without a prior unlock", play("ui.click") === true);
    t.ok("play() created a context", isAvailable() && made.length === 1);
    // A browser hands back a suspended context outside a gesture; if nothing
    // resumes it the game is silent forever.
    t.ok("play() resumes a suspended context", made[0].resumed >= 1);
    t.eq("play() actually started a source", started.length, 1);

    // Cooldown: the shotgun-pellet guard. weapon.fire has a 20ms gap.
    t.ok("first shot plays", play("weapon.fire") === true);
    t.ok("a retrigger inside the cooldown is refused", play("weapon.fire") === false);
    now += 0.5;
    t.ok("the same cue plays again after the cooldown", play("weapon.fire") === true);

    // Distance falloff: beyond audioFalloff px from the listener, no voice.
    audio.setListener(0);
    now += 0.5;
    t.ok("a sound at the listener plays", play("impact.wall", { x: 0 }) === true);
    now += 0.5;
    t.ok("a sound past the falloff is dropped", play("impact.wall", { x: 99999 }) === false);

    // force bypasses the guards (the editor's audition path).
    now += 0.5;
    t.ok("force ignores the cooldown", play("weapon.fire", { force: true }) && play("weapon.fire", { force: true }));

    delete window.AudioContext;
  }
}
