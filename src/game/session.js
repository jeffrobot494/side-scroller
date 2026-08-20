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
import { dealRecruits } from "./soldiers.js";
import { WEAPONS } from "./content.js";
import { config } from "./config.js";

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
//
// `taskForce` is the one field that does NOT come off the campaign. It is the
// only thing design/multiplayer.md lets a commander know about another before a
// mission resolves — who they are and whether they have readied, never what for
// — so it reads off the player records instead. A getter like every other
// field: the view is built once and cached, so a plain array would be correct
// exactly until somebody readied. A fresh array each read, because nothing
// downstream needs its identity and handing out the records themselves would
// hand out the campaigns hanging off them.
function makeView(campaign, player, players) {
  const v = { playerId: player.id };
  for (const key of VIEW_FIELDS) {
    Object.defineProperty(v, key, { get: () => campaign[key], enumerable: true });
  }
  Object.defineProperty(v, "taskForce", {
    get: () => [...players.values()].map((p) => ({ id: p.id, name: p.name, ready: p.ready })),
    enumerable: true,
  });
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
function deployCommand(campaign, cmd, player) {
  // "A squad deploys to one mission per day" (design/campaign-pacing.md,
  // decision 1). The cap is enforced HERE and not at the ready gate, which
  // never sees a deploy — and with config.dayPerDeploy off there is no cap at
  // all, which is what that setting has always restored. Without this the knob
  // does nothing: deploy, resolve, deploy, resolve, ready is one day and any
  // number of missions.
  if (config.dayPerDeploy && player.deploys >= 1) {
    return fail("This squad has already deployed today. The day turns when every commander is ready.");
  }

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

  player.deploys += 1;
  return { ok: true, mission: lead, level: lead.level, squad };
}

export function createSession(opts = {}) {
  // `opts.state` seats a caller-built campaign as the first player and takes its
  // world; `opts.world` supplies the world directly. Both exist for tests — the
  // game passes neither.
  const seatOne = opts.state || null;
  const world = opts.world || (seatOne && seatOne.world) || createWorld();

  // A seat is an id or an { id, name }. Names are cosmetic — the design rules
  // out any mechanical difference between nations — but the task-force strip
  // has to print WHO, by name, so the name travels with the seat rather than
  // living in src/main.js where the session cannot reach it.
  const seats = (opts.players || ["p1"]).map((p) => (typeof p === "string" ? { id: p, name: p } : p));
  const ids = seats.map((p) => p.id);

  // The recruit pool is DEALT here (S3), because this is the only thing that
  // knows how many bases there are. One share per seat, each authored recruit
  // to exactly one of them; at one seat the share is the whole pool in authored
  // order, so the plain single-player URL is untouched.
  //
  // `opts.state` is the exception, and it is stated rather than defended: that
  // seat holds a campaign somebody else already built, with the entire pool in
  // it, so a session opened that way is NOT dealt and the later seats fall back
  // to their own full copies. The hatch exists for tests; the game never passes
  // it. A test that wants a deal builds the session without it.
  const hands = seatOne ? [] : dealRecruits(ids.length);

  // A Map, iterated everywhere. No players[0], no .a/.b, no "the other player"
  // that returns exactly one. S4's readiness and S5's pending choice become
  // fields on these records, so those slices add a field, not a structure.
  const players = new Map();
  // Indexed off the id list, not off players.size — a duplicate id in the list
  // does not grow the Map, and that would deal one hand to two seats.
  seats.forEach((seat, i) => {
    const campaign = i === 0 && seatOne ? seatOne : createPlayerState(world, hands[i]);
    // `ready` and `deploys` are the round's state. Both are cleared by the gate
    // and by nothing else — a flag that outlives its turn strands the task
    // force, and a count that does caps a commander out of the next day.
    players.set(seat.id, { id: seat.id, name: seat.name, campaign, view: null, ready: false, deploys: 0 });
  });

  // A day is spent by everybody, whoever asked for it: the world half runs once
  // inside advanceDay, and every OTHER player's half runs here. Without this the
  // commander who did not press the button never finishes a weapon and never
  // heals, on a day their doom clock was charged for.
  function restEveryoneElse(acting) {
    for (const other of players.values()) {
      if (other !== acting) restDay(other.campaign);
    }
  }

  // THE READY GATE (S4). The only thing in the game that spends a day.
  //
  // Everything about a round ends here: the world half runs once inside
  // advanceDay, every other player's half runs beside it, and both pieces of
  // round state — the ready flags and the deploy counts — are cleared on the
  // way out. One day, whether nobody, one or every commander deployed.
  //
  // The refusal is advanceDay's own, passed back unreshaped: a finished
  // campaign answers "The campaign is over." and the flags are deliberately
  // left as they are, because nothing can turn another day anyway and clearing
  // them would only invite another attempt.
  function turnTheDay(actor) {
    const res = advanceDay(actor.campaign);
    if (!res.ok) return res;
    restEveryoneElse(actor);
    for (const p of players.values()) {
      p.ready = false;
      p.deploys = 0;
    }
    return { ...res, dayTurned: true };
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
      case "ready": {
        // A toggle by default; an explicit value is for a caller that knows
        // which way it wants (S5's stand-down has one).
        const want = cmd.ready === undefined ? !player.ready : !!cmd.ready;

        // Standing down, or readying while somebody is still deciding: no day,
        // and the answer carries no day summary. The hub has to branch on that
        // — reading `finished` off this result is a crash, not an empty list.
        if (!want || [...players.values()].some((p) => p !== player && !p.ready)) {
          player.ready = want;
          const waiting = [...players.values()].filter((p) => !p.ready).length;
          return { ok: true, ready: want, dayTurned: false, waitingOn: waiting };
        }

        // Last one in. The day turns on this click and there is no window to
        // stand down again — design/multiplayer.md is explicit about that.
        player.ready = true;
        const res = turnTheDay(player);
        if (!res.ok) {
          player.ready = false; // nothing turned, so nothing is committed
          return res;
        }
        // The summary names only THIS player's finished jobs. What the others
        // built is their own business — the design says a base is invisible —
        // and the shared campaign log is where they read their own.
        return { ...res, ready: true };
      }
      case "deploy":
        return deployCommand(campaign, cmd, player);
      case "missionResult": {
        // No day is spent here any more. Until S4 this had to watch world.day
        // across the call to work out whether applyMissionResult had charged
        // one; the charge is gone, so the watcher is gone with it. A mission
        // resolving is not a day — the ready gate is.
        //
        // applyMissionResult returns the state object itself; returning that
        // would hand the campaign back through the seam we just built.
        applyMissionResult(campaign, cmd.result);
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
    if (!player.view) player.view = makeView(player.campaign, player, players);
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
