// ---------------------------------------------------------------------------
// THE TAKES TABLE (tech/trailer.md). Data: what each shot stages. DOM-free.
//
// SHOTS is design/trailer.md's shot list in beats (0.5 s, the 120 BPM
// placeholder): 14 rows, 120 beats. A mission shot is one or more segments
// that tile it; each segment is built fresh by its `make`, and is
//   { level, mission, squad, trace, camera, cues, preroll, speed, falls }
// as src/trailer/runner.js reads them. Every time inside a segment is in
// beats from the segment's own start. Levels are hand-authored in the
// generator's own shape: the world floor at y = 500, platforms, a spawn, and
// placements { type, x, y }.
//
// A camera is a track (src/trailer/tracks.js) around a subject:
//   { soldier: id } their feet · { root: i } its centre · { point: [x, y] }
//   lock: true   read once, on the first captured frame, and held
//   ground: true y is the world floor, whatever the subject's own
// ---------------------------------------------------------------------------

import { generateLevel } from "../game/gen/levelgen.js";
import { RECRUIT_POOL } from "../game/soldiers.js";
import { ARSENAL_BY_ID } from "../game/arsenal.js";
import { missionSpecById } from "../game/enemyspecs.js";
import { instantiate } from "../mission/enemyspec/runtime.js";
import { poseAt, beatOf } from "./tracks.js";

export const FPS = 60;
export const GROUND = 500;

// A recruit from the pool, as the mission takes a squad member. Copied, so a
// take never writes into the pool.
export function recruit(id, weaponId) {
  const data = RECRUIT_POOL.find((r) => r.id === id);
  const weapon = ARSENAL_BY_ID[weaponId];
  if (!data) throw new Error(`trailer: no recruit "${id}"`);
  if (!weapon) throw new Error(`trailer: no weapon "${weaponId}"`);
  return { data: { ...data, stats: { ...data.stats } }, weapon };
}

// Vance leads (the keyboard's soldier); Tex is the squadmate the trailer
// follows.
const SQUAD = () => [
  recruit("vance", "carbine"),
  recruit("tex", "burst_rifle"),
  recruit("osei", "scattergun"),
  recruit("reyes", "scout_smg"),
];

// A staged level: the world floor, extra platforms, the squad's spawn and the
// enemies. The exit is past the right edge, so no take ends by extracting.
export function stagedLevel({ width = 2400, platforms = [], spawn = [300, 420], enemies = [] }) {
  return {
    id: "trailer",
    name: "Trailer",
    world: { width, height: 540, gravity: 2000 },
    platforms: [{ x: 0, y: GROUND, w: width, h: 40 }, ...platforms],
    playerSpawn: { x: spawn[0], y: spawn[1] },
    // A placement is the body's top-left; standing on the floor by default.
    enemies: enemies.map(([type, x, y]) => ({ type, x, y: y ?? GROUND - specHeight(type) - 1 })),
    exit: { x: width + 400, y: 380, w: 60, h: 120 },
    artifact: null,
  };
}

// The body's height as the runtime builds it (a rig can scale the spec's box).
const heights = new Map();
function specHeight(type) {
  if (!heights.has(type)) {
    const spec = missionSpecById[type];
    heights.set(type, spec ? instantiate(spec, 0, 0, "enemy", () => 0.5).h : 40);
  }
  return heights.get(type);
}

const missionOf = (seed) => ({ id: "trailer", name: "Trailer", difficulty: "normal", seed, xpReward: 0, threatReward: 0, winsCampaign: false });

// Where a soldier stands: the middle of their feet, game coordinates.
export const feet = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h });
const centre = (e) => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });

function subjectPoint(m, sub) {
  if (!sub) return null;
  if (sub.point) return { x: sub.point[0], y: sub.point[1] };
  if (sub.soldier) {
    const s = m.scene.soldiers.find((x) => x.id === sub.soldier);
    return s ? feet(s) : null;
  }
  const r = m.scene.specRoots[sub.root];
  return r ? centre(r) : null;
}

