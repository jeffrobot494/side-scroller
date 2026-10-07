// ---------------------------------------------------------------------------
// THE TAKES TABLE (tech/trailer.md). Data: what each take stages. DOM-free.
//
// A segment is { level, mission, squad, trace, frames, speed? }. `trace` is a
// pure function of the frame index, as test/mission-trace.mjs's scriptAt is.
// ---------------------------------------------------------------------------

import { generateLevel } from "../game/gen/levelgen.js";
import { RECRUIT_POOL } from "../game/soldiers.js";
import { ARSENAL_BY_ID } from "../game/arsenal.js";

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

export const TAKES = { proof };
