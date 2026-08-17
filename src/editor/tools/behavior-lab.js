// ---------------------------------------------------------------------------
// BEHAVIOR LAB — one agent, one goal, one question: can it get there?
// (design/behavior-lab.md; tech/behavior-lab.md Slices B1–B3.)
//
// A generated level at 1:1, one soldier-bodied agent standing on a random node,
// and a click to tell it where to go. It routes there with the SHIPPED router and
// stops. Overlays show the graph it is routing on and the route it holds; any
// platform can be dragged, which rebuilds the graph under it. No combat, no
// second agent, no scoreboard — this replaces a two-team combat observatory, and
// the smallness is the point.
//
// The Lab is a WINDOW. It owns the camera, the click and the drawing; it owns no
// navigation. Every decision on screen is made by src/mission/navigation.js and
// src/mission/locomotion.js exactly as it is in a mission, so a route that looks
// wrong here IS wrong there.
//
// The one loop the Lab supplies itself is the Soldier-stepping and
// position-mirroring one: `SOLDIER` drives `Soldier.applyMovement` and integrates
// nothing, so somebody must step the body and mirror it back onto the agent, or
// the router keeps routing from the spawn coordinates while the body walks away.
// `src/mission/ai.js` has that loop, welded to the companion spec and a leader
// this tool does not have.
//
// A MODEL AND A SHELL, on purpose. `createLabModel` plus the `lab*` verbs —
// step, goal, pan, invalidate, graph, path, draw, and the drag trio — are
// DOM-free; `createBehaviorLab(container, onBack) → { dispose() }` is the editor
// tool that owns one model and translates input into those verbs. The test
// harness's DOM is a thin stub — querySelector hands back a fresh mock and
// listeners are no-ops — so a tool that keeps its state in a closure can only
// ever be tested for "mounts without throwing". The split is what makes any of
// the behaviour above assertable.
// ---------------------------------------------------------------------------

import { generateLevel } from "../../game/gen/levelgen.js";
import { loadMission, Soldier, stepActor } from "../../mission/entities.js";
import { instantiate, updateSpecEnemy } from "../../mission/enemyspec/runtime.js";
import { normalizeSpec } from "../../game/enemyspec/normalize.js";
import { profileFor, graphFor, invalidateNavGraphs } from "../../mission/navigation.js";
import { drawNavGraph, drawNavPath, NAV_EDGE_COLOR } from "../../mission/render.js";
import { WEAPONS } from "../../game/content.js";
import { SCHEMA, config, setConfig, isDefault } from "../../game/config.js";
import { controlsHTML, bindControls } from "../controls.js";

// 1:1, and 540 tall because the world is. The design's argument for panning
// instead of fitting is that a level scaled to a tenth makes the agent
// unreadable — so the ON-SCREEN size is what has to hold, and the CSS must not
// stretch this to its column the way `.lg-canvas` does.
export const VIEW_W = 960;
export const VIEW_H = 540;

// The design's Tuning table names jumpSpeed and runSpeed. The schema renderer
// works a whole group at a time and both live here, alongside four knobs that
// move the same jump envelope — see Approximations in the spec.
const TUNING_GROUP = "Movement / feel";

const MAX_STEP = 1 / 30; // a backgrounded tab must not teleport the agent

// A soldier body on the shared agent brain. `body.gravity` is authored
// explicitly because `moveTo` is in FLYING_MOTIONS and normalize would otherwise
// default this to a flyer; `locomotor: "soldier"` is what makes it route on
// config.jumpSpeed / config.runSpeed rather than on body.jump.
const AGENT_SPEC = normalizeSpec({
  v: 1, id: "lab_agent", name: "Agent", threat: 1, role: "support", tier: 1, intelligence: 1,
  root: {
    id: "root",
    visual: { shape: "box", size: [30, 46], color: "#7ad7ff" },
    body: { locomotor: "soldier", gravity: 1 },
    health: { max: 1 }, // formality — nothing in the Lab damages it
    motion: { type: "static" },
  },
});

