# Hearsay — agent handoff

Read this fully before writing code. It is written for an AI agent joining this
project cold, mid-hackathon, with someone else already working in the repo.

---

## 1. What this is

**NPC knowledge management as a service.** A game studio defines its cast; we
decide what each NPC knows, how they learned it, and how distorted it got. The
studio hits one endpoint per NPC instead of maintaining dialogue trees.

```
POST /v1/npc/:id/chat   { "message": "what happened on the north road?" }
→ { reply, latencyMs, grounding: [ { belief, confidence, route, distortion } ] }
```

The demo dresses this as a medieval village because it is legible in 30 seconds.
**The village is the test case, not the product.** Do not let the fiction pull
the codebase toward being a game.

## 2. Hackathon constraints — these override normal engineering judgment

| Constraint | Consequence |
|---|---|
| Cursor Austin Grok 4.6 Hackathon, submissions close **3:00 PM CT Sat 15 Aug 2026** | Code freezes ~1:45 PM to leave time to record and submit |
| **Grok 4.6 must be load-bearing**, not a wrapper | Never replace the `grok-4-6` write path with something faster to make a test pass |
| **Cursor must be load-bearing** | Work in Cursor. The submission form asks how it was used |
| Judged: **It works 40 / Taste 30 / Business use case 30** | "Does it run" is the single biggest bucket. A working boring thing beats a broken clever thing |
| Everything built during the event | Do not import a pre-existing framework that does the core job |

**If you have to choose between a feature and reliability, choose reliability.**

## 3. The architecture, and the one decision that matters

Two models, two paths. This is the whole design and it is not negotiable.

| Path | Trigger | Model | Latency | Job |
|---|---|---|---|---|
| **Write** | A world event fires | `grok-4-6` | 20–40s | Reason about who learns it, by what route, how distorted |
| **Read** | A player talks to an NPC | `grok-4-fast-non-reasoning` | sub-second | Speak, using only what the write path granted |

**Why:** reasoning cannot be disabled on `grok-4-6` and its time-to-first-token
is 30s+. That is fatal when a player is waiting and free when nobody is. Nothing
on the read path reasons about what an NPC should know — that was already
decided.

**Why Grok 4.6 is load-bearing:** delete it and every NPC instantly knows
everything, with no provenance, no distortion, and no way to stop a character
reciting a plot twist. It is not summarising text. It is deciding the epistemic
state of a world.

## 4. File map

| Path | Role |
|---|---|
| `lib/propagate.js` | **The Grok 4.6 call.** Prompt, streaming, JSON parse, cache, belief writes. The heart of the project |
| `lib/chat.js` | Read path. Retrieve → constrain → speak. Contains the anti-leak system prompt |
| `lib/grok.js` | xAI client. `chat`, `chatStream` (surfaces reasoning deltas), `parseJson` |
| `lib/embed.js` | **The provider seam.** OpenAI or hash-stub. Nothing else knows where vectors come from |
| `lib/store.js` | JSON-file persistence. Agents, beliefs, events, propagation cache |
| `lib/events.js` | V1 world-event pool, fired in order by the village clock |
| `lib/env.js` | Six-line `.env` parser (avoids a dotenv dependency) |
| `app.js` | Express routes. Exports `createApp()`, does not listen |
| `server.js` | Listens. Split from `app.js` so tests mount in-process |
| `public/index.html` | Entire frontend. Three screens, vanilla JS, no build step |
| `seed.js` | The demo village |
| `smoke.mjs` | 21 assertions. **Run before every commit and before recording** |
| `scores.mjs` | Prints raw retrieval scores. Diagnostic only |

## 5. Data model

```js
agent  = { id, name, role, location, persona, ties: [agentId], forbidden: [str] }
belief = { id, agentId, eventId, content, confidence, route, distortion,
           reasoning, vec, at }
event  = { id, text, location, witnesses: [agentId], kind, summary, knownBy, at }
```

- `ties` is the social graph. **It is the channel.** No tie + no proximity = no knowledge.
- `forbidden` is a hard epistemic ceiling. Grok is instructed it may never assign these.
- `route` is provenance: `witnessed`, `told directly by X`, `official report`, `rumor`, `baseline`.
- `distortion`: `none | vague | embellished | inverted | sanitised`. The stored
  `content` holds the **distorted** version, not the truth. That is what makes
  NPCs disagree convincingly.
- `kind`: `world` (village clock) or `interaction` (V2, not yet wired).

## 6. API surface

| Route | Notes |
|---|---|
| `GET /api/status` | Models, embedding provider, whether a key is present |
| `GET /api/state` | Agents with their beliefs (vectors stripped) |
| `GET /api/feed` | News feed + how many pool events remain |
| `POST /api/tick` | **Village clock.** Fires next pooled event, streams NDJSON |
| `POST /api/propagate` | Arbitrary event text, streams NDJSON |
| `POST /api/chat` | Read path. Returns `reply`, `hits`, latency breakdown |
| `POST /v1/npc/:id/chat` | Same thing in customer-facing shape. **This is the product** |
| `POST /api/agents`, `DELETE /api/agents/:id` | Roster CRUD |
| `POST /api/facts`, `DELETE /api/beliefs/:id` | Knowledge CRUD |
| `POST /api/reset` | Wipes the world |

Streaming endpoints emit newline-delimited JSON:
`{type:'status'|'event'|'reasoning'|'content'|'done'|'error', ...}`.

## 7. Run and test

