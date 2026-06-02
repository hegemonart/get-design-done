---
name: gdd-add-backlog
description: "Park a design idea for a future cycle. Writes to .design/backlog/BACKLOG.md."
argument-hint: "[text]"
tools: Read, Write, AskUserQuestion
disable-model-invocation: true
---

# /gdd:add-backlog

**Role:** Long-term parking lot for design ideas. Backing store: `.design/backlog/BACKLOG.md`.

## Step 1 — Get text

If `$ARGUMENTS` is empty, ask the user: "What should be added to the backlog?"

## Step 2 — Append

Create `.design/backlog/` directory and `BACKLOG.md` with `# Design Backlog` header if missing.

Derive `<title>` = first 60 characters of the text (strip newlines). Append:

```markdown
## <title>
**Added**: YYYY-MM-DD
**Status**: parked

<full text>

---
```

## Output

```
━━━ Backlog entry parked ━━━
Title: <title>
Status: parked
Promote later via: /gdd:review-backlog
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Constraints

- Do not modify files outside `.design/backlog/`.
- Do not set status to anything other than `parked` here — `/gdd:review-backlog` owns status transitions.

## ADD-BACKLOG COMPLETE
