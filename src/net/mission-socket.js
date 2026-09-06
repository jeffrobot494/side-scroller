// ---------------------------------------------------------------------------
// THE MISSION SOCKET — the browser half  (tech/multiplayer-missions.md, J8)
//
// A seat's end of a mission the ROOM is holding. It sends this keyboard's input
// once per fixed step and applies the snapshots that come back. It simulates
// nothing, predicts nothing and interpolates nothing: that is the architecture
// netproto measured (~60ms input→pixels at ~35ms RTT, which plays; 245ms at
// 210ms, which does not), and prediction is a later slice if the feel demands
// it rather than a thing to half-do here.
//
// BESIDE `src/net/remote.js`, NOT INSIDE IT. That file is the turn-boundary
// client — commands out over fetch, snapshots and dispatches in over
// EventSource — and its three names are pinned by the suites. This is a second
// connection with a different lifetime (one mission, not one campaign) and a
// different cadence, and the two must not learn each other's.
//
// BROWSER-ONLY, like `remote.js`: it names `WebSocket` and `location`, both
// injectable so a suite can drive it without either.
// ---------------------------------------------------------------------------

import { packInput, applySnapshot } from "./mission-wire.js";
import { config } from "../game/config.js";

// ws:// off the page's own origin, so a room opened on a laptop is reached at
// that laptop rather than at localhost — the same reasoning as `seatLink`.
export function missionSocketUrl(href, token) {
  const url = new URL(href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/mission";
  url.search = `token=${encodeURIComponent(token)}`;
  url.hash = "";
  return url.href;
}

// `mission` is the local `Mission` playing viewer. Returns the driver
// `Mission.start` takes as its `net` argument: one verb, `step`, called once
// per fixed step from inside the accumulator.
export function createMissionSocket(token, opts = {}) {
  const Sock = opts.WebSocket || globalThis.WebSocket;
  const url = opts.url || missionSocketUrl(opts.href || globalThis.location.href, token);
  const ws = new Sock(url);
  let seq = 0;
  let open = false;
  // The newest snapshot applied. A room sends in order and TCP delivers in
  // order, so this fires on a reconnect rather than on a reorder — but a
  // snapshot older than the one on screen is a rewind either way, and drawing
  // one is worse than drawing nothing.
  let at = -1;

  ws.onopen = () => {
    open = true;
  };
  ws.onclose = () => {
    open = false;
  };

  return {
    // ONE PACKET PER STEP, never one per rendered frame — the same contract
    // J4 gave `sampleInputs`, and for the same reason: a 144Hz monitor must not
    // flood the room and a 30Hz one must not starve it.
    //
    // Aim is resolved to WORLD coordinates here, against this page's own camera
    // (J7's three shapes). The room holds one scene for two viewers and cannot
    // resolve either one's camera, so `mouse` is a shape that must not cross.
    step(mission) {
      if (!open) return;
      const pkt = packInput(mission.input, ++seq, config.aimMode, (x, y) => mission.toWorld(x, y));
      pkt.t = "in";
      ws.send(JSON.stringify(pkt));
    },

    // Installed by whoever built this, once the mission exists. Separate from
    // the constructor because the socket is opened BEFORE the mission is
    // started — `Mission.start` takes this driver as an argument — and a
    // snapshot arriving in that gap has nothing to be applied to.
    listen(mission) {
      ws.onmessage = (e) => {
        let m;
        try {
          m = JSON.parse(typeof e.data === "string" ? e.data : "");
        } catch {
          return;
        }
        if (!m || m.t !== "snap") return;
        // A snapshot older than the one on screen is a rewind, and drawing one
        // is worse than drawing nothing: every body on the level jumps back and
        // then forward again.
        if (typeof m.n === "number" && m.n <= at) return;
        if (typeof m.n === "number") at = m.n;
        applySnapshot(mission, m);
      };
    },

    close() {
      open = false;
      try {
        ws.close();
      } catch {
        /* already gone */
      }
    },
  };
}
