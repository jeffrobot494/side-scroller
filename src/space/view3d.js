// ---------------------------------------------------------------------------
// SPACE PROTOTYPE — the 3D view (tech/space-prototype.md, "3D view").
//
// The same world drawn in Three.js on a canvas UNDER view.js's, which becomes
// a transparent overlay of tells, bars and HUD. The only module here that
// imports `three` (from the CDN in space.html's import map, the version the
// game pins); main.js loads it lazily and stays on the flat view if it fails.
//
// Reads the world, writes nothing back. Cosmetic randomness is Math.random.
//
// THE INVARIANT (as src/mission/camera.js solveCamera3D): the camera looks
// straight down -z and its z=0 slice is exactly cameraFor()'s rectangle,
// turned by the view's roll about its centre, so the overlay, mouse aim and
// sound need no 3D knowledge beyond toScreen/toWorld in view.js. One unit = one world
// px; the sim is y-down and Three is y-up, so every placement negates y and
// every angle.
//
// Soldiers are SIDE-VIEW figures — the game's soldier (src/mission/view3d/
// soldier.js), rects given depth — turned in the play plane to their facing,
// with the jetpack on the back pushing them the way they face.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CFG, controlled, ENEMY_TYPES } from "./sim.js";
import { cameraFor, figurePose } from "./view.js";

const FOV = 30; // degrees, as the game's VIEW3D_FOV
const FIGURE_W = 28; // the soldier figure, ≈ the game's 30×46 in an r=18 circle
const FIGURE_H = CFG.bodyLength;

// ---- shared geometry --------------------------------------------------------------
const BOX = new THREE.BoxGeometry(1, 1, 1);
const ROUND = new RoundedBoxGeometry(1, 1, 1, 2, 0.18);
const SPHERE = new THREE.SphereGeometry(1, 16, 12);
const CONE = new THREE.ConeGeometry(1, 1, 12); // apex +y
CONE.rotateZ(-Math.PI / 2); // apex +x
const OCTA = new THREE.OctahedronGeometry(1, 0);
const RING = new THREE.RingGeometry(0.92, 1, 64);
const DISC = new THREE.CircleGeometry(1, 48);
const SHARED = new Set([BOX, ROUND, SPHERE, CONE, OCTA, RING, DISC]);

let _glow = null;
function glowTexture() {
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
    if (m) for (const mm of Array.isArray(m) ? m : [m]) mm.dispose();
  });
}

const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...opts });
// Unlit and over 1 so the bloom pass picks it up.
const hot = (color, k = 1.8) => {
  const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  m.color.multiplyScalar(k);
  return m;
};
const shade = (css, d) => new THREE.Color(css).offsetHSL(0, 0, d / 100);
const mesh = (geo, mat, parent) => {
  const m = new THREE.Mesh(geo, mat);
  if (parent) parent.add(m);
  return m;
};

// Entity → model, kept across frames; whatever a frame did not ask for is
// removed and disposed (a dead enemy, a restarted world).
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
  clear() {
    this.seen.clear();
    this.sweep();
  }
}

// Per-frame pool of throwaway objects (shots, sparks): nothing is tied to an
// entity, the i-th request gets the i-th object.
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

// ---- soldiers ------------------------------------------------------------------------
// [part, x0, y0, x1, y1, zCentre, depth]: fractions of the figure box, facing
// right, y down from its top — the game's standing layout (soldier.js).
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
const LEGS = ["legFar", "legNear", "kneePad"];
const LEG_KICK = 0.18;
const TURN_TAU = 0.05; // s: the standing figure's eased turn (M4)
const TONE = { legFar: -30, legNear: -22, kneePad: 4, pack: -34, torso: 0, stripe: 20, pad: 8, helmet: -22 };

function place(m, r) {
  const [, x0, y0, x1, y1, z, d] = r;
  m.scale.set((x1 - x0) * FIGURE_W, (y1 - y0) * FIGURE_H, d);
  m.position.set(((x0 + x1) / 2 - 0.5) * FIGURE_W, (0.5 - (y0 + y1) / 2) * FIGURE_H, z);
}

