// ---------------------------------------------------------------------------
// 3D VIEW — EnemySpec enemies (tech/mission-3d.md).
//
// The walk is drawSpecEnemy's (src/mission/enemyspec/render.js): a live root,
// its alive children, its `spawned` list; a disabled part is not drawn but its
// children are. So a part is visible here exactly when it is in 2D.
//
// R5: each part is a model of its `spec.visual.shape` in `spec.visual.color`,
// sized to the part's box every frame, with the detail a flat shape cannot
// carry — plating and seams, an emissive core, a glowing eye on the facing
// side of any root or damageable part (the 2D eye's rule), and a slow idle
// breath that only ever shrinks the model, so it never leaves its box.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ModelMap, applyFlash, burnHalo } from "./actors.js";
import { setColor, shade, putHalo, viewY } from "./util.js";

const shared = (g) => ((g.userData.shared = true), g);
const G = {
  box: shared(new RoundedBoxGeometry(1, 1, 1, 2, 0.12)),
  plate: shared(new THREE.BoxGeometry(1, 1, 1)),
  sphere: shared(new THREE.SphereGeometry(0.5, 24, 16)),
  band: shared(new THREE.TorusGeometry(0.5, 0.045, 8, 32)),
  diamond: shared(new THREE.OctahedronGeometry(0.5, 0)),
  eye: shared(new THREE.SphereGeometry(0.5, 12, 8)),
};
const EYE = "#ff5a3c";

function mat(v, color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35, ...opts });
  m.userData.base = color.isColor ? color.clone() : setColor(new THREE.Color(), color);
  if (opts.emissive) {
    // Emissive colours go through setColor too: a spec colour may be any CSS.
    m.userData.glow = setColor(new THREE.Color(), opts.emissive.isColor ? `#${opts.emissive.getHexString()}` : opts.emissive)
      .multiplyScalar(opts.emissiveIntensity || 1);
    m.emissive.copy(m.userData.glow);
    m.emissiveIntensity = 1;
  }
  v.mats.push(m);
  return m;
}

function make(e) {
  const color = e.spec.visual.color;
  const shape = e.spec.visual.shape || "box";
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const v = { root, body, shape, mats: [], phase: Math.random() * 7, bits: {} };
  const add = (name, geo, m) => {
    const mesh = new THREE.Mesh(geo, m);
    body.add(mesh);
    v.bits[name] = mesh;
    return mesh;
  };
  const core = shade(color, 28);
  // Hulls glow faintly in their own colour so no face goes black against the
  // night: an enemy must stay as readable as its flat 2D shape.
  const hullGlow = { emissive: color, emissiveIntensity: 0.18 };
  if (shape === "circle" || shape === "ellipse") {
    add("hull", G.sphere, mat(v, color, hullGlow));
    add("band", G.band, mat(v, shade(color, -20), { metalness: 0.7, roughness: 0.3 }));
    add("core", G.sphere, mat(v, core, { emissive: core, emissiveIntensity: 0.9 }));
  } else if (shape === "diamond") {
    add("hull", G.diamond, mat(v, color, { flatShading: true, metalness: 0.55, roughness: 0.3, ...hullGlow }));
    add("core", G.diamond, mat(v, core, { emissive: core, emissiveIntensity: 1, flatShading: true }));
  } else {
    add("hull", G.box, mat(v, color, hullGlow));
    add("plate", G.plate, mat(v, shade(color, -16), { metalness: 0.6, roughness: 0.35 }));
    add("seam", G.plate, mat(v, shade(color, -40)));
    add("core", G.plate, mat(v, core, { emissive: core, emissiveIntensity: 0.9 }));
  }
  if (e.isRoot || e.maxHealth) add("eye", G.eye, mat(v, EYE, { emissive: EYE, emissiveIntensity: 1.6 }));
  return v;
}

