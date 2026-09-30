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
  for (const e of world.enemies) if (e.alive) drawEnemy(ctx, e);
  for (const s of world.soldiers) if (s.alive) drawSoldier(ctx, s, s === controlled(world));
  for (const p of world.projectiles) drawProjectile(ctx, p);
  drainEvents(view, world);
  drawParticles(ctx, view, dt);
  ctx.restore();
  drawHud(ctx, world, vw, vh);
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
    switch (ev.type) {
      case "muzzle": view.particles.push({ x: ev.x, y: ev.y, vx: 0, vy: 0, life: 0.06, max: 0.06, color: "#fff4c8", size: 7, glow: true }); break;
      case "spark": burst(view, ev.x, ev.y, ev.color, 4, 90); break;
      case "hit": burst(view, ev.x, ev.y, ev.color, 7, 150); break;
      case "explode":
        view.particles.push({ ring: true, x: ev.x, y: ev.y, r: ev.r, life: 0.3, max: 0.3, color: "#ff9b4a" });
        burst(view, ev.x, ev.y, "#ff9b4a", 18, 260, 0.5, 3);
        break;
      case "chain": view.particles.push({ line: true, x: ev.x0, y: ev.y0, x1: ev.x1, y1: ev.y1, life: 0.15, max: 0.15, color: "#8fd0ff" }); break;
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

function drawEnemy(ctx, e) {
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

// ---- HUD ------------------------------------------------------------------------
function drawHud(ctx, world, vw, vh) {
  const s = controlled(world);
  if (!s) return;
  ctx.font = "14px ui-monospace, Menlo, Consolas, monospace";
  ctx.textBaseline = "alphabetic";
  const w = s.weapon;
  const ammo = s.reloading > 0 ? "RELOADING" : `${s.ammo} / ${w.magazine}`;
  const lines = [
    `${s.name}   HP ${Math.ceil(s.hp)} / ${s.maxHp}`,
    `${w.name}   ${ammo}   mags ${s.magsLeft}`,
  ];
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(12, vh - 58, 360, 46);
  ctx.fillStyle = "#dfe8ff";
  lines.forEach((l, i) => ctx.fillText(l, 22, vh - 38 + i * 18));
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
