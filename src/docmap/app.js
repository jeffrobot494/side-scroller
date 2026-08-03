// app.js — the design map. A read-only lens over the doc tree.
//
// Reads every .md under the type folders (see DOC-SCHEMA.md), parses the
// frontmatter, and renders three views: the current sprint, a map of every
// system grouped by category, and a doc reader. Plus a lint pass, because the
// browser is also the drift detector — a doc with no category or a link to a
// file that does not exist should be visible, not silent.
//
// No build step, no dependencies, native ESM — same as the game and editor.
// Serve the repo (`python3 -m http.server 8000`) and open /design.html.

import { render as renderMd, DOC_REF } from "./md.js";

// Discovery walks these using the directory listing python's http.server emits.
// A folder that is missing or not served simply contributes nothing.
const DOC_DIRS = ["design/", "tech/", "sprints/", "archive/"];
const ROOT_DOCS = ["ROADMAP.md", "DOC-SCHEMA.md", "CLAUDE.md", "WORKING-NOTES.md"];

// The six categories, in the order they are shown. Flat — no grouping.
const CATS = [
  "development-tools",
  "gameplay-systems",
  "artificial-intelligence",
  "scenes",
  "content-generation",
  "game-data",
];
const CAT_LABEL = {
  "development-tools": "Development tools",
  "gameplay-systems": "Gameplay systems",
  "artificial-intelligence": "Artificial intelligence",
  scenes: "Scenes",
  "content-generation": "Content generation systems",
  "game-data": "Game data",
  vision: "Vision",
};
const STATUSES = ["idea", "designed", "building", "built", "superseded", "reference"];

// A doc's id is its full path minus ".md" — unique across folders.
const idOf = (path) => path.replace(/\.md$/i, "").toLowerCase();
// The bare name is still how references resolve, since docs cite each other by
// filename as often as by path.
const nameOf = (path) => path.split("/").pop().replace(/\.md$/i, "").toLowerCase();
// A state page is "<system>.state.md", so both docs about one system share a
// system name while keeping distinct filenames.
const systemOf = (d) => d.name.replace(/\.state$/, "");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let docs = [];
let byId = new Map();
let byName = new Map(); // bare name -> [id...]; ambiguous names resolve to nothing
let backlinks = new Map();

// ---- loading ---------------------------------------------------------------

async function discover() {
  const found = [];
  for (const dir of DOC_DIRS) {
    try {
      const r = await fetch(dir);
      if (!r.ok) continue;
      const html = await r.text();
      for (const m of html.matchAll(/href="([^"]+\.md)"/gi)) {
        const name = decodeURIComponent(m[1]).split("/").pop();
        if (name.toLowerCase().endsWith(".md")) found.push(dir + name);
      }
    } catch { /* not served — skip */ }
  }
  return [...new Set([...found, ...ROOT_DOCS])];
}

export function parse(path, text) {
  const fm = {};
  let body = text;
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) {
    body = text.slice(m[0].length);
    for (const line of m[1].split("\n")) {
      const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!kv) continue;
      const v = kv[2].trim();
      fm[kv[1]] = v.startsWith("[") && v.endsWith("]")
        ? v.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean)
        : v.replace(/^["']|["']$/g, "");
    }
  }
  const h1 = body.match(/^#\s+(.+)$/m);
  const links = new Set();
  const scan = body.replace(/```[\s\S]*?```/g, "");
  // A backticked path IS a link (this repo writes references that way), but a
  // backticked [[...]] is a doc explaining the syntax, not using it — so wiki
  // links are only read outside code spans.
  const prose = scan.replace(/`[^`\n]*`/g, "");
  for (const ref of scan.match(DOC_REF) || []) links.add(ref.toLowerCase());
  for (const w of prose.matchAll(/\[\[([^\]|]+)/g)) links.add(w[1].trim().toLowerCase() + ".md");
  links.delete(path.toLowerCase());
  links.delete("");

  return {
    id: idOf(path),
    name: nameOf(path),
    path,
    folder: path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "",
    title: h1 ? h1[1].replace(/[*_`]/g, "").trim() : path.split("/").pop(),
    type: fm.type || "",
    category: fm.category || "",
    status: fm.status || "",
    resolution: fm.resolution || "",
    sprint: fm.sprint || "",
    body,
    links: [...links],
  };
}

async function load() {
  const paths = await discover();
  const loaded = await Promise.all(paths.map(async (p) => {
    try { const r = await fetch(p); return r.ok ? parse(p, await r.text()) : null; }
    catch { return null; }
  }));
  index(loaded.filter(Boolean));
}

