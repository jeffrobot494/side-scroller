// ---------------------------------------------------------------------------
// VALIDATE — treat an EnemySpec like source code that must compile (doc §10).
//
// Runs on the SPARSE (authored/LLM) spec so error paths point at what the
// author actually wrote. Four passes, all collected into one error list:
//   1. schema     — required fields, types, enums, ranges, unique ids, depth
//   2. references — every ref/emitter/state/target/signal points at something real
//   3. behavior   — no undelayed infinite loops, states reachable, expressions parse
//   4. spawn      — no recursive spawn cycles (spawn bombs)
//
// validateSpec(spec) → { ok, errors: [{ path, msg }] }
// Error paths ("root.children[0].emitters.missiles.ref") feed both the
// Designer's error list and the LLM repair prompt verbatim.
// ---------------------------------------------------------------------------

import {
  SPEC_KEYS, ROLES, ENTITY_KEYS, VISUAL_SHAPES, MOTIONS, ACTIONS, PATTERNS,
  AIM_STYLES, EVENTS, SIGNAL_PREFIX, LINK_POLICIES, UTILITY_ACTION_KEYS,
  RANGES, MAX_TREE_DEPTH, MAX_ENTITIES,
} from "./schema.js";
import { parseExpr } from "./expr.js";
import { CUE_IDS, SPEC_SOUND_KINDS } from "../../audio/cues.js";

// A sound slot: "cue.id" or { cue?, gain? }. Shared by the top-level `sounds`
// block and an emitter's `sound`. Cue ids are validated against the catalog —
// an invented id would resolve to silence, and silence is the one failure the
// author (or the LLM) would never notice.
function checkSoundSlot(err, slot, path) {
  if (slot === undefined || slot === null) return;
  const id = typeof slot === "string" ? slot : slot && typeof slot === "object" ? slot.cue : null;
  if (typeof slot !== "string" && (typeof slot !== "object" || Array.isArray(slot))) {
    err(path, 'sound must be a cue id string or { cue?, gain? }');
    return;
  }
  if (id !== undefined && id !== null && !CUE_IDS.includes(id)) {
    err(`${path}${typeof slot === "string" ? "" : ".cue"}`, `unknown sound cue '${id}'`);
  }
  if (typeof slot === "object") {
    if (slot.cue === undefined && slot.gain === undefined) err(path, "sound needs a cue and/or a gain");
    if (slot.gain !== undefined && (typeof slot.gain !== "number" || slot.gain < 0 || slot.gain > 2)) {
      err(`${path}.gain`, "gain must be a number 0-2");
    }
  }
}

