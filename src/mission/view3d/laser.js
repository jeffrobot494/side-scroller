// ---------------------------------------------------------------------------
// 3D VIEW — laser sights (tech/mission-3d-looks.md, L1).
//
// Every living soldier's gun throws a red beam from a lens under the barrel.
// It is read off the soldier model's own gun, after the model is posed, so it
// rides every bob, lean, aim and facing. The beam stops at the first platform
// or living enemy part it enters from outside — tested in world px against
// the collision boxes, not the meshes — and leaves a dot there; otherwise it
// runs RANGE px. A box the barrel starts inside is not a stop.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { entry } from "../enemyspec/perception.js";
import { FramePool, viewY } from "./util.js";

const RANGE = 87.5; // px, when nothing is hit
const RED = "#ff2a1a";
const UNDER = 2.5; // px below the barrel's axis
const MIN_HIT = 0.5; // px: a box entered closer than this is one the barrel is inside

// Shared by every beam; disposed with the pool's owner, not per beam.
function shared(o) {
  o.userData.shared = true;
  return o;
}

export function createLasers(parent) {
  // Additive and untonemapped, so bloom picks the beam up as a glow.
  const beamMat = shared(new THREE.MeshBasicMaterial({
    color: RED, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  const dotMat = shared(new THREE.MeshBasicMaterial({ color: RED, toneMapped: false }));
  const beamGeo = shared(new THREE.BoxGeometry(1, 1.4, 1.4));
  const dotGeo = shared(new THREE.SphereGeometry(1.6, 12, 8));
  const lensGeo = shared(new THREE.BoxGeometry(3, 2, 3));

  const pool = new FramePool(parent, () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(beamGeo, beamMat), new THREE.Mesh(dotGeo, dotMat), new THREE.Mesh(lensGeo, dotMat));
    return g;
  });

  const from = new THREE.Vector3(), dir = new THREE.Vector3();

  // The nearest box the segment (x0, y0)→(x1, y1) enters, as 0..1, over the
  // platforms and every drawn enemy part (enemy.js's walk).
  function nearest(scene, x0, y0, x1, y1) {
    let best = 1;
    const test = (b) => {
      const t = entry(x0, y0, x1, y1, b);
      if (t * RANGE > MIN_HIT && t < best) best = t;
    };
    for (const p of scene.platforms) test(p);
    const part = (e) => {
      if (!e.alive) return;
      if (!e.disabled) test(e);
      for (const c of e.children) part(c);
    };
    for (const r of scene.specRoots || []) {
      if (!r.alive) continue;
      part(r);
      for (const sp of r.spawned) part(sp);
    }
    return best;
  }

  return {
    // `gunOf(s)` is the soldier model's gun group, posed this frame.
    sync(m, gunOf) {
      pool.begin();
      // A faint flicker so it reads as a live emitter, not a stick. Wall
      // clock: it is the emitter's, not the mission's.
      beamMat.opacity = 0.5 + Math.sin(performance.now() * 0.05) * 0.05;
      for (const s of m.scene.soldiers) {
        if (!s.alive) continue;
        const gun = gunOf(s);
        if (!gun) continue;
        // Gun space: barrel along +x from the pivot, length = its scale; the
        // gun's y-mirror keeps -y under the barrel whichever way it points.
        gun.updateWorldMatrix(true, false);
        const len0 = gun.children[0].scale.x;
        gun.localToWorld(from.set(len0, -UNDER, 0));
        gun.localToWorld(dir.set(len0 + 1, -UNDER, 0)).sub(from).normalize();
        const ang = Math.atan2(dir.y, dir.x);

        // World px are y-down; the view is y-up (viewY is the one flip).
        const x0 = from.x, y0 = viewY(from.y);
        const t = nearest(m.scene, x0, y0, x0 + dir.x * RANGE, y0 - dir.y * RANGE);
        const len = t * RANGE;

        const [beam, dot, lens] = pool.next().children;
        beam.scale.x = Math.max(0.01, len);
        beam.position.copy(from).addScaledVector(dir, len / 2);
        beam.rotation.z = ang;
        lens.position.copy(from).addScaledVector(dir, -2);
        lens.rotation.z = ang;
        dot.visible = t < 1;
        dot.position.copy(from).addScaledVector(dir, len);
      }
      pool.end();
    },
    // Off: nothing drawn this frame.
    hide() {
      pool.begin();
      pool.end();
    },
    dispose() {
      pool.dispose();
      for (const o of [beamMat, dotMat, beamGeo, dotGeo, lensGeo]) o.dispose();
    },
  };
}
