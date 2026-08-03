// ---------------------------------------------------------------------------
// BANK — cue id -> how it sounds. The registry, and the analogue of the asset
// registry in tech/asset-generation.md: renderers ask for a key, the bank
// decides what plays, and a missing entry is silence rather than a crash.
//
// Entry shape:
//   synth       synth.js params — the made-up beep (Slice 1's only source)
//   src         a committed clip path; when present it WINS over synth (Slice 4)
//   gain        playback trim 0..2, applied on top of the source's own level
//   pitchJitter +/- fraction of random playback-rate variation per shot, so
//               repeated fire doesn't machine-gun the identical sample
//   cooldown    seconds this cue refuses to retrigger (voice-spam guard)
//   maxVoices   simultaneous copies of THIS cue (the engine also caps globally)
//
// Overrides persist to localStorage exactly like config.js: only the diff from
// DEFAULT_BANK is stored, so cues added later still pick up their defaults, and
// `exportBank()` gives you JSON to paste back into the defaults below to make a
// tweak permanent. Every storage access is guarded so node imports never throw.
// ---------------------------------------------------------------------------

import { CUE_IDS } from "./cues.js";
import { normalizeSynth } from "./synth.js";

const STORAGE_KEY = "sidescroller.sound.v1";

// Hand-tuned placeholder beeps. Deliberately dry and short — they read as
// feedback, not as music, and they get out of the way of the next one.
//
// NOTE when tuning: a `wave: "noise"` cue has no tone term (synth.js zeroes it),
// so its `freq`/`freqEnd` are inert — **`filterHz` is the pitch control** for
// pellet/missile/wave/reload/empty. Lowering `freq` on those does nothing.
export const DEFAULT_BANK = {
  // ---- weapons ------------------------------------------------------------
  "weapon.fire": {
    synth: { wave: "square", freq: 200, freqEnd: 58, dur: 0.085, attack: 0.001, decay: 0.85, gain: 0.5, noiseMix: 0.5, filterHz: 1900, drive: 0.45 },
    pitchJitter: 0.07, cooldown: 0.02, maxVoices: 6,
  },
  "weapon.fire.enemy": {
    synth: { wave: "saw", freq: 150, freqEnd: 46, dur: 0.1, attack: 0.002, decay: 0.8, gain: 0.42, noiseMix: 0.25, filterHz: 1500, drive: 0.35 },
    pitchJitter: 0.09, cooldown: 0.03, maxVoices: 5,
  },
  // Per-shape timbres. These are what stop the arsenal sounding uniform: a
  // weapon picks one up from `projectile.shape` with nothing authored on it.
  "weapon.fire.bullet": {
    synth: { wave: "square", freq: 220, freqEnd: 62, dur: 0.08, attack: 0.001, decay: 0.85, gain: 0.5, noiseMix: 0.45, filterHz: 2000, drive: 0.5 },
    pitchJitter: 0.07, cooldown: 0.02, maxVoices: 6,
  },
  "weapon.fire.pellet": {
    // Heavier, longer, and mostly noise — one shell, not five pellets.
    synth: { wave: "noise", freq: 220, freqEnd: 70, dur: 0.17, attack: 0.001, decay: 0.55, gain: 0.75, noiseMix: 1, filterHz: 800, drive: 0.55 },
    pitchJitter: 0.06, cooldown: 0.05, maxVoices: 3,
  },
  "weapon.fire.bolt": {
    synth: { wave: "square", freq: 560, freqEnd: 150, dur: 0.1, attack: 0.001, decay: 0.8, gain: 0.42, noiseMix: 0.12, filterHz: 3200, drive: 0.3 },
    pitchJitter: 0.1, cooldown: 0.02, maxVoices: 5,
  },
  "weapon.fire.missile": {
    synth: { wave: "noise", freq: 180, dur: 0.36, attack: 0.006, decay: 0.35, gain: 0.7, filterHz: 700, drive: 0.35 },
    pitchJitter: 0.08, cooldown: 0.08, maxVoices: 3,
  },
  "weapon.fire.wave": {
    // A stream weapon fires many times a second, so this stays quiet and short.
    synth: { wave: "noise", freq: 400, dur: 0.11, attack: 0.004, decay: 0.7, gain: 0.72, filterHz: 1800 },
    pitchJitter: 0.18, cooldown: 0.03, maxVoices: 4,
  },
  "weapon.fire.orb": {
    synth: { wave: "sine", freq: 320, freqEnd: 100, dur: 0.13, attack: 0.003, decay: 0.65, gain: 0.45, noiseMix: 0.2, filterHz: 1400, drive: 0.2 },
    pitchJitter: 0.1, cooldown: 0.03, maxVoices: 4,
  },

  "weapon.reload.start": {
    synth: { wave: "noise", freq: 200, dur: 0.075, attack: 0.001, decay: 0.7, gain: 1, filterHz: 1150 },
    pitchJitter: 0.04, cooldown: 0.05, maxVoices: 2,
  },
  "weapon.reload.done": {
    synth: { wave: "square", freq: 110, freqEnd: 215, dur: 0.08, attack: 0.001, decay: 0.75, gain: 0.4, noiseMix: 0.35, filterHz: 1700, drive: 0.3 },
    pitchJitter: 0.04, cooldown: 0.05, maxVoices: 2,
  },
  "weapon.empty": {
    synth: { wave: "noise", freq: 400, dur: 0.045, attack: 0.001, decay: 0.9, gain: 0.53, filterHz: 3000 },
    pitchJitter: 0.05, cooldown: 0.12, maxVoices: 1,
  },

  // ---- impacts ------------------------------------------------------------
  "impact.hit": {
    synth: { wave: "square", freq: 520, freqEnd: 170, dur: 0.07, attack: 0.001, decay: 0.85, gain: 0.4, noiseMix: 0.45, filterHz: 3600, drive: 0.3 },
    pitchJitter: 0.12, cooldown: 0.045, maxVoices: 4,
  },
  "impact.hit.bolt": {
    synth: { wave: "square", freq: 1150, freqEnd: 380, dur: 0.06, attack: 0.001, decay: 0.88, gain: 0.32, noiseMix: 0.2, filterHz: 5400 },
    pitchJitter: 0.14, cooldown: 0.045, maxVoices: 4,
  },
  "impact.hit.pellet": {
    synth: { wave: "noise", freq: 240, dur: 0.075, attack: 0.001, decay: 0.7, gain: 0.5, filterHz: 1400, drive: 0.3 },
    pitchJitter: 0.1, cooldown: 0.06, maxVoices: 3,
  },
  "impact.hit.wave": {
    synth: { wave: "noise", freq: 600, dur: 0.1, attack: 0.003, decay: 0.6, gain: 0.46, filterHz: 3800 },
    pitchJitter: 0.16, cooldown: 0.05, maxVoices: 3,
  },
  "impact.wall": {
    synth: { wave: "noise", freq: 300, dur: 0.05, attack: 0.001, decay: 0.9, gain: 0.5, filterHz: 2600 },
    pitchJitter: 0.14, cooldown: 0.06, maxVoices: 3,
  },
  "impact.explode": {
    synth: { wave: "noise", freq: 160, dur: 0.5, attack: 0.002, decay: 0.5, gain: 0.85, filterHz: 850, drive: 0.6 },
    pitchJitter: 0.1, cooldown: 0.06, maxVoices: 3,
  },
  "impact.chain": {
    synth: { wave: "square", freq: 1400, freqEnd: 2700, dur: 0.075, attack: 0.001, decay: 0.85, gain: 0.3, noiseMix: 0.3, filterHz: 6000 },
    pitchJitter: 0.15, cooldown: 0.04, maxVoices: 4,
  },

  // ---- soldier ------------------------------------------------------------
  "soldier.jump": {
    synth: { wave: "sine", freq: 300, freqEnd: 640, dur: 0.1, attack: 0.003, decay: 0.7, gain: 0.3 },
    pitchJitter: 0.06, cooldown: 0.08, maxVoices: 2,
  },
  "soldier.land": {
    synth: { wave: "noise", freq: 150, dur: 0.09, attack: 0.001, decay: 0.75, gain: 0.62, filterHz: 1100 },
    pitchJitter: 0.08, cooldown: 0.1, maxVoices: 2,
  },
  "soldier.hurt": {
    synth: { wave: "saw", freq: 430, freqEnd: 180, dur: 0.13, attack: 0.002, decay: 0.6, gain: 0.5, noiseMix: 0.2, filterHz: 2800, drive: 0.3 },
    pitchJitter: 0.06, cooldown: 0.18, maxVoices: 2,
  },
  "soldier.death": {
    synth: { wave: "saw", freq: 300, freqEnd: 62, dur: 0.5, attack: 0.004, decay: 0.35, gain: 0.6, noiseMix: 0.25, filterHz: 1900, drive: 0.4 },
    pitchJitter: 0.05, cooldown: 0.2, maxVoices: 2,
  },

  // ---- enemy --------------------------------------------------------------
  "enemy.hurt": {
    synth: { wave: "square", freq: 720, freqEnd: 430, dur: 0.06, attack: 0.001, decay: 0.85, gain: 0.24, noiseMix: 0.25, filterHz: 4200 },
    pitchJitter: 0.16, cooldown: 0.07, maxVoices: 3,
  },
  "enemy.death": {
    synth: { wave: "saw", freq: 420, freqEnd: 70, dur: 0.42, attack: 0.003, decay: 0.4, gain: 0.6, noiseMix: 0.35, filterHz: 2000, drive: 0.5 },
    pitchJitter: 0.14, cooldown: 0.05, maxVoices: 4,
  },
  "enemy.part": {
    synth: { wave: "square", freq: 640, freqEnd: 300, dur: 0.09, attack: 0.001, decay: 0.75, gain: 0.4, noiseMix: 0.35, filterHz: 3400, drive: 0.25 },
    pitchJitter: 0.16, cooldown: 0.05, maxVoices: 3,
  },

  // ---- pickups & mission --------------------------------------------------
  "loot.pickup": {
    synth: { wave: "sine", freq: 780, freqEnd: 1570, dur: 0.13, attack: 0.003, decay: 0.5, gain: 0.38 },
    pitchJitter: 0.04, cooldown: 0.05, maxVoices: 3,
  },
  "mission.start": {
    synth: { wave: "triangle", freq: 260, freqEnd: 530, dur: 0.5, attack: 0.01, decay: 0.25, gain: 0.5 },
    pitchJitter: 0, cooldown: 0.5, maxVoices: 1,
  },
  "mission.win": {
    synth: { wave: "triangle", freq: 520, freqEnd: 1050, dur: 0.6, attack: 0.008, decay: 0.2, gain: 0.55 },
    pitchJitter: 0, cooldown: 0.5, maxVoices: 1,
  },
  "mission.lose": {
    synth: { wave: "triangle", freq: 330, freqEnd: 105, dur: 0.8, attack: 0.01, decay: 0.22, gain: 0.55 },
    pitchJitter: 0, cooldown: 0.5, maxVoices: 1,
  },

  // ---- interface ----------------------------------------------------------
  "ui.click": {
    synth: { wave: "square", freq: 900, freqEnd: 1250, dur: 0.032, attack: 0.001, decay: 0.8, gain: 0.22 },
    pitchJitter: 0.03, cooldown: 0.03, maxVoices: 2,
  },
  "ui.back": {
    synth: { wave: "square", freq: 700, freqEnd: 450, dur: 0.045, attack: 0.001, decay: 0.8, gain: 0.22 },
    pitchJitter: 0.03, cooldown: 0.03, maxVoices: 2,
  },
};

