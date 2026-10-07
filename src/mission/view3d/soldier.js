// ---------------------------------------------------------------------------
// 3D VIEW — soldiers (tech/mission-3d.md, R4).
//
// A procedural model per soldier, built from the 2D figure (`_drawSoldier`,
// deleted with the 2D view in tech/mission-3d-only.md O2): helmet, visor, torso with a chest stripe, backpack,
// legs and gun, in the soldier's colour. Every part's rectangle is the 2D
// figure's own fraction of the live collision box, so the model stays inside
// the box it is hit with and the crouch is the 2D crouch — folded shin, knee
// up, hunched torso — just given depth. What the sprite cannot carry is added
// on top: bevels, shoulder and knee plates, an emissive visor, a rim light
// (from the scene), and a contact shadow.
//
// Layout is in box-local space FACING RIGHT (x from the box's left edge, y
// down from its top); a soldier facing left is the same model mirrored.
//
// Standing, the legs are a rig rather than rects: hip → thigh → knee → shin →
// boot. Running swings them from the hip and folds the knee through the
// swing; the pelvis drops until the lower foot is on the ground (which is the
// bob), and the upper body leans into the run. Both blend in and out from the
// standing pose, so starting and stopping does not pop.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ModelMap, applyFlash, burnHalo, muzzleHalo } from "./actors.js";
import { loadArmour, makeArmour, fitArmour } from "./armour.js";
import { makeCape } from "./cape.js";
import { config } from "../../game/config.js";
import { setColor, shade, viewY } from "./util.js";

const ROUND = new RoundedBoxGeometry(1, 1, 1, 2, 0.18);
ROUND.userData.shared = true;
const BOX = new THREE.BoxGeometry(1, 1, 1);
BOX.userData.shared = true;
const DISC = new THREE.CircleGeometry(0.5, 20);
DISC.userData.shared = true;

// [part, x0, y0, x1, y1, zCentre, depth] as fractions of w / h; z and depth in
// px. Straight from the 2D fillRects, plus the plates the sprite has no room for.
function layout(s) {
  if (s.crouched) {
    return [
      ["shin", 0.12, 0.62, 0.72, 1.0, -3, 8],
      ["knee", 0.5, 0.44, 0.76, 1.0, 4, 8],
      ["kneePad", 0.52, 0.46, 0.8, 0.62, 8.5, 2],
      ["pack", -0.05, 0.16, 0.18, 0.58, -2, 12],
      ["torso", 0.18, 0.16, 0.82, 0.66, 0, 14],
      ["stripe", 0.48, 0.2, 0.54, 0.62, 7.3, 1],
      ["pad", 0.2, 0.14, 0.46, 0.3, 7, 3],
      ["helmet", 0.32, 0.0, 0.8, 0.34, 0, 16],
      ["visor", 0.54, 0.08, 0.84, 0.18, 4, 9],
    ];
  }
  return [
    ["pack", -0.07, 0.3, 0.2, 0.6, -2, 12],
    ["torso", 0.16, 0.28, 0.84, 0.68, 0, 14],
    ["stripe", 0.47, 0.3, 0.53, 0.64, 7.3, 1],
    ["pad", 0.14, 0.27, 0.42, 0.38, 7, 3],
    ["helmet", 0.24, 0.05, 0.76, 0.31, 0, 16],
    ["visor", 0.48, 0.12, 0.8, 0.2, 4, 9],
  ];
}

// Which colour each part takes, as the 2D figure's shading of the soldier's.
const TONE = {
  shin: -22, knee: -22, pack: -34, helmet: -22,
  torso: 0, stripe: 20, pad: 8, kneePad: 4,
};

// Shoulder squares: a plain dark block on each shoulder, square from the side
// camera, hung from the top of the shoulder. Deep enough to sit on the torso's
// side (z 7) and still cover the arm's shoulder joint (z 8.5, 4.6 thick).
const SHOULDER = {
  size: 7,                    // px, the square seen from the side
  back: 2, up: 2,             // px nudged back (away from facing) and up from the shoulder
  z: [[7, 11.5], [-7, -9.5]], // px, near and far: torso side → outer face
  color: "#1b202b",
};

