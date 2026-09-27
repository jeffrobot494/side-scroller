// ---------------------------------------------------------------------------
// MISSION 3D VIEW (tech/mission-3d.md).
//
// The same simulation drawn in Three.js, on its own canvas under the mission's
// 2D one. The only code in the game that imports `three`. Installed by
// src/main.js through `mission.setView()`; the mission calls begin(mission)
// per deploy, draw(mission, frame) per rendered frame, end(mission) at stop().
//
// It reads the mission and writes nothing back: no field on an entity, no
// draw from `scene.rng`. Cosmetic randomness is Math.random, as in 2D.
//
// THE INVARIANT: the camera looks straight down -z and its z=0 slice is this
// frame's 2D view rectangle (solveCamera3D, src/mission/camera.js), so the
// flat tells, the nav overlays, mouse aim and toWorld() are all correct over
// it without knowing it exists. Depth comes from geometry, never the camera.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { solveCamera3D } from "../camera.js";
import { buildBackground } from "./background.js";
import { buildTerrain } from "./terrain.js";
import { createSoldiers } from "./soldier.js";
import { createEnemies } from "./enemy.js";
import { createEffects } from "./effects.js";
import { haloPool, disposeTree } from "./util.js";

export function createView3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  // Pixel ratio 1 and no style writes: the drawing buffer IS the mission
  // canvas's backing store, so the letterbox rule in hub.css sizes both
  // canvases to one box.
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0c1424");
  // Fog is measured from the PLAY PLANE, not the camera: it starts just behind
  // z=0 and is re-anchored every frame, because the camera's distance changes
  // with zoom and fog on the play plane would change readability with it.
  scene.fog = new THREE.Fog("#14232a", 1, 2);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 10000);

  // Moonlit night over a green-lit horizon: a cool key from above-left, a
  // hemisphere fill, and a green rim from behind that outlines bodies against
  // the dark skyline.
  scene.add(new THREE.HemisphereLight("#8fb4cc", "#1a2a22", 1.3));
  const key = new THREE.DirectionalLight("#c4dcff", 1.9);
  key.position.set(-300, 600, 500);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#6ef0aa", 1.1);
  rim.position.set(200, 150, -600);
  scene.add(rim);

  // Bloom: emissive things — lit edges, visors, shots, flashes — glow.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(960, 540), 0.7, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let level = null; // everything built for one deploy
  const halos = haloPool(scene);

  function draw(m, f) {
    if (!level) return;
    if (canvas.width !== f.W || canvas.height !== f.H) {
      renderer.setSize(f.W, f.H, false);
      composer.setSize(f.W, f.H);
    }
    const c = solveCamera3D(m.camera, f.z, f.W, f.H, f.sx, f.sy);
    camera.fov = c.fov;
    camera.aspect = c.aspect;
    camera.near = c.near;
    camera.far = c.far;
    camera.position.set(c.position.x, c.position.y, c.position.z);
    camera.lookAt(c.target.x, c.target.y, c.target.z);
    camera.updateProjectionMatrix();
    scene.fog.near = c.position.z + 50;
    scene.fog.far = c.position.z + 2000;
    level.background.update(m, c);

    halos.begin();
    level.soldiers.sync(m, halos);
    level.enemies.sync(m, halos);
    level.effects.sync(m);
    halos.end();

    composer.render();
  }

  return {
    begin(m) {
      this.end();
      const terrain = buildTerrain(m.scene.platforms);
      scene.add(terrain);
      const background = buildBackground(m.scene.world);
      scene.add(background.group);
      scene.background = background.sky;
      level = {
        terrain,
        background,
        soldiers: createSoldiers(scene),
        enemies: createEnemies(scene),
        effects: createEffects(scene),
      };
    },
    draw,
    end() {
      if (!level) return;
      scene.remove(level.terrain);
      disposeTree(level.terrain);
      scene.remove(level.background.group);
      disposeTree(level.background.group);
      level.background.sky.dispose();
      level.soldiers.dispose();
      level.enemies.dispose();
      level.effects.dispose();
      level = null;
    },
  };
}
