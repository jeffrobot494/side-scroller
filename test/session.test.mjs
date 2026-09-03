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
// Distinct per lead, because a real lead carries one (makeLead, src/game/state.js)
// and a dispatch has to carry the RIGHT one — the mission's random stream is
// made from it (tech/mission-determinism.md).
let fakeSeed = 0;
const fakeLead = (id) => ({
  id,
  name: id,
  brief: "",
  difficulty: "medium",
  threatReward: 0,
  winsCampaign: false,
  daysLeft: 9,
  seed: ++fakeSeed * 1000,
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
      "the session exposes exactly six methods and no campaign",
      Object.keys(s).sort(),
      // takeRound is S5's, and it is the PAGE's, not a player's: the round's
      // locked choices cannot travel through a view without putting every
      // commander's squad inside one commander's hub.
      ["command", "hasPlayer", "playerCount", "playerIds", "takeRound", "view"]
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
        "elsewhere", "leads", "log", "money", "outcome", "pending", "playerId",
        "recruits", "roster", "stores", "taskForce",
      ]
    );
    /* Three fields that are not a projection of this player's campaign:
       are not a projection of this player's campaign: who else is in the
       task force and whether they have readied (S4), this commander's own held
       deployments, and which lead every OTHER commander took last round (S5). */
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

    // The WORLD's field. Since S7 a campaign's `outcome` is computed and has no
    // setter, so this line throws if it is written straight through — which is
    // the good failure, and how this suite found the move.
    campaign.world.outcome = "lost";
    t.eq(
      "advanceDay's refusal reaches the hub verbatim",
      s.command("p1", { type: "ready" }),
      { ok: false, reason: "The campaign is over." }
    );
  }

  // ---- deploy: the assembly moved out of the hub, and now HOLDS -----------
  {
    // Three leads, not one lead three times: since S5 a second commit to the
    // same lead REPLACES the first, so the weapon fallback chain needs three
    // choices held at once — which is what dayPerDeploy off is for. The cap
    // has its own block below. Restored by the resetConfig() at the end.
    config.dayPerDeploy = false;
    const campaign = createState();
    const s = createSession({ state: campaign });
    const v = s.view("p1");
    s.command("p1", { type: "hire", recruitId: v.recruits[0].id });
    const soldier = v.roster[0];
    for (const id of ["lead_1", "lead_2", "lead_3"]) campaign.leads.push(fakeLead(id));
    const leadOf = (id) => campaign.leads.find((l) => l.id === id);
    campaign.armory.push({ id: "zapper", name: "Zapper" });

    const res = s.command("p1", { type: "deploy", leadId: "lead_1", soldierIds: [soldier.id], weapons: {} });
    t.ok("a deploy succeeds", res.ok);
    t.eq("...and answers with the lead it committed to", [res.committed, res.leadId], [true, "lead_1"]);
    // The whole of S5 in one assertion: Launch stopped starting a mission.
    t.ok("...and hands back no squad to launch", res.squad === undefined && res.level === undefined);
    t.eq("committing charges the mission to the soldier's record", soldier.record.missions, 1);
    t.eq("the commander's own view holds the choice", v.pending.map((c) => c.leadId), ["lead_1"]);
    // The map deployCommand used to consume and discard. The deploy screen
    // re-renders its selects off exactly this, so a commander who comes back
    // has to see what they picked.
    t.eq("...with the weapon map that built it", v.pending[0].weapons, {});

    s.command("p1", {
      type: "deploy", leadId: "lead_2", soldierIds: [soldier.id], weapons: { [soldier.id]: "zapper" },
    });
    s.command("p1", {
      type: "deploy", leadId: "lead_3", soldierIds: [soldier.id], weapons: { [soldier.id]: "nonexistent" },
    });
    t.eq("dayPerDeploy off holds several choices at once", v.pending.length, 3);
    t.eq("...and charges each of them", soldier.record.missions, 3);
    t.eq("a held choice remembers its pick", v.pending[1].weapons, { [soldier.id]: "zapper" });

    // Re-committing the SAME lead replaces rather than stacks, which is what
    // lets the deploy screen be reopened and edited. Done in one command on
    // purpose: a release-then-deploy from the hub would leave a window where a
    // rejected second half loses a commitment that was valid.
    const again = s.command("p1", { type: "deploy", leadId: "lead_1", soldierIds: [soldier.id], weapons: {} });
    t.ok("re-committing the same lead is accepted", again.ok);
    t.eq("...and replaces rather than stacks", v.pending.length, 3);
    t.eq("...refunding the charge it is replacing", soldier.record.missions, 3);

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
    t.eq("...nor dropped the choice it was replacing", v.pending.length, 3);

    // The squad becomes visible only when the round locks, and it goes to the
    // PAGE. Nothing about it ever reaches a view.
    t.eq("nothing is dispatched before the round closes", s.takeRound().length, 0);
    s.command("p1", { type: "ready" });
    const round = s.takeRound();
    t.eq("the round hands out one dispatch per held choice", round.length, 3);
    t.ok("every dispatch names the commander it belongs to", round.every((d) => d.playerId === "p1"));
    t.ok("...and carries a dispatch id to report against", new Set(round.map((d) => d.dispatchId)).size, 3);
    // Re-committing moved lead_1 to the back of the list, so the dispatches
    // are indexed by lead rather than by the order they were made.
    const disp = (id) => round.find((d) => d.mission.id === id);

    // W2 replaced four identity assertions here with these. It USED to hand out
    // the lead object itself, on the argument that a board filter could not then
    // strip it from under a running mission — which was true, and which also
    // put `seenBy` (who ELSE is looking at that lead) into one commander's
    // dispatch, and the generated level into the payload twice.
    const d1 = disp("lead_1");
    t.eq("a dispatch carries a projection of the lead, not the lead", Object.keys(d1.mission).sort(), ["id", "name", "seed"]);
    t.ok("...including its own SEED, which projectLead does not carry", d1.mission.seed === leadOf("lead_1").seed);
    t.ok("...and not what a mission never reads", d1.mission.seenBy === undefined && d1.mission.report === undefined);
    t.ok("...nor the level a second time, inside it", d1.mission.level === undefined);
    t.ok("the level itself is still there, whole", d1.level.platforms.length === leadOf("lead_1").level.platforms.length);

    // The squad is a projection too, and this is where it BITES: entities.js
    // reads data.wounds, so a soldier on two of one commander's choices used to
    // carry mission one's wounds into mission two mid-round. Now they carry
    // what they had when the round locked. Deliberate, and the one behaviour
    // change of the slice a player could see (tech/multiplayer-session.md,
    // Approximation 9).
    t.ok("the squad holds a projection of the soldier", disp("lead_1").squad[0].data !== campaign.roster[0]);
    t.eq(
      "...carrying exactly what the mission and the results screen read",
      Object.keys(disp("lead_1").squad[0].data).sort(),
      ["callsign", "id", "name", "stats", "wounds"]
    );
    t.ok("...and not the soldier's career record", disp("lead_1").squad[0].data.record === undefined);
    // The weapon is still passed by reference, and so is the level: projecting
    // is about WHAT crosses, and copying is the wire's job (src/net/wire.js).
    // weaponId defaults to "carbine" at hire, so the fallback chain is only
    // visible when a pick is actually made.
    t.ok("no pick falls back to the soldier's own weapon", disp("lead_1").squad[0].weapon === campaign.armory[0]);
    t.ok("an explicit pick resolves to the live armory entry", disp("lead_2").squad[0].weapon === campaign.armory[1]);
    t.ok("an unresolvable weapon falls back to the carbine", disp("lead_3").squad[0].weapon === WEAPONS.carbine);
    // Approximation 9, made reachable: dayPerDeploy is off in this block and
    // this soldier is on all three choices, which is the only way to see it.
    // Mission one's wounds used to land on the live object mission two then
    // read; the dispatch is now as of the lock.
    campaign.roster[0].wounds = 5;
    t.eq("a dispatch's wounds are as of the LOCK, not as of the mission", disp("lead_2").squad[0].data.wounds, 0);
    campaign.roster[0].wounds = 0;

    t.eq("a round is taken once, not replayed", s.takeRound().length, 0);
    t.eq("...and the choices left the player record when they locked", v.pending.length, 0);

    // Nothing may be committed or withdrawn while the round is running.
    t.ok("a deploy is refused mid-round", !s.command("p1", { type: "deploy", leadId: "lead_1", soldierIds: [soldier.id] }).ok);
    t.ok("...and so is readying", !s.command("p1", { type: "ready" }).ok);
    t.ok("...and so is releasing", !s.command("p1", { type: "release", leadId: "lead_1" }).ok);
    // The REASON, not just the refusal: this is a one-player session, so an
    // unknown-commander rejection would pass this for the wrong reason. The
    // round guard has to be what fires, and it fires before the target lookup.
    t.eq("...and so is sharing", s.command("p1", { type: "share", leadId: "lead_1", to: "p2" }).reason,
      "The round is under way.");
    resetConfig();
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
    // S6 MOVED THIS. Until S6 a view handed over world.leads itself, so board
    // identity was assertable through two views. It is now filtered and mapped
    // per commander, so `usa.leads === china.leads` can never be true again and
    // asserting it would only be re-testing that the mapper runs. What it was
    // really guarding — that the world's lead set does not detach into a board
    // per player — is asserted where the identity is still real: the campaigns.
    // Asserted through the WORLD, not between two views. A view hands out
    // filtered projections since S6, so `usa.leads === china.leads` can never
    // be true again and asserting it would only re-test that the mapper ran.
    // The claim worth keeping is the original one — that the world's lead set
    // does not detach into a board per player — and its observable form is
    // that every commander's board is the world's, id for id.
    const ids = (v) => v.leads.map((l) => l.id).sort();
    const worldIds = world.leads.map((l) => l.id).sort();
    t.eq("...the same board as the world", ids(usa), worldIds);
    t.eq("...and so does everyone else", [ids(china), ids(brazil)], [worldIds, worldIds]);
    t.ok("...and the same log", usa.log === brazil.log);

    t.ok("bases are separate objects", usa.roster !== china.roster && usa.armory !== china.armory);
    s.command("usa", { type: "hire", recruitId: usa.recruits[0].id });
    t.eq("a hire lands on one roster only", [usa.roster.length, china.roster.length], [1, 0]);
    t.ok("...and spends one player's credits", usa.money < china.money);
    t.eq("...and leaves the others' recruit lists whole", china.recruits.length, brazil.recruits.length);

    // The failure a plain reference would produce: advanceDay REPLACES
    // state.leads rather than splicing it, so a world field that was merely
    // aliased detaches here and hands each player a private board.
    const board = world.leads;
    // Rot is the only thing that REASSIGNS the array (arrivals push into it), so
    // the leads have to be made to expire on this tick. Their lifespans were
    // rolled at generation, which is why this sets daysLeft rather than config.
    //
    // Written through the WORLD since S6, not through usa.leads. A view now
    // hands out fresh projections, so this loop used to land on throwaway
    // objects: nothing expired, and the two assertions below stopped testing
    // reassignment without going red. That is the failure mode worth a comment.
    for (const l of board) l.daysLeft = 1;
    t.ok("two of three readying does not move the day", s.command("usa", { type: "ready" }).dayTurned === false);
    t.eq("...and the day is still where it was", usa.day, 1);
    turnDay(s, ["china", "brazil"]);
    // The failure a plain reference produces is a commander still reading the
    // OLD array after advanceDay swapped it — visible here as a board that did
    // not empty. Identity is gone from the view; the consequence is not.
    t.ok("...and it really was reassigned", world.leads !== board);
    // NOT "both see the world's board" — the day that reassigned it also brought
    // an arrival, and an arrival IS rolled for visibility even in a handed-over
    // world (registration grants the board so far, not the board forever). The
    // detach test that survives that is: nobody is still reading the old array.
    t.ok("the board survives being reassigned",
      [usa, china, brazil].every((v) => !v.leads.some((l) => board.some((b) => b.id === l.id))));
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
    // Compared by ID, not by identity: `usa.leads` holds projections since S6,
    // so `.includes(lead)` would be false whether or not the lead left — an
    // assertion that passes for the wrong reason is worse than one that fails.
    // Compared by ID, not by identity: `usa.leads` holds projections since S6,
    // so `.includes(lead)` would be false whether or not the lead ever left —
    // an assertion that passes for the wrong reason is worse than one that fails.
    t.ok("the spent lead left the shared board",
      !world.leads.includes(lead) && !china.leads.some((l) => l.id === lead.id));

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

  // ---- the deploy commit: standing down, privacy, elsewhere (S5) ----------
  {
    const world = createWorld();
    const ids = ["usa", "china", "brazil"];
    const s = createSession({ world, players: ids });
    const [usa, china, brazil] = ids.map((id) => s.view(id));
    for (const id of ids) {
      const v = s.view(id);
      s.command(id, { type: "hire", recruitId: v.recruits[0].id });
    }
    for (const id of ["alpha", "bravo"]) world.leads.push(fakeLead(id));
    const squadOf = (v) => [v.roster[0].id];

    s.command("usa", { type: "deploy", leadId: "alpha", soldierIds: squadOf(usa) });
    t.eq("a commander sees their own held deployment", usa.pending.map((c) => c.leadName), ["alpha"]);
    // Exactly what the deploy screen needs to redraw itself, and nothing else.
    // Pinned because a held choice is the natural place to park a flag nobody
    // reads — the §3 disclosure checkbox was one, and Bo cut it.
    t.eq("...carrying exactly what redraws that screen", Object.keys(usa.pending[0]).sort(),
      ["leadId", "leadName", "soldierIds", "weapons"]);
    // The rule the whole seam exists for: nothing about another commander's
    // choice is on your view, and readiness stays the only thing that is.
    t.eq("...and nobody else's is on their view", china.pending, []);
    t.ok("readiness is still all the strip shows", china.taskForce.every((p) => p.leads === undefined));

    // Standing down releases what was pending AND refunds it. Missing the
    // refund is a live lockout at the default: the cap counts the held
    // choices, so a commander who stood down to change their mind could never
    // commit again this round — which is exactly what standing down is for.
    const soldier = usa.roster[0];
    t.eq("committing charged the soldier a mission", soldier.record.missions, 1);
    s.command("usa", { type: "ready" });
    const stood = s.command("usa", { type: "ready" });
    t.ok("standing down is reported as such", stood.ok && stood.ready === false);
    t.eq("...and releases the deployment", usa.pending.length, 0);
    t.eq("...and refunds the mission it charged", soldier.record.missions, 0);
    t.ok("...so the same commander can commit again", s.command("usa", { type: "deploy", leadId: "bravo", soldierIds: squadOf(usa) }).ok);

    // The round: two commanders deploy, one holds at base.
    s.command("china", { type: "deploy", leadId: "alpha", soldierIds: squadOf(china) });
    s.command("usa", { type: "ready" });
    s.command("china", { type: "ready" });
    const closed = s.command("brazil", { type: "ready" });
    t.eq("the round locks with one dispatch per deploying commander", [closed.roundClosed, closed.missions], [true, 2]);

    // Mockup §4. One line per OTHER commander — which lead they took, or that
    // they held at base. Never whether they won, who died, or what they
    // carried out.
    t.eq("what a commander learns is one line per other commander", usa.elsewhere.map((e) => e.name), ["china", "brazil"]);
    t.eq("...naming the lead they took", usa.elsewhere[0].leads, ["alpha"]);
    t.eq("...and saying so when they held at base", usa.elsewhere[1].leads, []);
    t.ok("...and never yourself", usa.elsewhere.every((e) => e.id !== "usa"));
    t.ok("...nor anything else about them", brazil.elsewhere.every((e) => Object.keys(e).sort().join() === "id,leads,name"));

    // The count is keyed to the DISPATCH, so a second report for the same one
    // cannot drive it past zero and buy a second day.
    const round = s.takeRound();
    const report = (d, ok = true) =>
      s.command(d.playerId, {
        type: "missionResult",
        dispatchId: d.dispatchId,
        result: { success: ok, missionId: d.mission.id, casualties: [], survivors: [], loot: [], killsBySoldier: [] },
      });
    const first = report(round[0]);
    t.ok("the first report of a round turns no day", !first.dayTurned && usa.day === 1);
    t.ok("...and reporting it twice still turns none", !report(round[0]).dayTurned && usa.day === 1);
    const last = report(round[1]);
    t.ok("the last report turns the day", last.dayTurned === true);
    t.eq("...once, for everyone", [usa.day, china.day, brazil.day], [2, 2, 2]);
    t.ok("...and a stray report after the round turns nothing", !report(round[1]).dayTurned && usa.day === 2);

    // Everything the round held clears together, or the next gate deadlocks.
    t.ok("every ready flag clears with the round", usa.taskForce.every((p) => !p.ready));
    t.eq("...and every held choice with it", [usa.pending.length, china.pending.length], [0, 0]);
    t.eq("...and the round is not handed out again", s.takeRound().length, 0);
    t.ok("...so the task force can commit and ready again", s.command("usa", { type: "ready" }).ok);
  }

  // ---- a campaign that ends mid-round still closes the round (S5) ---------
  // The design forbids withdrawal, so the remaining locked missions run into a
  // campaign that is already over. What must hold is that the round does not
  // strand: an earlier draft returned advanceDay's refusal BEFORE clearing
  // anything, leaving every flag set and every choice unreleased.
  {
    const world = createWorld();
    const s = createSession({ world, players: ["usa", "china"] });
    const usa = s.view("usa"), china = s.view("china");
    for (const id of ["usa", "china"]) {
      const v = s.view(id);
      s.command(id, { type: "hire", recruitId: v.recruits[0].id });
      world.leads.push(fakeLead(id === "usa" ? "one" : "two"));
      s.command(id, { type: "deploy", leadId: id === "usa" ? "one" : "two", soldierIds: [v.roster[0].id] });
    }
    s.command("usa", { type: "ready" });
    s.command("china", { type: "ready" });
    const round = s.takeRound();
    t.eq("both commanders' missions are in flight", round.length, 2);

    // The first result ends the campaign. The second still lands.
    world.outcome = "lost";
    const res = s.command(round[1].playerId, {
      type: "missionResult",
      dispatchId: round[1].dispatchId,
      result: { success: false, missionId: round[1].mission.id, casualties: [], survivors: [], loot: [], killsBySoldier: [] },
    });
    const done = s.command(round[0].playerId, {
      type: "missionResult",
      dispatchId: round[0].dispatchId,
      result: { success: false, missionId: round[0].mission.id, casualties: [], survivors: [], loot: [], killsBySoldier: [] },
    });
    t.ok("neither report throws", res.ok && done.ok);
    t.ok("the day is held, in advanceDay's own words", done.dayTurned === false && done.dayHeld === "The campaign is over.");
    t.eq("...and the clock did not move", usa.day, 1);
    // The coherent end state: half-cleared is not a shape anything else here
    // is written against.
    t.ok("the round still closed", usa.taskForce.every((p) => !p.ready) && china.pending.length === 0);
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

    // The cap counts the HELD CHOICES — there is no second copy of the number
    // to drift out of step with them. Releasing one therefore lifts the cap,
    // which is what makes changing your mind possible at all.
    t.ok("releasing the held choice is accepted", s.command("usa", { type: "release", leadId: "a" }).ok);
    t.eq("...and refunds the mission it charged", soldier.record.missions, 0);
    t.ok("...so the cap is lifted again", go("b").ok);
    t.ok("releasing nothing is a refusal, not a silent no-op", !s.command("usa", { type: "release", leadId: "a" }).ok);

    // ...and so does a whole round, which is the ordinary way it clears.
    s.command("usa", { type: "ready" });
    const closed = s.command("china", { type: "ready" });
    t.eq("the last commander to ready locks the round", [closed.roundClosed, closed.missions], [true, 1]);
    t.ok("...and turns no day yet", !closed.dayTurned && usa.day === 1);
    const [dispatch] = s.takeRound();
    const turn = s.command("usa", {
      type: "missionResult",
      dispatchId: dispatch.dispatchId,
      // The dispatch that is actually outstanding is lead "b" — the choice on
      // "a" was released above — and resolving it spends that lead.
      result: { success: false, missionId: "b", casualties: [], survivors: [soldier.id], loot: [], killsBySoldier: [] },
    });
    t.ok("the round's last mission report turns the day", turn.dayTurned === true);
    t.eq("...once", usa.day, 2);
    t.ok("...and carries the summary the results screen prints", Array.isArray(turn.finished));
    t.ok("a turned day lifts the cap again", go("a").ok);

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
  // ---- lead visibility and disclosure (S6) --------------------------------
  // The ONLY construction that rolls visibility is createSession({ players }):
  // it builds its world from the seat list, so seedBoard stamps against a known
  // roster. Every block above hands over a pre-built world, where registration
  // grants the board-so-far and everybody sees everything — which is why this
  // assertion cannot live in one of them.
  {
    // Boards big enough that "this commander rolled nothing" is negligible
    // rather than merely unlikely — the roll makes every block below
    // probabilistic, and a suite that fails one run in twenty-five is worse
    // than one that fails every time.
    config.leadVisibility = 0.5;
    config.leadCount = 6;
    config.seedLeads = 6;
    const s = createSession({ players: ["usa", "china"] });
    const usa = s.view("usa"), china = s.view("china");

    // The world board scales with the commander count (the S6 stopgap), so the
    // two boards are drawn from more leads than a solo campaign would hold.
    t.ok("both boards are non-empty", usa.leads.length > 0 && china.leads.length > 0);
    const everyone = new Set([...usa.leads, ...china.leads].map((l) => l.id));
    t.ok("the world board scales past one commander's ceiling", everyone.size > config.leadCount);
    t.ok("...and nobody sees more than the ceiling's worth of it",
      usa.leads.length <= config.leadCount * 2 && usa.leads.length > 0);
    // The floor, asserted against the WORLD rather than against the union of
    // the boards — which would be comparing a set to itself. A lead nobody can
    // see is invisible AND still holds a slot under the ceiling.
    const w = createWorld(["a", "b"]);
    const s2 = createSession({ world: w, players: ["a", "b"] });
    const union = new Set([...s2.view("a").leads, ...s2.view("b").leads].map((l) => l.id));
    t.eq("every lead is visible to somebody — the floor", union.size, w.leads.length);

    t.eq("a projected lead carries exactly what Operations draws",
      Object.keys(usa.leads[0]).sort(),
      ["brief", "daysLeft", "difficulty", "id", "name", "sharedBy", "sharedWith", "winsCampaign"]);
    t.ok("...and not the generated level, which is the session's alone",
      usa.leads.every((l) => l.level === undefined && l.report === undefined));
    t.ok("...nor who ELSE can see it", usa.leads.every((l) => l.seenBy === undefined));
    t.ok("a lead you rolled yourself is tagged with nobody", usa.leads.every((l) => l.sharedBy === null));
    t.ok("...and names nobody you gave it to", usa.leads.every((l) => l.sharedWith.length === 0));
    resetConfig();
  }

  // Sharing: the whole point of a partial board, and the one channel the design
  // opens between two commanders before a mission resolves.
  {
    config.leadVisibility = 0; // every lead to exactly one commander
    config.leadCount = 6;
    config.seedLeads = 6;
    // REDRAWN UNTIL THE DEAL IS USABLE, and that is not the same as asserting
    // it. At zero visibility rollVisibility gives each lead to ONE commander by
    // a coin flip (src/game/state.js), so six leads landing on one board is a
    // legal roll that happens 1 time in 32 — and every assertion below needs a
    // lead on each side, so the whole suite threw when it came up. What this
    // block is about is SHARING; the deal is a precondition it needs, not a
    // property it pins, and pretending otherwise is what made it flake.
    let s, usa, china;
    for (let i = 0; i < 40; i++) {
      s = createSession({ players: [{ id: "usa", name: "USA" }, { id: "china", name: "China" }] });
      usa = s.view("usa");
      china = s.view("china");
      if (usa.leads.length && china.leads.length) break;
    }

    t.ok("at zero visibility no lead is on two boards",
      !usa.leads.some((a) => china.leads.some((b) => b.id === a.id)));

    t.ok("both commanders drew something", usa.leads.length > 0 && china.leads.length > 0);
    const mine = usa.leads[0];
    const theirs = china.leads[0];

    // The refusal for a lead you cannot see is the refusal for one that is
    // gone, word for word — a distinct message confirms it exists.
    const gone = s.command("usa", { type: "deploy", leadId: "no_such_lead", soldierIds: ["x"] });
    const hidden = s.command("usa", { type: "deploy", leadId: theirs.id, soldierIds: ["x"] });
    t.ok("deploying to a lead you cannot see is refused", !hidden.ok);
    t.eq("...in the same words as a lead that does not exist", hidden.reason, gone.reason);
    t.eq("...and sharing it back is refused the same way",
      s.command("usa", { type: "share", leadId: theirs.id, to: "china" }).reason, gone.reason);

    t.ok("sharing yourself a lead is refused", !s.command("usa", { type: "share", leadId: mine.id, to: "usa" }).ok);
    t.ok("sharing to nobody is refused", !s.command("usa", { type: "share", leadId: mine.id, to: "ghost" }).ok);

    const res = s.command("usa", { type: "share", leadId: mine.id, to: "china" });
    t.ok("sharing a lead you hold succeeds", res.ok && res.shared);
    t.eq("...and names the lead for the flash", res.leadName, mine.name);

    const got = china.leads.find((l) => l.id === mine.id);
    t.ok("the lead is now on their board", !!got);
    t.eq("...tagged with who gave it to them", got.sharedBy, "USA");
    t.ok("...and it is an ordinary lead otherwise",
      got.daysLeft === mine.daysLeft && got.difficulty === mine.difficulty);
    t.ok("the giver still has it", usa.leads.some((l) => l.id === mine.id));
    // The giver's own board says where their lead went. It is the only thing
    // this projection ever says about another commander's board, and it is
    // theirs already: they are the one who put it there. A disclosure a player
    // cannot see the consequence of is the failure mode.
    t.eq("...and their board names who they gave it to",
      usa.leads.find((l) => l.id === mine.id).sharedWith, ["China"]);
    t.ok("...but still nobody as having given it to THEM",
      usa.leads.find((l) => l.id === mine.id).sharedBy === null);
    t.ok("the receiver is not told they are holding a shared copy",
      china.leads.find((l) => l.id === mine.id).sharedWith.length === 0);
    t.ok("sharing it twice is refused", !s.command("usa", { type: "share", leadId: mine.id, to: "china" }).ok);

    // Passed on again: the tag records whoever handed it to YOU, not the origin.
    const s3 = createSession({ players: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }] });
    t.ok("the first commander drew something to pass on", s3.view("a").leads.length > 0);
    const lead = s3.view("a").leads[0];
    s3.command("a", { type: "share", leadId: lead.id, to: "b" });
    s3.command("b", { type: "share", leadId: lead.id, to: "c" });
    t.eq("a lead passed on is tagged with the last giver, not the first",
      s3.view("c").leads.find((l) => l.id === lead.id).sharedBy, "B");
    // ...and there is no chain in the other direction either: A sees the one
    // disclosure A made, not what B did with it afterwards.
    t.eq("the first giver is told about their own disclosure only",
      s3.view("a").leads.find((l) => l.id === lead.id).sharedWith, ["B"]);
    t.eq("...and the second about theirs",
      s3.view("b").leads.find((l) => l.id === lead.id).sharedWith, ["C"]);

    resetConfig();
  }

  // A lead carrying no visibility at all is visible to EVERYONE, not to nobody.
  // Load-bearing far beyond single-player: five blocks in this suite push a
  // hand-built fakeLead onto a board and then deploy to it.
  {
    const world = createWorld();
    const s = createSession({ world, players: ["usa", "china"] });
    const bare = fakeLead("bare_lead");
    world.leads.push(bare); // pushed AFTER registration, so nothing granted it
    t.ok("a lead with no visibility recorded is on every board",
      s.view("usa").leads.some((l) => l.id === "bare_lead") &&
      s.view("china").leads.some((l) => l.id === "bare_lead"));
    t.ok("...and is deployable", s.command("usa", { type: "deploy", leadId: "bare_lead", soldierIds: [] }).reason
      === "A squad needs at least one soldier.");
  }

  // Single-player is unchanged, and it is the ABSENT rule that does it, not the
  // floor: a createState() world has NO registered commanders, so there is
  // nobody for a floor to hand a lead to.
  {
    const solo = createState();
    t.ok("a solo campaign stamps no visibility at all", solo.leads.every((l) => l.seenBy === undefined));
    t.eq("...and its board is the unscaled ceiling", solo.leads.length, config.seedLeads);
    const s = createSession();
    t.eq("...and one commander sees all of it", s.view("p1").leads.length, solo.leads.length);
  }

  // The day summary names only leads the commander who turned it could see.
  // advanceDay reports the whole world's expiries and arrivals; endRound filters.
  {
    config.leadVisibility = 0; // every lead to exactly one commander
    config.leadCount = 6;
    config.seedLeads = 6;
    config.leadArrivalRate = 0; // arrivals would add names nobody can predict
    // Built through createWorld so the test can reach the board. The ids are
    // registered by createWorld itself, so createSession's own registration is
    // a no-op here and visibility is really rolled — unlike every other
    // handed-a-world block in this suite.
    const world = createWorld(["usa", "china"]);
    const s = createSession({ world, players: ["usa", "china"] });
    const usa = s.view("usa"), china = s.view("china");
    const theirs = china.leads.map((l) => l.name);
    // Disjointness by ID, not by name: generated lead names come from a small
    // pool and two different leads routinely share one, which made the
    // name-based version of this fail about one run in four.
    const mineIds = usa.leads.map((l) => l.id);
    t.ok("the two boards really are disjoint", mineIds.length > 0 && theirs.length > 0
      && !mineIds.some((id) => china.leads.some((l) => l.id === id)));

    // EVERY lead expires on this turn, so `expired` is non-empty and the
    // assertion below cannot pass by having nothing to check.
    for (const l of world.leads) l.daysLeft = 1;
    s.command("usa", { type: "ready" });
    const turn = s.command("china", { type: "ready" });

    t.ok("the day turned", turn.dayTurned === true);
    t.ok("the summary carries no raw lead objects", turn.expiredLeads === undefined);
    t.ok("...and it really did report expiries", turn.expired.length > 0);
    // China readied last, so the summary is HERS. advanceDay reported every
    // lead on the world board; nothing usa-only may survive the filter.
    t.eq("...naming only the leads the reader could see", turn.expired.slice().sort(), theirs.slice().sort());
    resetConfig();
  }

  // ---- the finale, and the fork (S7) --------------------------------------
  // "Victory is individual and defeat is collective." Both halves, plus the
  // thing that makes the first half a RACE rather than two private wars: the
  // world holds one hive, and a second earner is granted it rather than given
  // one of their own.
  //
  // dayPerDeploy off throughout — the gate wants two cleared High leads per
  // commander and the cap is one deploy a day. Restored at the end.
  {
    config.dayPerDeploy = false;
    const world = createWorld();
    const s = createSession({ world, players: ["usa", "china"] });
    const usa = s.view("usa"), china = s.view("china");
    for (const id of ["usa", "china"]) s.command(id, { type: "hire", recruitId: s.view(id).recruits[0].id });

    // One whole round. `plan` is [playerId, leadId] pairs; a lead named on the
    // plan is hand-pushed with no `seenBy`, which reads as visible to all — so
    // a deploy in this block is never refused for a lead the commander cannot
    // see. Both seats ready because the gate wants the whole task force.
    const fight = (plan, success = true) => {
      for (const [id, leadId, extra] of plan) {
        if (!world.leads.some((l) => l.id === leadId))
          world.leads.push({ ...fakeLead(leadId), difficulty: "high", ...extra });
        s.command(id, { type: "deploy", leadId, soldierIds: [s.view(id).roster[0].id] });
      }
      s.command("usa", { type: "ready" });
      s.command("china", { type: "ready" });
      for (const d of s.takeRound()) {
        s.command(d.playerId, {
          type: "missionResult",
          dispatchId: d.dispatchId,
          result: { success, missionId: d.mission.id, casualties: [], survivors: [], loot: [], killsBySoldier: [] },
        });
      }
    };

    // usa earns the gate first. config.bossHighWins is 2, and the counter has
    // been per-commander since S2 — china clears High leads alongside and is
    // deliberately left one short.
    fight([["usa", "u1"], ["china", "c1"]]);
    fight([["usa", "u2"]]);

    const hives = () => world.leads.filter((l) => l.winsCampaign);
    t.eq("the gate places one hive", hives().length, 1);
    t.ok("...visible to the commander who earned it", usa.leads.some((l) => l.winsCampaign));
    t.ok("...and to nobody else", !china.leads.some((l) => l.winsCampaign));
    // The failure this slice can produce that makes a campaign unwinnable, and
    // it is silent: the board simply never shows a hive.
    t.ok("a placed hive is visible to SOMEBODY", hives()[0].seenBy.size > 0);

    // china earns it too. One hive per world: the second earner is granted the
    // lead that is already there, not handed a second one.
    fight([["china", "c2"]]);
    t.eq("a second earner does not place a second hive", hives().length, 1);
    t.ok("...they are granted the one that exists", china.leads.some((l) => l.winsCampaign));
    t.ok("...and it stays on the first earner's board", usa.leads.some((l) => l.winsCampaign));

    // The race. usa clears it; china never gets there.
    const hive = hives()[0];
    fight([["usa", hive.id]]);
    t.eq("the commander who cleared the hive won", usa.outcome, "won");
    t.eq("...the other one neither won nor lost", china.outcome, "ended");
    t.ok("...and no collective defeat was recorded", world.outcome === null);
    // Mockup §6's third panel names nobody, and the view is what would leak it.
    t.ok("who ended it never reaches a view", !("wonBy" in usa) && !("wonBy" in china));
    t.ok("...nor the shared log", world.log.every((e) => !/usa|china/i.test(e.text)));
    // The third value is an END, not "keep playing with no finale left" — so
    // the clock refuses for the commander who did not win it, in the same words
    // it refuses a defeat with. The whole task force readies, because it is the
    // LAST ready that reaches advanceDay: an earlier one is not guarded by the
    // outcome at all, which is a standing approximation and not S7's to close.
    s.command("usa", { type: "ready" });
    t.eq(
      "a commander the war ended without cannot turn another day",
      s.command("china", { type: "ready" }),
      { ok: false, reason: "The campaign is over." }
    );
    resetConfig();
  }

  // ---- a win outranks a defeat, whatever order they arrive in (S7) --------
  // A round can record both — one commander clears the hive while another's
  // squad is wiped and the doom clock hits zero — and the sector is SECURED
  // either way. Two separate world fields and an accessor that asks for a
  // winner first, so neither write needs a guard and neither ordering loses.
  {
    for (const defeatFirst of [true, false]) {
      const world = createWorld();
      const s = createSession({ world, players: ["usa", "china"] });
      if (defeatFirst) world.outcome = "lost";
      world.wonBy = "usa";
      if (!defeatFirst) world.outcome = "lost";
      const order = defeatFirst ? "defeat first" : "win first";
      t.eq(`the winner is told they won (${order})`, s.view("usa").outcome, "won");
      t.eq(`...and nobody is told they lost (${order})`, s.view("china").outcome, "ended");
    }
  }

  // ---- a campaign with no owner owns any win that was recorded (S7) -------
  // The single-player rule, and the same shape as S6's "absent means visible to
  // all". createState() records its win as `true` and reads it back as a win —
  // test/wiring.test.mjs C4 is what pins that. Pinned HERE is the other half:
  // seat one of the `state` hatch holds a campaign somebody else built, so it
  // has no owner, and an owner-less campaign never renders the third outcome.
  {
    const campaign = createState();
    const s = createSession({ state: campaign, players: ["p1", "p2", "p3"] });
    campaign.world.wonBy = "p2";
    t.eq("the recorded winner won", s.view("p2").outcome, "won");
    t.eq("a commander who did not win it ends without one", s.view("p3").outcome, "ended");
    t.eq("...but an owner-less campaign owns the win", s.view("p1").outcome, "won");
  }

  // ---- registration does not hand a late seat a finale (S7) ---------------
  // registerCommanders gives a new seat the whole board so its Operations is
  // not permanently empty. The hive is the exception: the design says it
  // spreads only by earning it or being given it, and registration is neither.
  // Only the test hatches reach this path, which is what makes it easy to miss.
  {
    const world = createWorld();
    const first = createSession({ world, players: ["usa"] });
    const ordinary = { ...fakeLead("ordinary"), seenBy: new Map([["usa", null]]) };
    const hive = { ...fakeLead("hive"), winsCampaign: true, seenBy: new Map([["usa", null]]) };
    world.leads.push(ordinary, hive);
    void first;

    const s = createSession({ world, players: ["usa", "china"] });
    const china = s.view("china");
    t.ok("a late seat is given the board so far", china.leads.some((l) => l.id === "ordinary"));
    t.ok("...but not somebody else's finale", !china.leads.some((l) => l.winsCampaign));
    t.ok("...which its earner still holds", s.view("usa").leads.some((l) => l.winsCampaign));
  }

  // the session would pass every other suite silently.
  // `src/net/rooms.js` is here too since V1 (tech/multiplayer-service.md): the
  // room registry runs in the node process and would be just as silently broken
  // by a DOM global. And note WHY this is a source scan rather than an import
  // check — test/run.mjs installs a DOM before any suite runs, so a room that
  // named `document` would keep test/service.test.mjs green forever.
  //
  // The rule splits at V1 and the split is stated rather than assumed:
  // loopback.js, wire.js, client.js and rooms.js run in both places and name no
  // browser global. `src/net/remote.js` (V2) runs only in a browser and may name
  // `fetch` and `EventSource`, so it is deliberately NOT on this list.
  {
    for (const rel of ["src/game/session.js", "src/net/rooms.js"]) {
      const src = readFileSync(join(ROOT, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const dom = /\b(document|window|navigator|requestAnimationFrame|cancelAnimationFrame|HTMLElement|Image|alert)\b/.exec(src);
      t.ok(`${rel} names no DOM global${dom ? ` — found "${dom[1]}"` : ""}`, !dom);
      t.ok(`${rel} does not reach localStorage directly`, !/\blocalStorage\b/.test(src));
    }
  }

  // ---- the session announces that it changed (W3) --------------------------
  // It carries nothing and it is unconditional. Both halves matter: a session
  // that said WHAT moved would be keeping a second model of its own campaign,
  // and one that announced only on success would miss the state a refusal has
  // already changed.
  {
    let beats = 0;
    const s = createSession({ players: ["p1", "p2"], changed: () => beats += 1 });
    t.eq("nothing is announced before a command", beats, 0);
    s.command("p1", { type: "sellLoot" });
    t.eq("a command announces exactly once", beats, 1);
    // NOT "ghost" — RECRUIT_POOL has a soldier with that id, and this passed
    // four runs in six before it did not.
    t.ok("a refused command announces too",
      !s.command("p1", { type: "hire", recruitId: "nobody-was-ever-hired" }).ok && beats === 2);
    t.ok("...and so does one from nobody", !s.command("who", { type: "ready" }).ok && beats === 3);
    s.view("p1");
    t.eq("reading a view announces nothing", beats, 3);

    // The server half is UNCHANGED: still a live projection over the campaign's
    // own arrays. The snapshot is the transport's copy of it (W3), never this.
    const v = s.view("p1");
    t.ok("the session's own view is still the live one", s.view("p1") === v);
  }

  // ---- the seat swap moves every binding ----------------------------------
  // A SOURCE check, and only because there is no other kind available: no suite
  // imports src/main.js, so the alternative is no guard at all. It caught
  // nothing — the bug it exists for was found by playing — but the failure mode
  // is worth pinning, because it is silent. `swapTo` re-points FOUR things and
  // the fourth was missing for the whole of S5: the hot-seat dropdown kept its
  // own idea of the current seat, so a swap driven by the round dispatcher
  // (which follows the mission's owner, not the dropdown) left the control
  // naming a base that was not on screen.
  //
  // This asserts the shape, not the behaviour. It cannot tell you the swap
  // WORKS; it can tell you somebody deleted a binding.
  {
    const main = readFileSync(join(ROOT, "src/main.js"), "utf8");
    const body = (main.match(/function swapTo\(id\) \{[\s\S]*?\n\}/) || [""])[0];

    // THE CAPTURE ITSELF, FIRST. It is non-greedy and ends at a brace in column
    // 0, so it is correct only while `swapTo` is a top-level function — tuck it
    // inside V2's async boot and the match silently widens to the rest of the
    // file, at which point every assertion below passes by finding the literal
    // somewhere else entirely. That is a guard that reports green while guarding
    // nothing, which is worse than no guard, so the bound is checked before
    // anything is checked inside it.
    t.ok("the swapTo capture is bounded to swapTo", !!body && !/function playNext/.test(body));

    t.ok("swapTo re-points the hub", /hub\.setView\(/.test(body));
    // FIVE since W1 (tech/multiplayer-session.md): the seat's transport client is
    // a binding too, and a swap that moves the views but not the client sends the
    // next click down the previous commander's wire. `you` survives beside it —
    // the round dispatcher compares it against a dispatch's owner to decide
    // whether to swap seats at all.
    t.ok("...the seat's transport client", /\bclient\s*=\s*clients\.get\(/.test(body));
    t.ok("...the ambient layer", /ambient\.setView\(/.test(body));
    t.ok("...the command closure's player id", /\byou\s*=\s*id\b/.test(body));
    t.ok("...and the hot-seat control, which holds its own", /hotSeat\.setPlayer\(/.test(body));

    // W2, and the same kind of guard for the same reason. Handing a built
    // session to createLoopback would work perfectly and quietly undo the
    // slice: the announcement channel has to be in place before the session
    // exists, and a session built outside the transport can only announce
    // straight to the page, without crossing the wire.
    // Both construction-time channels, matched literally: the round announcement
    // (W2) and the state-changed broadcast (W3). A factory that drops the second
    // argument still runs — every screen simply stops updating for anything the
    // seat did not do itself, which is not a failure any suite here would see.
    t.ok("the page builds its session through the transport",
      /createLoopback\(\s*\(announce,\s*changed\)\s*=>/.test(main) && /createSession\(\{[^}]*announce,\s*changed/.test(main));
    // And the round is collected on the ANSWER. The push lands first — inside
    // session.command — so a mission started on arrival takes the screen from a
    // render in progress.
    t.ok("...and drains the round on the answer, not on the push", /res\.roundClosed\)\s*runRound\(\)/.test(main));

    // V2 (tech/multiplayer-service.md): the page holds one of two transports and
    // THE URL DECIDES. The loopback branch is pinned above and must stay exactly
    // what it was — the single-player URL is the one thing this whole spec
    // promises not to touch.
    t.ok("the page picks its transport off the URL",
      /get\("seat"\)/.test(main) && /createRemote\(/.test(main));

    // The round dispatcher forks, and it forks on WHICH NAME THE TRANSPORT HAS
    // rather than on a flag the page carries. Both halves are asserted because
    // either one alone is a page that hangs: without the install a room never
    // starts its mission, and without the bail a hot-seat drain runs against a
    // transport that has no round to give.
    t.ok("a pushed dispatch is played", /transport\.onDispatch\(playPushed\)/.test(main));
    // AFTER the first paint, and this one is a real bug the ordering caused
    // rather than a shape being tidied. Installing the dispatcher flushes any
    // dispatch the server was already holding for this seat — what a page that
    // reloaded mid-round is owed — and playing one calls showScene("mission").
    // Installed before the mount's own showScene("hub") + render(), the hub is
    // painted back over a canvas that has just taken the screen, and the
    // commander sees their base with a mission running underneath it.
    t.ok("...and the dispatcher is installed after the first paint, not before",
      main.indexOf("transport.onDispatch(playPushed)") > main.indexOf("hub.render()"));
    t.ok("...and a room page does not drain a round it is not host to",
      /if \(!transport\.takeRound\) return;/.test(main));

    // V3: a FOURTH URL, and it is the one that is not a game. `?room=N` opens a
    // room and prints its links; it builds no transport, no client and no hub,
    // because nothing on that page belongs to a commander yet. Pinned by index
    // because the failure is silent in the other direction: a lobby that fell
    // through to the transport branch would open a room AND join a seat of it,
    // which looks like it worked right up until the second player arrives at a
    // room nobody else is in.
    t.ok("the page opens a lobby off the URL",
      /get\("room"\)/.test(main) && /createLobby\(hubRoot/.test(main));
    t.ok("...and the lobby joins nothing",
      main.indexOf("createLobby(hubRoot") < main.indexOf("createRemote(token)"));

    // Hot-seat is HIDDEN IN A ROOM (V3) by not existing there. It was already
    // invisible — the strip hides itself at one player — but for the wrong
    // reason, and the two guards are what make the absence real rather than
    // incidental. The swapTo call above is deliberately NOT one of them: it is
    // unreachable in a room, and a throw there beats a half-swap.
    t.ok("a room page builds no hot-seat control", /hotSeat = inRoom \? null :/.test(main));
    t.ok("...and the scene toggle survives its absence",
      /if \(hotSeat\) hotSeat\.setSceneVisible\(/.test(main));
  }

  resetConfig();
}
