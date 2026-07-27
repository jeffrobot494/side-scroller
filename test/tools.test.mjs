// Editor tools boot headlessly (mount → no throw → dispose), plus a real-AI
// behavior check that the Enemy Designer preview relies on (a shooter fires).
import { installDom, makeEl } from "./harness.mjs";
import { createWeaponDesigner } from "../src/editor/tools/weapon-designer.js";
import { createEnemyDesigner } from "../src/editor/tools/enemy-designer.js";
import { createLevelGenerator } from "../src/editor/tools/level-generator.js";
import { createFiringRoom } from "../src/editor/tools/firing-room.js";
import { createSoundPage } from "../src/editor/sound-page.js";
import { Soldier } from "../src/mission/entities.js";
import { instantiate, updateSpecEnemy } from "../src/mission/enemyspec/runtime.js";
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { MissionInput } from "../src/mission/input.js";

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
  // The Sound page is not a Tools-tab panel but follows the same
  // createX(container) → { dispose() } contract, so it gets the same bar.
  mountable(t, "sound-page", createSoundPage);

  // The Weapon Designer re-renders its whole shell on load. That path rebuilds
  // the canvas, the effect rows, the sound rows and the saved list in one go,
  // so drive a real load and then keep using the tool: a missed re-query or a
  // panel left unrendered surfaces as a throw here. (Whether the NEW canvas is
  // the one being drawn into is invisible to this harness — that stays an
  // eyeball check, per docs/WEAPON-DESIGNER.md.)
  {
    installDom();
    let threw = null;
    try {
      const wd = createWeaponDesigner(makeEl(), () => {});
      // scattergun exercises a delivery effect (pellets) through the schema
      // rows and the preview's pellet fan; incinerator carries burn.
      wd.load("builtin", "scattergun");
      wd.load("builtin", "incinerator");
      wd.dispose();
    } catch (e) {
      threw = e;
    }
    t.ok("weapon-designer: load re-renders without throwing", !threw);
    if (threw) console.log("   ", threw && threw.stack);
  }

  // With a saved EnemySpec in the library, both tools still mount (the Firing
  // Room renders the "Designed" optgroup; the Designer lists the library row).
  {
    const { saveEnemySpec } = await import("../src/game/customcontent.js");
    const { TEMPLATE_BY_ID } = await import("../src/game/enemyspec/templates.js");
    saveEnemySpec(JSON.parse(JSON.stringify(TEMPLATE_BY_ID.tpl_shooter)));
    mountable(t, "enemy-designer (with library)", createEnemyDesigner);
    mountable(t, "firing-room (with spec library)", createFiringRoom);
  }

  // Real AI: an EnemySpec shooter telegraphs then fires (the preview's building
  // block) — the spec runtime that now drives every mission enemy.
  const data = { id: "s1", name: "Rook", callsign: "RK", stats: { health: 5, aim: 5, speed: 5 } };
  const w = { id: "rifle", name: "R", fireMode: "projectile", fireRate: 7, spread: 0, projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 1 }, effects: [] };
  const tgt = new Soldier(data, w, 620, 254);
  const shooterSpec = normalizeSpec({
    v: 1, id: "td_shooter", name: "TD Shooter", threat: 70,
    root: {
      id: "root", tags: ["enemy"], visual: { shape: "box", size: [32, 44] }, health: { max: 50 },
      motion: { type: "keepDistance", min: 260, max: 420, speed: 140 },
      emitters: { gun: { at: [0, -6], projectile: { speed: 460, w: 14, h: 14, color: "#8affc1", life: 2.2, damage: 14 } } },
    },
    brain: { start: "fight", states: { fight: { tracks: [{ id: "shoot", loop: true, steps: [
      { telegraph: { time: 0.5 } }, { fire: { emitter: "gun", pattern: "aimed" } }, { wait: 1.4 },
    ] }] } } },
  });
  const foe = instantiate(shooterSpec, 80, 300 - 44); // rest on the ground slab (y=300)
  const scene = { world: { gravity: 2000, width: 760, height: 360 }, platforms: [{ x: 0, y: 300, w: 760, h: 60 }], soldiers: [tgt], enemies: [], projectiles: [] };
  const noop = { friendlyFire: false, damageMult: 1, damage() {}, kill() {}, spark() {}, burst() {} };
  let fired = false;
  for (let i = 0; i < 400 && !fired; i++) {
    updateSpecEnemy(foe, 0.03, scene, noop);
    if (scene.projectiles.length > 0) fired = true;
  }
  t.ok("real AI: shooter produces a projectile", fired);

  // MissionInput (drives the Firing Room's manual mode) maps keys + cleans up.
  {
    const inp = new MissionInput();
    inp.enable(); // harness provides no-op window listeners
    inp._set({ code: "KeyD", preventDefault() {} }, true);
    inp._set({ code: "KeyS", preventDefault() {} }, true);
    t.ok("input: D → right", inp.isDown("right"));
    t.ok("input: S → crouch", inp.isDown("crouch"));
    inp.disable();
    t.ok("input: disable clears state", !inp.isDown("right") && !inp.isDown("crouch"));
  }
}
