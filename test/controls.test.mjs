// Control mapping (remap + persistence), MissionInput sources (mouse/gamepad),
// the shared projectile renderer's shape defaulting, and the Controls tool mount.
import { installDom, makeEl, windowListenerCount } from "./harness.mjs";
import { keyBindings, DEFAULT_KEYS, setKeyBinding, resetKeys, bindingsForAction,
  padBindings, DEFAULT_PAD, setPadButton, setPadAxis, resetPad, padButtonsForAction,
  ACTIONS, ACTION_LABELS } from "../src/game/controlmap.js";
import { MissionInput } from "../src/mission/input.js";
import { defaultShape } from "../src/mission/render.js";
import { createControlsMapper } from "../src/editor/tools/controls-mapper.js";

export default async function run(t) {
  // ---- controlmap defaults + rebind + reset ------------------------------
  t.ok("controlmap: default KeyD → right", keyBindings.KeyD === "right");
  t.ok("controlmap: default KeyR → reload", keyBindings.KeyR === "reload");

  setKeyBinding("KeyF", "fire");
  t.ok("rebind: KeyF now fires", keyBindings.KeyF === "fire");
  t.ok("rebind: action's old key (KeyJ) was cleared", keyBindings.KeyJ === undefined);
  t.ok("rebind: bindingsForAction reflects it", bindingsForAction("fire").includes("KeyF"));

  // rebinding a code that drove another action steals it from that action
  setKeyBinding("KeyA", "jump");
  t.ok("rebind: KeyA moved from left to jump", keyBindings.KeyA === "jump");

  resetKeys();
  t.ok("reset: back to defaults", JSON.stringify(keyBindings) === JSON.stringify(DEFAULT_KEYS));
  t.ok("reset: persistence cleared", (typeof localStorage !== "undefined") && localStorage.getItem("sidescroller.controls.v1") === null);

  // ---- padBindings defaults + rebind (button + axis) + reset --------------
  t.ok("pad: default button 0 → jump", padBindings.buttons[0] === "jump");
  t.ok("pad: default button 7 → fire", padBindings.buttons[7] === "fire");
  t.ok("pad: default axes", padBindings.moveAxis === 0 && padBindings.aimAxisX === 2 && padBindings.aimAxisY === 3);

  setPadButton(4, "fire");
  t.ok("pad rebind: button 4 now fires", padBindings.buttons[4] === "fire");
  t.ok("pad rebind: action's old button (7) cleared", padBindings.buttons[7] === undefined);
  t.ok("pad rebind: padButtonsForAction reflects it", padButtonsForAction("fire").includes("4"));

  // rebinding a button that drove another action steals it
  setPadButton(0, "swap");
  t.ok("pad rebind: button 0 moved from jump to swap", padBindings.buttons[0] === "swap");

  setPadAxis("aimAxisX", 5);
  t.ok("pad rebind: aimAxisX → 5", padBindings.aimAxisX === 5);
  setPadAxis("aimAxisX", NaN);
  t.ok("pad rebind: NaN axis ignored", padBindings.aimAxisX === 5);

  resetPad();
  t.ok("pad reset: back to defaults", JSON.stringify(padBindings) === JSON.stringify(DEFAULT_PAD));
  t.ok("pad reset: persistence cleared", (typeof localStorage !== "undefined") && localStorage.getItem("sidescroller.pad.v1") === null);

  // ---- MissionInput: keyboard reads live bindings ------------------------
  // Since J4 a read answers the last SAMPLE rather than the device, so a press
  // is latched by sample() before anything can see it.
  {
    const inp = new MissionInput();
    inp.enable();
    inp._set({ code: "KeyR", preventDefault() {} }, true);
    inp.sample();
    t.ok("input: R → reload (new action)", inp.isDown("reload"));
    t.ok("input: reload justPressed edge", inp.justPressed("reload"));
    t.ok("input: edge self-clears", !inp.justPressed("reload"));
    inp.disable();
  }

  // ---- MissionInput: the per-step sample (J4) -----------------------------
  // The device writes whenever the browser says so; a read answers one latched
  // input frame. That line is what makes a mission a function of its input
  // trace rather than of how many steps fell inside a rendered frame — the
  // whole of tech/multiplayer-missions.md J4. The mission-side proof (the same
  // trace at four frame rates) is in test/mission-golden.test.mjs; these are
  // the latch's own rules.
  {
    const key = (code) => ({ code, preventDefault() {} });
    const inp = new MissionInput();
    inp.enable();

    // (a) a read before the first sample is silent, not a crash. Every headless
    // host that never samples (dryRunSpec, a tool mid-mount) lands here.
    inp._set(key("KeyD"), true);
    t.ok("sample: unsampled device reads as nothing", !inp.isDown("right") && !inp.justPressed("right"));

    // (b) the sample is frozen: the device moving under it changes nothing
    // until the next one. This is the property the whole slice rests on — two
    // steps inside one rendered frame must not disagree about the input.
    inp.sample();
    const heldAfterSample = inp.isDown("right");
    inp._set(key("KeyD"), false);
    t.ok("sample: a release after the sample is invisible to it", heldAfterSample && inp.isDown("right"));
    inp.sample();
    t.ok("sample: the next sample sees it", !inp.isDown("right"));

    // (c) an edge that arrives while NO step ran is not lost. At 144Hz most
    // frames step nothing at all, so a tap that begins and ends between two
    // samples has to survive on the device until one is taken.
    inp._set(key("KeyR"), true);
    inp._set(key("KeyR"), false);
    inp.sample();
    t.ok("sample: a press between samples survives to the next one", inp.justPressed("reload"));

    // (d) …and belongs to exactly that step. Unread, it must NOT be latched
    // again, or one tap re-fires every step until something consumes it.
    inp._set(key("KeyR"), true);
    inp.sample(); // this step's press, deliberately not read
    inp.sample();
    t.ok("sample: an unread edge does not survive its step", !inp.justPressed("reload"));

    // (e) the frame index is the step index, and a mission numbers its own.
    const before = inp.frame;
    inp.sample(); inp.sample();
    t.eq("sample: the frame index counts samples", inp.frame, before + 2);
    inp.disable();
    inp.enable();
    t.eq("sample: enable restarts the index", inp.frame, 0);
    t.ok("sample: enable clears the latch", !inp.isDown("right"));
    inp.disable();
  }

  // ---- MissionInput: mouse aim source ------------------------------------
  {
    const inp = new MissionInput();
    inp.mouse = { x: 120, y: 40, active: true };
    inp.sample();
    const src = inp.aimSource("mouse");
    t.ok("aim: mouse source returned", src && src.type === "mouse" && src.x === 120);
    t.ok("aim: keyboard mode yields no manual source", inp.aimSource("keyboard") === null);
    inp.mouse.active = false;
    inp.sample();
    t.ok("aim: inactive mouse → null", inp.aimSource("mouse") === null);
  }

  // ---- MissionInput: gamepad polling -------------------------------------
  {
    const inp = new MissionInput();
    // No Gamepad API present → safe no-op.
    let threw = false;
    try { inp.sample(); } catch { threw = true; }
    t.ok("gamepad: pollGamepad no-op without API", !threw && !inp.isDown("jump"));

    // Stub a connected pad: A (btn0) pressed, left stick pushed right, right stick aimed down.
    const realNav = globalThis.navigator;
    let stubbed = true;
    try {
      globalThis.navigator = { getGamepads: () => [{ buttons: [{ pressed: true }], axes: [0.9, 0, 0, 0.8] }] };
    } catch { stubbed = false; }
    if (stubbed) {
      inp.sample(); // sample() is what polls the pad now
      t.ok("gamepad: button 0 → jump held", inp.isDown("jump"));
      // One sample folds both sources, and a pad HOLDING an action outranks a
      // keyboard reporting it up — `actions` stores the release as `false`, so
      // the merge order in sample() is what keeps isDown an OR.
      inp._set({ code: "Space", preventDefault() {} }, true);
      inp._set({ code: "Space", preventDefault() {} }, false);
      inp.sample();
      t.ok("gamepad: a pad hold outranks a released key", inp.isDown("jump"));
      t.ok("gamepad: left stick → right", inp.isDown("right"));
      t.ok("gamepad: right stick → aim active", inp.aimStick.active && inp.aimSource("gamepad").type === "stick");

      // Rebind button 0 to swap; the same stubbed press should now drive swap.
      setPadButton(0, "swap");
      const inp2 = new MissionInput();
      inp2.sample();
      t.ok("gamepad: rebound button 0 → swap", inp2.isDown("swap") && !inp2.isDown("jump"));
      resetPad(); // leave global pad state clean for other suites

      globalThis.navigator = realNav;
    }
  }

  // ---- MissionInput: gamepad diagnostics ---------------------------------
  // The four ways a pad can be dead used to be one silent `return`, so "the dpad
  // moves the OS cursor and nothing else" looked exactly like "no pad plugged
  // in" from inside the game. The report is one-shot and only while enabled —
  // the poll above is the case that must stay silent, or the bar gets noisy.
  {
    installDom(); // enable() hangs listeners on window; also resets the ledger
    const lines = [];
    const realLog = console.log;
    console.log = (m) => lines.push(m);
    try {
      new MissionInput().pollGamepad(); // never enabled: a test, or the Firing Room's auto mode
      const quiet = lines.length === 0;

      // A node host is not a page: an enabled poll must stay silent too, or every
      // suite that mounts the Firing Room prints the missing-API line.
      const enabledUnderNode = new MissionInput();
      enabledUnderNode.enable();
      enabledUnderNode.pollGamepad();
      enabledUnderNode.disable();
      const quietHeadless = lines.length === 0;

      globalThis.isSecureContext = true; // now pose as a browsing context
      const inp = new MissionInput();
      inp.enable();
      inp.pollGamepad();
      inp.pollGamepad();
      inp.pollGamepad();
      const held = windowListenerCount("gamepadconnected");
      inp.disable();
      const released = windowListenerCount("gamepadconnected");

      delete globalThis.isSecureContext;
      console.log = realLog;
      t.ok("gamepad diag: a disabled poll stays silent", quiet);
      t.ok("gamepad diag: an enabled poll under node stays silent too", quietHeadless);
      t.eq("gamepad diag: reported once, not once per frame", lines.length, 1);
      t.ok("gamepad diag: names the cause (no API under node)",
        /getGamepads\(\) is unavailable/.test(lines[0]));
      t.ok("gamepad diag: connect listener attached while enabled", held === 1);
      t.ok("gamepad diag: and released on disable", released === 0);
    } finally {
      console.log = realLog;
    }
  }

  // ---- render: shape defaulting ------------------------------------------
  t.ok("shape: big+round → orb", defaultShape({ w: 14, h: 14 }) === "orb");
  t.ok("shape: long+thin → bolt", defaultShape({ w: 20, h: 4 }) === "bolt");
  t.ok("shape: tiny → pellet", defaultShape({ w: 5, h: 4 }) === "pellet");
  t.ok("shape: default → bullet", defaultShape({ w: 10, h: 4 }) === "bullet");

  // ---- the debug key ------------------------------------------------------
  // One key opens the pause menu's Debug screen (tech/squad-debug.md), which
  // holds every debug control, so the debug view takes no game keys. Bound
  // like everything else rather than hardcoded. The config gate
  // (config.debugOverlays) is what keeps it out of someone else's build; the
  // binding itself is always present.
  resetKeys();
  t.ok("controlmap: default Backquote → debugMenu", keyBindings.Backquote === "debugMenu");
  t.ok("controlmap: G and H are no longer debug keys", keyBindings.KeyG === undefined && keyBindings.KeyH === undefined);
  t.ok("controlmap: the old per-layer actions are gone",
    !ACTIONS.includes("debugGraph") && !ACTIONS.includes("debugPath"));
  t.ok("controlmap: debugMenu is rebindable and labelled, so the Controls tool lists it",
    ACTIONS.includes("debugMenu") && !!ACTION_LABELS.debugMenu);
  setKeyBinding("KeyP", "debugMenu");
  t.ok("rebind: KeyP now opens the Debug screen", keyBindings.KeyP === "debugMenu");
  t.ok("rebind: the old debug key was cleared", keyBindings.Backquote === undefined);
  resetKeys();

  // The 2D/3D view toggle is gone with the 2D view (tech/mission-3d-only.md
  // O2). A KeyV binding a browser saved is dropped by load(), unknown action.
  t.ok("controlmap: toggleRenderer is gone", !ACTIONS.includes("toggleRenderer") && !("toggleRenderer" in ACTION_LABELS));
  t.ok("controlmap: KeyV is unbound by default", !("KeyV" in keyBindings));

  // pause (tech/pause-menu.md): Escape by default, rebindable, appended so no
  // earlier action's index — the wire's bit — moved.
  t.ok("controlmap: default Escape → pause", keyBindings.Escape === "pause");
  t.ok("controlmap: pause is an action with a label", ACTIONS.includes("pause") && !!ACTION_LABELS.pause);
  t.ok("controlmap: pause is appended, so no earlier action's index moved",
    ACTIONS.indexOf("pause") === ACTIONS.length - 1);

  // A map saved before `pause` existed binds nothing to it, and load() gives
  // it its default key — unless the player already put that key on something.
  // A fresh module instance (the query string) re-runs load() over the store.
  {
    const legacy = { ...DEFAULT_KEYS, KeyF: "fire" };
    delete legacy.Escape; delete legacy.KeyJ;
    localStorage.setItem("sidescroller.controls.v1", JSON.stringify(legacy));
    const a = await import("../src/game/controlmap.js?saved-before-pause");
    t.ok("load: a saved map with no pause key gains Escape", a.keyBindings.Escape === "pause");
    t.ok("load: ...and keeps the player's own rebinding", a.keyBindings.KeyF === "fire" && a.keyBindings.KeyJ === undefined);
    localStorage.setItem("sidescroller.controls.v1", JSON.stringify({ ...legacy, Escape: "swap" }));
    const b = await import("../src/game/controlmap.js?escape-taken");
    t.ok("load: a default key the player bound elsewhere is not stolen", b.keyBindings.Escape === "swap");
    t.eq("load: ...so pause stays unbound", b.bindingsForAction("pause"), []);
    // A map saved while G/H were the debug keys (before tech/squad-debug.md D1)
    // loses them, because their actions no longer exist, and gains the debug key.
    const old = { ...DEFAULT_KEYS, KeyG: "debugGraph", KeyH: "debugPath" };
    delete old.Backquote;
    localStorage.setItem("sidescroller.controls.v1", JSON.stringify({ ...old, KeyF: "fire" }));
    const c = await import("../src/game/controlmap.js?saved-with-gh");
    t.ok("load: a map saved with G/H drops them", c.keyBindings.KeyG === undefined && c.keyBindings.KeyH === undefined);
    t.ok("load: ...and gains ` for the debug menu", c.keyBindings.Backquote === "debugMenu");
    localStorage.removeItem("sidescroller.controls.v1");
  }

  // Pause is read once per rendered FRAME, outside the per-step sample: a
  // press taken there is gone before any sample sees it, and presses made
  // while paused are dropped so none fires on resume.
  {
    const inp = new MissionInput();
    inp.enable();
    inp._set({ code: "Escape", preventDefault() {} }, true);
    t.ok("input: takePress sees a pending pause press", inp.takePress("pause"));
    t.ok("input: ...once", !inp.takePress("pause"));
    inp.sample();
    t.ok("input: ...and no sample sees it afterwards", !inp.justPressed("pause"));
    inp._set({ code: "Escape", preventDefault() {} }, false);
    inp._set({ code: "Space", preventDefault() {} }, true);
    inp.dropPresses();
    inp.sample();
    t.ok("input: a press dropped while paused does not fire", !inp.justPressed("jump"));
    t.ok("input: ...though the key still reads as held", inp.isDown("jump"));
    inp.disable();
  }

  // Suspended (P3): a menu is open over the mission. Held actions release,
  // every key but pause passes through untouched so the menu gets arrows,
  // Space and Tab, and the mouse fires nothing.
  {
    const inp = new MissionInput();
    inp.enable();
    let prevented = 0;
    const ev = (code) => ({ code, preventDefault() { prevented++; } });
    inp._set(ev("KeyD"), true);
    inp.suspend(true);
    inp.sample();
    t.ok("suspend: a held action is released on entry", !inp.isDown("right"));
    prevented = 0;
    inp._set(ev("Space"), true);
    inp._set(ev("Tab"), true);
    inp._set(ev("ArrowDown"), true);
    inp._mouseButton({ button: 0 }, true);
    inp.sample();
    t.ok("suspend: bound keys drive nothing", !inp.isDown("jump") && !inp.isDown("swap") && !inp.isDown("crouch"));
    t.ok("suspend: ...nor does the mouse button", !inp.isDown("fire"));
    t.eq("suspend: ...and none is preventDefault-ed, so the menu gets them", prevented, 0);
    inp._set(ev("Escape"), true);
    t.eq("suspend: the pause key is still handled", prevented, 1);
    t.ok("suspend: ...and still read", inp.takePress("pause"));
    inp.reset();
    inp._set(ev("Space"), true);
    inp.sample();
    t.ok("suspend: reset() clears it", inp.isDown("jump"));
    inp.suspend(true);
    inp.disable();
    inp.enable();
    inp._set(ev("KeyD"), true);
    inp.sample();
    t.ok("suspend: disable() clears it", inp.isDown("right"));
    inp.disable();
  }

  // ---- Controls tool mounts headlessly -----------------------------------
  {
    installDom();
    let threw = null, tool = null;
    try { tool = createControlsMapper(makeEl(), () => {}); } catch (e) { threw = e; }
    t.ok("controls-mapper: mount does not throw", !threw);
    if (threw) console.log("   ", threw && threw.stack);
    t.ok("controls-mapper: returns dispose()", tool && typeof tool.dispose === "function");
    try { tool && tool.dispose(); t.ok("controls-mapper: dispose does not throw", true); }
    catch { t.ok("controls-mapper: dispose does not throw", false); }
  }
}
