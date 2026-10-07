// ---------------------------------------------------------------------------
// THE STAGE (tech/trailer.md, T1 fix rows + T3). What the trailer adds to the
// 3D view's scene through its stage hook, and nothing the game ever shows:
//
//   set dressing  a deep floor under each staged level's ground, with a dark
//                 skirt down its front, so a low camera sees a street rather
//                 than a 36px ledge, and nothing looks under the world floor
//   falls         the shot-off wing (shot 11) and Tex (shot 10). At the
//                 death, the drawn object is cloned where it last stood and
//                 the clone falls: the wing tumbles and lands on the terrain
//                 below it, Tex topples backwards and lies there. The clones
//                 share the view's geometry and materials and never write to
//                 them. Nothing here touches the simulation.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { viewY } from "../mission/camera.js";
import { resolveTarget } from "./runner.js";

const FLOOR_BACK = 1400;  // px of street behind the play plane
const FLOOR_FRONT = 4000; // and in front of it, past every camera
const SKIRT = 2400;       // px the floor reaches down
const GRAVITY = 2000;     // the game's, px/s²
const TOPPLE = 0.5;       // s for Tex to go over

function groundUnder(platforms, x, y) {
  let best = null;
  for (const p of platforms) {
    if (x < p.x || x > p.x + p.w || p.y < y) continue;
    if (!best || p.y < best.y) best = p;
  }
  return best ? best.y : 540;
}

export function createStage(view) {
  let group = null;
  let mission = null;
  let falls = [];
  let lastTime = 0;
  const mats = {
    floor: new THREE.MeshStandardMaterial({ color: "#1d3249", roughness: 0.9, metalness: 0.2 }),
  };

  function dress(level) {
    const g = new THREE.Group();
    const floorY = level.world.height;
    for (const p of level.platforms) {
      if (p.y + p.h < floorY - 1) continue; // only what stands on the world floor
      const geo = new THREE.BoxGeometry(p.w, SKIRT, FLOOR_BACK + FLOOR_FRONT);
      // Half a pixel under the play terrain's top, so its lit edge wins.
      geo.translate(p.x + p.w / 2, viewY(p.y) - 0.5 - SKIRT / 2, (FLOOR_FRONT - FLOOR_BACK) / 2);
      g.add(new THREE.Mesh(geo, mats.floor));
    }
    return g;
  }

  function hook(api) {
    if (!mission) return;
    if (group && !group.parent) api.scene.add(group);
    const dt = Math.max(0, Math.min(0.1, mission.time - lastTime));
    lastTime = mission.time;
    for (const fl of falls) {
      const [ent] = resolveTarget(mission.scene, fl.target);
      if (!ent) continue;
      const obj = fl.target.soldier ? api.soldierObject(ent) : api.partObject(mission.scene.specRoots[fl.target.root], fl.target.part);
      if (!fl.clone) {
        if (ent.alive && obj && obj.visible) {
          obj.updateWorldMatrix(true, true);
          fl.last = obj.matrixWorld.clone();
          fl.obj = obj;
          fl.at = { x: ent.x + ent.w / 2, y: ent.y + ent.h / 2, feet: ent.y + ent.h, facing: ent.facing || 1, vx: ent.vx || 0 };
        } else if (!ent.alive && fl.last) start(fl, api.scene);
        continue;
      }
      animate(fl, dt);
    }
  }

  // Clone the object where it last stood, inside a pivot the fall moves.
  function start(fl, scene) {
    const pivot = new THREE.Group();
    const at = fl.at;
    if (fl.target.soldier) pivot.position.set(at.x, viewY(at.feet), 0);
    else pivot.position.set(at.x, viewY(at.y), 0);
    pivot.updateMatrixWorld(true);
    const clone = fl.obj.clone(true);
    clone.traverse((o) => { o.visible = true; });
    clone.matrixAutoUpdate = false;
    clone.matrix.copy(pivot.matrixWorld.clone().invert().multiply(fl.last));
    pivot.add(clone);
    scene.add(pivot);
    fl.pivot = pivot;
    fl.clone = clone;
    fl.t = 0;
    if (fl.target.soldier) {
      fl.dir = at.facing >= 0 ? 1 : -1; // falls backwards, away from where he faced
    } else {
      const side = Math.sign(at.x - (mission.scene.specRoots[fl.target.root].x + mission.scene.specRoots[fl.target.root].w / 2)) || 1;
      fl.v = new THREE.Vector3(at.vx + side * 70, 160, 0); // a kick up and out as it breaks
      fl.spin = new THREE.Vector3(2.2, 0, -side * 7);
      fl.floor = viewY(groundUnder(mission.scene.platforms, at.x, at.y)) + 4;
    }
  }

  function animate(fl, dt) {
    fl.t += dt;
    const p = fl.pivot;
    if (fl.target.soldier) {
      // Over backwards like a felled tree, then a small settle.
      const u = Math.min(1, fl.t / TOPPLE);
      const bounce = u >= 1 ? Math.max(0, 0.12 * Math.sin(Math.min(1, (fl.t - TOPPLE) / 0.25) * Math.PI)) : 0;
      p.rotation.z = fl.dir * (Math.PI / 2) * (u * u - bounce * 0.4);
      return;
    }
    if (fl.landed) return;
    fl.v.y -= GRAVITY * dt;
    p.position.addScaledVector(fl.v, dt);
    p.rotation.x += fl.spin.x * dt;
    p.rotation.z += fl.spin.z * dt;
    if (p.position.y <= fl.floor) {
      // Lands flat on the street and stays there.
      p.position.y = fl.floor;
      p.rotation.x = Math.PI / 2;
      fl.landed = true;
    }
  }

  return {
    // A segment starts: its set dressing and the falls it names.
    begin(m, seg) {
      this.end();
      mission = m;
      lastTime = m.time;
      group = new THREE.Group();
      if (seg.dress !== false) group.add(dress(seg.level));
      falls = (seg.falls || []).map((target) => ({ target }));
      view.setStage(hook);
    },
    end() {
      view.setStage(null);
      for (const fl of falls) if (fl.pivot && fl.pivot.parent) fl.pivot.parent.remove(fl.pivot);
      falls = [];
      if (group) {
        if (group.parent) group.parent.remove(group);
        group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
        group = null;
      }
      mission = null;
    },
  };
}
