// ---------------------------------------------------------------------------
// UNIFIED GAME STATE
//
// A single authoritative object the whole game reads and writes: hub, mission,
// and results all share this. Mutations go through the exported action
// functions so the rules (affordability, permadeath, campaign win/lose) live in
// one place. This is what a save/load would serialize.
//
// It is built in two halves (tech/multiplayer-state.md, S2). A WORLD holds the
// things one campaign has exactly one of — the date, the doom clock, the board,
// the log — and a PLAYER holds a base: credits, roster, armory, stores,
// fabrication, record. A player's campaign is still one FLAT object; its world
// fields are read-through accessors onto the shared world rather than values of
// its own, which is why every action below is handed something indistinguishable
// from the old state and keeps its signature, its body and its tests.
//
// `createState()` is the one-player composition of the two, so single-player and
// multiplayer construct through the same path rather than two.
// ---------------------------------------------------------------------------

import { RECRUIT_POOL } from "./soldiers.js";
import { WEAPONS, BLUEPRINTS, TUNING } from "./content.js";
import { config } from "./config.js";
import { listCustomWeapons } from "./customcontent.js";
import { applyWeaponOverrides } from "./weaponoverrides.js";
import { generateLevel } from "./gen/levelgen.js";
import { missionRoster } from "./enemyspecs.js";

let nextId = 1;
const uid = (p) => `${p}_${nextId++}`;

// The fields a campaign has exactly one of however many players share it. Every
// one is reached through an accessor on a player's campaign, GET and SET both:
// advanceDay and applyMissionResult REPLACE `leads` rather than splicing it, so
// a world field carried by plain reference would detach the first time either
// ran and quietly hand each player a private board.
const WORLD_FIELDS = ["day", "campaignHealth", "leads", "outcome", "log", "cleared"];

export function createWorld() {
  const world = {
    day: 1,
    campaignHealth: TUNING.startCampaignHealth,

    // Operations leads (procedurally generated). Each lead is MISSION-shaped and
    // carries its own generated `level` (drop-in for loadMission). Filled below.
    // ONE set for the world, not one per player.
    leads: [],

    outcome: null, // null | "won" | "lost"
    log: [], // short human-readable campaign log (newest first)

    // Cleared leads, by anybody. Board difficulty scales off how much of the war
    // has been fought, and `completedMissions.length` is a player's own record —
    // which stops having one answer the moment there are two of them. Equal to
    // that length in single-player, which is what it replaced there.
    cleared: 0,
  };
  seedBoard(world);
  return world;
}

// One base, over a world it shares with the other players. Flat and
// state-shaped: the world fields are accessors, so nothing downstream can tell
// which half a field came from.
export function createPlayerState(world) {
  // Editor edits to BUILT-IN weapons are patches applied over arsenal.js, in
  // place, so BLUEPRINTS (which hold direct references) see them too. Must run
  // before the armory line below, which clones out of WEAPONS.
  applyWeaponOverrides();

  const state = {
    money: TUNING.startMoney,

    recruits: RECRUIT_POOL.map((s) => structuredClone(s)),
    roster: [],

    // Weapons the player owns and can assign to soldiers. The rifle is standard
    // issue; commissioned blueprints append here when they finish building;
    // weapons authored in the editor's Weapon Designer load in here too (read at
    // load time — reload the game to pick up ones saved after this state began).
    armory: [structuredClone(WEAPONS.carbine), ...listCustomWeapons().map((w) => structuredClone(w))],

    // Recovered-but-unsold loot: { name, value } entries from missions.
    stores: [],

    // Engineering build queue: { blueprintId, name, daysLeft }.
    building: [],

    completedMissions: [], // ids of cleared leads (also the win counter)
    highWins: 0, // cleared leads that advertised High — the finale gate counts these
  };

  for (const key of WORLD_FIELDS) {
    Object.defineProperty(state, key, {
      get: () => world[key],
      set: (v) => { world[key] = v; },
      enumerable: true,
      configurable: true,
    });
  }
  // Which world this base belongs to. Non-enumerable so it stays out of
  // Object.keys, JSON and anything walking the campaign's fields; the session
  // needs it to seat a second player over the same world.
  Object.defineProperty(state, "world", { value: world, enumerable: false });

  return state;
}

export function createState() {
  return createPlayerState(createWorld());
}

