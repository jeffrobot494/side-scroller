// ---------------------------------------------------------------------------
// HUB AMBIENT LAYER — base personnel at work behind the hub UI.
//
// A fixed full-viewport canvas that sits *behind* the hub DOM (the panel
// backdrops are translucent gradients, so the scene shows through). Big
// background figures — roughly room-scale, not sprites — populate the bunker
// floor: crew seated at desks typing into glowing terminals, pairs standing
// around talking with the occasional gesture, someone working a wall console,
// someone nursing a coffee. Two depth rows give a little parallax; everything
// is drawn as dim silhouettes with soft screen-glow so the UI stays readable
// on top. How much crew appears scales with the living roster.
//
// Config: `hubAmbience` (on/off) and `hubAmbienceDensity` (crowd multiplier),
// both read live every frame. `step(dt)` is separated from the rAF loop so the
// headless tests can advance the simulation deterministically.
// ---------------------------------------------------------------------------

import { config } from "../game/config.js";
import { livingRoster } from "../game/state.js";

// One palette per role: torso, headgear, limbs. Muted, to sit in the dark.
const ROLES = [
  { id: "trooper", torso: "#4c5c42", gear: "#39452f", limb: "#333d2c", weight: 3 },
  { id: "engineer", torso: "#5c6069", gear: "#c79c3a", limb: "#43464e", weight: 2 },
  { id: "scientist", torso: "#a9b2be", gear: "#3a3f47", limb: "#7d8692", weight: 2 },
  { id: "officer", torso: "#2f3f57", gear: "#22292f", limb: "#242f40", weight: 1 },
];

// desk/console read as "working", talk seats two people, idle is filler.
const ACTIVITIES = [
  { id: "desk", people: 1, weight: 4 },
  { id: "talk", people: 2, weight: 3 },
  { id: "console", people: 1, weight: 2 },
  { id: "idle", people: 1, weight: 1 },
];

// Figures are drawn in a 22-unit-tall local space (feet at y=0) and scaled up
// ~9x — about ten times the old tiny-walker size.
const FIGURE_H = 22;
const ROWS = [
  { foot: 26, scale: 9, alpha: 0.34 }, // front
  { foot: 150, scale: 6.8, alpha: 0.22 }, // back, dimmer + higher up the floor
];
const MAX_CREW = 16;

function pickWeighted(list, rng) {
  const total = list.reduce((s, it) => s + it.weight, 0);
  let roll = rng() * total;
  for (const it of list) {
    roll -= it.weight;
    if (roll <= 0) return it;
  }
  return list[0];
}

