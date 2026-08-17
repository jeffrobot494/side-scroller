// Seeds the demo world. Five agents, a deliberately uneven social graph, and
// one isolate — Bell — who exists to prove the system will answer "nobody told
// them" instead of quietly giving everyone the news.
//
//   node seed.js

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib/env.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnv(ROOT);

const store = await import('./lib/store.js');
const { embed, embedProvider } = await import('./lib/embed.js');

store.reset();

const AGENTS = [
  {
    id: 'agent_maren',
    name: 'Maren',
    role: 'keeper of the Riverside Inn',
    location: 'Riverside Inn, village centre',
    persona: 'Warm, incurably curious, repeats things with confident embellishment. The village hears everything through her.',
    ties: ['agent_tam', 'agent_osric', 'agent_ilva'],
    forbidden: [],
    knows: [
      'The inn has been short on barley since the spring floods.',
      'The north road is the only route to the capital that a cart can take.',
    ],
  },
  {
    id: 'agent_osric',
    name: 'Osric',
    role: 'captain of the garrison',
    location: 'the garrison house',
    persona: 'Clipped, official, discloses the minimum. Reframes bad news as under control.',
    ties: ['agent_maren', 'agent_ilva'],
    forbidden: ['the garrison is under-strength and cannot patrol the north road'],
    knows: [
      'The garrison keeps a written incident log, reviewed monthly.',
      'Couriers to the capital ride out at first light on the north road.',
    ],
  },
  {
    id: 'agent_tam',
    name: 'Tam',
    role: 'stable boy',
    location: 'the inn stables',
    persona: 'Fifteen, blurts things out, describes what he saw in vivid physical detail and gets the significance wrong.',
    ties: ['agent_maren'],
    forbidden: [],
    knows: [
      'He is up before dawn every day to feed and water the horses.',
      'He can recognise most of the couriers by their horses.',
    ],
  },
  {
    id: 'agent_ilva',
    name: 'Sister Ilva',
    role: 'keeper of the chapel',
    location: 'the chapel on the hill',
    persona: 'Careful and precise. Will not repeat a thing she cannot source, and says so plainly.',
    ties: ['agent_osric', 'agent_maren'],
    forbidden: [],
    knows: [
      'The chapel keeps the parish register of births, deaths and burials.',
      'She takes confession from most of the village, and repeats none of it.',
    ],
  },
  {
    id: 'agent_bell',
    name: 'Bell',
    role: 'hermit',
    location: 'the deep woods, half a day north-west',
    persona: 'Terse. Suspicious of anyone who walks up the path. Volunteers nothing.',
    ties: [],
    forbidden: [],
    knows: [
      'She trades pelts at the village market on the first day of each month.',
      'She has not spoken to anyone in eleven days.',
    ],
  },
];

console.log(`Seeding with embeddings: ${embedProvider()}`);

for (const a of AGENTS) {
  const { knows, ...rest } = a;
  const agent = store.addAgent(rest);
  const vecs = await embed(knows);
  knows.forEach((f, i) =>
    store.addBelief({
      agentId: agent.id,
      content: f,
      confidence: 0.95,
      route: 'baseline',
      reasoning: 'Authored directly as baseline knowledge.',
      vec: vecs[i],
    }),
  );
  console.log(`  + ${agent.name.padEnd(12)} ${knows.length} baseline beliefs, ${agent.ties.length} ties`);
}

console.log(`
Seeded ${AGENTS.length} agents.

Demo event to paste into the dashboard:

  "A courier's horse was found dead on the north road at dawn, its saddlebags
   cut open and the dispatch pouch gone. Tam found it on his way to the well."

  Witnesses: Tam

What to watch for:
  - Tam has it firsthand and physical, and misses what it means
  - Maren has it within hours, embellished
  - Osric has the sanitised official version and will not admit the patrol gap
  - Ilva has it secondhand and hedges her source
  - Bell has NOTHING. That is the result, not a bug.
`);
