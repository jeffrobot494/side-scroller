// THE LOAD-BEARING GROK 4.6 CALL.
//
// Given a world event and a roster of agents, decide for each agent:
//   does this reach them, by what route, how distorted, how confident.
//
// This is a reasoning problem, not a retrieval problem. It requires holding the
// whole social graph, geography and motive at once and simulating transmission.
// A fast model produces flat, uniform, implausible answers here — which is the
// ablation to show a judge (run it at reasoning_effort "low" vs "xhigh").

import { MODELS, chatStream, parseJson, hasKey } from './grok.js';
import { embed } from './embed.js';
import * as store from './store.js';

const SYSTEM = `You are the continuity engine for a simulated world.

Your job is EPISTEMIC ROUTING: given an event, decide which agents come to know
about it, how they learned it, how the account distorted in transit, and how
confident each one is.

Reason carefully about:
- Proximity. Who was physically present or nearby?
- The social graph. Information moves along ties, not uniformly. A tie is a
  channel; no tie means no channel.
- Route fidelity. Official channels stay accurate but arrive slower and sanitised.
  Gossip arrives fast and mutates. Secondhand accounts lose specifics and gain
  embellishment. Thirdhand accounts routinely invert a key detail.
- Motive. Some agents suppress, exaggerate, or reframe to protect themselves.
- Isolation. An agent with no ties and no proximity learns NOTHING. This is a
  correct and important answer. Do not be generous.

HARD RULES
- If an agent has a "forbidden" topic that this event touches, they must not
  know it. Set knows=false and say why in reasoning.
- Do not give every agent knowledge. Uneven distribution is the point.
- The "belief" field is what that agent thinks is true, in their own voice and
  vocabulary. If the account distorted, the belief must contain the DISTORTED
  version, not the truth. This is what makes them disagree convincingly.

Return ONLY JSON, no prose, in exactly this shape:
{
  "assignments": [
    {
      "agentId": "string",
      "knows": true,
      "route": "witnessed | told directly by <name> | overheard | official report | rumor | none",
      "hopCount": 0,
      "delayHours": 0,
      "distortion": "none | vague | embellished | inverted | sanitised",
      "confidence": 0.0,
      "belief": "what this agent believes, first person, one or two sentences",
      "reasoning": "one sentence: why they did or did not learn it, and why it changed"
    }
  ],
  "summary": "one sentence on how this event moved through the population"
}`;

function buildUserPrompt(event, agents) {
  const roster = agents.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    location: a.location,
    ties: a.ties.map((t) => {
      const other = agents.find((x) => x.id === t);
      return other ? other.name : t;
    }),
    forbidden: a.forbidden,
  }));

  return `AGENT ROSTER
${JSON.stringify(roster, null, 2)}

EVENT
${JSON.stringify({
    text: event.text,
    location: event.location,
    witnesses: event.witnesses.map((w) => agents.find((a) => a.id === w)?.name || w),
  }, null, 2)}

Produce one assignment object for EVERY agent id in the roster, including the
ones who learn nothing. Return only the JSON object.`;
}

/**
 * Runs the propagation. `onEvent` receives streaming progress so the dashboard
 * can show Grok 4.6 thinking:
 *   { type: 'reasoning' | 'content' | 'status' | 'done' | 'error', ... }
 */
export async function propagate(eventInput, onEvent) {
  const agents = store.state().agents;
  if (!agents.length) throw new Error('No agents defined. Run `npm run seed` first.');

  const event = store.addEvent(eventInput);
  // Per-request effort is what makes the live ablation possible: run the same
  // event at "low" and at "xhigh" and show the routing quality collapse.
  const effort = eventInput.effort || process.env.REASONING_EFFORT || 'high';

  // --- cached / offline path -------------------------------------------
  const cached = store.readCache(event.text);
  const canCall = hasKey();

  if (cached && (process.env.USE_CACHE === '1' || !canCall)) {
    onEvent?.({
      type: 'status',
      text: canCall
        ? 'Replaying cached propagation (USE_CACHE=1).'
        : 'No XAI_API_KEY — replaying cached propagation so the demo still runs.',
    });
    if (cached.reasoning) onEvent?.({ type: 'reasoning', text: cached.reasoning });
    const applied = await applyAssignments(event, cached.assignments, agents);
    store.annotateEvent(event.id, {
      summary: cached.summary,
      knownBy: applied.filter((a) => a.knows).length,
    });
    onEvent?.({ type: 'done', event, applied, summary: cached.summary, cached: true, ms: 0 });
    return { event, applied, summary: cached.summary, cached: true };
  }

  if (!canCall) {
    throw new Error('No XAI_API_KEY and no cached propagation for this event. Add a key, or use one of the seeded demo events.');
  }

  onEvent?.({
    type: 'status',
    text: `${MODELS.reason} · reasoning_effort=${effort} · routing ${agents.length} agents. First token typically 20-40s.`,
  });

  const res = await chatStream(
    {
      model: MODELS.reason,
      reasoning_effort: effort,
      temperature: 0.5,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildUserPrompt(event, agents) },
      ],
    },
    onEvent,
  );

  let parsed;
  try {
    parsed = parseJson(res.content);
  } catch (e) {
    onEvent?.({ type: 'error', text: e.message });
    throw e;
  }

  const assignments = parsed.assignments || [];
  store.writeCache(event.text, {
    assignments,
    summary: parsed.summary || '',
    reasoning: res.reasoning,
    model: MODELS.reason,
    effort,
    ms: res.ms,
  });

  const applied = await applyAssignments(event, assignments, agents);
  store.annotateEvent(event.id, {
    summary: parsed.summary || '',
    knownBy: applied.filter((a) => a.knows).length,
  });

  onEvent?.({
    type: 'done',
    event,
    applied,
    summary: parsed.summary || '',
    cached: false,
    ms: res.ms,
    firstTokenMs: res.firstTokenMs,
    effort,
    model: MODELS.reason,
  });

  return { event, applied, summary: parsed.summary || '', ms: res.ms };
}

/** Write the accepted assignments into the belief store, with vectors. */
async function applyAssignments(event, assignments, agents) {
  const known = new Set(agents.map((a) => a.id));
  const keep = assignments.filter((a) => known.has(a.agentId) && a.knows && a.belief);

  const vecs = keep.length ? await embed(keep.map((a) => a.belief)) : [];

  keep.forEach((a, i) => {
    store.addBelief({
      agentId: a.agentId,
      eventId: event.id,
      content: a.belief,
      confidence: typeof a.confidence === 'number' ? a.confidence : 0.6,
      route: a.route || 'unknown',
      distortion: a.distortion || 'none',
      reasoning: a.reasoning || '',
      vec: vecs[i],
    });
  });

  // Return every assignment, including the non-knowers — the dashboard shows
  // "Bell heard nothing" as a first-class result, because that is the finding.
  return assignments.filter((a) => known.has(a.agentId));
}
