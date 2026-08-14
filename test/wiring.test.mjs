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
    g.leads.push(fakeLead(`m${i}`, "Medium"));
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
      fakeLead("h0", "High"),
      fakeLead("h1", "High"),
      fakeLead("filler", "Low"),
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

  // ---- C3: deploying costs a day --------------------------------------------
  {
    const g3 = st.createState();
    const day = g3.day;
    const lead = g3.leads.find((l) => !l.winsCampaign);
    const health = g3.campaignHealth;
    st.applyMissionResult(g3, winResult(lead.id));
    t.eq("resolving a mission advances the day", g3.day, day + 1);
    // Approximation 2: the win's reward is banked before the day it cost.
    t.ok(
      "the mission's reward is applied before its day is charged",
      g3.campaignHealth === Math.min(100, health + lead.threatReward) - config.doomPerDay
    );

    const prev = config.dayPerDeploy;
    config.dayPerDeploy = false;
    try {
      const g4 = st.createState();
      const d = g4.day;
      st.applyMissionResult(g4, winResult(g4.leads[0].id));
      t.eq("dayPerDeploy off restores the free deploy", g4.day, d);
    } finally {
      config.dayPerDeploy = prev;
    }

    // Approximation 3: advanceDay refuses once the campaign is over, so the
    // mission that ends it is the one deploy never charged a day.
    const g5 = st.createState();
    g5.campaignHealth = 5;
    const doomed = g5.leads[0];
    const lastDay = g5.day;
    st.applyMissionResult(g5, { success: false, missionId: doomed.id, casualties: [], survivors: [], loot: [], killsBySoldier: [] });
    t.ok("a fatal failure ends the campaign", g5.outcome === "lost");
    t.eq("...and is not charged its day", g5.day, lastDay);
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
