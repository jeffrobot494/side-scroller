// ---------------------------------------------------------------------------
// ENEMYSPEC RUNTIME — instantiate + simulate a normalized EnemySpec.
//
// A live spec enemy is a TREE of entity instances (root + children) plus a list
// of independently-spawned trees (entity projectiles, summons, debris). Every
// instance carries the same AABB fields as mission actors (x/y/w/h/vx/vy/
// health/alive/...) so the shared combat pipeline (mission/combat.js) and host
// scenes treat them like any other target — hosts get the damageable set via
// collidables(root) and route damage back through applyDamage()/killEntity().
//
// The host contract (preview arena, Firing Room, dryrun):
//   scene: { world, platforms, soldiers, enemies, projectiles }
//   ctx:   { damage(t, amt, owner), kill(t, owner), spark?, burst? } — same shape
//          combat.js uses. Hosts route ctx.damage for kind==="spec" targets to
//          applyDamage here so part-death cascades (links, events, signals) run.
//
// Engine-enforced limits (maxAlive/maxSpawnsPerSecond/maxSpawnDepth) are
// checked at every spawn even though validation already screened the spec
// (doc §10.4: the engine enforces limits regardless).
// ---------------------------------------------------------------------------

import { overlaps, Projectile } from "../entities.js";
import { locomotorFor } from "../locomotion.js";
import { tickBrain } from "./brain.js";
import { updateSense, nearestHostile } from "./perception.js";
import { specSound, emitterSound } from "../../audio/cues.js";
import { config } from "../../game/config.js";

const WALL_EPS = 4;

// ---- instantiation --------------------------------------------------------

// Build a live tree from a NORMALIZED spec (normalize.js output only).
// (x, y) is the root's top-left, matching how missions place enemies. `team`
// picks who this agent treats as hostile — "enemy" (the default) hunts the
// squad; "player" makes a companion hunt the enemy roots (see nearestHostile).
export function instantiate(nspec, x, y, team = "enemy") {
  const root = makeInstance(nspec.root, null, null);
  root.isRoot = true;
  root.team = team;
  root.specTop = nspec;
  root.kindName = nspec.name;
  root.vars = { ...nspec.vars, ...root.vars };
  root.x = x;
  root.y = y;
  root.age = 0;
  root.spawned = [];
  root.spawnStamps = [];
  root.pendingSignals = [];
  root.sense = {};
  root.memory = { lastSeenX: 0, lastSeenY: 0, timeSinceSeen: 99, senseTimer: 0 };
  root.rng = Math.random;
  root.brainState = initBrain(nspec.brain);
  placeChildren(root);
  root.anchorX = root.x;
  root.anchorY = root.y;
  fireEvent(root, root, "spawn", null);
  return root;
}

function makeInstance(def, parent, root) {
  const inst = {
    kind: "spec",
    spec: def,
    id: def.id,
    tags: def.tags,
    parent,
    root: root, // fixed up below for the root itself
    x: 0, y: 0,
    w: def.body.w,
    h: def.body.h,
    vx: 0, vy: 0,
    onGround: false,
    facing: -1,
    color: def.visual.color,
    name: def.id,
    alive: true,
    disabled: false,
    health: def.health ? def.health.max : null, // null = indestructible decoration
    maxHealth: def.health ? def.health.max : null,
    vars: { ...def.vars },
    motion: def.motion ? { ...def.motion } : null,
    aliveTime: 0,
    dash: null,
    moveOrder: null,
    ttl: def.life ? def.life.ttl : null,
    depth: 0,
    telegraph: 0,
    contactCooldown: 0,
    hitFlash: 0,
    burn: null,
    slow: null,
    hoverPhase: Math.random() * Math.PI * 2,
    orbitAngle: Math.random() * 360,
    children: [],
  };
  if (!root) inst.root = inst;
  for (const c of def.children) {
    inst.children.push(makeInstance(c, inst, inst.root));
  }
  // motion "velocity" means: start at this velocity, then let physics carry it
  if (inst.motion && inst.motion.type === "velocity") {
    inst.vx = inst.motion.vx || 0;
    inst.vy = inst.motion.vy || 0;
  }
  return inst;
}

// Position children at their `at` offsets (center-relative) once the root sits.
function placeChildren(ent) {
  for (const c of ent.children) {
    c.x = ent.x + ent.w / 2 + c.spec.at[0] - c.w / 2;
    c.y = ent.y + ent.h / 2 + c.spec.at[1] - c.h / 2;
    c.anchorX = c.x;
    c.anchorY = c.y;
    placeChildren(c);
  }
}