// A segment's camera: (frame, mission) → pose. Holds its subject when locked.
export function shotCamera(track, sub) {
  let held = null;
  const cam = (f, m) => {
    let p = held || subjectPoint(m, sub);
    if (!p) return null;
    if (sub && sub.ground) p = { x: p.x, y: GROUND };
    if (sub && sub.lock && !held) held = p;
    return poseAt(track, beatOf(f), p);
  };
  cam.track = track; // for the suite
  return cam;
}

// Aim from a soldier's chest at a point, as a stick.
function aimAt(m, id, pt) {
  const s = m.scene.soldiers.find((x) => x.id === id);
  if (!s || !pt) return { x: 1, y: 0 };
  const dx = pt.x - (s.x + s.w / 2), dy = pt.y - (s.y + s.h * 0.42);
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}
const partCentre = (m, root, id) => {
  const r = m.scene.specRoots[root];
  if (!r) return null;
  const find = (e) => (e.id === id ? e : e.children.map(find).find(Boolean) || null);
  const e = find(r);
  return e && e.alive ? centre(e) : null;
};

const still = () => ({ held: {}, pressed: {}, aim: { x: 1, y: 0 } });
const keys = (...k) => k.map(([b, pos, at, fov, ease]) => ({ b, pos, at, fov, ...(ease ? { ease } : {}) }));

// ---- the mission segments ------------------------------------------------------

// 1 · Night skyline; the Iron Moth drifts across the fog, not engaging.
function shot1() {
  return {
    level: stagedLevel({ width: 3600, spawn: [150, 420], enemies: [["iron_moth", 2300]] }),
    mission: missionOf(101),
    squad: SQUAD(),
    trace: still,
    cues: [{ b: 0, kind: "hold", target: { root: 0 } }],
    camera: shotCamera({ kind: "push", keys: keys(
      [0, [300, 150, 1300], [40, -10, 0], 32],
      [8, [200, 148, 780], [20, 0, 0], 32],
    ) }, { root: 0, lock: true }),
  };
}

// 4 · The squad lands: mist, capes, lasers sweeping, squadmates spreading out.
function shot4() {
  return {
    level: stagedLevel({ width: 3000, spawn: [300, 60], platforms: [{ x: 700, y: 400, w: 160, h: 20 }, { x: 1250, y: 360, w: 180, h: 20 }, { x: 1700, y: 410, w: 140, h: 20 }] }),
    mission: missionOf(104),
    squad: SQUAD(),
    trace: (f) => ({
      held: { right: f > 40 },
      pressed: {},
      aim: { x: Math.cos(Math.sin(f / 22) * 0.45), y: Math.sin(Math.sin(f / 22) * 0.45) - 0.1 },
    }),
    camera: shotCamera({ kind: "track", keys: keys(
      [0, [-190, -24, 230], [140, -44, 0], 40],
      [8, [-150, -24, 230], [200, -40, 0], 40],
    ) }, { soldier: "vance", ground: true }),
  };
}

// 5 · A Husk Charger crouches and lunges at the lens; the lunge on a beat.
// Vance alone, holding fire, so nothing flashes it; the camera stands low
// between them, where the charger will crouch, and it lunges past the lens.
function shot5() {
  return {
    level: stagedLevel({ spawn: [300, 420], enemies: [["husk_charger", 820]] }),
    mission: missionOf(105),
    squad: [recruit("vance", "carbine")],
    trace: still,
    cues: [{ b: -40, kind: "guard", target: { squad: true } }],
    preroll: { root: 0, kind: "action", id: "lunge", b: 2, lead: 0.6 },
    camera: shotCamera({ kind: "locked", keys: keys([0, [-205, -16, 62], [-70, -18, 0], 44]) }, { root: 0, lock: true, ground: true }),
  };
}

