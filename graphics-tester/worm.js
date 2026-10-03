// ---------------------------------------------------------------------------
// GRAPHICS TESTER — the sand worm (a look, not a game enemy).
//
// Model: models/worm.glb (built by models/worm.py): a head with five hinged
// jaw petals, one plated body segment instanced down the spine, and a tail.
//
// Motion is follow-the-leader. Only the HEAD is steered — along a scripted
// path per animation — and it leaves a trail; every segment sits a fixed
// distance back along that trail, so the body pours through exactly the
// holes the head made. On top, a travelling wave sways the body in depth so
// it reads as a snake rather than a train.
//
// The ground is a clipping plane: anything below it is simply not drawn, so
// the worm really comes out of the ground instead of passing in front of it.
// Breaches throw rock and dust; a hunting worm pushes a moving mound and
// cracks along the surface; the strike erupts under the soldier and throws
// him.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const K = 34;                 // px: body radius at the head end (model radius 1)
const SEGMENTS = 24;
const TAPER = 0.45;           // the last segment is (1 - TAPER) of the first
const SPACING = 0.8;          // segment pitch, × its own length (overlapping plates, closed on bends)
const ROLL = 0.33;            // rad of twist per segment, so the plates stagger
const WAVE = { amp: 14, speed: 3.2, length: 260 }; // depth sway: px, rad/s, px
const MAW = { closed: 0.1, open: 1.85 };            // petal hinge, rad
const HEAD = 1.25;            // the head's size against the first segment: a maw bigger than the neck
const COLOR = "#c29c6a";      // the armour: weathered sand

// The hinge of the top petal in head space (models/worm.py: MOUTH, R).
const HINGE = new THREE.Vector3(0.62, 1.12, 0);

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const u = clamp01((v - a) / (b - a)); return u * u * (3 - 2 * u); };
const easeOut = (u) => 1 - (1 - u) ** 3;
const easeIn = (u) => u * u;
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const bez = (a, b, c, d) => (u, out) => {
  const v = 1 - u;
  return out.set(0, 0, 0)
    .addScaledVector(a, v * v * v).addScaledVector(b, 3 * v * v * u)
    .addScaledVector(c, 3 * v * u * u).addScaledVector(d, u * u * u);
};
const line = (a, b) => (u, out) => out.copy(a).lerp(b, u);

// --- the trail ---------------------------------------------------------------
// Points the head has passed, oldest first. sample(d) walks d px back from the
// head along them; past the oldest it carries straight on.
class Trail {
  constructor() { this.pts = []; this.max = 2000; }
  reset(pts) { this.pts = pts.map((p) => p.clone()); }
  push(p) {
    const last = this.pts[this.pts.length - 1];
    if (last && last.distanceTo(p) < 3) return;
    this.pts.push(p.clone());
    // Trim what no part of the body can reach any more.
    let len = 0;
    for (let i = this.pts.length - 1; i > 0; i--) {
      len += this.pts[i].distanceTo(this.pts[i - 1]);
      if (len > this.max) { this.pts.splice(0, i - 1); break; }
    }
  }
  sample(head, d, out) {
    let cur = head, left = d;
    for (let i = this.pts.length - 1; i >= 0; i--) {
      const p = this.pts[i], len = cur.distanceTo(p);
      if (len >= left && len > 1e-6) return out.copy(cur).lerp(p, left / len);
      left -= len;
      cur = p;
    }
    // Off the oldest point: straight on, in the direction the trail ran.
    const n = this.pts.length;
    const a = n > 1 ? this.pts[1] : head, b = n > 0 ? this.pts[0] : head;
    const dir = _v.subVectors(b, a);
    if (dir.lengthSq() < 1e-6) dir.set(-1, 0, 0);
    return out.copy(cur).addScaledVector(dir.normalize(), left);
  }
}
const _v = new THREE.Vector3();

