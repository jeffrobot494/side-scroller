// ---------------------------------------------------------------------------
// 3D VIEW — EnemySpec enemies (tech/mission-3d.md).
//
// The walk is drawSpecEnemy's (src/mission/enemyspec/render.js): a live root,
// its alive children, its `spawned` list; a disabled part is not drawn but its
// children are. So a part is visible here exactly when it is in 2D.
//
// R2: each part is a box at its exact box in `spec.visual.color`.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { ModelMap, applyFlash, burnHalo } from "./actors.js";
import { setColor, placeOnBox, putHalo } from "./util.js";

const UNIT = new THREE.BoxGeometry(1, 1, 1);
UNIT.userData.shared = true;

function make(e) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 });
  mat.userData.base = setColor(new THREE.Color(), e.spec.visual.color);
  return { root: new THREE.Mesh(UNIT, mat), mats: [mat] };
}

export function createEnemies(parent) {
  const models = new ModelMap(parent, make);

  function part(e, m, halos) {
    const v = models.get(e);
    v.root.scale.set(e.w, e.h, Math.max(8, Math.min(e.w, e.h) * 0.8));
    placeOnBox(v.root, e.x, e.y, e.w, e.h);
    const pulse = applyFlash(v.mats, e.hitFlash > 0, e.telegraph > 0, m.time);
    cues(e, m, halos, pulse);
  }

  function tree(e, m, halos) {
    if (!e.alive) return;
    if (!e.disabled) part(e, m, halos);
    for (const c of e.children) tree(c, m, halos);
  }

  return {
    sync(m, halos) {
      models.begin();
      for (const r of m.scene.specRoots) {
        if (!r.alive) continue;
        tree(r, m, halos);
        for (const sp of r.spawned) tree(sp, m, halos);
      }
      // A part that is merely disabled comes back; anything dead is gone.
      models.end((e) => e.alive);
    },
    dispose() {
      models.dispose();
    },
  };
}

// The 2D view's cues, in the 2D view's places: the telegraph glow around the
// part, the muzzle glow off its facing side, the burn on its top edge.
export function cues(e, m, halos, pulse) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  if (e.telegraph > 0) {
    putHalo(halos, cx, cy, (Math.max(e.w, e.h) * 0.8 + pulse * 8) * 2.6, "#ff5a5a", 0.35 + pulse * 0.3, 10);
  }
  if (e.muzzleFlash > 0) {
    putHalo(halos, cx + e.facing * (e.w / 2 + 6), cy, 34, e.muzzleColor || "#ff8a5a", 0.9, 16);
  }
  if (e.burn) burnHalo(halos, e.x, e.y, e.w, m.time);
}
