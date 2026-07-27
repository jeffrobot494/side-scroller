// ---------------------------------------------------------------------------
// WEAPON DESIGNER — a GUI tool in the editor's Tools tab.
//
// Compose a weapon from primitives (fire params + a projectile + any of the
// nine effect kinds), watch it fire against a dummy in a live preview, and see
// its cost checked against a tech-tier budget in real time. Export produces
// content.js-shaped JSON (per-effect cost + budgetSpent filled in) that drops
// straight into WEAPONS or the armory — the same shape the Player2 generator
// will emit.
//
// Effect rows are rendered from `EFFECT_SCHEMA` (weaponcost.js), so the whole
// vocabulary is available and a tenth kind needs no UI work here.
//
// Weapons can be LOADED — from ARSENAL or from your saved customs — and saved
// back over what you loaded: a custom weapon upserts in place, a built-in
// stores an override (weaponoverrides.js) because arsenal.js is source a
// browser cannot write. See docs/WEAPON-DESIGNER.md.
//
// createWeaponDesigner(container, onBack) → { dispose(), load(origin, id) }
// ---------------------------------------------------------------------------

import {
  effectCost,
  deliveryMultiplier,
  dps,
  validate,
  finalizeWeapon,
  newEffect,
  isDeliveryKind,
  TIERS,
  EFFECT_SCHEMA,
  EFFECT_KINDS,
} from "../../game/weaponcost.js";
import { listCustomWeapons, saveCustomWeapon, deleteCustomWeapon } from "../../game/customcontent.js";
import { ARSENAL } from "../../game/arsenal.js";
import { isOverridden, listOverrides, saveOverride, deleteOverride } from "../../game/weaponoverrides.js";
import { drawProjectile, PROJECTILE_SHAPES } from "../../mission/render.js";
import { cuePickerRowHTML, auditionCue, fmtGain } from "../sound-picker.js";
import { weaponSound, weaponCue, WEAPON_SOUND_KINDS } from "../../audio/cues.js";

// The four assignable slots, in the order they happen when you use the weapon.
const SOUND_ROWS = [
  { kind: "fire", label: "Shot", help: "Once per trigger pull — a shotgun shell is one boom, not six." },
  { kind: "impact", label: "Impact", help: "When one of its projectiles connects with an actor." },
  { kind: "reload", label: "Reload", help: "The magazine dropping when a reload starts." },
  { kind: "empty", label: "Dry click", help: "Trigger pulled on an empty magazine." },
];

// Numeric fields rendered as sliders (path into the weapon object). The first
// FIRE_COUNT live in the "Fire" section; the rest in "Projectile".
const FIELDS = [
  { path: "fireRate", label: "Fire rate", min: 0.5, max: 15, step: 0.5, unit: "/s" },
  { path: "spread", label: "Spread", min: 0, max: 0.15, step: 0.005, unit: "rad" },
  { path: "magazine", label: "Magazine (0 = unlimited)", min: 0, max: 60, step: 1, unit: "rnds" },
  { path: "reloadTime", label: "Reload time", min: 0.5, max: 4, step: 0.1, unit: "s" },
  { path: "projectile.speed", label: "Projectile speed", min: 200, max: 1600, step: 20, unit: "px/s" },
  { path: "projectile.w", label: "Projectile width", min: 4, max: 28, step: 1, unit: "px" },
  { path: "projectile.h", label: "Projectile height", min: 2, max: 20, step: 1, unit: "px" },
  { path: "projectile.life", label: "Projectile life", min: 0.3, max: 2.5, step: 0.1, unit: "s" },
  { path: "projectile.gravity", label: "Gravity / arc", min: 0, max: 1, step: 0.05, unit: "" },
];
const FIRE_COUNT = 4; // FIELDS[0..3] render under "Fire", the rest under "Projectile"

// The starting weapon, as a factory rather than a literal: `adoptWeapon` needs
// it to fill the keys a loaded weapon omits.
export function blankWeapon() {
  return {
    id: "custom_weapon",
    name: "Custom Weapon",
    fireMode: "projectile",
    fireRate: 6,
    auto: true,
    spread: 0.02,
    magazine: 12,
    reloadTime: 1.5,
    projectile: { speed: 850, w: 12, h: 5, color: "#ffd36a", life: 1, gravity: 0, shape: "bullet" },
    effects: [{ kind: "damage", amount: 10 }],
  };
}