function makeSoldier(s) {
  const root = new THREE.Group(); // at the soldier, turned to its facing
  const body = new THREE.Group(); // mirrored when the sim says dir -1
  root.add(body);
  const mats = [];
  const parts = {};
  for (const r of LAYOUT) {
    const mat = std(shade(s.color, TONE[r[0]]));
    mats.push(mat);
    const geo = r[0] === "torso" || r[0] === "helmet" || r[0] === "pack" ? ROUND : BOX;
    parts[r[0]] = mesh(geo, mat, body);
    place(parts[r[0]], r);
  }
  // Legs trail a little in zero g: a slight kick back at the hip (poseSoldier
  // straightens them while the boots are on).
  const legs = {};
  for (const k of LEGS) {
    parts[k].rotation.z = LEG_KICK;
    legs[k] = parts[k];
  }
  // Boot soles, lit while the boots are on (M4).
  const soles = {};
  for (const k of ["legFar", "legNear"]) {
    const r = LAYOUT.find((l) => l[0] === k);
    const sole = mesh(BOX, hot("#78ffe6", 1.6), body);
    sole.scale.set((r[3] - r[1]) * FIGURE_W + 1, 2.5, r[6] + 1);
    sole.position.set(((r[1] + r[3]) / 2 - 0.5) * FIGURE_W, -FIGURE_H / 2 + 1, r[5]);
    sole.visible = false;
    soles[k] = sole;
  }
  const visor = mesh(BOX, std("#7ad7ff", { emissive: "#3aa8e0", emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.6 }), body);
  mats.push(visor.material);
  place(visor, ["visor", 0.48, 0.12, 0.8, 0.2, 4, 9]);
  // Jet nozzle under the pack, and its flame pointing out behind.
  const nozzle = mesh(BOX, std("#2a2f3a", { metalness: 0.7 }), body);
  nozzle.scale.set(5, 8, 8);
  nozzle.position.set(-0.64 * FIGURE_W, -0.05 * FIGURE_H, -2);
  const flame = mesh(CONE, hot("#ffab40", 2.2), body);
  flame.rotation.z = Math.PI; // apex out the back
  const flameGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#ff9a3a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  body.add(flameGlow);

  // The gun hangs off the shoulder and turns to the aim; it is a child of root
  // (turned, never mirrored), with its own flip so the grip stays under.
  const gun = new THREE.Group();
  root.add(gun);
  const gunMat = std("#161c28", { roughness: 0.4, metalness: 0.7 });
  const barrel = mesh(BOX, gunMat, gun);
  barrel.scale.set(18, 4, 4);
  barrel.position.set(9, 0, 0);
  const grip = mesh(BOX, gunMat, gun);
  grip.scale.set(5, 7, 4);
  grip.position.set(4, -4, 0);
  const sight = mesh(BOX, hot("#7ad7ff", 1.2), gun);
  sight.scale.set(4, 2, 3);
  sight.position.set(8, 3, 0);
  return { root, body, gun, flame, flameGlow, mats, legs, soles, rot: null };
}

