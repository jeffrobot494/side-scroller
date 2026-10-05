// ---------------------------------------------------------------------------
// GRAPHICS TESTER — effects for the enemy roster (enemies.js).
//
// Everything is in three's world space (y up, the play plane at z=0) and
// pooled. One module so every enemy reads as the same world:
//   smoke / glow  - billboards: soft normal-blended smoke and dust, additive
//                   flashes and fire
//   sparks        - one instanced mesh of additive slivers stretched along
//                   their velocity; with gravity 0 they are shrapnel
//   chunks        - one instanced mesh of lit debris (casings, plates)
//   rings         - additive shock rings, upright or lying on the ground
//   bolts         - straight projectiles with a glow, that hit the target box
//                   or the ground
//   homers        - a cloned model that steers at the target (missiles,
//                   drones), trailing smoke, and ends in an explosion
//   shake         - camera shake, read by the app
// Looks only: the game draws none of this.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (u) => 1 - (1 - u) * (1 - u);

function radialTexture(stops) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [at, a] of stops) grd.addColorStop(at, `rgba(255,255,255,${a})`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createFx(scene) {
  const group = new THREE.Group();
  scene.add(group);
  let floor = -Infinity;            // world y of the ground
  let target = null;                // { x0, x1, y0, y1 } world box the shots seek
  let shake = 0;

  // --- billboards ------------------------------------------------------------
  const SMOKE_TEX = radialTexture([[0, 0.85], [0.45, 0.4], [1, 0]]);
  const GLOW_TEX = radialTexture([[0, 1], [0.2, 0.8], [0.5, 0.25], [1, 0]]);
  function spritePool(n, tex, additive) {
    return Array.from({ length: n }, () => {
      const m = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, opacity: 0,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const s = new THREE.Sprite(m);
      s.visible = false;
      s.renderOrder = additive ? 11 : 9;
      group.add(s);
      return { s, m, age: 0, life: 1, v: V(), s0: 1, s1: 1, op: 1, drag: 0, rise: 0, fadeIn: 0, spin: 0 };
    });
  }
  const smokes = spritePool(320, SMOKE_TEX, false);
  const glows = spritePool(200, GLOW_TEX, true);
  let nSmoke = 0, nGlow = 0;
  function put(pool, i, p, v, o) {
    const d = pool[i];
    d.s.position.copy(p);
    d.v.copy(v);
    d.age = 0; d.life = o.life ?? 1;
    d.s0 = o.size ?? 10; d.s1 = o.grow ?? d.s0 * 2;
    d.op = o.op ?? 0.6; d.drag = o.drag ?? 1.5; d.rise = o.rise ?? 0; d.fadeIn = o.fadeIn ?? 0.08;
    d.m.color.set(o.color ?? "#888");
    d.m.rotation = Math.random() * 6.28; d.spin = rand(-1, 1) * (o.spin ?? 0.6);
    d.s.visible = true;
  }
  const smoke = (p, v, o = {}) => { put(smokes, nSmoke, p, v, o); nSmoke = (nSmoke + 1) % smokes.length; };
  const glow = (p, v, o = {}) => { put(glows, nGlow, p, v, { drag: 0, fadeIn: 0, ...o }); nGlow = (nGlow + 1) % glows.length; };
  function updateSprites(pool, dt, additive) {
    for (const d of pool) {
      if (!d.s.visible) continue;
      d.age += dt;
      if (d.age >= d.life) { d.s.visible = false; continue; }
      const u = d.age / d.life;
      d.v.multiplyScalar(Math.max(0, 1 - d.drag * dt));
      d.v.y += d.rise * dt;
      d.s.position.addScaledVector(d.v, dt);
      const k = d.s0 + (d.s1 - d.s0) * ease(u);
      d.s.scale.set(k, k, 1);
      d.m.rotation += d.spin * dt;
      const fin = d.fadeIn > 0 ? Math.min(1, u / d.fadeIn) : 1;
      d.m.opacity = d.op * fin * (additive ? (1 - u) * (1 - u) : 1 - u);
    }
  }

  // Frame glows: held for one frame only (charge-ups, telegraphs, flames' halos).
  const held = spritePool(160, GLOW_TEX, true);
  let nHeld = 0;
  function hold(p, size, color, op = 1) {
    if (nHeld >= held.length) return;
    const d = held[nHeld++];
    d.s.position.copy(p);
    d.s.scale.set(size, size, 1);
    d.m.color.set(color);
    d.m.opacity = op;
    d.s.visible = true;
  }

  // --- sparks and chunks: instanced ------------------------------------------
  const SPARKS = 500;
  const sparkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), SPARKS);
  sparkMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 3), 3);
  sparkMesh.frustumCulled = false;
  sparkMesh.renderOrder = 12;
  group.add(sparkMesh);
  const sparks = [];
  function spark(p, v, o = {}) {
    if (sparks.length >= SPARKS) sparks.shift();
    sparks.push({ p: p.clone(), v: v.clone(), age: 0, life: o.life ?? rand(0.25, 0.6), size: o.size ?? 1.6,
      g: o.gravity ?? 700, drag: o.drag ?? 0.6, c: new THREE.Color(o.color ?? "#ffcf7a").multiplyScalar(o.bright ?? 3),
      stretch: o.stretch ?? 0.03 });
  }
  const CHUNKS = 160;
  const chunkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.6 }), CHUNKS);
  chunkMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CHUNKS * 3), 3);
  chunkMesh.frustumCulled = false;
  group.add(chunkMesh);
  const chunks = [];
  function chunk(p, v, o = {}) {
    if (chunks.length >= CHUNKS) chunks.shift();
    chunks.push({ p: p.clone(), v: v.clone(), age: 0, life: o.life ?? 2.5, s: V(...(o.size ?? [2, 2, 2])),
      axis: V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), spin: rand(-14, 14), q: new THREE.Quaternion(),
      c: new THREE.Color(o.color ?? "#555"), smoke: o.smoke ?? 0, nextSmoke: 0 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(), X = V(1, 0, 0), dir = V(), tmpC = new THREE.Color();
  function updateInstanced(dt) {
    let n = 0;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const d = sparks[i];
      d.age += dt;
      if (d.age >= d.life) { sparks.splice(i, 1); continue; }
      d.v.y -= d.g * dt;
      d.v.multiplyScalar(Math.max(0, 1 - d.drag * dt));
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < floor) { d.p.y = floor; d.v.y = Math.abs(d.v.y) * 0.35; d.v.x *= 0.6; d.v.z *= 0.6; }
    }
    for (const d of sparks) {
      const u = d.age / d.life, sp = d.v.length();
      q.setFromUnitVectors(X, sp > 1e-3 ? dir.copy(d.v).divideScalar(sp) : X);
      m4.compose(d.p, q, sc.set(d.size + sp * d.stretch, d.size * 0.4, d.size * 0.4));
      sparkMesh.setMatrixAt(n, m4);
      sparkMesh.setColorAt(n, tmpC.copy(d.c).multiplyScalar((1 - u) * (1 - u)));
      n++;
    }
    sparkMesh.count = n;
    sparkMesh.instanceMatrix.needsUpdate = true;
    if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;

    n = 0;
    for (let i = chunks.length - 1; i >= 0; i--) {
      const d = chunks[i];
      d.age += dt;
      if (d.age >= d.life) { chunks.splice(i, 1); continue; }
      d.v.y -= 900 * dt;
      d.p.addScaledVector(d.v, dt);
      const hs = d.s.y / 2;
      if (d.p.y < floor + hs) {
        d.p.y = floor + hs;
        d.v.multiplyScalar(0.4); d.v.y = Math.abs(d.v.y) * 0.5; d.spin *= 0.55;
      }
      d.q.setFromAxisAngle(d.axis, d.spin * d.age);
      if (d.smoke && d.age < d.life * 0.7 && (d.nextSmoke -= dt) <= 0) {
        d.nextSmoke = 0.05;
        smoke(d.p, V(rand(-5, 5), 20, 0), { size: 4 * d.smoke, grow: 14 * d.smoke, life: 0.9, color: "#2b2b2e", op: 0.5 });
      }
    }
    for (const d of chunks) {
      const fade = 1 - Math.max(0, (d.age / d.life - 0.8) / 0.2);
      m4.compose(d.p, d.q, sc.copy(d.s).multiplyScalar(fade));
      chunkMesh.setMatrixAt(n, m4);
      chunkMesh.setColorAt(n, d.c);
      n++;
    }
    chunkMesh.count = n;
    chunkMesh.instanceMatrix.needsUpdate = true;
    if (chunkMesh.instanceColor) chunkMesh.instanceColor.needsUpdate = true;
  }

  // --- rings -------------------------------------------------------------------
  const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
  const rings = Array.from({ length: 24 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    m.visible = false;
    m.renderOrder = 11;
    group.add(m);
    return { m, age: 0, life: 1, r0: 1, r1: 10, op: 1 };
  });
  let nRing = 0;
  function ring(p, o = {}) {
    const d = rings[nRing];
    nRing = (nRing + 1) % rings.length;
    d.m.position.copy(p);
    d.m.rotation.set(o.flat ? -Math.PI / 2 : 0, 0, 0);
    d.m.material.color.set(o.color ?? "#ffd7a0").multiplyScalar(o.bright ?? 1.5);
    d.age = 0; d.life = o.life ?? 0.45; d.r0 = o.r0 ?? 4; d.r1 = o.r1 ?? 60; d.op = o.op ?? 0.9;
    d.m.visible = true;
  }
  function updateRings(dt) {
    for (const d of rings) {
      if (!d.m.visible) continue;
      d.age += dt;
      if (d.age >= d.life) { d.m.visible = false; continue; }
      const u = d.age / d.life, r = d.r0 + (d.r1 - d.r0) * ease(u);
      d.m.scale.set(r, r, r);
      d.m.material.opacity = d.op * (1 - u);
    }
  }

  // --- bolts -------------------------------------------------------------------
  const boltGeo = new THREE.CapsuleGeometry(0.5, 1, 3, 8).rotateZ(Math.PI / 2);
  const bolts = [];
  const hitTarget = (p, pad = 0) => target && p.x > target.x0 - pad && p.x < target.x1 + pad && p.y > target.y0 - pad && p.y < target.y1 + pad;
  function bolt(p, v, o = {}) {
    const color = new THREE.Color(o.color ?? "#ffb449");
    const mesh = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.6) }));
    mesh.scale.set(o.w ?? 11, o.h ?? 5, o.h ?? 5);
    group.add(mesh);
    bolts.push({ mesh, p: p.clone(), v: v.clone(), age: 0, life: o.life ?? 1.6, color: o.color ?? "#ffb449", h: o.h ?? 5 });
  }
  function boltEnd(b, hitFloor) {
    const n = hitFloor ? V(0, 1, 0) : V(-Math.sign(b.v.x) || -1, 0, 0);
    glow(b.p, V(), { size: b.h * 5, grow: b.h * 7, life: 0.18, color: b.color, op: 0.9 });
    for (let i = 0; i < 8; i++) {
      const d = n.clone().multiplyScalar(rand(80, 220)).add(V(rand(-120, 120), rand(-60, 160), rand(-80, 80)));
      spark(b.p, d, { color: b.color, life: rand(0.15, 0.4), size: 1.2 });
    }
    if (hitFloor) smoke(b.p, V(0, 20, 0), { size: 6, grow: 20, life: 0.7, color: "#6e6458", op: 0.4 });
  }
  function updateBolts(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.age += dt;
      b.p.addScaledVector(b.v, dt);
      const hitT = hitTarget(b.p), hitF = b.p.y < floor;
      if (hitF) b.p.y = floor;
      if (b.age >= b.life || hitT || hitF) {
        if (hitT || hitF) boltEnd(b, hitF && !hitT);
        group.remove(b.mesh); b.mesh.material.dispose(); bolts.splice(i, 1); continue;
      }
      b.mesh.position.copy(b.p);
      b.mesh.rotation.set(0, 0, Math.atan2(b.v.y, b.v.x));
      hold(b.p, b.h * 4.2, b.color, 0.55);
    }
  }

  // --- homers: missiles and drones ----------------------------------------------
  const homers = [];
  function homer(obj, p, v, o = {}) {
    obj.position.copy(p);
    group.add(obj);
    homers.push({ obj, p: p.clone(), v: v.clone(), age: 0, speed: o.speed ?? 250, turn: o.turn ?? 2.8,
      life: o.life ?? 6, delay: o.delay ?? 0, kind: o.kind ?? "missile", onEnd: o.onEnd, nextTrail: 0, spin: 0 });
  }
  const want = V(), cur = V(), axis = V();
  function updateHomers(dt) {
    for (let i = homers.length - 1; i >= 0; i--) {
      const h = homers[i];
      h.age += dt;
      // Steer: rotate the velocity toward the target by at most turn*dt.
      if (target && h.age > h.delay) {
        want.set((target.x0 + target.x1) / 2, (target.y0 + target.y1) / 2, 0).sub(h.p).normalize();
        cur.copy(h.v).normalize();
        const ang = Math.acos(Math.max(-1, Math.min(1, cur.dot(want))));
        if (ang > 1e-4) {
          axis.crossVectors(cur, want);
          if (axis.lengthSq() < 1e-8) axis.set(0, 0, 1);
          cur.applyAxisAngle(axis.normalize(), Math.min(ang, h.turn * dt));
        }
        const sp = h.v.length() + (h.speed - h.v.length()) * Math.min(1, dt * 3);
        h.v.copy(cur).multiplyScalar(sp);
      }
      h.p.addScaledVector(h.v, dt);
      h.obj.position.copy(h.p);
      const hitT = hitTarget(h.p, 6), hitF = h.p.y < floor + 3;
      if (h.kind === "missile") {
        // Nose along the velocity; a flame and a smoke trail behind.
        h.obj.quaternion.setFromUnitVectors(X, cur.copy(h.v).normalize());
        h.spin += dt * 9;
        h.obj.rotateX(h.spin);
        const tail = h.p.clone().addScaledVector(cur, -13);
        hold(tail, 16 + Math.random() * 6, "#ffb35a", 0.9);
        if ((h.nextTrail -= dt) <= 0) {
          h.nextTrail = 0.016;
          smoke(tail, V(rand(-8, 8), rand(-8, 8), rand(-8, 8)), { size: 5, grow: 22, life: rand(0.8, 1.3), color: "#c9c2b8", op: 0.45, drag: 2, rise: 14 });
          if (Math.random() < 0.4) spark(tail, cur.clone().multiplyScalar(-rand(60, 140)).add(V(rand(-30, 30), rand(-30, 30), 0)), { color: "#ffb35a", life: 0.2, gravity: 0, size: 1 });
        }
      } else {
        // A drone: spins on its axis, leans into its flight, its thruster burning.
        h.spin += dt * 7;
        h.obj.rotation.set(0, h.spin, -Math.atan2(h.v.x, 400) * 0.6);
        hold(h.p.clone().add(V(0, -6, 0)), 12, "#ffb070", 0.7);
        if ((h.nextTrail -= dt) <= 0) {
          h.nextTrail = 0.05;
          smoke(h.p.clone().add(V(0, -6, 0)), V(0, -20, 0), { size: 3, grow: 9, life: 0.5, color: "#a49a8c", op: 0.3 });
        }
      }
      if (h.age >= h.life || hitT || hitF) {
        if (hitF) h.p.y = floor + 3;
        h.onEnd?.(h.p.clone());
        group.remove(h.obj);
        homers.splice(i, 1);
      }
    }
  }

  // --- composites --------------------------------------------------------------
  function explosion(p, size = 52, o = {}) {
    const hot = o.color ?? "#ffb12b";
    glow(p, V(), { size: size * 0.6, grow: size * 1.6, life: 0.22, color: "#fff4d0", op: 1 });
    glow(p, V(), { size: size, grow: size * 2.1, life: 0.45, color: hot, op: 0.9 });
    for (let i = 0; i < 6; i++) {
      glow(p.clone().add(V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(size * 0.35)), V(rand(-40, 40), rand(0, 60), 0),
        { size: size * 0.4, grow: size * 0.9, life: rand(0.3, 0.6), color: i % 2 ? "#ff7a1a" : hot, op: 0.8 });
    }
    for (let i = 0; i < 10 + size / 6; i++) {
      smoke(p.clone().add(V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(size * 0.3)),
        V(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).multiplyScalar(size * 1.6),
        { size: size * 0.35, grow: size * 1.1, life: rand(1.0, 2.0), color: i % 3 ? "#3a3634" : "#5a524a", op: 0.55, drag: 2.5, rise: 20, fadeIn: 0.1 });
    }
    for (let i = 0; i < 14 + size / 4; i++) {
      const d = V(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(rand(150, 420) * Math.sqrt(size / 52));
      spark(p, d, { color: Math.random() < 0.5 ? "#ffd27a" : hot, life: rand(0.3, 0.8), size: rand(1.2, 2.2) });
    }
    ring(p, { r0: size * 0.2, r1: size * 1.3, life: 0.35, color: hot, op: 0.8 });
    shake = Math.max(shake, (o.shake ?? 2) * size / 52);
  }

  function dust(p, n = 6, size = 10, spread = 60) {
    for (let i = 0; i < n; i++) {
      const a = rand(-1, 1);
      smoke(p.clone().add(V(a * size * 0.4, 0, rand(-size, size) * 0.4)), V(a * spread, rand(10, 40), rand(-1, 1) * spread * 0.6),
        { size: size * 0.6, grow: size * 2.2, life: rand(0.7, 1.3), color: "#8b7a64", op: 0.45, drag: 2.5, rise: 6, fadeIn: 0.1 });
    }
  }

  return {
    group,
    smoke, glow, hold, spark, chunk, ring, bolt, homer, explosion, dust,
    setFloor(y) { floor = y; },
    setTarget(box) { target = box; },
    kick(a) { shake = Math.max(shake, a); },
    get shake() { return shake; },
    update(dt) {
      for (let i = 0; i < nHeld; i++) held[i].s.visible = false;
      nHeld = 0;
      shake *= Math.exp(-dt * 7);
      if (shake < 0.05) shake = 0;
      updateSprites(smokes, dt, false);
      updateSprites(glows, dt, true);
      updateInstanced(dt);
      updateRings(dt);
      updateBolts(dt);
      updateHomers(dt);
    },
    // Hide the frame's held glows and drop everything in flight.
    clear() {
      for (const d of [...smokes, ...glows, ...held]) d.s.visible = false;
      for (const d of rings) d.m.visible = false;
      sparks.length = 0; chunks.length = 0;
      sparkMesh.count = 0; chunkMesh.count = 0;
      for (const b of bolts) { group.remove(b.mesh); b.mesh.material.dispose(); }
      for (const h of homers) group.remove(h.obj);
      bolts.length = 0; homers.length = 0; shake = 0;
    },
  };
}
