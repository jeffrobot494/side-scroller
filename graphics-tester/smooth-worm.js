// ---------------------------------------------------------------------------
// GRAPHICS TESTER — the smooth worm: the sand worm (worm.js) with one
// continuous hide instead of a train of plated segments.
//
// A copy of worm.js — same path, trail, animations and effects — differing
// only in the skin. The whole outside is ONE procedural tube, rebuilt every
// frame, from the mouth rim to the tail tip: rings sampled down the trail,
// each a circle of vertices round the spine, swept through the same sway and
// wobble the segments took. In front of the head's point the rings run
// straight along the head's heading, so the head keeps its rigid shape — a
// broad skull swelling behind the rim, narrowing to the neck. The five jaw
// petals are flaps of the same hide, hinged on the rim, mapped so that closed
// they carry the tube's scales on to a pointed nose.
//
// From models/worm.glb only the insides are kept: the lip, throat, teeth and
// gullet of the Head, and the flesh and teeth of the Petal. Their armour (the
// Shell material) is hidden, and Segment and Tail are unused.
//
// The hide is a generated texture of overlapping scales (colour + normal map),
// laid out so the scales shrink with the girth and stay put on the body.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const K = 34;                 // px: body radius at the head end (model radius 1)
const SEGMENTS = 24;           // worm.js's body, kept only to measure the same length
const TAPER = 0.45;           // the girth at the tail's root is (1 - TAPER) of the neck's
const SPACING = 0.8;          // worm.js's segment pitch (sets the length)
const TAIL = 2.6;             // the tail tip, × the last girth past where worm.js's tail sat
const GIRTH = 0.95;           // body radius, × K
const BULGE = 0.06;           // the skull's swell behind the rim, × the head's size
const RINGS = 190, SIDES = 28; // the hide's resolution: rings down the body, vertices round each
const PULSE = { amp: 0.035, speed: 4.5, length: 120 }; // a slow swell down the body: × radius, rad/s, px
const SCALES = { around: 16, rows: 8, aspect: 0.75 }; // scales round the body; rows per texture tile; pitch / width
const WAVE = { amp: 14, speed: 3.2, length: 260 }; // depth sway: px, rad/s, px
const MAW = { closed: 0, open: 1.85 };              // petal hinge, rad (closed = sealed: the flaps meet)
const HEAD = 1.25;            // the head's size against the first segment: a maw bigger than the neck
const COLOR = "#c29c6a";      // the armour: weathered sand

