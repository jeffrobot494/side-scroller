// ---------------------------------------------------------------------------
// CONTROL MAP — remappable key bindings + fixed gamepad defaults.
//
// The single source of truth for "which physical input triggers which logical
// action". Mirrors config.js: a live singleton every input consumer reads, with
// overrides persisted to localStorage (guarded, so node imports never throw).
// The editor's Controls tool rebinds keys through setKeyBinding()/resetKeys()
// and the gamepad through setPadButton()/setPadAxis()/resetPad(); the game and
// Firing Room read `keyBindings`/`padBindings` live so a remap applies without a
// reload. DEFAULT_PAD holds the standard-mapping defaults padBindings merges over.
// ---------------------------------------------------------------------------

// Logical actions the action layer understands. `reload` is new (magazine/reload).
// debugGraph/debugPath toggle the mission's nav overlays and are inert unless
// config.debugOverlays is on — they are bound here rather than hardcoded because
// nothing in this game hardcodes a key, and being rebindable is what lets them
// move off a key a player might hit.
export const ACTIONS = ["left", "right", "jump", "crouch", "aimUp", "fire", "swap", "reload", "debugGraph", "debugPath"];

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
  debugGraph: "Debug: nav graph",
  debugPath: "Debug: companion paths",
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
  KeyG: "debugGraph",
  KeyH: "debugPath",
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

// Human names for gamepad buttons / axes (W3C "standard" mapping). Exported so
// the Controls tool can label whatever the live padBindings point at.
const PAD_BUTTON_NAMES = { 0: "A", 1: "B", 2: "X", 3: "Y", 7: "R-Trigger", 12: "D-pad ↑", 13: "D-pad ↓", 14: "D-pad ←", 15: "D-pad →" };
export const AXIS_NAMES = { 0: "L-Stick X", 1: "L-Stick Y", 2: "R-Stick X", 3: "R-Stick Y" };
export function padButtonName(index) {
  return PAD_BUTTON_NAMES[index] || `Btn ${index}`;
}
export function padAxisName(index) {
  return AXIS_NAMES[index] || `Axis ${index}`;
}

const STORAGE_KEY = "sidescroller.controls.v1";
const PAD_STORAGE_KEY = "sidescroller.pad.v1";

// ---- guarded persistence --------------------------------------------------

function readStore(key) {
  try {
    if (typeof localStorage === "undefined") return null;
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeStore(key, obj) {
  try {
    if (typeof localStorage === "undefined") return;
    if (obj) localStorage.setItem(key, JSON.stringify(obj));
    else localStorage.removeItem(key);
  } catch {
    /* private mode / unavailable — rebinds just won't persist */
  }
}

function load() {
  const saved = readStore(STORAGE_KEY);
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
  if (JSON.stringify(keyBindings) === JSON.stringify(DEFAULT_KEYS)) writeStore(STORAGE_KEY, null);
  else writeStore(STORAGE_KEY, keyBindings);
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

// ---- gamepad bindings -----------------------------------------------------
// Mirrors the keyboard side: a live singleton (buttons + axis slots) merged over
// DEFAULT_PAD, persisted to its own storage key. input.js reads it live.

function clonePad(src) {
  return { buttons: { ...src.buttons }, moveAxis: src.moveAxis, aimAxisX: src.aimAxisX, aimAxisY: src.aimAxisY };
}

function loadPad() {
  const pad = clonePad(DEFAULT_PAD);
  const saved = readStore(PAD_STORAGE_KEY);
  if (saved && typeof saved === "object") {
    // Buttons: only accept indices that map to a real action.
    if (saved.buttons && typeof saved.buttons === "object") {
      const clean = {};
      for (const idx in saved.buttons) if (ACTIONS.includes(saved.buttons[idx])) clean[idx] = saved.buttons[idx];
      if (Object.keys(clean).length) pad.buttons = clean;
    }
    // Axis slots: only accept finite numbers.
    for (const slot of ["moveAxis", "aimAxisX", "aimAxisY"]) {
      if (Number.isFinite(saved[slot])) pad[slot] = saved[slot];
    }
  }
  return pad;
}

// The live pad map every input consumer reads. Mutated in place so importers see
// changes without re-importing.
export const padBindings = loadPad();

function persistPad() {
  if (JSON.stringify(padBindings) === JSON.stringify(DEFAULT_PAD)) writeStore(PAD_STORAGE_KEY, null);
  else writeStore(PAD_STORAGE_KEY, padBindings);
}

// Button indices currently bound to `action`.
export function padButtonsForAction(action) {
  return Object.keys(padBindings.buttons).filter((idx) => padBindings.buttons[idx] === action);
}

// Rebind: make button `index` the (single) button for `action` — clears the
// action's other buttons and steals `index` from whatever it drove. Mirrors
// setKeyBinding so the tool behaves predictably.
export function setPadButton(index, action) {
  if (!ACTIONS.includes(action)) return;
  for (const i of Object.keys(padBindings.buttons)) {
    if (padBindings.buttons[i] === action || String(i) === String(index)) delete padBindings.buttons[i];
  }
  padBindings.buttons[index] = action;
  persistPad();
}

// Point an axis slot ("moveAxis" | "aimAxisX" | "aimAxisY") at `axisIndex`.
export function setPadAxis(slot, axisIndex) {
  if (slot !== "moveAxis" && slot !== "aimAxisX" && slot !== "aimAxisY") return;
  if (!Number.isFinite(axisIndex)) return;
  padBindings[slot] = axisIndex;
  persistPad();
}

export function resetPad() {
  const def = clonePad(DEFAULT_PAD);
  padBindings.buttons = def.buttons;
  padBindings.moveAxis = def.moveAxis;
  padBindings.aimAxisX = def.aimAxisX;
  padBindings.aimAxisY = def.aimAxisY;
  persistPad();
}
