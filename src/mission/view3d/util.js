// ---------------------------------------------------------------------------
// 3D VIEW — shared helpers (tech/mission-3d.md).
//
// One unit is one world px. The world is y-down and Three.js is y-up; every
// placement goes through `viewY` (src/mission/camera.js), the one flip.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { viewY } from "../camera.js";

export { viewY };

// A colour string from the game, in whatever CSS form it was authored — hex,
// rgba(), or the space-separated hsl() the soldiers use, which THREE.Color
// does not parse. The browser's own 2D context normalizes it once per string.
const _css = new Map();
let _norm = null;
function normalize(css) {
  let v = _css.get(css);
  if (v) return v;
  if (!_norm) _norm = document.createElement("canvas").getContext("2d");
  _norm.fillStyle = "#ffffff";
  _norm.fillStyle = css;
  const out = String(_norm.fillStyle); // "#rrggbb" or "rgba(r, g, b, a)"
  const m = out.match(/rgba?\(([^)]+)\)/);
  v = m ? m[1].split(",").slice(0, 3).map((n) => Number(n) / 255) : out;
  if (_css.size < 512) _css.set(css, v);
  return v;
}
export function setColor(color, css, fallback = "#ffffff") {
  const v = normalize(typeof css === "string" && css ? css : fallback);
  if (Array.isArray(v)) return color.setRGB(v[0], v[1], v[2], THREE.SRGBColorSpace);
  return color.set(v);
}

// Place an object's centre on a world box (top-left x, y, size w, h).
export function placeOnBox(obj, x, y, w, h, z = 0) {
  obj.position.set(x + w / 2, viewY(y + h / 2), z);
}

// A soft radial glow, drawn once and shared by every halo.
let _glow = null;
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g2 = c.getContext("2d");
  const g = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  g2.fillStyle = g;
  g2.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

// A per-frame pool: `begin()`, then `next()` hands out the i-th object (made on
// demand), and `end()` hides whatever this frame did not ask for. Nothing is
// ever tied to a particular game object — a room viewer rebuilds its
// projectile array on every snapshot, so identity would be meaningless.
export class FramePool {
  constructor(parent, make) {
    this.parent = parent;
    this.make = make;
    this.items = [];
    this.used = 0;
  }
  begin() {
    this.used = 0;
  }
  next() {
    let o = this.items[this.used];
    if (!o) {
      o = this.make();
      this.items.push(o);
      this.parent.add(o);
    }
    this.used++;
    o.visible = true;
    return o;
  }
  end() {
    for (let i = this.used; i < this.items.length; i++) this.items[i].visible = false;
  }
  dispose() {
    for (const o of this.items) {
      this.parent.remove(o);
      disposeTree(o);
    }
    this.items = [];
  }
}

// Additive glow sprites for muzzle flashes, burns, and (R6) shot halos.
export function haloPool(parent) {
  return new FramePool(parent, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    s.renderOrder = 10;
    return s;
  });
}

export function putHalo(pool, x, y, size, css, opacity = 1, z = 12) {
  const s = pool.next();
  s.position.set(x, viewY(y), z);
  s.scale.set(size, size, 1);
  setColor(s.material.color, css);
  s.material.opacity = opacity;
  return s;
}

// Dispose every geometry and material under an object. Shared textures (the
// glow) are left alone — they outlive a deploy.
export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const m = o.material;
    if (m) for (const mm of Array.isArray(m) ? m : [m]) if (!mm.userData.shared) mm.dispose();
  });
}

// Lighten/darken a colour by `d` points of lightness — the 2D renderer's
// `_shade` scale (-22 = the soldier's darker legs and helmet).
export function shade(css, d) {
  const c = new THREE.Color();
  setColor(c, css);
  return c.offsetHSL(0, 0, d / 100);
}
