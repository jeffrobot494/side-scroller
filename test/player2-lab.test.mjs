// Player2 Lab (tech/player2-lab.md). No live API: fetch is stubbed.
// L0: the client's additive calls, and the return shapes of chat/chatStream/
// poll that the game relies on and nothing else pinned.
import { Player2Client, RateLimitError, InsufficientCreditsError } from "../src/player2/client.js";
import { MODALITIES, MODALITY_BY_ID, defaultValues, flatFields } from "../src/player2lab/modalities.js";
import { createRunStore, createJoulesLedger, ident, diffKeys, valueKey, shortenForRaw, formatMs } from "../src/player2lab/runs.js";
import { encodeWav, pcmToWav, toMono, decodeToWav, guessEncoding, base64ToBytes, concatBytes } from "../src/player2lab/audio.js";

// A fetch stub: routes are matched in order by a predicate on (url, init).
function stubFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const r of routes) if (r.match(String(url), init)) return r.respond(String(url), init);
    throw new Error(`unrouted fetch ${url}`);
  };
  fn.calls = calls;
  return fn;
}

function jsonRes(obj, status = 200, headers = {}) {
  const text = obj === null ? "" : JSON.stringify(obj);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => text,
    body: bodyOf(text),
  };
}

function streamRes(chunks, status = 200) {
  return { ok: status < 300, status, headers: { get: () => null }, text: async () => chunks.join(""), body: bodyOf(chunks) };
}

// A ReadableStream-like body yielding the given string/Uint8Array chunks.
function bodyOf(chunks) {
  const list = Array.isArray(chunks) ? chunks.slice() : [chunks];
  const enc = new TextEncoder();
  return {
    getReader: () => ({
      read: async () => {
        if (!list.length) return { done: true, value: undefined };
        const c = list.shift();
        return { done: false, value: typeof c === "string" ? enc.encode(c) : c };
      },
    }),
  };
}

function sse(objs) {
  return objs.map((o) => `data: ${typeof o === "string" ? o : JSON.stringify(o)}\n\n`);
}

async function withFetch(stub, fn) {
  const prev = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = prev;
  }
}

function client() {
  const c = new Player2Client({ gameClientId: "test" });
  c.setKey("k");
  return c;
}

const COMPLETION = {
  id: "c1",
  model: "gpt-test",
  choices: [{ message: { role: "assistant", content: "hello" } }],
  usage: { total_tokens: 3 },
};

