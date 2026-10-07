// ---------------------------------------------------------------------------
// THE SOUND MIX (tech/trailer.md, T7). Pure: no WebAudio, no DOM, no files.
//
// The capture runs at ~4 fps, so the game's WebAudio engine cannot be
// recorded; the takes record every cue the game asked for instead (runner.js,
// app.js) and this plays them offline, by the engine's own rules
// (src/audio/engine.js `play`): the bank's synth rendered by the same
// `renderSynth`, the entry's gain, cooldown and voice caps, the config's
// global cap, distance falloff and pan from the listener, the bus and master
// volumes. Pitch jitter comes from a seeded stream, so a mix is reproducible.
//
// An event is { t, cue, x?, gain?, lx?, ls? }: t in seconds from the start of
// the mix; lx/ls are the listener's x and range scale (engine `setListener`).
// mixEvents → { left, right } Float32Arrays at `rate`.
// ---------------------------------------------------------------------------

import { resolveCue } from "../audio/bank.js";
import { busFor } from "../audio/cues.js";
import { renderSynth } from "../audio/synth.js";
import { config } from "../game/config.js";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUS_VOLUME = {
  sfx: () => config.sfxVolume ?? 1,
  ui: () => config.uiVolume ?? 0.8,
  music: () => config.musicVolume ?? 0.6,
};

export function mixEvents(events, { duration, rate = 48000, seed = 1 } = {}) {
  const n = Math.ceil(duration * rate);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const rnd = mulberry32(seed);
  const buffers = new Map(); // synth signature → samples
  const voices = new Map(); // resolved id → { lastAt, ends: [] }
  let playing = []; // end times of every voice, for the global cap
  const master = clamp(config.masterVolume ?? 0.7, 0, 1);
  let played = 0;

  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    const hit = resolveCue(e.cue);
    if (!hit || !hit.entry.synth) continue;
    const { entry } = hit;
    const rec = voices.get(hit.id) || { lastAt: -Infinity, ends: [] };
    rec.ends = rec.ends.filter((end) => end > e.t);
    playing = playing.filter((end) => end > e.t);
    if (entry.cooldown > 0 && e.t - rec.lastAt < entry.cooldown) continue;
    if (rec.ends.length >= entry.maxVoices) continue;
    if (playing.length >= (config.audioMaxVoices ?? 24)) continue;

    let vol = entry.gain * (e.gain ?? 1);
    let pan = 0;
    if (e.x !== undefined && e.x !== null && e.lx !== undefined) {
      const dx = e.x - e.lx;
      const range = Math.max(1, (config.audioFalloff ?? 900) * (e.ls || 1));
      vol *= clamp(1 - Math.abs(dx) / range, 0, 1);
      if (vol <= 0.001) continue;
      pan = clamp(dx / range, -1, 1) * clamp(config.audioPan ?? 0.7, 0, 1);
    }
    vol = clamp(vol, 0, 4) * clamp(BUS_VOLUME[busFor(hit.id)]?.() ?? 1, 0, 1) * master;

    const sig = JSON.stringify(entry.synth);
    let buf = buffers.get(sig);
    if (!buf) buffers.set(sig, (buf = renderSynth(entry.synth, rate)));
    const jitter = entry.pitchJitter ? 1 + (rnd() * 2 - 1) * entry.pitchJitter : 1;
    const speed = clamp(jitter, 0.25, 4);
    const len = Math.floor(buf.length / speed);

    // StereoPanner on a mono source is equal-power.
    const a = ((pan + 1) / 2) * (Math.PI / 2);
    const gl = vol * Math.cos(a), gr = vol * Math.sin(a);
    const start = Math.round(e.t * rate);
    for (let i = 0; i < len && start + i < n; i++) {
      if (start + i < 0) continue;
      const p = i * speed, k = Math.floor(p), fr = p - k;
      const s = buf[k] * (1 - fr) + (k + 1 < buf.length ? buf[k + 1] : 0) * fr;
      left[start + i] += s * gl;
      right[start + i] += s * gr;
    }
    const end = e.t + len / rate;
    rec.lastAt = e.t;
    rec.ends.push(end);
    playing.push(end);
    voices.set(hit.id, rec);
    played++;
  }
  return { left, right, played };
}

// 16-bit stereo PCM WAV, soft-limited so a pile-up clips gently, not hard.
export function wav({ left, right }, rate = 48000) {
  const n = left.length;
  const out = new ArrayBuffer(44 + n * 4);
  const v = new DataView(out);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.round(Math.tanh(left[i]) * 32767), true);
    v.setInt16(46 + i * 4, Math.round(Math.tanh(right[i]) * 32767), true);
  }
  return new Uint8Array(out);
}
