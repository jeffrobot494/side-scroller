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
// clip, see app.js). A `row` groups fields side by side.
//
// A request is { kind, method, path, body, bytes?, query? } where kind is:
//   "json"        — client.call(path, { body })
//   "chat-stream" — client.chatStreamFull(body.messages, …, rest of body)
//   "tts-stream"  — client.openStream(path, body); the bytes come back as
//                   { _streamBytes, _playback, _ttfb }
//   "bytes"       — client.sendBytes(path, bytes, { query }); `body` then only
//                   describes what was sent, for Raw

import { base64ToBytes, pcmToWav, FORMAT_MIME } from "./audio.js";

export const LAB = {
  rawKeep: 48, // characters of a base64 string that Raw keeps
  vectorHead: 8, // embedding values shown on the card
  pcmRate: 24000, // TTS `pcm` has no header; played as 16-bit mono at this rate
  sttRate: 16000, // STT input is decoded and re-encoded as WAV at this rate
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

export const MODALITIES = [chat, embed, tts, stt];
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
