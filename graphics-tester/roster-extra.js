// ---------------------------------------------------------------------------
// GRAPHICS TESTER — enemies the game file does not ship yet.
//
// Specs Bo authored in the Enemy Designer, so they live in his browser's enemy
// store and not in ENEMY_FILE (src/game/enemyspecs.js). Copied here verbatim
// so the tester can model them; enemies.js lists them after the file's, and
// drops any copy once the file ships the same id. Looks only: nothing in
// the game reads this.
// ---------------------------------------------------------------------------

export const EXTRA_SPECS = [
  {
    "v": 1,
    "id": "floating_factory",
    "name": "Floating Factory",
    "threat": 110,
    "role": "support",
    "tier": 2,
    "intelligence": 1,
    "limits": {
      "maxAlive": 8,
      "maxSpawnsPerSecond": 1,
      "maxSpawnDepth": 1
    },
    "defs": {
      "drone": {
        "id": "drone",
        "tags": [
          "enemy",
          "drone",
          "flying"
        ],
        "visual": {
          "shape": "circle",
          "size": [
            16,
            16
          ],
          "color": "#ffd166"
        },
        "body": {
          "gravity": 0
        },
        "health": {
          "max": 51
        },
        "motion": {
          "type": "home",
          "speed": 170,
          "turnRate": 2.2
        },
        "contact": {
          "damage": 6,
          "knockback": 0.1
        }
      }
    },
    "root": {
      "id": "root",
      "tags": [
        "enemy",
        "spawner",
        "factory"
      ],
      "visual": {
        "shape": "box",
        "size": [
          100,
          66
        ],
        "color": "#7a6a5a"
      },
      "body": {
        "gravity": 0
      },
      "health": {
        "max": 150
      },
      "motion": {
        "type": "hover",
        "amplitude": 8,
        "rate": 0.8,
        "driftSpeed": 12,
        "around": "spawn",
        "altitude": 245
      }
    },
    "brain": {
      "start": "produce",
      "states": {
        "produce": {
          "tracks": [
            {
              "id": "spawnLoop",
              "loop": true,
              "steps": [
                {
                  "wait": 7
                },
                {
                  "spawn": {
                    "ref": "drone",
                    "count": 1
                  }
                }
              ]
            }
          ]
        }
      }
    }
  },
  {
    "v": 1,
    "id": "breach_hopper",
    "name": "Assault Bot",
    "threat": 88,
    "role": "charger",
    "tier": 2,
    "intelligence": 3,
    "sounds": {
      "fire": "weapon.fire.enemy",
      "hurt": "enemy.hurt",
      "death": "enemy.death",
      "part": "enemy.part"
    },
    "root": {
      "id": "root",
      "tags": [
        "enemy",
        "robot",
        "common"
      ],
      "visual": {
        "shape": "box",
        "size": [
          32,
          40
        ],
        "color": "#4f5966"
      },
      "body": {
        "w": 40,
        "h": 78,
        "gravity": 1,
        "jump": 1100
      },
      "health": {
        "max": 72
      },
      "motion": {
        "type": "chase",
        "speed": 175
      },
      "contact": {
        "damage": 8,
        "knockback": 0.22
      },
      "children": [
        {
          "id": "head",
          "tags": [
            "armor"
          ],
          "at": [
            0,
            -31
          ],
          "visual": {
            "shape": "box",
            "size": [
              26,
              20
            ],
            "color": "#788493"
          },
          "link": {
            "onParentDeath": "destroy"
          }
        },
        {
          "id": "gunArm",
          "tags": [
            "weapon"
          ],
          "at": [
            25,
            -4
          ],
          "visual": {
            "shape": "box",
            "size": [
              34,
              14
            ],
            "color": "#8793a0"
          },
          "link": {
            "onParentDeath": "destroy"
          },
          "emitters": {
            "rifle": {
              "at": [
                17,
                0
              ],
              "projectile": {
                "speed": 620,
                "w": 11,
                "h": 5,
                "color": "#ffb449",
                "life": 1.6,
                "damage": 7,
                "shape": "bolt"
              },
              "sound": "weapon.fire.bullet"
            }
          }
        },
        {
          "id": "fistArm",
          "tags": [
            "weapon"
          ],
          "at": [
            -23,
            -2
          ],
          "visual": {
            "shape": "box",
            "size": [
              22,
              16
            ],
            "color": "#a6533f"
          },
          "link": {
            "onParentDeath": "destroy"
          },
          "emitters": {
            "punch": {
              "at": [
                -12,
                0
              ],
              "projectile": {
                "speed": 160,
                "w": 36,
                "h": 24,
                "color": "#ff7657",
                "life": 0.16,
                "damage": 10,
                "shape": "box"
              },
              "sound": "impact.hit"
            }
          }
        },
        {
          "id": "leftLeg",
          "tags": [
            "armor"
          ],
          "at": [
            -10,
            31
          ],
          "visual": {
            "shape": "box",
            "size": [
              13,
              30
            ],
            "color": "#5d6875"
          },
          "link": {
            "onParentDeath": "destroy"
          }
        },
        {
          "id": "rightLeg",
          "tags": [
            "armor"
          ],
          "at": [
            10,
            31
          ],
          "visual": {
            "shape": "box",
            "size": [
              13,
              30
            ],
            "color": "#5d6875"
          },
          "link": {
            "onParentDeath": "destroy"
          }
        }
      ]
    },
    "brain": {
      "mode": "utility",
      "start": "assault",
      "states": {
        "assault": {
          "decisionInterval": 0.3,
          "actions": [
            {
              "id": "screenLeap",
              "when": "sense.los && sense.dist >= 220 && sense.dist < 1050",
              "score": "3.1 + 0.8 * (sense.dist > 500)",
              "windup": 0.48,
              "steps": [
                {
                  "telegraph": {
                    "time": 0.18
                  }
                },
                {
                  "setMotion": {
                    "target": "root",
                    "type": "keepDistance",
                    "min": 50,
                    "max": 68,
                    "speed": 800
                  }
                },
                {
                  "jump": {}
                },
                {
                  "wait": 1.2
                },
                {
                  "setMotion": {
                    "target": "root",
                    "type": "chase",
                    "speed": 175
                  }
                },
                {
                  "telegraph": {
                    "time": 0.2
                  }
                },
                {
                  "if": {
                    "when": "sense.dist <= 80",
                    "then": [
                      {
                        "fire": {
                          "emitter": "fistArm.punch",
                          "count": 2,
                          "pattern": "burst",
                          "aim": "current"
                        }
                      }
                    ]
                  }
                },
                {
                  "if": {
                    "when": "sense.dist > 80",
                    "then": [
                      {
                        "fire": {
                          "emitter": "gunArm.rifle",
                          "count": 3,
                          "pattern": "burst",
                          "aim": "lead"
                        }
                      }
                    ]
                  }
                }
              ],
              "recovery": 0.5,
              "cooldown": 3.6
            },
            {
              "id": "punchCombo",
              "when": "sense.los && sense.dist <= 78",
              "score": 3.7,
              "windup": 0.18,
              "steps": [
                {
                  "fire": {
                    "emitter": "fistArm.punch",
                    "count": 2,
                    "pattern": "burst",
                    "aim": "current"
                  }
                }
              ],
              "recovery": 0.48,
              "cooldown": 1.05
            },
            {
              "id": "rifleBurst",
              "when": "sense.los && sense.dist > 78 && sense.dist < 440",
              "score": 1.7,
              "windup": 0.25,
              "steps": [
                {
                  "fire": {
                    "emitter": "gunArm.rifle",
                    "count": 3,
                    "pattern": "burst",
                    "aim": "lead"
                  }
                }
              ],
              "recovery": 0.38,
              "cooldown": 1.35
            },
            {
              "id": "vaultUp",
              "when": "sense.playerAbove && sense.dist < 520",
              "score": 3.4,
              "windup": 0.25,
              "steps": [
                {
                  "jump": {}
                },
                {
                  "wait": 0.42
                }
              ],
              "recovery": 0.12,
              "cooldown": 1.4
            },
            {
              "id": "advance",
              "when": "!sense.los || sense.dist >= 440",
              "score": 1.1,
              "steps": [
                {
                  "moveTo": {
                    "target": "player",
                    "offset": [
                      -110,
                      0
                    ],
                    "speed": 190,
                    "timeout": 1.25
                  }
                }
              ],
              "recovery": 0.1,
              "cooldown": 0.7
            },
            {
              "id": "reset",
              "score": 0.2,
              "steps": [
                {
                  "wait": 0.25
                }
              ]
            }
          ]
        }
      }
    }
  },
  {
    "v": 1,
    "id": "siege_automaton",
    "name": "Siege Automaton",
    "threat": 360,
    "role": "elite",
    "tier": 4,
    "intelligence": 4,
    "limits": {
      "maxAlive": 80,
      "maxSpawnsPerSecond": 40,
      "maxSpawnDepth": 4
    },
    "defs": {
      "microBlast": {
        "tags": [
          "explosion"
        ],
        "visual": {
          "shape": "circle",
          "size": [
            52,
            52
          ],
          "color": "#ffb12b"
        },
        "body": {
          "gravity": 0,
          "ghost": true
        },
        "motion": {
          "type": "static"
        },
        "life": {
          "ttl": 0.18
        },
        "contact": {
          "damage": 10,
          "destroySelf": true,
          "knockback": 0.25
        }
      },
      "seekerMissile": {
        "tags": [
          "projectile",
          "shootable",
          "missile"
        ],
        "visual": {
          "shape": "diamond",
          "size": [
            24,
            12
          ],
          "color": "#ff6338"
        },
        "body": {
          "gravity": 0
        },
        "health": {
          "max": 8
        },
        "motion": {
          "type": "home",
          "speed": 250,
          "turnRate": 2.8
        },
        "life": {
          "ttl": 6
        },
        "contact": {
          "damage": 24,
          "destroySelf": true,
          "knockback": 0.4
        },
        "on": {
          "destroy": [
            {
              "spawn": {
                "ref": "microBlast",
                "count": 1,
                "pattern": "single",
                "speed": 0
              }
            },
            {
              "sound": {
                "id": "impact.explode",
                "gain": 0.8,
                "pitch": 1.15
              }
            }
          ]
        }
      },
      "deathFlash": {
        "tags": [
          "explosion",
          "effect"
        ],
        "visual": {
          "shape": "circle",
          "size": [
            220,
            220
          ],
          "color": "#ff7a1a"
        },
        "body": {
          "gravity": 0,
          "ghost": true
        },
        "motion": {
          "type": "static"
        },
        "life": {
          "ttl": 0.45
        }
      },
      "deathBlast": {
        "tags": [
          "explosion"
        ],
        "visual": {
          "shape": "circle",
          "size": [
            180,
            180
          ],
          "color": "#ffe06a"
        },
        "body": {
          "gravity": 0,
          "ghost": true
        },
        "motion": {
          "type": "static"
        },
        "life": {
          "ttl": 0.3
        },
        "contact": {
          "damage": 60,
          "destroySelf": true,
          "knockback": 1
        }
      },
      "deathShrapnel": {
        "tags": [
          "projectile",
          "shrapnel"
        ],
        "visual": {
          "shape": "diamond",
          "size": [
            14,
            14
          ],
          "color": "#ffd24a"
        },
        "body": {
          "gravity": 0
        },
        "life": {
          "ttl": 1.25
        },
        "contact": {
          "damage": 18,
          "destroySelf": true,
          "knockback": 0.35
        }
      }
    },
    "sounds": {
      "fire": "weapon.fire.enemy",
      "hurt": "enemy.hurt",
      "death": {
        "cue": "impact.explode",
        "gain": 1.5
      },
      "part": "enemy.part"
    },
    "root": {
      "id": "root",
      "tags": [
        "enemy",
        "robot",
        "elite"
      ],
      "visual": {
        "shape": "box",
        "size": [
          68,
          82
        ],
        "color": "#414956"
      },
      "body": {
        "w": 78,
        "h": 164,
        "gravity": 1,
        "jump": 860
      },
      "health": {
        "max": 460
      },
      "motion": {
        "type": "keepDistance",
        "min": 230,
        "max": 430,
        "speed": 115
      },
      "contact": {
        "damage": 30,
        "knockback": 0.45
      },
      "children": [
        {
          "id": "head",
          "tags": [
            "armor"
          ],
          "at": [
            0,
            -62
          ],
          "visual": {
            "shape": "box",
            "size": [
              42,
              36
            ],
            "color": "#778494"
          },
          "link": {
            "onParentDeath": "destroy"
          }
        },
        {
          "id": "leftArm",
          "tags": [
            "armor"
          ],
          "at": [
            -46,
            -8
          ],
          "visual": {
            "shape": "box",
            "size": [
              26,
              68
            ],
            "color": "#616c7a"
          },
          "link": {
            "onParentDeath": "destroy"
          }
        },
        {
          "id": "cannonArm",
          "tags": [
            "weapon",
            "shootable"
          ],
          "at": [
            48,
            -8
          ],
          "visual": {
            "shape": "box",
            "size": [
              62,
              28
            ],
            "color": "#8b98a8"
          },
          "health": {
            "max": 100
          },
          "link": {
            "onParentDeath": "destroy",
            "onOwnDeath": "destroy"
          },
          "emitters": {
            "pulseCannon": {
              "at": [
                30,
                0
              ],
              "projectile": {
                "speed": 680,
                "w": 18,
                "h": 8,
                "color": "#73e8ff",
                "life": 1.7,
                "damage": 18,
                "shape": "bolt"
              },
              "sound": "weapon.fire.bolt"
            }
          },
          "on": {
            "destroy": [
              {
                "spawn": {
                  "ref": "microBlast",
                  "count": 1,
                  "pattern": "single",
                  "speed": 0
                }
              }
            ]
          }
        },
        {
          "id": "missilePack",
          "tags": [
            "weapon",
            "shootable",
            "weakpoint"
          ],
          "at": [
            22,
            -38
          ],
          "visual": {
            "shape": "box",
            "size": [
              54,
              34
            ],
            "color": "#7d3f34"
          },
          "health": {
            "max": 120
          },
          "link": {
            "onParentDeath": "destroy",
            "onOwnDeath": "destroy"
          },
          "emitters": {
            "leftTube": {
              "at": [
                -16,
                -6
              ],
              "ref": "seekerMissile",
              "sound": "weapon.fire.missile"
            },
            "rightTube": {
              "at": [
                16,
                -6
              ],
              "ref": "seekerMissile",
              "sound": "weapon.fire.missile"
            }
          },
          "on": {
            "destroy": [
              {
                "spawn": {
                  "ref": "microBlast",
                  "count": 1,
                  "pattern": "single",
                  "speed": 0
                }
              },
              {
                "spawn": {
                  "ref": "deathShrapnel",
                  "count": 8,
                  "pattern": "ring",
                  "speed": 240
                }
              }
            ]
          }
        },
        {
          "id": "leftLeg",
          "tags": [
            "armor"
          ],
          "at": [
            -20,
            66
          ],
          "visual": {
            "shape": "box",
            "size": [
              28,
              68
            ],
            "color": "#56616f"
          },
          "link": {
            "onParentDeath": "destroy"
          }
        },
        {
          "id": "rightLeg",
          "tags": [
            "armor"
          ],
          "at": [
            20,
            66
          ],
          "visual": {
            "shape": "box",
            "size": [
              28,
              68
            ],
            "color": "#56616f"
          },
          "link": {
            "onParentDeath": "destroy"
          }
        }
      ],
      "on": {
        "destroy": [
          {
            "spawn": {
              "ref": "deathFlash",
              "count": 1,
              "pattern": "single",
              "speed": 0
            }
          },
          {
            "spawn": {
              "ref": "deathBlast",
              "count": 1,
              "pattern": "single",
              "speed": 0
            }
          },
          {
            "spawn": {
              "ref": "deathShrapnel",
              "count": 20,
              "pattern": "ring",
              "speed": 440
            }
          }
        ]
      }
    },
    "brain": {
      "mode": "utility",
      "start": "combat",
      "states": {
        "combat": {
          "decisionInterval": 0.25,
          "actions": [
            {
              "id": "missileVolley",
              "when": "alive('missilePack') && sense.los && sense.dist > 180 && sense.dist < 850",
              "score": "2.2 + 0.6 * (sense.dist > 420)",
              "windup": 0.7,
              "steps": [
                {
                  "telegraph": {
                    "part": "missilePack",
                    "time": 0.3
                  }
                },
                {
                  "fire": {
                    "emitter": "missilePack.leftTube",
                    "count": 2,
                    "pattern": "fan",
                    "spreadDeg": 18,
                    "aim": "lead"
                  }
                },
                {
                  "wait": 0.18
                },
                {
                  "fire": {
                    "emitter": "missilePack.rightTube",
                    "count": 2,
                    "pattern": "fan",
                    "spreadDeg": 18,
                    "aim": "lead"
                  }
                }
              ],
              "recovery": 0.9,
              "cooldown": 4.8
            },
            {
              "id": "cannonBurst",
              "when": "alive('cannonArm') && sense.los && sense.dist >= 140 && sense.dist < 680",
              "score": 1.8,
              "windup": 0.38,
              "steps": [
                {
                  "fire": {
                    "emitter": "cannonArm.pulseCannon",
                    "count": 4,
                    "pattern": "burst",
                    "aim": "lead"
                  }
                }
              ],
              "recovery": 0.55,
              "cooldown": 1.9
            },
            {
              "id": "jumpBarrage",
              "when": "sense.los && sense.dist > 170 && sense.dist < 600 && randomChance(0.32)",
              "score": "2.5 + 0.8 * sense.playerAbove",
              "windup": 0.5,
              "steps": [
                {
                  "jump": {}
                },
                {
                  "wait": 0.24
                },
                {
                  "if": {
                    "when": "alive('cannonArm')",
                    "then": [
                      {
                        "fire": {
                          "emitter": "cannonArm.pulseCannon",
                          "count": 3,
                          "pattern": "fan",
                          "spreadDeg": 28,
                          "aim": "lead"
                        }
                      }
                    ]
                  }
                },
                {
                  "wait": 0.2
                },
                {
                  "if": {
                    "when": "alive('missilePack')",
                    "then": [
                      {
                        "fire": {
                          "emitter": "missilePack.leftTube",
                          "count": 1,
                          "pattern": "aimed",
                          "aim": "lead"
                        }
                      },
                      {
                        "fire": {
                          "emitter": "missilePack.rightTube",
                          "count": 1,
                          "pattern": "aimed",
                          "aim": "lead"
                        }
                      }
                    ]
                  }
                }
              ],
              "recovery": 0.65,
              "cooldown": 4.2
            },
            {
              "id": "clearLedge",
              "when": "sense.playerAbove || sense.navBlocked",
              "score": "3.4 + 1.2 * sense.navBlocked",
              "windup": 0.28,
              "steps": [
                {
                  "jump": {}
                },
                {
                  "wait": 0.5
                }
              ],
              "recovery": 0.15,
              "cooldown": 1.4
            },
            {
              "id": "emergencyLeap",
              "when": "self.hpPct < 0.35 && (sense.playerApproaching || sense.cornered)",
              "score": 4.6,
              "windup": 0.35,
              "steps": [
                {
                  "jump": {}
                },
                {
                  "moveTo": {
                    "target": "player",
                    "offset": [
                      -420,
                      0
                    ],
                    "speed": 190,
                    "timeout": 1.5
                  }
                }
              ],
              "recovery": 0.3,
              "cooldown": 2.8
            },
            {
              "id": "closeQuartersBurst",
              "when": "alive('cannonArm') && sense.los && sense.dist < 170",
              "score": "3 + 1.2 * sense.playerApproaching",
              "windup": 0.42,
              "steps": [
                {
                  "jump": {}
                },
                {
                  "wait": 0.18
                },
                {
                  "fire": {
                    "emitter": "cannonArm.pulseCannon",
                    "count": 5,
                    "pattern": "fan",
                    "spreadDeg": 85,
                    "aim": "lead"
                  }
                }
              ],
              "recovery": 0.7,
              "cooldown": 3
            },
            {
              "id": "huntLastSeen",
              "when": "!sense.los && sense.timeSinceSeen > 0.8",
              "score": 2.1,
              "steps": [
                {
                  "moveTo": {
                    "target": "lastSeen",
                    "speed": 165,
                    "timeout": 2.4
                  }
                }
              ],
              "recovery": 0.2,
              "cooldown": 1
            },
            {
              "id": "holdGround",
              "score": 0.25,
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
];
