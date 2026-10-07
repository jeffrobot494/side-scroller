// ---------------------------------------------------------------------------
// THE TAKE RUNNER (tech/trailer.md, T0 + T3).
//
// Runs one mission segment the way test/mission-golden.test.mjs runs the
// golden: the REAL Mission, started, its own loop set aside, and every frame
// after that stepped here at a fixed step off the segment's input trace.
// DOM-free apart from the canvases it is handed; the suite drives it with the
// harness canvas and no view.
//
// Frames are OUTPUT frames, numbered from the segment's first captured frame.
// Pre-roll frames come before it and are numbered negative. A beat is half a
// second, 30 frames, and every time in a segment is in beats from its start.
//
// STAGING (T3), all of it data on the segment:
//   cues     [{ b, kind, target, ... }] — what happens on a beat. Kinds:
//              kill   the target dies to the next round that reaches it: from
//                     the beat its health is 1 (it is the game's own round and
//                     the game's own death). Rounds stream into a target the
//                     squad is firing at, so that is a frame or two.
//              hold   the root's brain stops choosing (until `until`)
//              guard  the target and every part of it keep full health (until
//                     `until`) — so the squad's fire cannot end a shot early
//              pin    the target keeps its x, or is moved to `x` (a number or
//                     a function of the scene) and kept there (until `until`)
//              set    { x, y, vx, vy }, any of them (a number or a function
//                     of the scene), once, after that frame's update
//              (a kill a round never reached is forced at +15 frames and
//              marked `forced`, which the suite fails)
//   targets  { soldier: id } | { root: i } | { root: i, part: id } |
//            { squad: true } | { round: "player" | "enemy" } (the newest)
//   preroll  { root, kind, id?, part?, b, lead? } — step uncaptured until the
//            root's motion record (src/mission/enemyspec/motion.js) shows
//            that event `lead` seconds before beat `b`. Or { frames: n }.
//   speed    simulated seconds per output second (shot 7's ¼ is 0.25)
// ---------------------------------------------------------------------------

import { Mission } from "../mission/mission.js";
import { findEntity } from "../mission/enemyspec/runtime.js";

export const STEP = 1 / 60;
export const FRAMES_PER_BEAT = 30;
export const frameOfBeat = (b) => Math.round(b * FRAMES_PER_BEAT);
const GUARD = 50;

// The trailer's input stand-in: the shape of test/mission-trace.mjs's
// scriptedInput, fed from a segment's trace (frame, mission → { held, pressed,
// aim }) instead of the golden's. `aimSource` answers a stick whatever the aim
// mode is, so a take is independent of config.aimMode and the camera. Frames
// before the first captured one (pre-roll) hold nothing.
export function traceInput(trace, first = 0, mission = null) {
  let held = {};
  let edges = {};
  let aim = null;
  return {
    count: 0,
    sample() {
      const f = this.count + first;
      const s = (f >= 0 && trace(f, mission)) || {};
      held = s.held || {};
      edges = { ...(s.pressed || {}) };
      aim = s.aim || null;
      this.count++;
    },
    isDown: (a) => held[a] === true,
    justPressed(a) {
      if (!edges[a]) return false;
      edges[a] = false;
      return true;
    },
    aimSource: () => (aim ? { type: "stick", x: aim.x, y: aim.y } : null),
    pollGamepad() {},
    enable() {},
    disable() {},
    reset() { this.count = 0; },
  };
}

// ---- targets ------------------------------------------------------------------

export function resolveTarget(scene, t) {
  if (!t) return [];
  if (t.squad) return scene.soldiers.slice();
  if (t.round) {
    // The newest round in flight from that side ("player" | "enemy").
    for (let i = scene.projectiles.length - 1; i >= 0; i--)
      if (scene.projectiles[i].team === t.round && !scene.projectiles[i].dead) return [scene.projectiles[i]];
    return [];
  }
  if (t.soldier) return scene.soldiers.filter((s) => s.id === t.soldier);
  const root = scene.specRoots[t.root];
  if (!root) return [];
  if (t.part) {
    const e = findEntity(root, t.part);
    return e ? [e] : [];
  }
  return [root];
}

function tree(e, out = []) {
  out.push(e);
  for (const c of e.children || []) tree(c, out);
  return out;
}