export function createHubAmbient(game) {
  const canvas = document.createElement("canvas");
  canvas.id = "hub-ambient";
  const ctx = canvas.getContext("2d");

  const rng = Math.random;
  let people = [];
  let visible = true;
  let raf = 0;
  let last = 0;
  let builtFor = { count: -1, w: -1 };

  function viewSize() {
    // window.innerWidth is undefined under the node DOM stub — fall back.
    return {
      w: (typeof window !== "undefined" && window.innerWidth) || 1280,
      h: (typeof window !== "undefined" && window.innerHeight) || 720,
    };
  }

  function resize() {
    const { w, h } = viewSize();
    canvas.width = w;
    canvas.height = h;
  }

  function targetCount() {
    if (!config.hubAmbience) return 0;
    const roster = livingRoster(game).length;
    const base = 3 + Math.min(roster, 8);
    return Math.max(0, Math.min(MAX_CREW, Math.round(base * config.hubAmbienceDensity)));
  }

  function makePerson(activity, x, row, dir) {
    return {
      activity,
      x,
      row,
      dir, // which way the figure faces (desk/console furniture sits this side)
      role: pickWeighted(ROLES, rng),
      t: rng() * 10, // personal clock driving all the idle animation
      state: "active", // active = typing/gesturing; rest = lean back / listen
      stateT: 2 + rng() * 5,
      flicker: 0.6 + rng() * 0.4, // per-terminal screen shimmer rate
    };
  }

  // Lay the whole scene out fresh: pick stations, spread them across the floor
  // with jitter. Called at mount and again whenever the crew target changes.
  function rebuild(count) {
    const { w } = viewSize();
    people = [];
    if (count <= 0) return;
    // The locations sidebar (~250px) is opaque — keep stations clear of it.
    const minX = w > 600 ? 300 : 40;
    const maxX = w - 100;
    // Alternate rows per station so both depths fill evenly.
    const stations = [];
    let remaining = count;
    while (remaining > 0) {
      const act = pickWeighted(ACTIVITIES, rng);
      if (act.people > remaining && stations.length > 0) break;
      stations.push(act);
      remaining -= act.people;
    }
    const span = Math.max(1, maxX - minX);
    const slot = span / stations.length;
    stations.forEach((act, i) => {
      const row = i % 2;
      const x = minX + slot * (i + 0.5) + (rng() - 0.5) * slot * 0.4;
      const dir = rng() < 0.5 ? -1 : 1;
      if (act.id === "talk") {
        const gap = 4.2 * ROWS[row].scale;
        people.push(makePerson("talk", x - gap / 2, row, 1));
        people.push(makePerson("talk", x + gap / 2, row, -1));
      } else {
        people.push(makePerson(act.id, x, row, dir));
      }
    });
  }

  function step(dt) {
    const { w } = viewSize();
    const target = targetCount();
    if (target !== builtFor.count || w !== builtFor.w) {
      builtFor = { count: target, w };
      rebuild(target);
    }
    for (const p of people) {
      p.t += dt;
      p.stateT -= dt;
      if (p.stateT <= 0) {
        p.state = p.state === "active" ? "rest" : "active";
        p.stateT = p.state === "active" ? 3 + rng() * 6 : 1.5 + rng() * 3;
      }
    }
  }

  // ---- drawing ------------------------------------------------------------
  // All figures are drawn in local units (FIGURE_H tall, feet at y=0, facing
  // +x) and mirrored/scaled by the row transform.

  function limb(x1, y1, x2, y2, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function head(x, y, gearId, role) {
    ctx.fillStyle = "#8a7a66";
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = role.gear;
    if (gearId === "engineer") {
      ctx.fillRect(x - 3, y - 3.4, 6, 1.6); // hard-hat brim
    } else if (gearId !== "scientist") {
      ctx.beginPath();
      ctx.arc(x, y - 0.4, 2.7, Math.PI, 0); // helmet / cap dome
      ctx.fill();
    }
  }

  function screenGlow(x, y, w, h, alpha) {
    ctx.fillStyle = `rgba(140, 190, 235, ${alpha * 0.25})`;
    ctx.fillRect(x - 1.2, y - 1.2, w + 2.4, h + 2.4); // soft spill
    ctx.fillStyle = `rgba(170, 210, 245, ${alpha})`;
    ctx.fillRect(x, y, w, h);
  }

  // Seated at a desk, side-on, typing into a glowing terminal.
  function drawDesk(p) {
    const active = p.state === "active";
    const type = active ? Math.sin(p.t * 12) * 0.35 : 0;
    const lean = active ? 0 : -1.2; // lean back off the keyboard on a break

    // chair
    limb(-1.5, -7.5, -1.5, 0, 0.7, "#20262e");
    ctx.fillStyle = "#262d37";
    ctx.fillRect(-3, -8.2, 5, 1);
    ctx.fillRect(-3.4, -14.5, 1, 6.5); // backrest

    // figure: hip at (0,-8), thigh forward, shin down
    limb(0, -8, 4, -8, 1.8, p.role.limb);
    limb(4, -8, 4, 0, 1.8, p.role.limb);
    limb(lean * 0.3, -8, lean, -15.5, 3.2, p.role.torso); // torso
    // arms reaching to the keyboard, hands jittering while typing
    limb(lean, -14, 5.2, -9.8 + type, 1.2, p.role.torso);
    head(lean, -17.5, p.role.id, p.role);

    // desk + terminal (in front of the figure)
    ctx.fillStyle = "#1b2129";
    ctx.fillRect(5.5, -10.5, 8.5, 0.9);
    limb(6.2, -9.6, 6.2, 0, 0.7, "#181d24");
    limb(13.2, -9.6, 13.2, 0, 0.7, "#181d24");
    ctx.fillStyle = "#12161c";
    ctx.fillRect(8, -16.2, 4.6, 5.2); // monitor body
    const flick = 0.5 + 0.14 * Math.sin(p.t * 6 * p.flicker) + 0.06 * Math.sin(p.t * 17);
    screenGlow(8.5, -15.7, 3.6, 4.2, active ? flick : flick * 0.6);
  }

  // Standing at a tall wall console, reaching up to it now and then.
  function drawConsole(p) {
    const active = p.state === "active";
    const reach = active ? Math.sin(p.t * 1.6) * 1.5 : 0;

    // legs + torso
    limb(0, -8, -1, 0, 1.8, p.role.limb);
    limb(0, -8, 1, 0, 1.8, p.role.limb);
    limb(0, -8, 0, -15.5, 3.2, p.role.torso);
    // one arm up on the panel, the other at the side
    limb(0, -14, 4.6, -14.5 + reach, 1.2, p.role.torso);
    limb(0, -14, 0.8, -9.5, 1.2, p.role.torso);
    head(0, -17.5, p.role.id, p.role);

    // wall console: tall dark slab with stacked glowing readouts
    ctx.fillStyle = "#141a21";
    ctx.fillRect(5.5, -20, 5, 20);
    const flick = 0.45 + 0.12 * Math.sin(p.t * 5 * p.flicker);
    screenGlow(6.3, -18.5, 3.4, 3, flick);
    screenGlow(6.3, -14.2, 3.4, 2, flick * 0.8);
    screenGlow(6.3, -11, 3.4, 1.2, flick * 0.6);
  }

  // One of a standing pair, face-on to the partner; gestures while "active"
  // (talking), stands with arms down while "rest" (listening), nodding a bit.
  function drawTalk(p) {
    const talking = p.state === "active";
    const gesture = talking ? Math.max(0, Math.sin(p.t * 2.2)) * 3 : 0;
    const nod = Math.sin(p.t * (talking ? 3 : 1.3)) * 0.3;

    limb(0, -8, -1, 0, 1.8, p.role.limb);
    limb(0, -8, 1, 0, 1.8, p.role.limb);
    limb(0, -8, 0, -15.5, 3.2, p.role.torso);
    // forward arm raises to gesture mid-sentence
    limb(0, -14, 3.4, -11.5 - gesture, 1.2, p.role.torso);
    limb(0, -14, -1, -9.5, 1.2, p.role.torso);
    head(0.5, -17.5 + nod, p.role.id, p.role);
  }

  // Standing around with a coffee; periodic sip.
  function drawIdle(p) {
    const sip = Math.max(0, Math.sin(p.t * 0.9)) ** 6; // brief raise, long rest
    limb(0, -8, -1, 0, 1.8, p.role.limb);
    limb(0, -8, 1, 0, 1.8, p.role.limb);
    limb(0, -8, 0, -15.5, 3.2, p.role.torso);
    limb(0, -14, 2.6 - sip * 1.4, -10.5 - sip * 5.5, 1.2, p.role.torso); // cup arm
    limb(0, -14, -1, -9.5, 1.2, p.role.torso);
    ctx.fillStyle = "#c9c2b4";
    ctx.fillRect(2.2 - sip * 1.4, -11.6 - sip * 5.5, 1.3, 1.6); // the mug
    head(0, -17.5, p.role.id, p.role);
  }

  const DRAW = { desk: drawDesk, console: drawConsole, talk: drawTalk, idle: drawIdle };

  function drawPerson(p) {
    const { h } = viewSize();
    const row = ROWS[p.row];
    ctx.save();
    ctx.globalAlpha = row.alpha;
    ctx.translate(p.x, h - row.foot);
    ctx.scale(row.scale * p.dir, row.scale);
    DRAW[p.activity](p);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!config.hubAmbience) return;
    // Back row first so front figures overlap it.
    for (const p of people) if (p.row === 1) drawPerson(p);
    for (const p of people) if (p.row === 0) drawPerson(p);
  }

  function frame(ts) {
    const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016);
    last = ts;
    if (visible) {
      step(dt);
      draw();
    }
    raf = requestAnimationFrame(frame);
  }

  const onResize = () => resize();
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("resize", onResize);
  }

  resize();
  step(0.016); // build the scene + one synchronous draw at mount
  draw();
  raf = requestAnimationFrame(frame);

  return {
    el: canvas,
    people: () => people,
    step,
    setVisible(v) {
      visible = v;
      canvas.style.display = v ? "block" : "none";
    },
    dispose() {
      cancelAnimationFrame(raf);
      if (typeof window !== "undefined" && window.removeEventListener) {
        window.removeEventListener("resize", onResize);
      }
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
}
