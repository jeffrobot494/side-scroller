// Input for the action layer. Folds three sources into one logical action state
// (held + edge-triggered): remappable keyboard and gamepad (both via
// controlmap.js — buttons + axes; polled each frame), and mouse (position for
// aim + left button for fire). The mission scene owns an instance and enables/
// disables it on enter/exit so handling never leaks into the hub DOM.

import { keyBindings, padBindings } from "../game/controlmap.js";
import { config } from "../game/config.js";

export class MissionInput {
  constructor() {
    this.actions = {}; // keyboard held
    this.pressed = {}; // keyboard edge: true for one poll after a fresh keydown
    this.padActions = {}; // gamepad held (refreshed each pollGamepad)
    this.padPressed = {}; // gamepad edge
    this._padPrev = {}; // previous frame's pad button held state (for edges)
    this.mouse = { x: 0, y: 0, active: false }; // canvas-local cursor
    this.aimStick = { x: 0, y: 0, active: false }; // right-stick unit-ish vector
    this._enabled = false;
    this._canvas = null;
    this._onDown = (e) => this._set(e, true);
    this._onUp = (e) => this._set(e, false);
    this._onMove = (e) => this._trackMouse(e);
    this._onMouseDown = (e) => this._mouseButton(e, true);
    this._onMouseUp = (e) => this._mouseButton(e, false);
  }

  // `canvas` is optional: pass it to enable mouse aim + click-to-fire relative
  // to that canvas. Without it, keyboard + gamepad still work.
  enable(canvas) {
    if (this._enabled) return;
    window.addEventListener("keydown", this._onDown);
    window.addEventListener("keyup", this._onUp);
    this._canvas = canvas || null;
    if (this._canvas && this._canvas.addEventListener) {
      this._canvas.addEventListener("mousemove", this._onMove);
      this._canvas.addEventListener("mousedown", this._onMouseDown);
      window.addEventListener("mouseup", this._onMouseUp);
    }
    this._enabled = true;
  }

  disable() {
    window.removeEventListener("keydown", this._onDown);
    window.removeEventListener("keyup", this._onUp);
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

  // Poll the gamepad once per frame. Folds button presses into pad held/edge
  // state and reads the sticks. No-op when no Gamepad API / no pad connected.
  pollGamepad() {
    this.padPressed = {};
    if (typeof navigator === "undefined" || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad = null;
    for (const p of pads || []) if (p) { pad = p; break; }
    if (!pad) {
      this._padPrev = {};
      this.padActions = {};
      this.aimStick.active = false;
      return;
    }

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

    // Edge detection from the previous frame's held set.
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

  isDown(a) {
    return this.actions[a] === true || this.padActions[a] === true;
  }

  // True once per physical press (keyboard or gamepad); clears itself.
  justPressed(a) {
    if (this.pressed[a] || this.padPressed[a]) {
      this.pressed[a] = false;
      this.padPressed[a] = false;
      return true;
    }
    return false;
  }

  // Resolve the current manual-aim source for the given aim `mode`. Returns
  // { type:"stick"|"mouse", x, y } or null (no manual aim available). For
  // "stick" x/y is a direction; for "mouse" x/y is a canvas-space point the
  // caller turns into a direction from the muzzle.
  aimSource(mode) {
    if (mode === "gamepad" || (mode === "auto" && this.aimStick.active)) {
      return this.aimStick.active ? { type: "stick", x: this.aimStick.x, y: this.aimStick.y } : null;
    }
    if (mode === "mouse" || mode === "auto") {
      return this.mouse.active ? { type: "mouse", x: this.mouse.x, y: this.mouse.y } : null;
    }
    return null;
  }
}
