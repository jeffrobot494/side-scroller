// Player2 Lab — the session run store and the rules the run cards and the
// compare view use. DOM-free. (tech/player2-lab.md; design/player2-lab.md)
//
// A run is a plain object:
//   { id, mod, values, summary, label, request, response, output, reported,
//     reportedKind, voice, status: "running"|"done"|"failed", error,
//     startedAt, ms, joules, partial, job }
// Nothing here persists: the design keeps runs for the session only.

export function createRunStore() {
  let nextId = 1;
  const runs = new Map(); // id -> run, insertion order = oldest first
  const listeners = new Set();
  const emit = (run) => listeners.forEach((fn) => fn(run));

  return {
    add(fields) {
      const run = { id: nextId++, status: "running", ver: 0, ...fields };
      runs.set(run.id, run);
      emit(run);
      return run;
    },
    update(id, patch) {
      const run = runs.get(id);
      if (!run) return null;
      Object.assign(run, patch, { ver: run.ver + 1 });
      emit(run);
      return run;
    },
    get: (id) => runs.get(id) || null,
    // Newest first, like the cards.
    list: (mod) => [...runs.values()].filter((r) => !mod || r.mod === mod).reverse(),
    clear(mod) {
      for (const [id, r] of runs) if (r.mod === mod && r.status !== "running") runs.delete(id);
      emit(null);
    },
    running: () => [...runs.values()].filter((r) => r.status === "running"),
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// The model-name rule: what the card names as the model, and where it came
// from — reported by the platform, then your label, then the voice sent, then
// nothing.
export function ident(run) {
  if (run.reported) {
    return { text: run.reported, source: run.reportedKind === "provider" ? "reported provider" : "reported", cls: "" };
  }
  if (run.label) return { text: run.label, source: "your label", cls: "lab" };
  if (run.voice) return { text: "voice: " + run.voice, source: "voice sent · no provider reported", cls: "sent" };
  return { text: "(not reported)", source: "", cls: "none" };
}

// Which input keys differ across the given runs, plus "model" when the named
// model differs. Compared on the stored values, not the display summary.
export function diffKeys(runs) {
  const out = new Set();
  if (runs.length < 2) return out;
  const keys = new Set(runs.flatMap((r) => Object.keys(r.values || {})));
  for (const k of keys) {
    if (new Set(runs.map((r) => valueKey(r.values?.[k] ?? null))).size > 1) out.add(k);
  }
  if (new Set(runs.map((r) => ident(r).text)).size > 1) out.add("model");
  return out;
}

// A comparable key for a value. Byte arrays (audio, images) are keyed by
// length and a sampled hash rather than serialised whole.
export function valueKey(value) {
  return JSON.stringify(value, (_, v) => (v instanceof Uint8Array ? `bytes:${v.length}:${sampleHash(v)}` : v));
}

function sampleHash(bytes) {
  let h = 2166136261;
  const step = Math.max(1, Math.floor(bytes.length / 4096));
  for (let i = 0; i < bytes.length; i += step) h = Math.imul(h ^ bytes[i], 16777619);
  return (h >>> 0).toString(36);
}

// Joules per run is a balance difference, and only attributable when nothing
// else was queued or in flight in the run's window. The window opens when the
// run is enqueued (begin) and closes when its end balance has been read (end).
export function createJoulesLedger() {
  const open = new Map(); // id -> { start: number|null|undefined, overlapped, failed }
  return {
    begin(id) {
      const entry = { start: undefined, overlapped: open.size > 0, failed: false };
      for (const other of open.values()) other.overlapped = true;
      open.set(id, entry);
    },
    setStart(id, balance) {
      const e = open.get(id);
      if (e) e.start = typeof balance === "number" ? balance : null;
    },
    // Returns the joules spent, or null when it cannot be attributed.
    end(id, balance) {
      const e = open.get(id);
      open.delete(id);
      if (!e || e.overlapped || typeof e.start !== "number" || typeof balance !== "number") return null;
      return Math.max(0, e.start - balance);
    },
    get openCount() {
      return open.size;
    },
  };
}

// Raw shortens base64: images and audio would make it unreadable.
const B64 = /^[A-Za-z0-9+/=\r\n]+$/;
export function shortenForRaw(value, keep = 48) {
  if (typeof value === "string") {
    if (value.length > 256 && B64.test(value)) return `${value.slice(0, keep)}… (${value.length} chars base64)`;
    if (value.startsWith("data:") && value.length > 256) return `${value.slice(0, keep)}… (${value.length} chars data URI)`;
    return value;
  }
  if (Array.isArray(value)) {
    // Long numeric arrays (embedding vectors) get the same treatment.
    if (value.length > 16 && value.every((x) => typeof x === "number")) {
      return `[${value.slice(0, 8).join(", ")}, … ${value.length} numbers]`;
    }
    return value.map((v) => shortenForRaw(v, keep));
  }
  if (value && typeof value === "object") {
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) return `(${value.byteLength} bytes)`;
    const o = {};
    for (const [k, v] of Object.entries(value)) o[k] = shortenForRaw(v, keep);
    return o;
  }
  return value;
}

export function formatMs(ms) {
  if (typeof ms !== "number") return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
