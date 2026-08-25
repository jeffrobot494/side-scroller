// ---------------------------------------------------------------------------
// ENEMY DELTA STORE — what this browser has changed about the enemy list.
//
// There is ONE list of enemies (src/game/enemyspecs.js). It lives in the repo,
// it is read on every load, and it is the same list for everyone who has the
// build. This module holds only what THIS browser has done to it — the same
// override-layer shape config.js and weaponoverrides.js already use, with three
// delta kinds instead of one (tech/enemy-designer.md, E6):
//
//   records[id]  a whole record that replaces the file's entry of that id, OR —
//                if the file has no such id — an addition.
//   removed[id]  a tombstone. The file still ships it; this browser does not
//                have it. Deleting an addition just drops its record.
//   flags[id]    the in-missions switch, overriding the record's own default.
//
// THE MERGE is one pass: file → drop tombstones → replace edits → append
// additions → overlay flags. A clean browser therefore merges to exactly the
// file, which is what keeps test/levelgen-golden.test.mjs frozen.
//
// A delta is a WHOLE RECORD, not a field-level patch (approximation 13): edit
// one enemy and your copy wins that id entirely. The one relief is that an
// override which no longer DIFFERS from the file is dropped on read, so once a
// commit catches up with your edit the entry goes back to being the file's.
//
// This module imports NOTHING from enemyspecs.js — the file list is passed in
// to mergeEnemies() — so the import runs one way and the store never has to
// know what the file ships.
//
// Every localStorage access is guarded (try/catch + typeof check) so importing
// this module under node never throws.
// ---------------------------------------------------------------------------

import { diffSpecs } from "./enemyspec/specdiff.js";

const KEY = "sidescroller.enemylist.v1";

// E4's two stores, read ONCE and converted (approximation 16). Delete this
// migration and its keys when nobody can still be carrying them.
const OLD_ROSTER_KEY = "sidescroller.enemyroster.v1";
const OLD_LIBRARY_KEY = "sidescroller.enemyspecs.v1";

// A record's placement hint is authored, never derived — but a record has to be
// born with one, because fillEnemies reads the field directly and `undefined`
// quietly means "never preferred on a perch". This is the SEED for a new record
// and nothing else reads it (approximation 6).
const ROLE_BEHAVIOR = {
  fodder: "charger", charger: "charger", tank: "charger", elite: "charger",
  skirmisher: "shooter", artillery: "shooter", support: "shooter", boss: "shooter",
};

/** The generator's placement vocabulary (src/game/gen/levelgen.js fillEnemies). */
export const PLACEMENTS = ["charger", "shooter", "turret"];

/** The hint a brand-new record starts with. Authored from there on. */
export function seedBehavior(role) {
  return ROLE_BEHAVIOR[role] || "shooter";
}

/** Build a record around a spec. `behavior` seeds itself from the spec's role. */
export function makeRecord(spec, { behavior, inMissions = true } = {}) {
  return {
    spec,
    behavior: PLACEMENTS.includes(behavior) ? behavior : seedBehavior(spec && spec.role),
    inMissions: !!inMissions,
  };
}

// ---- guarded storage ------------------------------------------------------

function blank() {
  return { v: 1, records: {}, removed: {}, flags: {} };
}

function sane(obj) {
  const out = blank();
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  const rec = obj.records;
  if (rec && typeof rec === "object" && !Array.isArray(rec)) {
    for (const [id, r] of Object.entries(rec)) {
      if (r && typeof r === "object" && r.spec && typeof r.spec === "object") {
        out.records[id] = makeRecord(r.spec, r);
      }
    }
  }
  if (obj.removed && typeof obj.removed === "object") {
    for (const id of Object.keys(obj.removed)) if (obj.removed[id]) out.removed[id] = true;
  }
  if (obj.flags && typeof obj.flags === "object") {
    for (const [id, on] of Object.entries(obj.flags)) out.flags[id] = !!on;
  }
  return out;
}

function readRaw() {
  try {
    if (typeof localStorage === "undefined") return null;
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

function writeStore(store) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* private mode / unavailable — edits just won't persist */
  }
}

/** The deltas as stored, sanitised. Migrates E4's stores the first time. */
export function readDeltas() {
  const raw = readRaw();
  if (raw) return sane(raw);
  const migrated = migrate();
  writeStore(migrated); // even when empty, so migration runs exactly once
  return migrated;
}

// ---- migration (approximation 16) -----------------------------------------
// E4's roster store held admitted specs plus a disabled set; the Designer's
// library held specs the game could not place at all. Both become records:
// the roster's carry their enable flag, the library's arrive switched OFF,
// because they were never placeable and migration must not put an enemy in a
// mission the author never asked for.