export const ENTRY_DEFAULTS = { gain: 1, pitchJitter: 0, cooldown: 0, maxVoices: 4 };

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---- guarded storage ------------------------------------------------------

function readStore() {
  try {
    if (typeof localStorage === "undefined") return {};
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeStore(obj) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* private mode / unavailable — tweaks just won't persist */
  }
}

// The live overrides map: cueId -> partial entry. Mutated in place so importers
// see edits without re-importing (same contract as config.js).
const overrides = readStore();

function persist() {
  writeStore(overrides);
}

// ---- entry access ---------------------------------------------------------

// Coerce an entry to legal values. Applied on every read so a hand-edited or
// stale localStorage blob can never produce NaN gain or an unbounded voice pool.
function normalizeEntry(raw) {
  const e = { ...ENTRY_DEFAULTS, ...raw };
  return {
    src: typeof e.src === "string" && e.src ? e.src : null,
    synth: e.synth ? normalizeSynth(e.synth) : null,
    gain: clamp(Number(e.gain) || 0, 0, 2),
    pitchJitter: clamp(Number(e.pitchJitter) || 0, 0, 0.5),
    cooldown: clamp(Number(e.cooldown) || 0, 0, 2),
    maxVoices: Math.round(clamp(Number(e.maxVoices) || ENTRY_DEFAULTS.maxVoices, 1, 16)),
  };
}