// Arms: upper arm + forearm + glove each, solved by two-bone IK every frame.
// Shoulders ride the upper body (lean, bob, crouch), hands ride the gun (aim,
// mirror). The near (camera-side) hand holds the grip, the far one reaches
// round the front of the chest to support the barrel. Each elbow bends toward
// its own pole, in upper-body space (x forward, y up, z toward the camera):
// the near one down and back, the far one forward and out, so that arm
// crosses the FRONT of the chest under the gun rather than hiding behind it.
// `chestIn` is taken off the torso's front edge to make room.
const ARMS = {
  upper: 10, fore: 10,    // px, bone lengths
  thick: 4.6,             // px, sleeve cross-section
  chestIn: 0.1,           // fraction of w taken off the chest's front
  // [shoulder [x frac of w, z px], hand in gun space (x as a fraction of the
  //  barrel), elbow pole, tone]
  sides: [
    [[-0.05, 8.5], [0.22, -3.5, 2.6], [-0.4, -1, 0.7], -8],  // near
    [[0.05, -6.5], [0.66, -2.4, 1.2], [0.8, -0.8, 0.7], -26], // far
  ],
  gloveTone: -46,
  glove: [4, 4.4, 4],     // px
};

// The standing leg rig, as fractions of w / h: hip height, hip x standing
// (the 2D figure's two legs) and running (closer, as seen side-on), leg
// width, and where the thigh ends.
const HIP_Y = 0.62, KNEE_Y = 0.81;
const LEGS = [
  // [name, tone, hipX standing, hipX running, z, depth, kneePad]
  ["far", -30, 0.31, 0.45, -4, 7, false],
  ["near", -22, 0.69, 0.55, 4, 7, true],
];
const LEG_W = 0.22;
const BOOT_TONE = -44;
// Gait at full run speed (px/s): cadence in rad per px travelled, hip swing
// and knee fold in rad, forward lean of the upper body in rad.
const RUN_SPEED = 260, CADENCE = 0.052, SWING = 0.55, KNEE_BASE = 0.15, KNEE_FOLD = 1.05, LEAN = 0.12;

function make(s) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // mirrored for facing
  root.add(body);
  const upper = new THREE.Group(); // pivots at the hip, for the lean
  body.add(upper);
  const mats = [];
  const parts = {};
  const mat = (color, opts = {}) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.25, ...opts });
    m.userData.base = color.clone ? color.clone() : setColor(new THREE.Color(), color);
    if (opts.emissive) m.userData.glow = new THREE.Color(opts.emissive);
    mats.push(m);
    return m;
  };
  for (const name of Object.keys(TONE)) {
    const geo = name === "torso" || name === "helmet" || name === "pack" ? ROUND : BOX;
    const mesh = new THREE.Mesh(geo, mat(shade(s.color, TONE[name])));
    mesh.name = name; // found by name from graphics-tester/experiments.js
    upper.add(mesh);
    parts[name] = mesh;
  }
  parts.visor = new THREE.Mesh(BOX, mat("#7ad7ff", { emissive: "#3aa8e0", roughness: 0.2, metalness: 0.6 }));
  parts.visor.name = "visor";
  upper.add(parts.visor);
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

  // Legs: hip group → thigh + knee group → shin + boot.
  const bootMat = mat(shade(s.color, BOOT_TONE));
  const legs = LEGS.map(([, tone, , , , , hasPad]) => {
    const m = mat(shade(s.color, tone));
    const hip = new THREE.Group(), knee = new THREE.Group();
    const thigh = new THREE.Mesh(BOX, m), shin = new THREE.Mesh(BOX, m), boot = new THREE.Mesh(BOX, bootMat);
    const pad = hasPad ? new THREE.Mesh(BOX, mat(shade(s.color, TONE.kneePad))) : null;
    hip.add(thigh, knee);
    knee.add(shin, boot);
    if (pad) hip.add(pad);
    body.add(hip);
    return { hip, knee, thigh, shin, boot, pad };
  });

  // The gun: a pivot at the shoulder, the barrel along +x from it.
  const gun = new THREE.Group();
  gun.name = "gun"; // found by name from graphics-tester/experiments.js
  const gunMat = mat("#161c28", { roughness: 0.4, metalness: 0.7 });
  const barrel = new THREE.Mesh(BOX, gunMat);
  const grip = new THREE.Mesh(BOX, gunMat);
  const sight = new THREE.Mesh(BOX, mat("#7ad7ff", { emissive: "#2a7fb0" }));
  gun.add(barrel, grip, sight);
  root.add(gun);

  const shadow = new THREE.Mesh(DISC, new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.4, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;
  root.add(shadow);

  return { root, body, upper, parts, legs, gun, barrel, grip, sight, shadow, shoulders, arms, mats, armour: null, cape: null, gait: 0, phase: 0, t: null };
}

