// ---------------------------------------------------------------------------
// CONFIG — tweakable settings & tuning constants, single source of truth.
//
// Settings are DATA (SCHEMA), so the editor can auto-generate its controls and
// adding a knob later is one line here — no UI wiring. The game reads live
// values off the exported `config` object (config.friendlyFire, config.gravity,
// …). Overrides persist to localStorage; `exportConfig()` gives you JSON to
// paste into these defaults to make a change permanent.
//
// `type`:  bool | range | enum
// Where a value is READ decides how "live" it is — friendlyFire is read per
// shot (instant); gravity is read at mission start (applies next deploy).
// ---------------------------------------------------------------------------

export const SCHEMA = [
  {
    title: "Combat",
    items: [
      {
        key: "friendlyFire",
        label: "Friendly fire",
        type: "bool",
        default: false,
        help: "Your squad's shots can hit each other (aliens stay immune to their own). Live.",
      },
      {
        key: "playerDamageMult",
        label: "Squad damage ×",
        type: "range",
        default: 1,
        min: 0.25,
        max: 3,
        step: 0.25,
        help: "Multiplier on all damage your soldiers deal. Live.",
      },
    ],
  },
  {
    title: "Movement / feel",
    items: [
      {
        key: "gravity",
        label: "Gravity",
        type: "range",
        default: 2000,
        min: 600,
        max: 4000,
        step: 50,
        help: "Downward acceleration (px/s²). Applies on next deploy.",
      },
      {
        key: "runSpeed",
        label: "Run speed",
        type: "range",
        default: 320,
        min: 120,
        max: 700,
        step: 10,
        help: "Soldier max horizontal speed (px/s). Live.",
      },
      {
        key: "jumpSpeed",
        label: "Jump strength",
        type: "range",
        default: 720,
        min: 300,
        max: 1100,
        step: 20,
        help: "Initial jump velocity (px/s). Live.",
      },
    ],
  },
  {
    title: "Campaign",
    items: [
      {
        key: "doomPerDay",
        label: "Doom clock / day",
        type: "range",
        default: 6,
        min: 0,
        max: 20,
        step: 1,
        help: "Campaign health lost each day. 0 disables the doom clock.",
      },
    ],
  },
];

const STORAGE_KEY = "sidescroller.config.v1";
const FLAT = SCHEMA.flatMap((g) => g.items);
const BY_KEY = Object.fromEntries(FLAT.map((it) => [it.key, it]));

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// Coerce a raw value to the item's type + bounds so bad input can't poison state.
function coerce(item, v) {
  if (item.type === "bool") return !!v;
  if (item.type === "range") {
    let n = Number(v);
    if (Number.isNaN(n)) n = item.default;
    return clamp(n, item.min, item.max);
  }
  if (item.type === "enum") return item.options.includes(v) ? v : item.default;
  return v;
}

function defaults() {
  const o = {};
  for (const it of FLAT) o[it.key] = it.default;
  return o;
}

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

function load() {
  const d = defaults();
  const saved = readStore();
  for (const k in saved) if (BY_KEY[k]) d[k] = coerce(BY_KEY[k], saved[k]);
  return d;
}

// The live object every game module reads. Mutated in place so importers see
// changes without re-importing.
export const config = load();

// Persist only what differs from defaults — keeps the blob small and means new
// settings added later still pick up their default.
function persist() {
  const d = defaults();
  const overrides = {};
  for (const it of FLAT) if (config[it.key] !== d[it.key]) overrides[it.key] = config[it.key];
  writeStore(overrides);
}

export function setConfig(key, value) {
  const item = BY_KEY[key];
  if (!item) return;
  config[key] = coerce(item, value);
  persist();
  return config[key];
}

export function resetConfig() {
  Object.assign(config, defaults());
  writeStore({});
}

export function isDefault(key) {
  const item = BY_KEY[key];
  return !item || config[key] === item.default;
}

export function exportConfig() {
  return JSON.stringify(config, null, 2);
}

export function importConfig(json) {
  let obj;
  try {
    obj = JSON.parse(json);
  } catch {
    return { ok: false, reason: "Not valid JSON." };
  }
  if (!obj || typeof obj !== "object") return { ok: false, reason: "Expected a JSON object." };
  let applied = 0;
  for (const k in obj)
    if (BY_KEY[k]) {
      config[k] = coerce(BY_KEY[k], obj[k]);
      applied++;
    }
  persist();
  return { ok: true, applied };
}
