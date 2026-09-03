// LLM generation pipeline with a STUBBED client — no live API calls here.
// Covers: accept, repair round with error feedback, double failure, thrown
// parse errors, and the real client's fence-stripping in chatJSON.
import {
  generateEnemySpec, accept, buildSystemPrompt,
  chatEnemySpec, composeChat, unwrapReply, HISTORY_TURNS,
} from "../src/game/enemyspec/generate.js";
import { TEMPLATE_BY_ID } from "../src/game/enemyspec/templates.js";
import { Player2Client } from "../src/player2/client.js";

const clone = (v) => JSON.parse(JSON.stringify(v));
const good = () => clone(TEMPLATE_BY_ID["tpl_shooter"]);
const broken = () => {
  const s = good();
  s.brain.states.fight.tracks[0].steps[1].fire.emitter = "ghost_emitter";
  return s;
};

function stubClient(responses) {
  const calls = [];
  return {
    calls,
    chatJSON: async (messages) => {
      calls.push(messages);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

export default async function run(t) {
  // ---- prompt is built from the live vocabulary ---------------------------
  const prompt = buildSystemPrompt();
  t.ok("prompt: carries the vocabulary", prompt.includes("keepDistance") && prompt.includes("maxSpawnsPerSecond"));
  t.ok("prompt: carries few-shot examples", prompt.includes("tpl_boss_moth") && prompt.includes("tpl_sky_duelist"));
  t.ok("prompt: carries the intelligence rubric", prompt.includes("intelligence rubric") && prompt.includes("aim \"landing\""));
  t.ok("prompt: documents relative targets", prompt.includes("offset:[along,up]") && prompt.includes("lastSeen"));
  t.ok("prompt: asks for the reply envelope", prompt.includes('"reply"') && prompt.includes('"spec"'));
  t.ok("prompt: says a question sets spec to null", prompt.includes("null"));

  // ---- clean first-pass accept -------------------------------------------
  {
    const client = stubClient([good()]);
    const res = await generateEnemySpec(client, "a ranged lurker", { seconds: 3 });
    t.ok("gen: valid spec accepted first pass", res.ok);
    t.eq("gen: one call for a clean pass", client.calls.length, 1);
    t.ok("gen: returns sparse + normalized + report", !!(res.spec && res.normalized && res.report.facts));
  }

  // ---- repair round -------------------------------------------------------
  {
    const client = stubClient([broken(), good()]);
    const res = await generateEnemySpec(client, "a ranged lurker", { seconds: 3 });
    t.ok("gen: repaired spec accepted", res.ok);
    t.eq("gen: repair used a second call", client.calls.length, 2);
    const repairMsg = client.calls[1].at(-1).content;
    t.ok("gen: repair prompt names the actual error", repairMsg.includes("ghost_emitter"));
    t.ok("gen: repair prompt includes the bad attempt", client.calls[1].some((m) => m.role === "assistant"));
  }

  // ---- still broken after repair → rejected -------------------------------
  {
    const client = stubClient([broken(), broken()]);
    const res = await generateEnemySpec(client, "a ranged lurker", { seconds: 3 });
    t.ok("gen: double failure rejected", !res.ok && res.errors.length > 0);
  }

  // ---- model returned garbage --------------------------------------------
  {
    const client = stubClient([new Error("Unexpected token")]);
    const res = await generateEnemySpec(client, "x", { seconds: 3 });
    t.ok("gen: parse failure → ok:false, no throw", !res.ok && res.errors[0].includes("generation failed"));
  }

  // ---- accept() gate directly --------------------------------------------
  {
    const bomb = good();
    bomb.defs = { m: { life: { ttl: 5 }, on: { destroy: [{ spawn: { ref: "m", count: 8 } }] } } };
    const res = accept(bomb, { seconds: 2 });
    t.ok("accept: spawn bomb rejected", !res.ok && res.errors.some((e) => e.includes("recursive spawn cycle")));

    const lazy = { id: "brick", root: { health: { max: 10 } } };
    const res2 = accept(lazy, { seconds: 2 });
    t.ok("accept: do-nothing spec rejected by dry-run", !res2.ok && res2.errors.some((e) => e.startsWith("dry-run:")));
  }

  // ---- the reply envelope -------------------------------------------------
  // The rule that keeps every stubbed case above green: an object with NEITHER
  // envelope key is a bare spec. It is also tolerance for a model that ignores
  // the instruction.
  {
    const bare = unwrapReply(good());
    t.eq("envelope: an object with no envelope key is a bare spec", bare.spec.id, "tpl_shooter");
    t.eq("envelope: and carries no prose", bare.reply, "");

    const wrapped = unwrapReply({ reply: "Built it.", spec: good() });
    t.eq("envelope: a wrapped reply yields both halves", wrapped.spec.id + "|" + wrapped.reply, "tpl_shooter|Built it.");

    const answer = unwrapReply({ reply: "Because keepDistance holds it at 340.", spec: null });
    t.ok("envelope: spec:null is an answer, not a spec", answer.spec === null && answer.reply.length > 0);
    t.ok("envelope: garbage unwraps to nothing rather than throwing",
      unwrapReply(null).spec === null && unwrapReply("nope").spec === null && unwrapReply([1, 2]).spec === null);
  }

  // ---- composing a turn ---------------------------------------------------
  {
    const spec = good();
    const history = [];
    for (let i = 0; i < 12; i++) history.push({ role: i % 2 ? "model" : "you", text: `turn ${i}` });
    const msgs = composeChat({ history, spec, message: "make it faster" });

    t.eq("compose: opens with the system prompt", msgs[0].role, "system");
    t.eq("compose: ends with the instruction", msgs.at(-1).content, "make it faster");
    t.eq("compose: the current spec is the last assistant turn", JSON.parse(msgs.at(-2).content).id, "tpl_shooter");
    t.eq("compose: history is bounded", msgs.length, 1 + HISTORY_TURNS + 2);
    t.ok("compose: and it is the RECENT history", msgs[1].content === `turn ${12 - HISTORY_TURNS}`);
    t.ok("compose: a model turn is sent as the assistant", msgs.some((m) => m.role === "assistant" && m.content === "turn 7"));
    // Approximation 2: superseded specs are never re-sent. Only the current
    // one is, so state cannot go stale — only intent can drift.
    t.eq("compose: exactly one spec rides along", msgs.filter((m) => m.role !== "system" && m.content.includes('"root"')).length, 1);

    const fresh = composeChat({ message: "a floating mine-layer" });
    t.eq("compose: with no enemy in hand there is no spec turn", fresh.length, 2);
  }

  // ---- chatEnemySpec: one entry point, three outcomes ---------------------
  {
    // A question changes nothing.
    const c1 = stubClient([{ reply: "The gate never opens.", spec: null }]);
    const answered = await chatEnemySpec(c1, { spec: good(), message: "why?" }, { seconds: 3 });
    t.eq("chat: no spec → an answer", answered.kind, "answer");
    t.ok("chat: which carries the prose", answered.reply.includes("gate"));

    // An edit runs the same acceptance gate as Save.
    const c2 = stubClient([{ reply: "Done.", spec: good() }]);
    const edited = await chatEnemySpec(c2, { spec: good(), message: "rebuild it" }, { seconds: 3 });
    t.ok("chat: a valid spec → an edit", edited.kind === "edit" && !edited.repaired);
    t.ok("chat: with normalized + report attached", !!(edited.normalized && edited.report.facts));

    // A bad spec buys exactly one repair round, and the envelope survives it.
    const c3 = stubClient([{ reply: "Added.", spec: broken() }, { reply: "Fixed.", spec: good() }]);
    const repaired = await chatEnemySpec(c3, { spec: good(), message: "add a gun" }, { seconds: 3 });
    t.ok("chat: a repaired spec still lands", repaired.kind === "edit" && repaired.repaired);
    t.ok("chat: the repair prompt names the real error", c3.calls[1].at(-1).content.includes("ghost_emitter"));

    // Still bad → nothing lands, and the caller gets the reason.
    const c4 = stubClient([{ reply: "Added.", spec: broken() }, { reply: "Fixed.", spec: broken() }]);
    const failed = await chatEnemySpec(c4, { spec: good(), message: "add a gun" }, { seconds: 3 });
    t.ok("chat: a twice-bad spec fails without throwing", failed.kind === "failed" && failed.errors.length > 0);

    // A repair round that comes back as prose is a failure, not a silent pass.
    const c5 = stubClient([{ reply: "Added.", spec: broken() }, { reply: "Sorry.", spec: null }]);
    const gaveUp = await chatEnemySpec(c5, { spec: good(), message: "add a gun" }, { seconds: 3 });
    t.ok("chat: a repair with no spec is a failure", gaveUp.kind === "failed" && gaveUp.errors.some((e) => e.includes("no spec")));

    const c6 = stubClient([new Error("socket closed")]);
    const dead = await chatEnemySpec(c6, { message: "x" }, { seconds: 3 });
    t.ok("chat: a thrown client is an error result, not a throw", dead.kind === "error" && dead.errors[0].includes("generation failed"));
  }

  // ---- real client fence-stripping ---------------------------------------
  {
    const c = new Player2Client({ gameClientId: "test" });
    c.chat = async () => "```json\n" + JSON.stringify(good()) + "\n```";
    const parsed = await c.chatJSON([]);
    t.eq("client: chatJSON strips markdown fences", parsed.id, "tpl_shooter");
  }
}
