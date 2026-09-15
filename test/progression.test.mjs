// Soldier progression P1 (tech/soldier-progression.md): the shipped definition,
// its validator, and the pure derivation. Every expected number below is copied
// from design/soldier-progression.md, not computed from the code under test.
import {
  ATTRIBUTE_IDS,
  defaultProgression,
  validateProgression,
  thresholdFor,
  levelInfo,
  addXp,
  grantsAt,
  gainsAt,
  bonusesThrough,
  resolveSoldier,
} from "../src/game/progression.js";
import { RECRUIT_POOL } from "../src/game/soldiers.js";

const soldier = (primary, secondary, xp, stats = { aim: 5, health: 5, speed: 5, nerve: 5 }) =>
  ({ id: "s", stats, primary, secondary, xp });

export default async function run(t) {
  const def = defaultProgression();

  // ---- the shipped definition is valid, and a copy ----
  t.ok("shipped definition validates", validateProgression(def).ok);
  def.maxLevel = 99;
  t.eq("defaultProgression hands out a fresh copy", defaultProgression().maxLevel, 10);
  def.maxLevel = 10;

  // ---- XP requirements table ----
  const lifetime = [0, 10, 30, 70, 150, 310, 630, 1270, 2550, 5110];
  for (let level = 1; level <= 10; level++) {
    const need = lifetime[level - 1];
    t.eq(`lifetime XP for level ${level}`, thresholdFor(def, level), need);
    t.eq(`exactly ${need} XP is level ${level}`, levelInfo(def, need).level, level);
    if (level > 1) t.eq(`${need - 1} XP is still level ${level - 1}`, levelInfo(def, need - 1).level, level - 1);
  }

  // ---- surplus, multiple levels, MAX ----
  {
    // The design's example: one Extreme mission from zero.
    const i = levelInfo(def, 50);
    t.eq("50 XP from zero → level 3, 20 of 40", [i.level, i.intoLevel, i.nextCost], [3, 20, 40]);
    const top = levelInfo(def, 5110);
    t.eq("5,110 XP is MAX", [top.level, top.max, top.nextCost], [10, true, null]);
    t.eq("XP past the cap keeps counting and stays MAX", [levelInfo(def, 9000).level, levelInfo(def, 9000).xp], [10, 9000]);
    t.eq("retainXpAtCap keeps earning", addXp(def, 5100, 50), 5150);
    const noRetain = { ...defaultProgression(), retainXpAtCap: false };
    t.eq("retainXpAtCap off stops at the cap's threshold", addXp(noRetain, 5100, 50), 5110);
    t.eq("...and below the cap still adds normally", addXp(noRetain, 100, 50), 150);
  }

  // ---- attribute growth: the cumulative table ----
  {
    // [level, hp, primary, secondary, each other]
    const table = [
      [2, 10, 1, 1, 0], [3, 20, 2, 1, 1], [4, 30, 3, 2, 1], [5, 40, 4, 2, 1], [6, 50, 5, 3, 2],
      [7, 60, 6, 3, 2], [8, 70, 7, 4, 2], [9, 80, 8, 4, 3], [10, 90, 9, 5, 3],
    ];
    const s = soldier("aim", "speed");
    for (const [level, hp, p, sec, other] of table) {
      const b = bonusesThrough(def, level, s);
      t.eq(`level ${level} cumulative bonuses`, [b.hp, b.attrs.aim, b.attrs.speed, b.attrs.health, b.attrs.nerve], [hp, p, sec, other, other]);
    }
    t.eq("level 1 grants nothing", bonusesThrough(def, 1, s), { hp: 0, attrs: { aim: 0, health: 0, speed: 0, nerve: 0 } });

    const six = gainsAt(def, 6, s);
    t.eq("level 6: +10 HP and +1 to every attribute exactly once", [six.hp, six.attrs], [10, { aim: 1, health: 1, speed: 1, nerve: 1 }]);
    const twin = soldier("aim", "aim");
    t.eq("level 6, primary = secondary: +2 there, +1 to the three others",
      gainsAt(def, 6, twin).attrs, { aim: 2, health: 1, speed: 1, nerve: 1 });
    t.eq("primary = secondary reaches +14 by level 10", bonusesThrough(def, 10, twin).attrs.aim, 14);
    t.eq("...against +9 and +5 on two separate attributes",
      [bonusesThrough(def, 10, s).attrs.aim, bonusesThrough(def, 10, s).attrs.speed], [9, 5]);
  }

  // ---- overrides ----
  {
    const d = defaultProgression();
    d.levelOverrides = { 5: [{ target: "nerve", amount: 3 }], 7: [] };
    const s = soldier("aim", "speed");
    t.eq("an override replaces the whole level", gainsAt(d, 5, s), { hp: 0, attrs: { aim: 0, health: 0, speed: 0, nerve: 3 } });
    t.eq("an empty override grants nothing", grantsAt(d, 7), []);
    t.ok("overrides validate", validateProgression(d).ok);
  }

  // ---- resolveSoldier: effective stats, authored stats untouched ----
  {
    const s = soldier("aim", "speed", 50);
    const before = JSON.stringify(s.stats);
    const r = resolveSoldier(def, s);
    t.eq("level 3 soldier's effective stats", r.stats, { aim: 7, health: 6, speed: 6, nerve: 6 });
    t.eq("...and flat HP bonus", r.hpBonus, 20);
    t.eq("authored stats are never written", JSON.stringify(s.stats), before);
    const legacy = { id: "l", stats: { aim: 5, health: 5, speed: 5 } };
    const lr = resolveSoldier(def, legacy);
    t.eq("no xp / no assignment = starting level, no bonus", [lr.level, lr.hpBonus, lr.stats], [1, 0, legacy.stats]);
    t.ok("no stats key is invented for a soldier without nerve", !("nerve" in lr.stats));

    const capped = defaultProgression();
    capped.attributes.aim.cap = 8;
    t.eq("a cap bounds growth", resolveSoldier(capped, soldier("aim", "aim", 5110)).stats.aim, 8);
    t.eq("...but never lowers an authored stat above it",
      resolveSoldier(capped, soldier("aim", "aim", 5110, { aim: 9, health: 5, speed: 5, nerve: 5 })).stats.aim, 9);
    t.eq("no cap: growth passes 10", resolveSoldier(def, soldier("aim", "aim", 5110, { aim: 8, health: 5, speed: 5, nerve: 5 })).stats.aim, 22);
  }

  // ---- validation: each class rejects with its field path ----
  {
    const bad = (name, mutate, path) => {
      const d = defaultProgression();
      mutate(d);
      const v = validateProgression(d);
      t.ok(`rejects ${name} at ${path}`, !v.ok && v.errors.some((e) => e.path === path));
    };
    bad("start above cap", (d) => { d.startLevel = 11; }, "startLevel");
    bad("a missing transition cost", (d) => { delete d.xpCost[6]; }, "xpCost.6");
    bad("a zero transition cost", (d) => { d.xpCost[3] = 0; }, "xpCost.3");
    bad("an unreachable transition", (d) => { d.xpCost[11] = 5; }, "xpCost.11");
    bad("startXp at the first threshold", (d) => { d.startXp = 10; }, "startXp");
    bad("fractional startXp", (d) => { d.startXp = 1.5; }, "startXp");
    bad("unsafe cumulative XP", (d) => { d.xpCost[10] = Number.MAX_SAFE_INTEGER; }, "xpCost");
    bad("an unknown target", (d) => { d.growthRules[0].target = "luck"; }, "growthRules.0.target");
    bad("a fractional attribute grant", (d) => { d.growthRules[1].amount = 0.5; }, "growthRules.1.amount");
    bad("a negative HP grant", (d) => { d.growthRules[0].amount = -1; }, "growthRules.0.amount");
    bad("a duplicate rule id", (d) => { d.growthRules[1].id = "hp"; }, "growthRules.1.id");
    bad("a zero interval", (d) => { d.growthRules[2].every = 0; }, "growthRules.2.every");
    bad("last before first", (d) => { d.growthRules[3].last = 2; }, "growthRules.3.last");
    bad("an out-of-range override", (d) => { d.levelOverrides = { 1: [] }; }, "levelOverrides.1");
    bad("an unknown attribute", (d) => { d.attributes.luck = {}; }, "attributes.luck");
    bad("a bad cap", (d) => { d.attributes.aim.cap = 0; }, "attributes.aim.cap");
    bad("an unknown policy", (d) => { d.levelUpHealthPolicy = "revive"; }, "levelUpHealthPolicy");
    bad("an unknown outcome", (d) => { d.eligibility.outcomes = ["aborted"]; }, "eligibility.outcomes.0");

    const zero = defaultProgression();
    zero.growthRules.forEach((r) => { r.amount = 0; });
    t.ok("zero grants are a valid tuning choice", validateProgression(zero).ok);
    const d = defaultProgression();
    const v = validateProgression(d, { soldiers: [{ id: "x", stats: { health: 1 }, primary: "luck" }] });
    t.ok("rejects a soldier assignment naming an unregistered attribute", v.errors.some((e) => e.path === "soldiers.x.primary"));
    const hp = validateProgression(d, { soldiers: [{ id: "y", stats: { health: 1 } }], baseHp: 0, hpPerHealth: 0 });
    t.ok("rejects settings that leave a soldier with no maximum HP", hp.errors.some((e) => e.path === "soldiers.y"));
    t.eq("validation never mutates its input", JSON.stringify(d), JSON.stringify(defaultProgression()));
  }

  // ---- the authored recruits ----
  t.ok("every recruit carries a registered primary and secondary",
    RECRUIT_POOL.every((r) => ATTRIBUTE_IDS.includes(r.primary) && ATTRIBUTE_IDS.includes(r.secondary)));
  t.ok("recruits validate against the shipped definition",
    validateProgression(def, { soldiers: RECRUIT_POOL, baseHp: 15, hpPerHealth: 2 }).ok);
}
