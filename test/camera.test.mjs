// Mission camera math (src/mission/camera.js). The camera is the one part of
// mission.js that is testable — everything else there needs a real canvas.
//
// The golden cases below reproduce, by hand, what the original X-only camera
// computed (targetX = s.x + s.w/2 - canvas.width*0.4, clamped to
// [0, world.width - canvas.width], y always 0). They are the regression bar for
// "zoom 1 on the classic canvas changes nothing".
import { solveCamera, solveCamera3D, parseCanvasSize, DESIGN_W, DESIGN_H } from "../src/mission/camera.js";
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
    // The INVARIANT, not the number: the schema's default and the value the
    // game runs on with no override must agree, and the default must be one of
    // the sizes the enum offers. Pinned as literals until the viewport defaults
    // were retuned, which reddened four assertions that were only ever saying
    // "these two agree" the long way round.
    t.eq("live config takes the schema's canvas default", config.missionCanvas, byKey.missionCanvas.default);
    t.eq("live config takes the schema's zoom default", config.missionZoom, byKey.missionZoom.default);
    t.ok("the canvas default is one of the offered sizes", byKey.missionCanvas.options.includes(byKey.missionCanvas.default));
    t.ok("the canvas default parses to a real size", parseCanvasSize(byKey.missionCanvas.default).w > 0);
    t.ok("zoom cannot reach 0", byKey.missionZoom.min > 0);
  }

  // ---- the 3D view's camera (tech/mission-3d.md) --------------------------
  // The invariant: the perspective camera's z=0 slice IS this frame's 2D view,
  // rounded scroll and shake included, so a world point on the plane lands on
  // the pixel the 2D transform puts it on. Projected here by hand through a
  // straight-on pinhole — the only kind the solve may produce.
  {
    const project = (c, W, H, wx, wy) => {
      const t = Math.tan((c.fov * Math.PI) / 360) * c.position.z;
      const nx = (wx - c.position.x) / (t * c.aspect);
      const ny = (-wy - c.position.y) / t;
      return { x: ((nx + 1) / 2) * W, y: ((1 - ny) / 2) * H };
    };
    const screen2d = (cam, z, sx, sy, wx, wy) => ({
      x: wx * z - Math.round(cam.x * z) + sx,
      y: wy * z - Math.round(cam.y * z) + sy,
    });
    let worst = 0, tilted = 0, cases = 0;
    for (const preset of ["960x540", "1280x720", "1600x900"]) {
      const { w: W, h: H } = parseCanvasSize(preset);
      for (const z of [0.5, 0.75, 1, 1.05, 1.5]) {
        for (const cam of [{ x: 0, y: 0 }, { x: 1234.567, y: -360.2 }, { x: 4999.3, y: 12.5 }]) {
          for (const [sx, sy] of [[0, 0], [3.2, -4.7], [-7, 7]]) {
            const c = solveCamera3D(cam, z, W, H, sx, sy);
            cases++;
            if (c.position.x !== c.target.x || c.position.y !== c.target.y || c.target.z !== 0) tilted++;
            for (const [wx, wy] of [[cam.x, cam.y], [cam.x + 300, cam.y + 200], [cam.x + W / z, cam.y + H / z], [cam.x - 50, cam.y + 90]]) {
              const a = project(c, W, H, wx, wy), b = screen2d(cam, z, sx, sy, wx, wy);
              worst = Math.max(worst, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
            }
          }
        }
      }
    }
    t.ok(`3d camera: the z=0 plane lands on the 2D pixels across ${cases} cases (worst ${worst.toExponential(1)}px)`, worst < 1e-6);
    t.eq("3d camera: it never tilts or yaws — position sits on the target's axis", tilted, 0);
    const c = solveCamera3D({ x: 100, y: 0 }, 1, 960, 540, 5, 0);
    const still = solveCamera3D({ x: 100, y: 0 }, 1, 960, 540);
    t.eq("3d camera: shake moves the camera sideways, not its distance", c.position.z, still.position.z);
    t.eq("3d camera: ...by exactly the shake, opposite in sign (the view moves, not the world)", still.position.x - c.position.x, 5);
    t.eq("3d camera: the view rectangle is the 2D one", `${c.view.width}x${c.view.height}`, "960x540");
  }
}
