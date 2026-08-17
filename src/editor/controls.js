// ---------------------------------------------------------------------------
// Reusable schema → controls renderer.
//
// Turns a config SCHEMA into HTML controls and wires their events. Kept free of
// any editor-specific chrome so the same renderer can later power an in-game
// dev overlay. Callers own persistence: `bindControls` just reports changes.
// ---------------------------------------------------------------------------

export function controlsHTML(schema, config, isDefault) {
  return schema.map((group) => groupHTML(group, config, isDefault)).join("");
}

// The same controls, one group at a time behind a tab strip. Every panel is in
// the DOM and the inactive ones carry `hidden`, so the caller binds events once
// and switching tabs is a class toggle rather than a re-render — which is what
// keeps a half-typed Import textarea alive across a tab click.
//
// A tab whose group holds a non-default value gets the same dot a changed row
// gets, so "what did I change" is answerable without opening all ten.
export function controlsTabsHTML(schema, config, isDefault, active = 0) {
  const tabs = schema
    .map((group, i) => {
      const changed = isDefault ? group.items.some((it) => isDefault(it.key) === false) : false;
      return `<button type="button" role="tab" aria-selected="${i === active}" data-cfg-tab="${i}"
        class="${i === active ? "active" : ""}${changed ? " changed" : ""}">${group.title}<span class="cfg-dot" title="Changed from default">●</span></button>`;
    })
    .join("");

  const panels = schema
    .map((group, i) => `<div data-cfg-panel="${i}"${i === active ? "" : " hidden"}>${groupHTML(group, config, isDefault)}</div>`)
    .join("");

  return `<div class="cfg-tabs" role="tablist">${tabs}</div><div class="cfg-panels">${panels}</div>`;
}

// Show panel `index`, hide the rest, and move the active tab. Returns the index
// actually shown so a caller can remember it.
export function showControlsTab(root, index) {
  if (!root) return 0;
  const panels = root.querySelectorAll("[data-cfg-panel]");
  const tabs = root.querySelectorAll("[data-cfg-tab]");
  const i = Math.max(0, Math.min(panels.length - 1, Number(index) || 0));
  panels.forEach((p, n) => { if (n === i) p.removeAttribute("hidden"); else p.setAttribute("hidden", ""); });
  tabs.forEach((t, n) => {
    t.classList.toggle("active", n === i);
    t.setAttribute("aria-selected", String(n === i));
  });
  return i;
}

function groupHTML(group, config, isDefault) {
  return `
      <section class="cfg-group">
        <h2>${group.title}</h2>
        <div class="cfg-items">
          ${group.items.map((it) => rowHTML(it, config[it.key], isDefault ? isDefault(it.key) : true)).join("")}
        </div>
      </section>`;
}

function rowHTML(item, value, isDef) {
  const changed = isDef === false;
  return `
    <div class="cfg-row${changed ? " changed" : ""}" data-row="${item.key}">
      <div class="cfg-meta">
        <span class="cfg-label">${item.label}<span class="cfg-dot" title="Changed from default">●</span></span>
        ${item.help ? `<span class="cfg-help">${item.help}</span>` : ""}
      </div>
      <div class="cfg-control">${inputHTML(item, value)}</div>
    </div>`;
}

function inputHTML(item, value) {
  switch (item.type) {
    case "bool":
      return `<button type="button" role="switch" aria-checked="${value}" class="toggle${value ? " on" : ""}" data-key="${item.key}" data-type="bool"><span class="knob"></span></button>`;
    case "range":
      return `
        <input type="range" data-key="${item.key}" data-type="range"
               min="${item.min}" max="${item.max}" step="${item.step}" value="${value}">
        <output class="cfg-val" data-val-for="${item.key}">${fmt(value)}</output>`;
    case "enum":
      return `<select data-key="${item.key}" data-type="enum">${item.options
        .map((o) => `<option value="${o}"${o === value ? " selected" : ""}>${o}</option>`)
        .join("")}</select>`;
    default:
      return `<input type="text" data-key="${item.key}" data-type="text" value="${value}">`;
  }
}

// Wire events under `root`. onChange(key, value) fires with a raw value; the
// caller coerces + persists. Updates the range readout and "changed" dot live.
export function bindControls(root, onChange) {
  root.addEventListener("input", (e) => {
    const el = e.target.closest("[data-type='range']");
    if (!el) return;
    const val = Number(el.value);
    const out = root.querySelector(`[data-val-for="${el.dataset.key}"]`);
    if (out) out.textContent = fmt(val);
    onChange(el.dataset.key, val);
    mark(root, el.dataset.key);
  });

  root.addEventListener("click", (e) => {
    const t = e.target.closest(".toggle");
    if (!t) return;
    const on = t.classList.toggle("on");
    t.setAttribute("aria-checked", String(on));
    onChange(t.dataset.key, on);
    mark(root, t.dataset.key);
  });

  root.addEventListener("change", (e) => {
    const el = e.target.closest("[data-type='enum'],[data-type='text']");
    if (!el) return;
    onChange(el.dataset.key, el.value);
    mark(root, el.dataset.key);
  });
}

function mark(root, key) {
  const row = root.querySelector(`[data-row="${key}"]`);
  if (!row) return;
  row.classList.add("changed");
  // Light the owning tab too, so a change made on one tab is still findable
  // from another. No-op in the untabbed layout, which has no panels.
  const panel = row.closest("[data-cfg-panel]");
  if (!panel) return;
  const tab = root.querySelector(`[data-cfg-tab="${panel.dataset.cfgPanel}"]`);
  if (tab) tab.classList.add("changed");
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : Number(n).toFixed(2);
}
