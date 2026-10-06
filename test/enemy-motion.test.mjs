// What an enemy is doing, as one record per root, and the shake it raises
// (tech/mission-3d-enemies.md M5): src/mission/enemyspec/motion.js driven by
// real roster enemies, the mission's shake operations, and the same records
// rebuilt on a viewer from snapshots alone.
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { MISSION_ENEMY_SPECS } from "../src/game/enemyspecs.js";
import {
  instantiate, updateSpecEnemy, applyDamage, killEntity, findEntity, spawnFromDef,
} from "../src/mission/enemyspec/runtime.js";
import { createMotion, KICK_TO_SHAKE } from "../src/mission/enemyspec/motion.js";
import { projectScene, applySnapshot } from "../src/net/mission-wire.js";
import { Mission } from "../src/mission/mission.js";
import { makeEl } from "./harness.mjs";

const STEP = 1 / 60;
const GROUND = 500;

function makeScene(playerX = 900) {
  return {
    world: { width: 1400, height: 540, gravity: 2000 },
    platforms: [{ x: 0, y: GROUND, w: 1400, h: 40 }],
    soldiers: [{ kind: "soldier", x: playerX, y: GROUND - 46, w: 30, h: 46, vx: 0, vy: 0, onGround: true, alive: true, health: 1e9, maxHealth: 1e9 }],
    enemies: [],
    projectiles: [],
    loot: [],
  };
}

function makeCtx(scene) {
  const ctx = {
    friendlyFire: false,
    damageMult: 1,
    damage: (t, a, o) => { if (t.kind === "spec") applyDamage(t.root, t, a, o, scene, ctx); },
    kill() {},
  };
  return ctx;
}

const spec = (id) => normalizeSpec(MISSION_ENEMY_SPECS.find((s) => s.id === id));
const onGround = (s, x) => instantiate(s, x, GROUND - s.root.body.h);

// Step one root and its record; returns [{ t, kick, ev }] per event.
// A `motion` passed in is already primed at t0.
function run(root, scene, seconds, { motion, until, t0 = 0 } = {}) {
  const ctx = makeCtx(scene);
  const log = [];
  const kicks = [];
  let time = t0;
  if (!motion) {
    motion = createMotion();
    motion.update([root], scene.platforms, time);
  }
  for (let i = 0, n = Math.round(seconds / STEP); i < n; i++) {
    updateSpecEnemy(root, STEP, scene, ctx);
    time += STEP;
    const k = motion.update([root], scene.platforms, time);
    if (k > 0) kicks.push({ t: time, k });
    for (const ev of motion.get(root).events) log.push({ t: time, ...ev });
    if (until && until(log)) break;
  }
  return { log, kicks, motion, time, ctx };
}