// ---- lead generation (Slice 1) --------------------------------------------
// Operations surfaces generated leads instead of a fixed mission list. Enemy
// budgets and difficulty scale with campaign pressure (days elapsed + wins), and
// a one-shot BOSS lead (winsCampaign) surfaces once you've cleared enough of
// them — the stand-in for the Ops-investment endgame gating of a later slice.

const DIFF_BY_PRESSURE = [
  { max: 1.2, weights: { low: 3, medium: 2, high: 0 } },
  { max: 1.6, weights: { low: 2, medium: 3, high: 1 } },
  { max: 99, weights: { low: 1, medium: 3, high: 3 } },
];
const LENGTHS = ["short", "medium", "medium", "long"];

function pressureScale(state) {
  return Math.min(config.threatScaleCap, 1 + (state.day - 1) * 0.06 + state.cleared * 0.05);
}

function pickDifficulty(scale) {
  const band = DIFF_BY_PRESSURE.find((b) => scale <= b.max) || DIFF_BY_PRESSURE[DIFF_BY_PRESSURE.length - 1];
  const entries = Object.entries(band.weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [id, w] of entries) {
    r -= w;
    if (r < 0) return id;
  }
  return "medium";
}

// Days a fresh lead sits on the board before it rots, rolled per lead. A max
// below the min is read as "no window" rather than an error.
function rollLifespan() {
  const min = Math.max(1, Math.round(config.leadLifeMin));
  const max = Math.max(min, Math.round(config.leadLifeMax));
  return min + ((Math.random() * (max - min + 1)) | 0);
}

function makeLead(state, opts = {}) {
  const seed = (Math.random() * 1e9) | 0;
  const scale = pressureScale(state);
  const { level, mission, report } = generateLevel({
    seed,
    boss: !!opts.boss,
    difficulty: opts.boss ? undefined : pickDifficulty(scale),
    length: LENGTHS[(Math.random() * LENGTHS.length) | 0],
    // Enemy roster = the built-in EnemySpec mission enemies (boss leads add the
    // boss). Generated missions are 100% spec-driven.
    roster: missionRoster({ boss: !!opts.boss }),
    scale,
  });
  // The boss lead carries no lifespan: the finale is promised as immediate and
  // guaranteed once earned, and a finale that rotted would make an earned
  // campaign unwinnable (arrivals only ever produce ordinary leads).
  return { ...mission, level, report, daysLeft: opts.boss ? null : rollLifespan() };
}

// Add one lead with a collision-free id (level ids are gen_<seed>).
function addUniqueLead(state, opts) {
  for (let i = 0; i < 8; i++) {
    const lead = makeLead(state, opts);
    if (!state.leads.some((l) => l.id === lead.id)) {
      state.leads.push(lead);
      return;
    }
  }
}

// The finale is earned, not counted: two cleared High leads (config.bossHighWins)
// place the boss immediately, bypassing the board ceiling — "immediate and
// guaranteed" outranks the cap, so a full board can never defer the finale.
// Called from mission resolution, which is the only place a High win happens.
function placeBossIfEarned(state) {
  if (state.outcome) return;
  if (state.highWins < config.bossHighWins) return;
  if (state.leads.some((l) => l.winsCampaign)) return;
  addUniqueLead(state, { boss: true });
}

// The ceiling counts ordinary leads only. The boss is placed over the cap by
// definition, so letting it hold a slot would starve the board it arrived on.
function ordinaryLeads(state) {
  return state.leads.filter((l) => !l.winsCampaign).length;
}

// Day 1 opens on config.seedLeads, not a full board.
function seedBoard(state) {
  const want = Math.min(Math.max(0, Math.round(config.seedLeads)), config.leadCount);
  let guard = 0;
  while (ordinaryLeads(state) < want && guard++ < 20) addUniqueLead(state, {});
}

// Arrivals are the only source of ordinary leads: nothing tops the board up
// after a mission. A rate is a floor plus one coin flip (approximation 1) — 1.25
// is one guaranteed lead plus a 25% chance of a second — and never crosses the
// ceiling. A board below it, or empty, is a legal state.
function arriveLeads(state) {
  if (state.outcome) return;
  const rate = Math.max(0, config.leadArrivalRate);
  let n = Math.floor(rate);
  if (Math.random() < rate - n) n += 1;
  const arrived = [];
  for (let i = 0; i < n && ordinaryLeads(state) < config.leadCount; i++) {
    const before = state.leads.length;
    addUniqueLead(state, {});
    if (state.leads.length > before) arrived.push(state.leads[state.leads.length - 1]);
  }
  for (const l of arrived) note(state, `${l.name} — new lead from Ops.`);
  return arrived;
}

