// Player2 Lab (tech/player2-lab.md). No live API: fetch is stubbed.
// L0: the client's additive calls, and the return shapes of chat/chatStream/
// poll that the game relies on and nothing else pinned.
import { Player2Client, RateLimitError, InsufficientCreditsError } from "../src/player2/client.js";

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
}