// ---- one run --------------------------------------------------------------------

// Build the mission for `seg` with `preroll` uncaptured frames, stepped to the
// first captured frame. `canvas`/`view` as startTake. Returns the run; its
// `frame()` steps one captured frame.
function run(seg, preroll, { canvas = null, view = null, size = null, onEvent = null, onSound = null, cuesUntil = Infinity } = {}) {
  const m = new Mission(canvas, () => {});
  let f = -preroll;
  let pose = null; // the trailer camera's pose this frame, if it has one
  if (view) {
    m.setView(view);
    view.setCamera(seg.camera ? (mm) => (pose = seg.camera(f, mm)) : null);
  }
  m.start(seg.mission, seg.level, seg.squad);
  // Every cue the game asks for on a captured frame, with where the listener
  // was (src/trailer/mix.js mixes them). The game's own funnel still runs.
  if (onSound) {
    const sound = m.scene.sound;
    m.scene.sound = (cue, o = {}) => {
      if (f >= 0) onSound({ f, cue, x: o.x, gain: o.gain, ...listener() });
      return sound(cue, o);
    };
  }
  // Where the sound is heard from: the middle of what the frame shows, its
  // range widening with the width shown — the game's rule (_updateCamera),
  // applied to the trailer's camera when it has one.
  function listener() {
    if (pose) {
      const { position: p, target: t } = pose;
      const d = Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z);
      const shown = 2 * d * Math.tan((pose.fov * Math.PI) / 360) * (16 / 9);
      return { lx: t.x, ls: Math.max(1, shown / 960) };
    }
    const viewW = m.canvas ? m.canvas.width / m._zoom() : 960;
    return { lx: m.camera.x + viewW / 2, ls: viewW / 960 };
  }
  m.running = false;
  m.input = traceInput(seg.trace, -preroll, m);
  if (size && canvas) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  const speed = seg.speed || 1;
  const cues = (seg.cues || [])
    .map((c) => ({ ...c, at: frameOfBeat(c.b), end: c.until === undefined ? Infinity : frameOfBeat(c.until) }))
    .filter((c) => c.at <= cuesUntil);
  const held = new Map(); // root → the brain state it was holding
  const pinned = new Map(); // entity → x
  const deaths = []; // [frame, label] for every cue target that died

  function stage(when) {
    const scene = m.scene;
    for (const c of cues) {
      const live = f >= c.at && f < c.end;
      const targets = resolveTarget(scene, c.target);
      if (c.kind === "hold") {
        for (const r of targets) {
          const bs = r.brainState;
          if (live && !held.has(r)) { held.set(r, bs.current); bs.current = "__held"; }
          if (!live && held.has(r) && f >= c.end) { bs.current = held.get(r); held.delete(r); }
        }
      } else if (c.kind === "guard" && when === "before" && (live || f === c.end)) {
        // A root is guarded with every part on it; a named part alone. Full
        // health is not enough — four soldiers can put more than that into
        // one frame — so a guarded target holds GUARD times it, and drops
        // back to full the frame the guard ends.
        for (const t of targets) for (const e of t.kind === "spec" && !c.target.part ? tree(t) : [t])
          if (e.alive && e.maxHealth != null) e.health = live ? e.maxHealth * GUARD : Math.min(e.health, e.maxHealth);
      } else if (c.kind === "pin" && live) {
        // Across only: gravity still lands a body pinned as it spawns, and a
        // soldier in the air can neither duck nor fall.
        for (const e of targets) {
          if (!pinned.has(e)) pinned.set(e, c.x === undefined ? e.x : typeof c.x === "function" ? c.x(scene) : c.x);
          e.x = pinned.get(e);
          e.vx = 0;
        }
      } else if (c.kind === "set" && f === c.at && when === "after") {
        // After the frame's update, so what that update made (a round just
        // fired) is there to set. A value may be a function of the scene.
        for (const e of targets) for (const k of ["x", "y", "vx", "vy"])
          if (c[k] !== undefined) e[k] = typeof c[k] === "function" ? c[k](scene) : c[k];
        if (targets.length) c.done = f;
      } else if (c.kind === "kill" && when === "before" && f >= c.at) {
        for (const e of targets) {
          if (!e.alive) continue;
          e.health = Math.min(e.health, 1);
          // A failsafe, never the plan: a target nothing reaches in half a
          // second dies anyway, and the suite says so.
          if (f >= c.at + 15) { c.forced = true; e.health = 0; (e.kind === "spec" ? m._ctx.kill : (t) => m._damage(t, 1, null))(e); }
        }
      }
    }
  }

  function watchDeaths() {
    for (const c of cues) {
      if (c.kind !== "kill" || c.dead !== undefined) continue;
      const t = resolveTarget(m.scene, c.target);
      if (t.length && t.every((e) => !e.alive)) { c.dead = f; deaths.push([f, c]); }
    }
  }

  function step(render) {
    stage("before");
    m.sampleInputs();
    m.update(STEP * speed);
    stage("after");
    watchDeaths();
    m.updateMotion();
    if (onEvent) for (const r of m.scene.specRoots) {
      const rec = m.motion.get(r);
      if (rec) for (const ev of rec.events) onEvent(f, m.scene.specRoots.indexOf(r), ev);
    }
    if (render) m.render();
    f++;
  }

  while (f < 0) step(false);
  return {
    mission: m,
    deaths,
    cues,
    get frameIndex() { return f; },
    frame() { step(true); },
    advance() { step(false); },
  };
}

