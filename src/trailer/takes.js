// ---------------------------------------------------------------------------
// THE TAKES TABLE (tech/trailer.md). Data: what each take stages. DOM-free.
//
// A segment is { level, mission, squad, trace, frames, speed? }. `trace` is a
// pure function of the frame index, as test/mission-trace.mjs's scriptAt is.
// ---------------------------------------------------------------------------

import { generateLevel } from "../game/gen/levelgen.js";
import { RECRUIT_POOL } from "../game/soldiers.js";
import { ARSENAL_BY_ID } from "../game/arsenal.js";
import { poseAt, beatOf } from "./tracks.js";

export const FPS = 60;

// A recruit from the pool, as the mission takes a squad member. Copied, so a
// take never writes into the pool.
export function recruit(id, weaponId) {
  const data = RECRUIT_POOL.find((r) => r.id === id);
  const weapon = ARSENAL_BY_ID[weaponId];
  if (!data) throw new Error(`trailer: no recruit "${id}"`);
  if (!weapon) throw new Error(`trailer: no weapon "${weaponId}"`);
  return { data: { ...data, stats: { ...data.stats } }, weapon };
}

// T0's take: a plain generated level under the game's own camera. Tex leads,
// walks right and fires forward.
function proof() {
  const { level, mission } = generateLevel({ seed: 20261006, difficulty: "normal" });
  return {
    level,
    mission,
    squad: [recruit("tex", "burst_rifle"), recruit("vance", "carbine"), recruit("osei", "scattergun")],
    trace: (f) => ({
      held: { right: f > 20, fire: f > 60 },
      pressed: {},
      aim: { x: 1, y: 0 },
    }),
    frames: 4 * FPS,
  };
}

// Where a soldier stands: the middle of their feet, game coordinates.
export const feet = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h });

// T1's risk check: the proof take under the framing of every shot that leaves
// the straight-ahead axis, one second each, around the squad leader. The
// capture's last frame of each second is the still.
export const RISK_FRAMINGS = [
  ["4 low tracking, level with the mist", { kind: "track", keys: [{ b: 0, pos: [-160, -24, 240], at: [120, -30, 0], fov: 40 }, { b: 2, pos: [-100, -24, 240], at: [180, -30, 0], fov: 40 }] }],
  ["5 locked low, in front", { kind: "locked", keys: [{ b: 0, pos: [320, -18, 50], at: [0, -30, 0], fov: 38 }] }],
  ["6 orbit", { kind: "orbit", keys: [{ b: 0, center: [0, -30, 0], radius: 320, angle: 20, rise: 40, fov: 36 }, { b: 2, center: [0, -30, 0], radius: 320, angle: 45, rise: 40, fov: 36 }] }],
  ["7 shoulder height", { kind: "locked", keys: [{ b: 0, pos: [-80, -62, 110], at: [320, -50, -20], fov: 45 }] }],
  ["9 pan up from behind the squad", { kind: "crane", keys: [{ b: 0, pos: [-260, -40, 320], at: [200, -40, 0], fov: 45 }, { b: 2, pos: [-260, -40, 320], at: [420, -320, 0], fov: 45 }] }],
  ["10 long lens", { kind: "locked", keys: [{ b: 0, pos: [-220, -40, 2200], at: [0, -30, 0], fov: 10 }] }],
  ["11 wide pan", { kind: "whip", keys: [{ b: 0, pos: [-200, -260, 1100], at: [200, -160, 0], fov: 50 }, { b: 2, pos: [200, -260, 1100], at: [600, -160, 0], fov: 50 }] }],
];

function risk() {
  const seg = proof();
  seg.frames = RISK_FRAMINGS.length * FPS;
  seg.camera = (f, m) => {
    const lead = m.scene.soldiers[0];
    const [, track] = RISK_FRAMINGS[Math.min(RISK_FRAMINGS.length - 1, Math.floor(f / FPS))];
    return lead ? poseAt(track, beatOf(f % FPS), feet(lead)) : null;
  };
  return seg;
}

export const TAKES = { proof, risk };
