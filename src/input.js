// Tracks which game actions are currently held. Maps several physical keys to
// each logical action so both arrow keys and WASD work.

const KEY_MAP = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "jump",
  KeyW: "jump",
  Space: "jump",
};

export class Input {
  constructor() {
    /** @type {Record<string, boolean>} */
    this.actions = { left: false, right: false, jump: false };

    window.addEventListener("keydown", (e) => this._set(e, true));
    window.addEventListener("keyup", (e) => this._set(e, false));
  }

  _set(e, pressed) {
    const action = KEY_MAP[e.code];
    if (action) {
      this.actions[action] = pressed;
      e.preventDefault(); // stop the page from scrolling on Space/arrows
    }
  }

  isDown(action) {
    return this.actions[action] === true;
  }
}
