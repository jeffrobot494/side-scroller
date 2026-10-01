// ---------------------------------------------------------------------------
// SPACE FPS — the flat layer over the 3D view (tech/space-fps.md): crosshair,
// readouts, markers and bars, on a transparent 2D canvas. Reads the world and
// the events; writes nothing back.
// ---------------------------------------------------------------------------

import { controlled, bootsState } from "./sim.js";
import { eyeOf, project, pxPer } from "./camera.js";
import { ENEMY_TYPES } from "../space/sim.js";

export function createHud() {
  return { hurtT: 0, hitT: 0, banner: null };
}

// Events the HUD reacts to, before the page drains them.
export function hudEvents(hud, world) {
  for (const ev of world.events) {
    if ((ev.type === "hurt" || ev.type === "crash") && ev.ctrl) hud.hurtT = 0.35;
    if (ev.type === "hit" && ev.own) { hud.hitT = 0.16; hud.kill = ev.kill; }
    if (ev.type === "wave") hud.banner = { text: `WAVE ${ev.n} INBOUND`, t: 2.5 };
  }
}

export function drawHud(ctx, hud, world, vw, vh, fov, dt) {
  ctx.clearRect(0, 0, vw, vh);
  const cam = eyeOf(world, fov, vw / vh);
  const s = controlled(world);
  drawBars(ctx, world, cam, vw, vh);
  if (s) drawCrosshair(ctx, hud, vw, vh, dt);
  drawHurt(ctx, hud, vw, vh, dt);
  drawSquad(ctx, world, vw);
  drawBanner(ctx, hud, vw, vh, dt);
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
  // The keys, top left, out of the way.
  ctx.font = "11px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillStyle = "rgba(200,220,255,0.45)";
  const keys = ["mouse: look, fire", "W/S/A/D, Space/C: jets", "Q/E: roll · wheel: zoom", "Shift: boots · Space: jump", "R: reload · Tab: swap", "Enter: new field, after the end"];
  keys.forEach((k, i) => ctx.fillText(k, 14, 20 + i * 14));
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
  // Hostiles off the view (F11): within 1600px, unalerted ones dimmed, mines
  // within 500, wardens in gold from 2600.
  if (s) {
    for (const e of world.enemies) {
      if (!e.alive || e.kind !== "enemy") continue;
      const d = Math.hypot(e.x - s.x, e.y - s.y, e.z - s.z);
      const T = ENEMY_TYPES[e.type];
      const far = e.type === "mine" ? 500 : T.elite ? 2600 : 1600;
      if (d > far) continue;
      const pr = project(cam, [e.x, e.y, e.z], vw, vh);
      if (pr.depth > 0 && pr.x > 0 && pr.x < vw && pr.y > 0 && pr.y < vh) continue;
      const a = e.alert ? 0.9 : 0.35;
      const col = T.elite ? `rgba(255,200,90,${a})` : `rgba(255,96,80,${a})`;
      marker(ctx, cam, [e.x, e.y, e.z], vw, vh, col, null, T.elite ? 10 : 7);
    }
  }
  // Extraction, once the artifact is carried (P11: the artifact itself is never marked).
  if (s && art && art.carrier && world.extract) {
    const ex = world.extract;
    const d = Math.round(Math.hypot(ex.x - s.x, ex.y - s.y, ex.z - s.z));
    marker(ctx, cam, [ex.x, ex.y, ex.z], vw, vh, "#8affc1", `EXTRACT ${d}`);
  }
}

// Bars over what is in view: every squad soldier, and any hostile within
// 1600px that is alerted or hurt. A shooter winding up gets a ring that
// closes on it as the shot comes (the 2D telegraph tell).
function drawBars(ctx, world, cam, vw, vh) {
  const s = controlled(world);
  const list = [];
  for (const o of world.soldiers) if (o.alive && o !== s) list.push(o);
  for (const e of world.enemies) {
    if (!e.alive || (e.kind !== "enemy" && e.kind !== "dummy")) continue;
    if (s && Math.hypot(e.x - s.x, e.y - s.y, e.z - s.z) > 1600) continue;
    list.push(e);
  }
  for (const o of list) {
    const pr = project(cam, [o.x, o.y, o.z], vw, vh);
    if (pr.depth < 20 || pr.x < -40 || pr.x > vw + 40 || pr.y < -40 || pr.y > vh + 40) continue;
    const k = pxPer(cam, pr.depth, vh);
    const rr = Math.max(4, o.r * k);
    const friend = o.kind === "soldier";
    const T = o.type && ENEMY_TYPES[o.type];
    if (o.tele > 0 && T && T.tele) {
      const f = Math.max(0, o.tele / T.tele);
      ctx.strokeStyle = `rgba(255,80,60,${0.5 + 0.5 * (1 - f)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, rr + 6 + 28 * f, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!friend && !o.alert && o.hp >= o.maxHp) continue;
    const w = Math.max(22, Math.min(60, rr * 2.2));
    const y = pr.y - rr - 10;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(pr.x - w / 2 - 1, y - 1, w + 2, 6);
    const hk = Math.max(0, o.hp / o.maxHp);
    ctx.fillStyle = friend ? "#7cf29a" : T && T.elite ? "#ffcf6a" : "#ff6a5a";
    ctx.fillRect(pr.x - w / 2, y, w * hk, 4);
    if (friend) {
      ctx.font = "11px ui-monospace, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(200,240,210,0.8)";
      ctx.fillText(o.name.split(" ")[0], pr.x, y - 4);
      ctx.textAlign = "left";
    }
  }
}

// The squad, top right: HP, rounds, ▶ for the one you fly, ◆ for the carrier, KIA.
function drawSquad(ctx, world, vw) {
  const x = vw - 250;
  let y = 56;
  ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(x - 10, y - 16, 248, world.soldiers.length * 22 + 10);
  const art = world.artifact;
  world.soldiers.forEach((o, i) => {
    const mark = i === world.ctrl && o.alive ? "▶" : " ";
    const carry = art && art.carrier === o ? " ◆" : "";
    ctx.fillStyle = o.alive ? (i === world.ctrl ? "#ffffff" : "#cfe3ff") : "rgba(200,200,200,0.4)";
    ctx.fillText(`${mark} ${o.name.split(" ")[0]}${carry}`, x, y);
    if (o.alive) {
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(x + 104, y - 8, 70, 6);
      const k = Math.max(0, o.hp / o.maxHp);
      ctx.fillStyle = k > 0.5 ? "#7cf29a" : k > 0.25 ? "#ffd36a" : "#ff6a5a";
      ctx.fillRect(x + 104, y - 8, 70 * k, 6);
      ctx.fillStyle = "#cfe3ff";
      ctx.fillText(o.reloading > 0 ? "rld" : `${o.ammo}`, x + 184, y);
    } else {
      ctx.fillStyle = "#ff6a5a";
      ctx.fillText("KIA", x + 104, y);
    }
    y += 22;
  });
}

function drawBanner(ctx, hud, vw, vh, dt) {
  if (!hud.banner) return;
  hud.banner.t -= dt;
  if (hud.banner.t <= 0) { hud.banner = null; return; }
  const a = Math.min(1, hud.banner.t);
  ctx.textAlign = "center";
  ctx.font = "bold 22px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillStyle = `rgba(255,120,90,${a})`;
  ctx.fillText(hud.banner.text, vw / 2, vh * 0.28);
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