// Place a part from its fractional rect, in the body group's space (origin at
// the box centre, y up), less `oy` for a part parented below a pivot.
function put(mesh, s, r, oy = 0) {
  const [, x0, y0, x1, y1, z, d] = r;
  const w = s.w, h = s.h;
  mesh.visible = true;
  mesh.scale.set(Math.max(0.5, (x1 - x0) * w), Math.max(0.5, (y1 - y0) * h), d);
  mesh.position.set((x0 + x1) / 2 * w - w / 2, h / 2 - (y0 + y1) / 2 * h - oy, z);
}

// The Blender helmet and chest over the cube parts, attached on the first
// frame the kit has loaded (make() usually runs before it has). The Shells
// join the model's materials, so the hit flash reaches them.
function armour(v, s) {
  if (!v.armour) {
    v.armour = makeArmour(s.color, TONE);
    if (!v.armour) return;
    v.upper.add(v.armour.helmet, v.armour.chest);
    v.mats.push(...v.armour.mats);
  }
  fitArmour(v.armour, v.parts);
}

// Hung from the top of the shoulder: the torso's top, or the helmet's bottom
// where the crouch sinks the head below it. x is the shoulder's.
function shoulders(v) {
  const { torso, helmet } = v.parts;
  const top = Math.min(torso.position.y + torso.scale.y / 2, helmet.position.y - helmet.scale.y / 2);
  v.shoulders.forEach((b, i) => {
    const [z0, z1] = SHOULDER.z[i];
    b.scale.set(SHOULDER.size, SHOULDER.size, Math.abs(z1 - z0));
    b.position.set(-SHOULDER.back, top - SHOULDER.size / 2 + SHOULDER.up, (z0 + z1) / 2);
  });
}

// How far below the hip a leg's foot is, at hip angle `a` and knee fold `k`.
const reach = (a, k, thighLen, shinLen) => thighLen * Math.cos(a) + shinLen * Math.cos(a - k);

