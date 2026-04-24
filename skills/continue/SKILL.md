---
name: gdd-continue
description: "Alias for /gdd:resume — restore session context from the most recent checkpoint."
argument-hint: "[<checkpoint-N>]"
tools: Read, Write, Bash, Glob
---

@reference/retrieval-contract.md

# /gdd:continue

Alias for `/gdd:resume`. Delegates immediately to the resume skill with the same argument.

This alias exists for discoverability — users familiar with `git continue` or similar conventions find `/gdd:continue` more intuitive than `/gdd:resume` after a pause.

## Steps

1. Forward the argument (if any) to the `/gdd:resume` skill logic.
2. Execute all `/gdd:resume` steps exactly as documented in `skills/resume/SKILL.md`.

The two commands are functionally identical. `/gdd:resume` is the canonical form; `/gdd:continue` is the convenience alias.

## CONTINUE COMPLETE
