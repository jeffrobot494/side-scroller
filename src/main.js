// ---------------------------------------------------------------------------
// APP ENTRY / SCENE MANAGER  (Phase 0 — one app, one state)
//
// One page, one game state, two scenes. The hub (DOM) and the mission (canvas)
// share a single state object; this module owns the toggle between them. A
// deploy in the hub carries a squad into a mission; the mission's result comes
// back here, is applied to state, and is shown on the results screen.
// ---------------------------------------------------------------------------

import { createState, applyMissionResult } from "./game/state.js";
import { Hub } from "./hub/hub.js";
import { Mission } from "./mission/mission.js";
import { createHubAmbient } from "./hub/ambient.js";

const hubRoot = document.getElementById("hub-root");
const canvas = document.getElementById("game");

const game = createState();

// Ambient crew walking behind the hub DOM (paused + hidden during missions).
const ambient = createHubAmbient(game);
document.body.insertBefore(ambient.el, hubRoot);

// The mission scene calls back here when it resolves.
const mission = new Mission(canvas, onMissionComplete);

// The hub launches missions through this small API.
const hub = new Hub(hubRoot, game, {
  startMission(missionDef, level, squad) {
    showScene("mission");
    mission.start(missionDef, level, squad);
  },
});

function onMissionComplete(result) {
  applyMissionResult(game, result);
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
}

showScene("hub");
hub.render();
