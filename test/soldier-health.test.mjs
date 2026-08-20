// Persistent soldier health: wounds carry across missions and heal at base.
// - a mission Soldier entity seeds its starting HP from persisted wounds
// - applyMissionResult writes each survivor's ending wounds back to the roster
// - advanceDay mends wounds by config.healPerDay, floored at 0
import { Soldier, STAND_H } from "../src/mission/entities.js";
import { soldierMaxHp } from "../src/game/soldiers.js";
import { createState, applyMissionResult, advanceDay } from "../src/game/state.js";
import { config } from "../src/game/config.js";

const rifle = { id: "rifle", name: "R", fireMode: "projectile", fireRate: 7, projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 1 }, effects: [] };

function rosterSoldier(id, health, wounds) {
  return {
    id, name: id, callsign: "", stats: { aim: 5, health, speed: 5, nerve: 5 },
    traits: [], cost: 0, status: "roster", record: { missions: 1, kills: 0 }, wounds,
  };
}

export default async function run(t) {
  // ---- max-hp helper matches the config formula ----
  {
    const s = rosterSoldier("m", 5, 0);
    t.eq("soldierMaxHp = base + health×perHealth", soldierMaxHp(s),
      config.soldierBaseHp + 5 * config.soldierHpPerHealth);
  }

  // ---- mission entity seeds starting HP from persisted wounds ----
  {
    const full = new Soldier(rosterSoldier("a", 5, 0), rifle, 0, 0 - STAND_H);
    t.eq("no wounds → full health", full.health, full.maxHealth);

    const hurt = new Soldier(rosterSoldier("b", 5, 5), rifle, 0, 0 - STAND_H);
    t.eq("5 wounds → maxHealth - 5", hurt.health, hurt.maxHealth - 5);

    // wounds ≥ maxHealth clamp to 1 so the soldier still deploys alive
    const wrecked = new Soldier(rosterSoldier("c", 5, 9999), rifle, 0, 0 - STAND_H);
    t.eq("wounds ≥ max clamp to 1 HP", wrecked.health, 1);
    t.ok("...still alive", wrecked.alive === true);

    // tolerant of a soldier that predates the field (no wounds key)
    const legacy = new Soldier({ id: "d", name: "d", stats: { health: 5, aim: 5, speed: 5 } }, rifle, 0, 0 - STAND_H);
    t.eq("missing wounds treated as 0", legacy.health, legacy.maxHealth);
  }

  // ---- applyMissionResult carries ending wounds back to the roster ----
  {
    const g = createState();
    g.roster.push(rosterSoldier("v1", 5, 0), rosterSoldier("v2", 5, 3), rosterSoldier("kia", 5, 0));
    applyMissionResult(g, {
      success: true,
      missionId: "no-such-lead", // no matching lead → campaign math skipped
      survivors: ["v1", "v2"],
      casualties: ["kia"],
      killsBySoldier: [{ id: "v1", kills: 2 }],
      woundsBySoldier: [{ id: "v1", wounds: 7 }, { id: "v2", wounds: 0 }, { id: "kia", wounds: 12 }],
      loot: [],
      kills: 2,
    });
    const v1 = g.roster.find((s) => s.id === "v1");
    const v2 = g.roster.find((s) => s.id === "v2");
    // A plain 7 since multiplayer-state S4. This used to read
    // `7 - config.healPerDay`, because resolving a mission charged its own day
    // (config.dayPerDeploy) and that day mended the survivor whose wounds the
    // same call had just written back. The charge moved to the ready gate, so
    // the write-back is now the last thing that touches these wounds and the
    // healing happens when somebody turns the day.
    t.eq("survivor's wounds updated from result", v1.wounds, 7);
    t.eq("survivor banks kills too", v1.record.kills, 2);
    t.eq("survivor can be healed by a mission (wounds → 0)", v2.wounds, 0);
    t.ok("casualty dropped from roster (no wound bookkeeping)", !g.roster.some((s) => s.id === "kia"));
  }

  // ---- advanceDay mends wounds by config.healPerDay, floored at 0 ----
  {
    const prev = config.healPerDay;
    config.healPerDay = 2;
    try {
      const g = createState();
      const hurt = rosterSoldier("h", 5, 5);
      const nick = rosterSoldier("n", 5, 1);
      const full = rosterSoldier("f", 5, 0);
      g.roster.push(hurt, nick, full);
      advanceDay(g);
      t.eq("heals by healPerDay", hurt.wounds, 3);
      t.eq("floors at 0 (never negative)", nick.wounds, 0);
      t.eq("full-health soldier untouched", full.wounds, 0);
      advanceDay(g);
      t.eq("keeps mending across days", hurt.wounds, 1);
    } finally {
      config.healPerDay = prev;
    }

    // healPerDay = 0 disables healing entirely
    config.healPerDay = 0;
    try {
      const g = createState();
      const hurt = rosterSoldier("h0", 5, 4);
      g.roster.push(hurt);
      advanceDay(g);
      t.eq("healPerDay 0 → no healing", hurt.wounds, 4);
    } finally {
      config.healPerDay = prev;
    }
  }
}
