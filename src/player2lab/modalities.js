// Player2 Lab — the modality table as data. (tech/player2-lab.md)
//
// One row per modality. A row says what the form holds (`fields`), how the
// form becomes a request (`request`), what a card lists as its inputs
// (`summary`, keyed like the values so the compare view can diff them), how a
// response becomes an output (`output`), and where the reported model lives
// (`reported`). DOM-free and fetch-free: app.js executes the request.
//
// Field kinds: text, textarea, number, range, check, select, turns, voices
// (value: [{ id, name }], options from /tts/voices), audio (value: a prepared
// clip, see app.js), images (value: [{ name, source, dataUrl }], at most
// `max`). A `row` groups fields side by side.
//
// A request is { kind, method, path, body, bytes?, query? } where kind is:
//   "json"        — client.call(path, { body })
//   "chat-stream" — client.chatStreamFull(body.messages, …, rest of body)
//   "tts-stream"  — client.openStream(path, body); the bytes come back as
//                   { _streamBytes, _playback, _ttfb }
//   "bytes"       — client.sendBytes(path, bytes, { query }); `body` then only
//                   describes what was sent, for Raw
//   "job"         — enqueue with client.call(path, { body }) unqueued, then
//                   poll `poll` (with {id} replaced) until jobState() says
//                   done, then findJobResult(); an asset id is resolved
//                   through GET /assets/{id}
//
// A field with `show(values)` is drawn only when it returns true.

import { base64ToBytes, pcmToWav, FORMAT_MIME } from "./audio.js";

export const LAB = {
  rawKeep: 48, // characters of a base64 string that Raw keeps
  vectorHead: 8, // embedding values shown on the card
  pcmRate: 24000, // TTS `pcm` has no header; played as 16-bit mono at this rate
  sttRate: 16000, // STT input is decoded and re-encoded as WAV at this rate
  pollMs: 3000, // job status poll interval
  jobTimeoutMs: 15 * 60_000, // a job still pending after this ends as a failed card
};

const clip = (s, n = 48) => {
  s = String(s ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};
const num = (v) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v));

export const ROLES = ["system", "user", "assistant"];

const chat = {
  id: "chat",
  label: "Chat",
  group: "Text",
  reports: "The platform reports the model for chat. Your label is shown beside it.",
  fields: [
    { k: "turns", t: "turns", label: "Conversation", v: [{ role: "system", content: "" }, { role: "user", content: "" }] },
    { row: [
      { k: "temperature", t: "range", label: "Temperature", min: 0, max: 2, step: 0.1, v: 1 },
      { k: "max_tokens", t: "number", label: "Max tokens", v: "" },
    ] },
    { row: [
      { k: "json", t: "check", label: "JSON mode", v: false },
      { k: "stream", t: "check", label: "Stream", v: true },
    ] },
    { k: "tools", t: "textarea", label: "Tools (JSON array, optional)", v: "", mono: true, rows: 3 },
  ],
  request(v) {
    const messages = (v.turns || []).filter((m) => String(m.content).trim() !== "").map((m) => ({ role: m.role, content: m.content }));
    if (!messages.length) throw new Error("The conversation is empty.");
    const body = { messages };
    const t = num(v.temperature);
    if (t !== undefined) body.temperature = t;
    const mt = num(v.max_tokens);
    if (mt !== undefined) body.max_tokens = mt;
    if (v.json) body.response_format = { type: "json_object" };
    if (String(v.tools || "").trim()) {
      let tools;
      try {
        tools = JSON.parse(v.tools);
      } catch (e) {
        throw new Error(`Tools is not valid JSON: ${e.message}`);
      }
      if (!Array.isArray(tools)) throw new Error("Tools must be a JSON array.");
      body.tools = tools;
    }
    return { kind: v.stream ? "chat-stream" : "json", method: "POST", path: "/chat/completions", body: v.stream ? { ...body, stream: true } : body };
  },
  summary(v) {
    const turns = (v.turns || []).filter((m) => String(m.content).trim() !== "");
    const last = turns[turns.length - 1];
    const s = {
      turns: `${turns.length} turn${turns.length === 1 ? "" : "s"}${last ? ` · ${last.role}: “${clip(last.content, 40)}”` : ""}`,
      temperature: `temp ${v.temperature}`,
    };
    if (num(v.max_tokens) !== undefined) s.max_tokens = `max ${v.max_tokens}`;
    if (v.json) s.json = "JSON";
    s.stream = v.stream ? "streamed" : "whole";
    if (String(v.tools || "").trim()) s.tools = "tools";
    return s;
  },
  output(resp) {
    const msg = resp?.choices?.[0]?.message || {};
    const out = { type: "text", text: msg.content ?? "" };
    if (msg.tool_calls?.length) out.toolCalls = msg.tool_calls;
    return out;
  },
  reported: (resp) => resp?.model || null,
  // Continue: the run's conversation, its reply as the last assistant turn,
  // then an empty user turn for the next message.
  continueFrom(run) {
    const turns = (run.values.turns || []).filter((m) => String(m.content).trim() !== "").map((m) => ({ ...m }));
    turns.push({ role: "assistant", content: run.output?.text ?? "" });
    turns.push({ role: "user", content: "" });
    return { ...run.values, turns };
  },
};

