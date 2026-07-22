// EnemySpec runtime: instantiation, motion, emitters, parts/links/signals,
// phase transitions, spawn limits, dry-run acceptance.
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { TEMPLATES, TEMPLATE_BY_ID } from "../src/game/enemyspec/templates.js";
import {
  instantiate, updateSpecEnemy, applyDamage, killEntity, collidables, findEntity, spawnFromDef,
} from "../src/mission/enemyspec/runtime.js";
import { dryRunSpec } from "../src/game/enemyspec/dryrun.js";

const STEP = 1 / 60;

function makeScene() {
  return {
    world: { width: 1400, height: 540, gravity: 2000 },
    platforms: [{ x: 0, y: 500, w: 1400, h: 40 }],
    soldiers: [{ kind: "soldier", x: 900, y: 454, w: 30, h: 46, vx: 0, vy: 0, onGround: true, alive: true, health: 1e9, maxHealth: 1e9 }],
    enemies: [],
    projectiles: [],
  };
}

function makeCtx(root) {
  const log = { playerDamage: 0, kills: [] };
  const ctx = {
    friendlyFire: false,
    damageMult: 1,
    damage: (t, a, o) => {
      if (t.kind === "spec") applyDamage(root ? root() : t.root, t, a, o, null, ctx);
      else log.playerDamage += a;
    },
    kill: (t) => log.kills.push(t),
  };
  return { ctx, log };
}

function sim(root, scene, ctx, seconds) {
  for (let i = 0, n = Math.round(seconds / STEP); i < n; i++) updateSpecEnemy(root, STEP, scene, ctx);
}

const norm = (id) => normalizeSpec(TEMPLATE_BY_ID[id]);

