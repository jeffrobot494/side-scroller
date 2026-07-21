// Combat semantics: the shared combat.js resolves every effect kind correctly.
import { updateProjectiles, updateStatuses, applyEffects } from "../src/mission/combat.js";
import { stepActor } from "../src/mission/entities.js";
import { fire } from "../src/mission/ai.js";

function enemy(x, y, hp = 100) {
  return { kind: "enemy", x, y, w: 30, h: 40, vx: 0, vy: 0, alive: true, health: hp, maxHealth: hp, facing: -1, hitFlash: 0 };
}
function soldier(x, y, hp = 100) {
  return { kind: "soldier", x, y, w: 30, h: 46, vx: 0, vy: 0, alive: true, health: hp, maxHealth: hp, facing: 1, hitFlash: 0 };
}
function proj(effects, x, y, vx = 600, vy = 0, team = "player", owner = null) {
  return { x, y, w: 10, h: 6, vx, vy, color: "#fff", life: 2, team, effects, owner, dead: false };
}
function ctx() {
  return {
    friendlyFire: false,
    damageMult: 1,
    damage(tg, a) { tg.health -= a; if (tg.health <= 0 && tg.alive) tg.alive = false; },
    kill(tg) { tg.alive = false; },
    spark() {}, burst() {},
  };
}
const scene = (over = {}) => ({ platforms: [], soldiers: [], enemies: [], projectiles: [], ...over });

export default async function run(t) {
  // damage
  {
    const e = enemy(100, 100);
    const s = scene({ enemies: [e], projectiles: [proj([{ kind: "damage", amount: 20 }], 100, 110)] });
    updateProjectiles(s, 0.016, ctx());
    t.ok("damage: enemy took 20", e.health === 80);
    t.ok("damage: projectile consumed", s.projectiles.length === 0);
  }

  // pierce — one projectile hits two enemies
  {
    const e1 = enemy(120, 100), e2 = enemy(180, 100);
    const p = proj([{ kind: "damage", amount: 10 }, { kind: "pierce", count: 1 }], 100, 110, 600, 0);
    const s = scene({ enemies: [e1, e2], projectiles: [p] });
    for (let i = 0; i < 30 && s.projectiles.length; i++) updateProjectiles(s, 0.02, ctx());
    t.ok("pierce: both enemies hit", e1.health < 100 && e2.health < 100);
  }

  // explode — splash hits nearby, not far
  {
    const hit = enemy(300, 100), near = enemy(360, 100), far = enemy(600, 100);
    const s = scene({ enemies: [hit, near, far], projectiles: [proj([{ kind: "explode", amount: 20, radius: 170 }], 300, 110)] });
    updateProjectiles(s, 0.016, ctx());
    t.ok("explode: direct + nearby damaged", hit.health < 100 && near.health < 100);
    t.ok("explode: far enemy untouched", far.health === 100);
  }

  // chain — jumps to nearby enemies
  {
    const e0 = enemy(100, 100), e1 = enemy(180, 100), e2 = enemy(260, 100);
    const s = scene({ enemies: [e0, e1, e2], projectiles: [proj([{ kind: "damage", amount: 5 }, { kind: "chain", amount: 8, jumps: 2, range: 240 }], 100, 110)] });
    updateProjectiles(s, 0.016, ctx());
    t.ok("chain: primary + two jumps damaged", e0.health < 100 && e1.health < 100 && e2.health < 100);
  }

  // slow — status set, stepActor halves horizontal displacement
  {
    const e = enemy(100, 100); e.vx = 100;
    applyEffects(scene({ enemies: [e] }), e, [{ kind: "slow", factor: 0.5, duration: 1 }], null, ctx(), {});
    t.ok("slow: status applied", e.slow && e.slow.factor === 0.5);
    const world = { gravity: 0, width: 5000 };
    const before = e.x;
    stepActor(e, 0.1, world, []);
    t.ok("slow: displacement halved (~5px not 10)", Math.abs(e.x - before - 5) < 0.01);
  }

  // knockback — imparts horizontal velocity in the shot's direction
  {
    const e = enemy(100, 100);
    const s = scene({ enemies: [e], projectiles: [proj([{ kind: "knockback", force: 200 }], 100, 110, 600, 0)] });
    updateProjectiles(s, 0.016, ctx());
    t.ok("knockback: enemy shoved right", e.vx >= 200);
  }

  // burn — ticks damage over time via updateStatuses
  {
    const e = enemy(100, 100);
    applyEffects(scene({ enemies: [e] }), e, [{ kind: "burn", dps: 10, duration: 1 }], null, ctx(), {});
    updateStatuses(scene({ enemies: [e] }), 0.5, ctx());
    t.ok("burn: DoT ticked ~5", Math.abs(100 - e.health - 5) < 0.01);
  }

  // pellets — fire() spawns N projectiles
  {
    const shooter = { kind: "soldier", x: 0, y: 0, w: 30, h: 46, facing: 1, fireCooldown: 0,
      weapon: { fireRate: 2, spread: 0.02, projectile: { speed: 800, w: 8, h: 4, color: "#fff", life: 1 }, effects: [{ kind: "damage", amount: 6 }, { kind: "pellets", count: 5, spread: 0.1 }] } };
    const s = scene({ soldiers: [shooter] });
    fire(s, shooter, { x: 1, y: 0 }, "player", 0.016, 1);
    t.ok("pellets: fired 5 projectiles", s.projectiles.length === 5);
  }

  // homing — steers toward the nearest opponent
  {
    const target = enemy(500, 100);
    const p = proj([{ kind: "homing", turn: 5 }], 100, 300, 500, 0);
    const s = scene({ enemies: [target], projectiles: [p] });
    updateProjectiles(s, 0.05, ctx());
    t.ok("homing: curved upward toward target", p.vy < 0);
  }

  // wall — platform stops the shot
  {
    const s = scene({ platforms: [{ x: 90, y: 100, w: 40, h: 40 }], projectiles: [proj([{ kind: "damage", amount: 10 }], 100, 110)] });
    updateProjectiles(s, 0.016, ctx());
    t.ok("wall: projectile stopped", s.projectiles.length === 0);
  }

  // friendly fire off — player shot ignores soldiers
  {
    const ally = soldier(100, 100);
    const s = scene({ soldiers: [ally], projectiles: [proj([{ kind: "damage", amount: 20 }], 100, 110)] });
    updateProjectiles(s, 0.016, ctx());
    t.ok("friendly fire off: ally unharmed", ally.health === 100);
  }
}
