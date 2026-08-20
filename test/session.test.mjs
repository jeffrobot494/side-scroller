// ---------------------------------------------------------------------------
// THE SESSION — commands, the view projection, and the DOM-free rule.
//
// Covers src/game/session.js (tech/multiplayer-state.md, S1). Note what this
// suite CANNOT cover: nothing imports src/hub/hub.js or src/main.js, so the
// redirect of the five hub write sites is guarded by playing the game, not by
// this file. What is here is the seam itself.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as resolvePath } from "node:path";
import { createSession } from "../src/game/session.js";
import { createState, livingRoster } from "../src/game/state.js";
import { WEAPONS } from "../src/game/content.js";
import { resetConfig } from "../src/game/config.js";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

// A lead the campaign math can resolve without running level generation — the
// same trick test/wiring.test.mjs uses, plus the `level` the deploy hands back.
const fakeLead = (id) => ({
  id,
  name: id,
  brief: "",
  difficulty: "Medium",
  threatReward: 0,
  winsCampaign: false,
  daysLeft: 9,
  level: { platforms: [] },
});

export default async function run(t) {
  resetConfig();

  // ---- players are a collection, never a pair ----------------------------
  {
    const solo = createSession();
    t.eq("a default session is single-player", solo.playerCount(), 1);

    const three = createSession({ playerIds: ["a", "b", "c"] });
    t.eq("a session takes an arbitrary number of players", three.playerCount(), 3);
    t.ok("the third player has a view", !!three.view("c"));
    t.ok("the third player can command", three.command("c", { type: "advanceDay" }).ok);

    // The caller must not be able to reshape the roster of players.
    const ids = three.playerIds();
    ids.push("intruder");
    t.eq("playerIds() hands out a copy", three.playerCount(), 3);
  }

  // ---- the public surface is the seam ------------------------------------
  {
    const s = createSession();
    t.eq(
      "the session exposes exactly five methods and no campaign",
      Object.keys(s).sort(),
      ["command", "hasPlayer", "playerCount", "playerIds", "view"]
    );
    t.ok("unknown player is rejected, not thrown", s.command("nobody", { type: "advanceDay" }).ok === false);

    let threw = false;
    try {
      s.view("nobody");
    } catch {
      threw = true;
    }
    t.ok("an unknown player's VIEW throws rather than rendering empty", threw);

    const before = s.view("p1").day;
    t.ok("an unknown command is rejected", s.command("p1", { type: "teleport" }).ok === false);
    t.eq("...and changes nothing", s.view("p1").day, before);
    t.ok("a malformed command is rejected", s.command("p1", null).ok === false);
  }

  // ---- the view is a live projection, not a snapshot ----------------------
  {
    const campaign = createState();
    const s = createSession({ state: campaign });
    const v = s.view("p1");

    t.eq(
      "the view carries exactly the player-visible fields",
      Object.keys(v).sort(),
      [
        "armory", "building", "campaignHealth", "completedMissions", "day",
        "leads", "log", "money", "outcome", "playerId", "recruits", "roster", "stores",
      ]
    );
    t.ok("highWins is not on the view", !("highWins" in v));

    // Grabbed BEFORE the command: a snapshot would still read day 1, and the
    // hub's end-screen promotion (hub.js reads g.outcome every render) would
    // never fire.
    s.command("p1", { type: "advanceDay" });
    t.eq("the view reads through after a command", v.day, 2);

    t.ok("the view aliases the live roster array", v.roster === campaign.roster);
    t.ok("the view aliases the live armory array", v.armory === campaign.armory);

    let threw = false;
    try {
      v.money = 999;
    } catch {
      threw = true;
    }
    t.ok("writing through the view throws", threw);
    t.eq("...and the campaign is untouched", v.money, campaign.money);

    t.ok("the same view object is returned each call", s.view("p1") === v);
  }

  // ---- commands delegate, and return results verbatim ---------------------
  {
    const campaign = createState();
    const s = createSession({ state: campaign });
    const v = s.view("p1");

    const rec = v.recruits[0];
    const money = v.money;
    const res = s.command("p1", { type: "hire", recruitId: rec.id });
    t.ok("hire succeeds", res.ok);
    t.eq("hire spends the recruit's cost", v.money, money - rec.cost);
    t.ok("the hired soldier is on the roster", v.roster.some((r) => r.id === rec.id));
    t.eq("livingRoster works against a view", livingRoster(v).length, 1);

    t.eq(
      "hire's refusal reaches the hub verbatim",
      s.command("p1", { type: "hire", recruitId: "nobody" }),
      { ok: false, reason: "That recruit is no longer available." }
    );

    // The exact object the results screen prints at hub.js's sell case.
    t.eq(
      "sellLoot's refusal reaches the hub verbatim",
      s.command("p1", { type: "sellLoot" }),
      { ok: false, reason: "Nothing to sell." }
    );

    campaign.stores.push({ name: "Alloy", value: 40 });
    const sold = s.command("p1", { type: "sellLoot" });
    t.eq("sellLoot reports count and total", [sold.ok, sold.count, sold.total], [true, 1, 40]);

    // The advance case reads .length on all three arrays to build its flash.
    const day = s.command("p1", { type: "advanceDay" });
    t.ok(
      "advanceDay returns all three arrays",
      day.ok && Array.isArray(day.finished) && Array.isArray(day.expired) && Array.isArray(day.arrived)
    );

    campaign.outcome = "lost";
    t.eq(
      "advanceDay's refusal reaches the hub verbatim",
      s.command("p1", { type: "advanceDay" }),
      { ok: false, reason: "The campaign is over." }
    );
  }

  // ---- deploy: the assembly moved out of the hub --------------------------
  {
    const campaign = createState();
    const s = createSession({ state: campaign });
    const v = s.view("p1");
    s.command("p1", { type: "hire", recruitId: v.recruits[0].id });
    const soldier = v.roster[0];
    const lead = fakeLead("lead_1");
    campaign.leads.push(lead);

    const res = s.command("p1", { type: "deploy", leadId: "lead_1", soldierIds: [soldier.id], weapons: {} });
    t.ok("deploy succeeds", res.ok);
    t.ok("deploy hands back the lead and its level", res.mission === lead && res.level === lead.level);
    t.eq("deploy builds one squad entry per soldier", res.squad.length, 1);

    // The assertion a playthrough cannot make: a clone would still print the
    // right name on the results screen and still match by id, and only diverge
    // later, where entities.js reads data.wounds off the live soldier.
    t.ok("the squad holds the LIVE roster soldier", res.squad[0].data === campaign.roster[0]);
    t.eq("deploy charges the mission to the soldier's record", soldier.record.missions, 1);

    // weaponId defaults to "carbine" at hire, so the fallback chain is only
    // visible when a pick is actually made.
    t.ok("no pick falls back to the soldier's own weapon", res.squad[0].weapon === campaign.armory[0]);

    campaign.armory.push({ id: "zapper", name: "Zapper" });
    const picked = s.command("p1", {
      type: "deploy",
      leadId: "lead_1",
      soldierIds: [soldier.id],
      weapons: { [soldier.id]: "zapper" },
    });
    t.ok("an explicit pick resolves to the live armory entry", picked.squad[0].weapon === campaign.armory[1]);
    t.eq("...and charges the record again", soldier.record.missions, 2);

    const junk = s.command("p1", {
      type: "deploy",
      leadId: "lead_1",
      soldierIds: [soldier.id],
      weapons: { [soldier.id]: "nonexistent" },
    });
    t.ok("an unresolvable weapon falls back to the carbine", junk.squad[0].weapon === WEAPONS.carbine);

    // Every rejection must leave record.missions where it was — the old hub
    // loop incremented as it walked and could charge a partial squad.
    const charged = soldier.record.missions;
    const bad = [
      { leadId: "no-such-lead", soldierIds: [soldier.id] },
      { leadId: "lead_1", soldierIds: [] },
      { leadId: "lead_1", soldierIds: ["ghost-who-was-never-hired"] },
      { leadId: "lead_1", soldierIds: [soldier.id, soldier.id] },
    ];
    let allRejected = true;
    for (const cmd of bad) if (s.command("p1", { type: "deploy", ...cmd }).ok) allRejected = false;
    t.ok("every malformed deploy is rejected", allRejected);
    t.eq("...and none of them charged a mission", soldier.record.missions, charged);
  }

  // ---- missionResult does not leak the campaign back out ------------------
  {
    const campaign = createState();
    const s = createSession({ state: campaign });
    const res = s.command("p1", {
      type: "missionResult",
      result: { success: true, missionId: "none", casualties: [], survivors: [], loot: [], killsBySoldier: [] },
    });
    t.eq("missionResult reports ok and nothing else", res, { ok: true });
    t.ok("...and does not hand back the state", res !== campaign && res.roster === undefined);
  }

  // ---- the DOM-free rule needs its own assertion --------------------------
  // test/run.mjs calls installDom() once for the WHOLE run, so document/window
  // are on globalThis by the time this suite loads and a DOM reference inside
  // the session would pass every other suite silently.
  {
    const src = readFileSync(join(ROOT, "src/game/session.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const dom = /\b(document|window|navigator|requestAnimationFrame|cancelAnimationFrame|HTMLElement|Image|alert)\b/.exec(src);
    t.ok(`session.js names no DOM global${dom ? ` — found "${dom[1]}"` : ""}`, !dom);
    t.ok("session.js does not reach localStorage directly", !/\blocalStorage\b/.test(src));
  }

  resetConfig();
}
