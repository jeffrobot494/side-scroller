// Editor tools boot headlessly (mount → no throw → dispose), plus a real-AI
// behavior check that the Enemy Designer preview relies on (a shooter fires).
import { installDom, makeEl } from "./harness.mjs";
import { createWeaponDesigner } from "../src/editor/tools/weapon-designer.js";
import { createEnemyDesigner } from "../src/editor/tools/enemy-designer.js";
import { createLevelGenerator } from "../src/editor/tools/level-generator.js";
import { createFiringRoom } from "../src/editor/tools/firing-room.js";
import { Enemy, Soldier, stepActor } from "../src/mission/entities.js";
import { updateEnemy } from "../src/mission/ai.js";

function mountable(t, name, factory) {
  installDom();
  let threw = null, tool = null;
  try {
    tool = factory(makeEl(), () => {});
  } catch (e) {
    threw = e;
  }
  t.ok(`${name}: mount does not throw`, !threw);
  if (threw) console.log("   ", threw && threw.stack);
  t.ok(`${name}: returns dispose()`, tool && typeof tool.dispose === "function");
  try {
    tool && tool.dispose();
    t.ok(`${name}: dispose does not throw`, true);
  } catch {
    t.ok(`${name}: dispose does not throw`, false);
  }
}

export default async function run(t) {
  mountable(t, "weapon-designer", createWeaponDesigner);
  mountable(t, "enemy-designer", createEnemyDesigner);
  mountable(t, "level-generator", createLevelGenerator);
  mountable(t, "firing-room", createFiringRoom);

  // Real AI: a shooter telegraphs then fires (the preview's building blocks).
  const data = { id: "s1", name: "Rook", callsign: "RK", stats: { health: 5, aim: 5, speed: 5 } };
  const w = { id: "rifle", name: "R", fireMode: "projectile", fireRate: 7, spread: 0, projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 1 }, effects: [] };
  const def = { id: "s", name: "S", color: "#f00", w: 32, h: 44, health: 50, behavior: "shooter", speed: 160, contactDamage: 6, detectRange: 700, preferredRange: 320, weapon: "plasma", windup: 0.4, loot: { name: "L", value: 1 } };
  const tgt = new Soldier(data, w, 620, 254);
  const foe = new Enemy(def, 80, 300 - 44); // rest on the ground slab (y=300)
  const scene = { world: { gravity: 2000, width: 760, height: 360 }, platforms: [{ x: 0, y: 300, w: 760, h: 60 }], soldiers: [tgt], enemies: [foe], projectiles: [] };
  let fired = false;
  for (let i = 0; i < 400 && !fired; i++) {
    updateEnemy(foe, 0.03, scene);
    if (foe.fireCooldown > 0) foe.fireCooldown -= 0.03;
    stepActor(foe, 0.03, scene.world, scene.platforms);
    if (scene.projectiles.length > 0) fired = true;
  }
  t.ok("real AI: shooter produces a projectile", fired);
}
