---
type: tech
category: development-tools
status: unbuilt
resolution: sharp
needs: [multiplayer-service]
related: [server-settings, multiplayer-service, multiplayer-missions]
---

# Server settings

Two routes and a scope field. The screen exists and the setter already behaves
correctly in a process with no storage; what is missing is a way for one to
reach the other, and a way to say which knobs may cross.

## Slices

| # | Slice | Changes runtime behaviour |
|---|---|---|
| **C1** | **`scope` on a schema entry.** A knob is `"server"` — **read only by the room** — or it is not, and this screen leaves it alone. "Only" is the load-bearing word and "a knob the room reads" is NOT the rule: `soldierBaseHp`/`soldierHpPerHealth` are read by the room to build a soldier (`src/mission/entities.js`) AND by the base to draw its HP bars (`src/hub/hub.js`), and `applySoldier` copies `health` but not the ceiling — so scoping those gives every bar the room's numerator over the browser's denominator. The `doomPerDay`/`doomPerExpiry*` family is the same shape: applied by the room, printed by the hub. Single-player is untouched by any of it — the plain URL reads and writes localStorage as today, for every knob. Marked entries are the ones the routes will serve; everything unmarked is viewer state (zoom, canvas size, FPS meter, sound buses, gamepad deadzone) or a knob no room has an opinion about. **Unmarked is the default**, so a knob added later stays local until somebody decides otherwise, which is the safe direction to fail in | No — a field nothing reads yet |
| **C2** | **The routes.** `GET /api/config` answers the server-scoped entries and their live values; `POST /api/config` puts one key through `setConfig`, refusing anything not marked. **Inside `apiRoute`, above its 404 catch-all** — that function handles every `/api/` path and swallows the rest, so a route added below the outer method guard is unreachable for GET as well as POST (verified: `POST /api/config` against the running server answers 404 from `apiRoute`, not 405) | **Yes.** `server.mjs` serves the whole repo at the deployed URL, so this alone opens an unauthenticated write endpoint on a live deployment. It cannot land as a no-behaviour slice, and approximation 1 is why that is accepted rather than fixed |
| **C3** | **The editor points at a server.** `editor.html?server=1` fetches its values from C2 and sends changes there; no query string is today's localStorage behaviour, unchanged. Four sites know, not one — see Where the code goes. **`Export JSON ▾` serves the SERVER's values in this mode**, which is what closes the design's permanence loop: the button's whole job is to hand over JSON to paste into `src/game/config.js` defaults, and reading the browser's object on a page showing the server's would hand over the wrong numbers silently. `GET /api/config` already returns them, so this is a source swap rather than a feature. **Import and Reset are disabled**, because both write to the browser and a Reset in particular would refresh the sliders and look like it had worked | Yes. A knob dragged here changes a running server |

## Reuses

| What | Where | Used for |
|---|---|---|
| **`setConfig` already works in node, unchanged** | `src/game/config.js` | Verified by running it in a bare process: unknown keys dropped (`if (!item) return`), values coerced to type and clamped to range (`gravity` 99999 → 4000, `"false"` → `true`, an unknown enum → the default), the live object mutated **in place** so every importer sees it, and `persist()` reaching `writeStore`, which is guarded on `typeof localStorage` and is a silent no-op. In-memory mutation with no persistence is not built here; it is what that function does when nothing is listening |
| `SCHEMA` | `src/game/config.js` | Already the single place a knob is declared, with label, type, range and default. `scope` is one more field on an entry, which is the convention `CLAUDE.md` states for adding anything tunable |
| `controlsHTML` / `controlsTabsHTML` / `bindControls` | `src/editor/controls.js` | The whole screen. Data in, a callback out, no knowledge of storage — which is why C3 is a branch rather than a second renderer |
| `item.default` | `src/game/config.js` | What the "you changed this" dot compares against. **Not `isDefault`**, which takes one argument and reads the module-local `config` — over a server the page holds values from a different machine, and `isDefault` of an unknown key returns `true`, so a server key the browser lacks would read as unchanged rather than as an error |
| The `/api` shape and its 404 | `server.mjs` | `apiRoute` handles every `/api/` path and ends in a catch-all 404. Routes go inside it, above that line — a route added below the outer method guard instead would be unreachable |
| **A real server, spawned** | `test/mission-net.test.mjs` | It already starts `server.mjs` on its own port and drives it over HTTP — the instrument exists, and `test/service.test.mjs` is not it, speaking no HTTP at all. **Two constraints on using it.** The spawn lives inside `twoSeatDrive()`, which returns a SKIP when `globalThis.WebSocket` is absent, so route cases nested there vanish silently on an older node — they need their own spawn or a hoisted one. And the suite is the parent process with no handle on the child's `config`; it says so itself about `leadVisibility`. The assertable claim is POST-then-GET **through the routes**, which is weaker than "a change lands on the live object" and is what the cases must say |
| `exportConfig` | `src/game/config.js` | Permanence — but only for local values. See Approximations |

