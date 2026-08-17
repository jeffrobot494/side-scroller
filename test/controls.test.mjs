// Control mapping (remap + persistence), MissionInput sources (mouse/gamepad),
// the shared projectile renderer's shape defaulting, and the Controls tool mount.
import { installDom, makeEl } from "./harness.mjs";
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
  {
    const inp = new MissionInput();
    inp.enable();
    inp._set({ code: "KeyR", preventDefault() {} }, true);
    t.ok("input: R → reload (new action)", inp.isDown("reload"));
    t.ok("input: reload justPressed edge", inp.justPressed("reload"));
    t.ok("input: edge self-clears", !inp.justPressed("reload"));
    inp.disable();
  }

  // ---- MissionInput: mouse aim source ------------------------------------
  {
    const inp = new MissionInput();
    inp.mouse = { x: 120, y: 40, active: true };
    const src = inp.aimSource("mouse");
    t.ok("aim: mouse source returned", src && src.type === "mouse" && src.x === 120);
    t.ok("aim: keyboard mode yields no manual source", inp.aimSource("keyboard") === null);
    inp.mouse.active = false;
    t.ok("aim: inactive mouse → null", inp.aimSource("mouse") === null);
  }

  // ---- MissionInput: gamepad polling -------------------------------------
  {
    const inp = new MissionInput();
    // No Gamepad API present → safe no-op.
    let threw = false;
    try { inp.pollGamepad(); } catch { threw = true; }
    t.ok("gamepad: pollGamepad no-op without API", !threw && !inp.isDown("jump"));

    // Stub a connected pad: A (btn0) pressed, left stick pushed right, right stick aimed down.
    const realNav = globalThis.navigator;
    let stubbed = true;
    try {
      globalThis.navigator = { getGamepads: () => [{ buttons: [{ pressed: true }], axes: [0.9, 0, 0, 0.8] }] };
    } catch { stubbed = false; }
    if (stubbed) {
      inp.pollGamepad();
      t.ok("gamepad: button 0 → jump held", inp.isDown("jump"));
      t.ok("gamepad: left stick → right", inp.isDown("right"));
      t.ok("gamepad: right stick → aim active", inp.aimStick.active && inp.aimSource("gamepad").type === "stick");

      // Rebind button 0 to swap; the same stubbed press should now drive swap.
      setPadButton(0, "swap");
      const inp2 = new MissionInput();
      inp2.pollGamepad();
      t.ok("gamepad: rebound button 0 → swap", inp2.isDown("swap") && !inp2.isDown("jump"));
      resetPad(); // leave global pad state clean for other suites

      globalThis.navigator = realNav;
    }
  }

  // ---- render: shape defaulting ------------------------------------------
  t.ok("shape: big+round → orb", defaultShape({ w: 14, h: 14 }) === "orb");
  t.ok("shape: long+thin → bolt", defaultShape({ w: 20, h: 4 }) === "bolt");
  t.ok("shape: tiny → pellet", defaultShape({ w: 5, h: 4 }) === "pellet");
  t.ok("shape: default → bullet", defaultShape({ w: 10, h: 4 }) === "bullet");

  // ---- debug overlay actions ---------------------------------------------
  // The mission's nav overlays are bound like everything else rather than
  // hardcoded, which is what lets them move off a key a player might hit. The
  // config gate (config.debugOverlays) is what keeps them out of someone else's
  // build; the bindings themselves are always present.
  resetKeys();
  t.ok("controlmap: default KeyG → debugGraph", keyBindings.KeyG === "debugGraph");
  t.ok("controlmap: default KeyH → debugPath", keyBindings.KeyH === "debugPath");
  t.ok("controlmap: both debug actions are rebindable like any other",
    ACTIONS.includes("debugGraph") && ACTIONS.includes("debugPath"));
  t.ok("controlmap: they carry labels, so the Controls tool can list them",
    !!ACTION_LABELS.debugGraph && !!ACTION_LABELS.debugPath);
  setKeyBinding("KeyP", "debugPath");
  t.ok("rebind: KeyP now toggles paths", keyBindings.KeyP === "debugPath");
  t.ok("rebind: the old debug key was cleared", keyBindings.KeyH === undefined);
  resetKeys();

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
