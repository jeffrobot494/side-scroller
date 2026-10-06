// ---------------------------------------------------------------------------
// 3D VIEW — how each rigged enemy moves (tech/mission-3d-enemies.md M6–M9).
//
// The approved motions from the graphics tester, keyed by spec id, driven by
// what the enemy is DOING — the mission's motion record (enemyspec/motion.js)
// and the entity's own telegraph — rather than the tester's fixed clock:
//   idle / move  from the record's speed
//   attack       the telegraph is the windup (a = 0..WINDUP across it, however
//                long the real one is), then a runs on from WINDUP; `kick`
//                decays over 0.25s from each fire edge.
// The animation's clock lives on the view's model (`v.state`), never on an
// entity. Each function is the tester's, unchanged but for where its clock
// comes from.
// ---------------------------------------------------------------------------

import { legIK, stand, walk } from "./enemyrig.js";

const WINDUP = 0.6;    // s of the tester's attack spent telegraphing
const AFTER = 1.0;     // s an attack pose runs on past the telegraph
const KICK = 0.25;     // s a fire kick takes to decay
const MOVING = 20;     // px/s of record speed that reads as moving

// Legs at rest (models/enemies.py), in the model's frame (x forward, y up).
const LURK = { hip: { x: -1, y: -5 }, knee: { x: 4, y: -12 }, ankle: { x: -2, y: -19 },
  names: (s) => ["leg" + s, "shin" + s, "foot" + s] };
const named = (s) => [s + "Leg", s + "Shin", s + "Foot"];
const SIDES = ["right", "left"];
const BOT = { hip: { x: 0, y: -14 }, knee: { x: 5, y: -24 }, ankle: { x: -3, y: -33 }, names: named, sides: SIDES };
// The Bot's planted walk: the foot slides 16px over 45% of a cycle, so a cycle
// is 35.6px walked.
const BOT_WALK = { stance: 0.45, stride: 16, lift: 7, pitch: 0.5 };

