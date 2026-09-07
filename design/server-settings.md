---
type: design
category: development-tools
status: built
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
| What it shows | The knobs ONLY a room reads — friendly fire, gravity, damage, movement, the squad's reflexes, navigation, the board. Not the ones a browser also reads |
| Where | The editor's Settings tab, opened against a server rather than this browser |
| Who may change them | Anyone who can reach the server. Nobody owns a setting and nothing is asked of whoever changes one |
| Scope | The whole server. Not per room, and not per commander |
| When a change takes effect | Whenever the game next reads that value. Some are read every shot, some at the start of a mission, some at the start of a campaign |
| Lifetime | The server process, unless the change is made permanent. A restart or a deploy returns it to the built-in defaults |

## When a change lands

A knob changes as soon as something looks at it again, which is not the same
moment for every knob and is not a rule anyone enforces.

| Read | Lands |
|---|---|
| Every shot — friendly fire, squad damage, aim spread | Immediately, mid-mission |
| Once when a mission is loaded — gravity | The next mission |
| Once when a LEAD is born — the terrain knobs, the threat scale | Only on leads that arrive afterwards. A lead already on the board keeps the level it was generated with |
| Every day advance — how many leads arrive, and the ceiling they cannot cross | The next day |
| Once when a campaign opens — how many leads it starts with | The next campaign |

A player will therefore see some sliders move the game under them, some do
nothing until they deploy, and some do nothing to work already sitting on the
board. That is the honest behaviour and the screen does not pretend otherwise.

## Whose setting is it

A room simulates and a browser draws, so a knob belongs to whichever half reads
it. That split is the whole of what this screen may touch.

| | |
|---|---|
| The room's | Anything ONLY the mission or the campaign is run by: friendly fire, gravity, squad damage, movement and jump, the ducking reflexes, navigation, the board's size and arrival rate |
| The viewer's | Anything about looking and listening: canvas size, zoom, the FPS meter, sound volumes, gamepad deadzone, aim mode. A room never draws and never plays a sound, so these stay on the machine that does |
| Read by both | Some settings are consulted on both machines — a soldier's hit points are applied where the mission runs and drawn where the base is. These belong to neither list and this screen does not offer them |

## Making a change permanent

The dashboard tunes a session. A change is live on that server the moment it is
made and is gone when the server restarts.

To keep it, the values the server is running are written into the config schema
in source, and committed — which is how every other editor-authored change in
this repo becomes permanent. The screen says so, beside the sliders, because the
alternative is finding out after a redeploy.

| | |
|---|---|
| Tuning | Live on that server, immediately — by a slider, or by pasting a whole exported set back in |
| Made permanent | The running values written into the config schema in source, in one action, from the screen |
| Restart or redeploy | Back to whatever the source says |
| Committed | The starting point for every server from then on |

## Not in this design

Named so they read as absent rather than overlooked.

| | |
|---|---|
| Per-room settings | One server, one set of values. Two rooms on one process share them |
| Any authentication | Nothing is asked of whoever changes a setting |
| Changing a viewer's settings for them | Volume and zoom are nobody else's business |
| A host or an owner | Every seat token is equal. There is nobody a setting belongs to |
| A record of who changed what | |
| Changing settings from inside the game | The editor is where settings live, as it is for everything else |
