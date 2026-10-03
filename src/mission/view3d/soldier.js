// ---------------------------------------------------------------------------
// 3D VIEW — soldiers (tech/mission-3d.md, R4).
//
// A procedural model per soldier, built from the 2D figure (`_drawSoldier` in
// src/mission/mission.js): helmet, visor, torso with a chest stripe, backpack,
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

  return { root, body, upper, parts, legs, gun, barrel, grip, sight, shadow, mats, armour: null, gait: 0, phase: 0, t: null };
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
  armour(v, s);

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
}

export function createSoldiers(parent) {
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
