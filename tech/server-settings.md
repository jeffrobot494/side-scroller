---
type: tech
category: development-tools
status: unbuilt
resolution: sharp
needs: [multiplayer-service]
related: [multiplayer-service, multiplayer-missions]
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
| **C3** | **The editor points at a server.** `editor.html?server=1` fetches its values from C2 and sends changes there; no query string is today's localStorage behaviour, unchanged. Four sites know, not one — see Where the code goes. **`Export JSON ▾` serves the SERVER's values in this mode**, which is what closes the design's permanence loop: the button's whole job is to hand over JSON to paste into `src/game/config.js` defaults, and reading the browser's object on a page showing the server's would hand over the wrong numbers silently. `GET /api/config` already returns them, so this is a source swap rather than a feature. **`▴ Import JSON` posts to the server too** — the pasted object is parsed and validated locally against the schema, then sent key by key, so an import is a batch of the same writes a slider makes and needs no second route. It reports how many applied, as it does now, and **silently drops anything not server-scoped** rather than refusing the paste, because the JSON a person has is an Export of a whole config and refusing it over one viewer knob would make the round trip useless. **Reset stays disabled**: it writes to the browser, and over a wire it would refresh the sliders and look like it had worked while the server kept every value | Yes. A knob dragged here changes a running server |

## Reuses

| What | Where | Used for |
|---|---|---|
| **`setConfig` already works in node, unchanged** | `src/game/config.js` | Verified by running it in a bare process: unknown keys dropped (`if (!item) return`), values coerced to type and clamped to range (`gravity` 99999 → 4000, `"false"` → `true`, an unknown enum → the default), the live object mutated **in place** so every importer sees it, and `persist()` reaching `writeStore`, which is guarded on `typeof localStorage` and is a silent no-op. In-memory mutation with no persistence is not built here; it is what that function does when nothing is listening |
| `SCHEMA` | `src/game/config.js` | Already the single place a knob is declared, with label, type, range and default. `scope` is one more field on an entry, which is the convention `CLAUDE.md` states for adding anything tunable |
| `controlsHTML` / `controlsTabsHTML` / `bindControls` | `src/editor/controls.js` | The whole screen. Data in, a callback out, no knowledge of storage — which is why C3 is a branch rather than a second renderer |
| `item.default` | `src/game/config.js` | What the "you changed this" dot compares against. **Not `isDefault`**, which takes one argument and reads the module-local `config` — over a server the page holds values from a different machine, and `isDefault` of an unknown key returns `true`, so a server key the browser lacks would read as unchanged rather than as an error |
| The `/api` shape and its 404 | `server.mjs` | `apiRoute` handles every `/api/` path and ends in a catch-all 404. Routes go inside it, above that line — a route added below the outer method guard instead would be unreachable |
| **A real server, spawned** | `test/mission-net.test.mjs` | It already starts `server.mjs` on its own port and drives it over HTTP — the instrument exists, and `test/service.test.mjs` is not it, speaking no HTTP at all. **Two constraints on using it.** The spawn lives inside `twoSeatDrive()`, which returns a SKIP when `globalThis.WebSocket` is absent, so route cases nested there vanish silently on an older node — they need their own spawn or a hoisted one. And the suite is the parent process with no handle on the child's `config`; it says so itself about `leadVisibility`. The assertable claim is POST-then-GET **through the routes**, which is weaker than "a change lands on the live object" and is what the cases must say |
| `exportConfig` | `src/game/config.js` | The LOCAL path only. Server mode does not call it — Export prints the `GET /api/config` payload, because the values on screen are the server's. Listed so nobody wires the button to this function and gets the wrong machine's numbers |

## Where the code goes

