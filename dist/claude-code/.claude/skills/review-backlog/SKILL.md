---
name: gdd-review-backlog
description: "Review parked backlog items and promote any to active cycle todo."
tools: Read, Write, AskUserQuestion
disable-model-invocation: true
---

# /gdd:review-backlog

**Role:** Walk through parked backlog items and for each ask: promote to this cycle, keep parked, or archive.

## Step 1 — Read backlog

Read `.design/backlog/BACKLOG.md`. Parse each `## <title>` block with its metadata and body. If no parked items, print "No parked backlog items." and stop.

## Step 2 — Loop

For each item with `**Status**: parked`:

Use `AskUserQuestion`:
```
Title: <title>
Added: <date>
<truncated body>

Promote to this cycle | Keep parked | Archive
```

## Step 3 — Apply decision

- **Promote**: append `- [ ] [YYYY-MM-DD] <title>` under `## P1 — High` in `.design/TODO.md` (create file from the TODO.md skeleton if missing). Update backlog item status to `**Status**: promoted` + `**Promoted**: YYYY-MM-DD`.
- **Keep parked**: leave unchanged.
- **Archive**: update status to `**Status**: archived` + `**Archived**: YYYY-MM-DD`.

Rewrite `.design/backlog/BACKLOG.md` after each decision so crashes preserve progress.

## Output

```
━━━ Backlog review ━━━
Reviewed: 5
Promoted: 2   Kept parked: 2   Archived: 1
━━━━━━━━━━━━━━━━━━━━━━
```

## REVIEW-BACKLOG COMPLETE
