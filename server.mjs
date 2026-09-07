// ---------------------------------------------------------------------------
// STATIC SERVER, AND THE ROOM SERVICE.
//
// Two jobs since tech/multiplayer-service.md V1, and they are unrelated:
//
//   1. It serves the folder, because a host like Railway runs a PROCESS in a
//      container and expects it to bind $PORT. Locally,
//      `python3 -m http.server 8000` is still the documented way to run the
//      game and nothing here replaces it — single-player is static files and
//      needs no process.
//   2. It holds the multiplayer rooms. A room is an authoritative campaign
//      living in this process rather than in somebody's tab, and the three
//      /api routes below are the whole of how a browser reaches one. That half
//      is NOT optional dressing on a file server: a room only exists while this
//      is running, and dies with it (Approximation 1).
//   3. Since tech/multiplayer-missions.md J8, IT HOLDS THE MISSION TOO. A room
//      that announces a dispatch now also constructs the headless `Mission`
//      (J6's canvas-less path), steps it at a fixed 60Hz off each seat's latest
//      input (J7's input-per-owner), and sends each seat its own snapshot over
//      a WebSocket. The browsers draw what comes back and simulate nothing.
//
// The rules live in `src/net/rooms.js`, which is HTTP-free on purpose. This
// file is transport: a body in, a value out, and an open response for a stream.
// The mission loop is here rather than there for the same reason — a `Mission`
// reaches the whole of `src/mission/`, and `test/session.test.mjs` source-scans
// that module for DOM globals. A room refers to a mission; it does not build
// one.
//
// TWO CHANNELS, SPLIT BY CADENCE, and neither learns the other's. `/api/*` is
// the campaign: a click, an answer, a snapshot, a dispatch, a mission's result
// — turn-boundary JSON on no latency budget. `/mission` is a socket that lives
// exactly as long as one mission and carries 60Hz input up and snapshots down.
//
// Zero dependencies, on purpose: package.json must stay dependency-free (see
// CLAUDE.md), so this is node's own http/fs and nothing else. There is still no
// build step — files are served exactly as they sit on disk.
//
//     node server.mjs            # http://localhost:8000
//     PORT=3000 node server.mjs
// ---------------------------------------------------------------------------

import { createServer } from "node:http";
import { readFile, writeFile, stat, readdir } from "node:fs/promises";
import { join, extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRooms } from "./src/net/rooms.js";
import { attachWebSocket } from "./src/net/ws.mjs";
import { Mission } from "./src/mission/mission.js";
import { createWireInput, projectScene } from "./src/net/mission-wire.js";
import { config, setConfig, SCHEMA } from "./src/game/config.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 8000;

// The process's rooms. One registry, in memory, for the life of the process.
// `startMission` is what makes them hold missions as well as campaigns (J8);
// without it a room is exactly the V1–V3 campaign service and every page plays
// its own dispatch, which is what every suite that builds a registry gets.
const rooms = createRooms({ startMission });

// Every schema entry, and the ones a room owns (tech/server-settings.md, C1).
// Built once: the SCHEMA is data and does not change while the process runs.
const FLAT_SCHEMA = SCHEMA.flatMap((g) => g.items);
const SERVER_ITEMS = new Map(FLAT_SCHEMA.filter((it) => it.scope === "server").map((it) => [it.key, it]));

// WHERE "MAKE PERMANENT" WRITES  (tech/server-settings.md, C4).
//
// A CONSTANT, NEVER A REQUEST PARAMETER. This process serves the whole repo at
// its URL and `resolve()` below is how a request names a file; the one route in
// here that WRITES must share none of that machinery, or it is an arbitrary
// file-write on an unauthenticated endpoint. The env var exists for exactly one
// caller — `test/mission-net.test.mjs`, which spawns this server against the
// real checkout and would otherwise rewrite the defaults every other suite in
// the run reads.
const CONFIG_SOURCE = process.env.CONFIG_SOURCE || join(ROOT, "src", "game", "config.js");
// The checkout test. `ROOT` is the repo root (this file sits in it), so `.git`
// is a CHILD of it. `.dockerignore` excludes `.git` from the build context and
// the Dockerfile is `COPY . .`, so a deployed image has none — which makes this
// a fact about the machine rather than a policy about the caller, and leaves
// the design's "no authentication" intact.
// Overridable for the same one caller, and for the same reason: the refusal is
// what a DEPLOYED server answers, and this suite can only ever run inside a
// checkout, so without a seam the branch a real person meets on Fly is the one
// branch with no test.
const GIT_DIR = process.env.CONFIG_GIT_DIR || join(ROOT, ".git");

