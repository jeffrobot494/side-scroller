---
type: design
category: development-tools
status: unbuilt
resolution: sharp
sprint: 2026-08
---

# Behavior Lab

A place to watch one agent navigate.

| | |
|---|---|
| Level | Randomly generated. Reload for a new one |
| Agent | One, drawn as a soldier, starting on a random node |
| Input | Click anywhere in the level to set that point as its goal |
| Then | Watch it get there, and stop on arrival |
| Combat | None |

## View

Levels are 4800–8200px wide against a viewport around a tenth of that, so the
level does not fit and is never scaled to fit — shrinking it that far makes the
agent unreadable.

| | |
|---|---|
| Camera | Never follows the agent |
| Pan | Mouse wheel. Up pans left, down pans right |
| Vertical | None needed — the level is 540px tall and fits |

## Overlays

Two toggles, off by default.

| Toggle | Shows |
|---|---|
| Graph | The nav graph — every standable node and the moves between them |
| Path | The route the agent picked to its current goal |

## Editing the level

| | |
|---|---|
| Drag | Click and drag any platform to move it in x and y |
| Effect | The nav graph rebuilds, and the agent repaths from where it is |
| Consequence | Dragging voids the generator's traversability guarantee — a platform can be dragged out of reach, and the agent should then behave as it does for any unreachable goal |

## Tuning

| Knob | |
|---|---|
| Jump strength | `config.jumpSpeed` |
| Run speed | `config.runSpeed` |
