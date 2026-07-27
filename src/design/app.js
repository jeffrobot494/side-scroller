// app.js — the design workbench page controller.
// Pure render helpers (HTML strings, testable headlessly) + a browser-only
// bootstrap guarded behind `typeof document`.

import { parseDoc, docTitle, slugify } from './parse.js';
import { renderMarkdown } from './markdown.js';
import { buildGraph, outgoing } from './graph.js';
import { editorHtml, wireEditor, HANDOFF_TEMPLATE } from './editor.js';

export const STATUSES = ['built', 'ready', 'plan', 'draft', 'reference'];

// Build a normalized doc record from a filename + raw markdown.
export function makeDoc(file, text) {
  const id = slugify(file);
  const parsed = parseDoc(text);
  const fm = parsed.frontmatter || {};
  return {
    id, file,
    raw: text,
    frontmatter: fm,
    body: parsed.body,
    links: parsed.links,
    title: docTitle({ id, frontmatter: fm, body: parsed.body }),
    status: STATUSES.includes(fm.status) ? fm.status : 'draft',
    build: fm.build || '',
    tags: Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []),
    summary: summarize(parsed.body),
  };
}

// First real sentence/line of prose, markdown stripped — for cards.
export function summarize(body) {
  const lines = body.split('\n');
  for (let raw of lines) {
    const line = raw.replace(/^\s*>\s?/, '').trim();
    if (!line || /^#{1,6}\s/.test(line) || /^[-*_]{3,}$/.test(line) || line.startsWith('```')) continue;
    const plain = line
      .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/[*_`]/g, '')
      .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    return plain.length > 180 ? plain.slice(0, 177) + '…' : plain;
  }
  return '';
}

// ---------- pure views (return HTML strings) ----------

function statusOrder(s) { return STATUSES.indexOf(s) < 0 ? 99 : STATUSES.indexOf(s); }

export function sidebarHtml(docs, current, filter = {}) {
  let list = docs.slice();
  if (filter.status) list = list.filter((d) => d.status === filter.status);
  if (filter.build) list = list.filter((d) => d.build === filter.build);
  if (filter.tag) list = list.filter((d) => d.tags.includes(filter.tag));

  const groups = {};
  for (const d of list) (groups[d.status] = groups[d.status] || []).push(d);

  const order = Object.keys(groups).sort((a, b) => statusOrder(a) - statusOrder(b));
  const sections = order.map((st) => {
    const items = groups[st]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((d) => {
        const active = d.id === current ? ' active' : '';
        return `<li><a class="${active}" href="#${d.id}"><span class="dz-dot ${d.status}"></span>${esc(d.title)}</a></li>`;
      }).join('');
    return `<div class="dz-group-label">${st} · ${groups[st].length}</div><ul class="dz-index">${items}</ul>`;
  }).join('');

  const builds = [...new Set(docs.map((d) => d.build).filter(Boolean))].sort();
  const buildOpts = ['<option value="">All builds</option>']
    .concat(builds.map((b) => `<option value="${esc(b)}"${filter.build === b ? ' selected' : ''}>${esc(b)}</option>`))
    .join('');
  const statusOpts = ['<option value="">All statuses</option>']
    .concat(STATUSES.map((s) => `<option value="${s}"${filter.status === s ? ' selected' : ''}>${s}</option>`))
    .join('');

  return `
    <div class="dz-brand">Design Workbench<small>${docs.length} docs · lens over docs/*.md</small></div>
    <div class="dz-nav">
      <a href="#!ready">Ready queue</a>
      <a href="#!graph">Graph</a>
      <a href="#!new" class="dz-newlink">+ New</a>
    </div>
    <div class="dz-filter"><select class="dz-fstatus">${statusOpts}</select></div>
    ${builds.length ? `<div class="dz-filter"><select class="dz-fbuild">${buildOpts}</select></div>` : ''}
    ${sections || '<div class="dz-hint" style="margin:12px 6px">No docs match.</div>'}
  `;
}

export function docViewHtml(doc, docs, graph) {
  const known = new Set(docs.map((d) => d.id));
  const titleOf = (id) => (docs.find((d) => d.id === id) || {}).title || id;

  const badges = [`<span class="dz-badge ${doc.status}">${doc.status}</span>`]
    .concat(doc.build ? [`<span class="dz-badge">${esc(doc.build)}</span>`] : [])
    .concat(doc.tags.map((t) => `<a class="dz-tag" href="#!tag/${encodeURIComponent(t)}">${esc(t)}</a>`))
    .join('');

  const rendered = renderMarkdown(doc.body, { known });

  const back = (graph.backlinks.get(doc.id) || []);
  const out = outgoing(graph, doc.id).filter((id) => id !== doc.id);
  const chip = (id) => `<a href="#${id}">${esc(titleOf(id))}</a>`;
  const relBlock = (label, ids) =>
    `<h4>${label}</h4><ul>${ids.length ? ids.map(chip).join('') : '<li class="dz-none">none</li>'}</ul>`;

  return `
    <div class="dz-toolbar">
      <button class="dz-btn" data-action="edit" data-slug="${doc.id}">Edit</button>
    </div>
    <div class="dz-badges">${badges}</div>
    <article class="dz-doc">${rendered}</article>
    <div class="dz-rel">
      ${relBlock('Links to', out)}
      ${relBlock('Referenced by', back)}
    </div>
  `;
}

export function readyQueueHtml(docs) {
  const ready = docs.filter((d) => d.status === 'ready');
  if (!ready.length) {
    return `<h1>Ready queue</h1><div class="dz-empty">Nothing is marked <code>status: ready</code> yet.<br>
      Set a doc's frontmatter <code>status: ready</code> to queue it for an agent.</div>`;
  }
  const cards = ready.map((d) => `
    <div class="dz-card">
      <h3><a href="#${d.id}">${esc(d.title)}</a></h3>
      <p>${esc(d.summary)}</p>
    </div>`).join('');
  return `<h1>Ready queue <span class="dz-badge ready">${ready.length}</span></h1>
    <p class="dz-hint">Specs flagged ready to hand to a coding agent.</p>
    <div class="dz-cards">${cards}</div>`;
}

export function graphViewHtml(docs, graph) {
  const n = docs.length;
  const W = 820, H = 560, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 70;
  const pos = {};
  docs.forEach((d, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
    pos[d.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  const lines = graph.edges.map((e) => {
    const a = pos[e.from], b = pos[e.to];
    return a && b ? `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>` : '';
  }).join('');
  const nodes = docs.map((d) => {
    const p = pos[d.id];
    const deg = (graph.backlinks.get(d.id) || []).length;
    const r = 6 + Math.min(10, deg * 2);
    const anchor = p.x < cx ? 'end' : 'start';
    const dx = p.x < cx ? -(r + 4) : (r + 4);
    return `<a href="#${d.id}"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}"/>` +
      `<text x="${(p.x + dx).toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="${anchor}">${esc(d.title)}</text></a>`;
  }).join('');
  return `<h1>Graph</h1><p class="dz-hint">Node size = how many docs reference it. Click a node to open.</p>
    <svg class="dz-graph" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${lines}${nodes}</svg>`;
}

export function tagViewHtml(tag, docs) {
  const hits = docs.filter((d) => d.tags.includes(tag));
  const cards = hits.map((d) => `<div class="dz-card"><h3><a href="#${d.id}">${esc(d.title)}</a></h3><p>${esc(d.summary)}</p></div>`).join('');
  return `<h1>Tag: ${esc(tag)} <span class="dz-badge">${hits.length}</span></h1><div class="dz-cards">${cards || '<p class="dz-hint">No docs.</p>'}</div>`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- browser bootstrap ----------
// Called explicitly from design.html so importing this module under node (the
// tests) never touches the DOM or the network.

export function main() { return bootstrap(); }

async function bootstrap() {
  const shell = document.getElementById('dz-app');
  shell.innerHTML = `<aside class="dz-side" id="dz-side"></aside><main class="dz-main"><div class="dz-main-inner" id="dz-view"></div></main>`;
  const side = document.getElementById('dz-side');
  const view = document.getElementById('dz-view');

  let docs = [];
  let graph = { edges: [], backlinks: new Map(), wanted: [] };
  let filter = {};

  async function reload() {
    const files = await discover();
    const loaded = await Promise.all(files.map(async (f) => {
      try { const r = await fetch('docs/' + f); return r.ok ? makeDoc(f, await r.text()) : null; }
      catch { return null; }
    }));
    docs = loaded.filter(Boolean).sort((a, b) => a.title.localeCompare(b.title));
    graph = buildGraph(docs);
  }

  function render() {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    const current = hash && !hash.startsWith('!') ? hash : '';
    side.innerHTML = sidebarHtml(docs, current, filter);
    setActiveNav(hash);

    if (hash === '!ready') { view.innerHTML = readyQueueHtml(docs); }
    else if (hash === '!graph') { view.innerHTML = graphViewHtml(docs, graph); }
    else if (hash === '!new') { view.innerHTML = editorHtml(null, docs); wireEditor(view, null, docs, onSaved); }
    else if (hash.startsWith('!edit/')) {
      const d = docs.find((x) => x.id === hash.slice(6));
      view.innerHTML = editorHtml(d, docs); wireEditor(view, d, docs, onSaved);
    }
    else if (hash.startsWith('!tag/')) { view.innerHTML = tagViewHtml(hash.slice(5), docs); }
    else if (current) {
      const d = docs.find((x) => x.id === current);
      view.innerHTML = d ? docViewHtml(d, docs, graph)
        : `<div class="dz-empty">No doc <code>${esc(current)}</code>.</div>`;
    } else {
      view.innerHTML = readyQueueHtml(docs); // home = the backlog
    }
    view.parentElement.scrollTop = 0;
  }

  function setActiveNav(hash) {
    side.querySelectorAll('.dz-nav a').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + hash);
    });
  }

  async function onSaved(newFile) {
    await reload();
    location.hash = '#' + slugify(newFile);
    render();
  }

  // filter changes (event delegation on the sidebar)
  side.addEventListener('change', (e) => {
    if (e.target.classList.contains('dz-fstatus')) filter = { ...filter, status: e.target.value || undefined };
    if (e.target.classList.contains('dz-fbuild')) filter = { ...filter, build: e.target.value || undefined };
    render();
  });
  // edit button
  view.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="edit"]');
    if (btn) { location.hash = '#!edit/' + btn.dataset.slug; }
  });

  window.addEventListener('hashchange', render);
  await reload();
  render();
}

async function discover() {
  // Primary: the directory listing python's http.server emits for docs/.
  try {
    const r = await fetch('docs/');
    if (r.ok) {
      const html = await r.text();
      const files = [...html.matchAll(/href="([^"]+\.md)"/gi)]
        .map((m) => decodeURIComponent(m[1].split('/').pop()));
      const uniq = [...new Set(files)].filter((f) => f && f.toLowerCase().endsWith('.md'));
      if (uniq.length) return uniq;
    }
  } catch { /* fall through */ }
  // Fallback: an explicit manifest.
  try {
    const r = await fetch('docs/manifest.json');
    if (r.ok) { const j = await r.json(); return Array.isArray(j) ? j : (j.files || []); }
  } catch { /* none */ }
  return [];
}

export { HANDOFF_TEMPLATE };
