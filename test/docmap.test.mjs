// docmap — the design map's pure parts: markdown rendering and doc parsing.
// The views need a browser; those are an eyeball check at /design.html.

import { render, renderInline } from "../src/docmap/md.js";
import { parse, index, resolve, backlinksFor, lint, setModules } from "../src/docmap/app.js";

const link = (ref) => {
  const slug = ref.split("/").pop().replace(/\.md$/i, "").toLowerCase();
  return ["sound", "roadmap"].includes(slug) ? `#/d/${slug}` : null;
};

export default async function run(t) {
  // ---- markdown ----------------------------------------------------------
  const doc = render(
    ["# Title", "", "## Section", "", "| a | b |", "|---|---|", "| 1 | 2 |", "",
     "- one", "- two", "", "> quoted", "", "```", "raw <code> here", "```", "",
     "Some **bold** and *italic* and `plain` text."].join("\n"), link);

  t.ok("heading", doc.includes("<h1>Title</h1>"));
  t.ok("subheading", doc.includes("<h2>Section</h2>"));
  t.ok("table head", doc.includes("<th>a</th>"));
  t.ok("table body", doc.includes("<td>1</td>"));
  t.ok("list", doc.includes("<li>one</li>"));
  t.ok("blockquote", doc.includes("<blockquote>"));
  t.ok("fence", doc.includes("<pre><code>"));
  t.ok("fence escapes html", doc.includes("raw &lt;code&gt; here"));
  t.ok("bold", doc.includes("<strong>bold</strong>"));
  t.ok("italic", doc.includes("<em>italic</em>"));
  t.ok("inline code", doc.includes("<code>plain</code>"));

  // Doc references are written in backticks throughout this repo, so those are
  // what the link graph actually runs on — not [[wiki]] syntax.
  t.ok("backticked path links", renderInline("see `tech/SOUND.md` now", link).includes('href="#/d/sound"'));
  t.ok("unknown path stays code", !renderInline("see `tech/NOPE.md`", link).includes("<a "));
  t.ok("wiki link", renderInline("[[roadmap]]", link).includes('href="#/d/roadmap"'));
  t.ok("wiki alias", renderInline("[[roadmap|the plan]]", link).includes(">the plan</a>"));
  t.ok("md link", renderInline("[x](tech/SOUND.md)", link).includes('href="#/d/sound"'));
  t.ok("escapes markup", renderInline("<script>x</script>", link).includes("&lt;script&gt;"));

  // ---- parsing -----------------------------------------------------------
  const d = parse("tech/THING.md", [
    "---", "type: tech", "category: artificial-intelligence", "status: building",
    "resolution: sharp", "sprint: 2026-08", "tags: [a, b]", "---", "",
    "# Thing", "", "Depends on `tech/SOUND.md` and `ROADMAP.md`.",
    "", "```", "ignore tech/FAKE.md in code", "```",
  ].join("\n"));

  t.eq("id is the full path", d.id, "tech/thing");
  t.eq("name is the filename", d.name, "thing");
  t.eq("folder", d.folder, "tech/");
  t.eq("title from h1", d.title, "Thing");
  t.eq("type", d.type, "tech");
  t.eq("category", d.category, "artificial-intelligence");
  t.eq("status", d.status, "building");
  t.eq("resolution", d.resolution, "sharp");
  t.eq("sprint", d.sprint, "2026-08");
  t.ok("frontmatter stripped from body", !d.body.includes("type: tech"));
  t.ok("links found", d.links.includes("tech/sound.md") && d.links.includes("roadmap.md"));
  t.ok("code fences excluded from links", !d.links.join(" ").includes("fake"));
  t.ok("no self-link", !d.links.includes("tech/thing.md"));

  const bare = parse("archive/OLD.md", "no frontmatter here\n");
  t.eq("title falls back to filename", bare.title, "OLD.md");
  t.eq("missing type is empty", bare.type, "");
  t.eq("root folder", parse("ROADMAP.md", "# R").folder, "");

  // ---- id collisions -----------------------------------------------------
  // A system has both a design doc and a tech doc under the same filename, so
  // filename-only ids would collapse them into one.
  index([
    parse("design/agent-navigation.md", "---\ntype: design\ncategory: artificial-intelligence\n---\n# Agent navigation\n"),
    parse("tech/agent-navigation.md", "---\ntype: tech\ncategory: artificial-intelligence\n---\n# Agent navigation\n"),
    parse("tech/sound.md", "---\ntype: tech\ncategory: content-generation\n---\n# Sound\n\nSee `design/agent-navigation.md` and `tech/agent-navigation.md`.\n"),
  ]);

  t.eq("same-named docs keep distinct ids", resolve("design/agent-navigation.md"), "design/agent-navigation");
  t.eq("the tech twin resolves separately", resolve("tech/agent-navigation.md"), "tech/agent-navigation");
  t.eq("ambiguous bare name resolves to nothing", resolve("agent-navigation.md"), null);
  t.eq("unambiguous bare name still resolves", resolve("sound.md"), "tech/sound");
  t.eq("unknown resolves to nothing", resolve("tech/nope.md"), null);
  t.eq("backlinks land on the design doc", backlinksFor("design/agent-navigation").join(), "tech/sound");
  t.eq("backlinks land on the tech doc too", backlinksFor("tech/agent-navigation").join(), "tech/sound");
  t.ok("no ambiguous refs in this fixture", lint().every(([, why]) => !why.includes("ambiguous")));

  // ---- root docs are link-checked even without frontmatter ----------------
  index([
    parse("tech/sound.md", "---\ntype: tech\ncategory: content-generation\n---\n# Sound\n"),
    parse("ROADMAP.md", "# Roadmap\n\nSee `tech/sound.md` and `tech/gone.md`.\n"),
  ]);
  const rows = lint();
  t.ok("root doc broken link is caught", rows.some(([d, w]) => d.id === "roadmap" && w.includes("gone.md")));
  t.ok("root doc is exempt from schema rules", !rows.some(([d, w]) => d.id === "roadmap" && w.includes("no type")));

  // ---- the seven parts, and WHEN they are enforced -----------------------
  // An incomplete spec blocks only the thing it specifies, and only once someone
  // is building from it. Writing a design doc must never redden the bar.
  const SECTIONS = ["Reuses","Where the code goes","The seam","Slices","Must not regress","Approximations"];
  const spec = (status, parts = SECTIONS, needs = "[nav]") =>
    `---\ntype: tech\ncategory: scenes\nstatus: ${status}\nneeds: ${needs}\n---\n# T\n`
    + parts.map((s) => `## ${s}\n\nx\n`).join("\n");
  const design = "---\ntype: design\ncategory: scenes\nsprint: 2026-08\n---\n# Thing\n";

  index([parse("design/thing.md", design), parse("tech/thing.md", spec("unbuilt"))]);
  t.eq("a complete spec passes", lint().length, 0);

  index([parse("design/thing.md", design), parse("tech/thing.md", spec("unbuilt", ["Slices"]))]);
  let specRows = lint();
  t.eq("an unbuilt spec missing parts does not block", specRows.filter(([, , b]) => b).length, 0);
  t.ok("...but it is still reported", specRows.some(([, w]) => w.includes("missing")));
  t.ok("the parts are named in one row", specRows.some(([, w]) => w.includes("Reuses") && w.includes("Approximations")));
  t.ok("a present section is not named", !specRows.some(([, w]) => w.includes('"## Slices"')));

  index([parse("design/thing.md", design), parse("tech/thing.md", spec("building", ["Slices"]))]);
  t.ok("a spec being BUILT from must be complete", lint().some(([, w, b]) => b && w.includes("building")));

  index([parse("design/thing.md", design), parse("tech/thing.md", spec("built", SECTIONS, ""))]);
  t.ok("missing `needs` blocks once built", lint().some(([, w, b]) => b && w.includes("needs")));

  index([parse("design/thing.md", design)]);
  specRows = lint();
  t.ok("no spec at all is reported", specRows.some(([, w]) => w.includes("no tech spec")));
  t.eq("...and does not block, so design work is never punished", specRows.filter(([, , b]) => b).length, 0);

  index([parse("design/thing.md", "---\ntype: design\ncategory: scenes\n---\n# Thing\n")]);
  t.eq("outside a sprint, nothing is required", lint().length, 0);

  // a prerequisite that is not finished blocks the thing that needs it
  index([
    parse("design/thing.md", design),
    parse("tech/thing.md", spec("building", SECTIONS, "[dep]")),
    parse("tech/dep.md", spec("unbuilt", ["Slices"])),
  ]);
  t.ok("an incomplete prerequisite blocks its dependent", lint().some(([, w, b]) => b && w.includes('needs "dep"')));

  index([
    parse("design/thing.md", design),
    parse("tech/thing.md", spec("building", SECTIONS, "[gone]")),
  ]);
  t.ok("a prerequisite with no spec blocks too", lint().some(([, w, b]) => b && w.includes('needs "gone"')));

  // the backstop: status never flipped, but the declared module now exists
  const withNew = "---\ntype: tech\ncategory: scenes\nstatus: unbuilt\nneeds: []\n---\n# T\n"
    + "## Slices\n\n`src/game/nav.js` (new)\n";
  index([parse("design/thing.md", design), parse("tech/thing.md", withNew)]);
  t.eq("a declared module that does not exist yet does not block", lint().filter(([, , b]) => b).length, 0);
  setModules(["src/game/nav.js"]);
  t.ok("...but once it exists, the incomplete spec blocks", lint().some(([, w, b]) => b && w.includes("implementation has started")));
  setModules([]);

  t.ok("every row carries a blocking flag", lint().every(([, , b]) => typeof b === "boolean"));
}