function initBrain(brain) {
  return {
    def: brain,
    current: brain.start,
    stateTime: 0,
    tracks: makeTrackStates(brain.states[brain.start]),
    decisionTimer: 0,
    commit: null, // { action, phase: "windup"|"steps"|"recovery", t, track }
    cooldowns: {}, // actionId → readyAt (root.age)
    lastDecision: null, // utility mode: last scoring pass, for the Behavior Lab
  };
}

export function makeTrackStates(state) {
  return (state.tracks || []).map(() => ({ i: 0, block: null, done: false, blockedThisLoop: false }));
}

// ---- per-frame update -----------------------------------------------------

export function updateSpecEnemy(root, dt, scene, ctx) {
  if (!root.alive) return;
  cacheHost(root, scene, ctx);
  root.age += dt;
  updateSense(root, scene, dt);
  tickBrain(root, dt, scene, ctx);
  updateTree(root, root, dt, scene, ctx);
  for (const sp of root.spawned) {
    if (sp.alive) updateTree(root, sp, dt, scene, ctx);
  }
  if (root.spawned.some((s) => !s.alive)) root.spawned = root.spawned.filter((s) => s.alive);
}

// Update one entity + recurse into children (parent moves first so followers
// track the fresh position).
function updateTree(root, ent, dt, scene, ctx) {
  if (!ent.alive) return;
  ent.aliveTime += dt;
  if (ent.telegraph > 0) ent.telegraph -= dt;
  if (ent.contactCooldown > 0) ent.contactCooldown -= dt;

  if (!ent.disabled) {
    moveEntity(root, ent, dt, scene);

    // Flyers don't pass through platforms (grounded entities collide inside
    // stepActor): projectile-likes die on terrain like plain projectiles;
    // other flyers get pushed out. body.ghost opts a design out entirely.
    if (ent.spec.body.gravity === 0 && !ent.spec.body.ghost && !isFollower(ent)) {
      resolveFlyerTerrain(root, ent, scene, ctx);
      if (!ent.alive) return;
    }

    // lifetime
    if (ent.ttl !== null) {
      ent.ttl -= dt;
      if (ent.ttl <= 0) {
        killEntity(root, ent, null, scene, ctx);
        return;
      }
    }

    // contact damage to soldiers
    const con = ent.spec.contact;
    if (con && con.damage > 0 && ent.contactCooldown <= 0) {
      for (const s of scene.soldiers) {
        if (!s.alive || !overlaps(ent, s)) continue;
        ctx.damage(s, con.damage, root);
        if (con.knockback) {
          s.vx += Math.sign(s.x - ent.x) * con.knockback;
          s.vy -= con.knockback * 0.35;
        }
        ent.contactCooldown = con.cooldown;
        if (con.destroySelf) {
          killEntity(root, ent, null, scene, ctx);
          return;
        }
        break;
      }
    }
  }

  for (const c of ent.children) updateTree(root, c, dt, scene, ctx);
}

// ---- movement -------------------------------------------------------------

// The primary target a spec agent tracks resolves through perception's
// nearestHostile(root, scene) — team-aware (enemies hunt the squad, companions
// hunt the enemy roots) and nearest-first. See perception.js.

const cx = (e) => e.x + e.w / 2;
const cy = (e) => e.y + e.h / 2;

function isFollower(ent) {
  return !!(ent.parent && ent.spec.link && ent.spec.link.followParent && !ent.detached);
}

// Terrain response for a flying entity overlapping a platform. Projectile-likes
// (contact.destroySelf) are destroyed — consistent with plain projectiles dying
// on walls in combat.js, and it makes cover work against homing missiles; their
// on.destroy still fires (a seeker bursts into shards against a wall). Anything
// else is pushed out along the smallest overlap axis. A short spawn grace keeps
// an emitter flush against a wall from killing its own shot on frame one.
function resolveFlyerTerrain(root, ent, scene, ctx) {
  for (const p of scene.platforms) {
    if (!overlaps(ent, p)) continue;
    const con = ent.spec.contact;
    if (con && con.destroySelf) {
      if (ent.aliveTime > 0.08) {
        ctx.spark && ctx.spark(ent.x + ent.w / 2, ent.y + ent.h / 2, ent.color, 5, 110);
        killEntity(root, ent, null, scene, ctx);
      }
      return;
    }
    const pushUp = ent.y + ent.h - p.y;
    const pushDown = p.y + p.h - ent.y;
    const pushLeft = ent.x + ent.w - p.x;
    const pushRight = p.x + p.w - ent.x;
    const min = Math.min(pushUp, pushDown, pushLeft, pushRight);
    if (min === pushUp) {
      ent.y -= pushUp;
      ent.anchorY -= pushUp; // hover recomputes y from its anchor — move it too, or it re-penetrates
      if (ent.vy > 0) ent.vy = 0;
    } else if (min === pushDown) {
      ent.y += pushDown;
      ent.anchorY += pushDown;
      if (ent.vy < 0) ent.vy = 0;
    } else if (min === pushLeft) {
      ent.x -= pushLeft;
      if (ent.vx > 0) ent.vx = 0;
    } else {
      ent.x += pushRight;
      if (ent.vx < 0) ent.vx = 0;
    }
  }
}

