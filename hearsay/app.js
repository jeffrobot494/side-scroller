// The express app, with no listening. Kept separate from server.js so tests
// can mount it in-process instead of spawning a child.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import * as store from './lib/store.js';
import { propagate } from './lib/propagate.js';
import { ask } from './lib/chat.js';
import { MODELS, hasKey } from './lib/grok.js';
import { embedProvider, embed } from './lib/embed.js';
import { nextEvent, poolSize } from './lib/events.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(path.join(ROOT, 'public')));

  /* -------------------------------------------------------------- status */

  app.get('/api/status', (req, res) => {
    res.json({
      xai: hasKey(),
      reasonModel: MODELS.reason,
      fastModel: MODELS.fast,
      effort: process.env.REASONING_EFFORT || 'high',
      embeddings: embedProvider(),
    });
  });

  app.get('/api/state', (req, res) => {
    const db = store.state();
    res.json({
      agents: db.agents.map((a) => ({
        ...a,
        beliefs: store.beliefsFor(a.id).map(({ vec, ...b }) => b),
      })),
      events: db.events,
    });
  });

  /* -------------------------------------------------------------- agents */

  app.post('/api/agents', async (req, res) => {
    try {
      const agent = store.addAgent(req.body);
      const facts = req.body.knows || [];
      if (facts.length) {
        const vecs = await embed(facts);
        facts.forEach((f, i) =>
          store.addBelief({
            agentId: agent.id,
            content: f,
            confidence: 0.95,
            route: 'baseline',
            reasoning: 'Authored directly.',
            vec: vecs[i],
          }),
        );
      }
      res.json(agent);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/agents/:id', (req, res) => {
    store.removeAgent(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/facts', async (req, res) => {
    try {
      const { agentId, content, confidence } = req.body;
      const vec = await embed(content);
      res.json(store.addBelief({
        agentId,
        content,
        confidence: confidence ?? 0.95,
        route: 'baseline',
        reasoning: 'Authored directly.',
        vec,
      }));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  /* --------------------------------------------------------- propagation */
  /* NDJSON stream so the dashboard renders Grok 4.6's reasoning live.      */

  app.post('/api/propagate', async (req, res) => {
    res.setHeader('content-type', 'application/x-ndjson');
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('x-accel-buffering', 'no');

    const send = (obj) => {
      res.write(JSON.stringify(obj) + '\n');
      res.flush?.();
    };

    try {
      await propagate(
        {
          text: req.body.text,
          location: req.body.location || '',
          witnesses: req.body.witnesses || [],
          effort: req.body.effort,
        },
        send,
      );
    } catch (e) {
      send({ type: 'error', text: e.message });
    }
    res.end();
  });

  /* ---------------------------------------------------------------- chat */
  /* This is the endpoint a customer's game actually integrates against.    */

  app.post('/api/chat', async (req, res) => {
    try {
      res.json(await ask({ agentId: req.body.agentId, message: req.body.message }));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Same thing under the shape a game studio would consume:
  //   POST /v1/npc/:id/chat  { "message": "..." }
  app.post('/v1/npc/:id/chat', async (req, res) => {
    try {
      const r = await ask({ agentId: req.params.id, message: req.body.message });
      res.json({
        npc: req.params.id,
        reply: r.reply,
        latencyMs: r.totalMs,
        grounding: r.hits.map((h) => ({
          belief: h.content,
          confidence: h.confidence,
          route: h.route,
          distortion: h.distortion,
        })),
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  /* ---------------------------------------------------------- news feed */

  app.get('/api/feed', (req, res) => {
    const fired = store.worldEventCount();
    res.json({
      events: [...store.state().events].reverse(),
      fired,
      remaining: Math.max(0, poolSize() - fired),
    });
  });

  app.delete('/api/beliefs/:id', (req, res) => {
    res.json({ ok: store.removeBelief(req.params.id) });
  });

  /* ------------------------------------------------- the village clock */
  /* V1: a periodic game-event function. Fires the next pooled event and    */
  /* streams Grok 4.6 routing it through the population.                    */

  app.post('/api/tick', async (req, res) => {
    res.setHeader('content-type', 'application/x-ndjson');
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('x-accel-buffering', 'no');
    const send = (o) => { res.write(JSON.stringify(o) + '\n'); res.flush?.(); };

    const ev = nextEvent(store.worldEventCount());
    if (!ev) {
      send({ type: 'error', text: 'The event pool is spent. Reset the world to run it again.' });
      return res.end();
    }

    send({ type: 'event', event: ev });
    try {
      await propagate({ ...ev, kind: 'world', effort: req.body?.effort }, send);
    } catch (e) {
      send({ type: 'error', text: e.message });
    }
    res.end();
  });

  /* --------------------------------------------------------------- reset */

  app.post('/api/reset', (req, res) => {
    store.reset();
    res.json({ ok: true });
  });

  return app;
}

export { MODELS, hasKey, embedProvider };
