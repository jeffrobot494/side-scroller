// ---------------------------------------------------------------------------
// TRAILER — the takes table, the camera tracks and the take runner, headlessly
// (tech/trailer.md). What the capture draws is the frames' to show; this pins
// that a take is the same take every time it is run.
// ---------------------------------------------------------------------------

import { makeEl } from "./harness.mjs";
import { resetConfig } from "../src/game/config.js";
import { sampleScene, firstSampleDiff } from "../src/mission/checksum.js";
import { startTake } from "../src/trailer/runner.js";
import { TAKES } from "../src/trailer/takes.js";

function samples(make, frames) {
  const take = startTake(make(), { canvas: makeEl("canvas") });
  const rows = [];
  for (let f = 0; f < frames; f++) {
    take.frame();
    rows.push(sampleScene(take.mission.scene));
  }
  return rows;
}

export default async function run(t) {
  resetConfig();

  // T0: a segment run twice gives the same scene on every frame. Cosmetic
  // draws stay on Math.random and are never sampled; the page seeds those.
  {
    const a = samples(TAKES.proof, 180);
    const b = samples(TAKES.proof, 180);
    let diff = null;
    for (let f = 0; f < a.length && !diff; f++) {
      const d = firstSampleDiff(a[f], b[f]);
      if (d) diff = `frame ${f}: ${d}`;
    }
    t.ok(`T0: the proof take replays identically${diff ? ` — ${diff}` : ""}`, !diff);
    const x = (rows, f) => rows[f].find(([n]) => n === "soldiers[0].x")[1];
    t.ok("T0: the take moved (the trace reached the mission)", Math.abs(x(a, 179) - x(a, 0)) > 40);
    t.ok("T0: shots were fired", a.some((r) => r.find(([n]) => n === "proj.n")[1] > 0));
  }
}
