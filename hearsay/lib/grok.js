const BASE = 'https://api.x.ai/v1';

export const MODELS = {
  // Write path. Reasoning cannot be disabled on grok-4-6; TTFT is 30s+ at high
  // effort. That is fine here because nothing human-facing is blocked on it.
  get reason() { return process.env.GROK_REASON_MODEL || 'grok-4-6'; },
  // Read path. Sub-second. A player will not wait 30s for a guard to answer.
  get fast() { return process.env.GROK_FAST_MODEL || 'grok-4-fast-non-reasoning'; },
};

export function hasKey() {
  return Boolean(process.env.XAI_API_KEY);
}

function authHeaders() {
  if (!process.env.XAI_API_KEY) {
    throw new Error('XAI_API_KEY missing. Copy .env.example to .env and add your key.');
  }
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${process.env.XAI_API_KEY}`,
  };
}

/** Non-streaming completion. Returns text plus measured latency. */
export async function chat({ model, messages, temperature = 0.7, max_tokens = 1024, reasoning_effort }) {
  const body = { model, messages, temperature, max_tokens };
  if (reasoning_effort) body.reasoning_effort = reasoning_effort;

  const t0 = Date.now();
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`xAI ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const j = await r.json();
  return {
    text: j.choices?.[0]?.message?.content ?? '',
    usage: j.usage ?? null,
    ms: Date.now() - t0,
  };
}

/**
 * Streaming completion that surfaces reasoning deltas separately from content.
 * This is what makes Grok 4.6's work visible in the dashboard — the whole
 * counter to "you just wrapped an API".
 *
 * onEvent({ type: 'reasoning' | 'content', text })
 */
export async function chatStream(
  { model, messages, temperature = 0.4, max_tokens = 8192, reasoning_effort },
  onEvent,
) {
  const body = { model, messages, temperature, max_tokens, stream: true };
  if (reasoning_effort) body.reasoning_effort = reasoning_effort;

  const t0 = Date.now();
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`xAI ${r.status}: ${(await r.text()).slice(0, 400)}`);

  let content = '';
  let reasoning = '';
  let firstTokenMs = null;
  let buf = '';
  const dec = new TextDecoder();

  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let j;
      try { j = JSON.parse(payload); } catch { continue; }
      const d = j.choices?.[0]?.delta;
      if (!d) continue;

      // xAI has used both spellings across versions; accept either.
      const rd = d.reasoning_content ?? d.reasoning ?? '';
      if (rd) {
        if (firstTokenMs === null) firstTokenMs = Date.now() - t0;
        reasoning += rd;
        onEvent?.({ type: 'reasoning', text: rd });
      }
      if (d.content) {
        if (firstTokenMs === null) firstTokenMs = Date.now() - t0;
        content += d.content;
        onEvent?.({ type: 'content', text: d.content });
      }
    }
  }

  return { content, reasoning, ms: Date.now() - t0, firstTokenMs };
}

/** Models love to wrap JSON in fences. Dig it out without being precious. */
export function parseJson(text) {
  let s = String(text || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const start = s.search(/[{[]/);
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch { /* fall through */ }
  }
  throw new Error(`Could not parse JSON from model output: ${s.slice(0, 200)}`);
}
