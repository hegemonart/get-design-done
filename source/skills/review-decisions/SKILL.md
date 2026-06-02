---
name: gdd-review-decisions
description: "Surfaces the async decision-review queue for team mode. Reads .design/reviews/<decision-id>/ entries and reports each decision's state in the proposed → reviewing → approved → locked machine (via scripts/lib/collab/review-queue.cjs), so a team can see what's awaiting review, what's approved, and what's locked. --pending shows only decisions still needing action. Read-only - it reports the queue; it never advances a decision (that's a reviewer's explicit call). Use to run an async design-decision review without a meeting."
argument-hint: "[<decision-id>] [--pending]"
user-invocable: true
tools: Read, Bash, Grep, Glob
---

# {{command_prefix}}review-decisions

Closes the async-review gap for team mode: design decisions move through an explicit review queue
instead of being decided in a single operator's head. This skill reports where each decision is.
**Read-only** - it surfaces state; advancing a decision is a reviewer's explicit action. Contract:
`../../reference/multi-author-model.md`.

## Invocation

| Command | Behavior |
|---|---|
| `{{command_prefix}}review-decisions` | Every decision in the queue, grouped by state. |
| `{{command_prefix}}review-decisions <decision-id>` | One decision's state + audit trail. |
| `{{command_prefix}}review-decisions --pending` | Only decisions not yet `locked` (awaiting action). |

## Steps

1. **Find the queue.** List `.design/reviews/*/` (each dir is a `<decision-id>`). No reviews dir →
   print `review-decisions: no review queue yet (team mode not in use).` and exit.
2. **Read each entry** (`.design/reviews/<id>/state.json` → `{ id, state, audit }`). Validate the
   state against `scripts/lib/collab/review-queue.cjs` `STATES`.
3. **Render** grouped by state: `proposed` / `reviewing` / `approved` / `locked`, each listing the
   decision id + a one-line summary. For `--pending`, use `review-queue.pending(entries)` to show only
   non-locked ones. For a single `<decision-id>`, also print its audit trail (transitions + approvers).
4. **Do not advance.** Reporting only - moving a decision forward (or `{{command_prefix}}unlock-decision`) is the
   reviewer's explicit call.

## Output

End with:

```
## REVIEW-DECISIONS COMPLETE
```