// ---- helpers --------------------------------------------------------------

function note(state, text) {
  state.log.unshift({ day: state.day, text });
  if (state.log.length > 40) state.log.pop();
}

export function livingRoster(state) {
  return state.roster.filter((s) => s.status !== "dead");
}

// ---- Barracks -------------------------------------------------------------

export function hire(state, id) {
  const i = state.recruits.findIndex((r) => r.id === id);
  if (i === -1) return { ok: false, reason: "That recruit is no longer available." };

  const rec = state.recruits[i];
  if (state.money < rec.cost) return { ok: false, reason: "Not enough credits." };

  state.money -= rec.cost;
  rec.status = "roster";
  rec.weaponId = "carbine"; // standard issue on enlistment
  rec.wounds = 0; // enlists at full health
  state.recruits.splice(i, 1);
  state.roster.push(rec);
  note(state, `Enlisted ${rec.name}.`);
  return { ok: true };
}

// ---- Engineering ----------------------------------------------------------

export function commission(state, blueprintId) {
  const bp = BLUEPRINTS.find((b) => b.id === blueprintId);
  if (!bp) return { ok: false, reason: "Unknown blueprint." };
  if (state.building.some((b) => b.blueprintId === blueprintId))
    return { ok: false, reason: "Already in fabrication." };
  if (state.armory.some((w) => w.id === bp.weapon.id))
    return { ok: false, reason: "Already in the armory." };
  if (state.money < bp.cost) return { ok: false, reason: "Not enough credits." };

  state.money -= bp.cost;
  state.building.push({ blueprintId, name: bp.name, daysLeft: bp.buildDays });
  note(state, `Commissioned ${bp.name} (${bp.buildDays}d).`);
  return { ok: true };
}

// ---- Stores / economy -----------------------------------------------------

export function sellAllLoot(state) {
  if (state.stores.length === 0) return { ok: false, reason: "Nothing to sell." };
  const total = state.stores.reduce((s, item) => s + item.value, 0);
  const count = state.stores.length;
  state.money += total;
  state.stores = [];
  note(state, `Sold ${count} item(s) for §${total}.`);
  return { ok: true, total, count };
}

// ---- Time -----------------------------------------------------------------
// Advancing a day ticks fabrication timers and the doom clock, then checks for
// a campaign loss. Returns a summary the UI can flash.

// What a day does to ONE base: fabrication timers tick and the wounded mend.
// Split out of advanceDay because a day is a world event and this is not — with
// two players the world half must run once and this must run for every one of
// them, or the commander who did not press the button never finishes a weapon
// and never heals. The design says the non-deploying player spends the same day
// at base; this is that day.
//
// Call it AFTER the world's day has been bumped: the log notes it writes are
// stamped with state.day, and they belong to the day that just started.
export function restDay(state) {
  const finished = [];

  for (const job of state.building) {
    job.daysLeft -= 1;
    if (job.daysLeft <= 0) finished.push(job);
  }
  for (const job of finished) {
    const bp = BLUEPRINTS.find((b) => b.id === job.blueprintId);
    state.armory.push(structuredClone(bp.weapon));
    state.building = state.building.filter((b) => b !== job);
    note(state, `${bp.name} rolled off the line — added to the armory.`);
  }

  // Soldiers mend at base: each rest day recovers config.healPerDay of wounds.
  const heal = config.healPerDay;
  if (heal > 0) {
    for (const s of state.roster) {
      if (s.status !== "dead" && s.wounds > 0) {
        s.wounds = Math.max(0, s.wounds - heal);
      }
    }
  }

  return finished.map((f) => f.name);
}

