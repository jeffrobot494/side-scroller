// Hub ambient layer: mounts headlessly, the scene scales with roster + config,
// figures animate over time, and toggling the config off empties the scene.

import { createHubAmbient } from "../src/hub/ambient.js";
import { createState } from "../src/game/state.js";
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

  amb.setVisible(false);
  t.eq("setVisible(false) hides the canvas", amb.el.style.display, "none");
  amb.dispose();
  t.ok("dispose runs clean", true);

  resetConfig();
}
