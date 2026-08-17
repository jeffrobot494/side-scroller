// ---------------------------------------------------------------------------
// MISSION SCENE  (Phases 2–4)
//
// The action layer: a fixed-timestep run-and-gun on the canvas. Owns the world
// simulation (soldiers, companions, enemies, projectiles, loot), the HUD, and
// the win/lose conditions. When the mission ends it hands a result payload back
// to the app via the onComplete callback; it never touches game state directly.
// ---------------------------------------------------------------------------

import { MissionInput } from "./input.js";
import { loadMission, stepActor, overlaps, clamp, Loot, startReload, tickReload } from "./entities.js";
import { fire, updateCompanion, updateCompanionSpec, aimAccuracy } from "./ai.js";
import { updateProjectiles, updateStatuses } from "./combat.js";
import { drawProjectile } from "./render.js";
import {
  updateSpecEnemy, collidables,
  applyDamage as specDamage, killEntity as specKill,
} from "./enemyspec/runtime.js";
import { drawSpecEnemy } from "./enemyspec/render.js";
import { solveCamera, parseCanvasSize, DESIGN_W, DESIGN_H } from "./camera.js";
import { createFpsSampler } from "../game/fps.js";
import { config } from "../game/config.js";
import { audio } from "../audio/engine.js";
import { specSound } from "../audio/cues.js";

const STEP = 1 / 60;

