// End-to-end: EnemySpec enemies in a live-ish mission. A generated level loads
// as spec roots, the runtime drives them (motion/fire), a soldier's shot kills a
// root, and scene.enemies (the collidable set combat.js hits) stays in sync.
// Also checks the mission-side kill/loot/credit bookkeeping in isolation.
import { generateLevel } from "../src/game/gen/levelgen.js";
import { loadMission, Loot } from "../src/mission/entities.js";
import { updateSpecEnemy, collidables, applyDamage } from "../src/mission/enemyspec/runtime.js";
import { updateProjectiles } from "../src/mission/combat.js";

// A ctx like the mission's: route spec damage/kill into the runtime.
function makeCtx(scene) {
  const ctx = {
    friendlyFire: false,
    damageMult: 1,
    damage(t, a, o) {
      if (t.kind === "spec") { if (a > 0 && o) t.root._lastAttacker = o; applyDamage(t.root, t, a, o, scene, ctx); return; }
      t.health -= a;
    },
    kill() {},
    spark() {}, burst() {},
  };
  return ctx;
}

export default async function run(t) {
  const soldier = { id: "s1", name: "Rook", callsign: "RK", stats: { health: 8, aim: 6, speed: 6 } };
  const weapon = { id: "rifle", name: "R", fireMode: "projectile", fireRate: 7, spread: 0, projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 2 }, effects: [{ kind: "damage", amount: 5 }] };

  // ---- generated level → spec roots ----
  const { level } = generateLevel({ seed: 20260722, difficulty: "high" });
  const scene = loadMission(level, [{ data: soldier, weapon }]);
  t.ok("load: spec roots, one per placement", scene.specRoots.length === level.enemies.length && scene.specRoots.length >= 1);
  t.ok("load: scene.enemies are spec parts", scene.enemies.length >= 1 && scene.enemies.every((e) => e.kind === "spec"));
  t.ok("load: every root carries loot with value > 0", scene.specRoots.every((r) => r.loot && r.loot.value > 0));

  const ctx = makeCtx(scene);

  // ---- runtime drives the enemies over a short run (movement and/or fire) ----
  const start = scene.specRoots.map((r) => ({ x: r.x, y: r.y }));
  let anyFired = false;
  for (let i = 0; i < 240; i++) {
    for (const r of scene.specRoots) if (r.alive) updateSpecEnemy(r, 1 / 60, scene, ctx);
    scene.enemies = scene.specRoots.flatMap((r) => (r.alive ? collidables(r) : []));
    if (scene.projectiles.length > 0) anyFired = true;
    updateProjectiles(scene, 1 / 60, ctx);
  }
  const moved = scene.specRoots.some((r, i) => Math.abs(r.x - start[i].x) > 1 || Math.abs(r.y - start[i].y) > 1);
  t.ok("runtime: enemies act (some move and/or fire)", moved || anyFired);

  // ---- the muzzle flash is a TIMER, and the RUNTIME owns it ----------------
  // It used to be decayed by the renderer — `e.muzzleFlash -= 1/60` inside
  // drawEntity — which was invisible while drawing and stepping were one loop.
  // Two things broke it: a room steps and never draws (every enemy that had
  // fired kept a permanent orange glow in front of its face), and a per-DRAW
  // decrement is frame-rate coupled, so the flash was 2.4x shorter at 144fps.
  // Nothing above catches it, because nothing above draws.
  {
    const shooter = scene.specRoots.find((r) => r.alive) || scene.specRoots[0];
    shooter.muzzleFlash = 0.055; // what a fire() sets
    updateSpecEnemy(shooter, 1 / 60, scene, ctx);
    t.ok("flash: stepping decays the muzzle flash", shooter.muzzleFlash < 0.055);
    for (let i = 0; i < 10; i++) updateSpecEnemy(shooter, 1 / 60, scene, ctx);
    t.ok("flash: ...and it burns out without anything drawing it", shooter.muzzleFlash <= 0);

    // Frame-rate independence is the half a room does not exercise but a
    // 144Hz monitor does: the same wall-clock decays the same amount.
    shooter.muzzleFlash = 0.055;
    for (let i = 0; i < 2; i++) updateSpecEnemy(shooter, 1 / 120, scene, ctx);
    const half = shooter.muzzleFlash;
    shooter.muzzleFlash = 0.055;
    updateSpecEnemy(shooter, 1 / 60, scene, ctx);
    t.ok("flash: one step at 60 decays as much as two at 120", Math.abs(half - shooter.muzzleFlash) < 1e-9);
  }

  // ---- a soldier's shot kills a root; collidables + scene.enemies drop it ----
  const victim = scene.specRoots.find((r) => r.alive);
  const before = scene.enemies.length;
  const killer = { kind: "soldier", id: "s1", kills: 0 };
  // route through ctx.damage exactly as a projectile hit would
  ctx.damage(victim, 1e9, killer);
  scene.enemies = scene.specRoots.flatMap((r) => (r.alive ? collidables(r) : []));
  t.ok("kill: massive damage drops the root", victim.alive === false);
  t.ok("kill: dead root leaves scene.enemies", scene.enemies.length < before);
  t.ok("kill: last attacker was recorded for credit", victim._lastAttacker === killer);

  // ---- mission-side bookkeeping (kill credit + loot drop on root death) ----
  // Mirrors Mission._updateEnemies' once-per-root death handling.
  const drops = [];
  for (const r of scene.specRoots) {
    if (r.alive || r._counted) continue;
    r._counted = true;
    if (r._lastAttacker && r._lastAttacker.kind === "soldier") r._lastAttacker.kills += 1;
    if (r.loot) drops.push(new Loot(r.loot, r.x, r.y));
  }
  t.ok("bookkeeping: killer credited exactly one kill", killer.kills === 1);
  t.ok("bookkeeping: one loot dropped, carrying the root's item", drops.length === 1 && drops[0].item === victim.loot);
}
