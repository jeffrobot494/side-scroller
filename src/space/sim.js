// ---------------------------------------------------------------------------
// SPACE PROTOTYPE — the simulation (tech/space-prototype.md).
//
// DOM-free: main.js feeds it one input object per fixed step, view.js reads the
// world it returns, test/space.test.mjs drives it with scripted input. It
// imports nothing — values the game has are COPIED (see the spec's Reuses) so
// neither side can break the other.
//
// Every gameplay draw goes through `world.rng`; cosmetic randomness lives in
// view.js. Same seed + same input trace = same world.
// ---------------------------------------------------------------------------

export const CFG = {
  step: 1 / 60, // fixed step, as Mission._frame
  maxFrame: 0.25, // frame clamp, as Mission._frame

  mapSize: 8000,
  restitution: 0.6,

  asteroidCount: 70,
  asteroidMinR: 30,
  asteroidMaxR: 480, // was 160 (Bo: three times as big)
  asteroidMaxSpeed: 40,
  asteroidGap: 30,
  asteroidDensity: 2, // mass = (r / soldierR)² × density; a soldier is mass 1
  startClear: 420,

  soldierR: 18, // ≈ the game's 30×46 soldier
  bodyLength: 42, // the drawn figure, head to feet (tech/space-magboots.md)

  // Magnetic boots (tech/space-magboots.md). Gravity, walk and jump are copied
  // from src/game/config.js; accel and friction from SOLDIER_TUNING.
  bootsReach: 40, // activation: this far from the feet (Bo, 2026-09-30; the brief said ⅓ of a body, 14)
  bootsHold: 200, // B2: once on, a surface must stay this close in the wedge
  bootsWedge: Math.PI / 4, // the feet wedge is ± this about down
  gravity: 2000,
  walkSpeed: 320,
  walkAccel: 2600,
  walkFriction: 3000,
  jumpSpeed: 700,
  snapTol: 12, // a push past this knocks a standing soldier off its surface
  footstep: 34, // px walked per footstep event (M4)

  // Crashes: a soldier hitting a rock or a hull plate is hurt by its closing
  // speed — nothing up to crashSafe, all its HP at crashLethal. A feet-first
  // landing with the boots on is safe up to landSafe instead, above a boots
  // jump's 700, so landing one is free.
  crashSafe: 500, // was 750 (Bo)
  landSafe: 750,
  crashLethal: 1125, // was 1500; Bo: double the damage
  companionCrash: 0.7, // a companion takes this share of crash damage (Bo)
  turnRate: 4, // rad/s
  thrust: 500, // px/s²

  // Copied from src/game/config.js defaults.
  aimSpread: 0.12,
  playerDamageMult: 1.25,
  knockbackDecay: 3000,
  soldierMagazines: 4,
  knockbackMaxV: 2450, // KNOCKBACK_MAX_V, src/mission/entities.js

  bulletPush: 60, // a round's impulse on a rock: Δv = bulletPush / mass (slight, P8)
  blastPush: 1500, // an explosion's peak impulse on a rock, falling off to its edge

  ruinsMin: 3, // P3
  ruinsMax: 5,
  derelictL: [1100, 1500], // P15: a derelict's length and beam (was 340–460 × 170–220)
  derelictW: [500, 650],
  ruinGap: 2100, // centre to centre (was 900, for the old size)
  ruinStartGap: 700,
  wallHalf: 6, // half a hull plate's thickness
  breach: 90, // an opening in a hull; a soldier is 36 across
  artifactR: 14,
  extractR: 120,
  extractMinDist: 4000, // half the map from the start (P10)

  standoff: 90, // companion station distance: 90 ± 40, as companionspecs.js authors it
  standoffSpread: 40,
  companionRange: 700, // engage range, capped by what the weapon reaches
  stationGain: 1.2, // px/s of closing speed per px off station
  stationClose: 420, // most closing speed a companion adds on top of the leader's velocity

  enemyCount: 12, // placed in the field at start
  crewMin: 2, // P16: groups placed inside each derelict, one per room
  crewMax: 4,
  crewLeash: 40, // an idle crewman drifts back to its room past this
  eliteCount: 2, // P17: wardens patrolling the field
  patrolPoints: 5, // waypoints in a warden's loop
  patrolStartGap: 1500, // no waypoint nearer the start than this
  patrolReach: 150, // a waypoint counts as reached within this
  enemyStartGap: 1000,
  enemyCap: 30, // a wave is skipped while this many are alive
  waveEvery: 30, // P5
  waveBase: 3, // enemies in the first wave; +1 per wave, never ends
  waveDistMin: 900, // offscreen from the squad at 1280×720
  waveDistMax: 1100,
  senseEvery: 0.2, // the game's perception cadence
  // Troopers (tech/space-troopers.md, K1–K6): soldier bodies on the enemy team.
  trooperDamage: 0.5, // K3: each effect amount on a trooper's gun copy
  trooperAim: [3, 6], // K2: rolled per trooper; the recruits are 5–8
  trooperHealth: [4, 7],
  alertRange: 650,

  dummyCount: 0, // S2 target dummies: a test fixture now, none in play
  dummyHp: 60,
  dummyR: 20,
  dummyRespawn: 2,
};

// ---- rng (mulberry32, the game's makeRng) ---------------------------------
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = (rng, lo, hi) => lo + rng() * (hi - lo);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---- weapons (copied from src/game/arsenal.js; `gravity` dropped) ----------
export const WEAPONS = {
  carbine: { id: "carbine", name: "Field Carbine", fireRate: 6, auto: true, spread: 0.02, magazine: 24, reloadTime: 1.8,
    projectile: { speed: 950, w: 12, h: 4, color: "#ffd36a", life: 1.0, shape: "bullet" },
    effects: [{ kind: "damage", amount: 14 }] },
  scattergun: { id: "scattergun", name: "Scattergun", fireRate: 1.6, auto: false, spread: 0.05, magazine: 6, reloadTime: 2.2,
    projectile: { speed: 820, w: 8, h: 4, color: "#ffbf6a", life: 0.5, shape: "pellet" },
    effects: [{ kind: "damage", amount: 9 }, { kind: "pellets", count: 5, spread: 0.13 }] },
  ember_jet: { id: "ember_jet", name: "Ember Jet", fireRate: 10, auto: true, spread: 0.06, magazine: 45, reloadTime: 2.0,
    projectile: { speed: 620, w: 10, h: 6, color: "#ff8a3a", life: 0.35, shape: "wave" },
    effects: [{ kind: "burn", dps: 8, duration: 1.2 }] },
  stun_pistol: { id: "stun_pistol", name: "Stun Pistol", fireRate: 3, auto: false, spread: 0.03, magazine: 10, reloadTime: 1.3,
    projectile: { speed: 780, w: 10, h: 4, color: "#8fd0ff", life: 0.9, shape: "bolt" },
    effects: [{ kind: "damage", amount: 6 }, { kind: "slow", factor: 0.5, duration: 1.5 }] },
  ripper: { id: "ripper", name: "Ripper", fireRate: 5, auto: true, spread: 0.02, magazine: 20, reloadTime: 1.7,
    projectile: { speed: 1050, w: 14, h: 4, color: "#c0f0ff", life: 1.1, shape: "bolt" },
    effects: [{ kind: "damage", amount: 10 }, { kind: "pierce", count: 1 }] },
  bulldog: { id: "bulldog", name: "Bulldog", fireRate: 2, auto: false, spread: 0.01, magazine: 8, reloadTime: 1.8,
    projectile: { speed: 880, w: 16, h: 6, color: "#ffd36a", life: 0.9, shape: "bullet" },
    effects: [{ kind: "damage", amount: 26 }, { kind: "knockback", force: 0.3 }] },
  grenade_launcher: { id: "grenade_launcher", name: "Grenade Launcher", fireRate: 1.6, auto: false, spread: 0.01, magazine: 4, reloadTime: 2.6,
    projectile: { speed: 700, w: 16, h: 12, color: "#c8d24a", life: 1.5, shape: "orb" },
    effects: [{ kind: "damage", amount: 10 }, { kind: "explode", amount: 40, radius: 150 }] },
  arc_tazer: { id: "arc_tazer", name: "Arc Tazer", fireRate: 6, auto: true, spread: 0.03, magazine: 24, reloadTime: 1.8,
    projectile: { speed: 940, w: 9, h: 4, color: "#8fd0ff", life: 0.8, shape: "bolt" },
    effects: [{ kind: "damage", amount: 9 }, { kind: "chain", amount: 8, jumps: 2, range: 240 }] },
  seeker: { id: "seeker", name: "Seeker", fireRate: 1.6, auto: true, spread: 0.02, magazine: 5, reloadTime: 2.8,
    projectile: { speed: 520, w: 12, h: 12, color: "#ff9be0", life: 2.2, shape: "missile" },
    effects: [{ kind: "damage", amount: 12 }, { kind: "explode", amount: 55, radius: 170 }, { kind: "homing", turn: 3 }] },
};

export const LOADOUT = ["carbine", "grenade_launcher", "arc_tazer"]; // P12

// ---- enemies (P4) --------------------------------------------------------------
// New zero-g types, each seeded from one roster entry in src/game/enemyspecs.js
// for HP, damage and projectile. Enemies thrust directly in any direction;
// only soldiers rotate-and-thrust.
const enemyGun = (projectile, damage) => ({
  fireRate: 1000, auto: true, spread: 0, magazine: 0, // cadence is the brain's
  projectile, effects: [{ kind: "damage", amount: damage }],
});

export const ENEMY_TYPES = {
  // ← husk_charger: HP 24, contact 10, chase 210.
  charger: { name: "Charger", r: 14, hp: 24, speed: 210, accel: 380, contact: 10, color: "#e05a5a" },
  // ← lurk_gunner: HP 46, keepDistance 260–420 at 140, orb 460 / 14, telegraph 0.5, wait 1.4.
  gunner: { name: "Gunner", r: 20, hp: 46, speed: 140, accel: 260, keepMin: 260, keepMax: 420, tele: 0.5, wait: [1.4, 1.4],
    weapon: enemyGun({ speed: 460, w: 14, h: 14, color: "#8affc1", life: 2.2, shape: "orb" }, 14), color: "#c261e0" },
  // ← strafe_raider: bullet 540 / 8, telegraph 0.45; HP 36 lowered to 14 for packs of three.
  swarmer: { name: "Swarmer", r: 11, hp: 14, speed: 300, accel: 600, orbit: 240, tele: 0.45, wait: [0.9, 1.5], pack: 3,
    weapon: enemyGun({ speed: 540, w: 10, h: 5, color: "#ffcf5c", life: 1.6, shape: "bullet" }, 8), color: "#e0975a" },
  // ← spore_wisp: HP 30, drift 60, a volley every 1.6–2.4s — released as mines.
  minelayer: { name: "Mine-layer", r: 18, hp: 30, speed: 60, accel: 120, keep: 350, drop: [1.6, 2.4], maxMines: 6, color: "#5ac8e0" },
  // Elite (P17): new, nothing in the roster to copy. Patrols a loop of the
  // field; on sight it holds range and fires led bursts; out of sight for
  // giveUp seconds, it returns to its route.
  warden: { name: "Warden", r: 30, hp: 320, speed: 230, patrol: 140, accel: 340, keepMin: 320, keepMax: 560,
    sight: 900, giveUp: 6, tele: 0.6, wait: [1.8, 2.6], burst: 4, burstGap: 0.11, lead: true, elite: true,
    weapon: enemyGun({ speed: 760, w: 14, h: 5, color: "#ffb347", life: 1.6, shape: "bolt" }, 7), color: "#d9a441" },
  // A soldier body on the enemy team (tech/space-troopers.md): stats, HP and
  // gun are rolled per trooper by makeEnemy, so this holds only what a type can.
  trooper: { name: "Trooper", r: 18, soldier: true, pack: 2, tele: 0.35, color: "#d8524a",
    vMax: 380, // K5: under crashSafe, so its own flying never hurts it
    perchMinR: 45, perchSearch: 1400, idleSearch: 900, shareR: 150, partnerGap: 600,
    band: [220, 650], relocate: 1.1, // K6: peek from here, leave past band × relocate
    coastGap: 150, vLand: 120, brake: 200, lookAhead: 0.8, stall: 30, // the landing approach
    approachMax: 8, skipFor: 5, repick: 1,
    keep: [280, 520], floatSpeed: 260, // floating combat, as a gunner holds range
    chaseV: 150, // a target moving faster than this is chased, not perched ahead of
    wait: [0.8, 2.0], burstAuto: [3, 5] }, // K4
  // A mine: shootable (HP 4, like the boss's seeker), arms, then fuses on proximity.
  mine: { name: "Mine", r: 9, hp: 4, arm: 0.8, trigger: 70, fuse: 0.35, life: 25,
    blast: { kind: "explode", amount: 12, radius: 80 }, color: "#bff29a" },
};

