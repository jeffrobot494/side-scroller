// ---------------------------------------------------------------------------
// GRAPHICS TESTER — a viewer for the mission's 3D models.
//
// Renders the game's OWN model code (src/mission/view3d/), fed a fake mission
// object, so a change made here is a change to the game. Lights and bloom
// copy createView3D's (src/mission/view3d/index.js).
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createSoldiers } from "../src/mission/view3d/soldier.js";
import { buildTerrain } from "../src/mission/view3d/terrain.js";
import { buildBackground } from "../src/mission/view3d/background.js";
import { createLasers } from "../src/mission/view3d/laser.js";
import { buildMist } from "../src/mission/view3d/mist.js";
import { haloPool } from "../src/mission/view3d/util.js";
import { EXPERIMENTS } from "./experiments.js";
import { createWorm, WORM_ANIMS } from "./worm.js";
import { createTrooper, TROOPER_ANIMS } from "./trooper.js";

const $ = (id) => document.getElementById(id);

// --- the fake mission ------------------------------------------------------
const WORLD = { width: 2400, height: 600 };
const GROUND = { x: -800, y: 500, w: 4000, h: 100 };
// The game's boxes (src/mission/entities.js STAND_H / CROUCH_H): crouching
// shrinks the box and keeps the feet on the ground.
const SOLDIER_W = 30, SOLDIER_H = 46, CROUCH_H = 22;

const soldier = {
  x: 600, y: GROUND.y - SOLDIER_H, w: SOLDIER_W, h: SOLDIER_H,
  color: "hsl(140 45% 52%)", alive: true, onGround: true,
  vx: 0, facing: 1, crouched: false, aimVec: null,
  hitFlash: 0, muzzleFlash: 0, burn: null,
};
const mission = {
  time: 0,
  scene: { soldiers: [soldier], world: WORLD, platforms: [GROUND], specRoots: [] },
  _gunTip: (s, cx, cy) => ({ x: cx, y: cy }),
};
const centre = () => new THREE.Vector3(soldier.x + soldier.w / 2, -(soldier.y + soldier.h / 2), 0);

// --- menus -----------------------------------------------------------------
const SUBJECTS = [
  { id: "soldier", label: "Soldier" },
  // Not the game's soldier: an adult, XCOM: Enemy Unknown-style trooper.
  { id: "trooper", label: "XCOM trooper" },
  // Not a game enemy (yet): a look, built here. The soldier stays as its target.
  { id: "worm", label: "Sand worm" },
  { id: "husk", label: "Husk charger", later: true },
  { id: "drone", label: "Drone", later: true },
  { id: "boss", label: "Boss", later: true },
];
const ANIMS = {
  idle:   { label: "Idle",          pose: () => ({ vx: 0, crouched: false, aimVec: null }) },
  run:    { label: "Run",           pose: () => ({ vx: 260, crouched: false, aimVec: null }) },
  crouch: { label: "Crouch",        pose: () => ({ vx: 0, crouched: true, aimVec: null }) },
  aim:    { label: "Aim sweep",     pose: (t) => ({ vx: 0, crouched: false, aimVec: sweep(t) }) },
  runAim: { label: "Run + aim",     pose: (t) => ({ vx: 260, crouched: false, aimVec: sweep(t) }) },
};
function sweep(t) {
  const a = Math.sin(t * 1.2) * 1.1; // ±63° off horizontal
  return { x: Math.cos(a), y: -Math.sin(a) };
}
// Subjects with their own animation tables; the fake soldier idles under them.
const ANIMS_OWN = { worm: true, trooper: true };
const MODEL_OF = { worm: "graphics-tester/worm.js", trooper: "graphics-tester/trooper.js" };
const SCENES = { mission: "Mission backdrop", studio: "Studio grey", black: "Black" };
const CAMS = { side: "Game view (side-on)", orbit: "Free orbit" };

const ui = { subject: "soldier", anim: "run", scene: "mission", cam: "orbit", on: new Set() };

function list(el, items, key, onPick) {
  el.innerHTML = "";
  for (const [id, it] of items) {
    const b = document.createElement("button");
    b.textContent = it.label ?? it;
    if (it.later) { b.disabled = true; b.innerHTML += " <small>later</small>"; }
    b.className = ui[key] === id ? "on" : "";
    b.onclick = () => { ui[key] = id; list(el, items, key, onPick); onPick?.(id); };
    el.appendChild(b);
  }
}

