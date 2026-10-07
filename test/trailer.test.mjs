// ---------------------------------------------------------------------------
// TRAILER — the takes table, the camera tracks and the take runner, headlessly
// (tech/trailer.md). What the capture draws is the frames' to show; this pins
// that a take is the same take every time it is run.
// ---------------------------------------------------------------------------

import { makeEl } from "./harness.mjs";
import { resetConfig } from "../src/game/config.js";
import { sampleScene, firstSampleDiff } from "../src/mission/checksum.js";
import { startTake } from "../src/trailer/runner.js";
import { TAKES, RISK_FRAMINGS } from "../src/trailer/takes.js";
import { poseAt } from "../src/trailer/tracks.js";

// Every track in the table, named. T3 adds the shots' own.
function allTracks() {
  return RISK_FRAMINGS.map(([name, track]) => [`risk ${name}`, track]);
}

const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

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

  // T1: a track hits its keyframes on their beats, and between them moves no
  // further in a frame than it could at its steepest — except a whip-pan,
  // which is allowed its snap.
  {
    const subject = { x: 1000, y: 400 };
    let missed = null;
    let jumped = null;
    for (const [name, track] of allTracks()) {
      for (const k of track.keys) {
        const p = poseAt(track, k.b, subject);
        if (track.kind === "orbit") {
          const want = { x: subject.x + k.center[0], y: subject.y + k.center[1], z: k.center[2] };
          if (dist3(p.target, want) > 1e-6 || Math.abs(dist3(p.position, p.target) - Math.hypot(k.radius, k.rise || 0)) > 1e-6) missed ??= `${name} @${k.b}`;
        } else {
          const want = { x: subject.x + k.pos[0], y: subject.y + k.pos[1], z: k.pos[2] };
          if (dist3(p.position, want) > 1e-6 || Math.abs(p.fov - k.fov) > 1e-9) missed ??= `${name} @${k.b}`;
        }
      }
      if (track.kind === "whip") continue;
      const first = track.keys[0].b;
      const last = track.keys[track.keys.length - 1].b;
      const dt = 1 / 30; // one frame, in beats
      for (let b = first - 1; b < last + 1; b += dt) {
        const d = dist3(poseAt(track, b, subject).position, poseAt(track, b + dt, subject).position);
        if (d > 40) { jumped ??= `${name} @${b.toFixed(2)}: ${d.toFixed(1)}px`; break; }
      }
    }
    t.ok(`T1: every track hits its keyframes${missed ? ` — ${missed}` : ""}`, !missed);
    t.ok(`T1: no track jumps between frames but a whip-pan${jumped ? ` — ${jumped}` : ""}`, !jumped);
    const w = RISK_FRAMINGS.find(([, tr]) => tr.kind === "whip")[1];
    const snap = dist3(poseAt(w, 0.98, subject).position, poseAt(w, 1.02, subject).position);
    const hold = dist3(poseAt(w, 0.1, subject).position, poseAt(w, 0.14, subject).position);
    t.ok("T1: a whip-pan holds, then snaps", hold < 1e-6 && snap > 10);
  }
}
