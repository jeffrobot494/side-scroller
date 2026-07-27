// ---------------------------------------------------------------------------
// SOUND PAGE — the editor's third tab: the mixer + the cue bank.
//
// Two halves, matching the split in docs/SOUND.md:
//   · the MIXER is just the config SCHEMA's "Sound" group, rendered through the
//     same schema→controls renderer the Settings tab uses (no bespoke wiring);
//   · the BANK is a cue table — one row per entry in cues.js — where each cue
//     can be auditioned (▶) and its synth parameters dialled in.
//
// Per-entity assignment (which cue a given weapon or enemy fires) deliberately
// does NOT live here; it belongs in the Weapon/Enemy Designers next to the thing
// it describes. This page owns the library those pickers will choose from.
//
// createSoundPage(container) → { dispose() }
// ---------------------------------------------------------------------------

import { SCHEMA, config, setConfig, isDefault } from "../game/config.js";
import { controlsHTML, bindControls } from "./controls.js";
import { CUES } from "../audio/cues.js";
import { WAVES, SYNTH_RANGES } from "../audio/synth.js";
import {
  getEntry, setEntry, setSynthParam, resetCue, resetBank,
  isCueDefault, exportBank, importBank,
} from "../audio/bank.js";
import { audio } from "../audio/engine.js";

// Synth params rendered as sliders, in the order they matter when tuning.
const SYNTH_SLIDERS = [
  { key: "freq", label: "Pitch", unit: "Hz", step: 5 },
  { key: "freqEnd", label: "Sweep to", unit: "Hz", step: 5, nullable: true },
  { key: "dur", label: "Length", unit: "s", step: 0.005 },
  { key: "attack", label: "Attack", unit: "s", step: 0.001 },
  { key: "decay", label: "Decay", unit: "", step: 0.05 },
  { key: "gain", label: "Level", unit: "", step: 0.02 },
  { key: "noiseMix", label: "Noise", unit: "", step: 0.05 },
  { key: "filterHz", label: "Lowpass", unit: "Hz", step: 50, nullable: true },
  { key: "drive", label: "Drive", unit: "", step: 0.05 },
];

// Entry-level playback controls (not part of the waveform itself).
const ENTRY_SLIDERS = [
  { key: "gain", label: "Trim", min: 0, max: 2, step: 0.05 },
  { key: "pitchJitter", label: "Pitch jitter", min: 0, max: 0.5, step: 0.01 },
  { key: "cooldown", label: "Retrigger gap", min: 0, max: 0.5, step: 0.005 },
  { key: "maxVoices", label: "Max voices", min: 1, max: 16, step: 1 },
];

