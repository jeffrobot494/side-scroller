// New weapon mechanics: projectile gravity/arc, magazine + reload, and the Aim
// stat driving spread. Uses the real fire()/combat.js/entities so these are
// behavior guards, not mocks.
import { updateProjectiles } from "../src/mission/combat.js";
import { Soldier, startReload, tickReload } from "../src/mission/entities.js";
import { fire, aimAccuracy } from "../src/mission/ai.js";
import { config } from "../src/game/config.js";

function proj(over = {}) {
  return { x: 0, y: 0, w: 8, h: 4, vx: 600, vy: 0, color: "#fff", life: 2, team: "player", effects: [], owner: null, dead: false, ...over };
}
const scene = (over = {}) => ({ world: { gravity: 2000, width: 5000, height: 600 }, platforms: [], soldiers: [], enemies: [], projectiles: [], ...over });

function makeShooter(weapon) {
  return new Soldier({ id: "s", name: "S", callsign: "S", stats: { health: 5, aim: 5, speed: 5 } }, weapon, 0, 0);
}

export default async function run(t) {
  // ---- gravity / arc ------------------------------------------------------
  {
    const p = proj({ gravity: 0.5, vy: 0 });
    const s = scene({ projectiles: [p] });
    const vy0 = p.vy;
    updateProjectiles(s, 0.05, ctx());
    t.ok("gravity: arcing projectile gains downward vy", p.vy > vy0);
    // 0.5 * 2000 * 0.05 = 50
    t.ok("gravity: vy magnitude matches fraction×worldGravity×dt", Math.abs(p.vy - 50) < 1e-6);
  }
  {
    const p = proj({ gravity: 0, vy: 0 });
    const s = scene({ projectiles: [p] });
    updateProjectiles(s, 0.05, ctx());
    t.ok("gravity: straight shot (gravity 0) keeps vy=0", p.vy === 0);
  }

  // ---- magazine + reload --------------------------------------------------
  {
    const w = { fireRate: 100, spread: 0, magazine: 3, reloadTime: 2, projectile: { speed: 800, w: 8, h: 4, color: "#fff", life: 1 }, effects: [{ kind: "damage", amount: 5 }] };
    const shooter = makeShooter(w);
    const s = scene({ soldiers: [shooter] });
    t.ok("mag: starts full", shooter.ammo === 3);
    let fired = 0;
    for (let i = 0; i < 5; i++) { shooter.fireCooldown = 0; if (fire(s, shooter, { x: 1, y: 0 }, "player", 0.016, 1)) fired++; }
    t.ok("mag: only fires magazine size then blocks", fired === 3 && shooter.ammo === 0);

    // manual reload
    t.ok("reload: starts", startReload(shooter) === true && shooter.reloading > 0);
    t.ok("reload: can't fire mid-reload", (() => { shooter.fireCooldown = 0; return fire(s, shooter, { x: 1, y: 0 }, "player", 0.016, 1); })() === false);
    // tick to completion
    for (let i = 0; i < 200 && shooter.reloading > 0; i++) tickReload(shooter, 0.016);
    t.ok("reload: refills to magazine", shooter.ammo === 3 && shooter.reloading === 0);
  }
  {
    // a weapon with no magazine has unlimited ammo and never reloads
    const w = { fireRate: 100, spread: 0, projectile: { speed: 800, w: 8, h: 4, color: "#fff", life: 1 }, effects: [{ kind: "damage", amount: 5 }] };
    const shooter = makeShooter(w);
    t.ok("no-mag: ammo unlimited", shooter.ammo === Infinity);
    t.ok("no-mag: startReload is a no-op", startReload(shooter) === false);
  }

  // ---- finite magazines (config.soldierMagazines) -------------------------
  {
    const prevMags = config.soldierMagazines;
    config.soldierMagazines = 2; // 1 loaded + 1 spare
    const w = { fireRate: 100, spread: 0, magazine: 3, reloadTime: 0.1, projectile: { speed: 800, w: 8, h: 4, color: "#fff", life: 1 }, effects: [] };
    const shooter = makeShooter(w);
    t.eq("mags: spares = soldierMagazines - 1", shooter.magsLeft, 1);

    const finishReload = () => { startReload(shooter); for (let i = 0; i < 50 && shooter.reloading > 0; i++) tickReload(shooter, 0.016); };
    shooter.ammo = 0;
    finishReload();
    t.ok("mags: first reload consumes the spare", shooter.ammo === 3 && shooter.magsLeft === 0);

    shooter.ammo = 0;
    t.ok("mags: no spares left blocks reload", startReload(shooter) === false);
    finishReload();
    t.ok("mags: dry when out of spares and ammo", shooter.ammo === 0 && shooter.magsLeft === 0);

    config.soldierMagazines = prevMags;
  }

  // ---- reload movement penalty -------------------------------------------
  {
    const w = { fireRate: 5, spread: 0, magazine: 5, reloadTime: 2, projectile: { speed: 800, w: 8, h: 4, color: "#fff", life: 1 }, effects: [] };
    const fast = makeShooter(w);
    const slow = makeShooter(w);
    slow.reloading = 1; // mid-reload
    for (let i = 0; i < 60; i++) { fast.applyMovement(0.016, 1, false); slow.applyMovement(0.016, 1, false); }
    t.ok("reload: reloading soldier tops out slower", slow.vx < fast.vx);
    t.ok("reload: ~reloadSpeedMult of full speed", Math.abs(slow.vx - config.runSpeed * config.reloadSpeedMult) < 1);
  }

  // ---- aim → spread -------------------------------------------------------
  {
    t.ok("aim: 10 → accuracy 1", aimAccuracy(10) === 1);
    t.ok("aim: 1 → accuracy 0", aimAccuracy(1) === 0);
    t.ok("aim: monotonic", aimAccuracy(8) > aimAccuracy(4));

    // Higher aim → tighter angular spread of spawned pellets. Measure spread by
    // sampling many shots and comparing angular variance.
    const w = { fireRate: 1000, spread: 0, projectile: { speed: 800, w: 8, h: 4, color: "#fff", life: 1 }, effects: [{ kind: "damage", amount: 1 }] };
    const spreadFor = (aim) => {
      const shooter = makeShooter(w);
      const s = scene({ soldiers: [shooter] });
      let maxAng = 0;
      for (let i = 0; i < 400; i++) {
        shooter.fireCooldown = 0;
        const before = s.projectiles.length;
        fire(s, shooter, { x: 1, y: 0 }, "player", 0.001, aimAccuracy(aim));
        const p = s.projectiles[s.projectiles.length - 1];
        if (s.projectiles.length > before) maxAng = Math.max(maxAng, Math.abs(Math.atan2(p.vy, p.vx)));
      }
      return maxAng;
    };
    t.ok("aim: high aim shoots tighter than low aim", spreadFor(10) < spreadFor(2));
    t.ok("aim: aim 10 is perfectly straight", spreadFor(10) < 1e-9);
  }
}

function ctx() {
  return { friendlyFire: false, damageMult: 1, damage() {}, kill() {}, spark() {}, burst() {} };
}
