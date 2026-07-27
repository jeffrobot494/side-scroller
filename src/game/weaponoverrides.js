// ---------------------------------------------------------------------------
// WEAPON OVERRIDES — editor edits applied on top of built-in arsenal weapons.
//
// A browser cannot write arsenal.js, so "load a built-in, rebalance it, save"
// stores a PATCH here and applies it over the built-in at startup. Same
// override-layer shape as config.js (defaults in source, tweaks in
// localStorage, "make it permanent" = paste the JSON back into the source).
//
// Deliberately a SEPARATE store from customcontent.js's custom weapons:
//   - createState() builds `armory: [WEAPONS.carbine, ...listCustomWeapons()]`,
//     so an override living in the custom store would put TWO entries with the
//     same id in the armory and hub.js's .find() would pick the un-overridden
//     one. Overrides are patches on existing weapons, not new weapons.
//   - customcontent.js's anti-shadow rule (a custom weapon can never claim a
//     built-in id) therefore stays intact, with no bypass.
//
// Imports ARSENAL_BY_ID from arsenal.js, which depends only on weaponcost.js —
// no import cycle, and content.js is untouched. Because content.js builds
// WEAPONS from the very same objects, mutating one entry updates both maps and
// the BLUEPRINTS that hold direct references to them.
//
// Every localStorage access is guarded (try/catch + typeof check) so importing
// this module under node never throws.
// ---------------------------------------------------------------------------

import { ARSENAL_BY_ID } from "./arsenal.js";

const KEY = "sidescroller.weaponoverrides.v1";

// ---- guarded storage ------------------------------------------------------

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
    /* private mode / unavailable — overrides just won't persist */
  }
}

// ---- pristine snapshots ---------------------------------------------------
// Applying an override MUTATES the shared arsenal object (see the header), which
// destroys the original in memory. Snapshot it the first time we touch it so
// Revert has something to restore and so re-applying is not cumulative — an
// override that drops a key the built-in had must actually drop it, which a
// bare Object.assign can never do.

const pristine = new Map();

function snapshot(id) {
  if (!pristine.has(id) && ARSENAL_BY_ID[id]) pristine.set(id, structuredClone(ARSENAL_BY_ID[id]));
  return pristine.get(id);
}

// Reset a live entry to its as-authored state WITHOUT replacing the object —
// BLUEPRINTS and WEAPONS hold this exact reference.
function restore(id) {
  const snap = pristine.get(id);
  const live = ARSENAL_BY_ID[id];
  if (!snap || !live) return false;
  for (const k of Object.keys(live)) delete live[k];
  Object.assign(live, structuredClone(snap));
  return true;
}

// ---- api ------------------------------------------------------------------

/** True if `id` names a built-in that can carry an override. */
export function isBuiltinWeapon(id) {
  return Object.prototype.hasOwnProperty.call(ARSENAL_BY_ID, id);
}

/** All stored overrides as an id-keyed map (a copy; mutating it does nothing). */
export function listOverrides() {
  return readStore();
}

export function getOverride(id) {
  return readStore()[id] || null;
}

export function isOverridden(id) {
  return Object.prototype.hasOwnProperty.call(readStore(), id);
}

/**
 * Store `weapon` as the override for its own id and apply it immediately.
 * Rejects ids that aren't built-ins — a new weapon belongs in the custom store,
 * where the anti-shadow rule can do its job.
 */
export function saveOverride(weapon) {
  const id = weapon && weapon.id;
  if (!isBuiltinWeapon(id)) return { ok: false, id };
  const store = readStore();
  store[id] = { ...weapon, id };
  writeStore(store);
  applyOne(id, store[id]);
  return { ok: true, id };
}

/** Drop the override and put the built-in back as authored, no reload needed. */
export function deleteOverride(id) {
  const store = readStore();
  if (!Object.prototype.hasOwnProperty.call(store, id)) return { ok: false, id };
  delete store[id];
  writeStore(store);
  restore(id);
  return { ok: true, id };
}

// An override is the weapon's WHOLE shape, not a patch layered over the
// built-in: the designer only ever saves a complete working copy, and "Copy
// JSON → paste into arsenal.js" means that JSON has to stand on its own. So
// clear the live object and assign — Object.assign alone could never remove a
// key the built-in had (drop `sounds` from concussion_gun and it would come
// straight back), and it would make re-applying cumulative.
function applyOne(id, override) {
  const live = ARSENAL_BY_ID[id];
  if (!live) return false;
  snapshot(id); // before the first mutation, or Revert has nothing to go back to
  for (const k of Object.keys(live)) delete live[k];
  Object.assign(live, structuredClone(override), { id });
  return true;
}

/**
 * Apply every stored override over the built-in arsenal, in place.
 *
 * Called explicitly (not as an import side effect) from BOTH pages: the game's
 * createState() and the editor's boot. The editor needs its own call because
 * the Firing Room reads ARSENAL straight from arsenal.js and never builds a
 * state — without it, the tool that authored an override would sit on a page
 * that doesn't show it. Idempotent: safe to call more than once.
 *
 * @returns {string[]} the ids that were applied
 */
export function applyWeaponOverrides() {
  const store = readStore();
  const applied = [];
  for (const id of Object.keys(store)) if (applyOne(id, store[id])) applied.push(id);
  return applied;
}
