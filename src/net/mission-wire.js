// ---------------------------------------------------------------------------
// THE MISSION WIRE  (tech/multiplayer-missions.md, J8)
//
// The one place a mission is narrowed for a socket, in both directions:
//
//   up    an input frame, per step, per seat        packInput / createWireInput
//   down  a snapshot of the scene, PER RECIPIENT    projectScene / applySnapshot
//
// Pure data. No DOM, no node, no timers — `server.mjs` and the browser both
// import it, and a suite drives it with neither.
//
// TWO RULES SHAPE EVERYTHING BELOW.
//
// 1. PER RECIPIENT IS NOT "YOUR OWN SQUAD ONLY". design/multiplayer.md says
//    another commander's squad is visible on a level you are both standing on,
//    and a joint mission is that level — so a snapshot carries every soldier,
//    with the fields a soldier is DRAWN from. What it does not carry is what
//    they recovered: `collected` crosses as this recipient's own count, and the
//    other commander's haul is never on the wire at all (approximation 11a).
//
// 2. A SOLDIER IS KEYED BY ID, NEVER BY POSITION (approximation 11c). An
//    extracting squad is spliced out of scene.soldiers mid-mission, so an
//    index-keyed wire would teleport everybody left behind at the moment
//    somebody walks out. Roots and loot ARE positional, and legitimately: a
//    dead root stays in scene.specRoots and loot is only ever appended, so
//    neither list renumbers.
//
// The client does NOT simulate. It builds the same scene from the same level
// and seed, then every field below is overwritten from the room. Anything the
// snapshot does not name is cosmetic and the client is free to invent it.
// ---------------------------------------------------------------------------

import { spawnFromDef } from "../mission/enemyspec/runtime.js";
import { Loot } from "../mission/entities.js";

// ---- the input frame ------------------------------------------------------

// The eight GAMEPLAY actions, in a fixed order — the index is the bit. The
// control map's other two (debugGraph, debugPath) are deliberately absent: an
// overlay is what the person looking at a canvas wants to see, not something a
// commander owns, and a room's mission draws nothing (J7).
export const WIRE_ACTIONS = ["left", "right", "jump", "crouch", "aimUp", "fire", "swap", "reload"];

const BIT = {};
for (let i = 0; i < WIRE_ACTIONS.length; i++) BIT[WIRE_ACTIONS[i]] = 1 << i;

// One sampled input frame as it crosses: `d` held, `p` the edges observed in
// this frame, `a` the aim.
//
// EDGES ARE SENT AS WELL AS HOLDS, which netproto did not do — it sends the
// current state and lets the server derive the edge. That loses a press-and-
// release that falls between two packets, and this game has two actions where
// that is the whole action (swap, reload). Sending the edge and OR-ing it in
// on arrival makes a tap survive coalescing, loss-free ordering aside.
//
// AIM CROSSES IN WORLD COORDINATES, never canvas pixels: the room holds one
// scene for two viewers and cannot resolve either one's camera (J7's `world`
// shape). A stick is a direction and crosses as itself.
export function packInput(input, seq, mode, toWorld) {
  let d = 0;
  let p = 0;
  for (const a of WIRE_ACTIONS) {
    if (input.isDown(a)) d |= BIT[a];
    if (input.justPressed(a)) p |= BIT[a];
  }
  const src = input.aimSource(mode);
  let a = null;
  if (src && src.type === "stick") a = [src.x, src.y, 0];
  else if (src && toWorld) {
    const w = toWorld(src.x, src.y);
    a = [w.x, w.y, 1];
  }
  return { n: seq, d, p, a };
}

