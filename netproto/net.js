// ---------------------------------------------------------------------------
// THE CLIENT'S SOCKET, PLUS THE LAG LAB.
//
// Every message in and out passes through a delay queue whose knobs are on
// screen. On localhost the real round trip is well under a millisecond, so
// without this the prototype would feel perfect and prove nothing. The queue
// simulates a symmetric path: `lag` is ONE WAY, so a 60ms setting is a 120ms
// round trip.
//
// Jitter reorders packets, deliberately. Real networks do, and code that
// assumes ordering is exactly the code this prototype is meant to embarrass.
//
// The stats half is not decoration. `inputLatency` — the time from sending an
// input packet to seeing a snapshot that acknowledges it — is the number the
// whole folder exists to produce.
// ---------------------------------------------------------------------------

import { encode, decode } from "./protocol.mjs";

const RING = 256;

// A small fixed-size ring of samples, so a 10-minute session costs no memory
// and the readouts are always over a recent window.
function ring(n = RING) {
  return { buf: new Float64Array(n), at: 0, len: 0, n };
}
function push(r, v) {
  r.buf[r.at] = v;
  r.at = (r.at + 1) % r.n;
  if (r.len < r.n) r.len++;
}
function stats(r) {
  if (!r.len) return { avg: 0, min: 0, max: 0, len: 0 };
  let sum = 0,
    min = Infinity,
    max = -Infinity;
  for (let i = 0; i < r.len; i++) {
    const v = r.buf[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { avg: sum / r.len, min, max, len: r.len };
}

export function createNet(url) {
  const net = {
    ws: null,
    connected: false,
    id: 0,

    // --- lab knobs, all live ---
    lag: 60, // ms, ONE way
    jitter: 10, // ms, +/- uniform
    loss: 0, // percent, applied per direction

    // --- callbacks ---
    onMessage: null,
    onOpen: null,
    onClose: null,

    // --- instrumentation ---
    rtt: ring(),
    inputLatency: ring(),
    snapGap: ring(),
    upBytes: 0,
    downBytes: 0,
    upPackets: 0,
    downPackets: 0,
    lastSnapAt: 0,
    lastSnapBytes: 0,
    snapCount: 0,
    dropped: 0,

    stats,
  };

  // seq -> the time we handed the input packet to the delay queue. Trimmed as
  // acks arrive; a client that never hears back leaks at most RING entries.
  const pending = new Map();
  let pingId = 1;
  const pings = new Map();

  const delay = () => {
    const j = net.jitter ? (Math.random() * 2 - 1) * net.jitter : 0;
    return Math.max(0, net.lag + j);
  };
  const lost = () => net.loss > 0 && Math.random() * 100 < net.loss;

  function connect() {
    net.ws = new WebSocket(url);
    net.ws.onopen = () => {
      net.connected = true;
      net.onOpen?.();
    };
    net.ws.onclose = () => {
      net.connected = false;
      net.onClose?.();
      setTimeout(connect, 1000);
    };
    net.ws.onmessage = (ev) => {
      const bytes = ev.data.length;
      if (lost()) {
        net.dropped++;
        return;
      }
      // Inbound delay. The browser has already received it; we hold it so the
      // rest of the client sees a slow network.
      setTimeout(() => deliver(ev.data, bytes), delay());
    };
  }

  function deliver(text, bytes) {
    net.downBytes += bytes;
    net.downPackets++;
    const m = decode(text);
    if (!m) return;

    if (m.t === "pong") {
      const sentAt = pings.get(m.id);
      pings.delete(m.id);
      if (sentAt !== undefined) push(net.rtt, performance.now() - sentAt);
      return;
    }
    if (m.t === "welcome") net.id = m.id;
    if (m.t === "snap") {
      const now = performance.now();
      if (net.lastSnapAt) push(net.snapGap, now - net.lastSnapAt);
      net.lastSnapAt = now;
      net.lastSnapBytes = bytes;
      net.snapCount++;
      // The measurement: this snapshot reflects input `ack`, so every input we
      // sent at or before that seq has now come back on screen.
      for (const [seq, at] of pending) {
        if (seq <= m.ack) {
          push(net.inputLatency, now - at);
          pending.delete(seq);
        }
      }
    }
    net.onMessage?.(m);
  }

  function raw(msg) {
    const text = encode(msg);
    net.upBytes += text.length;
    net.upPackets++;
    if (lost()) {
      net.dropped++;
      return;
    }
    const d = delay();
    const fire = () => {
      if (net.ws && net.ws.readyState === 1) net.ws.send(text);
    };
    if (d <= 0) fire();
    else setTimeout(fire, d);
  }

  net.send = raw;

  net.sendInput = (input) => {
    pending.set(input.seq, performance.now());
    if (pending.size > RING) pending.delete(pending.keys().next().value);
    raw({ t: "input", ...input });
  };

  net.ping = () => {
    const id = pingId++;
    pings.set(id, performance.now());
    if (pings.size > 64) pings.delete(pings.keys().next().value);
    raw({ t: "ping", id, ct: Date.now() });
  };

  connect();
  return net;
}
