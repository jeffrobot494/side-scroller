// ---------------------------------------------------------------------------
// BUILD — the copy of the game that run.world publishes.
//
//     npm run build        # then: rundot deploy
//
// run.world uploads a folder (game.config.prod.json → relativePathToDistFolder,
// "dist"), not the repo. Nothing is compiled: this COPIES exactly the files
// index.html reaches, found by following the game's own references —
//   html  src="./…" / href="./…"
//   css   url(./…) / @import
//   js    import … from "./…", import "./…", import("./…"),
//         new URL("./…", import.meta.url)
// — so the editor, the labs, the space prototypes and server-only code
// (src/net/rooms.js, ws.mjs) stay out because the game never imports them, and
// a new module ships the moment the game imports it. Bare specifiers ("three")
// come from the CDN import map and are skipped. Then public/ (the thumbnail)
// is copied into the folder's root.
//
// A templated URL (`./models/${f}`) cannot be followed to one file, so the
// folder before the template is copied whole. A templated dynamic import()
// cannot be followed at all and fails the build rather than ship without it.
//
// This is the SINGLE-PLAYER game: run.world serves static files, so rooms
// (?room=, ?seat=), which need server.mjs, cannot work from it. Fly serves those.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync, statSync, readdirSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_NAME = JSON.parse(readFileSync(join(ROOT, "game.config.prod.json"), "utf8")).relativePathToDistFolder || "dist";
const OUT = join(ROOT, OUT_NAME);

const PATTERNS = {
  html: [/\b(?:src|href)\s*=\s*["'](\.{1,2}\/[^"'#?]+)/g],
  css: [/url\(\s*["']?(\.{1,2}\/[^"')#?]+)/g, /@import\s+["'](\.{1,2}\/[^"']+)/g],
  js: [/\b(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g],
};
const kindOf = (f) => (/\.html?$/.test(f) ? "html" : /\.css$/.test(f) ? "css" : /\.m?js$/.test(f) ? "js" : null);

const files = new Set();   // repo-relative, posix
const folders = new Set(); // copied whole (templated URLs)
const queue = [];

function want(from, spec) {
  const rel = posix.normalize(posix.join(posix.dirname(from), spec));
  if (rel.startsWith("..")) throw new Error(`${from} reaches outside the repo: ${spec}`);
  if (files.has(rel)) return;
  if (!existsSync(join(ROOT, rel))) throw new Error(`${from} references ${spec}, which does not exist (${rel})`);
  files.add(rel);
  queue.push(rel);
}

function scan(rel) {
  const kind = kindOf(rel);
  if (!kind) return; // an asset: copied, not read
  const src = readFileSync(join(ROOT, rel), "utf8");
  for (const re of PATTERNS[kind]) for (const m of src.matchAll(re)) want(rel, m[1]);
  if (kind !== "js") return;
  for (const m of src.matchAll(/new URL\(\s*(["'`])(\.{1,2}\/[^"'`]*)\1\s*,\s*import\.meta\.url/g)) {
    const spec = m[2];
    if (!spec.includes("${")) { want(rel, spec); continue; }
    const dir = posix.normalize(posix.join(posix.dirname(rel), spec.slice(0, spec.indexOf("${")).replace(/[^/]*$/, "")));
    if (!existsSync(join(ROOT, dir))) throw new Error(`${rel} builds URLs under ${dir}, which does not exist`);
    folders.add(dir);
  }
  const blind = src.match(/import\(\s*`[^`]*\$\{/);
  if (blind) throw new Error(`${rel} has a templated import() the build cannot follow: ${blind[0]}…`);
}

want("", "./index.html");
while (queue.length) scan(queue.shift());

rmSync(OUT, { recursive: true, force: true });
for (const rel of files) {
  mkdirSync(dirname(join(OUT, rel)), { recursive: true });
  cpSync(join(ROOT, rel), join(OUT, rel));
}
for (const dir of folders) cpSync(join(ROOT, dir), join(OUT, dir), { recursive: true });
if (existsSync(join(ROOT, "public"))) cpSync(join(ROOT, "public"), OUT, { recursive: true });

// Report: what went in, by top folder, and the size (run.world caps 100 MB zipped).
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const all = walk(OUT);
const bytes = all.reduce((a, f) => a + statSync(f).size, 0);
const byTop = {};
for (const f of all) {
  const parts = f.slice(OUT.length + 1).split(/[\\/]/);
  const top = parts.length > 2 ? parts.slice(0, 2).join("/") : parts[0];
  byTop[top] = (byTop[top] || 0) + 1;
}
console.log(`${OUT_NAME}/: ${all.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
for (const [k, n] of Object.entries(byTop).sort()) console.log(`  ${k.padEnd(22)} ${n}`);
