// ---------------------------------------------------------------------------
// THE HUB'S SECOND DOOR — repaint on a broadcast, without clearing the screen.
//
// The first suite to drive src/hub/hub.js. It exists because W3
// (tech/multiplayer-session.md) gives the hub a refresh path that is NOT
// `setView`, and the difference between the two is nine fields of transient
// screen state that a seat swap destroys on purpose and a broadcast must not.
// The spec said the only guard was playing it; it is cheap enough not to be.
//
// What it does NOT do: assert anything about how the hub LOOKS. It reads the
// rendered string only where the string is the fact — that the flash the
// commander was just shown is still on screen after somebody else acted.
// ---------------------------------------------------------------------------

import { makeEl } from "./harness.mjs";
import { createSession } from "../src/game/session.js";
import { createLoopback } from "../src/net/loopback.js";
import { connect } from "../src/net/client.js";
import { Hub } from "../src/hub/hub.js";
import { config, resetConfig } from "../src/game/config.js";

const settle = () => new Promise((r) => setTimeout(r, 0));

// The page, in miniature: a transport, two seats, and a hub bound to the first.
//
// EVERY SEAT SEES EVERY LEAD, because a day-1 board is ONE lead (config.seedLeads)
// and `rollVisibility` decides per commander, off Math.random, at a default 0.5 —
// so p1 missed the only lead on ~19% of runs and every assertion reading
// `leads[0]` threw. The visibility roll is state.js's business and has its own
// cover; what this suite is asking is what the hub PRINTS about a lead, which
// needs a lead on the board to print.
function twoSeats() {
  config.leadVisibility = 1;
  const transport = createLoopback((announce, changed) =>
    createSession({
      players: [{ id: "p1", name: "USA" }, { id: "p2", name: "China" }],
      announce,
      changed,
    })
  );
  const p1 = connect(transport, "p1");
  const p2 = connect(transport, "p2");
  const root = makeEl("div");
  const hub = new Hub(root, p1.view(), { command: (cmd, cb) => p1.send(cmd, cb), roundNext() {} });
  transport.watch(() => hub.refresh());
  hub.render();
  return { transport, p1, p2, hub, root };
}

