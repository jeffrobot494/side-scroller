// ---------------------------------------------------------------------------
// APP ENTRY / SCENE MANAGER
//
// One page, one session, two scenes. The hub (DOM) and the mission (canvas)
// share one authoritative session; this module owns the toggle between them. A
// deploy in the hub carries a squad into a mission; the mission's result comes
// back here, is sent to the session as a command, and is shown on the results
// screen.
//
// It also owns WHICH player the page is currently showing, and — since V2
// (tech/multiplayer-service.md) — WHICH TRANSPORT it is holding. Four URLs:
//
//   index.html                the single-player game. A loopback, one seat, the
//                             switcher hidden, and no process needed to serve it
//   index.html?players=2      hot-seat. A loopback, several seats in one tab,
//                             the page as host. Development scaffolding
//   index.html?room=2         the LOBBY (V3). Opens a room and prints one link
//                             per seat. It joins nothing: no session, no
//                             transport, no commander — it hands out the seats
//                             and the game starts when somebody follows one
//   index.html?seat=<token>   a ROOM. The session is in server.mjs and this page
//                             is one commander's end of it. The lobby is what
//                             hands that link to a person
//
// The two transports differ in exactly two ways that reach this file, and both
// are here rather than hidden behind the seam because they are the page's own
// shape: a loopback is READY WHEN IT RETURNS and a room is not (so nothing is
// constructed at module top level any more), and a loopback hands the HOST a
// whole round to sequence while a room pushes ONE dispatch at the one seat it
// belongs to (so the round dispatcher forks). The fork is temporary and has a
// named exit: it collapses when hot-seat is deleted.
// ---------------------------------------------------------------------------

import { createSession } from "./game/session.js";
import { createLoopback } from "./net/loopback.js";
import { createRemote, openRoom, seatLink } from "./net/remote.js";
import { connect } from "./net/client.js";
import { createHotSeat } from "./hub/hotseat.js";
import { createLobby } from "./hub/lobby.js";
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
//
// The LOOPBACK's, and only the loopback's. A room's seats are named by the
// server (`src/net/rooms.js` holds the same list), because the page is not the
// host there and does not get to say who is playing.
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

// Everything below used to be built at module top level, which worked because
// `createLoopback` fills every seat's snapshot synchronously before it returns
// — the hub's first render dereferences `money` immediately. A snapshot that
// arrives over a network cannot be there yet, so construction moved into
// `boot()` and these became bindings. They are assigned exactly once.
let roster = [];
let transport = null;
let clients = new Map();
let ambient = null;
let hub = null;
let hotSeat = null;

// Whether this page is a seat in a room, decided once in `boot()` off the URL.
// Read by `mount()` for exactly one thing — see the hot-seat strip there.
let inRoom = false;

// The seat on screen. FIVE bindings capture a player and all five move together
// on a swap: the hub's view, the ambient layer's, the command closure below, the
// seat's client, and the switcher's own idea of the current seat. Re-pointing
// some and not the others would send one commander's clicks to another's
// campaign, and no test imports this file.
//
// In a room there is one seat and no swap: the subtraction is that `swapTo` is
// never called, not that it stops existing.
let you = null;
let client = null;

// The mission scene calls back here when it resolves. No view and no seat, so
// it is still built up front.
const mission = new Mission(canvas, onMissionComplete);

// The hub's FPS chip. Mounted on the body, NOT in #hub-root — Hub.render()
// replaces that element's innerHTML wholesale on every navigation. The mission
// draws its own readout into the canvas HUD, so this one hides during a deploy.
const fpsMeter = createFpsMeter();
document.body.appendChild(fpsMeter.el);

