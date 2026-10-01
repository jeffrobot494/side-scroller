// space3d — the space prototype in first person (tech/space-fps.md). Drives
// src/space3d/sim.js headlessly with scripted input.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CFG, createWorld, step, collide, makeAsteroid, lookOf, upOf, controlled, fire, startReload, WEAPONS, hasLos, ruinToLocal, ruinToWorld, inPoly, hurt, bootsState, nearestSurface, shove, addRuin3 } from "../src/space3d/sim.js";
import { makeRng, addDerelict, LOADOUT as LOADOUT2, WEAPONS as WEAPONS2 } from "../src/space/sim.js";
import { makeEnemy, spawnGroup, spawnWave, placeWarden, ENEMY_TYPES, insideHull } from "../src/space3d/ai.js";
import { swapControl } from "../src/space3d/sim.js";
import { dot, len, norm, sub, qrot, qaxis, qmul, qconj, qlook, randomDir } from "../src/space3d/vec.js";
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
import { eyeOf, project } from "../src/space3d/camera.js";
import { createHud, hudEvents, drawHud } from "../src/space3d/hud.js";
import { ctx2d } from "./harness.mjs";

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

  // ---- F2: guns -------------------------------------------------------------------
  // A drone `d` px straight ahead of a still soldier at the centre, with HP to spare.
  const range = (weapon, d = 300) => {
    const w = empty({ weapons: [weapon], dummies: 1 });
    const s = w.soldiers[0];
    Object.assign(s, { x: 3000, y: 3000, z: 3000, vx: 0, vy: 0, vz: 0 });
    const f = lookOf(s);
    const t = w.enemies[0];
    Object.assign(t, { x: 3000 + f[0] * d, y: 3000 + f[1] * d, z: 3000 + f[2] * d, hp: 1000, maxHp: 1000 });
    t.home = [t.x, t.y, t.z];
    return { w, s, t, f };
  };
  {
    t.ok("F2: no target drones in play (a fixture since F5)", createWorld(3).enemies.every((e) => e.kind !== "dummy"));
    const w = createWorld(3, { dummies: 4, enemies: 0 });
    t.ok("F2: the fixture puts four round the start", w.enemies.filter((e) => e.kind === "dummy").length === 4);
  }
  {
    const { w, s, t: d } = range("carbine");
    step(w, { firePress: true, fire: true });
    const p = w.projectiles[0];
    t.ok("F2: a carbine round leaves along the look", w.projectiles.length === 1 && dot(norm(V(p)), lookOf(s)) > Math.cos(WEAPONS.carbine.spread + (1 - (8 - 1) / 9) * CFG.aimSpread + 1e-9));
    t.ok("F2: and uses a round", s.ammo === WEAPONS.carbine.magazine - 1);
    run(w, {}, 40);
    t.ok("F2: it hits the drone for 14 × playerDamageMult", near(d.maxHp - d.hp, 14 * CFG.playerDamageMult, 1e-9));
  }
  {
    // Spread is a cone: over many rounds no direction leaves it, and they fill it.
    const { w, s } = range("carbine");
    s.stats.aim = 1;
    const f = lookOf(s);
    let worst = 0, sum = 0;
    for (let i = 0; i < 400; i++) {
      s.fireCd = 0; s.ammo = 10;
      fire(w, s, f, 0);
      const p = w.projectiles.pop();
      const a = Math.acos(Math.min(1, dot(norm(V(p)), f)));
      worst = Math.max(worst, a);
      sum += a;
    }
    const cone = WEAPONS.carbine.spread + CFG.aimSpread;
    t.ok(`F2: spread stays inside its ${cone.toFixed(2)} rad cone`, worst <= cone + 1e-9);
    t.ok("F2: and an even disc fills it (mean ⅔ of the half-angle)", near(sum / 400 / cone, 2 / 3, 0.05));
  }
  {
    const { w, s } = range("carbine");
    s.ammo = 0;
    step(w, { firePress: true, fire: true });
    t.ok("F2: an empty magazine fires nothing", w.projectiles.length === 0 && w.events.some((e) => e.type === "dry"));
    step(w, { reload: true });
    run(w, {}, Math.ceil(WEAPONS.carbine.reloadTime * 60) + 1);
    t.ok("F2: reload fills it from a spare", s.ammo === WEAPONS.carbine.magazine && s.magsLeft === CFG.soldierMagazines - 2);
    s.ammo = 3; s.magsLeft = 0;
    t.ok("F2: with no spares, reload does nothing", !startReload(s, w) && s.reloading === 0);
  }
  {
    // Semi-auto takes the press; auto takes the hold.
    const { w, s } = range("grenade_launcher", 2000);
    run(w, { fire: true }, 60);
    t.ok("F2: holding a semi-auto trigger fires nothing", w.projectiles.length === 0);
    const r2 = range("carbine", 2000);
    run(r2.w, { fire: true }, 60);
    t.ok("F2: holding an automatic fires at its rate", near(WEAPONS.carbine.magazine - r2.s.ammo, WEAPONS.carbine.fireRate, 1));
  }
  {
    const { w, t: d } = range("ember_jet", 200);
    step(w, { firePress: true, fire: true });
    run(w, {}, 20);
    const hp = d.hp;
    t.ok("F2: ember jet sets the drone burning", !!d.burn);
    run(w, {}, 30);
    t.ok("F2: and the burn hurts over time", d.hp < hp);
  }
  {
    const { w, t: d } = range("stun_pistol", 200);
    step(w, { firePress: true });
    run(w, {}, 20);
    t.ok("F2: stun pistol slows by half", d.slow && d.slow.factor === 0.5);
  }
  {
    const { w, t: d, f } = range("bulldog", 200);
    step(w, { firePress: true });
    run(w, {}, 15);
    const sh = [d.sx, d.sy, d.sz];
    t.ok("F2: bulldog knocks the drone along the round's line", len(sh) > 100 && dot(norm(sh), f) > 0.98);
    run(w, {}, 120);
    t.ok("F2: and the shove decays to nothing", d.sx === 0 && d.sy === 0 && d.sz === 0);
  }
  {
    // Chain: two more drones near the first.
    const { w, t: d, f } = range("arc_tazer", 200);
    const extra = w.enemies.length;
    const c = createWorld(7, { asteroids: 0, dummies: 2 }).enemies;
    for (const [i, o] of c.entries()) {
      Object.assign(o, { x: d.x + (i + 1) * 150, y: d.y, z: d.z, hp: 1000, maxHp: 1000 });
      w.enemies.push(o);
    }
    step(w, { firePress: true, fire: true });
    run(w, {}, 20);
    const hit = w.enemies.slice(extra).filter((o) => o.hp < 1000).length;
    t.ok("F2: arc tazer chains to two more drones", hit === 2);
  }
  {
    const { w, s } = range("grenade_launcher", 2000);
    const rock = makeAsteroid(makeRng(4), 0, 0, 0, 100);
    const f = lookOf(s);
    Object.assign(rock, { x: 3000 + f[0] * 400, y: 3000 + f[1] * 400, z: 3000 + f[2] * 400, vx: 0, vy: 0, vz: 0, w: [0, 0, 0] });
    w.asteroids.push(rock);
    step(w, { firePress: true });
    run(w, {}, 40);
    t.ok("F2: a grenade stops at a rock and detonates there", w.projectiles.length === 0 && w.events.some((e) => e.type === "explode"));
    t.ok("F2: and the blast pushes the rock away", dot(V(rock), f) > 0);
    t.ok("F2: a rock blocks the line of sight", !hasLos(w, s, w.enemies[0]));
  }
  {
    const { w, s } = range("carbine", 2000);
    const rock = makeAsteroid(makeRng(4), 0, 0, 0, 40);
    const f = lookOf(s);
    Object.assign(rock, { x: 3000 + f[0] * 300, y: 3000 + f[1] * 300, z: 3000 + f[2] * 300, vx: 0, vy: 0, vz: 0, w: [0, 0, 0] });
    w.asteroids.push(rock);
    step(w, { firePress: true, fire: true });
    run(w, {}, 30);
    t.ok("F2: a round pushes a rock slightly (bulletPush / mass)", near(len(V(rock)), CFG.bulletPush / rock.m, 1e-6) && dot(norm(V(rock)), f) > 0.95);
  }
  {
    const { w, t: d } = range("ripper", 200);
    const back = createWorld(7, { asteroids: 0, dummies: 1 }).enemies[0];
    const f = lookOf(w.soldiers[0]);
    Object.assign(back, { x: d.x + f[0] * 100, y: d.y + f[1] * 100, z: d.z + f[2] * 100, hp: 1000, maxHp: 1000 });
    w.enemies.push(back);
    step(w, { firePress: true, fire: true });
    run(w, {}, 30);
    t.ok("F2: a ripper round pierces one drone into the next", d.hp < 1000 && back.hp < 1000);
  }
  {
    const { w, t: d } = range("scattergun", 200);
    step(w, { firePress: true });
    t.ok("F2: a scattergun fires five pellets", w.projectiles.length === 5);
  }
  {
    // Homing: a seeker fired 90° off still finds the drone.
    const { w, s, t: d } = range("seeker", 500);
    const side = qrot(s.q, [1, 0, 0]);
    s.fireCd = 0;
    fire(w, s, side, 1);
    run(w, {}, 150);
    t.ok("F2: a seeker turns onto its target", d.hp < 1000);
  }
  {
    const { w, t: d } = range("carbine", 200);
    d.hp = 5;
    step(w, { firePress: true, fire: true });
    run(w, {}, 20);
    t.ok("F2: a killed drone comes back after its respawn", !d.alive);
    run(w, {}, Math.ceil(CFG.dummyRespawn * 60) + 2);
    t.ok("F2: …at full HP", d.alive && d.hp === CFG.dummyHp);
  }

  // ---- F3: derelicts, artifact, extraction ---------------------------------------------
  {
    let ruins = 0, holesOk = true, breached = true, artOk = true, exOk = true;
    for (let seed = 1; seed <= 12; seed++) {
      const w = createWorld(seed);
      ruins += w.ruins.length;
      for (const r of w.ruins) {
        // Every 2D opening (doors + breaches) became a hole.
        const doors = r.holes.filter((h) => !h.breach).length;
        if (doors < 6) holesOk = false;
        if (!r.holes.some((h) => h.breach)) breached = false;
      }
      const a = w.artifact, r = a.ruin;
      const l = ruinToLocal(r, [a.x, a.y, a.z]);
      if (!inPoly(r.hull, l[0], l[1]) || Math.abs(l[2]) > r.H / 2 - 20) artOk = false;
      const st = w.start, ex = w.extract;
      if (Math.hypot(ex.x - st.x, ex.y - st.y, ex.z - st.z) < CFG.extractMinDist) exOk = false;
      if (w.asteroids.some((o) => w.ruins.some((q) => Math.hypot(o.x - q.x, o.y - q.y, o.z - q.z) < q.R + o.r))) exOk = false;
    }
    t.ok(`F3: 3–5 derelicts per field (${ruins} over 12)`, ruins >= 36 && ruins <= 60);
    t.ok("F3: every bulkhead door became a hole", holesOk);
    t.ok("F3: every derelict has a breach", breached);
    t.ok("F3: the artifact floats inside its derelict", artOk);
    t.ok("F3: extraction is at least half the cube from the start, and no rock sits in a hull", exOk);
  }
  // A soldier `back` px outside a derelict's breach, still, facing it.
  const atBreach = (seed = 1, back = 300) => {
    const w = createWorld(seed, { asteroids: 0, enemies: 0, dummies: 0, waveEvery: 1e9 });
    const r = w.ruins[0];
    const h = r.holes.find((o) => o.breach);
    const out = norm(qrot(r.q, [h.at[0], h.at[1], 0]));
    // The hull normal at the breach: straight out of the wall.
    const sd = r.solids.find((o) => o.kind === "wall" && Math.hypot((o.a[0] + o.b[0]) / 2 - h.at[0], (o.a[1] + o.b[1]) / 2 - h.at[1]) < 1);
    let n = [-(sd.b[1] - sd.a[1]), sd.b[0] - sd.a[0], 0];
    if (n[0] * h.at[0] + n[1] * h.at[1] < 0) n = [-n[0], -n[1], 0];
    const nw = norm(qrot(r.q, n));
    const at = ruinToWorld(r, h.at);
    const s = w.soldiers[0];
    Object.assign(s, { x: at[0] + nw[0] * back, y: at[1] + nw[1] * back, z: at[2] + nw[2] * back, vx: 0, vy: 0, vz: 0 });
    return { w, r, s, at, nw, out };
  };
  {
    const { w, r, s, nw } = atBreach();
    s.vx = -nw[0] * 300; s.vy = -nw[1] * 300; s.vz = -nw[2] * 300;
    run(w, {}, 120);
    const l = ruinToLocal(r, [s.x, s.y, s.z]);
    t.ok("F3: a soldier flies in through a breach", inPoly(r.hull, l[0], l[1]) && Math.abs(l[2]) < r.H / 2 && s.hp === s.maxHp);
  }
  {
    // The same run 120px along the hull from the breach meets plate.
    for (const v of [300, 2400]) {
      const { w, r, s, nw } = atBreach();
      const along = norm(qrot(r.q, [0, 0, 1]));
      s.x += along[0] * 120; s.y += along[1] * 120; s.z += along[2] * 120;
      s.vx = -nw[0] * v; s.vy = -nw[1] * v; s.vz = -nw[2] * v;
      s.hp = s.maxHp = 1e6;
      run(w, {}, 90);
      const l = ruinToLocal(r, [s.x, s.y, s.z]);
      t.ok(`F3: at ${v}px/s, the hull above the breach stops a soldier`, !(inPoly(r.hull, l[0], l[1]) && Math.abs(l[2]) < r.H / 2));
    }
    const { w, s, nw } = atBreach();
    const along = norm(qrot(w.ruins[0].q, [0, 0, 1]));
    s.x += along[0] * 120; s.y += along[1] * 120; s.z += along[2] * 120;
    s.vx = -nw[0] * 800; s.vy = -nw[1] * 800; s.vz = -nw[2] * 800;
    run(w, {}, 90);
    t.ok("F3: hull plate counts as a crash", s.hp < s.maxHp);
  }
  {
    // Rounds and sight: through the breach yes, through the plate no.
    const { w, s, at, nw, r } = atBreach();
    const inside = { x: at[0] - nw[0] * 120, y: at[1] - nw[1] * 120, z: at[2] - nw[2] * 120 };
    t.ok("F3: a line of sight passes a breach", hasLos(w, s, inside));
    const along = norm(qrot(r.q, [0, 0, 1]));
    const blocked = { x: inside.x + along[0] * 120, y: inside.y + along[1] * 120, z: inside.z + along[2] * 120 };
    const from = { x: s.x + along[0] * 120, y: s.y + along[1] * 120, z: s.z + along[2] * 120 };
    t.ok("F3: hull plate blocks it", !hasLos(w, from, blocked));
    const f = norm([blocked.x - from.x, blocked.y - from.y, blocked.z - from.z]);
    Object.assign(s, from);
    s.fireCd = 0;
    fire(w, s, f, 1);
    run(w, {}, 40);
    t.ok("F3: and stops a round", w.projectiles.length === 0 && w.events.some((e) => e.type === "spark"));
  }
  {
    const w = createWorld(2, { asteroids: 0, enemies: 0, dummies: 0, waveEvery: 1e9, squad: 1 });
    const s = w.soldiers[0], a = w.artifact;
    Object.assign(s, { x: a.x, y: a.y, z: a.z });
    step(w, {});
    t.ok("F3: touching the artifact picks it up", a.carrier === s && w.events.some((e) => e.type === "pickup"));
    Object.assign(s, { x: w.extract.x, y: w.extract.y, z: w.extract.z });
    step(w, {});
    t.ok("F3: holding it in the extraction zone wins", w.end && w.end.success === true);
  }
  {
    const w = createWorld(2, { asteroids: 0, enemies: 0, dummies: 0, waveEvery: 1e9, squad: 1 });
    const s = w.soldiers[0], a = w.artifact;
    Object.assign(s, { x: w.extract.x, y: w.extract.y, z: w.extract.z });
    step(w, {});
    t.ok("F3: extraction without the artifact is not a win", !w.end);
  }

  // ---- F4: magnetic boots -------------------------------------------------------------
  // A soldier `gap` px off a still rock of radius r at the centre, along dir.
  const onRock = (r = 200, gap = 25, dir = [0, 1, 0], spin = [0, 0, 0]) => {
    const w = empty();
    const rock = makeAsteroid(makeRng(9), 3000, 3000, 3000, r);
    Object.assign(rock, { vx: 0, vy: 0, vz: 0, w: spin });
    w.asteroids.push(rock);
    const s = w.soldiers[0];
    const k = r + s.r + gap;
    Object.assign(s, { x: 3000 + dir[0] * k, y: 3000 + dir[1] * k, z: 3000 + dir[2] * k, vx: 0, vy: 0, vz: 0 });
    return { w, s, rock };
  };
  const landed = (w, s, n = 180) => { for (let i = 0; i < n && s.boots !== "ground"; i++) step(w, {}); return s.boots === "ground"; };
  {
    const { w, s } = onRock(200, 60);
    t.ok("F4: 60px off a rock, Shift does nothing", (step(w, { boots: true }), !s.boots) && bootsState(w, s) === null);
    const r2 = onRock(200, 25, [1, 0, 0]);
    t.ok("F4: within 40px the boots are ready", bootsState(r2.w, r2.s) === "ready");
    step(r2.w, { boots: true });
    t.ok("F4: Shift clamps on, in any direction (F12)", r2.s.boots === "air");
    t.ok("F4: the pull turns the feet to the rock and lands it", landed(r2.w, r2.s) && dot(upOf(r2.s), [1, 0, 0]) > 0.999);
    t.ok("F4: landing that close is free", r2.s.hp === r2.s.maxHp);
    t.ok("F4: standing, the body's centre sits a radius off the rock", near(Math.hypot(r2.s.x - 3000, r2.s.y - 3000, r2.s.z - 3000), 200 + r2.s.r, 1e-6));
  }
  {
    // Landing never snaps the eye: up jumps to the normal, the eye eases there.
    const { w, s } = onRock(200, 25, [0, 1, 0]);
    s.q = qlook([0, -1, 0], [1, 0, 0]); // looking straight at the rock, feet sideways
    step(w, { boots: true });
    let worst = 0;
    let cam = qmul(s.q, s.viewOff);
    for (let i = 0; i < 120; i++) {
      step(w, {});
      const c = qmul(qmul(s.q, qaxis([1, 0, 0], s.pitch)), s.viewOff);
      worst = Math.max(worst, 2 * Math.acos(Math.min(1, Math.abs(dot4(c, cam)))));
      cam = c;
    }
    t.ok(`F4: landing face-first turns the eye smoothly (worst ${worst.toFixed(3)} rad a step)`, s.boots === "ground" && worst < 0.35);
    t.ok("F4: and settles with up on the normal", dot(upOf(s), [0, 1, 0]) > 0.999 && Math.abs(s.viewOff[3]) > 0.9999);
  }
  {
    // Walk all the way round a rock: back where it started.
    const { w, s } = onRock(150, 25, [0, 1, 0]);
    step(w, { boots: true });
    landed(w, s);
    const p0 = P(s);
    const circ = 2 * Math.PI * (150 + s.r);
    const n = Math.round(circ / (CFG.walkSpeed / 60));
    let maxOff = 0;
    for (let i = 0; i < n + 400; i++) {
      step(w, { jet: [0, 0, 1] });
      maxOff = Math.max(maxOff, Math.abs(Math.hypot(s.x - 3000, s.y - 3000, s.z - 3000) - 150 - s.r));
    }
    t.ok("F4: walking stays on the rock's surface", maxOff < 1e-6 && s.boots === "ground");
    const w2 = onRock(150, 25, [0, 1, 0]);
    step(w2.w, { boots: true });
    landed(w2.w, w2.s);
    const a0 = P(w2.s);
    const fwd = lookOf(w2.s);
    const tot = Math.round((2 * Math.PI * (150 + 18)) / (CFG.walkSpeed / 60));
    // Walk at full speed (after the run-up) a whole circumference, then stop.
    let walked = 0;
    for (let i = 0; walked < 2 * Math.PI * 168 && i < 5000; i++) {
      step(w2.w, { jet: [0, 0, 1] });
      walked += Math.hypot(w2.s.gv[0], w2.s.gv[1]) / 60;
    }
    t.ok("F4: a full circumference walked comes back to the start", Math.hypot(w2.s.x - a0[0], w2.s.y - a0[1], w2.s.z - a0[2]) < 12);
  }
  {
    // A spinning rock carries you round with it.
    const { w, s, rock } = onRock(200, 25, [0, 1, 0], [0, 0, 0.15]);
    step(w, { boots: true });
    landed(w, s);
    const l0 = qrot(qconj(rock.q), norm(sub(P(s), P(rock))));
    run(w, {}, 300);
    const l1 = qrot(qconj(rock.q), norm(sub(P(s), P(rock))));
    t.ok("F4: standing, a spinning rock carries you (same spot in its frame)", dot(l0, l1) > 0.99999 && s.boots === "ground");
  }
  {
    const { w, s } = onRock(200, 25, [0, 1, 0]);
    step(w, { boots: true });
    landed(w, s);
    run(w, { jet: [0, 0, 1], up: true }, 30);
    t.ok("F4: the jetpack does nothing with the boots on", s.boots === "ground" && !s.thrusting);
    step(w, { upPress: true, up: true });
    t.ok("F4: Space jumps off along up", s.boots === "air" && dot(V(s), upOf(s)) > CFG.jumpSpeed * 0.9);
    let peak = 0;
    for (let i = 0; i < 240 && s.boots !== "ground"; i++) { step(w, {}); peak = Math.max(peak, Math.hypot(s.x - 3000, s.y - 3000, s.z - 3000) - 218); }
    t.ok(`F4: and the boots pull it back down (peak ${peak.toFixed(0)}px)`, s.boots === "ground" && peak > 60 && s.hp === s.maxHp);
  }
  {
    const { w, s } = onRock(200, 25, [0, 1, 0]);
    step(w, { boots: true });
    landed(w, s);
    shove(s, 0, 400, 0);
    step(w, {});
    t.ok("F4: a shove knocks a standing body off", s.boots === "air");
    const r2 = onRock(200, 25, [0, 1, 0]);
    step(r2.w, { boots: true });
    landed(r2.w, r2.s);
    step(r2.w, { upPress: true });
    r2.s.vy = 1500;
    run(r2.w, {}, 60);
    t.ok("F4: past bootsHold the boots let go", r2.s.boots === null);
  }
  {
    // 20px over a rock at 650px/s: the pull makes it about 708 at contact.
    const dive = (up) => {
      const { w, s } = onRock(200, 20, [0, 1, 0]);
      s.q = qlook(up[1] ? [1, 0, 0] : [0, -1, 0], up);
      s.vy = -650;
      step(w, { boots: true });
      landed(w, s, 30);
      run(w, {}, 30);
      return s;
    };
    const feet = dive([0, 1, 0]);
    t.ok("F4: feet-first at about 700 lands safely (landSafe 750)", feet.boots === "ground" && feet.hp === feet.maxHp);
    const side = dive([1, 0, 0]);
    t.ok("F4: side-on at the same speed is a crash (crashSafe 500)", side.hp < side.maxHp);
  }
  {
    // On a derelict: land on the hull, walk across it and over an edge; never inside a slab.
    const w = empty();
    const lay = addDerelict({ rng: makeRng(5), walls: [], ruins: [], keepClear: [] }, 0, 0, 0, 1200, 560);
    const r = addRuin3(w, lay, 3000, 3000, 3000, qaxis(norm([0.3, 1, 0.2]), 0.7), 280);
    const s = w.soldiers[0];
    const top = ruinToWorld(r, [100, -60, 140 + 6 + 18 + 20]);
    Object.assign(s, { x: top[0], y: top[1], z: top[2], vx: 0, vy: 0, vz: 0 });
    step(w, { boots: true });
    t.ok("F4: lands on a derelict's ceiling plate", landed(w, s) && s.ground.kind === "plate");
    const up0 = upOf(s);
    t.ok("F4: up is the plate's normal", dot(up0, qrot(r.q, [0, 0, 1])) > 0.999);
    let inside = 0, kinds = new Set(), minGap = Infinity;
    for (let i = 0; i < 900; i++) {
      step(w, { jet: [0, 0, 1], look: [i % 300 === 0 ? 0.6 : 0, 0] });
      const l = ruinToLocal(r, P(s));
      for (const sd of r.solids) {
        const d = surfDistT(sd, l);
        minGap = Math.min(minGap, d - s.r);
      }
      kinds.add(s.ground.kind + (s.ground.hull ? "-hull" : ""));
    }
    t.ok(`F4: walking a derelict never sinks into a slab (closest ${minGap.toFixed(3)})`, minGap > -0.01);
    t.ok(`F4: and carries over its edges onto other slabs (${[...kinds].join(", ")})`, kinds.size >= 2 && s.boots === "ground");
  }

  // ---- F5: enemies, waves, squad -----------------------------------------------------
  {
    let groups = 0, wardens = 0, guard = true, crews = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const w = createWorld(seed, { squad: 3 });
      wardens += w.enemies.filter((e) => e.type === "warden").length;
      crews += w.enemies.filter((e) => e.home).length;
      const host = w.artifact.ruin;
      if (!w.enemies.some((e) => e.type === "gunner" && near(Math.hypot(e.x - host.x, e.y - host.y, e.z - host.z), host.R + 60, 1))) guard = false;
      groups += w.enemies.length;
      const st = w.start;
      if (w.enemies.some((e) => !e.home && e.type !== "warden" && e !== w.enemies[0] && Math.hypot(e.x - st.x, e.y - st.y, e.z - st.z) < CFG.enemyStartGap - 60)) guard = false;
    }
    t.ok(`F5: two wardens per field (${wardens} over 10)`, wardens === 20);
    t.ok("F5: a gunner guards the artifact's hull; nothing placed near the start", guard);
    t.ok(`F5: derelicts are crewed (${crews} crew over 10 fields)`, crews > 30);
  }
  // One enemy of a type 300px ahead of a still soldier, alert.
  const facing = (type, d = 300, opts = {}) => {
    const w = empty(opts);
    const s = w.soldiers[0];
    Object.assign(s, { x: 3000, y: 3000, z: 3000, vx: 0, vy: 0, vz: 0, hp: 1e4, maxHp: 1e4 });
    const f = lookOf(s);
    const [e] = spawnGroup(w, type, 3000 + f[0] * d, 3000 + f[1] * d, 3000 + f[2] * d, true);
    return { w, s, e };
  };
  {
    const { w, s, e } = facing("charger", 200);
    let hits = 0;
    for (let i = 0; i < 240; i++) { const hp = s.hp; step(w, {}); if (s.hp < hp) hits++; }
    t.ok("F5: a charger closes and bites", hits >= 2);
    t.ok("F5: at most once per 0.6s", hits <= Math.floor(4 / 0.6) + 1);
  }
  {
    const { w, s, e } = facing("gunner", 340);
    let shots = 0, inBand = 0;
    for (let i = 0; i < 600; i++) {
      step(w, {});
      shots += w.events.filter((v) => v.type === "muzzle" && v.team === "enemy").length;
      w.events.length = 0;
      const d = Math.hypot(e.x - s.x, e.y - s.y, e.z - s.z);
      if (d >= 230 && d <= 450) inBand++;
    }
    t.ok(`F5: a gunner fires on its cadence (${shots} in 10s)`, shots >= 4 && shots <= 9);
    t.ok("F5: and holds its 260–420 band", inBand > 540);
  }
  {
    const { w, s, e } = facing("swarmer", 240);
    const ax = e.orbitAxis;
    let off = 0;
    run(w, {}, 120);
    for (let i = 0; i < 240; i++) { step(w, {}); const r = norm([e.x - s.x, e.y - s.y, e.z - s.z]); off = Math.max(off, Math.abs(dot(r, ax))); }
    t.ok("F5: a swarmer circles its target", Math.hypot(e.x - s.x, e.y - s.y, e.z - s.z) < 420);
    t.ok(`F5: on its own orbit plane (F8; worst ${off.toFixed(2)} off it)`, off < 0.5);
  }
  {
    const { w, s, e } = facing("minelayer", 500);
    run(w, {}, 60 * 6);
    const mines = w.enemies.filter((m) => m.type === "mine");
    t.ok(`F5: a mine-layer lays mines (${mines.length})`, mines.length >= 2 && mines.length <= ENEMY_TYPES.minelayer.maxMines + 2);
    const m = mines.find((o) => o.alive);
    Object.assign(s, { x: m.x + 50, y: m.y, z: m.z, hp: 100, maxHp: 100 });
    m.age = 5;
    run(w, {}, 40);
    t.ok("F5: a mine fuses on a soldier and blasts", !m.alive && s.hp < 100);
  }
  {
    const w = empty();
    const s = w.soldiers[0];
    Object.assign(s, { x: 5800, y: 5800, z: 5800 });
    const e = placeWarden(w);
    const route = e.route.map((p) => ({ ...p }));
    let reached = 0, lastLeg = e.leg;
    for (let i = 0; i < 60 * 90; i++) { step(w, {}); if (e.leg !== lastLeg) { reached++; lastLeg = e.leg; } }
    t.ok(`F5: a warden flies its patrol loop (${reached} waypoints in 90s)`, reached >= 3 && !e.alert);
  }
  {
    const w = empty({ squad: 3 });
    const before = w.enemies.length;
    w.wave.n = 0;
    spawnWave(w);
    const c = w.soldiers.reduce((a, s) => [a[0] + s.x / 3, a[1] + s.y / 3, a[2] + s.z / 3], [0, 0, 0]);
    const added = w.enemies.slice(before);
    const ds = added.map((e) => Math.hypot(e.x - c[0], e.y - c[1], e.z - c[2]));
    t.ok(`F5: a wave arrives alert, ${CFG.waveDistMin * 0.85 | 0}–${CFG.waveDistMax + 60}px out`, added.length > 0 && added.every((e) => e.alert) && ds.every((d) => d > CFG.waveDistMin * 0.8 && d < CFG.waveDistMax + 80));
  }
  {
    // Companions keep station off a leader drifting at 200px/s.
    const w = empty({ squad: 3 });
    const [lead, a, b] = w.soldiers;
    for (const s of w.soldiers) Object.assign(s, { x: 1500, y: 1500, z: 1500, vx: 0, vy: 0, vz: 0 });
    lead.vx = 200;
    let worst = 0;
    for (let i = 0; i < 60 * 15; i++) {
      step(w, {});
      if (i > 60 * 6) for (const c of [a, b]) {
        const p = [lead.x + c.station.dir[0] * c.station.d, lead.y + c.station.dir[1] * c.station.d, lead.z + c.station.dir[2] * c.station.d];
        worst = Math.max(worst, Math.hypot(c.x - p[0], c.y - p[1], c.z - p[2]));
      }
    }
    t.ok(`F5: companions hold station behind a moving leader (worst ${worst.toFixed(0)}px off)`, worst < 80);
  }
  {
    const w = empty({ squad: 3 });
    const [lead, a] = w.soldiers;
    const [e] = spawnGroup(w, "gunner", a.x + 300, a.y, a.z, false);
    e.hp = e.maxHp = 1e4;
    run(w, {}, 120);
    t.ok("F5: a companion shoots a foe it can see", e.hp < 1e4);
  }
  {
    const w = empty({ squad: 3 });
    hurt(w, w.soldiers[1], 1e4, null);
    swapControl(w);
    t.ok("F5: swap skips the dead", w.ctrl === 2);
    step(w, { swap: true });
    t.ok("F5: Tab swaps", w.ctrl === 0);
    hurt(w, w.soldiers[0], 1e4, null);
    t.ok("F5: when the soldier you fly dies, control passes on", w.ctrl === 2);
  }
  {
    // P9: the artifact drops where its carrier dies; anyone picks it up.
    const w = createWorld(2, { asteroids: 0, enemies: 0, squad: 2, waveEvery: 1e9 });
    const [s0, s1] = w.soldiers;
    const a = w.artifact;
    Object.assign(s0, { x: a.x, y: a.y, z: a.z });
    Object.assign(s1, { x: 300, y: 300, z: 300 });
    step(w, {});
    hurt(w, s0, 1e4, null);
    step(w, {});
    t.ok("F5: the artifact drops when its carrier dies", a.carrier === null && !w.end);
    Object.assign(s1, { x: a.x, y: a.y, z: a.z, vx: 0, vy: 0, vz: 0 });
    step(w, {});
    t.ok("F5: and the next soldier picks it up", a.carrier === s1);
  }

  // ---- F6: troopers -----------------------------------------------------------------
  {
    const w = empty();
    const [a, b] = spawnGroup(w, "trooper", 3000, 3000, 3000, false);
    t.ok("F6: troopers come in pairs on one wing", a.wing && a.wing === b.wing && a.wing.members.length === 2);
    const base = WEAPONS2[a.weapon.id];
    t.ok("F6: a squad gun, its effect amounts halved (K3)", LOADOUT2.includes(a.weapon.id) && a.weapon !== base && near(a.weapon.effects[0].amount ?? a.weapon.effects[0].dps, (base.effects[0].amount ?? base.effects[0].dps) * CFG.trooperDamage, 1e-9));
    t.ok("F6: unlimited spare magazines, rolled Aim and Health (K2)", a.magsLeft === Infinity && a.stats.aim >= 3 && a.stats.aim <= 6 && a.maxHp === 15 + a.stats.health * 2);
    t.ok("F6: a trooper is a soldier body", isBodyT(a) && Array.isArray(a.q) && a.boots === null);
  }
  // A still rock of radius r at the centre, a soldier `sd` out along +x, and a
  // trooper pair `td` out on the far side, alert.
  const perched = (r = 250, sd = 650, td = 600, seed = 3) => {
    const w = empty();
    const rock = makeAsteroid(makeRng(seed), 3000, 3000, 3000, r);
    Object.assign(rock, { vx: 0, vy: 0, vz: 0, w: [0, 0, 0.05] });
    w.asteroids.push(rock);
    const s = w.soldiers[0];
    Object.assign(s, { x: 3000 + sd, y: 3000, z: 3000, vx: 0, vy: 0, vz: 0, hp: 1e5, maxHp: 1e5 });
    const pair = spawnGroup(w, "trooper", 3000 - td, 3000 + 150, 3000 - 80, true);
    return { w, s, rock, pair };
  };
  {
    // The landing approach, from several distances onto several rocks.
    let all = true, worst = 0, slow = 0;
    for (const [r, td] of [[80, 400], [150, 700], [250, 900], [400, 1200], [120, 1000], [300, 500]]) {
      const { w, pair } = perched(r, 2000, td);
      for (const e of pair) e.alert = false;
      // Idle and alone, given the rock as its perch: the approach alone lands it.
      const e = pair[0];
      pair[1].alive = false;
      e.perch = w.asteroids[0];
      let t0 = null;
      for (let i = 0; i < 60 * 12 && e.boots !== "ground"; i++) {
        const before = Math.hypot(e.vx, e.vy, e.vz);
        step(w, {});
        if (e.boots === "ground") { t0 = i; worst = Math.max(worst, before); }
      }
      if (e.boots !== "ground" || e.hp < e.maxHp) all = false;
      if (t0 === null || t0 > 60 * 10) slow++;
    }
    t.ok(`F6: a trooper lands on a rock unhurt, every time (fastest touchdown ${worst.toFixed(0)}px/s)`, all && worst < CFG.landSafe);
    t.ok("F6: within 10s", slow === 0);
  }
  {
    const { w, s, pair } = perched();
    for (const e of pair) e.alert = false;
    pair[0].alert = true;
    step(w, {});
    t.ok("F6: a pair alerts together", pair[1].alert);
  }
  {
    const { w, s, pair } = perched();
    const N = 60 * 30;
    let hidden = [0, 0], both = 0, shots = 0, losShots = 0;
    for (let i = 0; i < N; i++) {
      step(w, {});
      for (const ev of w.events) if (ev.type === "muzzle" && ev.team === "enemy") shots++;
      w.events.length = 0;
      pair.forEach((e, k) => { if (!hasLos(w, s, e)) hidden[k]++; });
      if (pair.every((e) => e.alive && e.dance === "peek")) both++;
    }
    t.ok(`F6: on a rock, each trooper is out of sight much of the time (${hidden.map((h) => (h / N).toFixed(2)).join(", ")})`, hidden.every((h) => h / N > 0.4));
    t.ok("F6: the two never peek at once", both === 0);
    t.ok(`F6: and they shoot (${shots} rounds in 30s)`, shots > 10);
  }
  {
    // Shot at while peeking, before the burst: straight back to cover.
    const { w, s, pair } = perched();
    const e = pair[0];
    let flinched = false;
    for (let i = 0; i < 60 * 20 && !flinched; i++) {
      step(w, {});
      if (e.dance === "peek" && !e.burstDone && e.burstLeft === 0 && e.tele > 0) {
        hurt(w, e, 1, s);
        step(w, {});
        flinched = e.dance === "cover";
      }
    }
    t.ok("F6: hit while winding up a peek, it flinches back to cover", flinched);
  }
  {
    // On a derelict, starting outside: never inside.
    let inside = 0, hiddenAll = 0, landed = 0;
    for (const seed of [1, 2, 3]) {
      const w = empty();
      const lay = addDerelict({ rng: makeRng(seed), walls: [], ruins: [], keepClear: [] }, 0, 0, 0, 1300, 580);
      const r = addRuin3(w, lay, 3000, 3000, 3000, qaxis(norm([seed, 1, 0.3]), seed), 290);
      const s = w.soldiers[0];
      const out = qrot(r.q, [0, 0, 1]);
      Object.assign(s, { x: 3000 + out[0] * 650, y: 3000 + out[1] * 650, z: 3000 + out[2] * 650, vx: 0, vy: 0, vz: 0, hp: 1e5, maxHp: 1e5 });
      const side = qrot(r.q, [0, 1, 0]);
      const pair = spawnGroup(w, "trooper", 3000 + side[0] * 700, 3000 + side[1] * 700, 3000 + side[2] * 700, true);
      for (let i = 0; i < 60 * 20; i++) {
        step(w, {});
        for (const e of pair) {
          if (insideHull(r, e)) inside++;
          if (e.boots === "ground" && !hasLos(w, s, e)) hiddenAll++;
          if (e.boots === "ground") landed++;
        }
      }
    }
    t.ok("F6: on a derelict, a trooper starting outside never goes in", inside === 0);
    t.ok(`F6: and perches there, out of sight a share of the time (${(hiddenAll / Math.max(1, landed)).toFixed(2)})`, landed > 0 && hiddenAll / landed > 0.25);
  }
  {
    // You run, they follow: a soldier flying at 250px/s for a minute.
    const w = empty();
    const s = w.soldiers[0];
    Object.assign(s, { x: 600, y: 600, z: 600, vx: 0, vy: 0, vz: 0, hp: 1e5, maxHp: 1e5 });
    const pair = spawnGroup(w, "trooper", 300, 600, 600, true);
    let worst = 0;
    for (let i = 0; i < 60 * 40; i++) {
      Object.assign(s, { vx: 144, vy: 144, vz: 144 }); // 250px/s along the diagonal
      step(w, {});
      if (i > 60 * 8) for (const e of pair) worst = Math.max(worst, Math.hypot(e.x - s.x, e.y - s.y, e.z - s.z));
    }
    t.ok(`F6: a pair follows a soldier who runs (never more than ${worst.toFixed(0)}px behind)`, worst < 1100);
  }
  {
    // Until they find you, they patrol.
    const w = empty();
    const s = w.soldiers[0];
    Object.assign(s, { x: 5900, y: 5900, z: 5900 });
    for (let i = 0; i < 40; i++) {
      const a = makeAsteroid(makeRng(100 + i), 0, 0, 0, 60 + (i % 5) * 40);
      Object.assign(a, { x: 1000 + (i % 4) * 900, y: 1000 + Math.floor(i / 4) % 4 * 900, z: 1000 + Math.floor(i / 16) * 900, vx: 0, vy: 0, vz: 0, w: [0, 0, 0] });
      w.asteroids.push(a);
    }
    const pair = spawnGroup(w, "trooper", 2500, 2500, 2500, false);
    let rests = 0, was = false;
    for (let i = 0; i < 60 * 90; i++) {
      step(w, {});
      const r = pair[0].boots === "ground";
      if (r && !was) rests++;
      was = r;
    }
    t.ok(`F6: an idle pair patrols, perching to rest on the way (${pair[0].wing.legId} legs, ${rests} rests in 90s)`, pair[0].wing.legId >= 3 && rests >= 2);
  }

  // ---- F7: readability ------------------------------------------------------------------
  {
    // The HUD draws a whole mission headlessly without throwing, events and all.
    const w = createWorld(4, { squad: 3 });
    const hud = createHud();
    const ctx = ctx2d();
    let threw = null;
    try {
      for (let i = 0; i < 60 * 20; i++) {
        step(w, { look: [0.01, 0.003], jet: [0, 0, i % 120 < 30 ? 1 : 0], fire: true, firePress: i % 20 === 0 });
        if (i === 300) spawnWave(w);
        hudEvents(hud, w);
        drawHud(ctx, hud, w, 1280, 720, 75, 1 / 60);
        w.events.length = 0;
      }
      for (const s of w.soldiers) hurt(w, s, 1e5, null);
      step(w, {});
      drawHud(ctx, hud, w, 1280, 720, 75, 1 / 60);
    } catch (e) { threw = e; }
    t.ok(`F7: the HUD draws a mission, and its end, headlessly${threw ? ": " + threw.message : ""}`, !threw && w.end && !w.end.success);
  }
  {
    // A point behind the eye projects with negative depth (an edge marker, not a dot).
    const { w, s } = centred();
    const cam = eyeOf(w, 75, 16 / 9);
    const f = lookOf(s);
    const p = project(cam, [cam.pos[0] - f[0] * 500, cam.pos[1] - f[1] * 500, cam.pos[2] - f[2] * 500], 1280, 720);
    t.ok("F7: behind you projects behind", p.depth < 0);
  }
}


