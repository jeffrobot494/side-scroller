// ---------------------------------------------------------------------------
// 3D VIEW — shots, particles, loot and the exit (tech/mission-3d.md).
//
// Projectiles and particles come from PER-FRAME pools and are never mapped to
// a particular shot: a room viewer rebuilds `scene.projectiles` on every
// snapshot (src/net/mission-wire.js), so a shot object does not survive a
// frame there.
//
// R2: a shot is a box at its collision box, loot a box at its box, the exit a
// translucent column; sparks and bursts are points.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { FramePool, setColor, placeOnBox, viewY } from "./util.js";

const UNIT = new THREE.BoxGeometry(1, 1, 1);
UNIT.userData.shared = true;
const MAX_PARTICLES = 4096;

export function createEffects(parent) {
  const shots = new FramePool(parent, () => new THREE.Mesh(UNIT, new THREE.MeshBasicMaterial()));
  const loot = new FramePool(parent, () => {
    const mat = new THREE.MeshStandardMaterial({ color: "#f2c14e", emissive: "#6a4a10", roughness: 0.4, metalness: 0.5 });
    return new THREE.Mesh(UNIT, mat);
  });

  const exitMat = new THREE.MeshBasicMaterial({ color: "#8cffbe", transparent: true, depthWrite: false });
  const exit = new THREE.Mesh(UNIT, exitMat);
  parent.add(exit);

  // Sparks and bursts: one Points cloud, additive, alpha folded into colour.
  const pos = new Float32Array(MAX_PARTICLES * 3);
  const col = new Float32Array(MAX_PARTICLES * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 4, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  points.renderOrder = 20;
  parent.add(points);
  const c = new THREE.Color();

  return {
    sync(m) {
      const scene = m.scene;
      shots.begin();
      for (const p of scene.projectiles) {
        const o = shots.next();
        o.scale.set(Math.max(1, p.w), Math.max(1, p.h), Math.max(2, Math.min(p.w, p.h)));
        placeOnBox(o, p.x, p.y, p.w, p.h, 2);
        setColor(o.material.color, p.color);
      }
      shots.end();

      loot.begin();
      for (const l of scene.loot) {
        if (l.collected) continue;
        const o = loot.next();
        o.scale.set(l.w, l.h, Math.min(l.w, l.h));
        placeOnBox(o, l.x, l.y, l.w, l.h);
      }
      loot.end();

      const ex = scene.exit;
      exit.scale.set(ex.w, ex.h, 30);
      placeOnBox(exit, ex.x, ex.y, ex.w, ex.h);
      exitMat.opacity = 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(m.time * 4));

      const list = m.particles;
      const n = Math.min(list.length, MAX_PARTICLES);
      for (let i = 0; i < n; i++) {
        const p = list[i];
        const a = Math.min(1, Math.max(0, p.life / p.max));
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = viewY(p.y);
        pos[i * 3 + 2] = 6;
        setColor(c, p.color);
        col[i * 3] = c.r * a;
        col[i * 3 + 1] = c.g * a;
        col[i * 3 + 2] = c.b * a;
      }
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    dispose() {
      shots.dispose();
      loot.dispose();
      parent.remove(exit);
      exitMat.dispose();
      parent.remove(points);
      geo.dispose();
      points.material.dispose();
    },
  };
}
