---
name: gdd-continue
description: "Alias for {{command_prefix}}resume — restore session context from the most recent checkpoint."
argument-hint: "[<checkpoint-N>]"
tools: Read, Write, Bash, Glob
disable-model-invocation: true
---

@reference/retrieval-contract.md

# {{command_prefix}}continue

Alias for `{{command_prefix}}resume`. Delegates immediately to the resume skill with the same argument.

This alias exists for discoverability - users familiar with `git continue` or similar conventions find `{{command_prefix}}continue` more intuitive than `{{command_prefix}}resume` after a pause.

## Steps

1. Forward the argument (if any) to the `{{command_prefix}}resume` skill logic.
2. Execute all `{{command_prefix}}resume` steps exactly as documented in `skills/resume/SKILL.md`.

The two commands are functionally identical. `{{command_prefix}}resume` is the canonical form; `{{command_prefix}}continue` is the convenience alias.

## CONTINUE COMPLETE
