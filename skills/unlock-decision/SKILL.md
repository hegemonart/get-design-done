---
name: hone-unlock-decision
description: "Reopens a LOCKED design decision - the only escape hatch from the hard lock. Requires an explicit --approver and writes an audit entry, then moves the decision locked → reviewing (via scripts/lib/collab/review-queue.cjs). Previews the audit record before writing; never unlocks silently. Use when a locked decision genuinely must change (a later constraint invalidated it) and a reviewer has signed off."
argument-hint: "<decision-id> --approver <who> [--reason <text>] [--dry-run]"
user-invocable: true
tools: Read, Write, Bash, Grep, Glob
---

# /hone:unlock-decision

A `locked` decision is hard - it cannot be amended. This skill is the **only** way back, and it is
deliberately heavyweight: it requires a named approver and records an audit entry, so reopening a
locked decision is always traceable. Contract: `../../reference/multi-author-model.md`.

## Invocation

| Command | Behavior |
|---|---|
| `/hone:unlock-decision <id> --approver <who>` | Unlock `<id>` (locked → reviewing), recording the approver. |
| `/hone:unlock-decision <id> --approver <who> --reason <text>` | Same, with a reason in the audit entry. |
| `/hone:unlock-decision <id> --dry-run` | Preview the audit record + the resulting state; change nothing. |

## Steps

1. **Validate args.** `<decision-id>` required; `--approver` required (a non-empty name). Missing
   `--approver` → print the usage + exit without changing anything.
2. **Load the entry** from `.design/reviews/<decision-id>/state.json`. Not found → report it. Not in
   `locked` state → print `unlock-decision: <id> is not locked (state: <state>); nothing to unlock.`
3. **Preview.** Show the audit entry that will be appended (`{ action: unlock, from: locked, to:
   reviewing, approver, reason }`) and the resulting state. If ``--dry-run``, stop here.
4. **Apply** via the pure helper:

   ```bash
   node -e '
     const fs = require("fs");
     const rq = require("./scripts/lib/collab/review-queue.cjs");
     const p = process.argv[1], approver = process.argv[2], reason = process.argv[3] || "";
     const entry = JSON.parse(fs.readFileSync(p, "utf8"));
     const next = rq.unlock(entry, { approver, reason });
     fs.writeFileSync(p, JSON.stringify(next, null, 2) + "\n");
     console.log(JSON.stringify(next.audit[next.audit.length - 1]));
   ' ".design/reviews/<id>/state.json" "<who>" "<reason>"
   ```

5. **Report** the new state + the recorded approver. The decision is now `reviewing` and amendable
   again; it must be re-reviewed + re-locked to become durable.

## Output

End with:

```
## UNLOCK-DECISION COMPLETE
```
