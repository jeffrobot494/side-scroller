// Editor tools boot headlessly (mount → no throw → dispose), plus a real-AI
// behavior check that the Enemy Designer preview relies on (a shooter fires).
import { installDom, makeEl, windowListenerCount } from "./harness.mjs";
import { createWeaponDesigner } from "../src/editor/tools/weapon-designer.js";
import { createEnemyDesigner } from "../src/editor/tools/enemy-designer.js";
import { createLevelGenerator } from "../src/editor/tools/level-generator.js";
import { createFiringRoom } from "../src/editor/tools/firing-room.js";
import { createSoundPage } from "../src/editor/sound-page.js";
import { controlsTabsHTML, showControlsTab } from "../src/editor/controls.js";
import { SCHEMA, config, resetConfig, setConfig, isDefault } from "../src/game/config.js";
import { Soldier } from "../src/mission/entities.js";
import { instantiate, updateSpecEnemy } from "../src/mission/enemyspec/runtime.js";
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { MissionInput } from "../src/mission/input.js";

function mountable(t, name, factory) {
  installDom();
  let threw = null, tool = null;
  try {
    tool = factory(makeEl(), () => {});
  } catch (e) {
    threw = e;
  }
  t.ok(`${name}: mount does not throw`, !threw);
  if (threw) console.log("   ", threw && threw.stack);
  t.ok(`${name}: returns dispose()`, tool && typeof tool.dispose === "function");
  try {
    tool && tool.dispose();
    t.ok(`${name}: dispose does not throw`, true);
  } catch {
    t.ok(`${name}: dispose does not throw`, false);
  }
}