// The room's end of one seat's input: everything `Mission.setInput` needs and
// nothing else. It is the same latch `MissionInput` is (J4) — a device half
// that packets land in, and one frozen frame per step below it — which is what
// keeps "one sample per step" true of an input that arrives over a network.
export function createWireInput() {
  let held = 0;
  let pendingPressed = 0; // OR-ed across every packet since the last sample
  let aim = null;
  let seq = 0;
  let frame = { d: 0, p: 0, a: null };

  return {
    // A packet from the seat. An older one never overwrites a newer (reordering
    // is normal on a real path) — but its EDGES are still taken, because a tap
    // that arrived late is still a tap that happened.
    receive(pkt) {
      if (!pkt || typeof pkt.n !== "number") return;
      pendingPressed |= pkt.p | 0;
      if (pkt.n <= seq) return;
      seq = pkt.n;
      held = pkt.d | 0;
      aim = Array.isArray(pkt.a) ? pkt.a : null;
    },
    // The step boundary. Consumes the pending edges, exactly as a device sample
    // consumes the keyboard's.
    sample() {
      frame = { d: held, p: pendingPressed, a: aim };
      pendingPressed = 0;
    },
    reset() {
      held = 0;
      pendingPressed = 0;
      aim = null;
      frame = { d: 0, p: 0, a: null };
    },
    // The last seq that had been consumed by a step. Sent back in the snapshot
    // so a client can measure real input→pixels latency instead of halving RTT.
    ack: () => seq,
    isDown: (action) => (frame.d & (BIT[action] || 0)) !== 0,
    justPressed: (action) => (frame.p & (BIT[action] || 0)) !== 0,
    aimSource() {
      if (!frame.a) return null;
      return frame.a[2] === 0
        ? { type: "stick", x: frame.a[0], y: frame.a[1] }
        : { type: "world", x: frame.a[0], y: frame.a[1] };
    },
  };
}

// ---- the snapshot ---------------------------------------------------------

const q = (v) => Math.round(v * 10) / 10; // a tenth of a pixel, as netproto sends

// One entity of a spec tree, flattened in WALK ORDER. The order is stable
// because `children` is built once at instantiate and only ever flagged dead or
// disabled — nothing is inserted or removed — so a positional walk on the
// client lands on the same entity every time.
function packEntity(e) {
  return [
    q(e.x), q(e.y), e.alive ? 1 : 0, e.disabled ? 1 : 0, e.facing,
    // null is a legal health and means "not damageable" — `collidables` reads
    // it that way, and quantizing it to 0 would turn a decorative part into a
    // destroyed one.
    e.health === null || e.health === undefined ? null : q(e.health),
    // The pre-attack pulse is a TELL, not decoration: it is how a player reads
    // "this part is about to hit you", so it crosses. `hitFlash` and the muzzle
    // are feedback for damage that already happened and cross for the same
    // reason a viewer needs to see who is being hit.
    q(e.telegraph || 0), q(e.hitFlash || 0), q(e.muzzleFlash || 0),
  ];
}

function walkTree(e, out) {
  out.push(packEntity(e));
  for (const c of e.children) walkTree(c, out);
}

function applyEntity(e, v) {
  e.x = v[0];
  e.y = v[1];
  e.alive = !!v[2];
  e.disabled = !!v[3];
  e.facing = v[4];
  e.health = v[5];
  e.telegraph = v[6];
  e.hitFlash = v[7];
  e.muzzleFlash = v[8];
}

function applyTree(e, list, at) {
  if (at.i >= list.length) return;
  applyEntity(e, list[at.i++]);
  for (const c of e.children) applyTree(c, list, at);
}

// A root, its own tree, and the independent trees it has spawned. Spawned ones
// carry their def id because the client has to BUILD them: they are created by
// the simulation mid-mission (the seeker's five death shards are the one site
// in the shipped roster), and a viewer that cannot make them is a viewer being
// killed by something invisible.
function packRoot(r) {
  const body = [];
  walkTree(r, body);
  const spawned = r.spawned.map((sp) => {
    const t = [];
    walkTree(sp, t);
    return [sp.spec.id, sp.depth || 1, t];
  });
  return [body, spawned, (r.brainState && r.brainState.current) || ""];
}