/**
 * Copy `source` into the working weapon IN PLACE — every handler closes over
 * that object, so it can't be reassigned.
 *
 * Object.assign alone is not enough in three ways, each of which shows up the
 * moment you load a real arsenal entry:
 *   - it never REMOVES keys, so `sounds` from concussion_gun would stick to the
 *     next weapon loaded, as would `tier`;
 *   - it replaces `projectile` wholesale, and 14 of the 24 arsenal weapons omit
 *     `projectile.gravity` — the slider would read `undefined` → NaN;
 *   - arsenal entries are finalized (per-effect `cost`, `budgetSpent`), which
 *     are derived values the working copy must not carry around stale.
 * So: clear, fill from blank, then overlay the source.
 */
/**
 * The id a working copy should carry. A NEW weapon's id tracks its name, as it
 * always has; a LOADED one keeps the id it was loaded under.
 *
 * Pinning is the whole reason save-in-place works. Two arsenal names don't slug
 * back to their own ids — "Field Carbine" → `field_carbine` (not `carbine`) and
 * "Sidearm Mk.II" → `sidearm_mk_ii` (not `sidearm`) — and any custom weapon
 * minted `<base>_2` by uniqueId() re-slugs to `<base>`. Unpinned, each of those
 * saves a duplicate instead of overwriting what you loaded.
 */
export function resolveId(name, loadedId) {
  return loadedId == null ? slug(name) : loadedId;
}

export function adoptWeapon(target, source) {
  const blank = blankWeapon();
  const src = structuredClone(source || {});
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, blank, src);
  target.projectile = { ...blank.projectile, ...(src.projectile || {}) };
  target.effects = (src.effects || blank.effects).map((fx) => {
    const { cost, ...rest } = fx; // eslint-disable-line no-unused-vars
    return rest;
  });
  delete target.budgetSpent;
  return target;
}

