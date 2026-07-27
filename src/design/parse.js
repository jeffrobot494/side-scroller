// parse.js — pure doc parsing: frontmatter + body + outgoing link slugs.
// No DOM. Used by app.js (browser) and the node tests.

// A doc's canonical id/slug is its filename without ".md", lowercased.
export function slugify(name) {
  return String(name).trim().replace(/\.md$/i, '').toLowerCase();
}

// Minimal YAML: `key: scalar`, `key: [a, b]` inline arrays, and block lists
//   key:
//     - a
//     - b
// Scalars are strings (quotes stripped). Enough for our frontmatter; not a
// general YAML parser.
function parseFrontmatter(lines) {
  const fm = {};
  let key = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && key) {
      (fm[key] = Array.isArray(fm[key]) ? fm[key] : []).push(unquote(listItem[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const val = kv[2].trim();
    if (val === '') {
      fm[key] = []; // expect a block list to follow
    } else if (val.startsWith('[') && val.endsWith(']')) {
      fm[key] = val.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
    } else {
      fm[key] = unquote(val);
    }
  }
  return fm;
}

function unquote(s) {
  const t = String(s).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

// Strip fenced code blocks so link-scanning ignores code samples.
function stripFences(body) {
  return body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

// Collect outgoing link slugs from all three forms. Returns a de-duped array.
export function extractLinks(body) {
  const text = stripFences(body);
  const out = new Set();
  // [[wiki-link]] — may contain a display alias: [[slug|Text]]
  for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    out.add(slugify(m[1].split('|')[0]));
  }
  // [text](FILE.md) — local markdown links (ignore http/anchors)
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = m[1].trim();
    if (/^https?:/i.test(href) || href.startsWith('#')) continue;
    if (/\.md(#.*)?$/i.test(href)) out.add(slugify(basename(href)));
  }
  // bare NAME.md mentions in prose — strip URLs and md-link hrefs first so a
  // "https://x.md" or an already-handled [t](FILE.md) can't leak a false slug.
  const prose = text.replace(/https?:\/\/\S+/gi, '').replace(/\]\([^)]*\)/g, '');
  for (const m of prose.matchAll(/\b([A-Za-z0-9_-]+)\.md\b/g)) {
    out.add(slugify(m[1]));
  }
  return [...out];
}

function basename(path) {
  return path.split('#')[0].split('/').pop();
}

// parseDoc(text) -> { frontmatter, body, links }
export function parseDoc(text) {
  const src = String(text).replace(/\r\n/g, '\n');
  let body = src;
  let frontmatter = {};
  if (src.startsWith('---\n')) {
    const end = src.indexOf('\n---', 4);
    if (end !== -1) {
      const fmLines = src.slice(4, end).split('\n');
      frontmatter = parseFrontmatter(fmLines);
      body = src.slice(end + 4).replace(/^\n/, '');
    }
  }
  return { frontmatter, body, links: extractLinks(body) };
}

// Pull a display title: frontmatter.title, else first "# heading", else slug.
export function docTitle(doc) {
  if (doc.frontmatter && doc.frontmatter.title) return doc.frontmatter.title;
  const h = doc.body.match(/^#\s+(.+)$/m);
  if (h) return h[1].trim();
  return doc.id;
}
