// ---------------------------------------------------------------------------
// SHARED PROJECTILE RENDERING
//
// One place that turns a projectile into pixels, so the real mission, the Firing
// Room, and the Weapon Designer preview all draw shots the same way (and gain
// new looks at once). A projectile carries an optional `shape`; when absent we
// derive a sensible default from its size so every legacy weapon still renders.
//
// Coordinates: `p.x`/`p.y` are the projectile's TOP-LEFT in the coordinate space
// already set on `ctx` (the mission translates by its camera before calling;
// the Firing Room draws 1:1). Direction comes from `p.vx`/`p.vy`.
// ---------------------------------------------------------------------------

export const PROJECTILE_SHAPES = ["bullet", "orb", "bolt", "missile", "pellet", "wave"];

// Pick a look for a projectile with no explicit shape (keeps old content valid).
export function defaultShape(p) {
  if (p.w >= 12 && p.h >= 12) return "orb"; // big and round → plasma orb
  if (p.w >= 16) return "bolt"; // long and thin → energy bolt
  if (p.w <= 6 && p.h <= 6) return "pellet"; // tiny → shot pellet
  return "bullet";
}

export function drawProjectile(ctx, p) {
  const shape = p.shape || defaultShape(p);
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const ang = Math.atan2(p.vy || 0, p.vx || (p.vy ? 0 : 1));

  ctx.save();
  ctx.shadowBlur = 12;
  ctx.shadowColor = p.color;
  ctx.fillStyle = p.color;

  switch (shape) {
    case "orb": {
      const r = Math.max(p.w, p.h) / 2;
      circle(ctx, cx, cy, r);
      ctx.fillStyle = "#ffffff";
      circle(ctx, cx, cy, r * 0.4);
      break;
    }

    case "pellet": {
      const r = Math.max(2, Math.max(p.w, p.h) / 2);
      circle(ctx, cx, cy, r);
      break;
    }

    case "bolt": {
      // Tapered glowing capsule pointing along travel, bright inner core.
      const len = Math.max(p.w, p.h, 10);
      const half = Math.max(2, Math.min(p.w, p.h)) / 2;
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(-len * 0.25, -half);
      ctx.lineTo(len / 2, 0);
      ctx.lineTo(-len * 0.25, half);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-len * 0.35, -1, len * 0.7, 2);
      break;
    }

    case "missile": {
      // Elongated body + nose + tail fins + a flickering exhaust plume.
      const len = Math.max(p.w, 14);
      const half = Math.max(3, p.h) / 2;
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      // exhaust
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,180,90,0.8)";
      ctx.beginPath();
      ctx.moveTo(-len / 2, -half);
      ctx.lineTo(-len / 2 - (6 + Math.random() * 8), 0);
      ctx.lineTo(-len / 2, half);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = p.color;
      // body
      roundRect(ctx, -len / 2, -half, len * 0.82, half * 2, half);
      ctx.fill();
      // nose cone
      ctx.beginPath();
      ctx.moveTo(len * 0.32, -half);
      ctx.lineTo(len / 2, 0);
      ctx.lineTo(len * 0.32, half);
      ctx.closePath();
      ctx.fill();
      // fins
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-len / 2, -half - 2, 4, 2);
      ctx.fillRect(-len / 2, half, 4, 2);
      break;
    }

    case "wave": {
      // A crescent energy arc, opening away from travel.
      const r = Math.max(p.w, p.h) / 2 + 2;
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.lineWidth = Math.max(2, Math.min(p.w, p.h) * 0.6);
      ctx.strokeStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI * 0.55, Math.PI * 0.55);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = Math.max(1, ctx.lineWidth * 0.4);
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI * 0.4, Math.PI * 0.4);
      ctx.stroke();
      break;
    }

    case "bullet":
    default: {
      // Rounded streak with a short back-trail + a bright center line, rotated
      // to travel so arcing shots read correctly.
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      roundRect(ctx, -p.w / 2 - 4, -p.h / 2, p.w + 6, p.h, p.h / 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-p.w / 2, -1, p.w, 2);
      break;
    }
  }

  ctx.restore();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
