// ---------------------------------------------------------------------------
// LLM GENERATION — turn a natural-language prompt into a validated EnemySpec.
//
// The model composes the closed vocabulary; the acceptance pipeline decides
// whether the result exists at all:
//
//   prompt → client.chatJSON → validateSpec → normalizeSpec → dryRunSpec
//        ok → { ok:true, spec (sparse), normalized, report }
//      fail → ONE repair round (errors fed back verbatim) → accept or
//             { ok:false, errors } — never a throw, never an unvalidated spec.
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
// signals), one utility brain (shows scored actions + sense.*).
const FEWSHOT_IDS = ["tpl_shooter", "tpl_boss_moth", "tpl_duelist"];

export function buildSystemPrompt() {
  const examples = FEWSHOT_IDS.map(
    (id) => `Example (${TEMPLATE_BY_ID[id].role}):\n${JSON.stringify(TEMPLATE_BY_ID[id])}`
  ).join("\n\n");
  return [
    "You design enemies for a 2D run-and-gun side-scroller (pixels, gravity 2000, the player is a soldier ~30x46 px on platforms).",
    "Output EXACTLY ONE JSON object — a valid EnemySpec. No prose, no markdown fences.",
    "",
    vocabularyDoc(),
    "",
    "Design principles: a coherent combat role, readable telegraphs before attacks, real weaknesses, destructible parts where they create decisions. Compose the vocabulary freely but never invent keys, motions, actions, patterns, or functions that are not listed above.",
    "",
    examples,
  ].join("\n");
}

/**
 * Generate an EnemySpec from a user description.
 * @param {{ chatJSON: (messages, opts?) => Promise<object> }} client  Player2Client (or stub)
 * @param {string} userPrompt  e.g. "a floating mine-layer with a shielded core"
 * @param {object} [opts]  { seconds } dry-run length override (tests)
 * @returns {Promise<{ok:true, spec, normalized, report} | {ok:false, errors:string[]}>}
 */
export async function generateEnemySpec(client, userPrompt, opts = {}) {
  const messages = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: `Design this enemy: ${userPrompt}` },
  ];

  let spec;
  try {
    spec = await client.chatJSON(messages);
  } catch (e) {
    return { ok: false, errors: [`generation failed: ${e.message}`] };
  }

  let result = accept(spec, opts);
  if (result.ok) return result;

  // ---- one repair round: feed the errors back, ask for the corrected spec --
  const repairMessages = [
    ...messages,
    { role: "assistant", content: JSON.stringify(spec) },
    {
      role: "user",
      content:
        `That spec failed validation. Fix ONLY these problems and return the complete corrected JSON object (no prose):\n` +
        result.errors.map((e) => `- ${e}`).join("\n"),
    },
  ];
  let repaired;
  try {
    repaired = await client.chatJSON(repairMessages);
  } catch (e) {
    return { ok: false, errors: [...result.errors, `repair failed: ${e.message}`] };
  }
  const second = accept(repaired, opts);
  if (second.ok) return second;
  return { ok: false, errors: second.errors };
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