// Build the lookups from a doc list. Separate from load() so it is testable
// without a server.
export function index(list) {
  docs = list.sort((a, b) => a.title.localeCompare(b.title));
  byId = new Map(docs.map((d) => [d.id, d]));
  byName = new Map();
  for (const d of docs) {
    if (!byName.has(d.name)) byName.set(d.name, []);
    byName.get(d.name).push(d.id);
  }
  backlinks = new Map();
  for (const d of docs) {
    for (const ref of d.links) {
      const to = resolve(ref);
      if (!to || to === d.id) continue;
      if (!backlinks.has(to)) backlinks.set(to, []);
      if (!backlinks.get(to).includes(d.id)) backlinks.get(to).push(d.id);
    }
  }
  return docs;
}

export const backlinksFor = (id) => backlinks.get(id) || [];

// Resolve a reference to a doc id. An exact path wins; a bare filename resolves
// only when it is unambiguous, so `agent-navigation.state.md` (two of them) stays a
// non-link rather than silently picking one.
export function resolve(ref) {
  const id = idOf(ref);
  if (byId.has(id)) return id;
  const hits = byName.get(nameOf(ref)) || [];
  return hits.length === 1 ? hits[0] : null;
}

const linkFor = (ref) => { const id = resolve(ref); return id ? `#/d/${id}` : null; };

// ---- lint ------------------------------------------------------------------

export function lint() {
  const out = [];
  for (const d of docs) {
    if (d.folder === "" && !d.type) continue; // root notes are exempt
    if (!d.category && d.type !== "sprint") out.push([d, "no category"]);
    if (!d.type) out.push([d, "no type"]);
    if (d.category && !CAT_LABEL[d.category]) out.push([d, `unknown category "${d.category}"`]);
    if (d.status && !STATUSES.includes(d.status)) out.push([d, `unknown status "${d.status}"`]);
    if (d.status === "built" && d.resolution === "vague") out.push([d, "built but never designed — resolution is vague"]);
    if (d.type === "design" && d.folder.startsWith("tech/")) out.push([d, "type is design but it lives in tech/"]);
    if (d.type === "tech" && d.folder.startsWith("design/")) out.push([d, "type is tech but it lives in design/"]);
    if (d.name.endsWith(".state") && d.type !== "state") out.push([d, "named *.state.md but type is not state"]);
    if (d.type === "state" && !d.name.endsWith(".state")) out.push([d, "type is state but not named *.state.md"]);
    if (/[A-Z_]/.test(d.path.split("/").pop()) && d.folder) out.push([d, "filename should be lowercase-with-hyphens"]);
    for (const ref of d.links) {
      if (resolve(ref)) continue;
      const amb = (byName.get(nameOf(ref)) || []).length > 1;
      out.push([d, amb ? `links to "${ref}", which is ambiguous — use the full path` : `links to "${ref}", which does not exist`]);
    }
  }
  return out;
}

// ---- views -----------------------------------------------------------------

function badges(d) {
  const b = [];
  if (d.status) b.push(`<span class="badge b-${d.status}">${d.status}</span>`);
  if (d.resolution === "vague") b.push(`<span class="badge vague b-idea">vague</span>`);
  if (d.status === "built" && d.resolution === "vague") b.push(`<span class="badge warn">undesigned</span>`);
  if (d.sprint) b.push(`<span class="badge b-building">${d.sprint}</span>`);
  return b.join(" ");
}

function card(d) {
  return `<a class="card${d.sprint ? " sprint" : ""}" href="#/d/${d.id}">
    <span class="t">${esc(d.title)}</span><span class="row">${badges(d)}</span></a>`;
}

function viewMap() {
  const live = docs.filter((d) =>
    (d.type === "design" || d.type === "tech") && d.status !== "superseded");
  const cols = CATS.map((c) => {
    const items = live.filter((d) => d.category === c);
    return `<div class="group"><h3>${CAT_LABEL[c]}</h3>${
      items.length ? items.map(card).join("") : '<p class="empty">nothing yet</p>'
    }</div>`;
  }).join("");

  const loose = live.filter((d) => !CATS.includes(d.category));
  return `<div class="crumb">${live.length} live docs</div>
    <h2 class="page">System map</h2>
    <p class="lede">Everything designed or built, by category. Amber cards are in scope for the current sprint.</p>
    <div class="groups">${cols}</div>
    ${loose.length ? `<div class="group" style="margin-top:26px"><h3>Other</h3>${loose.map(card).join("")}</div>` : ""}`;
}

