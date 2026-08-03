# Doc schema

The contract between the documentation files and the viewer. Every `.md` under
`design/`, `tech/`, `sprints/`, and `archive/` carries this frontmatter.

```yaml
---
type: tech                    # design | tech | sprint | state
category: artificial-intelligence
status: building              # idea | designed | building | built | superseded
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
| `state` | what does this system do right now | beside its doc, as `<system>.state.md` |

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

**`status`** — build state. How much of this exists.

**`resolution`** — design state. How well settled the thinking is. Deliberately
separate from `status`, because the interesting cases are the mismatches:

| | not built | built |
|---|---|---|
| `vague` | fine — future work | ⚠ built without being designed |
| `sharp` | ⚠ designed, never tested | done |

**`sprint`** — set when a doc is in scope for the current sprint; cleared at
review. Drives the viewer's "this month" filter.

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
- **State pages are `<system>.state.md`**, sitting beside the doc they track —
  `agent-navigation.md` and `agent-navigation.state.md`. They sort adjacently, the
  pairing is obvious in any listing, and there are no subfolders to remember.
- **Sprints are `YYYY-MM.md`.** Sorts chronologically, no other rule needed.
- **Repo-root files stay uppercase** — `README.md`, `CLAUDE.md`, `ROADMAP.md`,
  `DOC-SCHEMA.md`. These are metafiles that tools and humans expect to shout.

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

## Rules

- Status lives in `ROADMAP.md` and in `state` docs. Design and tech docs never
  carry DONE annotations or progress notes.
- Prose links float to the current version of a doc. Sprint log entries pin to
  what was current when they were written.
- A doc with no `category` is a lint error, not a permanent state.
