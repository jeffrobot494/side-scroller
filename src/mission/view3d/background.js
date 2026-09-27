// ---------------------------------------------------------------------------
// 3D VIEW — the mission's backdrop rebuilt in depth (tech/mission-3d.md, R3).
//
// The 2D view paints a screen-space sky, two skyline layers scrolled at fixed
// rates (0.18, 0.36), a green hive glow low on the horizon and drifting spores.
// Here the sky stays screen-space (it is infinitely far away), the skylines
// are real buildings standing at real depth — parallax is the camera moving
// past them — the glow is a far light the camera never reaches, and the spores
// hang in the air in front of and behind the play plane.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { glowTexture, viewY } from "./util.js";

// The two skyline layers, nearest first. `z` is depth behind the play plane;
// `step`/`peak` echo the 2D layers' building pitch and height, scaled up with
// distance so they read at the same size on screen.
// Heights are chosen so the tops land where the 2D layers' do at the classic
// framing: the far row about 40% down the screen, the near row about 55%.
const LAYERS = [
  { z: -650, step: 120, peak: 230, base: "#0c1a24", lit: "#4f6f7c", litChance: 0.06 },
  { z: -1700, step: 190, peak: 430, base: "#0a1420", lit: "#3f5d6b", litChance: 0.04 },
];

// Far enough out on both sides that a zoomed-out camera at either end of the
// level still sees buildings to the edge of the frame at the far layer.
const MARGIN = 4000;

// Sky: the 2D gradient, screen-space.
function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 512;
  const g2 = c.getContext("2d");
  const g = g2.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#060915");
  g.addColorStop(0.55, "#0c1424");
  g.addColorStop(0.82, "#14232a");
  g.addColorStop(1, "#1a2a22");
  g2.fillStyle = g;
  g2.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Deterministic per building, as the 2D skyline is: sin-hash of the index.
function hash(i, k = 0) {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// One layer of ruined buildings: an InstancedMesh of blocks (a body plus a
// broken crown per building) and one of lit windows.
function skylineLayer(layer, world, index) {
  const group = new THREE.Group();
  const ground = viewY(world.height);
  const x0 = -MARGIN, x1 = world.width + MARGIN;
  const count = Math.ceil((x1 - x0) / layer.step);
  const bodyMat = new THREE.MeshStandardMaterial({ color: layer.base, roughness: 0.95, metalness: 0.05 });
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bodyMat, count * 3);
  const winMat = new THREE.MeshBasicMaterial({ color: layer.lit });
  const maxWin = count * 24;
  const wins = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), winMat, maxWin);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  let nb = 0, nw = 0;
  const below = 1600; // bodies run far below the world so no base ever shows

  for (let i = 0; i < count; i++) {
    const r = hash(i, index);
    const w = layer.step * (0.62 + 0.3 * hash(i, index + 7));
    const h = layer.peak * (0.35 + 0.65 * r);
    const cx = x0 + i * layer.step + layer.step / 2;
    const d = layer.step * (0.6 + 0.4 * hash(i, index + 3));
    // body
    p.set(cx, ground + (h - below) / 2, layer.z);
    sc.set(w, h + below, d);
    blocks.setMatrixAt(nb++, m.compose(p, q.identity(), sc));
    // broken crown: a leaning slab snapped off the roof, on about half of them
    if (hash(i, index + 11) > 0.45) {
      const cw = w * (0.3 + 0.4 * hash(i, index + 13));
      const ch = layer.peak * 0.1 * (0.5 + hash(i, index + 17));
      const side = hash(i, index + 19) > 0.5 ? 1 : -1;
      p.set(cx + side * (w - cw) * 0.4, ground + h + ch * 0.35, layer.z);
      e.set(0, 0, side * (0.1 + 0.35 * hash(i, index + 23)));
      sc.set(cw, ch, d * 0.9);
      blocks.setMatrixAt(nb++, m.compose(p, q.setFromEuler(e), sc));
    }
    // a gap-toothed antenna/spire on a few
    if (hash(i, index + 29) > 0.82) {
      p.set(cx - w * 0.2, ground + h + layer.peak * 0.08, layer.z);
      sc.set(4, layer.peak * 0.18, 4);
      blocks.setMatrixAt(nb++, m.compose(p, q.identity(), sc));
    }
    // windows: a sparse grid on the face, most dark — the city is dead
    const cols = Math.max(2, Math.floor(w / 22));
    const rows = Math.max(2, Math.floor(h / 30));
    for (let a = 0; a < cols && nw < maxWin; a++) {
      for (let b = 1; b < rows && nw < maxWin; b++) {
        if (hash(i * 131 + a * 17 + b, index + 31) > layer.litChance) continue;
        p.set(cx - w / 2 + (a + 0.5) * (w / cols), ground + b * (h / rows), layer.z + d / 2 + 0.5);
        sc.set(7, 10, 1);
        wins.setMatrixAt(nw++, m.compose(p, q.identity(), sc));
      }
    }
  }
  blocks.count = nb;
  wins.count = nw;
  blocks.frustumCulled = false; // one instanced draw spanning the whole level
  wins.frustumCulled = false;
  group.add(blocks, wins);
  return group;
}

