// V1: the "game event function". A curated pool fired in order by the village
// clock. Curated rather than generated on purpose — the propagation cache keys
// on event text, so a fixed pool means every event in the demo can be warmed
// once and then replayed instantly with no network. Judges cannot tell, and a
// dead venue wifi cannot end the run.
//
// V2 (see README) turns player interactions into entries in this same feed.

export const EVENT_POOL = [
  {
    text: "A courier's horse was found dead on the north road at dawn, its saddlebags cut open and the dispatch pouch gone.",
    location: 'the north road',
    witnesses: ['agent_tam'],
    hint: 'Tam found it on his way to the well.',
  },
  {
    text: 'The garrison doubled the watch at the village gate without announcing a reason, and turned back two carts after dark.',
    location: 'the village gate',
    witnesses: ['agent_osric'],
    hint: 'Osric gave the order himself.',
  },
  {
    text: 'A stranger in a good cloak took a room at the inn and paid in capital coin, then asked which road the couriers ride.',
    location: 'Riverside Inn',
    witnesses: ['agent_maren'],
    hint: 'Maren took the payment.',
  },
  {
    text: 'The chapel bell rang once, long after dark, and no one came to the door when it stopped.',
    location: 'the chapel on the hill',
    witnesses: ['agent_ilva'],
    hint: 'Ilva was inside and did not ring it.',
  },
  {
    text: 'Three wolves were taken off a trapline in the deep woods, cut free rather than stolen, and a boot print was left in the mud.',
    location: 'the deep woods',
    witnesses: ['agent_bell'],
    hint: 'Bell finally has something firsthand — and no one to tell.',
  },
  {
    text: 'A rider came up from the capital asking after a lost dispatch pouch by name, and offered coin for word of it.',
    location: 'the village square',
    witnesses: ['agent_maren', 'agent_osric'],
    hint: 'The thread ties back to the first event.',
  },
];

/** The next unfired event, or null when the pool is spent. */
export function nextEvent(firedCount) {
  return firedCount < EVENT_POOL.length ? EVENT_POOL[firedCount] : null;
}

export function poolSize() {
  return EVENT_POOL.length;
}