export function createSoundPage(container) {
  // Which cue rows are expanded. Collapsed by default — 22 cues of sliders at
  // once is unreadable, and most sessions only tune one or two.
  const open = new Set();

  function soundSchema() {
    return SCHEMA.filter((g) => g.title === "Sound");
  }

  function render() {
    container.innerHTML = `
      <p class="ed-note">
        The <strong>mixer</strong> is live — drag a volume and the next shot uses it. The
        <strong>bank</strong> below is the sound library: every cue is a procedural beep defined by
        the parameters here, so it can be tuned without touching code. Hit <strong>▶</strong> to hear one.
        Real recorded clips slot into these same cues later without any game code changing.
        Per-weapon and per-enemy sounds are assigned in their own designers, not here.
      </p>
      <div id="snd-mix" class="cfg">${controlsHTML(soundSchema(), config, isDefault)}</div>
      <div class="snd-bank">
        <h2 class="snd-h">Sound bank</h2>
        ${CUES.map(groupHTML).join("")}
      </div>
      <section class="ed-io">
        <div class="ed-io-btns">
          <button class="btn" data-snd="reset-all">Reset all sounds</button>
          <button class="btn" data-snd="export">Export bank ▾</button>
          <button class="btn" data-snd="import">▴ Import bank</button>
          <span id="snd-msg" class="ed-msg"></span>
        </div>
        <textarea id="snd-io" class="ed-json" spellcheck="false"
          placeholder="Export writes the bank here. Paste bank JSON and hit Import to apply, or paste it into src/audio/bank.js DEFAULT_BANK to make it permanent."></textarea>
      </section>`;

    bindControls(document.getElementById("snd-mix"), (key, val) => setConfig(key, val));
  }

  function groupHTML(group) {
    return `
      <section class="cfg-group">
        <h2>${group.title}</h2>
        <div class="snd-cues">${group.items.map(cueHTML).join("")}</div>
      </section>`;
  }

  function cueHTML(cue) {
    const entry = getEntry(cue.id);
    const changed = !isCueDefault(cue.id);
    const expanded = open.has(cue.id);
    if (!entry) {
      return `<div class="snd-cue"><div class="snd-cue-top">
        <span class="cfg-label">${cue.label}</span>
        <span class="wd-empty">no bank entry — silent</span></div></div>`;
    }
    return `
      <div class="snd-cue${changed ? " changed" : ""}${expanded ? " open" : ""}" data-cue="${cue.id}">
        <div class="snd-cue-top">
          <button class="snd-play" data-snd="play" title="Audition">▶</button>
          <div class="snd-cue-meta">
            <span class="cfg-label">${cue.label}<span class="cfg-dot" title="Changed from default">●</span></span>
            <span class="cfg-help">${cue.help}</span>
          </div>
          <code class="snd-id">${cue.id}</code>
          <button class="btn btn-ghost snd-edit" data-snd="toggle">${expanded ? "Close" : "Tune"}</button>
        </div>
        ${expanded ? paramsHTML(cue.id, entry) : ""}
      </div>`;
  }

  function paramsHTML(id, entry) {
    const s = entry.synth || {};
    return `
      <div class="snd-params">
        <div class="snd-wave">
          <label class="wd-mini">Waveform${s.wave === "noise" ? ` <span class="cfg-help">— pitch comes from Lowpass</span>` : ""}
            <select data-snd="wave">
              ${WAVES.map((w) => `<option value="${w}"${w === s.wave ? " selected" : ""}>${w}</option>`).join("")}
            </select>
          </label>
          <button class="btn btn-alt" data-snd="reset-cue">Reset this cue</button>
        </div>
        <div class="snd-grid">
          ${SYNTH_SLIDERS.map((sl) => synthSliderHTML(id, sl, s)).join("")}
        </div>
        <div class="snd-grid snd-grid-entry">
          ${ENTRY_SLIDERS.map((sl) => entrySliderHTML(sl, entry)).join("")}
        </div>
      </div>`;
  }

  // A pure-noise cue has no tone term at all (see synth.js), so its Pitch and
  // Sweep sliders do nothing — for those, `filterHz` IS the pitch control.
  // Showing live sliders that silently no-op is how you waste a tuning session.
  function isInert(sl, s) {
    return s.wave === "noise" && (sl.key === "freq" || sl.key === "freqEnd");
  }

  function synthSliderHTML(id, sl, s) {
    const [min, max] = SYNTH_RANGES[sl.key];
    if (isInert(sl, s)) {
      return `
        <label class="wd-mini snd-off" title="Noise has no tone to pitch — use Lowpass instead.">
          <span class="snd-mini-head">${sl.label}<output>n/a</output></span>
          <span class="wd-mini-ctl"><input type="range" min="0" max="1" value="0" disabled></span>
        </label>`;
    }
    const off = sl.nullable && s[sl.key] == null;
    // A nullable param (sweep, lowpass) shows a switch: off means "not applied",
    // which is a different thing from the slider sitting at its minimum.
    const val = off ? (sl.key === "freqEnd" ? s.freq : 4000) : s[sl.key];
    return `
      <label class="wd-mini${off ? " snd-off" : ""}">
        <span class="snd-mini-head">
          ${sl.label}
          ${sl.nullable ? `<button type="button" role="switch" aria-checked="${!off}" class="toggle sm${off ? "" : " on"}" data-snd="null-toggle" data-key="${sl.key}"><span class="knob"></span></button>` : ""}
          <output data-out="${sl.key}">${fmt(val)}${sl.unit}</output>
        </span>
        <span class="wd-mini-ctl">
          <input type="range" data-snd="synth" data-key="${sl.key}"
                 min="${min}" max="${max}" step="${sl.step}" value="${val}"${off ? " disabled" : ""}>
        </span>
      </label>`;
  }

  function entrySliderHTML(sl, entry) {
    return `
      <label class="wd-mini">
        <span class="snd-mini-head">${sl.label}<output data-out="e:${sl.key}">${fmt(entry[sl.key])}</output></span>
        <span class="wd-mini-ctl">
          <input type="range" data-snd="entry" data-key="${sl.key}"
                 min="${sl.min}" max="${sl.max}" step="${sl.step}" value="${entry[sl.key]}">
        </span>
      </label>`;
  }

  function fmt(n) {
    if (n == null) return "—";
    return Number.isInteger(n) ? String(n) : Number(n).toFixed(n < 1 ? 3 : 1);
  }

  function cueIdOf(el) {
    const row = el.closest("[data-cue]");
    return row ? row.dataset.cue : null;
  }

  function audition(id) {
    audio.unlock();
    audio.invalidateBuffers(); // edited params must not play a stale buffer
    audio.audition(getEntry(id));
  }

  function msg(text, ok = true) {
    const m = document.getElementById("snd-msg");
    if (m) {
      m.textContent = text;
      m.className = "ed-msg " + (ok ? "ok" : "bad");
    }
  }

  // ---- events -------------------------------------------------------------

  // Dragging: persist + update the readout on every input, but only audition on
  // release (`change`) so scrubbing a slider doesn't machine-gun the speakers.
  const onInput = (e) => {
    const el = e.target.closest("[data-snd='synth'],[data-snd='entry']");
    if (!el) return;
    const id = cueIdOf(el);
    if (!id) return;
    const val = Number(el.value);
    const isSynth = el.dataset.snd === "synth";
    if (isSynth) setSynthParam(id, el.dataset.key, val);
    else setEntry(id, { [el.dataset.key]: val });
    const out = el.closest(".wd-mini").querySelector(`[data-out="${isSynth ? "" : "e:"}${el.dataset.key}"]`);
    if (out) {
      const unit = isSynth ? (SYNTH_SLIDERS.find((s) => s.key === el.dataset.key) || {}).unit || "" : "";
      out.textContent = fmt(val) + unit;
    }
    const row = el.closest("[data-cue]");
    if (row) row.classList.add("changed");
  };

  const onChange = (e) => {
    const el = e.target.closest("[data-snd]");
    if (!el) return;
    if (el.dataset.snd === "wave") {
      const id = cueIdOf(el);
      if (id) {
        setSynthParam(id, "wave", el.value);
        audition(id);
      }
      return;
    }
    if (el.dataset.snd === "synth" || el.dataset.snd === "entry") {
      const id = cueIdOf(el);
      if (id) audition(id);
    }
  };

  const onClick = (e) => {
    const el = e.target.closest("[data-snd]");
    if (!el) return;
    const action = el.dataset.snd;
    const id = cueIdOf(el);

    switch (action) {
      case "play":
        if (id) audition(id);
        break;
      case "toggle":
        if (!id) break;
        if (open.has(id)) open.delete(id);
        else open.add(id);
        render();
        break;
      case "null-toggle": {
        if (!id) break;
        const on = el.classList.contains("on"); // pre-click state
        const key = el.dataset.key;
        const entry = getEntry(id);
        // Turning a nullable param ON seeds it with something audible rather
        // than whatever the disabled slider happened to be showing.
        setSynthParam(id, key, on ? null : key === "freqEnd" ? Math.round(entry.synth.freq * 0.4) : 4000);
        render();
        audition(id);
        break;
      }
      case "reset-cue":
        if (!id) break;
        resetCue(id);
        render();
        audition(id);
        break;
      case "reset-all":
        resetBank();
        audio.invalidateBuffers();
        render();
        msg("Reset every cue to its default sound.");
        break;
      case "export":
        document.getElementById("snd-io").value = exportBank();
        msg("Exported the bank below. Paste into src/audio/bank.js to make it permanent.");
        break;
      case "import": {
        const res = importBank(document.getElementById("snd-io").value);
        audio.invalidateBuffers();
        render();
        msg(res.ok ? `Imported ${res.applied} cue(s).` : res.reason, res.ok);
        break;
      }
    }
  };

  container.addEventListener("input", onInput);
  container.addEventListener("change", onChange);
  container.addEventListener("click", onClick);

  render();

  return {
    dispose() {
      container.removeEventListener("input", onInput);
      container.removeEventListener("change", onChange);
      container.removeEventListener("click", onClick);
      audio.stopAll();
    },
  };
}
