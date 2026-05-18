---
name: apply-reflections-procedure
type: heuristic
version: 1.0.0
phase: 28.5
tags: [apply-reflections, proposal, frontmatter, reference, budget, question, global-skill]
last_updated: 2026-05-18
---

# Apply-Reflections — Per-Type Procedure

Extracted from `skills/apply-reflections/SKILL.md` per Phase 28.5 D-10 (extract-then-link,
never delete content). The orchestrator loop in `apply-reflections` (resolve file → parse →
review loop → summary) stays in the SKILL. The per-proposal-type apply logic below moves
here because it is content-class methodology, not workflow.

## Apply Logic by Proposal Type

After the user chooses `a` (apply) or `e` (edit-then-apply) in the review loop, branch by
the proposal's bracketed type tag.

### [FRONTMATTER]

1. Extract agent name from Change field (e.g., `agents/design-verifier.md`)
2. Read the agent file
3. Find the frontmatter line matching the field being changed
4. Use Edit tool to update the specific line
5. Append `**Applied**: <date>` to the proposal in reflections file

### [REFERENCE]

1. Extract target file path from Change field (e.g., `reference/heuristics.md`)
2. If file exists: append the drafted text using Edit tool
3. If file doesn't exist: create it with a minimal header + the drafted text using Write tool
4. Append `**Applied**: <date>` to proposal in reflections file

### [BUDGET]

1. Read `.design/budget.json`
2. Locate the key path from the Change field (e.g., `design-verifier.per_run_cap_usd`)
3. Update the value
4. Write updated JSON back to `.design/budget.json`
5. Append `**Applied**: <date>` to proposal in reflections file

### [QUESTION]

1. Read `agents/design-discussant.md`
2. Find the question text specified in the Change field
3. If pruning: remove the question lines using Edit tool
4. If rewording: replace the question text using Edit tool
5. Append `**Applied**: <date>` to proposal in reflections file

### [GLOBAL-SKILL]

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
