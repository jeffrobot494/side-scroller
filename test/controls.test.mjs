// Control mapping (remap + persistence), MissionInput sources (mouse/gamepad),
// the shared projectile renderer's shape defaulting, and the Controls tool mount.
import { installDom, makeEl } from "./harness.mjs";
import { keyBindings, DEFAULT_KEYS, setKeyBinding, resetKeys, bindingsForAction } from "../src/game/controlmap.js";
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
      globalThis.navigator = realNav;
    }
  }

  // ---- render: shape defaulting ------------------------------------------
  t.ok("shape: big+round → orb", defaultShape({ w: 14, h: 14 }) === "orb");
  t.ok("shape: long+thin → bolt", defaultShape({ w: 20, h: 4 }) === "bolt");
  t.ok("shape: tiny → pellet", defaultShape({ w: 5, h: 4 }) === "pellet");
  t.ok("shape: default → bullet", defaultShape({ w: 10, h: 4 }) === "bullet");

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