// --- the animations ----------------------------------------------------------
// Each is a list of path pieces for the head, played in order and looped:
// { name, dur, at(u, out, t), ease?, maw?(u), wobble?(u, out, t), tag? },
// plus `seed`, the trail it
// starts on (underground, out of sight). `S` is the soldier's x, `g` the
// ground's y (both in view space, y up).
//
// `at` is the path the body follows, so it must keep moving forward: a head
// that doubles back scribbles loops into the trail, and every segment then
// spins as it passes through them. Anything that should jiggle in place is a
// `wobble` — an offset on the head that fades down the neck and is never
// recorded in the trail.
function cycle(S, g) {
  const Z = -140; // the swim passes behind the soldier, in depth
  const x0 = S - 750, x1 = S + 400;
  const A = V(x1, g - 10, Z), B = V(S + 480, g - 220, 0);
  const H = V(S + 110, g - 200), U = V(S, g - 80), T = V(S, g + 250), T2 = V(S, g + 275);
  const D = V(S - 300, g + 200), E = V(S - 320, g - 420), F = V(S - 1220, g - 420);
  return {
    seed: Array.from({ length: 56 }, (_, i) => V(x0 - 1100 + i * 20, g - 95, Z)),
    pieces: [
      // Surface: swimming in and out of the ground like a sea serpent,
      // across the frame behind the soldier.
      { name: "swim", dur: 4.0, at: (u, o) => o.set(x0 + (x1 - x0) * u, g - 10 + 85 * Math.sin(-Math.PI / 2 + 5.5 * Math.PI * u), Z) },
      // Burrow: nose down, turning back underground toward the soldier.
      { name: "burrow", dur: 1.0, at: bez(A, V(A.x + 110, A.y - 130, Z), V(B.x + 120, B.y, 0), B) },
      // Hunt: racing at him underground, pushing a mound.
      { name: "hunt", dur: 1.3, at: line(B, H), tag: "hunt" },
      // Warning: turning upward right under him; the ground trembles.
      { name: "warning", dur: 0.75, at: bez(H, V(H.x - 70, H.y), V(U.x, U.y - 70), U), tag: "warn" },
      // Strike: straight up through where he stands, maw opening.
      { name: "strike", dur: 0.42, at: line(U, T), ease: easeOut, maw: (u) => smooth(0.25, 1, u), tag: "strike" },
      // Rearing at the top.
      { name: "rear", dur: 0.55, at: line(T, T2), maw: () => 1,
        wobble: (u, o) => o.set(8 * Math.sin(u * 12), 6 * Math.sin(u * 9), 0).multiplyScalar(Math.sin(Math.PI * u)) },
      // Arching over…
      { name: "arch", dur: 0.8, at: bez(T2, V(T2.x, T2.y + 110), V(D.x, D.y + 130), D), maw: (u) => 1 - smooth(0, 0.8, u) },
      // …and plunging back in, the body pouring after it.
      { name: "plunge", dur: 1.3, at: line(D, E), ease: easeIn },
      { name: "underground", dur: 2.2, at: line(E, F) },
    ],
  };
}

function burrow(S, g) {
  const A = V(S - 520, g - 300), M = V(S - 60, g + 180), Dn = V(S + 250, g - 320), F = V(S + 1250, g - 320);
  return {
    seed: Array.from({ length: 56 }, (_, i) => V(A.x - 0.077 * (1100 - i * 20), A.y - (1100 - i * 20))),
    pieces: [
      { name: "rise", dur: 1.3, at: bez(A, V(A.x + 20, A.y + 260), V(M.x - 160, M.y), M), maw: (u) => 0.25 * smooth(0.6, 1, u) },
      { name: "arch", dur: 1.5, at: bez(M, V(M.x + 160, M.y), V(Dn.x - 20, Dn.y + 300), Dn), ease: (u) => u ** 1.3, maw: (u) => 0.25 * (1 - smooth(0, 0.3, u)) },
      { name: "underground", dur: 2.6, at: line(Dn, F) },
    ],
  };
}

// Circling forever: along the surface left to right in arcs, then back deep
// underground, so the loop never needs a reset. Behind the soldier in depth.
function swim(S, g) {
  const at = (phi, o) => {
    const surf = smooth(-0.15, 0.25, Math.sin(phi));
    return o.set(S - 650 * Math.cos(phi), g - 430 + surf * (420 + 75 * Math.sin(6 * phi)), -70 + 30 * Math.sin(2 * phi));
  };
  const PERIOD = 13;
  return {
    seed: Array.from({ length: 80 }, (_, i) => at(-2 + i * 0.025, V(0, 0))),
    pieces: [{ name: "swim", dur: PERIOD, at: (u, o) => at(u * Math.PI * 2, o) }],
  };
}