const isBodyT = (a) => a.kind === "soldier" || a.type === "trooper";

// The gap from a local point to a slab's surface (as the sim measures it).
function surfDistT(sd, l) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let c;
  if (sd.kind === "wall") {
    const ex = sd.b[0] - sd.a[0], ey = sd.b[1] - sd.a[1];
    const k = clamp(((l[0] - sd.a[0]) * ex + (l[1] - sd.a[1]) * ey) / (ex * ex + ey * ey), 0, 1);
    c = [sd.a[0] + ex * k, sd.a[1] + ey * k, clamp(l[2], sd.z0, sd.z1)];
  } else {
    if (inPoly(sd.poly, l[0], l[1])) c = [l[0], l[1], sd.zc];
    else {
      let bd = Infinity;
      for (let i = 0; i < sd.poly.length; i++) {
        const [ax, ay] = sd.poly[i], [bx, by] = sd.poly[(i + 1) % sd.poly.length];
        const ex = bx - ax, ey = by - ay;
        const k = clamp(((l[0] - ax) * ex + (l[1] - ay) * ey) / (ex * ex + ey * ey), 0, 1);
        const d = (ax + ex * k - l[0]) ** 2 + (ay + ey * k - l[1]) ** 2;
        if (d < bd) { bd = d; c = [ax + ex * k, ay + ey * k, sd.zc]; }
      }
    }
  }
  return Math.hypot(l[0] - c[0], l[1] - c[1], l[2] - c[2]) - sd.t;
}