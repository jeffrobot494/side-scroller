// ---------------------------------------------------------------------------
// REMOTE CONFIG — the editor's end of `/api/config`  (tech/server-settings.md, C3)
//
// `editor.html?server=1` tunes the ROOM's settings instead of this browser's.
// Everything that knows about a wire lives here so `editor.js` gains a call
// rather than a fetch, and so a suite can drive the drop rule and the debounce
// without a page.
//
// WHY THIS IS NOT `importConfig`: that function writes the local `config`
// object. Over a wire the browser is a keyboard, not a store — it parses,
// decides which keys may cross, and posts them. `setConfig` on the far side
// still owns coercion and clamping, so nothing here has a second opinion about
// the schema.
//
// DOM-FREE: `fetch` and a href string, both injectable.
// ---------------------------------------------------------------------------

// Which server, if any, this page is pointed at.
//
//   editor.html                       → null, today's localStorage editor
//   editor.html?server=1              → the origin that served this page
//   editor.html?server=http://host:80 → that origin
//
// The second form exists because this page can be served by something that is
// not the game's server. `npm start` is how the repo is run and answers
// everything; `python3 -m http.server` still serves the files and has no `/api`
// at all (CLAUDE.md carries the measured table), so `?server=1` under it points
// at something that cannot answer. It fails visibly rather than silently (see
// `load`), and the URL form is the way out without moving the editor.
export function serverTarget(href) {
  let url;
  try {
    url = new URL(href, "http://localhost/");
  } catch {
    return null;
  }
  const flag = url.searchParams.get("server");
  if (flag === null || flag === "" || flag === "0") return null;
  if (flag === "1" || flag === "true") return { base: url.origin, label: url.origin };
  try {
    const b = new URL(flag);
    return { base: b.origin, label: b.origin };
  } catch {
    return { base: null, label: flag, invalid: true };
  }
}