const AGENT_DATA = {
  id: "lab", name: "Agent", callsign: "", traits: [], cost: 0, status: "roster",
  stats: { aim: 5, health: 5, speed: 5, nerve: 5 }, record: { missions: 0, kills: 0 }, wounds: 0,
};

// Nothing here can be damaged, but updateSpecEnemy takes a ctx.
const CTX = { friendlyFire: false, damageMult: 1, damage() {}, kill() {}, spark() {}, burst() {} };

// Edges are DIRECTED and the colours say why: a drop is one-way, because
// platforms are solid and you cannot climb back up the way you fell. Drawing
// them all one colour would hide the single most surprising thing about the
// graph.
// Legend colours come from the shared renderer so the swatches match the lines.
const EDGE_COLOR = NAV_EDGE_COLOR;

// ---- the model --------------------------------------------------------------

export function createLabModel(seed = (Math.random() * 1e9) | 0, rng = Math.random) {
  const { level } = generateLevel({ seed });
  const scene = loadMission(level, []);

  // `generateLevel` always places enemies and `loadMission` instantiates them
  // unconditionally, so a scene built the normal way arrives full of hostiles.
  // Combat is not omitted here, it is removed.
  scene.specRoots = [];
  scene.enemies = [];
  scene.projectiles = [];
  scene.loot = [];

  const soldier = new Soldier(AGENT_DATA, WEAPONS.carbine, 0, 0);
  // Team "player" so perception hunts scene.specRoots, which is empty. On the
  // enemy team it would find our own Soldier in scene.soldiers and target itself.
  const agent = instantiate(AGENT_SPEC, 0, 0, "player");
  agent.soldier = soldier;
  scene.soldiers = [soldier];

  // Overlays are off by default (design/behavior-lab.md): the first thing the
  // Lab has to show is an agent moving, and 23 nodes with 81 edges over it is
  // not that.
  const lab = { seed, scene, soldier, agent, goal: null, panX: 0, show: { graph: false, path: false } };

  // "Starting on a random node" is the design's wording, and a node is the
  // router's own idea of a standable place — so the agent always begins
  // somewhere it can legitimately route from.
  const graph = graphFor(scene, profileFor(agent, scene, config.runSpeed));
  const n = graph.nodes.length ? graph.nodes[Math.min(graph.nodes.length - 1, (rng() * graph.nodes.length) | 0)] : null;
  soldier.x = n ? n.a + rng() * (n.b - n.a) : scene.world.width / 2;
  soldier.y = n ? n.y - soldier.h : 0;
  soldier.onGround = !!n;

  // Open looking AT the agent. The camera never follows after this — that is the
  // design — but starting at the level's left edge is not the same rule, and it
  // meant opening the Lab on an empty stretch of level: the agent lands uniformly
  // across a 4,800–8,200px level and the view is 960, so it was in shot 12% of
  // the time. Panning right to look for it is what made a uniform spawn read as
  // "it always spawns on the right".
  lab.panX = clampPan(lab, soldier.x + soldier.w / 2 - VIEW_W / 2);

  return lab;
}

export function labStep(lab, dt) {
  const { soldier, agent, scene } = lab;
  // Body → agent, before anything reads a position. This is the mirror
  // updateCompanionSpec does; without it the router routes from the spawn.
  agent.x = soldier.x;
  agent.y = soldier.y;
  agent.w = soldier.w;
  agent.h = soldier.h;
  agent.vx = soldier.vx;
  agent.vy = soldier.vy;
  agent.onGround = soldier.onGround;
  agent.facing = soldier.facing;

  // A click is a destination and nothing more: `moveTo` already resolves a
  // literal [x, y] and hands it to the router, which is the whole plumbing.
  agent.motion = lab.goal
    ? { type: "moveTo", target: [lab.goal.x, lab.goal.y], speed: config.runSpeed }
    : { type: "static" };

  updateSpecEnemy(agent, dt, scene, CTX); // perception → brain → locomotor
  stepActor(soldier, dt, scene.world, scene.platforms); // the body's own physics
}

