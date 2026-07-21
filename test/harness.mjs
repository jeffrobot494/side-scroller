// ---------------------------------------------------------------------------
// TEST HARNESS — shared stubs + a tiny assertion API for headless node tests.
//
// There is no browser in CI/dev, so tests run under node and stub the few
// globals the game touches: window/document, requestAnimationFrame, performance,
// navigator, localStorage, and a 2D canvas context. Import this instead of
// re-deriving the stubs in every test (the recurring papercut this file kills).
//
// A test file exports `export default async function run(t) { … }` and calls
// t.ok(name, cond) / t.eq(name, actual, expected). The runner (run.mjs) creates
// the checker, resets localStorage, installs the DOM, and aggregates results.
//
// NOTE: node treats the project's .js source as ESM only because the repo root
// has a package.json with "type":"module" (node-tests only — the browser ignores
// it; there is still no build step). Run everything with `node test/run.mjs`.
// ---------------------------------------------------------------------------

// ---- assertion checker ----------------------------------------------------

export function makeChecker() {
  let pass = 0;
  let fail = 0;
  const failures = [];
  return {
    ok(name, cond) {
      if (cond) pass++;
      else {
        fail++;
        failures.push(name);
      }
    },
    eq(name, actual, expected) {
      this.ok(`${name} (got ${JSON.stringify(actual)})`, JSON.stringify(actual) === JSON.stringify(expected));
    },
    get pass() {
      return pass;
    },
    get fail() {
      return fail;
    },
    failures,
  };
}

// ---- localStorage ---------------------------------------------------------

export function stubLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

// ---- minimal DOM ----------------------------------------------------------
// Enough for the editor tools: elements expose innerHTML, dataset, style,
// classList, value/checked/textContent, addEventListener (noop), and a canvas
// getContext returning the 2D-context mock. querySelector returns fresh mock
// elements so a tool's `$("#id")` lookups never return null.

export function makeEl(tag = "div") {
  const el = {
    tagName: tag,
    children: [],
    dataset: {},
    style: {},
    classList: mkClassList(),
    _html: "",
    attrs: {},
    value: "",
    checked: true,
    textContent: "",
    width: 800,
    height: 300,
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    getAttribute(k) {
      return this.attrs[k];
    },
    appendChild(c) {
      this.children.push(c);
      return c;
    },
    addEventListener() {},
    removeEventListener() {},
    getContext: () => ctx2d(),
  };
  Object.defineProperty(el, "innerHTML", {
    get() {
      return this._html;
    },
    set(v) {
      this._html = v;
    },
  });
  el.querySelector = () => makeEl();
  el.querySelectorAll = () => [];
  return el;
}

function mkClassList() {
  const s = new Set();
  return {
    add: (c) => s.add(c),
    remove: (c) => s.delete(c),
    toggle: (c) => (s.has(c) ? (s.delete(c), false) : (s.add(c), true)),
    contains: (c) => s.has(c),
  };
}

// A 2D-context mock: gradients answer addColorStop; every other method is a
// noop, so a tool's synchronous draw() at mount runs without throwing.
export function ctx2d() {
  const grad = { addColorStop() {} };
  return new Proxy(
    { createLinearGradient: () => grad, createRadialGradient: () => grad, canvas: { width: 800, height: 300 } },
    { get: (t, p) => (p in t ? t[p] : () => {}) }
  );
}

// ---- global install -------------------------------------------------------
// Idempotent; safe to call once per suite. requestAnimationFrame is a noop that
// returns a handle, so a tool's animation loop draws once at mount and then
// simply doesn't re-fire (no infinite recursion under node).

export function installDom() {
  globalThis.window = globalThis.window || globalThis;
  globalThis.document = { createElement: makeEl, getElementById: () => makeEl(), body: makeEl() };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  if (typeof globalThis.performance === "undefined") globalThis.performance = { now: () => Date.now() };
  try {
    globalThis.navigator = { clipboard: { writeText: () => Promise.resolve() } };
  } catch {
    /* navigator is read-only on some node versions; tools guard navigator.clipboard */
  }
}
