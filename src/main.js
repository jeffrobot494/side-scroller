// ---------------------------------------------------------------------------
// APP ENTRY / SCENE MANAGER
//
// One page, one session, two scenes. The hub (DOM) and the mission (canvas)
// share one authoritative session; this module owns the toggle between them. A
// deploy in the hub carries a squad into a mission; the mission's result comes
// back here, is sent to the session as a command, and is shown on the results
// screen.
//
// It also owns WHICH player the page is currently showing. A campaign is one
// world with a base per commander (tech/multiplayer-state.md, S2) and the page
// renders one seat at a time. `?players=2` opens a hot-seat campaign; the plain
// URL is the single-player game, with the switcher hidden and nothing else
// different.
// ---------------------------------------------------------------------------

import { createSession } from "./game/session.js";
import { createHotSeat } from "./hub/hotseat.js";
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

// Commander names come from the mockup's task force. Labels only — the design
// rules out any mechanical difference between them. Past the authored three,
// seats are numbered rather than invented.
const COMMANDERS = ["USA", "China", "Brazil"];
const MAX_PLAYERS = 6;

function seats() {
  const asked = Number(new URLSearchParams(location.search).get("players")) || 1;
  const n = Math.max(1, Math.min(MAX_PLAYERS, Math.floor(asked)));
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: COMMANDERS[i] || `Commander ${i + 1}`,
  }));
}

// One authoritative session owns the campaign; the page renders one player's
// view of it. Single-player is a session with one player — there is no second
// path through which state changes. Plan: tech/multiplayer-state.md.
const roster = seats();
const session = createSession({ players: roster });

// The seat on screen. THREE bindings capture a player and all three move
// together on a swap: the hub's view, the ambient layer's, and the command
// closure below. Re-pointing the two views and not the closure would send one
// commander's clicks to another's campaign, and no test imports this file.
let you = roster[0].id;

// Which player a mission was launched for, captured at deploy rather than read
// at completion — the seat can change while a mission is up.
let deployedBy = you;

// Ambient crew walking behind the hub DOM (paused + hidden during missions).
const ambient = createHubAmbient(session.view(you));
document.body.insertBefore(ambient.el, hubRoot);

// The hub's FPS chip. Mounted on the body, NOT in #hub-root — Hub.render()
// replaces that element's innerHTML wholesale on every navigation. The mission
// draws its own readout into the canvas HUD, so this one hides during a deploy.
const fpsMeter = createFpsMeter();
document.body.appendChild(fpsMeter.el);

// The mission scene calls back here when it resolves.
const mission = new Mission(canvas, onMissionComplete);

// The hub launches missions through this small API.
const hub = new Hub(hubRoot, session.view(you), {
  // Bound to whichever seat is on screen, so the hub never holds a session
  // reference and never learns a player id.
  command: (cmd) => session.command(you, cmd),
  startMission(missionDef, level, squad) {
    deployedBy = you;
    showScene("mission");
    mission.start(missionDef, level, squad);
  },
});

// The hot-seat strip, above the top bar and outside #hub-root (Hub.render()
// replaces that element's innerHTML on every navigation). Hidden at one player.
const hotSeat = createHotSeat(roster, (id) => {
  you = id;
  const view = session.view(you);
  hub.setView(view); // renders
  ambient.setView(view);
});
document.body.insertBefore(hotSeat.el, ambient.el);

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
  // No swapping seats mid-mission: the hub is not on screen, and a swap would
  // re-point it under a result that has not landed yet.
  hotSeat.setSceneVisible(!inMission);
}

showScene("hub");
hub.render();
