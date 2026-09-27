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
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ModelMap, applyFlash, burnHalo, muzzleHalo } from "./actors.js";
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
    ["legFar", 0.2, 0.62, 0.42, 1.0, -4, 7],
    ["legNear", 0.58, 0.62, 0.8, 1.0, 4, 7],
    ["kneePad", 0.58, 0.72, 0.84, 0.8, 8, 2],
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
  shin: -22, knee: -22, legFar: -30, legNear: -22, pack: -34, helmet: -22,
  torso: 0, stripe: 20, pad: 8, kneePad: 4,
};

function make(s) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // mirrored for facing
  root.add(body);
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
    body.add(mesh);
    parts[name] = mesh;
  }
  parts.visor = new THREE.Mesh(BOX, mat("#7ad7ff", { emissive: "#3aa8e0", roughness: 0.2, metalness: 0.6 }));
  body.add(parts.visor);

  // The gun: a pivot at the shoulder, the barrel along +x from it.
  const gun = new THREE.Group();
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

  return { root, body, parts, gun, barrel, grip, sight, shadow, mats };
}

// Place a part from its fractional rect, in the body group's space (origin at
// the box centre, y up).
function put(mesh, s, r, dx = 0) {
  const [, x0, y0, x1, y1, z, d] = r;
  const w = s.w, h = s.h;
  mesh.visible = true;
  mesh.scale.set(Math.max(0.5, (x1 - x0) * w), Math.max(0.5, (y1 - y0) * h), d);
  mesh.position.set((x0 + x1) / 2 * w - w / 2 + dx, h / 2 - (y0 + y1) / 2 * h, z);
}

function pose(v, s, time) {
  const w = s.w, h = s.h, dir = s.facing >= 0 ? 1 : -1;
  v.root.position.set(s.x + w / 2, viewY(s.y + h / 2), 0);
  v.body.scale.x = dir;

  // A stride while running on the ground; still otherwise.
  const moving = s.onGround && Math.abs(s.vx || 0) > 20 && !s.crouched;
  const stride = moving ? Math.sin(time * 16) * w * 0.12 : 0;

  for (const k in v.parts) v.parts[k].visible = false;
  for (const r of layout(s)) {
    const mesh = v.parts[r[0]];
    const dx = r[0] === "legNear" || r[0] === "kneePad" ? stride : r[0] === "legFar" ? -stride : 0;
    put(mesh, s, r, dx);
  }

  // Gun, in root space (not mirrored), so the angle is the world's.
  const gunLen = w * 0.62;
  let ang;
  if (s.aimVec) ang = Math.atan2(-s.aimVec.y, s.aimVec.x);
  else if (s.aimUp) ang = Math.PI / 2;
  else ang = dir > 0 ? 0 : Math.PI;
  v.gun.position.set(0, h / 2 - h * 0.42, 9);
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
    dispose() {
      models.dispose();
    },
  };
}
