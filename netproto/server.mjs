// ---------------------------------------------------------------------------
// THE PROTOTYPE SERVER — authoritative, fixed-step, and its own process.
//
// Nothing here imports from ../src. The repo's real multiplayer plan
// (tech/multiplayer-missions.md) is deterministic LOCKSTEP between peers; this
// folder is the competing architecture, built standalone so that comparing them
// is comparing two things rather than one thing with a flag.
//
//     node netproto/server.mjs           # http://localhost:8100
//     PORT=9000 node netproto/server.mjs
//
// The loop is a fixed 60Hz step with a deadline-corrected timer, NOT
// setInterval(1000/60) — setInterval drifts, and a prototype whose entire
// output is timing numbers cannot afford a clock that lies.
// ---------------------------------------------------------------------------

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { attachWebSocket } from "./ws.mjs";
import { decode, encode, TICK_HZ, DEFAULT_SNAPSHOT_HZ, clamp } from "./protocol.mjs";
import {
  createWorld, addPlayer, removePlayer, step as stepWorld, snapshot, setEnemyCount,
  W, H, PLAYER_W, PLAYER_H, ENEMY_W, ENEMY_H, PLATFORMS,
} from "./sim.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 8100;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const rel = normalize(clean).replace(/^(\.\.[/\\])+/, "");
  const abs = join(ROOT, rel === "/" || rel === sep ? "index.html" : rel);
  return abs.startsWith(ROOT) ? abs : null;
}

// ---------------------------------------------------------------------------
// The world. One per process — this prototype is a single room, because a room
// registry would be answering a question nobody has asked yet.
// ---------------------------------------------------------------------------

const world = createWorld();
const DT = 1 / TICK_HZ;

let nextId = 1;
const clients = new Map(); // id -> client

let snapshotHz = DEFAULT_SNAPSHOT_HZ;
let tick = 0;

// Every event the world produced since the last broadcast. Capped, because a
// crowded firefight at 5Hz snapshots should cost a dropped spark rather than an
// unbounded packet.
let pendingEvents = [];
const MAX_EVENTS = 64;

function addClient(conn) {
  const id = nextId++;
  const c = {
    id,
    conn,
    name: `p${id}`,
    // The last input packet received, held until the next step consumes it.
    // Server-authoritative means the server reads the client's INTENT, never
    // its position.
    input: { seq: 0, l: 0, r: 0, jump: 0, fire: 0, ax: 1, ay: 0 },
    ack: 0,
  };
  clients.set(id, c);
  addPlayer(world, id, c.name);

  conn.onmessage = (text) => {
    const m = decode(text);
    if (!m) return;
    if (m.t === "input") {
      // Out-of-order arrival is normal once the lab adds jitter: an older
      // packet must never overwrite a newer one.
      if (typeof m.seq === "number" && m.seq > c.input.seq) c.input = m;
    } else if (m.t === "ping") {
      conn.send(encode({ t: "pong", id: m.id, ct: m.ct, st: Date.now() }));
    } else if (m.t === "hello") {
      if (typeof m.name === "string") {
        c.name = m.name.slice(0, 16);
        const p = world.players.get(id);
        if (p) p.name = c.name;
      }
    } else if (m.t === "cfg") {
      // Both knobs are server-wide and last-writer-wins. One arena, one set of
      // rules: two clients simulating different worlds is the failure mode this
      // architecture exists to make impossible.
      if (typeof m.snapshotHz === "number") {
        snapshotHz = clamp(Math.round(m.snapshotHz), 1, TICK_HZ);
        console.log(`snapshot rate -> ${snapshotHz}Hz`);
      }
      if (typeof m.enemies === "number") {
        setEnemyCount(world, clamp(m.enemies, 0, 12));
        console.log(`fliers -> ${world.enemyCount}`);
        for (const other of clients.values()) {
          other.conn.send(encode({ t: "cfg", enemies: world.enemyCount }));
        }
      }
    }
  };

  conn.onclose = () => {
    clients.delete(id);
    removePlayer(world, id);
    console.log(`- ${c.name} left (${clients.size} connected)`);
  };

  // The client is told the geometry once and never simulates against it — it
  // draws platforms so the level is legible, and that is all.
  conn.send(
    encode({
      t: "welcome",
      id,
      tickHz: TICK_HZ,
      snapshotHz,
      world: {
        w: W, h: H,
        pw: PLAYER_W, ph: PLAYER_H,
        ew: ENEMY_W, eh: ENEMY_H,
        platforms: PLATFORMS,
        enemies: world.enemyCount,
      },
    }),
  );
  console.log(`+ ${c.name} joined (${clients.size} connected)`);
  return c;
}