// Which transport, and it is the URL that decides. A room means remote; no room
// means the loopback exactly as before, byte for byte, with no process needed.
//
// The session is built INSIDE the loopback (W2) and the page never names it
// again: the round is announced to a channel handed in at construction, so the
// thing receiving the announcement has to exist first. In a room the session is
// not this page's at all — `server.mjs` holds it — and `createRemote` resolves
// only once the first snapshot has arrived.
async function boot() {
  const params = new URLSearchParams(location.search);
  const token = params.get("seat");

  // THE LOBBY IS NOT A GAME, and it returns before any of the below. It opens a
  // room and prints its links; it builds no transport, no client, no hub and no
  // ambient layer, because nothing on this page belongs to a commander yet. A
  // seat link is what starts a game, and following one is a fresh page load
  // down the `token` branch.
  //
  // `?seat=` wins if somehow both are present: a token is a real seat in a real
  // room, and opening a second room on top of it would be strictly worse.
  if (params.get("room") !== null && !token) {
    fpsMeter.setSceneVisible(false); // nothing is being drawn to measure
    createLobby(hubRoot, {
      players: params.get("room"),
      open: (spec) => openRoom(spec),
      link: (t) => seatLink(location.href, t),
    });
    return;
  }

  if (token) {
    inRoom = true;
    transport = await createRemote(token);
    // The seat and its name come off the snapshot, because a room's roster is
    // the server's to state. This page holds ONE commander and never learns of
    // another except through its own task-force strip.
    roster = [transport.seat()];
  } else {
    roster = seats();
    transport = createLoopback((announce, changed) =>
      createSession({ players: roster, announce, changed })
    );
  }

  // A client per seat, even at one seat. A SCREEN holds a client and nothing
  // else — no session, no other seat, no round — which is what makes the same
  // hub correct on either transport.
  clients = new Map(roster.map((p) => [p.id, connect(transport, p.id)]));
  you = roster[0].id;
  client = clients.get(you);
  mount();
}