export function labGoal(lab, x, y) {
  lab.goal = { x, y };
  lab.agent.nav = null; // a new goal starts a new route, not an amended one
}

// The view never runs past either end of the level.
function clampPan(lab, x) {
  return Math.max(0, Math.min(lab.scene.world.width - VIEW_W, x));
}

// Wheel up pans LEFT, wheel down pans RIGHT (design/behavior-lab.md). There is
// no vertical pan: the world is 540 tall and so is the view.
export function labPan(lab, dy) {
  lab.panX = clampPan(lab, lab.panX + dy);
}

// Everything derived from the terrain or the body is now void. Two callers, one
// meaning: retuning changes the body (runSpeed and jumpSpeed are IN the profile
// the graph is keyed by), dragging changes the terrain. Either way the cached
// graphs and every node id the agent is holding describe a world that no longer
// exists — including what it learned about which jumps it cannot make, which was
// a fact about geometry that has just moved.
export function labInvalidate(lab) {
  invalidateNavGraphs(lab.scene);
  lab.agent.nav = null;
}

// ---- dragging (B3) ----------------------------------------------------------

// The platform under a world point, topmost first so the pick matches what is
// drawn on top. `scene.platforms` are CLONES made by loadMission, which is what
// makes dragging safe: it edits this scene in memory and can never reach a seed,
// a golden fixture, or the generator's own audit.
export function labPlatformAt(lab, x, y) {
  const ps = lab.scene.platforms;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return p;
  }
  return null;
}

// Grab a platform. The offset is kept so it does not jump its corner to the
// cursor. Returns the platform, or null when the point is empty air — which is
// how the caller knows the gesture is a goal-click instead.
export function labDragStart(lab, x, y) {
  const p = labPlatformAt(lab, x, y);
  lab.drag = p ? { plat: p, ox: x - p.x, oy: y - p.y } : null;
  return p;
}

export function labDragMove(lab, x, y) {
  if (!lab.drag) return false;
  const { plat, ox, oy } = lab.drag;
  plat.x = Math.max(0, Math.min(lab.scene.world.width - plat.w, x - ox));
  plat.y = Math.max(0, Math.min(lab.scene.world.height - plat.h, y - oy));
  // Rebuild live rather than on release: watching the graph change under the
  // platform as it moves is the point of being able to move it. A graph is tens
  // of nodes, so the cost is nothing.
  //
  // The agent is deliberately NOT moved with the platform. It can be left
  // standing on air, or inside the thing it was standing on — the router hands
  // back to straight-line steering when it cannot find a node under a body, so
  // that reads as a visible mistake rather than a freeze, and re-dropping the
  // platform under it fixes it.
  labInvalidate(lab);
  return true;
}

export function labDragEnd(lab) {
  lab.drag = null;
}

// THE AGENT'S graph, not "the level's" — graphs are per body profile, and this
// resolves the same profile and the same cache entry `routeRequest` does. With
// one agent there is no second graph to be wrong about, but calling it the
// level's would be the bug: change the body and this is a different picture of
// the same terrain.
export function labGraph(lab) {
  return graphFor(lab.scene, profileFor(lab.agent, lab.scene, config.runSpeed));
}

// The route the agent is ACTUALLY HOLDING — read off its own state, never
// recomputed. A tool that repathed to draw would show a fresher route than the
// one being walked, which is exactly the thing you would come here to diagnose:
// the follower repaths on config.navRepathInterval, and a stale path must be
// visible rather than hidden. [] when there is no route.
export function labPath(lab) {
  const nav = lab.agent.nav;
  return nav && nav.path ? nav.path : [];
}

// ---- drawing ----------------------------------------------------------------
// A function of (ctx, lab), not a closure: the overlays are off by default, so a
// throw inside one would never run at mount and would ship unseen. This way a
// headless test can turn both on and execute every path.