function migrate() {
  const out = blank();
  let roster = null;
  let library = null;
  try {
    if (typeof localStorage !== "undefined") {
      roster = JSON.parse(localStorage.getItem(OLD_ROSTER_KEY));
      library = JSON.parse(localStorage.getItem(OLD_LIBRARY_KEY));
    }
  } catch {
    return out;
  }

  const off = roster && roster.off && typeof roster.off === "object" ? roster.off : {};
  // A disabled id the roster store never held a spec for is a FILE entry that
  // was switched off — that survives as a flag.
  const admitted = new Set();
  if (roster && Array.isArray(roster.specs)) {
    for (const spec of roster.specs) {
      if (!spec || typeof spec !== "object" || !spec.id) continue;
      admitted.add(spec.id);
      out.records[spec.id] = makeRecord(spec, { inMissions: !off[spec.id] });
      out.flags[spec.id] = !off[spec.id];
    }
  }
  for (const id of Object.keys(off)) if (off[id] && !admitted.has(id)) out.flags[id] = false;

  if (Array.isArray(library)) {
    for (const spec of library) {
      if (!spec || typeof spec !== "object" || !spec.id) continue;
      if (out.records[spec.id]) continue; // the roster's copy is the admitted one
      out.records[spec.id] = makeRecord(spec, { inMissions: false });
      out.flags[spec.id] = false;
    }
  }
  return out;
}

// ---- the merge ------------------------------------------------------------

// Two records are the same when their specs and their placement hints match.
// `inMissions` is deliberately excluded: the switch writes a flag, so flipping
// it must not make an untouched entry read as edited.
function sameRecord(a, b) {
  return a && b && a.behavior === b.behavior && diffSpecs(a.spec, b.spec).length === 0;
}

/**
 * file → drop tombstones → replace edits → append additions → overlay flags.
 *
 * @param {Array<{spec, behavior, inMissions}>} fileRecords  src/game/enemyspecs.js's list
 * @returns {Array<{spec, behavior, inMissions, origin:"file"|"edited"|"added"}>}
 */
export function mergeEnemies(fileRecords) {
  const d = readDeltas();
  const out = [];
  const fromFile = new Set();

  for (const rec of fileRecords) {
    const id = rec.spec.id;
    fromFile.add(id);
    if (d.removed[id]) continue;
    const over = d.records[id];
    // An override that no longer differs is dropped, so the `edited` mark
    // clears itself once a commit catches up with what this browser did.
    if (over && !sameRecord(over, rec)) out.push({ ...over, origin: "edited" });
    else out.push({ ...rec, origin: "file" });
  }

  for (const [id, rec] of Object.entries(d.records)) {
    if (fromFile.has(id) || d.removed[id]) continue;
    out.push({ ...rec, origin: "added" });
  }

  return out.map((r) =>
    Object.prototype.hasOwnProperty.call(d.flags, r.spec.id)
      ? { ...r, inMissions: d.flags[r.spec.id] }
      : r
  );
}

// ---- writes ---------------------------------------------------------------

/**
 * Write a record. The id decides what kind of delta this is with no argument:
 * the file has it → an edit; it does not → an addition. Either way a tombstone
 * for that id is lifted, so saving over something you deleted brings it back.
 * @returns {{ok:true, id:string}|{ok:false, error:string}}
 */
export function saveEnemy(record) {
  const id = record && record.spec && typeof record.spec.id === "string" ? record.spec.id : "";
  if (!id) return { ok: false, error: "an enemy needs an id" };
  const d = readDeltas();
  const rec = makeRecord(structuredClone(record.spec), record);
  d.records[id] = rec;
  delete d.removed[id];
  if (!Object.prototype.hasOwnProperty.call(d.flags, id)) d.flags[id] = rec.inMissions;
  writeStore(d);
  return { ok: true, id };
}

/**
 * Drop an enemy from this browser's list. An addition disappears; a file entry
 * gets a tombstone. The never-empty and last-boss rules are enemyspecs.js's —
 * this is the raw write.
 */
export function removeEnemy(id) {
  const d = readDeltas();
  const wasAdded = !!d.records[id];
  delete d.records[id];
  delete d.flags[id];
  // Tombstoned even when it was an addition: the tombstone means "this browser
  // does not have this id", so a later commit that ships the id does not undo
  // the deletion. revertEnemy() is how you take it back.
  d.removed[id] = true;
  writeStore(d);
  return { ok: true, id, wasAdded };
}

/** Undo this browser's edit or tombstone for one id — the file's version wins. */
export function revertEnemy(id) {
  const d = readDeltas();
  const had = !!d.records[id] || !!d.removed[id];
  delete d.records[id];
  delete d.removed[id];
  writeStore(d);
  return { ok: had, id };
}

/** Raw in-missions write. The refusals live in enemyspecs.js. */
export function setInMissions(id, on) {
  const d = readDeltas();
  d.flags[id] = !!on;
  writeStore(d);
  return !!on;
}

/** Wipe every delta — "reset my changes", and test setup. */
export function clearEnemyDeltas() {
  writeStore(blank());
}
