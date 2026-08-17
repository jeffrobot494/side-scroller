// The swappable seam. Everything in the app calls embed() and nothing else
// knows where vectors come from. Changing provider is a change to this file
// only — which is also what lets the demo run with zero API keys.

const STUB_DIM = 256;

export function embedProvider() {
  return process.env.OPENAI_API_KEY ? 'openai:text-embedding-3-small' : 'stub:hash';
}

export async function embed(input) {
  const list = Array.isArray(input) ? input : [input];
  if (!list.length) return [];
  const vecs = process.env.OPENAI_API_KEY
    ? await openaiEmbed(list)
    : list.map(stubEmbed);
  return Array.isArray(input) ? vecs : vecs[0];
}

async function openaiEmbed(list) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: list }),
  });
  if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// Deterministic hashed bag-of-words. Retrieval works on lexical overlap, which
// is enough to prove the plumbing and demo the loop; it is NOT semantic. Set
// OPENAI_API_KEY to get real vectors through the same function.
function stubEmbed(text) {
  const v = new Array(STUB_DIM).fill(0);
  const words = String(text).toLowerCase().match(/[a-z0-9']+/g) || [];
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) {
      h ^= w.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    v[Math.abs(h) % STUB_DIM] += 1;
  }
  return normalize(v);
}

export function normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Top-k by cosine over {vec, ...} records. */
export function topK(queryVec, records, k = 6) {
  return records
    .map((r) => ({ ...r, score: cosine(queryVec, r.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
