// ---------------------------------------------------------------------------
// SQUAD DEBUG VIEW (design/squad-debug.md, tech/squad-debug.md D2) — what each
// AI squadmate perceives and decided, drawn over the play space.
//
//   Threats   a line from every hostile that can hit the squadmate where it
//             stands — theyCanHit against its standing box, recomputed here
//             at most once per sense interval of mission time and held
//             between. Never through the shared exposure cache: a display
//             fill would move the frame the cache refills on, and so the
//             mission.
//   Spots     its last scored pick (the D0 record on `agent.spotPass`): every
//             probe coloured best → worst, the chosen one ringed, staying put
//             drawn as a square, each labelled with its terms.
//   Dodges    its D0 dodge verdicts newer than a second, as tags over its head.
//
// DOM-free: a 2D context and plain data in, nothing out. It reads the records
// and writes nothing the simulation reads.
// ---------------------------------------------------------------------------

import { theyCanHit, hostilesFor, SENSE_INTERVAL } from "./enemyspec/perception.js";
import { STAND_H } from "./entities.js";

// How long a dodge tag stays up. The design fixes it at about a second.
const TAG_LIFE = 1;

const TAGS = {
  duck: ["DUCK", "#6fe39b"],
  jump: ["JUMP", "#6fe39b"],
  cant: ["CAN'T", "#a0a9ae"],
  missed: ["MISSED", "#f2a24e"],
  late: ["LATE", "#ff5a5a"],
};

// Per-mission view state: the held threat set.
export function createDebugView() {
  return { threatT: -Infinity, threats: new Map() };
}

// `mates` are the squadmates to annotate; `time` is mission time; `clock` is
// scene.survivalClock, which the verdict log is stamped on; `layers` is the
// mission's debug flags.
export function drawSquadDebug(ctx, view, { scene, mates, time, clock, layers, z = 1 }) {
  if (layers.threats) {
    if (time - view.threatT >= SENSE_INTERVAL || time < view.threatT) {
      view.threatT = time;
      view.threats = new Map();
      for (const s of mates) view.threats.set(s, threatsTo(scene, s));
    }
    drawThreats(ctx, view, mates, z);
  }
  if (layers.spots) for (const s of mates) drawSpots(ctx, s, z);
  if (layers.dodges) for (const s of mates) drawTags(ctx, s, clock, z);
}

// Who can hit `s` where it stands, standing (a kneel is the reflex's business,
// and what the line answers is "is this spot dangerous").
function threatsTo(scene, s) {
  const box = { x: s.x, y: s.y + s.h - STAND_H, w: s.w, h: STAND_H };
  const out = [];
  for (const h of hostilesFor(s.agent, scene)) {
    if (h && h.alive && theyCanHit(scene, h, box)) out.push(h);
  }
  return out;
}

function drawThreats(ctx, view, mates, z) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,90,90,0.75)";
  ctx.lineWidth = 1.5 / z;
  ctx.setLineDash([6 / z, 4 / z]);
  for (const s of mates) {
    const tx = s.x + s.w / 2;
    const ty = s.y + s.h / 2;
    for (const h of view.threats.get(s) || []) {
      if (!h.alive) continue;
      ctx.beginPath();
      ctx.moveTo(h.x + h.w / 2, h.y + h.h / 2);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function fmt(v) {
  if (v === null || v === undefined) return "–";
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
}

// Best (lowest total) green, worst red, by rank rather than by value, so one
// outlier does not wash every other probe into one colour.
function rankColour(rank, n) {
  const t = n > 1 ? rank / (n - 1) : 0;
  return `hsl(${Math.round(120 * (1 - t))}, 80%, 55%)`;
}

function drawSpots(ctx, s, z) {
  const pass = s.agent && s.agent.spotPass;
  if (!pass || !pass.probes.length) return;
  const order = pass.probes.map((p, i) => i).sort((a, b) => pass.probes[a].total - pass.probes[b].total);
  const rank = new Array(order.length);
  order.forEach((i, r) => (rank[i] = r));
  const chosen = pass.chosen;
  ctx.save();
  ctx.font = `${8 / z}px monospace`;
  ctx.textAlign = "center";
  ctx.lineWidth = 1.5 / z;
  pass.probes.forEach((p, i) => {
    const stay = i === 0;
    const picked = chosen ? p.x === chosen.x && p.y === chosen.y && !stay : stay;
    const col = rankColour(rank[i], pass.probes.length);
    ctx.globalAlpha = p.cut ? 0.35 : 1;
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    const r = 4 / z;
    if (stay) ctx.fillRect(p.x - r, p.y - r, 2 * r, 2 * r);
    else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (picked) {
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9 / z, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = col;
    const head = `${stay ? "stay " : ""}${fmt(p.total)}`;
    ctx.fillText(head, p.x, p.y - 8 / z);
    ctx.fillText(`t${fmt(p.travel)} d${fmt(p.exposure)} s${fmt(p.shot)} c${fmt(p.crowd)}`, p.x, p.y + 12 / z);
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = s.color || "#fff";
  ctx.fillText(`${pass.kind} pick`, s.x + s.w / 2, s.y + s.h + 12 / z);
  ctx.restore();
}

// Newest at the bottom, stacked upward above the routes label.
function drawTags(ctx, s, clock, z) {
  const log = s.duck && s.duck.log;
  if (!log || !log.length) return;
  const live = log.filter((e) => clock - e.t <= TAG_LIFE && clock >= e.t);
  if (!live.length) return;
  ctx.save();
  ctx.font = `bold ${10 / z}px monospace`;
  ctx.textAlign = "center";
  let y = s.y - 36 / z;
  for (let i = live.length - 1; i >= 0; i--) {
    const [text, col] = TAGS[live[i].verdict] || [live[i].verdict, "#fff"];
    ctx.fillStyle = col;
    ctx.fillText(text, s.x + s.w / 2, y);
    y -= 11 / z;
  }
  ctx.restore();
}

// Slow motion's label (D3), in the flat layer, top centre.
export function drawSpeedLabel(ctx, speed, W) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#f2c14e";
  ctx.fillText(`SLOW MOTION ${speed === 0.5 ? "½" : speed === 0.25 ? "¼" : `×${speed}`}`, W / 2, 22);
  ctx.restore();
}

// The tag a verdict entry prints as — the death card (D4) names it too.
export function tagText(entry) {
  return entry ? (TAGS[entry.verdict] || [entry.verdict])[0] : null;
}