function poseSoldier(v, s, t, dt, isCtrl) {
  const p = figurePose(s);
  // Standing, up can change at once (an inside corner, a landing); the figure
  // turns there over a moment rather than snapping. Everywhere else it is the
  // sim's rotation exactly.
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
  v.body.position.y = booted ? FIGURE_H / 2 - s.r : 0;
  // A slow drift of the whole figure so nobody floats like a statue; on the
  // boots it stands still.
  v.body.rotation.z = booted ? 0 : Math.sin(t * 1.3 + s.x * 0.01) * 0.04;
  // Legs: kicked back floating, straight on the boots, striding while walking
  // (the game's stride, src/mission/view3d/soldier.js).
  const stride = s.boots === "ground" && Math.abs(s.gv) > 20 ? Math.sin(t * 16) * FIGURE_W * 0.12 : 0;
  for (const k of LEGS) {
    const leg = v.legs[k];
    leg.rotation.z = booted ? 0 : LEG_KICK;
    if (leg.userData.x0 == null) leg.userData.x0 = leg.position.x;
    leg.position.x = leg.userData.x0 + (k === "legFar" ? -stride : stride);
  }
  for (const k in v.soles) {
    const sole = v.soles[k];
    sole.visible = booted;
    if (sole.userData.x0 == null) sole.userData.x0 = sole.position.x;
    sole.position.x = sole.userData.x0 + (k === "legFar" ? -stride : stride);
  }

  const on = s.thrusting;
  v.flame.visible = on;
  v.flameGlow.visible = on;
  if (on) {
    const len = 14 + Math.random() * 10;
    v.flame.scale.set(len, 4.5, 4.5);
    v.flame.position.set(-0.64 * FIGURE_W - 2 - len / 2, -0.05 * FIGURE_H, -2);
    v.flameGlow.position.set(-0.64 * FIGURE_W - 8, -0.05 * FIGURE_H, 0);
    v.flameGlow.scale.set(34, 34, 1);
  }

  // Gun: at the shoulder (mirrored with the body), pointing at the aim. A
  // companion with no one to shoot keeps its last aim in the sim; drawn, that
  // is a gun held over its head, so an idle one rests along its facing.
  v.gun.position.set(p.dir * 2, 0.1 * FIGURE_H, 10);
  const idle = !isCtrl && !(s.foe && s.foe.alive);
  const g = -(idle ? s.angle : s.aim) - rot;
  v.gun.rotation.z = g;
  v.gun.scale.y = Math.cos(g) < 0 ? -1 : 1;

  flash(v.mats, s.flash > 0);
}

function flash(mats, on) {
  for (const m of mats) {
    if (!m.emissive) continue;
    if (m.userData.e0 == null) m.userData.e0 = { c: m.emissive.clone(), k: m.emissiveIntensity };
    if (on) {
      m.emissive.set("#ffffff");
      m.emissiveIntensity = 0.3; // any brighter and the bloom turns it into a white blot
    } else {
      m.emissive.copy(m.userData.e0.c);
      m.emissiveIntensity = m.userData.e0.k;
    }
  }
}

// ---- enemies ----------------------------------------------------------------------------
function makeEnemy(e) {
  const root = new THREE.Group();
  const spin = new THREE.Group(); // turned to heading / aim
  spin.rotation.order = "ZYX"; // a roll (x) is about the body's own axis
  root.add(spin);
  const mats = [];
  const add = (geo, mat) => {
    if (mat.emissive) mats.push(mat);
    return mesh(geo, mat, spin);
  };
  const T = ENEMY_TYPES[e.type];
  const col = T ? T.color : "#7a3b3b";
  const r = e.r;
  const extra = {};
  switch (e.kind === "enemy" ? e.type : "dummy") {
    case "charger": {
      const hull = add(OCTA, std(col, { flatShading: true, metalness: 0.4 }));
      hull.scale.set(r * 1.5, r * 0.8, r * 0.8);
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
      barrel.position.set(r / 2 + 6, 0, r * 0.3);
      const eye = add(SPHERE, hot("#8affc1", 2));
      eye.scale.setScalar(5);
      eye.position.z = r * 0.55;
      break;
    }
    case "swarmer": {
      const hull = add(CONE, std(col, { flatShading: true, metalness: 0.4 }));
      hull.scale.set(r * 2.2, r * 0.9, r * 0.5);
      const fin = add(BOX, std(shade(col, -15)));
      fin.scale.set(r * 0.8, r * 2, 2);
      fin.position.x = -r * 0.5;
      break;
    }
    case "warden": {
      // Elite: a long armoured hull, two gun pods, a gold band and a lamp eye.
      const hull = add(OCTA, std(col, { flatShading: true, metalness: 0.7, roughness: 0.3 }));
      hull.scale.set(r * 1.6, r * 0.75, r * 0.6);
      const band = add(new THREE.TorusGeometry(r * 0.78, 2.5, 6, 24), hot("#ffcf6a", 1.3));
      band.rotation.y = Math.PI / 2;
      for (const side of [-1, 1]) {
        const pod = add(BOX, std("#3a3020", { metalness: 0.7 }));
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
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = add(CONE, std(col, { metalness: 0.6 }));
        spike.scale.set(7, 2, 2);
        spike.position.set(Math.cos(a) * (r * 0.8 + 2), Math.sin(a) * (r * 0.8 + 2), 0);
        spike.rotation.z = a;
      }
      extra.light = add(SPHERE, new THREE.MeshBasicMaterial({ color: "#6a7a4a", toneMapped: false }));
      extra.light.scale.setScalar(3.5);
      extra.light.position.z = r * 0.75;
      break;
    }
    default: { // S2 target dummy: a ringed drone
      add(SPHERE, std("#7a3b3b")).scale.setScalar(r);
      const ring = add(new THREE.TorusGeometry(r * 1.2, 2, 8, 32), hot("#ff8a8a", 1.2));
      ring.rotation.x = 1.2;
    }
  }
  return { root, spin, mats, extra };
}

