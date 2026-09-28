// Player2 Lab — the modality table as data. (tech/player2-lab.md)
//
// One row per modality. A row says what the form holds (`fields`), how the
// form becomes a request (`request`), what a card lists as its inputs
// (`summary`, keyed like the values so the compare view can diff them), how a
// response becomes an output (`output`), and where the reported model lives
// (`reported`). DOM-free and fetch-free: app.js executes the request.
//
// Field kinds: text, textarea, number, range, check, select, turns. A `row`
// groups fields side by side.
//
// A request is { kind, method, path, body } where kind is:
//   "json"        — client.call(path, { body })
//   "chat-stream" — client.chatStreamFull(body.messages, …, rest of body)

export const LAB = {
  rawKeep: 48, // characters of a base64 string that Raw keeps
  vectorHead: 8, // embedding values shown on the card
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

export const MODALITIES = [chat, embed];
export const MODALITY_BY_ID = Object.fromEntries(MODALITIES.map((m) => [m.id, m]));

// Every field, rows flattened.
export function flatFields(mod) {
  return mod.fields.flatMap((f) => (f.row ? f.row : [f]));
}

// A fresh copy of a modality's default values.
export function defaultValues(mod) {
  const v = {};
  for (const f of flatFields(mod)) v[f.k] = structuredClone(f.v ?? "");
  return v;
}