// 6 · The roster, each alone under a slight orbit.
function hero(type, seed, { radius, angle, rise = 30, fov = 34 }) {
  return () => ({
    // Vance alone and holding fire: the enemy acts on him, and no hit flash
    // covers it.
    level: stagedLevel({ spawn: [400, 420], enemies: [[type, 1000]] }),
    mission: missionOf(seed),
    squad: [recruit("vance", "carbine")],
    trace: still,
    cues: [{ b: -20, kind: "guard", target: { squad: true } }],
    preroll: { frames: 120 },
    camera: shotCamera({ kind: "orbit", keys: [
      { b: 0, center: [0, 0, 0], radius, angle, rise, fov },
      { b: 3, center: [0, 0, 0], radius, angle: angle + Math.sign(angle) * 14, rise, fov },
    ] }, { root: 0 }),
  });
}

// 7 · A Strafe Raider fires; the round crosses, Tex kneels, it passes over.
// ¼ slow motion at shoulder height. The raider fires from above; the round is
// set onto a line at Tex's head as it leaves the gun, off frame.
function shot7() {
  const tex = (scene) => scene.soldiers.find((s) => s.id === "tex");
  return {
    level: stagedLevel({ width: 3600, spawn: [1500, 420], enemies: [["strafe_raider", 2100, 300]] }),
    mission: missionOf(107),
    squad: [recruit("vance", "carbine"), recruit("tex", "burst_rifle")],
    trace: still,
    speed: 0.25,
    cues: [
      { b: -40, kind: "guard", target: { squad: true } },
      { b: -40, kind: "pin", target: { soldier: "tex" } },
      // Vance well behind where the round starts, so nothing but Tex is on its line.
      { b: -40, kind: "pin", target: { soldier: "vance" }, x: (sc) => tex(sc).x - 340 },
      { b: -40, kind: "guard", target: { root: 0 } },
      // One shot, then the raider is done: its second would find Tex standing.
      { b: 2.5, kind: "hold", target: { root: 0 } },
      { b: 2, kind: "set", target: { round: "enemy" }, x: (sc) => tex(sc).x - 260, y: (sc) => tex(sc).y + 8, vx: 420, vy: 0 },
    ],
    preroll: { root: 0, kind: "fire", part: "root", b: 2 },
    camera: shotCamera({ kind: "locked", keys: keys([0, [110, -52, 72], [-220, -40, 0], 46]) }, { soldier: "tex", lock: true }),
  };
}

// 8 · Weapons, one per beat: a grenade arc, a chain, homing rounds.
function weapon(weaponId, enemies, seed, aim, fireAt = 4) {
  return () => ({
    level: stagedLevel({ spawn: [300, 420], enemies }),
    mission: missionOf(seed),
    squad: [recruit("tex", weaponId)],
    trace: (f) => ({ held: { fire: f >= fireAt }, pressed: { fire: f === fireAt }, aim }),
    cues: [{ b: -20, kind: "guard", target: { squad: true } }, ...enemies.map((_, i) => ({ b: -20, until: 0, kind: "guard", target: { root: i } }))],
    preroll: { frames: 20 },
    camera: shotCamera({ kind: "locked", keys: keys([0, [130, -100, 380], [210, -70, 0], 42]) }, { soldier: "tex", lock: true, ground: true }),
  });
}

// 9 · The Siege Automaton, already standing; the camera tilts up from the
// squad behind cover to it, and its missile volley fills the sky. Vance alone
// and holding fire, so the reveal is not lost under hit flashes.
function shot9() {
  return {
    level: stagedLevel({ width: 3600, spawn: [1400, 420], platforms: [{ x: 1560, y: 440, w: 60, h: 60 }], enemies: [["siege_automaton", 1800]] }),
    mission: missionOf(109),
    squad: [recruit("vance", "carbine")],
    trace: still,
    cues: [{ b: -60, kind: "guard", target: { squad: true } }, { b: -60, kind: "guard", target: { root: 0 } }],
    preroll: { root: 0, kind: "fire", part: "missilePack", b: 5 },
    camera: shotCamera({ kind: "crane", keys: keys(
      [0, [-170, -38, 200], [150, -40, 0], 46],
      [2, [-170, -38, 200], [160, -44, 0], 46],
      [5, [-180, -50, 230], [400, -140, 0], 46],
      [10, [-190, -56, 240], [420, -170, 0], 46],
    ) }, { soldier: "vance", lock: true, ground: true }),
  };
}