// Movement is two layers now (docs/LOCOMOTOR-REFACTOR.md): this file (the brain
// layer) decides the ONE MotionRequest an entity wants this frame — resolving
// targets and reproducing the dash > moveOrder > controller arbitration — and
// hands it to the body's locomotor (locomotion.js), which actuates it, integrates
// physics, and sets facing. Target resolution stays HERE so a request's points
// are always concrete world coordinates.
function moveEntity(root, ent, dt, scene) {
  // followers ride their parent; no independent physics
  if (isFollower(ent)) {
    const p = ent.parent;
    ent.x = p.x + p.w / 2 + ent.spec.at[0] - ent.w / 2;
    ent.y = p.y + p.h / 2 + ent.spec.at[1] - ent.h / 2;
    ent.facing = p.facing;
    return;
  }
  const req = motionRequest(root, ent, dt, scene);
  locomotorFor(ent).apply(ent, req, dt, scene);
}

// Per-frame arbitration: an active dash wins, else an active moveOrder (→ steer
// to its point, with the arrival/timeout stop), else the standing controller.
// dash/moveOrder/patrolDir/timeout state lives on the entity; the locomotor is
// stateless. Every request carries `target` for the locomotor's facing.
function motionRequest(root, ent, dt, scene) {
  const target = nearestHostile(root, scene);
  let req;

  if (ent.dash) {
    ent.dash.t -= dt;
    const expire = ent.dash.t <= 0;
    // a committed burst: the locomotor picks its axes (legged = horizontal only)
    req = { kind: "burst", ux: ent.dash.ux, uy: ent.dash.uy, speed: ent.dash.speed, expire };
    if (expire) ent.dash = null;
  } else if (ent.moveOrder) {
    const o = ent.moveOrder;
    req = { kind: "steer", point: { x: o.x, y: o.y }, speed: o.speed };
    o.timeout -= dt;
    if (o.timeout <= 0 || Math.hypot(o.x - cx(ent), o.y - cy(ent)) < 12) {
      ent.moveOrder = null;
      req = { kind: "stop" };
    }
  } else if (ent.motion) {
    req = controllerRequest(root, ent, ent.motion, dt, scene, target);
  } else {
    req = { kind: "coast" };
  }
  req.target = target;
  return req;
}

// Translate one of the 10 standing controllers into a MotionRequest. Steering
// controllers resolve a concrete point here; kinematic styles (flyer-only)
// pass their pre-resolved params for the locomotor to apply verbatim.
function controllerRequest(root, ent, m, dt, scene, target) {
  switch (m.type) {
    case "static":
      return { kind: "stop" };
    case "velocity":
      return { kind: "coast" }; // launched at instantiate; physics carries it
    case "gravity":
      return { kind: "brakeX", factor: 0.8 };
    case "moveTo": {
      const at = resolveTargetPoint(root, ent, m.target, scene, target, m.offset);
      return at ? { kind: "steer", point: at, speed: m.speed } : { kind: "coast" };
    }
    case "patrol": {
      const half = (m.range || 160) / 2;
      if (ent.patrolDir === undefined) ent.patrolDir = 1;
      if (cx(ent) > ent.anchorX + ent.w / 2 + half) ent.patrolDir = -1;
      else if (cx(ent) < ent.anchorX + ent.w / 2 - half) ent.patrolDir = 1;
      else if (ent.vx === 0 && ent.onGround) ent.patrolDir *= -1; // bumped a wall
      return { kind: "driveX", v: ent.patrolDir * m.speed };
    }
    case "chase": {
      if (!target) return { kind: "stopX" };
      const point = { x: cx(target), y: cy(target) };
      // a flyer steers in both axes; a legged body drives horizontally and lets
      // its locomotor decide when to hop (target above) to traverse.
      if (ent.spec.body.gravity === 0) return { kind: "steer", point, speed: m.speed };
      return { kind: "driveX", v: (point.x >= cx(ent) ? 1 : -1) * m.speed, hopToward: point };
    }
    case "keepDistance": {
      if (!target) return { kind: "brakeX", factor: 0.7 };
      return { kind: "holdRange", point: { x: cx(target), y: cy(target) }, min: m.min, max: m.max, speed: m.speed };
    }
    case "home": {
      if (!target) return { kind: "coast" };
      return { kind: "kinematic", style: "home", point: { x: cx(target), y: cy(target) }, speed: m.speed, turnRate: m.turnRate || 3 };
    }
    case "orbit": {
      const center = m.around === "player" && target
        ? { x: cx(target), y: cy(target) }
        : ent.parent
          ? { x: cx(ent.parent), y: cy(ent.parent) }
          : { x: ent.anchorX + ent.w / 2, y: ent.anchorY + ent.h / 2 };
      return { kind: "kinematic", style: "orbit", center, radius: m.radius, degPerSec: m.degPerSec || 90 };
    }
    case "hover":
      return {
        kind: "kinematic", style: "hover",
        amplitude: m.amplitude || 14, rate: m.rate || 2.4, driftSpeed: m.driftSpeed || 40,
        altitude: m.altitude, climbSpeed: m.climbSpeed ?? 90,
        groundTop: typeof m.altitude === "number" ? groundTopBelow(ent, scene) : null,
        driftTargetX: target ? cx(target) : null,
      };
  }
  return { kind: "coast" };
}