/**
 * The entry for exactly this id (defaults merged with any override), or null if
 * the id is not in the bank at all. Use resolveCue for the fallback walk.
 */
export function getEntry(id) {
  const base = DEFAULT_BANK[id];
  const over = overrides[id];
  if (!base && !over) return null;
  const merged = { ...base, ...over };
  if (base && over && over.synth) merged.synth = { ...base.synth, ...over.synth };
  return normalizeEntry(merged);
}

/**
 * Resolve a cue id by walking up its dots until an entry exists:
 *   "weapon.fire.pellet" -> "weapon.fire" -> null
 * Returns { id, entry } naming the id that actually matched (the caller keys
 * cooldown/voice bookkeeping off it), or null when nothing in the chain exists.
 */
export function resolveCue(id) {
  if (typeof id !== "string" || !id) return null;
  let key = id;
  for (;;) {
    const entry = getEntry(key);
    if (entry) return { id: key, entry };
    const cut = key.lastIndexOf(".");
    if (cut < 0) return null;
    key = key.slice(0, cut);
  }
}

// ---- editing --------------------------------------------------------------

/** Merge a partial entry into a cue's override and persist. */
export function setEntry(id, patch) {
  const cur = overrides[id] || {};
  const next = { ...cur, ...patch };
  if (patch && patch.synth) next.synth = { ...(cur.synth || {}), ...patch.synth };
  overrides[id] = next;
  persist();
  return getEntry(id);
}