// --- renderer --------------------------------------------------------------
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.info.autoReset = false; // the composer renders several passes a frame
renderer.localClippingEnabled = true; // the worm is cut off at the ground

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 20000);
scene.add(new THREE.HemisphereLight("#8fb4cc", "#1a2a22", 1.3));
const key = new THREE.DirectionalLight("#c4dcff", 1.9);
key.position.set(-300, 600, 500);
scene.add(key);
const rim = new THREE.DirectionalLight("#6ef0aa", 1.1);
rim.position.set(200, 150, -600);
scene.add(rim);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(960, 540), 0.7, 0.55, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const fog = new THREE.Fog("#14232a", 1, 2);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

// The game's models, built once.
const terrain = buildTerrain([GROUND]);
scene.add(terrain);
const background = buildBackground(WORLD);
const studioGrid = new THREE.GridHelper(2000, 40, "#556070", "#2c3440");
studioGrid.position.set(soldier.x, -GROUND.y + 0.5, 0);
const halos = haloPool(scene);
// A treadmill: the soldier runs on the spot, so the air streams past instead.
const soldiers = createSoldiers(scene, { wind: (s) => -(s.vx || 0) });
const lasers = createLasers(scene);
const worm = createWorm(scene, { ground: -GROUND.y, soldier });
const trooper = createTrooper(scene, { ground: -GROUND.y, x: soldier.x + soldier.w / 2, color: soldier.color });
const mist = buildMist(WORLD, [GROUND]);
scene.add(mist.group);

function setScene(id) {
  scene.remove(background.group, studioGrid);
  if (id === "mission") { scene.add(background.group); scene.background = background.sky; }
  else if (id === "studio") { scene.add(studioGrid); scene.background = new THREE.Color("#3a414b"); }
  else scene.background = new THREE.Color("#000000");
}

// Side-on: the game's camera shape — looking down -z, framing ~300px of height
// (the worm, rearing 250px over the soldier, gets ~640).
function setCam(id) {
  const big = ui.subject === "worm";
  const c = big ? centre().add(new THREE.Vector3(60, 140, 0))
    : ui.subject === "trooper" ? trooper.centre() : centre();
  const dist = (big ? 320 : 150) / Math.tan(THREE.MathUtils.degToRad(15));
  controls.target.copy(c);
  if (id === "side") {
    camera.position.set(c.x, c.y, dist);
    controls.enabled = false;
  } else {
    camera.position.set(c.x + dist * 0.45, c.y + 60, dist * 0.55);
    controls.enabled = true;
  }
  camera.lookAt(c);
}

// --- experiments -----------------------------------------------------------
const live = new Map(); // id -> handle
function ctx() {
  return { THREE, scene, soldier, time: mission.time, camera };
}
function toggleExperiment(exp, on) {
  if (on) live.set(exp.id, exp.attach(ctx()));
  else { live.get(exp.id)?.dispose?.(); live.delete(exp.id); }
}
function buildExperiments() {
  const el = $("experiments");
  if (!EXPERIMENTS.length) {
    el.innerHTML = '<div class="empty">None yet — ask in the terminal.</div>';
    return;
  }
  for (const exp of EXPERIMENTS) {
    const l = document.createElement("label");
    l.className = "row";
    l.textContent = exp.label;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.onchange = () => toggleExperiment(exp, cb.checked);
    l.appendChild(cb);
    el.appendChild(l);
  }
}