```bash
npm install
cp .env.example .env        # XAI_API_KEY, OPENAI_API_KEY
npm run seed                # build the village
npm start                   # → http://localhost:3000
npm run smoke               # 21 assertions, must be green
```

Boots with **no keys at all** (stub embeddings + cached propagations) so a dead
venue wifi cannot end the demo. Keep it that way.

## 8. ⚠️ What is verified and what is not

**Verified headlessly:** all 21 smoke assertions, every route, both offline
fallbacks, the three screens, retrieval plumbing, CRUD, the village clock.

**NOT verified — assume these are wrong until someone checks:**

| Risk | Where | How to check |
|---|---|---|
| **No code here has ever called the real xAI API** | `lib/grok.js` | Add the key, click "Advance the day" once |
| The JSON shape `grok-4-6` returns may not match the parser | `parseJson` in `lib/grok.js`, `propagate.js` | Same click. Failure will surface as a parse error |
| The reasoning stream field name | `chatStream` accepts both `reasoning_content` and `reasoning` | If the trace pane stays empty but results appear, this is why |
| Nobody has looked at the UI in a browser | `public/index.html` | Open it |

**MEASURED AND TRUE:** the hash-stub embeddings cannot support this product.
Bell scored an unrelated belief at **0.361** against a question she should know
nothing about, beating Tam's correct match at **0.359**. No threshold separates
them. `OPENAI_API_KEY` is effectively required for retrieval to mean anything;
`smoke.mjs` skips the semantic assertions loudly when it is absent.

## 9. Landmines

- **`data.json` is the database.** Single process. `npm run seed` wipes it.
  Anything you want to survive a reseed belongs in `seed.js` or `lib/events.js`.
- **The propagation cache keys on exact event text.** Change a pooled event's
  wording and you invalidate its warm cache. Do not reword events after warming.
- **Read `process.env` lazily**, never at module top level — `.env` is parsed
  after the import graph resolves. There is a comment on this in `lib/chat.js`.
  A top-level `const X = process.env.Y` will silently read `undefined`.
- **`server.js` uses `process.stdout.write`, not `console.log`.** When stdout is
  a pipe Node buffers it, and a server killed before flush looks like one that
  never started. This cost 20 minutes once.
- **Do not add dependencies.** `express` is the only one. No build step, no
  bundler, no framework. The frontend is one file of vanilla JS on purpose.
- **Portraits are deterministic SVG from the name hash.** No assets, no image
  generation. Same name always yields the same face.

## 10. The village, and why Bell exists

| NPC | Role in the demo |
|---|---|
| **Tam** | Stable boy. Witnesses things, describes them vividly, misses what they mean |
| **Maren** | Innkeeper. Gossip hub, tied to nearly everyone, embellishes |
| **Osric** | Guard captain. Official channel, sanitises, has a `forbidden` fact |
| **Sister Ilva** | Careful, hedges her sources |
| **Bell** | Hermit. **No ties at all** |

**Bell is the test.** A naive RAG NPC system gives her the news because it is in
the vector store. Hearsay must answer "nobody told her." If a change makes Bell
knowledgeable, the change is wrong. Her refusal is the strongest moment in the
demo — protect it.

## 11. Scope

**V1 — built.** `lib/events.js` holds six curated world events. `POST /api/tick`
fires the next, Grok 4.6 routes it, the feed records who it reached. Curated
rather than generated so the cache can be warmed and replayed offline.

**V2 — seam in place, not wired.** Player interactions become feed events:
threaten an NPC and the neighbours learn you are dangerous. `store.addEvent`
already accepts `kind: 'interaction'` and the feed renders it distinctly.
Missing: a classifier in `lib/chat.js` deciding a turn was noteworthy, plus a
rule preventing every "hello" from triggering a 30-second propagation. **~30
lines. Do not start it unless the real-API path is confirmed working and there
is more than an hour left.**

## 12. Rules for whoever picks this up

1. **Run `npm run smoke` before and after every change.** 21 green or you broke something.
2. **Do not rebuild what exists.** The backend is done. If something seems missing, grep before writing.
3. **Do not weaken the two-model split** to make anything faster or simpler.
4. **Do not make Bell knowledgeable.**
5. **Do not add dependencies or a build step.**
6. **Coordinate on files.** The two hot files are `lib/propagate.js` (prompt
   tuning) and `public/index.html` (UI). Two agents in either at once will collide.
7. **Prompt changes are the highest-leverage and highest-risk edits.** The
   propagation prompt in `lib/propagate.js` has never met the real model. Expect
   it to need a pass. Change one thing at a time and re-run a real propagation.
8. **If you are unsure whether something is design or engineering, it is
   engineering.** Build it and show it, do not write a document about it.

## 13. Demo script — do not break these steps

1. Village. Five faces, quiet feed, 2 baseline beliefs each.
2. Advance the day → Grok 4.6 reasons live in the feed panel.
3. Portraits update with uneven badges.
4. Click Tam → vivid, firsthand, `witnessed`.
5. Click Osric → sanitised, `official report`, will not admit the patrol gap.
6. Click Bell → "I wouldn't know anything about that." **The money shot.**
7. Dashboard → create an NPC, advance again, watch them get included.
8. Show `/v1/npc/:id/chat`. One endpoint. That is what a studio buys.

Optional: rerun at `reasoning_effort: low` and show routing quality collapse.
That is the live ablation proving Grok 4.6 is doing real work.
