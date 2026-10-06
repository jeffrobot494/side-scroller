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

import { legIK } from "./enemyrig.js";

const WINDUP = 0.6;    // s of the tester's attack spent telegraphing
const AFTER = 1.0;     // s an attack pose runs on past the telegraph
const KICK = 0.25;     // s a fire kick takes to decay
const MOVING = 20;     // px/s of record speed that reads as moving

// Legs at rest (models/enemies.py), in the model's frame (x forward, y up).
const LURK = { hip: { x: -1, y: -5 }, knee: { x: 4, y: -12 }, ankle: { x: -2, y: -19 },
  names: (s) => ["leg" + s, "shin" + s, "foot" + s] };

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

export const hasMotion = (id) => typeof ANIM[id] === "function";

// This frame's mode, attack clock and kick for one rigged root, from its
// record and its parts' telegraphs. `st` is the model's own state.
export function clock(st, root, rec, time) {
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
