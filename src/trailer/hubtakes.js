// ---------------------------------------------------------------------------
// THE HUB TAKES (tech/trailer.md, T4): shots 2, 3 and 13 on the real hub.
//
// Each take builds its own one-seat campaign — `createState()`, seated in a
// session through the loopback exactly as src/main.js does — and mounts a real
// `Hub` and the ambient crew on it. The command handler runs no rounds:
// main.js starts a mission on `roundClosed`, which is the one thing a hub take
// must never do.
//
// Staging uses the real screens' own buttons (clicked in the DOM) and the
// state module's own actions (`hire`, `applyMissionResult`). Where nothing in
// the game does what a shot needs, the take writes campaign state directly:
// leads placed one per beat, one lead's days run out, and `outcome` set to the
// two endings one campaign cannot reach both of. After a direct write the
// take calls the session's own changed-callback, so the snapshot and the
// screen follow it as they follow a command.
//
// A take is { frames, frame(f) → clip }: `clip` is the page rectangle (CSS
// px) the capture scales to the output frame, which is how the shots' slow
// zoom and move are done. `page.sound`, when the page passes it, takes the
// cues a take plays ({ f, cue }).
// ---------------------------------------------------------------------------

import { createLoopback } from "../net/loopback.js";
import { connect } from "../net/client.js";
import { createSession } from "../game/session.js";
import { createState, hire, applyMissionResult } from "../game/state.js";
import { config } from "../game/config.js";
import { thresholdFor } from "../game/progression.js";
import { Hub } from "../hub/hub.js";
import { createHubAmbient } from "../hub/ambient.js";
import { FRAMES_PER_BEAT } from "./runner.js";

const SQUAD_IDS = ["vance", "osei", "reyes", "tex"];

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
function lerpRect(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), width: lerp(a.width, b.width, t), height: lerp(a.height, b.height, t) };
}

// A rectangle around `r` at the output's aspect, `pad` px bigger each way.
function framed(r, aspect, pad = 0) {
  let w = r.width + pad * 2, h = r.height + pad * 2;
  if (w / h > aspect) h = w / aspect; else w = h * aspect;
  return { x: r.x + r.width / 2 - w / 2, y: r.y + r.height / 2 - h / 2, width: w, height: h };
}

// Keep a clip inside the page.
function inside(c, W, H) {
  const width = Math.min(c.width, W), height = Math.min(c.height, H);
  return { x: Math.min(Math.max(0, c.x), W - width), y: Math.min(Math.max(0, c.y), H - height), width, height };
}

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

// One campaign, its session and a mounted hub. `leads` seeds that many leads;
// `squad` is hired before the take starts.
function campaign(root, leads = 1, squad = SQUAD_IDS) {
  const keep = { seedLeads: config.seedLeads, leadCount: config.leadCount };
  config.seedLeads = leads;
  config.leadCount = Math.max(leads, keep.leadCount);
  const state = createState();
  Object.assign(config, keep);
  state.money = 100000;
  for (const id of squad) hire(state, id);

  let changed = null;
  const transport = createLoopback((announce, ch) => {
    changed = ch;
    return createSession({ state, players: [{ id: "p1", name: "USA" }], announce, changed: ch });
  });
  const client = connect(transport, "p1");
  const hub = new Hub(root, client.view(), {
    command(cmd, onAnswer) { client.send(cmd, (res) => { if (onAnswer) onAnswer(res); }); },
    roundNext() {},
  });
  transport.watch(() => hub.refresh());
  const ambient = createHubAmbient(client.view());
  document.body.insertBefore(ambient.el, root);
  hub.render();
  return { state, hub, ambient, refresh: () => changed && changed() };
}

const click = (root, sel) => {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`trailer: no "${sel}" on the hub`);
  el.click();
};

// 2 · The Operations board: leads arrive one per beat; one rots away.
function shot2(root, page) {
  const c = campaign(root, 7);
  const world = c.state.world;
  const all = world.leads.slice();
  // The one that rots: three days left, counted down on screen, then gone.
  const rot = all[1];
  rot.daysLeft = 3;
  world.leads = [all[0]];
  c.hub.location = "operations";
  c.refresh();
  const arrive = [1, 2, 3, 4, 5, 6]; // beat → the next lead lands
  let cam = null;
  return {
    frames: 10 * FRAMES_PER_BEAT,
    frame(f) {
      if (f % FRAMES_PER_BEAT === 0) {
        const b = f / FRAMES_PER_BEAT;
        const i = arrive.indexOf(b);
        if (i >= 0 && all[i + 1]) world.leads = [...world.leads, all[i + 1]];
        if (b === 5) rot.daysLeft = 2;
        if (b === 7) rot.daysLeft = 1;
        if (b === 9) world.leads = world.leads.filter((l) => l !== rot);
        if (i >= 0 || b === 5 || b === 7 || b === 9) c.refresh();
      }
      // On the board: a fixed width, easing down after the newest lead and
      // pushing in a little.
      const panel = rectOf(root.querySelector("main.panel"));
      const rows = root.querySelectorAll("main.panel [data-action='predeploy']");
      const last = rows.length ? rectOf(rows[rows.length - 1]) : panel;
      const width = (panel.width + 80) * lerp(1, 0.97, smooth(f / (10 * FRAMES_PER_BEAT)));
      const height = width / page.aspect;
      const want = Math.max(panel.y - 30, last.y + last.height + 60 - height);
      cam ??= want;
      cam += (want - cam) * 0.06;
      return inside({ x: panel.x + panel.width / 2 - width / 2, y: cam, width, height }, page.W, page.H);
    },
  };
}