export default async function run(t) {
  // ---- existing shapes, pinned ---------------------------------------------
  {
    const f = stubFetch([{ match: (u) => u.endsWith("/chat/completions"), respond: () => jsonRes(COMPLETION) }]);
    const out = await withFetch(f, () => client().chat([{ role: "user", content: "hi" }], { temperature: 0.2 }));
    t.eq("chat: still returns the content string only", out, "hello");
    const body = JSON.parse(f.calls[0].init.body);
    t.eq("chat: still sends stream:false", body.stream, false);
    t.eq("chat: still spreads opts", body.temperature, 0.2);
  }
  {
    const chunks = sse([{ model: "m1", choices: [{ delta: { content: "he" } }] }, { choices: [{ delta: { content: "y" } }] }, "[DONE]"]);
    const f = stubFetch([{ match: () => true, respond: () => streamRes(chunks) }]);
    const deltas = [];
    const out = await withFetch(f, () => client().chatStream([], (d) => deltas.push(d)));
    t.eq("chatStream: still returns the text only", out, "hey");
    t.eq("chatStream: still calls onDelta per chunk", deltas, ["he", "y"]);
  }
  {
    let n = 0;
    const f = stubFetch([{ match: () => true, respond: () => jsonRes({ status: ++n < 3 ? "processing" : "completed", n }) }]);
    const c = client();
    const out = await withFetch(f, () => c.jobs.poll("/video/job/1", { intervalMs: 1 }));
    t.eq("poll: default isDone still resolves the completed status", out.n, 3);
    n = 0;
    const g = stubFetch([{ match: () => true, respond: () => jsonRes({ status: "failed", error_message: "boom" }) }]);
    let err = null;
    await withFetch(g, () => c.jobs.poll("/video/job/1", { intervalMs: 1 })).catch((e) => (err = e));
    t.eq("poll: default isFailed still throws the job's message", err && err.message, "boom");
  }

  // ---- L0 additions ----------------------------------------------------------
  {
    const f = stubFetch([{ match: () => true, respond: () => jsonRes(COMPLETION) }]);
    const c = client();
    const out = await withFetch(f, () => c.call("/chat/completions", { body: { messages: [] } }));
    t.eq("call: returns the whole response (model kept)", out.model, "gpt-test");
    t.eq("call: body implies POST", f.calls[0].init.method, "POST");
    await withFetch(f, () => c.call("/joules"));
    t.eq("call: no body implies GET", f.calls[1].init.method, "GET");
    await withFetch(f, () => c.call("/x", { query: { a: 1, b: "", c: undefined, d: "z z" } }));
    t.ok("call: query drops empty values and encodes", f.calls[2].url.endsWith("/x?a=1&d=z+z"));
  }
  {
    const f = stubFetch([{ match: () => true, respond: () => jsonRes({ detail: "slow" }, 429, { "retry-after": "2" }) }]);
    const c = client();
    c.queue.maxRetries = 0;
    let err = null;
    await withFetch(f, () => c.call("/tts/speak", { body: {} })).catch((e) => (err = e));
    t.ok("call: 429 still typed as RateLimitError", err instanceof RateLimitError && err.retryAfter === 2);
    const g = stubFetch([{ match: () => true, respond: () => jsonRes({}, 402) }]);
    err = null;
    await withFetch(g, () => c.call("/x", { body: {}, queue: false })).catch((e) => (err = e));
    t.ok("call: 402 typed, unqueued path too", err instanceof InsufficientCreditsError);
  }
  {
    const chunks = sse([{ model: "m-stream", choices: [{ delta: { content: "a" } }] }, ":keepalive", { model: "other", choices: [{ delta: { content: "b" } }] }, "[DONE]"]);
    const f = stubFetch([{ match: () => true, respond: () => streamRes(chunks) }]);
    const deltas = [];
    const out = await withFetch(f, () => client().chatStreamFull([{ role: "user", content: "x" }], (d) => deltas.push(d), { temperature: 1 }));
    t.eq("chatStreamFull: content + first reported model", out, { content: "ab", model: "m-stream" });
    t.eq("chatStreamFull: deltas", deltas, ["a", "b"]);
    t.eq("chatStreamFull: sends stream:true", JSON.parse(f.calls[0].init.body).stream, true);
    const g = stubFetch([{ match: () => true, respond: () => streamRes(sse([{ choices: [{ delta: { content: "q" } }] }])) }]);
    t.eq("chatStreamFull: no model in chunks -> null", (await withFetch(g, () => client().chatStreamFull([]))).model, null);
  }
  {
    const f = stubFetch([{ match: () => true, respond: () => jsonRes({ transcript: "hi" }) }]);
    const bytes = new Uint8Array([1, 2, 3]);
    const out = await withFetch(f, () => client().sendBytes("/stt/audio", bytes, { query: { encoding: "wav", sample_rate: 16000, language: "en" } }));
    t.eq("sendBytes: parsed response", out.transcript, "hi");
    t.ok("sendBytes: query on the url", f.calls[0].url.endsWith("/stt/audio?encoding=wav&sample_rate=16000&language=en"));
    t.ok("sendBytes: raw body, octet-stream", f.calls[0].init.body === bytes && f.calls[0].init.headers["Content-Type"] === "application/octet-stream");
    t.eq("sendBytes: bearer", f.calls[0].init.headers.Authorization, "Bearer k");
  }
  {
    const f = stubFetch([{ match: () => true, respond: () => streamRes([new Uint8Array([9, 8])]) }]);
    const res = await withFetch(f, () => client().openStream("/tts/stream", { text: "x", audio_format: "mp3" }));
    const r = await res.body.getReader().read();
    t.eq("openStream: body handed back unread", Array.from(r.value), [9, 8]);
    const g = stubFetch([{ match: () => true, respond: () => jsonRes({}, 500) }]);
    let err = null;
    await withFetch(g, () => client().openStream("/tts/stream", {})).catch((e) => (err = e));
    t.ok("openStream: non-2xx throws", err && /500/.test(err.message));
  }
  {
    let n = 0;
    const f = stubFetch([{ match: () => true, respond: () => jsonRes({ status: ++n < 3 ? "processing" : "completed" }) }]);
    const seen = [];
    await withFetch(f, () => client().jobs.poll("/j", { intervalMs: 1, onTick: (s) => seen.push(s.status) }));
    t.eq("poll: onTick sees every status", seen, ["processing", "processing", "completed"]);
    const ac = new AbortController();
    const g = stubFetch([{ match: () => true, respond: () => jsonRes({ status: "processing" }) }]);
    let err = null;
    const p = withFetch(g, () => client().jobs.poll("/j", { intervalMs: 50, signal: ac.signal })).catch((e) => (err = e));
    setTimeout(() => ac.abort(), 5);
    await p;
    t.eq("poll: abort rejects with AbortError", err && err.name, "AbortError");
  }

  // ---- L1: the modality table ------------------------------------------------
  for (const m of MODALITIES) {
    const v = defaultValues(m);
    t.ok(`table ${m.id}: every field has a default`, flatFields(m).every((f) => f.k in v));
    t.ok(`table ${m.id}: has request/summary/output`, [m.request, m.summary, m.output].every((f) => typeof f === "function"));
  }
  {
    const chat = MODALITY_BY_ID.chat;
    const v = defaultValues(chat);
    let err = null;
    try { chat.request(v); } catch (e) { err = e; }
    t.ok("chat: empty conversation refused before sending", err && /empty/.test(err.message));
    v.turns = [{ role: "system", content: "Be terse." }, { role: "user", content: "hi" }, { role: "assistant", content: "  " }];
    v.stream = false;
    v.max_tokens = "200";
    v.json = true;
    const req = chat.request(v);
    t.eq("chat: blank turns dropped", req.body.messages.length, 2);
    t.eq("chat: whole reply is a json call", [req.kind, req.path, req.body.stream], ["json", "/chat/completions", undefined]);
    t.eq("chat: numbers and JSON mode", [req.body.max_tokens, req.body.temperature, req.body.response_format.type], [200, 1, "json_object"]);
    v.stream = true;
    v.max_tokens = "";
    v.tools = '[{"type":"function","function":{"name":"f"}}]';
    const s = chat.request(v);
    t.eq("chat: streamed", [s.kind, s.body.stream, "max_tokens" in s.body], ["chat-stream", true, false]);
    t.eq("chat: tools parsed", s.body.tools[0].function.name, "f");
    v.tools = "{";
    err = null;
    try { chat.request(v); } catch (e) { err = e; }
    t.ok("chat: bad tools JSON refused", err && /Tools/.test(err.message));
    v.tools = "{}";
    err = null;
    try { chat.request(v); } catch (e) { err = e; }
    t.ok("chat: tools must be an array", err && /array/.test(err.message));
    v.tools = "";
    const sum = chat.summary(v);
    t.ok("chat: summary keys are value keys (so compare can diff them)", Object.keys(sum).every((k) => k in v));
    t.ok("chat: summary names the last turn", sum.turns.startsWith("2 turns") && sum.turns.includes("hi"));
    const out = chat.output({ model: "m", choices: [{ message: { content: "yo", tool_calls: [{ id: 1 }] } }] });
    t.eq("chat: output text + tool calls", [out.type, out.text, out.toolCalls.length], ["text", "yo", 1]);
    t.eq("chat: reported model", chat.reported({ model: "gpt-x" }), "gpt-x");
    t.eq("chat: no model reported", chat.reported({}), null);
    const next = chat.continueFrom({ values: v, output: { text: "yo" } });
    t.eq("chat: Continue = conversation + reply + empty user turn",
      next.turns.map((m) => [m.role, m.content]),
      [["system", "Be terse."], ["user", "hi"], ["assistant", "yo"], ["user", ""]]);
    t.ok("chat: Continue does not mutate the run's values", v.turns.length === 3);
  }
  {
    const embed = MODALITY_BY_ID.embed;
    const v = defaultValues(embed);
    v.input = "a\n\n b ";
    v.model = " text-embedding-3-small ";
    v.dimensions = "256";
    const req = embed.request(v);
    t.eq("embed: lines become an array, model trimmed, dims numeric", req.body, { input: ["a", "b"], model: "text-embedding-3-small", dimensions: 256 });
    v.input = "one";
    v.model = "";
    v.dimensions = "";
    t.eq("embed: one line is a string, blanks omitted", embed.request(v).body, { input: "one" });
    v.input = "a\nb";
    const out = embed.output({ data: [{ index: 1, embedding: [3, 4] }, { index: 0, embedding: Array(20).fill(0.5) }] }, v);
    t.eq("embed: vectors carry text by index, length and head",
      out.vectors.map((x) => [x.text, x.length, x.head.length]), [["b", 2, 2], ["a", 20, 8]]);
  }

  // ---- L1: the run store and its rules ---------------------------------------
  {
    const store = createRunStore();
    const seen = [];
    store.onChange((r) => seen.push(r && r.id));
    const a = store.add({ mod: "chat", values: {} });
    const b = store.add({ mod: "embed", values: {} });
    store.add({ mod: "chat", values: {} });
    t.eq("store: ids increase, newest first, filtered", store.list("chat").map((r) => r.id), [3, 1]);
    store.update(a.id, { status: "done" });
    t.eq("store: update bumps ver", store.get(a.id).ver, 1);
    t.eq("store: running", store.running().map((r) => r.id), [2, 3]);
    store.clear("chat");
    t.eq("store: clear keeps running runs", store.list("chat").map((r) => r.id), [3]);
    t.ok("store: emits on every change", seen.length === 5 && b.id === 2);
  }
  {
    t.eq("ident: reported beats label", ident({ reported: "gpt-x", label: "mine" }), { text: "gpt-x", source: "reported", cls: "" });
    t.eq("ident: TTS provider", ident({ reported: "kokoro", reportedKind: "provider", voice: "V" }).source, "reported provider");
    t.eq("ident: label", ident({ label: "Seedream" }), { text: "Seedream", source: "your label", cls: "lab" });
    t.eq("ident: voice sent", ident({ voice: "Marcus" }).text, "voice: Marcus");
    t.eq("ident: nothing", ident({}).text, "(not reported)");
  }
  {
    const r1 = { values: { prompt: "a", t: 1, turns: [{ c: 1 }] }, reported: "m1" };
    const r2 = { values: { prompt: "a", t: 2, turns: [{ c: 2 }] }, reported: "m1" };
    t.eq("diff: differing values, deep", [...diffKeys([r1, r2])].sort(), ["t", "turns"]);
    t.ok("diff: model when names differ", diffKeys([r1, { ...r1, reported: null, label: "L" }]).has("model"));
    t.eq("diff: one run diffs nothing", diffKeys([r1]).size, 0);
  }
  {
    const L = createJoulesLedger();
    L.begin(1);
    L.setStart(1, 100);
    t.eq("joules: lone run is the balance delta", L.end(1, 97), 3);
    L.begin(2);
    L.begin(3); // overlaps 2
    L.setStart(2, 90);
    L.setStart(3, 90);
    t.eq("joules: overlapped run -> null", L.end(2, 80), null);
    t.eq("joules: the other one too", L.end(3, 80), null);
    L.begin(4);
    t.eq("joules: missing start balance -> null", L.end(4, 70), null);
    L.begin(5);
    L.setStart(5, null);
    t.eq("joules: failed balance read -> null", L.end(5, 70), null);
    t.eq("joules: window closed", L.openCount, 0);
  }
  {
    const b64 = "A".repeat(1000);
    const r = shortenForRaw({ data: b64, text: "hello", vec: Array(100).fill(1), nested: [{ image: b64 }] });
    t.ok("raw: base64 shortened with its length", r.data.includes("1000 chars base64") && r.data.length < 100);
    t.eq("raw: text kept", r.text, "hello");
    t.ok("raw: long vectors shortened", r.vec.includes("100 numbers"));
    t.ok("raw: nested", r.nested[0].image.includes("base64"));
    t.eq("formatMs", [formatMs(1234), formatMs(125000), formatMs(undefined)], ["1.2s", "2m 05s", "—"]);
  }

  // ---- L2: audio bytes -------------------------------------------------------
  {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5, 2]), 16000);
    const dv = new DataView(wav.buffer);
    const tag = (o) => String.fromCharCode(...wav.slice(o, o + 4));
    t.eq("wav: RIFF/WAVE/fmt/data tags", [tag(0), tag(8), tag(12), tag(36)], ["RIFF", "WAVE", "fmt ", "data"]);
    t.eq("wav: PCM mono 16-bit at the given rate", [dv.getUint16(20, true), dv.getUint16(22, true), dv.getUint32(24, true), dv.getUint16(34, true)], [1, 1, 16000, 16]);
    t.eq("wav: sizes", [wav.length, dv.getUint32(4, true), dv.getUint32(40, true)], [54, 46, 10]);
    t.eq("wav: samples clamped and scaled", [1, 2, 3, 4, 5].map((i) => dv.getInt16(42 + i * 2, true)), [0, 32767, -32768, 16383, 32767]);
    const pcm = new Uint8Array(new Int16Array([0, 16384, -16384]).buffer);
    const pw = pcmToWav(pcm, 24000);
    const pdv = new DataView(pw.buffer);
    t.eq("pcm: wrapped at its rate, samples kept", [pdv.getUint32(24, true), pdv.getInt16(46, true), pdv.getInt16(48, true)], [24000, 16383, -16384]);
    t.eq("mono: channels averaged", Array.from(toMono([new Float32Array([1, 0]), new Float32Array([0, 1])])), [0.5, 0.5]);
    const ctx = {
      decodeAudioData: async (buf) => ({
        numberOfChannels: 2, sampleRate: 16000, duration: 0.25,
        getChannelData: (c) => new Float32Array(4000).fill(c ? 0.5 : 0),
        _len: buf.byteLength,
      }),
    };
    const src = new Uint8Array([1, 2, 3]);
    const dec = await decodeToWav(src, ctx);
    t.eq("decodeToWav: mono WAV at the context rate", [dec.sampleRate, dec.seconds, dec.wav.length], [16000, 0.25, 44 + 8000]);
    t.eq("decodeToWav: input not detached", src.length, 3);
    t.eq("guessEncoding", [guessEncoding("a.MP3"), guessEncoding("x.webm"), guessEncoding("y", "audio/wav"), guessEncoding("z.m4a"), guessEncoding("q", "video/x")], ["mp3", "opus", "wav", "mp4", null]);
    t.eq("base64ToBytes, data URI too", [Array.from(base64ToBytes("AQID")), Array.from(base64ToBytes("data:audio/mpeg;base64,AQID"))], [[1, 2, 3], [1, 2, 3]]);
    t.eq("concatBytes", Array.from(concatBytes([new Uint8Array([1]), new Uint8Array([2, 3])])), [1, 2, 3]);
  }

  // ---- L2: TTS and STT rows --------------------------------------------------
  {
    const tts = MODALITY_BY_ID.tts;
    const v = defaultValues(tts);
    let err = null;
    try { tts.request(v); } catch (e) { err = e; }
    t.ok("tts: empty text refused", err && /empty/.test(err.message));
    v.text = " Move up. ";
    const bare = tts.request(v);
    t.eq("tts: whole, no voices or instructions", [bare.kind, bare.path, bare.body], ["json", "/tts/speak", { text: "Move up.", speed: 1, audio_format: "mp3" }]);
    v.voices = [{ id: "a", name: "Aria" }, { id: "m", name: "Marcus" }];
    v.instructions = "Tense";
    v.stream = true;
    const st = tts.request(v);
    t.eq("tts: stream path, voice ids, instructions", [st.kind, st.path, st.body.voice_ids, st.body.advanced_voice.instructions], ["tts-stream", "/tts/stream", ["a", "m"], "Tense"]);
    v.format = "ogg";
    err = null;
    try { tts.request(v); } catch (e) { err = e; }
    t.ok("tts: stream refuses formats other than mp3/wav", err && /mp3 and wav/.test(err.message));
    v.stream = false;
    t.eq("tts: voice sent names the mix", tts.voiceSent(v), "Aria + Marcus");
    t.eq("tts: reports a provider", tts.reportedKind, "provider");
    const out = tts.output({ data: "AQID", style_outcome: { provider: "kokoro", fidelity: "dropped" } }, v);
    t.eq("tts: output bytes, mime, fidelity", [Array.from(out.bytes), out.mime, out.instructions], [[1, 2, 3], "audio/ogg", "dropped"]);
    t.eq("tts: reported provider", tts.reported({ style_outcome: { provider: "kokoro" } }), "kokoro");
    t.eq("tts: nothing reported without style_outcome", tts.reported({ data: "" }), null);
    v.format = "mp3";
    const so = tts.output({ _streamBytes: new Uint8Array([9]), _playback: "progressive", _ttfb: 120 }, v);
    t.eq("tts: streamed output", [so.streamed, so.playback, so.ttfb, so.instructions], [true, "progressive", 120, "not reported"]);
    v.format = "pcm";
    v.instructions = "";
    const po = tts.output({ data: "AAAAAA==" }, v);
    t.ok("tts: pcm becomes playable WAV, no instructions note", po.mime === "audio/wav" && po.bytes.length === 44 + 4 && !("instructions" in po));
    t.ok("tts: summary keys are value keys", Object.keys(tts.summary(v)).every((k) => k in v));
  }
  {
    const stt = MODALITY_BY_ID.stt;
    const v = defaultValues(stt);
    let err = null;
    try { stt.request(v); } catch (e) { err = e; }
    t.ok("stt: no audio refused", err && /No audio/.test(err.message));
    v.audio = { source: "run #3", name: "run-3.mp3", bytes: new Uint8Array(100), encoding: "wav", sampleRate: 16000, seconds: 1.5, reencoded: true };
    const req = stt.request(v);
    t.eq("stt: raw bytes with encoding/rate/language query", [req.kind, req.path, req.bytes.length, req.query], ["bytes", "/stt/audio", 100, { encoding: "wav", sample_rate: 16000, language: "en-US" }]);
    t.ok("stt: Raw describes the WAV sent and its source", req.body.body.includes("re-encoded from run #3"));
    v.audio = { source: "clip.xyz", name: "clip.xyz", bytes: new Uint8Array(5), encoding: null, reencoded: false };
    err = null;
    try { stt.request(v); } catch (e) { err = e; }
    t.ok("stt: undecodable with no guess refused", err && /could not decode/.test(err.message));
    const out = stt.output({ transcript: "hi", confidence: 0.9, duration: 1, words: [{ word: "hi" }] });
    t.eq("stt: output", [out.type, out.transcript, out.words.length], ["transcript", "hi", 1]);
    t.eq("stt: reports nothing", stt.reported, undefined);
  }
  {
    const a = { values: { audio: { bytes: new Uint8Array(5000).fill(1) } } };
    const b = { values: { audio: { bytes: new Uint8Array(5000).fill(2) } } };
    t.ok("valueKey: bytes keyed without serialising them", valueKey(a.values).length < 80);
    t.ok("diff: different audio differs", diffKeys([a, b]).has("audio"));
    t.eq("diff: same audio does not", diffKeys([a, { values: { audio: { bytes: new Uint8Array(5000).fill(1) } } }]).size, 0);
  }
}
