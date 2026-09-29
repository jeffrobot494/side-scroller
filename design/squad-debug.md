---
type: design
category: development-tools
status: unbuilt
resolution: sharp
related: [squad-survival, soldier-behavior, pause-menu]
---

# Squad debug view

A developer view inside a mission that shows what each squadmate perceives, what it decided, and why — so its behaviour can be watched and judged in play.

## Availability

| | |
|---|---|
| **Gate** | Exists only while debug overlays are enabled in the settings. Disabled, every key below does nothing |
| **Where** | Single-player and hot-seat missions. A shared (room) mission has none of it |
| **Who it shows** | Every AI-driven squadmate. The soldier you are driving is never annotated |
| **Default** | Every layer starts off at the start of each mission. Slow motion starts at full speed |
| **Keys** | Each layer and each control has its own rebindable key |

## Layers

Each layer is toggled on its own and drawn on top of the play space.

| Layer | Shows |
|---|---|
| **Threats** | A line from every hostile that can hit a squadmate where it stands, to that squadmate. A hostile that can see it but cannot hit it draws no line |
| **Spot choice** | The last time a squadmate picked where to stand — a fighting spot or a cover spot — every spot it weighed, coloured from best to worst, with the chosen one marked. Staying put is shown as one of the options. Each spot is labelled with its parts: travel, danger, shot, crowding. Held until its next pick |
| **Dodges** | A short tag over a squadmate for every round it judged a threat, held about a second |

### Dodge tags

| Tag | Meaning |
|---|---|
| **DUCK** | It chose to kneel |
| **JUMP** | It chose to jump |
| **CAN'T** | Neither kneeling nor jumping would have avoided the round |
| **MISSED** | A dodge would have worked; it did not react |
| **LATE** | It reacted, and the round arrived before the dodge happened |

A round it did not need to dodge gets no tag.

## Pause on death

| | |
|---|---|
| **When** | An AI-driven squadmate dies |
| **What happens** | The mission freezes on the frame of the death, with every active layer still drawn as it was at that moment |
| **Death card** | Over the frozen frame: who died, what killed it, what it was doing and for how long, its health before the killing hit, how many hostiles could hit it where it stood, and the dodge tag for the killing round (or that it had none) |
| **Resume** | The pause key dismisses the card and the mission carries on. The pause menu does not open |
| **Setting** | On or off in the settings; kept between missions |

## Slow motion

| | |
|---|---|
| **Speeds** | Full, half, quarter. One key cycles them |
| **Shown** | The current speed is printed on screen whenever it is not full speed |
| **Same mission** | Slowed time plays out exactly as it would at full speed |

## Does not cover

| | |
|---|---|
| **Frame stepping** | No advancing a paused mission one frame at a time |
| **Danger maps** | No shading of the whole level by exposure, and no colouring of routes by danger |
| **Recording** | Nothing is saved; a death card is gone once dismissed |
| **Enemies** | Enemy minds are not shown |
| **Orders** | Nothing here changes what a squadmate does |