function pose(v, s, time) {
  const w = s.w, h = s.h, dir = s.facing >= 0 ? 1 : -1;
  v.root.position.set(s.x + w / 2, viewY(s.y + h / 2), 0);
  v.body.scale.x = dir;

  // Gait: phase advances with distance covered, and the whole cycle fades in
  // and out with `gait` (0 standing … 1 full run) so starts and stops blend.
  const dt = v.t === null ? 0 : Math.max(0, Math.min(0.1, time - v.t));
  v.t = time;
  const speed = Math.abs(s.vx || 0);
  const moving = s.onGround && speed > 20 && !s.crouched;
  const effort = moving ? Math.min(1, speed / RUN_SPEED) : 0;
  v.gait += (effort - v.gait) * Math.min(1, dt * 10);
  if (s.crouched) v.gait = 0;
  v.phase = (v.phase + dt * Math.max(speed, moving ? 0 : 120 * v.gait) * CADENCE) % (Math.PI * 2);
  const g = v.gait;

  const thighLen = (KNEE_Y - HIP_Y) * h, shinLen = (1 - KNEE_Y) * h;
  const legLen = thighLen + shinLen;
  const pose2 = LEGS.map((L, i) => {
    const ph = v.phase + i * Math.PI;
    const a = g * SWING * Math.sin(ph);
    const k = g * (KNEE_BASE + KNEE_FOLD * Math.max(0, Math.cos(ph)));
    return { a, k };
  });
  // The pelvis drops until the lower foot touches the ground.
  const drop = legLen - Math.max(...pose2.map((p) => reach(p.a, p.k, thighLen, shinLen)));
  const lean = g * LEAN;
  const hipY = h / 2 - HIP_Y * h - drop;

  for (const k in v.parts) v.parts[k].visible = false;
  v.upper.position.set(0, hipY, 0);
  v.upper.rotation.z = -lean;
  for (const r of layout(s)) put(v.parts[r[0]], s, r, h / 2 - HIP_Y * h);
  // Room for the arms: the chest's front pulled back, before the armour is
  // fitted to it.
  v.parts.torso.scale.x -= ARMS.chestIn * w;
  v.parts.torso.position.x -= ARMS.chestIn * w / 2;
  armour(v, s);
  shoulders(v);

  const legW = LEG_W * w;
  v.legs.forEach((leg, i) => {
    leg.hip.visible = !s.crouched;
    if (s.crouched) return;
    const [, , hx0, hx1, z, d] = LEGS[i];
    const { a, k } = pose2[i];
    leg.hip.position.set((hx0 + (hx1 - hx0) * g) * w - w / 2, hipY, z);
    leg.hip.rotation.z = a;
    leg.thigh.scale.set(legW, thighLen + 0.6, d);
    leg.thigh.position.set(0, -thighLen / 2, 0);
    leg.knee.position.set(0, -thighLen, 0);
    leg.knee.rotation.z = -k;
    leg.shin.scale.set(legW, shinLen, d);
    leg.shin.position.set(0, -shinLen / 2, 0);
    // The boot: the shin's bottom 3px, reaching forward past the toe.
    const bootLen = legW + w * 0.1;
    leg.boot.scale.set(bootLen, 3, d + 1);
    leg.boot.position.set((bootLen - legW) / 2, -shinLen + 1.5, 0);
    if (leg.pad) {
      leg.pad.scale.set(0.26 * w, 0.08 * h, 2);
      leg.pad.position.set(0.02 * w, -thighLen + 0.05 * h, d / 2 + 1);
    }
  });

  // Gun, in root space (not mirrored), so the angle is the world's.
  const gunLen = w * 0.62;
  let ang;
  if (s.aimVec) ang = Math.atan2(-s.aimVec.y, s.aimVec.x);
  else if (s.aimUp) ang = Math.PI / 2;
  else ang = dir > 0 ? 0 : Math.PI;
  // Carried by the upper body: down with the pelvis, forward with the lean.
  const shoulder = (HIP_Y - 0.42) * h;
  v.gun.position.set(dir * shoulder * Math.sin(lean), h / 2 - h * 0.42 - drop, 9);
  v.gun.rotation.z = ang;
  v.barrel.scale.set(gunLen, 4, 4);
  v.barrel.position.set(gunLen / 2, 0, 0);
  v.grip.scale.set(5, 7, 4);
  v.grip.position.set(gunLen * 0.2, -4, 0);
  v.sight.scale.set(4, 2, 3);
  v.sight.position.set(gunLen * 0.45, 3, 0);
  // Mirror the gun's up so its grip hangs below the barrel either way it points.
  v.gun.scale.y = Math.cos(ang) < 0 ? -1 : 1;

  v.shadow.position.set(0, -h / 2 + 0.6, 0);
  v.shadow.scale.set(w * 1.5, 22, 1);
  arms(v, s, gunLen);
}

