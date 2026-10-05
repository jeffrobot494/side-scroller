// ---------------------------------------------------------------------------
// GRAPHICS TESTER — the start screen's scene (a look, not the game's yet).
//
// splash-screen.png, staged in 3D for a 16:9 screen: three of the game's own
// soldiers (createSoldiers) on burning rubble, a carrier hanging over them in
// an X of blades, Earth behind it, the sun and the outer planets around on
// gold orbit lines, the Blender enemy roster in the sky and the ruins, and
// the title in extruded gold. Visuals only: there is no menu and no input but
// mouse parallax.
//
// Everything is in the game's px units (a soldier is 30x46). The title has its
// own scene and camera, drawn over the world into the same composer, so it
// stays put while the world camera drifts and still blooms.
//
// ?t=SECONDS starts the clock there (headless screenshots of the loop).
// ?pr=N renders at pixel ratio N (default 1, capped at the screen's).
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { TTFLoader } from "three/addons/loaders/TTFLoader.js";
import { Font, FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { createSoldiers } from "../src/mission/view3d/soldier.js";
import { createEnemyModels } from "./enemies.js";

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const T0 = +Q.get("t") || 0;

// --- the stage, as numbers ----------------------------------------------------
const STAGE = {
  cam: { pos: [0, 20, 150], look: [0, 120, -300], fov: 45, intro: [0, -12, 130] },
  sunPos: [-3600, 3300, -6000],
  // Where the planets are lit from: front-left and high, so their faces read.
  planetLight: [-6000, 5000, 6000],
  ship: { pos: [0, 196, -600], scale: 1.05, drop: 420 },
  earth: { pos: [0, 820, -3000], r: 1100 },
  soldiers: [
    // x, ground, facing, yaw, crouched, aim (entity space, y down), colour
    { x: -64, ground: 9, facing: -1, yaw: 0.6, crouched: true, aim: [-0.92, -0.38], color: "hsl(38 10% 74%)" },
    { x: 0, ground: 15, facing: 1, yaw: -0.95, crouched: false, aim: [0.12, -1], color: "hsl(40 14% 82%)" },
    { x: 64, ground: 6, facing: 1, yaw: -0.55, crouched: false, aim: [0.9, -0.44], color: "hsl(38 10% 74%)" },
  ],
  title: { z: -60, lines: [["SOLAR", 5.8, 17.4], ["DEFENSE FORCE", 3.9, 11.6]] },
};
const FONT_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/russoone/RussoOne-Regular.ttf";
const FONT_FALLBACK = "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/helvetiker_bold.typeface.json";

// --- shared GLSL ------------------------------------------------------------
const NOISE = /* glsl */ `
float hash3(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)), f.x), mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x), mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a*vnoise(p); p = p*2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++){ s += a*vnoise(p); p = p*2.07 + vec3(4.1, 1.3, 7.7); a *= 0.5; } return s; }
`;
const hdr = (r, g, b) => new THREE.Color(r, g, b);

// --- renderer, scenes, cameras ----------------------------------------------
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
// 1, not the screen's: at 2 every pass below pays for 4x the pixels.
renderer.setPixelRatio(Math.min(+Q.get("pr") || 1, devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2("#3a1c12", 0.0003);
const camera = new THREE.PerspectiveCamera(STAGE.cam.fov, 16 / 9, 2, 30000);
const titleScene = new THREE.Scene();
const titleCam = new THREE.PerspectiveCamera(STAGE.cam.fov, 16 / 9, 0.5, 400);

const clock = { t: T0 };
const SUN = new THREE.Vector3(...STAGE.sunPos);
const SUN_DIR = SUN.clone().normalize();
const PLANET_LIGHT = new THREE.Vector3(...STAGE.planetLight);

// An environment for the metals: blue-violet space above, a white-gold band at
// the horizon (the sun and the fires), burning orange below.
function makeEnv() {
  const s = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vD; void main(){
      float y = vD.y;
      vec3 c = mix(vec3(0.9,0.35,0.08), vec3(0.08,0.06,0.25), smoothstep(-0.3, 0.6, y));
      c += vec3(1.4,1.0,0.6) * exp(-abs(y-0.05)*18.0);
      c += vec3(4.0,3.0,2.0) * pow(max(dot(vD, normalize(vec3(-0.5,0.5,0.6))), 0.0), 80.0);
      c += vec3(1.5,0.6,0.2) * pow(max(dot(vD, normalize(vec3(0.6,-0.2,0.7))), 0.0), 6.0);
      gl_FragColor = vec4(c, 1.0); }`,
  });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), m));
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return env;
}
const ENV = makeEnv();

// --- baked noise -----------------------------------------------------------------
// Noise that does not move is computed once, here, into textures: a frame then
// pays a texture read where it used to pay an fbm per pixel.
const FULL_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
function bake(w, h, fragmentShader, wrapT = THREE.ClampToEdgeWrapping) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, depthBuffer: false });
  rt.texture.wrapS = THREE.RepeatWrapping;
  rt.texture.wrapT = wrapT;
  const quad = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: FULL_VS, fragmentShader }));
  renderer.setRenderTarget(rt);
  quad.render(renderer);
  renderer.setRenderTarget(null);
  quad.material.dispose();
  quad.dispose();
  return rt.texture;
}
// One tile of periodic value-noise fbm, TILE lattice cells across, so it
// repeats without a seam: r and g and a are 6-octave fbm (different seeds), b
// is 3-octave. Each octave is a slice through 3D value noise, as every caller
// used to sample it (a plane through fbm(vec3)) — 2D noise has more contrast,
// and the fire's edges and the cracks' thresholds are tuned to 3D's. `T(p)`
// reads it with one cell per unit, NOISE's scale, so `fbm(q)` is `T(q.xy).r`.
const TILE = 16;
const NOISE_TEX = bake(1024, 1024, NOISE + /* glsl */ `
  varying vec2 vUv;
  float pn(vec3 x, float P){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    vec2 a = mod(i.xy, P), b = mod(i.xy + 1.0, P); float z0 = i.z, z1 = i.z + 1.0;
    return mix(mix(mix(hash3(vec3(a, z0)), hash3(vec3(b.x, a.y, z0)), f.x), mix(hash3(vec3(a.x, b.y, z0)), hash3(vec3(b, z0)), f.x), f.y),
               mix(mix(hash3(vec3(a, z1)), hash3(vec3(b.x, a.y, z1)), f.x), mix(hash3(vec3(a.x, b.y, z1)), hash3(vec3(b, z1)), f.x), f.y), f.z); }
  float pf(vec2 uv, int oct, float s){ float a = 0.5, sum = 0.0, P = ${TILE}.0; vec2 x = uv*P;
    for (int i = 0; i < 6; i++){ if (i >= oct) break; sum += a*pn(vec3(x, s + 0.37 + float(i)*3.71), P); x *= 2.0; P *= 2.0; a *= 0.5; }
    return sum; }
  void main(){ gl_FragColor = vec4(pf(vUv, 6, 0.0), pf(vUv, 6, 50.0), pf(vUv, 3, 100.0), pf(vUv, 6, 150.0)); }`, THREE.RepeatWrapping);
const NOISE_T = `uniform sampler2D uNoise; vec4 T(vec2 p){ return texture2D(uNoise, p / ${TILE}.0); }`;
// A point on the unit sphere from a SphereGeometry uv, as three builds the
// sphere: a bake over uv covers the surface exactly, seams and poles included.
const SPHERE_P = `float phi = vUv.x*6.2831853, th = (1.0 - vUv.y)*3.14159265;
  vec3 p = vec3(-cos(phi)*sin(th), cos(th), sin(phi)*sin(th));`;

// --- canvas textures ----------------------------------------------------------
function canvasTex(size, draw, srgb = true) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW = canvasTex(128, (g, n) => {
  const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.18, "rgba(255,255,255,0.55)");
  r.addColorStop(0.5, "rgba(255,255,255,0.12)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, n, n);
});
const STAR = canvasTex(256, (g, n) => {
  g.translate(n / 2, n / 2);
  const r = g.createRadialGradient(0, 0, 0, 0, 0, n / 2);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.08, "rgba(255,255,255,0.8)");
  r.addColorStop(0.3, "rgba(255,255,255,0.1)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(-n / 2, -n / 2, n, n);
  for (const [len, wid, rot] of [[0.5, 0.035, 0], [0.5, 0.035, Math.PI / 2], [0.3, 0.02, Math.PI / 4], [0.3, 0.02, -Math.PI / 4]]) {
    g.save(); g.rotate(rot);
    const l = g.createLinearGradient(-n * len, 0, n * len, 0);
    l.addColorStop(0, "rgba(255,255,255,0)"); l.addColorStop(0.5, "rgba(255,255,255,1)"); l.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = l;
    g.beginPath(); g.ellipse(0, 0, n * len, n * wid, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
});
const SMOKE = canvasTex(128, (g, n) => {
  for (let i = 0; i < 60; i++) {
    const x = n / 2 + (Math.random() - 0.5) * n * 0.5, y = n / 2 + (Math.random() - 0.5) * n * 0.5, r = n * (0.1 + Math.random() * 0.2);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,255,255,0.18)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
  }
});
// Hull plating: panel seams by recursive splits, rivets along them, grime and
// scorch. Used as colour and as bump.
const HULL = canvasTex(1024, (g, n) => {
  g.fillStyle = "#d8d0c0"; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * n, Math.random() * n, 2 + Math.random() * 30, 2 + Math.random() * 30);
  }
  const panels = [];
  (function split(x, y, w, h, d) {
    if (d > 5 || (d > 2 && Math.random() < 0.25) || w < 60 || h < 60) { panels.push([x, y, w, h]); return; }
    if (w > h) { const k = w * (0.3 + Math.random() * 0.4); split(x, y, k, h, d + 1); split(x + k, y, w - k, h, d + 1); }
    else { const k = h * (0.3 + Math.random() * 0.4); split(x, y, w, k, d + 1); split(x, y + k, w, h - k, d + 1); }
  })(0, 0, n, n, 0);
  for (const [x, y, w, h] of panels) {
    const tone = 200 + Math.random() * 40;
    g.fillStyle = `rgba(${tone},${tone - 8},${tone - 22},0.35)`; g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.strokeStyle = "rgba(40,30,20,0.85)"; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    g.strokeStyle = "rgba(255,250,235,0.5)"; g.lineWidth = 1; g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = "rgba(50,40,30,0.8)";
    for (let k = 10; k < w - 6; k += 18) { g.fillRect(x + k, y + 6, 3, 3); g.fillRect(x + k, y + h - 9, 3, 3); }
    if (Math.random() < 0.08) { g.fillStyle = "rgba(170,90,30,0.35)"; for (let s = 0; s < 4; s++) g.fillRect(x + 8 + s * 14, y + 8, 7, h - 16); }
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * n, y = Math.random() * n, r = 20 + Math.random() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(30,20,12,0.45)"); gr.addColorStop(1, "rgba(30,20,12,0)");
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
  }
  for (let i = 0; i < 300; i++) { g.fillStyle = "rgba(20,15,10,0.6)"; g.fillRect(Math.random() * n, Math.random() * n, 2 + Math.random() * 4, 1 + Math.random() * 3); }
});
HULL.wrapS = HULL.wrapT = THREE.RepeatWrapping;
HULL.anisotropy = 8;

const sprite = (tex, color, size, opacity = 1, additive = true) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
  }));
  s.scale.setScalar(size);
  return s;
};

// --- sky: nebula, stars, sun ---------------------------------------------------
// The nebula and the fire's glow on the horizon are baked into a cube map; the
// stars (they twinkle) and the sun's corona are cheap and stay live.
const NEBULA = (() => {
  const s = new THREE.Scene();
  const m = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: NOISE + /* glsl */ `
      varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float n1 = fbm(d*2.2);
        float n2 = fbm(d*4.5 + n1*1.8);
        float n3 = fbm(d*9.0 - n2);
        vec3 col = vec3(0.004, 0.008, 0.035);
        col = mix(col, vec3(0.09, 0.025, 0.2), smoothstep(0.35, 0.72, n1));
        col = mix(col, vec3(0.03, 0.12, 0.38), smoothstep(0.48, 0.8, n2) * 0.85);
        col += vec3(0.55, 0.12, 0.45) * pow(smoothstep(0.5, 0.95, n2*n1*1.75), 2.0) * 0.7;
        col += vec3(0.15, 0.4, 0.9) * pow(smoothstep(0.55, 0.9, n3*n2*1.8), 3.0) * 0.6;
        col *= mix(1.0, 0.3, smoothstep(0.52, 0.72, fbm(d*7.0 + 3.0)) * 0.8);
        // the planet burning below
        col += vec3(1.0, 0.32, 0.06) * smoothstep(0.12, -0.25, d.y) * 1.1;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  s.add(m);
  const rt = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType });
  new THREE.CubeCamera(0.1, 100, rt).update(renderer, s);
  m.geometry.dispose();
  m.material.dispose();
  return rt.texture;
})();
const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 64, 32), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIR }, uNeb: { value: NEBULA } },
  vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: NOISE + /* glsl */ `
    uniform float uTime; uniform vec3 uSun; uniform samplerCube uNeb; varying vec3 vD;
    void main(){
      vec3 d = normalize(vD);
      vec3 col = textureCube(uNeb, d).rgb;
      // stars: two layers of hashed cells
      for (int L = 0; L < 2; L++){
        float sc = L == 0 ? 260.0 : 620.0;
        vec3 sp = d*sc; vec3 c = floor(sp); float h = hash3(c);
        if (h > (L == 0 ? 0.965 : 0.93)){
          vec3 f = fract(sp) - 0.5 - (vec3(hash3(c+1.3), hash3(c+2.1), hash3(c+3.7)) - 0.5)*0.5;
          float s = smoothstep(L == 0 ? 0.16 : 0.1, 0.0, length(f));
          float tw = 0.6 + 0.4*sin(uTime*(1.5 + h*5.0) + h*80.0);
          vec3 tint = mix(vec3(0.7,0.8,1.0), vec3(1.0,0.85,0.6), hash3(c+9.0));
          col += tint * s * tw * (L == 0 ? 2.2 : 0.9);
        }
      }
      // the sun's corona and a warm wash toward it
      float sd = max(dot(d, uSun), 0.0);
      col += vec3(1.0, 0.65, 0.3) * pow(sd, 6.0) * 0.35 + vec3(1.0, 0.8, 0.5) * pow(sd, 60.0) * 1.5;
      gl_FragColor = vec4(col, 1.0);
    }`,
}));
scene.add(sky);