// A held pose to orbit round: reared out of the ground, maw wide, breathing.
function maw(S, g) {
  const c = bez(V(S + 200, g - 420), V(S + 200, g + 60), V(S + 190, g + 190), V(S + 90, g + 215, 70));
  return {
    seed: Array.from({ length: 61 }, (_, i) => c(i / 60, V(0, 0))),
    freeze: true,
    pieces: [{ name: "maw open", dur: 20, at: (u, o) => c(1, o),
      wobble: (u, o, t) => o.set(4 * Math.sin(t * 1.3), 5 * Math.sin(t * 1.7), 3 * Math.sin(t)),
      maw: (u, t) => 0.88 + 0.12 * Math.sin(t * 2.2) }],
  };
}

export const WORM_ANIMS = {
  cycle: { label: "Full attack cycle", build: cycle },
  swim: { label: "Surface swim", build: swim },
  burrow: { label: "Burrow", build: burrow },
  maw: { label: "Maw open", build: maw },
};

// --- effects -----------------------------------------------------------------
function dustTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,0.9)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.35)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createEffects(scene, g) {
  const group = new THREE.Group();
  scene.add(group);
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };

  // Rock debris: one instanced mesh, per-instance colour.
  const ROCKS = 260;
  const rockGeo = keep(new THREE.IcosahedronGeometry(1, 0));
  const rockMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.05, flatShading: true }));
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  rocks.frustumCulled = false;
  const rockColors = ["#6b5236", "#8a6d48", "#4a3a28", "#a3845c", "#3a2e22"].map((c) => new THREE.Color(c));
  for (let i = 0; i < ROCKS; i++) rocks.setColorAt(i, rockColors[i % rockColors.length]);
  group.add(rocks);
  const debris = []; // { p, v, s, life, age, spin, axis, q }

  // Dust: sprites with their own materials (opacity per puff).
  const dustTex = keep(dustTexture());
  const puffs = Array.from({ length: 160 }, () => {
    const m = keep(new THREE.SpriteMaterial({ map: dustTex, color: "#b29a76", transparent: true, depthWrite: false, opacity: 0 }));
    const s = new THREE.Sprite(m);
    s.visible = false;
    group.add(s);
    return { s, age: 0, life: 0, v: V(0, 0), grow: 0, base: 0, op: 0 };
  });
  let nextPuff = 0;

  // Cracks: dark slivers lying on the ground.
  const CRACKS = 60;
  const crackGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  const crackMat = keep(new THREE.MeshBasicMaterial({ color: "#1d150e" }));
  const crackMesh = new THREE.InstancedMesh(crackGeo, crackMat, CRACKS);
  crackMesh.frustumCulled = false;
  group.add(crackMesh);
  const cracks = [];

  // The mound a hunting worm pushes along under the surface.
  const moundMat = keep(new THREE.MeshStandardMaterial({ color: "#8a6d48", roughness: 1, flatShading: true }));
  const mound = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), moundMat);
  mound.visible = false;
  group.add(mound);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const rand = (a, b) => a + Math.random() * (b - a);

  return {
    rock(p, v, size, life = 2.5) {
      if (debris.length >= ROCKS) debris.shift();
      debris.push({ p: p.clone(), v: v.clone(), s: size, life, age: 0,
        axis: V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), spin: rand(-12, 12), q: new THREE.Quaternion() });
    },
    puff(p, v, size, life = 1.4, op = 0.55) {
      const d = puffs[nextPuff];
      nextPuff = (nextPuff + 1) % puffs.length;
      d.s.position.copy(p);
      d.v.copy(v);
      d.age = 0; d.life = life; d.base = size; d.grow = size * 1.8; d.op = op;
      d.s.visible = true;
    },
    crack(x, z, len, angle, life = 2.5) {
      if (cracks.length >= CRACKS) cracks.shift();
      cracks.push({ x, z, len, angle, life, age: 0, w: rand(0.8, 1.6) });
    },
    // A breach: rock thrown up and out, dust rolling off the hole.
    breach(at, power, up = 0.5) {
      for (let i = 0; i < 14 * power; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(80, 260) * Math.sqrt(power);
        this.rock(V(at.x + rand(-K, K), g + 2, at.z + rand(-K, K)),
          V(Math.cos(a) * sp * (1 - up), rand(200, 480) * (0.6 + up) * Math.sqrt(power), Math.sin(a) * sp * (1 - up)), rand(2, 6) * (0.8 + power * 0.2));
      }
      for (let i = 0; i < 8 * power; i++) {
        const a = rand(0, Math.PI * 2);
        this.puff(V(at.x + rand(-K, K), g + rand(4, 20), at.z + rand(-K, K)),
          V(Math.cos(a) * rand(20, 70), rand(10, 60), Math.sin(a) * rand(20, 70)), rand(30, 55) * (0.7 + power * 0.2), rand(1.2, 2.2));
      }
      for (let i = 0; i < 5; i++) this.crack(at.x, at.z, rand(K * 0.8, K * 1.8) * Math.sqrt(power), rand(0, Math.PI * 2), 3);
    },
    // The hunting mound under (x, z), 0..1 strong.
    mound(x, z, k) {
      mound.visible = k > 0.01;
      mound.position.set(x, g - 2, z);
      mound.scale.set(48 * k, 16 * k, 34 * k);
    },
    update(dt) {
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        d.age += dt;
        if (d.age >= d.life) { debris.splice(i, 1); continue; }
        d.v.y -= 900 * dt;
        d.p.addScaledVector(d.v, dt);
        if (d.p.y < g + d.s * 0.5) {
          d.p.y = g + d.s * 0.5;
          d.v.multiplyScalar(0.35); d.v.y = Math.abs(d.v.y) * 0.4;
          d.spin *= 0.5;
        }
        d.q.setFromAxisAngle(d.axis, d.spin * d.age);
      }
      let n = 0;
      for (const d of debris) {
        const fade = 1 - smooth(0.75, 1, d.age / d.life);
        m4.compose(d.p, d.q, sc.setScalar(d.s * fade));
        rocks.setMatrixAt(n++, m4);
      }
      rocks.count = n;
      rocks.instanceMatrix.needsUpdate = true;

      for (const d of puffs) {
        if (!d.s.visible) continue;
        d.age += dt;
        if (d.age >= d.life) { d.s.visible = false; continue; }
        const u = d.age / d.life;
        d.s.position.addScaledVector(d.v, dt);
        d.v.multiplyScalar(Math.max(0, 1 - dt * 1.5));
        d.s.scale.setScalar(d.base + d.grow * u);
        d.s.material.opacity = d.op * smooth(0, 0.12, u) * (1 - smooth(0.4, 1, u));
      }

      for (let i = cracks.length - 1; i >= 0; i--) {
        cracks[i].age += dt;
        if (cracks[i].age >= cracks[i].life) cracks.splice(i, 1);
      }
      n = 0;
      for (const c of cracks) {
        const grow = smooth(0, 0.15, c.age), fade = 1 - smooth(0.6, 1, c.age / c.life);
        const len = c.len * grow;
        q.setFromAxisAngle(_Y, c.angle);
        const p = V(c.x + Math.cos(c.angle) * len / 2, g + 0.4, c.z - Math.sin(c.angle) * len / 2);
        m4.compose(p, q, sc.set(len, 0.6, c.w * fade));
        crackMesh.setMatrixAt(n++, m4);
      }
      crackMesh.count = n;
      crackMesh.instanceMatrix.needsUpdate = true;
    },
    clear() {
      debris.length = 0;
      cracks.length = 0;
      for (const d of puffs) d.s.visible = false;
      mound.visible = false;
      rocks.count = 0;
      crackMesh.count = 0;
    },
    setVisible(on) { group.visible = on; },
    dispose() {
      scene.remove(group);
      rocks.dispose(); crackMesh.dispose();
      for (const o of disposables) o.dispose();
    },
  };
}
const _Y = new THREE.Vector3(0, 1, 0);

