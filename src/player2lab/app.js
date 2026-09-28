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
import { decodeToWav, guessEncoding, concatBytes } from "./audio.js";

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
  voices: null, // /tts/voices, loaded on connect
  voicesError: "",
  voiceFilter: "",
  audioBusy: false, // an STT clip is being decoded
  recorder: null, // { rec, chunks, stream } while the mic records
};

// Media elements live outside the cards, one per run, and are moved into a
// card's slot on render — so re-rendering a card never restarts playback.
const media = new Map(); // run id -> HTMLMediaElement

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
    loadVoices();
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

async function loadVoices() {
  try {
    const res = await client.call("/tts/voices");
    state.voices = (res?.voices || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    state.voicesError = "";
  } catch (e) {
    state.voicesError = e.message;
  }
  if (state.cur === "tts") form();
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
  if (state.formError) {
    state.formError = "";
    form();
  }
  const run = store.add({
    mod: m.id,
    values: structuredClone(values),
    summary: m.summary(values),
    label: (state.labels[m.id] || "").trim(),
    voice: m.voiceSent?.(values) || "",
    reportedKind: m.reportedKind || "",
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
    // A streamed run that could not play progressively plays once complete.
    if (response?._playback === "at end") mediaFor(store.get(run.id))?.play().catch(() => {});
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
  if (req.kind === "tts-stream") return streamTts(req, run);
  if (req.kind === "bytes") return client.sendBytes(req.path, req.bytes, { query: req.query });
  return client.call(req.path, { method: req.method, body: req.body });
}

// Streamed TTS: mp3 plays as it arrives through MediaSource; anything else
// (wav, or no mp3 MediaSource) plays once the last byte lands.
async function streamTts(req, run) {
  const res = await client.openStream(req.path, req.body);
  const progressive = req.body.audio_format === "mp3" && Boolean(globalThis.MediaSource?.isTypeSupported?.("audio/mpeg"));
  let sb = null;
  let ms = null;
  if (progressive) {
    ms = new MediaSource();
    const el = makeAudio(URL.createObjectURL(ms));
    media.set(run.id, el);
    await new Promise((r) => ms.addEventListener("sourceopen", r, { once: true }));
    sb = ms.addSourceBuffer("audio/mpeg");
  }
  const append = (chunk) =>
    new Promise((resolve, reject) => {
      sb.addEventListener("updateend", resolve, { once: true });
      sb.addEventListener("error", reject, { once: true });
      sb.appendBuffer(chunk);
    });
  const chunks = [];
  let ttfb = null;
  const reader = res.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    chunks.push(value);
    if (ttfb === null) {
      ttfb = performance.now() - run.startedAt;
      store.update(run.id, { ttfb, live: progressive });
    }
    if (progressive) {
      await append(value);
      if (chunks.length === 1) media.get(run.id).play().catch(() => {});
    }
  }
  if (progressive && ms.readyState === "open") ms.endOfStream();
  return { _streamBytes: concatBytes(chunks), _playback: progressive ? "progressive" : "at end", _ttfb: ttfb };
}

function makeAudio(src) {
  const el = document.createElement("audio");
  el.controls = true;
  el.preload = "metadata";
  el.src = src;
  return el;
}

// The run's media element, made from its output bytes on first need.
function mediaFor(r) {
  if (media.has(r.id)) return media.get(r.id);
  const o = r.output;
  if (!o?.bytes) return null;
  const el = makeAudio(URL.createObjectURL(new Blob([o.bytes], { type: o.mime })));
  media.set(r.id, el);
  return el;
}

function mountMedia(root) {
  for (const slot of root.querySelectorAll("[data-media]")) {
    const r = store.get(+slot.dataset.media);
    const el = r && mediaFor(r);
    if (el && el.parentNode !== slot) slot.appendChild(el);
  }
}

// ── STT input: every clip is decoded and re-encoded as mono WAV ─────────────

async function prepareClip(bytes, name, mime, source) {
  state.audioBusy = true;
  if (state.cur === "stt") form();
  let clip;
  try {
    const ctx = new OfflineAudioContext(1, 1, LAB.sttRate);
    const { wav, sampleRate, seconds } = await decodeToWav(bytes, ctx);
    clip = { source, name, bytes: wav, encoding: "wav", sampleRate, seconds, reencoded: true, mime: "audio/wav" };
  } catch {
    // Not decodable here: send it as supplied, encoding guessed from the name.
    clip = { source, name, bytes, encoding: guessEncoding(name, mime), reencoded: false, mime };
  }
  state.values.stt.audio = clip;
  state.audioBusy = false;
  state.formError = "";
  if (state.cur === "stt") form();
}

async function toggleRecording() {
  if (state.recorder) {
    state.recorder.rec.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      state.recorder = null;
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      await prepareClip(new Uint8Array(await blob.arrayBuffer()), "mic.webm", blob.type, "mic recording");
    };
    rec.start();
    state.recorder = { rec, chunks, stream };
  } catch (e) {
    state.formError = `Mic unavailable: ${e.message}`;
  }
  form();
}

async function takeFile(file) {
  if (!file) return;
  await prepareClip(new Uint8Array(await file.arrayBuffer()), file.name, file.type, file.name);
}

// → Speech to text: a TTS run's audio becomes the STT input.
function sendToStt(r) {
  state.cur = "stt";
  state.view = "list";
  render();
  prepareClip(r.output.bytes, `run-${r.id}.${r.output.format}`, r.output.mime, `run #${r.id}`);
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
    case "voices":
      return `<div class="field">${L}<div class="chips" style="margin-bottom:6px">${
        (val || []).map((x) => `<span class="chip on">${esc(x.name)} <button class="x-in" data-voice-x="${esc(x.id)}" title="Remove">×</button></span>`).join("") ||
        `<span class="note" style="margin:0">None picked — the platform's default voice</span>`
      }</div>${
        state.voices
          ? `<input type="text" data-voice-filter placeholder="Filter ${state.voices.length} voices by name, language or gender" value="${esc(state.voiceFilter)}">
             <div class="voice-list" id="voice-list">${voiceList(val)}</div>`
          : `<div class="note" style="margin:0">${state.voicesError ? `Voice list unavailable: ${esc(state.voicesError)}` : "Loading the voice list…"}</div>`
      }</div>`;
    case "images":
      return imagesField(f, val);
    case "audio": {
      const rec = state.recorder;
      return `<div class="field">${L}<div class="drop" data-drop>
          ${state.audioBusy ? "Decoding…" : val ? `<b>${esc(val.source)}</b>${val.seconds ? ` · ${val.seconds.toFixed(1)}s` : ""} · ${
            val.reencoded ? `re-encoded to WAV ${val.sampleRate} Hz` : val.encoding ? `sent as supplied (${esc(val.encoding)})` : "format unknown"
          }` : "Drop an audio file here"}
          <div class="drop-actions"><label class="ghost">Choose file<input type="file" accept="audio/*" data-audio-file hidden></label>
          <button class="ghost ${rec ? "rec" : ""}" data-record>${rec ? "■ Stop recording" : "● Record from mic"}</button></div>
        </div>${val ? `<div class="clip" id="clip-slot"></div>` : ""}</div>`;
    }
  }
  return "";
}

// Image fields: uploads or an earlier run's output, as data URLs.
function imagesField(f, val) {
  const list = val || [];
  const full = f.max && list.length >= f.max;
  return `<div class="field"><span>${esc(f.label)}</span>${
    list.length
      ? `<div class="thumbs">${list
          .map((x, i) => `<div class="thumb"><img src="${x.dataUrl}" alt=""><button class="x" data-img-x="${f.k}:${i}" title="Remove">×</button><span>${esc(x.source)}</span></div>`)
          .join("")}</div>`
      : ""
  }${
    full
      ? ""
      : `<div class="drop" data-drop="images:${f.k}">Drop image${f.max === 1 ? "" : "s"} here, or use → Image edit on an image run
        <div class="drop-actions"><label class="ghost">Choose file${f.max === 1 ? "" : "s"}<input type="file" accept="image/*" ${f.max === 1 ? "" : "multiple"} data-image-file="${f.k}" hidden></label></div></div>`
  }</div>`;
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

async function takeImages(key, files) {
  const f = flatFields(mod()).find((x) => x.k === key);
  const v = state.values[state.cur];
  for (const file of [...files].filter((x) => x.type.startsWith("image/"))) {
    if (f.max && v[key].length >= f.max) break;
    v[key].push({ name: file.name, source: file.name, dataUrl: await readDataUrl(file) });
  }
  form();
}

// → Image edit: an image run's output becomes a source image.
function sendToEdit(r) {
  const v = state.values.edit;
  v.images.push({ name: `run-${r.id}`, source: `run #${r.id}`, dataUrl: r.output.dataUrl });
  state.cur = "edit";
  state.view = "list";
  render();
}

