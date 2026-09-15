// ---------------------------------------------------------------------------
// SOLDIER PROGRESSION — the rules as data, and the pure derivation over them.
//
// design/soldier-progression.md · tech/soldier-progression.md (P1).
//
// A soldier stores three things: authored `stats` (never written), lifetime
// `xp`, and a `primary`/`secondary` attribute id. Everything else — level, XP
// into the level, bonuses, effective stats — is DERIVED here from those three
// and a definition, on every read. Nothing derived is stored anywhere, which is
// what keeps authored stats distinct from growth.
//
// DOM-free and storage-free. Callers hand in the definition they mean: the
// campaign's snapshot, not whatever this module ships.
// ---------------------------------------------------------------------------

export const ATTRIBUTE_IDS = ["aim", "health", "speed", "nerve"];

// Grant targets. The three groups resolve per soldier; an attribute id targets
// that attribute directly (useful in a per-level override).
const GROUP_TARGETS = ["flatMaxHp", "primary", "secondary", "others"];
const HEALTH_POLICIES = ["preserveWounds", "preserveCurrentHp", "fullHeal"];
const OUTCOMES = ["success", "failure"];

const DEFAULT = {
  startLevel: 1,
  startXp: 0,
  maxLevel: 10,
  // Destination level -> XP needed from the level before it (not lifetime).
  xpCost: { 2: 10, 3: 20, 4: 40, 5: 80, 6: 160, 7: 320, 8: 640, 9: 1280, 10: 2560 },
  eligibility: { outcomes: ["success"], requireSurvival: true, requireExtraction: true },
  retainXpAtCap: true,
  attributes: { aim: {}, health: {}, speed: {}, nerve: {} },
  growthRules: [
    { id: "hp", target: "flatMaxHp", amount: 10, first: 2, every: 1, last: null },
    { id: "primary", target: "primary", amount: 1, first: 2, every: 1, last: null },
    { id: "secondary", target: "secondary", amount: 1, first: 2, every: 2, last: null },
    { id: "others", target: "others", amount: 1, first: 3, every: 3, last: null },
  ],
  // Destination level -> complete replacement grant list ([] grants nothing).
  levelOverrides: {},
  levelUpHealthPolicy: "preserveWounds",
};

/** A fresh copy of the shipped definition. */
export function defaultProgression() {
  return structuredClone(DEFAULT);
}

// ---- validation ------------------------------------------------------------

const isInt = (v) => Number.isSafeInteger(v);
const isPosInt = (v) => isInt(v) && v > 0;
const isNonNegInt = (v) => isInt(v) && v >= 0;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function checkGrant(g, path, errors) {
  if (!isObj(g)) return errors.push({ path, message: "must be an object" });
  const attr = ATTRIBUTE_IDS.includes(g.target);
  if (!GROUP_TARGETS.includes(g.target) && !attr) {
    errors.push({ path: `${path}.target`, message: `unknown target "${g.target}"` });
  }
  const needsInt = g.target !== "flatMaxHp";
  const okAmount = needsInt ? isNonNegInt(g.amount) : Number.isFinite(g.amount) && g.amount >= 0;
  if (!okAmount) {
    errors.push({ path: `${path}.amount`, message: needsInt ? "must be a non-negative integer" : "must be a finite number ≥ 0" });
  }
}

/**
 * Every problem with a definition, each with its field path. `ok` is true only
 * when the list is empty. A caller holding a working definition keeps it on
 * failure — this never mutates its input.
 *
 * `context` is optional: pass `{ soldiers, baseHp, hpPerHealth }` to also check
 * that every soldier's maximum HP stays positive.
 */
