// Keyboard for the action layer. Maps physical keys to logical actions and
// exposes edge-triggered "just pressed" for one-shot inputs (swap, jump).
// The mission scene owns an instance and enables/disables it on enter/exit so
// key handling never leaks into the hub DOM.

const KEY_MAP = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "aimUp",
  KeyW: "aimUp",
  ArrowDown: "crouch",
  KeyS: "crouch",
  Space: "jump",
  KeyJ: "fire",
  KeyK: "swap",
  Tab: "swap",
  ShiftLeft: "jump",
};

export class MissionInput {
  constructor() {
    this.actions = {};
    this.pressed = {}; // edge: true for one poll after a fresh keydown
    this._enabled = false;
    this._onDown = (e) => this._set(e, true);
    this._onUp = (e) => this._set(e, false);
  }

  enable() {
    if (this._enabled) return;
    window.addEventListener("keydown", this._onDown);
    window.addEventListener("keyup", this._onUp);
    this._enabled = true;
  }

  disable() {
    window.removeEventListener("keydown", this._onDown);
    window.removeEventListener("keyup", this._onUp);
    this.actions = {};
    this.pressed = {};
    this._enabled = false;
  }

  _set(e, down) {
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    if (down && !this.actions[action]) this.pressed[action] = true;
    this.actions[action] = down;
  }

  isDown(a) {
    return this.actions[a] === true;
  }

  // True once per physical press; clears itself so it can't retrigger.
  justPressed(a) {
    if (this.pressed[a]) {
      this.pressed[a] = false;
      return true;
    }
    return false;
  }
}