// P: the poser. t: seconds. mode: idle|move|attack. a: the attack clock.
// kick: 0..1 after a round. v: the model. k: { walked } from the record.
export const ANIM = {
  husk_charger(P, t, mode, a) {
    const g = t * 15;
    const run = mode === "move" || (mode === "attack" && a > WINDUP && a < WINDUP + 0.5);
    const sw = run ? 0.6 : 0.05;
    P.rot("legFL", Math.sin(g) * sw); P.rot("legBR", Math.sin(g) * sw);
    P.rot("legFR", -Math.sin(g) * sw); P.rot("legBL", -Math.sin(g) * sw);
    P.lift(run ? Math.abs(Math.sin(g)) * 1.4 : Math.sin(t * 3) * 0.4);
    P.tilt(run ? -0.06 : 0);
    if (mode === "attack") {
      const crouch = a < WINDUP ? a / WINDUP : 0;
      const lunge = a >= WINDUP && a < WINDUP + 0.5 ? Math.sin(((a - WINDUP) / 0.5) * Math.PI) : 0;
      P.rot("head", -0.35 * crouch - 0.2 * lunge);
      P.shift(-3 * crouch + 14 * lunge);
    } else P.rot("head", Math.sin(t * 1.7) * 0.08 + (run ? -0.12 : 0));
  },

  // A stalking walk: each foot plants and slides back along the ground for
  // STANCE of the cycle, then lifts and swings forward. The cycle runs on the
  // distance walked, so a planted foot moves exactly with the ground.
  lurk_gunner(P, t, mode, a, kick, v, k) {
    const walk = mode === "move", STANCE = 0.6, STRIDE = 13;
    const ph = ((k.walked / (STRIDE / STANCE)) % 1 + 1) % 1;
    if (walk) {
      P.lift(0.9 * (1 - Math.cos(ph * 4 * Math.PI)) / 2);
      P.tilt(-0.05 + 0.02 * Math.sin(ph * 2 * Math.PI));
      P.shift(0.6 * Math.sin(ph * 4 * Math.PI));
    } else P.lift(Math.sin(t * 2) * 0.4);
    P.tilt(-0.12 * kick);
    P.rot("head", Math.sin(t * 1.3) * 0.06 + (walk ? 0.05 * Math.sin(ph * 4 * Math.PI) : 0));
    const aim = mode === "attack" ? Math.min(1, a / 0.3) * (a < WINDUP + 0.6 ? 1 : 0) : 0;
    P.rot("gun", 0.18 * aim + 0.35 * kick + (walk ? Math.sin(ph * 2 * Math.PI) * 0.06 : 0));
    for (const [side, off] of [["R", 0], ["L", 0.5]]) {
      let dx = 0, up = 0, pitch = 0;
      if (walk) {
        const p = (ph + off) % 1;
        if (p < STANCE) {
          dx = STRIDE * (0.5 - p / STANCE);
          pitch = p > STANCE - 0.15 ? -0.5 * (p - STANCE + 0.15) / 0.15 : 0;
        } else {
          const u = (p - STANCE) / (1 - STANCE), e = u * u * (3 - 2 * u);
          dx = STRIDE * (e - 0.5);
          up = 5.5 * Math.sin(Math.PI * u);
          pitch = -0.5 * (1 - u) + 0.25 * Math.sin(Math.PI * u);
        }
      }
      legIK(P, v.body, LURK, side, LURK.ankle.x + dx, LURK.ankle.y + up, pitch);
    }
  },

  spore_wisp(P, t, mode, a, kick) {
    const beat = Math.sin(t * 3);
    P.squash(1 + 0.04 * beat, 1 - 0.06 * beat);
    P.lift(Math.sin(t * 2.2) * 3);
    P.tilt(mode === "move" ? -0.15 : 0);
    for (let i = 0; i < 5; i++) P.rot(`t${i}`, Math.sin(t * 2 + i * 1.3) * 0.25 + (mode === "move" ? 0.3 : 0), Math.sin(t * 1.5 + i) * 0.2);
    const swell = mode === "attack" && a < WINDUP ? a / WINDUP : 0;
    P.scale("pods", 1 + 0.35 * swell - 0.25 * kick);
  },

  strafe_raider(P, t, mode, a, kick) {
    const pass = mode !== "idle";
    P.lift(Math.sin(t * 2.4) * 1.5);
    P.tilt(pass ? -0.1 : Math.sin(t * 1.1) * 0.04);
    P.roll(pass ? Math.sin(t * 1.8) * 0.9 : Math.sin(t * 1.5) * 0.3);
    if (mode === "attack") P.shift(a < WINDUP ? -4 * (a / WINDUP) : 30 * Math.sin(Math.min(1, (a - WINDUP) / 0.55) * Math.PI) - 3 * kick);
  },

  cowardly_duelist(P, t, mode, a, kick) {
    const g = t * 9, back = mode === "move";
    P.rot("legL", back ? Math.sin(g) * 0.5 : Math.sin(t * 2) * 0.05);
    P.rot("legR", back ? -Math.sin(g) * 0.5 : -Math.sin(t * 2) * 0.05);
    P.lift(back ? Math.abs(Math.cos(g)) * 1.3 : 0);
    P.shift(back ? 0 : Math.sin(t * 2) * 0.7);
    P.tilt(back ? 0.12 : 0);
    P.rot("coat", back ? 0.25 + Math.sin(g * 2) * 0.05 : Math.sin(t * 2) * 0.05);
    // A nervous glance over its shoulder every few seconds.
    const glance = Math.max(0, Math.sin(t * 0.9)) ** 8;
    P.rot("head", Math.sin(t * 7) * 0.03, glance * 1.2);
    const aim = mode === "attack" ? Math.min(1, a / 0.35) * (a < WINDUP + 0.6 ? 1 : 0) : 0;
    P.rot("gun", 0.12 * aim + 0.4 * kick - (back ? 0.25 : 0));
  },

  sky_duelist(P, t, mode, a, kick) {
    P.lift(Math.sin(t * 2) * 2.5);
    P.tilt(mode === "move" ? -0.14 : Math.sin(t * 1.3) * 0.05);
    P.roll(Math.sin(t * 1.1) * 0.12);
    P.rot("rider", mode === "move" ? -0.1 : Math.sin(t * 1.7) * 0.04);
    const aim = mode === "attack" ? Math.min(1, a / 0.3) * (a < WINDUP + 0.6 ? 1 : 0) : 0;
    P.rot("gun", 0.1 * aim + 0.35 * kick);
  },

  iron_moth(P, t, mode, a, kick, v) {
    const rate = mode === "move" ? 7 : 4;
    for (const w of v.wings) {
      w.hinge.rotation.y = w.side * Math.sin(t * rate) * 0.5;
      w.hinge.rotation.z = w.side * Math.sin(t * rate + 0.6) * 0.08;
    }
    P.lift(Math.sin(t * 1.6) * 4);
    P.rot("antL", Math.sin(t * 2.5) * 0.12 - 0.04); P.rot("antR", -Math.sin(t * 2.5 + 0.7) * 0.12 + 0.04);
    const open = mode === "attack" ? (a < WINDUP ? a / WINDUP : Math.max(0, 1 - (a - WINDUP) / 0.5)) : 0.1 + 0.1 * Math.sin(t * 3);
    P.rot("jawL", 0.4 * open); P.rot("jawR", -0.4 * open);
  },
};