// The brightest stars, as points so they twinkle with a flare.
{
  const N = 700, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection();
    v.y = Math.abs(v.y) * 0.9 + 0.05; v.z = -Math.abs(v.z);
    v.normalize().multiplyScalar(18000);
    pos.set([v.x, v.y, v.z], i * 3); seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uMap: { value: STAR }, uPx: { value: 1 } },
    vertexShader: `attribute float seed; uniform float uTime, uPx; varying float vS; varying float vA;
      void main(){ vS = seed; vA = 0.55 + 0.45*sin(uTime*(0.8+seed*3.0) + seed*60.0);
        gl_PointSize = uPx * (seed > 0.93 ? 26.0 : 7.0 + seed*7.0) * (0.75 + 0.35*vA);
        gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uMap; varying float vS; varying float vA;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord);
        vec3 c = mix(vec3(0.7,0.82,1.0), vec3(1.0,0.86,0.62), step(0.5, fract(vS*7.0)));
        gl_FragColor = vec4(c * t.rgb * vA * 2.2, t.a); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.userData.tick = (t) => { m.uniforms.uTime.value = t; m.uniforms.uPx.value = renderer.getPixelRatio(); };
  scene.add(pts);
  var bigStars = pts;
}

const sunGroup = new THREE.Group();
sunGroup.position.copy(SUN);
const sunCore = sprite(GLOW, hdr(30, 22, 14), 650);
const sunHalo = sprite(GLOW, hdr(1.4, 0.75, 0.3), 1500, 0.6);
const sunStar = sprite(STAR, hdr(5, 3.8, 2.6), 2600);
sunGroup.add(sunHalo, sunCore, sunStar);
scene.add(sunGroup);

// --- planets -----------------------------------------------------------------
const PLANET_VS = /* glsl */ `
  varying vec3 vN; varying vec2 vUv; varying vec3 vW;
  void main(){ vN = normalize(mat3(modelMatrix)*normal); vUv = uv;
    vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
// Each kind is a body of GLSL that sets `alb` (albedo) and `spec` — and on
// Earth the `burn` and `city` masks — from `p`, the unit surface point. Run once
// per kind into textures (planetTex); lighting and spin are per frame.
const SURFACE = {
  earth: /* glsl */ `
    float land = fbm(p*1.7 + 4.0);
    float isLand = smoothstep(0.515, 0.535, land);
    float coast = smoothstep(0.47, 0.515, land) * (1.0 - isLand);
    vec3 ocean = mix(vec3(0.005, 0.03, 0.12), vec3(0.02, 0.16, 0.32), coast);
    float dry = fbm(p*5.0 + 1.0);
    vec3 ground = mix(vec3(0.07, 0.16, 0.04), vec3(0.42, 0.3, 0.14), smoothstep(0.45, 0.65, dry + abs(p.y)*0.2 - 0.1));
    alb = mix(ocean, ground, isLand);
    float ice = smoothstep(0.78, 0.86, abs(p.y) + (fbm(p*6.0)-0.5)*0.15);
    alb = mix(alb, vec3(0.85, 0.9, 0.95), ice);
    spec = (1.0 - isLand) * (1.0 - ice);
    // the invasion: fires burning across the land, both sides of the terminator
    burn = smoothstep(0.62, 0.72, fbm(p*7.0 + 11.0)) * isLand * (1.0 - ice);
    // city lights, shown on the night side
    city = step(0.94, hash3(floor(p*220.0))) * isLand * smoothstep(0.55, 0.62, fbm(p*3.0 + 7.0));
  `,
  jupiter: /* glsl */ `
    float b = p.y*11.0 + fbm(p*vec3(2.0, 10.0, 2.0))*2.2;
    vec3 cream = vec3(0.86, 0.74, 0.56), orange = vec3(0.72, 0.42, 0.2), brown = vec3(0.42, 0.24, 0.13);
    alb = mix(cream, orange, smoothstep(-0.3, 0.6, sin(b)));
    alb = mix(alb, brown, smoothstep(0.55, 1.0, sin(b*2.3 + 1.0)) * 0.6);
    vec3 spot = normalize(vec3(0.45, -0.32, 0.84));
    float sd = length((p - spot) * vec3(1.0, 2.2, 1.0));
    alb = mix(alb, vec3(0.62, 0.2, 0.1), smoothstep(0.2, 0.08, sd + (fbm(p*20.0)-0.5)*0.05));
  `,
  saturn: /* glsl */ `
    float b = p.y*9.0 + fbm(p*vec3(2.0, 12.0, 2.0))*1.2;
    alb = mix(vec3(0.88, 0.78, 0.55), vec3(0.7, 0.56, 0.34), smoothstep(-0.4, 0.8, sin(b)));
    alb = mix(alb, vec3(0.55, 0.45, 0.3), smoothstep(0.7, 1.0, sin(b*2.7)) * 0.4);
  `,
  mars: /* glsl */ `
    float nn = fbm(p*3.5);
    alb = mix(vec3(0.5, 0.17, 0.08), vec3(0.75, 0.38, 0.18), smoothstep(0.35, 0.7, nn));
    alb = mix(alb, vec3(0.25, 0.1, 0.06), smoothstep(0.6, 0.75, fbm(p*6.0 + 3.0)) * 0.7);
    alb = mix(alb, vec3(0.9, 0.85, 0.8), smoothstep(0.88, 0.93, abs(p.y)));
  `,
  rock: /* glsl */ `
    float nn = fbm(p*4.0);
    float cr = smoothstep(0.02, 0.0, abs(fbm(p*9.0) - 0.5)) * 0.4;
    alb = vec3(0.42, 0.4, 0.38) * (0.6 + nn*0.8) - cr*0.2;
  `,
  ice: /* glsl */ `
    float b = p.y*6.0 + fbm(p*vec3(2.0, 7.0, 2.0))*1.5;
    alb = mix(vec3(0.12, 0.3, 0.6), vec3(0.3, 0.55, 0.85), smoothstep(-0.5, 0.9, sin(b)));
  `,
};
// The surface textures, one set per kind: Earth 2048 wide, the gas giants
// 1024, the small ones 512.
const PLANET_TEX = {};
function planetTex(kind) {
  if (PLANET_TEX[kind]) return PLANET_TEX[kind];
  const [w, h] = kind === "earth" ? [2048, 1024] : kind === "jupiter" || kind === "saturn" ? [1024, 512] : [512, 256];
  const src = (out) => NOISE + `varying vec2 vUv;
    void main(){ ${SPHERE_P}
      vec3 alb = vec3(0.5); float spec = 0.0, burn = 0.0, city = 0.0;
      ${SURFACE[kind]}
      gl_FragColor = ${out}; }`;
  const t = { a: bake(w, h, src("vec4(alb, spec)")) };
  if (kind === "earth") t.b = bake(w, h, src("vec4(burn, city, 0.0, 1.0)"));
  return (PLANET_TEX[kind] = t);
}
function planetMaterial(kind, atmo, spin) {
  const tex = planetTex(kind);
  return new THREE.ShaderMaterial({
    fog: false,
    defines: tex.b ? { EMIT: "" } : {},
    uniforms: {
      uTime: { value: 0 }, uSun: { value: PLANET_LIGHT }, uAtmo: { value: new THREE.Color(...atmo) }, uSpin: { value: spin },
      uA: { value: tex.a }, uB: { value: tex.b ?? tex.a },
    },
    vertexShader: PLANET_VS,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSpin; uniform vec3 uSun, uAtmo; uniform sampler2D uA, uB;
      varying vec3 vN; varying vec2 vUv; varying vec3 vW;
      void main(){
        vec3 n = normalize(vN);
        vec3 L = normalize(uSun - vW);
        vec3 V = normalize(cameraPosition - vW);
        float ndl = dot(n, L);
        vec2 uv = vec2(vUv.x - uTime*uSpin*0.15915494, vUv.y);  // the spin, as a turn of the texture
        vec4 A = texture2D(uA, uv);
        vec3 alb = A.rgb; float spec = A.a;
        float diff = smoothstep(-0.12, 1.0, ndl);
        vec3 col = alb * (diff * vec3(1.15, 1.05, 0.95) * 1.6 + vec3(0.012, 0.012, 0.03));
        col += alb * vec3(1.0, 0.35, 0.1) * max(0.0, -n.y) * 0.18;       // fire bounce from below
        vec3 H = normalize(L + V);
        col += vec3(1.0, 0.85, 0.6) * pow(max(dot(n, H), 0.0), 60.0) * spec * 1.5 * step(0.0, ndl);
        float fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        col += uAtmo * fr * (0.15 + 1.4*smoothstep(-0.3, 0.6, ndl));
        #ifdef EMIT
          vec2 B = texture2D(uB, uv).rg;
          col += vec3(2.4, 0.9, 0.2) * B.r * (0.7 + 0.3*sin(uTime*3.0 + uv.x*250.0));
          col += vec3(1.4, 0.8, 0.35) * B.g * smoothstep(0.05, -0.25, ndl);
        #endif
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
function atmosphere(r, color, k = 1.12, power = 1.6) {
  return new THREE.Mesh(new THREE.SphereGeometry(r * k, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uC: { value: new THREE.Color(...color) }, uSun: { value: SUN }, uK: { value: k }, uPow: { value: power } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(normalMatrix*normal);
      vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uC; uniform vec3 uSun; uniform float uK, uPow; varying vec3 vN; varying vec3 vW;
      void main(){ float e = -vN.z; float lim = sqrt(1.0 - 1.0/(uK*uK));
        float a = pow(smoothstep(0.0, lim, e), uPow);
        gl_FragColor = vec4(uC * a, 1.0); }`,
  }));
}
const planets = [];
function planet(kind, r, pos, { atmo = [0.3, 0.5, 1], spin = 0.02, tilt = 0.2, halo = null, segs = 96 } = {}) {
  const g = new THREE.Group();
  g.position.set(...pos);
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, segs, segs / 2), planetMaterial(kind, atmo, spin));
  m.rotation.z = tilt;
  g.add(m);
  if (halo) g.add(atmosphere(r, halo[0], halo[1], halo[2]));
  scene.add(g);
  planets.push(m.material);
  return g;
}

const E = STAGE.earth;
const earth = planet("earth", E.r, E.pos, { atmo: [0.35, 0.6, 1.4], spin: 0.012, tilt: 0.35, halo: [[0.35, 0.65, 1.6], 1.09, 1.4], segs: 160 });
// Clouds over Earth: a separate shell, turning a little faster.
{
  const tex = bake(2048, 1024, NOISE + /* glsl */ `
    varying vec2 vUv;
    void main(){ ${SPHERE_P}
      float c = smoothstep(0.5, 0.75, fbm(p*3.0 + fbm(p*6.0)));
      float smoke = smoothstep(0.62, 0.8, fbm(p*5.0 + 20.0)) * 0.7;
      gl_FragColor = vec4(c, smoke, 0.0, 1.0); }`);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uSun: { value: PLANET_LIGHT }, uC: { value: tex } },
    vertexShader: PLANET_VS,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSun; uniform sampler2D uC; varying vec3 vN; varying vec2 vUv; varying vec3 vW;
      void main(){ vec3 n = normalize(vN); float ndl = dot(n, normalize(uSun - vW));
        vec2 C = texture2D(uC, vec2(vUv.x - uTime*0.02*0.15915494, vUv.y)).rg;
        vec3 col = mix(vec3(1.0), vec3(0.15, 0.1, 0.08), C.g) * (smoothstep(-0.15, 0.8, ndl) * 1.4 + 0.02);
        gl_FragColor = vec4(col, max(C.r, C.g) * 0.85); }`,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(E.r * 1.012, 128, 64), m);
  earth.add(clouds);
  planets.push(m);
}
planet("jupiter", 600, [-2450, 1710, -4600], { atmo: [0.9, 0.6, 0.3], spin: 0.03, tilt: 0.12, halo: [[0.8, 0.5, 0.25], 1.05, 2.0] });
const saturn = planet("saturn", 440, [2520, 1815, -4600], { atmo: [0.9, 0.75, 0.4], spin: 0.03, tilt: -0.25, halo: [[0.8, 0.65, 0.3], 1.05, 2.0] });
{
  // Saturn's rings: radial bands with gaps, lit, shadowed by the planet on the far side.
  const r = 440, g = new THREE.RingGeometry(r * 1.3, r * 2.35, 256, 1);
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false,
    uniforms: { uIn: { value: r * 1.3 }, uOut: { value: r * 2.35 } },
    vertexShader: `varying vec3 vL; void main(){ vL = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: NOISE + `uniform float uIn, uOut; varying vec3 vL;
      void main(){ float t = (length(vL.xy) - uIn)/(uOut - uIn);
        float b = 0.55 + 0.45*sin(t*90.0) * sin(t*23.0 + 1.0);
        b *= smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.9, t) * (1.0 - smoothstep(0.58, 0.6, t)*smoothstep(0.66, 0.64, t));
        b *= 0.7 + 0.5*hash2(vec2(floor(t*300.0), 1.0));
        vec3 c = mix(vec3(0.85, 0.72, 0.5), vec3(1.0, 0.92, 0.75), t) * 1.4;
        gl_FragColor = vec4(c, b * 0.85); }`,
  });
  const ring = new THREE.Mesh(g, m);
  ring.rotation.set(-1.25, 0.3, 0.35);
  saturn.add(ring);
}
planet("mars", 105, [1021, 390, -1700], { atmo: [1.0, 0.45, 0.25], spin: 0.04, tilt: 0.3, halo: [[0.9, 0.4, 0.2], 1.07, 1.8] });
planet("ice", 127, [-1090, 360, -1700], { atmo: [0.4, 0.7, 1.0], spin: 0.03, tilt: 0.4, halo: [[0.3, 0.6, 1.2], 1.08, 1.6] });
planet("rock", 110, [-913, 1230, -2800], { atmo: [0.6, 0.6, 0.7], spin: 0.05, tilt: 0.1 });
planet("rock", 60, [2600, 1305, -4000], { atmo: [0.6, 0.6, 0.7], spin: 0.05 });
planet("mars", 70, [-1390, 373, -2900], { atmo: [0.9, 0.5, 0.3], spin: 0.05 });
planet("ice", 45, [1100, 1500, -3000], { atmo: [0.4, 0.7, 1.0] });

// Orbit lines: thin gold tubes on tilted ellipses round Earth, a bright pulse
// running each one.
const orbits = [];
function orbit(rx, rz, centre, rot, speed, color = [3.0, 1.8, 0.7], thick = 3.5) {
  const pts = [];
  for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * rx, 0, Math.sin(a) * rz)); }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uC: { value: new THREE.Color(...color) }, uSpeed: { value: speed } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime, uSpeed; uniform vec3 uC; varying vec2 vUv;
      void main(){ float u = fract(vUv.x - uTime*uSpeed);
        float pulse = pow(u, 20.0)*8.0 + pow(fract(vUv.x*3.0 - uTime*uSpeed*1.7), 40.0)*3.0;
        float edge = 1.0 - abs(vUv.y - 0.5)*2.0;
        gl_FragColor = vec4(uC * (0.45 + pulse) * edge, 1.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 512, thick, 6, true), m);
  mesh.position.set(...centre);
  mesh.rotation.set(...rot);
  scene.add(mesh);
  orbits.push(m);
}
orbit(1700, 1700, E.pos, [1.36, 0.0, 0.22], 0.03, [3.0, 1.8, 0.7], 6);
orbit(2300, 2300, E.pos, [1.4, 0.0, -0.2], -0.02, [2.4, 1.6, 0.8], 8);
orbit(3000, 3000, [E.pos[0], E.pos[1] + 200, E.pos[2] - 300], [1.46, 0.0, 0.1], 0.015, [1.6, 1.1, 2.2], 10);
orbit(1300, 1300, E.pos, [1.25, 0.0, -0.45], 0.05, [3.0, 1.2, 0.4], 4);

// --- distant fire: the burning cloud bank, two layers ----------------------------
const fireLayers = [];
function fireBank(z, w, h, y, rise, seed, bright) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uAspect: { value: w / h }, uRise: { value: rise }, uBright: { value: bright }, uNoise: { value: NOISE_TEX } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: NOISE_T + /* glsl */ `
      uniform float uTime, uSeed, uAspect, uRise, uBright; varying vec2 vUv;
      void main(){
        vec2 p = vec2(vUv.x*uAspect, vUv.y) * 2.6;
        // The tile scrolls up and across, and the warp drifts against it.
        vec2 q = p + vec2(uTime*0.015, -uTime*0.05) + uSeed*3.1;
        float w = T(q*0.7 + vec2(uTime*0.012, 0.0)).b;
        float n = T(q + w*1.6 + vec2(0.0, uTime*0.02)).r;
        float side = pow(abs(vUv.x - 0.5)*2.0, 1.6);
        float edge = 0.38 + uRise*side + (n - 0.5)*0.5;
        float a = smoothstep(edge, edge - 0.035, vUv.y);
        float depth = edge - vUv.y;
        // billows: bright cores, dark red crevices, a smoky rim at the top
        float bil = T(q*1.9 + w + 5.0).a;
        float heat = clamp(1.0 - vUv.y/max(edge, 0.05), 0.0, 1.0);
        vec3 col = mix(vec3(0.22, 0.035, 0.01), vec3(1.5, 0.48, 0.08), smoothstep(0.3, 0.62, bil));
        col = mix(col, vec3(3.2, 1.7, 0.45), pow(smoothstep(0.5, 0.85, bil), 2.0) * (0.35 + heat));
        col *= mix(0.25, 1.0, smoothstep(0.0, 0.14, depth));
        col += vec3(0.9, 0.25, 0.04) * heat * 0.5;
        gl_FragColor = vec4(col * uBright, a);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(0, y, z);
  scene.add(mesh);
  fireLayers.push(m);
  return mesh;
}
fireBank(-1900, 7200, 1900, 600, 0.9, 3.0, 0.9);
fireBank(-950, 3600, 1000, 150, 0.75, 9.0, 0.8);

// --- ruins: a broken skyline, windows lit by the fires ----------------------------
{
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { uTime: { value: 0 }, uNoise: { value: NOISE_TEX } },
    vertexShader: `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz;
      vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: NOISE + NOISE_T + /* glsl */ `
      uniform float uTime; varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 n = normalize(vN);
        float u = abs(n.x) > 0.5 ? vW.z : vW.x;
        vec2 cell = floor(vec2(u/7.0, vW.y/9.0));
        vec2 f = fract(vec2(u/7.0, vW.y/9.0));
        float win = step(0.25, f.x)*step(f.x, 0.75)*step(0.3, f.y)*step(f.y, 0.75) * (1.0 - step(0.5, abs(n.y)));
        float h = hash2(cell + floor(vW.z*0.01)*17.0);
        float lit = step(0.88, h) * (0.6 + 0.4*sin(uTime*(2.0 + h*6.0) + h*30.0));
        vec3 base = vec3(0.05, 0.035, 0.03) * (0.6 + 0.6*T(vW.xy*0.05 + vW.z*0.03).b);
        base += vec3(0.6, 0.18, 0.04) * smoothstep(60.0, -20.0, vW.y) * 0.35;  // fire glow from below
        base += vec3(0.25, 0.1, 0.05) * max(n.z, 0.0) * 0.3;
        vec3 col = base + win * lit * vec3(2.2, 0.9, 0.25);
        float d = length(vW - cameraPosition);
        col = mix(col, vec3(0.22, 0.06, 0.025), smoothstep(400.0, 1800.0, d) * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.Group();
  const rnd = mulberry(7);
  for (let i = 0; i < 70; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const x = side * (90 + rnd() * 900);
    const z = -480 - rnd() * 900;
    const w = 26 + rnd() * 60, d = 20 + rnd() * 40;
    // taller toward the edges, low in the middle so the ship and Earth read
    const h = (30 + rnd() * 130) * (0.45 + Math.min(1, Math.abs(x) / 500) * 0.9);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2 - 20, z);
    b.rotation.y = (rnd() - 0.5) * 0.3;
    b.rotation.z = (rnd() - 0.5) * 0.08;
    g.add(b);
    // a broken top: a slab or two tipped off
    for (let k = 0; k < (rnd() * 3) | 0; k++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w * (0.3 + rnd() * 0.5), 6 + rnd() * 18, d * 0.8), mat);
      s.position.set(x + (rnd() - 0.5) * w * 0.6, h - 20 + 4 + rnd() * 8, z);
      s.rotation.z = (rnd() - 0.5) * 1.1;
      g.add(s);
    }
    // a bare spire or girder sticking out of some
    if (rnd() < 0.3) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(3, 30 + rnd() * 50, 3), mat);
      s.position.set(x + (rnd() - 0.5) * w * 0.5, h - 20 + 15, z);
      s.rotation.z = (rnd() - 0.5) * 0.6;
      g.add(s);
    }
  }
  scene.add(g);
  var ruinMat = mat;
}

// --- the ground: dark rock, glowing cracks --------------------------------------
const groundMat = new THREE.ShaderMaterial({
  fog: false,
  uniforms: { uTime: { value: 0 }, uNoise: { value: NOISE_TEX } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: NOISE_T + /* glsl */ `
    uniform float uTime; varying vec3 vW;
    void main(){
      vec2 p = vW.xz*0.02;
      float n = T(p).r;
      float crack = smoothstep(0.018, 0.0, abs(T(p*1.7 + 3.0).g - 0.5));
      float crack2 = smoothstep(0.01, 0.0, abs(T(p*3.3 + 9.0).a - 0.5));
      float pulse = 0.75 + 0.25*sin(uTime*1.7 + n*12.0);
      vec3 col = vec3(0.06, 0.04, 0.035) * (0.5 + n);
      col += vec3(1.6, 0.45, 0.08) * (crack*0.8 + crack2*0.3) * pulse * smoothstep(0.45, 0.6, n);
      float d = length(vW - cameraPosition);
      col = mix(col, vec3(0.45, 0.13, 0.04), smoothstep(200.0, 1500.0, d) * 0.85);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 2400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -2, -900);
  scene.add(ground);
}

// --- lights ------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight("#5a64b8", "#d0581c", 0.9));
const sunLight = new THREE.DirectionalLight("#fff0d8", 2.2);
sunLight.position.copy(SUN_DIR).multiplyScalar(1000);
scene.add(sunLight);
const key = new THREE.DirectionalLight("#ffe2c0", 1.5);
key.position.set(-220, 260, 420);
scene.add(key);
const under = new THREE.DirectionalLight("#ff6a1a", 1.3);
under.position.set(80, -120, 260);
scene.add(under);
const backRim = new THREE.DirectionalLight("#ff9440", 3.2);
backRim.position.set(30, 90, -400);
scene.add(backRim);
const fireLights = [[-150, 10, 40], [140, 6, 30], [0, 4, 70], [-40, 20, -120], [60, 20, -140]].map((p) => {
  const l = new THREE.PointLight("#ff7a28", 0, 260, 1.6);
  l.position.set(...p);
  scene.add(l);
  return l;
});
// A flash light for explosions and muzzles, moved where it is needed.
const flashLights = [0, 1, 2].map(() => { const l = new THREE.PointLight("#ffc070", 0, 500, 1.4); scene.add(l); return l; });
let flashI = 0;
function flashAt(p, power, color = "#ffc070") {
  const l = flashLights[flashI++ % flashLights.length];
  l.position.copy(p); l.color.set(color); l.intensity = power; l.userData.decay = power;
}

// --- the ship ------------------------------------------------------------------------
const ship = buildShip();
scene.add(ship.group);

function buildShip() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const hull = new THREE.MeshStandardMaterial({
    color: "#f4efe6", map: HULL, bumpMap: HULL, bumpScale: 1.6, roughness: 0.55, metalness: 0.3,
    flatShading: true, envMap: ENV, envMapIntensity: 0.45,
  });
  const wingTex = HULL.clone();
  wingTex.repeat.set(1 / 150, 1 / 150);
  wingTex.needsUpdate = true;
  const wingMat = hull.clone();
  wingMat.map = wingTex; wingMat.bumpMap = wingTex;
  const plateMat = wingMat.clone();
  plateMat.color = new THREE.Color("#fff6e0");
  const dark = new THREE.MeshStandardMaterial({ color: "#2b2622", roughness: 0.38, metalness: 0.85, envMap: ENV, envMapIntensity: 0.6, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: "#c89040", roughness: 0.3, metalness: 1, envMap: ENV, envMapIntensity: 1.2 });
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: hdr(r, g, b), fog: false });
  const orange = glow(5, 1.8, 0.4), blue = glow(0.6, 1.8, 5);
  const glass = new THREE.MeshStandardMaterial({
    color: "#2a1400", emissive: hdr(1, 0.52, 0.12), emissiveIntensity: 2.6, roughness: 0.08, metalness: 0.3,
    envMap: ENV, envMapIntensity: 1.5, flatShading: true,
  });
  const lathe = (pts, seg, mat, y = 0) => {
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(r, yy)), seg), mat);
    m.rotation.y = Math.PI / seg;
    m.position.y = y;
    return m;
  };

  // Body: a faceted egg, a dark belt with lights round it.
  body.add(lathe([[0, -100], [18, -96], [42, -72], [58, -32], [60, 8], [50, 36], [30, 52], [0, 56]], 8, hull));
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(60.6, 60.2, 9, 8, 1, true), dark);
  belt.rotation.y = Math.PI / 8; belt.position.y = -8;
  body.add(belt);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8 + Math.PI / 8;
    const l = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 1), i % 2 ? orange : blue);
    l.position.set(Math.sin(a) * 57, -8, Math.cos(a) * 57);
    l.rotation.y = a;
    body.add(l);
  }
  // a chevron insignia on the chest
  const chev = new THREE.Shape();
  chev.moveTo(-16, 8); chev.lineTo(0, -4); chev.lineTo(16, 8); chev.lineTo(16, 2); chev.lineTo(0, -10); chev.lineTo(-16, 2);
  const chevron = new THREE.Mesh(new THREE.ExtrudeGeometry(chev, { depth: 2, bevelEnabled: false }), gold);
  chevron.position.set(0, 18, 55.6);
  chevron.rotation.x = -0.32;
  body.add(chevron);
  // the keel: a dark spine and a gold nose under the egg
  body.add(lathe([[0, -116], [10, -112], [16, -100], [0, -98]], 8, gold));

  // Neck and head: a cockpit of amber glass in a cage, sitting in a shroud.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(22, 27, 20, 12), dark);
  neck.position.y = 64;
  body.add(neck);
  const neckRing = new THREE.Mesh(new THREE.TorusGeometry(25, 1.6, 6, 32), orange);
  neckRing.rotation.x = Math.PI / 2; neckRing.position.y = 60;
  body.add(neckRing);
  const head = new THREE.Group();
  head.position.y = 72;
  body.add(head);
  head.add(lathe([[0, 0], [30, 0], [45, 12], [49, 28], [47, 36], [0, 36]], 8, hull));
  const domePts = [[46, 34], [44, 50], [36, 64], [22, 74], [0, 78]];
  head.add(lathe(domePts, 8, glass));
  const cage = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    cage.push(new THREE.CatmullRomCurve3(domePts.map(([r, y]) => new THREE.Vector3(Math.sin(a) * r * 1.02, y, Math.cos(a) * r * 1.02)), false, "catmullrom", 0.1));
  }
  for (const idx of [1, 2, 3]) {
    const [r, y] = domePts[idx];
    const loop = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; loop.push(new THREE.Vector3(Math.sin(a) * r * 1.02, y, Math.cos(a) * r * 1.02)); }
    cage.push(new THREE.CatmullRomCurve3(loop, true, "catmullrom", 0.0));
  }
  for (const c of cage) head.add(new THREE.Mesh(new THREE.TubeGeometry(c, 24, 1.5, 5, c.closed), dark));
  // a brow plate over the front windows
  const brow = new THREE.Mesh(new THREE.BoxGeometry(56, 6, 10), hull);
  brow.position.set(0, 34, 40); brow.rotation.x = 0.25;
  head.add(brow);
  const cockpitLight = new THREE.PointLight("#ffa040", 4, 220, 1.5);
  cockpitLight.position.set(0, 50, 30);
  head.add(cockpitLight);

  // Blades: four, in an X, swept back a little. Each is a plate with a raised
  // panel, an orange edge-light, blue slits, a knuckle and a nav light at the tip.
  const blade = new THREE.Shape();
  [[0, 26], [90, 30], [132, 15], [300, 3], [312, -1], [252, -14], [122, -22], [72, -40], [0, -30]].forEach(([x, y], i) => (i ? blade.lineTo(x, y) : blade.moveTo(x, y)));
  const bladeGeo = new THREE.ExtrudeGeometry(blade, { depth: 10, bevelEnabled: true, bevelThickness: 2.5, bevelSize: 2.5, bevelSegments: 1, curveSegments: 1 });
  bladeGeo.translate(0, 0, -5);
  const panel = new THREE.Shape();
  [[36, 18], [104, 20], [132, 8], [262, 1], [130, -12], [64, -20], [36, -16]].forEach(([x, y], i) => (i ? panel.lineTo(x, y) : panel.moveTo(x, y)));
  const panelGeo = new THREE.ExtrudeGeometry(panel, { depth: 3, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 1 });
  const stripLen = Math.hypot(250 - 74, -15 + 37);
  const navs = [];
  const WINGS = [[1, 40, 18, 0.62], [-1, 40, 18, 0.62], [1, 38, -40, -0.5], [-1, 38, -40, -0.5]];
  const wings = WINGS.map(([side, x, y, ang], i) => {
    const mirror = new THREE.Group();
    mirror.scale.x = side;
    const pivot = new THREE.Group();
    pivot.position.set(x, y, -6);
    pivot.rotation.set(0, -0.32, ang);
    pivot.scale.x = 1.22; // longer blades than the shape, for the poster's span
    mirror.add(pivot);
    body.add(mirror);
    const plate = new THREE.Mesh(bladeGeo, wingMat);
    pivot.add(plate);
    const p = new THREE.Mesh(panelGeo, plateMat);
    p.position.z = 6.5;
    pivot.add(p);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(stripLen, 2.2, 2), orange);
    strip.position.set((74 + 250) / 2, (-37 - 15) / 2 + 1.5, 7.5);
    strip.rotation.z = Math.atan2(-15 + 37, 250 - 74);
    pivot.add(strip);
    for (const [sx, sy] of [[150, 2], [182, 0]]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(22, 5, 1), blue);
      s.position.set(sx, sy, 10.5);
      s.rotation.z = -0.07;
      pivot.add(s);
    }
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 22, 8), dark);
    knuckle.rotation.x = Math.PI / 2;
    pivot.add(knuckle);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 24, 8), gold);
    cap.rotation.x = Math.PI / 2;
    pivot.add(cap);
    // the tip: a gold spike and a nav light
    const spike = new THREE.Mesh(new THREE.ConeGeometry(3.5, 26, 6), gold);
    spike.rotation.z = -Math.PI / 2;
    spike.position.set(318, -1, 0);
    pivot.add(spike);
    const nav = sprite(GLOW, side > 0 ? hdr(0.4, 4, 1) : hdr(4, 0.4, 0.3), 30);
    nav.position.set(306, -1, 8);
    nav.userData.phase = i * 0.37;
    pivot.add(nav);
    navs.push(nav);
    return pivot;
  });

  // Lift thrusters: a big one under the keel, two under the lower blades.
  const flameMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: { value: 0 }, uPower: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: NOISE + /* glsl */ `
      uniform float uTime, uPower; varying vec2 vUv;
      void main(){ float t = 1.0 - vUv.y;               // 0 at the nozzle
        float n = fbm3(vec3(vUv.x*6.0, t*4.0 - uTime*9.0, uTime*2.0));
        float core = exp(-t*4.0/uPower) ;
        float a = smoothstep(1.0, 0.0, t/uPower + (n - 0.5)*0.5) * (0.5 + n);
        vec3 c = mix(vec3(1.2, 0.35, 0.08), vec3(1.4, 1.8, 3.5), core);
        c += vec3(3.0) * pow(core, 4.0);
        gl_FragColor = vec4(c * a * 1.4, 1.0); }`,
  });
  const thrusters = [[0, -112, 0, 15, 110], [-118, -62, -20, 9, 70], [118, -62, -20, 9, 70]].map(([x, y, z, r, len]) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 1.15, r * 0.9, 10, 1, true), dark);
    nozzle.material = dark.clone(); nozzle.material.side = THREE.DoubleSide;
    g.add(nozzle);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(r, len, 16, 1, true), flameMat);
    flame.rotation.x = Math.PI;
    flame.position.y = -len / 2 - r * 0.3;
    g.add(flame);
    const halo = sprite(GLOW, hdr(1.5, 1.6, 3.0), r * 7);
    halo.position.y = -r * 0.6;
    g.add(halo);
    body.add(g);
    return { g, flame, halo, len };
  });
  // Ship's under-light on the smoke and rubble.
  const shipLight = new THREE.PointLight("#a8c0ff", 2.5, 600, 1.2);
  shipLight.position.set(0, -140, 0);
  body.add(shipLight);

  const S = STAGE.ship;
  group.position.set(...S.pos);
  group.scale.setScalar(S.scale);
  return {
    group,
    update(t, intro) {
      // Descends into place, heavy at first, then hangs and breathes.
      const k = THREE.MathUtils.clamp((t - 0.2) / 3.2, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      group.position.y = S.pos[1] + S.drop * (1 - e) + Math.sin(t * 0.9) * 3;
      group.rotation.z = Math.sin(t * 0.6) * 0.02;
      group.rotation.x = 0.06 + Math.sin(t * 0.7) * 0.012 - (1 - e) * 0.15;
      group.rotation.y = Math.sin(t * 0.33) * 0.05;
      const power = 0.8 + (1 - e) * 1.2 + Math.sin(t * 23) * 0.04;
      flameMat.uniforms.uTime.value = t;
      flameMat.uniforms.uPower.value = power;
      for (const th of thrusters) th.halo.material.opacity = 0.55 + 0.25 * power + Math.random() * 0.1;
      for (const n of navs) n.material.opacity = (Math.sin((t + n.userData.phase) * 3.4) > 0.6 ? 1 : 0.12);
      glass.emissiveIntensity = 2.4 + Math.sin(t * 1.3) * 0.25 + (Math.random() < 0.02 ? 0.8 : 0);
      cockpitLight.intensity = 3 + Math.sin(t * 1.3);
    },
  };
}

// --- rubble in the foreground ---------------------------------------------------------
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rockMat = new THREE.MeshStandardMaterial({ color: "#3b322c", roughness: 0.92, metalness: 0.08, flatShading: true });
rockMat.onBeforeCompile = (sh) => {
  sh.uniforms.uNoise = { value: NOISE_TEX };
  // Lava-lit from below: the undersides and the cracks near the ground glow.
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWp;")
    .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWp = (modelMatrix*vec4(transformed,1.0)).xyz;");
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWp;\n" + NOISE_T)
    .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      float crk = smoothstep(0.012, 0.0, abs(T(vWp.xz*0.12 + vec2(vWp.y*0.12, 0.0)).b - 0.5));
      totalEmissiveRadiance += vec3(1.8, 0.5, 0.1) * (crk * smoothstep(14.0, 0.0, vWp.y) * 0.8 + smoothstep(4.0, -2.0, vWp.y) * 0.25);`);
};
function rockGeo(seed) {
  const r = mulberry(seed);
  let g = new THREE.IcosahedronGeometry(1, 1);
  g.deleteAttribute("normal"); g.deleteAttribute("uv");
  g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  const bumps = [0, 1, 2].map(() => new THREE.Vector3().randomDirection().multiplyScalar(0.6));
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let k = 1 + (r() - 0.5) * 0.35;
    for (const b of bumps) k -= Math.max(0, 0.5 - v.distanceTo(b)) * 0.6; // chipped faces
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}
const ROCK_GEOS = [1, 2, 3, 4, 5, 6].map(rockGeo);
{
  const g = new THREE.Group();
  const r = mulberry(42);
  const rock = (x, y, z, sx, sy, sz) => {
    const m = new THREE.Mesh(ROCK_GEOS[(r() * ROCK_GEOS.length) | 0], rockMat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.rotation.set(r() * 6, r() * 6, r() * 6);
    g.add(m);
    return m;
  };
  // A plinth under each soldier, its top at their ground.
  for (const s of STAGE.soldiers) {
    rock(s.x, s.ground - 9, -2, 26, 9, 18).rotation.set(0, r(), 0);
  }
  rock(0, 0, -8, 30, 16, 22).rotation.set(0.1, 0.4, 0);
  // The heap: low round the squad, bigger off to the sides and behind.
  for (let i = 0; i < 90; i++) {
    const x = (r() - 0.5) * 560;
    const z = -160 + r() * 200;
    const nearSoldier = STAGE.soldiers.some((s) => Math.abs(s.x - x) < 24 && z > -30 && z < 40);
    if (nearSoldier || (z > 10 && Math.abs(x) < 120)) continue;
    const size = 4 + r() * 10 + Math.max(0, Math.abs(x) - 80) * 0.06;
    rock(x, size * 0.25 - 2, z, size * (0.8 + r() * 0.6), size * (0.5 + r() * 0.5), size * (0.8 + r() * 0.6));
  }
  // Low rocks in front of the squad's feet, and boulders framing the corners.
  for (let i = 0; i < 26; i++) {
    const x = (r() - 0.5) * 220, z = 12 + r() * 40, size = 2.5 + r() * 5;
    rock(x, size * 0.2 - 2, z, size * 1.2, size * 0.6, size);
  }
  for (const [x, y, z, s] of [[-78, -6, 62, 24], [80, -8, 60, 26], [-120, 6, 20, 30], [125, 4, 18, 32], [-46, -10, 82, 12], [44, -11, 86, 11]]) {
    rock(x, y, z, s, s * 0.75, s);
  }
  // Broken girders and a fallen slab, like the poster's.
  const steel = new THREE.MeshStandardMaterial({ color: "#2a2420", roughness: 0.6, metalness: 0.7, flatShading: true });
  for (const [x, y, z, len, rz, ry] of [[-110, 18, 10, 60, 0.9, 0.3], [112, 16, 14, 64, -1.0, -0.4], [-30, 2, 50, 30, 1.35, 0.8], [190, 10, -60, 90, -0.6, 0.2], [-200, 20, -70, 95, 0.5, -0.3]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(5, len, 5), steel);
    b.position.set(x, y, z); b.rotation.set(0, ry, rz);
    g.add(b);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(11, len, 1.5), steel);
    fl.position.copy(b.position); fl.rotation.copy(b.rotation);
    g.add(fl);
  }
  scene.add(g);
}

// --- soldiers: the game's own model ---------------------------------------------------
// The model only ever translates its root (soldier.js `arms` works in world
// space minus the root's position), so the yaw that turns each one toward the
// camera is put on AFTER the frame's pose and taken off before the next.
const soldierEnts = STAGE.soldiers.map((c) => {
  const h = c.crouched ? 22 : 46;
  return {
    cfg: c, x: c.x - 15, y: -c.ground - h, w: 30, h, color: c.color, alive: true, onGround: true,
    vx: 0, facing: c.facing, crouched: c.crouched, aimVec: { x: c.aim[0], y: c.aim[1] },
    hitFlash: 0, muzzleFlash: 0, burn: null,
  };
});
const fakeMission = { time: 0, scene: { soldiers: soldierEnts, world: { width: 2000, height: 600 }, platforms: [], specRoots: [] }, _gunTip: () => ({ x: 0, y: 0 }) };
const soldiers = createSoldiers(scene, { wind: () => -140 + Math.sin(clock.t * 1.7) * 60 });
const halosStub = { begin() {}, end() {} };
let visorsTinted = 0;
function poseSoldiers(t) {
  fakeMission.time = t;
  for (const s of soldierEnts) {
    const root = soldiers.gunOf(s)?.parent;
    if (root) root.rotation.y = 0;
    // A slow breath in the aim, and the centre soldier pumping the gun skyward.
    const c = s.cfg;
    const sway = Math.sin(t * 1.1 + c.x) * 0.04;
    const pump = c.x === 0 ? Math.max(0, Math.sin(t * 0.8)) ** 6 * 0.25 : 0;
    s.aimVec = { x: c.aim[0] + sway - pump * 0.2, y: c.aim[1] + sway * 0.5 };
  }
  soldiers.sync(fakeMission, halosStub);
  for (const s of soldierEnts) {
    const root = soldiers.gunOf(s)?.parent;
    if (!root) continue;
    root.rotation.y = s.cfg.yaw;
    root.updateMatrixWorld(true);
  }
  // The poster's visors are amber, not the game's blue.
  if (visorsTinted < soldierEnts.length) {
    visorsTinted = 0;
    for (const s of soldierEnts) {
      const root = soldiers.gunOf(s)?.parent;
      if (!root) continue;
      root.traverse((o) => {
        if (o.name === "visor" && o.material) { o.material.userData.glow = hdr(2.2, 0.9, 0.2); o.material.userData.base = new THREE.Color("#ffb048"); }
      });
      visorsTinted++;
    }
  }
}
function gunTip(s, out, dir) {
  const gun = soldiers.gunOf(s);
  if (!gun) return false;
  gun.updateMatrixWorld(true);
  gun.localToWorld(out.set(s.w * 0.62 + 2, 0, 0));
  if (dir) { dir.set(1, 0, 0).transformDirection(gun.matrixWorld); }
  return true;
}

// --- enemies: the Blender roster ------------------------------------------------------
const enemies = createEnemyModels(scene, { groundY: 0, soldierX: 0, fx: false });
enemies.setSubject("lineup");
enemies.setMode("move");
// Where each one is, per frame: position, scale, yaw. Flyers circle and swoop
// in the sky behind the ship; walkers prowl the ruins.
const ENEMY_STAGE = {
  strafe_raider: (t) => { const u = ((t * 0.07) % 1); return { p: [-1500 + u * 3000, 520 + Math.sin(u * 9) * 40, -950], s: 4.2, yaw: -0.45, bank: Math.sin(u * 9) * 0.3 }; },
  sky_duelist: (t) => ({ p: [420 + Math.cos(t * 0.45) * 70, 250 + Math.sin(t * 0.9) * 22, -620], s: 3.2, yaw: Math.PI + 0.55, bank: 0 }),
  spore_wisp: (t) => ({ p: [-350 + Math.sin(t * 0.3) * 30, 370 + Math.sin(t * 0.55) * 18, -620], s: 3.2, yaw: -0.5, bank: 0 }),
  iron_moth: (t) => ({ p: [-560 + Math.sin(t * 0.2) * 40, 210 + Math.sin(t * 0.4) * 20, -1000], s: 3.2, yaw: -0.25, bank: 0 }),
  husk_charger: (t) => { const u = (t * 0.05) % 1; return { p: [-420 + u * 220, 13 * 2.4, -380], s: 2.4, yaw: -0.6, bank: 0 }; },
  lurk_gunner: (t) => ({ p: [330 - ((t * 7) % 130), 23 * 2.4, -360], s: 2.4, yaw: Math.PI + 0.6, bank: 0 }),
  cowardly_duelist: (t) => ({ p: [-250 + Math.sin(t * 0.3) * 20, 22 * 2.4, -470], s: 2.4, yaw: -0.4, bank: 0 }),
};
function stageEnemies(dt, t) {
  enemies.update(dt);
  for (const [id, m] of Object.entries(enemies.models())) {
    const f = ENEMY_STAGE[id];
    if (!f) { m.group.visible = false; continue; } // not staged in this scene
    const st = f(t);
    m.group.position.set(...st.p);
    m.group.scale.setScalar(st.s);
    m.group.rotation.set(st.bank, st.yaw, 0);
    m.group.visible = t > 1.5;
  }
}
const enemyPos = (id, out) => { const m = enemies.models()[id]; return m ? out.copy(m.group.position) : null; };

// --- effects: embers, smoke, sparks, tracers, explosions ---------------------------------
const fx = new THREE.Group();
scene.add(fx);

const embers = (() => {
  const N = 1600, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), seed = new Float32Array(N);
  const spawn = (i, anyY) => {
    pos[i * 3] = (Math.random() - 0.5) * 1100;
    pos[i * 3 + 1] = anyY ? Math.random() * 450 - 10 : -10 - Math.random() * 20;
    pos[i * 3 + 2] = -700 + Math.random() * 880;
    vel[i * 3] = 14 + Math.random() * 30; vel[i * 3 + 1] = 18 + Math.random() * 50; vel[i * 3 + 2] = (Math.random() - 0.5) * 10;
    seed[i] = Math.random();
  };
  for (let i = 0; i < N; i++) spawn(i, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uMap: { value: GLOW } },
    vertexShader: `attribute float seed; uniform float uTime, uPx; varying float vF; varying float vS;
      void main(){ vS = seed; vF = 0.55 + 0.45*sin(uTime*(6.0 + seed*14.0) + seed*50.0);
        vec4 mv = modelViewMatrix*vec4(position,1.0);
        gl_PointSize = uPx * (2.0 + seed*4.5) * 260.0 / -mv.z;
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vF; varying float vS;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a;
        vec3 c = mix(vec3(3.0, 0.9, 0.2), vec3(4.0, 2.6, 0.9), vS) * vF;
        gl_FragColor = vec4(c * a, a); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  fx.add(pts);
  return {
    update(dt, t) {
      m.uniforms.uTime.value = t; m.uniforms.uPx.value = renderer.getPixelRatio();
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        const sw = Math.sin(t * 1.3 + seed[i] * 40) * 18;
        pos[k] += (vel[k] + sw) * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
        if (pos[k + 1] > 480 || pos[k] > 620) spawn(i, false);
      }
      g.attributes.position.needsUpdate = true;
    },
  };
})();

const smoke = (() => {
  const puffs = [];
  for (let i = 0; i < 46; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SMOKE, color: "#2a1a14", transparent: true, depthWrite: false, opacity: 0, fog: false }));
    s.userData = { t: Math.random() * 14, life: 10 + Math.random() * 6, x: (Math.random() - 0.5) * 1000, z: -150 - Math.random() * 650, rot: (Math.random() - 0.5) * 0.3, size: 140 + Math.random() * 220 };
    fx.add(s); puffs.push(s);
  }
  return {
    update(dt) {
      for (const s of puffs) {
        const u = s.userData;
        u.t += dt;
        if (u.t > u.life) { u.t = 0; u.x = (Math.random() - 0.5) * 1000; }
        const k = u.t / u.life;
        s.position.set(u.x + k * 120, -20 + k * 380, u.z);
        s.scale.setScalar(u.size * (0.6 + k));
        s.material.rotation += u.rot * dt;
        s.material.opacity = Math.sin(k * Math.PI) * 0.55;
        s.material.color.setRGB(0.12 + (1 - k) * 0.35, 0.06 + (1 - k) * 0.08, 0.04);
      }
    },
  };
})();

// Sparks: one pool, ring-buffered; emitted by impacts and muzzles.
const sparks = (() => {
  const N = 900, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), col = new Float32Array(N * 3);
  let head = 0;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("life", new THREE.BufferAttribute(life, 1));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uPx: { value: 1 }, uMap: { value: GLOW } },
    vertexShader: `attribute float life; attribute vec3 color; uniform float uPx; varying float vL; varying vec3 vC;
      void main(){ vL = life; vC = color; vec4 mv = modelViewMatrix*vec4(position,1.0);
        gl_PointSize = life > 0.0 ? uPx * (1.5 + 3.0*life) * 300.0 / -mv.z : 0.0; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vL; varying vec3 vC;
      void main(){ if (vL <= 0.0) discard; float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(vC * a * (0.4 + vL), a); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  fx.add(pts);
  return {
    emit(p, n, speed, color, up = 0.4) {
      const c = new THREE.Color(color);
      for (let i = 0; i < n; i++) {
        const k = head++ % N, v = new THREE.Vector3().randomDirection();
        v.y = Math.abs(v.y) * up + v.y * (1 - up);
        v.multiplyScalar(speed * (0.3 + Math.random()));
        pos.set([p.x, p.y, p.z], k * 3); vel.set([v.x, v.y, v.z], k * 3);
        life[k] = 0.6 + Math.random() * 0.6;
        col.set([c.r * 4, c.g * 4, c.b * 4], k * 3);
      }
    },
    update(dt) {
      m.uniforms.uPx.value = renderer.getPixelRatio();
      for (let k = 0; k < N; k++) {
        if (life[k] <= 0) continue;
        life[k] -= dt * 1.2;
        vel[k * 3 + 1] -= 260 * dt;
        for (let a = 0; a < 3; a++) pos[k * 3 + a] += vel[k * 3 + a] * dt;
      }
      g.attributes.position.needsUpdate = true; g.attributes.life.needsUpdate = true; g.attributes.color.needsUpdate = true;
    },
  };
})();

// Explosions: a billboarded fireball shader, a shockwave ring, a flash, sparks.
const BOOM_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const booms = (() => {
  const pool = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uAge: { value: 1 }, uSeed: { value: Math.random() * 50 } },
      vertexShader: BOOM_VS,
      fragmentShader: NOISE + /* glsl */ `
        uniform float uAge, uSeed; varying vec2 vUv;
        void main(){ vec2 c = vUv - 0.5; float r = length(c)*2.0;
          float n = fbm(vec3(c*4.0, uSeed + uAge*1.5));
          float rad = 0.25 + uAge*0.75;
          float body = smoothstep(rad, rad - 0.25, r + (n - 0.5)*0.55);
          float heat = clamp(1.15 - uAge*1.05 - r*0.55 + n*0.5, 0.0, 1.0);
          vec3 col = mix(vec3(0.18, 0.07, 0.04), vec3(2.2, 0.6, 0.1), smoothstep(0.0, 0.35, heat));
          col = mix(col, vec3(5.0, 3.5, 1.4), smoothstep(0.45, 0.9, heat));
          float a = body * (1.0 - smoothstep(0.6, 1.0, uAge));
          gl_FragColor = vec4(col, a); }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.visible = false;
    const ringM = new THREE.MeshBasicMaterial({ map: GLOW, color: hdr(3, 1.6, 0.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), ringM);
    ring.visible = false;
    const core = sprite(GLOW, hdr(2.4, 1.2, 0.4), 1);
    core.visible = false;
    fx.add(mesh, ring, core);
    pool.push({ mesh, ring, core, age: 1, size: 1, life: 1 });
  }
  let i = 0;
  return {
    at(p, size, life = 1.6) {
      const b = pool[i++ % pool.length];
      b.mesh.position.copy(p); b.ring.position.copy(p);
      b.age = 0; b.size = size; b.life = life;
      b.mesh.material.uniforms.uSeed.value = Math.random() * 50;
      b.mesh.visible = b.ring.visible = b.core.visible = true;
      b.core.position.copy(p);
      flashAt(p, size * 0.25);
      sparks.emit(p, Math.min(80, size * 0.8), size * 2.2, "#ffb050", 0.6);
    },
    update(dt) {
      for (const b of pool) {
        if (!b.mesh.visible) continue;
        b.age += dt / b.life;
        if (b.age >= 1) { b.mesh.visible = b.ring.visible = b.core.visible = false; continue; }
        b.core.scale.setScalar(b.size * (0.9 + b.age * 0.6));
        b.core.material.opacity = Math.max(0, 1 - b.age * 2.2);
        b.mesh.material.uniforms.uAge.value = b.age;
        b.mesh.quaternion.copy(camera.quaternion);
        b.mesh.scale.setScalar(b.size * (0.6 + b.age * 0.8));
        b.ring.quaternion.copy(camera.quaternion);
        b.ring.scale.setScalar(b.size * (0.2 + b.age * 2.2));
        b.ring.material.opacity = Math.max(0, 1 - b.age * 2.5);
      }
    },
  };
})();

// Bolts: soldiers' gold tracers up into the sky, the aliens' violet plasma down
// into the rubble.
const bolts = (() => {
  const pool = [];
  const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  geo.translate(0, -0.5, 0); // the head at the origin, the trail behind it
  for (let i = 0; i < 40; i++) {
    const m = new THREE.MeshBasicMaterial({ color: hdr(5, 3, 1), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const mesh = new THREE.Mesh(geo, m);
    const head = sprite(GLOW, hdr(5, 3, 1), 14);
    mesh.visible = head.visible = false;
    fx.add(mesh, head);
    pool.push({ mesh, head, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, len: 40, onEnd: null });
  }
  let i = 0;
  const Y = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  return {
    fire(from, dir, speed, color, { len = 40, width = 1.2, life = 1.2, glow = 14, onEnd = null } = {}) {
      const b = pool[i++ % pool.length];
      b.p.copy(from); b.v.copy(dir).normalize().multiplyScalar(speed);
      b.life = life; b.len = len; b.onEnd = onEnd;
      b.mesh.material.color.copy(color); b.head.material.color.copy(color);
      b.mesh.scale.set(width, len, width); b.head.scale.setScalar(glow);
      b.mesh.quaternion.setFromUnitVectors(Y, tmp.copy(b.v).normalize());
      b.mesh.visible = b.head.visible = true;
    },
    update(dt) {
      for (const b of pool) {
        if (!b.mesh.visible) continue;
        b.life -= dt;
        b.p.addScaledVector(b.v, dt);
        b.mesh.position.copy(b.p); b.head.position.copy(b.p);
        if (b.life <= 0) { b.mesh.visible = b.head.visible = false; b.onEnd?.(b.p.clone()); }
      }
    },
  };
})();

const muzzles = soldierEnts.map(() => { const s = sprite(STAR, hdr(6, 4, 1.6), 22); s.visible = false; fx.add(s); return s; });

// The battle's script: who shoots, when, and where the far explosions go.
const battle = (() => {
  let next = { left: 3.4, right: 4.0, enemy: 4.6, boom: 3.2 };
  const tip = new THREE.Vector3(), dir = new THREE.Vector3(), tgt = new THREE.Vector3();
  const burst = (idx, t, n, gap) => {
    for (let k = 0; k < n; k++) queue.push({ at: t + k * gap, idx });
  };
  const queue = [];
  const GOLD = hdr(6, 3.6, 1.2), VIOLET = hdr(3.5, 0.8, 5.5);
  return {
    update(t, dt) {
      if (t > next.left) { burst(0, t, 4, 0.11); next.left = t + 2.2 + Math.random() * 2.2; }
      if (t > next.right) { burst(2, t, 5, 0.09); next.right = t + 2.5 + Math.random() * 2.2; }
      for (let q = queue.length - 1; q >= 0; q--) {
        if (queue[q].at > t) continue;
        const s = soldierEnts[queue[q].idx];
        queue.splice(q, 1);
        if (!gunTip(s, tip, dir)) continue;
        // At a flyer on this soldier's side of the sky. (The squad is turned
        // to face the camera, so its barrels do too; the round goes where the
        // fight is, not out through the lens.)
        const foes = s.cfg.x < 0 ? ["spore_wisp", "iron_moth"] : ["sky_duelist", "strafe_raider"];
        if (enemyPos(foes[(Math.random() * 2) | 0], tgt)) dir.subVectors(tgt, tip);
        else dir.set(Math.sign(s.cfg.x) * 0.5, 0.6, -1);
        dir.normalize();
        dir.x += (Math.random() - 0.5) * 0.04; dir.y += (Math.random() - 0.5) * 0.04;
        bolts.fire(tip, dir, 1100, GOLD, { len: 70, width: 2.2, life: 0.75, glow: 20 });
        const mz = muzzles[soldierEnts.indexOf(s)];
        mz.position.copy(tip); mz.visible = true; mz.userData.until = t + 0.05;
        mz.material.rotation = Math.random() * 3;
        sparks.emit(tip, 6, 70, "#ffd080", 0.3);
        flashAt(tip, 3, "#ffc060");
      }
      for (const m of muzzles) if (m.visible && t > m.userData.until) m.visible = false;
      if (t > next.enemy) {
        // A flyer shoots back; its bolt lands in the rubble near the squad.
        const ids = ["sky_duelist", "strafe_raider", "spore_wisp"];
        const from = enemyPos(ids[(Math.random() * ids.length) | 0], new THREE.Vector3());
        if (from) {
          tgt.set((Math.random() - 0.5) * 380, 6, -20 + Math.random() * 90);
          if (Math.abs(tgt.x) < 110) tgt.x = Math.sign(tgt.x || 1) * (110 + Math.random() * 60);
          const d = tgt.clone().sub(from), time = d.length() / 650;
          bolts.fire(from, d, 650, VIOLET, { len: 30, width: 2, life: time, glow: 26, onEnd: (p) => { booms.at(p, 42, 1.0); shake(1.5); } });
        }
        next.enemy = t + 1.6 + Math.random() * 1.8;
      }
      if (t > next.boom) {
        // Something in the city goes up.
        const side = Math.random() < 0.5 ? -1 : 1;
        const p = new THREE.Vector3(side * (150 + Math.random() * 380), 30 + Math.random() * 110, -300 - Math.random() * 160);
        booms.at(p, 70 + Math.random() * 60, 1.8);
        next.boom = t + 1.2 + Math.random() * 2.2;
      }
    },
  };
})();

// --- the title ---------------------------------------------------------------------------
const title = (() => {
  const g = new THREE.Group();
  g.position.z = STAGE.title.z;
  titleScene.add(g);
  titleScene.add(new THREE.AmbientLight("#ffffff", 0.15));
  const tKey = new THREE.DirectionalLight("#fff2d8", 1.6); tKey.position.set(-20, 40, 50); titleScene.add(tKey);
  const tUnder = new THREE.DirectionalLight("#ff7020", 1.2); tUnder.position.set(10, -40, 30); titleScene.add(tUnder);
  const sweepLight = new THREE.PointLight("#fff4e0", 0, 60, 1.2); titleScene.add(sweepLight);
  const uni = { uSweep: { value: -2 }, uRes: { value: new THREE.Vector2(1, 1) } };
  const face = new THREE.MeshStandardMaterial({ color: "#f7dc9c", metalness: 1, roughness: 0.22, envMap: ENV, envMapIntensity: 0.9 });
  const side = new THREE.MeshStandardMaterial({ color: "#7a4c1c", metalness: 1, roughness: 0.38, envMap: ENV, envMapIntensity: 0.6 });
  for (const m of [face, side]) {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uSweep; uniform vec2 uRes;")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          vec2 sc = gl_FragCoord.xy / uRes;
          float band = exp(-pow((sc.x + sc.y*0.35 - uSweep) * 9.0, 2.0));
          totalEmissiveRadiance += vec3(2.4, 1.8, 1.0) * band;`);
    };
  }
  const letters = [];
  const extras = [];
  function build(font) {
    STAGE.title.lines.forEach(([text, size, y], line) => {
      const scale = size / font.data.resolution;
      const adv = [...text].map((ch) => (font.data.glyphs[ch]?.ha ?? font.data.resolution * 0.3) * scale);
      const track = size * 0.06;
      const width = adv.reduce((a, b) => a + b, 0) + track * (text.length - 1);
      let x = -width / 2;
      [...text].forEach((ch, i) => {
        if (ch !== " ") {
          const geo = new TextGeometry(ch, { font, size, depth: size * 0.28, curveSegments: 6, bevelEnabled: true, bevelThickness: size * 0.07, bevelSize: size * 0.045, bevelSegments: 3 });
          geo.computeBoundingBox();
          const bb = geo.boundingBox;
          const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
          geo.translate(-cx, -cy, -size * 0.14);
          const m = new THREE.Mesh(geo, [face, side]);
          const home = new THREE.Vector3(x + cx, y + cy, 0);
          m.position.copy(home);
          m.visible = false;
          g.add(m);
          letters.push({ m, home, start: 2.5 + line * 0.55 + i * (line ? 0.045 : 0.085), line });
        }
        x += adv[i] + track;
      });
      // Gold rules: either side of SOLAR, and one long one under the lot.
      const ruleMat = () => new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uC: { value: hdr(4, 2.4, 0.8) }, uO: { value: 0 } },
        vertexShader: BOOM_VS,
        fragmentShader: `uniform vec3 uC; uniform float uO; varying vec2 vUv; void main(){ float a = pow(1.0 - abs(vUv.x*2.0-1.0), 1.5) * (1.0 - abs(vUv.y*2.0-1.0)); gl_FragColor = vec4(uC*a*uO, 1.0); }`,
      });
      if (line === 0) {
        for (const sgn of [-1, 1]) {
          const r = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.35), ruleMat());
          r.position.set(sgn * (width / 2 + 10.5), y, 0);
          g.add(r); extras.push({ m: r, at: 4.3, kind: "rule" });
        }
      } else {
        const r = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.25, 0.35), ruleMat());
        r.position.set(0, y - size * 0.85, 0);
        g.add(r); extras.push({ m: r, at: 4.1, kind: "rule" });
        const star = sprite(STAR, hdr(3, 2, 1), 5);
        star.position.set(0, y - size * 0.85, 0.5);
        g.add(star); extras.push({ m: star, at: 4.3, kind: "star" });
      }
    });
    // A warm haze behind the letters so they read on the busy sky.
    const back = sprite(GLOW, hdr(0.25, 0.08, 0.02), 1, 0.0, false);
    back.material.blending = THREE.AdditiveBlending;
    back.scale.set(110, 34, 1);
    back.position.set(0, 9, -6);
    g.add(back); extras.push({ m: back, at: 2.5, kind: "haze" });
  }
  // Russo One, or three's bold Helvetiker, or the DOM title if neither loads.
  new TTFLoader().load(FONT_URL, (json) => build(new Font(json)), undefined, () =>
    new FontLoader().load(FONT_FALLBACK, build, undefined, () => { $("fallback").style.display = "block"; }));

  const ease = (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // ease-out with a little overshoot
  let landed = new Set();
  return {
    update(t, onLand) {
      for (const L of letters) {
        const k = THREE.MathUtils.clamp((t - L.start) / 0.42, 0, 1);
        L.m.visible = k > 0;
        if (!L.m.visible) continue;
        const e = ease(k);
        // Flies in from behind the viewer and slams into place, spinning off.
        L.m.position.set(L.home.x * (0.2 + 0.8 * e), L.home.y + (1 - e) * 6, (1 - e) * 58);
        L.m.rotation.set((1 - e) * -1.2, (1 - e) * (L.home.x > 0 ? 0.8 : -0.8), 0);
        if (k >= 1 && !landed.has(L)) { landed.add(L); onLand(L.line); }
      }
      for (const x of extras) {
        const k = THREE.MathUtils.clamp((t - x.at) / 0.6, 0, 1);
        if (x.kind === "rule") { x.m.material.uniforms.uO.value = k; x.m.scale.x = 1 - Math.pow(1 - k, 3); }
        if (x.kind === "star") { x.m.material.opacity = k * (0.8 + 0.2 * Math.sin(t * 5)); x.m.material.rotation = t * 0.3; x.m.scale.setScalar(5 + Math.sin(t * 2.3) * 0.8 + (1 - k) * 20); }
        if (x.kind === "haze") x.m.material.opacity = k * 0.9;
      }
      // The light sweep: once as it all lands, then every few seconds.
      const s = t < 4.2 ? -2 : ((t - 4.2) % 6.5) / 1.3;
      uni.uSweep.value = s * 1.8 - 0.3;
      sweepLight.intensity = s < 1 ? 60 : 0;
      sweepLight.position.set(-40 + s * 80, 12, 8);
      // and a slow float, enough to show it is solid
      g.rotation.y = Math.sin(t * 0.35) * 0.06;
      g.rotation.x = Math.sin(t * 0.27) * 0.03 + 0.04;
      g.position.y = Math.sin(t * 0.5) * 0.25;
    },
    resize(w, h) { uni.uRes.value.set(w, h); },
  };
})();

