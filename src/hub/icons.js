// ---------------------------------------------------------------------------
// HUB ICONS — one drawn set for every mark the hub used to spell with an emoji
// or a dingbat.
//
// Stencils, not pictures: a 24-unit box, no fill, one stroke weight, round
// joins, and `currentColor` throughout. That last part is the whole reason
// these exist — a room hatch lights up when it is active, and a colour emoji
// cannot be lit. These inherit the strip lighting like every other surface in
// the bunker does.
//
// Sized by CSS (`.ico { width: 1em }`) so a mark scales with the type around
// it. `aria-hidden` on all of them: every icon in this hub sits beside its own
// label, so a screen reader that announced them would read each room twice.
// ---------------------------------------------------------------------------

const PATHS = {
  // Rooms — the five hatches off the access shaft.
  helmet: `<path d="M4.5 14.5v-1.8a7.5 7.5 0 0 1 15 0v1.8"/><path d="M2.6 14.5h18.8"/><path d="M7.4 14.5v2.6a2.2 2.2 0 0 0 2.2 2.2h4.8a2.2 2.2 0 0 0 2.2-2.2v-2.6"/>`,
  wrench: `<path d="M15.6 3.6a4.6 4.6 0 0 0-5.3 6.2l-6.5 6.5v3.4h3.4l6.5-6.5a4.6 4.6 0 0 0 6.2-5.3l-2.9 2.9-2.7-.7-.7-2.7z"/><path d="M6.2 17.8h.01"/>`,
  dish: `<path d="M5 20.6h6.2"/><path d="M8.1 20.6v-5.9"/><path d="M3.2 13.9a7.8 7.8 0 0 1 10.9-10.9z"/><path d="M8.6 14.6 12.4 10.8"/><path d="M15.8 7.4a4.6 4.6 0 0 1 0 6.5"/><path d="M18.4 4.8a8.3 8.3 0 0 1 0 11.7"/>`,
  chassis: `<rect x="4.2" y="8.4" width="15.6" height="10.6" rx="2.2"/><path d="M12 8.4V5.6"/><path d="M12 3.2v.9"/><path d="M2.4 12.2v3.2"/><path d="M21.6 12.2v3.2"/><path d="M9.2 12.6v1.9"/><path d="M14.8 12.6v1.9"/>`,
  map: `<path d="M3 6.8 9 4.6l6 2.2 6-2.2v12.6l-6 2.2-6-2.2-6 2.2z"/><path d="M9 4.6v12.6"/><path d="M15 6.8v12.6"/>`,

  // Marks — what the dingbats were doing.
  gear: `<circle cx="12" cy="12" r="3.1"/><path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.6 5.4l-1.9 1.9M7.3 16.7l-1.9 1.9M18.6 18.6l-1.9-1.9M7.3 7.3 5.4 5.4"/>`,
  star: `<path d="m12 3.2 2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 17.2l-5.6 3.2 1.3-6.3L2.9 9.8l6.4-.7z"/>`,
  cross: `<path d="M12 4.2v15.6"/><path d="M7.4 8.6h9.2"/>`,
  check: `<path d="m4.6 12.4 4.8 4.8 10-10.4"/>`,
  skull: `<path d="M5.2 11a6.8 6.8 0 0 1 13.6 0v2.8l-1.6 1.6v2.4a1.6 1.6 0 0 1-1.6 1.6H8.4a1.6 1.6 0 0 1-1.6-1.6v-2.4L5.2 13.8z"/><path d="M9.4 10.6v1.6"/><path d="M14.6 10.6v1.6"/><path d="M10.4 19.4v-2.2"/><path d="M13.6 19.4v-2.2"/>`,
  dash: `<path d="M4.4 12h15.2"/>`,
  clock: `<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.2 2.2"/>`,
  crosshair: `<circle cx="12" cy="12" r="7.6"/><path d="M12 1.8v4.4M12 17.8v4.4M22.2 12h-4.4M6.2 12H1.8"/>`,
};

// The one place a mark becomes markup. `cls` carries the size and colour.
export function icon(name, cls = "") {
  const d = PATHS[name];
  if (!d) return "";
  return `<svg class="ico${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
}

export const ICON_NAMES = Object.keys(PATHS);
