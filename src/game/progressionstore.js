// ---------------------------------------------------------------------------
// PROGRESSION STORE — editor edits to the progression rules and to the recruits'
// primary/secondary, kept in this browser (tech/soldier-progression.md, P4).
//
// Same override-layer shape as weaponoverrides.js: the shipped rules live in
// source (progression.js, soldiers.js), a whole replacement lives in guarded
// localStorage, and "make it permanent" is Copy JSON → paste into the source.
// Kept out of progression.js so that module stays storage-free.
//
// Nothing invalid is ever written, and nothing invalid is ever read back: a
// stored definition that no longer validates (hand-edited, or from an older
// build) is ignored in favour of the shipped one, so a bad save can never
// reach a campaign. A node process (the room server, the test runner without a
// stub) has no localStorage and always gets the shipped rules.
// ---------------------------------------------------------------------------

import { ATTRIBUTE_IDS, defaultProgression, validateProgression } from "./progression.js";
import { RECRUIT_POOL } from "./soldiers.js";

const KEY = "sidescroller.progression.v1";

function readStore() {
  try {
    if (typeof localStorage === "undefined") return {};
    const obj = JSON.parse(localStorage.getItem(KEY));
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

function writeStore(obj) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    /* private mode / unavailable — edits just won't persist */
  }
}

// The authored pairs, captured before any override touches RECRUIT_POOL, so
// Revert and re-applying are never cumulative.
const pristinePairs = Object.fromEntries(RECRUIT_POOL.map((r) => [r.id, { primary: r.primary, secondary: r.secondary }]));

/** The recruits' shipped primary/secondary, by id (a copy). */
export function shippedAssignments() {
  return structuredClone(pristinePairs);
}

/** The rules a new campaign should run: a valid saved definition, else the shipped one. */
export function activeProgression() {
  const saved = readStore().definition;
  if (saved && validateProgression(saved).ok) return structuredClone(saved);
  return defaultProgression();
}

/** The recruits' pairs as they will be dealt: shipped, overlaid with valid saved ones. */
export function activeAssignments() {
  const out = shippedAssignments();
  const saved = readStore().assignments || {};
  for (const [id, pair] of Object.entries(saved)) {
    if (out[id] && pair && ATTRIBUTE_IDS.includes(pair.primary) && ATTRIBUTE_IDS.includes(pair.secondary)) {
      out[id] = { primary: pair.primary, secondary: pair.secondary };
    }
  }
  return out;
}

export function isCustomized() {
  const s = readStore();
  return !!(s.definition || s.assignments);
}

/**
 * Validate and store a definition and the recruits' pairs together. On any
 * error nothing is written and the previous saved state stands. `context`
 * passes through to validateProgression (the HP check).
 */
export function saveProgression(definition, assignments, context = {}) {
  const soldiers = RECRUIT_POOL.map((r) => ({ ...r, ...(assignments && assignments[r.id]) }));
  const unknown = Object.keys(assignments || {}).filter((id) => !pristinePairs[id]);
  const v = validateProgression(definition, { ...context, soldiers });
  const errors = [...v.errors, ...unknown.map((id) => ({ path: `soldiers.${id}`, message: "no such recruit" }))];
  if (errors.length) return { ok: false, errors };
  writeStore({ definition: structuredClone(definition), assignments: structuredClone(assignments || {}) });
  applyProgressionOverrides();
  return { ok: true, errors: [] };
}

/** Drop every edit. The next campaign runs the shipped rules and pairs. */
export function revertProgression() {
  writeStore({});
  applyProgressionOverrides();
}

/**
 * Put the active primary/secondary onto RECRUIT_POOL, in place — dealRecruits
 * and createPlayerState clone out of it, so every new base gets them. Called by
 * createWorld before it copies the rules, and by the editor at boot.
 * Idempotent. Returns the definition a new campaign should snapshot.
 */
export function applyProgressionOverrides() {
  const pairs = activeAssignments();
  for (const r of RECRUIT_POOL) Object.assign(r, pairs[r.id]);
  return activeProgression();
}
