// ---------------------------------------------------------------------------
// AUDIO ENGINE — the only module that knows WebAudio exists.
//
// Everything above it (the game, the editor) deals in cue ids; this turns a cue
// into an actual voice: resolve it in the bank, render/fetch its buffer, route
// it through the right bus, pan it by where it happened on screen, and refuse it
// if that cue is already spamming.
//
// GUARDED like localStorage is elsewhere: with no window/AudioContext (node
// tests, SSR) every export is a silent no-op, so importing this from game code
// can never break a headless run.
//
// AUTOPLAY: browsers refuse to start an AudioContext outside a user gesture, so
// nothing is created until `unlock()` runs. `armUnlock()` wires the one-shot
// listeners; main.js and editor.js each call it once at startup.
//
//   audio.armUnlock()
//   audio.setListener(camera.x + canvas.width / 2)   // per frame, for panning
//   audio.play("weapon.fire", { x, y })
// ---------------------------------------------------------------------------

import { config } from "../game/config.js";
import { resolveCue } from "./bank.js";
import { renderSynth } from "./synth.js";
import { busFor, BUSES } from "./cues.js";

// Looked up lazily, NOT captured at module load: capturing made the engine
// depend on import order and made the whole playback path untestable (a test
// can install a mock AudioContext after import this way).
function audioCtor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

let ctx = null;
let master = null;
const busGain = {}; // name -> GainNode
let listenerX = 0; // world x the camera is centred on (for pan + falloff)
let listenerScale = 1; // how wide the viewport is vs the classic one; widens falloff
let blurred = false;
let armed = false;

// cue bookkeeping: id -> { lastAt (ctx seconds), active (live voice count) }
const voices = new Map();
// buffer cache: signature -> AudioBuffer. Rendering is ~1ms but happens once.
const buffers = new Map();
let globalActive = 0;

