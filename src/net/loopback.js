// ---------------------------------------------------------------------------
// THE LOOPBACK TRANSPORT  (tech/multiplayer-session.md, W1)
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
// `takeRound` is here too and is the one thing NO client may call: a round is
// the page's to sequence, not a seat's to read, and W2 turns this pull into a
// push. It is on the transport rather than on a client for that reason.
// ---------------------------------------------------------------------------

import { toWire } from "./wire.js";

export function createLoopback(session) {
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
    // before, which is what keeps this slice invisible.
    view: (playerId) => session.view(playerId),

    // The round, whole and in order, for the HOST. Not a client's, not crossing
    // the wire yet: it still carries the raw lead and live roster soldiers, and
    // projecting it is W2's job.
    takeRound: () => session.takeRound(),

    playerIds: () => session.playerIds(),
  };
}
