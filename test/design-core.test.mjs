// Design workbench core: frontmatter/link parsing, markdown rendering, graph.
import { parseDoc, extractLinks, slugify, docTitle } from "../src/design/parse.js";
import { renderMarkdown } from "../src/design/markdown.js";
import { buildGraph } from "../src/design/graph.js";

export default async function run(t) {
  // ---- parse: frontmatter ----
  const withFm = parseDoc(
    "---\ntitle: Weapon Designer\nstatus: ready\nbuild: v0.4\ntags: [weapons, editor]\n---\n# Body\nhi"
  );
  t.eq("fm title", withFm.frontmatter.title, "Weapon Designer");
  t.eq("fm status", withFm.frontmatter.status, "ready");
  t.eq("fm tags", withFm.frontmatter.tags.join(","), "weapons,editor");
  t.ok("fm body stripped", withFm.body.startsWith("# Body"));

  const noFm = parseDoc("# Just A Doc\nno frontmatter here");
  t.eq("no-fm keys", Object.keys(noFm.frontmatter).length, 0);
  t.ok("no-fm body intact", noFm.body.startsWith("# Just A Doc"));

  // block-list frontmatter form
  const blockFm = parseDoc("---\ntags:\n  - a\n  - b\n---\nx");
  t.eq("block-list tags", blockFm.frontmatter.tags.join(","), "a,b");

  // A "---" that is a horizontal rule, not a frontmatter fence, must stay in body.
  const hrDoc = parseDoc("# Title\n\ntext\n\n---\n\nmore");
  t.eq("hr not eaten as fm", Object.keys(hrDoc.frontmatter).length, 0);

  // ---- parse: link extraction (all three forms) ----
  const links = extractLinks(
    "See [[Weapon-Designer]] and [the plan](LEVEL-GENERATION.md) and bare SOUND.md. " +
    "Ignore https://x.md and `CODE.md` in code."
  );
  t.ok("wiki link slug", links.includes("weapon-designer"));
  t.ok("md link slug", links.includes("level-generation"));
  t.ok("bare mention slug", links.includes("sound"));
  t.ok("http .md ignored", !links.includes("x"));
  t.ok("code-span .md ignored", !links.includes("code"));

  t.eq("slugify strips ext + lowers", slugify("SOUND.md"), "sound");
  t.eq("title from heading", docTitle({ id: "x", frontmatter: {}, body: "# Hello\n" }), "Hello");
  t.eq("title from fm wins", docTitle({ id: "x", frontmatter: { title: "FM" }, body: "# H" }), "FM");

  // ---- markdown rendering ----
  const md = renderMarkdown;
  t.ok("heading", md("## Hi").includes("<h2>Hi</h2>"));
  t.ok("bold", md("a **b** c").includes("<strong>b</strong>"));
  t.ok("italic", md("a *b* c").includes("<em>b</em>"));
  t.ok("inline code", md("use `x` now").includes("<code>x</code>"));
  t.ok("code fence", md("```\nx = 1\n```").includes("<pre"));
  t.ok("hr", md("a\n\n---\n\nb").includes("<hr>"));
  t.ok("ul", md("- one\n- two").includes("<ul>") && md("- one").includes("<li>"));
  t.ok("ol", md("1. one\n2. two").includes("<ol>"));
  t.ok("blockquote", md("> quoted").includes("<blockquote>"));
  t.ok("table", md("| A | B |\n|---|---|\n| 1 | 2 |").includes("<table"));
  t.ok("ext link new tab", md("[g](https://x.com)").includes('target="_blank"'));

  // HTML in prose is escaped (no injection)
  t.ok("escapes html", !md("<script>bad</script>").includes("<script>"));

  // inline code protects markup + digit-collision is impossible
  t.ok("code guards markup", md("`**not bold**`").includes("**not bold**"));
  t.ok("digits survive", md("we shipped 3 of 5 items").includes("3 of 5"));

  // internal doc link → hash href with data-slug, missing target flagged
  const known = new Set(["sound"]);
  const linked = md("see [[sound]] and [[ghost]]", { known });
  t.ok("known link not missing", /data-slug="sound"[^>]*>/.test(linked) && !/dz-missing[^>]*sound/.test(linked));
  t.ok("missing link flagged", linked.includes("dz-missing"));

  // ---- graph ----
  const docs = [
    { id: "a", links: ["b", "ghost"] },
    { id: "b", links: ["a"] },
    { id: "c", links: ["b"] },
  ];
  const g = buildGraph(docs);
  t.eq("edges to existing only", g.edges.length, 3); // a->b, b->a, c->b
  t.eq("backlinks of b", g.backlinks.get("b").sort().join(","), "a,c");
  t.eq("wanted has ghost", g.wanted.find((w) => w.slug === "ghost").from.join(","), "a");
  t.ok("no self edge", !g.edges.some((e) => e.from === e.to));
}