// Everything that needs a view. One call, after the first snapshot exists.
function mount() {
  // Ambient crew walking behind the hub DOM (paused + hidden during missions).
  ambient = createHubAmbient(client.view());
  document.body.insertBefore(ambient.el, hubRoot);

  // The hub launches missions through this small API.
  hub = new Hub(hubRoot, client.view(), {
    // Bound to whichever seat is on screen, so the hub never holds a session
    // reference and never learns a player id.
    //
    // The round is picked up HERE rather than inside the hub, because the hub
    // must never see another commander's locked lead or squad.
    command(cmd, onAnswer) {
      client.send(cmd, (res) => {
        // The hub reconciles FIRST, the round starts second. That ordering used
        // to be bought with a queueMicrotask here — the answer was a return
        // value, so deferring the round was the only way to let the hub finish
        // the render it was in the middle of before the canvas took the screen.
        // The answer now arrives on a callback of its own, and the hub's render
        // happens inside `onAnswer`, so the order is expressed by these two
        // lines instead of by a scheduling trick. It still has to hold.
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

  // Every command refreshes every seat's snapshot (W3), and this is what puts
  // the result on screen for a commander who did not click anything: the other
  // one readying, the shared doom clock moving, a lead arriving on their board.
  // The hub's own write sites still render inside their answer callbacks — this
  // repaint has already happened by then, and carries no flash of its own.
  transport.watch(() => hub.refresh());

  // The hot-seat strip, above the top bar and outside #hub-root (Hub.render()
  // replaces that element's innerHTML on every navigation).
  //
  // NOT BUILT IN A ROOM (V3). It was already invisible there — a room page holds
  // one seat and the strip hides itself at one player — but invisible for the
  // wrong reason: the control's whole purpose is swapping between seats this
  // page holds, and a room page holds one seat because the OTHERS ARE OTHER
  // PEOPLE'S. Not constructing it is what says so, and it is why the two call
  // sites below are guarded rather than the control being handed an empty list.
  //
  // Outside a room it is untouched, one player or six: hot-seat is the only way
  // to drive two commanders on one machine and this spec deliberately does not
  // delete it. That is the next spec's, once a room is easier to open than
  // `?players=2` — which is what this slice just made true.
  hotSeat = inRoom ? null : createHotSeat(roster, swapTo);
  if (hotSeat) document.body.insertBefore(hotSeat.el, ambient.el);

  showScene("hub");
  hub.render();

  // THE ROUND DISPATCHER FORKS HERE, and the fork is which of two names the
  // transport has rather than a flag it carries. A room page is not the host:
  // the server routes each dispatch to the seat that owns it, so one arrives
  // pushed and there is no round to drain.
  //
  // LAST IN THIS FUNCTION, and that is not tidiness. `onDispatch` flushes any
  // dispatch the server was already holding for this seat — which is exactly
  // what a page that reloaded mid-round is owed — and playing one calls
  // showScene("mission"). Installed any earlier, the two lines above would then
  // put the hub back over a canvas that had just taken the screen, and the
  // commander would be looking at their base with a mission running underneath
  // it. The same three lines are harmless in the other order on the loopback,
  // which is why this is worth a comment rather than a reordering nobody
  // understands later.
  if (transport.onDispatch) transport.onDispatch(playPushed);
}

// FOUR bindings move on a swap, not three. The round dispatcher calls this
// directly (playNext follows the mission's owner), and the switcher is a
// control with its own idea of the current seat — so a programmatic swap that
// does not tell it leaves the dropdown naming a base that is not on screen.
// It was three for the whole of S5: the swap only ever came FROM the dropdown
// until the round dispatcher started driving it.
//
// No loop: setPlayer assigns select.value, which does not fire `change`, and a
// swap arriving from the dropdown sets the id it already holds.
//
// DEAD IN A ROOM, and left at column 0 on purpose — `test/session.test.mjs`
// captures this body with a regex that ends at a brace in the first column, so
// tucking it inside the async boot would silently widen the capture to the
// whole file and pin nothing.
function swapTo(id) {
  you = id;
  client = clients.get(id); // FIVE bindings now: the seat's client is one of them
  const view = client.view();
  hub.setView(view); // renders
  ambient.setView(view);
  // UNGUARDED, unlike the call in showScene, and that is the point: in a room
  // `hotSeat` is null and this whole function is unreachable, because the only
  // caller swaps when a dispatch's owner is not the seat on screen and the
  // server routes this seat nothing else. If it ever runs in a room, the routing
  // has broken and a thrown TypeError is a better outcome than a page that
  // half-swaps to a commander it has no client for.
  hotSeat.setPlayer(id);
}

// The round's missions, in the order they are to be played. WHICH plays first,
// whether anything is drawn between them, and whose base the hub shows meanwhile
// are all decided here — the session never learns what a canvas is.
let queue = [];
let current = null;

// HOT-SEAT'S HALF of the fork. The host drains the whole round and sequences
// every seat's mission, swapping the page between them.
//
// Still called off the `roundClosed` answer rather than from the arrival of the
// push, because the push lands first — inside session.command, before the hub
// has rendered the answer — and a mission that starts there takes the screen
// out from under a render in progress.
function runRound() {
  // A room page has no round to take. Absence rather than a flag: a transport
  // that offered a half-answering `takeRound` would be a transport this page
  // could not tell apart from the host's.
  if (!transport.takeRound) return;
  queue = transport.takeRound();
  playNext();
}

// A ROOM'S HALF. One dispatch, already routed to this seat by the server, and
// no other seat's mission will ever arrive here. Queued rather than started
// outright because the results screen's "Return to base" is what plays the next
// one, and because a dispatch can land while the previous mission is still up.
function playPushed(dispatch) {
  queue.push(dispatch);
  if (!current) playNext();
}

function playNext() {
  current = queue.shift() || null;
  if (!current) return;
  // Hot-seat: the seat follows the mission, so the commander who committed it
  // is the one whose base the results land on. Swap FIRST — setView nulls
  // _lastSquad, so noting the squad before it would throw the names away. In a
  // room the owner is always this seat, so this never fires.
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
  // The results screen is the only place the round's day summary can land (S5),
  // and that summary is this command's answer, so the screen is built inside
  // the callback rather than before it.
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
  // re-point it under a result that has not landed yet. Absent in a room, where
  // there is nothing to swap to.
  if (hotSeat) hotSeat.setSceneVisible(!inMission);
}

// The wait before the first snapshot is a visible state — a page with nothing on
// it — and it needs no design: on a working connection it is a fraction of a
// second, and the loopback does not have it at all. The FAILURE is worth a line,
// because a stale link and a restarted server are the two ways a room goes away
// and both are silent otherwise.
boot().catch((e) => {
  hubRoot.textContent = e && e.message ? e.message : "Could not reach that room.";
});
