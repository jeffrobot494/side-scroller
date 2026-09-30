// ---------------------------------------------------------------------------
// SPACE PROTOTYPE — drawing (tech/space-prototype.md). Reads the world, never
// writes gameplay state. Cosmetic randomness (stars, sparks) is Math.random on
// purpose: it never touches world.rng, so replays stay replays.
// ---------------------------------------------------------------------------

import { CFG, controlled, ENEMY_TYPES, bootsState } from "./sim.js";

const EDGE_PAD = 160; // how far past the map edge the camera may look
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 2.5;

// The view rectangle in world px: top-left (x, y), size (w, h) = the screen
// divided by the zoom. The 3D camera frames exactly this rectangle at z=0, so
// the 2D overlay, mouse aim and sound placement all use it unchanged.
export function cameraFor(world, vw, vh, zoom = 1) {
  const s = controlled(world) || world.soldiers.find((o) => o.alive) || world.soldiers[0];
  const fx = s ? s.x : world.size / 2;
  const fy = s ? s.y : world.size / 2;
  const w = vw / zoom, h = vh / zoom;
  const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  return {
    x: clamp(fx - w / 2, -EDGE_PAD, world.size + EDGE_PAD - w),
    y: clamp(fy - h / 2, -EDGE_PAD, world.size + EDGE_PAD - h),
    w, h, zoom,
  };
}

// One wheel notch is about ±15%.
export function zoomBy(view, deltaY) {
  view.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.zoom * Math.exp(-deltaY * 0.0015)));
  return view.zoom;
}

// How the side-view figure is turned (view3d.js). The model faces +x with its
// head up (+y, Three's y-up); facing is the sim's `angle`, y-down. The sim's
// `dir` says which side of facing the head is on (upOf in sim.js): -1 draws the
// model mirrored. The view keeps no pose state of its own. Returns the mirror
// (dir) and the z rotation in Three's frame.
export function figurePose(s) {
  return { dir: s.dir, rot: s.dir > 0 ? -s.angle : Math.PI - s.angle };
}

export function createView() {
  const stars = [];
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 160; i++) {
      stars.push({ x: Math.random() * 2400, y: Math.random() * 2400, z: 0.15 + layer * 0.2, s: 0.6 + layer * 0.5, a: 0.3 + Math.random() * 0.5 });
    }
  }
  return { stars, particles: [], zoom: 1 };
}

// `three`: the world itself is drawn by view3d.js on the canvas underneath, so
// this one is a transparent overlay of tells, bars, arrows and HUD. Without it
// (Three failed to load, or a test) this draws the whole flat view.
export function draw(ctx, view, world, vw, vh, dt, three = false) {
  const cam = cameraFor(world, vw, vh, view.zoom);
  if (three) ctx.clearRect(0, 0, vw, vh);
  else {
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, vw, vh);
    drawStars(ctx, view, cam, vw, vh);
  }

  ctx.save();
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  if (three) drawTells(ctx, world);
  else {
    drawBounds(ctx, world);
    if (world.extract) drawExtract(ctx, world.extract, world.t);
    for (const r of world.ruins) drawRuin(ctx, r);
    for (const a of world.asteroids) drawAsteroid(ctx, a);
    if (world.artifact) drawArtifact(ctx, world.artifact, world.t);
    for (const e of world.enemies) if (e.alive) drawEnemy(ctx, e, world.t);
    for (const s of world.soldiers) if (s.alive) drawSoldier(ctx, s, s === controlled(world));
    for (const p of world.projectiles) drawProjectile(ctx, p);
  }
  drainEvents(view, world);
  if (!three) drawParticles(ctx, view, dt);
  ctx.restore();
  if (three) drawBars(ctx, world, cam);
  drawArrows(ctx, world, cam, vw, vh);
  drawHurt(ctx, view, world, vw, vh, dt);
  drawHud(ctx, world, vw, vh);
  drawSquad(ctx, world, vw);
  if (view.waveBanner && (view.waveBanner.t -= dt) > 0 && !world.end) {
    ctx.globalAlpha = Math.min(1, view.waveBanner.t);
    ctx.fillStyle = "#ff8a8a";
    ctx.font = "bold 20px ui-monospace, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`WAVE ${view.waveBanner.n} INBOUND`, vw / 2, 60);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }
  if (world.end) drawEnd(ctx, world.end, vw, vh);
  return cam;
}