function poseEnemy(v, e, t) {
  v.root.position.set(e.x, -e.y, 0);
  const vel = Math.atan2(e.vy, e.vx);
  const face = e.target && e.alert ? Math.atan2(e.target.y - e.y, e.target.x - e.x) : vel;
  switch (e.type) {
    case "charger": {
      v.spin.rotation.set(t * 3, 0, 0); // barrel roll
      v.spin.rotation.z = -vel;
      const len = e.r * (0.8 + Math.random() * 0.6);
      v.extra.jet.scale.set(len, e.r * 0.3, e.r * 0.3);
      v.extra.jet.position.x = -e.r * 1.4 - len / 2;
      break;
    }
    case "gunner": v.spin.rotation.z = -face; break;
    case "warden": {
      v.spin.rotation.z = -face;
      const len = e.r * (0.5 + Math.min(1, Math.hypot(e.vx, e.vy) / 200) * 0.6 + Math.random() * 0.15);
      v.extra.jet.scale.set(len, e.r * 0.25, e.r * 0.25);
      v.extra.jet.position.x = -e.r * 1.6 - len / 2;
      break;
    }
    case "swarmer":
      v.spin.rotation.z = -vel;
      v.spin.rotation.x = Math.sin(t * 9 + e.heading) * 0.5; // a wobble
      break;
    case "minelayer": {
      const pulse = 1 + Math.sin(t * 3 + e.heading) * 0.06;
      v.extra.bladder.scale.set(e.r * 1.2 * pulse, e.r * 0.8 / pulse, e.r * 0.8);
      break;
    }
    case "mine": {
      const T = ENEMY_TYPES.mine;
      const armed = e.age >= T.arm, fuse = e.fuse > 0;
      const blink = fuse ? Math.sin(t * 60) > 0 : armed ? Math.sin(t * 6) > 0.6 : false;
      v.spin.rotation.z = -t * 1.5;
      v.extra.light.material.color.set(fuse ? "#ff5040" : blink ? "#ffec80" : "#6a7a4a").multiplyScalar(fuse || blink ? 2.2 : 1);
      break;
    }
    default: v.spin.rotation.z = t * 0.5;
  }
  flash(v.mats, e.flash > 0);
}

// ---- asteroids -------------------------------------------------------------------------
// An icosphere pushed out to the 2D outline (`verts`, around z) and roughened
// by a smooth function of direction, so the duplicated vertices of a flat-
// shaded mesh move together and it stays closed.
function makeAsteroid(a) {
  const geo = new THREE.IcosahedronGeometry(1, a.r > 200 ? 3 : 2);
  const pos = geo.attributes.position;
  const n = a.verts.length;
  const waves = [];
  for (let i = 0; i < 5; i++) {
    waves.push([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1, 2 + Math.random() * 3, Math.random() * 6.28]);
  }
  // Shallow, so perspective barely widens it: at most 130px toward the camera,
  // which a big rock's proportion alone would carry far past its outline.
  const depth = Math.min(0.55 + Math.random() * 0.2, 130 / a.r);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const az = Math.atan2(v.y, v.x);
    const f = (((az / (Math.PI * 2)) % 1) + 1) % 1 * n;
    const i0 = Math.floor(f) % n, i1 = (i0 + 1) % n;
    const outline = a.verts[i0] + (a.verts[i1] - a.verts[i0]) * (f - Math.floor(f));
    let rough = 0;
    for (const [x, y, z, k, ph] of waves) rough += Math.sin((v.x * x + v.y * y + v.z * z) * k + ph);
    const rr = a.r * outline * (1 + rough * 0.03);
    pos.setXYZ(i, v.x * rr, v.y * rr, v.z * rr * depth);
  }
  geo.computeVertexNormals();
  const tint = 0.24 + Math.random() * 0.1;
  const m = mesh(geo, std(new THREE.Color().setHSL(0.07 + Math.random() * 0.04, 0.12, tint), { roughness: 0.95, metalness: 0.05, flatShading: true }));
  const root = new THREE.Group();
  root.add(m);
  m.rotation.x = (Math.random() - 0.5) * 0.6; // a fixed tilt; spin stays around z
  return { root, rock: m };
}

