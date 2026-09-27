// ---------------------------------------------------------------------------
// 3D VIEW — shots, particles, loot and the exit (tech/mission-3d.md, R6).
//
// Projectiles and particles come from PER-FRAME pools and are never mapped to
// a particular shot: a room viewer rebuilds `scene.projectiles` on every
// snapshot (src/net/mission-wire.js), so a shot object does not survive a
// frame there.
//
// A shot takes the same look it has in 2D — `p.shape`, else `defaultShape(p)`
// (src/mission/render.js) — built in 3D, oriented along its velocity,
// emissive, with a glow halo in its colour (the 2D shadowBlur).
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { defaultShape } from "../render.js";
import { FramePool, setColor, viewY, putHalo, glowTexture } from "./util.js";

const MAX_PARTICLES = 4096;
const shared = (g) => ((g.userData.shared = true), g);

// Unit geometries, laid along +x (the direction of travel).
const GEO = {
  capsule: shared(new THREE.CapsuleGeometry(0.5, 1, 4, 10).rotateZ(Math.PI / 2)),
  sphere: shared(new THREE.SphereGeometry(0.5, 16, 12)),
  spindle: shared(new THREE.OctahedronGeometry(0.5, 0)),
  cylinder: shared(new THREE.CylinderGeometry(0.5, 0.5, 1, 12).rotateZ(Math.PI / 2)),
  cone: shared(new THREE.ConeGeometry(0.5, 1, 12).rotateZ(-Math.PI / 2)),
  box: shared(new THREE.BoxGeometry(1, 1, 1)),
  // The wave's crescent: an arc of 1.1π centred on +x, opening away from travel.
  arc: shared(new THREE.TorusGeometry(1, 0.22, 6, 24, Math.PI * 1.1).rotateZ(-Math.PI * 0.55)),
  arcCore: shared(new THREE.TorusGeometry(1, 0.08, 4, 24, Math.PI * 0.8).rotateZ(-Math.PI * 0.4)),
};

const WHITE = () => new THREE.MeshBasicMaterial({ color: "#ffffff" });
const TINT = () => new THREE.MeshBasicMaterial({ color: "#ffffff" });
const ADD = (opacity = 0.8) => new THREE.MeshBasicMaterial({
  color: "#ffffff", transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
});

// One model per shape; every mesh named `tint` takes the shot's colour.
function mesh(geo, mat, tint = false) {
  const m = new THREE.Mesh(geo, mat);
  m.userData.tint = tint;
  return m;
}

const BUILD = {
  bullet() {
    const g = new THREE.Group();
    g.add(mesh(GEO.capsule, TINT(), true), mesh(GEO.box, WHITE()));
    return g;
  },
  orb() {
    const g = new THREE.Group();
    g.add(mesh(GEO.sphere, ADD(0.75), true), mesh(GEO.sphere, WHITE()));
    return g;
  },
  pellet() {
    const g = new THREE.Group();
    g.add(mesh(GEO.sphere, TINT(), true));
    return g;
  },
  bolt() {
    const g = new THREE.Group();
    g.add(mesh(GEO.spindle, TINT(), true), mesh(GEO.box, WHITE()));
    return g;
  },
  missile() {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4, metalness: 0.6 });
    g.add(mesh(GEO.cylinder, body, true), mesh(GEO.cone, body, true),
      mesh(GEO.box, WHITE()), mesh(GEO.box, WHITE()), mesh(GEO.cone, ADD(0.85)));
    g.children[4].material.color.set("#ffb45a");
    return g;
  },
  wave() {
    const g = new THREE.Group();
    g.add(mesh(GEO.arc, ADD(0.9), true), mesh(GEO.arcCore, WHITE()));
    return g;
  },
};

// Size each shape's pieces from the shot's box, as render.js does in 2D.
function layoutShot(shape, g, p) {
  const [a, b, c, d, e] = g.children;
  switch (shape) {
    case "orb": {
      const r = Math.max(p.w, p.h);
      a.scale.setScalar(r);
      b.scale.setScalar(r * 0.4);
      break;
    }
    case "pellet": {
      a.scale.setScalar(Math.max(4, Math.max(p.w, p.h)));
      break;
    }
    case "bolt": {
      const len = Math.max(p.w, p.h, 10);
      const t = Math.max(2, Math.min(p.w, p.h));
      a.scale.set(len, t, t);
      b.scale.set(len * 0.7, 2, 2);
      break;
    }
    case "missile": {
      const len = Math.max(p.w, 14);
      const r = Math.max(3, p.h);
      a.scale.set(len * 0.82, r, r);
      a.position.x = -len * 0.09;
      b.scale.set(len * 0.18, r, r);
      b.position.x = len * 0.41;
      c.scale.set(4, 2, r * 1.6);
      c.position.set(-len / 2 + 2, r / 2 + 1, 0);
      d.scale.set(4, 2, r * 1.6);
      d.position.set(-len / 2 + 2, -r / 2 - 1, 0);
      const flame = 6 + Math.random() * 8; // the 2D exhaust flickers the same way
      e.scale.set(-flame, r, r); // negative: the cone points backwards
      e.position.x = -len / 2 - flame / 2;
      break;
    }
    case "wave": {
      const r = Math.max(p.w, p.h) / 2 + 2;
      a.scale.set(r, r, r);
      b.scale.set(r, r, r);
      break;
    }
    case "bullet":
    default: {
      a.scale.set((p.w + 6) / 2, p.h, p.h); // the unit capsule is 2 long, caps included
      a.position.x = -2;
      b.scale.set(p.w, 2, 2);
      break;
    }
  }
}

