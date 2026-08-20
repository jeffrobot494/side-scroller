// Hub ambient layer: mounts headlessly, the scene scales with roster + config,
// figures animate over time, and toggling the config off empties the scene.

import { createHubAmbient } from "../src/hub/ambient.js";
import { createState, hire, livingRoster } from "../src/game/state.js";
import { config, resetConfig } from "../src/game/config.js";

export default async function run(t) {
  resetConfig();
  const game = createState();
  const amb = createHubAmbient(game);

  t.ok("mounts a canvas element", amb.el && amb.el.tagName === "canvas");
  const seeded = amb.people().length;
  t.ok("builds a populated scene at mount", seeded > 0);
  t.ok("crew stays within the cap", seeded <= 17);
  t.ok(
    "every figure has a known activity",
    amb.people().every((p) => ["desk", "talk", "console", "idle"].includes(p.activity))
  );

  const before = amb.people().map((p) => p.t);
  for (let i = 0; i < 60; i++) amb.step(1 / 30);
  const after = amb.people().map((p) => p.t);
  t.ok(
    "figures animate over time",
    after.every((v, i) => v > before[i])
  );

  config.hubAmbienceDensity = 2;
  amb.step(1 / 30);
  t.ok("density knob grows the crew", amb.people().length > seeded);

  config.hubAmbience = false;
  amb.step(1 / 30);
  t.eq("disabling ambience clears the scene", amb.people().length, 0);

  config.hubAmbience = true;
  amb.step(1 / 30);
  t.ok("re-enabling repopulates the scene", amb.people().length > 0);

  // The hot-seat swap re-points this at another commander's base (S2). The crew
  // scales with the living roster, so a base with more soldiers has more of it.
  //
  // Assert the DIRECTION, never an exact count: rebuild() fills stations until
  // the target is used up and `talk` seats two, so the last slot can reject a
  // pair and stop the fill one short. The realised crowd is a draw at or just
  // below the target, and two rebuilds at the SAME target legitimately differ.
  // An earlier version of this case asserted exact equality and failed ~40% of
  // runs. The gap here is wide on purpose — an empty base targets 3, a base of
  // five targets 8 — so no draw can cross it.
  {
    const busy = createState();
    busy.money = 99999; // credit limits are a different test, and would cap the roster at 2
    for (let i = 0; i < 5; i++) hire(busy, busy.recruits[0].id);
    t.eq("the busy base really has five soldiers", livingRoster(busy).length, 5);

    const quiet = amb.people().length;
    amb.setView(busy);
    amb.step(1 / 30);
    const crowded = amb.people().length;
    t.ok("setView re-points the crowd at another base", crowded > quiet);
    amb.setView(game);
    amb.step(1 / 30);
    t.ok("...and swapping back thins it out again", amb.people().length < crowded);
  }

  amb.setVisible(false);
  t.eq("setVisible(false) hides the canvas", amb.el.style.display, "none");
  amb.dispose();
  t.ok("dispose runs clean", true);

  resetConfig();
}
