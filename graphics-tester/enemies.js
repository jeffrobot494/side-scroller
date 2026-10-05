// ---------------------------------------------------------------------------
// GRAPHICS TESTER — the enemy roster, re-modelled (looks, not yet the game's).
//
// Model: models/enemies.glb (built by models/enemies.py): one armature per
// enemy, named by spec id, with ONE rigidly skinned mesh (Shell + Detail, two
// draw calls). Every bone's local axes are the world's, so rotation.z swings a
// part in the screen plane. The Iron Moth's wing is a separate unskinned mesh,
// mirrored here for the left wing.
//
// Sizes, colours and the moth's wing offsets come from the game's own enemy
// list (ENEMY_FILE), so each model stands in the box its spec gives it. The
// Shell takes the spec colour; telegraph and muzzle glows are the game's own
// `cues`. "Game model beside it" draws the current in-game look next to each
// one with the game's createEnemies.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ENEMY_FILE } from "../src/game/enemyspecs.js";
import { createEnemies, cues } from "../src/mission/view3d/enemy.js";
import { setColor, viewY } from "../src/mission/view3d/util.js";

const SPECS = ENEMY_FILE.map((r) => r.spec);
const isFlying = (s) => s.root.tags?.includes("flying");

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

const ATTACK = 2;        // s, one attack cycle
const WINDUP = 0.6;      // s of it spent telegraphing
const FLASH = 0.08;      // s the muzzle glow stays lit
const GAP = 46;          // px between models in the lineup

