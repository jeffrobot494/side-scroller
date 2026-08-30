// ---------------------------------------------------------------------------
// THE LOOPBACK TRANSPORT  (tech/multiplayer-session.md, W1–W2)
//
// The session and the page in one process, with a wire drawn between them
// anyway. Nothing here is faster, safer or more capable than calling the
// session directly — it is deliberately WORSE, in the two ways a real transport
// is worse, so that the code on either side is written for the real one:
//
//   1. an answer arrives later (a microtask), never as a return value
//   2. everything that crosses is data, checked and copied (see wire.js)
//
// What it is NOT: ordering, loss, latency and two clients racing are all absent,
// and cannot be simulated usefully here. That is T2's, and it is why this exists
// before the socket rather than with it.
//
// The session is reached through exactly its public surface — command and view.
// A round is the HOST's and no client's: `takeRound` is on the transport rather
// than on a client for that reason.
//
// W2 turned the round from a pull into a push, and the SESSION IS BUILT HERE for
// that reason. The announcement has to be handed to the session at construction
// (its public surface is six names and stays six names), so something has to
// exist before the session does to receive it. If the page built the session and
// handed it in, the dispatch would reach the host without crossing `toWire`,
// and "projected on the way out" would be proven by nothing.
// ---------------------------------------------------------------------------

import { toWire } from "./wire.js";

// One seat's stable handle over its latest snapshot (W3).
//
// An OBJECT, not an accessor function: `livingRoster(g)` and `soldierMaxHp(s)`
// are handed this directly by the hub and by the ambient layer, so it has to
// look like a campaign. Its identity never changes, because the hub captures it
// once in its constructor and the ambient layer holds it in a module-level
// binding — handing out a fresh object per refresh would leave both of them
// pointed at a snapshot that stops being updated.
//
// Every field READS THROUGH on access. That is not a style choice: advanceDay
// and applyMissionResult REPLACE `state.leads` and `state.roster` rather than
// mutating them, so a handle that copied field values at refresh time would be
// stale one command later while still pointing at the right snapshot.
function makeHandle(read) {
  const handle = {};
  for (const key of Object.keys(read())) {
    Object.defineProperty(handle, key, { get: () => read()[key], enumerable: true });
  }
  return handle;
}

// `makeSession` is called once, with the inbound round handler. The caller
// decides what session it is (seats, world, a seeded campaign); the transport
// decides only how the round gets out.
export function createLoopback(makeSession) {
  // The announced round, held until the host asks for it. NOT started on
  // arrival: `closeRound` runs inside `session.command`, so this fires BEFORE
  // the loopback delivers the answer the hub renders on — starting a mission
  // here would put the canvas on screen in the middle of the hub's render,
  // which is the hazard W1's ordering exists to avoid.
  let pending = [];

  // The seat snapshots and the handles over them. They live HERE and not on a
  // client because `connect` is a free function and a client's surface is three
  // names — there is nowhere on a client to keep a registry of every other
  // client, which is what "refresh every seat" needs.
  const snapshots = new Map();
  const handles = new Map();
  // What the host does when a snapshot moves. One watcher: the page.
  let watcher = null;

  const session = makeSession(
    (dispatches) => {
      pending = toWire(dispatches, "round");
    },
    // A BROADCAST, not a refresh of the seat that acted. One command routinely
    // moves shared world state and other seats' campaigns: the day, the doom
    // clock, lead expiry and arrivals, the world log every War Room renders,
    // another commander's readiness, and `share`, which is the one command that
    // puts a lead on somebody else's board.
    () => refresh()
  );

  function refresh() {
    for (const id of session.playerIds()) {
      snapshots.set(id, toWire(session.view(id), `view ${id}`));
    }
    if (watcher) watcher();
  }

  // Before anything asks: the hub's first render reads `money` and the ambient
  // layer steps once at mount, both before a command has ever been sent.
  for (const id of session.playerIds()) {
    snapshots.set(id, toWire(session.view(id), `view ${id}`));
    handles.set(id, makeHandle(() => snapshots.get(id)));
  }

  return {
    // A command from one seat. The answer is delivered, never returned — a
    // caller that wants it takes `deliver`. Both directions cross the wire, so
    // an answer that is not data fails as loudly as a command that is not.
    send(playerId, cmd, deliver) {
      const outbound = toWire(cmd, `command ${cmd && cmd.type}`);
      queueMicrotask(() => {
        const answer = session.command(playerId, outbound);
        if (deliver) deliver(toWire(answer, `answer to ${cmd && cmd.type}`));
      });
    },

    // The seat's handle over its own snapshot (W3) — never the session's live
    // projection, which is what a client could not possibly hold once it is in
    // another process. `session.view` is unchanged and still projects live: the
    // server half of the seam keeps its own suite meaningful.
    view: (playerId) => handles.get(playerId),

    // The host's repaint. Called after every broadcast, because a commander's
    // screen has to show the other one readying, the shared clock moving and a
    // lead arriving on their board without them clicking anything.
    watch(fn) {
      watcher = typeof fn === "function" ? fn : null;
    },

    // The round the session announced, whole and in order, drained once. The
    // page decides WHEN — off the `roundClosed` answer, the same signal it used
    // when this was a pull.
    takeRound() {
      const round = pending;
      pending = [];
      return round;
    },

    playerIds: () => session.playerIds(),
  };
}