// --- post: god rays, bloom, then a lens pass ------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// God rays, at half resolution: the 64 taps run on a quarter of the pixels and
// the result is added back over the full-size frame.
class GodRaysPass extends Pass {
  constructor() {
    super();
    this.uniforms = { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.2, 0.8) }, uVis: { value: 1 } };
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rays = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: FULL_VS,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uVis; varying vec2 vUv;
        void main(){
          vec2 delta = (vUv - uSun) * (0.9 / 64.0);
          vec2 c = vUv; float w = 1.0; vec3 acc = vec3(0.0);
          for (int i = 0; i < 64; i++){
            c -= delta;
            vec3 s = texture2D(tDiffuse, c).rgb;
            float l = max(dot(s, vec3(0.3, 0.59, 0.11)) - 7.0, 0.0);
            acc += normalize(s + 1e-4) * min(l, 6.0) * w;
            w *= 0.965;
          }
          gl_FragColor = vec4(acc * vec3(1.0, 0.75, 0.45) * 0.007 * uVis, 1.0);
        }`,
    }));
    this.add = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tRays: { value: this.rt.texture } },
      vertexShader: FULL_VS,
      fragmentShader: `uniform sampler2D tDiffuse, tRays; varying vec2 vUv;
        void main(){ gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb + texture2D(tRays, vUv).rgb, 1.0); }`,
    }));
  }
  setSize(w, h) { this.rt.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.rt);
    this.rays.render(renderer);
    this.add.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.add.render(renderer);
  }
}
const godRays = new GodRaysPass();
composer.addPass(godRays);
const title2 = new RenderPass(titleScene, titleCam);
title2.clear = false;
title2.clearDepth = true;
composer.addPass(title2);
const bloom = new UnrealBloomPass(new THREE.Vector2(960, 540), 0.55, 0.5, 1.0);
composer.addPass(bloom);
const lens = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uSun: { value: new THREE.Vector2() }, uSunVis: { value: 1 },
    uAspect: { value: 16 / 9 }, uFade: { value: 0 }, uFlash: { value: 0 }, uNoise: { value: NOISE_TEX },
  },
  vertexShader: BOOM_VS,
  fragmentShader: NOISE + NOISE_T + /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uSunVis, uAspect, uFade, uFlash; uniform vec2 uSun; varying vec2 vUv;
    float hexd(vec2 p){ p = abs(p); return max(p.x*0.866 + p.y*0.5, p.y); }
    void main(){
      vec2 uv = vUv;
      // heat haze rising off the fires, strongest at the bottom
      float hz = smoothstep(0.42, 0.0, uv.y);
      uv += hz * 0.0022 * vec2(T(uv*vec2(40.0, 25.0) + vec2(0.0, -uTime*1.6)).b - 0.5, T(uv*vec2(30.0, 20.0) + vec2(7.0, -uTime*1.8)).b - 0.5) * 3.0;
      vec2 dc = uv - 0.5;
      float ca = 0.006 * dot(dc, dc);
      vec3 col = vec3(texture2D(tDiffuse, uv - dc*ca*2.0).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv + dc*ca*2.0).b);
      // lens flare: ghosts strung on the line through the centre, a streak, a halo
      vec2 sv = uSun - 0.5;
      float ghosts[6]; ghosts[0]=-0.35; ghosts[1]=-0.7; ghosts[2]=-1.05; ghosts[3]=0.45; ghosts[4]=-1.4; ghosts[5]=0.2;
      for (int i = 0; i < 6; i++){
        vec2 gp = 0.5 + sv*ghosts[i];
        float sz = 0.02 + 0.03*fract(float(i)*0.618 + 0.3);
        float d = hexd((uv - gp)*vec2(uAspect, 1.0));
        float g = smoothstep(sz, sz*0.8, d) * 0.6 + smoothstep(sz*1.2, sz, d)*smoothstep(sz*0.9, sz, d)*0.6;
        vec3 tint = mix(vec3(1.0, 0.55, 0.2), vec3(0.3, 0.6, 1.0), fract(float(i)*0.37));
        col += tint * g * 0.05 * uSunVis;
      }
      vec2 ds = (uv - uSun)*vec2(uAspect, 1.0);
      col += vec3(0.55, 0.7, 1.0) * exp(-abs(ds.y)*220.0) * exp(-abs(ds.x)*2.5) * 0.45 * uSunVis;
      float ringD = length((uv - (0.5 - sv*0.9))*vec2(uAspect, 1.0));
      col += vec3(0.6, 0.4, 1.0) * smoothstep(0.02, 0.0, abs(ringD - 0.22)) * 0.05 * uSunVis;
      // grade: more saturation and contrast, cool shadows, warm highs
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = max(mix(vec3(l), col, 1.35), 0.0);
      col = pow(col / 0.2, vec3(1.12)) * 0.2;
      l = dot(col, vec3(0.299, 0.587, 0.114));
      col *= mix(vec3(0.9, 1.0, 1.18), vec3(1.05, 1.0, 0.92), smoothstep(0.05, 0.8, l));
      // vignette, grain, the title's flash, the fade in
      col *= mix(1.0, 0.35, smoothstep(0.5, 1.05, length(dc*vec2(1.0, 1.25))*1.35));
      col += (hash2(uv*1000.0 + fract(uTime)*100.0) - 0.5) * 0.03;
      col += vec3(1.0, 0.85, 0.6) * uFlash * 2.0;
      gl_FragColor = vec4(col * uFade, 1.0);
    }`,
});
composer.addPass(lens);
composer.addPass(new OutputPass());

