// ---------------------------------------------------------------------------
// BEHAVIOR LAB — one agent, one goal, one question: can it get there?
// (design/behavior-lab.md; tech/behavior-lab.md Slice B1.)
//
// A generated level at 1:1, one soldier-bodied agent standing on a random node,
// and a click to tell it where to go. It routes there with the SHIPPED router and
// stops. No combat, no second agent, no scoreboard — this replaces a two-team
// combat observatory, and the smallness is the point.
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
// TWO EXPORTS, on purpose:
//   createLabModel(seed) → the level, the agent, and the verbs (step/goal/pan).
//                          No DOM. This is what a headless test can drive.
//   createBehaviorLab(container, onBack) → { dispose() }   the editor tool.
// The test harness's DOM is a thin stub — querySelector hands back a fresh mock
// and listeners are no-ops — so a tool that keeps its state in a closure can only
// ever be tested for "mounts without throwing". Splitting the model out is what
// makes the behaviour above assertable at all.
// ---------------------------------------------------------------------------

import { generateLevel } from "../../game/gen/levelgen.js";
import { loadMission, Soldier, stepActor } from "../../mission/entities.js";
import { instantiate, updateSpecEnemy } from "../../mission/enemyspec/runtime.js";
import { normalizeSpec } from "../../game/enemyspec/normalize.js";
import { profileFor, graphFor, invalidateNavGraphs } from "../../mission/navigation.js";
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

  const lab = { seed, scene, soldier, agent, goal: null, panX: 0 };

  // "Starting on a random node" is the design's wording, and a node is the
  // router's own idea of a standable place — so the agent always begins
  // somewhere it can legitimately route from.
  const graph = graphFor(scene, profileFor(agent, scene, config.runSpeed));
  const n = graph.nodes.length ? graph.nodes[Math.min(graph.nodes.length - 1, (rng() * graph.nodes.length) | 0)] : null;
  soldier.x = n ? n.a + rng() * (n.b - n.a) : scene.world.width / 2;
  soldier.y = n ? n.y - soldier.h : 0;
  soldier.onGround = !!n;

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

// Wheel up pans LEFT, wheel down pans RIGHT (design/behavior-lab.md). There is
// no vertical pan: the world is 540 tall and so is the view.
export function labPan(lab, dy) {
  lab.panX = Math.max(0, Math.min(lab.scene.world.width - VIEW_W, lab.panX + dy));
}

// runSpeed and jumpSpeed are IN the body profile the graph is keyed by, so a
// change to either means every cached graph — and every node id the agent is
// holding — describes a body that no longer exists.
export function labRetune(lab) {
  invalidateNavGraphs(lab.scene);
  lab.agent.nav = null;
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
        <span class="bl-seed" data-bl="seed"></span>
        <span class="bl-hint">click = set goal · wheel = pan</span>
      </div>
      <div class="bl-view"><canvas class="bl-canvas" width="${VIEW_W}" height="${VIEW_H}"></canvas></div>
      <div class="bl-tuning"><div id="bl-tune" class="cfg"></div></div>
    </div>`;

  const canvas = container.querySelector(".bl-canvas");
  const ctx = canvas.getContext("2d");
  const seedEl = container.querySelector('[data-bl="seed"]');
  const tuneEl = container.querySelector("#bl-tune");

  function build() {
    lab = createLabModel();
    seedEl.textContent = `seed ${lab.seed} · ${lab.scene.world.width}px wide`;
  }

  function draw() {
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

  function onClick(e) {
    const p = toWorld(e);
    labGoal(lab, p.x, p.y);
    draw();
  }

  function onWheel(e) {
    e.preventDefault();
    labPan(lab, e.deltaY);
    draw();
  }

  function onBar(e) {
    const b = e.target.closest("[data-bl]");
    if (!b) return;
    if (b.dataset.bl === "back") onBack();
    if (b.dataset.bl === "new") { build(); draw(); }
  }

  canvas.addEventListener("click", onClick);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("click", onBar);

  // The design's two knobs, rendered from the config SCHEMA rather than as
  // bespoke sliders — so they are the SHIPPED game's knobs, and moving one here
  // moves it everywhere until it is reset.
  tuneEl.innerHTML = controlsHTML(SCHEMA.filter((g) => g.title === TUNING_GROUP), config, isDefault);
  bindControls(tuneEl, (key, val) => {
    setConfig(key, val);
    if (lab) labRetune(lab);
  });

  build();
  draw(); // one synchronous draw at mount, per the editor tool contract
  last = typeof performance !== "undefined" ? performance.now() : 0;
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("wheel", onWheel);
      container.removeEventListener("click", onBar);
    },
  };
}
