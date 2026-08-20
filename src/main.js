// ---------------------------------------------------------------------------
// APP ENTRY / SCENE MANAGER  (Phase 0 — one app, one state)
//
// One page, one game state, two scenes. The hub (DOM) and the mission (canvas)
// share a single state object; this module owns the toggle between them. A
// deploy in the hub carries a squad into a mission; the mission's result comes
// back here, is applied to state, and is shown on the results screen.
// ---------------------------------------------------------------------------

import { createSession } from "./game/session.js";
import { Hub } from "./hub/hub.js";
import { Mission } from "./mission/mission.js";
import { createHubAmbient } from "./hub/ambient.js";
import { createFpsMeter } from "./hub/fpsmeter.js";
import { audio } from "./audio/engine.js";

const hubRoot = document.getElementById("hub-root");
const canvas = document.getElementById("game");

// Browsers refuse to start an AudioContext outside a user gesture, so the
// engine stays dormant until the player's first click or keypress.
audio.armUnlock();

// UI clicks are voiced from ONE delegated listener rather than threaded through
// every hub screen — the hub owns no rules and shouldn't own sound wiring either.
hubRoot.addEventListener("click", (e) => {
  const btn = e.target.closest("button, .card, [data-action]");
  if (!btn || btn.disabled) return;
  const back = /back|cancel|return/i.test(btn.dataset.action || btn.textContent || "");
  audio.play(back ? "ui.back" : "ui.click");
});

// One authoritative session owns the campaign; the page renders one player's
// view of it. Single-player is a session with one player — there is no second
// path through which state changes. Plan: tech/multiplayer-state.md.
const session = createSession();
const you = session.playerIds()[0]; // S2 turns this into the hot-seat swap
const game = session.view(you);

// Which player a mission was launched for, captured at deploy rather than read
// at completion — the player on screen and the player who deployed are the same
// today, and stop being the same in S2.
let deployedBy = you;

// Ambient crew walking behind the hub DOM (paused + hidden during missions).
const ambient = createHubAmbient(game);
document.body.insertBefore(ambient.el, hubRoot);

// The hub's FPS chip. Mounted on the body, NOT in #hub-root — Hub.render()
// replaces that element's innerHTML wholesale on every navigation. The mission
// draws its own readout into the canvas HUD, so this one hides during a deploy.
const fpsMeter = createFpsMeter();
document.body.appendChild(fpsMeter.el);

// The mission scene calls back here when it resolves.
const mission = new Mission(canvas, onMissionComplete);

// The hub launches missions through this small API.
const hub = new Hub(hubRoot, game, {
  // Pre-bound to this hub's player, so the hub never holds a session reference
  // and never learns a player id. S2's swap re-binds this one closure.
  command: (cmd) => session.command(you, cmd),
  startMission(missionDef, level, squad) {
    deployedBy = you;
    showScene("mission");
    mission.start(missionDef, level, squad);
  },
});

function onMissionComplete(result) {
  session.command(deployedBy, { type: "missionResult", result });
  showScene("hub");
  hub.showResults(result);
}

// Toggle which surface is visible. The DOM hub and the canvas never render at
// the same time, so input never crosses over.
function showScene(name) {
  const inMission = name === "mission";
  canvas.style.display = inMission ? "block" : "none";
  hubRoot.style.display = inMission ? "none" : "block";
  ambient.setVisible(!inMission);
  fpsMeter.setSceneVisible(!inMission);
}

showScene("hub");
hub.render();
