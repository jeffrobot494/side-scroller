// ---------------------------------------------------------------------------
// PROGRESSION — edit the soldier progression rules and preview their effect
// (tech/soldier-progression.md, P4; design/soldier-progression.md).
//
// Edits a DRAFT: the curve, growth rules, per-level overrides, attribute caps,
// eligibility, keep-XP-at-cap, the level-up health policy, and the recruits'
// primary/secondary. The draft is validated on every change and the preview
// (level table, cumulative bonuses, an example soldier) is drawn from it. Save
// writes it through progressionstore.js only when it validates; a draft with
// errors cannot replace working rules. Saved rules apply to campaigns started
// after the save — reload the game.
//
// Base HP and HP per Health are the config knobs themselves, written through
// setConfig like the Settings tab, so there is one default for each.
//
// createProgressionEditor(container, onBack) → { dispose(), …verbs for tests }
// ---------------------------------------------------------------------------

import {
  ATTRIBUTE_IDS,
  defaultProgression,
  validateProgression,
  thresholdFor,
  grantsAt,
  bonusesThrough,
  resolveSoldier,
} from "../../game/progression.js";
import {
  activeProgression,
  activeAssignments,
  shippedAssignments,
  saveProgression,
  revertProgression,
  isCustomized,
} from "../../game/progressionstore.js";
import { RECRUIT_POOL, soldierMaxHp } from "../../game/soldiers.js";
import { config, setConfig } from "../../game/config.js";

const LABEL = { aim: "Aim", health: "Health", speed: "Speed", nerve: "Nerve" };
const TARGETS = [
  ["flatMaxHp", "Flat max HP"],
  ["primary", "Primary"],
  ["secondary", "Secondary"],
  ["others", "Other attributes"],
  ...ATTRIBUTE_IDS.map((a) => [a, LABEL[a]]),
];
const POLICIES = [
  ["preserveWounds", "Keep wounds (current HP rises with max)"],
  ["preserveCurrentHp", "Keep current HP"],
  ["fullHeal", "Full heal"],
];

