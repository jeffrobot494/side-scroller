// ---------------------------------------------------------------------------
// GRAPHICS TESTER — the enemy roster, as the game draws it.
//
// Every roster enemy's model, motion and effects are the game's now
// (tech/mission-3d-enemies.md M6–M10): src/mission/view3d/enemyrig.js (the
// rigs from models/enemies.glb), enemyanim.js (how each moves) and enemyfx.js
// (its effects). This module is the harness that shows them: per mode it
// scripts a REAL root — box, facing, the committed action and its phase,
// telegraphs, rounds per part, spawns, a jump, a death — runs the game's motion
// record over it (enemyspec/motion.js) on a treadmill, and draws it with the
// game's createEnemies. So what Bo approves here is what a mission shows.
// "Game model beside it" draws the block look next to each one.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { ENEMY_FILE } from "../src/game/enemyspecs.js";
import { createEnemies } from "../src/mission/view3d/enemy.js";
import { viewY } from "../src/mission/view3d/util.js";
import { rigLoaded } from "../src/mission/view3d/enemyrig.js";
import { createEnemyFx } from "../src/mission/view3d/enemyfx.js";
import { instantiate, killEntity, updateSpecEnemy, spawnFromDef } from "../src/mission/enemyspec/runtime.js";
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { createMotion } from "../src/mission/enemyspec/motion.js";

