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
  // A system's state page is named after the system, so filename-only ids made
  // tech/AGENT-NAVIGATION.md and tech/systems/agent-navigation.md the same doc.
  index([
    parse("tech/AGENT-NAVIGATION.md", "---\ntype: tech\n---\n# Agent navigation and goals\n"),
    parse("tech/systems/agent-navigation.md", "---\ntype: state\n---\n# Agent navigation\n"),
    parse("tech/SOUND.md", "---\ntype: tech\n---\n# Sound\n\nSee `tech/AGENT-NAVIGATION.md` and `tech/systems/agent-navigation.md`.\n"),
  ]);

  t.eq("same-named docs keep distinct ids", resolve("tech/AGENT-NAVIGATION.md"), "tech/agent-navigation");
  t.eq("state page resolves separately", resolve("tech/systems/agent-navigation.md"), "tech/systems/agent-navigation");
  t.eq("ambiguous bare name resolves to nothing", resolve("agent-navigation.md"), null);
  t.eq("unambiguous bare name still resolves", resolve("SOUND.md"), "tech/sound");
  t.eq("unknown resolves to nothing", resolve("tech/NOPE.md"), null);
  t.eq("backlinks land on the design doc", backlinksFor("tech/agent-navigation").join(), "tech/sound");
  t.eq("backlinks land on the state doc too", backlinksFor("tech/systems/agent-navigation").join(), "tech/sound");
  t.ok("ambiguous refs are linted", lint().every(([, why]) => !why.includes("ambiguous")));
}
