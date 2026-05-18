---
name: gdd-spike
description: "Timeboxed feasibility experiment that creates .design/spikes/<slug>/ with HYPOTHESIS.md, success/failure criteria, scratch/ subdirectory, and a default 60-minute timebox. Use when answering 'can this work?' before betting design or implementation effort on a risky approach."
argument-hint: "[hypothesis] [--timebox <minutes>]"
tools: Read, Write, Bash, AskUserQuestion
---

# Get Design Done — Spike

**Role:** Timeboxed feasibility experiment. Answers "can this work?" — e.g., "can we use view transitions for this flow?", "does this animation perform on mobile?". Unlike `/gdd:sketch` (visual variants), `/gdd:spike` tests a hypothesis.

## Flag parsing

Parse `$ARGUMENTS`:
- `[hypothesis]` → summary phrase, derives the slug
- `--timebox <minutes>` → default 60

## Step 1 — Intake

AskUserQuestion:
1. "What's the hypothesis? (e.g., 'view transitions can replace our current route animations')"
2. "What's the timebox? (default 60 minutes)"
3. "What would prove it works? (success criteria)"
4. "What would prove it doesn't? (failure criteria)"

## Step 2 — Create spike directory

- Derive `<slug>` from the hypothesis (kebab-case, short).
- `mkdir -p .design/spikes/<slug>/scratch/` via Bash.

## Step 3 — Write HYPOTHESIS.md

Write `.design/spikes/<slug>/HYPOTHESIS.md`:
```markdown
# Spike: <slug>

**Hypothesis**: <statement>
**Timebox**: <N> minutes
**Started**: YYYY-MM-DD HH:MM

## Success criteria
- <criterion>

## Failure criteria
- <criterion>

## Scratch area
Experimental code in `./scratch/` — not committed to src/.
```

## Step 4 — Announce

```
━━━ Spike started ━━━
Slug: <slug>
Timebox: <N> minutes
Work in: .design/spikes/<slug>/scratch/
When done: /gdd:spike-wrap-up <slug>
━━━━━━━━━━━━━━━━━━━━━
```

## Do Not

- Do not write experimental code to `src/` — use `.design/spikes/<slug>/scratch/`.
- Do not exceed the timebox without explicit user approval; wrap up and reassess first.

## SPIKE COMPLETE