// 10 · Tex is hit and falls. Long lens, the background blurred.
function shot10() {
  return {
    level: stagedLevel({ spawn: [460, 420], enemies: [["lurk_gunner", 1050], ["lurk_gunner", 1150]] }),
    mission: missionOf(110),
    squad: [recruit("vance", "carbine"), recruit("tex", "burst_rifle")],
    trace: () => ({ held: { fire: true }, pressed: {}, aim: { x: 1, y: 0 } }),
    cues: [
      // Tex holds his ground ahead of Vance, so the gunners' nearest target is him.
      { b: -40, kind: "pin", target: { soldier: "tex" } },
      { b: -40, until: 3.5, kind: "guard", target: { soldier: "tex" } },
      { b: -40, kind: "guard", target: { soldier: "vance" } },
      { b: -40, kind: "guard", target: { root: 0 } },
      { b: -40, kind: "guard", target: { root: 1 } },
      { b: 3.5, kind: "kill", target: { soldier: "tex" } },
    ],
    preroll: { frames: 90 },
    falls: [{ soldier: "tex" }],
    camera: shotCamera({ kind: "locked", blur: { aperture: 4e-6, maxblur: 0.012 }, keys: keys(
      [0, [-160, -30, 2100], [-10, -24, 0], 4.5],
    ) }, { soldier: "tex", lock: true }),
  };
}

// 11 · The Iron Moth: one wing shot out, then the other, each on a beat; it
// drops to the ground. Wide, and the camera whips down with the first wing.
function shot11() {
  return {
    level: stagedLevel({ spawn: [740, 420], enemies: [["iron_moth", 820, 380]] }),
    mission: missionOf(111),
    squad: SQUAD(),
    trace: (f, m) => ({
      held: { fire: true }, pressed: {},
      aim: aimAt(m, "vance", f < 108 ? partCentre(m, 0, "leftWing") : partCentre(m, 0, "rightWing") || partCentre(m, 0, "core")),
    }),
    cues: [
      { b: -40, kind: "guard", target: { squad: true } },
      { b: -40, kind: "guard", target: { root: 0, part: "core" } },
      { b: -40, until: 3.5, kind: "guard", target: { root: 0, part: "leftWing" } },
      { b: -40, until: 5, kind: "guard", target: { root: 0, part: "rightWing" } },
      { b: 3.5, kind: "kill", target: { root: 0, part: "leftWing" } },
      { b: 5, kind: "kill", target: { root: 0, part: "rightWing" } },
    ],
    preroll: { frames: 60 },
    falls: [{ root: 0, part: "leftWing" }, { root: 0, part: "rightWing" }],
    // Wide; whips down with the first wing as it falls, holds a lower
    // framing the moth drops into, then pushes in on it grounded. Keyed to
    // the street under the moth, which no key goes below.
    camera: shotCamera({ kind: "track", keys: keys(
      [0, [-80, -120, 640], [0, -150, 0], 46],
      [3.5, [-80, -120, 640], [0, -150, 0], 46],
      [4.5, [-120, -40, 430], [-70, -16, 0], 46, "whip"],
      [6, [-120, -40, 430], [-70, -16, 0], 46],
      [12, [-60, -60, 470], [0, -40, 0], 46],
    ) }, { root: 0, lock: true, ground: true }),
  };
}