// Weighted mix for placement and waves (a swarmer entry is a pack).
const ENEMY_MIX = [["charger", 35], ["gunner", 25], ["swarmer", 25], ["minelayer", 15], ["trooper", 15]]; // K1
// Who crews a derelict (P16): no mine-layers, whose mines would fill a room.
const CREW_MIX = [["gunner", 45], ["charger", 40], ["swarmer", 15]];

// ---- recruits (copied from src/game/soldiers.js) ---------------------------
export const RECRUITS = [
  { name: "Mara Vance", stats: { aim: 8, health: 6, speed: 5, nerve: 6 }, color: "#6fc3ff" },
  { name: "Kwame Osei", stats: { aim: 5, health: 7, speed: 4, nerve: 10 }, color: "#ffb45a" },
  { name: "Yuki Tanaka", stats: { aim: 7, health: 4, speed: 9, nerve: 4 }, color: "#b98cff" },
];

// soldierMaxHp: soldierBaseHp 15 + health × soldierHpPerHealth 2
export const soldierMaxHp = (stats) => 15 + stats.health * 2;

// aimAccuracy, src/mission/ai.js: Aim 1..10 → 0..1
export function aimAccuracy(aim) {
  const a = ((aim ?? 5) - 1) / 9;
  return a < 0 ? 0 : a > 1 ? 1 : a;
}

// ---- world ----------------------------------------------------------------
export function createWorld(seed = 1, opts = {}) {
  const rng = makeRng(seed);
  const S = CFG.mapSize;
  const world = {
    seed,
    rng,
    t: 0,
    size: S,
    asteroids: [],
    soldiers: [],
    enemies: [],
    projectiles: [],
    ruins: [],
    walls: [],
    keepClear: [],
    artifact: null,
    extract: null,
    end: null, // { success } once the mission resolves
    ctrl: 0,
    events: [], // one-shot happenings for the view (flashes); the view drains it
  };

  // Start near a random corner.
  const cx = rng() < 0.5 ? 0 : 1;
  const cy = rng() < 0.5 ? 0 : 1;
  world.start = {
    x: cx ? S - rand(rng, 400, 700) : rand(rng, 400, 700),
    y: cy ? S - rand(rng, 400, 700) : rand(rng, 400, 700),
  };

  const squad = opts.squad ?? 1;
  for (let i = 0; i < squad; i++) {
    const r = RECRUITS[i % RECRUITS.length];
    const weapon = (opts.weapons && opts.weapons[i]) || LOADOUT[i % LOADOUT.length];
    const s = makeSoldier(r, world.start.x + (i - (squad - 1) / 2) * 50, world.start.y, weapon);
    // A station beside whoever leads, rolled once per soldier: a bearing
    // (spread around the squad) and a distance within spread of the standoff.
    s.station = {
      a: (i / squad) * Math.PI * 2 + rng() * 0.8,
      d: CFG.standoff + (rng() * 2 - 1) * CFG.standoffSpread,
    };
    world.soldiers.push(s);
  }

  if (opts.ruins !== 0) placeRuins(world, opts.ruins);
  if (opts.objective !== false) placeObjective(world);
  placeAsteroids(world, opts.asteroids ?? CFG.asteroidCount);

  world.wave = { n: 0, t: opts.waveEvery ?? CFG.waveEvery };
  if (opts.enemies !== 0) placeEnemies(world, opts.enemies ?? CFG.enemyCount, opts.elites ?? CFG.eliteCount);

  const dummies = opts.dummies ?? CFG.dummyCount;
  for (let i = 0; i < dummies; i++) {
    const a = (i / dummies) * Math.PI * 2 + rng() * 0.4;
    const d = rand(rng, 220, 340);
    world.enemies.push(makeDummy(world.start.x + Math.cos(a) * d, world.start.y + Math.sin(a) * d));
  }
  return world;
}

function makeSoldier(recruit, x, y, weaponId) {
  const maxHp = soldierMaxHp(recruit.stats);
  const weapon = WEAPONS[weaponId];
  return {
    kind: "soldier",
    team: "player",
    name: recruit.name,
    color: recruit.color,
    stats: { ...recruit.stats },
    x, y, vx: 0, vy: 0,
    sx: 0, sy: 0, // knockback shove channel
    r: CFG.soldierR,
    m: 1,
    angle: -Math.PI / 2, // facing: where the jetpack pushes
    dir: 1, // which side of facing the head is on: see upOf
    boots: null, // null (floating), "air" or "ground"
    ground: null, // the rock stood on
    gphi: 0, // where on it, in the rock's own frame
    gv: 0, // walk speed along the surface, + toward the rock's +angle
    walkIn: 0,
    pushed: 0, // px other things pushed a standing soldier this step
    stride: 0, // px walked since landing: footsteps, and the view's stride
    aim: -Math.PI / 2, // where the gun points
    thrusting: false,
    hp: maxHp,
    maxHp,
    alive: true,
    weapon,
    ammo: weapon.magazine || Infinity,
    magsLeft: Math.max(0, CFG.soldierMagazines - 1), // one of the four starts loaded
    reloading: 0,
    fireCd: 0,
    burn: null,
    slow: null,
    flash: 0,
    muzzle: 0,
  };
}

function makeDummy(x, y) {
  return {
    kind: "dummy",
    team: "enemy",
    x, y, vx: 0, vy: 0, sx: 0, sy: 0,
    homeX: x, homeY: y,
    r: CFG.dummyR,
    m: (CFG.dummyR / CFG.soldierR) ** 2,
    hp: CFG.dummyHp,
    maxHp: CFG.dummyHp,
    alive: true,
    respawn: 0,
    burn: null, slow: null, flash: 0,
  };
}

export function makeAsteroid(rng, x, y, r) {
  const n = 9 + Math.floor(rng() * 6);
  const verts = [];
  for (let i = 0; i < n; i++) verts.push(0.9 + rng() * 0.15);
  const a = rng() * Math.PI * 2;
  const sp = rng() * CFG.asteroidMaxSpeed;
  return {
    kind: "asteroid",
    x, y, r,
    vx: Math.cos(a) * sp,
    vy: Math.sin(a) * sp,
    m: (r / CFG.soldierR) ** 2 * CFG.asteroidDensity,
    rot: rng() * Math.PI * 2,
    spin: (rng() - 0.5) * 0.6,
    verts,
  };
}

// Rejection sampling: a gap between rocks, the start kept clear, and anything
// in `world.keepClear` (ruins, later) respected.
function placeAsteroids(world, count) {
  const { rng, size } = world;
  let tries = 0;
  while (world.asteroids.length < count && tries++ < count * 60) {
    // Skew toward small rocks: many pebbles, few boulders.
    const r = CFG.asteroidMinR + (CFG.asteroidMaxR - CFG.asteroidMinR) * rng() ** 2;
    const x = rand(rng, r, size - r);
    const y = rand(rng, r, size - r);
    if (Math.hypot(x - world.start.x, y - world.start.y) < CFG.startClear + r) continue;
    if (world.asteroids.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + CFG.asteroidGap)) continue;
    if (blockedByClearZones(world, x, y, r)) continue;
    world.asteroids.push(makeAsteroid(rng, x, y, r));
  }
}

function blockedByClearZones(world, x, y, r) {
  for (const z of world.keepClear || []) {
    if (Math.hypot(z.x - x, z.y - y) < z.r + r + CFG.asteroidGap) return true;
  }
  return false;
}

// ---- ruins, artifact, extraction --------------------------------------------
// A ruin is a derelict hull: wall segments with breaches cut in the hull and
// doors in the bulkheads. In play every ruin is a derelict (addDerelict); the
// small one-bulkhead hull (addRuin) is the fixture the boots tests walk round.
// The artifact sits in the aft compartment of one of them.
function placeRuins(world, want) {
  const { rng, size } = world;
  const count = want ?? CFG.ruinsMin + Math.floor(rng() * (CFG.ruinsMax - CFG.ruinsMin + 1));
  let tries = 0;
  while (world.ruins.length < count && tries++ < 400) {
    const L = rand(rng, CFG.derelictL[0], CFG.derelictL[1]);
    const W = rand(rng, CFG.derelictW[0], CFG.derelictW[1]);
    const R = Math.hypot(L / 2, W / 2);
    const x = rand(rng, R + 60, size - R - 60);
    const y = rand(rng, R + 60, size - R - 60);
    if (Math.hypot(x - world.start.x, y - world.start.y) < CFG.ruinStartGap + R) continue;
    if (world.ruins.some((o) => Math.hypot(o.x - x, o.y - y) < CFG.ruinGap)) continue;
    addDerelict(world, x, y, rand(rng, 0, Math.PI * 2), L, W);
  }
}

// `breaches` (hull edge indices) fixes where the hull is cut, for tests; left
// out, it is rolled, as in play.
export function addRuin(world, x, y, angle, L, W, breaches = null) {
  const { rng } = world;
  const hull = [[-L / 2, -W / 2], [L / 4, -W / 2], [L / 2, 0], [L / 4, W / 2], [-L / 2, W / 2]];
  // Where along each edge a breach is centred. The long sides breach forward
  // of the bulkhead, which meets them at x = -L/8 and would split a centred one.
  const breachAt = [0.8, 0.5, 0.5, 0.2, 0.5];
  // Which hull edges get a breach: one always, a second half the time.
  let breached = breaches && new Set(breaches);
  if (!breached) {
    breached = new Set([Math.floor(rng() * hull.length)]);
    if (rng() < 0.5) breached.add(Math.floor(rng() * hull.length));
  }
  const segs = [];
  const openings = []; // centre of every breach and door, local
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    if (breached.has(i)) {
      segs.push(...cut(a, b, CFG.breach, breachAt[i]));
      openings.push(lerp(a, b, breachAt[i]));
    } else segs.push([a, b]);
  }
  // Bulkhead across the hold with a door in it.
  segs.push(...cut([-L / 8, -W / 2], [-L / 8, W / 2], CFG.breach));
  openings.push([-L / 8, 0]);
  return buildRuin(world, x, y, angle, L, W, { hull, segs, openings, aft: [-L * 0.31, 0], rooms: [[-L * 0.31, 0], [L * 0.15, 0]] });
}