const SPECS = ENEMY_FILE.map((r) => r.spec);
const isFlying = (s) => s.root.tags?.includes("flying") || s.root.motion?.type === "hover";
const boxOf = (s) => [s.root.body?.w ?? s.root.visual.size[0], s.root.body?.h ?? s.root.visual.size[1]];
// An enemy's fight, per mode, as data: one cycle of `len` seconds,
// replayed. The game draws it from these fields alone, as it would a real one.
//   act   [id, windup end, steps end]: the committed action and its phases
//   tele  [[t0, t1, part?]]: telegraph windows (the root unless named)
//   fire  { part: [times] }: rounds
//   run   [[t0, t1, px/s]]: treadmill speed (move mode runs at the spec's)
//   air   [t0, t1, height]: a jump's arc
//   spawn { def: [times] }: real spawns, flown at the soldier by the tester
//   die   t: a fresh root each cycle, killed at t; the game's runtime then
//         plays what its death spawns (the Siege Automaton's overload)
const GENERIC_ATTACK = { len: 2, tele: [[0, 0.6]], fire: { root: [0.6] } };
// The Floating Factory launches every 7s in every mode, as its spawn loop does
// in the game, so the game's motion predicts the tester's launches.
const FACTORY = { len: 7, spawn: { drone: [6.99] } };
const SCRIPT = {
  floating_factory: { idle: FACTORY, move: FACTORY, attack: FACTORY },
  husk_charger: { attack: { len: 2, tele: [[0, 0.6]], run: [[0.6, 1.1, 520]] } },
  breach_hopper: {
    attack: { len: 1.6, act: ["rifleBurst", 0.25, 0.42], tele: [[0, 0.25]], fire: { gunArm: [0.25, 0.33, 0.41] } },
    punch: { len: 1.4, act: ["punchCombo", 0.18, 0.5], tele: [[0, 0.18]], fire: { fistArm: [0.18, 0.49] } },
    leap: { len: 3, act: ["screenLeap", 0.48, 2.27], tele: [[0, 0.48], [1.9, 2.1]], air: [0.48, 1.68, 125],
      run: [[0.48, 1.68, 300]], fire: { gunArm: [2.1, 2.18, 2.26] } },
  },
  siege_automaton: {
    attack: { len: 2.2, act: ["cannonBurst", 0.38, 0.75], tele: [[0, 0.38]], fire: { cannonArm: [0.38, 0.49, 0.6, 0.71] } },
    missiles: { len: 3.6, act: ["missileVolley", 0.7, 0.9], tele: [[0, 0.7], [0.4, 0.7, "missilePack"]], fire: { missilePack: [0.7, 0.88] },
      spawn: { seekerMissile: [0.7, 0.7, 0.88, 0.88] } },
    jump: { len: 3.4, act: ["jumpBarrage", 0.5, 1.75], tele: [[0, 0.5]], air: [0.5, 1.7, 115], run: [[0.5, 1.7, 150]],
      fire: { cannonArm: [0.74], missilePack: [0.94] } },
    death: { len: 7, die: 0.05 },
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
// Extra height a mode leaps to, so the camera frames it.
const HEADROOM = { breach_hopper: { leap: 130 }, siege_automaton: { jump: 120, death: 60, missiles: 110 } };
// Modes whose shots fly to the soldier: the camera takes him in too.
const FRAME_TARGET = { floating_factory: { attack: true }, siege_automaton: { missiles: true } };

const GAP = 46;          // px between models in the lineup

export function createEnemyModels(scene, { groundY, soldierX, fx: withFx = true }) {
  let subject = null, mode = "move", t = 0, shake = 0;
  const old = createEnemies(scene, { rigs: false });
  // One real root per enemy, scripted per mode, its record kept by the game's
  // motion module and drawn, posed and lit by the game's view.
  const game = createEnemies(scene);
  const effects = withFx ? createEnemyFx(scene) : null;
  const motion = createMotion();
  const roots = {}, odo = {};
  const fresh = (s) => instantiate(normalizeSpec(s), 0, 0);
  for (const s of SPECS) roots[s.id] = fresh(s);
  // The record's ground: one endless floor at the tester's ground line.
  const FLOOR = [{ x: -1e6, y: groundY, w: 2e6, h: 40 }];
  // The tester's soldier as the game sees one, for aim and the missile beam.
  const TARGET_ENT = { alive: true, x: soldierX, y: groundY - 46, w: 30, h: 46 };

  // One fake box per enemy (and per moth wing), for the layout and for the
  // block look beside it.
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

  function update(dt, { facing = 1, compare = false } = {}) {
    t += dt;
    layout(compare);
    // Script each shown root, run the game's record over them (moved along a
    // treadmill, so walking reads as walking), and feel their kicks the way
    // the tester's camera always has: the larger kick wins, then it decays.
    const live = [];
    for (const s of SPECS) {
      ents[s.id].facing = s.role === "boss" ? 1 : facing;
      const r = scriptRoot(s, ents[s.id], dt, facing);
      if (shown().includes(s)) live.push(r);
    }
    for (const r of live) r.x += odo[r.specTop.id];
    const k = motion.update(live, FLOOR, t);
    for (const r of live) r.x -= odo[r.specTop.id];
    shake *= Math.exp(-dt * 7);
    if (shake < 0.05) shake = 0;
    if (withFx) shake = Math.max(shake, k);
    shownRoots = live;
    return { shake };
  }

  // One frame of a root's scripted fight (see SCRIPT).
  const walkTree = (e, fn) => { fn(e); for (const c of e.children) walkTree(c, fn); };
  // Parts by id, with "root" always the root whatever its spec calls it.
  const parts = (r) => { const out = {}; walkTree(r, (e) => { out[e.id] = e; }); out.root = r; return out; };
  const crossed = (T, a, pa, dt) => dt > 0 && ((pa < T && T <= a) || (a < pa && (T > pa || T <= a)));
  // A live root's spawns are flown here, not simulated: each turns onto the
  // soldier at its def's own speed and turn rate after a short launch, and is
  // gone when it reaches him or its life runs out — which the record reads as
  // its death.
  const LAUNCH = { drone: [0.35, 4], seekerMissile: [0.22, 6] }; // delay, life
  function flySpawned(r, dt) {
    const tx = TARGET_ENT.x + TARGET_ENT.w / 2, ty = TARGET_ENT.y + TARGET_ENT.h / 2;
    for (const sp of r.spawned) {
      const m = sp.spec.motion || {}, [delay, life] = LAUNCH[sp.id] || [0, 4];
      sp.age = (sp.age ?? 0) + dt;
      const cx = sp.x + sp.w / 2, cy = sp.y + sp.h / 2;
      if (sp.age > delay) {
        const want = Math.atan2(ty - cy, tx - cx), cur = Math.atan2(sp.vy, sp.vx);
        let d = want - cur;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const ang = cur + Math.max(-(m.turnRate ?? 2.5) * dt, Math.min((m.turnRate ?? 2.5) * dt, d));
        const sp0 = Math.hypot(sp.vx, sp.vy), speed = sp0 + ((m.speed ?? 200) - sp0) * Math.min(1, dt * 3);
        sp.vx = Math.cos(ang) * speed; sp.vy = Math.sin(ang) * speed;
      }
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      if (sp.age > life || Math.hypot(tx - cx, ty - cy) < 12) sp.alive = false;
    }
    if (r.spawned.some((sp) => !sp.alive)) r.spawned = r.spawned.filter((sp) => sp.alive);
  }

  // A dead root's spawns are stepped by the game's runtime in this scene.
  const DEATH_SCENE = { world: { width: 1e6, height: 1e4, gravity: 2000 }, platforms: FLOOR, soldiers: [], enemies: [], projectiles: [] };
  const DEATH_CTX = { friendlyFire: false, damageMult: 1, damage() {}, kill() {} };
  function scriptRoot(s, e, dt, facing) {
    const sc = SCRIPT[s.id]?.[mode] ?? (mode === "attack" ? GENERIC_ATTACK : null);
    const len = sc?.len ?? 1, a = t % len, pa = ((t - dt) % len + len) % len;
    // A dying script rebuilds its root each cycle; leaving it brings one back.
    if (sc?.die !== undefined ? crossed(0, a, pa, dt) || (dt === 0 && a === 0) : !roots[s.id].alive) roots[s.id] = fresh(s);
    const r = roots[s.id];
    r.x = e.x; r.y = e.y;
    r.children.forEach((c, i) => { c.x = e.children[i].x; c.y = e.children[i].y; });
    r.facing = s.role === "boss" ? 1 : facing;
    if (sc?.die !== undefined && r.alive && crossed(sc.die, a, pa, dt)) killEntity(r, r, null, DEATH_SCENE, DEATH_CTX);
    if (!r.alive) { updateSpecEnemy(r, dt, DEATH_SCENE, DEATH_CTX); return r; }
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
    for (const [def, times] of Object.entries(sc?.spawn || {})) {
      times.forEach((T, n) => {
        if (!crossed(T, a, pa, dt)) return;
        // From the bay, or out of the pod's tubes: up and a little forward.
        const from = def === "drone" ? [r.x + r.w / 2, r.y + r.h / 2 + 20] : [P.missilePack.x + P.missilePack.w / 2 + (n % 2 ? 14 : -14), P.missilePack.y];
        const vel = def === "drone" ? { vx: 0, vy: 90 } : { vx: r.facing * 60, vy: -150 };
        r.spawnStamps = [];
        spawnFromDef(r, def, from[0], from[1], vel, DEATH_SCENE, DEATH_CTX);
      });
    }
    flySpawned(r, dt);
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
    return r;
  }

  let shownRoots = [];
  // Inside the app's halos.begin()/end(): the game's models with their tells
  // and effects, and the block look beside them.
  function sync(mission, halos, compare) {
    game.sync({ time: t, scene: { specRoots: shownRoots, soldiers: [TARGET_ENT] }, motion }, halos, effects);
    for (const s of shown()) oldEnts[s.id].facing = ents[s.id].facing;
    old.sync({ time: mission.time, scene: { specRoots: compare ? shown().map((s) => oldEnts[s.id]) : [] } }, halos);
  }

  return {
    update, sync,
    setSubject(id) {
      subject = isEnemySubject(id) ? id : null;
      if (!subject && effects) effects.hide();
      layout(false);
    },
    setMode(id) {
      mode = id; t = 0;
    },
    centre: () => frameC.clone(),
    half: () => frameHalf,
    loaded: () => rigLoaded(),
    // id -> { group }: each enemy's model once drawn. A host that stages them
    // itself (splash.js) moves the groups after update() and sync().
    models: () => {
      const out = {};
      for (const [id, r] of Object.entries(roots)) {
        const g = game.modelOf(r);
        if (g) out[id] = { group: g };
      }
      return out;
    },
  };
}
