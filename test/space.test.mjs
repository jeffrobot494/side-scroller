// space — the standalone zero-g prototype (tech/space-prototype.md). Drives
// src/space/sim.js headlessly with scripted input; view.js gets a smoke draw.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ctx2d } from "./harness.mjs";
import { CFG, WEAPONS, createWorld, step, collide, makeAsteroid, makeRng, fire, startReload, applyEffects, aimAccuracy, addRuin, segWall, hurt, closestOnWall } from "../src/space/sim.js";
import { createView, draw } from "../src/space/view.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// A world with nothing in it but the squad, for mechanics tests.
function empty(opts = {}) {
  return createWorld(7, { asteroids: 0, dummies: 0, ruins: 0, objective: false, ...opts });
}

// A stationary target `d` px along +x from a soldier at (2000, 2000).
function range(weapon, d = 200, opts = {}) {
  const w = empty({ weapons: [weapon], dummies: 1, ...opts });
  const s = w.soldiers[0];
  Object.assign(s, { x: 2000, y: 2000, vx: 0, vy: 0, aim: 0 });
  const target = w.enemies[0];
  Object.assign(target, { x: 2000 + d, y: 2000, homeX: 2000 + d, homeY: 2000, hp: 1000, maxHp: 1000 });
  return { w, s, t: target };
}

function run(world, input, steps) {
  for (let i = 0; i < steps; i++) step(world, typeof input === "function" ? input(i) : input);
}

