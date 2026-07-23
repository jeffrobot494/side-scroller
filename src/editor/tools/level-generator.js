// ---------------------------------------------------------------------------
// LEVEL GENERATOR PLAYGROUND — the editor tuning surface for Slice 1 generation.
//
// Set a seed + params (difficulty, length, boss, campaign scale, enemy roster),
// generate a level with the SAME generateLevel() the game uses, and see it drawn
// as a schematic + the validation report (budget spent vs total, enemy/perch
// counts, dropped perches, reachability ceiling). Deterministic: a given seed
// always redraws the same level, so you can tune, compare, and copy the JSON.
//
// createLevelGenerator(container, onBack) → { dispose() }
// ---------------------------------------------------------------------------

import { generateLevel, DIFFICULTY, BIOMES } from "../../game/gen/levelgen.js";
import { missionRoster } from "../../game/enemyspecs.js";

const LENGTHS = ["short", "medium", "long"];

export function createLevelGenerator(container, onBack) {
  // The built-in EnemySpec mission roster the game actually generates against.
  // Chips list the normal enemies; the boss descriptor is added only when the
  // Boss toggle is on (matching state.js). enemyDef() resolves either for the
  // schematic. All roster entries carry id/name/behavior/threat (see enemyspecs).
  const rosterList = missionRoster();
  const bossDesc = missionRoster({ boss: true }).find((d) => !rosterList.some((r) => r.id === d.id));
  const rosterDefs = Object.fromEntries([...rosterList, ...(bossDesc ? [bossDesc] : [])].map((d) => [d.id, d]));
  const params = {
    seed: (Math.random() * 1e9) | 0,
    difficulty: "medium",
    length: "medium",
    boss: false,
    scale: 1,
    biome: "", // "" = auto
    roster: new Set(rosterList.map((d) => d.id)),
  };
  let result = null;

  container.innerHTML = `
    <div class="wd lg">
      <div class="wd-head">
        <button class="btn btn-ghost" data-lg="back">← Tools</button>
        <span class="wd-name" style="min-width:auto">Level Generator</span>
        <span class="wd-id" id="lg-id"></span>
      </div>

      <div class="lg-params">
        <label class="lg-field">Seed
          <span class="lg-seedrow">
            <input type="number" data-lg="seed" value="${params.seed}" />
            <button class="btn btn-alt" data-lg="reseed" title="Random seed">⟳</button>
          </span>
        </label>
        <label class="lg-field">Difficulty
          <select data-lg="difficulty">${DIFFICULTY.map((d) => `<option value="${d.id}"${d.id === params.difficulty ? " selected" : ""}>${d.name}</option>`).join("")}</select>
        </label>
        <label class="lg-field">Length
          <select data-lg="length">${LENGTHS.map((l) => `<option value="${l}"${l === params.length ? " selected" : ""}>${l}</option>`).join("")}</select>
        </label>
        <label class="lg-field">Biome
          <select data-lg="biome"><option value="">auto</option>${BIOMES.map((b) => `<option value="${b.id}">${b.id}</option>`).join("")}</select>
        </label>
        <label class="lg-field">Campaign scale <output id="lg-scaleval">1.0</output>
          <input type="range" data-lg="scale" min="1" max="2.5" step="0.1" value="1" />
        </label>
        <label class="lg-field lg-boss">Boss lead
          <button type="button" role="switch" class="toggle" data-lg="boss"><span class="knob"></span></button>
        </label>
      </div>

      <div class="lg-roster" id="lg-roster">
        <span class="lg-roster-label">Roster:</span>
        ${rosterList
          .map((d) => `<label class="lg-chip"><input type="checkbox" data-lg-enemy="${d.id}" checked /> ${escapeHtml(d.name || d.id)}</label>`)
          .join("")}
      </div>

      <canvas class="lg-canvas" id="lg-canvas" width="840" height="200"></canvas>

      <div class="lg-out">
        <div class="lg-report" id="lg-report"></div>
        <div class="wd-budget lg-budget">
          <div class="wd-tier">Threat budget <b id="lg-budgetnum" style="margin-left:auto"></b></div>
          <div class="wd-meter"><span class="wd-meter-fill" id="lg-meter"></span></div>
          <div class="wd-verdict" id="lg-verdict"></div>
        </div>
      </div>

      <div class="wd-export">
        <button class="btn" data-lg="copy">Copy level JSON</button>
        <span class="ed-msg" id="lg-msg"></span>
        <textarea class="ed-json wd-json" id="lg-json" spellcheck="false" readonly></textarea>
      </div>
    </div>`;

  const $ = (s) => container.querySelector(s);
  const canvas = $("#lg-canvas");
  const ctx = canvas.getContext("2d");

  function currentRoster() {
    const defs = rosterList.filter((d) => params.roster.has(d.id));
    const base = defs.length ? defs : rosterList;
    // A boss lead adds the boss to the pool so the generator can frame it in.
    return params.boss && bossDesc ? [...base, bossDesc] : base;
  }

  function generate() {
    result = generateLevel({
      seed: params.seed | 0,
      difficulty: params.difficulty,
      length: params.length,
      boss: params.boss,
      biome: params.biome || undefined,
      scale: params.scale,
      roster: currentRoster(),
    });
    $("#lg-id").textContent = `${result.level.id} · ${result.level.name}`;
    $("#lg-json").value = JSON.stringify(result.level, null, 2);
    renderReport(result.report);
    draw(result.level, result.report);
  }

  function renderReport(r) {
    const tile = (label, val) => `<div class="lg-tile"><span>${label}</span><b>${val}</b></div>`;
    $("#lg-report").innerHTML =
      tile("Enemies", r.enemyCount) +
      tile("Platforms", r.perchCount) +
      tile("Dropped", r.droppedPerches) +
      tile("Unreachable", r.unreachable ?? 0) +
      tile("Culled", r.culledStructures ?? 0) +
      tile("World", r.width + "px") +
      tile("Jump ceiling", r.maxRise + "px") +
      tile("Difficulty", r.boss ? "boss" : r.difficulty);

    const pct = Math.min(100, (r.spent / r.budget) * 100);
    $("#lg-budgetnum").textContent = `${r.spent} / ${r.budget}`;
    const meter = $("#lg-meter");
    meter.style.width = pct + "%";
    meter.style.background = r.legal ? "linear-gradient(90deg,#57c98a,#7ad7ff)" : "linear-gradient(90deg,#e0a24e,#e05a5a)";
    const v = $("#lg-verdict");
    v.textContent = r.legal ? `✓ Within budget (${r.budget - r.spent} spare)` : `✕ Over budget by ${r.spent - r.budget}`;
    v.className = "wd-verdict " + (r.legal ? "ok" : "bad");
  }

  function draw(level, report) {
    const W = canvas.width, H = canvas.height;
    const scale = W / level.world.width;
    const X = (x) => x * scale, Y = (y) => y * scale, S = (v) => v * scale;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c1424"); g.addColorStop(1, "#161f2a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // single-jump ceiling (maxRise above ground) — structures may climb past
    // it via chained jumps, but every FIRST piece starts below this line
    const groundTop = level.platforms[0].y;
    const ceilY = Y(groundTop - report.maxRise);
    ctx.strokeStyle = "rgba(122,215,255,0.35)"; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, ceilY); ctx.lineTo(W, ceilY); ctx.stroke(); ctx.setLineDash([]);

    // platforms: index 0 is the ground slab, the rest are perches
    ctx.fillStyle = "#2b3746";
    ctx.fillRect(0, Y(groundTop), W, H - Y(groundTop));
    ctx.fillStyle = "#3a4a5c";
    for (const p of level.platforms.slice(1)) roundFill(ctx, X(p.x), Y(p.y), S(p.w), Math.max(3, S(p.h)));

    // spawn marker
    ctx.fillStyle = "#57c98a";
    tri(ctx, X(level.playerSpawn.x), Y(groundTop), 7);
    // exit marker
    ctx.fillStyle = "rgba(242,193,78,0.85)";
    ctx.fillRect(X(level.exit.x), Y(level.exit.y), Math.max(3, S(level.exit.w)), S(level.exit.h));

    // enemies
    for (const e of level.enemies) {
      const def = enemyDef(e.type);
      const ex = X(e.x), ey = Y(e.y), ew = Math.max(4, S(def ? def.w : 26)), eh = Math.max(6, S(def ? def.h : 30));
      ctx.fillStyle = (def && def.color) || "#e05a5a";
      ctx.fillRect(ex, ey, ew, eh);
      if (def && ew >= 8) {
        ctx.fillStyle = "#0b0f18"; ctx.font = "8px system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.fillText((def.behavior || "?")[0].toUpperCase(), ex + ew / 2, ey + eh / 2 + 3);
        ctx.textAlign = "left";
      }
    }

    ctx.fillStyle = "rgba(190,200,215,0.55)"; ctx.font = "10px system-ui, sans-serif";
    ctx.fillText(`seed ${level.id.replace("gen_", "")} · scale ${x1(params.scale)}`, 8, 14);
  }

  function enemyDef(type) { return rosterDefs[type] || rosterList[0]; }

  // ---- events -------------------------------------------------------------
  container.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.lg === "seed") { params.seed = t.value | 0; generate(); }
    else if (t.dataset.lg === "scale") { params.scale = Number(t.value); $("#lg-scaleval").textContent = x1(params.scale); generate(); }
  });

  container.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.lg === "difficulty") { params.difficulty = t.value; generate(); }
    else if (t.dataset.lg === "length") { params.length = t.value; generate(); }
    else if (t.dataset.lg === "biome") { params.biome = t.value; generate(); }
    else if (t.dataset.lgEnemy) {
      if (t.checked) params.roster.add(t.dataset.lgEnemy);
      else params.roster.delete(t.dataset.lgEnemy);
      generate();
    }
  });

  container.addEventListener("click", (e) => {
    const el = e.target.closest("[data-lg]");
    if (!el) return;
    switch (el.dataset.lg) {
      case "back": onBack(); break;
      case "reseed": {
        params.seed = (Math.random() * 1e9) | 0;
        const inp = $('[data-lg="seed"]'); if (inp) inp.value = params.seed;
        generate();
        break;
      }
      case "boss": {
        params.boss = el.classList.toggle("on");
        generate();
        break;
      }
      case "copy": copyJSON(); break;
    }
  });

  function copyJSON() {
    const text = $("#lg-json").value;
    const msg = $("#lg-msg");
    const done = (ok) => { msg.textContent = ok ? "Level JSON copied." : "Copy failed — select the text below."; msg.className = "ed-msg " + (ok ? "ok" : "bad"); };
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
      else done(false);
    } catch { done(false); }
  }

  generate(); // one synchronous generate + draw (also makes headless mount verifiable)

  return { dispose() { /* static tool: no animation loop to cancel */ } };
}

// ---- helpers --------------------------------------------------------------
function x1(n) { return Number(n).toFixed(1); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function roundFill(ctx, x, y, w, h) { ctx.fillRect(x, y, w, h); }
function tri(ctx, cx, baseY, r) {
  ctx.beginPath(); ctx.moveTo(cx, baseY - r * 2); ctx.lineTo(cx - r, baseY); ctx.lineTo(cx + r, baseY); ctx.closePath(); ctx.fill();
}
