// ---------------------------------------------------------------------------
// SPACE FPS — the flat layer over the 3D view (tech/space-fps.md): crosshair,
// readouts, markers and bars, on a transparent 2D canvas. Reads the world and
// the events; writes nothing back.
// ---------------------------------------------------------------------------

import { controlled } from "./sim.js";
import { eyeOf } from "./camera.js";

export function createHud() {
  return { hurtT: 0, hitT: 0, banner: null };
}

// Events the HUD reacts to, before the page drains them.
export function hudEvents(hud, world) {
  for (const ev of world.events) {
    if ((ev.type === "hurt" || ev.type === "crash") && ev.ctrl) hud.hurtT = 0.35;
  }
}

export function drawHud(ctx, hud, world, vw, vh, fov, dt) {
  ctx.clearRect(0, 0, vw, vh);
  const cam = eyeOf(world, fov, vw / vh);
  const s = controlled(world);
  if (s) drawCrosshair(ctx, vw, vh);
  drawHurt(ctx, hud, vw, vh, dt);
  drawReadout(ctx, world, cam, vw, vh);
  if (world.end) drawEnd(ctx, world.end, vw, vh);
}

function drawCrosshair(ctx, vw, vh) {
  const cx = vw / 2, cy = vh / 2;
  ctx.strokeStyle = "rgba(200,235,255,0.85)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(cx + dx * 6, cy + dy * 6);
    ctx.lineTo(cx + dx * 14, cy + dy * 14);
  }
  ctx.stroke();
  ctx.fillStyle = "rgba(200,235,255,0.9)";
  ctx.fillRect(cx - 1, cy - 1, 2, 2);
}

// A red edge flash when the soldier you fly is hurt.
function drawHurt(ctx, hud, vw, vh, dt) {
  if (hud.hurtT <= 0) return;
  hud.hurtT -= dt;
  const k = Math.max(0, hud.hurtT / 0.35);
  const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
  g.addColorStop(0, "rgba(255,40,30,0)");
  g.addColorStop(1, `rgba(255,40,30,${0.45 * k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
}

function drawReadout(ctx, world, cam, vw, vh) {
  const s = controlled(world);
  ctx.font = "13px ui-monospace, Menlo, Consolas, monospace";
  ctx.textBaseline = "alphabetic";
  if (s) {
    // HP bar and speed, bottom left.
    const x = 24, y = vh - 54;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(x - 8, y - 22, 236, 58);
    ctx.fillStyle = "#cfe3ff";
    ctx.fillText(s.name, x, y - 6);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(x, y, 200, 8);
    const k = Math.max(0, s.hp / s.maxHp);
    ctx.fillStyle = k > 0.5 ? "#7cf29a" : k > 0.25 ? "#ffd36a" : "#ff6a5a";
    ctx.fillRect(x, y, 200 * k, 8);
    ctx.fillStyle = "#cfe3ff";
    const sp = Math.hypot(s.vx, s.vy, s.vz);
    ctx.fillText(`${Math.ceil(s.hp)}/${s.maxHp} HP   ${Math.round(sp)} px/s`, x, y + 24);
  }
  ctx.fillStyle = "rgba(200,220,255,0.5)";
  ctx.textAlign = "right";
  ctx.fillText("mouse look · W/S/A/D, Space/C jets · Q/E roll · wheel zoom · Enter restarts after the end", vw - 16, vh - 14);
  ctx.textAlign = "left";
}

function drawEnd(ctx, end, vw, vh) {
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, vh / 2 - 60, vw, 120);
  ctx.textAlign = "center";
  ctx.fillStyle = end.success ? "#8affc1" : "#ff6a5a";
  ctx.font = "bold 40px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillText(end.success ? "EXTRACTED" : "SQUAD LOST", vw / 2, vh / 2 + 4);
  ctx.font = "14px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillStyle = "#cfe3ff";
  ctx.fillText("Enter for a new field", vw / 2, vh / 2 + 34);
  ctx.textAlign = "left";
}