export function validateProgression(def, context = {}) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });
  if (!isObj(def)) return { ok: false, errors: [{ path: "", message: "must be an object" }] };

  // Curve.
  if (!isPosInt(def.startLevel)) err("startLevel", "must be a positive integer");
  if (!isPosInt(def.maxLevel)) err("maxLevel", "must be a positive integer");
  const curveShaped = isPosInt(def.startLevel) && isPosInt(def.maxLevel);
  if (curveShaped && def.startLevel > def.maxLevel) err("startLevel", "cannot exceed maxLevel");
  if (!isNonNegInt(def.startXp)) err("startXp", "must be a non-negative integer");
  if (!isObj(def.xpCost)) err("xpCost", "must be an object of destination level → cost");
  else if (curveShaped && def.startLevel <= def.maxLevel) {
    let total = 0;
    for (let l = def.startLevel + 1; l <= def.maxLevel; l++) {
      const c = def.xpCost[l];
      if (!isPosInt(c)) err(`xpCost.${l}`, "must be a positive integer");
      else total += c;
    }
    for (const k of Object.keys(def.xpCost)) {
      const l = Number(k);
      if (!isInt(l) || l <= def.startLevel || l > def.maxLevel) err(`xpCost.${k}`, "is not a reachable transition");
    }
    if (!Number.isSafeInteger(total)) err("xpCost", "cumulative XP exceeds safe integer range");
    const first = def.xpCost[def.startLevel + 1];
    if (isNonNegInt(def.startXp) && isPosInt(first) && def.startXp >= first) {
      err("startXp", `must be below the first threshold (${first})`);
    }
  }

  // Eligibility and policy.
  const e = def.eligibility;
  if (!isObj(e)) err("eligibility", "must be an object");
  else {
    if (!Array.isArray(e.outcomes)) err("eligibility.outcomes", "must be a list");
    else e.outcomes.forEach((o, i) => { if (!OUTCOMES.includes(o)) err(`eligibility.outcomes.${i}`, `unknown outcome "${o}"`); });
    if (typeof e.requireSurvival !== "boolean") err("eligibility.requireSurvival", "must be true or false");
    if (typeof e.requireExtraction !== "boolean") err("eligibility.requireExtraction", "must be true or false");
  }
  if (typeof def.retainXpAtCap !== "boolean") err("retainXpAtCap", "must be true or false");
  if (!HEALTH_POLICIES.includes(def.levelUpHealthPolicy)) {
    err("levelUpHealthPolicy", `unknown policy "${def.levelUpHealthPolicy}"`);
  }

  // Attributes.
  if (!isObj(def.attributes)) err("attributes", "must be an object");
  else {
    for (const [id, a] of Object.entries(def.attributes)) {
      if (!ATTRIBUTE_IDS.includes(id)) err(`attributes.${id}`, "unknown attribute");
      else if (!isObj(a)) err(`attributes.${id}`, "must be an object");
      else if (a.cap != null && !isPosInt(a.cap)) err(`attributes.${id}.cap`, "must be a positive integer");
    }
    for (const id of ATTRIBUTE_IDS) if (!(id in def.attributes)) err(`attributes.${id}`, "is missing");
  }

  // Rules.
  if (!Array.isArray(def.growthRules)) err("growthRules", "must be a list");
  else {
    const seen = new Set();
    def.growthRules.forEach((r, i) => {
      const p = `growthRules.${i}`;
      if (!isObj(r)) return err(p, "must be an object");
      if (typeof r.id !== "string" || !r.id) err(`${p}.id`, "must be a non-empty string");
      else if (seen.has(r.id)) err(`${p}.id`, `duplicate rule id "${r.id}"`);
      else seen.add(r.id);
      checkGrant(r, p, errors);
      if (!isPosInt(r.first)) err(`${p}.first`, "must be a positive integer");
      if (!isPosInt(r.every)) err(`${p}.every`, "must be a positive integer");
      if (r.last != null && (!isPosInt(r.last) || (isPosInt(r.first) && r.last < r.first))) {
        err(`${p}.last`, "must be a positive integer ≥ first, or empty");
      }
    });
  }

  // Overrides.
  if (!isObj(def.levelOverrides)) err("levelOverrides", "must be an object");
  else {
    for (const [k, list] of Object.entries(def.levelOverrides)) {
      const l = Number(k);
      const p = `levelOverrides.${k}`;
      if (!isInt(l) || (curveShaped && (l <= def.startLevel || l > def.maxLevel))) err(p, "is not a reachable level");
      if (!Array.isArray(list)) err(p, "must be a list of grants");
      else list.forEach((g, i) => checkGrant(g, `${p}.${i}`, errors));
    }
  }

  // Soldiers' assignments and HP, when the caller gave us some.
  if (!errors.length && Array.isArray(context.soldiers)) {
    for (const s of context.soldiers) {
      for (const slot of ["primary", "secondary"]) {
        if (s[slot] != null && !ATTRIBUTE_IDS.includes(s[slot])) err(`soldiers.${s.id}.${slot}`, `unknown attribute "${s[slot]}"`);
      }
      if (Number.isFinite(context.baseHp) && Number.isFinite(context.hpPerHealth)) {
        const r = resolveSoldier(def, s);
        if (!(context.baseHp + r.stats.health * context.hpPerHealth + r.hpBonus > 0)) {
          err(`soldiers.${s.id}`, "maximum HP must be positive");
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---- the curve -------------------------------------------------------------

/** Lifetime XP required to REACH `level` (0 at or below the starting level). */
export function thresholdFor(def, level) {
  let total = 0;
  for (let l = def.startLevel + 1; l <= Math.min(level, def.maxLevel); l++) total += def.xpCost[l];
  return total;
}

/** A soldier's lifetime XP; a soldier that predates the field is at startXp. */
export function xpOf(def, soldier) {
  return soldier && Number.isFinite(soldier.xp) ? soldier.xp : def.startXp;
}

/**
 * Where lifetime XP puts a soldier: `level`, `intoLevel` (XP past this level's
 * threshold), `nextCost` (XP this level's transition needs, or null at MAX) and
 * `max`. Surplus XP carries: 50 from zero is level 3 with 20 of 40.
 */
export function levelInfo(def, xp) {
  let level = def.startLevel;
  let floor = 0;
  while (level < def.maxLevel && xp >= floor + def.xpCost[level + 1]) {
    floor += def.xpCost[level + 1];
    level += 1;
  }
  const max = level >= def.maxLevel;
  return { level, xp, intoLevel: xp - floor, nextCost: max ? null : def.xpCost[level + 1], max };
}

/**
 * Lifetime XP after an award. Past the cap it keeps growing unless the
 * definition says not to, in which case it stops at the cap's threshold.
 */
export function addXp(def, xp, amount) {
  const next = xp + Math.max(0, amount);
  if (def.retainXpAtCap) return next;
  return Math.min(next, Math.max(xp, thresholdFor(def, def.maxLevel)));
}

// ---- growth ----------------------------------------------------------------

/** The grant list for arriving at `level` — the override if one exists. */
export function grantsAt(def, level) {
  if (level <= def.startLevel || level > def.maxLevel) return [];
  const o = def.levelOverrides[level];
  if (Array.isArray(o)) return o;
  return def.growthRules.filter((r) => {
    const last = r.last == null ? def.maxLevel : r.last;
    return level >= r.first && level <= last && (level - r.first) % r.every === 0;
  });
}

// The attribute ids a group target resolves to for one soldier. A soldier
// drawn the same attribute twice is primary AND secondary in it, and has three
// others instead of two.
function targetsFor(target, soldier) {
  if (ATTRIBUTE_IDS.includes(target)) return [target];
  const p = soldier.primary;
  const s = soldier.secondary;
  if (target === "primary") return ATTRIBUTE_IDS.includes(p) ? [p] : [];
  if (target === "secondary") return ATTRIBUTE_IDS.includes(s) ? [s] : [];
  if (target === "others") return ATTRIBUTE_IDS.filter((a) => a !== p && a !== s);
  return [];
}

function emptyBonus() {
  return { hp: 0, attrs: Object.fromEntries(ATTRIBUTE_IDS.map((a) => [a, 0])) };
}

function addGrants(bonus, grants, soldier) {
  for (const g of grants) {
    if (g.target === "flatMaxHp") bonus.hp += g.amount;
    else for (const a of targetsFor(g.target, soldier)) bonus.attrs[a] += g.amount;
  }
  return bonus;
}

/** What arriving at exactly `level` grants this soldier: `{ hp, attrs }`. */
export function gainsAt(def, level, soldier) {
  return addGrants(emptyBonus(), grantsAt(def, level), soldier);
}

/** Every grant from the starting level up to and including `level`. */
export function bonusesThrough(def, level, soldier) {
  const bonus = emptyBonus();
  for (let l = def.startLevel + 1; l <= Math.min(level, def.maxLevel); l++) {
    addGrants(bonus, grantsAt(def, l), soldier);
  }
  return bonus;
}

/**
 * Everything a readout or a mission needs about one soldier under `def`:
 * level info, cumulative bonuses, effective `stats` and the flat `hpBonus`.
 * Authored stats are read, never written. A cap bounds growth only — it never
 * lowers an authored stat that already sits above it.
 */
export function resolveSoldier(def, soldier) {
  const info = levelInfo(def, xpOf(def, soldier));
  const bonus = bonusesThrough(def, info.level, soldier);
  const base = soldier.stats || {};
  const stats = { ...base };
  for (const a of ATTRIBUTE_IDS) {
    if (typeof base[a] !== "number") continue;
    const cap = def.attributes[a] && def.attributes[a].cap;
    const grown = base[a] + bonus.attrs[a];
    stats[a] = cap == null ? grown : Math.max(base[a], Math.min(grown, cap));
  }
  return { ...info, bonus, stats, hpBonus: bonus.hp };
}

/**
 * A shallow copy of the soldier carrying effective `stats` and `hpBonus` in
 * place of its authored stats — the shape `soldierMaxHp` and every stat readout
 * take. The copy is for reading; the roster soldier itself is never changed.
 */
export function effectiveSoldier(def, soldier) {
  const r = resolveSoldier(def, soldier);
  return { ...soldier, stats: r.stats, hpBonus: r.hpBonus };
}
