// EnemySpec intelligence layer: perception facts, short-term memory, utility
// action selection, commitment (windup/recovery), cooldown gating.
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { TEMPLATE_BY_ID } from "../src/game/enemyspec/templates.js";
import { instantiate, updateSpecEnemy, applyDamage } from "../src/mission/enemyspec/runtime.js";
import { updateSense } from "../src/mission/enemyspec/perception.js";

const STEP = 1 / 60;

function makeScene(px = 900, py = 454) {
  return {
    world: { width: 1400, height: 540, gravity: 2000 },
    platforms: [{ x: 0, y: 500, w: 1400, h: 40 }],
    soldiers: [{ kind: "soldier", x: px, y: py, w: 30, h: 46, vx: 0, vy: 0, onGround: true, alive: true, health: 1e9, maxHealth: 1e9 }],
    enemies: [],
    projectiles: [],
  };
}

function makeCtx(rootRef) {
  const log = { playerDamage: 0 };
  const ctx = {
    friendlyFire: false,
    damageMult: 1,
    damage: (t, a, o) => {
      if (t.kind === "spec") applyDamage(rootRef(), t, a, o, null, ctx);
      else log.playerDamage += a;
    },
    kill: () => {},
  };
  return { ctx, log };
}

function sim(root, scene, ctx, seconds) {
  for (let i = 0, n = Math.round(seconds / STEP); i < n; i++) updateSpecEnemy(root, STEP, scene, ctx);
}

