// ---------------------------------------------------------------------------
// ENEMYSPEC RENDERING — draw a live spec-enemy tree with primitive shapes.
//
// Coordinates are world-space on a ctx the host has already translated (the
// preview/Firing Room draw 1:1; a camera host would translate first) — same
// contract as mission/render.js drawProjectile. Cosmetic only: telegraph pulse,
// hit flash, muzzle flash, per-part health bars. Generated enemies have no
// bespoke art; the readable silhouette comes from shape/size/color composition.
// ---------------------------------------------------------------------------

export function drawSpecEnemy(ctx, root, time = 0) {
  drawTree(ctx, root, time);
  for (const sp of root.spawned) drawTree(ctx, sp, time);
}

function drawTree(ctx, e, time) {
  if (!e.alive) return;
  if (!e.disabled) drawEntity(ctx, e, time);
  for (const c of e.children) drawTree(ctx, c, time);
}

function drawEntity(ctx, e, time) {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;

  // telegraph: a pulsing warning glow around the part about to act
  if (e.telegraph > 0) {
    const p = 0.5 + 0.5 * Math.sin(time * 26);
    glow(ctx, cx, cy, Math.max(e.w, e.h) * 0.8 + p * 8, `rgba(255,90,90,${0.28 + p * 0.2})`);
    ctx.strokeStyle = `rgba(255,110,90,${0.5 + p * 0.4})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(e.x - 3, e.y - 3, e.w + 6, e.h + 6);
  }

  const flash = e.hitFlash > 0;
  ctx.fillStyle = flash ? "#ffffff" : e.spec.visual.color;

  switch (e.spec.visual.shape) {
    case "circle": {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(e.w, e.h) / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "ellipse": {
      ctx.beginPath();
      ctx.ellipse(cx, cy, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "diamond": {
      ctx.beginPath();
      ctx.moveTo(cx, e.y);
      ctx.lineTo(e.x + e.w, cy);
      ctx.lineTo(cx, e.y + e.h);
      ctx.lineTo(e.x, cy);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "box":
    default: {
      roundRect(ctx, e.x, e.y, e.w, e.h, Math.min(5, e.w / 4, e.h / 4));
      ctx.fill();
      break;
    }
  }

  // a facing "eye" so movement intent reads even on abstract shapes
  if (e.isRoot || e.maxHealth) {
    ctx.fillStyle = flash ? "#333" : "rgba(10,14,22,0.85)";
    const eyeX = e.facing >= 0 ? e.x + e.w * 0.72 : e.x + e.w * 0.28;
    ctx.beginPath();
    ctx.arc(eyeX, e.y + e.h * 0.35, Math.max(2, Math.min(4, e.w * 0.09)), 0, Math.PI * 2);
    ctx.fill();
  }

  if (e.muzzleFlash > 0) {
    e.muzzleFlash -= 1 / 60;
    glow(ctx, cx + e.facing * (e.w / 2 + 6), cy, 12, hexAlpha(e.muzzleColor || "#ff8a5a", 0.8));
  }

  if (e.burn) drawBurn(ctx, e, time);

  // health bar on any damaged, damageable part
  if (e.maxHealth && e.health < e.maxHealth) {
    const frac = Math.max(0, e.health / e.maxHealth);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(e.x, e.y - 7, e.w, 4);
    ctx.fillStyle = e.isRoot ? "#ff6a6a" : "#ffb15a";
    ctx.fillRect(e.x, e.y - 7, Math.max(2, e.w * frac), 4);
  }
}

function drawBurn(ctx, e, time) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 3; i++) {
    const fx = e.x + (i + 0.5) * (e.w / 3) + Math.sin(time * 12 + i) * 2;
    const fh = 6 + Math.random() * 8;
    ctx.fillStyle = `rgba(255,${(120 + Math.random() * 80) | 0},40,0.55)`;
    ctx.beginPath();
    ctx.moveTo(fx - 3, e.y + 2);
    ctx.lineTo(fx, e.y - fh);
    ctx.lineTo(fx + 3, e.y + 2);
    ctx.fill();
  }
  ctx.restore();
}

function glow(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexAlpha(color, a) {
  if (typeof color === "string" && color.startsWith("#")) {
    let c = color.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`;
  }
  return color;
}