export function createEnemyModels(scene, { groundY, soldierX }) {
  const models = {};     // id -> { group, body, bones, wings? }
  let subject = null, mode = "move", t = 0, loaded = false;
  const old = createEnemies(scene);

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
      const e = fake(s.root.visual, { muzzleColor: Object.values(s.root.emitters || {})[0]?.projectile?.color });
      e.children = (s.root.children || []).map((c) => fake(c.visual, { at: c.at, isRoot: false }));
      bag[s.id] = e;
    }
  }

  // --- layout: where each box sits ----------------------------------------
  // Walkers stand on the ground; flyers hover. Width includes the moth's wings.
  const span = (s) => Math.max(s.root.visual.size[0], ...(s.root.children || []).map((c) => 2 * Math.abs(c.at[0]) + c.visual.size[0]));
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
      for (const e of compare ? [ents[s.id], oldEnts[s.id]] : [ents[s.id]]) {
        top = Math.min(top, e.y - (s.role === "boss" ? 40 : 10));
        bottom = Math.max(bottom, subject === "lineup" ? groundY : e.y + e.h + 10);
      }
      x += span(s) + GAP;
    }
    const left = compare && subject !== "lineup" ? x - total - span(list[0]) - GAP * 2 : x - total - GAP;
    frameC = new THREE.Vector3((left + x) / 2, viewY((top + bottom) / 2), 0);
    frameHalf = Math.max(subject === "lineup" ? 120 : 60, (bottom - top) / 2 + 30, (x - left) / 2 / 1.4 + 20);
  }

  // --- the models -----------------------------------------------------------
  new GLTFLoader().load(new URL("./models/enemies.glb", import.meta.url).href, (gltf) => {
    const wingSrc = gltf.scene.getObjectByName("iron_moth_wing");
    for (const s of SPECS) {
      const rig = gltf.scene.getObjectByName(s.id);
      if (!rig) continue;
      const group = new THREE.Group(), body = new THREE.Group();
      group.add(body);
      body.add(rig);
      const bones = {};
      rig.traverse((o) => {
        if (o.isBone) bones[o.name] = { b: o, p: o.position.clone() };
        if (o.isMesh) o.frustumCulled = false; // skinned: rest-pose bounds lie
      });
      tint(rig, s.root.visual.color);
      const m = { group, body, bones, spec: s };
      if (s.root.children?.length) {
        // The moth's wings: a hinge at each wing's root, the left one mirrored.
        m.wings = s.root.children.map((c) => {
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
    husk_charger(P, t, mode, a, kick) {
      const g = t * 15;
      const run = mode === "move" || (mode === "attack" && a > WINDUP && a < WINDUP + 0.5);
      const sw = run ? 0.6 : 0.05;
      P.rot("legFL", Math.sin(g) * sw); P.rot("legBR", Math.sin(g) * sw);
      P.rot("legFR", -Math.sin(g) * sw); P.rot("legBL", -Math.sin(g) * sw);
      P.lift(run ? Math.abs(Math.sin(g)) * 1.4 : Math.sin(t * 3) * 0.4);
      P.tilt(run ? -0.06 : 0);
      if (mode === "attack") {
        const crouch = a < WINDUP ? a / WINDUP : 0;
        const lunge = a >= WINDUP && a < WINDUP + 0.5 ? Math.sin(((a - WINDUP) / 0.5) * Math.PI) : 0;
        P.rot("head", -0.35 * crouch - 0.2 * lunge);
        P.shift(-3 * crouch + 14 * lunge);
      } else P.rot("head", Math.sin(t * 1.7) * 0.08 + (run ? -0.12 : 0));
    },
    lurk_gunner(P, t, mode, a, kick, m) {
      // A stalking walk: each foot plants and slides back along the ground for
      // STANCE of the cycle, then lifts and swings forward; the other leg is
      // half a cycle behind. Feet are placed on the ground and the legs are
      // solved to reach them, so the body can bob, lean and recoil while the
      // feet stay put. Idle and attack plant both feet at rest.
      const walk = mode === "move", T = 0.7, STANCE = 0.6, STRIDE = 13;
      const ph = (t / T) % 1;
      if (walk) {
        P.lift(0.9 * (1 - Math.cos(ph * 4 * Math.PI)) / 2);
        P.tilt(-0.05 + 0.02 * Math.sin(ph * 2 * Math.PI));
        P.shift(0.6 * Math.sin(ph * 4 * Math.PI));
      } else P.lift(Math.sin(t * 2) * 0.4);
      P.tilt(-0.12 * kick);
      P.rot("head", Math.sin(t * 1.3) * 0.06 + (walk ? 0.05 * Math.sin(ph * 4 * Math.PI) : 0));
      const aim = mode === "attack" ? Math.min(1, a / 0.3) * (a < WINDUP + 0.6 ? 1 : 0) : 0;
      P.rot("gun", 0.18 * aim + 0.35 * kick + (walk ? Math.sin(ph * 2 * Math.PI) * 0.06 : 0));
      for (const [side, off] of [["R", 0], ["L", 0.5]]) {
        let dx = 0, up = 0, pitch = 0;
        if (walk) {
          const p = (ph + off) % 1;
          if (p < STANCE) {
            dx = STRIDE * (0.5 - p / STANCE);                  // planted, sliding back
            pitch = p > STANCE - 0.15 ? -0.5 * (p - STANCE + 0.15) / 0.15 : 0; // heel peels up
          } else {
            const u = (p - STANCE) / (1 - STANCE), e = u * u * (3 - 2 * u);
            dx = STRIDE * (e - 0.5);                           // swinging forward
            up = 5.5 * Math.sin(Math.PI * u);
            pitch = -0.5 * (1 - u) + 0.25 * Math.sin(Math.PI * u);
          }
        }
        legIK(P, m.body, side, LURK.ankle.x + dx, LURK.ankle.y + up, pitch);
      }
    },
    spore_wisp(P, t, mode, a, kick) {
      const beat = Math.sin(t * 3);
      P.squash(1 + 0.04 * beat, 1 - 0.06 * beat);
      P.lift(Math.sin(t * 2.2) * 3);
      P.tilt(mode === "move" ? -0.15 : 0);
      for (let i = 0; i < 5; i++) P.rot(`t${i}`, Math.sin(t * 2 + i * 1.3) * 0.25 + (mode === "move" ? 0.3 : 0), Math.sin(t * 1.5 + i) * 0.2);
      const swell = mode === "attack" && a < WINDUP ? a / WINDUP : 0;
      P.scale("pods", 1 + 0.35 * swell - 0.25 * kick);
    },
    strafe_raider(P, t, mode, a, kick) {
      const pass = mode !== "idle";
      P.lift(Math.sin(t * 2.4) * 1.5);
      P.tilt(pass ? -0.1 : Math.sin(t * 1.1) * 0.04);
      P.roll(pass ? Math.sin(t * 1.8) * 0.9 : Math.sin(t * 1.5) * 0.3);
      if (mode === "attack") P.shift(a < WINDUP ? -4 * (a / WINDUP) : 30 * Math.sin(Math.min(1, (a - WINDUP) / 0.55) * Math.PI) - 3 * kick);
    },
    cowardly_duelist(P, t, mode, a, kick) {
      const g = t * 9, back = mode === "move";
      P.rot("legL", back ? Math.sin(g) * 0.5 : Math.sin(t * 2) * 0.05);
      P.rot("legR", back ? -Math.sin(g) * 0.5 : -Math.sin(t * 2) * 0.05);
      P.lift(back ? Math.abs(Math.cos(g)) * 1.3 : 0);
      P.shift(back ? 0 : Math.sin(t * 2) * 0.7);
      P.tilt(back ? 0.12 : 0);
      P.rot("coat", back ? 0.25 + Math.sin(g * 2) * 0.05 : Math.sin(t * 2) * 0.05);
      // A nervous glance over its shoulder every few seconds.
      const glance = Math.max(0, Math.sin(t * 0.9)) ** 8;
      P.rot("head", Math.sin(t * 7) * 0.03, glance * 1.2);
      const aim = mode === "attack" ? Math.min(1, a / 0.35) * (a < WINDUP + 0.6 ? 1 : 0) : 0;
      P.rot("gun", 0.12 * aim + 0.4 * kick - (back ? 0.25 : 0));
    },
    sky_duelist(P, t, mode, a, kick) {
      P.lift(Math.sin(t * 2) * 2.5);
      P.tilt(mode === "move" ? -0.14 : Math.sin(t * 1.3) * 0.05);
      P.roll(Math.sin(t * 1.1) * 0.12);
      P.rot("rider", mode === "move" ? -0.1 : Math.sin(t * 1.7) * 0.04);
      const aim = mode === "attack" ? Math.min(1, a / 0.3) * (a < WINDUP + 0.6 ? 1 : 0) : 0;
      P.rot("gun", 0.1 * aim + 0.35 * kick);
    },
    iron_moth(P, t, mode, a, kick, m) {
      const rate = mode === "move" ? 7 : 4;
      for (const w of m.wings || []) {
        w.hinge.rotation.y = w.side * Math.sin(t * rate) * 0.5;
        w.hinge.rotation.z = w.side * Math.sin(t * rate + 0.6) * 0.08;
      }
      P.lift(Math.sin(t * 1.6) * 4);
      P.rot("antL", Math.sin(t * 2.5) * 0.12 - 0.04); P.rot("antR", -Math.sin(t * 2.5 + 0.7) * 0.12 + 0.04);
      const open = mode === "attack" ? (a < WINDUP ? a / WINDUP : Math.max(0, 1 - (a - WINDUP) / 0.5)) : 0.1 + 0.1 * Math.sin(t * 3);
      P.rot("jawL", 0.4 * open); P.rot("jawR", -0.4 * open);
    },
  };

  // The Lurk Gunner's leg at rest (models/enemies.py), in the model's frame.
  const LURK = { hip: { x: -1, y: -5 }, knee: { x: 4, y: -12 }, ankle: { x: -2, y: -19 } };
  const ang = (v) => Math.atan2(v.y, v.x);
  // Two-bone IK in the screen plane: put the ankle at (gx, gy) in the GROUP's
  // frame (where the ground is fixed), whatever the body is doing, knee forward
  // as built; the ankle bone then holds the foot at `pitch` from level.
  function legIK(P, body, side, gx, gy, pitch) {
    const { hip, knee, ankle } = LURK;
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
    P.rot("leg" + side, hipRot);
    P.rot("shin" + side, shinRot);
    P.rot("foot" + side, pitch - hipRot - shinRot - body.rotation.z);
  }

  function poser(m) {
    const B = m.bones;
    m.body.position.set(0, 0, 0); m.body.rotation.set(0, 0, 0); m.body.scale.set(1, 1, 1);
    for (const { b, p } of Object.values(B)) { b.position.copy(p); b.rotation.set(0, 0, 0); b.scale.setScalar(1); }
    return {
      rot: (n, z, y = 0, x = 0) => B[n]?.b.rotation.set(x, y, z),
      scale: (n, k) => B[n]?.b.scale.setScalar(k),
      lift: (d) => { m.body.position.y += d; },
      shift: (d) => { m.body.position.x += d; },
      tilt: (r) => { m.body.rotation.z += r; },
      roll: (r) => { m.body.rotation.x += r; },
      squash: (sx, sy) => m.body.scale.set(sx, sy, sx),
    };
  }

  function update(dt, { facing = 1, compare = false } = {}) {
    t += dt;
    layout(compare);
    const a = t % ATTACK;
    const kick = mode === "attack" && a >= WINDUP ? Math.max(0, 1 - (a - WINDUP) / 0.25) : 0;
    for (const s of SPECS) {
      const m = models[s.id], e = ents[s.id], on = shown().includes(s);
      e.telegraph = mode === "attack" && a < WINDUP ? 1 : 0;
      e.muzzleFlash = mode === "attack" && a >= WINDUP && a < WINDUP + FLASH ? 1 : 0;
      // The boss faces the camera; turning it would show its back.
      e.facing = s.role === "boss" ? 1 : facing;
      if (!m) continue;
      m.group.visible = on;
      if (!on) continue;
      m.group.position.set(e.x + e.w / 2, viewY(e.y + e.h / 2), 0);
      m.group.rotation.y = e.facing < 0 ? Math.PI : 0;
      ANIM[s.id]?.(poser(m), t, mode, a, kick, m);
      for (const w of m.wings || []) w.hinge.position.set(w.child.at[0] - w.side * w.child.visual.size[0] / 2, -w.child.at[1], 0).add(m.body.position);
    }
  }

  // Inside the app's halos.begin()/end(): the glows, and the game's own model.
  function sync(mission, halos, compare) {
    const m = { time: mission.time };
    for (const s of shown()) cues(ents[s.id], m, halos, 0.5 + 0.5 * Math.sin(mission.time * 26));
    for (const s of shown()) oldEnts[s.id].facing = ents[s.id].facing;
    old.sync({ time: mission.time, scene: { specRoots: compare ? shown().map((s) => oldEnts[s.id]) : [] } }, halos);
  }

  return {
    update, sync,
    setSubject(id) {
      subject = isEnemySubject(id) ? id : null;
      if (!subject) for (const m of Object.values(models)) m.group.visible = false;
      layout(false);
    },
    setMode(id) { mode = id; t = 0; },
    centre: () => frameC.clone(),
    half: () => frameHalf,
    loaded: () => loaded,
    // id -> { group, body, bones, spec, wings? } once the glb is in; a host
    // that stages them itself (splash.js) moves the groups after update().
    models: () => models,
  };
}
