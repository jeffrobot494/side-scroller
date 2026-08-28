// ---------------------------------------------------------------------------
// THE CLIENT  (tech/multiplayer-session.md, W1)
//
// One seat's end of the transport. It is the whole of what a commander's screens
// are allowed to hold: a way to send a command, and a way to read that seat's
// view. No session, no other seat, and no round — the page is the host and keeps
// those.
//
// It is this small on purpose. Everything the hub could reach for and must not
// is absent by construction rather than by discipline, which is what makes the
// same object correct once it is talking to a socket instead of a loopback.
//
// A client per seat, even at one seat: single-player is a session with one
// player (S1) and stays a session with one player and one client.
// ---------------------------------------------------------------------------

export function connect(transport, playerId) {
  return {
    playerId,

    // Fire and be told later. `onAnswer` is optional — a caller that does not
    // care about the reply says so by not passing one, rather than by ignoring
    // a return value that no longer exists.
    send(cmd, onAnswer) {
      transport.send(playerId, cmd, onAnswer);
    },

    // This seat's view, and only this seat's. W1 hands back the session's live
    // projection; W3 makes it a snapshot without the caller noticing, which is
    // the reason the hub is given this accessor rather than the view itself.
    view() {
      return transport.view(playerId);
    },
  };
}
