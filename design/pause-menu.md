---
type: design
category: scenes
status: built
resolution: sharp
related: [missions]
---

# Pause menu

A menu opened during a mission, with the settings that take effect immediately.

## Opening it

| | |
|---|---|
| Key | Escape, during a mission |
| Debug key | `` ` `` opens the menu straight onto the Debug screen, while debug overlays are on and never in a room mission |
| Where | Missions only |

## The menu

| Item | Does |
|---|---|
| Options | Opens the options screen |
| Debug | Opens the Debug screen (`design/squad-debug.md`). Present only while debug overlays are on, and never in a room mission |
| Resume | Closes the menu and returns to the mission |

Nothing else is on it.

## The options screen

Every setting that takes effect immediately, adjustable in place. Grouped by the
categories the editor's Settings tab uses.

| Category | Settings |
|---|---|
| Viewport | Camera zoom · Mission view · Scanlines (3D) · Scanline spacing · Laser sights (3D) · Ground mist (3D) · Capes (3D) · Enemy effects (3D) · Show FPS · Debug overlays in missions · Pause on squadmate death |
| Sound | Master volume · Effects volume · Interface volume · Music volume · Mute when unfocused · Stereo width · Audible range · Max simultaneous sounds |
| Controls / aim | Aim mode · Gamepad deadzone · Aim spread · Reload move speed × |
| Combat | Friendly fire · Squad damage × |
| Movement / feel | Gravity · Run speed · Jump strength · Enemy jump strength · Coyote time · Knockback decay · Duck hold · Duck lookahead · Duck chance @ Speed 1 · Duck chance @ Speed 10 · Duck latency @ Speed 1 · Duck latency @ Speed 10 |
| Agent navigation | Arrival radius · Takeoff window · Repath interval · Jump attempts before avoiding a connection · Ranged repositioning · Reposition commitment · Stall before repositioning |
| Squad survival | Wounded below · Under fire: hurt window · Under fire: lookahead · Calm after · Leash · Leash margin · Move when exposed to · Spot: cost per hostile · Spot: worth of a shot · Spot: cost per ally · Spot: ally claim radius · Spot: margin to move · Cover: how far · Cover: cost per hostile · Lobber reach: fan width · Lobber reach: angles tried · Melee reach · Flight test step · Route: cost per hostile · Route: margin to switch |

Settings that only apply on the next mission, and campaign, generation, base and
tool settings, are not shown.

## In a room mission

Settings the room owns are not shown. What remains is Viewport, Sound, Aim mode
and Gamepad deadzone.

While the menu is open, your soldier takes no input from you.

## Accepted consequences

| | |
|---|---|
| Gravity, Run speed, Jump strength | Changing any of them mid-mission can leave parts of the level out of reach |

## While the menu is open

| | |
|---|---|
| Single-player | The mission is paused |
| Room mission | The mission keeps running |

## Closing it

| | |
|---|---|
| Escape | Closes the menu |
| `` ` `` | Closes the menu, from any screen, wherever it can open it |
| Resume | Closes the menu |
| Options screen | Has a Back button that returns to the menu |
| Debug screen | Has a Back button that returns to the menu |

## How long a change lasts

A change is kept, exactly as a change in the editor's Settings tab is.

## Gamepad

The menu is not navigated with a gamepad.