// Both overlays draw through the shared renderer (src/mission/render.js), so the
// Lab and the mission's in-game debug overlay cannot drift apart. Spans arrive in
// body-LEFT-EDGE space — what the router works in — and `halfW` shifts them into
// centre space, which is where the box on screen is.
function drawGraph(ctx, lab) {
  drawNavGraph(ctx, labGraph(lab), {
    halfW: lab.soldier.w / 2,
    viewL: lab.panX,
    viewR: lab.panX + VIEW_W,
  });
}

function drawPath(ctx, lab) {
  drawNavPath(ctx, labGraph(lab), labPath(lab), { halfW: lab.soldier.w / 2 });
}

export function labDraw(ctx, lab) {
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (!lab) return;
  const { scene, soldier, goal, panX } = lab;

  ctx.save();
  ctx.translate(-panX, 0);

  for (const p of scene.platforms) {
    if (p.x + p.w < panX || p.x > panX + VIEW_W) continue; // off-screen
    ctx.fillStyle = "#27303c";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = "#3a4757";
    ctx.fillRect(p.x, p.y, p.w, 3); // the standable surface, which is the point
  }

  if (lab.show.graph) drawGraph(ctx, lab);
  if (lab.show.path) drawPath(ctx, lab);

  if (goal) {
    ctx.strokeStyle = "#ffd479";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, 9, 0, Math.PI * 2);
    ctx.moveTo(goal.x - 15, goal.y);
    ctx.lineTo(goal.x + 15, goal.y);
    ctx.moveTo(goal.x, goal.y - 15);
    ctx.lineTo(goal.x, goal.y + 15);
    ctx.stroke();
  }

  ctx.fillStyle = "#7ad7ff";
  ctx.fillRect(soldier.x, soldier.y, soldier.w, soldier.h);
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(soldier.facing > 0 ? soldier.x + soldier.w - 9 : soldier.x + 4, soldier.y + 9, 5, 5);

  ctx.restore();

  // The level is far wider than the view and never scaled to fit, so "where am
  // I looking" and "what does it think it is doing" are not otherwise legible.
  const s = lab.agent.sense || {};
  const state = s.navBlocked ? "gave up" : !goal ? "idle" : s.routeReachable === false ? "getting as close as it can" : "routing";
  ctx.fillStyle = "#8894a6";
  ctx.font = "12px ui-monospace, monospace";
  ctx.fillText(`${state} · ${s.routeSteps || 0} steps left`, 8, 20);
  ctx.fillText(`x ${Math.round(panX)}–${Math.round(panX + VIEW_W)} of ${scene.world.width}`, 8, VIEW_H - 10);
}


// ---- the editor tool --------------------------------------------------------