// --- camera ------------------------------------------------------------------------------
const C = STAGE.cam;
const look = new THREE.Vector3(...C.look);
const mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
addEventListener("pointermove", (e) => { mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5); });
let shakeAmt = 0;
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }
function placeCamera(t, dt) {
  const k = THREE.MathUtils.clamp(t / 5, 0, 1), e = 1 - Math.pow(1 - k, 3);
  mouseS.lerp(mouse, Math.min(1, dt * 2));
  camera.position.set(
    C.pos[0] + C.intro[0] * (1 - e) + Math.sin(t * 0.13) * 7 - mouseS.x * 18,
    C.pos[1] + C.intro[1] * (1 - e) + Math.sin(t * 0.21) * 3 + mouseS.y * 8,
    C.pos[2] + C.intro[2] * (1 - e) + Math.sin(t * 0.09) * 5,
  );
  camera.lookAt(look.x + mouseS.x * 20, look.y - mouseS.y * 10, look.z);
  shakeAmt *= Math.exp(-dt * 6);
  camera.position.x += (Math.random() - 0.5) * shakeAmt;
  camera.position.y += (Math.random() - 0.5) * shakeAmt;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  for (const c of [camera, titleCam]) { c.aspect = w / h; c.updateProjectionMatrix(); }
  // Keep the title inside a narrow screen: pull it back as the aspect drops.
  titleCam.position.z = Math.max(0, (16 / 9) / (w / h) - 1) * 50;
  lens.uniforms.uAspect.value = w / h;
  title.resize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
}
addEventListener("resize", resize);
resize();

