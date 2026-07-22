// LLM generation pipeline with a STUBBED client — no live API calls here.
// Covers: accept, repair round with error feedback, double failure, thrown
// parse errors, and the real client's fence-stripping in chatJSON.
import { generateEnemySpec, accept, buildSystemPrompt } from "../src/game/enemyspec/generate.js";
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
  t.ok("prompt: carries few-shot examples", prompt.includes("tpl_boss_moth") && prompt.includes("tpl_duelist"));

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

  // ---- real client fence-stripping ---------------------------------------
  {
    const c = new Player2Client({ gameClientId: "test" });
    c.chat = async () => "```json\n" + JSON.stringify(good()) + "\n```";
    const parsed = await c.chatJSON([]);
    t.eq("client: chatJSON strips markdown fences", parsed.id, "tpl_shooter");
  }
}
