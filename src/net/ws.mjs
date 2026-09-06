// ---------------------------------------------------------------------------
// A WEBSOCKET SERVER IN ONE FILE, WITH NO DEPENDENCIES.
//
// A COPY of `netproto/ws.mjs`, deliberately, not an import of it (J8). That
// folder is a measurement prototype and the whole of its value is that it is
// standalone — nothing in `src/` imports it and it imports nothing from `src/`
// — so the day it is deleted the shipping server must not go with it. The file
// is 200 lines of RFC 6455 and it has been run against two browsers and a node
// client; copying it is cheaper than either depending on a prototype or
// depending on npm.
//
// NODE-ONLY, and the `.mjs` says so: it names `node:crypto` and takes an
// `http.Server`. It is the one file in `src/net/` that no browser can load, and
// the source scan in `test/session.test.mjs` covers `rooms.js`, not this.
//
// What it supports: text and binary frames, fragmentation, ping/pong, close.
// What it does not: extensions (permessage-deflate is never negotiated),
// subprotocols, backpressure beyond node's own socket buffer.
//
// setNoDelay is the line that matters: without it Nagle's algorithm coalesces
// small writes and adds up to 40ms of delay that has nothing to do with the
// architecture. A mission's input packets are exactly the small writes it
// would coalesce.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"; // RFC 6455 magic; the trailing 11 is load-bearing

// Anything bigger than this from a client is a bug or an attack; we are not
// receiving files.
const MAX_FRAME = 1 << 20;

const OP = { CONT: 0x0, TEXT: 0x1, BIN: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

// One connected peer. Deliberately not an EventEmitter — three callbacks is the
// whole surface and a class with fields is easier to read than `.on("...")`.
class Conn {
  constructor(socket) {
    this.socket = socket;
    // `open` gates writing; `notified` gates the close callback. They are two
    // flags because they answer two questions: closing our end must not stop
    // the owner being told the peer is gone. Collapsing them into one leaks a
    // player per disconnect, which is exactly what happened the first time.
    this.open = true;
    this.notified = false;
    this.onmessage = null; // (string) => void
    this.onclose = null; // () => void
    this.bytesSent = 0;
    this.bytesRecv = 0;
  }

  send(text) {
    if (!this.open) return;
    const payload = Buffer.from(text, "utf8");
    const f = frame(OP.TEXT, payload);
    this.bytesSent += f.length;
    this.socket.write(f);
  }

  close(code = 1000) {
    if (!this.open) return;
    this.open = false;
    const body = Buffer.alloc(2);
    body.writeUInt16BE(code, 0);
    try {
      this.socket.write(frame(OP.CLOSE, body));
      this.socket.end();
    } catch {
      /* already gone */
    }
  }
}

// A server frame is never masked; a client frame always is. That asymmetry is
// the protocol's, not ours.
function frame(op, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | op; // FIN, never fragmented on the way out
  return Buffer.concat([header, payload]);
}

// Attach to a node http server. `onConnection(conn, req)` is called once per
// upgraded socket.
export function attachWebSocket(server, onConnection) {
  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    if (!key || req.headers.upgrade?.toLowerCase() !== "websocket") {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const accept = createHash("sha1").update(key + GUID).digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    // The whole point of the prototype: do not let the kernel add latency.
    socket.setNoDelay(true);

    const conn = new Conn(socket);
    let buf = Buffer.alloc(0);
    let fragOp = 0;
    let frag = [];

    socket.on("data", (chunk) => {
      conn.bytesRecv += chunk.length;
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;

      for (;;) {
        if (buf.length < 2) break;
        const b0 = buf[0];
        const b1 = buf[1];
        const fin = (b0 & 0x80) !== 0;
        const op = b0 & 0x0f;
        const masked = (b1 & 0x80) !== 0;
        let len = b1 & 0x7f;
        let off = 2;

        if (len === 126) {
          if (buf.length < 4) break;
          len = buf.readUInt16BE(2);
          off = 4;
        } else if (len === 127) {
          if (buf.length < 10) break;
          const big = buf.readBigUInt64BE(2);
          if (big > BigInt(MAX_FRAME)) return conn.close(1009);
          len = Number(big);
          off = 10;
        }
        if (len > MAX_FRAME) return conn.close(1009);

        let mask = null;
        if (masked) {
          if (buf.length < off + 4) break;
          mask = buf.subarray(off, off + 4);
          off += 4;
        }
        if (buf.length < off + len) break;

        const payload = Buffer.from(buf.subarray(off, off + len));
        if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
        buf = buf.subarray(off + len);

        if (op === OP.CLOSE) {
          conn.close();
          gone();
          break;
        } else if (op === OP.PING) {
          socket.write(frame(OP.PONG, payload));
        } else if (op === OP.PONG) {
          /* unsolicited pongs are legal and ignored */
        } else if (op === OP.CONT) {
          frag.push(payload);
          if (fin) {
            const whole = Buffer.concat(frag);
            frag = [];
            if (fragOp === OP.TEXT) conn.onmessage?.(whole.toString("utf8"));
            fragOp = 0;
          }
        } else if (op === OP.TEXT || op === OP.BIN) {
          if (!fin) {
            fragOp = op;
            frag = [payload];
          } else if (op === OP.TEXT) {
            conn.onmessage?.(payload.toString("utf8"));
          }
        }
      }
    });

    const gone = () => {
      if (conn.notified) return;
      conn.notified = true;
      conn.open = false;
      conn.onclose?.();
    };
    socket.on("close", gone);
    socket.on("end", gone);
    socket.on("error", gone);

    onConnection(conn, req);
  });
}