// A derelict (P15): an eight-sided hull, three bulkheads and a keel wall
// splitting the middle two bays — six rooms: aft, four amidships, fore. Every
// bulkhead half has a door, so every room is reachable from every breach; the
// keel wall has a door in each bay half the time. One to three breaches, each
// centred in a stretch of hull plate clear of the bulkheads that meet it.
// `breaches` fixes them by index into the candidate stretches, for tests.
export function addDerelict(world, x, y, angle, L, W, breaches = null) {
  const { rng } = world;
  const hull = [
    [-L / 2, -0.32 * W], [-0.38 * L, -W / 2], [0.18 * L, -W / 2], [L / 2, -0.12 * W],
    [L / 2, 0.12 * W], [0.18 * L, W / 2], [-0.38 * L, W / 2], [-L / 2, 0.32 * W],
  ];
  // The hull's top (−y) at station x; it is symmetric about the keel.
  const top = (px) => {
    let best = 0;
    for (let i = 0; i < hull.length; i++) {
      const [ax, ay] = hull[i], [bx, by] = hull[(i + 1) % hull.length];
      if (ay > 0 || by > 0 || (px - ax) * (px - bx) > 0 || ax === bx) continue;
      best = Math.min(best, ay + ((by - ay) * (px - ax)) / (bx - ax));
    }
    return best;
  };
  const jit = () => (rng() * 2 - 1) * 0.03 * L;
  const bulk = [-0.26 * L + jit(), -0.02 * L + jit(), 0.28 * L + jit()];
  const segs = [];
  const openings = [];
  const door = (a, b, lo, hi) => {
    const k = rand(rng, lo, hi);
    segs.push(...cut(a, b, CFG.breach, k));
    openings.push(lerp(a, b, k));
  };
  // Bulkheads, each in two halves meeting the keel wall.
  const junctions = []; // where a bulkhead meets the hull, local
  for (const bx of bulk) {
    const ty = top(bx);
    junctions.push([bx, ty], [bx, -ty]);
    door([bx, ty], [bx, 0], 0.35, 0.65);
    door([bx, 0], [bx, -ty], 0.35, 0.65);
  }
  // The keel wall, between the aft and fore bulkheads, split at the middle one.
  for (const [x0, x1] of [[bulk[0], bulk[1]], [bulk[1], bulk[2]]]) {
    if (rng() < 0.5) door([x0, 0], [x1, 0], 0.3, 0.7);
    else segs.push([[x0, 0], [x1, 0]]);
  }
  // Breach candidates: the middle of every stretch of hull plate between a
  // corner and a junction that is long enough to cut.
  const cands = []; // [edge, k]
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ks = [0, 1];
    for (const [jx, jy] of junctions) {
      const k = ((jx - a[0]) * (b[0] - a[0]) + (jy - a[1]) * (b[1] - a[1])) / (len * len);
      const [px, py] = lerp(a, b, k);
      if (k > 0 && k < 1 && Math.hypot(px - jx, py - jy) < 1e-6) ks.push(k);
    }
    ks.sort((p, q) => p - q);
    for (let j = 0; j + 1 < ks.length; j++) {
      if ((ks[j + 1] - ks[j]) * len >= CFG.breach + 80) cands.push([i, (ks[j] + ks[j + 1]) / 2]);
    }
  }
  let picked = breaches;
  if (!picked) {
    const n = 1 + (rng() < 0.6 ? 1 : 0) + (rng() < 0.3 ? 1 : 0);
    const pool = cands.map((_, i) => i);
    picked = [];
    while (picked.length < n && pool.length) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ks = picked.filter((c) => cands[c][0] === i).map((c) => cands[c][1]).sort((p, q) => p - q);
    let from = a;
    for (const k of ks) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const h = CFG.breach / 2 / len;
      segs.push([from, lerp(a, b, k - h)]);
      openings.push(lerp(a, b, k));
      from = lerp(a, b, k + h);
    }
    segs.push([from, b]);
  }
  const mid = (p, q) => (p + q) / 2;
  const aftX = mid(-L / 2, bulk[0]);
  const rooms = [[aftX, 0]];
  for (const [x0, x1] of [[bulk[0], bulk[1]], [bulk[1], bulk[2]]]) {
    const cx = mid(x0, x1);
    const h = Math.min(-top(x0), -top(x1)) / 2;
    rooms.push([cx, -h], [cx, h]);
  }
  rooms.push([mid(bulk[2], L / 2), 0]);
  return buildRuin(world, x, y, angle, L, W, { hull, segs, openings, aft: [aftX, 0], rooms, breachCands: cands.length });
}

// Local layout → world: the walls, the hull outline the views fill, and the
// openings, aft spot and room centres, all turned and placed.
function buildRuin(world, x, y, angle, L, W, lay) {
  const c = Math.cos(angle), sn = Math.sin(angle);
  const toWorld = ([lx, ly]) => [x + lx * c - ly * sn, y + lx * sn + ly * c];
  let reach = 0;
  for (const [hx, hy] of lay.hull) reach = Math.max(reach, Math.hypot(hx, hy));
  const ruin = {
    x, y, angle, L, W,
    R: reach + CFG.wallHalf,
    hull: lay.hull.map(toWorld),
    walls: [],
    aft: toWorld(lay.aft), // mid aft compartment: the artifact's place
    openings: lay.openings.map(toWorld),
    rooms: lay.rooms.map(toWorld),
    breachCands: lay.breachCands || 0,
  };
  for (const [a, b] of lay.segs) {
    const [x0, y0] = toWorld(a);
    const [x1, y1] = toWorld(b);
    const w = { kind: "wall", x0, y0, x1, y1, t: CFG.wallHalf, ruin };
    ruin.walls.push(w);
    world.walls.push(w);
  }
  world.ruins.push(ruin);
  world.keepClear.push({ x, y, r: ruin.R + 20 });
  return ruin;
}

const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

// Segment a→b with a gap of `gap` centred at fraction k removed: two segments.
function cut(a, b, gap, k = 0.5) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const k0 = k - gap / 2 / L, k1 = k + gap / 2 / L;
  const at = (k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  return [[a, at(k0)], [at(k1), b]];
}

function placeObjective(world) {
  const { rng, size } = world;
  if (world.ruins.length) {
    const host = world.ruins[Math.floor(rng() * world.ruins.length)];
    world.artifact = { x: host.aft[0], y: host.aft[1], r: CFG.artifactR, carrier: null, ruin: host };
  } else {
    world.artifact = { x: size / 2, y: size / 2, r: CFG.artifactR, carrier: null, ruin: null };
  }
  const r = CFG.extractR;
  for (let tries = 0; tries < 400; tries++) {
    const x = rand(rng, r + 40, size - r - 40);
    const y = rand(rng, r + 40, size - r - 40);
    if (Math.hypot(x - world.start.x, y - world.start.y) < CFG.extractMinDist) continue;
    if (world.ruins.some((o) => Math.hypot(o.x - x, o.y - y) < o.R + r + 40)) continue;
    world.extract = { x, y, r };
    break;
  }
  // Fallback: the far corner, which always clears the distance on a 4000 map.
  if (!world.extract) world.extract = { x: size - world.start.x, y: size - world.start.y, r };
  world.keepClear.push({ x: world.extract.x, y: world.extract.y, r });
}

function tickObjective(world) {
  const art = world.artifact;
  if (art) {
    if (art.carrier && !art.carrier.alive) art.carrier = null; // dropped where they died (P9)
    if (art.carrier) {
      art.x = art.carrier.x;
      art.y = art.carrier.y;
    } else {
      for (const s of world.soldiers) {
        if (s.alive && Math.hypot(s.x - art.x, s.y - art.y) < s.r + art.r) {
          art.carrier = s;
          world.events.push({ type: "pickup", x: art.x, y: art.y });
          break;
        }
      }
    }
  }
  const living = world.soldiers.filter((s) => s.alive);
  if (!living.length) {
    world.end = { success: false };
    return;
  }
  const held = !art || (art.carrier && art.carrier.alive);
  const ex = world.extract;
  if (held && ex && living.some((s) => Math.hypot(s.x - ex.x, s.y - ex.y) < ex.r)) world.end = { success: true };
}

// ---- enemy construction + placement ---------------------------------------------
export function makeEnemy(world, type, x, y) {
  const T = ENEMY_TYPES[type];
  const rng = world.rng;
  return {
    kind: "enemy", type, team: "enemy",
    x, y, vx: 0, vy: 0, sx: 0, sy: 0,
    r: T.r, m: (T.r / CFG.soldierR) ** 2,
    hp: T.hp, maxHp: T.hp, alive: true,
    burn: null, slow: null, flash: 0, muzzle: 0,
    weapon: T.weapon || null, fireCd: 0,
    alert: false, target: null, los: false,
    senseT: rng() * CFG.senseEvery,
    tele: 0, // > 0 while winding up a shot
    cool: rand(rng, 0.5, 1.5), // until the next shot / mine
    contactCd: 0,
    heading: rng() * Math.PI * 2,
    orbitDir: rng() < 0.5 ? -1 : 1,
    age: 0, owner: null, mines: 0, fuse: 0,
    home: null, // a crewman's room: idle, it stays near it
    route: null, leg: 0, lost: 0, // a warden's patrol loop, and time out of sight
    burstLeft: 0, burstT: 0,
    ...(T.soldier ? trooperBody(world) : null),
  };
}

// The squad's body (makeSoldier's fields) for a trooper: rolled stats, HP by
// the squad's formula, unlimited spare magazines, and its own copy of a random
// LOADOUT gun with every effect amount scaled by trooperDamage (K3) — fire()
// hands rounds the weapon's own effects, so the scale lives in the copy.
function trooperBody(world) {
  const { rng } = world;
  const roll = ([lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));
  const stats = { aim: roll(CFG.trooperAim), health: roll(CFG.trooperHealth), speed: 5, nerve: 5 };
  const base = WEAPONS[LOADOUT[Math.floor(rng() * LOADOUT.length)]];
  const k = CFG.trooperDamage;
  const weapon = { ...base, effects: base.effects.map((fx) => ({ ...fx, ...(fx.amount != null && { amount: fx.amount * k }), ...(fx.dps != null && { dps: fx.dps * k }) })) };
  const hp = soldierMaxHp(stats);
  return {
    stats, hp, maxHp: hp, weapon,
    ammo: weapon.magazine, magsLeft: Infinity, reloading: 0,
    angle: -Math.PI / 2, dir: 1, aim: -Math.PI / 2, thrusting: false,
    boots: null, ground: null, gphi: 0, gv: 0, walkIn: 0, pushed: 0, stride: 0,
    color: ENEMY_TYPES.trooper.color, foe: null,
    mode: null, perch: null, lastPerch: null, left: null, skip: null,
    approachT: 0, repickT: 0, strollT: 0, think: false, wing: null,
  };
}

// A soldier body: a squad soldier or a trooper. Boots, walking and crash
// damage are the body's, whichever list it is in.
export const isBody = (a) => a.kind === "soldier" || a.type === "trooper";

function pickType(rng, mix = ENEMY_MIX) {
  let total = 0;
  for (const [, w] of mix) total += w;
  let k = rng() * total;
  for (const [type, w] of mix) if ((k -= w) < 0) return type;
  return mix[0][0];
}

// A type at a point: a swarmer is a pack spread around it.
function spawnGroup(world, type, x, y, alert) {
  const T = ENEMY_TYPES[type];
  const n = T.pack || 1;
  const dir = world.rng() < 0.5 ? -1 : 1;
  const wing = T.soldier && n > 1 ? { members: [], peeker: null } : null; // a trooper pair
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const e = makeEnemy(world, type, x + (n > 1 ? Math.cos(a) * 40 : 0), y + (n > 1 ? Math.sin(a) * 40 : 0));
    e.alert = alert;
    if (n > 1) e.orbitDir = dir; // a pack circles one way
    if (wing) { e.wing = wing; wing.members.push(e); }
    world.enemies.push(e);
  }
}

function freeSpot(world, x, y, r) {
  if (x < r || y < r || x > world.size - r || y > world.size - r) return false;
  if (world.asteroids.some((a) => Math.hypot(a.x - x, a.y - y) < a.r + r + 10)) return false;
  if (world.ruins.some((o) => Math.hypot(o.x - x, o.y - y) < o.R + r)) return false;
  return true;
}

function placeEnemies(world, count, elites) {
  const { rng, size } = world;
  // One gunner guards the hull that holds the artifact, just outside it.
  const host = world.artifact && world.artifact.ruin;
  if (host) {
    const a = rng() * Math.PI * 2;
    spawnGroup(world, "gunner", host.x + Math.cos(a) * (host.R + 60), host.y + Math.sin(a) * (host.R + 60), false);
  }
  let tries = 0;
  let placed = 0;
  while (placed < count && tries++ < count * 50) {
    const x = rand(rng, 80, size - 80);
    const y = rand(rng, 80, size - 80);
    if (Math.hypot(x - world.start.x, y - world.start.y) < CFG.enemyStartGap) continue;
    if (!freeSpot(world, x, y, 60)) continue;
    spawnGroup(world, pickType(rng), x, y, false);
    placed++;
  }
  placeCrews(world);
  for (let i = 0; i < elites; i++) placeWarden(world);
}

// Each derelict's crew: a group in each of a few rooms, held there while idle.
function placeCrews(world) {
  const { rng } = world;
  for (const r of world.ruins) {
    if (!r.rooms) continue;
    const rooms = r.rooms.slice();
    const n = Math.min(rooms.length, CFG.crewMin + Math.floor(rng() * (CFG.crewMax - CFG.crewMin + 1)));
    for (let i = 0; i < n; i++) {
      const [x, y] = rooms.splice(Math.floor(rng() * rooms.length), 1)[0];
      const from = world.enemies.length;
      spawnGroup(world, pickType(rng, CREW_MIX), x, y, false);
      for (let j = from; j < world.enemies.length; j++) world.enemies[j].home = { x, y };
    }
  }
}

// A warden and its loop: waypoints in open space away from the start, visited
// in order round the map's centre so the loop does not cross itself.
export function placeWarden(world) {
  const { rng, size } = world;
  const pts = [];
  for (let tries = 0; pts.length < CFG.patrolPoints && tries < 400; tries++) {
    const x = rand(rng, 300, size - 300);
    const y = rand(rng, 300, size - 300);
    if (Math.hypot(x - world.start.x, y - world.start.y) < CFG.patrolStartGap) continue;
    if (!freeSpot(world, x, y, 80)) continue;
    pts.push({ x, y });
  }
  if (pts.length < 2) return null;
  const c = size / 2;
  pts.sort((a, b) => Math.atan2(a.y - c, a.x - c) - Math.atan2(b.y - c, b.x - c));
  const leg = Math.floor(rng() * pts.length);
  const e = makeEnemy(world, "warden", pts[leg].x, pts[leg].y);
  e.route = pts;
  e.leg = (leg + 1) % pts.length;
  world.enemies.push(e);
  return e;
}

