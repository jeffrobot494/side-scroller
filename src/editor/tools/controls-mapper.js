// ---------------------------------------------------------------------------
// CONTROLS MAPPER — rebind keyboard keys for the action layer.
//
// Lists every logical action with its current key and lets you capture a new one
// ("Rebind" → press a key). Bindings persist through controlmap.js and are read
// live by the game + Firing Room, so a remap applies without a reload. The
// gamepad column is the fixed default binding (informational this pass).
//
// createControlsMapper(container, onBack) → { dispose() }
// ---------------------------------------------------------------------------

import { ACTIONS, ACTION_LABELS, PAD_LABELS, keyBindings, bindingsForAction, setKeyBinding, resetKeys } from "../../game/controlmap.js";

// Friendlier names for a few KeyboardEvent.code values.
const KEY_NAMES = { Space: "Space", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", ShiftLeft: "L-Shift", ShiftRight: "R-Shift", Tab: "Tab" };
function keyName(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code && code.startsWith("Key")) return code.slice(3);
  if (code && code.startsWith("Digit")) return code.slice(5);
  return code || "—";
}

export function createControlsMapper(container, onBack) {
  let capturing = null; // action currently awaiting a key, or null

  container.innerHTML = `
    <div class="wd cm">
      <div class="wd-head">
        <button class="btn btn-ghost" data-cm="back">← Tools</button>
        <span class="wd-name" style="min-width:auto">Controls</span>
        <span class="wd-id" id="cm-hint"></span>
      </div>
      <p class="ed-note">
        Click <strong>Rebind</strong>, then press a key. Bindings save to this browser and apply live to
        the game and the Firing Room. Gamepad uses fixed defaults (right stick aims; set aim mode in Settings).
      </p>
      <table class="cm-table">
        <thead><tr><th>Action</th><th>Key</th><th>Gamepad</th><th></th></tr></thead>
        <tbody id="cm-rows"></tbody>
      </table>
      <div class="ed-io-btns">
        <button class="btn btn-alt" data-cm="reset">Reset to defaults</button>
      </div>
    </div>`;

  const $ = (s) => container.querySelector(s);

  function rows() {
    return ACTIONS.map((action) => {
      const keys = bindingsForAction(action).map(keyName).join(" / ") || "—";
      const pad = (PAD_LABELS[action] || []).join(" / ") || "—";
      const cap = capturing === action;
      return `<tr${cap ? ' class="cm-capturing"' : ""}>
        <td>${ACTION_LABELS[action] || action}</td>
        <td class="cm-key">${cap ? "press a key…" : escapeHtml(keys)}</td>
        <td class="cm-pad">${escapeHtml(pad)}</td>
        <td><button class="btn btn-alt cm-rebind" data-cm="rebind" data-action="${action}">${cap ? "Cancel" : "Rebind"}</button></td>
      </tr>`;
    }).join("");
  }

  function draw() {
    $("#cm-rows").innerHTML = rows();
    $("#cm-hint").textContent = capturing ? `binding ${capturing}…` : "";
  }

  // Key capture: the next keydown while `capturing` binds that key. Escape cancels.
  const onKey = (e) => {
    if (!capturing) return;
    e.preventDefault();
    if (e.code !== "Escape") setKeyBinding(e.code, capturing);
    capturing = null;
    draw();
  };
  window.addEventListener("keydown", onKey, true);

  container.addEventListener("click", (e) => {
    const el = e.target.closest("[data-cm]");
    if (!el) return;
    switch (el.dataset.cm) {
      case "back": onBack(); break;
      case "reset": resetKeys(); capturing = null; draw(); break;
      case "rebind":
        capturing = capturing === el.dataset.action ? null : el.dataset.action;
        draw();
        break;
    }
  });

  draw(); // one synchronous render at mount

  return {
    dispose() {
      window.removeEventListener("keydown", onKey, true);
    },
  };
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
