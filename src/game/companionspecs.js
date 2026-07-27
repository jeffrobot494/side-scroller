// ---------------------------------------------------------------------------
// DEFAULT COMPANION (EnemySpec) — the squad AI on the SHARED agent brain.
//
// Companions are Soldier bodies (player-controllable, real weapons) driven by a
// spec's perception + brain through the `soldier` locomotor (docs/
// LOCOMOTOR-REFACTOR.md, Slice L3). This spec reproduces the old hand-written
// updateCompanion (src/mission/ai.js): escort the leader, and when an enemy is
// close and roughly level, hold a standoff and fire the equipped weapon.
//
// Same EnemySpec format as enemyspecs.js — so a smarter companion is now a data
// change, not code. Kept behind config.companionBrain ("legacy" default) until
// it's eyeballed in the Behavior Lab; then updateCompanion retires.
//
// Two body leaks the format still needs a nod to:
//   - body.locomotor:"soldier" picks the soldier locomotor (else gravity would).
//   - the `weapon` emitter exists ONLY to satisfy fire-action validation; the
//     runtime routes a soldier-bodied `fire` to the Soldier's real equipped
//     weapon (self.fireWeapon), never this projectile.
// ---------------------------------------------------------------------------

import { normalizeSpec } from "./enemyspec/normalize.js";

const DEFAULT_COMPANION = {
  v: 1, id: "default_companion", name: "Squadmate", threat: 1, role: "support", tier: 1, intelligence: 3,
  root: {
    id: "root", tags: ["ally"],
    visual: { shape: "box", size: [30, 46], color: "#6fcf97" },
    body: { locomotor: "soldier", gravity: 1 },
    health: { max: 1 }, // formality — the Soldier owns the real HP
    motion: { type: "static" },
    emitters: { weapon: { at: [0, -6], projectile: { speed: 700, damage: 1, life: 1 } } },
  },
  brain: {
    start: "escort",
    states: {
      // Follow the leader (sense.anchor* = the controlled soldier), holding a
      // loose ~90px standoff so we don't body-block. Engage when an enemy is in
      // range AND roughly level (matches updateCompanion's 520px / 70px window).
      escort: {
        enter: [{ setMotion: { type: "static" } }],
        tracks: [{ id: "follow", loop: true, steps: [
          { moveTo: { target: "anchor", offset: [-90, 0], speed: 320, timeout: 0.6 } },
          { wait: 0.12 },
        ] }],
        transitions: [{ when: "sense.dist < 520 && !sense.playerAbove && !sense.playerBelow", to: "combat" }],
      },
      // Hold a firing standoff from the nearest enemy (keepDistance) and shoot on
      // a loop; the weapon's own fire rate throttles it. Break off when the enemy
      // is lost (too far, or no longer level) and re-form on the leader.
      combat: {
        enter: [{ setMotion: { type: "keepDistance", min: 220, max: 340, speed: 320 } }],
        tracks: [{ id: "fight", loop: true, steps: [
          { fire: { emitter: "weapon" } },
          { wait: 0.18 },
        ] }],
        transitions: [{ when: "sense.dist > 640 || sense.playerAbove || sense.playerBelow", to: "escort" }],
      },
    },
  },
};

export const DEFAULT_COMPANION_SPEC = normalizeSpec(DEFAULT_COMPANION);
