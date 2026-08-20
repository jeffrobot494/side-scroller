// ---------------------------------------------------------------------------
// THE SESSION  (multiplayer state — S1, the session seam)
//
// One authoritative campaign, a collection of players, and two ways to touch
// it: send a COMMAND to change something, read a VIEW to see something. The
// hub owns no campaign rules and performs no campaign writes — it asks.
//
// The campaign is one WORLD — the date, the doom clock, the board, the log —
// with one base per player over it (S2). Each player's campaign is flat and
// state-shaped, so every action in state.js is handed what it has always been
// handed, and a view is a projection of ONE player's campaign.
//
// Single-player is a session with one player. There is deliberately no second
// path: two ways to mutate state would need a decision every time an action is
// added, and this way costs one refactor instead.
//
// This module must stay DOM-free and must not touch localStorage directly —
// that is the property that lets a later spec move it to a server. Its whole
// import chain (state.js -> config/customcontent/weaponoverrides) already
// guards every storage access, and `test/session.test.mjs` asserts the rule
// rather than trusting it, because the test harness installs a DOM globally.
//
// Plan: tech/multiplayer-state.md. Players are held as a COLLECTION, never a
// pair — the design is written for two, but nothing here may make a third
// impossible.
// ---------------------------------------------------------------------------

import {
  createWorld,
  createPlayerState,
  hire,
  commission,
  sellAllLoot,
  advanceDay,
  restDay,
  applyMissionResult,
  livingRoster,
} from "./state.js";
import { WEAPONS } from "./content.js";

// The campaign fields a player can see. `highWins` is deliberately absent —
// nothing in the hub reads it (only state.js's own finale gate does), so it
// stays off the view until S7 gives the finale screen a reason to want it.
const VIEW_FIELDS = [
  "day",
  "money",
  "campaignHealth",
  "recruits",
  "roster",
  "armory",
  "stores",
  "building",
  "leads",
  "completedMissions",
  "outcome",
  "log",
];

// A view is a PROJECTION over the live campaign, not a copy of it.
//
// Every field is a getter reading through on each access, which buys three
// things at once: the hub's capture-once-render-many pattern keeps working
// (`Hub` grabs `this.game` in its constructor and re-reads it every render),
// object identity survives so the mission's squad handles and the results
// screen's `_lastSquad` still point at the real roster soldiers, and S2/S6 can
// narrow what a player sees by changing what a getter reads — without the hub
// noticing. A snapshot would go stale on the next command; a deep clone would
// break identity, which the mission depends on (entities.js reads data.wounds
// off the live soldier).
//
// Frozen, so `view.money = 0` throws instead of silently doing nothing. Note
// honestly what that does NOT buy: `view.roster.push(...)` still works. The
// nested seam is a rule, not a lock, because cloning is ruled out above.
function makeView(campaign, player) {
  const v = { playerId: player.id };
  for (const key of VIEW_FIELDS) {
    Object.defineProperty(v, key, { get: () => campaign[key], enumerable: true });
  }
  return Object.freeze(v);
}

const fail = (reason) => ({ ok: false, reason });

// Rebuild the squad the way the hub used to, at hub.js `_launch`. The fallback
// chain is load-bearing and easy to get subtly wrong: an explicit pick beats
// the soldier's own weapon beats the carbine, and an id that resolves to
// nothing falls back to the shared WEAPONS.carbine. Because `hire` gives every
// recruit weaponId "carbine", breaking this is invisible in play unless
// somebody actually changed a weapon select.
function resolveWeapon(campaign, soldier, weapons) {
  const wId = weapons[soldier.id] || soldier.weaponId || "carbine";
  return campaign.armory.find((w) => w.id === wId) || WEAPONS.carbine;
}

