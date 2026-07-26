// ---------------------------------------------------------------------------
// CONTROLS MAPPER — rebind keyboard keys AND gamepad controls for the action layer.
//
// Lists every logical action with its current key + gamepad button and lets you
// capture a new one. Keyboard capture waits for a keydown; gamepad capture polls
// the connected pad in a rAF loop and binds the button/axis you press or nudge.
// A Sticks section rebinds the analog axes (which axis drives move vs. aim).
// Bindings persist through controlmap.js and are read live by the game + Firing
// Room, so a remap applies without a reload.
//
// createControlsMapper(container, onBack) → { dispose() }
// ---------------------------------------------------------------------------

import {
  ACTIONS, ACTION_LABELS, keyBindings, bindingsForAction, setKeyBinding, resetKeys,
  padBindings, padButtonsForAction, setPadButton, setPadAxis, resetPad, padButtonName, padAxisName,
} from "../../game/controlmap.js";

// Friendlier names for a few KeyboardEvent.code values.
const KEY_NAMES = { Space: "Space", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", ShiftLeft: "L-Shift", ShiftRight: "R-Shift", Tab: "Tab" };
function keyName(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code && code.startsWith("Key")) return code.slice(3);
  if (code && code.startsWith("Digit")) return code.slice(5);
  return code || "—";
}

// The three rebindable analog-axis slots.
const AXIS_SLOTS = [
  { slot: "moveAxis", label: "Move (L-Stick)" },
  { slot: "aimAxisX", label: "Aim X (R-Stick)" },
  { slot: "aimAxisY", label: "Aim Y (R-Stick)" },
];

// Threshold an axis must move past (from its capture-start baseline) to bind.
const AXIS_CAPTURE_THRESHOLD = 0.5;