export class Mission {
  constructor(canvas, onComplete) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onComplete = onComplete;
    this.input = new MissionInput();
    this.running = false;
    this.fps = createFpsSampler(); // outlives a single mission; reset in start()
    this._frame = this._frame.bind(this);
  }

  // `mission` = MISSIONS entry, `level` = the resolved LEVELS entry,
  // `squad` = [{ data, weapon }] chosen in the deploy screen.
  start(mission, level, squad) {
    this.mission = mission;
    this.scene = loadMission(level, squad);
    this.squadIds = this.scene.soldiers.map((s) => s.id);
    this.controlled = 0;
    this.camera = { x: 0, y: 0 };
    this.introTimer = 2.2;
    this.endBanner = null; // { success, timer } once the mission resolves
    this.result = null;

    // Bridge to the shared combat module: rules run in combat.js, cosmetics +
    // bookkeeping stay here. friendlyFire/damageMult read live from config.
    this._ctx = {
      get friendlyFire() { return config.friendlyFire; },
      get damageMult() { return config.playerDamageMult; },
      damage: (t, a, o) => this._damage(t, a, o),
      kill: (t, o) => this._kill(t, o),
      spark: (x, y, c, n, s) => this._sparks(x, y, c, n, s),
      burst: (x, y, c, n, s) => this._burst(x, y, c, n, s),
    };

    // The one sound hook. Installed on the SCENE (not _ctx) because ai.js
    // fire() takes a scene and no ctx — see tech/sound.md. Headless callers of
    // loadMission never set it, so every `scene.sound && …` site stays silent.
    this.scene.sound = (cue, opts) => audio.play(cue, opts);
    audio.play("mission.start");

    // Size the backing store BEFORE anything reads it: the motes below are
    // seeded in screen space, and assigning width/height clears the surface.
    this._applyCanvasSize();

    // cosmetic-only state (never read by game logic)
    this.time = 0;
    this.shake = 0;
    this.particles = [];
    // 46 spores at the classic size, scaled by area so a bigger canvas doesn't
    // look emptier.
    this.motes = this._makeMotes(
      Math.round(46 * ((this.canvas.width * this.canvas.height) / (DESIGN_W * DESIGN_H)))
    );
    this.damageFlash = 0; // red vignette pulse when the controlled soldier is hit

    this.input.enable(this.canvas); // pass canvas for mouse aim + click-to-fire
    this.running = true;
    this.accumulator = 0;
    this.fps.reset(); // don't carry a rate in from the previous deploy
    this.lastTime = performance.now();
    requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
    this.input.disable();
    audio.stopAll(); // don't let a tail ring out over the results screen
  }

  // ---- loop ---------------------------------------------------------------

  _frame(now) {
    if (!this.running) return;
    // Sampled from the raw timestamp, before the clamp below — the meter should
    // report an honest spike even though the sim refuses to step one.
    this.fps.sample(now);
    let ft = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (ft > 0.25) ft = 0.25;

    this.input.pollGamepad(); // once per rendered frame, before the sim steps

    this.accumulator += ft;
    while (this.accumulator >= STEP) {
      this.update(STEP);
      this.accumulator -= STEP;
    }
    this.render();
    requestAnimationFrame(this._frame);
  }

  currentSoldier() {
    return this.scene.soldiers[this.controlled];
  }

  livingSoldiers() {
    return this.scene.soldiers.filter((s) => s.alive);
  }

  // ---- simulation ---------------------------------------------------------

  update(dt) {
    const scene = this.scene;
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);
    if (this.damageFlash > 0) this.damageFlash -= dt;
    this._updateParticles(dt);
    if (this.introTimer > 0) this.introTimer -= dt;

    // Resolve the end banner countdown, then hand back the result.
    if (this.endBanner) {
      this.endBanner.timer -= dt;
      if (this.endBanner.timer <= 0) this._finish();
      return;
    }

    // Central fire-cooldown tick for every shooter (so semi-auto stays honest).
    // Spec enemies tick their own timers inside the runtime (updateSpecEnemy).
    for (const s of scene.soldiers) {
      if (s.fireCooldown > 0) s.fireCooldown -= dt;
      if (s.muzzleFlash > 0) s.muzzleFlash -= dt;
      tickReload(s, dt, scene);
    }

    this._handleControl();
    this._updateSoldiers(dt);
    this._updateEnemies(dt);
    this._updateProjectiles(dt);
    this._updateStatuses(dt);
    this._updateLoot(dt);
    this._checkOutcome();
    this._updateCamera();
  }

  _handleControl() {
    // Manual swap to the next living soldier.
    if (this.input.justPressed("swap")) this._swapControl(1);
    // Auto-swap off a dead soldier.
    if (!this.currentSoldier().alive) this._swapControl(1);
  }

  _swapControl(dir) {
    const n = this.scene.soldiers.length;
    for (let i = 1; i <= n; i++) {
      const idx = (this.controlled + dir * i + n * i) % n;
      if (this.scene.soldiers[idx].alive) {
        this.controlled = idx;
        return;
      }
    }
  }

  _updateSoldiers(dt) {
    const scene = this.scene;
    const leader = this.currentSoldier();

    for (const s of scene.soldiers) {
      if (!s.alive) continue;
      // Jump/land are read from the ground-contact transition around the physics
      // step, so entities.js stays free of presentation concerns.
      const wasGround = s.onGround;
      if (s === leader) {
        // Player control.
        s.setCrouch(this.input.isDown("crouch"));
        const move =
          (this.input.isDown("right") ? 1 : 0) - (this.input.isDown("left") ? 1 : 0);
        this._applyAim(s);
        s.applyMovement(dt, move, this.input.isDown("jump"));
        if (this.input.justPressed("reload")) startReload(s, scene);
        const wantFire = s.weapon.auto
          ? this.input.isDown("fire")
          : this.input.justPressed("fire");
        const acc = aimAccuracy(s.data.stats.aim);
        if (wantFire && fire(scene, s, s.fireDir(), "player", dt, acc)) this.shake = Math.min(0.5, this.shake + 0.12);
      } else {
        // "spec" (default) runs the shared agent brain over the soldier
        // locomotor; "legacy" is the original hand-written updateCompanion.
        //
        // Stance: on the spec path the duck reflex owns it (ai.js tickDuck →
        // the locomotor's crouch channel), INCLUDING standing a swapped-away
        // soldier back up — the unconditional stand that used to live here is
        // what delivered that, so relaxing it hands over the obligation. The
        // legacy squad AI has no knee, so it keeps the forced stand.
        if (config.companionBrain === "legacy") {
          s.setCrouch(false);
          updateCompanion(s, dt, scene, leader);
        } else {
          updateCompanionSpec(s, dt, scene, leader, this._ctx);
        }
      }
      const fallVy = s.vy;
      stepActor(s, dt, scene.world, scene.platforms);
      const sx = s.x + s.w / 2;
      if (wasGround && !s.onGround && s.vy < 0) scene.sound("soldier.jump", { x: sx, y: s.y });
      // Only a real drop thuds — walking off a 20px lip shouldn't.
      else if (!wasGround && s.onGround && fallVy > 260) scene.sound("soldier.land", { x: sx, y: s.y });
    }
  }

  // Resolve how the controlled soldier `s` aims this frame from config.aimMode.
  // keyboard: the legacy up/forward scheme. mouse/gamepad/auto: a free aimVec.
  _applyAim(s) {
    const mode = config.aimMode;
    if (mode === "keyboard") {
      s.aimVec = null;
      s.aimUp = this.input.isDown("aimUp") && !s.crouched;
      return;
    }
    s.aimUp = false;
    const src = this.input.aimSource(mode);
    if (!src) { s.aimVec = null; return; }
    let dx, dy;
    if (src.type === "stick") {
      dx = src.x; dy = src.y;
    } else {
      // mouse: canvas px → world (÷ zoom, + camera) → direction from the muzzle.
      // input.js already divided out any CSS scaling of the element.
      const z = this._zoom();
      const mx = s.x + s.w / 2, my = s.y + s.h * 0.42;
      dx = src.x / z + this.camera.x - mx;
      dy = src.y / z + this.camera.y - my;
    }
    const len = Math.hypot(dx, dy);
    if (len < 0.001) { s.aimVec = null; return; }
    s.aimVec = { x: dx / len, y: dy / len };
    s.facing = s.aimVec.x >= 0 ? 1 : -1;
  }

  _updateEnemies(dt) {
    const scene = this.scene;
    // Every mission enemy is an EnemySpec root: the runtime drives movement, the
    // brain, contact damage to soldiers, and enemy-team projectile fire.
    for (const r of scene.specRoots) {
      if (r.alive) updateSpecEnemy(r, dt, scene, this._ctx);
    }

    // Root-death bookkeeping (once per root): kill credit, loot drop, burst.
    // A part/child dying never counts — only the root (the "enemy").
    for (const r of scene.specRoots) {
      if (r.alive || r._counted) continue;
      r._counted = true;
      const killer = r._lastAttacker;
      if (killer && killer.kind === "soldier") killer.kills += 1;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      this._burst(cx, cy, r.color || "#e05a5a", 18, 260);
      // Root death is announced here (not in the runtime) because this is where
      // kill credit and loot are settled; the cue still comes from the spec.
      const death = specSound(r.specTop, "death");
      scene.sound(death.cue, { x: cx, y: cy, gain: death.gain });
      if (r.loot) scene.loot.push(new Loot(r.loot, cx - 10, r.y));
      this.shake = Math.min(0.7, this.shake + 0.3);
    }

    // Rebuild the flat damageable set combat.js hits (parts die, seekers spawn).
    // MUST run before _updateProjectiles, which reads scene.enemies.
    scene.enemies = scene.specRoots.flatMap((r) => (r.alive ? collidables(r) : []));
  }

  _updateProjectiles(dt) {
    updateProjectiles(this.scene, dt, this._ctx);
  }

  _damage(target, amount, owner) {
    // EnemySpec parts route through the runtime so link/signal/phase cascades
    // fire; kill credit + loot are handled by root-death polling in
    // _updateEnemies. Track the last soldier to hit this tree for that credit.
    if (target.kind === "spec") {
      if (amount > 0 && owner) target.root._lastAttacker = owner;
      specDamage(target.root, target, amount, owner, this.scene, this._ctx);
      return;
    }
    if (!target.alive) return;
    target.health -= amount;
    target.hitFlash = 0.12;
    if (amount > 0 && target.health > 0)
      this.scene.sound("soldier.hurt", { x: target.x + target.w / 2, y: target.y });
    // A hit on the soldier you're controlling flashes the screen red.
    if (target === this.currentSoldier()) {
      this.damageFlash = 0.4;
      this.shake = Math.min(0.6, this.shake + 0.25);
    }
    if (target.health <= 0) this._kill(target, owner);
  }

  _kill(target, owner) {
    // Spec kill (e.g. lethal burn routed via combat.js ctx.kill).
    if (target.kind === "spec") {
      if (owner) target.root._lastAttacker = owner;
      specKill(target.root, target, owner, this.scene, this._ctx);
      return;
    }
    if (!target.alive) return;
    target.alive = false;
    const cx = target.x + target.w / 2;
    const cy = target.y + target.h / 2;
    // a soldier falling — a heavier, colder burst (enemies are spec-handled)
    this._burst(cx, cy, "#c9d4e6", 22, 300);
    this.scene.sound("soldier.death", { x: cx, y: cy });
    this.shake = Math.min(0.9, this.shake + 0.5);
  }

  _updateStatuses(dt) {
    updateStatuses(this.scene, dt, this._ctx);
  }

  _updateLoot(dt) {
    const scene = this.scene;
    for (const l of scene.loot) {
      if (l.collected) continue;
      // simple gravity + rest on the nearest platform below
      l.vy = (l.vy || 0) + scene.world.gravity * dt;
      l.y += l.vy * dt;
      l.onGround = false;
      for (const plat of scene.platforms) {
        if (overlaps(l, plat) && l.vy > 0) {
          l.y = plat.y - l.h;
          l.vy = 0;
          l.onGround = true;
        }
      }
      l.bob += dt * 4;
      for (const s of scene.soldiers) {
        if (s.alive && overlaps(l, s)) {
          l.collected = true;
          scene.collected = scene.collected || [];
          scene.collected.push(l.item);
          scene.sound("loot.pickup", { x: l.x, y: l.y });
          break;
        }
      }
    }
  }

  // Win: any living soldier reaches the exit (partial wipes can still succeed).
  // Lose: the whole squad is down.
  _checkOutcome() {
    const scene = this.scene;
    const living = this.livingSoldiers();

    if (living.length === 0) {
      this._resolve(false);
      return;
    }
    for (const s of living) {
      if (overlaps(s, scene.exit)) {
        // Grab the guaranteed artifact on extraction.
        if (scene.artifact) {
          scene.collected = scene.collected || [];
          scene.collected.push(scene.artifact);
          scene.artifact = null;
        }
        this._resolve(true);
        return;
      }
    }
  }

  _resolve(success) {
    if (this.endBanner) return;
    const survivors = this.scene.soldiers.filter((s) => s.alive).map((s) => s.id);
    const casualties = this.scene.soldiers.filter((s) => !s.alive).map((s) => s.id);
    const kills = this.scene.soldiers.reduce((n, s) => n + s.kills, 0);
    const killsBySoldier = this.scene.soldiers.map((s) => ({ id: s.id, kills: s.kills }));
    this.result = {
      success,
      missionId: this.mission.id,
      missionName: this.mission.name,
      survivors,
      casualties,
      killsBySoldier,
      woundsBySoldier: this.scene.soldiers.map((s) => ({
        id: s.id,
        wounds: Math.max(0, Math.round(s.maxHealth - s.health)),
      })),
      loot: success ? this.scene.collected || [] : [],
      kills,
    };
    this.endBanner = { success, timer: 1.6 };
    audio.play(success ? "mission.win" : "mission.lose");
  }

  _finish() {
    this.stop();
    this.onComplete(this.result);
  }

  // ---- viewport ------------------------------------------------------------

  // Backing store from the config preset. Done at start() (not in the ctor) so
  // a changed preset lands on the next deploy — assigning width/height clears
  // the surface and resets ctx state, which is safe here because render() sets
  // the transform and every style fresh each frame. The !== guard matters:
  // `canvas.width = canvas.width` still clears.
  _applyCanvasSize() {
    const { w, h } = parseCanvasSize(config.missionCanvas);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  // Live world scale. One accessor so update() and render() can't disagree.
  _zoom() {
    const z = Number(config.missionZoom);
    return Number.isFinite(z) && z > 0 ? z : 1;
  }

  // Every preset is 16:9, so ONE factor maps the 960x540 space the HUD was
  // authored in onto the live canvas. 1 at the classic size.
  _uiScale() {
    return this.canvas.height / DESIGN_H;
  }

  _updateCamera() {
    const z = this._zoom();
    const viewW = this.canvas.width / z;
    const c = solveCamera(this.currentSoldier(), viewW, this.canvas.height / z, this.scene.world);
    this.camera.x = c.x;
    this.camera.y = c.y;
    // Pan + distance falloff are measured from the middle of the viewport, and
    // the audible range widens with it so a zoomed-out edge isn't silent.
    audio.setListener(this.camera.x + viewW / 2, viewW / DESIGN_W);
  }

  // ---- particles (cosmetic) ----------------------------------------------

  _makeMotes(n) {
    const W = this.canvas.width, H = this.canvas.height;
    const a = [];
    for (let i = 0; i < n; i++)
      a.push({ x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.6, spd: 5 + Math.random() * 16, phase: Math.random() * 7 });
    return a;
  }

  _updateParticles(dt) {
    for (const p of this.particles) {
      p.vx *= 0.94;
      p.vy += (p.grav || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    if (this.particles.length) this.particles = this.particles.filter((p) => p.life > 0);
  }

  _sparks(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = spd * (0.3 + Math.random());
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.2 + Math.random() * 0.2, max: 0.4, size: 3, color, grav: 220 });
    }
  }

  _burst(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = spd * (0.2 + Math.random());
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.4 + Math.random() * 0.4, max: 0.8, size: 3 + Math.random() * 3, color, grav: 440 });
    }
  }

  // ---- rendering ----------------------------------------------------------

  render() {
    const ctx = this.ctx;
    const scene = this.scene;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const z = this._zoom();

    this._drawBackground(ctx, W, H, z);

    ctx.save();
    let sx = 0, sy = 0;
    if (this.shake > 0) {
      const m = this.shake * 7;
      sx = (Math.random() * 2 - 1) * m;
      sy = (Math.random() * 2 - 1) * m;
    }
    // world → screen: (world - camera) * zoom, then screen-space shake.
    // Rounding the SCREEN offset (not camera.x) keeps the scroll snapped to one
    // device pixel at any zoom — rounding world units judders at z < 1.
    ctx.setTransform(
      z, 0, 0, z,
      -Math.round(this.camera.x * z) + sx,
      -Math.round(this.camera.y * z) + sy
    );

    this._drawPlatforms(ctx, scene, z);
    this._drawExit(ctx, scene.exit, z);
    for (const l of scene.loot) this._drawLoot(ctx, l);
    for (const r of scene.specRoots) if (r.alive) drawSpecEnemy(ctx, r, this.time, z);
    for (const p of scene.projectiles) this._drawProjectile(p, z);
    for (const s of scene.soldiers) this._drawSoldier(s, s === this.currentSoldier(), z);
    this._drawParticles(ctx);

    ctx.restore();

    this._drawVignette(ctx, W, H);
    this._drawHUD();
    if (this.introTimer > 0) this._drawIntro();
    if (this.endBanner) this._drawEndBanner();
  }

  // Screen space, but camera-aware. The horizon is measured from where the
  // world's bottom edge lands ON SCREEN rather than from the canvas bottom, so
  // the skyline stays welded to the ground slab instead of floating above it
  // once the viewport is taller than the 540px world. At the classic size with
  // no zoom `hy === H`, i.e. the original numbers.
  _drawBackground(ctx, W, H, z = 1) {
    const t = this.time;
    const hy = (this.scene.world.height - this.camera.y) * z;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#060915");
    sky.addColorStop(0.55, "#0c1424");
    sky.addColorStop(0.82, "#14232a");
    sky.addColorStop(1, "#1a2a22");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // ominous hive glow low on the horizon
    const gx = W * 0.72 - ((this.camera.x * z * 0.05) % (W * 2));
    this._glow(ctx, gx, hy * 0.84, 340 * z, "rgba(110,240,170,0.16)");

    // two parallax layers of ruined skyline
    this._skyline(ctx, W, H, 0.18, hy * 0.66, 130, "#0a1420", 46, z);
    this._skyline(ctx, W, H, 0.36, hy * 0.76, 90, "#0c1a24", 78, z);

    // drifting spores
    for (const m of this.motes) {
      const yy = (((m.y - t * m.spd) % H) + H) % H;
      const a = 0.12 + 0.14 * Math.sin(t * 2 + m.phase);
      ctx.fillStyle = `rgba(150,220,190,${a})`;
      ctx.beginPath();
      ctx.arc(m.x, yy, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Buildings are sized in screen px, so they scale with the zoom along with
  // everything else on the horizon. The skyline is seeded from the building
  // index, so it stays deterministic — a different zoom just picks a different
  // (equally arbitrary) stretch of ruins.
  _skyline(ctx, W, H, par, baseY, peak, color, step, z = 1) {
    const sstep = step * z;
    const off = this.camera.x * z * par;
    ctx.fillStyle = color;
    const start = Math.floor(off / sstep) - 1;
    for (let i = start; i * sstep - off < W + sstep; i++) {
      const seed = Math.sin(i * 12.9898) * 43758.5453;
      const r = seed - Math.floor(seed);
      const bh = peak * z * (0.4 + 0.6 * r);
      const x = i * sstep - off;
      ctx.fillRect(x, baseY - bh, sstep - 6 * z, bh + H);
    }
  }

  _drawPlatforms(ctx, scene, z = 1) {
    // "you can stand here" — hold the lit edge at its authored 2 device px when
    // zoomed out, but let it scale up with everything else when zoomed in.
    const edge = Math.max(2, 2 / z);
    for (const p of scene.platforms) {
      const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      g.addColorStop(0, "#27425f");
      g.addColorStop(1, "#132132");
      ctx.fillStyle = g;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // lit top edge
      ctx.fillStyle = "#6fd3ff";
      ctx.fillRect(p.x, p.y, p.w, edge);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(p.x, p.y + edge, p.w, 2); // sits just under the lit edge
      // rivets
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      for (let rx = p.x + 10; rx < p.x + p.w - 6; rx += 28) {
        ctx.fillRect(rx, p.y + 7, 2, 2);
        if (p.h > 24) ctx.fillRect(rx, p.y + p.h - 9, 2, 2);
      }
      // bottom shadow
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(p.x, p.y + p.h - 2, p.w, 2);
    }
  }

  _drawExit(ctx, ex, z = 1) {
    const t = this.time;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    const beam = ctx.createLinearGradient(0, ex.y, 0, ex.y + ex.h);
    beam.addColorStop(0, "rgba(140,255,190,0.04)");
    beam.addColorStop(1, `rgba(140,255,190,${0.22 + pulse * 0.18})`);
    ctx.fillStyle = beam;
    ctx.fillRect(ex.x, ex.y, ex.w, ex.h);
    // posts
    ctx.fillStyle = "#8affc1";
    ctx.fillRect(ex.x - 3, ex.y, 3, ex.h);
    ctx.fillRect(ex.x + ex.w, ex.y, 3, ex.h);
    // rising chevrons
    ctx.fillStyle = `rgba(180,255,210,${0.5 + pulse * 0.4})`;
    for (let i = 0; i < 3; i++) {
      const yy = ex.y + ex.h - (((t * 60 + i * (ex.h / 3)) % ex.h));
      ctx.beginPath();
      ctx.moveTo(ex.x + ex.w / 2, yy - 8);
      ctx.lineTo(ex.x + ex.w / 2 - 9, yy);
      ctx.lineTo(ex.x + ex.w / 2 + 9, yy);
      ctx.closePath();
      ctx.fill();
    }
    // The label is signage, not scenery: keep it screen-sized so it stays
    // readable when zoomed out.
    ctx.fillStyle = "#8affc1";
    ctx.font = `bold ${12 / z}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("▲ EXTRACT", ex.x + ex.w / 2, ex.y - 10 / z);
    ctx.textAlign = "left";
  }

  _drawLoot(ctx, l) {
    if (l.collected) return;
    const y = l.y + Math.sin(l.bob) * 3;
    const cx = l.x + l.w / 2, cy = y + l.h / 2;
    this._glow(ctx, cx, cy, 22, `rgba(242,193,78,${0.35 + 0.15 * Math.sin(this.time * 5)})`);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#f2c14e";
    ctx.fillRect(-7, -7, 14, 14);
    ctx.fillStyle = "#fff2c0";
    ctx.fillRect(-7, -7, 14, 4);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-7, -7, 14, 14);
    ctx.restore();
  }

  _drawSoldier(s, controlled, z = 1) {
    const ctx = this.ctx;
    if (!s.alive) return;
    // Snap to a DEVICE pixel, not a world one — rounding world coords at z < 1
    // makes the walk stutter in multi-pixel steps.
    const snap = (v) => Math.round(v * z) / z;
    const x = snap(s.x), y = snap(s.y), w = s.w, h = s.h, cx = x + w / 2, dir = s.facing;

    this._shadow(ctx, cx, y + h, w * 0.85);

    if (controlled) {
      // "which one am I" — the ring and caret stay screen-sized, since finding
      // your soldier is exactly the job they exist for when zoomed out.
      const p = 0.5 + 0.5 * Math.sin(this.time * 5);
      ctx.strokeStyle = `rgba(255,211,106,${0.35 + p * 0.4})`;
      ctx.lineWidth = 2 / z;
      ctx.beginPath();
      ctx.ellipse(cx, y + h - 1, w * 0.7, 6 / z, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffd36a";
      const cyv = y - (20 + p * 3) / z;
      ctx.beginPath();
      ctx.moveTo(cx, cyv + 9 / z);
      ctx.lineTo(cx - 6 / z, cyv);
      ctx.lineTo(cx + 6 / z, cyv);
      ctx.closePath();
      ctx.fill();
    }

    const flash = s.hitFlash > 0;
    const base = flash ? "#ffffff" : s.color;
    const dark = flash ? "#ffffff" : this._shade(s.color, -22);

    const gunLen = w * 0.62, gy = y + h * 0.42;

    if (s.crouched) {
      // Kneeling: back leg folded along the ground, forward knee up, hunched
      // torso, gun braced low — a short silhouette shots pass over.
      ctx.fillStyle = dark;
      ctx.fillRect(x + w * 0.12, y + h * 0.62, w * 0.6, h * 0.38); // folded shin along the ground
      ctx.fillRect(dir > 0 ? x + w * 0.5 : x + w * 0.24, y + h * 0.44, w * 0.26, h * 0.56); // forward knee
      // backpack
      ctx.fillStyle = this._shade(s.color, -34);
      ctx.fillRect(dir > 0 ? x - 1 : x + w - 5, y + h * 0.16, 6, h * 0.42);
      // hunched torso
      ctx.fillStyle = base;
      this._roundRect(ctx, x + w * 0.18, y + h * 0.16, w * 0.64, h * 0.5, 4);
      ctx.fill();
      // helmet
      ctx.fillStyle = dark;
      this._roundRect(ctx, dir > 0 ? x + w * 0.32 : x + w * 0.2, y, w * 0.48, h * 0.34, 4);
      ctx.fill();
      // visor
      ctx.fillStyle = flash ? "#ffffff" : "#7ad7ff";
      ctx.fillRect(dir > 0 ? cx + 1 : x + w * 0.24, y + h * 0.08, w * 0.26, h * 0.1);
      // gun braced forward, low (points along manual aim when active)
      this._drawGun(ctx, s, cx, gy, gunLen, y, h);
    } else {
      // legs
      ctx.fillStyle = dark;
      ctx.fillRect(x + w * 0.2, y + h * 0.62, w * 0.22, h * 0.38);
      ctx.fillRect(x + w * 0.58, y + h * 0.62, w * 0.22, h * 0.38);
      // backpack
      ctx.fillStyle = this._shade(s.color, -34);
      ctx.fillRect(dir > 0 ? x - 2 : x + w - 4, y + h * 0.3, 6, h * 0.3);
      // torso
      ctx.fillStyle = base;
      this._roundRect(ctx, x + w * 0.16, y + h * 0.28, w * 0.68, h * 0.4, 4);
      ctx.fill();
      ctx.fillStyle = this._shade(s.color, 20);
      ctx.fillRect(cx - 1, y + h * 0.3, 2, h * 0.34);
      // helmet
      ctx.fillStyle = dark;
      this._roundRect(ctx, x + w * 0.24, y + h * 0.05, w * 0.52, h * 0.26, 5);
      ctx.fill();
      // visor
      ctx.fillStyle = flash ? "#ffffff" : "#7ad7ff";
      ctx.fillRect(dir > 0 ? cx - 1 : x + w * 0.26, y + h * 0.12, w * 0.28, h * 0.08);
      // weapon (points along manual aim when active, else up/forward)
      this._drawGun(ctx, s, cx, gy, gunLen, y, h);
    }

    if (s.muzzleFlash > 0) this._drawMuzzle(ctx, s, this._gunTip(s, cx, gy, gunLen, y));
    if (s.burn) this._drawBurn(ctx, x, y, w, h);
    this._healthBar(x, y - 8, w, s.health / s.maxHealth, controlled ? "#7ad7ff" : "#6fcf97");
  }

  // Draw the soldier's gun as a barrel from the shoulder pivot. Manual aim
  // (aimVec) rotates it to the aimed direction; otherwise the legacy up/forward.
  _drawGun(ctx, s, cx, gy, gunLen, y, h) {
    ctx.fillStyle = "#0b0f18";
    if (s.aimVec) {
      ctx.save();
      ctx.translate(cx, gy);
      ctx.rotate(Math.atan2(s.aimVec.y, s.aimVec.x));
      ctx.fillRect(0, -2.5, gunLen, 5);
      ctx.restore();
    } else if (s.aimUp) {
      ctx.fillRect(cx - 2, y - 8, 4, h * 0.42);
    } else if (s.facing > 0) {
      ctx.fillRect(cx, gy, gunLen, 5);
    } else {
      ctx.fillRect(cx - gunLen, gy, gunLen, 5);
    }
  }

  // Barrel-tip point (where the muzzle flash sits) for the current aim.
  _gunTip(s, cx, gy, gunLen, y) {
    if (s.aimVec) return { x: cx + s.aimVec.x * gunLen, y: gy + s.aimVec.y * gunLen };
    if (s.aimUp) return { x: cx, y: y - 10 };
    return { x: s.facing > 0 ? cx + gunLen : cx - gunLen, y: gy };
  }

  _drawMuzzle(ctx, shooter, at) {
    const col = shooter.muzzleColor || "#ffd36a";
    this._glow(ctx, at.x, at.y, 15, this._alpha(col, 0.85));
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(at.x, at.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(at.x - 9, at.y);
    ctx.lineTo(at.x + 9, at.y);
    ctx.moveTo(at.x, at.y - 6);
    ctx.lineTo(at.x, at.y + 6);
    ctx.stroke();
  }

  _drawProjectile(p, z = 1) {
    drawProjectile(this.ctx, p, z);
  }

  _drawParticles(ctx) {
    if (!this.particles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      const s = p.size * (0.4 + 0.6 * a);
      ctx.fillStyle = this._alpha(p.color, a);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();
  }

  _drawBurn(ctx, x, y, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const fx = x + (i + 0.5) * (w / 3) + Math.sin(this.time * 12 + i) * 2;
      const fh = 6 + Math.random() * 8;
      ctx.fillStyle = `rgba(255,${(120 + Math.random() * 80) | 0},40,0.55)`;
      ctx.beginPath();
      ctx.moveTo(fx - 3, y + 2);
      ctx.lineTo(fx, y - fh);
      ctx.lineTo(fx + 3, y + 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _healthBar(x, y, w, frac, color) {
    const ctx = this.ctx;
    frac = clamp(frac, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    this._roundRect(ctx, x, y, w, 4, 2);
    ctx.fill();
    ctx.fillStyle = color;
    this._roundRect(ctx, x, y, Math.max(2, w * frac), 4, 2);
    ctx.fill();
  }

  _drawVignette(ctx, W, H) {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.8);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    if (this.damageFlash > 0) {
      const a = clamp(this.damageFlash / 0.4, 0, 1) * 0.5;
      const r = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.78);
      r.addColorStop(0, "rgba(200,0,0,0)");
      r.addColorStop(1, `rgba(200,0,0,${a})`);
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // The HUD is authored in 960x540 space and scaled onto whatever preset is
  // live, so its cards and text keep the same apparent size on a big canvas
  // instead of shrinking into a corner. W/H below are DESIGN units.
  _drawHUD() {
    const ctx = this.ctx;
    const k = this._uiScale();
    ctx.save();
    ctx.scale(k, k);
    const W = this.canvas.width / k, H = DESIGN_H;

    // squad cards (top-left)
    let y = 12;
    const cardW = 200, cardH = 42;
    for (let i = 0; i < this.scene.soldiers.length; i++) {
      const s = this.scene.soldiers[i];
      const controlled = i === this.controlled && s.alive;
      ctx.fillStyle = "rgba(9,14,23,0.8)";
      this._roundRect(ctx, 12, y, cardW, cardH, 6);
      ctx.fill();
      ctx.strokeStyle = controlled ? "#ffd36a" : "rgba(90,110,140,0.35)";
      ctx.lineWidth = controlled ? 2 : 1;
      this._roundRect(ctx, 12, y, cardW, cardH, 6);
      ctx.stroke();
      // portrait chip
      ctx.fillStyle = s.alive ? s.color : "#3a2f34";
      this._roundRect(ctx, 18, y + 7, 28, 28, 4);
      ctx.fill();
      ctx.fillStyle = s.alive ? "rgba(0,0,0,0.55)" : "#6a5555";
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this._initials(s.name), 32, y + 25);
      // name + weapon
      ctx.textAlign = "left";
      ctx.fillStyle = s.alive ? "#e6ecf5" : "#7a6a6a";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(s.alive ? s.name : `${s.name}  ✝`, 52, y + 17);
      ctx.textAlign = "right";
      ctx.fillStyle = "#8894a6";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(s.weapon.name, 12 + cardW - 8, y + 17);
      ctx.textAlign = "left";
      // health
      const frac = clamp(s.health / s.maxHealth, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      this._roundRect(ctx, 52, y + 24, 140, 7, 3);
      ctx.fill();
      const hg = ctx.createLinearGradient(52, 0, 192, 0);
      if (s.alive) {
        hg.addColorStop(0, "#57c98a");
        hg.addColorStop(1, "#7ad7ff");
      } else {
        hg.addColorStop(0, "#3a2a2a");
        hg.addColorStop(1, "#3a2a2a");
      }
      ctx.fillStyle = hg;
      this._roundRect(ctx, 52, y + 24, Math.max(2, 140 * frac), 7, 3);
      ctx.fill();
      y += cardH + 8;
    }

    // objective + loot (top-right). The FPS meter takes the corner when it's
    // on and the gameplay stack slides down; with it off `top` is 26 and the
    // layout is exactly what it always was.
    const lootCount = (this.scene.collected || []).length;
    ctx.textAlign = "right";

    const top = config.showFps ? 44 : 26;
    if (config.showFps) {
      const fps = this.fps.fps();
      const n = fps > 0 ? Math.round(fps) : null;
      ctx.fillStyle = n === null || n >= 50 ? "#8894a6" : n >= 30 ? "#ffb15a" : "#ff6a6a";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(n === null ? "-- FPS" : `${n} FPS`, W - 16, 26);
    }

    ctx.fillStyle = "#8affc1";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText("▶  REACH EXTRACTION", W - 16, top);
    ctx.fillStyle = "#f2c14e";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`◈  Loot recovered: ${lootCount}`, W - 16, top + 20);

    // ammo / reload readout for the controlled soldier (only for magazine guns)
    const cur = this.currentSoldier();
    if (cur && cur.alive && cur.weapon && cur.weapon.magazine) {
      ctx.font = "bold 14px system-ui, sans-serif";
      if (cur.reloading > 0) {
        ctx.fillStyle = "#ffb15a";
        ctx.fillText("RELOADING…", W - 16, top + 44);
      } else {
        const dry = cur.ammo <= 0 && cur.magsLeft <= 0;
        ctx.fillStyle = cur.ammo <= 0 ? "#ff6a6a" : "#e6ecf5";
        ctx.fillText(
          dry
            ? `⦿  OUT OF AMMO`
            : `⦿  ${cur.ammo} / ${cur.weapon.magazine}  ▮×${cur.magsLeft}`,
          W - 16, top + 44
        );
      }
    }
    ctx.textAlign = "left";

    // controls strip (bottom)
    ctx.fillStyle = "rgba(7,11,19,0.6)";
    ctx.fillRect(0, H - 22, W, 22);
    ctx.fillStyle = "rgba(190,200,215,0.7)";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    const aimHint = config.aimMode === "keyboard" ? "W  aim up" : "MOUSE  aim";
    ctx.fillText(
      `A / D  move      ${aimHint}      S  crouch      SPACE  jump      J / CLICK  fire      R  reload      TAB  swap`,
      W / 2,
      H - 7
    );
    ctx.textAlign = "left";
    ctx.restore();
  }

  _drawIntro() {
    const ctx = this.ctx;
    const k = this._uiScale();
    const a = clamp(this.introTimer / 2.2, 0, 1);
    ctx.save();
    ctx.scale(k, k); // design space — see _drawHUD
    const W = this.canvas.width / k, H = DESIGN_H;
    ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, H / 2 - 60, 0, H / 2 + 60);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, "rgba(0,0,0,0.72)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, H / 2 - 60, W, 120);
    ctx.textAlign = "center";
    ctx.fillStyle = "#8affc1";
    ctx.font = "11px monospace";
    ctx.fillText("▲  INCOMING TRANSMISSION", W / 2, H / 2 - 24);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px system-ui, sans-serif";
    ctx.fillText(this.mission.name, W / 2, H / 2 + 8);
    ctx.strokeStyle = "rgba(138,255,193,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 120, H / 2 + 22);
    ctx.lineTo(W / 2 + 120, H / 2 + 22);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.restore();
  }

  _drawEndBanner() {
    const ctx = this.ctx;
    const k = this._uiScale();
    ctx.save();
    ctx.scale(k, k); // design space — see _drawHUD
    const W = this.canvas.width / k, H = DESIGN_H;
    const win = this.endBanner.success;
    ctx.fillStyle = "rgba(4,6,12,0.72)";
    ctx.fillRect(0, 0, W, H);
    const col = win ? "#8affc1" : "#ff6a6a";
    this._glow(ctx, W / 2, H / 2, 260, win ? "rgba(80,200,140,0.18)" : "rgba(200,60,60,0.18)");
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    this._roundRect(ctx, W / 2 - 230, H / 2 - 56, 460, 112, 10);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = col;
    ctx.font = "bold 40px system-ui, sans-serif";
    ctx.fillText(win ? "EXTRACTION SUCCESSFUL" : "SQUAD WIPED", W / 2, H / 2 + 4);
    ctx.fillStyle = "rgba(220,228,238,0.8)";
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText(win ? "Returning to base…" : "No survivors. Returning to base…", W / 2, H / 2 + 34);
    ctx.textAlign = "left";
    ctx.restore();
  }

  // ---- small drawing helpers ---------------------------------------------

  _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  _shadow(ctx, cx, by, rw) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(cx, by, rw / 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _glow(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  _initials(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  // Lighten/darken an "hsl(h s% l%)" or "#rrggbb" colour by `d` (-100..100).
  _shade(color, d) {
    if (color.startsWith("hsl")) {
      const m = color.match(/hsl\(\s*([\d.]+)[, ]+([\d.]+)%[, ]+([\d.]+)%/);
      if (m) return `hsl(${+m[1]} ${+m[2]}% ${clamp(+m[3] + d, 0, 100)}%)`;
      return color;
    }
    let c = color.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    const f = d * 2.55;
    const r = clamp(parseInt(c.slice(0, 2), 16) + f, 0, 255) | 0;
    const g = clamp(parseInt(c.slice(2, 4), 16) + f, 0, 255) | 0;
    const b = clamp(parseInt(c.slice(4, 6), 16) + f, 0, 255) | 0;
    return `rgb(${r} ${g} ${b})`;
  }

  // Add an alpha channel to a "#rrggbb" colour (passes rgba/hsla through).
  _alpha(color, a) {
    if (color.startsWith("#")) {
      let c = color.replace("#", "");
      if (c.length === 3) c = c.split("").map((x) => x + x).join("");
      const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
    return color;
  }
}