// Validate the whole deploy BEFORE writing any of it. The hub's old loop
// incremented record.missions as it walked the squad, so a rejection halfway
// through would have left some soldiers charged for a mission that never ran.
function deployCommand(campaign, cmd) {
  const lead = campaign.leads.find((l) => l.id === cmd.leadId);
  if (!lead) return fail("That lead is no longer on the board.");

  const ids = cmd.soldierIds || [];
  if (!ids.length) return fail("A squad needs at least one soldier.");
  if (new Set(ids).size !== ids.length) return fail("A soldier cannot deploy twice.");

  const living = livingRoster(campaign);
  const picked = [];
  for (const id of ids) {
    const s = living.find((r) => r.id === id);
    if (!s) return fail("That soldier is not available to deploy.");
    picked.push(s);
  }

  // Validated — now write.
  const weapons = cmd.weapons || {};
  const squad = picked.map((s) => {
    s.record.missions += 1;
    return { data: s, weapon: resolveWeapon(campaign, s, weapons) };
  });

  return { ok: true, mission: lead, level: lead.level, squad };
}

export function createSession(opts = {}) {
  // `opts.state` seats a caller-built campaign as the first player and takes its
  // world; `opts.world` supplies the world directly. Both exist for tests — the
  // game passes neither.
  const seatOne = opts.state || null;
  const world = opts.world || (seatOne && seatOne.world) || createWorld();

  // A Map, iterated everywhere. No players[0], no .a/.b, no "the other player"
  // that returns exactly one. S4's readiness and S5's pending choice become
  // fields on these records, so those slices add a field, not a structure.
  const players = new Map();
  for (const id of opts.playerIds || ["p1"]) {
    const campaign = players.size === 0 && seatOne ? seatOne : createPlayerState(world);
    players.set(id, { id, campaign, view: null });
  }

  // A day is spent by everybody, whoever asked for it: the world half runs once
  // inside advanceDay, and every OTHER player's half runs here. Without this the
  // commander who did not press the button never finishes a weapon and never
  // heals, on a day their doom clock was charged for.
  function restEveryoneElse(acting) {
    for (const other of players.values()) {
      if (other !== acting) restDay(other.campaign);
    }
  }

  function command(playerId, cmd) {
    const player = players.get(playerId);
    if (!player) return fail("Unknown player.");
    if (!cmd || !cmd.type) return fail("Malformed command.");

    // Each case returns the state action's result VERBATIM. Reshaping it here
    // — normalising a failure, adding empty arrays, stripping a field — would
    // change what the hub prints, and the hub's flash strings are the thing
    // this slice must not move.
    const campaign = player.campaign;

    switch (cmd.type) {
      case "hire":
        return hire(campaign, cmd.recruitId);
      case "commission":
        return commission(campaign, cmd.blueprintId);
      case "sellLoot":
        return sellAllLoot(campaign);
      case "advanceDay": {
        const res = advanceDay(campaign);
        // The result names only THIS player's finished jobs. What the others
        // built is their own business — the design says a base is invisible.
        if (res.ok) restEveryoneElse(player);
        return res;
      }
      case "deploy":
        return deployCommand(campaign, cmd);
      case "missionResult": {
        // A deploy charges a day from inside applyMissionResult (state.js), and
        // it does not always: config.dayPerDeploy can be off, and advanceDay
        // refuses once the same result has set `outcome`. So the day is not
        // predicted here, it is OBSERVED — and if it moved, everybody spent it.
        // S4 lifts the charge out to the ready gate and this goes with it.
        const before = world.day;
        // applyMissionResult returns the state object itself; returning that
        // would hand the campaign back through the seam we just built.
        applyMissionResult(campaign, cmd.result);
        if (world.day !== before) restEveryoneElse(player);
        return { ok: true };
      }
      default:
        return fail("Unknown command.");
    }
  }

  // Unknown player is a THROW here but a rejection in `command`, deliberately.
  // A command is data arriving from a client, and once there is a transport,
  // rejecting it is the only sane answer. A view is asked for by the local
  // render loop, where a soft failure would paint an empty hub and say nothing.
  function view(playerId) {
    const player = players.get(playerId);
    if (!player) throw new Error(`No such player: ${playerId}`);
    if (!player.view) player.view = makeView(player.campaign, player);
    return player.view;
  }

  return {
    playerIds: () => [...players.keys()],
    playerCount: () => players.size,
    hasPlayer: (id) => players.has(id),
    command,
    view,
  };
}