## Where the code goes

| Path | Change |
|---|---|
| `src/game/config.js` | `scope: "server"` on the entries **only** a room reads. Also the `missionSnapshotHz` help text, which currently states as fact that a room reads built-in defaults and that changing it "moves your own view of nothing" — true today, false the moment C2 lands, and `server.mjs` reads that knob live inside the step loop |
| `server.mjs` | The two routes, inside `apiRoute` |
| `src/editor/remote-config.js` (new) | The browser half — fetch the values, post a change, debounce a drag. Its own module so `editor.js` gains a call rather than a fetch, and so a suite can drive it |
| `src/editor/editor.js` | **Four sites, not one.** The group filter is at the `controlsTabsHTML` call — in server mode it hands over only groups with a server-scoped knob left in them, so an empty group never becomes a tab. `bindControls`'s callback (where a change goes); `settingsView`'s `controlsTabsHTML` call (where values and the default-comparison come from); the `reset`/`export`/`import` handlers, which act on the local config and are wrong in server mode; and the `<p class="ed-note">`, which says "Changes save to this browser instantly" and in server mode must instead say three things: which server this is, that a change is live on it NOW, and that it is **lost when that server restarts unless the exported JSON is committed into `src/game/config.js` and deployed**. That last clause is the point — a person who tunes for an hour and redeploys has to know beforehand, not afterwards. Also **`render()` is synchronous** and called at module load, so a fetch means a two-pass render or an async one — the branch is not a line |
| `src/editor/sound-page.js` | Nothing, and that is the decision: the Sound group is filtered out of the Settings tab and written by its own `bindControls`. The buses are viewer state — a room never plays sound — so they stay local and unscoped |
| `test/mission-net.test.mjs` | C2, asserted through the routes rather than about the child's memory: a GET returns the scoped entries, a POST then a GET shows the new value, an unmarked key is refused, an out-of-range value comes back coerced, and an unknown key is a 400. **Unknown must be `setConfig(...) === undefined`**, never falsy — `false` and `0` are legal values |
| `server.mjs`, `test/mission-net.test.mjs`, `tech/multiplayer-missions.md` | Three comments C2 falsifies, all saying a room reads built-in defaults and nothing can change them: `server.mjs`'s snapshot-rate note, the suite's own note that `leadVisibility` is unreachable in the server's process, and `tech/multiplayer-missions.md` approximation 5 — **the approximation this feature closes out**, which `CLAUDE.md` requires editing in the same commit |

Conventions from `CLAUDE.md` that bind: no dependencies; **everything tweakable
in the editor**, which this extends to the one surface it does not reach; and
every `localStorage` access guarded, which is what makes `setConfig` usable here
at all.

## The seam

**Owns:** the `scope` field, the two routes, and where the editor's Settings tab
reads and writes.

**The room's config is the room's, and a viewer's is the viewer's.** Since J8 the
simulation runs in the room and the drawing runs in a browser, so `src/mission/`
is split across two machines and a knob's home is decided by which half reads
it, not by which folder it lives in. `scope` is that decision written down.

**Must not touch:**

| Boundary | Why |
|---|---|
| `src/editor/controls.js` | It renders a schema and calls back. A renderer that learns about servers has to learn about every future source |
| `setConfig`'s behaviour | Coercion, unknown-key handling and in-place mutation are what make this small. A route that validates separately is a second opinion about the schema |
| The campaign and mission channels | `/api/command`, `/api/stream` and the mission socket are unchanged. A settings change is not a command and never reaches the session |
| **A knob read on BOTH machines** | There is exactly one and it was fixed rather than scoped: `aimMode` was read by the browser to pack aim and by the room to interpret it, so a room's copy silently killed a keyboard commander's aim. The room no longer reads it. **A knob in this position must be removed from one side, never marked `server`** — scoping it would force two commanders to agree about their own hands |
| Single-player | No query string: the editor writes localStorage exactly as today |

## Must not regress

