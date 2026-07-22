// ---------------------------------------------------------------------------
// ENEMYSPEC BRAIN — drives a spec enemy's root through its states.
//
// Two arbitration modes over the same action vocabulary (the reconciliation of
// the two design docs — see docs/enemy_creation_system_plan.md):
//
//   "tracks"  — parallel scripted step sequences per state (choreographed
//               bosses: each track advances independently; blocking steps
//               occupy their track for a duration).
//   "utility" — every decisionInterval, gate actions by `when`, score them by
//               expression (+ small noise), run the winner through
//               windup → steps → recovery with NO cancelation mid-commitment
//               (smarter-AI doc: perfect reactions feel unfair; commitment
//               gives the player something to read and punish).
//
// Both modes share transitions ({ when: expr } / { event: signal }) and enter
// actions. Utility states may also carry ambient `tracks` that run alongside.
// ---------------------------------------------------------------------------

import { execStep, execStepsInstant, makeTrackStates, truthyEval, numberEval } from "./runtime.js";

const STEP_GUARD = 24; // max instant steps executed per track per frame

export function tickBrain(root, dt, scene, ctx) {
  const bs = root.brainState;
  const state = bs.def.states[bs.current];
  if (!state) return;
  bs.stateTime += dt;

  // ---- transitions (checked every frame in both modes) --------------------
  for (const tr of state.transitions) {
    let go = false;
    if (tr.when !== undefined) go = truthyEval(root, root, scene, tr.when);
    else if (tr.event !== undefined) go = root.pendingSignals.includes(tr.event);
    if (go) {
      switchState(root, tr.to, scene, ctx);
      root.pendingSignals.length = 0;
      return; // new state starts next frame
    }
  }
  root.pendingSignals.length = 0;

  // ---- scripted tracks ----------------------------------------------------
  for (let i = 0; i < state.tracks.length; i++) {
    tickTrack(root, root, state.tracks[i], bs.tracks[i], dt, scene, ctx);
  }

  // ---- utility action selection ------------------------------------------
  if (bs.def.mode === "utility") tickUtility(root, state, dt, scene, ctx);
}

function switchState(root, to, scene, ctx) {
  const bs = root.brainState;
  const next = bs.def.states[to];
  if (!next) return;
  bs.current = to;
  bs.stateTime = 0;
  bs.tracks = makeTrackStates(next);
  bs.commit = null; // a state change is the one thing that clears a commitment
  execStepsInstant(root, root, next.enter, scene, ctx);
}

// ---- track stepping -------------------------------------------------------
// ts: { i, block: null | { kind:"time", t } | { kind:"move" }, done, blockedThisLoop }

function tickTrack(root, self, track, ts, dt, scene, ctx) {
  if (ts.done || !track.steps.length) return;

  // resolve an active block first
  if (ts.block) {
    if (ts.block.kind === "time") {
      ts.block.t -= dt;
      if (ts.block.t > 0) return;
    } else if (ts.block.kind === "move") {
      if (self.moveOrder) return; // still traveling
    }
    ts.block = null;
  }

  let guard = STEP_GUARD;
  while (guard-- > 0) {
    if (ts.i >= track.steps.length) {
      if (!track.loop) { ts.done = true; return; }
      // validation guarantees a blocking step per loop; the flag backstops it
      if (!ts.blockedThisLoop) { ts.done = true; return; }
      ts.blockedThisLoop = false;
      ts.i = 0;
    }
    const step = track.steps[ts.i];
    ts.i++;
    const block = execStep(root, self, step, scene, ctx);
    if (block) {
      ts.blockedThisLoop = true;
      ts.block = block;
      if (block.kind === "time") {
        block.t -= dt; // the issuing frame consumes its share
        if (block.t <= 0) { ts.block = null; continue; }
      }
      return;
    }
  }
}

// ---- utility mode ---------------------------------------------------------
// bs.commit: { action, phase: "windup"|"steps"|"recovery", t, track, trackState }

function tickUtility(root, state, dt, scene, ctx) {
  const bs = root.brainState;

  if (bs.commit) {
    runCommit(root, bs.commit, dt, scene, ctx);
    return;
  }

  bs.decisionTimer -= dt;
  if (bs.decisionTimer > 0) return;
  bs.decisionTimer = state.decisionInterval;

  let best = null;
  let bestScore = 0;
  for (const a of state.actions) {
    if ((bs.cooldowns[a.id] || 0) > root.age) continue;
    if (a.when !== undefined && !truthyEval(root, root, scene, a.when)) continue;
    const score = numberEval(root, root, scene, a.score) + (root.rng() - 0.5) * 0.2;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  if (!best) return;

  bs.cooldowns[best.id] = root.age + best.cooldown;
  bs.commit = {
    action: best,
    phase: best.windup > 0 ? "windup" : "steps",
    t: best.windup,
    track: { id: `utility:${best.id}`, loop: false, steps: best.steps },
    trackState: { i: 0, block: null, done: false, blockedThisLoop: false },
  };
  if (best.windup > 0) root.telegraph = Math.max(root.telegraph, best.windup); // readable windup
}

function runCommit(root, commit, dt, scene, ctx) {
  const bs = root.brainState;
  switch (commit.phase) {
    case "windup":
      commit.t -= dt;
      if (commit.t <= 0) commit.phase = "steps";
      return;
    case "steps":
      tickTrack(root, root, commit.track, commit.trackState, dt, scene, ctx);
      if (commit.trackState.done || (commit.trackState.i >= commit.track.steps.length && !commit.trackState.block)) {
        commit.phase = "recovery";
        commit.t = commit.action.recovery;
      }
      return;
    case "recovery":
      commit.t -= dt;
      if (commit.t <= 0) bs.commit = null;
      return;
  }
}
