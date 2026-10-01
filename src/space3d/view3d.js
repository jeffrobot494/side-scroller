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

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
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

  let current = null;
  let bounds = null;
  let w = 0, h = 0;

  function draw(world, vw, vh, fov) {
    if (vw !== w || vh !== h) {
      w = vw; h = vh;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(vw, vh, false);
      composer.setSize(vw, vh);
      camera.aspect = vw / vh;
    }
    if (current !== world) {
      current = world;
      if (bounds) { scene.remove(bounds); disposeTree(bounds); }
      bounds = buildBounds(world.size);
      scene.add(bounds);
    }
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
    composer.render();
  }

  return { draw };
}