export function createWeaponDesigner(container, onBack) {
  const weapon = blankWeapon();
  let tierId = TIERS[1].id;

  // Which saved weapon this working copy came from. null = a new weapon, whose
  // id tracks its name (see refresh). Non-null = the id is PINNED, so renaming
  // "Field Carbine" no longer silently re-slugs `carbine` to `field_carbine`
  // and saves a duplicate instead of overwriting.
  let loadedId = null;
  let loadedOrigin = null; // "builtin" | "custom"

  const $ = (sel) => container.querySelector(sel);
  let canvas = null;
  let ctx = null;

  // ---- shell (rebuilt on load; the three listeners are delegated on
  // `container` itself, which is never replaced) ----------------------------
  function renderShell() {
    container.innerHTML = `
      <div class="wd">
        <div class="wd-head">
          <button class="btn btn-ghost" data-wd="back">← Tools</button>
          <input class="wd-name" data-wd="name" value="${escapeHtml(weapon.name)}" spellcheck="false" />
          <span class="wd-id" id="wd-id"></span>
          <span class="wd-badge" id="wd-badge"></span>
          <label class="wd-load">Load
            <select data-wd="load">${loadOptionsHTML()}</select>
          </label>
        </div>
        <div class="wd-grid">
          <div class="wd-form">
            <h3 class="wd-h">Fire</h3>
            <div class="cfg-row wd-row">
              <div class="cfg-meta"><span class="cfg-label">Automatic</span><span class="cfg-help">Hold to fire vs. one shot per press.</span></div>
              <div class="cfg-control"><button type="button" role="switch" class="toggle${weapon.auto ? " on" : ""}" data-wd="auto"><span class="knob"></span></button></div>
            </div>
            ${FIELDS.slice(0, FIRE_COUNT).map((f) => fieldRow(f, get(weapon, f.path))).join("")}

            <h3 class="wd-h">Projectile</h3>
            <div class="cfg-row wd-row">
              <div class="cfg-meta"><span class="cfg-label">Colour</span></div>
              <div class="cfg-control"><input type="color" data-wd="color" value="${weapon.projectile.color}" /></div>
            </div>
            <div class="cfg-row wd-row">
              <div class="cfg-meta"><span class="cfg-label">Shape</span></div>
              <div class="cfg-control"><select data-wd="shape">${PROJECTILE_SHAPES.map((s) => `<option value="${s}"${s === weapon.projectile.shape ? " selected" : ""}>${s}</option>`).join("")}</select></div>
            </div>
            ${FIELDS.slice(FIRE_COUNT).map((f) => fieldRow(f, get(weapon, f.path))).join("")}

            <h3 class="wd-h">Sound</h3>
            <p class="wd-saved-note">
              Left on <strong>Auto</strong>, a weapon takes its timbre from the projectile shape above —
              change the shape and the sound follows. Assign a cue to override that. The <strong>×</strong>
              slider sets this weapon's level for that cue, so two weapons sharing a timbre can sit at
              different volumes. Sounds cost no budget.
            </p>
            <div id="wd-sounds"></div>

            <h3 class="wd-h">Effects</h3>
            <div class="wd-effects" id="wd-effects"></div>
            <div class="wd-addfx">
              <select data-wd="add-fx" id="wd-addfx">${addOptionsHTML()}</select>
              <span class="wd-addfx-note">Value effects add per-shot cost; delivery effects multiply it.</span>
            </div>
          </div>

          <div class="wd-side">
            <canvas class="wd-canvas" id="wd-canvas" width="380" height="170"></canvas>
            <div class="wd-readout">
              <div class="wd-stat"><span>DPS</span><b id="wd-dps">0</b></div>
              <div class="wd-stat"><span>Budget</span><b id="wd-spent">0</b></div>
            </div>
            <div class="wd-budget">
              <label class="wd-tier">Tier
                <select data-wd="tier">${TIERS.map((t) => `<option value="${t.id}"${t.id === tierId ? " selected" : ""}>${t.name} (${t.budget})</option>`).join("")}</select>
              </label>
              <div class="wd-meter"><span class="wd-meter-fill" id="wd-meter"></span></div>
              <div class="wd-verdict" id="wd-verdict"></div>
            </div>
            <div class="wd-export">
              <div class="wd-export-btns">
                <button class="btn" data-wd="save">${saveLabel()}</button>
                ${loadedId ? `<button class="btn btn-alt" data-wd="save-new">Save as new</button>` : ""}
                ${loadedOrigin === "builtin" && isOverridden(loadedId) ? `<button class="btn btn-alt" data-wd="revert">Revert</button>` : ""}
                <button class="btn btn-alt" data-wd="copy">Copy JSON</button>
              </div>
              <span class="ed-msg" id="wd-msg"></span>
              <textarea class="ed-json wd-json" id="wd-json" spellcheck="false" readonly></textarea>
            </div>
            <div class="wd-saved">
              <h3 class="wd-h">Saved weapons</h3>
              <p class="wd-saved-note">Saved to this browser and loaded into the armory next time you start the game — reload to deploy them.</p>
              <div class="wd-saved-list" id="wd-saved"></div>
            </div>
          </div>
        </div>
      </div>`;
    syncCanvas();
  }

  // The canvas node is replaced by every shell render. Re-query it (and its
  // context) or the preview keeps drawing into a detached node — no error, just
  // a dead panel.
  function syncCanvas() {
    canvas = $("#wd-canvas");
    ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  }

  function saveLabel() {
    if (loadedOrigin === "builtin") return `Save override`;
    if (loadedId) return `Save (overwrites ${loadedId})`;
    return "Save to armory";
  }

  // ---- load menu ----------------------------------------------------------
  function loadOptionsHTML() {
    const over = listOverrides();
    const opt = (w, origin) => {
      const mark = origin === "builtin" && over[w.id] ? "● " : "";
      const sel = loadedId === w.id && loadedOrigin === origin ? " selected" : "";
      return `<option value="${origin}:${escapeHtml(w.id)}"${sel}>${mark}${escapeHtml(w.name || w.id)}</option>`;
    };
    const customs = listCustomWeapons();
    return (
      `<option value="">—</option>` +
      `<optgroup label="Arsenal">${ARSENAL.map((w) => opt(w, "builtin")).join("")}</optgroup>` +
      (customs.length ? `<optgroup label="Custom">${customs.map((w) => opt(w, "custom")).join("")}</optgroup>` : "")
    );
  }

  function loadWeapon(origin, id) {
    const src = origin === "builtin" ? ARSENAL.find((w) => w.id === id) : listCustomWeapons().find((w) => w.id === id);
    if (!src) return false;
    adoptWeapon(weapon, src);
    loadedId = id;
    loadedOrigin = origin;
    resetPreview();
    redrawAll();
    return true;
  }

  // renderShell() wipes every panel, so a load is FOUR calls, not three —
  // dropping renderSaved() leaves the saved list blank until the next save.
  function redrawAll() {
    renderShell();
    renderEffects();
    renderSounds();
    renderSaved();
    refresh();
  }

  // ---- effects list (rebuilt when effects are added/removed) --------------
  function renderEffects() {
    $("#wd-effects").innerHTML = weapon.effects.length
      ? weapon.effects.map((fx, i) => effectRow(fx, i)).join("")
      : `<p class="wd-empty">No effects — this weapon does nothing yet.</p>`;
  }

  function effectRow(fx, i) {
    const spec = EFFECT_SCHEMA[fx.kind];
    if (!spec) return "";
    const params = spec.params.map((p) => sliderMini(p, fx[p.key], i)).join("");
    return `
      <div class="wd-effect${spec.value ? "" : " wd-effect-delivery"}" data-idx="${i}">
        <div class="wd-effect-top">
          <select data-wd="fx-kind" data-idx="${i}">${kindOptionsHTML(fx.kind, i)}</select>
          <span class="wd-fx-cost" data-fx-cost="${i}">${chipText(fx)}</span>
          <button class="wd-fx-x" data-wd="fx-remove" data-idx="${i}" title="Remove">×</button>
        </div>
        <div class="wd-effect-params">${params}</div>
      </div>`;
  }

  // A delivery kind returns 0 from effectCost by design — it is priced as a
  // MULTIPLIER in weaponCost. Showing "cost 0" next to a budget that just
  // tripled reads as broken, so delivery rows show the multiplier instead.
  function chipText(fx) {
    return EFFECT_SCHEMA[fx.kind] && !EFFECT_SCHEMA[fx.kind].value
      ? `×${trim(deliveryMultiplier([fx]))}`
      : `cost ${Math.round(effectCost(fx))}`;
  }

  // Delivery kinds are AT MOST ONE each: deliveryMultiplier() multiplies every
  // matching entry, but the runtime reads only the first (`.find()` in ai.js
  // for pellets, combat.js for pierce/homing). A second one would triple the
  // priced budget and change nothing in game, so it isn't offered.
  function kindTaken(kind, exceptIdx) {
    return isDeliveryKind(kind) && weapon.effects.some((fx, i) => fx.kind === kind && i !== exceptIdx);
  }

  function kindGroups(pick, selected) {
    const group = (title, wantValue) => {
      const opts = EFFECT_KINDS.filter((k) => EFFECT_SCHEMA[k].value === wantValue).filter(pick).map(
        (k) => `<option value="${k}"${k === selected ? " selected" : ""}>${EFFECT_SCHEMA[k].label}</option>`
      );
      return opts.length ? `<optgroup label="${title}">${opts.join("")}</optgroup>` : "";
    };
    return group("Value", true) + group("Delivery", false);
  }

  // A row's own kind stays selectable even when it's a one-per-weapon delivery
  // kind — it's the one already using the slot.
  function kindOptionsHTML(selected, idx) {
    return kindGroups((k) => k === selected || !kindTaken(k, idx), selected);
  }

  function addOptionsHTML() {
    return `<option value="">+ Effect</option>` + kindGroups((k) => !kindTaken(k), null);
  }

  // ---- saved lists (customs, plus any overridden built-ins) ---------------
  function renderSaved() {
    const saved = listCustomWeapons();
    const over = listOverrides();
    const overIds = Object.keys(over);
    const customHTML = saved.length
      ? saved
          .map(
            (w) => `
        <div class="wd-saved-row" data-id="${escapeHtml(w.id)}">
          <span class="wd-saved-name">${escapeHtml(w.name || w.id)}</span>
          <span class="wd-saved-budget">budget ${w.budgetSpent ?? "—"}</span>
          <button class="wd-fx-x" data-wd="del-saved" data-id="${escapeHtml(w.id)}" title="Delete">×</button>
        </div>`
          )
          .join("")
      : `<p class="wd-empty">No saved weapons yet.</p>`;

    const overHTML = overIds.length
      ? `<h3 class="wd-h">Overridden built-ins</h3>
         <p class="wd-saved-note">These patch an <code>arsenal.js</code> weapon in this browser. Revert restores the original; Copy JSON → paste into <code>arsenal.js</code> makes it permanent.</p>` +
        overIds
          .map(
            (id) => `
        <div class="wd-saved-row" data-id="${escapeHtml(id)}">
          <span class="wd-saved-name">${escapeHtml(over[id].name || id)}</span>
          <span class="wd-badge on">overrides built-in</span>
          <button class="btn btn-ghost wd-revert" data-wd="revert-saved" data-id="${escapeHtml(id)}">Revert</button>
        </div>`
          )
          .join("")
      : "";

    $("#wd-saved").innerHTML = customHTML + overHTML;
  }

  // ---- sound assignment ---------------------------------------------------
  // Rebuilt whenever the shape changes, because an "Auto" row's resolved cue is
  // derived from the shape and would otherwise show a stale hint.
  function renderSounds() {
    $("#wd-sounds").innerHTML = SOUND_ROWS.map((r) =>
      cuePickerRowHTML({
        ...r,
        value: slotCue(r.kind),
        gain: weaponSound(weapon, r.kind).gain,
        resolved: weaponCue({ ...weapon, sounds: null }, r.kind),
      })
    ).join("");
  }

  // The explicitly ASSIGNED cue (not the derived one) — "" means Auto, which is
  // what the row's select shows.
  function slotCue(kind) {
    const slot = weapon.sounds && weapon.sounds[kind];
    if (typeof slot === "string") return slot;
    return (slot && slot.cue) || "";
  }

  // Assignments are stored sparsely, so an untouched weapon exports no `sounds`
  // block at all and a cue-only choice stays a plain string:
  //   Auto + gain 1  -> key deleted        gain 1 + cue -> "cue"
  //   gain != 1      -> { cue?, gain }
  function writeSlot(kind, cue, gain) {
    if (!WEAPON_SOUND_KINDS.includes(kind)) return;
    const sounds = weapon.sounds || (weapon.sounds = {});
    if (gain === 1) {
      if (cue) sounds[kind] = cue;
      else delete sounds[kind];
    } else {
      sounds[kind] = cue ? { cue, gain } : { gain };
    }
    if (!Object.keys(sounds).length) delete weapon.sounds;
  }

  function setSoundCue(kind, cue) {
    writeSlot(kind, cue, weaponSound(weapon, kind).gain);
  }

  function setSoundGain(kind, gain) {
    writeSlot(kind, slotCue(kind), gain);
  }

  // ---- refresh derived readouts (no input rebuild, keeps slider focus) ----
  function refresh() {
    weapon.id = resolveId(weapon.name, loadedId);
    $("#wd-id").textContent = weapon.id;
    const badge = $("#wd-badge");
    if (loadedOrigin === "builtin") {
      badge.textContent = isOverridden(loadedId) ? "built-in · overridden" : "built-in";
      badge.className = "wd-badge on";
    } else if (loadedOrigin === "custom") {
      badge.textContent = "saved weapon";
      badge.className = "wd-badge";
    } else {
      badge.textContent = "";
      badge.className = "wd-badge";
    }
    const tier = TIERS.find((t) => t.id === tierId);
    const v = validate(weapon, tier.budget);
    $("#wd-dps").textContent = Math.round(dps(weapon));
    $("#wd-spent").textContent = `${v.spent} / ${tier.budget}`;
    const pct = Math.min(100, (v.spent / tier.budget) * 100);
    const meter = $("#wd-meter");
    meter.style.width = pct + "%";
    meter.style.background = v.legal ? "linear-gradient(90deg,#57c98a,#7ad7ff)" : "linear-gradient(90deg,#e0a24e,#e05a5a)";
    const verdict = $("#wd-verdict");
    verdict.textContent = v.legal ? `✓ Legal at ${tier.name}` : `✕ Over budget by ${v.over}`;
    verdict.className = "wd-verdict " + (v.legal ? "ok" : "bad");
    for (const el of container.querySelectorAll("[data-fx-cost]")) {
      const fx = weapon.effects[+el.dataset.fxCost];
      if (fx) el.textContent = chipText(fx);
    }
    $("#wd-json").value = JSON.stringify(finalizeWeapon(weapon), null, 2);
  }

  function setMsg(text, ok) {
    const msg = $("#wd-msg");
    if (!msg) return;
    msg.textContent = text;
    msg.className = "ed-msg " + (ok ? "ok" : "bad");
  }

  // ---- events -------------------------------------------------------------
  container.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.wd === "name") { weapon.name = t.value; refresh(); return; }
    if (t.dataset.wd === "color") { weapon.projectile.color = t.value; refresh(); return; }
    if (t.dataset.field) {
      set(weapon, t.dataset.field, Number(t.value));
      const out = container.querySelector(`[data-val-for="${t.dataset.field}"]`);
      const f = FIELDS.find((x) => x.path === t.dataset.field);
      if (out) out.textContent = fmt(Number(t.value)) + (f && f.unit ? " " + f.unit : "");
      refresh();
      return;
    }
    if (t.dataset.cueGain !== undefined) {
      const kind = t.dataset.cueGain;
      const g = Number(t.value);
      setSoundGain(kind, g);
      const out = container.querySelector(`[data-cue-gain-out="${kind}"]`);
      if (out) out.textContent = fmtGain(g);
      refresh(); // the exported JSON readout tracks the drag
      return;
    }
    if (t.dataset.fxField) {
      const i = +t.dataset.idx;
      const key = t.dataset.fxField;
      weapon.effects[i][key] = Number(t.value);
      const out = container.querySelector(`[data-val-for="fx-${i}-${key}"]`);
      const p = paramSpec(weapon.effects[i].kind, key);
      if (out) out.textContent = fmt(Number(t.value)) + (p && p.unit ? " " + p.unit : "");
      refresh();
    }
  });

  container.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.wd === "tier") { tierId = t.value; refresh(); }
    else if (t.dataset.wd === "shape") { weapon.projectile.shape = t.value; renderSounds(); refresh(); }
    else if (t.dataset.wd === "load") {
      if (!t.value) return;
      const [origin, ...rest] = t.value.split(":");
      loadWeapon(origin, rest.join(":"));
    } else if (t.dataset.wd === "add-fx") {
      const fx = newEffect(t.value);
      t.value = "";
      if (!fx) return;
      weapon.effects.push(fx);
      renderEffects();
      refreshAddMenu();
      refresh();
    } else if (t.dataset.cue !== undefined) { setSoundCue(t.dataset.cue, t.value); renderSounds(); refresh(); }
    else if (t.dataset.wd === "fx-kind") {
      const i = +t.dataset.idx;
      const fx = newEffect(t.value);
      if (!fx) return;
      weapon.effects[i] = fx;
      renderEffects();
      refreshAddMenu();
      refresh();
    }
  });

  // The add menu hides delivery kinds already in use, so it has to follow the
  // effects list. Cheap enough to just rebuild its options.
  function refreshAddMenu() {
    const sel = $("#wd-addfx");
    if (sel) sel.innerHTML = addOptionsHTML();
  }

  container.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-cue-play]");
    if (pick) {
      // Audition what this slot ACTUALLY plays — the assignment if there is one,
      // otherwise the shape-derived cue the game would pick.
      const kind = pick.dataset.cuePlay;
      const slot = weaponSound(weapon, kind);
      auditionCue(slot.cue, slot.gain);
      return;
    }
    const el = e.target.closest("[data-wd]");
    if (!el) return;
    switch (el.dataset.wd) {
      case "back": onBack(); break;
      case "auto": {
        weapon.auto = el.classList.toggle("on");
        refresh();
        break;
      }
      case "fx-remove": weapon.effects.splice(+el.dataset.idx, 1); renderEffects(); refreshAddMenu(); refresh(); break;
      case "copy": copyJSON(); break;
      case "save": saveWeapon(); break;
      case "save-new": saveAsNew(); break;
      case "revert": revertOverride(loadedId); break;
      case "revert-saved": revertOverride(el.dataset.id); break;
      case "del-saved": deleteCustomWeapon(el.dataset.id); renderSaved(); break;
    }
  });

  // Save regardless of budget legality (dev tool); the tier verdict stays
  // visible so you can still see whether it's legal.
  //
  // Where it goes depends on what was loaded: a built-in gets an OVERRIDE
  // (arsenal.js is source a browser cannot write), anything else upserts into
  // the custom store. A brand-new weapon pins the id it was minted under, so a
  // second Save overwrites rather than minting `_2`.
  function saveWeapon() {
    if (loadedOrigin === "builtin" && loadedId) {
      const res = saveOverride(finalizeWeapon(weapon));
      redrawAll();
      setMsg(
        res.ok
          ? `Override saved over built-in "${res.id}" — reload the game to deploy it.`
          : "Save failed — not a built-in weapon.",
        res.ok
      );
      return;
    }
    const res = saveCustomWeapon(finalizeWeapon(weapon));
    if (res.ok) { loadedId = res.id; loadedOrigin = "custom"; }
    redrawAll();
    setMsg(res.ok ? `Saved as "${res.id}" — reload the game to deploy it.` : "Save failed.", res.ok);
  }

  // Fork whatever is loaded into a new custom weapon named by the name field.
  function saveAsNew() {
    loadedId = null;
    loadedOrigin = null;
    weapon.id = slug(weapon.name);
    saveWeapon();
  }

  function revertOverride(id) {
    const res = deleteOverride(id);
    // Pull the now-pristine built-in back into the working copy if it's the one
    // on screen, so the panel isn't left showing the reverted edit.
    if (res.ok && loadedOrigin === "builtin" && loadedId === id) {
      const src = ARSENAL.find((w) => w.id === id);
      if (src) adoptWeapon(weapon, src);
      resetPreview();
    }
    redrawAll();
    setMsg(res.ok ? `Reverted "${id}" to the built-in.` : "Nothing to revert.", res.ok);
  }

  function copyJSON() {
    const text = $("#wd-json").value;
    const done = (ok) => setMsg(ok ? "Copied to clipboard." : "Copy failed — select the text below.", ok);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
      else done(false);
    } catch { done(false); }
  }

  // ---- live preview -------------------------------------------------------
  const pv = { proj: [], sparks: [], nums: [], flame: 0, spawn: 0 };
  let shooterX = 46, dummyX = 320;

  // A load swaps the weapon out from under the preview; without this the old
  // weapon's rounds finish their flight and its burn keeps the dummy alight.
  function resetPreview() {
    pv.proj.length = 0;
    pv.sparks.length = 0;
    pv.nums.length = 0;
    pv.flame = 0;
    pv.spawn = 0;
  }

  function step(dt) {
    if (!canvas) return;
    const cy = canvas.height / 2;
    dummyX = canvas.width - 60;
    // spawn on the weapon's cadence
    pv.spawn -= dt;
    if (pv.spawn <= 0) {
      pv.spawn = 1 / Math.max(0.5, weapon.fireRate);
      const p = weapon.projectile;
      // A `pellets` delivery effect fires `count` projectiles across an arc —
      // the same fan ai.js produces. Without it this spawns one, as before.
      const pellets = weapon.effects.find((f) => f.kind === "pellets");
      const count = pellets ? Math.max(1, pellets.count || 1) : 1;
      const arc = pellets ? (pellets.spread ?? 0.12) : 0;
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2; // -1..1
        const a = t * arc;
        pv.proj.push({
          x: shooterX + 18, y: cy,
          vx: p.speed * Math.cos(a), vy: p.speed * Math.sin(a),
          w: p.w, h: p.h, color: p.color, shape: p.shape,
        });
      }
      if (pv.proj.length > 160) pv.proj.splice(0, pv.proj.length - 160);
    }
    for (const p of pv.proj) { p.x += p.vx * dt; p.y += p.vy * dt; }
    // hits (a fanned pellet can miss high or low and fly on past)
    for (const p of pv.proj) {
      if (!p.hit && p.x + p.w >= dummyX && Math.abs(p.y - cy) <= 26) {
        p.hit = true;
        burst(dummyX, p.y, p.color, 8);
        const dmg = weapon.effects.filter((f) => f.kind === "damage").reduce((s, f) => s + f.amount, 0);
        if (dmg) pv.nums.push({ x: dummyX, y: p.y - 10, vy: -34, life: 0.8, txt: "-" + dmg, color: "#fff" });
        const burn = weapon.effects.find((f) => f.kind === "burn");
        if (burn) { pv.flame = burn.duration; pv.nums.push({ x: dummyX + 14, y: p.y, vy: -26, life: 0.9, txt: "🔥" + burn.dps, color: "#ff9b4a" }); }
      }
    }
    pv.proj = pv.proj.filter((p) => !p.hit && p.x < canvas.width + 20);
    for (const s of pv.sparks) { s.vy += 400 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    pv.sparks = pv.sparks.filter((s) => s.life > 0);
    for (const n of pv.nums) { n.y += n.vy * dt; n.life -= dt; }
    pv.nums = pv.nums.filter((n) => n.life > 0);
    if (pv.flame > 0) pv.flame -= dt;
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 120;
      pv.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + Math.random() * 0.2, max: 0.45, color });
    }
  }

  function draw() {
    if (!canvas || !ctx) return;
    const W = canvas.width, H = canvas.height, cy = H / 2;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c1424"); g.addColorStop(1, "#16232a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(120,160,210,0.12)"; ctx.fillRect(0, cy + 34, W, 2); // floor line

    // shooter
    ctx.fillStyle = "#7ad7ff"; roundRect(ctx, shooterX - 10, cy - 22, 22, 44, 4); ctx.fill();
    ctx.fillStyle = "#0b0f18"; ctx.fillRect(shooterX + 8, cy - 3, 16, 5); // barrel

    // dummy target (+ flame if burning)
    ctx.fillStyle = "#3a4657"; roundRect(ctx, dummyX, cy - 26, 26, 52, 5); ctx.fill();
    ctx.fillStyle = "#26303d"; ctx.fillRect(dummyX + 6, cy - 14, 14, 4);
    if (pv.flame > 0) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) {
        const fx = dummyX + 4 + i * 8 + Math.sin(perfNow() / 60 + i) * 2, fh = 8 + Math.random() * 10;
        ctx.fillStyle = `rgba(255,${(120 + Math.random() * 80) | 0},40,0.6)`;
        ctx.beginPath(); ctx.moveTo(fx - 3, cy - 22); ctx.lineTo(fx, cy - 22 - fh); ctx.lineTo(fx + 3, cy - 22); ctx.fill();
      }
      ctx.restore();
    }

    // projectiles (shared renderer; pv.proj tracks y as center → shift to top-left)
    for (const p of pv.proj) drawProjectile(ctx, { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h, color: p.color, vx: p.vx, vy: p.vy, shape: p.shape });

    // sparks
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const s of pv.sparks) { ctx.fillStyle = alpha(s.color, Math.max(0, s.life / s.max)); ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3); }
    ctx.restore();

    // floating damage numbers
    ctx.textAlign = "center"; ctx.font = "bold 13px system-ui, sans-serif";
    for (const n of pv.nums) { ctx.globalAlpha = Math.max(0, n.life / 0.9); ctx.fillStyle = n.color; ctx.fillText(n.txt, n.x, n.y); }
    ctx.globalAlpha = 1; ctx.textAlign = "left";

    ctx.fillStyle = "rgba(190,200,215,0.55)"; ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("live preview", 8, 14);
  }

  // ---- loop ---------------------------------------------------------------
  let running = true, raf = null, last = perfNow();
  function loop() {
    if (!running) return;
    const now = perfNow();
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    step(dt); draw();
    raf = req(loop);
  }

  redrawAll();
  draw(); // one synchronous frame (also makes headless mount verifiable)
  raf = req(loop);

  return {
    dispose() {
      running = false;
      if (raf != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    },
    // Test/automation seam: drive a load without synthesizing a change event.
    load: loadWeapon,
    // Read-only peek at what the panel is editing, for the same reason.
    current: () => ({ weapon, loadedId, loadedOrigin }),
  };
}

