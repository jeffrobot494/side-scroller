// ---------------------------------------------------------------------------
// SPACE PROTOTYPE — the squad's soldier model (tech/space-prototype.md, "3D view").
//
// A COPY of the game's soldier (src/mission/view3d/soldier.js, armour.js,
// cape.js), so a game change never reaches the prototype: the Blender helmet
// and chest (./models/, copied from src/mission/view3d/models/), shoulder
// squares, two-bone IK arms on the gun, the hip → knee leg rig, and the verlet
// cape. What differs is what space asks of it:
//   - the root ROTATES (the figure turns in the play plane, figurePose), where
//     the game's only translates — so the arms and the cape go into root space
//     through its matrix instead of subtracting its position;
//   - there is no gravity and no ground: floating, the legs settle into a
//     slight bend; on the boots they stand and walk (the game's gait, off `gv`);
//   - the cape has no air to fall through. It streams behind any motion (drag
//     toward rest in world space) and settles toward the figure's feet.
// Troopers keep view3d.js's cube figure and its red visor.
//
// Layout is in figure-local space FACING RIGHT (x from the box's left edge,
// y down from its top), mirrored for facing.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CFG } from "./sim.js";
import { figurePose } from "./view.js";

export const FIGURE_W = 28; // the soldier figure, ≈ the game's 30×46 in an r=18 circle
export const FIGURE_H = CFG.bodyLength;
const W = FIGURE_W, H = FIGURE_H;

// Shared by every model: disposeTree (view3d.js) skips `userData.shared`.
const ROUND = new RoundedBoxGeometry(1, 1, 1, 2, 0.18);
const BOX = new THREE.BoxGeometry(1, 1, 1);
for (const g of [ROUND, BOX]) g.userData.shared = true;

const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...opts });
const hot = (color, k) => {
  const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  m.color.multiplyScalar(k);
  return m;
};
const shade = (css, d) => new THREE.Color(css).offsetHSL(0, 0, d / 100);

// [part, x0, y0, x1, y1, zCentre, depth]: the game's standing layout, with the
// prototype's bigger pack (it is the jetpack).
const LAYOUT = [
  ["pack", -0.12, 0.26, 0.2, 0.64, -2, 14],
  ["torso", 0.16, 0.28, 0.84, 0.68, 0, 14],
  ["stripe", 0.47, 0.3, 0.53, 0.64, 7.3, 1],
  ["pad", 0.14, 0.27, 0.42, 0.38, 7, 3],
  ["helmet", 0.24, 0.05, 0.76, 0.31, 0, 16],
  ["visor", 0.48, 0.12, 0.8, 0.2, 4, 9],
];
const TONE = { pack: -34, helmet: -22, torso: 0, stripe: 20, pad: 8, kneePad: 4 };

const SHOULDER = { size: 7, back: 2, up: 2, z: [[7, 11.5], [-7, -9.5]], color: "#1b202b" };

const ARMS = {
  upper: 10, fore: 10, thick: 4.6, chestIn: 0.1,
  sides: [
    [[-0.05, 8.5], [0.22, -3.5, 2.6], [-0.4, -1, 0.7], -8],  // near
    [[0.05, -6.5], [0.66, -2.4, 1.2], [0.8, -0.8, 0.7], -26], // far
  ],
  gloveTone: -46,
  glove: [4, 4.4, 4],
};

const HIP_Y = 0.62, KNEE_Y = 0.81;
const LEGS = [
  // [name, tone, hipX standing, hipX running, z, depth, kneePad]
  ["far", -30, 0.31, 0.45, -4, 7, false],
  ["near", -22, 0.69, 0.55, 4, 7, true],
];
const LEG_W = 0.22;
const BOOT_TONE = -44;
const RUN_SPEED = 260, CADENCE = 0.052, SWING = 0.55, KNEE_BASE = 0.15, KNEE_FOLD = 1.05, LEAN = 0.12;
// Floating: hips and knees settle into a slight bend (rad), eased in and out
// over FLOAT_TAU as the boots let go and catch.
const FLOAT = { hip: 0.3, knee: 0.5 }, FLOAT_TAU = 0.15;
const TURN_TAU = 0.05; // s: the standing figure's eased turn (M4)

// ---- armour (armour.js) -------------------------------------------------------------
const FILES = { helmet: "helmet.glb", chest: "chest.glb" };
let kit = null;
let loading = null;