export default async function run(t) {
  mountable(t, "weapon-designer", createWeaponDesigner);
  mountable(t, "enemy-designer", createEnemyDesigner);
  mountable(t, "level-generator", createLevelGenerator);
  mountable(t, "firing-room", createFiringRoom);
  // The Sound page is not a Tools-tab panel but follows the same
  // createX(container) → { dispose() } contract, so it gets the same bar.
  mountable(t, "sound-page", createSoundPage);

  // The Weapon Designer re-renders its whole shell on load. That path rebuilds
  // the canvas, the effect rows, the sound rows and the saved list in one go,
  // so drive a real load and then keep using the tool: a missed re-query or a
  // panel left unrendered surfaces as a throw here. (Whether the NEW canvas is
  // the one being drawn into is invisible to this harness — that stays an
  // eyeball check, per docs/WEAPON-DESIGNER.md.)
  {
    installDom();
    let threw = null;
    try {
      const wd = createWeaponDesigner(makeEl(), () => {});
      // scattergun exercises a delivery effect (pellets) through the schema
      // rows and the preview's pellet fan; incinerator carries burn.
      wd.load("builtin", "scattergun");
      wd.load("builtin", "incinerator");
      wd.dispose();
    } catch (e) {
      threw = e;
    }
    t.ok("weapon-designer: load re-renders without throwing", !threw);
    if (threw) console.log("   ", threw && threw.stack);
  }

  // ---- Enemy Designer: the preview is a fight you drive (E1) -------------
  // Driven through the tool's own `drive()` hook, the way the Weapon Designer
  // is driven through `load()`. The load-bearing part is the keyboard handover:
  // MissionInput binds WINDOW keydown and preventDefaults every bound key, so a
  // stage that takes the keys and never releases them would drive the soldier
  // while you type in the name field or the JSON panel.
  {
    installDom();
    const ed = createEnemyDesigner(makeEl(), () => {});
    t.eq("enemy-designer: mounting takes no window keys", windowListenerCount("keydown"), 0);

    const start = ed.drive({}, 1);
    const idle = ed.drive({ right: true }, 20);
    t.ok("enemy-designer: unfocused, holding D does not move the soldier", idle.x === start.x);
    t.ok("enemy-designer: and fires nothing", ed.drive({ fire: true }, 6).shots === 0);

    t.ok("enemy-designer: focusing the stage takes the keyboard", ed.takeKeys(true) === true);
    t.eq("enemy-designer: which is one window keydown handler", windowListenerCount("keydown"), 1);

    const ran = ed.drive({ right: true }, 20);
    t.ok("enemy-designer: focused, D runs the soldier right", ran.x > start.x);
    const ducked = ed.drive({ crouch: true }, 2);
    t.ok("enemy-designer: S drops the hitbox to a knee", ducked.h < start.h);
    const shot = ed.drive({ fire: true }, 4);
    t.ok("enemy-designer: fire spawns a real projectile", shot.shots > 0);
    t.ok("enemy-designer: and it costs a round", shot.ammo < start.ammo);

    ed.takeKeys(false);
    t.eq("enemy-designer: blurring gives the keyboard back", windowListenerCount("keydown"), 0);

    ed.takeKeys(true);
    ed.dispose();
    t.eq("enemy-designer: dispose releases the keyboard too", windowListenerCount("keydown"), 0);
  }

  // ---- Enemy Designer: the tree rail drives the spec (E2) ----------------
  // spec-tree.js is unit-tested in enemyspec.test.mjs; what belongs HERE is the
  // tool holding it correctly — that selection survives a structural edit, that
  // the toolbar reports a refusal instead of failing silently, and that an edit
  // through the rail reaches the spec the preview and Save actually use.
  {
    installDom();
    const { validateSpec } = await import("../src/game/enemyspec/validate.js");
    const ed = createEnemyDesigner(makeEl(), () => {});

    t.eq("enemy-designer: the rail opens on the spec node", ed.selected(), "");
    ed.select("root");
    const added = ed.op("add", "gun");
    t.ok("enemy-designer: adding the gun preset selects the new emitter", added.ok && ed.selected() === added.path);
    t.ok("enemy-designer: the preset seeds a brain that pulls the trigger",
      ed.tree().some((n) => n.kind === "step" && n.label.startsWith("fire")));
    t.ok("enemy-designer: and the spec still validates", validateSpec(ed.specNow()).ok);

    const before = ed.tree().length;
    ed.select("root");
    ed.op("add", "child");
    t.ok("enemy-designer: adding a part grows the tree", ed.tree().length > before);
    const part = ed.selected();
    ed.op("dup");
    t.ok("enemy-designer: duplicating selects the copy, not the original", ed.selected() !== part);
    ed.op("del");
    t.ok("enemy-designer: deleting selects the container, never nothing",
      ed.tree().some((n) => n.path === ed.selected()));

    // A refusal must be visible: the toolbar acts on the selection, and the
    // selection is often something that cannot host the op.
    ed.select("");
    const refused = ed.op("del");
    t.ok("enemy-designer: deleting the spec node is refused, with a reason", !refused.ok && !!refused.error);
    t.eq("enemy-designer: and changes nothing", ed.selected(), "");

    ed.dispose();
  }

  // With a saved EnemySpec in the library, both tools still mount (the Firing
  // Room renders the "Designed" optgroup; the Designer lists the library row).
  {
    const { saveEnemySpec } = await import("../src/game/customcontent.js");
    const { TEMPLATE_BY_ID } = await import("../src/game/enemyspec/templates.js");
    saveEnemySpec(JSON.parse(JSON.stringify(TEMPLATE_BY_ID.tpl_shooter)));
    mountable(t, "enemy-designer (with library)", createEnemyDesigner);
    mountable(t, "firing-room (with spec library)", createFiringRoom);
  }

  // Real AI: an EnemySpec shooter telegraphs then fires (the preview's building
  // block) — the spec runtime that now drives every mission enemy.
  const data = { id: "s1", name: "Rook", callsign: "RK", stats: { health: 5, aim: 5, speed: 5 } };
  const w = { id: "rifle", name: "R", fireMode: "projectile", fireRate: 7, spread: 0, projectile: { speed: 900, w: 12, h: 4, color: "#fff", life: 1 }, effects: [] };
  const tgt = new Soldier(data, w, 620, 254);
  const shooterSpec = normalizeSpec({
    v: 1, id: "td_shooter", name: "TD Shooter", threat: 70,
    root: {
      id: "root", tags: ["enemy"], visual: { shape: "box", size: [32, 44] }, health: { max: 50 },
      motion: { type: "keepDistance", min: 260, max: 420, speed: 140 },
      emitters: { gun: { at: [0, -6], projectile: { speed: 460, w: 14, h: 14, color: "#8affc1", life: 2.2, damage: 14 } } },
    },
    brain: { start: "fight", states: { fight: { tracks: [{ id: "shoot", loop: true, steps: [
      { telegraph: { time: 0.5 } }, { fire: { emitter: "gun", pattern: "aimed" } }, { wait: 1.4 },
    ] }] } } },
  });
  const foe = instantiate(shooterSpec, 80, 300 - 44); // rest on the ground slab (y=300)
  const scene = { world: { gravity: 2000, width: 760, height: 360 }, platforms: [{ x: 0, y: 300, w: 760, h: 60 }], soldiers: [tgt], enemies: [], projectiles: [] };
  const noop = { friendlyFire: false, damageMult: 1, damage() {}, kill() {}, spark() {}, burst() {} };
  let fired = false;
  for (let i = 0; i < 400 && !fired; i++) {
    updateSpecEnemy(foe, 0.03, scene, noop);
    if (scene.projectiles.length > 0) fired = true;
  }
  t.ok("real AI: shooter produces a projectile", fired);

  // MissionInput (drives the Firing Room's manual mode) maps keys + cleans up.
  {
    const inp = new MissionInput();
    inp.enable(); // harness provides no-op window listeners
    inp._set({ code: "KeyD", preventDefault() {} }, true);
    inp._set({ code: "KeyS", preventDefault() {} }, true);
    t.ok("input: D → right", inp.isDown("right"));
    t.ok("input: S → crouch", inp.isDown("crouch"));
    inp.disable();
    t.ok("input: disable clears state", !inp.isDown("right") && !inp.isDown("crouch"));
  }

  // ---- Settings: one group per tab, not one long scroll --------------------
  // The renderer is a pure string function, so the layout is assertable without
  // a DOM. What matters: every group reachable, exactly one visible at a time,
  // and the tab strip flagging which groups hold a change.
  {
    resetConfig();
    const settings = SCHEMA.filter((g) => g.title !== "Sound"); // the Sound tab owns those
    const html = controlsTabsHTML(settings, config, isDefault, 0);
    const tabs = [...html.matchAll(/data-cfg-tab="(\d+)"/g)].map((m) => m[1]);
    const panels = [...html.matchAll(/data-cfg-panel="(\d+)"(\s*hidden)?/g)];

    t.eq(`tabs: one per schema group (${settings.length})`, tabs.length, settings.length);
    t.eq("tabs: one panel per group too", panels.length, settings.length);
    t.eq("tabs: exactly one panel is visible", panels.filter((m) => !m[2]).length, 1);
    t.eq("tabs: and it is the requested one", panels.findIndex((m) => !m[2]), 0);
    t.ok("tabs: every group title is on a tab", settings.every((g) => html.includes(`>${g.title}<`)));
    // Every knob still renders — tabbing must not drop controls off the page.
    const rows = [...html.matchAll(/data-row="/g)].length;
    const all = settings.reduce((n, g) => n + g.items.length, 0);
    t.eq(`tabs: every setting still has a row (${all})`, rows, all);

    const later = controlsTabsHTML(settings, config, isDefault, 3);
    const p3 = [...later.matchAll(/data-cfg-panel="(\d+)"(\s*hidden)?/g)];
    t.eq("tabs: a different active index opens a different panel", p3.findIndex((m) => !m[2]), 3);

    // The changed dot: a non-default value lights its own tab and no other.
    const target = settings.findIndex((g) => g.items.some((it) => it.type === "bool"));
    const knob = settings[target].items.find((it) => it.type === "bool");
    setConfig(knob.key, !config[knob.key]);
    const dirty = controlsTabsHTML(settings, config, isDefault, 0);
    const flagged = [...dirty.matchAll(/data-cfg-tab="(\d+)"\s*\n?\s*class="[^"]*changed/g)].map((m) => Number(m[1]));
    t.ok(`tabs: the group holding a change is flagged (${settings[target].title})`, flagged.includes(target));
    t.eq("tabs: and only that group", flagged.length, 1);
    resetConfig();
  }

  // ---- showControlsTab swaps panels in place -------------------------------
  // Switching must not re-render: the caller binds events once, and a rebuild
  // would wipe a half-typed Import textarea. Driven against a minimal fake root
  // because the shared harness element does not implement querySelectorAll.
  {
    const mk = (attr, i) => {
      const el = { dataset: { [attr]: String(i) }, hidden: i !== 0, _cls: new Set(i === 0 ? ["active"] : []), _aria: null };
      el.setAttribute = (k, v) => { if (k === "hidden") el.hidden = true; else el._aria = v; };
      el.removeAttribute = (k) => { if (k === "hidden") el.hidden = false; };
      el.classList = { toggle: (c, on) => (on ? el._cls.add(c) : el._cls.delete(c)) };
      return el;
    };
    const panels = [0, 1, 2].map((i) => mk("cfgPanel", i));
    const tabs = [0, 1, 2].map((i) => mk("cfgTab", i));
    const root = { querySelectorAll: (sel) => (sel.includes("panel") ? panels : tabs) };

    const shown = showControlsTab(root, 2);
    t.eq("switch: returns the index it opened", shown, 2);
    t.ok("switch: only the chosen panel is visible", panels.filter((p) => !p.hidden).length === 1 && !panels[2].hidden);
    t.ok("switch: the active tab moved with it", tabs[2]._cls.has("active") && !tabs[0]._cls.has("active"));
    t.eq("switch: out-of-range is clamped, never a blank page", showControlsTab(root, 99), 2);
    t.eq("switch: and a junk index falls back to the first", showControlsTab(root, "nope"), 0);
  }
}