// ---- ruins (static per world) ----------------------------------------------------------
const DECK_Z = -34;
const WALL_DEPTH = 56;

function deckTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#3b4452";
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
  const deckMat = std("#ffffff", { map: deckTex, roughness: 0.8, metalness: 0.4 });
  const wallMat = std("#8a96a8", { roughness: 0.5, metalness: 0.6 });
  const trimMat = std("#c9d3e0", { roughness: 0.35, metalness: 0.7 });
  const lampMat = hot("#ffcf8a", 1.6);
  for (const r of world.ruins) {
    // Deck: the hull outline, behind the play plane, so the inside reads as inside.
    const shape = new THREE.Shape(r.hull.map(([x, y]) => new THREE.Vector2(x, -y)));
    const geo = new THREE.ShapeGeometry(shape);
    // UVs in world px / 64, along the hull's axis so plating runs with it.
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const c = Math.cos(r.angle), sn = Math.sin(r.angle);
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - r.x, dy = -pos.getY(i) - r.y;
      uv.setXY(i, (dx * c + dy * sn) / 128, (-dx * sn + dy * c) / 128);
    }
    const deck = mesh(geo, deckMat, group);
    deck.position.z = DECK_Z;
    // Walls: each plate as it collides, extruded toward the camera.
    for (const w of r.walls) {
      const len = Math.hypot(w.x1 - w.x0, w.y1 - w.y0);
      const ang = -Math.atan2(w.y1 - w.y0, w.x1 - w.x0);
      const plate = mesh(ROUND, wallMat, group);
      plate.scale.set(len + w.t * 2, w.t * 2, WALL_DEPTH);
      plate.position.set((w.x0 + w.x1) / 2, -(w.y0 + w.y1) / 2, DECK_Z + WALL_DEPTH / 2);
      plate.rotation.z = ang;
      const trim = mesh(BOX, trimMat, group);
      trim.scale.set(len, w.t * 2 + 1, 3);
      trim.position.set(plate.position.x, plate.position.y, DECK_Z + WALL_DEPTH + 1);
      trim.rotation.z = ang;
      // A running light at every plate's end, so a breach reads as a gap.
      for (const [x, y] of [[w.x0, w.y0], [w.x1, w.y1]]) {
        const lamp = mesh(SPHERE, lampMat, group);
        lamp.scale.setScalar(3);
        lamp.position.set(x, -y, DECK_Z + WALL_DEPTH + 3);
      }
    }
  }
  return group;
}

// ---- the backdrop: stars far behind the plane, so they parallax on their own -----------
function buildSky(size) {
  const group = new THREE.Group();
  const N = 12000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const z = -2500 - Math.random() * 9000;
    const spread = size * 0.5 + (-z) * 1.4; // wide enough for the farthest zoom
    pos[i * 3] = size / 2 + (Math.random() * 2 - 1) * spread;
    pos[i * 3 + 1] = -size / 2 + (Math.random() * 2 - 1) * spread;
    pos[i * 3 + 2] = z;
    c.setHSL(0.55 + Math.random() * 0.15, 0.4, 0.55 + Math.random() * 0.4);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 2.2, sizeAttenuation: false, vertexColors: true, map: glowTexture(), transparent: true, depthWrite: false,
  }));
  group.add(stars);
  // A few faint nebulae.
  const tints = ["#3a2a6a", "#1c4a6a", "#5a2a4a", "#244a3a"];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: tints[i % tints.length], transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const z = -9000 - Math.random() * 3000;
    s.position.set(size / 2 + (Math.random() * 2 - 1) * size * 1.6, -size / 2 + (Math.random() * 2 - 1) * size * 1.6, z);
    s.scale.setScalar(6000 + Math.random() * 8000);
    group.add(s);
  }
  return group;
}