export default async function run(t) {
  // ---- perception facts ---------------------------------------------------
  {
    const scene = makeScene(900, 454);
    const root = instantiate(normalizeSpec({ id: "s", root: { health: { max: 10 }, visual: { size: [30, 40] } } }), 300, 460);
    updateSense(root, scene, 1);
    t.ok("sense: clear line of sight", root.sense.los === true);
    t.ok("sense: distance measured", root.sense.dist > 500 && root.sense.dist < 700);
    t.ok("sense: player neither above nor below", !root.sense.playerAbove && !root.sense.playerBelow);
    t.eq("sense: memory records last seen", Math.round(root.sense.lastSeenX), 915);
    t.eq("sense: timeSinceSeen resets on LOS", root.sense.timeSinceSeen, 0);

    // wall between them → no LOS, memory decays
    scene.platforms.push({ x: 600, y: 300, w: 40, h: 200 });
    root.memory.senseTimer = 0;
    updateSense(root, scene, 1);
    t.ok("sense: platform blocks LOS", root.sense.los === false);
    root.memory.senseTimer = 0;
    updateSense(root, scene, 1.5);
    t.ok("sense: timeSinceSeen grows without LOS", root.sense.timeSinceSeen >= 1.5);
    t.eq("sense: last-seen position remembered", Math.round(root.sense.lastSeenX), 915);
  }

  {
    // player above on a perch
    const scene = makeScene(400, 260);
    scene.platforms.push({ x: 360, y: 306, w: 120, h: 20 });
    scene.soldiers[0].onGround = true;
    const root = instantiate(normalizeSpec({ id: "s", root: { health: { max: 10 }, visual: { size: [30, 40] } } }), 380, 460);
    updateSense(root, scene, 1);
    t.ok("sense: playerAbove detected", root.sense.playerAbove === true);

    // approaching: player running toward the enemy
    const scene2 = makeScene(700, 454);
    scene2.soldiers[0].vx = -300;
    const root2 = instantiate(normalizeSpec({ id: "s", root: { health: { max: 10 }, visual: { size: [30, 40] } } }), 300, 460);
    updateSense(root2, scene2, 1);
    t.ok("sense: playerApproaching detected", root2.sense.playerApproaching === true);

    // cornered at the left wall with the player closing from the right
    const scene3 = makeScene(300, 454);
    const root3 = instantiate(normalizeSpec({ id: "s", root: { health: { max: 10 }, visual: { size: [30, 40] } } }), 20, 460);
    updateSense(root3, scene3, 1);
    t.ok("sense: cornered at the wall", root3.sense.cornered === true);
  }

  // ---- utility brain: the duelist ----------------------------------------
  {
    const scene = makeScene(700, 454);
    const root = instantiate(normalizeSpec(TEMPLATE_BY_ID["tpl_duelist"]), 300, 456);
    const { ctx } = makeCtx(() => root);

    sim(root, scene, ctx, 3);
    t.ok("duelist: snipes at range (fired projectiles)", scene.projectiles.length > 0);
    t.ok("duelist: snipe went on cooldown", (root.brainState.cooldowns.snipe || 0) > 0);
    t.ok("duelist: keeps its preferred distance", root.x + root.w < scene.soldiers[0].x - 120);
  }

  {
    // deterministic pick: strip actions down to two, dominant score wins
    const spec = normalizeSpec(TEMPLATE_BY_ID["tpl_duelist"]);
    const st = spec.brain.states.duel;
    st.actions = [
      { id: "low", score: -1, windup: 0, steps: [{ wait: 0.2 }], recovery: 0, cooldown: 0 }, // never viable
      { id: "high", score: 50, windup: 0.4, steps: [{ wait: 0.2 }], recovery: 0.3, cooldown: 30 }, // one-shot
    ];
    const scene = makeScene(700, 454);
    const root = instantiate(spec, 300, 456);
    root.rng = () => 0.5; // silence the noise term
    const { ctx } = makeCtx(() => root);

    sim(root, scene, ctx, 0.35); // one decision tick
    t.ok("utility: dominant score selected", root.brainState.commit && root.brainState.commit.action.id === "high");
    t.eq("utility: windup phase first", root.brainState.commit.phase, "windup");
    t.ok("utility: windup telegraphs", root.telegraph > 0);

    // commitment: still the same action mid-windup even though decisions pass
    sim(root, scene, ctx, 0.2);
    t.ok("utility: commitment holds through windup", root.brainState.commit && root.brainState.commit.action.id === "high");
    sim(root, scene, ctx, 0.3);
    t.ok("utility: steps phase runs after windup", root.brainState.commit && root.brainState.commit.phase !== "windup");
    sim(root, scene, ctx, 0.8);
    t.ok("utility: commitment completes", root.brainState.commit === null);
  }

  {
    // cooldown gating: a huge-score action with a long cooldown fires once,
    // then the fallback runs
    const spec = normalizeSpec(TEMPLATE_BY_ID["tpl_duelist"]);
    spec.brain.states.duel.actions = [
      { id: "nuke", score: 100, windup: 0, steps: [{ signal: "nuked" }, { wait: 0.1 }], recovery: 0, cooldown: 30 },
      { id: "idle", score: 1, windup: 0, steps: [{ wait: 0.2 }], recovery: 0, cooldown: 0 },
    ];
    const scene = makeScene(700, 454);
    const root = instantiate(spec, 300, 456);
    root.rng = () => 0.5;
    const { ctx } = makeCtx(() => root);
    let nukes = 0;
    const origPush = root.pendingSignals.push.bind(root.pendingSignals);
    root.pendingSignals.push = (s) => { if (s === "nuked") nukes++; return origPush(s); };

    sim(root, scene, ctx, 4);
    t.eq("utility: cooldown allows exactly one use", nukes, 1);
  }

  // ---- sky duelist: the intelligent flyer template ------------------------
  {
    const scene = makeScene(700, 454);
    const root = instantiate(normalizeSpec(TEMPLATE_BY_ID["tpl_sky_duelist"]), 260, 240);
    const { ctx } = makeCtx(() => root);

    let maxX = root.x;
    let minDist = Infinity;
    for (let i = 0; i < Math.round(6 / STEP); i++) {
      updateSpecEnemy(root, STEP, scene, ctx);
      maxX = Math.max(maxX, root.x);
      minDist = Math.min(minDist, Math.abs(root.x + root.w / 2 - 715));
    }

    t.ok("sky duelist: fires in flight", scene.projectiles.length > 0);
    t.ok("sky duelist: stays airborne", root.y + root.h < 480);
    t.ok("sky duelist: closes in on the player (strafe runs)", minDist < 300);
    t.ok("sky duelist: uses multiple actions", Object.keys(root.brainState.cooldowns).length >= 2);
  }

  // ---- utility + ambient tracks coexist ----------------------------------
  {
    const spec = normalizeSpec({
      id: "hybrid",
      root: {
        health: { max: 30 },
        visual: { size: [30, 30] },
        emitters: { g: { projectile: { speed: 300, damage: 3 } } },
      },
      brain: {
        mode: "utility",
        start: "s",
        states: {
          s: {
            decisionInterval: 0.25,
            actions: [{ id: "sit", score: 1, steps: [{ wait: 0.3 }] }],
            tracks: [{ id: "ambient", loop: true, steps: [{ fire: { emitter: "g", pattern: "aimed" } }, { wait: 0.5 }] }],
          },
        },
      },
    });
    const scene = makeScene(700, 454);
    const root = instantiate(spec, 300, 460);
    const { ctx } = makeCtx(() => root);
    sim(root, scene, ctx, 1.2);
    t.ok("utility: ambient track fires alongside decisions", scene.projectiles.length >= 2);
  }
}
