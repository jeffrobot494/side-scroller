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
import { createLoopback } from "./net/loopback.js";
import { connect } from "./net/client.js";
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

// This page is the HOST (tech/multiplayer-session.md, W1): it holds the session,
// the wire drawn over it, and one client per seat. A SCREEN holds a client and
// nothing else — no session, no other seat, no round — which is what makes the
// same hub correct once the wire is a socket instead of a loopback.
const transport = createLoopback(session);
const clients = new Map(roster.map((p) => [p.id, connect(transport, p.id)]));

// The seat on screen. THREE bindings capture a player and all three move
// together on a swap: the hub's view, the ambient layer's, and the command
// closure below. Re-pointing the two views and not the closure would send one
// commander's clicks to another's campaign, and no test imports this file.
let you = roster[0].id;
let client = clients.get(you);

// Ambient crew walking behind the hub DOM (paused + hidden during missions).
const ambient = createHubAmbient(client.view());
document.body.insertBefore(ambient.el, hubRoot);

// The hub's FPS chip. Mounted on the body, NOT in #hub-root — Hub.render()
// replaces that element's innerHTML wholesale on every navigation. The mission
// draws its own readout into the canvas HUD, so this one hides during a deploy.
const fpsMeter = createFpsMeter();
document.body.appendChild(fpsMeter.el);

// The mission scene calls back here when it resolves.
const mission = new Mission(canvas, onMissionComplete);

// The hub launches missions through this small API.
const hub = new Hub(hubRoot, client.view(), {
  // Bound to whichever seat is on screen, so the hub never holds a session
  // reference and never learns a player id.
  //
  // The round is picked up HERE rather than inside the hub, because the hub
  // must never see another commander's locked lead or squad. Deferred by a
  // microtask so the hub finishes the render it is in the middle of before the
  // canvas takes the screen from it.
  command(cmd, onAnswer) {
    client.send(cmd, (res) => {
      // The hub reconciles FIRST, the round starts second. That ordering used to
      // be bought with a queueMicrotask here — the answer was a return value, so
      // deferring the round was the only way to let the hub finish the render it
      // was in the middle of before the canvas took the screen. The answer now
      // arrives on a microtask of its own, and the hub's render happens inside
      // `onAnswer`, so the order is expressed by these two lines instead of by a
      // scheduling trick. It still has to hold.
      if (onAnswer) onAnswer(res);
      if (res && res.roundClosed) runRound();
    });
  },
  // Called by the results screen's "Return to base". That click is the only
  // signal the page has that a commander has finished reading — starting the
  // next mission from onMissionComplete would destroy the screen where they
  // learn where everyone else went.
  roundNext: playNext,
});

// The hot-seat strip, above the top bar and outside #hub-root (Hub.render()
// replaces that element's innerHTML on every navigation). Hidden at one player.
// FOUR bindings move on a swap, not three. The round dispatcher calls this
// directly (playNext follows the mission's owner), and the switcher is a
// control with its own idea of the current seat — so a programmatic swap that
// does not tell it leaves the dropdown naming a base that is not on screen.
// It was three for the whole of S5: the swap only ever came FROM the dropdown
// until the round dispatcher started driving it.
//
// No loop: setPlayer assigns select.value, which does not fire `change`, and a
// swap arriving from the dropdown sets the id it already holds.
function swapTo(id) {
  you = id;
  client = clients.get(id); // FIVE bindings now: the seat's client is one of them
  const view = client.view();
  hub.setView(view); // renders
  ambient.setView(view);
  hotSeat.setPlayer(id);
}

const hotSeat = createHotSeat(roster, swapTo);
document.body.insertBefore(hotSeat.el, ambient.el);

// The round's missions, in the order the session handed them over. WHICH plays
// first, whether anything is drawn between them, and whose base the hub shows
// meanwhile are all decided here — the session never learns what a canvas is,
// and all of this dies with hot-seat.
let queue = [];
let current = null;

function runRound() {
  // Still a pull, and still the host's rather than a seat's: a round is what the
  // page sequences. W2 turns this into a push the transport makes.
  queue = transport.takeRound();
  playNext();
}

function playNext() {
  current = queue.shift() || null;
  if (!current) return;
  // Hot-seat: the seat follows the mission, so the commander who committed it
  // is the one whose base the results land on. Swap FIRST — setView nulls
  // _lastSquad, so noting the squad before it would throw the names away.
  if (current.playerId !== you) swapTo(current.playerId);
  hub.noteDispatch(current.squad);
  showScene("mission");
  mission.start(current.mission, current.level, current.squad);
}

function onMissionComplete(result) {
  const done = current;
  current = null;
  // Routed by the DISPATCH, not by the seat on screen: the commander who owns
  // the mission is on it, and the seat can be swapped while a mission is up.
  // Sent through the OWNER's client, not the seat on screen — the mission's
  // commander is who the report belongs to, and the seat can be swapped while a
  // mission is up. The results screen is the only place the round's day summary
  // can land (S5), and that summary is this command's answer, so the screen is
  // built inside the callback rather than before it.
  clients.get(done.playerId).send({ type: "missionResult", result, dispatchId: done.dispatchId }, (res) => {
    showScene("hub");
    hub.showResults(result, res);
  });
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