export function validateSpec(spec) {
  const errors = [];
  const err = (path, msg) => errors.push({ path, msg });

  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return { ok: false, errors: [{ path: "", msg: "spec must be a JSON object" }] };
  }

  // ---- top level ----------------------------------------------------------
  for (const k of Object.keys(spec)) {
    if (!SPEC_KEYS.includes(k)) err(k, `unknown top-level key '${k}'`);
  }
  if (!spec.id || typeof spec.id !== "string") err("id", "id (string) is required");
  if (!spec.root || typeof spec.root !== "object") err("root", "root entity is required");
  if (spec.role !== undefined && !ROLES.includes(spec.role)) err("role", `role must be one of ${ROLES.join(", ")}`);
  checkRange(err, "threat", spec.threat, RANGES.threat);
  checkRange(err, "tier", spec.tier, RANGES.tier);
  checkRange(err, "intelligence", spec.intelligence, RANGES.intelligence);
  if (spec.sounds !== undefined) {
    if (!spec.sounds || typeof spec.sounds !== "object" || Array.isArray(spec.sounds)) {
      err("sounds", "sounds must be an object");
    } else {
      for (const [kind, slot] of Object.entries(spec.sounds)) {
        if (!SPEC_SOUND_KINDS.includes(kind)) err(`sounds.${kind}`, `unknown sound slot '${kind}' (have: ${SPEC_SOUND_KINDS.join(", ")})`);
        else checkSoundSlot(err, slot, `sounds.${kind}`);
      }
    }
  }
  if (!spec.root || typeof spec.root !== "object") return { ok: false, errors };
  if (!spec.root.health || typeof spec.root.health.max !== "number") {
    err("root.health", "root must have health: { max } (the enemy must be killable)");
  }

  // ---- collect the entity universe ---------------------------------------
  // ids are unique across the root tree AND defs (shared reference namespace).
  const entities = new Map(); // id → { entity, path }
  const defIds = new Set(Object.keys(spec.defs || {}));
  let count = 0;

  const collect = (e, path, depth) => {
    if (!e || typeof e !== "object") { err(path, "entity must be an object"); return; }
    count++;
    if (count > MAX_ENTITIES) { err(path, `too many entities (max ${MAX_ENTITIES})`); return; }
    if (depth > MAX_TREE_DEPTH) { err(path, `nesting too deep (max ${MAX_TREE_DEPTH})`); return; }
    const id = e.id || (path === "root" ? "root" : null);
    if (id) {
      if (entities.has(id)) err(`${path}.id`, `duplicate entity id '${id}'`);
      else entities.set(id, { entity: e, path });
    } else if ((e.children || []).length || e.emitters || e.on) {
      err(`${path}.id`, "entity with children/emitters/events needs a stable id");
    }
    for (const [i, c] of (e.children || []).entries()) collect(c, `${path}.children[${i}]`, depth + 1);
  };
  collect(spec.root, "root", 0);
  for (const [id, d] of Object.entries(spec.defs || {})) collect({ id, ...d }, `defs.${id}`, 0);

  // ---- per-entity schema + reference checks -------------------------------
  for (const { entity: e, path } of entities.values()) {
    checkEntity(err, e, path, { entities, defIds });
  }
  // anonymous simple children still need schema checks
  const walkAnon = (e, path) => {
    if (e && typeof e === "object" && !e.id && path !== "root") checkEntity(err, e, path, { entities, defIds });
    for (const [i, c] of ((e && e.children) || []).entries()) walkAnon(c, `${path}.children[${i}]`);
  };
  walkAnon(spec.root, "root");

  // ---- brain --------------------------------------------------------------
  if (spec.brain) checkBrain(err, spec.brain, "brain", { entities, defIds });

  // ---- spawn cycles -------------------------------------------------------
  checkSpawnCycles(err, spec, defIds);

  return { ok: errors.length === 0, errors };
}

// ---- entity checks --------------------------------------------------------

function checkEntity(err, e, path, refs) {
  for (const k of Object.keys(e)) {
    if (!ENTITY_KEYS.includes(k)) err(`${path}.${k}`, `unknown entity key '${k}'`);
  }
  if (e.visual) {
    if (e.visual.shape !== undefined && !VISUAL_SHAPES.includes(e.visual.shape)) {
      err(`${path}.visual.shape`, `shape must be one of ${VISUAL_SHAPES.join(", ")}`);
    }
    if (e.visual.size !== undefined) {
      if (!Array.isArray(e.visual.size) || e.visual.size.length !== 2) err(`${path}.visual.size`, "size must be [w, h]");
      else for (const v of e.visual.size) checkRange(err, `${path}.visual.size`, v, RANGES["visual.size"]);
    }
  }
  if (e.health) checkRange(err, `${path}.health.max`, e.health.max, RANGES["health.max"]);
  if (e.body && e.body.gravity !== undefined) checkRange(err, `${path}.body.gravity`, e.body.gravity, RANGES["body.gravity"]);
  if (e.contact) checkRange(err, `${path}.contact.damage`, e.contact.damage, RANGES["contact.damage"]);
  if (e.life) checkRange(err, `${path}.life.ttl`, e.life.ttl, RANGES["life.ttl"]);

  if (e.motion) {
    if (!MOTIONS[e.motion.type]) err(`${path}.motion.type`, `unknown motion '${e.motion.type}' (have: ${Object.keys(MOTIONS).join(", ")})`);
  }

  if (e.link) {
    for (const k of ["onParentDeath", "onOwnDeath"]) {
      if (e.link[k] !== undefined && !LINK_POLICIES.includes(e.link[k])) {
        err(`${path}.link.${k}`, `must be one of ${LINK_POLICIES.join(", ")}`);
      }
    }
    if ((e.link.onParentDeath === "transform" || e.link.onOwnDeath === "transform") && !refs.defIds.has(e.link.transformTo)) {
      err(`${path}.link.transformTo`, "transform requires transformTo naming an entry in defs");
    }
  }

  if (e.emitters) {
    for (const [name, em] of Object.entries(e.emitters)) {
      const p = `${path}.emitters.${name}`;
      if (!em || typeof em !== "object") { err(p, "emitter must be an object"); continue; }
      if (em.ref !== undefined && !refs.defIds.has(em.ref)) err(`${p}.ref`, `emitter ref '${em.ref}' not found in defs`);
      if (!em.ref && !em.projectile) err(p, "emitter needs either ref (a def) or projectile ({ speed, damage, … })");
      checkSoundSlot(err, em.sound, `${p}.sound`);
      if (em.projectile) {
        checkRange(err, `${p}.projectile.speed`, em.projectile.speed, RANGES["projectile.speed"]);
        checkRange(err, `${p}.projectile.life`, em.projectile.life, RANGES["projectile.life"]);
      }
    }
  }

  if (e.on) {
    for (const [ev, actions] of Object.entries(e.on)) {
      const p = `${path}.on.${ev}`;
      if (!EVENTS.includes(ev) && !ev.startsWith(SIGNAL_PREFIX)) {
        err(p, `unknown event '${ev}' (have: ${EVENTS.join(", ")}, ${SIGNAL_PREFIX}<name>)`);
      }
      if (!Array.isArray(actions)) err(p, "event handler must be an array of actions");
      else checkSteps(err, actions, p, refs, { instantOnly: true, owner: e });
    }
  }
}

