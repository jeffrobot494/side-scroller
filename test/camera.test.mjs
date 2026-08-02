// Mission camera math (src/mission/camera.js). The camera is the one part of
// mission.js that is testable — everything else there needs a real canvas.
//
// The golden cases below reproduce, by hand, what the original X-only camera
// computed (targetX = s.x + s.w/2 - canvas.width*0.4, clamped to
// [0, world.width - canvas.width], y always 0). They are the regression bar for
// "zoom 1 on the classic canvas changes nothing".
import { solveCamera, parseCanvasSize, DESIGN_W, DESIGN_H } from "../src/mission/camera.js";
import { SCHEMA, config } from "../src/game/config.js";

const WORLD = { width: 6000, height: 540 };
const soldier = (x, y = 460) => ({ x, y, w: 22, h: 46 });

export default async function run(t) {
  // ---- golden: the classic 960x540 viewport at zoom 1 --------------------
  {
    // mid-level: the lead term is the whole story
    const c = solveCamera(soldier(2000), 960, 540, WORLD);
    t.eq("golden mid x", c.x, 2000 + 11 - 384);
    t.eq("golden mid y", c.y, 0);

    // at spawn the left clamp bites
    t.eq("golden spawn x", solveCamera(soldier(120), 960, 540, WORLD).x, 0);

    // at the far end the right clamp bites
    t.eq("golden end x", solveCamera(soldier(5900), 960, 540, WORLD).x, 6000 - 960);

    // the last position before the right clamp engages is still exact
    const edge = solveCamera(soldier(5400), 960, 540, WORLD);
    t.eq("golden pre-clamp x", edge.x, 5400 + 11 - 384);
    t.ok("golden pre-clamp under max", edge.x < 6000 - 960);

    // y is 0 for every x, because viewH === world.height
    t.ok("golden y always 0", [0, 120, 2000, 5900].every((x) => solveCamera(soldier(x), 960, 540, WORLD).y === 0));
  }

  // ---- bottom anchoring when the viewport is taller than the world -------
  {
    // 1600x900 at zoom 1: 900 visible world px vs a 540 world
    const c = solveCamera(soldier(2000), 1600, 900, WORLD);
    t.eq("tall viewport y", c.y, 540 - 900);
    // the whole point: the world's bottom edge lands on the canvas bottom
    t.eq("world bottom hits canvas bottom", (WORLD.height - c.y) * 1, 900);

    // and again through a zoom rather than a preset: 960x540 at zoom 0.6
    const z = 0.6, viewW = 960 / z, viewH = 540 / z;
    const c2 = solveCamera(soldier(2000), viewW, viewH, WORLD);
    t.eq("zoomed-out y", c2.y, WORLD.height - viewH);
    t.eq("zoomed-out bottom on canvas bottom", Math.round((WORLD.height - c2.y) * z), 540);

    // the lead is proportional, so zooming out puts the soldier further in
    t.eq("zoomed-out x", c2.x, 2000 + 11 - viewW * 0.4);
  }

  // ---- a world narrower than the viewport must not scroll off the left ---
  {
    const narrow = { width: 800, height: 540 };
    t.eq("narrow world x", solveCamera(soldier(400), 1600, 900, narrow).x, 0);
    t.eq("narrow world x at right edge", solveCamera(soldier(790), 1600, 900, narrow).x, 0);
  }

  // ---- vertical follow when zoomed IN (viewH < world.height) -------------
  {
    const viewH = 400; // zoom 1.35 on a 540-tall canvas
    const high = solveCamera(soldier(2000, 60), 700, viewH, WORLD);
    t.eq("follow up top clamps to 0", high.y, 0);

    const low = solveCamera(soldier(2000, 460), 700, viewH, WORLD);
    t.eq("follow down clamps to world floor", low.y, WORLD.height - viewH);

    const mid = solveCamera(soldier(2000, 250), 700, viewH, WORLD);
    t.eq("follow mid centres the soldier", mid.y, 250 + 23 - 200);
    t.ok("follow mid in bounds", mid.y > 0 && mid.y < WORLD.height - viewH);
  }

  // ---- canvas presets ----------------------------------------------------
  {
    const opts = SCHEMA.find((g) => g.title === "Viewport")
      .items.find((i) => i.key === "missionCanvas").options;
    t.ok("every preset parses", opts.every((o) => /^\d+x\d+$/.test(o)));
    // _uiScale() maps the 960x540 design space onto a preset with ONE factor,
    // which only holds while every preset is 16:9.
    t.ok("every preset is 16:9", opts.every((o) => {
      const { w, h } = parseCanvasSize(o);
      return Math.abs(w / h - 16 / 9) < 1e-9;
    }));
    t.eq("preset parses w", parseCanvasSize("1600x900").w, 1600);
    t.eq("preset parses h", parseCanvasSize("1600x900").h, 900);
    t.eq("garbage falls back to design w", parseCanvasSize("wat").w, DESIGN_W);
    t.eq("undefined falls back to design h", parseCanvasSize(undefined).h, DESIGN_H);
  }

  // ---- schema shape: the defaults must be today's behaviour --------------
  {
    const group = SCHEMA.find((g) => g.title === "Viewport");
    t.ok("Viewport group exists", !!group);
    const byKey = Object.fromEntries(group.items.map((i) => [i.key, i]));
    t.eq("canvas default is the classic size", byKey.missionCanvas.default, "960x540");
    t.eq("zoom default is 1", byKey.missionZoom.default, 1);
    t.ok("zoom cannot reach 0", byKey.missionZoom.min > 0);
    t.eq("live config zoom defaults to 1", config.missionZoom, 1);
    t.eq("live config canvas defaults to the classic size", config.missionCanvas, "960x540");
  }
}