// The map edge, the extraction zone: static per world.
function buildMarks(world) {
  const group = new THREE.Group();
  const S = world.size;
  const edge = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(S, 0, 0), new THREE.Vector3(S, -S, 0), new THREE.Vector3(0, -S, 0),
  ]);
  const line = new THREE.LineLoop(edge, new THREE.LineDashedMaterial({ color: "#ff5a5a", dashSize: 18, gapSize: 12, transparent: true, opacity: 0.5 }));
  line.computeLineDistances();
  group.add(line);
  let extract = null;
  if (world.extract) {
    const ex = world.extract;
    extract = new THREE.Group();
    extract.position.set(ex.x, -ex.y, -6);
    const disc = mesh(DISC, new THREE.MeshBasicMaterial({ color: "#8affc1", transparent: true, opacity: 0.06, depthWrite: false }), extract);
    disc.scale.setScalar(ex.r);
    const ring = mesh(RING, new THREE.MeshBasicMaterial({ color: new THREE.Color("#8affc1").multiplyScalar(1.6), toneMapped: false, transparent: true }), extract);
    ring.scale.setScalar(ex.r);
    for (let i = 0; i < 8; i++) {
      const beacon = mesh(SPHERE, hot("#8affc1", 2), extract);
      const a = (i / 8) * Math.PI * 2;
      beacon.scale.setScalar(4);
      beacon.position.set(Math.cos(a) * ex.r, Math.sin(a) * ex.r, 0);
    }
    group.add(extract);
  }
  return { group, extract };
}

