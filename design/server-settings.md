---
type: design
category: development-tools
status: unbuilt
resolution: sharp
related: [multiplayer, multiplayer-service, multiplayer-missions]
---

# Server settings

The Settings tab, pointed at a running server instead of at this browser.

A deployed room simulates the mission, so it is the server's settings the game
obeys and nobody's browser settings apply. Without this there is no way to
change them: the server has no storage to read overrides from, so it plays on
built-in defaults and the editor tunes a copy of the game nobody is in.

| | |
|---|---|
| What it shows | Every knob in the config schema, the same ones the editor's Settings tab shows |
| Where | The editor's Settings tab, opened against a server rather than this browser |
| Who may change them | Anyone holding a seat token for that server. Not a stranger who found the URL |
| Scope | The whole server. Not per room, and not per commander |
| When a change takes effect | Whenever the game next reads that value. Some are read every shot, some at the start of a mission, some at the start of a campaign |
| Lifetime | The server process. A restart or a deploy returns it to built-in defaults |

## When a change lands

A knob changes as soon as something looks at it again, which is not the same
moment for every knob and is not a rule anyone enforces.

| Read | Lands |
|---|---|
| Every shot — friendly fire, squad damage, aim spread | Immediately, mid-mission |
| Once per mission — gravity, and anything the level is built from | The next mission |
| Once per campaign — the board's size, arrival rate, seeding | The next campaign |

A player will therefore see some sliders move the game under them and others do
nothing until they deploy. That is the honest behaviour and the screen does not
pretend otherwise.

## Making a change permanent

The dashboard tunes a session. A value that should outlive the process is
exported as JSON and pasted into the config schema in source, which is how every
other editor-authored change in this repo becomes permanent.

## Not in this design

Named so they read as absent rather than overlooked.

| | |
|---|---|
| Per-room settings | One server, one set of values. Two rooms on one process share them |
| Settings that survive a restart | The campaign does not either |
| A host or an owner | Every seat token is equal. There is nobody a setting belongs to |
| A record of who changed what | |
| Changing settings from inside the game | The editor is where settings live, as it is for everything else |
