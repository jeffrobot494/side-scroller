// ---------------------------------------------------------------------------
// SPEC TREE — structural operations on a sparse EnemySpec, with no DOM.
//
// The Enemy Designer's rail is a tree of the spec: the spec node, the entity
// tree under `root`, the reusable entities in `defs`, and the brain's states →
// tracks/actions → steps. This module is everything that tree DOES — enumerate
// the nodes, resolve a path to a value, add, duplicate with fresh ids, delete,
// reorder, promote an entity to a def — so the tool is left holding only markup
// and events, and the operations are testable under node like the rest of
// src/game/enemyspec/ (tech/enemy-designer.md, E2).
//
// Paths are the SAME strings validateSpec() reports errors at
// ("root.children[0].emitters.missiles"), which is what lets a validation error
// mark its node with no translation layer.
//
// Every op mutates the spec it is given and returns { ok, path, error }, where
// `path` is what the caller should select next.
// ---------------------------------------------------------------------------

import { MOTIONS, LINK_POLICIES } from "../../game/enemyspec/schema.js";

// ---- paths ----------------------------------------------------------------

// "root.children[0].emitters.gun" → ["root","children","0","emitters","gun"]
function segments(path) {
  if (!path) return [];
  return String(path).replace(/\[(\d+)\]/g, ".$1").split(".").filter((s) => s !== "");
}

export function valueAt(spec, path) {
  let cur = spec;
  for (const seg of segments(path)) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[seg];
  }
  return cur;
}

// Write `value` at `path`, creating the objects (or arrays, when the next
// segment is an index) on the way down. `undefined` deletes the leaf.
export function setAt(spec, path, value) {
  const segs = segments(path);
  if (!segs.length) return spec;
  let cur = spec;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    if (cur[seg] == null || typeof cur[seg] !== "object") cur[seg] = /^\d+$/.test(segs[i + 1]) ? [] : {};
    cur = cur[seg];
  }
  const last = segs[segs.length - 1];
  if (value === undefined) {
    if (Array.isArray(cur)) cur.splice(Number(last), 1);
    else delete cur[last];
  } else {
    cur[last] = value;
  }
  return spec;
}

export function deleteAt(spec, path) {
  return setAt(spec, path, undefined);
}

// The container a path lives in, plus the key/index it occupies there.
function parentOf(spec, path) {
  const segs = segments(path);
  if (!segs.length) return null;
  const key = segs.pop();
  let cur = spec;
  for (const seg of segs) {
    if (cur == null) return null;
    cur = cur[seg];
  }
  return cur == null ? null : { container: cur, key, path: segs.length ? joinSegs(segs) : "" };
}

function joinSegs(segs) {
  return segs.reduce((acc, s) => (/^\d+$/.test(s) ? `${acc}[${s}]` : acc ? `${acc}.${s}` : s), "");
}

// ---- enumeration ----------------------------------------------------------

// Every node of the tree, in display order. `depth` is indentation only.
export function treeNodes(spec) {
  const out = [];
  out.push({ path: "", kind: "spec", label: spec.name || spec.id || "enemy", depth: 0 });
  if (spec.root) walkEntity(spec.root, "root", 1, out, "entity");

  out.push({ path: "defs", kind: "defs", label: "defs", depth: 1 });
  for (const id of Object.keys(spec.defs || {})) walkEntity(spec.defs[id], `defs.${id}`, 2, out, "def", id);

  const brain = spec.brain;
  out.push({ path: "brain", kind: "brain", label: brain ? `brain · ${brain.mode || "tracks"}` : "brain · none", depth: 1 });
  for (const [sid, st] of Object.entries((brain && brain.states) || {})) {
    const sp = `brain.states.${sid}`;
    const start = brain.start || Object.keys(brain.states)[0];
    out.push({ path: sp, kind: "state", label: sid, depth: 2, note: sid === start ? "start" : "" });
    (st.tracks || []).forEach((tr, i) => {
      const tp = `${sp}.tracks[${i}]`;
      out.push({ path: tp, kind: "track", label: tr.id || `track ${i}`, depth: 3, note: tr.loop === false ? "once" : "loop" });
      (tr.steps || []).forEach((s, j) => out.push({ path: `${tp}.steps[${j}]`, kind: "step", label: stepLabel(s), depth: 4 }));
    });
    (st.actions || []).forEach((a, i) => {
      const ap = `${sp}.actions[${i}]`;
      out.push({ path: ap, kind: "uaction", label: a.id || `action ${i}`, depth: 3, note: "utility" });
      (a.steps || []).forEach((s, j) => out.push({ path: `${ap}.steps[${j}]`, kind: "step", label: stepLabel(s), depth: 4 }));
    });
  }
  return out;
}

