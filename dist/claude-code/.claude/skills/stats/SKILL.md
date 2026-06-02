---
name: gdd-stats
description: "Cycle stats — decisions made, tasks completed, commits, timeline, git metrics."
tools: Read, Bash
disable-model-invocation: true
---

# /gdd:stats

**Role:** Print cycle metrics.

## Step 1 — Read state

Read `.design/STATE.md`. Extract:
- `cycle:` and `started_at` (or per-cycle start date if present in CYCLES.md)
- D-XX count under `<decisions>`

## Step 2 — Collect git metrics

Let `<since>` = cycle start date (fallback to STATE.md `started_at`).

```bash
git log --oneline --since="<since>" | wc -l          # commits
git diff --stat HEAD~N HEAD                          # files changed since cycle start
```

If git unavailable, print `git: unavailable` and skip git metrics.

## Step 3 — Count todos

Read `.design/TODO.md` if present:
- pending: count `- [ ]`
- in-progress: count `- [-]`
- done: count `- [x]`
- group pending by P0/P1/P2/P3 section

## Step 4 — Output

```
━━━ Cycle stats ━━━
Cycle: cycle-1   Started: 2026-04-18
Decisions made: 12 (D-01..D-12)
Tasks completed: 8 / 10
Git commits:     23
Files changed:   47
Open todos:      3 (P0: 1, P1: 2, P2: 0, P3: 0)
Agents spawned:  — (no task log)
━━━━━━━━━━━━━━━━━━
```

## STATS COMPLETE
