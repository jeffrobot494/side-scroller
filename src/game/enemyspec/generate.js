// ---------------------------------------------------------------------------
// LLM GENERATION — one CONVERSATION that authors and revises an EnemySpec.
//
// There is exactly one entry point, `chatEnemySpec`. Generating and revising
// differ only in whether a spec is attached to the request, so they are the
// same call (tech/enemy-designer.md, E3); `generateEnemySpec` is a thin
// single-turn wrapper kept for its callers and its suite.
//
//   messages → client.chatJSON → { reply, spec }   (the envelope)
//     no spec → it was a question: prose only, the enemy is untouched
//        spec → validateSpec → normalizeSpec → dryRunSpec
//          ok → { kind:"edit", spec (sparse), normalized, report }
//        fail → ONE repair round (errors fed back verbatim) → accept or
//               { kind:"failed" } — never a throw, never an unvalidated spec.
//
// THE ENVELOPE: a reply is ONE JSON object carrying prose and, optionally, a
// spec. It is unwrapped before `accept()` ever sees it, and an object with
// NEITHER envelope key is treated as a bare spec — which is both backwards
// compatibility for `generateEnemySpec`'s stubbed suite and tolerance for a
// model that ignores the instruction.
//
// HISTORY is prose only and bounded (approximation 2): superseded specs are
// never re-sent, and the CURRENT spec always is, so state cannot go stale —
// only intent can drift.
//
// The client is INJECTED (the editor owns the Player2Client instance and its
// auth); this module never constructs one, so tests drive the pipeline with a
// stub. The prompt's vocabulary reference is generated from schema.js and its
// few-shot examples are the shared templates, so the prompt can't drift from
// the engine.
// ---------------------------------------------------------------------------

import { vocabularyDoc } from "./schema.js";
import { validateSpec } from "./validate.js";
import { normalizeSpec } from "./normalize.js";
import { dryRunSpec } from "./dryrun.js";
import { TEMPLATE_BY_ID } from "./templates.js";

// Few-shots: one simple tracks enemy, one multi-part boss (shows children/defs/
// signals), one utility brain (the Sky Duelist also demonstrates flight —
// altitude hover, relative-target strafing passes, lastSeen hunting).
const FEWSHOT_IDS = ["tpl_shooter", "tpl_boss_moth", "tpl_sky_duelist"];

// The reply shape. Prose and spec travel together in one object because the
// reply is not streamed (approximation 3) and one object keeps parse failures
// rare. `spec: null` is how the model answers a question without touching the
// enemy — that case is what makes the chat usable for diagnosis, not just
// authoring.
const ENVELOPE = [
  "Reply with EXACTLY ONE JSON object and nothing else — no prose outside it, no markdown fences:",
  '{ "reply": "<1-3 plain sentences: what you changed and why, or the answer to the question>", "spec": <a complete EnemySpec object, or null> }',
  'Set "spec" to null when the message is a question, a diagnosis, or anything that should not change the enemy. When you do change it, "spec" is the WHOLE spec — every key, not a patch — and it replaces what came before.',
  "The enemy as it currently stands is given to you as the last assistant message; if none is given, you are creating one from nothing.",
].join("\n");

export function buildSystemPrompt() {
  const examples = FEWSHOT_IDS.map(
    (id) => `Example (${TEMPLATE_BY_ID[id].role}):\n${JSON.stringify(TEMPLATE_BY_ID[id])}`
  ).join("\n\n");
  return [
    "You design enemies for a 2D run-and-gun side-scroller (pixels, gravity 2000, the player is a soldier ~30x46 px on platforms).",
    ENVELOPE,
    "",
    vocabularyDoc(),
    "",
    "Design principles: a coherent combat role, readable telegraphs before attacks, real weaknesses, destructible parts where they create decisions. Compose the vocabulary freely but never invent keys, motions, actions, patterns, or functions that are not listed above.",
    "",
    examples,
  ].join("\n");
}

// How many prior turns of prose ride along. Bounded on purpose: the current
// spec is attached every time, so more history buys remembered INTENT, not
// remembered state.
export const HISTORY_TURNS = 6;

/**
 * Build the message list for one conversation turn. Exported so the composer
 * can price a turn (approximation 1's token readout) with the exact messages
 * that would be sent, rather than an estimate of them.
 *
 * @param {{ history?: Array<{role:string, text:string}>, spec?: object|null, message: string }} turn
 * @returns {Array<{role:string, content:string}>}
 */
export function composeChat({ history = [], spec = null, message = "" } = {}) {
  const messages = [{ role: "system", content: buildSystemPrompt() }];
  // Prose only, oldest first. A synthetic "sys" line (E5's manual edits, a
  // rewind) rides as a user turn — it is context, not an instruction.
  for (const t of history.slice(-HISTORY_TURNS)) {
    if (!t || !t.text) continue;
    messages.push({ role: t.role === "model" ? "assistant" : "user", content: t.text });
  }
  // The enemy as it stands, in the same position the repair round puts a bad
  // attempt: the last assistant turn before the instruction.
  if (spec) messages.push({ role: "assistant", content: JSON.stringify(spec) });
  messages.push({ role: "user", content: message });
  return messages;
}