function walkEntity(e, path, depth, out, kind, id) {
  if (!e || typeof e !== "object") return;
  out.push({
    path, kind, depth,
    label: id || e.id || (path === "root" ? "root" : "part"),
    note: e.motion ? e.motion.type : "",
  });
  for (const name of Object.keys(e.emitters || {})) {
    out.push({ path: `${path}.emitters.${name}`, kind: "emitter", label: name, depth: depth + 1 });
  }
  (e.children || []).forEach((c, i) => walkEntity(c, `${path}.children[${i}]`, depth + 1, out, "entity"));
}

// One action key per step (the validator enforces it), so the key IS the label.
export function stepLabel(step) {
  if (!step || typeof step !== "object") return "(invalid step)";
  const keys = Object.keys(step).filter((k) => k !== "id");
  if (!keys.length) return "(empty step)";
  const name = keys[0];
  const args = step[name];
  if (name === "fire" && args && args.emitter) return `fire ${args.emitter}`;
  if (name === "wait") return typeof args === "number" ? `wait ${args}s` : "wait";
  if (name === "spawn" && args && args.ref) return `spawn ${args.ref}`;
  if (name === "signal") return `signal ${typeof args === "string" ? args : (args && args.name) || ""}`;
  return name;
}

export function nodeAt(spec, path) {
  return treeNodes(spec).find((n) => n.path === path) || null;
}

// ---- ids ------------------------------------------------------------------

// Every entity id currently in use (root, its descendants, defs).
export function takenIds(spec) {
  const ids = new Set();
  const walk = (e) => {
    if (!e || typeof e !== "object") return;
    if (e.id) ids.add(e.id);
    for (const c of e.children || []) walk(c);
  };
  walk(spec.root);
  for (const id of Object.keys(spec.defs || {})) ids.add(id);
  return ids;
}

export function freshId(base, taken) {
  const stem = String(base || "part").replace(/\d+$/, "") || "part";
  for (let n = 2; n < 500; n++) {
    const id = `${stem}${n}`;
    if (!taken.has(id)) return id;
  }
  return `${stem}_${Date.now()}`;
}

// Re-id a cloned entity and everything under it, so a duplicate never collides.
export function refreshIds(entity, taken) {
  if (!entity || typeof entity !== "object") return entity;
  if (entity.id) {
    entity.id = freshId(entity.id, taken);
    taken.add(entity.id);
  }
  for (const c of entity.children || []) refreshIds(c, taken);
  return entity;
}

// ---- what may be added where ---------------------------------------------

const ADDS = {
  entity: [
    { kind: "child", label: "Child part" },
    { kind: "emitter", label: "Emitter" },
    { kind: "gun", label: "Basic gun (emitter + firing loop)" },
  ],
  def: [
    { kind: "child", label: "Child part" },
    { kind: "emitter", label: "Emitter" },
  ],
  defs: [{ kind: "def", label: "Def (reusable entity)" }],
  brain: [{ kind: "state", label: "State" }],
  state: [
    { kind: "track", label: "Track" },
    { kind: "uaction", label: "Utility action" },
  ],
  track: [{ kind: "step", label: "Step" }],
  uaction: [{ kind: "step", label: "Step" }],
};

export function availableAdds(spec, path) {
  const node = nodeAt(spec, path);
  return node ? ADDS[node.kind] || [] : [];
}

// ---- the operations -------------------------------------------------------

const fail = (error) => ({ ok: false, error, path: null });