// A breaching robot (M7), from the tester's Assault Bot, re-timed to the
// fight. Runs with planted feet, leaning in, fist pumping. rifleBurst: the
// rifle comes up through the windup and kicks on each round. punchCombo: the
// fist cocks back through the windup and jabs on each round. screenLeap:
// crouches through the windup, tucks in the air, lands hard, then its punch or
// rifle on their own rounds. Any other time in the air tucks too.
ANIM.breach_hopper = function (P, t, mode, a, kick, v, s) {
  const st = v.state, dt = s.dt, act = s.act.id;
  const look = Math.sin(t * 0.7) ** 3 * 0.35;
  P.rot("head", Math.sin(t * 1.1) * 0.05, look);
  const leap = act === "screenLeap" || act === "vaultUp";
  // Smoothed pose targets: crouch in a jump's windup, tuck in the air, the
  // rifle up for a burst (and after a leap's landing, where it fires).
  const sinceLand = s.landAt !== undefined ? t - s.landAt : 9;
  const crouch = Math.max(ease(st, "crouch", leap && s.act.phase === "windup" ? 1 : 0, 6, dt), bump(0, 0.42, sinceLand) * 0.9);
  const tuck = ease(st, "tuck", s.air ? 1 : 0, 8, dt);
  const punching = s.fired("fistArm").some((x) => t - x < 0.45);
  const up = ease(st, "up", act === "rifleBurst" || (act === "screenLeap" && s.act.phase !== "windup" && !s.air && !punching) ? 1 : 0, 9, dt);
  const rec = recoil(t, s.fired("gunArm"), 0.12);
  // The jab: cocked back in punchCombo's windup, out on each round, back to
  // the guard 0.23s later (the tester's keyframes, anchored on the round).
  const cock = ease(st, "cock", act === "punchCombo" && s.act.phase === "windup" ? 1 : 0, 10, dt);
  let jab = 0;
  for (const x of s.fired("fistArm")) jab = Math.max(jab, interp([[0, 0], [0.06, 1], [0.13, 0.93], [0.23, 0.1], [0.3, 0]], t - x));
  const lunge = Math.max(cock * 0.3, jab);

  let gun = -0.28, arm = 0, fist = 0;
  if (s.air || tuck > 0.05) {
    // In the air: legs at rest under the body, feet pulled up.
    for (const side of SIDES) {
      const o = side === "right" ? 0.4 : -0.2;
      legIK(P, v.body, BOT, side, BOT.ankle.x + 3 * tuck + o, BOT.ankle.y + v.body.position.y + 8 * tuck, -0.3 * tuck);
    }
  } else if (s.moving && jab === 0) {
    const ph = ((s.walked / (BOT_WALK.stride / BOT_WALK.stance)) % 1 + 1) % 1;
    P.lift(-1.2 + 2.4 * (1 - Math.cos(ph * 4 * Math.PI)) / 2);
    P.tilt(-0.18 + 0.03 * Math.sin(ph * 4 * Math.PI));
    P.shift(1.2);
    arm = 0.3 * Math.sin(ph * 2 * Math.PI);
    fist = 0.15 - 0.15 * Math.sin(ph * 2 * Math.PI);
    gun = -0.1 + 0.05 * Math.sin(ph * 4 * Math.PI);
    walk(P, v, BOT, ph, BOT_WALK);
  } else {
    P.shift(Math.sin(t * 1.3) * 0.6);
    P.lift(Math.sin(t * 2) * 0.4);
    arm = 0.06 * Math.sin(t * 1.7);
    fist = 0.08 * Math.sin(t * 1.7 + 0.5);
    stand(P, v, BOT);
  }
  // The punch: the upper arm swings level and the elbow straightens.
  if (cock > 0 || jab > 0) {
    arm = -0.3 * cock * (1 - jab) + 1.3 * jab;
    fist = 0.3 * cock * (1 - jab) - 1.95 * jab;
    P.shift(5 * lunge); P.tilt(-0.16 * lunge); P.lift(-2 * lunge);
    P.yaw(-0.25 * cock * (1 - jab) + 0.18 * jab);
  }
  // The leap: crouch, then tuck.
  if (crouch > 0 || tuck > 0) {
    P.lift(-7 * crouch);
    P.tilt(-0.22 * crouch + 0.04 * tuck);
    arm += -0.3 * crouch + 0.5 * tuck;
    fist += 0.3 * crouch - 0.3 * tuck;
  }
  gun = gun * (1 - up) + up * s.aim(2, 14) - 0.45 * lunge - 0.4 * crouch + 0.35 * tuck + 0.3 * rec;
  P.tilt(-0.04 * up + 0.05 * rec); P.shift(-1.2 * rec);
  P.rot("gunArm", gun);
  P.rot("fistArm", arm);
  P.rot("fist", fist);
  P.rot("jets", -0.25 * tuck + Math.sin(t * 2) * 0.05 * (1 - tuck));
};

