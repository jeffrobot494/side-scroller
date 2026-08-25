// EnemySpec foundation: expression language, validation, normalization, templates.
import { parseExpr, evaluate } from "../src/game/enemyspec/expr.js";
import { validateSpec } from "../src/game/enemyspec/validate.js";
import { normalizeSpec } from "../src/game/enemyspec/normalize.js";
import { TEMPLATES } from "../src/game/enemyspec/templates.js";
import { ENTITY_KEYS, ENTITY_FIELDS, motionFields, MOTIONS } from "../src/game/enemyspec/schema.js";
import {
  treeNodes, nodeAt, valueAt, setAt, availableAdds, errorCounts,
  addNode, duplicateNode, deleteNode, moveNode, promoteToDef, takenIds,
} from "../src/editor/tools/spec-tree.js";
import { diffSpecs, summarize } from "../src/game/enemyspec/specdiff.js";

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

  // ---- the spec tree (the Enemy Designer's rail, E2) -----------------------
  // The tree is the manual editor, so the bar is: its paths are the validator's
  // paths, and no structural op may produce a spec the validator rejects. The
  // fixtures are the templates this suite already imports.
  {
    const paths = treeNodes(boss()).map((n) => n.path);
    t.ok("tree: the spec node is the root of the rail", paths[0] === "");
    t.ok("tree: the entity tree is walked", paths.includes("root") && paths.includes("root.children[1]"));
    t.ok("tree: emitters hang off their entity", paths.includes("root.children[0].emitters.missiles"));
    t.ok("tree: defs are nodes", paths.includes("defs.seeker"));
    t.ok("tree: brain states, tracks and steps are nodes",
      paths.includes("brain.states.phase1") &&
      paths.includes("brain.states.phase1.tracks[0]") &&
      paths.includes("brain.states.phase1.tracks[0].steps[0]"));
    t.ok("tree: defs and brain are always offered, even when empty",
      treeNodes({ root: { id: "root" } }).some((n) => n.kind === "defs") &&
      treeNodes({ root: { id: "root" } }).some((n) => n.kind === "brain"));
    t.ok("tree: utility actions are nodes too",
      treeNodes(clone(TEMPLATES.find((x) => x.id === "tpl_duelist")))
        .some((n) => n.kind === "uaction"));

    // Paths resolve against the spec — the same strings validate.js reports at.
    const b = boss();
    t.eq("tree: valueAt walks indices and keys", valueAt(b, "root.children[0].id"), "leftWing");
    t.eq("tree: valueAt reaches a step", valueAt(b, "brain.states.phase1.tracks[0].steps[2].wait"), 2.2);
    setAt(b, "root.children[0].visual.size.1", 33);
    t.eq("tree: setAt writes through indices", b.root.children[0].visual.size[1], 33);
    setAt(b, "root.contact", undefined);
    t.ok("tree: setAt(undefined) deletes the key", b.root.contact === undefined);
    t.ok("tree: nodeAt knows what a path is", nodeAt(b, "defs.seeker").kind === "def");
  }

  // Every structural op leaves a spec the validator still accepts. That is the
  // whole promise of the rail: you cannot break the enemy by rearranging it.
  {
    const ops = [
      ["add a child part", (s2) => addNode(s2, "root", "child")],
      ["add an emitter", (s2) => addNode(s2, "root", "emitter")],
      ["add the gun preset", (s2) => addNode(s2, "root", "gun")],
      ["add a def", (s2) => addNode(s2, "defs", "def")],
      ["add a track", (s2) => addNode(s2, "brain.states.phase1", "track")],
      ["add a step", (s2) => addNode(s2, "brain.states.phase1.tracks[0]", "step")],
      ["duplicate a part", (s2) => duplicateNode(s2, "root.children[0]")],
      ["duplicate a def", (s2) => duplicateNode(s2, "defs.seeker")],
      ["duplicate a step", (s2) => duplicateNode(s2, "brain.states.phase1.tracks[0].steps[0]")],
      ["reorder steps", (s2) => moveNode(s2, "brain.states.phase1.tracks[0].steps[0]", 1)],
      // Only unreferenced things can be deleted without consequence — see the
      // dangling-reference case below, which is the documented behaviour.
      ["delete a step", (s2) => deleteNode(s2, "brain.states.fury.tracks[0].steps[1]")],
    ];
    for (const [label, op] of ops) {
      const s2 = boss();
      const res = op(s2);
      const v = validateSpec(s2);
      t.ok(`tree: ${label} → ok`, res.ok);
      t.ok(`tree: ${label} keeps the spec valid${v.ok ? "" : ` (${v.errors[0].path} ${v.errors[0].msg})`}`, v.ok);
      t.ok(`tree: ${label} selects a real node`, !res.ok || nodeAt(s2, res.path) !== null);
    }

    // A duplicate must not collide: two entities with one id is a validation
    // error, and it is the failure a naive deep-clone would ship.
    const dup = boss();
    duplicateNode(dup, "root.children[0]");
    t.ok("tree: duplicating a part re-ids it and its subtree", !hasErr(validateSpec(dup), "duplicate entity id"));
    t.eq("tree: which means one more id", takenIds(dup).size, takenIds(boss()).size + 1);

    // Deleting does NOT repair references to what was deleted — approximation 7
    // in tech/enemy-designer.md. The contract is that the validator SAYS so, on
    // the node holding the dangling reference, rather than the edit being
    // refused or silently rewriting a brain the author did not ask it to touch.
    const del = boss();
    t.ok("tree: deleting a part works", deleteNode(del, "root.children[0]").ok);
    const dv = validateSpec(del);
    t.ok("tree: and leaves the reference to it dangling, flagged (approximation 7)",
      hasErr(dv, "no entity with id 'leftWing'"));
    t.ok("tree: on the node that holds it",
      errorCounts(treeNodes(del), dv.errors)["brain.states.phase1.tracks[0].steps[0]"] >= 1);
    t.ok("tree: an expression naming it stays silent — the known hole",
      !dv.errors.some((e) => String(e.msg).includes("alive('leftWing')")));

    // Promote is a MOVE: a def entry is collected as an entity too, so a copy
    // would be a duplicate id.
    const pro = boss();
    const res = promoteToDef(pro, "root.children[0]");
    t.ok("tree: promote lands the part in defs", res.ok && pro.defs.leftWing !== undefined);
    t.eq("tree: and takes it out of children", pro.root.children.length, 1);
    t.ok("tree: with no duplicate id left behind", !hasErr(validateSpec(pro), "duplicate entity id"));
    t.ok("tree: a def is positioned by its spawner, so `at` does not travel", pro.defs.leftWing.at === undefined);

    // Refusals, so the toolbar can say why rather than silently doing nothing.
    t.ok("tree: the root cannot be deleted", !deleteNode(boss(), "root").ok);
    t.ok("tree: the spec node cannot be deleted", !deleteNode(boss(), "").ok);
    t.ok("tree: the root cannot be duplicated", !duplicateNode(boss(), "root").ok);
    t.ok("tree: only list items reorder", !moveNode(boss(), "root", -1).ok);
    t.ok("tree: only a part promotes to a def", !promoteToDef(boss(), "defs.seeker").ok);
    t.ok("tree: a step cannot host a state", !addNode(boss(), "brain.states.phase1.tracks[0].steps[0]", "state").ok);
    t.ok("tree: add menus are per node kind",
      availableAdds(boss(), "root").some((a) => a.kind === "emitter") &&
      availableAdds(boss(), "brain").some((a) => a.kind === "state") &&
      availableAdds(boss(), "root.emitters.maw").length === 0);
  }

  // Validation marks: an error counts onto its own node AND every ancestor, so
  // a bad step is findable from the spec node down without reading JSON.
  {
    const bad = boss();
    bad.root.children[0].visual.size = [4000, 10]; // out of range
    const v = validateSpec(bad);
    const counts = errorCounts(treeNodes(bad), v.errors);
    t.ok("tree: the offending node is marked", counts["root.children[0]"] >= 1);
    t.ok("tree: and so is the spec node", counts[""] >= 1);
    t.ok("tree: a clean sibling is not", counts["root.children[1]"] === undefined);
  }

  // ---- the spec diff (what a chat turn touched, E3) ------------------------
  // A chat reply carries the WHOLE spec (approximation 1), so the diff is the
  // only thing that says what actually moved. Its paths must be the same
  // addresses the tree and the validator use, or the marks land on nothing.
  {
    const a = boss();

    t.eq("diff: a spec against itself is empty", diffSpecs(a, clone(a)).length, 0);

    // A field change, addressed exactly where the tree addresses it.
    const b = clone(a);
    b.root.health.max = a.root.health.max + 50;
    const one = diffSpecs(a, b);
    t.eq("diff: one field, one change", one.length, 1);
    t.eq("diff: at the path the validator would use", one[0].path, "root.health.max");
    t.eq("diff: carrying both sides", `${one[0].from}→${one[0].to}`, `${a.root.health.max}→${b.root.health.max}`);

    // Adds and deletes are distinguished, because the rail draws them the same
    // but the checkpoint line counts them differently.
    const c = clone(a);
    c.root.children.push({ id: "podMount", health: { max: 25 } });
    const added = diffSpecs(a, c);
    t.eq("diff: a new part is one add", added.length, 1);
    t.eq("diff: at its own tree path", added[0].path, `root.children[${a.root.children.length}]`);
    t.eq("diff: and it reads as an add", added[0].kind, "add");
    t.eq("diff: removing it again reads as a del", diffSpecs(c, a)[0].kind, "del");

    // Flat arrays are one field, not one change per index: `at: [0,-20]` moving
    // is one edit to a reader, and `at` is what the inspector shows.
    const d = clone(a);
    d.root.children[0].at = [99, -10];
    const moved = diffSpecs(a, d);
    t.eq("diff: a flat array is a single leaf", moved.length, 1);
    t.eq("diff: named without an index", moved[0].path, "root.children[0].at");

    // Every path the diff produces must resolve in the spec it describes.
    const e = clone(a);
    const stepCount = e.brain.states.phase1.tracks[0].steps.length;
    e.brain.states.phase1.tracks[0].steps.push({ wait: 0.5 });
    e.root.emitters = { ...(e.root.emitters || {}), extra: { projectile: { speed: 300, damage: 4 } } };
    delete e.name;
    for (const ch of diffSpecs(a, e)) {
      const side = ch.kind === "del" ? a : e;
      t.ok(`diff: '${ch.path}' resolves in the spec it belongs to`, valueAt(side, ch.path) !== undefined);
    }

    // The marks are the error roll-up with a different list — a change list and
    // an error list are both just lists of tree paths, which is why the rail
    // needed no new machinery for E3.
    const nodes = treeNodes(e);
    const marks = errorCounts(nodes, diffSpecs(a, e));
    t.ok("diff: a changed step marks its own node", marks[`brain.states.phase1.tracks[0].steps[${stepCount}]`] > 0);
    t.ok("diff: and its track above it", marks["brain.states.phase1.tracks[0]"] > 0);
    t.ok("diff: the spec node counts every change", marks[""] === diffSpecs(a, e).length);

    // The checkpoint line.
    t.eq("summarize: nothing changed", summarize([]), "no change");
    t.eq("summarize: a new part is counted as one", summarize(added), "+1 part");
    t.eq("summarize: a removed part too", summarize(diffSpecs(c, a)), "−1 part");
    t.eq("summarize: plain fields are counted as fields", summarize(one), "1 field");
    // A whole-body swap — the first generation — is counted, not summarised
    // away: the same numbers the marks in the rail show.
    // A container changing as a unit counts its MEMBERS: one del of
    // root.children is still every part gone.
    const swapped = summarize(diffSpecs(a, { ...clone(a), root: { health: { max: 5 } } }));
    t.ok("summarize: a whole-body swap counts the parts it removed", swapped.includes(`\u2212${a.root.children.length} parts`));
    t.ok("summarize: and the fields it changed", /\d+ fields/.test(swapped));
  }

  // ---- ENTITY_FIELDS: authoring metadata, not vocabulary ------------------
  // The test can only assert that it keys off components that already exist —
  // ENTITY_KEYS names components, not leaves (approximation 9).
  {
    const keys = Object.keys(ENTITY_FIELDS);
    t.ok(`fields: every key is a component in ENTITY_KEYS (${keys.join(", ")})`,
      keys.every((k) => ENTITY_KEYS.includes(k)));
    const all = keys.flatMap((k) => ENTITY_FIELDS[k]);
    t.ok("fields: every field has a label and a control type", all.every((f) => f.label && f.type));
    t.ok("fields: every enum field carries its options", all.filter((f) => f.type === "enum").every((f) => Array.isArray(f.options) && f.options.length));
    t.ok("fields: every number field carries bounds", all.filter((f) => f.type === "number").every((f) => Number.isFinite(f.min) && Number.isFinite(f.max) && f.step > 0));
    t.ok("fields: every field declares a default", all.every((f) => f.default !== undefined));
    // motionFields is the per-controller half: the type picker plus that
    // controller's own params, which MOTIONS is the source of.
    for (const type of Object.keys(MOTIONS)) {
      const fields = motionFields(type);
      const params = Object.keys(MOTIONS[type].params);
      t.ok(`fields: motion '${type}' offers its type and all ${params.length} param(s)`,
        fields[0].key === "type" && params.every((pk) => fields.some((f) => f.key === pk)));
    }
  }
}

function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}
