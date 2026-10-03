// ---------------------------------------------------------------------------
// 3D VIEW — the cape (tech/mission-3d-looks.md, L6).
//
// A verlet cloth: a grid of points, the top row pinned across the backpack's
// back face, the rest held at rest length by distance links. Gravity, air
// drag and a little flutter move it; a ripple pushes each point along the
// cloth's own normal so it folds in depth; a box round torso + backpack keeps
// it out of the body. Points live in WORLD space, so running, lean, bob and
// turning drag the cloth around rather than it being rigidly parented. The
// mesh hangs under the soldier's root (which only translates), so it hides
// and disposes with the model; vertices are written relative to it.
//
// Air is still in a mission — running is real motion through it. A host whose
// soldier runs on the spot (the graphics tester's treadmill) passes `wind`.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { viewY } from "./util.js";

const CAPE = {
  cols: 7, rows: 11,      // points across (z) and down — enough to carry the ripple
  width: 17, length: 24,  // px
  gravity: 900,           // px/s²
  drag: 2.2,              // per s, toward the air's velocity
  flutter: 60,            // px/s of gusting across the surface
  // 60 steps × 6 passes: several capes may be on a phone at once; bend and
  // the across wave are tuned to this budget's folds.
  iterations: 6,
  step: 1 / 60,
  color: "#8e1b22",
  // Ripple: two waves pushing each point along the cloth's normal, one down
  // the cape and one across it. px/s², rad/s, rad per row, rad per column,
  // the across wave's weight against the down wave.
  ripple: { accel: 2000, speed: 6, down: 1.0, across: 1.6, acrossWeight: 0.3 },
  inset: 0.6,             // px the pin line sits inside the pack's back face
  drop: 1.6,              // px below the pack's top (its corner is rounded)
  gap: 0.15,              // px the cloth hangs off the pack's back face
  bend: 0.2,              // stiffness of the skip-one links (1 = rigid sheet); low lets it fold
  maxDt: 0.1,             // s of mission time simulated per frame at most
  reseed: 200,            // px the body may move in one frame before the cloth is re-hung
};

const { cols, rows } = CAPE;
const N = cols * rows;
const DX = CAPE.width / (cols - 1), DY = CAPE.length / (rows - 1);
const at = (r, c) => r * cols + c;

// The grid's topology and rest lengths: the same for every cape.
const INDEX = [], UV = [], LINKS = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  UV.push(c / (cols - 1), 1 - r / (rows - 1));
  if (r < rows - 1 && c < cols - 1) {
    const a = at(r, c), b = a + 1, d = a + cols, e = d + 1;
    INDEX.push(a, d, b, b, d, e);
  }
  // [a, b, rest, stiffness]: structural, bend (skip one), shear.
  if (c + 1 < cols) LINKS.push([at(r, c), at(r, c + 1), DX, 1]);
  if (r + 1 < rows) LINKS.push([at(r, c), at(r + 1, c), DY, 1]);
  if (c + 2 < cols) LINKS.push([at(r, c), at(r, c + 2), DX * 2, CAPE.bend]);
  if (r + 2 < rows) LINKS.push([at(r, c), at(r + 2, c), DY * 2, CAPE.bend]);
  if (c + 1 < cols && r + 1 < rows) {
    const dd = Math.hypot(DX, DY);
    LINKS.push([at(r, c), at(r + 1, c + 1), dd, 1], [at(r, c + 1), at(r + 1, c), dd, 1]);
  }
}

