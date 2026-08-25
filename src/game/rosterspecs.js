// ---------------------------------------------------------------------------
// ENEMY ROSTER STORE — which enemies the level generator is allowed to place.
//
// A browser cannot write enemyspecs.js, so "I made this thing and I want to
// meet it in a mission" stores the admitted spec here and enemyspecs.js merges
// it into the generation roster at load (tech/enemy-designer.md, E4). Same
// override-layer shape as weaponoverrides.js: defaults in source, additions in
// localStorage, "make it permanent" = paste the JSON into enemyspecs.js.
//
// This module is the STORE and the ADMISSION GATE, nothing else. It imports
// NOTHING from enemyspecs.js — the caller passes the reserved ids in — so the
// merge can live there on one side of a one-way import. The "never empty"
// policy is not here either: it spans built-ins, which this module cannot see.
//
// Membership stores a SNAPSHOT of the spec, not a pointer into the Designer's
// library (customcontent.js). The library is a scratchpad; deleting a scratch
// entry must not silently empty the roster and change what missions generate.
//
// ADMISSION is stricter than Save. Save gates on accept() at 4 seconds because
// you are iterating; the roster gates at 12 (approximation 5 — longer, not more
// realistic) and additionally demands a declared `threat`, because the
// generator budgets on it and a spec without one would be placed for free.
//
// Every localStorage access is guarded (try/catch + typeof check) so importing
// this module under node never throws.
// ---------------------------------------------------------------------------

import { accept } from "./enemyspec/generate.js";

const KEY = "sidescroller.enemyroster.v1";

// Longer than the Designer's save gate (4s). A spec that only misbehaves after
// its first cooldown cycle should not reach a mission.
export const ROSTER_DRYRUN_SECONDS = 12;

// ---- guarded storage ------------------------------------------------------

function readStore() {
  try {
    if (typeof localStorage === "undefined") return blank();
    const obj = JSON.parse(localStorage.getItem(KEY));
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return blank();
    return {
      specs: Array.isArray(obj.specs) ? obj.specs.filter((s) => s && typeof s === "object" && s.id) : [],
      off: obj.off && typeof obj.off === "object" && !Array.isArray(obj.off) ? obj.off : {},
    };
  } catch {
    return blank();
  }
}

function writeStore(store) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* private mode / unavailable — the roster just won't persist */
  }
}

function blank() {
  return { specs: [], off: {} };
}

// ---- membership -----------------------------------------------------------

/** Every admitted custom spec, newest last. A copy — mutating it does nothing. */
export function listRosterSpecs() {
  return readStore().specs.map((s) => structuredClone(s));
}

export function rosterSpec(id) {
  return listRosterSpecs().find((s) => s.id === id) || null;
}

export function inRoster(id) {
  return readStore().specs.some((s) => s.id === id);
}

/**
 * Admit a spec to the roster, or update the one already holding its id.
 *
 * The id is PINNED, not slugged: a roster entry is a name the generator and
 * loadMission both resolve by, so silently minting `husk_charger_2` (which the
 * library does) would put an enemy in missions under a name its author never
 * saw. A collision with a built-in is refused instead.
 *
 * @param {object} spec
 * @param {{ reserved?: string[], seconds?: number }} [opts]  built-in ids to refuse
 * @returns {{ok:true, id:string, replaced:boolean} | {ok:false, errors:string[]}}
 */
export function admitSpec(spec, { reserved = [], seconds = ROSTER_DRYRUN_SECONDS } = {}) {
  const id = spec && typeof spec.id === "string" ? spec.id : "";
  if (!id) return { ok: false, errors: ["a roster enemy needs an id"] };
  if (reserved.includes(id)) {
    return { ok: false, errors: [`'${id}' is a built-in enemy — rename this one before adding it to the roster`] };
  }
  const threat = spec.threat;
  if (!Number.isFinite(threat) || threat <= 0) {
    return { ok: false, errors: ["a roster enemy must declare a threat cost — the generator budgets on it"] };
  }
  const res = accept(spec, { seconds });
  if (!res.ok) return { ok: false, errors: res.errors };

  const store = readStore();
  const at = store.specs.findIndex((s) => s.id === id);
  const replaced = at >= 0;
  if (replaced) store.specs[at] = structuredClone(spec);
  else store.specs.push(structuredClone(spec));
  delete store.off[id]; // admitting something turns it on
  writeStore(store);
  return { ok: true, id, replaced };
}

export function removeRosterSpec(id) {
  const store = readStore();
  const next = store.specs.filter((s) => s.id !== id);
  if (next.length === store.specs.length) return { ok: false, id };
  store.specs = next;
  delete store.off[id];
  writeStore(store);
  return { ok: true, id };
}

// ---- enable flags ---------------------------------------------------------
// Absent means enabled, so a store nobody has touched is exactly today's
// behaviour: every built-in on, no customs. That is what keeps the golden
// level file frozen.

export function isRosterEnabled(id) {
  return !readStore().off[id];
}

/** Raw write. Refusing the LAST enabled entry is enemyspecs.js's job. */
export function setRosterEnabled(id, on) {
  const store = readStore();
  if (on) delete store.off[id];
  else store.off[id] = true;
  writeStore(store);
  return !!on;
}

/** The disabled ids, as a set. */
export function disabledIds() {
  return new Set(Object.keys(readStore().off));
}

/** Wipe the store — the editor's "reset roster", and test setup. */
export function clearRoster() {
  writeStore(blank());
}
