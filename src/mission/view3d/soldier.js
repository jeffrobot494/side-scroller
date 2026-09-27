// ---------------------------------------------------------------------------
// 3D VIEW — soldiers (tech/mission-3d.md).
//
// R2: each soldier is a box at its exact collision box, in its colour. Crouch
// needs nothing — the box height already changes.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { ModelMap, applyFlash, burnHalo, muzzleHalo } from "./actors.js";
import { setColor, placeOnBox } from "./util.js";

const DEPTH = 18;
const UNIT = new THREE.BoxGeometry(1, 1, 1);
UNIT.userData.shared = true;

function make(s) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.2 });
  mat.userData.base = setColor(new THREE.Color(), s.color);
  const root = new THREE.Mesh(UNIT, mat);
  return { root, mats: [mat] };
}

export function createSoldiers(parent) {
  const models = new ModelMap(parent, make);
  return {
    sync(m, halos) {
      const scene = m.scene;
      models.begin();
      for (const s of scene.soldiers) {
        if (!s.alive) continue;
        const v = models.get(s);
        v.root.scale.set(s.w, s.h, DEPTH);
        placeOnBox(v.root, s.x, s.y, s.w, s.h);
        applyFlash(v.mats, s.hitFlash > 0, false, m.time);
        if (s.muzzleFlash > 0) {
          const cx = s.x + s.w / 2;
          muzzleHalo(halos, m._gunTip(s, cx, s.y + s.h * 0.42, s.w * 0.62, s.y), s.muzzleColor);
        }
        if (s.burn) burnHalo(halos, s.x, s.y, s.w, m.time);
      }
      models.end((s) => scene.soldiers.includes(s));
    },
    dispose() {
      models.dispose();
    },
  };
}