// One cape, for one soldier model. `upper` is its upper-body group (origin at
// the hip, x forward, mirrored with facing) and `pack` its backpack part.
export function makeCape(root, upper, pack) {
  const pos = new Float32Array(N * 3), prev = new Float32Array(N * 3), nrm = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
  geo.setAttribute("position", attr);
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
  geo.setIndex(INDEX);
  const mat = new THREE.MeshStandardMaterial({
    color: CAPE.color, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; // the cloth's bounds change every frame
  root.add(mesh);

  const v = new THREE.Vector3();
  const pins = Array.from({ length: cols }, () => new THREE.Vector3());
  const toUpper = new THREE.Matrix4();
  // In upper-body space: the pin line on the pack's back face, and the box
  // (torso + backpack) the cloth may not enter, whose back is that face.
  // Read from the pack every frame, so the crouch's pack carries it too.
  const box = { x0: 0, x1: 0, y0: 0, y1: 0, z0: -9, z1: 9 };
  let pinX = 0, pinY = 0, pinZ = 0;
  let last = null, acc = 0, seeded = false;
  const lastRoot = new THREE.Vector3();

  function fit(s) {
    const back = pack.position.x - pack.scale.x / 2;
    pinX = back + CAPE.inset;
    pinY = pack.position.y + pack.scale.y / 2 - CAPE.drop;
    pinZ = pack.position.z;
    box.x0 = back - CAPE.gap;
    box.x1 = 0.36 * s.w;
    box.y0 = -0.05 * s.h;
    box.y1 = 0.4 * s.h;
  }
  const pin = (c, out) => upper.localToWorld(out.set(pinX, pinY, pinZ - CAPE.width / 2 + c * DX));

  function seed() {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      pin(c, v);
      v.y -= r * DY;
      const i = at(r, c) * 3;
      pos[i] = prev[i] = v.x; pos[i + 1] = prev[i + 1] = v.y; pos[i + 2] = prev[i + 2] = v.z;
    }
    seeded = true;
  }

  // Per-point surface normal, from the neighbours across and down.
  const P = (r, c, a) => pos[at(Math.max(0, Math.min(rows - 1, r)), Math.max(0, Math.min(cols - 1, c))) * 3 + a];
  function normals() {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const ux = P(r, c + 1, 0) - P(r, c - 1, 0), uy = P(r, c + 1, 1) - P(r, c - 1, 1), uz = P(r, c + 1, 2) - P(r, c - 1, 2);
      const vx = P(r + 1, c, 0) - P(r - 1, c, 0), vy = P(r + 1, c, 1) - P(r - 1, c, 1), vz = P(r + 1, c, 2) - P(r - 1, c, 2);
      const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
      const l = Math.hypot(x, y, z) || 1, i = at(r, c) * 3;
      nrm[i] = x / l; nrm[i + 1] = y / l; nrm[i + 2] = z / l;
    }
  }

  function step(dt, t, airX, ground) {
    // Verlet with drag toward the air's velocity, plus flutter and ripple.
    const k = Math.min(1, CAPE.drag * dt);
    const R = CAPE.ripple;
    normals();
    // The body does not move within a step: pins and the world → upper-body
    // matrix are worked out once, not per pass or per point.
    for (let c = 0; c < cols; c++) pin(c, pins[c]);
    toUpper.copy(upper.matrixWorld).invert();
    for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = at(r, c) * 3;
      const g = Math.sin(t * 9 + r * 0.9 + c * 1.7) * CAPE.flutter * (r / rows);
      // Along the normal, growing down the cape (the pinned row cannot move).
      const fold = R.accel * (r / (rows - 1)) * dt * dt *
        (Math.sin(t * R.speed - r * R.down) + R.acrossWeight * Math.sin(t * R.speed * 0.73 + c * R.across + r * 0.4));
      for (let a = 0; a < 3; a++) {
        const vel = pos[i + a] - prev[i + a];
        const air = (a === 0 ? airX : a === 2 ? g : g * 0.3) * dt;
        prev[i + a] = pos[i + a];
        pos[i + a] += vel + (air - vel) * k + (a === 1 ? -CAPE.gravity * dt * dt : 0) + fold * nrm[i + a];
      }
    }
    for (let it = 0; it < CAPE.iterations; it++) {
      for (let c = 0; c < cols; c++) {
        const i = at(0, c) * 3, p = pins[c];
        pos[i] = prev[i] = p.x; pos[i + 1] = prev[i + 1] = p.y; pos[i + 2] = prev[i + 2] = p.z;
      }
      for (const [a, b, rest, stiff] of LINKS) {
        const ia = a * 3, ib = b * 3;
        const ex = pos[ib] - pos[ia], ey = pos[ib + 1] - pos[ia + 1], ez = pos[ib + 2] - pos[ia + 2];
        const d = Math.hypot(ex, ey, ez) || 1e-6;
        const f = (d - rest) / d * 0.5 * stiff;
        const pa = a >= cols, pb = b >= cols; // the top row is pinned
        const fa = pa && pb ? f : pa ? f * 2 : 0, fb = pa && pb ? f : pb ? f * 2 : 0;
        pos[ia] += ex * fa; pos[ia + 1] += ey * fa; pos[ia + 2] += ez * fa;
        pos[ib] -= ex * fb; pos[ib + 1] -= ey * fb; pos[ib + 2] -= ez * fb;
      }
      // Keep out of the body: a point inside the box goes out its back.
      for (let p = cols; p < N; p++) {
        const i = p * 3;
        v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(toUpper);
        if (v.x > box.x0 && v.x < box.x1 && v.y > box.y0 && v.y < box.y1 && v.z > box.z0 && v.z < box.z1) {
          v.x = box.x0;
          v.applyMatrix4(upper.matrixWorld);
          pos[i] = v.x; pos[i + 1] = v.y; pos[i + 2] = v.z;
        }
      }
      // And above the ground under the soldier's feet.
      for (let p = cols; p < N; p++) if (pos[p * 3 + 1] < ground) pos[p * 3 + 1] = ground;
    }
  }

  // Not in the model's flash materials: the cloth keeps its colour on a hit.
  return {
    // After the model is posed for this frame. `airX` is the air's velocity
    // in px/s along x.
    update(s, time, airX) {
      mesh.visible = true;
      root.updateWorldMatrix(true, true);
      fit(s);
      if (seeded && root.position.distanceTo(lastRoot) > CAPE.reseed) seeded = false;
      lastRoot.copy(root.position);
      if (!seeded) { seed(); last = null; acc = 0; }
      const dt = last === null ? 0 : Math.min(CAPE.maxDt, Math.max(0, time - last));
      last = time;
      acc += dt;
      const ground = viewY(s.y + s.h) + 0.5;
      while (acc >= CAPE.step) {
        step(CAPE.step, time - acc, airX, ground);
        acc -= CAPE.step;
      }
      // Steps are 60Hz; on a faster display the top edge would trail the pack
      // between them, so the drawn top row follows it every frame.
      const o = root.position, out = attr.array;
      for (let i = 0; i < N * 3; i += 3) {
        out[i] = pos[i] - o.x; out[i + 1] = pos[i + 1] - o.y; out[i + 2] = pos[i + 2] - o.z;
      }
      for (let c = 0; c < cols; c++) {
        pin(c, v).sub(o);
        out[c * 3] = v.x; out[c * 3 + 1] = v.y; out[c * 3 + 2] = v.z;
      }
      attr.needsUpdate = true;
      geo.computeVertexNormals();
    },
    // Off: hidden, and re-hung from scratch when it comes back.
    hide() {
      mesh.visible = false;
      seeded = false;
    },
  };
}
