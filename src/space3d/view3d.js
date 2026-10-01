// ---------------------------------------------------------------------------
// SPACE FPS — the first-person view (tech/space-fps.md).
//
// The world in three.js from the eye of the soldier you fly. The only module
// here that imports `three` (the CDN pin in space3d.html's import map); hud.js
// draws the flat layer over it. Reads the world and the events, writes
// nothing back. Cosmetic randomness is Math.random.
//
// The look is the 2D prototype's (src/space/view3d.js), copied: flat-shaded
// rocks, a hard sun and a cold rim, unlit glowing shots, bloom.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { makeRng } from "../space/sim.js";
import { eyeOf } from "./camera.js";
import { controlled, CFG } from "./sim.js";
import { ENEMY_TYPES } from "../space/sim.js";

// ---- shared geometry and materials ---------------------------------------------
const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(1, 16, 12);
const CONE = new THREE.ConeGeometry(1, 1, 12); // apex +y
CONE.rotateZ(-Math.PI / 2); // apex +x
const OCTA = new THREE.OctahedronGeometry(1, 0);
const SHARED = new Set([BOX, SPHERE, CONE, OCTA]);

let _glow = null;
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g2 = c.getContext("2d");
  const g = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  g2.fillStyle = g;
  g2.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !SHARED.has(o.geometry)) o.geometry.dispose();
    const m = o.material;
    if (m) for (const mm of Array.isArray(m) ? m : [m]) if (mm.map !== _glow) mm.dispose();
  });
}

const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...opts });
// Unlit and over 1 so the bloom pass picks it up.
const hot = (color, k = 1.8) => {
  const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  m.color.multiplyScalar(k);
  return m;
};
const mesh = (geo, mat, parent) => {
  const m = new THREE.Mesh(geo, mat);
  if (parent) parent.add(m);
  return m;
};
const setQ = (o, q) => o.quaternion.set(q[0], q[1], q[2], q[3]);

// Entity → model, kept across frames; what a frame did not ask for is removed.
class Models {
  constructor(parent, make) {
    this.parent = parent;
    this.make = make;
    this.map = new Map();
    this.seen = new Set();
  }
  get(e) {
    let v = this.map.get(e);
    if (!v) {
      v = this.make(e);
      this.map.set(e, v);
      this.parent.add(v.root);
    }
    this.seen.add(e);
    return v;
  }
  sweep() {
    for (const [e, v] of this.map) {
      if (this.seen.has(e)) continue;
      this.parent.remove(v.root);
      disposeTree(v.root);
      this.map.delete(e);
    }
    this.seen.clear();
  }
}

// Per-frame pool of throwaway objects (shots, sparks): the i-th request gets
// the i-th object.
class Pool {
  constructor(parent, make) {
    this.parent = parent;
    this.make = make;
    this.items = [];
    this.used = 0;
  }
  begin() { this.used = 0; }
  next() {
    let o = this.items[this.used];
    if (!o) {
      o = this.make();
      this.items.push(o);
      this.parent.add(o);
    }
    this.used++;
    o.visible = true;
    return o;
  }
  end() { for (let i = this.used; i < this.items.length; i++) this.items[i].visible = false; }
}

const X = new THREE.Vector3(1, 0, 0);
const _v = new THREE.Vector3();
// Point a model's +x along (dx, dy, dz).
function aimX(o, dx, dy, dz) {
  _v.set(dx, dy, dz);
  const l = _v.length();
  if (l > 1e-9) o.quaternion.setFromUnitVectors(X, _v.multiplyScalar(1 / l));
}

// ---- target drones (F2) ---------------------------------------------------------------
function makeDummy(e) {
  const root = new THREE.Group();
  const body = mesh(SPHERE, std("#7a3b3b", { emissive: "#000000" }), root);
  body.scale.setScalar(e.r);
  const ring = mesh(new THREE.TorusGeometry(e.r * 1.3, 2.2, 8, 32), hot("#ff8a8a", 1.3), root);
  ring.rotation.x = 1.2;
  const eye = mesh(SPHERE, hot("#ffcf6a", 2), root);
  eye.scale.setScalar(4);
  eye.position.z = e.r * 0.85;
  return { root, ring, mats: [body.material] };
}

function flash(mats, on) {
  for (const m of mats) {
    if (!m.emissive) continue;
    if (m.userData.e0 == null) m.userData.e0 = { c: m.emissive.clone(), k: m.emissiveIntensity };
    if (on) {
      m.emissive.set("#ffffff");
      m.emissiveIntensity = 0.3;
    } else {
      m.emissive.copy(m.userData.e0.c);
      m.emissiveIntensity = m.userData.e0.k;
    }
  }
}

// ---- soldiers -----------------------------------------------------------------------------
// The 2D page's figure (src/space/view3d.js LAYOUT): [part, x0, y0, x1, y1,
// zCentre, depth], fractions of a 28 × 42 box facing +x, y down from its top.
// Here the figure faces the body's forward (-Z), up is +Y, and the layout's
// depth runs along +X.
const FIGURE_W = 28;
const FIGURE_H = 42;
const LAYOUT = [
  ["legFar", 0.2, 0.62, 0.42, 1.0, -4, 7],
  ["legNear", 0.58, 0.62, 0.8, 1.0, 4, 7],
  ["kneePad", 0.58, 0.72, 0.84, 0.8, 8, 2],
  ["pack", -0.12, 0.26, 0.2, 0.64, -2, 14],
  ["torso", 0.16, 0.28, 0.84, 0.68, 0, 14],
  ["stripe", 0.47, 0.3, 0.53, 0.64, 7.3, 1],
  ["pad", 0.14, 0.27, 0.42, 0.38, 7, 3],
  ["helmet", 0.24, 0.05, 0.76, 0.31, 0, 16],
];
const TONE = { legFar: -30, legNear: -22, kneePad: 4, pack: -34, torso: 0, stripe: 20, pad: 8, helmet: -22 };
const VISOR = { squad: ["#7ad7ff", "#3aa8e0"], hostile: ["#ff6a5a", "#e0302a"] };
const shade = (css, d) => new THREE.Color(css).offsetHSL(0, 0, d / 100);

