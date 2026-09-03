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

  // ---- the enemy delta store (tech/enemy-designer.md, E6) ----
  // EnemySpec enemies are NOT in customcontent.js any more: there is one enemy
  // list, and localStorage holds only what differs from the file. What belongs
  // HERE is the store's own shape; the merge reaching generation is gen.test.
  {
    const store = await import("../src/game/enemystore.js");
    store.clearEnemyDeltas();
    t.eq("store: a clean store has no records", Object.keys(store.readDeltas().records).length, 0);

    const spec = { v: 1, id: "mine_layer", name: "Mine Layer", threat: 90, role: "artillery", tier: 2, root: { health: { max: 40 } } };
    const file = [{ spec: { v: 1, id: "husk_charger", name: "Husk Charger", threat: 50, role: "charger", root: { health: { max: 24 } } }, behavior: "charger", inMissions: true }];

    t.ok("store: a clean merge is exactly the file",
      store.mergeEnemies(file).length === 1 && store.mergeEnemies(file)[0].origin === "file");

    // An id the file does not have is an ADDITION; one it does is an EDIT.
    // Same verb, no category — which is the point of E6.
    store.saveEnemy(store.makeRecord(spec, { inMissions: false }));
    const merged = store.mergeEnemies(file);
    t.eq("store: an unknown id appends", merged.length, 2);
    t.eq("store: as an addition", merged[1].origin, "added");
    t.ok("store: its hint is seeded from its role", merged[1].behavior === "shooter");

    const edited = structuredClone(file[0]);
    edited.spec.threat = 999;
    store.saveEnemy(edited);
    t.eq("store: a file id replaces in place", store.mergeEnemies(file)[0].spec.threat, 999);
    t.eq("store: and is marked edited", store.mergeEnemies(file)[0].origin, "edited");
    t.eq("store: without growing the list", store.mergeEnemies(file).length, 2);

    // The flag is separate from the record, so flipping the switch on an
    // untouched entry must not make it read as edited.
    store.revertEnemy("husk_charger");
    store.setInMissions("husk_charger", false);
    t.eq("store: a flag alone leaves the entry unedited", store.mergeEnemies(file)[0].origin, "file");
    t.eq("store: but overrides its in-missions default", store.mergeEnemies(file)[0].inMissions, false);

    // A tombstone drops a file entry; revert takes it back.
    store.removeEnemy("husk_charger");
    t.ok("store: a tombstone drops the file entry",
      !store.mergeEnemies(file).some((r) => r.spec.id === "husk_charger"));
    store.revertEnemy("husk_charger");
    t.ok("store: revert restores it", store.mergeEnemies(file)[0].origin === "file");

    store.clearEnemyDeltas();
    t.eq("store: cleared is the file again", store.mergeEnemies(file).length, 1);
  }

  // ---- E4's stores are migrated once (approximation 16) ----
  {
    const { stubLocalStorage } = await import("./harness.mjs");
    const outer = globalThis.localStorage;
    globalThis.localStorage = stubLocalStorage();
    localStorage.setItem("sidescroller.enemyroster.v1", JSON.stringify({
      specs: [{ v: 1, id: "scrap_hound", name: "Scrap Hound", threat: 45, role: "charger", root: {} }],
      off: { husk_charger: true },
    }));
    localStorage.setItem("sidescroller.enemyspecs.v1", JSON.stringify([
      { v: 1, id: "shelf_thing", name: "Shelf Thing", threat: 30, role: "fodder", root: {} },
    ]));
    const st = await import("../src/game/enemystore.js?migrate=1");
    const d = st.readDeltas();
    t.ok("migrate: an admitted roster enemy becomes a record", !!d.records.scrap_hound);
    t.eq("migrate: carrying its enable flag", d.flags.scrap_hound, true);
    t.ok("migrate: a library enemy becomes a record too", !!d.records.shelf_thing);
    t.eq("migrate: switched OFF, because it was never placeable", d.flags.shelf_thing, false);
    t.eq("migrate: a disabled built-in survives as a flag", d.flags.husk_charger, false);
    // Migration runs ONCE: a deleted entry must not come back on the next read.
    st.removeEnemy("scrap_hound");
    t.ok("migrate: and does not run again", !st.readDeltas().records.scrap_hound);
    globalThis.localStorage = outer;
  }

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

  // ---- loadMission resolves an ADDED enemy too (E6) -----------------------
  // The whole point of the list reaching the game: a placement carrying an id
  // this browser added must build that enemy, not fall back to the cheapest.
  {
    const es = await import("../src/game/enemyspecs.js");
    es.resetEnemyList();
    const scrap = { v: 1, id: "scrap_hound", name: "Scrap Hound", threat: 45, role: "charger", tier: 1, intelligence: 1,
      root: { id: "root", tags: ["enemy"], visual: { shape: "box", size: [24, 22], color: "#909090" },
        health: { max: 33 }, motion: { type: "chase", speed: 200 }, contact: { damage: 7 } } };
    t.ok("loadMission: the enemy is saved", es.saveEnemyToList(scrap).ok);
    t.ok("loadMission: and switched into missions", es.setEnemyEnabled("scrap_hound", true, { seconds: 2 }).ok);
    es.applyEnemyRoster();
    const rl = { ...level, enemies: [{ type: "scrap_hound", x: 500, y: 478 }] };
    const rm = loadMission(rl, []);
    t.eq("loadMission: the placement builds the added enemy", rm.specRoots[0].maxHealth, 33);
    t.ok("loadMission: not the fallback", rm.specRoots[0].maxHealth !== 24);
    es.resetEnemyList();
  }
}