function squadCentre(world) {
  const living = world.soldiers.filter((s) => s.alive);
  if (!living.length) return null;
  let x = 0, y = 0;
  for (const s of living) { x += s.x; y += s.y; }
  return { x: x / living.length, y: y / living.length };
}

// A wave: offscreen, at a random bearing from the squad — any angle, not just
// the map edge. Bearings whose point the map clamps back toward the squad are
// rerolled.
export function spawnWave(world) {
  const c = squadCentre(world);
  if (!c) return;
  const alive = world.enemies.filter((e) => e.alive && e.type !== "mine").length;
  world.wave.n++;
  if (alive >= CFG.enemyCap) return;
  const { rng, size } = world;
  const count = CFG.waveBase + world.wave.n - 1;
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 16; tries++) {
      const a = rng() * Math.PI * 2;
      const d = rand(rng, CFG.waveDistMin, CFG.waveDistMax);
      const x = clamp(c.x + Math.cos(a) * d, 60, size - 60);
      const y = clamp(c.y + Math.sin(a) * d, 60, size - 60);
      if (Math.hypot(x - c.x, y - c.y) < CFG.waveDistMin * 0.85) continue;
      if (!freeSpot(world, x, y, 40)) continue;
      spawnGroup(world, pickType(rng), x, y, true);
      break;
    }
  }
  world.events.push({ type: "wave", n: world.wave.n });
}

// ---- enemy behaviour -------------------------------------------------------------
export function hasLos(world, ax, ay, bx, by) {
  for (const a of world.asteroids) if (segCircle(ax, ay, bx, by, a.x, a.y, a.r) !== null) return false;
  for (const w of world.walls) if (segWall(ax, ay, bx, by, w, 0) !== null) return false;
  return true;
}