export function createControlsMapper(container, onBack) {
  // { kind: "key" | "pad-btn" | "pad-axis", target: action | slot } or null.
  let capturing = null;
  let rafId = 0; // gamepad poll loop while capturing a pad control
  let padBaseline = null; // snapshot of buttons/axes when a pad capture began

  container.innerHTML = `
    <div class="wd cm">
      <div class="wd-head">
        <button class="btn btn-ghost" data-cm="back">← Tools</button>
        <span class="wd-name" style="min-width:auto">Controls</span>
        <span class="wd-id" id="cm-hint"></span>
      </div>
      <p class="ed-note">
        Click <strong>Rebind</strong>, then press a key (keyboard) or a button / nudge a stick (gamepad).
        Bindings save to this browser and apply live to the game and the Firing Room.
      </p>
      <table class="cm-table">
        <thead><tr><th>Action</th><th>Key</th><th>Gamepad</th><th></th></tr></thead>
        <tbody id="cm-rows"></tbody>
      </table>
      <p class="ed-note" style="margin-top:14px"><strong>Sticks</strong> — which analog axis drives move / aim.</p>
      <table class="cm-table">
        <thead><tr><th>Axis</th><th>Bound to</th><th></th></tr></thead>
        <tbody id="cm-axes"></tbody>
      </table>
      <div class="ed-io-btns">
        <button class="btn btn-alt" data-cm="reset">Reset to defaults</button>
      </div>
    </div>`;

  const $ = (s) => container.querySelector(s);

  function capIs(kind, target) {
    return capturing && capturing.kind === kind && capturing.target === target;
  }

  function rows() {
    return ACTIONS.map((action) => {
      const keys = bindingsForAction(action).map(keyName).join(" / ") || "—";
      const pad = padButtonsForAction(action).map(padButtonName).join(" / ") || "—";
      const capKey = capIs("key", action);
      const capPad = capIs("pad-btn", action);
      return `<tr>
        <td>${escapeHtml(ACTION_LABELS[action] || action)}</td>
        <td class="cm-key${capKey ? " cm-capturing" : ""}">${capKey ? "press a key…" : escapeHtml(keys)}</td>
        <td class="cm-pad${capPad ? " cm-capturing" : ""}">${capPad ? "press a button…" : escapeHtml(pad)}</td>
        <td class="cm-actions">
          <button class="btn btn-alt cm-rebind" data-cm="rebind-key" data-target="${action}">${capKey ? "Cancel" : "Key"}</button>
          <button class="btn btn-alt cm-rebind" data-cm="rebind-pad" data-target="${action}">${capPad ? "Cancel" : "Pad"}</button>
        </td>
      </tr>`;
    }).join("");
  }

  function axisRows() {
    return AXIS_SLOTS.map(({ slot, label }) => {
      const cap = capIs("pad-axis", slot);
      const name = padAxisName(padBindings[slot]);
      return `<tr>
        <td>${escapeHtml(label)}</td>
        <td class="cm-pad${cap ? " cm-capturing" : ""}">${cap ? "nudge a stick…" : escapeHtml(name)}</td>
        <td class="cm-actions"><button class="btn btn-alt cm-rebind" data-cm="rebind-axis" data-target="${slot}">${cap ? "Cancel" : "Rebind"}</button></td>
      </tr>`;
    }).join("");
  }

  function draw() {
    $("#cm-rows").innerHTML = rows();
    $("#cm-axes").innerHTML = axisRows();
    $("#cm-hint").textContent = capturing ? `binding ${capturing.target}…` : "";
  }

  // ---- gamepad poll capture -----------------------------------------------

  function firstPad() {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
    for (const p of navigator.getGamepads() || []) if (p) return p;
    return null;
  }

  function snapshot(pad) {
    return {
      buttons: (pad.buttons || []).map((b) => !!(b && (b.pressed || b.value > 0.5))),
      axes: (pad.axes || []).slice(),
    };
  }

  function stopPadCapture() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    padBaseline = null;
  }

  function startPadCapture() {
    stopPadCapture();
    const pad = firstPad();
    padBaseline = pad ? snapshot(pad) : { buttons: [], axes: [] };
    const tick = () => {
      if (!capturing) { rafId = 0; return; }
      const p = firstPad();
      if (p) {
        if (capturing.kind === "pad-btn") {
          for (let i = 0; i < p.buttons.length; i++) {
            const on = !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
            if (on && !padBaseline.buttons[i]) { setPadButton(i, capturing.target); return finishCapture(); }
          }
        } else if (capturing.kind === "pad-axis") {
          let best = -1, bestDelta = AXIS_CAPTURE_THRESHOLD;
          for (let i = 0; i < p.axes.length; i++) {
            const delta = Math.abs((p.axes[i] || 0) - (padBaseline.axes[i] || 0));
            if (delta > bestDelta) { bestDelta = delta; best = i; }
          }
          if (best >= 0) { setPadAxis(capturing.target, best); return finishCapture(); }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function finishCapture() {
    stopPadCapture();
    capturing = null;
    draw();
  }

  // Begin/toggle a capture. Cancels any in-flight capture first.
  function beginCapture(kind, target) {
    const already = capturing && capturing.kind === kind && capturing.target === target;
    stopPadCapture();
    if (already) { capturing = null; draw(); return; }
    capturing = { kind, target };
    if (kind === "pad-btn" || kind === "pad-axis") startPadCapture();
    draw();
  }

  // ---- keyboard capture ----------------------------------------------------
  // The next keydown while capturing a "key" binds that key. Escape cancels any
  // capture kind (including gamepad).
  const onKey = (e) => {
    if (!capturing) return;
    if (e.code === "Escape") { e.preventDefault(); finishCapture(); return; }
    if (capturing.kind !== "key") return;
    e.preventDefault();
    setKeyBinding(e.code, capturing.target);
    finishCapture();
  };
  window.addEventListener("keydown", onKey, true);

  container.addEventListener("click", (e) => {
    const el = e.target.closest("[data-cm]");
    if (!el) return;
    switch (el.dataset.cm) {
      case "back": stopPadCapture(); onBack(); break;
      case "reset": stopPadCapture(); resetKeys(); resetPad(); capturing = null; draw(); break;
      case "rebind-key": beginCapture("key", el.dataset.target); break;
      case "rebind-pad": beginCapture("pad-btn", el.dataset.target); break;
      case "rebind-axis": beginCapture("pad-axis", el.dataset.target); break;
    }
  });

  draw(); // one synchronous render at mount

  return {
    dispose() {
      stopPadCapture();
      window.removeEventListener("keydown", onKey, true);
    },
  };
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
