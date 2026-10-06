// ---------------------------------------------------------------------------
// GRAPHICS TESTER — the enemy roster, re-modelled (looks, not yet the game's).
//
// Model: src/mission/view3d/models/enemies.glb (built by models/enemies.py):
// one armature per enemy, named by spec id, with ONE rigidly skinned mesh
// (Shell + Detail, two draw calls). Every bone's local axes are the world's, so rotation.z swings a
// part in the screen plane. The Iron Moth's wing is a separate unskinned mesh,
// mirrored here for the left wing.
//
// Sizes, colours and the moth's wing offsets come from the game's own enemy
// list (ENEMY_FILE), so each model stands in the box its spec gives it. The Shell takes the
// spec colour — per PART for enemies whose bones are named after their spec's
// child parts (the Assault Bot, the Siege Automaton). Telegraph and muzzle
// glows are the game's own `cues`, except where an enemy has its own effects
// in FX (enemy-fx.js: shots, missiles, drones, jets, dust, explosions).
// "Game model beside it" draws the block look next to each one with the
// game's createEnemies.
//
// PROMOTED enemies (tech/mission-3d-enemies.md M6 on) are the game's now: their
// rig and motion live in src/mission/view3d/enemyrig.js + enemyanim.js, and
// this file only scripts a real root per mode — box, facing, telegraph, fire
// count — runs the game's motion record over it and draws it with the game's
// createEnemies. ANIM/FX/SOCKETS below keep only the enemies not promoted yet.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ENEMY_FILE } from "../src/game/enemyspecs.js";
import { createEnemies, cues } from "../src/mission/view3d/enemy.js";
import { setColor, viewY } from "../src/mission/view3d/util.js";
import { hasMotion } from "../src/mission/view3d/enemyanim.js";
import { instantiate } from "../src/mission/enemyspec/runtime.js";
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { createMotion } from "../src/mission/enemyspec/motion.js";
import { createFx } from "./enemy-fx.js";

const SPECS = ENEMY_FILE.map((r) => r.spec);
const isFlying = (s) => s.root.tags?.includes("flying") || s.root.motion?.type === "hover";
const nameOf = (o) => o.userData.name ?? o.name;
const boxOf = (s) => [s.root.body?.w ?? s.root.visual.size[0], s.root.body?.h ?? s.root.visual.size[1]];
// Drawn by the game's own rig and motion (see the header).
const promoted = (s) => hasMotion(s.id);
// A promoted enemy's fight, per mode, as data: one cycle of `len` seconds,
// replayed. The game draws it from these fields alone, as it would a real one.
//   act   [id, windup end, steps end]: the committed action and its phases
//   tele  [[t0, t1, part?]]: telegraph windows (the root unless named)
//   fire  { part: [times] }: rounds
//   run   [[t0, t1, px/s]]: treadmill speed (move mode runs at the spec's)
//   air   [t0, t1, height]: a jump's arc
const GENERIC_ATTACK = { len: 2, tele: [[0, 0.6]], fire: { root: [0.6] } };
const SCRIPT = {
  husk_charger: { attack: { len: 2, tele: [[0, 0.6]], run: [[0.6, 1.1, 520]] } },
  breach_hopper: {
    attack: { len: 1.6, act: ["rifleBurst", 0.25, 0.42], tele: [[0, 0.25]], fire: { gunArm: [0.25, 0.33, 0.41] } },
    punch: { len: 1.4, act: ["punchCombo", 0.18, 0.5], tele: [[0, 0.18]], fire: { fistArm: [0.18, 0.49] } },
    leap: { len: 3, act: ["screenLeap", 0.48, 2.27], tele: [[0, 0.48], [1.9, 2.1]], air: [0.48, 1.68, 125],
      run: [[0.48, 1.68, 300]], fire: { gunArm: [2.1, 2.18, 2.26] } },
  },
};

export const ENEMY_SUBJECTS = [
  ...SPECS.map((s) => ({ id: s.id, label: s.name })),
  { id: "lineup", label: "Enemy lineup" },
];
export const isEnemySubject = (id) => ENEMY_SUBJECTS.some((s) => s.id === id);

export const ENEMY_ANIMS = {
  idle:   { label: "Idle" },
  move:   { label: "Move" },
  attack: { label: "Attack (telegraph + fire)" },
};
// Enemies with more to show than one attack. The lineup keeps the three above.
const MORE_ANIMS = {
  floating_factory: { idle: { label: "Hover" }, move: { label: "Drift" }, attack: { label: "Build + launch a drone" } },
  breach_hopper: { attack: { label: "Rifle burst" }, punch: { label: "Punch combo" }, leap: { label: "Screen leap" } },
  siege_automaton: {
    attack: { label: "Cannon burst" }, missiles: { label: "Missile volley" },
    jump: { label: "Jump barrage" }, death: { label: "Destroyed" },
  },
};
export const enemyAnims = (id) => ({ ...ENEMY_ANIMS, ...MORE_ANIMS[id] });
// Seconds per cycle of a mode, where it is not the generic ATTACK.
const PERIOD = {
  floating_factory: { attack: 4.2 },
  breach_hopper: { attack: 1.6, punch: 1.4, leap: 3.0 },
  siege_automaton: { attack: 2.2, missiles: 3.6, jump: 3.4, death: 7.0 },
};
// Extra height a mode leaps to, so the camera frames it.
const HEADROOM = { breach_hopper: { leap: 130 }, siege_automaton: { jump: 120, death: 60, missiles: 110 } };
// Modes whose shots fly to the soldier: the camera takes him in too.
const FRAME_TARGET = { floating_factory: { attack: true }, siege_automaton: { missiles: true } };

// Effect sockets: [bone, point in the model's Blender coordinates] (models/
// enemies.py: +X facing, -Y towards the camera, +Z up). Resolved to the bone's
// own frame at load, so a socket rides its bone and the facing flip.
const SOCKETS = {
  breach_hopper: {
    muzzle: ["gunArm", [43.5, -13.5, 4.3]], eject: ["gunArm", [20, -16, 7]], knuckles: ["fist", [19, 13, 14]],
    jetL: ["jets", [-16.6, 6, 0.4]], jetR: ["jets", [-16.6, -6, 0.4]], visor: ["head", [10, -2, 30.5]],
    footL: ["leftFoot", [2, 7, -39]], footR: ["rightFoot", [2, -7, -39]], port: ["root", [3, -11.2, -2.5]],
  },
  siege_automaton: {
    muzzle: ["cannonBarrel", [81, -34, 8]], charge: ["cannonBarrel", [77.5, -34, 8]], cannonMid: ["cannonArm", [34, -34, 8]],
    shoulder: ["root", [8, -30, 30]], tubeL: ["missilePack", [6, -14, 53]], tubeR: ["missilePack", [38, -14, 53]],
    pack: ["missilePack", [22, -24, 40]], arming: ["missilePack", [44, -24.8, 44]], core: ["core", [4, -24.5, 8]],
    stackA: ["root", [-30, 9, 53]], stackB: ["root", [-30, -9, 53]], eyes: ["head", [19.5, -8, 60]],
    footL: ["leftFoot", [4, 17, -82]], footR: ["rightFoot", [4, -17, -82]], head: ["head", [0, -10, 62]],
    finger: ["leftIndex", [12.4, 25.5, -52.5]], hip: ["root", [0, -14, -27]], chest: ["root", [10, -22, 26]],
  },
  floating_factory: {
    stack1: ["root", [-36, 4, 33]], stack2: ["root", [-25, 4, 33]], bay: ["root", [2, -4, -15]], hook: ["crane", [2, 0, -24]],
    weld: ["crane", [2, -6, -15]], thrBn: ["thrB", [-36, -15, -26]], thrBf: ["thrB", [-36, 15, -26]],
    thrFn: ["thrF", [32, -15, -26]], thrFf: ["thrF", [32, 15, -26]], mast: ["root", [30, 0, 42.4]],
    nose: ["root", [47.5, -2, 1]], tailN: ["root", [-50.5, -10, 4]], tailF: ["root", [-50.5, 10, 4]],
    window: ["root", [-26, -21, 4]], bridge: ["root", [22, -9, 24.5]],
    ...Object.fromEntries([-14, -10, -6, -2, 2].map((x, i) => [`cap${i}`, [`pis${i}`, [x, -4, 25]]])),
  },
};