export function createRemoteConfig(target, opts = {}) {
  const base = target && target.base;
  const doFetch = opts.fetch || ((...a) => globalThis.fetch(...a));
  const waitMs = opts.debounceMs ?? 150;
  const onError = opts.onError || (() => {});
  // The pending last value per key, and the timer that will send it. A range
  // fires `input` on every pixel of a drag, which over HTTP is a burst of
  // unordered fetches for one gesture (approximation 5) — so one key has at
  // most one flight in the air and the last value wins.
  const pending = new Map();
  const timers = new Map();
  // Keys the server said it owns. Set by `load`, and the whole of the drop
  // rule: a key the server did not offer is not sent.
  let owned = new Set();
  // POSTs still in the air. `flush` waits on these as well as on the debounce,
  // because the case that matters is Export: a debounce that fired a moment ago
  // has a request in flight, and a GET issued past it would print the value
  // BEFORE the drag.
  const inFlight = new Set();

  function send(key, value) {
    const p = doSend(key, value);
    inFlight.add(p);
    p.then(() => inFlight.delete(p), () => inFlight.delete(p));
    return p;
  }

  async function doSend(key, value) {
    let res;
    try {
      res = await doFetch(`${base}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
    } catch (e) {
      return { ok: false, status: 0, error: `${base} is unreachable (${e && e.message})` };
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* a refusal with no JSON body is still a refusal */
    }
    if (!res.ok) return { ok: false, status: res.status, error: (body && body.error) || `HTTP ${res.status}` };
    return { ok: true, status: res.status, value: body && body.value };
  }

  return {
    base,
    label: target && target.label,
    invalid: !!(target && target.invalid),

    // The server's own view of what it owns: groups already rebuilt with a
    // filtered `items` and empty ones dropped, plus its live values. Handed
    // straight to `controlsTabsHTML`.
    async load() {
      if (!base) throw new Error(`Not a server URL: ${target && target.label}`);
      let res;
      try {
        res = await doFetch(`${base}/api/config`);
      } catch (e) {
        // The `python3 -m http.server` case, and every other "there is nothing
        // listening there". Named rather than swallowed: a page that quietly
        // fell back to localStorage would look like it was tuning a server.
        throw new Error(`${base} did not answer /api/config (${e && e.message}) — is it the node server?`);
      }
      if (!res.ok) throw new Error(`${base}/api/config answered ${res.status}`);
      let payload;
      try {
        payload = await res.json();
      } catch {
        throw new Error(`${base}/api/config did not answer JSON — is it the node server?`);
      }
      if (!payload || !Array.isArray(payload.groups) || !payload.values)
        throw new Error(`${base}/api/config answered something that is not a config`);
      owned = new Set(payload.groups.flatMap((g) => g.items).map((it) => it.key));
      return payload;
    },

    // What the server said it owns, for a caller that wants to ask.
    owns: (key) => owned.has(key),

    // One knob moved. Debounced per key; a failure is reported through
    // `onError` because the caller is a `bindControls` callback with nowhere to
    // put a promise.
    set(key, value) {
      pending.set(key, value);
      clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          const v = pending.get(key);
          pending.delete(key);
          send(key, v).then((r) => {
            if (!r.ok) onError(key, r.error);
          });
        }, waitMs)
      );
    },

    // Send everything waiting on a debounce now, and wait for anything already
    // in the air. For a test, and for Export, which must not read values back
    // past its own drag.
    async flush() {
      for (const key of [...pending.keys()]) {
        clearTimeout(timers.get(key));
        timers.delete(key);
        const v = pending.get(key);
        pending.delete(key);
        send(key, v);
      }
      while (inFlight.size) await Promise.all([...inFlight]);
    },

    // Write the server's running values into its own `src/game/config.js`
    // (tech/server-settings.md, C4). No body — the server knows what differs.
    //
    // A REFUSAL HERE IS A NORMAL ANSWER, not an error: a deployed server has no
    // checkout and cannot make anything permanent, and the caller has to be
    // able to say that in words rather than as a status code. `checkout: false`
    // is what distinguishes it from a write that failed.
    async makePermanent() {
      if (!base) return { ok: false, reason: `Not a server URL: ${target && target.label}` };
      let res;
      try {
        res = await doFetch(`${base}/api/config/permanent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      } catch (e) {
        return { ok: false, reason: `${base} is unreachable (${e && e.message})` };
      }
      let body = null;
      try {
        body = await res.json();
      } catch {
        /* a refusal with no JSON body is still a refusal */
      }
      if (!res.ok)
        return {
          ok: false,
          canPersist: !(body && body.checkout === false),
          reason: (body && body.error) || `HTTP ${res.status}`,
        };
      return { ok: true, written: (body && body.written) || [], path: body && body.path };
    },

    // A pasted config, sent key by key — an import is a batch of the same
    // writes a slider makes, which is why there is no second route.
    //
    // THE DROP IS SILENT AND DELIBERATE. The JSON a person has is an Export of
    // a WHOLE config (all 71 keys, defaults included — approximation 2b), so
    // refusing the paste over one viewer knob would make the round trip
    // useless. Anything the server did not offer is dropped here rather than
    // posted and refused, so the count reported is what actually crossed.
    //
    // NOT ATOMIC (approximation 11): N sequential POSTs, and a failure halfway
    // leaves the server half-imported. `failures` is what the caller says so.
    async importAll(json) {
      let obj;
      if (typeof json === "string") {
        try {
          obj = JSON.parse(json);
        } catch {
          return { ok: false, reason: "Not valid JSON." };
        }
      } else obj = json;
      if (!obj || typeof obj !== "object" || Array.isArray(obj))
        return { ok: false, reason: "Expected a JSON object." };

      let applied = 0;
      let dropped = 0;
      const failures = [];
      for (const key of Object.keys(obj)) {
        if (!owned.has(key)) {
          dropped++;
          continue;
        }
        const r = await send(key, obj[key]);
        if (r.ok) applied++;
        else failures.push(`${key}: ${r.error}`);
      }
      return { ok: true, applied, dropped, failures };
    },
  };
}