// Start the load (idempotent). A failure leaves the cube parts.
export function loadArmour() {
  loading ??= import("three/addons/loaders/GLTFLoader.js")
    .then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      return Promise.all(Object.entries(FILES).map(([k, f]) =>
        loader.loadAsync(new URL(`./models/${f}`, import.meta.url).href).then((g) => [k, g.scene])));
    })
    .then((pairs) => {
      kit = Object.fromEntries(pairs);
      for (const root of Object.values(kit)) {
        root.traverse((o) => {
          if (!o.isMesh) return;
          o.geometry.userData.shared = true;
          if (o.material.name !== "Shell") o.material.userData.shared = true;
        });
      }
    })
    .catch((err) => console.warn("space: 3D armour did not load; keeping the plain parts", err));
  return loading;
}

function makeArmour(color) {
  if (!kit) return null;
  const mats = [];
  const piece = (name, tone) => {
    const obj = kit[name].clone();
    obj.traverse((o) => {
      if (!o.isMesh || o.material.name !== "Shell") return;
      o.material = o.material.clone();
      o.material.color.copy(shade(color, tone));
      mats.push(o.material);
    });
    return obj;
  };
  return { helmet: piece("helmet", TONE.helmet), chest: piece("chest", TONE.torso), mats };
}

const HELMET_FIT = 1.12, HELMET_LIFT = 0.11, CHEST_TUCK = 0.15;
function fitArmour(a, parts) {
  const { helmet, torso } = parts;
  for (const k of ["helmet", "visor", "torso", "stripe", "pad"]) parts[k].visible = false;
  const s = helmet.scale.x * HELMET_FIT;
  a.helmet.scale.setScalar(s);
  a.helmet.position.set(helmet.position.x, helmet.position.y - HELMET_LIFT * s, helmet.position.z);
  const bottom = torso.position.y - torso.scale.y / 2;
  const top = Math.min(torso.position.y + torso.scale.y / 2,
    helmet.position.y - helmet.scale.y / 2 + CHEST_TUCK * helmet.scale.y);
  a.chest.scale.set(torso.scale.x, top - bottom, torso.scale.z);
  a.chest.position.set(torso.position.x, (top + bottom) / 2, torso.position.z);
}

// ---- the model ------------------------------------------------------------------------
export function makeSquadSoldier(s) {
  const root = new THREE.Group(); // at the soldier, turned to its facing
  const body = new THREE.Group(); // mirrored when the sim says dir -1
  root.add(body);
  const upper = new THREE.Group(); // pivots at the hip, for the lean
  body.add(upper);
  const mats = [];
  const mat = (color, opts) => {
    const m = std(color, opts);
    mats.push(m);
    return m;
  };
  const parts = {};
  for (const r of LAYOUT) {
    const name = r[0];
    const m = name === "visor"
      ? mat("#7ad7ff", { emissive: "#3aa8e0", emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.6 })
      : mat(shade(s.color, TONE[name]));
    const geo = name === "torso" || name === "helmet" || name === "pack" ? ROUND : BOX;
    parts[name] = new THREE.Mesh(geo, m);
    upper.add(parts[name]);
  }
  const glove = mat(shade(s.color, ARMS.gloveTone));
  const arms = ARMS.sides.map(([, , , tone]) => {
    const m = mat(shade(s.color, tone));
    const up = new THREE.Mesh(BOX, m), fore = new THREE.Mesh(BOX, m), hand = new THREE.Mesh(BOX, glove);
    root.add(up, fore, hand);
    return { up, fore, hand };
  });
  const shoulderMat = mat(SHOULDER.color, { roughness: 0.5, metalness: 0.4 });
  const shoulders = SHOULDER.z.map(() => {
    const m = new THREE.Mesh(BOX, shoulderMat);
    upper.add(m);
    return m;
  });

  // Legs: hip group → thigh + knee group → shin + boot (+ the lit sole).
  const bootMat = mat(shade(s.color, BOOT_TONE));
  const soleMat = hot("#78ffe6", 1.6);
  const legs = LEGS.map(([, tone, , , , , hasPad]) => {
    const m = mat(shade(s.color, tone));
    const hip = new THREE.Group(), knee = new THREE.Group();
    const thigh = new THREE.Mesh(BOX, m), shin = new THREE.Mesh(BOX, m), boot = new THREE.Mesh(BOX, bootMat);
    const sole = new THREE.Mesh(BOX, soleMat);
    const pad = hasPad ? new THREE.Mesh(BOX, mat(shade(s.color, TONE.kneePad))) : null;
    hip.add(thigh, knee);
    knee.add(shin, boot, sole);
    if (pad) hip.add(pad);
    body.add(hip);
    return { hip, knee, thigh, shin, boot, sole, pad };
  });

  // The gun: a child of root (turned, never mirrored), with its own flip.
  const gun = new THREE.Group();
  const gunMat = std("#161c28", { roughness: 0.4, metalness: 0.7 });
  const barrel = new THREE.Mesh(BOX, gunMat);
  const grip = new THREE.Mesh(BOX, gunMat);
  const sight = new THREE.Mesh(BOX, hot("#7ad7ff", 1.2));
  gun.add(barrel, grip, sight);
  root.add(gun);

  return {
    root, body, upper, parts, legs, gun, barrel, grip, sight, shoulders, arms, mats,
    color: s.color, armour: null, cape: makeCape(root, upper, parts.pack),
    gait: 0, phase: 0, float: s.boots ? 0 : 1, rot: null,
  };
}

