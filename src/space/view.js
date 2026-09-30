// ---------------------------------------------------------------------------
// SPACE PROTOTYPE — drawing (tech/space-prototype.md). Reads the world, never
// writes gameplay state. Cosmetic randomness (stars, sparks) is Math.random on
// purpose: it never touches world.rng, so replays stay replays.
// ---------------------------------------------------------------------------

import { controlled } from "./sim.js";

const EDGE_PAD = 160; // how far past the map edge the camera may look

export function cameraFor(world, vw, vh) {
  const s = controlled(world) || world.soldiers.find((o) => o.alive) || world.soldiers[0];
  const fx = s ? s.x : world.size / 2;
  const fy = s ? s.y : world.size / 2;
  const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  return {
    x: clamp(fx - vw / 2, -EDGE_PAD, world.size + EDGE_PAD - vw),
    y: clamp(fy - vh / 2, -EDGE_PAD, world.size + EDGE_PAD - vh),
  };
}

export function createView() {
  const stars = [];
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 160; i++) {
      stars.push({ x: Math.random() * 2400, y: Math.random() * 2400, z: 0.15 + layer * 0.2, s: 0.6 + layer * 0.5, a: 0.3 + Math.random() * 0.5 });
    }
  }
  return { stars, particles: [] };
}

export function draw(ctx, view, world, vw, vh, dt) {
  const cam = cameraFor(world, vw, vh);
  ctx.fillStyle = "#05070d";
  ctx.fillRect(0, 0, vw, vh);
  drawStars(ctx, view, cam, vw, vh);

  ctx.save();
  ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  drawBounds(ctx, world);
  for (const a of world.asteroids) drawAsteroid(ctx, a);
  for (const s of world.soldiers) if (s.alive) drawSoldier(ctx, s, s === controlled(world));
  ctx.restore();
  return cam;
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
  ctx.save();
  ctx.translate(s.x, s.y);
  if (isCtrl) {
    ctx.strokeStyle = "rgba(138,255,193,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, s.r + 7, 0, Math.PI * 2);
    ctx.stroke();
  }
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
  ctx.fillStyle = s.color;
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
