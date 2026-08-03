// docmap — the design map's pure parts: markdown rendering and doc parsing.
// The views need a browser; those are an eyeball check at /design.html.

import { render, renderInline } from "../src/docmap/md.js";
import { parse, index, resolve, backlinksFor, lint } from "../src/docmap/app.js";

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
}