export function createBehaviorLab(container, onBack) {
  let lab = null;
  let raf = 0;
  let last = 0;

  container.innerHTML = `
    <div class="wd bl">
      <div class="wd-head">
        <button class="btn btn-ghost" data-bl="back">← Tools</button>
        <h1>Behavior Lab</h1>
        <p class="wd-sub">One agent on a generated level. Click anywhere to send it there and watch it route. Wheel to pan.</p>
      </div>
      <div class="bl-bar">
        <button class="btn" data-bl="new">New level</button>
        <button class="btn bl-tog" data-bl="graph" aria-pressed="false">Graph</button>
        <button class="btn bl-tog" data-bl="path" aria-pressed="false">Path</button>
        <span class="bl-seed" data-bl="seed"></span>
        <span class="bl-hint">click = set goal · drag a platform = move it · wheel = pan</span>
      </div>
      <div class="bl-legend" data-bl="legend" hidden>
        <span><i style="background:${EDGE_COLOR.walk}"></i>walk</span>
        <span><i style="background:${EDGE_COLOR.hop}"></i>hop</span>
        <span><i style="background:${EDGE_COLOR.jump}"></i>jump (up)</span>
        <span><i style="background:${EDGE_COLOR.drop}"></i>drop (one-way)</span>
        <span class="bl-hint">arrows point the way the move goes · bars are where this body can stand</span>
      </div>
      <div class="bl-view"><canvas class="bl-canvas" width="${VIEW_W}" height="${VIEW_H}"></canvas></div>
      <div class="bl-tuning"><div id="bl-tune" class="cfg"></div></div>
    </div>`;

  const canvas = container.querySelector(".bl-canvas");
  const ctx = canvas.getContext("2d");
  const seedEl = container.querySelector('[data-bl="seed"]');
  const tuneEl = container.querySelector("#bl-tune");
  const legendEl = container.querySelector('[data-bl="legend"]');

  function build() {
    lab = createLabModel();
    seedEl.textContent = `seed ${lab.seed} · ${lab.scene.world.width}px wide`;
  }

  const draw = () => labDraw(ctx, lab);

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(MAX_STEP, (now - last) / 1000 || 0);
    last = now;
    if (dt > 0) labStep(lab, dt);
    draw();
  }

  // The canvas is 1:1 by design, but a browser can still lay it out at another
  // size; without this correction a click lands somewhere the agent was not sent.
  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width) + lab.panX,
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  }

  // Press, move, release — because B3 gave the canvas two gestures. Pressing on
  // a platform and moving DRAGS it; anything else SETS THE GOAL. A press that
  // never moves is a click, so a platform can still be clicked as a destination.
  //
  // DRAG_SLOP is a pointer epsilon, not a tunable: it is how far a hand shakes
  // while clicking, which has nothing to do with how the game plays and does not
  // belong in the config SCHEMA. Same reasoning as nav.js's body-fit constants.
  const DRAG_SLOP = 4;
  let press = null;

  function onPointerDown(e) {
    const p = toWorld(e);
    press = { sx: e.clientX, sy: e.clientY, world: p, moved: false };
    if (labDragStart(lab, p.x, p.y) && canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not a real pointer event */ }
    }
  }

  function onPointerMove(e) {
    if (!press) {
      const at = toWorld(e); // hover feedback: a platform is grabbable, air is not
      if (canvas.style) canvas.style.cursor = labPlatformAt(lab, at.x, at.y) ? "grab" : "crosshair";
      return;
    }
    if (!press.moved && Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > DRAG_SLOP) press.moved = true;
    if (!press.moved) return;
    const p = toWorld(e);
    if (labDragMove(lab, p.x, p.y)) draw();
  }

  function onPointerUp() {
    if (press && !press.moved) {
      labGoal(lab, press.world.x, press.world.y); // a press that did not move is a click
      draw();
    }
    labDragEnd(lab);
    press = null;
  }

  function onWheel(e) {
    e.preventDefault();
    labPan(lab, e.deltaY);
    draw();
  }

  function onBar(e) {
    const b = e.target.closest("[data-bl]");
    if (!b) return;
    const id = b.dataset.bl;
    if (id === "back") return onBack();
    if (id === "new") { build(); draw(); return; }
    if (id === "graph" || id === "path") {
      lab.show[id] = !lab.show[id];
      b.setAttribute("aria-pressed", String(lab.show[id]));
      b.classList.toggle("on", lab.show[id]);
      legendEl.hidden = !lab.show.graph;
      draw();
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("click", onBar);

  // The design's two knobs, rendered from the config SCHEMA rather than as
  // bespoke sliders — so they are the SHIPPED game's knobs, and moving one here
  // moves it everywhere until it is reset.
  tuneEl.innerHTML = controlsHTML(SCHEMA.filter((g) => g.title === TUNING_GROUP), config, isDefault);
  bindControls(tuneEl, (key, val) => {
    setConfig(key, val);
    if (lab) labInvalidate(lab);
  });

  build();
  draw(); // one synchronous draw at mount, per the editor tool contract
  last = typeof performance !== "undefined" ? performance.now() : 0;
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      container.removeEventListener("click", onBar);
    },
  };
}
