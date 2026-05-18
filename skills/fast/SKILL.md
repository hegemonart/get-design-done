---
name: gdd-fast
description: "Trivial inline design task. No subagents, no planning documents, no pipeline stages. Just do the thing described."
argument-hint: "<task description>"
tools: Read, Write, Edit, Bash, Grep, Glob
disable-model-invocation: true
---

# /gdd:fast

The leanest possible execution path. No subagents, no STATE.md update, no DESIGN-*.md artifacts. Read the target file, apply the change inline, commit.

## When to use

- "Change this button's border-radius to 8px"
- "Add a hover state to the nav links"
- "Fix the mobile breakpoint on the hero"
- Single-file or single-component obvious changes

## When NOT to use

- Multi-component changes.
- Anything touching tokens used across the app.
- Anything requiring a design decision (taste, tradeoff, scope).
- Use `/gdd:quick` or the full pipeline instead.

## Steps

1. Parse the task description from the argument.
2. Use Grep/Glob to locate the target file(s). If ambiguous (>2 candidates), stop and ask the user which to edit — do not guess.
3. Read the target file(s).
4. Apply the described change with Edit.
5. Run a relevant sanity check (grep for the old value to confirm it's gone; grep for the new value to confirm it's in).
6. Commit with message: `fix: <task description>` (one commit, one change).
7. Print: "Done: <summary of what changed>."

## Do Not

- No subagent spawns.
- No `.design/` writes.
- No STATE.md mutation.
- No pipeline stage invocation.
- Do not proceed if the change turns out to be non-trivial — bail out and recommend `/gdd:quick` or the full pipeline.

## FAST COMPLETE
