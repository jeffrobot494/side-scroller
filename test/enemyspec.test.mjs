// EnemySpec foundation: expression language, validation, normalization, templates.
import { parseExpr, evaluate } from "../src/game/enemyspec/expr.js";
import { validateSpec } from "../src/game/enemyspec/validate.js";
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { TEMPLATES } from "../src/game/enemyspec/templates.js";

const clone = (v) => JSON.parse(JSON.stringify(v));
const boss = () => clone(TEMPLATES.find((t) => t.id === "tpl_boss_moth"));
const hasErr = (res, frag) => res.errors.some((e) => (e.path + " " + e.msg).includes(frag));

export default async function run(t) {
  // ---- expressions ---------------------------------------------------------
  const ctx = {
    get: (p) => ({ "self.hpPct": 0.4, "sense.los": true, "sense.dist": 300, "root.vars.rage": 2 }[p] ?? 0),
    fn: (name, args) => (name === "alive" ? args[0] === "leftWing" : name === "abs" ? Math.abs(args[0]) : 0),
  };
  t.eq("expr: arithmetic", evaluate("2 + 3 * 4", ctx), 14);
  t.eq("expr: parens", evaluate("(2 + 3) * 4", ctx), 20);
  t.eq("expr: comparison", evaluate("self.hpPct <= 0.5", ctx), true);
  t.eq("expr: boolean ops", evaluate("self.hpPct < 0.5 && sense.los", ctx), true);
  t.eq("expr: not", evaluate("!sense.los", ctx), false);
  t.eq("expr: function call", evaluate("alive('leftWing')", ctx), true);
  t.eq("expr: bool coerces in arithmetic", evaluate("1 + 2 * (sense.dist > 200)", ctx), 3);
  t.eq("expr: missing ident is 0", evaluate("nope.nothing + 5", ctx), 5);
  t.eq("expr: divide by zero is 0", evaluate("5 / 0", ctx), 0);
  t.eq("expr: numeric constant passthrough", evaluate(7, ctx), 7);
  t.ok("expr: rejects unknown function", throws(() => parseExpr("eval('x')")));
  t.ok("expr: rejects trailing garbage", throws(() => parseExpr("1 + 2 )")));
  t.ok("expr: rejects empty", throws(() => parseExpr("")));
  t.ok("expr: rejects bad chars", throws(() => parseExpr("a ; b")));

  // ---- templates all validate + normalize clean ---------------------------
  for (const tpl of TEMPLATES) {
    const res = validateSpec(tpl);
    t.ok(`template ${tpl.id} validates (${res.errors.map((e) => e.path + ": " + e.msg).join("; ") || "ok"})`, res.ok);
    const n = normalizeSpec(tpl);
    t.ok(`template ${tpl.id} normalizes`, n && n.root && n.brain && n.limits.maxAlive > 0);
  }

  // ---- normalization defaults ---------------------------------------------
  const n = normalizeSpec({ id: "x", root: { health: { max: 10 } } });
  t.eq("normalize: default limits", n.limits.maxAlive, 40);
  t.eq("normalize: root id defaulted", n.root.id, "root");
  t.eq("normalize: visual defaulted", n.root.visual.shape, "box");
  t.eq("normalize: body from visual size", n.root.body.w, n.root.visual.size[0]);
  t.eq("normalize: grounded gravity default", n.root.body.gravity, 1);
  t.eq("normalize: brainless gets idle brain", n.brain.start, "idle");
  const nf = normalizeSpec({ id: "x", root: { health: { max: 10 }, motion: { type: "hover" } } });
  t.eq("normalize: flying motion → gravity 0", nf.root.body.gravity, 0);
  t.eq("normalize: motion params filled", nf.root.motion.amplitude, 14);
  const nl = normalizeSpec({ id: "x", limits: { maxAlive: 9999 }, root: { health: { max: 10 } } });
  t.eq("normalize: limits clamped to cap", nl.limits.maxAlive, 120);
  const np = normalizeSpec({ id: "x", root: { health: { max: 10 }, emitters: { g: { projectile: { damage: 5 } } } } });
  t.eq("normalize: bare damage → effects", np.root.emitters.g.projectile.effects, [{ kind: "damage", amount: 5 }]);
  t.ok("normalize: does not mutate input", !TEMPLATES[0].root.body);

  // ---- intelligence rating ------------------------------------------------
  t.eq("intelligence: tracks brain defaults to 2", normalizeSpec({ id: "x", root: { health: { max: 10 } } }).intelligence, 2);
  const utilSpec = { id: "x", root: { health: { max: 10 } }, brain: { mode: "utility", start: "s", states: { s: { actions: [{ id: "a", score: 1, steps: [{ wait: 0.2 }] }] } } } };
  t.eq("intelligence: utility brain defaults to 3", normalizeSpec(utilSpec).intelligence, 3);
  t.ok("intelligence: out of range rejected", hasErr(validateSpec({ id: "x", intelligence: 9, root: { health: { max: 10 } } }), "intelligence"));
  for (const tpl of TEMPLATES) {
    t.ok(`intelligence: ${tpl.id} rated 1-5`, tpl.intelligence >= 1 && tpl.intelligence <= 5);
  }

  // ---- validation catches -------------------------------------------------
  t.ok("validate: rejects non-object", !validateSpec(null).ok);
  t.ok("validate: missing root", hasErr(validateSpec({ id: "x" }), "root"));
  t.ok("validate: root needs health", hasErr(validateSpec({ id: "x", root: {} }), "root.health"));

  let s = boss();
  s.root.children[0].emitters.missiles.ref = "ghost";
  t.ok("validate: bad emitter ref", hasErr(validateSpec(s), "ghost"));

  s = boss();
  s.brain.states.phase1.transitions[0].to = "nowhere";
  t.ok("validate: bad transition target", hasErr(validateSpec(s), "nowhere"));

  s = boss();
  s.brain.states.phase1.tracks[0].steps = [{ fire: { emitter: "maw" } }];
  t.ok("validate: undelayed infinite loop", hasErr(validateSpec(s), "no blocking step"));

  s = boss();
  s.brain.states.phase1.transitions[0].when = "countAlive('tag:wing' ==";
  t.ok("validate: malformed expression", hasErr(validateSpec(s), "bad expression"));

  s = boss();
  s.brain.states.orphan = { tracks: [] };
  t.ok("validate: unreachable state", hasErr(validateSpec(s), "unreachable"));

  s = boss();
  s.root.children[0].wings = true;
  t.ok("validate: unknown entity key", hasErr(validateSpec(s), "unknown entity key"));

  s = boss();
  s.root.motion = { type: "flap" };
  t.ok("validate: unknown motion", hasErr(validateSpec(s), "unknown motion"));

  s = boss();
  s.defs.shard.on = { destroy: [{ spawn: { ref: "seeker", count: 3 } }] };
  t.ok("validate: spawn cycle rejected", hasErr(validateSpec(s), "recursive spawn cycle"));

  s = boss();
  s.root.children[1].id = "leftWing";
  t.ok("validate: duplicate ids", hasErr(validateSpec(s), "duplicate"));

  s = boss();
  s.root.health.max = 999999;
  t.ok("validate: range check", hasErr(validateSpec(s), "out of range"));

  s = boss();
  s.brain.states.phase1.tracks[0].steps[1].if.then = [{ wait: 1 }];
  t.ok("validate: blocking step inside if rejected", hasErr(validateSpec(s), "blocking action"));

  s = boss();
  s.root.on = { exploded: [{ signal: "x" }] };
  t.ok("validate: unknown event", hasErr(validateSpec(s), "unknown event"));

  s = boss();
  s.brain.states.phase1.tracks[0].steps[1] = { fire: { emitter: "leftWing.missiles" }, wait: 2 };
  t.ok("validate: two action keys in one step", hasErr(validateSpec(s), "exactly one action"));

  // utility-mode checks
  const duel = clone(TEMPLATES.find((x) => x.id === "tpl_duelist"));
  duel.brain.states.duel.actions[0].score = "sense.los &&";
  t.ok("validate: bad utility score expr", hasErr(validateSpec(duel), "bad expression"));
  const duel2 = clone(TEMPLATES.find((x) => x.id === "tpl_duelist"));
  duel2.brain.states.duel.actions = [];
  duel2.brain.states.duel.tracks = undefined;
  t.ok("validate: utility state needs actions", hasErr(validateSpec(duel2), "no actions"));
}

function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}