function applyRoot(r, v, scene, ctx) {
  applyTree(r, v[0], { i: 0 });
  const wire = v[1];
  // The spawned list MIRRORS the room's, positionally: the room filters its
  // dead out in one pass per step, so both ends stay in the same order. What
  // arrives is authoritative — extras are dropped, missing ones are built.
  if (r.spawned.length > wire.length) r.spawned.length = wire.length;
  for (let i = 0; i < wire.length; i++) {
    const [defId, depth, tree] = wire[i];
    let sp = r.spawned[i];
    if (!sp || sp.spec.id !== defId) {
      // The limiter is the ROOM's rule and it has already applied it — this is
      // a mirror, not a second simulation, so the client's own rate window is
      // cleared rather than allowed to refuse an entity that demonstrably
      // exists. maxAlive still holds, because both lists are the same length.
      r.spawnStamps = [];
      sp = spawnFromDef(r, defId, tree[0][0], tree[0][1], { depth }, scene, ctx);
      if (!sp) continue;
      r.spawned.pop(); // spawnFromDef appended it; put it where the room has it
      r.spawned[i] = sp;
    }
    applyTree(sp, tree, { i: 0 });
  }
  if (r.brainState) r.brainState.current = v[2];
}

// A soldier, keyed by id, with the fields a soldier is DRAWN from plus the
// three its own commander's HUD reads (ammo, mags, reload). `m` is the meta a
// viewer needs to build a body it did not deploy — three fields, and NOT the
// name: the HUD's squad cards are this commander's own roster and a foreign
// body never reaches them, so a colour and a health ceiling is the whole of
// what seeing somebody on the level costs them. Sent on every snapshot rather
// than once, because a client that missed the first one would otherwise draw
// nothing for the rest of the mission.
function packSoldier(s) {
  return {
    i: s.id,
    m: [s.color, s.owner, s.maxHealth],
    x: q(s.x),
    y: q(s.y),
    h: s.h,
    f: s.facing,
    c: s.crouched ? 1 : 0,
    a: s.alive ? 1 : 0,
    hp: q(s.health),
    fl: q(s.hitFlash || 0),
    mz: q(s.muzzleFlash || 0),
    b: s.burn ? 1 : 0,
    u: s.aimUp ? 1 : 0,
    v: s.aimVec ? [q(s.aimVec.x * 100) / 100, q(s.aimVec.y * 100) / 100] : null,
    am: s.ammo === Infinity ? -1 : s.ammo,
    mg: s.magsLeft,
    r: q(s.reloading || 0),
    k: s.kills,
  };
}

// A body for a soldier this page never deployed. NOT a `Soldier`: it is drawn
// and nothing else, so it carries the draw fields and no weapon, no stats and
// no roster record — there is nothing on it to leak, which is the cheapest way
// to honour "their squad, not their sheet".
function foreignSoldier(w) {
  return {
    kind: "soldier",
    id: w.i,
    color: w.m[0],
    owner: w.m[1],
    maxHealth: w.m[2],
    x: w.x, y: w.y, w: 30, h: w.h,
    vx: 0, vy: 0,
    facing: 1, crouched: false, alive: true,
    health: w.m[2],
    hitFlash: 0, muzzleFlash: 0, burn: null,
    aimUp: false, aimVec: null,
    ammo: 0, magsLeft: 0, reloading: 0, kills: 0,
    remote: true,
  };
}

function applySoldier(s, w) {
  s.x = w.x;
  s.y = w.y;
  s.h = w.h;
  s.facing = w.f;
  s.crouched = !!w.c;
  s.alive = !!w.a;
  s.health = w.hp;
  s.hitFlash = w.fl;
  s.muzzleFlash = w.mz;
  s.burn = w.b ? s.burn || { t: 1 } : null;
  s.aimUp = !!w.u;
  s.aimVec = w.v ? { x: w.v[0], y: w.v[1] } : null;
  s.ammo = w.am === -1 ? Infinity : w.am;
  s.magsLeft = w.mg;
  s.reloading = w.r;
  s.kills = w.k;
}

