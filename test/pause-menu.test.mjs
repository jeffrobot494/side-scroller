// The pause menu (tech/pause-menu.md): P2's frozen frame loop, driven through
// the real `_frame` off a synthetic clock (rAF is a no-op under the harness).
import { makeEl } from "./harness.mjs";
import { Mission } from "../src/mission/mission.js";
import { generateLevel } from "../src/game/gen/levelgen.js";
import { sampleScene, firstSampleDiff } from "../src/mission/checksum.js";
import { config, setConfig, resetConfig } from "../src/game/config.js";
import { SEED, SQUAD } from "./mission-trace.mjs";

const FRAME = 1000 / 60;
const key = (m, code, down) => m.input._set({ code, preventDefault() {} }, down);
const tap = (m, code) => { key(m, code, true); key(m, code, false); };

function build() {
  const g = generateLevel({ seed: SEED, difficulty: "high" });
  const m = new Mission(makeEl("canvas"), () => {});
  m.start(g.mission, g.level, SQUAD);
  m.lastTime = 0;
  m.now = 0;
  m.tick = (n = 1) => { for (let i = 0; i < n; i++) m._frame((m.now += FRAME)); };
  return m;
}

export default async function run(t) {
  resetConfig();

  // ---- P2: Escape freezes a single-player mission -------------------------
  {
    const m = build();
    const seen = [];
    m.onPauseChange = (p) => seen.push(p);
    m.tick(10);
    const stepped = m.input.frame;
    t.ok("pause: frames step the mission before a pause", stepped >= 9);

    tap(m, "Escape");
    m.tick();
    t.ok("pause: Escape pauses", m.paused === true);
    t.eq("pause: the host is told", seen, [true]);

    let renders = 0;
    const draw = m.render.bind(m);
    m.render = () => { renders++; draw(); };
    const before = sampleScene(m.scene);
    const samples = m.input.frame;
    tap(m, "Space"); // a jump tapped behind the menu
    m.tick(120);
    t.eq("pause: two seconds paused take no input samples", m.input.frame, samples);
    t.ok("pause: ...and run no steps", firstSampleDiff(before, sampleScene(m.scene)) === null);
    t.eq("pause: ...but every frame still renders", renders, 120);

    // The camera is re-solved per frame, so a zoom change stays centred.
    const cam = { ...m.camera };
    setConfig("missionZoom", 0.5);
    m.tick();
    t.ok("pause: a zoom change re-solves the camera while paused", m.camera.x !== cam.x || m.camera.y !== cam.y);
    resetConfig();
    m.tick();

    // No shake offset on a frozen frame; the view is handed the offset.
    let off = null;
    setConfig("missionRenderer", "3d");
    m.setView({ begin() {}, end() {}, draw: (_m, f) => { off = [f.sx, f.sy]; } });
    m.shake = 1;
    m.tick();
    t.eq("pause: a frozen frame draws with no shake", off, [0, 0]);

    const pressed = [];
    const sample = m.input.sample.bind(m.input);
    m.input.sample = () => { const s = sample(); pressed.push(Object.keys(s.pressed)); return s; };
    tap(m, "Escape");
    m.tick();
    t.ok("pause: Escape again resumes", m.paused === false);
    t.eq("pause: ...and the host is told", seen, [true, false]);
    t.ok(`pause: resuming runs no catch-up burst (${m.input.frame - samples} step)`, m.input.frame - samples <= 1);
    t.ok("pause: the jump tapped while paused does not fire on resume", !pressed.flat().includes("jump"));
    m.render();
    t.ok("pause: an unfrozen frame shakes again", off[0] !== 0 || off[1] !== 0);
    m.setView(null);
    resetConfig();

    // The Resume path: setPaused from outside, then stop() and start().
    m.setPaused(true);
    m.stop();
    t.ok("pause: stop() leaves the mission unpaused", m.paused === false);
    t.eq("pause: ...telling the host so it can drop the menu", seen.at(-1), false);
    const g = generateLevel({ seed: SEED + 1, difficulty: "low" });
    m.paused = true;
    m.start(g.mission, g.level, SQUAD);
    t.ok("pause: start() leaves the mission unpaused", m.paused === false);
    m.stop();
  }

  // ---- P2: a room's mission is not this page's to pause ------------------
  {
    const m = build();
    m.remote = true;
    m.update = () => {}; // no room is on the other end; the loop is what's asked about
    tap(m, "Escape");
    m.tick();
    t.ok("pause: a remote mission ignores the pause key", m.paused === false);
    m.stop();
  }

  // ---- the one rule: paused is not gameplay state -------------------------
  {
    const g = generateLevel({ seed: SEED, difficulty: "high" });
    const m = new Mission(null, () => {});
    m.start(g.mission, g.level, SQUAD);
    m.paused = true;
    const before = sampleScene(m.scene);
    for (let i = 0; i < 30; i++) { m.sampleInputs(); m.update(1 / 60); }
    t.ok("pause: update() never reads it — a headless driver steps on regardless",
      firstSampleDiff(before, sampleScene(m.scene)) !== null);
  }
}
