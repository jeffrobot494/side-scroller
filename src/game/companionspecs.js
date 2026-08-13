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
      // loose ~90px standoff so we don't body-block. Engage on RANGE alone. The
      // old ±40px band (sense.playerAbove/Below) was inherited from
      // updateCompanion, which could only shoot horizontally; a companion that
      // aims in 2D has no reason to ignore the alien on the ledge.
      //
      // Not gated on sense.los on purpose: engaging is what puts the agent in
      // keepDistance, and keepDistance is what lets it reposition to FIND a
      // sight line (tech/ranged-repositioning.md). Requiring the sight line to
      // engage would mean cover permanently pins a companion in escort.
      escort: {
        enter: [{ setMotion: { type: "static" } }],
        tracks: [{ id: "follow", loop: true, steps: [
          { moveTo: { target: "anchor", offset: [-90, 0], speed: 320, timeout: 0.6 } },
          { wait: 0.12 },
        ] }],
        transitions: [{ when: "sense.dist < 520", to: "combat" }],
      },
      // Hold a firing standoff from the nearest enemy (keepDistance) and shoot on
      // a loop; the weapon's own fire rate throttles it. Only shoot at something
      // we can SEE — the shot now follows the aim vector, so a companion under a
      // ledge would otherwise empty a magazine into its underside. Break off on
      // distance alone: an enemy that is close but unseeable is a repositioning
      // problem, not a reason to go re-form on the leader.
      combat: {
        enter: [{ setMotion: { type: "keepDistance", min: 220, max: 340, speed: 320 } }],
        tracks: [{ id: "fight", loop: true, steps: [
          { if: { when: "sense.los", then: [{ fire: { emitter: "weapon" } }] } },
          { wait: 0.18 },
        ] }],
        transitions: [{ when: "sense.dist > 640", to: "escort" }],
      },
    },
  },
};

export const DEFAULT_COMPANION_SPEC = normalizeSpec(DEFAULT_COMPANION);