function place(m, r) {
  const [, x0, y0, x1, y1, z, d] = r;
  m.scale.set(d, (y1 - y0) * FIGURE_H, (x1 - x0) * FIGURE_W);
  m.position.set(z, (0.5 - (y0 + y1) / 2) * FIGURE_H, -((x0 + x1) / 2 - 0.5) * FIGURE_W);
}

export function makeFigure(s, visorKind = "squad") {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mats = [];
  const parts = {};
  for (const r of LAYOUT) {
    const mat = std(shade(s.color, TONE[r[0]]), { emissive: "#000000" });
    mats.push(mat);
    parts[r[0]] = mesh(BOX, mat, body);
    place(parts[r[0]], r);
  }
  const [vc, ve] = VISOR[visorKind];
  const visor = mesh(BOX, std(vc, { emissive: ve, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.6 }), body);
  place(visor, ["visor", 0.48, 0.12, 0.8, 0.2, 0, 17]);
  // Boot soles, lit while the boots are on.
  const soles = [];
  for (const k of ["legFar", "legNear"]) {
    const r = LAYOUT.find((l) => l[0] === k);
    const sole = mesh(BOX, hot("#78ffe6", 1.6), body);
    sole.scale.set(r[6] + 1, 2.5, (r[3] - r[1]) * FIGURE_W + 1);
    sole.position.set(r[5], -FIGURE_H / 2 + 1, -((r[1] + r[3]) / 2 - 0.5) * FIGURE_W);
    sole.visible = false;
    soles.push(sole);
  }
  // The jet: out of the pack, backward, while it thrusts.
  const flame = mesh(CONE, hot("#ffab40", 2.2), body);
  flame.rotation.y = -Math.PI / 2; // +x apex → +z (behind)
  const flameGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#ff9a3a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  body.add(flameGlow);
  // The gun, from the shoulder, along the aim.
  const gun = new THREE.Group();
  body.add(gun);
  gun.position.set(8, 0.12 * FIGURE_H, -2);
  const gunMat = std("#2a3040", { roughness: 0.4, metalness: 0.3 });
  mesh(BOX, gunMat, gun).scale.set(18, 4, 4);
  gun.children[0].position.x = 9;
  const sight = mesh(BOX, hot(visorKind === "squad" ? "#7ad7ff" : "#ff6a5a", 1.2), gun);
  sight.scale.set(4, 2, 3);
  sight.position.set(8, 3, 0);
  return { root, body, gun, flame, flameGlow, mats, soles, legs: [parts.legFar, parts.legNear, parts.kneePad] };
}

const _q = new THREE.Quaternion();
export function poseFigure(v, s, t) {
  v.root.position.set(s.x, s.y, s.z);
  setQ(v.root, s.q);
  const booted = !!s.boots;
  // The sim's feet are r below the centre, the drawn ones half the figure:
  // with the boots on, lift the figure so its soles meet the surface.
  v.body.position.y = booted ? FIGURE_H / 2 - s.r : 0;
  // Legs trail a little floating, stand straight on the boots, and stride walking.
  const walking = s.boots === "ground" && Math.hypot(s.gv[0], s.gv[1]) > 20;
  const stride = walking ? Math.sin(t * 16) * 0.35 : 0;
  v.legs.forEach((leg, i) => { leg.rotation.x = booted ? (i === 0 ? stride : -stride) : -0.18; });
  for (const sole of v.soles) sole.visible = booted;
  v.flame.visible = v.flameGlow.visible = !!s.thrusting;
  if (s.thrusting) {
    const len = 14 + Math.random() * 10;
    v.flame.scale.set(len, 4.5, 4.5);
    v.flame.position.set(-2, -0.05 * FIGURE_H, 0.64 * FIGURE_W + 2 + len / 2);
    v.flameGlow.position.set(0, -0.05 * FIGURE_H, 0.64 * FIGURE_W + 8);
    v.flameGlow.scale.set(34, 34, 1);
  }
  // The gun along the aim, in the body's frame.
  const a = s.aim || [0, 0, -1];
  _v.set(a[0], a[1], a[2]).applyQuaternion(_q.set(s.q[0], s.q[1], s.q[2], s.q[3]).invert());
  v.gun.quaternion.setFromUnitVectors(X, _v.normalize());
  flash(v.mats, s.flash > 0);
}

