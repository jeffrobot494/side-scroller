// ---------------------------------------------------------------------------
// THE ROOM REGISTRY  (tech/multiplayer-service.md, V1)
//
// A room is one `createSession` plus its seats, held by the process rather than
// by a page. This is the half of the service that is NOT HTTP: it takes values
// and returns values, so the round-closing and the broadcast are drivable by a
// suite with no listener bound and no browser in the picture. `server.mjs` is
// three routes over this and nothing else.
//
// It is the loopback's twin, and deliberately so — `src/net/loopback.js` builds
// the session inside itself for the same reason this does (the announcement
// channel has to exist before the session that announces down it), keeps the
// seat snapshots on the transport for the same reason (there is nowhere on a
// three-name client to hold a registry of every other seat), and refreshes
// every seat on every command for the same reason (one command routinely moves
// the day, the doom clock, the board and another commander's readiness).
//
// What is NEW here, and is the whole of what a room adds:
//
//   1. A SEAT IS A TOKEN. The page is no longer the host and cannot be trusted
//      to say which commander it is, so a command carries a token and the
//      registry — not the caller — decides whose command it is. This is the
//      only authority that moved: `src/game/session.js` still decides what a
//      command does, and a room that started adjudicating would be the second
//      authority the session exists to prevent.
//   2. A ROUND IS ROUTED, not drained. In one page the host took the whole
//      round and sequenced it; here each dispatch is pushed at the seat that
//      owns it, and no other seat can be handed one.
//   3. A SEAT CAN BE LISTENING TO NOTHING. Between a browser closing and one
//      opening, a dispatch has nowhere to go, so it is held.
//
// DOM-free and storage-free, inherited from `src/game/session.js` and pinned by
// the source scan in `test/session.test.mjs` — the suite runs under a globally
// installed DOM, so naming `document` here would stay green forever otherwise.
// ---------------------------------------------------------------------------

import { toWire } from "./wire.js";
import { createSession } from "../game/session.js";

// Commander names, cosmetic as ever — the design rules out any mechanical
// difference between them. The same list lives in `src/main.js` for the
// loopback path, and V2 is where the two converge: that file stops naming its
// own seats when a URL with a room in it picks the remote transport.
const COMMANDERS = ["USA", "China", "Brazil"];
const MAX_SEATS = 6;

// A token is a LINK, not an account (Approximation 3): whoever holds a seat's
// URL is that seat, and there is no login to check it against. WebCrypto where
// there is one; the fallback is weak and is named as weak rather than dressed
// up, because a room without `crypto` is a room whose links are guessable.
function newToken() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// Seats for a room. A number opens that many; an explicit list is for a caller
// that already knows who is playing (the suite, and V3's room-creation screen).
function rosterFor(players) {
  if (Array.isArray(players)) {
    return players.map((p, i) =>
      typeof p === "string" ? { id: p, name: p } : { id: p.id, name: p.name || p.id || `p${i + 1}` }
    );
  }
  const n = Math.max(1, Math.min(MAX_SEATS, Math.floor(Number(players) || 2)));
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: COMMANDERS[i] || `Commander ${i + 1}`,
  }));
}