function nearestSoldier(world, e) {
  let best = null, bd = Infinity;
  for (const s of world.soldiers) {
    if (!s.alive) continue;
    const d = Math.hypot(s.x - e.x, s.y - e.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// Obstacle avoidance: bend a desired velocity away from the rock or hull plate
// the body would reach within `look` seconds. Shared by enemies and the squad.
export function avoid(world, b, dvx, dvy, look = 0.7, ignore = null) {
  const sp = Math.hypot(dvx, dvy);
  if (!sp) return [dvx, dvy];
  const ux = dvx / sp, uy = dvy / sp;
  const reach = sp * look + b.r;
  let px = 0, py = 0;
  for (const a of world.asteroids) {
    if (a === ignore) continue;
    const rx = a.x - b.x, ry = a.y - b.y;
    const ahead = rx * ux + ry * uy;
    if (ahead <= 0 || ahead > reach + a.r) continue;
    const lat = rx * -uy + ry * ux; // signed: + is to the left of travel
    const clear = a.r + b.r + 16;
    if (Math.abs(lat) >= clear) continue;
    const k = (1 - Math.abs(lat) / clear) * (1 - ahead / (reach + a.r));
    const side = lat >= 0 ? -1 : 1; // steer to the side it is not on
    px += -uy * side * k;
    py += ux * side * k;
  }
  for (const r of world.ruins) {
    if (r === ignore || Math.hypot(r.x - b.x, r.y - b.y) > r.R + reach) continue;
    const fx = b.x + ux * Math.min(reach, sp * look * 0.5 + b.r);
    const fy = b.y + uy * Math.min(reach, sp * look * 0.5 + b.r);
    for (const w of r.walls) {
      const [cx, cy] = closestOnWall(w, fx, fy);
      const d = Math.hypot(fx - cx, fy - cy) || 0.001;
      const clear = b.r + w.t + 16;
      if (d >= clear) continue;
      const k = 1 - d / clear;
      px += ((fx - cx) / d) * k;
      py += ((fy - cy) / d) * k;
    }
  }
  if (!px && !py) return [dvx, dvy];
  const nx = ux + px * 2, ny = uy + py * 2;
  const n = Math.hypot(nx, ny) || 1;
  return [(nx / n) * sp, (ny / n) * sp];
}

// Direct thrust: accelerate toward a desired velocity (brakes too).
function steerTo(b, dvx, dvy, accel, dt) {
  const ex = dvx - b.vx, ey = dvy - b.vy;
  const e = Math.hypot(ex, ey);
  if (!e) return;
  const k = Math.min(1, (accel * dt) / e);
  b.vx += ex * k;
  b.vy += ey * k;
}

function updateEnemies(world, dt) {
  for (const e of world.enemies) {
    if (!e.alive || e.kind !== "enemy") continue;
    const T = ENEMY_TYPES[e.type];
    e.age += dt;
    if (e.contactCd > 0) e.contactCd -= dt;
    if (e.cool > 0) e.cool -= dt;

    if (e.type === "mine") { updateMine(world, e, T, dt); continue; }
    if (T.soldier) { updateTrooper(world, e, T, dt); continue; }

    if ((e.senseT -= dt) <= 0) {
      e.senseT = CFG.senseEvery;
      e.target = nearestSoldier(world, e);
      e.los = !!e.target && hasLos(world, e.x, e.y, e.target.x, e.target.y);
      if (!e.alert && e.target && e.los && Math.hypot(e.target.x - e.x, e.target.y - e.y) < (T.sight || CFG.alertRange)) e.alert = true;
    }
    // A warden that has lost sight of everyone long enough goes back on patrol.
    if (e.route && e.alert) {
      e.lost = e.los ? 0 : e.lost + dt;
      if (e.lost > T.giveUp) { e.alert = false; e.lost = 0; e.tele = 0; e.burstLeft = 0; }
    }
    const t = e.target && e.target.alive ? e.target : null;
    let dvx = 0, dvy = 0;
    if ((!e.alert || !t) && e.route) {
      // Patrol: fly the loop, waypoint to waypoint.
      const p = e.route[e.leg];
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < CFG.patrolReach) e.leg = (e.leg + 1) % e.route.length;
      dvx = (dx / d) * T.patrol;
      dvy = (dy / d) * T.patrol;
    } else if (!e.alert || !t) {
      // Idle: a slow drift on a wandering heading — back toward its room, for a crewman.
      e.heading += (world.rng() - 0.5) * dt;
      dvx = Math.cos(e.heading) * 25;
      dvy = Math.sin(e.heading) * 25;
      if (e.home) {
        const hx = e.home.x - e.x, hy = e.home.y - e.y;
        const hd = Math.hypot(hx, hy);
        if (hd > CFG.crewLeash) { dvx = (hx / hd) * 40; dvy = (hy / hd) * 40; }
      }
    } else {
      const dx = t.x - e.x, dy = t.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      if (e.type === "charger") {
        dvx = ux * T.speed; dvy = uy * T.speed;
      } else if (e.type === "gunner" || e.type === "warden") {
        const radial = d < T.keepMin ? -1 : d > T.keepMax ? 1 : 0;
        dvx = (ux * radial + -uy * e.orbitDir * 0.4) * T.speed;
        dvy = (uy * radial + ux * e.orbitDir * 0.4) * T.speed;
      } else if (e.type === "swarmer") {
        const pull = clamp((d - T.orbit) / 120, -1, 1);
        dvx = (-uy * e.orbitDir + ux * pull) * T.speed;
        dvy = (ux * e.orbitDir + uy * pull) * T.speed;
      } else if (e.type === "minelayer") {
        e.heading += (world.rng() - 0.5) * dt * 2;
        const away = d < T.keep ? -1 : 0;
        dvx = (Math.cos(e.heading) + ux * away * 2) * T.speed;
        dvy = (Math.sin(e.heading) + uy * away * 2) * T.speed;
      }
      shoot(world, e, T, t, dt);
    }
    [dvx, dvy] = avoid(world, e, dvx, dvy);
    steerTo(e, dvx, dvy, T.accel, dt);

    // Contact damage, runtime.js: once per contact cooldown (0.6s), per enemy.
    if (T.contact && e.contactCd <= 0) {
      for (const s of world.soldiers) {
        if (!s.alive || Math.hypot(s.x - e.x, s.y - e.y) >= s.r + e.r) continue;
        hurt(world, s, T.contact, e);
        e.contactCd = 0.6;
        break;
      }
    }
  }
}

// Telegraph, then fire aimed; only with line of sight. Mine-layers drop mines.
function shoot(world, e, T, t, dt) {
  if (e.type === "minelayer") {
    if (e.cool <= 0 && e.mines < T.maxMines) {
      const m = makeEnemy(world, "mine", e.x, e.y);
      m.vx = e.vx * 0.2; m.vy = e.vy * 0.2;
      m.owner = e;
      m.alert = true;
      e.mines++;
      world.enemies.push(m);
      e.cool = rand(world.rng, T.drop[0], T.drop[1]);
    }
    return;
  }
  if (!T.weapon) return;
  if (e.burstLeft > 0) {
    if ((e.burstT -= dt) <= 0) {
      e.fireCd = 0;
      fire(world, e, aimAt(e, T, t), 1);
      e.burstT = T.burstGap;
      if (--e.burstLeft === 0) e.cool = rand(world.rng, T.wait[0], T.wait[1]);
    }
    return;
  }
  if (e.tele > 0) {
    e.tele -= dt;
    if (e.tele <= 0) {
      e.fireCd = 0;
      fire(world, e, aimAt(e, T, t), 1);
      e.cool = rand(world.rng, T.wait[0], T.wait[1]);
      if (T.burst > 1) { e.burstLeft = T.burst - 1; e.burstT = T.burstGap; }
    }
    return;
  }
  if (e.cool <= 0 && e.los) e.tele = T.tele;
}

// Straight at the target, or — a type with `lead` — where it will be when the
// round gets there, if it holds its velocity (one refinement of the flight time).
function aimAt(e, T, t) {
  if (!T.lead) return Math.atan2(t.y - e.y, t.x - e.x);
  const sp = T.weapon.projectile.speed;
  let tt = Math.hypot(t.x - e.x, t.y - e.y) / sp;
  tt = Math.hypot(t.x + t.vx * tt - e.x, t.y + t.vy * tt - e.y) / sp;
  return Math.atan2(t.y + t.vy * tt - e.y, t.x + t.vx * tt - e.x);
}

// ---- troopers (tech/space-troopers.md) ---------------------------------------------
// A soldier body's brain: decides on the sensing cadence, acts every step, and
// only through what a player has — pilot (boots off), a turn, walk, the boots,
// reload and the trigger. It never sets its own position or velocity.
function updateTrooper(world, e, T, dt) {
  e.think = false;
  if ((e.senseT -= dt) <= 0) {
    e.senseT = CFG.senseEvery;
    e.think = true;
    e.target = nearestSoldier(world, e);
    e.los = !!e.target && hasLos(world, e.x, e.y, e.target.x, e.target.y);
    if (!e.alert && e.target && e.los && Math.hypot(e.target.x - e.x, e.target.y - e.y) < CFG.alertRange) e.alert = true;
  }
  const mate = partnerOf(e);
  if (e.alert && mate && !mate.alert) mate.alert = true; // a pair alerts together
  const t = e.alert && e.target && e.target.alive ? e.target : null;
  e.foe = t;
  e.mayShoot = true;

  if (e.boots === "ground") trooperGrounded(world, e, T, t, dt);
  else if (e.boots === "air") {
    // The boots have it: no jetpack, feet to the surface, and the pull lands it.
    const p = e.perch || e.lastPerch;
    if (p) {
      const s = perchInfo(e, p);
      turnTo(e, feetAngle(e, -s.nx, -s.ny), dt);
    } else e.thrusting = false;
  } else trooperFlying(world, e, T, t, dt);

  if (t) trooperTrigger(world, e, T, t, dt);
  else { e.tele = 0; e.burstLeft = 0; }
  bootsPull(e, dt);
}

const partnerOf = (e) => (e.wing ? e.wing.members.find((o) => o !== e && o.alive) || null : null);
const perchOf = (g) => (g.kind === "wall" ? g.ruin : g);
// A gun's reach: how far its round flies.
const reachOf = (e) => e.weapon.projectile.speed * e.weapon.projectile.life;
// The far end of the range band it wants to peek from (K6).
const bandMax = (e) => Math.min(ENEMY_TYPES.trooper.band[1], reachOf(e) * 0.85);

// Where a perch (a rock, or a ruin) is from a body: the gap from its surface
// to the body's edge, the outward normal there, and the surface's velocity.
function perchInfo(e, p) {
  if (p.kind === "asteroid") {
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    return { gap: d - p.r - e.r, nx: dx / d, ny: dy / d, vx: p.vx, vy: p.vy };
  }
  let bd = Infinity, nx = 0, ny = -1;
  for (const w of p.walls) {
    const [cx, cy] = closestOnWall(w, e.x, e.y);
    const d = Math.hypot(e.x - cx, e.y - cy);
    if (d < bd) { bd = d; nx = (e.x - cx) / (d || 1); ny = (e.y - cy) / (d || 1); }
  }
  return { gap: bd - CFG.wallHalf - e.r, nx, ny, vx: 0, vy: 0 };
}

// How far a target is from the nearest place on a perch (its near side).
function peekDist(p, t) {
  if (p.kind === "asteroid") return Math.hypot(t.x - p.x, t.y - p.y) - p.r;
  let bd = Infinity;
  for (const w of p.walls) bd = Math.min(bd, wallDist(w, t.x, t.y));
  return bd;
}

// A perch to fly to, or null. Idle: the nearest within idleSearch, near the
// partner. Alert: one whose near side is in the range band of the target,
// close to fly to, near the partner, and not the surface it just left.
function pickPerch(world, e, t) {
  const T = ENEMY_TYPES.trooper;
  const mate = partnerOf(e);
  const mp = mate && (mate.perch || (mate.boots === "ground" ? perchOf(mate.ground) : null));
  const hi = bandMax(e);
  const mid = (T.band[0] + hi) / 2;
  let best = null, bs = Infinity;
  const consider = (p) => {
    if (e.skip && e.skip.p === p && world.t < e.skip.until) return;
    if (mp === p && p.kind === "asteroid" && p.r < T.shareR) return; // the partner's alone
    const s = perchInfo(e, p);
    const flight = Math.max(0, s.gap);
    const lx = e.x - s.nx * flight, ly = e.y - s.ny * flight; // where it would land
    const fromMate = mate ? Math.hypot(lx - mate.x, ly - mate.y) : 0;
    let score;
    if (!t) {
      if (flight > T.idleSearch) return;
      score = flight + 0.5 * fromMate;
    } else {
      if (flight > T.perchSearch) return;
      const pd = peekDist(p, t);
      if (pd > hi) return;
      score = flight + 1.5 * Math.abs(pd - mid) + (fromMate > T.partnerGap ? 400 : 0) + (p === e.left ? 600 : 0);
    }
    if (score < bs) { bs = score; best = p; }
  };
  const reach = t ? T.perchSearch : T.idleSearch;
  for (const a of world.asteroids) {
    if (a.r >= T.perchMinR && Math.hypot(a.x - e.x, a.y - e.y) - a.r <= reach + e.r) consider(a);
  }
  for (const r of world.ruins) if (Math.hypot(r.x - e.x, r.y - e.y) - r.R <= reach) consider(r);
  return best;
}

// The facing that puts the feet along (fx, fy): see upOf.
const feetAngle = (s, fx, fy) => Math.atan2(fy, fx) - (s.dir * Math.PI) / 2;

// Turn without thrust, at the body's rate: A/D.
function turnTo(s, a, dt) {
  s.thrusting = false;
  const turn = CFG.turnRate * dt;
  s.angle += clamp(wrapAngle(a - s.angle), -turn, turn);
}

// pilot, with the wanted velocity capped at vMax (K5).
function pilotTo(e, dvx, dvy, dt) {
  const sp = Math.hypot(dvx, dvy);
  const cap = ENEMY_TYPES.trooper.vMax;
  if (sp > cap) { dvx *= cap / sp; dvy *= cap / sp; }
  pilot(e, dvx, dvy, dt);
}

function trooperGrounded(world, e, T, t, dt) {
  const here = perchOf(e.ground);
  e.perch = null;
  e.approachT = 0;
  e.lastPerch = here;
  if (!t) {
    // Idle: stand, and now and then stroll a little.
    if ((e.strollT -= dt) <= 0) {
      const moving = e.walkIn !== 0;
      e.strollT = moving ? rand(world.rng, 3, 6) : rand(world.rng, 0.5, 1.5);
      walk(e, moving ? 0 : world.rng() < 0.5 ? -1 : 1);
    }
    return;
  }
  walk(e, 0);
  // The target is out of range: go after it (K6).
  if (e.think && Math.hypot(t.x - e.x, t.y - e.y) > bandMax(e) * T.relocate) leavePerch(world, e, t, here);
}

// Boots off and away, to a new perch if one fits — else it floats and chases.
function leavePerch(world, e, t, here) {
  e.left = here;
  e.perch = pickPerch(world, e, t);
  e.approachT = 0;
  e.repickT = ENEMY_TYPES.trooper.repick;
  e.tele = 0;
  e.burstLeft = 0;
  walk(e, 0);
  bootsOff(e, world);
}

function trooperFlying(world, e, T, t, dt) {
  // A target on the run is chased: a perch ahead of it is gone by the time
  // the trooper lands.
  const running = t && Math.hypot(t.vx, t.vy) > T.chaseV;
  if (e.think) {
    if (e.perch && t && (running || peekDist(e.perch, t) > bandMax(e) * T.relocate)) e.perch = null; // the target moved on
    if (!e.perch && !running && (e.repickT -= CFG.senseEvery) <= 0) {
      e.repickT = T.repick;
      e.perch = pickPerch(world, e, t);
      e.approachT = 0;
    }
  }
  if (e.perch) {
    trooperApproach(world, e, T, dt);
    if ((e.approachT += dt) > T.approachMax) {
      e.skip = { p: e.perch, until: world.t + T.skipFor };
      e.perch = null;
    }
    return;
  }
  // No perch: hold the band round the target as a gunner does, or hang still.
  let dvx = 0, dvy = 0;
  if (t) {
    const dx = t.x - e.x, dy = t.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const radial = d < T.keep[0] ? -1 : d > T.keep[1] ? 1 : 0;
    dvx = (ux * radial - uy * e.orbitDir * 0.4) * T.floatSpeed;
    dvy = (uy * radial + ux * e.orbitDir * 0.4) * T.floatSpeed;
    if (d > T.keep[1] * 2) { dvx = ux * T.vMax; dvy = uy * T.vMax; } // run after it
    dvx += t.vx; dvy += t.vy;
  }
  [dvx, dvy] = avoid(world, e, dvx, dvy);
  pilotTo(e, dvx, dvy, dt);
}

// Fly in, turn feet-first, coast, clamp on. The body pushes only along its
// facing and its feet are a quarter turn from it, so the closing speed has to
// be low before it turns: the profile brakes against a gap looked ahead by
// lookAhead seconds of closing, which pays for turning round to brake.
function trooperApproach(world, e, T, dt) {
  const s = perchInfo(e, e.perch);
  const closing = -((e.vx - s.vx) * s.nx + (e.vy - s.vy) * s.ny);
  if (s.gap <= T.coastGap && (closing >= T.stall || s.gap <= CFG.bootsReach)) {
    turnTo(e, feetAngle(e, -s.nx, -s.ny), dt);
    if (s.gap <= CFG.bootsReach && surfaceInWedge(world, e, CFG.bootsReach)) toggleBoots(world, e);
    return;
  }
  const look = s.gap - Math.max(0, closing) * T.lookAhead;
  const vc = clamp(T.vLand + Math.sqrt(2 * T.brake * Math.max(0, look - T.coastGap)), T.vLand, T.vMax);
  let dvx = s.vx - s.nx * vc, dvy = s.vy - s.ny * vc;
  [dvx, dvy] = avoid(world, e, dvx, dvy, 0.7, e.perch);
  pilotTo(e, dvx, dvy, dt);
}

// Telegraph, then a burst at the gun's own fire rate, led, with the trooper's
// Aim. Only with a line of sight and in reach.
function trooperTrigger(world, e, T, t, dt) {
  const sp = e.weapon.projectile.speed;
  let tt = Math.hypot(t.x - e.x, t.y - e.y) / sp;
  tt = Math.hypot(t.x + t.vx * tt - e.x, t.y + t.vy * tt - e.y) / sp;
  e.aim = Math.atan2(t.y + t.vy * tt - e.y, t.x + t.vx * tt - e.x);
  if (e.reloading > 0) return;
  if (e.ammo <= 0) { startReload(e, world); e.tele = 0; e.burstLeft = 0; return; }
  const wait = () => rand(world.rng, T.wait[0], T.wait[1]);
  if (e.burstLeft > 0) {
    if (e.fireCd > 0) return;
    if (!hasLos(world, e.x, e.y, t.x, t.y)) { e.burstLeft = 0; e.cool = wait(); return; }
    if (fire(world, e, e.aim, aimAccuracy(e.stats.aim)) && --e.burstLeft === 0) e.cool = wait();
    return;
  }
  if (e.tele > 0) {
    if ((e.tele -= dt) <= 0) {
      e.tele = 0;
      const [lo, hi] = T.burstAuto;
      e.burstLeft = e.weapon.auto ? lo + Math.floor(world.rng() * (hi - lo + 1)) : 1;
    }
    return;
  }
  if (e.cool <= 0 && e.mayShoot && e.los && Math.hypot(t.x - e.x, t.y - e.y) <= reachOf(e) * 0.95) e.tele = T.tele;
}

function updateMine(world, m, T, dt) {
  if (m.age > T.life) { m.alive = false; releaseMine(m); return; }
  if (m.fuse > 0) {
    m.fuse -= dt;
    if (m.fuse <= 0) {
      m.alive = false;
      releaseMine(m);
      explode(world, T.blast, m.x, m.y, "enemy", m);
    }
    return;
  }
  if (m.age < T.arm) return;
  for (const s of world.soldiers) {
    if (s.alive && Math.hypot(s.x - m.x, s.y - m.y) < T.trigger) { m.fuse = T.fuse; world.events.push({ type: "fuse", x: m.x, y: m.y }); break; }
  }
}

function releaseMine(m) {
  if (m.owner) m.owner.mines = Math.max(0, m.owner.mines - 1);
  m.owner = null;
}

// ---- squad -----------------------------------------------------------------------
// Control moves to the next living soldier (Tab/K, and on the leader's death).
export function swapControl(world) {
  const n = world.soldiers.length;
  for (let k = 1; k <= n; k++) {
    const i = (world.ctrl + k) % n;
    if (world.soldiers[i].alive) {
      world.ctrl = i;
      return true;
    }
  }
  return false;
}

function updateSquad(world, dt) {
  const lead = controlled(world);
  for (const s of world.soldiers) {
    if (s.alive && s !== lead) companion(world, s, lead, dt);
  }
}

// A companion on the SAME rotate-and-thrust body the player flies: it wants a
// velocity (match the leader, close on its station, bend around obstacles) and
// can only get it by turning toward the difference and firing the pack.
function companion(world, s, lead, dt) {
  let dvx = 0, dvy = 0;
  if (lead) {
    const px = lead.x + Math.cos(s.station.a) * s.station.d;
    const py = lead.y + Math.sin(s.station.a) * s.station.d;
    const ex = px - s.x, ey = py - s.y;
    const d = Math.hypot(ex, ey) || 1;
    const close = Math.min(CFG.stationClose, d * CFG.stationGain);
    dvx = lead.vx + (ex / d) * close;
    dvy = lead.vy + (ey / d) * close;
  }
  [dvx, dvy] = avoid(world, s, dvx, dvy);
  pilot(s, dvx, dvy, dt);

  // Guns: aim is independent of facing, as the game's companions do.
  if (s.weapon.magazine && s.ammo <= 0 && !(s.reloading > 0)) startReload(s, world); // autoReload, ai.js
  if ((s.senseT = (s.senseT || 0) - dt) <= 0) {
    s.senseT = CFG.senseEvery;
    s.foe = pickFoe(world, s);
  }
  const f = s.foe && s.foe.alive ? s.foe : null;
  if (f) {
    s.aim = Math.atan2(f.y - s.y, f.x - s.x);
    fire(world, s, s.aim, aimAccuracy(s.stats.aim));
  }
}

// Nearest living enemy in reach with a clear line.
function pickFoe(world, s) {
  const p = s.weapon.projectile;
  const reach = Math.min(CFG.companionRange, p.speed * p.life * 0.9);
  let best = null, bd = Infinity;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - s.x, e.y - s.y);
    if (d > reach || d >= bd) continue;
    if (!hasLos(world, s.x, s.y, e.x, e.y)) continue;
    bd = d;
    best = e;
  }
  return best;
}

