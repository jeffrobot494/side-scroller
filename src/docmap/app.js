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
const DOC_DIRS = ["design/", "tech/", "idea/", "sprints/", "archive/"];
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
const STATUSES = ["unbuilt", "designed", "building", "built", "superseded", "reference"];

// A doc's id is its full path minus ".md" — unique across folders.
const idOf = (path) => path.replace(/\.md$/i, "").toLowerCase();
// The bare name is still how references resolve, since docs cite each other by
// filename as often as by path.
const nameOf = (path) => path.split("/").pop().replace(/\.md$/i, "").toLowerCase();
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let mockups = new Set(); // paths of "<doc>.mockup.html" found beside a doc
let docs = [];
let byId = new Map();
let byName = new Map(); // bare name -> [id...]; ambiguous names resolve to nothing
let backlinks = new Map();

// ---- loading ---------------------------------------------------------------

async function discover() {
  const found = [];
  mockups = new Set();
  for (const dir of DOC_DIRS) {
    try {
      const r = await fetch(dir, { cache: "no-store" });
      if (!r.ok) continue;
      const html = await r.text();
      for (const m of html.matchAll(/href="([^"]+\.(?:md|html))"/gi)) {
        const name = decodeURIComponent(m[1]).split("/").pop();
        const low = name.toLowerCase();
        if (low.endsWith(".mockup.html")) mockups.add(dir + name);
        else if (low.endsWith(".md")) found.push(dir + name);
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

export async function load() {
  const paths = await discover();
  const loaded = await Promise.all(paths.map(async (p) => {
    try { const r = await fetch(p, { cache: "no-store" }); return r.ok ? parse(p, await r.text()) : null; }
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
// only when it is unambiguous — `agent-navigation.md` exists in both design/ and
// tech/, so a bare reference to it stays a non-link rather than picking one.
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
    // Root notes (ROADMAP, CLAUDE, DOC-SCHEMA, WORKING-NOTES) carry no
    // frontmatter, so skip the schema rules for them — but still check their
    // links. ROADMAP is the doc most likely to rot and was the least watched.
    const root = d.folder === "" && !d.type;
    if (!root) {
      if (!d.category && d.type !== "sprint") out.push([d, "no category"]);
      if (d.type === "idea" && d.folder !== "idea/") out.push([d, "type is idea but it does not live in idea/"]);
      if (d.folder === "idea/" && d.type !== "idea") out.push([d, "lives in idea/ but type is not idea"]);
      if (!d.type) out.push([d, "no type"]);
      if (d.category && !CAT_LABEL[d.category]) out.push([d, `unknown category "${d.category}"`]);
      if (d.status && !STATUSES.includes(d.status)) out.push([d, `unknown status "${d.status}"`]);
      if (d.status === "built" && d.resolution === "vague") out.push([d, "built but never designed — resolution is vague"]);
      if (d.type === "design" && d.folder.startsWith("tech/")) out.push([d, "type is design but it lives in tech/"]);
      if (d.type === "tech" && d.folder.startsWith("design/")) out.push([d, "type is tech but it lives in design/"]);
        if (/[A-Z_]/.test(d.path.split("/").pop()) && d.folder) out.push([d, "filename should be lowercase-with-hyphens"]);
    }
    for (const ref of d.links) {
      // Only a reference carrying a folder is a link worth checking. A bare
      // filename is usually prose — a naming example in DOC-SCHEMA, an old
      // filename quoted in WORKING-NOTES — and flagging those is noise.
      if (!ref.includes("/")) continue;
      if (resolve(ref)) continue;
      const amb = (byName.get(nameOf(ref)) || []).length > 1;
      out.push([d, amb ? `links to "${ref}", which is ambiguous — use the full path` : `links to "${ref}", which does not exist`]);
    }
  }
  for (const m of mockups) {
    const doc = m.replace(/\.mockup\.html$/i, ".md");
    if (!byId.has(idOf(doc))) {
      out.push([{ id: idOf(m), title: m.split("/").pop(), path: m }, "mockup has no matching doc"]);
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

function row(d, extra = "") {
  const title = esc(d.title);
  return `<a class="row${d.sprint ? " sprint" : ""}${d.type === "idea" ? " idea" : ""}" href="#/d/${d.id}">
    <span class="t">${title}</span>${extra}<span class="meta">${badges(d)}</span></a>`;
}

// The map: one panel, one collapsible section per category. A list beats a card
// grid here — the point is scanning everything at once, not admiring the cards.
function viewMap() {
  // Design docs, plus ideas — future design for the same category, shown muted.
  const live = docs.filter((d) => (d.type === "design" || d.type === "idea") && d.status !== "superseded");
  const sections = CATS.map((c) => {
    const items = live.filter((d) => d.category === c);
    return `<details open><summary><span class="chev"></span>${CAT_LABEL[c]}
      <span class="spacer"></span><span class="n">${items.length}</span></summary>
      ${items.length ? items.map((d) => row(d)).join("") : '<div class="empty">nothing yet</div>'}
    </details>`;
  }).join("");
  const loose = live.filter((d) => !CATS.includes(d.category));
  const other = loose.length
    ? `<details open><summary><span class="chev"></span>Other<span class="spacer"></span><span class="n">${loose.length}</span></summary>${loose.map((d) => row(d)).join("")}</details>`
    : "";
  return `<h2 class="page">System map</h2>
    <p class="lede">${live.length} design docs. Amber rows are in scope for the current sprint.</p>
    <div class="tree">${sections}${other}</div>`;
}

function viewTech() {
  const items = docs
    .filter((d) => d.folder === "tech/")
    .sort((a, b) => a.title.localeCompare(b.title));
  return `<h2 class="page">Tech</h2>
    <p class="lede">Everything in <code>tech/</code>, alphabetical. Organise later.</p>
    <div class="tree"><details open><summary><span class="chev"></span>All
      <span class="spacer"></span><span class="n">${items.length}</span></summary>
      ${items.map((d) => row(d, `<span class="path">${esc(d.path)}</span>`)).join("")}
    </details></div>`;
}

function viewSprint() {
  const sprints = docs.filter((d) => d.type === "sprint").sort((a, b) => b.id.localeCompare(a.id));
  const s = sprints[0];
  if (!s) return `<h2 class="page">No sprint</h2><p class="lede">Nothing in <code>sprints/</code> yet.</p>`;
  // One row per system, and the row is the DESIGN page — that is what the sprint
  // is working toward. Tech pages are reachable from it.
  const bySystem = new Map();
  for (const d of docs) {
    if (d.sprint !== s.sprint || d.type === "sprint") continue;
    const cur = bySystem.get(d.name);
    if (!cur || (d.type === "design" && cur.type !== "design")) bySystem.set(d.name, d);
  }
  const inScope = [...bySystem.values()];
  return `<h2 class="page">${esc(s.title)}</h2>
    ${inScope.length ? `<div class="tree" style="margin-bottom:22px"><details open>
      <summary><span class="chev"></span>In scope<span class="spacer"></span><span class="n">${inScope.length}</span></summary>
      ${inScope.map((d) => row(d)).join("")}</details></div>` : ""}
    <div class="doc">${renderMd(s.body, linkFor)}</div>`;
}

function viewDoc(id) {
  const d = byId.get(id);
  if (!d) return `<h2 class="page">Not found</h2><p class="lede">No doc with id <code>${esc(id)}</code>.</p>`;
  const back = (backlinks.get(id) || []).map((s) => `<a href="#/d/${s}">${esc(byId.get(s).title)}</a>`).join("");
  // A mockup sits beside its doc as "<doc>.mockup.html" and opens the page —
  // what it looks like belongs above what it says.
  const mock = d.path.replace(/\.md$/i, ".mockup.html");
  const shot = mockups.has(mock)
    ? `<div class="mockup"><iframe src="${mock}" title="Mockup"></iframe>
        <a class="pop" href="${mock}" target="_blank">Open standalone</a></div>`
    : "";
  return `<div class="crumb">${esc(d.path)}</div>${shot}
    <div class="meta-row">${badges(d)}${d.category ? `<span class="badge b-designed">${CAT_LABEL[d.category] || d.category}</span>` : ""}</div>
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

function topnav(route) {
  const on = (h) => (route === h || (h === "/map" && route === "/") ? " class=on" : "");
  const n = lint().length;
  return `<div class="top">
    <span class="brand">Design map</span>
    <a href="#/map"${on("/map")}>System Map</a>
    <a href="#/sprint"${on("/sprint")}>Sprint</a>
    <a href="#/tech"${on("/tech")}>Tech</a>
    <span class="spacer"></span>
    <a class="drift" href="#/lint">Drift${n ? ` <b>${n}</b>` : ""}</a>
    <a class="drift" href="#" id="reload">Reload</a>
  </div>`;
}

function draw() {
  const route = location.hash.replace(/^#/, "") || "/map";
  const main =
    route === "/sprint" ? viewSprint()
    : route === "/tech" ? viewTech()
    : route === "/lint" ? viewLint()
    : route.startsWith("/d/") ? viewDoc(route.slice(3))
    : viewMap();
  document.querySelector("#app").innerHTML = topnav(route) + `<div class="main">${main}</div>`;
  document.querySelector("#reload").onclick = async (e) => {
    e.preventDefault();
    e.target.textContent = "Reloading…";
    await load();
    draw();
  };
  window.scrollTo(0, 0);
}

export async function main() {
  document.querySelector("#app").innerHTML = '<div class="main"><p class="lede">Loading…</p></div>';
  await load();
  addEventListener("hashchange", draw);
  draw();
}
