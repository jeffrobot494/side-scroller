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
  canSee,
  sharerFor,
  sharedWithBy,
  grantLead,
  registerCommanders,
} from "./state.js";
import { dealRecruits } from "./soldiers.js";
import { WEAPONS } from "./content.js";
import { config } from "./config.js";

// The campaign fields a player can see. `highWins` is deliberately absent —
// nothing in the hub reads it (only state.js's own finale gate does), and S7
// did not change that: mockup §6 counts days, missions and soldiers, and
// nothing in the design shows a commander how close they are to the gate. The
// field stays off the view until something is drawn that wants it.
//
// `outcome` is still here and still read through, but since S7 it is COMPUTED
// on the campaign rather than aliased off the world — three values now, not
// two. The view neither knows nor cares. See src/game/state.js.
const VIEW_FIELDS = [
  "day",
  "money",
  "campaignHealth",
  "recruits",
  "roster",
  "armory",
  "stores",
  "building",
  // `leads` is NOT here since S6 — it is defined separately below, because it
  // is filtered and mapped rather than read through. It is still on the view.
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
// The fields of a lead a commander is allowed to hold. Exact, and pinned by the
// suite: `level` and `report` are deliberately absent (the hub renders neither,
// and `level` is the whole generated map), and so is `seenBy`.
//
// `sharedWith` is the ONE thing this projection says about another commander's
// board, and it is only ever the reader's own doing: the commanders they handed
// this lead to. Board privacy (design/multiplayer.md, decision 4) is about what
// you cannot learn — a player who shared a lead already knows who has it, and
// the alternative is a disclosure they cannot see the consequence of. Who ELSE
// holds it, and who gave it to THEM, stays invisible.
function projectLead(lead, playerId, nameOf) {
  return {
    id: lead.id,
    name: lead.name,
    brief: lead.brief,
    difficulty: lead.difficulty,
    daysLeft: lead.daysLeft,
    winsCampaign: !!lead.winsCampaign,
    // Who handed it to you, or null. Never who ELSE holds it.
    sharedBy: nameOf(sharerFor(lead, playerId)),
    // Who YOU handed it to. Empty for a lead you have not disclosed.
    sharedWith: sharedWithBy(lead, playerId).map(nameOf),
  };
}

// What a DISPATCH may carry (W2). The second outbound channel, and the one that
// until now carried the raw lead: `seenBy` is a Map, so the payload was not even
// legal on the wire, and the generated level was in there twice — once as
// `level` and again inside `mission.level`.
//
// The field list is not a judgement about what looks necessary. It is what the
// mission and the results screen READ, which is a shorter list than it looks:
// `applyMissionResult` matches on ids and reads `difficulty`, `threatReward` and
// `winsCampaign` off the LIVE lead in its own campaign, never off what comes
// back from the mission.
//
// `seed` is the field to be careful with. It is absent from `projectLead` (a
// commander has no use for it), and a mission handed no seed installs no random
// stream and plays on — so dropping it here would un-seed every mission and
// nothing would go red. tech/mission-determinism.md hangs off this one number.
function projectDispatch(d) {
  return {
    dispatchId: d.dispatchId,
    playerId: d.playerId,
    mission: { id: d.mission.id, name: d.mission.name, seed: d.mission.seed },
    // Whole, and once. Regenerating it from the seed needs the length band and
    // the pressure scale, which makeLead draws and does not keep — see
    // Approximation 7.
    level: d.level,
    squad: d.squad.map((s) => ({
      // The weapon whole: the reload path, the sound layer and every effect in
      // combat.js read it.
      weapon: s.weapon,
      // Seven fields. `record` is deliberately not among them — nothing in
      // src/mission/ touches it, and it is the soldier's whole career.
      data: {
        id: s.data.id,
        name: s.data.name,
        callsign: s.data.callsign,
        wounds: s.data.wounds || 0,
        stats: {
          health: s.data.stats.health,
          aim: s.data.stats.aim,
          speed: s.data.stats.speed,
        },
      },
    })),
  };
}

function makeView(campaign, player, players, round) {
  const v = { playerId: player.id };
  for (const key of VIEW_FIELDS) {
    Object.defineProperty(v, key, { get: () => campaign[key], enumerable: true });
  }

  // `leads` is the second field that is MAPPED rather than passed through (S6),
  // and for the same reason `pending` is: handing over the live object hands
  // over more than the reader may have. A lead carries `seenBy`, which states
  // exactly who else is looking at it — the other commander's board, the one
  // thing design/multiplayer.md says is invisible. So this filters AND maps.
  //
  // The cost is lead identity through the view. Nothing needs it: the hub reads
  // names and ids, and deployCommand resolves the real lead off the campaign.
  Object.defineProperty(v, "leads", {
    get: () =>
      campaign.leads
        .filter((l) => canSee(l, player.id))
        // Names are resolved HERE and stored nowhere: the lead holds ids, and a
        // commander's name is a display detail the view is the last place to
        // know about.
        .map((l) => projectLead(l, player.id, (id) => (id && players.get(id) ? players.get(id).name : null))),
    enumerable: true,
  });
  Object.defineProperty(v, "taskForce", {
    get: () => [...players.values()].map((p) => ({ id: p.id, name: p.name, ready: p.ready })),
    enumerable: true,
  });

  // THIS commander's pending deployments and nobody else's (S5). Projected,
  // not handed over: the deploy screen needs the lead, the squad ids and the
  // weapon map it re-renders its selects from, and handing over the choice
  // itself would hand over live soldier references the hub has no business
  // writing through. `weapons` is copied for the same reason — the hub mutates
  // its own copy on every select change.
  Object.defineProperty(v, "pending", {
    get: () =>
      player.pending.map((c) => ({
        leadId: c.mission.id,
        leadName: c.mission.name,
        soldierIds: c.squad.map((x) => x.data.id),
        weapons: { ...c.weapons },
      })),
    enumerable: true,
  });

  // Mockup §4's "Elsewhere today": which lead every OTHER commander took this
  // round, or that they held at base. The one thing about another commander
  // the design lets you learn after a round — never whether they won, who
  // died, or what they carried out. Self is filtered out because the screen
  // reading this is already the commander's own.
  Object.defineProperty(v, "elsewhere", {
    get: () => round.last.filter((e) => e.id !== player.id),
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

// Give back everything committing a choice charged. `record.missions` is the
// only thing a commit writes into the campaign, and it is written per soldier —
// so releasing has to walk the same squad. The deploy COUNT is not refunded
// here because it is not stored: the cap reads `player.pending.length`, so the
// list and the count are one fact and cannot drift apart.
function releaseChoice(choice) {
  for (const x of choice.squad) x.data.record.missions -= 1;
}

// Validate the whole deploy BEFORE writing any of it. The hub's old loop
// incremented record.missions as it walked the squad, so a rejection halfway
// through would have left some soldiers charged for a mission that never ran.
//
// Since S5 this does not START a mission — it HOLDS one. The assembled
// `{ mission, level, squad }` goes onto the player record as a pending choice
// and is handed out only when the round locks. Two things fall out of holding
// the lead OBJECT rather than its id: a board filter cannot strip it out from
// under the mission, and it is already the payload the mission scene takes.
function deployCommand(campaign, cmd, player) {
  // Re-committing to the SAME lead replaces the choice rather than stacking
  // beside it, which is what lets the deploy screen be reopened and edited.
  // Done as one command on purpose: release-then-deploy from the hub would
  // leave a window where a rejected second half loses a commitment that was
  // valid.
  const replacing = player.pending.findIndex((c) => c.mission.id === cmd.leadId);

  // "A squad deploys to one mission per day" (design/campaign-pacing.md,
  // decision 1). The cap is enforced HERE and not at the ready gate, which
  // never sees a deploy — and with config.dayPerDeploy off there is no cap at
  // all, which is what that setting has always restored. A commander therefore
  // holds a LIST, not a slot: with a slot both settings would yield a
  // one-mission round and the knob would be inert.
  const held = player.pending.length - (replacing >= 0 ? 1 : 0);
  if (config.dayPerDeploy && held >= 1) {
    return fail("This squad has already deployed today. The day turns when every commander is ready.");
  }

  // The view filters and the command validates — two call sites of ONE
  // predicate, never two conditions written separately, or "visible" and
  // "deployable" drift apart. The refusal for a lead you cannot see is the
  // refusal for a lead that is gone, WORD FOR WORD: a distinct message would
  // confirm the lead exists, which is the one thing board privacy forbids.
  const lead = campaign.leads.find((l) => l.id === cmd.leadId);
  if (!lead || !canSee(lead, player.id)) return fail("That lead is no longer on the board.");

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

  // Validated — now write. The replaced choice is refunded first, so a soldier
  // who is on both squads is charged once rather than twice.
  if (replacing >= 0) {
    releaseChoice(player.pending[replacing]);
    player.pending.splice(replacing, 1);
  }

  const weapons = cmd.weapons || {};
  const squad = picked.map((s) => {
    s.record.missions += 1;
    return { data: s, weapon: resolveWeapon(campaign, s, weapons) };
  });

  // `weapons` is KEPT, which deployCommand used to consume and discard: the
  // deploy screen re-renders its selects off exactly this map, so a commander
  // who comes back to change their mind has to see what they picked.
  player.pending.push({
    mission: lead,
    level: lead.level,
    squad,
    weapons: { ...weapons },
  });

  return { ok: true, committed: true, leadId: lead.id, leadName: lead.name, pending: player.pending.length };
}

export function createSession(opts = {}) {
  // `opts.state` seats a caller-built campaign as the first player and takes its
  // world; `opts.world` supplies the world directly. Both exist for tests — the
  // game passes neither.
  const seatOne = opts.state || null;

  // The round's outbound channel (W2). Handed in at construction rather than
  // hung off the returned object, because the public surface below is asserted
  // to be exactly six names and that assertion is a statement about the seam.
  // A host that passes nothing keeps the pull and nothing else changes, which
  // is every test that is not about the transport.
  const announce = typeof opts.announce === "function" ? opts.announce : null;

  // The state-changed announcement (W3), handed in the same way and for the
  // same reason. It carries NOTHING: what changed is answered by reading a
  // view, and a session that tried to say what moved would be keeping a second
  // model of its own campaign. The host asks each seat's view for itself.
  const changed = typeof opts.changed === "function" ? opts.changed : null;

  // A seat is an id or an { id, name }. Names are cosmetic — the design rules
  // out any mechanical difference between nations — but the task-force strip
  // has to print WHO, by name, so the name travels with the seat rather than
  // living in src/main.js where the session cannot reach it.
  //
  // Read BEFORE the world is built (S6). A lead is stamped with who can see it
  // at the moment it is generated, and createWorld seeds the board on its way
  // out — so the world has to know its commanders before it exists.
  const seats = (opts.players || ["p1"]).map((p) => (typeof p === "string" ? { id: p, name: p } : p));
  const ids = seats.map((p) => p.id);

  const handed = opts.world || (seatOne && seatOne.world) || null;
  const world = handed || createWorld(ids);
  // A world we were handed already has a board, seeded before these seats
  // existed. Each of them is registered and given what is already there —
  // otherwise a seat opens on a permanently empty Operations. The game never
  // reaches this: it builds its world from the line above.
  if (handed) registerCommanders(world, ids);

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
  // that returns exactly one. Readiness (S4) and the pending choices (S5) are
  // fields on these records — both slices added a field, not a structure.
  const players = new Map();
  // Indexed off the id list, not off players.size — a duplicate id in the list
  // does not grow the Map, and that would deal one hand to two seats.
  seats.forEach((seat, i) => {
    // The seat's id goes to the CONSTRUCTOR (S7), which is how a campaign knows
    // whose finale it is placing. `seatOne` is a campaign somebody else built,
    // so that seat has no owner and falls back to single-player behaviour.
    const campaign = i === 0 && seatOne ? seatOne : createPlayerState(world, hands[i], seat.id);
    // `ready` and `pending` are the round's state. Both are cleared when the
    // round ends and by nothing else — a flag that outlives its turn strands
    // the task force, and a pending choice that does caps a commander out of
    // the next day, since the cap counts the list.
    players.set(seat.id, { id: seat.id, name: seat.name, campaign, view: null, ready: false, pending: [] });
  });

  // THE ROUND (S5). One object, never reassigned, because the views close over
  // it: `flight` is the round currently running its missions (null between
  // rounds) and `last` is what every commander is allowed to learn afterwards.
  //
  // `flight.outstanding` is a Set of DISPATCH ids, not a count. A bare integer
  // goes wrong three ways that nothing would catch — a result routed to the
  // wrong commander, a choice released without decrementing, a second report
  // for the same dispatch — and a set makes all three either impossible or a
  // no-op.
  const round = { flight: null, last: [], seq: 0 };

  // A day is spent by everybody, whoever asked for it: the world half runs once
  // inside advanceDay, and every OTHER player's half runs here. Without this the
  // commander who did not press the button never finishes a weapon and never
  // heals, on a day their doom clock was charged for.
  function restEveryoneElse(acting) {
    for (const other of players.values()) {
      if (other !== acting) restDay(other.campaign);
    }
  }

  // THE END OF A ROUND (S4's gate, S5's ordering). The only thing in the game
  // that spends a day.
  //
  // The world half runs once inside advanceDay, every other player's half runs
  // beside it, and the round's state is cleared on the way out.
  //
  // `actor` is whoever the day is charged against, and it decides exactly one
  // thing: whose fabrication the returned summary names. Everything else
  // advanceDay does is the world's. At the gate that is the commander who
  // readied last; at the end of a round with missions in it, it is the
  // commander whose mission reported last — because their results screen is
  // the one about to render, and printing another commander's finished jobs
  // there is precisely what "a base is invisible" forbids.
  //
  // The clear is UNCONDITIONAL, and that is a change from S4. It returned
  // advanceDay's refusal before clearing anything, so the first result of a
  // round that ends the campaign left every flag set and every choice
  // unreleased. Harmless — the campaign really was over — but a half-cleared
  // round is not a state anything else here is written against. The refusal
  // itself is still passed back unreshaped, in advanceDay's own words.
  //
  // Pending choices are empty by construction whenever this runs: closeRound
  // empties every list before either of its branches, and no deploy is
  // accepted while a round is in flight.
  // advanceDay names the leads that expired and arrived across the WHOLE world
  // board, and both lists reach a commander — through the day flash and through
  // the results screen's day line. After S6 that would name and count leads the
  // reader was never shown, which is the board leaking through the clock.
  // advanceDay cannot filter (it is handed a campaign and does not know whose
  // day it is); this does, because it already picked an actor.
  function ownSummary(res, actor) {
    if (!res.ok) return res;
    const mine = (leads) => (leads || []).filter((l) => canSee(l, actor.id)).map((l) => l.name);
    const out = { ...res, expired: mine(res.expiredLeads), arrived: mine(res.arrivedLeads) };
    delete out.expiredLeads;
    delete out.arrivedLeads;
    return out;
  }

  function endRound(actor) {
    const res = ownSummary(advanceDay(actor.campaign), actor);
    if (res.ok) restEveryoneElse(actor);
    for (const p of players.values()) p.ready = false;
    round.flight = null;
    return res.ok ? { ...res, dayTurned: true } : res;
  }

  // The last commander readied. Choices LOCK — there is no withdrawal from
  // here — and the round either runs its missions or, with nobody deployed, is
  // over the moment it began.
  //
  // What every commander learns afterwards is copied out HERE, before the
  // choices are released, because this is the only moment they all exist.
  function closeRound(actor) {
    const dispatches = [];
    const elsewhere = [];
    for (const p of players.values()) {
      elsewhere.push({ id: p.id, name: p.name, leads: p.pending.map((c) => c.mission.name) });
      for (const c of p.pending) {
        // The dispatch id is what the round's bookkeeping is keyed to, and it
        // is per-dispatch rather than per-player because dayPerDeploy off lets
        // one commander hold several.
        dispatches.push({
          dispatchId: `d${++round.seq}`,
          playerId: p.id,
          mission: c.mission,
          level: c.level,
          squad: c.squad,
        });
      }
      p.pending = [];
    }
    round.last = elsewhere;

    // Nobody deployed: there is nothing to wait for and the day turns on this
    // click, which is every case S4 could produce and why S4 needed no
    // separate arm.
    if (!dispatches.length) {
      const res = endRound(actor);
      return res.ok ? { ...res, ready: true } : res;
    }

    // Projected HERE, once, and stored projected: the announcement and
    // takeRound must hand over the same thing, or the page and the suite are
    // testing two different dispatches.
    //
    // This is also the moment the squad stops being live. A soldier held on two
    // of one commander's choices (dayPerDeploy off) now enters the second
    // mission at the wounds they had when the round locked, rather than the
    // wounds the first mission gave them mid-round.
    const outbound = dispatches.map(projectDispatch);
    round.flight = { dispatches: outbound, outstanding: new Set(outbound.map((d) => d.dispatchId)), taken: false };
    // After the flight exists, never before: a report arriving during the
    // announcement has to find one.
    if (announce) announce(outbound.map((d) => ({ ...d })));
    // The FOURTH answer `ready` can give: locked, no day yet. Without it this
    // falls into the readied-not-last arm and the hub prints "Waiting on 0
    // more."
    return { ok: true, ready: true, dayTurned: false, roundClosed: true, missions: dispatches.length };
  }

  // Every command, whatever it answers. The announcement is UNCONDITIONAL and
  // this wrapper is why: a refusal can still have moved the world. `closeRound`
  // empties every commander's pending list and writes `round.last` before
  // `endRound` is in a position to refuse the day, so a Ready that comes back
  // `ok: false` has already changed what three screens would draw.
  //
  // It fires BEFORE the answer goes back, because every hub write site renders
  // inside its answer callback. An announcement that landed afterwards would
  // leave all of them drawing one command stale.
  function command(playerId, cmd) {
    const res = run(playerId, cmd);
    if (changed) changed();
    return res;
  }

  function run(playerId, cmd) {
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
        if (round.flight) return fail("The round is under way.");

        // A toggle by default; an explicit value is for a caller that knows
        // which way it wants.
        const want = cmd.ready === undefined ? !player.ready : !!cmd.ready;

        // Standing down, or readying while somebody is still deciding: no day,
        // and the answer carries no day summary. The hub has to branch on that
        // — reading `finished` off this result is a crash, not an empty list.
        if (!want || [...players.values()].some((p) => p !== player && !p.ready)) {
          // Standing down releases whatever was pending, which is the clause
          // S4 could not build because nothing was pending yet. The refund
          // matters more than it looks: the cap counts the list, so a
          // commander who stood down to change their mind and kept the charge
          // could never commit again this round — which is exactly what
          // standing down is FOR.
          if (!want) for (const c of player.pending.splice(0)) releaseChoice(c);
          player.ready = want;
          const waiting = [...players.values()].filter((p) => !p.ready).length;
          return { ok: true, ready: want, dayTurned: false, waitingOn: waiting };
        }

        // Last one in. There is no window to stand down again —
        // design/multiplayer.md is explicit about that.
        player.ready = true;
        const res = closeRound(player);
        if (!res.ok) {
          player.ready = false; // nothing turned, so nothing is committed
          return res;
        }
        // The summary names only THIS player's finished jobs. What the others
        // built is their own business — the design says a base is invisible —
        // and the shared campaign log is where they read their own.
        return res;
      }
      case "deploy":
        if (round.flight) return fail("The round is under way.");
        return deployCommand(campaign, cmd, player);
      // Mockup §2's "Share with ▾". Disclosure is one-way, one-shot and
      // unverified in only one sense — you really do give the lead — but there
      // is no revocation and nothing tells you what they do with it.
      case "share": {
        if (round.flight) return fail("The round is under way.");
        const target = players.get(cmd.to);
        if (!target) return fail("No such commander.");
        if (target === player) return fail("You already have that lead.");
        // Resolved off the WORLD board, then checked — same two-step and same
        // deliberately identical refusal as a deploy. You cannot give away a
        // lead you were never shown, and the error must not admit it exists.
        const lead = campaign.leads.find((l) => l.id === cmd.leadId);
        if (!lead || !canSee(lead, player.id)) return fail("That lead is no longer on the board.");
        if (canSee(lead, target.id)) return fail(`${target.name} already has that lead.`);
        // Tagged with whoever handed it to YOU, not where it started: the tag
        // records the favour received, and there is no chain.
        grantLead(lead, target.id, player.id);
        return { ok: true, shared: true, leadName: lead.name, to: target.id, toName: target.name };
      }
      case "release": {
        // The deploy screen's own control. Standing down releases everything;
        // this releases ONE, because with dayPerDeploy off a commander can
        // hold several and changing your mind about one is not changing your
        // mind about all of them.
        if (round.flight) return fail("The round is under way.");
        const i = cmd.leadId
          ? player.pending.findIndex((c) => c.mission.id === cmd.leadId)
          : player.pending.length - 1;
        if (i < 0) return fail("Nothing is pending on that lead.");
        releaseChoice(player.pending[i]);
        player.pending.splice(i, 1);
        return { ok: true, released: true, pending: player.pending.length };
      }
      case "missionResult": {
        // applyMissionResult returns the state object itself; returning that
        // would hand the campaign back through the seam we just built.
        applyMissionResult(campaign, cmd.result);

        // ...and this is where the day comes from since S5. A round owes one
        // day, and it is spent when the LAST of that round's missions has
        // reported — not when the choices locked. Turning it first inverts the
        // game's oldest ordering (a win's reward has always been banked before
        // the doom tick that followed it) and lets a locked lead rot before its
        // own mission runs.
        //
        // An unknown or missing dispatch id is applied and otherwise ignored:
        // a second report for the same dispatch cannot drive the count past
        // zero, and a bare result outside a round is what several suites send.
        const flight = round.flight;
        if (!flight || !flight.outstanding.delete(cmd.dispatchId)) return { ok: true };
        if (flight.outstanding.size) return { ok: true };

        const turn = endRound(player);
        return turn.ok
          ? { ok: true, dayTurned: true, finished: turn.finished, expired: turn.expired, arrived: turn.arrived }
          : { ok: true, dayTurned: false, dayHeld: turn.reason };
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
    if (!player.view) player.view = makeView(player.campaign, player, players, round);
    return player.view;
  }

  // The round's dispatches go to the PAGE, not to a player and not through a
  // view. The only value that escapes a Ready click is the command's return,
  // read inside one commander's hub — and routing a round that way would put
  // every commander's locked lead and squad inside one commander's screen,
  // which is the exact thing the view is forbidden to carry. The page is not a
  // player: online, the server dispatches to each client, and src/main.js is
  // that dispatcher's stand-in.
  //
  // Taken once. A second call is an empty list rather than a replayed round.
  // Still here, and still the page's rather than a seat's. W2 gave the round a
  // push, and this stayed: the session's own suite drives the session with no
  // transport in front of it, and a host that installs no announcement (every
  // test but one) still has a way to collect a round.
  function takeRound() {
    const flight = round.flight;
    if (!flight || flight.taken) return [];
    flight.taken = true;
    return flight.dispatches.map((d) => ({ ...d }));
  }

  return {
    playerIds: () => [...players.keys()],
    playerCount: () => players.size,
    hasPlayer: (id) => players.has(id),
    command,
    view,
    takeRound,
  };
}