| Suite | What it guards |
|---|---|
| `test/mission-net.test.mjs` | The mission wire, and the spawned server. C2 adds routes beside the ones it already drives; a settings change must not appear as an input |
| `test/service.test.mjs` | The rooms registry, its tokens and its per-seat push. Untouched — it speaks no HTTP |
| `test/tools.test.mjs` | **The Settings tab itself.** It duplicates `editor.js`'s Sound filter and asserts `controlsTabsHTML` renders one tab and one panel per group, one row per knob, and flags only the changed group. It is the suite C3's rendering change reddens, not a bystander |
| `test/session.test.mjs` | Its source scan covers `src/game/session.js` and `src/net/rooms.js` — no DOM global, no `localStorage`. Nothing here goes in either |
| `test/audio.test.mjs` | The cue bank and the schema's Sound group. It does **not** import `src/editor/sound-page.js`; that mount is guarded by `test/tools.test.mjs` |
| `test/docs.test.mjs` | Citations and the seven parts |

**Where the bar cannot see this.** `src/editor/editor.js` is imported by no
suite, so C3's branch is guarded by opening the page — including the case that
matters, which is that the plain URL still writes localStorage.

## Approximations

| # | Where it is not exact | What catches the failure |
|---|---|---|
| 1 | **The endpoint is open, and that is Bo's decision rather than an oversight.** A seat token would prove nothing: `POST /api/rooms` is unauthenticated by design — that is how the lobby works — so anyone who finds the URL can mint themselves a valid token in one request. The token is self-issuing, so a check on it is theatre. What actually protects this is that it is a two-player game on a URL nobody has, and the worst case is a restart | Nothing, deliberately. The real fix if it is ever wanted is a shared secret in a Fly env var, not a seat token |
| 2 | **Import and Reset stay local and are disabled in server mode; Export is not.** Both write to the browser: `importConfig` fills the local object and its storage, and `resetConfig`'s `writeStore({})` is a no-op in node, so over a wire a Reset would refresh the sliders and look like it had worked while the server kept its values. Export is the exception because it is the design's only permanence path — see C3 — and because the route already returns what it needs. Export emits the browser's values, Import writes the browser's, Reset calls `resetConfig` — whose `writeStore({})` is a no-op in node, so over a wire it would look like it worked. The design's permanence story is Export → paste into source, and in server mode that exports the wrong machine | C3 disables all three when a server is attached, which is smaller than making them work and is honest about which machine you are looking at |
| 3 | **One server, one set of values.** A second room shares them, so a change made for one campaign lands in the other. Fine on one machine, which is what `fly scale count 1` leaves running — `min_machines_running = 0` is a floor and not a cap, and `fly.toml` says so | Nothing at this scale. `tech/multiplayer-missions.md` approximation 10 already says one process owns a match |
| 4 | **Settings die with the process, and the screen does not say so.** A tuning session is lost to a deploy | Nothing. Recorded because "I set that yesterday" is how it will be discovered |
| 5 | **A slider drag is one POST per pixel.** `bindControls` fires on every `input` event of a range, which over HTTP is a burst of unordered fetches for one drag. C3 debounces and sends the last value; ordering between two people dragging the same knob is still last-write-wins with no notification | The debounce is C3's, and it is the one piece of the browser half that is not a straight substitution |
| 7 | **An empty group is dropped, not rendered blank (Bo).** In server mode "Viewport", "Sound", "Hub ambience" and "Player2 / AI" hold no server-scoped knob, so the tab strip is six tabs rather than ten. `controlsTabsHTML` renders one tab per group it is HANDED, so the filtering happens at the call site and that function is untouched — which also keeps `test/tools.test.mjs`'s one-tab-per-group assertion true of both modes | `test/tools.test.mjs` pins the local case; a server-mode case beside it pins that a group with nothing in it does not appear |
| 8 | **`?server=1` means same origin, and that is not always the server.** The editor can only tune the process that served it, so `editor.html?server=1` opened under `python3 -m http.server` — the documented way to run this locally — posts at something with no `/api`. Either the flag carries a base URL or the page fails visibly rather than silently | Nothing yet. `src/editor/remote-config.js` owns it and the brief above does not mention it |
| 6 | **The changed-dot is already wrong locally, and this does not fix it.** `mark()` only adds the `.changed` class and never removes it, so a value changed and changed back keeps its dot today, with no server involved | Named so nobody attributes it to the wire |

## Background

### Why this is two routes rather than a feature

The screen exists: `src/editor/controls.js` renders every group in the schema,
marks what differs from default, and hands changes to a callback — written that
way for the local case, before any of this. The setter exists, and because this
repo guards every storage access it already behaves correctly in a process that
has none: it validates, it mutates in place, and its attempt to persist quietly
does nothing.

What was missing was never a dashboard. It was that the two halves sit on
different machines, that nothing carried a value between them, and that nothing
said which knobs were allowed to make the trip.