// ---- small helpers --------------------------------------------------------

function paramSpec(kind, key) {
  const spec = EFFECT_SCHEMA[kind];
  return spec ? spec.params.find((p) => p.key === key) : null;
}

function fieldRow(f, value) {
  return `
    <div class="cfg-row wd-row">
      <div class="cfg-meta"><span class="cfg-label">${f.label}</span></div>
      <div class="cfg-control">
        <input type="range" data-field="${f.path}" min="${f.min}" max="${f.max}" step="${f.step}" value="${value}" />
        <output class="cfg-val" data-val-for="${f.path}">${fmt(value)}${f.unit ? " " + f.unit : ""}</output>
      </div>
    </div>`;
}

// Labels come from the schema, so the seven kinds the designer gained don't
// render raw param keys ("factor", "turn") and `count` can say whether it means
// pellets or pierced targets.
function sliderMini(p, value, idx) {
  const v = value ?? p.min;
  return `
    <label class="wd-mini">${p.label}
      <span class="wd-mini-ctl">
        <input type="range" data-fx-field="${p.key}" data-idx="${idx}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}" />
        <output class="cfg-val" data-val-for="fx-${idx}-${p.key}">${fmt(v)}${p.unit ? " " + p.unit : ""}</output>
      </span>
    </label>`;
}

function get(o, p) { return p.split(".").reduce((a, k) => (a == null ? a : a[k]), o); }
function set(o, p, v) { const ks = p.split("."); const last = ks.pop(); let t = o; for (const k of ks) t = t[k]; t[last] = v; }
function slug(s) { return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "custom_weapon"; }
function fmt(n) { return Number.isInteger(n) ? String(n) : Number(n).toFixed(2); }
function trim(n) { return String(+Number(n).toFixed(2)); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function perfNow() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
function req(fn) { return typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : null; }
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function alpha(color, a) {
  if (typeof color === "string" && color.startsWith("#")) {
    let c = color.replace("#", ""); if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`;
  }
  return color;
}
