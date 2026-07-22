// ---------------------------------------------------------------------------
// CONTROL MAP — remappable key bindings + fixed gamepad defaults.
//
// The single source of truth for "which physical input triggers which logical
// action". Mirrors config.js: a live singleton every input consumer reads, with
// overrides persisted to localStorage (guarded, so node imports never throw).
// The editor's Controls tool rebinds keys through setKeyBinding()/resetKeys();
// the game and Firing Room read `keyBindings` live so a remap applies without a
// reload. Gamepad bindings are fixed this pass (sensible standard-mapping
// defaults) — DEFAULT_PAD is data so it's easy to make remappable later.
// ---------------------------------------------------------------------------

// Logical actions the action layer understands. `reload` is new (magazine/reload).
export const ACTIONS = ["left", "right", "jump", "crouch", "aimUp", "fire", "swap", "reload"];

// Human labels for the remap UI.
export const ACTION_LABELS = {
  left: "Move left",
  right: "Move right",
  jump: "Jump",
  crouch: "Crouch",
  aimUp: "Aim up (keyboard aim)",
  fire: "Fire",
  swap: "Swap soldier",
  reload: "Reload",
};

// Default physical-key → action map (KeyboardEvent.code). Two keys may share an
// action (e.g. WASD + arrows). This is the exact legacy KEY_MAP plus KeyR.
export const DEFAULT_KEYS = {
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
  KeyR: "reload",
};

// Fixed gamepad map (W3C "standard" mapping). Buttons fold into the same held +
// edge action state; the left stick / dpad drive move, the right stick aims.
export const DEFAULT_PAD = {
  buttons: {
    0: "jump", // A
    1: "crouch", // B
    2: "reload", // X
    3: "swap", // Y
    7: "fire", // right trigger
    12: "aimUp", // dpad up
    13: "crouch", // dpad down
    14: "left", // dpad left
    15: "right", // dpad right
  },
  moveAxis: 0, // left stick X → left/right
  aimAxisX: 2, // right stick X → aim
  aimAxisY: 3, // right stick Y → aim
};

// Read-only human summary of a gamepad button for the tool (which button drives
// each action). Derived from DEFAULT_PAD so it can't drift.
export const PAD_LABELS = (() => {
  const names = { 0: "A", 1: "B", 2: "X", 3: "Y", 7: "R-Trigger", 12: "D-pad ↑", 13: "D-pad ↓", 14: "D-pad ←", 15: "D-pad →" };
  const byAction = {};
  for (const [btn, action] of Object.entries(DEFAULT_PAD.buttons)) {
    (byAction[action] || (byAction[action] = [])).push(names[btn] || `Btn ${btn}`);
  }
  byAction.left = (byAction.left || []).concat("L-Stick ←");
  byAction.right = (byAction.right || []).concat("L-Stick →");
  return byAction;
})();

const STORAGE_KEY = "sidescroller.controls.v1";

// ---- guarded persistence --------------------------------------------------

function readStore() {
  try {
    if (typeof localStorage === "undefined") return null;
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStore(obj) {
  try {
    if (typeof localStorage === "undefined") return;
    if (obj) localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / unavailable — rebinds just won't persist */
  }
}

function load() {
  const saved = readStore();
  // Only accept saved codes that map to a real action; fall back to defaults.
  if (saved && typeof saved === "object") {
    const clean = {};
    for (const code in saved) if (ACTIONS.includes(saved[code])) clean[code] = saved[code];
    if (Object.keys(clean).length) return clean;
  }
  return { ...DEFAULT_KEYS };
}

// The live map every input consumer reads. Mutated in place so importers see
// changes without re-importing.
export const keyBindings = load();

function persist() {
  // Persist the full map only when it differs from the default; otherwise clear.
  if (JSON.stringify(keyBindings) === JSON.stringify(DEFAULT_KEYS)) writeStore(null);
  else writeStore(keyBindings);
}

// Codes currently bound to `action`.
export function bindingsForAction(action) {
  return Object.keys(keyBindings).filter((code) => keyBindings[code] === action);
}

// Rebind: make `code` the (single) key for `action`. Clears the action's other
// keys and unbinds `code` from whatever it drove before, so the result is
// predictable in the tool.
export function setKeyBinding(code, action) {
  if (!ACTIONS.includes(action)) return;
  for (const c of Object.keys(keyBindings)) {
    if (keyBindings[c] === action || c === code) delete keyBindings[c];
  }
  keyBindings[code] = action;
  persist();
}

export function resetKeys() {
  for (const c of Object.keys(keyBindings)) delete keyBindings[c];
  Object.assign(keyBindings, DEFAULT_KEYS);
  persist();
}
