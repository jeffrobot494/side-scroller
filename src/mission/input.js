// Input for the action layer. Folds three sources into one logical action state
// (held + edge-triggered): remappable keyboard and gamepad (both via
// controlmap.js — buttons + axes), and mouse (position for aim + left button
// for fire). The mission scene owns an instance and enables/disables it on
// enter/exit so handling never leaks into the hub DOM.
//
// TWO HALVES, and the line between them is the whole of J4
// (tech/multiplayer-missions.md). Above `sample()` is the DEVICE: window
// handlers and a gamepad poll write `actions`/`pressed`/`padActions`/`mouse`/
// `aimStick` whenever the browser says so, at a rate nothing in the game
// controls. Below it is the SAMPLE: one latched, frozen copy of all three
// sources, taken once per SIMULATION STEP, which is what `isDown`,
// `justPressed` and `aimSource` answer from. A mission is then a function of
// its input trace rather than of how many steps happened to fall inside a
// rendered frame — the same reason the golden's scripted stand-in advances per
// step and not per frame.
//
// The contract is the caller's: whoever steps a mission takes one sample per
// step, before `update()`. `Mission._frame` does it inside its accumulator
// loop; a headless driver does it in its own.

import { keyBindings, padBindings } from "../game/controlmap.js";
import { config } from "../game/config.js";

// One input frame: what all three sources said at the instant it was taken.
// `held` and `pressed` are the folded keyboard+gamepad sets; `stick` and
// `mouse` carry their own active flags because a source that is not reporting
// is not the same as one reporting zero.
function blankSample() {
  return {
    held: {}, pressed: {},
    mouse: { x: 0, y: 0, active: false },
    stick: { x: 0, y: 0, active: false },
    frame: 0,
  };
}

export class MissionInput {
  constructor() {
    this.actions = {}; // keyboard held
    this.pressed = {}; // keyboard edge: pending presses, consumed by sample()
    this.padActions = {}; // gamepad held (refreshed each pollGamepad)
    this.padPressed = {}; // gamepad edge
    this._padPrev = {}; // previous poll's pad button held state (for edges)
    this.mouse = { x: 0, y: 0, active: false }; // canvas-local cursor
    this.aimStick = { x: 0, y: 0, active: false }; // right-stick unit-ish vector
    this.frame = 0; // samples taken: the step index of the input, not of a rAF
    this._sample = blankSample(); // reads before the first sample see nothing
    this._enabled = false;
    this._canvas = null;
    this._diag = {}; // one-shot gamepad diagnostics, keyed by message (see _padLog)
    this._onDown = (e) => this._set(e, true);
    this._onUp = (e) => this._set(e, false);
    this._onMove = (e) => this._trackMouse(e);
    this._onMouseDown = (e) => this._mouseButton(e, true);
    this._onMouseUp = (e) => this._mouseButton(e, false);
    this._onPadConnect = (e) => this._padEvent(e, true);
    this._onPadDisconnect = (e) => this._padEvent(e, false);
  }

  // Per-mission state, and the ONLY half of enable() a host-free mission wants
  // (tech/multiplayer-missions.md, J6). A mission that binds no device still
  // numbers its input frames from its own start, because `frame` is the step
  // index J4 defined and a server stepping a scene has steps like anyone else.
  reset() {
    this._diag = {}; // report the pad situation once per mission, not once per page
    this.frame = 0; // a mission's input frames are numbered from its own start
    this._sample = blankSample();
  }

  // `canvas` is optional: pass it to enable mouse aim + click-to-fire relative
  // to that canvas. Without it, keyboard + gamepad still work.
  //
  // This is the DEVICE half, and it is the half that needs a browser. Nothing
  // below `sample()` does, which is what lets a host-free mission hold a
  // MissionInput it never enables and read blank frames off it until something
  // injects them (J7).
  enable(canvas) {
    if (this._enabled) return;
    window.addEventListener("keydown", this._onDown);
    window.addEventListener("keyup", this._onUp);
    window.addEventListener("gamepadconnected", this._onPadConnect);
    window.addEventListener("gamepaddisconnected", this._onPadDisconnect);
    this.reset();
    this._canvas = canvas || null;
    if (this._canvas && this._canvas.addEventListener) {
      this._canvas.addEventListener("mousemove", this._onMove);
      this._canvas.addEventListener("mousedown", this._onMouseDown);
      window.addEventListener("mouseup", this._onMouseUp);
    }
    this._enabled = true;
  }

