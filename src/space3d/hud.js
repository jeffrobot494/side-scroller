// ---------------------------------------------------------------------------
// SPACE FPS — the flat layer over the 3D view (tech/space-fps.md): crosshair,
// readouts, markers and bars, on a transparent 2D canvas. Reads the world and
// the events; writes nothing back.
// ---------------------------------------------------------------------------

import { controlled, bootsState } from "./sim.js";
import { eyeOf, project } from "./camera.js";

export function createHud() {
  return { hurtT: 0, hitT: 0, banner: null };
}

// Events the HUD reacts to, before the page drains them.
export function hudEvents(hud, world) {
  for (const ev of world.events) {
    if ((ev.type === "hurt" || ev.type === "crash") && ev.ctrl) hud.hurtT = 0.35;
    if (ev.type === "hit" && ev.own) { hud.hitT = 0.16; hud.kill = ev.kill; }
  }
}

export function drawHud(ctx, hud, world, vw, vh, fov, dt) {
  ctx.clearRect(0, 0, vw, vh);
  const cam = eyeOf(world, fov, vw / vh);
  const s = controlled(world);
  if (s) drawCrosshair(ctx, hud, vw, vh, dt);
  drawHurt(ctx, hud, vw, vh, dt);
  drawReadout(ctx, world, cam, vw, vh);
  drawObjective(ctx, world, vw);
  drawMarkers(ctx, world, cam, vw, vh);
  if (world.end) drawEnd(ctx, world.end, vw, vh);
}

function drawCrosshair(ctx, hud, vw, vh, dt) {
  const cx = vw / 2, cy = vh / 2;
  // A hit marker: an X round the crosshair, red on a kill.
  if (hud.hitT > 0) {
    hud.hitT -= dt;
    ctx.strokeStyle = hud.kill ? "rgba(255,90,70,0.95)" : "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      ctx.moveTo(cx + dx * 8, cy + dy * 8);
      ctx.lineTo(cx + dx * 15, cy + dy * 15);
    }
    ctx.stroke();
  }
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

    // Boots, under the crosshair: what Shift would do.
    const bs = bootsState(world, s);
    if (bs) {
      ctx.textAlign = "center";
      ctx.fillStyle = bs === "ready" ? "rgba(120,255,230,0.75)" : "#78ffe6";
      ctx.fillText(bs === "ready" ? "BOOTS READY · Shift" : bs === "pull" ? "BOOTS · pulling" : "BOOTS ON · Space jumps · Shift lets go", vw / 2, vh / 2 + 46);
      ctx.textAlign = "left";
    }

    // The gun, bottom right of centre: name, rounds, spares, reload.
    const gx = vw - 260, gy = vh - 72;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(gx - 8, gy - 22, 252, 50);
    ctx.fillStyle = "#cfe3ff";
    ctx.fillText(s.weapon.name, gx, gy - 6);
    if (s.reloading > 0) {
      const k = 1 - s.reloading / (s.weapon.reloadTime || 1.5);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(gx, gy + 2, 200, 6);
      ctx.fillStyle = "#ffd36a";
      ctx.fillRect(gx, gy + 2, 200 * k, 6);
      ctx.fillText("RELOADING", gx, gy + 22);
    } else {
      ctx.fillStyle = s.ammo === 0 ? "#ff6a5a" : "#cfe3ff";
      ctx.font = "bold 18px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(`${s.ammo}`, gx, gy + 18);
      ctx.font = "13px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillStyle = "#cfe3ff";
      ctx.fillText(`/ ${s.weapon.magazine}   spares ${s.magsLeft}${s.ammo === 0 && !s.magsLeft ? "  EMPTY" : ""}`, gx + 44, gy + 18);
    }
  }
  ctx.fillStyle = "rgba(200,220,255,0.5)";
  ctx.textAlign = "right";
  ctx.fillText("mouse look and fire · W/S/A/D, Space/C jets · Q/E roll · Shift boots · R reload · wheel zoom · Enter restarts after the end", vw - 16, vh - 14);
  ctx.textAlign = "left";
}

function objectiveText(world) {
  const art = world.artifact;
  if (!art) return "";
  if (!art.carrier) return "Find the artifact — it is aboard one of the derelicts";
  const s = controlled(world);
  const ex = world.extract;
  const d = s ? Math.round(Math.hypot(ex.x - s.x, ex.y - s.y, ex.z - s.z)) : 0;
  return `${art.carrier.name} has the artifact — reach extraction · ${d} px`;
}

function drawObjective(ctx, world, vw) {
  const text = objectiveText(world);
  if (!text) return;
  ctx.font = "14px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  const w = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(vw / 2 - w / 2 - 12, 12, w + 24, 26);
  ctx.fillStyle = world.artifact.carrier ? "#8affc1" : "#ff9ef4";
  ctx.fillText(text, vw / 2, 30);
  ctx.textAlign = "left";
}

// A marker on a world point: on it when it is in view, else pinned to the
// screen's edge in its direction (behind you included).
export function marker(ctx, cam, p, vw, vh, color, label, size = 9) {
  const pr = project(cam, p, vw, vh);
  const pad = 36;
  const inView = pr.depth > 0 && pr.x >= pad && pr.x <= vw - pad && pr.y >= pad && pr.y <= vh - pad;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  if (inView) {
    ctx.beginPath();
    ctx.moveTo(pr.x, pr.y - size); ctx.lineTo(pr.x + size, pr.y); ctx.lineTo(pr.x, pr.y + size); ctx.lineTo(pr.x - size, pr.y); ctx.closePath();
    ctx.stroke();
    if (label) ctx.fillText(label, pr.x, pr.y - size - 6);
  } else {
    // Direction on the screen plane; behind you, the point's own offset still says which way to turn.
    let dx = pr.lx, dy = -pr.ly;
    if (!dx && !dy) dy = 1;
    const k = Math.min((vw / 2 - pad) / Math.abs(dx || 1e-9), (vh / 2 - pad) / Math.abs(dy || 1e-9));
    const x = vw / 2 + dx * k, y = vh / 2 + dy * k;
    const a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * size * 1.4, y + Math.sin(a) * size * 1.4);
    ctx.lineTo(x + Math.cos(a + 2.4) * size, y + Math.sin(a + 2.4) * size);
    ctx.lineTo(x + Math.cos(a - 2.4) * size, y + Math.sin(a - 2.4) * size);
    ctx.closePath();
    ctx.fill();
    if (label) ctx.fillText(label, x - Math.cos(a) * 22, y - Math.sin(a) * 22 + 4);
  }
  ctx.textAlign = "left";
}

function drawMarkers(ctx, world, cam, vw, vh) {
  const art = world.artifact;
  const s = controlled(world);
  // Extraction, once the artifact is carried (P11: the artifact itself is never marked).
  if (s && art && art.carrier && world.extract) {
    const ex = world.extract;
    const d = Math.round(Math.hypot(ex.x - s.x, ex.y - s.y, ex.z - s.z));
    marker(ctx, cam, [ex.x, ex.y, ex.z], vw, vh, "#8affc1", `EXTRACT ${d}`);
  }
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
