// space3d — the space prototype in first person (tech/space-fps.md). Drives
// src/space3d/sim.js headlessly with scripted input.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CFG, createWorld, step, collide, makeAsteroid, lookOf, upOf, controlled } from "../src/space3d/sim.js";
import { makeRng } from "../src/space/sim.js";
import { dot, len, norm, sub, qrot } from "../src/space3d/vec.js";
import { eyeOf, project } from "../src/space3d/camera.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const P = (o) => [o.x, o.y, o.z];
const V = (o) => [o.vx, o.vy, o.vz];

// A world with nothing in it but the squad, for mechanics tests.
function empty(opts = {}) {
  return createWorld(7, { asteroids: 0, ruins: 0, objective: false, enemies: 0, waveEvery: 1e9, dummies: 0, ...opts });
}
// One soldier, still, at the cube's centre.
function centred(opts) {
  const w = empty(opts);
  const s = w.soldiers[0];
  Object.assign(s, { x: 3000, y: 3000, z: 3000, vx: 0, vy: 0, vz: 0 });
  return { w, s };
}
const run = (w, input, n) => { for (let i = 0; i < n; i++) step(w, input); };

export default async function suite(t) {
  // ---- isolation -----------------------------------------------------------------
  {
    const dir = join(ROOT, "src/space3d");
    const outside = [];
    const ok = new Set(["../space/sim.js", "../space/audio.js"]);
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
      for (const m of readFileSync(join(dir, f), "utf8").matchAll(/from\s+["']([^"']+)["']/g)) {
        const three = m[1] === "three" || m[1].startsWith("three/addons/");
        if (!m[1].startsWith("./") && !ok.has(m[1]) && !(three && f === "view3d.js")) outside.push(`${f} → ${m[1]}`);
      }
    }
    t.ok(`src/space3d imports only itself and the 2D sim and sound${outside.length ? ": " + outside.join(", ") : ""}`, outside.length === 0);
    const game = [];
    for (const d of ["src/game", "src/mission", "src/hub", "src/space"]) {
      for (const f of readdirSync(join(ROOT, d)).filter((f) => f.endsWith(".js"))) {
        if (/(from|import\()\s*["'][^"']*space3d\//.test(readFileSync(join(ROOT, d, f), "utf8"))) game.push(`${d}/${f}`);
      }
    }
    t.ok(`nothing imports src/space3d${game.length ? ": " + game.join(", ") : ""}`, game.length === 0);
  }

  // ---- F1: flight ------------------------------------------------------------------
  {
    const w = createWorld(3);
    t.ok("F1: a field of rocks in the cube", w.asteroids.length >= CFG.asteroidCount * 0.9);
    t.ok("F1: every rock is inside the cube", w.asteroids.every((a) => [a.x, a.y, a.z].every((c) => c >= a.r && c <= w.size - a.r)));
    const s = w.soldiers[0];
    t.ok("F1: the start is clear of rocks", w.asteroids.every((a) => Math.hypot(a.x - s.x, a.y - s.y, a.z - s.z) >= CFG.startClear + a.r));
    const toC = norm([3000 - s.x, 3000 - s.y, 3000 - s.z]);
    t.ok("F1: the soldier starts facing the cube's centre", dot(lookOf(s), toC) > 0.999);
  }
  {
    const { w, s } = centred();
    s.vx = 120; s.vy = -40; s.vz = 75;
    run(w, {}, 300);
    t.ok("F1: drift keeps its velocity", near(s.vx, 120, 1e-9) && near(s.vy, -40, 1e-9) && near(s.vz, 75, 1e-9));
    t.ok("F1: and moves the body by it", near(s.x, 3000 + 120 * 5, 1e-6) && near(s.z, 3000 + 75 * 5, 1e-6));
  }
  {
    const { w, s } = centred();
    const f = lookOf(s);
    run(w, { jet: [0, 0, 1] }, 60);
    const v = V(s);
    t.ok("F1: W pushes along the look at full thrust", near(dot(v, f), CFG.thrust, 1e-6) && near(len(v), CFG.thrust, 1e-6));
    run(w, { jet: [0, 0, 1] }, 60);
    t.ok("F1: no speed cap", near(len(V(s)), 2 * CFG.thrust, 1e-6));
  }
  {
    const cases = [["S", [0, 0, -1], [0, 0, 1]], ["D", [1, 0, 0], [1, 0, 0]], ["A", [-1, 0, 0], [-1, 0, 0]], ["Space", [0, 1, 0], [0, 1, 0]], ["C", [0, -1, 0], [0, -1, 0]]];
    for (const [key, jet, local] of cases) {
      const { w, s } = centred();
      const axis = qrot(s.q, local);
      run(w, { jet }, 60);
      t.ok(`F1: ${key} pushes along its own axis at ${CFG.jetSide} of the thrust`, near(dot(V(s), axis), CFG.thrust * CFG.jetSide, 1e-6) && near(len(V(s)), CFG.thrust * CFG.jetSide, 1e-6));
    }
  }
  {
    const { w, s } = centred();
    const r0 = qrot(s.q, [1, 0, 0]);
    step(w, { look: [Math.PI / 2, 0] });
    t.ok("F1: a yaw right of 90° turns the look to where the right side was", near(dot(lookOf(s), r0), 1, 1e-9));
    const { w: w2, s: s2 } = centred();
    const fa = lookOf(s2), ua = upOf(s2);
    step(w2, { look: [0, 0.4] });
    t.ok("F1: a pitch up turns the look toward up", near(dot(lookOf(s2), ua), Math.sin(0.4), 1e-9) && near(dot(lookOf(s2), fa), Math.cos(0.4), 1e-9));
    const { w: w3, s: s3 } = centred();
    const fb = lookOf(s3), ub = upOf(s3);
    run(w3, { roll: 1 }, 30);
    t.ok("F1: a roll keeps the look and turns up about it", near(dot(lookOf(s3), fb), 1, 1e-9) && near(dot(upOf(s3), ub), Math.cos(CFG.rollRate * 0.5), 1e-9));
  }
  {
    // Two rocks meet head on: momentum is conserved.
    const rng = makeRng(1);
    const a = makeAsteroid(rng, 100, 100, 100, 50);
    const b = makeAsteroid(rng, 180, 120, 90, 60);
    Object.assign(a, { vx: 30, vy: 5, vz: -4 });
    Object.assign(b, { vx: -20, vy: 0, vz: 7 });
    const p0 = [a.m * a.vx + b.m * b.vx, a.m * a.vy + b.m * b.vy, a.m * a.vz + b.m * b.vz];
    t.ok("F1: overlapping rocks collide", collide(a, b));
    const p1 = [a.m * a.vx + b.m * b.vx, a.m * a.vy + b.m * b.vy, a.m * a.vz + b.m * b.vz];
    t.ok("F1: momentum is conserved", p0.every((c, i) => near(c, p1[i], 1e-6)));
    t.ok("F1: and they separate", Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) >= a.r + b.r - 1e-9);
    t.ok("F1: rock mass is the 2D area rule", near(a.m, (50 / CFG.soldierR) ** 2 * CFG.asteroidDensity, 1e-9));
  }
  // A soldier flown into a still rock at speed v: what it costs.
  const crashAt = (v, r = 200) => {
    const { w, s } = centred({ asteroids: 0 });
    const rock = makeAsteroid(makeRng(2), 3000 + 600, 3000, 3000, r);
    Object.assign(rock, { vx: 0, vy: 0, vz: 0, w: [0, 0, 0], m: 1e9 });
    w.asteroids.push(rock);
    s.vx = v;
    run(w, {}, 120);
    return { w, s, rock };
  };
  {
    const { s } = crashAt(450);
    t.ok("F1: under crashSafe, a crash is free", s.hp === s.maxHp && s.vx < 0);
    const hit = crashAt(800).s;
    const want = ((800 - CFG.crashSafe) / (CFG.crashLethal - CFG.crashSafe)) * hit.maxHp;
    t.ok(`F1: at 800px/s the 2D curve costs ${want.toFixed(1)} HP`, near(hit.maxHp - hit.hp, want, 0.5));
    const dead = crashAt(1200);
    t.ok("F1: past crashLethal a crash kills", !dead.s.alive);
    t.ok("F1: a dead squad loses the mission", dead.w.end && dead.w.end.success === false);
  }
  {
    // Fast and small: the substeps hold a body out of a pebble.
    const { s, rock } = crashAt(3000, 30);
    t.ok("F1: no tunnelling through a small rock at 3000px/s", s.x < rock.x);
  }
  {
    const { w, s } = centred();
    Object.assign(s, { x: 40, vx: -300 });
    run(w, {}, 30);
    t.ok("F1: the cube's face bounces a body back, and costs nothing", s.vx > 0 && s.x >= s.r && s.hp === s.maxHp);
  }
  {
    // Same seed + same input = same world.
    const trace = (i) => ({ look: [Math.sin(i * 0.1) * 0.02, Math.cos(i * 0.07) * 0.01], jet: [i % 90 < 30 ? 1 : 0, 0, i % 50 < 25 ? 1 : 0], roll: i % 200 < 20 ? 1 : 0 });
    const end = () => {
      const w = createWorld(11);
      for (let i = 0; i < 900; i++) step(w, trace(i));
      return JSON.stringify([P(w.soldiers[0]), w.soldiers[0].q, w.soldiers[0].hp, w.asteroids.map(P)]);
    };
    t.eq("F1: same seed and input, same world", end(), end());
  }
  {
    // The eye: what is straight ahead projects to the screen's centre.
    const { w, s } = centred();
    const cam = eyeOf(w, 75, 16 / 9);
    const f = lookOf(s);
    const p = project(cam, [cam.pos[0] + f[0] * 500, cam.pos[1] + f[1] * 500, cam.pos[2] + f[2] * 500], 1280, 720);
    t.ok("F1: straight ahead is the crosshair", near(p.x, 640, 1e-6) && near(p.y, 360, 1e-6) && near(p.depth, 500, 1e-6));
    const u = upOf(s);
    const q = project(cam, [cam.pos[0] + f[0] * 500 + u[0] * 100, cam.pos[1] + f[1] * 500 + u[1] * 100, cam.pos[2] + f[2] * 500 + u[2] * 100], 1280, 720);
    t.ok("F1: up is up the screen", q.y < 360 && near(q.x, 640, 1e-6));
    t.ok("F1: the controlled soldier is the eye", eyeOf(w, 75, 1).body === controlled(w));
  }
}