// 3 · The barracks: four recruits hired one after another, each card moving
// from Recruits Available up into Your Squad. The hub re-renders on a hire, so
// the move is drawn here: the new squad card starts where its recruit card
// was and eases into place (a transform per frame, on the virtual clock).
const HIRES = [["vance", 8], ["osei", 36], ["reyes", 64], ["tex", 92]]; // [id, frame]
const MOVE = 22; // frames a card takes to reach the squad

function shot3(root, page) {
  const c = campaign(root, 1, []);
  c.hub.location = "barracks";
  c.hub.render();
  const frames = 4 * FRAMES_PER_BEAT;
  const panel = () => rectOf(root.querySelector("main.panel"));
  const start = panel();
  const moving = []; // { id, from, at }
  const cardOf = (sel) => root.querySelector(sel)?.closest(".soldier-card");
  return {
    frames,
    frame(f) {
      for (const [id, at] of HIRES) {
        if (f !== at) continue;
        const from = rectOf(cardOf(`[data-action="hire"][data-id="${id}"]`));
        click(root, `[data-action="hire"][data-id="${id}"]`);
        page.sound?.({ f, cue: "ui.click" }); // what src/main.js plays on a hub button
        moving.push({ id, from, at });
      }
      for (const m of moving) {
        // The roster is in hire order, so the squad card is the hire's index.
        const card = root.querySelectorAll(".squad-block .soldier-card")[HIRES.findIndex(([id]) => id === m.id)];
        if (!card) continue;
        card.style.transform = "";
        const to = rectOf(card);
        const t = smooth((f - m.at) / MOVE);
        card.style.transform = t >= 1 ? "" : `translate(${(m.from.x - to.x) * (1 - t)}px, ${(m.from.y - to.y) * (1 - t)}px)`;
        card.style.position = "relative";
        card.style.zIndex = t >= 1 ? "" : "5";
      }
      // The squad block and the recruits under it, a slow push in.
      const from = framed(start, page.aspect, 20);
      const to = framed(start, page.aspect, -30);
      return inside(lerpRect(from, to, smooth(f / frames)), page.W, page.H);
    },
  };
}

// 13 · The barracks: Tex's card is gone; the survivors level up. Then SECTOR
// SECURED, then SECTOR LOST.
function shot13(root, page) {
  const c = campaign(root, 1);
  const { state } = c;
  const world = state.world;
  const lead = world.leads[0];
  // The survivors one mission short of their next level, so this report's
  // XP is what lifts them.
  const rules = world.progression;
  for (const s of state.roster) if (s.id !== "tex") s.xp = Math.max(0, thresholdFor(rules, 2) - Math.max(1, lead.xpReward || 1));
  c.hub.location = "barracks";
  c.refresh();
  const frames = 10 * FRAMES_PER_BEAT;
  return {
    frames,
    frame(f) {
      const b = f / FRAMES_PER_BEAT;
      if (b === 1) {
        // The mission report, by the state's own rule: Tex killed in action,
        // the others back with the lead's XP.
        applyMissionResult(state, {
          missionId: lead.id,
          success: true,
          survivors: state.roster.filter((s) => s.id !== "tex").map((s) => s.id),
          casualties: ["tex"],
          loot: [],
          killsBySoldier: [],
          woundsBySoldier: [],
        });
        c.refresh();
      }
      if (b === 5) { world.wonBy = true; c.refresh(); }
      if (b === 7.5) { world.wonBy = null; world.outcome = "lost"; c.refresh(); }
      if (b < 5) {
        const panel = root.querySelector("main.panel");
        const from = framed(rectOf(panel), page.aspect, 10);
        const to = framed(rectOf(panel), page.aspect, -40);
        return inside(lerpRect(from, to, smooth(f / (5 * FRAMES_PER_BEAT))), page.W, page.H);
      }
      // The end screen with room under it for the card (takes.js, CARDS).
      const r = rectOf(root.querySelector(".end-screen") || root);
      const end = { ...r, height: r.height + 170 };
      const t = (b - (b < 7.5 ? 5 : 7.5)) / 2.5;
      const from = framed(end, page.aspect, 40);
      const to = framed(end, page.aspect, 0);
      return inside(lerpRect(from, to, smooth(t)), page.W, page.H);
    },
  };
}

export const HUB_TAKES = { 2: shot2, 3: shot3, 13: shot13 };
