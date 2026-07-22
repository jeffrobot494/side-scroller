// ---------------------------------------------------------------------------
// STARTER TEMPLATES — hand-authored EnemySpecs with three jobs:
//   1. "New from template" in the Enemy Designer
//   2. few-shot examples in the LLM generation prompt (generate.js)
//   3. fixtures for the enemyspec test suites
//
// Every template MUST validate clean (the test suite enforces this), so they
// double as living documentation of the format. Ordered simple → complex.
// ---------------------------------------------------------------------------

export const TEMPLATES = [
  // -- 1. Charger: the simplest possible spec — a body, health, chase, touch damage.
  {
    v: 1,
    id: "tpl_charger",
    name: "Husk Charger",
    threat: 50,
    role: "charger",
    tier: 1,
    root: {
      id: "root",
      tags: ["enemy"],
      visual: { shape: "diamond", size: [30, 26], color: "#e05a5a" },
      health: { max: 24 },
      motion: { type: "chase", speed: 210 },
      contact: { damage: 10 },
    },
  },

  // -- 2. Shooter: holds range, telegraphs, fires an aimed shot on a loop.
  {
    v: 1,
    id: "tpl_shooter",
    name: "Lurk Gunner",
    threat: 70,
    role: "artillery",
    tier: 1,
    root: {
      id: "root",
      tags: ["enemy"],
      visual: { shape: "box", size: [34, 46], color: "#c261e0" },
      health: { max: 46 },
      motion: { type: "keepDistance", min: 260, max: 420, speed: 140 },
      emitters: {
        gun: { at: [0, -6], projectile: { speed: 460, w: 14, h: 14, color: "#8affc1", life: 2.2, damage: 14, shape: "orb" } },
      },
    },
    brain: {
      start: "fight",
      states: {
        fight: {
          tracks: [
            {
              id: "shoot",
              loop: true,
              steps: [
                { telegraph: { time: 0.5 } },
                { fire: { emitter: "gun", pattern: "aimed" } },
                { wait: 1.4 },
              ],
            },
          ],
        },
      },
    },
  },

  // -- 3. Flier: hovers with a bob, rains angled bolts in a fan.
  {
    v: 1,
    id: "tpl_flier",
    name: "Spore Wisp",
    threat: 65,
    role: "skirmisher",
    tier: 1,
    root: {
      id: "root",
      tags: ["enemy", "flying"],
      visual: { shape: "ellipse", size: [36, 24], color: "#5ac8e0" },
      health: { max: 30 },
      motion: { type: "hover", amplitude: 16, rate: 2.2, driftSpeed: 60 },
      emitters: {
        pods: { at: [0, 10], projectile: { speed: 300, w: 8, h: 8, color: "#bff29a", life: 3, damage: 8, gravity: 0.4, shape: "pellet" } },
      },
    },
    brain: {
      start: "drift",
      states: {
        drift: {
          tracks: [
            {
              id: "rain",
              loop: true,
              steps: [
                { telegraph: { time: 0.4 } },
                { fire: { emitter: "pods", pattern: "fan", count: 3, spreadDeg: 50, aim: "current" } },
                { wait: { range: [1.6, 2.4] } },
              ],
            },
          ],
        },
      },
    },
  },

  // -- 4. Boss skeleton (Iron-Moth-shaped): destructible wings that launch
  //    shootable homing seekers; losing both wings grounds it into a new phase.
  {
    v: 1,
    id: "tpl_boss_moth",
    name: "Iron Moth",
    threat: 320,
    role: "boss",
    tier: 3,
    limits: { maxAlive: 24, maxSpawnsPerSecond: 10, maxSpawnDepth: 3 },
    vars: { rage: 0 },
    defs: {
      shard: {
        tags: ["projectile"],
        visual: { shape: "diamond", size: [8, 8], color: "#ffb15a" },
        body: { gravity: 0 },
        life: { ttl: 1.1 },
        contact: { damage: 4, destroySelf: true },
      },
      seeker: {
        tags: ["projectile", "shootable"],
        visual: { shape: "circle", size: [16, 16], color: "#ff7a5a" },
        health: { max: 4 },
        life: { ttl: 7 },
        motion: { type: "home", speed: 190, turnRate: 2.6 },
        contact: { damage: 9, destroySelf: true },
        on: {
          destroy: [
            { spawn: { ref: "shard", count: 5, pattern: "ring", speed: 180 } },
            { signal: "seekerDown" },
          ],
        },
      },
    },
    root: {
      id: "core",
      tags: ["enemy", "boss"],
      visual: { shape: "ellipse", size: [96, 44], color: "#8a6ae0" },
      health: { max: 320 },
      motion: { type: "hover", amplitude: 12, rate: 1.6, driftSpeed: 34 },
      emitters: {
        maw: { at: [0, 14], projectile: { speed: 380, w: 12, h: 12, color: "#d98cff", life: 2.5, damage: 12, shape: "orb" } },
      },
      children: [
        {
          id: "leftWing",
          tags: ["wing"],
          at: [-62, -4],
          visual: { shape: "diamond", size: [58, 26], color: "#b49aff" },
          health: { max: 60 },
          link: { onParentDeath: "destroy", onOwnDeath: "destroy" },
          emitters: { missiles: { at: [-12, 0], ref: "seeker" } },
          on: { destroy: [{ signal: "wingDestroyed" }, { add: { target: "root.vars.rage", value: 1 } }] },
        },
        {
          id: "rightWing",
          tags: ["wing"],
          at: [62, -4],
          visual: { shape: "diamond", size: [58, 26], color: "#b49aff" },
          health: { max: 60 },
          link: { onParentDeath: "destroy", onOwnDeath: "destroy" },
          emitters: { missiles: { at: [12, 0], ref: "seeker" } },
          on: { destroy: [{ signal: "wingDestroyed" }, { add: { target: "root.vars.rage", value: 1 } }] },
        },
      ],
    },
    brain: {
      start: "phase1",
      states: {
        phase1: {
          tracks: [
            {
              id: "leftVolley",
              loop: true,
              steps: [
                { telegraph: { part: "leftWing", time: 0.5 } },
                { if: { when: "alive('leftWing')", then: [{ fire: { emitter: "leftWing.missiles", pattern: "aimed" } }] } },
                { wait: 2.2 },
              ],
            },
            {
              id: "rightVolley",
              loop: true,
              steps: [
                { wait: 1.1 },
                { telegraph: { part: "rightWing", time: 0.5 } },
                { if: { when: "alive('rightWing')", then: [{ fire: { emitter: "rightWing.missiles", pattern: "aimed" } }] } },
                { wait: 1.1 },
              ],
            },
          ],
          transitions: [
            { when: "countAlive('tag:wing') == 0", to: "grounded" },
            { when: "self.hpPct <= 0.4", to: "fury" },
          ],
        },
        fury: {
          enter: [{ set: { target: "root.vars.rage", value: 3 } }],
          tracks: [
            {
              id: "spray",
              loop: true,
              steps: [
                { telegraph: { time: 0.6 } },
                { fire: { emitter: "maw", pattern: "ring", count: 8 } },
                { wait: 1.5 },
              ],
            },
          ],
          transitions: [{ when: "countAlive('tag:wing') == 0", to: "grounded" }],
        },
        grounded: {
          enter: [{ setMotion: { target: "root", type: "gravity" } }],
          tracks: [
            {
              id: "groundBurst",
              loop: true,
              steps: [
                { telegraph: { time: 0.8 } },
                { fire: { emitter: "maw", pattern: "fan", count: 5, spreadDeg: 80 } },
                { wait: 2 },
              ],
            },
          ],
        },
      },
    },
  },

  // -- 5. Utility skirmisher (Cowardly-Duelist-shaped): a scored-action brain
  //    that keeps range, snipes with lead, hops when you close, and commits to
  //    a punishable lunge when it feels safe.
  {
    v: 1,
    id: "tpl_duelist",
    name: "Cowardly Duelist",
    threat: 110,
    role: "elite",
    tier: 2,
    root: {
      id: "root",
      tags: ["enemy"],
      visual: { shape: "box", size: [26, 44], color: "#e0b95a" },
      health: { max: 70 },
      motion: { type: "keepDistance", min: 220, max: 380, speed: 190 },
      contact: { damage: 6 },
      emitters: {
        pistol: { at: [0, -8], projectile: { speed: 640, w: 10, h: 4, color: "#ffe08a", life: 1.4, damage: 9, shape: "bullet" } },
      },
    },
    brain: {
      mode: "utility",
      start: "duel",
      states: {
        duel: {
          decisionInterval: 0.3,
          actions: [
            {
              id: "snipe",
              when: "sense.los && sense.dist < 560",
              score: "1.2 + 1.5 * (sense.dist > 260)",
              windup: 0.35,
              steps: [{ fire: { emitter: "pistol", pattern: "aimed", aim: "lead" } }],
              recovery: 0.25,
              cooldown: 1.1,
            },
            {
              id: "backHop",
              when: "sense.dist < 150",
              score: "2.5 + 2 * sense.playerApproaching",
              steps: [{ dash: { away: true, speed: 340, duration: 0.3 } }, { jump: {} }],
              recovery: 0.3,
              cooldown: 1.6,
            },
            {
              id: "lunge",
              when: "sense.dist < 240 && self.hpPct > 0.35",
              score: "0.8 + 1.4 * (sense.timeSinceSeen < 0.2)",
              windup: 0.55,
              steps: [{ dash: { target: "player", speed: 520, duration: 0.45 } }],
              recovery: 0.8,
              cooldown: 4,
            },
            {
              id: "hold",
              score: 0.5,
              steps: [{ wait: 0.3 }],
            },
          ],
        },
      },
    },
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
