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
//
// The rules live in `src/net/rooms.js`, which is HTTP-free on purpose. This
// file is transport: a body in, a value out, and an open response for a stream.
//
// Zero dependencies, on purpose: package.json must stay dependency-free (see
// CLAUDE.md), so this is node's own http/fs and nothing else. There is still no
// build step — files are served exactly as they sit on disk.
//
//     node server.mjs            # http://localhost:8000
//     PORT=3000 node server.mjs
// ---------------------------------------------------------------------------

import { createServer } from "node:http";
import { readFile, stat, readdir } from "node:fs/promises";
import { join, extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRooms } from "./src/net/rooms.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 8000;

// The process's rooms. One registry, in memory, for the life of the process.
const rooms = createRooms();

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

  json(res, 404, { error: `No such route: ${url.pathname}` });
  return true;
}

createServer(async (req, res) => {
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
}).listen(PORT, "0.0.0.0", () => {
  console.log(`serving ${ROOT} on http://localhost:${PORT}`);
});
