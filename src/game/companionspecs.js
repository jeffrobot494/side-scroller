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

// Shoot on a loop; the weapon's own fire rate throttles it.
const FIGHT = { id: "fight", loop: true, steps: [
  { if: { when: "sense.shot && !sense.outOfAmmo", then: [{ fire: { emitter: "weapon" } }] } },
  { wait: 0.18 },
] };

const DEFAULT_COMPANION = {
  v: 1, id: "default_companion", name: "Squadmate", threat: 1, role: "support", tier: 1, intelligence: 3,
  root: {
    id: "root", tags: ["ally"],
    visual: { shape: "box", size: [30, 46], color: "#6fcf97" },
    body: { locomotor: "soldier", gravity: 1 },
    health: { max: 1 }, // formality — the Soldier owns the real HP
    // The escort controller, authored TWICE on purpose: a brain state's `enter`
    // steps run on switchState only, so the START state's never fire (brain.js)
    // and a companion would spend its first escort on the root's motion. The
    // state's setMotion below is what restores this one on the way back from
    // combat; this is what it starts on.
    motion: { type: "follow", leader: "anchor", standoff: 90, spread: 40, speed: 320 },
    emitters: { weapon: { at: [0, -6], projectile: { speed: 700, damage: 1, life: 1 } } },
  },
  brain: {
    start: "escort",
    states: {
      // Keep station near the leader (sense.anchor* = the controlled soldier),
      // 90px to one side so we don't body-block. NO TRACK: the `follow`
      // controller is re-asked every frame and resolves its own point, where the
      // moveTo/wait loop this replaces walked to a snapshot of the leader,
      // stopped on a 0.6s timeout and waited — which is what made a squadmate
      // follow in bursts (tech/nav-audit.md §1, tech/soldier-behavior.md E1).
      //
      // Engage on RANGE alone. The
      // old ±40px band (sense.playerAbove/Below) was inherited from
      // updateCompanion, which could only shoot horizontally; a companion that
      // aims in 2D has no reason to ignore the alien on the ledge.
      //
      // Not gated on sense.los on purpose: engaging is what puts the agent in
      // keepDistance, and keepDistance is what lets it reposition to FIND a
      // sight line (tech/ranged-repositioning.md). Requiring the sight line to
      // engage would mean cover permanently pins a companion in escort.
      //
      // COVER (tech/squad-survival.md, V3) is wired by one table, checked every
      // frame, so every exit is guarded by the negation of the entry it could
      // bounce off and range uses 520 engage / 640 disengage as hysteresis.
      // leaderFar has its own (the leash and its margin). An empty squadmate
      // never enters combat, and only takes cover with a fight in range, which
      // is what stops it flipping between cover and escort.
      escort: {
        enter: [{ setMotion: { type: "follow", leader: "anchor", standoff: 90, spread: 40, speed: 320 } }],
        transitions: [
          { when: "!sense.leaderFar && ((sense.underFire && sense.wounded) || ((sense.needReload || sense.outOfAmmo) && sense.dist < 520))", to: "cover" },
          { when: "sense.dist < 520 && !sense.outOfAmmo", to: "combat" },
        ],
      },
      // Hold a firing standoff from the nearest enemy (keepDistance) and shoot on
      // a loop; the weapon's own fire rate throttles it. Only shoot at something
      // we can SEE — the shot now follows the aim vector, so a companion under a
      // ledge would otherwise empty a magazine into its underside. Break off on
      // distance alone: an enemy that is close but unseeable is a repositioning
      // problem, not a reason to go re-form on the leader.
      //
      // The trigger is gated on a usable shot and on having rounds, so an empty
      // squadmate does not dry-click (sense.shot is line of sight until V4).
      combat: {
        enter: [{ setMotion: { type: "keepDistance", min: 420, max: 600, speed: 320 } }],
        tracks: [FIGHT],
        transitions: [
          { when: "!sense.leaderFar && ((sense.underFire && sense.wounded) || sense.needReload || sense.outOfAmmo)", to: "cover" },
          // Out of ammo reaches this row only while the leader is far.
          { when: "sense.dist > 640 || sense.outOfAmmo", to: "escort" },
        ],
      },
      // Break contact while wounded and hit, reloading, or empty; come back out
      // when it is calm. It still returns fire from cover if it has the shot.
      cover: {
        enter: [{ setMotion: { type: "cover", speed: 320 } }],
        tracks: [FIGHT],
        transitions: [
          { when: "sense.leaderFar", to: "escort" },
          { when: "sense.calm && sense.dist > 640", to: "escort" },
          { when: "sense.calm && !sense.needReload && !sense.outOfAmmo && sense.dist <= 640", to: "combat" },
        ],
      },
    },
  },
};

export const DEFAULT_COMPANION_SPEC = normalizeSpec(DEFAULT_COMPANION);
