// markdown.js — a small, pure Markdown-subset renderer. No DOM, no deps.
// Supports: headings, paragraphs, bold/italic/inline-code, fenced code,
// unordered/ordered lists, blockquotes, horizontal rules, GitHub pipe tables,
// links, images, and [[wiki-links]]. Text is HTML-escaped before formatting.
//
// renderMarkdown(body, opts) -> HTML string.
//   opts.onLink(slug) -> href   (default "#" + slug)  for internal doc links
//   opts.known        -> Set of existing slugs; missing targets get .dz-missing

import { slugify } from './parse.js';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMarkdown(body, opts = {}) {
  const onLink = opts.onLink || ((slug) => '#' + slug);
  const known = opts.known || null;
  const inline = (t) => renderInline(t, onLink, known);

  const lines = String(body).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^\s*```(.*)$/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push('<pre class="dz-code"><code>' + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }

    if (!line.trim()) { i++; continue; }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const n = h[1].length;
      out.push(`<h${n}>${inline(h[2].trim())}</h${n}>`);
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + renderMarkdown(buf.join('\n'), opts) + '</blockquote>');
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push(renderTable(header, rows, inline));
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const [html, next] = renderList(lines, i, inline);
      out.push(html);
      i = next;
      continue;
    }

    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) {
      buf.push(lines[i]);
      i++;
    }
    out.push('<p>' + inline(buf.join('\n')) + '</p>');
  }

  return out.join('\n');
}

function isBlockStart(line, next) {
  return /^\s*```/.test(line)
    || /^(#{1,6})\s+/.test(line)
    || /^\s*>/.test(line)
    || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)
    || /^\s*([-*+]|\d+\.)\s+/.test(line)
    || (line.includes('|') && isTableSep(next || ''));
}

function isTableSep(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line || '');
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function renderTable(header, rows, inline) {
  const th = header.map((c) => `<th>${inline(c)}</th>`).join('');
  const body = rows.map((r) =>
    '<tr>' + header.map((_, j) => `<td>${inline(r[j] || '')}</td>`).join('') + '</tr>'
  ).join('');
  return `<table class="dz-table"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderList(lines, start, inline) {
  const baseIndent = lines[start].match(/^\s*/)[0].length;
  const ordered = /^\s*\d+\.\s+/.test(lines[start]);
  const tag = ordered ? 'ol' : 'ul';
  const items = [];
  let i = start;
  let cur = null;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      const cont = lines[i + 1];
      if (cont && /^\s+\S/.test(cont) && cont.match(/^\s*/)[0].length > baseIndent) { i++; continue; }
      break;
    }
    const indent = line.match(/^\s*/)[0].length;
    const m = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
    if (m && indent <= baseIndent + 1) {
      if (cur) items.push(cur);
      cur = { text: m[2], children: [] };
      i++;
    } else if (m && indent > baseIndent + 1) {
      const [childHtml, next] = renderList(lines, i, inline);
      if (cur) cur.children.push(childHtml);
      i = next;
    } else if (indent > baseIndent) {
      if (cur) cur.text += '\n' + line.trim();
      i++;
    } else {
      break;
    }
  }
  if (cur) items.push(cur);

  const html = items.map((it) => `<li>${inline(it.text)}${it.children.join('')}</li>`).join('');
  return [`<${tag}>${html}</${tag}>`, i];
}

// ---- inline ----

const SENT = '\u0000';

function renderInline(text, onLink, known) {
  let s = esc(text);

  // protect inline code spans behind an unambiguous sentinel token
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push('<code>' + c + '</code>');
    return SENT + (codes.length - 1) + SENT;
  });

  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) =>
    `<img class="dz-img" alt="${alt}" src="${src.trim()}">`);

  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) =>
    docAnchor(slugify(target), alias || target, onLink, known, 'dz-wiki'));

  s = s.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_, label, href) => {
    href = href.trim();
    if (/^https?:/i.test(href)) {
      return `<a class="dz-ext" href="${href}" target="_blank" rel="noopener">${label}</a>`;
    }
    if (/\.md(#.*)?$/i.test(href)) {
      return docAnchor(slugify(href.split('#')[0].split('/').pop()), label, onLink, known, 'dz-doclink');
    }
    return `<a href="${href}">${label}</a>`;
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_\w])_([^_\s][^_]*?)_/g, '$1<em>$2</em>');

  s = s.replace(new RegExp(SENT + '(\\d+)' + SENT, 'g'), (_, n) => codes[Number(n)]);
  return s;
}

function docAnchor(slug, label, onLink, known, cls) {
  const missing = known && !known.has(slug) ? ' dz-missing' : '';
  return `<a class="${cls}${missing}" href="${onLink(slug)}" data-slug="${slug}">${label}</a>`;
}