// ---- events → cosmetic particles ---------------------------------------------
function burst(view, x, y, color, n, speed, life = 0.35, size = 2) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.7);
    view.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size });
  }
}

function drainEvents(view, world) {
  for (const ev of world.events) {
    if (ev.type === "wave") view.waveBanner = { n: ev.n, t: 2.5 };
    switch (ev.type) {
      case "muzzle": view.particles.push({ x: ev.x, y: ev.y, vx: 0, vy: 0, life: 0.06, max: 0.06, color: "#fff4c8", size: 7, glow: true }); break;
      case "spark": burst(view, ev.x, ev.y, ev.color, 4, 90); break;
      case "hit": burst(view, ev.x, ev.y, ev.color, 7, 150); break;
      case "explode":
        view.particles.push({ ring: true, x: ev.x, y: ev.y, r: ev.r, life: 0.3, max: 0.3, color: "#ff9b4a" });
        burst(view, ev.x, ev.y, "#ff9b4a", 18, 260, 0.5, 3);
        break;
      case "chain": view.particles.push({ line: true, x: ev.x0, y: ev.y0, x1: ev.x1, y1: ev.y1, life: 0.15, max: 0.15, color: "#8fd0ff" }); break;
      case "pickup": burst(view, ev.x, ev.y, "#78ffe6", 24, 200, 0.6, 3); break;
      case "death": burst(view, ev.x, ev.y, ev.color || "#ff6a6a", 22, 220, 0.6, 3); break;
    }
  }
  world.events.length = 0;
}

function drawParticles(ctx, view, dt) {
  const keep = [];
  for (const p of view.particles) {
    p.life -= dt;
    if (p.life <= 0) continue;
    keep.push(p);
    const k = p.life / p.max;
    ctx.globalAlpha = k;
    if (p.ring) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4 * k + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1.1 - k * 0.6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,155,74,0.12)";
      ctx.fill();
    } else if (p.line) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      const mx = (p.x + p.x1) / 2 + (Math.random() - 0.5) * 24;
      const my = (p.y + p.y1) / 2 + (Math.random() - 0.5) * 24;
      ctx.lineTo(mx, my);
      ctx.lineTo(p.x1, p.y1);
      ctx.stroke();
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.fillStyle = p.color;
      if (p.glow) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
  view.particles = keep;
}

// ---- actors --------------------------------------------------------------------
function hpBar(ctx, a, y) {
  const w = Math.max(28, a.r * 2);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(a.x - w / 2, y, w, 4);
  ctx.fillStyle = a.team === "player" ? "#8affc1" : "#ff6a6a";
  ctx.fillRect(a.x - w / 2, y, w * Math.max(0, a.hp / a.maxHp), 4);
}

