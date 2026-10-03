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
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { config } from "../../game/config.js";
import { solveCamera3D } from "../camera.js";
import { buildBackground } from "./background.js";
import { buildTerrain } from "./terrain.js";
import { createSoldiers } from "./soldier.js";
import { createEnemies } from "./enemy.js";
import { createEffects } from "./effects.js";
import { createLasers } from "./laser.js";
import { buildMist } from "./mist.js";
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

  // Scanlines: after OutputPass, so they darken DISPLAY colour (post tone map
  // and sRGB) and bloom never blurs them. Keyed off gl_FragCoord, i.e. canvas
  // pixels, so they sit still while the camera scrolls. A cosine profile, not
  // a hard step: the canvas is CSS-scaled to the window, and a 1px hard edge
  // resampled at a non-integer scale moirés. Strength 0 disables the pass —
  // no draw, no cost.
  const scanlines = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      strength: { value: 0 },
      spacing: { value: 3 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float strength;
      uniform float spacing;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float line = 0.5 + 0.5 * cos(6.2831853 * gl_FragCoord.y / spacing);
        c.rgb *= 1.0 - strength * line;
        gl_FragColor = c;
      }`,
  });
  composer.addPass(scanlines);

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
    level.mist.group.visible = !!config.groundMist3d;
    if (level.mist.group.visible) level.mist.update(m);

    halos.begin();
    level.soldiers.sync(m, halos);
    level.enemies.sync(m, halos);
    level.effects.sync(m, halos);
    halos.end();
    // After the soldiers: the beams read the guns as posed this frame.
    if (config.laserSight3d) level.lasers.sync(m, level.soldiers.gunOf);
    else level.lasers.hide();

    const k = +config.scanlines || 0;
    scanlines.enabled = k > 0;
    scanlines.uniforms.strength.value = k;
    scanlines.uniforms.spacing.value = Math.max(2, +config.scanlineSpacing || 3);

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
      const mist = buildMist(m.scene.world, m.scene.platforms);
      scene.add(mist.group);
      level = {
        terrain,
        background,
        soldiers: createSoldiers(scene),
        enemies: createEnemies(scene),
        effects: createEffects(scene),
        lasers: createLasers(scene),
        mist,
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
      level.lasers.dispose();
      scene.remove(level.mist.group);
      level.mist.dispose();
      level = null;
    },
  };
}