export default async function run(t) {
  resetConfig();

  // ---- the handle reads through ------------------------------------------
  {
    const { p1, hub, root } = twoSeats();
    const view = hub.game;
    t.ok("the hub renders at boot", root.innerHTML.length > 0);
    const before = view.roster.length;
    await new Promise((d) => p1.send({ type: "hire", recruitId: p1.view().recruits[0].id }, d));
    t.ok("the hub's view object never changed", hub.game === view);
    t.eq("...and sees the hire through it", hub.game.roster.length, before + 1);
  }

  // ---- a broadcast repaints, and clears nothing ---------------------------
  {
    const { p2, hub, root } = twoSeats();

    // Every transient field, set to something recognisable. A seat swap nulls
    // all of these; a repaint may not touch one of them.
    hub.location = "operations";
    hub.mode = "results";
    hub.result = { success: true, casualties: [], survivors: [], loot: [], kills: 0, missionName: "Raid" };
    hub.turn = { dayTurned: true, finished: [], expired: [], arrived: [] };
    hub.sold = true;
    hub.shareOpen = "lead_x";
    hub._lastSquad = [{ id: "s1", name: "Vance" }];
    hub.pending = { action: "hire", id: null };
    hub.setFlash("good", "SENTINEL FLASH");
    hub.render();

    await new Promise((d) => p2.send({ type: "ready" }, d));
    await settle();

    t.ok("a broadcast repaints for a seat that clicked nothing",
      /China/.test(root.innerHTML));
    t.eq("...and leaves the screen it is on", [hub.mode, hub.location], ["results", "operations"]);
    t.ok("...the results it is showing", !!hub.result && hub.turn !== null && hub.sold === true);
    t.ok("...the squad the dead are named from", !!hub._lastSquad);
    t.ok("...an open share menu", hub.shareOpen === "lead_x");
    t.ok("...and the in-flight control marker", !!hub.pending);
    // The one that is not a field: the flash lasts one paint, and a repaint the
    // commander did not ask for must not be the paint that spends it.
    t.ok("the flash this commander was shown survives", root.innerHTML.includes("SENTINEL FLASH"));
  }

  // ---- a deploy screen whose lead left the board --------------------------
  // Only reachable through this door: another commander's mission report clears
  // the lead from the shared board while this screen is open on it. Nothing
  // else repaints a screen it did not open.
  {
    const { hub, root } = twoSeats();
    hub.mode = "deploy";
    hub.deploy = { missionId: "lead-that-is-gone", selected: new Set(), weapons: {} };
    hub.refresh();
    t.eq("a stale deploy screen falls back rather than throwing", hub.mode, "hub");
    t.ok("...and says why", /no longer on the board/.test(root.innerHTML));
  }

  // ---- soldier progression readouts (tech/soldier-progression.md, P3) -----
  // Presence, not looks: the fact under test is that each surface prints what
  // the design says it prints, off the view's rules.
  {
    const { p1, hub, root } = twoSeats();
    hub.location = "barracks";
    hub.render();
    t.ok("a recruit card shows its primary/secondary before hire", /Primary/.test(root.innerHTML));
    await new Promise((d) => p1.send({ type: "hire", recruitId: p1.view().recruits[0].id }, d));
    await settle();
    hub.render();
    t.ok("a roster card shows level and XP to next", root.innerHTML.includes("Level 1 · 0/10 XP"));
    t.ok("...and the next level's gains", /Next level: \+10 HP/.test(root.innerHTML));
    const capped = hub._soldierCard({ ...hub.game.roster[0], xp: 9999 }, false);
    t.ok("...MAX at the cap", capped.includes("Level 10 · MAX"));
    t.ok("...with no next-level line", !/Next level/.test(capped));

    hub.location = "operations";
    hub.render();
    const lead = hub.game.leads[0];
    t.ok("an Ops lead shows its XP reward", root.innerHTML.includes(`+${lead.xpReward} XP`));
    hub.mode = "deploy";
    hub.deploy = { missionId: lead.id, selected: new Set(), weapons: {} };
    hub.render();
    t.ok("the Deploy header shows the reward", root.innerHTML.includes(`+${lead.xpReward} XP for every soldier who extracts`));
    t.ok("...and each Deploy card the level and labels", root.innerHTML.includes("Level 1 · 0/10 XP") && /Primary/.test(root.innerHTML));
    hub.mode = "hub";
    hub.deploy = null;

    hub.noteDispatch([], lead.id);
    hub.showResults(
      { success: true, casualties: [], survivors: ["s"], loot: [], kills: 0 },
      { ok: true, award: [{ id: "s", name: "Vance", xp: 50, fromLevel: 1, toLevel: 3, intoLevel: 20, nextCost: 40, max: false,
        gains: { hp: 20, attrs: { aim: 2, health: 1, speed: 1, nerve: 1 } } }] }
    );
    t.ok("results show the mission's reward", root.innerHTML.includes(`Mission reward: ${lead.xpReward} XP`));
    t.ok("...XP earned and the levels crossed", /Vance <b>\+50 XP<\/b>/.test(root.innerHTML) && root.innerHTML.includes("Level 1 → 3"));
    t.ok("...and the combined gains", root.innerHTML.includes("+20 HP, +2 Aim, +1 Health, +1 Speed, +1 Nerve"));
    hub.showResults({ success: false, casualties: [], survivors: [], loot: [], kills: 0 }, { ok: true, award: [] });
    t.ok("a report that paid nobody says so", root.innerHTML.includes("No XP earned."));
  }

  // ---- setView still destroys, because it is a seat swap ------------------
  {
    const { p2, hub } = twoSeats();
    hub.mode = "results";
    hub._lastSquad = [{ id: "s1", name: "Vance" }];
    hub.setView(p2.view());
    t.eq("a swap still clears the screen", hub.mode, "hub");
    t.ok("...and the previous seat's squad", hub._lastSquad === null);
  }

  resetConfig();
}
