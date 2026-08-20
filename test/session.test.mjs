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
import { createState, createWorld, livingRoster } from "../src/game/state.js";
import { RECRUIT_POOL, dealRecruits } from "../src/game/soldiers.js";
import { makeRng } from "../src/game/gen/rng.js";
import { WEAPONS } from "../src/game/content.js";
import { config, resetConfig } from "../src/game/config.js";

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

// Turning the day takes EVERY commander since S4. One seat readying is no
// longer a day, so a multi-player block that wants one has to ready the whole
// task force; the LAST click is the one that turns it and carries the summary.
const turnDay = (s, ids) => ids.map((id) => s.command(id, { type: "ready" })).pop();

export default async function run(t) {
  resetConfig();

  // ---- players are a collection, never a pair ----------------------------
  {
    const solo = createSession();
    t.eq("a default session is single-player", solo.playerCount(), 1);

    const three = createSession({ players: ["a", "b", "c"] });
    t.eq("a session takes an arbitrary number of players", three.playerCount(), 3);
    t.ok("the third player has a view", !!three.view("c"));
    t.ok("the third player can command", three.command("c", { type: "ready" }).ok);

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
    t.ok("unknown player is rejected, not thrown", s.command("nobody", { type: "ready" }).ok === false);

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
        // The only field that is not a projection of this player's campaign:
        // who else is in the task force and whether they have readied. S4.
        "taskForce",
      ]
    );
    t.ok("highWins is not on the view", !("highWins" in v));

    // Grabbed BEFORE the command: a snapshot would still read day 1, and the
    // hub's end-screen promotion (hub.js reads g.outcome every render) would
    // never fire.
    s.command("p1", { type: "ready" });
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
    const day = s.command("p1", { type: "ready" });
    t.ok(
      "advanceDay returns all three arrays",
      day.ok && Array.isArray(day.finished) && Array.isArray(day.expired) && Array.isArray(day.arrived)
    );

    campaign.outcome = "lost";
    t.eq(
      "advanceDay's refusal reaches the hub verbatim",
      s.command("p1", { type: "ready" }),
      { ok: false, reason: "The campaign is over." }
    );
  }

  // ---- deploy: the assembly moved out of the hub --------------------------
  {
    // This block deploys three times to walk the weapon fallback chain, which
    // the S4 one-per-day cap would refuse. The cap has its own block below;
    // here it is off, so what is under test is weapon resolution and nothing
    // else. Restored by the resetConfig() at the end of the suite.
    config.dayPerDeploy = false;
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


  // ---- two bases, one world (S2) -----------------------------------------
  // Three players, not two, throughout: the design is written for two and
  // nothing here may make a third impossible.
  {
    const world = createWorld();
    const s = createSession({ world, players: ["usa", "china", "brazil"] });
    const usa = s.view("usa"), china = s.view("china"), brazil = s.view("brazil");

    t.ok("every player reads the same day", usa.day === china.day && china.day === brazil.day);
    t.ok("...the same doom clock", usa.campaignHealth === brazil.campaignHealth);
    t.ok("...the same board, by identity", usa.leads === china.leads && china.leads === brazil.leads);
    t.ok("...and the same log", usa.log === brazil.log);

    t.ok("bases are separate objects", usa.roster !== china.roster && usa.armory !== china.armory);
    s.command("usa", { type: "hire", recruitId: usa.recruits[0].id });
    t.eq("a hire lands on one roster only", [usa.roster.length, china.roster.length], [1, 0]);
    t.ok("...and spends one player's credits", usa.money < china.money);
    t.eq("...and leaves the others' recruit lists whole", china.recruits.length, brazil.recruits.length);

    // The failure a plain reference would produce: advanceDay REPLACES
    // state.leads rather than splicing it, so a world field that was merely
    // aliased detaches here and hands each player a private board.
    const board = usa.leads;
    // Rot is the only thing that REASSIGNS the array (arrivals push into it), so
    // the leads have to be made to expire on this tick. Their lifespans were
    // rolled at generation, which is why this sets daysLeft rather than config.
    for (const l of board) l.daysLeft = 1;
    t.ok("two of three readying does not move the day", s.command("usa", { type: "ready" }).dayTurned === false);
    t.eq("...and the day is still where it was", usa.day, 1);
    turnDay(s, ["china", "brazil"]);
    t.ok("the board survives being reassigned", usa.leads === china.leads);
    t.ok("...and it really was reassigned", usa.leads !== board);
    t.eq("the last commander to ready moves the day once, for everyone", [usa.day, china.day, brazil.day], [2, 2, 2]);
    resetConfig();
  }

  // ---- a day is spent by everybody, whoever asked for it ------------------
  {
    const world = createWorld();
    const s = createSession({ world, players: ["usa", "china", "brazil"] });
    const usa = s.view("usa"), china = s.view("china");

    // Fabrication timers and wound healing are the PLAYER half of a day. Before
    // S2 they lived inside advanceDay, so only the commander who pressed the
    // button got them — the other two paid a doom tick for a day their base
    // never lived through.
    for (const id of ["usa", "china"]) s.command(id, { type: "commission", blueprintId: "bp_railgun" });
    const fresh = usa.building[0].daysLeft;
    t.ok("both bases hold a fresh job", fresh > 1 && china.building[0].daysLeft === fresh);

    const hurt = { status: "roster", wounds: 3, record: { missions: 0, kills: 0 } };
    china.roster.push({ id: "hurt", name: "Hurt", ...hurt });

    // Brazil, who built nothing and hired nobody, is last to ready and so is
    // the one whose click turns it.
    turnDay(s, ["usa", "china", "brazil"]);
    t.eq(
      "every base's fabrication ticks on a day a third player asked for",
      [usa.building[0].daysLeft, china.building[0].daysLeft],
      [fresh - 1, fresh - 1]
    );
    t.ok("...and the wounded mend at a base that did nothing", china.roster[0].wounds < 3);

    // What a player is TOLD is still only their own — a base is invisible.
    for (let i = 0; i < fresh; i++) turnDay(s, ["usa", "china", "brazil"]);
    const quiet = turnDay(s, ["usa", "china", "brazil"]);
    t.eq("a turned day names only the LAST readier's jobs", quiet.finished, []);
    t.ok("...even though other bases finished theirs", usa.building.length === 0 && usa.armory.length > 1);
  }

  // ---- a mission result belongs to one base, its day to all of them -------
  {
    const world = createWorld();
    const s = createSession({ world, players: ["usa", "china"] });
    const usa = s.view("usa"), china = s.view("china");
    s.command("china", { type: "commission", blueprintId: "bp_railgun" });
    const before = china.building[0].daysLeft;

    const lead = fakeLead("lead_mp");
    world.leads.push(lead);
    const day = usa.day;
    s.command("usa", {
      type: "missionResult",
      result: { success: true, missionId: "lead_mp", casualties: [], survivors: [], loot: [{ name: "Alloy", value: 40 }], killsBySoldier: [] },
    });

    t.eq("the loot went to one base", [usa.stores.length, china.stores.length], [1, 0]);
    t.eq("the record went to one base", [usa.completedMissions.length, china.completedMissions.length], [1, 0]);
    t.ok("the spent lead left the shared board", !usa.leads.includes(lead) && usa.leads === china.leads);

    // S4 INVERTED THIS. Until S4 config.dayPerDeploy charged a day from inside
    // applyMissionResult and the session had to OBSERVE the world clock to
    // notice, then rest the other bases so china did not pay a doom tick for a
    // day her base never lived through. The charge is gone: a result is not a
    // day, and neither clock nor timer moves until somebody turns it.
    t.eq("a mission result does not move the shared clock", china.day, day);
    t.eq("...and nobody's build timer ticks on it", china.building[0].daysLeft, before);

    // The day the mission belongs to is the round's, spent at the gate — and
    // it lands on every base at once, including the one that stayed home.
    turnDay(s, ["usa", "china"]);
    t.eq("the round's day moves the shared clock once", china.day, day + 1);
    t.eq("...and every base lives through it", china.building[0].daysLeft, before - 1);
  }

  // ---- board pressure is a task-force total ------------------------------
  {
    const world = createWorld();
    const s = createSession({ world, players: ["usa", "china"] });
    const win = (id, leadId) => {
      world.leads.push(fakeLead(leadId));
      s.command(id, {
        type: "missionResult",
        result: { success: true, missionId: leadId, casualties: [], survivors: [], loot: [], killsBySoldier: [] },
      });
    };
    win("usa", "a1");
    win("china", "b1");
    t.eq("clears by different commanders both raise world pressure", world.cleared, 2);
    t.eq("...while each keeps its own record", s.view("usa").completedMissions.length, 1);
  }

  // ---- the recruit pool is dealt, not copied (S3) -------------------------
  {
    const poolIds = RECRUIT_POOL.map((r) => r.id);

    // A one-player deal is the whole pool in AUTHORED order. Shuffling at n=1
    // would give the plain single-player URL a randomised Barracks while
    // createState() kept the authored one — two construction paths, different
    // output, which is the thing this spec exists to refuse.
    const solo = dealRecruits(1);
    t.eq("a solo deal is one hand", solo.length, 1);
    t.eq("...holding the whole pool, in authored order", solo[0].map((r) => r.id), poolIds);
    t.eq(
      "...so a solo session's Barracks still matches createState()",
      createSession().view("p1").recruits.map((r) => r.id),
      poolIds,
    );

    // Three bases. The S2 block above hires and compares the two players who
    // did NOT hire, so a lopsided deal passes it; this is the assertion that
    // actually carries dealing.
    const s = createSession({ world: createWorld(), players: ["usa", "china", "brazil"] });
    const hands = ["usa", "china", "brazil"].map((id) => s.view(id).recruits.map((r) => r.id));
    const dealt = hands.flat();
    t.eq("every authored recruit is dealt to somebody", [...dealt].sort(), [...poolIds].sort());
    t.eq("...exactly once — no soldier id exists in two Barracks", new Set(dealt).size, dealt.length);
    t.eq("...and three bases split six evenly", hands.map((h) => h.length), [2, 2, 2]);

    // Round-robin, not chunk-and-drop: six recruits over four bases is 2/2/1/1
    // and never 2/2/2/0. Seed-independent — the sizes fall out of the walk.
    t.eq("an uneven deal leaves nobody empty-handed", dealRecruits(4).map((h) => h.length), [2, 2, 1, 1]);
    t.eq("more bases than recruits is legal, and the surplus deal empty", dealRecruits(8).map((h) => h.length), [1, 1, 1, 1, 1, 1, 0, 0]);

    // The hand differs per campaign rather than being fixed by seat order.
    // Fixed seeds, because over Math.random two deals collide 1 time in 20.
    t.ok(
      "two campaigns deal different hands",
      dealRecruits(2, makeRng(1))[0].map((r) => r.id).join() !== dealRecruits(2, makeRng(9))[0].map((r) => r.id).join(),
    );

    // Deep clones. `hire` writes status/weaponId/wounds into the recruit object
    // IN PLACE, so a dealt reference would corrupt the module-level pool for the
    // life of the process — under `node test/run.mjs`, for every suite after it.
    const hand = s.view("usa").recruits;
    t.ok("a dealt recruit is not the authored object", hand.every((r) => !RECRUIT_POOL.includes(r)));
    const cheapest = hand.reduce((a, b) => (a.cost <= b.cost ? a : b)); // any single hire clears startMoney
    t.ok("hire succeeds", s.command("usa", { type: "hire", recruitId: cheapest.id }).ok);
    t.eq(
      "...and leaves the authored pool untouched",
      RECRUIT_POOL.find((r) => r.id === cheapest.id).status,
      "recruit",
    );

    // The escape hatch is stated, not defended: a session handed a whole
    // campaign is NOT dealt, because that seat already holds the entire pool.
    const seated = createSession({ state: createState(), players: ["p1", "p2"] });
    t.eq("an opts.state session is not dealt", seated.view("p1").recruits.length, poolIds.length);
    t.eq("...and its later seats fall back to a full copy each", seated.view("p2").recruits.length, poolIds.length);
  }

  // ---- the ready gate: one round, one day (S4) ----------------------------
  {
    const ids = ["usa", "china", "brazil"];
    const s = createSession({ world: createWorld(), players: ids });
    const [usa, china, brazil] = ids.map((id) => s.view(id));

    // Readiness is the one thing a commander may know about another before a
    // mission resolves — who, by name, and whether they have readied. Nothing
    // about what they readied FOR.
    t.eq("the view names the whole task force", usa.taskForce.map((p) => p.id), ids);
    t.eq("...by name", usa.taskForce.map((p) => p.name), ids);
    t.ok("...and nobody starts ready", usa.taskForce.every((p) => !p.ready));
    t.ok("a task-force entry carries readiness and nothing else",
      Object.keys(usa.taskForce[0]).sort().join() === "id,name,ready");
    t.ok("...and no campaign hangs off it", usa.taskForce[0].campaign === undefined);

    // A ready that is not the last one turns nothing, and — the crash this
    // slice had to fix — carries no day summary for the hub to read.
    const first = s.command("usa", { type: "ready" });
    t.eq("readying reports who is outstanding", [first.ok, first.ready, first.dayTurned, first.waitingOn], [true, true, false, 2]);
    t.ok("...and carries no day arrays to trip over", first.finished === undefined);
    t.ok("the other commanders see it, live, through a cached view", china.taskForce[0].ready === true);
    t.eq("...and the day has not moved", usa.day, 1);

    // The toggle. Standing down is an ok result that turns nothing either.
    const down = s.command("usa", { type: "ready" });
    t.eq("readying again stands you down", [down.ready, down.dayTurned, down.waitingOn], [false, false, 3]);
    t.ok("...and the task force sees that too", !brazil.taskForce[0].ready);

    // The last one in turns the day, for everybody, exactly once.
    s.command("usa", { type: "ready" });
    s.command("china", { type: "ready" });
    const last = s.command("brazil", { type: "ready" });
    t.ok("the last commander to ready turns the day", last.dayTurned === true);
    t.eq("...once, for everyone", [usa.day, china.day, brazil.day], [2, 2, 2]);
    t.ok("...and hands back the day summary the hub prints", Array.isArray(last.finished) && Array.isArray(last.arrived));
    t.ok("every flag clears on the turn", usa.taskForce.every((p) => !p.ready));

    // The deadlock guard: a flag that survived its round would strand the task
    // force at the NEXT gate, where two clicks would be enough to turn a day.
    s.command("usa", { type: "ready" });
    s.command("china", { type: "ready" });
    t.eq("...so the next round needs every commander again", usa.day, 2);
    t.ok("and only then turns", s.command("brazil", { type: "ready" }).dayTurned === true);
  }

  // ---- a finished campaign cannot turn another day ------------------------
  // The rule that REPLACED "the mission that ends the campaign is never charged
  // a day" — that was a fact about a charge S4 deleted. This is the gate's own.
  {
    const world = createWorld();
    const s = createSession({ world, players: ["usa", "china"] });
    const usa = s.view("usa");
    world.outcome = "lost";
    s.command("usa", { type: "ready" });
    const res = s.command("china", { type: "ready" });
    t.eq("the gate refuses, in advanceDay's own words", res, { ok: false, reason: "The campaign is over." });
    t.eq("...and the day stays where it was", usa.day, 1);
    t.ok("...and the refusing commander is not left holding a ready", !usa.taskForce[1].ready);
  }

  // ---- one mission per day, and the knob that lifts it --------------------
  {
    const world = createWorld();
    const s = createSession({ world, players: ["usa", "china"] });
    const usa = s.view("usa");
    s.command("usa", { type: "hire", recruitId: usa.recruits[0].id });
    const soldier = usa.roster[0];
    for (const id of ["a", "b"]) world.leads.push(fakeLead(id));
    const go = (leadId) => s.command("usa", { type: "deploy", leadId, soldierIds: [soldier.id] });

    t.ok("the first deploy of the day is allowed", go("a").ok);
    const second = go("b");
    t.ok("the second is refused", !second.ok);
    t.ok("...in words that say where the day comes from", /already deployed today/.test(second.reason));
    t.eq("...and charges the soldier nothing", soldier.record.missions, 1);

    // The count is round state, cleared by the gate and by nothing else.
    s.command("usa", { type: "ready" });
    s.command("china", { type: "ready" });
    t.ok("a turned day lifts the cap again", go("b").ok);

    // dayPerDeploy off is what it always was: time is free unless you idle.
    config.dayPerDeploy = false;
    const w2 = createWorld();
    const s2 = createSession({ world: w2, players: ["usa"] });
    const v2 = s2.view("usa");
    s2.command("usa", { type: "hire", recruitId: v2.recruits[0].id });
    for (const id of ["x", "y"]) w2.leads.push(fakeLead(id));
    const sold2 = v2.roster[0];
    const dep = (leadId) => s2.command("usa", { type: "deploy", leadId, soldierIds: [sold2.id] });
    t.ok("dayPerDeploy off lifts the cap entirely", dep("x").ok && dep("y").ok);
    resetConfig();
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
