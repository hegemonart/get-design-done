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

#### [FRONTMATTER]
1. Extract agent name from Change field (e.g., `agents/design-verifier.md`)
2. Read the agent file
3. Find the frontmatter line matching the field being changed
4. Use Edit tool to update the specific line
5. Append `**Applied**: <date>` to the proposal in reflections file

#### [REFERENCE]
1. Extract target file path from Change field (e.g., `reference/heuristics.md`)
2. If file exists: append the drafted text using Edit tool
3. If file doesn't exist: create it with a minimal header + the drafted text using Write tool
4. Append `**Applied**: <date>` to proposal in reflections file

#### [BUDGET]
1. Read `.design/budget.json`
2. Locate the key path from the Change field (e.g., `design-verifier.per_run_cap_usd`)
3. Update the value
4. Write updated JSON back to `.design/budget.json`
5. Append `**Applied**: <date>` to proposal in reflections file

#### [QUESTION]
1. Read `agents/design-discussant.md`
2. Find the question text specified in the Change field
3. If pruning: remove the question lines using Edit tool
4. If rewording: replace the question text using Edit tool
5. Append `**Applied**: <date>` to proposal in reflections file

#### [GLOBAL-SKILL]
1. Extract target filename from Change field (e.g., `design-color-conventions.md`)
2. Ensure `~/.claude/gdd/global-skills/` directory exists (create with `mkdir -p` if not)
3. If target file exists: append new content using Edit tool (add a `---` separator first)
4. If target file doesn't exist: create with header + content using Write tool:
   ```markdown
   # <Topic> Conventions (Global)
   *Promoted from project: <project-name>, cycle: <cycle-slug>*

   <content>
   ```
5. Print: "Global skill written to ~/.claude/gdd/global-skills/<name>.md — auto-loads in all future gdd sessions"
6. Append `**Applied**: <date>` to proposal in reflections file

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
