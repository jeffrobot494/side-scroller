// ---------------------------------------------------------------------------
// SPACE FPS — the eye (tech/space-fps.md). Where the camera is and how a world
// point lands on the screen: the one answer both views use, so a marker drawn
// by hud.js sits on the thing view3d.js drew. DOM-free.
// ---------------------------------------------------------------------------

import { qmul, qrot, qconj } from "./vec.js";
import { controlled, lookQ } from "./sim.js";

export const EYE_UP = 11; // px from the body's centre to the eyes, in the helmet

// The eye of the soldier you fly; once the squad is dead, the last one's.
export function eyeOf(world, fov, aspect) {
  // ctrl stays on the last soldier flown once nobody is left to swap to.
  const s = controlled(world) || world.soldiers[world.ctrl] || world.soldiers[0];
  const q = qmul(lookQ(s), s.viewOff);
  const up = qrot(s.q, [0, EYE_UP, 0]);
  return { pos: [s.x + up[0], s.y + up[1], s.z + up[2]], q, fov, aspect, body: s };
}

// A world point on a vw × vh screen: { x, y, depth }, depth < 0 behind the eye.
export function project(cam, p, vw, vh) {
  const l = qrot(qconj(cam.q), [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]]);
  const depth = -l[2];
  const f = vh / 2 / Math.tan((cam.fov * Math.PI) / 360);
  const d = Math.abs(depth) < 1e-6 ? 1e-6 : depth;
  return { x: vw / 2 + (l[0] / d) * f, y: vh / 2 - (l[1] / d) * f, depth, lx: l[0], ly: l[1] };
}

// Pixels per world px at a depth: for sizing bars and rings on screen.
export const pxPer = (cam, depth, vh) => vh / 2 / Math.tan((cam.fov * Math.PI) / 360) / Math.max(1, depth);
