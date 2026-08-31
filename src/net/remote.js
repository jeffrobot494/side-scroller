// ---------------------------------------------------------------------------
// THE REMOTE TRANSPORT  (tech/multiplayer-service.md, V2)
//
// The browser half. The session is in `server.mjs` now; this is what a page
// holds in its place — commands out over `fetch`, snapshots and dispatches in
// over `EventSource`, and the same stable handle the loopback hands out.
//
// BROWSER-ONLY BY DESIGN, and it is the one file in `src/net/` that is. The
// DOM-free rule splits here rather than being quietly bent: `loopback.js`,
// `wire.js`, `client.js` and `rooms.js` run in both places and name no browser
// global; this one names `fetch` and `EventSource` because it is the half that
// only ever runs in a tab. `test/session.test.mjs` scans the first set and
// deliberately does not scan this.
//
// THREE THINGS ARE NOT THE LOOPBACK, and each is a property the loopback got
// for free that a network does not give:
//
//   1. IT IS NOT READY WHEN IT RETURNS. `createLoopback` fills every seat's
//      snapshot synchronously before returning, and `src/main.js` relied on
//      that to build the hub at module top level. A snapshot that arrives over
//      a network cannot be there yet, so this resolves a PROMISE — the page
//      waits for the first snapshot before it mounts anything.
//   2. THERE IS NO ROUND TO DRAIN. A room page is not the host: the server
//      routes each dispatch to the seat that owns it, so one arrives here
//      pushed, and `takeRound` is deliberately ABSENT rather than faked. The
//      page's dispatcher forks on that absence.
//   3. A COMMAND CAN FAIL. Not "be refused" — fail, with nothing on the other
//      end. See `send`.
//
// What it is NOT, still: ordering across seats, loss, and two commanders racing
// on the same lead are the server's, and it already answers them by holding one
// session. This file has one seat and one connection.
// ---------------------------------------------------------------------------

import { toWire } from "./wire.js";
import { makeHandle } from "./handle.js";

// The seat's whole address. A token identifies a room AND a seat, so nothing
// else has to be in the URL — and whoever holds it IS that seat, which is
// Approximation 3 and the reason this is a link rather than a login.
export function createRemote(token, opts = {}) {
  const base = opts.base || "";
  // Injectable for the same reason the session takes its channels at
  // construction: something has to be able to drive this without a browser.
  const Stream = opts.EventSource || globalThis.EventSource;
  const post = opts.fetch || ((...args) => globalThis.fetch(...args));

  let snapshot = null;
  let handle = null;
  let watcher = null;
  let play = null;
  // Dispatches that arrived before the page installed its player. In practice
  // one: the page mounts on the first snapshot and installs immediately, and a
  // dispatch cannot precede a snapshot because the server routes the round
  // after the command that closed it has answered (V1).
  const held = [];

  // COMMANDS ARE SERIALISED, one in flight per seat. The loopback's suite pins
  // "answers arrive in send order" and calls it the one wire property a
  // loopback can honestly claim — `fetch` does NOT claim it, and two commands
  // in flight can answer in either order. A double-clicked Ready that resolved
  // backwards would render the hub off the wrong answer. The cost is one
  // round trip of latency on a game that advances a day at a click, which is
  // no cost at all.
  let tail = Promise.resolve();

  const transport = {
    // A command from this seat. The token says who — the body never does.
    //
    // Refused SYNCHRONOUSLY if it is not data, exactly as the loopback refuses
    // it, so the stack still points at whoever built the command. This is the
    // half of the wire rule that survived the move to HTTP: on the server, an
    // inbound body has already been through JSON.parse and cannot carry a Map,
    // so THIS is now the only place an outbound command is checked at all.
    send(playerId, cmd, deliver) {
      const outbound = toWire(cmd, `command ${cmd && cmd.type}`);
      tail = tail
        .then(() =>
          post(`${base}/api/command`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, cmd: outbound }),
          })
            .then((r) => r.json())
            // A LOST COMMAND READS AS A REFUSED ONE. Every hub write site
            // renders inside its answer callback, so a send that simply never
            // answers leaves a screen mid-click forever — a worse failure than
            // a wrong one, because there is nothing on screen to tell you. The
            // shape is the session's own refusal shape, so no caller learns a
            // new one, and the campaign is untouched: the server either ran the
            // command or did not, and the next snapshot says which.
            //
            // The failure is turned into an ANSWER here, rather than caught
            // after `deliver` — a catch downstream of the render would also
            // swallow a throw from inside the hub and report it to the player
            // as a lost connection, which is a wrong diagnosis for a bug in a
            // screen.
            .then(undefined, (e) => ({
              ok: false,
              reason: `Lost contact with the room. ${e && e.message ? e.message : ""}`.trim(),
            }))
            .then((answer) => {
              if (deliver) deliver(answer);
            })
        )
        // A THROWING RENDER MUST NOT STOP THE QUEUE. `deliver` runs the hub's
        // render, and an exception in it would otherwise reject this chain for
        // good — every later command in the session would be dropped in silence,
        // which reads as a game that stopped responding to clicks. Rethrown out
        // of band so it still reaches the console as the unhandled error it is.
        .catch((e) => {
          setTimeout(() => {
            throw e;
          });
        });
    },

    // This seat's handle, and there is only ever one seat. A mismatched id is a
    // THROW rather than a shrug: the page builds its client off the snapshot's
    // own `playerId`, so asking for another seat means a binding has drifted,
    // and the seam exists to make that loud.
    view(playerId) {
      if (playerId !== undefined && playerId !== snapshot.playerId) {
        throw new Error(`This seat is ${snapshot.playerId}, not ${playerId}`);
      }
      return handle;
    },

    // The page's repaint, called on every snapshot after the first. Same
    // contract as the loopback's, and the same reason: a commander's screen has
    // to show the other one readying and the shared clock moving without them
    // clicking anything.
    watch(fn) {
      watcher = typeof fn === "function" ? fn : null;
    },

    // The round, PUSHED. Where the loopback offers `takeRound` to a host that
    // drains the whole thing, this offers one dispatch to the one seat it
    // belongs to. `takeRound` is absent on purpose — the page forks on which of
    // the two exists rather than on a flag, so a transport cannot half-answer.
    onDispatch(fn) {
      play = typeof fn === "function" ? fn : null;
      if (!play) return;
      while (held.length) play(held.shift());
    },

    playerIds: () => [snapshot.playerId],

    // The seat, by name, for anything that has to print WHO this page is
    // without going through a view.
    seat: () => ({ id: snapshot.playerId, name: nameOf(snapshot) }),
  };

  // The commander's own name, off the task-force strip the view already
  // carries. A room's seats are named by the server, so the page has no list of
  // its own to look one up in — which is the subtraction V2 makes from
  // `src/main.js`, not an addition to the view.
  function nameOf(snap) {
    const me = (snap.taskForce || []).find((c) => c.id === snap.playerId);
    return me ? me.name : snap.playerId;
  }

  return new Promise((resolve, reject) => {
    if (!Stream) return reject(new Error("This browser has no EventSource."));
    const es = new Stream(`${base}/api/stream?token=${encodeURIComponent(token)}`);

    es.addEventListener("snapshot", (e) => {
      snapshot = JSON.parse(e.data);
      if (handle) {
        // Every snapshot after the first is a repaint. The handle is NOT
        // rebuilt — the hub captured it in its constructor and the ambient
        // layer holds it in a module binding, so a fresh object per snapshot
        // would leave both pointed at one that stops updating.
        if (watcher) watcher();
        return;
      }
      handle = makeHandle(() => snapshot);
      transport.close = () => es.close();
      resolve(transport);
    });

    es.addEventListener("dispatch", (e) => {
      const d = JSON.parse(e.data);
      if (play) play(d);
      else held.push(d);
    });

    // EventSource retries a dropped connection by itself, and a reconnect costs
    // nothing here: the server sends a fresh snapshot on attach, and a snapshot
    // is the whole campaign this seat may see — there is no missed delta to
    // replay. So an error AFTER the first snapshot is left alone deliberately.
    //
    // An error BEFORE it is fatal and is reported: a bad token answers 404, and
    // EventSource does not retry a non-200 at all, so the page would otherwise
    // wait forever on a room that will never speak to it.
    es.onerror = () => {
      if (handle) return;
      es.close();
      reject(new Error("Could not reach that room — the link may be stale, or the server may have restarted."));
    };
  });
}

