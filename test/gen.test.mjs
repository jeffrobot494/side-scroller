// Generation core: seeded RNG, jump envelope, enemy threat-cost, generateLevel.
import { makeRng, int, shuffle } from "../src/game/gen/rng.js";
import { jumpEnvelope } from "../src/game/gen/reach.js";
import * as ec from "../src/game/enemycost.js";
import { generateLevel } from "../src/game/gen/levelgen.js";
import { ENEMIES } from "../src/game/content.js";
import { missionSpecById, missionRoster } from "../src/game/enemyspecs.js";

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
  t.ok("cost: spec descriptor scores by its authored threat", ec.enemyThreat({ isSpec: true, threat: 120 }) === 120);

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
  t.ok("gen: every enemy type resolves to a built-in spec", L.enemies.every((e) => missionSpecById[e.type]));
  t.ok("gen: no enemy in spawn safe zone", L.enemies.every((e) => e.x >= 380));
  t.ok("gen: report budget respected", g1.report.legal && g1.report.spent <= g1.report.budget);
  t.ok("gen: report traversable", g1.report.traversable === true);

  t.ok("gen: medium width in doubled band", L.world.width >= 6000 && L.world.width <= 6800);
  t.ok("gen: no unreachable platforms (report)", L && g1.report.unreachable === 0);

  // Terrain: chained structures may climb past the single-jump ceiling, but
  // every platform must be reachable BY THE SOLDIER'S BODY and the level must
  // stay walkable end to end. Alongside the engine's own audit fields, run an
  // INDEPENDENT wall check (don't let the auditor grade itself): any piece too
  // low to walk under (clearance < 46) must keep ≥ 30px of open-sky landing on
  // its merged top surface, or it's an impassable wall.
  let badReach = 0, walls = 0, sawBox = false, sawHigh = false;
  const envG = jumpEnvelope({ gravity: L.world.gravity, jumpSpeed: 720, runSpeed: 320 });
  for (let s = 1; s <= 40; s++) {
    const r = generateLevel({ seed: s * 101 });
    if (r.report.unreachable !== 0 || !r.report.traversable) badReach++;
    const els = r.level.platforms.slice(1);
    for (const p of els) {
      if (p.h > 20) sawBox = true;
      if (500 - p.y > envG.maxRise) sawHigh = true;
      if (500 - (p.y + p.h) >= 46) continue; // walk-under is open — not a wall
      let x0 = p.x, x1 = p.x + p.w; // merge same-top neighbors (box + arm)
      for (const q of els) if (q !== p && q.y === p.y && q.x <= x1 && q.x + q.w >= x0) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x + q.w); }
      let segs = [[x0, x1]];
      for (const q of els) {
        if (q.y >= p.y || p.y - (q.y + q.h) >= 46) continue;
        segs = segs.flatMap(([a, b]) => { const o = []; if (q.x > a) o.push([a, Math.min(b, q.x)]); if (q.x + q.w < b) o.push([Math.max(a, q.x + q.w), b]); return o; });
      }
      if (Math.max(0, ...segs.map(([a, b]) => b - a)) < 30) walls++;
    }
  }
  t.ok("gen: 40 seeds → every platform body-reachable + level traversable", badReach === 0);
  t.ok("gen: 40 seeds → no impassable walls (independent check)", walls === 0);
  t.ok("gen: terrain includes solid boxes", sawBox);
  t.ok("gen: terrain climbs past the single-jump ceiling", sawHigh);

  // ---- low jump ceiling degrades gracefully (never a dead-flat level) ----
  // A low Jump strength / high Gravity shrinks the reachable rise; the generator
  // must still place short, reachable perches instead of bailing to flat ground
  // (the regression that made every level a bare plane). Only a truly unjumpable
  // config stays flat.
  {
    const lowPhys = { gravity: 4000, jumpSpeed: 720, runSpeed: 320 }; // maxRise ≈ 65
    const envLow = jumpEnvelope(lowPhys);
    let flat = 0, tooHigh = 0, notTrav = 0;
    for (let s = 1; s <= 12; s++) {
      const r = generateLevel({ seed: s * 13, physics: lowPhys });
      const perches = r.level.platforms.slice(1);
      if (perches.length === 0) flat++;
      if (!r.report.traversable || r.report.unreachable !== 0) notTrav++;
      // low jump ⇒ no chaining, so every perch must sit within a single jump
      for (const p of perches) if ((500 - p.y) > envLow.maxRise + 0.5) tooHigh++;
    }
    t.ok("gen: low jump ceiling still produces platforms (not flat)", flat === 0);
    t.ok("gen: low-jump perches stay within a single jump", tooHigh === 0);
    t.ok("gen: low-jump levels remain traversable", notTrav === 0);
    // ...but a jump too low to clear anything correctly stays flat
    const tiny = generateLevel({ seed: 7, physics: { gravity: 2000, jumpSpeed: 300, runSpeed: 320 } });
    t.ok("gen: an unjumpable config stays flat (ground slab only)", tiny.level.platforms.length === 1);
  }

  t.ok("gen: higher difficulty spends more threat", generateLevel({ seed: 99, difficulty: "high" }).report.spent > generateLevel({ seed: 99, difficulty: "low" }).report.spent);

  const boss = generateLevel({ seed: 77, boss: true });
  t.ok("gen: boss carries winsCampaign", boss.mission.winsCampaign === true);
  t.ok("gen: boss threatReward 0", boss.mission.threatReward === 0);
  t.ok("gen: boss budget exceeds normal extreme", boss.report.budget > ec.budgetFor("extreme", 1));
  t.ok("gen: boss artifact worth more", boss.level.artifact.value > g1.level.artifact.value);

  const oneSpec = missionRoster().find((d) => d.id === "husk_charger");
  t.ok("gen: custom roster respected", generateLevel({ seed: 3, difficulty: "high", roster: [oneSpec] }).level.enemies.every((e) => e.type === "husk_charger"));
  t.ok("gen: mission is MISSION-shaped", g1.mission.id && g1.mission.name && g1.mission.brief && g1.mission.difficulty);
}
