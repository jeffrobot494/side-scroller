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
        key: "soldierMagazines",
        label: "Magazines carried",
        type: "range",
        default: 4,
        min: 1,
        max: 12,
        step: 1,
        help: "Magazines each soldier brings into a mission (one loaded + the rest spare). No spares left = no more reloads. Applies next deploy.",
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
      {
        key: "lootPerThreat",
        label: "Loot value / threat",
        type: "range",
        default: 0.5,
        min: 0,
        max: 3,
        step: 0.1,
        help: "Credits an enemy's dropped loot is worth per point of its threat cost. 0 = enemies drop nothing. Applies next deploy.",
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
      {
        key: "enemyJump",
        label: "Enemy jump strength",
        type: "range",
        default: 665,
        min: 200,
        max: 1100,
        step: 20,
        help: "Upward velocity (px/s) a legged spec body jumps with — the scored `jump` action AND the traversal hop, which used to disagree. A spec overrides it per body with `body.jump`. 665 clears the tallest perch the level generator builds. Applies on next deploy.",
      },
      {
        key: "coyoteTime",
        label: "Coyote time",
        type: "range",
        default: 0.1,
        min: 0,
        max: 0.3,
        step: 0.01,
        help: "Grace window (seconds) after walking off a ledge in which a jump still fires. Applies to everyone the shared integrator moves — soldiers and legged spec bodies. 0 disables. Live.",
      },
      {
        key: "companionBrain",
        label: "Companion AI",
        type: "enum",
        options: ["legacy", "spec"],
        default: "spec",
        help: "spec = the shared agent brain (perception + a companion EnemySpec) over the soldier locomotor — a data-authored companion. legacy = the original hand-written squad AI (fallback). Applies on next deploy.",
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
    // The mission's window onto the world, plus the on-screen readouts drawn
    // over it. The visible width is canvas.width / zoom, so a bigger canvas and
    // a smaller zoom buy the same field of view — the canvas renders it at full
    // resolution, zoom trades sharpness for reach. The camera keys are mission
    // only (the editor tools own their canvases); showFps also covers the base.
    title: "Viewport",
    items: [
      {
        key: "missionCanvas",
        label: "Mission canvas",
        type: "enum",
        options: ["960x540", "1280x720", "1600x900"],
        default: "960x540",
        help: "Backing-store size of the mission canvas (all 16:9; CSS shrinks it to fit a small window). Bigger = more world on screen at the same zoom. Applies on next deploy.",
      },
      {
        key: "missionZoom",
        label: "Camera zoom",
        type: "range",
        default: 1,
        min: 0.5,
        max: 1.5,
        step: 0.05,
        help: "World scale. 1 = the classic framing; 0.5 shows twice as much level each way. The world is only 540px tall, so vertical gain is empty sky — below ~0.6 the action shrinks into a band at the bottom. Live.",
      },
      {
        key: "showFps",
        label: "Show FPS",
        type: "bool",
        default: true,
        help: "Frame-rate meter in the top-right of the base and the mission. Live.",
      },
    ],
  },
  {
    title: "Sound",
    items: [
      {
        key: "masterVolume",
        label: "Master volume",
        type: "range",
        default: 0.7,
        min: 0,
        max: 1,
        step: 0.05,
        help: "Overall output level. 0 = silence everything. Live.",
      },
      {
        key: "sfxVolume",
        label: "Effects volume",
        type: "range",
        default: 1,
        min: 0,
        max: 1,
        step: 0.05,
        help: "The world bus — gunfire, impacts, footsteps, deaths. Live.",
      },
      {
        key: "uiVolume",
        label: "Interface volume",
        type: "range",
        default: 0.8,
        min: 0,
        max: 1,
        step: 0.05,
        help: "Menu clicks and mission stingers. Live.",
      },
      {
        key: "musicVolume",
        label: "Music volume",
        type: "range",
        default: 0.6,
        min: 0,
        max: 1,
        step: 0.05,
        help: "The music/ambience bus. Nothing routes here yet (Slice 4). Live.",
      },
      {
        key: "muteOnBlur",
        label: "Mute when unfocused",
        type: "bool",
        default: true,
        help: "Drop to silence when the tab loses focus. Live.",
      },
      {
        key: "audioPan",
        label: "Stereo width",
        type: "range",
        default: 0.7,
        min: 0,
        max: 1,
        step: 0.05,
        help: "How hard sounds pan toward the side of the screen they happened on. 0 = dead centre. Live.",
      },
      {
        key: "audioFalloff",
        label: "Audible range",
        type: "range",
        default: 900,
        min: 300,
        max: 3000,
        step: 50,
        help: "Px from the camera centre at which a world sound fades to nothing. Live.",
      },
      {
        key: "audioMaxVoices",
        label: "Max simultaneous sounds",
        type: "range",
        default: 24,
        min: 4,
        max: 64,
        step: 1,
        help: "Global voice cap — the guard against a full-auto weapon drowning everything else. Live.",
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
      {
        key: "dayPerDeploy",
        label: "Deploying costs a day",
        type: "bool",
        default: true,
        help: "Resolving a mission advances the day, so expiry, fabrication, healing and doom all tick per deploy. Off restores the old behaviour where only idling costs time.",
      },
      {
        key: "healPerDay",
        label: "Heal / day at base",
        type: "range",
        default: 1,
        min: 0,
        max: 10,
        step: 1,
        help: "HP a resting soldier recovers each day at base. 0 disables healing.",
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
        key: "leadArrivalRate",
        label: "Lead arrivals / day",
        type: "range",
        default: 1.25,
        min: 0,
        max: 3,
        step: 0.25,
        help: "Expected new leads per day advance. A fraction is a chance: 1.25 is one lead plus a 25% chance of a second. Board size settles at roughly this × the average lifespan.",
      },
      {
        key: "seedLeads",
        label: "Leads on day 1",
        type: "range",
        default: 1,
        min: 0,
        max: 5,
        step: 1,
        help: "How many leads a new campaign opens with. Capped by the board ceiling above.",
      },
      {
        key: "leadLifeMin",
        label: "Lead lifespan — shortest",
        type: "range",
        default: 1,
        min: 1,
        max: 10,
        step: 1,
        help: "Fewest days a lead survives on the board before it expires. Rolled per lead when it is generated.",
      },
      {
        key: "leadLifeMax",
        label: "Lead lifespan — longest",
        type: "range",
        default: 3,
        min: 1,
        max: 10,
        step: 1,
        help: "Most days a lead survives. Below the shortest, it is treated as equal to it.",
      },
      {
        key: "bossHighWins",
        label: "High wins before the finale",
        type: "range",
        default: 2,
        min: 1,
        max: 6,
        step: 1,
        help: "Cleared High-threat operations required before the boss (campaign-ending) lead appears. It is placed immediately when the count is met, whatever else is on the board.",
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
  {
    // How a grounded agent gets from where it is to where it wants to be
    // (tech/agent-navigation.md) and, for a ranged one, how it decides where that
    // is (tech/ranged-repositioning.md). Read by every spec agent, enemies AND
    // companions.
    title: "Agent navigation",
    items: [
      {
        key: "navEnabled",
        label: "Route following",
        type: "bool",
        default: true,
        help: "Grounded agents path through a node graph of the terrain instead of walking straight at their destination. Off = the pre-N3 behaviour (drive at the point, hop when it is above). Applies on next deploy.",
      },
      {
        key: "navArriveRadius",
        label: "Arrival radius",
        type: "range",
        default: 14,
        min: 4,
        max: 60,
        step: 2,
        help: "How close (px) counts as reaching a waypoint or the destination. Too small and an agent jitters on the spot; too large and it stops short of ledges. Live.",
      },
      {
        key: "navTakeoffWindow",
        label: "Takeoff window",
        type: "range",
        default: 12,
        min: 2,
        max: 60,
        step: 2,
        help: "How close (px) to a jump edge's takeoff point an agent must be before it commits to the jump. Wider = jumps earlier and may undershoot; narrower = more overruns past the lip. Live.",
      },
      {
        key: "navRepathInterval",
        label: "Repath interval",
        type: "range",
        default: 0.5,
        min: 0.1,
        max: 3,
        step: 0.1,
        help: "Seconds between forced route recomputes. A destination that MOVES repaths immediately regardless; this only bounds drift while it holds still. Live.",
      },
      {
        key: "navJumpAttempts",
        label: "Jump attempts before giving up",
        type: "range",
        default: 3,
        min: 1,
        max: 10,
        step: 1,
        help: "Failed attempts at one jump edge before the destination is treated as unreachable and the agent stops. Live.",
      },
      {
        key: "navReposition",
        label: "Ranged repositioning",
        type: "bool",
        default: true,
        help: "A ranged agent that cannot see its target, or is stuck outside its preferred range, walks to a reachable spot that is inside the range AND has line of sight (tech/ranged-repositioning.md). Off = it holds distance where it stands, the pre-R1 behaviour. Live.",
      },
      {
        key: "navRepositionHold",
        label: "Reposition commitment",
        type: "range",
        default: 1.5,
        min: 0.2,
        max: 6,
        step: 0.1,
        help: "Seconds a repositioning agent sticks with the spot it chose before re-deciding. Too short and it never accumulates the jump attempts that let it give up; too long and it walks to where you WERE. Live.",
      },
      {
        key: "navStallTime",
        label: "Stall before repositioning",
        type: "range",
        default: 0.6,
        min: 0.1,
        max: 4,
        step: 0.1,
        help: "Seconds an agent may sit outside its preferred range without covering ground before it treats the spot as a dead end and repositions. Losing sight triggers a reposition immediately and does not wait for this. Live.",
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
