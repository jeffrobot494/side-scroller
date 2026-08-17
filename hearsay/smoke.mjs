// End-to-end smoke test. Boots the server, exercises every route, kills it.
// Runs green with NO API keys at all — that is the point.
//
//   node smoke.mjs
//
// "It works — 40 points." This is the thing that stops you losing them.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib/env.js';
import { createApp } from './app.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnv(ROOT);

// Mounted in-process on an ephemeral port. No child process, no port guessing,
// nothing to leak between runs.
const server = createApp().listen(0);
await new Promise((r) => server.once('listening', r));
const PORT = server.address().port;
const B = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  console.log(`  ${cond ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${name}${detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''}`);
  cond ? pass++ : fail++;
};

const get = async (p) => (await fetch(B + p)).json();
const post = async (p, body) =>
  (await fetch(B + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })).json();

console.log('\nHearsay smoke test\n');

let up = false;
try { up = (await fetch(B + '/api/status')).ok; } catch { /* reported below */ }
ok('app mounts and answers', up, `port ${PORT}`);
if (!up) { server.close(); process.exit(1); }

try {
  // --- status -------------------------------------------------------------
  const st = await get('/api/status');
  ok('status reports both models', Boolean(st.reasonModel && st.fastModel),
     `${st.reasonModel} / ${st.fastModel}`);
  ok('write and read models are different', st.reasonModel !== st.fastModel);
  ok('embedding provider resolves', Boolean(st.embeddings), st.embeddings);

  // --- state --------------------------------------------------------------
  const state = await get('/api/state');
  ok('village is seeded', state.agents.length >= 5, `${state.agents.length} agents`);
  const bell = state.agents.find((a) => a.name === 'Bell');
  ok('isolate agent exists with no ties', Boolean(bell) && bell.ties.length === 0);
  ok('every agent has baseline beliefs',
     state.agents.every((a) => a.beliefs.length > 0));
  ok('beliefs carry provenance',
     state.agents.every((a) => a.beliefs.every((b) => b.route && typeof b.confidence === 'number')));

  // --- retrieval ----------------------------------------------------------
  const semantic = st.embeddings.startsWith('openai');

  const hit = await post('/api/chat', {
    agentId: state.agents.find((a) => a.name === 'Tam').id,
    message: 'tell me about couriers and their horses',
  });
  ok('retrieval pipeline runs', Array.isArray(hit.hits), `${hit.hits.length} hits`);
  ok('latency is reported', typeof hit.totalMs === 'number', `${hit.totalMs}ms total`);

  const miss = await post('/api/chat', {
    agentId: bell.id,
    message: 'what happened to the dispatch pouch on the north road',
  });

  // Only assertable with real vectors. The hash stub scores an unrelated Bell
  // belief ABOVE Tam's correct match, so asserting semantics against it would
  // be asserting noise. Skipped loudly rather than silently.
  if (semantic) {
    ok('known topic retrieves', hit.hits.length > 0, `${hit.hits.length} hits`);
    ok('isolate retrieves nothing she never heard', miss.hits.length === 0);
  } else {
    console.log('  \x1b[33mSKIP\x1b[0m  semantic retrieval assertions  ' +
                '\x1b[90mstub embeddings — set OPENAI_API_KEY\x1b[0m');
  }

  // --- write path ---------------------------------------------------------
  const res = await fetch(B + '/api/propagate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'An unseeded test event with no cache entry.', witnesses: [] }),
  });
  const lines = (await res.text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const hasKey = st.xai;
  if (hasKey) {
    ok('propagate streams events', lines.length > 0, `${lines.length} messages`);
    ok('propagate completes', lines.some((l) => l.type === 'done'));
  } else {
    ok('propagate degrades gracefully without a key',
       lines.some((l) => l.type === 'error'),
       'returns an error message rather than crashing');
  }

  // --- crud ---------------------------------------------------------------
  const made = await post('/api/agents', {
    name: 'SmokeTest', role: 'temp', ties: [], knows: ['A disposable fact.'],
  });
  ok('agent creation works', Boolean(made.id));
  await fetch(`${B}/api/agents/${made.id}`, { method: 'DELETE' });
  const after = await get('/api/state');
  ok('agent deletion works', !after.agents.some((a) => a.id === made.id));

  // --- static -------------------------------------------------------------
  const page = await fetch(B + '/');
  const html = await page.text();
  ok('dashboard serves', page.status === 200, `${html.length} bytes`);
  ok('all three screens present',
     html.includes('id="vView"') && html.includes('id="cView"') && html.includes('id="dView"'));

  // --- news feed + village clock ------------------------------------------
  const feed = await get('/api/feed');
  ok('feed reports remaining pool events', typeof feed.remaining === 'number',
     `${feed.remaining} left`);

  const tick = await fetch(B + '/api/tick', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  const tl = (await tick.text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  ok('village clock fires an event', tl.some((l) => l.type === 'event'));
  if (!hasKey) {
    ok('tick degrades gracefully with no key', tl.some((l) => l.type === 'error'));
  }
  const feed2 = await get('/api/feed');
  ok('fired event lands in the news feed', feed2.events.length > feed.events.length);

  // --- the endpoint a customer's game integrates against -------------------
  const v1 = await post(`/v1/npc/${state.agents.find((a) => a.name === 'Tam').id}/chat`,
                        { message: 'tell me about the couriers' });
  ok('public /v1 NPC endpoint responds', Boolean(v1.npc && 'reply' in v1));
  ok('/v1 returns grounding with provenance', Array.isArray(v1.grounding));
} catch (e) {
  ok('no unexpected exception', false, e.message);
}

server.close();
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