// --- subjects --------------------------------------------------------------
// Each subject brings its own animation list. The soldier's poses the fake
// entity; the worm's are the worm's, with the soldier standing as its target.
const animsOf = (id) => (id === "worm" ? WORM_ANIMS : id === "trooper" ? TROOPER_ANIMS : ANIMS);
function pickAnim(id) {
  ui.anim = id;
  if (ui.subject === "worm") { worm.setMode(id); $("time").max = worm.duration(); }
  if (ui.subject === "trooper") trooper.setMode(id);
  list($("anims"), Object.entries(animsOf(ui.subject)), "anim", pickAnim);
}
function pickSubject(id) {
  ui.subject = id;
  list($("subjects"), SUBJECTS.map((s) => [s.id, s]), "subject", pickSubject);
  worm.setVisible(id === "worm");
  trooper.setVisible(id === "trooper");
  soldier.alive = id !== "trooper"; // the trooper stands where the game's soldier does
  $("scrub").style.display = id === "worm" ? "flex" : "none";
  pickAnim(Object.keys(animsOf(id))[id === "worm" ? 0 : 1]);
  setCam(ui.cam);
}
// The worm's timeline: paused, it holds the pose (and can be orbited);
// dragging the bar seeks, and pauses.
let paused = false, scrubbing = false;
function setPaused(on) {
  paused = on;
  $("play").textContent = on ? "▶" : "❚❚";
}
$("play").onclick = () => setPaused(!paused);
$("time").addEventListener("pointerdown", () => { scrubbing = true; });
addEventListener("pointerup", () => { scrubbing = false; });
$("time").oninput = (e) => { setPaused(true); worm.seek(+e.target.value); };

window.gt = { pickSubject, pickAnim, worm, trooper, mission, setPaused }; // for headless screenshots

// --- wiring ----------------------------------------------------------------
// ?subject=&anim=&cam= pick the starting state (headless screenshots can't click).
const q = new URLSearchParams(location.search);
if (q.get("cam") in CAMS) ui.cam = q.get("cam");
pickSubject(SUBJECTS.some((x) => x.id === q.get("subject") && !x.later) ? q.get("subject") : ui.subject);
if (q.get("anim") in animsOf(ui.subject)) pickAnim(q.get("anim"));
list($("scenes"), Object.entries(SCENES), "scene", setScene);
list($("cams"), Object.entries(CAMS), "cam", setCam);
buildExperiments();
$("bloom").oninput = (e) => { bloom.strength = +e.target.value; };
$("exposure").oninput = (e) => { renderer.toneMappingExposure = +e.target.value; };
setScene(ui.scene);
setCam(ui.cam);

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  composer.setSize(r.width, r.height);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// --- loop ------------------------------------------------------------------
let last = performance.now(), fps = 60;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  mission.time += dt * +$("speed").value;

  // A treadmill: the run pose plays in place; nothing moves in x.
  const facing = $("facing").checked ? -1 : 1;
  const p = ui.subject in ANIMS_OWN ? ANIMS.idle.pose() : ANIMS[ui.anim].pose(mission.time);
  soldier.vx = p.vx * facing;
  soldier.facing = facing;
  soldier.crouched = p.crouched;
  soldier.h = p.crouched ? CROUCH_H : SOLDIER_H;
  soldier.y = GROUND.y - soldier.h;
  soldier.onGround = true; // the worm's throw clears it below, per frame
  soldier.aimVec = p.aimVec && { x: p.aimVec.x * facing, y: p.aimVec.y };

  // Fog anchored behind the play plane, as in the game.
  const d = camera.position.distanceTo(controls.target);
  fog.near = d + 50;
  fog.far = d + 2000;
  scene.fog = $("fog").checked ? fog : null;

  // The worm moves the soldier when it throws him, so it goes before he is
  // posed; it answers with the camera shake.
  const { shake, lift } = worm.update(paused ? 0 : dt * +$("speed").value);
  if (lift > 0) { soldier.y -= lift; soldier.onGround = false; }
  trooper.update(dt * +$("speed").value, { facing });
  if (ui.subject === "worm") {
    if (!scrubbing) $("time").value = worm.time();
    $("clock").textContent = `${worm.time().toFixed(2)}s · ${worm.phase()}`;
  }

  controls.update();
  const jolt = new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0);
  camera.position.add(jolt);
  background.update(mission, { position: camera.position, target: controls.target, view: { width: 600 } });
  halos.begin();
  soldiers.sync(mission, halos);
  halos.end();
  lasers.sync(mission, soldiers.gunOf);
  mist.update(mission);
  for (const h of live.values()) h.update?.(ctx());

  renderer.info.reset();
  composer.render();
  camera.position.sub(jolt);
  const i = renderer.info.render;
  $("status").innerHTML =
    `<span>${fps.toFixed(0)} fps</span><span>${i.calls} draws</span><span>${i.triangles} tris</span>` +
    `<span>model: ${MODEL_OF[ui.subject] ?? "src/mission/view3d/soldier.js"}</span>`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener("error", (e) => { $("err").textContent = String(e.message); });
