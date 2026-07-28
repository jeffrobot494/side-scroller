// ---------------------------------------------------------------------------
// BEHAVIOR LAB — a two-team agent observatory (docs/BEHAVIOR-LAB.md, Slice 1).
//
// The Firing Room's observability-first cousin. Where that tool asks "what does
// this weapon do?", this one asks "why did that agent do that?" — so it drops
// BOTH teams onto a real generated (multi-elevation) level and draws the
// invisible decision process: line of sight, sense.*, and the utility
// scoreboard (every action's score, the `when` that gated it, and the winner).
//
// Everything here is the real thing: generateLevel() builds the level,
// loadMission() builds the scene, updateSpecEnemy() drives red, and
// updateCompanionSpec() drives blue. Both teams are spec agents differing only
// by `team` ("enemy" / "player"), which is what Slice 0 bought us.
//
// Time control is the other half: decisions land every 0.2–0.5s and are
// invisible at 1×, so the transport can pause, step one frame, or run until the
// selected agent's NEXT decision.
//
// Deliberately NOT here (see the doc's "accrete later"): the metrics panel, the
// scripted ghost player, record/replay + A/B, and scenario presets.
//
// createBehaviorLab(container, onBack) → { dispose() }
// ---------------------------------------------------------------------------

import { ARSENAL } from "../../game/arsenal.js";
import { enemySpecMap } from "../../game/customcontent.js";
import { MISSION_ENEMY_SPECS, missionSpecById, missionRoster, specIsFlying } from "../../game/enemyspecs.js";
import { generateLevel } from "../../game/gen/levelgen.js";
import { normalizeSpec } from "../../game/enemyspec/normalize.js";
import { loadMission, stepActor, tickReload } from "../../mission/entities.js";
import { updateCompanionSpec } from "../../mission/ai.js";
import { updateProjectiles, updateStatuses } from "../../mission/combat.js";
import { drawProjectile } from "../../mission/render.js";
import {
  instantiate as instantiateSpec, updateSpecEnemy, collidables,
  applyDamage as specDamage, killEntity as specKill,
} from "../../mission/enemyspec/runtime.js";
import { drawSpecEnemy } from "../../mission/enemyspec/render.js";
import { nearestHostile } from "../../mission/enemyspec/perception.js";
import { SCHEMA, config, setConfig, isDefault } from "../../game/config.js";
import { controlsHTML, bindControls } from "../controls.js";
import { audio } from "../../audio/engine.js";

const DT = 1 / 60;           // fixed sim step — makes step-frame and slow-mo exact
const MAX_STEPS = 8;         // sim steps per rAF frame (fast-forward ceiling)
const RAIL_INTERVAL = 0.1;   // s between inspector refreshes (DOM churn, not sim)
const FLY_ALTITUDE = 140;    // mirrors loadMission: flyers spawn off their surface

// The lever panel is the config SCHEMA's own "Agent brain" group, rendered by
// the shared schema→controls renderer — so a new lever is a schema entry.
const LEVER_GROUP = SCHEMA.filter((g) => g.title === "Agent brain");

