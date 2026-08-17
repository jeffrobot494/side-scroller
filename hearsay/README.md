# Hearsay

**NPC knowledge management as a service.** A game studio defines its cast; we
decide what each character knows, how they learned it, and how wrong they got
it. The studio hits one endpoint per NPC and stops maintaining dialogue trees.

```
POST /v1/npc/:id/chat   { "message": "what happened on the north road?" }
→ { "reply": "...", "latencyMs": 480, "grounding": [ { belief, confidence, route, distortion } ] }
```

## The architecture, and why it is two models

| Path | Trigger | Model | Latency | Job |
|---|---|---|---|---|
| **Write** | A world event fires | `grok-4-6` | 20–40s | Reason about who learns it, by what route, how distorted |
| **Read** | A player talks to an NPC | `grok-4-fast-non-reasoning` | sub-second | Speak, using only what the write path granted |

Reasoning cannot be disabled on `grok-4-6` and its time-to-first-token is 30s+.
That is fatal on the read path and free on the write path, because no human is
waiting. Splitting them is the whole design.

**Grok 4.6 is load-bearing:** delete it and every NPC knows everything the
moment it happens, with no provenance, no distortion, and no way to stop the
blacksmith reciting the plot twist. It is not summarising text — it is deciding
the epistemic state of the world.

## Run it

```bash
npm install
cp .env.example .env      # add XAI_API_KEY, and OPENAI_API_KEY — see below
npm run seed              # builds the demo village
npm start                 # → http://localhost:3000
npm run smoke             # end-to-end check, 17 assertions
```

Boots with no keys at all (stub embeddings + cached propagations) so a dead
venue wifi cannot take the demo down.

## ⚠️ You need an OpenAI key for retrieval to mean anything

xAI exposes no embeddings endpoint, so vectors come from elsewhere. The built-in
hash stub is a placeholder, and `scores.mjs` proves it is not good enough:

```
Bell   0.361  "She trades pelts at the village market…"     ← WRONG, and highest
Tam    0.359  "He can recognise the couriers by their horses" ← RIGHT, and lower
```

A false match outscoring a true one means no threshold separates them. Set
`OPENAI_API_KEY` and `text-embedding-3-small` runs through the same
`lib/embed.js` seam with no other change.

## Files

| | |
|---|---|
| `lib/propagate.js` | **The Grok 4.6 call.** Prompt, streaming, cache, belief writes |
| `lib/chat.js` | Read path — retrieve, constrain, speak fast |
| `lib/embed.js` | The provider seam. OpenAI or stub, nothing else knows |
| `lib/store.js` | Agents, beliefs, events, propagation cache |
| `app.js` / `server.js` | Routes / listener, split so tests mount in-process |
| `public/index.html` | Dashboard — roster, event injector + live reasoning, chat |
| `seed.js` | The village |
| `smoke.mjs` | Run this before you record anything |

## The village, and why it is built this way

Five agents with a deliberately uneven social graph.

- **Tam** (stable boy) — witnesses things, describes them vividly, misses what they mean
- **Maren** (innkeeper) — the gossip hub, tied to almost everyone, embellishes
- **Osric** (guard captain) — official channel, sanitises, has a `forbidden` fact he must never admit
- **Sister Ilva** — careful, hedges her sources
- **Bell** (hermit) — **no ties at all.** She exists to prove the system will answer "nobody told her" instead of quietly informing everyone

Bell is the test. A naive RAG NPC system gives her the news.

## Screens

| Screen | What it is |
|---|---|
| **Village** | Portrait grid of the cast + the news feed. "Advance the day ▸" fires the next world event and streams Grok 4.6 routing it. Badge on each portrait = how much they have learned. Click a face to talk |
| **Conversation** | The NPC's face, a chat box, and a sidebar of everything they know — each belief tagged with route, confidence, distortion, and **why Grok decided they know it**. Beliefs used in the last reply light up |
| **Dashboard** | Create and delete NPCs, add and remove facts, set `forbidden` topics |

Portraits are deterministic SVG generated from the name — no asset pipeline, no
image generation, same face every time.

## V1 / V2

**V1 (built).** `lib/events.js` holds a curated pool of six world events. The
village clock (`POST /api/tick`) fires the next one, Grok 4.6 routes it, the
news feed records who it reached. Curated rather than generated so the
propagation cache can be warmed and replayed with no network.

**V2 (not built).** Conversations become events. Threaten an NPC and that
becomes a feed entry Grok reasons about, so the neighbours learn you are
dangerous. The seam is already in place — `store.addEvent` takes
`kind: 'interaction'` and the feed renders it distinctly. What is missing is the
call in `lib/chat.js` that classifies a player turn as noteworthy and enqueues
it. Roughly 30 lines, plus a rule about not re-propagating every "hello".

## Demo script

1. **Village.** Five faces, a quiet feed. Every NPC has 2 baseline beliefs.
2. **Advance the day.** Watch Grok 4.6 reason live in the feed panel. This is
   the shot that answers "is it load-bearing".
3. The portraits update — different badges, uneven spread.
4. **Click Tam.** Vivid, firsthand, misses the significance. Sidebar shows
   `witnessed`, confidence 0.95.
5. **Click Osric.** Sanitised. Sidebar shows `official report`. He will not
   admit the patrol gap — it is in his `forbidden` list.
6. **Click Bell.** "I wouldn't know anything about that." Sidebar is empty of
   the event. *No tie, no channel, no knowledge.* This is the money shot.
7. **Dashboard.** Create an NPC in ten seconds, advance the day again, watch
   them get included.
8. **Show `/v1/npc/:id/chat`.** One endpoint. That is what a studio buys.

Optional ablation: rerun at `reasoning_effort: low` and show routing collapse.

## Known gaps

- No auth or tenancy. `/v1` is open — fine for a demo, obviously not shippable.
- `data.json` is the database. Single process, no concurrency.
- Propagation is one-shot per event; beliefs never decay or get corrected.
- `on.spawn`-style scheduled delivery is not implemented — `delayHours` is
  recorded and displayed but nothing acts on it yet.