// --- the loop ------------------------------------------------------------------------------
let flash = 0, landCount = 0;
const sunNdc = new THREE.Vector3();
let last = performance.now(), fps = 60;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  const t = (clock.t += dt);

  placeCamera(t, dt);
  sky.material.uniforms.uTime.value = t;
  bigStars.userData.tick(t);
  for (const m of [...planets, ...orbits, ...fireLayers]) if (m.uniforms.uTime) m.uniforms.uTime.value = t;
  ruinMat.uniforms.uTime.value = t;
  groundMat.uniforms.uTime.value = t;
  sunStar.material.rotation = t * 0.02;
  sunCore.scale.setScalar(650 + Math.sin(t * 2) * 30);

  ship.update(t);
  poseSoldiers(t);
  stageEnemies(dt, t);
  battle.update(t, dt);
  embers.update(dt, t);
  smoke.update(dt);
  sparks.update(dt);
  booms.update(dt);
  bolts.update(dt);
  fireLights.forEach((l, i) => { l.intensity = 2.5 + Math.sin(t * (7 + i) + i) * 0.8 + Math.random() * 0.7; });
  for (const l of flashLights) { l.userData.decay = (l.userData.decay ?? 0) * Math.exp(-dt * 9); l.intensity = l.userData.decay; }

  title.update(t, (line) => {
    landCount++;
    shake(line === 0 ? 2.2 : 1.2);
    flash = Math.max(flash, line === 0 ? 0.12 : 0.06);
  });
  flash *= Math.exp(-dt * 7);
  // The sun on screen, for the rays and the flare; off when it is behind us.
  sunNdc.copy(SUN).project(camera);
  const vis = sunNdc.z < 1 ? THREE.MathUtils.clamp(1.4 - Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y)) * 0.6, 0, 1) : 0;
  godRays.uniforms.uSun.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
  godRays.uniforms.uVis.value = vis;
  lens.uniforms.uSun.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
  lens.uniforms.uSunVis.value = vis;
  lens.uniforms.uTime.value = t;
  lens.uniforms.uFade.value = THREE.MathUtils.clamp(t / 1.2, 0, 1);
  lens.uniforms.uFlash.value = flash;

  composer.render();
  $("hud").textContent = `${fps.toFixed(0)} fps · t ${t.toFixed(1)}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.splash = { clock, camera, STAGE, ship, enemies, composer, renderer };
addEventListener("error", (e) => { $("err").textContent = String(e.message); });
