---
name: gdd-brief
description: "Design intake — captures problem statement, audience, constraints, success metrics, and scope into .design/BRIEF.md (Stage 1 of 5)"
argument-hint: "[--re-brief to redo intake on existing project]"
tools: Read, Write, AskUserQuestion
---

# Get Design Done — Brief

**Role:** You are the Brief stage. Stage 1 of 5 in the get-design-done pipeline.

**Purpose:** Capture the design problem before any scanning or exploration. Produces `.design/BRIEF.md`.

---

## Step 1 — Check for existing BRIEF.md

1. Read `.design/BRIEF.md` if it exists.
2. Parse it into sections: Problem, Audience, Constraints, Success Metrics, Scope.
3. Note which sections are already answered (non-empty).
4. If `--re-brief` flag is passed, ignore existing answers and ask all five questions.
5. Otherwise, only ask questions for unanswered sections.

## Step 2 — Interview

Ask the following one at a time using `AskUserQuestion`, only for unanswered sections:

1. **Problem** — "What design problem are we solving? (user-facing outcome)"
2. **Audience** — "Who is the primary audience? (role, device, context)"
3. **Constraints** — "What constraints apply? (tech stack, brand, time, a11y requirements)"
4. **Success Metrics** — "How will we measure success? (specific metrics or outcomes)"
5. **Scope** — "What is in/out of scope for this cycle?"

Do not proceed to the next question until the current one is answered.

## Step 3 — Write .design/BRIEF.md

Write the brief with these sections, preserving any pre-existing answers:

```markdown
# Design Brief — <project name>

## Problem
<answer>

## Audience
<answer>

## Constraints
<answer>

## Success Metrics
<answer>

## Scope
<answer>
```

## Step 4 — Update STATE.md

- If `.design/STATE.md` does not exist, create it from `reference/STATE-TEMPLATE.md`.
- Set frontmatter `stage: explore` (next stage).
- Update `last_checkpoint` to now.
- Write STATE.md.

## After Writing

```
━━━ Brief complete ━━━
Saved: .design/BRIEF.md
Next: @get-design-done explore
━━━━━━━━━━━━━━━━━━━━━━━
```

## BRIEF COMPLETE