export function addNode(spec, path, kind) {
  const node = nodeAt(spec, path);
  if (!node) return fail("nothing selected");
  if (!(ADDS[node.kind] || []).some((a) => a.kind === kind)) return fail(`cannot add a ${kind} to a ${node.kind}`);
  const taken = takenIds(spec);

  switch (kind) {
    case "child": {
      const host = valueAt(spec, path);
      host.children = host.children || [];
      const id = freshId("part", taken);
      host.children.push({
        id, at: [0, -20],
        visual: { shape: "box", size: [18, 18], color: "#b49aff" },
        health: { max: 20 },
      });
      return { ok: true, path: `${path}.children[${host.children.length - 1}]` };
    }
    case "emitter": {
      const host = valueAt(spec, path);
      host.emitters = host.emitters || {};
      const name = freshName("gun", new Set(Object.keys(host.emitters)));
      host.emitters[name] = {
        at: [0, -4],
        projectile: { speed: 420, w: 10, h: 10, color: "#8affc1", life: 2.2, damage: 8, shape: "orb" },
      };
      return { ok: true, path: `${path}.emitters.${name}` };
    }
    case "gun": {
      // The old form's "add basic gun" convenience: an emitter is useless
      // without something that pulls the trigger, so it seeds a brain too.
      const res = addNode(spec, path, "emitter");
      if (!res.ok) return res;
      const emitter = res.path.split(".").pop();
      const owner = valueAt(spec, path);
      const ref = path === "root" ? emitter : `${owner.id}.${emitter}`;
      if (!spec.brain) {
        spec.brain = {
          start: "fight",
          states: {
            fight: {
              tracks: [{ id: "shoot", loop: true, steps: [
                { telegraph: { time: 0.5 } },
                { fire: { emitter: ref, pattern: "aimed" } },
                { wait: 1.4 },
              ] }],
            },
          },
        };
      }
      return res;
    }
    case "def": {
      spec.defs = spec.defs || {};
      const id = freshId("def", taken);
      spec.defs[id] = {
        tags: ["projectile"],
        visual: { shape: "circle", size: [10, 10], color: "#ffb15a" },
        body: { gravity: 0 },
        life: { ttl: 3 },
        contact: { damage: 6, destroySelf: true },
      };
      return { ok: true, path: `defs.${id}` };
    }
    case "state": {
      spec.brain = spec.brain || { states: {} };
      spec.brain.states = spec.brain.states || {};
      const id = freshName("state", new Set(Object.keys(spec.brain.states)));
      const utility = (spec.brain.mode || "tracks") === "utility";
      spec.brain.states[id] = utility
        ? { actions: [{ id: "hold", score: 1, steps: [{ wait: 1 }] }] }
        : { tracks: [{ id: "loop", loop: true, steps: [{ wait: 1 }] }] };
      if (!spec.brain.start) spec.brain.start = id;
      return { ok: true, path: `brain.states.${id}` };
    }
    case "track": {
      const st = valueAt(spec, path);
      st.tracks = st.tracks || [];
      st.tracks.push({ id: freshName("track", new Set((st.tracks || []).map((t) => t.id))), loop: true, steps: [{ wait: 1 }] });
      return { ok: true, path: `${path}.tracks[${st.tracks.length - 1}]` };
    }
    case "uaction": {
      const st = valueAt(spec, path);
      st.actions = st.actions || [];
      st.actions.push({ id: freshName("action", new Set((st.actions || []).map((a) => a.id))), score: 1, steps: [{ wait: 1 }] });
      return { ok: true, path: `${path}.actions[${st.actions.length - 1}]` };
    }
    case "step": {
      const owner = valueAt(spec, path);
      owner.steps = owner.steps || [];
      owner.steps.push({ wait: 1 });
      return { ok: true, path: `${path}.steps[${owner.steps.length - 1}]` };
    }
    default:
      return fail(`unknown add '${kind}'`);
  }
}

function freshName(base, taken) {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n++) if (!taken.has(`${base}${n}`)) return `${base}${n}`;
  return `${base}_${Date.now()}`;
}

