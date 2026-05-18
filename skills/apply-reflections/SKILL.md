---
name: gdd-apply-reflections
description: "Review and selectively apply proposals from .design/reflections/<cycle-slug>.md. Diffs each proposal, prompts user to accept/skip/edit, then writes changes."
argument-hint: "[--cycle <slug>] [--filter <FRONTMATTER|REFERENCE|BUDGET|QUESTION|GLOBAL-SKILL>] [--dry-run]"
tools: Read, Write, Edit, Bash, Glob
---

# /gdd:apply-reflections

Interactive proposal review loop. Reads `.design/reflections/<cycle-slug>.md`, walks each numbered proposal, and applies accepted ones to the appropriate target file. Nothing is applied without explicit user confirmation.

## Steps

### 1. Resolve reflections file

- If `--cycle <slug>` given: load `.design/reflections/<slug>.md`
- Else: glob `.design/reflections/*.md`, sort by modified time descending, load the most recent
- If no file found: error "No reflections found. Run `/gdd:reflect` first."
- Print: "Reviewing reflections: <filename>"

### 2. Parse proposals

Scan file for lines matching `### Proposal N — [TYPE] ...`. Extract each proposal block (Why / Change / Risk).

If `--filter <TYPE>` given: skip proposals whose type tag doesn't match.

Print: "Found N proposals (N after filter)."

### 3. Review loop

For each proposal (in order):

Print the full proposal block:
```
─────────────────────────────────────────
Proposal N/TOTAL — [TYPE] Title
Risk: low|medium

Why: ...
Change: ...
─────────────────────────────────────────
(a) apply   (s) skip   (e) edit   (q) quit
```

If `--dry-run`: print `[dry-run — would prompt here]` and continue to next proposal without prompting.

Based on user choice:
- **a** — apply (see Apply Logic below)
- **s** — mark proposal as `**Reviewed: skipped**` in the reflections file; continue
- **e** — show the Change text, ask user to provide edited version, then apply the edited version
- **q** — stop processing; print "Stopped at proposal N. Resume with `/gdd:apply-reflections --cycle <slug>`."

### 4. Apply Logic by Proposal Type

After the user chooses `a` (apply) or `e` (edit-then-apply), branch on the proposal's bracketed type tag and follow the per-type apply procedure in `./reference/apply-reflections-procedure.md` — one numbered procedure each for `[FRONTMATTER]`, `[REFERENCE]`, `[BUDGET]`, `[QUESTION]`, `[GLOBAL-SKILL]`. All branches end with `**Applied**: <date>` appended to the proposal block in the reflections file.

### 5. Summary

After all proposals processed (or `q`):
```
─────────────────────────────────────────
Apply-reflections complete
  Applied:  N
  Skipped:  N
  Remaining: N (run again to continue)
─────────────────────────────────────────
```

## Do Not

- Do not apply any proposal without the user explicitly choosing `a` or `e`.
- Do not modify source code files (`.ts`, `.tsx`, `.css`, `.js`) — only agent files, reference files, budget.json, discussant questions, and global skills.
- Do not re-run the reflector — this skill only applies existing proposals.