// ---- enemies (the 2D page's models, facing +x) ---------------------------------------------
function makeEnemyModel(e) {
  if (e.type === "trooper") return makeFigure(e, "hostile");
  const root = new THREE.Group();
  const spin = new THREE.Group(); // turned to heading / aim
  root.add(spin);
  const inner = new THREE.Group(); // its own roll about +x
  spin.add(inner);
  const mats = [];
  const add = (geo, mat) => {
    if (mat.emissive) mats.push(mat);
    return mesh(geo, mat, inner);
  };
  const T = ENEMY_TYPES[e.type];
  const col = T.color;
  const r = e.r;
  const extra = {};
  switch (e.type) {
    case "charger": {
      add(OCTA, std(col, { flatShading: true, metalness: 0.4 })).scale.set(r * 1.5, r * 0.8, r * 0.8);
      const horn = add(CONE, std(shade(col, 20), { metalness: 0.5 }));
      horn.scale.set(r * 0.8, r * 0.35, r * 0.35);
      horn.position.x = r * 1.4;
      extra.jet = add(CONE, hot("#ff7850", 2));
      extra.jet.rotation.z = Math.PI;
      break;
    }
    case "gunner": {
      const hull = add(new THREE.CylinderGeometry(r, r, r * 1.1, 6), std(col, { flatShading: true, metalness: 0.35 }));
      hull.rotation.x = Math.PI / 2;
      const barrel = add(BOX, std("#3b1a45", { metalness: 0.6 }));
      barrel.scale.set(r + 8, 8, 8);
      barrel.position.set(r / 2 + 6, 0, 0);
      const eye = add(SPHERE, hot("#8affc1", 2));
      eye.scale.setScalar(5);
      eye.position.set(r * 0.85, r * 0.35, 0);
      break;
    }
    case "swarmer": {
      add(CONE, std(col, { flatShading: true, metalness: 0.4 })).scale.set(r * 2.2, r * 0.9, r * 0.5);
      const fin = add(BOX, std(shade(col, -15)));
      fin.scale.set(r * 0.8, r * 2, 2);
      fin.position.x = -r * 0.5;
      break;
    }
    case "warden": {
      add(OCTA, std(col, { flatShading: true, metalness: 0.5, roughness: 0.3 })).scale.set(r * 1.6, r * 0.75, r * 0.6);
      const band = add(new THREE.TorusGeometry(r * 0.78, 2.5, 6, 24), hot("#ffcf6a", 1.3));
      band.rotation.y = Math.PI / 2;
      for (const side of [-1, 1]) {
        const pod = add(BOX, std("#3a3020", { metalness: 0.5 }));
        pod.scale.set(r * 1.1, 7, 7);
        pod.position.set(r * 0.5, side * r * 0.62, 0);
      }
      const eye = add(SPHERE, hot("#ff6a3a", 2.2));
      eye.scale.setScalar(6);
      eye.position.set(r * 0.9, 0, r * 0.4);
      extra.jet = add(CONE, hot("#ffb347", 1.8));
      extra.jet.rotation.z = Math.PI;
      break;
    }
    case "minelayer": {
      extra.bladder = add(SPHERE, std(col, { roughness: 0.35, metalness: 0.1 }));
      for (let i = 0; i < 3; i++) {
        const pod = add(SPHERE, hot("#bff29a", 1.4));
        pod.scale.setScalar(3);
        pod.position.set(-6 + i * 6, -3, r * 0.75);
      }
      break;
    }
    case "mine": {
      add(SPHERE, std("#3a4a2a", { metalness: 0.5 })).scale.setScalar(r * 0.8);
      for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const spike = add(CONE, std(col, { metalness: 0.6 }));
        spike.scale.set(7, 2, 2);
        spike.position.set(d[0] * (r * 0.8 + 2), d[1] * (r * 0.8 + 2), d[2] * (r * 0.8 + 2));
        spike.quaternion.setFromUnitVectors(X, new THREE.Vector3(...d));
      }
      extra.light = add(SPHERE, new THREE.MeshBasicMaterial({ color: "#6a7a4a", toneMapped: false }));
      extra.light.scale.setScalar(4);
      break;
    }
  }
  return { root, spin, inner, mats, extra };
}

function poseEnemyModel(v, e, t) {
  v.root.position.set(e.x, e.y, e.z);
  const sp = Math.hypot(e.vx, e.vy, e.vz);
  const tg = e.target && e.alert ? e.target : null;
  const face = (e.type === "gunner" || e.type === "warden") && tg ? [tg.x - e.x, tg.y - e.y, tg.z - e.z] : sp > 1 ? [e.vx, e.vy, e.vz] : null;
  if (face) aimX(v.spin, face[0], face[1], face[2]);
  switch (e.type) {
    case "charger": {
      v.inner.rotation.x = t * 3; // barrel roll
      const len = e.r * (0.8 + Math.random() * 0.6);
      v.extra.jet.scale.set(len, e.r * 0.3, e.r * 0.3);
      v.extra.jet.position.x = -e.r * 1.4 - len / 2;
      break;
    }
    case "warden": {
      const len = e.r * (0.5 + Math.min(1, sp / 200) * 0.6 + Math.random() * 0.15);
      v.extra.jet.scale.set(len, e.r * 0.25, e.r * 0.25);
      v.extra.jet.position.x = -e.r * 1.6 - len / 2;
      break;
    }
    case "swarmer": v.inner.rotation.x = Math.sin(t * 9 + e.r) * 0.5; break;
    case "minelayer": {
      const pulse = 1 + Math.sin(t * 3 + e.r) * 0.06;
      v.extra.bladder.scale.set(e.r * 1.2 * pulse, (e.r * 0.8) / pulse, e.r * 0.8);
      break;
    }
    case "mine": {
      const T = ENEMY_TYPES.mine;
      const armed = e.age >= T.arm, fuse = e.fuse > 0;
      const blink = fuse ? Math.sin(t * 60) > 0 : armed ? Math.sin(t * 6) > 0.6 : false;
      v.inner.rotation.set(t * 1.1, t * 1.5, 0);
      v.extra.light.material.color.set(fuse ? "#ff5040" : blink ? "#ffec80" : "#6a7a4a").multiplyScalar(fuse || blink ? 2.2 : 1);
      break;
    }
  }
  flash(v.mats, e.flash > 0);
}