function statusTint(ctx, a) {
  if (a.burn) {
    ctx.fillStyle = "rgba(255,120,40,0.35)";
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r + 3 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (a.slow) {
    ctx.strokeStyle = "rgba(143,208,255,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawEnemy(ctx, e, t) {
  if (e.kind === "enemy") return drawAlien(ctx, e, t);
  statusTint(ctx, e);
  // S2 target dummy: a ringed drone.
  ctx.fillStyle = e.flash > 0 ? "#ffffff" : "#7a3b3b";
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ff8a8a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  hpBar(ctx, e, e.y - e.r - 10);
}

function drawAlien(ctx, e, t) {
  const T = ENEMY_TYPES[e.type];
  const col = e.flash > 0 ? "#ffffff" : T.color;
  statusTint(ctx, e);
  ctx.save();
  ctx.translate(e.x, e.y);
  const face = e.target && e.alert ? Math.atan2(e.target.y - e.y, e.target.x - e.x) : Math.atan2(e.vy, e.vx);
  // Wind-up tell: a swelling ring while a shot is telegraphed.
  if (e.tele > 0) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 4 + (T.tele - e.tele) * 20, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = col;
  switch (e.type) {
    case "charger": {
      ctx.rotate(Math.atan2(e.vy, e.vx));
      ctx.fillStyle = "rgba(255,120,80,0.7)";
      ctx.beginPath();
      ctx.moveTo(-e.r, -4); ctx.lineTo(-e.r - 8 - Math.random() * 8, 0); ctx.lineTo(-e.r, 4);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(e.r + 4, 0); ctx.lineTo(0, -e.r); ctx.lineTo(-e.r, 0); ctx.lineTo(0, e.r);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "gunner": {
      ctx.rotate(face);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * e.r, Math.sin(a) * e.r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#3b1a45";
      ctx.fillRect(4, -4, e.r + 6, 8);
      ctx.fillStyle = "#8affc1";
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "swarmer": {
      ctx.rotate(Math.atan2(e.vy, e.vx));
      ctx.beginPath();
      ctx.moveTo(e.r + 3, 0); ctx.lineTo(-e.r, -e.r * 0.8); ctx.lineTo(-e.r * 0.4, 0); ctx.lineTo(-e.r, e.r * 0.8);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "minelayer": {
      const pulse = 1 + Math.sin(t * 3 + e.heading) * 0.06;
      ctx.scale(pulse, 1 / pulse);
      ctx.beginPath();
      ctx.ellipse(0, 0, e.r * 1.2, e.r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(191,242,154,0.8)";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-6 + i * 6, 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "mine": {
      const armed = e.age >= T.arm;
      const hot = e.fuse > 0;
      const blink = hot ? Math.sin(t * 60) > 0 : armed ? Math.sin(t * 6) > 0.6 : false;
      ctx.rotate(t * 1.5);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * e.r * 0.6, Math.sin(a) * e.r * 0.6);
        ctx.lineTo(Math.cos(a) * (e.r + 5), Math.sin(a) * (e.r + 5));
        ctx.stroke();
      }
      ctx.fillStyle = "#3a4a2a";
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hot ? "#ff5040" : blink ? "#ffec80" : "#6a7a4a";
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (hot) {
        ctx.strokeStyle = "rgba(255,80,64,0.5)";
        ctx.beginPath();
        ctx.arc(0, 0, T.blast.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
  if (e.type !== "mine" && e.hp < e.maxHp) hpBar(ctx, e, e.y - e.r - 10);
}

// ---- projectiles (the look of drawProjectile, src/mission/render.js) ----------
function drawProjectile(ctx, p) {
  const ang = Math.atan2(p.vy, p.vx);
  ctx.save();
  ctx.shadowBlur = 12;
  ctx.shadowColor = p.color;
  ctx.fillStyle = p.color;
  ctx.translate(p.x, p.y);
  switch (p.shape) {
    case "orb": {
      const r = Math.max(p.w, p.h) / 2;
      dot(ctx, 0, 0, r);
      ctx.fillStyle = "#ffffff";
      dot(ctx, 0, 0, r * 0.4);
      break;
    }
    case "pellet":
      dot(ctx, 0, 0, Math.max(2, Math.max(p.w, p.h) / 2));
      break;
    case "bolt": {
      const len = Math.max(p.w, p.h, 10);
      const half = Math.max(2, Math.min(p.w, p.h)) / 2;
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
      const len = Math.max(p.w, 14);
      const half = Math.max(3, p.h) / 2;
      ctx.rotate(ang);
      ctx.fillStyle = "rgba(255,180,90,0.8)";
      ctx.beginPath();
      ctx.moveTo(-len / 2, -half);
      ctx.lineTo(-len / 2 - (6 + Math.random() * 8), 0);
      ctx.lineTo(-len / 2, half);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.fillRect(-len / 2, -half, len * 0.82, half * 2);
      ctx.beginPath();
      ctx.moveTo(len * 0.32, -half);
      ctx.lineTo(len / 2, 0);
      ctx.lineTo(len * 0.32, half);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "wave": {
      const r = Math.max(p.w, p.h) / 2 + 2;
      ctx.rotate(ang);
      ctx.lineWidth = Math.max(2, Math.min(p.w, p.h) * 0.6);
      ctx.strokeStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI * 0.55, Math.PI * 0.55);
      ctx.stroke();
      break;
    }
    default: {
      ctx.rotate(ang);
      ctx.fillRect(-p.w / 2 - 4, -p.h / 2, p.w + 6, p.h);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-p.w / 2, -1, p.w, 2);
    }
  }
  ctx.restore();
}

function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---- ruins + objective -------------------------------------------------------------
function drawRuin(ctx, r) {
  // Deck: the full outline, filled dark, so the inside reads as inside.
  ctx.beginPath();
  r.hull.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = "rgba(60,72,88,0.35)";
  ctx.fill();
  // Deck plating lines along the hull's axis.
  ctx.save();
  ctx.clip();
  ctx.translate(r.x, r.y);
  ctx.rotate(r.angle);
  ctx.strokeStyle = "rgba(140,160,190,0.08)";
  ctx.lineWidth = 1;
  for (let y = -r.W / 2; y < r.W / 2; y += 22) {
    ctx.beginPath();
    ctx.moveTo(-r.L / 2, y);
    ctx.lineTo(r.L / 2, y);
    ctx.stroke();
  }
  ctx.restore();
  // Walls as they actually collide.
  ctx.lineCap = "round";
  for (const w of r.walls) {
    ctx.strokeStyle = "#8a96a8";
    ctx.lineWidth = w.t * 2;
    ctx.beginPath();
    ctx.moveTo(w.x0, w.y0);
    ctx.lineTo(w.x1, w.y1);
    ctx.stroke();
    ctx.strokeStyle = "#c9d3e0";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

function drawArtifact(ctx, a, t) {
  if (a.carrier) {
    // Carried: a small glyph orbiting the carrier.
    const x = a.x + Math.cos(t * 3) * (a.carrier.r + 10);
    const y = a.y + Math.sin(t * 3) * (a.carrier.r + 10);
    glyph(ctx, x, y, 7, t);
    return;
  }
  ctx.fillStyle = "rgba(120,255,230,0.12)";
  ctx.beginPath();
  ctx.arc(a.x, a.y, a.r * (2.2 + Math.sin(t * 4) * 0.3), 0, Math.PI * 2);
  ctx.fill();
  glyph(ctx, a.x, a.y, a.r, t);
}

function glyph(ctx, x, y, r, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 1.2);
  ctx.shadowBlur = 16;
  ctx.shadowColor = "#78ffe6";
  ctx.fillStyle = "#78ffe6";
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#0b2b28";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawExtract(ctx, ex, t) {
  ctx.fillStyle = "rgba(138,255,193,0.06)";
  ctx.beginPath();
  ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(138,255,193,${0.5 + Math.sin(t * 3) * 0.2})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -t * 20;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#8affc1";
  ctx.font = "bold 14px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.fillText("EXTRACT", ex.x, ex.y + 5);
  ctx.textAlign = "left";
}

function drawEnd(ctx, end, vw, vh) {
  const col = end.success ? "#8affc1" : "#ff6a6a";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, vh / 2 - 60, vw, 120);
  ctx.textAlign = "center";
  ctx.fillStyle = col;
  ctx.font = "bold 36px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillText(end.success ? "EXTRACTION SUCCESSFUL" : "SQUAD WIPED", vw / 2, vh / 2 + 4);
  ctx.fillStyle = "#dfe8ff";
  ctx.font = "15px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillText("Press Enter for a new field", vw / 2, vh / 2 + 36);
  ctx.textAlign = "left";
}

function objectiveText(world) {
  const a = world.artifact;
  if (!a) return "";
  if (a.carrier) return "Artifact secured — reach EXTRACT";
  return "Find the artifact in the derelicts";
}

// ---- edge arrows: what is offscreen and where ------------------------------------
function drawArrows(ctx, world, cam, vw, vh) {
  const cx = vw / 2, cy = vh / 2;
  const pad = 28;
  const arrow = (x, y, color, size, label) => {
    const sx = (x - cam.x) * cam.zoom, sy = (y - cam.y) * cam.zoom;
    if (sx > 0 && sx < vw && sy > 0 && sy < vh) return false; // on screen
    const dx = sx - cx, dy = sy - cy;
    // Scale onto the padded screen rectangle.
    const k = Math.min((vw / 2 - pad) / Math.abs(dx || 1e-6), (vh / 2 - pad) / Math.abs(dy || 1e-6));
    const ax = cx + dx * k, ay = cy + dy * k;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, -size * 0.7);
    ctx.lineTo(-size * 0.3, 0);
    ctx.lineTo(-size * 0.7, size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (label) {
      ctx.fillStyle = color;
      ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, ax - Math.cos(Math.atan2(dy, dx)) * 26, ay - Math.sin(Math.atan2(dy, dx)) * 26 + 4);
      ctx.textAlign = "left";
    }
    return true;
  };
  const lead = controlled(world);
  const from = lead || world.soldiers.find((s) => s.alive);
  // Hostiles within 1600px, fading with distance; mines only when near.
  for (const e of world.enemies) {
    if (!e.alive || e.kind !== "enemy" || !from) continue;
    const d = Math.hypot(e.x - from.x, e.y - from.y);
    if (d > (e.type === "mine" ? 500 : 1600)) continue;
    ctx.globalAlpha = 0.35 + 0.65 * (1 - d / 1600);
    arrow(e.x, e.y, e.alert ? "#ff6a6a" : "#b07070", e.alert ? 9 : 7);
  }
  ctx.globalAlpha = 1;
  const dist = (x, y) => (from ? `${Math.round(Math.hypot(x - from.x, y - from.y) / 10) * 10}` : "");
  const art = world.artifact;
  if (world.extract && art && art.carrier) arrow(world.extract.x, world.extract.y, "#8affc1", 13, dist(world.extract.x, world.extract.y));
}

// A red edge flash when the soldier you fly takes damage.
function drawHurt(ctx, view, world, vw, vh, dt) {
  const s = controlled(world);
  if (s && view.lastHp && view.lastWho === s && s.hp < view.lastHp) view.hurt = 0.35;
  view.lastHp = s ? s.hp : 0;
  view.lastWho = s;
  if (!(view.hurt > 0)) return;
  view.hurt -= dt;
  const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
  g.addColorStop(0, "rgba(255,40,40,0)");
  g.addColorStop(1, `rgba(255,40,40,${Math.max(0, view.hurt) * 0.9})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
}

// Squad list, top right: who you fly, who carries the artifact, who is down.
function drawSquad(ctx, world, vw) {
  const x = vw - 250;
  let y = 16;
  ctx.font = "13px ui-monospace, Menlo, Consolas, monospace";
  world.soldiers.forEach((s, i) => {
    const me = i === world.ctrl && s.alive;
    ctx.fillStyle = me ? "rgba(138,255,193,0.14)" : "rgba(0,0,0,0.45)";
    ctx.fillRect(x, y, 236, 38);
    ctx.fillStyle = s.alive ? s.color : "#555";
    ctx.fillRect(x, y, 4, 38);
    ctx.fillStyle = s.alive ? "#dfe8ff" : "#666";
    const tag = world.artifact && world.artifact.carrier === s ? "  ◆" : "";
    ctx.fillText(`${me ? "▶ " : ""}${s.name}${tag}`, x + 12, y + 15);
    if (s.alive) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x + 12, y + 23, 120, 5);
      ctx.fillStyle = "#8affc1";
      ctx.fillRect(x + 12, y + 23, 120 * Math.max(0, s.hp / s.maxHp), 5);
      ctx.fillStyle = "#9aa6b8";
      const ammo = s.reloading > 0 ? "reload" : `${s.ammo}/${s.weapon.magazine}`;
      ctx.fillText(ammo, x + 142, y + 30);
    } else {
      ctx.fillStyle = "#884444";
      ctx.fillText("KIA", x + 12, y + 31);
    }
    y += 44;
  });
}

// ---- HUD ------------------------------------------------------------------------
function drawHud(ctx, world, vw, vh) {
  const s = controlled(world);
  if (!s || world.end) return;
  ctx.font = "14px ui-monospace, Menlo, Consolas, monospace";
  ctx.textBaseline = "alphabetic";
  const w = s.weapon;
  const ammo = s.reloading > 0 ? "RELOADING" : `${s.ammo} / ${w.magazine}`;
  const lines = [
    `${s.name}   HP ${Math.ceil(s.hp)} / ${s.maxHp}`,
    `${w.name}   ${ammo}   mags ${s.magsLeft}`,
  ];
  // B6: whether Shift would switch the boots on, or they are on.
  const boots = bootsState(world, s);
  const obj = objectiveText(world);
  if (obj) {
    ctx.fillStyle = "#78ffe6";
    ctx.fillText(obj, 22, 30);
  }
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(12, vh - 58, 360, 46);
  ctx.fillStyle = "#dfe8ff";
  lines.forEach((l, i) => ctx.fillText(l, 22, vh - 38 + i * 18));
  if (s.reloading > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(22, vh - 20, 340, 3);
    ctx.fillStyle = "#ffd36a";
    ctx.fillRect(22, vh - 20, 340 * (1 - s.reloading / w.reloadTime), 3);
  }
  ctx.fillStyle = "rgba(223,232,255,0.45)";
  ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "right";
  ctx.fillText(s.boots
    ? "A/D walk · Space jump · mouse aim + fire · Shift boots off · R reload · Tab swap · wheel zoom"
    : "A/D turn · W thrust · mouse aim + fire · Shift boots · R reload · Tab swap · wheel zoom", vw - 16, vh - 16);
  ctx.textAlign = "left";
  ctx.font = "14px ui-monospace, Menlo, Consolas, monospace";
  if (boots) {
    ctx.fillStyle = boots === "on" ? "#78ffe6" : "rgba(120,255,230,0.6)";
    ctx.fillText(boots === "on" ? "BOOTS: ON" : "BOOTS: in range", 22, vh - 88);
  }
  if (s.ammo <= 0 && s.reloading <= 0) {
    ctx.fillStyle = "#ff6a6a";
    ctx.fillText(s.magsLeft > 0 ? "EMPTY — press R" : "OUT OF AMMO", 22, vh - 70);
  }
}

function drawStars(ctx, view, cam, vw, vh) {
  const T = 2400;
  for (const st of view.stars) {
    let x = (st.x - cam.x * st.z) % T;
    let y = (st.y - cam.y * st.z) % T;
    if (x < 0) x += T;
    if (y < 0) y += T;
    if (x > vw || y > vh) continue;
    ctx.fillStyle = `rgba(200,215,255,${st.a})`;
    ctx.fillRect(x, y, st.s, st.s);
  }
}

function drawBounds(ctx, world) {
  ctx.strokeStyle = "rgba(255,90,90,0.35)";
  ctx.setLineDash([18, 12]);
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, world.size, world.size);
  ctx.setLineDash([]);
}

function drawAsteroid(ctx, a) {
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(a.rot);
  const n = a.verts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = a.r * a.verts[i];
    if (i === 0) ctx.moveTo(Math.cos(t) * r, Math.sin(t) * r);
    else ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r);
  }
  ctx.closePath();
  ctx.fillStyle = "#2a2622";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#6b5f52";
  ctx.stroke();
  // A couple of craters so rotation reads.
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.arc(a.r * 0.3, -a.r * 0.2, a.r * 0.18, 0, Math.PI * 2);
  ctx.arc(-a.r * 0.35, a.r * 0.3, a.r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSoldier(ctx, s, isCtrl) {
  statusTint(ctx, s);
  hpBar(ctx, s, s.y - s.r - 12);
  if (isCtrl) drawCtrlTell(ctx, s);
  ctx.save();
  ctx.translate(s.x, s.y);
  // Body turned to facing: pack behind, flame out the back when thrusting.
  ctx.save();
  ctx.rotate(s.angle);
  if (s.thrusting) {
    const len = 14 + Math.random() * 10;
    ctx.fillStyle = "rgba(255,170,60,0.85)";
    ctx.beginPath();
    ctx.moveTo(-s.r + 2, -5);
    ctx.lineTo(-s.r - len, 0);
    ctx.lineTo(-s.r + 2, 5);
    ctx.fill();
  }
  ctx.fillStyle = "#3a4050";
  ctx.fillRect(-s.r - 2, -8, 8, 16); // jetpack
  ctx.fillStyle = s.flash > 0 ? "#ffffff" : s.color;
  ctx.beginPath();
  ctx.arc(0, 0, s.r - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#cfe8ff"; // visor, toward facing
  ctx.fillRect(3, -5, 7, 10);
  ctx.restore();
  // Gun, toward aim.
  ctx.rotate(s.aim);
  ctx.fillStyle = "#d8d8d8";
  ctx.fillRect(4, -2, 18, 4);
  ctx.restore();
}

// The soldier you fly: a ring, and a faint wedge for the arc the gun can reach.
function drawCtrlTell(ctx, s) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.strokeStyle = "rgba(138,255,193,0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, s.r + 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.rotate(s.angle);
  const half = CFG.aimArc / 2;
  ctx.strokeStyle = "rgba(138,255,193,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.cos(-half) * (s.r + 10), Math.sin(-half) * (s.r + 10));
  ctx.lineTo(Math.cos(-half) * 90, Math.sin(-half) * 90);
  ctx.arc(0, 0, 90, -half, half);
  ctx.lineTo(Math.cos(half) * (s.r + 10), Math.sin(half) * (s.r + 10));
  ctx.stroke();
  ctx.restore();
}

// ---- over the 3D view: what a model cannot say --------------------------------
// World space (the caller has applied the zoom): the controlled soldier's arc,
// a shot being wound up, a mine about to go.
function drawTells(ctx, world) {
  const lead = controlled(world);
  if (lead && lead.alive) drawCtrlTell(ctx, lead);
  for (const e of world.enemies) {
    if (!e.alive || e.kind !== "enemy") continue;
    const T = ENEMY_TYPES[e.type];
    if (e.tele > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 4 + (T.tele - e.tele) * 20, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.type === "mine" && e.fuse > 0) {
      ctx.strokeStyle = "rgba(255,80,64,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, T.blast.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// Screen space, so they stay readable at any zoom: health bars and the
// extraction label.
function drawBars(ctx, world, cam) {
  const z = cam.zoom;
  const at = (x, y) => [(x - cam.x) * z, (y - cam.y) * z];
  const bar = (a, lift) => {
    const [x, y] = at(a.x, a.y);
    const w = Math.max(24, a.r * 2 * z);
    const top = y - lift * z - 8;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - w / 2, top, w, 4);
    ctx.fillStyle = a.team === "player" ? "#8affc1" : "#ff6a6a";
    ctx.fillRect(x - w / 2, top, w * Math.max(0, a.hp / a.maxHp), 4);
  };
  // A soldier's figure is taller than its circle (FIGURE_H in view3d.js).
  for (const s of world.soldiers) if (s.alive) bar(s, 24);
  for (const e of world.enemies) {
    if (!e.alive || e.type === "mine") continue;
    if (e.kind === "dummy" || e.hp < e.maxHp) bar(e, e.r + 4);
  }
  if (world.extract) {
    const [x, y] = at(world.extract.x, world.extract.y);
    ctx.fillStyle = "#8affc1";
    ctx.font = "bold 14px ui-monospace, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText("EXTRACT", x, y + 5);
    ctx.textAlign = "left";
  }
}