function put(mesh, r, oy) {
  const [, x0, y0, x1, y1, z, d] = r;
  mesh.visible = true;
  mesh.scale.set((x1 - x0) * W, (y1 - y0) * H, d);
  mesh.position.set(((x0 + x1) / 2 - 0.5) * W, (0.5 - (y0 + y1) / 2) * H - oy, z);
}

const reach = (a, k, thighLen, shinLen) => thighLen * Math.cos(a) + shinLen * Math.cos(a - k);

// Pose for this frame; `t` is world time, `dt` the frame. The jetpack and the
// hit flash are view3d.js's.
export function poseSquadSoldier(v, s, t, dt, isCtrl) {
  const p = figurePose(s);
  let rot = p.rot;
  if (s.boots === "ground" && v.rot != null) {
    const d = Math.atan2(Math.sin(p.rot - v.rot), Math.cos(p.rot - v.rot));
    rot = v.rot + d * (1 - Math.exp(-dt / TURN_TAU));
  }
  v.rot = rot;
  v.root.position.set(s.x, -s.y, 0);
  v.root.rotation.z = rot;
  v.body.scale.x = p.dir;
  // The sim's feet are at r (18), the drawn ones at half the figure (21): with
  // the boots on, lift the figure so its soles meet the surface.
  const booted = !!s.boots;
  v.body.position.y = booted ? H / 2 - s.r : 0;
  v.body.rotation.z = booted ? 0 : Math.sin(t * 1.3 + s.x * 0.01) * 0.04;

  // Gait on the boots (the game's, driven by the walk speed along the surface);
  // the floating bend fades in as the boots let go.
  const speed = Math.abs(s.gv || 0);
  const walking = s.boots === "ground" && speed > 20;
  const effort = walking ? Math.min(1, speed / RUN_SPEED) : 0;
  v.gait += (effort - v.gait) * Math.min(1, dt * 10);
  v.float += ((booted ? 0 : 1) - v.float) * (1 - Math.exp(-dt / FLOAT_TAU));
  v.phase = (v.phase + dt * Math.max(speed, walking ? 0 : 120 * v.gait) * CADENCE) % (Math.PI * 2);
  const g = v.gait, f = v.float;

  const thighLen = (KNEE_Y - HIP_Y) * H, shinLen = (1 - KNEE_Y) * H;
  const legLen = thighLen + shinLen;
  const legPose = LEGS.map((L, i) => {
    const ph = v.phase + i * Math.PI;
    return {
      a: g * SWING * Math.sin(ph) + f * FLOAT.hip,
      k: g * (KNEE_BASE + KNEE_FOLD * Math.max(0, Math.cos(ph))) + f * FLOAT.knee,
    };
  });
  // On the boots the pelvis drops until the lower foot is on the surface.
  const drop = (1 - f) * (legLen - Math.max(...legPose.map((q) => reach(q.a, q.k, thighLen, shinLen))));
  const lean = g * LEAN;
  const hipY = H / 2 - HIP_Y * H - drop;

  v.upper.position.set(0, hipY, 0);
  v.upper.rotation.z = -lean;
  for (const r of LAYOUT) put(v.parts[r[0]], r, H / 2 - HIP_Y * H);
  v.parts.torso.scale.x -= ARMS.chestIn * W;
  v.parts.torso.position.x -= ARMS.chestIn * W / 2;
  if (!v.armour) {
    v.armour = makeArmour(v.color);
    if (v.armour) {
      v.upper.add(v.armour.helmet, v.armour.chest);
      v.mats.push(...v.armour.mats);
    }
  }
  if (v.armour) fitArmour(v.armour, v.parts);
  shoulders(v);

  const legW = LEG_W * W;
  v.legs.forEach((leg, i) => {
    const [, , hx0, hx1, z, d] = LEGS[i];
    const { a, k } = legPose[i];
    leg.hip.position.set((hx0 + (hx1 - hx0) * g) * W - W / 2, hipY, z);
    leg.hip.rotation.z = a;
    leg.thigh.scale.set(legW, thighLen + 0.6, d);
    leg.thigh.position.set(0, -thighLen / 2, 0);
    leg.knee.position.set(0, -thighLen, 0);
    leg.knee.rotation.z = -k;
    leg.shin.scale.set(legW, shinLen, d);
    leg.shin.position.set(0, -shinLen / 2, 0);
    const bootLen = legW + W * 0.1;
    leg.boot.scale.set(bootLen, 3, d + 1);
    leg.boot.position.set((bootLen - legW) / 2, -shinLen + 1.5, 0);
    // Boot soles, lit while the boots are on (M4).
    leg.sole.visible = booted;
    leg.sole.scale.set(bootLen + 1, 2.5, d + 1.5);
    leg.sole.position.set((bootLen - legW) / 2, -shinLen - 0.5, 0);
    if (leg.pad) {
      leg.pad.scale.set(0.26 * W, 0.08 * H, 2);
      leg.pad.position.set(0.02 * W, -thighLen + 0.05 * H, d / 2 + 1);
    }
  });

  // Gun at the shoulder, pointing at the aim. A companion with no one to shoot
  // keeps its last aim in the sim; drawn, that is a gun held over its head, so
  // an idle one rests along its facing.
  const gunLen = W * 0.62;
  const shoulder = (HIP_Y - 0.42) * H;
  v.gun.position.set(p.dir * shoulder * Math.sin(lean), v.body.position.y + H / 2 - H * 0.42 - drop, 9);
  const idle = !isCtrl && !(s.foe && s.foe.alive);
  const ang = -(idle ? s.angle : s.aim) - rot;
  v.gun.rotation.z = ang;
  v.gun.scale.y = Math.cos(ang) < 0 ? -1 : 1;
  v.barrel.scale.set(gunLen, 4, 4);
  v.barrel.position.set(gunLen / 2, 0, 0);
  v.grip.scale.set(5, 7, 4);
  v.grip.position.set(gunLen * 0.2, -4, 0);
  v.sight.scale.set(4, 2, 3);
  v.sight.position.set(gunLen * 0.45, 3, 0);
  arms(v, gunLen);

  v.cape.update(t);
}

