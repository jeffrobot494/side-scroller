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
    if (this.introTimer > 0) this.introTimer -= dt;

    // Resolve the end banner countdown, then hand back the result.
    if (this.endBanner) {
      this.endBanner.timer -= dt;
      if (this.endBanner.timer <= 0) this._finish();
      return;
    }

    // Central fire-cooldown tick for every shooter (so semi-auto stays honest).
    for (const s of scene.soldiers) if (s.fireCooldown > 0) s.fireCooldown -= dt;
    for (const e of scene.enemies) {
      if (e.fireCooldown > 0) e.fireCooldown -= dt;
      if (e.contactCooldown > 0) e.contactCooldown -= dt;
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
        if (wantFire) fire(scene, s, s.fireDir(), "player", dt, 1);
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
          break;
        }
      }
      if (p.dead) continue;

      const targets = p.team === "player" ? scene.enemies : scene.soldiers;
      for (const t of targets) {
        if (!t.alive || !overlaps(p, t)) continue;
        this._applyEffects(t, p.effects, p.owner);
        p.dead = true;
        break;
      }
    }
    scene.projectiles = scene.projectiles.filter((p) => !p.dead);
  }

  _applyEffects(target, effects, owner) {
    for (const fx of effects) {
      if (fx.kind === "damage") this._damage(target, fx.amount, owner);
      else if (fx.kind === "burn") {
        target.burn = { dps: fx.dps, time: fx.duration }; // refreshes on re-hit
        target._burnOwner = owner; // so a burn kill still credits the shooter
      }
    }
  }

  _damage(target, amount, owner) {
    if (!target.alive) return;
    target.health -= amount;
    target.hitFlash = 0.12;
    if (target.health <= 0) this._kill(target, owner);
  }

  _kill(target, owner) {
    if (!target.alive) return;
    target.alive = false;
    if (target.kind === "enemy") {
      if (owner && owner.kind === "soldier") owner.kills += 1;
      this._dropLoot(target);
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

  // ---- rendering ----------------------------------------------------------

  render() {
    const ctx = this.ctx;
    const scene = this.scene;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // parallax sky
    ctx.fillStyle = "#141726";
    ctx.fillRect(0, 0, W, H);
    this._drawParallax();

    ctx.save();
    ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y));

    // platforms
    for (const p of scene.platforms) {
      ctx.fillStyle = "#0f3460";
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = "rgba(120,160,210,0.18)";
      ctx.fillRect(p.x, p.y, p.w, 3);
    }

    // exit gate
    const ex = scene.exit;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    ctx.fillStyle = `rgba(120, 240, 170, ${0.25 + pulse * 0.25})`;
    ctx.fillRect(ex.x, ex.y, ex.w, ex.h);
    ctx.strokeStyle = "#8affc1";
    ctx.lineWidth = 2;
    ctx.strokeRect(ex.x, ex.y, ex.w, ex.h);
    ctx.fillStyle = "#8affc1";
    ctx.font = "12px monospace";
    ctx.fillText("EXTRACT", ex.x - 6, ex.y - 8);

    // loot
    for (const l of scene.loot) {
      if (l.collected) continue;
      const y = l.y + Math.sin(l.bob) * 3;
      ctx.fillStyle = "#f2c14e";
      ctx.fillRect(l.x, y, l.w, l.h);
      ctx.strokeStyle = "#fff2c0";
      ctx.strokeRect(l.x, y, l.w, l.h);
    }

    for (const e of scene.enemies) this._drawEnemy(e);
    for (const p of scene.projectiles) this._drawProjectile(p);
    for (const s of scene.soldiers) this._drawSoldier(s, s === this.currentSoldier());

    ctx.restore();

    this._drawHUD();
    if (this.introTimer > 0) this._drawIntro();
    if (this.endBanner) this._drawEndBanner();
  }

  _drawParallax() {
    const ctx = this.ctx;
    const H = this.canvas.height;
    ctx.fillStyle = "rgba(60, 70, 110, 0.35)";
    const off = -(this.camera.x * 0.3) % 260;
    for (let x = off - 260; x < this.canvas.width + 260; x += 260) {
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.lineTo(x + 130, H - 180);
      ctx.lineTo(x + 260, H);
      ctx.fill();
    }
  }

  _drawSoldier(s, controlled) {
    const ctx = this.ctx;
    if (!s.alive) return;
    // body
    ctx.fillStyle = s.hitFlash > 0 ? "#ffffff" : s.color;
    ctx.fillRect(Math.round(s.x), Math.round(s.y), s.w, s.h);
    // burn tint
    if (s.burn) {
      ctx.fillStyle = "rgba(255,120,40,0.35)";
      ctx.fillRect(Math.round(s.x), Math.round(s.y), s.w, s.h);
    }
    // muzzle direction pip
    ctx.fillStyle = "#0b0f18";
    const gx = s.aimUp ? s.x + s.w / 2 - 2 : s.facing > 0 ? s.x + s.w - 6 : s.x;
    const gy = s.aimUp ? s.y - 4 : s.y + s.h * 0.4;
    ctx.fillRect(gx, gy, 6, 6);
    // controlled marker
    if (controlled) {
      ctx.fillStyle = "#ffd36a";
      ctx.beginPath();
      ctx.moveTo(s.x + s.w / 2, s.y - 16);
      ctx.lineTo(s.x + s.w / 2 - 6, s.y - 26);
      ctx.lineTo(s.x + s.w / 2 + 6, s.y - 26);
      ctx.fill();
    }
    this._healthBar(s.x, s.y - 10, s.w, s.health / s.maxHealth, controlled ? "#7ad7ff" : "#6fcf97");
  }

  _drawEnemy(e) {
    const ctx = this.ctx;
    if (!e.alive) return;
    // telegraph flash while winding up a shot
    let color = e.color;
    if (e.windup > 0) {
      const f = Math.sin(performance.now() / 40) * 0.5 + 0.5;
      color = f > 0.5 ? "#ffffff" : e.color;
    }
    ctx.fillStyle = e.hitFlash > 0 ? "#ffffff" : color;
    ctx.fillRect(Math.round(e.x), Math.round(e.y), e.w, e.h);
    if (e.burn) {
      ctx.fillStyle = "rgba(255,120,40,0.35)";
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.w, e.h);
    }
    // eye / facing
    ctx.fillStyle = "#1a1030";
    ctx.fillRect(e.facing > 0 ? e.x + e.w - 10 : e.x + 4, e.y + 8, 6, 6);
    // telegraph ring
    if (e.windup > 0) {
      ctx.strokeStyle = "#ff5a5a";
      ctx.lineWidth = 2;
      ctx.strokeRect(e.x - 3, e.y - 3, e.w + 6, e.h + 6);
    }
    if (e.health < e.maxHealth)
      this._healthBar(e.x, e.y - 8, e.w, e.health / e.maxHealth, "#e05a5a");
  }

  _drawProjectile(p) {
    const ctx = this.ctx;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.w, p.h);
  }

  _healthBar(x, y, w, frac, color) {
    const ctx = this.ctx;
    frac = clamp(frac, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * frac, 4);
  }

  _drawHUD() {
    const ctx = this.ctx;
    // squad roster panel
    let y = 14;
    ctx.font = "12px monospace";
    for (let i = 0; i < this.scene.soldiers.length; i++) {
      const s = this.scene.soldiers[i];
      const controlled = i === this.controlled && s.alive;
      ctx.fillStyle = "rgba(10,14,22,0.7)";
      ctx.fillRect(12, y, 210, 34);
      if (controlled) {
        ctx.strokeStyle = "#ffd36a";
        ctx.strokeRect(12, y, 210, 34);
      }
      ctx.fillStyle = s.alive ? "#e0e6f0" : "#6a5555";
      const tag = s.alive ? "" : "  ✝ KIA";
      ctx.fillText(`${s.name}${tag}`, 20, y + 15);
      // health
      const frac = clamp(s.health / s.maxHealth, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(20, y + 21, 160, 6);
      ctx.fillStyle = s.alive ? "#6fcf97" : "#3a2a2a";
      ctx.fillRect(20, y + 21, 160 * frac, 6);
      ctx.fillStyle = "#9aa6b4";
      ctx.fillText(s.weapon.name, 190, y + 27);
      y += 40;
    }

    // objective + loot + controls (bottom strip)
    const H = this.canvas.height;
    ctx.fillStyle = "rgba(10,14,22,0.7)";
    ctx.fillRect(0, H - 26, this.canvas.width, 26);
    ctx.fillStyle = "#cdd6e4";
    ctx.fillText("A/D move · W aim up · Space jump · J fire · Tab swap soldier", 12, H - 9);
    const lootCount = (this.scene.collected || []).length;
    ctx.fillStyle = "#f2c14e";
    ctx.textAlign = "right";
    ctx.fillText(`Loot: ${lootCount}    →  Reach EXTRACT`, this.canvas.width - 12, H - 9);
    ctx.textAlign = "left";
  }

  _drawIntro() {
    const ctx = this.ctx;
    const a = clamp(this.introTimer / 2.2, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${a * 0.5})`;
    ctx.fillRect(0, this.canvas.height / 2 - 40, this.canvas.width, 80);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.mission.name, this.canvas.width / 2, this.canvas.height / 2 + 8);
    ctx.textAlign = "left";
  }

  _drawEndBanner() {
    const ctx = this.ctx;
    const win = this.endBanner.success;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = win ? "#8affc1" : "#e05a5a";
    ctx.font = "bold 40px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      win ? "EXTRACTION SUCCESSFUL" : "SQUAD WIPED",
      this.canvas.width / 2,
      this.canvas.height / 2
    );
    ctx.textAlign = "left";
  }
}