  disable() {
    // Symmetric with enable()'s guard, and load-bearing for J6: an input that
    // never bound a device must be releasable without one, because `stop()`
    // calls this unconditionally and a host-free mission has no `window` to
    // remove a listener from.
    if (!this._enabled) return;
    window.removeEventListener("keydown", this._onDown);
    window.removeEventListener("keyup", this._onUp);
    window.removeEventListener("gamepadconnected", this._onPadConnect);
    window.removeEventListener("gamepaddisconnected", this._onPadDisconnect);
    if (this._canvas && this._canvas.removeEventListener) {
      this._canvas.removeEventListener("mousemove", this._onMove);
      this._canvas.removeEventListener("mousedown", this._onMouseDown);
      window.removeEventListener("mouseup", this._onMouseUp);
    }
    this._canvas = null;
    this.actions = {};
    this.pressed = {};
    this.padActions = {};
    this.padPressed = {};
    this._padPrev = {};
    this.mouse.active = false;
    this.aimStick.active = false;
    this._sample = blankSample(); // or a held key survives the mission it was in
    this._enabled = false;
  }

  _set(e, down) {
    const action = keyBindings[e.code];
    if (!action) return;
    e.preventDefault();
    if (down && !this.actions[action]) this.pressed[action] = true;
    this.actions[action] = down;
  }