// 12 · The Siege Automaton's overload death fills the frame; push in through it.
function shot12() {
  return {
    level: stagedLevel({ spawn: [300, 420], enemies: [["siege_automaton", 760]] }),
    mission: missionOf(112),
    squad: SQUAD(),
    trace: () => ({ held: { fire: true }, pressed: {}, aim: { x: 1, y: -0.1 } }),
    cues: [
      { b: -40, kind: "guard", target: { squad: true } },
      // Killed half a beat in: the view must have drawn its rig alive to play
      // the rig's overload (dead before its first frame, it is a block). A
      // round reaches it there.
      { b: 0.5, kind: "kill", target: { root: 0 } },
    ],
    preroll: { frames: 126 },
    camera: shotCamera({ kind: "push", keys: keys(
      [0, [-80, -30, 820], [0, 0, 0], 38],
      [6, [0, -10, 120], [0, 0, 0], 38],
    ) }, { root: 0, lock: true }),
  };
}

// ---- the shot list -------------------------------------------------------------

const seg = (from, to, make) => ({ from, to, make });

export const SHOTS = [
  { n: 1, from: 0, to: 8, kind: "mission", segments: [seg(0, 8, shot1)] },
  { n: 2, from: 8, to: 18, kind: "hub" },
  { n: 3, from: 18, to: 22, kind: "hub" },
  { n: 4, from: 22, to: 30, kind: "mission", segments: [seg(22, 30, shot4)] },
  { n: 5, from: 30, to: 34, kind: "mission", segments: [seg(30, 34, shot5)] },
  { n: 6, from: 34, to: 46, kind: "mission", segments: [
    seg(34, 37, hero("lurk_gunner", 1061, { radius: 230, angle: -24, rise: 24 })),
    seg(37, 40, hero("floating_factory", 1062, { radius: 340, angle: 22, rise: 40 })),
    seg(40, 43, hero("breach_hopper", 1063, { radius: 250, angle: -22, rise: 24 })),
    seg(43, 46, hero("sky_duelist", 1064, { radius: 190, angle: 24, rise: 20 })),
  ] },
  { n: 7, from: 46, to: 56, kind: "mission", segments: [seg(46, 56, shot7)] },
  { n: 8, from: 56, to: 62, kind: "mission", segments: [
    seg(56, 58, weapon("grenade_launcher", [["husk_charger", 640], ["husk_charger", 680], ["husk_charger", 720]], 1081, { x: 0.94, y: -0.34 })),
    seg(58, 60, weapon("arc_tazer", [["lurk_gunner", 560], ["lurk_gunner", 650], ["lurk_gunner", 740]], 1082, { x: 1, y: 0 }, 2)),
    seg(60, 62, weapon("seeker", [["sky_duelist", 760, 420], ["spore_wisp", 640, 440]], 1083, { x: 0.8, y: -0.6 }, 2)),
  ] },
  { n: 9, from: 62, to: 72, kind: "mission", segments: [seg(62, 72, shot9)] },
  { n: 10, from: 72, to: 78, kind: "mission", segments: [seg(72, 78, shot10)] },
  { n: 11, from: 78, to: 90, kind: "mission", segments: [seg(78, 90, shot11)] },
  { n: 12, from: 90, to: 96, kind: "mission", segments: [seg(90, 96, shot12)] },
  { n: 13, from: 96, to: 106, kind: "hub" },
  { n: 14, from: 106, to: 120, kind: "title" },
];

// ---- the text cards (T6) ---------------------------------------------------------
// Over the picture, never on black, in beats from the trailer's start. The
// roster names are read off the roster, so a renamed enemy renames its card.
// Shot 14's card is the game's name, which the splash title itself is.

const nameOf = (id) => (missionSpecById[id] ? missionSpecById[id].name.toUpperCase() : id);