// `.js` MUST be application/javascript or every ESM import in the page fails
// with a MIME-type error — the whole game is native modules with no bundler.
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".yaml": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// Resolve a URL path to a file inside ROOT, or null. `normalize` collapses the
// `..` segments a crafted request would use to climb out of the folder, and the
// prefix check is what actually rejects them.
function resolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const target = join(ROOT, normalize(decoded));
  return target === ROOT.slice(0, -1) || target.startsWith(ROOT) ? target : null;
}

// A directory listing, because src/docmap/app.js DISCOVERS docs by scraping one
// (it fetches `design/` and reads the hrefs). That is a behaviour of
// `python3 -m http.server`, so emitting it here is what keeps design.html
// working when hosted instead of showing only the root docs. It also means the
// repo is browsable at the deployed URL — exactly as it is on the local dev
// server, and the reason not to point a public link at this.
async function listing(dir, urlPath) {
  const names = await readdir(dir, { withFileTypes: true });
  const links = names
    .map((d) => (d.isDirectory() ? `${d.name}/` : d.name))
    .sort()
    .map((n) => `<li><a href="${encodeURIComponent(n).replace(/%2F/g, "/")}">${n}</a></li>`)
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>${urlPath}</title><ul>${links}</ul>`;
}

const send = (res, code, body, type) => {
  res.writeHead(code, {
    "Content-Type": type,
    // No caching: a playtester who reloads after a redeploy must get the new
    // build, and there is no content hashing to make a stale file safe.
    "Cache-Control": "no-cache",
  });
  res.end(body);
};

// ---------------------------------------------------------------------------
// THE ROOM ROUTES  (tech/multiplayer-service.md, V1)
//
// Three, and no more: open a room, send a command, listen to a seat. Everything
// that crosses is turn-boundary JSON — a click and its answer, a snapshot, a
// dispatch — so nothing here is on a latency budget and phase 3's mission-time
// traffic is not this file's problem.
// ---------------------------------------------------------------------------

const json = (res, code, body) =>
  send(res, code, JSON.stringify(body === undefined ? null : body), TYPES[".json"]);

// The whole request body as parsed JSON. Capped, because an unbounded read on a
// public route is a way to fill this process's memory with one request.
const MAX_BODY = 1 << 20;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let text = "";
    req.on("data", (chunk) => {
      text += chunk;
      if (text.length > MAX_BODY) {
        req.destroy(); // stop reading, or the cap only bounds what we KEEP
        reject(new Error("Body too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("Body is not JSON."));
      }
    });
    req.on("error", reject);
  });
}

// A stream is answered by NOT answering: the headers go out, the response stays
// open, and every push is one SSE frame written into it. Plain HTTP text, which
// is why this needs no dependency and no framing of its own (Approximation 5).
function stream(req, res, token) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    // Proxies that buffer a response would hold every push until the campaign
    // ended, which looks exactly like a hung game.
    "X-Accel-Buffering": "no",
  });

  const detach = rooms.attach(token, (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });

  // A comment frame, ignored by EventSource, so an idle campaign does not look
  // dead to whatever is between here and the browser. A room is idle for whole
  // minutes at a time by design — it is a game played a day at a click.
  const beat = setInterval(() => res.write(": beat\n\n"), 25000);
  if (beat.unref) beat.unref();

  const close = () => {
    clearInterval(beat);
    detach();
  };
  req.on("close", close);
  res.on("close", close);
}

// Returns true if it answered. The routes are checked BEFORE the method guard
// below — that guard 405s anything that is not GET or HEAD, as the handler's
// first statement, so a POST route added under it would be unreachable.
async function apiRoute(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;

  // Open a room. The seats come back with a token each, and V3 is what turns
  // those into links a person can be handed.
  if (url.pathname === "/api/rooms" && req.method === "POST") {
    let spec;
    try {
      spec = await readJson(req);
    } catch (e) {
      json(res, 400, { error: e.message });
      return true;
    }
    json(res, 200, rooms.createRoom(spec || {}));
    return true;
  }

  // A command from a seat. The token says WHO — the body never does, because a
  // page is not the host any more and cannot be believed about which commander
  // it is. It rides in the body rather than the query string so it stays out of
  // access logs; the stream below has no such choice.
  if (url.pathname === "/api/command" && req.method === "POST") {
    let body;
    try {
      body = await readJson(req);
    } catch (e) {
      json(res, 400, { error: e.message });
      return true;
    }
    if (!rooms.seatFor(body && body.token)) {
      json(res, 404, { error: "No such seat." });
      return true;
    }
    try {
      json(res, 200, rooms.command(body.token, body.cmd));
    } catch (e) {
      // A payload the wire refused, named by field. Worth being honest about
      // when this can fire: the INBOUND half cannot, from here — the body has
      // already been through JSON.parse, so a Map or a function cannot have
      // survived to reach `toWire`. What this catches is an OUTBOUND refusal (a
      // session answer that is not data, which would be a session bug) and it
      // catches it as a 400 rather than as a request that hangs. The inbound
      // check bites where it always did: in-process, at the send, with the
      // stack still pointing at whoever built the command — which after V2 is
      // `src/net/remote.js` in the browser.
      json(res, 400, { error: e.message });
    }
    return true;
  }

  // A seat's stream: its snapshot on attach and after every command, and its
  // own dispatches. The token is in the query string because EventSource cannot
  // set a header (Approximation 3).
  if (url.pathname === "/api/stream" && req.method === "GET") {
    const token = url.searchParams.get("token") || "";
    if (!rooms.seatFor(token)) {
      json(res, 404, { error: "No such seat." });
      return true;
    }
    stream(req, res, token);
    return true;
  }

  // THE ROOM'S SETTINGS  (tech/server-settings.md, C2)
  //
  // A room reads `config` live — the mission's `_ctx` getters, `advanceDay`,
  // the generator, the step loop's snapshot rate — and until now nothing could
  // set it, because a node process has no localStorage and `setConfig`'s
  // `persist()` is a silent no-op there. That no-op is the feature: the setter
  // still validates, coerces and mutates the live object in place, so every
  // importer sees the new number. These two routes are the only thing that was
  // missing, and `scope: "server"` is the list of what may cross.
  //
  // UNAUTHENTICATED, deliberately (approximation 1). A seat token would prove
  // nothing — `POST /api/rooms` mints one to anybody who asks, by design — so
  // what protects this is that it is a two-player game on a URL nobody has.
  if (url.pathname === "/api/config" && req.method === "GET") {
    json(res, 200, serverConfig());
    return true;
  }

  if (url.pathname === "/api/config" && req.method === "POST") {
    let body;
    try {
      body = await readJson(req);
    } catch (e) {
      json(res, 400, { error: e.message });
      return true;
    }
    const key = body && body.key;
    const item = SERVER_ITEMS.get(key);
    if (!item) {
      // Two different refusals, because they mean different things to whoever
      // is holding the browser: 400 is "no such knob" (a typo, or a config
      // exported from a newer build), 403 is "that knob is yours, not mine" —
      // which is the normal, expected answer while importing somebody's whole
      // exported config.
      const known = FLAT_SCHEMA.some((it) => it.key === key);
      json(res, known ? 403 : 400, {
        error: known ? `Not a server setting: ${key}` : `No such setting: ${key}`,
        key,
      });
      return true;
    }
    // `setConfig` owns coercion and clamping — a route that validated again
    // would be a second opinion about the schema. It answers `undefined` for a
    // key it does not know; checked against undefined and never for falsiness,
    // because `false` and `0` are legal values.
    const value = setConfig(key, body.value);
    if (value === undefined) {
      json(res, 400, { error: `No such setting: ${key}`, key });
      return true;
    }
    json(res, 200, { key, value });
    return true;
  }

  // MAKE PERMANENT  (tech/server-settings.md, C4). No body: it writes every
  // server-scoped knob whose live value differs from the one this process
  // booted with, and answers what it wrote.
  if (url.pathname === "/api/config/permanent" && req.method === "POST") {
    if (!(await isCheckout())) {
      // The deployed answer, and it is honest rather than cautious: a write to
      // an image's filesystem reverts on the next deploy and never reaches the
      // repo, so it would look like it had worked while changing nothing — the
      // same failure Reset is disabled for (approximation 2).
      json(res, 403, {
        error: "This server is not running from a git checkout, so it cannot make anything permanent. " +
          "A file written here would revert on the next deploy and never reach the repo. " +
          "Export the settings and paste them into src/game/config.js instead.",
        checkout: false,
      });
      return true;
    }
    try {
      const written = await writePermanent();
      json(res, 200, { written, path: CONFIG_SOURCE, checkout: true });
    } catch (e) {
      json(res, 500, { error: `Could not write ${CONFIG_SOURCE}: ${e && e.message}` });
    }
    return true;
  }

  json(res, 404, { error: `No such route: ${url.pathname}` });
  return true;
}

const isCheckout = () => stat(GIT_DIR).then(() => true, () => false);

// Patch `default:` for every server-scoped entry whose live value differs from
// the one this process is holding as the default, and answer what changed.
//
// A LINE REPLACEMENT, NOT A PARSE. Every entry in `src/game/config.js` is one
// `key:` line followed by exactly one `default: <literal>,` line at the same
// indent — 71 of each, no exceptions — so the anchor is the key and the edit is
// the next `default:` under it. `JSON.stringify` reproduces every literal the
// file holds, which is why a bool, a number and an enum all take the same path.
//
// The value written is EXACTLY the one the server ran, float noise and all
// (approximation 14): a source value that differs from what was tuned is worse
// than an ugly diff.
async function writePermanent() {
  const before = await readFile(CONFIG_SOURCE, "utf8");
  const lines = before.split("\n");
  const written = [];

  for (const [key, item] of SERVER_ITEMS) {
    const live = config[key];
    if (live === item.default) continue;
    const at = lines.findIndex((l) => l.trim() === `key: "${key}",`);
    if (at < 0) continue; // a knob with no source line is not one this can move
    const dat = lines.findIndex((l, i) => i > at && /^\s*default: .*,$/.test(l));
    if (dat < 0) continue;
    const indent = lines[dat].match(/^\s*/)[0];
    lines[dat] = `${indent}default: ${JSON.stringify(live)},`;
    written.push({ key, from: item.default, to: live });
  }

  if (!written.length) return written;
  await writeFile(CONFIG_SOURCE, lines.join("\n"));
  // THE PROCESS NOW AGREES WITH THE FILE IT WROTE. Without this the changed-dot
  // stays lit on every knob just made permanent and a second press rewrites the
  // same lines. It mutates the SCHEMA objects `config.js` holds by reference,
  // so `defaults()`, `isDefault()` and `resetConfig()` move with it in THIS
  // process — benign in a room (`persist()` is a no-op and nothing resets), and
  // the same in-place shape `applyWeaponOverrides()` uses over `arsenal.js`.
  for (const { key, to } of written) SERVER_ITEMS.get(key).default = to;
  return written;
}

// The server-scoped entries and their live values, in SCHEMA order and grouped
// as the SCHEMA groups them — which is what lets the editor hand the payload
// straight to the renderer it already has. A group with nothing left in it is
// dropped here rather than sent empty.
function serverConfig() {
  const groups = [];
  for (const g of SCHEMA) {
    const items = g.items.filter((it) => it.scope === "server");
    if (items.length) groups.push({ title: g.title, items });
  }
  const values = {};
  for (const g of groups) for (const it of g.items) values[it.key] = config[it.key];
  return { groups, values };
}

// ---------------------------------------------------------------------------
// THE ROOM'S MISSION  (tech/multiplayer-missions.md, J8)
//
// One authoritative simulation per flight, stepped here, drawn nowhere. The
// three pieces this rests on all shipped before it and none of them needed a
// network: J6 made a `Mission` constructible with no canvas, J7 gave it an
// input per commander, and J2 made each commander's end independent — which is
// what lets the loop go on stepping for whoever is left after somebody
// extracts, the design's decision 5 and the thing a leaving player's page
// could never do.
// ---------------------------------------------------------------------------

const TICK_HZ = 60;
const STEP = 1 / TICK_HZ;
const STEP_MS = 1000 / TICK_HZ;

// Every flight being stepped. A room holds the flight; this holds the loop.
const live = new Set();

// The snapshot rate, as the room reads it. Read live off `config` each time
// round the loop, and since `POST /api/config` (tech/server-settings.md, C2)
// this is a knob somebody can actually turn on a running server — it was a
// built-in default nothing could reach when J8 shipped.
const clampHz = (v) => Math.min(TICK_HZ, Math.max(1, Math.round(Number(v) || 20)));

// A room is opening a mission. Build it, wire one input per seat, and hand the
// registry back a driver — the return value is what marks the round's
// dispatches `hosted`, so a `null` here is how this process would decline to
// hold a mission at all.
function startMission(flight) {
  // `null` canvas is J6's host-free path: no DOM globals, no rAF, no drawing.
  // `null` owner is J1's default and is the honest answer here — the room is at
  // no keyboard, so there is no "commander at this one". Every commander gets a
  // wire input below, and `inputFor` prefers the map, so the local-device
  // fallback that owner would select is never reached.
  const mission = new Mission(null, (result, owner) => flight.report(owner, result));
  const inputs = new Map();
  const sockets = new Map();
  mission.start(flight.mission, flight.level, flight.squad, null);
  for (const s of flight.seats) {
    const inp = createWireInput();
    inputs.set(s.owner, inp);
    mission.setInput(s.owner, inp);
  }

  // THE ROOM LOGS FEEDBACK INSTEAD OF PLAYING IT (J8). Sound, sparks, bursts,
  // shake and the damage flash are produced by the simulation, and the
  // simulation is here — where `audio.play` is a silent no-op and nothing is
  // drawn. Assigning the log flips every one of them from "do it" to "record
  // it", and stops the room allocating a particle array sixty times a second
  // that nobody will ever look at.
  mission.feed = [];

  const driver = { mission, inputs, sockets, since: 0, bytes: 0 };
  flight.driver = driver;
  live.add(flight);
  console.log(`mission ${flight.id} up — ${flight.seats.length} seat(s), ${flight.squad.length} soldier(s)`);
  return driver;
}

// One seat's snapshot, to that seat, if it is connected. Per recipient in two
// ways and only two: the ack is theirs, and the loot count is theirs. Everything
// else — including the OTHER commander's soldiers — is the level they are both
// standing on, which design/multiplayer.md says they can see.
function broadcast(flight) {
  const d = flight.driver;
  for (const s of flight.seats) {
    // A COMMANDER WHO HAS GONE HOME STOPS RECEIVING (the design's decision 5).
    // Their page closes its own socket when the results screen arrives, but the
    // rule is the room's and is stated here rather than left to a browser: they
    // have already been told everything about this mission that is theirs.
    if (flight.reported.has(s.owner)) {
      const gone = d.sockets.get(s.owner);
      if (gone) {
        d.sockets.delete(s.owner);
        gone.close(1000);
      }
      continue;
    }
    const conn = d.sockets.get(s.owner);
    if (!conn) continue;
    const text = JSON.stringify({
      t: "snap",
      ...projectScene(d.mission, s.owner, d.inputs.get(s.owner).ack(), d.mission.feed),
    });
    d.bytes += text.length;
    conn.send(text);
  }
  // CLEARED ONCE THE LOG HAS GONE TO EVERY SEAT — not per seat (the second one
  // would hear nothing) and not per step (the sim runs three steps to each
  // snapshot, so two thirds of every firefight would be dropped). The second of
  // those is a bug netproto's smoke test caught on its first run, and it is
  // named in this spec's Reuses table for exactly this moment.
  d.mission.feed.length = 0;
}

// A deadline-corrected fixed step, copied from netproto/server.mjs: catch up at
// most five steps and then RESYNC rather than teleport, because a descheduled
// container should read as a hitch and not as a burst. setInterval drifts and
// is not an option — the simulation's step is the mission's clock.
let next = Date.now();
let bytesSince = Date.now();

function loop() {
  const now = Date.now();
  // NOTHING TO STEP IS THE NORMAL CASE for this process: it is a file server
  // first, single-player needs no mission at all, and a room is idle for whole
  // minutes between deploys. Burning a wakeup sixty times a second to discover
  // that is the kind of cost that only shows up on somebody else's container.
  if (!live.size) {
    next = now; // no backlog to catch up on when the first mission opens
    setTimeout(loop, 50);
    return;
  }
  let steps = 0;
  const every = Math.max(1, Math.round(TICK_HZ / clampHz(config.missionSnapshotHz)));
  while (now >= next && steps < 5) {
    for (const flight of [...live]) {
      const d = flight.driver;
      try {
        // The same two calls, in the same order, that Mission._frame makes
        // inside its own accumulator (J4): one input sample per step, then the
        // step.
        d.mission.sampleInputs();
        d.mission.update(STEP);
        d.mission.netStep++;
        d.since++;
        if (d.since >= every) {
          d.since = 0;
          broadcast(flight);
        }
      } catch (e) {
        // ONE BAD MISSION MUST NOT TAKE THE PROCESS'S OTHER CAMPAIGNS WITH IT.
        // An uncaught throw here would end the loop for every room in this
        // process, and a room is the only copy of its campaign. The two
        // commanders on this level are stuck looking at a frozen canvas, which
        // is bad and is visible; everyone else's game survives, which is the
        // trade. Loud on purpose — this is a bug, not a condition.
        console.error(`mission ${flight.id} threw and was dropped:`, e);
        live.delete(flight);
        for (const conn of d.sockets.values()) conn.close(1011);
        continue;
      }
      // `running` goes false when the LAST commander on the level has resolved
      // (J2's `_finish`). Until then the scene runs on for whoever is left,
      // whether or not anybody is still watching it.
      if (!d.mission.running) {
        live.delete(flight);
        for (const conn of d.sockets.values()) conn.close(1000);
        console.log(`mission ${flight.id} down`);
      }
    }
    next += STEP_MS;
    steps++;
  }
  if (steps === 5) next = Date.now(); // gave up catching up; resync
  // Approximation 11 asks for this from day one: the first snapshot format that
  // sends too much works on a LAN and fails on a wire, and the only way to know
  // is to watch the number.
  if (now - bytesSince >= 5000) {
    for (const flight of live) {
      const d = flight.driver;
      if (d.bytes) console.log(`mission ${flight.id}: ${Math.round(d.bytes / 5)} B/s out`);
      d.bytes = 0;
    }
    bytesSince = now;
  }
  setTimeout(loop, Math.max(0, next - Date.now()));
}

// THE MISSION SOCKET. A token is the whole of the authorisation, exactly as it
// is on the three /api routes: it names a seat, a seat is in at most one
// flight, and a token in neither is closed rather than answered.
function attachMissionSocket(server) {
  attachWebSocket(server, (conn, req) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== "/mission") return conn.close(1008);
    const token = url.searchParams.get("token") || "";
    const seat = rooms.seatFor(token);
    const flight = rooms.flightFor(token);
    if (!seat || !flight || !flight.driver) return conn.close(1008);

    const d = flight.driver;
    const owner = seat.playerId;
    d.sockets.set(owner, conn);
    conn.send(JSON.stringify({ t: "ready", owner, mission: flight.id }));

    conn.onmessage = (text) => {
      let m;
      try {
        m = JSON.parse(text);
      } catch {
        return;
      }
      // ONE MESSAGE TYPE UP, and it is never a command: per-step input does not
      // go through `session.command` and is never adjudicated by the campaign.
      // The two authorities share this process and stay two objects.
      if (m && m.t === "in") d.inputs.get(owner)?.receive(m);
    };

    conn.onclose = () => {
      if (d.sockets.get(owner) !== conn) return; // a reconnect already replaced it
      d.sockets.delete(owner);
      // The held keys go with the socket. A commander whose tab closed mid-run
      // would otherwise sprint into the nearest wall for the rest of the
      // mission, which is worse than standing still and is not the same
      // question as handing their squad to the AI — that is approximation 6,
      // and it is still not built.
      d.inputs.get(owner)?.reset();
    };
  });
}

const httpServer = createServer(async (req, res) => {
  // The rooms first: the method guard below answers 405 to every POST.
  if (await apiRoute(req, res)) return;

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method not allowed", TYPES[".html"]);
  }
  const target = resolve(req.url || "/");
  if (!target) return send(res, 403, "Forbidden", TYPES[".html"]);

  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      try {
        return send(res, 200, await readFile(join(target, "index.html")), TYPES[".html"]);
      } catch {
        const path = req.url.endsWith("/") ? req.url : `${req.url}/`;
        return send(res, 200, await listing(target, path), TYPES[".html"]);
      }
    }
    const type = TYPES[extname(target).toLowerCase()] || "application/octet-stream";
    return send(res, 200, await readFile(target), type);
  } catch {
    return send(res, 404, `Not found: ${req.url}`, TYPES[".html"]);
  }
});

attachMissionSocket(httpServer);

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`serving ${ROOT} on http://localhost:${PORT}`);
  loop();
});