// Resolve a moveTo/dash target to a world point. `offset: [along, up]` shifts
// the point along the entity→target line (positive = PAST the target — the
// fly-through strafing point; negative = a standoff short of it) and
// vertically (negative = above). "lastSeen" is the perception memory — null
// until the player has actually been seen once.
function resolveTargetPoint(root, ent, target, scene, playerEnt, offset) {
  let base = null;
  if (Array.isArray(target)) base = { x: target[0], y: target[1] };
  else if (target === "player" && playerEnt) base = { x: cx(playerEnt), y: cy(playerEnt) };
  else if (target === "parent" && ent.parent) base = { x: cx(ent.parent), y: cy(ent.parent) };
  else if (target === "spawn") base = { x: ent.anchorX + ent.w / 2, y: ent.anchorY + ent.h / 2 };
  else if (target === "anchor" && root.anchor) base = { x: root.anchor.x, y: root.anchor.y };
  else if (target === "lastSeen" && root.memory && root.memory.seenOnce) {
    base = { x: root.memory.lastSeenX, y: root.memory.lastSeenY };
  }
  if (!base) return null;
  if (Array.isArray(offset) && offset.length === 2) {
    const dx = base.x - cx(ent);
    const dy = base.y - cy(ent);
    const len = Math.hypot(dx, dy) || 1;
    base = { x: base.x + (dx / len) * offset[0], y: base.y + offset[1] };
  }
  return base;
}

// Top of the ground directly beneath a flying entity's center (world bottom if
// nothing is below) — the reference surface for hover's altitude-hold.
function groundTopBelow(ent, scene) {
  const midX = ent.x + ent.w / 2;
  let best = scene.world.height;
  for (const p of scene.platforms) {
    if (midX >= p.x && midX <= p.x + p.w && p.y >= ent.y + ent.h / 2 && p.y < best) best = p.y;
  }
  return best;
}

// ---- entity lookup / selectors -------------------------------------------

