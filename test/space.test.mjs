// space — the standalone zero-g prototype (tech/space-prototype.md). Drives
// src/space/sim.js headlessly with scripted input; view.js gets a smoke draw.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ctx2d } from "./harness.mjs";
import { CFG, WEAPONS, createWorld, step, collide, makeAsteroid, makeRng, fire, startReload, applyEffects, aimAccuracy, addRuin, segWall, hurt, closestOnWall, makeEnemy, spawnWave, hasLos, ENEMY_TYPES, swapControl, soldierMaxHp, RECRUITS, upOf, feetOf, bootsState, shove } from "../src/space/sim.js";
import { createView, draw, cameraFor, zoomBy, figurePose, ZOOM_MIN, ZOOM_MAX } from "../src/space/view.js";
import { createAudio } from "../src/space/audio.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// A world with nothing in it but the squad, for mechanics tests.
// Soldiers face +x, the way the fixtures fire, so the aim arc never clamps them.
function empty(opts = {}) {
  const w = createWorld(7, { asteroids: 0, dummies: 0, ruins: 0, objective: false, enemies: 0, waveEvery: 1e9, ...opts });
  for (const s of w.soldiers) s.angle = 0;
  return w;
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
      // Three is a library, not the game — and only the 3D view may load it,
      // so the sim and the flat view stay importable under node.
      const three = m[1] === "three" || m[1].startsWith("three/addons/");
      if (!m[1].startsWith("./") && !(three && f === "view3d.js")) outside.push(`${f} → ${m[1]}`);
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
    // No cap: 1s more of thrust from the middle of the map, clear of the edge.
    s.x = s.y = w.size / 2; s.vx = 900; s.vy = 0; s.angle = 0;
    run(w, { thrust: true }, 60);
    t.ok("thrust has no speed cap", near(s.vx, 900 + CFG.thrust, 1e-6));
  }
  {
    // The player aims within 90° of facing; outside it, the nearer edge.
    const w = empty();
    const s = w.soldiers[0];
    Object.assign(s, { x: 2000, y: 2000, angle: 0 });
    run(w, { aimX: 2100, aimY: 2030 }, 1);
    t.ok("aim inside the arc follows the mouse", near(s.aim, Math.atan2(30, 100), 1e-9));
    run(w, { aimX: 2000, aimY: 2100 }, 1);
    t.ok("aim 90° off facing clamps to the arc edge", near(s.aim, Math.PI / 4, 1e-9));
    run(w, { aimX: 1900, aimY: 1990 }, 1);
    t.ok("aim behind clamps to the nearer edge", near(s.aim, -Math.PI / 4, 1e-9));
    s.fireCd = 0;
    run(w, { aimX: 1900, aimY: 1990, fire: true }, 1);
    const p = w.projectiles[0];
    t.ok("a round leaves inside the arc (± spread)", Math.abs(Math.atan2(p.vy, p.vx)) <= Math.PI / 4 + 0.2);
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
    // Every event the sim emits must carry a finite position — the chain
    // event once did not, and the NaN froze the page through the sound pan.
    const w2 = createWorld(9, { squad: 3 });
    for (const s2 of w2.soldiers) s2.hp = s2.maxHp = 1e9;
    const seen = new Set();
    const unplaced = new Set();
    const lead = () => w2.soldiers[w2.ctrl];
    for (let i = 0; i < 60 * 90; i++) {
      const e = w2.enemies.find((o) => o.alive);
      step(w2, { turn: 1, thrust: i % 90 < 40, aimX: e ? e.x : 0, aimY: e ? e.y : 0, fire: true, firePress: i % 8 === 0, reload: i % 240 === 0, swap: i % 600 === 0 });
      for (const ev of w2.events) {
        seen.add(ev.type);
        if (ev.type !== "wave" && !(Number.isFinite(ev.x) && Number.isFinite(ev.y))) unplaced.add(ev.type);
      }
      w2.events.length = 0;
    }
    t.ok(`every positional event has a finite x, y (saw ${[...seen].sort().join(", ")})${unplaced.size ? " — missing: " + [...unplaced].join(", ") : ""}`, unplaced.size === 0 && seen.has("chain"));
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
    const w = createWorld(3, { squad: 2, asteroids: 0, dummies: 0, enemies: 0 });
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
    const w = createWorld(3, { squad: 2, asteroids: 0, dummies: 0, enemies: 0 });
    Object.assign(w.soldiers[0], { x: w.extract.x, y: w.extract.y });
    run(w, {}, 5);
    t.ok("extraction without the artifact does nothing", !w.end);
    for (const s of w.soldiers) hurt(w, s, 999);
    run(w, {}, 1);
    t.ok("squad dead: failure", w.end && w.end.success === false);
  }

  // ---- S4: enemies ------------------------------------------------------------------
  {
    // A charger reaches a soldier in open space; contact lands once per 0.6s.
    const w = empty();
    const s = w.soldiers[0];
    Object.assign(s, { x: 2000, y: 2000, hp: 1000, maxHp: 1000 });
    const e = makeEnemy(w, "charger", 2400, 2000);
    e.alert = true;
    w.enemies.push(e);
    let first = null;
    for (let i = 0; i < 600 && first === null; i++) { run(w, {}, 1); if (s.hp < 1000) first = i; }
    t.ok("a charger reaches and hits a soldier", first !== null);
    const hp = s.hp;
    // Pin it on the soldier for one second of contact.
    for (let i = 0; i < 60; i++) { Object.assign(e, { x: s.x + 5, y: s.y, vx: 0, vy: 0 }); run(w, {}, 1); }
    const hits = Math.round((hp - s.hp) / ENEMY_TYPES.charger.contact);
    t.ok(`contact damage at most once per 0.6s (${hits} hits in 1s)`, hits >= 1 && hits <= 2);
  }
  {
    // A gunner does not fire through a rock, and does fire with a clear line.
    const w = empty();
    const s = w.soldiers[0];
    Object.assign(s, { x: 2000, y: 2000, hp: 1000, maxHp: 1000 });
    const rock = makeAsteroid(makeRng(4), 2170, 2000, 60);
    rock.vx = rock.vy = 0; rock.m = 1e9; // parked
    w.asteroids.push(rock);
    const g = makeEnemy(w, "gunner", 2340, 2000);
    g.alert = true;
    w.enemies.push(g);
    t.ok("hasLos: a rock blocks the line", !hasLos(w, g.x, g.y, s.x, s.y));
    let shots = 0;
    for (let i = 0; i < 180; i++) {
      Object.assign(g, { x: 2340, y: 2000, vx: 0, vy: 0 }); // hold it behind the rock
      Object.assign(s, { x: 2000, y: 2000, vx: 0, vy: 0 });
      run(w, {}, 1);
      shots += w.projectiles.filter((p) => p.team === "enemy" && !p.counted && (p.counted = true)).length;
    }
    t.eq("a gunner holds fire without line of sight", shots, 0);
    w.asteroids.length = 0;
    for (let i = 0; i < 180; i++) {
      Object.assign(g, { x: 2340, y: 2000, vx: 0, vy: 0 });
      run(w, {}, 1);
      shots += w.projectiles.filter((p) => p.team === "enemy" && !p.counted && (p.counted = true)).length;
    }
    t.ok("and fires once it has one", shots >= 1);
  }
  {
    // A mine arms, fuses on proximity, and its blast hurts.
    const w = empty();
    const s = w.soldiers[0];
    Object.assign(s, { x: 2000, y: 2000, hp: 1000, maxHp: 1000 });
    const m = makeEnemy(w, "mine", 2050, 2000);
    w.enemies.push(m);
    run(w, {}, Math.ceil((ENEMY_TYPES.mine.arm + ENEMY_TYPES.mine.fuse) * 60) + 3);
    t.ok("a mine near a soldier detonates", !m.alive);
    t.ok("its blast damages the soldier", near(1000 - s.hp, ENEMY_TYPES.mine.blast.amount, 1e-9));
  }
  {
    // Waves arrive from every side, offscreen.
    const quads = new Set();
    let offscreen = true;
    for (let seed = 1; seed <= 12; seed++) {
      const w = createWorld(seed, { enemies: 0, asteroids: 20 });
      const s = w.soldiers[0];
      Object.assign(s, { x: 2000, y: 2000 }); // mid-map, so no bearing is clamped away
      spawnWave(w);
      for (const e of w.enemies) {
        const d = Math.hypot(e.x - s.x, e.y - s.y);
        if (d < CFG.waveDistMin * 0.8) offscreen = false;
        quads.add((e.x > s.x ? 1 : 0) + (e.y > s.y ? 2 : 0));
      }
    }
    t.ok("wave enemies spawn offscreen", offscreen);
    t.eq("wave enemies come from all four quadrants (12 seeds)", quads.size, 4);
  }
  {
    let ok = true;
    for (let seed = 1; seed <= 20; seed++) {
      const w = createWorld(seed);
      for (const e of w.enemies) if (!e.alert && Math.hypot(e.x - w.start.x, e.y - w.start.y) < CFG.alertRange) ok = false;
    }
    t.ok("no placed enemy starts within alert range of the squad (20 seeds)", ok);
  }
  {
    // Smoke: a whole mission runs for two minutes with waves, and nothing NaNs.
    const w = createWorld(9, { squad: 1 });
    w.soldiers[0].hp = w.soldiers[0].maxHp = 1e9;
    run(w, (i) => ({ turn: Math.sin(i / 50), thrust: i % 120 < 60, aimX: 2000, aimY: 2000, fire: true, firePress: i % 20 === 0 }), 60 * 120);
    const bad = [...w.soldiers, ...w.enemies, ...w.asteroids].filter((b) => !Number.isFinite(b.x + b.y + b.vx + b.vy));
    t.eq("two minutes of play: no NaN positions", bad.length, 0);
    t.ok("waves arrived", w.wave.n >= 3);
  }

  // ---- S5: squad --------------------------------------------------------------------
  {
    const w = empty({ squad: 3 });
    t.eq("HP = 15 + health × 2", w.soldiers.map((s) => s.maxHp), RECRUITS.map((r) => soldierMaxHp(r.stats)));
    t.eq("default loadout, one weapon each", w.soldiers.map((s) => s.weapon.id), ["carbine", "grenade_launcher", "arc_tazer"]);
    run(w, { swap: true }, 1);
    t.eq("swap moves control to the next soldier", w.ctrl, 1);
    hurt(w, w.soldiers[2], 999);
    run(w, { swap: true }, 1);
    t.eq("swap skips the dead", w.ctrl, 0);
    hurt(w, w.soldiers[0], 999);
    t.eq("the leader dies: control passes on", w.ctrl, 1);
  }
  {
    // Station-keeping on the thrust body: the leader cruises for 10s, the
    // squad keeps up and holds near its stations.
    const w = empty({ squad: 3 });
    const lead = w.soldiers[0];
    Object.assign(lead, { x: 800, y: 800, vx: 180, vy: 120 });
    w.soldiers[1].x = 760; w.soldiers[1].y = 800;
    w.soldiers[2].x = 840; w.soldiers[2].y = 800;
    let worst = 0;
    for (let i = 0; i < 600; i++) {
      run(w, {}, 1);
      if (i < 240) continue; // settle first
      for (const s of w.soldiers.slice(1)) {
        const px = lead.x + Math.cos(s.station.a) * s.station.d;
        const py = lead.y + Math.sin(s.station.a) * s.station.d;
        worst = Math.max(worst, Math.hypot(s.x - px, s.y - py));
      }
    }
    t.ok(`companions hold station behind a cruising leader (worst ${worst.toFixed(0)}px off)`, worst < 60);
  }
  {
    // A companion engages a foe in line of sight, and reloads itself.
    const w = empty({ squad: 2, weapons: ["carbine", "carbine"], dummies: 1 });
    const [lead, mate] = w.soldiers;
    Object.assign(lead, { x: 2000, y: 2000 });
    Object.assign(mate, { x: 2000 + Math.cos(mate.station.a) * mate.station.d, y: 2000 + Math.sin(mate.station.a) * mate.station.d });
    const d = w.enemies[0];
    Object.assign(d, { x: 2400, y: 2000, homeX: 2400, homeY: 2000, hp: 1e6, maxHp: 1e6 });
    mate.ammo = 2;
    run(w, {}, 240);
    t.ok("a companion shoots a foe it can see", d.hp < 1e6);
    t.ok("and reloads itself when dry", mate.magsLeft === CFG.soldierMagazines - 2);
    // Behind a rock it holds fire.
    const rock = makeAsteroid(makeRng(8), 2200, 2000, 120);
    rock.vx = rock.vy = 0; rock.m = 1e9;
    w.asteroids.push(rock);
    run(w, {}, 30);
    const hp = d.hp;
    for (let i = 0; i < 120; i++) { Object.assign(lead, { x: 2000, y: 2000, vx: 0, vy: 0 }); Object.assign(d, { x: 2400, y: 2000 }); run(w, {}, 1); }
    t.ok("a companion holds fire without line of sight", d.hp === hp);
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

  // ---- audio: silent and harmless without WebAudio (node) ------------------
  {
    const a = createAudio();
    let threw = null;
    try { a.unlock(); a.handle([{ type: "explode", x: 0, y: 0 }], 0, 0); a.setThrust(true); a.end(true); } catch (e) { threw = e; }
    t.ok(`audio is a no-op without WebAudio${threw ? ": " + threw.message : ""}`, !threw);
  }

  // ---- camera, zoom, figure ---------------------------------------------------
  {
    const w = empty();
    const s = w.soldiers[0];
    Object.assign(s, { x: 3000, y: 3000 });
    const c1 = cameraFor(w, 1280, 720, 1);
    const c2 = cameraFor(w, 1280, 720, 0.5);
    t.ok("zoom 1 frames the screen in world px", c1.w === 1280 && c1.h === 720);
    t.ok("zoom 0.5 frames twice the world", c2.w === 2560 && c2.h === 1440);
    t.ok("the frame stays centred on the soldier at any zoom", Math.abs(c2.x + c2.w / 2 - 3000) < 1e-9 && Math.abs(c1.y + c1.h / 2 - 3000) < 1e-9);
    // The mouse at screen centre aims at the soldier's own position, zoomed or not.
    const aim = (c) => [c.x + 640 / c.zoom, c.y + 360 / c.zoom];
    t.ok("screen → world undoes the zoom", aim(c2).every((v) => Math.abs(v - 3000) < 1e-9));
    const v = createView();
    for (let i = 0; i < 50; i++) zoomBy(v, 100);
    t.eq("zoom out clamps", v.zoom, ZOOM_MIN);
    for (let i = 0; i < 80; i++) zoomBy(v, -100);
    t.eq("zoom in clamps", v.zoom, ZOOM_MAX);

    // M0: the figure is read from the sim. Model +x is forward and +y the head,
    // in Three's y-up frame, mirrored by dir: both must match the sim, either dir.
    let worst = 0;
    for (const dir of [1, -1]) {
      for (let k = 0; k < 360; k++) {
        const a = (k / 360) * Math.PI * 4 - Math.PI * 2;
        const p = figurePose({ angle: a, dir });
        const fwd = [p.dir * Math.cos(p.rot), p.dir * Math.sin(p.rot)]; // model +x, mirrored then turned
        const head = [-Math.sin(p.rot), Math.cos(p.rot)]; // model +y, turned
        const [ux, uy] = upOf({ angle: a, dir });
        worst = Math.max(worst, Math.hypot(fwd[0] - Math.cos(a), fwd[1] + Math.sin(a)), Math.hypot(head[0] - ux, head[1] + uy));
      }
    }
    t.ok(`the figure faces where the jetpack pushes, head along the sim's up (worst ${worst.toExponential(1)})`, worst < 1e-9);

    // A full spin while floating never flips dir: the head goes round with the body.
    const f = empty();
    const fs = f.soldiers[0];
    Object.assign(fs, { x: 3000, y: 3000, angle: 0 });
    let flips = 0, headDown = false;
    run(f, (i) => {
      if (fs.dir !== 1) flips++;
      if (upOf(fs)[1] > 0.9) headDown = true;
      return { turn: 1 };
    }, Math.ceil((Math.PI * 2) / (CFG.turnRate * CFG.step)) + 2);
    t.eq("a floating 360° spin never flips dir", flips, 0);
    t.ok("no mirroring: facing left, a floating soldier is upside down", headDown);
    Object.assign(fs, { angle: 0, dir: 1 });
    const [fx, fy] = feetOf(fs);
    t.ok("the feet are the collision radius straight down", near(fx, 3000, 1e-9) && near(fy, 3000 + CFG.soldierR, 1e-9));
  }

  // ---- magnetic boots M1: rocks ----------------------------------------------
  {
    // One rock at (4000, 4000) and a soldier over its top, head up, feet `gap`
    // px above the surface.
    const onRock = (r = 120, gap = 5, rock = {}, opts = {}) => {
      const w = empty(opts);
      const a = makeAsteroid(makeRng(3), 4000, 4000, r);
      Object.assign(a, { vx: 0, vy: 0, spin: 0, rot: 0 }, rock);
      w.asteroids.push(a);
      const s = w.soldiers[0];
      Object.assign(s, { x: 4000, y: 4000 - r - s.r - gap, vx: 0, vy: 0, angle: 0, dir: 1 });
      return { w, s, a };
    };
    const land = (w, s) => { step(w, { boots: true }); for (let i = 0; i < 60 && s.boots !== "ground"; i++) step(w, {}); };
    const R = (s, a) => Math.hypot(s.x - a.x, s.y - a.y);

    {
      const { w, s, a } = onRock(120, 5);
      t.eq("HUD: in range 5px above a rock", bootsState(w, s), "ready");
      land(w, s);
      t.eq("Shift within 14px of a rock: the boots come on and it lands", s.boots, "ground");
      t.ok("standing: feet on the surface", near(R(s, a), a.r + s.r, 1e-9));
      step(w, { boots: true });
      t.eq("Shift again: floating", s.boots, null);
    }
    {
      const { w, s } = onRock(120, 20);
      step(w, { boots: true });
      t.eq("20px above: Shift does nothing", s.boots, null);
    }
    {
      // Beside a rock, head up: its nearest point is 5px from the side of the
      // body but outside the feet wedge.
      const { w, s, a } = onRock(120, 0);
      Object.assign(s, { x: a.x + a.r + s.r + 5, y: a.y });
      step(w, { boots: true });
      t.eq("a rock beside you, outside the wedge: no boots", s.boots, null);
    }
    {
      // Walking on a still rock: feet stay on it, at the walk speed.
      const { w, s, a } = onRock(120, 5);
      land(w, s);
      let worst = 0, align = 1;
      run(w, (i) => {
        if (i > 0) {
          worst = Math.max(worst, Math.abs(R(s, a) - a.r - s.r));
          const v = Math.hypot(s.vx, s.vy);
          if (v > 1) align = Math.min(align, (s.vx * Math.cos(s.angle) + s.vy * Math.sin(s.angle)) / v);
        }
        return { turn: 1 };
      }, 240);
      t.ok(`walking keeps the feet on the rock (worst ${worst.toExponential(1)}px)`, worst < 1);
      t.ok(`walking reaches the walk speed (${Math.hypot(s.vx, s.vy).toFixed(2)})`, near(Math.hypot(s.vx, s.vy), CFG.walkSpeed, 1e-6));
      t.ok("facing is the walk direction", align > 0.999);
      const f0 = s.angle;
      step(w, { turn: -1 });
      const [ux, uy] = upOf(s);
      const n = [(s.x - a.x) / R(s, a), (s.y - a.y) / R(s, a)];
      t.ok("turning round flips dir and facing, and up stays the surface normal",
        s.dir === -1 && Math.cos(s.angle - f0) < -0.99 && near(ux, n[0], 1e-9) && near(uy, n[1], 1e-9));
      run(w, {}, 60);
      t.ok("no input: friction stops the walk", Math.hypot(s.vx, s.vy) < 1e-9);
      run(w, { thrust: true }, 30);
      t.ok("W with the boots on adds nothing", Math.hypot(s.vx, s.vy) < 1e-9 && !s.thrusting);
    }
    {
      // A drifting, spinning rock carries a still soldier.
      const { w, s, a } = onRock(120, 5, { vx: 30, vy: -20, spin: 0.5 });
      land(w, s);
      const rel = () => Math.atan2(s.y - a.y, s.x - a.x) - a.rot;
      const r0 = rel();
      run(w, {}, 200);
      const dr = Math.abs(Math.atan2(Math.sin(rel() - r0), Math.cos(rel() - r0)));
      t.ok(`a still soldier keeps its spot on a spinning rock (${dr.toExponential(1)} rad)`, dr < 1e-9 && near(R(s, a), a.r + s.r, 1e-9));
      const sv = [a.vx - a.spin * (s.y - a.y), a.vy + a.spin * (s.x - a.x)];
      t.ok("its velocity is the rock's surface velocity there", near(s.vx, sv[0], 1e-9) && near(s.vy, sv[1], 1e-9));
    }
    {
      // A standing jump comes back to where it left.
      const { w, s, a } = onRock(120, 5);
      land(w, s);
      run(w, {}, 5);
      const x0 = s.x, y0 = s.y;
      step(w, { spacePress: true, space: true });
      t.eq("Space jumps", s.boots, "air");
      let apex = 0, n = 0;
      while (s.boots === "air" && n++ < 200) { apex = Math.max(apex, R(s, a) - a.r - s.r); step(w, {}); }
      const want = CFG.jumpSpeed ** 2 / (2 * CFG.gravity);
      t.ok(`the jump's apex is v²/2g (${apex.toFixed(1)} vs ${want.toFixed(1)})`, near(apex, want, 8));
      t.ok(`and it lands back on its takeoff spot (${Math.hypot(s.x - x0, s.y - y0).toFixed(2)}px)`, s.boots === "ground" && Math.hypot(s.x - x0, s.y - y0) < 3);
    }
    {
      // Landing on a small rock at jump speed does not push it (answer 4).
      const { w, s, a } = onRock(30, 5);
      step(w, { boots: true });
      s.vy = CFG.jumpSpeed;
      for (let i = 0; i < 30 && s.boots !== "ground"; i++) step(w, {});
      t.ok("landing on a small rock leaves its velocity unchanged", s.boots === "ground" && a.vx === 0 && a.vy === 0);
    }
    {
      // Spin the feet away mid-jump: the boots switch off, the velocity stays.
      const { w, s } = onRock(120, 5);
      land(w, s);
      step(w, { spacePress: true });
      let n = 0;
      while (s.boots && n++ < 120) step(w, { turn: 1 });
      const v0 = [s.vx, s.vy];
      run(w, {}, 10);
      t.ok(`spinning the feet away switches the boots off (after ${n} steps)`, s.boots === null && n < 120);
      t.ok("and it floats on with its velocity", Math.hypot(v0[0], v0[1]) > 1 && s.vx === v0[0] && s.vy === v0[1]);
    }
    {
      // Knockback throws a standing soldier into the air; gravity brings it back.
      const { w, s } = onRock(120, 5);
      land(w, s);
      shove(s, 300, 0);
      step(w, {});
      t.eq("a knockback knocks a standing soldier off", s.boots, "air");
      for (let i = 0; i < 120 && s.boots !== "ground"; i++) step(w, {});
      t.eq("and its boots bring it back down", s.boots, "ground");
    }
    {
      // Space: fire while floating, never with the boots on; the mouse always fires.
      const { w, s } = onRock(120, 5);
      const ammo0 = s.ammo;
      step(w, { space: true, spacePress: true });
      t.eq("floating, Space fires", s.ammo, ammo0 - 1);
      s.fireCd = 0;
      land(w, s);
      const ammo1 = s.ammo;
      run(w, { space: true }, 30);
      t.eq("booted, Space held never fires", s.ammo, ammo1);
      run(w, { fire: true, firePress: true }, 1);
      t.eq("booted, the mouse fires", s.ammo, ammo1 - 1);
    }
    {
      // Swapping away switches the boots off; companions never wear them.
      const { w, s } = onRock(120, 5, {}, { squad: 2 });
      land(w, s);
      step(w, { swap: true });
      t.eq("swapping away switches the boots off", s.boots, null);
    }
    {
      // Determinism with a boots trace.
      const trace = (i) => ({ turn: i % 90 < 30 ? 1 : i % 90 < 45 ? -1 : 0, thrust: i % 50 < 35, boots: i % 120 === 0, space: i % 40 < 10, spacePress: i % 40 === 0, fire: i % 7 < 3, firePress: i % 7 === 0 });
      const a = createWorld(42, { squad: 3 });
      const b = createWorld(42, { squad: 3 });
      let booted = 0;
      run(a, (i) => { if (a.soldiers[a.ctrl].boots) booted++; return trace(i); }, 900);
      run(b, trace, 900);
      const sig = (w) => JSON.stringify([w.soldiers.map((s) => [s.x, s.y, s.hp, s.boots]), w.asteroids.map((o) => [o.x, o.y])]);
      t.ok("same seed + same boots trace = same world", sig(a) === sig(b));
    }
  }

  // ---- magnetic boots M2: derelicts as one surface --------------------------
  {
    const RW = CFG.soldierR + CFG.wallHalf; // the body's centre rides this far off a plate
    // A soldier over wall `wi` of a ruin, `at` along it, on the face away from
    // the ruin's centre (or toward it: `inside`), feet `gap` px off, head up.
    const overWall = (w, ruin, wi, at, gap = 5, inside = false) => {
      const wall = ruin.walls[wi];
      const px = wall.x0 + (wall.x1 - wall.x0) * at, py = wall.y0 + (wall.y1 - wall.y0) * at;
      const L = Math.hypot(wall.x1 - wall.x0, wall.y1 - wall.y0);
      let nx = -(wall.y1 - wall.y0) / L, ny = (wall.x1 - wall.x0) / L;
      if ((nx * (px - ruin.x) + ny * (py - ruin.y) < 0) !== inside) { nx = -nx; ny = -ny; }
      const s = w.soldiers[0];
      Object.assign(s, { x: px + nx * (RW + gap), y: py + ny * (RW + gap), vx: 0, vy: 0, dir: 1, angle: Math.atan2(nx, -ny) });
      return s;
    };
    // Walk one way until back at the start. Records, per wall, which faces the
    // body passed along the middle of, the closest it came to any plate, the
    // largest move in one step, and whether it ever left the surface.
    const walkRound = (w, ruin, s) => {
      step(w, { boots: true });
      for (let i = 0; i < 60 && s.boots !== "ground"; i++) step(w, {});
      const x0 = s.x, y0 = s.y;
      const faces = new Map(ruin.walls.map((wl) => [wl, new Set()]));
      let path = 0, closest = Infinity, jump = 0, off = false, closed = false;
      for (let i = 0; i < 4000; i++) {
        const px = s.x, py = s.y;
        step(w, { turn: 1 });
        if (s.boots !== "ground") { off = true; break; }
        const d = Math.hypot(s.x - px, s.y - py);
        path += d;
        jump = Math.max(jump, d);
        for (const wl of ruin.walls) {
          const [cx, cy] = closestOnWall(wl, s.x, s.y);
          const dist = Math.hypot(s.x - cx, s.y - cy);
          closest = Math.min(closest, dist);
          const ex = wl.x1 - wl.x0, ey = wl.y1 - wl.y0;
          const k = ((s.x - wl.x0) * ex + (s.y - wl.y0) * ey) / (ex * ex + ey * ey);
          if (k > 0.1 && k < 0.9 && dist < RW + 0.01) faces.get(wl).add(Math.sign(ex * (s.y - wl.y0) - ey * (s.x - wl.x0)));
        }
        if (path > 200 && Math.hypot(s.x - x0, s.y - y0) < CFG.walkSpeed * CFG.step) { closed = true; break; }
      }
      return { faces, closest, jump, off, closed, path };
    };
    const long = (wl) => Math.hypot(wl.x1 - wl.x0, wl.y1 - wl.y0) > 100;

    {
      const w = empty();
      const ruin = addRuin(w, 3000, 3000, 0.4, 400, 200);
      const s = overWall(w, ruin, 0, 0.5);
      t.eq("HUD: in range over a hull plate", bootsState(w, s), "ready");
      step(w, { boots: true });
      for (let i = 0; i < 60 && s.boots !== "ground"; i++) step(w, {});
      t.eq("the boots come on against a hull plate, and it lands", s.boots, "ground");
    }
    // One breach (the lower nose): one surface, walked all the way round. The
    // 400×200 hull's inside corners are all square; the others are not, which
    // is what caught a walk that stuck in an inside corner.
    for (const [angle, L, W] of [[0, 400, 200], [1.1, 460, 195], [2.3, 340, 220]]) {
      const w = empty();
      const ruin = addRuin(w, 3000, 3000, angle, L, W, [2]);
      const s = overWall(w, ruin, 0, 0.3);
      const r = walkRound(w, ruin, s);
      const missed = ruin.walls.filter((wl) => long(wl) && r.faces.get(wl).size < 2).length;
      t.ok(`one breach, ${L}×${W} turned ${angle}: one walk comes back to its start (${r.path.toFixed(0)}px)`, r.closed && !r.off);
      t.eq(`one breach, ${L}×${W} turned ${angle}: it passes both faces of every plate`, missed, 0);
      t.ok(`one breach, ${L}×${W} turned ${angle}: never inside a plate (closest ${r.closest.toFixed(6)})`, r.closest > RW - 1e-6);
      t.ok(`one breach, ${L}×${W} turned ${angle}: never more than a walk step at once (${r.jump.toFixed(3)}px)`, r.jump <= CFG.walkSpeed * CFG.step + 1e-6);
    }
    {
      // Two breaches, top and bottom at the same station: two pieces, each
      // walked all the way round; together they cover every plate.
      const w = empty();
      const ruin = addRuin(w, 3000, 3000, 0.7, 400, 200, [0, 3]);
      const aft = overWall(w, ruin, 0, 0.3);
      const r1 = walkRound(w, ruin, aft);
      step(w, { boots: true }); // off, to be placed on the other piece
      const front = overWall(w, ruin, 1, 0.5); // the stub of the top edge ahead of the breach
      const r2 = walkRound(w, ruin, front);
      const missed = ruin.walls.filter((wl) => long(wl) && new Set([...r1.faces.get(wl), ...r2.faces.get(wl)]).size < 2).length;
      t.ok("two breaches: each piece is walked round back to its start", r1.closed && r2.closed && !r1.off && !r2.off);
      t.ok("two breaches: the pieces are different surfaces", ruin.walls.some((wl) => r1.faces.get(wl).size && !r2.faces.get(wl).size));
      t.eq("two breaches: between them, both faces of every plate", missed, 0);
    }
    {
      // Inside a hull, a jump comes back down to the floor it left.
      const w = empty();
      const ruin = addRuin(w, 3000, 3000, 0, 400, 200, [2]);
      const s = overWall(w, ruin, 0, 0.3, 5, true);
      step(w, { boots: true });
      for (let i = 0; i < 60 && s.boots !== "ground"; i++) step(w, {});
      const x0 = s.x, y0 = s.y;
      step(w, { spacePress: true });
      for (let i = 0; i < 200 && s.boots !== "ground"; i++) step(w, {});
      t.ok(`inside a hull, a jump lands back where it left (${Math.hypot(s.x - x0, s.y - y0).toFixed(2)}px)`, s.boots === "ground" && Math.hypot(s.x - x0, s.y - y0) < 3);
    }
  }

  // ---- view smoke ----------------------------------------------------------
  {
    const w = createWorld(5, { squad: 3 });
    run(w, { thrust: true, turn: 1 }, 30);
    w.soldiers[w.ctrl].boots = "air"; // the HUD's boot line
    let threw = null;
    try { draw(ctx2d(), createView(), w, 960, 540, 1 / 60); } catch (e) { threw = e; }
    t.ok(`view draws a world${threw ? ": " + threw.message : ""}`, !threw);
    threw = null;
    const v = createView();
    v.zoom = 0.4;
    try { draw(ctx2d(), v, w, 960, 540, 1 / 60, true); } catch (e) { threw = e; }
    t.ok(`view draws the overlay over a 3D view, zoomed out${threw ? ": " + threw.message : ""}`, !threw);
  }
}
