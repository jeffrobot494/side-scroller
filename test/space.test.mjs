// space — the standalone zero-g prototype (tech/space-prototype.md). Drives
// src/space/sim.js headlessly with scripted input; view.js gets a smoke draw.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ctx2d } from "./harness.mjs";
import { CFG, createWorld, step, collide, makeAsteroid, makeRng } from "../src/space/sim.js";
import { createView, draw } from "../src/space/view.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// A world with nothing in it but the squad, for mechanics tests.
function empty(opts = {}) {
  return createWorld(7, { asteroids: 0, ...opts });
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