function shoulders(v) {
  const { torso, helmet } = v.parts;
  const top = Math.min(torso.position.y + torso.scale.y / 2, helmet.position.y - helmet.scale.y / 2);
  v.shoulders.forEach((b, i) => {
    const [z0, z1] = SHOULDER.z[i];
    b.scale.set(SHOULDER.size, SHOULDER.size, Math.abs(z1 - z0));
    b.position.set(-SHOULDER.back, top - SHOULDER.size / 2 + SHOULDER.up, (z0 + z1) / 2);
  });
}

// Two-bone IK, solved in world space and written in root space (the root
// turns here, so it is its inverse matrix, not a subtraction).
const _S = new THREE.Vector3(), _H = new THREE.Vector3(), _E = new THREE.Vector3();
const _d = new THREE.Vector3(), _pole = new THREE.Vector3(), _seg = new THREE.Vector3();
const _o = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
function bone(mesh, p, q, thick) {
  _seg.subVectors(q, p);
  const len = _seg.length();
  mesh.scale.set(thick, len + thick * 0.5, thick);
  mesh.position.addVectors(p, q).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(_Y, _seg.normalize());
}
function arms(v, gunLen) {
  v.root.updateWorldMatrix(true, true);
  const a = ARMS.upper, b = ARMS.fore;
  const shoulderY = (0.62 - 0.33) * H;
  v.upper.localToWorld(_o.set(0, 0, 0));
  ARMS.sides.forEach(([[sx, sz], hand, [px, py, pz]], i) => {
    const L = v.arms[i];
    v.upper.localToWorld(_S.set(sx * W, shoulderY, sz));
    v.gun.localToWorld(_H.set(hand[0] * gunLen, hand[1], hand[2]));
    _d.subVectors(_H, _S);
    let dist = _d.length();
    _d.normalize();
    if (dist > a + b - 0.01) { _H.copy(_S).addScaledVector(_d, a + b - 0.01); dist = a + b - 0.01; }
    const along = (a * a - b * b + dist * dist) / (2 * dist);
    const rise = Math.sqrt(Math.max(0, a * a - along * along));
    v.upper.localToWorld(_pole.set(px, py, pz)).sub(_o);
    _pole.addScaledVector(_d, -_pole.dot(_d)).normalize();
    _E.copy(_S).addScaledVector(_d, along).addScaledVector(_pole, rise);
    v.root.worldToLocal(_S); v.root.worldToLocal(_E); v.root.worldToLocal(_H);
    bone(L.up, _S, _E, ARMS.thick);
    bone(L.fore, _E, _H, ARMS.thick * 0.9);
    L.hand.position.copy(_H);
    L.hand.quaternion.copy(v.gun.quaternion); // the gun is root's child
    L.hand.scale.set(...ARMS.glove);
  });
}