| Path | Change |
|---|---|
| `src/game/config.js` | `scope: "server"` on the entries **only** a room reads. Also the `missionSnapshotHz` help text, which currently states as fact that a room reads built-in defaults and that changing it "moves your own view of nothing" — true today, false the moment C2 lands, and `server.mjs` reads that knob live inside the step loop |
| `server.mjs` | The two routes, inside `apiRoute` |
| `src/editor/remote-config.js` (new) | The browser half — fetch the values, post a change, post an import (a batch of the same posts, reported as one count), debounce a drag. Its own module so `editor.js` gains a call rather than a fetch, and so a suite can drive it |
| `src/editor/editor.js` | **Five sites, not one.** The group filter is at the `controlsTabsHTML` call — in server mode it hands over only groups with a server-scoped knob left in them, so an empty group never becomes a tab. `bindControls`'s callback (where a change goes); `settingsView`'s `controlsTabsHTML` call (where values and the default-comparison come from); the `reset`/`export`/`import` handlers, which act on the local config and are wrong in server mode; and the `<p class="ed-note">`, which says "Changes save to this browser instantly" and in server mode must instead say three things: which server this is, that a change is live on it NOW, and that it is **lost when that server restarts unless the exported JSON is committed into `src/game/config.js` and deployed**. That last clause is the point — a person who tunes for an hour and redeploys has to know beforehand, not afterwards. Also **`render()` is synchronous** and called at module load, so a fetch means a two-pass render or an async one — the branch is not a line |
| `src/editor/sound-page.js` | Nothing, and that is the decision: the Sound group is filtered out of the Settings tab and written by its own `bindControls`. The buses are viewer state — a room never plays sound — so they stay local and unscoped |
| `test/mission-net.test.mjs` | C2, asserted through the routes rather than about the child's memory: a GET returns the scoped entries, a POST then a GET shows the new value, an unmarked key is refused, an out-of-range value comes back coerced, an unknown key is a 400, and **a whole exported config posted back applies its server-scoped keys and drops the rest without failing**. **Unknown must be `setConfig(...) === undefined`**, never falsy — `false` and `0` are legal values |
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
| `test/tools.test.mjs` | The Settings tab's RENDERER. It duplicates `editor.js`'s Sound filter and asserts `controlsTabsHTML` renders one tab and one panel per group, one row per knob, and flags only the changed group. **It imports `controls.js` and never `editor.js`**, and C3 leaves `controlsTabsHTML` untouched — so it guards that the renderer still behaves, and nothing about which groups the editor hands it |
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
| 2 | **Reset is disabled; Export and Import cross.** `resetConfig` writes to the browser and its `writeStore({})` is a no-op in node, so over a wire it would refresh the sliders and look like it had worked while the server kept every value. Export crosses because it is the design's only permanence path; Import because a config that can be read out and not put back is a one-way trip. **`importConfig` itself is NOT reused over the wire** — it writes the local object — so the browser half parses, validates against the schema, and posts each key | The routes' own suite for what lands; nothing for what the browser drops before posting — see approximation 9 |
| 2b | **AN IMPORT IS A WHOLE-CONFIG OVERWRITE, AND IT IS A SERVER-WIDE RESET BY ANOTHER NAME.** `exportConfig` is `JSON.stringify(config)` — measured, **all 71 keys, defaults included**, not the non-default subset `persist()` writes. So posting an export back writes EVERY server-scoped key, not the ones somebody changed. Import a file taken from a laptop that never opened Settings and every room knob on a server tuned for an hour is silently set to that laptop's defaults, reported as "Imported N setting(s)". That is exactly the failure Reset is disabled to prevent, reachable while the button labelled Reset is greyed out | Nothing, and **accepted by Bo rather than left open**. It is a dev tool with one user, and "do not paste a stale config" is a rule a person can hold. Recorded at this length because it is the one thing here that destroys work rather than confusing somebody, and because the two ways out are known if it ever bites: make `exportConfig` emit `persist()`'s non-default subset so a paste says "set these five" rather than "set everything", or confirm the count before applying |
| 9 | **The browser's drop rule has no test.** C3 decides which pasted keys are server-scoped and posts only those; that lives in `src/editor/remote-config.js`, which no suite in Must not regress owns, and `test/mission-net.test.mjs` is a node HTTP suite that cannot drive a browser module. The routes' refusal of an unmarked key IS tested; the browser silently not sending it is not | Nothing yet |
| 10 | **The tab index is positional and the list shrinks.** `settingsTab` is an index into whatever group array was rendered, and `showControlsTab` only clamps. Index 3 is "Viewport" locally and "Campaign" in server mode, so a two-pass render that draws the local nine and then the server six moves the tab under a click, silently | Nothing. Named because both the two-pass render and the shrinking list are this spec's, and neither row mentions the other |
| 11 | **An import is N sequential POSTs and is not atomic.** One failure leaves the server half-imported with "Imported N setting(s)" as the only feedback, and the count means something different from the local one — locally a full export reports 71, over the wire only the server-scoped subset, with nothing naming what was dropped | Nothing |
| 12 | **The Behavior Lab is a third config surface and writes server-scoped knobs.** `src/editor/tools/behavior-lab.js` renders the "Movement / feel" group through `controlsHTML` and writes with `setConfig` — gravity, run speed, jump speed, the whole duck family, thirteen knobs C1 marks `server`. Its own comment says moving one there moves it everywhere, which C2 falsifies for a room. This spec leaves it local and does not point it at a server | Nothing. `editor.html?server=1` therefore ships two config surfaces disagreeing about which machine a knob lives on |
| 3 | **One server, one set of values.** A second room shares them, so a change made for one campaign lands in the other. Fine on one machine, which is what `fly scale count 1` leaves running — `min_machines_running = 0` is a floor and not a cap, and `fly.toml` says so | Nothing at this scale. `tech/multiplayer-missions.md` approximation 10 already says one process owns a match |
| 4 | **Settings die with the process.** A tuning session is lost to a deploy. The screen now says so — one of the ed-note's three jobs in C3 — so what is left is that nobody reads a note | Nothing beyond the note |
| 5 | **A slider drag is one POST per pixel.** `bindControls` fires on every `input` event of a range, which over HTTP is a burst of unordered fetches for one drag. C3 debounces and sends the last value; ordering between two people dragging the same knob is still last-write-wins with no notification | The debounce is C3's, and it is the one piece of the browser half that is not a straight substitution |
| 7 | **An empty group is dropped, not rendered blank (Bo).** The strip is **nine** groups today — `editor.js` already filters Sound out, which is not something server mode does — and server mode drops three more that hold no server-scoped knob: Viewport, Hub ambience, Player2 / AI. Nine to six. **The filter must rebuild each group with a filtered `items`, not filter the group array**: `groupHTML` renders `group.items` verbatim, so keeping a group whole because it has one server knob leaks nine viewer knobs into the kept tabs — including `soldierBaseHp`/`soldierHpPerHealth`, which C1 refuses to scope, and `aimMode`, which the seam says must never be scoped, drawn as live sliders posting to a server that refuses them | Nothing. `test/tools.test.mjs` cannot see this: it imports `controls.js`, never `editor.js`, so a case there filters `SCHEMA` itself and asserts the renderer rendered what it was handed — circular |
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
