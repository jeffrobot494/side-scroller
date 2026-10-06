// ---------------------------------------------------------------------------
// What an EnemySpec enemy is DOING, one small record per root, and the camera
// shake it raises (tech/mission-3d-enemies.md M5).
//
// Built only from fields the wire carries — position, alive/disabled,
// telegraph, each entity's fire count, each spawned entity's serial and def id,
// the committed utility action — so a room viewer, which simulates nothing,
// keeps the same records as the host and feels the same kicks. The mission
// runs it once per RENDERED frame; the 3D view reads the records and keeps none
// of its own. Three-free and DOM-free, and it never writes to an entity.
//
// Records use no randomness, so they cannot disturb a seeded replay.
// ---------------------------------------------------------------------------

// The tester's explosion shake for a blast of `size` px (enemy-fx.js).
const blast = (shake, size) => (shake * size) / 52;

// Per spec id: the tester's kicks (graphics-tester/enemies.js FX), in the
// tester's units — it jolts the camera ±k/2 world px. `fire` is per part,
// `blast` per def id of a spawned entity whose death is an explosion (keyed on
// the entity that SPAWNS the blast, because three of them spawn the same
// microBlast), `stride` the px walked per footfall, and `after` an event a
// spawned entity's death schedules.
export const MOTION = {
  breach_hopper: {
    kicks: { fire: { fistArm: 1.4 }, takeoff: 2, land: 5 },
  },
  siege_automaton: {
    stride: 34 / 0.62 / 2, // the planted walk: 34px of stride over 62% of a cycle, two feet
    after: { overload: { wreckEnd: 3.8 } }, // the wreck burns 3.8s past the blast
    kicks: {
      step: 2.2,
      fire: { cannonArm: 1.2 },
      takeoff: 4,
      land: 9,
      blast: { overload: blast(14, 110), podCharge: blast(3, 52), cannonCharge: blast(3, 52), seekerMissile: blast(2.5, 52) },
      wreckEnd: blast(3, 40),
    },
  },
};

// Tester units → the mission's shake: the tester jolts ±k/2 world px, the
// mission ±7 × shake screen px, so at zoom 1 a kick k is a shake of k/14.
export const KICK_TO_SHAKE = 1 / 14;

const SPEED_WINDOW = 0.2; // s of position history a speed is measured over
const LAND_MIN_AIR = 0.2; // s airborne before a landing counts (not a step down)
const ON_GROUND = 0.6;    // px between feet and a platform top that is standing

export function createMotion() {
  const records = new Map(); // root → record

  return {
    // Step every root's record to `time`. Returns the largest kick this frame,
    // in tester units (0 when nothing kicked).
    update(roots, platforms, time) {
      let kick = 0;
      const seen = new Set();
      for (const root of roots) {
        seen.add(root);
        let rec = records.get(root);
        if (!rec) records.set(root, (rec = makeRecord(root, platforms, time)));
        else step(rec, root, platforms, time);
        for (const ev of rec.events) kick = Math.max(kick, kickFor(rec.table, ev));
      }
      for (const r of records.keys()) if (!seen.has(r)) records.delete(r);
      return kick;
    },
    get: (root) => records.get(root) || null,
    clear: () => records.clear(),
  };
}

function kickFor(table, ev) {
  const k = table && table.kicks;
  if (!k) return 0;
  if (ev.kind === "fire") return (k.fire && k.fire[ev.part]) || 0;
  if (ev.kind === "spawnDeath") return (k.blast && k.blast[ev.def]) || 0;
  return typeof k[ev.kind] === "number" ? k[ev.kind] : 0;
}

function standing(root, platforms) {
  if (!root.alive) return false;
  const feet = root.y + root.h;
  for (const p of platforms) {
    if (root.x < p.x + p.w && root.x + root.w > p.x && Math.abs(feet - p.y) <= ON_GROUND) return true;
  }
  return false;
}

function commitOf(root) {
  const bs = root.brainState;
  const c = bs && bs.commit;
  return { id: c ? c.action.id : "", phase: c ? c.phase : "", serial: (bs && bs.commitSerial) || 0 };
}

