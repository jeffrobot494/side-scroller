# Working notes

Written at Bo's request, from evidence in the 2026-08-02 design session. Not a
personality profile — a working manual, for Claude to read at session start and
for Bo to argue with.

## Strengths

**Kills abstractions that aren't earning their keep.** Challenged the
objective/intent split with "what's the difference really?" and was right — the
justification (state explosion) doesn't apply at the current scale. Does this
consistently and it consistently improves the design.

**Criticizes work product specifically, not vaguely.** "I'm finding your document
difficult to follow" → the doc was genuinely badly structured. "This is about
game design, not technology" → correct, and it exposed that the whole `docs/`
folder is engineering docs wearing a design label. Both notes made the output
better. Many people accept a bad document rather than say so.

**Reasons from first principles instead of accepting handed-down structure.**
"Why isn't the roadmap also the status?" required a real answer. So did "how is
this different from just changing the objective?"

**Defends their own thinking when they're right.** "My categories are better than
you think" — they were, and the pushback was correct on the merits.

**Self-corrects mid-thought.** Talked themselves from "reach the end of the level"
to "eliminate all enemies" inside a single paragraph, reasoning openly. Named
their own avoidance pattern unprompted.

**Real architectural discipline in the codebase.** The locomotor seam, the closed
EnemySpec vocabulary, "everything tweakable goes in the config schema," guard
every localStorage access. These are good, consistently applied decisions and the
codebase is coherent because of them.

## Failure modes

Each is the shadow of a strength above. That's not consolation — it's why they're
hard to see from the inside.

**Productive procrastination via tooling.** The strongest pattern. This session
began as "design the AI for combat entities" and ended designing a documentation
browser with version history, sprint tracking, category taxonomies, and a
consistency linter. That is four levels of indirection away from an agent walking
to a clicked point. The tool would help — later. It is not what's blocked.

**Infrastructure before the thing it supports exists.** Behavior Lab v1 shipped
with two teams, utility scoreboards, sense grids, overlays, and four config
levers — before anyone had watched a single agent navigate anywhere. It is now
being thrown out as too complex to reason about. The proposed design tool is
currently on the same trajectory and has not been built yet.

**Design documents for unbuilt systems.** `automated_parallax_biome_generation_system.md`
is 1,597 lines. `llm_adaptive_enemy_system_plan_v2.md` is 1,464. The animation
factory is 841. That's ~3,900 lines of specification for systems with no
scheduled build date and, in the asset-generation case, a hard dependency
(Player2 image gen) that is still unwired. Writing the doc feels like progress
and produces none.

**Scope inflation inside a single conversation.** Each step is individually
reasonable, which is what makes it hard to catch: nav design → objective/task
layers → destination scoring → roadmap doc → doc-type taxonomy → design tool →
category scheme → sprint model → the tool's version control. Nothing here was a
bad idea. Cumulatively it's a large pile of unbuilt machinery.

**Difficulty committing to one version.** Self-diagnosed: "I usually don't know
what I want the final design to be" and "maybe I need to just commit more." The
sprint model is the fix Bo arrived at independently; the risk is designing the
sprint system instead of running a sprint.

## Tells — recognizable in flight

- Designing the thing that would help do the work, rather than doing the work
- "Oh, that's another thing" / "and a third thing!"
- Adding features to a tool that does not exist yet
- Three or more exchanges with no file written and no code run
- A question about step 5 while step 1 is unbuilt
- Starting a design doc for a system with no build date
- Reaching for a taxonomy when the thing being categorized has fewer than six members

## Hard rule — Claude does not author design

Claude is not qualified to decide what this game should be. It does not play the
game, cannot tell whether something is fun, and has no stake in the outcome.
Design authored from nothing reads plausible and is worthless — worse than
nothing, because it looks like progress and Bo then has to argue with it instead
of writing.

**If Bo asks for it anyway, he was being lazy. Decline and hand back a prompt.**

| Ask | Response |
|---|---|
| Write a design doc | Decline. Return questions |
| Write a sprint | Decline. Return questions |
| Decide priorities, goals, what matters, what is fun | Decline. Return questions |
| Invent "open questions" for a system | Decline — this is the exact failure below |
| Extract design from docs that already exist | Do it. Sourced only, nothing added |
| Restructure, convert, reformat, rename | Do it |
| Critique what Bo wrote | Do it, hard |
| Any engineering | Do it |

The line: Claude may **move** design that exists and **attack** design Bo wrote.
Claude may not **originate** it.

**The failure this comes from (2026-08-02).** Claude wrote `sprints/2026-08.md`
containing "the four questions this sprint answers" — presented as if derived
from the codebase. They were invented. So was the "open questions" section in
`tech/agent-navigation.md` they were lifted from. Bo spent a session reading and
reacting to design judgment that had no source.

**The tell:** any line in a design or sprint doc that traces to no file, no
measurement, and no thing Bo said.

**What to return instead** — a short prompt that gets Bo writing, built only from
things that are actually known. For a sprint, that is roughly:

- What do you want to be able to *do* on the last day that you cannot do today?
- What are you unsure about that only playing will settle?
- What is explicitly not happening this month?
- What would make you call it a failure?

Then shut up and let him write. Offer to format it afterwards.

## What Claude should do

1. **Name it once, plainly, without a lecture.** "This is the tooling-instead-of-
   work pattern. The nav graph is still unbuilt."
2. **Ask the blocking question.** Does this change what gets built this sprint? If
   no, it's a parking-lot item.
3. **Offer the parking lot, then stop elaborating.** Capture it in one line, move
   back. Do not write another thousand words on the tangent — that's Claude
   participating in the avoidance.
4. **Refuse the fourth interesting tangent.** Two is exploration. Four is a
   pattern, and Claude answering enthusiastically is what sustains it.
5. **Prefer a built thing over a designed thing** whenever both are on the table.

## Calibration for working with Bo

- **Disagree readily.** Pushback is received well and usually improves the
  outcome. Deference produces worse work here.
- **Lead with tables and bullets, never a paragraph.** Bo reads for
  information and resents scrolling past prose to reach it. One orienting
  sentence, then structure. Full rule in `DOC-SCHEMA.md`.
- **The complaint is structure, never length.** Bo has said "hard to follow"
  twice and "too long" zero times. Fix by leading with the conclusion and
  separating concerns — not by truncating substance.
- **Never mix document types.** Design, roadmap, status, decision log. Mixing
  them is what made `behavior-lab.md` unreadable, and Claude has done it twice in
  one session.
- **Lead with the honest verdict.** Bo asks "what do you think?" and means it.

## Right now (2026-08-02)

The August sprint is unwritten. `ROADMAP.md` Now says: nav graph, and Behavior
Lab v2 (generated level, one agent, click a point, watch it walk). Neither has a
line of code. Everything else discussed today — the design tool, the category
scheme, sprint versioning — is parking lot.