  _trackMouse(e) {
    const rect = this._canvas.getBoundingClientRect ? this._canvas.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 };
    // Map CSS-pixel cursor to the canvas's internal pixel space (canvas may be
    // scaled by CSS), so aim math lines up with drawn coordinates.
    const sx = this._canvas.width / (rect.width || this._canvas.width);
    const sy = this._canvas.height / (rect.height || this._canvas.height);
    this.mouse.x = (e.clientX - rect.left) * sx;
    this.mouse.y = (e.clientY - rect.top) * sy;
    this.mouse.active = true;
  }

  _mouseButton(e, down) {
    if (e.button !== 0) return; // left button = fire
    if (down && !this.actions.fire) this.pressed.fire = true;
    this.actions.fire = down;
  }

  // Gamepad silence has four causes that look IDENTICAL from inside the game,
  // because the poll below no-ops for all four: no Gamepad API (it is
  // secure-context only, so a LAN http:// origin has none), no pad enumerated
  // (a connected pad stays hidden until the focused page sees a button press —
  // and an upstream layer such as Steam Input's desktop layout or a pad in
  // mouse mode consumes the input so that press never arrives), a pad on a
  // non-standard mapping whose buttons are not the indices controlmap.js binds,
  // and a pad that is merely idle. Say which, once each, instead of returning.
  //
  // Only while enabled, and once per message per enable(): a poll on a disabled
  // instance is a test or the Firing Room's auto mode, neither of which has a
  // player wondering why the stick is dead.
  _padLog(msg) {
    if (!this._enabled || this._diag[msg]) return;
    // Pages only. Headless suites mount tools that enable() a real MissionInput
    // (the Firing Room does), and node has no Gamepad API either — so without
    // this the bar reports the missing API once per run, which is true and
    // useless. `isSecureContext` is the cheapest thing that exists in a browsing
    // context and not under node, and it is the very fact the first message is
    // about.
    if (typeof isSecureContext !== "boolean") return;
    this._diag[msg] = true;
    if (typeof console !== "undefined") console.log(`[gamepad] ${msg}`);
  }

  // A connect/disconnect changes the answer, so clear the ledger and let the
  // next poll re-report from scratch.
  _padEvent(e, connected) {
    const g = e && e.gamepad;
    if (!g) return;
    this._diag = {};
    this._padLog(`${connected ? "connected" : "disconnected"}: index ${g.index}, "${g.id}", mapping "${g.mapping}"`);
  }

  // Read the pad into the device half: folds button presses into pad held/edge
  // state and reads the sticks. No-op when no Gamepad API / no pad connected.
  // Called by sample(), i.e. once per simulation step, and nowhere else in the
  // game — it is public because `test/controls.test.mjs` asks the pad's own
  // questions (the four ways it can be dead) without a sample in the way.
  pollGamepad() {
    this.padPressed = {};
    if (typeof navigator === "undefined" || !navigator.getGamepads) {
      this._padLog("navigator.getGamepads() is unavailable — the Gamepad API is secure-context only (https:// or localhost).");
      return;
    }
    const pads = navigator.getGamepads();
    let pad = null;
    for (const p of pads || []) if (p) { pad = p; break; }
    if (!pad) {
      this._padLog("no pad enumerated. A connected pad stays hidden until the focused page sees a button press; if pressing one changes nothing, something upstream (Steam Input's desktop layout, a pad in mouse/keyboard mode) is taking the input before the browser does.");
      this._padPrev = {};
      this.padActions = {};
      this.aimStick.active = false;
      return;
    }
    this._padLog(`polling index ${pad.index}, "${pad.id}", mapping "${pad.mapping}"`);
    if (pad.mapping !== "standard")
      this._padLog(`mapping is not "standard" — controlmap.js binds standard indices (dpad = buttons 12-15), so this pad's buttons may sit elsewhere or on a hat axis.`);

    const held = {};
    for (const [idx, action] of Object.entries(padBindings.buttons)) {
      const btn = pad.buttons[idx];
      const on = !!(btn && (btn.pressed || btn.value > 0.5));
      if (on) held[action] = true;
    }

    const dz = config.padDeadzone ?? 0.25;
    const mx = pad.axes[padBindings.moveAxis] || 0;
    if (mx > dz) held.right = true;
    else if (mx < -dz) held.left = true;

    // Edge detection from the previous poll's held set.
    for (const action in held) if (!this._padPrev[action]) this.padPressed[action] = true;
    this._padPrev = held;
    this.padActions = held;

    // Right stick → aim vector (past the deadzone).
    const ax = pad.axes[padBindings.aimAxisX] || 0;
    const ay = pad.axes[padBindings.aimAxisY] || 0;
    if (Math.hypot(ax, ay) >= dz) {
      this.aimStick.x = ax;
      this.aimStick.y = ay;
      this.aimStick.active = true;
    } else {
      this.aimStick.active = false;
    }
  }

  // ---- the sample ---------------------------------------------------------

  // Latch the device into one input frame and hand it the next step index.
  // Called ONCE PER SIMULATION STEP, before update(), by whoever is stepping —
  // never once per rendered frame, which is the bug J4 exists to remove: the
  // sim steps a variable number of times per frame, so per-frame sampling gave
  // the first step of a frame a press and the rest of them silence.
  //
  // The gamepad is polled here rather than beside the render, so all three
  // sources speak for the same instant. On a page rendering faster than 60Hz
  // that drops the pad's poll rate to the step rate; on one rendering slower it
  // raises it, and the repeat polls inside one frame see identical hardware
  // state, so an edge still fires exactly once.
  sample() {
    this.pollGamepad();
    this._sample = {
      // Pad last: a held pad button must win over a keyboard key reported up.
      held: { ...this.actions, ...this.padActions },
      pressed: { ...this.pressed, ...this.padPressed },
      mouse: { x: this.mouse.x, y: this.mouse.y, active: this.mouse.active },
      stick: { x: this.aimStick.x, y: this.aimStick.y, active: this.aimStick.active },
      frame: ++this.frame,
    };
    // An edge belongs to the step that sampled it. Presses that arrived while
    // no step ran are latched here (nothing is lost between frames); presses
    // this step never read are dropped, or one tap would re-fire every step
    // until something happened to consume it.
    this.pressed = {};
    return this._sample;
  }

  isDown(a) {
    return this._sample.held[a] === true;
  }

  // True once per physical press (keyboard or gamepad), within the step that
  // sampled it; clears itself so two call sites cannot both claim one press.
  justPressed(a) {
    if (this._sample.pressed[a]) {
      this._sample.pressed[a] = false;
      return true;
    }
    return false;
  }

  // Resolve the sampled manual-aim source for the given aim `mode`. Returns
  // { type:"stick"|"mouse", x, y } or null (no manual aim available). For
  // "stick" x/y is a direction; for "mouse" x/y is a canvas-space point the
  // caller turns into a direction from the muzzle.
  aimSource(mode) {
    const { mouse, stick } = this._sample;
    if (mode === "gamepad" || (mode === "auto" && stick.active)) {
      return stick.active ? { type: "stick", x: stick.x, y: stick.y } : null;
    }
    if (mode === "mouse" || mode === "auto") {
      return mouse.active ? { type: "mouse", x: mouse.x, y: mouse.y } : null;
    }
    return null;
  }
}
