// Player2 Lab — the page. The only Lab module that touches the DOM or the
// network (through the Player2 client). (tech/player2-lab.md)
//
// Model choice happens in Player2's own interface, so the Lab compares RUNS:
// every run is kept for the session, stamped with this modality's model label,
// and named by the model-name rule in runs.js.

import { Player2Client } from "../player2/client.js";
import { GAME_CLIENT_ID } from "../player2/config.js";
import { MODALITIES, MODALITY_BY_ID, ROLES, LAB, defaultValues, flatFields } from "./modalities.js";
import { createRunStore, createJoulesLedger, ident, diffKeys, shortenForRaw, formatMs } from "./runs.js";

const client = new Player2Client({ gameClientId: GAME_CLIENT_ID });
const store = createRunStore();
const ledger = createJoulesLedger();

const state = {
  cur: MODALITIES[0].id,
  view: "list",
  conn: "connecting", // connecting | on | off
  connError: "",
  balance: null,
  tier: null,
  labels: {}, // modality id -> model label
  values: Object.fromEntries(MODALITIES.map((m) => [m.id, defaultValues(m)])),
  formError: "",
  picked: new Set(),
  open: new Set(),
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const mod = () => MODALITY_BY_ID[state.cur];

// ── connection ─────────────────────────────────────────────────────────────

async function connect() {
  state.conn = "connecting";
  state.connError = "";
  bar();
  try {
    await client.authenticate();
    state.conn = "on";
    await refreshBalance();
  } catch (e) {
    state.conn = "off";
    state.connError = e.message;
  }
  bar();
}

async function refreshBalance() {
  const j = await client.getJoules();
  state.balance = j?.joules ?? null;
  state.tier = j?.patron_tier ?? null;
  bar();
  return state.balance;
}

// ── running ────────────────────────────────────────────────────────────────

async function execute(m, values) {
  let request;
  try {
    request = m.request(values);
  } catch (e) {
    state.formError = e.message;
    form();
    return;
  }
  state.formError = "";
  const run = store.add({
    mod: m.id,
    values: structuredClone(values),
    summary: m.summary(values),
    label: (state.labels[m.id] || "").trim(),
    request,
    startedAt: performance.now(),
  });
  ledger.begin(run.id);
  client.getJoules().then((j) => ledger.setStart(run.id, j?.joules), () => ledger.setStart(run.id, null));

  try {
    const response = await send(request, run);
    store.update(run.id, {
      status: "done",
      response,
      output: m.output(response, values),
      reported: m.reported?.(response) || null,
      ms: performance.now() - run.startedAt,
    });
  } catch (e) {
    store.update(run.id, { status: "failed", error: e.message || String(e), ms: performance.now() - run.startedAt });
  }
  let after = null;
  try {
    after = await refreshBalance();
  } catch {
    /* balance unavailable: joules stays "—" */
  }
  store.update(run.id, { joules: ledger.end(run.id, after) });
}

async function send(req, run) {
  if (req.kind === "chat-stream") {
    const { messages, stream, ...opts } = req.body;
    let partial = "";
    const { content, model } = await client.chatStreamFull(messages, (d) => {
      partial += d;
      store.update(run.id, { partial });
    }, opts);
    // Assembled so the chat row's output/reported read it like a whole reply.
    return { model, choices: [{ message: { role: "assistant", content } }], _assembledFromStream: true };
  }
  return client.call(req.path, { method: req.method, body: req.body });
}

// ── top bar + rail ─────────────────────────────────────────────────────────

function bar() {
  const conn = {
    connecting: `<i class="dot wait"></i> Connecting to the Player2 app…`,
    on: `<i class="dot"></i> Connected via Player2 app`,
    off: `<i class="dot off"></i> Not connected — is the Player2 app running? <button class="ghost connect" data-connect>Retry</button>`,
  }[state.conn];
  const bal = state.balance == null ? "—" : `${Number(state.balance).toLocaleString()} J`;
  const running = store.running().length;
  $("bar").innerHTML = `<h1>Player2 Lab</h1>
    <span class="stat" title="${esc(state.connError)}">${conn}</span>
    <span class="stat">Balance <b>${bal}</b>${state.tier ? ` · ${esc(state.tier)}` : ""}</span>
    <span class="spacer"></span>
    ${running ? `<span class="pill busy">${running} running</span>` : ""}`;
}

function rail() {
  let html = "";
  let last = "";
  for (const m of MODALITIES) {
    if (m.group !== last) {
      html += `<div class="lbl">${esc(m.group)}</div>`;
      last = m.group;
    }
    const runs = store.list(m.id);
    const busy = runs.some((r) => r.status === "running");
    html += `<button class="mod ${m.id === state.cur ? "on" : ""}" data-m="${m.id}">${esc(m.label)}
      <span class="n ${busy ? "busy" : ""}">${busy ? "● " : ""}${runs.length || ""}</span></button>`;
  }
  $("rail").innerHTML = html;
}

// ── form ───────────────────────────────────────────────────────────────────

function field(f, v) {
  if (f.row) return `<div class="field row">${f.row.map((x) => field(x, v)).join("")}</div>`;
  const L = `<span>${esc(f.label)}</span>`;
  const val = v[f.k];
  switch (f.t) {
    case "textarea":
      return `<label class="field">${L}<textarea data-k="${f.k}" class="${f.mono ? "mono" : ""}" ${f.rows ? `rows="${f.rows}"` : ""}>${esc(val)}</textarea></label>`;
    case "text":
      return `<label class="field">${L}<input type="text" data-k="${f.k}" value="${esc(val)}"></label>`;
    case "number":
      return `<label class="field">${L}<input type="number" data-k="${f.k}" value="${esc(val)}"></label>`;
    case "select":
      return `<label class="field">${L}<select data-k="${f.k}">${f.opts
        .map((o) => `<option ${String(o) === String(val) ? "selected" : ""}>${esc(o)}</option>`)
        .join("")}</select></label>`;
    case "range":
      return `<label class="field">${L}<div class="range"><input type="range" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${esc(val)}"><span class="v">${esc(val)}</span></div></label>`;
    case "check":
      return `<label class="field chk"><input type="checkbox" data-k="${f.k}" ${val ? "checked" : ""}> ${esc(f.label)}</label>`;
    case "turns":
      return `<div class="field">${L}${(val || [])
        .map(
          (m, i) => `<div class="turn">
        <select data-turn="${i}" data-part="role">${ROLES.map((r) => `<option ${r === m.role ? "selected" : ""}>${r}</option>`).join("")}</select>
        <button class="x" title="Remove turn" data-turn-x="${i}">×</button>
        <textarea data-turn="${i}" data-part="content" placeholder="${m.role} message">${esc(m.content)}</textarea></div>`,
        )
        .join("")}
        <button class="ghost" data-turn-add>+ Add turn</button></div>`;
  }
  return "";
}

function form() {
  const m = mod();
  const v = state.values[m.id];
  $("form").innerHTML = `<h2>${esc(m.label)}</h2>${m.fields.map((f) => field(f, v)).join("")}
    <label class="field"><span>Model label (optional) — what you have selected in Player2 for ${esc(m.label)}. Stamped on every run until you change it.</span>
      <input type="text" data-label placeholder="e.g. Seedream" value="${esc(state.labels[m.id] || "")}"></label>
    <div class="note" style="margin:-6px 0 12px">${esc(m.reports || `The platform doesn't report a model for ${m.label}. Without a label, runs show “(not reported)”.`)}</div>
    <button class="run" data-run ${state.conn === "on" ? "" : "disabled"}>Run</button>
    ${state.formError ? `<div class="form-err">${esc(state.formError)}</div>` : ""}
    <div class="note">Runs use whatever model your Player2 account has selected. Change it there, update the label, run again.</div>`;
}

// ── run cards ──────────────────────────────────────────────────────────────

function outputHtml(r) {
  if (r.status === "failed") return `<div class="err">${esc(r.error)}</div>`;
  if (r.status === "running") {
    if (r.partial) return `<div class="out-text caret">${esc(r.partial)}</div>`;
    return `<div class="note" style="margin:0">Running…</div>`;
  }
  const o = r.output || {};
  switch (o.type) {
    case "text":
      return `<div class="out-text">${esc(o.text) || `<span class="note">(empty reply)</span>`}</div>${
        o.toolCalls ? `<div class="tool-calls">tool_calls ${esc(JSON.stringify(o.toolCalls, null, 2))}</div>` : ""
      }`;
    case "vectors":
      return o.vectors
        .map((x) => `<div class="vec"><b>${x.length}</b> dims · “${esc(x.text)}” · [${x.head.map((n) => Number(n).toFixed(4)).join(", ")}${x.length > x.head.length ? ", …" : ""}]</div>`)
        .join("");
  }
  return "";
}

function metaHtml(r) {
  if (r.status === "running") return `<span class="meta" style="color:var(--warn)" data-elapsed="${r.id}">running · ${formatMs(performance.now() - r.startedAt)}</span>`;
  const j = r.joules == null ? "—" : `${r.joules} J`;
  return `<span class="meta ${r.status === "failed" ? "err" : ""}">${r.status === "failed" ? "failed · " : ""}${formatMs(r.ms)} · ${j}</span>`;
}

function rawHtml(r) {
  const req = `${r.request.method} ${r.request.path}\n${JSON.stringify(shortenForRaw(r.request.body, LAB.rawKeep), null, 2)}`;
  let res;
  if (r.status === "running") res = "(waiting)";
  else if (r.status === "failed") res = r.error;
  else {
    const body = { ...r.response };
    delete body._assembledFromStream;
    res = `${r.response?._assembledFromStream ? "(assembled from the stream)\n" : ""}${JSON.stringify(shortenForRaw(body, LAB.rawKeep), null, 2)}`;
  }
  return `<div class="raw"><b>request</b>  ${esc(req)}
<b>response</b> ${r.ms != null ? `${Math.round(r.ms)} ms` : ""}
${esc(res)}${r.label ? `\n<b>your label</b> ${esc(r.label)}` : ""}${r.reported ? `\n<b>reported</b> ${esc(r.reported)}` : ""}</div>`;
}

function cardHtml(r, compare, diff) {
  const m = MODALITY_BY_ID[r.mod];
  const id = ident(r);
  const inputs = Object.entries(r.summary || {})
    .map(([k, s]) => `<span class="${diff.has(k) ? "d" : ""}">${esc(s)}</span>`)
    .join("");
  const done = r.status === "done";
  const foot = compare
    ? ""
    : `<div class="card-foot">
      <label class="chk" style="margin-right:auto"><input type="checkbox" data-pick="${r.id}" ${state.picked.has(r.id) ? "checked" : ""}> Compare</label>
      <button class="ghost" data-open="${r.id}">${state.open.has(r.id) ? "Hide raw" : "Raw"}</button>
      <button class="ghost" data-rerun="${r.id}" ${state.conn === "on" ? "" : "disabled"}>Rerun</button>
      ${m.continueFrom && done ? `<button class="ghost" data-continue="${r.id}">Continue</button>` : ""}
    </div>`;
  return `<div class="card ${state.picked.has(r.id) && !compare ? "picked" : ""} ${state.open.has(r.id) ? "open" : ""}" data-card="${r.id}">
    <div class="card-head"><span class="id">#${r.id}</span><span class="model ${id.cls} ${diff.has("model") ? "differs" : ""}">${esc(id.text)}</span>${
      id.source ? `<span class="src ${id.cls === "lab" ? "lab" : ""}">${esc(id.source)}</span>` : ""
    }${r.reported && r.label ? `<span class="also">· <i>${esc(r.label)}</i></span>` : ""}<span class="spacer"></span>${metaHtml(r)}</div>
    <div class="card-body"><div class="inputs">${inputs}</div>${outputHtml(r)}</div>${foot}${rawHtml(r)}</div>`;
}

// Card key: re-render a card only when something it shows has changed, so a
// playing audio/video element is not torn down by an unrelated update.
const cardKey = (r) => `${r.ver}|${state.picked.has(r.id)}|${state.open.has(r.id)}|${state.conn}`;

function runsView() {
  const m = mod();
  const all = store.list(m.id);
  const sel = all.filter((r) => state.picked.has(r.id));
  if (sel.length < 2 && state.view === "compare") state.view = "list";
  const head = `<div class="runs-head"><h2>Runs</h2>
    <div class="seg"><button data-v="list" class="${state.view === "list" ? "on" : ""}">List</button>
    <button data-v="compare" class="${state.view === "compare" ? "on" : ""}" ${sel.length >= 2 ? "" : "disabled"}>Compare (${sel.length})</button></div>
    <span class="spacer"></span>
    <span class="note" style="margin:0">Session only — cleared on reload</span>
    <button class="ghost" data-clear>Clear</button></div>`;

  const root = $("runs");
  if (state.view === "compare") {
    const diff = diffKeys(sel);
    root.innerHTML = `${head}${diff.has("model") ? `<div class="note" style="margin:0 0 10px;color:var(--warn)">Model differs between these runs.</div>` : ""}
      <div class="grid" style="grid-template-columns:repeat(${sel.length},minmax(0,1fr))">${sel.map((r) => cardHtml(r, true, diff)).join("")}</div>`;
    return;
  }
  if (!all.length) {
    root.innerHTML = `${head}<div class="empty">No runs yet for ${esc(m.label)}.</div>`;
    return;
  }
  // List view: keep the head fresh and patch the cards by key.
  let list = root.querySelector(".list");
  if (!list || root.dataset.mod !== m.id) {
    root.innerHTML = `${head}<div class="list"></div>`;
    root.dataset.mod = m.id;
    list = root.querySelector(".list");
  } else {
    root.querySelector(".runs-head").outerHTML = head;
  }
  const none = new Set();
  const keep = new Set(all.map((r) => String(r.id)));
  for (const el of [...list.children]) if (!keep.has(el.dataset.card)) el.remove();
  let prev = null;
  for (const r of all) {
    let el = list.querySelector(`[data-card="${r.id}"]`);
    if (!el || el.dataset.key !== cardKey(r)) {
      const tpl = document.createElement("div");
      tpl.innerHTML = cardHtml(r, false, none);
      const fresh = tpl.firstElementChild;
      fresh.dataset.key = cardKey(r);
      if (el) el.replaceWith(fresh);
      el = fresh;
    }
    const want = prev ? prev.nextElementSibling : list.firstElementChild;
    if (want !== el) list.insertBefore(el, want);
    prev = el;
  }
}

function render() {
  bar();
  rail();
  form();
  runsView();
}

// ── events ─────────────────────────────────────────────────────────────────

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-m],[data-v],[data-open],[data-rerun],[data-continue],[data-clear],[data-run],[data-turn-add],[data-turn-x],[data-connect]");
  if (!t || t.disabled) return;
  const d = t.dataset;
  const v = state.values[state.cur];
  if (d.m) {
    state.cur = d.m;
    state.view = "list";
    state.formError = "";
    render();
  } else if (d.v) {
    state.view = d.v;
    runsView();
  } else if (d.open) {
    const id = +d.open;
    state.open.has(id) ? state.open.delete(id) : state.open.add(id);
    runsView();
  } else if (d.rerun) {
    const r = store.get(+d.rerun);
    if (r) execute(MODALITY_BY_ID[r.mod], r.values);
  } else if (d.continue) {
    const r = store.get(+d.continue);
    state.values[r.mod] = MODALITY_BY_ID[r.mod].continueFrom(r);
    form();
    const areas = $("form").querySelectorAll('textarea[data-part="content"]');
    areas[areas.length - 1]?.focus();
  } else if ("clear" in d) {
    for (const r of store.list(state.cur)) state.picked.delete(r.id);
    store.clear(state.cur);
  } else if ("run" in d) {
    execute(mod(), state.values[state.cur]);
  } else if ("turnAdd" in d) {
    const last = v.turns[v.turns.length - 1];
    v.turns.push({ role: last?.role === "user" ? "assistant" : "user", content: "" });
    form();
  } else if ("turnX" in d) {
    v.turns.splice(+d.turnX, 1);
    form();
  } else if ("connect" in d) {
    connect().then(render);
  }
});

function onField(e) {
  const t = e.target;
  const v = state.values[state.cur];
  if (t.dataset.label !== undefined) {
    state.labels[state.cur] = t.value;
  } else if (t.dataset.turn !== undefined) {
    v.turns[+t.dataset.turn][t.dataset.part] = t.value;
    if (t.dataset.part === "role") form();
  } else if (t.dataset.k) {
    const f = flatFields(mod()).find((x) => x.k === t.dataset.k);
    v[t.dataset.k] = f.t === "check" ? t.checked : f.t === "range" ? Number(t.value) : t.value;
    if (f.t === "range") t.nextElementSibling.textContent = t.value;
  }
}
document.addEventListener("input", onField);
document.addEventListener("change", (e) => {
  if (e.target.dataset.pick) {
    const id = +e.target.dataset.pick;
    state.picked.has(id) ? state.picked.delete(id) : state.picked.add(id);
    runsView();
    return;
  }
  if (e.target.type === "checkbox" || e.target.tagName === "SELECT") onField(e);
});

// Ctrl/Cmd+Enter runs from anywhere in the form.
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.closest?.("#form") && state.conn === "on") {
    e.preventDefault();
    execute(mod(), state.values[state.cur]);
  }
});

store.onChange(() => {
  bar();
  rail();
  runsView();
});

// Elapsed time on running cards, without re-rendering them.
setInterval(() => {
  for (const el of document.querySelectorAll("[data-elapsed]")) {
    const r = store.get(+el.dataset.elapsed);
    if (r?.status === "running") el.textContent = `running · ${formatMs(performance.now() - r.startedAt)}`;
  }
}, 500);

render();
connect().then(form);