export default async function run_(t) {
  // ---- isolation: the prototype imports only itself -----------------------
  const dir = join(ROOT, "src/space");
  const outside = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    for (const m of readFileSync(join(dir, f), "utf8").matchAll(/from\s+["']([^"']+)["']/g)) {
      if (!m[1].startsWith("./")) outside.push(`${f} → ${m[1]}`);
    }
  }
  t.ok(`src/space imports nothing outside itself${outside.length ? ": " + outside.join(", ") : ""}`, outside.length === 0);

  // ---- S1: flight ----------------------------------------------------------
  {
    const w = empty();
    const s = w.soldiers[0];
    s.x = s.y = 2000;
    s.vx = 100; s.vy = -50;
    run(w, {}, 120);
    t.ok("drift: speed is constant with no input", near(Math.hypot(s.vx, s.vy), Math.hypot(100, 50), 1e-9));
    t.ok("drift: position advances by v·t", near(s.x, 2000 + 100 * 2, 1e-6) && near(s.y, 2000 - 50 * 2, 1e-6));
  }
  {
    const w = empty();
    const s = w.soldiers[0];
    s.x = s.y = 2000;
    s.angle = 0.7;
    run(w, { thrust: true }, 30);
    const dir = Math.atan2(s.vy, s.vx);
    t.ok("thrust accelerates along facing", near(dir, 0.7, 1e-9));
    t.ok("thrust magnitude = accel × t", near(Math.hypot(s.vx, s.vy), CFG.thrust * 0.5, 1e-6));
    run(w, { thrust: true }, 600);
    t.ok("thrust cannot pass the cap", Math.hypot(s.vx, s.vy) <= CFG.thrustCap + 1e-9);
    s.x = s.y = 2000; s.vx = 900; s.vy = 0; s.angle = 0;
    run(w, { thrust: true }, 1);
    t.ok("thrust does not brake a body already past the cap", near(s.vx, 900, 1e-9));
  }
  {
    const w = empty();
    const s = w.soldiers[0];
    const a0 = s.angle;
    run(w, { turn: 1 }, 60);
    t.ok("turn rate is fixed", near(s.angle - a0, CFG.turnRate, 1e-9));
  }
  {
    const rng = makeRng(3);
    const a = makeAsteroid(rng, 0, 0, 60);
    const b = makeAsteroid(rng, 90, 10, 40);
    a.vx = 80; a.vy = 5; b.vx = -60; b.vy = 20;
    const px = a.m * a.vx + b.m * b.vx;
    const py = a.m * a.vy + b.m * b.vy;
    t.ok("asteroids overlapping collide", collide(a, b));
    t.ok("collision conserves momentum", near(a.m * a.vx + b.m * b.vx, px, 1e-6) && near(a.m * a.vy + b.m * b.vy, py, 1e-6));
    t.ok("collision separates", Math.hypot(b.x - a.x, b.y - a.y) >= a.r + b.r - 1e-9);
  }
  {
    // Soldier at full thrust speed into a small rock: never passes through.
    const w = empty();
    const s = w.soldiers[0];
    const rock = makeAsteroid(makeRng(1), 2000, 1000, CFG.asteroidMinR);
    rock.vx = rock.vy = 0;
    w.asteroids.push(rock);
    s.x = 1500; s.y = 1000; s.vx = 900; s.vy = 0; // well past the thrust cap
    run(w, {}, 90);
    t.ok("a fast soldier bounces off a rock instead of tunnelling", s.x < rock.x);
  }
  {
    const w = empty();
    const s = w.soldiers[0];
    s.x = 30; s.y = 2000; s.vx = -300; s.vy = 0;
    run(w, {}, 30);
    t.ok("map edge bounces", s.vx > 0 && s.x >= s.r);
  }
  {
    const w = createWorld(11);
    t.ok("asteroids placed", w.asteroids.length > 20);
    let overlap = 0;
    for (let i = 0; i < w.asteroids.length; i++) for (let j = i + 1; j < w.asteroids.length; j++) {
      const a = w.asteroids[i], b = w.asteroids[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) overlap++;
    }
    t.eq("no asteroids overlap at spawn", overlap, 0);
    t.ok("start is clear", w.asteroids.every((a) => Math.hypot(a.x - w.start.x, a.y - w.start.y) > a.r + CFG.soldierR));
  }

  // ---- S2: guns --------------------------------------------------------------
  {
    const { w, s, t: d } = range("carbine");
    run(w, { fire: true, aimX: 2400, aimY: 2000 }, 1);
    t.eq("fire spends a round", s.ammo, WEAPONS.carbine.magazine - 1);
    run(w, {}, 30);
    t.ok("carbine round × playerDamageMult 1.25 = 17.5", near(1000 - d.hp, 14 * 1.25, 1e-9));
  }
  {
    const { w, s } = range("carbine");
    s.ammo = 0;
    t.ok("empty magazine does not fire", !fire(w, s, 0, 1));
    t.ok("R starts a reload", startReload(s));
    run(w, {}, Math.ceil(WEAPONS.carbine.reloadTime * 60) + 1);
    t.eq("reload refills the magazine", s.ammo, WEAPONS.carbine.magazine);
    t.eq("reload spends a spare", s.magsLeft, CFG.soldierMagazines - 2);
    s.ammo = 0; s.magsLeft = 0;
    t.ok("no spares, no reload", !startReload(s));
  }
  {
    const { w, s } = range("scattergun");
    s.ammo = 6;
    run(w, { fire: true, firePress: false, aimX: 2400, aimY: 2000 }, 20);
    t.eq("semi-auto ignores a held trigger", s.ammo, 6);
    run(w, { firePress: true, aimX: 2400, aimY: 2000 }, 1);
    t.eq("semi-auto fires on the press", s.ammo, 5);
    t.eq("pellets: one shell, five rounds", w.projectiles.length, 5);
  }
  {
    // Spread follows the copied formula: w.spread + (1 - acc) × aimSpread.
    const { w, s } = range("carbine", 200);
    s.stats.aim = 1; // accuracy 0
    const lim = WEAPONS.carbine.spread + CFG.aimSpread;
    let worst = 0;
    for (let i = 0; i < 200; i++) {
      s.fireCd = 0; s.ammo = 10;
      fire(w, s, 0, aimAccuracy(s.stats.aim));
      const p = w.projectiles.pop();
      worst = Math.max(worst, Math.abs(Math.atan2(p.vy, p.vx)));
    }
    t.ok("spread stays within the Aim-scaled cone", worst <= lim + 1e-9 && worst > lim * 0.8);
  }
  {
    // Effects in authored order: burn ticks, slow expires, knockback decays.
    const { w, t: d } = range("carbine");
    const s = w.soldiers[0];
    applyEffects(w, d, [{ kind: "burn", dps: 8, duration: 1.2 }], s, { x: d.x, y: d.y, vx: 1, vy: 0, team: "player" });
    run(w, {}, 90);
    t.ok("burn: dps × 1.25 × duration", near(1000 - d.hp, 8 * 1.25 * 1.2, 0.3) && !d.burn);
    applyEffects(w, d, [{ kind: "slow", factor: 0.5, duration: 1.5 }], s, { x: d.x, y: d.y, vx: 1, vy: 0, team: "player" });
    d.vx = 100; const x0 = d.x;
    run(w, {}, 30);
    t.ok("slow halves displacement", near(d.x - x0, 25, 1e-6));
    d.vx = 0;
    applyEffects(w, d, [{ kind: "knockback", force: 0.3 }], s, { x: d.x, y: d.y, vx: 0, vy: 5, team: "player" });
    t.ok("knockback shoves along the round, divided by √mass", near(d.sy, (0.3 * CFG.knockbackMaxV) / Math.sqrt(d.m), 1e-9) && d.sx === 0);
    run(w, {}, 60);
    t.ok("the shove decays to rest (no permanent drift)", d.sx === 0 && d.sy === 0);
  }
  {
    // Explode hits the direct target twice and anything else in the radius.
    const { w, t: d } = range("grenade_launcher", 200, { dummies: 2 });
    const d2 = w.enemies[1];
    Object.assign(d2, { x: d.x + 100, y: d.y, hp: 1000, maxHp: 1000 });
    run(w, { firePress: true, aimX: 2400, aimY: 2000 }, 1);
    run(w, {}, 40);
    t.ok("grenade: direct 10 + blast 40, ×1.25", near(1000 - d.hp, 50 * 1.25, 1e-9));
    t.ok("grenade: blast reaches a neighbour", near(1000 - d2.hp, 40 * 1.25, 1e-9));
  }
  {
    const { w, t: d } = range("arc_tazer", 200, { dummies: 4 });
    const [, b, c, far] = w.enemies;
    Object.assign(b, { x: d.x + 150, y: d.y, hp: 1000, maxHp: 1000 });
    Object.assign(c, { x: d.x + 300, y: d.y + 60, hp: 1000, maxHp: 1000 });
    Object.assign(far, { x: d.x, y: d.y + 900, hp: 1000, maxHp: 1000 });
    run(w, { fire: true, aimX: 2400, aimY: 2000 }, 1);
    run(w, {}, 20);
    t.ok("chain jumps twice within range", b.hp < 1000 && c.hp < 1000 && far.hp === 1000);
  }
  {
    const { w, s, t: d } = range("ripper", 200, { dummies: 2 });
    const d2 = w.enemies[1];
    Object.assign(d2, { x: d.x + 100, y: d.y, hp: 1000, maxHp: 1000 });
    run(w, { fire: true, aimX: 2400, aimY: 2000 }, 1);
    run(w, {}, 30);
    t.ok("pierce passes through one body into the next", d.hp < 1000 && d2.hp < 1000);
  }
  {
    const { w, t: d } = range("seeker", 300);
    d.y = 2150; // off the line of fire
    run(w, { fire: true, aimX: 2400, aimY: 2000 }, 1);
    run(w, {}, 60);
    t.ok("homing turns onto a target off the line", d.hp < 1000);
  }
  {
    // A round stops at a rock and pushes it — slightly.
    const w = empty({ weapons: ["carbine"] });
    const s = w.soldiers[0];
    Object.assign(s, { x: 2000, y: 2000 });
    const rock = makeAsteroid(makeRng(2), 2300, 2000, 60);
    rock.vx = rock.vy = 0;
    w.asteroids.push(rock);
    run(w, { fire: true, aimX: 2400, aimY: 2000 }, 1);
    run(w, {}, 30);
    t.ok("a round stops at a rock", w.projectiles.length === 0);
    t.ok("and pushes it slightly", rock.vx > 0 && rock.vx < 10);
    // A blast on a rock pushes it hard (explosive rounds detonate on terrain).
    const g = empty({ weapons: ["grenade_launcher"] });
    const gs = g.soldiers[0];
    Object.assign(gs, { x: 2000, y: 2000 });
    const rock2 = makeAsteroid(makeRng(2), 2300, 2000, 60);
    rock2.vx = rock2.vy = 0;
    g.asteroids.push(rock2);
    run(g, { firePress: true, aimX: 2400, aimY: 2000 }, 1);
    run(g, {}, 30);
    t.ok("a blast pushes a rock far harder than a round", rock2.vx > rock.vx * 10);
  }

  // ---- S3: ruins, artifact, extraction -----------------------------------------
  {
    let ruinsOk = true, clearOk = true, artOk = true, exOk = true;
    for (let seed = 1; seed <= 40; seed++) {
      const w = createWorld(seed);
      if (w.ruins.length < CFG.ruinsMin || w.ruins.length > CFG.ruinsMax) ruinsOk = false;
      for (const r of w.ruins) for (const a of w.asteroids) if (Math.hypot(a.x - r.x, a.y - r.y) < r.R + a.r) clearOk = false;
      const host = w.artifact.ruin;
      if (!host || Math.hypot(w.artifact.x - host.x, w.artifact.y - host.y) > host.R) artOk = false;
      if (Math.hypot(w.extract.x - w.start.x, w.extract.y - w.start.y) < CFG.extractMinDist) exOk = false;
    }
    t.ok("3–5 ruins per field (40 seeds)", ruinsOk);
    t.ok("no asteroid spawns inside a ruin (40 seeds)", clearOk);
    t.ok("the artifact is inside a ruin (40 seeds)", artOk);
    t.ok("extraction is at least half the map from the start (40 seeds)", exOk);
  }
  {
    // Every breach and door is wider than a soldier: a soldier-sized circle
    // at its centre touches no wall. Sizes span the generator's range.
    let ok = true, count = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const w = empty();
      w.rng = makeRng(seed);
      const r = addRuin(w, 2000, 2000, seed, 340 + (seed % 5) * 30, 170 + (seed % 3) * 25);
      for (const [ox, oy] of r.openings) {
        count++;
        for (const wall of r.walls) {
          const [cx, cy] = closestOnWall(wall, ox, oy);
          if (Math.hypot(ox - cx, oy - cy) < CFG.soldierR + wall.t) ok = false;
        }
      }
    }
    t.ok(`every opening fits a soldier (${count} openings)`, ok);
  }
  {
    const w = empty();
    const s = w.soldiers[0];
    const wall = { kind: "wall", x0: 2300, y0: 1800, x1: 2300, y1: 2200, t: CFG.wallHalf };
    w.ruins.push({ x: 2300, y: 2000, R: 210, walls: [wall] });
    w.walls.push(wall);
    Object.assign(s, { x: 2000, y: 2000, vx: 1200, vy: 0 });
    run(w, {}, 60);
    t.ok("a soldier at 1200px/s bounces off a hull plate", s.x < 2300 && s.vx < 0);
    t.eq("segWall: a round crossing the plate hits it", segWall(2280, 2000, 2320, 2000, wall, 2) !== null, true);
    t.eq("segWall: a round beside the plate misses it", segWall(2280, 2300, 2320, 2300, wall, 2), null);
    s.x = 2000; s.vx = 0; s.fireCd = 0;
    run(w, { fire: true, aimX: 2400, aimY: 2000 }, 1);
    run(w, {}, 30);
    t.eq("a round stops at a hull plate", w.projectiles.length, 0);
  }
  {
    const w = createWorld(3, { squad: 2, asteroids: 0, dummies: 0 });
    const [a, b] = w.soldiers;
    const art = w.artifact;
    Object.assign(a, { x: art.x, y: art.y, vx: 0, vy: 0 });
    run(w, {}, 1);
    t.ok("touching the artifact picks it up", art.carrier === a);
    hurt(w, a, 999);
    run(w, {}, 1);
    t.ok("the carrier dies: the artifact drops where they fell", art.carrier === null && near(art.x, a.x, 1e-9));
    t.ok("one soldier left: the mission goes on", !w.end);
    Object.assign(b, { x: art.x, y: art.y, vx: 0, vy: 0 });
    run(w, {}, 1);
    t.ok("anyone can pick it up again", art.carrier === b);
    Object.assign(b, { x: w.extract.x, y: w.extract.y });
    run(w, {}, 1);
    t.ok("carrier inside extraction: success", w.end && w.end.success === true);
  }
  {
    const w = createWorld(3, { squad: 2, asteroids: 0, dummies: 0 });
    Object.assign(w.soldiers[0], { x: w.extract.x, y: w.extract.y });
    run(w, {}, 5);
    t.ok("extraction without the artifact does nothing", !w.end);
    for (const s of w.soldiers) hurt(w, s, 999);
    run(w, {}, 1);
    t.ok("squad dead: failure", w.end && w.end.success === false);
  }

  // ---- determinism ---------------------------------------------------------
  {
    const trace = (i) => ({ turn: i % 90 < 30 ? 1 : 0, thrust: i % 50 < 35, aimX: 2000, aimY: 2000, fire: i % 7 < 3, firePress: i % 7 === 0 });
    const a = createWorld(42, { squad: 3 });
    const b = createWorld(42, { squad: 3 });
    run(a, trace, 900);
    run(b, trace, 900);
    const sig = (w) => JSON.stringify([w.soldiers.map((s) => [s.x, s.y, s.hp]), w.asteroids.map((o) => [o.x, o.y])]);
    t.ok("same seed + same trace = same world", sig(a) === sig(b));
  }

  // ---- view smoke ----------------------------------------------------------
  {
    const w = createWorld(5, { squad: 3 });
    run(w, { thrust: true, turn: 1 }, 30);
    let threw = null;
    try { draw(ctx2d(), createView(), w, 960, 540, 1 / 60); } catch (e) { threw = e; }
    t.ok(`view draws a world${threw ? ": " + threw.message : ""}`, !threw);
  }
}
