// ---------------------------------------------------------------------------
// 3D VIEW — enemy effects (tech/mission-3d-enemies.md M10).
//
// The graphics tester's effects (graphics-tester/enemy-fx.js), pooled, in
// three's world space (y up, the play plane at z=0):
//   smoke / glow  - billboards: soft normal-blended smoke and dust, additive
//                   flashes and fire
//   held          - glows that last one frame (lights, flames, charge-ups)
//   sparks        - one instanced mesh of additive slivers stretched along
//                   their velocity; with gravity 0 they are shrapnel
//   chunks        - one instanced mesh of lit debris (casings, rocks, plates)
//   rings         - additive shock rings, upright or lying on the ground
// The tester's bolts and homers are not here: the game has real shots and real
// spawned drones and missiles. Nor is its shake: that is the motion record's.
// A particle bounces on the floor it was given (the emitter's ground), since a
// level has many.
//
// The three effect tables at the bottom are the tester's FX, triggered from
// the motion record and the rig's own state instead of the tester's cycle
// times. Cosmetic randomness is Math.random, as everywhere in the view.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (u) => 1 - (1 - u) * (1 - u);
const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const pulse = (t) => 0.5 + 0.5 * Math.sin(t * 26);

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

export function createEnemyFx(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const owned = []; // geometries, materials and textures to free at the end

  // --- billboards ------------------------------------------------------------
  const SMOKE_TEX = radialTexture([[0, 0.85], [0.45, 0.4], [1, 0]]);
  const GLOW_TEX = radialTexture([[0, 1], [0.2, 0.8], [0.5, 0.25], [1, 0]]);
  owned.push(SMOKE_TEX, GLOW_TEX);
  function spritePool(n, tex, additive) {
    return Array.from({ length: n }, () => {
      const m = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, opacity: 0, fog: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      owned.push(m);
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

  // One-frame glows.
  const held = spritePool(200, GLOW_TEX, true);
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
  const box = new THREE.BoxGeometry(1, 1, 1);
  owned.push(box);
  const SPARKS = 500;
  const sparkMat = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  const sparkMesh = new THREE.InstancedMesh(box, sparkMat, SPARKS);
  sparkMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 3), 3);
  sparkMesh.frustumCulled = false;
  sparkMesh.renderOrder = 12;
  group.add(sparkMesh);
  const sparks = [];
  function spark(p, v, o = {}) {
    if (sparks.length >= SPARKS) sparks.shift();
    sparks.push({ p: p.clone(), v: v.clone(), age: 0, life: o.life ?? rand(0.25, 0.6), size: o.size ?? 1.6,
      g: o.gravity ?? 700, drag: o.drag ?? 0.6, c: new THREE.Color(o.color ?? "#ffcf7a").multiplyScalar(o.bright ?? 3),
      stretch: o.stretch ?? 0.03, floor: o.floor ?? -Infinity });
  }
  const CHUNKS = 160;
  const chunkMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.6 });
  const chunkMesh = new THREE.InstancedMesh(box, chunkMat, CHUNKS);
  chunkMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CHUNKS * 3), 3);
  chunkMesh.frustumCulled = false;
  group.add(chunkMesh);
  owned.push(sparkMat, chunkMat);
  const chunks = [];
  function chunk(p, v, o = {}) {
    if (chunks.length >= CHUNKS) chunks.shift();
    chunks.push({ p: p.clone(), v: v.clone(), age: 0, life: o.life ?? 2.5, s: V(...(o.size ?? [2, 2, 2])),
      axis: V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), spin: rand(-14, 14), q: new THREE.Quaternion(),
      c: new THREE.Color(o.color ?? "#555"), smoke: o.smoke ?? 0, nextSmoke: 0, floor: o.floor ?? -Infinity });
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
      if (d.p.y < d.floor) { d.p.y = d.floor; d.v.y = Math.abs(d.v.y) * 0.35; d.v.x *= 0.6; d.v.z *= 0.6; }
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
      if (d.p.y < d.floor + hs) {
        d.p.y = d.floor + hs;
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
  owned.push(ringGeo);
  const rings = Array.from({ length: 24 }, () => {
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    owned.push(mat);
    const m = new THREE.Mesh(ringGeo, mat);
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

  // --- composites --------------------------------------------------------------
  function explosion(p, size = 52, o = {}) {
    const hot = o.color ?? "#ffb12b";
    glow(p, V(), { size: size * 0.6, grow: size * 1.6, life: 0.22, color: "#fff4d0", op: 1 });
    glow(p, V(), { size, grow: size * 2.1, life: 0.45, color: hot, op: 0.9 });
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
      spark(p, d, { color: Math.random() < 0.5 ? "#ffd27a" : hot, life: rand(0.3, 0.8), size: rand(1.2, 2.2), floor: o.floor });
    }
    ring(p, { r0: size * 0.2, r1: size * 1.3, life: 0.35, color: hot, op: 0.8 });
  }

  function dust(p, n = 6, size = 10, spread = 60) {
    for (let i = 0; i < n; i++) {
      const a = rand(-1, 1);
      smoke(p.clone().add(V(a * size * 0.4, 0, rand(-size, size) * 0.4)), V(a * spread, rand(10, 40), rand(-1, 1) * spread * 0.6),
        { size: size * 0.6, grow: size * 2.2, life: rand(0.7, 1.3), color: "#8b7a64", op: 0.45, drag: 2.5, rise: 6, fadeIn: 0.1 });
    }
  }

  // The Siege Automaton's targeting beams, one per model, made on first use.
  const beams = new Map(); // model → mesh
  let beamSeen = new Set();
  function beam(key, from, to, op) {
    let b = beams.get(key);
    if (!b) {
      const g = new THREE.CylinderGeometry(0.6, 0.6, 1, 6, 1, true);
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff3020").multiplyScalar(2), transparent: true,
        opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      b = new THREE.Mesh(g, m);
      group.add(b);
      beams.set(key, b);
    }
    const d = to.clone().sub(from), len = d.length();
    b.visible = true;
    b.position.copy(from).addScaledVector(d, 0.5);
    b.scale.set(1, len, 1);
    b.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    b.material.opacity = op;
    beamSeen.add(key);
  }
  const dropBeam = (b) => { group.remove(b); b.geometry.dispose(); b.material.dispose(); };

  const api = { smoke, glow, hold, spark, chunk, ring, explosion, dust, beam };

  return {
    ...api,
    // Start of a frame: step everything in flight, drop last frame's held
    // glows, and forget beams nothing asked for.
    begin(dt) {
      for (let i = 0; i < nHeld; i++) held[i].s.visible = false;
      nHeld = 0;
      for (const [k, b] of beams) if (!beamSeen.has(k)) { dropBeam(b); beams.delete(k); }
      beamSeen = new Set();
      updateSprites(smokes, dt, false);
      updateSprites(glows, dt, true);
      updateInstanced(dt);
      updateRings(dt);
    },
    // Everything off for a frame (the knob turned off): nothing drawn, nothing kept.
    hide() {
      for (const d of [...smokes, ...glows, ...held]) d.s.visible = false;
      nHeld = 0;
      for (const d of rings) d.m.visible = false;
      sparks.length = 0; chunks.length = 0;
      sparkMesh.count = 0; chunkMesh.count = 0;
      for (const b of beams.values()) dropBeam(b);
      beams.clear();
    },
    dispose() {
      for (const b of beams.values()) dropBeam(b);
      beams.clear();
      scene.remove(group);
      sparkMesh.dispose(); chunkMesh.dispose();
      for (const o of owned) o.dispose();
    },
  };
}

// ---- the effect tables ---------------------------------------------------------
// c: { fx, t, dt, v (the model), r (the root), s (the clock), rec (the record),
//      at(socket) - a world point, dir(socket, x, y, z) - a bone-frame direction
//      in the world, every(p, off) - a beat of period p passed this frame,
//      fires(part) - rounds this frame, ev(kind, key) - that event this frame,
//      floor - the world y of the ground under the root, target - the nearest
//      soldier's centre in the world, or null }.

function flame(c, k, dx, dy, power, size, color = "#ffb070") {
  if (power <= 0.01) return;
  const p = c.at(k), d = c.dir(k, dx, dy, 0);
  c.fx.hold(p, size * 1.5 * Math.min(1.4, power), "#fff2d8", 0.9);
  for (let i = 1; i <= 3; i++) {
    c.fx.hold(p.clone().addScaledVector(d, size * 0.75 * i * power), size * (1.5 - i * 0.28) * power, i === 1 ? color : "#ff6a2a", 0.8 - i * 0.17);
  }
}
function rocks(c, p, n, speed) {
  for (let i = 0; i < n; i++) {
    c.fx.chunk(p.clone().add(V(rand(-8, 8), 2, rand(-8, 8))), V(rand(-1, 1) * speed, rand(0.5, 1.2) * speed * 1.6, rand(-1, 1) * speed * 0.6),
      { size: [rand(1.5, 3.5), rand(1.5, 3), rand(1.5, 3)], color: Math.random() < 0.5 ? "#6b5a46" : "#4a3e31", life: 1.6, floor: c.floor });
  }
}
const ground = (c, p) => V(p.x, c.floor + 1, p.z);

export const FX = {
  breach_hopper(c) {
    const { fx, t, s } = c;
    const st = c.v.state;
    fx.hold(c.at("visor"), 9, "#ff5a3c", 0.55 + 0.1 * Math.sin(t * 9));
    fx.hold(c.at("port"), 6, "#ff7657", 0.4);
    // Jets: pilot lights, building through a leap's windup, a blast at launch.
    let thrust = 0.16 + 0.04 * Math.sin(t * 40);
    if (s.act.id === "screenLeap" && s.act.phase === "windup") thrust = 0.16 + 0.5 * smooth(0, 0.48, t - s.act.at);
    const sinceUp = s.upAt !== undefined ? t - s.upAt : 9;
    if (sinceUp < 0.42) thrust = Math.max(thrust, 1.7 - sinceUp * 2);
    for (const k of ["jetL", "jetR"]) flame(c, k, -0.35, -1, thrust * (0.9 + 0.2 * Math.random()), 7);
    if (thrust > 0.6 && c.every(0.025)) {
      for (const k of ["jetL", "jetR"]) {
        const p = c.at(k), d = c.dir(k, -0.35, -1, 0);
        fx.smoke(p.clone().addScaledVector(d, 16), d.clone().multiplyScalar(rand(60, 140)).add(V(0, 0, rand(-20, 20))),
          { size: 6, grow: 26, life: rand(0.6, 1.0), color: "#8f8a84", op: 0.4, drag: 3 });
        fx.spark(p, d.clone().multiplyScalar(rand(200, 380)).add(V(rand(-40, 40), 0, rand(-40, 40))), { color: "#ffb070", life: 0.25, size: 1.2, floor: c.floor });
      }
    }
    // A telegraph flares the visor.
    if (s.telegraph) fx.hold(c.at("visor"), 30 + 6 * Math.sin(t * 26), "#ff5a5a", 0.65);
    // Rounds: the muzzle flash, smoke, sparks and a casing. The bolt is the game's own.
    for (let i = 0; i < c.fires("gunArm"); i++) {
      const p = c.at("muzzle"), d = c.dir("muzzle");
      fx.glow(p, V(), { size: 14, grow: 24, life: 0.07, color: "#fff0c0", op: 1 });
      fx.glow(p.clone().addScaledVector(d, 5), d.clone().multiplyScalar(60), { size: 10, grow: 18, life: 0.1, color: "#ffb449", op: 0.9 });
      fx.smoke(p, d.clone().multiplyScalar(40).add(V(0, 15, 0)), { size: 3, grow: 14, life: 0.6, color: "#9a948c", op: 0.3 });
      for (let k = 0; k < 4; k++) fx.spark(p, d.clone().multiplyScalar(rand(200, 400)).add(V(rand(-60, 60), rand(-60, 60), rand(-40, 40))), { color: "#ffd27a", life: 0.12, size: 1, gravity: 0 });
      fx.chunk(c.at("eject"), V(-c.facing * rand(30, 70), rand(120, 190), rand(-40, -10)), { size: [1.8, 0.8, 0.8], color: "#c9a24a", life: 1.3, floor: c.floor });
    }
    // Punches: a hot glow leaving the fist, a shock ring and sparks; the
    // knuckles glow while the jab is out.
    if (s.fired("fistArm").some((x) => t - x < 0.12)) fx.hold(c.at("knuckles"), 14, "#ff7657", 0.85);
    for (let i = 0; i < c.fires("fistArm"); i++) {
      const p = c.at("knuckles"), f = V(c.facing, 0, 0);
      fx.glow(p, f.clone().multiplyScalar(160), { size: 26, grow: 40, life: 0.16, color: "#ff7657", op: 0.75 });
      fx.ring(p, { r0: 4, r1: 34, life: 0.22, color: "#ff7657", op: 0.9 });
      for (let k = 0; k < 12; k++) fx.spark(p, f.clone().multiplyScalar(rand(120, 320)).add(V(0, rand(-140, 160), rand(-80, 80))), { color: "#ffb08a", life: rand(0.2, 0.4), floor: c.floor });
    }
    // Footfalls: a puff each half cycle of the walk (35.6px a cycle).
    if (s.moving && !s.air) {
      const half = Math.floor(s.walked / 17.8);
      if (st.foot !== undefined && half !== st.foot) fx.dust(ground(c, c.at(half % 2 ? "footL" : "footR")), 3, 7, 40);
      st.foot = half;
    }
    const feet = () => ground(c, c.at("footR").lerp(c.at("footL"), 0.5));
    if (c.ev("takeoff")) {
      fx.dust(feet(), 10, 14, 120);
      fx.ring(feet(), { flat: true, r0: 4, r1: 60, life: 0.4, color: "#ffcf9a", op: 0.6 });
    }
    if (c.ev("land")) {
      fx.dust(feet(), 14, 16, 150);
      fx.ring(feet(), { flat: true, r0: 6, r1: 90, life: 0.5, color: "#ffe0b0", op: 0.7 });
      rocks(c, feet(), 8, 90);
    }
  },

  siege_automaton(c) {
    const { fx, t, s } = c;
    if (!c.r.alive) return siegeDeathFx(c);
    fx.hold(c.at("eyes"), 12, "#ff5a3c", 0.6);
    fx.hold(c.at("core"), 30 + 6 * Math.sin(t * 3), "#5ff0d0", 0.4);
    if (c.every(0.12)) {
      for (const k of ["stackA", "stackB"]) fx.smoke(c.at(k), V(rand(-5, 5), rand(18, 30), 0), { size: 4, grow: 18, life: 1.4, color: "#45423f", op: 0.35, rise: 6 });
    }
    // Footfalls: on the record's own steps, the feet in turn.
    if (c.ev("step")) {
      const st = c.v.state;
      st.foot = (st.foot ?? 0) + 1;
      const p = ground(c, c.at(st.foot % 2 ? "footL" : "footR"));
      fx.dust(p, 7, 14, 70);
      fx.ring(p, { flat: true, r0: 6, r1: 46, life: 0.5, color: "#c8b090", op: 0.35 });
      rocks(c, p, 3, 50);
    }
    // The cannon charges through its windup and flashes on each round; the
    // rings run hot after a burst, then vent steam out of the stacks.
    if (s.act.id === "cannonBurst" && s.act.phase === "windup") {
      fx.hold(c.at("charge"), 6 + 34 * smooth(0, 0.38, t - s.act.at), "#73e8ff", 0.9);
    }
    for (let i = 0; i < c.fires("cannonArm"); i++) {
      const p = c.at("muzzle"), d = c.dir("muzzle");
      fx.glow(p, V(), { size: 22, grow: 40, life: 0.09, color: "#f0ffff", op: 1 });
      fx.glow(p, d.clone().multiplyScalar(80), { size: 30, grow: 54, life: 0.16, color: "#73e8ff", op: 0.8 });
      fx.ring(p.clone().addScaledVector(d, 6), { r0: 4, r1: 22, life: 0.18, color: "#73e8ff", op: 0.8 });
      for (let k = 0; k < 6; k++) fx.spark(p, d.clone().multiplyScalar(rand(150, 300)).add(V(rand(-80, 80), rand(-80, 80), rand(-50, 50))), { color: "#9ff4ff", life: 0.2, size: 1.2, gravity: 0 });
    }
    const shots = s.fired("cannonArm");
    if (shots.length) {
      const since = t - shots[shots.length - 1];
      fx.hold(c.at("cannonMid"), 46, "#73e8ff", 0.4 * (1 - smooth(0.2, 1.0, since)));
      if (since > 0.35 && since < 0.9 && c.every(0.03)) {
        for (const k of ["stackA", "stackB"]) fx.smoke(c.at(k), V(rand(-15, 15), rand(70, 110), rand(-10, 10)), { size: 6, grow: 34, life: rand(0.9, 1.4), color: "#e6eef0", op: 0.5, drag: 1.5, rise: 10 });
      }
    }
    // A missile volley: the finger paints the target, the pod flares and arms,
    // and each pair leaves its tube in a flash and a puff.
    if (s.act.id === "missileVolley" && s.act.phase !== "recovery" && c.target) {
      const f = c.at("finger");
      fx.beam(c.v, f, c.target, 0.45 + 0.25 * pulse(t));
      fx.hold(f, 10, "#ff4030", 0.9);
      fx.hold(c.target, 12 + 4 * pulse(t), "#ff3020", 0.8);
      if (pulse(t * 0.5) > 0.5) fx.hold(c.at("arming"), 10, "#ff4030", 0.95);
    }
    if (c.parts.get("missilePack")?.telegraph > 0) fx.hold(c.at("pack"), 64 + 10 * Math.sin(t * 26), "#ff5a5a", 0.3 + 0.3 * pulse(t));
    for (let i = 0; i < c.fires("missilePack"); i++) {
      const st = c.v.state;
      st.tube = (st.tube ?? 0) + 1;
      const p = c.at(st.tube % 2 ? "tubeL" : "tubeR");
      fx.glow(p, V(), { size: 18, grow: 40, life: 0.12, color: "#fff0d0", op: 1 });
      for (let k = 0; k < 6; k++) fx.smoke(p, V(rand(-60, 60), rand(-30, 30), rand(-40, 40)), { size: 6, grow: 26, life: rand(0.8, 1.3), color: "#cfc8bd", op: 0.5, drag: 2.5, rise: 10 });
      for (let k = 0; k < 5; k++) fx.spark(p, V(rand(-120, 120), rand(-60, 160), rand(-60, 60)), { color: "#ffb35a", life: 0.3, floor: c.floor });
    }
    const feet = () => ground(c, c.at("footR").lerp(c.at("footL"), 0.5));
    if (c.ev("takeoff")) {
      fx.dust(feet(), 14, 18, 130);
      fx.ring(feet(), { flat: true, r0: 8, r1: 80, life: 0.45, color: "#ffd7a0", op: 0.5 });
    }
    if (c.ev("land")) {
      fx.dust(feet(), 22, 24, 170);
      fx.ring(feet(), { flat: true, r0: 10, r1: 160, life: 0.6, color: "#ffe0b0", op: 0.7 });
      fx.ring(feet(), { flat: true, r0: 6, r1: 90, life: 0.45, color: "#ffffff", op: 0.5 });
      rocks(c, feet(), 14, 130);
    }
  },

  floating_factory(c) {
    const { fx, t, s } = c;
    const st = c.v.state;
    // Stack smoke, raked back while it drifts.
    if (c.every(0.07)) {
      for (const k of ["stack1", "stack2"]) {
        fx.smoke(c.at(k), V(rand(-6, 6) - (s.moving ? 30 : 0) * c.facing, rand(24, 40), rand(-4, 4)),
          { size: 5, grow: 28, life: rand(1.7, 2.6), color: Math.random() < 0.5 ? "#3b3632" : "#5a524b", op: 0.5, drag: 0.5, rise: 8, fadeIn: 0.15 });
      }
    }
    // The pods burn harder on the down-stroke of the hover.
    const thrust = 0.75 + 0.2 * Math.cos(t * 1.7) + (s.moving ? 0.15 : 0);
    for (const k of ["thrBn", "thrBf", "thrFn", "thrFf"]) flame(c, k, 0, -1, thrust * (0.9 + 0.2 * Math.random()), 7);
    if (c.every(0.09)) {
      const k = ["thrBn", "thrFn"][Math.floor(Math.random() * 2)];
      fx.smoke(c.at(k).add(V(0, -14, 0)), V(rand(-10, 10), -30, rand(-6, 6)), { size: 4, grow: 18, life: 0.8, color: "#9a8e80", op: 0.22 });
    }
    // Lights: sensor, tail, a beacon blink, the furnace windows and the bridge.
    fx.hold(c.at("nose"), 9, "#ff5a3c", 0.65);
    for (const k of ["tailN", "tailF"]) fx.hold(c.at(k), 7, "#ff7a50", 0.45);
    if (t % 1.1 < 0.12) fx.hold(c.at("mast"), 26, "#ff5040", 0.95);
    fx.hold(c.at("window"), 34, "#ff9a3c", 0.22 + 0.12 * Math.sin(t * 13) * Math.sin(t * 7.3));
    fx.hold(c.at("bridge"), 20, "#ffd27a", 0.22);
    // Each raised piston's cap lights; full, they all blink.
    const fill = st.fill ?? 0, on = fill >= 1 ? (t * 4) % 1 < 0.5 : 1;
    for (let i = 0; i < 5; i++) if (fill * 5 >= i + 1 - 1e-6) fx.hold(c.at(`cap${i}`), 9, "#ffd27a", 0.75 * on);
    // Building: an amber strobe while the doors open, the furnace spilling
    // light out of the bay, welding sparks while the crane lowers the drone.
    const b = st.build;
    if (b !== null && b !== undefined) {
      if (b < 0.6) fx.hold(c.at("bay"), 34, "#ffb000", 0.3 + 0.5 * pulse(t) ** 2);
      if (b > 0.3 && b < 2.5) fx.hold(c.at("bay"), 56, "#ff8a2a", 0.45 * Math.min(1, (b - 0.3) / 0.3) * Math.min(1, (2.5 - b) / 0.3));
      if (b > 0.6 && b < 1.55 && Math.random() < 0.7) {
        const p = c.at("weld");
        fx.spark(p, V(rand(-90, 90), rand(-30, 140), rand(-60, 60)), { color: "#c8ecff", life: rand(0.15, 0.35), size: 1.1, floor: c.floor });
        if (Math.random() < 0.3) fx.glow(p, V(), { size: 9, grow: 4, life: 0.05, color: "#d8f4ff", op: 1 });
      }
    }
    // The launch: a flash and a ring at the hook.
    if (c.ev("spawn", "drone")) {
      const p = c.at("hook");
      fx.glow(p, V(), { size: 10, grow: 30, life: 0.2, color: "#ffd166", op: 0.8 });
      fx.ring(p, { r0: 4, r1: 26, life: 0.3, color: "#ffd166", op: 0.7 });
    }
  },
};

// The Siege Automaton coming apart: the overload strobe, steam and sparks,
// the pod smoking until it blows, stumps and flying parts trailing smoke, the
// blast's rings and debris, and the wreck burning until the record's wreck
// end, which goes up in a last small blast.
const SIEGE_PARTS_GO = [["missilePack", "spawnDeath:podCharge"], ["cannonArm", "spawnDeath:cannonCharge"], ["head", "spawnDeath:overload"], ["leftArm", "spawnDeath:overload"]];
function siegeDeathFx(c) {
  const { fx, t, s } = c;
  const st = c.v.state;
  const a = st.diedAt !== undefined ? t - st.diedAt : 0;
  const blastAt = s.last("spawnDeath:overload"), podAt = s.last("spawnDeath:podCharge"), cannonAt = s.last("spawnDeath:cannonCharge");
  if (c.ev("death")) {
    const p = c.at("chest");
    fx.ring(p, { r0: 120, r1: 10, life: 0.5, color: "#5ff0d0", op: 0.7 });
    fx.glow(p, V(), { size: 160, grow: 40, life: 0.5, color: "#5ff0d0", op: 0.5 });
  }
  if (blastAt === undefined) {
    const over = smooth(1.0, 2.4, a);
    fx.hold(c.at("eyes"), 12, "#ff5a3c", 0.6 * (Math.random() < 0.15 + over * 0.5 ? 0.2 : 1));
    fx.hold(c.at("core"), 30 + 90 * over + 20 * over * Math.sin(a * 40), over > 0.5 ? "#d8fff6" : "#5ff0d0", 0.4 + 0.5 * over);
    // The pod smokes and spits sparks until it goes.
    if (podAt === undefined && !(st.lost && st.lost.missilePack)) {
      if (c.every(0.03)) fx.spark(c.at("pack"), V(rand(-120, 120), rand(40, 220), rand(-60, 60)), { color: "#ffd27a", floor: c.floor });
      if (c.every(0.06)) fx.smoke(c.at("pack"), V(rand(-10, 10), 40, 0), { size: 6, grow: 26, life: 1.2, color: "#2e2b29", op: 0.5, rise: 10 });
    }
    // The stumps spark and smoke once the cannon is gone.
    if (cannonAt !== undefined && c.every(0.04)) {
      fx.spark(c.at("shoulder"), V(rand(-60, 160), rand(0, 200), rand(-80, 0)), { color: "#ffd27a", life: 0.5, floor: c.floor });
      fx.smoke(c.at("shoulder"), V(rand(-10, 10), 35, 0), { size: 5, grow: 24, life: 1.2, color: "#2e2b29", op: 0.45, rise: 10 });
    }
    // The overload: a red strobe over the hull, steam out of every stack.
    if (a > 1.2) {
      fx.hold(c.at("chest"), 130 + 30 * Math.sin(a * 30), "#ff5a5a", 0.2 + 0.25 * pulse(t));
      if (c.every(0.03)) {
        for (const k of ["stackA", "stackB"]) fx.smoke(c.at(k), V(rand(-20, 20), rand(80, 130), rand(-10, 10)), { size: 6, grow: 32, life: 1.0, color: "#e6eef0", op: 0.5, rise: 12 });
        fx.spark(c.at("hip"), V(rand(-160, 160), rand(40, 240), rand(-80, 80)), { color: "#9ff4ff", life: 0.35, floor: c.floor });
      }
    }
  }
  // The parts trail smoke as they fly.
  if (c.every(0.04)) {
    for (const [bn, key] of SIEGE_PARTS_GO) {
      const t0 = s.last(key);
      if (t0 !== undefined && t - t0 < 2.4 && c.v.bones[bn]) fx.smoke(c.v.bones[bn].b.getWorldPosition(V()), V(rand(-8, 8), 20, 0), { size: 5, grow: 22, life: 1.0, color: "#2b2826", op: 0.45, rise: 6 });
    }
  }
  if (c.ev("spawnDeath", "overload")) {
    const p = c.at("core");
    fx.ring(ground(c, p), { flat: true, r0: 10, r1: 260, life: 0.7, color: "#ffcf8a", op: 0.7 });
    fx.ring(p, { r0: 20, r1: 200, life: 0.5, color: "#fff0c0", op: 0.8 });
    for (let i = 0; i < 24; i++) {
      fx.chunk(p.clone().add(V(rand(-25, 25), rand(-40, 40), rand(-15, 15))), V(rand(-1, 1) * 320, rand(0.2, 1.4) * 320, rand(-1, 1) * 160),
        { size: [rand(2, 7), rand(2, 6), rand(1, 4)], color: Math.random() < 0.5 ? "#414956" : "#22262d", life: 3, smoke: Math.random() < 0.4 ? 1 : 0, floor: c.floor });
    }
  }
  // The wreck burns until it is cleared.
  if (blastAt !== undefined && t - blastAt > 0.2 && c.every(0.04)) {
    const p = c.at("chest").add(V(rand(-30, 30), rand(-6, 12), rand(-15, 15)));
    fx.glow(p, V(rand(-10, 10), rand(30, 60), 0), { size: 14, grow: 6, life: rand(0.3, 0.6), color: Math.random() < 0.5 ? "#ff8a2a" : "#ffb347", op: 0.8 });
    fx.smoke(p, V(rand(-10, 10), rand(40, 70), 0), { size: 10, grow: 46, life: rand(1.6, 2.4), color: "#1f1d1c", op: 0.55, rise: 10, fadeIn: 0.1 });
  }
}

// Spawned defs drawn as the tester's explosion at their own size, in place of
// a glowing sphere: the damage area still reads. By the root's spec id.
export const EXPLOSIONS = { siege_automaton: ["microBlast", "deathFlash", "deathBlast"] };

// The context an effect table reads, for one rigged root this frame.
export function fxContext(fx, v, r, s, rec, time, dt, floor, target) {
  const evs = rec ? rec.events : [];
  return {
    fx, v, r, s, rec, t: time, dt, floor, target, parts: s.parts,
    facing: v.root.rotation.y ? -1 : 1,
    at: (k) => { const so = v.sockets[k]; return so ? so.b.localToWorld(so.local.clone()) : v.root.getWorldPosition(V()); },
    dir: (k, x = 1, y = 0, z = 0) => { const so = v.sockets[k]; return so ? V(x, y, z).transformDirection(so.b.matrixWorld) : V(x, y, z); },
    every: (p, off = 0) => dt > 0 && Math.floor((time - off) / p) !== Math.floor((time - dt - off) / p),
    fires: (part) => evs.reduce((n, e) => n + (e.kind === "fire" && e.part === part ? e.n : 0), 0),
    ev: (kind, key) => evs.some((e) => e.kind === kind && (key === undefined || e.def === key || e.part === key || e.id === key)),
  };
}