export const CARDS = [
  { from: 8.5, to: 12.5, text: "THEY ARE LANDING EVERYWHERE" },
  { from: 13, to: 17.5, text: "YOU CANNOT ANSWER THEM ALL" },
  { from: 34, to: 37, text: nameOf("lurk_gunner"), kind: "name" },
  { from: 37, to: 40, text: nameOf("floating_factory"), kind: "name" },
  { from: 40, to: 43, text: nameOf("breach_hopper"), kind: "name" },
  { from: 43, to: 46, text: nameOf("sky_duelist"), kind: "name" },
  { from: 48, to: 54, text: "THEY FIGHT BESIDE YOU" },
  { from: 84, to: 89, text: "IT GETS WORSE" },
  { from: 96.5, to: 100.5, text: "THE ONES WHO COME BACK GET BETTER" },
  { from: 101, to: 105.5, text: "HOLD THE SECTOR. OR LOSE IT." },
];

// ---- T0 and T1's takes ------------------------------------------------------------

// T0's take: a plain generated level under the game's own camera. Tex leads,
// walks right and fires forward.
function proof() {
  const { level, mission } = generateLevel({ seed: 20261006, difficulty: "normal" });
  return {
    level,
    mission,
    squad: [recruit("tex", "burst_rifle"), recruit("vance", "carbine"), recruit("osei", "scattergun")],
    trace: (f) => ({
      held: { right: f > 20, fire: f > 60 },
      pressed: {},
      aim: { x: 1, y: 0 },
    }),
    frames: 4 * FPS,
    dress: false,
  };
}

// T1's risk check: the proof take under the framing of every shot that leaves
// the straight-ahead axis, one second each, around the squad leader. The
// capture's last frame of each second is the still.
export const RISK_FRAMINGS = [
  ["4 low tracking, level with the mist", { kind: "track", keys: [{ b: 0, pos: [-160, -24, 240], at: [120, -30, 0], fov: 40 }, { b: 2, pos: [-100, -24, 240], at: [180, -30, 0], fov: 40 }] }],
  ["5 locked low, in front", { kind: "locked", keys: [{ b: 0, pos: [320, -18, 50], at: [0, -30, 0], fov: 38 }] }],
  ["6 orbit", { kind: "orbit", keys: [{ b: 0, center: [0, -30, 0], radius: 320, angle: 20, rise: 40, fov: 36 }, { b: 2, center: [0, -30, 0], radius: 320, angle: 45, rise: 40, fov: 36 }] }],
  ["7 shoulder height", { kind: "locked", keys: [{ b: 0, pos: [-80, -62, 110], at: [320, -50, -20], fov: 45 }] }],
  ["9 pan up from behind the squad", { kind: "crane", keys: [{ b: 0, pos: [-260, -40, 320], at: [200, -40, 0], fov: 45 }, { b: 2, pos: [-260, -40, 320], at: [420, -320, 0], fov: 45 }] }],
  ["10 long lens", { kind: "locked", blur: { aperture: 4e-6, maxblur: 0.012 }, keys: [{ b: 0, pos: [-220, -40, 2200], at: [0, -30, 0], fov: 10 }] }],
  ["11 wide pan", { kind: "whip", keys: [{ b: 0, pos: [-200, -260, 1100], at: [200, -160, 0], fov: 50 }, { b: 2, pos: [200, -260, 1100], at: [600, -160, 0], fov: 50 }] }],
];

function risk() {
  const seg = proof();
  seg.frames = RISK_FRAMINGS.length * FPS;
  seg.camera = (f, m) => {
    const lead = m.scene.soldiers[0];
    const [, track] = RISK_FRAMINGS[Math.min(RISK_FRAMINGS.length - 1, Math.floor(f / FPS))];
    return lead ? poseAt(track, beatOf(f % FPS), feet(lead)) : null;
  };
  return seg;
}

export const TAKES = { proof, risk };

// Every mission segment in the table, with its shot.
export function missionSegments() {
  return SHOTS.flatMap((s) => (s.segments || []).map((g, i) => ({ shot: s.n, index: i, ...g })));
}
