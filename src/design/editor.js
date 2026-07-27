// editor.js — Slice 3: author/edit a spec in-app and write it back to docs/.
//
// Write-back has two paths, feature-detected:
//   1. File System Access API — "Connect docs folder" grants a directory
//      handle; Save writes straight into docs/<file>.md (http.server then
//      serves it on reload).
//   2. Fallback (any browser) — Save downloads the .md and copies it to the
//      clipboard, matching the repo's "Copy JSON → paste into source" habit;
//      the author drops it into docs/ manually.
//
// editorHtml(doc, docs) -> HTML string (doc null = new).
// wireEditor(container, doc, docs, onSaved) -> attaches handlers.

export const HANDOFF_TEMPLATE = `## Handoff brief

**Goal:** <one sentence — what shipping this achieves>

**Acceptance criteria**
- [ ] <observable behaviour>
- [ ] <observable behaviour>

**Files likely touched**
- \`src/...\`

**Out of scope**
- <what NOT to do here>

**Notes / open questions**
-
`;

function newDocTemplate() {
  return `---
title: New Feature
status: draft
tags: []
---

# New Feature

<one-paragraph description of the feature and why it matters>

${HANDOFF_TEMPLATE}`;
}

let dirHandle = null; // in-memory docs/ directory handle once connected

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function editorHtml(doc, docs) {
  const isNew = !doc;
  const content = isNew ? newDocTemplate() : (doc.raw != null ? doc.raw : rebuild(doc));
  const fsHint = (typeof window !== 'undefined' && window.showDirectoryPicker)
    ? `<button class="dz-btn dz-connect" type="button">${dirHandle ? '✓ docs/ connected' : 'Connect docs folder'}</button>`
    : '';
  return `
    <div class="dz-toolbar">
      ${fsHint}
      <button class="dz-btn dz-insert" type="button">Insert handoff template</button>
      <button class="dz-btn primary dz-save" type="button">${isNew ? 'Create' : 'Save'}</button>
    </div>
    <h1>${isNew ? 'New spec' : 'Editing: ' + esc(doc.title)}</h1>
    <div class="dz-edit">
      ${isNew
        ? `<div><label>Filename (in docs/, .md added if omitted)</label>
             <input class="dz-file" placeholder="MY-FEATURE.md" value=""></div>`
        : `<input type="hidden" class="dz-file" value="${esc(doc.file)}">`}
      <div><label>Markdown (frontmatter + body — this is the file)</label>
        <textarea class="dz-src" spellcheck="false">${esc(content)}</textarea></div>
      <p class="dz-hint dz-status"></p>
    </div>`;
}

// Reconstruct file text from a parsed doc when raw is unavailable.
function rebuild(doc) {
  const fm = doc.frontmatter || {};
  const keys = Object.keys(fm);
  if (!keys.length) return doc.body;
  const lines = keys.map((k) => {
    const v = fm[k];
    return Array.isArray(v) ? `${k}: [${v.join(', ')}]` : `${k}: ${v}`;
  });
  return `---\n${lines.join('\n')}\n---\n\n${doc.body}`;
}

export function wireEditor(container, doc, docs, onSaved) {
  const src = container.querySelector('.dz-src');
  const fileInput = container.querySelector('.dz-file');
  const statusEl = container.querySelector('.dz-status');
  const say = (msg) => { if (statusEl) statusEl.textContent = msg; };

  const insertBtn = container.querySelector('.dz-insert');
  if (insertBtn) insertBtn.addEventListener('click', () => {
    const pos = src.selectionStart ?? src.value.length;
    src.value = src.value.slice(0, pos) + '\n' + HANDOFF_TEMPLATE + '\n' + src.value.slice(pos);
    src.focus();
  });

  const connectBtn = container.querySelector('.dz-connect');
  if (connectBtn) connectBtn.addEventListener('click', async () => {
    try {
      dirHandle = await window.showDirectoryPicker();
      connectBtn.textContent = '✓ docs/ connected';
      say('Connected — Save now writes straight into the chosen folder.');
    } catch { say('Folder connection cancelled.'); }
  });

  const saveBtn = container.querySelector('.dz-save');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    let file = (fileInput.value || '').trim();
    if (!file) { say('Give the file a name first.'); return; }
    if (!/\.md$/i.test(file)) file += '.md';
    const content = src.value;

    if (dirHandle) {
      try {
        const fh = await dirHandle.getFileHandle(file, { create: true });
        const w = await fh.createWritable();
        await w.write(content);
        await w.close();
        say('Saved to docs/' + file + '.');
        if (onSaved) onSaved(file);
        return;
      } catch (err) {
        say('Direct write failed (' + err.message + ') — falling back to download.');
      }
    }
    download(file, content);
    copy(content);
    say('Downloaded ' + file + ' and copied to clipboard — move it into docs/, then reload.');
  });
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function copy(text) {
  try { navigator.clipboard && navigator.clipboard.writeText(text); } catch { /* ignore */ }
}
