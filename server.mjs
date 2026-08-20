// ---------------------------------------------------------------------------
// STATIC SERVER — the one file that exists so this repo can be hosted.
//
// Not part of the game and not imported by anything in src/. It exists because
// a host like Railway runs a PROCESS in a container and expects it to bind
// $PORT; it does not serve a folder. Locally, `python3 -m http.server 8000` is
// still the documented way to run this and nothing here replaces it.
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

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 8000;

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

createServer(async (req, res) => {
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
