// ---------------------------------------------------------------------------
// THE CLIENT. It draws what the server said and nothing else.
//
// That is the whole architectural claim under test: there is no local
// simulation, no prediction, no reconciliation. The local player's rectangle
// moves when a snapshot says it moved, which means every keypress costs a full
// round trip before anything happens on screen. If that feels acceptable at
// realistic latencies, the architecture is viable for this game; if it does
// not, the repo's lockstep plan keeps its reason to exist.
//
// Input sampling is decoupled from rendering (INPUT_HZ, not rAF), because a
// 144Hz monitor sending 144 packets a second would be measuring the client's
// refresh rate rather than the network.
// ---------------------------------------------------------------------------

import { createNet } from "./net.js";
import { INPUT_HZ } from "./protocol.mjs";

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);

const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
const net = createNet(url);

// --- knobs, persisted so a session survives a reload ------------------------

const KNOBS = [
  ["lag", "k-lag", "o-lag", (v) => `${v}ms`],
  ["jitter", "k-jit", "o-jit", (v) => `${v}ms`],
  ["loss", "k-loss", "o-loss", (v) => `${v}%`],
];

for (const [key, input, out, fmt] of KNOBS) {
  const el = $(input);
  const saved = localStorage.getItem(`netproto.${key}`);
  if (saved !== null) el.value = saved;
  const apply = () => {
    const v = Number(el.value);
    net[key] = v;
    $(out).textContent = fmt(v);
    localStorage.setItem(`netproto.${key}`, String(v));
  };
  el.addEventListener("input", apply);
  apply();
}

const snapEl = $("k-snap");
const savedSnap = localStorage.getItem("netproto.snapshotHz");
if (savedSnap !== null) snapEl.value = savedSnap;
snapEl.addEventListener("input", () => {
  const v = Number(snapEl.value);
  $("o-snap").textContent = String(v);
  localStorage.setItem("netproto.snapshotHz", String(v));
  net.send({ t: "cfg", snapshotHz: v });
});
$("o-snap").textContent = snapEl.value;

// --- input ------------------------------------------------------------------

const keys = new Set();
const aim = { x: 1, y: 0 };
let firing = 0;

addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  aim.x = e.clientX - r.left;
  aim.y = e.clientY - r.top;
});
canvas.addEventListener("mousedown", () => (firing = 1));
addEventListener("mouseup", () => (firing = 0));
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

let seq = 1;
function sampleInput() {
  if (!net.connected) return;
  net.sendInput({
    seq: seq++,
    l: keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0,
    r: keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0,
    jump: keys.has("Space") || keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0,
    fire: firing,
    ax: Math.round(aim.x),
    ay: Math.round(aim.y),
  });
}
setInterval(sampleInput, 1000 / INPUT_HZ);
setInterval(() => net.ping(), 250);

net.onOpen = () => net.send({ t: "hello", name: `p${Math.floor(Math.random() * 900 + 100)}` });

// --- the last thing the server said -----------------------------------------

let snap = null;
let world = null;

// Short-lived visual effects, driven entirely by server events. They are the
// one thing on screen the server did not position, and they are cosmetic:
// a spark in the wrong place is a smudge, not a desync.
const fx = [];

net.onMessage = (m) => {
  if (m.t === "snap") {
    // Jitter reorders. A snapshot older than the one on screen is discarded
    // rather than rendered — this is the one ordering rule a no-prediction
    // client needs.
    if (!snap || m.tick >= snap.tick) {
      snap = m;
      for (const ev of m.events || []) {
        if (ev.e === "shot") fx.push({ x: ev.x, y: ev.y, t: 0.08, c: "#fff2cc", r: 5 });
        else if (ev.e === "spark") fx.push({ x: ev.x, y: ev.y, t: 0.12, c: "#8a95a3", r: 4 });
        else if (ev.e === "hit") fx.push({ x: ev.x, y: ev.y, t: 0.25, c: "#eb5757", r: 10 });
      }
    }
  } else if (m.t === "welcome") {
    world = m.world;
    $("me").textContent = `#${m.id}`;
    // Push our stored snapshot rate up, so a reload restores the lab.
    net.send({ t: "cfg", snapshotHz: Number(snapEl.value) });
  }
};

