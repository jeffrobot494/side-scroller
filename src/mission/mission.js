// ---------------------------------------------------------------------------
// MISSION SCENE  (Phases 2–4)
//
// The action layer: a fixed-timestep run-and-gun on the canvas. Owns the world
// simulation (soldiers, companions, enemies, projectiles, loot), the HUD, and
// the win/lose conditions. When the mission ends it hands a result payload back
// to the app via the onComplete callback; it never touches game state directly.
// ---------------------------------------------------------------------------

import { MissionInput } from "./input.js";
import { loadMission, stepActor, overlaps, clamp, Loot } from "./entities.js";
import { fire, updateCompanion, updateEnemy } from "./ai.js";
import { config } from "../game/config.js";

const STEP = 1 / 60;

export class Mission {
  constructor(canvas, onComplete) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onComplete = onComplete;
    this.input = new MissionInput();
    this.running = false;
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

    // cosmetic-only state (never read by game logic)
    this.time = 0;
    this.shake = 0;
    this.particles = [];
    this.motes = this._makeMotes(46); // drifting ambient spores
    this.damageFlash = 0; // red vignette pulse when the controlled soldier is hit

    this.input.enable();
    this.running = true;
    this.accumulator = 0;
    this.lastTime = performance.now();
    requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
    this.input.disable();
  }

  // ---- loop ---------------------------------------------------------------

  _frame(now) {
    if (!this.running) return;
    let ft = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (ft > 0.25) ft = 0.25;

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
    for (const s of scene.soldiers) {
      if (s.fireCooldown > 0) s.fireCooldown -= dt;
      if (s.muzzleFlash > 0) s.muzzleFlash -= dt;
    }
    for (const e of scene.enemies) {
      if (e.fireCooldown > 0) e.fireCooldown -= dt;
      if (e.contactCooldown > 0) e.contactCooldown -= dt;
      if (e.muzzleFlash > 0) e.muzzleFlash -= dt;
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
      if (s === leader) {
        // Player control.
        const move =
          (this.input.isDown("right") ? 1 : 0) - (this.input.isDown("left") ? 1 : 0);
        s.aimUp = this.input.isDown("aimUp");
        s.applyMovement(dt, move, this.input.isDown("jump"));
        const wantFire = s.weapon.auto
          ? this.input.isDown("fire")
          : this.input.justPressed("fire");
        if (wantFire && fire(scene, s, s.fireDir(), "player", dt, 1)) this.shake = Math.min(0.5, this.shake + 0.12);
      } else {
        updateCompanion(s, dt, scene, leader);
      }
      stepActor(s, dt, scene.world, scene.platforms);
    }
  }

  _updateEnemies(dt) {
    const scene = this.scene;
    for (const e of scene.enemies) {
      if (!e.alive) continue;
      updateEnemy(e, dt, scene);
      stepActor(e, dt, scene.world, scene.platforms);

      // Contact damage (chargers). One hit per soldier per cooldown.
      if (e.def.contactDamage > 0 && (e.contactCooldown || 0) <= 0) {
        for (const s of scene.soldiers) {
          if (s.alive && overlaps(e, s)) {
            this._damage(s, e.def.contactDamage, e);
            e.contactCooldown = 0.6;
            break;
          }
        }
      }
    }
  }

  _updateProjectiles(dt) {
    const scene = this.scene;
    for (const p of scene.projectiles) {
      if (p.dead) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        p.dead = true;
        continue;
      }
      // Walls stop shots.
      for (const plat of scene.platforms) {
        if (overlaps(p, plat)) {
          p.dead = true;
          this._sparks(p.x, p.y, p.color, 4, 90);
          break;
        }
      }
      if (p.dead) continue;

      // Target set. Squad-only friendly fire: a player-team shot can also hit
      // soldiers (never its own shooter). Aliens stay immune to each other.
      let targets;
      if (p.team === "player")
        targets = config.friendlyFire ? [...scene.enemies, ...scene.soldiers] : scene.enemies;
      else targets = scene.soldiers;

      for (const t of targets) {
        if (t === p.owner || !t.alive || !overlaps(p, t)) continue;
        this._applyEffects(t, p.effects, p.owner);
        this._sparks(p.x, p.y, p.color, 7, 150);
        p.dead = true;
        break;
      }
    }
    scene.projectiles = scene.projectiles.filter((p) => !p.dead);
  }

  _applyEffects(target, effects, owner) {
    // Your soldiers' damage is scaled by the config multiplier; alien fire isn't.
    const mult = owner && owner.kind === "soldier" ? config.playerDamageMult : 1;
    for (const fx of effects) {
      if (fx.kind === "damage") this._damage(target, fx.amount * mult, owner);
      else if (fx.kind === "burn") {
        target.burn = { dps: fx.dps * mult, time: fx.duration }; // refreshes on re-hit
        target._burnOwner = owner; // so a burn kill still credits the shooter
      }
    }
  }

  _damage(target, amount, owner) {
    if (!target.alive) return;
    target.health -= amount;
    target.hitFlash = 0.12;
    // A hit on the soldier you're controlling flashes the screen red.
    if (target === this.currentSoldier()) {
      this.damageFlash = 0.4;
      this.shake = Math.min(0.6, this.shake + 0.25);
    }
    if (target.health <= 0) this._kill(target, owner);
  }

  _kill(target, owner) {
    if (!target.alive) return;
    target.alive = false;
    const cx = target.x + target.w / 2;
    const cy = target.y + target.h / 2;
    if (target.kind === "enemy") {
      if (owner && owner.kind === "soldier") owner.kills += 1;
      this._burst(cx, cy, target.color, 18, 260);
      this._dropLoot(target);
      this.shake = Math.min(0.7, this.shake + 0.3);
    } else {
      // a soldier falling — a heavier, colder burst
      this._burst(cx, cy, "#c9d4e6", 22, 300);
      this.shake = Math.min(0.9, this.shake + 0.5);
    }
  }

  _dropLoot(enemy) {
    const item = enemy.def.loot;
    if (!item) return;
    this.scene.loot.push(new Loot(item, enemy.x + enemy.w / 2 - 10, enemy.y));
  }

  _updateStatuses(dt) {
    const all = [...this.scene.soldiers, ...this.scene.enemies];
    for (const a of all) {
      if (a.hitFlash > 0) a.hitFlash -= dt;
      if (a.burn) {
        a.health -= a.burn.dps * dt;
        a.burn.time -= dt;
        if (a.burn.time <= 0) a.burn = null;
        if (a.alive && a.health <= 0) this._kill(a, a._burnOwner);
      }
    }
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
      loot: success ? this.scene.collected || [] : [],
      kills,
    };
    this.endBanner = { success, timer: 1.6 };
  }

  _finish() {
    this.stop();
    this.onComplete(this.result);
  }

  _updateCamera() {
    const s = this.currentSoldier();
    const targetX = s.x + s.w / 2 - this.canvas.width * 0.4;
    this.camera.x = clamp(targetX, 0, this.scene.world.width - this.canvas.width);
    this.camera.y = 0;
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

    this._drawBackground(ctx, W, H);

    ctx.save();
    let sx = 0, sy = 0;
    if (this.shake > 0) {
      const m = this.shake * 7;
      sx = (Math.random() * 2 - 1) * m;
      sy = (Math.random() * 2 - 1) * m;
    }
    ctx.translate(-Math.round(this.camera.x) + sx, -Math.round(this.camera.y) + sy);

    this._drawPlatforms(ctx, scene);
    this._drawExit(ctx, scene.exit);
    for (const l of scene.loot) this._drawLoot(ctx, l);
    for (const e of scene.enemies) this._drawEnemy(e);
    for (const p of scene.projectiles) this._drawProjectile(p);
    for (const s of scene.soldiers) this._drawSoldier(s, s === this.currentSoldier());
    this._drawParticles(ctx);

    ctx.restore();

    this._drawVignette(ctx, W, H);
    this._drawHUD();
    if (this.introTimer > 0) this._drawIntro();
    if (this.endBanner) this._drawEndBanner();
  }

  _drawBackground(ctx, W, H) {
    const t = this.time;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#060915");
    sky.addColorStop(0.55, "#0c1424");
    sky.addColorStop(0.82, "#14232a");
    sky.addColorStop(1, "#1a2a22");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // ominous hive glow low on the horizon
    const gx = W * 0.72 - ((this.camera.x * 0.05) % (W * 2));
    this._glow(ctx, gx, H * 0.84, 340, "rgba(110,240,170,0.16)");

    // two parallax layers of ruined skyline
    this._skyline(ctx, W, H, 0.18, H * 0.66, 130, "#0a1420", 46);
    this._skyline(ctx, W, H, 0.36, H * 0.76, 90, "#0c1a24", 78);

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

  _skyline(ctx, W, H, par, baseY, peak, color, step) {
    const off = this.camera.x * par;
    ctx.fillStyle = color;
    const start = Math.floor(off / step) - 1;
    for (let i = start; i * step - off < W + step; i++) {
      const seed = Math.sin(i * 12.9898) * 43758.5453;
      const r = seed - Math.floor(seed);
      const bh = peak * (0.4 + 0.6 * r);
      const x = i * step - off;
      ctx.fillRect(x, baseY - bh, step - 6, bh + H);
    }
  }

  _drawPlatforms(ctx, scene) {
    for (const p of scene.platforms) {
      const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      g.addColorStop(0, "#27425f");
      g.addColorStop(1, "#132132");
      ctx.fillStyle = g;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // lit top edge
      ctx.fillStyle = "#6fd3ff";
      ctx.fillRect(p.x, p.y, p.w, 2);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(p.x, p.y + 2, p.w, 2);
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

  _drawExit(ctx, ex) {
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
    ctx.fillStyle = "#8affc1";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("▲ EXTRACT", ex.x + ex.w / 2, ex.y - 10);
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

  _drawSoldier(s, controlled) {
    const ctx = this.ctx;
    if (!s.alive) return;
    const x = Math.round(s.x), y = Math.round(s.y), w = s.w, h = s.h, cx = x + w / 2, dir = s.facing;

    this._shadow(ctx, cx, y + h, w * 0.85);

    if (controlled) {
      const p = 0.5 + 0.5 * Math.sin(this.time * 5);
      ctx.strokeStyle = `rgba(255,211,106,${0.35 + p * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, y + h - 1, w * 0.7, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffd36a";
      const cyv = y - 20 - p * 3;
      ctx.beginPath();
      ctx.moveTo(cx, cyv + 9);
      ctx.lineTo(cx - 6, cyv);
      ctx.lineTo(cx + 6, cyv);
      ctx.closePath();
      ctx.fill();
    }

    const flash = s.hitFlash > 0;
    const base = flash ? "#ffffff" : s.color;
    const dark = flash ? "#ffffff" : this._shade(s.color, -22);

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
    // weapon
    ctx.fillStyle = "#0b0f18";
    const gunLen = w * 0.62, gy = y + h * 0.42;
    if (s.aimUp) ctx.fillRect(cx - 2, y - 8, 4, h * 0.42);
    else if (dir > 0) ctx.fillRect(cx, gy, gunLen, 5);
    else ctx.fillRect(cx - gunLen, gy, gunLen, 5);

    if (s.muzzleFlash > 0) this._drawMuzzle(ctx, s, s.aimUp ? { x: cx, y: y - 10 } : { x: dir > 0 ? x + w + 4 : x - 4, y: gy + 2 });
    if (s.burn) this._drawBurn(ctx, x, y, w, h);
    this._healthBar(x, y - 8, w, s.health / s.maxHealth, controlled ? "#7ad7ff" : "#6fcf97");
  }

  _drawEnemy(e) {
    const ctx = this.ctx;
    if (!e.alive) return;
    const x = Math.round(e.x), y = Math.round(e.y), w = e.w, h = e.h, cx = x + w / 2, cy = y + h / 2;

    this._shadow(ctx, cx, y + h, w * 0.85);

    const charging = e.windup > 0;
    if (charging) {
      const p = 0.5 + 0.5 * Math.sin(this.time * 30);
      this._glow(ctx, cx, cy, w * 0.9 + p * 10, "rgba(255,80,80,0.35)");
    }
    const flash = e.hitFlash > 0;
    const body = flash ? "#ffffff" : e.color;

    switch (e.def.behavior) {
      case "charger": this._drawDrone(ctx, e, x, y, w, h, cx, cy, body, flash); break;
      case "shooter": this._drawSentinel(ctx, e, x, y, w, h, cx, body, flash); break;
      case "turret": this._drawTurret(ctx, e, x, y, w, h, cx, body, flash); break;
    }

    if (charging) {
      ctx.strokeStyle = "rgba(255,90,90,0.7)";
      ctx.lineWidth = 2;
      this._roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 5);
      ctx.stroke();
    }
    if (e.burn) this._drawBurn(ctx, x, y, w, h);
    if (e.muzzleFlash > 0)
      this._drawMuzzle(ctx, e, { x: e.facing > 0 ? x + w + 4 : x - 4, y: y + h * 0.42 });
    if (e.health < e.maxHealth) this._healthBar(x, y - 8, w, e.health / e.maxHealth, "#ff6a6a");
  }

  _drawDrone(ctx, e, x, y, w, h, cx, cy, body, flash) {
    const bob = Math.sin(this.time * 8 + e.x) * 2;
    ctx.save();
    ctx.translate(cx, cy + bob);
    // wings / struts
    ctx.fillStyle = this._shade(e.color, -36);
    ctx.fillRect(-w * 0.6, -3, w * 1.2, 6);
    // body diamond
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.5);
    ctx.lineTo(w * 0.5, 0);
    ctx.lineTo(0, h * 0.5);
    ctx.lineTo(-w * 0.5, 0);
    ctx.closePath();
    ctx.fill();
    // eye
    const ex = e.facing > 0 ? 5 : -5;
    this._glow(ctx, ex, -2, 9, "rgba(255,120,60,0.6)");
    ctx.fillStyle = "#2a0d0d";
    ctx.beginPath();
    ctx.arc(ex, -2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flash ? "#ffffff" : "#ff5a4a";
    ctx.beginPath();
    ctx.arc(ex + (e.facing > 0 ? 1 : -1), -2, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // thruster
    ctx.fillStyle = `rgba(120,200,255,${0.35 + 0.3 * Math.random()})`;
    ctx.beginPath();
    ctx.moveTo(-4, h * 0.4);
    ctx.lineTo(0, h * 0.62 + Math.random() * 4);
    ctx.lineTo(4, h * 0.4);
    ctx.fill();
    ctx.restore();
  }

  _drawSentinel(ctx, e, x, y, w, h, cx, body, flash) {
    // legs
    ctx.fillStyle = this._shade(e.color, -42);
    ctx.fillRect(x + w * 0.2, y + h * 0.6, w * 0.16, h * 0.4);
    ctx.fillRect(x + w * 0.64, y + h * 0.6, w * 0.16, h * 0.4);
    // torso
    ctx.fillStyle = body;
    this._roundRect(ctx, x + w * 0.15, y + h * 0.2, w * 0.7, h * 0.45, 5);
    ctx.fill();
    // core
    const p = 0.5 + 0.5 * Math.sin(this.time * 4);
    this._glow(ctx, cx, y + h * 0.4, 12 + p * 4, "rgba(180,90,255,0.6)");
    ctx.fillStyle = flash ? "#ffffff" : "#d98cff";
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.4, 5, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.fillStyle = this._shade(e.color, -26);
    this._roundRect(ctx, x + w * 0.3, y, w * 0.4, h * 0.22, 4);
    ctx.fill();
    ctx.fillStyle = "#ff7ad0";
    ctx.fillRect(e.facing > 0 ? cx : x + w * 0.32, y + h * 0.07, w * 0.2, 3);
    // arm cannon
    ctx.fillStyle = "#1a1030";
    if (e.facing > 0) ctx.fillRect(cx, y + h * 0.32, w * 0.6, 6);
    else ctx.fillRect(cx - w * 0.6, y + h * 0.32, w * 0.6, 6);
  }

  _drawTurret(ctx, e, x, y, w, h, cx, body, flash) {
    // base
    ctx.fillStyle = this._shade(e.color, -38);
    this._roundRect(ctx, x + w * 0.1, y + h * 0.55, w * 0.8, h * 0.45, 4);
    ctx.fill();
    // dome
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.55, w * 0.42, Math.PI, 0);
    ctx.fill();
    // barrel
    ctx.fillStyle = "#141018";
    const by = y + h * 0.42;
    if (e.facing > 0) ctx.fillRect(cx, by, w * 0.55, 7);
    else ctx.fillRect(cx - w * 0.55, by, w * 0.55, 7);
    // lens
    const p = 0.5 + 0.5 * Math.sin(this.time * 3);
    this._glow(ctx, cx, y + h * 0.5, 10 + p * 3, "rgba(255,150,60,0.6)");
    ctx.fillStyle = flash ? "#ffffff" : "#ffb15a";
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.5, 5, 0, Math.PI * 2);
    ctx.fill();
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

  _drawProjectile(p) {
    const ctx = this.ctx;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    if (p.w >= 12 && p.h >= 12) {
      // plasma orb
      const r = Math.max(p.w, p.h) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // bullet with a bright core + faint trail
      const dir = Math.sign(p.vx) || 1;
      this._roundRect(ctx, p.x - dir * 4, cy - p.h / 2, p.w + 6, p.h, p.h / 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(p.x, cy - 1, p.w, 2);
    }
    ctx.restore();
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

  _drawHUD() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;

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

    // objective + loot (top-right)
    const lootCount = (this.scene.collected || []).length;
    ctx.textAlign = "right";
    ctx.fillStyle = "#8affc1";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText("▶  REACH EXTRACTION", W - 16, 26);
    ctx.fillStyle = "#f2c14e";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`◈  Loot recovered: ${lootCount}`, W - 16, 46);
    ctx.textAlign = "left";

    // controls strip (bottom)
    ctx.fillStyle = "rgba(7,11,19,0.6)";
    ctx.fillRect(0, H - 22, W, 22);
    ctx.fillStyle = "rgba(190,200,215,0.7)";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "A / D  move          W  aim up          SPACE  jump          J  fire          TAB  swap soldier",
      W / 2,
      H - 7
    );
    ctx.textAlign = "left";
  }

  _drawIntro() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const a = clamp(this.introTimer / 2.2, 0, 1);
    ctx.save();
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
    const W = this.canvas.width, H = this.canvas.height;
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
