// ---------------------------------------------------------------------------
// SPACE PROTOTYPE — sound (tech/space-prototype.md). Procedural WebAudio beeps
// made on the fly from the sim's events: no samples, no files. Placed by
// distance and pan from the camera's centre. Silent until the first key or
// click (the browser's autoplay rule), and a silent no-op without WebAudio.
// ---------------------------------------------------------------------------

const HEAR = 1500; // px: nothing further than this is played
const FALLOFF = 650; // px: distance at which a sound is at half level
const MAX_VOICES = 32;

// Per-sound minimum spacing, so a squad of autos is a rattle rather than a wall.
const SPACING = { spark: 0.03, hit: 0.025, fire: 0.02, "fire-enemy": 0.04, reload: 0.05, reloaded: 0.05, hurt: 0.08, step: 0.07 };

export function createAudio() {
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let voices = 0;
  const last = {};
  let thrust = null; // { src, filter, gain }

  function unlock() {
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  const live = () => ctx && ctx.state === "running";

  // One voice: a source through a filter, an envelope and a panner.
  function out(level, pan, dur) {
    if (voices >= MAX_VOICES) return null;
    voices++;
    const g = ctx.createGain();
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      p.pan.value = pan;
      g.connect(p).connect(master);
    } else g.connect(master);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    setTimeout(() => voices--, (dur + 0.05) * 1000);
    return g;
  }

  function tone({ type = "sine", f0, f1 = f0, dur, level, pan = 0, delay = 0 }) {
    const g = out(level, pan, dur + delay);
    if (!g) return;
    const o = ctx.createOscillator();
    const t = ctx.currentTime + delay;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (delay) {
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise({ f0, f1 = f0, q = 1, kind = "bandpass", dur, level, pan = 0 }) {
    const g = out(level, pan, dur);
    if (!g) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    const t = ctx.currentTime;
    f.type = kind;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    src.connect(f).connect(g);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ---- the sounds ------------------------------------------------------------
  const FIRE = {
    bullet: (v, p) => { noise({ f0: 3000, f1: 800, q: 0.8, dur: 0.07, level: v * 0.5, pan: p }); tone({ type: "square", f0: 220, f1: 90, dur: 0.05, level: v * 0.12, pan: p }); },
    pellet: (v, p) => { noise({ f0: 1800, f1: 300, q: 0.6, dur: 0.16, level: v * 0.7, pan: p }); tone({ type: "triangle", f0: 140, f1: 50, dur: 0.12, level: v * 0.3, pan: p }); },
    bolt: (v, p) => tone({ type: "sawtooth", f0: 1400, f1: 260, dur: 0.1, level: v * 0.14, pan: p }),
    orb: (v, p) => tone({ type: "sine", f0: 520, f1: 130, dur: 0.18, level: v * 0.35, pan: p }),
    missile: (v, p) => noise({ f0: 400, f1: 2400, q: 1.5, dur: 0.3, level: v * 0.45, pan: p }),
    wave: (v, p) => noise({ f0: 900, f1: 500, q: 0.7, kind: "lowpass", dur: 0.12, level: v * 0.3, pan: p }),
  };

  function play(ev, v, p) {
    switch (ev.type) {
      case "muzzle": {
        const f = FIRE[ev.shape] || FIRE.bullet;
        // Alien fire: the same shape, pitched and filtered further off.
        f(ev.team === "enemy" ? v * 0.7 : v, p);
        if (ev.team === "enemy") tone({ type: "sine", f0: 900, f1: 600, dur: 0.06, level: v * 0.08, pan: p });
        break;
      }
      case "spark": noise({ f0: 4000, f1: 2500, q: 2, dur: 0.04, level: v * 0.18, pan: p }); break;
      case "hit":
        tone({ type: "triangle", f0: 240, f1: 90, dur: 0.07, level: v * 0.3, pan: p });
        noise({ f0: 1200, f1: 600, q: 1, dur: 0.05, level: v * 0.2, pan: p });
        break;
      case "explode":
        noise({ f0: 1400, f1: 80, q: 0.5, kind: "lowpass", dur: 0.7, level: v * 1.0, pan: p });
        tone({ type: "sine", f0: 110, f1: 35, dur: 0.5, level: v * 0.6, pan: p });
        break;
      case "chain": tone({ type: "square", f0: 1800, f1: 900, dur: 0.08, level: v * 0.1, pan: p }); break;
      case "death":
        if (ev.kind === "soldier") {
          tone({ type: "sawtooth", f0: 300, f1: 60, dur: 0.6, level: v * 0.3, pan: p });
        } else if (ev.enemy !== "mine") {
          tone({ type: "square", f0: 500, f1: 70, dur: 0.3, level: v * 0.18, pan: p });
          noise({ f0: 1500, f1: 200, q: 0.7, dur: 0.3, level: v * 0.4, pan: p });
        } else noise({ f0: 2500, f1: 600, q: 1, dur: 0.12, level: v * 0.3, pan: p });
        break;
      case "dry": tone({ type: "square", f0: 1800, f1: 1700, dur: 0.02, level: v * 0.12, pan: p }); break;
      case "reload":
        noise({ f0: 2200, q: 4, dur: 0.03, level: v * 0.3, pan: p });
        break;
      case "reloaded":
        noise({ f0: 1500, q: 4, dur: 0.04, level: v * 0.4, pan: p });
        tone({ type: "square", f0: 700, f1: 650, dur: 0.03, level: v * 0.08, pan: p });
        break;
      case "hurt": tone({ type: "sine", f0: 180, f1: 70, dur: 0.15, level: v * 0.45, pan: p }); break;
      case "fuse":
        for (let i = 0; i < 3; i++) tone({ type: "square", f0: 1300, dur: 0.05, level: v * 0.15, pan: p, delay: i * 0.1 });
        break;
      case "pickup":
        [523, 659, 784, 1047].forEach((f, i) => tone({ type: "sine", f0: f, dur: 0.18, level: 0.25, delay: i * 0.07 }));
        break;
      // Magnetic boots (tech/space-magboots.md M4): a mag clamp engaging or
      // letting go, a push off, a landing as hard as it was, and steps.
      case "boots":
        if (ev.on) {
          tone({ type: "square", f0: 180, f1: 420, dur: 0.1, level: v * 0.1, pan: p });
          noise({ f0: 2600, q: 5, dur: 0.04, level: v * 0.25, pan: p });
        } else {
          tone({ type: "square", f0: 420, f1: 150, dur: 0.12, level: v * 0.08, pan: p });
        }
        break;
      case "jump": noise({ f0: 700, f1: 200, q: 0.8, kind: "lowpass", dur: 0.12, level: v * 0.3, pan: p }); break;
      case "land": {
        const k = Math.min(1, 0.35 + (ev.speed || 0) / 900);
        tone({ type: "sine", f0: 130, f1: 45, dur: 0.14, level: v * 0.45 * k, pan: p });
        noise({ f0: 1800, f1: 400, q: 2, dur: 0.06, level: v * 0.3 * k, pan: p });
        break;
      }
      case "crash": {
        const k = Math.min(1, (ev.speed || 0) / 1500);
        noise({ f0: 900, f1: 60, q: 0.6, kind: "lowpass", dur: 0.4, level: v * (0.4 + 0.6 * k), pan: p });
        tone({ type: "sine", f0: 90, f1: 30, dur: 0.3, level: v * 0.5 * k, pan: p });
        break;
      }
      case "step": noise({ f0: 2200 + Math.random() * 400, q: 4, dur: 0.035, level: v * 0.14, pan: p }); break;
      case "wave":
        for (let i = 0; i < 2; i++) {
          tone({ type: "square", f0: 440, dur: 0.16, level: 0.1, delay: i * 0.36 });
          tone({ type: "square", f0: 330, dur: 0.16, level: 0.1, delay: i * 0.36 + 0.18 });
        }
        break;
    }
  }

  // Events carry world positions; the listener is the camera's centre, and
  // pan is left-right on the screen, so it turns with the camera's roll.
  function handle(events, lx, ly, roll = 0) {
    const c = Math.cos(roll), sn = Math.sin(roll);
    if (!live()) return;
    const now = ctx.currentTime;
    for (const ev of events) {
      const global = ev.type === "wave" || ev.type === "pickup";
      let v = 1, p = 0;
      if (!global) {
        if (!Number.isFinite(ev.x) || !Number.isFinite(ev.y)) continue; // unplaceable: skip, never throw
        const dx = ev.x - lx, dy = ev.y - ly;
        const d = Math.hypot(dx, dy);
        if (d > HEAR) continue;
        v = 1 / (1 + (d / FALLOFF) ** 2);
        p = Math.max(-1, Math.min(1, (dx * c + dy * sn) / 700));
      }
      const key = ev.type === "muzzle" ? (ev.team === "enemy" ? "fire-enemy" : "fire") : ev.type;
      if (SPACING[key] && now - (last[key] || -1) < SPACING[key]) continue;
      last[key] = now;
      play(ev, v, p);
    }
  }

  // The jetpack: a held noise that swells while the soldier you fly thrusts.
  function setThrust(on) {
    if (!live()) return;
    if (!thrust) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(master);
      src.start();
      thrust = { src, filter, gain, on: false };
    }
    if (thrust.on === on) return;
    thrust.on = on;
    const t = ctx.currentTime;
    thrust.gain.gain.setTargetAtTime(on ? 0.22 : 0, t, on ? 0.04 : 0.08);
    thrust.filter.frequency.setTargetAtTime(on ? 900 : 400, t, 0.06);
  }

  function end(success) {
    if (!live()) return;
    const notes = success ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((f, i) => tone({ type: "triangle", f0: f, dur: 0.28, level: 0.3, delay: i * 0.16 }));
  }

  return { unlock, handle, setThrust, end };
}