// The hinge of the top petal in head space (models/worm.py: MOUTH, R).
const HINGE = new THREE.Vector3(0.62, 1.12, 0);
const MOUTH = HINGE.x, RIM = HINGE.y;
// One jaw petal as models/worm.py builds it (LEN, SPAN, petal_at), in head
// units with its hinge at the origin, closed over +y (Blender's +z: the glTF
// export turns Blender (x, y, z) into (x, z, -y)). The hide sits OUT
// outside the model's flesh lining (at -0.03), flush with the rim at the hinge.
const PETAL = { len: 1.25, span: Math.PI / 5, nu: 14, nv: 8, out: 0.035, lining: -0.03 };

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
  // sample() for many distances at once, ascending, in one walk down the
  // trail (the hide asks for a ring every few px, every frame).
  sampleMany(head, ds, outs) {
    let i = this.pts.length - 1, cur = head, walked = 0;
    for (let k = 0; k < ds.length; k++) {
      const want = Math.max(0, ds[k]);
      let found = false;
      while (i >= 0) {
        const p = this.pts[i], len = cur.distanceTo(p);
        if (walked + len >= want && len > 1e-6) { outs[k].copy(cur).lerp(p, (want - walked) / len); found = true; break; }
        walked += len;
        cur = p;
        i--;
      }
      if (!found) this.sample(head, want, outs[k]);
    }
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

export const SMOOTH_WORM_ANIMS = {
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

// --- the hide ------------------------------------------------------------------
// One tile of overlapping scales: SCALES.rows rows along the body (texture x,
// headward to tailward) by SCALES.around scales round it (texture y, the whole
// circumference), alternate rows offset half a scale. Each scale's free edge
// points tailward and lies over the root of the scale behind it, so where two
// overlap the headward one is on top. Heights → a normal map; the same
// heights darken the roots and crevices in the colour map.
function hideTextures() {
  const { around, rows } = SCALES;
  const W = rows * 48, H = around * 64, pitch = W / rows, width = H / around;
  const h = new Float32Array(W * H);
  const col = document.createElement("canvas"), nrm = document.createElement("canvas");
  col.width = nrm.width = W;
  col.height = nrm.height = H;
  const cImg = col.getContext("2d").createImageData(W, H), nImg = nrm.getContext("2d").createImageData(W, H);
  const hash = (i, j) => {
    let n = (((i % rows) + rows) % rows) * 374761393 + (((j % around) + around) % around) * 668265263;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  // In sRGB, the space the canvas is written in (THREE.Color holds linear).
  const base = new THREE.Color(COLOR).convertLinearToSRGB(), gap = new THREE.Color("#4a3624").convertLinearToSRGB();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fi = Math.floor(x / pitch);
      let hh = 0, shade = 1, tint = 1, k = -1;
      for (let i = fi - 2; i <= fi + 1 && k < 0; i++) {
        const off = (i & 1) * 0.5, fj = Math.floor(y / width - off);
        let best = 1;
        for (let j = fj - 1; j <= fj + 1; j++) {
          const sx = (x - (i + 0.62) * pitch) / (0.86 * pitch), sy = (y - (j + 0.5 + off) * width) / (0.6 * width);
          const e = sx * sx + sy * sy;
          if (e >= best) continue;
          best = e;
          k = i;
          const along = (sx + 1) / 2; // 0 at the root, 1 at the free edge
          const rim = smooth(0, 0.18, 1 - e);
          hh = (0.25 + 0.75 * along) * (1 - 0.3 * sy * sy) * rim + 0.06 * Math.max(0, 1 - Math.abs(sy) * 7) * along;
          shade = (0.78 + 0.3 * hh) * (along > 0.82 ? 1.06 : 1);
          tint = 0.86 + 0.24 * hash(i, j);
        }
      }
      h[y * W + x] = hh;
      // Faint chevron bands, periodic in the tile both ways.
      const band = 0.5 + 0.5 * Math.cos(2 * Math.PI * (2 * x / W + Math.abs(((4 * y / H) % 1) - 0.5)));
      const dark = 1 - 0.16 * smooth(0.55, 0.9, band);
      const c = k < 0 ? gap : base, m = k < 0 ? 1 : shade * tint * dark, o = (y * W + x) * 4;
      cImg.data[o] = Math.min(255, c.r * m * 255);
      cImg.data[o + 1] = Math.min(255, c.g * m * 255);
      cImg.data[o + 2] = Math.min(255, c.b * m * 255);
      cImg.data[o + 3] = 255;
    }
  }
  const S = 3;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = h[y * W + (x + 1) % W] - h[y * W + (x + W - 1) % W];
      const dy = h[((y + 1) % H) * W + x] - h[((y + H - 1) % H) * W + x];
      const n = V(-dx * S, dy * S, 1).normalize(), o = (y * W + x) * 4;
      nImg.data[o] = (n.x * 0.5 + 0.5) * 255;
      nImg.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
      nImg.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
      nImg.data[o + 3] = 255;
    }
  }
  col.getContext("2d").putImageData(cImg, 0, 0);
  nrm.getContext("2d").putImageData(nImg, 0, 0);
  const map = new THREE.CanvasTexture(col), normalMap = new THREE.CanvasTexture(nrm);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, normalMap };
}