// ---- the gun in your hands ------------------------------------------------------------
// Drawn in its own scene and camera, after the world with the depth cleared,
// so it never pokes into a rock. Built per weapon and soldier colour.
function makeViewGun(s) {
  const root = new THREE.Group();
  // Little metalness: with no environment map a metal renders black.
  const body = std("#7f8ba0", { roughness: 0.45, metalness: 0.3 });
  const dark = std("#3a4252", { roughness: 0.5, metalness: 0.3 });
  const add = (geo, mat, sx, sy, sz, x, y, z) => {
    const m = mesh(geo, mat, root);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    return m;
  };
  const id = s.weapon.id;
  const glow = s.weapon.projectile.color;
  let tip = -30;
  if (id === "grenade_launcher") {
    add(BOX, body, 5, 5, 16, 0, 0, -6);
    add(new THREE.CylinderGeometry(1, 1, 1, 12), dark, 5.2, 9, 5.2, 0, -0.5, -10).rotation.x = Math.PI / 2;
    const drum = add(new THREE.CylinderGeometry(1, 1, 1, 8), body, 5, 6, 5, 0, -3, -3);
    drum.rotation.z = Math.PI / 2;
    add(BOX, hot(glow, 1.4), 0.6, 0.6, 4, 2.5, 2.8, -8);
    tip = -15;
  } else if (id === "arc_tazer") {
    add(BOX, body, 4, 5, 14, 0, 0, -5);
    add(BOX, dark, 2, 2, 14, 0, 1, -18);
    for (let i = 0; i < 4; i++) {
      const coil = mesh(new THREE.TorusGeometry(2.4, 0.5, 6, 16), hot(glow, 2), root);
      coil.position.set(0, 1, -13 - i * 3.2);
    }
    add(BOX, dark, 2.5, 5, 3, 0, -4, -2);
    tip = -25;
  } else {
    add(BOX, body, 4, 5, 18, 0, 0, -6);
    add(BOX, dark, 1.6, 1.6, 16, 0, 1, -21);
    add(BOX, dark, 2.6, 7, 3.5, 0, -5, -8);
    add(BOX, hot(glow, 1.2), 0.5, 0.5, 2, 0, 2.9, -10);
    tip = -29;
  }
  // The forearm and glove, from the bottom right, in the soldier's colour.
  add(BOX, std(s.color, { roughness: 0.7, metalness: 0.1 }), 6, 6, 14, 2, -5, 6);
  add(BOX, std("#2a2f3a", { roughness: 0.8 }), 5, 5, 5, 0.5, -3.5, -1);
  const muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  muzzle.position.set(0, 1, tip - 2);
  muzzle.scale.setScalar(14);
  root.add(muzzle);
  root.scale.setScalar(0.45);
  return { root, muzzle, tip, key: id + s.color };
}

// ---- shots -------------------------------------------------------------------------------
function makeShot(shape) {
  const g = new THREE.Group();
  const mat = hot("#ffffff");
  const core = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
  switch (shape) {
    case "orb": mesh(SPHERE, mat, g); mesh(SPHERE, core, g).scale.setScalar(0.45); break;
    case "pellet": mesh(SPHERE, mat, g); break;
    case "bolt": mesh(OCTA, mat, g).scale.set(1, 0.25, 0.25); break;
    case "missile": {
      mesh(BOX, std("#c8ccd4", { metalness: 0.6 }), g).scale.set(0.8, 0.5, 0.5);
      const nose = mesh(CONE, mat, g);
      nose.scale.set(0.3, 0.25, 0.25);
      nose.position.x = 0.55;
      const fl = mesh(CONE, hot("#ffb45a", 2.2), g);
      fl.rotation.z = Math.PI;
      fl.position.x = -0.8;
      fl.scale.set(0.8, 0.3, 0.3);
      break;
    }
    case "wave": mesh(new THREE.TorusGeometry(0.5, 0.15, 6, 18), mat, g).rotation.y = Math.PI / 2; break;
    default: mesh(BOX, mat, g).scale.set(1, 0.3, 0.3); mesh(BOX, core, g).scale.set(0.9, 0.15, 0.15);
  }
  g.userData.mat = mat;
  return g;
}