const embed = {
  id: "embed",
  label: "Embeddings",
  group: "Text",
  reports: "The platform reports the model for embeddings. Your label is shown beside it.",
  fields: [
    { k: "input", t: "textarea", label: "Input (one per line)", v: "" },
    { row: [
      { k: "model", t: "text", label: "Model", v: "" },
      { k: "dimensions", t: "number", label: "Dimensions", v: "" },
    ] },
  ],
  request(v) {
    const lines = String(v.input || "").split("\n").map((s) => s.trim()).filter(Boolean);
    if (!lines.length) throw new Error("Input is empty.");
    const body = { input: lines.length === 1 ? lines[0] : lines };
    if (String(v.model || "").trim()) body.model = v.model.trim();
    const d = num(v.dimensions);
    if (d !== undefined) body.dimensions = d;
    return { kind: "json", method: "POST", path: "/embeddings", body };
  },
  summary(v) {
    const lines = String(v.input || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const s = { input: `${lines.length} input${lines.length === 1 ? "" : "s"} · “${clip(lines[0], 32)}”` };
    if (String(v.model || "").trim()) s.model = `model ${v.model.trim()}`;
    if (num(v.dimensions) !== undefined) s.dimensions = `${v.dimensions} dims`;
    return s;
  },
  output(resp, values) {
    const lines = String(values?.input || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const vectors = (resp?.data || []).map((d, i) => ({
      text: lines[d.index ?? i] ?? "",
      length: d.embedding?.length ?? 0,
      head: (d.embedding || []).slice(0, LAB.vectorHead),
    }));
    return { type: "vectors", vectors };
  },
  reported: (resp) => resp?.model || null,
};

const TTS_FORMATS = ["mp3", "wav", "opus", "flac", "ogg", "pcm"];
const STREAM_FORMATS = ["mp3", "wav"];

const tts = {
  id: "tts",
  label: "Text to speech",
  group: "Audio",
  reports: "The platform reports the provider only when delivery instructions are sent, and never for a streamed run.",
  reportedKind: "provider",
  fields: [
    { k: "text", t: "textarea", label: "Text", v: "" },
    { k: "voices", t: "voices", label: "Voice(s) — pick one, or several to mix them", v: [] },
    { row: [
      { k: "speed", t: "range", label: "Speed", min: 0.25, max: 4, step: 0.05, v: 1 },
      { k: "format", t: "select", label: "Format", opts: TTS_FORMATS, v: "mp3" },
    ] },
    { k: "instructions", t: "text", label: "Delivery instructions (optional)", v: "" },
    { k: "stream", t: "check", label: "Stream — plays as it arrives (mp3 / wav only; no provider reported)", v: false },
  ],
  request(v) {
    const text = String(v.text || "").trim();
    if (!text) throw new Error("Text is empty.");
    if (v.stream && !STREAM_FORMATS.includes(v.format)) throw new Error(`Streaming supports ${STREAM_FORMATS.join(" and ")} only.`);
    const body = { text, speed: Number(v.speed), audio_format: v.format };
    if (v.voices?.length) body.voice_ids = v.voices.map((x) => x.id);
    if (String(v.instructions || "").trim()) body.advanced_voice = { instructions: v.instructions.trim() };
    return v.stream
      ? { kind: "tts-stream", method: "POST", path: "/tts/stream", body }
      : { kind: "json", method: "POST", path: "/tts/speak", body };
  },
  summary(v) {
    const s = { text: `“${clip(v.text, 40)}”`, voices: v.voices?.length ? v.voices.map((x) => x.name).join(" + ") : "default voice", speed: `speed ${v.speed}`, format: v.format };
    s.instructions = String(v.instructions || "").trim() ? `instructions: “${clip(v.instructions, 28)}”` : "no instructions";
    s.stream = v.stream ? "streamed" : "whole";
    return s;
  },
  output(resp, v) {
    const streamed = Boolean(resp?._streamBytes);
    let bytes = streamed ? resp._streamBytes : base64ToBytes(resp?.data || "");
    if (v.format === "pcm") bytes = pcmToWav(bytes, LAB.pcmRate);
    const out = { type: "audio", bytes, mime: FORMAT_MIME[v.format] || "audio/mpeg", format: v.format };
    if (streamed) Object.assign(out, { streamed: true, playback: resp._playback, ttfb: resp._ttfb });
    const sent = Boolean(String(v.instructions || "").trim());
    if (sent) out.instructions = resp?.style_outcome?.fidelity || "not reported";
    return out;
  },
  reported: (resp) => resp?.style_outcome?.provider || null,
  voiceSent: (v) => (v.voices?.length ? v.voices.map((x) => x.name).join(" + ") : ""),
};

export const STT_LANGUAGES = ["en-US", "multi", "en", "en-AU", "en-GB", "en-NZ", "en-IN", "es", "es-419", "fr", "fr-CA", "de", "de-CH", "it", "pt", "pt-BR", "pt-PT", "ru", "hi", "ja", "ko", "ko-KR", "zh", "zh-CN", "zh-TW", "zh-HK", "nl", "nl-BE", "tr", "pl", "sv", "sv-SE", "no", "da", "da-DK", "fi", "uk", "el", "cs", "hu", "ar", "be", "bn", "bs", "bg", "ca", "hr", "et", "he", "id", "kn", "lv", "lt", "mk", "ms", "mr", "fa", "ro", "sr", "sk", "sl", "tl", "ta", "te", "th", "ur", "vi"];

const stt = {
  id: "stt",
  label: "Speech to text",
  group: "Audio",
  fields: [
    { k: "audio", t: "audio", label: "Audio", v: null },
    { k: "language", t: "select", label: "Language", opts: STT_LANGUAGES, v: "en-US" },
  ],
  // v.audio: { source, name, bytes, encoding, sampleRate?, seconds?, reencoded }
  request(v) {
    const a = v.audio;
    if (!a?.bytes?.length) throw new Error("No audio yet: drop a file, record from the mic, or send a TTS run here.");
    if (!a.encoding) throw new Error(`The browser could not decode “${a.name}” and its format could not be guessed.`);
    const query = { encoding: a.encoding, sample_rate: a.sampleRate, language: v.language };
    return {
      kind: "bytes",
      method: "POST",
      path: "/stt/audio",
      bytes: a.bytes,
      query,
      body: { query, body: `${a.bytes.length} bytes ${a.encoding}${a.reencoded ? `, re-encoded from ${a.source}` : `, sent as supplied (${a.source})`}` },
    };
  },
  summary(v) {
    const a = v.audio;
    return {
      audio: a ? `${a.source}${a.seconds ? ` · ${a.seconds.toFixed(1)}s` : ""}` : "no audio",
      language: v.language,
    };
  },
  output(resp) {
    return {
      type: "transcript",
      transcript: resp?.transcript ?? "",
      confidence: resp?.confidence,
      duration: resp?.duration,
      words: resp?.words || [],
    };
  },
};

const ASPECTS = ["none (use size)", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16", "9:21"];

const imagesSummary = (list) => (list?.length ? `${list.length} image${list.length === 1 ? "" : "s"}: ${list.map((x) => x.source).join(", ")}` : "no image");

const img = {
  id: "img",
  label: "Image generate",
  group: "Image",
  fields: [
    { k: "prompt", t: "textarea", label: "Prompt", v: "" },
    { row: [
      { k: "width", t: "number", label: "Width (128–1024)", v: 1024 },
      { k: "height", t: "number", label: "Height (128–1024)", v: 1024 },
    ] },
  ],
  request(v) {
    const prompt = String(v.prompt || "").trim();
    if (!prompt) throw new Error("Prompt is empty.");
    const body = { prompt };
    const w = num(v.width);
    const h = num(v.height);
    if (w !== undefined) body.width = w;
    if (h !== undefined) body.height = h;
    return { kind: "json", method: "POST", path: "/image/generate", body };
  },
  summary(v) {
    const s = { prompt: `“${clip(v.prompt, 48)}”` };
    s.width = `${v.width || "?"}w`;
    s.height = `${v.height || "?"}h`;
    return s;
  },
  output: (resp) => ({ type: "image", dataUrl: `data:image/png;base64,${resp?.image || ""}`, mime: "image/png" }),
  imageOut: true,
};

const edit = {
  id: "edit",
  label: "Image edit",
  group: "Image",
  fields: [
    { k: "prompt", t: "textarea", label: "Prompt", v: "" },
    { k: "images", t: "images", label: "Source image(s) — several combine on models that support it", v: [] },
    { k: "aspect", t: "select", label: "Aspect ratio", opts: ASPECTS, v: ASPECTS[0] },
    { row: [
      { k: "width", t: "number", label: "Width (if no ratio)", v: "" },
      { k: "height", t: "number", label: "Height (if no ratio)", v: "" },
    ] },
  ],
  request(v) {
    const prompt = String(v.prompt || "").trim();
    if (!prompt) throw new Error("Prompt is empty.");
    if (!v.images?.length) throw new Error("Add at least one source image: upload one, or use → Image edit on an image run.");
    const body = { prompt };
    if (v.images.length === 1) body.image = v.images[0].dataUrl;
    else body.images = v.images.map((x) => x.dataUrl);
    if (v.aspect && v.aspect !== ASPECTS[0]) body.aspect_ratio = v.aspect;
    else {
      const w = num(v.width);
      const h = num(v.height);
      if (w !== undefined) body.width = w;
      if (h !== undefined) body.height = h;
    }
    return { kind: "json", method: "POST", path: "/image/edit", body };
  },
  summary(v) {
    const s = { prompt: `“${clip(v.prompt, 40)}”`, images: imagesSummary(v.images) };
    if (v.aspect && v.aspect !== ASPECTS[0]) s.aspect = v.aspect;
    else {
      if (num(v.width) !== undefined) s.width = `${v.width}w`;
      if (num(v.height) !== undefined) s.height = `${v.height}h`;
    }
    return s;
  },
  output(resp) {
    if (resp?.error && !resp?.image) throw new Error(resp.error);
    const mime = resp?.mimetype || "image/png";
    return { type: "image", dataUrl: `data:${mime};base64,${resp?.image || ""}`, mime };
  },
  imageOut: true,
};

// ── jobs ────────────────────────────────────────────────────────────────────
// Only the video status route is documented; music and 3D poll the generic
// /jobs/{id}, whose shape is not, so both readers below are defensive.

const DONE = ["completed", "succeeded", "success", "done", "complete"];
const FAILED = ["failed", "error", "cancelled", "canceled"];

export function jobState(status) {
  const s = String(status?.status ?? status?.state ?? "").toLowerCase();
  if (DONE.includes(s)) return "done";
  if (FAILED.includes(s)) return "failed";
  return "pending";
}

export function jobLabel(status) {
  return String(status?.status ?? status?.state ?? "pending").toLowerCase();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_KEYS = ["video_url", "audio_url", "music_url", "model_url", "glb_url", "download_url", "url"];
const ASSET_KEYS = ["asset_id", "assetId", "result_asset_id", "asset"];

// A URL or an asset id in a finished job's payload: the payload, its
// `result`, and one level of nested objects. Null when there is neither.
export function findJobResult(status) {
  if (!status || typeof status !== "object") return null;
  if (typeof status.video_data === "string" && status.video_data && !status.video_url) {
    return { dataUrl: `data:${status.mimetype || "video/mp4"};base64,${status.video_data}` };
  }
  const roots = [status.result, status].filter((x) => x !== undefined && x !== null);
  const candidates = [];
  for (const r of roots) {
    candidates.push(r);
    if (typeof r === "object") candidates.push(...Object.values(r).filter((x) => x && typeof x === "object"));
  }
  for (const c of candidates) {
    if (typeof c === "string") {
      if (/^https?:\/\//.test(c)) return { url: c };
      if (UUID.test(c)) return { assetId: c };
      continue;
    }
    if (typeof c !== "object") continue;
    for (const k of URL_KEYS) if (typeof c[k] === "string" && /^https?:\/\//.test(c[k])) return { url: c[k] };
    for (const k of ASSET_KEYS) if (typeof c[k] === "string" && c[k]) return { assetId: c[k] };
  }
  return null;
}

// The download URL of an asset from GET /assets/{id}.
export function assetUrl(asset) {
  const urls = asset?.urls || {};
  return urls.original || urls.glb || Object.values(urls).find((u) => typeof u === "string") || null;
}

export function jobId(enqueued) {
  if (enqueued?.out_of_credits) throw new Error("Out of credits: the job was not started.");
  if (!enqueued?.job_id) throw new Error("The enqueue response carried no job_id.");
  return enqueued.job_id;
}

// A job's final response, as app.js assembles it: { enqueue, status, asset, url }.
const jobUrl = (resp) => resp?.url || null;

const VIDEO_MODES = ["From prompt", "From image", "Transform image (edit + video)"];
const VIDEO_PATH = { [VIDEO_MODES[0]]: "/video/generate", [VIDEO_MODES[1]]: "/video/generate_from_image", [VIDEO_MODES[2]]: "/video/transform_image" };
const needsImage = (v) => v.mode !== VIDEO_MODES[0];

const video = {
  id: "video",
  label: "Video",
  group: "Video",
  fields: [
    { k: "mode", t: "select", label: "Mode", opts: VIDEO_MODES, v: VIDEO_MODES[0], rerender: true },
    { k: "prompt", t: "textarea", label: "Prompt", v: "" },
    { k: "image", t: "images", label: "Start image", max: 1, v: [], show: needsImage },
    { k: "aspect", t: "select", label: "Aspect ratio", opts: ["16:9", "9:16", "1:1", "4:3", "3:4"], v: "16:9" },
  ],
  note: (v) => (v.mode === VIDEO_MODES[2] ? "Transform edits the image from the prompt, then animates the result: 480p, 5s, 60 J." : ""),
  request(v) {
    const prompt = String(v.prompt || "").trim();
    if (!prompt) throw new Error("Prompt is empty.");
    const body = { prompt, aspect_ratio: v.aspect };
    if (needsImage(v)) {
      if (!v.image?.length) throw new Error("This mode needs a start image.");
      body.image = v.image[0].dataUrl;
    }
    return { kind: "job", method: "POST", path: VIDEO_PATH[v.mode], body, poll: "/video/job/{id}" };
  },
  summary(v) {
    const s = { mode: v.mode.replace(/ \(.*\)$/, "").toLowerCase(), prompt: `“${clip(v.prompt, 40)}”` };
    if (needsImage(v)) s.image = imagesSummary(v.image);
    s.aspect = v.aspect;
    return s;
  },
  output: (resp) => ({ type: "video", url: jobUrl(resp) }),
};

const music = {
  id: "music",
  label: "Music",
  group: "Audio",
  fields: [
    { k: "prompt", t: "textarea", label: "Prompt", v: "" },
    { row: [
      { k: "duration", t: "number", label: "Duration (3–300 s)", v: 30 },
      { k: "instrumental", t: "check", label: "Instrumental", v: true },
    ] },
  ],
  request(v) {
    const prompt = String(v.prompt || "").trim();
    if (!prompt) throw new Error("Prompt is empty.");
    const body = { prompt, force_instrumental: Boolean(v.instrumental) };
    const d = num(v.duration);
    if (d !== undefined) body.duration_seconds = d;
    return { kind: "job", method: "POST", path: "/music/generate_job", body, poll: "/jobs/{id}" };
  },
  summary(v) {
    return { prompt: `“${clip(v.prompt, 40)}”`, duration: `${v.duration || "?"}s`, instrumental: v.instrumental ? "instrumental" : "vocals allowed" };
  },
  output: (resp) => ({ type: "audio", url: jobUrl(resp), mime: resp?.asset?.mime || "audio/mpeg" }),
};

const MODEL_MODES = ["From prompt", "From image"];
const fromImage = (v) => v.mode === MODEL_MODES[1];

const model3d = {
  id: "3d",
  label: "3D",
  group: "3D",
  fields: [
    { k: "mode", t: "select", label: "Source", opts: MODEL_MODES, v: MODEL_MODES[0], rerender: true },
    { k: "prompt", t: "textarea", label: "Prompt", v: "", show: (v) => !fromImage(v) },
    { k: "image", t: "images", label: "Image", max: 1, v: [], show: fromImage },
  ],
  request(v) {
    if (fromImage(v)) {
      if (!v.image?.length) throw new Error("Add an image.");
      return { kind: "job", method: "POST", path: "/model3d/generate_from_image", body: { image: v.image[0].dataUrl }, poll: "/jobs/{id}" };
    }
    const prompt = String(v.prompt || "").trim();
    if (!prompt) throw new Error("Prompt is empty.");
    return { kind: "job", method: "POST", path: "/text3d/generate", body: { prompt }, poll: "/jobs/{id}" };
  },
  summary(v) {
    return fromImage(v) ? { mode: "from image", image: imagesSummary(v.image) } : { mode: "from prompt", prompt: `“${clip(v.prompt, 40)}”` };
  },
  output: (resp) => ({ type: "model", url: jobUrl(resp) }),
};

export const MODALITIES = [chat, embed, tts, stt, music, img, edit, video, model3d];
export const MODALITY_BY_ID = Object.fromEntries(MODALITIES.map((m) => [m.id, m]));

// Every field, rows flattened.
export function flatFields(mod) {
  return mod.fields.flatMap((f) => (f.row ? f.row : [f]));
}

// A fresh copy of a modality's default values.
export function defaultValues(mod) {
  const v = {};
  for (const f of flatFields(mod)) v[f.k] = f.v === null ? null : structuredClone(f.v ?? "");
  return v;
}