// --- the worm ------------------------------------------------------------------
// `ground` is the ground's view-space y; `soldier` the fake entity (the strike
// throws it); `groundY` its world-px ground for re-seating it each frame.
export function createWorm(scene, { ground, soldier }) {
  const g = ground;
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const fx = createEffects(scene, g);
  fx.setVisible(false);

  // Everything below the ground is cut away.
  const clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -g)];

  // Per-node scale and distance back along the trail: head, segments, tail.
  const scales = Array.from({ length: SEGMENTS }, (_, i) => K * (1 - TAPER * (i / (SEGMENTS - 1)) ** 1.3));
  const dists = [];
  let d = 0.62 * K * HEAD;
  for (let i = 0; i < SEGMENTS; i++) {
    d += 0.5 * scales[i] * (i ? SPACING : 1);
    dists.push(d);
    d += 0.5 * scales[i] * SPACING;
  }
  const tailD = d + 0.5 * scales[SEGMENTS - 1];
  const trail = new Trail();
  trail.max = tailD + 3 * K + 50;

  let model = null; // { head, petals: [hinge groups], segs: [InstancedMesh], tail }
  let mats = [];
  new Promise((ok) => import("three/addons/loaders/GLTFLoader.js").then(({ GLTFLoader }) =>
    new GLTFLoader().load(new URL("./models/worm.glb", import.meta.url).href, ok)))
    .then((gltf) => {
      const node = (name) => gltf.scene.getObjectByName(name);
      const meshes = (n) => { const out = []; n.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        m.clippingPlanes = clip;
        if (m.name === "Shell") { m.color.set(COLOR); m.roughness = 0.8; m.metalness = 0.1; }
        if (!mats.includes(m)) mats.push(m);
      });
      const head = node("Head");
      const petals = [];
      for (let k = 0; k < 5; k++) {
        const around = new THREE.Group();
        around.rotation.x = k * Math.PI * 2 / 5;
        const hinge = new THREE.Group();
        hinge.position.copy(HINGE);
        hinge.add(k ? node("Petal").clone() : node("Petal"));
        around.add(hinge);
        head.add(around);
        petals.push(hinge);
      }
      const segs = meshes(node("Segment")).map((m) => {
        const im = new THREE.InstancedMesh(m.geometry, m.material, SEGMENTS);
        im.frustumCulled = false;
        root.add(im);
        return im;
      });
      const tail = node("Tail");
      head.matrixAutoUpdate = tail.matrixAutoUpdate = false;
      root.add(head, tail);
      model = { head, petals, segs, tail };
    });

  const state = { wobble: V(0, 0), mode: "cycle", anim: null, t: 0, piece: 0, prevHead: V(0, 0), head: V(0, 0), toss: -1, shake: 0, kick: 0, holes: [] };
  const P = [], T = [];
  for (let i = 0; i < SEGMENTS + 2; i++) { P.push(V(0, 0)); T.push(V(0, 0)); }
  const nodeD = [0, ...dists, tailD];
  const a = V(0, 0), b = V(0, 0);
  const basis = new THREE.Matrix4(), m4 = new THREE.Matrix4(), rollQ = new THREE.Quaternion(), q = new THREE.Quaternion();
  const X = V(0, 0), Y = V(0, 0), Z = V(0, 0), WZ = V(0, 0, 1), sv = V(0, 0);
  const S = soldier.x + soldier.w / 2, home = soldier.x;

  function start(mode) {
    state.mode = mode;
    state.anim = WORM_ANIMS[mode].build(S, g);
    state.t = 0;
    state.toss = -1;
    state.thrown = false;
    soldier.x = home;
    trail.reset(state.anim.seed);
    const last = state.anim.seed[state.anim.seed.length - 1];
    state.head.copy(last);
    state.prevHead.copy(last);
    state.holes.length = 0;
    fx.clear();
  }

  // Where the head is at time t, and which piece that is.
  function headAt(t, out) {
    const pieces = state.anim.pieces;
    let tt = t;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (tt <= p.dur || i === pieces.length - 1) {
        const u = clamp01(tt / p.dur);
        p.at(p.ease ? p.ease(u) : u, out, t);
        return { piece: p, u, index: i };
      }
      tt -= p.dur;
    }
  }
  const total = () => state.anim.pieces.reduce((s, p) => s + p.dur, 0);

  // The depth wave, by distance back from the head.
  const sway = (d, t) => WAVE.amp * Math.sin(t * WAVE.speed - d / WAVE.length * Math.PI * 2) * smooth(0, 120, d);

  function nodes(t) {
    // The wobble moves the head off the trail, fading with distance back.
    const end = state.head, drift = state.wobble;
    for (let j = 0; j < nodeD.length; j++) {
      const dj = nodeD[j];
      const at = (dd, out) => {
        trail.sample(end, Math.max(0, dd), out);
        out.z += sway(dd, t);
        out.addScaledVector(drift, Math.exp(-Math.max(0, dd) / 150));
        return out;
      };
      at(dj, P[j]);
      at(dj - 6, a);
      at(dj + 6, b);
      T[j].subVectors(a, b).normalize();
    }
  }

  // A rotation whose +x is `tangent` and whose +z leans toward the camera.
  function orient(tangent, roll, out) {
    X.copy(tangent);
    Z.copy(WZ).addScaledVector(X, -WZ.dot(X));
    if (Z.lengthSq() < 1e-4) Z.set(0, 1, 0).addScaledVector(X, -X.y);
    Z.normalize();
    Y.crossVectors(Z, X);
    basis.makeBasis(X, Y, Z);
    out.setFromRotationMatrix(basis);
    if (roll) out.multiply(rollQ.setFromAxisAngle(_X, roll));
    return out;
  }

  function place(t) {
    if (!model) return;
    const { head, petals, segs, tail } = model;
    head.matrix.compose(P[0], orient(T[0], 0, q), sv.setScalar(K * HEAD));
    head.matrixWorldNeedsUpdate = true;
    for (let i = 0; i < SEGMENTS; i++) {
      m4.compose(P[i + 1], orient(T[i + 1], i * ROLL, q), sv.setScalar(scales[i]));
      for (const im of segs) im.setMatrixAt(i, m4);
    }
    for (const im of segs) im.instanceMatrix.needsUpdate = true;
    const last = SEGMENTS + 1;
    tail.matrix.compose(P[last], orient(T[last], SEGMENTS * ROLL, q), sv.setScalar(scales[SEGMENTS - 1]));
    tail.matrixWorldNeedsUpdate = true;
    const open = MAW.closed + (MAW.open - MAW.closed) * state.maw;
    petals.forEach((h, k) => { h.rotation.z = open + 0.06 * Math.sin(t * 7 + k * 1.3) * state.maw; });
  }

  // Effects that come from where the body is: breaches, the holes the body
  // is pouring through, the hunting mound, the warning tremor.
  function effects(dt, info) {
    const head = state.head, prev = state.prevHead;
    const rand = (x, y) => x + Math.random() * (y - x);
    // The head crossing the ground opens a hole.
    if ((prev.y - g) * (head.y - g) < 0) {
      const k = (g - prev.y) / (head.y - prev.y);
      const at = V(prev.x + (head.x - prev.x) * k, g, prev.z + (head.z - prev.z) * k);
      const strike = info.piece.tag === "strike";
      fx.breach(at, strike ? 3.2 : 1.1, strike ? 0.85 : 0.45);
      if (strike) state.shake = Math.max(state.shake, 9);
      else state.shake = Math.max(state.shake, 1.5);
      state.holes.push({ x: at.x, z: at.z, idle: 0 });
    }
    // Holes with body in them trickle dust and grit.
    for (let i = state.holes.length - 1; i >= 0; i--) {
      const h = state.holes[i];
      let busy = false;
      for (let j = 0; j < P.length && !busy; j += 2) {
        busy = Math.abs(P[j].x - h.x) < K * 1.5 && Math.abs(P[j].y - g) < K * 2;
      }
      h.idle = busy ? 0 : h.idle + dt;
      if (h.idle > 3) { state.holes.splice(i, 1); continue; }
      if (busy && Math.random() < dt * 22) {
        fx.puff(V(h.x + rand(-K, K), g + rand(2, 12), h.z + rand(-K, K)), V(rand(-30, 30), rand(10, 40), rand(-30, 30)), rand(18, 32), rand(0.8, 1.4), 0.45);
        if (Math.random() < 0.4) fx.rock(V(h.x + rand(-K, K), g + 2, h.z + rand(-K, K)), V(rand(-60, 60), rand(80, 200), rand(-60, 60)), rand(1.5, 3.5), 1.6);
      }
    }
    // Hunting: a mound racing along the surface, kicking grit and cracking.
    const hunting = info.piece.tag === "hunt" || info.piece.tag === "warn";
    fx.mound(head.x, 0, hunting ? smooth(0, 0.3, info.u) * (info.piece.tag === "warn" ? 1 - smooth(0.6, 1, info.u) : 1) : 0);
    if (hunting) {
      state.kick += dt;
      while (state.kick > 0.05) {
        state.kick -= 0.05;
        fx.puff(V(head.x + rand(-20, 20), g + 4, rand(-25, 25)), V(rand(-40, 40), rand(20, 60), rand(-30, 30)), rand(16, 30), 1.2, 0.5);
        fx.rock(V(head.x + rand(-20, 20), g + 3, rand(-20, 20)), V(rand(-70, 70), rand(120, 240), rand(-50, 50)), rand(1.5, 3), 1.4);
        if (Math.random() < 0.35) fx.crack(head.x + rand(-10, 10), rand(-15, 15), rand(14, 30), rand(-0.6, 0.6) + (Math.random() < 0.5 ? 0 : Math.PI), 2.2);
      }
      state.shake = Math.max(state.shake, info.piece.tag === "warn" ? 2.5 : 0.8);
    }
    // The warning: a ring of cracks round the spot, opened once.
    if (info.piece.tag === "warn" && !state.warned) {
      state.warned = true;
      for (let i = 0; i < 12; i++) fx.crack(S, 0, rand(30, 70), (i / 12) * Math.PI * 2 + rand(-0.15, 0.15), 2.6);
    }
    if (info.index === 0) state.warned = false;
  }

  // The strike throws the soldier up and clear of the hole, and he lands
  // where he lands (back at his post when the cycle restarts). Returns his
  // height off the ground, px; moves his x itself.
  const THROW = { dur: 1.15, height: 190, dist: 150 };
  function tossSoldier(dt, info) {
    if (state.mode !== "cycle") return 0;
    if (info.piece.tag === "strike" && state.toss < 0 && !state.thrown && state.head.y > g - 30) {
      state.toss = 0;
      state.thrown = true;
      soldier.hitFlash = 0.25;
    }
    if (state.toss < 0) return 0;
    state.toss += dt;
    const u = Math.min(1, state.toss / THROW.dur);
    soldier.x = home - THROW.dist * easeOut(u);
    if (u >= 1) { state.toss = -1; return 0; }
    return THROW.height * 4 * u * (1 - u);
  }

  return {
    setMode(mode) { start(mode); },
    setVisible(on) {
      root.visible = on;
      fx.setVisible(on);
      if (!on) soldier.x = home;
      if (on && !state.anim) start(state.mode);
    },
    // Advance by dt (seconds, already speed-scaled; 0 holds the pose). Moves
    // the fake soldier's x when the strike throws him. Returns the camera
    // shake and how high he is thrown, px. Everything runs on the worm's own
    // clock, so seek() lands on exactly the pose a played cycle has there.
    update(dt) {
      if (!root.visible || !state.anim) return { shake: 0, lift: 0 };
      dt = Math.min(dt, 0.05);
      state.t += dt;
      if (state.t > total()) {
        if (state.anim.freeze || state.mode === "swim") state.t -= total();
        else start(state.mode);
      }
      const time = state.t;
      state.prevHead.copy(state.head);
      const info = headAt(state.t, state.head);
      state.phase = info.piece.name;
      if (info.piece.wobble) info.piece.wobble(info.u, state.wobble, time);
      else state.wobble.set(0, 0, 0);
      state.maw = info.piece.maw ? info.piece.maw(info.u, time) : 0;
      if (!state.anim.freeze) trail.push(state.head);
      nodes(time);
      place(time);
      effects(dt, info);
      fx.update(dt);

      const lift = tossSoldier(dt, info);
      if (soldier.hitFlash > 0) soldier.hitFlash = Math.max(0, soldier.hitFlash - dt);

      state.shake = Math.max(0, state.shake - dt * 14);
      return { shake: state.shake, lift };
    },
    // Jump to t seconds into the current animation, by replaying it from the
    // start at 60Hz (the trail is history, so it cannot be computed directly).
    seek(t) {
      if (!state.anim) return;
      start(state.mode);
      t = Math.max(0, Math.min(t, total()));
      while (state.t + 1 / 60 < t) this.update(1 / 60);
      this.update(t - state.t);
    },
    time: () => state.t,
    duration: () => (state.anim ? total() : 0),
    phase: () => state.phase || "",
    dispose() {
      scene.remove(root);
      fx.dispose();
      root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      for (const m of mats) { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose(); }
    },
  };
}
const _X = new THREE.Vector3(1, 0, 0);
