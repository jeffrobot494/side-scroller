// Custom content store (weapons + enemies), armory merge, loadMission enemy merge.
import * as cc from "../src/game/customcontent.js";
import { createState } from "../src/game/state.js";
import { loadMission } from "../src/mission/entities.js";

export default async function run(t) {
  // ---- weapons ----
  t.eq("weapons: empty list initially", cc.listCustomWeapons(), []);
  t.ok("weapons: save returns ok+id", (() => { const r = cc.saveCustomWeapon({ id: "flamer", name: "Flamer", budgetSpent: 30, effects: [] }); return r.ok && r.id === "flamer"; })());
  t.ok("weapons: collision with WEAPONS key suffixes", cc.saveCustomWeapon({ id: "rifle", name: "Not Rifle", budgetSpent: 5, effects: [] }).id === "rifle_2");
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
  t.ok("armory: rifle first", s.armory[0].id === "rifle");
  t.ok("armory: includes custom weapon", s.armory.some((w) => w.id === "zapper"));
  t.ok("armory: custom weapon is a clone", s.armory.find((w) => w.id === "zapper") !== cc.customWeaponMap().zapper);

  // ---- loadMission resolves a custom enemy type ----
  cc.saveCustomEnemy({ id: "wraith", name: "Wraith", color: "#88f", w: 30, h: 44, health: 55, behavior: "shooter", speed: 160, contactDamage: 6, detectRange: 700, preferredRange: 320, weapon: "plasma", windup: 0.5, loot: { name: "Ectoplasm", value: 60 } });
  const level = { world: { width: 1000, height: 540, gravity: 2000 }, platforms: [{ x: 0, y: 500, w: 1000, h: 40 }], playerSpawn: { x: 100, y: 400 }, enemies: [{ type: "wraith", x: 500, y: 454 }, { type: "drone", x: 700, y: 454 }], exit: { x: 900, y: 380, w: 60, h: 120 }, artifact: null };
  const m = loadMission(level, []);
  t.ok("loadMission: custom enemy resolves", m.enemies[0] && m.enemies[0].name === "Wraith");
  t.ok("loadMission: custom enemy carries its weapon", m.enemies[0].weapon && m.enemies[0].weapon.id === "plasma");
  t.ok("loadMission: built-in enemy still resolves", m.enemies[1] && m.enemies[1].name === "Skitter Drone");
}