// ---------------------------------------------------------------------------
// OPENING ONE, AND LINKING TO IT  (V3)
//
// The other two things a browser does with the service, and neither of them is
// a transport: one opens a room, the other turns a token into the URL that
// reaches it. They live here because `createRemote` is the third — a seat is a
// link, and this is the file that both makes the link and consumes it. Split
// across two modules, the two halves of that one sentence could disagree about
// what a seat's URL looks like.
// ---------------------------------------------------------------------------

// Open a room and get its seats back, tokens and all. `spec` is what
// `createRoom` takes — a player count, or an explicit seat list.
export function openRoom(spec = {}, opts = {}) {
  const base = opts.base || "";
  const post = opts.fetch || ((...args) => globalThis.fetch(...args));
  return post(`${base}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spec),
  })
    .then((r) => r.json())
    .then(
      (room) => {
        if (!room || !Array.isArray(room.seats) || !room.seats.length) {
          throw new Error("Something answered /api/rooms, but not with a room.");
        }
        return room;
      },
      // TWO HANDLERS RATHER THAN A `.catch`, so this one cannot swallow the
      // check above it. What it catches is the ordinary case and the one worth
      // spelling out: single-player is static files, so the obvious way to run
      // this repo has no room service in it at all and answers this POST with a
      // 501 and some HTML. "Failed to fetch" would send somebody looking for a
      // network fault that isn't there.
      () => {
        throw new Error(
          "No room service answered. A room needs `node server.mjs` running — a plain file server can serve the single-player game but cannot hold a campaign."
        );
      }
    );
}

// A seat's whole address, built off the page that is handing it out so a room
// opened on a laptop yields links that name that laptop rather than localhost.
export function seatLink(href, token) {
  const url = new URL(href);
  // THE WHOLE QUERY IS REPLACED, not appended to. This is called from the lobby
  // page, whose own URL carries `?room=N`, and a seat link that kept that would
  // open a fresh room every time somebody followed it — handing each commander
  // their own private campaign while both believed they were playing one.
  url.search = `seat=${encodeURIComponent(token)}`;
  url.hash = "";
  return url.href;
}
