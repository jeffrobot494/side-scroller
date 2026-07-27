// Design workbench view layer: makeDoc + the pure HTML render helpers.
import {
  makeDoc, summarize, STATUSES,
  sidebarHtml, docViewHtml, readyQueueHtml, graphViewHtml, tagViewHtml,
} from "../src/design/app.js";
import { editorHtml, HANDOFF_TEMPLATE } from "../src/design/editor.js";
import { buildGraph } from "../src/design/graph.js";

export default async function run(t) {
  const a = makeDoc("SOUND.md",
    "---\nstatus: built\ntags: [audio]\n---\n# Sound System\nThe audio layer. See [[weapon-designer]].");
  const b = makeDoc("WEAPON-DESIGNER.md",
    "---\nstatus: ready\nbuild: v0.4\ntags: [weapons]\n---\n# Weapon Designer\nRework of the tool. Uses [SOUND](SOUND.md).");
  const c = makeDoc("GDD.md", "# Game Design Document\nThe vision.");
  const docs = [a, b, c];
  const graph = buildGraph(docs);

  // makeDoc normalization
  t.eq("id from filename", a.id, "sound");
  t.eq("status parsed", a.status, "built");
  t.eq("build parsed", b.build, "v0.4");
  t.eq("tags parsed", b.tags.join(","), "weapons");
  t.eq("title from heading", a.title, "Sound System");
  t.eq("no-fm status defaults draft", c.status, "draft");
  t.ok("raw retained for editor", a.raw.startsWith("---"));
  t.ok("summary is prose", summarize(a.body).startsWith("The audio layer"));
  t.ok("STATUSES has ready", STATUSES.includes("ready"));

  // graph wiring across the three link forms
  t.eq("sound backlinked by designer", (graph.backlinks.get("sound") || []).join(","), "weapon-designer");
  t.eq("designer backlinked by sound", (graph.backlinks.get("weapon-designer") || []).join(","), "sound");

  // sidebar: grouped, filterable, has nav + filter controls
  const side = sidebarHtml(docs, "sound", {});
  t.ok("sidebar lists a doc", side.includes("Sound System"));
  t.ok("sidebar marks active", /active[^>]*>.*Sound System/s.test(side) || side.includes('class=" active"') || side.includes('class="active"') || side.includes("active"));
  t.ok("sidebar has ready-queue nav", side.includes("#!ready"));
  t.ok("sidebar status filter", side.includes("dz-fstatus"));
  t.ok("sidebar build filter appears", side.includes("dz-fbuild"));
  const filtered = sidebarHtml(docs, "", { status: "ready" });
  t.ok("status filter narrows", filtered.includes("Weapon Designer") && !filtered.includes("Sound System"));

  // doc view: badges, rendered body, relations
  const dv = docViewHtml(b, docs, graph);
  t.ok("doc badge status", dv.includes('dz-badge ready'));
  t.ok("doc badge build", dv.includes("v0.4"));
  t.ok("doc renders heading", dv.includes("<h1>Weapon Designer</h1>"));
  t.ok("doc has edit button", dv.includes('data-action="edit"'));
  t.ok("doc links-to sound", dv.includes('href="#sound"'));
  t.ok("doc referenced-by shown", dv.includes("Referenced by"));

  // ready queue
  const rq = readyQueueHtml(docs);
  t.ok("ready queue lists ready doc", rq.includes("Weapon Designer"));
  t.ok("ready queue excludes non-ready", !rq.includes("Sound System"));
  t.ok("empty ready queue message", readyQueueHtml([c]).includes("Nothing is marked"));

  // graph + tag views render as SVG/cards
  const gv = graphViewHtml(docs, graph);
  t.ok("graph is svg", gv.includes("<svg") && gv.includes("<circle"));
  t.ok("graph node links to doc", gv.includes('href="#sound"'));
  t.ok("tag view filters by tag", tagViewHtml("weapons", docs).includes("Weapon Designer"));

  // editor
  const enew = editorHtml(null, docs);
  t.ok("new editor has template", enew.includes("Handoff brief") && enew.includes("<textarea"));
  t.ok("new editor filename field", enew.includes("dz-file"));
  const eedit = editorHtml(b, docs);
  t.ok("edit editor loads raw", eedit.includes("Rework of the tool"));
  t.ok("handoff template exported", HANDOFF_TEMPLATE.includes("Acceptance criteria"));
}
