// ---------------------------------------------------------------------------
// SEEDED RNG — deterministic pseudo-random for content generation.
//
// Math.random() isn't seedable, but generation MUST be reproducible: the same
// seed has to yield the exact same level so we can cache it, debug it, and let
// the editor's Level Generator playground regenerate a given seed on demand.
// mulberry32 is a tiny, fast, well-distributed 32-bit generator — plenty for
// placing platforms and enemies.
//
// makeRng(seed) → a function returning floats in [0, 1). The helpers below take
// that function so all draws come from the one seeded stream.
// ---------------------------------------------------------------------------

export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// float in [min, max)
export function range(rng, min, max) {
  return min + (max - min) * rng();
}

// integer in [min, max] inclusive
export function int(rng, min, max) {
  return Math.floor(min + (max - min + 1) * rng());
}

// snap a draw to a step grid (e.g. platform x on a 20px grid)
export function snap(value, step) {
  return Math.round(value / step) * step;
}

// uniform pick from an array
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// true with probability p (0..1)
export function chance(rng, p) {
  return rng() < p;
}

// Fisher–Yates shuffle (returns a new array; does not mutate input)
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Weighted pick: items is [{ weight, ... }]; returns a whole item.
export function weighted(rng, items) {
  const total = items.reduce((s, it) => s + (it.weight || 0), 0);
  if (total <= 0) return items[0];
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight || 0;
    if (r < 0) return it;
  }
  return items[items.length - 1];
}
