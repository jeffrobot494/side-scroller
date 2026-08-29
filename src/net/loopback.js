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

  const session = makeSession((dispatches) => {
    pending = toWire(dispatches, "round");
  });

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

    // W1 hands over the session's own live view. W3 is where this becomes a
    // snapshot pushed to each client — the read half of the seam, and the half
    // that costs something. Until then the page reads exactly what it read
    // before, which is what keeps that slice invisible.
    view: (playerId) => session.view(playerId),

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