export function advanceDay(state) {
  if (state.outcome) return { ok: false, reason: "The campaign is over." };

  state.day += 1;

  // This player's own half. The session runs restDay for everyone else — see
  // tech/multiplayer-state.md, "state.js keeps its action signatures".
  const finished = restDay(state);

  // Leads rot. Whole days only, and one tick per day advance whatever asked for
  // the day — a deploy's day expires the leads it left behind, same as idling.
  const expired = [];
  for (const lead of state.leads) {
    if (typeof lead.daysLeft !== "number") continue; // the boss never expires
    lead.daysLeft -= 1;
    if (lead.daysLeft <= 0) expired.push(lead);
  }
  if (expired.length) {
    state.leads = state.leads.filter((l) => !expired.includes(l));
    for (const l of expired) note(state, `${l.name} — the window closed. Lead dropped.`);
  }

  // ...and new work arrives on the clock, after the rot, so a lead that expired
  // today frees its slot today. Passing time is how the player fishes for work.
  const arrived = arriveLeads(state) || [];

  // Doom clock: the invasion advances whether or not you acted.
  state.campaignHealth = Math.max(0, state.campaignHealth - config.doomPerDay);
  if (state.campaignHealth <= TUNING.loseAt) {
    state.outcome = "lost";
    note(state, "The invasion overran the sector. Campaign lost.");
  }

  return {
    ok: true,
    finished,
    expired: expired.map((l) => l.name),
    arrived: arrived.map((l) => l.name),
  };
}

// ---- Mission bridge -------------------------------------------------------
// A deploy carries a chosen squad into the mission; applyMissionResult carries
// the outcome back. `result` shape (from the mission scene):
//   { success, missionId, casualties: [soldierId], survivors: [soldierId],
//     woundsBySoldier: [{id, wounds}], loot: [{name,value}], kills }

export function applyMissionResult(state, result) {
  const mission = state.leads.find((l) => l.id === result.missionId);

  // Permadeath: anyone who fell is gone from the roster for good.
  for (const id of result.casualties) {
    const s = state.roster.find((r) => r.id === id);
    if (s) {
      s.status = "dead";
      note(state, `${s.name} was killed in action.`);
    }
  }
  // Survivors return to standby and bank their kill record.
  for (const id of result.survivors) {
    const s = state.roster.find((r) => r.id === id);
    if (s) {
      s.status = "roster";
      const k = (result.killsBySoldier || []).find((e) => e.id === id);
      if (k) s.record.kills += k.kills;
      // Carry any damage taken back to base as persistent wounds.
      const w = (result.woundsBySoldier || []).find((e) => e.id === id);
      if (w) s.wounds = w.wounds;
    }
  }
  // Drop the dead from the roster entirely.
  state.roster = state.roster.filter((s) => s.status !== "dead");

  if (result.success) {
    for (const item of result.loot) state.stores.push(item);
    if (!state.completedMissions.includes(result.missionId)) {
      state.completedMissions.push(result.missionId);
      // ...and the world's tally, which is what board pressure scales off. A
      // reader with no writer freezes the board at day-one difficulty and
      // nothing fails loudly, so these two lines stay together.
      state.cleared += 1;
      // The gate reads the lead's ADVERTISED threat — what the player agreed to
      // take on — not what the mission turned out to be.
      if (mission && mission.difficulty === "High") state.highWins += 1;
    }
    if (mission) {
      state.campaignHealth = Math.min(100, state.campaignHealth + mission.threatReward);
      note(
        state,
        `${mission.name} — success. Recovered ${result.loot.length} item(s).`
      );
      if (mission.winsCampaign) {
        state.outcome = "won";
        note(state, "The hive command node is destroyed. The sector is saved.");
      }
    }
  } else if (mission) {
    // A failed insertion emboldens the enemy.
    state.campaignHealth = Math.max(0, state.campaignHealth - 10);
    note(state, `${mission.name} — failed. The squad was wiped.`);
    if (state.campaignHealth <= TUNING.loseAt) state.outcome = "lost";
  }

  // The lead is spent whether or not the squad survived. Nothing refills the
  // board — the deploy's day below is the only thing that can bring work in.
  state.leads = state.leads.filter((l) => l.id !== result.missionId);

  // A deploy costs a day, and it is the SAME day the time control buys — one
  // answer to "what does a day do". It is charged after the mission's own
  // reward (so a win that outruns the doom tick counts first) and before the
  // refill (so leads arriving after it keep their full lifespan).
  // A campaign-ending mission is not charged: advanceDay refuses once
  // state.outcome is set, at the exact moment the day can no longer matter.
  if (config.dayPerDeploy) advanceDay(state);

  placeBossIfEarned(state);

  return state;
}

export { uid };
