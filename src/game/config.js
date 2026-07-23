// ---------------------------------------------------------------------------
// CONFIG — tweakable settings & tuning constants, single source of truth.
//
// Settings are DATA (SCHEMA), so the editor can auto-generate its controls and
// adding a knob later is one line here — no UI wiring. The game reads live
// values off the exported `config` object (config.friendlyFire, config.gravity,
// …). Overrides persist to localStorage; `exportConfig()` gives you JSON to
// paste into these defaults to make a change permanent.
//
// `type`:  bool | range | enum | text
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
      {
        key: "soldierBaseHp",
        label: "Soldier base hp",
        type: "range",
        default: 10,
        min: 0,
        max: 100,
        step: 1,
        help: "Flat hp every soldier gets before stats. Max hp = base + Health stat × per-point. Applies next deploy.",
      },
      {
        key: "soldierHpPerHealth",
        label: "Hp per Health point",
        type: "range",
        default: 2,
        min: 0,
        max: 20,
        step: 1,
        help: "Extra hp per point of the Health stat (1–10). Defaults give 12–30 hp. Applies next deploy.",
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
    title: "Controls / aim",
    items: [
      {
        key: "aimMode",
        label: "Aim mode",
        type: "enum",
        options: ["mouse", "gamepad", "auto", "keyboard"],
        default: "mouse",
        help: "How the controlled soldier aims. mouse = point with the cursor; gamepad = right stick; auto = stick if a pad is active else mouse; keyboard = the old up/forward scheme. Live.",
      },
      {
        key: "aimSpread",
        label: "Aim spread",
        type: "range",
        default: 0.12,
        min: 0,
        max: 0.4,
        step: 0.01,
        help: "The spread constant scaled by a shooter's Aim stat — higher Aim shoots tighter. 0 = perfectly accurate regardless of Aim. Live.",
      },
      {
        key: "reloadSpeedMult",
        label: "Reload move speed ×",
        type: "range",
        default: 0.2,
        min: 0,
        max: 1,
        step: 0.05,
        help: "How much of normal run speed you keep while reloading. Live.",
      },
      {
        key: "padDeadzone",
        label: "Gamepad deadzone",
        type: "range",
        default: 0.25,
        min: 0,
        max: 0.6,
        step: 0.05,
        help: "Stick movement below this fraction is ignored (drift guard). Live.",
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
  {
    title: "Hub ambience",
    items: [
      {
        key: "hubAmbience",
        label: "Base crew animation",
        type: "bool",
        default: true,
        help: "Base crew working at desks and chatting behind the hub screens. Live.",
      },
      {
        key: "hubAmbienceDensity",
        label: "Crew density",
        type: "range",
        default: 1,
        min: 0.25,
        max: 2,
        step: 0.25,
        help: "Multiplier on how many figures wander the base (also scales with your roster). Live.",
      },
    ],
  },
  {
    title: "Player2 / AI",
    items: [
      {
        key: "player2GameClientId",
        label: "Game client id",
        type: "text",
        default: "",
        help: "Your game's client id from the Player2 Developer Dashboard. Used by the Enemy Designer's Generate button (requires the Player2 app running).",
      },
    ],
  },
  {
    title: "Generation",
    items: [
      {
        key: "leadCount",
        label: "Leads on the board",
        type: "range",
        default: 3,
        min: 1,
        max: 5,
        step: 1,
        help: "How many operations Ops surfaces at once. Applies as the board refills.",
      },
      {
        key: "bossAfter",
        label: "Wins before the finale",
        type: "range",
        default: 4,
        min: 1,
        max: 10,
        step: 1,
        help: "Operations you must clear before the boss (campaign-ending) lead can appear.",
      },
      {
        key: "threatScaleCap",
        label: "Max threat scaling",
        type: "range",
        default: 2.2,
        min: 1,
        max: 4,
        step: 0.1,
        help: "Ceiling on how far generated enemy budgets scale up as the campaign drags on.",
      },
      {
        key: "genPlatformDensity",
        label: "Terrain density",
        type: "range",
        default: 0.8,
        min: 0.2,
        max: 1,
        step: 0.05,
        help: "Chance each terrain slot gets a structure; the rest stay open ground. Applies to newly generated levels.",
      },
      {
        key: "genMaxTiers",
        label: "Terrain verticality",
        type: "range",
        default: 3,
        min: 1,
        max: 4,
        step: 1,
        help: "Max chained jumps a structure climbs above the ground. 1 = single-jump perches/boxes only.",
      },
      {
        key: "genStructureSpacing",
        label: "Structure spacing",
        type: "range",
        default: 460,
        min: 300,
        max: 900,
        step: 20,
        help: "Px of level per terrain slot — lower = more, tighter-packed structures.",
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
  if (item.type === "text") return typeof v === "string" ? v : String(v ?? item.default);
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
