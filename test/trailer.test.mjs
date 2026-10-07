// ---------------------------------------------------------------------------
// TRAILER — the takes table, the camera tracks and the take runner, headlessly
// (tech/trailer.md). What the capture draws is the frames' to show; this pins
// that a take is the same take every time it is run.
// ---------------------------------------------------------------------------

import { makeEl } from "./harness.mjs";
import { resetConfig } from "../src/game/config.js";
import { sampleScene, firstSampleDiff } from "../src/mission/checksum.js";
import { startTake, prerollTarget, frameOfBeat, STEP } from "../src/trailer/runner.js";
import { TAKES, RISK_FRAMINGS, SHOTS, missionSegments } from "../src/trailer/takes.js";
import { missionSpecById } from "../src/game/enemyspecs.js";
import { poseAt } from "../src/trailer/tracks.js";

// Every track in the table, named: the risk framings and every shot's own.
function allTracks() {
  return [
    ...RISK_FRAMINGS.map(([name, track]) => [`risk ${name}`, track]),
    ...missionSegments().map((g) => [`shot ${g.shot}.${g.index}`, g.make().camera.track]),
  ];
}

// On a grid of `step` beats.
const onGrid = (b, step) => Math.abs(b / step - Math.round(b / step)) < 1e-9;

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
        const into = track.keys.find((k) => k.b > b);
        if (into && into.ease === "whip") continue;
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

  // T3: the shot list is design/trailer.md's — 1 to 14 once each, in order,
  // end to end, 60 s — and each shot's segments tile it. Boundaries are on
  // the beat; cues land on the eighth (half a beat), where a round arrives.
  {
    t.eq("T3: fourteen shots, numbered in order", SHOTS.map((s) => s.n).join(","), Array.from({ length: 14 }, (_, i) => i + 1).join(","));
    t.ok("T3: the shots run end to end from 0", SHOTS.every((s, i) => s.from === (i ? SHOTS[i - 1].to : 0) && s.to > s.from));
    t.eq("T3: sixty seconds", SHOTS[SHOTS.length - 1].to * 0.5, 60);
    t.ok("T3: every shot boundary is on the beat", SHOTS.every((s) => onGrid(s.from, 1) && onGrid(s.to, 1)));
    const tiled = SHOTS.filter((s) => s.kind === "mission").every((s) =>
      s.segments[0].from === s.from && s.segments[s.segments.length - 1].to === s.to &&
      s.segments.every((g, i) => !i || g.from === s.segments[i - 1].to) && s.segments.every((g) => onGrid(g.from, 1)));
    t.ok("T3: each mission shot's segments tile it, on the beat", tiled);
  }

  // T3: every segment, run as the capture runs it.
  {
    const off = [];
    const unknown = [];
    for (const g of missionSegments()) {
      const name = `shot ${g.shot}.${g.index}`;
      const seg = g.make();
      for (const e of seg.level.enemies) if (!missionSpecById[e.type]) unknown.push(`${name}: ${e.type}`);
      for (const c of seg.cues || []) if (!onGrid(c.b, 0.5) || (c.until !== undefined && !onGrid(c.until, 0.5))) off.push(`${name} cue ${c.kind}@${c.b}`);
      if (seg.preroll && seg.preroll.b !== undefined && !onGrid(seg.preroll.b, 0.5)) off.push(`${name} preroll@${seg.preroll.b}`);

      const r = startTake(seg, { canvas: makeEl("canvas") });
      const frames = (g.to - g.from) * 30;
      const t0 = r.mission.time;
      const held = [];
      for (let f = 0; f < frames; f++) {
        r.frame();
        for (const c of r.cues) if (c.kind === "hold" && f >= c.at && f < c.end)
          held.push(r.mission.scene.specRoots[c.target.root].brainState.current === "__held");
      }

      // Each kill is the game's: a round reached it within two frames of its
      // beat, never the failsafe.
      for (const c of r.cues.filter((x) => x.kind === "kill")) {
        const what = c.target.part || c.target.soldier || `root ${c.target.root}`;
        t.ok(`T3 ${name}: ${what} dies to a round on its beat (cue ${c.at}, died ${c.dead})`,
          c.dead !== undefined && !c.forced && c.dead - c.at >= 0 && c.dead - c.at <= 2);
      }
      for (const c of r.cues.filter((x) => x.kind === "set")) t.ok(`T3 ${name}: the set cue found its target on its frame`, c.done === c.at);
      if (held.length) t.ok(`T3 ${name}: a held brain stays held`, held.every(Boolean));
      if (seg.preroll && seg.preroll.kind) {
        const want = prerollTarget(seg);
        t.ok(`T3 ${name}: ${seg.preroll.id || seg.preroll.part} ${seg.preroll.kind} lands on its frame (${want}; at ${r.landed.join(",")})`, r.landed.includes(want));
      }
      if (seg.speed) t.ok(`T3 ${name}: steps ${seg.speed} of the time per frame`, Math.abs(r.mission.time - t0 - frames * STEP * seg.speed) < 1e-9);
      if (g.shot === 7) {
        const tex = r.mission.scene.soldiers.find((s) => s.id === "tex");
        t.ok("T3 shot 7: Tex ducked the round (the reflex, not an input)", tex.duck && tex.duck.log.length > 0);
      }
    }
    t.ok(`T3: every enemy a segment places is on the roster${unknown.length ? ` — ${unknown.join("; ")}` : ""}`, !unknown.length);
    t.ok(`T3: every cue and pre-roll is on the eighth-note grid${off.length ? ` — ${off.join("; ")}` : ""}`, !off.length);
  }
}