// The scene as ONE seat may see it. `owner` is that seat's commander, and
// `ack` the last input seq of theirs a step had consumed when this was built —
// per recipient, exactly as netproto's is, and the only field here that differs
// between two seats for a reason that is not privacy.
export function projectScene(mission, owner, ack = 0) {
  const scene = mission.scene;
  const end = mission.endFor(owner);
  return {
    // The step index this was built at. NOT `t`: the socket envelope spends
    // that on the message type, and a spread would silently overwrite one with
    // the other.
    n: mission.netStep || 0,
    a: ack,
    s: scene.soldiers.map(packSoldier),
    r: scene.specRoots.map(packRoot),
    p: scene.projectiles.map((p) => [q(p.x), q(p.y), q(p.vx), q(p.vy), p.w, p.h, p.color, p.shape || ""]),
    l: scene.loot.map((l) => [q(l.x), q(l.y), l.collected ? 1 : 0]),
    // THIS seat's count and no other's. The HUD prints it, and the whole of
    // approximation 11a is that the other commander's number is not here.
    c: mission.collectedBy(owner).length,
    f: scene.artifact ? 1 : 0,
    e: end ? (end.success ? 1 : 0) : null,
    // WHICH SOLDIER THIS SEAT IS DRIVING, by id. The room owns `control` — a
    // swap is an input like any other and is applied there — and the seat needs
    // it back for two things that are the viewer's own: the camera follows it,
    // and the ring under it is how you find yourself on a crowded level.
    k: mission.control.get(owner) ?? null,
  };
}

// Overwrite the client's scene with the room's. Everything not named here is
// cosmetic (motes, sparks, shake, the loot bob, the damage flash) and stays the
// client's own — nothing reads it back.
export function applySnapshot(mission, snap) {
  const scene = mission.scene;

  // Soldiers, by id. Three cases and all three are ordinary: one this page
  // deployed (update it), one another commander deployed (build a draw-only
  // body the first time it is seen), and one that has left the room's array
  // because its commander extracted (drop it here too).
  const seen = new Set();
  for (const w of snap.s) {
    seen.add(w.i);
    let s = scene.soldiers.find((x) => x.id === w.i);
    if (!s) {
      s = foreignSoldier(w);
      scene.soldiers.push(s);
    }
    applySoldier(s, w);
  }
  // THE SQUAD CARDS OUTLIVE THE BODIES, and this is the line that keeps them.
  // A commander who extracts is spliced out of the room's array and, one line
  // below, out of this one — while the banner still has a second and a half of
  // frames to draw over. J2's end record froze the roster locally for exactly
  // this; over a wire the freeze has to happen BEFORE the removal, because the
  // removal is the first thing the snapshot that carries the outcome does.
  const own = scene.soldiers.filter((s) => s.owner === mission.owner);
  if (own.length) mission.netSquad = own;
  for (let i = scene.soldiers.length - 1; i >= 0; i--) {
    if (!seen.has(scene.soldiers[i].id)) scene.soldiers.splice(i, 1);
  }

  // Roots are positional and never renumber — a dead one stays in the array.
  // A client whose enemy roster has drifted from the room's still gets the
  // right bodies in the right places; what it draws them AS is its own file.
  const n = Math.min(scene.specRoots.length, snap.r.length);
  for (let i = 0; i < n; i++) applyRoot(scene.specRoots[i], snap.r[i], scene, mission._ctx);

  scene.projectiles.length = 0;
  for (const [x, y, vx, vy, w, h, color, shape] of snap.p) {
    scene.projectiles.push({ x, y, vx, vy, w, h, color, shape: shape || undefined, effects: [], team: "enemy", dead: false });
  }

  while (scene.loot.length < snap.l.length) {
    const [x, y] = snap.l[scene.loot.length];
    scene.loot.push(new Loot({ name: "", value: 0 }, x, y));
  }
  scene.loot.length = snap.l.length;
  for (let i = 0; i < snap.l.length; i++) {
    const [x, y, c] = snap.l[i];
    scene.loot[i].x = x;
    scene.loot[i].y = y;
    scene.loot[i].collected = !!c;
  }

  scene.artifact = snap.f ? scene.artifact || { name: "Artifact", value: 0 } : null;
  mission.netCollected = snap.c;
  mission.netEnd = snap.e;
  mission.netAck = snap.a || 0;
  mission.netStep = snap.n;
  if (snap.k !== null) mission.control.set(mission.owner, snap.k);
  return snap;
}