// ---- the view ----------------------------------------------------------------------------
export function createView3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#03050a");
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 1, 20000);

  // A hard white sun from the upper left and front, a cold blue rim from
  // behind, and very little fill: space has no sky to light the shadow side.
  scene.add(new THREE.HemisphereLight("#6a7a99", "#1a1410", 0.55));
  const sun = new THREE.DirectionalLight("#fff4e0", 2.5);
  sun.position.set(-0.8, 0.9, 1);
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#5a8cff", 1.4);
  rim.position.set(0.7, -0.4, -1);
  scene.add(rim);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(960, 540), 0.375, 0.5, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const actors = new THREE.Group();
  scene.add(actors);
  const soldiers = new Models(actors, makeSoldier);
  const enemies = new Models(actors, makeEnemy);
  const rocks = new Models(actors, makeAsteroid);

  // Shots: one pool per shape, each mesh with its own material for its colour.
  const shots = {};
  const shotPool = (shape) => shots[shape] || (shots[shape] = new Pool(actors, () => {
    const g = new THREE.Group();
    const mat = hot("#ffffff");
    const core = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
    switch (shape) {
      case "orb": mesh(SPHERE, mat, g); mesh(SPHERE, core, g).scale.setScalar(0.45); break;
      case "pellet": mesh(SPHERE, mat, g); break;
      case "bolt": mesh(OCTA, mat, g).scale.set(1, 0.25, 0.25); break;
      case "missile": {
        mesh(BOX, std("#c8ccd4", { metalness: 0.6 }), g).scale.set(0.8, 1, 1);
        const nose = mesh(CONE, mat, g);
        nose.scale.set(0.3, 0.5, 0.5);
        nose.position.x = 0.55;
        const fl = mesh(CONE, hot("#ffb45a", 2.2), g);
        fl.rotation.z = Math.PI;
        fl.position.x = -0.8;
        fl.scale.set(0.8, 0.45, 0.45);
        break;
      }
      case "wave": mesh(new THREE.TorusGeometry(1, 0.28, 6, 24, Math.PI * 1.1), mat, g).rotation.z = -Math.PI * 0.55; break;
      default: mesh(BOX, mat, g); mesh(BOX, core, g).scale.set(0.9, 0.4, 0.4);
    }
    g.userData.mat = mat;
    return g;
  }));

  // Glow sprites for muzzle flashes, sparks, fire, and shot halos.
  const halos = new Pool(actors, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.renderOrder = 10;
    return s;
  });
  const halo = (x, y, size, color, opacity = 1, z = 8) => {
    const s = halos.next();
    s.position.set(x, -y, z);
    s.scale.set(size, size, 1);
    s.material.color.set(color);
    s.material.opacity = opacity * 0.5; // halo sprites at half strength, with the bloom
  };
  const rings = new Pool(actors, () => mesh(RING, new THREE.MeshBasicMaterial({ color: "#ff9b4a", transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })));
  const bolts = new Pool(actors, () => {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: new THREE.Color("#8fd0ff").multiplyScalar(2), toneMapped: false, transparent: true }));
    return l;
  });

  let current = null; // the world the static layers were built for
  let statics = null;
  let particles = [];

  function rebuild(world) {
    if (statics) {
      for (const o of [statics.ruins, statics.sky, statics.marks.group]) {
        scene.remove(o);
        disposeTree(o);
      }
    }
    soldiers.clear();
    enemies.clear();
    rocks.clear();
    particles = [];
    const marks = buildMarks(world);
    statics = { ruins: buildRuins(world), sky: buildSky(world.size), marks };
    scene.add(statics.sky, statics.ruins, marks.group);
    current = world;
  }

  function burst(x, y, color, n, speed, life = 0.35, size = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size });
    }
  }

  // The same events view.js drains: read here first (main.js orders it).
  function readEvents(world) {
    for (const ev of world.events) {
      switch (ev.type) {
        case "muzzle": particles.push({ x: ev.x, y: ev.y, vx: 0, vy: 0, life: 0.06, max: 0.06, color: "#fff4c8", size: 30 }); break;
        case "spark": burst(ev.x, ev.y, ev.color || "#ffffff", 4, 90, 0.3, 8); break;
        case "hit": burst(ev.x, ev.y, ev.color || "#ffffff", 7, 150, 0.35, 10); break;
        case "explode":
          particles.push({ ring: true, x: ev.x, y: ev.y, r: ev.r, life: 0.35, max: 0.35 });
          particles.push({ x: ev.x, y: ev.y, vx: 0, vy: 0, life: 0.3, max: 0.3, color: "#ffb45a", size: ev.r * 2.2 });
          burst(ev.x, ev.y, "#ff9b4a", 18, 260, 0.5, 16);
          break;
        case "chain": particles.push({ line: true, x: ev.x0, y: ev.y0, x1: ev.x1, y1: ev.y1, life: 0.15, max: 0.15 }); break;
        case "pickup": burst(ev.x, ev.y, "#78ffe6", 24, 200, 0.6, 14); break;
        case "death": burst(ev.x, ev.y, ev.color || "#ff6a6a", 22, 220, 0.6, 16); break;
        case "land": if (ev.speed > 150) burst(ev.x, ev.y, "#78ffe6", 6, 90, 0.25, 6); break;
      }
    }
  }

  function draw(world, vw, vh, zoom, dt, roll = 0) {
    if (world !== current) rebuild(world);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(vw * dpr), H = Math.round(vh * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(vw, vh, false);
      composer.setPixelRatio(dpr);
      composer.setSize(vw, vh);
    }
    const cam = cameraFor(world, vw, vh, zoom);
    const cx = cam.x + cam.w / 2, cy = cam.y + cam.h / 2;
    const dist = cam.h / 2 / Math.tan((FOV * Math.PI) / 360);
    camera.aspect = vw / vh;
    camera.near = dist * 0.05;
    camera.far = dist + 13000;
    camera.position.set(cx, -cy, dist);
    // Roll (M3): screen-up is the world direction R(roll)·(0, -1), in Three's y-up.
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(cx, -cy, 0);
    camera.updateProjectionMatrix();

    const t = world.t;
    halos.begin();
    rings.begin();
    bolts.begin();
    for (const k in shots) shots[k].begin();

    for (const a of world.asteroids) {
      const v = rocks.get(a);
      v.root.position.set(a.x, -a.y, 0);
      v.root.rotation.z = -a.rot;
    }
    rocks.sweep();

    const lead = controlled(world);
    for (const s of world.soldiers) {
      if (!s.alive) continue;
      poseSoldier(soldiers.get(s), s, t, dt, s === lead);
      if (s.muzzle > 0) halo(s.x + Math.cos(s.aim) * (s.r + 12), s.y + Math.sin(s.aim) * (s.r + 12), 26, "#fff4c8", 1, 14);
      status(s);
    }
    soldiers.sweep();

    for (const e of world.enemies) {
      if (!e.alive) continue;
      poseEnemy(enemies.get(e), e, t);
      status(e);
    }
    enemies.sweep();

    // The artifact: a spinning crystal in its compartment, or small and
    // orbiting whoever carries it.
    const art = world.artifact;
    if (art) {
      if (!statics.artifact) {
        const g = new THREE.Group();
        mesh(OCTA, hot("#78ffe6", 1.5), g).scale.set(1, 1.4, 1);
        statics.artifact = g;
        statics.ruins.add(g);
      }
      const g = statics.artifact;
      let x = art.x, y = art.y, r = art.r;
      if (art.carrier) {
        x += Math.cos(t * 3) * (art.carrier.r + 14);
        y += Math.sin(t * 3) * (art.carrier.r + 14);
        r = 7;
      }
      g.position.set(x, -y, 4);
      g.scale.setScalar(r);
      g.rotation.set(t * 0.7, t * 1.2, 0);
      halo(x, y, r * (art.carrier ? 5 : 7 + Math.sin(t * 4)), "#78ffe6", 0.8, 0);
    }
    if (statics.marks.extract) {
      const ring = statics.marks.extract.children[1];
      ring.material.opacity = 0.55 + Math.sin(t * 3) * 0.25;
      statics.marks.extract.rotation.z = t * 0.2;
    }

    for (const p of world.projectiles) {
      if (p.dead) continue;
      const g = shotPool(p.shape || "bullet").next();
      g.userData.mat.color.set(p.color || "#ffffff").multiplyScalar(1.8);
      g.position.set(p.x, -p.y, 6);
      g.rotation.z = -Math.atan2(p.vy, p.vx);
      const w = p.w || 6, h = p.h || 3;
      switch (p.shape) {
        case "orb": g.scale.setScalar(Math.max(w, h) / 2); break;
        case "pellet": g.scale.setScalar(Math.max(2, Math.max(w, h) / 2)); break;
        case "bolt": g.scale.setScalar(Math.max(w, h, 10) / 2); break;
        case "missile": g.scale.set(Math.max(w, 14), Math.max(3, h), Math.max(3, h)); break;
        case "wave": g.scale.setScalar(Math.max(w, h) / 2 + 2); break;
        default: g.scale.set(w + 6, Math.max(2, h), Math.max(2, h));
      }
      halo(p.x, p.y, Math.max(w, h) * 2.4 + 8, p.color || "#ffffff", 0.55, 6);
    }

    readEvents(world);
    const keep = [];
    for (const p of particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      keep.push(p);
      const k = p.life / p.max;
      if (p.ring) {
        const m = rings.next();
        m.position.set(p.x, -p.y, 10);
        m.scale.setScalar(p.r * (1.1 - k * 0.6));
        m.material.opacity = k;
      } else if (p.line) {
        const l = bolts.next();
        const a = l.geometry.attributes.position;
        a.setXYZ(0, p.x, -p.y, 10);
        a.setXYZ(1, (p.x + p.x1) / 2 + (Math.random() - 0.5) * 24, -(p.y + p.y1) / 2 + (Math.random() - 0.5) * 24, 10);
        a.setXYZ(2, p.x1, -p.y1, 10);
        a.needsUpdate = true;
        l.material.opacity = k;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        halo(p.x, p.y, p.size * (0.5 + k * 0.5), p.color, k, 12);
      }
    }
    particles = keep;

    halos.end();
    rings.end();
    bolts.end();
    for (const k in shots) shots[k].end();
    composer.render();

    function status(a) {
      if (a.burn) halo(a.x + (Math.random() - 0.5) * 8, a.y + (Math.random() - 0.5) * 8, a.r * 3, "#ff7828", 0.7, 12);
      if (a.slow) halo(a.x, a.y, a.r * 3.2, "#8fd0ff", 0.35, 12);
    }
  }

  return { draw };
}