export default async function run_(t) {
  // ---- Assault Bot: a leap is an action, a takeoff, then a landing --------
  {
    const scene = makeScene(900);
    const root = onGround(spec("breach_hopper"), 200);
    const { log, kicks } = run(root, scene, 4, { until: (l) => l.some((e) => e.kind === "land") });
    const i = log.findIndex((e) => e.kind === "action" && e.id === "screenLeap");
    const up = log.findIndex((e, j) => j > i && e.kind === "takeoff");
    const down = log.findIndex((e, j) => j > up && e.kind === "land");
    t.ok(`bot: screenLeap, then airborne, then a landing (${i}, ${up}, ${down})`, i >= 0 && up > i && down > up);
    t.ok("bot: the takeoff kicks 2 and the landing 5",
      kicks.some((k) => k.t === log[up].t && k.k === 2) && kicks.some((k) => k.t === log[down].t && k.k === 5));
  }
  {
    const scene = makeScene(900);
    const s = spec("breach_hopper");
    const root = onGround(s, 900 - 40 - s.root.body.w);
    const { log } = run(root, scene, 2, { until: (l) => l.some((e) => e.kind === "action" && e.id !== "punchCombo") });
    const start = log.findIndex((e) => e.kind === "action" && e.id === "punchCombo");
    const end = log.findIndex((e, j) => j > start && e.kind === "action");
    const punches = log.slice(start, end < 0 ? undefined : end).filter((e) => e.kind === "fire" && e.part === "fistArm");
    t.ok(`bot: punchCombo records two fistArm fire edges (${punches.length})`, start >= 0 && punches.length === 2);
    t.ok(`bot: 0.31s apart (${punches.length === 2 ? (punches[1].t - punches[0].t).toFixed(3) : "-"})`,
      punches.length === 2 && Math.abs(punches[1].t - punches[0].t - 0.31) <= STEP + 1e-9);
  }

  // ---- Siege Automaton: a missile volley fires the pod twice ---------------
  {
    const scene = makeScene(900);
    const root = onGround(spec("siege_automaton"), 260);
    const { log } = run(root, scene, 12, { until: (l) => {
      const s = l.findIndex((e) => e.kind === "action" && e.id === "missileVolley");
      return s >= 0 && l.some((e, j) => j > s && e.kind === "action");
    } });
    const s = log.findIndex((e) => e.kind === "action" && e.id === "missileVolley");
    const e = log.findIndex((x, j) => j > s && x.kind === "action");
    const pod = log.slice(s, e < 0 ? undefined : e).filter((x) => x.kind === "fire" && x.part === "missilePack");
    t.ok(`siege: missileVolley records two missilePack fire edges (${pod.length})`, s >= 0 && pod.length === 2);
  }

  // ---- Floating Factory: a new spawn about every 7s ------------------------
  {
    const scene = makeScene(900);
    const root = instantiate(spec("floating_factory"), 200, 150);
    const { log } = run(root, scene, 22);
    const drones = log.filter((e) => e.kind === "spawn" && e.def === "drone").map((e) => e.t);
    t.ok(`factory: a drone about every 7s (${drones.map((x) => x.toFixed(1))})`,
      drones.length === 3 && drones.every((x, i) => Math.abs(x - 7 * (i + 1)) < 0.2));
  }

  // ---- the Automaton's death, as the record sees it -----------------------
  {
    const scene = makeScene(900);
    const root = onGround(spec("siege_automaton"), 300);
    const motion = createMotion();
    motion.update([root], scene.platforms, 0);
    killEntity(root, root, null, scene, makeCtx(scene));
    const { log, kicks } = run(root, scene, 6.5, { motion });
    const at = (pred) => { const e = log.find(pred); return e ? e.t : undefined; };
    const near = (a, b) => a !== undefined && Math.abs(a - b) <= STEP + 1e-9;
    t.ok("death: the root's death edge is recorded", near(at((e) => e.kind === "death"), STEP));
    t.ok("death: the overload's spawn", near(at((e) => e.kind === "spawn" && e.def === "overload"), STEP));
    const pod = at((e) => e.kind === "spawnDeath" && e.def === "podCharge");
    const cannon = at((e) => e.kind === "spawnDeath" && e.def === "cannonCharge");
    const over = at((e) => e.kind === "spawnDeath" && e.def === "overload");
    const wreck = at((e) => e.kind === "wreckEnd");
    t.ok(`death: the pod charge at 0.4s (${pod})`, near(pod, 0.4 + STEP));
    t.ok(`death: the cannon charge at 1.0s (${cannon})`, near(cannon, 1.0 + STEP));
    t.ok(`death: the overload ends at 2.4s (${over})`, near(over, 2.4 + STEP));
    t.ok(`death: the wreck ends 3.8s after (${wreck})`, near(wreck, over + 3.8));
    const kickAt = (time) => (kicks.find((k) => Math.abs(k.t - time) < 1e-9) || {}).k;
    t.ok(`death: the blast kicks 29.6 (${kickAt(over)})`, Math.abs(kickAt(over) - 29.6) < 0.05);
    t.ok(`death: the wreck end kicks 2.3 (${kickAt(wreck)})`, Math.abs(kickAt(wreck) - 2.3) < 0.05);
    t.ok(`death: the pod and cannon charges kick 3 (${kickAt(pod)}, ${kickAt(cannon)})`, kickAt(pod) === 3 && kickAt(cannon) === 3);
  }
  {
    // A seeker's impact: its death is the blast.
    const scene = makeScene(900);
    const root = onGround(spec("siege_automaton"), 300);
    const motion = createMotion();
    motion.update([root], scene.platforms, 0);
    const seeker = spawnFromDef(root, "seekerMissile", 500, 300, {}, scene, makeCtx(scene));
    motion.update([root], scene.platforms, STEP);
    killEntity(root, seeker, null, scene, makeCtx(scene));
    root.spawned = root.spawned.filter((s) => s.alive);
    t.eq("seeker: its impact kicks 2.5", motion.update([root], scene.platforms, 2 * STEP), 2.5);
  }

  // ---- the mission's shake: kicks raise, they do not add -------------------
  {
    const m = new Mission(makeEl("canvas"), () => {});
    m.shake = 0;
    m.raiseShake(5 * KICK_TO_SHAKE);
    m.raiseShake(2.2 * KICK_TO_SHAKE);
    t.ok("shake: two kicks leave the larger, not the sum", Math.abs(m.shake - 5 / 14) < 1e-9);
    m.shake = 2;
    m.applyFeedback("shk", [0.25, 0.6]);
    t.eq("shake: a shk event with a lower cap does not cut a larger shake", m.shake, 2);
    m.shake = 0.1;
    m.applyFeedback("shk", [0.25, 0.6]);
    t.ok("shake: and still adds up to its cap below it", Math.abs(m.shake - 0.35) < 1e-9);
  }

  // ---- Husk Charger: a stop, its telegraph, its dash -----------------------
  {
    const scene = makeScene(900);
    const root = onGround(spec("husk_charger"), 500);
    const motion = createMotion();
    const rows = [];
    const ctx = makeCtx(scene);
    let time = 0;
    motion.update([root], scene.platforms, time);
    for (let i = 0; i < 180; i++) {
      updateSpecEnemy(root, STEP, scene, ctx);
      time += STEP;
      motion.update([root], scene.platforms, time);
      const r = motion.get(root);
      rows.push({ t: time, speed: r.speed, tele: r.parts.get("root").telegraph, action: r.action.id, events: r.events });
    }
    const lunge = rows.findIndex((r) => r.events.some((e) => e.kind === "action" && e.id === "lunge"));
    const tele = rows.findIndex((r, i) => i > lunge && r.tele);
    const stopped = rows.findIndex((r, i) => i > tele && r.speed < 5);
    const dash = rows.findIndex((r, i) => i > stopped && r.speed > 400);
    t.ok(`husk: records the lunge, a stop, its telegraph and its dash (${lunge}, ${tele}, ${stopped}, ${dash})`,
      lunge >= 0 && tele > lunge && stopped > tele && dash > stopped && rows[stopped].tele);
  }

  // ---- the same events on a viewer, from snapshots only ---------------------
  // The room steps; every third step it projects, and a viewer that simulates
  // nothing applies it. Both keep records each step. One drone is replaced
  // between two snapshots, which positional mirroring alone would miss.
  {
    const room = makeScene(900);
    const view = makeScene(900);
    view.soldiers = [];
    const ids = ["floating_factory", "breach_hopper", "siege_automaton"];
    const at = { floating_factory: [200, 150], breach_hopper: [300, null], siege_automaton: [560, null] };
    const make = (id) => { const s = spec(id); const [x, y] = at[id]; return instantiate(s, x, y ?? GROUND - s.root.body.h); };
    room.specRoots = ids.map(make);
    view.specRoots = ids.map(make);
    const ctx = makeCtx(room);
    const roomM = { get scene() { return { ...room, soldiers: [] }; }, endFor: () => null, collectedBy: () => [], control: new Map(), netStep: 0 };
    const viewM = { scene: view, owner: "A", control: new Map(), _ctx: makeCtx(view), applyFeedback() {} };
    const host = createMotion(), seen = createMotion();
    const hostLog = [], viewLog = [];
    const note = (motion, scene, log, time) => {
      motion.update(scene.specRoots, scene.platforms, time);
      scene.specRoots.forEach((r, i) => {
        for (const e of motion.get(r).events) if (e.kind !== "phase") log.push(`${i}:${e.kind}:${e.part || e.def || e.id || ""}`);
      });
    };
    note(host, room, hostLog, 0);
    note(seen, view, viewLog, 0);
    let time = 0, replaced = false;
    for (let i = 1; i <= 60 * 16; i++) {
      for (const r of room.specRoots) updateSpecEnemy(r, STEP, room, ctx);
      time += STEP;
      const factory = room.specRoots[0];
      if (!replaced && i % 3 === 1 && time > 8 && factory.spawned.length) {
        // Between two snapshots: the drone dies and a new one takes its slot.
        killEntity(factory, factory.spawned[0], null, room, ctx);
        factory.spawned = factory.spawned.filter((s) => s.alive);
        factory.spawnStamps = [];
        spawnFromDef(factory, "drone", factory.x + 50, factory.y + 80, {}, room, ctx);
        replaced = true;
      }
      note(host, room, hostLog, time);
      if (i % 3 === 0) applySnapshot(viewM, projectScene(roomM, "A"));
      note(seen, view, viewLog, time);
    }
    const count = (log, s) => log.filter((x) => x === s).length;
    t.ok("viewer: the drone replaced between snapshots is a new spawn", replaced && count(viewLog, "0:spawn:drone") === count(hostLog, "0:spawn:drone") && count(hostLog, "0:spawn:drone") >= 3);
    t.ok("viewer: and its predecessor's death is seen", count(viewLog, "0:spawnDeath:drone") === count(hostLog, "0:spawnDeath:drone") && count(hostLog, "0:spawnDeath:drone") >= 1);
    // A viewer sees three steps' events at once, so order is compared per root
    // and per kind: the same actions in order, the same rounds by part, the
    // same spawns and deaths by def.
    const byKind = (log) => {
      const out = {};
      for (const x of log) { const k = x.split(":").slice(0, 2).join(":"); (out[k] ||= []).push(x); }
      return Object.keys(out).sort().map((k) => out[k].join(" ")).join("\n");
    };
    t.eq("viewer: the same events, in order per enemy and kind", byKind(viewLog), byKind(hostLog));
    t.ok("viewer: the run had fire, actions and landings to compare",
      hostLog.some((x) => x.includes(":fire:")) && hostLog.some((x) => x.includes(":action:")) && hostLog.some((x) => x.includes(":land")));
  }
}
