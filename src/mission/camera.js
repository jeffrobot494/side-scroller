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
