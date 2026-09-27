// ---------------------------------------------------------------------------
// 3D VIEW — the identity map and the cues every actor model shares
// (tech/mission-3d.md).
//
// Soldiers and enemy parts are mapped to models BY IDENTITY: both objects are
// stable for a mission, in a room too. The view caches nothing on them — the
// map is the view's. Anything not seen this frame is hidden, and anything that
// has left its array for good (a spawned child that died, an extracted
// soldier) is disposed.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { putHalo, disposeTree } from "./util.js";

export class ModelMap {
  constructor(parent, make) {
    this.parent = parent;
    this.make = make;
    this.map = new Map();
    this.seen = new Set();
  }
  begin() {
    this.seen.clear();
  }
  // The model for `obj`, created on first sight.
  get(obj) {
    let v = this.map.get(obj);
    if (!v) {
      v = this.make(obj);
      this.map.set(obj, v);
      this.parent.add(v.root);
    }
    this.seen.add(obj);
    v.root.visible = true;
    return v;
  }
  // Hide the unseen; `keep(obj)` says whether it may come back (a live part
  // that is disabled this frame) or is gone for good.
  end(keep) {
    for (const [obj, v] of this.map) {
      if (this.seen.has(obj)) continue;
      v.root.visible = false;
      if (!keep(obj)) this._drop(obj, v);
    }
  }
  _drop(obj, v) {
    this.parent.remove(v.root);
    disposeTree(v.root);
    this.map.delete(obj);
  }
  dispose() {
    for (const [obj, v] of this.map) this._drop(obj, v);
  }
}

// Hit flash (white) and telegraph (red emissive on the 2D pulse's clock,
// sin(t·26)) on a set of materials. `base` is each material's own colour.
const WHITE = new THREE.Color("#ffffff");
const RED = new THREE.Color("#ff4a3a");
export function applyFlash(mats, flash, telegraph, time) {
  const pulse = telegraph ? 0.5 + 0.5 * Math.sin(time * 26) : 0;
  for (const m of mats) {
    if (flash) {
      m.color.copy(WHITE);
      m.emissive.copy(WHITE).multiplyScalar(0.7);
    } else {
      m.color.copy(m.userData.base);
      if (telegraph) m.emissive.copy(RED).multiplyScalar(0.35 + pulse * 0.65);
      else if (m.userData.glow) m.emissive.copy(m.userData.glow);
      else m.emissive.setRGB(0, 0, 0);
    }
  }
  return pulse;
}

// Burning: the 2D view licks three flames off the top edge; here a flickering
// orange glow sits on the top of the box.
export function burnHalo(halos, x, y, w, time) {
  const f = 0.75 + Math.random() * 0.5;
  putHalo(halos, x + w / 2, y + 2 + Math.sin(time * 12) * 2, (w + 18) * f, "#ff8a28", 0.75, 14);
}

// The muzzle flash: a hot glow at the barrel tip in the shooter's colour.
export function muzzleHalo(halos, at, css) {
  putHalo(halos, at.x, at.y, 44, css || "#ffd36a", 0.95, 16);
  putHalo(halos, at.x, at.y, 12, "#ffffff", 1, 17);
}