export const hasMotion = (id) => typeof ANIM[id] === "function";

// This frame's mode, attack clock and kick for one rigged root, from its
// record and its parts' telegraphs, plus what the event-driven motions read:
//   act       the committed action { id, phase, at (its start), phaseAt }
//   fired(p)  the times of part p's recent rounds (the last 1.5s)
//   air       airborne now; upAt / landAt the last takeoff and landing
//   dt        seconds since this model's last frame (for smoothing)
// `st` is the model's own state; `aim` is filled in by the caller.
export function clock(st, root, rec, time) {
  const dt = st.time === undefined ? 0 : Math.max(0, Math.min(0.1, time - st.time));
  st.time = time;
  st.fires ??= {};
  if (rec) {
    for (const ev of rec.events) {
      if (ev.kind === "fire") (st.fires[ev.part] ??= []).push(time);
      else if (ev.kind === "action") st.actAt = time;
      else if (ev.kind === "takeoff") st.upAt = time;
      else if (ev.kind === "land") st.landAt = time;
    }
    for (const k in st.fires) st.fires[k] = st.fires[k].filter((x) => time - x < 1.5);
  }
  const act = rec && rec.action.id
    ? { id: rec.action.id, phase: rec.action.phase, at: st.actAt ?? rec.action.since, phaseAt: rec.action.since }
    : { id: "", phase: "", at: time, phaseAt: time };
  const base = attackClock(st, root, rec, time);
  return {
    ...base, dt, act,
    moving: !!(rec && rec.speed > MOVING),
    fired: (p) => st.fires[p] || [],
    air: !!(rec && rec.airborne), upAt: st.upAt, landAt: st.landAt,
  };
}

function attackClock(st, root, rec, time) {
  // The longest telegraph on any part: the windup the player is reading.
  let tele = 0;
  const walk = (e) => {
    if (!e.alive) return;
    if (!e.disabled && e.telegraph > tele) tele = e.telegraph;
    for (const c of e.children) walk(c);
  };
  walk(root);
  if (tele > 0) {
    if (!(st.teleTotal > 0)) { st.teleTotal = tele; st.teleEnd = null; }
    st.teleTotal = Math.max(st.teleTotal, tele);
  } else if (st.teleTotal > 0) {
    st.teleTotal = 0;
    st.teleEnd = time;
  }
  if (rec) for (const ev of rec.events) if (ev.kind === "fire") st.fireAt = time;

  let mode, a = 0;
  if (tele > 0) {
    mode = "attack";
    a = WINDUP * Math.min(0.999, 1 - tele / st.teleTotal);
  } else if (st.teleEnd !== null && st.teleEnd !== undefined && time - st.teleEnd < AFTER) {
    mode = "attack";
    a = WINDUP + (time - st.teleEnd);
  } else {
    mode = rec && rec.speed > MOVING ? "move" : "idle";
  }
  const kick = st.fireAt !== undefined ? Math.max(0, 1 - (time - st.fireAt) / KICK) : 0;
  return { mode, a, kick, walked: rec ? rec.walked : 0, telegraph: tele > 0 };
}

// Cycle helpers: 0..1 ease between two times, a 0..1..0 hump, keyframes,
// the recoil left by rounds fired at `times`, and a value eased toward a
// target at `rate` per second (kept in `st`).
export function smooth(a, b, x) { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); }
export function bump(a, b, x) { return x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI); }
export function interp(keys, x) {
  for (let i = 1; i < keys.length; i++) {
    if (x <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      return v0 + (v1 - v0) * smooth(t0, t1, x);
    }
  }
  return keys[keys.length - 1][1];
}
export function recoil(t, times, len) {
  let r = 0;
  for (const s of times) if (t >= s && t < s + len) r = Math.max(r, 1 - (t - s) / len);
  return r;
}
function ease(st, key, target, rate, dt) {
  const v = st[key] ?? target;
  return (st[key] = v + (target - v) * Math.min(1, rate * dt));
}
