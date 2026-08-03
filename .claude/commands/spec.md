---
description: Write a tech spec from a design doc — read the code first, then review it before handing back
argument-hint: <design-doc slug, e.g. behavior-lab>
---

Write `tech/$1.md` from `design/$1.md`.

Bo does not review architecture. He reviews four things, listed in step 5. Every
other judgement in this document is yours, and the point of the procedure is that
it is made **from the repo**, not from memory.

## 1. Read before writing anything

Do all of this before the first line of the spec exists:

- `design/$1.md` — the whole thing. If it is `resolution: vague`, stop and say so.
- `CLAUDE.md` — Architecture map and Conventions. These are binding.
- `DOC-SCHEMA.md` — the seven-part table and House style.
- The code. Grep for every system the design touches, and read the modules you
  find. Do not guess a filename. Do not describe a function you have not opened.
- The tests that cover those modules — they define what "must not regress" means.

Then write, in chat, a short list: **what already exists that this can use.**
If that list is empty, you have not looked hard enough — this repo is large.

## 2. Write the seven parts

Structure per `DOC-SCHEMA.md`, in order: `needs` in frontmatter, then `Reuses`,
`Where the code goes`, `The seam`, `Slices`, `Must not regress`, `Approximations`.
Headings are matched exactly by the linter.

| Rule | |
|---|---|
| Cite real paths | Every module named in `Reuses` and `Where the code goes` is a backticked path that exists. `test/docs.test.mjs` fails the suite otherwise |
| No pseudocode | No file-by-file structure, no function signatures. Name the seam and the reuse; let the builder pick the shape |
| Slices land alone | Each one is shippable on its own, and says whether it changes runtime behaviour |
| Tables, not prose | House style applies to specs too |
| No design | If you find yourself deciding what the player should experience, you have hit a gap in the design doc. Stop and ask Bo — that is the one question worth interrupting him for |

## 3. Run the bar

    node test/run.mjs

Green means the citations are real and the seven parts are present. It does not
mean the architecture is right — step 4 is what checks that.

## 4. Review it with fresh eyes

Spawn a subagent (`Explore` or `general-purpose`) with **no context from this
conversation**. Give it: the repo, `CLAUDE.md`, `DOC-SCHEMA.md`, and the new spec.
Ask it exactly this:

> Read this tech spec against the actual codebase. Report only two things:
> (1) anything it claims about the code that is not true, and (2) anything a
> builder following it would get wrong — a seam that fights the existing
> structure, a reuse that was missed, a slice that cannot land alone.
> Do not suggest improvements. Do not comment on style.

Fix what it finds. If it disagrees with a deliberate choice, say so in
`Approximations` rather than silently overruling it.

## 5. Hand back only what Bo can answer

Do not summarise the architecture. Ask these four, and nothing else:

1. Does slice 1 put something in front of you? (If not, the slicing is wrong.)
2. Is the approximation in `Approximations` acceptable to you as a player?
3. Are we rebuilding something the game already has? — with your `Reuses` list.
4. What would you be upset to see break?

Answer 4 goes into `Must not regress`. Then stop; do not start building.