// Rotate-and-thrust toward a velocity change: turn at the body's rate, and
// fire the pack only when roughly pointed the right way. Braking is turning
// around.
export function pilot(s, dvx, dvy, dt) {
  const ex = dvx - s.vx, ey = dvy - s.vy;
  const e = Math.hypot(ex, ey);
  s.thrusting = false;
  if (e < 12) return;
  const want = Math.atan2(ey, ex);
  const turn = CFG.turnRate * dt;
  s.angle += clamp(wrapAngle(want - s.angle), -turn, turn);
  if (Math.abs(wrapAngle(want - s.angle)) < 0.35) {
    s.thrusting = true;
    thrust(s, Math.min(CFG.thrust, e / dt), dt);
  }
}

// Which way is up for a soldier: facing turned a quarter, on the side `dir`
// says. A spin turns facing and up together, rigidly — a floating soldier can
// be upside down (Bo: no mirroring). Only turning round to walk the other way
// on a surface flips dir (tech/space-magboots.md M0).
export function upOf(s) {
  return [s.dir * Math.sin(s.angle), -s.dir * Math.cos(s.angle)];
}

// The feet: the collision circle's edge, straight down from the centre.
export function feetOf(s) {
  const [ux, uy] = upOf(s);
  return [s.x - ux * s.r, s.y - uy * s.r];
}

function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export const controlled = (world) => {
  const s = world.soldiers[world.ctrl];
  return s && s.alive ? s : null;
};

// ---- step ------------------------------------------------------------------
// `input`: { turn: -1..1, thrust: bool, aimX, aimY, fire, firePress (the
// mouse), space, spacePress, boots (Shift), reload, swap } — presses already
// latched by the caller, so an edge never falls between two steps.
export function step(world, input = {}) {
  const dt = CFG.step;
  world.t += dt;
  if (world.events.length > 256) world.events.splice(0, world.events.length - 256);

  if (input.swap && !world.end) swapControl(world);
  const s = world.end ? null : controlled(world);
  // Only the soldier you fly wears boots: swapping away switches them off.
  for (const o of world.soldiers) if (o.boots && o !== s) bootsOff(o, world);
  if (s) {
    if (input.boots) toggleBoots(world, s);
    if (s.boots === "ground" && input.spacePress) jump(world, s);
    drive(s, input, dt);
    if (input.reload) startReload(s, world);
    // Semi-auto takes the press, auto the hold — as the mission does. Space
    // fires only while floating; with the boots on it is jump, and the mouse
    // is the trigger.
    const want = s.weapon.auto ? input.fire || (!s.boots && input.space) : input.firePress || (!s.boots && input.spacePress);
    if (want) fire(world, s, s.aim, aimAccuracy(s.stats.aim));
  }
  if (!world.end) updateSquad(world, dt);
  updateEnemies(world, dt);
  if (!world.end && (world.wave.t -= dt) <= 0) {
    world.wave.t = CFG.waveEvery;
    spawnWave(world);
  }
  tickActors(world, dt);
  integrate(world, dt);
  settleBoots(world, dt);
  updateProjectiles(world, dt);
  if (!world.end) tickObjective(world);
}

// Rotate-and-thrust: turn at a fixed rate, push along facing. Aim is the
// mouse, independent of facing.
export function drive(s, input, dt) {
  const k = Math.sign(input.turn || 0);
  s.walkIn = 0;
  if (s.boots === "ground") {
    // A/D walk, and facing is the walk direction. Turning round is the one
    // thing that flips dir: facing reverses and up stays (see upOf).
    walk(s, k);
  } else s.angle += (input.turn || 0) * CFG.turnRate * dt;
  // The jetpack does nothing with the boots on.
  s.thrusting = !!input.thrust && !s.boots;
  // Aim follows the mouse, in any direction (Bo, 2026-09-30: no arc).
  if (input.aimX != null) s.aim = Math.atan2(input.aimY - s.y, input.aimX - s.x);
  if (s.thrusting) thrust(s, CFG.thrust, dt);
  bootsPull(s, dt);
}

// Walk a standing body: -1, 0 or 1 along the surface. Turning round is the
// one thing that flips dir: facing reverses and up stays (see upOf).
export function walk(s, k) {
  if (k && k !== s.dir) {
    s.dir = k;
    s.angle += Math.PI;
  }
  s.walkIn = k;
}

// In the air with the boots on, gravity pulls along the feet (B1).
function bootsPull(s, dt) {
  if (s.boots !== "air") return;
  const [ux, uy] = upOf(s);
  s.vx -= ux * CFG.gravity * dt;
  s.vy -= uy * CFG.gravity * dt;
}

// Thrust adds along facing for as long as it is held: no speed cap (Bo,
// 2026-09-30) and no drag, ever.
export function thrust(b, accel, dt, angle = b.angle) {
  b.vx += Math.cos(angle) * accel * dt;
  b.vy += Math.sin(angle) * accel * dt;
}

// ---- magnetic boots (tech/space-magboots.md) ------------------------------------
// The feet wedge: ±bootsWedge about down, from the body's centre. For each rock,
// its nearest point inside the wedge — along the centre line if that is inside,
// else the nearer edge ray's first hit — measured from the feet. A ruin wall's
// segment is clipped to the wedge exactly, and its nearest point to the feet,
// less the plate's half-thickness, is the distance. Returns the nearest rock or
// wall within `range` of the feet, or null.
export function surfaceInWedge(world, s, range) {
  const [ux, uy] = upOf(s);
  const dx = -ux, dy = -uy;
  const fx = s.x + dx * s.r, fy = s.y + dy * s.r;
  const reach = s.r + range;
  const cosW = Math.cos(CFG.bootsWedge), sinW = Math.sin(CFG.bootsWedge);
  let best = null, bd = Infinity;
  for (const a of world.asteroids) {
    const rx = a.x - s.x, ry = a.y - s.y;
    const rd = Math.hypot(rx, ry);
    if (rd - a.r > reach || rd <= a.r) continue;
    let px, py;
    if (rx * dx + ry * dy >= cosW * rd) {
      px = a.x - (rx / rd) * a.r;
      py = a.y - (ry / rd) * a.r;
    } else {
      let bt = Infinity;
      for (const sg of [-1, 1]) {
        const ex = dx * cosW - dy * sinW * sg, ey = dx * sinW * sg + dy * cosW;
        const t = segCircle(s.x, s.y, s.x + ex * reach, s.y + ey * reach, a.x, a.y, a.r);
        if (t !== null && t < bt) {
          bt = t;
          px = s.x + ex * reach * t;
          py = s.y + ey * reach * t;
        }
      }
      if (bt === Infinity) continue;
    }
    const d = Math.hypot(px - fx, py - fy);
    if (d <= range && d < bd) {
      bd = d;
      best = a;
    }
  }
  for (const r of world.ruins) {
    if (Math.hypot(r.x - s.x, r.y - s.y) > r.R + reach) continue;
    for (const w of r.walls) {
      const k = clipToWedge(s.x, s.y, dx, dy, w);
      if (!k) continue;
      const ex = w.x1 - w.x0, ey = w.y1 - w.y0;
      const t = clamp(((fx - w.x0) * ex + (fy - w.y0) * ey) / (ex * ex + ey * ey || 1), k[0], k[1]);
      const d = Math.hypot(w.x0 + ex * t - fx, w.y0 + ey * t - fy) - w.t;
      if (d <= range && d < bd) {
        bd = d;
        best = w;
      }
    }
  }
  return best;
}

// The part of wall w's segment inside the wedge at (cx, cy) about (dx, dy), as
// [t0, t1] along it, or null. The 90° wedge is exactly the two half-planes
// bounded by its edge rays' lines, each on the side where down is.
function clipToWedge(cx, cy, dx, dy, w) {
  const cosW = Math.cos(CFG.bootsWedge), sinW = Math.sin(CFG.bootsWedge);
  const ex = w.x1 - w.x0, ey = w.y1 - w.y0;
  let t0 = 0, t1 = 1;
  for (const sg of [-1, 1]) {
    const rx = dx * cosW - dy * sinW * sg, ry = dx * sinW * sg + dy * cosW;
    let mx = -ry, my = rx;
    if (mx * dx + my * dy < 0) { mx = -mx; my = -my; }
    const f0 = mx * (w.x0 - cx) + my * (w.y0 - cy);
    const df = mx * ex + my * ey;
    if (df === 0) {
      if (f0 < 0) return null;
      continue;
    }
    if (df > 0) t0 = Math.max(t0, -f0 / df);
    else t1 = Math.min(t1, -f0 / df);
  }
  return t0 <= t1 ? [t0, t1] : null;
}

// For the HUD (B6): "on", "ready" (Shift would work) or null.
export function bootsState(world, s) {
  if (!s || !s.alive) return null;
  if (s.boots) return "on";
  return surfaceInWedge(world, s, CFG.bootsReach) ? "ready" : null;
}

function toggleBoots(world, s) {
  if (s.boots) bootsOff(s, world);
  else if (surfaceInWedge(world, s, CFG.bootsReach)) {
    s.boots = "air";
    world.events.push({ type: "boots", on: true, x: s.x, y: s.y });
  }
}

// Back to floating, with whatever world velocity it had. `world` is for the
// sound; a death switches them off silently.
function bootsOff(s, world = null) {
  if (world && s.boots) world.events.push({ type: "boots", on: false, x: s.x, y: s.y });
  s.boots = null;
  s.ground = null;
  s.gv = 0;
  s.walkIn = 0;
}

function jump(world, s) {
  const [ux, uy] = upOf(s);
  s.boots = "air";
  s.ground = null;
  s.vx += ux * CFG.jumpSpeed;
  s.vy += uy * CFG.jumpSpeed;
  world.events.push({ type: "jump", x: s.x, y: s.y });
}

// Grounded, on a rock or a wall: the landing sound carries how hard.
function landOn(world, s, g, nx, ny, speed) {
  s.boots = "ground";
  s.ground = g;
  s.gv = 0;
  s.pushed = 0;
  s.stride = 0;
  standOn(s, nx, ny);
  world.events.push({ type: "land", x: s.x, y: s.y, speed });
}

// The velocity of a rock's surface (drift + spin) at a world point.
function surfaceVel(a, x, y) {
  return [a.vx - a.spin * (y - a.y), a.vy + a.spin * (x - a.x)];
}

// Up along the surface normal, keeping dir: facing is where that puts it.
function standOn(s, nx, ny) {
  s.angle = Math.atan2(s.dir * nx, -s.dir * ny);
}

// A booted soldier against a rock: the boots' own contact, never `collide`.
// One-sided: it is pushed out and loses what it had into the surface, no bounce,
// and the rock gets no impulse (answer 4). Feet-first within the wedge lands.
function bootContact(world, s, a) {
  if (s.ground === a) return;
  const dx = s.x - a.x, dy = s.y - a.y;
  const min = s.r + a.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2) || 0.0001;
  const nx = dx / d, ny = dy / d;
  s.x += nx * (min - d);
  s.y += ny * (min - d);
  const [svx, svy] = surfaceVel(a, s.x, s.y);
  if (s.boots === "ground") {
    // Standing, a rock that runs into you still hits you.
    s.pushed += min - d;
    crash(world, s, -((s.vx - svx) * nx + (s.vy - svy) * ny));
    return;
  }
  foldShove(s);
  const vn = (s.vx - svx) * nx + (s.vy - svy) * ny;
  const [ux, uy] = upOf(s);
  const lands = nx * ux + ny * uy >= Math.cos(CFG.bootsWedge);
  crash(world, s, -vn, lands ? CFG.landSafe : CFG.crashSafe);
  if (vn < 0) {
    s.vx -= vn * nx;
    s.vy -= vn * ny;
  }
  if (lands) {
    landOn(world, s, a, nx, ny, Math.max(0, -vn));
    s.gphi = Math.atan2(ny, nx) - a.rot;
    [s.vx, s.vy] = surfaceVel(a, s.x, s.y);
  }
}

