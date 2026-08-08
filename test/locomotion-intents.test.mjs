// Intent-level guards for the locomotor refactor Slices L2 + L3
// (docs/LOCOMOTOR-REFACTOR.md): the brain issues body-agnostic intents and the
// locomotor decides how the body moves. Complements the L1 golden (which pins
// enemy trajectories); these assert the SEAM properties the golden can't.
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { validateSpec } from "../src/game/enemyspec/validate.js";
import { instantiate, updateSpecEnemy } from "../src/mission/enemyspec/runtime.js";
import { updateCompanionSpec } from "../src/mission/ai.js";
import { DEFAULT_COMPANION_SPEC } from "../src/game/companionspecs.js";
import { Soldier, STAND_H, stepActor, canJump } from "../src/mission/entities.js";
import { locomotorFor } from "../src/mission/locomotion.js";
import { config } from "../src/game/config.js";

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

  // ---- N2: one jump per body, and a window to spend it in --------------------
  // locomotion.golden.json pins whole trajectories, so it catches the impulse
  // CHANGING. It cannot say where the impulse comes from, and it exercises
  // neither `body.jump` nor coyote time nor the roster's only scored jump
  // (`cowardly_duelist.backHop` — nothing sims it). Those live here.

  // A legged body with no brain; `jump` is invoked directly on the locomotor.
  // Planted on creation — instantiate() leaves onGround false until something
  // steps it, and an unplanted body correctly refuses to jump.
  const legged = (body = {}) => {
    const r = instantiate(normalizeSpec({ id: "hopper", root: { health: { max: 10 }, visual: { size: [30, 46] }, body, motion: { type: "static" } } }), 100, 500 - 46);
    r.onGround = true;
    return r;
  };

  {
    // the two impulses that disagreed before N2 are now one number, and the
    // scored `jump` action gets exactly what the traversal hop gets
    const a = legged();
    locomotorFor(a).jump(a);
    t.eq(`jump: the default impulse is config.enemyJump (${config.enemyJump})`, a.vy, -config.enemyJump);

    const b = legged({ jump: 900 });
    locomotorFor(b).jump(b);
    t.eq("jump: body.jump overrides the config default", b.vy, -900);

    // read at jump time, not baked in by normalize — so the editor knob is live
    const before = config.enemyJump;
    config.enemyJump = 400;
    const c = legged();
    locomotorFor(c).jump(c);
    config.enemyJump = before;
    t.eq("jump: the default is read live, not frozen into the spec", c.vy, -400);
  }
  {
    // an airborne body cannot jump, with or without a window
    const a = legged();
    a.onGround = false;
    a.coyote = 0;
    locomotorFor(a).jump(a);
    t.eq("jump: an airborne body outside the window cannot jump", a.vy, 0);
  }
  {
    // coyote time: the window opens on the ground and shuts on its own
    const sc = scene();
    const a = legged();
    a.vx = 0;
    stepActor(a, STEP, sc.world, sc.platforms);
    t.ok("coyote: standing on ground holds the window fully open", a.onGround && a.coyote === config.coyoteTime);

    // walk it off the edge: no ground, but still jumpable for coyoteTime
    const air = scene({ platforms: [] });
    stepActor(a, STEP, air.world, air.platforms);
    t.ok("coyote: one frame off the ledge — not grounded, still jumpable",
      !a.onGround && a.coyote > 0 && canJump(a));
    t.ok("coyote: the window drains by dt", Math.abs(a.coyote - (config.coyoteTime - STEP)) < 1e-9);

    // let it run out
    for (let i = 0; i < 60; i++) stepActor(a, STEP, air.world, air.platforms);
    t.ok("coyote: the window shuts, and stays shut", a.coyote === 0 && !canJump(a));
  }
  {
    // the reason consumeJump exists: spending the jump must SHUT the window, or
    // the grace frames are a free second jump
    const air = scene({ platforms: [] });
    const a = legged();
    a.onGround = true;
    a.coyote = config.coyoteTime;
    locomotorFor(a).jump(a);
    const launched = a.vy;
    t.ok("coyote: jumping leaves the ground", launched < 0 && !a.onGround);
    stepActor(a, STEP, air.world, air.platforms);
    locomotorFor(a).jump(a); // an immediate second attempt, inside the old window
    t.ok("coyote: a spent jump cannot be spent again (no double jump)", a.vy > launched);
  }
  {
    // a Soldier is moved by the same integrator, so it gets the same window —
    // and the same no-double-jump rule, through applyMovement rather than a
    // locomotor
    const air = scene({ platforms: [] });
    const s = new Soldier(rosterSoldier("S"), rifle, 100, 500 - STAND_H);
    s.onGround = true;
    s.coyote = config.coyoteTime;
    s.applyMovement(STEP, 0, true);
    t.eq("coyote: a soldier jumps with config.jumpSpeed", s.vy, -config.jumpSpeed);
    stepActor(s, STEP, air.world, air.platforms);
    const after = s.vy;
    s.applyMovement(STEP, 0, true);
    t.eq("coyote: a soldier gets no second jump either", s.vy, after);
  }
  {
    // body.jump on a soldier-locomotor body is read by nobody — the companion is
    // driven by Soldier.applyMovement. Validation is the only thing that makes
    // that visible to an author, so it is asserted here.
    const companionBody = (body) => ({
      v: 1, id: "c", name: "C", threat: 1, role: "support", tier: 1, intelligence: 1,
      root: { id: "root", visual: { size: [30, 46] }, body, health: { max: 1 }, motion: { type: "static" } },
    });
    const bad = validateSpec(companionBody({ locomotor: "soldier", gravity: 1, jump: 800 }));
    t.ok("validate: body.jump on a soldier body is rejected, not ignored", !bad.ok);
    t.ok("validate: ...and the message names the field",
      bad.errors.some((e) => String(e.path || e).includes("body.jump")));

    const badG = validateSpec(companionBody({ locomotor: "soldier", gravity: 0.5 }));
    t.ok("validate: body.gravity != 1 on a soldier body is rejected too", !badG.ok);

    t.ok("validate: the shipping companion spec still passes",
      validateSpec(companionBody({ locomotor: "soldier", gravity: 1 })).ok);
    t.ok("validate: body.jump on a LEGGED body is fine",
      validateSpec(companionBody({ jump: 800 })).ok);
    t.ok("validate: an out-of-range body.jump is caught",
      !validateSpec(companionBody({ jump: 5000 })).ok);
  }
}