function prerollMatch(p) {
  return (ri, ev) => ri === p.root && ev.kind === p.kind &&
    (p.id === undefined || ev.id === p.id) && (p.part === undefined || ev.part === p.part);
}

// The frame the pre-rolled event must land on, in captured frames.
export function prerollTarget(seg) {
  const p = seg.preroll;
  return frameOfBeat(p.b) - Math.round((p.lead || 0) * 60 / (seg.speed || 1));
}

// The pre-roll that puts `seg.preroll`'s event on its beat: run, see where it
// landed, shift by the difference, until it stays put. The trace and the cues
// are numbered from the captured frames, so a shift can move the event; the
// loop runs until it does not. Throws if it cannot.
export function findPreroll(seg) {
  const p = seg.preroll;
  if (!p) return 0;
  if (p.frames !== undefined) return p.frames;
  const want = prerollTarget(seg);
  const matches = prerollMatch(p);
  let pre = p.min || 0;
  for (let i = 0; i < 8; i++) {
    // Every occurrence, in this run's frame numbers (captured frames from 0).
    const seen = [];
    // Only the cues that start by the event's frame: one that starts after it
    // (holding the brain once it has fired) cannot move it, and would stop
    // the search finding it at all.
    const r = run(seg, pre, { cuesUntil: want, onEvent: (f, ri, ev) => { if (matches(ri, ev)) seen.push(f); } });
    while (r.frameIndex < want + 60 * 20 && !seen.some((f) => f >= want)) r.advance();
    // The first one at or after the beat: pre-roll can only delay the
    // capture, never the event.
    const at = seen.find((f) => f >= want);
    if (at === undefined) throw new Error(`trailer: preroll event never happened (${JSON.stringify(p)})`);
    if (at === want) return pre;
    pre += at - want;
  }
  throw new Error(`trailer: preroll did not settle (${JSON.stringify(p)})`);
}

// Start a segment for capture. `canvas` is the mission's flat canvas (the HUD
// layer, never captured); `view` is the 3D view, installed BEFORE start() so
// begin() builds this level; `size` is the capture size, set after start()
// because start() sizes the backing store from the config preset.
//
// `seg.camera`, if set, is (frame, mission) → a pose for the view's camera
// override (src/trailer/tracks.js), or null for the play camera that frame.
//
// Returns { mission, frame(), deaths, cues, preroll } — frame() is one OUTPUT
// frame: cues, one sample, one update of STEP × speed, the motion records,
// one render.
//
// `landed` lists the captured frames the pre-rolled event happened on, for
// the suite.
export function startTake(seg, opts = {}) {
  const preroll = findPreroll(seg);
  const p = seg.preroll;
  const match = p && p.kind ? prerollMatch(p) : null;
  const landed = [];
  const r = run(seg, preroll, {
    ...opts,
    onEvent: (f, ri, ev) => {
      if (match && f >= 0 && match(ri, ev)) landed.push(f);
      if (opts.onEvent) opts.onEvent(f, ri, ev);
    },
  });
  r.preroll = preroll;
  r.landed = landed;
  return r;
}