// Size and place every piece for this frame's box.
function pose(v, e, time) {
  const w = e.w, h = e.h;
  const depth = Math.max(8, Math.min(w, h) * 0.8);
  // Idle: a breath that only shrinks (so the model stays inside its box) and
  // a slight sway toward the facing side.
  const b = 0.5 + 0.5 * Math.sin(time * 3 + v.phase);
  const breath = 1 - 0.035 * b;
  v.root.position.set(e.x + w / 2, viewY(e.y + h / 2), 0);
  v.body.scale.set(breath, breath, 1);
  v.body.rotation.y = (e.facing >= 0 ? 1 : -1) * 0.12 * Math.sin(time * 1.3 + v.phase);
  const B = v.bits;
  if (v.shape === "circle") {
    const r = Math.max(w, h); // the 2D circle's diameter, as drawn
    B.hull.scale.set(r, r, Math.min(r, depth * 1.4));
    B.band.scale.set(r * 1.02, r * 1.02, 1);
    B.core.scale.set(r * 0.34, r * 0.34, r * 0.34);
    B.core.position.set(0, 0, Math.min(r, depth * 1.4) * 0.4);
  } else if (v.shape === "ellipse") {
    B.hull.scale.set(w, h, depth);
    B.band.scale.set(w * 1.02, h * 1.02, 1);
    const c = Math.min(w, h) * 0.34;
    B.core.scale.set(c, c, c);
    B.core.position.set(0, 0, depth * 0.4);
  } else if (v.shape === "diamond") {
    B.hull.scale.set(w, h, depth);
    B.core.scale.set(w * 0.5, h * 0.5, depth * 1.12);
  } else {
    B.hull.scale.set(w, h, depth);
    // A front armour plate inset from the edges, a seam across it, and a lit
    // vent in the lower third.
    B.plate.scale.set(w * 0.78, h * 0.62, 2);
    B.plate.position.set(0, h * 0.05, depth / 2 + 0.6);
    B.seam.scale.set(w * 0.8, Math.max(1, h * 0.03), 2.4);
    B.seam.position.set(0, -h * 0.08, depth / 2 + 0.8);
    B.core.scale.set(w * 0.5, Math.max(1.5, h * 0.08), 2.6);
    B.core.position.set(0, -h * 0.3, depth / 2 + 0.9);
  }
  if (B.eye) {
    // Same place as the 2D eye: 72% across on the facing side, 35% down.
    const r = Math.max(4, Math.min(8, w * 0.18));
    const ex = (e.facing >= 0 ? 0.22 : -0.22) * w;
    const front = v.shape === "circle" ? Math.min(Math.max(w, h), depth * 1.4) / 2 : depth / 2;
    B.eye.scale.set(r, r, r * 0.6);
    B.eye.position.set(ex, h * 0.15, front * 0.85);
  }
}

export function createEnemies(parent) {
  const models = new ModelMap(parent, make);

  function part(e, m, halos) {
    const v = models.get(e);
    pose(v, e, m.time);
    const pulse = applyFlash(v.mats, e.hitFlash > 0, e.telegraph > 0, m.time);
    cues(e, m, halos, pulse);
  }

  function tree(e, m, halos) {
    if (!e.alive) return;
    if (!e.disabled) part(e, m, halos);
    for (const c of e.children) tree(c, m, halos);
  }

  return {
    sync(m, halos) {
      models.begin();
      for (const r of m.scene.specRoots) {
        if (!r.alive) continue;
        tree(r, m, halos);
        for (const sp of r.spawned) tree(sp, m, halos);
      }
      // A part that is merely disabled comes back; anything dead is gone.
      models.end((e) => e.alive);
    },
    dispose() {
      models.dispose();
    },
  };
}

// The 2D view's cues, in the 2D view's places: the telegraph glow around the
// part, the muzzle glow off its facing side, the burn on its top edge.
export function cues(e, m, halos, pulse) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  if (e.telegraph > 0) {
    putHalo(halos, cx, cy, (Math.max(e.w, e.h) * 0.8 + pulse * 8) * 2.6, "#ff5a5a", 0.35 + pulse * 0.3, 10);
  }
  if (e.muzzleFlash > 0) {
    putHalo(halos, cx + e.facing * (e.w / 2 + 6), cy, 34, e.muzzleColor || "#ff8a5a", 0.9, 16);
  }
  if (e.burn) burnHalo(halos, e.x, e.y, e.w, m.time);
}