// Two-bone IK for each arm, between a shoulder in upper-body space and a hand
// in gun space. Solved in world space off this frame's matrices; the meshes
// hang under the root, which only translates.
const _S = new THREE.Vector3(), _H = new THREE.Vector3(), _E = new THREE.Vector3();
const _d = new THREE.Vector3(), _pole = new THREE.Vector3(), _seg = new THREE.Vector3();
const _o = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
// A box from p to q (root space), `thick` across.
function bone(mesh, p, q, thick) {
  _seg.subVectors(q, p);
  const len = _seg.length();
  mesh.scale.set(thick, len + thick * 0.5, thick);
  mesh.position.addVectors(p, q).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(_Y, _seg.normalize());
}
function arms(v, s, gunLen) {
  v.root.updateWorldMatrix(true, true);
  const w = s.w, h = s.h, a = ARMS.upper, b = ARMS.fore, o = v.root.position;
  // Shoulder height in upper-body space (origin at the hip, y up).
  const shoulderY = (0.62 - (s.crouched ? 0.24 : 0.33)) * h;
  v.upper.localToWorld(_o.set(0, 0, 0));
  ARMS.sides.forEach(([[sx, sz], hand, [px, py, pz]], i) => {
    const L = v.arms[i];
    v.upper.localToWorld(_S.set(sx * w, shoulderY, sz));
    v.gun.localToWorld(_H.set(hand[0] * gunLen, hand[1], hand[2]));
    _d.subVectors(_H, _S);
    let dist = _d.length();
    _d.normalize();
    if (dist > a + b - 0.01) { _H.copy(_S).addScaledVector(_d, a + b - 0.01); dist = a + b - 0.01; }
    const along = (a * a - b * b + dist * dist) / (2 * dist);
    const rise = Math.sqrt(Math.max(0, a * a - along * along));
    // The pole, from upper-body space to a world direction, square to the reach.
    v.upper.localToWorld(_pole.set(px, py, pz)).sub(_o);
    _pole.addScaledVector(_d, -_pole.dot(_d)).normalize();
    _E.copy(_S).addScaledVector(_d, along).addScaledVector(_pole, rise);
    _S.sub(o); _E.sub(o); _H.sub(o);
    bone(L.up, _S, _E, ARMS.thick);
    bone(L.fore, _E, _H, ARMS.thick * 0.9);
    L.hand.position.copy(_H);
    L.hand.quaternion.copy(v.gun.getWorldQuaternion(_q));
    L.hand.scale.set(...ARMS.glove);
  });
}

// `wind(s)` is the air's velocity along x, px/s, at soldier `s`. A mission's
// air is still; a host whose soldier runs on the spot (the graphics tester's
// treadmill) passes the run the body is not really making.
export function createSoldiers(parent, { wind = null } = {}) {
  loadArmour();
  const models = new ModelMap(parent, make);
  return {
    sync(m, halos) {
      const scene = m.scene;
      models.begin();
      for (const s of scene.soldiers) {
        if (!s.alive) continue;
        const v = models.get(s);
        pose(v, s, m.time);
        if (config.cape3d) {
          v.cape ??= makeCape(v.root, v.upper, v.parts.pack);
          v.cape.update(s, m.time, wind ? wind(s) : 0);
        } else if (v.cape) v.cape.hide();
        applyFlash(v.mats, s.hitFlash > 0, false, m.time);
        if (s.muzzleFlash > 0) {
          const cx = s.x + s.w / 2;
          muzzleHalo(halos, m._gunTip(s, cx, s.y + s.h * 0.42, s.w * 0.62, s.y), s.muzzleColor);
        }
        if (s.burn) burnHalo(halos, s.x, s.y, s.w, m.time);
      }
      models.end((s) => scene.soldiers.includes(s));
    },
    // The soldier's gun group as posed this frame, or null if it has no
    // model (the laser sight reads it).
    gunOf(s) {
      const v = models.map.get(s);
      return v && v.root.visible ? v.gun : null;
    },
    dispose() {
      models.dispose();
    },
  };
}