/** Set one synth parameter on a cue (what the editor's sliders call). */
export function setSynthParam(id, key, value) {
  return setEntry(id, { synth: { [key]: value } });
}

export function resetCue(id) {
  delete overrides[id];
  persist();
  return getEntry(id);
}

export function resetBank() {
  for (const k of Object.keys(overrides)) delete overrides[k];
  persist();
}

export function isCueDefault(id) {
  return !overrides[id];
}

/** Full effective bank (defaults + overrides) as JSON, for pasting into DEFAULT_BANK. */
export function exportBank() {
  const out = {};
  for (const id of Object.keys(DEFAULT_BANK)) out[id] = getEntry(id);
  for (const id of Object.keys(overrides)) if (!out[id]) out[id] = getEntry(id);
  return JSON.stringify(out, null, 2);
}

export function importBank(json) {
  let obj;
  try {
    obj = JSON.parse(json);
  } catch {
    return { ok: false, reason: "Not valid JSON." };
  }
  if (!obj || typeof obj !== "object") return { ok: false, reason: "Expected a JSON object." };
  let applied = 0;
  for (const id in obj) {
    if (!obj[id] || typeof obj[id] !== "object") continue;
    overrides[id] = obj[id];
    applied++;
  }
  persist();
  return { ok: true, applied };
}

/** Cue ids the bank actually has an entry for (catalog order first). */
export function bankedIds() {
  const extra = Object.keys(overrides).filter((id) => !DEFAULT_BANK[id]);
  return [...CUE_IDS.filter((id) => DEFAULT_BANK[id]), ...extra];
}
