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
//
// `scale` is the host's world→screen factor, and exists for ONE reason: canvas
// shadows are measured in device pixels and ignore the transform, so a zoomed-
// out mission would shrink the shot but not its glow, turning every tracer into
// a smear. Defaults to 1, which is what the 1:1 hosts pass.
// ---------------------------------------------------------------------------

export const PROJECTILE_SHAPES = ["bullet", "orb", "bolt", "missile", "pellet", "wave"];

// ---- navigation overlays --------------------------------------------------
// The nav graph and a held route, drawn in WORLD space by whoever has already
// set the transform. Shared by the Behavior Lab (1:1, panned) and the mission's
// debug overlay (camera + zoom) so the two cannot drift apart — one set of edge
// colours, one arrowhead, one legend.
//
// Deliberately takes a graph and a path rather than a scene: navigation.js
// resolves which graph belongs to which body, and this module must not acquire
// an opinion about that (or an import cycle with it).
//
// `halfW` is the body's half-width. Node spans are in body-LEFT-EDGE space —
// that is what the router works in — so a span drawn raw sits half a body left
// of where the agent actually stands. Callers pass halfW to shift into CENTRE
// space, which is where the box on screen is.

export const NAV_EDGE_COLOR = { walk: "#4b5a6e", hop: "#4fd1c5", jump: "#7bd47b", drop: "#e2934a" };

const NODE_COLOR = "#7ad7ff";
const PATH_COLOR = "#ffd479";

// Every standable node and every directed move between them, for ONE body.
// viewL/viewR cull to what is on screen; a generated level is far wider than any
// viewport and drawing all of it every frame is wasted work.
export function drawNavGraph(ctx, graph, { halfW = 0, viewL = -Infinity, viewR = Infinity } = {}) {
  if (!graph || !graph.nodes) return;
  const mid = (n) => (n.a + n.b) / 2 + halfW;
  const visible = (x0, x1) => Math.max(x0, x1) >= viewL && Math.min(x0, x1) <= viewR;

  for (let i = 0; i < graph.nodes.length; i++) {
    const from = graph.nodes[i];
    for (const e of graph.edges[i]) {
      const to = graph.nodes[e.to];
      if (!to) continue;
      const x0 = mid(from);
      const x1 = mid(to);
      if (!visible(x0, x1)) continue;
      const color = NAV_EDGE_COLOR[e.kind] || NAV_EDGE_COLOR.walk;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, from.y);
      ctx.lineTo(x1, to.y);
      ctx.stroke();
      // An arrowhead near the destination: without it a one-way drop and a
      // two-way pair of hops look identical.
      const t = 0.78;
      const hx = x0 + (x1 - x0) * t;
      const hy = from.y + (to.y - from.y) * t;
      const len = Math.hypot(x1 - x0, to.y - from.y) || 1;
      const ux = (x1 - x0) / len;
      const uy = (to.y - from.y) / len;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(hx + ux * 5, hy + uy * 5);
      ctx.lineTo(hx - uy * 3.5, hy + ux * 3.5);
      ctx.lineTo(hx + uy * 3.5, hy - ux * 3.5);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  for (const n of graph.nodes) {
    const l = n.a + halfW;
    const r = n.b + halfW;
    if (!visible(l, r)) continue;
    ctx.fillStyle = NODE_COLOR;
    ctx.fillRect(l, n.y - 2, Math.max(2, r - l), 3);
  }
}

// A route an agent is HOLDING — never recomputed by the caller. A view that
// repathed to draw would show a fresher route than the one being walked, which
// is exactly the thing you would turn this on to diagnose.
export function drawNavPath(ctx, graph, path, { halfW = 0, color = PATH_COLOR } = {}) {
  if (!graph || !graph.nodes || !path || !path.length) return;
  const mid = (n) => (n.a + n.b) / 2 + halfW;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  for (let i = 0; i < path.length; i++) {
    const n = graph.nodes[path[i]];
    if (!n) break; // the graph was rebuilt under a held path; draw what is valid
    const x = mid(n);
    if (i === 0) ctx.moveTo(x, n.y);
    else ctx.lineTo(x, n.y);
  }
  ctx.stroke();
  for (const id of path) {
    const n = graph.nodes[id];
    if (!n) continue;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mid(n), n.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Pick a look for a projectile with no explicit shape (keeps old content valid).
export function defaultShape(p) {
  if (p.w >= 12 && p.h >= 12) return "orb"; // big and round → plasma orb
  if (p.w >= 16) return "bolt"; // long and thin → energy bolt
  if (p.w <= 6 && p.h <= 6) return "pellet"; // tiny → shot pellet
  return "bullet";
}

export function drawProjectile(ctx, p, scale = 1) {
  const shape = p.shape || defaultShape(p);
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const ang = Math.atan2(p.vy || 0, p.vx || (p.vy ? 0 : 1));

  ctx.save();
  ctx.shadowBlur = 12 * scale;
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