export function createProgressionEditor(container, onBack) {
  let def = activeProgression();
  let pairs = activeAssignments();
  let example = RECRUIT_POOL[0] ? RECRUIT_POOL[0].id : null;
  let msg = { kind: "", text: isCustomized() ? "Editing this browser's saved rules." : "Editing the shipped rules." };
  let json = "";

  // ---- the draft -----------------------------------------------------------

  const validate = () =>
    validateProgression(def, {
      soldiers: RECRUIT_POOL.map((r) => ({ ...r, ...pairs[r.id] })),
      baseHp: config.soldierBaseHp,
      hpPerHealth: config.soldierHpPerHealth,
    });

  // Keep exactly one cost per transition when the curve's ends move, so the
  // table never shows a hole the validator would only complain about.
  function reshapeCurve() {
    if (!Number.isSafeInteger(def.startLevel) || !Number.isSafeInteger(def.maxLevel)) return;
    const next = {};
    let prev = 10;
    for (let l = def.startLevel + 1; l <= def.maxLevel; l++) {
      next[l] = def.xpCost[l] ?? prev * 2;
      prev = next[l];
    }
    def.xpCost = next;
  }

  function setPath(path, raw, kind) {
    if (path.startsWith("@assign.")) {
      const [, id, slot] = path.split(".");
      pairs[id] = { ...pairs[id], [slot]: raw };
      return;
    }
    if (path.startsWith("@config.")) {
      setConfig(path.slice(8), Number(raw));
      return;
    }
    let value = raw;
    if (kind === "number") value = raw === "" ? null : Number(raw);
    if (kind === "bool") value = !!raw;
    const keys = path.split(".");
    let o = def;
    for (const k of keys.slice(0, -1)) o = o[k];
    const last = keys[keys.length - 1];
    if (value === null && (last === "cap" || last === "last")) {
      if (last === "cap") delete o.cap;
      else o.last = null;
    } else {
      o[last] = value;
    }
    if (path === "startLevel" || path === "maxLevel") reshapeCurve();
  }

  // ---- rendering -----------------------------------------------------------

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function draw() {
    const v = validate();
    const bad = new Set(v.errors.map((e) => e.path));
    const cls = (path) => (bad.has(path) ? ' class="pg-bad"' : "");
    const num = (path, value, extra = "") =>
      `<input type="number" data-path="${path}" data-kind="number" value="${value ?? ""}"${cls(path)} ${extra}>`;
    const select = (path, options, value) =>
      `<select data-path="${path}"${cls(path)}>${options.map(([k, l]) => `<option value="${k}"${k === value ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const check = (path, on, label) =>
      `<label class="pg-check"><input type="checkbox" data-path="${path}" data-kind="bool"${on ? " checked" : ""}> ${esc(label)}</label>`;

    const curveShaped = Number.isSafeInteger(def.startLevel) && Number.isSafeInteger(def.maxLevel) && def.startLevel <= def.maxLevel;
    const costs = curveShaped
      ? Object.keys(def.xpCost)
          .map((l) => `<label class="pg-field">→ ${l} ${num(`xpCost.${l}`, def.xpCost[l])}</label>`)
          .join("")
      : "";

    const ruleRows = def.growthRules
      .map(
        (r, i) => `<tr>
          <td><input type="text" data-path="growthRules.${i}.id" value="${esc(r.id)}"${cls(`growthRules.${i}.id`)}></td>
          <td>${select(`growthRules.${i}.target`, TARGETS, r.target)}</td>
          <td>${num(`growthRules.${i}.amount`, r.amount, 'step="any"')}</td>
          <td>${num(`growthRules.${i}.first`, r.first)}</td>
          <td>${num(`growthRules.${i}.every`, r.every)}</td>
          <td>${num(`growthRules.${i}.last`, r.last, 'placeholder="cap"')}</td>
          <td><button class="btn btn-ghost" data-pg="rule-del" data-i="${i}">✕</button></td>
        </tr>`
      )
      .join("");

    const overrides = Object.entries(def.levelOverrides)
      .map(
        ([level, grants]) => `<div class="pg-override">
          <div class="ed-io-btns"><strong>Level ${esc(level)}</strong>${bad.has(`levelOverrides.${level}`) ? ' <span class="ed-msg bad">not a reachable level</span>' : ""}
            <button class="btn btn-alt" data-pg="ovr-grant" data-level="${esc(level)}">+ Grant</button>
            <button class="btn btn-ghost" data-pg="ovr-del" data-level="${esc(level)}">Remove override</button>
            <span class="ed-msg">${grants.length ? "" : "Grants nothing at this level."}</span></div>
          ${grants
            .map(
              (g, i) => `<div class="ed-io-btns">
                ${select(`levelOverrides.${level}.${i}.target`, TARGETS, g.target)}
                ${num(`levelOverrides.${level}.${i}.amount`, g.amount, 'step="any"')}
                <button class="btn btn-ghost" data-pg="ovr-grant-del" data-level="${esc(level)}" data-i="${i}">✕</button>
              </div>`
            )
            .join("")}
        </div>`
      )
      .join("");

    const caps = ATTRIBUTE_IDS.map(
      (a) => `<label class="pg-field">${LABEL[a]} cap ${num(`attributes.${a}.cap`, def.attributes[a] && def.attributes[a].cap, 'placeholder="none"')}</label>`
    ).join("");

    const assign = RECRUIT_POOL.map(
      (r) => `<tr><td>${esc(r.name)}</td>
        <td>${select(`@assign.${r.id}.primary`, ATTRIBUTE_IDS.map((a) => [a, LABEL[a]]), pairs[r.id].primary)}</td>
        <td>${select(`@assign.${r.id}.secondary`, ATTRIBUTE_IDS.map((a) => [a, LABEL[a]]), pairs[r.id].secondary)}</td></tr>`
    ).join("");

    const errors = v.errors.length
      ? `<div class="ed-note bad"><strong>${v.errors.length} problem${v.errors.length === 1 ? "" : "s"} — Save is off until they are fixed.</strong><ul>${v.errors
          .map((e) => `<li><code>${esc(e.path)}</code> ${esc(e.message)}</li>`)
          .join("")}</ul></div>`
      : "";

    container.innerHTML = `
      <div class="wd pg">
        <div class="wd-head">
          <button class="btn btn-ghost" data-pg="back">← Tools</button>
          <span class="wd-name" style="min-width:auto">Progression</span>
          <span class="wd-id">${isCustomized() ? "saved edits in this browser" : "shipped rules"}</span>
        </div>
        <p class="ed-note">Soldier XP, levels and growth. Saved rules apply to <strong>campaigns started after saving</strong> — reload the game. A room server always runs the shipped rules; Copy JSON into <code>src/game/progression.js</code> to make a change permanent. Mission XP rewards are in Settings.</p>
        ${errors}

        <h3 class="wd-h">Level curve</h3>
        <div class="ed-io-btns">
          <label class="pg-field">Start level ${num("startLevel", def.startLevel)}</label>
          <label class="pg-field">Start XP ${num("startXp", def.startXp)}</label>
          <label class="pg-field">Max level ${num("maxLevel", def.maxLevel)}</label>
          ${check("retainXpAtCap", def.retainXpAtCap, "Keep earning XP at max level")}
        </div>
        <p class="ed-note">XP needed from the previous level:</p>
        <div class="ed-io-btns">${costs}</div>

        <h3 class="wd-h">Growth rules</h3>
        <table class="cm-table pg-table">
          <thead><tr><th>Id</th><th>Target</th><th>Amount</th><th>First level</th><th>Every</th><th>Last level</th><th></th></tr></thead>
          <tbody>${ruleRows}</tbody>
        </table>
        <div class="ed-io-btns"><button class="btn btn-alt" data-pg="rule-add">+ Rule</button></div>

        <h3 class="wd-h">Per-level overrides</h3>
        <p class="ed-note">An override replaces every rule's grant at that level.</p>
        ${overrides}
        <div class="ed-io-btns">
          <label class="pg-field">Level <input type="number" id="pg-ovr-level" value="${curveShaped ? def.maxLevel : ""}"></label>
          <button class="btn btn-alt" data-pg="ovr-add">+ Override</button>
        </div>

        <h3 class="wd-h">Attributes and health</h3>
        <div class="ed-io-btns">${caps}</div>
        <div class="ed-io-btns">
          <label class="pg-field">Base HP <input type="number" data-path="@config.soldierBaseHp" value="${config.soldierBaseHp}"></label>
          <label class="pg-field">HP per Health <input type="number" data-path="@config.soldierHpPerHealth" value="${config.soldierHpPerHealth}"></label>
          <label class="pg-field">On level up ${select("levelUpHealthPolicy", POLICIES, def.levelUpHealthPolicy)}</label>
        </div>
        <p class="ed-note">Base HP and HP per Health are the Settings knobs and save immediately.</p>

        <h3 class="wd-h">Who earns XP</h3>
        <div class="ed-io-btns">
          ${check("@outcome.success", (def.eligibility.outcomes || []).includes("success"), "Successful missions")}
          ${check("@outcome.failure", (def.eligibility.outcomes || []).includes("failure"), "Failed missions")}
          ${check("eligibility.requireSurvival", def.eligibility.requireSurvival, "Must survive")}
          ${check("eligibility.requireExtraction", def.eligibility.requireExtraction, "Must extract")}
        </div>

        <h3 class="wd-h">Recruit primary / secondary</h3>
        <table class="cm-table pg-table"><thead><tr><th>Recruit</th><th>Primary</th><th>Secondary</th></tr></thead><tbody>${assign}</tbody></table>

        <h3 class="wd-h">Preview</h3>
        ${v.ok ? preview() : `<p class="ed-note bad">Fix the problems above to see the preview.</p>`}

        <div class="ed-io">
          <div class="ed-io-btns">
            <button class="btn btn-go" data-pg="save" ${v.ok ? "" : "disabled"}>Save</button>
            <button class="btn btn-alt" data-pg="revert">Revert to shipped</button>
            <button class="btn btn-alt" data-pg="export">Copy JSON</button>
            <button class="btn btn-alt" data-pg="import">Import JSON</button>
            <span class="ed-msg ${msg.kind}">${esc(msg.text)}</span>
          </div>
          <textarea class="ed-json" id="pg-json" spellcheck="false">${esc(json)}</textarea>
        </div>
      </div>`;
  }

  function preview() {
    // A probe soldier whose primary is Aim and secondary Speed, so the columns
    // read as "primary / secondary / each other" whatever the rules target.
    const probe = { primary: "aim", secondary: "speed" };
    const rows = [];
    for (let l = def.startLevel; l <= def.maxLevel; l++) {
      const grants = grantsAt(def, l)
        .map((g) => `+${g.amount} ${(TARGETS.find(([k]) => k === g.target) || [, g.target])[1]}`)
        .join(", ");
      const b = bonusesThrough(def, l, probe);
      rows.push(`<tr><td>${l}</td><td>${l > def.startLevel ? def.xpCost[l] : "—"}</td><td>${thresholdFor(def, l).toLocaleString()}</td>
        <td>${esc(grants || (l > def.startLevel ? "nothing" : "starting stats"))}</td>
        <td>${b.hp}</td><td>${b.attrs.aim}</td><td>${b.attrs.speed}</td><td>${b.attrs.health}</td></tr>`);
    }
    const r = RECRUIT_POOL.find((x) => x.id === example);
    let ex = "";
    if (r) {
      const s = { ...r, ...pairs[r.id] };
      const exRows = [];
      for (let l = def.startLevel; l <= def.maxLevel; l++) {
        const res = resolveSoldier(def, { ...s, xp: thresholdFor(def, l) });
        exRows.push(`<tr><td>${l}</td>${ATTRIBUTE_IDS.map((a) => `<td>${res.stats[a]}</td>`).join("")}<td>${soldierMaxHp({ stats: res.stats, hpBonus: res.hpBonus })}</td></tr>`);
      }
      ex = `<div class="ed-io-btns"><label class="pg-field">Example soldier <select id="pg-example">${RECRUIT_POOL.map(
        (x) => `<option value="${x.id}"${x.id === example ? " selected" : ""}>${esc(x.name)}</option>`
      ).join("")}</select></label>
        <span class="ed-msg">Primary ${LABEL[s.primary]} · Secondary ${LABEL[s.secondary]}</span></div>
        <table class="cm-table pg-table"><thead><tr><th>Level</th>${ATTRIBUTE_IDS.map((a) => `<th>${LABEL[a]}</th>`).join("")}<th>Max HP</th></tr></thead><tbody>${exRows.join("")}</tbody></table>`;
    }
    return `<table class="cm-table pg-table">
        <thead><tr><th>Level</th><th>XP from previous</th><th>Lifetime XP</th><th>Grants at this level</th><th>Total flat HP</th><th>Primary</th><th>Secondary</th><th>Each other</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>${ex}`;
  }

  // ---- verbs (driven by the DOM, and directly by test/tools.test.mjs) -------

  const api = {
    edit(path, value, kind) {
      if (path.startsWith("@outcome.")) {
        const o = path.slice(9);
        const set = new Set(def.eligibility.outcomes || []);
        if (value) set.add(o);
        else set.delete(o);
        def.eligibility.outcomes = ["success", "failure"].filter((x) => set.has(x));
      } else {
        setPath(path, value, kind);
      }
      draw();
    },
    addRule() {
      let n = def.growthRules.length + 1;
      while (def.growthRules.some((r) => r.id === `rule${n}`)) n++;
      def.growthRules.push({ id: `rule${n}`, target: "flatMaxHp", amount: 0, first: def.startLevel + 1, every: 1, last: null });
      draw();
    },
    removeRule(i) {
      def.growthRules.splice(i, 1);
      draw();
    },
    addOverride(level) {
      if (!(level in def.levelOverrides)) def.levelOverrides[level] = [];
      draw();
    },
    removeOverride(level) {
      delete def.levelOverrides[level];
      draw();
    },
    addOverrideGrant(level) {
      def.levelOverrides[level].push({ target: "flatMaxHp", amount: 0 });
      draw();
    },
    removeOverrideGrant(level, i) {
      def.levelOverrides[level].splice(i, 1);
      draw();
    },
    save() {
      const res = saveProgression(def, pairs, { baseHp: config.soldierBaseHp, hpPerHealth: config.soldierHpPerHealth });
      msg = res.ok ? { kind: "ok", text: "Saved. New campaigns use these rules — reload the game." } : { kind: "bad", text: "Not saved: fix the problems listed." };
      draw();
      return res;
    },
    revert() {
      revertProgression();
      def = defaultProgression();
      pairs = shippedAssignments();
      msg = { kind: "ok", text: "Reverted to the shipped rules." };
      draw();
    },
    exportJson() {
      json = JSON.stringify({ definition: def, assignments: pairs }, null, 2);
      msg = { kind: "ok", text: "JSON below — paste the definition into src/game/progression.js to make it permanent." };
      draw();
      return json;
    },
    // Atomic: a paste that fails validation changes nothing in the draft.
    importJson(text) {
      let obj;
      try {
        obj = JSON.parse(text);
      } catch {
        msg = { kind: "bad", text: "Not valid JSON." };
        draw();
        return { ok: false };
      }
      const nextDef = obj && obj.definition ? obj.definition : obj;
      const nextPairs = { ...pairs, ...((obj && obj.assignments) || {}) };
      const v = validateProgression(nextDef, { soldiers: RECRUIT_POOL.map((r) => ({ ...r, ...nextPairs[r.id] })) });
      if (!v.ok) {
        json = text;
        msg = { kind: "bad", text: `Not imported: ${v.errors.map((e) => `${e.path} ${e.message}`).join("; ")}` };
        draw();
        return { ok: false, errors: v.errors };
      }
      def = structuredClone(nextDef);
      pairs = structuredClone(nextPairs);
      msg = { kind: "ok", text: "Imported into the draft — Save to keep it." };
      draw();
      return { ok: true };
    },
    draft: () => ({ definition: def, assignments: pairs }),
    dispose() {
      container.removeEventListener("click", onClick);
      container.removeEventListener("change", onChange);
    },
  };

  function onClick(e) {
    const el = e.target.closest && e.target.closest("[data-pg]");
    if (!el || el.disabled) return;
    switch (el.dataset.pg) {
      case "back": onBack(); break;
      case "save": api.save(); break;
      case "revert": api.revert(); break;
      case "export": api.exportJson(); break;
      case "import": api.importJson(container.querySelector("#pg-json").value); break;
      case "rule-add": api.addRule(); break;
      case "rule-del": api.removeRule(Number(el.dataset.i)); break;
      case "ovr-add": {
        const l = Number(container.querySelector("#pg-ovr-level").value);
        if (Number.isSafeInteger(l)) api.addOverride(l);
        break;
      }
      case "ovr-del": api.removeOverride(el.dataset.level); break;
      case "ovr-grant": api.addOverrideGrant(el.dataset.level); break;
      case "ovr-grant-del": api.removeOverrideGrant(el.dataset.level, Number(el.dataset.i)); break;
    }
  }

  function onChange(e) {
    const el = e.target;
    if (el.id === "pg-example") {
      example = el.value;
      draw();
      return;
    }
    const path = el.dataset && el.dataset.path;
    if (!path) return;
    const kind = el.dataset.kind;
    api.edit(path, kind === "bool" ? el.checked : el.value, kind);
  }

  container.addEventListener("click", onClick);
  container.addEventListener("change", onChange);
  draw(); // one synchronous render at mount

  return api;
}
