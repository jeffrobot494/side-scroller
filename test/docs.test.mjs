// docs — the documentation is checked by the same bar as the code.
//
// Two rules, both aimed at the way a tech spec goes wrong:
//
//   1. A spec that cites code which does not exist. Either it was written from
//      memory instead of from the repo, or the module moved and the spec rotted.
//      Both are silent failures that a builder then follows off a cliff.
//   2. A spec that is missing one of the seven required parts WHILE SOMEBODY IS
//      BUILDING FROM IT. An incomplete spec for work nobody has started is a
//      plan, not a defect — gating on that would punish writing design docs,
//      which is backwards. See "When the seven are enforced" in DOC-SCHEMA.md.
//
// Rule 1 runs over tech/ only. Design docs are not supposed to name modules at
// all (see the standing rule in CLAUDE.md), so a citation there is its own bug.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as resolvePath } from "node:path";
import { parse, index, lint, setModules } from "../src/docmap/app.js";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const DOC_DIRS = ["design", "tech", "idea", "sprints", "archive"];

const mdIn = (dir) => {
  const d = join(ROOT, dir);
  return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".md")).map((f) => `${dir}/${f}`) : [];
};

// A backticked token that looks like a repo path. Trailing "/" means a folder.
const CITATION = /`((?:src|test)\/[A-Za-z0-9_./-]*)`/g;

// A spec has to name modules that do not exist yet — that is what "Where the code
// goes" is for. It declares them by marking the path `(new)`, and that declaration
// exempts the path everywhere in the document, so Slices can reference it too.
const DECLARED_NEW = /`((?:src|test)\/[A-Za-z0-9_./-]*)`\s*\(new\)/g;
const declaredNew = (text) => new Set([...text.matchAll(DECLARED_NEW)].map((m) => m[1]));

export default async function run(t) {
  // ---- 1. every code path a tech spec cites must exist --------------------
  const bad = [];
  for (const rel of mdIn("tech")) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    const planned = declaredNew(text);
    for (const m of text.matchAll(CITATION)) {
      const cited = m[1];
      if (planned.has(cited)) continue; // declared as a file this spec creates
      if (!existsSync(join(ROOT, cited))) bad.push(`${rel} cites \`${cited}\`, which does not exist`);
    }
  }
  t.ok(`tech specs cite only real paths${bad.length ? ` — ${bad.join("; ")}` : ""}`, bad.length === 0);

  // ---- 2. nothing in the current sprint may be missing a spec part --------
  const docs = [];
  for (const dir of DOC_DIRS) for (const rel of mdIn(dir)) docs.push(parse(rel, readFileSync(join(ROOT, rel), "utf8")));
  for (const f of ["ROADMAP.md", "DOC-SCHEMA.md", "CLAUDE.md", "WORKING-NOTES.md"]) {
    if (existsSync(join(ROOT, f))) docs.push(parse(f, readFileSync(join(ROOT, f), "utf8")));
  }
  // The browser cannot stat files, so feed lint() the module list for its
  // "implementation has started" backstop.
  const walk = (dir, acc = []) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      e.isDirectory() ? walk(rel, acc) : acc.push(rel);
    }
    return acc;
  };
  setModules([...walk("src"), ...walk("test")]);
  index(docs);

  // A spec about to be followed that names no module at all was written from
  // memory. Only applied to sprint work — older docs are archaeology, and a
  // permanently red suite is a suite people stop reading.
  const inSprint = docs.filter((d) => d.type === "design" && d.sprint);
  for (const d of inSprint) {
    const rel = `tech/${d.name}.md`;
    if (!existsSync(join(ROOT, rel))) continue; // the lint below is the louder complaint
    const text = readFileSync(join(ROOT, rel), "utf8");
    t.ok(`${rel} names the code it builds on`, [...text.matchAll(CITATION)].length > 0);
  }

  // ---- 3. the roadmap is the status index, so it must agree with the docs ---
  // It went stale in Aug 2026 because it restated facts that live elsewhere.
  // Restating is now the thing under test: anything ROADMAP claims about another
  // doc has to still be true, and anything the docs claim is built has to be
  // indexed there. What it may NOT restate — dates, slice numbers, taxonomy —
  // simply is not there any more, so it cannot drift.
  const road = readFileSync(join(ROOT, "ROADMAP.md"), "utf8");

  const deadRefs = docs
    .filter((d) => d.id === "roadmap")
    .flatMap((d) => d.links)
    .filter((ref) => DOC_DIRS.some((dir) => ref.startsWith(`${dir}/`)))
    .filter((ref) => !existsSync(join(ROOT, ref)));
  t.ok(`ROADMAP links all resolve${deadRefs.length ? ` — dead: ${deadRefs.join(", ")}` : ""}`, deadRefs.length === 0);

  const unindexed = docs.filter((d) => d.status === "built" && !road.includes(d.path)).map((d) => d.path);
  t.ok(
    `every built system is indexed in ROADMAP${unindexed.length ? ` — missing: ${unindexed.join(", ")}` : ""}`,
    unindexed.length === 0,
  );

  const sprints = mdIn("sprints").sort();
  const newest = sprints[sprints.length - 1];
  t.ok(`ROADMAP's Now points at the newest sprint (${newest})`, !newest || road.includes(newest));

  // ---- 4. Slices leads a gated spec ---------------------------------------
  // A builder opening a spec wants "what am I doing, in what order" before any
  // explanation of how the subsystem works. Checked only for specs the sprint
  // gate already covers, so older docs are not retro-fitted.
  for (const d of inSprint) {
    const rel = `tech/${d.name}.md`;
    if (!existsSync(join(ROOT, rel))) continue;
    const headings = readFileSync(join(ROOT, rel), "utf8").match(/^## .+$/gm) || [];
    t.ok(`${rel} opens with "## Slices" (found "${headings[0] || "no sections"}")`, headings[0] === "## Slices");
  }

  const blocking = lint().filter(([, , b]) => b).map(([d, why]) => `${d.path}: ${why}`);
  // One assertion, not one per gap — a wall of red is a wall people stop reading.
  t.ok(
    blocking.length
      ? `work in progress has an incomplete spec — ${blocking.length} blocking gap(s):\n      ${blocking.join("\n      ")}`
      : "nothing is being built from an incomplete spec",
    blocking.length === 0,
  );
}
