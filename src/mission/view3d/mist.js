// ---------------------------------------------------------------------------
// 3D VIEW — ground mist (tech/mission-3d-looks.md, L2).
//
// Soft bands of mist drifting along the ground line: three behind the play
// plane, taller and slower with distance, and three in front, faster for
// parallax and faint, so a soldier is veiled, never hidden. One tileable
// canvas texture, drawn once per deploy and shared by every band.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { viewY } from "./util.js";

// [z, height px, opacity, drift px/s, texture repeats per REPEAT_SPAN px].
const LAYERS = [
  [-420, 120, 0.3, 6, 3],
  [-180, 80, 0.26, 11, 4],
  [-40, 50, 0.24, 16, 5],
  [30, 20, 0.2, 24, 6],
  [110, 60, 0.16, 34, 5],
  [240, 95, 0.13, 48, 4],
];
const COLOR = "#7d9a9c";
const REPEAT_SPAN = 4000; // px the repeats above are counted over
const MARGIN = 4000; // px past each end of the level: the skyline's, so the far band has no visible end
const SINK = 6; // px the band's base sits under the ground line

// Soft blobs on a canvas, fading out toward the top: one band that tiles in x.
function mistTexture() {
  const W = 512, H = 128;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * W, y = H * (0.45 + Math.random() * 0.55), r = 20 + Math.random() * 50;
    // Drawn three times across the seam so the band tiles.
    for (const ox of [-W, 0, W]) {
      const grd = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      grd.addColorStop(0, "rgba(255,255,255,0.22)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(x + ox - r, y - r, r * 2, r * 2);
    }
  }
  g.globalCompositeOperation = "destination-in";
  const fade = g.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(0.6, "rgba(0,0,0,1)");
  g.fillStyle = fade;
  g.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The ground line: the top of the widest platform — a generated level's
// continuous ground slab.
function groundTop(platforms) {
  let best = null;
  for (const p of platforms) if (!best || p.w > best.w) best = p;
  return best ? best.y : 0;
}

export function buildMist(world, platforms) {
  const group = new THREE.Group();
  const ground = viewY(groundTop(platforms));
  const width = world.width + MARGIN * 2;
  const base = mistTexture();
  const layers = LAYERS.map(([z, h, opacity, drift, rep]) => {
    // Clones share the canvas; each keeps its own offset and repeat.
    const tex = base.clone();
    const repeats = rep * width / REPEAT_SPAN;
    tex.repeat.set(repeats, 1);
    tex.offset.x = Math.random();
    const mat = new THREE.MeshBasicMaterial({
      map: tex, color: COLOR, transparent: true, opacity, depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, h), mat);
    mesh.position.set(world.width / 2, ground + h / 2 - SINK, z);
    mesh.renderOrder = 2;
    group.add(mesh);
    return { tex, start: tex.offset.x, speed: drift * repeats / width };
  });
  return {
    group,
    // Drift is a function of mission time, so it holds still while paused.
    update(m) {
      for (const l of layers) l.tex.offset.x = (l.start + m.time * l.speed) % 1;
    },
    dispose() {
      group.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        o.material.map.dispose();
        o.material.dispose();
      });
      base.dispose();
    },
  };
}