// --- readouts ---------------------------------------------------------------

let lastStat = performance.now();
let lastUp = 0;
let lastDown = 0;
let sps = 0;
let lastSnapCount = 0;

setInterval(() => {
  const now = performance.now();
  const dt = (now - lastStat) / 1000;
  lastStat = now;

  const rtt = net.stats(net.rtt);
  const lat = net.stats(net.inputLatency);
  const gap = net.stats(net.snapGap);
  sps = (net.snapCount - lastSnapCount) / dt;
  lastSnapCount = net.snapCount;

  $("status").textContent = net.connected ? "connected" : "offline";
  $("status").className = `status ${net.connected ? "up" : "down"}`;
  $("rtt").textContent = rtt.len ? `${rtt.avg.toFixed(1)} ms` : "—";
  $("rttmm").textContent = rtt.len ? `${rtt.min.toFixed(0)} / ${rtt.max.toFixed(0)} ms` : "—";
  $("lat").textContent = lat.len ? `${lat.avg.toFixed(1)} ms` : "—";
  $("latmm").textContent = lat.len ? `${lat.min.toFixed(0)} / ${lat.max.toFixed(0)} ms` : "—";
  $("sps").textContent = `${sps.toFixed(1)}`;
  $("gap").textContent = gap.len ? `${gap.avg.toFixed(1)} ms` : "—";
  $("gapmax").textContent = gap.len ? `${gap.max.toFixed(0)} ms` : "—";
  $("snapsize").textContent = `${net.lastSnapBytes} B`;
  $("down").textContent = `${(((net.downBytes - lastDown) / dt) / 1024).toFixed(1)} KB/s`;
  $("up").textContent = `${(((net.upBytes - lastUp) / dt) / 1024).toFixed(1)} KB/s`;
  $("drop").textContent = String(net.dropped);
  lastUp = net.upBytes;
  lastDown = net.downBytes;
}, 500);

// --- render -----------------------------------------------------------------

// EVERYTHING drawn below comes out of the last snapshot. There is no local
// integration, not even for the player holding the keyboard. That is the point.

let lastFrame = performance.now();

function drawArena() {
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = "#0d1015";
  ctx.fillRect(0, 0, w, h);

  if (!world) {
    ctx.fillStyle = "#8a95a3";
    ctx.font = "14px ui-monospace, monospace";
    ctx.fillText("connecting…", 24, 32);
    return;
  }

  ctx.fillStyle = "#232a34";
  for (const pl of world.platforms) ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
  ctx.strokeStyle = "#2f3945";
  for (const pl of world.platforms) ctx.strokeRect(pl.x + 0.5, pl.y + 0.5, pl.w - 1, pl.h - 1);

  if (!snap) return;

  for (const b of snap.bullets) {
    ctx.fillStyle = "#ffe1a8";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  const COLORS = ["#ffb454", "#6fcf97", "#56ccf2", "#eb5757", "#bb6bd9", "#f2c94c"];
  for (const p of snap.players) {
    const mine = p.i === net.id;
    const col = COLORS[(p.i - 1) % COLORS.length];
    const cx = p.x + world.pw / 2;
    const cy = p.y + world.ph / 2;

    if (p.k) {
      // Dead: a faint outline where the body was, so a kill reads instantly.
      ctx.strokeStyle = "#3a424e";
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(p.x, p.y, world.pw, world.ph);
      ctx.setLineDash([]);
      continue;
    }

    // Aim line, from the server's copy of where that player is pointing —
    // including other players', which is what makes an incoming shot readable.
    const dx = p.ax - cx;
    const dy = p.ay - cy;
    const len = Math.hypot(dx, dy) || 1;
    ctx.strokeStyle = mine ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.13)";
    ctx.beginPath();
    ctx.moveTo(cx + (dx / len) * 16, cy + (dy / len) * 16);
    ctx.lineTo(cx + (dx / len) * 44, cy + (dy / len) * 44);
    ctx.stroke();

    ctx.fillStyle = col;
    ctx.fillRect(p.x, p.y, world.pw, world.ph);
    if (mine) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 1, p.y - 1, world.pw + 2, world.ph + 2);
      ctx.lineWidth = 1;
    }

    // Health bar above the head.
    ctx.fillStyle = "#000a";
    ctx.fillRect(p.x - 3, p.y - 10, world.pw + 6, 4);
    ctx.fillStyle = p.h > 40 ? "#6fcf97" : "#eb5757";
    ctx.fillRect(p.x - 3, p.y - 10, (world.pw + 6) * (p.h / 100), 4);

    ctx.fillStyle = "#8a95a3";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(p.n || `p${p.i}`, p.x - 3, p.y - 14);
  }

  const now = performance.now();
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.t -= dt;
    if (f.t <= 0) {
      fx.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = Math.min(1, f.t * 6);
    ctx.fillStyle = f.c;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Crosshair, drawn locally. The one thing on screen that does NOT wait for
  // the server, because it is the mouse itself rather than anything in the
  // world — and the gap between it and the aim line is a direct picture of the
  // round trip.
  ctx.strokeStyle = "#ffb454";
  ctx.beginPath();
  ctx.moveTo(aim.x - 7, aim.y);
  ctx.lineTo(aim.x + 7, aim.y);
  ctx.moveTo(aim.x, aim.y - 7);
  ctx.lineTo(aim.x, aim.y + 7);
  ctx.stroke();
}