// ---- the cape (cape.js) ---------------------------------------------------------------
// The game's cloth, less its gravity, air and ground: points stay in WORLD
// space, so any motion drags the cloth behind it (drag toward rest), and a
// weak pull toward the figure's own feet (`settle`) lays it down the back
// when nothing is moving.
const CAPE = {
  cols: 7, rows: 11,
  width: 17, length: 24,  // px
  settle: 600,            // px/s² toward the figure's feet
  drag: 2.2,              // per s, toward rest
  flutter: 60,            // px/s of gusting across the surface
  iterations: 6,
  step: 1 / 60,
  color: "#8e1b22",
  ripple: { accel: 2000, speed: 6, down: 1.0, across: 1.6, acrossWeight: 0.3 },
  inset: 0.6, drop: 1.6, gap: 0.15,
  bend: 0.2,
  maxDt: 0.1,
  reseed: 200,            // px the body may move in one frame before the cloth is re-hung
};

const { cols, rows } = CAPE;
const N = cols * rows;
const DX = CAPE.width / (cols - 1), DY = CAPE.length / (rows - 1);
const at = (r, c) => r * cols + c;
const INDEX = [], UV = [], LINKS = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  UV.push(c / (cols - 1), 1 - r / (rows - 1));
  if (r < rows - 1 && c < cols - 1) {
    const a = at(r, c), b = a + 1, d = a + cols, e = d + 1;
    INDEX.push(a, d, b, b, d, e);
  }
  if (c + 1 < cols) LINKS.push([at(r, c), at(r, c + 1), DX, 1]);
  if (r + 1 < rows) LINKS.push([at(r, c), at(r + 1, c), DY, 1]);
  if (c + 2 < cols) LINKS.push([at(r, c), at(r, c + 2), DX * 2, CAPE.bend]);
  if (r + 2 < rows) LINKS.push([at(r, c), at(r + 2, c), DY * 2, CAPE.bend]);
  if (c + 1 < cols && r + 1 < rows) {
    const dd = Math.hypot(DX, DY);
    LINKS.push([at(r, c), at(r + 1, c + 1), dd, 1], [at(r, c + 1), at(r + 1, c), dd, 1]);
  }
}

