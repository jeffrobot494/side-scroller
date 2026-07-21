// Generation core: seeded RNG, jump envelope, enemy threat-cost, generateLevel.
import { makeRng, int, shuffle } from "../src/game/gen/rng.js";
import { jumpEnvelope } from "../src/game/gen/reach.js";
import * as ec from "../src/game/enemycost.js";
import { generateLevel } from "../src/game/gen/levelgen.js";
import { ENEMIES } from "../src/game/content.js";

export default async function run(t) {
  // ---- rng ----
  const a = makeRng(12345), b = makeRng(12345);
  const seqA = [a(), a(), a(), a()], seqB = [b(), b(), b(), b()];
  t.ok("rng: same seed → same sequence", JSON.stringify(seqA) === JSON.stringify(seqB));
  t.ok("rng: different seed → different sequence", makeRng(1)() !== makeRng(2)());
  t.ok("rng: floats in [0,1)", seqA.every((x) => x >= 0 && x < 1));
  const c = makeRng(7);
  t.ok("rng: int in range inclusive", Array.from({ length: 200 }, () => int(c, 3, 6)).every((v) => v >= 3 && v <= 6));
  const s = shuffle(makeRng(9), [1, 2, 3, 4, 5]);
  t.ok("rng: shuffle preserves length + members", s.length === 5 && [1, 2, 3, 4, 5].every((n) => s.includes(n)));

  // ---- reach ----
  const env = jumpEnvelope({ gravity: 2000, jumpSpeed: 720, runSpeed: 320 });
  t.ok("reach: maxRise ≈ 130 (720²/4000)", Math.abs(env.maxRise - 129.6) < 0.5);
  t.ok("reach: perch within maxRise reachable", env.perchReachable(120));
  t.ok("reach: perch above maxRise unreachable", !env.perchReachable(140));
  t.ok("reach: maxRunTo(0) == flatReach", Math.abs(env.maxRunTo(0) - env.flatReach) < 1e-6);
  t.ok("reach: maxRunTo above maxRise == -1", env.maxRunTo(200) === -1);
  t.ok("reach: higher perch → less horizontal reach", env.maxRunTo(100) < env.maxRunTo(40));
  t.ok("reach: bigger jumpSpeed → higher maxRise", jumpEnvelope({ gravity: 2000, jumpSpeed: 1000, runSpeed: 320 }).maxRise > env.maxRise);

  // ---- enemycost ----
  const tD = ec.enemyThreat(ENEMIES.drone), tS = ec.enemyThreat(ENEMIES.sentinel), tT = ec.enemyThreat(ENEMIES.turret);
  t.ok("cost: all threats positive", tD > 0 && tS > 0 && tT > 0);
  t.ok("cost: sentinel most dangerous", tS > tD && tS > tT);
  t.ok("cost: turret (stationary) cheaper than drone", tT < tD);
  t.ok("cost: budgetFor scales with pressure", ec.budgetFor("medium", 2) === ec.budgetFor("medium", 1) * 2);
  t.ok("cost: validatePlacement legal within budget", ec.validatePlacement([ENEMIES.drone, ENEMIES.drone], 200).legal);
  t.ok("cost: validatePlacement flags over budget", !ec.validatePlacement([ENEMIES.sentinel], 10).legal);

  // ---- generateLevel ----
  const g1 = generateLevel({ seed: 4242, difficulty: "medium", length: "medium" });
  const g2 = generateLevel({ seed: 4242, difficulty: "medium", length: "medium" });
  t.ok("gen: deterministic — same seed → identical level", JSON.stringify(g1.level) === JSON.stringify(g2.level));
  t.ok("gen: different seed → different level", JSON.stringify(generateLevel({ seed: 5 }).level) !== JSON.stringify(g1.level));

  const L = g1.level;
  t.ok("gen: LEVELS-shaped", L.world && Array.isArray(L.platforms) && L.playerSpawn && L.exit && L.artifact && Array.isArray(L.enemies));
  t.ok("gen: continuous ground spans world width", L.platforms[0].x === 0 && L.platforms[0].w === L.world.width);
  t.ok("gen: exit inside world bounds", L.exit.x > 0 && L.exit.x + L.exit.w < L.world.width);
  t.ok("gen: spawn left of exit", L.playerSpawn.x < L.exit.x);
  t.ok("gen: at least one enemy", L.enemies.length >= 1);
  t.ok("gen: every enemy type resolves", L.enemies.every((e) => ENEMIES[e.type]));
  t.ok("gen: no enemy in spawn safe zone", L.enemies.every((e) => e.x >= 380));
  t.ok("gen: report budget respected", g1.report.legal && g1.report.spent <= g1.report.budget);
  t.ok("gen: report traversable", g1.report.traversable === true);

  const envG = jumpEnvelope({ gravity: L.world.gravity, jumpSpeed: 720, runSpeed: 320 });
  t.ok("gen: all perches within jump envelope", L.platforms.slice(1).every((p) => 500 - p.y <= envG.maxRise && 500 - p.y > 0));

  t.ok("gen: higher difficulty spends more threat", generateLevel({ seed: 99, difficulty: "high" }).report.spent > generateLevel({ seed: 99, difficulty: "low" }).report.spent);

  const boss = generateLevel({ seed: 77, boss: true });
  t.ok("gen: boss carries winsCampaign", boss.mission.winsCampaign === true);
  t.ok("gen: boss threatReward 0", boss.mission.threatReward === 0);
  t.ok("gen: boss budget exceeds normal extreme", boss.report.budget > ec.budgetFor("extreme", 1));
  t.ok("gen: boss artifact worth more", boss.level.artifact.value > g1.level.artifact.value);

  t.ok("gen: custom roster respected", generateLevel({ seed: 3, difficulty: "high", roster: [ENEMIES.drone] }).level.enemies.every((e) => e.type === "drone"));
  t.ok("gen: mission is MISSION-shaped", g1.mission.id && g1.mission.name && g1.mission.brief && g1.mission.difficulty);
}