// A latency sparkline along the bottom edge. Small on purpose: it is a running
// instrument, not the subject, once there is a game to look at.
function drawLatencyStrip() {
  const w = canvas.width;
  const h = canvas.height;
  const top = h - 74;
  const scale = 400;
  const r = net.inputLatency;

  ctx.fillStyle = "rgba(13,16,21,.82)";
  ctx.fillRect(0, top, w, 74);
  ctx.strokeStyle = "#232a34";
  ctx.beginPath();
  ctx.moveTo(0, top + 0.5);
  ctx.lineTo(w, top + 0.5);
  ctx.stroke();

  ctx.fillStyle = "#6b7684";
  ctx.font = "10px ui-monospace, monospace";
  for (const ms of [100, 200, 300]) {
    const y = h - 6 - (ms / scale) * 62;
    ctx.strokeStyle = "#1c222b";
    ctx.beginPath();
    ctx.moveTo(34, y);
    ctx.lineTo(w - 6, y);
    ctx.stroke();
    ctx.fillText(`${ms}`, 6, y + 3);
  }

  if (r.len > 1) {
    const cols = Math.min(r.len, w - 44);
    const stepX = (w - 44) / cols;
    ctx.strokeStyle = "#ffb454";
    ctx.beginPath();
    for (let i = 0; i < cols; i++) {
      const idx = (r.at - cols + i + r.n * 2) % r.n;
      const v = Math.min(r.buf[idx], scale);
      const x = 34 + i * stepX;
      const y = h - 6 - (v / scale) * 62;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  const lat = net.stats(net.inputLatency);
  ctx.fillStyle = "#8a95a3";
  ctx.fillText(
    `input → pixels  ${lat.len ? lat.avg.toFixed(0) + "ms avg" : "—"}   ` +
      `snapshots ${net.lastSnapBytes}B @ ${$("o-snap").textContent}Hz   ` +
      `lag ${net.lag}ms one-way + ${net.jitter}ms jitter + ${net.loss}% loss`,
    34,
    top + 14,
  );
}

function frame() {
  drawArena();
  drawLatencyStrip();
  drawScoreboard();
  requestAnimationFrame(frame);
}

let scoredTick = -1;
function drawScoreboard() {
  const el = $("scores");
  if (!snap || snap.tick === scoredTick) return;
  scoredTick = snap.tick;
  const rows = [...snap.players].sort((a, b) => b.s - a.s || a.i - b.i);
  el.innerHTML = rows
    .map((p) => {
      const me = p.i === net.id ? " style=\"color:#fff\"" : "";
      return `<div class="row"${me}><span>${p.n || "p" + p.i}${p.i === net.id ? " (you)" : ""}</span><span>${p.s} / ${p.d}</span></div>`;
    })
    .join("");
}

requestAnimationFrame(frame);
