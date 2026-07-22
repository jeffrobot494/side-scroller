// ---------------------------------------------------------------------------
// DRY RUN — instantiate a spec in a hidden arena and prove it behaves (doc §10.5).
//
// The last gate before a spec is accepted (Designer save, LLM pipeline) and a
// test utility: simulate several seconds against a stationary dummy player at
// a fixed step, then assert the enemy actually works as an enemy:
//   moved       it changed position (or is a deliberate turret that attacked)
//   attacked    it produced projectiles / spawned entities / dealt contact damage
//   damageable  applying damage reduces its health
//   killable    lethal damage kills it without the death cascade throwing
//   limits      live spawned entities never exceeded limits.maxAlive
// Any runtime throw is caught and reported — a spec that crashes the sim is
// rejected, never loaded.
//
// dryRunSpec(normalizedSpec, opts) → { ok, facts, errors: [msg] }
// ---------------------------------------------------------------------------

import { instantiate, updateSpecEnemy, applyDamage, collidables } from "../../mission/enemyspec/runtime.js";
import { updateProjectiles } from "../../mission/combat.js";

const STEP = 1 / 60;

export function dryRunSpec(nspec, { seconds = 6 } = {}) {
  const errors = [];
  const facts = {
    moved: false,
    attacked: false,
    damageable: false,
    killable: false,
    maxAliveSeen: 0,
    projectilesFired: 0,
    damageToPlayer: 0,
    partsAtStart: 0,
  };

  const scene = makeArena();
  const dummy = scene.soldiers[0];

  let root;
  try {
    // spawn resting on the ground so `moved` measures intent, not the drop-in
    root = instantiate(nspec, 340, 500 - nspec.root.body.h);
    facts.partsAtStart = collidables(root).length;
  } catch (e) {
    return { ok: false, facts, errors: [`instantiate threw: ${e.message}`] };
  }

  const ctx = {
    friendlyFire: false,
    damageMult: 1,
    damage: (t, amount, owner) => {
      if (t === dummy) {
        facts.damageToPlayer += amount;
        return; // the dummy soaks hits so the sim keeps running
      }
      if (t.kind === "spec") applyDamage(root, t, amount, owner, scene, ctx);
    },
    kill: () => {},
  };

  const startX = root.x;
  const startY = root.y;
  const steps = Math.round(seconds / STEP);

  try {
    for (let i = 0; i < steps; i++) {
      updateSpecEnemy(root, STEP, scene, ctx);
      // keep enemy projectiles resolving against the dummy
      scene.enemies = collidables(root);
      updateProjectiles(scene, STEP, ctx);

      const liveSpawned = root.spawned.filter((s) => s.alive).length;
      facts.maxAliveSeen = Math.max(facts.maxAliveSeen, liveSpawned);
      if (scene.projectiles.length) facts.projectilesFired = Math.max(facts.projectilesFired, scene.projectiles.length);
      if (!facts.moved && (Math.abs(root.x - startX) > 8 || Math.abs(root.y - startY) > 8)) facts.moved = true;
      if (!facts.attacked && (scene.projectiles.length > 0 || liveSpawned > 0 || facts.damageToPlayer > 0)) facts.attacked = true;
    }
  } catch (e) {
    errors.push(`simulation threw: ${e.message}`);
    return { ok: false, facts, errors };
  }

  if (facts.maxAliveSeen > nspec.limits.maxAlive) {
    errors.push(`spawn limit exceeded: ${facts.maxAliveSeen} > maxAlive ${nspec.limits.maxAlive}`);
  }

  // ---- damage + death on a fresh instance (the sim one may have moved off) --
  try {
    const victim = instantiate(nspec, 340, 500 - nspec.root.body.h);
    const before = victim.health;
    applyDamage(victim, victim, 5, null, scene, ctx);
    facts.damageable = victim.health === before - 5;
    applyDamage(victim, victim, 1e9, null, scene, ctx);
    facts.killable = !victim.alive;
  } catch (e) {
    errors.push(`damage path threw: ${e.message}`);
  }

  if (!facts.damageable) errors.push("enemy did not take damage");
  if (!facts.killable) errors.push("enemy did not die from lethal damage");
  if (!facts.moved && !facts.attacked) errors.push("enemy neither moved nor attacked in the dry run — it does nothing");

  return { ok: errors.length === 0, facts, errors };
}

// A flat hidden arena with one stationary dummy soldier.
function makeArena() {
  return {
    world: { width: 1400, height: 540, gravity: 2000 },
    platforms: [{ x: 0, y: 500, w: 1400, h: 40 }],
    soldiers: [
      { kind: "soldier", x: 900, y: 454, w: 30, h: 46, vx: 0, vy: 0, onGround: true, alive: true, health: 1e9, maxHealth: 1e9, facing: -1 },
    ],
    enemies: [],
    projectiles: [],
    loot: [],
  };
}