/**
 * Split a reply envelope into prose and spec. An object carrying NEITHER
 * envelope key is a bare spec — the model ignored the envelope, or the caller
 * is `generateEnemySpec`'s single-turn stub.
 * @returns {{ reply: string, spec: object|null }}
 */
export function unwrapReply(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { reply: "", spec: null };
  const enveloped = "reply" in obj || "spec" in obj;
  if (!enveloped) return { reply: "", spec: obj };
  const spec = obj.spec && typeof obj.spec === "object" && !Array.isArray(obj.spec) ? obj.spec : null;
  return { reply: typeof obj.reply === "string" ? obj.reply : "", spec };
}

/**
 * ONE conversation turn — the single entry point for generating AND revising.
 *
 * @param {{ chatJSON: (messages, opts?) => Promise<object> }} client  Player2Client (or stub)
 * @param {{ history?: Array<{role:string, text:string}>, spec?: object|null, message: string }} turn
 * @param {object} [opts]  { seconds } dry-run length override (tests)
 * @returns {Promise<
 *   { kind:"edit",   reply, spec, normalized, report, repaired:boolean } |
 *   { kind:"answer", reply } |
 *   { kind:"failed", reply, errors:string[] } |
 *   { kind:"error",  errors:string[] }>}
 */
export async function chatEnemySpec(client, turn, opts = {}) {
  const messages = composeChat(turn);

  let raw;
  try {
    raw = await client.chatJSON(messages);
  } catch (e) {
    return { kind: "error", errors: [`generation failed: ${e.message}`] };
  }

  const { reply, spec } = unwrapReply(raw);
  // No spec means the model answered rather than edited. Nothing lands, and
  // that is a successful turn — diagnosis is half of what the chat is for.
  if (!spec) return { kind: "answer", reply };

  const first = accept(spec, opts);
  if (first.ok) return { kind: "edit", reply, ...first, repaired: false };

  // ---- one repair round: feed the errors back, ask for the corrected spec --
  const repairMessages = [
    ...messages,
    { role: "assistant", content: JSON.stringify(raw) },
    {
      role: "user",
      content:
        `That spec failed validation. Fix ONLY these problems and return the complete corrected JSON object (same envelope, no prose outside it):\n` +
        first.errors.map((e) => `- ${e}`).join("\n"),
    },
  ];
  let repairRaw;
  try {
    repairRaw = await client.chatJSON(repairMessages);
  } catch (e) {
    return { kind: "failed", reply, errors: [...first.errors, `repair failed: ${e.message}`] };
  }
  const repairedSpec = unwrapReply(repairRaw).spec;
  const second = repairedSpec ? accept(repairedSpec, opts) : { ok: false, errors: [...first.errors, "the repair reply carried no spec"] };
  if (second.ok) return { kind: "edit", reply: unwrapReply(repairRaw).reply || reply, ...second, repaired: true };
  return { kind: "failed", reply, errors: second.errors };
}

/**
 * Generate an EnemySpec from a user description — one turn, no history, no
 * prior spec. A thin wrapper on `chatEnemySpec` so there is exactly one
 * prompt, one envelope rule and one acceptance gate.
 * @param {{ chatJSON: (messages, opts?) => Promise<object> }} client  Player2Client (or stub)
 * @param {string} userPrompt  e.g. "a floating mine-layer with a shielded core"
 * @param {object} [opts]  { seconds } dry-run length override (tests)
 * @returns {Promise<{ok:true, spec, normalized, report} | {ok:false, errors:string[]}>}
 */
export async function generateEnemySpec(client, userPrompt, opts = {}) {
  const turn = await chatEnemySpec(client, { message: `Design this enemy: ${userPrompt}` }, opts);
  if (turn.kind === "edit") return { ok: true, spec: turn.spec, normalized: turn.normalized, report: turn.report };
  if (turn.kind === "answer") return { ok: false, errors: ["the model replied without a spec"] };
  return { ok: false, errors: turn.errors };
}

// Run one spec through validate → normalize → dry-run. Shared by generation
// and (exported) the Designer's save gate so both use identical acceptance.
export function accept(spec, opts = {}) {
  const v = validateSpec(spec);
  if (!v.ok) {
    return { ok: false, errors: v.errors.map((e) => `${e.path}: ${e.msg}`) };
  }
  const normalized = normalizeSpec(spec);
  const report = dryRunSpec(normalized, opts);
  if (!report.ok) {
    return { ok: false, errors: report.errors.map((e) => `dry-run: ${e}`) };
  }
  return { ok: true, spec, normalized, report };
}