// The same against a hull plate. Walls do not move, so there is no impulse
// question; a soldier standing on this ruin is placed by walkWalls instead.
function bootWall(world, s, w) {
  if (s.boots === "ground" && s.ground.kind === "wall" && s.ground.ruin === w.ruin) return;
  const [cx, cy] = closestOnWall(w, s.x, s.y);
  const dx = s.x - cx, dy = s.y - cy;
  const min = s.r + w.t;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2) || 0.0001;
  const nx = dx / d, ny = dy / d;
  s.x += nx * (min - d);
  s.y += ny * (min - d);
  if (s.boots === "ground") {
    s.pushed += min - d;
    return;
  }
  foldShove(s);
  const vn = s.vx * nx + s.vy * ny;
  const [ux, uy] = upOf(s);
  const lands = nx * ux + ny * uy >= Math.cos(CFG.bootsWedge);
  crash(world, s, -vn, lands ? CFG.landSafe : CFG.crashSafe);
  if (vn < 0) {
    s.vx -= vn * nx;
    s.vy -= vn * ny;
  }
  if (lands) {
    landOn(world, s, w, nx, ny, Math.max(0, -vn));
    s.vx = s.vy = 0;
  }
}

// Standing on a ruin: its walkable surface is the edge of the union of its
// wall capsules, and the body's centre rides r + t (24px) off it. Walk in
// steps of at most 2px so a plate's rounded end is followed as an arc. Each
// step snaps: onto the nearest wall, then out of any other it lies in until
// clear. The ground is then, of the walls it touches, the one most against the
// move — at an inside corner that is the next wall, which is how up turns
// from one to the other — else the one it was on.
function walkWalls(s, dist) {
  const walls = s.ground.ruin.walls;
  const R = s.r + CFG.wallHalf;
  const n = Math.max(1, Math.ceil(Math.abs(dist) / 2));
  let [nx, ny] = wallNormal(s.ground, s.x, s.y);
  for (let k = 0; k <= n; k++) {
    let tx = 0, ty = 0;
    if (k > 0) {
      tx = -ny * Math.sign(dist);
      ty = nx * Math.sign(dist);
      s.x += tx * Math.abs(dist / n);
      s.y += ty * Math.abs(dist / n);
    }
    let w = s.ground;
    let bd = wallDist(w, s.x, s.y);
    for (const o of walls) {
      const d = wallDist(o, s.x, s.y);
      if (d < bd - 1e-6) { bd = d; w = o; }
    }
    placeOff(s, w, R);
    for (let it = 0; it < 32; it++) {
      let hit = null;
      for (const o of walls) if (wallDist(o, s.x, s.y) < R - 1e-9) { hit = o; break; }
      if (!hit) break;
      placeOff(s, hit, R);
    }
    let g = null, against = Infinity;
    for (const o of walls) {
      if (wallDist(o, s.x, s.y) > R + 1e-6) continue;
      const [ox, oy] = wallNormal(o, s.x, s.y);
      const d = ox * tx + oy * ty;
      if (d < against - 1e-9 || (d < against + 1e-9 && o === s.ground)) { against = d; g = o; }
    }
    s.ground = g || w;
    [nx, ny] = wallNormal(s.ground, s.x, s.y);
  }
  return [nx, ny];
}

function wallDist(w, x, y) {
  const [cx, cy] = closestOnWall(w, x, y);
  return Math.hypot(x - cx, y - cy);
}

function wallNormal(w, x, y) {
  const [cx, cy] = closestOnWall(w, x, y);
  const d = Math.hypot(x - cx, y - cy) || 1;
  return [(x - cx) / d, (y - cy) / d];
}

// Put the body's centre R off wall w, straight out from where it is.
function placeOff(s, w, R) {
  const [cx, cy] = closestOnWall(w, s.x, s.y);
  const [nx, ny] = wallNormal(w, s.x, s.y);
  s.x = cx + nx * R;
  s.y = cy + ny * R;
}

// After integrate has moved the rocks: a standing soldier is carried by its
// rock, walks, and is snapped feet-on-surface; one in the air must still have a
// surface in the wedge within the hold range.
function settleBoots(world, dt) {
  for (const s of [...world.soldiers, ...world.enemies]) {
    if (!s.alive || !s.boots) continue;
    if (s.boots === "air") {
      if (!surfaceInWedge(world, s, CFG.bootsHold)) bootsOff(s, world);
      continue;
    }
    // Knocked off: a shove, or a push past the snap tolerance. It keeps the
    // world velocity it had and falls back under its own boots.
    if (s.pushed > CFG.snapTol || s.sx || s.sy) {
      s.boots = "air";
      s.ground = null;
      s.pushed = 0;
      continue;
    }
    s.pushed = 0;
    const g = s.ground;
    const target = s.walkIn * CFG.walkSpeed;
    const rate = (s.walkIn ? CFG.walkAccel : CFG.walkFriction) * dt;
    s.gv += clamp(target - s.gv, -rate, rate);
    const before = Math.floor(s.stride / CFG.footstep);
    s.stride += Math.abs(s.gv) * dt;
    if (Math.floor(s.stride / CFG.footstep) > before) world.events.push({ type: "step", x: s.x, y: s.y });
    if (g.kind === "wall") {
      const [nx, ny] = walkWalls(s, s.gv * dt);
      standOn(s, nx, ny);
      s.vx = -ny * s.gv;
      s.vy = nx * s.gv;
      continue;
    }
    const R = g.r + s.r;
    s.gphi += (s.gv * dt) / R;
    const th = g.rot + s.gphi;
    const nx = Math.cos(th), ny = Math.sin(th);
    s.x = g.x + nx * R;
    s.y = g.y + ny * R;
    standOn(s, nx, ny);
    // The true world velocity: companions match it and a jump inherits it.
    const [svx, svy] = surfaceVel(g, s.x, s.y);
    s.vx = svx - ny * s.gv;
    s.vy = svy + nx * s.gv;
  }
}

// ---- per-actor ticks: cooldowns, reload, status, shove, respawn ------------
function tickActors(world, dt) {
  for (const a of [...world.soldiers, ...world.enemies]) {
    if (!a.alive) {
      if (a.kind === "dummy" && (a.respawn -= dt) <= 0) {
        Object.assign(a, makeDummy(a.homeX, a.homeY));
      }
      continue;
    }
    if (a.fireCd > 0) a.fireCd -= dt;
    if (a.flash > 0) a.flash -= dt;
    if (a.muzzle > 0) a.muzzle -= dt;
    tickReload(a, dt, world);
    // Status ticks, src/mission/combat.js: burn damages, slow expires.
    if (a.burn) {
      const burn = a.burn;
      hurt(world, a, burn.dps * dt, a.burnOwner, true);
      burn.time -= dt;
      if (burn.time <= 0 && a.burn === burn) a.burn = null;
    }
    if (a.slow) {
      a.slow.time -= dt;
      if (a.slow.time <= 0) a.slow = null;
    }
    decayShove(a, dt);
  }
}

// startReload / tickReload, src/mission/entities.js.
export function startReload(a, world) {
  const w = a.weapon;
  if (!w || !w.magazine) return false;
  if (a.reloading > 0 || a.ammo >= w.magazine) return false;
  if (a.magsLeft !== undefined && a.magsLeft <= 0) return false;
  a.reloading = w.reloadTime || 1.5;
  if (world) world.events.push({ type: "reload", x: a.x, y: a.y });
  return true;
}

function tickReload(a, dt, world) {
  if (!(a.reloading > 0)) return;
  a.reloading -= dt;
  if (a.reloading <= 0) {
    a.reloading = 0;
    world.events.push({ type: "reloaded", x: a.x, y: a.y });
    a.ammo = a.weapon.magazine;
    if (a.magsLeft !== undefined && a.magsLeft !== Infinity) a.magsLeft -= 1;
  }
}

// Knockback: shoveActor/decayShove, src/mission/entities.js. The upward lift is
// dropped (no "up"), and the decay is on the shove's magnitude so a diagonal
// shove keeps its direction as it bleeds.
export function shove(t, vx, vy) {
  const m = Math.sqrt(Math.max(0.05, t.m));
  t.sx = (t.sx || 0) + vx / m;
  t.sy = (t.sy || 0) + vy / m;
}

function decayShove(a, dt) {
  const mag = Math.hypot(a.sx || 0, a.sy || 0);
  if (!mag) return;
  const drop = CFG.knockbackDecay * dt;
  if (mag <= drop) a.sx = a.sy = 0;
  else {
    a.sx *= (mag - drop) / mag;
    a.sy *= (mag - drop) / mag;
  }
}

// ---- damage ----------------------------------------------------------------
export function hurt(world, t, amount, owner, quiet = false) {
  if (!t.alive || !(amount > 0)) return;
  t.hp -= amount;
  if (t.kind === "enemy") t.alert = true;
  if (t.kind === "soldier" && !quiet) world.events.push({ type: "hurt", x: t.x, y: t.y });
  if (!quiet) t.flash = 0.12;
  if (t.hp <= 0) kill(world, t, owner);
}

function kill(world, t) {
  t.alive = false;
  t.hp = 0;
  t.burn = t.slow = null;
  if (isBody(t)) bootsOff(t);
  const color = t.color || (t.type && ENEMY_TYPES[t.type].color);
  world.events.push({ type: "death", x: t.x, y: t.y, r: t.r, kind: t.kind, enemy: t.type, color });
  if (t.kind === "dummy") t.respawn = CFG.dummyRespawn;
  // The controlled soldier died: control passes on, as mission.js does.
  if (t.kind === "soldier" && world.soldiers[world.ctrl] === t) swapControl(world);
  if (t.type === "mine") releaseMine(t);
  // Prune long-dead enemies so the list does not grow for the whole mission.
  if (t.kind === "enemy" && world.enemies.length > 80) world.enemies = world.enemies.filter((e) => e.alive || e === t);
}

const opponentsOf = (world, team) => (team === "player" ? world.enemies : world.soldiers);

// ---- firing (fire(), src/mission/ai.js) ------------------------------------
export function fire(world, shooter, angle, accuracy = 1) {
  if (shooter.fireCd > 0) return false;
  if (shooter.reloading > 0) return false;
  if (shooter.ammo !== undefined && shooter.ammo <= 0) {
    world.events.push({ type: "dry", x: shooter.x, y: shooter.y });
    return false;
  }
  const w = shooter.weapon;
  shooter.fireCd = 1 / w.fireRate;
  if (w.magazine && shooter.ammo !== Infinity) shooter.ammo -= 1;

  const pellets = w.effects.find((e) => e.kind === "pellets");
  const count = pellets ? Math.max(1, pellets.count || 1) : 1;
  const arc = pellets ? pellets.spread ?? 0.12 : 0;
  const spread = (w.spread || 0) + (1 - accuracy) * CFG.aimSpread + arc;
  const spec = w.projectile;
  for (let i = 0; i < count; i++) {
    const a = spread ? angle + (world.rng() * 2 - 1) * spread : angle;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const pierce = w.effects.find((e) => e.kind === "pierce");
    world.projectiles.push({
      x: shooter.x + dx * (shooter.r + 6),
      y: shooter.y + dy * (shooter.r + 6),
      vx: dx * spec.speed,
      vy: dy * spec.speed,
      r: Math.max(2, Math.min(spec.w, spec.h) / 2),
      w: spec.w, h: spec.h,
      color: spec.color,
      shape: spec.shape,
      life: spec.life,
      team: shooter.team,
      owner: shooter,
      effects: w.effects,
      pierceLeft: pierce ? pierce.count || 0 : 0,
      hit: null,
      dead: false,
    });
  }
  shooter.muzzle = 0.055;
  world.events.push({ type: "muzzle", x: shooter.x + Math.cos(angle) * (shooter.r + 14), y: shooter.y + Math.sin(angle) * (shooter.r + 14), color: spec.color, shape: spec.shape, team: shooter.team, pellets: count > 1 });
  return true;
}

