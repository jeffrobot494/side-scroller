// Intent-level guards for the locomotor refactor Slices L2 + L3
// (docs/LOCOMOTOR-REFACTOR.md): the brain issues body-agnostic intents and the
// locomotor decides how the body moves. Complements the L1 golden (which pins
// enemy trajectories); these assert the SEAM properties the golden can't.
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { validateSpec } from "../src/game/enemyspec/validate.js";
import { instantiate, updateSpecEnemy } from "../src/mission/enemyspec/runtime.js";
import { updateCompanionSpec } from "../src/mission/ai.js";
import { DEFAULT_COMPANION_SPEC } from "../src/game/companionspecs.js";
import { Soldier, STAND_H, stepActor } from "../src/mission/entities.js";

const STEP = 1 / 60;
const rifle = { id: "rifle", name: "R", fireRate: 7, projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 1 }, effects: [] };

function rosterSoldier(id) {
  return { id, name: id, callsign: "", stats: { aim: 6, health: 5, speed: 5, nerve: 5 }, traits: [], cost: 0, status: "roster", record: { missions: 1, kills: 0 }, wounds: 0 };
}

function scene(extra = {}) {
  return {
    world: { width: 1600, height: 540, gravity: 2000 },
    platforms: [{ x: 0, y: 500, w: 1600, h: 40 }],
    soldiers: [], enemies: [], projectiles: [], specRoots: [],
    sound: null,
    ...extra,
  };
}
const noopCtx = { friendlyFire: false, damageMult: 1, damage() {}, kill() {}, spark() {}, burst() {} };

// a stationary spec enemy usable as a companion's target (nearestHostile pool)
function dummyEnemy(x, y) {
  const r = instantiate(normalizeSpec({ id: "dummy", root: { health: { max: 50 }, visual: { size: [30, 40] }, motion: { type: "static" } } }), x, y);
  r.rng = () => 0.5;
  return r;
}

// a spec whose brain dashes at the player on a loop (the SAME brain for both bodies)
function dasher(gravity) {
  return normalizeSpec({
    id: `dash_${gravity}`,
    root: { health: { max: 20 }, visual: { size: [24, 24] }, body: { gravity }, motion: { type: "static" } },
    brain: { start: "s", states: { s: { tracks: [{ id: "t", loop: true, steps: [{ dash: { target: "player", speed: 400, duration: 0.6 } }, { wait: 0.5 }] }] } } },
  });
}

