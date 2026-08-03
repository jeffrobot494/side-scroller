// ---------------------------------------------------------------------------
// CUE PICKER — the shared "assign a sound to this thing" control.
//
// The Sound page owns the LIBRARY; this is how a tool assigns from it. Kept in
// its own module because the Weapon Designer and the Enemy Designer need the
// identical control and must offer the identical vocabulary (tech/sound.md).
//
// Emits a settings-style row: a grouped <select> over the cue catalog plus a ▶
// audition button. The empty value means "leave it automatic" — the caller's own
// derivation (weaponCue's shape timbre) then applies, which is why the row also
// prints what the choice currently RESOLVES to; a cue that falls back up the
// dots is otherwise invisible.
//
//   cuePickerRowHTML({ label, help, kind, value, resolved })
//   → handle `change` on [data-cue] and `click` on [data-cue-play] in the tool.
// ---------------------------------------------------------------------------

import { CUES } from "../audio/cues.js";
import { getEntry, resolveCue } from "../audio/bank.js";
import { audio } from "../audio/engine.js";

function optionsHTML(value) {
  return CUES.map(
    (g) => `<optgroup label="${g.title}">${g.items
      .map((c) => `<option value="${c.id}"${c.id === value ? " selected" : ""}>${c.label}</option>`)
      .join("")}</optgroup>`
  ).join("");
}

/**
 * One assignment row: which cue, and how loud this owner plays it.
 * @param {object} o
 *   label     row label ("Shot", "Impact", …)
 *   help      one-line explanation
 *   kind      the key this row edits — comes back as `data-cue="<kind>"` /
 *             `data-cue-gain="<kind>"` / `data-cue-play="<kind>"`
 *   value     the currently assigned cue id, or "" for automatic
 *   resolved  what an automatic choice currently resolves to (shown as a hint)
 *   gain      this owner's level multiplier on the cue (1 = the cue's own level)
 */
export function cuePickerRowHTML({ label, help, kind, value = "", resolved = "", gain = 1 }) {
  const auto = !value;
  return `
    <div class="cfg-row wd-row snd-pick" data-cue-row="${kind}">
      <div class="cfg-meta">
        <span class="cfg-label">${label}</span>
        <span class="cfg-help">${help}${auto && resolved ? ` Currently <code>${resolved}</code>.` : ""}</span>
      </div>
      <div class="cfg-control">
        <select data-cue="${kind}">
          <option value=""${auto ? " selected" : ""}>Auto — from shape</option>
          ${optionsHTML(value)}
        </select>
        <span class="snd-gain" title="Level relative to the cue's own volume">
          <input type="range" data-cue-gain="${kind}" min="0" max="2" step="0.05" value="${gain}">
          <output data-cue-gain-out="${kind}">${fmtGain(gain)}</output>
        </span>
        <button type="button" class="snd-play" data-cue-play="${kind}" title="Audition">▶</button>
      </div>
    </div>`;
}

/** Shared so the live drag readout and the initial render can't disagree. */
export function fmtGain(g) {
  return `×${Number(g).toFixed(2)}`;
}

/**
 * Play a cue id as the game would hear it (bus, trim, pitch jitter), ignoring
 * cooldown and voice caps so repeated clicks always sound. Falls back to the
 * resolved entry so auditioning an id that only exists via the dotted walk still
 * makes noise. Returns the id that actually played, or null.
 *
 * `gain` is the owner's multiplier, so ▶ previews the level you just set rather
 * than the cue's bare level.
 */
export function auditionCue(id, gain = 1) {
  if (!id) return null;
  audio.unlock();
  audio.invalidateBuffers();
  const hit = resolveCue(id);
  if (!hit) return null;
  // play() honours the mixer and the cue's own bus; force skips the guards.
  if (audio.play(id, { force: true, gain })) return hit.id;
  // No context (headless): fall back to audition so the call is still defined.
  audio.audition(getEntry(hit.id));
  return hit.id;
}
