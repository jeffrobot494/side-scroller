// State wiring: generated leads → loadMission → result consume/refill → boss → win/lose.
import * as st from "../src/game/state.js";
import { loadMission } from "../src/mission/entities.js";

const soldier = { id: "s1", name: "Rook", callsign: "RK", stats: { health: 5, aim: 5, speed: 5 } };
const weapon = { id: "rifle", name: "R", fireMode: "projectile", fireRate: 7, spread: 0, projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 1 }, effects: [{ kind: "damage", amount: 12 }] };
const winResult = (id, extra = {}) => ({ success: true, missionId: id, casualties: [], survivors: [], loot: [], killsBySoldier: [], ...extra });

export default async function run(t) {
  const g = st.createState();
  t.ok("board filled to 3 leads", g.leads.length === 3);
  t.ok("leads are mission-shaped + carry a level", g.leads.every((l) => l.id && l.name && l.brief && l.difficulty && l.level && l.report));
  t.ok("lead ids unique", new Set(g.leads.map((l) => l.id)).size === g.leads.length);
  t.ok("no boss lead at start", !g.leads.some((l) => l.winsCampaign));

  const lead = g.leads[0];
  const m = loadMission(lead.level, [{ data: soldier, weapon }]);
  t.ok("generated level loads (world/platforms/exit)", m.world && m.platforms.length >= 1 && m.exit);
  t.ok("all generated enemies instantiate", m.enemies.length === lead.level.enemies.length && m.enemies.every((e) => e.name));
  t.ok("continuous ground slab present", m.platforms[0].x === 0 && m.platforms[0].w === m.world.width);

  const h0 = g.campaignHealth;
  st.applyMissionResult(g, winResult(lead.id, { loot: [{ name: "X", value: 50 }] }));
  t.ok("cleared lead removed", !g.leads.some((l) => l.id === lead.id));
  t.ok("board refilled to 3", g.leads.length === 3);
  t.ok("win recorded in completedMissions", g.completedMissions.includes(lead.id));
  t.ok("threat reward restored health", g.campaignHealth >= h0);
  t.ok("loot banked to stores", g.stores.some((i) => i.name === "X"));

  // 3 more wins → boss eligible (BOSS_AFTER default 4)
  for (let i = 0; i < 3; i++) {
    const l = g.leads.find((x) => !x.winsCampaign);
    st.applyMissionResult(g, winResult(l.id));
  }
  t.ok("4 wins recorded", g.completedMissions.length === 4);
  const boss = g.leads.find((l) => l.winsCampaign);
  t.ok("boss lead on the board", !!boss);
  t.ok("boss has 0 threat reward", boss && boss.threatReward === 0);

  st.applyMissionResult(g, winResult(boss.id));
  t.ok("winning the boss ends the campaign", g.outcome === "won");
  t.ok("no refill after game over", !g.leads.some((l) => l.id === boss.id));

  const g2 = st.createState();
  const target = g2.leads[0];
  const before = g2.campaignHealth;
  st.applyMissionResult(g2, { success: false, missionId: target.id, casualties: [], survivors: [], loot: [], killsBySoldier: [] });
  t.ok("failed lead consumed + refilled", !g2.leads.some((l) => l.id === target.id) && g2.leads.length === 3);
  t.ok("failure costs campaign health", g2.campaignHealth < before);
}
