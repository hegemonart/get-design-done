---
name: gdd-brief
description: "Design intake — captures problem statement, audience, constraints, success metrics, and scope into .design/BRIEF.md (Stage 1 of 5)"
argument-hint: "[--re-brief to redo intake on existing project]"
tools: Read, Write, AskUserQuestion, mcp__gdd_state__frontmatter_update, mcp__gdd_state__set_status, mcp__gdd_state__update_progress, mcp__gdd_state__get
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

## Step 4 — Bootstrap STATE.md (if missing)

<!-- BOOTSTRAP EXCEPTION: STATE.md does not exist yet — MCP tools require it to exist. Direct Write is intentional. All subsequent mutations use MCP. -->

If `.design/STATE.md` does not exist, copy the template block from `reference/STATE-TEMPLATE.md` (between `==== BEGIN TEMPLATE ====` and `==== END TEMPLATE ====`) to `.design/STATE.md` via `Write`. Leave the `<ISO 8601 timestamp>` placeholders in-place — Step 5 stamps them via MCP. If STATE.md already exists, skip to Step 5.

## Step 5 — Commit STATE.md initialization

With `.design/STATE.md` seeded from the template:

1. Stamp timestamps + cycle id: call `mcp__gdd_state__frontmatter_update` with `patch: { started_at: <ISO>, last_checkpoint: <ISO>, cycle: <cycle-id> }`.
2. Mark brief progress: call `mcp__gdd_state__update_progress` with `task_progress: "5/5"`, `status: "brief_complete"`.
3. Set handoff status: call `mcp__gdd_state__set_status` with `status: "brief_complete"`.

Do NOT call `mcp__gdd_state__transition_stage` from brief — explore calls it on entry, keeping the transition atomic with the stage that owns the new state.

## After Writing

```
━━━ Brief complete ━━━
Saved: .design/BRIEF.md
Next: @get-design-done explore
━━━━━━━━━━━━━━━━━━━━━━━
```

## BRIEF COMPLETE
