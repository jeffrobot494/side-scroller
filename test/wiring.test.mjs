// State wiring: generated leads → loadMission → result consume/refill → boss → win/lose,
// plus campaign pacing: lead lifespans and expiry on a day advance.
import * as st from "../src/game/state.js";
import { config } from "../src/game/config.js";
import { loadMission } from "../src/mission/entities.js";

const soldier = { id: "s1", name: "Rook", callsign: "RK", stats: { health: 5, aim: 5, speed: 5 } };
const weapon = { id: "rifle", name: "R", fireMode: "projectile", fireRate: 7, spread: 0, projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 1 }, effects: [{ kind: "damage", amount: 12 }] };
// A board entry with only the fields campaign resolution reads, so a gate case
// does not depend on what the generator happened to roll.
const fakeLead = (id, difficulty) => ({
  id, name: id, brief: "", difficulty, threatReward: 0, winsCampaign: false, daysLeft: 9,
});
const winResult = (id, extra = {}) => ({ success: true, missionId: id, casualties: [], survivors: [], loot: [], killsBySoldier: [], ...extra });

export default async function run(t) {
  const g = st.createState();
  t.eq("board opens on seedLeads, not a full board", g.leads.length, config.seedLeads);
  t.ok("leads are mission-shaped + carry a level", g.leads.every((l) => l.id && l.name && l.brief && l.difficulty && l.level && l.report));
  t.ok("lead ids unique", new Set(g.leads.map((l) => l.id)).size === g.leads.length);
  t.ok("no boss lead at start", !g.leads.some((l) => l.winsCampaign));

  const lead = g.leads[0];
  const m = loadMission(lead.level, [{ data: soldier, weapon }]);
  t.ok("generated level loads (world/platforms/exit)", m.world && m.platforms.length >= 1 && m.exit);
  t.ok("all generated enemies instantiate as spec roots", m.specRoots.length === lead.level.enemies.length && m.specRoots.every((r) => r.kind === "spec" && r.alive));
  t.ok("scene.enemies exposes collidable spec parts", m.enemies.length >= m.specRoots.length && m.enemies.every((e) => e.kind === "spec"));
  t.ok("continuous ground slab present", m.platforms[0].x === 0 && m.platforms[0].w === m.world.width);
  t.eq("soldier hp = base + stat×per-point (10+5×2)", m.soldiers[0].maxHealth, 20);

  const h0 = g.campaignHealth;
  const board = g.leads.length;
  st.applyMissionResult(g, winResult(lead.id, { loot: [{ name: "X", value: 50 }] }));
  t.ok("cleared lead removed", !g.leads.some((l) => l.id === lead.id));
  // Nothing tops the board up: the only leads that can appear are the ones the
  // deploy's own day advance rolled, which cannot exceed ceil(leadArrivalRate).
  t.ok(
    "no top-up after a mission — only the deploy's day can bring work in",
    g.leads.length <= board - 1 + Math.ceil(config.leadArrivalRate)
  );
  t.ok("win recorded in completedMissions", g.completedMissions.includes(lead.id));
  t.ok("threat reward restored health", g.campaignHealth >= h0);
  t.ok("loot banked to stores", g.stores.some((i) => i.name === "X"));

  // ---- C4: the finale is gated on High wins, not a flat count ---------------
  // Leads are fabricated here: what the gate reads is the ADVERTISED difficulty,
  // and the generator's difficulty roll is not what is under test.
  // Fabricated rather than picked off the board: after C5 there is no top-up, so
  // searching the board for a fresh lead each pass is not something a test can
  // rely on finding.
  for (let i = 0; i < 3; i++) {
    g.leads.push(fakeLead(`m${i}`, "medium"));
    st.applyMissionResult(g, winResult(`m${i}`));
  }
  t.ok("4 wins recorded", g.completedMissions.length === 4);
  t.eq("ordinary wins count nothing toward the gate", g.highWins, 0);
  t.ok("...and never surface the finale", !g.leads.some((l) => l.winsCampaign));

  // A full board must not be able to defer the finale, so the gate bypasses the
  // ceiling. Pinned to a ceiling of 1 with a lead already occupying it: the boss
  // has to land on top of a board that is full by every rule the board has.
  const ceiling = config.leadCount;
  config.leadCount = 1;
  let boss;
  try {
    g.leads = [
      fakeLead("h0", "high"),
      fakeLead("h1", "high"),
      fakeLead("filler", "low"),
    ];
    for (let i = 0; i < config.bossHighWins; i++) st.applyMissionResult(g, winResult(`h${i}`));
    t.eq("cleared High leads are counted", g.highWins, config.bossHighWins);
    boss = g.leads.find((l) => l.winsCampaign);
    t.ok("boss lead placed the moment the gate is met", !!boss);
    t.ok("...over a board already at its ceiling", g.leads.length > config.leadCount);
    t.ok("boss has 0 threat reward", boss && boss.threatReward === 0);
    t.ok("boss lead does not expire", boss && boss.daysLeft === null);
  } finally {
    config.leadCount = ceiling;
  }

  st.applyMissionResult(g, winResult(boss.id));
  t.ok("winning the boss ends the campaign", g.outcome === "won");
  t.ok("no refill after game over", !g.leads.some((l) => l.id === boss.id));

  const g2 = st.createState();
  const target = g2.leads[0];
  const before = g2.campaignHealth;
  st.applyMissionResult(g2, { success: false, missionId: target.id, casualties: [], survivors: [], loot: [], killsBySoldier: [] });
  t.ok("failed lead consumed", !g2.leads.some((l) => l.id === target.id));
  t.ok("failure costs campaign health", g2.campaignHealth < before);

  // ---- C2: leads expire -----------------------------------------------------
  // Arrivals are pinned off throughout: a day advance both rots and delivers
  // (C5), and what is under test here is only the rot.
  // A full board is seeded so a mixed set of lifespans is actually on it.
  const arrivals = config.leadArrivalRate, seed = config.seedLeads;
  config.leadArrivalRate = 0;
  config.seedLeads = config.leadCount;
  try {
    const g3 = st.createState();
    t.ok(
      "every lead carries a lifespan inside the window",
      g3.leads.every((l) => l.daysLeft >= config.leadLifeMin && l.daysLeft <= config.leadLifeMax)
    );

    const days = g3.leads.map((l) => l.daysLeft);
    st.advanceDay(g3);
    t.ok(
      "a day advance ticks every surviving lead down by one",
      g3.leads.every((l) => days.includes(l.daysLeft + 1))
    );
    t.ok("a lead at zero left the board", g3.leads.length === days.filter((d) => d > 1).length);

    // Pinned to a 1-day window so the whole board rots in one tick, whatever the
    // roll — expiry must be able to empty the board, not just thin it.
    const min = config.leadLifeMin, max = config.leadLifeMax;
    config.leadLifeMin = config.leadLifeMax = 1;
    try {
      const g4 = st.createState();
      const names = g4.leads.map((l) => l.name);
      const res = st.advanceDay(g4);
      t.ok("a 1-day board empties on the first day advance", g4.leads.length === 0);
      t.ok("expiry is reported to the caller", names.every((n) => res.expired.includes(n)));
      t.ok("...and logged", g4.log.some((e) => e.text.includes("Lead dropped")));
    } finally {
      config.leadLifeMin = min;
      config.leadLifeMax = max;
    }
  } finally {
    config.leadArrivalRate = arrivals;
    config.seedLeads = seed;
  }

  // ---- Doom sources: the day, each rotted lead, the wipe ---------------------
  // design/campaign-pacing.md "Cost on expiry". The two clock sources ADD, so
  // every case below pins BOTH knobs — a case that sets one and inherits the
  // other is the one that would pass under a mode switch and lie under a sum.
  {
    const arrivals = config.leadArrivalRate, seed = config.seedLeads;
    const min = config.leadLifeMin, max = config.leadLifeMax;
    const day = config.doomPerDay, exp = config.doomPerExpiry, fail = config.doomPerFailure;
    // A full board on a 1-day fuse: every lead rots on the first advance, so
    // the number of charges is known rather than rolled.
    config.leadArrivalRate = 0;
    config.seedLeads = config.leadCount;
    config.leadLifeMin = config.leadLifeMax = 1;
    try {
      const rot = (perDay, perExpiry) => {
        config.doomPerDay = perDay;
        config.doomPerExpiry = perExpiry;
        const g = st.createState();
        const n = g.leads.length;
        const before = g.campaignHealth;
        st.advanceDay(g);
        return { n, lost: before - g.campaignHealth };
      };

      const dayOnly = rot(6, 0);
      t.eq("day only: the whole board rotting costs one daily tick", dayOnly.lost, 6);

      const expiryOnly = rot(0, 10);
      t.eq("expiry only: the clock answers to leads, not days", expiryOnly.lost, expiryOnly.n * 10);

      const both = rot(6, 10);
      t.eq("both: the two sources add on the same tick", both.lost, 6 + both.n * 10);

      // The other half of "expiry only" — with no day tick and nothing rotting,
      // time is free. This is the state the mode exists to reach.
      config.leadLifeMin = config.leadLifeMax = 9;
      config.doomPerDay = 0;
      config.doomPerExpiry = 10;
      const quiet = st.createState();
      const held = quiet.campaignHealth;
      st.advanceDay(quiet);
      t.eq("expiry only: a day with nothing rotting costs nothing", quiet.campaignHealth, held);

      // The finale is exempt because it carries no lifespan at all, so it never
      // reaches the expired list — no special case in the charge.
      const bossOnly = st.createState();
      bossOnly.leads = [{ ...fakeLead("boss", "high"), daysLeft: null, winsCampaign: true }];
      const bossHealth = bossOnly.campaignHealth;
      st.advanceDay(bossOnly);
      t.eq("the boss lead never expires, so it never charges", bossOnly.campaignHealth, bossHealth);
      t.ok("...and is still on the board", bossOnly.leads.length === 1);

      // The wipe penalty was hardcoded at 10 until the clock grew a second
      // source; it is a knob now and this is what proves the knob is read.
      config.doomPerFailure = 25;
      const wiped = st.createState();
      const doomedLead = wiped.leads[0];
      const wipedHealth = wiped.campaignHealth;
      st.applyMissionResult(wiped, { success: false, missionId: doomedLead.id, casualties: [], survivors: [], loot: [], killsBySoldier: [] });
      t.eq("a wipe charges doomPerFailure", wiped.campaignHealth, wipedHealth - 25);
    } finally {
      config.leadArrivalRate = arrivals;
      config.seedLeads = seed;
      config.leadLifeMin = min;
      config.leadLifeMax = max;
      config.doomPerDay = day;
      config.doomPerExpiry = exp;
      config.doomPerFailure = fail;
    }
  }

  // ---- C3: a mission no longer buys its own day (multiplayer-state S4) ------
  // C3 shipped as `if (config.dayPerDeploy) advanceDay(state)` at the end of
  // applyMissionResult. S4 deleted it: two commanders resolving two missions
  // against one shared clock would have bought two days of everybody's doom.
  // The day moved to the ready gate in src/game/session.js, and the cap that
  // keeps "one mission per day" true moved to the deploy command.
  //
  // Three of the four assertions that used to live here CANNOT be re-expressed
  // in this suite — it imports state.js, config.js and entities.js and never
  // the session, and config.dayPerDeploy is no longer read in state.js at all.
  // Their replacements are in test/session.test.mjs, next to the gate.
  {
    const g3 = st.createState();
    const day = g3.day;
    const lead = g3.leads.find((l) => !l.winsCampaign);
    const health = g3.campaignHealth;
    st.applyMissionResult(g3, winResult(lead.id));
    t.eq("resolving a mission does NOT advance the day", g3.day, day);
    // ...and with no day charged behind it, nothing subtracts doom from the
    // win. This used to read `- config.doomPerDay`; that term was the deploy's
    // own day, and it is now spent at the gate instead.
    t.eq(
      "the win's reward lands with no doom tick behind it",
      g3.campaignHealth,
      Math.min(100, health + lead.threatReward)
    );

    // The rule that DISSOLVED, recorded so it is not re-derived: "the mission
    // that ends the campaign is never charged a day" was a fact about a charge
    // that no longer exists. What survives at this level is only the ending
    // itself; "a finished campaign cannot turn another day" is the gate's rule
    // and is asserted against the gate.
    const g5 = st.createState();
    g5.campaignHealth = 5;
    const doomed = g5.leads[0];
    const lastDay = g5.day;
    st.applyMissionResult(g5, { success: false, missionId: doomed.id, casualties: [], survivors: [], loot: [], killsBySoldier: [] });
    t.ok("a fatal failure ends the campaign", g5.outcome === "lost");
    t.eq("...and no day passes on the way out", g5.day, lastDay);
  }

  // ---- C5: arrivals replace the top-up --------------------------------------
  {
    // Rate 0: the board can only ever thin. An empty board is a legal state, not
    // an error — the design's "thin is legal", and its one exit is passing days.
    const rate = config.leadArrivalRate;
    config.leadArrivalRate = 0;
    try {
      const g6 = st.createState();
      for (let i = 0; i < 5; i++) st.advanceDay(g6);
      t.eq("no arrivals with the rate at 0 → the board empties", g6.leads.length, 0);
      t.ok("...and an empty board is not an error", g6.outcome !== "lost" || g6.campaignHealth === 0);

      config.leadArrivalRate = 3; // whole number: three guaranteed, no coin flip
      const g7 = st.createState();
      const res = st.advanceDay(g7);
      t.ok("a day advance is the only source of leads", res.arrived.length > 0);
      t.ok(
        "arrivals never cross the ceiling",
        g7.leads.length <= config.leadCount && g7.leads.length === config.leadCount
      );
      const full = g7.leads.length;
      st.advanceDay(g7);
      t.ok("...and a full board takes none", g7.leads.filter((l) => !l.winsCampaign).length <= full);
    } finally {
      config.leadArrivalRate = rate;
    }

    // Approximation 1: a rate never yields more than ceil(rate) in one day.
    // The doom clock is off so 40 days can pass without ending the campaign.
    const doom = config.doomPerDay;
    config.leadArrivalRate = 1.25;
    config.doomPerDay = 0;
    try {
      const g8 = st.createState();
      let most = 0;
      for (let i = 0; i < 40; i++) {
        g8.leads = []; // clear the ceiling out of the way each pass
        most = Math.max(most, st.advanceDay(g8).arrived.length);
      }
      t.ok("a fractional rate is a floor plus one coin flip (never > ceil)", most === 2);
    } finally {
      config.leadArrivalRate = rate;
      config.doomPerDay = doom;
    }
  }
}
