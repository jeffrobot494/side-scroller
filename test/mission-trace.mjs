// ---------------------------------------------------------------------------
// THE MISSION TRACE — one fixed-step mission, defined once
// (tech/multiplayer-missions.md, J0)
//
// The step, the length, the seed, the squad and the input trace. Extracted from
// test/mission-golden.test.mjs so that THREE things ask about one mission rather
// than three: the golden (does a mission replay from its seed), the divergence
// probe (do two clients consume one stream in the same order), and
// test/float-probe.html (do two MACHINES compute the same numbers).
//
// It has to live outside a `.test.mjs` file for a reason that is not tidiness:
// the browser probe imports it, and every suite in this folder imports
// `node:fs` somewhere up its chain. Nothing here may import node, touch a DOM,
// or read storage — it is data and one pure function of a frame index.
//
// No canvas: the golden builds one through the harness, the probe uses a real
// one, and neither of those is the trace's business.
// ---------------------------------------------------------------------------

export const STEP = 1 / 60;
export const SECONDS = 8;
export const SEED = 20260824;

// ---- the squad ------------------------------------------------------------
// Weapon literals, not ARSENAL entries: `applyWeaponOverrides` mutates the
// shipped weapon objects in place from localStorage, so a trace built on them
// would depend on which suite ran before it — and, in the browser probe, on
// whatever the person last saved in the Weapon Designer. Between them the two
// cover the spread draw twice over: one shot per pull, and one pull that draws
// per pellet.

const AUTO_RIFLE = {
  id: "gold_rifle", name: "Trace Rifle", fireRate: 6, auto: true, spread: 0.03,
  magazine: 24, reloadTime: 1.6,
  projectile: { speed: 900, w: 12, h: 4, color: "#ffd8a0", life: 1.4, shape: "bolt" },
  effects: [{ kind: "damage", amount: 6 }],
};
const SCATTER = {
  id: "gold_scatter", name: "Trace Scattergun", fireRate: 1.8, auto: false, spread: 0.05,
  magazine: 6, reloadTime: 2.2,
  projectile: { speed: 720, w: 8, h: 8, color: "#ffe0b0", life: 0.6, shape: "pellet" },
  effects: [{ kind: "damage", amount: 4 }, { kind: "pellets", count: 5, spread: 0.16 }],
};

// Stats spread across Aim (spread width) and Speed (the duck roll's chance and
// latency), so both stat-driven draws vary between squadmates.
export const SQUAD = [
  { data: { id: "s1", name: "Rook", callsign: "RK", stats: { health: 7, aim: 8, speed: 4 } }, weapon: AUTO_RIFLE },
  { data: { id: "s2", name: "Vale", callsign: "VL", stats: { health: 6, aim: 4, speed: 9 } }, weapon: SCATTER },
  { data: { id: "s3", name: "Pike", callsign: "PK", stats: { health: 8, aim: 6, speed: 6 } }, weapon: AUTO_RIFLE },
];

// ---- the input trace ------------------------------------------------------
// A recorded trace, expressed as a pure function of the frame index. This is the
// "fixed input at a fixed step" the whole of tech/mission-determinism.md is
// qualified on: no wall clock, no polling, and identical on every run and every
// machine.
//
// `Math.sin`/`cos` appear here, in the INPUT. That is deliberate and it is also
// the one place the float probe cannot separate engine disagreement in the trace
// from engine disagreement in the simulation — see the note in
// test/float-probe.html.

export function scriptAt(f) {
  const held = {};
  // advance right, except for two stretches where the player holds position
  if (!(f >= 220 && f < 280) && !(f >= 400 && f < 430)) held.right = true;
  if (f >= 250 && f < 268) held.left = true; // back up under fire
  if (f % 90 < 6) held.jump = true;
  if (f >= 300 && f < 360) held.crouch = true; // kneel, then stand back up
  if (f > 40) held.fire = true; // auto weapons fire on hold
  const pressed = {};
  if (f % 11 === 0) pressed.fire = true; // and semi-autos on the edge
  if (f === 420) pressed.reload = true;
  if (f === 480) pressed.swap = true; // hand control to a squadmate mid-fight
  // A stick aim that sweeps, so the spread draw is not always about the same
  // axis and the muzzle direction changes every frame.
  const a = Math.sin(f / 37) * 0.7;
  return { held, pressed, aim: { x: Math.cos(a), y: Math.sin(a) } };
}

// A MissionInput stand-in. `aimSource` answers a stick whatever the aim mode is,
// so the trace is independent of config.aimMode, the camera and the zoom.
export function scriptedInput() {
  let held = {};
  let edges = {};
  let aim = null;
  return {
    advance(f) {
      const s = scriptAt(f);
      held = s.held;
      edges = { ...s.pressed };
      aim = s.aim;
    },
    isDown: (a) => held[a] === true,
    justPressed(a) {
      if (!edges[a]) return false;
      edges[a] = false;
      return true;
    },
    aimSource: () => (aim ? { type: "stick", x: aim.x, y: aim.y } : null),
    pollGamepad() {},
    enable() {},
    disable() {},
  };
}