// ---- asteroids ----------------------------------------------------------------------
// An icosphere roughened by a smooth function of direction (so the duplicated
// vertices of a flat-shaded mesh move together and it stays closed), kept
// inside 0.88–1.04 of the collision radius, as the 2D outline is.
function makeAsteroid(a) {
  const rng = makeRng(a.look);
  const geo = new THREE.IcosahedronGeometry(1, a.r > 220 ? 4 : a.r > 90 ? 3 : 2);
  const pos = geo.attributes.position;
  const waves = [];
  for (let i = 0; i < 7; i++) {
    const d = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    waves.push([d, 0.6 + i * 0.9 + rng(), rng() * 6.28, 1 / (1 + i * 0.8)]);
  }
  // A few craters: dents round a direction.
  const craters = [];
  for (let i = 0; i < 2 + Math.floor(rng() * 4); i++) {
    craters.push([new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize(), 0.15 + rng() * 0.25]);
  }
  const v = new THREE.Vector3();
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let rough = 0;
    for (const [d, k, ph, w] of waves) rough += Math.sin(v.dot(d) * k * 3 + ph) * w;
    let dent = 0;
    for (const [d, size] of craters) {
      const c = 1 - v.distanceTo(d) / size;
      if (c > 0) dent += c * c * 0.08;
    }
    const k = Math.min(1.06, Math.max(0.8, 0.95 + rough * 0.06 - dent));
    pos.setXYZ(i, v.x * a.r * k, v.y * a.r * k, v.z * a.r * k);
    const shade = 0.6 + (k - 0.8) * 1.6;
    col.set([shade, shade, shade], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const tint = 0.22 + rng() * 0.12;
  const mat = std(new THREE.Color().setHSL(0.06 + rng() * 0.05, 0.1 + rng() * 0.08, tint), { roughness: 0.95, metalness: 0.05, flatShading: true, vertexColors: true });
  const root = new THREE.Group();
  mesh(geo, mat, root);
  return { root };
}

// ---- derelicts (static per world) ----------------------------------------------------
function deckTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#8390a4";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
  }
  g.strokeStyle = "rgba(170,190,220,0.12)";
  g.lineWidth = 1;
  for (let i = 1; i <= 128; i += 32) {
    g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
  }
  g.fillStyle = "rgba(0,0,0,0.3)";
  for (let x = 8; x < 128; x += 32) for (let y = 8; y < 128; y += 32) g.fillRect(x, y, 3, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildRuins(world) {
  const group = new THREE.Group();
  const deckTex = deckTexture();
  const deckMat = std("#ffffff", { map: deckTex, roughness: 0.75, metalness: 0.2, emissive: "#0c1018" });
  const wallMat = std("#c4ccd8", { roughness: 0.6, metalness: 0.2, map: deckTex, emissive: "#0c1018" });
  const doorLamp = hot("#ffcf8a", 1.8);
  const breachLamp = hot("#ff6a4a", 2);
  const panel = hot("#cfe6ff", 1.3);
  const trim = hot("#ffb45a", 0.9);
  for (const r of world.ruins) {
    const g = new THREE.Group();
    g.position.set(r.x, r.y, r.z);
    setQ(g, r.q);
    for (const sd of r.solids) {
      if (sd.kind === "wall") {
        const ex = sd.b[0] - sd.a[0], ey = sd.b[1] - sd.a[1];
        const l = Math.hypot(ex, ey);
        const geo = new THREE.BoxGeometry(l + sd.t, sd.t * 2, sd.z1 - sd.z0 + sd.t);
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * l / 128, uv.getY(i) * (sd.z1 - sd.z0) / 128);
        const m = mesh(geo, wallMat, g);
        m.position.set(sd.c[0], sd.c[1], sd.c[2]);
        m.rotation.z = Math.atan2(ey, ex);
        // Hull plates carry a lit stripe along the outside, so the ship's
        // outline reads against the dark.
        if (sd.hull) {
          let nx = -ey / l, ny = ex / l;
          if (nx * sd.c[0] + ny * sd.c[1] < 0) { nx = -nx; ny = -ny; }
          for (const z of [sd.z0 + 22, sd.z1 - 22]) {
            if (z < sd.z0 || z > sd.z1) continue;
            const st = mesh(BOX, trim, g);
            st.scale.set(l, 1, 3);
            st.position.set(sd.c[0] + nx * (sd.t + 0.6), sd.c[1] + ny * (sd.t + 0.6), z);
            st.rotation.z = Math.atan2(ey, ex);
          }
        }
      } else {
        const shape = new THREE.Shape(sd.poly.map(([x, y]) => new THREE.Vector2(x, y)));
        const geo = new THREE.ExtrudeGeometry(shape, { depth: sd.t * 2, bevelEnabled: false });
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 128, pos.getY(i) / 128);
        const m = mesh(geo, deckMat, g);
        m.position.z = sd.zc - sd.t;
      }
    }
    // A lamp at each corner of every hole, so a door or a breach reads as a gap.
    for (const h of r.holes) {
      const sd = r.solids.find((o) => o.kind === "wall" && Math.hypot((o.a[0] + o.b[0]) / 2 - h.at[0], (o.a[1] + o.b[1]) / 2 - h.at[1]) < 1);
      if (!sd) continue;
      const ex = sd.b[0] - sd.a[0], ey = sd.b[1] - sd.a[1];
      const l = Math.hypot(ex, ey);
      const nx = -ey / l, ny = ex / l, o = sd.t + 3;
      for (const end of [sd.a, sd.b]) {
        for (const dz of [-75, 75]) {
          for (const side of [-1, 1]) {
            const lamp = mesh(SPHERE, h.breach ? breachLamp : doorLamp, g);
            lamp.scale.setScalar(4);
            lamp.position.set(end[0] + nx * o * side, end[1] + ny * o * side, h.at[2] + dz);
          }
        }
      }
    }
    // Light panels under the ceiling of every room.
    for (const room of r.rooms) {
      const l = new THREE.Vector3(room[0] - r.x, room[1] - r.y, room[2] - r.z).applyQuaternion(new THREE.Quaternion(r.q[0], r.q[1], r.q[2], r.q[3]).invert());
      const m = mesh(BOX, panel, g);
      m.scale.set(90, 10, 2);
      m.position.set(l.x, l.y, r.H / 2 - CFG_T - 2);
    }
    group.add(g);
  }
  return group;
}
const CFG_T = 6; // a plate's half-thickness (CFG.wallHalf), for placing lamps on it

// The artifact and extraction.
function makeArtifact() {
  const root = new THREE.Group();
  const core = mesh(OCTA, hot("#ff7af0", 2.2), root);
  core.scale.setScalar(12);
  const cage = mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffb8f8").multiplyScalar(1.6), wireframe: true, toneMapped: false }), root);
  cage.scale.setScalar(20);
  return { root, core, cage };
}

function makeExtract(ex) {
  const root = new THREE.Group();
  root.position.set(ex.x, ex.y, ex.z);
  const glow = new THREE.Color("#8affc1");
  const shell = mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), root);
  shell.scale.setScalar(ex.r);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const ring = mesh(new THREE.TorusGeometry(ex.r, 1.6, 6, 64), new THREE.MeshBasicMaterial({ color: glow.clone().multiplyScalar(1.8), toneMapped: false }), root);
    ring.rotation.set(i === 1 ? Math.PI / 2 : 0, i === 2 ? Math.PI / 2 : 0, 0);
    rings.push(ring);
  }
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  beacon.scale.setScalar(ex.r * 1.4);
  root.add(beacon);
  return { root, rings };
}

