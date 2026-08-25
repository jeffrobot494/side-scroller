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

  // knockback — an impulse into the SHOVE channel, not into vx. It has to be a
  // separate axis pair: a locomotor re-assigns vx every frame, so an impulse
  // written there survived one frame and vanished (tech/locomotion.md, K1).
  {
    const e = enemy(100, 100);
    const s = scene({ enemies: [e], projectiles: [proj([{ kind: "knockback", force: 1 }], 100, 110, 600, 0)] });
    updateProjectiles(s, 0.016, ctx());
    t.ok("knockback: goes to the shove channel, never to vx", e.vx === 0 && e.shoveX > 0);
    t.ok("knockback: shoved along the shot", e.shoveX >= 1000);
    t.ok("knockback: and lifted", e.shoveY < 0);
  }

  // `force` is 0–1 of one maximum impulse, and it is a VELOCITY: half the force
  // is half the speed, which is a QUARTER of the distance.
  {
    const half = enemy(100, 100), full = enemy(400, 100);
    const s = scene({ enemies: [half, full], projectiles: [
      proj([{ kind: "knockback", force: 0.5 }], 100, 110, 600, 0),
      proj([{ kind: "knockback", force: 1 }], 400, 110, 600, 0),
    ] });
    updateProjectiles(s, 0.016, ctx());
    t.ok("knockback: half the force is half the velocity", Math.abs(full.shoveX / half.shoveX - 2) < 0.01);
    t.ok("knockback: force above 1 is clamped, not extrapolated", (() => {
      const e = enemy(100, 100);
      const sc = scene({ enemies: [e], projectiles: [proj([{ kind: "knockback", force: 9 }], 100, 110, 600, 0)] });
      updateProjectiles(sc, 0.016, ctx());
      return Math.abs(e.shoveX - full.shoveX) < 0.01;
    })());
  }

  // Mass divides the impulse by its square root, so a big body moves less from
  // the same hit — derived from the body box, with a 30x46 soldier as mass 1.
  {
    const light = { ...enemy(100, 100), w: 20, h: 20 };
    const heavy = { ...enemy(400, 100), w: 96, h: 44 };
    const s = scene({ enemies: [light, heavy], projectiles: [
      proj([{ kind: "knockback", force: 1 }], 100, 105, 600, 0),
      proj([{ kind: "knockback", force: 1 }], 400, 105, 600, 0),
    ] });
    updateProjectiles(s, 0.016, ctx());
    t.ok("knockback: a heavier body is shoved less", heavy.shoveX < light.shoveX);
    t.ok("knockback: by the square root of the mass ratio", (() => {
      const ratio = Math.sqrt((96 * 44) / (20 * 20));
      return Math.abs(light.shoveX / heavy.shoveX - ratio) < 0.01;
    })());
  }

  // The channel is what a controller cannot erase: vx is re-assigned every
  // frame here, exactly as a locomotor does, and the shove still lands.
  {
    const e = enemy(100, 300);
    const s = scene({ platforms: [{ x: 0, y: 340, w: 4000, h: 40 }], enemies: [e],
      projectiles: [proj([{ kind: "knockback", force: 1 }], 100, 310, 600, 0)] });
    updateProjectiles(s, 1 / 60, ctx());
    const x0 = e.x;
    for (let i = 0; i < 120; i++) {
      e.vx = -200;                       // the "controller", overwriting every frame
      stepActor(e, 1 / 60, { gravity: 2000, width: 8000 }, s.platforms);
    }
    t.ok("knockback: survives a controller that re-assigns vx", e.x - x0 > 300);
    t.ok("knockback: and the channel bleeds to rest", e.shoveX === 0);
  }

  // A wall stops a shove, or you keep pressing into it forever.
  {
    const e = enemy(100, 300);
    const s = scene({ platforms: [{ x: 200, y: 200, w: 40, h: 200 }], enemies: [e],
      projectiles: [proj([{ kind: "knockback", force: 1 }], 100, 310, 600, 0)] });
    updateProjectiles(s, 1 / 60, ctx());
    for (let i = 0; i < 30; i++) stepActor(e, 1 / 60, { gravity: 2000, width: 8000 }, s.platforms);
    t.ok("knockback: a wall stops the shove", e.shoveX === 0 && e.x + e.w <= 200.01);
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