// Drifting spores: points in the air around the play plane, rising as the 2D
// motes do (y decreases with time), each with its own flicker phase.
function spores(world) {
  const n = Math.min(1400, Math.round((world.width + 2 * 1200) / 14));
  const base = new Float32Array(n * 4); // x, y, z, speed
  const phase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    base[i * 4] = -1200 + Math.random() * (world.width + 2400);
    base[i * 4 + 1] = Math.random();
    base[i * 4 + 2] = -500 + Math.random() * 620;
    base[i * 4 + 3] = 5 + Math.random() * 16;
    phase[i] = Math.random() * 7;
  }
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 5, map: glowTexture(), vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  pts.frustumCulled = false;
  const span = world.height + 900; // from the world's floor up into the sky
  return {
    obj: pts,
    update(t) {
      for (let i = 0; i < n; i++) {
        const y0 = base[i * 4 + 1] * span;
        const y = ((((y0 - t * base[i * 4 + 3]) % span) + span) % span);
        pos[i * 3] = base[i * 4];
        pos[i * 3 + 1] = viewY(world.height - y);
        pos[i * 3 + 2] = base[i * 4 + 2];
        const a = 0.12 + 0.14 * Math.sin(t * 2 + phase[i]);
        col[i * 3] = 0.59 * a * 2.2;
        col[i * 3 + 1] = 0.86 * a * 2.2;
        col[i * 3 + 2] = 0.75 * a * 2.2;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}

// The hive: a green glow low on the horizon, far behind the last skyline and
// untouched by fog. It rides along with the camera at 95%, which is what a
// light on the horizon does.
function hive() {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(), color: "#6ef0aa", transparent: true, opacity: 0.2,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const s = new THREE.Sprite(mat);
  s.renderOrder = -1;
  return s;
}

export function buildBackground(world) {
  const group = new THREE.Group();
  const layers = LAYERS.map((l, i) => skylineLayer(l, world, i * 101));
  for (const l of layers) group.add(l);
  const glow = hive();
  group.add(glow);
  const motes = spores(world);
  group.add(motes.obj);
  return {
    group,
    sky: skyTexture(),
    update(m, cam) {
      motes.update(m.time);
      // The 2D glow sits at 72% across and 84% of the way down to the horizon.
      const z = -3600;
      const k = (cam.position.z - z) / cam.position.z; // how much bigger the view is out there
      const halfW = (cam.view.width / 2) * k;
      glow.position.set(cam.target.x + halfW * 0.44 - cam.target.x * 0.05, viewY(world.height) - 200, z);
      const size = 2400 * (1 + 0.06 * Math.sin(m.time * 0.7));
      glow.scale.set(size * 1.6, size, 1);
    },
  };
}