// ---- brain checks ---------------------------------------------------------

function checkBrain(err, brain, path, refs) {
  const mode = brain.mode || "tracks";
  if (mode !== "tracks" && mode !== "utility") err(`${path}.mode`, `mode must be "tracks" or "utility"`);
  const states = brain.states || {};
  const stateIds = Object.keys(states);
  if (!stateIds.length) { err(`${path}.states`, "brain needs at least one state"); return; }
  const start = brain.start || stateIds[0];
  if (!states[start]) err(`${path}.start`, `start state '${start}' not found`);

  for (const [id, st] of Object.entries(states)) {
    const p = `${path}.states.${id}`;
    if (st.enter) checkSteps(err, st.enter, `${p}.enter`, refs, { instantOnly: true });

    for (const [i, tr] of (st.tracks || []).entries()) {
      const tp = `${p}.tracks[${i}]`;
      const steps = tr.steps || [];
      checkSteps(err, steps, `${tp}.steps`, refs, {});
      // an undelayed infinite loop would spin the sim forever in one frame
      if (tr.loop !== false && steps.length && !steps.some((s) => isBlocking(s))) {
        err(tp, "looping track has no blocking step (wait/telegraph/moveTo/dash) — would loop with zero delay");
      }
    }

    if (mode === "utility") {
      const acts = st.actions || [];
      if (!acts.length && !(st.tracks || []).length) err(p, "utility state has no actions");
      for (const [i, a] of acts.entries()) {
        const ap = `${p}.actions[${i}]`;
        for (const k of Object.keys(a)) {
          if (!UTILITY_ACTION_KEYS.includes(k)) err(`${ap}.${k}`, `unknown utility-action key '${k}'`);
        }
        if (a.when !== undefined) checkExpr(err, a.when, `${ap}.when`);
        if (a.score !== undefined) checkExpr(err, a.score, `${ap}.score`);
        checkRange(err, `${ap}.windup`, a.windup, RANGES.windup);
        checkRange(err, `${ap}.recovery`, a.recovery, RANGES.recovery);
        checkRange(err, `${ap}.cooldown`, a.cooldown, RANGES.cooldown);
        // utility steps run as a one-shot sequence (the commitment), so
        // blocking steps like dash/telegraph are allowed — unlike event handlers.
        checkSteps(err, a.steps || [], `${ap}.steps`, refs, {});
      }
      checkRange(err, `${p}.decisionInterval`, st.decisionInterval, RANGES.decisionInterval);
    }

    for (const [i, t] of (st.transitions || []).entries()) {
      const tp = `${p}.transitions[${i}]`;
      if (!t.to || !states[t.to]) err(`${tp}.to`, `transition target '${t.to}' is not a state`);
      if (t.when === undefined && t.event === undefined) err(tp, "transition needs `when` (expression) or `event` (signal name)");
      if (t.when !== undefined) checkExpr(err, t.when, `${tp}.when`);
    }
  }

  // reachability from start (transitions only — unreachable states are dead weight)
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const st = states[queue.shift()];
    for (const t of (st && st.transitions) || []) {
      if (t.to && states[t.to] && !seen.has(t.to)) { seen.add(t.to); queue.push(t.to); }
    }
  }
  for (const id of stateIds) {
    if (!seen.has(id)) err(`${path}.states.${id}`, `state '${id}' is unreachable from '${start}'`);
  }
}

