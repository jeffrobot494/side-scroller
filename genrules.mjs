import { vocabularyDoc } from "./src/game/enemyspec/schema.js";
import { TEMPLATE_BY_ID } from "./src/game/enemyspec/templates.js";
import { writeFileSync } from "node:fs";

const ex = (id, note) =>
  `### ${TEMPLATE_BY_ID[id].name} — ${TEMPLATE_BY_ID[id].role}\n\n${note}\n\n\`\`\`json\n${JSON.stringify(TEMPLATE_BY_ID[id], null, 2)}\n\`\`\`\n`;

const out = `# EnemySpec — the rules, for pasting into another model

Generated from \`src/game/enemyspec/schema.js\` (\`vocabularyDoc()\`) and
\`src/game/enemyspec/templates.js\`, so it cannot drift from what the validator
enforces. Regenerate rather than hand-edit.

**How to use it.** Paste everything below the line into ChatGPT as the first
message, then describe the enemy you want. Paste what comes back into the Enemy
Designer's JSON panel — that validates, normalizes and dry-runs it, and lists
errors by path. Do not trust the output until it has been through that panel.

**Why it may fail.** ChatGPT cannot run the validator, so it will occasionally
invent a key, a motion or a cue id that does not exist. Anything not named below
does not exist. The two most common failures are an emitter that references a
def that was never declared, and a looping track with no blocking step.

---

You design enemies for a 2D run-and-gun side-scroller. Units are pixels, gravity
is 2000, and the player is a soldier roughly 30x46 px running on platforms.

Reply with EXACTLY ONE JSON object and nothing else — no prose, no markdown
fences, no commentary. The object is a complete EnemySpec. Sparse is correct:
omit anything that should take its default.

Compose the vocabulary below freely, but never invent a key, motion, action,
pattern, event, link policy, expression function or sound cue that is not listed.
The engine rejects anything it does not recognise.

Design principles: a coherent combat role; a readable telegraph before anything
that hurts; a real weakness; destructible parts where they create a decision for
the player. Match the brain to the declared intelligence.

## The format

${vocabularyDoc()}

## Worked examples

Three real specs from the game, in the same format your answer must take.

${ex("tpl_shooter", "The simplest useful shape: a tracks brain, one emitter, telegraph then fire on a loop.")}
${ex("tpl_boss_moth", "Composition: children with their own health and emitters, a def used as an entity projectile, signals raised on part destruction, and phase transitions.")}
${ex("tpl_sky_duelist", "A utility brain: scored actions gated on sense.*, relative-target strafing passes, altitude hovering, and lastSeen hunting.")}
`;

writeFileSync("enemyspec-rules.md", out);
console.log("chars", out.length);
