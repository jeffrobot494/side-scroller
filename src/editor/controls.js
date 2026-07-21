// ---------------------------------------------------------------------------
// Reusable schema → controls renderer.
//
// Turns a config SCHEMA into HTML controls and wires their events. Kept free of
// any editor-specific chrome so the same renderer can later power an in-game
// dev overlay. Callers own persistence: `bindControls` just reports changes.
// ---------------------------------------------------------------------------

export function controlsHTML(schema, config, isDefault) {
  return schema
    .map(
      (group) => `
      <section class="cfg-group">
        <h2>${group.title}</h2>
        <div class="cfg-items">
          ${group.items.map((it) => rowHTML(it, config[it.key], isDefault ? isDefault(it.key) : true)).join("")}
        </div>
      </section>`
    )
    .join("");
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
  if (row) row.classList.add("changed");
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : Number(n).toFixed(2);
}