// ---- step/action checks ---------------------------------------------------

function isBlocking(step) {
  for (const k of Object.keys(step)) {
    if (ACTIONS[k] && ACTIONS[k].blocking) return true;
  }
  return false;
}

function checkSteps(err, steps, path, refs, { instantOnly = false, owner = null } = {}) {
  if (!Array.isArray(steps)) { err(path, "steps must be an array"); return; }
  for (const [i, step] of steps.entries()) {
    const p = `${path}[${i}]`;
    if (!step || typeof step !== "object") { err(p, "step must be an object"); continue; }
    const keys = Object.keys(step).filter((k) => k !== "id");
    if (keys.length !== 1) { err(p, `step must have exactly one action key (got ${keys.join(", ") || "none"})`); continue; }
    const name = keys[0];
    if (!ACTIONS[name]) { err(p, `unknown action '${name}' (have: ${Object.keys(ACTIONS).join(", ")})`); continue; }
    if (instantOnly && ACTIONS[name].blocking) {
      err(p, `blocking action '${name}' not allowed here (event handlers, enter, if-branches and utility steps run instantly)`);
    }
    checkAction(err, name, step[name], p, refs, owner);
  }
}

function checkAction(err, name, args, path, refs, owner) {
  switch (name) {
    case "fire": {
      if (!args || !args.emitter) { err(path, "fire needs { emitter }"); break; }
      const parts = String(args.emitter).split(".");
      let target = null;
      if (parts.length === 2) {
        const ent = refs.entities.get(parts[0]);
        target = ent && ent.entity.emitters && ent.entity.emitters[parts[1]];
        if (!target) err(`${path}.emitter`, `emitter '${args.emitter}' not found (expected <entityId>.<emitterName>)`);
      } else {
        // bare name: the owner's emitters, else any entity that has it
        const pool = owner && owner.emitters ? [owner] : [...refs.entities.values()].map((x) => x.entity);
        target = pool.some((e) => e.emitters && e.emitters[parts[0]]);
        if (!target) err(`${path}.emitter`, `no entity has an emitter named '${parts[0]}'`);
      }
      if (args.pattern !== undefined && !PATTERNS.includes(args.pattern)) err(`${path}.pattern`, `pattern must be one of ${PATTERNS.join(", ")}`);
      if (args.aim !== undefined && !AIM_STYLES.includes(args.aim)) err(`${path}.aim`, `aim must be one of ${AIM_STYLES.join(", ")}`);
      break;
    }
    case "spawn":
      if (!args || !args.ref) err(path, "spawn needs { ref }");
      else if (!refs.defIds.has(args.ref)) err(`${path}.ref`, `spawn ref '${args.ref}' not found in defs`);
      if (args && args.pattern !== undefined && !PATTERNS.includes(args.pattern)) err(`${path}.pattern`, `pattern must be one of ${PATTERNS.join(", ")}`);
      break;
    case "setMotion":
      if (!args || !MOTIONS[args.type]) err(path, `setMotion needs { type: ${Object.keys(MOTIONS).join("|")} }`);
      if (args && args.target !== undefined) checkEntityTarget(err, args.target, `${path}.target`, refs);
      break;
    case "telegraph":
      if (!args || typeof args.time !== "number" || args.time <= 0) err(path, "telegraph needs { time > 0 }");
      if (args && args.part !== undefined) checkEntityTarget(err, args.part, `${path}.part`, refs);
      break;
    case "set": case "add": case "mul": {
      if (!args || typeof args.target !== "string" || args.value === undefined) { err(path, `${name} needs { target, value }`); break; }
      const head = args.target.split(".")[0];
      if (!["self", "root"].includes(head) && !refs.entities.has(head)) {
        err(`${path}.target`, `target '${args.target}' must start with self, root, or an entity id`);
      }
      break;
    }
    case "signal": {
      const s = typeof args === "string" ? args : args && args.name;
      if (!s) err(path, "signal needs a name");
      break;
    }
    case "sound": {
      const id = typeof args === "string" ? args : args && args.id;
      if (!id) { err(path, 'sound needs a cue id — { sound: "enemy.hurt" } or { sound: { id } }'); break; }
      if (!CUE_IDS.includes(id)) err(typeof args === "string" ? path : `${path}.id`, `unknown sound cue '${id}'`);
      if (args && typeof args === "object") {
        if (args.gain !== undefined && (typeof args.gain !== "number" || args.gain < 0 || args.gain > 2)) err(`${path}.gain`, "gain must be a number 0-2");
        if (args.pitch !== undefined && (typeof args.pitch !== "number" || args.pitch <= 0)) err(`${path}.pitch`, "pitch must be a positive number");
      }
      break;
    }
    case "destroy": case "detach": case "enable": case "disable":
      if (args && args.target !== undefined) checkEntityTarget(err, args.target, `${path}.target`, refs);
      break;
    case "if":
      if (!args || args.when === undefined || !Array.isArray(args.then)) { err(path, "if needs { when, then: [...] }"); break; }
      checkExpr(err, args.when, `${path}.when`);
      checkSteps(err, args.then, `${path}.then`, refs, { instantOnly: true });
      if (args.else) checkSteps(err, args.else, `${path}.else`, refs, { instantOnly: true });
      break;
    case "wait": {
      const ok = typeof args === "number" ? args > 0 : args && Array.isArray(args.range) && args.range.length === 2;
      if (!ok) err(path, "wait needs a positive number or { range: [min, max] }");
      break;
    }
    case "moveTo":
      if (!args || (!args.target && !args.at)) err(path, "moveTo needs { target } or { at: [x, y] }");
      checkOffset(err, args, path);
      break;
    case "dash":
      if (!args || !(args.duration > 0)) err(path, "dash needs { duration > 0 }");
      checkOffset(err, args, path);
      break;
  }
}

