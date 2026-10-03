// ---------------------------------------------------------------------------
// GRAPHICS TESTER — the XCOM-style trooper (a look, not the game's soldier).
//
// Model: models/trooper.glb (built by models/trooper.py): an adult,
// realistically proportioned soldier, one skinned mesh on a 30-bone rig, with
// three baked clips — Idle, Run (on the spot) and Shoot (a three-round burst
// per second). Played through an AnimationMixer with short cross-fades.
//
// The Accent material takes the soldier's colour, as the armour tint does on
// the game's soldier. The muzzle flash is driven here, off the clip's shot
// frames, at the rig's `muzzle` bone.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const TROOPER_ANIMS = {
  idle:  { label: "Idle",          clip: "Idle" },
  run:   { label: "Run",           clip: "Run" },
  shoot: { label: "Shoot (burst)", clip: "Shoot" },
};

const HEIGHT_PX = 62;            // the model is 1.80 m; the game's soldier box is 46px
const SCALE = HEIGHT_PX / 1.8;
const FADE = 0.2;                // s, cross-fade between clips
const SHOTS = [0, 5 / 30, 10 / 30]; // s into Shoot (models/trooper.py SHOTS)
const FLASH = 0.05;              // s a flash stays lit

export function createTrooper(scene, { ground, x, color }) {
  const root = new THREE.Group();
  root.position.set(x, ground, 0);
  root.scale.setScalar(SCALE);
  root.visible = false;
  scene.add(root);

  let mixer = null, mode = "run", current = null, lastT = 0, flashT = 0;
  const actions = {};
  let muzzle = null;

  // The flash: a star sprite at the muzzle bone plus a point light.
  const flashTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,250,220,1)");
    grad.addColorStop(0.25, "rgba(255,190,90,0.9)");
    grad.addColorStop(1, "rgba(255,120,30,0)");
    g.fillStyle = grad;
    g.beginPath();
    for (let i = 0; i < 12; i++) {           // a spiky star
      const a = (i / 12) * Math.PI * 2, r = i % 2 ? 12 : 32;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  flash.scale.setScalar(18);
  flash.visible = false;
  scene.add(flash);
  const light = new THREE.PointLight("#ffb46a", 0, 140, 1.6);
  scene.add(light);
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _fwd = new THREE.Vector3();

  new GLTFLoader().load(new URL("./models/trooper.glb", import.meta.url).href, (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false; // skinned: the rest-pose bounds lie
        const m = o.material;
        if (m?.name === "Accent") tint(m, color);
      }
      if (o.isBone && o.name === "muzzle") muzzle = o;
    });
    root.add(model);
    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
    setMode(mode, 0);
  }, undefined, (e) => { throw new Error(`trooper.glb: ${e.message ?? e}`); });

  function tint(m, css) {
    const c = new THREE.Color();
    try { c.setStyle(css.replace(/hsl\((\S+) (\S+) (\S+)\)/, "hsl($1, $2, $3)")); }
    catch { c.set("#4fae74"); }
    m.color.copy(c);
  }

  function setMode(id, fade = FADE) {
    mode = id;
    if (!mixer) return;
    const next = actions[TROOPER_ANIMS[id].clip];
    if (!next || next === current) return;
    next.reset().play();
    if (current) current.crossFadeTo(next, fade, false);
    current = next;
    lastT = 0;
  }

  function update(dt, { facing = 1 } = {}) {
    root.rotation.y = facing < 0 ? Math.PI : 0;
    if (!mixer) return;
    mixer.update(dt);

    // A flash on each shot frame the clip passed this tick.
    if (mode === "shoot" && current) {
      const t = current.time;
      const crossed = (s) => (t >= lastT ? s > lastT && s <= t : s > lastT || s <= t);
      if (SHOTS.some(crossed)) flashT = FLASH;
      lastT = t;
    }
    flashT = Math.max(0, flashT - dt);
    const on = flashT > 0 && root.visible && muzzle;
    flash.visible = !!on;
    light.intensity = on ? 9000 : 0;
    if (on) {
      muzzle.getWorldPosition(_p);
      muzzle.getWorldQuaternion(_q);
      _fwd.set(0, 1, 0).applyQuaternion(_q); // a bone points down its local Y
      flash.position.copy(_p).addScaledVector(_fwd, 6);
      flash.material.rotation = Math.random() * Math.PI;
      flash.scale.setScalar(14 + Math.random() * 10);
      light.position.copy(flash.position);
    }
  }

  return {
    update, setMode,
    setVisible(v) { root.visible = v; },
    centre: () => new THREE.Vector3(x, ground + HEIGHT_PX / 2, 0),
    height: HEIGHT_PX,
  };
}