// ---- projectiles (updateProjectiles, src/mission/combat.js) ----------------
// Swept: each step a round is a segment, and the EARLIEST thing along it wins.
function updateProjectiles(world, dt) {
  for (const p of world.projectiles) {
    if (p.dead) continue;
    steerHoming(world, p, dt);
    const x0 = p.x, y0 = p.y;
    const x1 = x0 + p.vx * dt, y1 = y0 + p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }

    let best = null;
    let bt = Infinity;
    for (const a of world.asteroids) {
      const t = segCircle(x0, y0, x1, y1, a.x, a.y, a.r + p.r);
      if (t !== null && t < bt) { bt = t; best = a; }
    }
    for (const w of world.walls || []) {
      const t = segWall(x0, y0, x1, y1, w, p.r);
      if (t !== null && t < bt) { bt = t; best = w; }
    }
    for (const o of opponentsOf(world, p.team)) {
      if (!o.alive || o === p.owner || (p.hit && p.hit.has(o))) continue;
      const t = segCircle(x0, y0, x1, y1, o.x, o.y, o.r + p.r);
      if (t !== null && t < bt) { bt = t; best = o; }
    }

    if (!best) { p.x = x1; p.y = y1; continue; }
    const hx = x0 + (x1 - x0) * bt;
    const hy = y0 + (y1 - y0) * bt;
    if (best.kind === "asteroid" || best.kind === "wall") {
      p.dead = true;
      p.x = hx; p.y = hy;
      if (best.kind === "asteroid") {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        best.vx += (p.vx / sp) * CFG.bulletPush / best.m;
        best.vy += (p.vy / sp) * CFG.bulletPush / best.m;
      }
      world.events.push({ type: "spark", x: hx, y: hy, color: p.color });
      // Deviation: an explosive round detonates on terrain (the game's dies
      // silently) — otherwise "blasts push asteroids" almost never happens.
      for (const fx of p.effects) if (fx.kind === "explode") explode(world, fx, hx, hy, p.team, p.owner);
      continue;
    }
    // A body.
    applyEffects(world, best, p.effects, p.owner, { x: hx, y: hy, vx: p.vx, vy: p.vy, team: p.team });
    world.events.push({ type: "hit", x: hx, y: hy, color: p.color });
    const pierce = p.effects.find((e) => e.kind === "pierce");
    if (pierce && p.pierceLeft > 0) {
      p.pierceLeft--;
      (p.hit || (p.hit = new Set())).add(best);
      p.x = x1; p.y = y1;
    } else {
      p.dead = true;
      p.x = hx; p.y = hy;
    }
  }
  world.projectiles = world.projectiles.filter((p) => !p.dead);
}

function nearestOpponent(world, p) {
  let best = null, bd = Infinity;
  for (const o of opponentsOf(world, p.team)) {
    if (!o.alive || o === p.owner) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function steerHoming(world, p, dt) {
  const homing = p.effects.find((e) => e.kind === "homing");
  if (!homing) return;
  const target = nearestOpponent(world, p);
  if (!target) return;
  const want = Math.atan2(target.y - p.y, target.x - p.x);
  const cur = Math.atan2(p.vy, p.vx);
  const speed = Math.hypot(p.vx, p.vy) || 1;
  let d = want - cur;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const turn = (homing.turn || 3) * dt;
  const na = cur + clamp(d, -turn, turn);
  p.vx = Math.cos(na) * speed;
  p.vy = Math.sin(na) * speed;
}

// applyEffects, src/mission/combat.js: in the order the weapon authors them.
export function applyEffects(world, target, effects, owner, at) {
  const mult = owner && owner.kind === "soldier" ? CFG.playerDamageMult : 1;
  for (const fx of effects) {
    switch (fx.kind) {
      case "damage":
        hurt(world, target, (fx.amount || 0) * mult, owner);
        break;
      case "burn":
        target.burn = { dps: (fx.dps || 0) * mult, time: fx.duration };
        target.burnOwner = owner;
        break;
      case "slow":
        target.slow = { factor: clamp(fx.factor ?? 1, 0, 1), time: fx.duration };
        break;
      case "knockback": {
        const v = clamp(fx.force || 0, 0, 1) * CFG.knockbackMaxV;
        const sp = Math.hypot(at.vx, at.vy) || 1;
        shove(target, (at.vx / sp) * v, (at.vy / sp) * v);
        break;
      }
      case "explode":
        explode(world, fx, at.x, at.y, at.team, owner);
        break;
      case "chain": {
        const pool = opponentsOf(world, at.team).filter((o) => o.alive && o !== target);
        const done = new Set([target]);
        let from = target;
        for (let j = 0; j < (fx.jumps || 0); j++) {
          let next = null, bd = Infinity;
          for (const o of pool) {
            if (done.has(o)) continue;
            const d = Math.hypot(o.x - from.x, o.y - from.y);
            if (d <= (fx.range || 0) && d < bd) { bd = d; next = o; }
          }
          if (!next) break;
          world.events.push({ type: "chain", x: next.x, y: next.y, x0: from.x, y0: from.y, x1: next.x, y1: next.y });
          hurt(world, next, (fx.amount || 0) * mult, owner);
          done.add(next);
          from = next;
        }
        break;
      }
    }
  }
}

// Damages opponents in the radius (the direct target again, as the game does),
// and pushes rocks (answer 4). Bodies are not pushed (P8).
export function explode(world, fx, x, y, team, owner) {
  const mult = owner && owner.kind === "soldier" ? CFG.playerDamageMult : 1;
  const R = fx.radius || 0;
  world.events.push({ type: "explode", x, y, r: R });
  for (const o of opponentsOf(world, team)) {
    if (o.alive && Math.hypot(o.x - x, o.y - y) <= R) hurt(world, o, (fx.amount || 0) * mult, owner);
  }
  for (const a of world.asteroids) {
    const dx = a.x - x, dy = a.y - y;
    const d = Math.hypot(dx, dy) || 1;
    const reach = R + a.r;
    if (d >= reach) continue;
    const k = (CFG.blastPush * (1 - d / reach)) / a.m;
    a.vx += (dx / d) * k;
    a.vy += (dy / d) * k;
  }
}

// ---- geometry ----------------------------------------------------------------
// First t in [0,1] where segment p0→p1 comes within R of c, or null.
export function segCircle(x0, y0, x1, y1, cx, cy, R) {
  const dx = x1 - x0, dy = y1 - y0;
  const fx = x0 - cx, fy = y0 - cy;
  const c = fx * fx + fy * fy - R * R;
  if (c <= 0) return 0; // starts inside
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

// Closest point on wall segment w to (px, py).
export function closestOnWall(w, px, py) {
  const ex = w.x1 - w.x0, ey = w.y1 - w.y0;
  const L2 = ex * ex + ey * ey || 1;
  const k = clamp(((px - w.x0) * ex + (py - w.y0) * ey) / L2, 0, 1);
  return [w.x0 + ex * k, w.y0 + ey * k];
}

// First t in [0,1] where a round of radius pr on p0→p1 touches the wall — the
// wall as a capsule of half-thickness w.t: its two long faces, then its ends.
export function segWall(x0, y0, x1, y1, w, pr) {
  const R = w.t + pr;
  const [cx, cy] = closestOnWall(w, x0, y0);
  if (Math.hypot(x0 - cx, y0 - cy) <= R) return 0;
  const ex = w.x1 - w.x0, ey = w.y1 - w.y0;
  const L = Math.hypot(ex, ey) || 1;
  const ux = ex / L, uy = ey / L, nx = -uy, ny = ux;
  const dx = x1 - x0, dy = y1 - y0;
  const dn = dx * nx + dy * ny;
  const off = (x0 - w.x0) * nx + (y0 - w.y0) * ny;
  let best = null;
  if (dn !== 0) {
    for (const side of [R, -R]) {
      const t = (side - off) / dn;
      if (t < 0 || t > 1) continue;
      const along = (x0 + dx * t - w.x0) * ux + (y0 + dy * t - w.y0) * uy;
      if (along >= 0 && along <= L && (best === null || t < best)) best = t;
    }
  }
  for (const [px, py] of [[w.x0, w.y0], [w.x1, w.y1]]) {
    const t = segCircle(x0, y0, x1, y1, px, py, R);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

// A body against a wall: push out along the contact normal, reflect what was
// moving into it. Walls do not move.
function collideWall(b, w, e) {
  const [cx, cy] = closestOnWall(w, b.x, b.y);
  const dx = b.x - cx, dy = b.y - cy;
  const min = b.r + w.t;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2) || 0.0001;
  const nx = dx / d, ny = dy / d;
  b.x += nx * (min - d);
  b.y += ny * (min - d);
  foldShove(b);
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
  }
  return Math.max(0, -vn); // the closing speed, for crash
}

// How fast two overlapping bodies are closing along their centre line, shoves
// included (collide folds them in). 0 if apart or separating.
function closing(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (!d || d >= a.r + b.r) return 0;
  const rv = ((b.vx + (b.sx || 0)) - (a.vx + (a.sx || 0))) * dx / d + ((b.vy + (b.sy || 0)) - (a.vy + (a.sy || 0))) * dy / d;
  return Math.max(0, -rv);
}

// A soldier hitting something at `v` px/s: nothing up to crashSafe, all its HP
// at crashLethal, and in proportion in between (Bo: a squared curve hurt too
// little — a third of the way to lethal should cost a third of your HP).
// Companions take companionCrash of it. k is not capped at 1, so a fast enough
// hit still kills a companion in one (from about 1390px/s at 0.7). `safe` is
// landSafe for a feet-first booted landing.
function crash(world, s, v, safe = CFG.crashSafe) {
  if (!isBody(s) || !s.alive || !(v > safe)) return;
  const k = (v - safe) / (CFG.crashLethal - safe);
  const share = s === controlled(world) ? 1 : CFG.companionCrash;
  world.events.push({ type: "crash", x: s.x, y: s.y, speed: v });
  hurt(world, s, k * share * s.maxHp, null);
}

// ---- motion + collision ----------------------------------------------------
function movers(world) {
  const list = world.asteroids.slice();
  for (const s of world.soldiers) if (s.alive) list.push(s);
  for (const e of world.enemies) if (e.alive) list.push(e);
  return list;
}

function integrate(world, dt) {
  const list = movers(world);
  // Substep so nothing moves more than half the smallest radius per substep:
  // discrete circle tests then cannot tunnel.
  let maxV = 0;
  let minR = Infinity;
  for (const b of list) {
    minR = Math.min(minR, b.r);
    // A standing soldier is carried by its rock after this, not moved here.
    if (b.boots === "ground") continue;
    maxV = Math.max(maxV, Math.hypot(b.vx + (b.sx || 0), b.vy + (b.sy || 0)));
  }
  const n = Math.max(1, Math.ceil((maxV * dt) / (minR * 0.5)));
  const h = dt / n;
  for (let k = 0; k < n; k++) {
    for (const b of list) {
      if (b.boots === "ground") continue;
      // Slow scales the body's whole displacement (the game scales horizontal).
      const f = b.slow && b.slow.time > 0 ? b.slow.factor : 1;
      b.x += (b.vx + (b.sx || 0)) * h * f;
      b.y += (b.vy + (b.sy || 0)) * h * f;
      if (b.spin) b.rot += b.spin * h;
    }
    collideAll(world, list);
  }
}

function collideAll(world, list) {
  const e = CFG.restitution;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      // Bodies pass through each other; only rocks bounce things (P7).
      if (a.kind !== "asteroid" && b.kind !== "asteroid") continue;
      if (a.boots) bootContact(world, a, b);
      else if (b.boots) bootContact(world, b, a);
      else {
        const s = isBody(a) ? a : isBody(b) ? b : null;
        const v = s ? closing(a, b) : 0;
        if (collide(a, b, e) && s) crash(world, s, v);
      }
    }
    for (const r of world.ruins) {
      if (Math.hypot(a.x - r.x, a.y - r.y) > r.R + a.r) continue;
      for (const w of r.walls) {
        if (a.boots) bootWall(world, a, w);
        else {
          const v = collideWall(a, w, e);
          if (v) crash(world, a, v);
        }
      }
    }
    edge(a, world.size, e);
  }
}

// A body with a shove folds it into its velocity at a contact: the rebound is
// computed on how it was actually moving, and what is left keeps drifting.
function foldShove(b) {
  if (b.sx || b.sy) {
    b.vx += b.sx;
    b.vy += b.sy;
    b.sx = b.sy = 0;
  }
}

export function collide(a, b, e = CFG.restitution) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const min = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2) || 0.0001;
  const nx = dx / d;
  const ny = dy / d;
  const ia = 1 / a.m;
  const ib = 1 / b.m;
  const pen = min - d;
  a.x -= nx * pen * (ia / (ia + ib));
  a.y -= ny * pen * (ia / (ia + ib));
  b.x += nx * pen * (ib / (ia + ib));
  b.y += ny * pen * (ib / (ia + ib));
  foldShove(a);
  foldShove(b);
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const j = (-(1 + e) * rv) / (ia + ib);
    a.vx -= j * nx * ia;
    a.vy -= j * ny * ia;
    b.vx += j * nx * ib;
    b.vy += j * ny * ib;
  }
  return true;
}

function edge(b, size, e) {
  if (b.x < b.r) { foldShove(b); b.x = b.r; b.vx = Math.abs(b.vx) * e; }
  else if (b.x > size - b.r) { foldShove(b); b.x = size - b.r; b.vx = -Math.abs(b.vx) * e; }
  if (b.y < b.r) { foldShove(b); b.y = b.r; b.vy = Math.abs(b.vy) * e; }
  else if (b.y > size - b.r) { foldShove(b); b.y = size - b.r; b.vy = -Math.abs(b.vy) * e; }
}
