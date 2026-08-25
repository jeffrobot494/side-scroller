// Custom content store (weapons + enemies), armory merge, EnemySpec mission load.
import * as cc from "../src/game/customcontent.js";
import { createState } from "../src/game/state.js";
import { loadMission } from "../src/mission/entities.js";

export default async function run(t) {
  // ---- weapons ----
  t.eq("weapons: empty list initially", cc.listCustomWeapons(), []);
  t.ok("weapons: save returns ok+id", (() => { const r = cc.saveCustomWeapon({ id: "flamer", name: "Flamer", budgetSpent: 30, effects: [] }); return r.ok && r.id === "flamer"; })());
  t.ok("weapons: collision with WEAPONS key suffixes", cc.saveCustomWeapon({ id: "carbine", name: "Not Carbine", budgetSpent: 5, effects: [] }).id === "carbine_2");
  cc.saveCustomWeapon({ id: "flamer", name: "Flamer v2", budgetSpent: 40, effects: [] });
  t.ok("weapons: same id upserts", cc.customWeaponMap().flamer.name === "Flamer v2");
  t.eq("weapons: two entries after upsert", cc.listCustomWeapons().length, 2);
  t.ok("weapons: id slugged from name", cc.saveCustomWeapon({ name: "Big Gun!!", budgetSpent: 10, effects: [] }).id === "big_gun");
  t.ok("weapons: delete existing ok", cc.deleteCustomWeapon("flamer").ok);
  t.ok("weapons: delete missing not-ok", !cc.deleteCustomWeapon("nope").ok);

  // ---- enemies ----
  t.eq("enemies: empty list initially", cc.listCustomEnemies(), []);
  t.ok("enemies: save ok+id", cc.saveCustomEnemy({ id: "brute", name: "Brute", behavior: "charger", health: 80 }).ok);
  t.ok("enemies: collision with ENEMIES key suffixes", cc.saveCustomEnemy({ id: "drone", name: "Fake Drone", behavior: "charger", health: 10 }).id === "drone_2");
  cc.saveCustomEnemy({ id: "brute", name: "Brute II", behavior: "shooter", health: 90 });
  t.ok("enemies: same id upserts", cc.customEnemyMap().brute.name === "Brute II");
  t.ok("enemies: delete works", cc.deleteCustomEnemy("drone_2").ok);
  t.ok("stores are independent", cc.listCustomWeapons().length >= 1 && cc.listCustomEnemies().length === 1);

  // ---- enemy specs (EnemySpec library — separate store) ----
  t.eq("specs: empty list initially", cc.listEnemySpecs(), []);
  const spec = { v: 1, id: "mine_layer", name: "Mine Layer", threat: 90, role: "artillery", tier: 2, root: { health: { max: 40 } } };
  t.ok("specs: save ok+id", cc.saveEnemySpec(spec).ok && cc.enemySpecMap().mine_layer.name === "Mine Layer");
  cc.saveEnemySpec({ ...spec, name: "Mine Layer II" });
  t.ok("specs: same id upserts", cc.enemySpecMap().mine_layer.name === "Mine Layer II");
  t.eq("specs: one entry after upsert", cc.listEnemySpecs().length, 1);
  t.ok("specs: store separate from legacy enemies", !cc.customEnemyMap().mine_layer);
  t.ok("specs: delete works", cc.deleteEnemySpec("mine_layer").ok && cc.listEnemySpecs().length === 0);
  // E4 merges the library's ids into the namespace missionSpecById resolves
  // through, so a library entry must not be able to claim a built-in's id.
  const shadow = cc.saveEnemySpec({ v: 1, name: "Husk Charger", threat: 50, root: { health: { max: 10 } } });
  t.ok("specs: a library entry cannot shadow a built-in id", shadow.ok && shadow.id !== "husk_charger");
  t.ok("specs: it is suffixed rather than refused", shadow.id.startsWith("husk_charger"));
  cc.deleteEnemySpec(shadow.id);

  // ---- guarded without localStorage ----
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;
  const cc2 = await import("../src/game/customcontent.js?noLS=1");
  t.eq("guard: list [] without localStorage", cc2.listCustomWeapons(), []);
  t.ok("guard: save no-throw without localStorage", cc2.saveCustomWeapon({ name: "X", effects: [] }).ok);
  t.eq("guard: map {} without localStorage", cc2.customWeaponMap(), {});
  globalThis.localStorage = saved;

  // ---- armory merge (custom weapon → state.armory) ----
  globalThis.localStorage.clear();
  cc.saveCustomWeapon({ id: "zapper", name: "Zapper", budgetSpent: 22, effects: [{ kind: "damage", amount: 22, cost: 22 }] });
  const s = createState();
  t.ok("armory: standard-issue carbine first", s.armory[0].id === "carbine" && s.armory[0].magazine > 0);
  t.ok("armory: includes custom weapon", s.armory.some((w) => w.id === "zapper"));
  t.ok("armory: custom weapon is a clone", s.armory.find((w) => w.id === "zapper") !== cc.customWeaponMap().zapper);

  // ---- loadMission builds EnemySpec roots from built-in mission enemy ids ----
  // Missions are 100% EnemySpec now: each placement { type, x, y } resolves to a
  // built-in spec, instantiates a runtime tree, and its damageable parts feed
  // scene.enemies. An unknown type falls back to a built-in (fallback discipline).
  const level = { world: { width: 1000, height: 540, gravity: 2000 }, platforms: [{ x: 0, y: 500, w: 1000, h: 40 }], playerSpawn: { x: 100, y: 400 }, enemies: [{ type: "husk_charger", x: 500, y: 454 }, { type: "spore_wisp", x: 700, y: 454 }, { type: "no_such_enemy", x: 850, y: 454 }], exit: { x: 900, y: 380, w: 60, h: 120 }, artifact: null };
  const m = loadMission(level, []);
  t.ok("loadMission: one spec root per placement", m.specRoots.length === 3);
  t.ok("loadMission: roots are spec entities", m.specRoots.every((r) => r.kind === "spec"));
  t.ok("loadMission: scene.enemies are collidable spec parts", m.enemies.length >= 3 && m.enemies.every((e) => e.kind === "spec"));
  t.ok("loadMission: grounded enemy spawns at its placement", m.specRoots[0].y === 454);
  t.ok("loadMission: flying enemy is lifted airborne", m.specRoots[1].y < 454);
  t.ok("loadMission: unknown type falls back to a built-in", m.specRoots[2].alive === true);
  t.ok("loadMission: kill loot derives from threat", !!m.specRoots[0].loot && m.specRoots[0].loot.value > 0);

  // ---- loadMission resolves a ROSTER enemy too (E4) ----------------------
  // The whole point of the roster: a placement carrying a custom id must build
  // the custom enemy, not fall back to husk_charger.
  {
    const rs = await import("../src/game/rosterspecs.js");
    const es = await import("../src/game/enemyspecs.js");
    rs.clearRoster();
    const scrap = { v: 1, id: "scrap_hound", name: "Scrap Hound", threat: 45, role: "charger", tier: 1, intelligence: 1,
      root: { id: "root", tags: ["enemy"], visual: { shape: "box", size: [24, 22], color: "#909090" },
        health: { max: 33 }, motion: { type: "chase", speed: 200 }, contact: { damage: 7 } } };
    t.ok("roster: admitted for the loader", rs.admitSpec(scrap, { reserved: es.BUILTIN_SPEC_IDS, seconds: 2 }).ok);
    es.applyEnemyRoster();
    const rl = { ...level, enemies: [{ type: "scrap_hound", x: 500, y: 478 }] };
    const rm = loadMission(rl, []);
    t.eq("loadMission: a roster placement builds the custom enemy", rm.specRoots[0].maxHealth, 33);
    t.ok("loadMission: not the fallback built-in", rm.specRoots[0].maxHealth !== 24);
    rs.clearRoster();
  }
}