function makeRecord(root, platforms, time) {
  const x = root.x + root.w / 2, y = root.y + root.h;
  const rec = {
    id: root.specTop ? root.specTop.id : root.id,
    table: MOTION[root.specTop ? root.specTop.id : root.id] || null,
    time, x, y,
    history: [[time, x]],
    speed: 0,               // px/s, horizontal, over SPEED_WINDOW
    airborne: !standing(root, platforms),
    airSince: time,
    walked: 0,              // px walked on the ground, ever
    nextStep: 0,            // `walked` at which the next footfall lands
    action: { ...commitOf(root), since: time },
    parts: new Map(),       // part id → { count, telegraph, alive }
    spawned: new Map(),     // serial → def id
    alive: root.alive,
    diedAt: root.alive ? null : time,
    timers: [],             // { at, kind } scheduled by `after`
    events: [],             // this frame's edges, read by the view
  };
  rec.nextStep = rec.table && rec.table.stride ? rec.table.stride : Infinity;
  walkParts(root, (e) => rec.parts.set(e.id, partState(e)));
  for (const sp of root.spawned) rec.spawned.set(sp.serial, sp.spec.id);
  return rec;
}

const partState = (e) => ({ count: e.fireCount || 0, telegraph: e.telegraph > 0, alive: e.alive && !e.disabled });

function walkParts(e, fn) {
  fn(e);
  for (const c of e.children) walkParts(c, fn);
}

function step(rec, root, platforms, time) {
  const ev = (rec.events = []);
  const x = root.x + root.w / 2, y = root.y + root.h;
  const dx = x - rec.x, dy = y - rec.y;

  // Speed over a short window: a viewer moves enemies at snapshot rate, and a
  // host renders frames with no step in them, so a per-frame speed flickers.
  rec.history.push([time, x]);
  while (rec.history.length > 2 && time - rec.history[1][0] >= SPEED_WINDOW) rec.history.shift();
  const [t0, x0] = rec.history[0];
  rec.speed = time > t0 ? Math.abs(x - x0) / (time - t0) : 0;

  // Airborne from the feet against the platforms, which both ends hold.
  if (root.alive) {
    const onFoot = standing(root, platforms);
    if (onFoot && rec.airborne) {
      if (time - rec.airSince >= LAND_MIN_AIR) ev.push({ kind: "land" });
      rec.airborne = false;
    } else if (!onFoot && !rec.airborne) {
      rec.airborne = true;
      rec.airSince = time;
      if (dy < 0) ev.push({ kind: "takeoff" }); // a jump, not a walk off a ledge
    }
    if (onFoot) {
      rec.walked += Math.abs(dx);
      while (rec.walked >= rec.nextStep) {
        ev.push({ kind: "step" });
        rec.nextStep += rec.table.stride;
      }
    }
  }

  // The committed action: a new serial is a new commitment, even of the same id.
  const c = commitOf(root);
  if (c.serial !== rec.action.serial && c.id) ev.push({ kind: "action", id: c.id });
  if (c.phase !== rec.action.phase && c.id) ev.push({ kind: "phase", id: c.id, phase: c.phase });
  if (c.serial !== rec.action.serial || c.phase !== rec.action.phase) rec.action = { ...c, since: time };

  // Each part's rounds, telegraph and life.
  walkParts(root, (e) => {
    const p = rec.parts.get(e.id);
    if (!p) { rec.parts.set(e.id, partState(e)); return; }
    const n = e.fireCount || 0;
    if (n > p.count) ev.push({ kind: "fire", part: e.id, n: n - p.count });
    p.count = n;
    p.telegraph = e.telegraph > 0;
    p.alive = e.alive && !e.disabled;
  });

  // Spawns by serial: a serial not seen before is new, one that has left the
  // list has died (spawned entities leave it only by dying).
  const now = new Set();
  for (const sp of root.spawned) {
    now.add(sp.serial);
    if (!rec.spawned.has(sp.serial)) {
      rec.spawned.set(sp.serial, sp.spec.id);
      ev.push({ kind: "spawn", def: sp.spec.id, serial: sp.serial });
    }
  }
  for (const [serial, def] of rec.spawned) {
    if (now.has(serial)) continue;
    rec.spawned.delete(serial);
    ev.push({ kind: "spawnDeath", def, serial });
    const after = rec.table && rec.table.after && rec.table.after[def];
    if (after) for (const [kind, s] of Object.entries(after)) rec.timers.push({ at: time + s, kind });
  }
  if (rec.timers.length) {
    for (const tm of rec.timers) if (tm.at <= time) ev.push({ kind: tm.kind });
    rec.timers = rec.timers.filter((tm) => tm.at > time);
  }

  if (rec.alive && !root.alive) {
    ev.push({ kind: "death" });
    rec.diedAt = time;
  }
  rec.alive = root.alive;
  rec.x = x;
  rec.y = y;
  rec.time = time;
}
