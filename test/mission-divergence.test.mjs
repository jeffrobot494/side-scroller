// ---------------------------------------------------------------------------
// MISSION DIVERGENCE — the lockstep probe (tech/multiplayer-missions.md, J0).
//
// The question J6 stands or falls on: can two clients running ONE lockstep
// mission consume the mission's single seeded stream in the same order? Before
// any floating-point question about two machines, there is a cheaper one that
// is answerable in one process — because the two clients differ by construction
// in which soldier is controlled, and control decides which code paths run:
//
//   * the controlled soldier is driven by input; every other soldier is driven
//     by updateCompanionSpec, which builds a spec agent off scene.rng on its
//     first tick and rolls the duck reflex against scene.rng every frame
//     (src/mission/ai.js),
//   * and both of them shoot through fire(), whose spread draw also comes off
//     scene.rng — but on a trigger rhythm that is the player's on one path and
//     the brain's on the other.
//
// So this suite runs the SAME mission — same seed, same level, same squad, same
// input trace, same fixed step — twice, changing nothing but `m.controlled`,
// and compares src/mission/checksum.js per step. Per step, not at the end: the
// useful output is the FIRST diverging frame, because the frame number is what
// identifies the draw site, and the checksum's sample list then names the field.
//
// A counter is wrapped around scene.rng (and around every root's copy of it,
// which is the same function) so the report can separate the two ways two runs
// can differ: they applied different inputs to different bodies, or they
// consumed the shared stream a different number of times. Only the second one
// is fatal to lockstep.
//
// The harness — seed, squad, step and trace — is imported from
// test/mission-golden.test.mjs rather than re-derived, so this probes the
// mission the regression bar already guards.
//
// WHAT IT FOUND: they diverge on frame 1, and they diverge in draw count on
// frame 1 (7 draws against 12) — so the two clients are reading different
// values out of one mulberry32 from the first step, and exchanging inputs
// cannot fix that. J1's owner axis is a PREREQUISITE for lockstep, not only for
// credit. The probe stays true after J1 (it drives one input source, so the two
// runs still put different bodies under it); what J1 earns is a second probe
// that drives two owners with two traces, which is the one that has to go
// quiet before J6 is lockstep. The cross-machine floating-point half is not
// built, on the row's own terms: it is only worth asking once this passes.
// ---------------------------------------------------------------------------

import { Mission } from "../src/mission/mission.js";
import { generateLevel } from "../src/game/gen/levelgen.js";
import { makeEl } from "./harness.mjs";
import { resetConfig } from "../src/game/config.js";
import { checksum, sampleScene, firstSampleDiff } from "../src/mission/checksum.js";
import { SEED, SQUAD, STEP, SECONDS, scriptedInput } from "./mission-golden.test.mjs";

const FRAMES = Math.round(SECONDS / STEP);

// ---- one run --------------------------------------------------------------

// `controlled` = the index of the soldier this client is inputting for. Every
// other knob is identical between runs.
function probe(controlled) {
  const { level, mission } = generateLevel({ seed: SEED, difficulty: "high" });
  const m = new Mission(makeEl("canvas"), () => {});
  m.start(mission, level, SQUAD);
  m.running = false; // the frames are ours from here, at a fixed step
  m.input = scriptedInput();
  m.controlled = controlled;

  // Count draws off the mission's stream. The wrapper goes on the scene AND on
  // every root, because loadMission handed each root the same function and the
  // runtime draws through `root.rng` — replacing only the scene's copy would
  // count the tick-time half and miss the brains.
  let draws = 0;
  const raw = m.scene.rng;
  const counted = () => { draws += 1; return raw(); };
  m.scene.rng = counted;
  for (const r of m.scene.specRoots) r.rng = counted;

  const rows = [];
  for (let f = 0; f <= FRAMES; f++) {
    rows.push({ f, sum: checksum(m.scene), draws, sample: sampleScene(m.scene) });
    m.input.advance(f);
    m.update(STEP);
  }
  return rows;
}

// First frame at which two runs disagree, with the field that did it.
function firstDivergence(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i].sum === b[i].sum) continue;
    return { frame: a[i].f, field: firstSampleDiff(a[i].sample, b[i].sample) };
  }
  return null;
}

// First frame at which the two runs have consumed a different NUMBER of draws
// from the shared stream. This is the stream-order question on its own, with
// the behavioural difference factored out.
function firstDrawGap(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++)
    if (a[i].draws !== b[i].draws) return { frame: a[i].f, a: a[i].draws, b: b[i].draws };
  return null;
}

// ---- assertions -----------------------------------------------------------

export default async function run(t) {
  // Same reason the golden does it: a mission reads gravity, run/jump speed,
  // aim spread, the duck chances and the companion brain, and ten suites assign
  // to config.
  resetConfig();

  const a = probe(0);
  const a2 = probe(0);
  const b = probe(1);

  // (1) the instrument is sound before it is believed. Two runs that differ in
  // NOTHING must agree at every step and consume the stream identically — if
  // they do not, the checksum is sampling something unseeded and every result
  // below is noise rather than divergence.
  const selfDiff = firstDivergence(a, a2);
  t.ok(
    `instrument: an unchanged run reproduces itself exactly${selfDiff ? ` — frame ${selfDiff.frame}, ${selfDiff.field}` : ""}`,
    !selfDiff
  );
  t.eq("instrument: and consumes the same number of draws", a2[FRAMES].draws, a[FRAMES].draws);

  // (2) the instrument is live. A checksum that never moves and a stream nobody
  // draws from would make (1) pass for the wrong reason.
  t.ok("instrument: the checksum moves as the mission runs", new Set(a.map((r) => r.sum)).size > 20);
  t.ok("instrument: the mission actually drew from its stream", a[FRAMES].draws > 50);

  // (3) THE PROBE. One soldier controlled versus another, everything else held.
  // A pass here would mean two clients could be handed the same seed and left
  // to run; a fail means J6 cannot be lockstep on control alone.
  const div = firstDivergence(a, b);
  t.ok(
    `probe: two clients differing only in which soldier is controlled DIVERGE${div ? ` — first at frame ${div.frame} (${div.field})` : ""}`,
    !!div
  );

  // (4) and the reason is the stream, not just the bodies. If the draw counts
  // part company, the two clients are reading different values out of one
  // mulberry32 from that frame on, and no amount of exchanging inputs fixes it:
  // the fix is J1, which makes both player-driven soldiers take the same path
  // on both clients.
  const gap = firstDrawGap(a, b);
  t.ok(
    `probe: and they consume the shared stream differently${gap ? ` — frame ${gap.frame}, ${gap.a} draws vs ${gap.b}` : ""}`,
    !!gap
  );

  // (5) the sample list is the thing to extend when a divergence slips past
  // (approximation 8), so hold its shape here: a checksum folded over a list
  // that had quietly lost a group would pass every comparison above.
  const names = a[0].sample.map(([n]) => n);
  for (const group of ["soldiers", "roots", "proj", "loot"])
    t.ok(`samples: the list covers ${group}`, names.includes(`${group}.n`));
  t.ok("samples: and the squad field by field", names.includes("soldiers[2].kills"));
  t.ok("samples: and the extraction grant the golden never reaches", names.includes("artifact"));
}
