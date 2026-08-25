// ---------------------------------------------------------------------------
// SPEC DIFF — two sparse EnemySpecs in, the paths that differ out.
//
// A chat turn replaces the WHOLE spec (tech/enemy-designer.md approximation 1),
// so the only way to see what a turn actually did is to compare. The paths this
// produces are the same addresses the validator emits and the tree rail
// indexes by — "root.children[0].health.max", "brain.states.fight" — so the
// Designer marks touched nodes by rolling these up exactly the way it rolls up
// validation errors. No new addressing scheme.
//
// Pure and DOM-free: node-importable, and tested against the shared templates.
//
// Leaf rule: a primitive is a leaf, and so is an array whose elements are ALL
// primitives — `at: [0,-20]` and `tags: ["enemy","wing"]` read as one field
// each rather than as per-index changes. An array holding objects (`children`,
// `steps`, `tracks`) is walked by index, because those indices ARE tree nodes.
// ---------------------------------------------------------------------------

/**
 * @param {object|null} before  the spec as it was (null = nothing there yet)
 * @param {object|null} after   the spec as it is now
 * @returns {Array<{path:string, kind:"add"|"del"|"change", from:*, to:*}>}
 *          in depth-first order; `path` "" never appears (a whole-spec swap
 *          reports its top-level keys instead).
 */
export function diffSpecs(before, after) {
  const out = [];
  walk(before, after, "", out);
  return out;
}

function walk(a, b, path, out) {
  if (same(a, b)) return;
  if (isLeaf(a) || isLeaf(b) || a === undefined || b === undefined) {
    out.push({ path, kind: a === undefined ? "add" : b === undefined ? "del" : "change", from: a, to: b });
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    out.push({ path, kind: "change", from: a, to: b });
    return;
  }
  if (Array.isArray(a)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) walk(a[i], b[i], `${path}[${i}]`, out);
    return;
  }
  for (const key of union(a, b)) walk(a[key], b[key], path ? `${path}.${key}` : key, out);
}

// A value with no interesting interior: primitives, null, and flat arrays.
function isLeaf(v) {
  if (v === null || typeof v !== "object") return true;
  return Array.isArray(v) && v.every((e) => e === null || typeof e !== "object");
}

function union(a, b) {
  const keys = Object.keys(a);
  for (const k of Object.keys(b)) if (!keys.includes(k)) keys.push(k);
  return keys;
}

function same(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

// One line for the checkpoint row: parts, defs, emitters and brain states are
// what a reader looks for first, so they are counted by name and everything
// else is "field". A whole container changing at once (`root.children` added
// or deleted as a unit) counts its members, not itself — one del there is
// still six parts gone.
export function summarize(changes) {
  if (!changes.length) return "no change";
  const n = { part: 0, def: 0, emitter: 0, state: 0 };
  let fields = 0;
  for (const c of changes) {
    const hit = category(c.path);
    if (!hit) { fields++; continue; }
    const sign = c.kind === "del" ? -1 : 1;
    n[hit.cat] += sign * (hit.container ? size(c.kind === "del" ? c.from : c.to) : 1);
  }
  const bits = [];
  const plural = { part: "parts", def: "defs", emitter: "emitters", state: "states" };
  for (const k of ["part", "def", "emitter", "state"]) {
    if (!n[k]) continue;
    bits.push(`${n[k] > 0 ? "+" : "\u2212"}${Math.abs(n[k])} ${Math.abs(n[k]) === 1 ? k : plural[k]}`);
  }
  if (fields) bits.push(`${fields} field${fields === 1 ? "" : "s"}`);
  return bits.join(", ");
}

// Which named thing (if any) a path IS, and whether it is the whole container
// rather than one member — a turn can add one part or replace the list.
function category(path) {
  if (/\.children$/.test(path)) return { cat: "part", container: true };
  if (/\.children\[\d+\]$/.test(path)) return { cat: "part", container: false };
  if (/\.emitters$/.test(path)) return { cat: "emitter", container: true };
  if (/\.emitters\.[^.]+$/.test(path)) return { cat: "emitter", container: false };
  if (path === "defs") return { cat: "def", container: true };
  if (/^defs\.[^.]+$/.test(path)) return { cat: "def", container: false };
  if (path === "brain.states") return { cat: "state", container: true };
  if (/^brain\.states\.[^.]+$/.test(path)) return { cat: "state", container: false };
  return null;
}

function size(v) {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object") return Object.keys(v).length;
  return 1;
}