// moveTo/dash may carry offset: [along, up] — along the line to the target
// (positive = past it), up vertical. Two numbers or nothing.
function checkOffset(err, args, path) {
  if (!args || args.offset === undefined) return;
  const o = args.offset;
  if (!Array.isArray(o) || o.length !== 2 || o.some((v) => typeof v !== "number")) {
    err(`${path}.offset`, "offset must be [along, up] (two numbers)");
  }
}

function checkEntityTarget(err, target, path, refs) {
  if (target === "self" || target === "root") return;
  if (!refs.entities.has(target)) err(path, `no entity with id '${target}'`);
}

// ---- helpers --------------------------------------------------------------

function checkExpr(err, src, path) {
  try {
    parseExpr(src);
  } catch (e) {
    err(path, `bad expression: ${e.message}`);
  }
}

function checkRange(err, path, value, range) {
  if (value === undefined || !range) return;
  if (typeof value !== "number" || Number.isNaN(value)) { err(path, "must be a number"); return; }
  const [lo, hi] = range;
  if (value < lo || value > hi) err(path, `out of range (${lo}–${hi})`);
}

// ---- spawn-cycle analysis -------------------------------------------------
// Build the "def X can cause def Y to exist" graph from every emitter ref,
// spawn action, and transform policy, then reject cycles: a seeker whose death
// spawns seekers is a spawn bomb no matter what the runtime caps do.

function checkSpawnCycles(err, spec, defIds) {
  const graph = new Map(); // defId → Set<defId>
  for (const id of defIds) graph.set(id, new Set());

  const refsInEntity = (e, out) => {
    if (!e || typeof e !== "object") return;
    for (const em of Object.values(e.emitters || {})) if (em.ref && defIds.has(em.ref)) out.add(em.ref);
    if (e.link && defIds.has(e.link.transformTo)) out.add(e.link.transformTo);
    const scanSteps = (steps) => {
      for (const s of steps || []) {
        if (s.spawn && defIds.has(s.spawn.ref)) out.add(s.spawn.ref);
        if (s.if) { scanSteps(s.if.then); scanSteps(s.if.else); }
      }
    };
    for (const actions of Object.values(e.on || {})) scanSteps(actions);
    for (const c of e.children || []) refsInEntity(c, out);
  };

  for (const [id, def] of Object.entries(spec.defs || {})) refsInEntity(def, graph.get(id));

  // DFS cycle detection
  const state = new Map(); // 0 = visiting, 1 = done
  const visit = (id, trail) => {
    if (state.get(id) === 1) return null;
    if (state.get(id) === 0) return [...trail, id];
    state.set(id, 0);
    for (const next of graph.get(id) || []) {
      const cycle = visit(next, [...trail, id]);
      if (cycle) return cycle;
    }
    state.set(id, 1);
    return null;
  };
  for (const id of defIds) {
    const cycle = visit(id, []);
    if (cycle) {
      err(`defs.${id}`, `recursive spawn cycle: ${cycle.join(" → ")} (a def may not cause itself to spawn)`);
      break;
    }
  }
}
