// ---------------------------------------------------------------------------
// SYNTH — procedural sample rendering. PURE: no WebAudio, no DOM, no globals.
//
// A "beep" is a plain-data parameter object (so the editor can generate controls
// for it and the bank can persist it as JSON). renderSynth turns one into raw
// mono PCM; engine.js is the only thing that knows what an AudioBuffer is.
//
// Being pure is the point: the interesting half of the audio system — waveform
// shaping, envelopes, sweeps, filtering — is verifiable headlessly under node
// with no browser mock, the same way the cost models and the level generator are.
//
// Params (all optional; normalizeSynth fills + clamps):
//   wave      sine | square | saw | triangle | noise
//   freq      start frequency, Hz
//   freqEnd   sweep target, Hz (null = hold `freq`)
//   dur       length, seconds
//   attack    fade-in, seconds (clamped below dur)
//   decay     fade-out shape: 0 = boxy, 1 = long tail
//   gain      peak amplitude 0..1
//   noiseMix  0..1 blend of white noise over the tone (0 = pure tone)
//   filterHz  one-pole lowpass cutoff, Hz (null = off)
//   drive     0..1 soft clipping — bite/crunch
// ---------------------------------------------------------------------------

export const WAVES = ["sine", "square", "saw", "triangle", "noise"];

// [min, max] bounds, also read by the editor to build sliders.
export const SYNTH_RANGES = {
  freq: [20, 8000],
  freqEnd: [20, 8000],
  dur: [0.01, 3],
  attack: [0, 0.5],
  decay: [0, 1],
  gain: [0, 1],
  noiseMix: [0, 1],
  filterHz: [80, 12000],
  drive: [0, 1],
};

export const SYNTH_DEFAULTS = {
  wave: "sine",
  freq: 440,
  freqEnd: null,
  dur: 0.14,
  attack: 0.004,
  decay: 0.6,
  gain: 0.6,
  noiseMix: 0,
  filterHz: null,
  drive: 0,
};

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function num(v, fallback, range) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return range ? clamp(n, range[0], range[1]) : n;
}

// Coerce a raw params object to legal values so bad input (hand-edited JSON, a
// stale localStorage blob) can never produce NaN samples or a runaway buffer.
export function normalizeSynth(raw = {}) {
  const p = { ...SYNTH_DEFAULTS };
  p.wave = WAVES.includes(raw.wave) ? raw.wave : SYNTH_DEFAULTS.wave;
  for (const k of ["freq", "dur", "attack", "decay", "gain", "noiseMix", "drive"]) {
    p[k] = num(raw[k], SYNTH_DEFAULTS[k], SYNTH_RANGES[k]);
  }
  // freqEnd and filterHz are nullable — null/undefined means "off", not 0.
  p.freqEnd = raw.freqEnd == null ? null : num(raw.freqEnd, SYNTH_DEFAULTS.freq, SYNTH_RANGES.freqEnd);
  p.filterHz = raw.filterHz == null ? null : num(raw.filterHz, 4000, SYNTH_RANGES.filterHz);
  // An attack longer than the sound has nowhere to go.
  if (p.attack > p.dur * 0.9) p.attack = p.dur * 0.9;
  return p;
}

// Deterministic noise so the same params always render the same buffer (cached
// once per cue). Per-shot variation comes from playbackRate in the engine, not
// from re-rendering — regenerating a buffer per shot would be far too costly.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function waveAt(wave, phase) {
  // `phase` is in turns (0..1), not radians — cheaper and easier to reason about.
  const t = phase - Math.floor(phase);
  switch (wave) {
    case "square":
      return t < 0.5 ? 1 : -1;
    case "saw":
      return 2 * t - 1;
    case "triangle":
      return 4 * Math.abs(t - 0.5) - 1;
    case "noise":
      return 0; // handled by the noise generator; the tone part is silent
    default:
      return Math.sin(2 * Math.PI * t);
  }
}

/**
 * Render synth params to mono PCM.
 * @param {object} params  raw or normalized synth params
 * @param {number} sampleRate
 * @returns {Float32Array} samples in [-1, 1]
 */
export function renderSynth(params, sampleRate = 44100) {
  const p = normalizeSynth(params);
  const n = Math.max(1, Math.floor(p.dur * sampleRate));
  const out = new Float32Array(n);
  // Seeded from the params so two cues with different settings get different
  // noise, but one cue is stable across reloads.
  const rnd = mulberry32(Math.floor(p.freq * 7 + p.dur * 9973 + p.gain * 101));

  const sweeps = p.freqEnd != null && p.freqEnd !== p.freq;
  const isNoise = p.wave === "noise";
  const noiseAmt = isNoise ? 1 : p.noiseMix;
  const toneAmt = isNoise ? 0 : 1 - p.noiseMix * 0.5;

  // Lowpass: TWO cascaded one-pole stages (12 dB/octave). A single pole rolls
  // off at 6 dB/oct, which is far too gentle to darken white noise — a "800 Hz"
  // cutoff still measured ~3.6 kHz of brightness, so every noise-based cue read
  // as hiss no matter what the cutoff said. Two stages make filterHz mean what
  // it claims, which matters because for a `noise` wave it is the ONLY pitch
  // control there is.
  const lp = p.filterHz == null ? 0 : Math.exp((-2 * Math.PI * p.filterHz) / sampleRate);
  let lpA = 0;
  let lpB = 0;

  const attackN = Math.max(1, Math.floor(p.attack * sampleRate));
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / n; // 0..1 through the sound

    // Exponential frequency sweep — pitch reads as geometric, so a linear ramp
    // in log space is what "pew" and "boop" actually sound like.
    let f = p.freq;
    if (sweeps) f = p.freq * Math.pow(p.freqEnd / p.freq, t);
    phase += f / sampleRate;

    let s = waveAt(p.wave, phase) * toneAmt;
    if (noiseAmt > 0) s += (rnd() * 2 - 1) * noiseAmt;

    if (lp) {
      lpA = s * (1 - lp) + lpA * lp;
      lpB = lpA * (1 - lp) + lpB * lp;
      // Two poles cost ~6 dB of level at the cutoff; give it back so lowering a
      // cutoff darkens a cue without also quietening it.
      s = lpB * 2;
    }

    // Envelope: linear attack, then an exponential-ish decay whose curve is set
    // by `decay` (0 = hold flat then cut, 1 = drop away immediately and ring out).
    const atk = i < attackN ? i / attackN : 1;
    const rel = Math.pow(1 - t, 1 + p.decay * 6);
    s *= atk * rel * p.gain;

    // Soft clip. tanh-ish via a cheap rational curve; drive 0 leaves s untouched.
    if (p.drive > 0) {
      const k = 1 + p.drive * 9;
      s = (s * k) / (1 + Math.abs(s * k)) * (1 / (1 - 1 / (1 + k)));
    }

    out[i] = clamp(s, -1, 1);
  }
  return out;
}