function viewSprint() {
  const sprints = docs.filter((d) => d.type === "sprint").sort((a, b) => b.id.localeCompare(a.id));
  const s = sprints[0];
  if (!s) return `<h2 class="page">No sprint</h2><p class="lede">Nothing in <code>sprints/</code> yet.</p>`;
  // One card per system, not per document: a system in scope usually has both a
  // design doc and a state page, and showing both is just two links to the same
  // thing wearing different titles. The state page wins when it exists.
  const bySystem = new Map();
  for (const d of docs) {
    if (d.sprint !== s.sprint || d.type === "sprint") continue;
    const key = systemOf(d);
    const cur = bySystem.get(key);
    if (!cur || (d.type === "state" && cur.type !== "state")) bySystem.set(key, d);
  }
  const inScope = [...bySystem.values()];
  return `<div class="crumb">${esc(s.path)}</div>
    <h2 class="page">${esc(s.title)}</h2>
    ${inScope.length ? `<p class="lede">In scope this sprint:</p><div class="groups" style="grid-template-columns:repeat(2,1fr)">${
      inScope.map((d) => `<div>${card(d)}</div>`).join("")}</div>` : ""}
    <div class="doc" style="margin-top:22px">${renderMd(s.body, linkFor)}</div>`;
}

function viewDoc(id) {
  const d = byId.get(id);
  if (!d) return `<h2 class="page">Not found</h2><p class="lede">No doc with slug <code>${esc(id)}</code>.</p>`;
  const back = (backlinks.get(id) || []).map((s) => `<a href="#/d/${s}">${esc(byId.get(s).title)}</a>`).join("");
  return `<div class="crumb">${esc(d.path)}</div>
    <div class="meta">${badges(d)}${d.category ? `<span class="badge b-designed">${CAT_LABEL[d.category] || d.category}</span>` : ""}</div>
    <div class="doc">${renderMd(d.body, linkFor)}
      ${back ? `<div class="backlinks"><div class="lbl">Referenced by</div>${back}</div>` : ""}</div>`;
}

function viewLint() {
  const rows = lint();
  return `<h2 class="page">Drift</h2>
    <p class="lede">Checks the docs against themselves and the schema. Empty is the goal.</p>
    ${rows.length
      ? `<div class="lint">${rows.map(([d, why]) =>
          `<div class="item"><a class="who" href="#/d/${d.id}">${esc(d.title)}</a><span class="why">${esc(why)}</span></div>`).join("")}</div>`
      : `<p class="ok">No drift. Every doc has a type and category, and every link resolves.</p>`}`;
}

// ---- shell -----------------------------------------------------------------

function sidebar(route) {
  const on = (h) => (route === h ? " class=on" : "");
  const n = lint().length;
  const group = (label, list) => list.length
    ? `<div class="navgroup"><div class="lbl">${label}</div>${list.map((d) =>
        `<a href="#/d/${d.id}"${route === `/d/${d.id}` ? ' class="on"' : ""}>${esc(d.title)}</a>`).join("")}</div>`
    : "";
  const of = (t) => docs.filter((d) => d.type === t && d.status !== "superseded");
  return `<div class="side">
    <h1>Design map</h1>
    <p class="sub">${docs.length} docs</p>
    <div class="navgroup">
      <a href="#/"${on("/")}>Current sprint</a>
      <a href="#/map"${on("/map")}>System map</a>
      <a href="#/lint"${on("/lint")}>Drift <span class="n">${n || ""}</span></a>
    </div>
    ${group("Design", of("design"))}
    ${group("Tech", of("tech"))}
    ${group("State", of("state"))}
    ${group("Archive", docs.filter((d) => d.status === "superseded" || d.folder === "archive/"))}
  </div>`;
}

function draw() {
  const route = location.hash.replace(/^#/, "") || "/";
  const main =
    route === "/" ? viewSprint()
    : route === "/map" ? viewMap()
    : route === "/lint" ? viewLint()
    : route.startsWith("/d/") ? viewDoc(route.slice(3))
    : viewSprint();
  document.querySelector("#app").innerHTML = sidebar(route) + `<div class="main">${main}</div>`;
  window.scrollTo(0, 0);
}

export async function main() {
  document.querySelector("#app").innerHTML = '<div class="main"><p class="lede">Loading…</p></div>';
  await load();
  addEventListener("hashchange", draw);
  draw();
}