function voiceList(picked) {
  const q = state.voiceFilter.trim().toLowerCase();
  const on = new Set((picked || []).map((x) => x.id));
  const list = state.voices.filter((x) => !on.has(x.id) && (!q || `${x.name} ${x.language} ${x.gender}`.toLowerCase().includes(q)));
  if (!list.length) return `<span class="note" style="margin:0">No match.</span>`;
  return list
    .map((x) => `<button class="chip" data-voice-add="${esc(x.id)}" title="${esc(x.language)} · ${esc(x.gender)}">${esc(x.name)} <i>${esc(x.language)}</i></button>`)
    .join("");
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
  const clipSlot = $("clip-slot");
  const clip = v.audio;
  if (clipSlot && clip?.bytes) clipSlot.appendChild(makeAudio(URL.createObjectURL(new Blob([clip.bytes], { type: clip.mime }))));
}

// ── run cards ──────────────────────────────────────────────────────────────

function outputHtml(r) {
  if (r.status === "failed") return `<div class="err">${esc(r.error)}</div>`;
  if (r.status === "running") {
    if (r.partial) return `<div class="out-text caret">${esc(r.partial)}</div>`;
    if (r.live) return `<div class="media-slot" data-media="${r.id}"></div><div class="note">Streaming · first audio after ${formatMs(r.ttfb)}</div>`;
    if (r.ttfb != null) return `<div class="note" style="margin:0">Receiving audio · first byte after ${formatMs(r.ttfb)}</div>`;
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
    case "audio": {
      const notes = [];
      if (o.streamed) notes.push(`streamed · first audio after ${formatMs(o.ttfb)} · ${o.playback === "progressive" ? "played as it arrived" : "played once complete"}`);
      if (o.instructions) {
        notes.push(
          {
            full: "Delivery instructions: reached the provider",
            dropped: "Delivery instructions: dropped — this provider has no style channel",
          }[o.instructions] || "Delivery instructions: sent; the outcome was not reported",
        );
      }
      return `<div class="media-slot" data-media="${r.id}"></div>${notes.map((n) => `<div class="note">${esc(n)}</div>`).join("")}`;
    }
    case "image": {
      const ext = (o.mime.split("/")[1] || "png").replace("jpeg", "jpg");
      return `<img class="media" src="${o.dataUrl}" alt="run ${r.id} output">
        <div class="img-actions"><a class="ghost" href="${o.dataUrl}" download="player2-lab-run-${r.id}.${ext}">Download</a></div>`;
    }
    case "transcript": {
      const bits = [];
      if (typeof o.confidence === "number") bits.push(`confidence ${o.confidence.toFixed(2)}`);
      if (typeof o.duration === "number") bits.push(`${o.duration.toFixed(1)}s`);
      bits.push(`${o.words.length} word${o.words.length === 1 ? "" : "s"}`);
      const words = o.words
        .map((w) => `<span title="confidence ${w.confidence ?? "?"}">${esc(w.word)} <i>${Number(w.start ?? 0).toFixed(2)}–${Number(w.end ?? 0).toFixed(2)}</i></span>`)
        .join("");
      return `<div class="out-text">${o.transcript ? `“${esc(o.transcript)}”` : `<span class="note">(no speech recognised)</span>`}</div>
        <div class="note">${bits.join(" · ")}</div>${words ? `<div class="words">${words}</div>` : ""}`;
    }
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
      ${done && r.output?.type === "audio" && r.mod === "tts" ? `<button class="ghost" data-to-stt="${r.id}">→ Speech to text</button>` : ""}
      ${done && m.imageOut ? `<button class="ghost" data-to-edit="${r.id}">→ Image edit</button>` : ""}
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
    mountMedia(root);
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
  mountMedia(list);
}

function render() {
  bar();
  rail();
  form();
  runsView();
}

// ── events ─────────────────────────────────────────────────────────────────

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-m],[data-v],[data-open],[data-rerun],[data-continue],[data-clear],[data-run],[data-turn-add],[data-turn-x],[data-connect],[data-to-stt],[data-voice-add],[data-voice-x],[data-record],[data-to-edit],[data-img-x]");
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
  } else if (d.toEdit) {
    sendToEdit(store.get(+d.toEdit));
  } else if (d.imgX) {
    const [k, i] = d.imgX.split(":");
    v[k].splice(+i, 1);
    form();
  } else if (d.toStt) {
    sendToStt(store.get(+d.toStt));
  } else if (d.voiceAdd) {
    const x = state.voices.find((y) => y.id === d.voiceAdd);
    v.voices.push({ id: x.id, name: x.name });
    form();
  } else if (d.voiceX) {
    v.voices = v.voices.filter((y) => y.id !== d.voiceX);
    form();
  } else if ("record" in d) {
    toggleRecording();
  } else if ("clear" in d) {
    for (const r of store.list(state.cur)) {
      state.picked.delete(r.id);
      if (r.status !== "running" && media.has(r.id)) {
        const el = media.get(r.id);
        el.pause();
        if (el.src.startsWith("blob:")) URL.revokeObjectURL(el.src);
        media.delete(r.id);
      }
    }
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
  } else if (t.dataset.voiceFilter !== undefined) {
    state.voiceFilter = t.value;
    $("voice-list").innerHTML = voiceList(v.voices);
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
  if (e.target.dataset.imageFile) {
    takeImages(e.target.dataset.imageFile, e.target.files);
    return;
  }
  if (e.target.dataset.audioFile !== undefined) {
    takeFile(e.target.files[0]);
    return;
  }
  if (e.target.type === "checkbox" || e.target.tagName === "SELECT") onField(e);
});

// Drop an audio file on the STT drop zone.
document.addEventListener("dragover", (e) => {
  if (e.target.closest?.("[data-drop]")) e.preventDefault();
});
document.addEventListener("drop", (e) => {
  const zone = e.target.closest?.("[data-drop]");
  if (!zone) return;
  e.preventDefault();
  const kind = zone.dataset.drop;
  if (kind.startsWith("images:")) takeImages(kind.slice(7), e.dataTransfer.files);
  else takeFile(e.dataTransfer.files[0]);
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
