// ---------------------------------------------------------------------------
// CUSTOM CONTENT — user-authored weapons and enemies, persisted to localStorage.
//
// The editor's GUI tools (Weapon Designer, Enemy Designer) live on a SEPARATE
// page from the running game with separate module state, so they cannot push
// into the game's in-memory `state`. Instead they save content-shaped JSON here;
// the game reads it back at load time (`createState()` / `loadMission`). Same
// live-vs-load-time caveat as config.js: reload the game after saving.
//
// Storage is browser-local. To make a custom weapon/enemy permanent, export its
// JSON from the tool and paste it into content.js (WEAPONS / ENEMIES).
//
// Every localStorage access is guarded (try/catch + typeof check) so importing
// this module under node — for tests or SSR — never throws.
// ---------------------------------------------------------------------------

import { WEAPONS, ENEMIES } from "./content.js";

const WEAPON_KEY = "sidescroller.weapons.v1";
const ENEMY_KEY = "sidescroller.enemies.v1";

// ---- guarded storage ------------------------------------------------------

function readStore(key) {
  try {
    if (typeof localStorage === "undefined") return [];
    const arr = JSON.parse(localStorage.getItem(key));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeStore(key, arr) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    /* private mode / unavailable — custom content just won't persist */
  }
}

// ---- id helpers -----------------------------------------------------------

function slug(s, fallback) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
}

// Return `base` if free, else the first free `base_2`, `base_3`, … `taken` is a
// Set of ids that already exist (reserved built-ins + other custom entries).
function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

// Shared save: upsert by id into a keyed store. If `item.id` already names an
// existing CUSTOM entry, overwrite it (a re-save of the same design). Otherwise
// mint an id unique across `reserved` built-in keys and the other custom ids so
// a custom entry can never shadow a built-in or collide with a sibling.
function saveInto(key, item, reserved, fallbackId) {
  const list = readStore(key);
  const desired = slug(item.id || item.name, fallbackId);
  const existing = list.findIndex((it) => it.id === desired);

  if (existing >= 0) {
    const id = desired;
    list[existing] = { ...item, id };
    writeStore(key, list);
    return { ok: true, id };
  }

  const taken = new Set([...reserved, ...list.map((it) => it.id)]);
  const id = uniqueId(desired, taken);
  list.push({ ...item, id });
  writeStore(key, list);
  return { ok: true, id };
}

function deleteFrom(key, id) {
  const list = readStore(key);
  const next = list.filter((it) => it.id !== id);
  const removed = next.length !== list.length;
  if (removed) writeStore(key, next);
  return { ok: removed };
}

function mapOf(list) {
  const m = {};
  for (const it of list) m[it.id] = it;
  return m;
}

// ---- weapons --------------------------------------------------------------

export function listCustomWeapons() {
  return readStore(WEAPON_KEY);
}

export function saveCustomWeapon(weapon) {
  return saveInto(WEAPON_KEY, weapon, Object.keys(WEAPONS), "custom_weapon");
}

export function deleteCustomWeapon(id) {
  return deleteFrom(WEAPON_KEY, id);
}

export function customWeaponMap() {
  return mapOf(readStore(WEAPON_KEY));
}

// ---- enemies --------------------------------------------------------------

export function listCustomEnemies() {
  return readStore(ENEMY_KEY);
}

export function saveCustomEnemy(enemy) {
  return saveInto(ENEMY_KEY, enemy, Object.keys(ENEMIES), "custom_enemy");
}

export function deleteCustomEnemy(id) {
  return deleteFrom(ENEMY_KEY, id);
}

export function customEnemyMap() {
  return mapOf(readStore(ENEMY_KEY));
}
