// AUDIO — the parts that can be verified without a browser: synth rendering is
// a pure function, the bank is plain data with a dotted fallback walk, and the
// engine must degrade to silent no-ops under node (no AudioContext) so importing
// it from game code never breaks a headless run.

import { renderSynth, normalizeSynth, SYNTH_DEFAULTS, WAVES } from "../src/audio/synth.js";
import {
  DEFAULT_BANK, getEntry, resolveCue, setEntry, setSynthParam,
  resetCue, resetBank, isCueDefault, exportBank, importBank, bankedIds,
} from "../src/audio/bank.js";
import { CUE_IDS, CUE_LIST, busFor, BUSES } from "../src/audio/cues.js";
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
  const fire = getEntry("weapon.fire");
  t.ok("getEntry returns a normalized entry", fire && fire.synth && typeof fire.gain === "number");
  t.ok("getEntry is null for an unknown id", getEntry("no.such.cue") === null);
  t.ok("entry synth is normalized", WAVES.includes(fire.synth.wave));

  // ---- bank: the dotted fallback walk -------------------------------------
  // The whole point of the layered design: a specific cue that does not exist
  // yet resolves to its generic parent instead of going silent.
  const spec = resolveCue("weapon.fire.pellet.tier3");
  t.eq("resolveCue walks up the dots", spec && spec.id, "weapon.fire");
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
