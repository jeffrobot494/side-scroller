// ---------------------------------------------------------------------------
// MISSION CAMERA — pure viewport math.
//
// screen = (world - camera) * zoom. No canvas, no config, no DOM, so the rule
// for "what does the screen show" lives in one readable place and can be
// unit-tested (mission.js itself is browser-only).
//
// The world is 540px tall EVERYWHERE (gen/levelgen.js WORLD_H, content.js), the
// same as the classic canvas height. So the moment the viewport is taller than
// that — a bigger canvas, or zooming out — there is surplus vertical space. We
// pin the world's BOTTOM to the bottom of the canvas and let the surplus be
// sky, which the mission's screen-space gradient + parallax skyline already
// fill. The action then stays put instead of sliding around as you zoom.
// ---------------------------------------------------------------------------

// The size the HUD and the background were authored at. Used as the fallback
// canvas size and as the denominator for the HUD's uniform scale factor.
export const DESIGN_W = 960;
export const DESIGN_H = 540;

// How far into the viewport the followed soldier sits: 0.4 = more room ahead
// than behind. Proportional, so the lead grows as you zoom out.
const LEAD = 0.4;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** "1280x720" → { w, h }. Anything unparseable falls back to the design size. */
export function parseCanvasSize(s) {
  const m = /^(\d+)x(\d+)$/.exec(String(s || ""));
  if (!m) return { w: DESIGN_W, h: DESIGN_H };
  return { w: Number(m[1]) || DESIGN_W, h: Number(m[2]) || DESIGN_H };
}

/**
 * Where the camera sits this frame, in world px.
 *   focus        { x, y, w, h } — the entity being followed
 *   viewW/viewH  world units visible = canvas px / zoom
 *   world        { width, height }
 * Reduces to the historical X-only camera at 960x540 with zoom 1.
 */
export function solveCamera(focus, viewW, viewH, world) {
  const targetX = focus.x + focus.w / 2 - viewW * LEAD;
  // Math.max guards a world narrower than the viewport: clamp(v, 0, negative)
  // returns the negative bound and would scroll past the left edge.
  const x = clamp(targetX, 0, Math.max(0, world.width - viewW));

  // Taller than the world → pin the ground to the canvas bottom (y goes
  // negative, the surplus above is sky). Otherwise follow the focus vertically.
  const y =
    viewH >= world.height
      ? world.height - viewH
      : clamp(focus.y + focus.h / 2 - viewH / 2, 0, world.height - viewH);

  return { x, y };
}

// ---- the 3D view's camera (tech/mission-3d.md) ------------------------------
//
// The perspective camera is DERIVED from the 2D one, never solved separately.
// The 2D transform is  screen = world * zoom - round(camera * zoom) + shake,
// so the world rectangle on screen this frame starts at
//   left = (round(camera.x * zoom) - sx) / zoom,  width  = W / zoom
// and likewise in y. The camera sits on the axis through that rectangle's
// centre and looks straight down -z at a distance where the frustum's z=0
// slice is exactly that rectangle. It never tilts or yaws, and shake moves it
// sideways: the one invariant that keeps aim, `toWorld()`, the flat tells and
// the nav overlays correct over the 3D view without touching any of them.
//
// Three.js is y-up and the world is y-down; the flip is `viewY` and nothing
// else — the camera's `position`/`target` come back already flipped, and the
// view (src/mission/view3d/) places every mesh through the same function.
export function viewY(y) {
  return -y;
}

// Vertical field of view, degrees. Narrow, so off-plane depth (extruded
// terrain, skyline) reads as depth without the plane's edges splaying.
export const VIEW3D_FOV = 30;

export function solveCamera3D(camera, zoom, W, H, sx = 0, sy = 0, fov = VIEW3D_FOV) {
  const left = (Math.round(camera.x * zoom) - sx) / zoom;
  const top = (Math.round(camera.y * zoom) - sy) / zoom;
  const width = W / zoom;
  const height = H / zoom;
  const cx = left + width / 2;
  const cy = top + height / 2;
  const dist = height / 2 / Math.tan((fov * Math.PI) / 360);
  return {
    position: { x: cx, y: viewY(cy), z: dist },
    target: { x: cx, y: viewY(cy), z: 0 },
    fov,
    aspect: W / H,
    near: dist * 0.02,
    far: dist * 30,
    view: { left, top, width, height },
  };
}