export function isAvailable() {
  return !!ctx;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---- lifecycle ------------------------------------------------------------

/** Create (or resume) the context. Safe to call repeatedly; must run in a gesture. */
export function unlock() {
  const AC = audioCtor();
  if (!AC) return false;
  if (!ctx) {
    try {
      ctx = new AC();
    } catch {
      ctx = null;
      return false;
    }
    master = ctx.createGain();
    master.connect(ctx.destination);
    for (const name of BUSES) {
      const g = ctx.createGain();
      g.connect(master);
      busGain[name] = g;
    }
    applyVolumes();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return true;
}

/**
 * Arm one-shot listeners that unlock on the player's first interaction. Called
 * once per page; harmless to call again.
 */
export function armUnlock() {
  if (armed || typeof window === "undefined" || !audioCtor()) return;
  armed = true;
  const go = () => {
    unlock();
    if (ctx) for (const ev of ["pointerdown", "keydown", "touchstart"]) window.removeEventListener(ev, go);
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, go);
  window.addEventListener("blur", () => {
    blurred = true;
    applyVolumes();
  });
  window.addEventListener("focus", () => {
    blurred = false;
    applyVolumes();
  });
}

/** Push the live config volumes onto the bus gains. Cheap; called per play. */
function applyVolumes() {
  if (!ctx) return;
  const muted = blurred && config.muteOnBlur;
  master.gain.value = muted ? 0 : clamp(config.masterVolume ?? 0.7, 0, 1);
  if (busGain.sfx) busGain.sfx.gain.value = clamp(config.sfxVolume ?? 1, 0, 1);
  if (busGain.ui) busGain.ui.gain.value = clamp(config.uiVolume ?? 0.8, 0, 1);
  if (busGain.music) busGain.music.gain.value = clamp(config.musicVolume ?? 0.6, 0, 1);
}

/**
 * Where the camera is looking, in world px. Sounds pan/fade relative to this.
 * `rangeScale` stretches the audible range with the viewport (1 = the classic
 * 960px-wide view), so zooming out doesn't leave the screen edges silent.
 */
export function setListener(x, rangeScale = 1) {
  listenerX = Number(x) || 0;
  const s = Number(rangeScale);
  listenerScale = Number.isFinite(s) && s > 0 ? s : 1;
}

export function stopAll() {
  voices.clear();
  globalActive = 0;
  if (!ctx) return;
  // Snap every bus silent for a frame rather than tracking individual sources;
  // voices are all < 1s, so they die on their own immediately after.
  for (const name of BUSES) if (busGain[name]) busGain[name].gain.value = 0;
  setTimeout(applyVolumes, 60);
}

// ---- buffers --------------------------------------------------------------

function bufferFor(entry) {
  // Slice 4 will prefer entry.src (a committed clip) and fall back to synth.
  if (!entry.synth) return null;
  const sig = JSON.stringify(entry.synth);
  let buf = buffers.get(sig);
  if (buf) return buf;
  const data = renderSynth(entry.synth, ctx.sampleRate);
  buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buf.getChannelData(0).set(data);
  buffers.set(sig, buf);
  return buf;
}

/** Drop cached buffers so edited synth params are heard on the next play. */
export function invalidateBuffers() {
  buffers.clear();
}

// ---- playback -------------------------------------------------------------

/**
 * Play a cue.
 * @param {string} id    cue id; resolves up the dots via the bank
 * @param {object} opts  { x, y, gain, pitch, bus, force }
 *   x        world x of the event — drives pan + distance falloff (omit = 2D)
 *   gain     extra multiplier on top of the entry's own trim
 *   pitch    playback rate multiplier (before the entry's random jitter)
 *   bus      override the cue catalog's bus
 *   force    ignore cooldown + voice caps (the editor's audition button)
 * @returns {boolean} whether a voice actually started
 */
export function play(id, opts = {}) {
  // Bring the context up ourselves rather than trusting armUnlock's listener to
  // have fired. Two real failure modes this closes:
  //   · a first sound requested from a gesture armUnlock never saw — that path
  //     used to go silent FOREVER while the editor's audition() (which always
  //     called unlock()) worked fine, which is exactly how this surfaced;
  //   · Chrome auto-suspends an AudioContext when a tab is backgrounded, and
  //     nothing was ever asking it to resume, so play stayed dead afterwards.
  // unlock() is cheap once the context exists (a state check).
  if (!unlock()) return false;
  if (ctx.state === "closed") return false;
  const hit = resolveCue(id);
  if (!hit) return false;
  const { entry } = hit;
  const now = ctx.currentTime;
  const rec = voices.get(hit.id) || { lastAt: -Infinity, active: 0 };

  if (!opts.force) {
    if (entry.cooldown > 0 && now - rec.lastAt < entry.cooldown) return false;
    if (rec.active >= entry.maxVoices) return false;
    if (globalActive >= (config.audioMaxVoices ?? 24)) return false;
  }

  const buf = bufferFor(entry);
  if (!buf) return false;

  // Distance falloff + stereo pan from where it happened relative to the camera.
  let vol = entry.gain * (opts.gain ?? 1);
  let pan = 0;
  if (opts.x !== undefined && opts.x !== null) {
    const dx = opts.x - listenerX;
    const range = Math.max(1, (config.audioFalloff ?? 900) * listenerScale);
    vol *= clamp(1 - Math.abs(dx) / range, 0, 1);
    if (vol <= 0.001) return false; // too far off screen to bother with a voice
    pan = clamp(dx / range, -1, 1) * clamp(config.audioPan ?? 0.7, 0, 1);
  }

  applyVolumes();

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const jitter = entry.pitchJitter ? 1 + (Math.random() * 2 - 1) * entry.pitchJitter : 1;
  src.playbackRate.value = clamp((opts.pitch ?? 1) * jitter, 0.25, 4);

  const g = ctx.createGain();
  g.gain.value = clamp(vol, 0, 4);

  const busName = opts.bus && BUSES.includes(opts.bus) ? opts.bus : busFor(hit.id);
  const bus = busGain[busName] || busGain.sfx;

  // StereoPanner is absent on older Safari; skip panning rather than fail.
  let tail = g;
  if (pan !== 0 && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    tail = p;
  }
  src.connect(g);
  tail.connect(bus);

  rec.lastAt = now;
  rec.active++;
  globalActive++;
  voices.set(hit.id, rec);
  src.onended = () => {
    rec.active = Math.max(0, rec.active - 1);
    globalActive = Math.max(0, globalActive - 1);
    try {
      src.disconnect();
      g.disconnect();
      if (tail !== g) tail.disconnect();
    } catch {
      /* already torn down */
    }
  };
  src.start();
  return true;
}

/**
 * Play an ad-hoc entry that may not be in the bank yet — the editor's ▶ audition
 * while dragging a slider. Bypasses cooldown and caps by design.
 */
export function audition(entry) {
  if (!unlock()) return false;
  if (!entry || !entry.synth) return false;
  const buf = bufferFor(entry);
  if (!buf) return false;
  applyVolumes();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = clamp(entry.gain ?? 1, 0, 4);
  src.connect(g);
  g.connect(busGain.ui || master);
  src.onended = () => {
    try {
      src.disconnect();
      g.disconnect();
    } catch {
      /* already torn down */
    }
  };
  src.start();
  return true;
}

// A namespace object so call sites read as `audio.play(...)`, and so passing the
// whole engine to a scene stays one import.
export const audio = {
  isAvailable, unlock, armUnlock, setListener, play, audition, stopAll, invalidateBuffers,
};
