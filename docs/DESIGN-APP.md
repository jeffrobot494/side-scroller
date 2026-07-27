---
title: Design Workbench
status: built
tags: [tools, design]
---

# DESIGN-APP.md — the design workbench

> **Status:** Slices 1–3 built. Slices 4–5 planned.
> **Last updated:** 2026-07-26
> **What it is:** a browser tool for authoring, linking, and browsing this
> game's design — a *lens* over `docs/*.md`, not a second database.

---

## Purpose

The design constantly changes and grows, so this app is **not an archive**. Its
job is to keep a queue of well-specified work ready for coding agents even when
the author is away from the computer — you design features here, mark them
ready, and an agent picks them up. The app is desktop-first; the "away"
consumer is the agent, not a phone.

Source of truth stays in the repo: every doc is a plain `docs/*.md` file. The
app reads them over `fetch`, and (Slice 3) writes them back. Nothing lives in a
private database — a "ready" feature is *already a markdown file an agent can be
pointed at*, which is the whole point. This matches the repo's standing rule:
"make it permanent = write it into the source."

## Running it

Static page, same as the game and editor — no build step, native ESM.

    python3 -m http.server 8000     # then open http://localhost:8000/design.html

Discovery uses the directory listing that `http.server` emits for `docs/`
(parsed for `*.md`), falling back to `docs/manifest.json` if listing is off.

## Conventions this app introduces

Both cost nothing when absent — docs without them still render and browse.

1. **`[[wiki-links]]`** between docs — the same syntax the memory system uses.
   The slug is the filename without `.md`, case-insensitive
   (`[[weapon-designer]]` → `WEAPON-DESIGNER.md`). The app also treats ordinary
   markdown links to `*.md` and bare `NAME.md` filename mentions as edges, so
   the graph is populated from existing prose on day one; adopt `[[ ]]`
   gradually. Every target computes **backlinks** ("referenced by…").

2. **Frontmatter** (optional YAML block at the very top):

   ```
   ---
   title: Weapon Designer          # display name (defaults to first # heading)
   status: built | plan | draft | ready
   build: v0.4                     # milestone this targets
   tags: [weapons, editor]
   ---
   ```

   `status` drives badges, the build filter, and the **Ready queue**. A "build"
   is a *filter/view* over `build:`, never a frozen snapshot — git already is
   the version history. `status: ready` is the agent backlog: everything spec'd
   well enough to hand off.

## Architecture

Standalone page; NOT an editor tool (no `editor.js` registration).

- `design.html` — entry point (`<script type="module" src="src/design/app.js">`).
- `src/design/parse.js` — `parseDoc(text)` → `{ frontmatter, body, links }`.
  Pure, no DOM. Splits frontmatter, extracts all three link forms to slugs.
- `src/design/markdown.js` — `renderMarkdown(body, {onLink})` → HTML string.
  Pure subset renderer (headings, para, bold/italic/code, fences, ul/ol,
  blockquote, hr, GH tables, links, images, `[[wiki]]`). HTML-escapes text.
- `src/design/graph.js` — `buildGraph(docs)` → nodes + edges + backlink index.
  Pure. Resolves link slugs to doc ids, drops dangling edges into a "wanted"
  list (a `[[link]]` with no target yet = a doc worth writing, not an error).
- `src/design/editor.js` (Slice 3) — in-app spec editor + write-back
  (File System Access API when available; Copy-markdown / download fallback,
  matching the repo's "Copy JSON → paste into source" pattern) + the
  **handoff-brief template** (acceptance criteria / files likely touched /
  out-of-scope) so a `ready` doc is a complete agent brief.
- `src/design/app.js` — loads docs, owns routing (`#slug`), renders the
  sidebar index, the doc view with backlinks panel, the graph view, the build
  filter, and the Ready queue. One synchronous render at mount.
- `src/design/design.css` — styles (`dz-*` prefix), light/dark aware.

The pure modules (`parse`, `markdown`, `graph`) are covered by node tests
(`test/design-*.test.mjs`) since there is no browser here; the UI is verified by
a headless mount + a serve-check, and visuals are flagged for the author to
eyeball.

## Slice roadmap

- **Slice 1 — read/link/browse (built).** Load `docs/*.md`, render markdown,
  sidebar index, all three link forms clickable, backlinks, graph view.
- **Slice 2 — structure (built).** Frontmatter → status badges, build filter,
  Ready queue, tag chips.
- **Slice 3 — authoring + write-back (built).** Create/edit specs in-app with
  the handoff template; save via FS Access API or copy/download.
- **Slice 4 — mockups/artifacts (planned).** Attach generated HTML mockups and
  fake game-UI screenshots to a feature.
- **Slice 5 — agent tools (planned).** Hand a `ready` doc to a coding agent
  from inside the app; track in-progress → landed.

## Non-goals

- Not a database or a sync layer. Files are the truth; the app is a lens.
- Not a git replacement — versions/builds are filters, not snapshots.
- No build step, no dependencies (consistent with the rest of the repo).
