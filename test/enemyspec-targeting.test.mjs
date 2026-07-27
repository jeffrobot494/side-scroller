// Team-aware target selection (Slice 0). Enemies (the default team) fight the
// squad; companions (team "player") fight the enemy roots; both pick the NEAREST
// hostile — not soldiers[0], which used to make a whole wave fixate on one
// soldier regardless of who was closest.
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { instantiate, updateSpecEnemy } from "../src/mission/enemyspec/runtime.js";
import { nearestHostile, hostilesFor } from "../src/mission/enemyspec/perception.js";

const STEP = 1 / 60;
const ctx = { damage() {}, kill() {} };
function sim(root, scene, sec) {
  for (let i = 0, n = Math.round(sec / STEP); i < n; i++) updateSpecEnemy(root, STEP, scene, ctx);
}
const watcher = () =>
  normalizeSpec({ id: "watcher", root: { health: { max: 20 }, visual: { size: [20, 20] }, body: { gravity: 0 }, motion: { type: "static" } } });

export default async function run(t) {
  // ---- default team --------------------------------------------------------
  t.eq("team: instantiate defaults to enemy", instantiate(watcher(), 700, 300).team, "enemy");
  t.eq("team: instantiate honors an explicit team", instantiate(watcher(), 700, 300, "player").team, "player");

  // ---- squad-fixation fix: enemy senses the NEAREST soldier ---------------
  {
    const scene = {
      world: { width: 1600, height: 540, gravity: 2000 },
      platforms: [{ x: 0, y: 500, w: 1600, h: 40 }],
      // index 0 is the FAR soldier (~590px); the near one (~210px) is second.
      soldiers: [
        { kind: "soldier", x: 1290, y: 288, w: 20, h: 24, vx: 0, vy: 0, alive: true },
        { kind: "soldier", x: 490, y: 288, w: 20, h: 24, vx: 0, vy: 0, alive: true },
      ],
      enemies: [], projectiles: [], specRoots: [],
    };
    const root = instantiate(watcher(), 700, 288); // center ~710
    sim(root, scene, 0.3); // let perception tick (0.2s cadence)
    t.ok(
      `squad: senses nearest soldier, not soldiers[0] — dist ${Math.round(root.sense.dist)} (~210 expected, not ~590)`,
      root.sense.dist < 300
    );
  }

  // ---- companion (team "player") targets the enemy roots -------------------
  {
    const scene = {
      soldiers: [{ x: 100, y: 300, w: 20, h: 24, alive: true }],
      specRoots: [
        { x: 900, y: 300, w: 30, h: 30, alive: true },
        { x: 500, y: 300, w: 30, h: 30, alive: true },
      ],
      enemies: [], projectiles: [], platforms: [],
      world: { width: 1600, height: 540, gravity: 2000 },
    };
    const companion = { x: 300, y: 300, w: 20, h: 24, team: "player" };
    t.ok("companion: hostiles are the enemy roots", hostilesFor(companion, scene) === scene.specRoots);
    const near = nearestHostile(companion, scene);
    t.ok("companion: targets nearest enemy root (x=500), not x=900", near && near.x === 500);
  }

  // ---- enemy hostiles are the squad ---------------------------------------
  {
    const scene = { soldiers: [{ x: 1, y: 1, w: 2, h: 2, alive: true }], specRoots: [], enemies: [] };
    t.ok("enemy: hostiles are the soldiers", hostilesFor({ x: 0, y: 0, w: 2, h: 2, team: "enemy" }, scene) === scene.soldiers);
  }
}