function makeCape(root, upper, pack) {
  const pos = new Float32Array(N * 3), prev = new Float32Array(N * 3), nrm = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
  geo.setAttribute("position", attr);
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
  geo.setIndex(INDEX);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: CAPE.color, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide,
  }));
  mesh.frustumCulled = false;
  root.add(mesh);

  const v = new THREE.Vector3(), down = new THREE.Vector3();
  const pins = Array.from({ length: cols }, () => new THREE.Vector3());
  const toUpper = new THREE.Matrix4(), toRoot = new THREE.Matrix4();
  const box = { x0: 0, x1: 0.36 * W, y0: -0.05 * H, y1: 0.4 * H, z0: -9, z1: 9 };
  let pinX = 0, pinY = 0, pinZ = 0;
  let last = null, acc = 0, seeded = false;
  const lastRoot = new THREE.Vector3();

  function fit() {
    const back = pack.position.x - pack.scale.x / 2;
    pinX = back + CAPE.inset;
    pinY = pack.position.y + pack.scale.y / 2 - CAPE.drop;
    pinZ = pack.position.z;
    box.x0 = back - CAPE.gap;
  }
  // Row r hangs r·DY down the back, in upper-body space.
  const pin = (c, out, r = 0) => upper.localToWorld(out.set(pinX, pinY - r * DY, pinZ - CAPE.width / 2 + c * DX));

  function seed() {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      pin(c, v, r);
      const i = at(r, c) * 3;
      pos[i] = prev[i] = v.x; pos[i + 1] = prev[i + 1] = v.y; pos[i + 2] = prev[i + 2] = v.z;
    }
    seeded = true;
  }

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

  function step(dt, t) {
    const k = Math.min(1, CAPE.drag * dt);
    const R = CAPE.ripple;
    normals();
    for (let c = 0; c < cols; c++) pin(c, pins[c]);
    toUpper.copy(upper.matrixWorld).invert();
    down.set(0, -1, 0).transformDirection(upper.matrixWorld).multiplyScalar(CAPE.settle * dt * dt);
    const dn = [down.x, down.y, down.z];
    for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = at(r, c) * 3;
      const g = Math.sin(t * 9 + r * 0.9 + c * 1.7) * CAPE.flutter * (r / rows);
      const fold = R.accel * (r / (rows - 1)) * dt * dt *
        (Math.sin(t * R.speed - r * R.down) + R.acrossWeight * Math.sin(t * R.speed * 0.73 + c * R.across + r * 0.4));
      for (let a = 0; a < 3; a++) {
        const vel = pos[i + a] - prev[i + a];
        const air = (a === 0 ? 0 : a === 2 ? g : g * 0.3) * dt;
        prev[i + a] = pos[i + a];
        pos[i + a] += vel + (air - vel) * k + dn[a] + fold * nrm[i + a];
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
        const pa = a >= cols, pb = b >= cols;
        const fa = pa && pb ? f : pa ? f * 2 : 0, fb = pa && pb ? f : pb ? f * 2 : 0;
        pos[ia] += ex * fa; pos[ia + 1] += ey * fa; pos[ia + 2] += ez * fa;
        pos[ib] -= ex * fb; pos[ib + 1] -= ey * fb; pos[ib + 2] -= ez * fb;
      }
      for (let p = cols; p < N; p++) {
        const i = p * 3;
        v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(toUpper);
        if (v.x > box.x0 && v.x < box.x1 && v.y > box.y0 && v.y < box.y1 && v.z > box.z0 && v.z < box.z1) {
          v.x = box.x0;
          v.applyMatrix4(upper.matrixWorld);
          pos[i] = v.x; pos[i + 1] = v.y; pos[i + 2] = v.z;
        }
      }
    }
  }

  return {
    // After the model is posed for this frame; `time` is world time.
    update(time) {
      root.updateWorldMatrix(true, true);
      fit();
      if (seeded && root.position.distanceTo(lastRoot) > CAPE.reseed) seeded = false;
      lastRoot.copy(root.position);
      if (!seeded) { seed(); last = null; acc = 0; }
      const dt = last === null ? 0 : Math.min(CAPE.maxDt, Math.max(0, time - last));
      last = time;
      acc += dt;
      while (acc >= CAPE.step) {
        step(CAPE.step, time - acc);
        acc -= CAPE.step;
      }
      // Into root space; the drawn top row follows the pack every frame.
      toRoot.copy(root.matrixWorld).invert();
      const out = attr.array;
      for (let p = 0; p < N; p++) {
        const i = p * 3;
        if (p < cols) pin(p, v); else v.set(pos[i], pos[i + 1], pos[i + 2]);
        v.applyMatrix4(toRoot);
        out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
      }
      attr.needsUpdate = true;
      geo.computeVertexNormals();
    },
  };
}