const ATTACK = 2;        // s, one attack cycle
const WINDUP = 0.6;      // s of it spent telegraphing
const FLASH = 0.08;      // s the muzzle glow stays lit
const GAP = 46;          // px between models in the lineup

export function createEnemyModels(scene, { groundY, soldierX, fx: withFx = true }) {
  const models = {};     // id -> { group, body, bones, wings?, sockets?, rest? }
  let subject = null, mode = "move", t = 0, loaded = false;
  const old = createEnemies(scene, { rigs: false });
  // The promoted enemies: one real root each, scripted per mode, its record
  // kept by the game's motion module and drawn by the game's view.
  const game = createEnemies(scene);
  const motion = createMotion();
  const roots = {}, odo = {};
  for (const s of SPECS) if (promoted(s)) roots[s.id] = instantiate(normalizeSpec(s), 0, 0);
  // The record's ground: one endless floor at the tester's ground line.
  const FLOOR = [{ x: -1e6, y: groundY, w: 2e6, h: 40 }];
  // The effects, and what they aim at: the tester's soldier (30x46 on the ground).
  const fx = createFx(scene);
  fx.setFloor(viewY(groundY));
  fx.setTarget({ x0: soldierX, x1: soldierX + 30, y0: viewY(groundY), y1: viewY(groundY - 46) });
  const TARGET = new THREE.Vector3(soldierX + 15, viewY(groundY - 24), 0);
  // The same soldier as the game sees one, for the game's aim.
  const TARGET_ENT = { alive: true, x: soldierX, y: groundY - 46, w: 30, h: 46 };
  let drone = null, missile = null; // loose models the effects clone

  // One fake entity per enemy (and per moth wing): a box in game coordinates,
  // the fields the game's createEnemies and cues read.
  const ents = {}, oldEnts = {};
  const fake = (visual, extra = {}) => ({
    spec: { visual }, x: 0, y: 0, w: visual.size[0], h: visual.size[1], facing: 1,
    alive: true, disabled: false, isRoot: true, maxHealth: 1, children: [], spawned: [],
    hitFlash: 0, telegraph: 0, muzzleFlash: 0, burn: null, ...extra,
  });
  for (const s of SPECS) {
    for (const bag of [ents, oldEnts]) {
      const [w, h] = boxOf(s);
      const e = fake(s.root.visual, { w, h, muzzleColor: Object.values(s.root.emitters || {})[0]?.projectile?.color });
      e.children = (s.root.children || []).map((c) => fake(c.visual, { at: c.at, isRoot: false }));
      bag[s.id] = e;
    }
  }

  // --- layout: where each box sits ----------------------------------------
  // Walkers stand on the ground; flyers hover. Width includes the moth's wings.
  const span = (s) => Math.max(boxOf(s)[0], ...(s.root.children || []).map((c) => 2 * Math.abs(c.at[0]) + c.visual.size[0]));
  const lift = (s) => (s.role === "boss" ? 150 : isFlying(s) ? 90 : 0);
  function place(e, s, cx, raise = 0) {
    e.x = cx - e.w / 2;
    e.y = groundY - lift(s) - raise - e.h;
    for (const c of e.children) { c.x = cx + c.at[0] - c.w / 2; c.y = e.y + e.h / 2 + c.at[1] - c.h / 2; }
  }
  const shown = () => (subject === "lineup" ? SPECS : SPECS.filter((s) => s.id === subject));
  let frameC = new THREE.Vector3(), frameHalf = 150;
  function layout(compare) {
    const list = shown();
    if (!list.length) return;
    const total = list.reduce((a, s) => a + span(s), 0) + GAP * (list.length - 1);
    let x = soldierX - 70 - total;
    let top = Infinity, bottom = -Infinity;
    for (const s of list) {
      const cx = x + span(s) / 2;
      place(ents[s.id], s, cx);
      // The game's model: beside it on its own, a row above it in the lineup.
      if (subject === "lineup") place(oldEnts[s.id], s, cx, 150);
      else place(oldEnts[s.id], s, cx - span(s) - GAP);
      const room = subject === "lineup" ? 0 : HEADROOM[s.id]?.[mode] ?? 0;
      for (const e of compare ? [ents[s.id], oldEnts[s.id]] : [ents[s.id]]) {
        top = Math.min(top, e.y - (s.role === "boss" ? 40 : 10) - room);
        bottom = Math.max(bottom, subject === "lineup" ? groundY : e.y + e.h + 10);
      }
      x += span(s) + GAP;
    }
    const left = compare && subject !== "lineup" ? x - total - span(list[0]) - GAP * 2 : x - total - GAP;
    let right = x;
    if (subject !== "lineup" && FRAME_TARGET[subject]?.[mode]) { right = Math.max(x, soldierX + 50); bottom = Math.max(bottom, groundY + 10); }
    frameC = new THREE.Vector3((left + right) / 2, viewY((top + bottom) / 2), 0);
    frameHalf = Math.max(subject === "lineup" ? 120 : 60, (bottom - top) / 2 + 30, (right - left) / 2 / 1.4 + 20);
  }

  // --- the models -----------------------------------------------------------
  new GLTFLoader().load(new URL("../src/mission/view3d/models/enemies.glb", import.meta.url).href, (gltf) => {
    const wingSrc = gltf.scene.getObjectByName("iron_moth_wing");
    drone = gltf.scene.getObjectByName("factory_drone");
    missile = gltf.scene.getObjectByName("seeker_missile");
    const factory = SPECS.find((s) => s.id === "floating_factory"), siege = SPECS.find((s) => s.id === "siege_automaton");
    if (drone && factory) tint(drone, factory.defs.drone.visual.color);
    if (missile && siege) tint(missile, siege.defs.seekerMissile.visual.color);
    for (const s of SPECS) {
      const rig = gltf.scene.getObjectByName(s.id);
      if (!rig || promoted(s)) continue;
      const group = new THREE.Group(), body = new THREE.Group();
      group.add(body);
      body.add(rig);
      const bones = {};
      rig.traverse((o) => {
        // The loader suffixes repeated node names (head, head_1...); bones go by
        // the name Blender gave them.
        if (o.isBone) bones[nameOf(o)] = { b: o, p: o.position.clone() };
        if (o.isMesh) o.frustumCulled = false; // skinned: rest-pose bounds lie
      });
      const parts = (s.root.children || []).filter((c) => bones[c.id]);
      if (parts.length) tintParts(rig, s, parts);
      else tint(rig, s.root.visual.color);
      const m = { group, body, bones, spec: s, prevA: -1 };
      // Sockets and rest heads, read in the rest pose with the group at the origin.
      group.updateMatrixWorld(true);
      if (SOCKETS[s.id]) {
        m.sockets = {};
        for (const [k, [bn, [x, y, z]]] of Object.entries(SOCKETS[s.id])) {
          const b = bones[bn]?.b;
          if (b) m.sockets[k] = { b, local: b.worldToLocal(new THREE.Vector3(x, z, -y)) };
        }
        m.rest = Object.fromEntries(Object.entries(bones).map(([n, { b }]) => [n, b.getWorldPosition(new THREE.Vector3())]));
      }
      const loose = (s.root.children || []).filter((c) => !bones[c.id]);
      if (loose.length) {
        // The moth's wings: a hinge at each wing's root, the left one mirrored.
        m.wings = loose.map((c) => {
          const hinge = new THREE.Group(), w = wingSrc.clone();
          hinge.add(w);
          const side = Math.sign(c.at[0]);
          hinge.scale.x = side;
          w.position.set(c.visual.size[0] / 2, 0, 0);
          tint(w, c.visual.color);
          group.add(hinge);
          return { hinge, child: c, side };
        });
      }
      group.visible = false;
      scene.add(group);
      models[s.id] = m;
    }
    loaded = true;
  }, undefined, (e) => { throw new Error(`enemies.glb: ${e.message ?? e}`); });

  // Per-part Shell colour: each vertex takes the colour of the spec part its
  // bone (or the nearest ancestor bone) is named after, else the root's.
  function tintParts(rig, s, parts) {
    const colour = Object.fromEntries(parts.map((c) => [c.id, c.visual.color]));
    rig.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const si = o.geometry.attributes.skinIndex, col = new Float32Array(si.count * 3), cache = new Map();
      const of = (b) => {
        for (let x = b; x?.isBone; x = x.parent) if (colour[nameOf(x)]) return colour[nameOf(x)];
        return s.root.visual.color;
      };
      for (let i = 0; i < si.count; i++) {
        const b = o.skeleton.bones[si.getX(i)];
        if (!cache.has(b)) cache.set(b, setColor(new THREE.Color(), of(b)));
        const c = cache.get(b);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      o.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = mats.map((m) => {
        if (m.name !== "Shell") return m;
        const c = m.clone();
        c.color.set(0xffffff);
        c.vertexColors = true;
        setColor(c.emissive, s.root.visual.color).multiplyScalar(0.12);
        return c;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
  }

  function tint(obj, css) {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = mats.map((m) => {
        if (m.name !== "Shell") return m;
        const c = m.clone();
        setColor(c.color, css);
        // The game's hulls glow faintly in their own colour (enemy.js).
        c.emissive.copy(c.color).multiplyScalar(0.18);
        return c;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
  }

  // --- animation ------------------------------------------------------------
  // Per enemy: (bone setter, time, mode, attack phase) -> poses for this frame.
  // `a` runs 0..ATTACK; the shot is at WINDUP. `kick` decays after the shot.
  const ANIM = {
    // Hovers on four thruster pods; drifting tips the pods back. The five
    // deck pistons rise one by one toward the next launch. Building a drone: the bay doors swing down, the crane lowers
    // the new drone and lets it go, the doors close.
    floating_factory(P, t, mode, a) {
      P.lift(Math.sin(t * 1.7) * 8);
      P.tilt(Math.cos(t * 1.7) * 0.025 + (mode === "move" ? -0.05 : 0));
      P.roll(Math.sin(t * 0.9) * 0.05);
      const { fill } = droneProgress(mode, a, t);
      for (let i = 0; i < 5; i++) P.move(`pis${i}`, 0, 6 * smooth(0, 1, fill * 5 - i));
      const push = mode === "move" ? -0.4 : 0;
      P.rot("thrB", push + Math.sin(t * 1.3) * 0.08);
      P.rot("thrF", push + Math.sin(t * 1.3 + 1) * 0.08);
      if (mode === "attack") {
        const door = a < 0.6 ? smooth(0, 0.6, a) : a < 2.4 ? 1 : 1 - smooth(2.4, 3.0, a);
        P.rot("doorB", -1.35 * door);
        P.rot("doorF", 1.35 * door);
        const drop = a < 0.6 ? 0 : a < 1.6 ? smooth(0.6, 1.5, a) : 1 - smooth(1.7, 2.4, a);
        P.move("crane", 0, -9 * drop);
        P.tilt(a > 1.6 && a < 2.0 ? -0.04 * Math.sin((a - 1.6) / 0.4 * Math.PI) : 0); // the release lifts the nose
      }
    },

    // A walking siege engine. Stomps; the cannon charges and fires four with the
    // far hand bracing it (armIK); pointing at the target with a red beam, the
    // missile pod opens and looses two pairs; the jump barrage leaps, fans the
    // cannon and fires both tubes in the air; destroyed, the pod and the cannon
    // blow off, the core overloads, and it comes apart.
    siege_automaton(P, t, mode, a, kick, m, k) {
      let gun = -0.12, swing = 0, lid = 0, crouch = 0, air = 0, brace = 0, point = 0;
      P.scale("core", 1 + 0.06 * Math.sin(t * 3));
      P.rot("head", Math.sin(t * 0.9) * 0.03, Math.sin(t * 0.45) ** 3 * 0.3);
      if (mode === "idle") {
        P.lift(Math.sin(t * 1.2) * 0.8);
        gun += Math.sin(t * 0.9) * 0.03;
        swing = 0.3 + Math.sin(t * 0.8) * 0.03;
        stand(P, m, SIEGE);
      } else if (mode === "move") {
        const ph = (t / SIEGE.T) % 1;
        const bob = (1 - Math.cos(ph * 4 * Math.PI)) / 2;
        P.lift(-2.5 + 3.5 * bob);
        P.tilt(-0.045 + 0.02 * Math.sin(ph * 2 * Math.PI));
        P.roll(0.03 * Math.sin(ph * 2 * Math.PI));
        P.rot("head", 0.02 * Math.sin(ph * 4 * Math.PI), Math.sin(t * 0.45) ** 3 * 0.3);
        gun = -0.16 + 0.04 * Math.sin(ph * 2 * Math.PI);
        swing = 0.25 - 0.14 * Math.sin(ph * 2 * Math.PI);
        walk(P, m, SIEGE, ph, { stance: 0.62, stride: 34, lift: 11, pitch: 0.35 });
      } else if (mode === "attack") {
        const up = smooth(0, 0.3, a) * (1 - smooth(1.4, 1.9, a));
        const shots = [0.38, 0.49, 0.6, 0.71], rec = recoil(a, shots, 0.1);
        gun = -0.12 + up * (0.12 + k.aim(8, 30)) + 0.06 * rec;
        P.move("cannonBarrel", -7 * rec, 0);
        P.shift(-1.4 * rec); P.tilt(0.012 * rec);
        brace = smooth(0.05, 0.35, a) * (1 - smooth(1.3, 1.8, a));
        stand(P, m, SIEGE);
      } else if (mode === "missiles") {
        lid = smooth(0, 0.4, a) * (1 - smooth(1.8, 2.4, a));
        const rec = recoil(a, [0.7, 0.88], 0.2);
        P.rot("missilePack", -0.07 * rec);
        P.tilt(0.015 * rec); P.lift(-1.2 * rec);
        point = smooth(0.05, 0.4, a) * (1 - smooth(1.9, 2.5, a));
        stand(P, m, SIEGE);
      } else if (mode === "jump") {
        // 0-0.5 crouch, 0.5-1.7 airborne (cannon fan at 0.74, tubes at 0.94), land.
        crouch = smooth(0, 0.45, a) * (a < 0.5 ? 1 : 0) + (a >= 1.7 ? bump(1.7, 2.3, a) : 0);
        let tuck = 0;
        if (a >= 0.5 && a < 1.7) { const u = (a - 0.5) / 1.2; air = 115 * 4 * u * (1 - u); tuck = Math.sin(u * Math.PI); }
        P.lift(air - 14 * crouch);
        P.tilt(-0.08 * crouch + 0.05 * tuck);
        const up = smooth(0.5, 0.7, a) * (1 - smooth(1.3, 1.7, a));
        const rec = recoil(a, [0.74], 0.15);
        gun = -0.12 - 0.15 * crouch + up * (0.12 + k.aim(8, 30)) + 0.1 * rec;
        P.move("cannonBarrel", -7 * rec, 0);
        lid = smooth(0.55, 0.8, a) * (1 - smooth(1.3, 1.7, a));
        swing = 0.7 * tuck;
        if (air > 0) {
          for (const side of ["right", "left"]) {
            legIK(P, m.body, SIEGE, side, SIEGE.ankle.x + 4 * tuck, SIEGE.ankle.y + m.body.position.y + 12 * tuck, -0.2 * tuck);
          }
        } else stand(P, m, SIEGE);
      } else if (mode === "death") {
        siegeDeath(P, m, a);
        return;
      }
      P.rot("cannonArm", gun);
      P.rot("packLid", 1.15 * lid);
      P.rot("leftArm", swing);
      P.rot("leftFore", 0.35 + (mode === "jump" ? -0.3 * swing : 0));
      if (brace > 0) {
        // The far hand on top of the cannon, riding its aim and its kick.
        const C = m.rest.cannonArm, R = (v) => v.sub(C).applyAxisAngle(Z, gun).add(C);
        armIK(P, m, R(V(44, 32, 27)), V(0, -1, -0.7), V(0.45, -0.9, 0.15).applyAxisAngle(Z, gun), brace, 0.9);
      } else if (point > 0) {
        // Pointing out the target with the whole arm, finger straight.
        const S = m.rest.leftArm, ang = k.aim(S.x, S.y);
        const dir = V(Math.cos(ang), Math.sin(ang), 0.3).normalize();
        armIK(P, m, S.clone().addScaledVector(dir, 66), V(0, -1, -0.4), dir, point, 0);
      }
    },
  };

  // Two-bone IK for the Siege Automaton's far arm, in the body frame (three's
  // axes): the wrist at T, the elbow bent toward `pole`, the fingers along
  // `hand`. Every bone is identity at rest, so each solved rotation is blended
  // from rest by `w`. `curl` bends the index finger in.
  const Z = new THREE.Vector3(0, 0, 1);
  function armIK(P, m, T, pole, hand, w, curl) {
    const S = m.rest.leftArm, E0 = m.rest.leftFore, W0 = m.rest.leftHand, F0 = m.rest.leftIndex;
    const L1 = E0.distanceTo(S), L2 = W0.distanceTo(E0);
    const n = T.clone().sub(S), d = Math.min(n.length(), L1 + L2 - 0.5);
    n.normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const side = pole.clone().addScaledVector(n, -pole.dot(n)).normalize();
    const E = S.clone().addScaledVector(n, a).addScaledVector(side, h), W = S.clone().addScaledVector(n, d);
    const qa = new THREE.Quaternion().setFromUnitVectors(E0.clone().sub(S).normalize(), E.clone().sub(S).normalize());
    const inv = qa.clone().invert();
    const qb = new THREE.Quaternion().setFromUnitVectors(W0.clone().sub(E0).normalize(), W.clone().sub(E).normalize().applyQuaternion(inv));
    const qh = new THREE.Quaternion().setFromUnitVectors(F0.clone().sub(W0).normalize(), hand.clone().normalize());
    const qc = qa.clone().multiply(qb).invert().multiply(qh);
    const I = new THREE.Quaternion();
    P.quat("leftArm", I.clone().slerp(qa, w));
    P.quat("leftFore", I.clone().slerp(qb, w));
    P.quat("leftHand", I.clone().slerp(qc, w));
    P.rot("leftIndex", curl * w);
  }

  // The next drone's progress, 0..1, and whether it is ready. Building: the
  // pistons rise over 85% of the cycle from one launch (at 1.6s) to the next,
  // then holds full and blinks until the drone goes. Hovering or drifting, it
  // runs on the spec's own 7s spawn loop.
  function droneProgress(mode, a, t) {
    const raw = mode === "attack" ? ((a - 1.6 + 4.2) % 4.2) / 4.2 : (t % 7) / 7;
    return { fill: Math.min(1, raw / 0.85), ready: raw >= 0.85 };
  }

  // --- the Siege Automaton coming apart ------------------------------------
  // Pod blown at 0.4, cannon at 1.0, the core overloads, everything goes at
  // 2.4; the hull falls back and burns; gone at 6.2, rebuilt at 7.
  const SIEGE_BLAST = 2.4;
  // bone: [time, vx, vy, spin] in px/s and rad/s in the group frame, then how
  // it lies once down: the bone head's height off the ground and its angle.
  // The spin is wound so the part arrives at that angle rather than snapping.
  const FLY = {
    missilePack: [0.4, -50, 300, 5, 4, 0], cannonArm: [1.0, 170, 160, -4, 34, 0],
    head: [SIEGE_BLAST, -70, 430, 5, 4, 0.35], leftArm: [SIEGE_BLAST, -230, 240, 3, 7, 1.5],
    leftLeg: [SIEGE_BLAST, -90, 140, 2.5, 9, -1.55], rightLeg: [SIEGE_BLAST, 110, 160, -2.5, 9, 1.55],
  };
  function siegeDeath(P, m, a) {
    const shudder = a < SIEGE_BLAST ? smooth(1.0, SIEGE_BLAST, a) : 0;
    P.shift((Math.random() - 0.5) * (0.6 + 4 * shudder));
    P.lift((Math.random() - 0.5) * 3 * shudder);
    P.scale("core", 1 + 0.6 * shudder + 0.15 * shudder * Math.sin(a * 40));
    P.rot("packLid", 0.4 * smooth(0, 0.3, a));
    P.rot("cannonArm", -0.2 * smooth(0.4, 0.9, a));
    stand(P, m, SIEGE);
    if (a >= SIEGE_BLAST) {
      // The hull falls back onto the ground.
      const u = smooth(SIEGE_BLAST, SIEGE_BLAST + 0.9, a);
      P.tilt(1.25 * u); P.lift(-52 * u); P.shift(-24 * u);
      P.scale("core", 0.001);
    }
    if (a >= 6.2) { P.scale("root", 0.001); return; }
    m.group.updateMatrixWorld(true);
    const g = -900, floorY = -m.spec.root.body.h / 2;
    for (const [bn, [t0, vx, vy, w, lieY, lieRot]] of Object.entries(FLY)) {
      if (a < t0) continue;
      const B = m.bones[bn];
      if (!B) continue;
      const dt = a - t0, rest = m.rest[bn];
      // When the head comes down to its lying height, and the turn that lands
      // it at its lying angle.
      const land = (-vy - Math.sqrt(vy * vy - 2 * g * (rest.y - floorY - lieY))) / g;
      const turns = Math.round((w * land - lieRot) / (2 * Math.PI)), w2 = (lieRot + turns * 2 * Math.PI) / land;
      let y = vy * dt + 0.5 * g * dt * dt, x = vx * dt, spin = w2 * dt;
      if (dt > land) { x = vx * land; y = floorY + lieY - rest.y; spin = lieRot; }
      const world = m.group.localToWorld(new THREE.Vector3(rest.x + x, rest.y + y, rest.z));
      B.b.position.copy(B.b.parent.worldToLocal(world));
      B.b.rotation.set(0, 0, spin - m.body.rotation.z);
    }
  }

  // Cycle helpers: 0..1 ease between two times, a 0..1..0 hump, keyframes,
  // and the recoil left by shots fired at `times`.
  function smooth(a, b, x) { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); }
  function bump(a, b, x) { return x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI); }
  function interp(keys, x) {
    for (let i = 1; i < keys.length; i++) {
      if (x <= keys[i][0]) {
        const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
        return v0 + (v1 - v0) * smooth(t0, t1, x);
      }
    }
    return keys[keys.length - 1][1];
  }
  function recoil(x, times, len) {
    let r = 0;
    for (const s of times) if (x >= s && x < s + len) r = Math.max(r, 1 - (x - s) / len);
    return r;
  }

  // Legs at rest (models/enemies.py), in the model's frame (x forward, y up),
  // with the bones each leg is made of, and the walk's cycle length.
  const named = (s) => [s + "Leg", s + "Shin", s + "Foot"];
  const BOT = { hip: { x: 0, y: -14 }, knee: { x: 5, y: -24 }, ankle: { x: -3, y: -33 }, names: named, T: 0.46 };
  const SIEGE = { hip: { x: 0, y: -30 }, knee: { x: 12, y: -54 }, ankle: { x: 2, y: -72 }, names: named, T: 1.6 };

  // Both feet planted where they stand at rest, whatever the body is doing.
  function stand(P, m, rig) {
    for (const side of ["right", "left"]) legIK(P, m.body, rig, side, rig.ankle.x, rig.ankle.y, 0);
  }
  // A planted walk: each foot plants and slides back for `stance` of the
  // cycle, then lifts and swings forward; the far leg is half a cycle behind.
  // The near (right) foot lands at phase 0, the far one at 0.5.
  function walk(P, m, rig, ph, { stance, stride, lift, pitch }) {
    for (const [side, off] of [["right", 0], ["left", 0.5]]) {
      const p = (ph + off) % 1;
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
      legIK(P, m.body, rig, side, rig.ankle.x + dx, rig.ankle.y + up, pt);
    }
  }
  const ang = (v) => Math.atan2(v.y, v.x);
  // Two-bone IK in the screen plane: put the ankle at (gx, gy) in the GROUP's
  // frame (where the ground is fixed), whatever the body is doing, knee forward
  // as built; the ankle bone then holds the foot at `pitch` from level.
  function legIK(P, body, rig, side, gx, gy, pitch) {
    const { hip, knee, ankle } = rig;
    const [legB, shinB, footB] = rig.names(side);
    const c = Math.cos(-body.rotation.z), s = Math.sin(-body.rotation.z);
    const lx = gx - body.position.x, ly = gy - body.position.y;
    const T = { x: c * lx - s * ly - hip.x, y: s * lx + c * ly - hip.y };  // target from the hip
    const L1 = Math.hypot(knee.x - hip.x, knee.y - hip.y), L2 = Math.hypot(ankle.x - knee.x, ankle.y - knee.y);
    const d = Math.min(Math.hypot(T.x, T.y), L1 + L2 - 0.01);
    const bend = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const thigh = ang(T) + bend;                                 // the knee sits counter-clockwise: forward
    const K = { x: L1 * Math.cos(thigh), y: L1 * Math.sin(thigh) };
    const hipRot = thigh - ang({ x: knee.x - hip.x, y: knee.y - hip.y });
    const shinRot = ang({ x: T.x - K.x, y: T.y - K.y }) - ang({ x: ankle.x - knee.x, y: ankle.y - knee.y }) - hipRot;
    P.rot(legB, hipRot);
    P.rot(shinB, shinRot);
    P.rot(footB, pitch - hipRot - shinRot - body.rotation.z);
  }

  function poser(m) {
    const B = m.bones;
    m.body.position.set(0, 0, 0); m.body.rotation.set(0, 0, 0); m.body.scale.set(1, 1, 1);
    for (const { b, p } of Object.values(B)) { b.position.copy(p); b.rotation.set(0, 0, 0); b.scale.setScalar(1); }
    return {
      rot: (n, z, y = 0, x = 0) => B[n]?.b.rotation.set(x, y, z),
      scale: (n, k) => B[n]?.b.scale.setScalar(k),
      scaleX: (n, k) => B[n]?.b.scale.set(k, 1, 1),
      quat: (n, q) => B[n]?.b.quaternion.copy(q),
      move: (n, dx, dy) => B[n]?.b.position.set(B[n].p.x + dx, B[n].p.y + dy, B[n].p.z),
      yaw: (r) => { m.body.rotation.y += r; },
      lift: (d) => { m.body.position.y += d; },
      shift: (d) => { m.body.position.x += d; },
      tilt: (r) => { m.body.rotation.z += r; },
      roll: (r) => { m.body.rotation.x += r; },
      squash: (sx, sy) => m.body.scale.set(sx, sy, sx),
    };
  }

  // --- effects, run after the pose -----------------------------------------
  // c: { fx, t, dt, mode, a, m, facing, hit(T) - the cycle passed T this frame,
  // every(p, off) - a beat of period p passed, at(socket) - world point,
  // dir(socket, x, y, z) - a bone-frame direction in the world }.
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pulse = (t) => 0.5 + 0.5 * Math.sin(t * 26);

  // A thruster's flame from a socket along a bone-frame direction: a white
  // core and three glows stepping down the plume.
  function flame(c, k, dx, dy, power, size, color = "#ffb070") {
    if (power <= 0.01) return;
    const p = c.at(k), d = c.dir(k, dx, dy, 0);
    c.fx.hold(p, size * 1.5 * Math.min(1.4, power), "#fff2d8", 0.9);
    for (let i = 1; i <= 3; i++) {
      c.fx.hold(p.clone().addScaledVector(d, size * 0.75 * i * power), size * (1.5 - i * 0.28) * power, i === 1 ? color : "#ff6a2a", 0.8 - i * 0.17);
    }
  }
  function shrapnel(fx, p, n, speed) {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
      fx.spark(p, V(Math.cos(ang), Math.sin(ang), rand(-0.15, 0.15)).multiplyScalar(speed),
        { gravity: 0, drag: 0, life: 1.25, size: 5.5, color: "#ffd24a", stretch: 0.014, bright: 2.6 });
    }
  }
  function rocks(fx, p, n, speed) {
    for (let i = 0; i < n; i++) {
      fx.chunk(p.clone().add(V(rand(-8, 8), 2, rand(-8, 8))), V(rand(-1, 1) * speed, rand(0.5, 1.2) * speed * 1.6, rand(-1, 1) * speed * 0.6),
        { size: [rand(1.5, 3.5), rand(1.5, 3), rand(1.5, 3)], color: Math.random() < 0.5 ? "#6b5a46" : "#4a3e31", life: 1.6 });
    }
  }
  const ground = (p) => V(p.x, viewY(groundY) + 1, p.z);

  const FX = {
    floating_factory(c) {
      const { fx, t, mode, a, m } = c;
      // Stack smoke, raked back while it drifts.
      if (c.every(0.07)) {
        for (const k of ["stack1", "stack2"]) {
          fx.smoke(c.at(k), V(rand(-6, 6) - (mode === "move" ? 30 : 0) * c.facing, rand(24, 40), rand(-4, 4)),
            { size: 5, grow: 28, life: rand(1.7, 2.6), color: Math.random() < 0.5 ? "#3b3632" : "#5a524b", op: 0.5, drag: 0.5, rise: 8, fadeIn: 0.15 });
        }
      }
      // The pods burn harder on the down-stroke of the hover.
      const thrust = 0.75 + 0.2 * Math.cos(t * 1.7) + (mode === "move" ? 0.15 : 0);
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
      // Each raised piston's cap lights; ready, they all blink.
      const { fill, ready } = droneProgress(mode, a, t);
      const on = ready ? (t * 4) % 1 < 0.5 : 1;
      for (let i = 0; i < 5; i++) if (fill * 5 >= i + 1 - 1e-6) fx.hold(c.at(`cap${i}`), 9, "#ffd27a", 0.75 * on);
      if (mode !== "attack") return;
      // Building: an amber strobe while the doors open, the furnace spilling
      // light out of the bay, welding sparks while the crane lowers the drone.
      if (a < 0.6) fx.hold(c.at("bay"), 34, "#ffb000", 0.3 + 0.5 * pulse(t) ** 2);
      if (a > 0.3 && a < 2.5) fx.hold(c.at("bay"), 56, "#ff8a2a", 0.45 * Math.min(1, (a - 0.3) / 0.3) * Math.min(1, (2.5 - a) / 0.3));
      if (a > 0.6 && a < 1.55 && Math.random() < 0.7) {
        const p = c.at("weld");
        fx.spark(p, V(rand(-90, 90), rand(-30, 140), rand(-60, 60)), { color: "#c8ecff", life: rand(0.15, 0.35), size: 1.1 });
        if (Math.random() < 0.3) fx.glow(p, V(), { size: 9, grow: 4, life: 0.05, color: "#d8f4ff", op: 1 });
      }
      if (drone && !m.held) { m.held = drone.clone(); scene.add(m.held); }
      if (m.held && a > 0.5 && a < 1.6) {
        m.held.visible = true;
        m.held.position.copy(c.at("hook"));
        m.held.rotation.set(0, (a - 0.5) ** 2 * 8, 0);
        if (a > 1.2) fx.hold(m.held.position.clone().add(V(0, -6, 0)), 10 * smooth(1.2, 1.6, a), "#ffb070", 0.8);
      }
      if (c.hit(1.6) && drone) {
        const p = c.at("hook");
        fx.glow(p, V(), { size: 10, grow: 30, life: 0.2, color: "#ffd166", op: 0.8 });
        fx.ring(p, { r0: 4, r1: 26, life: 0.3, color: "#ffd166", op: 0.7 });
        fx.homer(drone.clone(), p, V(0, -90, 0), { kind: "drone", speed: 170, turn: 2.2, life: 4, delay: 0.35,
          onEnd: (q) => fx.explosion(q, 22, { color: "#ffd166", shake: 1 }) });
      }
    },

    breach_hopper(c) {
      const { fx, t, mode, a } = c;
      fx.hold(c.at("visor"), 9, "#ff5a3c", 0.55 + 0.1 * Math.sin(t * 9));
      fx.hold(c.at("port"), 6, "#ff7657", 0.4);
      // Jets: pilot lights, a blast at launch, a braking burst before landing.
      let thrust = 0.16 + 0.04 * Math.sin(t * 40);
      if (mode === "leap") {
        if (a < 0.48) thrust = 0.16 + 0.5 * smooth(0.2, 0.48, a);
        else if (a < 0.9) thrust = 1.7 - (a - 0.48) * 2;
        else if (a > 1.35 && a < 1.68) thrust = 0.95;
        else if (a < 1.68) thrust = 0.15;
      }
      for (const k of ["jetL", "jetR"]) flame(c, k, -0.35, -1, thrust * (0.9 + 0.2 * Math.random()), 7);
      if (thrust > 0.6 && c.every(0.025)) {
        for (const k of ["jetL", "jetR"]) {
          const p = c.at(k), d = c.dir(k, -0.35, -1, 0);
          fx.smoke(p.clone().addScaledVector(d, 16), d.clone().multiplyScalar(rand(60, 140)).add(V(0, 0, rand(-20, 20))),
            { size: 6, grow: 26, life: rand(0.6, 1.0), color: "#8f8a84", op: 0.4, drag: 3 });
          fx.spark(p, d.clone().multiplyScalar(rand(200, 380)).add(V(rand(-40, 40), 0, rand(-40, 40))), { color: "#ffb070", life: 0.25, size: 1.2 });
        }
      }
      // Telegraphs flare the visor.
      const tele = mode === "attack" ? a < 0.25 : mode === "punch" ? a < 0.18
        : mode === "leap" ? (a > 0.3 && a < 0.48) || (a > 1.9 && a < 2.1) : false;
      if (tele) fx.hold(c.at("visor"), 30 + 6 * Math.sin(t * 26), "#ff5a5a", 0.65);
      // Rounds.
      const shots = mode === "attack" ? [0.25, 0.33, 0.41] : mode === "leap" ? [2.1, 2.18, 2.26] : [];
      for (const T of shots) {
        if (!c.hit(T)) continue;
        const p = c.at("muzzle"), d = c.dir("muzzle");
        fx.bolt(p, d.clone().multiplyScalar(620), { color: "#ffb449", w: 11, h: 5, life: 1.6 });
        fx.glow(p, V(), { size: 14, grow: 24, life: 0.07, color: "#fff0c0", op: 1 });
        fx.glow(p.clone().addScaledVector(d, 5), d.clone().multiplyScalar(60), { size: 10, grow: 18, life: 0.1, color: "#ffb449", op: 0.9 });
        fx.smoke(p, d.clone().multiplyScalar(40).add(V(0, 15, 0)), { size: 3, grow: 14, life: 0.6, color: "#9a948c", op: 0.3 });
        for (let i = 0; i < 4; i++) fx.spark(p, d.clone().multiplyScalar(rand(200, 400)).add(V(rand(-60, 60), rand(-60, 60), rand(-40, 40))), { color: "#ffd27a", life: 0.12, size: 1, gravity: 0 });
        fx.chunk(c.at("eject"), V(-c.facing * rand(30, 70), rand(120, 190), rand(-40, -10)), { size: [1.8, 0.8, 0.8], color: "#c9a24a", life: 1.3 });
      }
      // Punches: the punch's own box (36x24, 160 px/s, 0.16 s) as a hot glow
      // leaving the fist, a shock ring and sparks.
      if (mode === "punch") {
        if ((a > 0.18 && a < 0.3) || (a > 0.5 && a < 0.6)) fx.hold(c.at("knuckles"), 14, "#ff7657", 0.85);
        for (const T of [0.27, 0.58]) {
          if (!c.hit(T)) continue;
          const p = c.at("knuckles"), f = V(c.facing, 0, 0);
          fx.glow(p, f.clone().multiplyScalar(160), { size: 26, grow: 40, life: 0.16, color: "#ff7657", op: 0.75 });
          fx.ring(p, { r0: 4, r1: 34, life: 0.22, color: "#ff7657", op: 0.9 });
          for (let i = 0; i < 12; i++) fx.spark(p, f.clone().multiplyScalar(rand(120, 320)).add(V(0, rand(-140, 160), rand(-80, 80))), { color: "#ffb08a", life: rand(0.2, 0.4) });
          fx.kick(1.4);
        }
      }
      // Footfalls.
      if (mode === "move") {
        if (c.every(BOT.T, 0)) fx.dust(c.at("footR"), 3, 7, 40);
        if (c.every(BOT.T, BOT.T / 2)) fx.dust(c.at("footL"), 3, 7, 40);
      }
      if (mode === "leap") {
        const feet = c.at("footR").lerp(c.at("footL"), 0.5);
        if (c.hit(0.48)) {
          fx.dust(ground(feet), 10, 14, 120);
          fx.ring(ground(feet), { flat: true, r0: 4, r1: 60, life: 0.4, color: "#ffcf9a", op: 0.6 });
          fx.kick(2);
        }
        if (c.hit(1.68)) {
          fx.dust(ground(feet), 14, 16, 150);
          fx.ring(ground(feet), { flat: true, r0: 6, r1: 90, life: 0.5, color: "#ffe0b0", op: 0.7 });
          rocks(fx, ground(feet), 8, 90);
          fx.kick(5);
        }
      }
    },

    siege_automaton(c) {
      const { fx, t, mode, a, m } = c;
      if (mode === "death") return siegeDeathFx(c);
      fx.hold(c.at("eyes"), 12, "#ff5a3c", 0.6);
      fx.hold(c.at("core"), 30 + 6 * Math.sin(t * 3), "#5ff0d0", 0.4);
      if (c.every(0.12)) {
        for (const k of ["stackA", "stackB"]) fx.smoke(c.at(k), V(rand(-5, 5), rand(18, 30), 0), { size: 4, grow: 18, life: 1.4, color: "#45423f", op: 0.35, rise: 6 });
      }
      const cannon = mode === "attack" || mode === "jump";
      // Footfalls: dust, a ring along the ground, the camera jolts.
      if (mode === "move") {
        for (const [k, off] of [["footR", 0], ["footL", SIEGE.T / 2]]) {
          if (!c.every(SIEGE.T, off)) continue;
          const p = ground(c.at(k));
          fx.dust(p, 7, 14, 70);
          fx.ring(p, { flat: true, r0: 6, r1: 46, life: 0.5, color: "#c8b090", op: 0.35 });
          rocks(fx, p, 3, 50);
          fx.kick(2.2);
        }
      }
      if (cannon) {
        const shots = mode === "attack" ? [[0.38, 0], [0.49, 0], [0.6, 0], [0.71, 0]] : [[0.74, -14], [0.74, 0], [0.74, 14]];
        const t0 = shots[0][0];
        if (a < t0 && a > t0 - 0.38) fx.hold(c.at("charge"), 6 + 34 * smooth(t0 - 0.38, t0, a), "#73e8ff", 0.9);
        for (const [T, deg] of shots) {
          if (!c.hit(T)) continue;
          const p = c.at("muzzle"), d = c.dir("muzzle").applyAxisAngle(V(0, 0, 1), (deg * Math.PI) / 180);
          fx.bolt(p, d.clone().multiplyScalar(680), { color: "#73e8ff", w: 18, h: 8, life: 1.7 });
          fx.glow(p, V(), { size: 22, grow: 40, life: 0.09, color: "#f0ffff", op: 1 });
          fx.glow(p, d.clone().multiplyScalar(80), { size: 30, grow: 54, life: 0.16, color: "#73e8ff", op: 0.8 });
          fx.ring(p.clone().addScaledVector(d, 6), { r0: 4, r1: 22, life: 0.18, color: "#73e8ff", op: 0.8 });
          for (let i = 0; i < 6; i++) fx.spark(p, d.clone().multiplyScalar(rand(150, 300)).add(V(rand(-80, 80), rand(-80, 80), rand(-50, 50))), { color: "#9ff4ff", life: 0.2, size: 1.2, gravity: 0 });
          fx.kick(1.2);
        }
        // The rings run hot after a burst, then vent steam out of the stacks.
        if (mode === "attack") {
          fx.hold(c.at("cannonMid"), 46, "#73e8ff", 0.4 * smooth(0.38, 0.75, a) * (1 - smooth(0.9, 1.7, a)));
          if (a > 1.05 && a < 1.6 && c.every(0.03)) {
            for (const k of ["stackA", "stackB"]) fx.smoke(c.at(k), V(rand(-15, 15), rand(70, 110), rand(-10, 10)), { size: 6, grow: 34, life: rand(0.9, 1.4), color: "#e6eef0", op: 0.5, drag: 1.5, rise: 10 });
          }
        }
      }
      if (m.beam) m.beam.visible = false;
      if (mode === "missiles") {
        // The pointing finger paints the target: a red beam and a dot on him.
        if (a > 0.42 && a < 1.9) {
          if (!m.beam) {
            m.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 6, 1, true),
              new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff3020").multiplyScalar(2), transparent: true,
                opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
            scene.add(m.beam);
          }
          const f = c.at("finger"), d = TARGET.clone().sub(f), len = d.length();
          m.beam.visible = true;
          m.beam.position.copy(f).addScaledVector(d, 0.5);
          m.beam.scale.set(1, len, 1);
          m.beam.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
          m.beam.material.opacity = 0.45 + 0.25 * pulse(t);
          fx.hold(f, 10, "#ff4030", 0.9);
          fx.hold(TARGET, 12 + 4 * pulse(t), "#ff3020", 0.8);
        }
        if (a > 0.4 && a < 0.7) fx.hold(c.at("pack"), 64 + 10 * Math.sin(t * 26), "#ff5a5a", 0.3 + 0.3 * pulse(t));
        if (a > 0.3 && a < 1.1 && pulse(t * 0.5) > 0.5) fx.hold(c.at("arming"), 10, "#ff4030", 0.95);
        if (c.hit(0.7)) for (const o of [-9, 9]) launch(c, "tubeL", o);
        if (c.hit(0.88)) for (const o of [-9, 9]) launch(c, "tubeR", o);
      }
      if (mode === "jump") {
        const feet = ground(c.at("footR").lerp(c.at("footL"), 0.5));
        if (c.hit(0.5)) { fx.dust(feet, 14, 18, 130); fx.ring(feet, { flat: true, r0: 8, r1: 80, life: 0.45, color: "#ffd7a0", op: 0.5 }); fx.kick(4); }
        if (c.hit(0.94)) { launch(c, "tubeL", 0); launch(c, "tubeR", 0); }
        if (c.hit(1.7)) {
          fx.dust(feet, 22, 24, 170);
          fx.ring(feet, { flat: true, r0: 10, r1: 160, life: 0.6, color: "#ffe0b0", op: 0.7 });
          fx.ring(feet, { flat: true, r0: 6, r1: 90, life: 0.45, color: "#ffffff", op: 0.5 });
          rocks(fx, feet, 14, 130);
          fx.kick(9);
        }
      }
    },
  };

  // A seeker missile out of a tube: up and a little forward (fanned by
  // `deg`), then it turns onto the target; it ends in a micro blast.
  function launch(c, tube, deg) {
    if (!missile) return;
    const { fx } = c;
    const p = c.at(tube);
    const d = V(0, 1, 0).applyAxisAngle(V(0, 0, 1), -c.facing * (0.4 + (deg * Math.PI) / 180));
    fx.homer(missile.clone(), p, d.multiplyScalar(150), { kind: "missile", speed: 250, turn: 2.8, life: 6, delay: 0.22,
      onEnd: (q) => fx.explosion(q, 52, { color: "#ffb12b", shake: 2.5 }) });
    fx.glow(p, V(), { size: 18, grow: 40, life: 0.12, color: "#fff0d0", op: 1 });
    for (let i = 0; i < 6; i++) {
      fx.smoke(p, V(rand(-60, 60), rand(-30, 30), rand(-40, 40)), { size: 6, grow: 26, life: rand(0.8, 1.3), color: "#cfc8bd", op: 0.5, drag: 2.5, rise: 10 });
    }
    for (let i = 0; i < 5; i++) fx.spark(p, V(rand(-120, 120), rand(-60, 160), rand(-60, 60)), { color: "#ffb35a", life: 0.3 });
  }

  function siegeDeathFx(c) {
    const { fx, a, m } = c;
    const boneAt = (bn) => m.bones[bn].b.getWorldPosition(V());
    if (c.hit(0.01)) {   // rebuilt
      const p = c.at("chest");
      fx.ring(p, { r0: 120, r1: 10, life: 0.5, color: "#5ff0d0", op: 0.7 });
      fx.glow(p, V(), { size: 160, grow: 40, life: 0.5, color: "#5ff0d0", op: 0.5 });
    }
    if (a < SIEGE_BLAST) {
      const over = smooth(1.0, SIEGE_BLAST, a);
      fx.hold(c.at("eyes"), 12, "#ff5a3c", 0.6 * (Math.random() < 0.15 + over * 0.5 ? 0.2 : 1));
      fx.hold(c.at("core"), 30 + 90 * over + 20 * over * Math.sin(a * 40), over > 0.5 ? "#d8fff6" : "#5ff0d0", 0.4 + 0.5 * over);
    }
    // The pod smokes and spits sparks, then goes.
    if (a < 0.4) {
      if (c.every(0.03)) fx.spark(c.at("pack"), V(rand(-120, 120), rand(40, 220), rand(-60, 60)), { color: "#ffd27a" });
      if (c.every(0.06)) fx.smoke(c.at("pack"), V(rand(-10, 10), 40, 0), { size: 6, grow: 26, life: 1.2, color: "#2e2b29", op: 0.5, rise: 10 });
    }
    if (c.hit(0.4)) { const p = c.at("pack"); fx.explosion(p, 52, { shake: 3 }); shrapnel(fx, p, 8, 240); }
    if (c.hit(1.0)) { fx.explosion(c.at("cannonMid"), 52, { shake: 3 }); }
    // The stumps spark and smoke; the parts trail smoke as they fly.
    if (a > 1.0 && a < SIEGE_BLAST && c.every(0.04)) {
      fx.spark(c.at("shoulder"), V(rand(-60, 160), rand(0, 200), rand(-80, 0)), { color: "#ffd27a", life: 0.5 });
      fx.smoke(c.at("shoulder"), V(rand(-10, 10), 35, 0), { size: 5, grow: 24, life: 1.2, color: "#2e2b29", op: 0.45, rise: 10 });
    }
    if (c.every(0.04)) {
      for (const [bn, t0] of [["missilePack", 0.4], ["cannonArm", 1.0], ["head", SIEGE_BLAST], ["leftArm", SIEGE_BLAST]]) {
        if (a > t0 && a < t0 + 2.4) fx.smoke(boneAt(bn), V(rand(-8, 8), 20, 0), { size: 5, grow: 22, life: 1.0, color: "#2b2826", op: 0.45, rise: 6 });
      }
    }
    // The overload: a red strobe over the hull, steam out of every stack.
    if (a > 1.2 && a < SIEGE_BLAST) {
      fx.hold(c.at("chest"), 130 + 30 * Math.sin(a * 30), "#ff5a5a", 0.2 + 0.25 * pulse(c.t));
      if (c.every(0.03)) {
        for (const k of ["stackA", "stackB"]) fx.smoke(c.at(k), V(rand(-20, 20), rand(80, 130), rand(-10, 10)), { size: 6, grow: 32, life: 1.0, color: "#e6eef0", op: 0.5, rise: 12 });
        fx.spark(c.at("hip"), V(rand(-160, 160), rand(40, 240), rand(-80, 80)), { color: "#9ff4ff", life: 0.35 });
      }
    }
    if (c.hit(SIEGE_BLAST)) {
      const p = c.at("core");
      fx.glow(p, V(), { size: 110, grow: 220, life: 0.45, color: "#ff7a1a", op: 1 });   // deathFlash, 220
      fx.glow(p, V(), { size: 72, grow: 180, life: 0.3, color: "#ffe06a", op: 1 });     // deathBlast, 180
      fx.explosion(p, 110, { shake: 14 });
      shrapnel(fx, p, 20, 440);
      fx.ring(ground(p), { flat: true, r0: 10, r1: 260, life: 0.7, color: "#ffcf8a", op: 0.7 });
      fx.ring(p, { r0: 20, r1: 200, life: 0.5, color: "#fff0c0", op: 0.8 });
      for (let i = 0; i < 24; i++) {
        fx.chunk(p.clone().add(V(rand(-25, 25), rand(-40, 40), rand(-15, 15))), V(rand(-1, 1) * 320, rand(0.2, 1.4) * 320, rand(-1, 1) * 160),
          { size: [rand(2, 7), rand(2, 6), rand(1, 4)], color: Math.random() < 0.5 ? "#414956" : "#22262d", life: 3, smoke: Math.random() < 0.4 ? 1 : 0 });
      }
    }
    // The wreck burns until it is cleared.
    if (a > SIEGE_BLAST + 0.2 && a < 6.2 && c.every(0.04)) {
      const p = c.at("chest").add(V(rand(-30, 30), rand(-6, 12), rand(-15, 15)));
      fx.glow(p, V(rand(-10, 10), rand(30, 60), 0), { size: 14, grow: 6, life: rand(0.3, 0.6), color: Math.random() < 0.5 ? "#ff8a2a" : "#ffb347", op: 0.8 });
      fx.smoke(p, V(rand(-10, 10), rand(40, 70), 0), { size: 10, grow: 46, life: rand(1.6, 2.4), color: "#1f1d1c", op: 0.55, rise: 10, fadeIn: 0.1 });
    }
    if (c.hit(6.2)) fx.explosion(c.at("chest"), 40, { shake: 3 });
  }

  function aimFrom(m, facing, x, y) {
    const g = m.group.position;
    const dx = (TARGET.x - g.x) * facing - x, dy = TARGET.y - (g.y + m.body.position.y + y);
    if (dx < 20) return 0;
    return Math.max(-0.6, Math.min(0.6, Math.atan2(dy, dx)));
  }

  function update(dt, { facing = 1, compare = false } = {}) {
    t += dt;
    layout(compare);
    if (withFx) fx.update(dt);
    const ga = t % ATTACK;
    const kick = mode === "attack" && ga >= WINDUP ? Math.max(0, 1 - (ga - WINDUP) / 0.25) : 0;
    // The promoted: script each real root from its fake's box and its SCRIPT,
    // run the game's record over them (moved along a treadmill, so walking
    // reads as walking), and feel their kicks.
    const live = [];
    for (const s of SPECS) {
      const r = roots[s.id];
      if (!r) continue;
      scriptRoot(r, s, ents[s.id], dt, facing);
      if (shown().includes(s)) live.push(r);
    }
    for (const r of live) r.x += odo[r.specTop.id];
    const k = motion.update(live, FLOOR, t);
    for (const r of live) r.x -= odo[r.specTop.id];
    if (withFx && k > 0) fx.kick(k);
    shownRoots = live;

    for (const s of SPECS) {
      const m = models[s.id], e = ents[s.id], on = shown().includes(s), own = FX[s.id];
      // Enemies with their own effects show their own tells instead of the game's.
      e.telegraph = !own && mode === "attack" && ga < WINDUP ? 1 : 0;
      e.muzzleFlash = !own && mode === "attack" && ga >= WINDUP && ga < WINDUP + FLASH ? 1 : 0;
      // The boss faces the camera; turning it would show its back.
      e.facing = s.role === "boss" ? 1 : facing;
      if (!m) continue;
      const len = PERIOD[s.id]?.[mode] ?? ATTACK, a = t % len, prevA = m.prevA;
      m.prevA = a;
      m.group.visible = on;
      if (m.held) m.held.visible = false;
      if (m.beam && !on) m.beam.visible = false;
      if (!on) continue;
      m.group.position.set(e.x + e.w / 2, viewY(e.y + e.h / 2), 0);
      m.group.rotation.y = e.facing < 0 ? Math.PI : 0;
      ANIM[s.id]?.(poser(m), t, mode, own ? a : ga, kick, m, { aim: (x, y) => aimFrom(m, e.facing, x, y) });
      for (const w of m.wings || []) w.hinge.position.set(w.child.at[0] - w.side * w.child.visual.size[0] / 2, -w.child.at[1], 0).add(m.body.position);
      if (own && withFx && m.sockets) {
        m.group.updateMatrixWorld(true);
        own({
          fx, t, dt, mode, a, m, facing: e.facing,
          hit: (T) => dt > 0 && ((prevA < T && T <= a) || (a < prevA && (T > prevA || T <= a))),
          every: (p, off = 0) => dt > 0 && Math.floor((t - off) / p) !== Math.floor((t - dt - off) / p),
          at: (k) => m.sockets[k].b.localToWorld(m.sockets[k].local.clone()),
          dir: (k, x = 1, y = 0, z = 0) => V(x, y, z).transformDirection(m.sockets[k].b.matrixWorld),
        });
      }
    }
    return { shake: withFx ? fx.shake : 0 };
  }

  // Inside the app's halos.begin()/end(): the glows, and the game's own model.
  // One frame of a promoted root's scripted fight (see SCRIPT).
  const walkTree = (e, fn) => { fn(e); for (const c of e.children) walkTree(c, fn); };
  // Parts by id, with "root" always the root whatever its spec calls it.
  const parts = (r) => { const out = {}; walkTree(r, (e) => { out[e.id] = e; }); out.root = r; return out; };
  const crossed = (T, a, pa, dt) => dt > 0 && ((pa < T && T <= a) || (a < pa && (T > pa || T <= a)));
  function scriptRoot(r, s, e, dt, facing) {
    r.x = e.x; r.y = e.y;
    r.children.forEach((c, i) => { c.x = e.children[i].x; c.y = e.children[i].y; });
    r.facing = s.role === "boss" ? 1 : facing;
    const sc = mode === "move" || mode === "idle" ? null : SCRIPT[s.id]?.[mode] ?? (mode === "attack" ? GENERIC_ATTACK : null);
    const len = sc?.len ?? 1, a = t % len, pa = ((t - dt) % len + len) % len;
    const P = parts(r);
    walkTree(r, (x) => { x.telegraph = 0; if (x.muzzleFlash > 0) x.muzzleFlash -= dt; });
    for (const [t0, t1, part] of sc?.tele || []) if (a >= t0 && a < t1) P[part || "root"].telegraph = t1 - a;
    for (const [part, times] of Object.entries(sc?.fire || {})) {
      for (const T of times) {
        if (!crossed(T, a, pa, dt)) continue;
        const x = P[part];
        x.fireCount++;
        x.muzzleFlash = 0.055;
        x.muzzleColor = Object.values(x.spec.emitters || {})[0]?.projectile?.color;
      }
    }
    const bs = r.brainState;
    if (sc?.act) {
      const [id, w, end] = sc.act;
      if (!bs.commit || bs.commit.action.id !== id || a < pa) bs.commitSerial++; // a new commitment
      bs.commit = { action: { id }, phase: a < w ? "windup" : a < end ? "steps" : "recovery" };
    } else bs.commit = null;
    let lift = 0;
    if (sc?.air) {
      const [t0, t1, h] = sc.air;
      if (a >= t0 && a < t1) { const u = (a - t0) / (t1 - t0); lift = h * 4 * u * (1 - u); }
    }
    walkTree(r, (x) => { x.y -= lift; });
    let v = mode === "move" ? s.root.motion?.speed ?? 60 : 0;
    for (const [t0, t1, sp] of sc?.run || []) if (a >= t0 && a < t1) v = sp;
    odo[s.id] = (odo[s.id] ?? 0) + v * dt;
  }

  let shownRoots = [];
  function sync(mission, halos, compare) {
    const m = { time: mission.time };
    game.sync({ time: t, scene: { specRoots: shownRoots, soldiers: [TARGET_ENT] }, motion }, halos);
    for (const s of shown()) if (!promoted(s)) cues(ents[s.id], m, halos, 0.5 + 0.5 * Math.sin(mission.time * 26));
    for (const s of shown()) oldEnts[s.id].facing = ents[s.id].facing;
    old.sync({ time: mission.time, scene: { specRoots: compare ? shown().map((s) => oldEnts[s.id]) : [] } }, halos);
  }

  return {
    update, sync,
    setSubject(id) {
      subject = isEnemySubject(id) ? id : null;
      if (!subject) {
        for (const m of Object.values(models)) { m.group.visible = false; if (m.held) m.held.visible = false; if (m.beam) m.beam.visible = false; }
        fx.clear();
      }
      layout(false);
    },
    setMode(id) {
      mode = id; t = 0;
      for (const m of Object.values(models)) m.prevA = -1;
    },
    centre: () => frameC.clone(),
    half: () => frameHalf,
    loaded: () => loaded,
    // id -> { group } once the glb is in (plus body, bones, spec, wings? for
    // the tester's own); a host that stages them itself (splash.js) moves the
    // groups after update() and sync(). A promoted enemy's group is the game's
    // model, posed by the game's motion.
    models: () => {
      const out = { ...models };
      for (const [id, r] of Object.entries(roots)) {
        const g = game.modelOf(r);
        if (g) out[id] = { group: g };
      }
      return out;
    },
  };
}
