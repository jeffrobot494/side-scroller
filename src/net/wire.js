// ---------------------------------------------------------------------------
// THE WIRE — what may cross the transport seam, and the rule that says so.
//
// tech/multiplayer-session.md, W1. A command leaves a client and an answer comes
// back; later slices send dispatches and view snapshots the same way. Every one
// of them has to be DATA — the thing a socket could carry — and the whole point
// of building the seam in-process first is that a payload which could not
// survive the trip fails here, on a dev machine, rather than at T2 with a
// service in the way.
//
// The check is a WALK, not a comparison, and that correction is worth stating
// because the obvious implementation is wrong: `JSON.stringify` refuses almost
// nothing. It renders a Map as `{}`, drops functions and `undefined` silently,
// and turns a class instance into a bag of its own fields. Round-tripping and
// comparing the two therefore PASSES for exactly the payloads that matter —
// stringify(new Map()) and stringify({}) are both "{}", so the comparison sees
// two identical strings and the Map is gone. `lead.seenBy` IS a Map, on every
// lead in a multi-commander world (src/game/state.js), so this is not a
// hypothetical.
//
// So: walk the value, and reject anything that is not a plain JSON value. What
// crosses is then a copy, never a shared reference — which is the other half of
// what makes the seam real in one process.
// ---------------------------------------------------------------------------

// Every value the wire accepts, and nothing else. Deliberately narrower than
// JSON.stringify's input: `undefined` inside an object is silent data loss, and
// NaN/Infinity arrive as null, which is a wrong number rather than a missing one.
// `open` is the ANCESTOR CHAIN, not everything visited — that distinction is the
// whole of what tells a cycle from a shared reference. A round is full of shared
// references by design: `resolveWeapon` hands every soldier the SAME armory
// object, so two squadmates carrying the carbine put one object at two places in
// the payload. That is a DAG, it stringifies fine (the copy simply has two of
// them), and a walk that never forgets what it has seen calls it a cycle and
// refuses a legal round. `done` keeps the walk linear over such sharing.
function check(value, path, open, done) {
  if (value === null) return null;
  const t = typeof value;
  if (t === "string" || t === "boolean") return null;
  if (t === "number") return Number.isFinite(value) ? null : `${path} is ${value}`;
  if (t !== "object") return `${path} is a ${t}`;

  // A cycle is not data: this object is its own ancestor, so the walk would
  // never end. Checked before the recursion, never after.
  if (open.has(value)) return `${path} is a cycle`;
  // Already validated somewhere else in this payload, and it passed. Shared
  // structure is walked once, not once per reference.
  if (done.has(value)) return null;

  open.add(value);
  const bad = walk(value, path, open, done);
  open.delete(value);
  if (bad) return bad;
  done.add(value);
  return null;
}

// The descent itself, split out so `open` is popped on every exit rather than
// on the ones somebody remembered.
function walk(value, path, open, done) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const bad = check(value[i], `${path}[${i}]`, open, done);
      if (bad) return bad;
    }
    return null;
  }

  // Plain objects only. A Map, a Set, a Date or any class instance would be
  // silently reshaped by JSON, which is the failure this whole module exists to
  // make loud.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return `${path} is a ${value.constructor ? value.constructor.name : "non-plain object"}`;
  }
  for (const k of Object.keys(value)) {
    if (value[k] === undefined) return `${path}.${k} is undefined`;
    const bad = check(value[k], `${path}.${k}`, open, done);
    if (bad) return bad;
  }
  return null;
}

// Throw if `value` could not cross a wire intact. `what` names the payload in
// the error, because the useful half of this failure is WHICH field it was.
export function assertData(value, what = "payload") {
  const bad = check(value, what, new Set(), new Set());
  if (bad) throw new TypeError(`${what} cannot cross the wire: ${bad}`);
}

// The value as it would arrive on the other side: checked, then copied. Callers
// hand the copy on, so nothing on either side of the seam holds a reference into
// the other — the property a real transport gives for free and an in-process one
// has to be made to give.
export function toWire(value, what = "payload") {
  if (value === undefined) return undefined; // a command with no answer
  assertData(value, what);
  return JSON.parse(JSON.stringify(value));
}
