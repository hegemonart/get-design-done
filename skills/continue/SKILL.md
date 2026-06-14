---
name: hone-continue
description: "Alias for /hone:resume - restore session context from the most recent checkpoint."
argument-hint: "[<checkpoint-N>]"
tools: Read, Write, Bash, Glob
disable-model-invocation: true
---

@reference/retrieval-contract.md

# /hone:continue

Alias for `/hone:resume`. Delegates immediately to the resume skill with the same argument.

This alias exists for discoverability - users familiar with `git continue` or similar conventions find `/hone:continue` more intuitive than `/hone:resume` after a pause.

## Steps

1. Forward the argument (if any) to the `/hone:resume` skill logic.
2. Execute all `/hone:resume` steps exactly as documented in `skills/resume/SKILL.md`.

The two commands are functionally identical. `/hone:resume` is the canonical form; `/hone:continue` is the convenience alias.

## CONTINUE COMPLETE
