# Doc schema

The contract between the documentation files and the viewer. Every `.md` under
`design/`, `tech/`, `idea/`, `sprints/`, and `archive/` carries this frontmatter.

```yaml
---
type: tech                    # design | tech | idea | sprint
category: artificial-intelligence
status: building              # unbuilt | designed | building | built | superseded | reference
resolution: sharp             # vague | sharp
sprint: 2026-08               # optional — which sprint it is in scope for
related: [behavior-lab, locomotion]   # optional — slugs, not paths
---
```

## Fields

**`type`** — which kind of document this is. The rule that keeps the folder
readable: a document is exactly one of these, never two at once.

| Value | Answers | Lives in |
|---|---|---|
| `design` | what should the player experience | `design/` |
| `tech` | how is it built | `tech/` |
| `sprint` | what are we committing to this month | `sprints/` |
| `idea` | what we might do later — not agreed, not scheduled | `idea/` |

The test for design vs tech: **would this still be true if the engine were
rewritten in another language?** "Enemies commit to an attack so the player can
read and punish it" survives. "`tickUtility` records its pass on
`root.brainState.lastDecision`" does not.

**`category`** — one of six, in map order:

`development-tools` · `gameplay-systems` · `artificial-intelligence` ·
`scenes` · `content-generation` · `game-data`

Plus `vision` for the GDD, which is the root doc and belongs to none of them.
Primary category only. A doc spanning several (sound spans four) picks the one it
is most about and names the others in prose.

The test for `idea` vs the rest: **can an implementer treat this as
instructions?** `design` and `tech`, yes. `idea`, no — it holds options, not
decisions, and may contradict itself. `idea` docs carry no `status`, because
nothing in them is being built.

**`status`** — build state. How much of this exists. `unbuilt` · `designed` ·
`building` · `built` · `superseded` · `reference`.

**`resolution`** — design state. How well settled the thinking is. Deliberately
separate from `status`, because the interesting cases are the mismatches:

| | not built | built |
|---|---|---|
| `vague` | fine — future work | ⚠ built without being designed |
| `sharp` | ⚠ designed, never tested | done |

**`sprint`** — set when a doc is in scope for the current sprint; cleared at
review. Drives the viewer's "this month" filter.

**`needs`** — *tech docs only.* Slugs of systems that must exist before this one
can be built. Design docs never carry it: what the player experiences does not
depend on build order.

**`related`** — slugs of other docs. Prose links are the real relationship graph;
this is only for links that don't occur naturally in the text.

## File naming

- **lowercase, hyphen-separated, `.md`** — `agent-navigation.md`, never
  `AGENT-NAVIGATION.md` or `agent_navigation.md`. Filenames are lowercased into
  ids anyway, and mixed case invites case-sensitivity bugs across machines.
- **Name it after the system, not the document.** `sound.md`, not
  `sound-system-design-plan.md`. The folder and the `type` field already say what
  kind of document it is, so words like *system*, *plan*, *design*, and *doc* in
  a filename are pure noise.
- **Sprints are `YYYY-MM.md`.** Sorts chronologically, no other rule needed.
- **Mockups are `<doc>.mockup.html`**, sitting beside the doc they illustrate.
  The viewer renders one at the top of its doc page. A mockup with no matching
  doc is a lint error.
- **Idea docs are titled `Idea: <subject>`** so they read as unagreed wherever
  they appear — in the map, in a link, in a search result. The filename stays
  plain (`parallax-biomes.md`).
- **Repo-root files stay uppercase** — `README.md`, `CLAUDE.md`, `ROADMAP.md`,
  `DOC-SCHEMA.md`. These are metafiles that tools and humans expect to shout.

## What a tech spec must answer

Seven things. A design doc entering a sprint means its tech spec is about to
become instructions, so the linter requires all seven from that moment — six as
named sections, one as frontmatter.

`needs:` lives in the frontmatter. The other six are named sections, and the table
below is **the order they appear in the document**:

| # | Section | Answers |
|---|---|---|
| 1 | `## Slices` | Ordered, independently landable, each saying whether it changes runtime behaviour |
| 2 | `## Reuses` | What already exists that this builds on — the biggest source of accidental rewrites |
| 3 | `## Where the code goes` | Module paths, and the repo conventions they must follow |
| 4 | `## The seam` | What this owns, and what it must not touch |
| 5 | `## Must not regress` | Which existing tests are the guard |
| 6 | `## Approximations` | Where the implementation is deliberately not exact, and what catches the failure |

**`## Slices` is the first section in the document**, before any explanation of
how the system works. A builder opening a spec wants "what am I doing, in what
order" before "here is how the subsystem behaves" — house style applied to specs.
Background sections go after the six, not before them.

Heading text is matched exactly, so the linter can check it.

**When the seven are enforced.** An incomplete spec blocks the thing it specifies
and nothing else — writing a design doc must never redden the bar, or design work
gets punished for existing. The trigger is the tech spec's `status`:

| Spec `status` | Missing a part | |
|---|---|---|
| `unbuilt` | Reported in Gaps, **minor** | A plan is allowed to be incomplete |
| `building` / `built` | **Blocking** | Somebody is building from it right now |
| any, but a `(new)` module it declared exists | **Blocking** | Implementation plainly started; status was just never flipped |

One case where another system's spec blocks yours: a spec that is `building` and
whose `needs:` names a system with a missing or incomplete spec. That is the
dependency the field exists to express. **A `built` prerequisite is exempt** —
its code is running, so there is nothing left to be blocked on, and its spec is a
record rather than a plan anyone is about to follow. Without that exemption every
spec written after this rule would be held hostage by the age of the specs it
depends on.

**What a tech spec should not contain:** file-by-file structure, function
signatures, pseudocode. They read as authority and go stale the moment the
implementation deviates. Name the seam and the reuse; let the builder pick the
shape.

## House style

Structure first. The reader should never scroll past prose to reach the
information.

| Rule | |
|---|---|
| Opening | One sentence saying what the page is. Then straight into structure. |
| Default form | Tables and bullets. Prose only where a point genuinely needs a paragraph. |
| Banned | Preamble, throat-clearing, "the shape of the problem", restating the title |
| Test | If a section could be a table, it should be a table |
| Paragraphs | At most two or three per page, and never at the top |

This applies to every doc type, and to summaries written in chat.

## A design doc is timeless and authoritative

It states what is true of the game. It never explains itself, never justifies a
choice by how the code got there, and never comments on its own provenance.

| Banned in `design/` | Belongs in |
|---|---|
| Why an implementation works the way it does | `tech/` |
| What a system used to do, or the bug that shaped it | `tech/`, or the commit |
| Notes on how the doc was written or how settled it is | `status` and `resolution`, which exist for exactly this |
| Hedges — "this describes what is, not what was decided" | Nowhere. The doc is the decision |

The test: **strike every sentence that would stop being true if the code were
thrown away and rebuilt.** What survives is the design.

Undecided things are still stated, not apologised for — name the capability that
does not exist, in the same voice as the ones that do.

## Rules

- Status lives in `ROADMAP.md`. Design and tech docs never
  carry DONE annotations or progress notes.
- Prose links float to the current version of a doc. Sprint log entries pin to
  what was current when they were written.
- A doc with no `category` is a lint error, not a permanent state.
- The viewer's **Gaps** tab splits findings in two: *blocking* — anything that
  stops something in the current sprint being built correctly — and *minor*,
  which is tidiness. The nav badge counts blockers only.