export function createEffects(parent) {
  const pools = {};
  for (const shape of Object.keys(BUILD)) pools[shape] = new FramePool(parent, BUILD[shape]);

  // ---- loot: the bobbing diamond crate ----
  const loot = new FramePool(parent, () => {
    const g = new THREE.Group();
    const crate = new THREE.Mesh(GEO.box, new THREE.MeshStandardMaterial({
      color: "#f2c14e", emissive: "#5a3c08", roughness: 0.5, metalness: 0.3,
    }));
    const lid = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: "#fff2c0" }));
    const spin = new THREE.Group();
    spin.add(crate, lid);
    g.add(spin);
    return g;
  });

  // ---- the exit: a beam column, two posts, rising chevrons ----
  const exit = new THREE.Group();
  const beamTex = (() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 128;
    const g2 = c.getContext("2d");
    const g = g2.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, "rgba(140,255,190,0.04)");
    g.addColorStop(1, "rgba(140,255,190,1)");
    g2.fillStyle = g;
    g2.fillRect(0, 0, 4, 128);
    return new THREE.CanvasTexture(c);
  })();
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1, true), beamMat);
  const postMat = new THREE.MeshBasicMaterial({ color: "#8affc1" });
  const postL = new THREE.Mesh(GEO.box, postMat);
  const postR = new THREE.Mesh(GEO.box, postMat);
  const chevMat = new THREE.MeshBasicMaterial({ color: "#b4ffd2", transparent: true, depthWrite: false });
  const chevGeo = new THREE.ConeGeometry(0.5, 1, 3);
  const chevrons = [0, 1, 2].map(() => new THREE.Mesh(chevGeo, chevMat));
  exit.add(beam, postL, postR, ...chevrons);
  parent.add(exit);

  // ---- sparks and bursts: one Points cloud, additive, alpha in colour ----
  const pos = new Float32Array(MAX_PARTICLES * 3);
  const col = new Float32Array(MAX_PARTICLES * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 5, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  points.renderOrder = 20;
  parent.add(points);
  const c = new THREE.Color();

  return {
    sync(m, halos) {
      const scene = m.scene;
      const t = m.time;

      for (const k in pools) pools[k].begin();
      for (const p of scene.projectiles) {
        const shape = BUILD[p.shape] ? p.shape : defaultShape(p);
        const g = pools[shape].next();
        layoutShot(shape, g, p);
        g.position.set(p.x + p.w / 2, viewY(p.y + p.h / 2), 3);
        g.rotation.z = Math.atan2(-(p.vy || 0), p.vx || (p.vy ? 0 : 1));
        for (const ch of g.children) if (ch.userData.tint) setColor(ch.material.color, p.color);
        putHalo(halos, p.x + p.w / 2, p.y + p.h / 2, Math.max(p.w, p.h) * 1.4 + 12, p.color, 0.45, 2);
      }
      for (const k in pools) pools[k].end();

      loot.begin();
      for (const l of scene.loot) {
        if (l.collected) continue;
        const g = loot.next();
        const y = l.y + Math.sin(l.bob) * 3; // the 2D bob
        g.position.set(l.x + l.w / 2, viewY(y + l.h / 2), 0);
        const spin = g.children[0];
        spin.rotation.set(0, t * 1.6, Math.PI / 4);
        spin.children[0].scale.set(14, 14, 14);
        spin.children[1].scale.set(14.4, 4, 14.4);
        spin.children[1].position.set(0, 5.2, 0);
        putHalo(halos, l.x + l.w / 2, y + l.h / 2, 40, "#f2c14e", 0.25 + 0.12 * Math.sin(t * 5), -4);
      }
      loot.end();

      const ex = scene.exit;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      beam.scale.set(ex.w, ex.h, 24);
      beam.position.set(ex.x + ex.w / 2, viewY(ex.y + ex.h / 2), 0);
      beamMat.opacity = 0.22 + pulse * 0.18;
      postL.scale.set(3, ex.h, 6);
      postL.position.set(ex.x - 1.5, viewY(ex.y + ex.h / 2), 12);
      postR.scale.set(3, ex.h, 6);
      postR.position.set(ex.x + ex.w + 1.5, viewY(ex.y + ex.h / 2), 12);
      chevMat.opacity = 0.5 + pulse * 0.4;
      chevrons.forEach((ch, i) => {
        const yy = ex.y + ex.h - ((t * 60 + i * (ex.h / 3)) % ex.h);
        ch.scale.set(18, 8, 4);
        ch.position.set(ex.x + ex.w / 2, viewY(yy - 4), 10);
      });

      const list = m.particles;
      const n = Math.min(list.length, MAX_PARTICLES);
      for (let i = 0; i < n; i++) {
        const p = list[i];
        const a = Math.min(1, Math.max(0, p.life / p.max));
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = viewY(p.y);
        pos[i * 3 + 2] = 6;
        setColor(c, p.color);
        col[i * 3] = c.r * a;
        col[i * 3 + 1] = c.g * a;
        col[i * 3 + 2] = c.b * a;
      }
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    dispose() {
      for (const k in pools) pools[k].dispose();
      loot.dispose();
      parent.remove(exit);
      beam.geometry.dispose();
      beamMat.dispose();
      beamTex.dispose();
      postMat.dispose();
      chevGeo.dispose();
      chevMat.dispose();
      parent.remove(points);
      geo.dispose();
      points.material.dispose();
    },
  };
}