export function duplicateNode(spec, path) {
  const node = nodeAt(spec, path);
  if (!node) return fail("nothing selected");
  const parent = parentOf(spec, path);
  const value = valueAt(spec, path);
  if (value === undefined) return fail("nothing to duplicate");
  const copy = clone(value);

  switch (node.kind) {
    case "entity": {
      if (path === "root") return fail("the root is the enemy — it cannot be duplicated");
      refreshIds(copy, takenIds(spec));
      const i = Number(parent.key);
      parent.container.splice(i + 1, 0, copy);
      return { ok: true, path: `${parent.path}[${i + 1}]` };
    }
    case "def": {
      const id = freshId(parent.key, takenIds(spec));
      parent.container[id] = copy;
      return { ok: true, path: `defs.${id}` };
    }
    case "emitter": {
      const name = freshName(parent.key, new Set(Object.keys(parent.container)));
      parent.container[name] = copy;
      return { ok: true, path: `${parent.path}.${name}` };
    }
    case "state": {
      const id = freshName(parent.key, new Set(Object.keys(parent.container)));
      parent.container[id] = copy;
      return { ok: true, path: `brain.states.${id}` };
    }
    case "track":
    case "uaction":
    case "step": {
      const i = Number(parent.key);
      if (copy && copy.id) copy.id = freshName(copy.id, new Set(parent.container.map((x) => x && x.id)));
      parent.container.splice(i + 1, 0, copy);
      return { ok: true, path: `${parent.path}[${i + 1}]` };
    }
    default:
      return fail(`a ${node.kind} cannot be duplicated`);
  }
}

export function deleteNode(spec, path) {
  const node = nodeAt(spec, path);
  if (!node) return fail("nothing selected");
  if (node.kind === "spec") return fail("the spec node cannot be deleted");
  if (node.kind === "defs") return fail("the defs group is not a thing you can delete");
  if (path === "root") return fail("the root is the enemy — it cannot be deleted");

  if (node.kind === "brain") {
    if (!spec.brain) return fail("there is no brain to delete");
    delete spec.brain;
    return { ok: true, path: "" };
  }
  const parent = parentOf(spec, path);
  if (!parent) return fail("cannot resolve that node");
  if (Array.isArray(parent.container)) parent.container.splice(Number(parent.key), 1);
  else delete parent.container[parent.key];
  // Select the container, which is always a node: children[] hangs off an
  // entity, steps[] off a track, states off the brain.
  return { ok: true, path: containerNodePath(node, parent) };
}

function containerNodePath(node, parent) {
  if (node.kind === "state") return "brain";
  if (node.kind === "def") return "defs";
  // "root.children" → "root", "brain.states.fight.tracks" → "brain.states.fight"
  return parent.path.replace(/\.(children|emitters|tracks|actions|steps)$/, "");
}

// Reorder within the array a node lives in. `dir` is -1 (up) or +1 (down).
export function moveNode(spec, path, dir) {
  const parent = parentOf(spec, path);
  if (!parent || !Array.isArray(parent.container)) return fail("only list items can be reordered");
  const i = Number(parent.key);
  const j = i + (dir < 0 ? -1 : 1);
  if (j < 0 || j >= parent.container.length) return fail("already at the end");
  const [item] = parent.container.splice(i, 1);
  parent.container.splice(j, 0, item);
  return { ok: true, path: `${parent.path}[${j}]` };
}

// Move a child entity into `defs`, where an emitter or a spawn can reference it.
// A MOVE, not a copy: defs entries are collected as entities too, so leaving the
// child behind would be a duplicate id.
export function promoteToDef(spec, path) {
  const node = nodeAt(spec, path);
  if (!node || node.kind !== "entity") return fail("only a part can be promoted to a def");
  if (path === "root") return fail("the root is the enemy — it cannot become a def");
  const parent = parentOf(spec, path);
  const entity = clone(valueAt(spec, path));
  const id = entity.id || freshId("def", takenIds(spec));
  delete entity.id;
  delete entity.at; // a def is positioned by whatever spawns it
  parent.container.splice(Number(parent.key), 1);
  spec.defs = spec.defs || {};
  spec.defs[id] = entity;
  return { ok: true, path: `defs.${id}` };
}

// ---- validation marks -----------------------------------------------------

// errors → { path: count }, counting every error at or under each node, so a
// problem deep in a step is visible on the state and the spec node too.
export function errorCounts(nodes, errors) {
  const counts = {};
  for (const n of nodes) {
    let c = 0;
    for (const e of errors || []) {
      const p = e.path || "";
      if (n.path === "") c++;
      else if (p === n.path || p.startsWith(`${n.path}.`) || p.startsWith(`${n.path}[`)) c++;
    }
    if (c) counts[n.path] = c;
  }
  return counts;
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

// Re-exported so the tool renders motion params and link policies without
// importing the schema twice.
export { MOTIONS, LINK_POLICIES };