export function createRooms() {
  // Both keyed by a string the caller supplies, and both unbounded: a room with
  // nobody in it stays here until the process restarts (Approximation 4).
  const rooms = new Map();
  const byToken = new Map();

  function createRoom(spec = {}) {
    const roster = rosterFor(spec.players);
    const room = { id: newToken(), seats: new Map(), session: null, announced: [] };

    for (const s of roster) {
      const seat = {
        id: s.id,
        name: s.name,
        token: newToken(),
        room,
        // The seat's latest snapshot — `toWire(session.view(id))`, identical to
        // what the loopback holds, and the thing a stream re-sends on attach.
        snapshot: null,
        // Dispatches this seat has been sent that no stream was open to carry.
        // Held rather than dropped; what happens to one that WAS delivered to a
        // browser that then vanished is Approximation 12 and is not solved here.
        pending: [],
        // Every open stream on this seat. A Set, not one: two tabs on the same
        // link are two listeners, and V4 reads `.size` for presence.
        listeners: new Set(),
      };
      room.seats.set(seat.id, seat);
      byToken.set(seat.token, seat);
    }

    room.session = createSession({
      players: roster,
      // BUFFERED, not pushed on arrival — the one ordering decision this module
      // makes. `announce` fires inside `run()`, BEFORE `changed`, so a dispatch
      // sent from here would reach the seat ahead of the snapshot that the same
      // command produced, and the browser would start a mission off a campaign
      // one command stale. Held until `command()` has the answer in hand, then
      // routed. (What the network then does with two connections is not ours;
      // the page must not depend on it, which is why the loopback's `takeRound`
      // ordering comment stays true and this one is stated beside it.)
      announce: (round) => {
        room.announced = round;
      },
      changed: () => refresh(room),
    });

    // Before anything asks. A stream can attach before any command is sent, and
    // what it is owed on attach is a snapshot.
    refresh(room);
    rooms.set(room.id, room);

    return {
      roomId: room.id,
      seats: roster.map((s) => ({
        playerId: s.id,
        name: s.name,
        token: room.seats.get(s.id).token,
      })),
    };
  }

  // Every seat's snapshot, and a push to whoever is listening. The broadcast, in
  // other words — same trigger and same unconditionality as the loopback's: a
  // refused command can still have moved the world, because `closeRound` empties
  // every pending list before `endRound` is in a position to refuse the day.
  function refresh(room) {
    for (const seat of room.seats.values()) {
      seat.snapshot = toWire(room.session.view(seat.id), `view ${seat.id}`);
      for (const send of seat.listeners) send("snapshot", seat.snapshot);
    }
  }

  // The announced round, split by owner. A dispatch carries `playerId` because
  // W2 put it there for the page to sequence on; here it is the ROUTING, and it
  // is the reason a room can hand one commander's locked lead and squad to that
  // commander and to nobody else.
  function routeRound(room) {
    const round = room.announced;
    room.announced = [];
    for (const d of round) {
      const seat = room.seats.get(d.playerId);
      // A dispatch for a seat this room does not have cannot happen — the
      // session's players ARE these seats — and is dropped rather than thrown,
      // because the alternative is one bad dispatch killing a live campaign.
      if (seat) seat.pending.push(toWire(d, `dispatch ${d.dispatchId}`));
    }
    for (const seat of room.seats.values()) drain(seat);
  }

  // Hand a seat's held dispatches to its open streams. Nothing listening means
  // nothing is delivered and nothing is lost.
  function drain(seat) {
    if (!seat.listeners.size || !seat.pending.length) return;
    const queue = seat.pending;
    seat.pending = [];
    for (const d of queue) for (const send of seat.listeners) send("dispatch", d);
  }

  return {
    createRoom,

    // Who a token is, or null. The routes ask this first so an unknown token is
    // a 404 rather than a thrown command — the token is the credential, and a
    // bad one is not a malformed command.
    seatFor(token) {
      const seat = byToken.get(token);
      return seat ? { roomId: seat.room.id, playerId: seat.id, name: seat.name } : null;
    },

    // A command from a seat, answered. Both directions cross `toWire`, exactly
    // as they do in-process: what makes this real is that the payload is now
    // about to be JSON on a socket, and the walk that has been rejecting Maps
    // since W1 is what stops it being discovered there.
    //
    // Throws on an unknown token. The routes never reach that (they check with
    // `seatFor` first) and a caller that does has a bug, not a bad request.
    command(token, cmd) {
      const seat = byToken.get(token);
      if (!seat) throw new Error(`No such seat: ${token}`);
      const outbound = toWire(cmd, `command ${cmd && cmd.type}`);
      const answer = toWire(seat.room.session.command(seat.id, outbound), `answer to ${cmd && cmd.type}`);
      // After the answer exists, never before — see the buffer above.
      routeRound(seat.room);
      return answer;
    },

    // This seat's latest snapshot, without opening a stream. The suite's window
    // onto the broadcast, and nothing in the routes uses it.
    snapshot(token) {
      const seat = byToken.get(token);
      return seat ? seat.snapshot : null;
    },

    // Open this seat's stream. `send(event, data)` is called with "snapshot" or
    // "dispatch"; `server.mjs` turns those into SSE frames and the suite pushes
    // them onto an array. Returns the detach, or null for an unknown token.
    //
    // A fresh snapshot goes out immediately, which is what makes a reconnecting
    // browser correct with no replay: a snapshot is the whole campaign as this
    // seat may see it, so there is no missed-delta problem to solve. Held
    // dispatches follow it.
    attach(token, send) {
      const seat = byToken.get(token);
      if (!seat) return null;
      seat.listeners.add(send);
      send("snapshot", seat.snapshot);
      drain(seat);
      return () => seat.listeners.delete(send);
    },

    // How many streams this seat has open. V4's presence reads this — the
    // producer is the registry and never the session, because whether a socket
    // is open is a fact about the transport and the session must not learn it.
    listeners(token) {
      const seat = byToken.get(token);
      return seat ? seat.listeners.size : 0;
    },

    hasRoom: (roomId) => rooms.has(roomId),
    roomCount: () => rooms.size,
  };
}