// --- the worm ------------------------------------------------------------------
// `ground` is the ground's view-space y; `soldier` the fake entity (the strike
// throws it); `groundY` its world-px ground for re-seating it each frame.
export function createSmoothWorm(scene, { ground, soldier }) {
  const g = ground;
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const fx = createEffects(scene, g);
  fx.setVisible(false);

  // Everything below the ground is cut away.
  const clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -g)];

  // The body is as long as worm.js's: its segments' taper and pitch measure
  // where its tail sat, and the hide carries on TAIL girths past that.
  const scales = Array.from({ length: SEGMENTS }, (_, i) => K * (1 - TAPER * (i / (SEGMENTS - 1)) ** 1.3));
  let d = 0.62 * K * HEAD;
  for (let i = 0; i < SEGMENTS; i++) d += 0.5 * scales[i] * ((i ? SPACING : 1) + SPACING);
  const tailD = d + 0.5 * scales[SEGMENTS - 1];
  const KH = K * HEAD;                              // px per head unit
  const D0 = -MOUTH * KH;                           // the hide starts at the mouth rim, ahead of the head's point
  const tipD = tailD + TAIL * scales[SEGMENTS - 1];
  const trail = new Trail();
  trail.max = tipD + 3 * K + 50;

  // The hide's rest radius by distance back from the head's point: the rim,
  // the skull swelling behind it and narrowing to the neck, the body's taper,
  // then a tail drawn down to a point.
  const rTail = K * GIRTH * (1 - TAPER);
  const radius = (dd) => {
    if (dd > tailD) return rTail * Math.cos(clamp01((dd - tailD) / (tipD - tailD)) * Math.PI / 2) ** 0.8;
    const f = clamp01(dd / tailD);
    const body = K * GIRTH * (1 - TAPER * f ** 1.3), w = 1 - smooth(-0.1 * KH, 1.4 * KH, dd);
    return body + (RIM * KH - body) * w + BULGE * KH * Math.sin(Math.PI * clamp01((dd - D0) / (2.2 * KH)));
  };
  // Per ring: distance back, rest radius, its slope (for the normals), and
  // how far down the scale texture it sits — rows are counted against the
  // girth, so a scale is always about as long as it is wide.
  const ringD = [], ringR = [], ringSlope = [], ringU = [];
  let rows = 0;
  for (let i = 0; i <= RINGS; i++) {
    const dd = D0 + (tipD - D0) * i / RINGS;
    if (i) {
      const step = (tipD - D0) / RINGS, rMid = Math.max(4, radius(dd - step / 2));
      rows += step / (SCALES.aspect * 2 * Math.PI * rMid / SCALES.around);
    }
    ringD.push(dd);
    ringR.push(radius(dd));
    ringSlope.push((radius(dd + 1) - radius(dd - 1)) / 2);
    ringU.push(rows / SCALES.rows);
  }
  // The rim rolls in: one more ring just ahead of it, inside it, down to the
  // throat's radius, so the hide closes over the gap between the two and the
  // mouth has one edge. Its normal faces forward, out of the mouth.
  ringD.unshift(D0 - 0.03 * KH);
  ringR.unshift((RIM - 0.11) * KH);
  ringSlope.unshift(4);
  ringU.unshift(ringU[0] - 0.004);
  const LAST = ringD.length - 1;

  // The hide: one tube, LAST × SIDES quads; positions and normals rewritten
  // every frame, uvs and faces fixed. The seam column is doubled so the
  // texture wraps.
  const NV = SIDES + 1;
  const pos = new Float32Array((LAST + 1) * NV * 3), nor = new Float32Array(pos.length), uv = new Float32Array((LAST + 1) * NV * 2);
  const index = [];
  for (let i = 0; i <= LAST; i++) {
    for (let j = 0; j <= SIDES; j++) {
      uv[(i * NV + j) * 2] = ringU[i];
      uv[(i * NV + j) * 2 + 1] = j / SIDES;
      if (i < LAST && j < SIDES) {
        const a0 = i * NV + j, b0 = a0 + NV;
        index.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
      }
    }
  }
  const cosA = [], sinA = [];
  for (let j = 0; j <= SIDES; j++) { cosA.push(Math.cos(j / SIDES * Math.PI * 2)); sinA.push(Math.sin(j / SIDES * Math.PI * 2)); }
  const skinGeo = new THREE.BufferGeometry();
  skinGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  skinGeo.setAttribute("normal", new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  skinGeo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  skinGeo.setIndex(index);
  const hide = hideTextures();
  // Double-sided so a body cut by the ground reads solid rather than hollow.
  const skinMat = new THREE.MeshStandardMaterial({ map: hide.map, normalMap: hide.normalMap, normalScale: new THREE.Vector2(1, 1),
    roughness: 0.75, metalness: 0.08, clippingPlanes: clip, side: THREE.DoubleSide });
  const skin = new THREE.Mesh(skinGeo, skinMat);
  skin.frustumCulled = false;
  root.add(skin);

  // A jaw petal's hide: the outer surface plus the strips down its two sides
  // that close it against the model's flesh lining. Petal k is turned theta
  // round the spine; its texture carries on from the rim ring (u = 0 there,
  // decreasing toward the tip, rows counted against the petal's own girth)
  // at the same angle round, so the five closed petals continue the tube.
  const petalAt = (u, v, out, o) => {
    const a = (v * 2 - 1) * PETAL.span, r = RIM * (1 - u) * (1 + 0.4 * Math.sin(Math.PI * u)) + out;
    return o.set(u * PETAL.len, r * Math.cos(a) - RIM, -r * Math.sin(a));
  };
  const petalRows = [0];
  for (let i = 1; i <= PETAL.nu; i++) {
    let acc = petalRows[i - 1];
    for (let k = 0; k < 8; k++) {
      const u = (i - 1 + (k + 0.5) / 8) / PETAL.nu;
      const r = Math.max(4, RIM * KH * (1 - u) * (1 + 0.4 * Math.sin(Math.PI * u)));
      acc += PETAL.len * KH / PETAL.nu / 8 / (SCALES.aspect * 2 * Math.PI * r / SCALES.around);
    }
    petalRows.push(acc);
  }
  function petalGeometry(theta) {
    const P3 = [], UV = [], I = [], o = V(0, 0);
    const vert = (u, v, out, i) => {
      petalAt(u, v, out, o);
      P3.push(o.x, o.y, o.z);
      // Round the spine from the head frame's +y toward +z, as the tube's rings run.
      const a = theta - (v * 2 - 1) * PETAL.span;
      UV.push(-petalRows[i] / SCALES.rows, a / (Math.PI * 2));
      return P3.length / 3 - 1;
    };
    const outAt = (u) => PETAL.out * smooth(0, 0.15, u);
    const grid = [];
    for (let i = 0; i <= PETAL.nu; i++) {
      grid.push([]);
      for (let j = 0; j <= PETAL.nv; j++) grid[i].push(vert(i / PETAL.nu, j / PETAL.nv, outAt(i / PETAL.nu), i));
    }
    for (let i = 0; i < PETAL.nu; i++) {
      for (let j = 0; j < PETAL.nv; j++) {
        const a0 = grid[i][j], b0 = grid[i + 1][j], c0 = grid[i + 1][j + 1], e0 = grid[i][j + 1];
        I.push(a0, b0, e0, b0, c0, e0);
      }
    }
    for (const v of [0, 1]) {
      const inner = [];
      for (let i = 0; i <= PETAL.nu; i++) inner.push(vert(i / PETAL.nu, v, PETAL.lining, i));
      for (let i = 0; i < PETAL.nu; i++) {
        const a0 = grid[i][v * PETAL.nv], b0 = grid[i + 1][v * PETAL.nv];
        I.push(a0, inner[i], b0, inner[i], inner[i + 1], b0);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P3, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
    geo.setIndex(I);
    geo.computeVertexNormals();
    return geo;
  }

  let model = null; // { head, petals: [hinge groups] }
  let mats = [];
  new Promise((ok) => import("three/addons/loaders/GLTFLoader.js").then(({ GLTFLoader }) =>
    new GLTFLoader().load(new URL("./models/worm.glb", import.meta.url).href, ok)))
    .then((gltf) => {
      const node = (name) => gltf.scene.getObjectByName(name);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        m.clippingPlanes = clip;
        if (m.name === "Shell") o.visible = false; // the armour; the hide replaces it
        if (!mats.includes(m)) mats.push(m);
      });
      const head = node("Head");
      // The model's lip (a flesh ring standing proud of the rim) is pulled in
      // under the rolled hide; the teeth and throat inside it are untouched.
      head.traverse((o) => {
        if (!o.isMesh || o.material.name === "Shell") return;
        const p = o.geometry.attributes.position, lip = RIM - 0.12;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i), z = p.getZ(i), r = Math.hypot(y, z);
          if (p.getX(i) > MOUTH - 0.12 && r > lip) { p.setY(i, y * lip / r); p.setZ(i, z * lip / r); }
        }
        p.needsUpdate = true;
      });
      const petals = [];
      for (let k = 0; k < 5; k++) {
        const around = new THREE.Group();
        around.rotation.x = k * Math.PI * 2 / 5;
        const hinge = new THREE.Group();
        hinge.position.copy(HINGE);
        hinge.add(k ? node("Petal").clone() : node("Petal"));
        const flap = new THREE.Mesh(petalGeometry(k * Math.PI * 2 / 5), skinMat);
        flap.frustumCulled = false;
        hinge.add(flap);
        around.add(hinge);
        head.add(around);
        petals.push(hinge);
      }
      head.matrixAutoUpdate = false;
      root.add(head);
      model = { head, petals };
    });

  const state = { wobble: V(0, 0), mode: "cycle", anim: null, t: 0, piece: 0, prevHead: V(0, 0), head: V(0, 0), toss: -1, shake: 0, kick: 0, holes: [] };
  // P: the ring centres (the effects read them for which holes are busy).
  const P = ringD.map(() => V(0, 0));
  const headP = V(0, 0), headT = V(0, 0), tan = V(0, 0), rad = V(0, 0);
  const a = V(0, 0), b = V(0, 0);
  const basis = new THREE.Matrix4(), q = new THREE.Quaternion();
  const X = V(0, 0), Y = V(0, 0), Z = V(0, 0), WZ = V(0, 0, 1), sv = V(0, 0);
  const S = soldier.x + soldier.w / 2, home = soldier.x;

  function start(mode) {
    state.mode = mode;
    state.anim = SMOOTH_WORM_ANIMS[mode].build(S, g);
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
  // A point dd back along the body: on the trail, swayed, and pulled by the
  // head's wobble (which fades down the neck).
  const bend = (dd, t, out) => {
    out.z += sway(dd, t);
    return out.addScaledVector(state.wobble, Math.exp(-Math.max(0, dd) / 150));
  };

  function nodes(t) {
    const at = (dd, out) => bend(dd, t, trail.sample(state.head, Math.max(0, dd), out));
    at(0, headP);
    headT.subVectors(at(-6, a), at(6, b)).normalize();
    trail.sampleMany(state.head, ringD, P);
    for (let i = 0; i <= LAST; i++) {
      // Ahead of the head's point the skull is rigid: straight on along its heading.
      if (ringD[i] < 0) P[i].copy(headP).addScaledVector(headT, -ringD[i]);
      else bend(ringD[i], t, P[i]);
    }
  }

  // A frame whose X is `tangent` and whose Z leans toward the camera.
  function frame(tangent) {
    X.copy(tangent);
    Z.copy(WZ).addScaledVector(X, -WZ.dot(X));
    if (Z.lengthSq() < 1e-4) Z.set(0, 1, 0).addScaledVector(X, -X.y);
    Z.normalize();
    Y.crossVectors(Z, X);
  }
  function orient(tangent, out) {
    frame(tangent);
    return out.setFromRotationMatrix(basis.makeBasis(X, Y, Z));
  }

  // Each ring is a circle round its centre, square to the spine there; the
  // normal leans along the spine by the taper's slope.
  function skinUpdate(t) {
    for (let i = 0; i <= LAST; i++) {
      tan.subVectors(P[Math.max(0, i - 1)], P[Math.min(LAST, i + 1)]);
      if (tan.lengthSq() < 1e-8) tan.copy(headT); else tan.normalize();
      frame(tan);
      // The swell stays off the skull, so the rim keeps meeting the petals.
      const r = ringR[i] * (1 + PULSE.amp * smooth(KH, 2.5 * KH, ringD[i]) * Math.sin(t * PULSE.speed - ringD[i] / PULSE.length * Math.PI * 2));
      for (let j = 0; j <= SIDES; j++) {
        rad.copy(Y).multiplyScalar(cosA[j]).addScaledVector(Z, sinA[j]);
        const o = (i * NV + j) * 3;
        pos[o] = P[i].x + rad.x * r; pos[o + 1] = P[i].y + rad.y * r; pos[o + 2] = P[i].z + rad.z * r;
        rad.addScaledVector(X, ringSlope[i]).normalize();
        nor[o] = rad.x; nor[o + 1] = rad.y; nor[o + 2] = rad.z;
      }
    }
    skinGeo.attributes.position.needsUpdate = true;
    skinGeo.attributes.normal.needsUpdate = true;
  }

  function place(t) {
    skinUpdate(t);
    if (!model) return;
    const { head, petals } = model;
    head.matrix.compose(headP, orient(headT, q), sv.setScalar(K * HEAD));
    head.matrixWorldNeedsUpdate = true;
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
      hide.map.dispose(); hide.normalMap.dispose(); skinMat.dispose(); skinGeo.dispose();
    },
  };
}
