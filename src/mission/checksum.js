// ---------------------------------------------------------------------------
// MISSION CHECKSUM  (tech/multiplayer-missions.md, J0)
//
// One number for "what the mission looks like right now", plus the named list
// it is folded from. Its own module because three unrelated readers want it and
// none of them should reach into the scene to get it: the divergence suite
// (test/mission-divergence.test.mjs), the lockstep loop J6 will add
// (src/net/lockstep.js), and a bug report that needs to say WHERE two clients
// stopped agreeing.
//
// It SAMPLES, it does not hash the scene (approximation 8). The list started as
// `sample()` in test/mission-golden.test.mjs — the set of fields this repo has
// already decided is the mission's real gameplay state, chosen for exactly this
// reason: motes, sparks, shake, trail jitter and the loot bob are unseeded on
// purpose (tech/mission-determinism.md, approximation 2) and would disagree on
// every comparison. Four deliberate drifts from that list, all in the same
// direction — a checksum costs no fixture bytes, so it samples wider:
//
//   1. EVERY projectile, not the front three. The golden slices to keep
//      mission.golden.json readable; a fold has no such budget, and the tail of
//      the projectile list is where a spread draw that went one way on one
//      client and another way on the other is still visible after the front has
//      expired.
//   2. Every loot drop's own y and collected flag, not just the two counts. A
//      loot item falls under gravity and is picked up by overlap, both of which
//      are gameplay.
//   3. `scene.artifact` — the golden's 41 samples never resolve, so it never
//      had a reason to look at the extraction grant.
//   4. Strings (a root's brain state) are folded rather than compared, which is
//      the one thing a checksum can do that a golden diff cannot do as cheaply.
//
// The one thing a checksum CANNOT do is the golden's 2e-3 tolerance: a fold has
// no notion of "close". Values are quantized to 1e-3 (the golden's own rounding)
// and two runs that straddle a quantum boundary read as divergence. Same machine
// and same process — J0's first half — that never fires, because the draws are
// bit-identical. It is the second half, two machines, where the boundary matters
// and where the tolerance the golden has and this does not is the thing to
// remember (approximation 2).
// ---------------------------------------------------------------------------

const Q = 1000; // 1e-3, the golden's rounding

// ---- the named list -------------------------------------------------------
// [name, read] pairs. The name is what a divergence report prints; it exists so
// a failing step names a FIELD rather than a number, the same way
// test/mission-golden.test.mjs names the first differing path.

export const SOLDIER_FIELDS = [
  ["x", (s) => s.x],
  ["y", (s) => s.y],
  ["vx", (s) => s.vx],
  ["vy", (s) => s.vy],
  ["onGround", (s) => (s.onGround ? 1 : 0)],
  ["crouched", (s) => (s.crouched ? 1 : 0)],
  ["alive", (s) => (s.alive ? 1 : 0)],
  ["health", (s) => s.health],
  // Infinity is a legal ammo value (a magazine-less weapon) and does not
  // quantize; -1 is how the golden spells it too.
  ["ammo", (s) => (s.ammo === undefined || s.ammo === Infinity ? -1 : s.ammo)],
  ["facing", (s) => s.facing],
  ["kills", (s) => s.kills],
];

export const ROOT_FIELDS = [
  ["x", (r) => r.x],
  ["y", (r) => r.y],
  ["vx", (r) => r.vx],
  ["vy", (r) => r.vy],
  ["alive", (r) => (r.alive ? 1 : 0)],
  ["health", (r) => r.health || 0],
  ["state", (r) => (r.brainState && r.brainState.current) || ""],
];

export const PROJECTILE_FIELDS = [
  ["x", (p) => p.x],
  ["y", (p) => p.y],
  ["vx", (p) => p.vx],
  ["vy", (p) => p.vy],
];

export const LOOT_FIELDS = [
  ["y", (l) => l.y],
  ["collected", (l) => (l.collected ? 1 : 0)],
];

// ---- sampling -------------------------------------------------------------

// scene → [[name, value], …] in a fixed order. Values are numbers except a
// brain state, which is a string. Counts come FIRST in each group so a shape
// difference (one client holding a projectile the other does not) shows up as
// its own entry instead of as a silent shift of everything after it.
export function sampleScene(scene) {
  const out = [];
  const group = (prefix, list, fields) => {
    out.push([`${prefix}.n`, list.length]);
    for (let i = 0; i < list.length; i++)
      for (const [name, read] of fields) out.push([`${prefix}[${i}].${name}`, read(list[i])]);
  };

  group("soldiers", scene.soldiers || [], SOLDIER_FIELDS);
  group("roots", scene.specRoots || [], ROOT_FIELDS);
  group("proj", scene.projectiles || [], PROJECTILE_FIELDS);
  group("loot", scene.loot || [], LOOT_FIELDS);
  out.push(["collected.n", (scene.collected || []).length]);
  out.push(["artifact", scene.artifact ? 1 : 0]);
  return out;
}

// ---- the fold -------------------------------------------------------------

// FNV-1a over the sampled values, 32-bit. Names are not folded in: the list is
// fixed at module scope, so two folds that disagree already disagree about a
// value or a count.
function mixInt(h, n) {
  h = (h ^ (n | 0)) >>> 0;
  return Math.imul(h, 16777619) >>> 0;
}

function mixValue(h, v) {
  if (typeof v === "string") {
    h = mixInt(h, v.length);
    for (let i = 0; i < v.length; i++) h = mixInt(h, v.charCodeAt(i));
    return h;
  }
  // Non-finite (a NaN velocity, an unset health) folds as 0 rather than
  // poisoning the whole checksum — a NaN would make every subsequent step
  // compare equal-and-wrong instead of naming the frame it appeared on.
  return mixInt(h, Number.isFinite(v) ? Math.round(v * Q) : 0);
}

// scene → uint32. Pure: it reads the scene and writes nothing.
export function checksum(scene) {
  let h = 0x811c9dc5;
  for (const [, value] of sampleScene(scene)) h = mixValue(h, value);
  return h >>> 0;
}

// The first entry two samples disagree on, as "name: a → b", or null. The
// instrument a divergence report needs after the checksum has said WHICH step:
// the checksum answers when, this answers what.
export function firstSampleDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const [na, va] = a[i];
    const [nb, vb] = b[i];
    if (na !== nb) return `${na} → ${nb} (the sample lists are different shapes)`;
    const qa = typeof va === "string" ? va : Math.round(va * Q);
    const qb = typeof vb === "string" ? vb : Math.round(vb * Q);
    if (qa !== qb) return `${na}: ${va} → ${vb}`;
  }
  if (a.length !== b.length) return `sample count: ${a.length} → ${b.length}`;
  return null;
}