export function findEntity(root, id) {
  if (id === "root" || id === root.id) return root;
  const walk = (e) => {
    if (e.id === id) return e;
    for (const c of e.children) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  const inTree = walk(root);
  if (inTree) return inTree;
  for (const sp of root.spawned) {
    const hit = walk(sp);
    if (hit) return hit;
  }
  return null;
}

// All live damageable instances (health-bearing, enabled) — the host's target
// list. Includes the root, parts, and shootable spawned entities.
export function collidables(root) {
  const out = [];
  const walk = (e) => {
    if (!e.alive || e.disabled) return;
    if (e.health !== null) out.push(e);
    for (const c of e.children) walk(c);
  };
  walk(root);
  for (const sp of root.spawned) walk(sp);
  return out;
}

function allAlive(root) {
  const out = [];
  const walk = (e) => {
    if (!e.alive) return;
    out.push(e);
    for (const c of e.children) walk(c);
  };
  walk(root);
  for (const sp of root.spawned) walk(sp);
  return out;
}

// ---- damage + death -------------------------------------------------------

export function applyDamage(root, ent, amount, owner, scene, ctx) {
  if (!ent.alive || ent.disabled || ent.health === null) return;
  cacheHost(root, scene, ctx);
  ent.health -= amount;
  ent.hitFlash = 0.12;
  fireEvent(root, ent, "damage", { amount });
  if (ent.health <= 0) killEntity(root, ent, owner, scene, ctx);
  else if (amount > 0 && scene.sound) {
    const hurt = specSound(root.specTop, "hurt");
    scene.sound(hurt.cue, { x: cx(ent), y: cy(ent), gain: hurt.gain });
  }
}

// Death cascade: own destroy event → link policy for children → parent
// childDestroyed. Killing the root kills the whole tree (spawned entities live
// on — a dying boss's missiles don't vanish mid-air).
export function killEntity(root, ent, owner, scene, ctx) {
  cacheHost(root, scene, ctx);
  if (!ent.alive) return;
  ent.alive = false;
  fireEvent(root, ent, "destroy", { owner });

  const ownDeath = ent.spec.link ? ent.spec.link.onOwnDeath : "destroy";
  if (ownDeath === "transform" && ent.spec.link.transformTo) {
    spawnFromDef(root, ent.spec.link.transformTo, cx(ent), cy(ent), { vx: 0, vy: 0, depth: ent.depth + 1 }, scene, ctx);
  }

  for (const c of ent.children) {
    if (!c.alive) continue;
    const policy = c.spec.link ? c.spec.link.onParentDeath : "destroy";
    if (policy === "destroy") removeSilently(c);
    else if (policy === "disable") c.disabled = true;
    else if (policy === "detach" || policy === "ignore") detachChild(root, c);
    else if (policy === "transform" && c.spec.link.transformTo) {
      removeSilently(c);
      spawnFromDef(root, c.spec.link.transformTo, cx(c), cy(c), { vx: 0, vy: 0, depth: c.depth + 1 }, scene, ctx);
    }
  }

  if (ent.parent && ent.parent.alive) {
    fireEvent(root, ent.parent, "childDestroyed", { id: ent.id });
    // onOwnDeath "detach": leave a corpse-part that becomes independent debris
    if (ownDeath === "detach") {
      // (dead entity stays in the tree but is no longer drawn/collidable)
    }
  }
  if (ctx.burst && ent.maxHealth) ctx.burst(cx(ent), cy(ent), ent.color, ent.isRoot ? 18 : 9, 240);
  // Root deaths are announced by the mission's own root-death polling (which
  // also owns kill credit + loot); here we only voice destructible PARTS, so a
  // dying enemy isn't double-reported.
  if (!ent.isRoot && ent.maxHealth && scene.sound) {
    const part = specSound(root.specTop, "part");
    scene.sound(part.cue, { x: cx(ent), y: cy(ent), gain: part.gain });
  }
}

function removeSilently(ent) {
  ent.alive = false;
  for (const c of ent.children) removeSilently(c);
}

// A detached child becomes an independent mover: it leaves the follow
// relationship, keeps its position, and (if it has gravity) falls.
function detachChild(root, ent) {
  ent.detached = true;
  if (ent.spec.link) ent.spec = { ...ent.spec, link: { ...ent.spec.link, followParent: false } };
}

// ---- events + signals -----------------------------------------------------

// Event handlers and signal handlers run OUTSIDE the normal step pump, so they
// read the host off the root rather than taking it as an argument. Refresh that
// cache at every entry point that has a host — previously only execStep did, so
// an `on: { damage: [...] }` handler silently no-opped on any enemy whose brain
// had not yet run a step (motion-only enemies never ran one at all).
//
// `instantiate` still fires `on.spawn` with no host — there genuinely isn't one
// yet — so scene-touching actions there are skipped, not crashed.
function cacheHost(root, scene, ctx) {
  if (scene) root._scene = scene;
  if (ctx) root._ctx = ctx;
}

export function fireEvent(root, ent, name, payload) {
  const steps = ent.spec.on && ent.spec.on[name];
  if (steps && steps.length) execStepsInstant(root, ent, steps, root._scene, root._ctx);
}

export function raiseSignal(root, name) {
  root.pendingSignals.push(name);
  const key = `signal:${name}`;
  for (const e of allAlive(root)) {
    const steps = e.spec.on && e.spec.on[key];
    if (steps && steps.length) execStepsInstant(root, e, steps, root._scene, root._ctx);
  }
}

// ---- step execution -------------------------------------------------------
// execStep returns a block descriptor ({ kind:"time", t } | { kind:"move" }) or
// null if the step completed instantly. Event handlers/enter lists run through
// execStepsInstant, which validation guarantees contain no blocking steps.

export function execStepsInstant(root, self, steps, scene, ctx) {
  for (const step of steps) execStep(root, self, step, scene, ctx);
}

export function execStep(root, self, step, scene, ctx) {
  // stash scene/ctx so event cascades (destroy → spawn) can reach them
  root._scene = scene;
  root._ctx = ctx;
  const name = Object.keys(step).find((k) => k !== "id");
  const args = step[name];

  switch (name) {
    case "wait": {
      const t = typeof args === "number" ? args : rand(root, args.range[0], args.range[1]);
      return { kind: "time", t };
    }
    case "telegraph": {
      const part = args.part ? findEntity(root, args.part) : self;
      if (part) part.telegraph = args.time;
      return { kind: "time", t: args.time };
    }
    case "moveTo": {
      const at = args.at
        ? { x: args.at[0], y: args.at[1] }
        : resolveTargetPoint(root, self, args.target, scene, nearestHostile(root, scene), args.offset);
      if (!at) return null;
      self.moveOrder = { x: at.x, y: at.y, speed: args.speed || 160, timeout: args.timeout || 3 };
      return { kind: "move" };
    }
    case "dash": {
      // A body-agnostic committed burst: resolve a UNIT direction (both axes)
      // and speed here; the locomotor decides which axes its body uses (a legged
      // body takes the horizontal only, a flyer takes both). No body knowledge
      // leaks into the brain (docs/LOCOMOTOR-REFACTOR.md, Slice L2).
      const t = nearestHostile(root, scene);
      const speed = args.speed || 300;
      let ux, uy;
      // aimed dash: toward a resolved point (offset past the target = a strafing pass)
      if (args.target || args.at || args.offset) {
        const at = args.at
          ? { x: args.at[0], y: args.at[1] }
          : resolveTargetPoint(root, self, args.target || "player", scene, t, args.offset);
        if (at) {
          const dx = at.x - cx(self);
          const dy = at.y - cy(self);
          const len = Math.hypot(dx, dy) || 1;
          ux = dx / len;
          uy = dy / len;
        }
      }
      if (ux === undefined) {
        // simple toward/away burst
        let dir;
        if (args.away && t) dir = Math.sign(cx(self) - cx(t)) || 1;
        else if (t) dir = Math.sign(cx(t) - cx(self)) || self.facing;
        else dir = self.facing;
        ux = dir;
        uy = t ? Math.sign(cy(t) - cy(self)) * 0.4 : 0;
      }
      self.dash = { ux, uy, speed, t: args.duration };
      return { kind: "time", t: args.duration };
    }
    case "jump":
      // Body-agnostic: the brain says "hop", the locomotor owns the impulse
      // (legacy jump.vy is accepted but inert — the body decides now).
      locomotorFor(self).jump(self);
      return null;
    case "fire":
      // A soldier-bodied agent (a companion) fires its EQUIPPED weapon through
      // the shared fire() path, not the emitter pipeline — the host installs
      // self.fireWeapon (see companion bridge). Everyone else uses emitters.
      if (self.fireWeapon) self.fireWeapon(args, scene);
      else doFire(root, self, args, scene, ctx);
      return null;
    case "sound": {
      const id = typeof args === "string" ? args : args && args.id;
      // `scene` is undefined for on.spawn handlers (instantiate fires them
      // before any scene exists), so guard it like every other call site.
      if (id && scene && scene.sound) {
        scene.sound(id, {
          x: cx(self), y: cy(self),
          gain: (args && args.gain) ?? 1,
          pitch: (args && args.pitch) ?? 1,
        });
      }
      return null;
    }
    case "spawn": {
      const count = args.count || 1;
      const speed = args.speed || 200;
      const angles = patternAngles(root, self, args.pattern || "ring", count, args.spreadDeg, scene, "current");
      for (const a of angles) {
        spawnFromDef(root, args.ref, cx(self), cy(self), { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, depth: self.depth + 1 }, scene, ctx);
      }
      return null;
    }
    case "setMotion": {
      const target = args.target ? findEntity(root, args.target) : self;
      if (target) {
        const { target: _t, ...params } = args;
        target.motion = { ...params };
        target.moveOrder = null;
        target.dash = null;
        // switching to a grounded controller re-enables gravity
        if (params.type === "gravity") target.spec = { ...target.spec, body: { ...target.spec.body, gravity: 1 } };
      }
      return null;
    }
    case "set": case "add": case "mul":
      mutatePath(root, self, args.target, args.value, name);
      return null;
    case "signal":
      raiseSignal(root, typeof args === "string" ? args : args.name);
      return null;
    case "destroy": {
      const target = resolveEntityArg(root, self, args);
      if (target) killEntity(root, target, null, scene, ctx);
      return null;
    }
    case "detach": {
      const target = resolveEntityArg(root, self, args);
      if (target) detachChild(root, target);
      return null;
    }
    case "enable": case "disable": {
      const target = resolveEntityArg(root, self, args);
      if (target) target.disabled = name === "disable";
      return null;
    }
    case "if": {
      const ok = truthyEval(root, self, scene, args.when);
      execStepsInstant(root, self, ok ? args.then : args.else || [], scene, ctx);
      return null;
    }
  }
  return null;
}

function resolveEntityArg(root, self, args) {
  const id = args && args.target;
  if (!id || id === "self") return self;
  return findEntity(root, id);
}

function mutatePath(root, self, path, value, op) {
  const parts = path.split(".");
  const head = parts.shift();
  let obj = head === "self" ? self : head === "root" ? root : findEntity(root, head);
  if (!obj) return;
  while (parts.length > 1) {
    const k = parts.shift();
    if (obj[k] === undefined || obj[k] === null || typeof obj[k] !== "object") return;
    obj = obj[k];
  }
  const key = parts[0];
  if (key === undefined) return;
  const cur = typeof obj[key] === "number" ? obj[key] : 0;
  obj[key] = op === "set" ? value : op === "add" ? cur + value : cur * value;
}

// ---- firing + spawning ----------------------------------------------------

function doFire(root, self, args, scene, ctx) {
  const em = resolveEmitter(root, self, args.emitter);
  if (!em) return;
  const { owner, def } = em;
  if (!owner.alive || owner.disabled) return;

  const ox = cx(owner) + def.at[0];
  const oy = cy(owner) + def.at[1];
  const count = args.count || 1;
  const pattern = args.pattern || (count > 1 ? "fan" : "aimed");
  const angles = patternAngles(root, owner, pattern, count, args.spreadDeg, scene, args.aim || "current", { x: ox, y: oy });

  for (const a of angles) {
    if (def.ref) {
      const speed = args.speed || 200;
      spawnFromDef(root, def.ref, ox, oy, { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, depth: owner.depth + 1 }, scene, ctx);
    } else {
      const p = def.projectile;
      const speed = args.speed || p.speed;
      // team follows the agent's allegiance (root.team): an enemy spec's rounds
      // hit the squad; a player-team spec's rounds hit the enemy roster.
      scene.projectiles.push(
        new Projectile(ox, oy, Math.cos(a) * speed, Math.sin(a) * speed, p, root.team, p.effects, root)
      );
    }
  }
  owner.muzzleFlash = 0.055;
  owner.muzzleColor = def.projectile ? def.projectile.color : "#ff8a5a";
  // One cue per fire ACTION, not per angle — a 9-shot fan is one report.
  if (scene.sound) {
    const shot = emitterSound(root.specTop, def);
    scene.sound(shot.cue, { x: ox, y: oy, gain: shot.gain });
  }
}

function resolveEmitter(root, self, ref) {
  const parts = String(ref).split(".");
  if (parts.length === 2) {
    const owner = findEntity(root, parts[0]);
    const def = owner && owner.spec.emitters && owner.spec.emitters[parts[1]];
    return def ? { owner, def } : null;
  }
  // bare name: self first, then anywhere in the tree
  if (self.spec.emitters && self.spec.emitters[parts[0]]) return { owner: self, def: self.spec.emitters[parts[0]] };
  for (const e of allAlive(root)) {
    if (e.spec.emitters && e.spec.emitters[parts[0]]) return { owner: e, def: e.spec.emitters[parts[0]] };
  }
  return null;
}

// Initial launch angles for a pattern. Aim styles (smarter-AI doc §3): current
// position, lead (position + velocity * predictionTime), landing (lead in x,
// player's feet line in y).
function patternAngles(root, from, pattern, count, spreadDeg, scene, aim, origin) {
  const o = origin || { x: cx(from), y: cy(from) };
  const t = nearestHostile(root, scene);
  let base = from.facing >= 0 ? 0 : Math.PI;
  if (t && pattern !== "single") {
    let tx = cx(t);
    // Aim at the target's centre. For a soldier this tracks their live centre,
    // which drops when they crouch — so crouching ducks a shot already in flight
    // (aimed at the standing centre) but is NOT permanent cover: the next shot
    // re-aims at the lower crouched centre.
    let ty = cy(t);
    if (aim === "lead" || aim === "landing") {
      const pt = 0.15 + root.rng() * 0.3;
      tx += (t.vx || 0) * pt;
      if (aim === "lead") ty += (t.vy || 0) * pt;
      else ty = t.y + t.h; // landing: the feet line
    }
    base = Math.atan2(ty - o.y, tx - o.x);
  }

  const angles = [];
  switch (pattern) {
    case "ring": {
      for (let i = 0; i < count; i++) angles.push((i / count) * Math.PI * 2);
      break;
    }
    case "fan": {
      const spread = ((spreadDeg ?? 40) * Math.PI) / 180;
      if (count === 1) angles.push(base);
      else for (let i = 0; i < count; i++) angles.push(base - spread / 2 + (spread * i) / (count - 1));
      break;
    }
    case "burst": {
      for (let i = 0; i < count; i++) angles.push(base + (root.rng() - 0.5) * 0.1 * config.labAimErrorScale);
      break;
    }
    case "single":
      angles.push(base);
      break;
    case "aimed":
    default: {
      const jitter = ((spreadDeg ?? 4) * Math.PI * config.labAimErrorScale) / 180;
      for (let i = 0; i < count; i++) angles.push(base + (root.rng() - 0.5) * jitter);
      break;
    }
  }
  return angles;
}

// Spawn an independent entity tree from defs, honoring the spec's limits.
export function spawnFromDef(root, defId, x, y, { vx = 0, vy = 0, depth = 1 } = {}, scene, ctx) {
  const def = root.specTop.defs[defId];
  if (!def) return null;

  const lim = root.specTop.limits;
  if (depth > lim.maxSpawnDepth) return null;
  const aliveCount = root.spawned.filter((s) => s.alive).length;
  if (aliveCount >= lim.maxAlive) return null;
  const now = root.age;
  root.spawnStamps = root.spawnStamps.filter((s) => now - s < 1);
  if (root.spawnStamps.length >= lim.maxSpawnsPerSecond) return null;
  root.spawnStamps.push(now);

  const inst = makeInstance(def, null, root);
  inst.root = root;
  inst.depth = depth;
  inst.x = x - inst.w / 2;
  inst.y = y - inst.h / 2;
  inst.anchorX = inst.x;
  inst.anchorY = inst.y;
  inst.vx = vx;
  inst.vy = vy;
  placeChildren(inst);
  root.spawned.push(inst);
  fireEvent(root, inst, "spawn", null);
  return inst;
}

// ---- expression context ---------------------------------------------------
// The ctx expr.js evaluates against: dotted identifier resolution + the
// whitelisted function set, all scoped to (root, self, scene).

export function exprCtx(root, self, scene) {
  const t = nearestHostile(root, scene);
  return {
    get(path) {
      const [head, ...rest] = path.split(".");
      let base;
      if (head === "self") base = entityProps(self);
      else if (head === "root") base = entityProps(root);
      else if (head === "player") base = t ? playerProps(t) : {};
      else if (head === "arena") base = { time: root.age, width: scene.world.width, height: scene.world.height };
      else if (head === "sense") base = root.sense;
      else {
        const e = findEntity(root, head);
        base = e ? entityProps(e) : {};
      }
      let v = base;
      for (const k of rest) {
        if (v == null) return 0;
        v = v[k];
      }
      return v === undefined || v === null ? 0 : v;
    },
    fn(name, args) {
      switch (name) {
        case "alive": {
          const e = findEntity(root, args[0]);
          return !!(e && e.alive && !e.disabled);
        }
        case "exists":
          return !!findEntity(root, args[0]);
        case "distance": {
          const a = resolveRef(root, self, scene, args[0], t);
          const b = resolveRef(root, self, scene, args[1], t);
          if (!a || !b) return 99999;
          return Math.hypot(cx(a) - cx(b), cy(a) - cy(b));
        }
        case "countAlive": {
          const sel = String(args[0]);
          const pool = allAlive(root);
          if (sel.startsWith("tag:")) {
            const tag = sel.slice(4);
            return pool.filter((e) => e.tags.includes(tag)).length;
          }
          return pool.filter((e) => e.id === sel).length;
        }
        case "hasTag": {
          const e = findEntity(root, args[0]);
          return !!(e && e.tags.includes(args[1]));
        }
        case "randomChance":
          return root.rng() < args[0];
        case "min": return Math.min(...args);
        case "max": return Math.max(...args);
        case "abs": return Math.abs(args[0]);
        case "clamp": return Math.max(args[1], Math.min(args[2], args[0]));
      }
      return 0;
    },
  };
}

function resolveRef(root, self, scene, ref, t) {
  if (ref === "self") return self;
  if (ref === "player") return t;
  if (ref === "root") return root;
  return findEntity(root, ref);
}

function entityProps(e) {
  return {
    hpPct: e.maxHealth ? Math.max(0, e.health) / e.maxHealth : 1,
    x: cx(e),
    y: cy(e),
    vx: e.vx,
    vy: e.vy,
    onGround: e.onGround,
    facing: e.facing,
    vars: e.vars,
  };
}

function playerProps(t) {
  return {
    x: t.x + t.w / 2,
    y: t.y + t.h / 2,
    vx: t.vx || 0,
    vy: t.vy || 0,
    isGrounded: !!t.onGround,
    crouched: !!t.crouched,
  };
}

export function truthyEval(root, self, scene, src) {
  try {
    const { evaluate } = evalModule;
    const v = evaluate(src, exprCtx(root, self, scene));
    return v === true || (typeof v === "number" && v !== 0);
  } catch {
    return false; // validated specs shouldn't get here; degrade quietly if they do
  }
}

export function numberEval(root, self, scene, src) {
  try {
    const { evaluate } = evalModule;
    const v = evaluate(src, exprCtx(root, self, scene));
    return typeof v === "number" ? v : v === true ? 1 : 0;
  } catch {
    return 0;
  }
}

// late import binding to keep game-side/mission-side layering readable
import * as evalModule from "../../game/enemyspec/expr.js";

function rand(root, a, b) {
  return a + root.rng() * (b - a);
}
