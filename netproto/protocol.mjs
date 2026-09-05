// ---------------------------------------------------------------------------
// THE WIRE FORMAT, shared by the node server and the browser client.
//
// JSON, not binary, on purpose: the question this prototype asks is "how does
// server-authoritative FEEL", and at two players and a few hundred bytes a
// packet, JSON's overhead is invisible next to a 100ms round trip. The HUD
// prints bytes/sec so the moment that stops being true is visible rather than
// assumed.
//
// Every message is `{ t: <type>, ... }`.
//
//   client -> server
//     hello  { name }                      once, on connect
//     input  { seq, l, r, jump, fire, ax, ay }   the client's CURRENT input state
//     ping   { id, ct }                    ct = client clock, echoed back
//     cfg    { snapshotHz }                lab knob; server-wide, last writer wins
//
//   server -> client
//     welcome { id, world, tickHz, snapshotHz }
//     snap    { tick, st, ack, players, bullets, events }
//     pong    { id, ct, st }
//
// `ack` is the last input `seq` the server had consumed from THIS client when
// the snapshot was built. It is what lets the client measure the real
// input-to-pixels latency instead of guessing it from RTT.
// ---------------------------------------------------------------------------

export const TICK_HZ = 60;
export const DEFAULT_SNAPSHOT_HZ = 20;

// The input packet is sent at this rate regardless of render frame rate, so a
// 144Hz monitor does not flood the server and a 30Hz one is not starved.
export const INPUT_HZ = 60;

export const PROTOCOL_VERSION = 1;

export function encode(msg) {
  return JSON.stringify(msg);
}

export function decode(text) {
  try {
    const m = JSON.parse(text);
    return m && typeof m.t === "string" ? m : null;
  } catch {
    return null;
  }
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