// ---- the backdrop -----------------------------------------------------------------------
// Stars and nebulae on a sphere that travels with the eye, so they never come
// closer; untouched by the fog.
function buildSky() {
  const group = new THREE.Group();
  const N = 9000;
  const R = 30000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(R);
    pos.set([v.x, v.y, v.z], i * 3);
    c.setHSL(0.55 + Math.random() * 0.15, 0.4, 0.45 + Math.random() ** 3 * 0.55);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  group.add(new THREE.Points(geo, new THREE.PointsMaterial({
    size: 2, sizeAttenuation: false, vertexColors: true, map: glowTexture(), transparent: true, depthWrite: false, fog: false,
  })));
  const tints = ["#3a2a6a", "#1c4a6a", "#5a2a4a", "#244a3a", "#4a3a1c"];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: tints[i % tints.length], transparent: true, opacity: 0.3, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    }));
    v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(R * 0.9);
    s.position.copy(v);
    s.scale.setScalar(12000 + Math.random() * 18000);
    group.add(s);
  }
  // The sun's disc, where the light comes from.
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color("#fff1d0").multiplyScalar(3), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sun.position.copy(SUN_DIR.clone().multiplyScalar(R * 0.8));
  sun.scale.setScalar(2600);
  group.add(sun);
  return group;
}

const SUN_DIR = new THREE.Vector3(0.45, 0.75, 0.48).normalize();

// Dust round the eye, wrapped into a box that moves with it: in empty space
// it is the only thing that says how fast you are going. Each mote is a short
// streak along the eye's velocity.
const DUST_N = 700;
const DUST_BOX = 1400;
function buildDust() {
  const base = new Float32Array(DUST_N * 3);
  for (let i = 0; i < base.length; i++) base[i] = Math.random() * DUST_BOX;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(DUST_N * 6), 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#8fa3c4", transparent: true, opacity: 0.55, fog: false }));
  lines.frustumCulled = false;
  return { lines, base };
}

function poseDust(dust, eye, vel) {
  const p = dust.lines.geometry.attributes.position;
  const sp = Math.hypot(vel[0], vel[1], vel[2]);
  // At rest a mote is a speck 2px long; moving, a streak of 0.04s of travel.
  const k = sp > 50 ? 0.04 : 0;
  const d = sp > 50 ? [vel[0] * k, vel[1] * k, vel[2] * k] : [2, 0, 0];
  const h = DUST_BOX / 2;
  for (let i = 0; i < DUST_N; i++) {
    const o = [];
    for (let a = 0; a < 3; a++) {
      const e = eye[a];
      o[a] = e + ((((dust.base[i * 3 + a] - e) % DUST_BOX) + DUST_BOX * 1.5) % DUST_BOX) - h;
    }
    p.setXYZ(i * 2, o[0], o[1], o[2]);
    p.setXYZ(i * 2 + 1, o[0] - d[0], o[1] - d[1], o[2] - d[2]);
  }
  p.needsUpdate = true;
}

// The cube: its edges, and a faint grid on each face so you can see a wall coming.
function buildBounds(size) {
  const group = new THREE.Group();
  const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
    new THREE.LineBasicMaterial({ color: new THREE.Color("#ff5a5a").multiplyScalar(1.4), toneMapped: false, transparent: true, opacity: 0.7, fog: false }));
  box.position.set(size / 2, size / 2, size / 2);
  group.add(box);
  const div = 24;
  const faces = [
    [[1, 0, 0], [0, 0, Math.PI / 2], [0, 1, 1]], [[-1, 0, 0], [0, 0, Math.PI / 2], [2, 1, 1]],
    [[0, 1, 0], [0, 0, 0], [1, 0, 1]], [[0, -1, 0], [0, 0, 0], [1, 2, 1]],
    [[0, 0, 1], [Math.PI / 2, 0, 0], [1, 1, 0]], [[0, 0, -1], [Math.PI / 2, 0, 0], [1, 1, 2]],
  ];
  for (const [, rot, at] of faces) {
    const g = new THREE.GridHelper(size, div, "#ff5a5a", "#5a2020");
    g.material.transparent = true;
    g.material.opacity = 0.12;
    g.rotation.set(rot[0], rot[1], rot[2]);
    g.position.set((at[0] * size) / 2, (at[1] * size) / 2, (at[2] * size) / 2);
    group.add(g);
  }
  return group;
}

