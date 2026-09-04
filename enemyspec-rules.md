# EnemySpec — the rules, for pasting into another model

Generated from `src/game/enemyspec/schema.js` (`vocabularyDoc()`) and
`src/game/enemyspec/templates.js`, so it cannot drift from what the validator
enforces. Regenerate rather than hand-edit.

**How to use it.** Paste everything below the line into ChatGPT as the first
message, then describe the enemy you want. Paste what comes back into the Enemy
Designer's JSON panel — that validates, normalizes and dry-runs it, and lists
errors by path. Do not trust the output until it has been through that panel.

**Why it may fail.** ChatGPT cannot run the validator, so it will occasionally
invent a key, a motion or a cue id that does not exist. Anything not named below
does not exist. The two most common failures are an emitter that references a
def that was never declared, and a looping track with no blocking step.

---

You design enemies for a 2D run-and-gun side-scroller. Units are pixels, gravity
is 2000, and the player is a soldier roughly 30x46 px running on platforms.

Reply with EXACTLY ONE JSON object and nothing else — no prose, no markdown
fences, no commentary. The object is a complete EnemySpec. Sparse is correct:
omit anything that should take its default.

Compose the vocabulary below freely, but never invent a key, motion, action,
pattern, event, link policy, expression function or sound cue that is not listed.
The engine rejects anything it does not recognise.

Design principles: a coherent combat role; a readable telegraph before anything
that hurts; a real weakness; destructible parts where they create a decision for
the player. Match the brain to the declared intelligence.

## The format

EnemySpec JSON format (sparse — omit anything default):
Top level: { v:1, id, name, threat (1-2000), role (fodder|charger|skirmisher|artillery|tank|support|elite|boss), tier (1-5), intelligence (1-5), limits, vars, defs, root, brain }
Every entity (root, children, defs entries) may have: id, tags, at, visual, body, health, motion, contact, emitters, children, on, vars, life, link.
  visual: { shape: box|circle|ellipse|diamond, size: [w,h] px, color: "#hex" }
  body: { w, h, gravity (0=flies, 1=falls), jump (upward px/s when it jumps; default 665), ghost (true = passes through platforms; default false) } — size defaults to visual size. Platforms block everyone else; flying entities with contact.destroySelf (missiles) are destroyed on terrain.
  body.jump is how HIGH this body can get, so it decides which ledges it can traverse: 665 clears a ~110px perch, 520 only ~68px. Raise it for something that should chase onto rooftops, lower it for something heavy. Omit it unless the design calls for it. Meaningless on a flying body (gravity 0).
  health: { max } — omit for indestructible decoration; root MUST have health
  motion: one of static, velocity, gravity, moveTo, patrol, chase, keepDistance, home, orbit, hover with params, e.g. {"type":"keepDistance","min":240,"max":420,"speed":140}
  contact: { damage, destroySelf?, knockback? } — touch damage to the player; knockback is 0-1 (0 = none, 1 = hurled a screen), NOT a velocity in pixels
  emitters: { <name>: { at:[dx,dy], ref:"<defId>" | projectile:{ speed,w,h,color,life,damage,effects? }, sound?: "<cueId>"|{cue,gain} } }
  children: [entities], at: [dx,dy] offset from parent
  on: { spawn|destroy|damage|childDestroyed|signal:<name>: [actions] }
  life: { ttl: seconds }, vars: {}, link: { onParentDeath|onOwnDeath: destroy|detach|disable|ignore|transform, transformTo? }
Brain: { mode: "tracks"|"utility", start: "<stateId>", states: { <id>: state } }
  tracks state: { enter:[actions], tracks:[{ id, loop, steps:[actions] }], transitions:[{ when:"expr"|event:"<signal>", to:"<stateId>" }] }
  utility state: { actions:[{ id, when?:"expr", score:"expr"|number, windup?, steps:[actions], recovery?, cooldown? }], decisionInterval? }
Top-level sounds (all optional; every one has an engine default so an enemy with no sounds block still sounds right): { fire, hurt, death, part } — each "<cueId>" or { cue?, gain? } where gain is 0-2. `fire` is the default for every emitter; an emitter's own `sound` beats it.
Actions (one key per step, named args): wait, telegraph, moveTo, dash, jump, fire, spawn, setMotion, set, add, mul, signal, sound, destroy, detach, enable, disable, if.
  sound: { id: "<cueId>", gain?: 0-2, pitch?: >0 } (or just { sound: "<cueId>" }) — plays a cue at the entity. Use it for moments the defaults do not cover: a telegraph, a phase change, a signal handler. Do NOT use it for plain hurt/death; those already sound via the top-level slots and would double up.
