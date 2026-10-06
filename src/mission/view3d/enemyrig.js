// ---------------------------------------------------------------------------
// 3D VIEW — the Blender enemy rigs (tech/mission-3d-enemies.md M6).
//
// models/enemies.glb (built by graphics-tester/models/enemies.py): per enemy
// one armature named by its spec id, holding ONE rigidly skinned mesh — every
// vertex weighted 1.0 to a single bone — with two materials:
//   Shell  - the hull. Cloned per root, white, and tinted in the shader from a
//            small per-bone table (tint, hit flash) read through the vertex's
//            bone index, so each part takes its spec colour and flashes alone
//            while the geometry stays shared.
//   Detail - everything else, from a palette texture. Shared by every clone.
// Every bone points up with no roll, so a bone's rotation.z swings its part in
// the screen plane. The Iron Moth's wings are a separate unskinned mesh, hung
// on hinges the rig declares here.
//
// Loaded once per page, like the armour. Until it arrives, or if it never
// does, enemies keep their blocks.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { setColor } from "./util.js";
import { ENEMY_FILE } from "../../game/enemyspecs.js";

let kit = null; // { rigs: id → armature, wing } once loaded
let loading = null;
let cloneSkinned = null;

// Child parts a rig draws without a bone: the moth's wings, on hinges.
export const HINGES = { iron_moth: ["leftWing", "rightWing"] };

export function loadEnemyRigs() {
  loading ??= Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/utils/SkeletonUtils.js"),
  ])
    .then(([{ GLTFLoader }, { clone }]) => {
      cloneSkinned = clone;
      return new GLTFLoader().loadAsync(new URL("./models/enemies.glb", import.meta.url).href);
    })
    .then((gltf) => {
      const rigs = {};
      for (const rec of ENEMY_FILE) {
        const rig = gltf.scene.getObjectByName(rec.spec.id);
        if (rig) rigs[rec.spec.id] = rig;
      }
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.userData.shared = true;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m.name !== "Shell") m.userData.shared = true;
        }
      });
      kit = { rigs, wing: gltf.scene.getObjectByName("iron_moth_wing") };
    })
    .catch((err) => console.warn("3D enemy models did not load; keeping the blocks", err));
  return loading;
}

export const rigLoaded = () => !!kit;

// The loader suffixes repeated node names (head, head_1...); a bone goes by the
// name Blender gave it.
const nameOf = (o) => o.userData.name ?? o.name;

// The box each model was built to stand in: the shipped spec's.
const NATURAL = Object.fromEntries(ENEMY_FILE.map((r) => {
  const b = r.spec.root.body || {}, v = r.spec.root.visual;
  return [r.spec.id, [b.w ?? v.size[0], b.h ?? v.size[1]]];
}));

// Whether this root can be drawn as its rig: the rig exists, and every child
// part with a box has a bone of its name or a hinge the rig declares. A part
// renamed or added in the Designer sends the whole enemy back to blocks.
export function rigFits(root) {
  if (!kit) return false;
  const id = root.specTop && root.specTop.id;
  const rig = id && kit.rigs[id];
  if (!rig) return false;
  const bones = new Set();
  rig.traverse((o) => { if (o.isBone) bones.add(nameOf(o)); });
  const hinges = HINGES[id] || [];
  const ok = (e) => e.children.every((c) => (!c.spec.visual || bones.has(c.id) || hinges.includes(c.id)) && ok(c));
  return ok(root);
}