export function createBehaviorLab(container, onBack) {
  const savedSpecs = Object.values(enemySpecMap());
  const specSource = {};
  for (const s of [...MISSION_ENEMY_SPECS, ...savedSpecs]) specSource[s.id] = s;

  const params = {
    seed: 40318, length: "medium", difficulty: "medium",
    blue: 2, weapon: ARSENAL[0].id, red: "level",
  };
  const sim = { running: false, speed: 1, t: 0, frames: 0, acc: 0 };
  const freeze = { blue: false, red: false };
  // 1:1 on the selection by default — a generated level runs thousands of px
  // wide, so "fit" shrinks agents past the point where an overlay is readable.
  const view = { mode: "follow" };
  let showAll = false;
  let selected = null; // { team: "blue"|"red", i }

  container.innerHTML = shellHTML(params, savedSpecs);

  const $ = (s) => container.querySelector(s);
  const canvas = $("#bl-canvas");
  const ctx2d = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  // Lab levers are plain config knobs, so the Settings tab shows them too.
  bindControls($("#bl-levers"), (key, val) => setConfig(key, val));

  let scene = null, level = null;
  const particles = [];

  // ---- combat context ----------------------------------------------------
  // Same contract the mission and the Firing Room use; no kill credit, no loot,
  // no respawn — a downed agent stays down until Reset (that IS the data).
  const cctx = {
    friendlyFire: config.friendlyFire,
    damageMult: 1,
    damage(t, a, o) {
      if (t.kind === "spec") { specDamage(t.root, t, a, o, scene, cctx); return; }
      t.health -= a; t.hitFlash = 0.12;
      if (t.health <= 0 && t.alive) cctx.kill(t, o);
    },
    kill(t, o) {
      if (!t.alive) return;
      if (t.kind === "spec") { specKill(t.root, t, o, scene, cctx); return; }
      t.alive = false;
      burst(t.x + t.w / 2, t.y + t.h / 2, "#7ad7ff", 16, 240);
    },
    spark(x, y, c, n, s) { burst(x, y, c, n, s); },
    burst(x, y, c, n, s) { burst(x, y, c, n, s); },
  };

  // ---- scene -------------------------------------------------------------
  function build() {
    const gen = generateLevel({
      seed: params.seed | 0,
      difficulty: params.difficulty,
      length: params.length,
      roster: missionRoster(),
    });
    level = gen.level;

    // Blue is a squad of Soldier bodies; loadMission places them at the level's
    // player spawn and instantiates the level's own enemy placements as red.
    const weapon = ARSENAL.find((w) => w.id === params.weapon) || ARSENAL[0];
    const squad = [];
    for (let i = 0; i < params.blue; i++) {
      squad.push({
        data: { id: `b${i}`, name: BLUE_NAMES[i % BLUE_NAMES.length], callsign: `B${i + 1}`, stats: { health: 6, aim: 7, speed: 6 } },
        weapon,
      });
    }
    scene = loadMission(level, squad);
    // Observation sandbox: never run dry mid-study.
    for (const s of scene.soldiers) s.magsLeft = Infinity;

    // A single-spec red team replaces the generated mix (place each root on the
    // same surface the generator picked, re-seated for its own body height).
    if (params.red !== "level") {
      const raw = specSource[params.red];
      if (raw) {
        const nspec = normalizeSpec(raw);
        scene.specRoots = level.enemies.map((e) => {
          const orig = missionSpecById[e.type];
          const surfaceY = e.y + (orig ? orig.root.body.h : nspec.root.body.h);
          const y = specIsFlying(nspec) ? Math.max(24, surfaceY - nspec.root.body.h - FLY_ALTITUDE) : surfaceY - nspec.root.body.h;
          return instantiateSpec(nspec, e.x, y);
        });
      }
    }
    scene.enemies = scene.specRoots.flatMap((r) => collidables(r));
    // What you watch should sound like what you'd play (docs/SOUND.md).
    scene.sound = (cue, opts) => audio.play(cue, opts);
    audio.setListener(level.world.width / 2);

    sim.t = 0; sim.frames = 0; sim.acc = 0;
    particles.length = 0;
    // Open on an agent that HAS a scoreboard. Most of the built-in roster is
    // deliberately scripted fodder (tracks mode), so a naive "first enemy"
    // default would show the fallback panel on a tool whose point is utility
    // scoring. Falls back to the first agent of either team.
    const util = scene.specRoots.findIndex((r) => r.brainState.def.mode === "utility");
    selected = util >= 0 ? { team: "red", i: util }
      : scene.specRoots.length ? { team: "red", i: 0 }
      : scene.soldiers.length ? { team: "blue", i: 0 } : null;
    cctx.friendlyFire = config.friendlyFire;
    $("#bl-id").textContent = `${level.id} · ${level.name} · ${level.world.width}px`;
    refreshRosters();
  }

  // ---- selection ---------------------------------------------------------
  function selEntity() {
    if (!selected || !scene) return null;
    const list = selected.team === "blue" ? scene.soldiers : scene.specRoots;
    return list[selected.i] || null;
  }
  // The spec agent behind a selection. Red roots ARE agents; a blue soldier's
  // agent is attached lazily by updateCompanionSpec, so it exists from frame 1.
  function selAgent() {
    const e = selEntity();
    if (!e) return null;
    return e.kind === "spec" ? e : e.agent || null;
  }

  // ---- simulation --------------------------------------------------------
  function step(dt) {
    sim.t += dt; sim.frames++;

    for (const s of scene.soldiers) {
      if (s.fireCooldown > 0) s.fireCooldown -= dt;
      if (s.muzzleFlash > 0) s.muzzleFlash -= dt;
      tickReload(s, dt, scene);
    }

    // Blue: every companion runs the shared brain. soldiers[0] is the leader and
    // anchors on its own spawn (no human player here); the rest anchor on it.
    const leader = scene.soldiers.find((s) => s.alive) || null;
    for (const s of scene.soldiers) {
      if (!s.alive) continue;
      if (!freeze.blue) updateCompanionSpec(s, dt, scene, s === leader ? null : leader, cctx);
      stepActor(s, dt, scene.world, scene.platforms); // frozen agents still fall
    }

    // Red: the spec runtime owns movement, so freezing means skipping it whole.
    if (!freeze.red) {
      for (const r of scene.specRoots) if (r.alive) updateSpecEnemy(r, dt, scene, cctx);
    }
    scene.enemies = scene.specRoots.flatMap((r) => (r.alive ? collidables(r) : []));

    updateProjectiles(scene, dt, cctx);
    updateStatuses(scene, dt, cctx);

    for (const p of particles) { p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
  }

  // Run until the selected agent commits its NEXT decision (a scoring pass is
  // the unit of thought; a frame is not). Capped so a tracks-mode brain or a
  // dead agent can't spin.
  function stepDecision() {
    const a = selAgent();
    const before = a && a.brainState.lastDecision ? a.brainState.lastDecision.at : -1;
    for (let i = 0; i < 240; i++) {
      step(DT);
      const cur = selAgent();
      const now = cur && cur.brainState.lastDecision ? cur.brainState.lastDecision.at : -1;
      if (cur !== a || now !== before) break;
    }
  }

  function burst(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = spd * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.3 + Math.random() * 0.3, max: 0.6, color });
    }
  }

  // ---- camera ------------------------------------------------------------
  // screen = (world - o) * s. "fit" frames the whole level (navigation is the
  // thing we're watching); "follow" tracks the selection at 1:1.
  function camera() {
    const ww = scene.world.width, wh = scene.world.height;
    if (view.mode === "fit") {
      const s = Math.min(W / ww, H / wh);
      return { s, ox: (ww - W / s) / 2, oy: (wh - H / s) / 2 };
    }
    const e = selEntity();
    const cx = e ? e.x + e.w / 2 : ww / 2, cy = e ? e.y + e.h / 2 : wh / 2;
    return {
      s: 1,
      ox: clamp(cx - W / 2, 0, Math.max(0, ww - W)),
      oy: clamp(cy - H / 2, 0, Math.max(0, wh - H)),
    };
  }

  // ---- rendering ---------------------------------------------------------
  function draw() {
    const g = ctx2d;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0c1424"); bg.addColorStop(1, "#16232a");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    if (!scene) return;

    const cam = camera();
    g.save();
    g.setTransform(cam.s, 0, 0, cam.s, -cam.ox * cam.s, -cam.oy * cam.s);

    // world bounds + platforms
    g.strokeStyle = "rgba(120,160,210,0.15)"; g.lineWidth = 1 / cam.s;
    g.strokeRect(0, 0, scene.world.width, scene.world.height);
    for (const p of scene.platforms) {
      g.fillStyle = "#22303f"; g.fillRect(p.x, p.y, p.w, p.h);
      g.fillStyle = "#6fd3ff"; g.fillRect(p.x, p.y, p.w, Math.max(1, 2 / cam.s));
    }
    if (scene.exit) {
      g.strokeStyle = "rgba(87,201,138,0.7)"; g.lineWidth = 2 / cam.s;
      g.strokeRect(scene.exit.x, scene.exit.y, scene.exit.w, scene.exit.h);
    }

    // blue bodies
    for (const s of scene.soldiers) {
      if (!s.alive) continue;
      g.fillStyle = s.hitFlash > 0 ? "#fff" : "#4c9ce8";
      g.fillRect(s.x, s.y, s.w, s.h);
      g.fillStyle = "#0b0f18";
      g.fillRect(s.x + (s.facing > 0 ? s.w - 6 : 0), s.y + s.h * 0.35, 6, 3);
      hpBar(g, s, cam, "#57c98a");
    }

    // red trees (real renderer — parts, telegraphs, spawned entities)
    for (const r of scene.specRoots) if (r.alive) drawSpecEnemy(g, r, sim.t);

    for (const p of scene.projectiles) drawProjectile(g, p);

    g.save(); g.globalCompositeOperation = "lighter";
    for (const p of particles) { g.fillStyle = alpha(p.color, Math.max(0, p.life / p.max)); g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
    g.restore();

    // ---- overlays ----
    if (showAll) {
      for (const r of scene.specRoots) if (r.alive && r !== selEntity()) drawLos(g, r, cam, 0.25);
      for (const s of scene.soldiers) if (s.alive && s.agent && s !== selEntity()) drawLos(g, s.agent, cam, 0.25);
    }
    drawOverlays(g, cam);
    g.restore();

    // HUD (screen space)
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "rgba(190,200,215,0.5)"; g.font = "10px system-ui, sans-serif";
    g.fillText(`real runtime — updateSpecEnemy + updateCompanionSpec · ${view.mode} view`, 8, 14);
    if (!sim.running) {
      g.fillStyle = "rgba(255,202,122,0.9)"; g.font = "600 11px system-ui, sans-serif";
      g.fillText("PAUSED", W - 54, 16);
    }
  }

  function hpBar(g, e, cam, color) {
    const frac = Math.max(0, e.health / e.maxHealth);
    if (frac >= 1) return;
    const h = 4 / cam.s;
    g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(e.x, e.y - h - 2 / cam.s, e.w, h);
    g.fillStyle = frac > 0.5 ? color : frac > 0.25 ? "#e0a24e" : "#e05a5a";
    g.fillRect(e.x, e.y - h - 2 / cam.s, e.w * frac, h);
  }

  function drawLos(g, agent, cam, a) {
    const t = nearestHostile(agent, scene);
    if (!t) return;
    const clear = !!(agent.sense && agent.sense.los);
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = clear ? "#7ad7ff" : "#7a848f";
    g.lineWidth = 2 / cam.s;
    if (!clear) g.setLineDash([5 / cam.s, 6 / cam.s]);
    g.beginPath();
    g.moveTo(agent.x + agent.w / 2, agent.y + agent.h / 2);
    g.lineTo(t.x + t.w / 2, t.y + t.h / 2);
    g.stroke();
    g.restore();
  }

  function drawOverlays(g, cam) {
    const ent = selEntity();
    const agent = selAgent();
    if (!ent) return;
    const px = 1 / cam.s;

    // selection halo
    g.strokeStyle = "#ffca7a"; g.lineWidth = 2 * px;
    g.strokeRect(ent.x - 4 * px, ent.y - 4 * px, ent.w + 8 * px, ent.h + 8 * px);
    if (!agent) return;

    const ax = agent.x + agent.w / 2, ay = agent.y + agent.h / 2;

    // preferred-range ring (keepDistance min/max)
    const m = agent.motion;
    if (m && m.type === "keepDistance") {
      g.save(); g.setLineDash([3 * px, 5 * px]); g.strokeStyle = "rgba(224,90,90,0.55)"; g.lineWidth = 1.5 * px;
      for (const r of [m.min, m.max]) {
        if (!r) continue;
        g.beginPath(); g.arc(ax, ay, r, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    }

    // move order
    if (agent.moveOrder) {
      g.save(); g.setLineDash([7 * px, 5 * px]); g.strokeStyle = "#ffca7a"; g.lineWidth = 2 * px;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(agent.moveOrder.x, agent.moveOrder.y); g.stroke(); g.restore();
      g.fillStyle = "#ffca7a";
      g.beginPath(); g.arc(agent.moveOrder.x, agent.moveOrder.y, 4 * px, 0, Math.PI * 2); g.fill();
    }
    // dash vector
    if (agent.dash) {
      g.strokeStyle = "#e94560"; g.lineWidth = 2 * px;
      g.beginPath(); g.moveTo(ax, ay);
      g.lineTo(ax + (agent.dash.vx || 0) * 0.2, ay + (agent.dash.vy || 0) * 0.2); g.stroke();
    }

    drawLos(g, agent, cam, 1);

    // last-seen memory
    const mem = agent.memory;
    if (mem && mem.seenOnce) {
      g.save(); g.strokeStyle = "#8f7ad7"; g.lineWidth = 2 * px;
      const lx = mem.lastSeenX, ly = mem.lastSeenY, r = 7 * px;
      g.beginPath();
      g.moveTo(lx - r, ly - r); g.lineTo(lx + r, ly + r);
      g.moveTo(lx + r, ly - r); g.lineTo(lx - r, ly + r);
      g.stroke(); g.restore();
    }

    // ground probe (the single sense.groundAhead front ray)
    if (agent.sense && agent.sense.groundAhead !== undefined) {
      const dir = agent.facing > 0 ? 1 : -1;
      g.strokeStyle = agent.sense.groundAhead ? "#4caf72" : "#e05a5a";
      g.lineWidth = 2 * px;
      g.beginPath();
      g.moveTo(agent.x + agent.w / 2 + dir * (agent.w / 2 + 8), agent.y + agent.h);
      g.lineTo(agent.x + agent.w / 2 + dir * (agent.w / 2 + 8), agent.y + agent.h + 14);
      g.stroke();
    }

    // floating tag: state + what it is committed to right now
    const bs = agent.brainState;
    const commit = bs && bs.commit ? `${bs.commit.action.id} · ${bs.commit.phase}` : "deciding…";
    g.font = `${11 * px}px ui-monospace, Menlo, monospace`;
    g.fillStyle = "rgba(10,14,19,0.85)";
    const text = `${bs ? bs.current : "?"} → ${commit}`;
    const tw = g.measureText(text).width;
    g.fillRect(ent.x - 4 * px, ent.y - 22 * px, tw + 10 * px, 15 * px);
    g.fillStyle = "#ffca7a";
    g.fillText(text, ent.x + px, ent.y - 11 * px);
  }

  // ---- inspector rail ----------------------------------------------------
  function refreshRail() {
    const ent = selEntity();
    const agent = selAgent();

    $("#bl-clock").innerHTML =
      `t <b>${sim.t.toFixed(2)}</b>s · frame <b>${sim.frames}</b>` +
      (agent && agent.brainState ? ` · next decision <b>${Math.max(0, agent.brainState.decisionTimer).toFixed(2)}</b>s` : "");

    if (!ent) { $("#bl-inspect").innerHTML = `<div class="bl-panel"><div class="bl-h">Selected agent</div><p class="wd-empty">Nothing selected.</p></div>`; return; }

    const team = ent.kind === "spec" ? "RED" : "BLUE";
    const name = ent.kind === "spec" ? (ent.kindName || ent.id) : ent.data.name;
    const specId = ent.kind === "spec" ? ent.specTop.id : (agent ? agent.specTop.id : "—");
    const intel = ent.kind === "spec" ? ent.specTop.intelligence : (agent ? agent.specTop.intelligence : null);
    const hp = `${Math.max(0, Math.round(ent.health))}/${ent.maxHealth}`;
    const tgt = agent ? nearestHostile(agent, scene) : null;
    const tgtName = tgt ? (tgt.kind === "spec" ? (tgt.root && tgt.root.kindName) || tgt.id : tgt.data.name) : "none";

    $("#bl-inspect").innerHTML = `
      <div class="bl-panel">
        <div class="bl-h">Selected agent</div>
        <div class="bl-sel-head">
          <span class="bl-sel-name">${escapeHtml(name)}</span>
          <span class="wd-badge on bl-team-${team.toLowerCase()}">${team}</span>
        </div>
        <div class="bl-agent-sub">${escapeHtml(specId)}${intel ? ` · int ${intel}` : ""} · hp ${hp} · ${ent.alive ? "alive" : "down"} · targeting ${escapeHtml(String(tgtName))}</div>
      </div>
      <div class="bl-panel">
        <div class="bl-h">sense.*</div>
        ${agent ? senseHTML(agent) : `<p class="wd-empty">Agent spins up on the first frame.</p>`}
      </div>
      <div class="bl-panel">
        <div class="bl-h">Utility scoreboard</div>
        ${agent ? scoreHTML(agent) : `<p class="wd-empty">—</p>`}
      </div>
      <div class="bl-panel">
        <div class="bl-h">Commitment</div>
        ${agent ? commitHTML(agent) : `<p class="wd-empty">—</p>`}
      </div>`;
  }

  function refreshRosters() {
    const row = (label, name, sub, sel, hpFrac, cls, key) => `
      <button class="bl-agent ${cls}${sel ? " sel" : ""}" data-sel="${key}">
        <div class="bl-agent-meta">
          <span class="bl-agent-name">${label} · ${escapeHtml(name)}</span>
          <span class="bl-agent-sub">${escapeHtml(sub)}</span>
        </div>
        <span class="bl-hp"><span style="width:${Math.round(Math.max(0, hpFrac) * 100)}%;background:${hpFrac > 0.6 ? "var(--good)" : hpFrac > 0.3 ? "var(--credits)" : "var(--bad)"}"></span></span>
      </button>`;

    $("#bl-blue").innerHTML = scene.soldiers.map((s, i) =>
      row(`B${i + 1}`, s.data.name, `${i === 0 ? "leader · " : ""}${s.weapon ? s.weapon.name : "unarmed"}${s.alive ? "" : " · down"}`,
        selected && selected.team === "blue" && selected.i === i, s.health / s.maxHealth, "blue", `blue:${i}`)
    ).join("") || `<p class="wd-empty">No blue agents.</p>`;

    // The brain mode rides along in the row: "utility" agents have a scoreboard,
    // "tracks" agents are scripted and show their track progress instead.
    $("#bl-red").innerHTML = scene.specRoots.map((r, i) =>
      row(`R${i + 1}`, r.kindName || r.id, `${r.brainState.def.mode}${r.specTop.intelligence ? ` · int ${r.specTop.intelligence}` : ""}${r.alive ? "" : " · down"}`,
        selected && selected.team === "red" && selected.i === i, r.health / r.maxHealth, "red", `red:${i}`)
    ).join("") || `<p class="wd-empty">No red agents.</p>`;
  }

  // ---- events ------------------------------------------------------------
  container.addEventListener("change", (e) => {
    const t = e.target;
    switch (t.dataset.bl) {
      case "seed": params.seed = t.value | 0; build(); break;
      case "length": params.length = t.value; build(); break;
      case "difficulty": params.difficulty = t.value; build(); break;
      case "weapon": params.weapon = t.value; build(); break;
      case "red": params.red = t.value; build(); break;
    }
  });
  container.addEventListener("input", (e) => {
    if (e.target.dataset.bl === "blue") {
      params.blue = +e.target.value;
      $("#bl-blueval").textContent = e.target.value;
      build();
    }
  });
  container.addEventListener("click", (e) => {
    const sel = e.target.closest("[data-sel]");
    if (sel) {
      const [team, i] = sel.dataset.sel.split(":");
      selected = { team, i: +i };
      refreshRosters(); refreshRail(); draw();
      return;
    }
    const el = e.target.closest("[data-bl]");
    if (!el) return;
    switch (el.dataset.bl) {
      case "back": onBack(); break;
      case "reroll":
        params.seed = Math.floor(Math.random() * 1e9);
        $("#bl-seed").value = params.seed;
        build();
        break;
      case "reset": build(); break;
      case "run": sim.running = true; syncTransport(); break;
      case "pause": sim.running = false; syncTransport(); break;
      case "stepframe": sim.running = false; step(DT); syncTransport(); break;
      case "stepdecision": sim.running = false; stepDecision(); syncTransport(); break;
      case "speed": sim.speed = +el.dataset.speed; syncTransport(); break;
      case "view": view.mode = el.dataset.view; syncTransport(); break;
      case "showall": showAll = el.classList.toggle("on"); break;
      case "freezeblue": freeze.blue = el.classList.toggle("on"); break;
      case "freezered": freeze.red = el.classList.toggle("on"); break;
    }
    refreshRail(); draw();
  });

  // Click an agent in the arena to select it — the fastest way in.
  canvas.addEventListener("click", (e) => {
    if (!scene) return;
    const r = canvas.getBoundingClientRect();
    const cam = camera();
    const wx = (e.clientX - r.left) * (W / r.width) / cam.s + cam.ox;
    const wy = (e.clientY - r.top) * (H / r.height) / cam.s + cam.oy;
    const hit = (o) => wx >= o.x - 6 && wx <= o.x + o.w + 6 && wy >= o.y - 6 && wy <= o.y + o.h + 6;
    for (let i = 0; i < scene.specRoots.length; i++) if (hit(scene.specRoots[i])) { selected = { team: "red", i }; break; }
    for (let i = 0; i < scene.soldiers.length; i++) if (hit(scene.soldiers[i])) { selected = { team: "blue", i }; break; }
    refreshRosters(); refreshRail(); draw();
  });

  function syncTransport() {
    for (const b of container.querySelectorAll("[data-bl='run'],[data-bl='pause']")) {
      b.classList.toggle("on", (b.dataset.bl === "run") === sim.running);
    }
    for (const b of container.querySelectorAll("[data-bl='speed']")) b.classList.toggle("on", +b.dataset.speed === sim.speed);
    for (const b of container.querySelectorAll("[data-bl='view']")) b.classList.toggle("on", b.dataset.view === view.mode);
  }

  // ---- loop --------------------------------------------------------------
  let alive = true, raf = null, last = perfNow(), railTimer = 0;
  function loop() {
    if (!alive) return;
    const now = perfNow();
    let real = (now - last) / 1000; last = now;
    if (real > 0.25) real = 0.25;

    if (sim.running) {
      sim.acc += real * sim.speed;
      let n = 0;
      while (sim.acc >= DT && n < MAX_STEPS) { step(DT); sim.acc -= DT; n++; }
      if (sim.acc > DT * MAX_STEPS) sim.acc = 0; // don't bank a backlog
    }
    railTimer -= real;
    if (railTimer <= 0) { railTimer = RAIL_INTERVAL; refreshRail(); refreshRosters(); }
    draw();
    raf = req(loop);
  }

  build();
  syncTransport();
  refreshRail();
  draw(); // one synchronous frame (also makes a headless mount verifiable)
  raf = req(loop);

  return {
    dispose() {
      alive = false;
      audio.stopAll();
      if (raf != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    },
  };
}

// ---- inspector fragments ---------------------------------------------------

const SENSE_ORDER = [
  "dist", "los", "timeSinceSeen", "playerAbove", "playerBelow", "playerApproaching",
  "cornered", "groundAhead", "anchorDist", "lastSeenX", "lastSeenY", "anchorX", "anchorY",
];

function senseHTML(agent) {
  const s = agent.sense || {};
  const keys = [...SENSE_ORDER.filter((k) => k in s), ...Object.keys(s).filter((k) => !SENSE_ORDER.includes(k))];
  if (!keys.length) return `<p class="wd-empty">No sensor pass yet.</p>`;
  return `<div class="bl-sense">${keys.map((k) => {
    const v = s[k];
    const cls = typeof v === "boolean" ? (v ? "t" : "f") : "";
    const val = typeof v === "number" ? (Math.abs(v) >= 1000 ? Math.round(v) : v.toFixed(2)) : String(v);
    return `<div class="bl-s"><i>${k}</i><b class="${cls}">${val}</b></div>`;
  }).join("")}</div>`;
}

function scoreHTML(agent) {
  const bs = agent.brainState;
  if (!bs) return `<p class="wd-empty">—</p>`;
  if (bs.def.mode !== "utility") {
    // A tracks brain has no scoring pass; show what it IS doing instead of an
    // empty panel — the same question, answered by the other arbitration mode.
    const st = bs.def.states[bs.current];
    const tracks = (st ? st.tracks : []).map((tr, i) => {
      const ts = bs.tracks[i] || {};
      return `<div class="bl-act"><div class="bl-act-top"><span class="bl-act-name">${escapeHtml(tr.id || `track ${i}`)}</span>
        <span class="bl-act-score">${ts.done ? "done" : `${Math.min(ts.i || 0, tr.steps.length)}/${tr.steps.length}`}</span></div>
        <div class="bl-act-gate">${ts.block ? `blocked: ${ts.block.kind}` : "running"}${tr.loop ? " · loops" : ""}</div></div>`;
    }).join("");
    return `<p class="bl-note">Tracks brain (no utility scoring) — state <code>${escapeHtml(bs.current)}</code>.</p>
      <div class="bl-score">${tracks || `<p class="wd-empty">No tracks in this state.</p>`}</div>`;
  }
  const d = bs.lastDecision;
  if (!d) return `<p class="wd-empty">No decision yet — step time forward.</p>`;
  const max = Math.max(0.001, ...d.actions.map((a) => a.score));
  const rows = d.actions.map((a) => {
    const win = a.id === d.chosen;
    const cls = win ? "win" : a.status === "scored" ? "" : a.status === "cooldown" ? "gated cool" : "gated";
    const gate = a.status === "cooldown" ? `cooldown · ${a.detail}`
      : a.status === "gated" ? `when: ${escapeHtml(a.detail)} ✗`
      : a.detail ? `when: ${escapeHtml(a.detail)} ✓` : "when: — (always eligible)";
    return `<div class="bl-act ${cls}">
      <div class="bl-act-bar" style="width:${Math.round(Math.max(0, a.score / max) * 100)}%"></div>
      <div class="bl-act-top">
        <span class="bl-act-name">${escapeHtml(a.id)}</span>
        ${win ? `<span class="bl-win-flag">chosen</span>` : ""}
        <span class="bl-act-score">${a.status === "scored" || win ? a.score.toFixed(2) : "—"}</span>
      </div>
      <div class="bl-act-gate">${gate}</div>
    </div>`;
  }).join("");
  return `<p class="bl-note">state <code>${escapeHtml(d.state)}</code> · scored at t+${d.at.toFixed(2)}s${d.chosen ? "" : " · nothing scored above 0"}</p>
    <div class="bl-score">${rows}</div>`;
}

function commitHTML(agent) {
  const bs = agent.brainState;
  const c = bs && bs.commit;
  if (!c) return `<p class="wd-empty">Not committed — free to decide.</p>`;
  const phase = (p) => `<div class="bl-phase${c.phase === p ? " on" : ""}">${p}${p === "steps" ? ` ${Math.min(c.trackState.i, c.track.steps.length)}/${c.track.steps.length}` : ""}</div>`;
  return `<div class="bl-commit-name">${escapeHtml(c.action.id)}</div>
    <div class="bl-phases">${phase("windup")}${phase("steps")}${phase("recovery")}</div>
    <p class="bl-note">${c.phase === "steps" ? "running steps" : `${Math.max(0, c.t).toFixed(2)}s left`} · telegraph ${agent.telegraph > 0 ? agent.telegraph.toFixed(2) + "s" : "none"} · no mid-commit cancel.</p>`;
}

// ---- shell -----------------------------------------------------------------

const BLUE_NAMES = ["Vasquez", "Okonkwo", "Rask", "Silva"];

function shellHTML(params, savedSpecs) {
  const weapons = ARSENAL.map((w) => `<option value="${w.id}"${w.id === params.weapon ? " selected" : ""}>${escapeHtml(w.name)}</option>`).join("");
  const builtins = MISSION_ENEMY_SPECS.map((s) => `<option value="${s.id}">${escapeHtml(s.name || s.id)}</option>`).join("");
  const saved = savedSpecs.map((s) => `<option value="${s.id}">${escapeHtml(s.name || s.id)}</option>`).join("");
  return `
    <div class="wd bl">
      <div class="wd-head">
        <button class="btn btn-ghost" data-bl="back">← Tools</button>
        <span class="wd-name" style="min-width:auto">Behavior Lab</span>
        <span class="wd-id" id="bl-id"></span>
      </div>

      <div class="fr-params">
        <label class="lg-field">Level seed
          <span class="lg-seedrow">
            <input type="number" id="bl-seed" data-bl="seed" value="${params.seed}" />
            <button class="btn btn-alt" data-bl="reroll" title="Random seed">🎲</button>
          </span>
        </label>
        <label class="lg-field">Length
          <select data-bl="length">
            <option value="short">Short</option>
            <option value="medium" selected>Medium</option>
            <option value="long">Long</option>
          </select>
        </label>
        <label class="lg-field">Difficulty
          <select data-bl="difficulty">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="extreme">Extreme</option>
          </select>
        </label>
        <label class="lg-field">Blue agents <output id="bl-blueval">${params.blue}</output>
          <input type="range" data-bl="blue" min="0" max="4" step="1" value="${params.blue}" />
        </label>
        <label class="lg-field">Blue weapon
          <select data-bl="weapon">${weapons}</select>
        </label>
        <label class="lg-field">Red team
          <select data-bl="red">
            <option value="level">From level (generated mix)</option>
            <optgroup label="All one spec — mission roster">${builtins}</optgroup>
            ${saved ? `<optgroup label="All one spec — designed">${saved}</optgroup>` : ""}
          </select>
        </label>
        <button class="btn btn-alt" data-bl="reset">Reset</button>
      </div>

      <div class="bl-grid">
        <div>
          <canvas class="lg-canvas bl-canvas" id="bl-canvas" width="960" height="420"></canvas>

          <div class="bl-transport">
            <button class="bl-t-btn" data-bl="pause">❚❚ Pause</button>
            <button class="bl-t-btn" data-bl="run">▶ Run</button>
            <button class="bl-t-btn" data-bl="stepframe">⏭ Frame</button>
            <button class="bl-t-btn" data-bl="stepdecision">⏭⏭ Decision</button>
            <span class="bl-t-sep"></span>
            <button class="bl-t-btn" data-bl="speed" data-speed="0.25">0.25×</button>
            <button class="bl-t-btn" data-bl="speed" data-speed="1">1×</button>
            <button class="bl-t-btn" data-bl="speed" data-speed="3">3×</button>
            <span class="bl-t-sep"></span>
            <button class="bl-t-btn" data-bl="view" data-view="fit">Fit</button>
            <button class="bl-t-btn" data-bl="view" data-view="follow">Follow</button>
            <span class="bl-clock" id="bl-clock"></span>
          </div>

          <div class="bl-legend">
            <span><i class="bl-key" style="border-top:2px solid #7ad7ff"></i> line of sight</span>
            <span><i class="bl-key" style="border-top:2px dashed #ffca7a"></i> move order</span>
            <span><i class="bl-key" style="border-top:2px dotted #e05a5a"></i> preferred range</span>
            <span><i class="bl-key" style="border-top:2px solid #8f7ad7"></i> last seen</span>
            <span><i class="bl-key" style="border-top:2px solid #4caf72"></i> ground probe</span>
          </div>

          <div class="bl-panel">
            <div class="bl-h">Rosters</div>
            <div class="bl-roster-head"><i class="bl-swatch" style="background:#4c9ce8"></i> Blue — team "player"
              <button type="button" role="switch" class="toggle sm" data-bl="freezeblue" title="Freeze blue"><span class="knob"></span></button>
              <span class="bl-agent-sub">freeze</span>
            </div>
            <div class="bl-roster" id="bl-blue"></div>
            <div class="bl-roster-head"><i class="bl-swatch" style="background:#e05a5a"></i> Red — team "enemy"
              <button type="button" role="switch" class="toggle sm" data-bl="freezered" title="Freeze red"><span class="knob"></span></button>
              <span class="bl-agent-sub">freeze</span>
            </div>
            <div class="bl-roster" id="bl-red"></div>
            <div class="bl-roster-head">Overlays for every agent
              <button type="button" role="switch" class="toggle sm" data-bl="showall"><span class="knob"></span></button>
            </div>
          </div>

          <div class="bl-panel">
            <div class="bl-h">Global levers <span class="bl-tag">config SCHEMA · live</span></div>
            <div id="bl-levers">${controlsHTML(LEVER_GROUP, config, isDefault)}</div>
          </div>
        </div>

        <div class="bl-rail" id="bl-inspect"></div>
      </div>
    </div>`;
}

// ---- helpers ---------------------------------------------------------------
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function perfNow() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
function req(fn) { return typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : null; }
function alpha(color, a) {
  if (typeof color === "string" && color.startsWith("#")) {
    let c = color.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`;
  }
  return color;
}