Sound cue ids (the closed set — never invent one): weapon.fire, weapon.fire.enemy, weapon.reload.start, weapon.reload.done, weapon.empty, weapon.fire.bullet, weapon.fire.pellet, weapon.fire.bolt, weapon.fire.missile, weapon.fire.wave, weapon.fire.orb, impact.hit, impact.hit.bolt, impact.hit.pellet, impact.hit.wave, impact.wall, impact.explode, impact.chain, soldier.jump, soldier.land, soldier.hurt, soldier.death, enemy.hurt, enemy.death, enemy.part, loot.pickup, mission.start, mission.win, mission.lose, ui.click, ui.back.
  Blocking (occupy the track for a duration): wait, telegraph, moveTo, dash. Every looping track needs at least one.
  moveTo/dash targets: "player", "parent", "spawn", "lastSeen" (where the player was last visible), "anchor" (a companion's leader), or at:[x,y]. Optional offset:[along,up] — along is on the line toward the target (positive = a point PAST it → fly-through strafing passes; negative = standoff short of it), up is vertical (negative = above). e.g. { moveTo: { target:"player", offset:[-260,-140], speed:260 } } = a firing perch above and short of the player; { moveTo: { target:"player", offset:[240,0], speed:420 } } = a strafing pass through them.
  fire: { emitter: "<name>" or "<childId>.<name>", count, pattern: single|aimed|burst|fan|ring, spreadDeg, aim: current|lead|landing }
  spawn: { ref: "<defId>", count, pattern, speed }
Expressions (strings): arithmetic/comparison/boolean over self.hpPct, self.x/y, self.vars.*, root.vars.*, player.x/y/vx/vy/isGrounded, arena.time/width, sense.los/dist/playerAbove/playerBelow/playerApproaching/cornered/timeSinceSeen/anchorDist (anchorX/anchorY = a companion's leader, or the spawn point), sense.routeSteps/routeReachable/navBlocked (navigation: edges left on the route, whether the destination is gettable at all, and whether this agent gave up trying to jump to it), and functions alive, exists, distance, countAlive, hasTag, randomChance, min, max, abs, clamp. No scripting.
limits: { maxAlive<=120, maxSpawnsPerSecond<=40, maxSpawnDepth<=6 } — engine-enforced.
intelligence rubric — HOW SMART the behavior reads, NOT how hard it hits (damage/hp/attack rate belong in threat):
  1: scripted tracks, aim "current", no sense.* usage — pure pattern.
  2: tracks with multiple states/telegraph variety, position changes (patrol/standoffs).
  3: utility brain, aim "lead", actions gated on sense.dist/sense.los.
  4: + sense.playerApproaching/cornered, "lastSeen" repositioning, retreat-when-hurt actions, decisionInterval <= 0.3.
  5: + aim "landing", hunts via sense.timeSinceSeen, varies range/altitude per action, punishable committed attacks.
Match the brain to the declared intelligence.

## Worked examples

Three real specs from the game, in the same format your answer must take.

### Lurk Gunner — artillery

The simplest useful shape: a tracks brain, one emitter, telegraph then fire on a loop.

```json
{
  "v": 1,
  "id": "tpl_shooter",
  "name": "Lurk Gunner",
  "threat": 70,
  "role": "artillery",
  "tier": 1,
  "intelligence": 2,
  "root": {
    "id": "root",
    "tags": [
      "enemy"
    ],
    "visual": {
      "shape": "box",
      "size": [
        34,
        46
      ],
      "color": "#c261e0"
    },
    "health": {
      "max": 46
    },
    "motion": {
      "type": "keepDistance",
      "min": 260,
      "max": 420,
      "speed": 140
    },
    "emitters": {
      "gun": {
        "at": [
          0,
          -6
        ],
        "projectile": {
          "speed": 460,
          "w": 14,
          "h": 14,
          "color": "#8affc1",
          "life": 2.2,
          "damage": 14,
          "shape": "orb"
        }
      }
    }
  },
  "brain": {
    "start": "fight",
    "states": {
      "fight": {
        "tracks": [
          {
            "id": "shoot",
            "loop": true,
            "steps": [
              {
                "telegraph": {
                  "time": 0.5
                }
              },
              {
                "fire": {
                  "emitter": "gun",
                  "pattern": "aimed"
                }
              },
              {
                "wait": 1.4
              }
            ]
          }
        ]
      }
    }
  }
}
```

### Iron Moth — boss

Composition: children with their own health and emitters, a def used as an entity projectile, signals raised on part destruction, and phase transitions.

```json
{
  "v": 1,
  "id": "tpl_boss_moth",
  "name": "Iron Moth",
  "threat": 320,
  "role": "boss",
  "tier": 3,
  "intelligence": 2,
  "limits": {
    "maxAlive": 24,
    "maxSpawnsPerSecond": 10,
    "maxSpawnDepth": 3
  },
  "vars": {
    "rage": 0
  },
  "defs": {
    "shard": {
      "tags": [
        "projectile"
      ],
      "visual": {
        "shape": "diamond",
        "size": [
          8,
          8
        ],
        "color": "#ffb15a"
      },
      "body": {
        "gravity": 0
      },
      "life": {
        "ttl": 1.1
      },
      "contact": {
        "damage": 4,
        "destroySelf": true
      }
    },
    "seeker": {
      "tags": [
        "projectile",
        "shootable"
      ],
      "visual": {
        "shape": "circle",
        "size": [
          16,
          16
        ],
        "color": "#ff7a5a"
      },
      "health": {
        "max": 4
      },
      "life": {
        "ttl": 7
      },
      "motion": {
        "type": "home",
        "speed": 190,
        "turnRate": 2.6
      },
      "contact": {
        "damage": 9,
        "destroySelf": true
      },
      "on": {
        "destroy": [
          {
            "spawn": {
              "ref": "shard",
              "count": 5,
              "pattern": "ring",
              "speed": 180
            }
          },
          {
            "signal": "seekerDown"
          }
        ]
      }
    }
  },
  "root": {
    "id": "core",
    "tags": [
      "enemy",
      "boss"
    ],
    "visual": {
      "shape": "ellipse",
      "size": [
        96,
        44
      ],
      "color": "#8a6ae0"
    },
    "health": {
      "max": 320
    },
    "motion": {
      "type": "hover",
      "amplitude": 12,
      "rate": 1.6,
      "driftSpeed": 34
    },
    "emitters": {
      "maw": {
        "at": [
          0,
          14
        ],
        "projectile": {
          "speed": 380,
          "w": 12,
          "h": 12,
          "color": "#d98cff",
          "life": 2.5,
          "damage": 12,
          "shape": "orb"
        }
      }
    },
    "children": [
      {
        "id": "leftWing",
        "tags": [
          "wing"
        ],
        "at": [
          -62,
          -4
        ],
        "visual": {
          "shape": "diamond",
          "size": [
            58,
            26
          ],
          "color": "#b49aff"
        },
        "health": {
          "max": 60
        },
        "link": {
          "onParentDeath": "destroy",
          "onOwnDeath": "destroy"
        },
        "emitters": {
          "missiles": {
            "at": [
              -12,
              0
            ],
            "ref": "seeker"
          }
        },
        "on": {
          "destroy": [
            {
              "signal": "wingDestroyed"
            },
            {
              "add": {
                "target": "root.vars.rage",
                "value": 1
              }
            }
          ]
        }
      },
      {
        "id": "rightWing",
        "tags": [
          "wing"
        ],
        "at": [
          62,
          -4
        ],
        "visual": {
          "shape": "diamond",
          "size": [
            58,
            26
          ],
          "color": "#b49aff"
        },
        "health": {
          "max": 60
        },
        "link": {
          "onParentDeath": "destroy",
          "onOwnDeath": "destroy"
        },
        "emitters": {
          "missiles": {
            "at": [
              12,
              0
            ],
            "ref": "seeker"
          }
        },
        "on": {
          "destroy": [
            {
              "signal": "wingDestroyed"
            },
            {
              "add": {
                "target": "root.vars.rage",
                "value": 1
              }
            }
          ]
        }
      }
    ]
  },
  "brain": {
    "start": "phase1",
    "states": {
      "phase1": {
        "tracks": [
          {
            "id": "leftVolley",
            "loop": true,
            "steps": [
              {
                "telegraph": {
                  "part": "leftWing",
                  "time": 0.5
                }
              },
              {
                "if": {
                  "when": "alive('leftWing')",
                  "then": [
                    {
                      "fire": {
                        "emitter": "leftWing.missiles",
                        "pattern": "aimed"
                      }
                    }
                  ]
                }
              },
              {
                "wait": 2.2
              }
            ]
          },
          {
            "id": "rightVolley",
            "loop": true,
            "steps": [
              {
                "wait": 1.1
              },
              {
                "telegraph": {
                  "part": "rightWing",
                  "time": 0.5
                }
              },
              {
                "if": {
                  "when": "alive('rightWing')",
                  "then": [
                    {
                      "fire": {
                        "emitter": "rightWing.missiles",
                        "pattern": "aimed"
                      }
                    }
                  ]
                }
              },
              {
                "wait": 1.1
              }
            ]
          }
        ],
        "transitions": [
          {
            "when": "countAlive('tag:wing') == 0",
            "to": "grounded"
          },
          {
            "when": "self.hpPct <= 0.4",
            "to": "fury"
          }
        ]
      },
      "fury": {
        "enter": [
          {
            "set": {
              "target": "root.vars.rage",
              "value": 3
            }
          }
        ],
        "tracks": [
          {
            "id": "spray",
            "loop": true,
            "steps": [
              {
                "telegraph": {
                  "time": 0.6
                }
              },
              {
                "fire": {
                  "emitter": "maw",
                  "pattern": "ring",
                  "count": 8
                }
              },
              {
                "wait": 1.5
              }
            ]
          }
        ],
        "transitions": [
          {
            "when": "countAlive('tag:wing') == 0",
            "to": "grounded"
          }
        ]
      },
      "grounded": {
        "enter": [
          {
            "setMotion": {
              "target": "root",
              "type": "gravity"
            }
          }
        ],
        "tracks": [
          {
            "id": "groundBurst",
            "loop": true,
            "steps": [
              {
                "telegraph": {
                  "time": 0.8
                }
              },
              {
                "fire": {
                  "emitter": "maw",
                  "pattern": "fan",
                  "count": 5,
                  "spreadDeg": 80
                }
              },
              {
                "wait": 2
              }
            ]
          }
        ]
      }
    }
  }
}
```

### Sky Duelist — elite

A utility brain: scored actions gated on sense.*, relative-target strafing passes, altitude hovering, and lastSeen hunting.

```json
{
  "v": 1,
  "id": "tpl_sky_duelist",
  "name": "Sky Duelist",
  "threat": 120,
  "role": "elite",
  "tier": 2,
  "intelligence": 4,
  "root": {
    "id": "root",
    "tags": [
      "enemy",
      "flying"
    ],
    "visual": {
      "shape": "ellipse",
      "size": [
        40,
        26
      ],
      "color": "#5ad0b8"
    },
    "health": {
      "max": 60
    },
    "motion": {
      "type": "hover",
      "amplitude": 10,
      "rate": 2,
      "driftSpeed": 30,
      "altitude": 170
    },
    "emitters": {
      "gun": {
        "at": [
          0,
          6
        ],
        "projectile": {
          "speed": 600,
          "w": 10,
          "h": 5,
          "color": "#8affc1",
          "life": 1.6,
          "damage": 9,
          "shape": "bolt"
        }
      }
    }
  },
  "brain": {
    "mode": "utility",
    "start": "sky",
    "states": {
      "sky": {
        "decisionInterval": 0.25,
        "actions": [
          {
            "id": "strafeRun",
            "when": "sense.los && sense.dist > 180 && sense.dist < 520",
            "score": "1.5 + 1.2 * (sense.dist < 380)",
            "windup": 0.4,
            "steps": [
              {
                "dash": {
                  "target": "player",
                  "offset": [
                    240,
                    0
                  ],
                  "speed": 500,
                  "duration": 0.55
                }
              },
              {
                "fire": {
                  "emitter": "gun",
                  "pattern": "aimed",
                  "aim": "lead"
                }
              }
            ],
            "recovery": 0.5,
            "cooldown": 2.2
          },
          {
            "id": "hoverSnipe",
            "when": "sense.los && sense.dist >= 520",
            "score": 1.2,
            "windup": 0.3,
            "steps": [
              {
                "fire": {
                  "emitter": "gun",
                  "pattern": "aimed",
                  "aim": "lead"
                }
              }
            ],
            "recovery": 0.2,
            "cooldown": 1
          },
          {
            "id": "peelOff",
            "when": "sense.los && sense.dist <= 180",
            "score": 1.6,
            "steps": [
              {
                "moveTo": {
                  "target": "player",
                  "offset": [
                    -300,
                    -170
                  ],
                  "speed": 420,
                  "timeout": 1.4
                }
              }
            ],
            "recovery": 0.2,
            "cooldown": 1
          },
          {
            "id": "climbAway",
            "when": "self.hpPct < 0.45 || (sense.playerApproaching && sense.dist < 220)",
            "score": "2.2 + 2 * sense.playerApproaching",
            "steps": [
              {
                "moveTo": {
                  "target": "player",
                  "offset": [
                    -320,
                    -190
                  ],
                  "speed": 380,
                  "timeout": 1.6
                }
              }
            ],
            "recovery": 0.2,
            "cooldown": 1.8
          },
          {
            "id": "hunt",
            "when": "!sense.los && sense.timeSinceSeen > 1",
            "score": 1.8,
            "steps": [
              {
                "moveTo": {
                  "target": "lastSeen",
                  "speed": 300,
                  "timeout": 2
                }
              }
            ],
            "cooldown": 1.5
          },
          {
            "id": "drift",
            "score": 0.4,
            "steps": [
              {
                "wait": 0.35
              }
            ]
          }
        ]
      }
    }
  }
}
```