export default async function run(t) {
  // ---- charger: chases and deals contact damage ---------------------------
  {
    const scene = makeScene();
    const root = instantiate(norm("tpl_charger"), 200, 474);
    const { ctx, log } = makeCtx(() => root);
    sim(root, scene, ctx, 4);
    t.ok("charger: moved toward the player", root.x > 400);
    t.ok("charger: dealt contact damage", log.playerDamage > 0);
    t.ok("charger: stays on the ground", root.onGround);
  }

  // ---- shooter: holds range and fires telegraphed shots -------------------
  {
    const scene = makeScene();
    const root = instantiate(norm("tpl_shooter"), 200, 454);
    const { ctx } = makeCtx(() => root);
    sim(root, scene, ctx, 3);
    t.ok("shooter: fired projectiles", scene.projectiles.length > 0);
    const p = scene.projectiles[0];
    t.ok("shooter: projectile is enemy team", p.team === "enemy");
    t.ok("shooter: projectile flies toward player", p.vx > 0);
    t.ok("shooter: keeps standoff distance", root.x + root.w < scene.soldiers[0].x);
  }

  // ---- flier: hovers (no gravity) and fires a fan -------------------------
  {
    const scene = makeScene();
    const root = instantiate(norm("tpl_flier"), 300, 200);
    const { ctx } = makeCtx(() => root);
    sim(root, scene, ctx, 3);
    t.ok("flier: stays airborne", root.y < 400);
    t.ok("flier: fan fired multiple projectiles", scene.projectiles.length >= 3);
  }

  // ---- boss: parts, emitter refs, signals, phase changes, links -----------
  {
    const scene = makeScene();
    const nspec = norm("tpl_boss_moth");
    const root = instantiate(nspec, 300, 160);
    const { ctx } = makeCtx(() => root);

    const left = findEntity(root, "leftWing");
    const right = findEntity(root, "rightWing");
    t.ok("boss: wings exist as entities", left && right && left.alive);
    t.eq("boss: collidables = core + 2 wings", collidables(root).length, 3);
    t.ok("boss: wings follow the core", Math.abs((left.x + left.w / 2) - (root.x + root.w / 2 + left.spec.at[0])) < 2);

    sim(root, scene, ctx, 4);
    t.ok("boss: launched seeker entities", root.spawned.some((s) => s.id === "seeker"));
    const seeker = root.spawned.find((s) => s.id === "seeker" && s.alive);
    t.ok("boss: seekers are shootable (have health)", seeker && seeker.health > 0);
    t.ok("boss: seekers home toward the player", !seeker || seeker.vx > 0);

    // shoot a seeker down → shards + signal
    const before = root.spawned.filter((s) => s.alive).length;
    if (seeker) applyDamage(root, seeker, 999, null, scene, ctx);
    t.ok("boss: destroyed seeker spawned shards", root.spawned.filter((s) => s.alive && s.id === "shard").length > 0);

    // destroy both wings → grounded phase via countAlive transition
    applyDamage(root, left, 9999, null, scene, ctx);
    t.eq("boss: wing death raised rage", root.vars.rage, 1);
    applyDamage(root, right, 9999, null, scene, ctx);
    sim(root, scene, ctx, 0.1);
    t.eq("boss: both wings dead → grounded state", root.brainState.current, "grounded");
    sim(root, scene, ctx, 1.5);
    t.ok("boss: grounded phase falls to the floor", root.onGround);
    t.ok(
      "boss: dead wings leave collidables",
      !collidables(root).some((e) => e.id === "leftWing" || e.id === "rightWing")
    );

    // killing the root ends the whole tree
    killEntity(root, root, null, scene, ctx);
    t.ok("boss: root death kills the enemy", !root.alive);
  }

  // ---- hp transition (fury) ----------------------------------------------
  {
    const scene = makeScene();
    const root = instantiate(norm("tpl_boss_moth"), 300, 160);
    const { ctx } = makeCtx(() => root);
    applyDamage(root, root, root.maxHealth * 0.7, null, scene, ctx);
    sim(root, scene, ctx, 0.1);
    t.eq("boss: hp threshold → fury state", root.brainState.current, "fury");
    t.eq("boss: fury enter action set rage", root.vars.rage, 3);
  }

  // ---- spawn limits enforced ---------------------------------------------
  {
    const scene = makeScene();
    const nspec = normalizeSpec({
      id: "bomber",
      limits: { maxAlive: 5, maxSpawnsPerSecond: 40, maxSpawnDepth: 2 },
      defs: { mote: { visual: { size: [8, 8] }, body: { gravity: 0 }, life: { ttl: 60 } } },
      root: { health: { max: 50 } },
    });
    const root = instantiate(nspec, 300, 454);
    const { ctx } = makeCtx(() => root);
    for (let i = 0; i < 30; i++) spawnFromDef(root, "mote", 300, 300, { depth: 1 }, scene, ctx);
    t.eq("limits: maxAlive caps spawns", root.spawned.filter((s) => s.alive).length, 5);
    t.ok("limits: over-depth spawn refused", spawnFromDef(root, "mote", 300, 300, { depth: 3 }, scene, ctx) === null);
  }

  // ---- ttl expiry runs the destroy path ----------------------------------
  {
    const scene = makeScene();
    const nspec = normalizeSpec({
      id: "ttl_test",
      defs: { puff: { visual: { size: [6, 6] }, body: { gravity: 0 } } },
      root: {
        health: { max: 10 },
        emitters: { g: { ref: "spark" } },
      },
    });
    // hand-build a spawned entity with a short ttl + a destroy handler
    nspec.defs.spark = normalizeSpec({
      id: "x",
      defs: {},
      root: { health: { max: 1 }, life: { ttl: 0.2 }, body: { gravity: 0 }, on: { destroy: [{ signal: "popped" }] } },
    }).root;
    const root = instantiate(nspec, 300, 454);
    const { ctx } = makeCtx(() => root);
    const sp = spawnFromDef(root, "spark", 400, 300, { depth: 1 }, scene, ctx);
    let popped = false;
    root.spec.on["signal:popped"] = [];
    // listen via pendingSignals instead: run a few frames and check death
    sim(root, scene, ctx, 0.5);
    t.ok("ttl: spawned entity expires", sp && !sp.alive);
    t.ok("ttl: expired entities are culled", !root.spawned.includes(sp));
  }

  // ---- dry-run gate -------------------------------------------------------
  for (const tpl of TEMPLATES) {
    const res = dryRunSpec(normalizeSpec(tpl));
    t.ok(`dryrun: ${tpl.id} passes (${res.errors.join("; ") || "ok"})`, res.ok);
  }
  {
    // a spec that does nothing at all must fail the gate
    const dead = normalizeSpec({ id: "brick", root: { health: { max: 10 }, motion: { type: "static" } } });
    const res = dryRunSpec(dead);
    t.ok("dryrun: do-nothing spec rejected", !res.ok && res.errors.some((e) => e.includes("does nothing")));
  }
}