// ---- the view ----------------------------------------------------------------------------
export function createView3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#03050a");
  scene.fog = new THREE.FogExp2("#070a14", 0.00016);
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 2, 60000);
  scene.add(camera);

  // A hard white sun, a cold blue rim from the opposite side, very little
  // fill: space has no sky to light the shadow side.
  scene.add(new THREE.HemisphereLight("#4a5a7a", "#140f0c", 0.3));
  const sun = new THREE.DirectionalLight("#fff4e0", 3.2);
  sun.position.copy(SUN_DIR);
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#5a8cff", 1.1);
  rim.position.copy(SUN_DIR.clone().negate().add(new THREE.Vector3(0.3, -0.2, 0)));
  scene.add(rim);

  // The gun in your hands: its own scene, drawn over the world with the depth
  // cleared. Its light follows the sun into the eye's frame.
  const vmScene = new THREE.Scene();
  const vmCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 200);
  vmScene.add(new THREE.HemisphereLight("#8a9ab9", "#2a2420", 1.4));
  const vmSun = new THREE.DirectionalLight("#fff4e0", 2.2);
  vmScene.add(vmSun);
  // A fill from over the shoulder, so the gun reads with the sun behind you.
  const vmFill = new THREE.DirectionalLight("#cfdcff", 2.4);
  vmFill.position.set(-0.4, 0.8, 1);
  vmScene.add(vmFill);
  let gun = null;
  let kick = 0;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const vmPass = new RenderPass(vmScene, vmCamera);
  vmPass.clear = false;
  vmPass.clearDepth = true;
  composer.addPass(vmPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(960, 540), 0.45, 0.5, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const sky = buildSky();
  scene.add(sky);
  const dust = buildDust();
  scene.add(dust.lines);
  const actors = new THREE.Group();
  scene.add(actors);
  const rocks = new Models(actors, makeAsteroid);
  const drones = new Models(actors, makeDummy);
  const figures = new Models(actors, (s) => makeFigure(s, s.kind === "soldier" ? "squad" : "hostile"));
  const foes = new Models(actors, makeEnemyModel);
  const shots = {};
  const shotPool = (shape) => shots[shape] || (shots[shape] = new Pool(actors, () => makeShot(shape)));
  const sprite = () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    s.renderOrder = 10;
    return s;
  };
  const halos = new Pool(actors, sprite);
  const halo = (p, size, color, opacity = 1) => {
    const s = halos.next();
    s.position.set(p[0], p[1], p[2]);
    s.scale.set(size, size, 1);
    s.material.color.set(color);
    s.material.opacity = opacity;
  };
  const shells = new Pool(actors, () => mesh(SPHERE, new THREE.MeshBasicMaterial({ color: "#ff9b4a", transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })));
  const zaps = new Pool(actors, () => new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: new THREE.Color("#8fd0ff").multiplyScalar(2.2), toneMapped: false, transparent: true })));
  let particles = [];
  const burst = (ev, color, n, speed, life, size) => {
    for (let i = 0; i < n; i++) {
      _v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      particles.push({ kind: "spark", p: [ev.x, ev.y, ev.z], v: [_v.x, _v.y, _v.z], t: 0, life: life * (0.6 + Math.random() * 0.6), size, color });
    }
  };

  // One-shot happenings → particles. Read before the page drains them.
  function events(world) {
    for (const ev of world.events) {
      switch (ev.type) {
        case "spark": burst(ev, ev.color, 6, 160, 0.25, 6); break;
        case "hit": burst(ev, ev.color, 8, 220, 0.3, 7); particles.push({ kind: "flash", p: [ev.x, ev.y, ev.z], t: 0, life: 0.1, size: 40, color: ev.color }); break;
        case "explode":
          particles.push({ kind: "shell", p: [ev.x, ev.y, ev.z], t: 0, life: 0.4, size: ev.r });
          particles.push({ kind: "flash", p: [ev.x, ev.y, ev.z], t: 0, life: 0.3, size: ev.r * 2.6, color: "#ffb45a" });
          burst(ev, "#ffcf6a", 26, ev.r * 2.2, 0.6, 10);
          break;
        case "chain": particles.push({ kind: "zap", from: ev.from, to: ev.to, t: 0, life: 0.14 }); break;
        case "muzzle": if (!ev.own) particles.push({ kind: "flash", p: [ev.x, ev.y, ev.z], t: 0, life: 0.06, size: 34, color: ev.color }); break;
        case "death": {
          burst(ev, ev.color || "#ff8a5a", 22, 260, 0.7, 9);
          particles.push({ kind: "flash", p: [ev.x, ev.y, ev.z], t: 0, life: 0.25, size: (ev.r || 16) * 5, color: ev.color || "#ff8a5a" });
          break;
        }
        case "crash": burst(ev, "#c8b8a0", 14, 180, 0.5, 8); break;
      }
    }
  }

  function drawParticles(dt) {
    shells.begin();
    zaps.begin();
    const keep = [];
    for (const q of particles) {
      q.t += dt;
      if (q.t >= q.life) continue;
      keep.push(q);
      const k = 1 - q.t / q.life;
      if (q.kind === "spark") {
        q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt;
        halo(q.p, q.size * (0.5 + k * 0.5), q.color, k);
      } else if (q.kind === "flash") {
        halo(q.p, q.size * (0.6 + 0.4 * k), q.color, k);
      } else if (q.kind === "shell") {
        const m = shells.next();
        m.position.set(q.p[0], q.p[1], q.p[2]);
        m.scale.setScalar(q.size * (0.25 + 0.75 * (1 - k * k)));
        m.material.opacity = 0.45 * k;
      } else if (q.kind === "zap") {
        const l = zaps.next();
        const pos = l.geometry.attributes.position;
        for (let i = 0; i < 4; i++) {
          const f = i / 3;
          const j = i === 0 || i === 3 ? 0 : 14;
          pos.setXYZ(i, q.from[0] + (q.to[0] - q.from[0]) * f + (Math.random() - 0.5) * j, q.from[1] + (q.to[1] - q.from[1]) * f + (Math.random() - 0.5) * j, q.from[2] + (q.to[2] - q.from[2]) * f + (Math.random() - 0.5) * j);
        }
        pos.needsUpdate = true;
        l.material.opacity = k;
      }
    }
    particles = keep.length > 1500 ? keep.slice(-1500) : keep;
    shells.end();
    zaps.end();
  }

  let current = null;
  let bounds = null;
  let ruins = null;
  let extract = null;
  const artifact = makeArtifact();
  scene.add(artifact.root);
  let w = 0, h = 0;

  function draw(world, vw, vh, fov, dt = 1 / 60) {
    if (vw !== w || vh !== h) {
      w = vw; h = vh;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(vw, vh, false);
      composer.setSize(vw, vh);
      camera.aspect = vw / vh;
      vmCamera.aspect = vw / vh;
      vmCamera.updateProjectionMatrix();
    }
    if (current !== world) {
      current = world;
      for (const o of [bounds, ruins, extract && extract.root]) if (o) { scene.remove(o); disposeTree(o); }
      bounds = buildBounds(world.size);
      scene.add(bounds);
      ruins = buildRuins(world);
      scene.add(ruins);
      extract = world.extract ? makeExtract(world.extract) : null;
      if (extract) scene.add(extract.root);
      particles = [];
    }
    const t = world.t;
    if (extract) extract.rings.forEach((r, i) => { r.rotation.y += dt * 0.3 * (i + 1); });
    const art = world.artifact;
    artifact.root.visible = !!art && !(art.carrier && art.carrier === controlled(world));
    if (art) {
      artifact.root.position.set(art.x, art.y, art.z);
      artifact.core.rotation.set(t * 1.3, t * 0.9, 0);
      artifact.cage.rotation.set(-t * 0.4, t * 0.7, 0);
      if (artifact.root.visible) halo([art.x, art.y, art.z], 90 + Math.sin(t * 4) * 12, "#ff7af0", 0.8);
    }
    halos.begin();
    const eye = eyeOf(world, fov, vw / vh);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.position.set(eye.pos[0], eye.pos[1], eye.pos[2]);
    setQ(camera, eye.q);
    sky.position.copy(camera.position);
    poseDust(dust, eye.pos, [eye.body.vx, eye.body.vy, eye.body.vz]);

    for (const a of world.asteroids) {
      const v = rocks.get(a);
      v.root.position.set(a.x, a.y, a.z);
      setQ(v.root, a.q);
    }
    rocks.sweep();

    const body0 = controlled(world);
    for (const e of world.enemies) {
      if (!e.alive) continue;
      if (e.kind === "dummy") {
        const v = drones.get(e);
        v.root.position.set(e.x, e.y, e.z);
        v.ring.rotation.z += dt * 0.8;
        flash(v.mats, e.flash > 0);
      } else if (e.type === "trooper") poseFigure(figures.get(e), e, t);
      else {
        poseEnemyModel(foes.get(e), e, t);
        if (e.tele > 0) halo([e.x, e.y, e.z], e.r * 3.2, "#ff5a4a", 0.6);
      }
    }
    // The squad, but not the soldier whose eyes these are.
    for (const s of world.soldiers) if (s.alive && s !== body0) poseFigure(figures.get(s), s, t);
    drones.sweep();
    figures.sweep();
    foes.sweep();

    // Shots: along their velocity, a halo each. Your own start at the gun's
    // muzzle and slide onto their true line over their first 0.12s, so they
    // leave the gun rather than the middle of the screen.
    for (const k in shots) shots[k].begin();
    const muzzleW = gun ? camera.localToWorld(new THREE.Vector3(5.5 + gun.tip * 0.45 * 0.07, -5, gun.tip * 0.45 - 15)) : null;
    const body = controlled(world);
    for (const p of world.projectiles) {
      const g = shotPool(p.shape).next();
      let x = p.x, y = p.y, z = p.z;
      if (p.own && muzzleW && p.owner === body && p.age < 0.12) {
        const f = 1 - p.age / 0.12;
        const sp = p.age * Math.hypot(p.vx, p.vy, p.vz);
        // Where the round spawned, and the muzzle, eased out together.
        const sx = p.x - (p.vx / Math.hypot(p.vx, p.vy, p.vz)) * sp, sy = p.y - (p.vy / Math.hypot(p.vx, p.vy, p.vz)) * sp, sz = p.z - (p.vz / Math.hypot(p.vx, p.vy, p.vz)) * sp;
        x += (muzzleW.x - sx) * f; y += (muzzleW.y - sy) * f; z += (muzzleW.z - sz) * f;
      }
      g.position.set(x, y, z);
      aimX(g, p.vx, p.vy, p.vz);
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      const big = 1.6;
      if (p.shape === "bullet" || p.shape === "bolt") g.scale.set(Math.max(p.w * big * 2, sp * 0.025), p.h * big, p.h * big);
      else if (p.shape === "wave") g.scale.setScalar(p.w * big);
      else g.scale.set(p.w * big, p.h * big, p.h * big);
      g.userData.mat.color.set(p.color).multiplyScalar(2);
      halo([x, y, z], Math.max(p.w, p.h) * 4, p.color, 0.6);
    }
    for (const k in shots) shots[k].end();
    drawParticles(dt);
    halos.end();

    // The gun in your hands, rebuilt when you swap to another soldier.
    if (body) {
      const key = body.weapon.id + body.color;
      if (!gun || gun.key !== key) {
        if (gun) { vmScene.remove(gun.root); disposeTree(gun.root); }
        gun = makeViewGun(body);
        vmScene.add(gun.root);
      }
      if (body.muzzle > 0) kick = 1;
      kick = Math.max(0, kick - dt * 9);
      const rl = body.reloading > 0 ? Math.sin(Math.min(1, body.reloading / (body.weapon.reloadTime || 1.5)) * Math.PI) : 0;
      gun.root.position.set(5.5, -5.5 - rl * 3, -15 + kick * 1.5);
      gun.root.rotation.set(kick * 0.08 - rl * 0.7, 0.07, rl * 0.4);
      gun.muzzle.visible = body.muzzle > 0;
      gun.muzzle.material.rotation = Math.random() * 6.28;
      gun.root.visible = true;
    } else if (gun) gun.root.visible = false;
    vmSun.position.copy(SUN_DIR).applyQuaternion(camera.quaternion.clone().invert());

    composer.render();
  }

  return { draw, events };
}