export default async function run(t) {
  // ---- L2: a dash is body-agnostic; the LOCOMOTOR decides the vertical --------
  {
    // legged body dashing at a target ABOVE must NOT gain the dash's lift (its vy
    // stays gravity-owned); a flyer given the identical intent DOES rise.
    const sc = () => scene({ soldiers: [{ kind: "soldier", x: 350, y: 100, w: 30, h: 46, vx: 0, vy: 0, alive: true }] });

    const legScene = sc();
    const leg = instantiate(dasher(1), 300, 300); // airborne so gravity is visible
    leg.rng = () => 0.5;
    for (let i = 0; i < 8; i++) updateSpecEnemy(leg, STEP, legScene, noopCtx);

    const flyScene = sc();
    const fly = instantiate(dasher(0), 300, 300);
    fly.rng = () => 0.5;
    for (let i = 0; i < 8; i++) updateSpecEnemy(fly, STEP, flyScene, noopCtx);

    t.ok("dash: legged body is not lifted by an upward dash (gravity owns vy)", leg.vy > 0);
    t.ok("dash: flying body IS lifted by the same dash intent", fly.vy < -100);
    t.ok("dash: both take the horizontal component", leg.vx > 0 && fly.vx > 0);
  }

  // ---- L3 prerequisite: doFire honors root.team ------------------------------
  {
    const shooterSpec = normalizeSpec({
      id: "ally_shooter",
      root: { health: { max: 20 }, visual: { size: [24, 24] }, motion: { type: "static" }, emitters: { g: { projectile: { speed: 500, damage: 5, life: 1 } } } },
      brain: { start: "s", states: { s: { tracks: [{ id: "t", loop: true, steps: [{ fire: { emitter: "g" } }, { wait: 0.5 }] }] } } },
    });
    const pScene = scene();
    const ally = instantiate(shooterSpec, 300, 454, "player");
    ally.rng = () => 0.5;
    for (let i = 0; i < 20; i++) updateSpecEnemy(ally, STEP, pScene, noopCtx);
    t.ok("team: a player-team spec fires player-team projectiles", pScene.projectiles.length > 0 && pScene.projectiles.every((p) => p.team === "player"));

    const eScene = scene();
    const foe = instantiate(shooterSpec, 300, 454); // default team
    foe.rng = () => 0.5;
    for (let i = 0; i < 20; i++) updateSpecEnemy(foe, STEP, eScene, noopCtx);
    t.ok("team: the default team still fires enemy-team projectiles", eScene.projectiles.length > 0 && eScene.projectiles.every((p) => p.team === "enemy"));
  }

  // ---- L3: the default companion spec is valid -------------------------------
  {
    const res = validateSpec(DEFAULT_COMPANION_SPEC);
    t.ok(`companion: default spec validates (${res.errors.join("; ") || "ok"})`, res.ok);
  }

  // ---- L3: anchor-sense measures the leader ----------------------------------
  {
    const leader = new Soldier(rosterSoldier("L"), rifle, 900, 500 - STAND_H);
    const comp = new Soldier(rosterSoldier("C"), rifle, 300, 500 - STAND_H);
    const sc = scene({ soldiers: [leader, comp] });
    updateCompanionSpec(comp, STEP, sc, leader, noopCtx);
    const lc = { x: leader.x + leader.w / 2, y: leader.y + leader.h / 2 };
    const cc = { x: comp.x + comp.w / 2, y: comp.y + comp.h / 2 };
    const want = Math.hypot(lc.x - cc.x, lc.y - cc.y);
    t.ok(`companion: sense.anchorDist tracks the leader (got ${Math.round(comp.agent.sense.anchorDist)}, want ~${Math.round(want)})`, Math.abs(comp.agent.sense.anchorDist - want) < 30);
  }

  // ---- L3: a companion on the spec brain escorts the leader -------------------
  {
    const leader = new Soldier(rosterSoldier("L"), rifle, 1000, 500 - STAND_H);
    const comp = new Soldier(rosterSoldier("C"), rifle, 300, 500 - STAND_H);
    const sc = scene({ soldiers: [leader, comp] });
    const x0 = comp.x;
    for (let i = 0; i < 180; i++) {
      updateCompanionSpec(comp, STEP, sc, leader, noopCtx);
      stepActor(comp, STEP, sc.world, sc.platforms);
    }
    t.ok(`companion: escorts toward the leader (x ${Math.round(x0)} → ${Math.round(comp.x)})`, comp.x > x0 + 300);
    t.ok("companion: closes to a loose formation gap", (leader.x - comp.x) < 160);
  }

  // ---- L3: a companion on the spec brain engages a nearby enemy ---------------
  {
    const leader = new Soldier(rosterSoldier("L"), rifle, 250, 500 - STAND_H);
    const comp = new Soldier(rosterSoldier("C"), rifle, 300, 500 - STAND_H);
    const foe = dummyEnemy(650, 500 - 40); // level, ~350px away
    const sc = scene({ soldiers: [leader, comp], specRoots: [foe] });
    let fired = 0;
    for (let i = 0; i < 240; i++) {
      if (comp.fireCooldown > 0) comp.fireCooldown -= STEP; // the mission ticks this centrally
      const before = sc.projectiles.length;
      updateCompanionSpec(comp, STEP, sc, leader, noopCtx);
      stepActor(comp, STEP, sc.world, sc.platforms);
      if (sc.projectiles.length > before) fired++;
    }
    t.ok("companion: enters combat and fires on a nearby enemy", fired > 3);
    t.ok("companion: fires player-team rounds", sc.projectiles.length > 0 && sc.projectiles.every((p) => p.team === "player"));
    t.ok("companion: holds a standoff (doesn't overrun the enemy)", comp.x + comp.w / 2 < foe.x);
    t.eq("companion: brain reached the combat state", comp.agent.brainState.current, "combat");
  }
}
