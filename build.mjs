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
// a new module ships the moment the game imports it. A bare specifier
// ("three", "three/addons/…") resolves through index.html's import map, the
// way the browser does, and is followed like a relative one — that is how the
// vendored three (vendor/three/) ships only the files the game reaches. A bare
// specifier the map does not name fails the build. Then public/ (the
// thumbnail) is copied into the folder's root.
//
// A templated URL (`./models/${f}`) cannot be followed to one file, so the
// folder before the template is copied whole. A templated dynamic import()
// cannot be followed at all and fails the build rather than ship without it.
//
// The RUN.world SDK (vendor/rundot-sdk) is added to dist/index.html only, as
// its own module script after the game's: importing it initialises the SDK and
// reports ready to run.world's host, which otherwise fails the load after about
// a minute. A separate script, so an SDK failure cannot stop the game starting.
//
// This is the SINGLE-PLAYER game: run.world serves static files, so rooms
// (?room=, ?seat=), which need server.mjs, cannot work from it. Fly serves those.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, rmSync, mkdirSync, cpSync } from "node:fs";
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
// Bare specifiers are read only in import/export statement shape and in
// import("…"), with comments removed: a minified SDK's prose and GLTFLoader's
// `… from "srgb-linear" …` warning both contain the words, not the syntax.
const SPEC = `["']((?:@[\\w.-]+\\/)?[\\w-][\\w.-]*(?:\\/[\\w.-]+)*\\/?)["']`;
const BARE = [
  new RegExp(`^\\s*(?:import|export)\\b[^;"'\`]*?\\bfrom\\s*${SPEC}`, "gm"),
  new RegExp(`^\\s*import\\s*${SPEC}`, "gm"),
  new RegExp(`\\bimport\\(\\s*${SPEC}\\s*\\)`, "g"),
];
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
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const re of BARE) for (const m of code.matchAll(re)) want("", "./" + mapped(rel, m[1]));
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

// index.html's import map: an exact key, else the longest "prefix/" key.
const IMPORTS = JSON.parse(readFileSync(join(ROOT, "index.html"), "utf8")
  .match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
function mapped(from, spec) {
  let to = IMPORTS[spec];
  if (!to) {
    const key = Object.keys(IMPORTS).filter((k) => k.endsWith("/") && spec.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    if (key) to = IMPORTS[key] + spec.slice(key.length);
  }
  if (!to) throw new Error(`${from} imports "${spec}", which index.html's import map does not name`);
  if (!to.startsWith("./")) throw new Error(`index.html maps "${spec}" to ${to}, which is not a repo file`);
  return to.slice(2);
}

const SDK = "vendor/rundot-sdk/rundot-game-api/index.js";

want("", "./index.html");
want("", "./" + SDK);
want("", "./vendor/rundot-sdk/LICENSE.md");
want("", "./vendor/three/LICENSE");
while (queue.length) scan(queue.shift());

rmSync(OUT, { recursive: true, force: true });
for (const rel of files) {
  mkdirSync(dirname(join(OUT, rel)), { recursive: true });
  cpSync(join(ROOT, rel), join(OUT, rel));
}
for (const dir of folders) cpSync(join(ROOT, dir), join(OUT, dir), { recursive: true });
if (existsSync(join(ROOT, "public"))) cpSync(join(ROOT, "public"), OUT, { recursive: true });

const page = readFileSync(join(OUT, "index.html"), "utf8");
const game = '<script type="module" src="./src/main.js"></script>';
if (!page.includes(game)) throw new Error(`index.html no longer loads the game as ${game}; update build.mjs`);
writeFileSync(join(OUT, "index.html"), page.replace(game, `${game}\n  <!-- RUN.world SDK: reports ready to the host (added by build.mjs). -->\n  <script type="module" src="./${SDK}"></script>`));

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