// The inputs map is rebuilt each step rather than held, so a client that
// disconnects mid-step cannot leave an intent behind driving a ghost.
const inputs = new Map();

function step() {
  tick++;
  inputs.clear();
  for (const c of clients.values()) {
    inputs.set(c.id, c.input);
    // Recorded BEFORE the step, so `ack` means "this input was applied", not
    // "this input had arrived".
    c.ack = c.input.seq;
  }
  stepWorld(world, inputs, DT);
  for (const ev of world.events) {
    if (pendingEvents.length < MAX_EVENTS) pendingEvents.push(ev);
  }
}

function broadcast() {
  const st = Date.now();
  const s = snapshot(world);
  const events = pendingEvents;
  pendingEvents = [];
  const hb = healthReport();
  for (const c of clients.values()) {
    // Each client gets its OWN ack, so the snapshot is per-recipient even
    // though the world half of it is identical for everybody. Nobody is sent a
    // filtered view: with one screen-sized arena there is nothing to hide, and
    // interest management would be a second variable in a latency experiment.
    c.conn.send(encode({ t: "snap", tick, st, ack: c.ack, ...s, events, hp: hb }));
  }
}

// --- tick health -----------------------------------------------------------
//
// A shared-CPU host deschedules processes. When that happens the sim falls
// behind, the hitch reaches the client, and it looks exactly like a network
// problem — so on a deployed run the FIRST thing to rule out is the host, not
// the path. These three numbers ride along in every snapshot for that reason.
//
//   late  worst milliseconds a step ran behind its deadline, this window
//   sat   times the catch-up hit its 5-step ceiling and gave up (a real stall)
//   hz    steps actually executed per second, against a target of TICK_HZ
//
// The client prints them next to RTT. If `late` is small and RTT is ugly, the
// network is the story. If `late` is large, nothing else in the readout means
// anything yet.
let health = { late: 0, sat: 0, steps: 0, since: Date.now(), hz: TICK_HZ };

function healthReport() {
  const now = Date.now();
  const dt = (now - health.since) / 1000;
  if (dt >= 1) {
    health.hz = health.steps / dt;
    health.steps = 0;
    health.since = now;
    // Decay rather than reset: a stall two seconds ago is still worth seeing
    // while you are reading the number that it caused.
    health.late *= 0.5;
    health.sat = 0;
  }
  return { late: Math.round(health.late), sat: health.sat, hz: Math.round(health.hz * 10) / 10 };
}

// A deadline-corrected fixed step. If the process is descheduled we catch up,
// but never by more than 5 steps — a stall should show as a hitch, not as a
// burst of teleporting.
const STEP_MS = 1000 / TICK_HZ;
let next = Date.now();
let sinceSnapshot = 0;

function loop() {
  const now = Date.now();
  // How far past its deadline this step is. On an idle machine it is under a
  // millisecond; on a busy container it is the whole story.
  const late = now - next;
  if (late > health.late) health.late = late;
  let steps = 0;
  while (now >= next && steps < 5) {
    step();
    next += STEP_MS;
    steps++;
    health.steps++;
    sinceSnapshot++;
    const every = Math.max(1, Math.round(TICK_HZ / snapshotHz));
    if (sinceSnapshot >= every) {
      sinceSnapshot = 0;
      broadcast();
    }
  }
  if (steps === 5) {
    health.sat++;
    next = Date.now(); // gave up catching up; resync
  }
  setTimeout(loop, Math.max(0, next - Date.now()));
}

const server = createServer(async (req, res) => {
  // One JSON line about this process, so several deployments can be compared
  // with curl rather than by opening a tab at each one and squinting.
  if ((req.url || "").split("?")[0] === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(
      JSON.stringify({
        ok: true,
        clients: clients.size,
        fliers: world.enemyCount,
        tick,
        snapshotHz,
        ...healthReport(),
        uptime: Math.round(process.uptime()),
      }),
    );
    return;
  }

  const abs = resolve(req.url || "/");
  if (!abs) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(abs);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(abs)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

attachWebSocket(server, (conn) => addClient(conn));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`netproto on http://localhost:${PORT}  (${TICK_HZ}Hz sim, ${snapshotHz}Hz snapshots)`);
  loop();
});
