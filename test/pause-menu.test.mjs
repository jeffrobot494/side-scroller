// The pause menu (tech/pause-menu.md): P2's frozen frame loop, driven through
// the real `_frame` off a synthetic clock (rAF is a no-op under the harness),
// and P3's room behaviour and overlay.
import { makeEl } from "./harness.mjs";
import { Mission } from "../src/mission/mission.js";
import { generateLevel } from "../src/game/gen/levelgen.js";
import { sampleScene, firstSampleDiff } from "../src/mission/checksum.js";
import { config, setConfig, resetConfig, isDefault, pauseSchema } from "../src/game/config.js";
import { createPauseMenu } from "../src/hub/pause.js";
import { SEED, SQUAD } from "./mission-trace.mjs";

const FRAME = 1000 / 60;
const key = (m, code, down) => m.input._set({ code, preventDefault() {} }, down);
const tap = (m, code) => { key(m, code, true); key(m, code, false); };

// Pause on squadmate death (tech/squad-debug.md, D4) is a second freeze, and
// these cases are about the first: it is pinned off everywhere but its own case.
function quiet() {
  resetConfig();
  setConfig("debugPauseOnDeath", false);
}

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
  quiet();

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
    quiet();
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
    quiet();

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

  // ---- P3: in a room the menu opens and the mission runs on ---------------
  // The room steps it; this page only stops driving its soldier.
  {
    const m = build();
    const seen = [];
    m.onPauseChange = (p) => seen.push(p);
    m.remote = true;
    m.update = () => {}; // no room is on the other end; the loop is what's asked about
    let prevented = 0;
    m.input._set({ code: "KeyD", preventDefault() { prevented++; } }, true); // running right
    tap(m, "Escape");
    m.tick();
    t.ok("room: the pause key opens the menu", m.paused === true);
    t.eq("room: ...and the host is told", seen, [true]);
    const samples = m.input.frame;
    m.tick(30);
    t.ok(`room: the mission keeps stepping under it (${m.input.frame - samples} steps)`, m.input.frame - samples >= 29);
    t.ok("room: the held key was released when it opened", !m.input.isDown("right"));
    prevented = 0;
    m.input._set({ code: "Space", preventDefault() { prevented++; } }, true);
    m.tick();
    t.ok("room: a key pressed under the menu drives nothing", !m.input.isDown("jump"));
    t.eq("room: ...and is left to the menu (no preventDefault)", prevented, 0);
    m.input._set({ code: "Space", preventDefault() {} }, false);
    tap(m, "Escape");
    m.tick();
    t.ok("room: the pause key closes it again", m.paused === false);
    m.input._set({ code: "KeyD", preventDefault() {} }, true);
    m.tick();
    t.ok("room: ...and the soldier takes input again", m.input.isDown("right"));
    m.stop();
  }

  // ---- D1 (tech/squad-debug.md): the debug key opens the Debug screen -------
  {
    const m = build();
    const seen = [];
    m.onPauseChange = (p, screen) => seen.push([p, screen]);
    m.tick(5);
    tap(m, "Backquote");
    m.tick();
    t.ok("debug key: ` pauses", m.paused === true);
    t.eq("debug key: ...asking the host for the Debug screen", seen, [[true, "debug"]]);
    tap(m, "Backquote");
    m.tick();
    t.ok("debug key: ` closes it again (it passes through the suspended input)", m.paused === false);
    tap(m, "Backquote");
    m.tick();
    tap(m, "Escape");
    m.tick();
    t.ok("debug key: the pause key closes the Debug screen too", m.paused === false);
    tap(m, "Escape");
    m.tick();
    t.eq("debug key: Escape still opens on the menu", seen.at(-1), [true, "menu"]);
    tap(m, "Backquote");
    m.tick();
    t.ok("debug key: ` closes the menu from any screen", m.paused === false);

    setConfig("debugOverlays", false);
    tap(m, "Backquote");
    m.tick();
    t.ok("debug key: with debug overlays off it does nothing", m.paused === false);
    quiet();

    // A room's mission has no Debug screen: the key neither opens nor closes.
    m.remote = true;
    m.update = () => {};
    tap(m, "Backquote");
    m.tick();
    t.ok("debug key: in a room it does nothing", m.paused === false);
    m.stop();

    // The layers are per deploy.
    m.remote = false;
    m.debug.graph = true;
    const g = generateLevel({ seed: SEED + 1, difficulty: "low" });
    m.start(g.mission, g.level, SQUAD);
    t.ok("debug: a new deploy starts with every layer off", !Object.values(m.debug).some((v) => v === true));
    m.stop();
  }

  // ---- D2: the three layers draw, and change nothing ------------------------
  // Nothing asserts on pixels; what is pinned is that every layer draws over
  // the harness's context without a throw, who it annotates, and that drawing
  // leaves the scene and the shared exposure cache exactly as they were.
  {
    const m = build();
    m.tick(240);
    const mates = m._debugMates();
    t.ok(`layers: the AI squadmates are annotated, the driven soldier is not (${mates.length})`,
      mates.length > 0 && !mates.includes(m.currentSoldier()) && mates.every((s) => s.agent && s.alive));
    // A pass and a verdict, as D0 would have written them, so every branch draws.
    const s = mates[0];
    s.agent.spotPass = { kind: "fight", t: 0, chosen: { x: 10, y: 20 }, probes: [
      { x: 0, y: 20, travel: 0, crowd: 0, shot: 0, exposure: 1, total: 1, cut: false },
      { x: 10, y: 20, travel: 0.4, crowd: 0, shot: -0.5, exposure: 0, total: -0.1, cut: false },
      { x: 30, y: 20, travel: 2, crowd: 0, shot: null, exposure: null, total: 2, cut: true },
    ] };
    s.duck = s.duck || { hold: 0, wait: 0, pending: null, judged: new WeakSet(), log: [] };
    s.duck.log.push({ round: {}, t: m.scene.survivalClock, verdict: "late", abandoned: false, hit: true });
    Object.assign(m.debug, { graph: true, path: true, threats: true, spots: true, dodges: true });
    const before = sampleScene(m.scene);
    const cache = m.scene.exposureCache;
    let threw = null;
    try { m.render(); m.render(); } catch (e) { threw = e; }
    t.eq("layers: every layer draws without a throw", threw && String(threw), null);
    t.ok("layers: drawing changes nothing in the scene", firstSampleDiff(before, sampleScene(m.scene)) === null);
    t.ok("layers: ...and never touches the shared exposure cache", m.scene.exposureCache === cache);
    t.ok("layers: the threat set is held per squadmate", mates.every((x) => Array.isArray(m._debugView.threats.get(x))));
    const held = m._debugView.threats;
    m.render();
    t.ok("layers: ...and not recomputed inside one sense interval", m._debugView.threats === held);
    m.remote = true;
    const drawn = m._debugView.threatT;
    m.time += 1;
    m.render();
    t.eq("layers: a room viewer draws none of them", m._debugView.threatT, drawn);
    m.remote = false;
    m.stop();
  }

  // ---- D3: slow motion -------------------------------------------------------
  // Same steps, same order, further apart: half speed takes twice the frames to
  // reach a step, and the scene at that step is the full-speed scene.
  {
    const full = build();
    full.tick(90);
    const half = build();
    half.debug.speed = 0.5;
    half.tick(90);
    t.ok(`slow: half speed runs half the steps (${half.input.frame} vs ${full.input.frame})`,
      Math.abs(half.input.frame * 2 - full.input.frame) <= 2);
    const want = full.input.frame;
    while (half.input.frame < want) half.tick();
    t.eq("slow: ...and reaches the same state at the same step", half.input.frame, want);
    t.ok("slow: the scene at that step is the full-speed scene",
      firstSampleDiff(sampleScene(full.scene), sampleScene(half.scene)) === null);
    setConfig("debugOverlays", false);
    const off = build();
    off.debug.speed = 0.25;
    off.tick(60);
    t.ok(`slow: with debug overlays off the speed is ignored (${off.input.frame} steps)`, off.input.frame >= 59);
    quiet();
    for (const m of [full, half, off]) m.stop();
  }

  // ---- D4: pause on squadmate death ----------------------------------------
  // The kill is dealt INSIDE a step, after the soldiers' pass, which is where a
  // round or a burn tick lands in a real one.
  {
    resetConfig(); // the knob's default: on
    const killIn = (m, victims, by) => {
      const upd = m.update.bind(m);
      m.update = (dt) => {
        upd(dt);
        m.update = upd;
        for (const v of victims) m._ctx.damage(v, 1e9, by);
      };
    };
    const m = build();
    const seen = [];
    m.onPauseChange = (p, screen) => seen.push([p, screen]);
    m.tick(120);
    const [mate] = m._debugMates();
    const foe = m.scene.specRoots.find((r) => r.alive);
    const hp = mate.health;
    killIn(m, [mate], foe);
    m.tick();
    const card = m.deathCard;
    t.ok("death: an AI squadmate's death puts up a card", !!card && card.rows.length === 1);
    const row = card.rows[0];
    t.eq("death: ...naming who died", row.who, mate.data.callsign);
    t.eq("death: ...and the enemy that killed it", row.killer, foe.spec.name || foe.spec.id);
    t.eq("death: ...its health at the start of the step", row.hp, Math.round(hp));
    t.ok(`death: ...what it was doing and for how long (${row.state} ${row.stateTime})`,
      typeof row.state === "string" && row.stateTime >= 0);
    t.ok("death: ...how many could hit it", Number.isInteger(row.exposure));
    t.eq("death: ...and no tag, since no round struck it", row.tag, "no tag");
    t.eq("death: the pause menu does not open", seen, []);
    t.ok("death: the dead squadmate is still annotated on its own card", m._debugMates().includes(mate));
    const steps = m.input.frame;
    let threw = null;
    try { m.tick(30); } catch (e) { threw = e; }
    t.eq("death: the card draws", threw && String(threw), null);
    t.eq("death: the mission is frozen under it", m.input.frame, steps);

    tap(m, "Backquote");
    m.tick();
    t.eq("death: the debug key opens the Debug screen over the card", seen, [[true, "debug"]]);
    tap(m, "Backquote");
    m.tick(5);
    t.ok("death: closing it returns to the card", m.paused === false && m.deathCard === card && m.input.frame === steps);
    tap(m, "Escape");
    m.tick();
    t.ok("death: the pause key dismisses the card", m.deathCard === null);
    t.ok("death: ...without opening the menu", seen.length === 2 && m.paused === false);
    m.tick(10);
    t.ok(`death: ...and the mission carries on (${m.input.frame - steps} steps)`, m.input.frame - steps >= 9);

    // The driven soldier is never the subject.
    killIn(m, [m.currentSoldier()], foe);
    m.tick();
    t.eq("death: the driven soldier's death puts up no card", m.deathCard, null);
    m.stop();

    // Two in one step share a card; a squadmate with no agent (the legacy
    // brain) gets one with – for what it has no record of.
    const two = build();
    two.tick(120);
    const [a, b] = two._debugMates();
    const upd = two.update.bind(two);
    two.update = (dt) => { upd(dt); two.update = upd; b.agent = null; two._ctx.damage(a, 1e9, foe); two._ctx.damage(b, 1e9, a); };
    two.tick();
    t.eq("death: two deaths in one step share one card", two.deathCard && two.deathCard.rows.length, 2);
    const legacy = two.deathCard.rows[1];
    t.ok("death: a legacy squadmate's card has no state, exposure or tag",
      legacy.state === null && legacy.exposure === null && legacy.tag === null);
    t.eq("death: friendly fire names the soldier", legacy.killer, a.data.callsign);
    two.stop();
    t.eq("death: stop() clears the card", two.deathCard, null);

    setConfig("debugPauseOnDeath", false);
    const off = build();
    off.tick(120);
    killIn(off, [off._debugMates()[0]], foe);
    off.tick();
    t.eq("death: with the setting off there is no card", off.deathCard, null);
    off.stop();
    quiet();
  }

  // ---- P3: the overlay, mounted headlessly --------------------------------
  // The harness DOM dispatches no events, so the overlay's root records its
  // listeners here and the test fires them with targets that answer closest().
  {
    const made = [];
    const createElement = document.createElement;
    document.createElement = (tag) => {
      const el = createElement(tag);
      el.on = {};
      el.addEventListener = (type, fn) => (el.on[type] = el.on[type] || []).push(fn);
      el.querySelector = () => null;
      made.push(el);
      return el;
    };
    const container = { kids: [], appendChild(c) { this.kids.push(c); c.remove = () => { this.kids = this.kids.filter((k) => k !== c); }; } };
    const fire = (el, type, target) => (el.on[type] || []).forEach((fn) => fn({ target }));
    const MATCH = {
      "[data-pm]": (n) => n.dataset.pm !== undefined,
      "[data-cfg-tab]": (n) => n.dataset.cfgTab !== undefined,
      ".toggle": (n) => n.toggle,
      "[data-type='range']": (n) => n.dataset.type === "range",
      "[data-type='enum']": (n) => n.dataset.type === "enum",
      "[data-type='text']": (n) => n.dataset.type === "text",
    };
    const node = (dataset, extra = {}) => {
      const n = { dataset, classList: { on: false, toggle() { return (this.on = !this.on); } }, setAttribute() {}, ...extra };
      n.closest = (sel) => (sel.split(",").some((s) => MATCH[s] && MATCH[s](n)) ? n : null);
      return n;
    };
    const rows = (html) => [...html.matchAll(/data-row="([\w.]+)"/g)].map((r) => r[1]);
    const shown = (s) => s.flatMap((g) => g.items.map((it) => it.key));

    quiet();
    let resumed = 0;
    const changes = [];
    const pm = createPauseMenu(container, { room: false, resume: () => resumed++, onChange: (k, v) => changes.push([k, v]) });
    const el = made.at(-1);
    t.ok("overlay: mounts into its container", container.kids.includes(el));
    t.eq("overlay: the menu is Options and Resume, nothing else",
      [...el.innerHTML.matchAll(/data-pm="(\w+)"/g)].map((r) => r[1]), ["options", "resume"]);

    fire(el, "click", node({ pm: "options" }));
    t.eq("overlay: Options opens the options screen", pm.screen(), "options");
    t.eq("overlay: ...one row per live setting, the design's 38", rows(el.innerHTML), shown(pauseSchema({ room: false })));
    t.ok("overlay: ...with a Back button", /data-pm="back"/.test(el.innerHTML));

    const ff = config.friendlyFire;
    fire(el, "click", node({ key: "friendlyFire", type: "bool" }, { toggle: true }));
    t.eq("overlay: a toggle changes the setting", config.friendlyFire, !ff);
    t.ok("overlay: ...kept the way the editor keeps it", isDefault("friendlyFire") === false
      && JSON.parse(localStorage.getItem("sidescroller.config.v1")).friendlyFire === !ff);
    const other = config.missionRenderer === "3d" ? "2d" : "3d";
    fire(el, "change", node({ key: "missionRenderer", type: "enum" }, { value: other }));
    t.eq("overlay: the host hears each change, coerced", changes, [["friendlyFire", !ff], ["missionRenderer", other]]);

    fire(el, "click", node({ pm: "back" }));
    t.eq("overlay: Back returns to the menu", pm.screen(), "menu");
    fire(el, "click", node({ pm: "resume" }));
    t.eq("overlay: Resume asks the host to resume", resumed, 1);
    t.ok("overlay: ...and does not close itself — the host's hook does", container.kids.includes(el));
    pm.dispose();
    t.ok("overlay: dispose removes it", !container.kids.includes(el));

    // D1: the Debug screen (tech/squad-debug.md), with the mission's handle.
    const items = (e) => [...e.innerHTML.matchAll(/data-pm="(\w+)"/g)].map((r) => r[1]);
    const debug = { graph: false, path: false };
    const dm = createPauseMenu(container, { room: false, screen: "debug", debug });
    const del = made.at(-1);
    t.eq("debug screen: the debug key's request opens it", dm.screen(), "debug");
    t.eq("debug screen: the five layers, the speed, and Pause on squadmate death", rows(del.innerHTML),
      ["debug.graph", "debug.path", "debug.threats", "debug.spots", "debug.dodges", "debug.speed", "debugPauseOnDeath"]);
    t.ok("debug screen: ...with a Back button", /data-pm="back"/.test(del.innerHTML));
    fire(del, "click", node({ key: "debug.graph", type: "bool" }, { toggle: true }));
    t.ok("debug screen: a toggle writes the mission's flag", debug.graph === true && debug.path === false);
    t.ok("debug screen: ...and never the config", !("debug.graph" in config) && isDefault("debugOverlays"));
    const pod = node({ key: "debugPauseOnDeath", type: "bool" }, { toggle: true });
    pod.classList.on = config.debugPauseOnDeath;
    fire(del, "click", pod);
    t.ok("debug screen: Pause on squadmate death is the setting, kept like any other",
      config.debugPauseOnDeath === pod.classList.on && isDefault("debugPauseOnDeath") === pod.classList.on); // default: on
    quiet();
    fire(del, "change", node({ key: "debug.speed", type: "enum" }, { value: "quarter" }));
    t.eq("debug screen: Speed writes the mission's time scale", debug.speed, 0.25);
    fire(del, "click", node({ pm: "back" }));
    t.eq("debug screen: Back returns to the menu", dm.screen(), "menu");
    t.eq("debug screen: the menu is Options, Debug, Resume", items(del), ["options", "debug", "resume"]);
    // The knob is live on Options: turning it off there hides Debug on Back.
    // (A stub switch starts off, so the one that turns it off starts on.)
    fire(del, "click", node({ pm: "options" }));
    const lit = node({ key: "debugOverlays", type: "bool" }, { toggle: true });
    lit.classList.on = true;
    fire(del, "click", lit);
    fire(del, "click", node({ pm: "back" }));
    t.eq("debug screen: overlays turned off in Options hide it on Back", items(del), ["options", "resume"]);
    fire(del, "click", node({ pm: "options" }));
    fire(del, "click", node({ key: "debugOverlays", type: "bool" }, { toggle: true }));
    fire(del, "click", node({ pm: "back" }));
    t.eq("debug screen: ...and turned back on show it", items(del), ["options", "debug", "resume"]);
    dm.dispose();
    setConfig("debugOverlays", false);
    const off = createPauseMenu(container, { screen: "debug", debug });
    t.eq("debug screen: with overlays off a Debug request opens the menu", off.screen(), "menu");
    t.eq("debug screen: ...which has no Debug item", items(made.at(-1)), ["options", "resume"]);
    off.dispose();
    quiet();
    const nohandle = createPauseMenu(container, { screen: "debug", debug: null });
    t.eq("debug screen: with no handle (a room) there is none", items(made.at(-1)), ["options", "resume"]);
    nohandle.dispose();

    const roomMenu = createPauseMenu(container, { room: true });
    const rel = made.at(-1);
    fire(rel, "click", node({ pm: "options" }));
    t.eq("overlay: in a room it shows only what is this page's to change",
      rows(rel.innerHTML), shown(pauseSchema({ room: true })));
    t.ok("overlay: ...so no Run speed", !rows(rel.innerHTML).includes("runSpeed"));
    roomMenu.dispose();

    document.createElement = createElement;
    quiet();
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