// The Shell, per root: white, tinted per bone from `parts` (rgb = tint,
// a = hit flash), glowing faintly in each part's colour, and lit red over the
// whole hull by `tele` while anything telegraphs.
function shellFor(src, n) {
  const m = src.clone();
  m.color.set(0xffffff);
  m.emissive.set(0x000000);
  const parts = { value: Array.from({ length: n }, () => new THREE.Vector4(1, 1, 1, 0)) };
  const tele = { value: new THREE.Color(0, 0, 0) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uParts = parts;
    sh.uniforms.uTele = tele;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\nuniform vec4 uParts[${n}];\nvarying vec4 vPart;`)
      .replace("#include <skinning_vertex>", "#include <skinning_vertex>\n  vPart = uParts[int(skinIndex.x + 0.5)];");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uTele;\nvarying vec4 vPart;")
      .replace("#include <color_fragment>", "#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb * vPart.rgb, vec3(1.0), vPart.a);")
      .replace("#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n  totalEmissiveRadiance += vPart.rgb * 0.18 * (1.0 - vPart.a) + uTele + vec3(0.7 * vPart.a);");
  };
  m.customProgramCacheKey = () => `enemyShell${n}`;
  m.userData.parts = parts;
  m.userData.tele = tele;
  return m;
}

// The model for one root, or null while the kit is not in.
export function makeRig(root) {
  if (!kit) return null;
  const id = root.specTop.id;
  const armature = cloneSkinned(kit.rigs[id]);
  const group = new THREE.Group(), body = new THREE.Group();
  group.add(body);
  body.add(armature);
  // The loader splits a two-material mesh into one skinned mesh per material,
  // each with its own skeleton over the same bones.
  const bones = {}, meshes = [];
  armature.traverse((o) => {
    if (o.isBone) bones[nameOf(o)] = { b: o, p: o.position.clone() };
    if (o.isSkinnedMesh) meshes.push(o);
    if (o.isMesh) o.frustumCulled = false; // skinned: rest-pose bounds lie
  });
  let shell = null, skeleton = null;
  for (const mesh of meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.material = mats.map((m) => {
      if (m.name !== "Shell") return m;
      skeleton = mesh.skeleton;
      return (shell = shellFor(m, skeleton.bones.length));
    });
    if (mesh.material.length === 1) mesh.material = mesh.material[0];
  }

  // Which part each bone belongs to: the nearest ancestor bone named after a
  // part, else the root. Read per frame for the part's colour and flash.
  const partIds = new Set();
  const walk = (e) => { for (const c of e.children) { partIds.add(c.id); walk(c); } };
  walk(root);
  const boneParts = skeleton.bones.map((b) => {
    for (let x = b; x && x.isBone; x = x.parent) if (partIds.has(nameOf(x))) return nameOf(x);
    return null;
  });

  // The moth's wings: a hinge at each wing's root, the left one mirrored. Each
  // wing has its own Shell, tinted and flashed like a block part.
  const wings = [];
  for (const c of root.children) {
    if (!(HINGES[id] || []).includes(c.id)) continue;
    const hinge = new THREE.Group(), w = kit.wing.clone();
    const side = Math.sign((c.spec.at || [0, 0])[0]) || 1;
    hinge.add(w);
    hinge.scale.x = side;
    w.position.set(c.w / 2, 0, 0);
    const wm = [];
    w.traverse((o) => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      o.material = list.map((m) => {
        if (m.name !== "Shell") return m;
        const s = m.clone();
        s.userData.base = setColor(new THREE.Color(), c.color);
        s.userData.glow = s.userData.base.clone().multiplyScalar(0.18);
        wm.push(s);
        return s;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
    group.add(hinge);
    wings.push({ id: c.id, hinge, side, at: c.spec.at || [0, 0], w: c.w, mats: wm });
  }

  return {
    root: group, body, bones, shell, skeleton, boneParts, wings,
    natural: NATURAL[id] || [root.w, root.h],
    id,
    state: {}, // the animation's own clock, never on an entity
    // disposeTree frees materials, not a skeleton's bone texture.
    dispose: () => { for (const m of meshes) m.skeleton.dispose(); },
  };
}

// Per frame: each bone's tint and flash from its part; a dead or disabled
// part's bone collapsed; the whole hull red while anything telegraphs.
const RED = new THREE.Color("#ff4a3a");
const scratch = new THREE.Color();
export function paintRig(v, root, partsById, telegraph, time) {
  const table = v.shell.userData.parts.value;
  for (let i = 0; i < table.length; i++) {
    const e = (v.boneParts[i] && partsById.get(v.boneParts[i])) || root;
    setColor(scratch, e.color);
    table[i].set(scratch.r, scratch.g, scratch.b, e.hitFlash > 0 ? 1 : 0);
  }
  const pulse = telegraph ? 0.5 + 0.5 * Math.sin(time * 26) : 0;
  v.shell.userData.tele.value.copy(RED).multiplyScalar(telegraph ? 0.35 + pulse * 0.65 : 0);
  for (const [id, e] of partsById) {
    const B = v.bones[id];
    if (B && (!e.alive || e.disabled)) B.b.scale.setScalar(0.001);
  }
  return pulse;
}

// The bone poser: every bone back to rest, the body to identity, then setters.
// Units are model pixels in the model's own frame (x forward, y up).
export function poser(v) {
  const B = v.bones;
  v.body.position.set(0, 0, 0); v.body.rotation.set(0, 0, 0); v.body.scale.set(1, 1, 1);
  for (const { b, p } of Object.values(B)) { b.position.copy(p); b.rotation.set(0, 0, 0); b.scale.setScalar(1); }
  return {
    rot: (n, z, y = 0, x = 0) => B[n]?.b.rotation.set(x, y, z),
    scale: (n, k) => B[n]?.b.scale.setScalar(k),
    scaleX: (n, k) => B[n]?.b.scale.set(k, 1, 1),
    quat: (n, q) => B[n]?.b.quaternion.copy(q),
    move: (n, dx, dy) => B[n]?.b.position.set(B[n].p.x + dx, B[n].p.y + dy, B[n].p.z),
    yaw: (r) => { v.body.rotation.y += r; },
    lift: (d) => { v.body.position.y += d; },
    shift: (d) => { v.body.position.x += d; },
    tilt: (r) => { v.body.rotation.z += r; },
    roll: (r) => { v.body.rotation.x += r; },
    squash: (sx, sy) => v.body.scale.set(sx, sy, sx),
  };
}

// Two-bone IK in the screen plane: put the ankle at (gx, gy) in the MODEL's
// frame (where the ground is fixed), whatever the body is doing, knee forward
// as built; the ankle bone then holds the foot at `pitch` from level. `rig`
// is the leg's rest geometry and bone names.
const ang = (p) => Math.atan2(p.y, p.x);
export function legIK(P, body, rig, side, gx, gy, pitch) {
  const { hip, knee, ankle } = rig;
  const [legB, shinB, footB] = rig.names(side);
  const c = Math.cos(-body.rotation.z), s = Math.sin(-body.rotation.z);
  const lx = gx - body.position.x, ly = gy - body.position.y;
  const T = { x: c * lx - s * ly - hip.x, y: s * lx + c * ly - hip.y };
  const L1 = Math.hypot(knee.x - hip.x, knee.y - hip.y), L2 = Math.hypot(ankle.x - knee.x, ankle.y - knee.y);
  const d = Math.min(Math.hypot(T.x, T.y), L1 + L2 - 0.01);
  const bend = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const thigh = ang(T) + bend; // the knee sits counter-clockwise: forward
  const K = { x: L1 * Math.cos(thigh), y: L1 * Math.sin(thigh) };
  const hipRot = thigh - ang({ x: knee.x - hip.x, y: knee.y - hip.y });
  const shinRot = ang({ x: T.x - K.x, y: T.y - K.y }) - ang({ x: ankle.x - knee.x, y: ankle.y - knee.y }) - hipRot;
  P.rot(legB, hipRot);
  P.rot(shinB, shinRot);
  P.rot(footB, pitch - hipRot - shinRot - body.rotation.z);
}

// Both feet planted where they stand at rest, whatever the body is doing.
export function stand(P, v, rig) {
  for (const side of rig.sides) legIK(P, v.body, rig, side, rig.ankle.x, rig.ankle.y, 0);
}

// A planted walk at phase `ph` (0..1 per cycle): each foot plants and slides
// back for `stance` of the cycle, then lifts and swings forward; the far leg
// is half a cycle behind.
export function walk(P, v, rig, ph, { stance, stride, lift, pitch }) {
  rig.sides.forEach((side, i) => {
    const p = (ph + i * 0.5) % 1;
    let dx, up = 0, pt = 0;
    if (p < stance) {
      dx = stride * (0.5 - p / stance);
      pt = p > stance - 0.15 ? -pitch * (p - stance + 0.15) / 0.15 : 0;
    } else {
      const u = (p - stance) / (1 - stance), e = u * u * (3 - 2 * u);
      dx = stride * (e - 0.5);
      up = lift * Math.sin(Math.PI * u);
      pt = -pitch * (1 - u) + pitch * 0.5 * Math.sin(Math.PI * u);
    }
    legIK(P, v.body, rig, side, rig.ankle.x + dx, rig.ankle.y + up, pt);
  });
}
